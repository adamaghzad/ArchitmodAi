import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  GizmoHelper,
  GizmoViewcube,
  Grid,
  useProgress,
} from '@react-three/drei';
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three';
import {
  Expand,
  Grid2X2,
  Minus,
  Plus,
  RotateCcw,
  ScanEye,
  Square,
} from 'lucide-react';
import Architecture from './editor3d/Architecture';
import CameraRig from './editor3d/CameraRig';
import FurnitureObject from './editor3d/FurnitureObject';
import Daylight from './editor3d/Daylight';
import RenderTelemetry from './editor3d/RenderTelemetry';
import RenderAudit from './editor3d/RenderAudit';
import type { RenderProgress } from './editor3d/PathTracedRender';
import { HIGH_QUALITY_SAMPLES } from './editor3d/renderSettings';
import { MaterialProvider } from './editor3d/MaterialProvider';
import { EMPTY_REGISTRY, parseRegistry } from './editor3d/assetRegistry';
import { cameraPose } from './sceneGeometry';
import type { EditorTool, ViewSettings, CameraCommand } from './editorTypes';
import type { Product, Scene, Operation, RenderAuditEntry } from './types';

interface Props {
  scene: Scene;
  products: Product[];
  onSelect: (id: string) => void;
  selected: string | null;
  onEdit?: (operation: Operation) => Promise<void>;
  tool?: EditorTool;
  busy?: boolean;
  settings?: ViewSettings;
  onAudit?: (items: RenderAuditEntry[]) => void;
}
const DEFAULT_SETTINGS: ViewSettings = {
  grid: true,
  cutaway: true,
  ceilings: false,
  furniture: true,
};
const ignoreEdit = async () => {};
const PathTracedRender = lazy(() => import('./editor3d/PathTracedRender'));
const InteractiveEffects = lazy(() => import('./editor3d/InteractiveEffects'));

function RasterRender() {
  useFrame(({ gl, scene, camera }) => gl.render(scene, camera), 1);
  return null;
}

export default function SceneView({
  scene,
  products,
  onSelect,
  selected,
  onEdit = ignoreEdit,
  tool = 'select',
  busy = false,
  settings = DEFAULT_SETTINGS,
  onAudit,
}: Props) {
  const [registry, setRegistry] = useState(EMPTY_REGISTRY);
  const [registryReady, setRegistryReady] = useState(false);
  const [command, setCommand] = useState<CameraCommand>({
    action: 'isometric',
    serial: 0,
  });
  const [dragging, setDragging] = useState(false);
  const [qualityScene, setQualityScene] = useState<Scene | null>(null);
  const [qualitySettings, setQualitySettings] = useState<ViewSettings | null>(
    null,
  );
  const [progress, setProgress] = useState<RenderProgress>({
    phase: 'preparing',
    progress: 0,
    samples: 0,
  });
  const [contactDetail, setContactDetail] = useState(true);
  const [benchmark, setBenchmark] = useState(0);
  const [performanceReport, setPerformanceReport] = useState('');
  const loading = useProgress();
  const highQuality = qualityScene === scene && qualitySettings === settings;
  const select = (id: string) => {
    setQualityScene(null);
    onSelect(id);
  };
  useEffect(() => {
    let active = true;
    fetch('/assets/registry.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) setRegistry(parseRegistry(data));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRegistryReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const initial = useMemo(
    () => cameraPose({ width_m: scene.width_m, depth_m: scene.depth_m }, 1.3),
    [scene.width_m, scene.depth_m],
  );
  const cameraOptions = useMemo(
    () => ({ position: initial.position, fov: 38, near: 0.05, far: 250 }),
    [initial],
  );
  const size = Math.max(scene.width_m, scene.depth_m);
  const camera = (action: CameraCommand['action']) =>
    setCommand((previous) => ({ action, serial: previous.serial + 1 }));
  return (
    <div className={`three-view tool-${tool}`}>
      <div
        className="three-canvas"
        role="img"
        aria-label="Interactive 3D scene"
      >
        <Canvas
          shadows={{ type: PCFSoftShadowMap }}
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={cameraOptions}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            toneMapping: ACESFilmicToneMapping,
            outputColorSpace: SRGBColorSpace,
          }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = 1.08;
          }}
          fallback={
            <div className="viewport-loading">
              WebGL is unavailable in this browser. The 2D plan and properties
              remain available.
            </div>
          }
        >
          <color attach="background" args={['#142019']} />
          <hemisphereLight args={['#eef3ff', '#b0a18a', 0.45]} />
          <ambientLight intensity={0.08} />
          <directionalLight
            position={[-size * 0.5, size * 1.5, size * 0.3]}
            intensity={2.8}
            color="#fff3d8"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-size}
            shadow-camera-right={size}
            shadow-camera-top={size}
            shadow-camera-bottom={-size}
            shadow-camera-far={size * 5}
            shadow-normalBias={0.012}
            shadow-bias={-0.0001}
            shadow-radius={3}
          />
          <directionalLight
            position={[size * 0.7, size * 0.4, -size]}
            intensity={0.65}
            color="#d8e4ef"
          />
          <Daylight asset={registry.environment} />
          <MaterialProvider assets={registry.materials}>
            <group
              name="architectural-model"
              position={[-scene.width_m / 2, 0, -scene.depth_m / 2]}
            >
              <Architecture
                scene={scene}
                products={products}
                selected={selected}
                onSelect={select}
                settings={settings}
              />
              {settings.furniture &&
                scene.furniture.map((item) => {
                  const product = productMap.get(item.product_id);
                  return product ? (
                    <FurnitureObject
                      key={item.id}
                      item={item}
                      product={product}
                      selected={selected === item.id}
                      registry={registry}
                      tool={tool}
                      busy={busy}
                      onSelect={select}
                      onEdit={onEdit}
                      onDrag={setDragging}
                    />
                  ) : null;
                })}
            </group>
          </MaterialProvider>
          {settings.grid && (
            <Grid
              position={[0, -0.245, 0]}
              args={[50, 50]}
              cellSize={1}
              cellThickness={0.45}
              cellColor="#314136"
              sectionSize={5}
              sectionColor="#4b5e48"
              fadeDistance={60}
              infiniteGrid
            />
          )}
          <CameraRig
            scene={scene}
            command={command}
            enabled={!dragging}
            pan={tool === 'pan'}
          />
          <RenderTelemetry
            benchmark={benchmark}
            onReport={setPerformanceReport}
          />
          <RenderAudit model={scene} onAudit={onAudit} />
          <Suspense fallback={<RasterRender />}>
            {highQuality ? (
              <PathTracedRender onProgress={setProgress} />
            ) : contactDetail ? (
              <InteractiveEffects />
            ) : (
              <RasterRender />
            )}
          </Suspense>
          <GizmoHelper
            alignment="top-right"
            margin={[55, 62]}
            renderPriority={2}
          >
            <GizmoViewcube
              color="#344932"
              hoverColor="#739558"
              textColor="#d8e6c9"
              strokeColor="#79946b"
              opacity={0.95}
            />
          </GizmoHelper>
        </Canvas>
      </div>
      <div className="render-toolbar" aria-label="Rendering controls">
        <button
          className={!highQuality ? 'active' : ''}
          onClick={() => setQualityScene(null)}
        >
          Interactive
        </button>
        <button
          className={highQuality ? 'active' : ''}
          disabled={!registryReady || loading.active || dragging}
          onClick={() => {
            setQualityScene(scene);
            setQualitySettings(settings);
          }}
        >
          High quality
        </button>
        {highQuality ? (
          <button onClick={() => setQualityScene(null)}>Cancel render</button>
        ) : (
          <label>
            <input
              type="checkbox"
              checked={contactDetail}
              onChange={(event) => setContactDetail(event.target.checked)}
            />{' '}
            Contact detail
          </label>
        )}
        {!highQuality && (
          <button
            onClick={() => {
              setPerformanceReport('Measuring rendered frames for 5 seconds…');
              setBenchmark((value) => value + 1);
            }}
          >
            Measure FPS
          </button>
        )}
        <span role="status" data-testid="render-status">
          {loading.active
            ? `Loading assets ${Math.round(loading.progress)}%`
            : highQuality
              ? progress.phase === 'error'
                ? progress.message
                : progress.phase === 'preparing'
                  ? `Preparing geometry ${Math.round(progress.progress * 100)}%`
                  : progress.phase === 'compiling'
                    ? 'Compiling path-tracing shader…'
                    : `${progress.phase === 'complete' ? 'Complete' : 'Rendering'} · ${progress.samples}/${HIGH_QUALITY_SAMPLES} samples`
              : 'Interactive · licensed visual proxies'}
        </span>
        {highQuality && progress.phase !== 'error' && (
          <progress
            aria-label="Render progress"
            max={1}
            value={progress.progress}
          />
        )}
        {!highQuality && performanceReport && (
          <output data-testid="render-performance">{performanceReport}</output>
        )}
      </div>
      <div className="viewport-caption">
        {settings.cutaway ? 'Cutaway' : 'Full-height walls'} ·{' '}
        {tool === 'move'
          ? 'Drag selected furniture to move'
          : tool === 'rotate'
            ? 'Click furniture to rotate'
            : 'Drag to orbit · Right-drag to pan'}{' '}
        · Metric geometry
      </div>
      <div
        className="camera-toolbar"
        role="group"
        aria-label="3D camera controls"
      >
        <button
          aria-label="Isometric view"
          title="Isometric view"
          onClick={() => camera('isometric')}
        >
          <ScanEye size={16} />
          <span>Isometric</span>
        </button>
        <button
          aria-label="Top view"
          title="Top view"
          onClick={() => camera('top')}
        >
          <Grid2X2 size={16} />
          <span>Top</span>
        </button>
        <button
          aria-label="Perspective view"
          title="Perspective view"
          onClick={() => camera('perspective')}
        >
          <Square size={16} />
          <span>Perspective</span>
        </button>
        <span className="tool-divider" />
        <button
          aria-label="Interior eye-level view"
          title="Interior eye-level view"
          onClick={() => camera('interior')}
        >
          <ScanEye size={16} />
          <span>Interior</span>
        </button>
        <button
          aria-label="Zoom out 3D"
          title="Zoom out"
          onClick={() => camera('zoom_out')}
        >
          <Minus size={16} />
        </button>
        <button
          aria-label="Zoom in 3D"
          title="Zoom in"
          onClick={() => camera('zoom_in')}
        >
          <Plus size={16} />
        </button>
        <button
          aria-label="Fit scene to view"
          title="Fit scene"
          onClick={() => camera('fit')}
        >
          <Expand size={16} />
        </button>
        <button
          aria-label="Reset camera"
          title="Reset camera"
          onClick={() => camera('reset')}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="scene-metrics">
        <span>
          {scene.width_m.toFixed(2)} × {scene.depth_m.toFixed(2)} m
        </span>
        <span>{(scene.width_m * scene.depth_m).toFixed(1)} m² gross</span>
        <span>
          {scene.rooms.length} rooms · {scene.furniture.length} objects
        </span>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  Environment,
  GizmoHelper,
  GizmoViewcube,
  Grid,
  Lightformer,
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
import { MaterialProvider } from './editor3d/MaterialProvider';
import { EMPTY_REGISTRY, parseRegistry } from './editor3d/assetRegistry';
import { cameraPose } from './sceneGeometry';
import type { EditorTool, ViewSettings, CameraCommand } from './editorTypes';
import type { Product, Scene, Operation } from './types';

interface Props {
  scene: Scene;
  products: Product[];
  onSelect: (id: string) => void;
  selected: string | null;
  onEdit?: (operation: Operation) => Promise<void>;
  tool?: EditorTool;
  busy?: boolean;
  settings?: ViewSettings;
}
const DEFAULT_SETTINGS: ViewSettings = {
  grid: true,
  cutaway: true,
  ceilings: false,
  furniture: true,
};
const ignoreEdit = async () => {};

export default function SceneView({
  scene,
  products,
  onSelect,
  selected,
  onEdit = ignoreEdit,
  tool = 'select',
  busy = false,
  settings = DEFAULT_SETTINGS,
}: Props) {
  const [registry, setRegistry] = useState(EMPTY_REGISTRY);
  const [command, setCommand] = useState<CameraCommand>({
    action: 'isometric',
    serial: 0,
  });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/assets/registry.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) setRegistry(parseRegistry(data));
      })
      .catch(() => {});
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
          <hemisphereLight args={['#f2f2e5', '#636c52', 1.5]} />
          <ambientLight intensity={0.32} />
          <directionalLight
            position={[-size * 0.5, size * 1.5, size * 0.3]}
            intensity={3.2}
            color="#fff3d8"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-size}
            shadow-camera-right={size}
            shadow-camera-top={size}
            shadow-camera-bottom={-size}
            shadow-camera-far={size * 5}
            shadow-normalBias={0.035}
            shadow-bias={-0.0001}
            shadow-radius={3}
          />
          <directionalLight
            position={[size * 0.7, size * 0.4, -size]}
            intensity={0.65}
            color="#d8e4ef"
          />
          <Environment resolution={128} frames={1}>
            <Lightformer
              form="rect"
              intensity={2}
              position={[0, 6, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[12, 12, 1]}
            />
            <Lightformer
              form="rect"
              intensity={1.3}
              position={[-6, 3, 2]}
              rotation={[0, Math.PI / 2, 0]}
              scale={[8, 6, 1]}
            />
          </Environment>
          <MaterialProvider>
            <group position={[-scene.width_m / 2, 0, -scene.depth_m / 2]}>
              <Architecture
                scene={scene}
                products={products}
                selected={selected}
                onSelect={onSelect}
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
                      onSelect={onSelect}
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
          <GizmoHelper alignment="top-right" margin={[55, 62]}>
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

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DenoiseMaterial, WebGLPathTracer } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js';
import { Matrix4 } from 'three';
import { renderSnapshot } from './renderSnapshot';
import { HIGH_QUALITY_SAMPLES } from './renderSettings';
import { RenderResources } from './RenderResources';

export interface RenderProgress {
  phase: 'preparing' | 'compiling' | 'rendering' | 'complete' | 'error';
  progress: number;
  samples: number;
  message?: string;
}

export default function PathTracedRender({
  onProgress,
  samples = HIGH_QUALITY_SAMPLES,
}: {
  onProgress: (progress: RenderProgress) => void;
  samples?: number;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  const tracer = useRef<WebGLPathTracer | null>(null);
  const ready = useRef(false);
  const lastCamera = useRef(new Matrix4());
  const lastProjection = useRef(new Matrix4());
  const lastReport = useRef(0);
  const resources = useRef<RenderResources | null>(null);
  useEffect(() => {
    let active = true;
    let local: WebGLPathTracer | undefined;
    let worker: GenerateMeshBVHWorker | undefined;
    let denoise: (FullScreenQuad & { material: DenoiseMaterial }) | undefined;
    const ownedResources = new RenderResources(gl);
    resources.current = ownedResources;
    onProgress({ phase: 'preparing', progress: 0, samples: 0 });
    // Yield so preparation and its Cancel button are painted first.
    const start = setTimeout(async () => {
      try {
        if (
          !gl.extensions.has('EXT_color_buffer_float') ||
          !gl.extensions.has('OES_texture_float_linear')
        )
          throw new Error(
            'Floating-point WebGL rendering is unavailable. Use Interactive mode.',
          );
        local = ownedResources.capture(() => new WebGLPathTracer(gl));
        for (const name of [
          'updateMaterials',
          'updateLights',
          'updateEnvironment',
        ] as const) {
          const update = local[name].bind(local);
          local[name] = () => ownedResources.capture(update);
        }
        local.bounces = 5;
        local.transmissiveBounces = 4;
        local.filterGlossyFactor = 0.5;
        local.tiles.set(3, 3);
        local.textureSize.set(512, 512);
        local.renderScale = Math.min(1, 1600 / gl.domElement.width);
        local.minSamples = 1;
        local.renderDelay = 80;
        local.fadeDuration = 0;
        local.dynamicLowRes = false;
        denoise = new FullScreenQuad(
          new DenoiseMaterial({ sigma: 2.5, kSigma: 1, threshold: 0.2 }),
        ) as FullScreenQuad & { material: DenoiseMaterial };
        local.renderToCanvasCallback = (target, renderer, quad) => {
          if (local && local.samples >= 8 && denoise) {
            denoise.material.map = target.texture;
            denoise.render(renderer);
          } else quad.render(renderer);
        };
        worker = new GenerateMeshBVHWorker();
        local.setBVHWorker(worker);
        const snapshot = renderSnapshot(scene);
        await local.setSceneAsync(snapshot, camera, {
          onProgress: (progress) => {
            if (active)
              onProgress({ phase: 'preparing', progress, samples: 0 });
          },
        });
        if (!active) return;
        tracer.current = local;
        ready.current = true;
        lastCamera.current.copy(camera.matrixWorld);
        lastProjection.current.copy(camera.projectionMatrix);
        onProgress({ phase: 'rendering', progress: 0, samples: 0 });
        invalidate();
      } catch (error) {
        if (active)
          onProgress({
            phase: 'error',
            progress: 0,
            samples: 0,
            message:
              error instanceof Error
                ? error.message
                : 'Path tracing failed. Use Interactive mode.',
          });
      }
    }, 50);
    return () => {
      active = false;
      clearTimeout(start);
      ready.current = false;
      tracer.current = null;
      worker?.dispose();
      denoise?.material.dispose();
      denoise?.dispose();
      if (local) disposePathTracer(local);
      ownedResources.dispose();
      resources.current = null;
      gl.setRenderTarget(null);
      invalidate();
    };
  }, [gl, scene, camera, invalidate, onProgress]);

  useFrame(() => {
    const current = tracer.current;
    if (!ready.current || !current) {
      gl.render(scene, camera);
      return;
    }
    if (
      !lastCamera.current.equals(camera.matrixWorld) ||
      !lastProjection.current.equals(camera.projectionMatrix)
    ) {
      current.updateCamera();
      lastCamera.current.copy(camera.matrixWorld);
      lastProjection.current.copy(camera.projectionMatrix);
    }
    // The public API draws the accumulated image even when sampling is paused.
    current.pausePathTracing = current.samples >= samples;
    try {
      resources.current!.capture(() => current.renderSample());
    } catch (error) {
      ready.current = false;
      gl.setRenderTarget(null);
      onProgress({
        phase: 'error',
        progress: 0,
        samples: 0,
        message: String(error),
      });
      return;
    }
    const now = performance.now();
    const done = current.samples >= samples;
    if (now - lastReport.current > 400 || done) {
      lastReport.current = now;
      onProgress({
        phase: done
          ? 'complete'
          : 'isCompiling' in current && current.isCompiling === true
            ? 'compiling'
            : 'rendering',
        progress: Math.min(1, current.samples / samples),
        samples: Math.floor(current.samples),
      });
      gl.domElement.setAttribute(
        'data-render-samples',
        String(Math.floor(current.samples)),
      );
    }
    if (!done) invalidate();
  }, 1);
  return null;
}

// 0.0.24's public dispose omits its low-resolution pass, packed texture targets
// and generated geometry. Keep the version pinned and release those owned
// resources too. Never dispose the snapshot's shared scene materials/textures.
function disposePathTracer(tracer: WebGLPathTracer) {
  const owned = tracer as WebGLPathTracer & {
    _pathTracer: OwnedPass;
    _lowResPathTracer: OwnedPass;
    _generator: { geometry: { dispose: () => void } };
    _colorBackground?: { dispose: () => void };
    _internalBackground?: { dispose: () => void };
  };
  const material = owned._pathTracer.material;
  for (const [key, uniform] of Object.entries(material.uniforms)) {
    if (
      [
        'bvh',
        'attributesArray',
        'materialIndexAttribute',
        'materials',
        'textures',
        'lights',
        'iesProfiles',
        'envMapInfo',
        'stratifiedTexture',
        'stratifiedOffsetTexture',
      ].includes(key)
    ) {
      const value = uniform.value;
      if (value && typeof value === 'object') {
        if (
          'renderTarget' in value &&
          value.renderTarget &&
          typeof value.renderTarget === 'object' &&
          'dispose' in value.renderTarget &&
          typeof value.renderTarget.dispose === 'function'
        ) {
          const target = value.renderTarget as {
            dispose: () => void;
            fsQuad?: { dispose: () => void; material: { dispose: () => void } };
          };
          target.fsQuad?.material.dispose();
          target.fsQuad?.dispose();
          target.dispose();
        } else if ('dispose' in value && typeof value.dispose === 'function')
          value.dispose();
        if (
          key === 'lights' &&
          'tex' in value &&
          value.tex &&
          typeof value.tex === 'object' &&
          'dispose' in value.tex &&
          typeof value.tex.dispose === 'function'
        )
          value.tex.dispose();
      }
    }
  }
  owned._lowResPathTracer.dispose();
  owned._lowResPathTracer.material.dispose();
  owned._lowResPathTracer._blendQuad.material.dispose();
  owned._pathTracer._blendQuad.material.dispose();
  material.dispose();
  owned._generator.geometry.dispose();
  owned._colorBackground?.dispose();
  owned._internalBackground?.dispose();
  tracer.dispose();
}
interface OwnedPass {
  dispose: () => void;
  _blendQuad: { material: { dispose: () => void } };
  material: {
    dispose: () => void;
    uniforms: Record<string, { value: unknown }>;
  };
}

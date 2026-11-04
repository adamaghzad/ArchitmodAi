import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';

export default function RenderTelemetry({
  benchmark,
  onReport,
}: {
  benchmark: number;
  onReport: (report: string) => void;
}) {
  const { gl, invalidate, scene, camera, size } = useThree();
  const run = useRef<{ start: number; last: number; times: number[] } | null>(
    null,
  );
  useEffect(() => {
    const context = gl.getContext();
    const info = context.getExtension('WEBGL_debug_renderer_info');
    gl.domElement.setAttribute(
      'data-gpu',
      info
        ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL))
        : 'WebGL renderer unavailable',
    );
  }, [gl]);
  useEffect(() => {
    if (!benchmark) return;
    run.current = {
      start: performance.now(),
      last: performance.now(),
      times: [],
    };
    invalidate();
  }, [benchmark, invalidate]);
  useFrame(() => {
    const active = run.current;
    if (!active) return;
    const now = performance.now();
    if (now - active.start > 1000) active.times.push(now - active.last);
    active.last = now;
    if (now - active.start < 5000) {
      invalidate();
      return;
    }
    const frames = active.times;
    const fps =
      (frames.length * 1000) / frames.reduce((sum, time) => sum + time, 0);
    const sorted = [...frames].sort((a, b) => a - b);
    const result = {
      fps: Number(fps.toFixed(1)),
      p95FrameMs: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
      width: gl.domElement.width,
      height: gl.domElement.height,
      gpu: gl.domElement.dataset.gpu,
      frames: frames.length,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
    };
    gl.domElement.setAttribute('data-performance', JSON.stringify(result));
    const furniture: unknown[] = [];
    scene.getObjectByName('architectural-model')?.traverse((object) => {
      if (!object.name.startsWith('furniture:')) return;
      const visual =
        object.getObjectByName(`licensed:${object.userData.productId}`) ||
        object.children[0];
      const bounds = new Box3().setFromObject(visual);
      const point = bounds.getCenter(new Vector3());
      point.y = bounds.max.y - 0.015;
      point.project(camera);
      furniture.push({
        id: object.name.slice(10),
        productId: object.userData.productId,
        licensed: visual.name.startsWith('licensed:'),
        dimensions: bounds.getSize(new Vector3()).toArray(),
        floor: bounds.min.y,
        position: object.position.toArray(),
        rotation: object.rotation.y,
        screenPoint: [
          (point.x * 0.5 + 0.5) * size.width,
          (-point.y * 0.5 + 0.5) * size.height,
        ],
      });
    });
    gl.domElement.setAttribute(
      'data-furniture-audit',
      JSON.stringify(furniture),
    );
    onReport(
      `${result.fps} FPS · p95 ${result.p95FrameMs} ms · ${result.width} × ${result.height} · 4 s after warm-up`,
    );
    run.current = null;
  });
  return null;
}

import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, MOUSE, PerspectiveCamera } from 'three';
import { cameraPose } from '../sceneGeometry';
import type { CameraCommand } from '../editorTypes';
import type { Scene } from '../types';

export default function CameraRig({
  scene,
  command,
  enabled,
  pan,
}: {
  scene: Scene;
  command: CameraCommand;
  enabled: boolean;
  pan: boolean;
}) {
  const control = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate, gl } = useThree();
  const width = scene.width_m,
    depth = scene.depth_m;
  const height = Math.max(2.8, ...scene.walls.map((wall) => wall.height));
  const goal = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  useEffect(() => {
    const orbit = control.current;
    if (!orbit) return;
    if (command.action === 'zoom_in' || command.action === 'zoom_out') {
      const vector = camera.position
        .clone()
        .sub(orbit.target)
        .multiplyScalar(command.action === 'zoom_in' ? 0.8 : 1.25);
      if (vector.length() < 2) vector.setLength(2);
      goal.current = {
        position: orbit.target.clone().add(vector),
        target: orbit.target.clone(),
      };
    } else {
      if (camera instanceof PerspectiveCamera) {
        const fov = command.action === 'interior' ? 65 : 38;
        camera.setFocalLength(
          camera.getFilmHeight() / (2 * Math.tan((fov * Math.PI) / 360)),
        );
      }
      const preset =
        command.action === 'fit' || command.action === 'reset'
          ? 'isometric'
          : command.action;
      const pose = cameraPose(
        { width_m: width, depth_m: depth, height_m: height },
        size.width / Math.max(1, size.height),
        preset,
      );
      goal.current = {
        position: new Vector3(...pose.position),
        target: new Vector3(...pose.target),
      };
    }
    invalidate();
  }, [
    command,
    camera,
    width,
    depth,
    height,
    size.width,
    size.height,
    invalidate,
  ]);
  useFrame((_, delta) => {
    const destination = goal.current,
      orbit = control.current;
    if (!destination || !orbit) return;
    const factor = 1 - Math.exp(-Math.min(delta, 0.1) * 10);
    camera.position.lerp(destination.position, factor);
    orbit.target.lerp(destination.target, factor);
    orbit.update();
    if (
      camera.position.distanceTo(destination.position) < 0.005 &&
      orbit.target.distanceTo(destination.target) < 0.005
    ) {
      camera.position.copy(destination.position);
      orbit.target.copy(destination.target);
      orbit.update();
      goal.current = null;
      gl.domElement.setAttribute('data-camera-preset', command.action);
      gl.domElement.setAttribute(
        'data-camera-position',
        JSON.stringify(camera.position.toArray()),
      );
    }
    invalidate();
  });
  return (
    <OrbitControls
      ref={control}
      makeDefault
      enabled={enabled}
      enableDamping
      dampingFactor={0.12}
      minDistance={2}
      maxDistance={150}
      minPolarAngle={0.001}
      maxPolarAngle={Math.PI / 2 - 0.06}
      screenSpacePanning={false}
      mouseButtons={{
        LEFT: pan ? MOUSE.PAN : MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      }}
      target={[0, 0.6, 0]}
      onStart={() => {
        goal.current = null;
      }}
    />
  );
}

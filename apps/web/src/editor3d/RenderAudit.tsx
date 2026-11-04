import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, MeshStandardMaterial } from 'three';
import type { Scene, RenderAuditEntry } from '../types';

export default function RenderAudit({
  model,
  onAudit,
}: {
  model: Scene;
  onAudit?: (items: RenderAuditEntry[]) => void;
}) {
  const { scene, gl } = useThree();
  const last = useRef('');
  useFrame(() => {
    const root = scene.getObjectByName('architectural-model');
    const entries: RenderAuditEntry[] = model.furniture.map((item) => {
      const object = root?.getObjectByName(`furniture:${item.id}`);
      let meshes = 0;
      let assetStatus = 'missing';
      const colors = new Set<string>();
      object?.traverse((child) => {
        if (child.userData.assetStatus)
          assetStatus = child.userData.assetStatus;
        if (
          child instanceof Mesh &&
          child.visible &&
          child.geometry.getAttribute('position')?.count
        ) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          if (
            materials.every(
              (material) => material.transparent && material.opacity === 0,
            )
          )
            return;
          meshes++;
          materials.forEach((material) => {
            if (material instanceof MeshStandardMaterial)
              colors.add('#' + material.color.getHexString());
          });
        }
      });
      return {
        id: item.id,
        productId: item.product_id,
        status: meshes > 0 ? 'rendered' : 'missing',
        assetStatus,
        meshes,
        colors: [...colors].sort(),
      };
    });
    const finishes: {
      roomId: string;
      color: string;
      normalMap: boolean;
      roughnessMap: boolean;
    }[] = [];
    model.rooms.forEach((room) => {
      const floor = root?.getObjectByName(`room:${room.id}`);
      if (
        floor instanceof Mesh &&
        floor.material instanceof MeshStandardMaterial
      )
        finishes.push({
          roomId: room.id,
          color: '#' + floor.material.color.getHexString(),
          normalMap: Boolean(floor.material.normalMap),
          roughnessMap: Boolean(floor.material.roughnessMap),
        });
    });
    gl.domElement.setAttribute('data-material-audit', JSON.stringify(finishes));
    const serialized = JSON.stringify(entries);
    if (serialized === last.current) return;
    last.current = serialized;
    gl.domElement.setAttribute('data-render-audit', serialized);
    entries.forEach((entry) =>
      console.info(
        JSON.stringify({
          event: 'design_pipeline',
          scene_id: model.id,
          stage: 'rendering',
          ...entry,
        }),
      ),
    );
    onAudit?.(entries);
  });
  return null;
}

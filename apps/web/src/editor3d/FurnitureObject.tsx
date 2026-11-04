import { memo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { Plane, Vector3 } from 'three';
import { centre, furniturePolygon } from '../geometry';
import { rotateAtCentre } from '../sceneGeometry';
import FurnitureModel from './FurnitureModel';
import type { AssetRegistry } from './assetRegistry';
import type { EditorTool } from '../editorTypes';
import type { Furniture, Operation, Product } from '../types';

const plane = new Plane(new Vector3(0, 1, 0), -0.02);
interface Props {
  item: Furniture;
  product: Product;
  selected: boolean;
  registry: AssetRegistry;
  tool: EditorTool;
  busy: boolean;
  onSelect: (id: string) => void;
  onEdit: (operation: Operation) => Promise<void>;
  onDrag: (dragging: boolean) => void;
}
export default memo(function FurnitureObject({
  item,
  product,
  selected,
  registry,
  tool,
  busy,
  onSelect,
  onEdit,
  onDrag,
}: Props) {
  const drag = useRef<{ start: Vector3; position: [number, number] } | null>(
    null,
  );
  const [preview, setPreview] = useState<Furniture | null>(null);
  const shown = preview || item;
  const [x, y] = centre(furniturePolygon(shown, product));
  const begin = (event: ThreeEvent<PointerEvent>) => {
    if (busy || tool === 'pan') return;
    event.stopPropagation();
    onSelect(item.id);
    if (tool === 'rotate') {
      const rotated = rotateAtCentre(item, product);
      void onEdit({
        type: 'move_furniture',
        object_id: item.id,
        position: rotated.position,
        rotation_deg: rotated.rotation_deg,
      });
      return;
    }
    if (tool !== 'move') return;
    const point = event.ray.intersectPlane(plane, new Vector3());
    if (!point) return;
    drag.current = { start: point, position: item.position };
    setPreview(item);
    onDrag(true);
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const move = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current;
    if (!active) return;
    event.stopPropagation();
    const point = event.ray.intersectPlane(plane, new Vector3());
    if (!point) return;
    setPreview({
      ...item,
      position: [
        Math.round((active.position[0] + point.x - active.start.x) * 100) / 100,
        Math.round((active.position[1] + point.z - active.start.z) * 100) / 100,
      ],
    });
  };
  const end = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    event.stopPropagation();
    drag.current = null;
    onDrag(false);
    (event.target as Element).releasePointerCapture(event.pointerId);
    if (
      preview &&
      Math.hypot(
        preview.position[0] - item.position[0],
        preview.position[1] - item.position[1],
      ) > 0.005
    )
      void onEdit({
        type: 'move_furniture',
        object_id: item.id,
        position: preview.position,
        rotation_deg: preview.rotation_deg,
      }).finally(() => setPreview(null));
    else setPreview(null);
  };
  return (
    <group
      position={[x, 0.012, y]}
      rotation={[0, (-shown.rotation_deg * Math.PI) / 180, 0]}
      name={`furniture:${item.id}`}
      userData={{
        productId: product.id,
        dimensions: [product.width_m, product.height_m, product.depth_m],
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item.id);
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        drag.current = null;
        onDrag(false);
        setPreview(null);
      }}
    >
      <FurnitureModel product={product} registry={registry} />
      {product.category === 'lighting' && (
        <pointLight
          position={[0, product.height_m * 0.8, 0]}
          intensity={3}
          distance={4}
          decay={2}
          color="#ffe1aa"
        />
      )}
      {selected && (
        <mesh position={[0, product.height_m / 2, 0]}>
          <boxGeometry
            args={[
              product.width_m + 0.035,
              product.height_m + 0.035,
              product.depth_m + 0.035,
            ]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color="#c5e9a6" />
        </mesh>
      )}
    </group>
  );
});

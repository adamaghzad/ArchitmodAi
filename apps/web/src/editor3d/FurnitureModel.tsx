import { memo, useEffect, useMemo, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Box3, Vector2, Vector3, type Group } from 'three';
import { furnitureParts } from './furnitureParts';
import { useMaterials } from './materials';
import { resolveAsset } from './assetRegistry';
import { loadLocalModel, modelInstance } from './modelLoader';
import type { AssetRegistry } from './assetRegistry';
import type { Product } from '../types';

function LocalModel({
  url,
  product,
  fallback,
  minFootprintFill,
}: {
  url: string;
  product: Product;
  fallback: React.ReactNode;
  minFootprintFill?: number;
}) {
  const [model, setModel] = useState<Group | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let active = true;
    loadLocalModel(url).then((result) => {
      if (active) {
        setModel(result);
        invalidate();
      }
    });
    return () => {
      active = false;
    };
  }, [url, invalidate]);
  const instance = useMemo(
    () => (model ? modelInstance(model, product, minFootprintFill) : null),
    [model, product, minFootprintFill],
  );
  return instance ? (
    <group name={`licensed:${product.id}`}>
      <primitive object={instance} dispose={null} />
      {product.id === 'bookcase' && (
        <BookshelfDecor
          top={new Box3().setFromObject(instance).getSize(new Vector3()).y}
          product={product}
        />
      )}
    </group>
  ) : (
    fallback
  );
}

const vaseProfile = [
  [0, 0],
  [0.045, 0],
  [0.075, 0.035],
  [0.085, 0.1],
  [0.06, 0.17],
  [0.035, 0.2],
  [0.035, 0.23],
  [0.028, 0.23],
  [0.028, 0.2],
  [0.05, 0.17],
  [0.075, 0.1],
  [0.065, 0.04],
  [0, 0.015],
].map(([radius, height]) => new Vector2(radius, height));
function BookshelfDecor({ top, product }: { top: number; product: Product }) {
  const library = useMaterials();
  if (
    product.height_m - top < 0.24 ||
    product.width_m < 0.6 ||
    product.depth_m < 0.25
  )
    return null;
  return (
    <group position={[0, top, 0]} name="bookcase-integral-decor">
      <mesh
        position={[-0.15, 0, 0]}
        material={library.get('ceramic', '#a9957b')}
        castShadow
        receiveShadow
      >
        <latheGeometry args={[vaseProfile, 32]} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh
          key={i}
          position={[0.14, 0.018 + i * 0.036, 0]}
          material={library.get('fabric', i === 0 ? '#6f7968' : '#c5b391')}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.19, 0.035, 0.22]} />
        </mesh>
      ))}
    </group>
  );
}

const ProceduralFurniture = memo(function ProceduralFurniture({
  product,
}: {
  product: Product;
}) {
  const library = useMaterials();
  const parts = useMemo(() => furnitureParts(product), [product]);
  return (
    <group name={`procedural:${product.category}`}>
      {parts.map((part, index) => {
        const material = library.get(part.finish, part.color);
        const radius = Math.min(
          0.035,
          ...part.size.map((value) => value * 0.16),
        );
        if (part.shape === 'round')
          return (
            <RoundedBox
              key={index}
              args={part.size}
              radius={radius}
              smoothness={2}
              position={part.position}
              material={material}
              castShadow
              receiveShadow
            />
          );
        return (
          <mesh
            key={index}
            position={part.position}
            scale={
              part.shape === 'sphere' || part.shape === 'cylinder'
                ? part.size
                : [1, 1, 1]
            }
            material={material}
            castShadow
            receiveShadow
          >
            {part.shape === 'cylinder' ? (
              <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
            ) : part.shape === 'sphere' ? (
              <sphereGeometry args={[0.5, 20, 12]} />
            ) : (
              <boxGeometry args={part.size} />
            )}
          </mesh>
        );
      })}
    </group>
  );
});

export default memo(function FurnitureModel({
  product,
  registry,
}: {
  product: Product;
  registry: AssetRegistry;
}) {
  const asset = resolveAsset(product, registry);
  const fallback = <ProceduralFurniture product={product} />;
  return asset ? (
    <LocalModel
      key={asset.url}
      url={asset.url}
      product={product}
      fallback={fallback}
      minFootprintFill={asset.minFootprintFill}
    />
  ) : (
    fallback
  );
});

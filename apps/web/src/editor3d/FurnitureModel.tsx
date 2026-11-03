import { memo, useEffect, useMemo, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Group } from 'three';
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
}: {
  url: string;
  product: Product;
  fallback: React.ReactNode;
}) {
  const [model, setModel] = useState<Group | null>(null);
  useEffect(() => {
    let active = true;
    loadLocalModel(url).then((result) => {
      if (active) setModel(result);
    });
    return () => {
      active = false;
    };
  }, [url]);
  const instance = useMemo(
    () => (model ? modelInstance(model, product) : null),
    [model, product],
  );
  return instance ? <primitive object={instance} dispose={null} /> : fallback;
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
    />
  ) : (
    fallback
  );
});

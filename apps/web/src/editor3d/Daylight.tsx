import { useEffect, useState } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EquirectangularReflectionMapping, type DataTexture } from 'three';
import type { EnvironmentAsset } from './assetRegistry';

export default function Daylight({ asset }: { asset?: EnvironmentAsset }) {
  const [environment, setEnvironment] = useState<DataTexture | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!asset) return;
    let active = true;
    let owned: DataTexture | undefined;
    new HDRLoader()
      .loadAsync(asset.url)
      .then((map) => {
        if (!active) {
          map.dispose();
          return;
        }
        owned = map;
        map.mapping = EquirectangularReflectionMapping;
        setEnvironment(map);
        invalidate();
      })
      .catch(() => {});
    return () => {
      active = false;
      owned?.dispose();
    };
  }, [asset, invalidate]);
  return environment ? (
    <Environment map={environment} environmentIntensity={0.8} />
  ) : (
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
  );
}

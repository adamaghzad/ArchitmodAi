import { Box3, Group, Mesh, Vector3, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { uniformFit } from './assetRegistry';
import type { Product } from '../types';

const models = new Map<string, Promise<Group | null>>();
export function loadLocalModel(url: string): Promise<Group | null> {
  if (!models.has(url))
    models.set(
      url,
      new GLTFLoader()
        .loadAsync(url)
        .then((gltf) => mergeStaticModel(gltf.scene))
        .catch(() => null),
    );
  return models.get(url)!;
}

// Static furnishing components share materials. Bake component transforms once
// and merge compatible geometry per material (e.g. hundreds of book covers).
// Selection remains on the same canonical FurnitureObject parent.
export function mergeStaticModel(source: Group): Group {
  source.updateMatrixWorld(true);
  const buckets = new Map<Mesh['material'], Mesh[]>();
  let staticOnly = true;
  source.traverse((object) => {
    if (object instanceof Mesh) {
      if (
        'isSkinnedMesh' in object ||
        object.morphTargetInfluences ||
        Array.isArray(object.material)
      )
        staticOnly = false;
      const bucket = buckets.get(object.material) || [];
      bucket.push(object);
      buckets.set(object.material, bucket);
    }
  });
  if (!staticOnly) return source;
  const result = new Group();
  const originals = new Set<BufferGeometry>();
  for (const [material, meshes] of buckets) {
    const geometries = meshes.map((mesh) => {
      originals.add(mesh.geometry);
      return mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    });
    const signatures = geometries.map(
      (geometry) =>
        Object.keys(geometry.attributes).sort().join(',') +
        Boolean(geometry.index),
    );
    const compatible = signatures.every(
      (signature) => signature === signatures[0],
    );
    const merged = compatible ? mergeGeometries(geometries) : null;
    if (merged) {
      result.add(new Mesh(merged, material));
      geometries.forEach((geometry) => geometry.dispose());
    } else
      geometries.forEach((geometry) =>
        result.add(new Mesh(geometry, material)),
      );
  }
  originals.forEach((geometry) => geometry.dispose());
  return result;
}
export function modelInstance(
  model: Group,
  product: Product,
  minFootprintFill = 0,
): Group | null {
  try {
    const copy = model.clone(true),
      bounds = new Box3().setFromObject(copy),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    const scale = uniformFit([size.x, size.y, size.z], product);
    if (
      Math.min(
        (size.x * scale) / product.width_m,
        (size.z * scale) / product.depth_m,
      ) < minFootprintFill
    )
      return null;
    copy.position.sub(new Vector3(center.x, bounds.min.y, center.z));
    copy.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const wrapper = new Group();
    wrapper.add(copy);
    wrapper.scale.setScalar(scale);
    return wrapper;
  } catch {
    return null;
  }
}

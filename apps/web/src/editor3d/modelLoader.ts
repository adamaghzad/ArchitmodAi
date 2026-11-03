import { Box3, Group, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { uniformFit } from './assetRegistry';
import type { Product } from '../types';

const models = new Map<string, Promise<Group | null>>();
export function loadLocalModel(url: string): Promise<Group | null> {
  if (!models.has(url))
    models.set(
      url,
      new GLTFLoader()
        .loadAsync(url)
        .then((gltf) => gltf.scene)
        .catch(() => null),
    );
  return models.get(url)!;
}
export function modelInstance(model: Group, product: Product): Group | null {
  try {
    const copy = model.clone(true),
      bounds = new Box3().setFromObject(copy),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    const scale = uniformFit([size.x, size.y, size.z], product);
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

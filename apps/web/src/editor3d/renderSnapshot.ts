import { Scene, Mesh, MeshStandardMaterial, type Object3D } from 'three';

// A render snapshot shares existing geometry/materials. No scene JSON mutation,
// no second furniture layout, no grid/gizmo/selection geometry in the BVH.
export function renderSnapshot(scene: Scene) {
  const snapshot = new Scene();
  const model = scene.getObjectByName('architectural-model');
  if (!model) throw new Error('Architectural scene is not ready');
  const copy = model.clone(true);
  const helpers: Object3D[] = [];
  copy.traverse((object) => {
    if (!object.visible || object.userData.renderHelper) helpers.push(object);
    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      if (
        !materials.every((material) => material instanceof MeshStandardMaterial)
      )
        helpers.push(object);
    }
  });
  helpers.forEach((object) => object.removeFromParent());
  snapshot.add(copy);
  for (const child of scene.children) {
    if ('isLight' in child) snapshot.add(child.clone());
  }
  snapshot.environment = scene.environment;
  snapshot.environmentIntensity = scene.environmentIntensity;
  snapshot.environmentRotation.copy(scene.environmentRotation);
  snapshot.background = scene.background;
  snapshot.updateMatrixWorld(true);
  return snapshot;
}

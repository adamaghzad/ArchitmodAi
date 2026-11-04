import { Mesh, type Material, type WebGLRenderer } from 'three';

// The pinned tracer creates packed array targets whose Texture has no back-link
// to its RenderTarget in Three r181. Observe only its synchronous render calls,
// restoring renderer methods before yielding to R3F or a BVH worker.
export class RenderResources {
  private targets = new Set<
    NonNullable<Parameters<WebGLRenderer['setRenderTarget']>[0]>
  >();
  private materials = new Set<Material>();
  constructor(private renderer: WebGLRenderer) {}

  capture<T>(action: () => T): T {
    const renderer = this.renderer;
    const setTarget = renderer.setRenderTarget;
    const render = renderer.render;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget = (target, face, level) => {
      if (target && target !== previousTarget) this.targets.add(target);
      setTarget.call(renderer, target, face, level);
    };
    renderer.render = (object, camera) => {
      // FullScreenQuad passes a Mesh directly. Architectural scenes retain their
      // own shared materials, which must survive cancellation.
      if (object instanceof Mesh) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => this.materials.add(material));
      }
      render.call(renderer, object, camera);
    };
    try {
      return action();
    } finally {
      renderer.setRenderTarget = setTarget;
      renderer.render = render;
    }
  }

  dispose() {
    this.targets.forEach((target) => target.dispose());
    this.materials.forEach((material) => material.dispose());
    this.targets.clear();
    this.materials.clear();
  }
}

# Optional furniture models

Place authorized GLB/glTF files here and register them in `../registry.json`.

```json
{
  "models": [
    {
      "id": "my-sofa",
      "productId": "sample_sofa",
      "url": "/assets/models/my-sofa.glb",
      "source": "Locally authored model",
      "license": "Owned by the project author"
    }
  ]
}
```

Use `category` instead of `productId` for a generic category asset. Models use metres, Y-up, and face toward positive Z. The renderer caches source models, clones instances and uniformly fits their bounds inside the stored product dimensions without stretching proportions. Missing/invalid assets fall back to procedural furniture. Catalogue dimensions continue to determine collision footprints and budget references.

Only same-origin model paths under `/assets/models/` are loaded from this registry. Include all external buffers/textures for `.gltf` files alongside the model. Binary `.glb` is simpler to manage. Record the actual source and license of each included asset; the application does not download models.

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

# Curated licensed furniture

This folder includes eleven individual CC0 GLBs from Innerscene. See [the manifest](../manifest.json) for source, author, license, attribution requirements, file sizes and hashes, and [rendering documentation](../../../../../docs/RENDERING.md) for the full library and review scene. These are generic visual proxies for the existing mock catalogue, uniformly fitted within its stored dimensions. Static parts are merged by material at runtime. The bookcase includes project-authored ceramic/book components within its stored envelope. No source model is stretched or used as a new collision object.

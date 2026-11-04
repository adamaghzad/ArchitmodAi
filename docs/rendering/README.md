# Japandi office rendering review

Verified on 2026-11-04 in the existing ArchAI Studio application.

[2D floor plan](office-2d.png) · [Interactive 3D](office-interactive.png) · [256-sample quality render](office-high-quality.png) · [Eye-level interior](office-interior.png)

## Implemented result

The canonical 5 × 4 m room contains a walnut desk, ergonomic chair, filled bookshelf with integral ceramic/book details, upholstered reading chair, travertine side table, textured rug and warm floor lamp. Two windows and one entrance remain architectural scene objects. Local PBR wood/plaster, HDRI daylight, contact detail, soft shadows and the optional progressive render extend the existing renderer. Catalogue IDs, dimensions, prices, selection, collision rules and scene JSON are preserved.

The [asset manifest](../../apps/web/public/assets/manifest.json) records eleven Innerscene CC0 furniture GLBs plus Poly Haven CC0 floor, walnut, plaster and HDRI assets, approximately 37.79 MiB in total. Each record includes source, author, license evidence, attribution requirements and file hashes. See [full credits and implementation details](../RENDERING.md). Imported furniture remains a generic visual proxy; stored catalogue prices remain mock data.

## Measured performance

Actual adapter: NVIDIA GeForce RTX 5060 Laptop GPU, 8151 MiB, driver 592.25, ANGLE Direct3D 11. The installed Playwright Chromium build is 156.0.8078.4. Tests used headless Chromium, the Vite development server, a stationary isometric camera, continuous rendering for five seconds and a one-second warm-up exclusion. Frame intervals are wall-clock measurements, not GPU timestamp queries. These measurements do not establish a performance guarantee for larger rooms or simultaneous inference.

| Interactive condition   | Drawing buffer | Average FPS | p95 frame interval |
| ----------------------- | -------------- | ----------- | ------------------ |
| Contact detail enabled  | 1920 × 1080    | 60.0        | 17.8 ms            |
| Contact detail disabled | 1920 × 1080    | 60.0        | 17.8 ms            |

[Raw 1080p measurements](benchmark-1080p.json) include repeated effect toggles: disabled-state texture counts returned to 75 on both cycles.

The converged 256-sample render took approximately **132.6 seconds**, including initial shader compilation, at the actual **1295 × 612** application viewport. The interactive and quality screenshots use the same camera. See [raw scene/render measurements](measurements.json). Repeated trace/cancel cycles returned to **81 textures and 118 geometries**, matching the warm baseline exactly. Preparation cancellation was also exercised. Cached scene maps remain resident intentionally.

## Geometry and regression checks

The existing backend validator reports **valid**, with no geometry errors. Checks cover stored furniture footprints, wall/door clearance and connectivity under the configured 0.6 m circulation assumptions. The report retains its normal concept-only and mock-catalogue warnings. All seven rendered objects remained inside their stored dimensions and touched the rendered floor at y = 0.012 m. Six use actual licensed GLBs; the rug uses the procedural fabric material. Real 3D raycast selection and 2D/3D JSON synchronization passed.

All nine hardware end-to-end scenarios passed, including the existing marketplace, generation, upload, approval, editing, fallback/cache and snapshot workflows. The Windows/SwiftShader run independently passed both screenshot baseline comparisons, a real progressive sample, cancellation, camera controls, selection and stable resource counts; its hardware-only performance case is intentionally skipped. [Software measurements](software-measurements.json) are functional evidence and are not RTX performance results. The deterministic raster baselines live in `e2e/rendering.spec.ts-snapshots/`.

Frontend unit tests (17), backend unit/API tests (37), lint and the production build passed. Final formatting results are recorded in [HANDOFF](../../HANDOFF.md).

## Remaining visual limits

- Proportion-preserving models can leave unused space inside catalogue envelopes. Imports that would fill less than 65% of either footprint axis use the dimensional procedural fallback; the tall bed model currently takes this fallback for the low catalogue bed dimensions.
- The quality render retains some grain and spatial-filter softening. Its 512² texture-array budget and maximum 1600-pixel render width prioritize the 8 GB GPU. Initial shader compilation is substantial; drivers without parallel compilation can temporarily block interaction.
- Cutaway hides opening assemblies above the wall cap. Full walls and eye-level inspection remain available. Lighting is a visualization, not a daylight or regulatory analysis. Larger-scene FPS, peak VRAM and concurrent inference were not benchmarked.

To reproduce the review in isolated storage, follow [the rendering setup](../RENDERING.md#review-scene-and-verification).

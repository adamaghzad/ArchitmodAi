# Interior rendering

Third-party rendering copyright and license texts, including the BSD-2-Clause spatial filter used by DenoiseMaterial, ship in [THIRD_PARTY_NOTICES.txt](../apps/web/public/assets/THIRD_PARTY_NOTICES.txt). The filter is based on Michele Morrone's [glslSmartDeNoise](https://github.com/BrutPitt/glslSmartDeNoise).

The existing React Three Fiber viewport, scene JSON and metric catalogue remain authoritative. Rendering never creates a second layout or modifies LangGraph operations, product dimensions or approval rules.

## Curated assets and licensing

The local [manifest](../apps/web/public/assets/manifest.json) records every source, author, license, attribution requirement, download URL, file size and SHA-256. Assets are individual CC0 selections, not a downloaded collection. Attribution is appreciated but not required by their CC0 dedication. They are generic visual representations of mock catalogue records, not verified merchant models.

| Model                                   | Author     | Publisher license evidence                                                                                                                    |
| --------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| LINEA 140 walnut writing desk           | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/linea-140-walnut-writing-desk-c94a30dc)                          |
| VECTOR ergonomic office chair           | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/vector-ergonomic-office-chair-ae299d68)                          |
| Filled small bookshelf, including books | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/filled-bookshelf-small-original-interior-furnishing-2f38979c)    |
| Petal upholstered armchair              | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/petal-shell-pedestal-armchair-261bd2b4)                          |
| HAVEN oatmeal sofa                      | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/haven-224-oatmeal-two-seat-sofa-40262c27)                        |
| Platform bed with bedding               | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/platform-bed-with-bedding-original-interior-furnishing-d69cf237) |
| LINEA textile-panel wardrobe            | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/linea-120-textile-panel-wardrobe-d7898f5e)                       |
| BASIN bathroom vanity                   | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/basin-90-freestanding-bathroom-vanity-c58c9ba0)                  |
| Compact WC                              | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/compact-wc-close-coupled-toilet-84214efd)                        |
| ORBIT travertine side table             | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/orbit-45-travertine-side-table-d2e9684b)                         |
| Paper Column floor lamp                 | Innerscene | [Model and CC0 dedication](https://www.innerscene.com/tools/library/3d-parts/paper-column-paper-column-floor-lamp-3b5a06e7)                   |

The publisher's [library terms](https://www.innerscene.com/tools/library/terms) specify contributor rights and CC0 dedication. Source GLBs are unmodified. Static component geometry is merged by material at load time to reduce draw calls, preserving transforms and geometry.

Poly Haven's [asset license](https://polyhaven.com/license) permits redistribution under CC0:

| Asset                                                                    | Author              | Files                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [Wood Floor](https://polyhaven.com/a/wood_floor)                         | Dimitrios Savva     | 1k diffuse, OpenGL normal, roughness; 1.7 m repeat                                                                                     |
| [American Walnut Veneer](https://polyhaven.com/a/american_walnut_veneer) | Jenelle van Heerden | 1k diffuse, OpenGL normal, roughness; 1 m repeat                                                                                       |
| [White Plaster 02](https://polyhaven.com/a/white_plaster_02)             | Rob Tuytel          | 1k diffuse, OpenGL normal, roughness; 1 m repeat; painted surfaces use the selected paint colour with subtle scanned normals/roughness |
| [Brown Photostudio 02](https://polyhaven.com/a/brown_photostudio_02)     | Sergej Majboroda    | Local 1k HDR environment                                                                                                               |

[ambientCG](https://docs.ambientcg.com/license/) was researched and also offers CC0 assets. No ambientCG files are included: the selected scans plus embedded furniture PBR maps cover this room without a second material pack. Fabric/rug and ceramic fallbacks use project-authored procedural finishes.

Run `uv run --project backend python scripts/prepare_render_assets.py` to verify cached files without network requests. Add `--refresh` only when deliberately refreshing the selected files. It verifies publisher license metadata, limits each file to 8 MiB and the total to 60 MiB, and records hashes. Installation, startup and builds perform no asset downloads. Public assets ship with the app and runtime requests stay local.

## Modes and camera

**Interactive** uses demand rendering, capped device pixel ratio, cached licensed furniture, local HDRI, directional daylight, warm lamp emission and soft shadow maps. Optional **Contact detail** adds half-resolution SSAO and ACES tone mapping through MIT-licensed [react-postprocessing](https://github.com/pmndrs/react-postprocessing). Disable it to reduce fill cost. Drei provides the existing environment and orbit/gizmo helpers.

**High quality** lazy-loads MIT-licensed [three-gpu-pathtracer 0.0.24](https://github.com/gkjohnson/three-gpu-pathtracer/tree/v0.0.24), the version compatible with the existing Three.js 0.181 WebGL renderer. Newer releases move toward WebGPU and require newer Three.js; changing the renderer is outside this upgrade. The tracer reads the actual architectural scene and the same camera. A snapshot shares mesh geometry/materials while omitting grids, selection outlines and gizmos. An asynchronous BVH worker reports preparation progress. Rendering accumulates 256 samples with five light bounces; camera movement resets accumulation, scene edits return to Interactive. **Cancel render** releases the worker and tracer resources and resumes interactive rendering.

The path tracer uses 512² texture-array layers, nine tiles, a maximum 1600-pixel render width and a small spatial denoise pass after eight samples. This bounds working memory and leaves room for local inference on an 8 GB GPU. These are allocation budgets, not a measured guarantee of available VRAM. The pinned release needs supplemental cleanup for packed targets and its low-resolution pass; the adapter documents and handles that lifecycle. Initial shader compilation is substantial and can occupy the main thread on drivers without parallel compilation; progress and cancellation remain available where the driver supports them.

Isometric fits the entire room; Interior places the camera at 1.6 m eye height. Switching rendering modes never issues a camera command. Orbit, pan, zoom and the orientation HUD remain available. The HUD renders after the main pass and stays mounted across quality changes, preserving its textures. Loaded furniture sits on the same floor elevation as its procedural fallback. Uniform fit preserves model proportions and never exceeds stored catalogue dimensions. Curated imports must fill at least 65% of each footprint axis after fitting; otherwise the recognizable dimensional fallback is used. The tall platform-bed asset currently falls back for the low catalogue bed envelope. Other mismatched proportions can leave unused envelope space. Selection and collision use the full catalogue footprint.

## Review scene and verification

[japandi-office.json](../data/scenes/japandi-office.json) is a canonical 5 × 4 m room with seven catalogue objects, two large windows and an entrance door. Every visible furniture object belongs to a stored product and scene ID. Materials and quantities are assigned through the existing material service by the review seed script.

Create a separate review workspace without changing development projects:

```powershell
uv run --project backend python scripts/create_render_review.py --data-dir .local/render-review
$env:ARCHAI_DATA_DIR='.local/render-review'
npm run dev
```

Open the review project from Projects. Remove the environment variable before returning to normal development data. The script refuses other data locations except the isolated Playwright directory.

`e2e/rendering.spec.ts` seeds the same scene into isolated test storage, checks real loaded GLBs against product envelopes/floor elevation, captures 2D, interactive, interior and path-traced screenshots, verifies camera continuity, exercises cancellation and compares the scene JSON after view changes. It deletes its project afterward. `Measure FPS` renders continuously for five seconds, excludes the first second and reports actual drawing-buffer size, average FPS and p95 frame interval. Idle demand frames are not counted as performance.

```powershell
# Software WebGL, reproducible functional rendering checks
npm run test:e2e
# Real adapter request, reported adapter is recorded with the result
$env:ARCHAI_HARDWARE_RENDER='1'
npx playwright test e2e/rendering.spec.ts
```

Screenshots and raw measurements are saved under `test-results/rendering-hardware` or `test-results/rendering-software`. See HANDOFF for actual results and limitations. Performance targets remain approximately 60 FPS at 1080p for the room and 30–60 FPS for more complex scenes; measurements must identify adapter, drawing-buffer size, effect settings and browser conditions.

The SSAO noise texture and tracer-owned packed targets/passes are explicitly released. Resource checks compare warm counts across repeated traces so intentionally cached scene maps are distinguished from render-owned allocations. The postprocessing engine uses the Zlib license; the React wrapper, Drei, Three.js, mesh BVH and pinned tracer use MIT. The denoise shader's BSD-2-Clause notice is included with the other code licenses.

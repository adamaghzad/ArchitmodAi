# Architecture

## Structure

```text
apps/web/           React, TypeScript, Vite, SVG plan, React Three Fiber
backend/app/        FastAPI, scene contracts, solver, geometry, workflow, persistence
backend/tests/      Unit and API integration tests
e2e/                Playwright tests against the actual frontend and backend
.local/             Ignored SQLite databases and imported reference images
```

## Source of truth

`backend/app/models.py` defines the canonical scene and command request models. The schema is available at `GET /api/scene-schema`. Coordinates are metres: x/y describe the floor plane. The 3D renderer maps floor y to Three.js z and reserves Three.js y for elevation. Walls, openings, room surfaces, and furniture read the same scene in both views. Object IDs remain stable during edits.

Furniture and material selections store product IDs separately from catalogue records; geometry does not duplicate price/source records. Opening offsets follow each wall's start-to-end direction. Furniture rotates around its footprint origin, consistently in Python validation, SVG rendering, and Three.js rendering. Wall geometry is split into solid sections, sills, and headers so doors and windows have actual 3D voids.

## Viewport rendering

`PlanView.tsx` and `SceneView.tsx` consume the same scene and catalogue. Shared `sceneGeometry.ts` helpers establish door swing, surface lookup, rotation anchors and camera fit. SVG furniture symbols live in `editor2d/FurnitureSymbol.tsx`. Rendering details do not modify room polygons or furniture footprints.

The lazy-loaded 3D layer separates `Architecture`, `FurnitureObject`, `FurnitureModel` and `CameraRig`. Architecture uses actual wall splits, opaque surfaces, opening frames, baseboards and optional ceilings. Cutaway lowers the near exterior wall visually without changing canonical wall heights. Catalogue finish selections drive cached procedural PBR materials; unassigned surfaces are preview finishes and add no cost.

`editor3d/furnitureParts.ts` defines dimensionally bounded furniture components, including task-chair and filled bookcase fallbacks. `assetRegistry.ts` accepts local GLB/glTF, PBR maps and HDRI paths with source/license metadata from `public/assets/registry.json`. `modelLoader.ts` caches loads, merges compatible static meshes by material, clones source graphs and applies uniform fit inside the stored footprint. Failed loads fall back automatically. The curated library includes eleven individually licensed CC0 GLBs and local Poly Haven scans/HDRI, with author, attribution requirements, sizes and hashes in `public/assets/manifest.json`. Existing catalogue IDs and dimensions remain unchanged. See [interior rendering](RENDERING.md) for sources, mode behavior and budgets.

Rendering uses demand frames, capped DPR, cached materials/textures and shapes, memoized architectural/furniture components and lazy optional assets. Canvas resources are disposed on unmount; GLB sources remain cached for reuse. Lighting uses procedural environment panels, daylight, soft shadows, sRGB color output and ACES tone mapping. Camera commands fit the metric scene bounds and animate through the existing OrbitControls.

The licensed rendering milestone adds local HDRI/scanned finishes, a lazy react-postprocessing contact-detail pass, and an optional path-traced snapshot that shares actual mesh resources and the existing camera. `RenderResources` captures only synchronous tracer-owned targets/passes and restores renderer methods before returning to Fiber or a worker; scene materials remain owned by the interactive renderer. The orientation HUD stays mounted across mode changes and renders after the main pass. The SSAO noise texture has an explicit cleanup callback. These boundaries prevent repeated renders from accumulating packed targets, HUD maps or effect noise textures. Curated imports whose proportions would fill less than 65% of either stored footprint axis use the dimensional procedural fallback.

## State and persistence

Each project stores a candidate scene and a separate committed scene. Generation, furnishing, and user commands update only the candidate. Approval reruns hard validation before replacing the committed scene. Discard removes the candidate. Every mutation checks an expected project revision, and SQLite uses a conditional update to reject stale writes atomically.

Additive project fields persist up to 20 candidate undo/redo entries. Approval/discard clears draft history. Approved scenes are retained in a separate SQLite table; restoring one creates a candidate and never replaces the committed scene directly. Legacy projects retain their current committed snapshot without an invented approval timestamp. REST additions include `/brief`, `/undo`, `/redo`, `/snapshots` and `/snapshots/{revision}/restore` under each project.

Drafts and approvals persist in `.local/projects.sqlite3`. Reference files persist in `.local/assets`. Uploads are limited to 10 MB; PDF input is limited to 20 unlocked pages with explicit page selection. Image contents are decoded, resized, and re-encoded as PNG under a generated filename. Imported files are not used for training. There is no automatic retention expiry: the local API's project deletion endpoint removes the project and its reference; local users control the data directory and backups.

## Generation and validation

The explicit room list is always available. If an operator configures Ollama, an optional structured-output request extracts room types and minimum areas from a prompt. Pydantic rejects unsupported types and fields. No model-generated code is executed.

OR-Tools uses integral decimetres and bounded rectangular room variables. It enforces minimum areas, footprint containment, and non-overlap. The objective favors footprint coverage and compact room proportions. A two-second search budget returns a feasible candidate or an explicit failure. The result does not guarantee connected circulation or professional architectural feasibility.

Shapely checks room validity, containment, overlap, matching wall boundaries, furniture containment and overlap. Additional checks cover wall containment, object IDs, opening attachment and extents, confirmed scale, catalogue identity, and budget. Warnings describe checks that are outside the implemented validator.

The furnishing graph optionally runs the configured local Furniture Agent, then places stored catalogue products and validates geometry. Existing clients retain deterministic behavior unless `use_ai` is requested. Placement preserves existing items, uses a bounded position grid with room clearance, avoids footprints, wall thickness and inward door-swing sectors, and stays within the remaining sample budget. Essential furniture precedes optional pieces. A separate sequential LangGraph recommendation graph runs furniture then materials nodes. Hard filters restrict candidates to stored products with eligible dimensions and prices. Optional LangChain ChatOllama calls rank these IDs and explain matches; unsupported IDs are rejected. Suggestions are persisted separately and need acceptance before becoming draft scene changes.

Materials calculate floor area or wall area minus stored openings, add declared waste, and round up using effective coverage per purchase unit. Stored quantities are revalidated against geometry. Shopping lists contain product references, quantities, unit prices, provenance and subtotals. Confirmed, sample and estimated totals remain separate. Comparison and replacement use the same placement checks; over-budget lists suggest cheaper fitting furniture or materials with lower purchase-quantity costs. PDF/CSV exports derive from these selected records.

## Local inference and perception

Role-specific defaults match the user's installed Ollama models. LangChain adapters use schema-validated structured output; all chat/embedding calls share a process-wide lock in the single-worker service. Installed names are resolved case-insensitively against local Ollama tags. Calls use `keep_alive=0`; memory-related GPU failures retry once with `num_gpu=0`. Forced CPU mode, context size, timeout, role names and endpoint are configured through backend/.env. External clients of Ollama are outside this application's queue. No model pulling is performed.

EmbeddingGemma vectors rank semantically searched, already hard-filtered candidates. The in-memory index is keyed by endpoint, model and product descriptions. Requirements and design calls extract rooms and an ordering, while OR-Tools retains coordinate ownership. The correction endpoint permits only existing furniture moves, validates each result, and stops after three attempts; it never commits an approved scene.

OpenCV uses bounded image resizing, Canny edges and Hough line detection to return unreviewed pixel-space candidates. The UI overlays these on the source reference. `SegmentationModel.predict_wall_mask(image_rgb)` accepts a future local model through the trusted `CV_SEGMENTATION_FACTORY=module:function` configuration. The adapter validates mask shape and values. It does not infer room topology or openings and does not download weights. Experimental vision and alternative embedding model names are configurable without automatically loading them.

## Catalogue providers

`data/catalogue.json` contains 52 validated records with flat IDs/attributes suitable for later PostgreSQL migration. Every invented product, price and availability is explicitly `mock_data`; product and image URLs are null. Generic SVG illustrations and dimensionally scaled procedural furniture avoid implying exact merchant models.

`CatalogueProvider.list_products()` is the integration boundary for authorized APIs/feeds. `CATALOGUE_PROVIDER=local_json` is the default; trusted custom factories can be configured with `CATALOGUE_PROVIDER_FACTORY=module:function`. No retailer scraping exists. IKEA Morocco, KITEA and Bricoma are target providers, not connected commercial sources.

## Boundaries

The backend is local-only in its current security model. Vite proxies `/api` to the local backend. There is no browser access to inference services or direct database access. Hosting this Python backend in Sites' Worker runtime is not supported, so no detached frontend was published. The user explicitly chose local development; no Site registration, source synchronization or deployment was performed.

Trained floor-plan reconstruction, professional geometry constraints, authorized commercial sourcing, and research evaluation remain integration work described in README. Implemented mock workflows do not claim trained perception or verified merchant data.

## Official references consulted

- [Vite setup](https://vite.dev/guide/) and [Vitest setup](https://vitest.dev/guide/)
- [React Three Fiber compatibility](https://r3f.docs.pmnd.rs/getting-started/introduction)
- [React Three Fiber performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [Three.js materials](https://threejs.org/docs/pages/MeshStandardMaterial.html) and [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)
- [Drei camera controls](https://drei.docs.pmnd.rs/controls/introduction) and [orientation helper](https://drei.docs.pmnd.rs/gizmos/gizmo-helper)
- [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Pydantic models](https://docs.pydantic.dev/latest/concepts/models/)
- [OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver)
- [Shapely geometry manual](https://shapely.readthedocs.io/en/stable/manual.html)
- [LangGraph graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [embedding API](https://docs.ollama.com/api/embed), and [memory/runtime configuration](https://docs.ollama.com/faq)
- [LangChain ChatOllama integration](https://docs.langchain.com/oss/python/integrations/chat/ollama)
- [OpenCV Hough line detection](https://docs.opencv.org/4.x/d9/db0/tutorial_hough_lines.html)
- [uv projects](https://docs.astral.sh/uv/guides/projects/)
- [Playwright web servers](https://playwright.dev/docs/test-webserver)

Dependency versions are captured in `package-lock.json` and `backend/uv.lock`. No external training dataset is included. The individually curated rendering assets and their verified licenses are recorded in the [asset manifest](../apps/web/public/assets/manifest.json).

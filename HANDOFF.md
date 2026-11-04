# Handoff

Last updated: 2026-11-04.

## Git delivery

The user requested exactly 50 additional, professionally named commits and a push on 2026-11-04. The delivery groups all pending backend, licensed asset, renderer, verification and documentation changes into focused Conventional Commits on `main`, preserving the original 81 commits and existing Git identity. The configured destination is `https://github.com/adamaghzad/ArchitmodAi.git`; the remote starting `main` matched local `7b40cc8`. Local `.env` files, `.local` data, dependencies and generated browser/build output remain excluded.

The complete final application tree passed the rendering verification below before history packaging; intermediate commits are incremental file groups and were not individually tested. Packaging updates this delivery documentation and normalizes third-party notice line endings without changing license wording. Verify the final 50-commit count, clean working tree and matching remote HEAD after pushing; the actual remote outcome is reported in the delivery response.

## Requested outcome

Start building the project from the PDF using simple engineering, meaningful unit/end-to-end tests, linters, formatters, official documentation, and durable handoff files. Avoid release labels in project naming. The user subsequently confirmed local Windows inference and the detailed Furniture & Materials Marketplace requirements recorded in DEVELOPMENT_RULES.md and CONTEXT.md.

The previous task upgraded the workspace against two supplied visual references. The current task adds licensed interior-rendering assets and an approved 5 × 4 m Japandi office acceptance scene, while preserving the existing application, canonical scene, catalogue dimensions and unrelated backend work. See [interior rendering](docs/RENDERING.md) for scope, asset credits and reproduction.

## Licensed rendering milestone

- Eleven individually curated Innerscene CC0 GLBs cover walnut desk, ergonomic task chair, filled bookshelf, upholstered armchair, side table, lamp, sofa, bed, wardrobe, vanity and WC. Poly Haven CC0 floor/walnut/plaster scans and a local 1k HDRI accompany them. Sources, authors, attribution requirements, sizes and SHA-256 hashes are recorded in `public/assets/manifest.json`; third-party code notices are bundled separately. Approximately 37.79 MiB of individually selected assets are included; startup/install/build never download an asset library.
- The existing loader now merges compatible static meshes by material, preserves transforms, caches sources and uniformly fits within catalogue bounds. Recognizable task-chair and bookcase fallbacks are improved. A minimum footprint-fill setting rejects imports that would become misleadingly small: the tall bed model currently uses the dimensional procedural fallback for the low catalogue bed envelope. Existing records, costs and collision dimensions remain unchanged. Bookcase vase/book details belong to its existing furniture object and stay inside its envelope.
- PBR materials use metre-based UVs, linear normal/roughness data, correctly scaled wood flooring and subtle painted plaster detail. Furniture rests at the actual floor elevation. HDRI/daylight, warm lamp lighting and optional half-resolution SSAO improve the interactive viewport. Isometric framing and a 1.6 m interior camera preserve orbit/pan/zoom. Cutaway opening frames/doors follow their wall cap to avoid floating window assemblies.
- Interactive and optional 256-sample quality modes use the same architecture and camera. `three-gpu-pathtracer@0.0.24` is pinned for Three.js 0.181/WebGL compatibility, lazy-loaded with a BVH worker, bounded texture arrays/tiles/render width, progress, shader-compilation status and cancellation. A spatial denoise pass reduces grain. The adapter explicitly tracks/disposes owned packed targets and passes omitted by the upstream lifecycle, preserving scene-owned maps and geometry. Vite prebundles lazy dependencies to avoid development reloads when first entering a mode.
- `data/scenes/japandi-office.json` and `scripts/create_render_review.py` reproduce the seven-object room with two windows, entrance, material quantities and the existing 0.6 m circulation assumptions. The seed script only writes isolated review/test data. Rendering tests check actual GLBs, floor contact, bounds, camera continuity, raycast selection, canonical JSON preservation, cancellation and resource stability. Windows/SwiftShader screenshot baselines cover 2D and interactive 3D; hardware screenshots and raw measurements are retained in `docs/rendering/`.
- Pre-existing uncommitted backend edits were preserved. No unrelated LangGraph workflow, marketplace behavior, generation logic, hosted inference, deployment, source push or Git commit was introduced.

## Implemented

- React/TypeScript/Vite workspace in apps/web with an SVG plan, a lazy-loaded React Three Fiber scene, room/wall/furniture inspection, numeric movement/rotation, draft approval/discard, persisted project reopening, and JSON export.
- FastAPI/Pydantic canonical scenes, OR-Tools rectangular layout generation, Shapely geometry validation, optimistic project revisions, and separate candidate/committed snapshots stored in local SQLite.
- PNG/JPEG/PDF reference import with page selection, content/size checks, calibration, OpenCV line proposals, and a configurable future local segmentation-mask interface. No trained room reconstruction is claimed.
- LangChain/Ollama adapters for configured role models, process-wide sequential inference, installed-model checks, automatic unload after calls, memory-related GPU-to-CPU retry, and forced CPU mode. No automatic model downloads.
- Optional Qwen requirement extraction and design ordering, sequential LangGraph furniture/material recommendations, deterministic furnishing, and a bounded three-attempt furniture correction service. All suggestions remain reviewable; no agent commits approved changes.
- Fifty-two JSON mock catalogue records with dimensions, MAD prices, material, style, provenance, availability labels, optional image/GLB/link fields, and material coverage. The rendering upgrade adds only toilet and shower fixtures; existing IDs are unchanged. No invented commercial URLs or verified stock claims.
- Integrated marketplace discovery/filtering/sorting/semantic search, product details, dimensional comparisons and available-space checks, scene insertion/replacement/removal, accept/reject recommendations, material quantity calculation, live shopping totals, cheaper alternatives, and PDF/CSV shopping exports.
- Configurable catalogue provider and segmentation factories for future authorized feeds and local trained models. No retailer scraping or large furniture-library download.
- README, architecture/testing docs, user rules, AGENTS references, dependency locks, lint/format configuration, and tests. The source PDF remains unchanged.

## Workspace and rendering upgrade

- `App.tsx`, `WorkspaceToolbar.tsx`, `WorkspacePanel.tsx`, `styles.css` and `workspace.css`: forest-green interface, real navigation/project gallery, design brief, exports, settings, persisted undo/redo and approved snapshot restoration. CSS overrides load after the shared theme in `main.tsx`.
- `PlanView.tsx`, `editor2d/FurnitureSymbol.tsx`, `sceneGeometry.ts`: metric SVG symbols, wall-attached doors/windows, inward swing, precise dimensions, measurement, pan/zoom, validated furniture drag and centre-preserving rotation.
- `SceneView.tsx` and `editor3d/`: opaque split walls, real openings/frames, baseboards, floors/optional ceilings, near-wall cutaway, detailed sofas/beds/tables/chairs/kitchen/bathroom/storage, cached procedural PBR materials, daylight/soft shadows, procedural environment lighting, orientation gizmo and smooth camera presets. Demand rendering, capped DPR and lazy loading limit idle/GPU cost.
- Central `public/assets/registry.json` plus model/texture folders: optional source/license-labelled local GLB/glTF, cached loads, uniform fitting and procedural fallback. No asset pack, additional AI model, dependency or hosted service was added.
- `Inspector.tsx`, `ContextProperties.tsx`, `Marketplace.tsx`: actual contextual properties, room finishes, editable walls/openings, actionable validator issues, linked products/alternatives, selected-room placement and furniture library filtering. Replacement retains its original pose when valid.
- Backend: additive history/snapshot/brief APIs and project fields; inward door-sector and wall-thickness collision checks; related object IDs; selected material quantities/costs refreshed after geometry edits; LangGraph optional local AI furnishing followed by deterministic catalogue placement/validation. Existing APIs retain deterministic furnishing unless `use_ai` is set.
- AI furnishing is a candidate with explicit review/reject/approve. Further edits clear the proposal banner and use ordinary draft history, preventing a rejection button from undoing an unrelated later edit. Approval remains the only committed-scene mutation.

## Rendering verification

- `npm test`: 17 frontend and 37 backend unit/API tests passed.
- `npm run lint`, `npm run format:check`, TypeScript checking and `npm run build` passed. Vite retains the expected warning for the lazily loaded Three.js chunk.
- `ARCHAI_HARDWARE_RENDER=1 npm run test:e2e`: all nine Chromium scenarios passed in 5.1 minutes. The 256-sample office render took 132.6 seconds including shader compilation; actual 1920 × 1080 interactive measurements were 60 FPS with and without contact detail, on the RTX 5060 Laptop GPU. Warm repeated-render counts returned exactly to 81 textures and 118 geometries; repeated SSAO toggles also returned to the same texture count.
- The independent Windows/SwiftShader rendering run passed the 2D/3D pixel baselines, real progressive rendering, cancellation, bounds, floor contact, camera and selection checks. Its GPU-only benchmark was intentionally skipped. Camera completion checks allow 30 seconds for slow software rendering; no application behavior was relaxed.
- [Screenshots, measured conditions and raw reports](docs/rendering/README.md) are retained in the repository. The office validator reports no hard errors, with the normal concept/sample-data warnings. No live inference was invoked.

## Earlier workspace verification

- `npm test`: 10 frontend geometry/asset tests and 37 backend unit/API tests passed after the workspace upgrade.
- `npm run test:e2e`: all seven Chromium scenarios passed in the final full run (3.9 minutes), covering the original five workflows plus synchronized editing/materials/cameras/snapshots and invalid-GLB fallback/cache behavior.
- Inspected the actual upgraded four-room 2D/3D screenshots, including the final tighter camera framing, along with desktop, narrow-screen and marketplace browser artifacts. Screenshots remain ignored under test-results.
- Production frontend build and TypeScript checks passed. Three.js is loaded separately; Vite reports its expected large 3D chunk warning.
- ESLint, Ruff, Prettier and Ruff formatting checks passed after final cleanup.
- Live Ollama smoke check: embeddinggemma:latest returned 768-dimensional embeddings; qwen3.5:4b correctly extracted the requested living/bedroom minimum areas. Requests ran sequentially and unloaded afterward. Live design/correction model quality and real GPU OOM behavior were not benchmarked; CPU retry behavior is covered with simulated errors.
- The initial foundation smoke check started both services and verified frontend/API/catalogue HTTP responses. The upgrade uses the isolated Playwright services for browser verification; these servers are owned and cleaned up by the test runner.
- npm production dependency audit found no known vulnerabilities. The development lint toolchain retains moderate transitive minimatch advisories, documented in docs/TESTING.md; no forced incompatible overrides were applied.

## Local operation

Dependencies and the Playwright browser are installed on this computer. An ignored backend/.env was prepared from backend/.env.example with the user's role models and local endpoint. Run `npm run dev` from the root and open http://127.0.0.1:5173. README documents reproducible installation with npm ci and uv sync --project backend --locked.

Development data stays in .local; browser tests use separate .local/e2e storage and delete their created projects. This local application has no authentication and binds only to loopback. No hosting registration, deployment or source push was performed.

## Initial Git history and setup documentation

The user requested exactly 81 professional commits and README instructions for running the application and its models. The repository had no existing commits and 81 project files. The initial history on `main` records each file in a focused commit with a descriptive Conventional Commit message; this handoff is the final commit in that sequence. Existing Git identity and actual commit times are preserved. Personal `.env` settings, local databases/uploads, installed dependencies and generated artifacts remain ignored.

README now explains guarded `.env` setup, combined and separate FastAPI/frontend startup, service URLs, model roles and current usage, Ollama inspection commands, VRAM/CPU fallback settings, CV/data configuration, optional asset setup and troubleshooting. Commands and defaults were checked against the project manifests, settings and official Ollama/uv documentation. Reserved supervisor/experimental vision configuration is distinguished from active model calls.

For this documentation/check-in task, ESLint/Ruff and repository formatting checks passed. Git whitespace checks apply to every staged file; trailing blank lines in ignore/editor configuration were removed. The prior complete application test/build results above remain applicable: application code was not changed during this task. Verification covers the complete project tree rather than each intermediate file-addition commit. The history is local; no remote push was requested.

## Remaining source-brief work and limits

- No trained segmentation weights, full room/opening reconstruction, dataset training/evaluation, or authorized commercial catalogue feeds have been supplied. The interfaces are implemented; sample data remains explicitly mock_data.
- Layouts and edits are constrained to the documented rectangular geometry model. Adjacency, circulation, daylight, services, and professional building-code validation remain unverified. Wall corrections do not automatically rebuild room topology.
- Rendered furniture remains a generic visual proxy rather than an exact merchant model. Licensed GLBs supplement procedural fallbacks; mismatched proportions can leave unused envelope space or trigger a fallback. Material estimates still use illustrative coverage, declared waste and wall-centre-line geometry. Unassigned preview finishes add no shopping-list costs. Progressive images retain some grain/softening, and the initial quality shader can take substantial time to compile.
- The current office's hardware rendering conditions and measurements are recorded in `docs/rendering/`; larger-scene performance, peak VRAM and concurrent local inference remain unbenchmarked. Earlier software browser checks and live inference smoke tests are historical observations. Mocked AI checks do not establish live furnishing quality.
- The user has not set exhaustive acceptance criteria or a coverage threshold. Current tests validate the implemented foundation, not the full academic research blueprint.
- Supervisor routing is deterministic for explicit entry choices. Experimental llava vision and the alternative embedding model are configurable but are not invoked automatically.
- The marketplace has no seller accounts, checkout, payments, orders, inventory operations, reviews, or live stock synchronization, as requested.

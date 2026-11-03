# Handoff

Last updated: 2026-11-03.

## Requested outcome

Start building the project from the PDF using simple engineering, meaningful unit/end-to-end tests, linters, formatters, official documentation, and durable handoff files. Avoid release labels in project naming. The user subsequently confirmed local Windows inference and the detailed Furniture & Materials Marketplace requirements recorded in DEVELOPMENT_RULES.md and CONTEXT.md.

The latest task upgrades the existing workspace against two supplied visual references, with realistic procedural furniture, PBR surfaces, lighting, cameras, contextual editing, preserved geometry and AI/catalogue integration. The user confirmed no prepared local assets. See [workspace upgrade](docs/WORKSPACE_UPGRADE.md) for scope and acceptance.

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

## Verification completed

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
- Recognizable procedural furniture represents actual product bounds, but is an approximate visual proxy rather than an exact merchant model or photorealistic asset. No licensed external asset is included by default. Material estimates use stored illustrative effective coverage, declared waste, and wall-centre-line geometry. Unassigned procedural preview finishes do not add shopping-list costs.
- Software-rendered browser tests validate interaction and visible output, not frame-rate performance on the user's RTX GPU. The configured GPU and live AI furnishing quality have not been benchmarked during this rendering upgrade; mocked AI tests verify stored product IDs and approval isolation. Prior foundation live inference smoke checks remain historical observations above.
- The user has not set exhaustive acceptance criteria or a coverage threshold. Current tests validate the implemented foundation, not the full academic research blueprint.
- Supervisor routing is deterministic for explicit entry choices. Experimental llava vision and the alternative embedding model are configurable but are not invoked automatically.
- The marketplace has no seller accounts, checkout, payments, orders, inventory operations, reviews, or live stock synchronization, as requested.

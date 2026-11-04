# Project context

Last updated: 2026-11-04.

The user requested the `dounia-ouakil` branch containing all existing work. It starts from `e604051` with the complete 140-commit history and preserves commit authorship; the working branch is now `dounia-ouakil`, with `origin/dounia-ouakil` as its remote target.

The README now includes actual rendered interior examples and a matching floor plan, as requested by the user. The gallery reuses tracked Japandi office, pastel bedroom and style-comparison screenshots, with links to their source reviews.

## Interior design knowledge — current implementation

The user authorized five structured style profiles with all-room furnishing templates and shared Requirements/Furniture/Materials retrieval. Implemented profiles live in `data/interior_styles.json`; legacy style names resolve as aliases. Product ranking combines soft style, dimensions, remaining purchase-unit budget and existing EmbeddingGemma similarity with recorded offline/failure fallback. Explicit quantities/exclusions override templates; geometry and catalogue provenance remain authoritative. Completeness distinguishes explicit requests, template suggestions and material/palette/lighting preferences. Both UI selectors expose the five styles, and canonical furniture colours/lamp light/finish choices reach Three.js and the 2D floor colour. No new models or asset collections were downloaded. See [knowledge design and verification](docs/INTERIOR_DESIGN_KNOWLEDGE.md) and HANDOFF for actual check results.

The user subsequently requested committing and pushing this pending bedroom/knowledge-base work in separate focused commits, without specifying a count. The earlier 50-commit renderer delivery is complete at `e72286b`; the current delivery preserves that history and uses the existing `main`/`origin` without force.

## Source and current state

- Repository directory: ArchitmodAi.
- Source brief: [ArchAI_Project_Documentation.pdf](ArchAI_Project_Documentation.pdf), 20 pages, reviewed on 2026-11-03. The PDF and the user's marketplace brief use the name ArchAI Studio, which is used in the application.
- At initial inspection, the repository contained the PDF and Git metadata only. No application code, dependency manifests, test suites, linters, or formatters were present.
- The user explicitly asked to start building, then supplied local inference and marketplace requirements. A runnable local frontend/backend foundation is now implemented; see README for behavior and limits.
- Before implementation, follow-up inspection found no additional local source files, tracked files, or Git commits. The configured GitHub remote returned no branch heads from `git ls-remote --heads origin`. No existing implementation needed preservation.
- Authoritative working instructions: [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md), referenced by [AGENTS.md](AGENTS.md).

## What the PDF describes

These are source-brief statements, not claims of implemented functionality or an approved implementation plan.

- Two entry paths: upload a PDF/PNG/JPG floor plan, or generate a candidate floor plan from text (pages 3, 6-8).
- A shared canonical architectural scene for the backend, AI workflow, validation, and 2D/3D editor. The scene uses metres, stable object IDs, room polygons, wall-attached openings, and provenance (pages 9-10).
- User review and correction of geometry and scale; candidate changes are validated and reviewed before being committed (pages 5-7, 11-13).
- Furniture and material recommendations grounded in catalogue records, with dimensions, source links, checked prices, and deterministic budget calculations in MAD (pages 12-14).
- A constraint solver and geometry checks determine feasibility; model-generated proposals do not establish geometric correctness (pages 8, 14-15).
- The PDF proposes React/TypeScript, 2D/3D rendering, FastAPI/Pydantic, LangGraph/Qwen, computer vision, geometry, and constraint solving (pages 15-16). The user confirmed the React/TypeScript/Three.js/FastAPI/LangGraph/LangChain/Ollama direction. The implementation uses Vite, SVG, React Three Fiber, Shapely, OR-Tools, OpenCV, local JSON catalogue data, and SQLite project storage. Package versions are locked and official technical references are recorded in docs/ARCHITECTURE.md.
- Evaluation covers perception, layout feasibility, placement, catalogue correctness, workflow reliability, and end-to-end behavior (pages 18-19).

## User clarifications

- The user clarified that the objection concerns release labels in naming. Use unversioned project names, headings, and deliverables. The earlier interpretation that this prohibited development phases or feature deferrals was too broad and has been removed. The naming preference does not expand or reduce feature scope.
- The user asked the agent to search for existing code and decisions. Local files, Git history, tracked files, and remote branch heads were inspected; no additional implementation or established stack was found. The PDF remains the available technical proposal.
- The user has not decided specific unit-test or end-to-end acceptance criteria. The requirement to use both test types remains in place.
- The user answered the follow-up by explicitly requesting that project building begin.
- Local development is confirmed. The user reports 32 GB RAM and an RTX 5060 with 8 GB VRAM; `nvidia-smi` confirmed an RTX 5060 Laptop GPU with 8151 MiB. Existing Ollama models were inspected; no language, embedding, vision weights, datasets, or furniture asset libraries were downloaded.
- Role models and endpoints are configurable in backend/.env; defaults match the user's supplied models. Model calls share a process-wide lock and unload after requests. CPU retry is limited to memory-related failures.
- The marketplace scope is confirmed: discovery/filtering/sorting, correctly scaled scene placement, comparisons/replacements, furniture/material recommendations with accept/reject, budget and material quantities, project shopping lists, and PDF/CSV export. Commerce operations are excluded; see DEVELOPMENT_RULES.md.
- The local catalogue contains 56 explicitly labelled mock JSON records, including toilet/shower fixtures and four bedroom/material records added by the workspace and bedroom upgrades. Existing product IDs are preserved; there are no fabricated commercial URLs. Provider and segmentation interfaces are available for future authorized feeds and locally trained models.
- The user subsequently requested a professional workspace and realistic rendering upgrade using two supplied visual references. The brief and acceptance are recorded in [docs/WORKSPACE_UPGRADE.md](docs/WORKSPACE_UPGRADE.md). Preserve the existing React/Three/FastAPI/LangGraph architecture and canonical geometry.
- At the preceding workspace upgrade, the user had no prepared GLB/glTF or texture assets. That upgrade added procedural PBR materials and an optional licensed loader. The subsequent licensed rendering milestone includes individually selected assets as described below. Asset appearance must never override stored dimensions, placement or collision checks.
- The workspace now includes real navigation, contextual properties, SVG editing, camera presets, persisted draft undo/redo, approved snapshot restoration, synchronized material quantities and an optional local AI furnishing proposal. These additions retain candidate/approval isolation and optimistic revisions.
- The user requested an initial Git history of exactly 81 descriptive commits and expanded README instructions for local setup and models. Inspection found 81 untracked project files and no existing commits on `main`; the initial history records one real file per commit. Personal configuration, local data, dependencies and generated artifacts remain ignored. No remote push was requested.

## Licensed rendering milestone

On 2026-11-04 the user requested a realistic renderer upgrade and approved the rendering acceptance checks. Their expanded brief specifies a 5 × 4 m modern Japandi home office, catalogue bounds, floor contact, clear doors and basic circulation, isometric and eye-level cameras, local licensed furniture/materials, optional progressive quality, progress/cancellation, screenshots and measured FPS. Approximately 60 FPS at 1080p and 30–60 FPS for larger scenes are targets. Unrelated LangGraph, marketplace and generation logic must remain unchanged; pre-existing uncommitted backend work is preserved.

The implementation extends the existing Three.js/Fiber scene with eleven individually curated Innerscene CC0 GLBs and three Poly Haven CC0 PBR material sets plus a 1k HDRI. Downloaded assets total approximately 37.79 MiB; the [manifest](apps/web/public/assets/manifest.json) records authors, source/license evidence, attribution requirements and hashes. Existing catalogue records, dimensions and prices are unchanged. Uniformly fitted models remain generic visual proxies inside the stored envelopes, with proportion-preserving fit that can leave unused height/width. Bookshelf decorations belong to the same selected furniture object and remain inside its envelope.

Interactive rendering uses cached meshes merged by material, metre-based material UVs, daylight, warm lamps and optional half-resolution contact detail through react-postprocessing. High quality lazy-loads the Three.js-compatible WebGL path tracer 0.0.24, uses the actual architectural geometry and camera, accumulates 256 samples and applies a light spatial denoise pass. Preparation, compilation and sample accumulation have distinct status messages; cancellation releases the tracer/worker. Scene edits return to Interactive. Newer path-tracer versions require a larger Three.js/WebGPU migration, so the compatible dependency is pinned.

The acceptance fixture and isolated seed script are in `data/scenes/japandi-office.json` and `scripts/create_render_review.py`. The existing geometry service validates its door, walls, catalogue footprints and configured 0.6 m circulation assumptions. See [rendering documentation](docs/RENDERING.md) and HANDOFF for reproducible checks and results. No inference models or live LangGraph calls are used by rendering tests.

## Implementation boundaries

The subsequent 2026-11-04 bedroom task repairs lost prompt/furniture quantities and unapplied style across the generation pipeline. `Scene.design_brief` persists text and needs; furnishing uses Shapely candidate regions and bounded CP-SAT selection, applies finishes and reports missing requirements through at most two correction attempts. `ValidationReport.completeness` is derived from the current scene, with a separate actual mesh audit in the browser. Short lamps have validated support/elevation relationships; rugs remain floor coverings. The catalogue now has 56 explicitly mock records, adding a headboard-height double bed, dressing vanity/mirror, potted plant and light-oak floor without changing existing dimensions/prices. Existing CC0 assets are reused with owned palette material clones; no additional assets or inference weights are downloaded. See [bedroom pipeline](docs/BEDROOM_PIPELINE.md) and [comparison evidence](docs/bedroom/README.md).

- Both renderers read the same canonical scene. Candidate changes never overwrite committed snapshots until validated approval.
- The layout solver handles axis-aligned rectangular rooms and minimum areas. Adjacency/circulation and professional building rules are unverified.
- OpenCV returns pixel-space line proposals for review; it does not reconstruct room topology or openings. Calibration creates an explicitly labelled rectangular reference outline.
- Material quantities use stored effective coverage and declared waste. Sample prices are kept separate from future confirmed or estimated commercial prices in shopping-list totals.
- See README and HANDOFF for verification and remaining limits; do not describe the entire research blueprint as complete.

The PDF references example scene and operation files that are absent from this repository. Do not claim they exist or use the incomplete inline scene as a complete fixture (pages 10, 13).

## Pending questions

On 2026-11-04 the user authorized recording all pending work in exactly 50 additional descriptive commits and pushing `main` to the configured GitHub `origin`. This supersedes the earlier local-only delivery authorization for this task. The previous 81-commit history remains intact; local settings, development/test data and installed dependencies remain excluded.

1. Rendering milestone checks are approved. The user has not defined exhaustive acceptance or a coverage threshold for the broader research project; current tests do not establish that broader final contract.
2. Trained segmentation weights, authorized catalogue feeds, and professional architecture constraints have not been supplied. Interfaces and explicit limitations preserve these boundaries.

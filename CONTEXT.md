# Project context

Last updated: 2026-11-03.

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
- The local catalogue contains 52 explicitly labelled mock JSON records, including toilet and shower fixtures added for the workspace upgrade. Existing product IDs are preserved; there are no fabricated commercial URLs. Provider and segmentation interfaces are available for future authorized feeds and locally trained models.
- The user subsequently requested a professional workspace and realistic rendering upgrade using two supplied visual references. The brief and acceptance are recorded in [docs/WORKSPACE_UPGRADE.md](docs/WORKSPACE_UPGRADE.md). Preserve the existing React/Three/FastAPI/LangGraph architecture and canonical geometry.
- The user has no prepared GLB/glTF or texture assets. Detailed procedural furniture and optional local assets are authorized. The implementation includes cached procedural PBR materials, a central licensed-asset registry, lazy GLB loading and automatic procedural fallback. No external asset library or model was downloaded. Asset appearance must never override stored dimensions, placement or collision checks.
- The workspace now includes real navigation, contextual properties, SVG editing, camera presets, persisted draft undo/redo, approved snapshot restoration, synchronized material quantities and an optional local AI furnishing proposal. These additions retain candidate/approval isolation and optimistic revisions.
- The user requested an initial Git history of exactly 81 descriptive commits and expanded README instructions for local setup and models. Inspection found 81 untracked project files and no existing commits on `main`; the initial history records one real file per commit. Personal configuration, local data, dependencies and generated artifacts remain ignored. No remote push was requested.

## Implementation boundaries

- Both renderers read the same canonical scene. Candidate changes never overwrite committed snapshots until validated approval.
- The layout solver handles axis-aligned rectangular rooms and minimum areas. Adjacency/circulation and professional building rules are unverified.
- OpenCV returns pixel-space line proposals for review; it does not reconstruct room topology or openings. Calibration creates an explicitly labelled rectangular reference outline.
- Material quantities use stored effective coverage and declared waste. Sample prices are kept separate from future confirmed or estimated commercial prices in shopping-list totals.
- See README and HANDOFF for verification and remaining limits; do not describe the entire research blueprint as complete.

The PDF references example scene and operation files that are absent from this repository. Do not claim they exist or use the incomplete inline scene as a complete fixture (pages 10, 13).

## Pending questions

1. The user has not defined exhaustive feature acceptance criteria or a coverage threshold. Current tests cover the implemented behavior; they do not establish a final acceptance contract.
2. Trained segmentation weights, authorized catalogue feeds, and professional architecture constraints have not been supplied. Interfaces and explicit limitations preserve these boundaries.

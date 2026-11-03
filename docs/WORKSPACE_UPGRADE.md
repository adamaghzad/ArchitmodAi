# Workspace upgrade

## Audit and scope

The user supplied a detailed workspace upgrade brief and two visual references on 2026-11-03. This extends the existing application; it does not replace its architecture.

The frontend uses React state, TypeScript, Vite, SVG, React Three Fiber, Drei and a shared CSS theme. `PlanView.tsx` and `SceneView.tsx` read the same metric scene. The backend already provides Pydantic scene contracts, Shapely validation, OR-Tools generation, LangGraph/Ollama workflows, local SQLite persistence and JSON catalogue providers. Existing marketplace, upload, generation and approval APIs must remain compatible.

Rendering gaps: flat translucent walls, box furniture, simple 2D symbols, no optional model loader, limited camera controls, insufficient contextual properties and no actionable issue selection. The existing 3D geometry already cuts real opening voids; retain that strategy.

## Implementation direction

1. Refine the existing forest-green CSS tokens and workspace layout.
2. Add detailed dimensional SVG symbols, pan/zoom and consistent selection/editing.
3. Build opaque architectural meshes, opening frames, baseboards, procedural PBR finishes, recognizable furniture and optional local GLB loading.
4. Add camera presets, orientation, cutaway/ceiling visibility and validated movement/rotation.
5. Connect contextual materials/products, actionable checks, AI proposal review and project snapshots to the existing data.
6. Verify geometry, synchronization, persistence, missing-asset fallback and browser workflows; inspect actual renders.

The user has no prepared licensed assets and authorized procedural furniture plus optional licensed local assets. Use lightweight generated materials first. Do not download model/texture libraries, add paid inference, or include unverified asset licenses. Optional models live under the frontend's `public/assets/models/`, textures under `public/assets/textures/`, with a central registry and provenance.

## Acceptance

The supplied brief establishes feature acceptance: recognizable 2D/3D furniture; consistent walls/openings/dimensions; working selection, cameras and edits; realistic materials/daylight/shadows; synchronized catalogue costs; preserved generation/upload/approval; meaningful tests; and no static screenshots or nonfunctional controls presented as working features.

Remaining professional building-code validation, trained CV reconstruction and authorized retailer feeds are outside this rendering upgrade. Product estimates and approximate visual proxies retain their existing provenance labels.

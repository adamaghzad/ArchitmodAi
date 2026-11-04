# Bedroom generation and completeness

The 2026-11-04 fix preserves the existing React / Three.js, FastAPI, Ollama and LangGraph architecture. It addresses the user's pastel-bedroom failure across requirements, catalogue choice, placement, materials, reporting and rendering.

## Diagnosis

| Stage        | Finding                                                                                                                                                                                   | Change                                                                                                                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements | `Brief` contained only rooms; the original text, furniture quantities and palette were discarded after layout.                                                                            | Persist `Scene.design_brief`; extend schema-validated extraction with furniture needs, quantities and finish preferences. A deterministic bedroom vocabulary protects recognizable explicit requests from room-only model answers. |
| Design       | The Design Agent orders rooms; it does not design the furniture layout. The default footprint is 8 × 6 m unless edited.                                                                   | Preserve solver ownership of coordinates and use an explicit 5 × 4 m acceptance request. Keep the room list available alongside a furniture brief.                                                                                 |
| Furniture    | Advice was capped at eight IDs and deduplicated; only one instance per product was attempted. Room filters excluded the reading chair and bookcase from bedrooms.                         | Treat agent IDs as catalogue ranking, with quantities coming from the original brief. Add bedroom eligibility and four explicitly mock sample records.                                                                             |
| Placement    | First-fit 0.2 m scans clustered objects in a corner. Failed products were silently skipped. Small lamps occupied floor space; rugs blocked circulation like solid furniture.              | Use bounded Shapely candidate regions and CP-SAT product/pose selection, essential priorities, door/wall constraints and a shared budget. Add real support/elevation relationships and floor-covering occupancy.                   |
| Validation   | Validation reports issues and does not delete furniture. It had no requirement-completeness check.                                                                                        | Derive completeness from the current scene on every validation, including after edits. Do not remove valid existing furniture to make a new candidate fit.                                                                         |
| Materials    | The separate recommendation graph only suggested materials; automatic furnishing did not select any room finishes.                                                                        | The furnishing Materials node applies quantity-costed light-oak floor and cream paint within the remaining budget. Palette metadata reaches procedural and cloned GLB materials.                                                   |
| Renderer     | Existing JSON objects were represented; the sparse scene mostly originated upstream. The low 0.6 m sample-bed envelope cannot hold the tall licensed bed without shrinking its footprint. | Keep the original dimensions and fallback. Add a separate mock upholstered bed with a 1.1 m headboard envelope, detailed bedding, vanity/mirror and plants. Audit every canonical object against actual meshes.                    |
| Budget       | The 5 × 4 m baseline spent 7,200 of 20,000 MAD. Budget did not explain its incompleteness.                                                                                                | Report remaining budget and every missing item; preserve valid lower-budget subsets and cap correction.                                                                                                                            |

## Canonical data and flow

`GenerateRequest.furnish` is additive and defaults to false for existing API clients. The creation form supplies it when the user enters a brief, producing a furnished candidate in one action. Without a brief, Generate layout retains the previous behavior. The text field can be used with the explicit room list; optional Qwen interpretation still extracts room requirements and ordering. No inference runs unless requested.

`design_brief` retains the source text, typed furniture needs, counts, priorities, palette and materials. The local parser covers the bedroom vocabulary and some explicit unsupported noun clauses; broader language relies on the configured Requirements Agent. Unsupported extracted roles remain missing requirements rather than fabricated products. Unmatched room types remain visible in the report. This parser is not a general natural-language understanding guarantee.

The furnishing LangGraph runs requirements/catalogue ranking → bounded placement → material application → geometry/completeness validation. Missing furniture routes through at most **two correction attempts**. Corrections retain valid existing objects, retry missing quantities with a denser finite candidate set and catalogue alternatives, then return a report even if incomplete. Within a placement pass, CP-SAT has a two-second solve budget and at most three circulation-checked solutions. Failure means no valid placement was found within these bounds, not a mathematical proof that every layout is infeasible.

Shapely checks polygon containment, physical wall bodies, door swing/approaches and connected circulation at the declared path width. Tall storage candidates avoid the window access region. CP-SAT selects mutually compatible product poses with a shared remaining-budget constraint and essential priorities. It does not place random coordinates. Floor coverings can overlap furniture but remain inside the room and clear of doors/walls. Short lamps can overlap their support in plan only when their elevation equals the tabletop and their footprint is contained by it. Moving/rotating a table moves its lamp; replacing a compatible table recentres it. Incompatible supports are rejected. Removing a support removes its mounted lamp and records the reason. Rugs render beneath furniture symbols in 2D.

`ValidationReport.completeness` contains requested counts, placed counts, product/object IDs, missing reasons, validation status, finish requirements, budget and correction count. It is recomputed from current geometry and selections, so deleting a plant cannot leave a stale success badge. Render status stays `awaiting_viewport_audit` on the server: the browser separately checks actual mesh groups and updates the Inspector. Mesh presence does not assert that an object is unoccluded from every angle.

Structured `design_pipeline` events have a scene ID, stage, requirement or object ID, product, outcome and reason. Backend events are retained in `Scene.design_trace` and emitted through the server logger. `RenderAudit` emits browser rendering events and exposes actual statuses, mesh counts and colours on the canvas. Together these distinguish agent omissions, budget rejection, bounded-search failure, geometry errors, pending GLB loading, licensed models and procedural fallbacks. No browser claim is inferred solely from JSON membership.

## Materials and assets

Existing Innerscene CC0 reading-chair, wardrobe and bookshelf GLBs are reused; no asset collection is downloaded. Optional per-instance tints clone PBR materials and preserve cached source materials/maps. The MaterialProvider owns these clones. Source binaries and hashes remain unchanged; runtime modifications are recorded in the [asset manifest](../apps/web/public/assets/manifest.json).

Four new `local_sample` / `mock_data` catalogue records provide the missing semantic/dimensional cases:

| Product                                      | Dimensions W × D × H (m)                                            | Sample MAD |
| -------------------------------------------- | ------------------------------------------------------------------- | ---------- |
| Upholstered double bed with headboard        | 1.6 × 2.1 × 1.1                                                     | 3,900      |
| Light oak dressing desk with integral mirror | 1 × 0.45 × 1.5                                                      | 1,600      |
| Decorative plant in ceramic pot              | 0.35 × 0.35 × 0.85                                                  | 280        |
| Light oak laminate                           | Existing declared pack coverage; quantities computed from room area | 210 / pack |

The new bed, vanity and plant geometry is project-authored procedural code; it does not claim merchant fidelity. Existing product dimensions/prices are preserved. The floor and light timber retain a light procedural grain albedo with the licensed PBR scan's normal/roughness detail, avoiding a dark walnut diffuse map defeating the light-oak palette. Cream paint preserves its catalogue colour. Blush bedding, sage fabrics, warm lamps, softer materials and bright window glazing complete the palette. The sky gradient is an illustrative part of the existing window assembly. See [rendering licensing](RENDERING.md) for sources and licenses.

## Reproduction and verification

```powershell
# Deterministic, isolated review; prints the created project and complete report.
uv run --project backend python scripts/create_bedroom_review.py --data-dir .local/render-review

# Explicit live local models, sequential calls and automatic unload; no downloads.
uv run --project backend python scripts/create_bedroom_review.py --data-dir .local/render-review --live

# Deliberately constrained budget: valid subset plus missing reasons.
uv run --project backend python scripts/create_bedroom_review.py --data-dir .local/render-review --budget 4500

$env:ARCHAI_DATA_DIR='.local/render-review'
npm run dev
# Open the newest Pastel bedroom project; clear ARCHAI_DATA_DIR for normal development.

$env:ARCHAI_HARDWARE_RENDER='1'
npx playwright test e2e/bedroom-baseline.spec.ts e2e/bedroom.spec.ts

# Render the recorded live-model scene without invoking inference in tests.
npx playwright test e2e/bedroom-live.spec.ts
```

The seed script accepts only `.local/e2e` and `.local/render-review`. Automated tests use mocked inference or deterministic placement; the opt-in live script is recorded separately. Backend tests cover lost quantities, room-only and sparse agent responses, bounded budget/unsupported failures, stale completeness, support movement/replacement/removal, and the actual generation endpoint. Browser checks submit the brief through the form, verify 2D counts, actual Three.js bounds/floor contact, GLBs/fallbacks, palette and PBR maps, exact before/after camera position, raycast selection and unchanged JSON. Material lifetime tests protect shared GLB sources. [Screenshots and raw measurements](bedroom/README.md) retain the review evidence.

Official references: [OR-Tools scheduling and optional variables](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/scheduling.md), [Shapely spatial operations and STRtree](https://shapely.readthedocs.io/en/stable/manual.html), and [LangGraph conditional edges](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_conditional_edges).

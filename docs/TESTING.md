# Testing

Run commands from the repository root after the setup in README.

| Command                | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `npm test`             | Frontend geometry unit tests and backend unit/API tests |
| `npm run test:e2e`     | Chromium workflows against the actual local backend     |
| `npm run lint`         | ESLint and Ruff                                         |
| `npm run format:check` | Prettier and Ruff format checks                         |
| `npm run format`       | Apply formatting                                        |
| `npm run typecheck`    | TypeScript checks                                       |
| `npm run build`        | TypeScript checks and frontend production build         |

Install the test browser once with `npx playwright install chromium`. Playwright starts its own API on port 8001 and web server on port 5174. Keep those ports free. Test storage lives in `.local/e2e`, separate from development data, and tests delete their created projects. Browser tests use software rendering so a dedicated GPU is not required for the 3D check.

## Implemented checks

`backend/tests/test_design_knowledge.py` compares all five style profiles at identical 5 × 4 m geometry and budget, checks distinct furniture/finishes/colours, hard filters, original quantities/exclusions, template completeness, agent context and semantic/fallback behavior. Automated semantic tests use mocked vectors; the autouse test environment disables local embedding calls. `e2e/styles.spec.ts` checks the five UI styles and verifies real rendered mesh IDs and colours for Scandinavian and Industrial rooms. The optional `scripts/verify_style_profiles.py --semantic` live check is separate from automated tests and writes isolated evidence without downloading models or touching development projects.

Backend tests cover solver area requirements and impossible requests; geometry and boundary validation; unknown catalogue items; budget and scale errors; idempotent placement; draft/approval isolation; stale writes; persistence; PNG/PDF import and page selection; oversized and invalid file rejection; project deletion; schema rejection of unsafe commands; and validation of mocked structured model output. Marketplace checks cover all 56 mock records, hard filters, semantic ranking within hard filters, material quantities, comparison, replacement, exports, recommendation acceptance/rejection, and cheaper alternatives. Inference/CV checks cover CPU retry, explicit failures, local segmentation-mask contracts, line candidates and bounded correction attempts.

Workspace API tests cover inward door obstruction, furniture/wall intersections, related collision IDs, persisted undo/redo and stale commands, approved snapshot restoration into a candidate, undoable opening edits, mocked AI furnishing with catalogue-only products, replacement pose preservation, and material quantity/cost refresh following wall-height changes.

Frontend unit tests check polygon area, coordinate origins, furniture rotation, wall splits around doors/windows, every procedural furniture part against its stored dimensions, rotation around furniture centres, inward door swings, camera fitting, asset registry provenance/path restrictions, and uniform GLB clone fitting without source mutation. These checks guard shared geometry rather than snapshotting markup.

Browser tests exercise generation, furnishing, object selection, switching to the real 3D canvas, approval, reload, JSON download, invalid placement with discard, infeasible room requests, and reference import/calibration/OpenCV analysis at a narrow viewport. The marketplace browser flow filters and compares products, adds/replaces furniture, selects flooring, verifies material quantities and shopping totals, downloads both export formats, accepts/rejects suggestions, and previews selections in 3D. They do not mock the API.

The four-room workspace flow also drags actual SVG furniture, verifies canonical room geometry remains unchanged, checks undo/redo, assigns a real catalogue material, exercises top/perspective/fit cameras through actual camera completion state, restores an approved snapshot and records 2D/3D screenshots. A separate test supplies an invalid registered GLB response and verifies automatic procedural fallback, one cached load across view switches and no uncaught browser errors. Test assets are intercepted; the project APIs are real.

## Limits and acceptance

`backend/tests/test_bedroom_pipeline.py` covers exact quantities, room-only/sparse agent answers, palette normalization without dropping unsupported preferences, complete metric furnishing, budgets, bounded missing-item correction, support edits and the generation endpoint. `e2e/bedroom-baseline.spec.ts` renders an archived pre-fix scene; `e2e/bedroom.spec.ts` submits the acceptance brief through the real form and checks JSON/2D/actual mesh IDs, catalogue bounds (0.1 mm numerical tolerance for rounded meshes), floor/support contact, material colours/PBR maps, shared camera and selection. The second case exposes budget and unsupported requirements in the Inspector. Browser tests invoke no live models. Comparison evidence is retained under `docs/bedroom`; the explicitly invoked live CLI check is recorded separately in HANDOFF.

`e2e/bedroom-live.spec.ts` additionally renders the recorded live model output and matches every canonical furniture ID and the original comparison camera. It seeds from `docs/bedroom/live-verification.json` using `--recorded-live`; this performs no inference and does not modify the recorded scene. Software screenshots allow 60 seconds for capture, while hardware retains 30 seconds.

The 2026-11-04 rendering milestone has user-approved acceptance checks. `e2e/rendering.spec.ts` seeds the canonical 5 × 4 m office into isolated storage, checks loaded model bounds/floor contact, actual raycast selection, scene JSON and camera continuity, captures all modes, exercises cancellation and checks stable warm GPU resource counts across repeated traces. Its opt-in hardware benchmark measures a real 1920 × 1080 drawing buffer with contact detail both enabled and disabled. Shader compilation is included in quality-render duration, and frame measurements exclude a one-second warm-up. First-use scene map uploads are cached intentionally; repeated render-owned allocations must be released.

Windows/SwiftShader baselines live in `e2e/rendering.spec.ts-snapshots/`: 2D permits 1% differing pixels at a 0.2 per-pixel threshold; interactive 3D permits 1% at 0.25 to tolerate shader noise. Refresh deliberately with `npx playwright test e2e/rendering.spec.ts --update-snapshots` and inspect the images before accepting them. Stochastic progressive frames are captured and checked for geometry/camera consistency instead of requiring identical pixels. Set `ARCHAI_HARDWARE_RENDER=1` to request the high-performance D3D11 adapter; the report records the adapter actually selected. Hardware runs retain a converged 256-sample image; software runs verify an actual sample and cancellation. They invoke no live inference.

The user has not specified a coverage threshold or exhaustive acceptance for the broader research project. The approved rendering milestone does not establish final acceptance for unrelated perception, inference or professional architecture requirements.

Automated tests isolate Ollama requests with valid and malformed mocked LangChain responses; they never download or invoke language models. GPU memory failure is simulated to verify a single CPU retry. Live checks are explicit and separate. A live model smoke test, if performed, is recorded separately in HANDOFF.md. Automated training metrics and dataset benchmarks require an implemented perception pipeline and an approved dataset; they are not represented by the current test suite.

The development dependency audit currently reports moderate transitive minimatch advisories in the lint toolchain. The npm production dependency audit reports no known vulnerabilities at the time of implementation. Do not use forced major dependency overrides without checking compatibility.

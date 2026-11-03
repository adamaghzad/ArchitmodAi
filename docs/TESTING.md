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

Backend tests cover solver area requirements and impossible requests; geometry and boundary validation; unknown catalogue items; budget and scale errors; idempotent placement; draft/approval isolation; stale writes; persistence; PNG/PDF import and page selection; oversized and invalid file rejection; project deletion; schema rejection of unsafe commands; and validation of mocked structured model output. Marketplace checks cover all 52 mock records, hard filters, semantic ranking within hard filters, material quantities, comparison, replacement, exports, recommendation acceptance/rejection, and cheaper alternatives. Inference/CV checks cover CPU retry, explicit failures, local segmentation-mask contracts, line candidates and bounded correction attempts.

Workspace API tests cover inward door obstruction, furniture/wall intersections, related collision IDs, persisted undo/redo and stale commands, approved snapshot restoration into a candidate, undoable opening edits, mocked AI furnishing with catalogue-only products, replacement pose preservation, and material quantity/cost refresh following wall-height changes.

Frontend unit tests check polygon area, coordinate origins, furniture rotation, wall splits around doors/windows, every procedural furniture part against its stored dimensions, rotation around furniture centres, inward door swings, camera fitting, asset registry provenance/path restrictions, and uniform GLB clone fitting without source mutation. These checks guard shared geometry rather than snapshotting markup.

Browser tests exercise generation, furnishing, object selection, switching to the real 3D canvas, approval, reload, JSON download, invalid placement with discard, infeasible room requests, and reference import/calibration/OpenCV analysis at a narrow viewport. The marketplace browser flow filters and compares products, adds/replaces furniture, selects flooring, verifies material quantities and shopping totals, downloads both export formats, accepts/rejects suggestions, and previews selections in 3D. They do not mock the API.

The four-room workspace flow also drags actual SVG furniture, verifies canonical room geometry remains unchanged, checks undo/redo, assigns a real catalogue material, exercises top/perspective/fit cameras through actual camera completion state, restores an approved snapshot and records 2D/3D screenshots. A separate test supplies an invalid registered GLB response and verifies automatic procedural fallback, one cached load across view switches and no uncaught browser errors. Test assets are intercepted; the project APIs are real.

## Limits and acceptance

The user has not specified a coverage threshold or final feature acceptance criteria. The checks above are the implementation's initial verification set; they are not an agreed exhaustive acceptance contract.

Automated tests isolate Ollama requests with valid and malformed mocked LangChain responses; they never download or invoke language models. GPU memory failure is simulated to verify a single CPU retry. Live checks are explicit and separate. A live model smoke test, if performed, is recorded separately in HANDOFF.md. Automated training metrics and dataset benchmarks require an implemented perception pipeline and an approved dataset; they are not represented by the current test suite.

The development dependency audit currently reports moderate transitive minimatch advisories in the lint toolchain. The npm production dependency audit reports no known vulnerabilities at the time of implementation. Do not use forced major dependency overrides without checking compatibility.

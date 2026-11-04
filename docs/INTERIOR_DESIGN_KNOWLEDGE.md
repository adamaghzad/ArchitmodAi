# Interior design knowledge

The five profiles in [the knowledge base](../data/interior_styles.json) are project-authored preferences. They guide the existing Ollama/LangGraph pipeline; Shapely validation, catalogue dimensions, OR-Tools placement, the shared project budget and explicit user requirements remain authoritative. No new inference models, datasets or visual-only furniture are introduced.

## Profiles and room templates

Every profile defines a four-part colour palette, preferred categories and materials, daylight/task/ambient/accent lighting, colour temperature, design characteristics, catalogue affinities, surface preferences and templates for living rooms, bedrooms, offices, kitchens and bathrooms. Bathroom floor eligibility remains ceramic. Source links and a scope note accompany each profile; these are curated interpretations, not universal cultural rules.

| Profile           | Palette direction                          | Furniture/material direction                         | Bedroom emphasis                                                   |
| ----------------- | ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Scandinavian      | Warm white, pale oak, mist, muted green    | Functional timber, linen, cotton, wool               | Bed, wardrobe, two nightstands, reading corner                     |
| Japandi           | Cream, walnut, oatmeal, olive              | Natural wood, linen, ceramic, restrained forms       | Bed, wardrobe, paired nightstands, low bench                       |
| Korean Pastel     | Cream, light oak, blush, sage              | Soft upholstery, rounded accessories, warm light     | Upholstered bed, paired nightstands, vanity/mirror, reading corner |
| Modern Minimalist | Chalk, pale timber, graphite, charcoal     | Compact storage, simple silhouettes, stone/composite | Bed, wardrobe, single bedside unit; fewer accessories              |
| Industrial        | Warm grey, dark timber, muted fabric, rust | Metal, wood, concrete references, exposed shelving   | Bed, wardrobe, open bookshelf, task lighting                       |

Templates classify quantities as essential, desired or optional. They do not promise every product exists or fits. Existing saved styles remain aliases: Warm minimal → Japandi, Pastel → Korean Pastel, Contemporary → Modern Minimalist. Canonical style selections win over contradictory style words in the prompt. The legacy Warm minimal default still recognizes an explicit pastel brief.

## Agent and scene integration

1. Requirements retrieves the selected profile before model extraction. Its structured prompt requests explicit requirements only. Deterministic guards preserve recognizable quantities, supported colour/material aliases and exclusions when the model returns a sparse answer. Known profile finish terms echoed by the model are retained as preferences when absent from the original prompt; this demotion is traced. Explicit requirements are persisted separately from template suggestions.
2. The actual solved room types retrieve their templates. Explicit role quantities and exclusions override matching template slots. The original prompt, profile ID/revision, template slots and exclusions stay in `Scene.design_brief`.
3. Furniture retrieves the room profile and ranks eligible stored products before agent advice. Essential furnishing precedes optional decoration. Model advice contributes a small preference; it cannot discard original quantities or restrict the solver to a sparse list of IDs.
4. Materials receives the same room profile and explicit brief. Finish selection uses real purchase-unit quantities and remaining shared MAD budget. Existing surface assignments are preserved. Furniture fabric/wood tints and actual lamp colour enter canonical scene JSON and the existing Three.js material/light components; floor selections also update the 2D room colour.
5. Validation derives completeness from current scene IDs, explicit requests and the applicable room template. It reports reasons for missing products, insufficient budget, dimension ineligibility and unsuccessful bounded placement. User exclusions/template quantity overrides are labelled as overrides. Preferred materials, palette coverage and lighting are reported separately as soft preferences. Geometry approval and requirement completeness remain distinct.

The existing instruction/recommendation agents use the same profiles and soft ranking. A style without an exact legacy catalogue tag no longer produces an empty hard-filtered product pool. Room eligibility, actual dimensions, remaining cost and final geometry checks still apply.

`GET /api/design-styles` exposes validated profiles to both style selectors. The Inspector displays explicit-request status, template comparison, missing reasons, style coverage, budget and geometry. Structured `profile_retrieval` events record the profile revision, semantic status and each candidate's score components. Rendering remains separately verified through actual mesh IDs, not inferred from placement success.

## Product ranking

Eligibility first checks room use, dimension fit in either orientation and remaining budget including current furniture and finish quantities. Placement subsequently checks real room polygons, walls, doors, windows, collisions and the existing circulation rule; a ranking score never grants geometric validity.

Eligible products combine style compatibility (45%), dimension economy (20%), remaining budget (15%) and semantic cosine similarity (20%). Style compatibility combines existing catalogue tags, materials and curated product affinities. Surface preferences and bathroom constraints are room specific. The solver considers at most three products per slot, retaining an affordable alternative alongside the leading style candidates. Bed anchoring first reserves a lower-bound cost for other outstanding essentials. The solver retains its bounded correction cycle; it can still miss a feasible manual arrangement.

Semantic ranking uses the already configured `embeddinggemma:latest` through the existing Ollama embedding adapter, inference lock and CPU retry. Cached catalogue embeddings and one cached query per style/room/brief serve all furnishing roles. No model pull is performed. Scores and query caches are keyed by endpoint/model; malformed responses or unavailable models produce an explicit `fallback` event and reweight the other three criteria. `use_semantic: false` and `ARCHAI_EMBEDDINGS_ENABLED=false` support deterministic/offline operation. Automated tests disable live embeddings; mocked vectors test that similarity changes ranking without admitting oversized, incompatible or over-budget products.

## Verification and review

`backend/tests/test_design_knowledge.py` compares the same 5 × 4 m bedroom and 30,000 MAD budget across all five profiles. It requires five distinct furniture sets and colour treatments, at least four finish combinations, unchanged room polygons, valid geometry and costs within budget. Other checks cover all templates/aliases, explicit single-bed size/quantities/exclusions, agent profile context, embedding fallback and missing-item reasons under a restricted budget.

`e2e/styles.spec.ts` checks the five UI choices and renders Scandinavian and Industrial bedrooms through the real backend and Three.js. It compares actual mesh IDs, furniture colours, scene dimensions and finish/product differences at the same default isometric preset. Artifacts are written to `test-results/style-profiles`.

Retained review images: [Scandinavian](style-profiles/scandinavian.png) and [Industrial](style-profiles/industrial.png), with a 1440 × 1000 browser viewport and the same 5 × 4 m room and isometric preset. The accompanying JSON files record canonical scenes, validation/completeness and actual rendered mesh IDs.

For an intentional local-model review, run:

```powershell
uv run --project backend python scripts/verify_style_profiles.py --semantic
```

Without `--semantic`, the script uses deterministic ranking. It writes isolated review evidence under `.local/style-review`, invokes the existing workflow and fails on geometry/budget errors or, when explicitly requested, an embedding fallback. It does not create or modify development projects. See HANDOFF for the checks actually completed in this session.

## Design references

- [IKEA: Scandinavian style](https://www.ikea.com/us/en/ideas/styles/scandinavian/) informed light, functional natural-material preferences.
- [MUJI: Japandi style](https://www.muji.us/products/japandi-style-when-japanese-and-scandinavian-designs-blend) informed restrained forms and natural textures.
- [IKEA: Industrial style](https://www.ikea.com/be/en/ideas/styles/industrial/) informed timber/metal contrasts and local lighting.
- [IKEA: Modern minimalist interiors](https://www.ikea.co.id/en/inspirations/tips-modern-minimalist-interior-design) informed compact functional furnishing and restrained palettes.
- [Samsung Design: Bespoke](https://design.samsung.com/kr/contents/bespoke/) is a Korean colour-design inspiration; the pastel room profile is an original ArchAI Studio mood, not a claim about a standardized Korean style.
- [Google: EmbeddingGemma model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card) documents the existing semantic model. No additional weights were downloaded.

The profiles contain original descriptions and preferences, not copied furniture assets. Existing asset provenance/licences and illustrative catalogue prices are unchanged. A small catalogue limits stylistic range; a style preference cannot invent a suitable product or alter its metric dimensions.

## Recorded local checks

The isolated [live embedding review](style-profiles/live-embedding-review.json) used the installed `embeddinggemma:latest`, returned 768-dimensional vectors and completed every template at the same 5 × 4 m dimensions and 30,000 MAD budget. Figures below include integral features such as the vanity mirror; they are illustrative catalogue costs.

| Profile           | Items/features | Furniture objects | Floor / wall IDs              | Total MAD |
| ----------------- | -------------- | ----------------- | ----------------------------- | --------- |
| Scandinavian      | 10/10          | 10                | light_floor / white_paint     | 15,120    |
| Japandi           | 8/8            | 8                 | oak_floor / warm_paint        | 13,590    |
| Korean Pastel     | 13/13          | 12                | pastel_oak_floor / warm_paint | 16,320    |
| Modern Minimalist | 5/5            | 5                 | grey_floor / white_paint      | 9,730     |
| Industrial        | 6/6            | 6                 | grey_floor / clay_paint       | 12,610    |

An independent [live agent review](style-profiles/live-agents.json) used local Requirements/Furniture/Materials `qwen3.5:4b`, Design `Qwen3:8b` and EmbeddingGemma. Its explicit six-item Industrial brief completed in 64.9 seconds with valid geometry, 12,850 MAD cost and no agent fallbacks. The first live attempt exposed profile-derived finishes being treated as explicit requests; the corrected run records success. These are intentional live checks, separate from automated tests; they did not create development projects or download weights.

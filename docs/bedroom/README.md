# Pastel bedroom pipeline review

The comparison uses the same 5 × 4 m footprint, openings, isometric camera and 1920 × 1080 browser viewport. The drawing buffer is 1295 × 612. The numeric camera positions match exactly in [before verification](before-verification.json), [form verification](verification.json) and [live-scene rendering](live-render-verification.json).

[Before](before.png) · [After: live AI scene](after-live.png) · [Deterministic form-based comparison](after.png) · [2D plan](plan.png)

The before image reproduces the old furnishing pipeline using the acceptance brief and an archived scene generated at commit `e72286b`. It is a reproducible baseline, rather than a reconstruction of the user's screenshot from pixels. The older saved bedroom on this computer used the default 8 × 6 m footprint with five products and no selected finishes; the original prompt had not been persisted. Development projects were inspected read-only and remain unchanged.

| Check                                  | Before reproduction         | After                                        |
| -------------------------------------- | --------------------------- | -------------------------------------------- |
| Furniture scene objects                | 4                           | 12                                           |
| Requested items/features accounted for | No report                   | 13 / 13                                      |
| Selected room finishes                 | None                        | Light oak floor, warm cream paint            |
| Sample estimate                        | 7,200 MAD                   | 16,320 / 20,000 MAD                          |
| Geometry                               | Valid under declared checks | Valid under declared checks                  |
| Bedside lamps                          | Small lamp on floor         | Two lamps mounted on separate bedside tables |

The final scene contains an upholstered double bed, two bedside tables, a vanity with integral mirror, wardrobe, reading chair, bookshelf, rug, two lamps and two plants. The integral mirror satisfies a separate feature requirement without creating a disconnected object. All twelve canonical furniture IDs were found in actual Three.js mesh groups; three use existing CC0 GLBs. Actual mesh colours include blush `#d9aeb6` and sage `#9baa95`. The floor material has the selected catalogue colour and loaded PBR normal/roughness maps. Raycast bed selection and unchanged 2D/3D scene JSON passed. Rounded geometry bounds allow 0.1 mm numerical tolerance.

The live Requirements/Design/Furniture/Materials run completed in 62.4 seconds with all furniture, finishes and geometry checks satisfied. Its exact [canonical output](live-verification.json) was then loaded into the application without another inference call, and all twelve IDs were verified against actual meshes using the same comparison camera. The live after image and [render evidence](live-render-verification.json) therefore show model-generated output, separately from the deterministic form test.

The hardware browser run measured **60 FPS**, p95 approximately **18 ms**, at **1295 × 612**, on ANGLE Direct3D 11 / NVIDIA GeForce RTX 5060 Laptop GPU. Conditions: headless Chromium, Vite development server, stationary isometric camera, five seconds of continuous frames with the first second excluded. This is an application viewport measurement, not a 1080p bedroom benchmark or a larger-scene guarantee. Raw conditions, bounds, selected products, placement trace, budget and geometry are retained in [verification.json](verification.json). The independent [software render check](software-verification.json) verifies functionality and is not an RTX performance result.

The main implementation and limits are documented in [BEDROOM_PIPELINE.md](../BEDROOM_PIPELINE.md). Verification command outcomes and the separately recorded live Ollama check are maintained in [HANDOFF](../../HANDOFF.md).

The renderer remains an architectural visual proxy. Some shapes and fabrics remain procedural; the mirror reflects the environment rather than a full planar room reflection. Window panes use an illustrative daylight gradient, not a site-specific outdoor view. Circulation uses the configured 0.6 m assumptions and does not certify regulations. The finite solver may report that no placement was found even when a different manual arrangement would fit.

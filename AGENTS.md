# Repository guidance

Read these files before starting work:

1. [Development rules](DEVELOPMENT_RULES.md): user instructions and engineering practices.
2. [Project context](CONTEXT.md): source material, known facts, and unresolved decisions.
3. [Handoff](HANDOFF.md): completed work, verification, and pending questions.

Read [the project PDF](ArchAI_Project_Documentation.pdf) before implementing related requirements. The user's explicit instructions take precedence over the PDF.

Keep changes within the requested scope. Use the project name without release labels in names, headings, and deliverables. This naming preference does not change the PDF's feature scope.

Record new agreed rules in DEVELOPMENT_RULES.md and keep this reference current. Update CONTEXT.md when requirements or decisions change, and HANDOFF.md before handing work back. Distinguish proposals, confirmed decisions, and implemented behavior.

Use [README.md](README.md) for setup and commands, [architecture](docs/ARCHITECTURE.md) for scene/inference boundaries, and [testing](docs/TESTING.md) for verification. Run `npm test`, `npm run lint`, `npm run format:check`, `npm run test:e2e`, and `npm run build` for implementation changes that affect the full workflow. Keep tests isolated from development data and live inference; record intentional live-model checks separately.

The current rendering and workspace requirements are recorded in [workspace upgrade](docs/WORKSPACE_UPGRADE.md). Preserve metric geometry and catalogue provenance while improving appearance; optional assets require source/license metadata and a procedural fallback.

The latest approved licensed-rendering milestone and reproducible Japandi office review are recorded in [interior rendering](docs/RENDERING.md). Preserve the existing scene JSON and unrelated backend workflows, and keep performance claims tied to measured adapter, resolution and conditions.

The subsequent bedroom pipeline repair is recorded in [bedroom generation](docs/BEDROOM_PIPELINE.md). Preserve the original brief/quantities, per-item completeness reasons, bounded correction and the distinction between canonical placement and actual browser rendering evidence.

The style knowledge base is documented in [interior design knowledge](docs/INTERIOR_DESIGN_KNOWLEDGE.md). Profiles are preferences; explicit requirements, catalogue provenance, geometry and the shared budget are authoritative. Keep automated tests independent of live embedding/model calls.

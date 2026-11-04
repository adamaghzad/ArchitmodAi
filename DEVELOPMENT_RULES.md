# Development rules

## Interior design knowledge requirements — 2026-11-04

The user requested five structured profiles: Scandinavian, Japandi, Korean Pastel, Modern Minimalist and Industrial. Each must include palettes, preferred categories/materials, lighting, characteristics and room templates, connected to Requirements, Furniture and Materials before catalogue selection. Rank using style, dimensions, budget and the existing EmbeddingGemma model; prioritize essential furniture, preserve explicit requirements and hard geometry, and report all missing requested/template items with reasons. Retain Ollama, LangGraph, Shapely, OR-Tools and Three.js. Do not download new models or large datasets. Test meaningful furniture/material/colour differences at identical room dimensions.

These rules record the user's instructions from 2026-11-03.

## Scope and clarification

- Do only the requested work. Do not add unsolicited features, redesigns, dependencies, or refactors.
- Begin new work with open questions that establish the intended outcome, requirements, constraints, and acceptance criteria. Read available project material first so questions are informed.
- Ask about consequential ambiguity before implementing dependent work. Do not invent requirements or silently make product decisions.
- Use the project name without release labels in names, headings, and deliverables. On 2026-11-03, the user clarified that the concern was naming. Do not infer feature additions, exclusions, or restrictions on development phases from that preference. Leave the source PDF unchanged unless asked to edit it.

## Engineering

- Apply senior engineering judgment and common coding practices. Follow KISS: prefer simple, clear, elegant solutions over complicated designs.
- Use clear names, cohesive functions, and explicit data flow. Introduce abstractions only when the requested behavior warrants them.
- Follow established repository conventions when they exist.
- Consult official documentation for APIs, configuration, compatibility, and technical decisions. Verify behavior against the versions actually used by the project.
- If something is unknown, look it up in official sources or ask. Do not invent APIs, commands, capabilities, results, or citations.

## Verification

- Use meaningful unit tests for implemented logic, including relevant failure and boundary cases.
- Use end-to-end tests for implemented user workflows and their important failure paths.
- Specific test acceptance criteria are undecided, as confirmed by the user on 2026-11-03. Establish relevant criteria for the requested feature before implementing it; do not invent a coverage threshold or present proposed criteria as agreed.
- Use linters and formatters appropriate to the confirmed stack. Record actual commands once configured; do not present suggested commands as available tooling.
- Run relevant tests, lint checks, and formatting checks before handing off implementation changes.
- Report what ran, what passed or failed, and what could not be checked. Never claim a check passed without running it.

## Durable documentation

- Keep CONTEXT.md current with confirmed requirements, decisions, source references, and unresolved questions.
- Keep HANDOFF.md current with completed work, changed files, verification results, and the next requested action or pending clarification.
- Add new agreed rules here, with their date and source when useful. Keep this file referenced from AGENTS.md.

## Local inference and catalogue constraints

The user supplied these requirements on 2026-11-03 while authorizing implementation.

- Run locally on Windows first: 32 GB RAM, NVIDIA RTX 5060 with 8 GB VRAM, and Ollama at a configurable local endpoint. Do not introduce hosted inference.
- Use React, TypeScript, Three.js, FastAPI, LangGraph, LangChain, and Ollama consistently with the project brief.
- Configure endpoints and role-specific models through `.env`. Defaults: `qwen3.5:4b` for requirements, supervisor, furniture and materials; `qwen3:8b` for design and correction; `llava:latest` for experimental vision; `embeddinggemma:latest` for semantic retrieval, with `nomic-embed-text:latest` as an available alternative.
- Serialize model calls to respect VRAM limits, and support CPU fallback for insufficient GPU memory. Do not automatically download additional large models.
- Provide an OpenCV perception pipeline and an interface for a future locally trained segmentation model. Do not download CV weights automatically.
- Begin with approximately 50 JSON sample furniture/material records suitable for later database migration. Mark every invented product, price, and availability as `mock_data`.
- Keep prices in MAD. Product dimensions, coverage, prices, and source provenance come from stored records. Do not invent commercial product URLs or claim verified stock/prices for samples.
- Prepare configurable providers for authorized IKEA Morocco, KITEA, and Bricoma feeds. Do not automatically scrape retailer websites or download large furniture libraries.
- Keep the marketplace integrated with the design, geometry checks, budget, recommendations, and shopping list. Support comparison, replacement, reviewable suggestions, and PDF/CSV export.
- Seller accounts, checkout, payments, order processing, shipping operations, inventory management, ratings, and real-time stock synchronization are outside the requested marketplace scope.

## Workspace rendering upgrade

On 2026-11-03 the user supplied the detailed upgrade brief summarized in [WORKSPACE_UPGRADE.md](docs/WORKSPACE_UPGRADE.md), with explicit acceptance criteria. Preserve the current architecture, scene contracts, data and APIs while improving the actual interactive renderers. Use the supplied forest-green references. Prefer lightweight procedural furniture/materials; optional local models require a reusable loader and central registry with source/license metadata. Do not stretch furniture to fit rooms, introduce disconnected scene objects, download large asset libraries, add paid APIs, or present unsupported controls as functional.

## Licensed interior rendering

On 2026-11-04 the user requested the rendering milestone in [RENDERING.md](docs/RENDERING.md) and approved checks for licensed loading/fallback, catalogue bounds, daylight materials, selection and 2D/3D synchronization, and a shared-camera high-quality mode. The final acceptance scene is a 5 × 4 m modern Japandi home office with walnut desk, ergonomic chair, bookshelf/books, upholstered reading chair, side table, rug, two windows, entrance door and warm secondary lighting. Preserve catalogue dimensions, floor contact, door clearance and basic circulation. Include isometric and eye-level cameras, loading progress/cancellation where supported, actual rendering screenshots and measured FPS with conditions. Approximately 60 FPS at 1080p and 30–60 FPS in complex rooms are targets, not guarantees. Use verified licenses and retain source, author and attribution metadata. Download only individual curated assets, never large collections automatically. Keep unrelated LangGraph workflows, marketplace behavior and project generation outside the change. Prioritize furniture/materials, lighting, then optional path tracing. Preserve pre-existing uncommitted backend work.

## Bedroom completeness and style

On 2026-11-04 the user requested investigation and repair of the entire prompt → Requirements/Design/Furniture agents → placement → validation → scene JSON → Three.js pipeline for an incomplete pastel bedroom. Preserve LangGraph, local Ollama and the current renderer. Retain requested furniture quantities and palette, prioritize essentials, report every unsatisfied requirement with a reason, and attempt bounded correction before returning missing required furniture. Use metric collision/door/circulation checks rather than random filling. Verify actual rendered objects against JSON, log stage outcomes, and provide same-camera before/after screenshots of a 5 × 4 m bedroom. The requested set and implementation are recorded in [bedroom pipeline](docs/BEDROOM_PIPELINE.md). The existing 20,000 MAD default is used for the acceptance example; it is an implementation assumption, not a newly confirmed user budget.

## Initial Git history

On 2026-11-03 the user requested that all project changes be recorded in exactly 81 commits with professional, descriptive messages, together with README setup/model instructions. This count applies to the initial check-in task. Keep local settings, generated artifacts and installed dependencies ignored. This request authorizes local commits; it does not request a remote push.

## Rendering delivery history

On 2026-11-04 the user explicitly requested exactly 50 additional, professionally named commits and a remote push. This delivery includes all pending renderer, asset, test, documentation and pre-existing backend changes. Preserve the existing history and Git identity; use descriptive Conventional Commit messages, exclude local settings/data/dependencies, and push `main` to the configured `origin` without force.

## Bedroom and knowledge base delivery

On 2026-11-04 the user requested committing and pushing the subsequent pending changes in different commits. Group this delivery by cohesive backend, renderer, workspace, tests and documentation concerns; no fixed commit count was requested for this delivery. Preserve existing history and Git identity, exclude local configuration/data/test artifacts, and push the existing branch to `origin` without force.

# Development rules

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

## Initial Git history

On 2026-11-03 the user requested that all project changes be recorded in exactly 81 commits with professional, descriptive messages, together with README setup/model instructions. This count applies to the initial check-in task. Keep local settings, generated artifacts and installed dependencies ignored. This request authorizes local commits; it does not request a remote push.

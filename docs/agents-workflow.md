# How the agents built this

Prototype 1 was written by 11 scoped AI coding agents (numbered 0–10) working in parallel. Two things made the parallel work possible. First, a **frozen contract**: shared types in `src/physics/types.ts` and function signatures in [AGENTS.md](../AGENTS.md). Second, **strict file ownership**. The rules and ownership table live in AGENTS.md; this page summarises them.

## Who did what

| Phase | Agent | Role | Delivered |
|---|---|---|---|
| 0 | 0 | Architect / Integrator | Scaffold, contract, constants, units, CI and deploy workflows, AGENTS.md |
| 1 (parallel) | 1 | Star | Luminosity, flux, star presets |
| | 2 | Orbit | Kepler's laws, orbit sampling |
| | 3 | Climate | Gravity, T_eq, one-layer greenhouse, Earth calibration |
| | 4 | Water & Tides | Water phase, tides, tidal-locking indicator |
| | 5 | Habitability | Five checks, Kopparapu HZ, `thresholds.json` |
| | 6 | Data | NASA archive query, parser, snapshot script |
| | 7 | UI | Mobile UI, SVG orbit, PWA (built on mocks) |
| 2 | 8 | Pipeline | `simulate()`, real-planet rule, UI switched to the real engine |
| | 9 | Validation (independent) | `validation/` tests and report, written without the physics authors |
| | 10 | Science review / Docs | README, ASSUMPTIONS, CHANGELOG, `docs/` |

## Dependency flow

```
Agent 0 (contract)
   ├── Agents 1–4 (physics) ──► Agent 5 (habitability) ──┐
   ├── Agent 6 (data) ───────────────────────────────────┤
   └── Agent 7 (UI, on mocks) ───────────────────────────┤
                                                         ▼
                       Agent 8 (integration) ► Agent 9 (validation) ► Agent 10 (docs)
```

Agents 1–7 could start at once because each one coded against the contract, not against each other's code. Agent 0 created stubs for every module first. The UI used `src/ui/mock.ts` until Agent 8 changed the export lines in `src/ui/engine.ts`, which is the single seam between the UI and the engine.

## Running the next iteration

1. **Choose the change.** Good candidates are in [ASSUMPTIONS.md → Known scientific concerns](../ASSUMPTIONS.md#known-scientific-concerns) and the items marked **needs human verification**.
2. **Does it change the contract?** If a type in `types.ts` or a signature in AGENTS.md must change, start with Agent 0 and freeze the new contract first.
3. **Write each agent's prompt** from its row in AGENTS.md:
   - its role
   - the files it owns (and "edit nothing else")
   - its frozen inputs and outputs
   - the ground rules
   - the tests it must add

   Example: *"You are Agent 4. You own `src/physics/water.ts` and `tests/unit/water.test.ts` only. Replace `thresholdModel` with a Clausius–Clapeyron saturation-curve model behind the existing `PhaseModel` interface. Keep `waterPhase()`'s signature. Add tests against steam-table boiling points at 0.1, 1 and 10 bar."*
4. **One agent per file set.** Two agents never edit the same file. Anything needed outside its files goes in its report.
5. **Tests gate merges.** Nothing is merged until `npm run typecheck` and `npm test` pass. You run them yourself; don't just trust the agent's report. CI runs the same checks on every pull request.
6. **Validate independently.** Agent 9 must not be the agent that wrote the physics, so the two don't share the same mistakes.
7. **Document.** Agent 10 updates ASSUMPTIONS.md (equation, source, status) and adds a CHANGELOG entry for every model change. If a value's status changes, `thresholds.json` must be updated to match.
8. **Commit per module**, with the agent number in the message (for example `Agent 4: …`), so `git log` shows who changed what.

The key rule for every iteration: **no LLM in the physics path**. Agents write code; the code, not an AI, computes the results.

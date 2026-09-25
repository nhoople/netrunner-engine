# Netrunner engine (v0)

Hand-authored TypeScript rules engine scaffold for Android: Netrunner. It is **not** a Comprehensive Rules → AST compiler and not a full card-effect DSL.

Depends on [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data) pinned to tag **`v26.03`**.

## Requirements

- Node.js 20+

## Setup

```bash
npm install
npm run fetch-cr   # downloads pinned CR JSON into vendor/cr-data/
npm test
npm run demo                 # decline-rez empty remote slice
npm run demo:ice-break       # rez + Crowbar break → success
npm run demo:ice-etr         # rez + unbroken ETR → unsuccessful
npm run demo:pump-break      # Bastion + pump Crowbar → break both subs
npm run demo:multi-sub-etr   # Bastion unbroken: gain ¢ then ETR
npm run demo:fortify-pump    # approach fortify + encounter pumps
npm run demo:pulse-needle    # net damage + tag via effect IR
npm run demo:scrap-code      # trash program + ETR via effect IR
npm run cli                  # interactive action stepper
```

## CR pin (`v26.03`)

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cr-pin.json`](data/cr-pin.json) — tag, repo, raw GitHub base URL, file list |
| Fetch script | [`scripts/fetch-cr-data.mjs`](scripts/fetch-cr-data.mjs) — `npm run fetch-cr` |
| Vendored files | `vendor/cr-data/` (`index.json`, `timing-structures.json`, `nodes.json`, `PIN.json`) |

Engine host code cites CR **numbers** and stable **ids**. Tests resolve numbers through the pinned `index.json`.

## Effect IR (minimal)

Hand-authored AST for stub cards only (`src/effects/`) — **not** compiling `nodes.json`.

```text
Effect ::= seq [Effect…]
         | do Primitive
         | if Cond then Effect [else Effect]
         | prevent jack_out

Primitive ::= end_the_run
            | gain_credits {side, amount}
            | pump_strength {amount}
            | fortify_ice {amount}
            | net_damage {amount}
            | give_tags {amount}
            | trash_program {pick: first}
```

Subroutines, paid abilities, and `onRez` continuous effects are expressed as `Effect` trees and evaluated by `evalEffect`.

## What v0 does

- Game state: clicks, credits, tags, zones, servers, ice/root skeleton
- Timing step graph (11.2–11.5) with appendix labels
- `queryLegality` / `explainAction`, checkpoints, cannot stubs
- Run ice: rez, break, multi-sub resolve, jack-out
- Strength pump / fortify via IR paid abilities
- Encounter effects via IR: net damage (10.4), tags (10.5), trash program (1.19.1)

Stub cards: Static Wall, Lockdown Wall (`onRez` prevent), Bastion, **Pulse Needle**, **Scrap Code**, Crowbar.

## What v0 does not do

- UI / multiplayer / networking
- Full card pool or NetrunnerDB integration
- Compiling `nodes.json` into executable behavior
- Traces, meat/brain damage distinction, flatline, agenda scoring
- Runner damage prevention / choice UI (net damage auto-trashes from grip)
- Targeted trash (always first installed program)
- Full nested priority-pass loops

## Layout

```
src/
  effects/         # IR types + evaluator
  cards/stubs.ts
  timing/
  legality/
  actions/apply.ts
  demo/verticalSlice.ts
  …
tests/
  effect-ir.test.ts
  deeper-run.test.ts
  …
```

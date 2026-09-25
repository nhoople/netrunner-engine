# Netrunner engine (v0)

Hand-authored TypeScript rules engine scaffold for Android: Netrunner. It is **not** a Comprehensive Rules → AST compiler and not a card-effect DSL.

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
npm run cli                  # interactive action stepper
```

## CR pin (`v26.03`)

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cr-pin.json`](data/cr-pin.json) — tag, repo, raw GitHub base URL, file list |
| Fetch script | [`scripts/fetch-cr-data.mjs`](scripts/fetch-cr-data.mjs) — `npm run fetch-cr` |
| Vendored files | `vendor/cr-data/` (`index.json`, `timing-structures.json`, `nodes.json`, `PIN.json`) |

Raw URL form (same pin):

`https://raw.githubusercontent.com/nhoople/netrunner-comprehensive-rules-data/v26.03/data/index.json`

Engine host code cites CR **numbers** and stable **ids** (e.g. `5.2.6b` / `rule_corp_basic_action_credit`). Tests resolve numbers through the pinned `index.json`.

## What v0 does

- Game state: clicks, credits, zones/hand/deck, central + remote servers, ice/root skeleton
- **Explicit timing step graph** (`src/timing/graph.ts`) for Corp turn (11.2), Runner turn (11.3), run (11.4), and breach (11.5) — each node labeled with appendix `stepId` / `stepNumber` from pinned `timing-structures.json`
- Cursor is a graph key (`timingKey`); `pass` / `auto` / `branch` / `action` / `discard` / `access` kinds drive advances
- Action legality gated by the current graph window; `queryLegality` / `explainAction` with CR cites
- Cost / priority checkpoints (1.16.3 / 9.2.4) and cannot stubs (1.2.2)
- Run ice: rez, encounter break, multi-sub resolve (gain credits + ETR), jack-out
- Icebreaker **strength pump** and Corp **fortify** via minimal `use_paid_ability` in PAW windows (9.5)
- Pure `applyAction(state, action)` / `legalActions(state)` API
- CLI stepper + demos

## Timing model

```text
corp.gainClicks → (auto PAW/recurring/begin) → corp.mandatoryDraw
  → corp.actionPaw → corp.checkClicks ⇄ corp.takeAction
  → corp.actionPhaseEnd → corp.discard → … → corp.turnComplete
→ runner.gainClicks → (auto) → runner.actionPaw ⇄ runner.takeAction → …
→ on basic_run: walk run.* graph (approach → encounter → movement → success → breach.*)
```

Paid-ability windows: **approach PAW** (11.4_2_b) allows `rez_ice`, Corp `fortify`, or pass; **encounter PAW** (11.4_3_b) allows `use_paid_ability` (pump), `break_subroutine`, or pass — unbroken subs resolve in order; **jack-out** (11.4_4_c) allows `jack_out` or continue.

Stub cards: **Static Wall** (barrier, 1× ETR), **Lockdown Wall** (cannot jack out), **Bastion** (str 3; gain 2¢ then ETR; fortify), **Crowbar** (fracter + pump).

## What v0 does not do

- UI / multiplayer / networking
- Full card pool or NetrunnerDB integration
- Compiling `nodes.json` into executable behavior / full ability DSL
- Traces, damage, tags, agenda scoring, full nested priority-pass loops
- Complete discard choices, mulligans, or win conditions
- Paid abilities beyond the hardcoded pump / fortify / gain_credit effects

## Layout

```
data/cr-pin.json
scripts/fetch-cr-data.mjs
vendor/cr-data/
src/
  state/
  timing/          # graph + machine + CR labels
  cards/stubs.ts   # Static Wall, Lockdown, Bastion, Crowbar
  legality/        # queryLegality, explainAction, checkpoints
  actions/apply.ts
  demo/verticalSlice.ts
  cr/load.ts
  cli.ts
  index.ts
tests/
```

## Library sketch

```ts
import {
  createInitialState,
  applyAction,
  queryLegality,
  explainAction,
  CR,
} from "netrunner-engine";

let state = createInitialState();
state = applyAction(state, { type: "pass_window" }).state!;
const view = queryLegality(state);
const why = explainAction(state, { type: "basic_gain_credit" });
```

### Legality + checkpoints API

| Function | Role |
|----------|------|
| `queryLegality(state)` | Snapshot: window, priority, legal actions with actors/cites, checkpoints, restrictions |
| `legalActions(state)` | Flat `Action[]` (CLI / demos) |
| `explainAction(state, action)` | Legal/illegal + reason + CR cites |
| `isActionLegal(state, action)` | Boolean |
| Cost / priority checkpoints | Rez/break/paid-ability spend (`1.16.3`); PAW close (`9.2.4` / `9.11.1b`) |
| Cannot | `restrictions` + `run.cannotJackOut` (Lockdown Wall) cite `1.2.2` |
| Paid abilities | `use_paid_ability` with effects `pump_strength` / `fortify_ice` / `gain_credit` |

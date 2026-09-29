# Netrunner engine

Hand-authored TypeScript **rules engine library** for Android: Netrunner. It is **not** a Comprehensive Rules → AST compiler and not a networked game client.

**Repo:** [github.com/nhoople/netrunner-engine](https://github.com/nhoople/netrunner-engine)

Depends on:

- [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data) pinned to tag **`v26.03`**
- [netrunner-cards-data](https://github.com/nhoople/netrunner-cards-data) pinned to tag **`v1.35.0`**

### Cards ↔ engine pairing

Match **cards-data** and this engine by the **same semver tag**. Pin a **release tag**, not `master`.

| Pairing | cards-data | engine |
|---------|------------|--------|
| **Current** | [`v1.35.0`](https://github.com/nhoople/netrunner-cards-data/releases/tag/v1.35.0) | [`v1.35.0`](https://github.com/nhoople/netrunner-engine/releases/tag/v1.35.0) (Uprising kickoff **3/65** in-progress; VP **66/66** supported) |
| Vantage Point milestone | [`v1.33.0`](https://github.com/nhoople/netrunner-cards-data/releases/tag/v1.33.0) | [`v1.33.0`](https://github.com/nhoople/netrunner-engine/releases/tag/v1.33.0) |
| Elevation milestone | [`v1.12.0`](https://github.com/nhoople/netrunner-cards-data/releases/tag/v1.12.0) | [`v1.12.0`](https://github.com/nhoople/netrunner-engine/releases/tag/v1.12.0) (Elevation **82/82** supported) |
| RWR milestone | [`v1.00.0`](https://github.com/nhoople/netrunner-cards-data/releases/tag/v1.00.0) | [`v1.00.0`](https://github.com/nhoople/netrunner-engine/releases/tag/v1.00.0) (RWR **65/65** supported) |

Declared pin: [`data/cards-pin.json`](data/cards-pin.json) (`npm run fetch-cards`). Incremental wave tags are the day-to-day IR/wiring contract. A set-complete **milestone** GitHub Release is cut only when a wave’s pool status → `supported` (advertised host floor for that set). Maintenance / quality tags (e.g. `v1.34.0`) still publish GitHub Releases when consumers should pin past a prior milestone.

## Requirements

- Node.js 20+

## Setup (consumers & contributors)

Pin story for a clean checkout:

1. **Declare** pins in [`data/cr-pin.json`](data/cr-pin.json) (CR tag) and [`data/cards-pin.json`](data/cards-pin.json) (cards-data tag) — always a **release tag**, never `master`.
2. **Fetch** into gitignored `vendor/` (CI and local tests both need this).
3. **Run** tests or development hosts that call the library API.

```bash
npm install
npm run prepare-data         # npm run fetch-cr && npm run fetch-cards → vendor/
# or separately:
npm run fetch-cr             # pinned CR JSON → vendor/cr-data/
npm run fetch-cards          # pinned card JSON → vendor/cards-data/
npm run lint                 # eslint (recommended ruleset)
npm run typecheck            # tsc --noEmit
npm test                     # vitest; needs both vendor trees
```

CI runs `lint`, `typecheck`, and `test` on every PR. Fix only what those surface — no separate Prettier pass.

If the cards-data GitHub tag is not yet published, `fetch-cards` falls back to a local checkout at `../netrunner-cards-data`, `/home/ubuntu/repos/netrunner-cards-data`, or `$CARDS_DATA_ROOT`.

### Development hosts (CLI / demos)

Hosts are thin scripts over `createGame` / `queryLegality` / `applyIntent` / `getPublicView`. They are **not** a game client (no UI/network).

```bash
npm run cli:help             # usage + pin/fetch reminder
npm run demo:library         # host loop: createGame → legality → applyIntent → getPublicView
npm run demo                 # decline-rez empty remote (stopAfterFirstCycle)
npm run demo:ice-break       # rez Ice Wall + Marjanah break → success
npm run demo:ice-etr         # rez + unbroken ETR → unsuccessful
npm run demo:pump-break      # Palisade (remote) + pump Marjanah → break
npm run demo:multi-sub-etr   # Hortum unbroken: gain ¢ then ETR
npm run demo:fortify-pump    # Palisade remote strength + pump past it
npm run demo:tithe           # Tithe: net damage + Corp gains ¢
npm run demo:rototurret      # Rototurret: trash program + ETR
npm run cli                  # interactive stepper (number / state / view / quit)
```

## Library API (headless)

Pure functions only — no sockets, HTTP, or UI in this package. This is the stable surface a future online Project should consume:

| Function | Role |
|----------|------|
| `createGame(options?)` | New game (`stopAfterFirstCycle: false` by default) |
| `queryLegality(state)` | Legal intents + window / priority / cites |
| `applyIntent(state, intent)` | Apply one intent; returns new state or cited error |
| `getPublicView(state, side)` | Side-filtered public snapshot for hosts |

```ts
import {
  createGame,
  queryLegality,
  applyIntent,
  getPublicView,
} from "netrunner-engine";

let state = createGame({ agendaPointsToWin: 7 });
const legal = queryLegality(state);
// Prefer picking from legality.legal (each entry has actor + CR cites).
const result = applyIntent(state, legal.legal[0]!.action);
if (result.ok) state = result.state;
const view = getPublicView(state, "runner");
```

`createInitialState` / `applyAction` / `legalActions` remain exported for older demos and tests; new hosts should prefer the four functions above. Run `npm run demo:library` for a printed example of that loop.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the CR adherence gate (PR template) and CI hard-fails: cite-map (`tests/cr-cite-map.test.ts`), timing `stepId`s (`tests/engine.test.ts`), and supported-wave empty-`unsupported` (`tests/pool-supported-invariant.test.ts`). All run under the default `npm test` job.

**Corpus status:** Gateway → Vantage Point is fully `supported` (VP wave gate `v1.33.0`; maintenance `v1.34.0`). **Uprising** is the first legacy-backwards wave (`in-progress`, kickoff pin **`v1.35.0`**, **3/65**). Confidence extras live under `tests/confidence-*.test.ts` / `tests/fixtures/goldens/` ([#193](https://github.com/nhoople/netrunner-engine/pull/193)). Forward after VP still waits on a new NSG release or CR bump past `v26.03`.

## CR pin (`v26.03`)

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cr-pin.json`](data/cr-pin.json) — tag, repo, raw GitHub base URL, file list |
| Fetch script | [`scripts/fetch-cr-data.mjs`](scripts/fetch-cr-data.mjs) — `npm run fetch-cr` |
| Vendored files | `vendor/cr-data/` (`index.json`, `timing-structures.json`, `nodes.json`, `PIN.json`) |

`nodes.json` is listed in the pin and fetched with the rest; it is gitignored (large) so a clean checkout needs `npm run fetch-cr` before tests. Engine host code cites CR **numbers** and stable **ids**. Tests resolve numbers through the pinned `index.json`, require every pin-listed vendor file (including `nodes.json`), and check graph `stepId`s against `timing-structures.json`.

CR data is authority for **citations and timing IDs**, not executable card behavior. The engine does **not** compile `nodes.json` into effects. When Null Signal ships a new CR, follow the Netrunner Core Project checklist `docs/cr-pin-bump-checklist.md`.

## Card pin (`v1.35.0`)

Cards remain **pure data**. Definitions live in the sibling consumer repo [netrunner-cards-data](https://github.com/nhoople/netrunner-cards-data); this engine keeps loader / Effect IR / eval.

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cards-pin.json`](data/cards-pin.json) — tag, repo, archive URL, required paths |
| Fetch script | [`scripts/fetch-cards-data.mjs`](scripts/fetch-cards-data.mjs) — `npm run fetch-cards` |
| Vendored files | `vendor/cards-data/` (`schema.json`, `pool.json`, release dirs, `PIN.json`) |

`vendor/cards-data/` is gitignored; a clean checkout needs `npm run fetch-cards` (or `npm run prepare-data`) before tests. The loader validates Effect IR and **fails closed** on unknown nodes. `pool.json` declares the supported corpus and **corpus order: System Gateway → System Update 2021 → Midnight Sun → Parhelion → The Automata Initiative → Rebellion Without Rehearsal → Elevation → Vantage Point**. Partial cards mark unimplemented clauses in an `unsupported` array.

| Release | Count | Focus |
|---------|------:|-------|
| system-gateway | 77 | Null Signal System Gateway (NRDB `sg`) — fully supported |
| system-update-2021 | 82 | Null Signal System Update 2021 (NRDB `su21`) — fully supported |
| midnight-sun | 65 | Borealis set 1 (NRDB `ms`) — **supported** (wave gate `v0.46.0`; all 65 clear) |
| parhelion | 63 | Borealis set 2 (NRDB `ph`) — **supported** (wave gate `v0.71.0`; all 63 clear) |
| the-automata-initiative | 65 | Liberation set 1 (NRDB `tai`) — **supported** (65/65; wave gate `v0.86.0`) |
| rebellion-without-rehearsal | 65 | Liberation set 2 (NRDB `rwr`) — **supported** (65/65 on `v1.00.0`) |
| elevation | 82 | Elevation (NRDB `elev`) — **supported** (`v1.12.0`; 82/82 mapped) |
| uprising | 65 | Uprising (NRDB `ur`) — **in-progress** (kickoff `v1.35.0`; 3/65 mapped; Ashes set 2; legacy backwards) |
| vantage-point | 66 | Vantage Point (NRDB `vp`) — **supported** (`v1.33.0`; 66/66 mapped) |

Synthetic `stubs/` / `wave1/` / `wave2/` dirs were removed in cards-data `v0.2.0`; demos use real Gateway/SU21 cards (Ice Wall, Marjanah, Palisade, Hortum, Tithe, Rototurret, …).

## Effect IR

Hand-authored AST evaluated by `evalEffect` — **not** compiling `nodes.json`.

```text
Effect ::= seq [Effect…]
         | do Primitive
         | if Cond then Effect [else Effect]
         | prevent jack_out
         | choose {chooser, options[]}

Primitive ::= end_the_run
            | gain_credits | lose_credits {side, amount, then?}
            | lose_clicks | gain_clicks {side, amount}
            | pump_strength {amount, duration?: encounter|run}
            | fortify_ice | weaken_ice {amount}
            | net_damage | meat_damage | core_damage | brain_damage {amount}
            | give_tags {amount}
            | trash_program | trash_resource {pick: first|choose}
            | take_hosted_credits | place_hosted_credits {amount}
         | add_virus_counter | gain_credits_per_virus
         | increase_hand_size {side, amount}
         | remove_tags | lose_credits_per_advancement | gain_credits_per_advancement | bypass_current_ice
         | remove_power_counter
         | sabotage {amount, interactive?}
         | identify_mark
         | charge {pick: self|choose|card, cardId?}
         | bonus_access {amount}
         | breach_server_when_run_ends {server: hq|rd|archives}
         | install_from_grip_discount {types[], discount, mayCharge?}
         | install_grip_card {cardId, discount}
         | may_charge_card {cardId}
         | may_derez_installed {excludeSelf?, then?}
         | may_trash_installed {excludeSelf?, then?}
         | trash_corp_card {cardId}
         | spark_of_inspiration_resolve {discount?}
         | may_trash_other_installed_search_stack_same_type_install {discount}
         | search_stack_type_install {cardType, discount}
         | draw_per_power_counter {side, per?}
         | take_hosted_bad_publicity {amount}
         | may_flip_archives_ice_resolve_subroutine
         | flip_archives_ice_resolve_subroutine {iceId, subIndex}
         | trash_encounter_ice_resolve_subroutine {subIndex}
         | may_choose_server
         | set_named_server {serverId}
         | search_stack_host_virus_or_weapon {max}
         | host_stack_card_on_source {cardId}
         | may_add_hosted_card_to_grip
         | add_hosted_card_to_grip {cardId}
         | turn_hosted_cards_faceup
         | host_copy_from_grip {title}
         | matryoshka_break
         | matryoshka_break_resolve {amount, hostedId}
         | trace {strength, onSuccess, onFailure?}
         | draw {side, amount}
         | add_agenda_counter {amount}
```

Card hooks that carry Effect trees: `subroutines[].effect`, `paidAbilities[].effect`, `onRez`, `onPlay`, `onScore`, `onSteal`, `onEncounter`, `onTurnBegin`, `onInstall`, `onFirstTagThisTurn`, `onFirstCoreDamageThisTurn`, `onFirstRdRunBeginThisTurn`, `onFirstArchivesRunBeginThisTurn`, `onFirstVirusInstallThisTurn`, `onFirstSuccessfulMarkRunThisTurn`, `onFirstSuccessfulHqRunThisTurn`, `onProgramOrHardwareInstall`. Threshold field: `onPowerCountersGte` (Environmental Testing). Paid-ability gates include `requireEncounterSubtype` and `requireAttackingMark` (Backstitching mark-run trash-to-bypass).
## What the engine does

- Nested priority / paid-ability windows (CR 9.2.4 / 9.2.4d)
- Timing step graph (11.2–11.5) with appendix labels
- Basic actions, operations/events, identity click abilities
- Advance / score / steal agendas; win by agenda points or flatline
- Central breach access (HQ / R&D / Archives candidates)
- Run ice: rez, break (multi-break / AI `*`), multi-sub resolve, jack-out
- Damage types + prevention hooks; traces; recurring / hosted / virus costs
- Effect choices (`choose` / `choose_option`)
- `queryLegality` / `explainAction`, checkpoints, cannot effects

## What it does not do

- UI / multiplayer / networking (out of scope for this Project)
- Full NetrunnerDB / every NSG expansion beyond the declared `pool.json` corpus (Gateway → Vantage Point today)
- Compiling `nodes.json` into executable behavior
- Perfect fidelity for every printed clause outside the supported mapping (partial cards use explicit `unsupported` notes; supported waves must keep those empty unless allowlisted)
- Full **9.12** continuous-effect compiler (subtype-grant / Mother Goddess–class chains) — practical blanking solver is present; full compiler deferred until a card needs it

## Layout

```
data/
  cr-pin.json      # CR tag pin
  cards-pin.json   # cards-data tag pin
vendor/
  cr-data/         # npm run fetch-cr
  cards-data/      # npm run fetch-cards (gitignored)
src/
  api/library.ts   # createGame / applyIntent / getPublicView
  effects/         # IR types + evaluator
  cards/           # load + short-game setup + runtime helpers
  timing/
  legality/
  actions/apply.ts
  demo/verticalSlice.ts
tests/
  confidence-*.test.ts          # interaction smoke / cross-pack / cannot / goldens / fail-closed
  fixtures/goldens/             # regression transcripts (see README there)
  cr-*.test.ts                  # CR adherence lock-ins
  short-game.test.ts
  system-gateway.test.ts
  …
```

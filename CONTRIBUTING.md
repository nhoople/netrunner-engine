# Contributing

## PRs that add Effect IR / pack wiring

1. Card text → Effect IR + engine tests (happy path + cannot/prevent/cost-fail when relevant).
   A test goes in the `tests/` folder that mirrors the code it tests (`tests/state/<area>/`, `tests/legality/`, …) or the one for its kind of check (`tests/packs/`, `tests/rulings/`, …), never directly in `tests/`. [`tests/README.md`](tests/README.md) lists every folder, and `tests/repo/test-placement.test.ts` fails otherwise.
2. **CR adherence gate** — fill the recording template in the PR (see `.github/PULL_REQUEST_TEMPLATE.md`). The full checklist is [`docs/cr-adherence-gate.md`](docs/cr-adherence-gate.md).
3. Fail closed: ambiguous CR or missing engine windows → explicit `unsupported` notes, not silent auto-resolve.
4. Prefer pack-level PRs. Do not cut a GitHub Release until the wave is set-complete (or an explicit manual release is requested).

## Set-complete (new pack → `supported`)

When a wave is fully mapped and `pool.json` → `supported`, also run a light **interaction smoke** sample (prevent×cost, blank×host, interrupt chains, etc.). Reusable matrix: [`docs/interaction-smoke-samples.md`](docs/interaction-smoke-samples.md). Gateway→VP already has a one-time corpus pass in `tests/confidence/confidence-*.test.ts` ([#193](https://github.com/nhoople/netrunner-engine/pull/193)); re-sample with wave-local cards for the **next** pack.

## Ported scenario tests

Scenario tests ported from [mtgred/netrunner](https://github.com/mtgred/netrunner) follow [`docs/jnet-test-ports.md`](docs/jnet-test-ports.md): quarantined under `tests/jnet/`, native-style titles with the upstream `deftest` name kept as provenance, and a promoted native test for every engine fix they produce.

## CI hard-fails

| Check | Command / test |
|-------|----------------|
| Prettier formatting (`.prettierrc.json`; fix with `npm run format`) | `npm run format:check` |
| ESLint (recommended + typescript-eslint) | `npm run lint` |
| TypeScript (`tsc --noEmit`) | `npm run typecheck` |
| Bidirectional CR cite map (`CR.*` ↔ pinned `index.json`) | `tests/cr-citations/rule-cite-map.test.ts` (`npm test`) |
| Every graph `stepId` ∈ pinned `timing-structures.json` | `tests/cr/engine.test.ts` (“timing step graph”) |
| `supported` waves → empty `unsupported` (unless allowlisted in cards-data) | `tests/cards/pool-supported-invariant.test.ts` |

Confidence extras (`tests/confidence/confidence-*.test.ts`, goldens under `tests/fixtures/goldens/`) run with the default `npm test` suite — treat golden diffs as regressions unless intentionally refreshed (`REFRESH_GOLDENS=1`).

Do **not** invent a CR→AST compiler. IR stays hand-authored.

Setup: `npm ci && npm run prepare-data && npm run format:check && npm run lint && npm run typecheck && npm test`.

Development hosts (library API only — no UI/network): `npm run demo:library`, `npm run demo`, `npm run cli:help`.

**Pins:** the engine pins cards and CR by release tag in `data/cards-pin.json` and `data/cr-pin.json`. The current versions are in the project [pin table](https://github.com/nhoople/netrunner#readme). The corpus is idle until the next NSG pack or a CR update.

# Contributing

## PRs that clear cards / add IR

1. Card text → Effect IR + engine tests (happy path + cannot/prevent/cost-fail when relevant).
2. **CR adherence gate** — fill the recording template in the PR (see `.github/PULL_REQUEST_TEMPLATE.md`). The full checklist lives in the Netrunner Core Project store: `docs/cr-adherence-gate.md`.
3. Fail closed: ambiguous CR or missing engine windows → explicit `unsupported` notes, not silent auto-resolve.

## Set-complete (new pack → `supported`)

When a wave hits 100% clear and `pool.json` → `supported`, also run a light **interaction smoke** sample (prevent×cost, blank×host, interrupt chains, etc.). Reusable matrix: Project store `docs/interaction-smoke-samples.md`. Gateway→VP already has a one-time corpus pass in `tests/confidence-*.test.ts` ([#193](https://github.com/nhoople/netrunner-engine/pull/193)); re-sample with wave-local cards for the **next** pack.

## CI hard-fails

| Check | Command / test |
|-------|----------------|
| ESLint (recommended + typescript-eslint) | `npm run lint` |
| TypeScript (`tsc --noEmit`) | `npm run typecheck` |
| Bidirectional CR cite map (`CR.*` ↔ pinned `index.json`) | `tests/cr-cite-map.test.ts` (`npm test`) |
| Every graph `stepId` ∈ pinned `timing-structures.json` | `tests/engine.test.ts` (“timing step graph”) |
| `supported` waves → empty `unsupported` (unless allowlisted in cards-data) | `tests/pool-supported-invariant.test.ts` |

Confidence extras (`tests/confidence-*.test.ts`, goldens under `tests/fixtures/goldens/`) run with the default `npm test` suite — treat golden diffs as regressions unless intentionally refreshed (`REFRESH_GOLDENS=1`).

Do **not** invent a CR→AST compiler. IR stays hand-authored.

Setup: `npm ci && npm run prepare-data && npm run lint && npm run typecheck && npm test`.

Development hosts (library API only — no UI/network): `npm run demo:library`, `npm run demo`, `npm run cli:help`.

**Pins today:** CR `v26.03`; cards-data / engine same-semver **`v1.142.0`** (Magnum Opus set-complete; `mor` absorbed). Idle until next NSG pack after VP or a CR bump.

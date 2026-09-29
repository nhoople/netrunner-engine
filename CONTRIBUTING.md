# Contributing

## PRs that clear cards / add IR

1. Card text → Effect IR + engine tests (happy path + cannot/prevent/cost-fail when relevant).
2. **CR adherence gate** — fill the recording template in the PR (see `.github/PULL_REQUEST_TEMPLATE.md`). The full checklist lives in the Netrunner Core Project store: `docs/cr-adherence-gate.md`.
3. Fail closed: ambiguous CR or missing engine windows → explicit `unsupported` notes, not silent auto-resolve.

## CI hard-fails

| Check | Command / test |
|-------|----------------|
| ESLint (recommended + typescript-eslint) | `npm run lint` |
| TypeScript (`tsc --noEmit`) | `npm run typecheck` |
| Bidirectional CR cite map (`CR.*` ↔ pinned `index.json`) | `tests/cr-cite-map.test.ts` (`npm test`) |
| Every graph `stepId` ∈ pinned `timing-structures.json` | `tests/engine.test.ts` (“timing step graph”) |
| `supported` waves → empty `unsupported` (unless allowlisted in cards-data) | `tests/pool-supported-invariant.test.ts` |

Do **not** invent a CR→AST compiler. IR stays hand-authored.

Setup: `npm ci && npm run prepare-data && npm run lint && npm run typecheck && npm test`.

Development hosts (library API only — no UI/network): `npm run demo:library`, `npm run demo`, `npm run cli:help`.

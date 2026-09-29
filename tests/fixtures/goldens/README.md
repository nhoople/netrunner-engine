# Regression goldens

Frozen full-run transcripts for confidence extras. Each `*.json` captures final
game state fields plus window/cite numbers seen in the log.

## Refresh

After an intentional engine behavior change that alters a golden:

```bash
REFRESH_GOLDENS=1 npx vitest run tests/confidence-regression-goldens.test.ts
```

Review the diff under this directory, then commit. Do **not** refresh to silence
an unexpected CI failure — that is a regression until proven otherwise.

## Files

| Fixture | Scenario |
|---------|----------|
| `vertical-slice-decline-rez.json` | Corp install → run → decline rez → empty breach → end |
| `ice-break-success.json` | Rez Ice Wall → break → success |
| `ice-etr-failure.json` | Rez → no break → ETR / unsuccessful |
| `crisium-archives-ternary.json` | Crisium Grid → Success Phase null success (6.8.4a) |

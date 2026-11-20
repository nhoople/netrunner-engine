## Summary

<!-- What changed and why (1–3 bullets). -->

## Proof

<!-- How the maintainer can see this working without reading code: a played match or the part of one this changes, a before-and-after screenshot or recording, or a test whose name states the behavior in plain words. Docs, tooling, or dependency-only PRs: `n/a — <reason>`. -->

## Review

<!-- For a code change: the `/code-review` level, what it found, and what was fixed or why not. Otherwise: `none — <reason>`. -->

## Found, not fixed

<!-- Each thing noticed that this PR does not change: what it is, where it went (issue, plan, or a fix-now session), and why. See "Findings" in https://github.com/nhoople/netrunner/blob/main/docs/how-we-work.md. Write `none` if nothing. -->

## CR adherence gate (required for Effect IR / card wiring)

For any PR that adds Effect IR, wires host behavior for a card, or marks cards fully mapped: fill the recording template below (full checklist: [`docs/cr-adherence-gate.md`](../docs/cr-adherence-gate.md); see also [`CONTRIBUTING.md`](../CONTRIBUTING.md)). Do **not** delete this section.

Pure docs / CI / chore / non-IR refactors: leave the template and write `Verdict: n/a — <one-line reason>` (e.g. `n/a — CI/process only`).

```text
CR gate (v26.03) — <pack>
Cards: <ids>
Timing windows: <list or n/a>
Defined terms / keywords: <list>
Cannot / prevent interactions: <none | cites>
Cite additions: <CR.* keys or none>
Fail-closed / unsupported left: <none | bullets>
Verdict: clear | clear-with-debt | blocked | n/a — <reason>
```

### Checklist

- [ ] Effect IR / card wiring: CR gate filled above (or `n/a` with reason)
- [ ] New `CR.*` cites (if any) pass bidirectional index check (`tests/cr-cite-map.test.ts`)
- [ ] New timing graph steps (if any) use stepIds present in pinned `timing-structures.json` (`tests/engine.test.ts`)
- [ ] Supported-wave pool invariant still holds (`tests/pool-supported-invariant.test.ts`)

## Release

- [ ] None: tests, docs, tooling, or dependencies only
- [ ] Maintenance release `<tag>` (engine `src/` change); the game pin and the [pin table](https://github.com/nhoople/netrunner#readme) follow
- [ ] Set-complete pair `<tag>` (cards and engine share the semver)

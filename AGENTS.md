# Agent notes

This is the rules engine of the Netrunner project. Full instructions for coding agents are in the project repo's [`CLAUDE.md`](https://github.com/nhoople/netrunner/blob/main/CLAUDE.md), and the git and release process is in [`docs/git-hygiene.md`](https://github.com/nhoople/netrunner/blob/main/docs/git-hygiene.md).

- The four repositories stay separate: `netrunner-engine`, `netrunner-cards-data`, `netrunner-comprehensive-rules-data`, and `netrunner-game`. The game and the engine consume the others by release tag, not by `master` and not as workspace packages. Do not recommend merging them, an npm workspace, or Turborepo unless asked to change that release model.
- Rules belong here. Before changing engine behavior or what a seat can see, read the relevant Comprehensive Rules nodes at the pinned tag and cite the rule number. Card text wins on a direct contradiction (CR 1.2.1). An engine `src/` change ships as a maintenance release.
- Setup: `npm install && npm run prepare-data`. `prepare-data` runs `fetch-cr` and `fetch-cards`, which put the pinned Comprehensive Rules and card data in `vendor/`.
- Before committing, add or update a test for the behavior and run `npm run format && npm run lint && npm run typecheck && npm run knip && npm test` (the CI `test` job, which checks formatting with `npm run format:check`). Run the affected test file first (`npm test -- tests/<folder>/<file>.test.ts`; [`tests/README.md`](tests/README.md) says which folder a test goes in), then the whole suite for a rules change. CI's `jnet` job also runs `npm run test:jnet`.
- Work on a `claude/<descriptive-name>` branch and merge by pull request; `master` takes no direct push.

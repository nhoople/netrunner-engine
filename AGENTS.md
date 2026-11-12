# Agent notes

This is the rules engine of the Netrunner project. Full instructions for coding agents are in the project repo's [`CLAUDE.md`](https://github.com/nhoople/netrunner/blob/main/CLAUDE.md), and the git and release process is in [`docs/git-hygiene.md`](https://github.com/nhoople/netrunner/blob/main/docs/git-hygiene.md).

- The four repositories stay separate: `netrunner-engine`, `netrunner-cards-data`, `netrunner-comprehensive-rules-data`, and `netrunner-game`. The game and the engine consume the others by release tag, not by `master` and not as workspace packages. Do not recommend merging them, an npm workspace, or Turborepo unless asked to change that release model.
- Rules belong here. Before changing engine behavior or what a seat can see, read the relevant Comprehensive Rules nodes at the pinned tag and cite the rule number. Card text wins on a direct contradiction (CR 1.2.1). An engine `src/` change ships as a maintenance release.
- Setup: `npm install && npm run prepare-data`. Before committing, add or update a test for the behavior and run `npm run lint && npm run typecheck && npm test`.
- Work on a `claude/<descriptive-name>` branch and merge by pull request; `master` takes no direct push.

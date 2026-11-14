/**
 * Matches exported from the netrunner-game debug page replay to the same
 * final state (verification table V5). See `tests/game-export/loader.ts`.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertCardsPinnedTag, assertPinnedTag, cardsDataPresent, crDataPresent } from "../src/index.js";
import {
  GAME_EXPORTS_DIR,
  compareGameExport,
  gameExportFiles,
  readGameExport,
  replayGameExport,
  stateHash,
} from "./game-export/loader.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.22");
});

describe("game exports", () => {
  const files = gameExportFiles();

  it("has at least one fixture", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`${name} replays to the same final state`, () => {
      const fixture = readGameExport(join(GAME_EXPORTS_DIR, name));
      const replay = replayGameExport(fixture);
      expect(compareGameExport(fixture, replay)).toEqual([]);
    });
  }

  it("notices a changed step, a changed final state, and an unlisted failure", () => {
    const fixture = readGameExport(join(GAME_EXPORTS_DIR, "tithe-run-hq.json"));
    // Drop the last step: the final state no longer matches.
    const short = { ...fixture, steps: fixture.steps.slice(0, -1) };
    expect(compareGameExport(short, replayGameExport(short)).some((e) => e.includes("final"))).toBe(true);
    // A step the engine refuses ends the replay as REFUSED, as in a playout.
    const refused = { ...fixture, steps: [{ action: { type: "access_card", cardId: "nope" } as never, logSeq: 1 }] };
    expect(compareGameExport(refused, replayGameExport(refused))).toEqual([
      expect.stringMatching(/^new failure REFUSED@0: access_card/),
    ]);
    // A problem the fixture does not list fails the comparison. With no steps
    // nothing is applied, so the suite's invariant hook never sees this state.
    const opening = structuredClone(fixture.opening);
    opening.corp.credits = -1;
    const broken = { ...fixture, opening, steps: [] };
    expect(compareGameExport(broken, replayGameExport(broken))).toContain(
      "new failure NEGATIVE_CREDITS@-1: corp has -1 credits",
    );
  });

  it("hashes a state the same after a JSON round trip", () => {
    const fixture = readGameExport(join(GAME_EXPORTS_DIR, "tithe-run-hq.json"));
    const replay = replayGameExport(fixture);
    expect(stateHash(JSON.parse(JSON.stringify(replay.state)))).toBe(stateHash(replay.state));
  });
});

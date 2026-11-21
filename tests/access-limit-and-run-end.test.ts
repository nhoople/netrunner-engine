/**
 * FX-access: three bugs the second reader found (engine #994, #995) that
 * skewed the audit's checks or left a game unable to go on.
 *
 * - The random access limit of a breach of R&D counts only cards the Runner
 *   chooses from the deck; root upgrades are candidates beside it (CR 7.3.5).
 *   A card that enters Archives during a breach of Archives is a candidate
 *   (CR 7.4.6d). One procedure: `spendAccessLimitOnChoice` and
 *   `accessLimitEndsBreach` in `src/state/access.ts`.
 * - Run Ends is not skipped when a run-end ability's choice pauses it, so the
 *   run is complete after Boomerang's shuffle (CR 6.9.6d).
 * - The Success Phase resolves once per run, and a rezzed root card's
 *   successful-run ability is marked once, so Adrian Seis plays one Psi Game
 *   and Hokusai Grid does 1 net damage (CR 6.9.5a, 9.6.4b).
 */
import { describe, expect, it } from "vitest";
import { evalEffect, fx, legalActions } from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { Board, Report, offered, take, hasOption } from "./second-reader/harness.js";
import {
  accessedSince,
  accessing,
  atAction,
  drive,
  psi,
  run,
  toAction,
  through,
} from "./second-reader/driving.js";
import { must, pick } from "./rulings-helpers.js";

const accessChoices = (s: GameState): string[] =>
  legalActions(s)
    .filter((a) => a.type === "access_card")
    .map((a) => (a as { cardId: string }).cardId);

const canFinishBreach = (s: GameState): boolean =>
  legalActions(s).some((a) => a.type === "finish_breach");

/** R&D holds Hedge Fund over PAD Campaign; an unrezzed Hokusai Grid is in its root. */
function rdWithUpgrade(interfaces = 0) {
  const b = new Board(new Report(), "runner", 5);
  for (let i = 0; i < interfaces; i++) b.rig("r-d-interface");
  const grid = b.root("hokusai-grid", "rd");
  const [hedge, pad, wall] = b.rd("hedge-fund", "pad-campaign", "ice-wall");
  return { b, grid: grid!, hedge: hedge!, pad: pad!, wall: wall! };
}

describe("R&D's random access limit counts only cards from the deck (CR 7.3.5)", () => {
  it("an upgrade in R&D's root does not raise how many cards the Runner may take from the deck (CR 7.3.5)", () => {
    const { b, grid, hedge } = rdWithUpgrade();
    const from = b.s.log.length;
    let s = drive(run(b.s, "rd"), (x) => accessChoices(x).length > 0);
    expect(accessChoices(s).sort()).toEqual([grid, hedge].sort());
    // Take the deck card first: the limit of 1 is reached, and only the
    // upgrade is left. The Runner must access it (CR 7.3.4).
    const done = accessing(s, { choose: (_x, ids) => ids.find((id) => id === hedge) });
    s = done.s;
    expect(accessedSince(s, from)).toEqual(["Hedge Fund", "Hokusai Grid"]);
  });

  it("after the deck card, the Runner is offered only the root upgrade and cannot end the breach without it (CR 7.3.4, 7.3.5)", () => {
    const { b, grid, hedge } = rdWithUpgrade();
    let s = drive(run(b.s, "rd"), (x) => accessChoices(x).length > 0);
    s = must(s, { type: "access_card", cardId: hedge });
    s = drive(s, (x) => accessChoices(x).length > 0 || !x.run);
    expect(accessChoices(s)).toEqual([grid]);
    expect(canFinishBreach(s)).toBe(false);
  });

  it("accessing the root upgrade first leaves the whole random access limit for the deck (CR 7.3.5)", () => {
    const { b, grid } = rdWithUpgrade(1);
    const from = b.s.log.length;
    const s = drive(run(b.s, "rd"), (x) => accessChoices(x).length > 0);
    const done = accessing(s, {
      choose: (_x, ids) => ids.find((id) => id === grid) ?? ids[0],
    });
    // R&D Interface: a limit of 2, both spent on the deck; Ice Wall is not reached.
    expect(accessedSince(done.s, from)).toEqual([
      "Hokusai Grid",
      "Hedge Fund",
      "PAD Campaign",
    ]);
  });
});

describe("a card that enters Archives during a breach of Archives is a candidate (CR 7.4.6d)", () => {
  it("an upgrade trashed from the root of Archives is accessed again in the discard pile (CR 7.4.6d)", () => {
    const b = new Board(new Report(), "runner", 5);
    b.archives("hedge-fund");
    const grid = b.root("hokusai-grid", "archives");
    const from = b.s.log.length;
    let s = drive(run(b.s, "archives"), (x) => accessChoices(x).length > 0);
    const done = accessing(s, {
      choose: (_x, ids) => ids.find((id) => id === grid) ?? ids[0],
      onAccess: (x, cardId) => {
        if (cardId !== grid) return undefined;
        const trash = offered(x, "trash_accessed", grid)[0];
        return trash ? must(x, trash) : undefined;
      },
    });
    s = done.s;
    expect(s.cards[grid]!.zone).toBe("corp:archives");
    // The same physical card, accessed as two objects (CR 7.4.6d).
    expect(accessedSince(s, from).sort()).toEqual([
      "Hedge Fund",
      "Hokusai Grid",
      "Hokusai Grid",
    ]);
  });
});

describe("Run Ends finishes after a run-end ability's choice (CR 6.9.6d)", () => {
  it("the run ends after Boomerang's shuffle (CR 6.9.6d)", () => {
    const b = new Board(new Report(), "runner", 5);
    const enigma = b.ice("enigma", "hq");
    const [old] = b.heap("boomerang");
    const [boomerang] = b.grip("boomerang");
    let s = take(b.s, "basic_install", boomerang);
    s = toAction(through(s, atAction, [enigma!]));
    s.runner.clicks = 4;
    s = drive(run(s, "hq"), (x) => x.timingKey === "run.encounterPaw" || !x.run);
    // The engine also offers a bypass that is not in Boomerang's text (filed
    // under area 14, CR 1.2.1); decline it.
    if (s.pendingChoice && hasOption(s, "decline")) {
      s = drive(pick(s, "decline"), (x) => x.timingKey === "run.encounterPaw" || !x.run);
    }
    s = take(s, "use_paid_ability", boomerang);
    s = through(s, (x) => !x.run || x.timingKey === "run.jackOutWindow", [
      "sub:0",
      "sub:1",
      "0",
      "1",
      "done",
    ]);
    s = drive(s, (x) => Boolean(x.pendingChoice) || !x.run);
    expect(hasOption(s, old!)).toBe(true);
    s = pick(s, old!);
    s = toAction(accessing(s).s);
    expect(s.run).toBeNull();
    expect(s.timingKey).toBe("runner.takeAction");
    expect(s.runner.deck).toContain(old);
    expect(legalActions(s).some((a) => a.type === "basic_gain_credit")).toBe(true);
  });
});

describe("a breach when the run ends still happens after a run-end choice (CR 6.9.6d, 7.3.1)", () => {
  it("after Boomerang's shuffle, the R&D breach a card set up for when the run ends still happens", () => {
    const b = new Board(new Report(), "runner", 5);
    const enigma = b.ice("enigma", "hq");
    const [old] = b.heap("boomerang");
    const [boomerang] = b.grip("boomerang");
    b.rd("hedge-fund");
    let s = take(b.s, "basic_install", boomerang);
    s = toAction(through(s, atAction, [enigma!]));
    s.runner.clicks = 4;
    s = drive(run(s, "hq"), (x) => x.timingKey === "run.encounterPaw" || !x.run);
    if (s.pendingChoice && hasOption(s, "decline")) {
      s = drive(pick(s, "decline"), (x) => x.timingKey === "run.encounterPaw" || !x.run);
    }
    // As Virtuoso or Cataloguer would: breach R&D when this run ends.
    expect(
      evalEffect(
        { state: s, sourceId: boomerang! },
        fx.do({ kind: "breach_server_when_run_ends", server: "rd" }),
      ).ok,
    ).toBe(true);
    s = take(s, "use_paid_ability", boomerang);
    s = through(s, (x) => !x.run || x.timingKey === "run.jackOutWindow", [
      "sub:0",
      "sub:1",
      "0",
      "1",
      "done",
    ]);
    const from = s.log.length;
    s = drive(s, (x) => Boolean(x.pendingChoice) || !x.run);
    s = pick(s, old!);
    s = toAction(accessing(s).s);
    expect(s.run).toBeNull();
    expect(accessedSince(s, from)).toContain("Hedge Fund");
  });
});

describe("a successful run's abilities resolve once (CR 6.9.5a, 9.6.4b)", () => {
  function seis(bidCorp: number, bidRunner: number) {
    const b = new Board(new Report(), "runner", 5);
    const [seisId, remote] = b.remote("adrian-seis", true);
    const from = b.s.log.length;
    let s = drive(run(b.s, remote), (x) => Boolean(x.psi) || !x.run);
    expect(s.psi?.sourceId).toBe(seisId);
    s = psi(s, bidCorp, bidRunner);
    expect(s.psi).toBeNull();
    s = toAction(accessing(s).s);
    const games = s.log
      .slice(from)
      .filter((line) => line.startsWith("Psi game initiated")).length;
    return { s, from, games };
  }

  it("Adrian Seis's Psi Game resolves once per successful run, and the run ends (CR 9.6.4b)", () => {
    const { s, from, games } = seis(0, 1);
    expect(games).toBe(1);
    expect(s.run).toBeNull();
    // The bids differ: only Adrian Seis may be accessed.
    expect(accessedSince(s, from)).toEqual(["Adrian Seis"]);
  });

  it("when Adrian Seis's bids match, the run ends with nothing accessed (CR 9.6.4b)", () => {
    const { s, from, games } = seis(0, 0);
    expect(games).toBe(1);
    expect(s.run).toBeNull();
    expect(accessedSince(s, from)).toEqual([]);
  });

  it("a rezzed Hokusai Grid does 1 net damage for a successful run on its server, not 2 (CR 9.6.4b)", () => {
    const b = new Board(new Report(), "runner", 5);
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    const [, remote] = b.remote("hokusai-grid", true);
    const s = toAction(accessing(drive(run(b.s, remote), (x) => !x.run || Boolean(x.pendingChoice))).s);
    expect(s.runner.hand).toHaveLength(2);
    expect(s.run).toBeNull();
  });
});

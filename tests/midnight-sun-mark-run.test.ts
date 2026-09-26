/**
 * Midnight Sun mark-run cluster: servers "mark", start_run_on_mark,
 * identity onSuccessfulRun (once per turn).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
} from "../src/index.js";
import { serversMatchingSpec } from "../src/state/runStart.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.5.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function cardsMarkRunWired(): boolean {
  const carpe = getCardDef("carpe-diem");
  const sable = getCardDef("nyusha-sable-sintashta-symphonic-prodigy");
  return (
    (carpe.unsupported?.length ?? 0) === 0 &&
    (sable.unsupported?.length ?? 0) === 0 &&
    Boolean(sable.onSuccessfulRun)
  );
}

describe("MS mark-run IR (always)", () => {
  it("serversMatchingSpec mark returns designated mark only", () => {
    const s = createInitialState();
    expect(serversMatchingSpec(s, { servers: "mark" })).toEqual([]);
    s.markServerId = "rd";
    expect(serversMatchingSpec(s, { servers: "mark" })).toEqual(["rd"]);
  });

  it("start_run_on_mark queues pending then starts run via choose", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.markServerId = "hq";
    s.servers.hq.ice = [];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const ev = instantiateCard("sure-gamble", "carpe-1", "runner:grip");
    ev.playCost = 0;
    ev.onPlay = fx.seq(
      fx.identifyMark(),
      fx.gainCredits("runner", 4),
      {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "run-mark",
            label: "Make a run on the mark",
            effect: fx.startRunOnMark(),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.seq(),
          },
        ],
      },
    );
    s.cards["carpe-1"] = ev;
    s.runner.hand = ["carpe-1"];

    s = must(s, { type: "play_event", cardId: "carpe-1" });
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.runner.credits).toBe(9);
    expect(s.markServerId).toBeTruthy();

    s = must(s, { type: "choose_option", optionId: "run-mark" });
    expect(s.pendingStartRunOnMark).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(true);
    expect(s.run).toBeNull();
  });

  it("Carpe-shaped decline skips the run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.servers.rd.ice = [];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const ev = instantiateCard("sure-gamble", "carpe-2", "runner:grip");
    ev.playCost = 0;
    ev.onPlay = fx.seq(fx.identifyMark(), fx.gainCredits("runner", 4), {
      op: "choose",
      chooser: "runner",
      options: [
        {
          id: "run-mark",
          label: "Make a run on the mark",
          effect: fx.startRunOnMark(),
        },
        { id: "decline", label: "Decline", effect: fx.seq() },
      ],
    });
    s.cards["carpe-2"] = ev;
    s.runner.hand = ["carpe-2"];

    s = must(s, { type: "play_event", cardId: "carpe-2" });
    const clicksBefore = s.runner.clicks;
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.turn.successfulRunThisTurn).toBe(false);
    expect(s.run).toBeNull();
    // deferAfterBasicAction should have completed the action
    expect(s.runner.clicks).toBe(clicksBefore);
  });

  it("identity onSuccessfulRun once-per-turn on mark gains a click", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = s.cards[s.runner.identityId]!;
    id.onSuccessfulRun = {
      op: "if",
      cond: { op: "attacking_mark" },
      then: fx.gainClicks("runner", 1),
    };
    id.onSuccessfulRunOncePerTurn = true;

    // Archives: empty breach completes immediately.
    s.markServerId = "archives";
    s.servers.archives.ice = [];
    s.corp.discard = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    const clicksBefore = s.runner.clicks;
    s = must(s, { type: "basic_run", serverId: "archives" });
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(true);
    expect(s.runner.clicks).toBe(clicksBefore); // spent 1 for run, gained 1 from ID
    expect(s.turn.onSuccessfulRunFiredIds).toContain(s.runner.identityId);

    // Second successful mark run same turn: no second click
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    expect(s.timingKey).toBe("runner.takeAction");
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "archives" });
    expect(s.runner.clicks).toBe(3);
  });
});

describe("MS mark-run card wiring (soft-skip until cards-data tagged)", () => {
  it("Carpe Diem and Nyusha clear unsupported when wired", () => {
    if (!cardsMarkRunWired()) return;
    expect(getCardDef("carpe-diem").unsupported).toEqual([]);
    expect(
      getCardDef("nyusha-sable-sintashta-symphonic-prodigy").unsupported,
    ).toEqual([]);
  });

  it("Carpe Diem play may run mark end-to-end", () => {
    if (!cardsMarkRunWired()) return;
    let s = createInitialState();
    s = structuredClone(s);
    // Use Nyusha so onTurnBegin identify is irrelevant; Carpe identifies itself
    const id = instantiateCard(
      "nyusha-sable-sintashta-symphonic-prodigy",
      "sable-id",
      "runner:identity",
    );
    s.cards["sable-id"] = id;
    s.runner.identityId = "sable-id";

    const carpe = instantiateCard("carpe-diem", "carpe-live", "runner:grip");
    s.cards["carpe-live"] = carpe;
    s.runner.hand = ["carpe-live"];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    for (const sid of ["hq", "rd", "archives"] as const) {
      s.servers[sid].ice = [];
    }

    s = must(s, { type: "play_event", cardId: "carpe-live" });
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["run-mark", "decline"]),
    );
    expect(s.runner.credits).toBe(8); // 5 - 1 play + 4 gain
    s = must(s, { type: "choose_option", optionId: "run-mark" });
    expect(s.turn.successfulRunThisTurn).toBe(true);
  });
});

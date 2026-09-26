/**
 * Midnight Sun charge run-begin cluster: onFirstRdRunBeginThisTurn (Padma).
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
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.6.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function padmaWired(): boolean {
  const padma = getCardDef("captain-padma-isbister-intrepid-explorer");
  return (
    (padma.unsupported?.length ?? 0) === 0 &&
    Boolean(padma.onFirstRdRunBeginThisTurn)
  );
}

describe("MS Padma charge run-begin IR (always)", () => {
  it("accepts onFirstRdRunBeginThisTurn may-charge Effect IR", () => {
    const effect = {
      op: "choose" as const,
      chooser: "runner" as const,
      options: [
        {
          id: "charge",
          label: "Charge 1 installed card",
          effect: fx.chargeChoose(),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.seq(),
        },
      ],
    };
    expect(validateEffectTree(effect)).toBeNull();
  });

  it("onFirstRdRunBeginThisTurn fires once on first R&D run begin", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = s.cards[s.runner.identityId]!;
    id.onFirstRdRunBeginThisTurn = {
      op: "choose",
      chooser: "runner",
      options: [
        {
          id: "charge",
          label: "Charge 1 installed card",
          effect: fx.chargeChoose(),
        },
        { id: "decline", label: "Decline", effect: fx.seq() },
      ],
    };

    // Chargeable program in rig
    const prog = instantiateCard("propeller", "prop-1", "runner:rig");
    prog.powerCounters = 2;
    s.cards["prop-1"] = prog;
    s.runner.rig.push("prop-1");

    s.servers.rd.ice = [];
    s.servers.rd.root = [];
    s.corp.deck = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "rd" });
    expect(s.turn.rdRunBegunThisTurn).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["charge", "decline"]),
    );

    s = must(s, { type: "choose_option", optionId: "charge" });
    expect(s.cards["prop-1"]!.powerCounters).toBe(3);
    expect(s.pendingChoice).toBeNull();
    // Empty R&D ice + empty deck/root → run completes
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(true);

    // Second R&D run same turn: no second trigger
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    expect(s.timingKey).toBe("runner.takeAction");
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "rd" });
    expect(s.pendingChoice).toBeNull();
    expect(s.cards["prop-1"]!.powerCounters).toBe(3);
  });

  it("does not fire on first HQ run begin", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = s.cards[s.runner.identityId]!;
    id.onFirstRdRunBeginThisTurn = {
      op: "choose",
      chooser: "runner",
      options: [
        {
          id: "charge",
          label: "Charge",
          effect: fx.chargeChoose(),
        },
        { id: "decline", label: "Decline", effect: fx.seq() },
      ],
    };
    s.servers.hq.ice = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "hq" });
    expect(s.turn.rdRunBegunThisTurn).toBe(false);
    expect(s.pendingChoice).toBeNull();
  });

  it("decline skips charge and continues the run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = s.cards[s.runner.identityId]!;
    id.onFirstRdRunBeginThisTurn = {
      op: "choose",
      chooser: "runner",
      options: [
        {
          id: "charge",
          label: "Charge 1 installed card",
          effect: fx.chargeChoose(),
        },
        { id: "decline", label: "Decline", effect: fx.seq() },
      ],
    };
    const prog = instantiateCard("propeller", "prop-2", "runner:rig");
    prog.powerCounters = 1;
    s.cards["prop-2"] = prog;
    s.runner.rig.push("prop-2");
    s.servers.rd.ice = [];
    s.servers.rd.root = [];
    s.corp.deck = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "rd" });
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.cards["prop-2"]!.powerCounters).toBe(1);
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(true);
  });
});

describe("MS Padma card JSON (soft-skip until wired)", () => {
  it("Padma wires onFirstRdRunBeginThisTurn with may charge", () => {
    if (!padmaWired()) return;
    const padma = getCardDef("captain-padma-isbister-intrepid-explorer");
    expect(padma.unsupported).toEqual([]);
    expect(padma.onFirstRdRunBeginThisTurn).toBeTruthy();
    expect(validateEffectTree(padma.onFirstRdRunBeginThisTurn!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const live = instantiateCard(
      "captain-padma-isbister-intrepid-explorer",
      "padma-live",
      "runner:identity",
    );
    s.cards["padma-live"] = live;
    s.runner.identityId = "padma-live";

    const prog = instantiateCard("propeller", "prop-live", "runner:rig");
    prog.powerCounters = 4;
    s.cards["prop-live"] = prog;
    s.runner.rig.push("prop-live");

    s.servers.rd.ice = [];
    s.servers.rd.root = [];
    s.corp.deck = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "rd" });
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["charge", "decline"]),
    );
    s = must(s, { type: "choose_option", optionId: "charge" });
    expect(s.cards["prop-live"]!.powerCounters).toBe(5);
  });
});

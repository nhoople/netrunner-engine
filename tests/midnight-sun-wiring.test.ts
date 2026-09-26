/**
 * Smoke / focused tests for MS cards wired onto sabotage / mark / charge IR.
 * Does not claim full Midnight Sun support.
 *
 * Card JSON wiring lands in cards-data v0.5.0+. Def-shape smokes soft-skip when
 * unsupported notes remain on an older extract. Host wiring (skipBreach, agenda
 * triggers, identity onTurnBegin) is always tested.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import { resolveAndAdvance } from "../src/timing/machine.js";

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

function cardsWiringPresent(): boolean {
  const chastushka = getCardDef("chastushka");
  return (
    (chastushka.unsupported?.length ?? 0) === 0 &&
    Boolean(chastushka.runEvent?.skipBreach)
  );
}

describe("MS host wiring (always)", () => {
  it("skipBreach on runEvent skips breach after successful run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Synthetic Chastushka-shaped event
    const ev = instantiateCard("jailbreak", "chast-1", "runner:grip");
    ev.runEvent = {
      servers: "hq",
      skipBreach: true,
      onSuccessfulRun: fx.sabotage(2, true),
    };
    ev.playCost = 0;
    s.cards["chast-1"] = ev;
    s.runner.hand = ["chast-1"];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.servers.hq.ice = [];
    s = must(s, { type: "play_event", cardId: "chast-1", serverId: "hq" });
    expect(s.pendingSabotage?.amount).toBe(2);
    expect(s.turn.successfulRunThisTurn).toBe(true);
    // No breach access remaining
    expect(s.run).toBeNull();
  });

  it("identity onTurnBegin fires identify_mark", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = s.cards[s.runner.identityId]!;
    id.onTurnBegin = fx.identifyMark();
    expect(s.markServerId).toBeNull();
    s.timingKey = "runner.turnBegins";
    resolveAndAdvance(s);
    expect(s.markServerId).toBeTruthy();
  });

  it("installed onAgendaScored fires sabotage for Marrow-class", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Avoid Corp ID onAgendaScored (HB Precision Design) consuming the score window.
    const corpId = instantiateCard(
      "weyland-consortium-built-to-last",
      "corp-id",
      "corp:hq",
    );
    s.cards["corp-id"] = corpId;
    s.corp.identityId = "corp-id";

    const marrow = instantiateCard("marrow", "marrow-1", "runner:rig");
    marrow.onAgendaScored = fx.sabotage(1, true);
    s.cards["marrow-1"] = marrow;
    s.runner.rig.push("marrow-1");

    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote-1:root",
    );
    agenda.advancementTokens = agenda.advancementRequirement ?? 2;
    s.cards["ag-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, { type: "score_agenda", cardId: "ag-1" });
    expect(s.pendingSabotage?.amount).toBe(1);
  });

  it("onAgendaScoredOrStolen may-charge for Daeg-class", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const daeg = instantiateCard("daeg-first-net-cat", "daeg-1", "runner:rig");
    daeg.onAgendaScoredOrStolen = fx.choose("runner", [
      {
        id: "charge",
        label: "Charge 1 installed card",
        effect: fx.chargeChoose(),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("runner", 0),
      },
    ]);
    s.cards["daeg-1"] = daeg;
    s.runner.rig.push("daeg-1");
    const prop = instantiateCard("propeller", "prop-1", "runner:rig");
    prop.powerCounters = 1;
    s.cards["prop-1"] = prop;
    s.runner.rig.push("prop-1");

    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-2",
      "server:remote-2:root",
    );
    agenda.advancementTokens = agenda.advancementRequirement ?? 2;
    s.cards["ag-2"] = agenda;
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["ag-2"],
    };
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, { type: "score_agenda", cardId: "ag-2" });
    expect(s.pendingChoice?.chooser).toBe("runner");
    s = must(s, { type: "choose_option", optionId: "charge" });
    // sole chargeable → auto charge
    expect(s.cards["prop-1"].powerCounters).toBe(2);
  });

  it("Stoneship charge paid ability eval", () => {
    const s = createInitialState();
    const ship = instantiateCard("stoneship-chart-room", "ship-1", "runner:rig");
    // Ensure charge ability exists even on pre-wiring pin
    if (!ship.paidAbilities?.some((a) => a.id === "stoneship-charge")) {
      ship.paidAbilities = [
        ...(ship.paidAbilities ?? []),
        {
          id: "stoneship-charge",
          label: "Trash Stoneship Chart Room: charge 1 installed card",
          clickCost: 0,
          creditCost: 0,
          cost: { trashSelf: true },
          windows: ["runner_action_paw"],
          effect: fx.chargeChoose(),
        },
      ];
    }
    s.cards["ship-1"] = ship;
    s.runner.rig.push("ship-1");
    const prop = instantiateCard("propeller", "prop-s", "runner:rig");
    prop.powerCounters = 2;
    s.cards["prop-s"] = prop;
    s.runner.rig.push("prop-s");
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    const before = prop.powerCounters;
    const next = must(s, {
      type: "use_paid_ability",
      cardId: "ship-1",
      abilityId: "stoneship-charge",
    });
    expect(next.cards["prop-s"].powerCounters).toBe(before + 1);
    expect(next.runner.discard).toContain("ship-1");
  });

  it("Carpe Diem onPlay identify_mark + gain credits", () => {
    const s = createInitialState();
    const before = s.runner.credits;
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.seq(fx.identifyMark(), fx.gainCredits("runner", 4)),
    );
    expect(r.ok).toBe(true);
    expect(s.markServerId).toBeTruthy();
    expect(s.runner.credits).toBe(before + 4);
  });
});

describe("MS card JSON wiring (when cards-data v0.5.0+ present)", () => {
  it("clears unsupported only where IR covers the card", () => {
    if (!cardsWiringPresent()) {
      // Older extract without wiring — host tests above cover mechanics.
      expect(getCardDef("chastushka").unsupported?.length ?? 0).toBeGreaterThan(
        0,
      );
      return;
    }
    expect(getCardDef("chastushka").unsupported).toEqual([]);
    expect(getCardDef("chastushka").runEvent?.skipBreach).toBe(true);
    expect(getCardDef("stoneship-chart-room").unsupported).toEqual([]);
    expect(
      getCardDef("stoneship-chart-room").paidAbilities?.some(
        (a) => a.id === "stoneship-charge",
      ),
    ).toBe(true);
    expect(getCardDef("daeg-first-net-cat").unsupported).toEqual([]);
    expect(getCardDef("daeg-first-net-cat").onAgendaScoredOrStolen).toBeTruthy();
    expect(getCardDef("carpe-diem").onPlay).toEqual(
      fx.seq(
        fx.identifyMark(),
        fx.gainCredits("runner", 4),
        fx.choose("runner", [
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
        ]),
      ),
    );
    expect(getCardDef("marrow").onAgendaScored).toEqual(fx.sabotage(1, true));
    expect(
      getCardDef("nyusha-sable-sintashta-symphonic-prodigy").onTurnBegin,
    ).toEqual(fx.identifyMark());
  });

  it("Chastushka end-to-end when wired", () => {
    if (!cardsWiringPresent()) return;
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("chastushka", "ch-1", "runner:grip");
    s.cards["ch-1"] = ev;
    s.runner.hand = ["ch-1"];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.servers.hq.ice = [];
    s = must(s, { type: "play_event", cardId: "ch-1", serverId: "hq" });
    expect(s.pendingSabotage?.amount).toBe(4);
    const legal = queryLegality(s);
    expect(
      legal.legal.some((a) => a.action.type === "resolve_sabotage"),
    ).toBe(true);
  });
});

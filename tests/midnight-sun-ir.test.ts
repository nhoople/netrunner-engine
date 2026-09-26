import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  CR,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.4.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("cards pin v0.4.0 + Midnight Sun load", () => {
  it("pins v0.4.0 and loads MS wave (in-progress)", () => {
    const pool = loadCardPool(true);
    expect(pool.corpusOrder).toEqual([
      "system-gateway",
      "system-update-2021",
      "midnight-sun",
    ]);
    expect(pool.waves["midnight-sun"].status).toBe("in-progress");
    const catalog = loadCardCatalog(true);
    expect(catalog.size).toBe(77 + 82 + 65);
    expect(catalog.has("maskirovka")).toBe(true);
    expect(catalog.has("chastushka")).toBe(true);
  });

  it("Maskirovka IR evaluates (fully-supported MS ice smoke)", () => {
    const def = getCardDef("maskirovka");
    expect(def.unsupported).toEqual([]);
    expect(def.subroutines?.[0]?.effect).toEqual(fx.gainCredits("corp", 2));
    expect(def.subroutines?.[1]?.effect).toEqual(fx.etr());
    const s = createInitialState();
    const ice = instantiateCard("maskirovka", "mask-1", "server:hq:ice");
    s.cards["mask-1"] = ice;
    s.corp.credits = 0;
    const r = evalEffect(
      { state: s, sourceId: "mask-1" },
      def.subroutines![0]!.effect,
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(2);
  });
});

describe("sabotage IR (CR §10.12)", () => {
  it("validates and auto-trashes from R&D then HQ facedown", () => {
    expect(validateEffectTree(fx.sabotage(2))).toBeNull();
    expect(CR.sabotage.number).toBe("10.12.1");

    const s = createInitialState();
    // Deck front = top of R&D
    const top = s.corp.deck[0]!;
    const hqBefore = s.corp.hand.length;
    const deckBefore = s.corp.deck.length;
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.sabotage(2),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.deck.length).toBe(deckBefore - 2);
    expect(s.corp.hand.length).toBe(hqBefore);
    expect(s.corp.discard).toContain(top);
    expect(s.cards[top].faceup).toBe(false);
    expect(s.cards[top].zone).toBe("corp:archives");
  });

  it("trashes all when HQ+R&D < N (CR 10.12.3b)", () => {
    const s = createInitialState();
    s.corp.deck = s.corp.deck.slice(0, 1);
    s.corp.hand = s.corp.hand.slice(0, 1);
    const total = s.corp.deck.length + s.corp.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.sabotage(5),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.deck.length).toBe(0);
    expect(s.corp.hand.length).toBe(0);
    expect(s.corp.discard.length).toBeGreaterThanOrEqual(total);
    for (const id of s.corp.discard.slice(-total)) {
      expect(s.cards[id].faceup).toBe(false);
    }
  });

  it("interactive sabotage pauses for Corp resolve_sabotage", () => {
    let s = createInitialState();
    // Ensure HQ has cards so Corp can choose.
    while (s.corp.hand.length < 2 && s.corp.deck.length > 0) {
      const id = s.corp.deck.shift()!;
      s.corp.hand.push(id);
      s.cards[id].zone = "corp:hq";
    }
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.sabotage(2, true),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingSabotage?.amount).toBe(2);

    const legal = queryLegality(s);
    const sabotageActs = legal.legal.filter(
      (a) => a.action.type === "resolve_sabotage",
    );
    expect(sabotageActs.length).toBeGreaterThan(0);

    const pickHq = s.corp.hand.slice(-1);
    s = must(s, { type: "resolve_sabotage", hqCardIds: pickHq });
    expect(s.pendingSabotage).toBeNull();
    expect(s.corp.discard.length).toBeGreaterThanOrEqual(2);
    expect(s.cards[pickHq[0]!].faceup).toBe(false);
  });
});

describe("mark IR (CR §10.11)", () => {
  it("identify_mark designates a central; second call is no-op", () => {
    expect(validateEffectTree(fx.identifyMark())).toBeNull();
    const s = createInitialState();
    expect(s.markServerId).toBeNull();
    expect(evalEffect({ state: s, sourceId: "runner-id" }, fx.identifyMark()).ok).toBe(
      true,
    );
    expect(s.markServerId).toBeTruthy();
    const first = s.markServerId;
    expect(evalEffect({ state: s, sourceId: "runner-id" }, fx.identifyMark()).ok).toBe(
      true,
    );
    expect(s.markServerId).toBe(first);
    expect(s.log.join("\n")).toMatch(/already/);
  });

  it("has_mark / attacking_mark conditions", () => {
    const s = createInitialState();
    expect(
      evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.if({ op: "has_mark" }, fx.gainCredits("runner", 1)),
      ).ok,
    ).toBe(true);
    expect(s.runner.credits).toBe(5); // no mark → else skipped

    evalEffect({ state: s, sourceId: "runner-id" }, fx.identifyMark());
    const mark = s.markServerId!;
    expect(
      evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.if({ op: "has_mark" }, fx.gainCredits("runner", 1)),
      ).ok,
    ).toBe(true);
    expect(s.runner.credits).toBe(6);

    s.run = {
      attackedServerId: mark,
      phase: "approach_ice",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    expect(
      evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.if({ op: "attacking_mark" }, fx.gainCredits("runner", 1)),
      ).ok,
    ).toBe(true);
    expect(s.runner.credits).toBe(7);
  });
});

describe("charge IR (CR §10.10)", () => {
  it("charges self only when ≥1 power counter present", () => {
    expect(validateEffectTree(fx.chargeSelf())).toBeNull();
    const s = createInitialState();
    const card = instantiateCard("propeller", "prop-1", "runner:rig");
    card.powerCounters = 0;
    s.cards["prop-1"] = card;
    s.runner.rig.push("prop-1");

    expect(
      evalEffect({ state: s, sourceId: "prop-1" }, fx.chargeSelf()).ok,
    ).toBe(true);
    expect(card.powerCounters).toBe(0);

    card.powerCounters = 2;
    expect(
      evalEffect({ state: s, sourceId: "prop-1" }, fx.chargeSelf()).ok,
    ).toBe(true);
    expect(card.powerCounters).toBe(3);
  });

  it("charge choose auto-picks sole candidate; multi opens pendingChoice", () => {
    const s = createInitialState();
    const a = instantiateCard("propeller", "prop-a", "runner:rig");
    a.powerCounters = 1;
    const b = instantiateCard("revolver", "rev-b", "runner:rig");
    b.powerCounters = 2;
    s.cards["prop-a"] = a;
    s.cards["rev-b"] = b;
    s.runner.rig.push("prop-a", "rev-b");

    expect(
      evalEffect({ state: s, sourceId: "runner-id" }, fx.chargeChoose()).ok,
    ).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.length).toBe(2);

    const opt = s.pendingChoice!.options[0]!;
    const before = s.cards[
      opt.id.startsWith("charge-") ? opt.id.slice("charge-".length) : ""
    ]?.powerCounters;
    let next = must(s, { type: "choose_option", optionId: opt.id });
    expect(next.pendingChoice).toBeNull();
    const targetId = opt.id.slice("charge-".length);
    expect(next.cards[targetId].powerCounters).toBe((before ?? 0) + 1);
  });

  it("fail-closed on unknown charge pick", () => {
    expect(
      validateEffectTree({
        op: "do",
        action: { kind: "charge", pick: "nope" },
      }),
    ).toMatch(/pick/);
  });
});

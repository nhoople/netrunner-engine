/**
 * Cards that say "do X unless the Runner pays Y" are nested costs
 * (CR 1.16.11b). The Runner may choose to pay only when the whole cost can be
 * paid; otherwise the instruction resolves. Cards that have the Corp trash
 * cards from HQ let the Corp choose them (CR 1.15.2).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  getCardDef,
  instantiateCard,
  playEffectFromCard,
} from "../src/index.js";
import type { Action, Effect, GameState } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

interface Row {
  id: string;
  zone: string;
  effect: () => Effect;
  /** What the Runner pays. */
  clicks?: number;
  credits?: number;
  /** True once the instruction has resolved. */
  penalty: (s: GameState) => boolean;
  prepare?: (s: GameState) => void;
}

function hook(id: string, key: string): () => Effect {
  return () => {
    const effect = (getCardDef(id) as unknown as Record<string, Effect | undefined>)[key];
    if (!effect) throw new Error(`${id} has no ${key}`);
    return effect;
  };
}

const tagged = (s: GameState) => s.runner.tags === 1;

const ROWS: Row[] = [
  {
    id: "city-surveillance",
    zone: "server:remote-1:root",
    effect: hook("city-surveillance", "onRunnerTurnBegin"),
    credits: 1,
    penalty: tagged,
  },
  {
    id: "data-ward",
    zone: "server:hq:ice",
    effect: hook("data-ward", "onEncounter"),
    credits: 3,
    penalty: tagged,
  },
  {
    id: "jaguarundi",
    zone: "server:hq:ice",
    effect: hook("jaguarundi", "onEncounter"),
    clicks: 1,
    penalty: tagged,
    prepare: (s) => {
      const agenda = instantiateCard("hostile-takeover", "ag-threat", "corp:score");
      agenda.agendaPoints = 4;
      s.cards["ag-threat"] = agenda;
      s.corp.scoreArea = ["ag-threat"];
    },
  },
  {
    id: "measured-response",
    zone: "corp:play-area",
    effect: () => playEffectFromCard(getCardDef("measured-response"))!,
    credits: 8,
    penalty: (s) => s.runner.discardPile.length === 4,
    prepare: (s) => {
      for (let i = 0; i < 5; i++) {
        s.cards[`grip-${i}`] = instantiateCard("sure-gamble", `grip-${i}`, "runner:grip");
        s.runner.hand.push(`grip-${i}`);
      }
    },
  },
  {
    id: "public-trail",
    zone: "corp:play-area",
    effect: () => playEffectFromCard(getCardDef("public-trail"))!,
    credits: 8,
    penalty: tagged,
  },
  {
    id: "sync-rerouting",
    zone: "corp:play-area",
    effect: hook("sync-rerouting", "onRunBegin"),
    credits: 4,
    penalty: tagged,
  },
  {
    id: "thule-subsea-safety-below",
    zone: "corp:hq",
    effect: hook("thule-subsea-safety-below", "onAgendaStolen"),
    clicks: 1,
    credits: 2,
    penalty: (s) => s.runner.coreDamage === 1,
  },
  {
    id: "fencer-fueno",
    zone: "runner:installed",
    effect: hook("fencer-fueno", "onRunnerTurnEnd"),
    credits: 1,
    penalty: (s) => s.cards["src"].zone === "runner:heap",
    prepare: (s) => {
      s.runner.installed.push("src");
      // The turn-end choice applies with 3 or more hosted credits.
      s.cards["src"].hostedCredits = 3;
    },
  },
  {
    id: "aggressive-trendsetting",
    zone: "corp:score",
    effect: hook("aggressive-trendsetting", "onFirstCorpCardTrashEachTurn"),
    clicks: 1,
    penalty: (s) => s.log.some((l) => /allotted|additional \[click\]|next turn/i.test(l)),
  },
];

function table(row: Row, clicks: number, credits: number): GameState {
  const s = structuredClone(createInitialState());
  s.cards["src"] = instantiateCard(row.id, "src", row.zone);
  s.cards["src"].rezzed = true;
  s.cards["src"].faceup = true;
  row.prepare?.(s);
  s.runner.clicks = clicks;
  s.runner.credits = credits;
  s.runner.tags = 0;
  return s;
}

describe("pay-or-penalty cards are nested costs (CR 1.16.11b)", () => {
  for (const row of ROWS) {
    const clicks = row.clicks ?? 0;
    const credits = row.credits ?? 0;

    describe(row.id, () => {
      it("resolves the instruction without a choice when the cost cannot be paid", () => {
        // One short of each part the cost asks for.
        const s = table(row, Math.max(0, clicks - 1), Math.max(0, credits - 1));
        const r = evalEffect({ state: s, sourceId: "src" }, row.effect());
        expect(r.ok).toBe(true);
        expect(s.pendingChoice).toBeFalsy();
        expect(row.penalty(s)).toBe(true);
        expect(s.runner.clicks).toBe(Math.max(0, clicks - 1));
      });

      it("lets the Runner pay the whole cost instead", () => {
        let s = table(row, clicks + 1, credits + 1);
        const r = evalEffect({ state: s, sourceId: "src" }, row.effect());
        expect(r.ok).toBe(true);
        expect(s.pendingChoice?.chooser).toBe("runner");
        expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
          "unless-instruction",
          "unless-pay",
        ]);
        s = must(s, { type: "choose_option", optionId: "unless-pay" });
        expect(s.runner.clicks).toBe(1);
        expect(s.runner.credits).toBe(1);
        expect(row.penalty(s)).toBe(false);
      });

      it("resolves the instruction when the Runner declines to pay", () => {
        let s = table(row, clicks + 1, credits + 1);
        evalEffect({ state: s, sourceId: "src" }, row.effect());
        s = must(s, { type: "choose_option", optionId: "unless-instruction" });
        expect(s.runner.clicks).toBe(clicks + 1);
        expect(row.penalty(s)).toBe(true);
      });
    });
  }

  it("Thule Subsea cannot be paid with the credits alone", () => {
    const row = ROWS.find((r) => r.id === "thule-subsea-safety-below")!;
    const s = table(row, 0, 10);
    evalEffect({ state: s, sourceId: "src" }, row.effect());
    expect(s.pendingChoice).toBeFalsy();
    expect(s.runner.coreDamage).toBe(1);
    expect(s.runner.credits).toBe(10);
  });
});

describe("the Corp chooses which HQ cards a card trashes (CR 1.15.2)", () => {
  function corpWithHq(sourceDef: string, zone: string, titles: string[]): GameState {
    const s = structuredClone(createInitialState());
    s.cards["src"] = instantiateCard(sourceDef, "src", zone);
    s.corp.hand = [];
    titles.forEach((defId, i) => {
      s.cards[`hq-${i}`] = instantiateCard(defId, `hq-${i}`, "corp:hq");
      s.corp.hand.push(`hq-${i}`);
    });
    return s;
  }

  it("Hansei Review trashes the card the Corp picks", () => {
    let s = corpWithHq("hansei-review", "corp:play-area", ["hedge-fund", "ice-wall", "pad-campaign"]);
    const r = evalEffect({ state: s, sourceId: "src" }, playEffectFromCard(getCardDef("hansei-review"))!);
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "choose-card:hq-0",
      "choose-card:hq-1",
      "choose-card:hq-2",
    ]);
    s = must(s, { type: "choose_option", optionId: "choose-card:hq-1" });
    expect(s.corp.hand).toEqual(["hq-0", "hq-2"]);
    expect(s.cards["hq-1"].zone).toBe("corp:archives");
    // Trashed from HQ: facedown in Archives (CR 4.4.6b).
    expect(s.cards["hq-1"].faceup).toBe(false);
  });

  it("Longevity Serum lets the Corp trash any number, including none", () => {
    const effect = (getCardDef("longevity-serum") as unknown as { onScore: Effect }).onScore;
    let s = corpWithHq("longevity-serum", "corp:score", ["hedge-fund", "ice-wall", "pad-campaign"]);
    evalEffect({ state: s, sourceId: "src" }, effect);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "choose-cards-done")).toBe(true);
    s = must(s, { type: "choose_option", optionId: "choose-card:hq-2" });
    s = must(s, { type: "choose_option", optionId: "choose-card:hq-0" });
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(s.corp.hand).toEqual(["hq-1"]);
    expect(s.cards["hq-0"].zone).toBe("corp:archives");
    expect(s.cards["hq-2"].zone).toBe("corp:archives");

    let none = corpWithHq("longevity-serum", "corp:score", ["hedge-fund", "ice-wall"]);
    evalEffect({ state: none, sourceId: "src" }, effect);
    none = must(none, { type: "choose_option", optionId: "choose-cards-done" });
    expect(none.corp.hand).toEqual(["hq-0", "hq-1"]);
  });

  it("Anemone trashes the HQ card the Corp picks", () => {
    const effect = (getCardDef("anemone") as unknown as { onRez: Effect }).onRez;
    let s = corpWithHq("anemone", "server:hq:ice", ["hedge-fund", "ice-wall"]);
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    s.servers.hq.ice = ["src"];
    s.runner.hand = [];
    for (let i = 0; i < 3; i++) {
      s.cards[`grip-${i}`] = instantiateCard("sure-gamble", `grip-${i}`, "runner:grip");
      s.runner.hand.push(`grip-${i}`);
    }
    evalEffect({ state: s, sourceId: "src" }, effect);
    s = must(s, { type: "choose_option", optionId: "trash-hq-net" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "choose-card:hq-1" });
    expect(s.corp.hand).toEqual(["hq-0"]);
    expect(s.cards["hq-1"].zone).toBe("corp:archives");
    expect(s.runner.hand).toHaveLength(1);
  });
});

/**
 * Printed-text sweep S2 fixes (CR audit program, slice PF-S2).
 *
 * Each describe block is one Standard card the S2 sweep found playing
 * against its printed text (tests/baselines/printed-sweep.json). The card
 * text wins over the model (CR 1.2.1). Each test name states the printed
 * behavior and cites the rule it follows. The first six blocks are the
 * visibility leaks: a seat saw a card it may not see (CR 10.2.2a).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
  evalEffect,
  expireLingeringEffects,
  getPublicView,
  instantiateCard,
  loadCardCatalog,
  openFace,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { Action, ServerId } from "../src/state/types.js";
import { fx, type Effect } from "../src/effects/ir.js";
import {
  endLooksAndReveals,
  revealCards,
} from "../src/state/visibility/reveal.js";
import { trashCard } from "../src/state/hostingAndTrash/trash.js";
import { stealOrTrashBlocked } from "../src/actions/access.js";
import { beginBreachAccess } from "../src/state/access/access.js";
import { fireIceRezDuringRunHooks } from "../src/effects/rez/rezDuringRunHooks.js";
import { placeMark } from "../src/state/keywordsAndCredits/keywords.js";
import { passIdle } from "../src/demo/passIdle.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/** The default board with no Runner card marked rezzed (CR 8.1.4f). */
function fresh(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return s;
}

function run(s: GameState, sourceId: string, effect: Effect) {
  const r = evalEffect({ state: s, sourceId }, effect);
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
}

/** Resolve one option of the open choice as its chooser. */
function pick(s: GameState, optionId: string): void {
  const choice = s.pendingChoice;
  const option = choice?.options.find((o) => o.id === optionId);
  if (!choice || !option) {
    throw new Error(
      `No option ${optionId}; open: ${JSON.stringify(choice?.options.map((o) => o.id))}`,
    );
  }
  s.pendingChoice = null;
  run(s, choice.sourceId, option.effect);
}

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

/** Put cards on top of R&D, first id on top. */
function stackRd(s: GameState, cards: Array<[string, string]>): void {
  for (const [defId, id] of [...cards].reverse()) {
    put(s, defId, id, "corp:rd");
    s.corp.deck.unshift(id);
  }
}

function revealedTitles(s: GameState): string[] {
  return (s.reveals ?? []).flatMap((r) => r.cards.map((c) => c.title));
}

function optionLabels(s: GameState): string[] {
  return (s.pendingChoice?.options ?? []).map((o) => o.label);
}

describe("Vera Ivanovna Shuyskaya (visibility)", () => {
  it("the Corp does not see the grip before choosing to reveal it, and after the reveal must trash 1 revealed card (CR 10.2.2a, 1.21.3)", () => {
    const s = fresh();
    const vera = put(s, "vera-ivanovna-shuyskaya", "vera-1", "corp:hq");
    vera.rezzed = true;
    put(s, "sure-gamble", "grip-sg", "runner:grip");
    put(s, "corroder", "grip-cor", "runner:grip");
    s.runner.hand = ["grip-sg", "grip-cor"];

    run(s, "vera-1", fx.mayTrashOneFromGrip());
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "reveal-grip",
      "decline",
    ]);
    // Nothing in the Corp's choice names a grip card.
    for (const label of optionLabels(s)) {
      expect(label).not.toMatch(/Sure Gamble|Corroder/);
    }
    expect(revealedTitles(s)).toEqual([]);

    pick(s, "reveal-grip");
    expect(revealedTitles(s)).toEqual(
      expect.arrayContaining(["Sure Gamble", "Corroder"]),
    );
    // The trash is not optional once the grip is revealed.
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "trash-grip:grip-sg",
      "trash-grip:grip-cor",
    ]);
    pick(s, "trash-grip:grip-cor");
    expect(s.runner.hand).toEqual(["grip-sg"]);
    expect(s.runner.discardPile).toContain("grip-cor");
  });

  it("declining reveals nothing and trashes nothing (CR 9.6.9)", () => {
    const s = fresh();
    put(s, "vera-ivanovna-shuyskaya", "vera-1", "corp:hq");
    put(s, "sure-gamble", "grip-sg", "runner:grip");
    s.runner.hand = ["grip-sg"];
    run(s, "vera-1", fx.mayTrashOneFromGrip());
    pick(s, "decline");
    expect(revealedTitles(s)).toEqual([]);
    expect(s.runner.hand).toEqual(["grip-sg"]);
  });
});

describe("Complete Image (visibility)", () => {
  it("the Corp names from every Runner card name, not from the Runner's grip and stack, so the list shows nothing hidden (CR 10.2.2a, 10.2.2b)", () => {
    const empty = fresh();
    put(empty, "complete-image", "ci-1", "corp:play-area");
    empty.runner.hand = [];
    empty.runner.deck = [];
    run(empty, "ci-1", fx.do({ kind: "name_net_damage_loop" }));
    const withoutCards = empty.pendingChoice?.options.map((o) => o.id);

    const s = fresh();
    put(s, "complete-image", "ci-1", "corp:play-area");
    put(s, "sure-gamble", "grip-sg", "runner:grip");
    s.runner.hand = ["grip-sg"];
    run(s, "ci-1", fx.do({ kind: "name_net_damage_loop" }));
    const options = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(options).toEqual(withoutCards);
    // A card in no Runner zone can be named too.
    expect(options).toContain("ci-name:Corroder");
    expect(options).not.toContain("ci-name:Hedge Fund");
  });

  it("after a named card is trashed, the Corp chooses a card name again before the next net damage (CR 1.2.1)", () => {
    const s = fresh();
    put(s, "complete-image", "ci-1", "corp:play-area");
    put(s, "sure-gamble", "grip-sg", "runner:grip");
    s.runner.hand = ["grip-sg"];
    run(s, "ci-1", fx.do({ kind: "name_net_damage_loop" }));
    pick(s, "ci-name:Sure Gamble");
    expect(s.runner.discardPile).toContain("grip-sg");
    expect(
      s.pendingChoice?.options.some((o) => o.id.startsWith("ci-name:")),
    ).toBe(true);
  });
});

describe("Whistleblower (visibility)", () => {
  it("the Runner names from every agenda name, not from the Corp's cards, so the list shows nothing in HQ or R&D (CR 10.2.2a, 10.2.2b)", () => {
    const named = (s: GameState) => {
      put(s, "whistleblower", "wb-1", "runner:installed");
      s.runner.installed.push("wb-1");
      s.run = { attackedServerId: "hq" } as GameState["run"];
      run(
        s,
        "wb-1",
        fx.do({ kind: "may_trash_name_agenda_steal_ignore_costs" }),
      );
      return s.pendingChoice?.options.map((o) => o.id) ?? [];
    };
    const plain = named(fresh());
    const s = fresh();
    stackRd(s, [["hedge-fund", "rd-hf"]]);
    put(s, "ice-wall", "hq-iw", "corp:hq");
    s.corp.hand.push("hq-iw");
    const withCards = named(s);
    expect(withCards).toEqual(plain);
    expect(withCards).not.toContain("wb-name:Hedge Fund");
    expect(withCards).not.toContain("wb-name:Ice Wall");
    expect(withCards).toContain("wb-name:Hostile Takeover");
  });
});

describe("Architect Deployment Test (visibility)", () => {
  it("an agenda it installs goes in facedown and is revealed, so the Runner does not keep seeing it (CR 8.5.2, 8.5.13d)", () => {
    const s = fresh();
    put(s, "architect-deployment-test", "adt-1", "corp:score");
    stackRd(s, [
      ["hostile-takeover", "rd-ht"],
      ["hedge-fund", "rd-hf"],
    ]);
    run(s, "adt-1", fx.lookTopNRdMayInstallAndRezIgnoreCosts(5));
    pick(s, "rd-look-install-rez:rd-ht");
    const ht = s.cards["rd-ht"]!;
    expect(ht.zone).toMatch(/^server:remote-\d+:root$/);
    expect(ht.faceup).toBe(false);
    expect(ht.rezzed).toBe(false);
    expect(revealedTitles(s)).toContain("Hostile Takeover");
    endLooksAndReveals(s);
    const server = ht.zone.split(":")[1];
    const runnerView = getPublicView(s, "runner");
    const root = runnerView.servers.find((v) => v.id === server)?.root;
    expect(root?.[0]?.title).toBeNull();
  });
});

describe("Pivot (visibility)", () => {
  it("the Runner does not see the card Pivot found once it is in HQ; it is revealed once, after R&D is shuffled (CR 1.21.3, 1.21.6, 8.7.3)", () => {
    const s = fresh();
    put(s, "pivot", "pivot-1", "corp:play-area");
    stackRd(s, [
      ["ice-wall", "rd-iw"],
      ["hostile-takeover", "rd-ht"],
      ["hedge-fund", "rd-hf"],
    ]);
    run(s, "pivot-1", fx.searchRdOperationOrAgendaToHq());
    // The Corp chooses among the operations and agendas, or finds none.
    expect(s.pendingChoice?.chooser).toBe("corp");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(
      expect.arrayContaining([
        "choose-card:rd-ht",
        "choose-card:rd-hf",
        "choose-cards-done",
      ]),
    );
    expect(ids).not.toContain("choose-card:rd-iw");
    pick(s, "choose-card:rd-hf");
    if (s.pendingChoice) pick(s, "choose-cards-done");
    const hf = s.cards["rd-hf"]!;
    expect(s.corp.hand).toContain("rd-hf");
    expect(revealedTitles(s)).toContain("Hedge Fund");
    endLooksAndReveals(s);
    expect(hf.faceup).toBe(false);
    expect(openFace(hf, "runner").title).toBeNull();
  });
});

describe("Epiphany Analytica: Nations Undivided (visibility)", () => {
  it("a looked-at card whose install is refused stays hidden in R&D, never faceup in HQ (CR 1.21.6, 10.2.2a)", () => {
    const s = fresh();
    // Unscheduled Maintenance: the Corp cannot install more than 1 piece
    // of ice each turn. One ice is already installed this turn.
    const um = put(s, "unscheduled-maintenance", "um-1", "runner:play-area");
    expect(um.corpMaxIceInstallsPerTurn).toBe(1);
    put(s, "ice-wall", "hq-iw", "server:hq:ice");
    s.servers.hq!.ice.push("hq-iw");
    s.turn.installedThisTurn = [...(s.turn.installedThisTurn ?? []), "hq-iw"];
    stackRd(s, [["enigma", "rd-en"]]);
    s.corp.deck = s.corp.deck.filter((id) => id !== "rd-en");
    s.turn.rdLookedCards = ["rd-en"];
    const hand = [...s.corp.hand];
    run(
      s,
      s.corp.identityId,
      fx.do({ kind: "install_rd_looked_card_paying_costs", cardId: "rd-en" }),
    );
    const en = s.cards["rd-en"]!;
    expect(s.corp.hand).toEqual(hand);
    expect(s.corp.deck[0]).toBe("rd-en");
    expect(en.zone).toBe("corp:rd");
    expect(en.faceup).toBe(false);
  });

  it("a card it installs passes through HQ facedown (CR 8.5.2, 10.2.2a)", () => {
    const s = fresh();
    s.corp.credits = 10;
    stackRd(s, [["pad-campaign", "rd-pad"]]);
    s.corp.deck = s.corp.deck.filter((id) => id !== "rd-pad");
    s.turn.rdLookedCards = ["rd-pad"];
    run(
      s,
      s.corp.identityId,
      fx.do({ kind: "install_rd_looked_card_paying_costs", cardId: "rd-pad" }),
    );
    const pad = s.cards["rd-pad"]!;
    expect(pad.zone).toMatch(/^server:remote-\d+:root$/);
    expect(pad.faceup).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Card-own fixes (not visibility).
// ---------------------------------------------------------------------------

/** Replace an identity in place, keeping its id. */
function setIdentity(s: GameState, side: "corp" | "runner", defId: string) {
  const id = side === "corp" ? s.corp.identityId : s.runner.identityId;
  const zone = s.cards[id]!.zone;
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

/** A rezzed Corp card installed in the root of a new remote. */
function installRoot(s: GameState, defId: string, id: string, rezzed = true) {
  const serverId = `remote-${id}`;
  (s.servers as Record<string, unknown>)[serverId] = {
    id: serverId,
    kind: "remote",
    root: [id],
    ice: [],
  };
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = rezzed;
  return card;
}

function installRunner(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "runner:installed");
  s.runner.installed.push(id);
  return card;
}

/** A run in its breach on `server`, before any access. */
function breachRun(s: GameState, server: ServerId): void {
  s.run = {
    attackedServerId: server,
    phase: "breach",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
}

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  }
  return passIdle(result.state);
}

describe("Hostile Architecture", () => {
  it("the Corp trashing its own installed card does no meat damage and does not use up the turn; the Runner's trash does (CR 1.14.5a)", () => {
    const s = fresh();
    installRoot(s, "hostile-architecture", "ha-1");
    installRoot(s, "pad-campaign", "pad-1");
    installRoot(s, "pad-campaign", "pad-2");
    put(s, "sure-gamble", "g-1", "runner:grip");
    put(s, "sure-gamble", "g-2", "runner:grip");
    put(s, "sure-gamble", "g-3", "runner:grip");
    s.runner.hand = ["g-1", "g-2", "g-3"];
    trashCard(s, "pad-1", { by: "corp" });
    expect(s.turn.hostileArchitectureUsedThisTurn).toBe(false);
    expect(s.runner.hand).toHaveLength(3);
    trashCard(s, "pad-2", { by: "runner" });
    expect(s.turn.hostileArchitectureUsedThisTurn).toBe(true);
  });
});

describe("Ob Superheavy Logistics: Extract. Export. Excel.", () => {
  it("the Runner trashing a rezzed Corp card does not meet 'when you trash a rezzed card' or use up the turn (CR 1.14.5)", () => {
    const s = fresh();
    setIdentity(s, "corp", "ob-superheavy-logistics-extract-export-excel");
    installRoot(s, "pad-campaign", "pad-1");
    installRoot(s, "pad-campaign", "pad-2");
    trashCard(s, "pad-1", { by: "runner" });
    expect(s.turn.obSuperheavyUsedThisTurn).toBeFalsy();
    trashCard(s, "pad-2", { by: "corp" });
    expect(s.turn.obSuperheavyUsedThisTurn).toBe(true);
  });
});

describe("Yakov Erikovich Avdakov", () => {
  it("an unrezzed Yakov the Runner trashes gives the Corp nothing; a rezzed one gives 2 credits (CR 9.1.8g)", () => {
    const s = fresh();
    installRoot(s, "yakov-erikovich-avdakov", "yak-1", false);
    const credits = s.corp.credits;
    trashCard(s, "yak-1", { by: "runner" });
    expect(s.corp.credits).toBe(credits);

    installRoot(s, "yakov-erikovich-avdakov", "yak-2", true);
    trashCard(s, "yak-2", { by: "runner" });
    expect(s.corp.credits).toBe(credits + 2);
  });
});

describe("Storgotic Resonator", () => {
  it("a Runner card the Runner trashes as a cost does not count as the Corp trashing it; the Corp's trash does (CR 1.14.5)", () => {
    const s = fresh();
    installRoot(s, "storgotic-resonator", "sr-1");
    const faction = s.cards[s.runner.identityId]!.faction;
    const same = [...loadCardCatalog().values()].find(
      (d) => d.side === "runner" && d.type === "event" && d.faction === faction,
    )!;
    put(s, same.id, "g-1", "runner:grip");
    put(s, same.id, "g-2", "runner:grip");
    s.runner.hand = ["g-1", "g-2"];
    trashCard(s, "g-1", { by: "runner", cause: "cost" });
    expect(
      s.turn.firstTrashMatchingRunnerIdentityFactionMetPending,
    ).toBeFalsy();
    trashCard(s, "g-2", { by: "corp" });
    expect(s.turn.firstTrashMatchingRunnerIdentityFactionMetPending).toBe(true);
  });
});

describe("Pinhole Threading", () => {
  it("an accessed asset can still be trashed; only an agenda is protected from stealing and trashing (CR 1.2.1)", () => {
    const s = fresh();
    installRoot(s, "pad-campaign", "pad-1");
    installRoot(s, "hostile-takeover", "ht-1", false);
    breachRun(s, "hq");
    put(s, "pinhole-threading", "pin-1", "runner:play-area");
    run(s, "pin-1", fx.do({ kind: "access_one_root_other_server" }));
    expect(s.run!.cannotStealOrTrash).toBeUndefined();
    expect(stealOrTrashBlocked(s, "pad-1")).toBe(false);
    expect(stealOrTrashBlocked(s, "ht-1")).toBe(true);
  });
});

describe("Regenesis", () => {
  it("the Corp chooses which facedown agenda, or none, and it is revealed before it goes to the score area (CR 1.15.2, 1.21.3)", () => {
    const s = fresh();
    s.turn.corpCardsAddedToArchivesThisTurn = 0;
    put(s, "regenesis", "reg-1", "corp:score");
    const a = put(s, "hostile-takeover", "ar-1", "corp:archives");
    const b = put(s, "priority-requisition", "ar-2", "corp:archives");
    a.faceup = false;
    b.faceup = false;
    s.corp.discardPile = ["ar-1", "ar-2"];
    run(
      s,
      "reg-1",
      fx.do({ kind: "score_facedown_agenda_from_archives_if_clean" }),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "regenesis:ar-1",
      "regenesis:ar-2",
      "decline",
    ]);
    pick(s, "regenesis:ar-2");
    expect(s.corp.scoreArea).toContain("ar-2");
    expect(s.corp.discardPile).toEqual(["ar-1"]);
    expect(revealedTitles(s)).toContain("Priority Requisition");
  });
});

describe("Stavka", () => {
  it("its +5 strength lasts the rest of the run, after its own encounter ends (CR 9.10.1)", () => {
    const s = fresh();
    const st = put(s, "stavka", "st-1", "server:hq:ice");
    st.rezzed = true;
    s.servers.hq!.ice = ["st-1"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    const base = effectiveIceStrength(s, "st-1");
    run(s, "st-1", fx.do({ kind: "fortify_ice", amount: 5 }));
    expireLingeringEffects(s, { encounter: true });
    expect(effectiveIceStrength(s, "st-1")).toBe(base + 5);
    expireLingeringEffects(s, { run: true });
    expect(effectiveIceStrength(s, "st-1")).toBe(base);
  });

  it("with no run in progress it does nothing and does not fail after its cost (CR 9.10.4)", () => {
    const s = fresh();
    put(s, "stavka", "st-1", "server:hq:ice");
    s.run = null;
    run(s, "st-1", fx.do({ kind: "fortify_ice", amount: 5 }));
  });
});

describe("Brasília Government Grid", () => {
  it("declining does not use it up, it watches any ice rezzed during a run on its server, and the +3 lasts the run (CR 9.3.6g, 9.10.1)", () => {
    const s = fresh();
    installRoot(s, "brasilia-government-grid", "bgg-1");
    const server = "remote-bgg-1" as ServerId;
    // Ice protecting HQ is rezzed during a run on Brasília's server.
    const a = put(s, "ice-wall", "iw-a", "server:hq:ice");
    const b = put(s, "ice-wall", "iw-b", "server:hq:ice");
    const other = put(s, "enigma", "en-1", "server:archives:ice");
    s.servers.hq!.ice = ["iw-a", "iw-b"];
    s.servers.archives!.ice = ["en-1"];
    other.rezzed = true;
    s.run = { attackedServerId: server } as GameState["run"];
    a.rezzed = true;
    fireIceRezDuringRunHooks(s, "iw-a");
    expect(s.pendingChoice?.sourceId).toBe("bgg-1");
    pick(s, "decline-brasilia");
    expect(s.turn.brasiliaAbilityUsedIds).toEqual([]);

    b.rezzed = true;
    const base = effectiveIceStrength(s, "iw-b");
    fireIceRezDuringRunHooks(s, "iw-b");
    pick(s, "brasilia-derez:en-1");
    expect(other.rezzed).toBe(false);
    expect(s.turn.brasiliaAbilityUsedIds).toEqual(["bgg-1"]);
    expireLingeringEffects(s, { encounter: true });
    expect(effectiveIceStrength(s, "iw-b")).toBe(base + 3);
  });
});

describe("Mercury: Chrome Libertador", () => {
  it("declining the extra access does not use up its once per turn, and it is offered once per breach (CR 9.3.6g)", () => {
    const s = fresh();
    setIdentity(s, "runner", "mercury-chrome-libertador");
    breachRun(s, "rd");
    beginBreachAccess(s);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "mercury-bonus",
      "decline",
    ]);
    pick(s, "decline");
    expect(s.turn.mercuryBreachBonusUsedThisTurn).toBeFalsy();
    beginBreachAccess(s);
    expect(s.pendingChoice).toBeNull();

    // A later run that turn may still use it.
    breachRun(s, "hq");
    beginBreachAccess(s);
    pick(s, "mercury-bonus");
    expect(s.turn.mercuryBreachBonusUsedThisTurn).toBe(true);
    expect(s.run!.bonusAccess).toBe(1);
  });
});

describe("Pretty Mary da Silva", () => {
  it("counts R&D Interface's extra access when deciding whether the Runner may access 2 or more cards (CR 9.6.5d)", () => {
    const s = fresh();
    installRunner(s, "pretty-mary-da-silva", "pm-1");
    installRunner(s, "r-d-interface", "rdi-1");
    breachRun(s, "rd");
    beginBreachAccess(s);
    expect(s.pendingChoice?.sourceId).toBe("pm-1");
    pick(s, "pretty-mary-bonus");
    beginBreachAccess(s);
    // 1 + R&D Interface + Pretty Mary.
    expect(s.run!.randomAccessLimit).toBe(3);
  });
});

describe("The Twinning", () => {
  it("the Runner may remove up to 2 power counters, or none, for that many extra accesses (CR 9.6.9)", () => {
    const s = fresh();
    const tw = installRunner(s, "the-twinning", "tw-1");
    tw.powerCounters = 3;
    breachRun(s, "hq");
    beginBreachAccess(s);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "twinning-access:1",
      "twinning-access:2",
      "decline",
    ]);
    pick(s, "decline");
    expect(tw.powerCounters).toBe(3);
    beginBreachAccess(s);
    expect(s.pendingChoice).toBeNull();
    expect(s.run!.bonusAccess ?? 0).toBe(0);
  });
});

describe("Info Bounty", () => {
  it("the first mark run to end uses it even without a breach, so a later breached mark run that turn gains nothing (CR 1.2.1)", () => {
    let s = fresh();
    installRunner(s, "info-bounty", "ib-1");
    placeMark(s, "archives", s.corp.identityId);
    s.servers.archives!.ice = [];
    s.corp.discardPile = [];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, { type: "basic_run", serverId: "archives" });
    // The Runner jacks out before the breach.
    s = must(s, { type: "jack_out" });
    expect(s.run).toBeNull();
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    expect(s.turn.infoBountyMarkRunEndUsed).toBe(true);
    const credits = s.runner.credits;
    s = must(s, { type: "basic_run", serverId: "archives" });
    s = must(s, { type: "continue_run" });
    expect(s.run).toBeNull();
    expect(s.runner.credits).toBe(credits);
  });
});

describe("Juli Moreira Lee", () => {
  it("a resource's paid ability with no [click] in its cost is not an action and does not meet the trigger (CR 5.2.1)", () => {
    let s = fresh();
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 10;
    const juli = installRunner(s, "juli-moreira-lee", "juli-1");
    juli.powerCounters = 4;
    installRunner(s, "first-responders", "fr-1");
    installRunner(s, "professional-contacts", "pc-1");
    s.priorityStack = [];
    s.timingKey = "runner.actionPaw";
    // First Responders' condition: damage from a Corp card this turn.
    s.turn.esSufferedCorpDamageThisTurn = true;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "fr-1",
      abilityId: "first-responders-draw",
    });
    expect(s.turn.firstResourcePaidAbilityThisTurn).toBe(false);
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    s = must(s, {
      type: "use_paid_ability",
      cardId: "pc-1",
      abilityId: "pro-contacts",
    });
    expect(s.turn.firstResourcePaidAbilityThisTurn).toBe(true);
  });
});

describe("Nuvem SA: Law of the Land", () => {
  it("an R&D trash on the Runner's turn gives the Corp nothing; the first one on the Corp's turn does, even when a Runner card makes the Corp trash it (CR 1.14.5)", () => {
    const s = fresh();
    setIdentity(s, "corp", "nuvem-sa-law-of-the-land");
    installRunner(s, "spoilers", "sp-1");
    stackRd(s, [
      ["hedge-fund", "rd-1"],
      ["hedge-fund", "rd-2"],
    ]);
    const credits = s.corp.credits;
    s.activeSide = "runner";
    run(s, "sp-1", fx.do({ kind: "trash_top_of_rd" }));
    expect(s.corp.credits).toBe(credits);
    expect(s.turn.nuvemFirstRdTrashUsedThisTurn).toBeFalsy();
    s.activeSide = "corp";
    run(s, "sp-1", fx.do({ kind: "trash_top_of_rd" }));
    expect(s.corp.credits).toBe(credits + 2);
  });
});

describe("Hyoubu Institute: Absolute Clarity", () => {
  it("any card the Corp reveals meets 'the first time each turn you reveal a card', not only Hyoubu's own reveal (CR 1.21.3)", () => {
    const s = fresh();
    setIdentity(s, "corp", "hyoubu-institute-absolute-clarity");
    put(s, "hedge-fund", "hq-1", "corp:hq");
    s.corp.hand.push("hq-1");
    put(s, "pivot", "pivot-1", "corp:play-area");
    revealCards(s, ["hq-1"], "pivot-1");
    expect(s.turn.firstRevealMetPending).toBe(true);

    const t = fresh();
    setIdentity(t, "corp", "hyoubu-institute-absolute-clarity");
    put(t, "sure-gamble", "g-1", "runner:grip");
    t.runner.hand = ["g-1"];
    installRunner(t, "spoilers", "sp-1");
    revealCards(t, ["g-1"], "sp-1");
    expect(t.turn.firstRevealMetPending).toBeFalsy();
  });
});

describe("Cerebral Overwriter", () => {
  it("the Runner cannot lose all clicks to prevent its core damage, which it does not print (CR 1.2.1)", () => {
    const s = fresh();
    const co = installRoot(s, "cerebral-overwriter", "co-1", false);
    co.advancementCounters = 2;
    s.corp.credits = 5;
    s.runner.clicks = 3;
    run(
      s,
      "co-1",
      fx.do({
        kind: "may_pay_credits_for_core_damage_per_advancement",
        amount: 3,
      }),
    );
    pick(s, "pay");
    expect(s.pendingDamage?.preventByLoseAllClicks ?? false).toBe(false);
  });
});

describe("Hearts and Minds", () => {
  it("the Corp chooses the card it can advance that gets the counter and the other card it comes from (CR 1.15.2)", () => {
    const s = fresh();
    put(s, "hearts-and-minds", "hm-1", "corp:score");
    const from1 = installRoot(s, "pad-campaign", "pad-1");
    const from2 = installRoot(s, "pad-campaign", "pad-2");
    from1.advancementCounters = 1;
    from2.advancementCounters = 2;
    installRoot(s, "hostile-takeover", "ht-1", false);
    installRoot(s, "hostile-takeover", "ht-2", false);
    run(s, "hm-1", fx.do({ kind: "move_advancements", amount: 1 }));
    // Only cards the Corp can advance get the counter.
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "move-adv-to:ht-1",
      "move-adv-to:ht-2",
    ]);
    pick(s, "move-adv-to:ht-2");
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "move-adv-from:pad-1",
      "move-adv-from:pad-2",
    ]);
    pick(s, "move-adv-from:pad-2");
    expect(from2.advancementCounters).toBe(1);
    expect(s.cards["ht-2"]!.advancementCounters).toBe(1);
    expect(s.cards["ht-1"]!.advancementCounters ?? 0).toBe(0);
  });
});

describe('Tsakhia "Bankhar" Gantulga', () => {
  it("uses the server the ice protects, and only the turn's first such encounter: a second encounter with the same ice is not replaced (CR 1.2.1)", () => {
    let s = fresh();
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 5;
    for (const id of s.runner.hand) delete s.cards[id];
    s.runner.hand = [];
    for (let i = 0; i < 4; i++) {
      put(s, "sure-gamble", `g-${i}`, "runner:grip");
      s.runner.hand.push(`g-${i}`);
    }
    const g = installRunner(s, "tsakhia-bankhar-gantulga", "gan-1");
    g.namedServerId = "hq";
    const ice = put(s, "ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    ice.subroutines = [{ id: "etr", text: "End the run.", effect: fx.etr() }];
    s.servers.hq!.ice = ["ice-1"];
    const runHq = () => {
      if (s.timingKey === "runner.actionPaw") {
        s = must(s, { type: "pass_window" });
      }
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      for (let i = 0; i < 20 && s.run; i++) {
        if (s.pendingChoice) {
          s = must(s, {
            type: "choose_option",
            optionId: s.pendingChoice.options[0]!.id,
          });
          continue;
        }
        const r = applyAction(s, { type: "pass_window" });
        if (!r.ok) break;
        s = r.state;
      }
    };
    runHq();
    expect(s.runner.hand).toHaveLength(3);
    const replaced = s.log.filter((l) => l.includes('as "Do 1 net damage."'));
    expect(replaced).toHaveLength(1);
    // The second run: the same ice ends the run instead of doing damage.
    runHq();
    expect(s.runner.hand).toHaveLength(3);
    expect(
      s.log.filter((l) => l.includes('as "Do 1 net damage."')),
    ).toHaveLength(1);
  });
});

describe("Pravdivost Consulting and Vladisibirsk City Grid", () => {
  const placeOf = (defId: string): Effect => {
    const def = loadCardCatalog().get(defId)!;
    const text = JSON.stringify(def.abilities);
    const m =
      /\{"op":"do","action":\{"kind":"place_advancements"[^}]*\}\}/.exec(text);
    return JSON.parse(m![0]) as Effect;
  };

  it("Pravdivost Consulting: the Corp chooses which card it can advance gets the counter (CR 1.15.2)", () => {
    const s = fresh();
    installRoot(s, "hostile-takeover", "ht-1", false);
    installRoot(s, "hostile-takeover", "ht-2", false);
    run(
      s,
      s.corp.identityId,
      placeOf("pravdivost-consulting-political-solutions"),
    );
    expect(s.pendingChoice?.chooser).toBe("corp");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.some((id) => id.includes("ht-1"))).toBe(true);
    expect(ids.some((id) => id.includes("ht-2"))).toBe(true);
    expect(ids).not.toContain("decline");
  });

  it("Vladisibirsk City Grid: the Corp chooses which other card in its root gets the counters (CR 1.15.2)", () => {
    const s = fresh();
    const vcg = installRoot(s, "vladisibirsk-city-grid", "vcg-1");
    const server = vcg.zone.split(":")[1]!;
    for (const id of ["ht-1", "ht-2"]) {
      put(s, "hostile-takeover", id, `server:${server}:root`);
      (s.servers as Record<string, { root: string[] }>)[server]!.root.push(id);
    }
    run(s, "vcg-1", placeOf("vladisibirsk-city-grid"));
    expect(s.pendingChoice?.chooser).toBe("corp");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.some((id) => id.includes("ht-1"))).toBe(true);
    expect(ids.some((id) => id.includes("ht-2"))).toBe(true);
    expect(ids.some((id) => id.includes("vcg-1"))).toBe(false);
  });
});

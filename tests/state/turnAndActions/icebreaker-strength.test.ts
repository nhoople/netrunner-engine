/**
 * Icebreakers break only at strength equal to or greater than the ice's
 * (CR audit program, fix-now session FX-breakers).
 *
 * CR 3.9.5g: "The Runner can only use an interface ability on an icebreaker
 * if the icebreaker has strength greater than or equal to the strength of
 * the encountered ice." CR 9.3.6c says the same of the interface flag. About
 * 38 programs break only through a paid ability, and that path checked no
 * strength, so a strength-1 Curupira broke a strength-3 Wall of Static. Every
 * break now calls the one check in `src/state/turnAndActions/break.ts`.
 *
 * The check is keyed on what an ability does, not on the card data's
 * `interface` flag: 69 pump abilities carry that flag although their printed
 * text does not, and they must still work below the ice's strength.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  evalEffect,
  instantiateCard,
  legalActions,
  loadCardCatalog,
} from "../../../src/index.js";
import type { GameState } from "../../../src/index.js";
import type { Action } from "../../../src/state/types/actions.js";
import type { PaidAbility } from "../../../src/state/types/abilities.js";
import { hostCard } from "../../../src/state/hostingAndTrash/host.js";
import {
  breakActionCost,
  paidAbilityBreakBlock,
} from "../../../src/state/turnAndActions/break.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
  loadCardCatalog(true);
});

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

function installRunner(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "runner:installed");
  s.runner.installed.push(id);
  return card;
}

/**
 * The Runner's turn, encountering rezzed `iceDef` protecting HQ, in the
 * encounter's paid ability window (CR 6.9.3b).
 */
function encountering(iceDef: string, iceId = "ice-1"): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  s.activeSide = "runner";
  s.runner.clicks = 3;
  s.runner.credits = 10;
  s.priorityStack = [];
  const ice = put(s, iceDef, iceId, "server:hq:ice");
  ice.rezzed = true;
  ice.faceup = true;
  s.servers.hq.ice = [iceId];
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: {
      iceId,
      broken: (ice.subroutines ?? []).map(() => false),
    },
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
  s.timingKey = "run.encounterPaw";
  return s;
}

function use(cardId: string, abilityId: string): Action {
  return { type: "use_paid_ability", cardId, abilityId } as Action;
}

function offered(s: GameState, cardId: string, abilityId: string): boolean {
  return legalActions(s).some(
    (a) =>
      a.type === "use_paid_ability" &&
      a.cardId === cardId &&
      a.abilityId === abilityId,
  );
}

function must(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("paid-ability breaks check strength (CR 3.9.5g, 9.3.6c)", () => {
  it("a strength-1 Curupira cannot break a strength-3 Wall of Static subroutine until it is pumped (CR 3.9.5g)", () => {
    let s = encountering("wall-of-static");
    installRunner(s, "curupira", "cur-1");
    expect(effectiveBreakerStrength(s, "cur-1")).toBe(1);

    // Below strength: not offered, and refused before any credit is spent.
    expect(offered(s, "cur-1", "curupira-break")).toBe(false);
    const refused = applyAction(s, use("cur-1", "curupira-break"));
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.cites.map((c) => c.number)).toContain("3.9.5g");
    }
    expect(s.runner.credits).toBe(10);
    expect(s.run!.encounter!.broken).toEqual([false]);

    // Pumping is still allowed below strength.
    expect(offered(s, "cur-1", "curupira-pump")).toBe(true);
    s = must(s, use("cur-1", "curupira-pump"));
    expect(offered(s, "cur-1", "curupira-break")).toBe(false);
    s = must(s, use("cur-1", "curupira-pump"));
    expect(effectiveBreakerStrength(s, "cur-1")).toBe(3);

    // Equal strength: the break is offered and breaks the subroutine.
    expect(offered(s, "cur-1", "curupira-break")).toBe(true);
    s = must(s, use("cur-1", "curupira-break"));
    expect(s.run!.encounter!.broken).toEqual([true]);
    expect(s.runner.credits).toBe(7);
  });

  it("a strength-1 Living Mural hosted on a strength-3 Drafter cannot break its subroutine until it is pumped (CR 3.9.5g)", () => {
    let s = encountering("drafter", "drafter-1");
    const mural = installRunner(s, "living-mural", "mural-1");
    hostCard(s, "mural-1", "drafter-1", { installed: true });
    expect(mural.hostId).toBe("drafter-1");
    expect(effectiveBreakerStrength(s, "mural-1")).toBe(1);

    expect(offered(s, "mural-1", "mural-break")).toBe(false);
    expect(applyAction(s, use("mural-1", "mural-break")).ok).toBe(false);
    expect(s.run!.encounter!.broken.some(Boolean)).toBe(false);

    s = must(s, use("mural-1", "mural-pump"));
    expect(effectiveBreakerStrength(s, "mural-1")).toBe(3);
    expect(offered(s, "mural-1", "mural-break")).toBe(true);
    s = must(s, use("mural-1", "mural-break"));
    expect(s.run!.encounter!.broken.filter(Boolean)).toHaveLength(1);
  });

  it("a strength-6 Slap Vandal cannot break a subroutine on a strength-7 host ice it has no way to match (CR 3.9.5g)", () => {
    const s = encountering("little-engine", "le-1");
    installRunner(s, "slap-vandal", "sv-1");
    hostCard(s, "sv-1", "le-1", { installed: true });
    const ability = s.cards["sv-1"]!.paidAbilities![0]!;
    expect(offered(s, "sv-1", ability.id)).toBe(false);
    expect(applyAction(s, use("sv-1", ability.id)).ok).toBe(false);
    expect(s.runner.credits).toBe(10);
  });

  it("Banner's interface ability cannot be used below the barrier's strength (CR 3.9.5g)", () => {
    const s = encountering("wall-of-static");
    installRunner(s, "banner", "ban-1");
    // Banner is strength 5; Wall of Static is 3, so it can be used.
    expect(offered(s, "ban-1", "banner-suppress-etr")).toBe(true);
    s.cards["ice-1"]!.strength = 6;
    expect(offered(s, "ban-1", "banner-suppress-etr")).toBe(false);
    expect(applyAction(s, use("ban-1", "banner-suppress-etr")).ok).toBe(false);
  });

  it("Wyrm's interface ability that gives the ice -1 strength cannot be used below the ice's strength, while Corsair's non-interface -3 can (CR 3.9.5g)", () => {
    const s = encountering("wall-of-static");
    installRunner(s, "wyrm", "wyrm-1");
    expect(offered(s, "wyrm-1", "wyrm-weaken")).toBe(false);
    expect(applyAction(s, use("wyrm-1", "wyrm-weaken")).ok).toBe(false);
    const corsair = installRunner(s, "corsair", "cor-1");
    const weaken = (corsair.paidAbilities ?? []).find(
      (a) => a.id === "corsair-weaken",
    )!;
    expect(paidAbilityBreakBlock(s, "cor-1", weaken)).toBeNull();
  });

  it("Umbrella cannot break a code gate that hosts no trojan, even at full strength (card text, CR 1.2.1)", () => {
    let s = encountering("enigma", "en-1");
    installRunner(s, "umbrella", "umb-1");
    expect(offered(s, "umb-1", "umbrella-break")).toBe(false);
    expect(applyAction(s, use("umb-1", "umbrella-break")).ok).toBe(false);
    installRunner(s, "slap-vandal", "sv-1");
    hostCard(s, "sv-1", "en-1", { installed: true });
    expect(offered(s, "umb-1", "umbrella-break")).toBe(true);
    s = must(s, use("umb-1", "umbrella-break"));
    expect(s.run!.encounter!.broken.some(Boolean)).toBe(true);
  });

  it("a breaker that trashes itself to break is checked at the moment it is used: a strength-0 Crowbar with no other icebreakers cannot break Enigma (CR 3.9.5g)", () => {
    const s = encountering("enigma", "en-1");
    installRunner(s, "crowbar", "cb-1");
    const ability = s.cards["cb-1"]!.paidAbilities![0]!;
    expect(applyAction(s, use("cb-1", ability.id)).ok).toBe(false);
    expect(s.runner.installed).toContain("cb-1");
  });
});

describe("every installed breaker can still pump (the interface check keys on the break, not the flag)", () => {
  it("every icebreaker's pump that the card data flags as interface is allowed below the ice's strength, and its breaks are not (CR 3.9.5b, 3.9.5g)", () => {
    const catalog = loadCardCatalog();
    let flaggedPumps = 0;
    const blockedPumps: string[] = [];
    const unblockedBreaks: string[] = [];
    for (const def of catalog.values()) {
      if (def.type !== "program") continue;
      if (!(def.subtypes ?? []).includes("icebreaker")) continue;
      const s = encountering("wall-of-static");
      // Strength 99: no breaker in the corpus reaches it unpumped.
      s.cards["ice-1"]!.strength = 99;
      const card = installRunner(s, def.id, "brk-1");
      for (const ab of (card.paidAbilities ?? []) as PaidAbility[]) {
        const json = JSON.stringify(ab.effect);
        const pumps = json.includes('"pump_strength"');
        const breaks = /"kind":"break_/.test(json);
        const flagged = (def.abilities ?? []).some(
          (a) =>
            (a as { id?: string; flag?: string }).id === ab.id &&
            (a as { flag?: string }).flag === "interface",
        );
        if (pumps && !breaks && flagged) {
          flaggedPumps += 1;
          if (paidAbilityBreakBlock(s, "brk-1", ab)) {
            blockedPumps.push(`${def.id}:${ab.id}`);
          }
        }
        if (breaks && !paidAbilityBreakBlock(s, "brk-1", ab)) {
          unblockedBreaks.push(`${def.id}:${ab.id}`);
        }
      }
    }
    expect(flaggedPumps).toBe(69);
    expect(blockedPumps).toEqual([]);
    expect(unblockedBreaks).toEqual([]);
  });

  it("Curupira's pump is used for real below strength and raises its strength (CR 3.9.5b)", () => {
    let s = encountering("wall-of-static");
    installRunner(s, "curupira", "cur-1");
    s.cards["ice-1"]!.strength = 9;
    s = must(s, use("cur-1", "curupira-pump"));
    expect(effectiveBreakerStrength(s, "cur-1")).toBe(2);
  });
});

describe("break limits on the paid path", () => {
  /** Hammer is encountered: its encounter ability caps printed breaks at 1. */
  function hammer(): GameState {
    const s = encountering("hammer", "ham-1");
    const r = evalEffect(
      { state: s, sourceId: "ham-1" },
      {
        op: "do",
        action: { kind: "limit_printed_breaks_on_source_for_run", max: 1 },
      },
    );
    expect(r.ok).toBe(true);
    return s;
  }

  function breakWith(s: GameState, sourceId: string, maxSubs: number) {
    const r = evalEffect(
      { state: s, sourceId },
      { op: "do", action: { kind: "break_encounter_subroutine", maxSubs } },
    );
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
  }

  it("Hammer: a non-killer paid break breaks only 1 of its printed subroutines (card text, CR 1.2.1)", () => {
    const s = hammer();
    installRunner(s, "audrey-v2", "aud-1");
    breakWith(s, "aud-1", 2);
    expect(s.run!.encounter!.broken).toEqual([true, false, false]);
    breakWith(s, "aud-1", 2);
    expect(s.run!.encounter!.broken).toEqual([true, false, false]);
  });

  it("Hammer: breaks made with a killer do not count toward its limit (card text, CR 1.2.1)", () => {
    const s = hammer();
    installRunner(s, "cerberus-cuj-0-h3", "cuj-1");
    installRunner(s, "audrey-v2", "aud-1");
    breakWith(s, "cuj-1", 2);
    expect(s.run!.encounter!.broken).toEqual([true, true, false]);
    breakWith(s, "aud-1", 2);
    expect(s.run!.encounter!.broken).toEqual([true, true, true]);
  });

  it("Hammer: a subroutine it gained is not printed and does not count toward its limit (card text, CR 1.2.1)", () => {
    const s = hammer();
    const ice = s.cards["ham-1"]!;
    ice.subroutines = [
      ...(ice.subroutines ?? []),
      {
        id: "gained-etr",
        text: "End the run.",
        effect: { op: "do", action: { kind: "end_the_run" } },
      },
    ];
    s.run!.encounter!.broken.push(false);
    installRunner(s, "audrey-v2", "aud-1");
    breakWith(s, "aud-1", 2);
    // One printed subroutine and the gained one.
    expect(s.run!.encounter!.broken).toEqual([true, false, false, true]);
  });

  it("Anvil: the Runner cannot break its printed subroutines this encounter, and the next encounter with it is unaffected (CR 9.10.1)", () => {
    const s = encountering("anvil", "anv-1");
    installRunner(s, "audrey-v2", "aud-1");
    const r = evalEffect(
      { state: s, sourceId: "anv-1" },
      { op: "do", action: { kind: "forbid_runner_break_on_source" } },
    );
    expect(r.ok).toBe(true);
    breakWith(s, "aud-1", 2);
    expect(s.run!.encounter!.broken).toEqual([false, false]);
    // A new encounter with the same Anvil (the run ended during this one).
    s.run!.encounter = { iceId: "anv-1", broken: [false, false] };
    breakWith(s, "aud-1", 2);
    expect(s.run!.encounter!.broken).toEqual([true, true]);
  });

  it("Hammer: Audrey v2 used for real at full strength breaks only 1 of Hammer's printed subroutines (card text, CR 1.2.1)", () => {
    let s = hammer();
    s.cards["ham-1"]!.strength = 0;
    const audrey = installRunner(s, "audrey-v2", "aud-1");
    audrey.virusCounters = 2;
    s = must(s, use("aud-1", "audrey-break"));
    expect(s.run!.encounter!.broken.filter(Boolean)).toHaveLength(1);
  });

  it("Anvil: Kongamato cannot break Anvil's first printed subroutine after Anvil's ability (card text, CR 1.2.1)", () => {
    const s = encountering("anvil", "anv-1");
    installRunner(s, "kongamato", "kong-1");
    evalEffect(
      { state: s, sourceId: "anv-1" },
      { op: "do", action: { kind: "forbid_runner_break_on_source" } },
    );
    const r = evalEffect(
      { state: s, sourceId: "kong-1" },
      { op: "do", action: { kind: "break_first_subroutine" } },
    );
    expect(r.ok).toBe(true);
    expect(s.run!.encounter!.broken).toEqual([false, false]);
  });

  it("Hammer: Matryoshka is offered only as many breaks as Hammer allows, so it does not pay for breaks that cannot happen (card text, CR 1.2.1)", () => {
    const s = hammer();
    s.cards["ham-1"]!.strength = 0;
    const mat = installRunner(s, "matryoshka", "mat-1");
    put(s, "matryoshka", "mat-2", "hosted:mat-1");
    s.cards["mat-2"]!.faceup = true;
    hostCard(s, "mat-2", "mat-1", { faceup: true });
    expect(mat.hostedCardIds).toContain("mat-2");
    const r = evalEffect(
      { state: s, sourceId: "mat-1" },
      { op: "do", action: { kind: "break_matryoshka" } },
    );
    expect(r.ok).toBe(true);
    // One break is allowed, so it resolves at once for 1 credit.
    expect(s.pendingChoice).toBeFalsy();
    expect(s.runner.credits).toBe(9);
    expect(s.run!.encounter!.broken.filter(Boolean)).toHaveLength(1);
  });
});

describe("the basic break action uses the same check", () => {
  it("Boi-tatá's break costs 1 credit less after the Runner trashed one of their installed cards this turn (card text, CR 1.2.1)", () => {
    const s = encountering("ice-wall", "iw-1");
    installRunner(s, "boi-tata", "boi-1");
    expect(breakActionCost(s, "boi-1")).toBe(2);
    s.turn.runnerTrashedOwnInstalledThisTurn = true;
    expect(breakActionCost(s, "boi-1")).toBe(1);
  });

  it("a declared breaker below the ice's strength is not offered the break action and is refused (CR 3.9.5g)", () => {
    const s = encountering("wall-of-static");
    installRunner(s, "corroder", "cor-1");
    s.cards["ice-1"]!.strength = 5;
    expect(
      legalActions(s).some(
        (a) => a.type === "break_subroutine" && a.breakerId === "cor-1",
      ),
    ).toBe(false);
    const r = applyAction(s, {
      type: "break_subroutine",
      breakerId: "cor-1",
      subIndex: 0,
    } as Action);
    expect(r.ok).toBe(false);
  });
});

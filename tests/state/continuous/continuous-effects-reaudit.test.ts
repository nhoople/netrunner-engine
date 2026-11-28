/**
 * Re-audit of the continuous-effect rules (CR audit program, session RA-2).
 *
 * The standardization program (S1–S6) built the 9.12 continuous layer, the
 * 9.10 lingering-effect registry, the declared static abilities and the S4
 * choice helper before the CR-first loop existed. This file checks each of
 * those paths against CR v26.03 by playing a board through the engine.
 *
 * - `it(...)`: the path follows the rule it cites.
 * - RA-2 filed the wrong paths as `it.fails` tests titled "RF:"; session
 *   RF-2 fixed each one and turned it into a plain `it` (engine #964 lists
 *   the paths).
 *
 * Paths already covered by a CR example test (9.4.4, 9.4.5, 9.10.3a–c,
 * 9.10.5, 9.12.1c, 9.12.1e) are listed in the PR, not repeated here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  abilitiesSuppressed,
  addIceStrengthBoostThisTurn,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  blankAbilitiesUntilCorpTurnEnd,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  enterStep,
  instantiateCard,
  legalActions,
  loadCardCatalog,
  openPendingChoose,
  orderBlankingEffects,
  resolveBlankedCardIds,
} from "../../../src/index.js";
import type { GameState } from "../../../src/index.js";
import type { Action } from "../../../src/state/types/actions.js";
import type { RunState } from "../../../src/state/types/run.js";
import { addIceStrengthBoostThisRun } from "../../../src/state/continuous/lingeringEffects.js";
import { hostCard } from "../../../src/state/hostingAndTrash/host.js";
import { trashCard } from "../../../src/state/hostingAndTrash/trash.js";
import { memoryLimit } from "../../../src/state/turnAndActions/turn.js";
import { collectSubBoostEtrSubs } from "../../../src/state/continuous/continuousSubs.js";
import { dealDamage } from "../../../src/state/damageAndPrevention/damage.js";
import { expectStateDelta, snapshot } from "../../effects/kind-coverage.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
  loadCardCatalog(true);
});

// --- Board helpers ---------------------------------------------------------

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

function rezzedIce(s: GameState, defId: string, id: string, serverId = "hq") {
  const ice = put(s, defId, id, `server:${serverId}:ice`);
  ice.rezzed = true;
  ice.faceup = true;
  s.servers[serverId as "hq"].ice.push(id);
  return ice;
}

/** A Corp asset rezzed in the root of remote-1. */
function rezzedRemoteAsset(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "server:remote-1:root");
  card.rezzed = true;
  card.faceup = true;
  s.servers["remote-1" as "hq"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: [id],
  } as never;
  return card;
}

/** A new game in the Runner's action step, with no Runner card rezzed. */
function runnerTurn(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  s.activeSide = "runner";
  s.runner.clicks = 4;
  s.runner.credits = 10;
  s.priorityStack = [];
  s.timingKey = "runner.takeAction";
  return s;
}

function runState(serverId: string, extra: Partial<RunState> = {}): RunState {
  return {
    attackedServerId: serverId,
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
    ...extra,
  } as RunState;
}

/** The Runner encountering rezzed `iceId` on HQ, in the encounter's paid ability window. */
function encountering(s: GameState, iceId: string): GameState {
  const ice = s.cards[iceId]!;
  s.run = runState("hq", {
    encounter: {
      iceId,
      broken: (ice.subroutines ?? []).map(() => false),
    },
  });
  s.timingKey = "run.encounterPaw";
  return s;
}

function must(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function use(cardId: string, abilityId: string): Action {
  return { type: "use_paid_ability", cardId, abilityId } as Action;
}

/**
 * Both players pass (and take the first option of any choice) until `stop`
 * holds. Unbroken subroutines resolve as they would at the table.
 */
function playUntil(
  s: GameState,
  stop: (s: GameState) => boolean,
  pick?: (s: GameState) => Action | undefined,
): GameState {
  for (let i = 0; i < 80 && !stop(s); i += 1) {
    const acts = legalActions(s);
    const action =
      pick?.(s) ??
      acts.find((a) => a.type === "pass_window") ??
      acts.find((a) => a.type === "choose_option") ??
      acts.find((a) => a.type === "discard_to_hand_size");
    if (!action) throw new Error(`No action at ${s.timingKey}`);
    s = must(s, action);
  }
  if (!stop(s)) throw new Error(`Did not reach the stop at ${s.timingKey}`);
  return s;
}

const runOver = (s: GameState) => s.run === null || s.run === undefined;

/** A later run on HQ, encountering the same ice again. */
function encounterAgain(s: GameState, iceId: string): GameState {
  s.run = runState("hq", { encounter: { iceId, broken: [false] } });
  return s;
}

// --- CR 9.10: lingering effects --------------------------------------------

describe("lingering effects and their expiry at 10.3.1b (CR 9.10)", () => {
  it("Klevetnik's 'until your next turn ends' blank lasts through the Runner's turn end and ends at the checkpoint after the Corp's turn ends (CR 9.10.1, 10.3.1b)", () => {
    // Rezzed during a run, in the Runner's turn: the Runner's turn ends and
    // the blank stays.
    const s = runnerTurn();
    rezzedIce(s, "klevetnik", "klev-1");
    installRunner(s, "daily-casts", "dc-1");
    blankAbilitiesUntilCorpTurnEnd(s, { createdBy: "klev-1", cardId: "dc-1" });
    expect(abilitiesSuppressed(s, "dc-1")).toBe(true);
    s.timingKey = "runner.discard";
    enterStep(s, "runner.turnEnds");
    autoWalk(s);
    expect(s.turn.turnDurationsPassed).toBe("runner");
    const corpTurn = playUntil(s, (x) => x.activeSide === "corp");
    // The checkpoint after the Runner's turn has run (it consumes the flag)
    // and kept the Corp-turn blank.
    expect(corpTurn.turn.turnDurationsPassed).toBeUndefined();
    expect(abilitiesSuppressed(corpTurn, "dc-1")).toBe(true);

    // The Corp's turn ends: the checkpoint before the Runner's turn removes it.
    const t = createInitialState();
    for (const card of Object.values(t.cards)) {
      if (card.side === "runner") card.rezzed = false;
    }
    rezzedIce(t, "klevetnik", "klev-1");
    installRunner(t, "daily-casts", "dc-1");
    blankAbilitiesUntilCorpTurnEnd(t, { createdBy: "klev-1", cardId: "dc-1" });
    t.activeSide = "corp";
    t.timingKey = "corp.loseClicks";
    enterStep(t, "corp.turnEnds");
    autoWalk(t);
    expect(abilitiesSuppressed(t, "dc-1")).toBe(true);
    const before = snapshot(t);
    const runnerNext = playUntil(t, (x) => x.activeSide === "runner");
    expectStateDelta(before, runnerNext, { lingeringEffects: { to: [] } });
    expect(abilitiesSuppressed(runnerNext, "dc-1")).toBe(false);
  });

  it("an 'until the end of the turn' strength boost lasts through a whole run and its checkpoints in that turn (CR 9.10.1, 10.3.1b)", () => {
    let s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-rd", "rd");
    addIceStrengthBoostThisTurn(s, {
      createdBy: "wall-rd",
      iceId: "wall-rd",
      amount: 2,
    });
    const before = snapshot(s);
    s = must(s, { type: "basic_run", serverId: "archives" } as Action);
    s = playUntil(s, runOver);
    expectStateDelta(before, s, { "runner.clicks": -1 });
    expect(s.lingeringEffects).toHaveLength(1);
    expect(effectiveIceStrength(s, "wall-rd")).toBe(3);
  });

  it("a lingering blank stays after the card that created it is trashed (CR 9.10.1)", () => {
    const s = runnerTurn();
    rezzedIce(s, "klevetnik", "klev-1");
    installRunner(s, "daily-casts", "dc-1");
    blankAbilitiesUntilCorpTurnEnd(s, {
      createdBy: "klev-1",
      cardId: "dc-1",
    });
    const before = snapshot(s);
    trashCard(s, "klev-1", { by: "corp" } as never);
    expectStateDelta(before, s, {
      "cards.klev-1.zone": { to: "corp:archives" },
    });
    expect(abilitiesSuppressed(s, "dc-1")).toBe(true);
  });

  it("a lingering blank on a card ends when that card is trashed, since it moved to a new zone and is a new object (CR 1.12.1, 1.12.2, 9.10.1)", () => {
    const s = runnerTurn();
    rezzedIce(s, "klevetnik", "klev-1");
    installRunner(s, "crowdfunding", "cf-1");
    blankAbilitiesUntilCorpTurnEnd(s, { createdBy: "klev-1", cardId: "cf-1" });
    expect(abilitiesSuppressed(s, "cf-1")).toBe(true);
    const before = snapshot(s);
    trashCard(s, "cf-1", { by: "runner" } as never);
    expectStateDelta(before, s, {
      "cards.cf-1.zone": { to: "runner:heap" },
      lingeringEffects: { to: [] },
    });
    // Crowdfunding's heap ability is not blanked by the earlier object's blank.
    expect(abilitiesSuppressed(s, "cf-1")).toBe(false);
  });

  it("Malia Z0L0K4's chosen resource, trashed and installed again, is a new object and keeps its abilities (CR 1.12.1, 1.12.2)", () => {
    let s = runnerTurn();
    const malia = rezzedRemoteAsset(s, "malia-z0l0k4", "malia-1");
    installRunner(s, "daily-casts", "dc-1");
    malia.tdatdMaliaBlankTargetId = "dc-1";
    expect(abilitiesSuppressed(s, "dc-1")).toBe(true);
    trashCard(s, "dc-1", { by: "runner" } as never);
    s.runner.discardPile = s.runner.discardPile.filter((id) => id !== "dc-1");
    s.cards["dc-1"]!.zone = "runner:grip" as never;
    s.runner.hand.push("dc-1");
    s = must(s, {
      type: "basic_install",
      cardId: "dc-1",
      destination: { kind: "installed" },
    } as Action);
    expect(s.cards["malia-1"]!.tdatdMaliaBlankTargetId).toBeUndefined();
    expect(abilitiesSuppressed(s, "dc-1")).toBe(false);
  });

  it("Hush on Klevetnik does not end Klevetnik's lingering blank, which exists apart from its source (CR 9.10.1, 9.12.1d)", () => {
    const s = runnerTurn();
    rezzedIce(s, "klevetnik", "klev-1");
    installRunner(s, "daily-casts", "dc-1");
    blankAbilitiesUntilCorpTurnEnd(s, {
      createdBy: "klev-1",
      cardId: "dc-1",
    });
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "klev-1", { installed: true } as never);
    expect(abilitiesSuppressed(s, "klev-1")).toBe(true);
    expect(abilitiesSuppressed(s, "dc-1")).toBe(true);
  });

  it("an ice strength boost 'for the remainder of the run' lasts through the run's checkpoints and ends at the checkpoint after the run ends (CR 9.10.1, 10.3.1b)", () => {
    let s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    rezzedIce(s, "ice-wall", "wall-rd", "rd");
    s = must(s, { type: "basic_run", serverId: "hq" } as Action);
    addIceStrengthBoostThisRun(s, {
      createdBy: "wall-rd",
      iceId: "wall-rd",
      amount: 5,
    });
    expect(effectiveIceStrength(s, "wall-rd")).toBe(6);

    // The run passes the initiation and approach checkpoints and reaches the
    // encounter with HQ's ice; the boost is still there.
    s = playUntil(s, (x) => x.timingKey === "run.encounterPaw");
    expect(effectiveIceStrength(s, "wall-rd")).toBe(6);

    // Ice Wall's subroutine ends the run; the next checkpoint removes it.
    const before = snapshot(s);
    s = playUntil(s, runOver);
    expectStateDelta(before, s, { lingeringEffects: { to: [] } });
    s.run = runState("rd", {
      encounter: { iceId: "wall-rd", broken: [false] },
    });
    expect(effectiveIceStrength(s, "wall-rd")).toBe(1);
  });

  it("an icebreaker's pump ends at the checkpoint after the encounter while the run goes on (CR 9.10.4a, 3.9.5b, 10.3.1b)", () => {
    let s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    installRunner(s, "corroder", "cor-1");
    s = encountering(s, "wall-1");
    s = must(s, use("cor-1", "corroder-pump"));
    expect(effectiveBreakerStrength(s, "cor-1")).toBe(3);
    s = must(s, {
      type: "break_subroutine",
      breakerId: "cor-1",
      subIndex: 0,
    } as Action);
    const before = snapshot(s);
    s = playUntil(s, (x) => x.timingKey === "run.passIcePaw");
    expect(s.run).toBeTruthy();
    expectStateDelta(before, s, { lingeringEffects: { to: [] } });
    expect(effectiveBreakerStrength(s, "cor-1")).toBe(2);
  });

  it("an icebreaker's pump for the encounter ends when an unbroken subroutine ends the run during that encounter (CR 6.1.4, 9.10.1, 10.3.1b, 3.9.5b)", () => {
    let s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    installRunner(s, "corroder", "cor-1");
    s = encountering(s, "wall-1");
    s = must(s, use("cor-1", "corroder-pump"));
    expect(effectiveBreakerStrength(s, "cor-1")).toBe(3);
    s = playUntil(s, runOver);
    expect(s.lingeringEffects).toEqual([]);
    expect(effectiveBreakerStrength(encounterAgain(s, "wall-1"), "cor-1")).toBe(
      2,
    );
  });

  it("Datasucker's −1 strength 'until the end of the encounter' does not carry into the next run when the run ends during that encounter (CR 6.1.4, 9.10.1, 10.3.1b)", () => {
    let s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    const sucker = installRunner(s, "datasucker", "ds-1");
    sucker.virusCounters = 1;
    s = encountering(s, "wall-1");
    s = must(s, use("ds-1", "datasucker-weaken"));
    expect(effectiveIceStrength(s, "wall-1")).toBe(0);
    s = playUntil(s, runOver);
    expect(s.lingeringEffects).toEqual([]);
    expect(effectiveIceStrength(encounterAgain(s, "wall-1"), "wall-1")).toBe(1);
  });

  /** Thunderbolt Armaments as the Corp's identity, Stavka unrezzed on HQ. */
  function thunderboltRun(): GameState {
    let s = runnerTurn();
    const oldId = s.corp.identityId;
    put(
      s,
      "thunderbolt-armaments-peace-through-power",
      "tb-id",
      "corp:identity",
    );
    delete s.cards[oldId];
    s.corp.identityId = "tb-id";
    s.corp.credits = 20;
    put(s, "stavka", "stavka-1", "server:hq:ice");
    s.servers.hq.ice = ["stavka-1"];
    installRunner(s, "daily-casts", "dc-1");
    s = must(s, { type: "basic_run", serverId: "hq" } as Action);
    s = playUntil(
      s,
      (x) => x.cards["stavka-1"]!.rezzed === true,
      (x) => legalActions(x).find((a) => a.type === "rez_ice"),
    );
    expect(effectiveIceStrength(s, "stavka-1")).toBe(3);
    return s;
  }

  it("Thunderbolt Armaments' +1 strength lasts 'for the remainder of that run', after the ice's encounter ends (CR 1.2.1, 9.10.1)", () => {
    let s = thunderboltRun();
    // The Runner trashes Daily Casts for Thunderbolt's subroutine, so the
    // run goes on past Stavka.
    s = playUntil(
      s,
      (x) => x.timingKey === "run.passIcePaw",
      (x) =>
        legalActions(x).find(
          (a) =>
            a.type === "choose_option" &&
            (a as { optionId: string }).optionId === "unless-pay",
        ),
    );
    expect(s.run).toBeTruthy();
    expect(effectiveIceStrength(s, "stavka-1")).toBe(3);
  });

  it("Thunderbolt Armaments' +1 strength does not carry into the next run when the run ends during the encounter (CR 6.1.4, 9.10.1, 10.3.1b)", () => {
    let s = thunderboltRun();
    s = playUntil(s, runOver, (x) =>
      legalActions(x).find(
        (a) =>
          a.type === "choose_option" &&
          (a as { optionId: string }).optionId === "unless-instruction",
      ),
    );
    expect(
      effectiveIceStrength(encounterAgain(s, "stavka-1"), "stavka-1"),
    ).toBe(2);
  });

  it("Bad Times' memory limit cut 'until the end of the turn' ends when the Corp's turn ends (CR 1.2.1, 9.10.1, 10.3.1b)", () => {
    let s = createInitialState();
    for (const card of Object.values(s.cards)) {
      if (card.side === "runner") card.rezzed = false;
    }
    put(s, "bad-times", "bad-1", "corp:hq");
    s.corp.hand = ["bad-1"];
    s.runner.tags = 1;
    s.corp.credits = 10;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const printed = memoryLimit(s);
    s = must(s, { type: "play_operation", cardId: "bad-1" } as Action);
    expect(memoryLimit(s)).toBe(printed - 2);
    s = playUntil(s, (x) => x.activeSide === "runner");
    expect(memoryLimit(s)).toBe(printed);
  });
});

// --- CR 9.4: static abilities ------------------------------------------------

describe("static abilities apply only while active (CR 9.4.1)", () => {
  it("an active Rumor Mill makes a rezzed unique asset lose its printed abilities (CR 9.4.1, 9.12.1d)", () => {
    const s = runnerTurn();
    rezzedRemoteAsset(s, "chairman-hiro", "hiro-1");
    expect(abilitiesSuppressed(s, "hiro-1")).toBe(false);
    put(s, "rumor-mill", "rm-1", "runner:play-area");
    expect(abilitiesSuppressed(s, "hiro-1")).toBe(true);
  });

  it("Rumor Mill in the heap no longer blanks unique assets (CR 1.8.4a, 3.7.1b, 9.4.1)", () => {
    const s = runnerTurn();
    rezzedRemoteAsset(s, "chairman-hiro", "hiro-1");
    put(s, "rumor-mill", "rm-1", "runner:heap");
    s.runner.discardPile.push("rm-1");
    expect(abilitiesSuppressed(s, "hiro-1")).toBe(false);
  });
});

describe("static conditions (CR 9.4.2)", () => {
  it("Curtain Wall has +4 strength only while it is the outermost ice protecting its server (CR 9.4.2)", () => {
    const s = runnerTurn();
    rezzedIce(s, "curtain-wall", "curtain-1");
    expect(effectiveIceStrength(s, "curtain-1")).toBe(10);
    const outer = put(s, "ice-wall", "wall-1", "server:hq:ice");
    outer.rezzed = true;
    outer.faceup = true;
    const before = snapshot(s);
    s.servers.hq.ice.unshift("wall-1");
    expectStateDelta(before, s, {
      "servers.hq.ice": { to: ["wall-1", "curtain-1"] },
    });
    expect(effectiveIceStrength(s, "curtain-1")).toBe(6);
  });
});

describe("installed Runner cards are active only while faceup (CR 9.4.1, 1.8.4a)", () => {
  /** Paparazzi installed, three cards in the grip, 2 meat damage coming. */
  function paparazziBoard(faceup: boolean): GameState {
    const s = runnerTurn();
    const pap = installRunner(s, "paparazzi", "pap-1");
    pap.faceup = faceup;
    for (const id of ["g-1", "g-2", "g-3"]) {
      put(s, "sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    return s;
  }

  it("a faceup Paparazzi prevents all meat damage (CR 9.4.1)", () => {
    const s = paparazziBoard(true);
    const before = snapshot(s);
    dealDamage(s, "meat", 2, "corp-source");
    expect(s.runner.hand).toEqual(before.runner.hand);
  });

  it("a facedown Paparazzi is inactive and prevents nothing (CR 1.8.4a, 9.4.1)", () => {
    const s = paparazziBoard(false);
    const before = snapshot(s);
    dealDamage(s, "meat", 2, "corp-source");
    expectStateDelta(before, s, { "runner.hand.length": -2 });
  });
});

// --- CR 9.12.1: continuous characteristics ----------------------------------

describe("continuous characteristics (CR 9.12.1)", () => {
  it("applies an independent blank first, so an effect whose source it blanks is never applied, whatever order the effects are listed in (CR 9.12.1d, 9.12.1e)", () => {
    // A blanks B's source; B would blank C. Listed B first.
    const a = { id: "a", sourceId: "src-a", targetIds: ["src-b"] };
    const b = { id: "b", sourceId: "src-b", targetIds: ["c"] };
    expect(orderBlankingEffects([b, a]).map((e) => e.id)).toEqual(["a"]);
    expect(orderBlankingEffects([a, b]).map((e) => e.id)).toEqual(["a"]);
  });

  it("breaks a blanking loop by treating the hosted card as independent of its host, even when the host's effect is listed first (CR 9.12.1e)", () => {
    // Magnet (host) blanks Hush; Hush (hosted on Magnet) blanks Magnet.
    const magnet = { id: "magnet", sourceId: "mag-1", targetIds: ["hush-1"] };
    const hush = {
      id: "hush",
      sourceId: "hush-1",
      targetIds: ["mag-1"],
      hostedOn: "mag-1",
    };
    expect(orderBlankingEffects([magnet, hush]).map((e) => e.id)).toEqual([
      "hush",
    ]);

    // On the board: Hush on Magnet, with Magnet's effect collected first.
    const s = runnerTurn();
    const mag = rezzedIce(s, "magnet", "mag-1");
    mag.hostedProgramsLoseAbilities = true;
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "mag-1", { installed: true } as never);
    const blanked = resolveBlankedCardIds(s);
    expect(blanked.has("mag-1")).toBe(true);
    expect(blanked.has("hush-1")).toBe(false);
  });

  it("Wendigo keeps code gate at an odd advancement count while Egret also grants it: added twice, removed once (CR 9.12.1b)", () => {
    const s = runnerTurn();
    const wendigo = rezzedIce(s, "wendigo", "wen-1");
    wendigo.advancementCounters = 1;
    expect(effectiveIceSubtypes(s, "wen-1")).not.toContain("code gate");
    installRunner(s, "egret", "egret-1");
    hostCard(s, "egret-1", "wen-1", { installed: true } as never);
    expect(effectiveIceSubtypes(s, "wen-1")).toEqual(
      expect.arrayContaining(["code gate", "barrier", "sentry"]),
    );
  });

  it("Hush on Wendigo stops Wendigo's own subtype swap, so it stays a code gate (CR 9.12.1d)", () => {
    const s = runnerTurn();
    const wendigo = rezzedIce(s, "wendigo", "wen-1");
    wendigo.advancementCounters = 1;
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "wen-1", { installed: true } as never);
    expect(abilitiesSuppressed(s, "wen-1")).toBe(true);
    expect(effectiveIceSubtypes(s, "wen-1")).toContain("code gate");
    expect(effectiveIceSubtypes(s, "wen-1")).not.toContain("barrier");
  });

  it("Ice Carver's −1 does not lower Lotus Field (CR 1.2.1, 9.12.1a)", () => {
    let s = runnerTurn();
    rezzedIce(s, "lotus-field", "lotus-1");
    installRunner(s, "ice-carver", "carver-1");
    s = encountering(s, "lotus-1");
    expect(effectiveIceStrength(s, "lotus-1")).toBe(4);
  });

  it("Monkeywrench's −2 does not lower Lotus Field, whose strength cannot be lowered (CR 1.2.1, 9.12.1a)", () => {
    const s = runnerTurn();
    rezzedIce(s, "lotus-field", "lotus-1");
    installRunner(s, "monkeywrench", "mw-1");
    hostCard(s, "mw-1", "lotus-1", { installed: true } as never);
    expect(effectiveIceStrength(s, "lotus-1")).toBe(4);
  });

  it("Parasite's virus counters do not lower Self-Adapting Code Wall (CR 1.2.1, 9.12.1a)", () => {
    const s = runnerTurn();
    rezzedIce(s, "self-adapting-code-wall", "sacw-1");
    const parasite = installRunner(s, "parasite", "par-1");
    parasite.virusCounters = 1;
    hostCard(s, "par-1", "sacw-1", { installed: true } as never);
    expect(effectiveIceStrength(s, "sacw-1")).toBe(1);
  });

  it("a Hushed Lotus Field loses 'cannot be lowered', so Ice Carver lowers it (CR 9.12.1d)", () => {
    let s = runnerTurn();
    rezzedIce(s, "lotus-field", "lotus-1");
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "lotus-1", { installed: true } as never);
    installRunner(s, "ice-carver", "carver-1");
    s = encountering(s, "lotus-1");
    expect(abilitiesSuppressed(s, "lotus-1")).toBe(true);
    expect(effectiveIceStrength(s, "lotus-1")).toBe(3);
  });

  it("Sub Boost gives its host ice an End the run subroutine (CR 9.12.1d)", () => {
    const s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    put(s, "sub-boost", "sb-1", "corp:hq");
    hostCard(s, "sb-1", "wall-1");
    expect(collectSubBoostEtrSubs(s, "wall-1").map((g) => g.text)).toEqual([
      "End the run.",
    ]);
  });

  it("an ice with Hush cannot gain Sub Boost's subroutine (CR 1.2.1)", () => {
    const s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "wall-1", { installed: true } as never);
    put(s, "sub-boost", "sb-1", "corp:hq");
    hostCard(s, "sb-1", "wall-1");
    expect(collectSubBoostEtrSubs(s, "wall-1")).toEqual([]);
  });

  it("Monkeywrench lowers its host by 2 and other ice on the server by 1 (CR 9.12.1a)", () => {
    const s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    rezzedIce(s, "enigma", "enigma-1");
    installRunner(s, "monkeywrench", "mw-1");
    const before = snapshot(s);
    hostCard(s, "mw-1", "enigma-1", { installed: true } as never);
    expectStateDelta(before, s, { "cards.mw-1.hostId": { to: "enigma-1" } });
    expect(effectiveIceStrength(s, "enigma-1")).toBe(0);
    expect(effectiveIceStrength(s, "wall-1")).toBe(0);
  });
});

// --- S4: the shared choice helper -------------------------------------------

describe("the shared choice helper (standardization S4)", () => {
  it("opens one choice at a time and never replaces a choice that is already open (CR 9.2, 9.6.2)", () => {
    const s = runnerTurn();
    const noop = {
      op: "do" as const,
      action: {
        kind: "gain_credits" as const,
        side: "runner" as const,
        amount: 0,
      },
    };
    const before = snapshot(s);
    expect(
      openPendingChoose(s, {
        sourceId: "first",
        chooser: "runner",
        options: [{ id: "a", label: "A", effect: noop }],
      }),
    ).toBe(true);
    expectStateDelta(before, s, {
      "pendingChoice.sourceId": { to: "first" },
    });
    expect(
      openPendingChoose(s, {
        sourceId: "second",
        chooser: "corp",
        options: [{ id: "b", label: "B", effect: noop }],
      }),
    ).toBe(false);
    expect(s.pendingChoice?.sourceId).toBe("first");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["a"]);
  });
});

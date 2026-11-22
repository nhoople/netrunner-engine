/**
 * RF-2: the continuous-effect fixes after re-audit RA-2 (engine #964).
 *
 * The RA-2 tests in `continuous-effects-reaudit.test.ts` were turned into
 * plain tests as each path was fixed. This file adds the proof the RF-2
 * session row asks for that has no RA-2 test: the CR 9.12.1d–e dependency
 * sort shared by the blanking order and the ice subtype layer, the
 * unsettled-loop report, the shared "card is active" check, and Null's
 * run-length weaken. Şifr on Wraparound is in `sifr-strength-set.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  abilitiesSuppressed,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
  effectiveIceSubtypes,
  instantiateCard,
  isCardActive,
  legalActions,
  loadCardCatalog,
  orderByDependency,
  resolveBlankedCardIds,
  unsettledSubtypeLoops,
} from "../src/index.js";
import type { GameState, LayeredEffect } from "../src/index.js";
import type { Action, RunState } from "../src/state/types.js";
import { hostCard } from "../src/state/procedures/host.js";
import { fireIceRezDuringRunHooks } from "../src/effects/eval.js";
import { evalEffect, fx } from "../src/index.js";
import { expectStateDelta, snapshot } from "./kind-coverage.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.28");
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

function rezzedIce(s: GameState, defId: string, id: string, serverId = "hq") {
  const ice = put(s, defId, id, `server:${serverId}:ice`);
  ice.rezzed = true;
  ice.faceup = true;
  s.servers[serverId as "hq"].ice.push(id);
  return ice;
}

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

function encountering(s: GameState, iceId: string): GameState {
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
      broken: (s.cards[iceId]!.subroutines ?? []).map(() => false),
    },
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  } as RunState;
  s.timingKey = "run.encounterPaw";
  return s;
}

// --- The shared dependency sort (CR 9.12.1d–e) ------------------------------

type TestEffect = LayeredEffect & { blanks: string[]; dependsOnIds?: string[] };

function sort(effects: TestEffect[]) {
  return orderByDependency(
    effects,
    (a, b) =>
      (!a.lingering && b.blanks.includes(a.sourceId)) ||
      (a.dependsOnIds ?? []).includes(b.id),
    (e) => e.blanks,
  );
}

describe("the CR 9.12.1d–e dependency sort shared by blanking and the subtype layer", () => {
  it("applies an independent effect before one that depends on it, whatever order they are listed in (CR 9.12.1e)", () => {
    // "copy" reads what "grant" changes, so it waits for it.
    const grant: TestEffect = { id: "grant", sourceId: "egret", blanks: [] };
    const copy: TestEffect = {
      id: "copy",
      sourceId: "goddess",
      blanks: [],
      dependsOnIds: ["grant"],
    };
    expect(sort([copy, grant]).applied.map((e) => e.id)).toEqual([
      "grant",
      "copy",
    ]);
    expect(sort([grant, copy]).applied.map((e) => e.id)).toEqual([
      "grant",
      "copy",
    ]);
  });

  it("does not apply an effect from a static ability whose source an earlier effect blanked, but keeps a lingering one (CR 9.12.1d, 9.10.1)", () => {
    const hush: TestEffect = {
      id: "hush",
      sourceId: "hush-1",
      blanks: ["src"],
    };
    const fromStatic: TestEffect = {
      id: "static",
      sourceId: "src",
      blanks: [],
    };
    const lingering: TestEffect = {
      id: "lingering",
      sourceId: "src",
      blanks: [],
      lingering: true,
    };
    const result = sort([fromStatic, lingering, hush]);
    expect(result.applied.map((e) => e.id)).toEqual(["lingering", "hush"]);
    expect(result.unsettledLoops).toEqual([]);
  });

  it("breaks a loop by treating the hosted object's effect as independent of its host's (CR 9.12.1e)", () => {
    const host: TestEffect = {
      id: "host",
      sourceId: "ice-1",
      blanks: [],
      dependsOnIds: ["hosted"],
    };
    const hosted: TestEffect = {
      id: "hosted",
      sourceId: "egret-1",
      hostedOn: "ice-1",
      blanks: [],
      dependsOnIds: ["host"],
    };
    const result = sort([host, hosted]);
    expect(result.applied.map((e) => e.id)).toEqual(["hosted", "host"]);
    expect(result.unsettledLoops).toEqual([]);
  });

  it("applies a loop with no hosted object in collection order and reports it as a CR gap (CR 9.12.1e)", () => {
    const a: TestEffect = {
      id: "a",
      sourceId: "mg-1",
      blanks: [],
      dependsOnIds: ["b"],
    };
    const b: TestEffect = {
      id: "b",
      sourceId: "mg-2",
      blanks: [],
      dependsOnIds: ["a"],
    };
    const result = sort([a, b]);
    expect(result.applied.map((e) => e.id)).toEqual(["a", "b"]);
    expect(result.unsettledLoops.map((loop) => loop.map((e) => e.id))).toEqual([
      ["a", "b"],
    ]);
  });
});

describe("the ice subtype layer in dependency order (CR 9.12.1b, 9.12.1d–e)", () => {
  it("Mother Goddess gains the subtypes Egret grants to another rezzed ice (CR 9.12.1d, 9.12.1e)", () => {
    const s = runnerTurn();
    rezzedIce(s, "mother-goddess", "mg-1");
    rezzedIce(s, "ice-wall", "wall-1", "rd");
    installRunner(s, "egret", "egret-1");
    hostCard(s, "egret-1", "wall-1", { installed: true } as never);
    expect(effectiveIceSubtypes(s, "mg-1")).toEqual(
      expect.arrayContaining(["mythic", "barrier", "code gate", "sentry"]),
    );
    expect(unsettledSubtypeLoops(s)).toEqual([]);
  });

  it("a Hushed Mother Goddess gains no subtypes: its copy comes from a static ability the blank removes (CR 9.12.1d)", () => {
    const s = runnerTurn();
    rezzedIce(s, "mother-goddess", "mg-1");
    rezzedIce(s, "enigma", "enigma-1", "rd");
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "mg-1", { installed: true } as never);
    expect(effectiveIceSubtypes(s, "mg-1")).toEqual(["mythic"]);
  });

  it("Mother Goddess copies Wendigo's subtypes after its odd-advancement swap, and not the swap while Wendigo is Hushed (CR 9.12.1d)", () => {
    const s = runnerTurn();
    rezzedIce(s, "mother-goddess", "mg-1");
    const wendigo = rezzedIce(s, "wendigo", "wen-1", "rd");
    wendigo.advancementCounters = 1;
    expect(effectiveIceSubtypes(s, "wen-1")).toContain("barrier");
    expect(effectiveIceSubtypes(s, "mg-1")).toContain("barrier");
    expect(effectiveIceSubtypes(s, "mg-1")).not.toContain("code gate");
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "wen-1", { installed: true } as never);
    expect(effectiveIceSubtypes(s, "mg-1")).toContain("code gate");
    expect(effectiveIceSubtypes(s, "mg-1")).not.toContain("barrier");
  });

  it("two rezzed Mother Goddesses form a loop the CR does not settle: reported, and resolved in collection order (CR 9.12.1e)", () => {
    // Not reachable in play (Mother Goddess is unique, CR 10.1.1); a hand-built
    // board shows the fallback.
    const s = runnerTurn();
    rezzedIce(s, "mother-goddess", "mg-1");
    rezzedIce(s, "mother-goddess", "mg-2", "rd");
    rezzedIce(s, "ice-wall", "wall-1", "archives");
    expect(unsettledSubtypeLoops(s)).toEqual([
      ["mg-subtypes:mg-1", "mg-subtypes:mg-2"],
    ]);
    expect(effectiveIceSubtypes(s, "mg-1")).toEqual(
      expect.arrayContaining(["mythic", "barrier"]),
    );
    expect(effectiveIceSubtypes(s, "mg-2")).toEqual(
      expect.arrayContaining(["mythic", "barrier"]),
    );
  });
});

// --- The shared "card is active" check (CR 1.8.3a, 1.8.4a) ------------------

describe("a facedown installed Runner card is inactive (CR 1.8.4a, 8.1.4a)", () => {
  it("a facedown Corroder can neither pump nor break during an encounter (CR 8.1.4a)", () => {
    let s = runnerTurn();
    rezzedIce(s, "ice-wall", "wall-1");
    const corroder = installRunner(s, "corroder", "cor-1");
    s = encountering(s, "wall-1");
    const uses = (x: GameState) =>
      legalActions(x).filter(
        (a) =>
          (a as { cardId?: string; breakerId?: string }).cardId === "cor-1" ||
          (a as { breakerId?: string }).breakerId === "cor-1",
      );
    expect(uses(s).length).toBeGreaterThan(0);
    corroder.faceup = false;
    expect(isCardActive(s, "cor-1")).toBe(false);
    expect(abilitiesSuppressed(s, "cor-1")).toBe(true);
    expect(uses(s)).toEqual([]);
    const pump = applyAction(s, {
      type: "use_paid_ability",
      cardId: "cor-1",
      abilityId: "corroder-pump",
    } as Action);
    expect(pump.ok).toBe(false);
    const brk = applyAction(s, {
      type: "break_subroutine",
      breakerId: "cor-1",
      subIndex: 0,
    } as Action);
    expect(brk.ok).toBe(false);
  });

  it("a facedown Hush blanks nothing (CR 8.1.4a, 9.12.1d)", () => {
    const s = runnerTurn();
    rezzedIce(s, "lotus-field", "lotus-1");
    const hush = installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "lotus-1", { installed: true } as never);
    expect(resolveBlankedCardIds(s).has("lotus-1")).toBe(true);
    hush.faceup = false;
    expect(resolveBlankedCardIds(s).has("lotus-1")).toBe(false);
  });

  it("is active by the CR 1.8.3a list: identities, installed faceup Runner cards, rezzed installed Corp cards, events in the play area, scored agendas", () => {
    const s = runnerTurn();
    expect(isCardActive(s, s.corp.identityId)).toBe(true);
    expect(isCardActive(s, s.runner.identityId)).toBe(true);
    const unrezzed = put(s, "ice-wall", "wall-u", "server:rd:ice");
    s.servers.rd.ice.push("wall-u");
    expect(isCardActive(s, "wall-u")).toBe(false);
    unrezzed.rezzed = true;
    expect(isCardActive(s, "wall-u")).toBe(true);
    put(s, "sure-gamble", "sg-1", "runner:play-area");
    expect(isCardActive(s, "sg-1")).toBe(true);
    put(s, "sure-gamble", "sg-2", "runner:heap");
    s.runner.discardPile.push("sg-2");
    expect(isCardActive(s, "sg-2")).toBe(false);
    put(s, "hostile-takeover", "ht-1", "corp:score");
    s.corp.scoreArea.push("ht-1");
    expect(isCardActive(s, "ht-1")).toBe(true);
    put(s, "hostile-takeover", "ht-2", "runner:score");
    s.runner.scoreArea.push("ht-2");
    expect(isCardActive(s, "ht-2")).toBe(false);
  });
});

// --- Null: Whistleblower's run-length weaken (CR 1.2.1, 9.10.1) -------------

describe("Null: Whistleblower's −2 strength lasts for the remainder of the run (CR 1.2.1, 9.10.1)", () => {
  it("stays on the ice after its encounter ends, while the run goes on", () => {
    let s = runnerTurn();
    const oldId = s.runner.identityId;
    put(s, "null-whistleblower", "null-1", "runner:identity");
    delete s.cards[oldId];
    s.runner.identityId = "null-1";
    put(s, "sure-gamble", "grip-1", "runner:grip");
    s.runner.hand = ["grip-1"];
    rezzedIce(s, "enigma", "enigma-1");
    s = encountering(s, "enigma-1");
    const before = snapshot(s);
    evalEffect(
      { state: s, sourceId: "null-1" },
      fx.do({
        kind: "trash_null_grip_lower_encountered_ice_strength",
        amount: 2,
      } as never),
    );
    expectStateDelta(before, s, { "runner.hand": { to: [] } });
    expect(effectiveIceStrength(s, "enigma-1")).toBe(0);
    // The encounter ends; the run goes on.
    s.run!.encounter = null;
    expect(effectiveIceStrength(s, "enigma-1")).toBe(0);
  });
});

describe("a new rez makes a new choice (CR 1.8.3a, 9.4.1)", () => {
  it("Malia Z0L0K4 rezzed again forgets the resource it chose before, even with nothing to choose now", () => {
    const s = runnerTurn();
    const malia = put(s, "malia-z0l0k4", "malia-1", "server:remote-1:root");
    malia.rezzed = true;
    s.servers["remote-1" as "hq"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["malia-1"],
    } as never;
    malia.tdatdMaliaBlankTargetId = "gone-1";
    evalEffect(
      { state: s, sourceId: "malia-1" },
      fx.do({ kind: "choose_malia_resource" } as never),
    );
    expect(s.pendingChoice).toBeFalsy();
    expect(malia.tdatdMaliaBlankTargetId).toBeUndefined();
  });
});

describe("Hush: host ice cannot gain abilities (CR 1.2.1)", () => {
  it("an AP ice with Hush rezzed during a run gets Thunderbolt Armaments' +1 strength but not its subroutine", () => {
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
    const stavka = rezzedIce(s, "stavka", "stavka-1");
    const printedSubs = stavka.subroutines?.length ?? 0;
    installRunner(s, "hush", "hush-1");
    hostCard(s, "hush-1", "stavka-1", { installed: true } as never);
    s = encountering(s, "stavka-1");
    s.run!.encounter = null;
    fireIceRezDuringRunHooks(s, "stavka-1");
    expect(s.cards["stavka-1"]!.subroutines ?? []).toHaveLength(printedSubs);
    expect(effectiveIceStrength(s, "stavka-1")).toBe(3);
  });
});

/**
 * Midnight Sun Hákarl 1.0 cluster:
 * onRez if source_protects_attacked_server → may_derez_installed (+ then
 * forbid_bioroid_ice_paid_abilities_this_turn). Gates break_bioroid_subroutine.
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
  validateEffectTree,
} from "../src/index.js";
import { beginCorpTurnFlags } from "../src/state/turn.js";
import type { Effect } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.119.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function hakarlOnRez(): Effect {
  return fx.if(
    { op: "source_protects_attacked_server" },
    fx.mayDerezInstalled({
      excludeSelf: true,
      then: fx.forbidBioroidIcePaidAbilitiesThisTurn(),
    }),
  );
}

function setupHakarlRun(opts?: { otherRezzed?: boolean }) {
  let s = createInitialState();
  s = structuredClone(s);

  const remoteId = "remote-1" as ServerId;
  s.servers[remoteId] = {
    id: remoteId,
    kind: "remote",
    ice: [],
    root: [],
  };

  const hakarl = instantiateCard(
    "hakarl-1-0",
    "hakarl-1",
    `server:${remoteId}:ice`,
  );
  hakarl.unsupported = [];
  hakarl.onRez = hakarlOnRez();
  hakarl.rezzed = false;
  s.cards["hakarl-1"] = hakarl;
  s.servers[remoteId].ice = ["hakarl-1"];

  if (opts?.otherRezzed !== false) {
    const otherServer = "remote-2" as ServerId;
    s.servers[otherServer] = {
      id: otherServer,
      kind: "remote",
      ice: [],
      root: [],
    };
    const other = instantiateCard(
      "pad-campaign",
      "other-1",
      `server:${otherServer}:root`,
    );
    other.rezzed = true;
    other.faceup = true;
    s.cards["other-1"] = other;
    s.servers[otherServer].root = ["other-1"];
  }

  s.corp.credits = 20;
  s.runner.credits = 10;
  s.runner.clicks = 4;
  s.runner.rig = [];
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return { s, remoteId };
}

describe("MS Hákarl may-derez + bioroid paid-ability lock IR (always)", () => {
  it("validates Hákarl onRez effect tree", () => {
    const err = validateEffectTree(hakarlOnRez(), "hakarl.onRez");
    expect(err).toBeNull();
  });

  it("rez during run against this server offers may-derez when another card is rezzed", () => {
    const setup = setupHakarlRun({ otherRezzed: true });
    let s = setup.s;
    const remoteId = setup.remoteId;
    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "derez:other-1")).toBe(
      true,
    );
    expect(s.pendingChoice?.options.some((o) => o.id === "decline")).toBe(true);
  });

  it("choosing derez applies lock and blocks bioroid click-break", () => {
    const setup = setupHakarlRun({ otherRezzed: true });
    let s = setup.s;
    const remoteId = setup.remoteId;
    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
    s = must(s, { type: "choose_option", optionId: "derez:other-1" });

    expect(s.cards["other-1"]!.rezzed).toBe(false);
    expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(true);

    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.encounterPaw");
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "break_bioroid_subroutine",
      ),
    ).toBe(false);

    const blocked = applyAction(s, {
      type: "break_bioroid_subroutine",
      subIndex: 0,
    });
    expect(blocked.ok).toBe(false);
  });

  it("decline leaves bioroid click-break available", () => {
    const setup = setupHakarlRun({ otherRezzed: true });
    let s = setup.s;
    const remoteId = setup.remoteId;
    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
    s = must(s, { type: "choose_option", optionId: "decline" });

    expect(s.cards["other-1"]!.rezzed).toBe(true);
    expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);

    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.encounterPaw");
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "break_bioroid_subroutine",
      ),
    ).toBe(true);

    const before = s.runner.clicks;
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 0 });
    expect(s.runner.clicks).toBe(before - 1);
    expect(s.run!.encounter!.broken[0]).toBe(true);
  });

  it("no other rezzed cards → no choice and no lock", () => {
    const setup = setupHakarlRun({ otherRezzed: false });
    let s = setup.s;
    const remoteId = setup.remoteId;
    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
    expect(s.pendingChoice).toBeNull();
    expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);

    s = must(s, { type: "pass_window" });
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "break_bioroid_subroutine",
      ),
    ).toBe(true);
  });

  it("onRez when source does not protect attacked server is a no-op", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteA = "remote-1" as ServerId;
    const remoteB = "remote-2" as ServerId;
    s.servers[remoteA] = { id: remoteA, kind: "remote", ice: [], root: [] };
    s.servers[remoteB] = { id: remoteB, kind: "remote", ice: [], root: [] };

    const hakarl = instantiateCard(
      "hakarl-1-0",
      "hakarl-1",
      `server:${remoteB}:ice`,
    );
    hakarl.onRez = hakarlOnRez();
    hakarl.rezzed = true;
    s.cards["hakarl-1"] = hakarl;
    s.servers[remoteB].ice = ["hakarl-1"];

    const other = instantiateCard(
      "pad-campaign",
      "other-1",
      `server:${remoteB}:root`,
    );
    other.rezzed = true;
    s.cards["other-1"] = other;
    s.servers[remoteB].root = ["other-1"];

    // Synthetic run against A while Hákarl protects B.
    s.run = {
      attackedServerId: remoteA,
      phase: "approach_ice",
      position: 0,
      successful: false,
      endedTheRun: false,
      encounter: null,
    } as typeof s.run;

    const r = evalEffect({ state: s, sourceId: "hakarl-1" }, hakarlOnRez());
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);
    expect(s.cards["other-1"]!.rezzed).toBe(true);
  });

  it("lock clears at beginCorpTurnFlags", () => {
    const setup = setupHakarlRun({ otherRezzed: true });
    let s = setup.s;
    const remoteId = setup.remoteId;
    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
    s = must(s, { type: "choose_option", optionId: "derez:other-1" });
    expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(true);

    beginCorpTurnFlags(s);
    expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);
  });

  it("may_derez can target rezzed ice as well as assets", () => {
    const setup = setupHakarlRun({ otherRezzed: false });
    let s = setup.s;
    const remoteId = setup.remoteId;
    const otherServer = "remote-2" as ServerId;
    s.servers[otherServer] = {
      id: otherServer,
      kind: "remote",
      ice: [],
      root: [],
    };
    const wall = instantiateCard(
      "ice-wall",
      "wall-1",
      `server:${otherServer}:ice`,
    );
    wall.rezzed = true;
    wall.faceup = true;
    s.cards["wall-1"] = wall;
    s.servers[otherServer].ice = ["wall-1"];

    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
    expect(s.pendingChoice?.options.some((o) => o.id === "derez:wall-1")).toBe(
      true,
    );
    s = must(s, { type: "choose_option", optionId: "derez:wall-1" });
    expect(s.cards["wall-1"]!.rezzed).toBe(false);
    expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(true);
  });
});

describe("MS Hákarl card-data wiring (v0.31.0+)", () => {
  it("hakarl-1-0 is fully clear with onRez may-derez + bioroid lock", () => {
    const def = getCardDef("hakarl-1-0");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.subtypes).toContain("bioroid");
    expect(def.onRez).toEqual({
      op: "if",
      cond: { op: "source_protects_attacked_server" },
      then: {
        op: "do",
        action: {
          kind: "may_derez_installed",
          excludeSelf: true,
          then: {
            op: "do",
            action: { kind: "forbid_bioroid_ice_paid_abilities_this_turn" },
          },
        },
      },
    });
    expect(def.subroutines?.some((sub) => sub.id === "hakarl-core")).toBe(true);
    expect(def.subroutines?.some((sub) => sub.id === "hakarl-etr")).toBe(true);
  });
});

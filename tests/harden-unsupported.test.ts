import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createGame,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  queryLegality,
  setupEmptyRemoteWithIce,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("harden unsupported cards", () => {
  it("run-scoped pump persists when encounter boosts clear (Gordian)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
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
    const gordian = instantiateCard("gordian-blade", "g1", "runner:rig");
    s.cards["g1"] = gordian;
    s.runner.rig = ["g1"];

    expect(evalEffect({ state: s, sourceId: "g1" }, fx.pump(1, "run")).ok).toBe(
      true,
    );
    expect(evalEffect({ state: s, sourceId: "g1" }, fx.pump(1)).ok).toBe(true);
    expect(s.run.strengthBoosts["g1"]).toBe(1);
    expect(s.run.encounterStrengthBoosts["g1"]).toBe(1);
    expect(effectiveBreakerStrength(s, "g1")).toBe(4); // 2 printed + 1 run + 1 enc

    s.run.encounterStrengthBoosts = {};
    expect(effectiveBreakerStrength(s, "g1")).toBe(3); // run boost remains
  });

  it("bioroid click-break works on Heimdall without icebreaker", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const heim = instantiateCard("heimdall-1-0", iceId, `server:${remote.id}:ice`);
    s = structuredClone(s);
    s.cards[iceId] = heim;
    s.runner.rig = [];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.corp.credits = 20;

    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: iceId });
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

  it("Armitage hosts 12¢, takes 2 per click, trashes when empty", () => {
    let s = setupEmptyRemoteWithIce();
    const arm = instantiateCard("armitage-codebusting", "arm-1", "runner:grip");
    s = structuredClone(s);
    s.cards["arm-1"] = arm;
    s.runner.hand.push("arm-1");
    s.runner.credits = 5;
    s.runner.clicks = 4;

    s = must(s, {
      type: "basic_install",
      cardId: "arm-1",
      destination: { kind: "rig" },
    });
    expect(s.cards["arm-1"].hostedCredits).toBe(12);
    expect(s.timingKey).toBe("runner.actionPaw");

    const before = s.runner.credits;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "arm-1",
      abilityId: "armitage-take",
    });
    expect(s.runner.credits).toBe(before + 2);
    expect(s.cards["arm-1"].hostedCredits).toBe(10);

    s.cards["arm-1"].hostedCredits = 2;
    s.runner.clicks = 2;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "arm-1",
      abilityId: "armitage-take",
    });
    expect(s.runner.rig).not.toContain("arm-1");
    expect(s.runner.discard).toContain("arm-1");
    expect(s.cards["arm-1"].zone).toBe("runner:heap");
  });

  it("Rototurret pauses for Corp choose when multiple programs installed", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const roto = instantiateCard("rototurret", iceId, `server:${remote.id}:ice`);
    const p1 = instantiateCard("gordian-blade", "prog-1", "runner:grip");
    const p2 = instantiateCard("ninja", "prog-2", "runner:grip");
    s = structuredClone(s);
    s.cards[iceId] = roto;
    s.cards["prog-1"] = p1;
    s.cards["prog-2"] = p2;
    s.runner.hand.push("prog-1", "prog-2");
    s.runner.credits = 20;
    s.runner.clicks = 4;

    s = must(s, {
      type: "basic_install",
      cardId: "prog-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, {
      type: "basic_install",
      cardId: "prog-2",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: iceId });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.pendingTrashProgram?.candidates.sort()).toEqual(
      ["prog-1", "prog-2"].sort(),
    );

    s = must(s, { type: "choose_trash_program", cardId: "prog-2" });
    expect(s.pendingTrashProgram).toBeNull();
    expect(s.runner.discard).toContain("prog-2");
    expect(s.runner.rig).toContain("prog-1");
    expect(s.run).toBeNull();
  });

  it("Data Raven onEncounter Trace^0 tags the Runner", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const raven = instantiateCard("data-raven", iceId, `server:${remote.id}:ice`);
    s = structuredClone(s);
    s.cards[iceId] = raven;
    s.runner.link = 0;
    s.runner.tags = 0;

    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: iceId });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.encounterPaw");
    expect(s.runner.tags).toBe(1);
    expect(getCardDef("data-raven").onEncounter).toBeDefined();
  });

  it("PAD Campaign onTurnBegin gains 1¢ when rezzed", () => {
    let s = createGame({ stopAfterFirstCycle: false });
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    pad.rezzed = true;
    pad.faceup = true;
    s = structuredClone(s);
    s.cards["pad-1"] = pad;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    };
    const before = s.corp.credits;
    const er = evalEffect(
      { state: s, sourceId: "pad-1" },
      getCardDef("pad-campaign").onTurnBegin!,
    );
    expect(er.ok).toBe(true);
    expect(s.corp.credits).toBe(before + 1);
    expect(getCardDef("pad-campaign").unsupported ?? []).toEqual([]);
  });
});

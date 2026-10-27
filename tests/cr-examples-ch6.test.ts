/**
 * Comprehensive Rules examples from chapter 6.
 * Each test plays that example's board.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  createPendingAbilityInstance,
  crDataPresent,
  enterStep,
  evalEffect,
  instantiateCard,
  CR,
  ensurePriorityWindow,
  fx,
  legalActions,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";
import { STEPS } from "../src/timing/graph.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}


function formicaryCard(id: string, zone: string) {
  return {
    id,
    defId: "formicary-fixture",
    title: "Formicary",
    type: "ice" as const,
    side: "corp" as const,
    zone,
    faceup: false,
    rezzed: false,
    installCost: 2,
    rezCost: 5,
    strength: 2,
    subtypes: ["sentry"],
    subroutines: [
      {
        id: "formicary-etr",
        text: "End the run.",
        effect: fx.do({ kind: "end_the_run" as const }),
      },
    ],
    paidAbilities: [
      {
        id: "formicary-approach",
        label: "Rez (−2), move innermost, encounter",
        clickCost: 0,
        creditCost: 0,
        windows: ["other_priority_window" as const],
        effect: fx.formicaryRezMoveInnermost(2),
      },
    ],
  };
}

/** Runner turn, empty archives, optional rezzed upgrade on a central. */
function runnerReadyWithUpgrade(
  defId: "crisium-grid" | "flagship",
  serverId: ServerId,
): GameState {
  let s = createInitialState();
  s = structuredClone(s);
  const up = instantiateCard(defId, "up-1", `server:${serverId}:root`);
  up.rezzed = true;
  up.faceup = true;
  s.cards["up-1"] = up;
  s.servers[serverId]!.root = ["up-1"];
  s.servers[serverId]!.ice = [];
  s.servers.archives.ice = [];
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  return s;
}

function runnerTurn(state: GameState, clicks = 4, credits = 5): GameState {
  state.activeSide = "runner";
  state.timingKey = "runner.takeAction";
  state.runner.clicks = clicks;
  state.runner.credits = credits;
  return state;
}

/** Pass open windows until pred, a choice, or a psi game. */
function passUntil(
  state: GameState,
  pred: (s: GameState) => boolean,
  max = 24,
): GameState {
  let s = state;
  for (let i = 0; i < max && !pred(s); i++) {
    if (s.pendingChoice || s.psi) break;
    const before = s.timingKey;
    const result = applyAction(s, { type: "pass_window" });
    if (!result.ok) break;
    s = result.state;
    if (s.timingKey === before && !s.pendingChoice && !s.psi) break;
  }
  return s;
}

function remote(state: GameState, id: string, ice: string[] = [], root: string[] = []) {
  const serverId = id as ServerId;
  state.servers[serverId] = { id: serverId, kind: "remote", ice, root };
  return serverId;
}

describe("CR examples, chapter 6", () => {

    it("redirects a successful Archives run to HQ without approaching HQ ice (CR 6.1.2d.ex1)", () => {
    let s = createInitialState();
    const sneak = instantiateCard("sneakdoor-beta", "sd-1", "runner:installed");
    s.cards["sd-1"] = sneak;
    s.runner.installed = ["sd-1"];
    const wall = instantiateCard("ice-wall", "hq-ice", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    s.cards["hq-ice"] = wall;
    s.servers.hq.ice = ["hq-ice"];
    runnerTurn(s, 1, 5);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "sd-1",
      abilityId: "sneakdoor-run",
      serverId: "archives",
    });
    s = passUntil(s, (st) => st.run === null || st.run.attackedServerId === "hq");
    expect(s.log.some((line) => line.includes("Redirect successful run from archives to hq"))).toBe(
      true,
    );
    expect(s.log.some((line) => /Approach ice Ice Wall/.test(line))).toBe(false);
    expect(s.log.some((line) => /Encounter Ice Wall/.test(line))).toBe(false);
    expect(s.servers.hq.ice).toEqual(["hq-ice"]);
    expect(s.cards["hq-ice"]?.rezzed).toBe(true);
  });


    it("does not offer Inversificator when Mirāju replaces the pass (CR 6.1.3e.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("miraju", "mir-1", "server:archives:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const breaker = instantiateCard("inversificator", "inv-1", "runner:installed");
    s.cards["mir-1"] = ice;
    s.cards["inv-1"] = breaker;
    s.runner.installed = ["inv-1"];
    s.servers.archives.ice = ["mir-1"];
    s.run = {
      attackedServerId: "archives",
      phase: "movement",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "mir-1",
        broken: [true],
        fullyBrokenByRunner: true,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      passedIceIds: [],
    };
    enterStep(s, "run.movement");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "jack-out",
      "continue",
    ]);
    expect(s.turn.inversificatorSwapUsedThisTurn).toBeFalsy();
    const continued = must(s, { type: "choose_option", optionId: "continue" });
    expect(continued.run?.passedIceIds ?? []).not.toContain("mir-1");
    expect(continued.log.join("\n")).toContain("6.1.3e");

    continued.run!.encounter = { iceId: "mir-1", broken: [false] };
    continued.run!.position = 0;
    continued.run!.attackedServerId = "archives";
    continued.run!.passReplacedByEncounterEnd = false;
    continued.pendingChoice = null;
    STEPS["run.movement"].onResolve?.(continued);
    expect(continued.run?.passedIceIds ?? []).toContain("mir-1");
    expect(continued.turn.inversificatorSwapUsedThisTurn).toBeFalsy();
  });


    it("ends a Loot Box encounter that is not part of a run before the second subroutine (CR 6.1.4b.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("loot-box", "loot-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["loot-1"] = ice;
    s.servers.hq.ice = ["loot-1"];
    s.runner.credits = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "loot-1",
        broken: [false, false],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      encounterOutsideRun: true,
    };
    enterStep(s, "run.resolveSub");
    autoWalk(s);
    const relevant = s.log.filter(
      (line) =>
        line.includes("6.1.4") ||
        line.includes("Resolve subroutine") ||
        line.includes("Reveal the top"),
    );
    expect(relevant.join("\n")).toContain("6.1.4b");
    expect(relevant.join("\n")).not.toContain("Reveal the top");
  });


    it("gains 1 credit from Lycian's last subroutine when no run exists (CR 6.1.4c.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("lycian-multi-munition", "ly-1", "server:hq:ice");
    ice.subtypes = [...(ice.subtypes ?? []), "barrier"];
    s.cards["ly-1"] = ice;
    s.corp.credits = 5;
    const sub = ice.subroutines?.find((routine) => routine.id === "lycian-barrier");
    if (!sub?.effect) throw new Error("Lycian barrier subroutine missing");
    const resolved = evalEffect({ state: s, sourceId: "ly-1" }, sub.effect);
    expect(resolved.ok).toBe(true);
    expect(s.corp.credits).toBe(6);
    expect(s.log.join("\n")).toContain("6.1.4c");
    expect(s.run).toBeNull();
  });


    it("moves Rook only to ice in the same position counted from the innermost (CR 6.2.3.ex1)", () => {
    const s = createInitialState();
    const outer = instantiateCard("ice-wall", "out-1", "server:remote-1:ice");
    const inner = instantiateCard("ice-wall", "in-1", "server:remote-1:ice");
    inner.title = "Inner Wall";
    const alone = instantiateCard("ice-wall", "one-1", "server:hq:ice");
    alone.title = "Only Ice";
    const otherOuter = instantiateCard("ice-wall", "out-2", "server:remote-2:ice");
    otherOuter.title = "Other Outer";
    const otherInner = instantiateCard("ice-wall", "in-2", "server:remote-2:ice");
    const rook = instantiateCard("rook", "rook-1", "runner:installed");
    rook.hostId = "out-1";
    s.cards["out-1"] = outer;
    s.cards["in-1"] = inner;
    s.cards["one-1"] = alone;
    s.cards["out-2"] = otherOuter;
    s.cards["in-2"] = otherInner;
    s.cards["rook-1"] = rook;
    s.runner.installed = ["rook-1"];
    remote(s, "remote-1", ["out-1", "in-1"]);
    remote(s, "remote-2", ["out-2", "in-2"]);
    s.servers.hq.ice = ["one-1"];
    runnerTurn(s, 1, 5);
    const moved = must(s, {
      type: "use_paid_ability",
      cardId: "rook-1",
      abilityId: "rook-host",
    });
    expect(moved.cards["rook-1"]?.hostId).toBe("out-2");
    expect(moved.cards["one-1"]?.hostedCardIds ?? []).not.toContain("rook-1");
  });


    it("lets Slipstream approach the innermost ice of a longer server (CR 6.2.3.ex2)", () => {
    const s = createInitialState();
    const passed = instantiateCard("ice-wall", "passed-1", "server:archives:ice");
    const outer = instantiateCard("ice-wall", "hq-outer", "server:hq:ice");
    outer.title = "HQ Outer";
    const mid = instantiateCard("ice-wall", "hq-mid", "server:hq:ice");
    const inner = instantiateCard("ice-wall", "hq-inner", "server:hq:ice");
    inner.title = "HQ Inner";
    const slip = instantiateCard("slipstream", "slip-1", "runner:installed");
    s.cards["passed-1"] = passed;
    s.cards["hq-outer"] = outer;
    s.cards["hq-mid"] = mid;
    s.cards["hq-inner"] = inner;
    s.cards["slip-1"] = slip;
    s.runner.installed = ["slip-1"];
    s.servers.archives.ice = ["passed-1"];
    s.servers.hq.ice = ["hq-outer", "hq-mid", "hq-inner"];
    s.run = {
      attackedServerId: "archives",
      phase: "movement",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      lastPassedRezzedIceId: "passed-1",
    };
    const resolved = evalEffect(
      { state: s, sourceId: "slip-1" },
      { op: "do", action: { kind: "win_slipstream" } },
    );
    expect(resolved.ok).toBe(true);
    const ids = s.pendingChoice?.options.map((option) => option.id) ?? [];
    expect(ids).toContain("slip:hq-inner");
    expect(ids).not.toContain("slip:hq-outer");
  });


    it("derezzes Cell Portal during a successful run and does not move the Runner (CR 6.2.5d.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("cell-portal", "cell-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["cell-1"] = ice;
    s.servers.hq.ice = ["cell-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "cell-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const sub = ice.subroutines?.[0]?.effect;
    if (!sub) throw new Error("Cell Portal subroutine missing");
    const resolved = evalEffect({ state: s, sourceId: "cell-1" }, sub);
    expect(resolved.ok).toBe(true);
    expect(s.cards["cell-1"]?.rezzed).toBe(false);
    expect(s.run?.position).toBeNull();
    expect(s.run?.successful).toBe(true);
    expect(s.run?.endedTheRun).toBe(false);
    expect(s.pendingChoice).toBeNull();
    expect(s.log.join("\n")).toContain("6.2.5d");
  });


    it("installs Drafter's ice outward of the Runner (CR 6.2.6a.ex1)", () => {
    const s = createInitialState();
    const drafter = instantiateCard("drafter", "draft-1", "server:hq:ice");
    drafter.rezzed = true;
    const inner = instantiateCard("ice-wall", "inner-1", "server:hq:ice");
    const fresh = instantiateCard("ice-wall", "fresh-1", "corp:hq");
    s.cards["draft-1"] = drafter;
    s.cards["inner-1"] = inner;
    s.cards["fresh-1"] = fresh;
    s.corp.hand = ["fresh-1"];
    s.servers.hq.ice = ["draft-1", "inner-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "draft-1", broken: [false, false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const resolved = evalEffect(
      { state: s, sourceId: "draft-1" },
      { op: "do", action: { kind: "install_from_hq_or_archives" } },
    );
    expect(resolved.ok).toBe(true);
    expect(s.servers.hq.ice[0]).toBe("fresh-1");
    expect(s.run?.position).toBe(1);
    expect(s.servers.hq.ice[s.run!.position!]).toBe("draft-1");
    expect(s.log.join("\n")).toContain("6.2.6a");
  });


    it("installs ice inward of Brân and the run approaches that ice (CR 6.2.6b.ex1)", () => {
    let s = createInitialState();
    const serverId = remote(s, "remote-1", ["bran-1"]);
    const bran = instantiateCard("bran-1-0", "bran-1", "server:remote-1:ice");
    bran.rezzed = true;
    bran.faceup = true;
    s.cards["bran-1"] = bran;
    const inward = instantiateCard("ice-wall", "in-1", "corp:hq");
    s.cards["in-1"] = inward;
    s.corp.hand = ["in-1"];
    runnerTurn(s, 4, 5);

    s = must(s, { type: "basic_run", serverId });
    s = passUntil(s, (st) => st.timingKey === "run.encounterPaw");
    expect(s.run?.encounter?.iceId).toBe("bran-1");
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 1 });
    s = passUntil(
      s,
      (st) => st.pendingChoice != null || st.timingKey === "run.encounterPaw",
    );
    if (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: "bran:in-1" });
    }
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 2 });
    s = passUntil(
      s,
      (st) =>
        st.pendingChoice != null ||
        (st.servers[serverId]!.ice.includes("in-1") &&
          st.log.some((line) => line.includes("Approach ice Ice Wall"))),
    );
    if (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: "bran:in-1" });
    }
    s = passUntil(
      s,
      (st) =>
        st.servers[serverId]!.ice.includes("in-1") &&
        st.log.some((line) => line.includes("Approach ice Ice Wall")),
    );
    const ice = s.servers[serverId]!.ice;
    expect(ice.indexOf("in-1")).toBeGreaterThan(ice.indexOf("bran-1"));
    expect(s.cards["in-1"]?.faceup).toBe(false);
    expect(s.run?.position).toBe(ice.indexOf("in-1"));
    expect(s.run?.attackedServerId).toBe(serverId);
  });


    it("moves innermost Bullfrog to outermost Archives and continues the run there (CR 6.2.7d.ex1)", () => {
    let s = createInitialState();
    const serverId = remote(s, "remote-1", ["bf-1"]);
    const frog = instantiateCard("bullfrog", "bf-1", "server:remote-1:ice");
    frog.rezzed = true;
    frog.faceup = true;
    s.cards["bf-1"] = frog;
    runnerTurn(s, 1, 5);
    s.corp.credits = 5;

    s = must(s, { type: "basic_run", serverId });
    s = passUntil(s, (st) => st.psi !== null || st.run?.encounter?.iceId === "bf-1");
    s = passUntil(s, (st) => st.psi !== null);
    expect(s.psi).toBeTruthy();
    s = must(s, { type: "psi_runner_bid", amount: 0 });
    s = must(s, { type: "psi_corp_bid", amount: 1 });
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "bullfrog:archives" });
    expect(s.servers.archives.ice[0]).toBe("bf-1");
    expect(s.servers[serverId]?.ice ?? []).not.toContain("bf-1");
    expect(s.cards["bf-1"]?.zone).toBe("server:archives:ice");
    expect(s.log.some((line) => line.includes("Move Bullfrog to outermost protecting archives"))).toBe(
      true,
    );
    expect(s.run === null || s.run.attackedServerId === "archives").toBe(true);
    if (s.run) expect(s.run.position).toBe(0);
  });


    it("approaches the ice Project Yagi-Uda swapped into the outermost position (CR 6.2.7e.ex1)", () => {
    const s = createInitialState();
    const outer = instantiateCard("ice-wall", "old-1", "server:hq:ice");
    outer.title = "Old Outer";
    const incoming = instantiateCard("ice-wall", "new-1", "corp:hq");
    incoming.title = "New Outer";
    s.cards["old-1"] = outer;
    s.cards["new-1"] = incoming;
    s.corp.hand = ["new-1"];
    s.servers.hq.ice = ["old-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "initiation",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const swapped = evalEffect(
      { state: s, sourceId: "yagi" },
      {
        op: "do",
        action: {
          kind: "swap_yagi_hq_with_attacked_pick",
          hqCardId: "new-1",
          serverCardId: "old-1",
        },
      },
    );
    expect(swapped.ok).toBe(true);
    expect(s.servers.hq.ice[0]).toBe("new-1");
    expect(s.run?.position).toBe(0);
    enterStep(s, "run.approachIce");
    autoWalk(s);
    expect(s.log.join("\n")).toContain("Approach ice New Outer");
    expect(s.log.join("\n")).toContain("6.2.7e");
  });


    it("moves inward after Project Yagi-Uda swaps the ice the Runner already passed (CR 6.2.7e.ex2)", () => {
    const s = createInitialState();
    const passed = instantiateCard("ice-wall", "passed-1", "server:hq:ice");
    passed.title = "Passed Ice";
    const inner = instantiateCard("ice-wall", "inner-1", "server:hq:ice");
    inner.title = "Inner Ice";
    const incoming = instantiateCard("ice-wall", "swap-1", "corp:hq");
    incoming.title = "Swapped Ice";
    s.cards["passed-1"] = passed;
    s.cards["inner-1"] = inner;
    s.cards["swap-1"] = incoming;
    s.corp.hand = ["swap-1"];
    s.servers.hq.ice = ["passed-1", "inner-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      passedIceIds: ["passed-1"],
    };
    evalEffect(
      { state: s, sourceId: "yagi" },
      {
        op: "do",
        action: {
          kind: "swap_yagi_hq_with_attacked_pick",
          hqCardId: "swap-1",
          serverCardId: "passed-1",
        },
      },
    );
    expect(s.run?.position).toBe(0);
    enterStep(s, "run.moveInward");
    autoWalk(s);
    expect(s.run?.position).toBe(1);
    expect(s.servers.hq.ice[s.run!.position!]).toBe("inner-1");
    expect(s.log.join("\n")).not.toContain("Approach ice Swapped Ice");
  });


    it("blocks announcing Off the Grid's remote, and a moved run may still attack it (CR 6.3.2a.ex1)", () => {
    let s = createInitialState();
    const blocked = remote(s, "remote-1", [], ["otg-1"]);
    const grid = instantiateCard("off-the-grid", "otg-1", "server:remote-1:root");
    grid.rezzed = true;
    grid.faceup = true;
    s.cards["otg-1"] = grid;
    const from = remote(s, "remote-2", ["bf-1"]);
    const frog = instantiateCard("bullfrog", "bf-1", "server:remote-2:ice");
    frog.rezzed = true;
    frog.faceup = true;
    s.cards["bf-1"] = frog;
    runnerTurn(s, 2, 5);
    s.corp.credits = 5;

    const announced = applyAction(s, { type: "basic_run", serverId: blocked });
    expect(announced.ok).toBe(false);

    s = must(s, { type: "basic_run", serverId: from });
    s = passUntil(s, (st) => st.psi !== null);
    s = must(s, { type: "psi_runner_bid", amount: 0 });
    s = must(s, { type: "psi_corp_bid", amount: 1 });
    s = must(s, { type: "choose_option", optionId: `bullfrog:${blocked}` });
    expect(s.servers[blocked]!.ice[0]).toBe("bf-1");
    expect(s.run === null || s.run.attackedServerId === blocked).toBe(true);
    expect(s.cards["otg-1"]?.zone).toBe(`server:${blocked}:root`);
    expect(s.log.some((line) => line.includes(`Move Bullfrog to outermost protecting ${blocked}`))).toBe(
      true,
    );
  });


    it("does not drain credits for the click Enhanced Login Protocol spends to start the run (CR 6.3.4.ex1)", () => {
    const s = createInitialState();
    const elp = instantiateCard(
      "enhanced-login-protocol",
      "elp-1",
      "corp:play-area",
    );
    const grid = instantiateCard("heinlein-grid", "grid-1", "server:hq:root");
    grid.rezzed = true;
    grid.faceup = true;
    s.cards["elp-1"] = elp;
    s.cards["grid-1"] = grid;
    s.corp.playArea = ["elp-1"];
    s.servers.hq.root = ["grid-1"];
    s.servers.hq.ice = [];
    runnerTurn(s, 2, 5);
    const ran = must(s, { type: "basic_run", serverId: "hq" });
    expect(ran.runner.credits).toBe(5);
    expect(ran.runner.clicks).toBe(0);
    expect(ran.log.join("\n")).toContain("6.3.4");
    expect(ran.log.join("\n")).not.toContain("loses all credits");
  });


    it("bypasses Troll with Femme before Forked can trash it (CR 6.5.8c.ex1)", () => {
    let s = createInitialState();
    const troll = instantiateCard("troll", "troll-1", "server:hq:ice");
    troll.rezzed = true;
    troll.faceup = true;
    const femme = instantiateCard("femme-fatale", "femme-1", "runner:installed");
    femme.chosenIceId = "troll-1";
    s.cards["troll-1"] = troll;
    s.cards["femme-1"] = femme;
    s.runner.installed = ["femme-1"];
    s.runner.credits = 0;
    s.servers.hq.ice = ["troll-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      trashFirstFullyBrokenSubtype: "sentry",
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain("bypass");
    s = must(s, { type: "choose_option", optionId: "bypass" });
    expect(s.cards["troll-1"]?.zone).toBe("server:hq:ice");
    expect(s.corp.discardPile).not.toContain("troll-1");
    expect(s.log.join("\n")).not.toContain("is trashed");
  });


    it("returns to Shiro's subroutines after the Runner encounters Chrysalis (CR 6.5.9a.ex1)", () => {
    let s = createInitialState();
    const shiro = instantiateCard("shiro", "shiro-1", "server:hq:ice");
    shiro.rezzed = true;
    shiro.faceup = true;
    const chrysalis = instantiateCard("chrysalis", "chrys-1", "corp:rd");
    s.cards["shiro-1"] = shiro;
    s.cards["chrys-1"] = chrysalis;
    s.servers.hq.ice = ["shiro-1"];
    s.corp.deck = ["chrys-1", ...s.corp.deck];
    s.runner.hand = ["runner-program-1", "runner-fill-1", "runner-fill-2", "runner-fill-3"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "shiro-1", broken: [true, true] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: "chrys-1",
    };
    const forced = evalEffect(
      { state: s, sourceId: "chrys-1" },
      { op: "do", action: { kind: "force_encounter_accessed_ice" } },
    );
    expect(forced.ok).toBe(true);
    expect(s.run?.resumeEncounterIceId).toBe("shiro-1");
    expect(s.run?.suspendedEncounter?.iceId).toBe("shiro-1");
    enterStep(s, "run.movement");
    for (let i = 0; i < 16 && !s.log.some((line) => line.includes("Resume encounter with Shiro")); i++) {
      if (s.pendingChoice) {
        const decline = s.pendingChoice.options.find((option) => option.id === "decline");
        s = must(s, {
          type: "choose_option",
          optionId: decline?.id ?? s.pendingChoice.options[0]!.id,
        });
        continue;
      }
      autoWalk(s);
      if (s.pendingChoice || s.pendingDamage) continue;
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }
    const text = s.log.join("\n");
    expect(text).toContain("Runner encounters Chrysalis");
    expect(text).toContain("Resume encounter with Shiro");
    expect(text).toContain("6.5.9a");
  });


    it("aborts the Movement Phase when The Twins' extra encounter ends the run (CR 6.5.9b.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const copy = instantiateCard("ice-wall", "wall-2", "corp:hq");
    const inner = instantiateCard("ice-wall", "inner-1", "server:hq:ice");
    inner.title = "Inner Ice";
    const twins = instantiateCard("the-twins", "twins-1", "server:hq:root");
    twins.rezzed = true;
    twins.faceup = true;
    s.cards["wall-1"] = ice;
    s.cards["wall-2"] = copy;
    s.cards["inner-1"] = inner;
    s.cards["twins-1"] = twins;
    s.corp.hand = ["wall-2"];
    s.servers.hq.ice = ["wall-1", "inner-1"];
    s.servers.hq.root = ["twins-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "wall-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.movement");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((item) => item.id)).toContain("accept");
    s = must(s, { type: "choose_option", optionId: "accept" });
    const option = s.pendingChoice?.options.find((item) => item.id.startsWith("twins:"));
    expect(option).toBeTruthy();
    s = must(s, { type: "choose_option", optionId: option!.id });
    for (let i = 0; i < 12 && s.run && !s.run.endedTheRun && !s.pendingChoice; i++) {
      const result = applyAction(s, { type: "pass_window" });
      if (!result.ok) break;
      s = result.state;
    }
    expect(s.log.join("\n")).toContain("6.5.9b");
    expect(s.log.join("\n")).toContain("End the run");
    expect(s.log.join("\n")).not.toContain("Approach ice Inner Ice");
  });


    it("drops Because I Can after the run moves to a central and keeps it on another remote (CR 6.7.4a.ex1)", () => {
    const central = createInitialState();
    const event = instantiateCard("because-i-can", "bic-1", "runner:heap");
    central.cards["bic-1"] = event;
    const pad = instantiateCard("pad-campaign", "pad-1", "server:hq:root");
    central.cards["pad-1"] = pad;
    central.servers.hq.root = ["pad-1"];
    central.servers.hq.ice = [];
    central.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      runSourceId: "bic-1",
      successTiedToServers: "remote",
      onSuccessfulRunEffect: event.runEvent?.onSuccessfulRun,
    };
    enterStep(central, "run.success");
    autoWalk(central);
    expect(central.servers.hq.root).toEqual(["pad-1"]);
    expect(central.log.join("\n")).toContain("6.7.4a");

    const moved = createInitialState();
    const event2 = instantiateCard("because-i-can", "bic-2", "runner:heap");
    const pad2 = instantiateCard("pad-campaign", "pad-2", "server:remote-2:root");
    moved.cards["bic-2"] = event2;
    moved.cards["pad-2"] = pad2;
    remote(moved, "remote-2", [], ["pad-2"]);
    moved.run = {
      attackedServerId: "remote-2",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      runSourceId: "bic-2",
      successTiedToServers: "remote",
      onSuccessfulRunEffect: event2.runEvent?.onSuccessfulRun,
    };
    enterStep(moved, "run.success");
    autoWalk(moved);
    expect(moved.pendingChoice?.options.map((option) => option.id)).toContain(
      "accept",
    );
  });


    it("lets Account Siphon wait until Ash's trace finishes (CR 6.7.4c.ex1)", () => {
    const s = createInitialState();
    const ash = instantiateCard("ash-2x3zb9cy", "ash-1", "server:hq:root");
    ash.rezzed = true;
    ash.faceup = true;
    const siphon = instantiateCard("account-siphon", "sip-1", "runner:heap");
    s.cards["ash-1"] = ash;
    s.cards["sip-1"] = siphon;
    s.servers.hq.root = ["ash-1"];
    s.servers.hq.ice = [];
    s.runner.link = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      runSourceId: "sip-1",
      onSuccessfulRunEffect: { op: "do", action: { kind: "may_breach_instead_account_siphon" } },
    };
    enterStep(s, "run.success");
    autoWalk(s);
    const text = s.log.join("\n");
    const traceAt = text.indexOf("Trace resolves");
    const siphonAt = text.indexOf("Account Siphon");
    expect(traceAt).toBeGreaterThan(-1);
    expect(siphonAt).toBeGreaterThan(traceAt);
    expect(s.pendingChoice?.options.some((option) => option.id.startsWith("siphon:"))).toBe(true);
  });


    it("Nisei ETR during approach PAW closes the PAW under 6.8.2a.ex1 at 11.4_6_a", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "corp";
      s.timingKey = "run.approachPaw";
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
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      // Open the approach PAW frame as the live host would.
      ensurePriorityWindow(s);
      expect(s.priorityStack.length).toBe(1);
      expect(s.priorityStack[0]!.stepKey).toBe("run.approachPaw");

      const nisei = instantiateCard("nisei-mk-ii", "nisei-1", "corp:score");
      nisei.agendaCounters = 1;
      s.cards["nisei-1"] = nisei;
      s.corp.scoreArea = ["nisei-1"];

      // SMC-class paid ability that would be illegal after PAW close (Runner
      // must not get another PAW act after Nisei ETR — CR 6.8.2a example).
      s.cards["smc"] = {
        id: "smc",
        defId: "self-modifying-code-fixture",
        title: "SMC Fixture",
        type: "program",
        side: "runner",
        zone: "runner:installed",
        faceup: true,
        rezzed: true,
        installCost: 0,
        paidAbilities: [
          {
            id: "smc-search",
            label: "search",
            clickCost: 0,
            creditCost: 2,
            windows: ["approach_paw", "encounter_paw"],
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      s.runner.installed = ["smc"];
      s.runner.credits = 5;
      s.badPublicityFund = 1;

      expect(
        legalActions(s).some(
          (a) =>
            a.type === "use_paid_ability" &&
            a.cardId === "nisei-1" &&
            a.abilityId === "nisei-etr",
        ),
      ).toBe(true);

      s = must(s, {
        type: "use_paid_ability",
        cardId: "nisei-1",
        abilityId: "nisei-etr",
      });

      expect(s.run).toBeNull();
      expect(s.cards["nisei-1"]!.agendaCounters).toBe(0);
      // Approach PAW frame must be gone (action PAW after run-return may open).
      expect(s.priorityStack.every((pw) => pw.stepKey !== "run.approachPaw")).toBe(
        true,
      );

      const log = s.log.join("\n");
      expect(log).toMatch(/11\.4_6_a/);
      expect(log).toMatch(/6\.8\.2a/);
      expect(log).toMatch(/Close paid ability window @ run\.approachPaw/);
      // Runner SMC is not offered after ETR drainage.
      expect(
        legalActions(s).some(
          (a) =>
            a.type === "use_paid_ability" &&
            a.cardId === "smc",
        ),
      ).toBe(false);
    });


    it("ends the encounter before Tollbooth resolves when Security Nexus' trace succeeds (CR 6.8.2b.ex1)", () => {
    let s = createInitialState();
    const booth = instantiateCard("tollbooth", "toll-1", "server:hq:ice");
    booth.rezzed = true;
    booth.faceup = true;
    const nexus = instantiateCard("security-nexus", "nexus-1", "runner:installed");
    s.cards["toll-1"] = booth;
    s.cards["nexus-1"] = nexus;
    s.runner.installed = ["nexus-1"];
    s.runner.link = 0;
    s.runner.credits = 5;
    s.servers.hq.ice = ["toll-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain("nexus-trace");
    s = must(s, { type: "choose_option", optionId: "nexus-trace" });
    expect(s.runner.credits).toBe(5);
    expect(s.log.join("\n")).toContain("6.8.2b");
    expect(s.log.join("\n")).not.toContain("pay 3");
  });


    it("lets Corp rez+move Formicary during 6.8.2c but blocks encounter (CR 6.8.2c.ex1)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.credits = 10;
      // Formicary protecting Archives; Runner approached HQ then ETR mid-pending.
      s.cards["form-1"] = formicaryCard("form-1", "server:archives:ice");
      s.servers.archives.ice = ["form-1"];
      // Existing ice on HQ so innermost move is observable.
      s.cards["wall-1"] = {
        id: "wall-1",
        defId: "ice-wall",
        title: "Ice Wall",
        type: "ice",
        side: "corp",
        zone: "server:hq:ice",
        faceup: true,
        rezzed: true,
        installCost: 1,
        rezCost: 1,
        strength: 1,
        subtypes: ["barrier"],
        subroutines: [],
      };
      s.servers.hq.ice = ["wall-1"];

      s.run = {
        attackedServerId: "hq",
        phase: "ends",
        position: null,
        successful: false,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: true,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      s.priorityStack = [
        {
          id: "pw-formicary",
          stepKey: "run.formicaryPending",
          nestDepth: 0,
          consecutivePasses: 0,
          priorityHolder: "corp",
          checkpointId: "",
        },
      ];

      enterStep(s, "run.closePriorityWindows");
      autoWalk(s);

      expect(s.timingKey).toBe("run.completeOtherPriorityWindows");
      expect(s.run!.forbidNewTimingStructures).toBe(true);
      expect(s.priorityStack).toHaveLength(1);
      expect(s.priorityStack[0]!.stepKey).toBe("run.formicaryPending");
      expect(s.log.join("\n")).toMatch(/6\.8\.2c/);

      expect(
        legalActions(s).some(
          (a) =>
            a.type === "use_paid_ability" &&
            a.cardId === "form-1" &&
            a.abilityId === "formicary-approach",
        ),
      ).toBe(true);

      s = must(s, {
        type: "use_paid_ability",
        cardId: "form-1",
        abilityId: "formicary-approach",
      });

      expect(s.cards["form-1"]!.rezzed).toBe(true);
      expect(s.servers.archives.ice).not.toContain("form-1");
      expect(s.servers.hq.ice).toEqual(["wall-1", "form-1"]);
      expect(s.corp.credits).toBe(7); // 5 − 2 discount
      // Encounter / position move blocked (CR 6.8.2c.ex1).
      expect(s.run!.encounter).toBeNull();
      expect(s.run!.position).toBeNull();
      expect(s.run!.reencounterIceId).toBeUndefined();
      expect(s.log.join("\n")).toMatch(
        /Cannot move Runner position or initiate encounter/,
      );

      s = must(s, { type: "pass_window" });
      expect(s.priorityStack.every((pw) => pw.stepKey !== "run.formicaryPending")).toBe(
        true,
      );
      expect(s.run).toBeNull();
      expect(s.log.join("\n")).toMatch(
        /Complete open priority window @ run\.formicaryPending without new structures \(CR 6\.8\.2c/,
      );
    });


    it("Crisium: Success Phase reached → successful null, not unsuccessful (CR 6.8.4a.ex1)", () => {
      let s = runnerReadyWithUpgrade("crisium-grid", "archives");
      s = must(s, { type: "basic_run", serverId: "archives" });

      // Run finished; no active run shell.
      expect(s.run).toBeNull();
      expect(
        s.log.some((l) =>
          l.includes(CR.notUnsuccessfulWhenReachedSuccessPhase.number),
        ),
      ).toBe(true);
      expect(s.log.some((l) => /Run complete — unsuccessful/.test(l))).toBe(
        false,
      );
      expect(
        s.log.some((l) =>
          /Run complete — neither successful nor unsuccessful/.test(l),
        ),
      ).toBe(true);
      expect(s.turn.successfulRunThisTurn).toBe(false);
      expect(s.turn.successfulArchivesRunThisTurn).toBe(false);
    });


    it("prevents Chum and Georgia Emelyov damage until the run is over (CR 6.8.5.ex1)", () => {
    const s = createInitialState();
    const georgia = instantiateCard("georgia-emelyov", "geo-1", "server:hq:root");
    georgia.rezzed = true;
    georgia.faceup = true;
    s.cards["geo-1"] = georgia;
    s.servers.hq.root = ["geo-1"];
    s.servers.hq.ice = [];
    s.runner.hand = ["runner-program-1", "runner-fill-1", "runner-fill-2", "runner-fill-3"];
    createPendingAbilityInstance(s, {
      abilityKey: "chum:net-on-run-end",
      sourceId: s.corp.identityId,
      controller: "corp",
      mandatory: true,
      payload: { kind: "chum_net_damage", amount: 3 },
    });
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      preventAllDamageThisRun: true,
    };
    enterStep(s, "run.declareUnsuccessful");
    autoWalk(s);
    expect(s.runner.hand.length).toBe(4);
    expect(s.log.join("\n")).toContain("Prevent all damage this run");
  });


    it("suffers Dedicated Response Team damage as The Noble Path expires (CR 6.8.5.ex2)", () => {
    const s = createInitialState();
    const drt = instantiateCard("dedicated-response-team", "drt-1", "server:hq:root");
    drt.rezzed = true;
    drt.faceup = true;
    s.cards["drt-1"] = drt;
    s.servers.hq.root = ["drt-1"];
    s.servers.hq.ice = [];
    s.runner.tags = 1;
    s.runner.hand = ["runner-program-1", "runner-fill-1", "runner-fill-2", "runner-fill-3"];
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      preventAllDamageThisRun: true,
    };
    enterStep(s, "run.ends");
    autoWalk(s);
    expect(s.runner.hand.length).toBe(2);
    expect(s.log.join("\n")).toContain("6.8.5");
  });
});

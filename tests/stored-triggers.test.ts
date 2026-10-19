/**
 * Conditional abilities whose data was loaded and whose moment was not called.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  enterStep,
  evalEffect,
  fx,
  instantiateCard,
  scoreAgenda,
  resolveTrace,
} from "../src/index.js";
import { payCost } from "../src/state/costs.js";
import { psiCorpBid, psiRunnerBid } from "../src/state/psi.js";
import { completeExpose } from "../src/state/expose.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.7");
});

function must(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function runOn(state: GameState, server: "hq" | "rd"): void {
  state.run = {
    attackedServerId: server,
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
  };
}

describe("stored conditional triggers", () => {
  it("deals Viral Weaponization's damage when the scoring turn ends", () => {
    const s = createInitialState();
    const agenda = instantiateCard("viral-weaponization", "vw-1", "server:hq:root");
    agenda.advancementCounters = 4;
    s.cards["vw-1"] = agenda;
    s.servers.hq.root = ["vw-1"];
    const grip = instantiateCard("sure-gamble", "g-1", "runner:grip");
    s.cards["g-1"] = grip;
    s.runner.hand = ["g-1"];
    scoreAgenda(s, "vw-1");
    s.timingKey = "corp.loseClicks";
    enterStep(s, "corp.turnEnds");
    autoWalk(s);
    expect(s.log.join("\n")).toContain("Viral Weaponization");
    expect(s.runner.discardPile).toContain("g-1");
  });

  it("lets Broadcast Square replace taking bad publicity", () => {
    const s = createInitialState();
    const square = instantiateCard("broadcast-square", "bs-1", "server:hq:root");
    square.rezzed = true;
    s.cards["bs-1"] = square;
    s.servers.hq.root = ["bs-1"];
    s.corp.badPublicity = 0;
    const taken = evalEffect(
      { state: s, sourceId: "bs-1" },
      fx.do({ kind: "give_bad_publicity", amount: 1 }),
    );
    expect(taken.ok).toBe(true);
    expect(s.corp.badPublicity).toBe(0);
    expect(s.trace).toBeTruthy();
    s.runner.link = 2;
    const failed = resolveTrace(s);
    expect(failed.ok).toBe(true);
    expect(s.corp.badPublicity).toBe(1);
  });

  it("gains a credit from Order of Sol the first time the pool is empty", () => {
    const s = createInitialState();
    const sol = instantiateCard("order-of-sol", "sol-1", "runner:installed");
    s.cards["sol-1"] = sol;
    s.runner.installed = ["sol-1"];
    s.runner.credits = 1;
    payCost(s, "runner", { credits: 1 }, "test");
    expect(s.runner.credits).toBe(1);
    payCost(s, "runner", { credits: 1 }, "test");
    expect(s.runner.credits).toBe(0);
  });

  it("gains a credit from Order of Sol when a psi bid empties the pool (CR 1.10)", () => {
    const s = createInitialState();
    const sol = instantiateCard("order-of-sol", "sol-1", "runner:installed");
    s.cards["sol-1"] = sol;
    s.runner.installed = ["sol-1"];
    s.runner.credits = 1;
    s.corp.credits = 5;
    s.psi = {
      id: "psi-1",
      sourceId: s.corp.identityId,
      maxBid: 2,
      runnerBid: null,
      corpBid: null,
      ifBidsDiffer: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      ifBidsMatch: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
    };
    expect(psiRunnerBid(s, 1)).toBeNull();
    expect(psiCorpBid(s, 0)).toBeNull();
    expect(s.runner.credits).toBe(1);
    expect(s.log.join("\n")).toContain("Order of Sol");
  });

  it("fires a rezzed upgrade when the run on its server succeeds or fails", () => {
    const success = createInitialState();
    const wisp = instantiateCard("will-o-the-wisp", "wisp-1", "server:hq:root");
    wisp.rezzed = true;
    success.cards["wisp-1"] = wisp;
    success.servers.hq.root = ["wisp-1"];
    runOn(success, "hq");
    success.timingKey = "run.approachServerPaw";
    enterStep(success, "run.success");
    autoWalk(success);
    expect(success.log.join("\n")).toContain("Will-o'-the-Wisp");

    const fail = createInitialState();
    const georgia = instantiateCard("georgia-emelyov", "ga-1", "server:hq:root");
    georgia.rezzed = true;
    const grip = instantiateCard("sure-gamble", "g-1", "runner:grip");
    fail.cards["ga-1"] = georgia;
    fail.cards["g-1"] = grip;
    fail.servers.hq.root = ["ga-1"];
    fail.runner.hand = ["g-1"];
    fail.activeSide = "runner";
    fail.timingKey = "run.jackOutWindow";
    runOn(fail, "hq");
    const jacked = must(fail, { type: "jack_out" });
    expect(jacked.runner.discardPile).toContain("g-1");
    expect(jacked.log.join("\n")).toContain("Georgia Emelyov");
  });

  it("uses Savoir-faire's paid ability only once each turn", () => {
    const s = createInitialState();
    const savoir = instantiateCard("savoir-faire", "sf-1", "runner:installed");
    const prog = instantiateCard("bug", "ff-1", "runner:grip");
    s.cards["sf-1"] = savoir;
    s.cards["ff-1"] = prog;
    s.runner.installed = ["sf-1"];
    s.runner.hand = ["ff-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    const offered = must(s, {
      type: "use_paid_ability",
      cardId: "sf-1",
      abilityId: "savoir-faire-install",
    });
    const first = must(offered, {
      type: "choose_option",
      optionId: "savoir-faire:ff-1",
    });
    expect(first.runner.installed).toContain("ff-1");
    const second = applyAction(first, {
      type: "use_paid_ability",
      cardId: "sf-1",
      abilityId: "savoir-faire-install",
    });
    expect(second.ok).toBe(false);
  });

  it("fires access abilities for installed, uninstalled, and non-R&D cards", () => {
    const installed = createInitialState();
    const plan = instantiateCard("plan-b", "plan-1", "server:hq:root");
    installed.cards["plan-1"] = plan;
    installed.servers.hq.root = ["plan-1"];
    runOn(installed, "hq");
    installed.run!.accessingCardId = "plan-1";
    installed.timingKey = "breach.access";
    enterStep(installed, "access.cardAccessed");
    autoWalk(installed);
    expect(installed.log.join("\n")).toContain("Plan B");

    const uninstalled = createInitialState();
    const future = instantiateCard("the-future-perfect", "fp-1", "corp:hq");
    uninstalled.cards["fp-1"] = future;
    uninstalled.corp.hand = ["fp-1"];
    runOn(uninstalled, "hq");
    uninstalled.run!.accessingCardId = "fp-1";
    uninstalled.timingKey = "breach.access";
    enterStep(uninstalled, "access.cardAccessed");
    autoWalk(uninstalled);
    expect(uninstalled.psi ?? uninstalled.log.join("\n")).toBeTruthy();
    expect(uninstalled.log.join("\n")).toContain("The Future Perfect");

    const notRd = createInitialState();
    const shi = instantiateCard("shi-kyu", "shi-1", "corp:hq");
    notRd.cards["shi-1"] = shi;
    notRd.corp.hand = ["shi-1"];
    runOn(notRd, "hq");
    notRd.run!.accessingCardId = "shi-1";
    notRd.timingKey = "breach.access";
    enterStep(notRd, "access.cardAccessed");
    autoWalk(notRd);
    expect(notRd.log.join("\n")).toContain("Shi.Kyū");
  });

  it("offers Bug when the Corp draws a card", () => {
    const s = createInitialState();
    const bug = instantiateCard("bug", "bug-1", "runner:installed");
    const top = instantiateCard("sure-gamble", "top-1", "corp:rd");
    s.cards["bug-1"] = bug;
    s.cards["top-1"] = top;
    s.runner.installed = ["bug-1"];
    s.corp.deck = ["top-1", ...s.corp.deck];
    const drawn = evalEffect(
      { state: s, sourceId: "bug-1" },
      fx.do({ kind: "draw", side: "corp", amount: 1 }),
    );
    expect(drawn.ok).toBe(true);
    expect(s.log.join("\n")).toContain("Bug");
  });

  it("does net damage when It's a Trap! is exposed", () => {
    const s = createInitialState();
    const trap = instantiateCard("its-a-trap", "trap-1", "server:hq:ice");
    const grip = instantiateCard("sure-gamble", "g-1", "runner:grip");
    const grip2 = instantiateCard("sure-gamble", "g-2", "runner:grip");
    s.cards["trap-1"] = trap;
    s.cards["g-1"] = grip;
    s.cards["g-2"] = grip2;
    s.servers.hq.ice = ["trap-1"];
    s.runner.hand = ["g-1", "g-2"];
    completeExpose(s, "trap-1");
    expect(s.runner.hand).toHaveLength(0);
    expect(s.log.join("\n")).toContain("It's a Trap!");
  });

  it("gains a credit from NeoTokyo Grid on the first advancement in its server", () => {
    const s = createInitialState();
    const grid = instantiateCard("neotokyo-grid", "neo-1", "server:hq:root");
    grid.rezzed = true;
    const agenda = instantiateCard("priority-requisition", "ag-1", "server:hq:root");
    s.cards["neo-1"] = grid;
    s.cards["ag-1"] = agenda;
    s.servers.hq.root = ["neo-1", "ag-1"];
    s.corp.credits = 5;
    s.corp.clicks = 2;
    s.activeSide = "corp";
    s.timingKey = "corp.action";
    const advanced = must(s, { type: "advance", cardId: "ag-1" });
    expect(advanced.corp.credits).toBe(5);
    expect(advanced.log.join("\n")).toContain("NeoTokyo Grid");
  });

  it("offers the once-per-turn encounter ability and Compile's first encounter", () => {
    const encounter = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    const pan = instantiateCard("panchatantra", "pan-1", "runner:installed");
    encounter.cards["ice-1"] = ice;
    encounter.cards["pan-1"] = pan;
    encounter.servers.hq.ice = ["ice-1"];
    encounter.runner.installed = ["pan-1"];
    runOn(encounter, "hq");
    encounter.run!.position = 0;
    encounter.timingKey = "run.iceRezzed";
    enterStep(encounter, "run.encounter");
    autoWalk(encounter);
    expect(encounter.pendingChoice?.sourceId).toBe("pan-1");

    const compile = createInitialState();
    const wall = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    wall.rezzed = true;
    const event = instantiateCard("compile", "compile-1", "runner:play-area");
    compile.cards["ice-1"] = wall;
    compile.cards["compile-1"] = event;
    compile.servers.hq.ice = ["ice-1"];
    compile.playedRunEventId = "compile-1";
    runOn(compile, "hq");
    compile.run!.position = 0;
    compile.timingKey = "run.iceRezzed";
    enterStep(compile, "run.encounter");
    autoWalk(compile);
    expect(compile.pendingChoice?.sourceId).toBe("compile-1");
  });

  it("offers Maya when an R&D access finishes", () => {
    const s = createInitialState();
    const maya = instantiateCard("maya", "maya-1", "runner:installed");
    const card = instantiateCard("sure-gamble", "c-1", "corp:rd");
    s.cards["maya-1"] = maya;
    s.cards["c-1"] = card;
    s.runner.installed = ["maya-1"];
    runOn(s, "rd");
    s.run!.accessingCardId = "c-1";
    s.timingKey = "access.stealAgenda";
    enterStep(s, "access.complete");
    autoWalk(s);
    expect(s.pendingChoice?.sourceId).toBe("maya-1");
  });

  it("places an advancement from Tennin when the Runner had no successful run", () => {
    const s = createInitialState();
    const id = instantiateCard(
      "tennin-institute-the-secrets-within",
      "tennin-1",
      "corp:identity",
    );
    const ice = instantiateCard("ice-wall", "ag-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["tennin-1"] = id;
    s.cards["ag-1"] = ice;
    s.corp.identityId = "tennin-1";
    s.servers.hq.ice = ["ag-1"];
    s.turn.successfulRunLastTurn = false;
    s.timingKey = "corp.mandatoryDraw";
    enterStep(s, "corp.turnBegins");
    autoWalk(s);
    expect(s.pendingChoice?.sourceId).toBe("tennin-1");
  });

  it("gains a credit for Nisei Division when psi credits are revealed", () => {
    const s = createInitialState();
    const id = instantiateCard(
      "nisei-division-the-next-generation",
      "nisei-1",
      "corp:identity",
    );
    s.cards["nisei-1"] = id;
    s.corp.identityId = "nisei-1";
    s.corp.credits = 5;
    s.runner.credits = 5;
    const started = evalEffect(
      { state: s, sourceId: "nisei-1" },
      fx.do({
        kind: "play_psi_game",
        maxBid: 2,
        ifBidsMatch: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        ifBidsDiffer: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
      }),
    );
    expect(started.ok).toBe(true);
    const bid = must(s, { type: "psi_runner_bid", amount: 0 });
    const revealed = must(bid, { type: "psi_corp_bid", amount: 0 });
    expect(revealed.corp.credits).toBe(6);
  });
});

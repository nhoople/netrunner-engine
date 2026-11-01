import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  getPublicView,
  instantiateCard,
} from "../src/index.js";
import { installCorp } from "../src/actions/installCorp.js";
import { installRunner } from "../src/actions/installRunner.js";
import { removeCardFromCurrentZone } from "../src/state/scoring.js";
import {
  badPublicityConsidered,
  consideredAdvancement,
  onAccessed,
  onCardAdvanced,
  runnerHeapLocked,
  startIdentitySetup,
} from "../src/state/cardDeclarations.js";
import { startTrace } from "../src/state/trace.js";
import { fx } from "../src/effects/ir.js";

describe("remaining static declarations", () => {
  beforeAll(() => {
    assertCardsPinnedTag("v1.147.14");
    assertPinnedTag("v26.03");
    expect(cardsDataPresent() && crDataPresent()).toBe(true);
  });

  it("keeps cards in the heap while Blacklist is rezzed", () => {
    const s = createInitialState();
    const list = instantiateCard("sure-gamble", "bl-1", "server:hq:root");
    list.rezzed = true;
    list.cardsCannotLeaveRunnerHeap = true;
    s.cards["bl-1"] = list;
    s.servers.hq.root = ["bl-1"];
    const heap = instantiateCard("sure-gamble", "heap-1", "runner:heap");
    s.cards["heap-1"] = heap;
    s.runner.discardPile = ["heap-1"];
    expect(runnerHeapLocked(s)).toBe(true);
    removeCardFromCurrentZone(s, "heap-1");
    expect(s.runner.discardPile).toContain("heap-1");
  });

  it("counts Corporate Scandal as additional bad publicity that is not in the pool", () => {
    const s = createInitialState();
    const scandal = instantiateCard("sure-gamble", "sc-1", "runner:play-area");
    scandal.corpAdditionalBadPublicity = 1;
    scandal.corpAdditionalBadPublicityCannotBeRemoved = true;
    s.cards["sc-1"] = scandal;
    s.runner.playArea = ["sc-1"];
    s.corp.badPublicity = 0;
    expect(badPublicityConsidered(s)).toBe(1);
    expect(s.corp.badPublicity).toBe(0);
  });

  it("adds Satellite Grid advancement to ice protecting that server", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.advancementCounters = 1;
    const grid = instantiateCard("sure-gamble", "grid-1", "server:hq:root");
    grid.rezzed = true;
    grid.iceProtectingThisServerAdditionalAdvancementCounters = 1;
    s.cards["ice-1"] = ice;
    s.cards["grid-1"] = grid;
    s.servers.hq.ice = ["ice-1"];
    s.servers.hq.root = ["grid-1"];
    expect(consideredAdvancement(s, ice)).toBe(2);
  });

  it("reveals the grip to the Corp while Harishchandra's Runner is tagged", () => {
    const s = createInitialState();
    s.cards[s.corp.identityId]!.revealGripWhileRunnerTagged = true;
    s.runner.tags = 1;
    s.runner.hand = ["runner-program-1"];
    const view = getPublicView(s, "corp");
    expect(view.opponent.revealedHand).toEqual(["runner-program-1"]);
  });

  it("installs Adam's directives from the stack before the first turn", () => {
    const s = createInitialState();
    s.cards[s.runner.identityId]!.startWithDirectiveCards = 1;
    const directive = instantiateCard("sure-gamble", "dir-1", "runner:stack");
    directive.subtypes = ["directive"];
    s.cards["dir-1"] = directive;
    s.runner.deck = ["dir-1", ...s.runner.deck];
    startIdentitySetup(s);
    expect(s.runner.installed).toContain("dir-1");
    expect(directive.zone).toBe("runner:installed");
  });

  it("adds Quantum Predictive Model to the Corp score when the Runner is tagged", () => {
    const s = createInitialState();
    const agenda = instantiateCard("priority-requisition", "qpm-1", "corp:hq");
    agenda.addToCorpScoreOnAccessIfRunnerTagged = true;
    s.cards["qpm-1"] = agenda;
    s.corp.hand = ["qpm-1"];
    s.runner.tags = 1;
    onAccessed(s, "qpm-1");
    expect(s.corp.scoreArea).toContain("qpm-1");
    expect(agenda.zone).toBe("corp:score");
  });

  it("places Oberth's extra advancement the first time a card in that server is advanced", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.advancementCounters = 1;
    ice.rezzed = true;
    const oberth = instantiateCard("sure-gamble", "ob-1", "server:hq:root");
    oberth.rezzed = true;
    oberth.oberthFirstAdvanceThisServerAdditionalAdvancement = 2;
    s.cards["ice-1"] = ice;
    s.cards["ob-1"] = oberth;
    s.servers.hq.ice = ["ice-1"];
    s.servers.hq.root = ["ob-1"];
    onCardAdvanced(s, "ice-1");
    expect(ice.advancementCounters).toBe(3);
  });

  it("makes the Runner spend first for a trace during a run under Surveillance Sweep", () => {
    const s = createInitialState();
    const sweep = instantiateCard("sure-gamble", "sw-1", "corp:play-area");
    sweep.runnerSpendsFirstForTracesDuringRun = true;
    s.cards["sw-1"] = sweep;
    s.corp.playArea = ["sw-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      icePassed: 0,
      successful: false,
      breached: false,
    } as typeof s.run;
    startTrace(s, "sw-1", 1, fx.do({ kind: "gain_credits", side: "corp", amount: 0 }));
    expect(s.trace?.runnerSpendsFirst).toBe(true);
  });

  it("lets the Runner name Diwan's server, then charges the Corp to install there", () => {
    const s = createInitialState();
    const diwan = instantiateCard("diwan", "diwan-1", "runner:grip");
    s.cards["diwan-1"] = diwan;
    s.runner.hand = ["diwan-1"];
    const installed = installRunner(s, "diwan-1");
    if (!installed.ok) throw new Error(installed.error);
    expect(installed.state.cards["diwan-1"]?.chosenServerId).toBeUndefined();
    expect(installed.state.pendingChoice?.options.map((option) => option.id).sort()).toEqual([
      "diwan:archives",
      "diwan:hq",
      "diwan:rd",
    ]);
    const named = applyAction(installed.state, {
      type: "choose_option",
      optionId: "diwan:rd",
    });
    if (!named.ok) throw new Error(named.error);
    expect(named.state.cards["diwan-1"]?.chosenServerId).toBe("rd");
    expect(named.state.pendingChoice).toBeNull();

    const ice = instantiateCard("ice-wall", "ice-1", "corp:hq");
    named.state.cards["ice-1"] = ice;
    named.state.corp.hand = ["ice-1"];
    const before = named.state.corp.credits;
    const onRd = installCorp(named.state, "ice-1", { kind: "protect", serverId: "rd" });
    if (!onRd.ok) throw new Error(onRd.error);
    // Empty server: ice install cost is 0 (CR 1.16.6b), plus Diwan's 1.
    expect(onRd.state.corp.credits).toBe(before - 1);
    expect(onRd.state.servers.rd.ice).toContain("ice-1");
  });

  it("installs Bazaar's other copy from the grip, paying its install cost", () => {
    const s = createInitialState();
    const bazaar = instantiateCard("bazaar", "bazaar-1", "runner:installed");
    const first = instantiateCard("clone-chip", "chip-1", "runner:grip");
    const second = instantiateCard("clone-chip", "chip-2", "runner:grip");
    s.cards["bazaar-1"] = bazaar;
    s.cards["chip-1"] = first;
    s.cards["chip-2"] = second;
    s.runner.installed = ["bazaar-1"];
    s.runner.hand = ["chip-1", "chip-2"];
    const installed = installRunner(s, "chip-1");
    if (!installed.ok) throw new Error(installed.error);
    const option = installed.state.pendingChoice?.options.find((choice) =>
      choice.id.startsWith("decl:bazaar:"),
    );
    expect(option?.id).toBe("decl:bazaar:chip-2");
    const before = installed.state.runner.credits;
    const copied = applyAction(installed.state, {
      type: "choose_option",
      optionId: "decl:bazaar:chip-2",
    });
    if (!copied.ok) throw new Error(copied.error);
    expect(copied.state.runner.installed).toEqual(["bazaar-1", "chip-1", "chip-2"]);
    expect(copied.state.runner.credits).toBe(before - second.installCost);
  });

  it("resolves a Caïssa click ability without spending a click when Deep Red is installed", () => {
    const s = createInitialState();
    const deep = instantiateCard("deep-red", "deep-1", "runner:installed");
    const caissa = instantiateCard("corroder", "cais-1", "runner:grip");
    caissa.subtypes = [...(caissa.subtypes ?? []), "caïssa"];
    caissa.paidAbilities = [
      {
        id: "cais-click",
        label: "Click: gain 1",
        clickCost: 1,
        creditCost: 0,
        cost: { clicks: 1 },
        windows: ["runner_action_paw"],
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 1 }),
      },
    ];
    s.cards["deep-1"] = deep;
    s.cards["cais-1"] = caissa;
    s.runner.installed = ["deep-1"];
    s.runner.hand = ["cais-1"];
    s.runner.clicks = 3;
    const installed = installRunner(s, "cais-1");
    if (!installed.ok) throw new Error(installed.error);
    const before = installed.state.runner.credits;
    const triggered = applyAction(installed.state, {
      type: "choose_option",
      optionId: "decl:deep:deep-1:cais-1",
    });
    if (!triggered.ok) throw new Error(triggered.error);
    expect(triggered.state.runner.clicks).toBe(3);
    expect(triggered.state.runner.credits).toBe(before + 1);
    expect(triggered.state.turn.deepRedAbility).toBeUndefined();
  });

  it("finishes an X install cost with the chosen number", () => {
    const s = createInitialState();
    const bag = instantiateCard("bug-out-bag", "bag-1", "runner:grip");
    s.cards["bag-1"] = bag;
    s.runner.hand = ["bag-1"];
    const offered = installRunner(s, "bag-1");
    if (!offered.ok) throw new Error(offered.error);
    expect(offered.state.runner.installed).not.toContain("bag-1");
    expect(offered.state.pendingChoice?.options.some((option) => option.id === "install-x:2")).toBe(
      true,
    );
    const before = offered.state.runner.credits;
    const installed = applyAction(offered.state, {
      type: "choose_option",
      optionId: "install-x:2",
    });
    if (!installed.ok) throw new Error(installed.error);
    expect(installed.state.runner.installed).toContain("bag-1");
    expect(installed.state.runner.credits).toBe(before - 2);
  });

  it("lets the Runner choose Chameleon's breaker subtype", () => {
    const s = createInitialState();
    const chameleon = instantiateCard("chameleon", "cham-1", "runner:grip");
    s.cards["cham-1"] = chameleon;
    s.runner.hand = ["cham-1"];
    const offered = installRunner(s, "cham-1");
    if (!offered.ok) throw new Error(offered.error);
    expect(offered.state.pendingChoice?.options.map((option) => option.id)).toEqual([
      "subtype:barrier",
      "subtype:code-gate",
      "subtype:sentry",
    ]);
    const named = applyAction(offered.state, {
      type: "choose_option",
      optionId: "subtype:code-gate",
    });
    if (!named.ok) throw new Error(named.error);
    expect(named.state.cards["cham-1"]?.breaker?.breaksSubtype).toBe("code gate");
    expect(named.state.cards["cham-1"]?.subtypes).toContain("code gate");
    expect(named.state.cards["cham-1"]?.subtypes).not.toContain("barrier");
  });

  it("lets the Runner choose Femme Fatale's ice without naming an unrezzed title", () => {
    const s = createInitialState();
    const shown = instantiateCard("ice-wall", "ice-shown", "server:hq:ice");
    shown.rezzed = true;
    shown.faceup = true;
    const hidden = instantiateCard("tollbooth", "ice-hidden", "server:rd:ice");
    hidden.rezzed = false;
    hidden.faceup = false;
    const femme = instantiateCard("femme-fatale", "femme-1", "runner:grip");
    s.cards["ice-shown"] = shown;
    s.cards["ice-hidden"] = hidden;
    s.cards["femme-1"] = femme;
    s.servers.hq.ice = ["ice-shown"];
    s.servers.rd.ice = ["ice-hidden"];
    s.runner.hand = ["femme-1"];
    s.runner.credits = 9;
    const offered = installRunner(s, "femme-1");
    if (!offered.ok) throw new Error(offered.error);
    const labels = offered.state.pendingChoice?.options.map((option) => option.label) ?? [];
    expect(labels).toContain("Ice Wall, the ice on hq");
    expect(labels.some((label) => label.includes("unrezzed ice"))).toBe(true);
    expect(labels.some((label) => label.includes("Tollbooth"))).toBe(false);
    const named = applyAction(offered.state, {
      type: "choose_option",
      optionId: "chosen-ice:ice-hidden",
    });
    if (!named.ok) throw new Error(named.error);
    expect(named.state.cards["femme-1"]?.chosenIceId).toBe("ice-hidden");
    expect(named.state.log.join("\n")).toContain("an unrezzed piece of ice");
    expect(named.state.log.join("\n")).not.toContain("Tollbooth");
  });

  it("lets the Runner choose Boomerang's ice", () => {
    const s = createInitialState();
    const outer = instantiateCard("ice-wall", "ice-hq", "server:hq:ice");
    outer.rezzed = true;
    outer.faceup = true;
    const inner = instantiateCard("ice-wall", "ice-rd", "server:rd:ice");
    inner.rezzed = true;
    inner.faceup = true;
    const boom = instantiateCard("boomerang", "boom-1", "runner:grip");
    s.cards["ice-hq"] = outer;
    s.cards["ice-rd"] = inner;
    s.cards["boom-1"] = boom;
    s.servers.hq.ice = ["ice-hq"];
    s.servers.rd.ice = ["ice-rd"];
    s.runner.hand = ["boom-1"];
    const offered = installRunner(s, "boom-1");
    if (!offered.ok) throw new Error(offered.error);
    const named = applyAction(offered.state, {
      type: "choose_option",
      optionId: "chosen-ice:ice-rd",
    });
    if (!named.ok) throw new Error(named.error);
    expect(named.state.cards["boom-1"]?.chosenIceId).toBe("ice-rd");
  });
});

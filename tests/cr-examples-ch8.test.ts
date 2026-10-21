/**
 * Comprehensive Rules examples from chapter 8.
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
  crDataPresent,
  enterStep,
  evalEffect,
  getPublicView,
  instantiateCard,
  CR,
} from "../src/index.js";
import { fx } from "../src/effects/ir.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";
import { moveRunnerCardToHeap } from "../src/state/trashHooks.js";
import {
  maybeOpenTrashPrevent,
  triggerPendingTrashInterrupt,
} from "../src/state/trashPrevent.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.9");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}


function at(lines: string[], fragment: string): number {
  const i = lines.findIndex((line) => line.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
}

function runnerTurn(state: GameState, clicks = 4, credits = 5): GameState {
  state.activeSide = "runner";
  state.timingKey = "runner.takeAction";
  state.runner.clicks = clicks;
  state.runner.credits = credits;
  return state;
}

function corpTurn(state: GameState, clicks = 3, credits = 10): GameState {
  state.activeSide = "corp";
  state.timingKey = "corp.takeAction";
  state.corp.clicks = clicks;
  state.corp.credits = credits;
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

describe("CR examples, chapter 8", () => {


  it("still trashes Harbinger when it turns facedown, so Wasteland gains a credit (CR 8.2.2.ex1)", () => {
    const s = createInitialState();
    const harbinger = instantiateCard("harbinger", "hb-1", "runner:installed");
    harbinger.faceup = true;
    const waste = instantiateCard("wasteland", "waste-1", "runner:installed");
    s.cards["hb-1"] = harbinger;
    s.cards["waste-1"] = waste;
    s.runner.installed = ["hb-1", "waste-1"];
    s.runner.credits = 0;
    s.pendingTrashPrevent = {
      cardId: "hb-1",
      pendingInterruptIds: ["hb-1"],
      trashExpected: true,
    };
    const turned = triggerPendingTrashInterrupt(s, "hb-1");
    expect(turned.ok).toBe(true);
    expect(s.cards["hb-1"]?.faceup).toBe(false);
    expect(s.runner.installed).toContain("hb-1");
    expect(s.runner.discardPile).not.toContain("hb-1");
    expect(s.runner.credits).toBe(1);
  });


  it("does not place a District 99 counter when Sacrificial Construct prevents the trash (CR 8.2.2a.ex1)", () => {
    const s = runnerTurn(createInitialState(), 0, 0);
    const program = instantiateCard("corroder", "prog-1", "runner:installed");
    const sac = instantiateCard("sacrificial-construct", "sac-1", "runner:installed");
    const district = instantiateCard("district-99", "d99-1", "runner:installed");
    s.cards["prog-1"] = program;
    s.cards["sac-1"] = sac;
    s.cards["d99-1"] = district;
    s.runner.installed = ["prog-1", "sac-1", "d99-1"];
    expect(maybeOpenTrashPrevent(s, "prog-1")).toBe(true);
    const prevented = must(s, {
      type: "use_paid_ability",
      cardId: "sac-1",
      abilityId: "sacrificial-prevent-trash",
    });
    expect(prevented.runner.installed).toContain("prog-1");
    expect(prevented.runner.discardPile).toContain("sac-1");
    expect(prevented.cards["d99-1"]?.powerCounters ?? 0).toBe(0);
    expect(prevented.turn.firstProgramOrHardwareTrashUsedThisTurn).toBeFalsy();
    expect(prevented.pendingChoice).toBeNull();
    moveRunnerCardToHeap(prevented, "prog-1");
    expect(prevented.pendingChoice?.options.some((option) => option.id === "place-power")).toBe(
      true,
    );
    const placed = must(prevented, { type: "choose_option", optionId: "place-power" });
    expect(placed.cards["d99-1"]?.powerCounters).toBe(1);
  });


  it("does not tell the Runner which R&D positions Cultivate used (CR 8.3.3b.ex1)", () => {
    const s = createInitialState();
    const source = instantiateCard("cultivate", "cult-1", "corp:play-area");
    s.cards["cult-1"] = source;
    const titles = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];
    const ids = titles.map((title, index) => {
      const id = `look-${index}`;
      const card = instantiateCard("hedge-fund", id, "corp:rd");
      card.title = title;
      card.faceup = false;
      s.cards[id] = card;
      return id;
    });
    s.corp.deck = [...ids];
    const looked = evalEffect(
      { state: s, sourceId: "cult-1" },
      fx.do({ kind: "look_top_n_rd_trash_one_hq_one_arrange_rest", n: 5 }),
    );
    if (!looked.ok) throw new Error(looked.error);
    expect(s.log.join("\n")).not.toContain("Alpha");
    const runner = getPublicView(s, "runner");
    const corp = getPublicView(s, "corp");
    const runnerLabels = runner.pendingChoice?.options.map((option) => option.label).join("\n") ?? "";
    const corpLabels = corp.pendingChoice?.options.map((option) => option.label).join("\n") ?? "";
    expect(runnerLabels).not.toContain("Alpha");
    expect(corpLabels).toContain("Alpha");
    const trashed = must(s, { type: "choose_option", optionId: "cultivate-trash:look-0" });
    const added = must(trashed, { type: "choose_option", optionId: "cultivate-hq:look-1" });
    expect(added.corp.discardPile).toContain("look-0");
    expect(added.corp.hand).toContain("look-1");
    expect(added.cards["look-1"]?.faceup).toBe(false);
    const text = added.log.join("\n");
    expect(text).toContain("trash a looked card");
    expect(text).toContain("add a looked card to HQ");
    expect(text).not.toContain("Beta");
    expect(text).not.toMatch(/position|from the top/);
  });


  it("lets Raman Rai swap a set-aside draw before Daily Business Show bottoms one (CR 8.4.3b.ex1)", () => {
    const s = createInitialState();
    const show = instantiateCard("daily-business-show", "dbs-1", "server:hq:root");
    show.rezzed = true;
    const raman = instantiateCard("raman-rai", "raman-1", "server:hq:root");
    raman.rezzed = true;
    const wrap = instantiateCard("wraparound", "wrap-1", "corp:rd");
    wrap.faceup = false;
    const enigma = instantiateCard("enigma", "enigma-1", "corp:rd");
    enigma.faceup = false;
    const toll = instantiateCard("tollbooth", "toll-1", "corp:archives");
    toll.faceup = true;
    s.cards["dbs-1"] = show;
    s.cards["raman-1"] = raman;
    s.cards["wrap-1"] = wrap;
    s.cards["enigma-1"] = enigma;
    s.cards["toll-1"] = toll;
    s.servers.hq.root = ["dbs-1", "raman-1"];
    s.corp.deck = ["wrap-1", "enigma-1"];
    s.corp.discardPile = ["toll-1"];
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.mandatoryDraw";
    const drawing = must(s, { type: "pass_window" });
    const swap = drawing.pendingChoice?.options.find((option) =>
      option.id.startsWith("raman:enigma-1:toll-1"),
    );
    expect(swap).toBeTruthy();
    const swapped = must(drawing, { type: "choose_option", optionId: swap!.id });
    expect(swapped.corp.discardPile).toContain("enigma-1");
    const bottomed = must(swapped, {
      type: "choose_option",
      optionId: "dbs-bottom:toll-1",
    });
    expect(bottomed.corp.deck.at(-1)).toBe("toll-1");
    expect(bottomed.corp.hand).toContain("wrap-1");
    expect(bottomed.corp.hand).not.toContain("enigma-1");
  });


  it("installs Dhegdheer first so Mass Install can host the next program (CR 8.5.5.ex1)", () => {
    const s = runnerTurn(createInitialState(), 0, 2);
    const mass = instantiateCard("mass-install", "mi-1", "runner:play-area");
    const dheg = instantiateCard("dhegdheer", "dh-1", "runner:grip");
    const prog = instantiateCard("corroder", "co-1", "runner:grip");
    prog.installCost = 1;
    s.cards["mi-1"] = mass;
    s.cards["dh-1"] = dheg;
    s.cards["co-1"] = prog;
    s.runner.hand = ["dh-1", "co-1"];
    const started = evalEffect(
      { state: s, sourceId: "mi-1" },
      fx.do({
        kind: "install_up_to_n_programs_from_grip_discount",
        remaining: 3,
        discount: 0,
      }),
    );
    if (!started.ok) throw new Error(started.error);
    const first = must(s, { type: "choose_option", optionId: "monolith:dh-1" });
    const host = first.pendingChoice?.options.find(
      (option) => option.id === "monolith:co-1:host:dh-1",
    );
    expect(host?.label).toContain("0¢");
    const hosted = must(first, { type: "choose_option", optionId: "monolith:co-1:host:dh-1" });
    expect(hosted.cards["co-1"]?.hostId).toBe("dh-1");
    expect(hosted.runner.credits).toBe(0);
    expect(hosted.runner.installed).toEqual(expect.arrayContaining(["dh-1", "co-1"]));
  });


    it("installs an unrevealed upgrade into an occupied remote root and rejects an operation (CR 8.5.13a.ex1)", () => {
    let s = createInitialState();
    const serverId = remote(s, "remote-1", [], ["pad-1"]);
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    pad.faceup = false;
    pad.rezzed = false;
    s.cards["pad-1"] = pad;
    const hedge = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    const grid = instantiateCard("nanisivik-grid", "nan-1", "corp:hq");
    s.cards["hf-1"] = hedge;
    s.cards["nan-1"] = grid;
    s.corp.hand = ["hf-1", "nan-1"];
    corpTurn(s, 2, 10);

    const operation = applyAction(s, {
      type: "basic_install",
      cardId: "hf-1",
      destination: { kind: "remote_root", serverId },
    });
    expect(operation.ok).toBe(false);
    const secondAsset = instantiateCard("pad-campaign", "pad-2", "corp:hq");
    s.cards["pad-2"] = secondAsset;
    s.corp.hand = ["hf-1", "nan-1", "pad-2"];
    const asset = applyAction(s, {
      type: "basic_install",
      cardId: "pad-2",
      destination: { kind: "remote_root", serverId },
    });
    expect(asset.ok).toBe(false);
    if (!asset.ok) expect(asset.cites?.map((cite) => cite.number)).toContain("4.6.6e");

    s = must(s, {
      type: "basic_install",
      cardId: "nan-1",
      destination: { kind: "remote_root", serverId },
    });
    expect(s.servers[serverId]!.root).toEqual(["pad-1", "nan-1"]);
    expect(s.cards["pad-1"]?.faceup).toBe(false);
    expect(s.cards["nan-1"]?.faceup).toBe(false);
    expect(s.log.some((line) => /reveal (Pad Campaign|Nanisivik Grid)/i.test(line))).toBe(false);
  });


    it("does not reveal ice Brân installs from HQ (CR 8.5.13a.ex2)", () => {
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
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 1 });
    s = passUntil(s, (st) => st.timingKey === "run.encounterPaw");
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 2 });
    s = passUntil(s, (st) => st.servers[serverId]!.ice.includes("in-1"));
    expect(s.cards["in-1"]?.faceup).toBe(false);
    expect(s.cards["in-1"]?.zone).toBe(`server:${serverId}:ice`);
    expect(s.log.some((line) => /reveal Ice Wall/i.test(line))).toBe(false);
    expect(s.log.some((line) => line.includes("Install Ice Wall inward of Brân 1.0"))).toBe(
      true,
    );
  });


    it("does not reveal a second region installed into a root that already has one (CR 8.5.13b.ex1)", () => {
    let s = createInitialState();
    const serverId = remote(s, "remote-1", [], ["nan-old"]);
    const oldGrid = instantiateCard("nanisivik-grid", "nan-old", "server:remote-1:root");
    oldGrid.rezzed = true;
    oldGrid.faceup = true;
    s.cards["nan-old"] = oldGrid;
    const nextGrid = instantiateCard("nanisivik-grid", "nan-new", "corp:hq");
    s.cards["nan-new"] = nextGrid;
    s.corp.hand = ["nan-new"];
    corpTurn(s, 1, 10);

    s = must(s, {
      type: "basic_install",
      cardId: "nan-new",
      destination: { kind: "remote_root", serverId },
    });
    expect(s.servers[serverId]!.root).toEqual(["nan-new"]);
    expect(s.cards["nan-new"]?.faceup).toBe(false);
    expect(s.corp.discardPile).toContain("nan-old");
    expect(s.log.some((line) => /reveal Nanisivik Grid/i.test(line))).toBe(false);
  });


  it("reveals Archer when Ob declines the rez cost (CR 8.5.13c.ex1)", () => {
    const s = createInitialState();
    const identity = instantiateCard(
      "ob-superheavy-logistics-extract-export-excel",
      "ob-1",
      "corp:identity",
    );
    const archer = instantiateCard("archer", "archer-1", "corp:rd");
    archer.faceup = false;
    s.cards["ob-1"] = identity;
    s.cards["archer-1"] = archer;
    s.corp.identityId = "ob-1";
    s.corp.deck = ["archer-1"];
    s.corp.credits = 0;
    s.turn.lastTrashedRezzedPrintedRezCost = 5;
    const searched = evalEffect(
      { state: s, sourceId: "ob-1" },
      fx.do({ kind: "search_rd_install_rez_by_printed_rez_cost", delta: -1 }),
    );
    if (!searched.ok) throw new Error(searched.error);
    expect(s.cards["archer-1"]?.rezzed).toBe(false);
    expect(s.cards["archer-1"]?.faceup).toBe(false);
    const revealed = must(s, { type: "choose_option", optionId: "ob-reveal:archer-1" });
    expect(revealed.cards["archer-1"]?.rezzed).toBe(false);
    expect(revealed.cards["archer-1"]?.faceup).toBe(true);
    expect(revealed.log.join("\n")).toContain("Reveal Archer (CR 8.5.13c)");
    expect(revealed.corp.credits).toBe(0);
  });


  it("reveals the agenda Trust Operation installs, because an agenda cannot be rezzed (CR 8.5.13d.ex1)", () => {
    const s = createInitialState();
    const op = instantiateCard("trust-operation", "trust-1", "corp:play-area");
    const agenda = instantiateCard("hostile-takeover", "agenda-1", "corp:archives");
    agenda.faceup = true;
    s.cards["trust-1"] = op;
    s.cards["agenda-1"] = agenda;
    s.corp.discardPile = ["agenda-1"];
    s.nextRemoteNumber = 1;
    const installed = evalEffect(
      { state: s, sourceId: "trust-1" },
      fx.do({ kind: "install_and_rez_from_archives_free" }),
    );
    if (!installed.ok) throw new Error(installed.error);
    expect(s.cards["agenda-1"]?.rezzed).toBeFalsy();
    expect(s.cards["agenda-1"]?.faceup).toBe(true);
    expect(s.cards["agenda-1"]?.zone).toMatch(/^server:remote-\d+:root$/);
    expect(s.log.join("\n")).toContain("Reveal Hostile Takeover (CR 8.5.13d)");
  });


  it("offers Ad Blitz only the advertisements the Corp can rez (CR 8.5.13d.ex2)", () => {
    const s = createInitialState();
    const blitz = instantiateCard("ad-blitz", "blitz-1", "corp:play-area");
    const cheap = instantiateCard("pad-campaign", "cheap-1", "corp:hq");
    cheap.rezCost = 0;
    const steep = instantiateCard("pad-campaign", "steep-1", "corp:hq");
    steep.rezCost = 3;
    steep.title = "Steep Ad";
    s.cards["blitz-1"] = blitz;
    s.cards["cheap-1"] = cheap;
    s.cards["steep-1"] = steep;
    s.corp.hand = ["cheap-1", "steep-1"];
    s.corp.credits = 0;
    s.turn.lastPlayCostX = 1;
    const offered = evalEffect(
      { state: s, sourceId: "blitz-1" },
      fx.do({ kind: "install_and_rez_x_advertisements_from_hq_or_archives" }),
    );
    if (!offered.ok) throw new Error(offered.error);
    const ids = s.pendingChoice?.options.map((option) => option.id) ?? [];
    expect(ids).toContain("adblitz:cheap-1");
    expect(ids).not.toContain("adblitz:steep-1");
    expect(ids.some((id) => id.includes("decline") || id === "adblitz-stop")).toBe(false);
    const rezzed = must(s, { type: "choose_option", optionId: "adblitz:cheap-1" });
    expect(rezzed.cards["cheap-1"]?.rezzed).toBe(true);
    expect(rezzed.corp.hand).toContain("steep-1");
  });


    it("resolves Brân's install subroutine from Archives with no install (CR 8.5.14.ex1)", () => {
    let s = createInitialState();
    const grid = instantiateCard("nanisivik-grid", "nan-1", "server:hq:root");
    grid.rezzed = true;
    grid.faceup = true;
    s.cards["nan-1"] = grid;
    s.servers.hq.root = ["nan-1"];
    const bran = instantiateCard("bran-1-0", "bran-arch", "corp:archives");
    bran.faceup = false;
    bran.rezzed = false;
    s.cards["bran-arch"] = bran;
    s.corp.discardPile = ["bran-arch"];
    const wall = instantiateCard("ice-wall", "hq-ice", "corp:hq");
    s.cards["hq-ice"] = wall;
    s.corp.hand = ["hq-ice"];
    runnerTurn(s, 1, 5);

    s = must(s, { type: "basic_run", serverId: "hq" });
    s = passUntil(s, (st) => Boolean(st.pendingChoice));
    expect(s.pendingChoice?.chooser).toBe("corp");
    const flip = s.pendingChoice!.options.find((option) => option.id === "flip:bran-arch:0");
    expect(flip).toBeTruthy();
    s = must(s, { type: "choose_option", optionId: flip!.id });
    expect(s.cards["bran-arch"]?.faceup).toBe(true);
    expect(s.cards["bran-arch"]?.zone).toBe("corp:archives");
    expect(s.corp.hand).toEqual(["hq-ice"]);
    expect(s.servers.hq.ice).not.toContain("hq-ice");
    expect(
      s.log.some((line) => line.includes("Install ice inward — source not protecting attacked server.")),
    ).toBe(true);
  });


  it("plays Hedge Fund through Subcontract before IPO, and IPO is paid with those credits (CR 8.6.3.ex1)", () => {
    let s = createInitialState();
    const sub = instantiateCard("subcontract", "sc-1", "corp:hq");
    const hedge = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    const ipo = instantiateCard("ipo", "ipo-1", "corp:hq");
    s.cards["sc-1"] = sub;
    s.cards["hf-1"] = hedge;
    s.cards["ipo-1"] = ipo;
    s.corp.hand = ["sc-1", "hf-1", "ipo-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.runner.tags = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "sc-1" });
    expect(s.pendingChoice?.options.some((o) => o.id === "subcontract-play:hf-1")).toBe(true);

    s = must(s, { type: "choose_option", optionId: "subcontract-play:hf-1" });
    const separate = at(s.log, "Hedge Fund is played separately");
    const paid = at(s.log, "Play cost of 5¢ paid");
    const gain = at(s.log, "corp gains 9¢");
    const trashed = at(s.log, "Hedge Fund trashed");
    const complete = at(s.log, "Play effect complete");
    expect(separate).toBeLessThan(paid);
    expect(paid).toBeLessThan(gain);
    expect(gain).toBeLessThan(trashed);
    expect(trashed).toBeLessThan(complete);
    expect(s.log[separate]).toContain(CR.playingOneAtATime.number);
    expect(s.corp.credits).toBe(9);
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.corp.hand).toContain("ipo-1");
    expect(s.pendingChoice?.options.some((o) => o.id === "subcontract-play:ipo-1")).toBe(true);
    expect(s.log.some((line) => line.includes("Play cost of 8¢ paid"))).toBe(false);

    s = must(s, { type: "choose_option", optionId: "subcontract-play:ipo-1" });
    const ipoSeparate = at(s.log, "IPO is played separately");
    const ipoPaid = at(s.log, "Play cost of 8¢ paid");
    const ipoGain = at(s.log, "corp gains 13¢");
    expect(complete).toBeLessThan(ipoSeparate);
    expect(ipoSeparate).toBeLessThan(ipoPaid);
    expect(ipoPaid).toBeLessThan(ipoGain);
    expect(s.log[ipoSeparate]).toContain(CR.playingOneAtATime.number);
    expect(s.corp.credits).toBe(14);
    expect(s.cards["ipo-1"]?.zone).toBe("corp:archives");
    expect(s.checkpoints).toHaveLength(0);
  });


  it("trashes Test Run once its lingering effect exists, and that effect returns the program at the end of the turn (CR 8.6.4.ex1)", () => {
    let s = createInitialState();
    const ev = instantiateCard("test-run", "tr-1", "runner:grip");
    const program = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["tr-1"] = ev;
    s.cards["co-1"] = program;
    s.runner.hand = ["tr-1"];
    s.runner.deck = ["co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "tr-1" });

    const linger = at(s.log, "creates a lingering effect");
    const trashed = at(s.log, "Test Run trashed");
    const complete = at(s.log, "Play effect complete");
    expect(linger).toBeLessThan(trashed);
    expect(trashed).toBeLessThan(complete);
    expect(s.log[linger]).toContain("independent of Test Run");
    expect(s.log[linger]).toContain(CR.playingLingeringEffects.number);
    expect(s.cards["tr-1"]?.zone).toBe("runner:heap");
    expect(s.cards["co-1"]?.zone).toBe("runner:installed");
    expect(s.checkpoints).toHaveLength(0);

    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.cards["co-1"]?.zone).toBe("runner:installed");
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });

    const returned = s.log.findIndex(
      (line) => line === "Corroder returns to the stack at the end of the turn.",
    );
    expect(returned, "end of turn").toBeGreaterThanOrEqual(0);
    expect(complete).toBeLessThan(returned);
    expect(s.log[returned]).not.toContain("Test Run");
    expect(s.cards["co-1"]?.zone).toBe("runner:stack");
    expect(s.runner.installed).not.toContain("co-1");
    expect(s.cards["tr-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });


  it("does not trash Ashen Epilogue after its last ability removes it from the game (CR 8.6.6a.ex1)", () => {
    let s = createInitialState();
    const ev = instantiateCard("ashen-epilogue", "ae-1", "runner:grip");
    s.cards["ae-1"] = ev;
    s.runner.hand = [...s.runner.hand, "ae-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "ae-1" });

    const removed = at(s.log, "Ashen Epilogue is removed from the game");
    const skipped = at(s.log, "Ashen Epilogue is not trashed");
    const complete = at(s.log, "Play effect complete");
    expect(removed).toBeLessThan(skipped);
    expect(skipped).toBeLessThan(complete);
    expect(s.log[skipped]).toContain(CR.playNoTrashLeftPlayArea.number);
    expect(s.cards["ae-1"]?.zone).toBe("removed-from-game");
    expect(s.runner.discardPile).not.toContain("ae-1");
    expect(s.checkpoints).toHaveLength(0);
  });


    it("cannot find an event with Artist Colony (CR 8.7.2b.ex1)", () => {
    let s = createInitialState();
    const colony = instantiateCard("artist-colony", "ac-1", "runner:installed");
    s.cards["ac-1"] = colony;
    s.runner.installed = ["ac-1"];
    const agenda = instantiateCard("hostile-takeover", "ag-1", "runner:score");
    agenda.faceup = true;
    agenda.agendaPoints = 2;
    s.cards["ag-1"] = agenda;
    s.runner.scoreArea = ["ag-1"];
    const event = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    s.cards["sg-1"] = event;
    s.runner.deck = ["sg-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    s.runner.credits = 0;

    s = must(s, {
      type: "use_paid_ability",
      cardId: "ac-1",
      abilityId: "artist-colony-search",
    });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.deck).toContain("sg-1");
    expect(s.runner.installed).not.toContain("sg-1");
    expect(s.runner.scoreArea).not.toContain("ag-1");
    expect(s.log.some((line) => line.includes("Artist Colony — no program/resource/hardware in stack."))).toBe(
      true,
    );
  });


  it("lets Self-modifying Code install Imp by trashing a grip card for Patchwork (CR 8.7.2b.ex2)", () => {
    const s = runnerTurn(createInitialState(), 0, 0);
    const smc = instantiateCard("self-modifying-code", "smc-1", "runner:heap");
    const patch = instantiateCard("patchwork", "pw-1", "runner:installed");
    const imp = instantiateCard("imp", "imp-1", "runner:stack");
    const grip = instantiateCard("sure-gamble", "grip-1", "runner:grip");
    s.cards["smc-1"] = smc;
    s.cards["pw-1"] = patch;
    s.cards["imp-1"] = imp;
    s.cards["grip-1"] = grip;
    s.runner.installed = ["pw-1"];
    s.runner.deck = ["imp-1"];
    s.runner.hand = ["grip-1"];
    const found = evalEffect(
      { state: s, sourceId: "smc-1" },
      fx.do({ kind: "search_stack_program_install" }),
    );
    if (!found.ok) throw new Error(found.error);
    expect(s.runner.installed).toContain("imp-1");
    expect(s.runner.discardPile).toContain("grip-1");
    expect(s.runner.credits).toBe(0);
    expect(s.turn.patchworkDiscountUsedThisTurn).toBe(true);

    const empty = runnerTurn(createInitialState(), 0, 0);
    const patch2 = instantiateCard("patchwork", "pw-2", "runner:installed");
    const imp2 = instantiateCard("imp", "imp-2", "runner:stack");
    empty.cards["pw-2"] = patch2;
    empty.cards["imp-2"] = imp2;
    empty.runner.installed = ["pw-2"];
    empty.runner.deck = ["imp-2"];
    empty.runner.hand = [];
    const missed = evalEffect(
      { state: empty, sourceId: "pw-2" },
      fx.do({ kind: "search_stack_program_install" }),
    );
    if (!missed.ok) throw new Error(missed.error);
    expect(empty.runner.installed).not.toContain("imp-2");
    expect(empty.runner.deck).toContain("imp-2");
  });


  it("installs Pharos from Tucana with 0 credits and reveals it (CR 8.7.2b.ex3)", () => {
    const s = createInitialState();
    const tucana = instantiateCard("tucana", "tucana-1", "server:remote-1:root");
    tucana.rezzed = true;
    const pharos = instantiateCard("pharos", "pharos-1", "corp:rd");
    pharos.faceup = false;
    s.cards["tucana-1"] = tucana;
    s.cards["pharos-1"] = pharos;
    s.servers["remote-1"] = {
      id: "remote-1" as ServerId,
      kind: "remote",
      ice: [],
      root: ["tucana-1"],
    };
    s.corp.deck = ["pharos-1"];
    s.corp.credits = 0;
    const found = evalEffect(
      { state: s, sourceId: "tucana-1" },
      fx.do({
        kind: "search_rd_install_rez_ice_on_source_server",
        totalDiscount: 3,
      }),
    );
    if (!found.ok) throw new Error(found.error);
    expect(s.servers["remote-1"]?.ice).toContain("pharos-1");
    expect(s.cards["pharos-1"]?.rezzed).toBe(false);
    expect(s.cards["pharos-1"]?.faceup).toBe(true);
    expect(s.corp.credits).toBe(0);
    expect(s.log.join("\n")).toContain("Reveal Pharos (CR 8.5.13d)");
  });


  it("shuffles R&D before Tech Startup installs and before Near-Earth Hub draws (CR 8.7.3.ex1)", () => {
    const s = createInitialState();
    const identity = instantiateCard(
      "near-earth-hub-broadcast-center",
      s.corp.identityId,
      "corp:identity",
    );
    const startup = instantiateCard("tech-startup", "ts-1", "server:remote-1:root");
    startup.rezzed = true;
    const asset = instantiateCard("pad-campaign", "pad-1", "corp:rd");
    asset.faceup = false;
    const next = instantiateCard("hedge-fund", "next-1", "corp:rd");
    next.faceup = false;
    s.cards[s.corp.identityId] = identity;
    s.cards["ts-1"] = startup;
    s.cards["pad-1"] = asset;
    s.cards["next-1"] = next;
    s.servers["remote-1"] = {
      id: "remote-1" as ServerId,
      kind: "remote",
      ice: [],
      root: ["ts-1"],
    };
    s.corp.deck = ["pad-1", "next-1"];
    s.nextRemoteNumber = 2;
    s.turn.remotesCreatedThisTurn = 0;
    const searching = evalEffect(
      { state: s, sourceId: "ts-1" },
      fx.do({ kind: "search_rd_asset_install" }),
    );
    if (!searching.ok) throw new Error(searching.error);
    const installed = must(s, { type: "choose_option", optionId: "tech-startup:pad-1" });
    const text = installed.log.join("\n");
    const shuffleAt = text.indexOf("shuffle R&D");
    const installAt = text.indexOf("install PAD Campaign");
    const drawAt = text.indexOf("Near-Earth Hub");
    expect(shuffleAt).toBeGreaterThanOrEqual(0);
    expect(shuffleAt).toBeLessThan(installAt);
    expect(installAt).toBeLessThan(drawAt);
    expect(installed.corp.hand).toContain("next-1");
    expect(installed.corp.deck).not.toContain("pad-1");
    expect(installed.servers["remote-2"]?.root).toContain("pad-1");
  });


  it("does not swap Hostile Takeover into PAD Campaign's server when Metamorph swaps non-ice (CR 8.8.2.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("metamorph", "meta-1", "server:hq:ice");
    const agenda = instantiateCard("hostile-takeover", "ht-1", "server:remote-1:root");
    const upgrade = instantiateCard(
      "corporate-troubleshooter",
      "ct-1",
      "server:remote-2:root",
    );
    const asset = instantiateCard("pad-campaign", "pad-1", "server:remote-2:root");
    s.cards["meta-1"] = ice;
    s.cards["ht-1"] = agenda;
    s.cards["ct-1"] = upgrade;
    s.cards["pad-1"] = asset;
    s.servers.hq.ice = ["meta-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    };
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["ct-1", "pad-1"],
    };

    const opened = evalEffect(
      { state: s, sourceId: "meta-1" },
      fx.do({ kind: "swap_2_other_ice_or_2_non_ice" }),
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "meta-nonice" });

    const refused = at(s.log, "that swap does nothing");
    expect(s.log[refused]).toContain(CR.swapOnlyToValidLocation.number);
    expect(s.log[refused]).not.toContain("Hostile Takeover");
    expect(s.log[refused]).not.toContain("PAD Campaign");
    expect(s.servers["remote-1"]?.root).toEqual(["ht-1"]);
    expect(s.servers["remote-2"]?.root).toEqual(["ct-1", "pad-1"]);
    expect(s.cards["ht-1"]?.zone).toBe("server:remote-1:root");
    expect(s.cards["ct-1"]?.zone).toBe("server:remote-2:root");
    expect(s.cards["pad-1"]?.zone).toBe("server:remote-2:root");
    expect(s.checkpoints).toHaveLength(0);
  });


    it("leaves Botulus hosted on Palisade when Thimblerig swaps with it (CR 8.8.3a.ex1)", () => {
    let s = createInitialState();
    remote(s, "remote-1", ["th-1"]);
    remote(s, "remote-2", ["pal-1"]);
    const thimble = instantiateCard("thimblerig", "th-1", "server:remote-1:ice");
    thimble.rezzed = true;
    thimble.faceup = true;
    const palisade = instantiateCard("palisade", "pal-1", "server:remote-2:ice");
    palisade.rezzed = true;
    palisade.faceup = true;
    s.cards["th-1"] = thimble;
    s.cards["pal-1"] = palisade;
    const bot = instantiateCard("botulus", "bot-1", "runner:grip");
    s.cards["bot-1"] = bot;
    s.runner.hand = ["bot-1"];
    runnerTurn(s, 1, 5);
    s = must(s, {
      type: "basic_install",
      cardId: "bot-1",
      destination: { kind: "host_ice", iceId: "pal-1" },
    });
    expect(s.cards["bot-1"]?.hostId).toBe("pal-1");

    s.activeSide = "corp";
    enterStep(s, "corp.turnBegins");
    autoWalk(s);
    expect(s.pendingChoice?.sourceId).toBe("th-1");
    const swapped = must(s, { type: "choose_option", optionId: "swap-ice:pal-1" });
    expect(swapped.servers["remote-1"]!.ice).toEqual(["pal-1"]);
    expect(swapped.servers["remote-2"]!.ice).toEqual(["th-1"]);
    expect(swapped.cards["bot-1"]?.hostId).toBe("pal-1");
    expect(swapped.cards["bot-1"]?.zone).toBe("runner:installed");
    expect(swapped.runner.installed).toContain("bot-1");
  });


  it("meets A Teia's install at the checkpoint after Tatu-Bola swaps, then gains 4 (CR 8.8.4b.ex1)", () => {
    let s = createInitialState();
    const teia = instantiateCard("a-teia-ip-recovery", "teia-1", "corp:identity");
    s.cards["teia-1"] = teia;
    s.corp.identityId = "teia-1";
    const tatu = instantiateCard("tatu-bola", "tb-1", "server:remote-1:ice");
    tatu.rezzed = true;
    tatu.faceup = true;
    const palisade = instantiateCard("palisade", "pal-1", "corp:hq");
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["tb-1"] = tatu;
    s.cards["pal-1"] = palisade;
    s.cards["pad-1"] = pad;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["tb-1"],
      root: [],
    };
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: [],
    };
    s.nextRemoteNumber = 3;
    s.corp.hand = ["pal-1", "pad-1"];
    s.corp.credits = 5;

    const opened = evalEffect(
      { state: s, sourceId: "tb-1" },
      s.cards["tb-1"]!.onPass!,
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "swap" });

    expect(s.servers["remote-1"]?.ice).toEqual(["pal-1"]);
    expect(s.cards["pal-1"]?.zone).toBe("server:remote-1:ice");
    expect(s.cards["pal-1"]?.rezzed).toBe(false);
    expect(s.corp.credits).toBe(9);
    expect(s.servers["remote-2"]).toBeUndefined();
    expect(s.log.join("\n")).toContain(
      `remote-2 ceased to exist (CR ${CR.checkpointRemoteServer.number}).`,
    );
    expect(s.log.join("\n")).toContain("no other remote");
    expect(s.log.join("\n")).toContain("Corp gains 4¢.");
    expect(s.pendingChoice).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });


});

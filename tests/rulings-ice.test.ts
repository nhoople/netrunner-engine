/**
 * Official rulings on ice (CR audit tool 1.14, second batch).
 *
 * Each it() names a card, states the ruling's answer in plain words, and
 * ends with the ruling number at the cards pin (vendor/cards-data/rulings/,
 * numbered in file order). tests/rulings.test.ts reads these titles. A
 * ruling the engine plays wrong is an it.skip naming the ruling and the CR
 * rule, filed under its area in the CR audit plan, not a fix here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  legalActions,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";
import {
  atRunnerAction,
  corpTurn,
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  paidAbility,
  pick,
  put,
  runnerTurn,
  setIdentity,
  stackRd,
  toHand,
  clearCorpHand,
  walkThrough,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

const SAM_SERVER = "remote-sam-1" as ServerId;

/**
 * A run on a remote holding Send a Message, protected by the unrezzed
 * `defId`, which the Runner passes. The Runner steals Send a Message and
 * the Corp uses it to rez the ice: a rez by a card ability during a run
 * against its server, not while the Runner approaches it.
 */
function rezBySendAMessage(
  defId: string,
  id: string,
  setup?: (s: GameState) => void,
): GameState {
  let s = runnerTurn(fresh(), 10);
  installRoot(s, "send-a-message", "sam-1", false);
  installIce(s, defId, id, SAM_SERVER, false);
  s.corp.credits = 0;
  setup?.(s);
  s = must(s, { type: "basic_run", serverId: SAM_SERVER });
  s = drive(s, (x) => legalActions(x).some((a) => a.type === "steal_agenda"));
  s = must(s, { type: "steal_agenda", cardId: "sam-1" });
  s = pick(s, id);
  expect(s.cards[id]!.rezzed).toBe(true);
  return s;
}

/** Walk on until `stop` (see `walkThrough`). */
function walk(s: GameState, stop = atRunnerAction): GameState {
  return walkThrough(s, stop).state;
}

// ---------------------------------------------------------------------------
// Rezzed by a card ability during a run: Anemone, Hákarl 1.0, Ping, Stavka,
// Wave
// ---------------------------------------------------------------------------

describe("Ice rezzed during a run by a card ability", () => {
  it("Anemone: rezzed by Send a Message during a run on its server, its rez ability still triggers (ruling 1)", () => {
    const s = rezBySendAMessage("anemone", "an-1", (x) =>
      toHand(x, "corp", "hedge-fund", "hq-1"),
    );
    expect(s.pendingChoice?.sourceId).toBe("an-1");
    expect(optionIds(s)).toContain("trash-hq-net");
  });

  it("Hákarl 1.0: rezzed by Send a Message during a run on its server, its rez ability still triggers (ruling 1)", () => {
    const s = rezBySendAMessage("hakarl-1-0", "hk-1", (x) =>
      installIce(x, "ice-wall", "iw-1", "hq"),
    );
    expect(s.pendingChoice?.sourceId).toBe("hk-1");
    expect(optionIds(s).some((id) => id.includes("iw-1"))).toBe(true);
  });

  it("Ping: rezzed by Send a Message during a run on its server, it gives the Runner a tag (ruling 1)", () => {
    let s = rezBySendAMessage("ping", "ping-1");
    s = walk(s);
    expect(s.runner.tags).toBe(1);
  });

  it("Stavka: rezzed by Send a Message during a run on its server, its rez ability still triggers (ruling 1)", () => {
    const s = rezBySendAMessage("stavka", "stv-1", (x) =>
      installRoot(x, "pad-campaign", "pad-1"),
    );
    expect(s.pendingChoice?.sourceId).toBe("stv-1");
    expect(optionIds(s).some((id) => id.includes("pad-1"))).toBe(true);
  });

  it("Wave: rezzed by Send a Message during a run on its server, its rez ability still triggers (ruling 1)", () => {
    const s = rezBySendAMessage("wave", "wave-1", (x) =>
      stackRd(x, [["ice-wall", "iw-rd"]]),
    );
    expect(s.pendingChoice?.sourceId).toBe("wave-1");
  });
});

// ---------------------------------------------------------------------------
// Archer
// ---------------------------------------------------------------------------

describe("Archer", () => {
  it('Archer: Send a Message\'s "ignoring all costs" covers the agenda forfeit too (ruling 1)', () => {
    const s = rezBySendAMessage("archer", "ar-1", (x) => {
      put(x, "hostile-takeover", "ag-1", "corp:score");
      x.corp.scoreArea.push("ag-1");
    });
    expect(s.corp.scoreArea).toContain("ag-1");
    expect(s.corp.credits).toBe(0);
  });

  it("Archer: forfeiting Braintrust with 1 agenda counter still lowers the rez cost, so Archer costs 3 (ruling 2)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "archer", "ar-1", "hq", false);
    put(s, "braintrust", "bt-1", "corp:score");
    s.corp.scoreArea.push("bt-1");
    s.cards["bt-1"]!.agendaCounters = 1;
    s.corp.credits = 5;
    s = must(s, { type: "basic_run", serverId: "hq" });
    const passed = applyAction(s, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    s = passed.ok ? passed.state : s;
    s = must(s, { type: "rez_ice", cardId: "ar-1" });
    if (s.pendingChoice) s = pick(s, "bt-1");
    expect(s.cards["ar-1"]!.rezzed).toBe(true);
    expect(s.corp.scoreArea).not.toContain("bt-1");
    expect(s.corp.credits).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ballista
// ---------------------------------------------------------------------------

describe("Ballista", () => {
  it("Ballista: the Corp chooses whether to trash a program or end the run (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ballista", "bal-1", "hq");
    installRunner(s, "corroder", "cor-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, () => false);
    expect(s.pendingChoice?.sourceId).toBe("bal-1");
    expect(s.pendingChoice?.chooser).toBe("corp");
  });
});

// ---------------------------------------------------------------------------
// Echo
// ---------------------------------------------------------------------------

describe("Echo", () => {
  it("Echo: rezzing Echo places a power counter on it from its own ability (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "echo", "echo-1", "hq", false);
    s.corp.credits = 5;
    s = must(s, { type: "basic_run", serverId: "hq" });
    const passed = applyAction(s, { type: "pass_window" });
    s = passed.ok ? passed.state : s;
    s = must(s, { type: "rez_ice", cardId: "echo-1" });
    expect(s.cards["echo-1"]!.powerCounters).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Envelopment
// ---------------------------------------------------------------------------

describe("Envelopment", () => {
  it("Envelopment: after it trashes itself mid-encounter, ice Ob Superheavy installs on the server is outward from the Runner (ruling 1)", () => {
    let s = runnerTurn(fresh());
    setIdentity(s, "corp", "ob-superheavy-logistics-extract-export-excel");
    s.servers.hq.ice = [];
    installIce(s, "envelopment", "env-1", "hq").powerCounters = 0;
    stackRd(s, [["border-control", "bc-1"]]);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => !!x.pendingChoice);
    s = pick(s, "bc-1");
    s = pick(s, "install-dest:hq");
    const start = s.log.length;
    s = walk(s);
    const log = s.log.slice(start).join("\n");
    expect(log).not.toMatch(/Approach ice Border Control/);
    expect(log).toMatch(/Run successful/);
  });
});

// ---------------------------------------------------------------------------
// Pharos
// ---------------------------------------------------------------------------

describe("Pharos", () => {
  // Filed under area 12, fix-now candidate: Pharos's card data has no
  // `canAdvance` declaration (the other 14 "You can advance this ice" cards
  // do), so it can never be advanced, rezzed or not (CR 1.18.3).
  it.skip("Pharos: the Corp can advance it while it is unrezzed (ruling 1; filed, area 12, CR 1.18.3: Pharos cannot be advanced at all)", () => {
    let s = corpTurn(fresh(), 5);
    installIce(s, "pharos", "ph-1", "hq", false);
    expect(legalActions(s)).toContainEqual({ type: "advance", cardId: "ph-1" });
    s = must(s, { type: "advance", cardId: "ph-1" });
    expect(s.cards["ph-1"]!.advancementCounters).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Whitespace
// ---------------------------------------------------------------------------

describe("Whitespace", () => {
  function whitespace(credits: number, overclock = false): GameState {
    let s = runnerTurn(fresh(), credits);
    s.servers.hq.ice = [];
    installIce(s, "whitespace", "ws-1", "hq");
    if (overclock) {
      toHand(s, "runner", "overclock", "oc-1");
      s = must(s, { type: "play_event", cardId: "oc-1", serverId: "hq" });
    } else {
      s = must(s, { type: "basic_run", serverId: "hq" });
    }
    return walk(s);
  }

  it("Whitespace: the second subroutine checks the Runner's credits after the first takes 3 (ruling 1)", () => {
    // 9 credits: 6 left after the first subroutine, so the run ends.
    const s = whitespace(9);
    expect(s.runner.credits).toBe(6);
    expect(s.log.join("\n")).toMatch(/End the run \(CR 6\.1\.4\)/);
    // 10 credits: 7 left, so the run goes on.
    const t = whitespace(10);
    expect(t.runner.credits).toBe(7);
    expect(t.log.join("\n")).toMatch(/Run successful/);
  });

  it("Whitespace: the 3 credits are lost from the credit pool, never from Overclock (ruling 2)", () => {
    // Overclock costs 1: 10 - 1 - 3 = 6 in the pool.
    const s = whitespace(10, true);
    expect(s.runner.credits).toBe(6);
  });

  it("Whitespace: Overclock's hosted credits are not credits the Runner has, so the run ends at 6 in the pool (ruling 3)", () => {
    const s = whitespace(10, true);
    expect(s.log.join("\n")).toMatch(/End the run \(CR 6\.1\.4\)/);
  });
});

// ---------------------------------------------------------------------------
// Tollbooth, Funhouse
// ---------------------------------------------------------------------------

describe("Tollbooth", () => {
  function tollbooth(credits: number): GameState {
    let s = runnerTurn(fresh(), credits);
    s.servers.hq.ice = [];
    installIce(s, "tollbooth", "tb-1", "hq");
    s = must(s, { type: "basic_run", serverId: "hq" });
    return drive(
      s,
      (x) => !!x.pendingChoice || !x.run || x.run.encounter?.iceId === "tb-1",
    );
  }

  it("Tollbooth: a Runner who cannot pay 3 pays nothing and the run ends (ruling 1)", () => {
    let s = tollbooth(2);
    s = walk(s);
    expect(s.runner.credits).toBe(2);
    expect(s.log.join("\n")).toMatch(/End the run/);
    expect(s.log.join("\n")).not.toMatch(/Run successful/);
  });

  it("Tollbooth: a Runner who can pay 3 must pay it (ruling 2)", () => {
    const s = tollbooth(5);
    // No choice to decline: the toll is paid as the encounter begins.
    const ids = optionIds(s);
    expect(ids.some((id) => /decline|refuse|etr|end/i.test(id))).toBe(false);
    const t = walk(
      s,
      (x) => x.run?.encounter?.iceId === "tb-1" || atRunnerAction(x),
    );
    expect(t.runner.credits).toBe(2);
  });

  it("Tollbooth: bypassed by Inside Job, its toll never resolves (ruling 3)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "tollbooth", "tb-1", "hq");
    toHand(s, "runner", "inside-job", "ij-1");
    s = must(s, { type: "play_event", cardId: "ij-1", serverId: "hq" });
    s = walk(s);
    expect(s.runner.credits).toBe(8);
    expect(s.log.join("\n")).toMatch(/Run successful/);
  });
});

describe("Funhouse", () => {
  function funhouse(setup?: (s: GameState) => void): GameState {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "funhouse", "fh-1", "hq");
    setup?.(s);
    s = must(s, { type: "basic_run", serverId: "hq" });
    return drive(s, (x) => !!x.pendingChoice);
  }

  // Filed under area 11: after Decoy prevents the tag taken for Funhouse's
  // "unless", the engine resolves Funhouse's encounter ability again and the
  // Runner takes a second tag instead of the run ending. A prevented cost
  // is not paid, so the instruction resolves (CR 1.16.11b).
  it.skip("Funhouse: taking the tag is a cost; a Runner who takes it and prevents it has not paid, so the run ends (ruling 1; filed, area 11, CR 1.16.11b: the encounter ability resolves again)", () => {
    let s = funhouse((x) => installRunner(x, "decoy", "decoy-1"));
    expect(s.pendingChoice?.sourceId).toBe("fh-1");
    s = pick(s, "unless-pay");
    s = must(s, paidAbility(s, "decoy-1")!);
    const start = s.log.length;
    s = walk(s);
    expect(s.runner.tags).toBe(0);
    expect(s.log.slice(start).join("\n")).toMatch(/End the run/);
    expect(s.log.slice(start).join("\n")).not.toMatch(/Encounter Funhouse/);
  });

  it("Funhouse: with Jesminder Sareen's prevention, the Runner cannot take the tag and the run ends (ruling 2)", () => {
    let s = runnerTurn(fresh(), 10);
    setIdentity(s, "runner", "jesminder-sareen-girl-behind-the-curtain");
    s.servers.hq.ice = [];
    installIce(s, "funhouse", "fh-1", "hq");
    s = must(s, { type: "basic_run", serverId: "hq" });
    const start = s.log.length;
    s = drive(s, (x) => !!x.pendingChoice || !x.run);
    // The Runner is never offered the tag: the cost would be prevented.
    const log = s.log.slice(start).join("\n");
    expect(log).toMatch(/Cannot take 1 tag\(s\) as nested cost/);
    expect(log).toMatch(/End the run \(CR 6\.1\.4\)/);
    expect(s.runner.tags).toBe(0);
  });

  it("Funhouse: bypassed by Inside Job, its encounter ability never resolves (ruling 3)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "funhouse", "fh-1", "hq");
    toHand(s, "runner", "inside-job", "ij-1");
    s = must(s, { type: "play_event", cardId: "ij-1", serverId: "hq" });
    s = walk(s);
    expect(s.runner.tags).toBe(0);
    expect(s.log.join("\n")).toMatch(/Run successful/);
  });
});

// ---------------------------------------------------------------------------
// Ansel 1.0, Brân 1.0
// ---------------------------------------------------------------------------

describe("Ansel 1.0", () => {
  /** A run on HQ, at Ansel's second subroutine installing Ice Wall. */
  function anselInstall(): GameState {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-in", "hq", false);
    installIce(s, "ansel-1-0", "ansel-1", "hq");
    clearCorpHand(s);
    toHand(s, "corp", "ice-wall", "iw-new");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => optionIds(x).some((id) => id.includes("iw-new")));
    s = pick(s, "iw-new");
    return s;
  }

  it("Ansel 1.0: trashed while installing ice with its second subroutine, the encounter ends and its third subroutine does not resolve (ruling 1)", () => {
    let s = anselInstall();
    // Install on HQ, trashing ice there: Ansel itself.
    s = pick(s, "install-dest-trash:hq");
    while (optionIds(s).some((id) => id.includes("ansel-1"))) {
      s = pick(s, "ansel-1");
    }
    while (s.pendingChoice) {
      const done = optionIds(s).find((id) => /done|confirm|keep/i.test(id));
      s = must(s, {
        type: "choose_option",
        optionId: done ?? optionIds(s)[0]!,
      });
    }
    expect(s.corp.discardPile).toContain("ansel-1");
    expect(s.run?.encounter?.iceId).not.toBe("ansel-1");
    expect(s.run?.cannotStealOrTrash ?? false).toBe(false);
    expect(s.log.join("\n")).not.toMatch(/cannot steal or trash/i);
  });

  it("Ansel 1.0: ice installed with its second subroutine goes outermost, outward from the Runner, who never approaches it (ruling 2)", () => {
    let s = anselInstall();
    s = pick(s, "install-dest:hq");
    while (s.pendingChoice) {
      const done = optionIds(s).find((id) => /done|confirm|keep/i.test(id));
      s = must(s, {
        type: "choose_option",
        optionId: done ?? optionIds(s)[0]!,
      });
    }
    expect(s.servers.hq.ice[0]).toBe("iw-new");
    const start = s.log.length;
    s = walk(s);
    expect(s.log.slice(start).join("\n")).not.toMatch(
      /Approach ice Ice Wall at position 0/,
    );
  });

  // Filed under area 8: after "The Runner cannot steal or trash Corp cards
  // for the remainder of this run", the basic trash is withheld but
  // Carnivore's `access_trash_from_grip` is still offered. "Cannot" wins
  // over any way of trashing (CR 1.2.2).
  it.skip("Ansel 1.0: after its third subroutine resolves, the Runner cannot trash an accessed card with Carnivore either (ruling 3; filed, area 8, CR 1.2.2: Carnivore's trash is still offered)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ansel-1-0", "ansel-1", "hq");
    installRunner(s, "carnivore", "carn-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    toHand(s, "runner", "diesel", "g-2");
    clearCorpHand(s);
    toHand(s, "corp", "pad-campaign", "pad-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    // The Runner loses a click to break "Trash 1 installed Runner card";
    // the other two resolve, and the Corp installs nothing.
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 0 });
    s = drive(s, (x) => optionIds(x).includes("choose-cards-done"));
    s = pick(s, "choose-cards-done");
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "access_card" && a.cardId === "pad-1",
      ),
    );
    s = must(s, { type: "access_card", cardId: "pad-1" });
    expect(s.runner.installed).toContain("carn-1");
    expect(s.run?.accessingCardId).toBe("pad-1");
    const types = legalActions(s).map((a) => a.type);
    expect(types).not.toContain("access_trash_from_grip");
    expect(types).not.toContain("trash_accessed");
  });
});

describe("Brân 1.0", () => {
  /** A run on HQ to Brân, the Runner breaking `breaks` by losing clicks. */
  function bran(breaks: number[]): GameState {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "bran-1-0", "bran-1", "hq");
    clearCorpHand(s);
    toHand(s, "corp", "ice-wall", "iw-new");
    s.corp.credits = 1;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    for (const subIndex of breaks) {
      s = must(s, { type: "break_bioroid_subroutine", subIndex });
    }
    return drive(s, (x) => optionIds(x).includes("bran:iw-new"));
  }

  // Filed under area 5: Brân's install offers only "decline" or the ice to
  // install inward; the Corp is never offered to trash ice protecting the
  // server, Brân included, as installing ice allows (CR 8.5.7).
  it.skip("Brân 1.0: the Corp may trash Brân while installing; the encounter ends and the Runner's next position is the new ice (ruling 1; filed, area 5, CR 8.5.7: no trash is offered during the install)", () => {
    let s = bran([]);
    s = pick(s, "bran:iw-new");
    expect(optionIds(s).some((id) => id.includes("bran-1"))).toBe(true);
    s = pick(s, "bran-1");
    expect(s.corp.discardPile).toContain("bran-1");
    expect(s.servers.hq.ice).toEqual(["iw-new"]);
    const start = s.log.length;
    s = walk(s, (x) => x.run?.phase === "approach_ice" || atRunnerAction(x));
    expect(s.log.slice(start).join("\n")).toMatch(/Approach ice Ice Wall/);
  });

  it("Brân 1.0: ice it installs ignoring costs is unrezzed, and rezzing it when approached costs its rez cost (ruling 2)", () => {
    // The Runner breaks both "End the run." subroutines by losing clicks.
    let s = bran([1, 2]);
    s = pick(s, "bran:iw-new");
    expect(s.servers.hq.ice).toEqual(["bran-1", "iw-new"]);
    expect(s.cards["iw-new"]!.rezzed).toBe(false);
    expect(s.corp.credits).toBe(1);
    s = drive(
      s,
      (x) =>
        legalActions(x).some(
          (a) => a.type === "rez_ice" && a.cardId === "iw-new",
        ) || atRunnerAction(x),
    );
    s = must(s, { type: "rez_ice", cardId: "iw-new" });
    expect(s.cards["iw-new"]!.rezzed).toBe(true);
    expect(s.corp.credits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Diviner
// ---------------------------------------------------------------------------

describe("Diviner", () => {
  // Filed under area 9, fix-now candidate: Diviner's subroutine is modelled
  // as "if grip count odd, end the run" (`op:grip_count_odd`), so it reads
  // how many cards are left in the grip, not the printed cost of the card
  // the net damage trashed. Each test below picks a grip where the two
  // differ (CR 1.2.1).

  /** Diviner's subroutine with `n` copies of `gripDef` in the grip. */
  function diviner(gripDef: string, n: number): GameState {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "diviner", "div-1", "hq");
    for (let i = 1; i <= n; i++) toHand(s, "runner", gripDef, `g-${i}`);
    s = must(s, { type: "basic_run", serverId: "hq" });
    return walk(s);
  }

  it.skip("Diviner: a trashed card with play or install cost 0 does not end the run (ruling 1; filed, area 9, CR 1.2.1: it checks the grip count, not the trashed card)", () => {
    // 1 card left in the grip (odd), but Diesel costs 0.
    const s = diviner("diesel", 2);
    expect(s.runner.discardPile).toHaveLength(1);
    expect(s.log.join("\n")).toMatch(/Run successful/);
  });

  it.skip("Diviner: a trashed card with an X cost counts as 0, so it does not end the run (ruling 2; filed, area 9, CR 1.2.1: it checks the grip count, not the trashed card)", () => {
    const s = diviner("angel-arena", 2);
    expect(s.runner.discardPile).toHaveLength(1);
    expect(s.log.join("\n")).toMatch(/Run successful/);
  });

  it.skip("Diviner: it checks the cost of the card the net damage trashed from the grip, not HQ (ruling 3; filed, area 9, CR 1.2.1: it checks the grip count, not the trashed card)", () => {
    // 2 cards left in the grip (even), but Sure Gamble costs 5: odd.
    const s = diviner("sure-gamble", 3);
    expect(s.runner.discardPile).toHaveLength(1);
    expect(s.log.join("\n")).toMatch(/End the run \(CR 6\.1\.4\)/);
  });
});

// ---------------------------------------------------------------------------
// Ivik
// ---------------------------------------------------------------------------

describe("Ivik", () => {
  it("Ivik: made a code gate by Tinkering, it does not lower its own rez cost, since it is not yet rezzed (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ivik", "iv-1", "hq", false);
    toHand(s, "runner", "tinkering", "tk-1");
    s = must(s, { type: "play_event", cardId: "tk-1" });
    s = pick(s, "tinker:iv-1");
    s = drive(s, atRunnerAction);
    expect(
      s.lingeringEffects.some(
        (e) =>
          !e.expired &&
          JSON.stringify(e.payload ?? {}).includes('"iv-1"') &&
          JSON.stringify(e.payload ?? {}).includes("code gate"),
      ),
    ).toBe(true);
    s.corp.credits = 7;
    s = must(s, { type: "basic_run", serverId: "hq" });
    const passed = applyAction(s, { type: "pass_window" });
    s = passed.ok ? passed.state : s;
    s = must(s, { type: "rez_ice", cardId: "iv-1" });
    expect(s.cards["iv-1"]!.rezzed).toBe(true);
    expect(s.corp.credits).toBe(0);

    // Control: another rezzed code gate does lower the cost to 6.
    let c = runnerTurn(fresh(), 10);
    c.servers.hq.ice = [];
    installIce(c, "ivik", "iv-1", "hq", false);
    installIce(c, "enigma", "en-1", "rd");
    c.corp.credits = 7;
    c = must(c, { type: "basic_run", serverId: "hq" });
    const p = applyAction(c, { type: "pass_window" });
    c = p.ok ? p.state : c;
    c = must(c, { type: "rez_ice", cardId: "iv-1" });
    expect(c.corp.credits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Karunā
// ---------------------------------------------------------------------------

describe("Karunā", () => {
  // Filed under area 14: taking Karunā's "the Runner may jack out" during
  // the breach logs "Jack out has no effect — the run is already
  // successful", and the breach goes on. Jacking out ends the run, and with
  // it the breach, whenever an ability allows it (CR 6.1.5, 6.1.4).
  it.skip("Karunā: met through Ganked! mid-breach, the Runner may jack out, which ends the breach (ruling 1; filed, area 14, CR 6.1.5: the jack out has no effect after success)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.rd.ice = [];
    installIce(s, "karuna", "kar-1", "rd", false);
    put(s, "ganked", "gk-1", "server:rd:root");
    s.servers.rd.root.push("gk-1");
    for (let i = 1; i <= 5; i++) toHand(s, "runner", "sure-gamble", `g-${i}`);
    s = must(s, { type: "basic_run", serverId: "rd" });
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "access_card" && a.cardId === "gk-1",
      ),
    );
    // Rezzed after the Runner passed it, so Ganked! can choose it.
    s.cards["kar-1"]!.rezzed = true;
    s.cards["kar-1"]!.faceup = true;
    s = must(s, { type: "access_card", cardId: "gk-1" });
    s = pick(s, "trash-encounter");
    s = drive(s, (x) => optionIds(x).some((id) => /jack/i.test(id)));
    const jack = optionIds(s).find(
      (id) => /jack/i.test(id) && !/decline|no/i.test(id),
    )!;
    s = must(s, { type: "choose_option", optionId: jack });
    s = walk(s);
    // The run ended: the top card of R&D was never accessed.
    expect(s.log.join("\n")).not.toMatch(/Accessed corp-asset-1/);
  });
});

// ---------------------------------------------------------------------------
// Meridian
// ---------------------------------------------------------------------------

describe("Meridian", () => {
  it("Meridian: when the Runner adds it to their score area, the Corp gains nothing and the run goes on (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "meridian", "mer-1", "hq");
    s.corp.credits = 0;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => !!x.pendingChoice);
    expect(s.pendingChoice?.chooser).toBe("runner");
    s = pick(s, "take-neg1");
    expect(s.runner.scoreArea).toContain("mer-1");
    expect(s.corp.credits).toBe(0);
    s = walk(s);
    expect(s.log.join("\n")).toMatch(/Run successful/);
  });

  it("Meridian: Loki copying its subroutine offers the Runner to add Loki to their score area (ruling 2)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "loki", "loki-1", "hq");
    installIce(s, "meridian", "mer-1", "rd");
    s.corp.credits = 0;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => !!x.pendingChoice);
    if (optionIds(s).some((id) => id.includes("mer-1"))) s = pick(s, "mer-1");
    s = drive(s, (x) => optionIds(x).includes("take-neg1"));
    s = pick(s, "take-neg1");
    expect(s.runner.scoreArea).toContain("loki-1");
    expect(s.runner.scoreArea).not.toContain("mer-1");
  });
});

// ---------------------------------------------------------------------------
// Mestnichestvo
// ---------------------------------------------------------------------------

describe("Mestnichestvo", () => {
  /**
   * An encounter with Mestnichestvo (1 advancement counter) under Builder
   * of Nations. The Corp removes the counter or not; the Runner breaks
   * both subroutines with Gordian Blade and passes it.
   */
  function mest(remove: boolean): GameState {
    let s = runnerTurn(fresh(), 10);
    setIdentity(s, "corp", "weyland-consortium-builder-of-nations");
    s.servers.hq.ice = [];
    installIce(s, "mestnichestvo", "mest-1", "hq").advancementCounters = 1;
    installRunner(s, "gordian-blade", "gb-1");
    for (let i = 1; i <= 3; i++) toHand(s, "runner", "sure-gamble", `g-${i}`);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => !!x.pendingChoice);
    s = pick(s, remove ? "remove-adv" : "decline");
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    for (let i = 0; i < 10; i++) {
      const legal = legalActions(s);
      const brk = legal.find((a) => a.type === "break_subroutine");
      const pump = legal.find(
        (a) => a.type === "use_paid_ability" && a.cardId === "gb-1",
      );
      if (!brk && !pump) break;
      s = must(s, brk ?? pump!);
    }
    return walk(s);
  }

  it("Mestnichestvo: its last counter spent, it is not advanced when the encounter ends, so Builder of Nations does no damage (ruling 1)", () => {
    const s = mest(true);
    expect(s.cards["mest-1"]!.advancementCounters ?? 0).toBe(0);
    expect(s.log.join("\n")).toMatch(/Run successful/);
    expect(s.runner.hand).toHaveLength(3);
    // Control: keeping the counter, the encounter ends with it advanced.
    const c = mest(false);
    expect(c.log.join("\n")).toMatch(/Run successful/);
    expect(c.runner.hand).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Ravana 1.0
// ---------------------------------------------------------------------------

describe("Ravana 1.0", () => {
  // Filed under area 11, fix-now candidate: the subroutine resolves the
  // other Ravana's subroutine, which resolves this one's, with no end, and
  // the engine overflows the call stack. A mandatory loop resolves the
  // number of times its player chooses (CR 10.1.6a).
  it.skip("Ravana 1.0: with only Ravanas as rezzed bioroids, its subroutine loops to no effect (ruling 1; filed, area 11, CR 10.1.6a: the loop overflows the call stack)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ravana-1-0", "rav-1", "hq");
    installIce(s, "ravana-1-0", "rav-2", "rd");
    const credits = s.runner.credits;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = walk(s);
    expect(s.runner.credits).toBe(credits);
    expect(s.runner.tags).toBe(0);
    expect(s.log.join("\n")).toMatch(/Run successful/);
  });
});

// ---------------------------------------------------------------------------
// Found while testing the rulings above (not a ruling)
// ---------------------------------------------------------------------------

describe("Funhouse (after its encounter ability ends the run)", () => {
  // Filed under area 11: when the Runner cannot take the tag (Jesminder
  // Sareen), the engine ends the run and then still resolves Funhouse's
  // subroutine, so the Runner is asked to pay 4 or take a tag after the
  // run ended. Declining the tag by choice does not do this. Ending the run
  // ends the encounter, so no subroutine resolves (CR 6.1.4).
  it.skip("no subroutine resolves after Funhouse's encounter ability ends the run because the tag cannot be taken (CR 6.1.4)", () => {
    let s = runnerTurn(fresh(), 10);
    setIdentity(s, "runner", "jesminder-sareen-girl-behind-the-curtain");
    s.servers.hq.ice = [];
    installIce(s, "funhouse", "fh-1", "hq");
    s = must(s, { type: "basic_run", serverId: "hq" });
    const start = s.log.length;
    s = walk(s);
    expect(s.log.slice(start).join("\n")).not.toMatch(/Resolve subroutine/);
    expect(s.runner.credits).toBe(10);
  });
});

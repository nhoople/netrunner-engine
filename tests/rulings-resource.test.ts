/**
 * Official rulings on resources (CR audit tool 1.14, third batch).
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
import { currentMark, placeMark } from "../src/state/msKeywords.js";
import { trashCard } from "../src/state/hostingAndTrash/trash.js";
import { RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE } from "../src/state/fenris.js";
import {
  atRunnerAction,
  clearCorpHand,
  clearRd,
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
  toRunnerTurn,
  setIdentity,
  stackRd,
  toCorpTurn,
  toHand,
  walkThrough,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/** Walk on to the Runner's next action (see `walkThrough`). */
function walk(s: GameState, stop = atRunnerAction): GameState {
  return walkThrough(s, stop).state;
}

// ---------------------------------------------------------------------------
// Avgustina Ivanovskaya
// ---------------------------------------------------------------------------

describe("Avgustina Ivanovskaya", () => {
  it("Avgustina Ivanovskaya: the Corp trashes the sabotaged card, so Demolisher gains the Runner nothing (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    clearCorpHand(s);
    toHand(s, "corp", "hedge-fund", "hq-1");
    stackRd(s, [["hedge-fund", "rd-1"]]);
    installRunner(s, "avgustina-ivanovskaya", "av-1");
    installRunner(s, "demolisher", "demo-1");
    toHand(s, "runner", "imp", "imp-1");
    s = must(s, {
      type: "basic_install",
      cardId: "imp-1",
      destination: { kind: "installed" },
    });
    const credits = s.runner.credits;
    expect(s.pendingSabotage).toBeTruthy();
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1"] });
    s = drive(s, atRunnerAction);
    expect(s.corp.discardPile).toContain("hq-1");
    expect(s.runner.credits).toBe(credits);
  });
});

// ---------------------------------------------------------------------------
// Backstitching
// ---------------------------------------------------------------------------

describe("Backstitching", () => {
  it("Backstitching: the mark it identifies stays the Runner's mark after Backstitching leaves play (ruling 1)", () => {
    let s = fresh();
    installRunner(s, "backstitching", "bs-1");
    s = toRunnerTurn(s);
    const mark = currentMark(s);
    expect(mark).not.toBeNull();
    trashCard(s, "bs-1", { by: "runner" });
    expect(s.runner.discardPile).toContain("bs-1");
    expect(currentMark(s)).toBe(mark);
  });

  it("Backstitching: installed with no mark, it gives the Runner no mark for the current turn (ruling 2)", () => {
    let s = runnerTurn(fresh(), 10);
    toHand(s, "runner", "backstitching", "bs-1");
    s = must(s, {
      type: "basic_install",
      cardId: "bs-1",
      destination: { kind: "installed" },
    });
    expect(s.runner.installed).toContain("bs-1");
    expect(currentMark(s)).toBeNull();
  });

  it("Backstitching: with two mark cards, the first instruction picks the mark and the second changes nothing (ruling 3)", () => {
    let s = fresh();
    installRunner(s, "backstitching", "bs-1");
    installRunner(s, "backstitching", "bs-2");
    const start = s.log.length;
    s = toRunnerTurn(s);
    expect(currentMark(s)).not.toBeNull();
    const log = s.log.slice(start).join("\n");
    expect(log).toMatch(/already/);
  });

  // Filed under area 11 with Pinhole Threading ruling 4: Konjin's forced
  // encounter goes through an approach of the chosen ice, so the run's
  // position points at Konjin while the Runner encounters the other ice
  // (ENCOUNTER_ICE_MISMATCH). Backstitching's bypass is offered there.
  it.skip("Backstitching: a forced encounter from Konjin during a run on the mark is still during a run on the mark, so it can bypass (ruling 4; filed, area 11, CR 6.5.9a: the forced encounter goes through an approach)", () => {
    let s = fresh();
    installRunner(s, "backstitching", "bs-1");
    s = toRunnerTurn(s);
    const mark = currentMark(s)!;
    const other: ServerId = mark === "hq" ? "rd" : "hq";
    s.servers[mark].ice = [];
    s.servers[other].ice = [];
    installIce(s, "konjin", "kj-1", mark);
    installIce(s, "ice-wall", "iw-1", other);
    s.corp.credits = 10;
    s = must(s, { type: "basic_run", serverId: mark });
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "psi_runner_bid"),
    );
    s = must(s, { type: "psi_runner_bid", amount: 0 });
    s = must(s, { type: "psi_corp_bid", amount: 1 });
    s = pick(s, "iw-1");
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    expect(s.run?.encounter?.iceId).toBe("iw-1");
    expect(s.run?.attackedServerId).toBe(mark);
    expect(paidAbility(s, "bs-1")).toBeDefined();
    s = must(s, paidAbility(s, "bs-1")!);
    expect(s.runner.discardPile).toContain("bs-1");
  });
});

// ---------------------------------------------------------------------------
// Cookbook
// ---------------------------------------------------------------------------

describe("Cookbook", () => {
  /** Install Tranquilizer on a rezzed Ice Wall with Cookbook and Hivemind. */
  function tranquilize(first: string): GameState {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-1", "hq");
    installRunner(s, "cookbook", "cb-1");
    installRunner(s, "hivemind", "hm-1").virusCounters = 1;
    toHand(s, "runner", "tranquilizer", "tq-1");
    s = must(s, {
      type: "basic_install",
      cardId: "tq-1",
      destination: { kind: "host_ice", iceId: "iw-1" },
    });
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      const ids = optionIds(s);
      s = must(s, {
        type: "choose_option",
        optionId:
          ids.find((id) => id.includes(first)) ??
          ids.find((id) => !/decline|skip|no$/.test(id)) ??
          ids[0]!,
      });
    }
    return drive(s, atRunnerAction);
  }

  // Filed under area 11: Tranquilizer's install ability resolves on its
  // own (1 counter plus Hivemind's, so no derez) and only then does
  // Cookbook become pending. The Runner is never offered the order, so
  // cannot have Cookbook's counter first and derez the ice (CR 9.2.8d).
  it.skip("Cookbook: resolving Cookbook before Tranquilizer derezzes the host ice at once; Tranquilizer first leaves it rezzed (ruling 1; filed, area 11, CR 9.2.8d: Tranquilizer always resolves first, with no order offered)", () => {
    expect(tranquilize("tq-1").cards["iw-1"]!.rezzed).toBe(true);
    expect(tranquilize("cb-1").cards["iw-1"]!.rezzed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// District 99
// ---------------------------------------------------------------------------

describe("District 99", () => {
  it("District 99: a program trashed from the grip by net damage is the first program trashed that turn, so it may gain a power counter (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "data-mine", "dm-1", "hq");
    installRunner(s, "district-99", "d99-1");
    toHand(s, "runner", "corroder", "cor-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, () => false);
    expect(s.pendingChoice?.sourceId).toBe("d99-1");
    expect(s.runner.discardPile).toContain("cor-1");
    s = pick(s, "place-power");
    expect(s.cards["d99-1"]!.powerCounters).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DJ Fenris
// ---------------------------------------------------------------------------

describe("DJ Fenris", () => {
  // A facedown installed Runner card's abilities are not active (CR 8.1.4a),
  // so Fenris offers no Quetzal break. Fixed in RF-2 (`active.ts`).
  it("DJ Fenris: turned facedown by Apocalypse it keeps the hosted identity, which has no effect until Fenris is faceup again (ruling 1; CR 8.1.4a)", () => {
    let s = runnerTurn(fresh(), 10);
    clearCorpHand(s);
    clearRd(s);
    stackRd(s, [["hedge-fund", "rd-1"]]);
    put(
      s,
      "quetzal-free-spirit",
      "qz-1",
      RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
    ).rezzed = false;
    s.runner.additionalIdentities = ["qz-1"];
    toHand(s, "runner", "dj-fenris", "df-1");
    s = must(s, {
      type: "basic_install",
      cardId: "df-1",
      destination: { kind: "installed" },
    });
    if (s.pendingChoice) s = pick(s, "qz-1");
    s = drive(s, atRunnerAction);
    expect(s.cards["df-1"]!.hostedCardIds).toContain("qz-1");
    for (const server of ["hq", "rd", "archives"] as const) {
      s.servers[server].ice = [];
      s.runner.clicks = 2;
      s = must(s, { type: "basic_run", serverId: server });
      s = walk(s);
    }
    toHand(s, "runner", "apocalypse", "apoc-1");
    s.runner.clicks = 2;
    s = must(s, { type: "play_event", cardId: "apoc-1" });
    s = drive(s, atRunnerAction);
    expect(s.cards["df-1"]!.faceup).toBe(false);
    expect(s.cards["df-1"]!.hostedCardIds).toContain("qz-1");
    // A barrier to encounter: facedown Fenris has no Quetzal break.
    installIce(s, "ice-wall", "iw-1", "hq");
    s.runner.clicks = 1;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    expect(paidAbility(s, "df-1")).toBeUndefined();
    // Turned faceup again, it has the hosted identity's text again.
    s.cards["df-1"]!.faceup = true;
    expect(paidAbility(s, "df-1")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Ice Carver
// ---------------------------------------------------------------------------

describe("Ice Carver", () => {
  function chisel(carver: boolean): GameState {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-1", "hq");
    if (carver) installRunner(s, "ice-carver", "ic-1");
    toHand(s, "runner", "chisel", "ch-1");
    s = must(s, {
      type: "basic_install",
      cardId: "ch-1",
      destination: { kind: "host_ice", iceId: "iw-1" },
    });
    s = drive(s, atRunnerAction);
    expect(s.cards["ch-1"]!.virusCounters ?? 0).toBe(0);
    s = must(s, { type: "basic_run", serverId: "hq" });
    return drive(
      s,
      (x) =>
        !x.servers.hq.ice.includes("iw-1") ||
        (x.cards["ch-1"]?.virusCounters ?? 0) > 0,
    );
  }

  it("Ice Carver: its -1 strength applies as the encounter begins, so Chisel trashes a strength 1 ice with no counters (ruling 1)", () => {
    const control = chisel(false);
    expect(control.cards["ch-1"]!.virusCounters).toBe(1);
    expect(control.servers.hq.ice).toContain("iw-1");
    const s = chisel(true);
    expect(s.servers.hq.ice).not.toContain("iw-1");
    expect(s.corp.discardPile).toContain("iw-1");
  });
});

// ---------------------------------------------------------------------------
// Light the Fire!
// ---------------------------------------------------------------------------

const LTF_SERVER = "remote-root-1" as ServerId;

/**
 * The Runner with Light the Fire! installed, 3 cards in the grip to pay
 * its core damage, and a remote holding `rootDefId` (id root-1).
 */
function ltfBoard(rootDefId: string, rezzed = false): GameState {
  const s = runnerTurn(fresh(), 10);
  s.corp.credits = 0;
  installRunner(s, "light-the-fire", "ltf-1");
  for (let i = 1; i <= 3; i++) toHand(s, "runner", "sure-gamble", `sg-${i}`);
  installRoot(s, rootDefId, "root-1", rezzed);
  return s;
}

function useLtf(s: GameState, serverId = LTF_SERVER): GameState {
  return must(s, {
    type: "use_paid_ability",
    cardId: "ltf-1",
    abilityId: "ltf-run",
    serverId,
  });
}

describe("Light the Fire!", () => {
  it("Light the Fire!: an agenda in the root is trashed with the rest of the root, so there is nothing to access or steal (ruling 1)", () => {
    let s = ltfBoard("hostile-takeover");
    s = useLtf(s);
    const { state, accessed } = walkThrough(s);
    expect(state.corp.discardPile).toContain("root-1");
    expect(state.runner.scoreArea).not.toContain("root-1");
    expect(accessed).toEqual([]);
  });

  it("Light the Fire!: on a server protected by ice the Runner still breaches, so Aumakua gains a virus counter (ruling 2)", () => {
    let s = ltfBoard("pad-campaign");
    installIce(s, "ice-wall", "iw-1", LTF_SERVER, false);
    installRunner(s, "aumakua", "au-1");
    s = useLtf(s);
    s = walk(s);
    expect(s.corp.discardPile).toContain("root-1");
    expect(s.cards["au-1"]!.virusCounters ?? 0).toBe(1);
  });

  it("Light the Fire!: cards hosted on Full Immersion RecStudio are in the root and are trashed with it (ruling 3)", () => {
    let s = ltfBoard("full-immersion-recstudio", true);
    installIce(s, "ice-wall", "iw-1", LTF_SERVER, false);
    for (const id of ["h-1", "h-2"]) {
      const hosted = put(s, "pad-campaign", id, `hosted:root-1`);
      hosted.hostId = "root-1";
    }
    s.cards["root-1"]!.hostedCardIds = ["h-1", "h-2"];
    s = useLtf(s);
    s = walk(s);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["root-1", "h-1", "h-2"]),
    );
  });

  // Filed under area 14: the engine treats "When that run is successful"
  // as an "If successful" ability tied to the remote (CR 6.7.4a), so once
  // Susanoo-no-Mikoto moves the run to Archives nothing is trashed and the
  // Runner accesses the upgrade instead.
  it.skip("Light the Fire!: when Susanoo-no-Mikoto moves the run to Archives, it trashes the upgrades in Archives' root and the Runner breaches Archives normally (ruling 4; filed, area 14, CR 6.7.4a: its trash is tied to the remote and does not happen)", () => {
    let s = ltfBoard("pad-campaign");
    installIce(s, "susanoo-no-mikoto", "su-1", LTF_SERVER);
    s.servers.archives.ice = [];
    put(s, "crisium-grid", "up-1", "server:archives:root");
    s.servers.archives.root.push("up-1");
    put(s, "hedge-fund", "ar-1", "corp:archives");
    s.corp.discardPile.push("ar-1");
    s = useLtf(s);
    const { state, accessed } = walkThrough(s);
    expect(state.corp.discardPile).toContain("up-1");
    expect(state.servers.archives.root).not.toContain("up-1");
    expect(accessed).toContain("ar-1");
    expect(state.servers[LTF_SERVER]?.root ?? []).toContain("root-1");
  });

  it("Light the Fire!: during its run NGO Front in the attacked root has lost its abilities, so the Corp cannot use it (ruling 5)", () => {
    let s = ltfBoard("ngo-front", true);
    s.cards["root-1"]!.advancementCounters = 1;
    installIce(s, "ice-wall", "iw-1", LTF_SERVER, false);
    s = useLtf(s);
    for (let i = 0; i < 20 && s.run; i++) {
      expect(paidAbility(s, "root-1")).toBeUndefined();
      const legal = legalActions(s);
      const next =
        legal.find((a) => a.type === "continue_run") ??
        legal.find((a) => a.type === "pass_window");
      if (!next) break;
      s = must(s, next);
    }
    expect(s.corp.discardPile).toContain("root-1");
    expect(s.corp.credits).toBe(0);
  });

  it("Light the Fire!: Security Testing's breach replacement and Light the Fire!'s trash both apply (ruling 6)", () => {
    let s = ltfBoard("pad-campaign");
    installIce(s, "ice-wall", "iw-1", LTF_SERVER, false);
    const st = installRunner(s, "security-testing", "st-1");
    st.namedServerId = LTF_SERVER;
    const credits = s.runner.credits;
    s = useLtf(s);
    const { state, accessed } = walkThrough(s);
    expect(state.corp.discardPile).toContain("root-1");
    expect(state.runner.credits).toBe(credits + 2);
    expect(accessed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No Free Lunch
// ---------------------------------------------------------------------------

describe("No Free Lunch", () => {
  it("No Free Lunch: it cannot be used while Gachapon's install is resolving, only with priority in a paid ability window (ruling 1)", () => {
    let s = runnerTurn(fresh(), 0);
    installRunner(s, "no-free-lunch", "nfl-1");
    installRunner(s, "gachapon", "ga-1");
    for (let i = 1; i <= 6; i++) {
      put(s, "corroder", `st-${i}`, "runner:stack");
      s.runner.deck.push(`st-${i}`);
    }
    s.timingKey = "runner.actionPaw";
    expect(paidAbility(s, "nfl-1")).toBeDefined();
    s = must(s, paidAbility(s, "ga-1")!);
    expect(s.pendingChoice).toBeTruthy();
    expect(paidAbility(s, "nfl-1")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Psych Mike
// ---------------------------------------------------------------------------

describe("Psych Mike", () => {
  // Filed under area 14: Psych Mike reads `run.accessedCardIds` when the
  // run has ended, finds none, and gains nothing even after a plain
  // one-card R&D run (the control below). It would also count distinct
  // cards, not accesses.
  it.skip("Psych Mike: accessing the same R&D card twice in a run (Shiro, then the run's breach) gains 2 credits (ruling 1; filed, area 14, CR 6.9.6d: at the end of the run it finds no R&D accesses and gains nothing)", () => {
    const run = (shiro: boolean): { state: GameState; accessed: string[] } => {
      let s = runnerTurn(fresh(), 0);
      s.servers.rd.ice = [];
      if (shiro) installIce(s, "shiro", "sh-1", "rd");
      installRunner(s, "psych-mike", "pm-1");
      s.corp.credits = 0;
      clearRd(s);
      stackRd(s, [["hedge-fund", "rd-1"]]);
      s = must(s, { type: "basic_run", serverId: "rd" });
      return walkThrough(s);
    };
    const control = run(false);
    expect(control.accessed).toHaveLength(1);
    expect(control.state.runner.credits).toBe(1);
    const { state, accessed } = run(true);
    expect(accessed).toHaveLength(2);
    expect(state.runner.credits).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Red Team
// ---------------------------------------------------------------------------

/** Servers a run ability on `cardId` is offered against. */
function runTargets(s: GameState, cardId: string): string[] {
  return legalActions(s)
    .filter((a) => a.type === "use_paid_ability" && a.cardId === cardId)
    .map((a) => (a as { serverId?: string }).serverId ?? "");
}

describe("Red Team", () => {
  it("Red Team: a Sneakdoor Beta run counts as a run on Archives, so Red Team cannot run Archives later that turn (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    clearCorpHand(s);
    for (const server of ["hq", "archives"] as const)
      s.servers[server].ice = [];
    installRunner(s, "red-team", "rt-1").hostedCredits = 12;
    installRunner(s, "sneakdoor-beta", "sd-1");
    expect(runTargets(s, "rt-1")).toEqual(
      expect.arrayContaining(["hq", "archives"]),
    );
    s = must(s, {
      type: "use_paid_ability",
      cardId: "sd-1",
      abilityId: "sneakdoor-run",
      serverId: "archives",
    });
    const start = s.log.length;
    s = walk(s);
    expect(s.log.slice(start).join("\n")).toMatch(/HQ|hq/);
    const targets = runTargets(s, "rt-1");
    expect(targets).not.toContain("archives");
    expect(targets).toContain("hq");
  });
});

// ---------------------------------------------------------------------------
// Scrubber
// ---------------------------------------------------------------------------

describe("Scrubber", () => {
  // Filed under area 15: the refill sets the hosted credits to 2 even when
  // there are more, though CR 1.10.5a places credits only when there are
  // fewer than 2. Installing and refilling from 1 to 2 work.
  it.skip("Scrubber: installed it gets 2 credits, and before the Runner's turn begins it refills to 2, adding none when it has 2 or more (ruling 1; filed, area 15, CR 1.10.5a: the refill lowers 3 hosted credits to 2)", () => {
    let s = runnerTurn(fresh(), 10);
    toHand(s, "runner", "scrubber", "sc-1");
    s = must(s, {
      type: "basic_install",
      cardId: "sc-1",
      destination: { kind: "installed" },
    });
    expect(s.cards["sc-1"]!.recurringCredits).toBe(2);
    s = drive(s, atRunnerAction);
    s.cards["sc-1"]!.recurringCredits = 1;
    s = toRunnerTurn(toCorpTurn(s));
    expect(s.cards["sc-1"]!.recurringCredits).toBe(2);
    s.cards["sc-1"]!.recurringCredits = 3;
    s = toRunnerTurn(toCorpTurn(s));
    expect(s.cards["sc-1"]!.recurringCredits).toBe(3);
  });

  it("Scrubber: its credits pay the basic trash cost of an accessed card, but not Political Operative's X (ruling 2)", () => {
    let s = runnerTurn(fresh(), 2);
    installRunner(s, "scrubber", "sc-1").recurringCredits = 2;
    installRoot(s, "pad-campaign", "root-1", false);
    s = must(s, { type: "basic_run", serverId: "remote-root-1" as ServerId });
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "trash_accessed" && a.cardId === "root-1",
      ),
    );
    s = must(s, { type: "trash_accessed", cardId: "root-1" });
    expect(s.corp.discardPile).toContain("root-1");
    expect(s.cards["sc-1"]!.recurringCredits ?? 0).toBe(0);
    expect(s.runner.credits).toBe(0);

    // Political Operative: 2 in the pool and 2 on Scrubber cannot pay X = 4.
    const po = (pool: number): GameState => {
      const b = runnerTurn(fresh(), pool);
      b.timingKey = "runner.actionPaw";
      installRunner(b, "scrubber", "sc-1").recurringCredits = 2;
      installRunner(b, "political-operative", "po-1");
      installRoot(b, "pad-campaign", "root-1", true);
      return b;
    };
    const control = po(4);
    let c = must(control, paidAbility(control, "po-1")!);
    if (c.pendingChoice) c = pick(c, "root-1");
    expect(c.corp.discardPile).toContain("root-1");
    const b = po(2);
    const use = paidAbility(b, "po-1");
    if (use) {
      const r = applyAction(b, use);
      const after = r.ok ? r.state : b;
      const options = after.pendingChoice ? optionIds(after) : [];
      expect(options.some((id) => id.includes("root-1"))).toBe(false);
      expect(after.corp.discardPile).not.toContain("root-1");
    }
  });
});

// ---------------------------------------------------------------------------
// Security Testing
// ---------------------------------------------------------------------------

/** HQ with no ice and three cards; Security Testing names HQ. */
function securityTestingHq(): GameState {
  const s = runnerTurn(fresh(), 5);
  s.servers.hq.ice = [];
  clearCorpHand(s);
  for (let i = 1; i <= 3; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
  installRunner(s, "security-testing", "st-1").namedServerId = "hq";
  return s;
}

describe("Security Testing", () => {
  it("Security Testing: trashed during the run on the chosen server, it does not replace the breach (ruling 1)", () => {
    let s = securityTestingHq();
    s = must(s, { type: "basic_run", serverId: "hq" });
    trashCard(s, "st-1", { by: "runner" });
    const { state, accessed } = walkThrough(s);
    expect(state.runner.discardPile).toContain("st-1");
    expect(accessed).toHaveLength(1);
    expect(state.runner.credits).toBe(5);
  });

  it("Security Testing: a breach of HQ replaced by its 2 credits is not a breach, so Docklands Pass adds an access on the next HQ run (ruling 2)", () => {
    let s = securityTestingHq();
    installRunner(s, "docklands-pass", "dp-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    const first = walkThrough(s);
    expect(first.accessed).toEqual([]);
    expect(first.state.runner.credits).toBe(7);
    s = must(first.state, { type: "basic_run", serverId: "hq" });
    expect(walkThrough(s).accessed).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Smartware Distributor
// ---------------------------------------------------------------------------

describe("Smartware Distributor", () => {
  it("Smartware Distributor: its action places 3 credits even when credits are already on it (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    installRunner(s, "smartware-distributor", "sw-1").hostedCredits = 3;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "sw-1",
      abilityId: "smartware-load",
    });
    expect(s.cards["sw-1"]!.hostedCredits).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Stoneship Chart Room
// ---------------------------------------------------------------------------

describe("Stoneship Chart Room", () => {
  it("Stoneship Chart Room: a card with 2 power counters has one, so it can be charged (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    s.timingKey = "runner.actionPaw";
    installRunner(s, "stoneship-chart-room", "sc-1");
    installRunner(s, "hyperbaric", "hb-1").powerCounters = 2;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "sc-1",
      abilityId: "stoneship-charge",
    });
    if (s.pendingChoice) s = pick(s, "hb-1");
    expect(s.cards["hb-1"]!.powerCounters).toBe(3);
  });

  // Filed under area 11: Lat's "when your discard phase ends" ability
  // becomes pending at the discard step (5.7.2a), before the paid ability
  // window of 5.7.2b, so Stoneship's draw cannot come first. Without Lat
  // the window after the discard step is there (runner.discardPaw).
  it.skip("Stoneship Chart Room: there is a paid ability window after the discard step, so its draw comes before Lat checks the grip (ruling 2; filed, area 11, CR 5.7.2d: Lat triggers at the discard step, before the window)", () => {
    let s = runnerTurn(fresh(), 5);
    setIdentity(s, "runner", "lat-ethical-freelancer");
    clearCorpHand(s);
    for (let i = 1; i <= 2; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
    for (let i = 1; i <= 5; i++) {
      put(s, "sure-gamble", `stk-${i}`, "runner:stack");
      s.runner.deck.push(`stk-${i}`);
    }
    installRunner(s, "stoneship-chart-room", "sc-1");
    s.config.stopAfterFirstCycle = false;
    s.runner.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(
      s,
      (x) =>
        x.activeSide === "runner" &&
        /discard/i.test(x.timingKey) &&
        !!paidAbility(x, "sc-1"),
    );
    expect(s.runner.hand).toHaveLength(0);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "sc-1",
      abilityId: "stoneship-draw",
    });
    expect(s.runner.hand).toHaveLength(2);
    s = drive(s, () => false);
    // Lat: 2 in the grip, 2 in HQ, so the Runner may draw 1.
    expect(s.pendingChoice?.sourceId).toBe(s.runner.identityId);
  });
});

// ---------------------------------------------------------------------------
// The Twinning
// ---------------------------------------------------------------------------

describe("The Twinning", () => {
  /** HQ with a rezzed Ice Wall the Runner breaks with Corroder. */
  function breakIceWall(s: GameState): GameState {
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-1", "hq");
    installRunner(s, "corroder", "cor-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    return must(s, {
      type: "break_subroutine",
      breakerId: "cor-1",
      subIndex: 0,
    });
  }

  it("The Twinning: spending Prepaid VoicePAD's recurring credit to play an event places a power counter (ruling 1)", () => {
    let s = runnerTurn(fresh(), 4);
    installRunner(s, "the-twinning", "tw-1");
    installRunner(s, "prepaid-voicepad", "pv-1").recurringCredits = 1;
    toHand(s, "runner", "sure-gamble", "sg-1");
    s = must(s, { type: "play_event", cardId: "sg-1" });
    expect(s.cards["pv-1"]!.recurringCredits ?? 0).toBe(0);
    expect(s.cards["tw-1"]!.powerCounters ?? 0).toBe(1);
  });

  it("The Twinning: credits spent from Overclock place no power counter, since Overclock is not installed (ruling 2)", () => {
    let s = runnerTurn(fresh(), 1);
    installRunner(s, "the-twinning", "tw-1");
    toHand(s, "runner", "overclock", "oc-1");
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-1", "hq");
    installRunner(s, "corroder", "cor-1");
    s = must(s, { type: "play_event", cardId: "oc-1", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    expect(s.runner.credits).toBe(0);
    const start = s.log.length;
    s = must(s, { type: "break_subroutine", breakerId: "cor-1", subIndex: 0 });
    expect(s.log.slice(start).join("\n")).toMatch(/run event credits/);
    expect(s.runner.credits).toBe(0);
    expect(s.cards["tw-1"]!.powerCounters ?? 0).toBe(0);
  });

  // Filed under area 15 (fix-now candidate): the engine reads recurring
  // credits for using programs only from installed cards, so Ele "Smoke"
  // Scovak's credit on the identity can never be spent (CR 1.10.5a).
  it.skip("The Twinning: Ele \"Smoke\" Scovak's credit is on the identity, which is not installed, so no power counter (ruling 3; filed, area 15, CR 1.10.5a: the identity's recurring credit is never offered to pay)", () => {
    let s = runnerTurn(fresh(), 0);
    setIdentity(
      s,
      "runner",
      "ele-smoke-scovak-cynosure-of-the-net",
    ).recurringCredits = 1;
    installRunner(s, "the-twinning", "tw-1");
    s = breakIceWall(s);
    expect(s.cards[s.runner.identityId]!.recurringCredits ?? 0).toBe(0);
    expect(s.cards["tw-1"]!.powerCounters ?? 0).toBe(0);
  });

  // Filed under area 15: DJ Fenris's gained text leaves out recurring
  // credits (FENRIS_GAINS_TEXT_KEYS), so Fenris hosting Ele "Smoke" Scovak
  // has no credit to spend (CR 1.10.5a).
  it.skip('The Twinning: DJ Fenris hosting Ele "Smoke" Scovak is installed, so spending its credit places a power counter (ruling 4; filed, area 15, CR 1.10.5a: Fenris does not gain the hosted identity\'s recurring credit)', () => {
    let s = runnerTurn(fresh(), 10);
    put(
      s,
      "ele-smoke-scovak-cynosure-of-the-net",
      "ele-1",
      RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
    ).rezzed = false;
    s.runner.additionalIdentities = ["ele-1"];
    toHand(s, "runner", "dj-fenris", "df-1");
    s = must(s, {
      type: "basic_install",
      cardId: "df-1",
      destination: { kind: "installed" },
    });
    if (s.pendingChoice) s = pick(s, "ele-1");
    s = drive(s, atRunnerAction);
    expect(s.cards["df-1"]!.hostedCardIds).toContain("ele-1");
    expect(s.cards["df-1"]!.recurringCredits).toBe(1);
    installRunner(s, "the-twinning", "tw-1");
    s.runner.credits = 0;
    s = breakIceWall(s);
    expect(s.cards["df-1"]!.recurringCredits ?? 0).toBe(0);
    expect(s.cards["tw-1"]!.powerCounters ?? 0).toBe(1);
  });

  it("The Twinning: with Virtuoso and R&D as the mark, it may add 2 accesses on the R&D breach and 2 more on Virtuoso's HQ breach (ruling 5)", () => {
    let s = runnerTurn(fresh(), 5);
    s.servers.rd.ice = [];
    clearCorpHand(s);
    for (let i = 1; i <= 4; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
    clearRd(s);
    stackRd(
      s,
      [1, 2, 3, 4].map((i) => ["hedge-fund", `rd-${i}`] as [string, string]),
    );
    installRunner(s, "virtuoso", "vir-1");
    installRunner(s, "the-twinning", "tw-1").powerCounters = 4;
    placeMark(s, "rd", "vir-1");
    s = must(s, { type: "basic_run", serverId: "rd" });
    let accesses = 0;
    for (let i = 0; i < 80 && !atRunnerAction(s); i++) {
      if (s.pendingChoice) {
        const ids = optionIds(s);
        s = must(s, {
          type: "choose_option",
          optionId: ids.find((id) => /2/.test(id)) ?? ids[0]!,
        });
        continue;
      }
      const legal = legalActions(s);
      const next = [
        "continue_run",
        "access_card",
        "finish_access",
        "finish_breach",
        "pass_window",
      ]
        .map((type) => legal.find((a) => a.type === type))
        .find(Boolean)!;
      if (next.type === "access_card") accesses++;
      s = must(s, next);
    }
    expect(s.cards["tw-1"]!.powerCounters ?? 0).toBe(0);
    expect(accesses).toBe(6);
  });

  // Filed under area 11: Corroder's pump is listed only in an encounter's
  // paid ability window, though an icebreaker may pump outside an
  // encounter (CR 3.9.5d).
  it.skip("The Twinning: hosted credits spent to pump an icebreaker outside a run place a power counter (ruling 6; filed, area 11, CR 3.9.5d: Corroder's pump is offered only during an encounter)", () => {
    let s = runnerTurn(fresh(), 0);
    s.timingKey = "runner.actionPaw";
    installRunner(s, "the-twinning", "tw-1");
    installRunner(s, "multithreader", "mt-1").recurringCredits = 2;
    installRunner(s, "corroder", "cor-1");
    const pump = paidAbility(s, "cor-1");
    expect(pump).toBeDefined();
    s = must(s, pump!);
    expect(s.cards["mt-1"]!.recurringCredits).toBe(1);
    expect(s.cards["tw-1"]!.powerCounters ?? 0).toBe(1);
  });

  it("The Twinning: credits spent from Paladin Poemu to install it place no counter, since it is not yet active (ruling 7)", () => {
    let s = runnerTurn(fresh(), 0);
    installRunner(s, "paladin-poemu", "pp-1").hostedCredits = 3;
    toHand(s, "runner", "the-twinning", "tw-1");
    s = must(s, {
      type: "basic_install",
      cardId: "tw-1",
      destination: { kind: "installed" },
    });
    s = drive(s, atRunnerAction);
    expect(s.runner.installed).toContain("tw-1");
    expect(s.cards["pp-1"]!.hostedCredits ?? 0).toBe(0);
    expect(s.cards["tw-1"]!.powerCounters ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Thunder Art Gallery
// ---------------------------------------------------------------------------

describe("Thunder Art Gallery", () => {
  it("Thunder Art Gallery: a program installed with it after Citadel Sanctuary removes a tag at the end of the turn gains Autoscripter's click, which cannot be spent (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    s.runner.tags = 1;
    s.corp.credits = 0;
    installRunner(s, "thunder-art-gallery", "tag-1");
    installRunner(s, "citadel-sanctuary", "cs-1");
    installRunner(s, "autoscripter", "as-1");
    // Forger's link 1 beats Citadel Sanctuary's trace 1.
    toHand(s, "runner", "forger", "fg-1");
    s = must(s, {
      type: "basic_install",
      cardId: "fg-1",
      destination: { kind: "installed" },
    });
    s = drive(s, atRunnerAction);
    toHand(s, "runner", "corroder", "cor-1");
    s.config.stopAfterFirstCycle = false;
    s.runner.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, () => false);
    expect(s.runner.tags).toBe(0);
    expect(s.pendingChoice?.sourceId).toBe("tag-1");
    s = pick(s, "install");
    if (s.pendingChoice && optionIds(s).some((id) => id.includes("cor-1"))) {
      s = pick(s, "cor-1");
    }
    // Autoscripter and the second Citadel Sanctuary trigger are ordered.
    const gained = (x: GameState) =>
      x.runner.clicks > 0 || x.activeSide === "corp";
    for (let i = 0; i < 5; i++) {
      s = drive(s, gained);
      if (!s.pendingChoice) break;
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
    }
    expect(s.runner.installed).toContain("cor-1");
    expect(s.runner.clicks).toBe(1);
    // The click comes after the action phase: nothing can spend it.
    expect(
      legalActions(s).every((a) =>
        ["pass_window", "use_paid_ability", "discard_to_hand_size"].includes(
          a.type,
        ),
      ),
    ).toBe(true);
    s = drive(s, (x) => x.timingKey === "corp.takeAction");
    expect(s.runner.clicks).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Verbal Plasticity
// ---------------------------------------------------------------------------

describe("Verbal Plasticity", () => {
  // Filed under area 11: the basic draw action never opens The Class Act's
  // interrupt (an event's draw does), so with or without Verbal
  // Plasticity the Runner just draws (CR 9.9.3d).
  it.skip("Verbal Plasticity: with The Class Act, the draw becomes 2 first, so The Class Act looks at 3 and 1 goes to the bottom (ruling 1; filed, area 11, CR 9.9.3d: the basic draw skips The Class Act's interrupt)", () => {
    let s = runnerTurn(fresh(), 5);
    for (const id of s.runner.deck) delete s.cards[id];
    s.runner.deck = [];
    installRunner(s, "verbal-plasticity", "vp-1");
    installRunner(s, "the-class-act", "tca-1");
    for (let i = 1; i <= 5; i++) {
      put(s, "sure-gamble", `stk-${i}`, "runner:stack");
      s.runner.deck.push(`stk-${i}`);
    }
    s = must(s, { type: "basic_draw" });
    expect(s.pendingChoice?.sourceId).toBe("tca-1");
    expect(optionIds(s)).toHaveLength(3);
    s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
    s = drive(s, atRunnerAction);
    expect(s.runner.hand).toHaveLength(2);
    expect(s.runner.deck.at(-1)).toBe("stk-1");
  });
});

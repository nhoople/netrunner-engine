/**
 * Official rulings on upgrades (CR audit tool 1.14, fourth batch).
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
  atCorpAction,
  clearCorpHand,
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
  toHand,
  walkThrough,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.27");
});

/** An upgrade in the root of `server`, rezzed unless `rezzed` is false. */
function upgrade(
  s: GameState,
  defId: string,
  id: string,
  server: ServerId,
  rezzed = true,
) {
  const card = put(s, defId, id, `server:${server}:root`);
  s.servers[server]!.root.push(id);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  return card;
}

/**
 * Run `server` (one unrezzed Ice Wall the Corp leaves unrezzed) and stop
 * in the paid ability window after the Runner's last chance to jack out
 * (CR 6.9.3, run.afterMovePaw), with the Corp to act.
 */
function toLastRezWindow(s: GameState, server: ServerId): GameState {
  s.servers[server]!.ice = [];
  installIce(s, "ice-wall", "iw-1", server, false);
  s = must(s, { type: "basic_run", serverId: server });
  for (let i = 0; i < 20; i++) {
    if (
      s.timingKey === "run.afterMovePaw" &&
      legalActions(s).some((a) => a.type === "rez_asset")
    ) {
      return s;
    }
    const legal = legalActions(s);
    const next =
      legal.find((a) => a.type === "continue_run") ??
      legal.find((a) => a.type === "pass_window");
    if (!next) break;
    s = must(s, next);
  }
  throw new Error(`no rez window after the jack-out step: ${s.timingKey}`);
}

/** Steal Hostile Takeover from a remote that also holds `upgradeDef`. */
function stealFrom(upgradeDef: string, rezzed: boolean): GameState {
  const s = runnerTurn(fresh(), 10);
  installRoot(s, "hostile-takeover", "ht-1", false);
  upgrade(s, upgradeDef, "up-1", "remote-ht-1" as ServerId, rezzed);
  return s;
}

/**
 * Play the run out: trash what may be trashed and steal what may be
 * stolen, otherwise continue, access, finish and pass.
 */
function stealAndTrash(s: GameState): GameState {
  for (let i = 0; i < 40 && s.run; i++) {
    const legal = legalActions(s);
    const next =
      legal.find((a) => a.type === "trash_accessed") ??
      legal.find((a) => a.type === "steal_agenda") ??
      legal.find((a) => a.type === "continue_run") ??
      legal.find((a) => a.type === "access_card") ??
      legal.find((a) => a.type === "finish_access") ??
      legal.find((a) => a.type === "finish_breach") ??
      legal.find((a) => a.type === "pass_window");
    if (!next) break;
    s = must(s, next);
  }
  return s;
}

// ---------------------------------------------------------------------------
// AMAZE Amusements
// ---------------------------------------------------------------------------

describe("AMAZE Amusements", () => {
  it("AMAZE Amusements: trashed by Political Operative, not while accessed, its ability does not persist (ruling 1)", () => {
    let s = stealFrom("amaze-amusements", true);
    s.turn.successfulHqRunThisTurn = true;
    installRunner(s, "political-operative", "po-1");
    s.timingKey = "runner.actionPaw";
    s = must(s, paidAbility(s, "po-1")!);
    s = pick(s, "up-1");
    s = drive(s, (x) => x.timingKey === "runner.takeAction");
    expect(s.corp.discardPile).toContain("up-1");
    s = must(s, { type: "basic_run", serverId: "remote-ht-1" as ServerId });
    s = stealAndTrash(s);
    expect(s.runner.scoreArea).toContain("ht-1");
    expect(s.runner.tags).toBe(0);
  });

  it("AMAZE Amusements: accessed and trashed while unrezzed, its ability was never active, so stealing gives no tags (ruling 2)", () => {
    let s = stealFrom("amaze-amusements", false);
    s = must(s, { type: "basic_run", serverId: "remote-ht-1" as ServerId });
    s = stealAndTrash(s);
    expect(s.corp.discardPile).toContain("up-1");
    expect(s.runner.scoreArea).toContain("ht-1");
    expect(s.runner.tags).toBe(0);

    // Control: rezzed and trashed while accessed, it persists for the run.
    let t = stealFrom("amaze-amusements", true);
    t = must(t, { type: "basic_run", serverId: "remote-ht-1" as ServerId });
    t = stealAndTrash(t);
    expect(t.corp.discardPile).toContain("up-1");
    expect(t.runner.tags).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Anoetic Void
// ---------------------------------------------------------------------------

/** Anoetic Void's end-the-run, offered as a paid ability or a choice. */
function anoeticOffered(s: GameState): boolean {
  return (
    Boolean(paidAbility(s, "up-1")) || s.pendingChoice?.sourceId === "up-1"
  );
}

describe("Anoetic Void", () => {
  it("Anoetic Void: rezzed in the paid ability window after the Runner's last chance to jack out, it still applies to the run (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.corp.credits = 10;
    clearCorpHand(s);
    toHand(s, "corp", "hedge-fund", "hq-1");
    toHand(s, "corp", "hedge-fund", "hq-2");
    upgrade(s, "anoetic-void", "up-1", "hq", false);
    s = toLastRezWindow(s, "hq");
    s = must(s, { type: "rez_asset", cardId: "up-1" });
    s = drive(s, (x) => anoeticOffered(x));
    expect(s.run).not.toBeNull();
    s = paidAbility(s, "up-1")
      ? must(s, {
          type: "use_paid_ability",
          cardId: "up-1",
          abilityId: "etr",
          costCardIds: ["hq-1", "hq-2"],
        })
      : pick(s, "accept");
    s = drive(s, (x) => !x.run);
    expect(s.turn.successfulHqRunThisTurn ?? false).toBe(false);
  });

  it("Anoetic Void: installed in the root of HQ, it is not a card in HQ, so it cannot be one of the 2 cards trashed (ruling 2)", () => {
    let s = runnerTurn(fresh(), 10);
    s.corp.credits = 10;
    s.servers.hq.ice = [];
    clearCorpHand(s);
    toHand(s, "corp", "hedge-fund", "hq-1");
    toHand(s, "corp", "hedge-fund", "hq-2");
    upgrade(s, "anoetic-void", "up-1", "hq");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => anoeticOffered(x));
    const withVoid = applyAction(s, {
      type: "use_paid_ability",
      cardId: "up-1",
      abilityId: "etr",
      costCardIds: ["up-1", "hq-1"],
    });
    expect(withVoid.ok).toBe(false);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "up-1",
      abilityId: "etr",
      costCardIds: ["hq-1", "hq-2"],
    });
    expect(s.cards["up-1"]!.zone).toBe("server:hq:root");
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-1", "hq-2"]),
    );
  });
});

// ---------------------------------------------------------------------------
// Crisium Grid
// ---------------------------------------------------------------------------

/** HQ with no ice, two cards, and a rezzed Crisium Grid in its root. */
function crisiumHq(): GameState {
  const s = runnerTurn(fresh(), 10);
  clearCorpHand(s);
  toHand(s, "corp", "hedge-fund", "hq-1");
  toHand(s, "corp", "hedge-fund", "hq-2");
  s.servers.hq.ice = [];
  upgrade(s, "crisium-grid", "cg-1", "hq");
  return s;
}

/** HQ and Archives with no ice, a card in each, Crisium Grid in `where`. */
function sneakdoorBoard(where: "hq" | "archives"): GameState {
  const s = runnerTurn(fresh(), 5);
  clearCorpHand(s);
  toHand(s, "corp", "hedge-fund", "hq-1");
  s.servers.hq.ice = [];
  s.servers.archives.ice = [];
  put(s, "hedge-fund", "ar-1", "corp:archives");
  s.corp.discardPile.push("ar-1");
  upgrade(s, "crisium-grid", "cg-1", where);
  installRunner(s, "sneakdoor-beta", "sd-1");
  return must(s, {
    type: "use_paid_ability",
    cardId: "sd-1",
    abilityId: "sneakdoor-run",
    serverId: "archives",
  });
}

describe("Crisium Grid", () => {
  // Filed with Sneakdoor Beta ruling 1 (area 14, fix-now): when Crisium
  // Grid stops the declaration, the engine skips the breach, so the
  // Runner accesses nothing. The Runner breaches whether or not the run
  // was declared successful (CR 6.9.5b, 6.8.4a).
  it.skip("Crisium Grid: a Jailbreak run on HQ breaches HQ but gets no extra access and no card drawn (ruling 1; filed, area 14, CR 6.9.5b: no breach when the run cannot be declared successful)", () => {
    let s = crisiumHq();
    toHand(s, "runner", "jailbreak", "jb-1");
    const grip = s.runner.hand.length - 1;
    s = must(s, { type: "play_event", cardId: "jb-1", serverId: "hq" });
    const { state, accessed } = walkThrough(s);
    // Crisium Grid and one card from HQ: no extra card from HQ.
    expect(accessed.filter((id) => id.startsWith("hq-"))).toHaveLength(1);
    expect(state.runner.hand).toHaveLength(grip);
  });

  // Filed with ruling 1: there is no breach to trash Crisium Grid in.
  it.skip("Crisium Grid: trashed during the breach of HQ, the run still was not successful, so Emergency Shutdown cannot be played (ruling 2; filed, area 14, CR 6.9.5b: no breach when the run cannot be declared successful)", () => {
    let s = crisiumHq();
    toHand(s, "runner", "emergency-shutdown", "es-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "trash_accessed" && a.cardId === "cg-1",
      ),
    );
    s = must(s, { type: "trash_accessed", cardId: "cg-1" });
    s = walkThrough(s).state;
    expect(s.corp.discardPile).toContain("cg-1");
    expect(
      legalActions(s).some(
        (a) => a.type === "play_event" && a.cardId === "es-1",
      ),
    ).toBe(false);
  });

  // Filed with ruling 1 (CR 6.9.5b).
  it.skip("Crisium Grid: the Runner still breaches the server and accesses cards as normal (ruling 3; filed, area 14, CR 6.9.5b: no breach when the run cannot be declared successful)", () => {
    const s = crisiumHq();
    const { state, accessed } = walkThrough(
      must(s, { type: "basic_run", serverId: "hq" }),
    );
    expect(accessed.some((id) => id.startsWith("hq-"))).toBe(true);
    expect(state.turn.successfulHqRunThisTurn ?? false).toBe(false);
  });

  // Filed with Sneakdoor Beta ruling 1 (area 14, CR 6.9.5b).
  it.skip("Crisium Grid: with Crisium Grid in HQ, a Sneakdoor Beta run moves to HQ, is not successful, and breaches HQ (ruling 4; filed, area 14, CR 6.9.5b: no breach when the run cannot be declared successful)", () => {
    const { state, accessed } = walkThrough(sneakdoorBoard("hq"));
    expect(accessed).toContain("hq-1");
    expect(state.turn.successfulHqRunThisTurn ?? false).toBe(false);
  });

  // Filed with Sneakdoor Beta ruling 2 (area 14): the run is moved to HQ
  // and declared successful there (CR 6.9.5a).
  it.skip("Crisium Grid: with Crisium Grid in Archives, a Sneakdoor Beta run stays on Archives, is not successful, and breaches Archives (ruling 5; filed, area 14, CR 6.9.5a: the run is moved to HQ and declared successful)", () => {
    const { state, accessed } = walkThrough(sneakdoorBoard("archives"));
    expect(accessed).toContain("ar-1");
    expect(accessed).not.toContain("hq-1");
    expect(state.turn.successfulHqRunThisTurn ?? false).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Giordano Memorial Field
// ---------------------------------------------------------------------------

describe("Giordano Memorial Field", () => {
  // Filed under area 14: after GMF ends the run the engine logs "Run
  // declared unsuccessful" and sets unsuccessfulRunThisTurn, though the
  // run reached the Success Phase (CR 6.8.4a). Seen too: GMF, like Hokusai
  // Grid, becomes pending twice for one successful run (CR 9.6.6).
  it.skip("Giordano Memorial Field: a run it ends was already declared successful and stays successful (ruling 1; filed, area 14, CR 6.8.4a: the run is also declared unsuccessful)", () => {
    let s = runnerTurn(fresh(), 0);
    s.servers.hq.ice = [];
    put(s, "hostile-takeover", "rs-1", "runner:score");
    s.runner.scoreArea.push("rs-1");
    upgrade(s, "giordano-memorial-field", "gmf-1", "hq");
    s = must(s, { type: "basic_run", serverId: "hq" });
    const { state, accessed } = walkThrough(s);
    expect(accessed).toEqual([]);
    expect(state.turn.successfulHqRunThisTurn).toBe(true);
    expect(state.turn.unsuccessfulRunThisTurn ?? false).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Malapert Data Vault
// ---------------------------------------------------------------------------

describe("Malapert Data Vault", () => {
  it("Malapert Data Vault: it triggers on an agenda scored from the root of its own server, not from another server (ruling 1)", () => {
    let s = corpTurn(fresh(), 5);
    setIdentity(s, "corp", "nbn-making-news");
    installRoot(s, "hostile-takeover", "ht-1", false).advancementCounters = 2;
    upgrade(s, "malapert-data-vault", "mdv-1", "remote-ht-1" as ServerId);
    installRoot(s, "hostile-takeover", "ht-2", false).advancementCounters = 2;
    s.timingKey = "corp.actionPaw";
    s = must(s, { type: "score_agenda", cardId: "ht-2" });
    s = drive(s, atCorpAction);
    expect(s.corp.scoreArea).toContain("ht-2");
    expect(s.pendingChoice).toBeNull();
    s.timingKey = "corp.actionPaw";
    s = must(s, { type: "score_agenda", cardId: "ht-1" });
    s = drive(s, () => false);
    expect(s.pendingChoice?.sourceId).toBe("mdv-1");
    expect(optionIds(s)).toContain("search");
  });
});

// ---------------------------------------------------------------------------
// Manegarm Skunkworks
// ---------------------------------------------------------------------------

describe("Manegarm Skunkworks", () => {
  it("Manegarm Skunkworks: rezzed in the paid ability window after the Runner's last chance to jack out, it still applies to the run (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.corp.credits = 10;
    upgrade(s, "manegarm-skunkworks", "up-1", "hq", false);
    s = toLastRezWindow(s, "hq");
    const start = s.log.length;
    s = must(s, { type: "rez_asset", cardId: "up-1" });
    s = drive(s, (x) => !!x.pendingChoice || !x.run);
    expect(s.pendingChoice?.sourceId).toBe("up-1");
    expect(s.log.slice(start).join("\n")).not.toMatch(/Breach/);
  });

  it("Manegarm Skunkworks: in R&D's root it does not affect an Omar Keung run moved to R&D, since approaching came before the move (ruling 2)", () => {
    function omarRun(server: ServerId): GameState {
      let s = runnerTurn(fresh(), 10);
      setIdentity(s, "runner", "omar-keung-conspiracy-theorist");
      s.servers.archives.ice = [];
      s.servers.rd.ice = [];
      upgrade(s, "manegarm-skunkworks", "up-1", server);
      // Applied as a paid ability on the identity: the legal list offers
      // use_identity_ability, which spends the click and starts no run
      // (found, area 14: useIdentityAbility ignores startsRun).
      s = must(s, {
        type: "use_paid_ability",
        cardId: s.runner.identityId,
        abilityId: "omar-archives",
        serverId: "archives",
      });
      return drive(s, (x) => !!x.pendingChoice || !x.run);
    }
    let s = omarRun("rd");
    expect(s.pendingChoice?.sourceId).not.toBe("up-1");
    s = pick(s, "rd");
    s = drive(s, (x) => !!x.pendingChoice || !x.run);
    expect(s.pendingChoice?.sourceId ?? null).not.toBe("up-1");
    // Control: in Archives' root it meets its condition on the approach.
    const t = omarRun("archives");
    expect(t.pendingChoice?.sourceId).toBe("up-1");
  });
});

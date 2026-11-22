/**
 * Official rulings on assets (CR audit tool 1.14, fourth batch).
 *
 * Each it() names a card, states the ruling's answer in plain words, and
 * ends with the ruling number at the cards pin (vendor/cards-data/rulings/,
 * numbered in file order). tests/rulings.test.ts reads these titles. A
 * ruling the engine plays wrong is an it.skip naming the ruling and the CR
 * rule, filed under its area in the CR audit plan, not a fix here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
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
  toCorpTurn,
  toHand,
  walkThrough,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.28");
});

function giveRunnerCards(s: GameState, n: number): void {
  for (let i = 1; i <= n; i++) toHand(s, "runner", "sure-gamble", `grip-${i}`);
}

// ---------------------------------------------------------------------------
// Bladderwort
// ---------------------------------------------------------------------------

describe("Bladderwort", () => {
  it("Bladderwort: the credit check comes after the 1 credit is gained, so 3 credits become 4 and the Runner takes 1 net damage (ruling 1)", () => {
    let s = runnerTurn(fresh());
    giveRunnerCards(s, 3);
    installRoot(s, "bladderwort", "bw-1");
    s.corp.credits = 3;
    s = toCorpTurn(s);
    expect(s.corp.credits).toBe(4);
    expect(s.runner.hand).toHaveLength(2);
  });

  it("Bladderwort: two copies resolve one at a time in full, so the first does damage at 4 credits and the second gains to 5 and does none (ruling 2)", () => {
    let s = runnerTurn(fresh());
    giveRunnerCards(s, 3);
    installRoot(s, "bladderwort", "bw-1");
    installRoot(s, "bladderwort", "bw-2");
    s.corp.credits = 3;
    s = toCorpTurn(s);
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
      s = drive(s, atCorpAction);
    }
    // Gain, check, gain, check: one net damage, not two and not none.
    expect(s.corp.credits).toBe(5);
    expect(s.runner.hand).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Clearinghouse
// ---------------------------------------------------------------------------

describe("Clearinghouse", () => {
  // Filed under area 12: the card data has no canAdvance declaration, so
  // Clearinghouse can never be advanced, rezzed or not; Urtica Cipher and
  // Pharos are the other two "You can advance this" cards without it
  // (CR 1.18.3; a cards-data fix).
  it.skip("Clearinghouse: the Corp can advance it while it is unrezzed (ruling 1; filed, area 12, CR 1.18.3: no canAdvance in the card data)", () => {
    let s = corpTurn(fresh(), 5);
    installRoot(s, "clearinghouse", "ch-1", false);
    expect(legalActions(s)).toContainEqual({
      type: "advance",
      cardId: "ch-1",
    });
    s = must(s, { type: "advance", cardId: "ch-1" });
    expect(s.cards["ch-1"]!.advancementCounters).toBe(1);
    expect(s.cards["ch-1"]!.rezzed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Moon Pool
// ---------------------------------------------------------------------------

describe("Moon Pool", () => {
  it("Moon Pool: shuffling 0 cards into R&D still shuffles R&D (ruling 2)", () => {
    let s = corpTurn(fresh(), 5);
    installRoot(s, "moon-pool", "mp-1");
    s.timingKey = "corp.actionPaw";
    expect(s.corp.deck.length).toBeGreaterThan(1);
    const rng = s.rngState;
    s = must(s, paidAbility(s, "mp-1")!);
    while (s.pendingChoice) s = pick(s, "done");
    expect(s.cards["mp-1"]!.zone).toBe("removed-from-game");
    // A shuffle draws from the seeded random stream.
    expect(s.rngState).not.toBe(rng);
  });
});

// ---------------------------------------------------------------------------
// Nico Campaign
// ---------------------------------------------------------------------------

describe("Nico Campaign", () => {
  it("Nico Campaign: trashed by the Runner, the Corp draws no card; only its own ability draws (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    installRoot(s, "nico-campaign", "nico-1").hostedCredits = 6;
    const hq = s.corp.hand.length;
    s = must(s, { type: "basic_run", serverId: "remote-nico-1" as ServerId });
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "trash_accessed" && a.cardId === "nico-1",
      ),
    );
    s = must(s, { type: "trash_accessed", cardId: "nico-1" });
    s = drive(s, atRunnerAction);
    expect(s.corp.discardPile).toContain("nico-1");
    expect(s.corp.hand).toHaveLength(hq);
  });
});

// ---------------------------------------------------------------------------
// Spin Doctor
// ---------------------------------------------------------------------------

describe("Spin Doctor", () => {
  it("Spin Doctor: the Corp may remove it choosing no card in Archives, and R&D is still shuffled (ruling 1)", () => {
    let s = corpTurn(fresh(), 5);
    installRoot(s, "spin-doctor", "sd-1");
    put(s, "hedge-fund", "arc-1", "corp:archives");
    s.corp.discardPile.push("arc-1");
    s.timingKey = "corp.actionPaw";
    const rng = s.rngState;
    s = must(s, paidAbility(s, "sd-1")!);
    while (s.pendingChoice) s = pick(s, "done");
    expect(s.cards["sd-1"]!.zone).toBe("removed-from-game");
    expect(s.corp.discardPile).toContain("arc-1");
    expect(s.rngState).not.toBe(rng);
  });

  it("Spin Doctor: with Archives empty the Corp may still use it, to shuffle R&D (ruling 2)", () => {
    let s = corpTurn(fresh(), 5);
    installRoot(s, "spin-doctor", "sd-1");
    expect(s.corp.discardPile).toEqual([]);
    expect(s.corp.deck.length).toBeGreaterThan(1);
    s.timingKey = "corp.actionPaw";
    expect(paidAbility(s, "sd-1")).toBeTruthy();
    const rng = s.rngState;
    s = must(s, paidAbility(s, "sd-1")!);
    expect(s.cards["sd-1"]!.zone).toBe("removed-from-game");
    expect(s.rngState).not.toBe(rng);
  });
});

// ---------------------------------------------------------------------------
// Svyatogor Excavator
// ---------------------------------------------------------------------------

describe("Svyatogor Excavator", () => {
  it("Svyatogor Excavator: Rashida Jaheem installed by Ob after its trash missed this turn's trigger, so Rashida cannot be used (ruling 1)", () => {
    let s = runnerTurn(fresh());
    setIdentity(s, "corp", "ob-superheavy-logistics-extract-export-excel");
    installRoot(s, "svyatogor-excavator", "sv-1");
    installRoot(s, "malapert-data-vault", "mdv-1");
    stackRd(s, [["rashida-jaheem", "rj-1"]]);
    s = toCorpTurn(s);
    const credits = s.corp.credits;
    while (s.pendingChoice && !optionIds(s).some((id) => id.includes("rj-1"))) {
      const ids = optionIds(s);
      s = must(s, {
        type: "choose_option",
        optionId:
          ids.find((id) => id.includes("mdv-1")) ??
          ids.find((id) => id === "accept") ??
          ids[0]!,
      });
    }
    // Svyatogor trashes Malapert (printed rez 1): Ob finds Rashida (0).
    s = pick(s, "rj-1");
    s = pick(s, "new_remote");
    expect(s.cards["rj-1"]!.rezzed).toBe(true);
    s = drive(s, atCorpAction);
    expect(s.pendingChoice).toBeNull();
    expect(s.cards["rj-1"]!.zone).toMatch(/^server:remote/);
    expect(s.corp.discardPile).toContain("mdv-1");
    // Svyatogor gained 3; Rashida's ability is not offered this turn.
    expect(s.corp.credits).toBe(credits + 3);
    expect(paidAbility(s, "rj-1")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Trieste Model Bioroids
// ---------------------------------------------------------------------------

describe("Trieste Model Bioroids", () => {
  /** HQ protected by Eli 1.0 (outermost) and Ichi 1.0; Trieste unrezzed. */
  function trieste(): GameState {
    const s = corpTurn(fresh(), 10);
    installIce(s, "ichi-1-0", "ichi-1", "hq");
    installIce(s, "eli-1-0", "eli-1", "hq");
    installRoot(s, "trieste-model-bioroids", "tr-1", false);
    s.timingKey = "corp.actionPaw";
    return s;
  }

  function divertPower(s: GameState, derez: string, rez: string | null) {
    toHand(s, "corp", "divert-power", "dp-1");
    s = drive(s, atCorpAction);
    s = must(s, { type: "play_operation", cardId: "dp-1" });
    s = pick(s, `derez-any:${derez}`);
    s = pick(s, "done-derez-any");
    s = pick(s, rez ? `rez-discount:${rez}` : "decline");
    return drive(s, atCorpAction);
  }

  /** Corroder pumped to Eli 1.0's strength while encountering it. */
  function encounterEli(s: GameState): GameState {
    s = runnerTurn(s, 10);
    installRunner(s, "corroder", "cor-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.run?.encounter?.iceId === "eli-1");
    // Corroder 2 +1 per pump; Eli 1.0 is strength 4.
    for (let i = 0; i < 2; i++) s = must(s, paidAbility(s, "cor-1")!);
    return s;
  }

  const corroderBreaks = (s: GameState) =>
    legalActions(s).some(
      (a) => a.type === "break_subroutine" && a.breakerId === "cor-1",
    );

  // The choice survives the ice being derezzed; only Trieste's derez ends it.
  it("Trieste Model Bioroids: the chosen ice derezzed and rezzed again is still the chosen ice (ruling 1)", () => {
    let s = trieste();
    s = must(s, { type: "rez_asset", cardId: "tr-1" });
    s = pick(s, "eli-1");
    s = divertPower(s, "eli-1", "eli-1");
    expect(s.cards["eli-1"]!.rezzed).toBe(true);
    s = encounterEli(s);
    expect(corroderBreaks(s)).toBe(false);
  });

  // Trieste's restriction is its static ability, so it applies only while
  // Trieste is active (CR 9.4.1, 1.8.3a). Fixed in RF-2.
  it("Trieste Model Bioroids: derezzed, its effect ends; rezzed again, the Corp makes a new choice (ruling 2; CR 9.4.1, 1.8.3a)", () => {
    let s = trieste();
    s = must(s, { type: "rez_asset", cardId: "tr-1" });
    s = pick(s, "eli-1");
    s = divertPower(s, "tr-1", null);
    expect(s.cards["tr-1"]!.rezzed).toBe(false);
    s.timingKey = "corp.actionPaw";
    s = must(s, { type: "rez_asset", cardId: "tr-1" });
    expect(optionIds(s)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("eli-1"),
        expect.stringContaining("ichi-1"),
      ]),
    );
    s = pick(s, "ichi-1");
    s = drive(s, atCorpAction);
    s = encounterEli(s);
    expect(corroderBreaks(s)).toBe(true);
  });

  it("Trieste Model Bioroids: Quetzal: Free Spirit's ability cannot break the chosen ice's subroutines (ruling 3)", () => {
    let s = trieste();
    s = must(s, { type: "rez_asset", cardId: "tr-1" });
    s = pick(s, "eli-1");
    s = drive(s, atCorpAction);
    s = runnerTurn(s, 10);
    setIdentity(s, "runner", "quetzal-free-spirit");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.run?.encounter?.iceId === "eli-1");
    expect(paidAbility(s, s.runner.identityId)).toBeUndefined();
    // Eli's own click ability is not a Runner card ability.
    expect(legalActions(s)).toContainEqual({
      type: "break_bioroid_subroutine",
      subIndex: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Urtica Cipher
// ---------------------------------------------------------------------------

describe("Urtica Cipher", () => {
  function accessUrtica(counters: number): GameState {
    let s = runnerTurn(fresh());
    giveRunnerCards(s, 5);
    installRoot(s, "urtica-cipher", "uc-1", false).advancementCounters =
      counters;
    s = must(s, { type: "basic_run", serverId: "remote-uc-1" as ServerId });
    return walkThrough(s).state;
  }

  // Filed with Clearinghouse ruling 1: no canAdvance in the card data (CR 1.18.3).
  it.skip("Urtica Cipher: the Corp can advance it while it is unrezzed (ruling 1; filed, area 12, CR 1.18.3: no canAdvance in the card data)", () => {
    let s = corpTurn(fresh(), 5);
    installRoot(s, "urtica-cipher", "uc-1", false);
    expect(legalActions(s)).toContainEqual({
      type: "advance",
      cardId: "uc-1",
    });
    s = must(s, { type: "advance", cardId: "uc-1" });
    expect(s.cards["uc-1"]!.advancementCounters).toBe(1);
  });

  it("Urtica Cipher: with no advancement counters it still does 2 net damage (ruling 2)", () => {
    const s = accessUrtica(0);
    expect(s.runner.hand).toHaveLength(3);
  });

  it("Urtica Cipher: advanced twice, it does 4 net damage as a single occurrence (ruling 3)", () => {
    const s = accessUrtica(2);
    expect(s.runner.hand).toHaveLength(1);
    const damage = s.log.filter((l) => /^net damage \d/.test(l));
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatch(/^net damage 4\b/);
  });
});

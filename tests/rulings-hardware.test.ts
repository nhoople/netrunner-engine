/**
 * Official rulings on hardware (CR audit tool 1.14, third batch).
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
import type { Action, ServerId } from "../src/state/types.js";
import { currentMark, placeMark } from "../src/state/msKeywords.js";
import { trashCard } from "../src/state/procedures/trash.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
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
  toHand,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.26");
});

const WALK_ORDER: Action["type"][] = [
  "steal_agenda",
  "continue_run",
  "access_card",
  "finish_access",
  "finish_breach",
  "pass_window",
];

/**
 * Play on to the Runner's next action, taking `choose(ids)` (default: the
 * first option) at each choice. Returns the number of accesses and the
 * cards accessed (hidden R&D cards show as object ids).
 */
function play(
  s: GameState,
  choose: (ids: string[]) => string | undefined = () => undefined,
): { state: GameState; accesses: number; accessed: string[] } {
  const accessed: string[] = [];
  for (let i = 0; i < 120 && !atRunnerAction(s); i++) {
    if (s.pendingChoice) {
      const ids = optionIds(s);
      s = must(s, { type: "choose_option", optionId: choose(ids) ?? ids[0]! });
      continue;
    }
    const legal = legalActions(s);
    const next = WALK_ORDER.map((t) => legal.find((a) => a.type === t)).find(
      Boolean,
    );
    if (!next) break;
    if (next.type === "access_card") accessed.push(next.cardId);
    s = must(s, next);
  }
  return { state: s, accesses: accessed.length, accessed };
}

/** HQ with `n` Hedge Funds (hq-1…), R&D with `n` (rd-1…), no ice on either. */
function centrals(s: GameState, n = 3): GameState {
  for (const server of ["hq", "rd", "archives"] as const) {
    s.servers[server].ice = [];
  }
  clearCorpHand(s);
  for (let i = 1; i <= n; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
  clearRd(s);
  stackRd(
    s,
    Array.from(
      { length: n },
      (_, i) => ["hedge-fund", `rd-${i + 1}`] as [string, string],
    ),
  );
  return s;
}

// ---------------------------------------------------------------------------
// Carnivore
// ---------------------------------------------------------------------------

/** A run on HQ holding `defId` (hq-1), the Runner with Carnivore and 2 cards. */
function carnivoreAccess(defId: string): GameState {
  let s = runnerTurn(fresh(), 0);
  s.servers.hq.ice = [];
  installRunner(s, "carnivore", "carn-1");
  toHand(s, "runner", "sure-gamble", "g-1");
  toHand(s, "runner", "diesel", "g-2");
  clearCorpHand(s);
  toHand(s, "corp", defId, "hq-1");
  s = must(s, { type: "basic_run", serverId: "hq" });
  return drive(s, (x) =>
    legalActions(x).some((a) => a.type === "access_trash_from_grip"),
  );
}

function useCarnivore(s: GameState): GameState {
  s = must(s, { type: "access_trash_from_grip" });
  for (const id of ["g-1", "g-2"]) {
    if (optionIds(s).includes(`cost-card:${id}`)) {
      s = must(s, { type: "choose_option", optionId: `cost-card:${id}` });
    }
  }
  return drive(s, atRunnerAction);
}

describe("Carnivore", () => {
  // Filed with René "Loup" Arcemont ruling 1 (area 8, sweep S1a): the
  // trash from Carnivore never triggers Loup.
  it.skip("Carnivore: its ability resolves in full, grip cards and accessed card trashed, before René \"Loup\" Arcemont's draw (ruling 1; filed, area 8, CR 9.3.2b: Carnivore's trash never triggers Loup)", () => {
    let s = runnerTurn(fresh(), 0);
    setIdentity(s, "runner", "rene-loup-arcemont-party-animal");
    for (const id of s.runner.deck) delete s.cards[id];
    s.runner.deck = [];
    put(s, "corroder", "top-1", "runner:stack");
    s.runner.deck.push("top-1");
    s.servers.hq.ice = [];
    installRunner(s, "carnivore", "carn-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    toHand(s, "runner", "diesel", "g-2");
    clearCorpHand(s);
    toHand(s, "corp", "pad-campaign", "hq-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "access_trash_from_grip"),
    );
    s = useCarnivore(s);
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["g-1", "g-2"]),
    );
    expect(s.runner.hand).toEqual(["top-1"]);
  });

  it("Carnivore: it trashes an accessed operation, which has no trash cost (ruling 2)", () => {
    const s = useCarnivore(carnivoreAccess("hedge-fund"));
    expect(s.corp.discardPile).toContain("hq-1");
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["g-1", "g-2"]),
    );
  });

  it("Carnivore: it trashes an accessed agenda, which ends the access, so the Runner does not steal it (ruling 3)", () => {
    const s = useCarnivore(carnivoreAccess("hostile-takeover"));
    expect(s.corp.discardPile).toContain("hq-1");
    expect(s.runner.scoreArea).not.toContain("hq-1");
  });

  // Filed with Ansel 1.0 ruling 3 (area 8, CR 1.2.2).
  it.skip("Carnivore: after Ansel 1.0's last subroutine resolves, it cannot trash accessed cards either (ruling 4; filed, area 8, CR 1.2.2: Carnivore's trash is still offered)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ansel-1-0", "ansel-1", "hq");
    installRunner(s, "carnivore", "carn-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    toHand(s, "runner", "diesel", "g-2");
    clearCorpHand(s);
    toHand(s, "corp", "pad-campaign", "pad-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
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
    expect(legalActions(s).map((a) => a.type)).not.toContain(
      "access_trash_from_grip",
    );
  });
});

// ---------------------------------------------------------------------------
// Docklands Pass
// ---------------------------------------------------------------------------

describe("Docklands Pass", () => {
  it("Docklands Pass: an HQ breach replaced by Security Testing's 2 credits is not a breach, so the next HQ breach gets the extra access (ruling 1)", () => {
    let s = centrals(runnerTurn(fresh(), 5));
    installRunner(s, "docklands-pass", "dp-1");
    installRunner(s, "security-testing", "st-1").namedServerId = "hq";
    s = must(s, { type: "basic_run", serverId: "hq" });
    const first = play(s);
    expect(first.accesses).toBe(0);
    expect(first.state.runner.credits).toBe(7);
    s = must(first.state, { type: "basic_run", serverId: "hq" });
    expect(play(s).accesses).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// DZMZ Optimizer
// ---------------------------------------------------------------------------

describe("DZMZ Optimizer", () => {
  it("DZMZ Optimizer: two of them stack, so the first program each turn costs 2 less (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    installRunner(s, "dzmz-optimizer", "dz-1");
    installRunner(s, "dzmz-optimizer", "dz-2");
    toHand(s, "runner", "corroder", "cor-1");
    toHand(s, "runner", "gordian-blade", "gb-1");
    s = must(s, {
      type: "basic_install",
      cardId: "cor-1",
      destination: { kind: "installed" },
    });
    // Corroder costs 2.
    expect(s.runner.credits).toBe(5);
    s = drive(s, atRunnerAction);
    s = must(s, {
      type: "basic_install",
      cardId: "gb-1",
      destination: { kind: "installed" },
    });
    // Gordian Blade costs 4, with no discount for the second program.
    expect(s.runner.credits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mâché
// ---------------------------------------------------------------------------

describe("Mâché", () => {
  it("Mâché: a card accessed and later trashed by Political Operative was not trashed on access, so no counters; trashing it on access does (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    installRunner(s, "mache", "ma-1");
    installRoot(s, "pad-campaign", "root-1", true);
    s = must(s, { type: "basic_run", serverId: "remote-root-1" as ServerId });
    s = play(s, (ids) => ids.find((id) => /no-trash|decline/i.test(id))).state;
    expect(s.servers["remote-root-1" as ServerId]?.root).toContain("root-1");
    // Then Political Operative trashes it, outside the access.
    installRunner(s, "political-operative", "po-1");
    s.timingKey = "runner.actionPaw";
    s = must(s, paidAbility(s, "po-1")!);
    if (s.pendingChoice) s = pick(s, "root-1");
    s = drive(s, atRunnerAction);
    expect(s.corp.discardPile).toContain("root-1");
    expect(s.cards["ma-1"]!.powerCounters ?? 0).toBe(0);

    // Control: trashing it on access places its trash cost of 4.
    let c = runnerTurn(fresh(), 10);
    installRunner(c, "mache", "ma-1");
    installRoot(c, "pad-campaign", "root-1", true);
    c = must(c, { type: "basic_run", serverId: "remote-root-1" as ServerId });
    c = drive(c, (x) =>
      legalActions(x).some(
        (a) => a.type === "trash_accessed" && a.cardId === "root-1",
      ),
    );
    c = must(c, { type: "trash_accessed", cardId: "root-1" });
    c = play(c, (ids) => ids.find((id) => id === "place-power")).state;
    expect(c.cards["ma-1"]!.powerCounters).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Mind's Eye
// ---------------------------------------------------------------------------

describe("Mind's Eye", () => {
  it("Mind's Eye: its breach of R&D takes eXer's additional access, but not the cards in R&D's root (ruling 1)", () => {
    let s = centrals(runnerTurn(fresh(), 5));
    installRunner(s, "minds-eye", "me-1").powerCounters = 3;
    installRunner(s, "exer", "ex-1");
    const up = put(s, "crisium-grid", "up-1", "server:rd:root");
    s.servers.rd.root.push("up-1");
    up.rezzed = false;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "me-1",
      abilityId: "minds-eye-breach-rd",
    });
    const { accesses, accessed } = play(s);
    expect(accesses).toBe(2);
    expect(accessed).not.toContain("up-1");
  });
});

// ---------------------------------------------------------------------------
// Pantograph
// ---------------------------------------------------------------------------

describe("Pantograph", () => {
  it("Pantograph: eXer installed after stealing the first R&D card is too late for that breach (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    s.servers.rd.ice = [];
    clearRd(s);
    stackRd(s, [
      ["hostile-takeover", "rd-1"],
      ["hedge-fund", "rd-2"],
      ["hedge-fund", "rd-3"],
    ]);
    installRunner(s, "pantograph", "pg-1");
    toHand(s, "runner", "exer", "ex-1");
    s = must(s, { type: "basic_run", serverId: "rd" });
    let accesses = 0;
    for (let i = 0; i < 80 && !atRunnerAction(s); i++) {
      if (s.pendingChoice) {
        const ids = optionIds(s);
        s = must(s, {
          type: "choose_option",
          optionId: ids.find((id) => id.includes("ex-1")) ?? ids[0]!,
        });
        continue;
      }
      const legal = legalActions(s);
      const next = WALK_ORDER.map((t) => legal.find((a) => a.type === t)).find(
        Boolean,
      )!;
      if (next.type === "access_card") accesses++;
      s = must(s, next);
    }
    expect(s.runner.scoreArea).toContain("rd-1");
    expect(s.runner.installed).toContain("ex-1");
    expect(accesses).toBe(1);
  });

  it("Pantograph: Mystic Maemi installed after an agenda is stolen was not active then, so it gets no credit (ruling 2)", () => {
    let s = runnerTurn(fresh(), 5);
    s.servers.hq.ice = [];
    clearCorpHand(s);
    toHand(s, "corp", "hostile-takeover", "hq-1");
    installRunner(s, "pantograph", "pg-1");
    toHand(s, "runner", "mystic-maemi", "mm-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = play(s, (ids) => ids.find((id) => id.includes("mm-1"))).state;
    expect(s.runner.scoreArea).toContain("hq-1");
    expect(s.runner.installed).toContain("mm-1");
    expect(s.cards["mm-1"]!.hostedCredits ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Patchwork
// ---------------------------------------------------------------------------

describe("Patchwork", () => {
  it("Patchwork: with only 3 credits the Runner may play Sure Gamble, trashing a grip card to pay 2 less (ruling 1)", () => {
    let s = runnerTurn(fresh(), 3);
    installRunner(s, "patchwork", "pw-1");
    toHand(s, "runner", "sure-gamble", "sg-1");
    toHand(s, "runner", "diesel", "g-1");
    s = must(s, {
      type: "play_event",
      cardId: "sg-1",
      trashGripForDiscountCardId: "g-1",
    });
    s = drive(s, atRunnerAction);
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["sg-1", "g-1"]),
    );
    expect(s.runner.credits).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Virtuoso
// ---------------------------------------------------------------------------

/** Virtuoso installed, the mark set to `mark` (as if identified). */
function virtuoso(mark: ServerId, credits = 5): GameState {
  const s = centrals(runnerTurn(fresh(), credits));
  installRunner(s, "virtuoso", "vir-1");
  placeMark(s, mark, "vir-1");
  return s;
}

describe("Virtuoso", () => {
  it("Virtuoso: the mark it identifies stays the Runner's mark after Virtuoso leaves play (ruling 1)", () => {
    let s = fresh();
    installRunner(s, "virtuoso", "vir-1");
    s = toRunnerTurn(s);
    const mark = currentMark(s);
    expect(mark).not.toBeNull();
    trashCard(s, "vir-1", { by: "runner" });
    expect(s.runner.discardPile).toContain("vir-1");
    expect(currentMark(s)).toBe(mark);
  });

  it("Virtuoso: installed with no mark, it gives the Runner no mark for the current turn (ruling 2)", () => {
    let s = runnerTurn(fresh(), 10);
    toHand(s, "runner", "virtuoso", "vir-1");
    s = must(s, {
      type: "basic_install",
      cardId: "vir-1",
      destination: { kind: "installed" },
    });
    expect(s.runner.installed).toContain("vir-1");
    expect(currentMark(s)).toBeNull();
  });

  it("Virtuoso: with two mark cards, the first instruction picks the mark and the second changes nothing (ruling 3)", () => {
    let s = fresh();
    installRunner(s, "virtuoso", "vir-1");
    installRunner(s, "backstitching", "bs-1");
    const start = s.log.length;
    s = toRunnerTurn(s);
    // The Runner orders the two turn-begin abilities.
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
      s = drive(s, atRunnerAction);
    }
    expect(currentMark(s)).not.toBeNull();
    expect(s.log.slice(start).join("\n")).toMatch(/already/);
  });

  it("Virtuoso: after a Jailbreak run on R&D as the mark, the HQ breach is not of the attacked server, so only R&D gets Jailbreak's extra card (ruling 4)", () => {
    let s = virtuoso("rd");
    for (let i = 1; i <= 3; i++) {
      put(s, "sure-gamble", `stk-${i}`, "runner:stack");
      s.runner.deck.unshift(`stk-${i}`);
    }
    toHand(s, "runner", "jailbreak", "jb-1");
    s = must(s, { type: "play_event", cardId: "jb-1", serverId: "rd" });
    const { accessed } = play(s);
    const hq = accessed.filter((id) => id.startsWith("hq-"));
    expect(hq).toHaveLength(1);
    expect(accessed).toHaveLength(3);
  });

  it("Virtuoso: Zahya Sadeghi counts only the accesses during the run, not those of Virtuoso's HQ breach after it (ruling 5)", () => {
    let s = virtuoso("rd", 0);
    setIdentity(s, "runner", "zahya-sadeghi-versatile-smuggler");
    s = must(s, { type: "basic_run", serverId: "rd" });
    const { state, accesses } = play(s, (ids) =>
      ids.find((id) => /gain|accept|yes/i.test(id)),
    );
    expect(accesses).toBe(2);
    expect(state.runner.credits).toBe(1);
  });

  it("Virtuoso: an unsuccessful run on the mark does not trigger the HQ breach (ruling 6)", () => {
    let s = virtuoso("rd");
    installIce(s, "ice-wall", "iw-1", "rd");
    s = must(s, { type: "basic_run", serverId: "rd" });
    const { state, accesses } = play(s);
    expect(state.log.join("\n")).toMatch(/End the run|ends the run/i);
    expect(accesses).toBe(0);
  });

  it("Virtuoso: a reinstalled Virtuoso does not trigger again on the second successful run on the mark that turn (ruling 7)", () => {
    let s = virtuoso("rd");
    s = must(s, { type: "basic_run", serverId: "rd" });
    const first = play(s);
    expect(first.accessed.filter((id) => id.startsWith("hq-"))).toHaveLength(1);
    s = first.state;
    trashCard(s, "vir-1", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    toHand(s, "runner", "virtuoso", "vir-2");
    s = must(s, {
      type: "basic_install",
      cardId: "vir-2",
      destination: { kind: "installed" },
    });
    s = drive(s, atRunnerAction);
    s = must(s, { type: "basic_run", serverId: "rd" });
    const second = play(s);
    expect(second.accessed.filter((id) => id.startsWith("hq-"))).toEqual([]);
  });

  it("Virtuoso: with Security Testing on R&D, the mark, the Runner gains 2 instead of breaching R&D and still breaches HQ after the run (ruling 8)", () => {
    let s = virtuoso("rd");
    installRunner(s, "security-testing", "st-1").namedServerId = "rd";
    s = must(s, { type: "basic_run", serverId: "rd" });
    const { state, accessed } = play(s);
    expect(state.runner.credits).toBe(7);
    expect(accessed).toHaveLength(1);
    expect(accessed[0]).toMatch(/^hq-/);
  });

  // Filed under area 14: after the run, Ganked!'s forced encounter with
  // Ice Wall resolves "End the run" as if a run were in progress ("Run
  // declared unsuccessful") and the breach stops, so the second HQ card
  // (Docklands Pass's extra access) is never accessed (CR 6.1.4b).
  it.skip('Virtuoso: during its HQ breach after the run, Ganked!\'s "End the run" ends only the forced encounter, and accessing goes on (ruling 9; filed, area 14, CR 6.1.4b: it ends the post-run breach)', () => {
    let s = virtuoso("rd", 10);
    clearCorpHand(s);
    toHand(s, "corp", "ganked", "gk-1");
    toHand(s, "corp", "hedge-fund", "hq-1");
    installRunner(s, "docklands-pass", "dp-1");
    installIce(s, "ice-wall", "iw-1", "hq");
    s.corp.credits = 5;
    s = must(s, { type: "basic_run", serverId: "rd" });
    const { accessed } = play(
      s,
      (ids) =>
        ids.find((id) => id.includes("iw-1")) ??
        ids.find((id) => /trash-encounter/.test(id)),
    );
    expect(accessed).toEqual(expect.arrayContaining(["gk-1", "hq-1"]));
  });

  it("Virtuoso: with The Twinning and R&D as the mark, The Twinning may add 2 accesses to each breach, R&D's and HQ's (ruling 10)", () => {
    let s = virtuoso("rd");
    clearCorpHand(s);
    for (let i = 1; i <= 4; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
    stackRd(s, [
      ["hedge-fund", "rd-a"],
      ["hedge-fund", "rd-b"],
    ]);
    installRunner(s, "the-twinning", "tw-1").powerCounters = 4;
    s = must(s, { type: "basic_run", serverId: "rd" });
    const { state, accesses } = play(s, (ids) =>
      ids.find((id) => /2/.test(id)),
    );
    expect(state.cards["tw-1"]!.powerCounters ?? 0).toBe(0);
    expect(accesses).toBe(6);
  });

  it("Virtuoso: its HQ breach is the first HQ breach that turn, so Docklands Pass adds an access (ruling 11)", () => {
    let s = virtuoso("rd");
    installRunner(s, "docklands-pass", "dp-1");
    s = must(s, { type: "basic_run", serverId: "rd" });
    const { accessed } = play(s);
    expect(accessed.filter((id) => id.startsWith("hq-"))).toHaveLength(2);
  });
});

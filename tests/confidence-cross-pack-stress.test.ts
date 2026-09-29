/**
 * Cross-pack stress pairs: same matrix classes as interaction smoke, but
 * Role A and Role B from different Gateway→VP packs.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  abilitiesSuppressed,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  CR,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  legalActions,
  queryLegality,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.59.0");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("cross-pack — blank × host: Hush (Parhelion) × Magnet (SU21)", () => {
  it("Hush blanks Magnet abilities; Magnet hosted-blank loses to Hush (9.12)", () => {
    expect(getCardDef("hush").wave).toBe("parhelion");
    expect(getCardDef("magnet").wave).toBe("system-update-2021");

    let s = createInitialState();
    s = structuredClone(s);
    const magnet = instantiateCard("magnet", "mag-1", "server:hq:ice");
    magnet.rezzed = true;
    magnet.hostedProgramsLoseAbilities = true;
    s.cards["mag-1"] = magnet;
    s.servers.hq.ice = ["mag-1"];
    const hush = instantiateCard("hush", "hush-1", "runner:rig");
    hush.hostId = "mag-1";
    hush.blanksHostAbilities = true;
    hush.abilitiesBlanked = true; // Magnet would set; Hush-wins solver
    s.cards["hush-1"] = hush;
    s.runner.rig = ["hush-1"];

    expect(abilitiesSuppressed(s, "mag-1")).toBe(true);
    expect(abilitiesSuppressed(s, "hush-1")).toBe(false);
    expect((s.cards["mag-1"].subroutines ?? []).length).toBeGreaterThan(0);
  });
});

describe("cross-pack — success ternary: Flagship (VP) × Phoneutria (TAI)", () => {
  it("blocked success is not run_unsuccessful for on-pass / cond (6.8.4a)", () => {
    expect(getCardDef("flagship").wave).toBe("vantage-point");
    expect(getCardDef("phoneutria").wave).toBe("the-automata-initiative");

    let s = createInitialState();
    s = structuredClone(s);
    const up = instantiateCard("flagship", "up-1", "server:hq:root");
    up.rezzed = true;
    up.faceup = true;
    s.cards["up-1"] = up;
    s.servers.hq.root = ["up-1"];
    s.servers.hq.ice = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    const mid = structuredClone(s);
    mid.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
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
    const ph = instantiateCard("phoneutria", "ph-1", "server:hq:ice");
    mid.cards["ph-1"] = ph;
    expect(
      evalEffect(
        { state: mid, sourceId: "ph-1" },
        {
          op: "if",
          cond: { op: "run_unsuccessful" },
          then: fx.do({ kind: "give_tags", amount: 1 }),
        },
      ).ok,
    ).toBe(true);
    expect(mid.runner.tags).toBe(0);

    s = must(s, { type: "basic_run", serverId: "hq" });
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(false);
    expect(
      s.log.some((l) =>
        l.includes(CR.notUnsuccessfulWhenReachedSuccessPhase.number),
      ),
    ).toBe(true);
  });
});

describe("cross-pack — prevent × cost: AirbladeX (TAI) × Funhouse nested (Gateway)", () => {
  it("happy: AirbladeX opens net-damage interrupt during a run", () => {
    expect(getCardDef("airbladex-jsrf-ed").wave).toBe(
      "the-automata-initiative",
    );
    expect(getCardDef("funhouse").wave).toBe("system-gateway");

    let s = createInitialState();
    s = structuredClone(s);
    const abx = instantiateCard("airbladex-jsrf-ed", "abx", "runner:rig");
    abx.powerCounters = 2;
    s.cards["abx"] = abx;
    s.runner.rig = ["abx"];
    s.runner.hand = ["h1", "h2"];
    for (const id of ["h1", "h2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
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

    expect(evalEffect({ state: s, sourceId: "src" }, fx.netDamage(1)).ok).toBe(
      true,
    );
    expect(s.pendingDamage).toMatchObject({ type: "net", remaining: 1 });
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "abx" &&
          a.abilityId === "airblade-prevent-damage",
      ),
    ).toBe(true);
  });

  it("failure: Funhouse nested tag cost unpayable under Jesminder-class prevent → ETR", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.cards[s.runner.identityId]!.preventFirstTagThisTurn = true;
    s.turn.tagsGivenThisTurn = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "fh-1",
        broken: [false],
        strengthBoost: 0,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.cards["fh-1"] = instantiateCard("funhouse", "fh-1", "server:hq:ice");
    s.cards["fh-1"].rezzed = true;

    expect(
      evalEffect(
        { state: s, sourceId: "fh-1" },
        {
          op: "do",
          action: { kind: "end_the_run_unless_take_tags", amount: 1 },
        },
      ).ok,
    ).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.run?.endedTheRun).toBe(true);
    expect(s.runner.tags).toBe(0);
    expect(s.log.some((l) => l.includes("1.16.1b"))).toBe(true);
  });
});

describe("cross-pack — cannot × score: Clot (SU21) × Offworld Office (Gateway)", () => {
  it("Clot drops score_agenda from legality for agenda installed this turn", () => {
    expect(getCardDef("clot").wave).toBe("system-update-2021");
    expect(getCardDef("offworld-office").wave).toBe("system-gateway");

    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard(
      "offworld-office",
      "ag-1",
      "server:remote-1:root",
    );
    ag.advancementTokens = 4;
    s.cards["ag-1"] = ag;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    s.nextRemoteNumber = 2;
    s.turn.installedThisTurn = ["ag-1"];
    const clot = instantiateCard("clot", "clot-1", "runner:rig");
    s.cards["clot-1"] = clot;
    s.runner.rig = ["clot-1"];
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 3;

    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "ag-1",
      ),
    ).toBe(false);
    const blocked = applyAction(s, { type: "score_agenda", cardId: "ag-1" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toMatch(/Clot/);
    expect(blocked.cites.map((c) => c.id)).toContain(CR.scoringAgenda.id);
  });
});

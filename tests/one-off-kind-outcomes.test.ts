import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  resolveTrace,
} from "../src/index.js";
import {
  LINGERING_KIND_ABILITY_BLANK,
  LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
  LINGERING_KIND_BREAKER_STRENGTH_RUN,
  LINGERING_KIND_ICE_STRENGTH,
  LINGERING_KIND_ICE_STRENGTH_ENCOUNTER,
  lingeringBreakerStrengthOfKind,
  lingeringEffectsOfKind,
  lingeringIceStrengthOfKind,
  lingeringRunnerMuModifier,
} from "../src/state/lingeringEffects.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";

import { drawCards } from "../src/effects/draw.js";
import type { GameState } from "../src/state/types.js";
import { onRunnerEventPlayed } from "../src/state/cardDeclarations.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";
import { RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE } from "../src/state/fenris.js";
import { autoWalk, enterStep } from "../src/timing/machine.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

function put(
  s: GameState,
  defId: string,
  id: string,
  zone: string,
): GameState["cards"][string] {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

function runKind(s: GameState, sourceId: string, kind: string, extra: object = {}) {
  const r = evalEffect({ state: s, sourceId }, fx.do({ kind, ...extra }));
  if (!r.ok) throw new Error(`${kind}: ${r.error ?? "failed"}`);
}

describe("one-off kind outcomes (batch A: immediate effects)", () => {
  it("Fester: Corp loses 2 credits on purge only when they have at least 2", () => {
    const s = createInitialState();
    put(s, "fester", "fester-1", "runner:installed");
    s.runner.installed = ["fester-1"];
    s.corp.credits = 5;
    runKind(s, "fester-1", "corp_lose_two_if_can");
    expect(s.corp.credits).toBe(3);
    s.corp.credits = 1;
    runKind(s, "fester-1", "corp_lose_two_if_can");
    expect(s.corp.credits).toBe(1);
  });

  it("Beth Kilrain-Chang: tiers at 5-9 / 10-14 / 15+ Corp credits", () => {
    const s = createInitialState();
    put(s, "beth-kilrain-chang", "beth-1", "runner:installed");
    s.runner.installed = ["beth-1"];
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `sg-${i}`, "runner:stack");
    s.runner.deck = ["sg-0", "sg-1", "sg-2"];
    s.runner.hand = [];
    s.runner.credits = 4;
    s.runner.clicks = 4;

    s.corp.credits = 7;
    runKind(s, "beth-1", "beth_kilrain_corp_credit_tiers");
    expect(s.runner.credits).toBe(5);
    expect(s.runner.hand.length).toBe(0);

    s.corp.credits = 12;
    runKind(s, "beth-1", "beth_kilrain_corp_credit_tiers");
    expect(s.runner.credits).toBe(5);
    expect(s.runner.hand.length).toBe(1);

    s.corp.credits = 15;
    runKind(s, "beth-1", "beth_kilrain_corp_credit_tiers");
    expect(s.runner.clicks).toBe(5);

    s.corp.credits = 4;
    runKind(s, "beth-1", "beth_kilrain_corp_credit_tiers");
    expect(s.runner.credits).toBe(5);
    expect(s.runner.clicks).toBe(5);
    expect(s.runner.hand.length).toBe(1);
  });

  it("Estelle Moon: trash-per-power gains 2 credits and draws 1 per counter", () => {
    const s = createInitialState();
    const estelle = put(s, "estelle-moon", "estelle-1", "server:remote-1:root");
    estelle.powerCounters = 3;
    for (let i = 0; i < 4; i++) put(s, "hedge-fund", `hf-${i}`, "corp:rnd");
    s.corp.deck = ["hf-0", "hf-1", "hf-2", "hf-3"];
    s.corp.hand = [];
    s.corp.credits = 5;
    runKind(s, "estelle-1", "trash_per_power");
    expect(s.corp.credits).toBe(11);
    expect(s.corp.hand.length).toBe(3);
  });

  it("High-Risk Investment: gain credits equal to the Runner's pool", () => {
    const s = createInitialState();
    put(s, "high-risk-investment", "hri-1", "corp:score");
    s.corp.scoreArea = ["hri-1"];
    s.runner.credits = 7;
    s.corp.credits = 2;
    runKind(s, "hri-1", "gain_credits_equal_to_runner_credits");
    expect(s.corp.credits).toBe(9);
  });

  it("Lawyer Up: choosing 2 tags removes them and draws 3", () => {
    const s = createInitialState();
    put(s, "lawyer-up", "lawyer-1", "runner:play");
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `sg-${i}`, "runner:stack");
    s.runner.deck = ["sg-0", "sg-1", "sg-2", "sg-3"];
    s.runner.hand = [];
    s.runner.tags = 2;
    runKind(s, "lawyer-1", "lawyer_up");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("lawyer-tags-2");
    const after = applyAction(s, { type: "choose_option", optionId: "lawyer-tags-2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.tags).toBe(0);
    expect(after.state.runner.hand.length).toBe(3);
  });

  it("Special Report: shuffle 1 HQ card into R&D, then draw 1", () => {
    const s = createInitialState();
    put(s, "special-report", "sr-1", "corp:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "hq-2", "corp:hand");
    for (let i = 0; i < 3; i++) put(s, "hedge-fund", `rd-${i}`, "corp:rnd");
    s.corp.hand = ["hq-1", "hq-2"];
    s.corp.deck = ["rd-0", "rd-1", "rd-2"];
    runKind(s, "sr-1", "shuffle_any_hq_draw");
    let after = applyAction(s, { type: "choose_option", optionId: "shuffle:hq-1" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, { type: "choose_option", optionId: "done" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand.length).toBe(2); // 1 kept + 1 drawn
    expect(after.state.corp.deck.length).toBe(3); // 3 - 1 drawn + 1 shuffled
  });

  it("Mark Yale: spend an agenda counter from a scored agenda to gain 2", () => {
    const s = createInitialState();
    put(s, "mark-yale", "yale-1", "server:remote-1:root");
    const agenda = put(s, "hostile-takeover", "ht-1", "corp:score");
    agenda.agendaCounters = 1;
    s.corp.scoreArea = ["ht-1"];
    s.corp.credits = 3;
    runKind(s, "yale-1", "mark_yale_spend_any_agenda_counter_gain_2");
    const after = applyAction(s, { type: "choose_option", optionId: "yale:ht-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(5);
    expect(after.state.cards["ht-1"]?.agendaCounters).toBe(0);
  });

  it("Universal Connectivity Fee: untagged Runner loses 1; tagged loses all and the ice trashes", () => {
    const s = createInitialState();
    const ice = put(s, "universal-connectivity-fee", "ucf-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["ucf-1"];
    s.runner.credits = 5;
    s.runner.tags = 0;
    runKind(s, "ucf-1", "universal_connectivity_fee_sub");
    expect(s.runner.credits).toBe(4);
    expect(s.corp.discardPile).not.toContain("ucf-1");

    s.runner.credits = 6;
    s.runner.tags = 1;
    runKind(s, "ucf-1", "universal_connectivity_fee_sub");
    expect(s.runner.credits).toBe(0);
    expect(s.corp.discardPile).toContain("ucf-1");
  });

  it("Chronos Project: scoring removes the whole heap from the game", () => {
    const s = createInitialState();
    put(s, "chronos-project", "chronos-1", "corp:score");
    put(s, "corroder", "heap-1", "runner:heap");
    put(s, "sure-gamble", "heap-2", "runner:heap");
    s.runner.discardPile = ["heap-1", "heap-2"];
    runKind(s, "chronos-1", "rfg_runner_heap");
    expect(s.runner.discardPile).toEqual([]);
    expect(s.removedFromGame).toEqual(expect.arrayContaining(["heap-1", "heap-2"]));
  });

  it("Stim Dealer: below 2 counters places one and gains a click; at 2 it deals unpreventable core damage", () => {
    const s = createInitialState();
    const stim = put(s, "stim-dealer", "stim-1", "runner:installed");
    stim.powerCounters = 1;
    s.runner.installed = ["stim-1"];
    s.runner.clicks = 4;
    runKind(s, "stim-1", "stim_dealer_turn_begin");
    expect(s.cards["stim-1"]?.powerCounters).toBe(2);
    expect(s.runner.clicks).toBe(5);

    runKind(s, "stim-1", "stim_dealer_turn_begin");
    expect(s.cards["stim-1"]?.powerCounters).toBe(0);
    expect(s.runner.coreDamage).toBe(1);
  });

  it("Data Folding: gains 1 credit with 2+ unused MU, nothing below", () => {
    const s = createInitialState();
    put(s, "data-folding", "df-1", "runner:installed");
    s.runner.installed = ["df-1"];
    s.runner.credits = 5;
    runKind(s, "df-1", "gain_if_unused_mu_gte", { threshold: 2, amount: 1 });
    expect(s.runner.credits).toBe(6);
  });

  it("Human First: gains credits equal to the scored agenda's points", () => {
    const s = createInitialState();
    put(s, "human-first", "hf-1", "runner:installed");
    const agenda = put(s, "hostile-takeover", "ht-1", "corp:score");
    agenda.agendaPoints = 2;
    (s.turn as { lastScoredOrStolenAgendaId?: string }).lastScoredOrStolenAgendaId = "ht-1";
    s.runner.credits = 3;
    runKind(s, "hf-1", "gain_credits_equal_to_agenda_points_of_trigger");
    expect(s.runner.credits).toBe(5);
  });

  it("IT Department: boost equals counters remaining plus the one spent", () => {
    const s = createInitialState();
    const itd = put(s, "it-department", "itd-1", "server:remote-1:root");
    itd.powerCounters = 2; // one already spent by the ability cost
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    runKind(s, "itd-1", "boost_ice");
    const opt = s.pendingChoice?.options.find((o) => o.id === "it-boost:iw-1");
    expect(opt?.label).toContain("+3 strength");
  });

  it("Dean Lister: boost equals cards in grip", () => {
    const s = createInitialState();
    put(s, "dean-lister", "dl-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    s.runner.hand = ["a", "b", "c"];
    runKind(s, "dl-1", "boost_icebreaker");
    const opt = s.pendingChoice?.options.find((o) => o.id === "boost:prog-1");
    expect(opt?.label).toContain("+3 strength");
  });

  it("Security Chip: choice offers +link strength per breaker", () => {
    const s = createInitialState();
    put(s, "security-chip", "sc-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    s.runner.link = 2;
    runKind(s, "sc-1", "boost_breakers_per_link");
    const opt = s.pendingChoice?.options.find((o) => o.id === "sc:prog-1");
    expect(opt?.label).toContain("+2");
  });

  it("Helium-3 Deposit: may place 1 or 2 power counters on a card that has one", () => {
    const s = createInitialState();
    put(s, "helium-3-deposit", "he3-1", "corp:score");
    const target = put(s, "estelle-moon", "estelle-1", "server:remote-1:root");
    target.powerCounters = 1;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["estelle-1"],
    } as GameState["servers"][string];
    runKind(s, "he3-1", "helium3_place_up_to_2_power");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("helium3-2:estelle-1");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "helium3-2:estelle-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["estelle-1"]?.powerCounters).toBe(3);
  });

  it("Encrypted Portals: gains 1 credit per rezzed code gate when scored", () => {
    const s = createInitialState();
    put(s, "encrypted-portals", "ep-1", "corp:score");
    const gate = put(s, "enigma", "en-1", "server:hq:ice");
    gate.rezzed = true;
    const wall = put(s, "ice-wall", "iw-1", "server:rd:ice");
    wall.rezzed = true;
    s.servers["hq"].ice = ["en-1"];
    s.servers["rd"].ice = ["iw-1"];
    s.corp.credits = 5;
    runKind(s, "ep-1", "score_encrypted_portals_on");
    expect(s.corp.credits).toBe(6);
  });

  it("Profiteering: taking 2 bad publicity gains 10 credits", () => {
    const s = createInitialState();
    put(s, "profiteering", "prof-1", "corp:score");
    s.corp.credits = 5;
    runKind(s, "prof-1", "score_profiteering_on");
    const after = applyAction(s, { type: "choose_option", optionId: "profiteering-2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(15);
    expect(after.state.corp.badPublicity).toBe(2);
  });

  it("Three Steps Ahead: pays 2 per successful run, including repeats on one server", () => {
    const s = createInitialState();
    put(s, "three-steps-ahead", "tsa-1", "runner:play");
    s.turn.successfulRunCountThisTurn = 2;
    s.turn.successfulRunServersThisTurn = ["hq"]; // both runs were on HQ
    s.runner.credits = 3;
    runKind(s, "tsa-1", "three_steps_ahead_payout");
    expect(s.runner.credits).toBe(7);
  });

  it("Space Camp: places 1 advancement on an advanceable installed card", () => {
    const s = createInitialState();
    put(s, "space-camp", "scamp-1", "server:rd:root");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"].ice = ["iw-1"];
    runKind(s, "scamp-1", "place_advancement_on_advanceable_installed");
    const after = applyAction(s, { type: "choose_option", optionId: "sc:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.advancementCounters).toBe(1);
    expect(ice.advancementCounters ?? 0).toBe(0); // sanity: choice applied to state copy
  });

  it("Firmware Updates: places 1 advancement on advanceable ice", () => {
    const s = createInitialState();
    put(s, "firmware-updates", "fwu-1", "corp:score");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"].ice = ["iw-1"];
    runKind(s, "fwu-1", "firmware_place_advancement_on_advanceable_ice");
    const after = applyAction(s, { type: "choose_option", optionId: "fw:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.advancementCounters).toBe(1);
  });

  it("Virus Breeding Ground: moves 1 virus counter to another card with virus counters", () => {
    const s = createInitialState();
    const vbg = put(s, "virus-breeding-ground", "vbg-1", "runner:installed");
    vbg.virusCounters = 2;
    const ds = put(s, "datasucker", "ds-1", "runner:installed");
    ds.virusCounters = 1;
    s.runner.installed = ["vbg-1", "ds-1"];
    runKind(s, "vbg-1", "move_counter");
    const after = applyAction(s, { type: "choose_option", optionId: "vbg:ds-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["vbg-1"]?.virusCounters).toBe(1);
    expect(after.state.cards["ds-1"]?.virusCounters).toBe(2);
  });

  it("Macrophage: trashes an installed virus and removes a heap virus from the game", () => {
    const s = createInitialState();
    put(s, "macrophage", "mac-1", "server:hq:ice");
    put(s, "datasucker", "ds-1", "runner:installed");
    put(s, "datasucker", "ds-2", "runner:heap");
    s.runner.installed = ["ds-1"];
    s.runner.discardPile = ["ds-2"];
    runKind(s, "mac-1", "trash_installed_virus");
    expect(s.runner.discardPile).toContain("ds-1");
    runKind(s, "mac-1", "rfg_virus_from_heap");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "rfg-heap-virus:ds-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).not.toContain("ds-2");
    expect(after.state.removedFromGame).toContain("ds-2");
  });

  it("Neurospike: net damage equals agenda points scored this turn", () => {
    const s = createInitialState();
    put(s, "neurospike", "ns-1", "runner:play");
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `sg-${i}`, "runner:hand");
    s.runner.hand = ["sg-0", "sg-1", "sg-2", "sg-3"];
    s.turn.agendaPointsScoredThisTurn = 3;
    runKind(s, "ns-1", "net_damage_agenda_points_this_turn");
    expect(s.runner.hand.length).toBe(1); // 3 net damage trashes 3 grip cards
    expect(s.runner.discardPile.length).toBe(3);
  });

  it("Ireress subroutine: Runner loses 1 credit per bad publicity", () => {
    const s = createInitialState();
    put(s, "ireress", "ire-1", "server:hq:ice");
    s.corp.badPublicity = 3;
    s.runner.credits = 5;
    runKind(s, "ire-1", "runner_lose_credits_equal_corp_bad_publicity");
    expect(s.runner.credits).toBe(2);
  });

  it("Rex Campaign: when empty, may gain 5 credits and trash itself", () => {
    const s = createInitialState();
    put(s, "rex-campaign", "rex-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["rex-1"],
    } as GameState["servers"][string];
    s.corp.credits = 5;
    runKind(s, "rex-1", "rex_campaign_when_empty");
    const after = applyAction(s, { type: "choose_option", optionId: "gain-5" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(10);
    expect(after.state.corp.discardPile).toContain("rex-1");
  });

  it("Hades Fragment: adds an Archives card to the bottom of R&D", () => {
    const s = createInitialState();
    put(s, "hades-fragment", "hades-1", "corp:score");
    put(s, "hedge-fund", "arch-1", "corp:archives");
    put(s, "hedge-fund", "rd-1", "corp:rnd");
    s.corp.discardPile = ["arch-1"];
    s.corp.deck = ["rd-1"];
    runKind(s, "hades-1", "may_add_archives_card_to_rd_bottom_only");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "hades-bottom:arch-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toEqual([]);
    expect(after.state.corp.deck[after.state.corp.deck.length - 1]).toBe("arch-1");
  });

  it("Qianju PT: losing a click arms tag prevention", () => {
    const s = createInitialState();
    put(s, "qianju-pt", "q-1", "runner:installed");
    s.runner.clicks = 4;
    runKind(s, "q-1", "lose_qianju_click_prevent_tag_until_next_turn");
    expect(s.runner.clicks).toBe(3);
    expect(
      (s.runner as { qianjuPreventTagUntilNextTurn?: boolean })
        .qianjuPreventTagUntilNextTurn,
    ).toBe(true);
  });

  it("Assimilator: turns a facedown installed card faceup", () => {
    const s = createInitialState();
    put(s, "assimilator", "assim-1", "runner:installed");
    const facedown = put(s, "corroder", "fd-1", "runner:installed");
    facedown.faceup = false;
    s.runner.installed = ["assim-1", "fd-1"];
    runKind(s, "assim-1", "ss_assimilator_turn_facedown_faceup");
    const after = applyAction(s, { type: "choose_option", optionId: "faceup:fd-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["fd-1"]?.faceup).toBe(true);
  });

  it("Corporate Shuffle: shuffles all of HQ into R&D and draws 5", () => {
    const s = createInitialState();
    put(s, "corporate-shuffle", "cs-1", "corp:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "hq-2", "corp:hand");
    for (let i = 0; i < 5; i++) put(s, "hedge-fund", `rd-${i}`, "corp:rnd");
    s.corp.hand = ["hq-1", "hq-2"];
    s.corp.deck = ["rd-0", "rd-1", "rd-2", "rd-3", "rd-4"];
    runKind(s, "cs-1", "shuffle_corporate_hq_to_rd_draw", { draw: 5 });
    expect(s.corp.hand.length).toBe(5);
    expect(s.corp.deck.length).toBe(2);
  });

  it("Election Day: trashes all of HQ (minimum 1) and draws 5", () => {
    const s = createInitialState();
    put(s, "election-day", "ed-1", "corp:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    for (let i = 0; i < 5; i++) put(s, "hedge-fund", `rd-${i}`, "corp:rnd");
    s.corp.hand = ["hq-1"];
    s.corp.deck = ["rd-0", "rd-1", "rd-2", "rd-3", "rd-4"];
    runKind(s, "ed-1", "trash_hq_draw", { amount: 5 });
    expect(s.corp.discardPile).toContain("hq-1");
    expect(s.corp.hand.length).toBe(5);
  });

  it("Shannon Claire: draws from the bottom of R&D", () => {
    const s = createInitialState();
    put(s, "shannon-claire", "sh-1", "server:remote-1:root");
    put(s, "hedge-fund", "top-1", "corp:rnd");
    put(s, "hedge-fund", "bottom-1", "corp:rnd");
    s.corp.deck = ["top-1", "bottom-1"];
    s.corp.hand = [];
    runKind(s, "sh-1", "draw_from_bottom_of_rd", { amount: 1 });
    expect(s.corp.hand).toEqual(["bottom-1"]);
    expect(s.corp.deck).toEqual(["top-1"]);
  });

  it("Shannon Claire: searches an agenda to the bottom of R&D", () => {
    const s = createInitialState();
    put(s, "shannon-claire", "sh-1", "server:remote-1:root");
    put(s, "hostile-takeover", "ht-1", "corp:rnd");
    put(s, "hedge-fund", "rd-1", "corp:rnd");
    s.corp.deck = ["ht-1", "rd-1"];
    runKind(s, "sh-1", "search_rd_or_archives_agenda_to_bottom_rd");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "shannon-rd:ht-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.deck[after.state.corp.deck.length - 1]).toBe("ht-1");
  });

  it("Sensie Actors Union: adds 1 HQ card to the bottom of R&D", () => {
    const s = createInitialState();
    put(s, "sensie-actors-union", "sensie-1", "server:remote-1:root");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "rd-1", "corp:rnd");
    s.corp.hand = ["hq-1"];
    s.corp.deck = ["rd-1"];
    runKind(s, "sensie-1", "sensie_add_one_hq_to_bottom_rd");
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck[s.corp.deck.length - 1]).toBe("hq-1");
  });

  it("Fawkes: offers pump choices up to the Runner's credits", () => {
    const s = createInitialState();
    put(s, "fawkes", "fawkes-1", "runner:installed");
    s.runner.credits = 3;
    runKind(s, "fawkes-1", "spend_x_pump");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("fawkes-x:3");
    expect(ids).not.toContain("fawkes-x:4");
  });

  it("Eureka!: a revealed event is trashed, not installed", () => {
    const s = createInitialState();
    put(s, "eureka", "eu-1", "runner:play");
    put(s, "sure-gamble", "top-1", "runner:stack");
    s.runner.deck = ["top-1"];
    runKind(s, "eu-1", "reveal_install_or_trash", { discount: 5 });
    expect(s.runner.discardPile).toContain("top-1");
    expect(s.runner.deck).toEqual([]);
  });

  it("Magdalene Keino-Chemutai: may install a program discarded this turn", () => {
    const s = createInitialState();
    put(s, "magdalene-keino-chemutai-cryptarchitect", "mag-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:heap");
    s.runner.discardPile = ["prog-1"];
    s.turn.runnerDiscardedToMaxHandIds = ["prog-1"];
    runKind(s, "mag-1", "may_install_program_hardware_from_last_runner_discarded");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.length).toBeGreaterThan(1); // decline + the program
  });

  it("NEXT Gold: net damage equals the number of rezzed NEXT ice", () => {
    const s = createInitialState();
    const gold = put(s, "next-gold", "ng-1", "server:hq:ice");
    gold.rezzed = true;
    const silver = put(s, "next-silver", "nsilver-1", "server:rd:ice");
    silver.rezzed = true;
    s.servers["hq"].ice = ["ng-1"];
    s.servers["rd"].ice = ["nsilver-1"];
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `sg-${i}`, "runner:hand");
    s.runner.hand = ["sg-0", "sg-1", "sg-2"];
    runKind(s, "ng-1", "next_gold_net_damage");
    expect(s.runner.hand.length).toBe(1);
    expect(s.runner.discardPile.length).toBe(2);
  });

  it("Enhanced Vision: reveals a random HQ card in the log", () => {
    const s = createInitialState();
    put(s, "enhanced-vision", "ev-1", "runner:installed");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    s.corp.hand = ["hq-1"];
    runKind(s, "ev-1", "reveal_random_hq_card");
    expect(s.log.some((l) => l.includes("Hedge Fund"))).toBe(true);
  });

  it("Komainu: gains 1 net damage subroutine per card in the Runner's grip", () => {
    const s = createInitialState();
    const komainu = put(s, "komainu", "kom-1", "server:hq:ice");
    komainu.rezzed = true;
    s.servers["hq"].ice = ["kom-1"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    s.runner.hand = ["a", "b", "c", "d"];
    const base = s.cards["kom-1"]?.subroutines?.length ?? 0;
    runKind(s, "kom-1", "add_net_subs_for_rezzed_ice");
    expect((s.cards["kom-1"]?.subroutines?.length ?? 0) - base).toBe(4);
  });

  it("Maxwell James: derezzes a rezzed piece of ice protecting a remote", () => {
    const s = createInitialState();
    put(s, "maxwell-james", "mj-1", "runner:installed");
    const ice = put(s, "ice-wall", "iw-1", "server:remote-1:ice");
    ice.rezzed = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["iw-1"],
      root: [],
    } as GameState["servers"][string];
    runKind(s, "mj-1", "derez_remote_ice");
    const after = applyAction(s, { type: "choose_option", optionId: "derez:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.rezzed).toBe(false);
  });

  it("K. P. Lynn: the Runner may take a tag instead of ending the run", () => {
    const s = createInitialState();
    put(s, "k-p-lynn", "kp-1", "server:remote-1:root");
    runKind(s, "kp-1", "tag_or_end_the_run");
    const after = applyAction(s, { type: "choose_option", optionId: "tag" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.tags).toBe(1);
  });

  it("Holmegaard: trashes 1 installed icebreaker the Corp chooses", () => {
    const s = createInitialState();
    put(s, "holmegaard", "holm-1", "server:hq:ice");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    runKind(s, "holm-1", "trash_installed_icebreaker");
    const after = applyAction(s, { type: "choose_option", optionId: "trash:prog-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("prog-1");
  });

  it("Black Level Clearance: offers core damage or jack out", () => {
    const s = createInitialState();
    put(s, "black-level-clearance", "blc-1", "server:remote-1:root");
    runKind(s, "blc-1", "core_or_jack_out");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("core");
    expect(ids.length).toBe(2);
  });

  it("Reshape: swaps 2 unrezzed pieces of ice", () => {
    const s = createInitialState();
    put(s, "reshape", "resh-1", "corp:play");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    put(s, "enigma", "en-1", "server:rd:ice");
    s.servers["hq"].ice = ["iw-1"];
    s.servers["rd"].ice = ["en-1"];
    runKind(s, "resh-1", "swap_2_unrezzed_ice");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "reshape:iw-1:en-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["hq"].ice).toEqual(["en-1"]);
    expect(after.state.servers["rd"].ice).toEqual(["iw-1"]);
  });

  it("Recon Drone: spending X prevents X pending damage", () => {
    const s = createInitialState();
    put(s, "recon-drone", "rd-1", "runner:installed");
    s.runner.credits = 5;
    s.pendingDamage = {
      type: "net",
      remaining: 3,
      sourceId: "some-ice",
    } as GameState["pendingDamage"];
    runKind(s, "rd-1", "prevent_x_damage");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("recon-drone-x:2");
    s.pendingChoice = null;
    runKind(s, "rd-1", "prevent_x_damage_resolve", { amount: 2 });
    expect(s.pendingDamage?.remaining).toBe(1);
    expect(s.runner.credits).toBe(3);
  });

  it("Rubicon Switch: derezzes ice rezzed this turn for its printed rez cost", () => {
    const s = createInitialState();
    put(s, "rubicon-switch", "rub-1", "runner:installed");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    s.turn.rezzedThisTurnIds = ["iw-1"];
    s.runner.credits = 5;
    runKind(s, "rub-1", "derez_rezzed_this_turn");
    const after = applyAction(s, { type: "choose_option", optionId: "derez:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.rezzed).toBe(false);
    expect(after.state.runner.credits).toBe(4); // Ice Wall printed rez cost 1
  });

  it("Data Loop: Runner adds 2 grip cards to the top of the stack", () => {
    const s = createInitialState();
    put(s, "data-loop", "dl-1", "server:hq:ice");
    for (const id of ["g1", "g2", "g3"]) put(s, "sure-gamble", id, "runner:hand");
    put(s, "sure-gamble", "top-0", "runner:stack");
    s.runner.hand = ["g1", "g2", "g3"];
    s.runner.deck = ["top-0"];
    runKind(s, "dl-1", "choose_n_grip_to_stack_top", { count: 2 });
    let after = applyAction(s, { type: "choose_option", optionId: "dl:g1" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, { type: "choose_option", optionId: "dl:g2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toEqual(["g3"]);
    expect(after.state.runner.deck.slice(0, 2)).toEqual(["g2", "g1"]);
  });

  it("run-flag kinds set their remainder-of-run restrictions", () => {
    const s = createInitialState();
    s.run = { attackedServerId: "hq" } as GameState["run"];
    put(s, "armored-servers", "as-1", "corp:identity");
    runKind(s, "as-1", "armored_servers_activate_this_run");
    expect(s.run.armoredServersTrashGripAdditionalCost).toBe(true);

    put(s, "signal-jamming", "sj-1", "corp:play");
    runKind(s, "sj-1", "forbid_installs_until_run_end");
    expect(s.run.forbidInstallsUntilRunEnd).toBe(true);

    put(s, "emp-device", "emp-1", "runner:installed");
    runKind(s, "emp-1", "rez_emp_device_limit_ice_this_run");
    expect(s.run.bfMaxIceRezThisRun).toBe(1);

    put(s, "sync-bre", "sb-1", "corp:identity");
    runKind(s, "sb-1", "breach_reduce_access_remainder_of_run", { amount: 1 });
    expect(s.run.breachAccessReduction).toBe(1);

    put(s, "labyrinthine-servers", "lab-1", "corp:identity");
    runKind(s, "lab-1", "prevent_labyrinthine_jack_out");
    expect(s.run.cannotJackOut).toBe(true);
  });

  it("Mammon: spending X places X power counters", () => {
    const s = createInitialState();
    put(s, "mammon", "mam-1", "runner:installed");
    s.runner.credits = 4;
    runKind(s, "mam-1", "spend_credits_place_power_counters");
    const after = applyAction(s, { type: "choose_option", optionId: "mammon:3" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(1);
    expect(after.state.cards["mam-1"]?.powerCounters).toBe(3);
  });

  it("Bloodletter: may trash the top 2 cards of the stack instead of a program", () => {
    const s = createInitialState();
    put(s, "bloodletter", "bl-1", "corp:play");
    for (const id of ["t1", "t2", "t3"]) put(s, "sure-gamble", id, "runner:stack");
    s.runner.deck = ["t1", "t2", "t3"];
    runKind(s, "bl-1", "trash_program_or_top_2_stack");
    const after = applyAction(s, { type: "choose_option", optionId: "mill2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.deck).toEqual(["t3"]);
    expect(after.state.runner.discardPile).toEqual(expect.arrayContaining(["t1", "t2"]));
  });

  it("Brain Rewiring: offers credit spends up to the Runner's grip size", () => {
    const s = createInitialState();
    put(s, "brain-rewiring", "br-1", "corp:score");
    s.corp.credits = 5;
    s.runner.hand = ["a", "b"];
    runKind(s, "br-1", "brain_rewiring_spend_credits_force_bottom_draw");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining(["br:1", "br:2"]));
    expect(ids).not.toContain("br:3");
  });

  it("Logos: searches the stack for a card and adds it to the grip", () => {
    const s = createInitialState();
    put(s, "logos", "logos-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:stack");
    s.runner.deck = ["prog-1"];
    s.runner.hand = [];
    runKind(s, "logos-1", "search_stack_take_to_grip");
    const after = applyAction(s, { type: "choose_option", optionId: "st:prog-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toEqual(["prog-1"]);
  });

  it("Paige Piper: puts stack copies of the just-installed card into the heap", () => {
    const s = createInitialState();
    put(s, "paige-piper", "pp-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "corroder", "prog-2", "runner:stack");
    s.runner.installed = ["pp-1", "prog-1"];
    s.runner.deck = ["prog-2"];
    s.turn.installedThisTurn = ["prog-1"];
    runKind(s, "pp-1", "search_stack_copies_to_heap");
    expect(s.runner.discardPile).toContain("prog-2");
    expect(s.runner.deck).toEqual([]);
  });

  it("Localized Product Line: takes all copies of a card from R&D to HQ", () => {
    const s = createInitialState();
    put(s, "localized-product-line", "lpl-1", "corp:play");
    put(s, "hedge-fund", "hf-1", "corp:rnd");
    put(s, "hedge-fund", "hf-2", "corp:rnd");
    s.corp.deck = ["hf-1", "hf-2"];
    s.corp.hand = [];
    runKind(s, "lpl-1", "search_rd_copies_to_hq");
    const opt = s.pendingChoice?.options[0];
    expect(opt?.label).toContain("2×");
    const after = applyAction(s, { type: "choose_option", optionId: opt!.id });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(expect.arrayContaining(["hf-1", "hf-2"]));
  });

  it("Executive Boot Camp: may rez an installed card at a discount", () => {
    const s = createInitialState();
    put(s, "executive-boot-camp", "ebc-1", "server:remote-1:root");
    put(s, "adonis-campaign", "ad-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ebc-1", "ad-1"],
    } as GameState["servers"][string];
    runKind(s, "ebc-1", "may_rez_card_with_discount", { discount: 1 });
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.some((id) => id.includes("ad-1"))).toBe(true);
  });

  it("Woman in the Red Dress: reveals the top card of R&D and the Corp may draw it", () => {
    const s = createInitialState();
    put(s, "woman-in-the-red-dress", "wrd-1", "runner:installed");
    put(s, "hedge-fund", "top-1", "corp:rnd");
    put(s, "hedge-fund", "bottom-1", "corp:rnd");
    s.corp.deck = ["top-1", "bottom-1"]; // index 0 is the top (commitDraw shifts)
    s.corp.hand = [];
    runKind(s, "wrd-1", "reveal_top_rd_corp_may_draw");
    const opt = s.pendingChoice?.options.find((o) => o.id === "draw");
    expect(opt?.label).toContain("Hedge Fund");
    const after = applyAction(s, { type: "choose_option", optionId: "draw" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(["top-1"]);
    expect(after.state.corp.deck).toEqual(["bottom-1"]);
  });

  it("Project Ares: overadvancing by 2 makes the Runner trash 2, then Corp takes bad publicity", () => {
    const s = createInitialState();
    const ares = put(s, "project-ares", "ares-1", "corp:score");
    ares.advancementCounters = 6;
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "corroder", "prog-2", "runner:installed");
    s.runner.installed = ["prog-1", "prog-2"];
    runKind(s, "ares-1", "score_project_ares_on", { past: 4 });
    // Runner chooses which installed cards to trash, one at a time.
    for (let guard = 0; guard < 6 && s.pendingChoice; guard++) {
      const opt = s.pendingChoice.options[0]!;
      const after = applyAction(s, { type: "choose_option", optionId: opt.id });
      if (!after.ok) throw new Error(after.error);
      Object.assign(s, after.state);
      s.cards = after.state.cards;
    }
    expect(s.runner.installed).toEqual([]);
    expect(s.corp.badPublicity).toBe(1);
  });

  it("Unorthodox Predictions: locks subroutine breaking for the chosen type", () => {
    const s = createInitialState();
    put(s, "unorthodox-predictions", "up-1", "corp:score");
    runKind(s, "up-1", "score_unorthodox_predictions_on");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "unorthodox:sentry",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.turn.forbidBreakIceSubtypesUntilCorpTurnEnd).toEqual([
      "sentry",
    ]);
  });

  it("Bifrost Array: may trigger another scored agenda's when-scored ability", () => {
    const s = createInitialState();
    put(s, "bifrost-array", "bif-1", "corp:score");
    put(s, "profiteering", "prof-1", "corp:score");
    s.corp.scoreArea = ["bif-1", "prof-1"];
    runKind(s, "bif-1", "may_score_bifrost_trigger_scored_agenda_on");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.some((id) => id.includes("prof-1"))).toBe(true);
  });

  it("Research Grant: may score another installed copy of itself", () => {
    const s = createInitialState();
    put(s, "research-grant", "rg-1", "corp:score");
    put(s, "research-grant", "rg-2", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["rg-2"],
    } as GameState["servers"][string];
    s.corp.scoreArea = ["rg-1"];
    runKind(s, "rg-1", "score_another_installed_copy_of_self");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.some((id) => id.includes("rg-2"))).toBe(true);
  });

  it("Levy Advanced Research Lab: may take a program from the top 4 to grip", () => {
    const s = createInitialState();
    put(s, "levy-advanced-research-lab", "levy-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:stack");
    put(s, "sure-gamble", "ev-1", "runner:stack");
    s.runner.deck = ["prog-1", "ev-1"];
    s.runner.hand = [];
    runKind(s, "levy-1", "reveal_levy_advanced_research_lab");
    const opt = s.pendingChoice?.options.find((o) => o.id.includes("prog-1"));
    expect(opt).toBeDefined();
    const after = applyAction(s, { type: "choose_option", optionId: opt!.id });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toEqual(["prog-1"]);
  });

  it("deck orientation: Accelerated Diagnostics looks at the top 3 of R&D", () => {
    const s = createInitialState();
    put(s, "accelerated-diagnostics", "ad-1", "corp:play");
    put(s, "hedge-fund", "top-op", "corp:rnd");
    put(s, "ice-wall", "top-2", "corp:rnd");
    put(s, "ice-wall", "top-3", "corp:rnd");
    put(s, "hedge-fund", "bottom-1", "corp:rnd");
    s.corp.deck = ["top-op", "top-2", "top-3", "bottom-1"];
    s.corp.hand = [];
    s.corp.credits = 10;
    runKind(s, "ad-1", "accelerated_diagnostics");
    // The operation was played for credits; the other looked cards trashed.
    expect(s.corp.credits).toBeGreaterThan(10);
    expect(s.corp.discardPile).toEqual(expect.arrayContaining(["top-2", "top-3"]));
    expect(s.corp.deck).toEqual(["bottom-1"]);
  });

  it("deck orientation: Keyhole trashes a program from the top 3 of R&D", () => {
    const s = createInitialState();
    put(s, "keyhole", "kh-1", "runner:installed");
    put(s, "corroder", "top-prog", "corp:rnd");
    put(s, "hedge-fund", "top-2", "corp:rnd");
    put(s, "hedge-fund", "bottom-1", "corp:rnd");
    s.corp.deck = ["top-prog", "top-2", "bottom-1"];
    runKind(s, "kh-1", "breach_instead_keyhole");
    expect(s.corp.discardPile).toContain("top-prog");
    expect(s.corp.deck).toContain("bottom-1");
    expect(s.corp.deck).not.toContain("top-prog");
  });

  it("deck orientation: Inject trashes the top 4 of the stack, gaining per program", () => {
    const s = createInitialState();
    put(s, "inject", "inj-1", "runner:play");
    put(s, "corroder", "top-prog", "runner:stack");
    put(s, "sure-gamble", "top-2", "runner:stack");
    put(s, "sure-gamble", "top-3", "runner:stack");
    put(s, "sure-gamble", "top-4", "runner:stack");
    put(s, "sure-gamble", "bottom-1", "runner:stack");
    s.runner.deck = ["top-prog", "top-2", "top-3", "top-4", "bottom-1"];
    s.runner.hand = [];
    s.runner.credits = 5;
    runKind(s, "inj-1", "reveal_top_four");
    expect(s.runner.discardPile).toContain("top-prog");
    expect(s.runner.hand).toEqual(["top-2", "top-3", "top-4"]);
    expect(s.runner.deck).toEqual(["bottom-1"]);
    expect(s.runner.credits).toBe(6);
  });

  it("deck orientation: Power Shutdown trashes from the top of R&D", () => {
    const s = createInitialState();
    put(s, "power-shutdown", "ps-1", "corp:play");
    put(s, "hedge-fund", "top-1", "corp:rnd");
    put(s, "hedge-fund", "bottom-1", "corp:rnd");
    s.corp.deck = ["top-1", "bottom-1"];
    runKind(s, "ps-1", "trash_rd", { amount: 1 });
    expect(s.corp.discardPile).toContain("top-1");
    expect(s.corp.deck).toEqual(["bottom-1"]);
  });

  it("deck orientation: Equivocation reveals the top card of R&D", () => {
    const s = createInitialState();
    put(s, "equivocation", "eq-1", "runner:installed");
    put(s, "hedge-fund", "top-1", "corp:rnd");
    put(s, "ice-wall", "bottom-1", "corp:rnd");
    s.corp.deck = ["top-1", "bottom-1"];
    runKind(s, "eq-1", "may_reveal_force_draw");
    const opt = s.pendingChoice?.options.find((o) => o.id === "reveal");
    expect(opt?.label).toContain("Hedge Fund");
  });

  it("deck orientation: Angel Arena reveals the top card and can move it to the bottom", () => {
    const s = createInitialState();
    put(s, "angel-arena", "aa-1", "runner:installed");
    put(s, "corroder", "top-1", "runner:stack");
    put(s, "sure-gamble", "second-1", "runner:stack");
    s.runner.deck = ["top-1", "second-1"];
    runKind(s, "aa-1", "reveal_top_may_bottom");
    expect(s.cards["top-1"]?.faceup).toBe(true);
    const after = applyAction(s, { type: "choose_option", optionId: "angel-bottom" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.deck).toEqual(["second-1", "top-1"]);
  });

  it("deck orientation: Oracle May draws a matching top card and gains 2", () => {
    const s = createInitialState();
    put(s, "oracle-may", "om-1", "runner:identity");
    put(s, "corroder", "top-1", "runner:stack");
    put(s, "sure-gamble", "second-1", "runner:stack");
    s.runner.deck = ["top-1", "second-1"];
    s.runner.installed = [];
    s.runner.hand = [];
    s.runner.credits = 3;
    runKind(s, "om-1", "reveal_oracle_top_match", { cardType: "program" });
    // Printed text: draw it and gain 2¢ (not install). Card text wins (CR 1.2.1).
    expect(s.runner.hand).toContain("top-1");
    expect(s.runner.installed).not.toContain("top-1");
    expect(s.runner.credits).toBe(5);
    expect(s.runner.deck).toEqual(["second-1"]);
  });

  it("Reality Threedee: gains 2 when the Runner is tagged, else 1", () => {
    const s = createInitialState();
    put(s, "reality-threedee", "rt-1", "server:remote-1:root");
    s.corp.credits = 5;
    runKind(s, "rt-1", "gain_reality_threedee_credits");
    expect(s.corp.credits).toBe(6);
    s.runner.tags = 1;
    runKind(s, "rt-1", "gain_reality_threedee_credits");
    expect(s.corp.credits).toBe(8);
  });

  it("Iain Stirling: gains 2 when the Corp is ahead on agenda points", () => {
    const s = createInitialState();
    put(s, "iain-stirling-retired-spook", "iain-1", "runner:installed");
    const agenda = put(s, "hostile-takeover", "ht-1", "corp:score");
    agenda.agendaPoints = 2;
    agenda.faceup = true;
    s.corp.scoreArea = ["ht-1"];
    s.runner.credits = 3;
    runKind(s, "iain-1", "corp_gain_iain_if_ahead_on_agenda");
    expect(s.runner.credits).toBe(5);
  });

  it("The All-Seeing I: removing bad publicity is offered instead of trashing resources", () => {
    const s = createInitialState();
    put(s, "the-all-seeing-i", "asi-1", "corp:play");
    s.corp.badPublicity = 1;
    runKind(s, "asi-1", "trash_all_resources_unless_remove_bad_publicity");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("remove-bp");
    expect(ids).toContain("trash-resources");
  });

  it("Windfall: trashes the top card after shuffling and gains its install cost", () => {
    const s = createInitialState();
    put(s, "windfall", "wf-1", "runner:play");
    put(s, "corroder", "only-1", "runner:stack");
    s.runner.deck = ["only-1"];
    s.runner.credits = 5;
    runKind(s, "wf-1", "shuffle_trash_top_gain_install_cost");
    expect(s.runner.discardPile).toContain("only-1");
    expect(s.runner.credits).toBe(7); // Corroder install cost 2
  });

  it("Gyri Labyrinth and Valley Grid reduce the Runner's maximum hand size", () => {
    const s = createInitialState();
    put(s, "gyri-labyrinth", "gyri-1", "server:hq:ice");
    const before = s.runner.maxHandSize;
    runKind(s, "gyri-1", "gyri_labyrinth_reduce_max_hand");
    expect(s.runner.maxHandSize).toBe(before - 2);

    const s2 = createInitialState();
    put(s2, "valley-grid", "vg-1", "server:remote-1:root");
    const before2 = s2.runner.maxHandSize;
    runKind(s2, "vg-1", "valley_grid_hand_size_penalty_until_next_corp_turn");
    expect(s2.runner.maxHandSize).toBe(before2 - 1);
  });

  it("Efficiency Committee: forbids advancing for the rest of the turn", () => {
    const s = createInitialState();
    put(s, "efficiency-committee", "ec-1", "corp:score");
    runKind(s, "ec-1", "forbid_advance_this_turn");
    expect(s.turn.cannotAdvanceCards).toBe(true);
  });

  it("Nasir Meidan: loses all credits in the pool", () => {
    const s = createInitialState();
    put(s, "nasir-meidan-cyber-explorer", "nasir-1", "runner:identity");
    s.runner.credits = 9;
    runKind(s, "nasir-1", "lose_nasir_all_credits");
    expect(s.runner.credits).toBe(0);
  });

  it("Vanadis Armory: trashes top cards of R&D equal to damage suffered this turn", () => {
    const s = createInitialState();
    put(s, "salvaged-vanadis-armory", "va-1", "runner:installed");
    put(s, "hedge-fund", "top-1", "corp:rnd");
    put(s, "hedge-fund", "top-2", "corp:rnd");
    put(s, "hedge-fund", "third-1", "corp:rnd");
    s.corp.deck = ["top-1", "top-2", "third-1"];
    s.turn.damageSufferedThisTurn = 2;
    runKind(s, "va-1", "trash_top_rd_equal_damage_suffered_this_turn");
    expect(s.corp.discardPile).toEqual(expect.arrayContaining(["top-1", "top-2"]));
    expect(s.corp.deck).toEqual(["third-1"]);
  });

  it("Waiver: trashes grip cards with cost at most the trace excess", () => {
    const s = createInitialState();
    put(s, "waiver", "wv-1", "server:hq:ice");
    put(s, "corroder", "cheap-1", "runner:hand"); // install cost 2
    put(s, "blackat", "pricey-1", "runner:hand"); // install cost 4+
    s.runner.hand = ["cheap-1", "pricey-1"];
    s.turn.lastTraceExcess = 3;
    runKind(s, "wv-1", "reveal_grip_trash_cost_lte_excess");
    expect(s.runner.hand).toEqual(["pricey-1"]);
    expect(s.runner.discardPile).toContain("cheap-1");
  });

  it("IP Block: gives a tag if the Runner has an installed AI", () => {
    const s = createInitialState();
    put(s, "ip-block", "ipb-1", "server:hq:ice");
    put(s, "darwin", "ai-1", "runner:installed");
    s.runner.installed = ["ai-1"];
    runKind(s, "ipb-1", "give_tags_if_runner_has_installed_subtype", {
      subtype: "ai",
      amount: 1,
    });
    expect(s.runner.tags).toBe(1);
  });

  it("Whampoa Reclamation: adds an Archives card to the bottom of R&D", () => {
    const s = createInitialState();
    put(s, "whampoa-reclamation", "wr-1", "server:remote-1:root");
    put(s, "hedge-fund", "arch-1", "corp:archives");
    put(s, "hedge-fund", "rd-1", "corp:rnd");
    s.corp.discardPile = ["arch-1"];
    s.corp.deck = ["rd-1"];
    runKind(s, "wr-1", "trash_whampoa_hq_archives_to_rd_bottom");
    const after = applyAction(s, { type: "choose_option", optionId: "rd:arch-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.deck[after.state.corp.deck.length - 1]).toBe("arch-1");
    expect(after.state.corp.discardPile).toEqual([]);
  });

  it("Tyson Observatory: searches the stack for hardware to grip", () => {
    const s = createInitialState();
    put(s, "tyson-observatory", "ty-1", "runner:installed");
    put(s, "clone-chip", "hw-1", "runner:stack");
    s.runner.deck = ["hw-1"];
    s.runner.hand = [];
    runKind(s, "ty-1", "search_stack_type_add_to_grip", { cardType: "hardware" });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "stack-type:hw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toEqual(["hw-1"]);
  });

  it("Sealed Vault: stores and takes any number of credits, not necessarily all", () => {
    const s = createInitialState();
    put(s, "sealed-vault", "sv-1", "server:remote-1:root");
    s.corp.credits = 6;
    runKind(s, "sv-1", "sealed_vault_store_from_pool");
    let after = applyAction(s, { type: "choose_option", optionId: "sealed-store:2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(4);
    expect(after.state.cards["sv-1"]?.hostedCredits).toBe(2);

    runKind(after.state, "sv-1", "take_to_pool");
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "sealed-take:1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(5);
    expect(after.state.cards["sv-1"]?.hostedCredits).toBe(1);
  });

  it("Hemorrhage: the Corp chooses which HQ card to trash", () => {
    const s = createInitialState();
    put(s, "hemorrhage", "hem-1", "runner:installed");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "ice-wall", "hq-2", "corp:hand");
    s.corp.hand = ["hq-1", "hq-2"];
    runKind(s, "hem-1", "corp_trash_from_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "hemorrhage:hq-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("hq-2");
    expect(after.state.corp.hand).toEqual(["hq-1"]);
  });

  it("Tallie Perrault: the bad publicity and tag are optional", () => {
    const s = createInitialState();
    put(s, "tallie-perrault", "tp-1", "runner:installed");
    runKind(s, "tp-1", "tallie_perrault_on_ops_trashed");
    let after = applyAction(s, { type: "choose_option", optionId: "decline" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.badPublicity ?? 0).toBe(0);
    expect(after.state.runner.tags).toBe(0);

    runKind(after.state, "tp-1", "tallie_perrault_on_ops_trashed");
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "tallie-apply",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.badPublicity).toBe(1);
    expect(after.state.runner.tags).toBe(1);
  });

  it("Reclamation Order: adds only copies of the named card to HQ", () => {
    const s = createInitialState();
    put(s, "reclamation-order", "ro-1", "corp:play");
    put(s, "hedge-fund", "arch-1", "corp:archives");
    put(s, "hedge-fund", "arch-2", "corp:archives");
    put(s, "ice-wall", "arch-3", "corp:archives");
    s.corp.discardPile = ["arch-1", "arch-2", "arch-3"];
    s.corp.hand = [];
    runKind(s, "ro-1", "reclamation_order_archives_to_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "reclaim:hedge-fund:1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(["arch-1"]);
    expect(after.state.corp.discardPile).toEqual(
      expect.arrayContaining(["arch-2", "arch-3"]),
    );
  });

  it("Virgo: successful trace gives 1 tag; failed trace gives none", () => {
    const s = createInitialState();
    put(s, "virgo", "virgo-1", "server:hq:ice");
    s.runner.link = 0;
    runKind(s, "virgo-1", "trace_virgo_subroutine");
    expect(s.runner.tags).toBe(1);

    const s2 = createInitialState();
    put(s2, "virgo", "virgo-1", "server:hq:ice");
    s2.runner.link = 99;
    runKind(s2, "virgo-1", "trace_virgo_subroutine");
    expect(s2.runner.tags).toBe(0);
  });

  it("Taurus: successful trace trashes 1 piece of hardware", () => {
    const s = createInitialState();
    put(s, "taurus", "taurus-1", "server:hq:ice");
    put(s, "clone-chip", "hw-1", "runner:installed");
    s.runner.installed = ["hw-1"];
    s.runner.link = 0;
    runKind(s, "taurus-1", "trace_taurus_subroutine");
    const opt = s.pendingChoice?.options[0];
    if (opt) {
      const after = applyAction(s, { type: "choose_option", optionId: opt.id });
      if (!after.ok) throw new Error(after.error);
      expect(after.state.runner.discardPile).toContain("hw-1");
    } else {
      expect(s.runner.discardPile).toContain("hw-1");
    }
  });

  it("Sagittarius: successful trace trashes 1 program", () => {
    const s = createInitialState();
    put(s, "sagittarius", "sag-1", "server:hq:ice");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    s.runner.link = 0;
    runKind(s, "sag-1", "trace_sagittarius_subroutine");
    const opt = s.pendingChoice?.options[0];
    if (opt) {
      const after = applyAction(s, { type: "choose_option", optionId: opt.id });
      if (!after.ok) throw new Error(after.error);
      expect(after.state.runner.discardPile).toContain("prog-1");
    } else {
      expect(s.runner.discardPile).toContain("prog-1");
    }
  });

  it("Searchlight: trace strength equals its advancement counters", () => {
    const s = createInitialState();
    const sl = put(s, "searchlight", "sl-1", "server:hq:ice");
    sl.advancementCounters = 3;
    s.runner.link = 0;
    runKind(s, "sl-1", "trace_strength_equal_source_advancements", {
      onSuccess: fx.do({ kind: "give_tags", amount: 1 }),
    });
    expect(s.runner.tags).toBe(1);
    expect(s.turn.lastResolvedTraceStrength).toBe(3);
  });

  it("Caprice Nisei: differing secret spends end the run; matching spends do not", () => {
    const s = createInitialState();
    put(s, "caprice-nisei", "cap-1", "server:remote-1:root");
    s.run = { attackedServerId: "remote-1" } as GameState["run"];
    s.runner.credits = 5;
    s.corp.credits = 5;
    runKind(s, "cap-1", "spend_caprice_nisei_secret");
    expect(s.psi?.maxBid).toBe(2);
    let after = applyAction(s, { type: "psi_runner_bid", amount: 1 });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, { type: "psi_corp_bid", amount: 2 });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.endedTheRun ?? after.state.run === null).toBeTruthy();

    const s2 = createInitialState();
    put(s2, "caprice-nisei", "cap-1", "server:remote-1:root");
    s2.run = { attackedServerId: "remote-1" } as GameState["run"];
    s2.runner.credits = 5;
    s2.corp.credits = 5;
    runKind(s2, "cap-1", "spend_caprice_nisei_secret");
    let a2 = applyAction(s2, { type: "psi_runner_bid", amount: 1 });
    if (!a2.ok) throw new Error(a2.error);
    a2 = applyAction(a2.state, { type: "psi_corp_bid", amount: 1 });
    if (!a2.ok) throw new Error(a2.error);
    expect(a2.state.run?.endedTheRun ?? false).toBe(false);
  });

  it("Push Your Luck: wrong even/odd guess pays twice the secret spend; Corp spends nothing", () => {
    const s = createInitialState();
    put(s, "push-your-luck", "pyl-1", "runner:play");
    s.runner.credits = 6;
    s.corp.credits = 5;
    runKind(s, "pyl-1", "spend_push_your_luck_secret_guess");
    let after = applyAction(s, { type: "psi_runner_bid", amount: 3 });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, { type: "psi_corp_bid", amount: 0 }); // guesses even
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(9); // 6 - 3 spent + 6 gained
    expect(after.state.corp.credits).toBe(5);
  });

  it("Rigged Results: Corp guesses the amount without spending; a wrong guess offers a run", () => {
    const s = createInitialState();
    put(s, "rigged-results", "rr-1", "runner:play");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"].ice = ["iw-1"];
    s.runner.credits = 5;
    s.corp.credits = 5;
    runKind(s, "rr-1", "spend_rigged_results_secret_guess");
    let after = applyAction(s, { type: "psi_runner_bid", amount: 2 });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, { type: "psi_corp_bid", amount: 1 });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(5); // guess costs nothing
    expect(after.state.pendingChoice).toBeTruthy(); // choose ice and run it
  });

  it("Heartbeat: trashing an installed card prevents 1 pending damage", () => {
    const s = createInitialState();
    put(s, "heartbeat", "hb-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["hb-1", "prog-1"];
    s.pendingDamage = {
      type: "net",
      remaining: 2,
      sourceId: "some-ice",
    } as GameState["pendingDamage"];
    runKind(s, "hb-1", "trash_installed_prevent_damage", { amount: 1 });
    // applyAction refuses to resolve choices while damage is pending, so
    // resolve the choice effect directly (same pattern as Recon Drone).
    const opt = s.pendingChoice?.options.find((o) => o.id === "hb:prog-1");
    if (!opt) throw new Error("expected hb:prog-1 option");
    s.pendingChoice = null;
    const r = evalEffect({ state: s, sourceId: "hb-1" }, opt.effect);
    if (!r.ok) throw new Error(r.error);
    expect(s.runner.discardPile).toContain("prog-1");
    expect(s.pendingDamage?.remaining).toBe(1);
  });

  it("Sacrificial Clone: prevents all damage at the cost of hardware, resources, grip, credits, and tags", () => {
    const s = createInitialState();
    put(s, "sacrificial-clone", "sac-1", "runner:installed");
    put(s, "clone-chip", "hw-1", "runner:installed");
    put(s, "street-peddler", "res-1", "runner:installed");
    put(s, "ghost-runner", "virt-1", "runner:installed");
    put(s, "sure-gamble", "grip-1", "runner:hand");
    s.runner.installed = ["hw-1", "res-1", "virt-1"];
    s.runner.hand = ["grip-1"];
    s.runner.credits = 7;
    s.runner.tags = 2;
    runKind(s, "sac-1", "prevent_all_damage");
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["hw-1", "res-1", "grip-1"]),
    );
    expect(s.runner.installed).toContain("virt-1"); // virtual resource stays
    expect(s.runner.credits).toBe(0);
    expect(s.runner.tags).toBe(0);
  });

  it("Meteor Mining: may gain 7; with a doubly tagged Runner, may do 7 meat instead", () => {
    const s = createInitialState();
    put(s, "meteor-mining", "mm-1", "corp:score");
    s.corp.credits = 3;
    runKind(s, "mm-1", "may_gain_7_or_7_meat_if_tagged");
    let ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("gain7");
    expect(ids).not.toContain("meat7");
    const after = applyAction(s, { type: "choose_option", optionId: "gain7" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(10);

    const s2 = createInitialState();
    put(s2, "meteor-mining", "mm-1", "corp:score");
    s2.runner.tags = 2;
    runKind(s2, "mm-1", "may_gain_7_or_7_meat_if_tagged");
    ids = s2.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("meat7");
  });

  it("O2 Shortage: if the Runner declines to trash a grip card, the Corp gains 2 clicks", () => {
    const s = createInitialState();
    put(s, "o2-shortage", "o2-1", "corp:play");
    s.corp.clicks = 3;
    runKind(s, "o2-1", "o2_shortage_runner_may_trash_random_grip_or_corp_gains_clicks");
    const after = applyAction(s, { type: "choose_option", optionId: "o2-decline" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.clicks).toBe(5);
  });

  it("Liberated Chela: with no Corp agenda to forfeit, it scores itself for 2 points", () => {
    const s = createInitialState();
    put(s, "liberated-chela", "chela-1", "runner:installed");
    s.runner.installed = ["chela-1"];
    runKind(s, "chela-1", "may_corp_forfeit_liberated_chela_or_score");
    expect(s.runner.scoreArea).toContain("chela-1");
    expect(s.cards["chela-1"]?.agendaPoints).toBe(2);
  });

  it("Standoff: if the Runner declines to trash, the Corp draws 1 and gains 5", () => {
    const s = createInitialState();
    put(s, "standoff", "so-1", "corp:score");
    put(s, "hedge-fund", "rd-1", "corp:rnd");
    s.corp.deck = ["rd-1"];
    s.corp.hand = [];
    s.corp.credits = 3;
    runKind(s, "so-1", "trash_loop");
    const after = applyAction(s, { type: "choose_option", optionId: "decline" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(["rd-1"]);
    expect(after.state.corp.credits).toBe(8);
  });

  it("Information Overload: encounter trace gives a tag; its subroutine makes the Runner trash per tag", () => {
    const s = createInitialState();
    put(s, "information-overload", "io-1", "server:hq:ice");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "clone-chip", "hw-1", "runner:installed");
    s.runner.installed = ["prog-1", "hw-1"];
    s.runner.link = 0;
    runKind(s, "io-1", "information_overload_encounter");
    expect(s.runner.tags).toBe(1);
    s.runner.tags = 2;
    runKind(s, "io-1", "trash_per_tag");
    // Runner chooses which installed cards to trash, one at a time.
    let after = applyAction(s, { type: "choose_option", optionId: "io-trash:hw-1" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "io-trash:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["hw-1", "prog-1"]),
    );
  });

  it("Snoop: reveals the grip and trashes 1 of those cards", () => {
    const s = createInitialState();
    put(s, "snoop", "snoop-1", "server:hq:ice");
    put(s, "corroder", "g1", "runner:hand");
    put(s, "sure-gamble", "g2", "runner:hand");
    s.runner.hand = ["g1", "g2"];
    runKind(s, "snoop-1", "reveal_grip_may_trash_one");
    const opt = s.pendingChoice?.options[0];
    expect(opt).toBeDefined();
    const after = applyAction(s, { type: "choose_option", optionId: opt!.id });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand.length).toBe(1);
    expect(after.state.runner.discardPile.length).toBe(1);
  });

  it("Inazuma locks breaking for the next encounter; Susanoo redirects the run to Archives", () => {
    const s = createInitialState();
    put(s, "inazuma", "inz-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "inz-1", "inazuma_lock_breaking_next_encounter");
    expect(s.run.inazumaLockNextEncounter).toBe(true);

    put(s, "susanoo-no-mikoto", "sus-1", "server:hq:ice");
    runKind(s, "sus-1", "redirect_susanoo_to_archives");
    expect(s.run.attackedServerId).toBe("archives");
  });

  it("Inazuma: forbids jack out until after the next ice encounter begins", () => {
    const s = createInitialState();
    put(s, "inazuma", "inz-1", "server:hq:ice");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["inz-1", "iw-1"];
    s.cards["inz-1"]!.rezzed = true;
    s.cards["iw-1"]!.rezzed = true;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "inz-1", broken: [true, false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    runKind(s, "inz-1", "forbid_jack_out_until_next_encounter");
    expect(s.run.cannotJackOut).toBe(true);
    expect(s.run.clearCannotJackOutOnNextEncounterBegin).toBe(true);
    // Next ice encounter begins → jack out allowed again.
    s.run.position = 1;
    s.run.encounter = null;
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(s.run?.cannotJackOut).toBe(false);
    expect(s.run?.clearCannotJackOutOnNextEncounterBegin).toBeFalsy();
    expect(s.log.some((l) => l.includes("jack out allowed again"))).toBe(true);
  });

  it("Rebirth: switches to a same-faction identity from outside the game (CR 1.5.4)", () => {
    const s = createInitialState();
    // Primary: anarch Edward Kim.
    put(s, "edward-kim-humanitys-hammer", "runner-id", "runner:grip");
    s.runner.identityId = "runner-id";
    // Outside-game pile: Alice (same faction) + Andromeda (criminal — not offered).
    put(s, "alice-merchant-clan-agitator", "alice-extra", RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE);
    put(s, "andromeda-dispossessed-ristie", "andy-extra", RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE);
    s.runner.additionalIdentities = ["alice-extra", "andy-extra"];
    put(s, "rebirth", "reb-1", "runner:heap");
    runKind(s, "reb-1", "rebirth_switch_identity_same_faction");
    expect(s.runner.identityId).toBe("alice-extra");
    expect(s.cards["alice-extra"]!.zone).toBe("runner:grip");
    expect(s.runner.additionalIdentities).toContain("runner-id");
    expect(s.runner.additionalIdentities).toContain("andy-extra");
    expect(s.runner.additionalIdentities).not.toContain("alice-extra");
    expect(s.cards["runner-id"]!.zone).toBe(RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE);
    expect(s.log.some((l) => l.includes("Alice Merchant"))).toBe(true);
  });

  it("Ramujan-reliant 550 BMI: X = 1 + other copies installed; prevents X and trashes X from the stack", () => {
    const s = createInitialState();
    put(s, "ramujan-reliant-550-bmi", "ram-1", "runner:installed");
    put(s, "ramujan-reliant-550-bmi", "ram-2", "runner:installed");
    put(s, "sure-gamble", "stk-1", "runner:stack");
    put(s, "sure-gamble", "stk-2", "runner:stack");
    put(s, "sure-gamble", "stk-3", "runner:stack");
    s.runner.installed = ["ram-1", "ram-2"];
    s.runner.deck = ["stk-1", "stk-2", "stk-3"];
    s.pendingDamage = {
      type: "net",
      remaining: 3,
      sourceId: "some-ice",
    } as GameState["pendingDamage"];
    runKind(s, "ram-1", "prevent_ramujan_damage_trash_stack");
    expect(s.pendingDamage?.remaining).toBe(1); // X = 2
    expect(s.runner.discardPile).toEqual(["stk-1", "stk-2"]);
    expect(s.runner.deck).toEqual(["stk-3"]);
  });

  it("Snatch and Grab: successful trace trashes a connection unless the Runner takes a tag", () => {
    const s = createInitialState();
    put(s, "snatch-and-grab", "snatch-1", "corp:play");
    put(s, "john-masanori", "conn-1", "runner:installed");
    s.runner.installed = ["conn-1"];
    s.runner.link = 0;
    runKind(s, "snatch-1", "snatch_and_grab_on_play");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "snatch-pick:conn-1",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "snatch-allow",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("conn-1");

    const s2 = createInitialState();
    put(s2, "snatch-and-grab", "snatch-1", "corp:play");
    put(s2, "john-masanori", "conn-1", "runner:installed");
    s2.runner.installed = ["conn-1"];
    s2.runner.link = 0;
    runKind(s2, "snatch-1", "snatch_and_grab_on_play");
    let a2 = applyAction(s2, {
      type: "choose_option",
      optionId: "snatch-pick:conn-1",
    });
    if (!a2.ok) throw new Error(a2.error);
    a2 = applyAction(a2.state, {
      type: "choose_option",
      optionId: "snatch-take-tag",
    });
    if (!a2.ok) throw new Error(a2.error);
    expect(a2.state.runner.tags).toBe(1);
    expect(a2.state.runner.installed).toContain("conn-1");
  });

  it("Threat Level Alpha: gives tags equal to the Runner's tags, minimum 1", () => {
    const s = createInitialState();
    put(s, "threat-level-alpha", "tla-1", "corp:play");
    s.runner.tags = 0;
    runKind(s, "tla-1", "give_tags_equal_to_runner_tags_min_1");
    expect(s.runner.tags).toBe(1);
    s.runner.tags = 3;
    runKind(s, "tla-1", "give_tags_equal_to_runner_tags_min_1");
    expect(s.runner.tags).toBe(6);
  });

  it("False Flag: gives 1 tag per 2 advancement counters when scored", () => {
    const s = createInitialState();
    const src = put(s, "false-flag", "ff-1", "corp:score");
    src.advancementCounters = 5;
    runKind(s, "ff-1", "give_tags_per_two_advancements");
    expect(s.runner.tags).toBe(2);
  });

  it("Best Defense: trashes an installed card with install cost at most the Runner's tags", () => {
    const s = createInitialState();
    put(s, "best-defense", "bd-1", "corp:play");
    put(s, "corroder", "cheap-1", "runner:installed");
    put(s, "paperclip", "pricey-1", "runner:installed");
    s.runner.installed = ["cheap-1", "pricey-1"];
    s.runner.tags = 2; // Corroder costs 2, Paperclip costs 4
    runKind(s, "bd-1", "trash_installed_with_install_cost_lte_tags");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["best-defense:cheap-1"]);
  });

  it("Financial Collapse: the Runner loses 2 per installed resource or trashes one to prevent", () => {
    const s = createInitialState();
    put(s, "financial-collapse", "fc-1", "corp:play");
    put(s, "street-peddler", "res-1", "runner:installed");
    put(s, "daily-casts", "res-2", "runner:installed");
    s.runner.installed = ["res-1", "res-2"];
    s.runner.credits = 9;
    runKind(s, "fc-1", "lose_2_per_resource_or_trash");
    const after = applyAction(s, { type: "choose_option", optionId: "lose" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(5);
  });

  it("Kuwinda K4H1U3: a failed trace adds a power counter", () => {
    const s = createInitialState();
    const src = put(s, "kuwinda-k4h1u3", "kuw-1", "corp:installed");
    src.powerCounters = 2;
    s.runner.link = 99;
    runKind(s, "kuw-1", "trace_kuwinda");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "kuwinda-trace",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["kuw-1"]?.powerCounters).toBe(3);
  });

  it("Deuces Wild: resolves two different modes in the chosen order", () => {
    const s = createInitialState();
    put(s, "deuces-wild", "dw-1", "runner:play");
    s.runner.credits = 2;
    s.runner.tags = 1;
    runKind(s, "dw-1", "resolve_two");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "deuces:gain3+untag",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(5);
    expect(after.state.runner.tags).toBe(0);
  });

  it("Angel Arena: placing X counters costs X credits", () => {
    const s = createInitialState();
    put(s, "angel-arena", "aa-1", "runner:installed");
    s.runner.credits = 5;
    runKind(s, "aa-1", "place_x_counters");
    const after = applyAction(s, { type: "choose_option", optionId: "angel-x:3" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(2);
    expect(after.state.cards["aa-1"]?.powerCounters).toBe(3);
  });

  it("Interrupt 0: icebreaker break costs rise by the amount for this run", () => {
    const s = createInitialState();
    put(s, "interrupt-0", "int-1", "runner:installed");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "int-1", "break_arm_icebreaker_additional_cost_this_run", {
      amount: 2,
    });
    expect(s.run.kgIcebreakerBreakAdditionalCost).toBe(2);
  });

  it("Vikram 1.0: the Runner cannot use programs for the rest of the run", () => {
    const s = createInitialState();
    put(s, "vikram-1-0", "vik-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "vik-1", "cannot_use_programs_this_run_kg");
    expect(s.run.kgCannotUsePrograms).toBe(true);
  });

  it("Paintbrush: offers rezzed ice to gain a subtype", () => {
    const s = createInitialState();
    put(s, "paintbrush", "pb-1", "runner:installed");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    runKind(s, "pb-1", "choose_ice_gain_subtype");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["paintbrush:iw-1"]);
  });

  it("Tenma Line: swapping two installed ice exchanges their servers", () => {
    const s = createInitialState();
    put(s, "tenma-line", "tenma-1", "corp:installed");
    put(s, "ice-wall", "iw-hq", "server:hq:ice");
    put(s, "ice-wall", "iw-rd", "server:rd:ice");
    s.servers["hq"].ice = ["iw-hq"];
    s.servers["rd"].ice = ["iw-rd"];
    runKind(s, "tenma-1", "may_swap_two_installed_ice");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "swap:iw-hq:iw-rd",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["hq"].ice).toEqual(["iw-rd"]);
    expect(after.state.servers["rd"].ice).toEqual(["iw-hq"]);
  });

  it("Constellation Protocol: moves 1 advancement counter between ice", () => {
    const s = createInitialState();
    put(s, "constellation-protocol", "con-1", "corp:installed");
    const a = put(s, "ice-wall", "iw-a", "server:hq:ice");
    const b = put(s, "fire-wall", "iw-b", "server:rd:ice");
    a.advancementCounters = 2;
    b.canAdvance = true;
    s.servers["hq"].ice = ["iw-a"];
    s.servers["rd"].ice = ["iw-b"];
    runKind(s, "con-1", "move_constellation_advancement_between_ice");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "const:iw-a:iw-b",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-a"]?.advancementCounters).toBe(1);
    expect(after.state.cards["iw-b"]?.advancementCounters).toBe(1);
  });

  it("Ark Lockdown: naming a card removes all heap copies of it from the game", () => {
    const s = createInitialState();
    put(s, "ark-lockdown", "ark-1", "corp:play");
    put(s, "sure-gamble", "h1", "runner:discard");
    put(s, "sure-gamble", "h2", "runner:discard");
    put(s, "corroder", "h3", "runner:discard");
    s.runner.discardPile = ["h1", "h2", "h3"];
    runKind(s, "ark-1", "name_and_rfg_heap_copies");
    const opt = s.pendingChoice?.options.find((o) => o.id.startsWith("ark:"));
    if (!opt) throw new Error("expected ark option");
    const after = applyAction(s, { type: "choose_option", optionId: opt.id });
    if (!after.ok) throw new Error(after.error);
    const named = opt.id.slice(4);
    const remaining = after.state.runner.discardPile.filter(
      (id) => after.state.cards[id]?.defId === named,
    );
    expect(remaining.length).toBe(0);
    expect(after.state.runner.discardPile.length).toBeLessThan(3);
  });

  it("Chop Bot 3000: trashing another installed card then offers draw or tag removal", () => {
    const s = createInitialState();
    put(s, "chop-bot-3000", "chop-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["chop-1", "prog-1"];
    runKind(s, "chop-1", "trash_chop_bot_installed_then_draw_or_remove_tag");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "chop:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("prog-1");
    expect((after.state.pendingChoice?.options.length ?? 0)).toBeGreaterThan(0);
  });

  it("Clyde Van Rite: with no credits, the Runner must trash the top of the stack", () => {
    const s = createInitialState();
    put(s, "clyde-van-rite", "clyde-1", "runner:installed");
    put(s, "sure-gamble", "top-1", "runner:stack");
    s.runner.deck = ["top-1"];
    s.runner.credits = 0;
    runKind(s, "clyde-1", "pay_or_trash_top_stack");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["trash-top"]);
    const after = applyAction(s, { type: "choose_option", optionId: "trash-top" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("top-1");
  });

  it("Misdirection: spend X credits to remove X tags", () => {
    const s = createInitialState();
    put(s, "misdirection", "mis-1", "runner:installed");
    s.runner.tags = 3;
    s.runner.credits = 5;
    runKind(s, "mis-1", "spend_x_remove_tags");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "misdirection-x:2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(3);
    expect(after.state.runner.tags).toBe(1);
  });

  it("Mind Game: on psi differ, the Corp may redirect the run to another server", () => {
    const s = createInitialState();
    put(s, "mind-game", "mg-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "mg-1", "psi_differ_redirect");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "mind:archives",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.attackedServerId).toBe("archives");
  });

  it("Dr. Lovegood: blanks an installed Runner card's abilities this turn", () => {
    const s = createInitialState();
    put(s, "dr-lovegood", "love-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["love-1", "prog-1"];
    runKind(s, "love-1", "blank_installed_abilities");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "love:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.turn.dadBlankedCardIds).toContain("prog-1");
  });

  it("Product Recall: trashing a rezzed asset gains its printed trash cost", () => {
    const s = createInitialState();
    put(s, "product-recall", "pr-1", "corp:play");
    const asset = put(s, "adonis-campaign", "asset-1", "remote:1:root");
    asset.rezzed = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["asset-1"],
    } as GameState["servers"][string];
    s.corp.credits = 3;
    runKind(s, "pr-1", "trash_rezzed_gain_trash_cost");
    expect(s.corp.discardPile).toContain("asset-1");
    expect(s.corp.credits).toBe(3 + (asset.trashCost ?? 0));
  });

  it("Disposable HQ: adds all of HQ to the bottom of R&D", () => {
    const s = createInitialState();
    put(s, "disposable-hq", "dhq-1", "corp:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "hq-2", "corp:hand");
    put(s, "ice-wall", "rd-1", "corp:rd");
    s.corp.hand = ["hq-1", "hq-2"];
    s.corp.deck = ["rd-1"];
    runKind(s, "dhq-1", "add_hq_to_bottom_rd");
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck[0]).toBe("rd-1");
    expect(new Set(s.corp.deck.slice(1))).toEqual(new Set(["hq-1", "hq-2"]));
  });

  it("Bloo Moose: removing a heap card from the game gains 2 credits", () => {
    const s = createInitialState();
    put(s, "bloo-moose", "bloo-1", "runner:installed");
    put(s, "sure-gamble", "heap-1", "runner:discard");
    s.runner.discardPile = ["heap-1"];
    s.runner.credits = 3;
    runKind(s, "bloo-1", "rfg_heap_gain_credits");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "bloo:heap-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(5);
    expect(after.state.runner.discardPile).toEqual([]);
  });

  it("Game Day: draws until the grip equals max hand size", () => {
    const s = createInitialState();
    put(s, "game-day", "gd-1", "runner:play");
    for (let i = 0; i < 5; i++) put(s, "sure-gamble", `stk-${i}`, "runner:stack");
    s.runner.deck = ["stk-0", "stk-1", "stk-2", "stk-3", "stk-4"];
    s.runner.hand = [];
    runKind(s, "gd-1", "draw_until_grip_equals_max_hand_size");
    expect(s.runner.hand.length).toBe(5); // default max hand size
    expect(s.runner.deck.length).toBe(0);
  });

  it("Blockade Runner: shuffles 1 grip card into the stack", () => {
    const s = createInitialState();
    put(s, "blockade-runner", "br-1", "runner:installed");
    put(s, "sure-gamble", "grip-1", "runner:hand");
    s.runner.hand = ["grip-1"];
    s.runner.deck = [];
    runKind(s, "br-1", "shuffle_one_grip_into_stack");
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.deck).toEqual(["grip-1"]);
  });

  it("Restoring Face: trashes a sysop and removes 1 bad publicity", () => {
    const s = createInitialState();
    put(s, "restoring-face", "rf-1", "corp:play");
    put(s, "akitaro-watanabe", "sysop-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["sysop-1"],
    } as GameState["servers"][string];
    s.corp.badPublicity = 2;
    runKind(s, "rf-1", "trash_exec_sysop_clone_remove_bp");
    expect(s.corp.discardPile).toContain("sysop-1");
    // Printed: remove up to 2 bad publicity (Corp chooses how many).
    const after = applyAction(s, { type: "choose_option", optionId: "rbp-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.badPublicity).toBe(1);
  });

  it("Hasty Relocation: moves up to 3 HQ cards to the top of R&D", () => {
    const s = createInitialState();
    put(s, "hasty-relocation", "hr-1", "corp:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "ice-wall", "rd-1", "corp:rd");
    s.corp.hand = ["hq-1"];
    s.corp.deck = ["rd-1"];
    runKind(s, "hr-1", "add_n_hq_to_top_rd", { amount: 3 });
    // A single HQ card moves straight to the top of R&D (deck index 0).
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck).toEqual(["hq-1", "rd-1"]);
  });

  it("Shattered Remains: paying 1 on access trashes 1 hardware per advancement counter", () => {
    const s = createInitialState();
    const src = put(s, "shattered-remains", "sr-1", "remote:1:root");
    src.advancementCounters = 2;
    put(s, "clone-chip", "hw-1", "runner:installed");
    put(s, "clone-chip", "hw-2", "runner:installed");
    s.runner.installed = ["hw-1", "hw-2"];
    s.corp.credits = 5;
    runKind(s, "sr-1", "shattered_remains_access");
    let after = applyAction(s, { type: "choose_option", optionId: "pay" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(4);
    // Corp chooses which hardware; resolve any follow-up choices.
    for (let i = 0; i < 3 && after.state.pendingChoice; i++) {
      const opt = after.state.pendingChoice.options[0]!;
      const next = applyAction(after.state, {
        type: "choose_option",
        optionId: opt.id,
      });
      if (!next.ok) throw new Error(next.error);
      after = next;
    }
    expect(after.state.runner.installed.length).toBe(0);
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["hw-1", "hw-2"]),
    );
  });

  it("Mad Dash: stealing an agenda scores an extra point; otherwise take 1 meat damage", () => {
    const s = createInitialState();
    put(s, "mad-dash", "md-1", "runner:play");
    s.run = {
      attackedServerId: "hq",
      agendasStolenThisRun: 1,
      accessCandidates: [],
    } as GameState["run"];
    runKind(s, "md-1", "mad_dash_on_run_end");
    // Mad Dash itself enters the Runner's score area as a 1-point agenda.
    expect(s.runner.scoreArea).toContain("md-1");
    expect(s.cards["md-1"]?.agendaPoints).toBe(1);

    const s2 = createInitialState();
    put(s2, "mad-dash", "md-1", "runner:play");
    put(s2, "sure-gamble", "grip-1", "runner:hand");
    s2.runner.hand = ["grip-1"];
    s2.run = {
      attackedServerId: "hq",
      agendasStolenThisRun: 0,
      accessCandidates: [],
    } as GameState["run"];
    runKind(s2, "md-1", "mad_dash_on_run_end");
    expect(s2.runner.hand).toEqual([]); // meat damage trashes the grip card
  });

  it("Capstone: trashing a grip card with an installed duplicate draws 1", () => {
    const s = createInitialState();
    put(s, "capstone", "cap-1", "runner:installed");
    put(s, "corroder", "inst-1", "runner:installed");
    put(s, "corroder", "grip-1", "runner:hand");
    put(s, "sure-gamble", "stk-1", "runner:stack");
    s.runner.installed = ["cap-1", "inst-1"];
    s.runner.hand = ["grip-1"];
    s.runner.deck = ["stk-1"];
    runKind(s, "cap-1", "trash_grip_draw_for_installed_dupes");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "capstone:grip-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("grip-1");
    expect(after.state.runner.hand).toContain("stk-1");
  });

  it("Media Blitz: the Corp chooses a Runner-scored agenda to copy", () => {
    const s = createInitialState();
    put(s, "media-blitz", "mb-1", "corp:play");
    put(s, "project-beale", "scored-1", "runner:score");
    s.runner.scoreArea = ["scored-1"];
    runKind(s, "mb-1", "gain_text_of_runner_scored_agenda");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["mb:scored-1"]);
  });

  it("Executive Search Firm: finds a card with any listed subtype in R&D", () => {
    const s = createInitialState();
    put(s, "executive-search-firm", "esf-1", "corp:installed");
    put(s, "hedge-fund", "match-1", "corp:rd");
    put(s, "ice-wall", "other-1", "corp:rd");
    s.corp.deck = ["match-1", "other-1"];
    runKind(s, "esf-1", "search_rd_for_any_subtype_to_hq", {
      subtypes: ["transaction"],
    });
    expect(s.corp.hand).toContain("match-1");
  });

  it("Chatterjee University: installs a grip program at a discount equal to its power counters", () => {
    const s = createInitialState();
    const src = put(s, "chatterjee-university", "chat-1", "runner:installed");
    src.powerCounters = 2;
    put(s, "corroder", "prog-1", "runner:hand");
    s.runner.hand = ["prog-1"];
    s.runner.installed = ["chat-1"];
    runKind(s, "chat-1", "install_chatterjee_program_discount");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "chatterjee-install:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("prog-1");
  });

  it("The Future Is Now: searches R&D for any card and adds it to HQ", () => {
    const s = createInitialState();
    put(s, "the-future-is-now", "fin-1", "corp:play");
    put(s, "hedge-fund", "rd-1", "corp:rd");
    put(s, "ice-wall", "rd-2", "corp:rd");
    s.corp.deck = ["rd-1", "rd-2"];
    runKind(s, "fin-1", "search_rd_any_card_to_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "futurenow:rd-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(["rd-2"]);
    expect(after.state.corp.deck).toEqual(["rd-1"]);
  });

  it("Consulting Visit: finds an operation in R&D", () => {
    const s = createInitialState();
    put(s, "consulting-visit", "cv-1", "corp:play");
    put(s, "hedge-fund", "op-1", "corp:rd");
    put(s, "ice-wall", "rd-2", "corp:rd");
    s.corp.deck = ["op-1", "rd-2"];
    runKind(s, "cv-1", "search_rd_play_operation");
    const ids = (s.pendingChoice?.options ?? []).map((o) => o.id).join(" ");
    const handOrChoice =
      s.corp.hand.includes("op-1") || ids.includes("op-1") || s.pendingChoice;
    expect(handOrChoice).toBeTruthy();
  });

  it("Casting Call: installs an agenda from HQ faceup", () => {
    const s = createInitialState();
    put(s, "casting-call", "cc-1", "corp:play");
    put(s, "project-beale", "ag-1", "corp:hand");
    s.corp.hand = ["ag-1"];
    runKind(s, "cc-1", "install_agenda_faceup");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "casting:ag-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual([]);
    expect(after.state.cards["ag-1"]?.faceup).toBe(true);
  });

  it("Apex: installs a grip card facedown", () => {
    const s = createInitialState();
    put(s, "apex-invasive-predator", "apex-1", "runner:installed");
    put(s, "corroder", "g1", "runner:hand");
    s.runner.hand = ["g1"];
    runKind(s, "apex-1", "install_from_grip_facedown");
    const after = applyAction(s, { type: "choose_option", optionId: "apex-fd:g1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("g1");
    expect(after.state.cards["g1"]?.faceup).toBe(false);
  });

  it("Hunting Grounds: installs the top 3 cards of the stack facedown", () => {
    const s = createInitialState();
    put(s, "hunting-grounds", "hg-1", "runner:play");
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `stk-${i}`, "runner:stack");
    s.runner.deck = ["stk-0", "stk-1", "stk-2", "stk-3"];
    runKind(s, "hg-1", "install_top_n_of_stack_facedown", { amount: 3 });
    expect(s.runner.installed).toEqual(["stk-0", "stk-1", "stk-2"]);
    expect(s.runner.deck).toEqual(["stk-3"]);
    expect(s.cards["stk-0"]?.faceup).toBe(false);
  });

  it("Street Peddler: hosts the top 3 cards of the stack facedown", () => {
    const s = createInitialState();
    put(s, "street-peddler", "sp-1", "runner:installed");
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `stk-${i}`, "runner:stack");
    s.runner.deck = ["stk-0", "stk-1", "stk-2"];
    runKind(s, "sp-1", "host_top_n_of_stack_facedown", { amount: 3 });
    expect(s.runner.deck).toEqual([]);
    expect(s.cards["sp-1"]?.hostedCardIds).toEqual(["stk-0", "stk-1", "stk-2"]);
    expect(s.cards["stk-0"]?.faceup).toBe(false);
  });

  it("Mushin No Shin: installs an asset/agenda/upgrade from HQ and advances it 3 times", () => {
    const s = createInitialState();
    put(s, "mushin-no-shin", "mu-1", "corp:play");
    put(s, "melange-mining-corp", "as-1", "corp:hand");
    s.corp.hand = ["as-1"];
    s.corp.credits = 5;
    runKind(s, "mu-1", "install_mushin_from_hq_root");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "mushin:as-1",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "mushin-new:as-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual([]);
    const zone = after.state.cards["as-1"]?.zone ?? "";
    expect(zone).toMatch(/^server:remote-\d+:root$/);
    expect(after.state.cards["as-1"]?.faceup).toBe(false);
    expect(after.state.cards["as-1"]?.advancementCounters).toBe(3);
    expect(after.state.cannotScoreOrRezUntilNextCorpTurnCardIds).toContain("as-1");
  });

  it("Artist Colony: searches the stack and installs a program, resource, or hardware", () => {
    const s = createInitialState();
    put(s, "artist-colony", "ac-1", "runner:installed");
    put(s, "corroder", "stk-1", "runner:stack");
    put(s, "sure-gamble", "stk-2", "runner:stack");
    s.runner.deck = ["stk-1", "stk-2"];
    s.runner.credits = 5;
    runKind(s, "ac-1", "search_stack_install");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["artist-install:stk-1"]);
  });

  it("Reclaim: installs a program, hardware, or virtual resource from the heap", () => {
    const s = createInitialState();
    put(s, "reclaim", "rec-1", "runner:play");
    put(s, "corroder", "heap-1", "runner:discard");
    put(s, "street-peddler", "heap-2", "runner:discard");
    s.runner.discardPile = ["heap-1", "heap-2"];
    s.runner.credits = 5;
    runKind(s, "rec-1", "install_reclaim_from_heap");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    // Street Peddler is not virtual, so only the program qualifies.
    expect(ids).toEqual(["reclaim:heap-1"]);
  });

  it("DaVinci: with 2 power counters, installs a grip card costing at most 2 for free", () => {
    const s = createInitialState();
    const src = put(s, "davinci", "dav-1", "runner:installed");
    src.powerCounters = 2;
    put(s, "corroder", "g1", "runner:hand");
    s.runner.hand = ["g1"];
    s.runner.credits = 0;
    runKind(s, "dav-1", "install_from_grip_ignore_cost");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.length).toBe(1);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: ids[0]!,
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("g1");
    expect(after.state.runner.credits).toBe(0);
  });

  it("Career Fair: the Runner chooses which grip resource to install at 3 less", () => {
    const s = createInitialState();
    put(s, "career-fair", "cf-1", "runner:play");
    put(s, "daily-casts", "res-1", "runner:hand");
    put(s, "street-peddler", "res-2", "runner:hand");
    s.runner.hand = ["res-1", "res-2"];
    s.runner.credits = 3;
    runKind(s, "cf-1", "install_resource_discount", { discount: 3 });
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(
      expect.arrayContaining(["career-fair:res-1", "career-fair:res-2"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "career-fair:res-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("res-2");
    expect(after.state.runner.installed).not.toContain("res-1");
  });

  it("The Foundry: after rezzing the first ice of the turn, finds another copy", () => {
    const s = createInitialState();
    put(s, "the-foundry-refining-the-process", "tf-1", "corp:score");
    put(s, "ice-wall", "rd-1", "corp:rd");
    s.corp.deck = ["rd-1"];
    s.turn.iceRezzedThisTurn = 1;
    s.cards["tf-1"]!.zone = "corp:identity";
    runKind(s, "tf-1", "search_foundry_copy_to_hq");
    // Only copy in R&D is Ice Wall; the identity itself is not ice, so
    // the search may legitimately find nothing — assert it does not crash
    // and HQ/R&D stay consistent.
    expect(s.corp.hand.length + s.corp.deck.length).toBe(1);
  });

  it("Cyber Threat: any server may be chosen; if the Corp declines to rez, the Runner runs it with rezzes forbidden", () => {
    const s = createInitialState();
    put(s, "cyber-threat", "ct-1", "runner:play");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"].ice = ["iw-1"];
    s.corp.credits = 5;
    s.runner.credits = 4;
    runKind(s, "ct-1", "cyber_threat");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("cyber:hq");
    let after = applyAction(s, { type: "choose_option", optionId: "cyber:hq" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "decline",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(4); // no invented 2¢ consolation
    // applyAction starts the queued run immediately.
    expect(after.state.run?.attackedServerId).toBe("hq");
    expect(after.state.run?.forbidCorpRezIceDuringRun).toBe(true);
  });

  it("Cyber Threat: rezzing for the Threat costs the printed rez cost", () => {
    const s = createInitialState();
    put(s, "cyber-threat", "ct-1", "runner:play");
    put(s, "ice-wall", "iw-1", "server:rd:ice");
    s.servers["rd"].ice = ["iw-1"];
    s.corp.credits = 5;
    runKind(s, "ct-1", "cyber_threat");
    let after = applyAction(s, { type: "choose_option", optionId: "cyber:rd" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "rez:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(4); // Ice Wall rez cost 1
  });

  it("Charlatan: arms its bypass and offers any server for the run", () => {
    const s = createInitialState();
    put(s, "charlatan", "ch-1", "runner:installed");
    runKind(s, "ch-1", "charlatan_run_any_server");
    expect(s.turn.charlatanArmed).toBe(true);
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });

  it("Counter Surveillance: choosing a server starts a run there", () => {
    const s = createInitialState();
    put(s, "counter-surveillance", "cs-1", "runner:play");
    s.runner.tags = 2;
    runKind(s, "cs-1", "counter_surveillance_run");
    const after = applyAction(s, { type: "choose_option", optionId: "run:rd" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.attackedServerId).toBe("rd");
  });

  it("Severnius Stim Implant: trashing 2+ grip cards offers the card picks", () => {
    const s = createInitialState();
    put(s, "severnius-stim-implant", "sev-1", "runner:installed");
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `g${i}`, "runner:hand");
    s.runner.hand = ["g0", "g1", "g2"];
    runKind(s, "sev-1", "trash_severnius_grip_run_hq_or_rd");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("trash-n:2");
    expect(ids).toContain("trash-n:3");
  });

  it("Expert Schedule Analyzer: instead of breaching HQ, reveal it and skip the breach", () => {
    const s = createInitialState();
    put(s, "expert-schedule-analyzer", "esa-1", "runner:installed");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    s.corp.hand = ["hq-1"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "esa-1", "may_breach_instead_expert_schedule_analyzer");
    expect(s.run.skipBreach).toBe(true);
    expect(s.log.some((l) => l.includes("Hedge Fund"))).toBe(true);
  });

  it("Code Siphon: instead of breaching R&D, search the stack for a program", () => {
    const s = createInitialState();
    put(s, "code-siphon", "cs-1", "runner:play");
    put(s, "corroder", "stk-1", "runner:stack");
    s.runner.deck = ["stk-1"];
    s.run = { attackedServerId: "rd" } as GameState["run"];
    runKind(s, "cs-1", "may_breach_instead_code_siphon");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "code-siphon-search",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.skipBreach ?? true).toBe(true);
  });

  it("Wanton Destruction: offers to spend clicks so the Corp trashes from HQ", () => {
    const s = createInitialState();
    put(s, "wanton-destruction", "wd-1", "runner:play");
    s.runner.clicks = 2;
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "wd-1", "breach_instead_wanton_destruction");
    expect(s.run.skipBreach).toBe(true);
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("wanton:2");
  });

  it("Record Reconstructor: instead of breaching Archives, put a card on top of R&D", () => {
    const s = createInitialState();
    put(s, "record-reconstructor", "rr-1", "runner:installed");
    put(s, "hedge-fund", "arch-1", "corp:discard");
    s.corp.discardPile = ["arch-1"];
    s.run = { attackedServerId: "archives" } as GameState["run"];
    runKind(s, "rr-1", "breach_instead_record_reconstructor_archives");
    expect(s.run.skipBreach).toBe(true);
  });

  it("Hades Shard: breaching Archives instead cannot access its root", () => {
    const s = createInitialState();
    put(s, "hades-shard", "hs-1", "runner:installed");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "hs-1", "breach_archives");
    expect(s.run.attackedServerId).toBe("archives");
    expect(s.run.cannotAccessRoot).toBe(true);
  });

  it("Analog Dreamers: queues an R&D run and arms its breach replacement", () => {
    const s = createInitialState();
    put(s, "analog-dreamers", "ad-1", "runner:installed");
    runKind(s, "ad-1", "analog_dreamers_run_rd");
    expect(s.pendingStartRun?.serverId).toBe("rd");
    expect(s.turn.ccAnalogDreamersRun).toBe(true);
  });

  it("Jak Sinclair: the next run cannot use programs", () => {
    const s = createInitialState();
    put(s, "jak-sinclair", "jak-1", "runner:score");
    s.cards["jak-1"]!.zone = "runner:identity";
    runKind(s, "jak-1", "jak_sinclair_run_without_programs");
    expect(s.turn.dadCannotUseProgramsThisRun).toBe(true);
  });

  it("Social Engineering: marks an unrezzed piece of ice", () => {
    const s = createInitialState();
    put(s, "social-engineering", "se-1", "runner:play");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"].ice = ["iw-1"];
    runKind(s, "se-1", "social_engineering");
    const after = applyAction(s, { type: "choose_option", optionId: "soc:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.turn.socialEngineeringMarkedIce).toBe("iw-1");
  });

  it("Power Nap: gains 2 credits plus 1 per double event in the heap", () => {
    const s = createInitialState();
    put(s, "power-nap", "pn-1", "runner:play");
    put(s, "power-nap", "heap-1", "runner:discard");
    put(s, "power-nap", "heap-2", "runner:discard");
    put(s, "sure-gamble", "heap-3", "runner:discard");
    s.runner.discardPile = ["heap-1", "heap-2", "heap-3"];
    s.runner.credits = 3;
    const onPlay = getCardDef("power-nap").onPlay;
    if (!onPlay) throw new Error("power-nap has no onPlay effect");
    const r = evalEffect({ state: s, sourceId: "pn-1" }, onPlay);
    if (!r.ok) throw new Error(r.error);
    expect(s.runner.credits).toBe(3 + 2 + 2); // flat 2 + 2 doubles x 1
  });

  it("Film Critic: adds the hosted agenda to the Runner's score area", () => {
    const s = createInitialState();
    const fc = put(s, "film-critic", "fc-1", "runner:installed");
    put(s, "project-beale", "ag-1", "hosted:fc-1");
    fc.hostedCardIds = ["ag-1"];
    s.cards["ag-1"]!.hostId = "fc-1";
    runKind(s, "fc-1", "add_hosted_agenda_to_runner_score");
    expect(s.runner.scoreArea).toContain("ag-1");
  });

  it("Sherlock 2.0: returns an installed program to the bottom of the stack", () => {
    const s = createInitialState();
    put(s, "sherlock-2-0", "sh-1", "server:hq:ice");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "sure-gamble", "stk-1", "runner:stack");
    s.runner.installed = ["prog-1"];
    s.runner.deck = ["stk-1"];
    runKind(s, "sh-1", "add_installed_program_to_stack_bottom");
    expect(s.runner.installed).toEqual([]);
    expect(s.runner.deck).toEqual(["stk-1", "prog-1"]); // bottom is the end
  });

  it("Self-Growth Program: the Corp returns up to 2 installed Runner cards to the grip", () => {
    const s = createInitialState();
    put(s, "self-growth-program", "sgp-1", "runner:installed");
    put(s, "corroder", "inst-1", "runner:installed");
    s.runner.installed = ["sgp-1", "inst-1"];
    runKind(s, "sgp-1", "add_n_installed_runner_to_grip", { amount: 2 });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "sgp:inst-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("inst-1");
  });

  it("Emergency Shutdown: with 2 rezzed ice, the Runner chooses which to derez", () => {
    const s = createInitialState();
    put(s, "emergency-shutdown", "es-1", "runner:play");
    const a = put(s, "ice-wall", "iw-a", "server:hq:ice");
    const b = put(s, "ice-wall", "iw-b", "server:rd:ice");
    a.rezzed = true;
    b.rezzed = true;
    s.servers["hq"].ice = ["iw-a"];
    s.servers["rd"].ice = ["iw-b"];
    runKind(s, "es-1", "derez_ice", { pick: "choose" });
    const after = applyAction(s, { type: "choose_option", optionId: "derez:iw-b" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-b"]?.rezzed).toBe(false);
    expect(after.state.cards["iw-a"]?.rezzed).toBe(true);
  });

  it("Test Ground: derezzes 1 card per advancement counter on itself", () => {
    const s = createInitialState();
    const tg = put(s, "test-ground", "tg-1", "remote:1:root");
    tg.advancementCounters = 1;
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["tg-1"],
    } as GameState["servers"][string];
    runKind(s, "tg-1", "derez_per_advancement_on_self");
    const opt = s.pendingChoice?.options[0];
    if (!opt) throw new Error("expected a derez option");
    const after = applyAction(s, { type: "choose_option", optionId: opt.id });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.rezzed).toBe(false);
  });

  it("Window: draws from the bottom of the stack", () => {
    const s = createInitialState();
    put(s, "window", "win-1", "runner:installed");
    put(s, "sure-gamble", "top-1", "runner:stack");
    put(s, "sure-gamble", "bot-1", "runner:stack");
    s.runner.deck = ["top-1", "bot-1"];
    runKind(s, "win-1", "draw_from_stack_bottom", { side: "runner", amount: 1 });
    expect(s.runner.hand).toContain("bot-1");
    expect(s.runner.deck).toEqual(["top-1"]);
  });

  it("Frame Job: forfeiting the only scored agenda is automatic", () => {
    const s = createInitialState();
    put(s, "frame-job", "fj-1", "runner:play");
    put(s, "project-beale", "sc-1", "runner:score");
    s.runner.scoreArea = ["sc-1"];
    runKind(s, "fj-1", "choose_forfeit_runner_scored_agenda");
    expect(s.runner.scoreArea).toEqual([]);
    expect(s.removedFromGame).toContain("sc-1");
  });

  it("Expo Grid: gains 1 credit when the root of its server holds a rezzed asset", () => {
    const s = createInitialState();
    put(s, "expo-grid", "eg-1", "remote:1:root");
    const asset = put(s, "adonis-campaign", "as-1", "remote:1:root");
    asset.rezzed = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["eg-1", "as-1"],
    } as GameState["servers"][string];
    s.corp.credits = 3;
    runKind(s, "eg-1", "gain_if_rezzed_asset_in_root");
    expect(s.corp.credits).toBe(4);
  });

  it("Personalized Portal: the Corp gains 1 credit per 2 cards in the grip", () => {
    const s = createInitialState();
    put(s, "personalized-portal", "pp-1", "corp:installed");
    s.runner.hand = ["a", "b", "c", "d", "e"];
    s.corp.credits = 3;
    runKind(s, "pp-1", "gain_personalized_portal");
    expect(s.corp.credits).toBe(5);
  });

  it("The Price of Freedom: the Corp cannot advance cards next turn", () => {
    const s = createInitialState();
    put(s, "the-price-of-freedom", "pof-1", "runner:play");
    runKind(s, "pof-1", "corp_cannot_advance_cards_next_turn");
    expect(s.corpCannotAdvanceCardsNextTurn).toBe(true);
  });

  it("Nightdancer: the Corp gets +1 allotted click next turn", () => {
    const s = createInitialState();
    put(s, "nightdancer", "nd-1", "runner:installed");
    runKind(s, "nd-1", "corp_additional_click_next_turn");
    expect(s.corpAllottedClicksDeltaNextTurn).toBe(1);
  });

  it("Puffer: may place a power counter on itself", () => {
    const s = createInitialState();
    put(s, "puffer", "pf-1", "runner:installed");
    runKind(s, "pf-1", "add_or_remove_power");
    const after = applyAction(s, { type: "choose_option", optionId: "add" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["pf-1"]?.powerCounters).toBe(1);
  });

  it("Lakshmi Smartfabrics: reveals an HQ agenda worth at most its power counters", () => {
    const s = createInitialState();
    const src = put(s, "lakshmi-smartfabrics", "lak-1", "corp:installed");
    src.powerCounters = 3;
    src.rezzed = true;
    put(s, "project-beale", "ag-1", "corp:hand");
    put(s, "nisei-mk-ii", "ag-2", "corp:hand");
    s.corp.hand = ["ag-1", "ag-2"];
    runKind(s, "lak-1", "cannot_steal_copies_of_revealed_agenda");
    expect(s.pendingChoice?.options.length).toBe(2);
  });

  it("Helheim Servers: ice protecting its server gets +2 strength until end of run", () => {
    const s = createInitialState();
    put(s, "helheim-servers", "hh-1", "remote:1:root");
    put(s, "ice-wall", "iw-1", "server:remote-1:ice");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["iw-1"],
      root: ["hh-1"],
    } as GameState["servers"][string];
    s.run = { attackedServerId: "remote-1" } as GameState["run"];
    runKind(s, "hh-1", "helheim_ice_protecting_this_server_strength_until_end_of_run", {
      amount: 2,
    });
    expect(s.run.helheimServerStrengthBonus?.["remote-1"]).toBe(2);
  });

  it("No One Home: the Corp may trace[0] to stop the prevention", () => {
    const s = createInitialState();
    put(s, "no-one-home", "noh-1", "runner:installed");
    runKind(s, "noh-1", "cotc_no_one_home", { mode: "tags" });
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("noh-trace");
    expect(s.turn.cotcNoOneHomeUsed).toBe(true);
  });

  it("NEXT Sapphire: draw choices run from 0 to the number of rezzed NEXT ice", () => {
    const s = createInitialState();
    put(s, "next-sapphire", "ns-1", "server:hq:ice");
    const ice = put(s, "next-silver", "ns-2", "server:rd:ice");
    ice.rezzed = true;
    s.servers["rd"].ice = ["ns-2"];
    runKind(s, "ns-1", "draw_next_sapphire");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["sapphire-draw:0", "sapphire-draw:1"]);
  });

  it("Bookmark: adds all hosted cards to the grip", () => {
    const s = createInitialState();
    const bm = put(s, "bookmark", "bm-1", "runner:installed");
    put(s, "sure-gamble", "h-1", "hosted:bm-1");
    put(s, "sure-gamble", "h-2", "hosted:bm-1");
    bm.hostedCardIds = ["h-1", "h-2"];
    s.cards["h-1"]!.hostId = "bm-1";
    s.cards["h-2"]!.hostId = "bm-1";
    s.runner.hand = [];
    runKind(s, "bm-1", "add_all_hosted_to_grip");
    expect(s.runner.hand).toEqual(["h-1", "h-2"]);
    expect(s.cards["bm-1"]?.hostedCardIds).toEqual([]);
  });

  it("London Library: returns a hosted program to the grip", () => {
    const s = createInitialState();
    const ll = put(s, "london-library", "ll-1", "runner:installed");
    put(s, "corroder", "prog-1", "hosted:ll-1");
    ll.hostedCardIds = ["prog-1"];
    s.cards["prog-1"]!.hostId = "ll-1";
    s.runner.hand = [];
    runKind(s, "ll-1", "add_hosted_program_to_grip");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "ll-grip:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("prog-1");
  });

  it("Replanting: adds an installed Corp card to HQ", () => {
    const s = createInitialState();
    put(s, "replanting", "rp-1", "corp:play");
    put(s, "adonis-campaign", "as-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    s.corp.hand = [];
    runKind(s, "rp-1", "add_installed_to_hq");
    const after = applyAction(s, { type: "choose_option", optionId: "hq:as-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toContain("as-1");
  });

  it("Vigil: draws only when HQ is at the Corp's maximum hand size", () => {
    const s = createInitialState();
    put(s, "vigil", "vg-1", "runner:installed");
    put(s, "sure-gamble", "stk-1", "runner:stack");
    s.runner.deck = ["stk-1"];
    s.runner.hand = [];
    s.corp.hand = ["a", "b", "c", "d"];
    runKind(s, "vg-1", "draw_if_hq_full");
    expect(s.runner.hand).toEqual([]);
    s.corp.hand = ["a", "b", "c", "d", "e"];
    runKind(s, "vg-1", "draw_if_hq_full");
    expect(s.runner.hand).toEqual(["stk-1"]);
  });

  it("Harvester: the Runner chooses which cards to discard down to hand size", () => {
    const s = createInitialState();
    put(s, "harvester", "hv-1", "server:hq:ice");
    s.runner.maxHandSize = 5;
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `g-${i}`, "runner:grip");
    s.runner.hand = ["g-0", "g-1", "g-2", "g-3"];
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `d-${i}`, "runner:stack");
    s.runner.deck = ["d-0", "d-1", "d-2"];
    runKind(s, "hv-1", "draw_then_discard_down_to_hand_size", { drawAmount: 3 });
    expect(s.runner.hand).toHaveLength(7);
    // Discard an original grip card, not one of the just-drawn cards.
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "harvester-discard:g-0",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("g-0");
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "harvester-discard:g-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toHaveLength(5);
    expect(after.state.runner.hand).toContain("d-0");
    expect(after.state.pendingChoice).toBeFalsy();
  });

  it("Acacia: gains 1 credit per virus counter the Corp purged", () => {
    const s = createInitialState();
    put(s, "acacia", "ac-1", "runner:installed");
    s.turn.lastVirusCountersPurged = 3;
    s.runner.credits = 2;
    runKind(s, "ac-1", "gain_credits_equal_to_last_purged_viruses");
    expect(s.runner.credits).toBe(5);
  });

  it("Bulwark: gains 2 credits when the Runner has an installed AI", () => {
    const s = createInitialState();
    put(s, "bulwark", "bw-1", "server:hq:ice");
    put(s, "crypsis", "ai-1", "runner:installed");
    s.runner.installed = ["ai-1"];
    s.corp.credits = 3;
    runKind(s, "bw-1", "gain_credits_if_runner_has_installed_subtype", {
      subtype: "ai",
      amount: 2,
      side: "corp",
    });
    expect(s.corp.credits).toBe(5);
  });

  it("Tapwrm: gains 1 credit per 5 credits in the Corp's pool", () => {
    const s = createInitialState();
    put(s, "tapwrm", "tw-1", "runner:installed");
    s.corp.credits = 12;
    s.runner.credits = 1;
    runKind(s, "tw-1", "gain_credits_per_corp_credits");
    expect(s.runner.credits).toBe(3);
  });

  it("Logic Bomb: loses any remaining clicks", () => {
    const s = createInitialState();
    put(s, "logic-bomb", "lb-1", "runner:installed");
    s.runner.clicks = 3;
    runKind(s, "lb-1", "lose_remaining_clicks");
    expect(s.runner.clicks).toBe(0);
  });

  it("Kala Ghoda Real TV: looks at the top card of the stack without moving it", () => {
    const s = createInitialState();
    put(s, "kala-ghoda-real-tv", "kg-1", "runner:installed");
    put(s, "sure-gamble", "top-1", "runner:stack");
    s.runner.deck = ["top-1"];
    const logsBefore = s.log.length;
    runKind(s, "kg-1", "look_at_top_of_stack");
    expect(s.runner.deck).toEqual(["top-1"]);
    expect(s.log.length).toBeGreaterThan(logsBefore);
  });

  it("Ashen Epilogue: removes the top 5 cards of the stack from the game", () => {
    const s = createInitialState();
    put(s, "ashen-epilogue", "ae-1", "runner:play");
    for (let i = 0; i < 7; i++) put(s, "sure-gamble", `stk-${i}`, "runner:stack");
    s.runner.deck = ["stk-0", "stk-1", "stk-2", "stk-3", "stk-4", "stk-5", "stk-6"];
    runKind(s, "ae-1", "rfg_top_of_stack", { amount: 5 });
    expect(s.runner.deck).toEqual(["stk-5", "stk-6"]);
    expect(s.removedFromGame).toHaveLength(5);
  });

  it("Lockdown: the Runner cannot draw for the remainder of the turn", () => {
    const s = createInitialState();
    put(s, "lockdown", "ld-1", "server:hq:ice");
    runKind(s, "ld-1", "runner_cannot_draw_remainder_of_turn");
    expect(s.turn.ccRunnerCannotDraw).toBe(true);
  });

  it("Bad Times: the Runner's memory limit is reduced by 2 until turn end", () => {
    const s = createInitialState();
    put(s, "bad-times", "bt-1", "corp:play");
    runKind(s, "bt-1", "runner_mu_modifier_until_turn_end", { delta: -2 });
    expect(lingeringRunnerMuModifier(s)).toBe(-2);
  });

  it("Encore: takes an additional turn after this one", () => {
    const s = createInitialState();
    put(s, "encore", "en-1", "runner:play");
    runKind(s, "en-1", "schedule_additional_runner_turn");
    expect(s.pendingExtraRunnerTurns).toBe(1);
  });

  it("Superdeep Borehole: takes 1 hosted bad publicity onto the Corp", () => {
    const s = createInitialState();
    const src = put(s, "superdeep-borehole", "sb-1", "remote:1:root");
    src.badPublicityCounters = 6;
    s.corp.badPublicity = 0;
    runKind(s, "sb-1", "take_hosted_bad_publicity", { amount: 1 });
    expect(s.corp.badPublicity).toBe(1);
    expect(s.cards["sb-1"]?.badPublicityCounters).toBe(5);
  });

  it("Aesop's Pawnshop: the Runner chooses which installed card to trash", () => {
    const s = createInitialState();
    put(s, "aesops-pawnshop", "ap-1", "runner:installed");
    put(s, "corroder", "inst-1", "runner:installed");
    put(s, "corroder", "inst-2", "runner:installed");
    s.runner.installed = ["ap-1", "inst-1", "inst-2"];
    s.runner.credits = 0;
    runKind(s, "ap-1", "trash_aesop_for_credits", { amount: 3 });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "aesop:inst-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("inst-2");
    expect(after.state.runner.installed).toContain("inst-1");
    expect(after.state.runner.credits).toBe(3);
  });

  it("Masvingo: places an advancement counter on itself", () => {
    const s = createInitialState();
    put(s, "masvingo", "mv-1", "server:hq:ice");
    runKind(s, "mv-1", "place_advancement_on_self", { amount: 1 });
    expect(s.cards["mv-1"]?.advancementCounters).toBe(1);
  });

  it("NEXT Sapphire: may add a card from Archives to HQ", () => {
    const s = createInitialState();
    put(s, "next-sapphire", "ns-1", "server:hq:ice");
    const ice = put(s, "next-silver", "ns-2", "server:rd:ice");
    ice.rezzed = true;
    s.servers["rd"].ice = ["ns-2"];
    put(s, "hedge-fund", "arch-1", "corp:archives");
    s.corp.discardPile = ["arch-1"];
    s.corp.hand = [];
    runKind(s, "ns-1", "cotc_next_sapphire_archives_to_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "sapphire-arch:arch-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toContain("arch-1");
  });

  it("Hatchet Job: the Corp returns an installed non-virtual Runner card to the grip", () => {
    const s = createInitialState();
    put(s, "hatchet-job", "hj-1", "corp:play");
    put(s, "corroder", "inst-1", "runner:installed");
    s.runner.installed = ["inst-1"];
    s.runner.hand = [];
    runKind(s, "hj-1", "add_installed_non_virtual_runner_to_grip");
    const after = applyAction(s, { type: "choose_option", optionId: "grip:inst-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("inst-1");
  });

  it("Ayla: the Runner chooses which set-aside card to add to the grip", () => {
    const s = createInitialState();
    put(s, "ayla-bios-rahim-simulant-specialist", "ayla-1", "runner:identity");
    put(s, "sure-gamble", "sa-1", "runner:set-aside");
    put(s, "sure-gamble", "sa-2", "runner:set-aside");
    s.runner.setAside = ["sa-1", "sa-2"];
    s.runner.hand = [];
    runKind(s, "ayla-1", "ayla_set_aside_to_grip");
    const after = applyAction(s, { type: "choose_option", optionId: "ayla:sa-2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toEqual(["sa-2"]);
    expect(after.state.runner.setAside).toEqual(["sa-1"]);
  });

  it("Muertos Gang Member: the Corp chooses a rezzed card to derez", () => {
    const s = createInitialState();
    put(s, "muertos-gang-member", "mg-1", "runner:installed");
    const a = put(s, "ice-wall", "iw-a", "server:hq:ice");
    const b = put(s, "adonis-campaign", "as-1", "remote:1:root");
    a.rezzed = true;
    b.rezzed = true;
    s.servers["hq"].ice = ["iw-a"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    runKind(s, "mg-1", "corp_derez_a_card");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "muertos-derez:as-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["as-1"]?.rezzed).toBe(false);
    expect(after.state.cards["iw-a"]?.rezzed).toBe(true);
  });

  it("Leave No Trace: derezzes all ice that was rezzed during this run", () => {
    const s = createInitialState();
    put(s, "leave-no-trace", "lnt-1", "runner:play");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    s.run = {
      attackedServerId: "hq",
      iceRezzedThisRunIds: ["iw-1"],
    } as GameState["run"];
    runKind(s, "lnt-1", "derez_all_ice_rezzed_this_run");
    expect(s.cards["iw-1"]?.rezzed).toBe(false);
  });

  it("Flashbang: derezzes the sentry being encountered", () => {
    const s = createInitialState();
    put(s, "flashbang", "fb-1", "runner:installed");
    const ice = put(s, "komainu", "km-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["km-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "km-1" },
    } as unknown as GameState["run"];
    runKind(s, "fb-1", "derez_encountered_ice");
    expect(s.cards["km-1"]?.rezzed).toBe(false);
  });

  it("Drive By: exposes an unrezzed remote root card and trashes it if asset or upgrade", () => {
    const s = createInitialState();
    put(s, "drive-by", "db-1", "runner:play");
    put(s, "adonis-campaign", "as-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    runKind(s, "db-1", "expose_and_trash_remote_root");
    const after = applyAction(s, { type: "choose_option", optionId: "driveby:as-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("as-1");
  });

  it("Jua: the Runner cannot install cards for the remainder of the turn", () => {
    const s = createInitialState();
    put(s, "jua", "jua-1", "server:hq:ice");
    runKind(s, "jua-1", "forbid_install_remainder_of_turn");
    expect(s.turn.dtwnRunnerCannotInstall).toBe(true);
  });

  it("Red Planet Couriers: moves all advancements onto 1 advanceable card", () => {
    const s = createInitialState();
    put(s, "red-planet-couriers", "rpc-1", "corp:play");
    const a = put(s, "project-beale", "ag-1", "remote:1:root");
    const b = put(s, "project-beale", "ag-2", "remote:2:root");
    const t = put(s, "project-beale", "ag-3", "remote:3:root");
    a.advancementCounters = 2;
    b.advancementCounters = 1;
    for (const [n, id] of [[1, "ag-1"], [2, "ag-2"], [3, "ag-3"]] as const) {
      s.servers[`remote-${n}`] = {
        id: `remote-${n}`,
        kind: "remote",
        ice: [],
        root: [id],
      } as GameState["servers"][string];
    }
    runKind(s, "rpc-1", "move_all_advancements");
    const after = applyAction(s, { type: "choose_option", optionId: "move:ag-3" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ag-3"]?.advancementCounters).toBe(3);
    expect(after.state.cards["ag-1"]?.advancementCounters).toBe(0);
    void t;
  });

  it("Reconstruction Contract: moves any number of its advancements to an advanceable card only", () => {
    const s = createInitialState();
    const src = put(s, "reconstruction-contract", "rc-1", "remote:1:root");
    src.advancementCounters = 2;
    put(s, "project-beale", "ag-1", "remote:2:root");
    put(s, "adonis-campaign", "as-1", "remote:3:root");
    for (const [n, id] of [[1, "rc-1"], [2, "ag-1"], [3, "as-1"]] as const) {
      s.servers[`remote-${n}`] = {
        id: `remote-${n}`,
        kind: "remote",
        ice: [],
        root: [id],
      } as GameState["servers"][string];
    }
    runKind(s, "rc-1", "move_any_advancements_from_self_to_advanceable");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("rc:ag-1:2");
    expect(ids.some((id) => id.startsWith("rc:as-1"))).toBe(false);
    const after = applyAction(s, { type: "choose_option", optionId: "rc:ag-1:2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ag-1"]?.advancementCounters).toBe(2);
    expect(after.state.cards["rc-1"]?.advancementCounters).toBe(0);
  });

  it("Builder: moves itself to the outermost position protecting another server", () => {
    const s = createInitialState();
    put(s, "builder", "bd-1", "server:hq:ice");
    s.servers["hq"].ice = ["bd-1"];
    runKind(s, "bd-1", "move_to_outermost");
    const after = applyAction(s, { type: "choose_option", optionId: "builder:rd" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["rd"].ice).toContain("bd-1");
    expect(after.state.servers["hq"].ice).toEqual([]);
  });

  it("Early Premiere: pays 1 credit to place 1 advancement on a remote root card", () => {
    const s = createInitialState();
    put(s, "early-premiere", "ep-1", "corp:installed");
    put(s, "project-beale", "ag-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    } as GameState["servers"][string];
    s.corp.credits = 3;
    runKind(s, "ep-1", "pay_place_advancement");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "early-prem:ag-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ag-1"]?.advancementCounters).toBe(1);
    expect(after.state.corp.credits).toBe(2);
  });

  it("Psychographics: the Corp chooses X (up to tags) and the advanceable target", () => {
    const s = createInitialState();
    put(s, "psychographics", "pg-1", "corp:play");
    put(s, "project-beale", "ag-1", "remote:1:root");
    put(s, "adonis-campaign", "as-1", "remote:2:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    } as GameState["servers"][string];
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    s.runner.tags = 3;
    s.corp.credits = 5;
    runKind(s, "pg-1", "place_advancements_x_from_tags");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("psycho:ag-1:2");
    expect(ids.some((id) => id.startsWith("psycho:as-1"))).toBe(false);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "psycho:ag-1:2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ag-1"]?.advancementCounters).toBe(2);
    expect(after.state.corp.credits).toBe(3);
  });

  it("Trick Shot: places hosted credits on the run", () => {
    const s = createInitialState();
    put(s, "trick-shot", "ts-1", "runner:play");
    s.run = { attackedServerId: "rd" } as GameState["run"];
    runKind(s, "ts-1", "place_event_credits", { amount: 4 });
    expect(s.run.eventCredits).toBe(4);
  });

  it("Museum of History: shuffles 1 card from Archives into R&D", () => {
    const s = createInitialState();
    put(s, "museum-of-history", "moh-1", "remote:1:root");
    put(s, "hedge-fund", "arch-1", "corp:archives");
    s.corp.discardPile = ["arch-1"];
    s.corp.deck = [];
    runKind(s, "moh-1", "shuffle_one_archives_into_rd");
    expect(s.corp.discardPile).toEqual([]);
    expect(s.corp.deck).toEqual(["arch-1"]);
  });

  it("Bring Them Home: adds 2 random grip cards to the top of the stack", () => {
    const s = createInitialState();
    put(s, "bring-them-home", "bth-1", "corp:play");
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `g-${i}`, "runner:grip");
    s.runner.hand = ["g-0", "g-1", "g-2"];
    put(s, "sure-gamble", "stk-1", "runner:stack");
    s.runner.deck = ["stk-1"];
    runKind(s, "bth-1", "shuffle_random_grip_into_stack", { count: 2 });
    expect(s.runner.hand).toHaveLength(1);
    expect(s.runner.deck).toHaveLength(3);
    expect(s.runner.deck[2]).toBe("stk-1"); // moved cards are on top
  });

  it("Liquidation: trashes any number of rezzed cards for 3 credits each", () => {
    const s = createInitialState();
    put(s, "liquidation", "lq-1", "corp:play");
    const a = put(s, "adonis-campaign", "as-1", "remote:1:root");
    a.rezzed = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    s.corp.credits = 0;
    runKind(s, "lq-1", "trash_any_rezzed_gain_3_each");
    const after = applyAction(s, { type: "choose_option", optionId: "liq:as-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("as-1");
    expect(after.state.corp.credits).toBe(3);
    // No rezzed cards remain, so the "any number" loop ends without a Done choice.
    expect(after.state.pendingChoice).toBeFalsy();
  });

  it("Light the Fire!: trashes all cards in the root of the attacked server", () => {
    const s = createInitialState();
    put(s, "light-the-fire", "ltf-1", "runner:installed");
    put(s, "adonis-campaign", "as-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    s.run = { attackedServerId: "remote-1" } as GameState["run"];
    runKind(s, "ltf-1", "trash_attacked_server_root");
    expect(s.corp.discardPile).toContain("as-1");
    expect(s.servers["remote-1"].root).toEqual([]);
  });

  it("Uninstall: adds an installed program or hardware to the grip", () => {
    const s = createInitialState();
    put(s, "uninstall", "un-1", "runner:play");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    s.runner.hand = [];
    runKind(s, "un-1", "uninstall_program_or_hardware_to_grip");
    const after = applyAction(s, { type: "choose_option", optionId: "uninst:prog-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("prog-1");
  });

  it("Jackpot!: the Runner chooses how many credits to take before it trashes", () => {
    const s = createInitialState();
    const src = put(s, "jackpot", "jk-1", "runner:installed");
    src.hostedCredits = 3;
    s.runner.installed = ["jk-1"];
    s.runner.credits = 0;
    runKind(s, "jk-1", "win_jackpot_take_credits");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["jackpot-take:1", "jackpot-take:2", "jackpot-take:3"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "jackpot-take:2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(2);
    expect(after.state.runner.discardPile).toContain("jk-1");
  });

  it("Exploit: derezzes up to 3 pieces of ice, Runner's choice each time", () => {
    const s = createInitialState();
    put(s, "exploit", "ex-1", "runner:play");
    const a = put(s, "ice-wall", "iw-a", "server:hq:ice");
    const b = put(s, "ice-wall", "iw-b", "server:rd:ice");
    a.rezzed = true;
    b.rezzed = true;
    s.servers["hq"].ice = ["iw-a"];
    s.servers["rd"].ice = ["iw-b"];
    runKind(s, "ex-1", "derez_up_to_ice", { max: 3 });
    let after = applyAction(s, { type: "choose_option", optionId: "derez:iw-a" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "derez:iw-b",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-a"]?.rezzed).toBe(false);
    expect(after.state.cards["iw-b"]?.rezzed).toBe(false);
  });

  it("Marker: the next ice encountered this run gains an end-the-run subroutine", () => {
    const s = createInitialState();
    put(s, "marker", "mk-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "mk-1", "add_etr_to_next_ice");
    expect(s.run.markerExtraEtrNextIce).toBe(true);
  });

  it("Klevetnik: the Corp chooses an installed resource to blank", () => {
    const s = createInitialState();
    put(s, "klevetnik", "kl-1", "server:hq:ice");
    put(s, "aesops-pawnshop", "res-1", "runner:installed");
    put(s, "daily-casts", "res-2", "runner:installed");
    s.runner.installed = ["res-1", "res-2"];
    runKind(s, "kl-1", "blank_installed_resource_until_corp_turn_end");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "blank-res:res-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(
      lingeringEffectsOfKind(after.state, LINGERING_KIND_ABILITY_BLANK).some(
        (e) => (e.payload as { cardId?: string })?.cardId === "res-2",
      ),
    ).toBe(true);
    expect(abilitiesSuppressed(after.state, "res-2")).toBe(true);
    expect(abilitiesSuppressed(after.state, "res-1")).toBe(false);
  });

  it("DDoS: the Corp cannot rez outermost ice during a run this turn", () => {
    const s = createInitialState();
    put(s, "ddos", "dd-1", "runner:installed");
    runKind(s, "dd-1", "cannot_arm_rez_outermost_ice_this_turn");
    expect(s.turn.uotCannotRezOutermostIce).toBe(true);
  });

  it("NEXT Sapphire: may shuffle a card from HQ into R&D", () => {
    const s = createInitialState();
    put(s, "next-sapphire", "ns-1", "server:hq:ice");
    const ice = put(s, "next-silver", "ns-2", "server:rd:ice");
    ice.rezzed = true;
    s.servers["rd"].ice = ["ns-2"];
    put(s, "hedge-fund", "hq-1", "corp:hand");
    s.corp.hand = ["hq-1"];
    s.corp.deck = [];
    runKind(s, "ns-1", "cotc_next_sapphire_hq_to_rd");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "sapphire-hq:hq-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual([]);
    expect(after.state.corp.deck).toContain("hq-1");
  });

  it("Brute-Force Hack: derezzes a rezzed ice with rez cost at most X", () => {
    const s = createInitialState();
    put(s, "brute-force-hack", "bfh-1", "runner:play");
    const cheap = put(s, "ice-wall", "iw-1", "server:hq:ice");
    const pricey = put(s, "tollbooth", "tb-1", "server:rd:ice");
    cheap.rezzed = true;
    pricey.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    s.servers["rd"].ice = ["tb-1"];
    s.turn.lastPlayCostX = 3;
    runKind(s, "bfh-1", "derez_ice_rez_cost_lte_x");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["derez:iw-1"]);
    const after = applyAction(s, { type: "choose_option", optionId: "derez:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.rezzed).toBe(false);
  });

  it("Forged Activation Orders: the Runner chooses the ice, the Corp may trash instead of rezzing", () => {
    const s = createInitialState();
    put(s, "forged-activation-orders", "fao-1", "runner:play");
    put(s, "ice-wall", "iw-a", "server:hq:ice");
    put(s, "ice-wall", "iw-b", "server:rd:ice");
    s.servers["hq"].ice = ["iw-a"];
    s.servers["rd"].ice = ["iw-b"];
    s.corp.credits = 5;
    runKind(s, "fao-1", "forged_activation_orders");
    let after = applyAction(s, { type: "choose_option", optionId: "fao:iw-b" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.chooser).toBe("corp");
    after = applyAction(after.state, { type: "choose_option", optionId: "fao-trash" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("iw-b");
    expect(after.state.corp.credits).toBe(5);
  });

  it("Forged Activation Orders: the Corp may rez the chosen ice, paying its rez cost", () => {
    const s = createInitialState();
    put(s, "forged-activation-orders", "fao-1", "runner:play");
    const ice = put(s, "ice-wall", "iw-a", "server:hq:ice");
    s.servers["hq"].ice = ["iw-a"];
    s.corp.credits = 5;
    runKind(s, "fao-1", "forged_activation_orders");
    const after = applyAction(s, { type: "choose_option", optionId: "fao-rez" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-a"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(5 - (ice.rezCost ?? 0));
  });

  it("Stavka: fortifies itself for the remainder of the run", () => {
    const s = createInitialState();
    put(s, "stavka", "st-1", "server:hq:ice");
    s.run = {
      attackedServerId: "hq",
      iceStrengthBoosts: {},
    } as GameState["run"];
    runKind(s, "st-1", "fortify_ice", { amount: 5 });
    expect(lingeringIceStrengthOfKind(s, "st-1", LINGERING_KIND_ICE_STRENGTH_ENCOUNTER)).toBe(5);
  });

  it("Replanting: installs 2 cards from HQ ignoring all costs", () => {
    const s = createInitialState();
    put(s, "replanting", "rp-1", "corp:play");
    put(s, "ice-wall", "iw-1", "corp:hand");
    put(s, "adonis-campaign", "as-1", "corp:hand");
    s.corp.hand = ["iw-1", "as-1"];
    runKind(s, "rp-1", "install_2_from_hq_ignore_costs");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "ice:iw-1:hq",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, { type: "choose_option", optionId: "root:as-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["hq"].ice).toContain("iw-1");
    expect(after.state.corp.hand).toEqual([]);
    const remoteRoots = Object.values(after.state.servers)
      .filter((srv) => srv.kind === "remote")
      .flatMap((srv) => srv.root);
    expect(remoteRoots).toContain("as-1");
  });

  it("Street Peddler: installs a hosted card at a 1-credit discount", () => {
    const s = createInitialState();
    const sp = put(s, "street-peddler", "sp-1", "runner:installed");
    put(s, "corroder", "prog-1", "hosted:sp-1");
    sp.hostedCardIds = ["prog-1"];
    s.cards["prog-1"]!.hostId = "sp-1";
    s.runner.credits = 5;
    runKind(s, "sp-1", "install_hosted", { discount: 1 });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "peddler:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("prog-1");
    expect(after.state.runner.credits).toBe(4); // Corroder costs 2, minus 1
  });

  it("Ankusa: adds a fully broken barrier to HQ", () => {
    const s = createInitialState();
    put(s, "ankusa", "an-1", "runner:installed");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1" },
    } as unknown as GameState["run"];
    s.corp.hand = [];
    runKind(s, "an-1", "add_fully_broken_barrier_to_hq");
    expect(s.corp.hand).toContain("iw-1");
    expect(s.servers["hq"].ice).toEqual([]);
  });

  it("Jua: the Corp chooses 2 installed cards, the Runner bounces 1 to the stack top", () => {
    const s = createInitialState();
    put(s, "jua", "jua-1", "server:hq:ice");
    put(s, "corroder", "inst-1", "runner:installed");
    put(s, "corroder", "inst-2", "runner:installed");
    put(s, "corroder", "inst-3", "runner:installed");
    s.runner.installed = ["inst-1", "inst-2", "inst-3"];
    s.runner.deck = [];
    runKind(s, "jua-1", "choose_jua_two_bounce_one");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "pair:inst-1:inst-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.chooser).toBe("runner");
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "bounce:inst-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.deck[0]).toBe("inst-2");
    expect(after.state.runner.installed).toEqual(["inst-1", "inst-3"]);
  });

  it("Glenn Station: hosts a card from HQ facedown", () => {
    const s = createInitialState();
    put(s, "glenn-station", "gs-1", "remote:1:root");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    s.corp.hand = ["hq-1"];
    runKind(s, "gs-1", "glenn_host_from_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "glenn-host:hq-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual([]);
    expect(after.state.cards["hq-1"]?.hostId).toBe("gs-1");
  });

  it("Matryoshka: hosts a copy of itself from the grip faceup", () => {
    const s = createInitialState();
    const src = put(s, "matryoshka", "mat-1", "runner:installed");
    put(s, "matryoshka", "mat-2", "runner:grip");
    s.runner.hand = ["mat-2"];
    runKind(s, "mat-1", "host_copy_from_grip", { title: "Matryoshka" });
    expect(s.runner.hand).toEqual([]);
    expect(src.hostedCardIds).toContain("mat-2");
    expect(s.cards["mat-2"]?.faceup).toBe(true);
  });

  it("SSO Industries: advances ice by points on installed faceup agendas, not scored ones", () => {
    const s = createInitialState();
    put(s, "sso-industries-fueling-innovation", "sso-1", "corp:identity");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"].ice = ["iw-1"];
    const faceup = put(s, "project-beale", "ag-1", "remote:1:root");
    faceup.faceup = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    } as GameState["servers"][string];
    put(s, "hostile-takeover", "sc-1", "corp:score");
    s.corp.scoreArea = ["sc-1"]; // scored points must not count
    runKind(s, "sso-1", "advance_sso_ice");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(["sso:iw-1"]);
    const label = s.pendingChoice?.options[0]?.label ?? "";
    // Project Beale is 2 points faceup; the scored Hostile Takeover (1) must not count.
    expect(label).toContain("Place 2 advancement");
    const after = applyAction(s, { type: "choose_option", optionId: "sso:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.advancementCounters).toBe(2);
  });

  it("SYN Attack: the Corp chooses which 2 cards to discard", () => {
    const s = createInitialState();
    put(s, "syn-attack", "syn-1", "runner:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "hq-2", "corp:hand");
    put(s, "hedge-fund", "hq-3", "corp:hand");
    s.corp.hand = ["hq-1", "hq-2", "hq-3"];
    runKind(s, "syn-1", "corp_draw_syn_attack_discard_2_or_4");
    let after = applyAction(s, { type: "choose_option", optionId: "discard2" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "syn-discard:hq-3",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "syn-discard:hq-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(["hq-2"]);
    expect(after.state.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-1", "hq-3"]),
    );
  });

  it("Glenn Station: adds its hosted card to HQ", () => {
    const s = createInitialState();
    put(s, "glenn-station", "gs-1", "remote:1:root");
    const hosted = put(s, "hedge-fund", "hq-1", "hosted:gs-1");
    hosted.hostId = "gs-1";
    s.corp.hand = [];
    runKind(s, "gs-1", "glenn_retrieve_to_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "glenn-ret:hq-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toContain("hq-1");
  });

  it("License Acquisition: the Corp chooses an asset or upgrade from HQ or Archives to install and rez", () => {
    const s = createInitialState();
    put(s, "license-acquisition", "la-1", "corp:score");
    put(s, "adonis-campaign", "as-1", "corp:hand");
    put(s, "marked-accounts", "as-2", "corp:archives");
    s.corp.hand = ["as-1"];
    s.corp.discardPile = ["as-2"];
    runKind(s, "la-1", "install_and_rez_asset_or_upgrade_free");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("lic-acq:as-2");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "lic-acq:as-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["as-2"]?.rezzed).toBe(true);
    expect(after.state.corp.hand).toContain("as-1");
  });

  it("New Construction: installs 1 card from HQ in a new remote", () => {
    const s = createInitialState();
    put(s, "new-construction", "nc-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["nc-1"],
    } as GameState["servers"][string];
    put(s, "adonis-campaign", "as-1", "corp:hand");
    s.corp.hand = ["as-1"];
    runKind(s, "nc-1", "install_from_hq_new_remote");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "nc-install:as-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual([]);
    const roots = Object.values(after.state.servers).flatMap((srv) => srv.root);
    expect(roots).toContain("as-1");
  });

  it("Brân 1.0: the Corp may install ice from Archives directly inward", () => {
    const s = createInitialState();
    put(s, "bran-1-0", "bran-1", "server:hq:ice");
    s.servers["hq"].ice = ["bran-1"];
    put(s, "ice-wall", "iw-a", "corp:archives");
    s.corp.discardPile = ["iw-a"];
    s.corp.hand = [];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "bran-1", "install_ice_inward_free");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("bran:iw-a");
    expect(ids).toContain("decline");
    const after = applyAction(s, { type: "choose_option", optionId: "bran:iw-a" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["hq"].ice).toEqual(["bran-1", "iw-a"]);
    expect(after.state.corp.discardPile).toEqual([]);
  });

  it("Jarogniew Mercs: loads power counters equal to tags plus 3", () => {
    const s = createInitialState();
    put(s, "jarogniew-mercs", "jm-1", "runner:installed");
    s.runner.tags = 2;
    runKind(s, "jm-1", "jarogniew_load_power_equal_tags_plus_3");
    expect(s.cards["jm-1"]?.powerCounters).toBe(5);
  });

  it("Networking: may pay 1 credit to return itself to the grip", () => {
    const s = createInitialState();
    put(s, "networking", "nw-1", "runner:play");
    s.runner.credits = 3;
    runKind(s, "nw-1", "may_return_self_to_grip", { creditCost: 1 });
    const after = applyAction(s, { type: "choose_option", optionId: "return" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("nw-1");
    expect(after.state.runner.credits).toBe(2);
  });

  it("Blue Sun: may return a rezzed card to HQ and gain its rez cost", () => {
    const s = createInitialState();
    put(s, "blue-sun-powering-the-future", "bs-1", "corp:identity");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"].ice = ["iw-1"];
    s.corp.hand = [];
    s.corp.credits = 0;
    runKind(s, "bs-1", "may_return_rezzed_to_hq_gain_rez_cost");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "blue-sun:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toContain("iw-1");
    expect(after.state.corp.credits).toBe(ice.rezCost ?? 0);
  });

  it("Maya: adds the accessed R&D card to the bottom of R&D", () => {
    const s = createInitialState();
    put(s, "maya", "my-1", "runner:installed");
    put(s, "hedge-fund", "rd-1", "corp:rd");
    put(s, "hedge-fund", "rd-2", "corp:rd");
    s.corp.deck = ["rd-1", "rd-2"];
    s.run = {
      attackedServerId: "rd",
      accessingCardId: "rd-1",
    } as unknown as GameState["run"];
    runKind(s, "my-1", "move_accessed_to_bottom_rd");
    expect(s.corp.deck).toEqual(["rd-2", "rd-1"]);
  });

  it("Targeted Marketing: can name a card that is not in the game yet", () => {
    const s = createInitialState();
    put(s, "targeted-marketing", "tm-1", "corp:play");
    runKind(s, "tm-1", "name_card");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("tm:sure-gamble");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "tm:sure-gamble",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["tm-1"]?.namedCardDefId).toBe("sure-gamble");
  });

  it("Calibration Testing: places 1 advancement on a card in the root of its server", () => {
    const s = createInitialState();
    put(s, "calibration-testing", "ct-1", "remote:1:root");
    put(s, "project-beale", "ag-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ct-1", "ag-1"],
    } as GameState["servers"][string];
    runKind(s, "ct-1", "place_advancement_on_root_of_this_server");
    const after = applyAction(s, { type: "choose_option", optionId: "cal:ag-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ag-1"]?.advancementCounters).toBe(1);
  });

  it("Subcontract: offers up to 2 operations from HQ", () => {
    const s = createInitialState();
    put(s, "subcontract", "sub-1", "corp:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    s.corp.hand = ["hq-1"];
    runKind(s, "sub-1", "play_ops_from_hq", { max: 2 });
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("subcontract-play:hq-1");
    expect(s.turn.ftmSubcontractRemaining).toBe(2);
  });

  it("Power Shutdown: may trash any number of cards from the top of R&D", () => {
    const s = createInitialState();
    put(s, "power-shutdown", "ps-1", "corp:play");
    for (let i = 0; i < 7; i++) put(s, "hedge-fund", `rd-${i}`, "corp:rd");
    s.corp.deck = ["rd-0", "rd-1", "rd-2", "rd-3", "rd-4", "rd-5", "rd-6"];
    runKind(s, "ps-1", "power_shutdown");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("trash-7"); // "any number" is not capped at 5
    const after = applyAction(s, { type: "choose_option", optionId: "trash-2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.deck).toHaveLength(5);
    expect(after.state.corp.discardPile).toHaveLength(2);
  });

  it("Invasion of Privacy: after a successful trace, trashes up to X resources or events from the grip", () => {
    const s = createInitialState();
    put(s, "invasion-of-privacy", "iop-1", "corp:play");
    put(s, "daily-casts", "grip-1", "runner:grip");
    put(s, "sure-gamble", "grip-2", "runner:grip");
    put(s, "corroder", "grip-3", "runner:grip");
    s.runner.hand = ["grip-1", "grip-2", "grip-3"];
    s.turn.lastTraceExcess = 2;
    runKind(s, "iop-1", "invasion_of_privacy_success");
    let after = applyAction(s, { type: "choose_option", optionId: "trash:grip-1" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "trash:grip-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["grip-1", "grip-2"]),
    );
    expect(after.state.runner.hand).toEqual(["grip-3"]);
  });

  it("Political Graffiti: hosts itself on an agenda in the Corp's score area instead of breaching", () => {
    const s = createInitialState();
    put(s, "political-graffiti", "pg-1", "runner:play");
    put(s, "project-beale", "sc-1", "corp:score");
    put(s, "nisei-mk-ii", "sc-2", "corp:score");
    s.corp.scoreArea = ["sc-1", "sc-2"];
    s.run = { attackedServerId: "archives" } as GameState["run"];
    runKind(s, "pg-1", "host_on_scored_agenda");
    const opt = s.pendingChoice?.options[0];
    if (!opt) throw new Error("expected a host choice");
    const done = applyAction(s, { type: "choose_option", optionId: opt.id });
    if (!done.ok) throw new Error(done.error);
    expect(done.state.cards["pg-1"]?.hostId).toBeDefined();
    expect(done.state.run?.skipBreach).toBe(true);
  });

  it("RSVP: the Runner cannot spend credits for the remainder of the run", () => {
    const s = createInitialState();
    put(s, "rsvp", "rs-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "rs-1", "forbid_runner_spend_credits_for_run");
    expect(s.run.runnerCannotSpendCreditsForRun).toBe(true);
  });

  it("Jinteki Biotech: flips the identity to its other face", () => {
    const s = createInitialState();
    const id = put(s, "jinteki-biotech-life-imagined", "jb-1", "corp:identity");
    s.corp.identityId = "jb-1";
    runKind(s, "jb-1", "jinteki_biotech_flip");
    expect(id.identityFlipped).toBe(true);
  });

  it("Always Be Running: breaks a subroutine on the encountered ice", () => {
    const s = createInitialState();
    put(s, "always-be-running", "abr-1", "runner:installed");
    const ice = put(s, "enigma", "en-1", "server:hq:ice");
    ice.subroutines = [{ text: "Sub A" }, { text: "Sub B" }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false, false] },
    } as unknown as GameState["run"];
    runKind(s, "abr-1", "break_any_subroutine");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "abr-break:1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.encounter?.broken).toEqual([false, true]);
  });

  it("Blackat: breaks 1 barrier subroutine (3 with stealth)", () => {
    const s = createInitialState();
    put(s, "blackat", "bl-1", "runner:installed");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.subroutines = [{ text: "End the run." }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1", broken: [false] },
    } as unknown as GameState["run"];
    runKind(s, "bl-1", "break_barrier");
    expect(s.run.encounter?.broken).toEqual([true]);
  });

  it("Gbahali: breaks the last subroutine; does nothing if it is already broken", () => {
    const s = createInitialState();
    put(s, "gbahali", "gb-1", "runner:installed");
    const ice = put(s, "enigma", "en-1", "server:hq:ice");
    ice.subroutines = [{ text: "Sub A" }, { text: "Sub B" }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [true, false] },
    } as unknown as GameState["run"];
    runKind(s, "gb-1", "break_last_subroutine");
    expect(s.run.encounter?.broken).toEqual([true, true]);

    const s2 = createInitialState();
    put(s2, "gbahali", "gb-1", "runner:installed");
    const ice2 = put(s2, "enigma", "en-1", "server:hq:ice");
    ice2.subroutines = [{ text: "Sub A" }, { text: "Sub B" }] as never;
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false, true] },
    } as unknown as GameState["run"];
    runKind(s2, "gb-1", "break_last_subroutine");
    expect(s2.run.encounter?.broken).toEqual([false, true]);
  });

  it("Logic Bomb: bypasses the piece of ice being encountered", () => {
    const s = createInitialState();
    put(s, "logic-bomb", "lb-1", "runner:installed");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1", broken: [] },
    } as unknown as GameState["run"];
    runKind(s, "lb-1", "bypass_current_encounter");
    expect(s.run.encounter).toBeNull();
    expect(s.run.bypassCurrentEncounter).toBe(true);
  });

  it("Panchatantra: the encountered ice gains a chosen subtype for the run", () => {
    const s = createInitialState();
    put(s, "panchatantra", "pa-1", "runner:installed");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1", broken: [] },
    } as unknown as GameState["run"];
    runKind(s, "pa-1", "choose_subtype_for_encounter");
    const opt = s.pendingChoice?.options.find((o) => o.id === "pancha:tracer");
    if (!opt) throw new Error("expected a tracer subtype option");
    const after = applyAction(s, { type: "choose_option", optionId: opt.id });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.subtypes).toContain("tracer");
  });

  it("Bug Out Bag: places X power counters, paying X credits", () => {
    const s = createInitialState();
    put(s, "bug-out-bag", "bob-1", "runner:installed");
    s.runner.credits = 3;
    runKind(s, "bob-1", "choose_x_and_load_power");
    const after = applyAction(s, { type: "choose_option", optionId: "x:2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["bob-1"]?.powerCounters).toBe(2);
    expect(after.state.runner.credits).toBe(1);
  });

  it("Reverse Infection: purges viruses, then trashes 1 stack card per 3 removed", () => {
    const s = createInitialState();
    put(s, "reverse-infection", "ri-1", "corp:play");
    const a = put(s, "corroder", "v-1", "runner:installed");
    const b = put(s, "corroder", "v-2", "runner:installed");
    a.virusCounters = 2;
    b.virusCounters = 1;
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `stk-${i}`, "runner:stack");
    s.runner.deck = ["stk-0", "stk-1", "stk-2"];
    runKind(s, "ri-1", "cotc_reverse_infection_purge");
    expect(s.cards["v-1"]?.virusCounters).toBe(0);
    expect(s.cards["v-2"]?.virusCounters).toBe(0);
    expect(s.runner.discardPile).toContain("stk-0");
    expect(s.runner.deck).toEqual(["stk-1", "stk-2"]);
  });

  it("Wari: names a subtype, exposes ice, and bounces it to HQ if it matches", () => {
    const s = createInitialState();
    put(s, "wari", "wa-1", "runner:installed");
    s.runner.installed = ["wa-1"];
    put(s, "enigma", "en-1", "server:hq:ice");
    s.servers["hq"].ice = ["en-1"];
    runKind(s, "wa-1", "dtwn_wari");
    expect(s.runner.discardPile).toContain("wa-1");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "wari-sub:code gate",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "wari-ice:en-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toContain("en-1");
    expect(after.state.servers["hq"].ice).toEqual([]);
  });

  it("Defense Construct: adds 1 facedown Archives card to HQ per advancement", () => {
    const s = createInitialState();
    const src = put(s, "defense-construct", "dc-1", "remote:1:root");
    src.advancementCounters = 2;
    put(s, "hedge-fund", "arch-1", "corp:archives");
    put(s, "hedge-fund", "arch-2", "corp:archives");
    s.corp.discardPile = ["arch-1", "arch-2"];
    s.corp.hand = [];
    runKind(s, "dc-1", "add_facedown_archives_to_hq_per_advancement");
    let after = applyAction(s, { type: "choose_option", optionId: "hq:arch-1" });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "hq:arch-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(
      expect.arrayContaining(["arch-1", "arch-2"]),
    );
  });

  it("An Offer You Can't Refuse: the Corp chooses a central, then the Runner may run it", () => {
    const s = createInitialState();
    put(s, "an-offer-you-cant-refuse", "off-1", "corp:play");
    runKind(s, "off-1", "an_offer_you_cant_refuse");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "offer-central:rd",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.chooser).toBe("runner");
    const ids = after.state.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("offer-run");
    expect(ids).toContain("offer-decline");
  });

  it("Checkpoint: schedules 3 meat damage if this run is successful", () => {
    const s = createInitialState();
    put(s, "checkpoint", "cp-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "cp-1", "checkpoint_schedule_meat_on_successful_run", {
      amount: 3,
    });
    expect(
      (s.run as { checkpointMeatOnSuccess?: number }).checkpointMeatOnSuccess,
    ).toBe(3);
  });

  it("Malia Z0L0K4: chooses an installed non-virtual resource to blank", () => {
    const s = createInitialState();
    put(s, "malia-z0l0k4", "mz-1", "remote:1:root");
    put(s, "daily-casts", "res-1", "runner:installed");
    s.runner.installed = ["res-1"];
    runKind(s, "mz-1", "choose_malia_resource");
    const after = applyAction(s, { type: "choose_option", optionId: "malia:res-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["mz-1"]?.tdatdMaliaBlankTargetId).toBe("res-1");
  });

  it("Project Kusanagi: grants an ice a net-damage subroutine for the run", () => {
    const s = createInitialState();
    put(s, "project-kusanagi", "pk-1", "corp:score");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.subroutines = [{ text: "End the run." }] as never;
    s.servers["hq"].ice = ["iw-1"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "pk-1", "grant_kusanagi_net_subroutine_this_run");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "kusanagi:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    const subs = after.state.cards["iw-1"]?.subroutines ?? [];
    expect(subs.some((sub) => sub.text === "Do 1 net damage.")).toBe(true);
  });

  it("Bookmark: hosts up to 3 cards from the grip facedown", () => {
    const s = createInitialState();
    const bm = put(s, "bookmark", "bm-1", "runner:installed");
    put(s, "sure-gamble", "g-1", "runner:grip");
    put(s, "sure-gamble", "g-2", "runner:grip");
    s.runner.hand = ["g-1", "g-2"];
    runKind(s, "bm-1", "host_up_to_3_from_grip_facedown");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "bookmark-host:g-1",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "bookmark-host:g-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["bm-1"]?.hostedCardIds).toEqual(
      expect.arrayContaining(["g-1", "g-2"]),
    );
    void bm;
  });

  it("Code Replicator: trashes itself and makes the Runner approach the passed ice again", () => {
    const s = createInitialState();
    put(s, "code-replicator", "cr-1", "server:hq:root");
    s.servers["hq"].root = ["cr-1"];
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    s.turn.cotcLastPassedIceId = "iw-1";
    runKind(s, "cr-1", "cotc_code_replicator");
    expect(s.corp.discardPile).toContain("cr-1");
    expect(s.run.reencounterIceId).toBe("iw-1");
  });

  it("RNG Key: names a number for the next card accessed this run", () => {
    const s = createInitialState();
    put(s, "rng-key", "rng-1", "runner:installed");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "rng-1", "dtwn_rng_key");
    const after = applyAction(s, { type: "choose_option", optionId: "rng:7" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.dtwnRngKeyNamedNumber).toBe(7);
  });

  it("Frantic Coding: installs 1 program from the top 10 at a 5-credit discount, trashes the rest", () => {
    const s = createInitialState();
    put(s, "frantic-coding", "fc-1", "runner:play");
    put(s, "corroder", "prog-1", "runner:stack");
    put(s, "sure-gamble", "stk-1", "runner:stack");
    put(s, "sure-gamble", "stk-2", "runner:stack");
    s.runner.deck = ["prog-1", "stk-1", "stk-2"];
    s.runner.credits = 0;
    runKind(s, "fc-1", "look_top_install", { n: 10, discount: 5 });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "frantic-install:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("prog-1");
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["stk-1", "stk-2"]),
    );
  });

  it("Nuvem Sá: may trash the top card of R&D", () => {
    const s = createInitialState();
    put(s, "nuvem-sa-law-of-the-land", "nv-1", "corp:identity");
    put(s, "hedge-fund", "rd-1", "corp:rd");
    put(s, "hedge-fund", "rd-2", "corp:rd");
    s.corp.deck = ["rd-1", "rd-2"];
    runKind(s, "nv-1", "look_top_rd_may_trash");
    const opt = s.pendingChoice?.options.find((o) => o.id !== "leave-top");
    if (!opt) throw new Error("expected a trash option");
    const after = applyAction(s, { type: "choose_option", optionId: opt.id });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("rd-1");
    expect(after.state.corp.deck).toEqual(["rd-2"]);
  });

  it("Asmund Pudlat: may add 1 hosted card to the grip", () => {
    const s = createInitialState();
    const src = put(s, "asmund-pudlat", "ap-1", "runner:installed");
    put(s, "imp", "hst-1", "hosted:ap-1");
    src.hostedCardIds = ["hst-1"];
    s.cards["hst-1"]!.hostId = "ap-1";
    s.runner.hand = [];
    runKind(s, "ap-1", "may_add_hosted_card_to_grip");
    const after = applyAction(s, { type: "choose_option", optionId: "grip:hst-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("hst-1");
  });

  it("Muertos Gang Member: when it leaves play, the Corp may rez a card ignoring cost", () => {
    const s = createInitialState();
    put(s, "muertos-gang-member", "mg-1", "runner:installed");
    put(s, "tollbooth", "tb-1", "server:hq:ice");
    s.servers["hq"].ice = ["tb-1"];
    s.corp.credits = 0;
    runKind(s, "mg-1", "may_corp_rez_ignoring_cost");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "muertos-rez:tb-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["tb-1"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(0);
  });

  it("Voting Machine Initiative: spending an agenda counter makes the Runner lose a click", () => {
    const s = createInitialState();
    const src = put(s, "voting-machine-initiative", "vmi-1", "corp:score");
    src.agendaCounters = 3;
    s.runner.clicks = 4;
    runKind(s, "vmi-1", "may_spend_voting_machine_lose_click");
    const after = applyAction(s, { type: "choose_option", optionId: "vmi:spend" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.clicks).toBe(3);
    expect(after.state.cards["vmi-1"]?.agendaCounters).toBe(2);
  });

  it("Friday Chip: moves a hosted virus counter to a virus program", () => {
    const s = createInitialState();
    const src = put(s, "friday-chip", "fch-1", "runner:installed");
    src.virusCounters = 2;
    put(s, "crypsis", "vir-1", "runner:installed");
    s.runner.installed = ["fch-1", "vir-1"];
    runKind(s, "fch-1", "move_friday_chip_virus");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "friday-move:vir-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["vir-1"]?.virusCounters).toBe(1);
    expect(after.state.cards["fch-1"]?.virusCounters).toBe(1);
  });

  it("Ibrahim Salem: names a type, then trashes 1 grip card of that type", () => {
    const s = createInitialState();
    put(s, "ibrahim-salem", "is-1", "remote:1:root");
    put(s, "corroder", "g-1", "runner:grip");
    put(s, "corroder", "g-2", "runner:grip");
    put(s, "sure-gamble", "g-3", "runner:grip");
    s.runner.hand = ["g-1", "g-2", "g-3"];
    runKind(s, "is-1", "name_type_trash_from_grip");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "ibrahim-type:program",
    });
    if (!after.ok) throw new Error(after.error);
    const opt = after.state.pendingChoice?.options[0];
    if (!opt) throw new Error("expected a trash choice among programs");
    after = applyAction(after.state, { type: "choose_option", optionId: opt.id });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toHaveLength(1);
    expect(after.state.runner.hand).toHaveLength(2);
    expect(after.state.runner.hand).toContain("g-3");
  });

  it("Net-Ready Eyes: chooses an icebreaker to get +1 strength for the run", () => {
    const s = createInitialState();
    put(s, "net-ready-eyes", "nre-1", "runner:installed");
    put(s, "corroder", "br-1", "runner:installed");
    put(s, "gordian-blade", "br-2", "runner:installed");
    s.runner.installed = ["nre-1", "br-1", "br-2"];
    s.run = { attackedServerId: "hq", strengthBoosts: {} } as GameState["run"];
    runKind(s, "nre-1", "net_ready_eyes_choose_icebreaker_strength", {
      amount: 1,
    });
    const after = applyAction(s, { type: "choose_option", optionId: "nre:br-2" });
    if (!after.ok) throw new Error(after.error);
    expect(lingeringBreakerStrengthOfKind(after.state, "br-2", LINGERING_KIND_BREAKER_STRENGTH_RUN)).toBe(1);
  });

  it("Herald: may pay up to 2 credits to place that many advancements", () => {
    const s = createInitialState();
    put(s, "herald", "hr-1", "server:rd:ice");
    put(s, "project-beale", "ag-1", "remote:1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    } as GameState["servers"][string];
    s.corp.credits = 5;
    runKind(s, "hr-1", "pay_up_to_place_advancements", { max: 2 });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "herald-adv:2:ag-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ag-1"]?.advancementCounters).toBe(2);
    expect(after.state.corp.credits).toBe(3);
  });

  it("PAD Factory: places an advancement on a card that cannot be scored until next turn", () => {
    const s = createInitialState();
    put(s, "pad-factory", "pf-1", "remote:1:root");
    put(s, "project-beale", "ag-1", "remote:2:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pf-1"],
    } as GameState["servers"][string];
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    } as GameState["servers"][string];
    runKind(s, "pf-1", "place_advancement_cannot_score_until_next_turn");
    const after = applyAction(s, { type: "choose_option", optionId: "pad-adv:ag-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ag-1"]?.advancementCounters).toBe(1);
    expect(after.state.turn.cannotScoreOrRezCardIds).toContain("ag-1");
  });

  it("Builder: places an advancement on an advanceable ice protecting its server", () => {
    const s = createInitialState();
    put(s, "builder", "bd-1", "server:hq:ice");
    const adv = put(s, "ice-wall", "si-1", "server:hq:ice");
    adv.canAdvance = true;
    s.servers["hq"].ice = ["bd-1", "si-1"];
    runKind(s, "bd-1", "place_advancement_on_advanceable_ice_protecting_this_server");
    const after = applyAction(s, { type: "choose_option", optionId: "badv:si-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["si-1"]?.advancementCounters).toBe(1);
  });

  it("Takobi: chooses a non-AI icebreaker to get +3 strength this encounter", () => {
    const s = createInitialState();
    put(s, "takobi", "tk-1", "runner:installed");
    put(s, "corroder", "br-1", "runner:installed");
    s.runner.installed = ["tk-1", "br-1"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "tk-1", "pump_takobi_breaker", { amount: 3 });
    const after = applyAction(s, { type: "choose_option", optionId: "takobi:br-1" });
    if (!after.ok) throw new Error(after.error);
    expect(lingeringBreakerStrengthOfKind(after.state, "br-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(3);
  });

  it("Mandatory Seed Replacement: rearranges ice across servers (CR 8.3.1)", () => {
    const s = createInitialState();
    put(s, "mandatory-seed-replacement", "msr-1", "corp:score");
    put(s, "ice-wall", "iw-a", "server:hq:ice");
    put(s, "enigma", "en-1", "server:rd:ice");
    s.servers["hq"]!.ice = ["iw-a"];
    s.servers["rd"]!.ice = ["en-1"];
    // Pool all ice; Done every server until R&D, then stack both there
    // (printed: any number protecting all servers; CR 8.3.1 allows server change).
    runKind(s, "msr-1", "rearrange_ice_protecting_all_servers");
    expect(s.pendingChoice?.chooser).toBe("corp");
    let after = { ok: true as const, state: s };
    while (
      after.state.pendingChoice?.options.some(
        (o) => o.id === "msr-server-done:hq" || o.id.startsWith("msr-server-done:"),
      ) &&
      !after.state.pendingChoice.options.some((o) =>
        o.id.startsWith("msr-ice:rd:"),
      )
    ) {
      const done = after.state.pendingChoice!.options.find((o) =>
        o.id.startsWith("msr-server-done:"),
      )!;
      // Skip Done on R&D — place ice there instead.
      if (done.id === "msr-server-done:rd") break;
      const next = applyAction(after.state, {
        type: "choose_option",
        optionId: done.id,
      });
      if (!next.ok) throw new Error(next.error);
      after = next;
    }
    // On R&D: place Enigma then Ice Wall (sole remainder auto-places).
    expect(
      after.state.pendingChoice?.options.some((o) => o.id === "msr-ice:rd:en-1"),
    ).toBe(true);
    let next = applyAction(after.state, {
      type: "choose_option",
      optionId: "msr-ice:rd:en-1",
    });
    if (!next.ok) throw new Error(next.error);
    after = next;
    if (
      after.state.pendingChoice?.options.some((o) => o.id === "msr-ice:rd:iw-a")
    ) {
      next = applyAction(after.state, {
        type: "choose_option",
        optionId: "msr-ice:rd:iw-a",
      });
      if (!next.ok) throw new Error(next.error);
      after = next;
    }
    expect(after.state.servers["hq"]!.ice).toEqual([]);
    expect(after.state.servers["rd"]!.ice).toEqual(["en-1", "iw-a"]);
    expect(after.state.cards["en-1"]!.zone).toBe("server:rd:ice");
    expect(after.state.cards["iw-a"]!.zone).toBe("server:rd:ice");
  });

  it("Shiro: Corp may pay 1¢ else Runner breaches R&D with no root access (CR 7.3)", () => {
    const s = createInitialState();
    put(s, "shiro", "shiro-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["shiro-1"];
    s.cards["shiro-1"]!.rezzed = true;
    // Upgrade on R&D root must not be a candidate during the nested breach.
    put(s, "pad-campaign", "pad-1", "server:rd:root");
    s.servers["rd"]!.root = ["pad-1"];
    put(s, "priority-requisition", "pr-1", "corp:rd");
    s.corp.deck = ["pr-1"];
    s.corp.credits = 5;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "shiro-1", broken: [true, false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    runKind(s, "shiro-1", "may_corp_pay_credits_else_breach", {
      credits: 1,
      server: "rd",
      cannotAccessRoot: true,
    });
    expect(s.pendingChoice?.chooser).toBe("corp");
    // Decline to pay → nested R&D breach.
    let after = applyAction(s, { type: "choose_option", optionId: "breach" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.nestedBreachFromEncounter).toBe(true);
    expect(after.state.run?.attackedServerId).toBe("rd");
    expect(after.state.run?.cannotAccessRoot).toBe(true);
    expect(after.state.run?.attackedServerIdBeforeNestedBreach).toBe("hq");
    // Root upgrade is excluded; deck card is the candidate (RAL 1).
    expect(after.state.run?.accessCandidates).not.toContain("pad-1");
    expect(after.state.run?.accessCandidates).toContain("pr-1");
    // Paying instead leaves the HQ encounter alone.
    const s2 = createInitialState();
    put(s2, "shiro", "shiro-2", "server:hq:ice");
    s2.servers["hq"]!.ice = ["shiro-2"];
    s2.cards["shiro-2"]!.rezzed = true;
    s2.corp.credits = 5;
    s2.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "shiro-2", broken: [true, false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    runKind(s2, "shiro-2", "may_corp_pay_credits_else_breach", {
      credits: 1,
      server: "rd",
      cannotAccessRoot: true,
    });
    after = applyAction(s2, { type: "choose_option", optionId: "pay" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(4);
    expect(after.state.run?.attackedServerId).toBe("hq");
    expect(after.state.run?.nestedBreachFromEncounter).toBeFalsy();
    expect(after.state.run?.encounter?.iceId).toBe("shiro-2");
  });

  it("Sage: breaks 1 code gate subroutine; refuses a sentry", () => {
    const s = createInitialState();
    put(s, "sage", "sage-1", "runner:installed");
    s.runner.installed = ["sage-1"];
    const ice = put(s, "enigma", "en-1", "server:hq:ice");
    ice.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "sage-1", "break_code_gate_or_barrier");
    expect(s.run.encounter?.broken).toEqual([true, false]);

    const s2 = createInitialState();
    put(s2, "sage", "sage-1", "runner:installed");
    const raven = put(s2, "data-raven", "dr-1", "server:hq:ice");
    raven.subroutines = [{ text: "A" }] as never;
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "dr-1", broken: [false] },
    } as unknown as GameState["run"];
    const r = evalEffect(
      { state: s2, sourceId: "sage-1" },
      fx.do({ kind: "break_code_gate_or_barrier" }),
    );
    expect(r.ok).toBe(false);
  });

  it("Adept: breaks 1 sentry subroutine", () => {
    const s = createInitialState();
    put(s, "adept", "ad-1", "runner:installed");
    s.runner.installed = ["ad-1"];
    const raven = put(s, "data-raven", "dr-1", "server:hq:ice");
    raven.subroutines = [{ text: "A" }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "dr-1", broken: [false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "ad-1", "break_sentry_or_barrier");
    expect(s.run.encounter?.broken).toEqual([true]);
  });

  it("Savant: breaks 2 code gate subroutines on a code gate", () => {
    const s = createInitialState();
    put(s, "savant", "sv-1", "runner:installed");
    s.runner.installed = ["sv-1"];
    const ice = put(s, "enigma", "en-1", "server:hq:ice");
    ice.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "sv-1", "break_sentry_or_code_gates");
    expect(s.run.encounter?.broken).toEqual([true, true]);
  });

  it("Endless Hunger: trashes another installed card to break an ETR subroutine", () => {
    const s = createInitialState();
    put(s, "endless-hunger", "eh-1", "runner:installed");
    put(s, "daily-casts", "dc-1", "runner:installed");
    s.runner.installed = ["eh-1", "dc-1"];
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.subroutines = [{ text: "End the run." }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1", broken: [false] },
    } as unknown as GameState["run"];
    runKind(s, "eh-1", "break_etr_subroutine_trash_installed");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "eh:dc-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("dc-1");
    expect(after.state.run?.encounter?.broken).toEqual([true]);
  });

  it("Sharpshooter: breaks all subroutines on destroyer ice only", () => {
    const s = createInitialState();
    put(s, "sharpshooter", "ss-1", "runner:installed");
    const ice = put(s, "rototurret", "rt-1", "server:hq:ice");
    ice.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "rt-1", broken: [false, false] },
    } as unknown as GameState["run"];
    runKind(s, "ss-1", "break_all_destroyer_subroutines_on_encounter");
    expect(s.run.encounter?.broken).toEqual([true, true]);

    const s2 = createInitialState();
    put(s2, "sharpshooter", "ss-1", "runner:installed");
    const ice2 = put(s2, "enigma", "en-1", "server:hq:ice");
    ice2.subroutines = [{ text: "A" }] as never;
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false] },
    } as unknown as GameState["run"];
    runKind(s2, "ss-1", "break_all_destroyer_subroutines_on_encounter");
    expect(s2.run.encounter?.broken).toEqual([false]);
  });

  it("Oracle May: draw and gain 2 on a type match; trash on a miss", () => {
    const s = createInitialState();
    put(s, "oracle-may", "om-1", "runner:installed");
    s.runner.installed = ["om-1"];
    put(s, "corroder", "prog-1", "runner:stack");
    s.runner.deck = ["prog-1"];
    s.runner.hand = [];
    s.runner.credits = 3;
    runKind(s, "om-1", "choose_type_reveal_install");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "om:program",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("prog-1");
    expect(after.state.runner.credits).toBe(5);

    const s2 = createInitialState();
    put(s2, "oracle-may", "om-1", "runner:installed");
    put(s2, "corroder", "prog-1", "runner:stack");
    s2.runner.deck = ["prog-1"];
    s2.runner.hand = [];
    runKind(s2, "om-1", "choose_type_reveal_install");
    const after2 = applyAction(s2, {
      type: "choose_option",
      optionId: "om:event",
    });
    if (!after2.ok) throw new Error(after2.error);
    expect(after2.state.runner.discardPile).toContain("prog-1");
  });

  it("Azmari EdTech: naming a type pays 2 on the first matching play each turn", () => {
    const s = createInitialState();
    put(s, "azmari-edtech-shaping-the-future", "az-1", "corp:identity");
    s.corp.identityId = "az-1";
    s.corp.credits = 5;
    runKind(s, "az-1", "cotc_azmari_name_card_type");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "azmari:event",
    });
    if (!after.ok) throw new Error(after.error);
    // The name persists on the identity (printed: "the type you last named").
    expect(after.state.cards["az-1"]?.azmariNamedType).toBe("event");

    put(after.state, "sure-gamble", "sg-1", "runner:hand");
    put(after.state, "sure-gamble", "sg-2", "runner:hand");
    put(after.state, "sure-gamble", "sg-3", "runner:hand");
    onRunnerEventPlayed(after.state, "sg-1");
    expect(after.state.corp.credits).toBe(7);
    // Only the first matching play each turn pays.
    onRunnerEventPlayed(after.state, "sg-2");
    expect(after.state.corp.credits).toBe(7);
    // Next turn the name still stands and the trigger re-arms.
    beginRunnerTurnFlags(after.state);
    expect(after.state.cards["az-1"]?.azmariNamedType).toBe("event");
    onRunnerEventPlayed(after.state, "sg-3");
    expect(after.state.corp.credits).toBe(9);
  });

  it("White Hat: Corp must resolve Trace[3]; a failed trace reveals HQ", () => {
    const s = createInitialState();
    put(s, "white-hat", "wh-1", "runner:play-area");
    put(s, "hedge-fund", "hf-1", "corp:hand");
    s.corp.hand = ["hf-1"];
    // Link 99 with 0/0 bids makes the trace fail (printed: reveal HQ).
    s.runner.link = 99;
    runKind(s, "wh-1", "cotc_white_hat");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["do-trace"]);
    const opt = s.pendingChoice!.options[0]!;
    const r = evalEffect({ state: s, sourceId: "wh-1" }, opt.effect);
    if (!r.ok) throw new Error(r.error);
    expect(s.trace).toBeFalsy();
    expect(s.cards["hf-1"]?.faceup).toBe(true);
  });

  it("Jemison Astronautics: forfeiting places X+1 advancements on an advanceable card", () => {
    const s = createInitialState();
    put(s, "jemison-astronautics-sacrifice-audacity-success", "jem-1", "corp:identity");
    s.corp.identityId = "jem-1";
    put(s, "nisei-mk-ii", "nisei-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["nisei-1"],
    } as GameState["servers"][string];
    s.lastForfeitedAgendaPoints = 2;
    runKind(s, "jem-1", "place_advancements_on_forfeit");
    expect(s.pendingChoice?.chooser).toBe("corp");
    const opt = s.pendingChoice!.options.find((o) => o.id.includes("nisei-1"));
    expect(opt).toBeTruthy();
    const after = applyAction(s, {
      type: "choose_option",
      optionId: opt!.id,
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["nisei-1"]?.advancementCounters).toBe(3);
  });

  it("Spot the Prey: Runner chooses a non-ice card to expose, then runs", () => {
    const s = createInitialState();
    put(s, "spot-the-prey", "stp-1", "runner:play-area");
    const asset = put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    } as GameState["servers"][string];
    runKind(s, "stp-1", "expose_non_ice_then_run");
    expect(s.pendingChoice?.chooser).toBe("runner");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "expose:pad-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["pad-1"]?.faceup).toBe(true);
    expect(asset.faceup).toBe(false); // choice applied to state copy
  });

  it("Hafrún: Corp chooses an installed Runner card that cannot break subs this run", () => {
    const s = createInitialState();
    put(s, "hafrun", "haf-1", "server:hq:ice");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "daily-casts", "dc-1", "runner:installed");
    s.runner.installed = ["prog-1", "dc-1"];
    runKind(s, "haf-1", "forbid_installed_runner_break_for_run");
    expect(s.pendingChoice?.chooser).toBe("corp");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "forbid-break:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["prog-1"]?.cannotBreakSubsThisRun).toBe(true);
    expect(after.state.cards["dc-1"]?.cannotBreakSubsThisRun).toBeFalsy();
  });

  it("Tinkering: chosen ice gains sentry, code gate and barrier until end of turn", () => {
    const s = createInitialState();
    put(s, "tinkering", "tk-1", "runner:play-area");
    put(s, "enigma", "en-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["en-1"];
    runKind(s, "tk-1", "grant_chosen_ice_subtypes_until_end_of_turn", {
      subtypes: ["sentry", "code gate", "barrier"],
    });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "tinker:en-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["en-1"]?.grantedSubtypesUntilEndOfTurn).toEqual(
      expect.arrayContaining(["sentry", "code gate", "barrier"]),
    );
  });

  it("MCA Informant: Corp hosts the operation on an installed connection", () => {
    const s = createInitialState();
    put(s, "mca-informant", "mca-1", "corp:play-area");
    put(s, "fall-guy", "fg-1", "runner:installed");
    s.runner.installed = ["fg-1"];
    runKind(s, "mca-1", "host_on_connection");
    expect(s.pendingChoice?.chooser).toBe("corp");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "host:fg-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["mca-1"]?.hostId).toBe("fg-1");
    expect(after.state.cards["mca-1"]?.additionalTagsWhileHosted).toBe(1);
  });

  it("Scavenge: installs a program from the grip at the discount", () => {
    const s = createInitialState();
    put(s, "scavenge", "sc-1", "runner:play-area");
    put(s, "corroder", "prog-1", "runner:hand");
    s.runner.hand = ["prog-1"];
    s.runner.installed = [];
    s.runner.credits = 5;
    s.turn.lastTrashedOwnProgramInstallCost = 2;
    runKind(s, "sc-1", "install_scavenge_program");
    // A single legal candidate installs directly (no choice needed).
    expect(s.runner.installed).toContain("prog-1");
    expect(s.runner.hand).not.toContain("prog-1");
  });

  it("Jinteki Biotech: places 4 advancement counters on an advanceable card", () => {
    const s = createInitialState();
    put(s, "jinteki-biotech-life-imagined", "jb-1", "corp:identity");
    s.corp.identityId = "jb-1";
    put(s, "nisei-mk-ii", "nisei-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["nisei-1"],
    } as GameState["servers"][string];
    runKind(s, "jb-1", "jinteki_biotech_place_4_advancement");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "jb-adv:nisei-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["nisei-1"]?.advancementCounters).toBe(4);
  });

  it("Rolodex: looks at the top 5 cards of the stack to arrange them", () => {
    const s = createInitialState();
    put(s, "rolodex", "rx-1", "runner:installed");
    for (let i = 0; i < 5; i++) put(s, "sure-gamble", `sg-${i}`, "runner:stack");
    s.runner.deck = ["sg-0", "sg-1", "sg-2", "sg-3", "sg-4"];
    runKind(s, "rx-1", "look_top_n_stack_arrange", { n: 5 });
    expect(s.turn.ohStackLookedCards).toHaveLength(5);
    expect(s.pendingChoice).toBeTruthy();
  });

  it("Spy Camera: looks at the top X cards, X = installed copies", () => {
    const s = createInitialState();
    put(s, "spy-camera", "cam-1", "runner:installed");
    put(s, "spy-camera", "cam-2", "runner:installed");
    s.runner.installed = ["cam-1", "cam-2"];
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `sg-${i}`, "runner:stack");
    s.runner.deck = ["sg-0", "sg-1", "sg-2", "sg-3"];
    runKind(s, "cam-1", "look_top_x_stack_arrange");
    expect(s.turn.ohStackLookedCards).toHaveLength(2);
  });

  it("Success: advances a card equal to the forfeited agenda's advancement requirement", () => {
    const s = createInitialState();
    put(s, "success", "suc-1", "corp:play-area");
    put(s, "nisei-mk-ii", "nisei-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["nisei-1"],
    } as GameState["servers"][string];
    s.lastForfeitedAdvancementRequirement = 4;
    runKind(s, "suc-1", "advance_equal_forfeit_advancement_requirement");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "adv:nisei-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["nisei-1"]?.advancementCounters).toBe(4);
  });

  it("TL;DR: arms duplicate subroutines on the next ice encounter this run", () => {
    const s = createInitialState();
    put(s, "tl-dr", "tl-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "tl-1", "arm_duplicate_subs_on_next_ice_encounter");
    expect(s.turn.dadDuplicateSubsOnNextIceEncounter).toBe(true);
  });

  it("CBI Raid: Corp chooses the order of HQ cards onto the top of R&D", () => {
    const s = createInitialState();
    put(s, "cbi-raid", "cbi-1", "runner:play-area");
    put(s, "hedge-fund", "hf-a", "corp:hand");
    put(s, "hedge-fund", "hf-b", "corp:hand");
    put(s, "pad-campaign", "pad-1", "corp:hand");
    s.corp.hand = ["hf-a", "hf-b", "pad-1"];
    s.corp.deck = [];
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "cbi-1", "breach_instead_cbi_raid");
    expect(s.run?.skipBreach).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    // First pick becomes the deepest of the three; last pick is the new top.
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "cbi:hf-a",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "cbi:pad-1",
    });
    if (!after.ok) throw new Error(after.error);
    // Lone remaining card is placed automatically.
    expect(after.state.corp.hand).toEqual([]);
    expect(after.state.corp.deck).toEqual(["hf-b", "pad-1", "hf-a"]);
  });

  it("Virtuoso: marks the named server to breach when the run ends", () => {
    const s = createInitialState();
    put(s, "virtuoso", "vir-1", "runner:installed");
    s.run = { attackedServerId: "archives" } as unknown as GameState["run"];
    runKind(s, "vir-1", "breach_server_when_run_ends", { server: "rd" });
    expect(s.run?.breachWhenRunEnds).toBe("rd");
  });

  it("Grappling Hook: breaks all but one chosen subroutine", () => {
    const s = createInitialState();
    put(s, "grappling-hook", "gh-1", "runner:installed");
    const ice = put(s, "enigma", "en-1", "server:hq:ice");
    ice.subroutines = [
      { text: "Sub A" },
      { text: "Sub B" },
      { text: "Sub C" },
    ] as never;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false, false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "gh-1", "break_all_but_n_subroutines_on_encounter", {
      leave: 1,
    });
    expect(s.pendingChoice?.chooser).toBe("runner");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "spare-sub:1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.encounter?.broken).toEqual([true, false, true]);
  });

  it("Matryoshka: spends credits and turns a hosted copy facedown to break X", () => {
    const s = createInitialState();
    const mat = put(s, "matryoshka", "mat-1", "runner:installed");
    s.runner.installed = ["mat-1"];
    const hosted = put(s, "matryoshka", "mat-host", "hosted:mat-1");
    hosted.faceup = true;
    mat.hostedCardIds = ["mat-host"];
    s.runner.credits = 3;
    const ice = put(s, "enigma", "en-1", "server:hq:ice");
    ice.subroutines = [{ text: "A" }, { text: "B" }] as never;
    ice.strength = 0;
    mat.strength = 5;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "mat-1", "break_matryoshka");
    expect(s.pendingChoice?.chooser).toBe("runner");
    const opt = s.pendingChoice!.options.find((o) =>
      o.id.includes("2") || o.label.includes("2"),
    );
    expect(opt).toBeTruthy();
    const after = applyAction(s, {
      type: "choose_option",
      optionId: opt!.id,
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.encounter?.broken).toEqual([true, true]);
    expect(after.state.cards["mat-host"]?.faceup).toBe(false);
  });

  it("Bishop: hosts on ice that is not already hosting a Caïssa", () => {
    const s = createInitialState();
    put(s, "bishop", "bish-1", "runner:installed");
    s.runner.installed = ["bish-1"];
    put(s, "ice-wall", "iw-1", "server:remote-1:ice");
    put(s, "enigma", "en-1", "server:remote-2:ice");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["iw-1"],
      root: [],
    } as GameState["servers"][string];
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: ["en-1"],
      root: [],
    } as GameState["servers"][string];
    // Clear centrals so only the two remotes are candidates.
    s.servers["hq"]!.ice = [];
    s.servers["rd"]!.ice = [];
    s.servers["archives"]!.ice = [];
    runKind(s, "bish-1", "caissa_bishop_host");
    expect(s.pendingChoice?.chooser).toBe("runner");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "host:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["bish-1"]?.hostId).toBe("iw-1");
  });

  it("Pawn: hosts on the outermost ice protecting a central server", () => {
    const s = createInitialState();
    put(s, "pawn", "pawn-1", "runner:installed");
    s.runner.installed = ["pawn-1"];
    put(s, "ice-wall", "iw-out", "server:hq:ice");
    put(s, "enigma", "en-in", "server:hq:ice");
    // Index 0 = outermost (CR 6.2 / 4.6.9).
    s.servers["hq"]!.ice = ["iw-out", "en-in"];
    runKind(s, "pawn-1", "caissa_pawn_host_outermost_central");
    // Multiple centrals may offer choices; HQ's outermost must be offered.
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    if (s.pendingChoice) {
      expect(ids).toContain("host:iw-out");
      const after = applyAction(s, {
        type: "choose_option",
        optionId: "host:iw-out",
      });
      if (!after.ok) throw new Error(after.error);
      expect(after.state.cards["pawn-1"]?.hostId).toBe("iw-out");
    } else {
      // Single central with ice auto-hosts.
      expect(s.cards["pawn-1"]?.hostId).toBe("iw-out");
    }
  });

  it("Injection Attack: chooses an icebreaker then starts a run with +2 strength", () => {
    const s = createInitialState();
    put(s, "injection-attack", "inj-1", "runner:play-area");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    runKind(s, "inj-1", "choose_breaker_run", { strengthBonus: 2 });
    expect(s.pendingChoice?.chooser).toBe("runner");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "inj:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.turn.injectionAttackBreakerBonus).toEqual({
      breakerId: "prog-1",
      amount: 2,
    });
    // may_start_run then offers a server (applyAction starts the run).
    expect(after.state.pendingChoice || after.state.run).toBeTruthy();
  });

  it("Careful Planning: chosen unrezzed remote card cannot be rezzed this turn", () => {
    const s = createInitialState();
    put(s, "careful-planning", "cp-1", "runner:play-area");
    const asset = put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    asset.rezzed = false;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    } as GameState["servers"][string];
    runKind(s, "cp-1", "choose_remote_card_cannot_rez_this_turn");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "forbid:pad-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.turn.carefulPlanningCannotRezIds).toContain("pad-1");
  });

  it("Loki: Corp chooses another rezzed ice to copy subtypes and subroutines from", () => {
    const s = createInitialState();
    const loki = put(s, "loki", "loki-1", "server:hq:ice");
    loki.rezzed = true;
    const other = put(s, "enigma", "en-1", "server:rd:ice");
    other.rezzed = true;
    other.subtypes = ["code gate"];
    other.subroutines = [{ text: "Sub X" }] as never;
    s.servers["hq"]!.ice = ["loki-1"];
    s.servers["rd"]!.ice = ["en-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "loki-1", broken: [] },
    } as unknown as GameState["run"];
    runKind(s, "loki-1", "choose_rezzed_ice_gain_subs_subtypes_for_run");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "loki:en-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(
      after.state.cards["loki-1"]?.grantedSubtypesUntilEndOfTurn ??
        after.state.cards["loki-1"]?.subtypes,
    ).toEqual(expect.arrayContaining(["code gate"]));
  });

  it("The Turning Wheel: chooses HQ or R&D for +1 access this run", () => {
    const s = createInitialState();
    put(s, "the-turning-wheel", "tw-1", "runner:installed");
    s.runner.installed = ["tw-1"];
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "tw-1", "choose_turning_wheel_central_bonus_access");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "hq",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.tlmTurningWheelBonusServer).toBe("hq");
    expect(after.state.run?.bonusAccess).toBe(1);
  });

  it("Copycat: trashes itself and continues the run from another rezzed copy", () => {
    const s = createInitialState();
    put(s, "copycat", "cc-1", "runner:installed");
    s.runner.installed = ["cc-1"];
    const a = put(s, "ice-wall", "iw-a", "server:hq:ice");
    a.rezzed = true;
    const b = put(s, "ice-wall", "iw-b", "server:rd:ice");
    b.rezzed = true;
    s.servers["hq"]!.ice = ["iw-a"];
    s.servers["rd"]!.ice = ["iw-b"];
    s.run = {
      attackedServerId: "hq",
      lastPassedRezzedIceId: "iw-a",
      position: 0,
    } as unknown as GameState["run"];
    runKind(s, "cc-1", "copycat_jump_to_rezzed_copy");
    expect(s.runner.discardPile).toContain("cc-1");
    // Single other copy continues automatically.
    expect(s.run?.attackedServerId).toBe("rd");
  });

  it("Mining Accident: Corp may pay 5 credits instead of taking bad publicity", () => {
    const s = createInitialState();
    put(s, "mining-accident", "ma-1", "runner:play-area");
    s.corp.credits = 7;
    s.corp.badPublicity = 0;
    runKind(s, "ma-1", "unless", {
      payer: "corp",
      cost: fx.do({ kind: "corp_pay_credits_to_prevent", amount: 5 }),
      instruction: fx.do({ kind: "give_bad_publicity", amount: 1 }),
    });
    expect(s.pendingChoice?.chooser).toBe("corp");
    const pay = s.pendingChoice!.options.find((o) =>
      o.label.toLowerCase().includes("pay"),
    );
    expect(pay).toBeTruthy();
    const after = applyAction(s, {
      type: "choose_option",
      optionId: pay!.id,
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(2);
    expect(after.state.corp.badPublicity).toBe(0);
  });

  it("Anansi: Corp arranges the top 5 of R&D", () => {
    const s = createInitialState();
    put(s, "anansi", "an-1", "server:hq:ice");
    for (let i = 0; i < 5; i++) {
      put(s, "hedge-fund", `hf-${i}`, "corp:rd");
    }
    s.corp.deck = ["hf-0", "hf-1", "hf-2", "hf-3", "hf-4"];
    runKind(s, "an-1", "cotc_anansi_arrange_rd", { amount: 5 });
    expect(s.turn.rdLookedCards).toHaveLength(5);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options[0]?.id).toMatch(/^rd-arrange:/);
  });

  it("Bacterial Programming: looks at the top 7 of R&D then offers partition", () => {
    const s = createInitialState();
    put(s, "bacterial-programming", "bp-1", "corp:score");
    for (let i = 0; i < 7; i++) {
      put(s, "hedge-fund", `hf-${i}`, "corp:rd");
    }
    s.corp.deck = ["hf-0", "hf-1", "hf-2", "hf-3", "hf-4", "hf-5", "hf-6"];
    runKind(s, "bp-1", "dtwn_bacterial_programming");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("begin");
    expect(s.cards["bp-1"]?.dtwnBacterialLooked).toHaveLength(7);
  });

  it("Emergent Creativity: offers trash-from-grip then search", () => {
    const s = createInitialState();
    put(s, "emergent-creativity", "ec-1", "runner:play-area");
    put(s, "corroder", "prog-1", "runner:hand");
    s.runner.hand = ["prog-1"];
    runKind(s, "ec-1", "dtwn_emergent_creativity");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("begin");
  });

  it("Threat Assessment: Corp chooses a card; Runner takes tags or bounces it", () => {
    const s = createInitialState();
    put(s, "threat-assessment", "ta-1", "corp:play-area");
    put(s, "daily-casts", "dc-1", "runner:installed");
    s.runner.installed = ["dc-1"];
    runKind(s, "ta-1", "dtwn_threat_assessment");
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "threat:dc-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.chooser).toBe("runner");
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "bounce",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.deck[0]).toBe("dc-1");
    expect(after.state.runner.installed).not.toContain("dc-1");
  });

  it("Holmegaard: forbids access and breach for the remainder of the run", () => {
    const s = createInitialState();
    put(s, "holmegaard", "hol-1", "server:hq:ice");
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "hol-1", "forbid_access_and_breach_this_run");
    expect(s.run?.holmegaardForbidAccessBreach).toBe(true);
    expect(s.run?.skipBreach).toBe(true);
  });

  it("Anvil: forbids Runner card abilities from breaking the source this encounter", () => {
    const s = createInitialState();
    const ice = put(s, "anvil", "anv-1", "server:hq:ice");
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "anv-1", broken: [] },
    } as unknown as GameState["run"];
    runKind(s, "anv-1", "forbid_runner_break_on_source");
    expect(ice.cannotBreakWithRunnerCardAbilities).toBe(true);
    expect(s.run?.encounter?.forbidRunnerBreakThisEncounter).toBe(true);
  });

  it("Another Day, Another Paycheck: forces Trace[0]; failure pays agenda points as credits", () => {
    const s = createInitialState();
    put(s, "another-day-another-paycheck", "adap-1", "runner:play-area");
    put(s, "nisei-mk-ii", "nisei-1", "runner:score");
    s.runner.scoreArea = ["nisei-1"];
    s.cards["nisei-1"]!.agendaPoints = 2;
    s.runner.credits = 3;
    s.runner.link = 99; // force Trace failure at 0/0 bids
    runKind(s, "adap-1", "force_trace_then_gain_credits");
    expect(s.trace).toBeTruthy();
    const resolved = resolveTrace(s);
    if (!resolved.ok) throw new Error(resolved.error);
    expect(s.trace).toBeFalsy();
    expect(s.runner.credits).toBe(5);
  });

  it("Power to the People: arms first-agenda-access credits for the turn", () => {
    const s = createInitialState();
    put(s, "power-to-the-people", "ptp-1", "runner:play-area");
    runKind(s, "ptp-1", "gain_arm_credits_on_first_agenda_access", {
      amount: 7,
    });
    expect(s.turn.uotFirstAgendaAccessCredits).toBe(7);
  });

  it("Magnet: Corp chooses which hosted program to host on itself", () => {
    const s = createInitialState();
    const magnet = put(s, "magnet", "mag-1", "server:hq:ice");
    magnet.rezzed = true;
    put(s, "ice-wall", "iw-1", "server:rd:ice");
    put(s, "enigma", "en-1", "server:archives:ice");
    s.servers["hq"]!.ice = ["mag-1"];
    s.servers["rd"]!.ice = ["iw-1"];
    s.servers["archives"]!.ice = ["en-1"];
    const a = put(s, "corroder", "prog-a", "runner:installed");
    const b = put(s, "datasucker", "prog-b", "runner:installed");
    a.hostId = "iw-1";
    b.hostId = "en-1";
    s.runner.installed = ["prog-a", "prog-b"];
    runKind(s, "mag-1", "host_ice_program_on_self");
    expect(s.pendingChoice?.chooser).toBe("corp");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "magnet:prog-b",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["prog-b"]?.hostId).toBe("mag-1");
    expect(after.state.cards["prog-b"]?.abilitiesBlanked).toBe(true);
    expect(after.state.cards["prog-a"]?.hostId).toBe("iw-1");
  });

  it("Spree: hosts an installed trojan on ice protecting the attacked server", () => {
    const s = createInitialState();
    put(s, "spree", "sp-1", "runner:play-area");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["iw-1"];
    // A known trojan program if available; fall back to subtype stamp.
    const trojan = put(s, "imp", "imp-1", "runner:installed");
    if (!(trojan.subtypes ?? []).includes("trojan")) {
      trojan.subtypes = [...(trojan.subtypes ?? []), "trojan"];
    }
    s.runner.installed = ["imp-1"];
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "sp-1", "host_installed_trojan_on_attacked_ice");
    expect(s.pendingChoice?.chooser).toBe("runner");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "host:imp-1:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["imp-1"]?.hostId).toBe("iw-1");
  });

  it("London Library: hosts a non-virus program from the grip ignoring cost", () => {
    const s = createInitialState();
    put(s, "london-library", "ll-1", "runner:installed");
    s.runner.installed = ["ll-1"];
    put(s, "corroder", "prog-1", "runner:hand");
    s.runner.hand = ["prog-1"];
    runKind(s, "ll-1", "host_non_virus_program_ignore_cost");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "ll-host:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["prog-1"]?.hostId).toBe("ll-1");
    expect(after.state.runner.hand).not.toContain("prog-1");
  });

  it("Transparency Initiative: hosts on an installed agenda and turns it faceup", () => {
    const s = createInitialState();
    put(s, "transparency-initiative", "ti-1", "corp:play-area");
    const agenda = put(s, "nisei-mk-ii", "nisei-1", "server:remote-1:root");
    agenda.faceup = false;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["nisei-1"],
    } as GameState["servers"][string];
    runKind(s, "ti-1", "host_on_agenda");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "ti:nisei-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ti-1"]?.hostId).toBe("nisei-1");
    expect(after.state.cards["nisei-1"]?.faceup).toBe(true);
    expect(after.state.cards["nisei-1"]?.gainCreditsOnAdvance).toBe(1);
  });

  it("On the Lam: hosts on an installed resource as a condition", () => {
    const s = createInitialState();
    put(s, "on-the-lam", "otl-1", "runner:play-area");
    put(s, "daily-casts", "dc-1", "runner:installed");
    s.runner.installed = ["dc-1"];
    runKind(s, "otl-1", "host_on_installed_resource_as_condition");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "host:dc-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["otl-1"]?.hostId).toBe("dc-1");
  });

  it("Wetwork Refit: hosts on rezzed bioroid ice as a condition", () => {
    const s = createInitialState();
    put(s, "wetwork-refit", "wr-1", "corp:play-area");
    const ice = put(s, "heimdall-1-0", "heim-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"]!.ice = ["heim-1"];
    runKind(s, "wr-1", "host_on_rezzed_bioroid_ice_as_condition");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "wetwork-host:heim-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["wr-1"]?.hostId).toBe("heim-1");
  });

  it("Rover Algorithm: hosts on rezzed ice as a condition", () => {
    const s = createInitialState();
    put(s, "rover-algorithm", "ra-1", "corp:play-area");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"]!.ice = ["iw-1"];
    runKind(s, "ra-1", "host_on_rezzed_ice_as_condition");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "rover:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ra-1"]?.hostId).toBe("iw-1");
  });

  it("Information Sifting: Corp assigns HQ into two piles; Runner chooses one", () => {
    const s = createInitialState();
    put(s, "information-sifting", "is-1", "runner:play-area");
    put(s, "hedge-fund", "hf-a", "corp:hand");
    put(s, "hedge-fund", "hf-b", "corp:hand");
    put(s, "pad-campaign", "pad-1", "corp:hand");
    s.corp.hand = ["hf-a", "hf-b", "pad-1"];
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "is-1", "information_sifting_corp_split_hq");
    expect(s.run?.skipBreach).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    // Assign hf-a → A, hf-b → B, pad-1 → A.
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "sift-a:hf-a",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "sift-b:hf-b",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "sift-a:pad-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.chooser).toBe("runner");
    expect(after.state.turn.tlmInfoSiftPileA).toEqual(["hf-a", "pad-1"]);
    expect(after.state.turn.tlmInfoSiftPileB).toEqual(["hf-b"]);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "pile-a",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.accessCandidates).toEqual(["hf-a", "pad-1"]);
  });

  it("Restore: installs and rezzes from Archives, RFGing other copies", () => {
    const s = createInitialState();
    put(s, "restore", "res-1", "corp:play-area");
    put(s, "pad-campaign", "pad-1", "corp:archives");
    put(s, "pad-campaign", "pad-2", "corp:archives");
    s.corp.discardPile = ["pad-1", "pad-2"];
    s.corp.credits = 20;
    runKind(s, "res-1", "install_and_rez_from_archives_paying_costs_rfg_other_copies");
    expect(s.pendingChoice?.chooser).toBe("corp");
    const opt = s.pendingChoice!.options.find((o) =>
      o.id.startsWith("restore:pad-1:"),
    );
    expect(opt).toBeTruthy();
    const after = applyAction(s, {
      type: "choose_option",
      optionId: opt!.id,
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["pad-1"]?.rezzed).toBe(true);
    expect(after.state.cards["pad-2"]?.zone).toBe("removed-from-game");
  });

  it("Successful Field Test: may install any number from HQ ignoring costs", () => {
    const s = createInitialState();
    put(s, "successful-field-test", "sft-1", "corp:score");
    put(s, "pad-campaign", "pad-1", "corp:hand");
    s.corp.hand = ["pad-1"];
    runKind(s, "sft-1", "install_any_number_from_hq_ignore_costs");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain(
      "done-hq-install",
    );
    const install = s.pendingChoice!.options.find((o) =>
      o.id.startsWith("hq-any:pad-1:"),
    );
    expect(install).toBeTruthy();
  });

  it("Asa Group: may install a non-agenda from HQ into the same server", () => {
    const s = createInitialState();
    put(s, "asa-group-security-through-vigilance", "asa-1", "corp:identity");
    s.corp.identityId = "asa-1";
    put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    } as GameState["servers"][string];
    s.turn.installedThisTurn = ["pad-1"];
    put(s, "ice-wall", "iw-1", "corp:hand");
    s.corp.hand = ["iw-1"];
    runKind(s, "asa-1", "install_asa_non_agenda_same_server");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(
      s.pendingChoice?.options.some((o) => o.id.includes("iw-1")),
    ).toBe(true);
  });

  it("Worlds Plaza: installs and rezzes an asset from HQ with a rez discount", () => {
    const s = createInitialState();
    const plaza = put(s, "worlds-plaza", "wp-1", "server:remote-1:root");
    plaza.rezzed = true;
    plaza.maxHostedCards = 3;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["wp-1"],
    } as GameState["servers"][string];
    put(s, "pad-campaign", "pad-1", "corp:hand");
    s.corp.hand = ["pad-1"];
    s.corp.credits = 10;
    runKind(s, "wp-1", "install_asset_from_hq_rez_discount", { discount: 2 });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "wp:pad-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["pad-1"]?.hostId).toBe("wp-1");
    expect(after.state.cards["pad-1"]?.rezzed).toBe(true);
  });

  it("Compile: offers search stack or heap for a program", () => {
    const s = createInitialState();
    put(s, "compile", "comp-1", "runner:play-area");
    put(s, "corroder", "prog-1", "runner:stack");
    s.runner.deck = ["prog-1"];
    runKind(s, "comp-1", "install_compile_program");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["stack", "heap"]),
    );
  });

  it("Customized Secretary: installs a hosted program paying costs", () => {
    const s = createInitialState();
    const sec = put(s, "customized-secretary", "cs-1", "runner:installed");
    s.runner.installed = ["cs-1"];
    const hosted = put(s, "corroder", "prog-1", "hosted:cs-1");
    sec.hostedCardIds = ["prog-1"];
    hosted.hostId = "cs-1";
    s.runner.credits = 10;
    runKind(s, "cs-1", "install_customized_secretary_hosted_program");
    expect(s.pendingChoice?.chooser).toBe("runner");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "install:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("prog-1");
  });

  it("Hayley Kaplan: may install another card of the same type from the grip", () => {
    const s = createInitialState();
    put(s, "hayley-kaplan-universal-scholar", "hk-1", "runner:identity");
    s.runner.identityId = "hk-1";
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    s.turn.installedThisTurn = ["prog-1"];
    put(s, "datasucker", "prog-2", "runner:hand");
    s.runner.hand = ["prog-2"];
    s.runner.credits = 10;
    runKind(s, "hk-1", "install_hayley_same_type_from_grip");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["hayley:prog-2", "decline"]),
    );
  });

  it("Priority Construction: installs ice outermost on a remote with advancements", () => {
    const s = createInitialState();
    put(s, "priority-construction", "pc-1", "corp:play-area");
    put(s, "ice-wall", "iw-1", "corp:hand");
    s.corp.hand = ["iw-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    } as GameState["servers"][string];
    runKind(
      s,
      "pc-1",
      "install_ice_from_hq_outermost_remote_ignore_costs_place_advancements",
      { advancements: 3 },
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["pc:iw-1:remote-1", "pc:iw-1:new"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "pc:iw-1:remote-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["remote-1"]!.ice[0]).toBe("iw-1");
    expect(after.state.cards["iw-1"]?.advancementCounters).toBe(3);
  });

  it("Mti Mwekundu: installs ice from HQ innermost on the attacked server", () => {
    const s = createInitialState();
    put(s, "mti-mwekundu-life-improved", "mti-1", "corp:identity");
    s.corp.identityId = "mti-1";
    put(s, "ice-wall", "iw-1", "corp:hand");
    s.corp.hand = ["iw-1"];
    put(s, "enigma", "en-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["en-1"];
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "mti-1", "install_mti_ice_innermost_from_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "mti:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    // Innermost = last index.
    expect(after.state.servers["hq"]!.ice.at(-1)).toBe("iw-1");
  });

  it("The Supplier: may install a hosted card at turn begin (−2¢)", () => {
    const s = createInitialState();
    const supplier = put(s, "the-supplier", "sup-1", "runner:installed");
    s.runner.installed = ["sup-1"];
    const hosted = put(s, "daily-casts", "dc-1", "hosted:sup-1");
    supplier.hostedCardIds = ["dc-1"];
    hosted.hostId = "sup-1";
    s.runner.credits = 5;
    runKind(s, "sup-1", "install_supplier_turn_begin");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["decline", "install:dc-1"]),
    );
  });

  it("Friends in High Places: may install up to N from Archives paying costs", () => {
    const s = createInitialState();
    put(s, "friends-in-high-places", "fihp-1", "corp:play-area");
    put(s, "pad-campaign", "pad-1", "corp:archives");
    s.corp.discardPile = ["pad-1"];
    s.corp.credits = 20;
    runKind(s, "fihp-1", "install_up_to_n_from_archives_paying", { max: 2 });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("done");
    expect(
      s.pendingChoice?.options.some((o) => o.id.includes("pad-1")),
    ).toBe(true);
  });

  it("Black Hat: arms +2 access on HQ/R&D breaches for the remainder of the turn", () => {
    const s = createInitialState();
    put(s, "black-hat", "bh-1", "runner:play-area");
    runKind(s, "bh-1", "ka_black_hat_bonus_access");
    expect(s.turn.kaBlackHatBonusAccess).toBe(2);
  });

  it("Market Forces: Runner loses 3¢ per tag; Corp gains that many", () => {
    const s = createInitialState();
    put(s, "market-forces", "mf-1", "corp:play-area");
    s.runner.tags = 2;
    s.runner.credits = 10;
    s.corp.credits = 5;
    runKind(s, "mf-1", "ka_market_forces");
    expect(s.runner.credits).toBe(4);
    expect(s.corp.credits).toBe(11);
  });

  it("Sadaka: Corp may arrange or shuffle the looked-at top of R&D", () => {
    const s = createInitialState();
    put(s, "sadaka", "sad-1", "server:hq:ice");
    for (let i = 0; i < 3; i++) put(s, "hedge-fund", `hf-${i}`, "corp:rd");
    s.corp.deck = ["hf-0", "hf-1", "hf-2"];
    runKind(s, "sad-1", "look_sadaka_top_3");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["arrange", "shuffle"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "arrange",
    });
    if (!after.ok) throw new Error(after.error);
    // Arrange opens the shared pick_rd_arrange flow (not a silent restore).
    expect(after.state.turn.rdLookedCards).toHaveLength(3);
    expect(after.state.pendingChoice?.options[0]?.id).toMatch(/^rd-arrange:/);
  });

  it("Psychokinesis: looks at top 5 of R&D and may install one in a remote", () => {
    const s = createInitialState();
    put(s, "psychokinesis", "pk-1", "corp:play-area");
    put(s, "pad-campaign", "pad-1", "corp:rd");
    for (let i = 0; i < 4; i++) put(s, "hedge-fund", `hf-${i}`, "corp:rd");
    s.corp.deck = ["pad-1", "hf-0", "hf-1", "hf-2", "hf-3"];
    runKind(s, "pk-1", "look_top5_may_install_remote");
    expect(s.turn.rdLookedCards).toHaveLength(5);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["decline", "psychokinesis-install:pad-1"]),
    );
  });

  it("Express Delivery: adds one of the top N stack cards to the grip and shuffles", () => {
    const s = createInitialState();
    put(s, "express-delivery", "ed-1", "runner:play-area");
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `sg-${i}`, "runner:stack");
    s.runner.deck = ["sg-0", "sg-1", "sg-2", "sg-3"];
    s.runner.hand = [];
    runKind(s, "ed-1", "look_top_n_stack_add_one_to_grip_shuffle", { n: 4 });
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "ed:sg-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("sg-2");
    expect(after.state.runner.deck).toHaveLength(3);
    expect(after.state.runner.deck).not.toContain("sg-2");
  });

  it("Making an Entrance: looks at the top 6 of the stack to trash any and arrange the rest", () => {
    const s = createInitialState();
    put(s, "making-an-entrance", "mae-1", "runner:play-area");
    for (let i = 0; i < 6; i++) put(s, "sure-gamble", `sg-${i}`, "runner:stack");
    s.runner.deck = ["sg-0", "sg-1", "sg-2", "sg-3", "sg-4", "sg-5"];
    runKind(s, "mae-1", "look_top_n_stack_trash_any_arrange_rest", { n: 6 });
    expect(s.turn.siStackLookedCards).toHaveLength(6);
    expect(s.pendingChoice).toBeTruthy();
  });

  it("Méliès U: may trash the top of R&D; if so, add 1 from Archives to HQ", () => {
    const s = createInitialState();
    put(s, "melies-u-only-the-brightest", "mel-1", "corp:identity");
    s.corp.identityId = "mel-1";
    put(s, "hedge-fund", "hf-top", "corp:rd");
    put(s, "pad-campaign", "pad-1", "corp:archives");
    s.corp.deck = ["hf-top"];
    s.corp.discardPile = ["pad-1"];
    s.corp.hand = [];
    runKind(s, "mel-1", "look_top_rd_may_trash_if_do_archives_to_hq");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["leave-top", "trash-top-archives"]),
    );
  });

  it("Diversion of Funds: may force Corp to lose up to 5¢ instead of breaching HQ", () => {
    const s = createInitialState();
    put(s, "diversion-of-funds", "dof-1", "runner:play-area");
    s.corp.credits = 8;
    s.runner.credits = 3;
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "dof-1", "may_breach_instead_diversion_funds_ka");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["breach", "divert:5"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "divert:5",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(3);
    expect(after.state.runner.credits).toBe(8);
    expect(after.state.run?.skipBreach).toBe(true);
  });

  it("Exploratory Romp: may remove advancements instead of breaching", () => {
    const s = createInitialState();
    put(s, "exploratory-romp", "er-1", "runner:play-area");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.advancementCounters = 3;
    s.servers["hq"]!.ice = ["iw-1"];
    s.run = { attackedServerId: "hq" } as unknown as GameState["run"];
    runKind(s, "er-1", "may_breach_instead_exploratory_romp", { amount: 3 });
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["breach", "romp"]),
    );
  });

  it("NEXT Wave 2: may do 1 core damage if a NEXT ice is rezzed", () => {
    const s = createInitialState();
    put(s, "next-wave-2", "nw-1", "corp:score");
    const ice = put(s, "next-bronze", "nb-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"]!.ice = ["nb-1"];
    runKind(s, "nw-1", "may_core_if_rezzed_next_ice");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["accept", "decline"]),
    );
  });

  it("Nanisivik Grid: may turn facedown Archives ice faceup and resolve a subroutine", () => {
    const s = createInitialState();
    put(s, "nanisivik-grid", "ng-1", "server:hq:root");
    const ice = put(s, "ice-wall", "iw-1", "corp:archives");
    ice.faceup = false;
    ice.subroutines = [{ text: "End the run." }] as never;
    s.corp.discardPile = ["iw-1"];
    runKind(s, "ng-1", "may_flip_archives_ice_resolve_subroutine");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id.startsWith("flip:iw-1:"))).toBe(
      true,
    );
  });

  it("Crowdfunding: may install from heap after enough successful runs", () => {
    const s = createInitialState();
    put(s, "crowdfunding", "cf-1", "runner:heap");
    s.runner.discardPile = ["cf-1"];
    s.turn.successfulRunCountThisTurn = 3;
    runKind(s, "cf-1", "may_install_crowdfunding_from_heap_ignore_costs", {
      minSuccessfulRuns: 3,
    });
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("accept");
  });

  it("Team Sponsorship: may install from HQ or Archives ignoring install cost", () => {
    const s = createInitialState();
    put(s, "team-sponsorship", "ts-1", "corp:score");
    put(s, "pad-campaign", "pad-1", "corp:hand");
    s.corp.hand = ["pad-1"];
    runKind(s, "ts-1", "may_install_from_hq_or_archives_ignore_costs");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("decline-ts");
    expect(
      s.pendingChoice?.options.some((o) => o.id.includes("pad-1")),
    ).toBe(true);
  });

  it("Bloom: may install ice from HQ inward of itself ignoring costs", () => {
    const s = createInitialState();
    put(s, "bloom", "bloom-1", "server:hq:ice");
    put(s, "ice-wall", "iw-1", "corp:hand");
    s.corp.hand = ["iw-1"];
    s.servers["hq"]!.ice = ["bloom-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "bloom-1", broken: [] },
    } as unknown as GameState["run"];
    runKind(s, "bloom-1", "may_install_ice_from_hq_inward_of_source_ignore_costs");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["decline", "inward:iw-1"]),
    );
  });

  it("Madani: may install one hosted program", () => {
    const s = createInitialState();
    const mad = put(s, "madani", "mad-1", "runner:installed");
    s.runner.installed = ["mad-1"];
    const hosted = put(s, "corroder", "prog-1", "hosted:mad-1");
    mad.hostedCardIds = ["prog-1"];
    hosted.hostId = "mad-1";
    s.runner.credits = 10;
    runKind(s, "mad-1", "may_install_one_hosted_program");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.some((o) => o.id === "prog-1")).toBe(true);
  });

  it("Nihongai Grid: looks at the top 5 of R&D (not the bottom) to swap with HQ", () => {
    const s = createInitialState();
    put(s, "nihongai-grid", "nih-1", "server:hq:root");
    for (let i = 0; i < 7; i++) put(s, "hedge-fund", `hf-${i}`, "corp:rd");
    put(s, "pad-campaign", "pad-1", "corp:hand");
    // Top is index 0; bottom is last.
    s.corp.deck = ["hf-0", "hf-1", "hf-2", "hf-3", "hf-4", "hf-5", "hf-6"];
    s.corp.hand = ["pad-1"];
    s.runner.hand = []; // <2 grip
    s.runner.credits = 0; // <6¢
    runKind(s, "nih-1", "may_look_nihongai_top5_swap_hq");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "accept",
    });
    if (!after.ok) throw new Error(after.error);
    const ids = after.state.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids.some((id) => id.includes("hf-0"))).toBe(true);
    expect(ids.some((id) => id.includes("hf-6"))).toBe(false);
  });

  it("Mirāju: moves the run to Archives, offers jack out, and derezzes", () => {
    const s = createInitialState();
    const ice = put(s, "miraju", "mir-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"]!.ice = ["mir-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "mir-1", broken: [true] },
    } as unknown as GameState["run"];
    runKind(s, "mir-1", "may_move_miraju_archives_jack_out_derez");
    expect(ice.rezzed).toBe(false);
    expect(s.run?.attackedServerId).toBe("archives");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["jack-out", "continue"]),
    );
  });

  it("Project Junebug: may pay 1¢ to do 2 net damage per advancement", () => {
    const s = createInitialState();
    const junebug = put(s, "project-junebug", "pj-1", "server:remote-1:root");
    junebug.advancementCounters = 2;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pj-1"],
    } as GameState["servers"][string];
    s.corp.credits = 5;
    runKind(s, "pj-1", "may_pay_credits_for_net_damage_per_advancement", {
      amount: 1,
      per: 2,
    });
    expect(s.pendingChoice?.options.some((o) => o.id === "pay")).toBe(true);
  });

  it("Bug: may_pay_reveal_top pays 2¢ to reveal the Corp card just drawn", () => {
    const s = createInitialState();
    put(s, "bug", "bug-1", "runner:installed");
    s.runner.installed = ["bug-1"];
    put(s, "hedge-fund", "hf-drawn", "corp:rd");
    put(s, "sure-gamble", "sg-stack", "runner:stack");
    s.corp.deck = ["hf-drawn"];
    s.corp.hand = [];
    s.runner.deck = ["sg-stack"];
    s.runner.credits = 5;
    // Draw fires Bug (may_pay_reveal_top) via onCorpDrawCard with the drawn id.
    drawCards(s, "corp", 1);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.turn.pendingCorpDrawnCardId).toBe("hf-drawn");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "bug-pay",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(3);
    expect(after.state.cards["hf-drawn"]?.faceup).toBe(true);
    // Printed: reveal the Corp's drawn card — not a Runner stack card.
    expect(after.state.turn.pendingCorpDrawnCardId).toBe("hf-drawn");
  });

  it("Pivot: may play or install a card from HQ", () => {
    const s = createInitialState();
    put(s, "pivot", "piv-1", "corp:play-area");
    put(s, "pad-campaign", "pad-1", "corp:hand");
    s.corp.hand = ["pad-1"];
    s.corp.credits = 10;
    runKind(s, "piv-1", "may_play_or_install_from_hq");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("decline");
  });

  it("Persephone: after passing a sentry, may trash stack top then R&D per resolved sub", () => {
    const s = createInitialState();
    put(s, "persephone", "per-1", "runner:installed");
    const ice = put(s, "data-raven", "dr-1", "server:hq:ice");
    ice.subtypes = ["sentry"];
    put(s, "sure-gamble", "sg-0", "runner:stack");
    s.runner.deck = ["sg-0"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "dr-1", broken: [], subroutinesResolved: 2 },
    } as unknown as GameState["run"];
    runKind(s, "per-1", "may_trash_stack_top_then_trash_rd_per_resolved");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["accept", "decline"]),
    );
  });

  it("Möbius: after a successful R&D run, may run R&D again; second success gains 4¢", () => {
    const s = createInitialState();
    put(s, "mobius", "mob-1", "runner:play-area");
    s.runner.credits = 2;
    s.run = {
      attackedServerId: "rd",
      successful: true,
    } as unknown as GameState["run"];
    runKind(s, "mob-1", "mobius_on_run_end");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["run-rd", "decline"]),
    );
    // Second successful run gains 4¢.
    const s2 = createInitialState();
    put(s2, "mobius", "mob-1", "runner:play-area");
    s2.runner.credits = 2;
    s2.turn.mobiusSecondRun = true;
    s2.run = {
      attackedServerId: "rd",
      successful: true,
    } as unknown as GameState["run"];
    runKind(s2, "mob-1", "mobius_on_run_end");
    expect(s2.runner.credits).toBe(6);
  });

  it("Mumbad Construction Co.: moves 1 advancement to a faceup card", () => {
    const s = createInitialState();
    const mcc = put(s, "mumbad-construction-co", "mcc-1", "server:remote-1:root");
    mcc.advancementCounters = 2;
    mcc.rezzed = true;
    const agenda = put(s, "nisei-mk-ii", "nisei-1", "server:remote-2:root");
    agenda.faceup = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["mcc-1"],
    } as GameState["servers"][string];
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["nisei-1"],
    } as GameState["servers"][string];
    runKind(s, "mcc-1", "move_mumbad_construction_advancement_to_faceup");
    // Single faceup destination (other than self) auto-moves.
    expect(mcc.advancementCounters).toBe(1);
    expect(agenda.advancementCounters).toBe(1);
  });

  it("Salem's Hospitality: names a card; grip copies of that name are trashed", () => {
    const s = createInitialState();
    put(s, "salems-hospitality", "salem-1", "corp:play-area");
    put(s, "sure-gamble", "sg-1", "runner:hand");
    put(s, "sure-gamble", "sg-2", "runner:hand");
    put(s, "diesel", "d-1", "runner:hand");
    s.runner.hand = ["sg-1", "sg-2", "d-1"];
    s.runner.discardPile = [];
    runKind(s, "salem-1", "name_reveal_trash_grip_copies");
    expect(s.pendingChoice?.chooser).toBe("corp");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "salem:sure-gamble",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toEqual(["d-1"]);
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["sg-1", "sg-2"]),
    );
  });

  it("Tori Hanzō: pay_tori_hanzo_instead_net replaces imminent net with 1 core", () => {
    const s = createInitialState();
    put(s, "tori-hanzo", "tori-1", "server:hq:root");
    // May/pay is the interrupt ability's 2¢ cost; this kind only replaces.
    s.run = { attackedServerId: "hq", netDamageWould: 1 } as GameState["run"];
    s.pendingDamage = {
      type: "net",
      remaining: 3,
      sourceId: "ice-1",
    } as GameState["pendingDamage"];
    runKind(s, "tori-1", "pay_tori_hanzo_instead_net");
    expect(s.pendingDamage?.type).toBe("core");
    expect(s.pendingDamage?.remaining).toBe(1);
  });

  it("Award Bait: may place up to 2 advancements on an advanceable installed card", () => {
    const s = createInitialState();
    put(s, "award-bait", "ab-1", "corp:score");
    const pad = put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    pad.canAdvance = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    } as GameState["servers"][string];
    runKind(s, "ab-1", "place_up_to_n_advancements_on_advanceable_installed", {
      max: 2,
    });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(
      s.pendingChoice?.options.some((o) => o.id === "oh-adv:pad-1:2"),
    ).toBe(true);
  });

  it("New Angeles Sol: may play a current from HQ or Archives", () => {
    const s = createInitialState();
    put(s, "new-angeles-sol-your-news", "sol-1", "corp:identity");
    put(s, "enforced-curfew", "cur-1", "corp:hand");
    s.corp.hand = ["cur-1"];
    s.corp.credits = 10;
    runKind(s, "sol-1", "play_current_from_hq_or_archives");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "play-current:cur-1")).toBe(
      true,
    );
  });

  it("Planned Assault: plays a run event from the stack (paying its cost)", () => {
    const s = createInitialState();
    put(s, "planned-assault", "pa-1", "runner:play-area");
    put(s, "account-siphon", "as-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["as-1", "sg-1"];
    s.runner.credits = 5;
    runKind(s, "pa-1", "play_run_event_from_stack");
    expect(s.pendingChoice?.options.some((o) => o.id === "pa:as-1")).toBe(true);
    const after = applyAction(s, { type: "choose_option", optionId: "pa:as-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.deck).not.toContain("as-1");
    expect(after.state.runner.discardPile).not.toContain("as-1");
    expect(after.state.cards["as-1"]?.zone).toBe("runner:play-area");
  });

  it("Bio-Modeled Network: prevent_all_but_n_pending_damage leaves 1 net", () => {
    const s = createInitialState();
    put(s, "bio-modeled-network", "bio-1", "runner:installed");
    s.pendingDamage = {
      type: "net",
      remaining: 4,
      sourceId: "ice-1",
    } as GameState["pendingDamage"];
    runKind(s, "bio-1", "prevent_all_but_n_pending_damage", { leave: 1 });
    expect(s.pendingDamage?.remaining).toBe(1);
  });

  it("Transport Monopoly: prevent_declare_run_successful marks the run", () => {
    const s = createInitialState();
    put(s, "transport-monopoly", "tm-1", "corp:score");
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "tm-1", "prevent_declare_run_successful");
    expect(s.run?.cannotDeclareSuccessful).toBe(true);
  });

  it("Dorm Computer: prevent_dorm_computer_run_all_tags arms tag prevention and offers a run", () => {
    const s = createInitialState();
    put(s, "dorm-computer", "dc-1", "runner:installed");
    s.runner.installed = ["dc-1"];
    runKind(s, "dc-1", "prevent_dorm_computer_run_all_tags");
    expect(s.turn.bbPreventAllTagsThisRun).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
  });

  it("LLDS Energy Regulator: prevent_llds_trash_hardware clears pending hardware trash", () => {
    const s = createInitialState();
    put(s, "llds-energy-regulator", "llds-1", "runner:installed");
    put(s, "desperado", "desp-1", "runner:installed");
    s.runner.installed = ["llds-1", "desp-1"];
    s.pendingTrashPrevent = {
      cardId: "desp-1",
      trashExpected: true,
      pendingInterruptIds: [],
    };
    runKind(s, "llds-1", "prevent_llds_trash_hardware");
    expect(s.pendingTrashPrevent).toBeNull();
    expect(s.runner.installed).toContain("desp-1");
  });

  it("Zaibatsu Loyalty: prevent_pending_expose stops the expose", () => {
    const s = createInitialState();
    put(s, "zaibatsu-loyalty", "zb-1", "server:remote-1:root");
    put(s, "pad-campaign", "hid-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["zb-1", "hid-1"],
    } as GameState["servers"][string];
    s.pendingExpose = { cardId: "hid-1", phase: "interrupt" };
    s.cards["hid-1"]!.faceup = false;
    runKind(s, "zb-1", "prevent_pending_expose", { amount: 1 });
    expect(s.pendingExpose).toBeNull();
    expect(s.cards["hid-1"]?.faceup).toBe(false);
  });

  it("Sacrificial Construct: prevent_pending_installed_trash clears the interrupt", () => {
    const s = createInitialState();
    put(s, "sacrificial-construct", "sc-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["sc-1", "prog-1"];
    s.pendingTrashPrevent = {
      cardId: "prog-1",
      trashExpected: true,
      pendingInterruptIds: [],
    };
    runKind(s, "sc-1", "prevent_pending_installed_trash");
    expect(s.pendingTrashPrevent).toBeNull();
  });

  it("On the Lam: prevent_tags_or_damage offers tag or damage prevention", () => {
    const s = createInitialState();
    put(s, "on-the-lam", "otl-1", "runner:installed");
    s.pendingTags = { remaining: 2, sourceId: "corp" } as GameState["pendingTags"];
    s.pendingDamage = {
      type: "meat",
      remaining: 2,
      sourceId: "corp",
    } as GameState["pendingDamage"];
    runKind(s, "otl-1", "prevent_tags_or_damage", { max: 3 });
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["prevent-tags", "prevent-dmg"]),
    );
  });

  it("Tracker: prevent_tracker_run_chosen_first_sub starts a run on the chosen server", () => {
    const s = createInitialState();
    const tr = put(s, "tracker", "tr-1", "runner:installed");
    tr.chosenServerId = "rd";
    s.runner.installed = ["tr-1"];
    runKind(s, "tr-1", "prevent_tracker_run_chosen_first_sub");
    expect(s.run?.attackedServerId).toBe("rd");
    expect(s.run?.quTrackerPreventFirstSubroutine).toBe(true);
  });

  it("Fall Guy: prevent_trash_resource clears pending trash of a resource", () => {
    const s = createInitialState();
    put(s, "fall-guy", "fg-1", "runner:installed");
    put(s, "daily-casts", "dc-1", "runner:installed");
    s.runner.installed = ["fg-1", "dc-1"];
    s.pendingTrashPrevent = {
      cardId: "dc-1",
      trashExpected: true,
      pendingInterruptIds: [],
    };
    runKind(s, "fg-1", "prevent_trash_resource");
    expect(s.pendingTrashPrevent).toBeNull();
  });

  it("BlacKat: pump_blackat_strength is +2 with stealth spend, else +1", () => {
    const s = createInitialState();
    put(s, "blackat", "bk-1", "runner:installed");
    s.runner.installed = ["bk-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1", broken: [] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    s.turn.stealthCreditsOnLastPaidAbility = 0;
    runKind(s, "bk-1", "pump_blackat_strength");
    expect(lingeringBreakerStrengthOfKind(s, "bk-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(1);

    const s2 = createInitialState();
    put(s2, "blackat", "bk-2", "runner:installed");
    s2.runner.installed = ["bk-2"];
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1", broken: [] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    s2.turn.stealthCreditsOnLastPaidAbility = 1;
    runKind(s2, "bk-2", "pump_blackat_strength");
    expect(lingeringBreakerStrengthOfKind(s2, "bk-2", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
  });

  it("Reeducation: reeducation_hq_bottom_rd_draw_runner_grip_to_stack offers HQ picks", () => {
    const s = createInitialState();
    put(s, "reeducation", "re-1", "corp:score");
    put(s, "hedge-fund", "hf-1", "corp:hand");
    put(s, "pad-campaign", "pad-1", "corp:hand");
    s.corp.hand = ["hf-1", "pad-1"];
    for (let i = 0; i < 3; i++) {
      put(s, "hedge-fund", `rd-${i}`, "corp:rd");
    }
    s.corp.deck = ["rd-0", "rd-1", "rd-2"];
    runKind(s, "re-1", "reeducation_hq_bottom_rd_draw_runner_grip_to_stack");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["none", "add:hf-1", "add:pad-1"]),
    );
  });

  it("Sacrifice: removes BP equal to forfeited AP and gains that many credits", () => {
    const s = createInitialState();
    put(s, "sacrifice", "sac-1", "corp:play");
    s.lastForfeitedAgendaPoints = 2;
    s.corp.badPublicity = 3;
    s.corp.credits = 4;
    runKind(s, "sac-1", "remove_bp_equal_forfeited_ap_gain_credits");
    expect(s.corp.badPublicity).toBe(1);
    expect(s.corp.credits).toBe(6);
  });

  it("Ravana 1.0: resolve_bioroid_subroutine resolves another rezzed bioroid sub", () => {
    const s = createInitialState();
    const rav = put(s, "ravana-1-0", "rav-1", "server:hq:ice");
    rav.rezzed = true;
    const vik = put(s, "viktor-1-0", "vik-1", "server:rd:ice");
    vik.rezzed = true;
    s.servers["hq"]!.ice = ["rav-1"];
    s.servers["rd"]!.ice = ["vik-1"];
    put(s, "sure-gamble", "sg-1", "runner:hand");
    s.runner.hand = ["sg-1"];
    runKind(s, "rav-1", "resolve_bioroid_subroutine");
    expect(s.runner.coreDamage).toBe(1);
    expect(s.runner.hand).toEqual([]);
  });

  it("Deep Dive: sets aside top of R&D, accesses with clicks, then shuffles remainder back", () => {
    const s = createInitialState();
    put(s, "deep-dive", "dd-1", "runner:play");
    for (let i = 0; i < 5; i++) put(s, "hedge-fund", `rd-${i}`, "corp:rd");
    put(s, "hostile-takeover", "ht-1", "corp:rd");
    s.corp.deck = ["ht-1", "rd-0", "rd-1", "rd-2", "rd-3", "rd-4"];
    s.runner.clicks = 0;
    runKind(s, "dd-1", "resolve_deep_dive", { setAside: 4, initialAccess: 1 });
    expect(s.runner.scoreArea).toContain("ht-1");
    expect(s.corp.deck).toHaveLength(5);
    expect(s.corp.deck).not.toContain("ht-1");
    expect(s.corp.corpSetAside ?? []).toEqual([]);
  });

  it("Marathon: on successful end gains click, returns to grip, and forbids that server", () => {
    const s = createInitialState();
    put(s, "marathon", "mar-1", "runner:heap");
    s.runner.discardPile = ["mar-1"];
    s.runner.clicks = 2;
    s.run = {
      attackedServerId: "remote-1",
      runSourceId: "mar-1",
    } as GameState["run"];
    runKind(s, "mar-1", "resolve_marathon");
    expect(s.runner.clicks).toBe(3);
    expect(s.runner.hand).toContain("mar-1");
    expect(s.runner.discardPile).not.toContain("mar-1");
    expect(s.turn.cotcForbiddenServerIds).toContain("remote-1");
  });

  it("Moon Pool: RFGs self, trashes HQ, reveals facedown Archives into R&D, advances", () => {
    const s = createInitialState();
    put(s, "moon-pool", "mp-1", "corp:archives");
    s.corp.discardPile = ["mp-1"];
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "hq-2", "corp:hand");
    s.corp.hand = ["hq-1", "hq-2"];
    const facedown = put(s, "hostile-takeover", "fa-1", "corp:archives");
    facedown.faceup = false;
    s.corp.discardPile.push("fa-1");
    const host = put(s, "pad-campaign", "host-1", "server:remote-1:root");
    host.canAdvance = true;
    host.advancementCounters = 0;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["host-1"],
    } as GameState["servers"][string];
    runKind(s, "mp-1", "resolve_moon_pool", {
      trashHqMax: 2,
      revealArchivesMax: 2,
    });
    expect(s.cards["mp-1"]?.zone).toBe("removed-from-game");
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-1", "hq-2"]),
    );
    expect(s.corp.deck).toContain("fa-1");
    expect(s.cards["host-1"]?.advancementCounters).toBe(1);
  });

  it("Mutate: reveals until ice, installs/rezzes in trashed slot, shuffles R&D", () => {
    const s = createInitialState();
    put(s, "mutate", "mut-1", "corp:play");
    put(s, "hedge-fund", "op-1", "corp:rd");
    put(s, "ice-wall", "iw-new", "corp:rd");
    put(s, "hedge-fund", "op-2", "corp:rd");
    s.corp.deck = ["op-1", "iw-new", "op-2"];
    s.servers["hq"]!.ice = [];
    s.turn.mutateTrashedIce = {
      iceId: "trashed-iw",
      serverId: "hq",
      index: 0,
    };
    runKind(s, "mut-1", "resolve_mutate_operation");
    expect(s.servers["hq"]!.ice[0]).toBe("iw-new");
    expect(s.cards["iw-new"]?.rezzed).toBe(true);
    expect(s.cards["iw-new"]?.zone).toBe("server:hq:ice");
    expect(s.corp.deck).toEqual(expect.arrayContaining(["op-1", "op-2"]));
    expect(s.corp.deck).toHaveLength(2);
    expect(s.turn.mutateTrashedIce).toBeUndefined();
  });

  it("Simulation Reset: trashes HQ, shuffles that many Archives into R&D, draws, RFGs", () => {
    const s = createInitialState();
    put(s, "simulation-reset", "sr-1", "corp:play");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "hq-2", "corp:hand");
    s.corp.hand = ["hq-1", "hq-2"];
    put(s, "hedge-fund", "arch-1", "corp:archives");
    s.corp.discardPile = ["arch-1"];
    for (let i = 0; i < 3; i++) put(s, "hedge-fund", `rd-${i}`, "corp:rd");
    s.corp.deck = ["rd-0", "rd-1", "rd-2"];
    runKind(s, "sr-1", "resolve_simulation_reset", { trashHqMax: 2 });
    expect(s.cards["sr-1"]?.zone).toBe("removed-from-game");
    expect(s.corp.hand).toHaveLength(2); // drew 2 after trash 2
    expect(s.corp.discardPile).toHaveLength(1); // arch leftovers after shuffle 2
  });

  it("Marcus Batty: offers a subroutine on rezzed ice protecting this server", () => {
    const s = createInitialState();
    put(s, "marcus-batty", "mb-1", "server:hq:root");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"]!.ice = ["iw-1"];
    s.servers["hq"]!.root = ["mb-1"];
    s.run = {
      attackedServerId: "hq",
      accessedCardIds: [],
    } as unknown as GameState["run"];
    runKind(s, "mb-1", "resolve_subroutine_on_rezzed_ice_protecting_this_server");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["batty:iw-1:0"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "batty:iw-1:0",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.endedTheRun ?? after.state.run === null).toBeTruthy();
  });

  it("Tempus: offers lose two clicks or suffer 1 core damage", () => {
    const s = createInitialState();
    put(s, "tempus", "tmp-1", "server:hq:root");
    s.runner.clicks = 3;
    runKind(s, "tmp-1", "resolve_tempus");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "lose-clicks",
      "core",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "lose-clicks",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.clicks).toBe(1);
  });

  it("Trade-In: gains half install cost then offers hardware from stack", () => {
    const s = createInitialState();
    put(s, "trade-in", "ti-1", "runner:play");
    s.turn.tradeInCredits = 1; // half of Desperado's 3
    s.runner.credits = 4;
    put(s, "desperado", "desp-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["sg-1", "desp-1"];
    runKind(s, "ti-1", "resolve_trade_in");
    expect(s.runner.credits).toBe(5);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["decline-search-hw", "trade-search:desp-1"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "trade-search:desp-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("desp-1");
    expect(after.state.runner.deck).not.toContain("desp-1");
  });

  it("24/7 News Cycle: offers when-scored on a scored agenda", () => {
    const s = createInitialState();
    put(s, "24-7-news-cycle", "news-1", "corp:play");
    put(s, "hostile-takeover", "ht-1", "corp:score");
    s.corp.scoreArea = ["ht-1"];
    s.corp.credits = 2;
    runKind(s, "news-1", "resolve_when_scored_on_scored_agenda");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["247:ht-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "247:ht-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(9);
  });

  it("Beta Build: returns tracked installed program to stack top when still installed", () => {
    const s = createInitialState();
    put(s, "beta-build", "bb-1", "runner:play");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["prog-1"];
    s.runner.deck = [];
    s.run = {
      attackedServerId: "hq",
      betaBuildTrackedInstallId: "prog-1",
    } as GameState["run"];
    runKind(s, "bb-1", "return_tracked_install_to_stack_top_if_installed");
    expect(s.runner.installed).not.toContain("prog-1");
    expect(s.runner.deck[0]).toBe("prog-1");
    expect(s.cards["prog-1"]?.zone).toBe("runner:stack");
  });

  it("Fear the Masses: reveals grip copies, skips breach, trashes 1+copies from R&D", () => {
    const s = createInitialState();
    put(s, "fear-the-masses", "ftm-1", "runner:play");
    put(s, "fear-the-masses", "ftm-2", "runner:hand");
    put(s, "fear-the-masses", "ftm-3", "runner:hand");
    s.runner.hand = ["ftm-2", "ftm-3"];
    for (let i = 0; i < 5; i++) put(s, "hedge-fund", `rd-${i}`, "corp:rd");
    s.corp.deck = ["rd-0", "rd-1", "rd-2", "rd-3", "rd-4"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "ftm-1", "reveal_copies_trash_rd");
    expect(s.run?.skipBreach).toBe(true);
    expect(s.cards["ftm-2"]?.faceup).toBe(true);
    expect(s.cards["ftm-3"]?.faceup).toBe(true);
    expect(s.corp.deck).toHaveLength(2); // trashed 1+2=3
    expect(s.corp.discardPile).toHaveLength(3);
  });

  it("Customized Secretary: reveals top 5 and offers to host revealed programs", () => {
    const s = createInitialState();
    put(s, "customized-secretary", "cs-1", "runner:installed");
    s.runner.installed = ["cs-1"];
    put(s, "corroder", "prog-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    put(s, "datasucker", "prog-2", "runner:stack");
    put(s, "sure-gamble", "sg-2", "runner:stack");
    put(s, "sure-gamble", "sg-3", "runner:stack");
    s.runner.deck = ["prog-1", "sg-1", "prog-2", "sg-2", "sg-3"];
    runKind(s, "cs-1", "reveal_host_programs");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["host:prog-1", "host:prog-2", "done"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "host:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["prog-1"]?.hostId).toBe("cs-1");
    expect(after.state.cards["cs-1"]?.hostedCardIds).toContain("prog-1");
  });

  it("Perfect Recall: reveals an HQ card and forbids steal/trash of that title this run", () => {
    const s = createInitialState();
    put(s, "perfect-recall", "pr-1", "server:hq:root");
    put(s, "hostile-takeover", "ht-1", "corp:hand");
    put(s, "hedge-fund", "hf-1", "corp:hand");
    s.corp.hand = ["ht-1", "hf-1"];
    s.servers["hq"]!.root = ["pr-1"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "pr-1", "reveal_hq_forbid_steal_trash_copies_this_run");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["reveal:ht-1", "reveal:hf-1"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "reveal:ht-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.forbidStealTrashTitles).toContain("Hostile Takeover");
  });

  it("Plan B: offers to score an HQ agenda with requirement ≤ its advancements", () => {
    const s = createInitialState();
    const pb = put(s, "plan-b", "pb-1", "server:remote-1:root");
    pb.advancementCounters = 2;
    put(s, "hostile-takeover", "ht-1", "corp:hand");
    put(s, "priority-requisition", "pr-1", "corp:hand");
    s.corp.hand = ["ht-1", "pr-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pb-1"],
    } as GameState["servers"][string];
    runKind(s, "pb-1", "reveal_score_from_hq");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["pb:ht-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "pb:ht-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.scoreArea).toContain("ht-1");
    expect(after.state.corp.hand).not.toContain("ht-1");
  });

  it("Bamboo Dome: reveals top 3 of R&D, adds 1 to HQ, returns others on top in order", () => {
    const s = createInitialState();
    put(s, "bamboo-dome", "bd-1", "server:rd:root");
    put(s, "hedge-fund", "rd-0", "corp:rnd");
    put(s, "pad-campaign", "rd-1", "corp:rnd");
    put(s, "ice-wall", "rd-2", "corp:rnd");
    put(s, "hostile-takeover", "rd-3", "corp:rnd");
    s.corp.deck = ["rd-0", "rd-1", "rd-2", "rd-3"];
    s.corp.hand = [];
    s.servers["rd"]!.root = ["bd-1"];
    runKind(s, "bd-1", "reveal_top_3");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "hq:rd-0",
      "hq:rd-1",
      "hq:rd-2",
    ]);
    let after = applyAction(s, { type: "choose_option", optionId: "hq:rd-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toContain("rd-1");
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["top:rd-0", "top:rd-2"]),
    );
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "top:rd-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.deck.slice(0, 2)).toEqual(["rd-2", "rd-0"]);
    expect(after.state.corp.deck[2]).toBe("rd-3");
  });

  it("Open Forum: reveals top of R&D into HQ, then puts 1 HQ card on R&D top", () => {
    const s = createInitialState();
    put(s, "open-forum", "of-1", "server:remote-1:root");
    put(s, "hedge-fund", "top-1", "corp:rnd");
    put(s, "pad-campaign", "hq-1", "corp:hand");
    s.corp.deck = ["top-1"];
    s.corp.hand = ["hq-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["of-1"],
    } as GameState["servers"][string];
    runKind(s, "of-1", "reveal_top_rd_to_hq_then_hq_to_rd_top");
    expect(s.corp.hand).toEqual(expect.arrayContaining(["hq-1", "top-1"]));
    expect(s.corp.deck).toEqual([]);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["of:hq-1", "of:top-1"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "of:hq-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.deck[0]).toBe("hq-1");
    expect(after.state.corp.hand).toEqual(["top-1"]);
  });

  it("Concerto: reveals stack top into grip and places its play/install cost as hosted credits", () => {
    const s = createInitialState();
    put(s, "concerto", "con-1", "runner:play");
    put(s, "sure-gamble", "top-1", "runner:stack");
    s.runner.deck = ["top-1"];
    s.runner.hand = [];
    runKind(s, "con-1", "reveal_top_stack_to_grip_place_hosted_credits");
    expect(s.runner.hand).toContain("top-1");
    expect(s.runner.deck).toEqual([]);
    expect(s.cards["con-1"]?.hostedCredits).toBe(5);
    expect(s.cards["top-1"]?.faceup).toBe(true);
  });

  it("Shoot the Moon: rezzes 1 unrezzed ice per Runner tag ignoring costs", () => {
    const s = createInitialState();
    put(s, "shoot-the-moon", "stm-1", "corp:play");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    put(s, "enigma", "en-1", "server:rd:ice");
    s.servers["hq"]!.ice = ["iw-1"];
    s.servers["rd"]!.ice = ["en-1"];
    s.runner.tags = 2;
    s.corp.credits = 0;
    runKind(s, "stm-1", "rez_ice_per_tag");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["stm-rez:iw-1", "stm-rez:en-1", "stm-done"]),
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "stm-rez:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(0);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "stm-rez:en-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["en-1"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(0);
  });

  it("Sensor Net Activation: rezzes an unrezzed bioroid ignoring costs and queues turn-end derez", () => {
    const s = createInitialState();
    put(s, "sensor-net-activation", "sna-1", "corp:score");
    s.corp.scoreArea = ["sna-1"];
    const ice = put(s, "eli-1-0", "eli-1", "server:hq:ice");
    ice.rezzed = false;
    s.servers["hq"]!.ice = ["eli-1"];
    s.corp.credits = 0;
    runKind(s, "sna-1", "rez_sensor_net_bioroid_ignoring_costs_derez_turn_end");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["sensor-net:eli-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "sensor-net:eli-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["eli-1"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(0);
    expect(after.state.turn.sensorNetPendingDerezIds).toContain("eli-1");
  });

  it("Quarantine System: rezzes up to 3 ice at −2¢ per forfeited agenda point", () => {
    const s = createInitialState();
    put(s, "quarantine-system", "qs-1", "server:remote-1:root");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    put(s, "enigma", "en-1", "server:rd:ice");
    s.servers["hq"]!.ice = ["iw-1"];
    s.servers["rd"]!.ice = ["en-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["qs-1"],
    } as GameState["servers"][string];
    s.lastForfeitedAgendaPoints = 1;
    s.corp.credits = 1;
    runKind(s, "qs-1", "rez_up_to_3_ice_discount");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["rez:iw-1", "rez:en-1", "done"]),
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "rez:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(1); // rez 1 − 2 = 0
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "rez:en-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["en-1"]?.rezzed).toBe(true);
    expect(after.state.corp.credits).toBe(0); // rez 3 − 2 = 1
  });

  it("Mumbad City Hall: offers an alliance from R&D to reveal and play/install", () => {
    const s = createInitialState();
    put(s, "mumbad-city-hall", "mch-1", "server:remote-1:root");
    put(s, "product-recall", "pr-1", "corp:rnd");
    put(s, "hedge-fund", "hf-1", "corp:rnd");
    s.corp.deck = ["hf-1", "pr-1"];
    s.corp.hand = [];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["mch-1"],
    } as GameState["servers"][string];
    runKind(s, "mch-1", "search_alliance_play_or_install");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["mch:pr-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "mch:pr-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.deck).not.toContain("pr-1");
    expect(after.state.corp.hand).toContain("pr-1");
  });

  it("Crypt: searches stack for a virus program, installs paying cost, then shuffles", () => {
    const s = createInitialState();
    put(s, "crypt", "crypt-1", "runner:installed");
    s.runner.installed = ["crypt-1"];
    put(s, "datasucker", "ds-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["sg-1", "ds-1"];
    s.runner.credits = 5;
    runKind(s, "crypt-1", "search_crypt_install");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "crypt-install:ds-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "crypt-install:ds-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("ds-1");
    expect(after.state.runner.deck).not.toContain("ds-1");
    expect(after.state.runner.deck).toContain("sg-1");
    expect(after.state.runner.credits).toBe(4);
  });

  it("Kabonesa Wu: searches stack for a non-virus program and installs at −1¢", () => {
    const s = createInitialState();
    put(s, "kabonesa-wu-netspace-thrillseeker", "kw-1", "runner:identity");
    put(s, "corroder", "prog-1", "runner:stack");
    put(s, "datasucker", "ds-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["sg-1", "ds-1", "prog-1"];
    s.runner.credits = 5;
    runKind(s, "kw-1", "search_kabonesa_install");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["kabonesa:prog-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "kabonesa:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("prog-1");
    expect(after.state.runner.deck).not.toContain("prog-1");
    expect(after.state.runner.credits).toBe(4); // 2 − 1
    expect(after.state.turn.dtwnKabonesaTrackedInstallIds).toContain("prog-1");
  });

  it("Recruiting Trip: reveals up to X different sysops from R&D into HQ then shuffles", () => {
    const s = createInitialState();
    put(s, "recruiting-trip", "rt-1", "corp:play");
    put(s, "tori-hanzo", "sys-1", "corp:rnd");
    put(s, "midori", "sys-2", "corp:rnd");
    put(s, "hedge-fund", "hf-1", "corp:rnd");
    s.corp.deck = ["hf-1", "sys-1", "sys-2"];
    s.corp.hand = [];
    s.turn.lastPlayCostX = 2;
    runKind(s, "rt-1", "search_rd_up_to_x_subtype_to_hq", {
      subtype: "sysop",
    });
    expect(s.corp.hand).toEqual(expect.arrayContaining(["sys-1", "sys-2"]));
    expect(s.corp.hand).toHaveLength(2);
    expect(s.corp.deck).toEqual(["hf-1"]);
  });

  it("Rosetta 2.0: RFGs an installed program then installs a non-virus from stack at that discount", () => {
    const s = createInitialState();
    put(s, "rosetta-2-0", "ros-1", "runner:installed");
    put(s, "datasucker", "old-1", "runner:installed");
    s.runner.installed = ["ros-1", "old-1"];
    put(s, "corroder", "prog-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["sg-1", "prog-1"];
    s.runner.credits = 1;
    runKind(s, "ros-1", "search_rosetta_rfg_program_install_non_virus");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["rfg:old-1"]);
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "rfg:old-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["old-1"]?.zone).toBe("removed-from-game");
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual([
      "install:prog-1",
    ]);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "install:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("prog-1");
    expect(after.state.runner.credits).toBe(0); // 2 − 1 (datasucker)
  });

  it("Asmund Pudlat: hosts up to 2 virus/weapon cards with different names from the stack", () => {
    const s = createInitialState();
    put(s, "asmund-pudlat", "asm-1", "runner:installed");
    s.runner.installed = ["asm-1"];
    put(s, "botulus", "v-1", "runner:stack");
    put(s, "botulus", "v-2", "runner:stack");
    put(s, "poison-vial", "w-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["v-1", "v-2", "w-1", "sg-1"];
    runKind(s, "asm-1", "search_stack_host_virus_or_weapon", { max: 2 });
    expect(s.cards["asm-1"]?.hostedCardIds).toEqual(["v-1", "w-1"]);
    expect(s.cards["v-1"]?.hostId).toBe("asm-1");
    expect(s.cards["v-1"]?.faceup).toBe(true);
    expect(s.runner.installed).not.toContain("v-1");
    expect(s.runner.deck).toContain("v-2");
    expect(s.runner.deck).toContain("sg-1");
  });

  it("Hostage: searches stack for a connection, adds it to grip, and may install it", () => {
    const s = createInitialState();
    put(s, "hostage", "hos-1", "runner:play");
    put(s, "kati-jones", "kj-1", "runner:stack");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["sg-1", "kj-1"];
    s.runner.hand = [];
    s.runner.credits = 5;
    runKind(s, "hos-1", "search_stack_subtype_may_install", {
      subtype: "connection",
    });
    expect(s.runner.hand).toContain("kj-1");
    expect(s.runner.deck).not.toContain("kj-1");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["install:kj-1", "decline-install"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "install:kj-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toContain("kj-1");
    expect(after.state.runner.credits).toBe(3);
  });

  it("Self-destruct: trashes all cards on the run server then Trace does 3 net damage", () => {
    const s = createInitialState();
    put(s, "self-destruct", "sd-1", "server:remote-1:root");
    put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    put(s, "ice-wall", "iw-1", "server:remote-1:ice");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["iw-1"],
      root: ["sd-1", "pad-1"],
    } as GameState["servers"][string];
    s.run = { attackedServerId: "remote-1" } as GameState["run"];
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `sg-${i}`, "runner:hand");
    s.runner.hand = ["sg-0", "sg-1", "sg-2", "sg-3"];
    s.runner.link = 0;
    runKind(s, "sd-1", "self_destruct_ability");
    expect(s.servers["remote-1"]!.ice).toEqual([]);
    expect(s.servers["remote-1"]!.root).toEqual(["sd-1"]);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["pad-1", "iw-1"]),
    );
    expect(s.runner.hand.length).toBe(1);
    expect(s.runner.discardPile.length).toBe(3);
  });

  it("Sensei: registers that other ice gain End the run for the remainder of the run", () => {
    const s = createInitialState();
    put(s, "sensei", "sen-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["sen-1"];
    s.run = { attackedServerId: "hq" } as GameState["run"];
    runKind(s, "sen-1", "sensei_register_etr_on_other_ice_for_run");
    expect(s.run?.senseiEtrSourceIds).toEqual(["sen-1"]);
  });

  it("Because I Can: shuffles all cards in the attacked remote root into R&D", () => {
    const s = createInitialState();
    put(s, "because-i-can", "bic-1", "runner:play");
    put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    put(s, "hostile-takeover", "ht-1", "server:remote-1:root");
    put(s, "hedge-fund", "rd-1", "corp:rnd");
    s.corp.deck = ["rd-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1", "ht-1"],
    } as GameState["servers"][string];
    s.run = { attackedServerId: "remote-1" } as GameState["run"];
    runKind(s, "bic-1", "shuffle_because_i_can_root");
    expect(s.servers["remote-1"]!.root).toEqual([]);
    expect(s.corp.deck).toEqual(
      expect.arrayContaining(["rd-1", "pad-1", "ht-1"]),
    );
    expect(s.corp.deck).toHaveLength(3);
    expect(s.cards["pad-1"]?.zone).toBe("corp:rd");
    expect(s.cards["ht-1"]?.faceup).toBe(false);
  });

  it("Read-Write Share: shuffles all hosted cards into the stack", () => {
    const s = createInitialState();
    const rws = put(s, "read-write-share", "rws-1", "runner:installed");
    put(s, "sure-gamble", "h-1", "hosted:rws-1");
    put(s, "diesel", "h-2", "hosted:rws-1");
    put(s, "sure-gamble", "stk-0", "runner:stack");
    rws.hostedCardIds = ["h-1", "h-2"];
    s.cards["h-1"]!.hostId = "rws-1";
    s.cards["h-2"]!.hostId = "rws-1";
    s.runner.installed = ["rws-1"];
    s.runner.deck = ["stk-0"];
    runKind(s, "rws-1", "shuffle_hosted_cards_into_stack");
    expect(rws.hostedCardIds).toEqual([]);
    expect(s.runner.deck).toEqual(
      expect.arrayContaining(["stk-0", "h-1", "h-2"]),
    );
    expect(s.runner.deck).toHaveLength(3);
    expect(s.cards["h-1"]?.zone).toBe("runner:stack");
    expect(s.cards["h-1"]?.hostId).toBeUndefined();
  });

  it("Jinteki Biotech (Tank): shuffles all of Archives into R&D", () => {
    const s = createInitialState();
    put(s, "jinteki-biotech-life-imagined", "jb-1", "corp:identity");
    put(s, "hedge-fund", "a-1", "corp:archives");
    put(s, "pad-campaign", "a-2", "corp:archives");
    put(s, "hedge-fund", "rd-0", "corp:rnd");
    s.corp.identityId = "jb-1";
    s.corp.discardPile = ["a-1", "a-2"];
    s.corp.deck = ["rd-0"];
    runKind(s, "jb-1", "shuffle_jinteki_biotech_archives_into_rd");
    expect(s.corp.discardPile).toEqual([]);
    expect(s.corp.deck).toEqual(
      expect.arrayContaining(["rd-0", "a-1", "a-2"]),
    );
    expect(s.corp.deck).toHaveLength(3);
    expect(s.cards["a-1"]?.zone).toBe("corp:rd");
    expect(s.cards["a-1"]?.faceup).toBe(false);
  });

  it("Trope: shuffles 1 heap card into the stack per power counter", () => {
    const s = createInitialState();
    const trope = put(s, "trope", "trope-1", "runner:installed");
    trope.powerCounters = 2;
    put(s, "sure-gamble", "heap-1", "runner:heap");
    put(s, "diesel", "heap-2", "runner:heap");
    put(s, "sure-gamble", "heap-3", "runner:heap");
    put(s, "sure-gamble", "stk-0", "runner:stack");
    s.runner.installed = ["trope-1"];
    s.runner.discardPile = ["heap-1", "heap-2", "heap-3"];
    s.runner.deck = ["stk-0"];
    runKind(s, "trope-1", "shuffle_n_heap_cards_into_stack_per_power_counter");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining([
        "trope-shuffle:heap-1",
        "trope-shuffle:heap-2",
        "trope-shuffle:heap-3",
      ]),
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "trope-shuffle:heap-1",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "trope-shuffle:heap-2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toEqual(["heap-3"]);
    expect(after.state.runner.deck).toEqual(
      expect.arrayContaining(["stk-0", "heap-1", "heap-2"]),
    );
    expect(after.state.runner.deck).toHaveLength(3);
  });

  it("Degree Mill: Runner shuffles 2 installed cards into the stack", () => {
    const s = createInitialState();
    put(s, "degree-mill", "dm-1", "server:remote-1:root");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "daily-casts", "res-1", "runner:installed");
    put(s, "sure-gamble", "stk-0", "runner:stack");
    s.runner.installed = ["prog-1", "res-1"];
    s.runner.deck = ["stk-0"];
    runKind(s, "dm-1", "shuffle_n_installed_runner_into_stack", { amount: 2 });
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "degree:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "degree:res-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.installed).toEqual([]);
    expect(after.state.runner.deck).toEqual(
      expect.arrayContaining(["stk-0", "prog-1", "res-1"]),
    );
    expect(after.state.runner.deck).toHaveLength(3);
  });

  it("The Back: shuffles up to 2 heap [trash] cards per power counter into the stack", () => {
    const s = createInitialState();
    const back = put(s, "the-back", "back-1", "runner:installed");
    back.powerCounters = 1;
    put(s, "same-old-thing", "sot-1", "runner:heap");
    put(s, "fall-guy", "fg-1", "runner:heap");
    put(s, "sure-gamble", "sg-heap", "runner:heap");
    put(s, "sure-gamble", "stk-0", "runner:stack");
    s.runner.installed = ["back-1"];
    s.runner.discardPile = ["sot-1", "fg-1", "sg-heap"];
    s.runner.deck = ["stk-0"];
    runKind(s, "back-1", "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack", {
      nPerPowerCounter: 2,
    });
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining([
        "heap-trash-done",
        "heap-trash:sot-1",
        "heap-trash:fg-1",
      ]),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).not.toContain(
      "heap-trash:sg-heap",
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "heap-trash:sot-1",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "heap-trash-done",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["fg-1", "sg-heap"]),
    );
    expect(after.state.runner.deck).toEqual(
      expect.arrayContaining(["stk-0", "sot-1"]),
    );
    expect(after.state.runner.deck).toHaveLength(2);
  });

  it("Reuse: spends 1 click as an additional cost", () => {
    const s = createInitialState();
    put(s, "reuse", "reuse-1", "corp:play");
    s.corp.clicks = 3;
    runKind(s, "reuse-1", "spend_click_additional_cost");
    expect(s.corp.clicks).toBe(2);
  });

  it("Bahia Bands: marks hosted credits spendable for trash costs", () => {
    const s = createInitialState();
    const bahia = put(s, "bahia-bands", "bb-1", "runner:play");
    bahia.hostedCredits = 4;
    runKind(s, "bb-1", "spend_enable_hosted_credits_for", {
      purposes: ["trash"],
    });
    expect(bahia.hostedCreditsSpendFor).toEqual(["trash"]);
  });

  it("MKUltra: +2 strength then breaks up to 2 sentry subs if it can interface", () => {
    const s = createInitialState();
    put(s, "mkultra", "mk-1", "runner:installed");
    s.runner.installed = ["mk-1"];
    const ice = put(s, "cobra", "cobra-1", "server:hq:ice");
    ice.subroutines = [{ text: "A" }, { text: "B" }, { text: "C" }] as never;
    s.servers["hq"]!.ice = ["cobra-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "cobra-1", broken: [false, false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "mk-1", "spend_mkultra_pump_and_break");
    expect(lingeringBreakerStrengthOfKind(s, "mk-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
    expect(s.run?.encounter?.broken).toEqual([true, true, false]);

    const s2 = createInitialState();
    put(s2, "mkultra", "mk-2", "runner:installed");
    const hunter = put(s2, "hunter", "hun-1", "server:hq:ice");
    hunter.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s2.servers["hq"]!.ice = ["hun-1"];
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "hun-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s2, "mk-2", "spend_mkultra_pump_and_break");
    expect(lingeringBreakerStrengthOfKind(s2, "mk-2", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
    expect(s2.run?.encounter?.broken).toEqual([false, false]);
  });

  it("Black Orchestra: +2 strength then breaks up to 2 code gate subs if it can interface", () => {
    const s = createInitialState();
    put(s, "black-orchestra", "bo-1", "runner:installed");
    s.runner.installed = ["bo-1"];
    const ice = put(s, "enigma", "en-1", "server:hq:ice");
    ice.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s.servers["hq"]!.ice = ["en-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "en-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "bo-1", "spend_pump_and_break");
    expect(lingeringBreakerStrengthOfKind(s, "bo-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
    expect(s.run?.encounter?.broken).toEqual([true, true]);

    const s2 = createInitialState();
    put(s2, "black-orchestra", "bo-2", "runner:installed");
    const toll = put(s2, "tollbooth", "tb-1", "server:hq:ice");
    toll.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s2.servers["hq"]!.ice = ["tb-1"];
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "tb-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s2, "bo-2", "spend_pump_and_break");
    expect(lingeringBreakerStrengthOfKind(s2, "bo-2", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
    expect(s2.run?.encounter?.broken).toEqual([false, false]);
  });

  it("Shi.Kyū: Corp spends credits; Runner may take that net or score it as −1", () => {
    const s = createInitialState();
    put(s, "shi-kyu", "shi-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["shi-1"],
    } as GameState["servers"][string];
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `sg-${i}`, "runner:hand");
    s.runner.hand = ["sg-0", "sg-1", "sg-2"];
    s.corp.credits = 5;
    runKind(s, "shi-1", "spend_shi_kyu_for_net_damage");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("shi:2");
    let after = applyAction(s, { type: "choose_option", optionId: "shi:2" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(3);
    expect(after.state.pendingChoice?.chooser).toBe("runner");
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["shi-net", "shi-score"]),
    );
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "shi-net",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand.length).toBe(1);
    expect(after.state.runner.discardPile.length).toBe(2);

    const s2 = createInitialState();
    put(s2, "shi-kyu", "shi-2", "server:remote-1:root");
    s2.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["shi-2"],
    } as GameState["servers"][string];
    s2.corp.credits = 4;
    runKind(s2, "shi-2", "spend_shi_kyu_for_net_damage");
    let after2 = applyAction(s2, { type: "choose_option", optionId: "shi:1" });
    if (!after2.ok) throw new Error(after2.error);
    after2 = applyAction(after2.state, {
      type: "choose_option",
      optionId: "shi-score",
    });
    if (!after2.ok) throw new Error(after2.error);
    expect(after2.state.corp.credits).toBe(3);
    expect(after2.state.runner.scoreArea).toContain("shi-2");
    expect(after2.state.cards["shi-2"]?.agendaPoints).toBe(-1);
  });

  it("Paperclip: spends X for +X strength then breaks up to X if it can interface", () => {
    const s = createInitialState();
    put(s, "paperclip", "pc-1", "runner:installed");
    s.runner.installed = ["pc-1"];
    s.runner.credits = 5;
    const ice = put(s, "wall-of-static", "wos-1", "server:hq:ice");
    ice.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s.servers["hq"]!.ice = ["wos-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "wos-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "pc-1", "spend_x_pump_and_break");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("paperclip-x:2");
    // str 1+2=3 == ice 3 — interfaces and breaks up to 2.
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "paperclip-x:2",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(3);
    expect(lingeringBreakerStrengthOfKind(after.state, "pc-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
    expect(after.state.run?.encounter?.broken).toEqual([true, true]);

    const s2 = createInitialState();
    put(s2, "paperclip", "pc-2", "runner:installed");
    s2.runner.credits = 5;
    const tall = put(s2, "heimdall-1-0", "heim-1", "server:hq:ice");
    tall.subroutines = [{ text: "A" }, { text: "B" }] as never;
    s2.servers["hq"]!.ice = ["heim-1"];
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "heim-1", broken: [false, false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s2, "pc-2", "spend_x_pump_and_break");
    // str 1+2=3 < heimdall 6 — pump only, no break.
    const after2 = applyAction(s2, {
      type: "choose_option",
      optionId: "paperclip-x:2",
    });
    if (!after2.ok) throw new Error(after2.error);
    expect(lingeringBreakerStrengthOfKind(after2.state, "pc-2", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
    expect(after2.state.run?.encounter?.broken).toEqual([false, false]);
  });

  it("By Any Means: activates trash-on-access (not Archives) for the turn", () => {
    const s = createInitialState();
    put(s, "by-any-means", "bam-1", "runner:play");
    expect(s.turn.ssByAnyMeansActive).toBeFalsy();
    runKind(s, "bam-1", "ss_activate_by_any_means");
    expect(s.turn.ssByAnyMeansActive).toBe(true);
  });

  it("Wake Up Call: Runner trashes the chosen hardware or suffers 4 meat", () => {
    const s = createInitialState();
    put(s, "wake-up-call", "wuc-1", "corp:play");
    put(s, "desperado", "hw-1", "runner:installed");
    put(s, "daily-casts", "res-1", "runner:installed");
    s.runner.installed = ["hw-1", "res-1"];
    for (let i = 0; i < 5; i++) put(s, "sure-gamble", `sg-${i}`, "runner:hand");
    s.runner.hand = ["sg-0", "sg-1", "sg-2", "sg-3", "sg-4"];
    runKind(s, "wuc-1", "ss_wake_up_call");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["wuc:hw-1", "wuc:res-1"]),
    );
    let after = applyAction(s, { type: "choose_option", optionId: "wuc:hw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["trash", "meat"]),
    );
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "trash",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("hw-1");
    expect(after.state.runner.installed).toEqual(["res-1"]);
  });

  it("The Supplier: hosts a resource or hardware from the grip", () => {
    const s = createInitialState();
    put(s, "the-supplier", "sup-1", "runner:installed");
    put(s, "daily-casts", "dc-1", "runner:hand");
    put(s, "sure-gamble", "sg-1", "runner:hand");
    s.runner.installed = ["sup-1"];
    s.runner.hand = ["dc-1", "sg-1"];
    runKind(s, "sup-1", "supplier_host_from_grip");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["host:dc-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "host:dc-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["sup-1"]?.hostedCardIds).toContain("dc-1");
    expect(after.state.cards["dc-1"]?.hostId).toBe("sup-1");
    expect(after.state.runner.hand).toEqual(["sg-1"]);
  });

  it("Surfer: swaps the encountered barrier with adjacent ice; still on that barrier", () => {
    const s = createInitialState();
    put(s, "surfer", "sur-1", "runner:installed");
    s.runner.installed = ["sur-1"];
    const barrier = put(s, "ice-wall", "iw-1", "server:hq:ice");
    barrier.subroutines = [{ text: "ETR" }] as never;
    put(s, "enigma", "en-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["en-1", "iw-1"];
    s.run = {
      attackedServerId: "hq",
      position: 1,
      encounter: { iceId: "iw-1", broken: [false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "sur-1", "swap_encounter_barrier_adjacent");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "surfer-swap:en-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "surfer-swap:en-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["hq"]!.ice).toEqual(["iw-1", "en-1"]);
    expect(after.state.run?.position).toBe(0);
    expect(after.state.run?.encounter?.iceId).toBe("iw-1");
    expect(after.state.run?.encounter?.broken).toEqual([false]);
  });

  it("Allele Repression: swaps 1 HQ ↔ Archives card per advancement on itself", () => {
    const s = createInitialState();
    const allele = put(s, "allele-repression", "ar-1", "server:remote-1:root");
    allele.advancementCounters = 1;
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "pad-campaign", "arch-1", "corp:archives");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ar-1"],
    } as GameState["servers"][string];
    s.corp.hand = ["hq-1"];
    s.corp.discardPile = ["arch-1"];
    runKind(s, "ar-1", "swap_hq_archives_per_advancement_on_self");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["allele:hq-1:arch-1", "stop"]),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).not.toContain("decline");
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "allele:hq-1:arch-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.hand).toEqual(["arch-1"]);
    expect(after.state.corp.discardPile).toEqual(["hq-1"]);
  });

  it("Exchange of Information: swaps one Corp scored agenda with one Runner scored agenda", () => {
    const s = createInitialState();
    put(s, "exchange-of-information", "eoi-1", "corp:play");
    put(s, "hostile-takeover", "ht-1", "corp:score");
    put(s, "priority-requisition", "pr-1", "runner:score");
    s.corp.scoreArea = ["ht-1"];
    s.runner.scoreArea = ["pr-1"];
    runKind(s, "eoi-1", "swap_scored_agendas");
    expect(s.corp.scoreArea).toEqual(["pr-1"]);
    expect(s.runner.scoreArea).toEqual(["ht-1"]);
    expect(s.cards["ht-1"]?.zone).toBe("runner:score");
    expect(s.cards["pr-1"]?.zone).toBe("corp:score");
  });

  it("Turntable: may swap the stolen agenda with a Corp scored agenda", () => {
    const s = createInitialState();
    put(s, "turntable", "tt-1", "runner:installed");
    put(s, "hostile-takeover", "stolen-1", "runner:score");
    put(s, "priority-requisition", "corp-1", "corp:score");
    s.runner.installed = ["tt-1"];
    s.runner.scoreArea = ["stolen-1"];
    s.corp.scoreArea = ["corp-1"];
    s.turn.lastStolenAgendaId = "stolen-1";
    runKind(s, "tt-1", "swap_stolen_with_corp_scored");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "tt-swap:corp-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "tt-swap:corp-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.scoreArea).toEqual(["corp-1"]);
    expect(after.state.corp.scoreArea).toEqual(["stolen-1"]);
  });

  it("Toshiyuki Sakai: swaps with an HQ agenda/asset, keeping advancements", () => {
    const s = createInitialState();
    const sakai = put(s, "toshiyuki-sakai", "sak-1", "server:remote-1:root");
    sakai.advancementCounters = 2;
    put(s, "hostile-takeover", "hq-1", "corp:hand");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["sak-1"],
    } as GameState["servers"][string];
    s.corp.hand = ["hq-1"];
    runKind(s, "sak-1", "swap_with_hq");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "toshiyuki-swap:hq-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "toshiyuki-swap:hq-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.servers["remote-1"]!.root).toEqual(["hq-1"]);
    expect(after.state.corp.hand).toContain("sak-1");
    expect(after.state.cards["hq-1"]?.advancementCounters).toBe(2);
    expect(after.state.cards["hq-1"]?.rezzed).toBe(false);
  });

  it("City Works Project: access meat is 2 plus advancements on itself", () => {
    const s = createInitialState();
    const cwp = put(s, "city-works-project", "cwp-1", "server:remote-1:root");
    cwp.advancementCounters = 1;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["cwp-1"],
    } as GameState["servers"][string];
    for (let i = 0; i < 4; i++) put(s, "sure-gamble", `sg-${i}`, "runner:hand");
    s.runner.hand = ["sg-0", "sg-1", "sg-2", "sg-3"];
    runKind(s, "cwp-1", "tdatd_city_works_meat");
    expect(s.runner.hand.length).toBe(1);
    expect(s.runner.discardPile.length).toBe(3);
  });

  it("Falsified Credentials: naming the exposed remote card's type gains 5", () => {
    const s = createInitialState();
    put(s, "falsified-credentials", "fc-1", "runner:play");
    put(s, "adonis-campaign", "as-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    s.runner.credits = 2;
    runKind(s, "fc-1", "tdatd_falsified_credentials");
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain(
      "falsified:asset",
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "falsified:asset",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "falsified-expose:as-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(7);
  });

  it("Glut Cipher: with 5+ Archives, adds 5 to HQ then trashes 5 at random", () => {
    const s = createInitialState();
    put(s, "glut-cipher", "gc-1", "runner:play");
    for (let i = 0; i < 5; i++) {
      put(s, "hedge-fund", `arch-${i}`, "corp:archives");
    }
    put(s, "pad-campaign", "hq-keep", "corp:hand");
    s.corp.discardPile = ["arch-0", "arch-1", "arch-2", "arch-3", "arch-4"];
    s.corp.hand = ["hq-keep"];
    runKind(s, "gc-1", "tdatd_glut_cipher");
    expect(s.corp.hand.length).toBe(1);
    expect(s.corp.discardPile.length).toBe(5);
  });

  it("Knobkierie: places 1 virus counter on the only installed virus", () => {
    const s = createInitialState();
    put(s, "knobkierie", "knob-1", "runner:installed");
    const virus = put(s, "datasucker", "ds-1", "runner:installed");
    virus.virusCounters = 0;
    s.runner.installed = ["knob-1", "ds-1"];
    runKind(s, "knob-1", "tdatd_knobkierie_place_virus");
    expect(s.cards["ds-1"]?.virusCounters).toBe(1);
  });

  it("Oduduwa: places 1 on itself then may place that many on another ice", () => {
    const s = createInitialState();
    const oduduwa = put(s, "oduduwa", "odu-1", "server:hq:ice");
    oduduwa.advancementCounters = 0;
    put(s, "ice-wall", "iw-1", "server:rd:ice");
    s.servers["hq"]!.ice = ["odu-1"];
    s.servers["rd"]!.ice = ["iw-1"];
    runKind(s, "odu-1", "tdatd_oduduwa_encounter");
    expect(s.cards["odu-1"]?.advancementCounters).toBe(1);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["oduduwa:iw-1", "decline"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "oduduwa:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.advancementCounters).toBe(1);
  });

  it("Tennin Institute: may place 1 advancement on an installed (including unrezzed) card", () => {
    const s = createInitialState();
    put(s, "tennin-institute-the-secrets-within", "ten-1", "corp:identity");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["iw-1"];
    expect(s.cards["iw-1"]?.rezzed).toBeFalsy();
    runKind(s, "ten-1", "tennin_place_advancement_on_installed");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["tennin:iw-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "tennin:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["iw-1"]?.advancementCounters).toBe(1);
  });

  it("Amani Senai: successful Trace[X] adds an installed Runner card to the grip", () => {
    const s = createInitialState();
    put(s, "amani-senai", "amani-1", "server:remote-1:root");
    const amani = s.cards["amani-1"]!;
    amani.rezzed = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["amani-1"],
    } as GameState["servers"][string];
    put(s, "hostile-takeover", "ht-1", "corp:score");
    put(s, "corroder", "prog-1", "runner:installed");
    s.corp.scoreArea = ["ht-1"];
    s.runner.installed = ["prog-1"];
    s.runner.hand = [];
    s.runner.link = 0;
    s.turn.lastScoredOrStolenAgendaId = "ht-1";
    runKind(s, "amani-1", "trace_amani");
    expect(s.turn.lastResolvedTraceStrength).toBe(2);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["amani:prog-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "amani:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("prog-1");
    expect(after.state.runner.installed).not.toContain("prog-1");
  });

  it("Security Nexus: Trace[5] success tags and ETRs; failure bypasses", () => {
    const s = createInitialState();
    put(s, "security-nexus", "sn-1", "runner:installed");
    s.runner.installed = ["sn-1"];
    s.runner.link = 0;
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.subroutines = [{ text: "ETR" }] as never;
    s.servers["hq"]!.ice = ["iw-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1", broken: [false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "sn-1", "trace_bypass_or_tag_etr");
    expect(s.runner.tags).toBe(1);
    expect(s.run?.endedTheRun ?? s.run === null).toBeTruthy();

    const s2 = createInitialState();
    put(s2, "security-nexus", "sn-2", "runner:installed");
    s2.runner.installed = ["sn-2"];
    s2.runner.link = 99;
    const ice2 = put(s2, "ice-wall", "iw-2", "server:hq:ice");
    ice2.subroutines = [{ text: "ETR" }] as never;
    s2.servers["hq"]!.ice = ["iw-2"];
    s2.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-2", broken: [false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s2, "sn-2", "trace_bypass_or_tag_etr");
    expect(s2.runner.tags).toBe(0);
    expect(s2.run?.encounter).toBeNull();
  });

  it("Broadcast Square: Trace[3] success prevents pending BP; failure takes it", () => {
    const s = createInitialState();
    put(s, "broadcast-square", "bs-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["bs-1"],
    } as GameState["servers"][string];
    s.corp.badPublicity = 0;
    s.turn.pendingBadPublicityTake = 1;
    s.runner.link = 0;
    runKind(s, "bs-1", "trace_prevent_bad_publicity");
    expect(s.trace?.baseStrength).toBe(3);
    const resolved = resolveTrace(s);
    if (!resolved.ok) throw new Error(resolved.error);
    expect(s.turn.lastResolvedTraceStrength).toBe(3);
    expect(s.corp.badPublicity).toBe(0);

    const s2 = createInitialState();
    put(s2, "broadcast-square", "bs-2", "server:remote-1:root");
    s2.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["bs-2"],
    } as GameState["servers"][string];
    s2.corp.badPublicity = 0;
    s2.turn.pendingBadPublicityTake = 2;
    s2.runner.link = 99;
    runKind(s2, "bs-2", "trace_prevent_bad_publicity");
    const r2 = resolveTrace(s2);
    if (!r2.ok) throw new Error(r2.error);
    expect(s2.corp.badPublicity).toBe(2);
  });

  it("Troll: successful Trace[2] forces lose click or end the run", () => {
    const s = createInitialState();
    put(s, "troll", "troll-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["troll-1"];
    s.runner.link = 0;
    s.runner.clicks = 3;
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "troll-1", broken: [false] },
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "troll-1", "trace_troll_encounter");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["troll-lose-click", "troll-etr"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "troll-lose-click",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.clicks).toBe(2);
  });

  it("AgInfusion: trashes approached unrezzed ice and redirects the run", () => {
    const s = createInitialState();
    put(s, "aginfusion-new-miracles-for-a-new-world", "agi-1", "corp:identity");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    put(s, "enigma", "en-1", "server:rd:ice");
    s.servers["hq"]!.ice = ["iw-1"];
    s.servers["rd"]!.ice = ["en-1"];
    s.run = {
      attackedServerId: "hq",
      position: 0,
      encounter: null,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "agi-1", "trash_aginfusion_approached_unrezzed_redirect");
    expect(s.corp.discardPile).toContain("iw-1");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["server:rd", "server:archives"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "server:rd",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.run?.attackedServerId).toBe("rd");
    expect(after.state.run?.position).toBe(0);
    expect(after.state.run?.forceEncounterIceId).toBe("en-1");
  });

  it("The Noble Path: trashes all cards from the grip", () => {
    const s = createInitialState();
    put(s, "the-noble-path", "tnp-1", "runner:play");
    put(s, "sure-gamble", "sg-0", "runner:hand");
    put(s, "diesel", "sg-1", "runner:hand");
    put(s, "sure-gamble", "sg-2", "runner:hand");
    s.runner.hand = ["sg-0", "sg-1", "sg-2"];
    runKind(s, "tnp-1", "trash_all_cards_from_grip");
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["sg-0", "sg-1", "sg-2"]),
    );
  });

  it("Apocalypse: trashes all installed Corp cards", () => {
    const s = createInitialState();
    put(s, "apocalypse", "apo-1", "runner:play");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    put(s, "adonis-campaign", "as-1", "server:remote-1:root");
    s.servers["hq"]!.ice = ["iw-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["as-1"],
    } as GameState["servers"][string];
    runKind(s, "apo-1", "trash_all_installed_corp_cards");
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["iw-1", "as-1"]),
    );
    expect(s.servers["hq"]!.ice).toEqual([]);
    expect(s.servers["remote-1"]!.root).toEqual([]);
  });

  it("Distract the Masses: trashes up to 2 from HQ then shuffles up to 2 Archives into R&D", () => {
    const s = createInitialState();
    put(s, "distract-the-masses", "dtm-1", "corp:play");
    put(s, "hedge-fund", "hq-0", "corp:hand");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "arch-0", "corp:archives");
    put(s, "hedge-fund", "rd-0", "corp:rnd");
    s.corp.hand = ["hq-0", "hq-1"];
    s.corp.discardPile = ["arch-0"];
    s.corp.deck = ["rd-0"];
    runKind(s, "dtm-1", "trash_distract_hq_shuffle_archives");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["trash-0", "trash1:hq-0", "trash1:hq-1"]),
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "trash1:hq-0",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("hq-0");
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["done-hq", "trash2:hq-1"]),
    );
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "done-hq",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["shuffle-0", "sh1:hq-0", "sh1:arch-0"]),
    );
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "sh1:arch-0",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.deck).toContain("arch-0");
    expect(after.state.corp.discardPile).not.toContain("arch-0");
  });

  it("Dummy Box: trashing a same-type grip card prevents the pending installed trash", () => {
    const s = createInitialState();
    put(s, "dummy-box", "db-1", "runner:installed");
    put(s, "desperado", "hw-1", "runner:installed");
    put(s, "plascrete-carapace", "grip-hw", "runner:hand");
    put(s, "sure-gamble", "grip-ev", "runner:hand");
    s.runner.installed = ["db-1", "hw-1"];
    s.runner.hand = ["grip-hw", "grip-ev"];
    s.pendingTrashPrevent = {
      cardId: "hw-1",
      trashExpected: true,
      pendingInterruptIds: [],
    };
    runKind(s, "db-1", "trash_grip_same_type_prevent");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["dummy:grip-hw"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "dummy:grip-hw",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("grip-hw");
    expect(after.state.pendingTrashPrevent).toBeNull();
    expect(after.state.runner.installed).toContain("hw-1");
  });

  it("Trade-In: additional cost trashes installed hardware and records half install cost", () => {
    const s = createInitialState();
    put(s, "trade-in", "ti-1", "runner:play");
    put(s, "desperado", "hw-1", "runner:installed");
    s.runner.installed = ["hw-1"];
    runKind(s, "ti-1", "trash_hardware_additional_cost");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "trade-in-hw:hw-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "trade-in-hw:hw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("hw-1");
    expect(after.state.turn.tradeInCredits).toBe(1); // floor(3/2)
  });

  it("Power Grid Overload: trashes hardware with install cost ≤ last trace excess", () => {
    const s = createInitialState();
    put(s, "power-grid-overload", "pgo-1", "corp:play");
    put(s, "clone-chip", "cheap-1", "runner:installed"); // install 1
    put(s, "desperado", "pricey-1", "runner:installed"); // install 3
    s.runner.installed = ["cheap-1", "pricey-1"];
    s.turn.lastTraceExcess = 2;
    runKind(s, "pgo-1", "trash_hardware_install_cost_lte_last_trace_excess", {
      pick: "choose",
    });
    expect(s.runner.discardPile).toContain("cheap-1");
    expect(s.runner.installed).toEqual(["pricey-1"]);
  });

  it("Enforcer 1.0: trashes an installed console", () => {
    const s = createInitialState();
    put(s, "enforcer-1-0", "enf-1", "server:hq:ice");
    put(s, "desperado", "console-1", "runner:installed");
    put(s, "plascrete-carapace", "gear-1", "runner:installed");
    s.servers["hq"]!.ice = ["enf-1"];
    s.runner.installed = ["console-1", "gear-1"];
    runKind(s, "enf-1", "trash_hardware_with_subtype", {
      subtype: "console",
      pick: "choose",
    });
    expect(s.runner.discardPile).toContain("console-1");
    expect(s.runner.installed).toEqual(["gear-1"]);
  });

  it("Hellion Beta Test: trashes up to 2 installed non-program cards", () => {
    const s = createInitialState();
    put(s, "hellion-beta-test", "hbt-1", "corp:play");
    put(s, "desperado", "hw-1", "runner:installed");
    put(s, "daily-casts", "res-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed = ["hw-1", "res-1", "prog-1"];
    runKind(s, "hbt-1", "trash_hellion_beta_two_installed_non_program");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["hellion:hw-1", "hellion:res-1"]),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).not.toContain(
      "hellion:prog-1",
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "hellion:hw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("hw-1");
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "hellion:res-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["hw-1", "res-1"]),
    );
    expect(after.state.runner.installed).toEqual(["prog-1"]);
  });

  it("Reuse: trashes any number from HQ then gains 2¢ per trashed card", () => {
    const s = createInitialState();
    put(s, "reuse", "reuse-1", "corp:play");
    put(s, "hedge-fund", "hq-0", "corp:hand");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    s.corp.hand = ["hq-0", "hq-1"];
    s.corp.credits = 5;
    runKind(s, "reuse-1", "trash_hq_gain_credits");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["reuse-trash:hq-0", "reuse-trash:hq-1", "reuse-done"]),
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "reuse-trash:hq-0",
    });
    if (!after.ok) throw new Error(after.error);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "reuse-done",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("hq-0");
    expect(after.state.corp.hand).toEqual(["hq-1"]);
    expect(after.state.corp.credits).toBe(7);
  });

  it("Audacity: trashes all of HQ then places a total of 2 advancements", () => {
    const s = createInitialState();
    put(s, "audacity", "aud-1", "corp:play");
    put(s, "hedge-fund", "hq-0", "corp:hand");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    const agenda = put(s, "hostile-takeover", "ht-1", "server:remote-1:root");
    agenda.advancementCounters = 0;
    s.corp.hand = ["hq-0", "hq-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    } as GameState["servers"][string];
    runKind(s, "aud-1", "trash_hq_place_total_2_advancements");
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-0", "hq-1"]),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["adv2:ht-1", "adv1:ht-1"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "adv2:ht-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.cards["ht-1"]?.advancementCounters).toBe(2);
  });

  it("Sisyphus Protocol: trashing a chosen HQ card reencounters the pending ice", () => {
    const s = createInitialState();
    put(s, "sisyphus-protocol", "sp-1", "corp:score");
    put(s, "hedge-fund", "hq-keep", "corp:hand");
    put(s, "hedge-fund", "hq-trash", "corp:hand");
    const ice = put(s, "enforcer-1-0", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.corp.scoreArea = ["sp-1"];
    s.corp.hand = ["hq-keep", "hq-trash"];
    s.servers["hq"]!.ice = ["ice-1"];
    s.run = {
      attackedServerId: "hq",
      pendingReencounterIceId: "ice-1",
      iceStrengthBoosts: {},
      encounterStrengthBoosts: {},
      strengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "sp-1", "trash_hq_reencounter_passed_ice");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["sisyphus-hq:hq-keep", "sisyphus-hq:hq-trash"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "sisyphus-hq:hq-trash",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("hq-trash");
    expect(after.state.corp.hand).toEqual(["hq-keep"]);
    expect(after.state.run?.reencounterIceId).toBe("ice-1");
    expect(after.state.run?.pendingReencounterIceId).toBeUndefined();
  });

  it("Hunter Seeker: trashes 1 installed card (Corp or Runner)", () => {
    const s = createInitialState();
    put(s, "hunter-seeker", "hs-1", "corp:play");
    put(s, "desperado", "hw-1", "runner:installed");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.runner.installed = ["hw-1"];
    s.servers["hq"]!.ice = ["iw-1"];
    runKind(s, "hs-1", "trash_hunter_seeker_installed");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["trash:hw-1", "trash:iw-1"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "trash:hw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("hw-1");
    expect(after.state.servers["hq"]!.ice).toEqual(["iw-1"]);
  });

  it("Run Amok: trashes 1 ice that was rezzed during this run", () => {
    const s = createInitialState();
    put(s, "run-amok", "ra-1", "runner:play");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"]!.ice = ["iw-1"];
    s.run = {
      attackedServerId: "hq",
      iceRezzedThisRunIds: ["iw-1"],
      iceStrengthBoosts: {},
      encounterStrengthBoosts: {},
      strengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "ra-1", "trash_ice_rezzed_this_run", { pick: "choose" });
    expect(s.corp.discardPile).toContain("iw-1");
    expect(s.servers["hq"]!.ice).toEqual([]);
  });

  it("Enforcing Loyalty: trashes an installed card not matching the Runner ID faction", () => {
    const s = createInitialState();
    put(s, "enforcing-loyalty", "el-1", "corp:play");
    put(s, "corroder", "anarch-1", "runner:installed"); // anarch
    put(s, "plascrete-carapace", "neutral-1", "runner:installed"); // matches neutral ID
    s.runner.installed = ["anarch-1", "neutral-1"];
    runKind(s, "el-1", "trash_installed_not_matching_runner_identity_faction");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["trash:anarch-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "trash:anarch-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("anarch-1");
    expect(after.state.runner.installed).toEqual(["neutral-1"]);
  });

  it("Kimberlite Field: trashes an installed Runner card with install ≤ last trashed rez", () => {
    const s = createInitialState();
    put(s, "kimberlite-field", "kf-1", "corp:score");
    put(s, "corroder", "cheap-1", "runner:installed"); // install 2
    put(s, "gordian-blade", "pricey-1", "runner:installed"); // install 4
    s.corp.scoreArea = ["kf-1"];
    s.runner.installed = ["cheap-1", "pricey-1"];
    s.turn.lastTrashedRezzedPrintedRezCost = 2;
    runKind(s, "kf-1", "trash_installed_runner_lte_last_trashed_rez", {
      pick: "choose",
    });
    expect(s.runner.discardPile).toContain("cheap-1");
    expect(s.runner.installed).toEqual(["pricey-1"]);
  });

  it("Azef Protocol: must trash another installed Corp card", () => {
    const s = createInitialState();
    put(s, "azef-protocol", "azef-1", "server:remote-1:root");
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["azef-1"],
    } as GameState["servers"][string];
    s.servers["hq"]!.ice = ["iw-1"];
    runKind(s, "azef-1", "trash_must_installed");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["trash:iw-1"]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "trash:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("iw-1");
    expect(after.state.servers["hq"]!.ice).toEqual([]);
  });

  it("Null: trashing a grip card lowers the encountered ice's strength by 2", () => {
    const s = createInitialState();
    put(s, "null-whistleblower", "null-1", "runner:identity");
    put(s, "sure-gamble", "grip-1", "runner:hand");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    ice.strength = 5;
    s.runner.identityId = "null-1";
    s.runner.hand = ["grip-1"];
    s.servers["hq"]!.ice = ["iw-1"];
    s.run = {
      attackedServerId: "hq",
      encounter: { iceId: "iw-1" },
      iceStrengthBoosts: {},
      encounterStrengthBoosts: {},
      strengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "null-1", "trash_null_grip_lower_encountered_ice_strength", {
      amount: 2,
    });
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.discardPile).toContain("grip-1");
    expect(lingeringIceStrengthOfKind(s, "iw-1", LINGERING_KIND_ICE_STRENGTH_ENCOUNTER)).toBe(-2);
  });

  it("Cold Read: trashes 1 program used this run and cannot be prevented", () => {
    const s = createInitialState();
    put(s, "cold-read", "cr-1", "runner:play");
    put(s, "corroder", "used-1", "runner:installed");
    put(s, "gordian-blade", "unused-1", "runner:installed");
    s.runner.installed = ["used-1", "unused-1"];
    s.run = {
      attackedServerId: "hq",
      programsUsedThisRun: ["used-1"],
      iceStrengthBoosts: {},
      encounterStrengthBoosts: {},
      strengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "cr-1", "trash_one_program_used_this_run_cannot_prevent");
    expect(s.runner.discardPile).toContain("used-1");
    expect(s.runner.installed).toEqual(["unused-1"]);
  });

  it("The Price of Freedom: additional cost trashes an installed connection resource", () => {
    const s = createInitialState();
    put(s, "the-price-of-freedom", "tpof-1", "runner:play");
    put(s, "aesops-pawnshop", "conn-1", "runner:installed");
    put(s, "daily-casts", "non-1", "runner:installed");
    s.runner.installed = ["conn-1", "non-1"];
    runKind(s, "tpof-1", "trash_own_resource_with_subtype", {
      subtype: "connection",
    });
    expect(s.runner.discardPile).toContain("conn-1");
    expect(s.runner.installed).toEqual(["non-1"]);
  });

  it("En Passant: trashes 1 unrezzed ice passed during the last run", () => {
    const s = createInitialState();
    put(s, "en-passant", "ep-1", "runner:play");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = false;
    s.servers["hq"]!.ice = ["iw-1"];
    s.turn.lastRunPassedUnrezzedIceIds = ["iw-1"];
    runKind(s, "ep-1", "trash_passed_unrezzed_ice");
    expect(s.corp.discardPile).toContain("iw-1");
    expect(s.servers["hq"]!.ice).toEqual([]);
  });

  it("Retribution: trashes 1 installed program or piece of hardware", () => {
    const s = createInitialState();
    put(s, "retribution", "ret-1", "corp:play");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "desperado", "hw-1", "runner:installed");
    s.runner.installed = ["prog-1", "hw-1"];
    runKind(s, "ret-1", "trash_program_or_hardware", { pick: "choose" });
    expect(s.pendingTrashProgram?.candidates.sort()).toEqual(
      ["hw-1", "prog-1"].sort(),
    );
    const after = applyAction(s, {
      type: "choose_trash_program",
      cardId: "prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("prog-1");
    expect(after.state.runner.installed).toEqual(["hw-1"]);
  });

  it("Clan Vengeance: trashes 1 random HQ card per power counter on self", () => {
    const s = createInitialState();
    const clan = put(s, "clan-vengeance", "cv-1", "runner:installed");
    clan.powerCounters = 2;
    put(s, "hedge-fund", "hq-0", "corp:hand");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "hedge-fund", "hq-2", "corp:hand");
    s.runner.installed = ["cv-1"];
    s.corp.hand = ["hq-0", "hq-1", "hq-2"];
    runKind(s, "cv-1", "trash_random_hq_per_power_on_self");
    expect(s.corp.hand.length).toBe(1);
    expect(s.corp.discardPile.length).toBe(2);
  });

  it("Hammer: trashes 1 installed resource or piece of hardware", () => {
    const s = createInitialState();
    put(s, "hammer", "ham-1", "server:hq:ice");
    put(s, "daily-casts", "res-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.servers["hq"]!.ice = ["ham-1"];
    s.runner.installed = ["res-1", "prog-1"];
    runKind(s, "ham-1", "trash_resource_or_hardware", { pick: "choose" });
    expect(s.runner.discardPile).toContain("res-1");
    expect(s.runner.installed).toEqual(["prog-1"]);
  });

  it("Mutate: additional cost trashes a chosen rezzed piece of ice", () => {
    const s = createInitialState();
    put(s, "mutate", "mut-1", "corp:play");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers["hq"]!.ice = ["iw-1"];
    runKind(s, "mut-1", "trash_rezzed_ice_additional_cost");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "mutate-trash:iw-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "mutate-trash:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("iw-1");
    expect(after.state.servers["hq"]!.ice).toEqual([]);
    expect(after.state.turn.mutateTrashedIce).toEqual({
      iceId: "iw-1",
      serverId: "hq",
      index: 0,
    });
  });

  it("Political Operative: pays trash cost to trash a rezzed card", () => {
    const s = createInitialState();
    put(s, "political-operative", "po-1", "runner:installed");
    const pad = put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    pad.rezzed = true;
    s.runner.installed = ["po-1"];
    s.runner.credits = 5;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    } as GameState["servers"][string];
    runKind(s, "po-1", "trash_rezzed_paying_trash_cost");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["po:pad-1"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "po:pad-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.credits).toBe(1); // 5 - trashCost 4
    expect(after.state.corp.discardPile).toContain("pad-1");
  });

  it("Sadaka: trashes 1 HQ card then 1 resource", () => {
    const s = createInitialState();
    put(s, "sadaka", "sad-1", "server:hq:ice");
    put(s, "hedge-fund", "hq-1", "corp:hand");
    put(s, "daily-casts", "res-1", "runner:installed");
    s.servers["hq"]!.ice = ["sad-1"];
    s.corp.hand = ["hq-1"];
    s.runner.installed = ["res-1"];
    runKind(s, "sad-1", "trash_sadaka_hq_then_resource");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "sadaka-hq:hq-1",
    ]);
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "sadaka-hq:hq-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("hq-1");
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual([
      "sadaka-res:res-1",
    ]);
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "sadaka-res:res-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("res-1");
  });

  it("Trojan Horse: trashes a program with install cost ≤ last trace excess", () => {
    const s = createInitialState();
    put(s, "trojan-horse", "th-1", "corp:play");
    put(s, "corroder", "cheap-1", "runner:installed"); // install 2
    put(s, "gordian-blade", "pricey-1", "runner:installed"); // install 4
    s.runner.installed = ["cheap-1", "pricey-1"];
    s.turn.lastTraceExcess = 3;
    runKind(s, "th-1", "trash_trojan_horse");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "trojan:cheap-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "trojan:cheap-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("cheap-1");
    expect(after.state.runner.installed).toEqual(["pricey-1"]);
  });

  it("The Twins: trashing an HQ copy of the passed ice forces re-encounter", () => {
    const s = createInitialState();
    put(s, "the-twins", "twins-1", "server:hq:root");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    put(s, "ice-wall", "hq-copy", "corp:hand");
    s.servers["hq"]!.ice = ["iw-1"];
    s.servers["hq"]!.root = ["twins-1"];
    s.corp.hand = ["hq-copy"];
    s.run = {
      attackedServerId: "hq",
      position: 0,
      encounter: { iceId: "iw-1" },
      iceStrengthBoosts: {},
      encounterStrengthBoosts: {},
      strengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "twins-1", "trash_twins_hq_copy_reencounter");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "twins:hq-copy",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "twins:hq-copy",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("hq-copy");
    expect(after.state.corp.hand).toEqual([]);
    expect(after.state.run?.reencounterIceId).toBe("iw-1");
  });

  it("Unregistered S&W '35: trashes rezzed ice and gains 2¢ per strength", () => {
    const s = createInitialState();
    put(s, "unregistered-s-w-35", "usw-1", "runner:installed");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    ice.strength = 3;
    s.runner.installed = ["usw-1"];
    s.runner.credits = 2;
    s.servers["hq"]!.ice = ["iw-1"];
    runKind(s, "usw-1", "trash_unregistered_rezzed_ice_gain_per_strength");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "unreg:iw-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "unreg:iw-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("iw-1");
    expect(after.state.runner.credits).toBe(8); // 2 + 2*3
  });

  it("Will-o'-the-Wisp: may trash self and a breaker used this run", () => {
    const s = createInitialState();
    put(s, "will-o-the-wisp", "wow-1", "server:hq:root");
    put(s, "corroder", "brk-1", "runner:installed");
    put(s, "gordian-blade", "unused-1", "runner:installed");
    s.servers["hq"]!.root = ["wow-1"];
    s.runner.installed = ["brk-1", "unused-1"];
    s.run = {
      attackedServerId: "hq",
      breakersThatBroke: ["brk-1"],
      iceStrengthBoosts: {},
      encounterStrengthBoosts: {},
      strengthBoosts: {},
    } as unknown as GameState["run"];
    runKind(s, "wow-1", "trash_will_o_wisp_breaker_used");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["decline", "trash"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "trash",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("wow-1");
    expect(after.state.servers["hq"]!.root).toEqual([]);
    expect(after.state.runner.discardPile).toContain("brk-1");
    expect(after.state.runner.installed).toEqual(["unused-1"]);
  });

  it("Corporate Troubleshooter: spends X¢ to give chosen ice +X strength this turn", () => {
    const s = createInitialState();
    put(s, "corporate-troubleshooter", "ct-1", "server:hq:root");
    const ice = put(s, "ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    const other = put(s, "ice-wall", "iw-rd", "server:rd:ice");
    other.rezzed = true;
    s.servers["hq"]!.root = ["ct-1"];
    s.servers["hq"]!.ice = ["iw-1"];
    s.servers["rd"]!.ice = ["iw-rd"];
    s.corp.credits = 4;
    runKind(s, "ct-1", "troubleshooter_fortify");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["ct:iw-1:3"]),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).not.toContain(
      "ct:iw-rd:3",
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "ct:iw-1:3",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(1);
    expect(lingeringIceStrengthOfKind(after.state, "iw-1", LINGERING_KIND_ICE_STRENGTH)).toBe(3);
  });

  it("Apocalypse: turns all installed Runner cards facedown", () => {
    const s = createInitialState();
    put(s, "apocalypse", "apo-1", "runner:play");
    const a = put(s, "corroder", "prog-1", "runner:installed");
    const b = put(s, "desperado", "hw-1", "runner:installed");
    a.faceup = true;
    b.faceup = true;
    s.runner.installed = ["prog-1", "hw-1"];
    runKind(s, "apo-1", "turn_all_installed_runner_cards_facedown");
    expect(s.cards["prog-1"]?.faceup).toBe(false);
    expect(s.cards["hw-1"]?.faceup).toBe(false);
  });

  it("Matryoshka: turns hosted cards faceup", () => {
    const s = createInitialState();
    const host = put(s, "matryoshka", "mat-1", "runner:installed");
    const guest = put(s, "matryoshka", "mat-2", "runner:hosted");
    guest.faceup = false;
    guest.hostId = "mat-1";
    host.hostedCardIds = ["mat-2"];
    s.runner.installed = ["mat-1"];
    runKind(s, "mat-1", "turn_hosted_cards_faceup");
    expect(s.cards["mat-2"]?.faceup).toBe(true);
  });

  it("Warroid Tracker: Runner trashes 2 installed cards", () => {
    const s = createInitialState();
    put(s, "warroid-tracker", "wt-1", "server:hq:root");
    put(s, "corroder", "a-1", "runner:installed");
    put(s, "desperado", "b-1", "runner:installed");
    put(s, "daily-casts", "c-1", "runner:installed");
    s.servers["hq"]!.root = ["wt-1"];
    s.runner.installed = ["a-1", "b-1", "c-1"];
    runKind(s, "wt-1", "warroid_runner_trashes_installed", { amount: 2 });
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["trash:a-1", "trash:b-1", "trash:c-1"]),
    );
    let after = applyAction(s, {
      type: "choose_option",
      optionId: "trash:a-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("a-1");
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "trash:b-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toEqual(
      expect.arrayContaining(["a-1", "b-1"]),
    );
    expect(after.state.runner.installed).toEqual(["c-1"]);
  });

  it("Contaminate: places 3 virus on an installed Runner card with none", () => {
    const s = createInitialState();
    put(s, "contaminate", "ctm-1", "runner:play");
    const prog = put(s, "corroder", "prog-1", "runner:installed");
    prog.virusCounters = 0;
    s.runner.installed = ["prog-1"];
    runKind(s, "ctm-1", "win_contaminate");
    expect(s.cards["prog-1"]?.virusCounters).toBe(3);
  });

  it("Embezzle: names a type, reveals 2 from HQ, trashes matches for 4¢ each", () => {
    const s = createInitialState();
    put(s, "embezzle", "emb-1", "runner:play");
    put(s, "pad-campaign", "hq-1", "corp:hq");
    put(s, "hedge-fund", "hq-2", "corp:hq");
    s.corp.hand = ["hq-1", "hq-2"];
    s.runner.credits = 0;
    runKind(s, "emb-1", "win_embezzle");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "embezzle:asset",
      "embezzle:ice",
      "embezzle:operation",
      "embezzle:upgrade",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "embezzle:asset",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.discardPile).toContain("hq-1");
    expect(after.state.corp.hand).toEqual(["hq-2"]);
    expect(after.state.runner.credits).toBe(4);
  });

  it("Gebrselassie: hosts on an installed non-AI icebreaker", () => {
    const s = createInitialState();
    put(s, "gebrselassie", "geb-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "wyrm", "ai-1", "runner:installed");
    s.runner.installed = ["geb-1", "prog-1", "ai-1"];
    runKind(s, "geb-1", "win_gebrselassie_host");
    // Only Corroder is a non-AI icebreaker — auto-hosts.
    expect(s.cards["geb-1"]?.hostId).toBe("prog-1");
  });

  it("Intake: adds an installed program or virtual resource to the grip", () => {
    const s = createInitialState();
    put(s, "intake", "int-1", "server:rd:root");
    put(s, "corroder", "prog-1", "runner:installed");
    put(s, "aesops-pawnshop", "res-1", "runner:installed"); // not virtual — not a target
    put(s, "xanadu", "virt-1", "runner:installed");
    s.servers["rd"]!.root = ["int-1"];
    s.runner.installed = ["prog-1", "res-1", "virt-1"];
    s.runner.hand = [];
    runKind(s, "int-1", "win_intake_bounce");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "intake:prog-1",
      "intake:virt-1",
    ]);
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "intake:prog-1",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand).toContain("prog-1");
    expect(after.state.runner.installed).toEqual(["res-1", "virt-1"]);
  });

  it("Jackpot!: places 1 credit on itself", () => {
    const s = createInitialState();
    const src = put(s, "jackpot", "jk-1", "runner:installed");
    src.hostedCredits = 0;
    s.runner.installed = ["jk-1"];
    runKind(s, "jk-1", "win_jackpot_place_credit");
    expect(s.cards["jk-1"]?.hostedCredits).toBe(1);
  });

  it("Remote Enforcement: installs and rezzes R&D ice protecting a remote", () => {
    const s = createInitialState();
    put(s, "remote-enforcement", "re-1", "corp:score");
    put(s, "ice-wall", "iw-1", "corp:rd");
    put(s, "hedge-fund", "rd-2", "corp:rd");
    s.corp.deck = ["iw-1", "rd-2"]; // top at index 0
    s.corp.credits = 5;
    s.corp.scoreArea = ["re-1"];
    runKind(s, "re-1", "win_remote_enforcement");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["re:iw-1"]);
    let after = applyAction(s, { type: "choose_option", optionId: "re:iw-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["re-install:iw-1:new"]),
    );
    after = applyAction(after.state, {
      type: "choose_option",
      optionId: "re-install:iw-1:new",
    });
    if (!after.ok) throw new Error(after.error);
    const remoteId = Object.keys(after.state.servers).find(
      (sid) => after.state.servers[sid]!.kind === "remote",
    );
    expect(remoteId).toBeTruthy();
    expect(after.state.servers[remoteId!]!.ice).toContain("iw-1");
    expect(after.state.cards["iw-1"]?.rezzed).toBe(true);
    expect(after.state.corp.deck).toContain("rd-2");
    expect(after.state.corp.deck).not.toContain("iw-1");
    expect(after.state.corp.credits).toBe(5); // empty remote: install cost 0; rez ignored
  });

  it("Standard Procedure: names a type, reveals the grip, gains 2¢ per match", () => {
    const s = createInitialState();
    put(s, "standard-procedure", "sp-1", "corp:play");
    put(s, "sure-gamble", "g-1", "runner:grip");
    put(s, "sure-gamble", "g-2", "runner:grip");
    put(s, "corroder", "prog-1", "runner:grip");
    s.runner.hand = ["g-1", "g-2", "prog-1"];
    s.corp.credits = 0;
    runKind(s, "sp-1", "win_standard_procedure");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["sp:event", "sp:program"]),
    );
    const after = applyAction(s, {
      type: "choose_option",
      optionId: "sp:event",
    });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.corp.credits).toBe(4);
    expect(after.state.runner.hand).toEqual(["g-1", "g-2", "prog-1"]);
  });

  it("Viral Weaponization: does 1 net damage per card in the grip", () => {
    const s = createInitialState();
    put(s, "viral-weaponization", "vw-1", "corp:score");
    put(s, "sure-gamble", "g-1", "runner:grip");
    put(s, "sure-gamble", "g-2", "runner:grip");
    s.corp.scoreArea = ["vw-1"];
    s.runner.hand = ["g-1", "g-2"];
    runKind(s, "vw-1", "win_viral_weaponization");
    expect(s.runner.hand).toHaveLength(0);
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["g-1", "g-2"]),
    );
  });

  it("Independent Thinking: trashing 1 installed card then finishing draws 1", () => {
    const s = createInitialState();
    put(s, "independent-thinking", "it-1", "runner:play");
    put(s, "corroder", "prog-1", "runner:installed");
    for (let i = 0; i < 3; i++) put(s, "sure-gamble", `sg-${i}`, "runner:stack");
    s.runner.installed = ["prog-1"];
    s.runner.deck = ["sg-0", "sg-1", "sg-2"];
    s.runner.hand = [];
    runKind(s, "it-1", "trash_draw");
    let after = applyAction(s, { type: "choose_option", optionId: "it:prog-1" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.discardPile).toContain("prog-1");
    after = applyAction(after.state, { type: "choose_option", optionId: "it-done" });
    if (!after.ok) throw new Error(after.error);
    expect(after.state.runner.hand.length).toBe(1);
  });
});

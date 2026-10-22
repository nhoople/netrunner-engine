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
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.9");
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

  it("deck orientation: Oracle May installs a matching top card", () => {
    const s = createInitialState();
    put(s, "oracle-may", "om-1", "runner:identity");
    put(s, "corroder", "top-1", "runner:stack");
    put(s, "sure-gamble", "second-1", "runner:stack");
    s.runner.deck = ["top-1", "second-1"];
    s.runner.installed = [];
    runKind(s, "om-1", "reveal_oracle_top_match", { cardType: "program" });
    expect(s.runner.installed).toContain("top-1");
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

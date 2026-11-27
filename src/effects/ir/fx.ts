/**
 * Effect IR: construction helpers for stubs and tests.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { Cond } from "./cond.js";
import type { ChoiceOption, Effect } from "./effect.js";
import type { Primitive } from "./primitive.js";
import type { CreditTally, PumpDuration, SideRef } from "./shared.js";

/** Construction helpers for stubs / tests. */
function gainCreditsTally(
  side: "corp" | "runner",
  count: CreditTally["count"],
  per: number,
  tallySide: "corp" | "runner" | "source" = side,
  subtype?: string,
  base?: number,
): Effect {
  return {
    op: "do",
    action: {
      kind: "gain_credits",
      side,
      amount: 0,
      tally: {
        count,
        per,
        side: tallySide,
        ...(subtype ? { subtype } : {}),
        ...(base ? { base } : {}),
      },
    },
  };
}

function loseCreditsTally(
  side: "corp" | "runner",
  count: CreditTally["count"],
  per: number,
  subtype?: string,
): Effect {
  return {
    op: "do",
    action: {
      kind: "lose_credits",
      side,
      amount: 0,
      tally: subtype ? { count, per, side, subtype } : { count, per, side },
    },
  };
}

function countedInstruction(
  kind: "net_damage" | "meat_damage" | "give_tags" | "remove_tags",
  count: CreditTally["count"],
  per = 1,
  opts?: {
    base?: number;
    side?: "corp" | "runner" | "source";
    subtype?: string;
  },
): Effect {
  return {
    op: "do",
    action: {
      kind,
      amount: 0,
      tally: {
        count,
        per,
        side: opts?.side ?? "source",
        ...(opts?.base ? { base: opts.base } : {}),
        ...(opts?.subtype ? { subtype: opts.subtype } : {}),
      },
    },
  };
}

function drawTally(
  side: SideRef,
  count: CreditTally["count"],
  per = 1,
  opts?: {
    tallySide?: "corp" | "runner" | "source";
    subtype?: string;
  },
): Effect {
  const who = side === "corp" ? "corp" : "runner";
  return {
    op: "do",
    action: {
      kind: "draw",
      side,
      amount: 0,
      tally: {
        count,
        per,
        side: opts?.tallySide ?? who,
        ...(opts?.subtype ? { subtype: opts.subtype } : {}),
      },
    },
  };
}

function netDamageAndTagsEqualRunnerTags(): Effect {
  return {
    op: "seq",
    effects: [
      countedInstruction("net_damage", "runner_tags", 1, { side: "runner" }),
      countedInstruction("give_tags", "runner_tags", 1, { side: "runner" }),
    ],
  };
}

function endTheRunUnless(payer: "corp" | "runner", cost: Primitive): Effect {
  return {
    op: "do",
    action: {
      kind: "unless",
      payer,
      cost: { op: "do", action: cost },
      instruction: { op: "do", action: { kind: "end_the_run" } },
    },
  };
}

function searchRdType(
  cardType: "ice" | "agenda" | "operation" | "asset",
): Effect {
  return { op: "do", action: { kind: "search_rd_type_to_hq", cardType } };
}

export const fx = {
  seq: (...effects: Effect[]): Effect => ({ op: "seq", effects }),
  do: (action: Primitive): Effect => ({ op: "do", action }),
  if: (cond: Cond, then: Effect, elseEffect?: Effect): Effect => ({
    op: "if",
    cond,
    then,
    ...(elseEffect !== undefined ? { else: elseEffect } : {}),
  }),
  prevent: (forbid: "jack_out"): Effect => ({ op: "prevent", forbid }),
  choose: (chooser: "corp" | "runner", options: ChoiceOption[]): Effect => ({
    op: "choose",
    chooser,
    options,
  }),
  etr: (): Effect => fx.do({ kind: "end_the_run" }),
  gainCredits: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "gain_credits", side, amount }),
  loseCredits: (side: SideRef, amount: number, then?: Effect): Effect =>
    fx.do({
      kind: "lose_credits",
      side,
      amount,
      ...(then !== undefined ? { then } : {}),
    }),
  loseAllCredits: (side: SideRef): Effect =>
    fx.do({ kind: "lose_all_credits", side }),
  pump: (amount: number, duration: PumpDuration = "encounter"): Effect =>
    fx.do({
      kind: "pump_strength",
      amount,
      ...(duration !== "encounter" ? { duration } : {}),
    }),
  fortify: (amount: number): Effect => fx.do({ kind: "fortify_ice", amount }),
  weakenIce: (amount: number): Effect => fx.do({ kind: "weaken_ice", amount }),
  spendStealthCredits: (amount: number): Effect =>
    fx.do({ kind: "spend_stealth_credits", amount }),
  redirectApproachToServer: (serverId: "hq" | "rd"): Effect =>
    fx.do({ kind: "redirect_approach_to_server", serverId }),
  netDamage: (amount: number): Effect => fx.do({ kind: "net_damage", amount }),
  netDamage1PlusCopiesOfSourceTitleInOtherScoreArea: (): Effect =>
    fx.do({
      kind: "net_damage_1_plus_copies_of_source_title_in_other_score_area",
    }),
  netDamagePerRunnerScoredAgenda: (): Effect =>
    countedInstruction("net_damage", "runner_score", 1, { side: "runner" }),
  meatDamage: (amount: number, opts?: { cannotPrevent?: boolean }): Effect =>
    fx.do({
      kind: "meat_damage",
      amount,
      ...(opts?.cannotPrevent ? { cannotPrevent: true } : {}),
    }),
  /** Prefer for printed "core damage" (CR §10.4.2b). */
  coreDamage: (
    amount: number,
    opts?: {
      interactive?: boolean;
      preventByLoseAllClicks?: boolean;
      cannotPrevent?: boolean;
    },
  ): Effect =>
    fx.do({
      kind: "core_damage",
      amount,
      ...(opts?.interactive ? { interactive: true } : {}),
      ...(opts?.preventByLoseAllClicks ? { preventByLoseAllClicks: true } : {}),
      ...(opts?.cannotPrevent ? { cannotPrevent: true } : {}),
    }),
  mayPayCreditsForCoreDamage: (amount: number, damage: number): Effect =>
    fx.do({ kind: "may_pay_credits_for_core_damage", amount, damage }),
  mayPayCreditsForCoreDamagePerAdvancement: (amount: number): Effect =>
    fx.do({
      kind: "may_pay_credits_for_core_damage_per_advancement",
      amount,
    }),
  mayPayCreditsForNetDamagePerAdvancement: (
    amount: number,
    per: number,
  ): Effect =>
    fx.do({
      kind: "may_pay_credits_for_net_damage_per_advancement",
      amount,
      per,
    }),
  mayPayCreditsForTrashProgramsPerAdvancement: (amount: number): Effect =>
    fx.do({
      kind: "may_pay_credits_for_trash_programs_per_advancement",
      amount,
    }),
  mayPayCreditsForShuffleInstalledRunnerPerAdvancement: (
    amount: number,
  ): Effect =>
    fx.do({
      kind: "may_pay_credits_for_shuffle_installed_runner_per_advancement",
      amount,
    }),
  queueBreachesAfterCurrent: (
    servers: Array<"hq" | "rd" | "archives" | string>,
    cannotAccessRoot?: boolean,
  ): Effect =>
    fx.do({
      kind: "queue_breaches_after_current",
      servers,
      ...(cannotAccessRoot !== undefined ? { cannotAccessRoot } : {}),
    }),
  fastBreakEqualToRunnerScoredAgendas: (): Effect =>
    fx.do({ kind: "runner_break_fast_equal_to_scored_agendas" }),
  installAnyNumberFromHqIgnoreCosts: (): Effect =>
    fx.do({ kind: "install_any_number_from_hq_ignore_costs" }),
  searchStackSubtypeMayInstall: (subtype: string): Effect =>
    fx.do({ kind: "search_stack_subtype_may_install", subtype }),
  grantChosenIceSubtypesUntilEndOfTurn: (subtypes: string[]): Effect =>
    fx.do({
      kind: "grant_chosen_ice_subtypes_until_end_of_turn",
      subtypes,
    }),
  queensGambitPlaceUpTo: (max: number, creditsPer: number): Effect =>
    fx.do({ kind: "place_up_to", max, creditsPer }),
  mayReturnRezzedToHqGainRezCost: (): Effect =>
    fx.do({ kind: "may_return_rezzed_to_hq_gain_rez_cost" }),
  mayTakeAnyHostedCreditsSkipBreach: (): Effect =>
    fx.do({ kind: "may_take_any_hosted_credits_skip_breach" }),
  mayAddArchivesCardToRdTop: (): Effect =>
    fx.do({ kind: "may_add_archives_card_to_rd_top" }),
  oversightAiRezAndHost: (): Effect => fx.do({ kind: "rez_and_host" }),
  berRezBioroidAndHost: (): Effect => fx.do({ kind: "rez_bioroid_and_host" }),
  gainCreditsBasePlusPerPassedIce: (
    side: SideRef,
    base: number,
    per: number,
  ): Effect =>
    gainCreditsTally(
      side === "corp" ? "corp" : "runner",
      "passed_ice",
      per,
      side === "corp" ? "corp" : "runner",
      undefined,
      base,
    ),
  rfgInstalledWithAnySubtype: (
    subtypes: string[],
    pick: "choose" | "first" = "choose",
  ): Effect =>
    fx.do({ kind: "rfg_installed_with_any_subtype", subtypes, pick }),
  rfgInstalledCard: (cardId: string): Effect =>
    fx.do({ kind: "rfg_installed_card", cardId }),
  shuffleUpToNDistinctHeapTitlesIntoStack: (max: number): Effect =>
    fx.do({ kind: "shuffle_up_to_n_distinct_heap_titles_into_stack", max }),
  addToRunnerScoreAsAgenda: (agendaPoints?: number): Effect =>
    fx.do({
      kind: "add_to_runner_score_as_agenda",
      ...(agendaPoints !== undefined ? { agendaPoints } : {}),
    }),
  giveTags: (amount: number): Effect => fx.do({ kind: "give_tags", amount }),
  giveTagsEqualToLastTraceExcess: (): Effect =>
    fx.do({ kind: "give_tags_equal_to_last_trace_excess" }),
  indexingMayInsteadOfBreach: (): Effect =>
    fx.do({ kind: "may_breach_instead_indexing" }),
  drawNThenBottomOneOfDrawn: (amount: number): Effect =>
    fx.do({ kind: "draw_n_then_bottom_one_of_drawn", amount }),
  midoriMaySwapApproachedIceWithHq: (): Effect =>
    fx.do({ kind: "may_swap_approached_ice_with_hq" }),
  giveTagsPerAdvancement: (base = 1, per = 1): Effect =>
    countedInstruction("give_tags", "source_advancement_counters", per, {
      ...(base ? { base } : {}),
    }),
  trashProgram: (pick: "first" | "choose" = "first", aiOnly = false): Effect =>
    fx.do({
      kind: "trash_program",
      pick,
      ...(aiOnly ? { aiOnly: true } : {}),
    }),
  trashResource: (pick: "first" | "choose" = "first"): Effect =>
    fx.do({ kind: "trash_resource", pick }),
  trashOwnResource: (): Effect => fx.do({ kind: "trash_own_resource" }),
  trashOwnProgram: (): Effect => fx.do({ kind: "trash_own_program" }),
  draw: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "draw", side, amount }),
  loseClicks: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "lose_clicks", side, amount }),
  gainClicks: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "gain_clicks", side, amount }),
  takeHostedCredits: (amount: number): Effect =>
    fx.do({ kind: "take_hosted_credits", amount }),
  placeHostedCredits: (amount: number): Effect =>
    fx.do({ kind: "place_hosted_credits", amount }),
  addVirusCounter: (amount: number): Effect =>
    fx.do({ kind: "add_virus_counter", amount }),
  mayPayCreditsAddVirusCounter: (credits: number, amount: number = 1): Effect =>
    fx.do({ kind: "may_pay_credits_add_virus_counter", credits, amount }),
  placeVirusOnProgramThatReceivedVirusThisTurn: (amount: number): Effect =>
    fx.do({
      kind: "place_virus_on_program_that_received_virus_this_turn",
      amount,
    }),
  maySearchStackCopyOfLastInstalledHardwareAddToGrip: (): Effect =>
    fx.do({
      kind: "may_search_stack_copy_of_last_installed_hardware_add_to_grip",
    }),
  lookTopLastTraceExcessStackTrashOneArrangeRest: (): Effect =>
    fx.do({
      kind: "look_top_last_trace_excess_stack_trash_one_arrange_rest",
    }),
  chooseServerCorpTrashIceProtecting: (): Effect =>
    fx.do({ kind: "choose_server_corp_trash_ice_protecting" }),
  trashVirtualResourceOrLinkCard: (
    pick: "first" | "choose" = "choose",
  ): Effect => fx.do({ kind: "trash_virtual_resource_or_link_card", pick }),
  removeVirusCounters: (amount: number): Effect =>
    fx.do({ kind: "remove_virus_counters", amount }),
  gainCreditsPerVirus: (per: number): Effect =>
    gainCreditsTally("runner", "source_virus_counters", per, "source"),
  increaseHandSize: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "increase_hand_size", side, amount }),
  trashHq: (
    pick: "first" | "choose" | "random" = "first",
    then?: Effect,
    amount?: number,
  ): Effect =>
    fx.do({
      kind: "trash_hq",
      pick,
      ...(amount !== undefined ? { amount } : {}),
      ...(then ? { then } : {}),
    }),
  trashHardware: (pick: "first" | "choose" = "first"): Effect =>
    fx.do({ kind: "trash_hardware", pick }),
  trashHardwareInstallCostLteLastTraceExcess: (
    pick: "first" | "choose" = "choose",
  ): Effect =>
    fx.do({
      kind: "trash_hardware_install_cost_lte_last_trace_excess",
      pick,
    }),
  trashUpToNResources: (n: number): Effect =>
    fx.do({ kind: "trash_up_to_n_resources", n }),
  exposeUpTo: (max: number): Effect => fx.do({ kind: "expose_up_to", max }),
  vampMayInsteadOfBreach: (): Effect =>
    fx.do({ kind: "may_breach_instead_vamp" }),
  escherMayInsteadOfBreach: (): Effect =>
    fx.do({ kind: "rearrange_ice_instead_of_breach" }),
  exploratoryRompMayInsteadOfBreach: (amount: number): Effect =>
    fx.do({ kind: "may_breach_instead_exploratory_romp", amount }),
  senseiRegisterEtrOnOtherIceForRun: (): Effect =>
    fx.do({ kind: "sensei_register_etr_on_other_ice_for_run" }),
  addInstalledProgramToStackTop: (): Effect =>
    fx.do({ kind: "add_installed_program_to_stack_top" }),
  trashInstalledResourcesWithAnySubtype: (subtypes: string[]): Effect =>
    fx.do({ kind: "trash_installed_resources_with_any_subtype", subtypes }),
  trashInstalledResourceWithSubtype: (
    subtype: string,
    pick: "first" | "choose" = "choose",
  ): Effect =>
    fx.do({ kind: "trash_installed_resource_with_subtype", subtype, pick }),
  trashIceRezzedThisRun: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_ice_rezzed_this_run", pick }),
  endTheRunUnlessCorpPays: (amount: number): Effect =>
    endTheRunUnless("corp", { kind: "lose_credits", side: "corp", amount }),
  endTheRunUnlessRunnerSpendsClicks: (amount: number): Effect =>
    endTheRunUnless("runner", { kind: "lose_clicks", side: "runner", amount }),
  endTheRunUnlessTakeTags: (amount: number): Effect =>
    endTheRunUnless("runner", { kind: "give_tags", amount }),
  endTheRunUnlessNetDamage: (amount: number): Effect =>
    endTheRunUnless("runner", { kind: "net_damage", amount }),
  trashProgramOrHardware: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_program_or_hardware", pick }),
  shuffleHqToRd: (amount: number): Effect =>
    fx.do({ kind: "shuffle_hq_to_rd", amount }),
  shuffleArchivesToRd: (amount: number): Effect =>
    fx.do({ kind: "shuffle_archives_to_rd", amount }),
  netDamageAgendaPointsThisTurn: (): Effect =>
    fx.do({ kind: "net_damage_agenda_points_this_turn" }),
  forbidScoringAgendasThisTurn: (): Effect =>
    fx.do({ kind: "forbid_scoring_agendas_this_turn" }),
  forbidAdvanceThisTurn: (): Effect =>
    fx.do({ kind: "forbid_advance_this_turn" }),
  skipDiscardThisTurn: (): Effect => fx.do({ kind: "skip_discard_this_turn" }),
  placeAdvancements: (
    amount: number,
    preferNotInstalledThisTurn = false,
    opts?: {
      sameServerRootAsSource?: boolean;
      anyCard?: boolean;
      excludeSelf?: boolean;
      anyInstalledIce?: boolean;
      thenMayScore?: boolean;
      then?: Effect;
    },
  ): Effect =>
    fx.do({
      kind: "place_advancements",
      amount,
      ...(preferNotInstalledThisTurn
        ? { preferNotInstalledThisTurn: true }
        : {}),
      ...(opts?.sameServerRootAsSource ? { sameServerRootAsSource: true } : {}),
      ...(opts?.anyCard ? { anyCard: true } : {}),
      ...(opts?.excludeSelf ? { excludeSelf: true } : {}),
      ...(opts?.anyInstalledIce ? { anyInstalledIce: true } : {}),
      ...(opts?.thenMayScore ? { thenMayScore: true } : {}),
      ...(opts?.then ? { then: opts.then } : {}),
    }),
  scoreSelfAsAgenda: (agendaPoints?: number): Effect =>
    fx.do({
      kind: "score_self_as_agenda",
      ...(agendaPoints !== undefined ? { agendaPoints } : {}),
    }),
  trashAnyRezzedGiveTags: (): Effect =>
    fx.do({ kind: "trash_any_rezzed_give_tags" }),
  rfgSelf: (): Effect => fx.do({ kind: "rfg_self" }),
  allottedClicksNextTurn: (side: SideRef, delta: number): Effect =>
    fx.do({ kind: "allotted_clicks_next_turn", side, delta }),
  scoreAgendaCard: (cardId: string): Effect =>
    fx.do({ kind: "score_agenda_card", cardId }),
  purgeVirusCounters: (): Effect => fx.do({ kind: "purge_virus_counters" }),
  searchRdIceToHq: (): Effect => searchRdType("ice"),
  searchRdOperationToHq: (): Effect => searchRdType("operation"),
  gainCreditsPerRezzedSubtype: (subtype: string, per = 1): Effect =>
    gainCreditsTally("corp", "rezzed_ice_subtype", per, "corp", subtype),
  loseCreditsPerRezzedSubtype: (
    side: SideRef,
    subtype: string,
    per = 1,
  ): Effect =>
    loseCreditsTally(
      side === "corp" ? "corp" : "runner",
      "rezzed_ice_subtype",
      per,
      subtype,
    ),
  addFromHeapToGrip: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "add_from_heap_to_grip", pick }),
  chooseRezzedBioroidForbidRunnerBreak: (): Effect =>
    fx.do({ kind: "choose_rezzed_bioroid_forbid_runner_break" }),
  scoreFacedownAgendaFromArchivesIfClean: (): Effect =>
    fx.do({ kind: "score_facedown_agenda_from_archives_if_clean" }),

  mayPurgeVirusCounters: (): Effect =>
    fx.choose("corp", [
      {
        id: "purge",
        label: "Purge virus counters",
        effect: fx.purgeVirusCounters(),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("corp", 0),
      },
    ]),
  mayDraw: (side: SideRef, amount: number): Effect =>
    fx.choose(side === "runner" ? "runner" : "corp", [
      {
        id: "draw",
        label: `Draw ${amount}`,
        effect: fx.draw(side, amount),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits(side, 0),
      },
    ]),
  removeAdvancements: (amount: number, then?: Effect): Effect =>
    fx.do({
      kind: "remove_advancements",
      amount,
      ...(then ? { then } : {}),
    }),
  meatDamagePerAdvancement: (): Effect =>
    countedInstruction("meat_damage", "source_advancement_counters"),
  netDamagePerAdvancement: (base = 0): Effect =>
    countedInstruction("net_damage", "source_advancement_counters", 1, {
      ...(base ? { base } : {}),
    }),
  netDamageAndTagsEqualRunnerTags: (): Effect =>
    netDamageAndTagsEqualRunnerTags(),
  unleashRezMayResolveSub: (): Effect => fx.do({ kind: "rez_may_resolve_sub" }),
  trashSelf: (): Effect => fx.do({ kind: "trash_self" }),
  trashSelfAndDerezHost: (): Effect =>
    fx.do({ kind: "trash_self_and_derez_host" }),
  mayInstallIceFromHqProtectingThisServerIgnoreCosts: (): Effect =>
    fx.do({
      kind: "may_install_ice_from_hq_protecting_this_server_ignore_costs",
    }),
  mayPlayEventFromHeap: (): Effect =>
    fx.do({ kind: "play_event_from_heap_paying_costs" }),
  trashAttackedServerRoot: (): Effect =>
    fx.do({ kind: "trash_attacked_server_root" }),
  archivesToHq: (amount: number): Effect =>
    fx.do({ kind: "archives_to_hq", amount }),
  trashInstalledRunner: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_installed_runner", pick }),
  forbidStealTrashThisRun: (): Effect =>
    fx.do({ kind: "forbid_steal_trash_this_run" }),
  accessOneRootOtherServer: (): Effect =>
    fx.do({ kind: "access_one_root_other_server" }),
  installHqNewRemotesWithAdvancements: (
    max: number,
    advancements: number,
  ): Effect =>
    fx.do({
      kind: "install_hq_new_remotes_with_advancements",
      max,
      advancements,
    }),
  moonPoolResolve: (trashHqMax = 2, revealArchivesMax = 2): Effect =>
    fx.do({
      kind: "resolve_moon_pool",
      trashHqMax,
      revealArchivesMax,
    }),
  simulationResetResolve: (trashHqMax = 5): Effect =>
    fx.do({ kind: "resolve_simulation_reset", trashHqMax }),
  searchRdInstallRezByPrintedRezCost: (delta: number): Effect =>
    fx.do({ kind: "search_rd_install_rez_by_printed_rez_cost", delta }),
  deepDiveResolve: (setAside = 8, initialAccess = 1): Effect =>
    fx.do({ kind: "resolve_deep_dive", setAside, initialAccess }),
  installFromHqOrArchives: (): Effect =>
    fx.do({ kind: "install_from_hq_or_archives" }),
  mayInstallFacedownFromArchives: (): Effect =>
    fx.do({ kind: "may_install_facedown_from_archives" }),
  mayTrashFromGripToDraw: (): Effect =>
    fx.do({ kind: "may_trash_from_grip_to_draw" }),
  trashGripCardDraw: (cardId: string): Effect =>
    fx.do({ kind: "trash_grip_card_draw", cardId }),
  mayTrashOneFromGrip: (): Effect => fx.do({ kind: "may_trash_one_from_grip" }),
  trashGripCard: (cardId: string): Effect =>
    fx.do({ kind: "trash_grip_card", cardId }),
  trashNFromGrip: (amount: number): Effect =>
    fx.do({ kind: "trash_n_from_grip", amount }),
  trashUpToGripCardsGainCreditsEach: (
    remaining: number,
    per: number,
    types?: Array<"program" | "hardware" | "resource">,
  ): Effect =>
    fx.do({
      kind: "trash_up_to_grip_cards_gain_credits_each",
      remaining,
      per,
      ...(types ? { types } : {}),
    }),
  mayTrashHardwareFromGripPlaceHostedCredits: (amount: number): Effect =>
    fx.do({
      kind: "may_trash_hardware_from_grip_place_hosted_credits",
      amount,
    }),
  trashGripHardwarePlaceHostedCredits: (
    cardId: string,
    amount: number,
  ): Effect =>
    fx.do({
      kind: "trash_grip_hardware_place_hosted_credits",
      cardId,
      amount,
    }),
  spendPowerForBonusAccess: (amount: number): Effect =>
    fx.do({ kind: "spend_power_for_bonus_access", amount }),
  revealTopStackToGripPlaceHostedCredits: (): Effect =>
    fx.do({ kind: "reveal_top_stack_to_grip_place_hosted_credits" }),
  forbidRunnerBreakOnSource: (): Effect =>
    fx.do({ kind: "forbid_runner_break_on_source" }),
  mayTrashHqThen: (then: Effect): Effect =>
    fx.do({ kind: "may_trash_hq_then", then }),
  forbidInstalledRunnerBreakForRun: (): Effect =>
    fx.do({ kind: "forbid_installed_runner_break_for_run" }),
  forbidRunnerCardBreakForRun: (cardId: string): Effect =>
    fx.do({ kind: "forbid_runner_card_break_for_run", cardId }),
  mayGiveRunnerCreditsThen: (amount: number, then: Effect): Effect =>
    fx.do({ kind: "may_give_runner_credits_then", amount, then }),
  blankInstalledResourceUntilCorpTurnEnd: (): Effect =>
    fx.do({ kind: "blank_installed_resource_until_corp_turn_end" }),
  blankResourceUntilCorpTurnEnd: (cardId: string): Effect =>
    fx.do({ kind: "blank_resource_until_corp_turn_end", cardId }),
  limitPrintedBreaksOnSourceForRun: (max: number): Effect =>
    fx.do({ kind: "limit_printed_breaks_on_source_for_run", max }),
  returnInstalledCorpToHq: (
    pick: "first" | "choose" = "choose",
    opts?: { unrezzedOnly?: boolean },
  ): Effect =>
    fx.do({
      kind: "return_installed_corp_to_hq",
      pick,
      ...(opts?.unrezzedOnly ? { unrezzedOnly: true } : {}),
    }),
  installIceInwardFree: (): Effect =>
    fx.do({ kind: "install_ice_inward_free" }),
  howlerInstallRezBioroidInward: (): Effect =>
    fx.do({ kind: "may_install_rez_bioroid_inward" }),
  awakeningCenterRezHosted: (cardId: string): Effect =>
    fx.do({ kind: "rez_hosted", cardId }),
  preventPendingSubroutineBreak: (): Effect =>
    fx.do({ kind: "prevent_pending_subroutine_break" }),
  breakHostSubroutine: (): Effect => fx.do({ kind: "break_host_subroutine" }),
  breakEncounterSubroutine: (
    requireSubtype?: string,
    maxSubs?: number,
  ): Effect =>
    fx.do({
      kind: "break_encounter_subroutine",
      ...(requireSubtype ? { requireSubtype } : {}),
      ...(maxSubs !== undefined ? { maxSubs } : {}),
    }),
  offerJackOut: (): Effect => fx.do({ kind: "offer_jack_out" }),
  darumaSwapThisRootWithOtherRootOrHq: (onSuccess?: Effect): Effect =>
    fx.do({
      kind: "swap_this_root_with_other_root_or_hq",
      ...(onSuccess ? { onSuccess } : {}),
    }),
  peepingTomChooseTypeRevealGainEtrUnlessTagForRun: (): Effect =>
    fx.do({ kind: "choose_type_reveal_gain_etr_unless_tag_for_run" }),
  hangekiChooseInstalledRunnerMayAccess: (
    onAccess: Effect,
    onDecline: Effect,
  ): Effect =>
    fx.do({
      kind: "choose_installed_runner_may_access",
      onAccess,
      onDecline,
    }),
  searchStackIcebreaker: (mayInstallIfSuccessfulRunThisTurn = false): Effect =>
    fx.do({
      kind: "search_stack_icebreaker",
      ...(mayInstallIfSuccessfulRunThisTurn
        ? { mayInstallIfSuccessfulRunThisTurn: true }
        : {}),
    }),
  searchRdNonAgenda: (reveal = false): Effect =>
    fx.do({
      kind: "search_rd_non_agenda",
      ...(reveal ? { reveal: true } : {}),
    }),
  searchRdToHq: (amount = 1): Effect =>
    fx.do({ kind: "search_rd_to_hq", amount }),
  swapTwoIce: (): Effect => fx.do({ kind: "swap_two_ice" }),
  rezIceIgnoringCosts: (): Effect => fx.do({ kind: "rez_ice_ignoring_costs" }),
  mayInstallFromGrip: (discount?: number): Effect =>
    fx.do({
      kind: "may_install_from_grip",
      ...(discount !== undefined ? { discount } : {}),
    }),
  gainStrengthThisTurn: (amount: number): Effect =>
    fx.do({ kind: "gain_strength_this_turn", amount }),
  chooseIcebreakerGainStrengthThisTurn: (amount: number): Effect =>
    fx.do({ kind: "choose_icebreaker_gain_strength_this_turn", amount }),
  chooseIceAdditionalRezCostThisTurn: (amount: number): Effect =>
    fx.do({ kind: "choose_ice_additional_rez_cost_this_turn", amount }),
  addIceAdditionalRezCostThisTurn: (cardId: string, amount: number): Effect =>
    fx.do({ kind: "add_ice_additional_rez_cost_this_turn", cardId, amount }),
  shuffleSourceIntoRd: (): Effect => fx.do({ kind: "shuffle_source_into_rd" }),
  mayInstallFromHqPayingCosts: (thenMayRemoveTagToAdvance?: boolean): Effect =>
    fx.do({
      kind: "may_install_from_hq_paying_costs",
      ...(thenMayRemoveTagToAdvance ? { thenMayRemoveTagToAdvance: true } : {}),
    }),
  installHqCardPayingCosts: (
    cardId: string,
    thenMayRemoveTagToAdvance?: boolean,
  ): Effect =>
    fx.do({
      kind: "install_hq_card_paying_costs",
      cardId,
      ...(thenMayRemoveTagToAdvance ? { thenMayRemoveTagToAdvance: true } : {}),
    }),
  placeAdvancementsOn: (cardId: string, amount: number): Effect =>
    fx.do({ kind: "place_advancements_on", cardId, amount }),
  chooseExactlyN: (n: number, options: ChoiceOption[]): Effect =>
    fx.do({ kind: "choose_exactly_n", n, options }),
  enableHostedCreditsSpendFor: (purposes: Array<"install" | "trash">): Effect =>
    fx.do({ kind: "spend_enable_hosted_credits_for", purposes }),
  mayMoveSourceUpgradeToAnotherServerRoot: (): Effect =>
    fx.do({ kind: "may_move_source_upgrade_to_another_server_root" }),
  searchRdOperationOrAgendaToHq: (): Effect =>
    fx.do({ kind: "search_rd_operation_or_agenda_to_hq" }),
  lookTopNRdMayInstallOne: (n: number): Effect =>
    fx.do({ kind: "look_top_n_rd_may_install_one", n }),
  lookTopNRdMayInstallAndRezIgnoreCosts: (n: number): Effect =>
    fx.do({ kind: "look_top_n_rd_may_install_and_rez_ignore_costs", n }),
  yagiSwapHqWithAttackedRootOrIce: (): Effect =>
    fx.do({ kind: "swap_yagi_hq_with_attacked_root_or_ice" }),
  derezEncounterIce: (): Effect => fx.do({ kind: "derez_encounter_ice" }),
  grantApproachedRezzedBioroidEtrSubroutineThisRun: (): Effect =>
    fx.do({ kind: "grant_approached_rezzed_bioroid_etr_subroutine_this_run" }),
  focusGroupRevealMayAdvance: (): Effect =>
    fx.do({ kind: "reveal_may_advance" }),
  divestedTrustMayForfeitReturnStolen: (gainCredits = 5): Effect =>
    fx.do({
      kind: "may_forfeit_return_stolen",
      gainCredits,
    }),
  returnStolenAgendaToHq: (cardId: string): Effect =>
    fx.do({ kind: "return_stolen_agenda_to_hq", cardId }),
  nihilistMayRemove2VirusDrawUnlessCorpTrashTopRd: (): Effect =>
    fx.do({
      kind: "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd",
    }),
  gameOverTrashTypeMayPay3Prevent: (): Effect =>
    fx.do({ kind: "trash_type_may_pay_3_prevent" }),
  lookTopNRdArrange: (n: number): Effect =>
    fx.do({ kind: "look_top_n_rd_arrange", n }),
  mayPlayOrInstallFromHq: (): Effect =>
    fx.do({ kind: "may_play_or_install_from_hq" }),
  moveUpgradeToServerRoot: (serverId: string): Effect =>
    fx.do({ kind: "move_upgrade_to_server_root", serverId }),
  removeTags: (amount: number): Effect =>
    fx.do({ kind: "remove_tags", amount }),
  removeAllTags: (): Effect =>
    countedInstruction("remove_tags", "runner_tags", 1, { side: "runner" }),
  loseCreditsPerAdvancement: (per: number): Effect =>
    loseCreditsTally("runner", "source_advancement_counters", per),
  gainCreditsPerAdvancement: (per: number): Effect =>
    gainCreditsTally("corp", "source_advancement_counters", per, "source"),
  gainCreditsPerPowerCounter: (per: number): Effect =>
    gainCreditsTally("corp", "source_power_counters", per, "source"),
  gainCreditsPerHqCard: (per: number): Effect =>
    gainCreditsTally("corp", "hq_cards", per, "corp"),
  gainCreditsPerRunnerTags: (per: number): Effect =>
    gainCreditsTally("corp", "runner_tags", per, "corp"),
  hqToTopRd: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "hq_to_top_rd", pick }),
  netDamageUpToTags: (max: number): Effect =>
    fx.do({ kind: "net_damage_up_to_tags", max }),
  bypassCurrentIce: (requireSubtype?: string): Effect =>
    fx.do({
      kind: "bypass_current_ice",
      ...(requireSubtype ? { requireSubtype } : {}),
    }),
  removePowerCounter: (amount: number): Effect =>
    fx.do({ kind: "remove_power_counter", amount }),
  removeAllPowerCounters: (): Effect =>
    fx.do({ kind: "remove_all_power_counters" }),
  revealTopNRdTrashOne: (n: number): Effect =>
    fx.do({ kind: "reveal_top_n_rd_trash_one", n }),
  moveRunnerToOutermostAttacked: (): Effect =>
    fx.do({ kind: "move_runner_to_outermost_attacked" }),
  climacticChooseServerCorpMayTrashIceElseBonusAccess: (): Effect =>
    fx.do({
      kind: "may_corp_choose_climactic_server_trash_ice_else_bonus_access",
    }),
  preventPendingEndTheRunFromCorpCardAbility: (): Effect =>
    fx.do({ kind: "prevent_pending_end_the_run_from_corp_card_ability" }),
  whistleblowerMayTrashNameAgendaStealIgnoreCosts: (): Effect =>
    fx.do({ kind: "may_trash_name_agenda_steal_ignore_costs" }),
  hyoubuRevealGripRandomOrStackTop: (): Effect =>
    fx.do({ kind: "reveal_hyoubu_grip_random_or_stack_top" }),
  classActLookTopDrawAmountPlusOneBottomOne: (): Effect =>
    fx.do({ kind: "look_class_act_top_draw_amount_plus_one_bottom_one" }),
  backupPlanMayRerunIgnoreAdditionalCostsBypassLastIce: (): Effect =>
    fx.do({
      kind: "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice",
    }),
  completeImageNameNetDamageLoop: (): Effect =>
    fx.do({ kind: "name_net_damage_loop" }),
  khusyukChooseInstallCostSetAsideAccessShuffle: (): Effect =>
    fx.do({ kind: "choose_install_cost_set_aside_access_shuffle" }),
  takeDifferentActionPayingClickLess: (): Effect =>
    fx.do({ kind: "take_different_action_paying_click_less" }),
  addPowerCounter: (amount: number): Effect =>
    fx.do({ kind: "add_power_counter", amount }),
  drawPerPowerCounter: (side: SideRef, per = 1): Effect =>
    drawTally(side, "source_power_counters", per, { tallySide: "source" }),
  drawPerClicksRemaining: (side: SideRef): Effect =>
    drawTally(side, "clicks_remaining"),
  installFromHeap: (
    types: Array<"program" | "hardware" | "resource">,
    discount = 0,
  ): Effect => fx.do({ kind: "install_from_heap", types, discount }),
  mayAddFromHeapToStackBottom: (
    types?: Array<"program" | "hardware" | "resource" | "event">,
  ): Effect =>
    fx.do({
      kind: "may_add_from_heap_to_stack_bottom",
      ...(types ? { types } : {}),
    }),
  takeHostedBadPublicity: (amount: number): Effect =>
    fx.do({ kind: "take_hosted_bad_publicity", amount }),
  payCreditsOrEtr: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "pay_credits_or_etr", side, amount }),
  meatDamageStolenLastTurn: (): Effect =>
    fx.do({ kind: "meat_damage_stolen_last_turn" }),
  derezIce: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "derez_ice", pick }),
  derezCard: (cardId: string): Effect => fx.do({ kind: "derez_card", cardId }),
  derezSource: (): Effect => fx.do({ kind: "derez_source" }),
  mayDerezInstalled: (opts?: {
    excludeSelf?: boolean;
    then?: Effect;
  }): Effect =>
    fx.do({
      kind: "may_derez_installed",
      excludeSelf: opts?.excludeSelf ?? true,
      ...(opts?.then ? { then: opts.then } : {}),
    }),
  trashCorpCard: (cardId: string): Effect =>
    fx.do({ kind: "trash_corp_card", cardId }),
  mayTrashInstalled: (opts?: {
    excludeSelf?: boolean;
    rezzedOnly?: boolean;
    then?: Effect;
  }): Effect =>
    fx.do({
      kind: "may_trash_installed",
      excludeSelf: opts?.excludeSelf ?? true,
      ...(opts?.rezzedOnly ? { rezzedOnly: true } : {}),
      ...(opts?.then ? { then: opts.then } : {}),
    }),
  trashInstalledRunnerLteLastTrashedRez: (
    pick: "first" | "choose" = "choose",
  ): Effect =>
    fx.do({ kind: "trash_installed_runner_lte_last_trashed_rez", pick }),
  mustTrashInstalled: (opts?: { excludeSelf?: boolean }): Effect =>
    fx.do({
      kind: "trash_must_installed",
      excludeSelf: opts?.excludeSelf ?? true,
    }),
  forbidBioroidIcePaidAbilitiesThisTurn: (): Effect =>
    fx.do({ kind: "forbid_bioroid_ice_paid_abilities_this_turn" }),
  installAndRezAssetOrUpgradeFree: (): Effect =>
    fx.do({ kind: "install_and_rez_asset_or_upgrade_free" }),
  installAndRezFromArchivesFree: (): Effect =>
    fx.do({ kind: "install_and_rez_from_archives_free" }),
  mayReturnSelfToGrip: (creditCost: number): Effect =>
    fx.do({ kind: "may_return_self_to_grip", creditCost }),
  installResourceDiscount: (discount: number): Effect =>
    fx.do({ kind: "install_resource_discount", discount }),
  installFromGripDiscount: (
    types: Array<"program" | "hardware" | "resource">,
    discount: number,
    mayCharge = false,
  ): Effect =>
    fx.do({
      kind: "install_from_grip_discount",
      types,
      discount,
      ...(mayCharge ? { mayCharge: true } : {}),
    }),
  installGripCard: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_grip_card", cardId, discount }),
  mayChargeCard: (cardId: string): Effect =>
    fx.do({ kind: "may_charge_card", cardId }),
  giveBadPublicity: (amount: number): Effect =>
    fx.do({ kind: "give_bad_publicity", amount }),
  revealHqGainCredits: (maxCards: number, creditsEach: number): Effect =>
    fx.do({ kind: "reveal_hq_gain_credits", maxCards, creditsEach }),
  moveAdvancements: (amount: number): Effect =>
    fx.do({ kind: "move_advancements", amount }),
  trashPassedUnrezzedIce: (): Effect =>
    fx.do({ kind: "trash_passed_unrezzed_ice" }),
  forgedActivationOrders: (): Effect =>
    fx.do({ kind: "forged_activation_orders" }),
  installProgramFromStackOrHeapFree: (): Effect =>
    fx.do({ kind: "install_program_from_stack_or_heap_free" }),
  placeAdvancementsXFromTags: (): Effect =>
    fx.do({ kind: "place_advancements_x_from_tags" }),
  troubleshooterFortify: (): Effect =>
    fx.do({ kind: "troubleshooter_fortify" }),
  resolveBioroidSubroutine: (): Effect =>
    fx.do({ kind: "resolve_bioroid_subroutine" }),
  mayFlipArchivesIceResolveSubroutine: (): Effect =>
    fx.do({ kind: "may_flip_archives_ice_resolve_subroutine" }),
  flipArchivesIceResolveSubroutine: (iceId: string, subIndex: number): Effect =>
    fx.do({ kind: "flip_archives_ice_resolve_subroutine", iceId, subIndex }),
  trashEncounterIceResolveSubroutine: (subIndex: number): Effect =>
    fx.do({ kind: "trash_encounter_ice_resolve_subroutine", subIndex }),
  trashEncounterIceIfStrengthLte: (maxStrength: number): Effect =>
    fx.do({ kind: "trash_encounter_ice_if_strength_lte", maxStrength }),
  mayChooseServer: (): Effect => fx.do({ kind: "may_choose_server" }),
  setNamedServer: (serverId: string): Effect =>
    fx.do({ kind: "set_named_server", serverId }),
  chooseServer: (): Effect => fx.do({ kind: "choose_server" }),
  chooseServerRunner: (): Effect => fx.do({ kind: "choose_server_runner" }),
  nextDesignMayInstallIce: (remaining: number, thenDrawToHq: number): Effect =>
    fx.do({
      kind: "may_install_next_design_ice",
      remaining,
      usedServerIds: [],
      thenDrawToHq,
    }),
  drawUntilHqHas: (amount: number): Effect =>
    fx.do({ kind: "draw_until_hq_has", amount }),
  setChosenServer: (serverId: string): Effect =>
    fx.do({ kind: "set_chosen_server", serverId }),
  searchStackHostVirusOrWeapon: (max = 2): Effect =>
    fx.do({ kind: "search_stack_host_virus_or_weapon", max }),
  hostStackCardOnSource: (cardId: string): Effect =>
    fx.do({ kind: "host_stack_card_on_source", cardId }),
  mayAddHostedCardToGrip: (): Effect =>
    fx.do({ kind: "may_add_hosted_card_to_grip" }),
  addHostedCardToGrip: (cardId: string): Effect =>
    fx.do({ kind: "add_hosted_card_to_grip", cardId }),
  turnHostedCardsFaceup: (): Effect =>
    fx.do({ kind: "turn_hosted_cards_faceup" }),
  hostCopyFromGrip: (title: string): Effect =>
    fx.do({ kind: "host_copy_from_grip", title }),
  matryoshkaBreak: (): Effect => fx.do({ kind: "break_matryoshka" }),
  matryoshkaBreakResolve: (amount: number, hostedId: string): Effect =>
    fx.do({ kind: "break_resolve", amount, hostedId }),
  hostIceProgramOnSelf: (): Effect =>
    fx.do({ kind: "host_ice_program_on_self" }),
  formicaryRezMoveInnermost: (rezDiscount = 2): Effect =>
    fx.do({ kind: "rez_move_innermost", rezDiscount }),
  rehostOnOtherIce: (): Effect => fx.do({ kind: "rehost_on_other_ice" }),
  rehostToIce: (iceId: string): Effect =>
    fx.do({ kind: "rehost_to_ice", iceId }),
  /** May charge any installed chargeable card (Orca / Flux). */
  mayChargeChoose: (): Effect => ({
    op: "choose",
    chooser: "runner",
    options: [
      {
        id: "charge",
        label: "Charge 1 of your installed cards",
        effect: fx.do({ kind: "charge", pick: "choose" }),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.do({
          kind: "gain_credits",
          side: "runner",
          amount: 0,
        }),
      },
    ],
  }),
  returnSubliminalFromArchives: (): Effect =>
    fx.do({ kind: "return_subliminal_from_archives" }),
  aesopTrashForCredits: (amount: number): Effect =>
    fx.do({ kind: "trash_aesop_for_credits", amount }),
  aylaSetAsideToGrip: (): Effect => fx.do({ kind: "ayla_set_aside_to_grip" }),
  sabotage: (amount: number, interactive = false): Effect =>
    fx.do({
      kind: "sabotage",
      amount,
      ...(interactive ? { interactive: true } : {}),
    }),
  identifyMark: (): Effect => fx.do({ kind: "identify_mark" }),
  startRunOnMark: (): Effect => fx.do({ kind: "start_run_on_mark" }),
  chargeSelf: (): Effect => fx.do({ kind: "charge", pick: "self" }),
  chargeChoose: (): Effect => fx.do({ kind: "charge", pick: "choose" }),
  chargeCard: (cardId: string): Effect =>
    fx.do({ kind: "charge", pick: "card", cardId }),
  bonusAccess: (amount: number): Effect =>
    fx.do({ kind: "bonus_access", amount }),
  breachServerWhenRunEnds: (server: "hq" | "rd" | "archives"): Effect =>
    fx.do({ kind: "breach_server_when_run_ends", server }),
  searchStackProgramInstall: (): Effect =>
    fx.do({ kind: "search_stack_program_install" }),
  installStackProgram: (cardId: string): Effect =>
    fx.do({ kind: "install_stack_program", cardId }),
  sparkOfInspirationResolve: (discount = 10): Effect =>
    fx.do({ kind: "resolve_spark_of_inspiration", discount }),
  installSetAsideProgram: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_set_aside_program", cardId, discount }),
  shuffleRunnerSetAsideIntoStack: (): Effect =>
    fx.do({ kind: "shuffle_runner_set_aside_into_stack" }),
  trashTopNMayInstallDiscount: (count: number, discount: number): Effect =>
    fx.do({ kind: "trash_top_n_may_install_discount", count, discount }),
  installHeapCard: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_heap_card", cardId, discount }),
  trashTopOfStack: (): Effect => fx.do({ kind: "trash_top_of_stack" }),
  trashTopOfRd: (): Effect => fx.do({ kind: "trash_top_of_rd" }),
  revealTopOfRd: (): Effect => fx.do({ kind: "reveal_top_of_rd" }),
  setTraceBaseStrength: (amount: number): Effect =>
    fx.do({ kind: "set_trace_base_strength", amount }),
  forbidRunnerRunsThisTurn: (): Effect =>
    fx.do({ kind: "forbid_runner_runs_this_turn" }),
  moveSourceIceToOutermostAnotherServerContinueRun: (): Effect =>
    fx.do({ kind: "move_source_ice_to_outermost_another_server_continue_run" }),
  fullyOperationalResolve: (): Effect =>
    fx.do({ kind: "resolve_fully_operational" }),
  lookTopNStackMayBottomOne: (n: number): Effect =>
    fx.do({ kind: "look_top_n_stack_may_bottom_one", n }),
  chooseGrantEncounterIceSubtype: (): Effect =>
    fx.do({ kind: "choose_grant_encounter_ice_subtype" }),
  lootBoxRevealTopN: (n: number): Effect => fx.do({ kind: "reveal_top_n", n }),
  searchRdIceInstallCentralDiscount: (discount: number): Effect =>
    fx.do({ kind: "search_rd_ice_install_central_discount", discount }),
  rejigBounceInstall: (): Effect => fx.do({ kind: "install_rejig_bounce" }),
  mayTrashOtherInstalledSearchStackSameTypeInstall: (
    discount: number,
  ): Effect =>
    fx.do({
      kind: "may_trash_other_installed_search_stack_same_type_install",
      discount,
    }),
  trashRunnerRigCard: (cardId: string): Effect =>
    fx.do({ kind: "trash_runner_rig_card", cardId }),
  trashRunnerRigCardRecordProgramCost: (cardId: string): Effect =>
    fx.do({ kind: "trash_runner_rig_card_record_program_cost", cardId }),
  scavengeInstallProgram: (): Effect =>
    fx.do({ kind: "install_scavenge_program" }),
  haasPetProjectSetup: (remaining: number): Effect =>
    fx.do({ kind: "haas_pet_project_setup", remaining }),
  installUpToNProgramsFromGripDiscount: (
    remaining: number,
    discount: number,
  ): Effect =>
    fx.do({
      kind: "install_up_to_n_programs_from_grip_discount",
      remaining,
      discount,
    }),
  searchStackTypeInstall: (
    cardType: "program" | "hardware" | "resource",
    discount: number,
  ): Effect => fx.do({ kind: "search_stack_type_install", cardType, discount }),
  installStackCard: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_stack_card", cardId, discount }),
  exclusiveChoicesPerPassedIce: (options: ChoiceOption[]): Effect =>
    fx.do({ kind: "exclusive_choices_per_passed_ice", options }),
  addAgendaCounter: (amount: number): Effect =>
    fx.do({ kind: "add_agenda_counter", amount }),
  /** Dividends N (CR 10.13.1). */
  dividends: (n: number): Effect => fx.do({ kind: "dividends", n }),
  /** Printed past-N overadvance (not Dividends). */
  placeAgendaCountersPast: (past: number, per = 1): Effect =>
    fx.do({
      kind: "place_agenda_counters_past",
      past,
      ...(per !== 1 ? { per } : {}),
    }),
  trace: (
    strength: number,
    onSuccess: Effect,
    onFailure?: Effect,
    interactive = false,
  ): Effect =>
    fx.do({
      kind: "trace",
      strength,
      onSuccess,
      ...(onFailure !== undefined ? { onFailure } : {}),
      interactive,
    }),
};

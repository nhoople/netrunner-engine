/** Named CR citations used by the host engine (not a compiler). */
export const CR = {
  /** Starting hand size (default 5). */
  startHand: { number: "1.6.6", id: "rule_start_hand" },
  /** After drawing starting hands: Corp then Runner may mulligan once. */
  mulligan: { number: "1.6.6a", id: "rule_mulligan" },
  /** Identity abilities before taking your first turn (placeholder step). */
  beforeFirstTurn: { number: "1.6.7a", id: "rule_before_first_turn" },
  corpAllottedClicks: { number: "1.11.2a", id: "rule_corp_allotted_clicks" },
  runnerAllottedClicks: { number: "1.11.2b", id: "rule_runner_allotted_clicks" },
  basicActions: { number: "5.2.3", id: "rule_basic_actions" },
  corpBasicCredit: { number: "5.2.6b", id: "rule_corp_basic_action_credit" },
  corpBasicDraw: { number: "5.2.6c", id: "rule_corp_basic_action_draw" },
  corpBasicInstall: { number: "5.2.6d", id: "rule_corp_basic_action_install" },
  runnerBasicCredit: { number: "5.2.7b", id: "runner_basic_action_credit" },
  runnerBasicDraw: { number: "5.2.7c", id: "runner_basic_action_card" },
  runnerBasicInstall: { number: "5.2.7d", id: "runner_basic_action_install" },
  runnerBasicRun: { number: "5.2.7f", id: "runner_basic_action_run" },
  /** Runner basic action: {click}, 2{c}: Remove 1 tag. */
  runnerBasicRemoveTag: {
    number: "5.2.7g",
    id: "runner_basic_action_remove_tag",
  },
  /** While tagged, Runner may spend click+2¢ to remove one tag. */
  taggedRemoveTag: { number: "10.5.4", id: "rule_tagged_remove_tag" },
  actionPhase: { number: "5.4.1", id: "rule_action_phase_definition" },
  mandatoryDraw: { number: "5.3.2", id: "rule_mandatory_draw" },
  noRunnerDrawPhase: { number: "5.3.3", id: "rule_no_runner_draw_phase" },
  maxHandSize: { number: "5.5.3a", id: "rule_max_hand_size_default" },
  creatingRemotes: { number: "4.6.8b", id: "rule_creating_remote_servers" },
  remoteExistence: { number: "4.6.8d", id: "rule_remote_server_existence" },
  remoteCease: { number: "4.6.8e", id: "rule_remote_server_cease_to_exist" },
  announceServer: { number: "6.1.2a", id: "rule_announce_attacked_server" },
  successfulRun: { number: "6.7.2", id: "rule_successful_run" },
  breach: { number: "7.3.1", id: "rule_breaching_servers" },
  remoteCandidates: { number: "7.4.1a", id: "rule_candidates_in_server_root" },
  installing: { number: "8.5.1", id: "rule_installing" },
  corpInstallDest: { number: "8.5.2a", id: "rule_corp_install_choose_destination_server" },
  agendaAssetRemote: { number: "8.5.2b", id: "rule_agenda_asset_root_remote_server" },
  drawing: { number: "8.4.1", id: "rule_drawing" },
  gainCredits: { number: "1.10.3a", id: "rule_gain_credits" },
  spendClicks: { number: "1.11.3b", id: "rule_lose_spend_clicks" },
  rezInPaw: { number: "8.1.2a", id: "rule_rez_in_paw" },
  inherentRezCost: { number: "8.1.2d", id: "rule_inherent_rez_cost" },
  rezProcedure: { number: "8.1.2e", id: "rule_rez_procedure" },
  rezIceRestriction: { number: "6.4.3", id: "rule_rez_ice_restriction" },
  /** Derez a rezzed card (CR §8.1.3). */
  derez: { number: "8.1.3", id: "sec_derez" },
  derezByAbility: { number: "8.1.3a", id: "rule_derez_by_ability" },
  approachIce: { number: "6.4.1", id: "rule_approach_ice_phase" },
  encounterIce: { number: "6.5.1", id: "rule_encounter_ice_phase" },
  encounterBreakPaw: { number: "6.5.4", id: "rule_encounter_break_paw" },
  encounterSubResolve: { number: "6.5.5", id: "rule_encounter_sub_resolve" },
  fullyBreak: { number: "6.5.7a", id: "rule_fully_break" },
  endTheRun: { number: "6.1.4", id: "rule_end_the_run" },
  jackingOut: { number: "6.1.5", id: "rule_jacking_out" },
  jackOutAfterPass: { number: "6.1.5a", id: "rule_jack_out_after_passing_ice" },
  jackOutMovement: { number: "6.6.3", id: "rule_jack_out_movement_phase" },
  unsuccessfulRun: { number: "6.8.4", id: "rule_unsuccessful_run" },
  /** Reaching Success Phase blocks declaring the run unsuccessful (Crisium example). */
  notUnsuccessfulWhenReachedSuccessPhase: {
    number: "6.8.4a",
    id: "rule_not_unsuccessful_when_reached_success_phase",
  },
  /** Run Ends — process open priority windows (CR §6.8.2 / step 6.9.6a). */
  runEndsClosePriorityWindows: {
    number: "6.8.2",
    id: "rule_run_ends_process_priority_windows",
  },
  /** Open PAW at ETR closes; no further paid abilities / rez (CR §6.8.2a). */
  runEndsClosePaws: {
    number: "6.8.2a",
    id: "rule_run_ends_close_paws",
  },
  /** Phase-begin reaction window closes on ETR (CR §6.8.2b). */
  runEndsCloseReactionWindow: {
    number: "6.8.2b",
    id: "rule_run_ends_close_reaction_window",
  },
  /**
   * Other open priority windows complete without starting new structures
   * (CR §6.8.2c — Formicary-class).
   */
  runEndsOtherPriorityWindows: {
    number: "6.8.2c",
    id: "rule_run_ends_other_priority_windows",
  },
  runEndsClosePriorityWindowsStep: {
    number: "6.9.6a",
    id: "step_open_priority_windows_closed",
  },
  /** Run Ends — empty BP fund (CR §6.8.3 / step 6.9.6b). */
  runEndsLoseBadPubCredits: {
    number: "6.8.3",
    id: "rule_run_ends_lose_bad_pub_credits",
  },
  runEndsBadPublicityStep: {
    number: "6.9.6b",
    id: "step_run_ends_bad_publicity",
  },
  /** Run Ends — declare unsuccessful when applicable (step 6.9.6c). */
  runDeclaredUnsuccessfulStep: {
    number: "6.9.6c",
    id: "step_run_declared_unsuccessful",
  },
  /** Run Ends — run complete / end-of-run conditions (CR §6.8.5 / step 6.9.6d). */
  runEndsCondition: { number: "6.8.5", id: "rule_run_ends_condition" },
  runCompleteStep: { number: "6.9.6d", id: "step_run_complete" },
  /** Appendix timing leaves for Run Ends Phase (CR §11.4_6). */
  runEndsAppendixA: {
    number: "11.4_6_a",
    id: "sec_appendix_timing_structure_of_a_run_6_a",
  },
  runEndsAppendixB: {
    number: "11.4_6_b",
    id: "sec_appendix_timing_structure_of_a_run_6_b",
  },
  runEndsAppendixC: {
    number: "11.4_6_c",
    id: "sec_appendix_timing_structure_of_a_run_6_c",
  },
  runEndsAppendixD: {
    number: "11.4_6_d",
    id: "sec_appendix_timing_structure_of_a_run_6_d",
  },
  cannotPrecedence: { number: "1.2.2", id: "rule_cannot_precedence" },
  actionsOutsidePhase: { number: "5.2.4", id: "rule_actions_outside_action_phase" },
  costCheckpoint: { number: "1.16.3", id: "rule_cost_checkpoint" },
  /** Nested cost unpayable when a static/mandatory interrupt would prevent payment (Funhouse×Jesminder). */
  costInterruptStaticMandatory: {
    number: "1.16.1b",
    id: "rule_cost_interrupt_static_mandatory",
  },
  nestedCost: { number: "1.16.11", id: "rule_nested_cost" },
  nestedCostUnless: { number: "1.16.11b", id: "rule_nested_cost_unless" },
  /** Increase then lower, then floor at 0 (Ghosttongue event play cost −N¢). */
  costCalculation: { number: "1.16.2a", id: "rule_cost_calculation" },
  playCost: { number: "1.16.7", id: "rule_play_cost" },
  eventPlayCost: { number: "3.7.2", id: "rule_event_play_cost" },
  timingCheckpoint: { number: "9.11.1b", id: "rule_checkpoint_timing_structure" },
  priority: { number: "9.2.3", id: "rule_priority" },
  priorityWindow: { number: "9.2.4", id: "rule_priority_window" },
  nestedPriorityWindow: { number: "9.2.4d", id: "rule_nested_priority_window" },
  paidAbility: { number: "9.5.1", id: "rule_paid_ability" },
  triggerPaidAbilities: { number: "9.5.2", id: "rule_trigger_paid_abilities" },
  icebreakerStrengthImplicit: {
    number: "3.9.5b",
    id: "rule_icebreaker_strength_increase_implicit",
  },
  icebreakerInterface: {
    number: "3.9.5f",
    id: "rule_icebreaker_interface_during_encounter",
  },
  icebreakerInterfaceStrength: {
    number: "3.9.5g",
    id: "rule_icebreaker_interface_strength",
  },
  programStrength: { number: "3.9.4a", id: "rule_icebreakers_strength_value" },
  iceStrength: { number: "3.4.4", id: "rule_ice_strength_value" },
  sufferDamage: { number: "10.4.1", id: "rule_suffer_or_take_damage" },
  /** Damage section — interruptible suffer procedure. */
  damage: { number: "10.4", id: "sec_damage" },
  /** Interrupt is relevant when it could prevent/avoid the imminent effect. */
  preventRelevant: { number: "9.9.3a", id: "rule_prevent_relevant" },
  netDamage: { number: "10.4.2a", id: "rule_meat_net_damage" },
  /** Multi-point damage trashes randomly and simultaneously (CR §10.4.3). */
  multipleDamageSimultaneous: {
    number: "10.4.3",
    id: "rule_multiple_damage_taken_simultaneously",
  },
  expose: { number: "1.21.4", id: "rule_expose" },
  tags: { number: "10.5.1", id: "rule_tag" },
  tagged: { number: "10.5.2", id: "rule_tagged" },
  /** Bad publicity fund location (CR §10.6.2). */
  badPublicityFund: { number: "10.6.2", id: "rule_bad_publicity_fund" },
  /** Fill BP fund at run initiation (CR §10.6.3a / appendix 11.4_1_b). */
  badPublicityBeginningRun: {
    number: "10.6.3a",
    id: "rule_bad_publicity_beginning_run",
  },
  /** Empty BP fund during Run Ends (CR §10.6.3b). */
  badPublicityGoneInRunEnds: {
    number: "10.6.3b",
    id: "rule_bad_publicity_gone_in_run_ends_phase",
  },
  trashing: { number: "1.19.1", id: "rule_trashing" },
  scoringAgenda: { number: "1.17.6", id: "rule_agenda_scored" },
  stealingAgenda: { number: "1.17.7", id: "rule_agenda_stolen" },
  corpWinAgenda: { number: "1.7.2a", id: "rule_win_agenda_points" },
  runnerWinAgenda: { number: "1.7.2a", id: "rule_win_agenda_points" },
  flatline: { number: "1.7.2b", id: "rule_flatline" },
  /** Canonical core damage (CR §10.4.2b). Prefer this cite over brainDamage. */
  coreDamage: { number: "10.4.2b", id: "rule_core_damage" },
  /** Older term for core damage (CR §10.4.2c); interchangeable. */
  brainDamage: { number: "10.4.2c", id: "rule_brain_damage" },
  meatDamage: { number: "10.4.2a", id: "rule_meat_net_damage" },
  preventDamage: { number: "9.9.5", id: "sec_prevent_avoid" },
  trace: { number: "10.8.1", id: "rule_trace_attempt_and_base_trace_strength" },
  /** Corp spends credits to set trace strength (CR §10.8.2). */
  traceStrength: { number: "10.8.2", id: "rule_trace_strength" },
  /** Runner spends credits to set link strength (CR §10.8.3). */
  linkStrength: { number: "10.8.3", id: "rule_link_strength" },
  /** Runner may spend credits during the trace attempt (CR §10.8.6d). */
  traceRunnerSpendCredits: {
    number: "10.8.6d",
    id: "step_trace_runner_spend_credits",
  },
  recurringCredits: { number: "1.10.5a", id: "rule_recurring_credits" },
  /** "During a run" abilities / spend gates (Cezve recurring). */
  abilitiesDuringARun: { number: "6.3.4", id: "rule_abilities_during_a_run" },
  advancing: { number: "1.18.1", id: "rule_advance" },
  corpBasicAdvance: { number: "5.2.6f", id: "corp_basic_action_advance" },
  corpBasicTrashResource: {
    number: "5.2.6g",
    id: "corp_basic_action_trash_resource",
  },
  playOperation: { number: "5.2.6e", id: "rule_corp_basic_action_operation" },
  /** Lockdown: play only if no active lockdown; trash at Corp next turn begin. */
  lockdownOperation: { number: "3.5.1c", id: "rule_operation_lockdown" },
  /** Operation not trashed until Corp's next turn begins (lockdown linger). */
  playNotTrashedUntil: { number: "8.6.6c", id: "rule_play_not_trashed_until" },
  playEvent: { number: "5.2.7e", id: "runner_basic_action_event" },
  hqAccess: { number: "7.4.1b", id: "rule_candidates_in_hq" },
  rdAccess: { number: "7.4.1c", id: "rule_candidates_in_rnd" },
  archivesAccess: { number: "7.4.1d", id: "rule_candidates_in_archives" },
  /** Install cost (CR §8.5.11). */
  installCost: { number: "8.5.11", id: "sec_install_cost" },
  identityAbility: { number: "9.1.1", id: "rule_ability" },
  midAccessAgenda: { number: "7.1.6", id: "rule_after_mid_access_agenda" },
  /** Mid-access ability opportunity (CR §7.1.4). */
  midAccessAbilityOpportunity: {
    number: "7.1.4",
    id: "rule_mid_access_ability_opportunity",
  },
  /** Steps of accessing a card (CR §7.2). */
  accessSteps: { number: "7.2", id: "sec_steps_accessing_card" },
  cardAccessed: { number: "7.2.1", id: "step_card_accessed" },
  midAccessAbility: { number: "7.2.2", id: "step_mid_access_ability" },
  accessAgenda: { number: "7.2.3", id: "step_access_agenda" },
  accessComplete: { number: "7.2.4", id: "step_access_complete" },
  /** Appendix timing structure of accessing a card (CR §11.6). */
  accessAppendix: {
    number: "11.6",
    id: "sec_appendix_timing_structure_of_accessing_a_card",
  },
  accessAppendix1: {
    number: "11.6_1",
    id: "sec_appendix_timing_structure_of_accessing_a_card_1",
  },
  accessAppendix2: {
    number: "11.6_2",
    id: "sec_appendix_timing_structure_of_accessing_a_card_2",
  },
  accessAppendix3: {
    number: "11.6_3",
    id: "sec_appendix_timing_structure_of_accessing_a_card_3",
  },
  accessAppendix4: {
    number: "11.6_4",
    id: "sec_appendix_timing_structure_of_accessing_a_card_4",
  },
  charge: { number: "10.10.1", id: "rule_charge" },
  chargeTargets: { number: "10.10.2", id: "rule_charge_targets" },
  chargeRequiresCounter: {
    number: "10.10.3",
    id: "rule_charge_requires_hosted_counter",
  },
  /** Power counters (generic hosted counters). */
  powerCounter: { number: "1.9.5h", id: "rule_type_power_counter" },
  /** "When installed" trigger wording. */
  whenInstalled: { number: "9.6.14b", id: "rule_when_installed" },
  /** Conditional abilities with static conditions (e.g. "when there are N…"). */
  staticCondition: {
    number: "9.6.7",
    id: "rule_conditional_ability_with_static_condition",
  },
  mark: { number: "10.11.1", id: "rule_mark" },
  onlyOneMark: { number: "10.11.1a", id: "rule_only_one_mark" },
  markIdentification: { number: "10.11.2", id: "rule_mark_identification" },
  markAlreadyIdentified: {
    number: "10.11.3",
    id: "rule_mark_already_identified",
  },
  markLingering: {
    number: "10.11.4",
    id: "rule_mark_designation_lingering_effect",
  },
  sabotage: { number: "10.12.1", id: "rule_sabotage" },
  sabotageResolution: { number: "10.12.2", id: "rule_sabotage_resolution" },
  sabotageFacedown: { number: "10.12.2a", id: "rule_sabotage_facedown" },
  sabotageHqFirst: { number: "10.12.3a", id: "rule_sabotage_hq_first" },
  sabotageAllRemaining: {
    number: "10.12.3b",
    id: "rule_sabotage_all_remaining_cards",
  },
  ambushText: { number: "1.21.7", id: "rule_ambush_text" },
  additionalIdentity: { number: "1.5.4", id: "rule_additional_identity" },
  additionalIdentitiesPile: {
    number: "1.5.4a",
    id: "rule_additional_identities_pile",
  },
  additionalIdentitiesReference: {
    number: "1.5.4b",
    id: "rule_additional_identities_reference",
  },
  outsideGame: { number: "4.1.3", id: "rule_outside_game" },
  /**
   * Continuous / lingering effect dependence (blanking, subtype grants, …).
   * Practical blanking solver uses this with independentEffects (9.12.1e).
   */
  dependentEffects: { number: "9.12.1d", id: "rule_dependent_effects" },
  /**
   * Apply independent continuous effects first; hosting breaks dependency loops
   * (CR §9.12.1e — Hush × Magnet example).
   */
  independentEffects: { number: "9.12.1e", id: "rule_independent_effects" },
} as const;


export {
  CORP_STEPS,
  RUNNER_STEPS,
  RUN_STEPS,
  BREACH_STEPS,
  STEPS,
  START_STEP,
  cursorFrom,
} from "./graph.js";

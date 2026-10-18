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
  serverRoot: { number: "4.6.6e", id: "rule_server_root" },
  /** Corp basic action: {click}{click}{click}: Purge virus counters. */
  corpBasicPurge: {
    number: "5.2.6h",
    id: "corp_basic_action_purge_virus_counters",
  },
  purge: { number: "10.1.2", id: "rule_purge" },
  /** (S) marks a paid ability window in which the Corp can score. */
  scoreInPaidWindow: {
    number: "9.2.7d",
    id: "rule_paid_ability_window_corp_score",
  },
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
  /** Set the drawn cards aside before the draw checkpoint (CR 8.4.5a). */
  drawSetAside: { number: "8.4.5a", id: "step_draw_set_aside" },
  /** Checkpoint while cards are set aside (CR 8.4.5b / 9.11.1c). */
  drawCheckpoint: { number: "8.4.5b", id: "step_draw_checkpoint" },
  /** Add the set-aside cards to hand after that checkpoint (CR 8.4.5c). */
  drawAddToHand: { number: "8.4.5c", id: "step_draw_add_to_hand" },
  /** An operation or event that starts a run stays in the play area until that run ends (CR 8.6.5). */
  playingTimingStructure: {
    number: "8.6.5",
    id: "rule_playing_timing_structure",
  },
  /** Place an event or operation faceup in the play area before its play cost (CR 8.6.7a). */
  playPlace: {
    number: "8.6.7a",
    id: "rule_steps_playing_place",
  },
  /** Pay the play cost of an event or operation (CR 8.6.7b). */
  playCostStep: {
    number: "8.6.7b",
    id: "rule_steps_playing_play_cost",
  },
  /** The player chooses X when a play cost of X is paid (CR 8.6.2a). */
  playCostX: {
    number: "8.6.2a",
    id: "rule_play_cost_x",
  },
  /** Cards an effect plays are played one at a time (CR 8.6.3). */
  playingOneAtATime: {
    number: "8.6.3",
    id: "rule_playing_one_at_a_time",
  },
  /** A lingering effect is independent of the event or operation that created it (CR 8.6.4). */
  playingLingeringEffects: {
    number: "8.6.4",
    id: "rule_playing_lingering_effects",
  },
  /** A search looks at every card in the zone (CR 8.7.1). */
  search: { number: "8.7.1", id: "rule_search" },
  /** A search of a hidden or secret zone is a temporary look (CR 8.7.1a). */
  searchHiddenSecretZone: {
    number: "8.7.1a",
    id: "rule_search_hidden_secret_zone",
  },
  /** A found card is set aside facedown while the search is open (CR 8.7.2). */
  find: { number: "8.7.2", id: "rule_find" },
  /** A found card is revealed only when the search ability resumes (CR 8.7.2c). */
  revealForSearch: {
    number: "8.7.2c",
    id: "rule_reveal_for_search",
  },
  /** The player may fail to find even when a match exists (CR 8.7.2e). */
  failToFind: { number: "8.7.2e", id: "rule_fail_to_find" },
  /** A searched deck is shuffled once the search is complete (CR 8.7.3). */
  shuffleDeckAfterSearch: {
    number: "8.7.3",
    id: "rule_shuffle_deck_after_search",
  },
  /** A conditional ability that triggers on a search becomes pending after the shuffle (CR 8.7.5). */
  searchCondition: { number: "8.7.5", id: "rule_search_condition" },
  /** A swap only moves a card into a location it can occupy (CR 8.8.2). */
  swapOnlyToValidLocation: {
    number: "8.8.2",
    id: "rule_swap_only_to_valid_location",
  },
  /** A swapped card enters its destination in that zone's normal state (CR 8.8.4a). */
  swapIntoZone: {
    number: "8.8.4a",
    id: "rule_state_of_swap_into_zone",
  },
  /** A swap uninstalls, trashes what it hosted, and meets install triggers at the next checkpoint (CR 8.8.4b). */
  swapBecomeInstalled: {
    number: "8.8.4b",
    id: "rule_swap_become_installed",
  },
  /** A card swapped into a set-aside group is acted on by the ability that set the other card aside (CR 8.8.4d). */
  swapToSetAside: {
    number: "8.8.4d",
    id: "rule_swap_to_set_aside",
  },
  /** A checkpoint occurs between consecutive instructions of an ability (CR 9.1.2). */
  resolveAbility: {
    number: "9.1.2",
    id: "rule_resolve_ability",
  },
  /** A newer ability fully resolves before the next instruction of the one that met its condition (CR 9.1.2a). */
  chainReaction: {
    number: "9.1.2a",
    id: "rule_chain_reaction",
  },
  /** An ability is resolving from its first imminent instruction until its last instruction finishes (CR 9.1.2b). */
  isResolving: {
    number: "9.1.2b",
    id: "rule_is_resolving",
  },
  /** Once an ability is independent of its source, a later zone change means it cannot act on that source (CR 9.1.4). */
  abilityIndependent: {
    number: "9.1.4",
    id: "rule_abilities_resolution_independent",
  },
  /** Spending or moving counters uses the card whose ability allowed it (CR 9.1.6c). */
  hostedCounterUsed: {
    number: "9.1.6c",
    id: "rule_hosted_counter_used_condition",
  },
  /** An ability that can only meet its condition in one zone is active in that zone (CR 9.1.8b). */
  abilityActiveInZone: {
    number: "9.1.8b",
    id: "rule_active_exception_catchall",
  },
  /** A cost to install, rez, or play the source is active while that card is inactive (CR 9.1.8d). */
  sourceInstallCost: {
    number: "9.1.8d",
    id: "rule_active_exception_modify_cost",
  },
  /** A trigger met by a move into an inactive zone stays active until its instances resolve (CR 9.1.8g). */
  abilityRemainsActive: {
    number: "9.1.8g",
    id: "rule_active_exception_conditional_move_to_inactive_zone",
  },
  /** "All" of an empty set is already true (CR 9.12.2d). */
  vacuousAll: {
    number: "9.12.2d",
    id: "rule_vacuous_truth",
  },
  /** X is 0 when the ability that defines it is inactive (CR 9.12.2e). */
  valueDefinedByX: {
    number: "9.12.2e",
    id: "rule_values_defined_by_x",
  },
  /** Trace body abilities wait until the trace is determined (CR 10.8.5). */
  traceConditionals: {
    number: "10.8.5",
    id: "rule_trace_conditional_abilities",
  },
  /** A pending persistent ability still resolves after its source is gone (CR 9.12.5d). */
  persistentAbility: {
    number: "9.12.5d",
    id: "rule_persistent_applicability",
  },
  /** A mandatory choice with no legal option does nothing (CR 9.12.3c). */
  mustChoice: {
    number: "9.12.3c",
    id: "rule_mandatory_choice",
  },
  /** One effect on a set of cards is a single event (CR 9.12.2a). */
  actOnSet: {
    number: "9.12.2a",
    id: "rule_act_on_multiple_cards",
  },
  /** Subroutines are active when ice is encountered while it is not installed (CR 9.1.8h). */
  encounterNotInstalled: {
    number: "9.1.8h",
    id: "rule_active_exception_encounter_not_installed",
  },
  /** An event or operation becomes active after its play cost (CR 8.6.7c). */
  playActive: {
    number: "8.6.7c",
    id: "rule_steps_playing_active",
  },
  /** Conditions for playing an event or operation (CR 8.6.7d). */
  playPlayedCondition: {
    number: "8.6.7d",
    id: "rule_steps_playing_played_condition",
  },
  /** Checkpoint after an event or operation is played, before its play abilities (CR 8.6.7e / 9.11.1d). */
  playCheckpoint: {
    number: "8.6.7e",
    id: "rule_steps_playing_played_checkpoint",
  },
  /** Resolve the play abilities of an event or operation (CR 8.6.7f). */
  playAbilities: {
    number: "8.6.7f",
    id: "rule_steps_playing_resolve_play_abilities",
  },
  /** Trash the played card when that applies (CR 8.6.7g). */
  trashPlayedCard: {
    number: "8.6.7g",
    id: "rule_steps_playing_trash_played_card",
  },
  /** Conditions after an event or operation finishes resolving (CR 8.6.7h). */
  afterResolveCondition: {
    number: "8.6.7h",
    id: "rule_steps_playing_after_resolve_condition",
  },
  /** The play effect of an event or operation is complete (CR 8.6.7i). */
  playComplete: {
    number: "8.6.7i",
    id: "rule_steps_playing_complete",
  },
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
  endEncounterOutsideRun: {
    number: "6.1.4b",
    id: "rule_end_encounter_outside_run",
  },
  endTheRunNoRun: {
    number: "6.1.4c",
    id: "rule_end_run_no_run_or_encounter",
  },
  countPositions: { number: "6.2.3", id: "rule_count_positions" },
  iceChangeOutward: { number: "6.2.6a", id: "rule_ice_change_outward" },
  abilitiesDuringRun: { number: "6.3.4", id: "rule_abilities_during_a_run" },
  ifSuccessfulTiedToServer: {
    number: "6.7.4a",
    id: "rule_if_successful_tied_to_server",
  },
  ifSuccessfulAbilityOptional: {
    number: "6.7.4c",
    id: "rule_if_successful_ability_optional",
  },
  runPhaseAfter: { number: "6.1.3e", id: "rule_run_phase_after" },
  iceChangeDuringMovement: {
    number: "6.2.7e",
    id: "rule_ice_change_during_movement",
  },
  forcedEncounter: { number: "6.5.9a", id: "rule_forced_encounter" },
  forcedEncounterDuringRun: {
    number: "6.5.9b",
    id: "rule_forced_encounter_during_run",
  },
  noPositionAfterApproach: {
    number: "6.2.5d",
    id: "rule_no_position_after_approach_server",
  },
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
  /** A checkpoint occurs immediately after a cost is paid (CR 10.3.4 / 9.11.1a). */
  costPaidCheckpoint: { number: "9.11.1a", id: "rule_cost_paid_checkpoint" },
  costAfterPay: { number: "10.3.4", id: "rule_checkpoint_after_paying_cost" },
  /** Nested cost unpayable when a static/mandatory interrupt would prevent payment (Funhouse×Jesminder). */
  costInterruptStaticMandatory: {
    number: "1.16.1b",
    id: "rule_cost_interrupt_static_mandatory",
  },
  costRestrictions: { number: "1.16.1c", id: "rule_cost_restrictions" },
  declineAdditionalCost: {
    number: "1.16.10a",
    id: "rule_decline_additional_cost",
  },
  nestedCost: { number: "1.16.11", id: "rule_nested_cost" },
  nestedCostUnless: { number: "1.16.11b", id: "rule_nested_cost_unless" },
  controllerChoices: { number: "1.14.5", id: "rule_controller_choices" },
  objectMoveLocation: { number: "1.12.3", id: "rule_object_move_location" },
  trashHostedWhenHostLeaves: {
    number: "1.13.13",
    id: "rule_trash_hosted_objects_when_host_trashed",
  },
  triggerByPlayer: { number: "1.14.5a", id: "rule_trigger_condition_effect_by_player" },
  /** Announce targets before the instruction is imminent (CR 1.15.2). */
  announceTargets: { number: "1.15.2", id: "rule_announce_targets" },
  /** Unannounced or invalid targets are skipped (CR 1.15.3). */
  targetsGone: { number: "1.15.3", id: "rule_targets_gone" },
  /** Looking at a card is separate from choosing it (CR 1.21.2). */
  look: { number: "1.21.2", id: "rule_look" },
  /** Increase then lower, then floor at 0 (Ghosttongue event play cost −N¢). */
  costCalculation: { number: "1.16.2a", id: "rule_cost_calculation" },
  totalInstallRez: {
    number: "1.16.2f",
    id: "rule_install_and_rez_reducing_total",
  },
  installCostIce: { number: "1.16.6b", id: "rule_install_cost_ice" },
  installCostByType: { number: "8.5.11a", id: "rule_install_cost_link" },
  playCost: { number: "1.16.7", id: "rule_play_cost" },
  eventPlayCost: { number: "3.7.2", id: "rule_event_play_cost" },
  timingCheckpoint: { number: "9.11.1b", id: "rule_checkpoint_timing_structure" },
  /** A draw may pause at its checkpoint (CR 9.11.1c). */
  drawPause: { number: "9.11.1c", id: "rule_draw_checkpoint" },
  /** After a checkpoint, pending conditional abilities get a reaction window (CR 10.3.2). */
  checkpointReaction: {
    number: "10.3.2",
    id: "rule_after_checkpoint_reaction_window",
  },
  /** Conditional abilities look at changes since the previous checkpoint (CR 10.3.1a). */
  checkpointConditionalAbilities: {
    number: "10.3.1a",
    id: "step_checkpoint_conditional_abilities",
  },
  /** Abilities whose duration has passed are removed (CR 10.3.1b). */
  checkpointDurationAbilities: {
    number: "10.3.1b",
    id: "step_checkpoint_duration_abilities",
  },
  /** Seven agenda points in a score area wins the game (CR 10.3.1c). */
  checkpointAgendaPoints: {
    number: "10.3.1c",
    id: "step_checkpoint_agenda_points",
  },
  /** Extra unique cards and consoles are trashed (CR 10.3.1d). */
  checkpointUniqueness: {
    number: "10.3.1d",
    id: "step_checkpoint_uniqueness",
  },
  /** Objects that break a restriction are trashed (CR 10.3.1e). */
  checkpointCardRestrictions: {
    number: "10.3.1e",
    id: "step_checkpoint_card_restrictions",
  },
  /** Hosts of an agenda that left a score area are trashed (CR 10.3.1f). */
  checkpointHostedOnAgenda: {
    number: "10.3.1f",
    id: "step_checkpoint_hosted_on_agenda",
  },
  /** Hosts of an uninstalled card are trashed (CR 10.3.1g). */
  checkpointHostedOnUninstalled: {
    number: "10.3.1g",
    id: "step_checkpoint_hosted_on_installed_cards",
  },
  /** An empty remote server ceases to exist (CR 10.3.1h). */
  checkpointRemoteServer: {
    number: "10.3.1h",
    id: "step_checkpoint_remote_server",
  },
  /** A vacant ice position ceases to exist (CR 10.3.1i). */
  checkpointVacantPosition: {
    number: "10.3.1i",
    id: "step_checkpoint_vacant_position",
  },
  /** A card that entered a root during a breach may be accessed (CR 10.3.1j). */
  checkpointCardEnteringRoot: {
    number: "10.3.1j",
    id: "step_checkpoint_card_entering_root_during_breach",
  },
  /** A converted card in a discard pile returns to printed form (CR 10.3.1k). */
  checkpointDiscardPileCards: {
    number: "10.3.1k",
    id: "step_checkpoint_discard_pile_cards",
  },
  /** Counters in a discard pile return to the bank (CR 10.3.1l). */
  checkpointDiscardPileCounters: {
    number: "10.3.1l",
    id: "step_checkpoint_discard_pile_counters",
  },
  /** Playing an event or operation may pause at its checkpoint (CR 9.11.1d). */
  playPause: { number: "9.11.1d", id: "rule_play_checkpoint" },
  /** A trace may pause at its checkpoint (CR 9.11.1e). */
  tracePause: { number: "9.11.1e", id: "rule_trace_checkpoint" },
  priority: { number: "9.2.3", id: "rule_priority" },
  activePlayer: { number: "9.2.1", id: "rule_active_player" },
  priorityWindow: { number: "9.2.4", id: "rule_priority_window" },
  /** A checkpoint occurs before a player receives priority (CR 10.3.3). */
  checkpointBeforePriority: {
    number: "10.3.3",
    id: "rule_checkpoint_before_priority",
  },
  /** That checkpoint is immediately before the player may act (CR 9.2.4e). */
  priorityBeforeAct: {
    number: "9.2.4e",
    id: "rule_checkpoint_before_receiving_priority",
  },
  /** A checkpoint occurs as soon as an instruction finishes (CR 10.3.5). */
  checkpointAfterInstruction: {
    number: "10.3.5",
    id: "rule_checkpoint_after_instruction_resolution",
  },
  /** A step in a timing structure is one instruction, followed by that checkpoint (CR 9.11.2). */
  timingStepIsInstruction: {
    number: "9.11.2",
    id: "rule_step_in_timing_structure_is_instruction",
  },
  /** The checkpoint after a timing structure's last step is outside that structure (CR 10.3.6). */
  checkpointAfterTimingStructure: {
    number: "10.3.6",
    id: "rule_checkpoint_after_timing_structure",
  },
  /** A turn is a timing structure, as is each of its phases (CR 9.2.2a). */
  turnTimingStructure: {
    number: "9.2.2a",
    id: "rule_turn_timing_structure",
  },
  /** The Corp's turn has a draw phase, an action phase, and a discard phase (CR 5.1.2). */
  corpTurnPhases: {
    number: "5.1.2",
    id: "rule_corp_turn_phases",
  },
  /** The Runner's turn has an action phase and a discard phase (CR 5.1.3). */
  runnerTurnPhases: {
    number: "5.1.3",
    id: "rule_runner_turn_phases",
  },
  /** Discard Phase (CR 5.5). */
  discardPhase: {
    number: "5.5",
    id: "sec_discard_phase",
  },
  /** A run is a timing structure, as is each of its six phases (CR 9.2.2b). */
  runTimingStructure: {
    number: "9.2.2b",
    id: "rule_run_timing_structure",
  },
  /** A run has six phases, beginning with initiation (CR 6.1.1). */
  runPhases: {
    number: "6.1.1",
    id: "rule_run",
  },
  /** Initiation is the first phase of a run (CR 6.3). */
  initiationPhase: {
    number: "6.3",
    id: "sec_run_initiation",
  },
  /** Approach Ice is the second phase of a run (CR 6.4). */
  approachIcePhase: {
    number: "6.4",
    id: "sec_approach_ice_phase",
  },
  /** Encounter Ice is the third phase of a run (CR 6.5). */
  encounterIcePhase: {
    number: "6.5",
    id: "sec_encounter_ice_phase",
  },
  /** Movement is the fourth phase of a run (CR 6.6). */
  movementPhase: {
    number: "6.6",
    id: "sec_movement_phase",
  },
  /** Success is the fifth phase of a run (CR 6.7). */
  successPhase: {
    number: "6.7",
    id: "sec_success_phase",
  },
  /** Run Ends is the sixth phase of a run (CR 6.8). */
  runEndsPhase: {
    number: "6.8",
    id: "sec_run_ends_phase",
  },
  /** Breaching a server is a timing structure (CR 9.2.2c). */
  breachTimingStructure: {
    number: "9.2.2c",
    id: "rule_breaching_timing_structure",
  },
  /** Accessing a card is a timing structure (CR 9.2.2d). */
  accessTimingStructure: {
    number: "9.2.2d",
    id: "rule_accessing_timing_structure",
  },
  /** A paid ability window starts with the active player. */
  abilityWindowPriority: { number: "9.2.7a", id: "rule_ability_window_priority" },
  /** A reaction window opened by a timing structure closes when that structure ends (CR 9.2.8f). */
  reactionWindowCloses: {
    number: "9.2.8f",
    id: "rule_reaction_window_closing_timing_structure",
  },
  /** An ability with the once-per-turn flag is used only when it resolves (CR 9.3.6g). */
  oncePerTurnFlag: {
    number: "9.3.6g",
    id: "rule_once_per_turn_flag",
  },
  /** Ability flags (access, interface, interrupt, persistent, threat N, once per turn) (CR 9.3.6). */
  abilityFlag: { number: "9.3.6", id: "rule_ability_flag" },
  /** Dividends N: agenda counters per excess advancement when scored (CR 10.13.1). */
  dividends: { number: "10.13.1", id: "rule_dividends" },
  /** Dividends checks advancement requirement and counters at score begin (CR 10.13.2). */
  dividendsTiming: { number: "10.13.2", id: "rule_dividends_timing" },
  /** A static ability ends when the value it reads changes (CR 9.4.4). */
  staticNoLingering: {
    number: "9.4.4",
    id: "rule_static_no_lingering_effects",
  },
  /** A static modifier keeps the restrictions on the value it changes (CR 9.4.5). */
  staticKeepsRestriction: {
    number: "9.4.5",
    id: "rule_static_modification_keep_restrictions",
  },
  nestedPriorityWindow: { number: "9.2.4d", id: "rule_nested_priority_window" },
  paidAbility: { number: "9.5.1", id: "rule_paid_ability" },
  triggerPaidAbilities: { number: "9.5.2", id: "rule_trigger_paid_abilities" },
  /** A forced mid-access trash still treats the ability as optional (CR 9.5.3a). */
  forcedMidAccessOptional: {
    number: "9.5.3a",
    id: "rule_forced_mid_access_ability_optional",
  },
  /** "Must" without a stated means forces a choice among ways to do it (CR 9.12.3a). */
  mustAnyMeans: {
    number: "9.12.3a",
    id: "rule_must_with_choice",
  },
  /** "Must" that names the means does not force a different ability (CR 9.12.3b). */
  mustSpecifiedMeans: {
    number: "9.12.3b",
    id: "rule_must_without_choice",
  },
  /** A must cannot force an additional cost the player declines (CR 9.12.3e). */
  mustNotForceAdditionalCost: {
    number: "9.12.3e",
    id: "rule_must_cannot_force_additional_cost",
  },
  /** A card's own name, without "copy", means this object (CR 10.1.5). */
  selfReference: {
    number: "10.1.5",
    id: "sec_old_self_reference_rules",
  },
  /** A mandatory loop resolves a chosen number of times, then ends (CR 10.1.6a). */
  mandatoryLoop: {
    number: "10.1.6a",
    id: "rule_mandatory_infinite_loop",
  },
  /** Open information stays available to the opponent (CR 10.2.3b). */
  cannotHideOpenInfo: {
    number: "10.2.3b",
    id: "rule_cannot_hide_open_info",
  },
  /** A trash ability keeps hosted counters while it resolves (CR 9.5.5). */
  trashAbilityKeepsHosted: {
    number: "9.5.5",
    id: "rule_trash_ability_keeps_track_of_hosted_objects",
  },
  /** A paid ability that names approached ice is legal only when that ice matches (CR 9.5.6b). */
  paidAbilityApproachedIce: {
    number: "9.5.6b",
    id: "rule_paid_ability_refers_to_approached_ice",
  },
  /** One trigger met more than once before the next checkpoint becomes that many instances (CR 9.6.4b). */
  conditionMetMultipleTimes: {
    number: "9.6.4b",
    id: "rule_condition_met_multiple_times",
  },
  /** A requirement in an ability's instructions is checked when those instructions resolve (CR 9.6.5d). */
  conditionCheckedWhenResolving: {
    number: "9.6.5d",
    id: "rule_condition_requirements_part_of_effect",
  },
  /** "Had" looks at the previous checkpoint, before this instruction's change (CR 9.6.6a). */
  hadPreviousCheckpoint: {
    number: "9.6.6a",
    id: "rule_instruction_requirements_past_state",
  },
  /** A static-condition ability that did nothing stays quiet until the next timing step (CR 9.6.7d). */
  staticConditionNoEffect: {
    number: "9.6.7d",
    id: "rule_conditional_ability_static_condition_no_effect",
  },
  /** A pending conditional ability ends when that ability becomes inactive (CR 9.6.10). */
  pendingAbilityInactive: {
    number: "9.6.10",
    id: "rule_conditional_ability_lose_pending_when_ability_becomes_inactive",
  },
  /** A delayed ability with no stated duration resolves once, then expires (CR 9.6.13c). */
  delayedAbilityOnce: {
    number: "9.6.13c",
    id: "rule_delayed_conditional_ability_relevant_once",
  },
  /** Resolving a when-scored ability still requires that ability's extra conditions (CR 9.6.14d). */
  whenScoredAdditionalRequirement: {
    number: "9.6.14d",
    id: "rule_instructed_to_resolve_conditional_ability",
  },
  /** A play ability resolves while the card is being played (CR 9.7.1). */
  playAbility: { number: "9.7.1", id: "rule_play_ability" },
  /** TL;DR copies each subroutine immediately after the one it copied (CR 9.8.2a). */
  subroutinesDuplicated: {
    number: "9.8.2a",
    id: "rule_subroutines_duplicated",
  },
  /** Hive loses printed subroutines from the last one backward (CR 9.8.2b). */
  subroutinesLostFromLast: {
    number: "9.8.2b",
    id: "rule_subroutines_static_ability_remove_subroutines",
  },
  /** The Corp places each granted subroutine among the ones the ice already has (CR 9.8.2c). */
  subroutineOrderChoice: {
    number: "9.8.2c",
    id: "rule_gain_subroutines_in_any_order",
  },
  /** A subroutine added before the others is newer than the ones already there (CR 9.8.3a). */
  subroutineOriginExternalBefore: {
    number: "9.8.3a",
    id: "rule_subroutine_origin_external_before",
  },
  /** A static subroutine added after the others keeps the earlier ones in place (CR 9.8.3d). */
  subroutineOriginStaticAfter: {
    number: "9.8.3d",
    id: "rule_subroutine_origin_static_after",
  },
  /** An external subroutine added after the others is older than ones gained later (CR 9.8.3e). */
  subroutineOriginExternalAfter: {
    number: "9.8.3e",
    id: "rule_subroutine_origin_external_after",
  },
  /** Grappling Hook breaks every unbroken subroutine except the one the Runner chooses (CR 9.8.6b). */
  breakAllButChosenSubroutine: {
    number: "9.8.6b",
    id: "rule_break_all_but_x_subroutines_targets",
  },
  /** Street Magic: the Runner orders unbroken subroutines before any resolve (CR 9.8.7d). */
  subroutineResolveOrder: {
    number: "9.8.7d",
    id: "rule_resolve_subroutines_runner_choice",
  },
  /** A replaced subroutine still resolves from the ice it was on (CR 9.8.9). */
  replaceSubroutineResolution: {
    number: "9.8.9",
    id: "rule_replace_subroutine_resolution",
  },
  /** A play or install cost is a value an interrupt can modify (CR 9.9.6c). */
  modifiableValueCost: {
    number: "9.9.6c",
    id: "rule_modifiable_value_cost",
  },
  /** Choosing an effect does not require that effect to resolve unmodified (CR 9.12.3d). */
  mustChoiceCanBeModified: {
    number: "9.12.3d",
    id: "rule_mandatory_choice_effects_can_be_modified",
  },
  /** Static abilities change an imminent instruction's expected effects (CR 9.9.2). */
  expectedEffects: {
    number: "9.9.2",
    id: "rule_expected_effects",
  },
  /** A static replacement lasts only while its source stays active on that host (CR 9.9.9a). */
  replacementStaticMustRemainActive: {
    number: "9.9.9a",
    id: "rule_replacement_on_static_ability_must_remain_active",
  },
  /** A pending interrupt can be triggered only while it is still relevant (CR 9.9.4c). */
  conditionalInterruptStillRelevant: {
    number: "9.9.4c",
    id: "rule_trigger_conditional_ability_interrupt",
  },
  /** A paid interrupt can be used even if it became active after the window opened (CR 9.9.4d). */
  paidInterruptNeedNotBeActiveAtOpen: {
    number: "9.9.4d",
    id: "rule_trigger_paid_ability_interrupt",
  },
  /** An ordinal "would" counts when the effect becomes imminent (CR 9.9.5a). */
  ordinalWould: {
    number: "9.9.5a",
    id: "rule_ordinal_would",
  },
  /** An imminent damage amount can be reduced below zero and still be modified (CR 9.9.7a). */
  negativeDamageValue: {
    number: "9.9.7a",
    id: "rule_negative_values_imminent",
  },
  /** Preventing all damage removes it from the expected effects (CR 9.9.7b). */
  preventAllDamage: {
    number: "9.9.7b",
    id: "rule_prevent_all",
  },
  /** "Prevent all but 1" sets net damage to 1 when the amount is 2 or more (CR 9.9.7c). */
  preventAllButOne: {
    number: "9.9.7c",
    id: "rule_prevent_all_but_one",
  },
  /** Damage of 0 or less does not occur when the instruction resolves (CR 9.9.7d). */
  negativeDamageResolution: {
    number: "9.9.7d",
    id: "rule_negative_values_resolution",
  },
  /** Preventing 0 damage does not meet "prevents 1 or more damage" (CR 9.9.7f). */
  preventOneOrMore: {
    number: "9.9.7f",
    id: "rule_prevent_as_trigger_condition",
  },
  /** A later replacement applies only while its effect is still expected (CR 9.9.11a). */
  replacementMustReplace: {
    number: "9.9.11a",
    id: "rule_replacement_effect_must_have_something_to_replace",
  },
  lingeringChoiceTurn: {
    number: "9.10.3b",
    id: "rule_lingering_effect_maintaining_choice_turn_begins_duration",
  },
  icebreakerStrengthOutsideEncounter: {
    number: "3.9.5d",
    id: "rule_icebreaker_strength_increase_outside_of_encounter",
  },
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
  /** A modified selection is still trashed simultaneously (CR 10.4.3a). */
  sequentialDamageSelection: {
    number: "10.4.3a",
    id: "rule_multiple_damage_selected_sequentially",
  },
  /** When two abilities would choose the same card, the active player chooses (CR 9.12.1c). */
  activePlayerChoice: {
    number: "9.12.1c",
    id: "rule_modify_ability_with_choice",
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
  /** Canonical core damage (CR §10.4.2b). Prefer this cite over coreDamage. */
  coreDamage: { number: "10.4.2b", id: "rule_core_damage" },
  /** Older term for core damage (CR §10.4.2c); interchangeable. */
  brainDamage: { number: "10.4.2c", id: "rule_brain_damage" },
  meatDamage: { number: "10.4.2a", id: "rule_meat_net_damage" },
  preventDamage: { number: "9.9.5", id: "sec_prevent_avoid" },
  trace: { number: "10.8.1", id: "rule_trace_attempt_and_base_trace_strength" },
  /** A player can bid only credits they are able to spend (CR 10.14.3). */
  bidPossible: { number: "10.14.3", id: "rule_bid_possible" },
  /** Psi bids are spent when they are revealed, with no checkpoint between (CR 10.14.6c). */
  psiRevealSpend: { number: "10.14.6c", id: "rule_psi_bid_reveal" },
  /** Checkpoint after a trace initiates, before either player spends credits (CR 10.8.6b). */
  traceCheckpoint: { number: "10.8.6b", id: "step_trace_checkpoint" },
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
  /** A played card that has left the play area is not trashed (CR 8.6.6a). */
  playNoTrashLeftPlayArea: {
    number: "8.6.6a",
    id: "rule_play_no_trash_left_play_area",
  },
  /** A played card hosted while resolving is not trashed (CR 8.6.6b). */
  playNoTrashHosted: {
    number: "8.6.6b",
    id: "rule_play_no_trash_hosted",
  },
  /** A play that removes the card after it resolves does not trash it (CR 8.6.6d). */
  playNoTrashIfPlayEffectWillRfg: {
    number: "8.6.6d",
    id: "rule_play_no_trash_if_play_effect_will_rfg",
  },
  playEvent: { number: "5.2.7e", id: "runner_basic_action_event" },
  hqAccess: { number: "7.4.1b", id: "rule_candidates_in_hq" },
  rdAccess: { number: "7.4.1c", id: "rule_candidates_in_rnd" },
  archivesAccess: { number: "7.4.1d", id: "rule_candidates_in_archives" },
  prohibitionRemoved: { number: "7.4.2a", id: "rule_prohibition_removed" },
  candidatesAlreadyAccessed: {
    number: "7.4.3",
    id: "rule_candidates_already_accessed",
  },
  candidatesLeavingServer: {
    number: "7.4.5",
    id: "rule_candidates_leaving_server",
  },
  rdTopmostEligible: {
    number: "7.4.7a",
    id: "rule_rnd_topmost_eligibile_candidate",
  },
  consecutiveBreaches: { number: "7.3.8", id: "rule_consecutive_breaches" },
  visibilityAfterAccess: {
    number: "7.3.1a",
    id: "rule_visibility_after_access",
  },
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
  /** A facedown card moved for a required attribute is revealed first (CR 4.1.2a). */
  revealFromHidden: { number: "4.1.2a", id: "rule_reveal_from_hidden" },
  revealForAbilityLimitations: {
    number: "8.5.13c",
    id: "rule_reveal_for_ability_limitations",
  },
  revealForInstallAndRez: {
    number: "8.5.13d",
    id: "rule_reveal_for_install_and_rez",
  },
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

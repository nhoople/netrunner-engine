import type { TimingCursor } from "../state/types.js";

/** Named CR citations used by the host engine (not a compiler). */
export const CR = {
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
} as const;

export function timing(
  structure: TimingCursor["structure"],
  stepId: string,
  stepNumber: string,
  label: string,
): TimingCursor {
  return { structure, stepId, stepNumber, label };
}

/** Simplified corp-turn step graph (paid windows are no-ops in v0). */
export const CORP_STEPS = {
  gainClicks: timing(
    "corp_turn",
    "sec_appendix_timing_structure_corps_turn_1_a",
    "11.2_1_a",
    "The Corp gains allotted clicks.",
  ),
  mandatoryDraw: timing(
    "corp_turn",
    "sec_appendix_timing_structure_corps_turn_1_e",
    "11.2_1_e",
    "The Corp draws 1 card.",
  ),
  actionWindow: timing(
    "corp_turn",
    "sec_appendix_timing_structure_corps_turn_2_a",
    "11.2_2_a",
    "Paid ability window before Corp action (v0: pass).",
  ),
  takeAction: timing(
    "corp_turn",
    "sec_appendix_timing_structure_corps_turn_2_b_ii",
    "11.2_2_b_ii",
    "If yes, the Corp takes an action.",
  ),
  actionPhaseEnd: timing(
    "corp_turn",
    "sec_appendix_timing_structure_corps_turn_2_d",
    "11.2_2_d",
    "The Corp's action phase ends.",
  ),
  discard: timing(
    "corp_turn",
    "sec_appendix_timing_structure_corps_turn_3_a",
    "11.2_3_a",
    "The Corp discards cards.",
  ),
  turnComplete: timing(
    "corp_turn",
    "sec_appendix_timing_structure_corps_turn_3_e",
    "11.2_3_e",
    "Move to the Runner's turn.",
  ),
} as const;

export const RUNNER_STEPS = {
  gainClicks: timing(
    "runner_turn",
    "sec_appendix_timing_structure_runners_turn_1_a",
    "11.3_1_a",
    "The Runner gains allotted clicks.",
  ),
  actionWindow: timing(
    "runner_turn",
    "sec_appendix_timing_structure_runners_turn_1_e",
    "11.3_1_e",
    "Paid ability window before Runner action (v0: pass).",
  ),
  takeAction: timing(
    "runner_turn",
    "sec_appendix_timing_structure_runners_turn_1_f_ii",
    "11.3_1_f_ii",
    "If yes, the Runner takes an action.",
  ),
  actionPhaseEnd: timing(
    "runner_turn",
    "sec_appendix_timing_structure_runners_turn_1_h",
    "11.3_1_h",
    "The Runner's action phase ends.",
  ),
  discard: timing(
    "runner_turn",
    "sec_appendix_timing_structure_runners_turn_2_a",
    "11.3_2_a",
    "The Runner discards cards.",
  ),
  turnComplete: timing(
    "runner_turn",
    "sec_appendix_timing_structure_runners_turn_2_e",
    "11.3_2_e",
    "Move to the Corp's turn.",
  ),
} as const;

export const RUN_STEPS = {
  announce: timing(
    "run",
    "sec_appendix_timing_structure_of_a_run_1_a",
    "11.4_1_a",
    "The Runner announces the attacked server.",
  ),
  begin: timing(
    "run",
    "sec_appendix_timing_structure_of_a_run_1_c",
    "11.4_1_c",
    "The run begins.",
  ),
  checkIce: timing(
    "run",
    "sec_appendix_timing_structure_of_a_run_1_f",
    "11.4_1_f",
    "Does the Runner have a position corresponding to a piece of ice?",
  ),
  approachServer: timing(
    "run",
    "sec_appendix_timing_structure_of_a_run_4_g",
    "11.4_4_g",
    "The Runner approaches the server.",
  ),
  success: timing(
    "run",
    "sec_appendix_timing_structure_of_a_run_5_a",
    "11.4_5_a",
    "The run is declared successful.",
  ),
  breach: timing(
    "run",
    "sec_appendix_timing_structure_of_a_run_5_b",
    "11.4_5_b",
    "The Runner breaches the attacked server.",
  ),
  runEnds: timing(
    "run",
    "sec_appendix_timing_structure_of_a_run_6_d",
    "11.4_6_d",
    "The run is complete.",
  ),
} as const;

export const BREACH_STEPS = {
  begin: timing(
    "breach",
    "sec_appendix_timing_structure_of_breaching_a_server_1",
    "11.5_1",
    "The breach begins.",
  ),
  choose: timing(
    "breach",
    "sec_appendix_timing_structure_of_breaching_a_server_4",
    "11.5_4",
    "Are there candidate cards remaining to access?",
  ),
  access: timing(
    "breach",
    "sec_appendix_timing_structure_of_breaching_a_server_5",
    "11.5_5",
    "The Runner accesses the chosen card.",
  ),
  complete: timing(
    "breach",
    "sec_appendix_timing_structure_of_breaching_a_server_7",
    "11.5_7",
    "Breaching the server is complete.",
  ),
} as const;

/**
 * Declarative conditional triggers over checkpoint facts/diff (CR 9.6.6 /
 * 9.6.6a / 10.3.1a). Full CR fidelity phase 2: predicates are data, not hook
 * names. Expand kinds as families migrate onto the scanner.
 */
import type { CheckpointDiff } from "./checkpointSnapshot.js";
import type { GameState, ServerId, Side } from "./types.js";
import type { ValRunnerTriggerFamily } from "../effects/sansanValHooks.js";

export type { ValRunnerTriggerFamily };

/**
 * Machine-checkable trigger condition. The 10.3.1a scanner evaluates these
 * against `CheckpointDiff` and the previous checkpoint's facts.
 */
export type TriggerPredicate =
  | {
      /** Advancement rose from zero since the previous 10.3.1a (CR 9.6.6a). */
      kind: "advancement_increased_from_zero";
    }
  | {
      /**
       * Runner tags rose and the previous checkpoint's baseline was zero
       * (CR 9.6.6a — Sebastião "had no tags").
       */
      kind: "runner_tags_increased_from_zero";
    }
  | {
      /**
       * One entry per expose since the previous checkpoint (CR 9.6.4b).
       * The same card id may appear more than once.
       */
      kind: "exposed_since_previous";
    }
  | {
      /**
       * Cards that entered the draw set-aside zone since the previous
       * checkpoint (CR 8.4.5a).
       */
      kind: "entered_draw_set_aside";
    }
  | {
      /**
       * Cards that entered a remote root or ice zone since the previous
       * checkpoint (CR 8.8.4b swap / first-remote-install).
       */
      kind: "entered_remote_install";
    }
  | {
      /**
       * Cards that entered the breached server's root since the previous
       * checkpoint while the run is in the breach structure (CR 10.3.1j).
       */
      kind: "entered_breached_root";
    }
  | {
      /**
       * First Runner click spend/lose during a run this turn (Seidr; turn flag
       * set by click hooks, marked at 10.3.1a — phase 3).
       */
      kind: "seidr_first_click_during_run";
    }
  | {
      /**
       * First Corp bad-publicity take this turn (Editorial; turn flag set by
       * badPublicityHooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_bad_publicity_take";
    }
  | {
      /**
       * Each Corp bad-publicity take event since the previous checkpoint
       * (Runner onEachCorpBadPublicityTake; counted in hooks, marked at
       * 10.3.1a — phase 3).
       */
      kind: "each_corp_bad_publicity_take";
    }
  | {
      /**
       * First event trashed this turn (Aniccam; turn flag set by trashHooks,
       * marked at 10.3.1a — phase 3).
       */
      kind: "first_event_trashed";
    }
  | {
      /**
       * MirrorMorph third distinct Corp action this turn (turn flag set by
       * corpActionHooks, marked at 10.3.1a — phase 3).
       */
      kind: "mirrormorph_third_distinct";
    }
  | {
      /**
       * First Corp card install this turn (Asa; turn flag set by trashHooks /
       * installCorp, marked at 10.3.1a — phase 3).
       */
      kind: "first_corp_card_install";
    }
  | {
      /**
       * First Corp root install this turn (Lago; turn flag set by trashHooks /
       * installCorp, marked at 10.3.1a — phase 3).
       */
      kind: "first_corp_root_install";
    }
  | {
      /**
       * First remote install this turn via the normal install path (A Teia;
       * turn flag set by noteFirstRemoteInstallThisTurn, marked at 10.3.1a —
       * phase 3). Swap installs use entered_remote_install (CR 8.8.4b).
       */
      kind: "first_remote_install_normal";
    }
  | {
      /**
       * First agenda scored or stolen this turn (Phật Gioan; turn flag set by
       * agendaHooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_agenda_scored_or_stolen";
    }
  | {
      /**
       * First Runner steal/trash of a Corp card this turn (Epiphany; turn flag
       * set by trashHooks / scoring, marked at 10.3.1a — phase 3).
       */
      kind: "first_runner_stole_or_trashed";
    }
  | {
      /**
       * First Corp card trashed by the Runner this turn (Solidarity Badge /
       * Controlling the Message; turn flag set by trashHooks, marked at
       * 10.3.1a — phase 3).
       */
      kind: "first_corp_card_trash";
    }
  | {
      /**
       * First program or hardware trash this turn (District 99; turn flag set
       * by trashHooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_program_or_hardware_trash";
    }
  | {
      /**
       * First access trash this turn (Mâché; turn flag set by trashHooks,
       * marked at 10.3.1a — phase 3).
       */
      kind: "first_access_trash";
    }
  | {
      /**
       * First trash this turn matching Runner identity faction (Storgotic;
       * turn flag set by trashHooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_trash_matching_runner_id_faction";
    }
  | {
      /**
       * First operation play while Corp identity is flipped (Nebula; turn
       * flag set by identityFlipHooks, marked at 10.3.1a — phase 3).
       */
      kind: "corp_flipped_first_operation_play";
    }
  | {
      /**
       * First grip/stack trash batch this turn (Buffer Drive; turn flag set
       * by trashHooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_grip_or_stack_trash_batch";
    }
  | {
      /**
       * First trash of an installed Runner card this turn (Reaver; turn flag
       * set by trashHooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_installed_trash";
    }
  | {
      /**
       * First tag(s) given this turn (NBN: Reality Plus; turn flag set by
       * tag hooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_tag_this_turn";
    }
  | {
      /**
       * First reveal this turn (Hyoubu Institute; turn flag set by reveal
       * hooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_reveal_this_turn";
    }
  | {
      /**
       * First time the Runner's credit pool is empty this turn (Order of Sol;
       * turn flag set by credit hooks, marked at 10.3.1a — phase 3).
       */
      kind: "first_credit_pool_empty";
    }
  | {
      /**
       * Valley first/second-each-turn Runner triggers this interval (Synthetic
       * Blood / Hayley / Chronotype / Symmetrical Visage; ordinals queued by
       * hooks, marked at 10.3.1a — phase 3). Genetics may fire twice with Gene
       * Conditioning Shoppe.
       */
      kind: "val_runner_triggers";
      family: ValRunnerTriggerFamily;
    }
  | {
      /** First hardware install this turn (phase 3 MetPending). */
      kind: "first_hardware_install";
    }
  | {
      /** First program install this turn (LilyPAD; phase 3 MetPending). */
      kind: "first_program_install";
    }
  | {
      /** First virus program install this turn (Avgustina; phase 3 MetPending). */
      kind: "first_virus_install";
    }
  | {
      /**
       * Valley successful-run triggers this interval (Pravdivost / DreamNet /
       * Enhanced Vision; ordinals queued by run.success, marked at 10.3.1a).
       */
      kind: "val_successful_run_triggers";
    }
  | {
      /** First run begin this turn (Stegodon / Tributary / Prognostic). */
      kind: "first_run_begin";
    }
  | {
      /** First R&D run begin this turn (Padma). */
      kind: "first_rd_run_begin";
    }
  | {
      /** First Archives run begin this turn (Front Company). */
      kind: "first_archives_run_begin";
    }
  | {
      /** First unsuccessful run this turn (John Masanori). */
      kind: "first_unsuccessful_run";
    }
  | {
      /** First successful HQ run this turn (PAN-Weave). */
      kind: "first_successful_hq_run";
    }
  | {
      /** First successful HQ or R&D run this turn (RNG Key). */
      kind: "first_successful_hq_or_rd_run";
    }
  | {
      /** First successful central run this turn (Zenit). */
      kind: "first_successful_central_run";
    }
  | {
      /** First successful mark run this turn (Virtuoso). */
      kind: "first_successful_mark_run";
    }
  | {
      /**
       * Daredevil: first run this turn on a server with ≥N ice (MetPending
       * from run.begin, marked at 10.3.1a).
       */
      kind: "daredevil_first_run_ice_gte";
    }
  | {
      /** Baklan: first actual ice encounter this run. */
      kind: "first_encounter_each_run";
    }
  | {
      /** Khan: first ice passed this turn. */
      kind: "first_pass_ice";
    }
  | {
      /** Sisyphus: first pass of rezzed code gate or sentry this turn. */
      kind: "sisyphus_first_pass_rezzed_cg_or_sentry";
    }
  | {
      /** Runner onPassUnrezzedIce since previous checkpoint. */
      kind: "pass_unrezzed_ice";
    }
  | {
      /** Runner onPassRezzedIce since previous checkpoint. */
      kind: "pass_rezzed_ice";
    }
  | {
      /** Ice onPass since previous checkpoint (ice ids queued). */
      kind: "ice_on_pass";
    }
  | {
      /** Hosted onPassHost since previous checkpoint (host ice ids queued). */
      kind: "pass_host";
    }
  | {
      /** Upgrade onPassRezzedIceProtectingThisServer (server ids queued). */
      kind: "pass_rezzed_ice_protecting_server";
    }
  | {
      /** Ice onEncounterEnd since previous checkpoint (ice ids queued). */
      kind: "encounter_end";
    }
  | {
      /** Ice onEncounterEndIfRezzedThisTurn (ice ids queued). */
      kind: "encounter_end_rezzed_this_turn";
    }
  | {
      /** Ice onEncounterEndIfNotFullyBroken (ice ids queued). */
      kind: "encounter_end_not_fully_broken";
    }
  | {
      /** Ice onEncounterEndIfPrintedSubroutineBroken (ice ids queued). */
      kind: "encounter_end_printed_subroutine_broken";
    }
  | {
      /** Hosted onHostEncounter since previous checkpoint (host ice ids). */
      kind: "host_encounter";
    }
  | {
      /** Runner identity onEncounterRezzedAfterApproach. */
      kind: "encounter_rezzed_after_approach";
    }
  | {
      /** Root onApproachServer since previous checkpoint (card ids). */
      kind: "approach_server";
    }
  | {
      /** Root onPassAllIceProtectingServer (server ids). */
      kind: "pass_all_ice_protecting_server";
    }
  | {
      /** Ice/Runner onBypass since previous checkpoint (source ids). */
      kind: "bypass";
    }
  | {
      /** Root onApproachIce since previous checkpoint (card ids). */
      kind: "approach_ice";
    }
  | {
      /** First successful R&D run end this turn (Psych Mike). */
      kind: "first_successful_rd_run_end";
    }
  | {
      /** Runner onSuccessfulRunOnRd since previous checkpoint (card ids). */
      kind: "successful_run_on_rd";
    }
  | {
      /** Runner onSuccessfulRunEndOncePerTurn since previous checkpoint. */
      kind: "successful_run_end_once";
    }
  | {
      /** Corp onSuccessfulRunEnd since previous checkpoint. */
      kind: "successful_run_end";
    }
  | {
      /** Root onSuccessfulRunOtherServerOncePerTurn since previous checkpoint. */
      kind: "other_server_success";
    }
  | {
      /** onSuccessfulRun since previous checkpoint (card ids). */
      kind: "successful_run";
    };

export type TriggerPredicateMatch =
  | {
      kind: "advancement_increased_from_zero";
      /** Cards that advanced from zero this interval. */
      cardIds: string[];
    }
  | {
      kind: "runner_tags_increased_from_zero";
      matched: boolean;
    }
  | {
      kind: "exposed_since_previous";
      /** Exposed card ids this interval (multiplicity preserved). */
      cardIds: string[];
    }
  | {
      kind: "entered_draw_set_aside";
      side: Side | null;
      cardIds: string[];
    }
  | {
      kind: "entered_remote_install";
      entries: Array<{ cardId: string; serverId: ServerId }>;
    }
  | {
      kind: "entered_breached_root";
      serverId: ServerId | null;
      cardIds: string[];
    }
  | {
      kind: "seidr_first_click_during_run";
      matched: boolean;
    }
  | {
      kind: "first_bad_publicity_take";
      matched: boolean;
    }
  | {
      kind: "each_corp_bad_publicity_take";
      /** Take events to mark (one pending instance per event). */
      count: number;
    }
  | {
      kind: "first_event_trashed";
      matched: boolean;
    }
  | {
      kind: "mirrormorph_third_distinct";
      matched: boolean;
    }
  | {
      kind: "first_corp_card_install";
      matched: boolean;
    }
  | {
      kind: "first_corp_root_install";
      matched: boolean;
    }
  | {
      kind: "first_remote_install_normal";
      matched: boolean;
    }
  | {
      kind: "first_agenda_scored_or_stolen";
      matched: boolean;
    }
  | {
      kind: "first_runner_stole_or_trashed";
      matched: boolean;
    }
  | {
      kind: "first_corp_card_trash";
      matched: boolean;
    }
  | {
      kind: "first_program_or_hardware_trash";
      matched: boolean;
    }
  | {
      kind: "first_access_trash";
      matched: boolean;
    }
  | {
      kind: "first_trash_matching_runner_id_faction";
      matched: boolean;
    }
  | {
      kind: "corp_flipped_first_operation_play";
      matched: boolean;
    }
  | {
      kind: "first_grip_or_stack_trash_batch";
      matched: boolean;
    }
  | {
      kind: "first_installed_trash";
      matched: boolean;
    }
  | {
      kind: "first_tag_this_turn";
      matched: boolean;
    }
  | {
      kind: "first_reveal_this_turn";
      matched: boolean;
    }
  | {
      kind: "first_credit_pool_empty";
      matched: boolean;
    }
  | {
      kind: "val_runner_triggers";
      family: ValRunnerTriggerFamily;
      /** Event ordinals to mark (1 = first, 2 = second, …). */
      ordinals: number[];
    }
  | {
      kind: "first_hardware_install";
      matched: boolean;
    }
  | {
      kind: "first_program_install";
      matched: boolean;
    }
  | {
      kind: "first_virus_install";
      matched: boolean;
    }
  | {
      kind: "val_successful_run_triggers";
      ordinals: number[];
    }
  | {
      kind: "first_run_begin";
      matched: boolean;
    }
  | {
      kind: "first_rd_run_begin";
      matched: boolean;
    }
  | {
      kind: "first_archives_run_begin";
      matched: boolean;
    }
  | {
      kind: "first_unsuccessful_run";
      matched: boolean;
    }
  | {
      kind: "first_successful_hq_run";
      matched: boolean;
    }
  | {
      kind: "first_successful_hq_or_rd_run";
      matched: boolean;
    }
  | {
      kind: "first_successful_central_run";
      matched: boolean;
    }
  | {
      kind: "first_successful_mark_run";
      matched: boolean;
    }
  | {
      kind: "daredevil_first_run_ice_gte";
      matched: boolean;
    }
  | {
      kind: "first_encounter_each_run";
      matched: boolean;
    }
  | {
      kind: "first_pass_ice";
      matched: boolean;
    }
  | {
      kind: "sisyphus_first_pass_rezzed_cg_or_sentry";
      matched: boolean;
    }
  | {
      kind: "pass_unrezzed_ice";
      matched: boolean;
    }
  | {
      kind: "pass_rezzed_ice";
      matched: boolean;
    }
  | {
      kind: "ice_on_pass";
      iceIds: string[];
    }
  | {
      kind: "pass_host";
      iceIds: string[];
    }
  | {
      kind: "pass_rezzed_ice_protecting_server";
      serverIds: string[];
    }
  | {
      kind: "encounter_end";
      iceIds: string[];
    }
  | {
      kind: "encounter_end_rezzed_this_turn";
      iceIds: string[];
    }
  | {
      kind: "encounter_end_not_fully_broken";
      iceIds: string[];
    }
  | {
      kind: "encounter_end_printed_subroutine_broken";
      iceIds: string[];
    }
  | {
      kind: "host_encounter";
      iceIds: string[];
    }
  | {
      kind: "encounter_rezzed_after_approach";
      matched: boolean;
    }
  | {
      kind: "approach_server";
      cardIds: string[];
    }
  | {
      kind: "pass_all_ice_protecting_server";
      serverIds: string[];
    }
  | {
      kind: "bypass";
      sourceIds: string[];
    }
  | {
      kind: "approach_ice";
      cardIds: string[];
    }
  | {
      kind: "first_successful_rd_run_end";
      matched: boolean;
    }
  | {
      kind: "successful_run_on_rd";
      cardIds: string[];
    }
  | {
      kind: "successful_run_end_once";
      cardIds: string[];
    }
  | {
      kind: "successful_run_end";
      cardIds: string[];
    }
  | {
      kind: "other_server_success";
      cardIds: string[];
    }
  | {
      kind: "successful_run";
      cardIds: string[];
    };

/** Evaluate one predicate against the current checkpoint diff (CR 10.3.1a). */
export function evaluateTriggerPredicate(
  state: GameState,
  diff: CheckpointDiff,
  predicate: TriggerPredicate,
): TriggerPredicateMatch {
  switch (predicate.kind) {
    case "advancement_increased_from_zero":
      return {
        kind: "advancement_increased_from_zero",
        cardIds: [...diff.advancementIncreasedFromZeroIds],
      };
    case "runner_tags_increased_from_zero": {
      const prev = state.previousCheckpointSnapshot?.facts;
      const matched =
        diff.runnerTagsDelta > 0 &&
        prev !== undefined &&
        (prev.runnerTags ?? 0) === 0;
      return { kind: "runner_tags_increased_from_zero", matched };
    }
    case "exposed_since_previous":
      return {
        kind: "exposed_since_previous",
        cardIds: [...diff.exposedIds],
      };
    case "entered_draw_set_aside": {
      const drawn = drawnSetAsideFromZoneDiff(state, diff);
      if (!drawn) {
        return { kind: "entered_draw_set_aside", side: null, cardIds: [] };
      }
      return {
        kind: "entered_draw_set_aside",
        side: drawn.side,
        cardIds: drawn.cardIds,
      };
    }
    case "entered_remote_install":
      return {
        kind: "entered_remote_install",
        entries: remoteInstallEntriesFromZoneDiff(state, diff),
      };
    case "entered_breached_root": {
      const root = breachedRootEntriesFromZoneDiff(state, diff);
      return {
        kind: "entered_breached_root",
        serverId: root?.serverId ?? null,
        cardIds: root?.cardIds ?? [],
      };
    }
    case "seidr_first_click_during_run": {
      void diff;
      const matched =
        Boolean(state.run) &&
        state.turn.seidrClickMetPending &&
        !state.turn.seidrClickDuringRunFiredThisTurn;
      return { kind: "seidr_first_click_during_run", matched };
    }
    case "first_bad_publicity_take": {
      void diff;
      const matched =
        state.turn.firstBadPublicityMetPending &&
        !state.turn.firstBadPublicityTakeUsedThisTurn;
      return { kind: "first_bad_publicity_take", matched };
    }
    case "each_corp_bad_publicity_take": {
      void diff;
      return {
        kind: "each_corp_bad_publicity_take",
        count: state.turn.corpBadPublicityTakeEventsPending,
      };
    }
    case "first_event_trashed": {
      void diff;
      const matched =
        state.turn.firstEventTrashedMetPending &&
        !state.turn.firstEventTrashedUsedThisTurn;
      return { kind: "first_event_trashed", matched };
    }
    case "mirrormorph_third_distinct": {
      void diff;
      const matched =
        state.turn.mirrormorphThirdDistinctMetPending &&
        !state.turn.mirrormorphThirdDistinctFiredThisTurn;
      return { kind: "mirrormorph_third_distinct", matched };
    }
    case "first_corp_card_install": {
      void diff;
      const matched =
        state.turn.firstCorpCardInstallMetPending &&
        !state.turn.firstCorpCardInstallUsedThisTurn;
      return { kind: "first_corp_card_install", matched };
    }
    case "first_corp_root_install": {
      void diff;
      const matched =
        state.turn.firstCorpRootInstallMetPending &&
        !state.turn.firstCorpRootInstallUsedThisTurn;
      return { kind: "first_corp_root_install", matched };
    }
    case "first_remote_install_normal": {
      void diff;
      return {
        kind: "first_remote_install_normal",
        matched: state.turn.firstRemoteInstallMetPending,
      };
    }
    case "first_agenda_scored_or_stolen": {
      void diff;
      const matched =
        state.turn.firstAgendaScoredOrStolenMetPending &&
        !state.turn.firstAgendaScoredOrStolenUsedThisTurn;
      return { kind: "first_agenda_scored_or_stolen", matched };
    }
    case "first_runner_stole_or_trashed": {
      void diff;
      const matched =
        state.turn.firstRunnerStoleOrTrashedMetPending &&
        !state.turn.firstRunnerStoleOrTrashedUsedThisTurn;
      return { kind: "first_runner_stole_or_trashed", matched };
    }
    case "first_corp_card_trash": {
      void diff;
      const matched =
        state.turn.firstCorpCardTrashMetPending &&
        !state.turn.firstCorpCardTrashUsedThisTurn;
      return { kind: "first_corp_card_trash", matched };
    }
    case "first_program_or_hardware_trash": {
      void diff;
      const matched =
        state.turn.firstProgramOrHardwareTrashMetPending &&
        !state.turn.firstProgramOrHardwareTrashUsedThisTurn;
      return { kind: "first_program_or_hardware_trash", matched };
    }
    case "first_access_trash": {
      void diff;
      const matched =
        state.turn.firstAccessTrashMetPending &&
        !state.turn.firstAccessTrashUsedThisTurn;
      return { kind: "first_access_trash", matched };
    }
    case "first_trash_matching_runner_id_faction": {
      void diff;
      const matched =
        state.turn.firstTrashMatchingRunnerIdentityFactionMetPending &&
        !state.turn.firstTrashMatchingRunnerIdentityFactionUsedThisTurn;
      return { kind: "first_trash_matching_runner_id_faction", matched };
    }
    case "corp_flipped_first_operation_play": {
      void diff;
      const matched =
        state.turn.corpFlippedIdentityFirstOpMetPending &&
        !state.turn.corpFlippedIdentityFirstOpUsedThisTurn;
      return { kind: "corp_flipped_first_operation_play", matched };
    }
    case "first_grip_or_stack_trash_batch": {
      void diff;
      const matched =
        state.turn.bufferDriveGripStackTrashMetPending &&
        !state.turn.bufferDriveGripStackTrashUsedThisTurn;
      return { kind: "first_grip_or_stack_trash_batch", matched };
    }
    case "first_installed_trash": {
      void diff;
      const matched =
        state.turn.firstInstalledTrashMetPending &&
        !state.turn.mlReaverDrawUsedThisTurn;
      return { kind: "first_installed_trash", matched };
    }
    case "first_tag_this_turn": {
      void diff;
      const matched =
        state.turn.firstTagThisTurnMetPending &&
        !state.turn.firstTagThisTurnUsedThisTurn;
      return { kind: "first_tag_this_turn", matched };
    }
    case "first_reveal_this_turn": {
      void diff;
      const matched =
        state.turn.firstRevealMetPending &&
        !state.turn.firstRevealCreditUsedThisTurn;
      return { kind: "first_reveal_this_turn", matched };
    }
    case "first_credit_pool_empty": {
      void diff;
      const matched =
        state.turn.firstCreditPoolEmptyMetPending &&
        !state.turn.runnerCreditPoolEmptyFiredThisTurn;
      return { kind: "first_credit_pool_empty", matched };
    }
    case "val_runner_triggers": {
      void diff;
      const family = predicate.family;
      let ordinals: number[];
      switch (family) {
        case "damage":
          ordinals = [...(state.turn.valDamageTriggerPendingCounts ?? [])];
          break;
        case "install":
          ordinals = [...(state.turn.valInstallTriggerPendingCounts ?? [])];
          break;
        case "click_loss":
          ordinals = [...(state.turn.valClickLossTriggerPendingCounts ?? [])];
          break;
        case "basic_click_draw":
          ordinals = [
            ...(state.turn.valBasicClickDrawTriggerPendingCounts ?? []),
          ];
          break;
      }
      return {
        kind: "val_runner_triggers",
        family,
        ordinals,
      };
    }
    case "first_hardware_install": {
      void diff;
      const matched =
        state.turn.firstHardwareInstallMetPending &&
        !state.turn.firstHardwareInstallUsedThisTurn;
      return { kind: "first_hardware_install", matched };
    }
    case "first_program_install": {
      void diff;
      const matched =
        state.turn.firstProgramInstallMetPending &&
        !state.turn.firstProgramInstallUsedThisTurn;
      return { kind: "first_program_install", matched };
    }
    case "first_virus_install": {
      void diff;
      const matched =
        state.turn.firstVirusInstallMetPending &&
        !state.turn.firstVirusInstallUsedThisTurn;
      return { kind: "first_virus_install", matched };
    }
    case "val_successful_run_triggers": {
      void diff;
      return {
        kind: "val_successful_run_triggers",
        ordinals: [...(state.turn.valSuccessfulRunTriggerPendingCounts ?? [])],
      };
    }
    case "first_run_begin": {
      void diff;
      const matched =
        state.turn.firstRunBeginMetPending &&
        !state.turn.runBeginThisTurnUsed;
      return { kind: "first_run_begin", matched };
    }
    case "first_rd_run_begin": {
      void diff;
      const matched = state.turn.firstRdRunBeginMetPending;
      return { kind: "first_rd_run_begin", matched };
    }
    case "first_archives_run_begin": {
      void diff;
      const matched = state.turn.firstArchivesRunBeginMetPending;
      return { kind: "first_archives_run_begin", matched };
    }
    case "first_unsuccessful_run": {
      void diff;
      const matched = state.turn.firstUnsuccessfulRunMetPending;
      return { kind: "first_unsuccessful_run", matched };
    }
    case "first_successful_hq_run": {
      void diff;
      const matched = state.turn.firstSuccessfulHqRunMetPending;
      return { kind: "first_successful_hq_run", matched };
    }
    case "first_successful_hq_or_rd_run": {
      void diff;
      const matched = state.turn.firstSuccessfulHqOrRdRunMetPending;
      return { kind: "first_successful_hq_or_rd_run", matched };
    }
    case "first_successful_central_run": {
      void diff;
      const matched = state.turn.firstSuccessfulCentralRunMetPending;
      return { kind: "first_successful_central_run", matched };
    }
    case "first_successful_mark_run": {
      void diff;
      const matched = state.turn.firstSuccessfulMarkRunMetPending;
      return { kind: "first_successful_mark_run", matched };
    }
    case "daredevil_first_run_ice_gte": {
      void diff;
      const matched =
        state.turn.daredevilDrawMetPending &&
        !state.turn.daredevilDrawUsedThisTurn;
      return { kind: "daredevil_first_run_ice_gte", matched };
    }
    case "first_encounter_each_run": {
      void diff;
      const matched = Boolean(state.run?.firstEncounterEachRunMetPending);
      return { kind: "first_encounter_each_run", matched };
    }
    case "first_pass_ice": {
      void diff;
      const matched =
        state.turn.firstPassIceMetPending &&
        !state.turn.bmFirstPassIceUsedThisTurn;
      return { kind: "first_pass_ice", matched };
    }
    case "sisyphus_first_pass_rezzed_cg_or_sentry": {
      void diff;
      const matched =
        state.turn.sisyphusPassMetPending &&
        !state.turn.sisyphusPassUsedThisTurn;
      return { kind: "sisyphus_first_pass_rezzed_cg_or_sentry", matched };
    }
    case "pass_unrezzed_ice": {
      void diff;
      return {
        kind: "pass_unrezzed_ice",
        matched: state.turn.passUnrezzedIceMetPending,
      };
    }
    case "pass_rezzed_ice": {
      void diff;
      return {
        kind: "pass_rezzed_ice",
        matched: state.turn.passRezzedIceMetPending,
      };
    }
    case "ice_on_pass": {
      void diff;
      return {
        kind: "ice_on_pass",
        iceIds: [...(state.turn.passIceOnPassPendingIds ?? [])],
      };
    }
    case "pass_host": {
      void diff;
      return {
        kind: "pass_host",
        iceIds: [...(state.turn.passHostPendingIceIds ?? [])],
      };
    }
    case "pass_rezzed_ice_protecting_server": {
      void diff;
      return {
        kind: "pass_rezzed_ice_protecting_server",
        serverIds: [...(state.turn.passProtectingServerPendingIds ?? [])],
      };
    }
    case "encounter_end": {
      void diff;
      return {
        kind: "encounter_end",
        iceIds: [...(state.turn.encounterEndPendingIds ?? [])],
      };
    }
    case "encounter_end_rezzed_this_turn": {
      void diff;
      return {
        kind: "encounter_end_rezzed_this_turn",
        iceIds: [...(state.turn.encounterEndRezzedThisTurnPendingIds ?? [])],
      };
    }
    case "encounter_end_not_fully_broken": {
      void diff;
      return {
        kind: "encounter_end_not_fully_broken",
        iceIds: [...(state.turn.encounterEndNotFullyBrokenPendingIds ?? [])],
      };
    }
    case "encounter_end_printed_subroutine_broken": {
      void diff;
      return {
        kind: "encounter_end_printed_subroutine_broken",
        iceIds: [...(state.turn.encounterEndPrintedSubBrokenPendingIds ?? [])],
      };
    }
    case "host_encounter": {
      void diff;
      return {
        kind: "host_encounter",
        iceIds: [...(state.turn.hostEncounterPendingIceIds ?? [])],
      };
    }
    case "encounter_rezzed_after_approach": {
      void diff;
      return {
        kind: "encounter_rezzed_after_approach",
        matched: state.turn.encounterRezzedAfterApproachMetPending,
      };
    }
    case "approach_server": {
      void diff;
      return {
        kind: "approach_server",
        cardIds: [...(state.turn.approachServerPendingIds ?? [])],
      };
    }
    case "pass_all_ice_protecting_server": {
      void diff;
      return {
        kind: "pass_all_ice_protecting_server",
        serverIds: [...(state.turn.passAllIceProtectingServerPendingIds ?? [])],
      };
    }
    case "bypass": {
      void diff;
      return {
        kind: "bypass",
        sourceIds: [...(state.turn.bypassPendingSourceIds ?? [])],
      };
    }
    case "approach_ice": {
      void diff;
      return {
        kind: "approach_ice",
        cardIds: [...(state.turn.approachIcePendingIds ?? [])],
      };
    }
    case "first_successful_rd_run_end": {
      void diff;
      return {
        kind: "first_successful_rd_run_end",
        matched:
          state.turn.firstSuccessfulRdRunEndMetPending &&
          !state.turn.firstSuccessfulRdRunEndUsedThisTurn,
      };
    }
    case "successful_run_on_rd": {
      void diff;
      return {
        kind: "successful_run_on_rd",
        cardIds: [...(state.turn.successfulRunOnRdPendingIds ?? [])],
      };
    }
    case "successful_run_end_once": {
      void diff;
      return {
        kind: "successful_run_end_once",
        cardIds: [...(state.turn.successfulRunEndOncePendingIds ?? [])],
      };
    }
    case "successful_run_end": {
      void diff;
      return {
        kind: "successful_run_end",
        cardIds: [...(state.turn.successfulRunEndPendingIds ?? [])],
      };
    }
    case "other_server_success": {
      void diff;
      return {
        kind: "other_server_success",
        cardIds: [...(state.turn.otherServerSuccessPendingIds ?? [])],
      };
    }
    case "successful_run": {
      void diff;
      return {
        kind: "successful_run",
        cardIds: [...(state.turn.successfulRunPendingIds ?? [])],
      };
    }
  }
}

/**
 * Cards that entered the draw set-aside zone since the previous checkpoint
 * (CR 8.4.5a). Shared by the predicate evaluator and callers that need the
 * same shape without going through `evaluateTriggerPredicate`.
 */
export function drawnSetAsideFromZoneDiff(
  state: GameState,
  diff: CheckpointDiff,
): { side: Side; cardIds: string[] } | null {
  const prevZones = state.previousCheckpointSnapshot?.facts.cardZones;
  if (!prevZones) return null;
  const corpIds: string[] = [];
  const runnerIds: string[] = [];
  for (const id of diff.zoneChangedIds) {
    const card = state.cards[id];
    if (!card || card.setAsideGroupId !== "draw") continue;
    const prev = prevZones[id];
    if (card.zone === "corp:set-aside" && prev !== "corp:set-aside") {
      corpIds.push(id);
    }
    if (card.zone === "runner:set-aside" && prev !== "runner:set-aside") {
      runnerIds.push(id);
    }
  }
  if (corpIds.length > 0) return { side: "corp", cardIds: corpIds };
  if (runnerIds.length > 0) return { side: "runner", cardIds: runnerIds };
  return null;
}

export const PREDICATE_ADVANCEMENT_FROM_ZERO: TriggerPredicate = {
  kind: "advancement_increased_from_zero",
};

export const PREDICATE_RUNNER_TAGS_FROM_ZERO: TriggerPredicate = {
  kind: "runner_tags_increased_from_zero",
};

export const PREDICATE_EXPOSED_SINCE_PREVIOUS: TriggerPredicate = {
  kind: "exposed_since_previous",
};

export const PREDICATE_ENTERED_DRAW_SET_ASIDE: TriggerPredicate = {
  kind: "entered_draw_set_aside",
};

/** Cards that entered a remote root/ice zone since the previous checkpoint. */
export function remoteInstallEntriesFromZoneDiff(
  state: GameState,
  diff: CheckpointDiff,
): Array<{ cardId: string; serverId: ServerId }> {
  const prevZones = state.previousCheckpointSnapshot?.facts.cardZones;
  if (!prevZones) return [];
  const entries: Array<{ cardId: string; serverId: ServerId }> = [];
  for (const id of diff.zoneChangedIds) {
    const zone = state.cards[id]?.zone ?? "";
    const match = /^server:(remote-\d+):(root|ice)$/.exec(zone);
    if (!match) continue;
    if (prevZones[id] === zone) continue;
    entries.push({ cardId: id, serverId: match[1] as ServerId });
  }
  return entries;
}

/**
 * Cards that entered the attacked server's root during a breach structure
 * (CR 10.3.1j). Empty when not breaching or there is no prior baseline.
 */
export function breachedRootEntriesFromZoneDiff(
  state: GameState,
  diff: CheckpointDiff,
): { serverId: ServerId; cardIds: string[] } | null {
  const run = state.run;
  if (!run || state.timing.structure !== "breach") return null;
  if (!state.previousCheckpointSnapshot) return null;
  const rootZone = `server:${run.attackedServerId}:root`;
  const cardIds = diff.zoneChangedIds.filter(
    (id) => state.cards[id]?.zone === rootZone,
  );
  return { serverId: run.attackedServerId, cardIds };
}

export const PREDICATE_ENTERED_REMOTE_INSTALL: TriggerPredicate = {
  kind: "entered_remote_install",
};

export const PREDICATE_ENTERED_BREACHED_ROOT: TriggerPredicate = {
  kind: "entered_breached_root",
};

export const PREDICATE_SEIDR_FIRST_CLICK_DURING_RUN: TriggerPredicate = {
  kind: "seidr_first_click_during_run",
};

export const PREDICATE_FIRST_BAD_PUBLICITY_TAKE: TriggerPredicate = {
  kind: "first_bad_publicity_take",
};

export const PREDICATE_EACH_CORP_BAD_PUBLICITY_TAKE: TriggerPredicate = {
  kind: "each_corp_bad_publicity_take",
};

export const PREDICATE_FIRST_EVENT_TRASHED: TriggerPredicate = {
  kind: "first_event_trashed",
};

export const PREDICATE_MIRRORMORPH_THIRD_DISTINCT: TriggerPredicate = {
  kind: "mirrormorph_third_distinct",
};

export const PREDICATE_FIRST_CORP_CARD_INSTALL: TriggerPredicate = {
  kind: "first_corp_card_install",
};

export const PREDICATE_FIRST_CORP_ROOT_INSTALL: TriggerPredicate = {
  kind: "first_corp_root_install",
};

export const PREDICATE_FIRST_REMOTE_INSTALL_NORMAL: TriggerPredicate = {
  kind: "first_remote_install_normal",
};

export const PREDICATE_FIRST_AGENDA_SCORED_OR_STOLEN: TriggerPredicate = {
  kind: "first_agenda_scored_or_stolen",
};

export const PREDICATE_FIRST_RUNNER_STOLE_OR_TRASHED: TriggerPredicate = {
  kind: "first_runner_stole_or_trashed",
};

export const PREDICATE_FIRST_CORP_CARD_TRASH: TriggerPredicate = {
  kind: "first_corp_card_trash",
};

export const PREDICATE_FIRST_PROGRAM_OR_HARDWARE_TRASH: TriggerPredicate = {
  kind: "first_program_or_hardware_trash",
};

export const PREDICATE_FIRST_ACCESS_TRASH: TriggerPredicate = {
  kind: "first_access_trash",
};

export const PREDICATE_FIRST_TRASH_MATCHING_RUNNER_ID_FACTION: TriggerPredicate =
  {
    kind: "first_trash_matching_runner_id_faction",
  };

export const PREDICATE_CORP_FLIPPED_FIRST_OPERATION_PLAY: TriggerPredicate = {
  kind: "corp_flipped_first_operation_play",
};

export const PREDICATE_FIRST_GRIP_OR_STACK_TRASH_BATCH: TriggerPredicate = {
  kind: "first_grip_or_stack_trash_batch",
};

export const PREDICATE_FIRST_INSTALLED_TRASH: TriggerPredicate = {
  kind: "first_installed_trash",
};

export const PREDICATE_FIRST_TAG_THIS_TURN: TriggerPredicate = {
  kind: "first_tag_this_turn",
};

export const PREDICATE_FIRST_REVEAL_THIS_TURN: TriggerPredicate = {
  kind: "first_reveal_this_turn",
};

export const PREDICATE_FIRST_CREDIT_POOL_EMPTY: TriggerPredicate = {
  kind: "first_credit_pool_empty",
};

export function predicateValRunnerTriggers(
  family: ValRunnerTriggerFamily,
): TriggerPredicate {
  return { kind: "val_runner_triggers", family };
}

export const PREDICATE_VAL_DAMAGE_TRIGGERS: TriggerPredicate =
  predicateValRunnerTriggers("damage");

export const PREDICATE_VAL_INSTALL_TRIGGERS: TriggerPredicate =
  predicateValRunnerTriggers("install");

export const PREDICATE_VAL_CLICK_LOSS_TRIGGERS: TriggerPredicate =
  predicateValRunnerTriggers("click_loss");

export const PREDICATE_VAL_BASIC_CLICK_DRAW_TRIGGERS: TriggerPredicate =
  predicateValRunnerTriggers("basic_click_draw");

export const PREDICATE_FIRST_HARDWARE_INSTALL: TriggerPredicate = {
  kind: "first_hardware_install",
};

export const PREDICATE_FIRST_PROGRAM_INSTALL: TriggerPredicate = {
  kind: "first_program_install",
};

export const PREDICATE_FIRST_VIRUS_INSTALL: TriggerPredicate = {
  kind: "first_virus_install",
};

export const PREDICATE_VAL_SUCCESSFUL_RUN_TRIGGERS: TriggerPredicate = {
  kind: "val_successful_run_triggers",
};

export const PREDICATE_FIRST_RUN_BEGIN: TriggerPredicate = {
  kind: "first_run_begin",
};

export const PREDICATE_FIRST_RD_RUN_BEGIN: TriggerPredicate = {
  kind: "first_rd_run_begin",
};

export const PREDICATE_FIRST_ARCHIVES_RUN_BEGIN: TriggerPredicate = {
  kind: "first_archives_run_begin",
};

export const PREDICATE_FIRST_UNSUCCESSFUL_RUN: TriggerPredicate = {
  kind: "first_unsuccessful_run",
};

export const PREDICATE_FIRST_SUCCESSFUL_HQ_RUN: TriggerPredicate = {
  kind: "first_successful_hq_run",
};

export const PREDICATE_FIRST_SUCCESSFUL_HQ_OR_RD_RUN: TriggerPredicate = {
  kind: "first_successful_hq_or_rd_run",
};

export const PREDICATE_FIRST_SUCCESSFUL_CENTRAL_RUN: TriggerPredicate = {
  kind: "first_successful_central_run",
};

export const PREDICATE_FIRST_SUCCESSFUL_MARK_RUN: TriggerPredicate = {
  kind: "first_successful_mark_run",
};

export const PREDICATE_DAREDEVIL_FIRST_RUN_ICE_GTE: TriggerPredicate = {
  kind: "daredevil_first_run_ice_gte",
};

export const PREDICATE_FIRST_ENCOUNTER_EACH_RUN: TriggerPredicate = {
  kind: "first_encounter_each_run",
};

export const PREDICATE_FIRST_PASS_ICE: TriggerPredicate = {
  kind: "first_pass_ice",
};

export const PREDICATE_SISYPHUS_FIRST_PASS_REZZED_CG_OR_SENTRY: TriggerPredicate =
  {
    kind: "sisyphus_first_pass_rezzed_cg_or_sentry",
  };

export const PREDICATE_PASS_UNREZZED_ICE: TriggerPredicate = {
  kind: "pass_unrezzed_ice",
};

export const PREDICATE_PASS_REZZED_ICE: TriggerPredicate = {
  kind: "pass_rezzed_ice",
};

export const PREDICATE_ICE_ON_PASS: TriggerPredicate = {
  kind: "ice_on_pass",
};

export const PREDICATE_PASS_HOST: TriggerPredicate = {
  kind: "pass_host",
};

export const PREDICATE_PASS_REZZED_ICE_PROTECTING_SERVER: TriggerPredicate = {
  kind: "pass_rezzed_ice_protecting_server",
};

export const PREDICATE_ENCOUNTER_END: TriggerPredicate = {
  kind: "encounter_end",
};

export const PREDICATE_ENCOUNTER_END_REZZED_THIS_TURN: TriggerPredicate = {
  kind: "encounter_end_rezzed_this_turn",
};

export const PREDICATE_ENCOUNTER_END_NOT_FULLY_BROKEN: TriggerPredicate = {
  kind: "encounter_end_not_fully_broken",
};

export const PREDICATE_ENCOUNTER_END_PRINTED_SUBROUTINE_BROKEN: TriggerPredicate =
  {
    kind: "encounter_end_printed_subroutine_broken",
  };

export const PREDICATE_HOST_ENCOUNTER: TriggerPredicate = {
  kind: "host_encounter",
};

export const PREDICATE_ENCOUNTER_REZZED_AFTER_APPROACH: TriggerPredicate = {
  kind: "encounter_rezzed_after_approach",
};

export const PREDICATE_APPROACH_SERVER: TriggerPredicate = {
  kind: "approach_server",
};

export const PREDICATE_PASS_ALL_ICE_PROTECTING_SERVER: TriggerPredicate = {
  kind: "pass_all_ice_protecting_server",
};

export const PREDICATE_BYPASS: TriggerPredicate = {
  kind: "bypass",
};

export const PREDICATE_APPROACH_ICE: TriggerPredicate = {
  kind: "approach_ice",
};

export const PREDICATE_FIRST_SUCCESSFUL_RD_RUN_END: TriggerPredicate = {
  kind: "first_successful_rd_run_end",
};

export const PREDICATE_SUCCESSFUL_RUN_ON_RD: TriggerPredicate = {
  kind: "successful_run_on_rd",
};

export const PREDICATE_SUCCESSFUL_RUN_END_ONCE: TriggerPredicate = {
  kind: "successful_run_end_once",
};

export const PREDICATE_SUCCESSFUL_RUN_END: TriggerPredicate = {
  kind: "successful_run_end",
};

export const PREDICATE_OTHER_SERVER_SUCCESS: TriggerPredicate = {
  kind: "other_server_success",
};

export const PREDICATE_SUCCESSFUL_RUN: TriggerPredicate = {
  kind: "successful_run",
};

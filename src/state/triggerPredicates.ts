/**
 * Declarative conditional triggers over checkpoint facts/diff (CR 9.6.6 /
 * 9.6.6a / 10.3.1a). Full CR fidelity phase 2: predicates are data, not hook
 * names. Expand kinds as families migrate onto the scanner.
 */
import type { CheckpointDiff } from "./checkpointSnapshot.js";
import type { GameState, ServerId, Side } from "./types.js";

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

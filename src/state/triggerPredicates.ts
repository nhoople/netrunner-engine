/**
 * Declarative conditional triggers over checkpoint facts/diff (CR 9.6.6 /
 * 9.6.6a / 10.3.1a). Full CR fidelity phase 2: predicates are data, not hook
 * names. Expand kinds as families migrate onto the scanner.
 */
import type { CheckpointDiff } from "./checkpointSnapshot.js";
import type { GameState, Side } from "./types.js";

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

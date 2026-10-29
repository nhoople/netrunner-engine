/**
 * Declarative conditional triggers over checkpoint facts/diff (CR 9.6.6 /
 * 9.6.6a / 10.3.1a). Full CR fidelity phase 2: predicates are data, not hook
 * names. Expand kinds as families migrate onto the scanner.
 */
import type { CheckpointDiff } from "./checkpointSnapshot.js";
import type { GameState } from "./types.js";

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
  }
}

export const PREDICATE_ADVANCEMENT_FROM_ZERO: TriggerPredicate = {
  kind: "advancement_increased_from_zero",
};

export const PREDICATE_RUNNER_TAGS_FROM_ZERO: TriggerPredicate = {
  kind: "runner_tags_increased_from_zero",
};

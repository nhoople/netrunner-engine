/**
 * An agenda's printed "when scored" ability as one effect (CR 9.6.14c). The
 * score action, 24/7 News Cycle and Bifrost Array all resolve it from here,
 * so an effect that resolves the ability gets everything the score would
 * (CR 9.6.14d). Some of it is stored in card fields rather than `onScore`.
 */
import type { Effect } from "../../effects/ir/effect.js";
import type { CardInstance } from "../types/card.js";

export function whenScoredEffect(
  card: CardInstance,
  /**
   * Whether the Runner was tagged when the agenda was scored. Market
   * Research's tag is part of its trigger condition, checked when the
   * condition occurs (CR 9.6.5c). Omitted when an effect resolves the
   * ability now (24/7 News Cycle, Bifrost Array): the game state is checked
   * as it resolves (CR 9.6.14d).
   */
  runnerTaggedWhenScored?: boolean,
): Effect | undefined {
  const parts: Effect[] = [];
  if (card.onScore) parts.push(card.onScore);
  const badPublicity = card.badPublicityOnScore ?? 0;
  if (badPublicity > 0) {
    // Hostile Takeover: "gain 7[credit] and take 1 bad publicity".
    parts.push({
      op: "do",
      action: { kind: "give_bad_publicity", amount: badPublicity },
    });
  }
  if (
    card.onScoreIfRunnerTaggedPlaceAgendaCounter &&
    runnerTaggedWhenScored !== false
  ) {
    // Market Research: "If the Runner is tagged when you score Market
    // Research, place 1 agenda counter on it."
    const place: Effect = {
      op: "do",
      action: { kind: "add_agenda_counter", amount: 1 },
    };
    parts.push(
      runnerTaggedWhenScored
        ? place
        : { op: "if", cond: { op: "runner_tagged" }, then: place },
    );
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  // One printed sentence, so one instruction (CR 9.11.3).
  return { op: "seq", effects: parts, oneInstruction: true };
}

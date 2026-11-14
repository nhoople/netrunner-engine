import { syncPaidAbilitiesFromRecords } from "../effects/abilityRecord.js";
import { CR } from "../timing/labels.js";
import { abilitiesSuppressed } from "./abilities.js";
import { costBeginsWithClick } from "./costs.js";
import { log } from "./createGame.js";
import type { Action, GameState, PaidAbility, RuleCite } from "./types.js";

/**
 * Corp action tracking (Wage Workers + MirrorMorph). `actionKind` names the
 * action: the basic action, or the ability and the card it is on. Actions
 * with the same name are the same action (CR 5.2.5a, 5.2.5b).
 */
export function noteCorpActionType(state: GameState, actionKind: string): void {
  if (state.activeSide !== "corp") return;
  // The extra action was consumed when it was taken (takeExtraDifferentAction).
  state.turn.extraDifferentAction = null;
  const counts = state.turn.corpActionTypeCounts;
  counts[actionKind] = (counts[actionKind] ?? 0) + 1;
  const n = counts[actionKind]!;

  // Wage Workers: third of the *same* kind → gain 1 click.
  if (n === 3) {
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.root, ...server.ice]) {
        const card = state.cards[id];
        if (!card?.wageWorkersTrackActions || !card.rezzed) continue;
        // CR 9.12.1d — blanked continuous click-gain does not fire.
        if (abilitiesSuppressed(state, id)) continue;
        state.corp.clicks += 1;
        log(
          state,
          `${card.title} — third ${actionKind} this turn → gain 1 click.`,
        );
      }
    }
  }

  // MirrorMorph: if the first three actions are all different, queue for
  // the next 10.3.1a scanner pass (phase 3). Wage Workers stay immediate.
  const order = state.turn.corpActionKindsInOrderThisTurn ?? [];
  if (!order.includes(actionKind)) {
    order.push(actionKind);
    state.turn.corpActionKindsInOrderThisTurn = order;
  }
  const sequence = state.turn.corpActionSequenceThisTurn ?? [];
  sequence.push(actionKind);
  state.turn.corpActionSequenceThisTurn = sequence;
  // Only the first three actions count, and they must all be different. A
  // repeat among them rules the ability out for the turn (CR 5.2.5b.ex1).
  if (
    sequence.length > 3 ||
    state.turn.mirrormorphThirdDistinctFiredThisTurn ||
    state.turn.mirrormorphThirdDistinctMetPending
  ) {
    return;
  }
  if (new Set(sequence).size < sequence.length) {
    state.turn.mirrormorphThirdDistinctFiredThisTurn = true;
    return;
  }
  if (sequence.length === 3) {
    const idCard = state.cards[state.corp.identityId];
    if (
      idCard?.mirrormorphOnThirdDistinctAction &&
      !abilitiesSuppressed(state, idCard.id)
    ) {
      state.turn.mirrormorphThirdDistinctMetPending = true;
    }
  }
}

/**
 * The name `noteCorpActionType` gives the action an intent takes from the
 * Corp's action window, or null when the intent is not a Corp action there.
 */
export function corpActionKindForIntent(
  state: GameState,
  action: Action,
): string | null {
  if (state.activeSide !== "corp" || state.timingKey !== "corp.takeAction") {
    return null;
  }
  switch (action.type) {
    case "basic_gain_credit":
      return "basic_gain";
    case "basic_draw":
      return "basic_draw";
    case "basic_install":
      return "basic_install";
    case "play_operation":
      return "play_operation";
    case "advance":
      return "basic_advance";
    case "basic_trash_resource":
      return "basic_trash_resource";
    case "basic_purge_virus":
      return "basic_purge";
    case "use_paid_ability": {
      const card = state.cards[action.cardId];
      const ability = card
        ? (syncPaidAbilitiesFromRecords(card) as unknown as PaidAbility[]).find(
            (a) => a.id === action.abilityId,
          )
        : undefined;
      if (!ability || !costBeginsWithClick(ability)) return null;
      return `use_paid_ability:${action.cardId}:${action.abilityId}`;
    }
    case "use_identity_ability": {
      const idCard = state.cards[state.corp.identityId];
      const ability = idCard
        ? (syncPaidAbilitiesFromRecords(idCard) as unknown as PaidAbility[]).find(
            (a) => a.id === action.abilityId,
          )
        : undefined;
      if (!ability || !costBeginsWithClick(ability)) return null;
      return `use_identity_ability:${action.abilityId}`;
    }
    default:
      return null;
  }
}

/**
 * MirrorMorph: "take another different action, paying [click] less". The
 * reward resolves in the reaction window after the third action (CR 5.2.2d),
 * and the Corp takes the action as part of it: once the choice is made, the
 * action window opens before any paid ability window (see apply.ts). The
 * Corp gets [click] that only this action can use: a [click] action costs
 * nothing, and purge costs two.
 * Outside the Corp's action phase the Corp does nothing (CR 5.2.4).
 */
export function beginExtraDifferentAction(
  state: GameState,
  sourceId: string,
): void {
  const source = state.cards[sourceId];
  const title = source?.title ?? "Ability";
  if (state.activeSide !== "corp" || state.turnPhase !== "corp_action") {
    log(
      state,
      `${title} — no action outside the Corp's action phase (CR ${CR.actionsOutsidePhase.number}).`,
    );
    return;
  }
  const differentFrom = [
    ...new Set((state.turn.corpActionSequenceThisTurn ?? []).slice(0, 3)),
  ];
  state.turn.extraDifferentAction = { sourceId, differentFrom };
  state.corp.clicks += 1;
  log(
    state,
    `${title} — the Corp takes another action, different from its first three (CR ${CR.differentActions.number}), paying [click] less.`,
  );
}

/**
 * No different action can be taken: the Corp cannot pay for one, so the
 * reward does nothing (CR 1.16.1). Take back the click it was given.
 */
export function abandonExtraDifferentAction(state: GameState): void {
  const pending = state.turn.extraDifferentAction;
  if (!pending) return;
  state.turn.extraDifferentAction = null;
  state.corp.clicks = Math.max(0, state.corp.clicks - 1);
  log(
    state,
    `${state.cards[pending.sourceId]?.title ?? "Ability"} — no different action can be taken; nothing happens (CR 1.16.1).`,
  );
}

/** Why the Corp cannot take this action as the extra different action. */
export function extraDifferentActionRefusal(
  state: GameState,
  action: Action,
): { error: string; cites: RuleCite[] } | null {
  const pending = state.turn.extraDifferentAction;
  if (!pending) return null;
  const kind = corpActionKindForIntent(state, action);
  if (!kind || !pending.differentFrom.includes(kind)) return null;
  return {
    error:
      "This action must be different from the first three actions this turn (CR 5.2.5b).",
    cites: [CR.differentActions],
  };
}

/**
 * Called before a Corp action resolves. Refuses an action that repeats one
 * of the first three; otherwise the extra action is being taken, and the
 * click it was given pays for it.
 */
export function takeExtraDifferentAction(
  state: GameState,
  action: Action,
): { error: string; cites: RuleCite[] } | null {
  const refusal = extraDifferentActionRefusal(state, action);
  if (refusal) return refusal;
  if (state.turn.extraDifferentAction && corpActionKindForIntent(state, action)) {
    state.turn.extraDifferentAction = null;
  }
  return null;
}

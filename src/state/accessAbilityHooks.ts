/**
 * Access-step conditionals. Notes queues for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type AccessAbilityPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  controller: "corp" | "runner";
  mandatory: boolean;
  logLine: string;
};

function pushMark(state: GameState, mark: AccessAbilityPendingMark): void {
  if (!state.turn.accessAbilityPending) {
    state.turn.accessAbilityPending = [];
  }
  const q = state.turn.accessAbilityPending;
  if (
    q.some(
      (m) =>
        m.cardId === mark.cardId &&
        m.effectKey === mark.effectKey &&
        m.abilityKey === mark.abilityKey,
    )
  ) {
    return;
  }
  q.push(mark);
}

/** Queue onAccess* abilities for the card currently being accessed. */
export function noteAccessedCardAbilities(state: GameState): void {
  const cardId = state.run?.accessingCardId;
  const card = cardId ? state.cards[cardId] : undefined;
  if (!cardId || !card) return;
  if (abilitiesSuppressed(state, cardId)) return;
  const installed =
    card.zone.includes(":root") ||
    card.zone.includes(":ice") ||
    card.zone.startsWith("hosted:");
  if (installed && card.onAccessWhileInstalled) {
    pushMark(state, {
      cardId,
      abilityKey: "on-access-while-installed",
      effectKey: "onAccessWhileInstalled",
      controller: "corp",
      mandatory: true,
      logLine: `${card.title} becomes pending — accessed while installed (CR 7.1).`,
    });
  }
  if (!installed && card.onAccessWhileUninstalled) {
    pushMark(state, {
      cardId,
      abilityKey: "on-access-while-uninstalled",
      effectKey: "onAccessWhileUninstalled",
      controller: "corp",
      mandatory: true,
      logLine: `${card.title} becomes pending — accessed while not installed (CR 7.1).`,
    });
  }
  const fromRd = card.zone === "corp:rd" || state.corp.deck.includes(cardId);
  if (!fromRd && card.onAccessNotFromRd) {
    pushMark(state, {
      cardId,
      abilityKey: "on-access-not-from-rd",
      effectKey: "onAccessNotFromRd",
      controller: "corp",
      mandatory: true,
      logLine: `${card.title} becomes pending — accessed from somewhere other than R&D (CR 7.1).`,
    });
  }
}

/**
 * Queue onFinishAccessRdOncePerTurn (Maya). Sets the once-per-turn fired
 * flag when at least one source is noted.
 */
export function noteFinishAccessRdOncePerTurn(state: GameState): void {
  if (state.run?.attackedServerId !== "rd") return;
  if (state.turn.finishAccessRdHookFiredThisTurn) return;
  let noted = false;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFinishAccessRdOncePerTurn) continue;
    pushMark(state, {
      cardId: id,
      abilityKey: "on-finish-access-rd-once",
      effectKey: "onFinishAccessRdOncePerTurn",
      controller: "runner",
      mandatory: false,
      logLine: `${card.title} becomes pending — an R&D access finishes, once this turn (CR 7.5).`,
    });
    noted = true;
  }
  if (noted) state.turn.finishAccessRdHookFiredThisTurn = true;
}

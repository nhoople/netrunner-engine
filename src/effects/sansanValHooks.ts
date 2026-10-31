/** Shared Valley (val) hook helpers. */
import type { GameState, StoredConditionalEffectKey } from "../state/types.js";
import { abilitiesSuppressed } from "../state/abilities.js";

/** Gene Conditioning Shoppe: genetics fire up to twice per turn. */
export function geneticsTriggerThreshold(state: GameState): number {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.geneticsAlsoTriggerSecondTime) return 2;
  }
  return 1;
}

function isGenetics(card: { subtypes?: string[] } | undefined): boolean {
  return (card?.subtypes ?? []).includes("genetics");
}

/**
 * Whether any installed Runner card would mark for this Valley ordinal
 * (genetics respect Gene Conditioning Shoppe).
 */
export function valTriggerWouldMark(
  state: GameState,
  effectKey: StoredConditionalEffectKey,
  ordinal: number,
): boolean {
  const threshold = geneticsTriggerThreshold(state);
  const sources = [...state.runner.installed];
  if (state.runner.identityId) sources.push(state.runner.identityId);
  for (const id of sources) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    if (!(card as unknown as Record<string, unknown>)[effectKey]) continue;
    const lim = isGenetics(card) ? threshold : 1;
    if (ordinal <= lim) return true;
  }
  return false;
}

/** Valley first/second-each-turn families marked at 10.3.1a (phase 3). */
export type ValRunnerTriggerFamily =
  | "damage"
  | "install"
  | "click_loss"
  | "basic_click_draw";

export const VAL_RUNNER_TRIGGER_CONFIG = {
  damage: {
    countKey: "valDamageTriggerCount",
    pendingKey: "valDamageTriggerPendingCounts",
    effectKey: "onFirstDamageEachTurn",
  },
  install: {
    countKey: "valInstallTriggerCount",
    pendingKey: "valInstallTriggerPendingCounts",
    effectKey: "onFirstInstallEachTurn",
  },
  click_loss: {
    countKey: "valClickLossTriggerCount",
    pendingKey: "valClickLossTriggerPendingCounts",
    effectKey: "onFirstClickLossEachTurnExceptPaidAbility",
  },
  basic_click_draw: {
    countKey: "valBasicClickDrawTriggerCount",
    pendingKey: "valBasicClickDrawTriggerPendingCounts",
    effectKey: "onFirstBasicClickDrawEachTurn",
  },
} as const;

const COUNT_KEY_TO_FAMILY = {
  valDamageTriggerCount: "damage",
  valInstallTriggerCount: "install",
  valClickLossTriggerCount: "click_loss",
  valBasicClickDrawTriggerCount: "basic_click_draw",
} as const satisfies Record<string, ValRunnerTriggerFamily>;

export type ValRunnerTriggerCountKey = keyof typeof COUNT_KEY_TO_FAMILY;

function bumpCountAndQueue(
  state: GameState,
  family: ValRunnerTriggerFamily,
): void {
  const cfg = VAL_RUNNER_TRIGGER_CONFIG[family];
  switch (family) {
    case "damage": {
      const next = (state.turn.valDamageTriggerCount ?? 0) + 1;
      state.turn.valDamageTriggerCount = next;
      if (!valTriggerWouldMark(state, cfg.effectKey, next)) return;
      if (!state.turn.valDamageTriggerPendingCounts) {
        state.turn.valDamageTriggerPendingCounts = [];
      }
      state.turn.valDamageTriggerPendingCounts.push(next);
      return;
    }
    case "install": {
      const next = (state.turn.valInstallTriggerCount ?? 0) + 1;
      state.turn.valInstallTriggerCount = next;
      if (!valTriggerWouldMark(state, cfg.effectKey, next)) return;
      if (!state.turn.valInstallTriggerPendingCounts) {
        state.turn.valInstallTriggerPendingCounts = [];
      }
      state.turn.valInstallTriggerPendingCounts.push(next);
      return;
    }
    case "click_loss": {
      const next = (state.turn.valClickLossTriggerCount ?? 0) + 1;
      state.turn.valClickLossTriggerCount = next;
      if (!valTriggerWouldMark(state, cfg.effectKey, next)) return;
      if (!state.turn.valClickLossTriggerPendingCounts) {
        state.turn.valClickLossTriggerPendingCounts = [];
      }
      state.turn.valClickLossTriggerPendingCounts.push(next);
      return;
    }
    case "basic_click_draw": {
      const next = (state.turn.valBasicClickDrawTriggerCount ?? 0) + 1;
      state.turn.valBasicClickDrawTriggerCount = next;
      if (!valTriggerWouldMark(state, cfg.effectKey, next)) return;
      if (!state.turn.valBasicClickDrawTriggerPendingCounts) {
        state.turn.valBasicClickDrawTriggerPendingCounts = [];
      }
      state.turn.valBasicClickDrawTriggerPendingCounts.push(next);
      return;
    }
  }
}

/**
 * Queue a Valley ordinal for the next 10.3.1a scanner pass. Does not mark
 * pending here; `markConditionalAbilities` owns that (CR 9.6.2 / 10.3.1a).
 */
export function noteValRunnerTrigger(
  state: GameState,
  family: ValRunnerTriggerFamily,
): void {
  bumpCountAndQueue(state, family);
}

/**
 * Synthetic Blood: first(/second with Gene Conditioning Shoppe) damage this
 * turn. Records ordinals for the next 10.3.1a scanner pass (phase 3).
 */
export function noteValDamageTrigger(state: GameState): void {
  noteValRunnerTrigger(state, "damage");
}

/**
 * Note a first/second-time-each-turn Valley trigger. Call sites still name
 * the effect key for readability; marking happens at 10.3.1a.
 */
export function fireRunnerValTrigger(
  state: GameState,
  countKey: ValRunnerTriggerCountKey,
  _effectKey: StoredConditionalEffectKey,
  _label: string,
): void {
  noteValRunnerTrigger(state, COUNT_KEY_TO_FAMILY[countKey]);
}

/**
 * Sources that may mark for first/second successful run this turn (Pravdivost /
 * DreamNet / Enhanced Vision; Corp identity, rezzed root/ice, Runner rig).
 */
export function valSuccessfulRunSourceIds(
  state: GameState,
  ordinal: number,
): string[] {
  const threshold = geneticsTriggerThreshold(state);
  const eligible: string[] = [];
  const consider = (cardId: string): void => {
    if (abilitiesSuppressed(state, cardId)) return;
    const card = state.cards[cardId];
    if (!card?.onFirstSuccessfulRunThisTurn) return;
    const lim = isGenetics(card) ? threshold : 1;
    if (ordinal > lim) return;
    eligible.push(cardId);
  };
  consider(state.corp.identityId);
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.onFirstSuccessfulRunThisTurn) continue;
      consider(id);
    }
  }
  for (const id of state.runner.installed) {
    consider(id);
  }
  consider(state.runner.identityId);
  return eligible;
}

/**
 * First(/second with Gene Conditioning Shoppe) successful run this turn.
 * Records ordinals for the next 10.3.1a scanner pass (phase 3).
 */
export function noteValSuccessfulRunTrigger(state: GameState): void {
  const next = (state.turn.valSuccessfulRunTriggerCount ?? 0) + 1;
  state.turn.valSuccessfulRunTriggerCount = next;
  // Genetics may fire through Gene Conditioning Shoppe threshold; others only
  // when valSuccessfulRunSourceIds returns them for this ordinal.
  if (valSuccessfulRunSourceIds(state, next).length === 0) return;
  if (!state.turn.valSuccessfulRunTriggerPendingCounts) {
    state.turn.valSuccessfulRunTriggerPendingCounts = [];
  }
  state.turn.valSuccessfulRunTriggerPendingCounts.push(next);
}

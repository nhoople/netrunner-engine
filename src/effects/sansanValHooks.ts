/** Shared Valley (val) hook helpers. */
import type { GameState, StoredConditionalEffectKey } from "../state/types.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { fireStoredConditionals } from "../state/storedTriggers.js";

/** Gene Conditioning Shoppe: genetics fire up to twice per turn. */
export function geneticsTriggerThreshold(state: GameState): number {
  for (const id of state.runner.installed) {
    if (state.cards[id]?.geneticsAlsoTriggerSecondTime) return 2;
  }
  return 1;
}

function isGenetics(card: { subtypes?: string[] } | undefined): boolean {
  return (card?.subtypes ?? []).includes("genetics");
}

/**
 * Fire a first/second-time-each-turn hook on installed Runner cards matching
 * `effectKey`. Genetics cards respect Gene Conditioning Shoppe.
 */
export function fireRunnerValTrigger(
  state: GameState,
  countKey:
    | "valInstallTriggerCount"
    | "valClickLossTriggerCount"
    | "valDamageTriggerCount"
    | "valBasicClickDrawTriggerCount"
    | "valSuccessfulRunTriggerCount",
  effectKey: StoredConditionalEffectKey,
  label: string,
): void {
  const count = state.turn[countKey] ?? 0;
  const next = count + 1;
  state.turn[countKey] = next;
  const threshold = geneticsTriggerThreshold(state);

  const sources = [...state.runner.installed];
  if (state.runner.identityId) sources.push(state.runner.identityId);
  const items = [];
  for (const id of sources) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    if (!(card as Record<string, unknown>)[effectKey]) continue;
    const lim = isGenetics(card) ? threshold : 1;
    if (next > lim) continue;
    items.push({
      abilityKey: label,
      sourceId: id,
      controller: "runner" as const,
      mandatory: true,
      effectKey,
      logLine: `${card.title} becomes pending — ${label}.`,
    });
  }
  fireStoredConditionals(state, items);
}

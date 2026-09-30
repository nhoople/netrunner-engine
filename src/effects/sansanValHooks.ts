/** Shared Valley (val) hook helpers. */
import { evalEffect } from "./eval.js";
import { log } from "../state/createGame.js";
import type { Effect } from "./ir.js";
import type { GameState } from "../state/types.js";
import { abilitiesSuppressed } from "../state/abilities.js";

/** Gene Conditioning Shoppe: genetics fire up to twice per turn. */
export function geneticsTriggerThreshold(state: GameState): number {
  for (const id of state.runner.rig) {
    if (state.cards[id]?.geneticsAlsoTriggerSecondTime) return 2;
  }
  return 1;
}

function isGenetics(card: { subtypes?: string[] } | undefined): boolean {
  return (card?.subtypes ?? []).includes("genetics");
}

/**
 * Fire a first/second-time-each-turn hook on installed Runner cards matching
 * `getEffect`. Genetics cards respect Gene Conditioning Shoppe.
 */
export function fireRunnerValTrigger(
  state: GameState,
  countKey:
    | "valInstallTriggerCount"
    | "valClickLossTriggerCount"
    | "valDamageTriggerCount"
    | "valBasicClickDrawTriggerCount"
    | "valSuccessfulRunTriggerCount",
  getEffect: (card: GameState["cards"][string]) => Effect | undefined,
  label: string,
): void {
  const count = state.turn[countKey] ?? 0;
  const next = count + 1;
  state.turn[countKey] = next;
  const threshold = geneticsTriggerThreshold(state);

  for (const id of state.runner.rig) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    const fx = getEffect(card);
    if (!fx) continue;
    const lim = isGenetics(card) ? threshold : 1;
    if (next > lim) continue;
    const r = evalEffect({ state, sourceId: id }, fx);
    if (!r.ok) {
      log(state, `${label} failed on ${card.title}: ${r.error}`);
    }
  }
}

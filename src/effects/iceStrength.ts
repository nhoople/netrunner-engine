/**
 * Breaker and ice strength. Both delegate to the shared CR 9.12.1a calculators
 * in stubs (`effectiveBreakerStrength` / `effectiveIceStrength`). Breaker
 * path syncs Gebrselassie host-duration replacements first (CR 9.9.9a).
 */
import { syncHostDurationReplacements } from "../state/hostDuration.js";
import type { GameState } from "../state/types.js";
import {
  effectiveBreakerStrength,
  effectiveIceStrength,
} from "../cards/stubs.js";

/** Shared breaker strength (CR 9.12.1a), after host-duration sync (CR 9.9.9a). */
export function breakerStrength(state: GameState, breakerId: string): number {
  syncHostDurationReplacements(state);
  return effectiveBreakerStrength(state, breakerId);
}

/** Shared ice strength (CR 9.12.1a). */
export function iceStrength(state: GameState, iceId: string): number {
  return effectiveIceStrength(state, iceId);
}

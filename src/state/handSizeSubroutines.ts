/**
 * Static subroutines whose count follows the Corp's HQ size (Ashigaru).
 * New copies are added after the ones already there (CR 9.8.3d).
 */

import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

export function syncCorpHandSizeSubroutines(
  state: GameState,
  iceId: string,
): void {
  const ice = state.cards[iceId];
  if (!ice?.dynamicEtrSubroutineCountFromCorpHandSize || !ice.defId) return;
  const prefix = `${ice.defId}-hq-etr-`;
  if (!ice.baseSubroutines) {
    ice.baseSubroutines = (ice.subroutines ?? []).filter(
      (sub) => !sub.id.startsWith(prefix),
    );
  }
  const base = ice.baseSubroutines;
  const previous = (ice.subroutines ?? []).filter((sub) =>
    sub.id.startsWith(prefix),
  );
  // Blanked Ashigaru keeps only printed base subs (CR 9.12.1d).
  const n = abilitiesSuppressed(state, iceId) ? 0 : state.corp.hand.length;
  const effect = {
    op: "do" as const,
    action: { kind: "end_the_run" as const },
  };
  const dynamic = Array.from({ length: n }, (_, index) => {
    const id = `${prefix}${index}`;
    return (
      previous.find((sub) => sub.id === id) ?? {
        id,
        text: "End the run.",
        effect: structuredClone(effect),
      }
    );
  });
  const before = previous.length;
  ice.subroutines = [...base, ...dynamic];
  const encounter = state.run?.encounter;
  if (encounter?.iceId !== iceId) return;
  const kept = encounter.broken.slice(0, base.length + Math.min(before, n));
  while (kept.length < base.length + n) kept.push(false);
  encounter.broken = kept;
  if (n > before) {
    log(
      state,
      `${ice.title} gains ${n - before} "End the run." subroutine(s) after the others (CR ${CR.subroutineOriginStaticAfter.number}).`,
    );
  } else if (n < before) {
    log(
      state,
      `${ice.title} loses ${before - n} subroutine(s) from the last (CR ${CR.subroutineOriginStaticAfter.number}).`,
    );
  }
}

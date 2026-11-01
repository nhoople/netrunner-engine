/**
 * Continuous gained-subroutine sources (standardization S2).
 * Fatuma / Wetwork-class collectors shared by encounter sync.
 */
import { abilitiesSuppressed } from "./abilities.js";
import { resolveIceSubtypes } from "./continuousEffects.js";
import type { Effect } from "../effects/ir.js";
import type { GameState } from "./types.js";

export type ContinuousGainedSub = {
  sourceId: string;
  iceId: string;
  subId: string;
  text: string;
  effect: Effect;
  /** Insert before printed subs (Fatuma / Wetwork) vs after (Sub Boost). */
  position: "before" | "after";
};

/** Warden Fatuma-class: bioroid ice gains lose-click before printed. */
export function collectFatumaGainedSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const bioroid = resolveIceSubtypes(state, iceId).some(
    (s) => s.toLowerCase() === "bioroid",
  );
  if (!bioroid) return [];
  const out: ContinuousGainedSub[] = [];
  for (const card of Object.values(state.cards)) {
    if (!card.rezzed) continue;
    if (!card.bioroidIceGainsLoseClickSubroutineBeforeOthers) continue;
    if (abilitiesSuppressed(state, card.id)) continue;
    out.push({
      sourceId: card.id,
      iceId,
      subId: `warden-lose-click-${card.id}`,
      text: "The Runner loses [click].",
      effect: {
        op: "do",
        action: { kind: "lose_clicks", side: "runner", amount: 1 },
      },
      position: "before",
    });
  }
  return out;
}

/** Wetwork Refit-class: hosted condition grants listed subs before printed. */
export function collectHostedConditionSubsBeforePrinted(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice) return [];
  const out: ContinuousGainedSub[] = [];
  for (const hid of ice.hostedCardIds ?? []) {
    if (abilitiesSuppressed(state, hid)) continue;
    const hosted = state.cards[hid];
    for (const sub of hosted?.hostGainsSubroutinesBeforePrinted ?? []) {
      out.push({
        sourceId: hid,
        iceId,
        subId: `${sub.id}-${hid}`,
        text: sub.text,
        effect: structuredClone(sub.effect),
        position: "before",
      });
    }
  }
  return out;
}

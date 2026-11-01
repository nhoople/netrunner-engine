/**
 * Continuous gained-subroutine collectors (framework migration M1).
 * Graph applies the lists; collectors own the continuous math.
 */
import { abilitiesSuppressed } from "./abilities.js";
import { resolveIceSubtypes } from "./continuousEffects.js";
import type { Effect } from "../effects/ir.js";
import type { GameState, Subroutine } from "./types.js";

export type ContinuousGainedSub = {
  sourceId: string;
  iceId: string;
  subId: string;
  text: string;
  effect: Effect;
  /** Insert before printed subs vs after printed. */
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

/** Sub Boost-class: hosted condition grants ETR after printed. */
export function collectSubBoostEtrSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice) return [];
  const out: ContinuousGainedSub[] = [];
  for (const hid of ice.hostedCardIds ?? []) {
    if (abilitiesSuppressed(state, hid)) continue;
    const hosted = state.cards[hid];
    if (!hosted?.hostGainsBarrierAndEtrSubroutine) continue;
    out.push({
      sourceId: hid,
      iceId,
      subId: `sub-boost-etr-${hid}`,
      text: "End the run.",
      effect: { op: "do", action: { kind: "end_the_run" } },
      position: "after",
    });
  }
  return out;
}

/** Winchester-class: while protecting HQ, gains listed subs after printed. */
export function collectWinchesterHqSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice?.gainsSubroutinesWhileProtectingHq) return [];
  if (state.run?.attackedServerId !== "hq") return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  return ice.gainsSubroutinesWhileProtectingHq.map((sub) => ({
    sourceId: iceId,
    iceId,
    subId: `${sub.id}-hq`,
    text: sub.text,
    effect: structuredClone(sub.effect),
    position: "after" as const,
  }));
}

/** Blockchain-class: floor(faceup Archives type+subtype / per) before printed. */
export function collectBlockchainArchivesSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  const spec = ice?.gainsSubroutinesBeforePrintedPerFaceupArchives;
  if (!ice || !spec) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  let faceup = 0;
  for (const id of state.corp.discardPile) {
    const c = state.cards[id];
    if (!c?.faceup) continue;
    if (c.type !== spec.type) continue;
    if (!(c.subtypes ?? []).includes(spec.subtype)) continue;
    faceup += 1;
  }
  const per = Math.max(1, spec.per);
  const n = Math.floor(faceup / per);
  return Array.from({ length: n }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${spec.subroutine.id}-${i}`,
    text: spec.subroutine.text,
    effect: structuredClone(spec.subroutine.effect),
    position: "before" as const,
  }));
}

/** Woodcutter/Tyrant-class: one sub per advancement after printed. */
export function collectAdvancementGainedSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  const spec = ice?.gainsSubroutinesPerAdvancement;
  if (!ice || !spec) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  const n = Math.max(0, ice.advancementCounters ?? 0);
  return Array.from({ length: n }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${spec.subroutine.id}-${i}`,
    text: spec.subroutine.text,
    effect: structuredClone(spec.subroutine.effect),
    position: "after" as const,
  }));
}

/**
 * NEXT Opal-class: one sub per rezzed ice with subtype (layered subtypes).
 */
export function collectNextOpalSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  const spec = ice?.gainsSubroutinesPerRezzedIceWithSubtype;
  if (!ice || !spec) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  let n = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      if (
        resolveIceSubtypes(state, id).some(
          (t) => t.toLowerCase() === spec.subtype.toLowerCase(),
        )
      ) {
        n += 1;
      }
    }
  }
  return Array.from({ length: n }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${spec.subroutine.id}-${i}`,
    text: spec.subroutine.text,
    effect: structuredClone(spec.subroutine.effect),
    position: "after" as const,
  }));
}

/** Brainstorm-class: X core-damage subs = grip size after printed (once per run). */
export function collectBrainstormGripSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  const template = ice?.gainsSubroutinesOnEncounterEqualGripSize;
  if (!ice || !template) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  const x = state.runner.hand.length;
  return Array.from({ length: x }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${template.id}-${i}`,
    text: template.text,
    effect: structuredClone(template.effect),
    position: "after" as const,
  }));
}

/** Tour Guide-class: one ETR before printed per rezzed asset. */
export function collectTourGuideEtrSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice?.etrSubroutinesPerRezzedAsset) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  let n = 0;
  for (const c of Object.values(state.cards)) {
    if (!c?.rezzed || c.type !== "asset") continue;
    if ((c.zone ?? "").includes(":root") || (c.zone ?? "").startsWith("hosted:")) {
      n += 1;
    }
  }
  return Array.from({ length: n }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${ice.defId}-etr-asset-${i}`,
    text: "End the run.",
    effect: { op: "do", action: { kind: "end_the_run" } },
    position: "before" as const,
  }));
}

function looksLikeContinuousGainedSubId(
  ice: NonNullable<GameState["cards"][string]>,
  subId: string,
): boolean {
  if (subId.startsWith("warden-lose-click-")) return true;
  if (subId.startsWith("sub-boost-etr-")) return true;
  if (subId.startsWith(`${ice.defId}-etr-asset-`)) return true;
  if (subId.endsWith("-hq") && ice.gainsSubroutinesWhileProtectingHq) {
    return true;
  }
  const templates = [
    ice.gainsSubroutinesBeforePrintedPerFaceupArchives?.subroutine.id,
    ice.gainsSubroutinesPerAdvancement?.subroutine.id,
    ice.gainsSubroutinesPerRezzedIceWithSubtype?.subroutine.id,
    ice.gainsSubroutinesOnEncounterEqualGripSize?.id,
  ].filter(Boolean) as string[];
  return templates.some(
    (t) => subId === t || subId.startsWith(`${t}-`),
  );
}

/**
 * Rebuild ice.subroutines from printed base + continuous gained lists.
 * Pass every collector for this sync moment in one call so families do not wipe each other.
 */
export function applyContinuousGainedSubs(
  state: GameState,
  iceId: string,
  gained: ContinuousGainedSub[],
  opts?: { ensureBase?: boolean },
): { before: number; after: number } {
  const ice = state.cards[iceId];
  if (!ice) return { before: 0, after: 0 };
  const before = ice.subroutines?.length ?? 0;
  if (opts?.ensureBase !== false && !ice.baseSubroutines) {
    ice.baseSubroutines = structuredClone(
      (ice.subroutines ?? []).filter(
        (sub) => !looksLikeContinuousGainedSubId(ice, sub.id),
      ),
    );
  }
  const base = structuredClone(ice.baseSubroutines ?? ice.subroutines ?? []);
  const beforeSubs = gained
    .filter((g) => g.position === "before")
    .map(toSubroutine);
  const afterSubs = gained
    .filter((g) => g.position === "after")
    .map(toSubroutine);
  ice.subroutines = [...beforeSubs, ...base, ...afterSubs];
  return { before, after: ice.subroutines.length };
}

function toSubroutine(g: ContinuousGainedSub): Subroutine {
  return {
    id: g.subId,
    text: g.text,
    effect: g.effect,
  };
}

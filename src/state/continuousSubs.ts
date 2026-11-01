/**
 * Continuous gained-subroutine collectors (framework migration M1 / L2 / W1).
 * Graph applies the lists; collectors own the continuous math.
 */
import { abilitiesSuppressed } from "./abilities.js";
import { resolveIceSubtypes } from "./continuousEffects.js";
import type { Effect } from "../effects/ir.js";
import type { ContinuousGainedSubDecl, GameState, Subroutine } from "./types.js";

export type ContinuousGainedSub = {
  sourceId: string;
  iceId: string;
  subId: string;
  text: string;
  effect: Effect;
  /** Insert before printed subs vs after printed. */
  position: "before" | "after";
};

const FATUMA_LOSE_CLICK_SUB = {
  id: "warden-lose-click",
  text: "The Runner loses [click].",
  effect: {
    op: "do" as const,
    action: { kind: "lose_clicks" as const, side: "runner" as const, amount: 1 },
  },
};

const SUB_BOOST_ETR_SUB = {
  id: "sub-boost-etr",
  text: "End the run.",
  effect: { op: "do" as const, action: { kind: "end_the_run" as const } },
};

const TOUR_GUIDE_ETR_SUB = {
  id: "etr-asset",
  text: "End the run.",
  effect: { op: "do" as const, action: { kind: "end_the_run" as const } },
};

function gainedSubDecls(
  card: GameState["cards"][string] | undefined,
): ContinuousGainedSubDecl[] {
  return card?.continuousGainedSubDecls ?? [];
}

function firstDecl<K extends ContinuousGainedSubDecl["kind"]>(
  card: GameState["cards"][string] | undefined,
  kind: K,
): Extract<ContinuousGainedSubDecl, { kind: K }> | undefined {
  return gainedSubDecls(card).find(
    (d): d is Extract<ContinuousGainedSubDecl, { kind: K }> => d.kind === kind,
  );
}

/** True when ice carries a Winchester-family continuous gained-sub declaration. */
export function iceHasWinchesterFamilyDecl(
  card: GameState["cards"][string] | undefined,
): boolean {
  return gainedSubDecls(card).some((d) =>
    (
      [
        "hq_protect_subs",
        "archives_faceup_per",
        "per_advancement",
        "per_rezzed_subtype",
        "grip_size_on_encounter",
        "etr_per_rezzed_asset",
      ] as const
    ).includes(d.kind as never),
  );
}

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
    if (abilitiesSuppressed(state, card.id)) continue;
    for (const decl of gainedSubDecls(card)) {
      if (decl.kind !== "fatuma_lose_click") continue;
      const sub = decl.subroutine ?? FATUMA_LOSE_CLICK_SUB;
      out.push({
        sourceId: card.id,
        iceId,
        subId: `${sub.id}-${card.id}`,
        text: sub.text,
        effect: structuredClone(sub.effect),
        position: decl.position ?? "before",
      });
    }
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
    for (const decl of gainedSubDecls(hosted)) {
      if (decl.kind !== "wetwork_hosted_before") continue;
      const subs =
        decl.subroutines && decl.subroutines.length > 0
          ? decl.subroutines
          : (hosted?.hostGainsSubroutinesBeforePrinted ?? []);
      for (const sub of subs) {
        out.push({
          sourceId: hid,
          iceId,
          subId: `${sub.id}-${hid}`,
          text: sub.text,
          effect: structuredClone(sub.effect),
          position: decl.position ?? "before",
        });
      }
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
    for (const decl of gainedSubDecls(hosted)) {
      if (decl.kind !== "sub_boost_etr") continue;
      const sub = decl.subroutine ?? SUB_BOOST_ETR_SUB;
      out.push({
        sourceId: hid,
        iceId,
        subId: `${sub.id}-${hid}`,
        text: sub.text,
        effect: structuredClone(sub.effect),
        position: decl.position ?? "after",
      });
    }
  }
  return out;
}

/** Winchester-class: while protecting HQ, gains listed subs after printed. */
export function collectWinchesterHqSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice) return [];
  if (state.run?.attackedServerId !== "hq") return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  const decl = firstDecl(ice, "hq_protect_subs");
  const subs =
    decl?.subroutines ?? ice.gainsSubroutinesWhileProtectingHq ?? [];
  if (!decl && !ice.gainsSubroutinesWhileProtectingHq) return [];
  return subs.map((sub) => ({
    sourceId: iceId,
    iceId,
    subId: `${sub.id}-hq`,
    text: sub.text,
    effect: structuredClone(sub.effect),
    position: (decl?.position ?? "after") as "before" | "after",
  }));
}

/** Blockchain-class: floor(faceup Archives type+subtype / per) before printed. */
export function collectBlockchainArchivesSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  const decl = firstDecl(ice, "archives_faceup_per");
  const legacy = ice.gainsSubroutinesBeforePrintedPerFaceupArchives;
  const spec = decl
    ? {
        type: decl.type,
        subtype: decl.subtype,
        per: decl.per,
        subroutine: decl.subroutine,
        position: decl.position ?? "before",
      }
    : legacy
      ? { ...legacy, position: "before" as const }
      : null;
  if (!spec) return [];
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
    position: spec.position,
  }));
}

/** Woodcutter/Tyrant-class: one sub per advancement after printed. */
export function collectAdvancementGainedSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  const decl = firstDecl(ice, "per_advancement");
  const legacy = ice.gainsSubroutinesPerAdvancement;
  const subroutine = decl?.subroutine ?? legacy?.subroutine;
  if (!subroutine) return [];
  const n = Math.max(0, ice.advancementCounters ?? 0);
  return Array.from({ length: n }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${subroutine.id}-${i}`,
    text: subroutine.text,
    effect: structuredClone(subroutine.effect),
    position: (decl?.position ?? "after") as "before" | "after",
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
  if (!ice) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  const decl = firstDecl(ice, "per_rezzed_subtype");
  const legacy = ice.gainsSubroutinesPerRezzedIceWithSubtype;
  const subtype = decl?.subtype ?? legacy?.subtype;
  const subroutine = decl?.subroutine ?? legacy?.subroutine;
  if (!subtype || !subroutine) return [];
  let n = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      if (
        resolveIceSubtypes(state, id).some(
          (t) => t.toLowerCase() === subtype.toLowerCase(),
        )
      ) {
        n += 1;
      }
    }
  }
  return Array.from({ length: n }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${subroutine.id}-${i}`,
    text: subroutine.text,
    effect: structuredClone(subroutine.effect),
    position: (decl?.position ?? "after") as "before" | "after",
  }));
}

/** Brainstorm-class: X core-damage subs = grip size after printed (once per run). */
export function collectBrainstormGripSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  const decl = firstDecl(ice, "grip_size_on_encounter");
  const template = decl?.subroutine ?? ice.gainsSubroutinesOnEncounterEqualGripSize;
  if (!template) return [];
  const x = state.runner.hand.length;
  return Array.from({ length: x }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${template.id}-${i}`,
    text: template.text,
    effect: structuredClone(template.effect),
    position: (decl?.position ?? "after") as "before" | "after",
  }));
}

/** Tour Guide-class: one ETR before printed per rezzed asset. */
export function collectTourGuideEtrSubs(
  state: GameState,
  iceId: string,
): ContinuousGainedSub[] {
  const ice = state.cards[iceId];
  if (!ice) return [];
  const decl = firstDecl(ice, "etr_per_rezzed_asset");
  if (!decl && !ice.etrSubroutinesPerRezzedAsset) return [];
  if (abilitiesSuppressed(state, iceId)) return [];
  let n = 0;
  for (const c of Object.values(state.cards)) {
    if (!c?.rezzed || c.type !== "asset") continue;
    if ((c.zone ?? "").includes(":root") || (c.zone ?? "").startsWith("hosted:")) {
      n += 1;
    }
  }
  const sub = decl?.subroutine ?? TOUR_GUIDE_ETR_SUB;
  const subIdBase =
    decl?.subroutine?.id ?? `${ice.defId}-etr-asset`;
  return Array.from({ length: n }, (_, i) => ({
    sourceId: iceId,
    iceId,
    subId: `${subIdBase}-${i}`,
    text: sub.text,
    effect: structuredClone(sub.effect),
    position: (decl?.position ?? "before") as "before" | "after",
  }));
}

function looksLikeContinuousGainedSubId(
  ice: NonNullable<GameState["cards"][string]>,
  subId: string,
): boolean {
  if (subId.startsWith("warden-lose-click-")) return true;
  if (subId.startsWith("sub-boost-etr-")) return true;
  if (subId.startsWith(`${ice.defId}-etr-asset-`)) return true;
  if (subId.endsWith("-hq")) {
    if (
      ice.gainsSubroutinesWhileProtectingHq ||
      firstDecl(ice, "hq_protect_subs")
    ) {
      return true;
    }
  }
  const templates = [
    firstDecl(ice, "archives_faceup_per")?.subroutine.id,
    ice.gainsSubroutinesBeforePrintedPerFaceupArchives?.subroutine.id,
    firstDecl(ice, "per_advancement")?.subroutine.id,
    ice.gainsSubroutinesPerAdvancement?.subroutine.id,
    firstDecl(ice, "per_rezzed_subtype")?.subroutine.id,
    ice.gainsSubroutinesPerRezzedIceWithSubtype?.subroutine.id,
    firstDecl(ice, "grip_size_on_encounter")?.subroutine.id,
    ice.gainsSubroutinesOnEncounterEqualGripSize?.id,
    firstDecl(ice, "etr_per_rezzed_asset")?.subroutine?.id,
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

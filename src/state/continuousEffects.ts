/**
 * Practical continuous-effect dependency resolution (CR 9.12.1d / 9.12.1e).
 * Blanking-class effects plus ice subtype grants (Egret / Chromatophores /
 * Mother Goddess). Extends toward a general continuous-characteristics layer
 * without compiling CR prose.
 */
import { LINGERING_KIND_ABILITY_BLANK } from "./lingeringEffects.js";
import type { GameState } from "./types.js";

/** One blanking-class continuous/lingering effect waiting to apply. */
export interface BlankingEffect {
  id: string;
  /** Card that produces the blanking ability/effect. */
  sourceId: string;
  /** Cards whose abilities this effect blanks when applied. */
  targetIds: string[];
  /** When set, source is hosted on this card (loop tie-break, CR 9.12.1e). */
  hostedOn?: string;
}

/**
 * Collect blanking-class continuous effects currently in play.
 * Scoped to ability-suppression shapes the corpus actually uses:
 * Hush (`blanksHostAbilities`), Magnet (`hostedProgramsLoseAbilities`),
 * Klevetnik-class `ability_blank` lingerings, test-injection `abilitiesBlanked`
 * self-flags, and Light the Fire root blank.
 */
export function collectBlankingEffects(state: GameState): BlankingEffect[] {
  const effects: BlankingEffect[] = [];

  // Hush-class: hosted trojan blanks host ice abilities (printed subs remain).
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.blanksHostAbilities || !card.hostId) continue;
    const host = state.cards[card.hostId];
    if (!host || host.type !== "ice") continue;
    effects.push({
      id: `blank-host:${id}`,
      sourceId: id,
      targetIds: [card.hostId],
      hostedOn: card.hostId,
    });
  }

  // Magnet-class: rezzed ice continuously blanks hosted programs' abilities.
  for (const server of Object.values(state.servers)) {
    for (const iceId of server.ice) {
      const ice = state.cards[iceId];
      if (!ice?.rezzed || !ice.hostedProgramsLoseAbilities) continue;
      const hosted = state.runner.installed.filter(
        (rid) => state.cards[rid]?.hostId === iceId,
      );
      if (hosted.length === 0) continue;
      effects.push({
        id: `blank-hosted:${iceId}`,
        sourceId: iceId,
        targetIds: hosted,
      });
    }
  }

  // Klevetnik-class Corp-turn blanks from the lingering registry (CR 9.10.1).
  for (const e of state.lingeringEffects) {
    if (e.expired || e.kind !== LINGERING_KIND_ABILITY_BLANK) continue;
    const cardId = (e.payload as { cardId?: string } | undefined)?.cardId;
    if (!cardId || !state.cards[cardId]) continue;
    effects.push({
      id: `lingering-blank:${e.id}`,
      sourceId: e.createdBy,
      targetIds: [cardId],
    });
  }

  // Test / legacy self-flag: `abilitiesBlanked` on a card blanks itself.
  // Magnet no longer stamps this (continuous hostedProgramsLoseAbilities).
  // Klevetnik blanks are registry-only via ability_blank lingerings above.
  for (const id of Object.keys(state.cards)) {
    const card = state.cards[id];
    if (!card?.abilitiesBlanked) continue;
    effects.push({
      id: `flag-blank:${id}`,
      sourceId: id,
      targetIds: [id],
    });
  }

  // Light the Fire!: blank root of attacked server during the run.
  const run = state.run;
  if (run?.blankAttackedServerRoot) {
    const server = state.servers[run.attackedServerId];
    const root = server?.root ?? [];
    if (root.length > 0) {
      effects.push({
        id: `blank-root:${run.attackedServerId}`,
        sourceId: run.runSourceId ?? `run:${run.attackedServerId}`,
        targetIds: [...root],
      });
    }
  }

  // Direct Access blanks both identities while the event is resolving,
  // including the reaction window after its run has ended (CR 9.1.2b).
  const resolvingId = state.playedRunEventId;
  const resolving = resolvingId ? state.cards[resolvingId] : undefined;
  const blankWhileResolving =
    resolving?.blankIdentitiesWhileResolving === true &&
    resolving.zone === "runner:play-area";
  if (run?.blankIdentities || blankWhileResolving) {
    const sourceId = resolvingId ?? run?.runSourceId ?? "run";
    effects.push({
      id: `blank-identities:${sourceId}`,
      sourceId,
      targetIds: [state.corp.identityId, state.runner.identityId],
    });
  }

  // Rumor Mill: unique non-region assets/upgrades lose printed abilities.
  const rumorSources = Object.values(state.cards).filter(
    (c) => c?.blankUniqueNonRegionAssetUpgradePrintedAbilities,
  );
  if (rumorSources.length > 0) {
    const targets: string[] = [];
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (!c) continue;
        if (c.type !== "asset" && c.type !== "upgrade") continue;
        if (!c.unique) continue;
        if ((c.subtypes ?? []).includes("region")) continue;
        targets.push(id);
      }
    }
    if (targets.length > 0) {
      for (const src of rumorSources) {
        effects.push({
          id: `rumor-mill:${src.id}`,
          sourceId: src.id,
          targetIds: targets,
        });
      }
    }
  }


  // Malia Z0L0K4: chosen non-virtual resource loses printed abilities while rezzed.
  for (const card of Object.values(state.cards)) {
    if (!card?.rezzed || !card.tdatdMaliaBlankTargetId) continue;
    const installed = Object.values(state.servers).some(
      (s) => s.root.includes(card.id),
    );
    if (!installed) continue;
    effects.push({
      id: `malia-blank:${card.id}`,
      sourceId: card.id,
      targetIds: [card.tdatdMaliaBlankTargetId],
    });
  }

  return effects;
}

/** Effect A depends on B if applying B changes whether A's source ability remains (CR 9.12.1d). */
export function blankingEffectDependsOn(
  a: BlankingEffect,
  b: BlankingEffect,
): boolean {
  if (a.id === b.id) return false;
  return b.targetIds.includes(a.sourceId);
}

/**
 * Apply blanking effects in CR 9.12.1e order: independent first; on a
 * dependency loop, treat hosted sources as independent of their hosts.
 * Effects whose source is already blanked are dropped (ability gone).
 */
export function orderBlankingEffects(
  effects: BlankingEffect[],
): BlankingEffect[] {
  const remaining = effects.map((e) => ({ ...e, targetIds: [...e.targetIds] }));
  const applied: BlankingEffect[] = [];
  const blankedSources = new Set<string>();

  while (remaining.length > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (blankedSources.has(remaining[i]!.sourceId)) {
        remaining.splice(i, 1);
      }
    }
    if (remaining.length === 0) break;

    const independent = remaining.filter(
      (e) =>
        !remaining.some(
          (other) => other.id !== e.id && blankingEffectDependsOn(e, other),
        ),
    );

    let batch: BlankingEffect[];
    if (independent.length > 0) {
      batch = independent;
    } else {
      // Dependency loop (CR 9.12.1e): hosted ignores dependence on host.
      const hostedBreak = remaining.filter((e) =>
        Boolean(
          e.hostedOn && remaining.some((o) => o.sourceId === e.hostedOn),
        ),
      );
      batch = hostedBreak.length > 0 ? [hostedBreak[0]!] : [remaining[0]!];
    }

    for (const e of batch) {
      applied.push(e);
      for (const t of e.targetIds) blankedSources.add(t);
      const idx = remaining.findIndex((x) => x.id === e.id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  return applied;
}

/** Card ids whose abilities are suppressed after 9.12 blanking resolution. */
export function resolveBlankedCardIds(state: GameState): Set<string> {
  const ordered = orderBlankingEffects(collectBlankingEffects(state));
  const blanked = new Set<string>();
  for (const e of ordered) {
    for (const t of e.targetIds) blanked.add(t);
  }
  return blanked;
}

// --- Subtype grants (standardization S1) ---------------------------------

/** Hosted trojan grants barrier + code gate + sentry to its host ice. */
export type HostSubtypeGrantEffect = {
  kind: "host_grant_bcs";
  id: string;
  sourceId: string;
  targetIceId: string;
};

/** Sub Boost-class: hosted condition grants barrier to its host ice. */
export type HostBarrierGrantEffect = {
  kind: "host_grant_barrier";
  id: string;
  sourceId: string;
  targetIceId: string;
};

/**
 * Mother Goddess-class: rezzed ice gains subtypes of other rezzed ice
 * (including subtypes those ice only gained from earlier continuous grants).
 */
export type MotherGoddessSubtypeEffect = {
  kind: "mother_goddess";
  id: string;
  sourceId: string;
  targetIceId: string;
};

export type SubtypeGrantEffect =
  | HostSubtypeGrantEffect
  | HostBarrierGrantEffect
  | MotherGoddessSubtypeEffect;

/** Collect continuous subtype-grant effects (sources may later be blanked). */
export function collectSubtypeGrantEffects(
  state: GameState,
): SubtypeGrantEffect[] {
  const effects: SubtypeGrantEffect[] = [];

  for (const id of Object.keys(state.cards)) {
    const card = state.cards[id];
    if (!card?.hostId) continue;
    const host = state.cards[card.hostId];
    if (!host || host.type !== "ice") continue;

    const grants = card.continuousSubtypeGrants ?? [];

    if (grants.some((g) => g.kind === "host_grant_bcs")) {
      effects.push({
        kind: "host_grant_bcs",
        id: `host-bcs:${id}`,
        sourceId: id,
        targetIceId: card.hostId,
      });
    }
    if (grants.some((g) => g.kind === "host_grant_barrier")) {
      effects.push({
        kind: "host_grant_barrier",
        id: `host-barrier:${id}`,
        sourceId: id,
        targetIceId: card.hostId,
      });
    }
  }

  for (const server of Object.values(state.servers)) {
    for (const iceId of server.ice) {
      const ice = state.cards[iceId];
      if (!ice?.rezzed || ice.type !== "ice") continue;
      const grants = ice.continuousSubtypeGrants ?? [];
      if (!grants.some((g) => g.kind === "copy_other_rezzed_ice_subtypes")) {
        continue;
      }
      effects.push({
        kind: "mother_goddess",
        id: `mg-subtypes:${iceId}`,
        sourceId: iceId,
        targetIceId: iceId,
      });
    }
  }

  return effects;
}

function gainSubtype(counts: Map<string, number>, subtype: string): void {
  counts.set(subtype, (counts.get(subtype) ?? 0) + 1);
}

function loseSubtype(counts: Map<string, number>, subtype: string): void {
  const next = (counts.get(subtype) ?? 0) - 1;
  if (next > 0) counts.set(subtype, next);
  else counts.delete(subtype);
}

function subtypesFromCounts(counts: Map<string, number>): string[] {
  return [...counts.keys()];
}

/**
 * Resolve effective ice subtypes with blanking first, then independent host
 * grants, then Mother Goddess copying other ice's layered subtypes (CR 9.12.1d/e).
 */
export function resolveIceSubtypeMap(
  state: GameState,
): Map<string, string[]> {
  const blanked = resolveBlankedCardIds(state);
  const byIce = new Map<string, Map<string, number>>();

  const ensure = (iceId: string): Map<string, number> => {
    let m = byIce.get(iceId);
    if (!m) {
      m = new Map();
      byIce.set(iceId, m);
    }
    return m;
  };

  for (const server of Object.values(state.servers)) {
    for (const iceId of server.ice) {
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") continue;
      const counts = ensure(iceId);
      for (const subtype of ice.subtypes ?? []) gainSubtype(counts, subtype);
    }
  }

  const grants = collectSubtypeGrantEffects(state).filter(
    (e) => !blanked.has(e.sourceId),
  );

  // Independent: hosted BCS grants (Egret / Chromatophores).
  for (const e of grants) {
    if (e.kind !== "host_grant_bcs") continue;
    const counts = ensure(e.targetIceId);
    gainSubtype(counts, "barrier");
    gainSubtype(counts, "code gate");
    gainSubtype(counts, "sentry");
  }

  // Independent: Sub Boost-class barrier grant.
  for (const e of grants) {
    if (e.kind !== "host_grant_barrier") continue;
    const counts = ensure(e.targetIceId);
    gainSubtype(counts, "barrier");
  }

  // Encounter / turn / morph (local continuous; applied before MG copy).
  for (const server of Object.values(state.servers)) {
    for (const iceId of server.ice) {
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") continue;
      const counts = ensure(iceId);
      const enc = state.run?.encounter;
      if (enc?.iceId === iceId && enc.grantedSubtypes?.length) {
        for (const s of enc.grantedSubtypes) gainSubtype(counts, s);
      }
      if (ice.grantedSubtypesUntilEndOfTurn?.length) {
        for (const s of ice.grantedSubtypesUntilEndOfTurn) {
          gainSubtype(counts, s);
        }
      }
      const morph = ice.morphOddAdvancementSubtypeSwap;
      if (morph && (ice.advancementCounters ?? 0) % 2 === 1) {
        loseSubtype(counts, morph.lose);
        gainSubtype(counts, morph.gain);
      }
    }
  }

  // Dependent: Mother Goddess copies other rezzed ice's subtypes *after*
  // host grants (gained→further grant).
  for (const e of grants) {
    if (e.kind !== "mother_goddess") continue;
    if (blanked.has(e.sourceId)) continue;
    const ice = state.cards[e.targetIceId];
    if (!ice?.rezzed) continue;
    const counts = ensure(e.targetIceId);
    for (const server of Object.values(state.servers)) {
      for (const otherId of server.ice) {
        if (otherId === e.targetIceId) continue;
        const other = state.cards[otherId];
        if (!other?.rezzed) continue;
        const otherCounts = byIce.get(otherId);
        if (!otherCounts) continue;
        for (const subtype of otherCounts.keys()) {
          gainSubtype(counts, subtype);
        }
      }
    }
  }

  const out = new Map<string, string[]>();
  for (const [iceId, counts] of byIce) {
    out.set(iceId, subtypesFromCounts(counts));
  }
  return out;
}

/** Effective subtypes for one ice via the continuous subtype layer. */
export function resolveIceSubtypes(
  state: GameState,
  iceId: string,
): string[] {
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice") {
    // Non-ice or missing: preserve prior behavior (printed only).
    return ice?.subtypes ? [...ice.subtypes] : [];
  }
  return resolveIceSubtypeMap(state).get(iceId) ?? [...(ice.subtypes ?? [])];
}

/**
 * Practical continuous-effect dependency resolution (CR 9.12.1d / 9.12.1e).
 * Blanking-class effects plus ice subtype grants (Egret / Chromatophores /
 * Mother Goddess). Extends toward a general continuous-characteristics layer
 * without compiling CR prose.
 */
import {
  LINGERING_KIND_ABILITY_BLANK,
  LINGERING_KIND_GRANTED_SUBTYPES,
} from "./lingeringEffects.js";
import type { GameState } from "../types/game.js";
import {
  currentsBlankingCorpIdentity,
  currentsBlankingRunnerIdentity,
} from "./currents.js";
import { isCardActive } from "./active.js";

/** One blanking-class continuous/lingering effect waiting to apply. */
export interface BlankingEffect {
  id: string;
  /** Card that produces the blanking ability/effect. */
  sourceId: string;
  /** Cards whose abilities this effect blanks when applied. */
  targetIds: string[];
  /** When set, source is hosted on this card (loop tie-break, CR 9.12.1e). */
  hostedOn?: string;
  /**
   * A lingering effect, or one an instruction made: it exists apart from its
   * source (CR 9.10.1), so blanking the source neither removes it nor
   * changes it (CR 9.12.1d drops only effects from static abilities).
   */
  lingering?: boolean;
}

/**
 * Collect blanking-class continuous effects currently in play.
 * Scoped to ability-suppression shapes the corpus actually uses:
 * Hush (`blanksHostAbilities`), Magnet (`hostedProgramsLoseAbilities`),
 * `ability_blank` lingerings, and Light the Fire root blank.
 */
export function collectBlankingEffects(state: GameState): BlankingEffect[] {
  const effects: BlankingEffect[] = [];

  // Hush-class: hosted trojan blanks host ice abilities (printed subs remain).
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.blanksHostAbilities || !card.hostId) continue;
    if (!isCardActive(state, id)) continue;
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
      lingering: true,
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
        lingering: true,
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

  // Cerebral Static / Employee Strike: an active current makes an identity
  // lose its printed abilities (CR 9.1.9a) until the current is trashed.
  for (const id of currentsBlankingRunnerIdentity(state)) {
    effects.push({
      id: `current-blank-runner-id:${id}`,
      sourceId: id,
      targetIds: [state.runner.identityId],
    });
  }
  for (const id of currentsBlankingCorpIdentity(state)) {
    effects.push({
      id: `current-blank-corp-id:${id}`,
      sourceId: id,
      targetIds: [state.corp.identityId],
    });
  }

  // Rumor Mill: unique non-region assets/upgrades lose printed abilities,
  // only while it is active in the play area (CR 1.8.4a, 3.7.1b, 9.4.1).
  const rumorSources = Object.values(state.cards).filter(
    (c) =>
      c?.blankUniqueNonRegionAssetUpgradePrintedAbilities &&
      isCardActive(state, c.id),
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
    if (!card?.tdatdMaliaBlankTargetId) continue;
    if (!isCardActive(state, card.id)) continue;
    effects.push({
      id: `malia-blank:${card.id}`,
      sourceId: card.id,
      targetIds: [card.tdatdMaliaBlankTargetId],
    });
  }

  return effects;
}

/**
 * Effect A depends on B if applying B changes whether A's source ability
 * remains (CR 9.12.1d). A lingering effect exists apart from its source
 * (CR 9.10.1), so it depends on nothing here.
 */
export function blankingEffectDependsOn(
  a: BlankingEffect,
  b: BlankingEffect,
): boolean {
  if (a.id === b.id || a.lingering) return false;
  return b.targetIds.includes(a.sourceId);
}

/** What the shared dependency sort needs to know about one effect. */
export interface LayeredEffect {
  id: string;
  sourceId: string;
  /** The source is hosted on this card (CR 9.12.1e tie-break). */
  hostedOn?: string;
  /** Exists apart from its source; never dropped when the source is blanked. */
  lingering?: boolean;
}

export interface DependencyOrder<T> {
  /** The effects to apply, in order; dropped effects are left out. */
  applied: T[];
  /**
   * Loops that neither independence nor the hosted-object tie-break settles
   * (CR 9.12.1e does not say what to do). Each entry lists every effect still
   * waiting at that point (the loop and anything depending on it), applied
   * from there in collection order. A CR gap: no card pair in the corpus reaches one today except two
   * rezzed copies of a unique ice (Mother Goddess, CR 10.1.1).
   */
  unsettledLoops: T[][];
}

/**
 * The CR 9.12.1d–e dependency sort, shared by the blanking order and the ice
 * subtype layer. Starting from printed characteristics, apply an independent
 * effect next whenever one exists (several at once may go in any order). In
 * a loop, treat effects from hosted objects as not depending on effects from
 * their hosts. Before each step, drop effects from static abilities whose
 * source an applied effect blanked (CR 9.12.1d). A loop the tie-break cannot
 * settle falls back to collection order and is reported in `unsettledLoops`.
 */
export function orderByDependency<T extends LayeredEffect>(
  effects: readonly T[],
  dependsOn: (a: T, b: T) => boolean,
  blanks: (e: T) => readonly string[],
): DependencyOrder<T> {
  const remaining = [...effects];
  const applied: T[] = [];
  const unsettledLoops: T[][] = [];
  const blankedSources = new Set<string>();

  const independentOf = (ignoreHost: boolean) =>
    remaining.filter(
      (e) =>
        !remaining.some(
          (other) =>
            other !== e &&
            dependsOn(e, other) &&
            !(ignoreHost && e.hostedOn && e.hostedOn === other.sourceId),
        ),
    );

  while (remaining.length > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      const e = remaining[i]!;
      if (!e.lingering && blankedSources.has(e.sourceId))
        remaining.splice(i, 1);
    }
    if (remaining.length === 0) break;

    let batch = independentOf(false);
    if (batch.length === 0) batch = independentOf(true);
    if (batch.length === 0) {
      unsettledLoops.push([...remaining]);
      batch = [remaining[0]!];
    }

    for (const e of batch) {
      // An effect earlier in this batch may have blanked this one's source
      // only if this one depended on it, so the batch never needs a recheck.
      applied.push(e);
      for (const t of blanks(e)) blankedSources.add(t);
      remaining.splice(remaining.indexOf(e), 1);
    }
  }

  return { applied, unsettledLoops };
}

/**
 * Apply blanking effects in CR 9.12.1e order: independent first; on a
 * dependency loop, treat hosted sources as independent of their hosts.
 * Effects from static abilities whose source is already blanked are dropped
 * (CR 9.12.1d); lingering ones stay (CR 9.10.1).
 */
export function orderBlankingEffects(
  effects: BlankingEffect[],
): BlankingEffect[] {
  return orderByDependency(
    effects.map((e) => ({ ...e, targetIds: [...e.targetIds] })),
    blankingEffectDependsOn,
    (e) => e.targetIds,
  ).applied;
}

/**
 * Hush: "Host ice cannot gain abilities" (CR 1.2.1). It is part of the same
 * static ability as Hush's blank (`blanksHostAbilities`), so it applies while
 * Hush is active and that ability is not itself blanked (CR 9.12.1d).
 */
export function iceCannotGainAbilities(
  state: GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice") return false;
  const hushes = (ice.hostedCardIds ?? []).filter(
    (id) =>
      state.cards[id]?.blanksHostAbilities === true && isCardActive(state, id),
  );
  if (hushes.length === 0) return false;
  const blanked = resolveBlankedCardIds(state);
  return hushes.some((id) => !blanked.has(id));
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
type HostSubtypeGrantEffect = {
  kind: "host_grant_bcs";
  id: string;
  sourceId: string;
  targetIceId: string;
};

/** Sub Boost-class: hosted condition grants barrier to its host ice. */
type HostBarrierGrantEffect = {
  kind: "host_grant_barrier";
  id: string;
  sourceId: string;
  targetIceId: string;
};

/**
 * Mother Goddess-class: rezzed ice gains subtypes of other rezzed ice
 * (including subtypes those ice only gained from earlier continuous grants).
 */
type MotherGoddessSubtypeEffect = {
  kind: "mother_goddess";
  id: string;
  sourceId: string;
  targetIceId: string;
};

export type SubtypeGrantEffect =
  HostSubtypeGrantEffect | HostBarrierGrantEffect | MotherGoddessSubtypeEffect;

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
    if (!isCardActive(state, id)) continue;

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

/** One step of the ice subtype layer: a blank, or a subtype change. */
type SubtypeLayerStep = LayeredEffect &
  (
    | { layer: "blank"; targetIds: string[] }
    | {
        layer: "subtype";
        targetIceId: string;
        gain: readonly string[];
        lose: readonly string[];
        /** Mother Goddess: gains each other rezzed ice's subtypes as they are when it applies. */
        copyOtherRezzedIce?: boolean;
      }
  );

/**
 * CR 9.12.1d dependencies in the subtype layer. A step from a static ability
 * depends on a blank of its source. Mother Goddess depends on every subtype
 * change to another rezzed ice, since that changes what it copies.
 */
function subtypeStepDependsOn(
  state: GameState,
  a: SubtypeLayerStep,
  b: SubtypeLayerStep,
): boolean {
  if (a === b) return false;
  if (b.layer === "blank") {
    return !a.lingering && b.targetIds.includes(a.sourceId);
  }
  return (
    a.layer === "subtype" &&
    a.copyOtherRezzedIce === true &&
    b.targetIceId !== a.targetIceId &&
    Boolean(state.cards[b.targetIceId]?.rezzed)
  );
}

/** The blanks and subtype changes of the layer, in collection order. */
function collectSubtypeLayerSteps(state: GameState): SubtypeLayerStep[] {
  const steps: SubtypeLayerStep[] = collectBlankingEffects(state).map((e) => ({
    ...e,
    layer: "blank" as const,
  }));
  const grants = collectSubtypeGrantEffects(state);
  const BCS = ["barrier", "code gate", "sentry"] as const;
  for (const e of grants) {
    if (e.kind === "mother_goddess") continue;
    steps.push({
      layer: "subtype",
      id: e.id,
      sourceId: e.sourceId,
      hostedOn: e.targetIceId,
      targetIceId: e.targetIceId,
      gain: e.kind === "host_grant_bcs" ? BCS : ["barrier"],
      lose: [],
    });
  }
  for (const server of Object.values(state.servers)) {
    for (const iceId of server.ice) {
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") continue;
      const enc = state.run?.encounter;
      if (enc?.iceId === iceId && enc.grantedSubtypes?.length) {
        steps.push({
          layer: "subtype",
          id: `encounter-subtypes:${iceId}`,
          sourceId: `encounter:${iceId}`,
          lingering: true,
          targetIceId: iceId,
          gain: enc.grantedSubtypes,
          lose: [],
        });
      }
      for (const effect of state.lingeringEffects) {
        if (effect.expired || effect.kind !== LINGERING_KIND_GRANTED_SUBTYPES) {
          continue;
        }
        const payload = effect.payload as
          { cardId?: string; subtypes?: string[] } | undefined;
        if (payload?.cardId !== iceId) continue;
        steps.push({
          layer: "subtype",
          id: `lingering-subtypes:${effect.id}`,
          sourceId: effect.createdBy,
          lingering: true,
          targetIceId: iceId,
          gain: payload.subtypes ?? [],
          lose: [],
        });
      }
      // Wendigo-class: the ice's own static swap at an odd advancement
      // count. It comes from the ice's ability, so a blank of the ice drops
      // it (CR 9.12.1d).
      const morph = ice.morphOddAdvancementSubtypeSwap;
      if (morph && (ice.advancementCounters ?? 0) % 2 === 1) {
        steps.push({
          layer: "subtype",
          id: `morph:${iceId}`,
          sourceId: iceId,
          targetIceId: iceId,
          gain: [morph.gain],
          lose: [morph.lose],
        });
      }
    }
  }
  for (const e of grants) {
    if (e.kind !== "mother_goddess") continue;
    steps.push({
      layer: "subtype",
      id: e.id,
      sourceId: e.sourceId,
      targetIceId: e.targetIceId,
      gain: [],
      lose: [],
      copyOtherRezzedIce: true,
    });
  }
  return steps;
}

function orderSubtypeLayer(
  state: GameState,
): DependencyOrder<SubtypeLayerStep> {
  return orderByDependency(
    collectSubtypeLayerSteps(state),
    (a, b) => subtypeStepDependsOn(state, a, b),
    (e) => (e.layer === "blank" ? e.targetIds : []),
  );
}

/**
 * Effective ice subtypes (CR 9.12.1b, 9.12.1d–e). Start from printed
 * subtypes, then apply the blanks and subtype changes in dependency order
 * (`orderByDependency`, shared with the blanking order): host grants (Egret,
 * Chromatophores, Sub Boost), encounter and lingering grants, the morph swap
 * at an odd advancement count, and Mother Goddess copying other rezzed ice
 * after their own changes. Each subtype is counted added and removed.
 */
export function resolveIceSubtypeMap(state: GameState): Map<string, string[]> {
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

  for (const step of orderSubtypeLayer(state).applied) {
    if (step.layer !== "subtype") continue;
    const counts = ensure(step.targetIceId);
    for (const subtype of step.lose) loseSubtype(counts, subtype);
    for (const subtype of step.gain) gainSubtype(counts, subtype);
    if (!step.copyOtherRezzedIce) continue;
    if (!state.cards[step.targetIceId]?.rezzed) continue;
    for (const server of Object.values(state.servers)) {
      for (const otherId of server.ice) {
        if (otherId === step.targetIceId) continue;
        if (!state.cards[otherId]?.rezzed) continue;
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

/**
 * Loops in the ice subtype layer that CR 9.12.1e does not settle (no hosted
 * source to break them), each applied in collection order. A CR gap, for
 * tests and debugging; empty on every reachable board today.
 */
export function unsettledSubtypeLoops(state: GameState): string[][] {
  return orderSubtypeLayer(state).unsettledLoops.map((loop) =>
    loop.map((e) => e.id),
  );
}

/** Effective subtypes for one ice via the continuous subtype layer. */
export function resolveIceSubtypes(state: GameState, iceId: string): string[] {
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice") {
    // Non-ice or missing: preserve prior behavior (printed only).
    return ice?.subtypes ? [...ice.subtypes] : [];
  }
  return resolveIceSubtypeMap(state).get(iceId) ?? [...(ice.subtypes ?? [])];
}

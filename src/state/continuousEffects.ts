/**
 * Practical continuous-effect dependency resolution for blanking-class
 * abilities (CR 9.12.1d / 9.12.1e) — enough for Hush × Magnet loops and
 * Magnet continuous hosted-program blanks, without a full CR→AST compiler.
 */
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
 * temporary `abilitiesBlanked` flags (Magnet on-host / Klevetnik), and
 * Light the Fire root blank.
 */
export function collectBlankingEffects(state: GameState): BlankingEffect[] {
  const effects: BlankingEffect[] = [];

  // Hush-class: hosted trojan blanks host ice abilities (printed subs remain).
  for (const id of state.runner.rig) {
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
      const hosted = state.runner.rig.filter(
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

  // Lingering abilitiesBlanked flags (Magnet onRez host / Klevetnik-class).
  // When the flag sits on a program hosted on Magnet-class ice, treat it as
  // originating from that ice so Hush×Magnet dependency loops form correctly.
  for (const id of Object.keys(state.cards)) {
    const card = state.cards[id];
    if (!card?.abilitiesBlanked) continue;
    const host = card.hostId ? state.cards[card.hostId] : undefined;
    if (host?.hostedProgramsLoseAbilities) {
      // Covered by continuous Magnet effect above when host is still active;
      // still record a distinct edge so onRez-set flags participate in loops
      // even if collect order differs.
      effects.push({
        id: `flag-blank-via-host:${id}`,
        sourceId: card.hostId!,
        targetIds: [id],
      });
      continue;
    }
    // Klevetnik / other temporary blanks — no cross-effect dependency.
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

  // Direct Access: blank both identities for the run.
  if (run?.blankIdentities) {
    effects.push({
      id: `blank-identities:${run.runSourceId ?? "run"}`,
      sourceId: run.runSourceId ?? "run",
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

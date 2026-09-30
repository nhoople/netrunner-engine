/**
 * Static-condition power-counter thresholds
 * (Environmental Testing–class; CR §9.6.7).
 */

import { evalEffect } from "../effects/eval.js";
import { CR } from "../timing/labels.js";
import { log } from "./createGame.js";
import type { CardInstance, GameState } from "./types.js";
import type { Effect } from "../effects/ir.js";

/**
 * After power counters on `cardId` increase, if the card declares
 * `onPowerCountersGte` and current count ≥ amount, evaluate its effect.
 * Models mandatory static-condition abilities like Environmental Testing's
 * "When there are 4 or more hosted power counters…".
 */
export function maybeFirePowerCountersGte(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onPowerCountersGte) return;
  const { amount, effect } = card.onPowerCountersGte;
  if ((card.powerCounters ?? 0) < amount) return;
  if (state.done) return;

  log(
    state,
    `${card.title} — ${card.powerCounters} power ≥ ${amount} (CR ${CR.staticCondition.number}).`,
  );
  const r = evalEffect({ state, sourceId: cardId }, effect);
  if (!r.ok) {
    log(
      state,
      `onPowerCountersGte failed on ${card.title}: ${r.error}`,
    );
  }
}

/**
 * Envelopment-class: ice gains an ETR subroutine before printed ones
 * for each hosted power counter. Rebuilds `subroutines` from
 * `baseSubroutines` + N synthetic ETR leaves.
 */
export function syncEtrPerPowerCounterSubs(card: CardInstance): void {
  if (!card.etrSubroutinesPerPowerCounter) return;
  if (!card.baseSubroutines) {
    card.baseSubroutines = card.subroutines
      ? structuredClone(card.subroutines)
      : [];
  }
  const n = Math.max(0, card.powerCounters ?? 0);
  const etrEffect: Effect = {
    op: "do",
    action: { kind: "end_the_run" },
  };
  const etrSubs = Array.from({ length: n }, (_, i) => ({
    id: `${card.defId}-etr-power-${i}`,
    text: "End the run.",
    effect: structuredClone(etrEffect),
  }));
  card.subroutines = [...etrSubs, ...structuredClone(card.baseSubroutines)];
}

/**
 * Woodcutter/Tyrant-class: gains one copy of a subroutine template per
 * hosted advancement counter (after printed ones).
 */
export function syncGainsSubroutinesPerAdvancement(
  card: CardInstance,
): void {
  const spec = card.gainsSubroutinesPerAdvancement;
  if (!spec) return;
  if (!card.baseSubroutines) {
    card.baseSubroutines = card.subroutines
      ? structuredClone(card.subroutines)
      : [];
  }
  const n = Math.max(0, card.advancementTokens ?? 0);
  const extras = Array.from({ length: n }, (_, i) => ({
    ...structuredClone(spec.subroutine),
    id: `${spec.subroutine.id}-${i}`,
  }));
  card.subroutines = [...structuredClone(card.baseSubroutines), ...extras];
}

/**
 * Blockchain-class: gains floor(faceup matching Archives / per) copies of a
 * subroutine before printed ones. Call at encounter begin (and when Archives
 * faceup count changes while encountered, if wired).
 */
export function syncGainsSubroutinesBeforePrintedPerFaceupArchives(
  state: GameState,
  card: CardInstance,
): void {
  const spec = card.gainsSubroutinesBeforePrintedPerFaceupArchives;
  if (!spec) return;
  if (!card.baseSubroutines) {
    card.baseSubroutines = card.subroutines
      ? structuredClone(card.subroutines)
      : [];
  }
  let faceup = 0;
  for (const id of state.corp.discard) {
    const c = state.cards[id];
    if (!c?.faceup) continue;
    if (c.type !== spec.type) continue;
    if (!(c.subtypes ?? []).includes(spec.subtype)) continue;
    faceup += 1;
  }
  const per = Math.max(1, spec.per);
  const n = Math.floor(faceup / per);
  const extras = Array.from({ length: n }, (_, i) => ({
    ...structuredClone(spec.subroutine),
    id: `${spec.subroutine.id}-${i}`,
  }));
  card.subroutines = [...extras, ...structuredClone(card.baseSubroutines)];
}

/** Echo-class: place 1 power on each ice with powerCounterOnHarmonicIceRez. */
export function firePowerOnHarmonicIceRez(
  state: GameState,
  rezzedIceId: string,
): void {
  const rezzed = state.cards[rezzedIceId];
  if (!rezzed || !(rezzed.subtypes ?? []).includes("harmonic")) return;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const card = state.cards[id];
      if (!card?.powerCounterOnHarmonicIceRez) continue;
      // Include the just-rezzed Echo itself if it has the flag.
      card.powerCounters = (card.powerCounters ?? 0) + 1;
      log(
        state,
        `${card.title} — place 1 power (harmonic ice rezzed: ${rezzed.title}) → ${card.powerCounters}.`,
      );
      syncEtrPerPowerCounterSubs(card);
    }
  }
}

/**
 * Cybersand / Ice Analyzer: place N hosted credits on each active card with
 * `hostedCreditsOnAnyIceRez` when any ice is rezzed (rezzed Corp cards, or
 * installed Runner cards).
 */
export function fireHostedCreditsOnAnyIceRez(
  state: GameState,
  rezzedIceId: string,
): void {
  const rezzed = state.cards[rezzedIceId];
  if (!rezzed || rezzed.type !== "ice") return;
  for (const card of Object.values(state.cards)) {
    const n = card.hostedCreditsOnAnyIceRez;
    if (!n) continue;
    const active =
      card.side === "runner"
        ? state.runner.rig.includes(card.id)
        : Boolean(card.rezzed);
    if (!active) continue;
    card.hostedCredits = (card.hostedCredits ?? 0) + n;
    log(
      state,
      `${card.title} — place ${n}¢ (ice rezzed: ${rezzed.title}) → ${card.hostedCredits}.`,
    );
  }
}

/**
 * Working Prototype: place N power on each rezzed card with
 * `powerCounterOnAnyCardRez` whenever any card is rezzed (including self).
 */
export function firePowerCounterOnAnyCardRez(
  state: GameState,
  rezzedId: string,
): void {
  const rezzed = state.cards[rezzedId];
  if (!rezzed?.rezzed) return;
  for (const card of Object.values(state.cards)) {
    const n = card.powerCounterOnAnyCardRez;
    if (!n || !card.rezzed) continue;
    // Corp assets/upgrades/ice that are rezzed in play.
    if (card.side === "corp" && !card.zone.includes("server:")) continue;
    card.powerCounters = (card.powerCounters ?? 0) + n;
    log(
      state,
      `${card.title} — place ${n} power (card rezzed: ${rezzed.title}) → ${card.powerCounters}.`,
    );
  }
}

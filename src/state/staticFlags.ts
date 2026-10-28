/**
 * Static declarations the loader copies onto a card. Each function runs at
 * the moment that declaration names.
 */
import { log } from "./createGame.js";
import { abilitiesSuppressed } from "./abilities.js";
import { agendaPointsFor } from "./scoring.js";
import type { CardInstance, GameState, ServerId } from "./types.js";
import { CR } from "../timing/labels.js";
import { fireWouldTakeBadPublicity } from "./storedTriggers.js";
import { fireFirstBadPublicityTake } from "./badPublicityHooks.js";
import { onIceRezzed } from "./cardDeclarations.js";

function rezzedWith<K extends keyof CardInstance>(
  state: GameState,
  field: K,
): CardInstance[] {
  const out: CardInstance[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (card?.rezzed && card[field]) out.push(card);
    }
  }
  return out;
}

export function onCardRezzed(state: GameState, card: CardInstance): void {
  const bp = card.badPublicityOnRez ?? 0;
  if (bp > 0) {
    state.turn.pendingBadPublicityTake = bp;
    if (!fireWouldTakeBadPublicity(state)) {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + bp;
      log(
        state,
        `${card.title} — take ${bp} bad publicity on rez → ${state.corp.badPublicity}.`,
      );
      fireFirstBadPublicityTake(state, bp);
    }
  }
  if (card.type === "ice") onIceRezzed(state, card.id);
  for (const host of rezzedWith(state, "placePowerCounterOnAnyCardRez")) {
    host.powerCounters = (host.powerCounters ?? 0) + 1;
    log(
      state,
      `${host.title} — place 1 power (a card was rezzed) → ${host.powerCounters}.`,
    );
  }
}

export function onCorpDrew(state: GameState, count: number): void {
  if (count <= 0) return;
  const draws = (state.turn.corpDrawsThisTurn ?? 0) + 1;
  state.turn.corpDrawsThisTurn = draws;
  if (draws === 1) return;
  for (const card of rezzedWith(state, "corpLosesCreditsOnNonFirstDrawThisTurn")) {
    const n = card.corpLosesCreditsOnNonFirstDrawThisTurn ?? 0;
    if (n <= 0) continue;
    state.corp.credits = Math.max(0, state.corp.credits - n);
    log(
      state,
      `${card.title} — Corp loses ${n}¢ (not the first draw this turn) → ${state.corp.credits}¢.`,
    );
  }
}

export function onRunnerDrew(state: GameState): void {
  if (state.turn.runnerDrewThisTurn) return;
  state.turn.runnerDrewThisTurn = true;
  for (const card of rezzedWith(state, "gainCreditOnFirstRunnerDrawEachTurn")) {
    state.corp.credits += 1;
    log(
      state,
      `${card.title} — gain 1¢ (first Runner draw this turn) → ${state.corp.credits}¢.`,
    );
  }
}

export function basicDrawBonus(state: GameState): number {
  let bonus = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    bonus += state.cards[id]?.basicDrawBonus ?? 0;
  }
  return bonus;
}

export function onRunnerTurnEnds(state: GameState): void {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.securityTesting || !card.namedServerId) continue;
    card.namedServerId = undefined;
    log(
      state,
      `${card.title} — the chosen server lasts only until this turn ends (CR 9.10.3b).`,
    );
  }
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const n = card?.drawAtTurnEndIfGripBelowMaxHandSize ?? 0;
    if (n <= 0) continue;
    if (state.runner.hand.length >= state.runner.maxHandSize) continue;
    for (let i = 0; i < n && state.runner.deck.length > 0; i++) {
      const drawn = state.runner.deck.shift()!;
      state.runner.hand.push(drawn);
      const moved = state.cards[drawn];
      if (moved) moved.zone = "runner:grip";
    }
    log(state, `${card!.title} — draw ${n} (grip below max hand size).`);
  }
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.trashHostedProgramAtEndOfTurnIfHostedCreditsUsed) continue;
    if (!state.turn.hostedCreditsUsedCardIds?.includes(id)) continue;
    const hosted = (card.hostedCardIds ?? []).filter(
      (hid) => state.cards[hid]?.type === "program",
    );
    for (const hid of hosted) {
      const prog = state.cards[hid]!;
      state.runner.installed = state.runner.installed.filter((x) => x !== hid);
      state.runner.discardPile.push(hid);
      prog.zone = "runner:heap";
      prog.faceup = true;
      log(state, `${card.title} — trash hosted ${prog.title}.`);
    }
  }
}

export function onInstalledCorpCardTrashed(
  state: GameState,
  card: CardInstance,
  wasRezzed: boolean,
): void {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const prog = state.cards[id];
    if (!prog?.placeVirusCounterWhenInstalledCorpCardTrashed) continue;
    prog.virusCounters = (prog.virusCounters ?? 0) + 1;
    log(
      state,
      `${prog.title} — place 1 virus (installed Corp card trashed) → ${prog.virusCounters}.`,
    );
  }
  const bp = wasRezzed ? (card.onTrashWhileRezzedTakeBadPublicity ?? 0) : 0;
  if (bp > 0) {
    state.turn.pendingBadPublicityTake = bp;
    if (!fireWouldTakeBadPublicity(state)) {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + bp;
      log(
        state,
        `${card.title} — take ${bp} bad publicity (trashed while rezzed) → ${state.corp.badPublicity}.`,
      );
      fireFirstBadPublicityTake(state, bp);
    }
  }
}

export function onInstalledProgramTrashed(state: GameState): void {
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.trashSelfWhenInstalledProgramTrashed) continue;
    state.runner.installed = state.runner.installed.filter((x) => x !== id);
    state.runner.discardPile.push(id);
    card.zone = "runner:heap";
    card.faceup = true;
    log(
      state,
      `${card.title} — trash (an installed program was trashed) (CR ${CR.trashing.number}).`,
    );
  }
}

export function onRunnerInstalledProgramOrHardware(state: GameState): void {
  if (!state.turn.runnerInstalledProgramOrHardwareThisTurn) {
    state.turn.runnerInstalledProgramOrHardwareThisTurn = true;
    for (const card of rezzedWith(state, "firstRunnerInstallTrashFromGripEachTurn")) {
      const grip = state.runner.hand[0];
      if (!grip) continue;
      state.runner.hand = state.runner.hand.filter((id) => id !== grip);
      state.runner.discardPile.push(grip);
      const trashed = state.cards[grip];
      if (trashed) {
        trashed.zone = "runner:heap";
        trashed.faceup = true;
      }
      log(state, `${card.title} — trash 1 card from grip.`);
    }
  }
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const n = card?.hostedCreditsOnProgramOrHardwareInstall ?? 0;
    if (n <= 0) continue;
    card.hostedCredits = (card.hostedCredits ?? 0) + n;
    log(state, `${card.title} — place ${n}¢ (program or hardware installed).`);
  }
}

export function corpStartsWithBadPublicity(state: GameState): void {
  const identityId = state.corp.identityId;
  if (abilitiesSuppressed(state, identityId)) return;
  const identity = state.cards[identityId];
  const n = identity?.corpStartsWithBadPublicity ?? 0;
  if (n <= 0 || state.turn.openingBadPublicityApplied) return;
  state.turn.openingBadPublicityApplied = true;
  state.corp.badPublicity = (state.corp.badPublicity ?? 0) + n;
  log(state, `${identity!.title} — Corp starts with ${n} bad publicity.`);
}

export function installBlockReason(
  state: GameState,
  card: CardInstance,
  serverId?: ServerId,
): string | null {
  if (
    card.cannotInstallNonVirtualResources &&
    card.type === "resource" &&
    !(card.subtypes ?? []).includes("virtual")
  ) {
    return `${card.title} cannot install non-virtual resources.`;
  }
  const needBp = card.installRequiresCorpBadPublicityGte ?? 0;
  if (needBp > 0 && (state.corp.badPublicity ?? 0) < needBp) {
    return `${card.title} requires the Corp to have ${needBp} bad publicity.`;
  }
  const needLink = card.installRequiresLinkGte ?? 0;
  if (needLink > 0 && (state.runner.link ?? 0) < needLink) {
    return `${card.title} requires link ${needLink}.`;
  }
  if (card.hqOrRdRootOnly && serverId && serverId !== "hq" && serverId !== "rd") {
    return `${card.title} can only be installed in the root of HQ or R&D.`;
  }
  return null;
}

export function traceBaseBonus(state: GameState): number {
  const serverId = state.run?.attackedServerId;
  if (!serverId) return 0;
  const server = state.servers[serverId];
  if (!server) return 0;
  let bonus = 0;
  for (const id of server.root) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.rezzed) continue;
    bonus += card.traceBaseStrengthBonusDuringRunOnThisServer ?? 0;
  }
  return bonus;
}

export function remoteRootAccessTax(state: GameState, card: CardInstance): number {
  if (!card.zone.includes(":root")) return 0;
  const serverId = card.zone.split(":")[1];
  if (!serverId || serverId === "hq" || serverId === "rd" || serverId === "archives") {
    return 0;
  }
  const identityId = state.corp.identityId;
  if (abilitiesSuppressed(state, identityId)) return 0;
  const identity = state.cards[identityId];
  return identity?.additionalCreditsToAccessRemoteRoot ?? 0;
}

export function breachCreditGain(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  const accessed = run.accessedCardIds?.length ?? 0;
  for (const id of server.root) {
    const card = state.cards[id];
    const per = card?.rezzed ? (card.gainCreditsPerCardAccessedDuringBreach ?? 0) : 0;
    if (per <= 0 || accessed <= 0) continue;
    const gain = per * accessed;
    state.corp.credits += gain;
    log(
      state,
      `${card!.title} — gain ${gain}¢ (${accessed} card(s) accessed) → ${state.corp.credits}¢.`,
    );
  }
}

export function agendaPointMu(state: GameState): number {
  let bonus = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (card?.muEqualsAgendaPoints) bonus += agendaPointsFor(state, "runner");
  }
  return bonus;
}

export function agendaPointHandSize(state: GameState): number {
  let bonus = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (card?.handSizeEqualsAgendaPoints) bonus += agendaPointsFor(state, "runner");
  }
  return bonus;
}

export function corpHandSizeFromBadPublicity(state: GameState): number {
  let bonus = 0;
  const bp = state.corp.badPublicity ?? 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const per = state.cards[id]?.corpHandSizeBonusPerBadPublicity ?? 0;
    bonus += per * bp;
  }
  return bonus;
}

export interface DeckEntry {
  defId: string;
  influence?: number;
  faction?: string;
  type?: string;
  deckLimit?: number;
  deckLimitOne?: boolean;
  zeroInfluenceIfIceInDeckLte?: number;
  zeroInfluenceIfCardsInDeckGte?: number;
  zeroInfluenceIfAssetsInDeckGte?: number;
  zeroInfluenceIfNonAllianceFactionCardsGte?: number;
  zeroInfluenceIfCardCopiesGte?: number;
}

/** Copies above a printed deck limit, and influence after a deckbuilding reduction. */
export function deckbuildingReport(entries: DeckEntry[]): {
  overLimit: string[];
  influence: number;
} {
  const counts = new Map<string, number>();
  let ice = 0;
  let assets = 0;
  let nonAlliance = 0;
  for (const entry of entries) {
    counts.set(entry.defId, (counts.get(entry.defId) ?? 0) + 1);
    if (entry.type === "ice") ice += 1;
    if (entry.type === "asset") assets += 1;
    if (entry.faction && entry.faction !== "neutral-corp" && entry.faction !== "neutral-runner" && entry.faction !== "alliance") {
      nonAlliance += 1;
    }
  }
  const overLimit: string[] = [];
  let influence = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.defId)) continue;
    seen.add(entry.defId);
    const copies = counts.get(entry.defId) ?? 0;
    const limit = entry.deckLimitOne ? 1 : (entry.deckLimit ?? 3);
    if (copies > limit) overLimit.push(entry.defId);
    let cost = entry.influence ?? 0;
    if (
      entry.zeroInfluenceIfIceInDeckLte !== undefined &&
      ice <= entry.zeroInfluenceIfIceInDeckLte
    ) {
      cost = 0;
    }
    if (
      entry.zeroInfluenceIfCardsInDeckGte !== undefined &&
      entries.length >= entry.zeroInfluenceIfCardsInDeckGte
    ) {
      cost = 0;
    }
    if (
      entry.zeroInfluenceIfAssetsInDeckGte !== undefined &&
      assets >= entry.zeroInfluenceIfAssetsInDeckGte
    ) {
      cost = 0;
    }
    if (
      entry.zeroInfluenceIfNonAllianceFactionCardsGte !== undefined &&
      nonAlliance >= entry.zeroInfluenceIfNonAllianceFactionCardsGte
    ) {
      cost = 0;
    }
    if (
      entry.zeroInfluenceIfCardCopiesGte !== undefined &&
      copies >= entry.zeroInfluenceIfCardCopiesGte
    ) {
      cost = 0;
    }
    influence += cost * copies;
  }
  return { overLimit, influence };
}

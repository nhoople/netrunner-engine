/**
 * Static declarations that name one card's procedure. Each function runs
 * at the moment that declaration describes.
 */
import { subtractRunnerCreditPool } from "./costs.js";
import { log } from "./createGame.js";
import type { CardInstance, GameState, ServerId, Side } from "./types.js";
import { runnerWinsOnEmptyRnd } from "./emptyRnd.js";
import { CR } from "../timing/labels.js";
import { fx } from "../effects/ir.js";
import { startTrace } from "./trace.js";
import { memoryLimit, usedMemory } from "./turn.js";

const noop = (side: Side) => fx.do({ kind: "gain_credits", side, amount: 0 });

function offer(
  state: GameState,
  sourceId: string,
  chooser: Side,
  options: Array<{ id: string; label: string }>,
): boolean {
  if (state.pendingChoice || state.trace || state.psi || state.done) return false;
  state.pendingChoice = {
    sourceId,
    chooser,
    options: options.map((option) => ({
      ...option,
      effect: noop(chooser),
    })),
  };
  return true;
}

export function badPublicityConsidered(state: GameState): number {
  let n = state.corp.badPublicity ?? 0;
  for (const card of Object.values(state.cards)) {
    if (!card) continue;
    if (card.zone !== "runner:play-area" && card.zone !== "corp:play-area") continue;
    const extra = card.corpAdditionalBadPublicity ?? 0;
    if (extra <= 0) continue;
    n += extra;
    if (card.corpAdditionalBadPublicityCannotBeRemoved) {
      // The additional publicity is not in the removable pool.
    }
  }
  return n;
}

export function runnerHeapLocked(state: GameState): boolean {
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (card?.rezzed && card.cardsCannotLeaveRunnerHeap) return true;
    }
  }
  return false;
}

export function gripRevealed(state: GameState): boolean {
  if ((state.runner.tags ?? 0) <= 0) return false;
  const identity = state.cards[state.corp.identityId];
  if (identity?.revealGripWhileRunnerTagged) return true;
  return state.runner.installed.some(
    (id) => state.cards[id]?.revealGripWhileRunnerTagged,
  );
}

export function consideredAdvancement(state: GameState, card: CardInstance): number {
  let n = card.advancementCounters ?? 0;
  if (card.type !== "ice") return n;
  const server = Object.values(state.servers).find((s) => s.ice.includes(card.id));
  if (!server) return n;
  for (const id of server.root) {
    const upgrade = state.cards[id];
    if (!upgrade?.rezzed) continue;
    n += upgrade.iceProtectingThisServerAdditionalAdvancementCounters ?? 0;
  }
  return n;
}

export function virusCountersAvailable(state: GameState, card: CardInstance): number {
  let n = card.virusCounters ?? 0;
  if (card.type !== "program" || !(card.subtypes ?? []).includes("virus")) return n;
  if (card.hivemindSharesVirusCounters) return n;
  for (const id of state.runner.installed) {
    const hive = state.cards[id];
    if (hive?.hivemindSharesVirusCounters) n += hive.virusCounters ?? 0;
  }
  return n;
}

export function spendVirusCounters(state: GameState, card: CardInstance, amount: number): void {
  let left = amount;
  const own = Math.min(left, card.virusCounters ?? 0);
  card.virusCounters = (card.virusCounters ?? 0) - own;
  left -= own;
  if (left <= 0 || card.hivemindSharesVirusCounters) return;
  for (const id of state.runner.installed) {
    const hive = state.cards[id];
    if (!hive?.hivemindSharesVirusCounters || left <= 0) continue;
    const take = Math.min(left, hive.virusCounters ?? 0);
    hive.virusCounters = (hive.virusCounters ?? 0) - take;
    left -= take;
  }
}

export function hostLimitReason(
  state: GameState,
  host: CardInstance,
  guest: CardInstance,
): string | null {
  if (host.hostAssetsOnly && guest.type !== "asset") {
    return `${host.title} can only host assets.`;
  }
  if (
    host.hostAssetsOrAgendas &&
    guest.type !== "asset" &&
    guest.type !== "agenda"
  ) {
    return `${host.title} can only host assets and agendas.`;
  }
  if (
    host.daemonHostVirusProgramsOnly &&
    (guest.type !== "program" || !(guest.subtypes ?? []).includes("virus"))
  ) {
    return `${host.title} can only host virus programs.`;
  }
  if (host.daemonHostMaxMuFromInstalledCopiesOfSelf && guest.type === "program") {
    const copies = state.runner.installed.filter(
      (id) => state.cards[id]?.defId === host.defId,
    ).length;
    if ((guest.memoryCost ?? 0) > Math.max(1, copies)) {
      return `${guest.title} uses more memory than ${host.title} can host.`;
    }
  }
  return null;
}

export function daemonInstallDiscount(host: CardInstance | undefined): number {
  return host?.daemonHostInstallCreditDiscount ?? 0;
}

export function ensureConditionalSubroutine(state: GameState, ice: CardInstance): void {
  if (!ice.gainsEtrSubroutineWhileCurrentActive) return;
  const current = Object.values(state.cards).some(
    (card) =>
      (card.zone === "corp:play-area" || card.zone === "runner:play-area") &&
      (card.subtypes ?? []).includes("current"),
  );
  const mark = `${ice.id}:conditional-etr`;
  const has = (ice.subroutines ?? []).some((sub) => sub.id === mark);
  if (current && !has) {
    ice.subroutines = [
      ...(ice.subroutines ?? []),
      {
        id: mark,
        text: "End the run.",
        effect: fx.do({ kind: "end_the_run" }),
      },
    ];
    log(state, `${ice.title} gains End the run while a current is active.`);
  }
  if (!current && has) {
    ice.subroutines = (ice.subroutines ?? []).filter((sub) => sub.id !== mark);
  }
}

export function noteApproachIce(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (ice) ensureConditionalSubroutine(state, ice);
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.mayExposeApproachedIceThenMayTrashSelfToJackOut) continue;
    if (
      offer(state, id, "runner", [
        { id: `decl:gpi-expose:${id}:${iceId}`, label: `Expose ${ice?.title ?? "ice"}` },
        { id: `decl:gpi-skip:${id}`, label: "Decline" },
      ])
    ) {
      return;
    }
  }
}

export function noteEncounterIce(state: GameState, iceId: string): void {
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    const spec = card?.onEncounterMayPayCreditsGrantIceSubtype;
    if (!spec || state.turn.engoloUsedThisTurn) continue;
    const cost = spec.credits;
    const subtype = spec.subtype;
    if (
      offer(state, id, "runner", [
        {
          id: `decl:engolo:${id}:${iceId}:${cost}:${subtype}`,
          label: `Pay ${cost}¢ to give ${subtype}`,
        },
        { id: "decl:decline", label: "Decline" },
      ])
    ) {
      state.turn.engoloUsedThisTurn = true;
      return;
    }
  }
}

export function onSuccessfulRunEnded(state: GameState): void {
  const run = state.run;
  if (!run?.successful) return;
  const server = state.servers[run.attackedServerId];
  if (server) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks) {
        continue;
      }
      if (state.runner.credits < 6 || state.runner.clicks <= 0) {
        state.corpAllottedClicksDeltaNextTurn =
          (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
        log(state, `${card.title} — Corp has +1 allotted click next turn.`);
      }
    }
  }
  if (run.attackedServerId === "hq") state.turn.hqRunPaidWindowOpen = true;
  if (run.attackedServerId === "rd") {
    for (const id of state.runner.installed) {
      const card = state.cards[id];
      if (!card?.onSuccessfulRdRunMayReplaceSpentRecurringCredit) continue;
      if ((card.recurringCredits ?? 0) < (card.recurringCreditsMax ?? 0)) {
        card.recurringCredits = (card.recurringCredits ?? 0) + 1;
        log(state, `${card.title} — replace 1 spent recurring credit.`);
        break;
      }
    }
  }
  const remote = server?.kind === "remote";
  if (
    remote &&
    run.breached &&
    !state.turn.kasiFiredThisTurn &&
    !run.breachStoleOrTrashed
  ) {
    for (const id of state.runner.installed) {
      const card = state.cards[id];
      if (!card?.placePowerOnFirstSuccessfulRemoteRunEndIfBreachedNoSteal) continue;
      state.turn.kasiFiredThisTurn = true;
      card.powerCounters = (card.powerCounters ?? 0) + 1;
      log(state, `${card.title} — place 1 power → ${card.powerCounters}.`);
      notePowerCounters(state, card);
    }
  }
}

export function notePowerCounters(state: GameState, card: CardInstance): void {
  if ((card.powerCounters ?? 0) > 0) card.powerHosted = true;
  const threshold = card.scoreWhenPowerGte?.threshold ?? 0;
  if (threshold > 0 && (card.powerCounters ?? 0) >= threshold && card.zone === "runner:installed") {
    state.runner.installed = state.runner.installed.filter((id) => id !== card.id);
    state.runner.scoreArea.push(card.id);
    card.zone = "runner:score";
    card.faceup = true;
    card.convertedInto = "agenda";
    log(state, `${card.title} is added to the Runner's score area as an agenda.`);
    return;
  }
  if (
    (card.trashWhenPowerEmpty || card.trashWhenPowerCountersEmpty) &&
    card.powerHosted &&
    (card.powerCounters ?? 0) === 0 &&
    card.zone.startsWith("server:")
  ) {
    const serverId = card.zone.split(":")[1] as ServerId;
    const server = state.servers[serverId];
    if (server) {
      server.root = server.root.filter((id) => id !== card.id);
      server.ice = server.ice.filter((id) => id !== card.id);
    }
    state.corp.discardPile.push(card.id);
    card.zone = "corp:archives";
    card.faceup = true;
    card.rezzed = false;
    log(state, `${card.title} is trashed — power counters are empty.`);
  }
}

export function onRunnerTurnBegan(state: GameState): void {
  for (const id of state.runner.installed) {
    const shop = state.cards[id];
    if (!shop?.aesopPawnshop || shop.onTurnBegin) continue;
    const targets = state.runner.installed.filter((other) => other !== id);
    offer(state, id, "runner", [
      ...targets.slice(0, 8).map((other) => ({
        id: `decl:aesop:${other}`,
        label: `Trash ${state.cards[other]?.title ?? other} and gain 3¢`,
      })),
      { id: "decl:decline", label: "Decline" },
    ]);
  }
  for (const id of [...state.runner.installed]) {
    const host = state.cards[id];
    if (!host?.personalWorkshop) continue;
    for (const hid of [...(host.hostedCardIds ?? [])]) {
      const guest = state.cards[hid];
      if (!guest) continue;
      if ((guest.powerCounters ?? 0) > 0) {
        guest.powerCounters = (guest.powerCounters ?? 0) - 1;
        log(state, `${host.title} — remove 1 power from ${guest.title} → ${guest.powerCounters}.`);
      }
      if ((guest.powerCounters ?? 0) <= 0) {
        host.hostedCardIds = (host.hostedCardIds ?? []).filter((x) => x !== hid);
        guest.hostId = undefined;
        state.runner.installed.push(hid);
        guest.zone = "runner:installed";
        guest.faceup = true;
        log(state, `${guest.title} is installed from ${host.title}, ignoring costs.`);
      }
    }
  }
}

export function onCorpCardInstalledInRemote(state: GameState): void {
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.placePowerCounterOnInstallCardInRemoteRoot) continue;
      if (server.kind !== "remote") continue;
      card.powerCounters = (card.powerCounters ?? 0) + 1;
      log(state, `${card.title} — place 1 power (remote root install) → ${card.powerCounters}.`);
    }
  }
}

export function onCardAdvanced(state: GameState, cardId: string): void {
  if (state.turn.oberthFiredThisTurn) return;
  const card = state.cards[cardId];
  if (!card) return;
  const serverId = card.zone.split(":")[1] as ServerId | undefined;
  const server = serverId ? state.servers[serverId] : undefined;
  if (!server) return;
  for (const id of server.root) {
    const upgrade = state.cards[id];
    const n = upgrade?.rezzed ? (upgrade.oberthFirstAdvanceThisServerAdditionalAdvancement ?? 0) : 0;
    if (n <= 0 || upgrade.id === cardId) continue;
    card.advancementCounters = (card.advancementCounters ?? 0) + n;
    state.turn.oberthFiredThisTurn = true;
    log(state, `${upgrade.title} — place ${n} additional advancement on ${card.title}.`);
    return;
  }
}

export function onIceRezzed(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice") return;
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.mayMoveAnyAdvancementsFromSelfToRezzedIce) continue;
      if ((card.advancementCounters ?? 0) <= 0) continue;
      offer(state, id, "corp", [
        { id: `decl:anson:${id}:${iceId}`, label: `Move advancements to ${ice.title}` },
        { id: "decl:decline", label: "Decline" },
      ]);
      return;
    }
  }
}

export function onAgendaScored(state: GameState, agenda: CardInstance): void {
  const subs = (agenda.subtypes ?? []).map((s) => s.toLowerCase());
  if (!subs.includes("initiative") && !subs.includes("security")) return;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    const base = card?.archivistOnCorpScoresInitiativeOrSecurityTrace ?? 0;
    if (base <= 0) continue;
    startTrace(
      state,
      id,
      base,
      noop("corp"),
      fx.do({ kind: "suffer_bad_publicity", amount: 1 }),
    );
    log(state, `${card.title} — trace ${base} (Corp scored ${agenda.title}).`);
    return;
  }
}

export function onAccessed(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  if (
    card.addToCorpScoreOnAccessIfRunnerTagged &&
    (state.runner.tags ?? 0) > 0 &&
    card.zone !== "corp:score"
  ) {
    const zone = card.zone;
    if (zone === "corp:hq") state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
    if (zone === "corp:rd") state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
    if (zone === "corp:archives") {
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
    }
    state.corp.scoreArea.push(cardId);
    card.zone = "corp:score";
    card.faceup = true;
    card.rezzed = true;
    log(state, `${card.title} is added to the Corp's score area (Runner is tagged).`);
    return;
  }
  if (card.type !== "agenda") {
    const cost = card.rezCost ?? card.playCost ?? 0;
    const khumaloIds = state.runner.installed.includes(state.runner.identityId)
      ? state.runner.installed
      : [...state.runner.installed, state.runner.identityId];
    for (const id of khumaloIds) {
      const khumalo = state.cards[id];
      if (!khumalo?.accessTrashNonAgendaWithVirusEqualPrintedCost) continue;
      if (state.turn.khumaloUsedThisTurn) continue;
      if (virusCountersAvailable(state, khumalo) < cost) continue;
      offer(state, id, "runner", [
        { id: `decl:khumalo:${id}:${cardId}:${cost}`, label: `Trash it for ${cost} virus` },
        { id: "decl:decline", label: "Decline" },
      ]);
      return;
    }
  }
}

export function onAccessFinishedWithoutStealOrTrash(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card || card.zone === "corp:archives" || state.turn.mawFiredThisTurn) return;
  if (state.run?.breachStoleOrTrashed) return;
  for (const id of state.runner.installed) {
    const maw = state.cards[id];
    if (!maw?.mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq) continue;
    state.turn.mawFiredThisTurn = true;
    const hq = [...state.corp.hand];
    if (hq.length === 0) {
      log(state, `${maw.title} — HQ is empty.`);
      return;
    }
    const pick = hq[hq.length - 1]!;
    state.corp.hand = hq.filter((x) => x !== pick);
    state.corp.discardPile.push(pick);
    const trashed = state.cards[pick];
    if (trashed) {
      trashed.zone = "corp:archives";
      trashed.faceup = true;
    }
    log(state, `${maw.title} — Corp trashes 1 card from HQ at random.`);
    return;
  }
}

export function maybeRipDeal(state: GameState): void {
  const run = state.run;
  if (!run || run.attackedServerId !== "hq") return;
  const hqIds = run.accessCandidates.filter((id) => state.cards[id]?.zone === "corp:hq");
  if (hqIds.length === 0) return;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.ripDealHeapInsteadOfHqAccess) continue;
    if (state.runner.discardPile.length === 0) continue;
    offer(state, id, "runner", [
      { id: `decl:rip:${id}:${hqIds.length}`, label: `Add ${hqIds.length} from the heap to the grip` },
      { id: "decl:decline", label: "Access HQ" },
    ]);
    return;
  }
}

export function onFullBreak(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (
    ice &&
    (ice.subtypes ?? []).some((s) => s.toLowerCase() === "ap") &&
    !state.turn.synthDnaFiredThisTurn
  ) {
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.root, ...server.ice]) {
        const card = state.cards[id];
        const n = card?.rezzed ? (card.synthDnaFirstApSubBrokenEachTurnNetDamage ?? 0) : 0;
        if (n <= 0) continue;
        state.turn.synthDnaFiredThisTurn = true;
        state.runner.coreDamage = (state.runner.coreDamage ?? 0) + n;
        log(state, `${card.title} — do ${n} net damage (AP subroutine broken).`);
      }
    }
  }
  if (state.turn.hippoFiredThisTurn || !ice) return;
  const server = Object.values(state.servers).find((s) => s.ice.includes(iceId));
  if (!server || server.ice[0] !== iceId) return;
  for (const id of state.runner.installed) {
    const hippo = state.cards[id];
    if (!hippo?.mayRfgSelfToTrashOutermostIceOnFirstFullBreakEachTurn) continue;
    state.turn.hippoFiredThisTurn = true;
    offer(state, id, "runner", [
      { id: `decl:hippo:${id}:${iceId}`, label: `Remove ${hippo.title} from the game to trash ${ice.title}` },
      { id: "decl:decline", label: "Decline" },
    ]);
    return;
  }
}

export function onPassedAllIce(state: GameState): void {
  if (state.run?.attackedServerId !== "hq" || state.turn.polyhistorFiredThisTurn) return;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.polyhistorPassAllHqIceMayDrawForceCorpDraw) continue;
    state.turn.polyhistorFiredThisTurn = true;
    offer(state, id, "runner", [
      { id: `decl:poly:${id}`, label: "Draw 1 and force the Corp to draw 1" },
      { id: "decl:decline", label: "Decline" },
    ]);
    return;
  }
}

export function onProgramOrHardwareInstalled(state: GameState, cardId: string): void {
  const installed = state.cards[cardId];
  if (!installed) return;
  if (installed.powerCountersOnInstallFromUnusedMu) {
    const unused = Math.max(0, memoryLimit(state) - usedMemory(state));
    installed.powerCounters = (installed.powerCounters ?? 0) + unused;
    installed.powerHosted = unused > 0;
    log(state, `${installed.title} — place ${unused} power (unused memory).`);
  }
  if (
    installed.type === "hardware" &&
    state.runner.hand.some((id) => state.cards[id]?.defId === installed.defId)
  ) {
    for (const id of state.runner.installed) {
      const bazaar = state.cards[id];
      if (!bazaar?.onInstallHardwareFromGripMayInstallAnotherCopy) continue;
      const copy = state.runner.hand.find((hid) => state.cards[hid]?.defId === installed.defId);
      if (!copy) continue;
      offer(state, id, "runner", [
        { id: `decl:bazaar:${copy}`, label: `Install another ${installed.title}` },
        { id: "decl:decline", label: "Decline" },
      ]);
      return;
    }
  }
  if ((installed.subtypes ?? []).some((s) => s.toLowerCase() === "caïssa" || s.toLowerCase() === "caissa")) {
    for (const id of state.runner.installed) {
      const deep = state.cards[id];
      if (!deep?.triggerCaissaClickAbilityOnCaissaInstall || id === cardId) continue;
      offer(state, id, "runner", [
        { id: `decl:deep:${id}:${cardId}`, label: `Resolve ${installed.title}'s click ability` },
        { id: "decl:decline", label: "Decline" },
      ]);
      return;
    }
  }
  if (
    !state.turn.betterCitizenFiredThisTurn &&
    ((installed.subtypes ?? []).includes("icebreaker") || installed.breaker)
  ) {
    maybeBetterCitizen(state, "installs an icebreaker");
  }
}

export function maybeBetterCitizen(state: GameState, reason: string): void {
  if (state.turn.betterCitizenFiredThisTurn) return;
  for (const card of Object.values(state.cards)) {
    if (!card?.mayTagOnFirstRunEventOrIcebreakerInstallEachTurn) continue;
    if (card.zone !== "corp:score" && card.zone !== "corp:play-area" && !card.rezzed) continue;
    state.turn.betterCitizenFiredThisTurn = true;
    offer(state, card.id, "corp", [
      { id: "decl:tag", label: "Give the Runner 1 tag" },
      { id: "decl:decline", label: "Decline" },
    ]);
    log(state, `${card.title} — ${reason}.`);
    return;
  }
}

export function onRunnerEventPlayed(state: GameState, cardId: string): void {
  const event = state.cards[cardId];
  if (event && (event.subtypes ?? []).includes("run")) maybeBetterCitizen(state, "plays a run event");
  if (!state.turn.cometEventPlayedThisTurn) {
    state.turn.cometEventPlayedThisTurn = true;
    for (const id of state.runner.installed) {
      const comet = state.cards[id];
      if (!comet?.onFirstEventEachTurnMayPlayAnother) continue;
      offer(state, id, "runner", [
        { id: "decl:comet", label: "Play another event without spending a click" },
        { id: "decl:decline", label: "Decline" },
      ]);
      return;
    }
  }
}

export function onCorpAbilityGainedCredits(state: GameState): void {
  if (state.turn.padTapFiredThisTurn) return;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.mayGainCreditOnFirstCorpCardAbilityCreditGainEachTurn) continue;
    state.turn.padTapFiredThisTurn = true;
    offer(state, id, "runner", [
      { id: "decl:pad", label: "Gain 1¢" },
      { id: "decl:decline", label: "Decline" },
    ]);
    return;
  }
}

export function onTrashAbility(state: GameState, side: Side): void {
  const ids = side === "runner" ? state.runner.installed : [];
  for (const id of ids) {
    const card = state.cards[id];
    if (!card?.gainCreditOnTrashAbilityUse) continue;
    state.runner.credits += 1;
    log(state, `${card.title} — gain 1¢ (trash ability) → ${state.runner.credits}¢.`);
  }
  for (const card of Object.values(state.cards)) {
    if (card?.side === "corp" && card.gainCreditOnTrashAbilityUse && (card.rezzed || card.zone === "corp:score")) {
      state.corp.credits += 1;
      log(state, `${card.title} — gain 1¢ (trash ability) → ${state.corp.credits}¢.`);
    }
  }
}

export function onRunnerTrashedFromServer(state: GameState, serverId: ServerId): void {
  const server = state.servers[serverId];
  if (!server) return;
  for (const id of server.root) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.mayPayCreditsToTagWhenRunnerTrashesFromThisServerOrRoot) continue;
    offer(state, id, "corp", [
      { id: `decl:overseer:${id}`, label: "Pay 1¢ to give a tag" },
      { id: "decl:decline", label: "Decline" },
    ]);
    return;
  }
}

export function onTagsRemoved(state: GameState): void {
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags) continue;
      offer(state, id, "corp", [
        { id: `decl:analytics:${id}`, label: "Draw 1 card" },
        { id: "decl:decline", label: "Decline" },
      ]);
      return;
    }
  }
}

export function prepareTraceSpendOrder(state: GameState): void {
  if (!state.trace || !state.run) return;
  const sweep = Object.values(state.cards).some(
    (card) =>
      card?.runnerSpendsFirstForTracesDuringRun &&
      (card.zone === "corp:play-area" || card.zone === "runner:play-area"),
  );
  if (sweep) state.trace.runnerSpendsFirst = true;
}

export function syncLongTermInvestment(state: GameState, card: CardInstance): void {
  void state;
  const threshold = card.longTermInvestmentGainAbilityAtHostedCredits ?? 0;
  if (threshold <= 0) return;
  const id = `${card.id}:take-hosted`;
  const ready = (card.hostedCredits ?? 0) >= threshold && card.rezzed;
  const has = (card.paidAbilities ?? []).some((ability) => ability.id === id);
  if (ready && !has) {
    card.paidAbilities = [
      ...(card.paidAbilities ?? []),
      {
        id,
        label: "Take all hosted credits",
        clickCost: 1,
        creditCost: 0,
        cost: { clicks: 1 },
        windows: ["corp_action_paw"],
        effect: fx.do({
          kind: "take_hosted_credits",
          amount: card.hostedCredits ?? 0,
        }),
      },
    ];
  }
  if (!ready && has) {
    card.paidAbilities = (card.paidAbilities ?? []).filter((ability) => ability.id !== id);
  }
}

export function paidAbilitiesIncludingHosted(state: GameState, card: CardInstance) {
  const own = card.paidAbilities ?? [];
  if (!card.gainsPaidAbilitiesOfHostedIcebreakers) return own;
  const hosted = (card.hostedCardIds ?? []).flatMap((id) => {
    const guest = state.cards[id];
    if (!guest?.breaker && !(guest?.subtypes ?? []).includes("icebreaker")) return [];
    return guest.paidAbilities ?? [];
  });
  return [...own, ...hosted];
}

export function startIdentitySetup(state: GameState): void {
  const adam = state.cards[state.runner.identityId];
  const n = adam?.startWithDirectiveCards ?? 0;
  if (n > 0 && !state.turn.adamDirectivesInstalled) {
    state.turn.adamDirectivesInstalled = true;
    const directives = state.runner.deck.filter((id) =>
      (state.cards[id]?.subtypes ?? []).some((s) => s.toLowerCase() === "directive"),
    );
    for (const id of directives.slice(0, n)) {
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.installed.push(id);
      const card = state.cards[id]!;
      card.zone = "runner:installed";
      card.faceup = true;
      log(state, `${adam.title} — ${card.title} starts installed.`);
    }
  }
  const ayla = state.cards[state.runner.identityId];
  if (ayla?.aylaSetAside && !state.turn.aylaSetAsideDone) {
    state.turn.aylaSetAsideDone = true;
    const setAside = state.runner.deck.slice(0, 6);
    state.runner.deck = state.runner.deck.slice(setAside.length);
    state.runner.setAside = [...(state.runner.setAside ?? []), ...setAside];
    for (const id of setAside) {
      const card = state.cards[id];
      if (card) {
        card.zone = "runner:set-aside";
        card.faceup = false;
      }
    }
    if (setAside.length > 0) {
      log(state, `${ayla.title} — set aside ${setAside.length} cards.`);
    }
  }
}

export function drawOne(state: GameState, side: Side): void {
  const player = side === "corp" ? state.corp : state.runner;
  const zone = side === "corp" ? "corp:hq" : "runner:grip";
  const id = player.deck.shift();
  if (!id) {
    if (side === "corp") runnerWinsOnEmptyRnd(state);
    return;
  }
  player.hand.push(id);
  const card = state.cards[id];
  if (card) card.zone = zone;
}

function removeInstalled(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  state.runner.installed = state.runner.installed.filter((id) => id !== cardId);
  for (const other of Object.values(state.cards)) {
    if (other.hostedCardIds) {
      other.hostedCardIds = other.hostedCardIds.filter((id) => id !== cardId);
    }
  }
}

export function resolveDeclaration(state: GameState, optionId: string): "jackout" | "ok" {
  if (optionId === "decl:decline") return "ok";
  if (optionId.startsWith("decl:aesop:")) {
    const cardId = optionId.slice("decl:aesop:".length);
    removeInstalled(state, cardId);
    const trashed = state.cards[cardId];
    if (trashed) {
      state.runner.discardPile.push(cardId);
      trashed.zone = "runner:heap";
      trashed.faceup = true;
    }
    state.runner.credits += 3;
    log(state, `Aesop's Pawnshop — trash an installed card and gain 3¢ → ${state.runner.credits}¢.`);
    return "ok";
  }
  if (optionId.startsWith("decl:gpi-expose:")) {
    const [, , iceId] = optionId.split(":");
    const ice = iceId ? state.cards[iceId] : undefined;
    if (ice && !ice.rezzed) {
      ice.faceup = true;
      log(state, `${ice.title} is exposed (CR ${CR.expose.number}).`);
    }
    const sourceId = optionId.split(":")[2];
    if (sourceId) {
      offer(state, sourceId, "runner", [
        { id: `decl:gpi-jack:${sourceId}`, label: "Trash GPI Net Tap to jack out" },
        { id: "decl:decline", label: "Continue" },
      ]);
    }
    return "ok";
  }
  if (optionId.startsWith("decl:gpi-jack:")) {
    const sourceId = optionId.slice("decl:gpi-jack:".length);
    removeInstalled(state, sourceId);
    const card = state.cards[sourceId];
    if (card) {
      state.runner.discardPile.push(sourceId);
      card.zone = "runner:heap";
      card.faceup = true;
    }
    return "jackout";
  }
  if (optionId.startsWith("decl:engolo:")) {
    const [, , iceId, costText, ...subtypeParts] = optionId.split(":");
    const cost = Number(costText);
    const ice = iceId ? state.cards[iceId] : undefined;
    if (ice && state.runner.credits >= cost) {
      subtractRunnerCreditPool(state, cost);
      const subtype = subtypeParts.join(":") || "code gate";
      if (!(ice.subtypes ?? []).includes(subtype)) {
        ice.subtypes = [...(ice.subtypes ?? []), subtype];
      }
      log(state, `${ice.title} gains ${subtype} for this encounter.`);
    }
    return "ok";
  }
  if (optionId.startsWith("decl:anson:")) {
    const [, sourceId, iceId] = optionId.split(":");
    const source = sourceId ? state.cards[sourceId] : undefined;
    const ice = iceId ? state.cards[iceId] : undefined;
    if (source && ice) {
      const n = source.advancementCounters ?? 0;
      source.advancementCounters = 0;
      ice.advancementCounters = (ice.advancementCounters ?? 0) + n;
      log(state, `${source.title} — move ${n} advancement to ${ice.title}.`);
    }
    return "ok";
  }
  if (optionId.startsWith("decl:archives:")) {
    const cardId = optionId.split(":")[3];
    const card = cardId ? state.cards[cardId] : undefined;
    state.turn.archivesInterfaceUsedThisBreach = true;
    if (card) {
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== card.id);
      if (!state.removedFromGame.includes(card.id)) state.removedFromGame.push(card.id);
      card.zone = "removed-from-game";
      card.faceup = true;
      log(state, `${card.title} is removed from the game instead of being accessed.`);
    }
    return "ok";
  }
  if (optionId.startsWith("decl:khumalo:")) {
    const [, , sourceId, cardId, costText] = optionId.split(":");
    const source = sourceId ? state.cards[sourceId] : undefined;
    const card = cardId ? state.cards[cardId] : undefined;
    const cost = Number(costText);
    if (source && card) {
      spendVirusCounters(state, source, cost);
      state.turn.khumaloUsedThisTurn = true;
      state.corp.hand = state.corp.hand.filter((id) => id !== card.id);
      state.corp.deck = state.corp.deck.filter((id) => id !== card.id);
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== card.id);
      if (!state.corp.discardPile.includes(card.id)) state.corp.discardPile.push(card.id);
      card.zone = "corp:archives";
      card.faceup = true;
      card.rezzed = false;
      if (state.run) state.run.breachStoleOrTrashed = true;
      log(state, `${source.title} trashes ${card.title}.`);
    }
    return "ok";
  }
  if (optionId.startsWith("decl:rip:")) {
    const n = Number(optionId.split(":")[3] ?? 0);
    const run = state.run;
    for (let i = 0; i < n && state.runner.discardPile.length > 0; i++) {
      const id = state.runner.discardPile.pop()!;
      state.runner.hand.push(id);
      const card = state.cards[id];
      if (card) card.zone = "runner:grip";
    }
    if (run) {
      run.accessCandidates = run.accessCandidates.filter(
        (id) => state.cards[id]?.zone !== "corp:hq",
      );
    }
    log(state, `Rip Deal — add ${n} from the heap to the grip and skip HQ cards.`);
    return "ok";
  }
  if (optionId.startsWith("decl:hippo:")) {
    const [, sourceId, iceId] = optionId.split(":");
    if (sourceId) {
      removeInstalled(state, sourceId);
      const hippo = state.cards[sourceId];
      if (hippo) {
        if (!state.removedFromGame.includes(sourceId)) state.removedFromGame.push(sourceId);
        hippo.zone = "removed-from-game";
        hippo.faceup = true;
      }
    }
    const ice = iceId ? state.cards[iceId] : undefined;
    if (ice) {
      for (const server of Object.values(state.servers)) {
        server.ice = server.ice.filter((id) => id !== ice.id);
      }
      state.corp.discardPile.push(ice.id);
      ice.zone = "corp:archives";
      ice.faceup = true;
      ice.rezzed = false;
      log(state, `${ice.title} is trashed.`);
    }
    return "ok";
  }
  if (optionId.startsWith("decl:poly:")) {
    drawOne(state, "runner");
    drawOne(state, "corp");
    log(state, `Polyhistor — each player draws 1 (CR ${CR.drawing.number}).`);
    return "ok";
  }
  if (optionId === "decl:comet") {
    state.turn.cometFreeEvent = true;
    log(state, `Comet — the next event this turn does not spend a click.`);
    return "ok";
  }
  if (optionId === "decl:pad") {
    state.runner.credits += 1;
    log(state, `PAD Tap — gain 1¢ → ${state.runner.credits}¢.`);
    return "ok";
  }
  if (optionId === "decl:tag") {
    state.runner.tags += 1;
    log(state, `Better Citizen Program — give 1 tag → ${state.runner.tags}.`);
    return "ok";
  }
  if (optionId.startsWith("decl:overseer:")) {
    if (state.corp.credits >= 1) {
      state.corp.credits -= 1;
      state.runner.tags += 1;
      log(state, `Overseer Matrix — pay 1¢ and give 1 tag → ${state.runner.tags}.`);
    }
    return "ok";
  }
  if (optionId.startsWith("decl:analytics:")) {
    drawOne(state, "corp");
    log(state, `Net Analytics — Corp draws 1.`);
    return "ok";
  }
  return "ok";
}

/**
 * Runner basic install from grip (and cards hosted as if in grip).
 * Effect-driven installs stay in the effect evaluator.
 */
import { log } from "../state/createGame.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { addBreakerStrengthBoostThisTurn } from "../state/lingeringEffects.js";
import {
  creditsAvailableForInstall,
  emptyRunnerCreditPool,
  spendCreditsForInstall,
  spendProgramUseRecurringCredits,
} from "../state/costs.js";
import { fireOnInstall } from "../state/cardLifecycleHooks.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import { installBlockReason } from "../state/staticFlags.js";
import {
  daemonInstallDiscount,
  hostLimitReason,
  onProgramOrHardwareInstalled,
} from "../state/cardDeclarations.js";
import {
  noteInstalledThisTurn,
  noteProgramOrHardwareInstalled,
} from "../state/programHardwareInstall.js";
import {
  azJobConnectionOrHardwareInstallDiscount,
  noteJobConnectionOrHardwareInstalled,
} from "../state/azInstallDiscount.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import { moveRunnerCardToHeap, recomputeRunnerLink } from "../state/trashHooks.js";
import {
  cardBecameNewObject,
  effectiveMemoryCost,
  memoryLimit,
  usedMemory,
} from "../state/turn.js";
import type {
  ApplyResult,
  GameState,
  InstallDestination,
  RuleCite,
  ServerId,
} from "../state/types.js";
import { CR } from "../timing/labels.js";
import {
  fireOnInstallWithoutSpendingCredits,
} from "../state/miscConditionalHooks.js";
import { resolveRunnerInstallCostDelta } from "../state/continuousCosts.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function runnerInstallCost(
  state: GameState,
  card: GameState["cards"][string],
  destination?: InstallDestination,
): number {
  let cost = Math.max(
    0,
    card.installCost + resolveRunnerInstallCostDelta(state, card.id),
  );
  {
    const azDisc = azJobConnectionOrHardwareInstallDiscount(state, card);
    if (azDisc > 0) cost = Math.max(0, cost - azDisc);
  }
  if (state.turn.patchworkPendingDiscountThisAction > 0) {
    cost = Math.max(0, cost - state.turn.patchworkPendingDiscountThisAction);
  }
  if (
    destination?.kind === "host_card" &&
    card.type === "resource" &&
    card.unique
  ) {
    const host = state.cards[destination.hostId];
    const disc = host?.hostsUniqueCompanionOrConnectionResources?.creditDiscount;
    if (
      typeof disc === "number" &&
      disc > 0 &&
      ((card.subtypes ?? []).includes("companion") ||
        (card.subtypes ?? []).includes("connection"))
    ) {
      cost = Math.max(0, cost - disc);
    }
  }
  if (
    card.type === "program" ||
    card.type === "hardware" ||
    card.type === "resource"
  ) {
    const isFirst =
      state.turn.programsInstalledThisTurn === 0 &&
      state.turn.hardwareInstalledThisTurn === 0;
    if (isFirst) {
      let bump = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          if (abilitiesSuppressed(state, id)) continue;
          const root = state.cards[id];
          if (!root?.rezzed) continue;
          const per =
            root.runnerFirstInstallCostIncreasePerPowerCounterOnThis ?? 0;
          if (per > 0) bump += per * (root.powerCounters ?? 0);
        }
      }
      if (bump > 0) cost += bump;
    }
  }
  return cost;
}

function trashExistingConsoles(state: GameState, keepId: string): void {
  const toTrash = state.runner.installed.filter((id) => {
    if (id === keepId) return false;
    return (state.cards[id].subtypes ?? []).includes("console");
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    moveRunnerCardToHeap(state, id);
    log(
      state,
      `Trash ${card.title} — console limit (CR ${CR.trashing.number}).`,
    );
  }
}

function fireCookbookOnVirusInstall(state: GameState, installedId: string): void {
  const installed = state.cards[installedId];
  if (!(installed.subtypes ?? []).includes("virus")) return;
  for (const id of state.runner.installed) {
    if (id === installedId) continue;
    if (state.cards[id].defId !== "cookbook") continue;
    // May place 1 virus counter on the installed virus — auto-apply (may).
    installed.virusCounters = (installed.virusCounters ?? 0) + 1;
    if (!state.turn.programsWithVirusPlacedThisTurn.includes(installedId)) {
      state.turn.programsWithVirusPlacedThisTurn.push(installedId);
    }
    log(
      state,
      `Cookbook places 1 virus counter on ${installed.title}.`,
    );
  }
}

export function hostedPlayableAsGrip(state: GameState, cardId: string): string | null {
  const card = state.cards[cardId];
  if (!card?.hostId) return null;
  if (abilitiesSuppressed(state, card.hostId)) return null;
  const host = state.cards[card.hostId];
  if (!host?.hostedCardsPlayableAsGrip) return null;
  if (!(host.hostedCardIds ?? []).includes(cardId)) return null;
  return card.hostId;
}

export function installRunner(
  state: GameState,
  cardId: string,
  destination?: InstallDestination,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.side !== "runner") {
    return fail("Card not a Runner card.", [CR.runnerBasicInstall]);
  }
  const handIdx = state.runner.hand.indexOf(cardId);
  const blingHostId = handIdx < 0 ? hostedPlayableAsGrip(state, cardId) : null;
  if (handIdx < 0 && !blingHostId) {
    return fail("Card not in grip.", [CR.runnerBasicInstall]);
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return fail("Runner install supports program/hardware/resource.", [
      CR.runnerBasicInstall,
    ]);
  }
  const blocked = installBlockReason(state, card);
  if (blocked) return fail(blocked, [CR.runnerBasicInstall]);
  if (card.installRequiresSuccessfulCentralRunThisTurn) {
    const okCentral =
      state.turn.successfulHqRunThisTurn ||
      state.turn.successfulRdRunThisTurn ||
      state.turn.successfulArchivesRunThisTurn;
    if (!okCentral) {
      return fail(
        "Install requires a successful run on a central server this turn.",
        [CR.runnerBasicInstall],
      );
    }
  }
  if (card.installRequiresSuccessfulHqRunThisTurn) {
    if (!state.turn.successfulHqRunThisTurn) {
      return fail(
        "Install requires a successful run on HQ this turn.",
        [CR.runnerBasicInstall],
      );
    }
  }
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    if (!destination || destination.kind !== "host_ice") {
      return fail("Trojan must be installed hosted on ice.", [
        CR.runnerBasicInstall,
      ]);
    }
    const host = state.cards[destination.iceId];
    if (!host || host.type !== "ice") {
      return fail("Host must be installed ice.", [CR.runnerBasicInstall]);
    }
    if (card.hostGainsAllIceSubtypes && !host.rezzed) {
      return fail("Egret must be installed on rezzed ice.", [
        CR.runnerBasicInstall,
      ]);
    }
    let found = false;
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(destination.iceId)) {
        found = true;
        break;
      }
    }
    if (!found) {
      return fail("Host ice is not installed.", [CR.runnerBasicInstall]);
    }
    card.hostId = destination.iceId;
  } else if (destination && destination.kind === "host_ice") {
    return fail("Only trojans install hosted on ice.", [CR.runnerBasicInstall]);
  } else if (destination && destination.kind === "host_card") {
    const host = state.cards[destination.hostId];
    if (host) {
      const hostedLimit = hostLimitReason(state, host, card);
      if (hostedLimit) return fail(hostedLimit, [CR.runnerBasicInstall]);
    }
    if (!host || !state.runner.installed.includes(destination.hostId)) {
      return fail("Invalid host.", [CR.runnerBasicInstall]);
    }
    if (host.hostNonAiIcebreaker) {
      const max = host.maxHostedCards ?? 1;
      const have = (host.hostedCardIds ?? []).length;
      if (have >= max) {
        return fail("Host has no free host slots.", [CR.runnerBasicInstall]);
      }
      if (card.type !== "program" || !card.breaker) {
        return fail("Only icebreakers may host on Dinosaurus.", [
          CR.runnerBasicInstall,
        ]);
      }
      if ((card.subtypes ?? []).includes("ai") || card.breaker.breaksSubtype === "*") {
        return fail("Cannot host an AI icebreaker here.", [
          CR.runnerBasicInstall,
        ]);
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.hostsAnyProgramMemoryCostLte !== undefined) {
      const max = host.maxHostedCards ?? 1;
      const have = (host.hostedCardIds ?? []).length;
      if (have >= max) {
        return fail("Host has no free host slots.", [CR.runnerBasicInstall]);
      }
      if (card.type !== "program") {
        return fail("Only programs may host here.", [CR.runnerBasicInstall]);
      }
      const printedMu = card.memoryCost ?? 0;
      if (printedMu > host.hostsAnyProgramMemoryCostLte) {
        return fail(
          `Only programs with ${host.hostsAnyProgramMemoryCostLte} MU or less may host here.`,
          [CR.runnerBasicInstall],
        );
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.daemonHost) {
      if (card.type !== "program") {
        return fail("Only programs may host on a daemon.", [
          CR.runnerBasicInstall,
        ]);
      }
      if ((card.subtypes ?? []).includes("daemon")) {
        return fail("Cannot host a daemon on a daemon.", [
          CR.runnerBasicInstall,
        ]);
      }
      if (
        host.daemonHostExcludeIcebreaker &&
        (card.breaker || (card.subtypes ?? []).includes("icebreaker"))
      ) {
        return fail("This daemon cannot host icebreakers.", [
          CR.runnerBasicInstall,
        ]);
      }
      const maxMu = host.daemonHostMaxMu;
      if (typeof maxMu === "number") {
        const used = (host.hostedCardIds ?? []).reduce((sum, id) => {
          return sum + effectiveMemoryCost(state, id);
        }, 0);
        const need = effectiveMemoryCost(state, cardId);
        if (used + need > maxMu) {
          return fail("Daemon has insufficient hosting MU.", [
            CR.runnerBasicInstall,
          ]);
        }
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.hostsUniqueCompanionOrConnectionResources) {
      if (card.type !== "resource" || !card.unique) {
        return fail(
          "Only unique companion/connection resources host here.",
          [CR.runnerBasicInstall],
        );
      }
      const subs = card.subtypes ?? [];
      if (!subs.includes("companion") && !subs.includes("connection")) {
        return fail(
          "Only unique companion/connection resources host here.",
          [CR.runnerBasicInstall],
        );
      }
      card.hostId = destination.hostId;
    } else if (host.hostsConnectionResources) {
      if (
        card.type !== "resource" ||
        !(card.subtypes ?? []).includes("connection")
      ) {
        return fail("Only connections host on Off-Campus Apartment.", [
          CR.runnerBasicInstall,
        ]);
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
      const drawN = host.drawOnHostConnectionInstall ?? 0;
      if (drawN > 0) {
        for (let i = 0; i < drawN; i++) {
          if (state.runner.deck.length === 0) break;
          const top = state.runner.deck.shift()!;
          state.runner.hand.push(top);
          const drawn = state.cards[top];
          if (drawn) drawn.zone = "runner:grip";
        }
        log(
          state,
          `Off-Campus Apartment — draw ${drawN} (hosted connection).`,
        );
      }
    } else {
      return fail("Invalid host for card.", [CR.runnerBasicInstall]);
    }
  }
  if (card.type === "program") {
    const hostExempt =
      destination?.kind === "host_card" &&
      Boolean(
        state.cards[destination.hostId]?.hostedIcebreakerMemoryDoesNotCount ||
          state.cards[destination.hostId]?.hostedProgramMemoryDoesNotCount ||
          state.cards[destination.hostId]?.daemonHost ||
          state.cards[destination.hostId]?.hostsAnyProgramMemoryCostLte !==
            undefined,
      );
    const need = effectiveMemoryCost(state, cardId);
    if (!hostExempt && usedMemory(state) + need > memoryLimit(state)) {
      return openMuProgramTrashChoice(
        state,
        cardId,
        destination ?? { kind: "installed" },
        need,
      );
    }
  }
  if (card.installCostX && state.turn.installCostXCardId !== cardId) {
    const maxX = state.runner.credits;
    state.turn.installCostXDestination = destination ?? { kind: "installed" };
    state.deferAfterBasicAction = true;
    state.pendingChoice = {
      sourceId: cardId,
      chooser: "runner",
      options: Array.from({ length: maxX + 1 }, (_, x) => ({
        id: `install-x:${x}`,
        label: `X = ${x}`,
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
        },
      })),
    };
    return ok(state);
  }
  let cost = card.installCostX
    ? (state.turn.installCostX ?? 0)
    : runnerInstallCost(state, card, destination);
  if (
    destination?.kind === "host_card" &&
    state.cards[destination.hostId]?.personalWorkshop &&
    (card.type === "program" || card.type === "hardware")
  ) {
    cost = 0;
  }
  if (destination?.kind === "host_card") {
    cost = Math.max(0, cost - daemonInstallDiscount(state.cards[destination.hostId]));
  }
  if (creditsAvailableForInstall(state, "runner", card) < cost) {
    return fail("Insufficient credits for install cost.", [
      { number: "8.5.11", id: "sec_install_cost" },
    ]);
  }
  spendCreditsForInstall(state, "runner", cost, card);
  if (handIdx >= 0) {
    state.runner.hand.splice(handIdx, 1);
  } else if (blingHostId) {
    const host = state.cards[blingHostId]!;
    host.hostedCardIds = (host.hostedCardIds ?? []).filter((id) => id !== cardId);
    card.hostId = undefined;
  }
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
  card.faceup = true;
  cardBecameNewObject(state, cardId);
  if (card.hostId && state.cards[card.hostId]?.personalWorkshop) {
    state.runner.installed = state.runner.installed.filter((id) => id !== cardId);
    card.zone = `hosted:${card.hostId}`;
    card.powerCounters = card.installCost;
    card.powerHosted = true;
    if (!state.cards[card.hostId]!.hostedCardIds) {
      state.cards[card.hostId]!.hostedCardIds = [];
    }
    if (!state.cards[card.hostId]!.hostedCardIds!.includes(cardId)) {
      state.cards[card.hostId]!.hostedCardIds!.push(cardId);
    }
  }
  if (card.type === "program" || card.type === "hardware") {
    onProgramOrHardwareInstalled(state, cardId);
  }
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (card.installSpendCreditsForPowerCounters) {
    const fromPool = state.runner.credits;
    if (fromPool > 0) emptyRunnerCreditPool(state);
    // Cyberfeeder-class recurring credits can pay Atman's install ability (CR 1.10.3c).
    const fromRecurring = spendProgramUseRecurringCredits(state, 99);
    const x = fromPool + fromRecurring;
    if (x > 0) {
      card.powerCounters = (card.powerCounters ?? 0) + x;
      log(
        state,
        `${card.title} — spend ${x}¢ for ${x} power counter(s).`,
      );
    }
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0 ||
    (card.hostId &&
      state.cards[card.hostId]?.handSizeBonusIfHostingCompanionAndConnection)
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashExistingConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  if (card.type === "resource") {
    state.turn.runnerInstalledResourceThisTurn = true;
  }
  if (card.type === "program" && card.hostId) {
    const host = state.cards[card.hostId];
    const bonus = host?.gainCreditsWhenRunnerHostsProgramOnSelf ?? 0;
    if (bonus > 0) {
      state.runner.credits += bonus;
      log(
        state,
        `${host!.title} — gain ${bonus}¢ for hosting ${card.title}.`,
      );
    }
  }
  noteJobConnectionOrHardwareInstalled(state, card);
  log(
    state,
    card.hostId
      ? `Runner installs ${card.title} hosted on ${state.cards[card.hostId].title} for ${cost}¢ (CR ${CR.runnerBasicInstall.number}).`
      : `Runner installs ${card.title} for ${cost}¢ (CR ${CR.runnerBasicInstall.number}).`,
  );
  const perLink = card.installCostReductionPerLink ?? 0;
  if (perLink > 0 && state.runner.link > 0) {
    log(
      state,
      `${card.title} costs ${perLink * state.runner.link}¢ less to install (CR ${CR.sourceInstallCost.number}).`,
    );
  }
  fireOnInstall(state, cardId);
  fireCookbookOnVirusInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  recomputeRunnerLink(state);
  if (
    card.type === "program" &&
    (card.subtypes ?? []).includes("icebreaker") &&
    !(card.subtypes ?? []).includes("ai")
  ) {
    for (const rid of state.runner.installed) {
      if (rid === cardId) continue;
      if (abilitiesSuppressed(state, rid)) continue;
      const host = state.cards[rid];
      const bonus = host?.nonAiIcebreakerInstallStrengthBonusThisTurn;
      if (!bonus) continue;
      addBreakerStrengthBoostThisTurn(state, {
        createdBy: rid,
        breakerId: cardId,
        amount: bonus,
      });
      log(
        state,
        `${host.title} — ${card.title} +${bonus} strength this turn.`,
      );
    }
  }
  if (card.chooseServerOnInstall && !card.chosenServerId && !state.pendingChoice) {
    const servers = Object.values(state.servers).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    state.pendingChoice = {
      sourceId: cardId,
      chooser: "runner",
      options: servers.map((server) => ({
        id: `diwan:${server.id}`,
        label: `Choose ${server.id}`,
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
        },
      })),
    };
    log(state, `${card.title} — choose a server.`);
  }
  if (
    card.chooseBreakerSubtypeOnInstall &&
    card.breaker &&
    !state.pendingChoice
  ) {
    const subtypes = ["barrier", "code gate", "sentry"] as const;
    state.pendingChoice = {
      sourceId: cardId,
      chooser: "runner",
      options: subtypes.map((subtype) => ({
        id: `subtype:${subtype === "code gate" ? "code-gate" : subtype}`,
        label: `Choose ${subtype}`,
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
        },
      })),
    };
    log(state, `${card.title} — choose barrier, code gate, or sentry.`);
  }
  if (
    (card.chooseIceOnInstallForBypass || card.chooseIceOnInstall) &&
    !card.chosenIceId &&
    !state.pendingChoice
  ) {
    const ice = installedIceChoices(state);
    if (ice.length === 0) {
      log(state, `${card.title} — no installed ice to choose.`);
    } else {
      state.pendingChoice = {
        sourceId: cardId,
        chooser: "runner",
        options: ice.map((choice) => ({
          id: `chosen-ice:${choice.id}`,
          label: choice.label,
          effect: {
            op: "do" as const,
            action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
          },
        })),
      };
      log(state, `${card.title} — choose an installed piece of ice.`);
    }
  }
  if (cost === 0) {
    for (const rid of state.runner.installed) {
      const host = state.cards[rid];
      if (!host?.onInstallWithoutSpendingCredits) continue;
      fireOnInstallWithoutSpendingCredits(state, rid);
    }
  }
  return ok(state);
}

/**
 * CR 3.9.3b / 8.5.6c: when a program install would exceed the memory limit,
 * the Runner trashes installed programs until it fits, then the install continues.
 */
function openMuProgramTrashChoice(
  state: GameState,
  cardId: string,
  destination: InstallDestination,
  need: number,
): ApplyResult {
  const limit = memoryLimit(state);
  if (need > limit) {
    return fail("Insufficient memory units to install program.", [
      CR.programInstallMemory,
      CR.installTrashProgramsForMemory,
    ]);
  }
  const candidates = state.runner.installed.filter(
    (id) => state.cards[id]?.type === "program",
  );
  if (candidates.length === 0) {
    return fail("Insufficient memory units to install program.", [
      CR.programInstallMemory,
      CR.installTrashProgramsForMemory,
    ]);
  }
  const installing = state.cards[cardId]!;
  state.pendingMuProgramInstall = { cardId, destination };
  state.deferAfterBasicAction = true;
  state.pendingChoice = {
    sourceId: cardId,
    chooser: "runner",
    options: candidates.map((id) => ({
      id: `mu-trash:${id}`,
      label: state.cards[id]!.title,
      effect: {
        op: "do" as const,
        action: {
          kind: "gain_credits" as const,
          side: "runner" as const,
          amount: 0,
        },
      },
    })),
  };
  log(
    state,
    `Insufficient MU to install ${installing.title}. Trash installed programs? (CR ${CR.installTrashProgramsForMemory.number}).`,
  );
  return ok(state);
}

/** Resolve one program trash while freeing MU for a pending program install. */
export function resolveMuProgramTrash(
  state: GameState,
  trashId: string,
): ApplyResult {
  const pending = state.pendingMuProgramInstall;
  if (!pending) {
    return fail("No pending memory-unit program install.", [
      CR.programInstallMemory,
    ]);
  }
  if (!state.runner.installed.includes(trashId)) {
    return fail("Choose an installed program to trash.", [
      CR.installTrashProgramsForMemory,
      CR.trashing,
    ]);
  }
  const trashCard = state.cards[trashId];
  if (trashCard?.type !== "program") {
    return fail("Choose an installed program to trash.", [
      CR.installTrashProgramsForMemory,
      CR.trashing,
    ]);
  }
  moveRunnerCardToHeap(state, trashId);
  log(
    state,
    `Trash ${trashCard.title} for memory (CR ${CR.installTrashProgramsForMemory.number}).`,
  );
  const need = effectiveMemoryCost(state, pending.cardId);
  if (usedMemory(state) + need > memoryLimit(state)) {
    return openMuProgramTrashChoice(
      state,
      pending.cardId,
      pending.destination,
      need,
    );
  }
  state.pendingMuProgramInstall = null;
  return installRunner(state, pending.cardId, pending.destination);
}

/** The server named when a choose-on-install card such as Diwan is installed. */
export function chooseServerOnInstalledCard(
  state: GameState,
  cardId: string,
  serverId: string,
): void {
  const card = state.cards[cardId];
  if (!card || !(serverId in state.servers)) return;
  card.chosenServerId = serverId as ServerId;
  log(state, `${card.title} — choose ${serverId}.`);
}

const BREAKER_SUBTYPES = ["barrier", "code gate", "sentry"] as const;

/** Barrier, code gate, or sentry named when a breaker such as Chameleon is installed. */
export function chooseBreakerSubtype(
  state: GameState,
  cardId: string,
  subtype: string,
): void {
  const card = state.cards[cardId];
  const printed = subtype === "code-gate" ? "code gate" : subtype;
  if (!card?.breaker || !BREAKER_SUBTYPES.includes(printed as (typeof BREAKER_SUBTYPES)[number])) {
    return;
  }
  card.breaker.breaksSubtype = printed;
  card.subtypes = [
    ...(card.subtypes ?? []).filter(
      (entry) => !BREAKER_SUBTYPES.includes(entry as (typeof BREAKER_SUBTYPES)[number]),
    ),
    printed,
  ];
  log(state, `${card.title} — choose ${printed}.`);
}

/** Ice named when a card such as Femme Fatale or Boomerang is installed. */
export function chooseInstalledIce(
  state: GameState,
  cardId: string,
  iceId: string,
): void {
  const card = state.cards[cardId];
  const ice = state.cards[iceId];
  if (!card || !ice) return;
  const installed = Object.values(state.servers).some((server) => server.ice.includes(iceId));
  if (!installed) return;
  card.chosenIceId = iceId;
  const shown = ice.rezzed || ice.faceup ? ice.title : "an unrezzed piece of ice";
  log(
    state,
    card.chooseIceOnInstallForBypass
      ? `${card.title} — choose ${shown} for bypass.`
      : `${card.title} — choose ${shown}.`,
  );
}

function installedIceChoices(state: GameState): { id: string; label: string }[] {
  const choices: { id: string; label: string }[] = [];
  const servers = Object.values(state.servers).sort((a, b) => a.id.localeCompare(b.id));
  for (const server of servers) {
    server.ice.forEach((id, index) => {
      const ice = state.cards[id];
      const place =
        server.ice.length === 1
          ? "the ice"
          : index === 0
            ? "the outermost ice"
            : index === server.ice.length - 1
              ? "the innermost ice"
              : `ice ${index + 1}`;
      const name = ice?.rezzed || ice?.faceup ? ice.title : "unrezzed ice";
      choices.push({ id, label: `${name}, ${place} on ${server.id}` });
    });
  }
  return choices;
}

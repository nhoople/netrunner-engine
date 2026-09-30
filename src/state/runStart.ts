/** Shared helpers for starting runs from events / paid abilities. */

import type { Effect } from "../effects/ir.js";
import { abilitiesSuppressed } from "./abilities.js";
import { agendaPointsFor } from "./scoring.js";
import { isRunTargetAllowed } from "./runLegality.js";
import type {
  GameState,
  ServerId,
  StartsRunSpec,
} from "./types.js";

export function serversMatchingSpec(
  state: GameState,
  spec: StartsRunSpec,
): ServerId[] {
  const all = Object.keys(state.servers) as ServerId[];
  let matched: ServerId[];
  switch (spec.servers) {
    case "any":
      matched = all;
      break;
    case "central":
      matched = all.filter(
        (id) => id === "hq" || id === "rd" || id === "archives",
      );
      break;
    case "hq_rd":
      matched = all.filter((id) => id === "hq" || id === "rd");
      break;
    case "rd":
      matched = all.filter((id) => id === "rd");
      break;
    case "hq":
      matched = all.filter((id) => id === "hq");
      break;
    case "archives":
      matched = all.filter((id) => id === "archives");
      break;
    case "mark":
      matched =
        state.markServerId !== null && state.servers[state.markServerId]
          ? [state.markServerId]
          : [];
      break;
    case "remote":
      matched = all.filter((id) => state.servers[id]?.kind === "remote");
      break;
    default:
      matched = all;
      break;
  }
  if (spec.requiresProtectingIce) {
    matched = matched.filter((id) => (state.servers[id]?.ice.length ?? 0) > 0);
  }
  if (spec.requiresUnrezzedIce) {
    matched = matched.filter((id) =>
      (state.servers[id]?.ice ?? []).some((iceId) => !state.cards[iceId]?.rezzed),
    );
  }
  return matched;
}

export function isServerAllowedForSpec(
  state: GameState,
  spec: StartsRunSpec,
  serverId: ServerId,
): boolean {
  if (!serversMatchingSpec(state, spec).includes(serverId)) return false;
  if (spec.requireNotRunThisTurn) {
    if (state.turn.serversRunThisTurn.includes(serverId)) return false;
  }
  if (!isRunTargetAllowed(state, serverId)) return false;
  return true;
}

export interface RunModifiers {
  bonusAccess?: number;
  iceRezCostIncrease?: number;
  iceRezAdditionalCostEqualsPrintedRezCost?: boolean;
  /** Bribery: +X rez on first unrezzed ice approached. */
  firstApproachedIceAdditionalRezCost?: number;
  eventCredits?: number;
  runSourceId?: string;
  onSuccessfulRunEffect?: Effect;
  addPowerCounterOnSubroutineResolve?: number;
  onRunEndEffect?: Effect;
  persistentTagsIfAgendaStolen?: number;
  bypassFirstEncounter?: boolean;
  bypassEncountersRemaining?: number;
  mayJackOutOnFirstIceEncounter?: boolean;
  /** Spear Phishing: bypass innermost ice protecting the attacked server. */
  bypassInnermostEncounter?: boolean;
  /** S-Dobrado Threat: click-spend bypass on second encounter. */
  bypassSecondEncounterForClick?: boolean;
  /**
   * Alarm Clock: at the first ice encounter, Runner may spend this many
   * clicks to bypass.
   */
  bypassFirstEncounterForClicks?: number;
  redirectSuccessTo?: "hq" | "rd" | "archives";
  redirectSuccessChooseHqOrRd?: boolean;
  skipBreachInstallProgramFromHeap?: boolean;
  skipBreach?: boolean;
  immolationScriptAccessReplace?: boolean;
  accessTrashFree?: boolean;
  trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent?: boolean;
  accessFromBottomOfRd?: boolean;
  trashFirstFullyBrokenSubtype?: string;
  blankAttackedServerRoot?: boolean;
  /** Direct Access: blank both identities during the run. */
  blankIdentities?: boolean;
  derezProtectingIceOnRunBegin?: boolean;
  mayRezEventDerezzedIceOnRunEndIgnoreCosts?: boolean;
  redirectApproachArchivesToHq?: boolean;
  shredPreventFirstEndTheRun?: boolean;
  mayRedirectApproachArchivesToHqOrRdPayingStealthCredits?: number;
  blockCreditPoolSpendAndLose?: boolean;
  forbidCorpRezIceDuringRun?: boolean;
  preventAllDamageThisRun?: boolean;
}

export function modifiersFromStartsRun(
  state: GameState,
  spec: StartsRunSpec,
  sourceId: string,
): RunModifiers {
  const mods: RunModifiers = {
    runSourceId: sourceId,
    onSuccessfulRunEffect: spec.onSuccessfulRun
      ? structuredClone(spec.onSuccessfulRun)
      : undefined,
    onRunEndEffect: spec.onRunEnd
      ? structuredClone(spec.onRunEnd)
      : undefined,
  };
  if (spec.addPowerCounterOnSubroutineResolve) {
    mods.addPowerCounterOnSubroutineResolve =
      spec.addPowerCounterOnSubroutineResolve;
  }
  if (spec.bonusAccess) mods.bonusAccess = spec.bonusAccess;
  if (spec.bonusAccessFromVirus) {
    const virus = state.cards[sourceId]?.virusCounters ?? 0;
    mods.bonusAccess = (mods.bonusAccess ?? 0) + virus;
  }
  if (spec.iceRezCostIncrease) {
    mods.iceRezCostIncrease = spec.iceRezCostIncrease;
  }
  if (spec.iceRezAdditionalCostEqualsPrintedRezCost) {
    mods.iceRezAdditionalCostEqualsPrintedRezCost = true;
  }
  if (spec.briberyFirstIceAdditionalRezEqualsX) {
    mods.firstApproachedIceAdditionalRezCost = state.turn.briberyXPaid ?? 0;
  }
  if (spec.placeEventCredits) {
    mods.eventCredits = spec.placeEventCredits;
  }
  if (spec.transferHostedCreditsToEventCredits) {
    const source = state.cards[sourceId];
    const hosted = source?.hostedCredits ?? 0;
    if (hosted > 0) {
      mods.eventCredits = (mods.eventCredits ?? 0) + hosted;
      source!.hostedCredits = 0;
    }
  }
  if (spec.bypassFirstEncounter) {
    (mods as RunModifiers).bypassFirstEncounter = true;
  }
  if (spec.bypassEncountersRemaining) {
    mods.bypassEncountersRemaining = spec.bypassEncountersRemaining;
  }
  if (spec.mayJackOutOnFirstIceEncounter) {
    mods.mayJackOutOnFirstIceEncounter = true;
  }
  if (spec.bypassInnermostEncounter) {
    (mods as RunModifiers).bypassInnermostEncounter = true;
  }
  if (spec.bypassSecondEncounterForClickIfThreat) {
    const corpPts = agendaPointsFor(state, "corp");
    const runnerPts = agendaPointsFor(state, "runner");
    if (
      Math.max(corpPts, runnerPts) >=
      spec.bypassSecondEncounterForClickIfThreat
    ) {
      mods.bypassSecondEncounterForClick = true;
    }
  }
  if (spec.redirectSuccessTo) {
    (mods as RunModifiers).redirectSuccessTo = spec.redirectSuccessTo;
  }
  if (spec.redirectSuccessChooseHqOrRd) {
    (mods as RunModifiers).redirectSuccessChooseHqOrRd = true;
  }
  if (spec.skipBreachInstallProgramFromHeap) {
    mods.skipBreachInstallProgramFromHeap = true;
  }
  if (spec.skipBreach) {
    mods.skipBreach = true;
  }
  if (spec.immolationScriptAccessReplace) {
    mods.immolationScriptAccessReplace = true;
  }
  if (spec.accessTrashFree) {
    mods.accessTrashFree = true;
  }
  if (spec.trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent) {
    mods.trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent = true;
  }
  if (spec.accessFromBottomOfRd) {
    mods.accessFromBottomOfRd = true;
  }
  if (spec.trashFirstFullyBrokenSubtype) {
    mods.trashFirstFullyBrokenSubtype = spec.trashFirstFullyBrokenSubtype;
  }
  if (spec.blankAttackedServerRoot) {
    mods.blankAttackedServerRoot = true;
  }
  const srcCard = state.cards[sourceId];
  if (srcCard?.blankIdentitiesWhileResolving) {
    mods.blankIdentities = true;
  }
  if (spec.derezProtectingIceOnRunBegin) {
    mods.derezProtectingIceOnRunBegin = true;
  }
  if (spec.mayRezEventDerezzedIceOnRunEndIgnoreCosts) {
    mods.mayRezEventDerezzedIceOnRunEndIgnoreCosts = true;
  }
  if (spec.redirectApproachArchivesToHq) {
    mods.redirectApproachArchivesToHq = true;
  }
  if (spec.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits) {
    mods.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits =
      spec.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits;
  }
  if (spec.blockCreditPoolSpendAndLose) {
    mods.blockCreditPoolSpendAndLose = true;
  }
  if (spec.forbidCorpRezIceDuringRun) {
    mods.forbidCorpRezIceDuringRun = true;
  }
  if (spec.shredPreventFirstEndTheRun) {
    mods.shredPreventFirstEndTheRun = true;
  }
  if (spec.preventAllDamageThisRun) {
    mods.preventAllDamageThisRun = true;
  }
  return mods;
}

/** Collect persistent Amaze-style effects when a run begins / upgrade is present. */
export function collectPersistentAmazeTags(state: GameState): number {
  let tags = 0;
  const sid = state.run?.attackedServerId;
  if (!sid) return 0;
  const server = state.servers[sid];
  for (const id of server.root) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (card.rezzed && (card.tagsIfAgendaStolenThisRun ?? 0) > 0) {
      tags += card.tagsIfAgendaStolenThisRun ?? 0;
    }
  }
  return tags;
}

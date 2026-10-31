/**
 * First virus-program install this turn → installed continuous triggers
 * (Avgustina-class; CR install + card text).
 * Also fires every-install hooks (Noise / Grimoire-class).
 */

import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import { noteStoredConditional } from "./storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";

/**
 * After a virus program is installed, bump the per-turn counter and fire
 * `onFirstVirusInstallThisTurn` on installed Runner cards / identity once.
 * Always fires `onVirusProgramInstall` and Grimoire-class place-virus.
 */
export function noteVirusProgramInstalled(
  state: GameState,
  installedId: string,
): void {
  const installed = state.cards[installedId];
  if (!installed || installed.type !== "program") return;
  if (!(installed.subtypes ?? []).includes("virus")) return;

  const before = state.turn.virusProgramsInstalledThisTurn;
  state.turn.virusProgramsInstalledThisTurn += 1;

  const considerEvery = (sourceId: string): void => {
    if (abilitiesSuppressed(state, sourceId)) return;
    const card = state.cards[sourceId];
    if (!card) return;
    if (card.placeVirusCounterOnInstalledVirusProgram) {
      installed.virusCounters = (installed.virusCounters ?? 0) + 1;
      if (!state.turn.programsWithVirusPlacedThisTurn.includes(installedId)) {
        state.turn.programsWithVirusPlacedThisTurn.push(installedId);
      }
      if (
        installed.recurringCreditsMaxEqualsVirusCounters &&
        !abilitiesSuppressed(state, installedId)
      ) {
        installed.recurringCreditsMax = installed.virusCounters ?? 0;
      }
      log(
        state,
        `${card.title} — place 1 virus counter on ${installed.title}.`,
      );
    }
    if (!card.onVirusProgramInstall) return;
    noteStoredConditional(state, {
      cardId: sourceId,
      abilityKey: "on-virus-program-install",
      effectKey: "onVirusProgramInstall",
      controller: "runner",
      mandatory: true,
      logLine: `${card.title} becomes pending — virus program install.`,
    });
  };

  for (const id of state.runner.installed) {
    if (id === installedId) continue;
    considerEvery(id);
  }
  considerEvery(state.runner.identityId);
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "virusProgram.install");
  }

  if (before > 0 || state.done) return;
  noteFirstVirusInstall(state, installedId);
}

/**
 * Avgustina-class first virus install — queue MetPending for 10.3.1a (phase 3).
 * The newly installed virus itself is not a source (matches prior mid-hook).
 */
export function noteFirstVirusInstall(
  state: GameState,
  installedId?: string,
): void {
  if (state.turn.firstVirusInstallUsedThisTurn) return;
  if (state.turn.firstVirusInstallMetPending) return;
  const sources = [...state.runner.installed];
  if (state.runner.identityId) sources.push(state.runner.identityId);
  for (const id of sources) {
    if (installedId && id === installedId) continue;
    if (abilitiesSuppressed(state, id)) continue;
    if (!state.cards[id]?.onFirstVirusInstallThisTurn) continue;
    state.turn.firstVirusInstallMetPending = true;
    return;
  }
}

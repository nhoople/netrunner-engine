/**
 * Program / hardware install → installed continuous triggers
 * (Environmental Testing–class; CR §9.6.14b when installed).
 */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import { maybeFireCompanionInstallOrSpendCredits } from "./companionHooks.js";
import { noteJobConnectionOrHardwareInstalled } from "./azInstallDiscount.js";
import type { GameState } from "./types.js";

/**
 * After a program or hardware is installed, fire
 * `onProgramOrHardwareInstall` on other installed Runner cards / identity.
 * Does not fire for resource installs.
 * Also fires Keiko-class companion install credit gain for any companion.
 */
export function noteProgramOrHardwareInstalled(
  state: GameState,
  installedId: string,
): void {
  const installed = state.cards[installedId];
  if (!installed) return;
  noteJobConnectionOrHardwareInstalled(state, installed);
  if ((installed.subtypes ?? []).includes("companion")) {
    maybeFireCompanionInstallOrSpendCredits(state);
  }
  if (installed.type !== "program" && installed.type !== "hardware") return;
  if (state.done) return;

  const fire = (sourceId: string): void => {
    const card = state.cards[sourceId];
    if (!card?.onProgramOrHardwareInstall) return;
    const r = evalEffect(
      { state, sourceId },
      card.onProgramOrHardwareInstall,
    );
    if (!r.ok) {
      log(
        state,
        `onProgramOrHardwareInstall failed on ${card.title}: ${r.error}`,
      );
    }
  };

  for (const id of state.runner.rig) {
    if (id === installedId) continue;
    fire(id);
  }
  fire(state.runner.identityId);

  if (installed.type === "hardware") {
    state.turn.hardwareInstalledThisTurn += 1;
    fireHardwareInstallOrTrash(state);
    if (state.turn.hardwareInstalledThisTurn === 1) {
      for (const id of state.runner.rig) {
        const card = state.cards[id];
        if (!card?.onFirstHardwareInstallEachTurn) continue;
        const r = evalEffect(
          { state, sourceId: id },
          card.onFirstHardwareInstallEachTurn,
        );
        if (!r.ok) {
          log(
            state,
            `onFirstHardwareInstallEachTurn failed on ${card.title}: ${r.error}`,
          );
        }
        if (state.pendingChoice) return;
      }
    }
  }

  // LilyPAD-class: first program install each turn.
  if (
    installed.type === "program" &&
    state.turn.programsInstalledThisTurn === 1
  ) {
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (!card?.onFirstProgramInstallEachTurn) continue;
      const r = evalEffect(
        { state, sourceId: id },
        card.onFirstProgramInstallEachTurn,
      );
      if (!r.ok) {
        log(
          state,
          `onFirstProgramInstallEachTurn failed on ${card.title}: ${r.error}`,
        );
      }
      if (state.pendingChoice) return;
    }
  }
}


/** Fire identity/rig `onHardwareInstallOrTrash` (Hiram). */
export function fireHardwareInstallOrTrash(state: GameState): void {
  if (state.done) return;
  const fire = (sourceId: string): void => {
    const card = state.cards[sourceId];
    if (!card?.onHardwareInstallOrTrash) return;
    const r = evalEffect(
      { state, sourceId },
      card.onHardwareInstallOrTrash,
    );
    if (!r.ok) {
      log(
        state,
        `onHardwareInstallOrTrash failed on ${card.title}: ${r.error}`,
      );
    }
  };
  fire(state.runner.identityId);
  for (const id of state.runner.rig) fire(id);
}

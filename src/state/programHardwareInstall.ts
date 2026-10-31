/**
 * Program / hardware install → installed continuous triggers
 * (Environmental Testing–class; CR §9.6.14b when installed).
 */

import { evalEffect } from "../effects/eval.js";
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import { maybeFireCompanionInstallOrSpendCredits } from "./companionHooks.js";
import { noteJobConnectionOrHardwareInstalled } from "./azInstallDiscount.js";
import type { GameState } from "./types.js";
import { fireRunnerValTrigger } from "../effects/sansanValHooks.js";
import { onRunnerInstalledProgramOrHardware } from "./staticFlags.js";
import { noteTargetedMarketing } from "./currents.js";
import { noteStoredConditional } from "./storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";

/**
 * Azmari EdTech: the first time each turn the Runner plays or installs a
 * card of the type last named at Corp turn end, the Corp gains 2¢.
 * Called from the install funnel and from the event-played hook (events are
 * played, never installed, so both paths must check). The per-turn "fired"
 * flag lives in turn bookkeeping, which resets at each turn boundary; the
 * named type itself persists on the identity instance until renamed.
 */
export function noteAzmariNamedTypeMatch(
  state: GameState,
  card: GameState["cards"][string],
): void {
  const idCard = state.cards[state.corp.identityId];
  const named = idCard?.azmariNamedType;
  if (!named || state.turn.cotcAzmariNamedTypeFired) return;
  if (!card || card.side !== "runner" || card.type !== named) return;
  const gain = idCard?.gainCreditsOnFirstRunnerPlayOrInstallNamedType ?? 0;
  if (gain <= 0) return;
  state.corp.credits += gain;
  state.turn.cotcAzmariNamedTypeFired = true;
  log(
    state,
    `${idCard?.title ?? "Azmari EdTech"} — gain ${gain}¢ (first ${named} played/installed this turn) → ${state.corp.credits}¢.`,
  );
}

/**
 * Record an install on the turn tracker and note Paige Piper / Hayley-class
 * onFirstInstallEachTurn for Runner installs (marked at 10.3.1a).
 */
export function noteInstalledThisTurn(
  state: GameState,
  installedId: string,
): void {
  state.turn.installedThisTurn.push(installedId);
  const card = state.cards[installedId];
  if (!card || card.side !== "runner") return;
  if (!["program", "hardware", "resource"].includes(card.type)) return;

  // Corporate Grant: first Runner install each turn → Corp loses N¢.
  if (!state.turn.cotcCorpLoseOnFirstInstallFired) {
    for (const cur of Object.values(state.cards)) {
      if (abilitiesSuppressed(state, cur.id)) continue;
      const n = cur?.corpLosesCreditsOnFirstRunnerInstallEachTurn;
      if (!n || cur.zone !== "runner:play-area") continue;
      const lose = Math.min(n, state.corp.credits);
      state.corp.credits -= lose;
      state.turn.cotcCorpLoseOnFirstInstallFired = true;
      log(
        state,
        `${cur.title} — Corp loses ${lose}¢ (first Runner install) → ${state.corp.credits}¢.`,
      );
      break;
    }
  }

  // Death and Taxes / TechnoCo: may gain 1¢ on Runner install.
  for (const cur of Object.values(state.cards)) {
    if (abilitiesSuppressed(state, cur.id)) continue;
    if (cur.zone === "corp:play-area" && cur.mayGainCreditWhenRunnerInstallsOrTrashesInstalled) {
      state.corp.credits += 1;
      log(state, `${cur.title} — gain 1¢ (Runner install) → ${state.corp.credits}¢.`);
    }
  }
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      if (abilitiesSuppressed(state, id)) continue;
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      if (c.mayGainCreditWhenRunnerInstallsOrTrashesInstalled) {
        state.corp.credits += 1;
        log(state, `${c.title} — gain 1¢ (Runner install) → ${state.corp.credits}¢.`);
      }
      const isVirtualRes =
        card.type === "resource" &&
        (card.subtypes ?? []).includes("virtual");
      if (
        c.mayGainCreditWhenRunnerInstallsProgramHardwareOrVirtual &&
        (card.type === "program" ||
          card.type === "hardware" ||
          isVirtualRes)
      ) {
        state.corp.credits += 1;
        log(
          state,
          `${c.title} — gain 1¢ (program/hardware/virtual install) → ${state.corp.credits}¢.`,
        );
      }
    }
  }

  // Azmari: first play/install of named type this turn → gain credits.
  noteAzmariNamedTypeMatch(state, card);

  fireRunnerValTrigger(
    state,
    "valInstallTriggerCount",
    "onFirstInstallEachTurn",
    "onFirstInstallEachTurn",
  );
}


/**
 * In the Groove-class: fire delayed remainder-of-turn install effects when
 * printed install cost ≥ registered min (CR 9.6.13b).
 */
export function fireRemainderOfTurnOnInstallPrintedCostGte(
  state: GameState,
  installedId: string,
): void {
  const installed = state.cards[installedId];
  if (!installed || state.done) return;
  const printed = installed.installCost ?? 0;
  const regs = state.turn.remainderOfTurnOnInstallPrintedCostGte ?? [];
  for (const reg of regs) {
    if (printed < reg.min) continue;
    const r = evalEffect(
      { state, sourceId: reg.sourceId },
      structuredClone(reg.effect),
    );
    if (!r.ok) {
      log(
        state,
        `remainderOfTurnOnInstallPrintedCostGte failed (${reg.sourceId}): ${r.error}`,
      );
    }
    if (state.pendingChoice) return;
  }
}

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
  noteTargetedMarketing(state, installedId, "installs");
  fireRemainderOfTurnOnInstallPrintedCostGte(state, installedId);
  noteJobConnectionOrHardwareInstalled(state, installed);
  if ((installed.subtypes ?? []).includes("companion")) {
    maybeFireCompanionInstallOrSpendCredits(state);
  }
  if (installed.type !== "program" && installed.type !== "hardware") return;
  onRunnerInstalledProgramOrHardware(state);
  if (state.done) return;

  const consider = (sourceId: string): void => {
    if (abilitiesSuppressed(state, sourceId)) return;
    const card = state.cards[sourceId];
    if (!card?.onProgramOrHardwareInstall) return;
    noteStoredConditional(state, {
      cardId: sourceId,
      abilityKey: "on-program-or-hardware-install",
      effectKey: "onProgramOrHardwareInstall",
      controller: "runner",
      mandatory: true,
      logLine: `${card.title} becomes pending — program/hardware install.`,
    });
  };

  for (const id of state.runner.installed) {
    if (id === installedId) continue;
    consider(id);
  }
  consider(state.runner.identityId);

  if (installed.type === "hardware") {
    state.turn.hardwareInstalledThisTurn += 1;
    state.turn.lastHardwareInstalledId = installedId;
    fireOnHardwareInstall(state);
    fireHardwareInstallOrTrash(state);
    if (state.turn.hardwareInstalledThisTurn === 1) {
      noteFirstHardwareInstall(state);
    }
  }

  // LilyPAD-class: first program install each turn (marked at 10.3.1a).
  if (
    installed.type === "program" &&
    state.turn.programsInstalledThisTurn === 1
  ) {
    noteFirstProgramInstall(state);
  }

  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "programOrHardware.install");
  }
}

/**
 * First hardware install this turn — queue MetPending for 10.3.1a (phase 3).
 */
export function noteFirstHardwareInstall(state: GameState): void {
  if (state.turn.firstHardwareInstallUsedThisTurn) return;
  if (state.turn.firstHardwareInstallMetPending) return;
  if (!anyRunnerSourceHas(state, "onFirstHardwareInstallEachTurn")) return;
  state.turn.firstHardwareInstallMetPending = true;
}

/**
 * LilyPAD-class first program install — queue MetPending for 10.3.1a (phase 3).
 */
export function noteFirstProgramInstall(state: GameState): void {
  if (state.turn.firstProgramInstallUsedThisTurn) return;
  if (state.turn.firstProgramInstallMetPending) return;
  if (!anyRunnerSourceHas(state, "onFirstProgramInstallEachTurn")) return;
  state.turn.firstProgramInstallMetPending = true;
}

function anyRunnerSourceHas(
  state: GameState,
  effectKey:
    | "onFirstHardwareInstallEachTurn"
    | "onFirstProgramInstallEachTurn",
): boolean {
  const sources = [...state.runner.installed];
  if (state.runner.identityId) sources.push(state.runner.identityId);
  for (const id of sources) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (card?.[effectKey]) return true;
  }
  return false;
}


/** Note identity/rig `onHardwareInstall` (Replicator; install only, incl. self). */
export function fireOnHardwareInstall(state: GameState): void {
  if (state.done) return;
  const consider = (sourceId: string): void => {
    if (abilitiesSuppressed(state, sourceId)) return;
    const card = state.cards[sourceId];
    if (!card?.onHardwareInstall) return;
    noteStoredConditional(state, {
      cardId: sourceId,
      abilityKey: "on-hardware-install",
      effectKey: "onHardwareInstall",
      controller: "runner",
      mandatory: true,
      logLine: `${card.title} becomes pending — hardware install.`,
    });
  };
  consider(state.runner.identityId);
  for (const id of state.runner.installed) consider(id);
}

/** Note identity/rig `onHardwareInstallOrTrash` (Hiram). */
export function fireHardwareInstallOrTrash(state: GameState): void {
  if (state.done) return;
  const consider = (sourceId: string): void => {
    if (abilitiesSuppressed(state, sourceId)) return;
    const card = state.cards[sourceId];
    if (!card?.onHardwareInstallOrTrash) return;
    noteStoredConditional(state, {
      cardId: sourceId,
      abilityKey: "on-hardware-install-or-trash",
      effectKey: "onHardwareInstallOrTrash",
      controller: "runner",
      mandatory: true,
      logLine: `${card.title} becomes pending — hardware install/trash.`,
    });
  };
  consider(state.runner.identityId);
  for (const id of state.runner.installed) consider(id);
  // Trash path callers do not always reach afterBasicAction; checkpoint here.
  // Install path may have earlier sibling notes in the same queue — marked together.
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "hardware.installOrTrash");
  }
}

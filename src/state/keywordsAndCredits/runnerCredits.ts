/** Where the Runner's credits come from and how they are spent: the credit pool, recurring, hosted and run event credits, in the order a payment draws on them (CR 1.10, 8.6.5). */
import type { GameState } from "../types/game.js";
import type { CardInstance } from "../types/card.js";
import type { Side } from "../types/shared.js";
import type { RecurringSpendPurpose } from "../types/abilities.js";
import { fireRunnerCreditPoolEmpty } from "../triggers/storedTriggers.js";
import { maybeFireCompanionInstallOrSpendCredits } from "../triggers/companionHooks.js";
import { abilitiesSuppressed } from "../continuous/abilities.js";
import { log } from "../setupAndEnd/createGame.js";
import { noteOutsideCreditPoolSpendDuringRun } from "./outsidePoolSpend.js";
import { trashCard } from "../hostingAndTrash/trash.js";
import { CR } from "../../timing/labels.js";

/**
 * Reduce the Runner's credit pool. The first time it becomes empty each
 * turn, Order of Sol gains 1 credit (CR 1.10).
 */
export function subtractRunnerCreditPool(
  state: GameState,
  amount: number,
): void {
  if (amount <= 0) return;
  const before = state.runner.credits;
  state.runner.credits -= amount;
  fireRunnerCreditPoolEmpty(state, before);
}

/** Set the Runner's credit pool to 0 and apply the same empty-pool check. */
export function emptyRunnerCreditPool(state: GameState): void {
  subtractRunnerCreditPool(state, state.runner.credits);
}

/**
 * First time each turn the Runner spends credits from an installed card,
 * place 1 power on each card with powerOnFirstInstalledCardCreditSpendThisTurn.
 * When `fromCard` is a companion, also fire Keiko-class credit gain.
 */
export function noteInstalledCardCreditSpend(
  state: GameState,
  fromCard?: CardInstance,
): void {
  if (fromCard && (fromCard.subtypes ?? []).includes("companion")) {
    maybeFireCompanionInstallOrSpendCredits(state);
  }
  if (state.turn.installedCardCreditSpendThisTurn) return;
  state.turn.installedCardCreditSpendThisTurn = true;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.powerOnFirstInstalledCardCreditSpendThisTurn) continue;
    card.powerCounters = (card.powerCounters ?? 0) + 1;
    log(
      state,
      `${card.title} — place 1 power (first installed-card credit spend this turn) → ${card.powerCounters}.`,
    );
  }
}

/** True when there is an active run attacking HQ, R&D, or Archives. */
export function isAttackingCentral(state: GameState): boolean {
  const sid = state.run?.attackedServerId;
  return sid === "hq" || sid === "rd" || sid === "archives";
}

/** True when there is an active run attacking HQ. */
export function isAttackingHq(state: GameState): boolean {
  return state.run?.attackedServerId === "hq";
}

/** Recurring ¢ from installed cards with `run_central` / `run_hq` while eligible. */
export function recurringCreditsForCentralRun(state: GameState): number {
  if (!isAttackingCentral(state)) return 0;
  let n = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const purposes = card.recurringSpendFor ?? [];
    if (purposes.includes("run_central")) {
      n += card.recurringCredits ?? 0;
    } else if (purposes.includes("run_hq") && isAttackingHq(state)) {
      n += card.recurringCredits ?? 0;
    }
  }
  return n;
}

/**
 * Aircheck: the run event that hosts credits and locks the Runner's credit
 * pool "while this event is active" (CR 8.6.5): from its play until it
 * leaves the play area, including between its run and the follow-up run.
 */
export function activeCreditLockEvent(state: GameState): CardInstance | null {
  const id = state.playedRunEventId;
  const card = id ? state.cards[id] : undefined;
  if (!card || card.zone !== "runner:play-area") return null;
  if (!card.runEvent?.blockCreditPoolSpendAndLose) return null;
  return card;
}

/** The Runner cannot lose or spend credits from their credit pool. */
export function runnerCreditPoolLocked(state: GameState): boolean {
  return (
    Boolean(state.run?.blockCreditPoolSpendAndLose) ||
    activeCreditLockEvent(state) !== null
  );
}

/**
 * Runner credit pool for any payment: bank + run event credits + Cezve-class
 * `run_central` recurring while attacking a central (CR §1.10.5a / §6.3.4) +
 * Touchstone-class hosted credits spendable during runs.
 * Aircheck-class runs omit the bank (cannot spend from credit pool).
 */
export function runnerAvailableCredits(state: GameState): number {
  const bank = runnerCreditPoolLocked(state) ? 0 : state.runner.credits;
  return (
    bank +
    (state.run ? (state.run.eventCredits ?? 0) : 0) +
    recurringCreditsForCentralRun(state) +
    hostedCreditsSpendableDuringRuns(state) +
    (state.run ? state.badPublicityFund : 0)
  );
}

/** Credits available to break/pump (includes Mantle use_program pools). */
export function runnerAvailableCreditsForBreaker(state: GameState): number {
  return (
    runnerAvailableCredits(state) +
    recurringCreditsForProgramOrHardware(state, "program") +
    hostedCreditsSpendableToUseProgramsDuringRuns(state)
  );
}

/** Hosted ¢ on rig cards with `spendHostedCreditsDuringRuns` while a run is active. */
export function hostedCreditsSpendableDuringRuns(state: GameState): number {
  if (!state.run) return 0;
  let n = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsDuringRuns) continue;
    n += card.hostedCredits ?? 0;
  }
  return n;
}

/** Spend Ghost Runner-class hosted credits during a run. Returns the unpaid remainder. */
export function spendHostedCreditsDuringRuns(
  state: GameState,
  amount: number,
): number {
  if (!state.run || amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsDuringRuns) continue;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    log(state, `Spend ${take}¢ from ${card.title}.`);
  }
  return left;
}

/** Recurring ¢ that may pay for using programs (Cyberfeeder for Atman). */
export function programUseRecurringCreditsAvailable(state: GameState): number {
  let n = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!(card?.recurringSpendFor ?? []).includes("use_program")) continue;
    n += card.recurringCredits ?? 0;
  }
  return n;
}

/** Spend recurring credits that can pay for using a program. Returns how many were spent. */
export function spendProgramUseRecurringCredits(
  state: GameState,
  amount: number,
): number {
  if (amount <= 0) return 0;
  const left = takeFromProgramOrHardwareRecurring(state, amount, "program");
  return amount - left;
}

/**
 * Trickster Taka-class: hosted ¢ spendable only to use programs during runs.
 */
export function hostedCreditsSpendableToUseProgramsDuringRuns(
  state: GameState,
): number {
  if (!state.run) return 0;
  let n = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsToUseProgramsDuringRuns) continue;
    n += card.hostedCredits ?? 0;
  }
  return n;
}

/**
 * Credits on installed stealth cards (and stealth run-source events /
 * stealth eventCredits). Used for "spend credits only from stealth cards".
 * Recurring credits are placed on their card (CR 1.10.5a), so a recurring
 * credit on a stealth card (e.g. Mantle, Cloak) is a credit from a stealth
 * card and counts here alongside hosted credits.
 */
export function stealthHostedCreditsAvailable(state: GameState): number {
  let n = 0;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!(card?.subtypes ?? []).includes("stealth")) continue;
    n += (card.hostedCredits ?? 0) + (card.recurringCredits ?? 0);
  }
  const srcId = state.run?.runSourceId;
  if (srcId) {
    const src = state.cards[srcId];
    if (
      src &&
      (src.subtypes ?? []).includes("stealth") &&
      !state.runner.installed.includes(srcId)
    ) {
      n += (src.hostedCredits ?? 0) + (src.recurringCredits ?? 0);
    }
    if (src && (src.subtypes ?? []).includes("stealth")) {
      n += state.run?.eventCredits ?? 0;
    }
  }
  return n;
}

export function hostedCreditsSpendableForAnything(state: GameState): number {
  let n = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsForAnything) continue;
    n += card.hostedCredits ?? 0;
  }
  return n;
}

export function takeFromHostedCreditsForAnything(
  state: GameState,
  amount: number,
): number {
  if (amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsForAnything) continue;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} hosted credits (anything).`,
      );
      noteInstalledCardCreditSpend(state, card);
    }
  }
  return left;
}

function maybeFireNetMercur(state: GameState, taken: number): void {
  if (taken <= 0 || !state.run) return;
  if (state.turn.esNetMercurStealthUsedThisRun) return;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.firstStealthSpendEachRunPlaceCreditOrDraw) continue;
    state.turn.esNetMercurStealthUsedThisRun = true;
    state.turn.esNetMercurPendingSourceId = id;
    log(state, `Net Mercur — first stealth spend this run.`);
    break;
  }
}

export function takeFromStealthHostedCredits(
  state: GameState,
  amount: number,
): number {
  if (amount <= 0) return amount;
  let left = amount;
  const ids = [...state.runner.installed];
  const srcId = state.run?.runSourceId;
  if (srcId && !ids.includes(srcId)) ids.push(srcId);
  for (const id of ids) {
    if (left <= 0) break;
    const card = state.cards[id];
    if (!(card?.subtypes ?? []).includes("stealth")) continue;
    const pool = card.hostedCredits ?? 0;
    if (pool > 0) {
      const take = Math.min(left, pool);
      card.hostedCredits = pool - take;
      left -= take;
      if (take > 0) {
        log(state, `Spend ${take}¢ from stealth card ${card.title}.`);
        if (state.runner.installed.includes(id)) {
          noteInstalledCardCreditSpend(state, card);
        }
        noteOutsideCreditPoolSpendDuringRun(state);
        maybeFireNetMercur(state, take);
      }
    }
    if (left <= 0) break;
    // Recurring credits sit on their card (CR 1.10.5a), so a recurring
    // credit on a stealth card is spendable as a stealth credit.
    const recurring = card.recurringCredits ?? 0;
    if (recurring > 0) {
      const take = Math.min(left, recurring);
      card.recurringCredits = recurring - take;
      left -= take;
      if (take > 0) {
        log(
          state,
          `Spend ${take}¢ from stealth card ${card.title} recurring credits.`,
        );
        if (state.runner.installed.includes(id)) {
          noteInstalledCardCreditSpend(state, card);
        }
        noteOutsideCreditPoolSpendDuringRun(state);
        maybeFireNetMercur(state, take);
      }
    }
  }
  if (left > 0 && srcId) {
    const src = state.cards[srcId];
    if (
      src &&
      (src.subtypes ?? []).includes("stealth") &&
      (state.run?.eventCredits ?? 0) > 0
    ) {
      const take = Math.min(left, state.run!.eventCredits ?? 0);
      state.run!.eventCredits = (state.run!.eventCredits ?? 0) - take;
      left -= take;
      if (take > 0) {
        log(
          state,
          `Spend ${take}¢ from stealth event credits on ${src.title}.`,
        );
        noteOutsideCreditPoolSpendDuringRun(state);
      }
    }
  }
  return left;
}

export function takeFromHostedCreditsDuringRuns(
  state: GameState,
  amount: number,
): number {
  if (!state.run || amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsDuringRuns) continue;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} hosted credits (during run).`,
      );
      noteInstalledCardCreditSpend(state, card);
      noteOutsideCreditPoolSpendDuringRun(state);
      if ((card.hostedCredits ?? 0) <= 0) {
        // Penumbral Toolkit-class: trash when empty.
        if (state.runner.installed.includes(id)) {
          // Its own ability trashes it (CR 1.14.5).
          trashCard(state, id, { by: "runner" });
          log(state, `${card.title} trashed — hosted credits empty.`);
        }
      }
    }
  }
  return left;
}

/**
 * Trickster Taka-class: spend hosted ¢ to use programs during runs
 * (does not trash when empty).
 */
export function takeFromHostedCreditsToUseProgramsDuringRuns(
  state: GameState,
  amount: number,
): number {
  if (!state.run || amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsToUseProgramsDuringRuns) continue;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} hosted credits (use programs during run).`,
      );
      noteInstalledCardCreditSpend(state, card);
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  return left;
}

/**
 * Spend Runner credits drawing from `run_central` recurring (when attacking a
 * central), then run event credits, then hosted-during-run pools, then bank.
 */
export function spendRunnerCredits(state: GameState, amount: number): void {
  let left = amount;
  if (left <= 0) return;
  left = takeFromCentralRunRecurring(state, left);
  left = takeFromProgramOrHardwareRecurring(state, left, "program");
  left = takeFromHostedCreditsToUseProgramsDuringRuns(state, left);
  if (left > 0 && state.run && (state.run.eventCredits ?? 0) > 0) {
    const fromEvent = Math.min(left, state.run.eventCredits ?? 0);
    state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
    left -= fromEvent;
    if (fromEvent > 0) {
      log(state, `Spend ${fromEvent}¢ from run event credits.`);
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  left = takeFromHostedCreditsDuringRuns(state, left);
  if (left > 0 && state.run && state.badPublicityFund > 0) {
    const fromBp = Math.min(left, state.badPublicityFund);
    state.badPublicityFund -= fromBp;
    left -= fromBp;
    if (fromBp > 0) {
      log(
        state,
        `Spend ${fromBp}¢ from bad publicity fund (CR ${CR.badPublicityFund.number}).`,
      );
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  if (runnerCreditPoolLocked(state)) {
    if (left > 0) {
      log(
        state,
        `Cannot spend ${left}¢ from credit pool (Aircheck-class block).`,
      );
    }
    return;
  }
  subtractRunnerCreditPool(state, left);
}

/** Recurring ¢ from Mantle-class use_program / use_hardware pools. */
export function recurringCreditsForProgramOrHardware(
  state: GameState,
  kind: "program" | "hardware" | "either" = "either",
): number {
  let n = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const purposes = card.recurringSpendFor ?? [];
    if (
      kind === "program" &&
      (purposes.includes("use_program") ||
        purposes.includes("use_decoder") ||
        purposes.includes("use_fracter") ||
        purposes.includes("use_killer"))
    ) {
      n += card.recurringCredits ?? 0;
    } else if (
      kind === "hardware" &&
      (purposes.includes("use_hardware") ||
        purposes.includes("use_fracter") ||
        purposes.includes("use_killer"))
    ) {
      n += card.recurringCredits ?? 0;
    } else if (
      kind === "either" &&
      (purposes.includes("use_program") || purposes.includes("use_hardware"))
    ) {
      n += card.recurringCredits ?? 0;
    }
  }
  return n;
}

export function takeFromProgramOrHardwareRecurring(
  state: GameState,
  amount: number,
  kind: "program" | "hardware" | "either" = "either",
  spendingOnDecoder?: boolean,
  spendingOnFracter?: boolean,
  spendingOnKiller?: boolean,
): number {
  if (amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const purposes = card.recurringSpendFor ?? [];
    const ok =
      kind === "hardware"
        ? purposes.includes("use_hardware") ||
          (purposes.includes("use_fracter") && spendingOnFracter) ||
          (purposes.includes("use_killer") && spendingOnKiller)
        : kind === "program"
          ? purposes.includes("use_program") ||
            (purposes.includes("use_decoder") && spendingOnDecoder) ||
            (purposes.includes("use_fracter") && spendingOnFracter) ||
            (purposes.includes("use_killer") && spendingOnKiller) ||
            (card.type === "hardware" &&
              purposes.includes("use_fracter") &&
              spendingOnFracter) ||
            (card.type === "hardware" &&
              purposes.includes("use_killer") &&
              spendingOnKiller)
          : purposes.includes("use_program") ||
            purposes.includes("use_hardware") ||
            (purposes.includes("use_decoder") && spendingOnDecoder) ||
            (purposes.includes("use_fracter") && spendingOnFracter) ||
            (purposes.includes("use_killer") && spendingOnKiller);
    if (!ok) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      const label =
        kind === "hardware"
          ? "use_hardware"
          : kind === "program"
            ? "use_program"
            : purposes.includes("use_program")
              ? "use_program"
              : "use_hardware";
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (${label}).`,
      );
      noteInstalledCardCreditSpend(state, card);
      if (
        state.turn.counterSpendSourceIds &&
        !state.turn.counterSpendSourceIds.includes(id)
      ) {
        state.turn.counterSpendSourceIds.push(id);
      }
    }
  }
  return left;
}

export function takeFromCentralRunRecurring(
  state: GameState,
  amount: number,
): number {
  if (!isAttackingCentral(state) || amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const purposes = card.recurringSpendFor ?? [];
    const ok =
      purposes.includes("run_central") ||
      (purposes.includes("run_hq") && isAttackingHq(state));
    if (!ok) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      const label =
        purposes.includes("run_hq") && !purposes.includes("run_central")
          ? "run_hq"
          : "run_central";
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (${label}).`,
      );
      noteInstalledCardCreditSpend(state, card);
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  return left;
}

function runnerCardsForHostedSpend(
  state: GameState,
  purpose: "install" | "trash" | "play_event",
  forCard?: CardInstance,
): CardInstance[] {
  const ids = new Set<string>();
  for (const id of state.runner.installed) ids.add(id);
  if (state.run?.runSourceId) ids.add(state.run.runSourceId);
  for (const id of state.runner.discardPile) ids.add(id);
  const out: CardInstance[] = [];
  for (const id of ids) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    if (!(card.hostedCreditsSpendFor ?? []).includes(purpose)) continue;
    if (
      purpose === "install" &&
      card.hostedCreditsSpendForInstallSubtypes?.length
    ) {
      if (!forCard || forCard.type !== "resource") continue;
      const need = card.hostedCreditsSpendForInstallSubtypes;
      const have = forCard.subtypes ?? [];
      if (!need.some((s) => have.includes(s))) continue;
    }
    if (
      purpose === "install" &&
      card.hostedCreditsSpendForInstallExcludeSubtypes?.length
    ) {
      if (!forCard) continue;
      const exclude = card.hostedCreditsSpendForInstallExcludeSubtypes;
      const have = forCard.subtypes ?? [];
      if (exclude.some((s) => have.includes(s))) continue;
    }
    if (
      purpose === "install" &&
      card.hostedCreditsSpendForInstallTypes?.length
    ) {
      if (!forCard) continue;
      if (
        !card.hostedCreditsSpendForInstallTypes.includes(
          forCard.type as "program" | "hardware" | "resource",
        )
      ) {
        continue;
      }
    }
    out.push(card);
  }
  return out;
}

/** Cards that can spend non-recurring hosted credits for install costs. */
function hostedInstallSpendCards(
  state: GameState,
  side: Side,
  forCard?: CardInstance,
): CardInstance[] {
  if (side === "runner") {
    return runnerCardsForHostedSpend(state, "install", forCard);
  }
  const out: CardInstance[] = [];
  for (const card of Object.values(state.cards)) {
    if (
      card.side === "corp" &&
      card.rezzed &&
      !abilitiesSuppressed(state, card.id) &&
      (card.hostedCreditsSpendFor ?? []).includes("install")
    ) {
      out.push(card);
    }
  }
  return out;
}

function hostedTrashSpendCards(state: GameState): CardInstance[] {
  return runnerCardsForHostedSpend(state, "trash");
}

function hostedPlayEventSpendCards(state: GameState): CardInstance[] {
  return runnerCardsForHostedSpend(state, "play_event");
}

/** Bank + hosted-credit pools spendable for install costs. */
export function creditsAvailableForInstall(
  state: GameState,
  side: Side,
  forCard?: CardInstance,
): number {
  const p = side === "corp" ? state.corp : state.runner;
  let total = p.credits;
  for (const card of hostedInstallSpendCards(state, side, forCard)) {
    total += card.hostedCredits ?? 0;
  }
  // Cyberfeeder-class: recurring ¢ usable to install virus programs.
  if (
    side === "runner" &&
    forCard?.type === "program" &&
    (forCard.subtypes ?? []).includes("virus")
  ) {
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!(card.recurringSpendFor ?? []).includes("install_virus")) continue;
      total += card.recurringCredits ?? 0;
    }
  }
  // Inside Man: recurring ¢ usable to install hardware.
  if (side === "runner" && forCard?.type === "hardware") {
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!(card.recurringSpendFor ?? []).includes("install_hardware"))
        continue;
      total += card.recurringCredits ?? 0;
    }
  }
  // Sahasrara: recurring ¢ usable to install programs.
  if (side === "runner" && forCard?.type === "program") {
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!(card.recurringSpendFor ?? []).includes("install_program")) continue;
      total += card.recurringCredits ?? 0;
    }
  }
  return total;
}

/**
 * Pay an install cost, drawing from `hostedCreditsSpendFor: ["install"]`
 * pools before the credit bank (Cybersand / Urban Art Vernissage).
 * Optional `forCard` gates Open Market–class subtype-restricted pools.
 * Virus installs also draw from `recurringSpendFor: ["install_virus"]`.
 */
export function spendCreditsForInstall(
  state: GameState,
  side: Side,
  amount: number,
  forCard?: CardInstance,
): void {
  let left = amount;
  if (left <= 0) return;
  for (const card of hostedInstallSpendCards(state, side, forCard)) {
    if (left <= 0) break;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(state, `Spend ${take}¢ from ${card.title} hosted credits (install).`);
      if (side === "runner") noteInstalledCardCreditSpend(state, card);
    }
  }
  if (
    side === "runner" &&
    forCard?.type === "program" &&
    (forCard.subtypes ?? []).includes("virus")
  ) {
    for (const id of state.runner.installed) {
      if (left <= 0) break;
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!(card.recurringSpendFor ?? []).includes("install_virus")) continue;
      const pool = card.recurringCredits ?? 0;
      if (pool <= 0) continue;
      const take = Math.min(left, pool);
      card.recurringCredits = pool - take;
      left -= take;
      if (take > 0) {
        log(
          state,
          `Spend ${take}¢ from ${card.title} recurring credits (install_virus).`,
        );
        noteInstalledCardCreditSpend(state, card);
      }
    }
  }
  if (side === "runner" && forCard?.type === "hardware") {
    for (const id of state.runner.installed) {
      if (left <= 0) break;
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!(card.recurringSpendFor ?? []).includes("install_hardware"))
        continue;
      const pool = card.recurringCredits ?? 0;
      if (pool <= 0) continue;
      const take = Math.min(left, pool);
      card.recurringCredits = pool - take;
      left -= take;
      if (take > 0) {
        log(
          state,
          `Spend ${take}¢ from ${card.title} recurring credits (install_hardware).`,
        );
        noteInstalledCardCreditSpend(state, card);
      }
    }
  }
  if (side === "runner" && forCard?.type === "program") {
    for (const id of state.runner.installed) {
      if (left <= 0) break;
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!(card.recurringSpendFor ?? []).includes("install_program")) continue;
      const pool = card.recurringCredits ?? 0;
      if (pool <= 0) continue;
      const take = Math.min(left, pool);
      card.recurringCredits = pool - take;
      left -= take;
      if (take > 0) {
        log(
          state,
          `Spend ${take}¢ from ${card.title} recurring credits (install_program).`,
        );
        noteInstalledCardCreditSpend(state, card);
      }
    }
  }
  if (side === "runner") {
    // The pool is spent like any other cost, so Order of Sol sees it empty (CR 1.10).
    subtractRunnerCreditPool(state, left);
  } else {
    state.corp.credits -= left;
  }
}

/** Refill recurring credit pools on installed/rezzed cards for a side. */
export function refillRecurringCredits(state: GameState, side: Side): void {
  const hasRecurringPool = (c: {
    recurringCreditsMax?: number;
    recurringCreditsMaxEqualsRunnerLink?: boolean;
    recurringCreditsMaxEqualsVirusCounters?: boolean;
    recurringCreditsMaxEqualsRemoteServers?: boolean;
    recurringCreditsMaxEqualsIceProtectingHq?: boolean;
  }) =>
    (c.recurringCreditsMax ?? 0) > 0 ||
    Boolean(c.recurringCreditsMaxEqualsRunnerLink) ||
    Boolean(c.recurringCreditsMaxEqualsVirusCounters) ||
    Boolean(c.recurringCreditsMaxEqualsRemoteServers) ||
    Boolean(c.recurringCreditsMaxEqualsIceProtectingHq);

  const ids =
    side === "corp"
      ? Object.values(state.cards)
          .filter(
            (c) =>
              c.side === "corp" &&
              c.rezzed &&
              !abilitiesSuppressed(state, c.id) &&
              hasRecurringPool(c),
          )
          .map((c) => c.id)
      : state.runner.installed.filter(
          (id) =>
            !abilitiesSuppressed(state, id) &&
            hasRecurringPool(state.cards[id]),
        );

  for (const id of ids) {
    const card = state.cards[id];
    if (card.recurringCreditsMaxEqualsRunnerLink) {
      card.recurringCreditsMax = state.runner.link;
    }
    if (card.recurringCreditsMaxEqualsVirusCounters) {
      card.recurringCreditsMax = card.virusCounters ?? 0;
    }
    if (card.recurringCreditsMaxEqualsRemoteServers) {
      card.recurringCreditsMax = Object.keys(state.servers).filter((sid) =>
        sid.startsWith("remote"),
      ).length;
    }
    if (card.recurringCreditsMaxEqualsIceProtectingHq) {
      card.recurringCreditsMax = state.servers.hq?.ice.length ?? 0;
    }
    const max = card.recurringCreditsMax ?? 0;
    card.recurringCredits = max;
  }
  if (ids.length > 0) {
    log(
      state,
      `${side} recurring credits refill on ${ids.length} card(s) (CR ${CR.recurringCredits.number}).`,
    );
  }
}

/**
 * Spend Runner credits for trash / play_event, drawing from matching
 * recurringSpendFor pools (incl. `run_central` while attacking a central)
 * before the credit bank / run event credits.
 */
export function spendRunnerCreditsFor(
  state: GameState,
  amount: number,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): void {
  let left = amount;
  if (left <= 0) return;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    const card = state.cards[id];
    if (!recurringMatchesPurpose(state, card, purpose)) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      const label = (card.recurringSpendFor ?? []).includes("run_central")
        ? "run_central"
        : purpose;
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (${label}).`,
      );
      noteInstalledCardCreditSpend(state, card);
    }
  }
  if ((purpose === "trash" || purpose === "trash_asset") && left > 0) {
    for (const card of hostedTrashSpendCards(state)) {
      if (left <= 0) break;
      const pool = card.hostedCredits ?? 0;
      if (pool <= 0) continue;
      const take = Math.min(left, pool);
      card.hostedCredits = pool - take;
      left -= take;
      if (take > 0) {
        log(state, `Spend ${take}¢ from ${card.title} hosted credits (trash).`);
        noteInstalledCardCreditSpend(state, card);
        // Miss Bones-class: trash when hosted credits empty.
        if ((card.hostedCredits ?? 0) <= 0) {
          if (state.runner.installed.includes(card.id)) {
            // Its own ability trashes it (CR 1.14.5).
            trashCard(state, card.id, { by: "runner" });
            log(state, `${card.title} trashed — hosted credits empty.`);
          }
        }
      }
    }
  }
  if (purpose === "play_event" && left > 0) {
    for (const card of hostedPlayEventSpendCards(state)) {
      if (left <= 0) break;
      const pool = card.hostedCredits ?? 0;
      if (pool <= 0) continue;
      const take = Math.min(left, pool);
      card.hostedCredits = pool - take;
      left -= take;
      if (take > 0) {
        log(
          state,
          `Spend ${take}¢ from ${card.title} hosted credits (play_event).`,
        );
        noteInstalledCardCreditSpend(state, card);
      }
    }
  }
  if (left > 0 && state.run && (state.run.eventCredits ?? 0) > 0) {
    const fromEvent = Math.min(left, state.run.eventCredits ?? 0);
    state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
    left -= fromEvent;
    if (fromEvent > 0) {
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  left = takeFromHostedCreditsDuringRuns(state, left);
  subtractRunnerCreditPool(state, left);
}

/** Credits available for a purpose including matching recurring pools. */
export function runnerCreditsFor(
  state: GameState,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): number {
  let total = state.runner.credits + (state.run?.eventCredits ?? 0);
  total += hostedCreditsSpendableDuringRuns(state);
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (recurringMatchesPurpose(state, card, purpose)) {
      total += card.recurringCredits ?? 0;
    }
  }
  if (purpose === "trash" || purpose === "trash_asset") {
    for (const card of hostedTrashSpendCards(state)) {
      total += card.hostedCredits ?? 0;
    }
  }
  if (purpose === "play_event") {
    for (const card of hostedPlayEventSpendCards(state)) {
      total += card.hostedCredits ?? 0;
    }
  }
  return total;
}

function recurringMatchesPurpose(
  state: GameState,
  card: CardInstance,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): boolean {
  if (abilitiesSuppressed(state, card.id)) return false;
  const purposes = card.recurringSpendFor ?? [];
  const subtypeLimit = card.recurringSpendForPlayEventSubtypes;
  if (purpose === "play_event" && subtypeLimit && subtypeLimit.length > 0) {
    const event = state.turn.playingEventId
      ? state.cards[state.turn.playingEventId]
      : undefined;
    const subs = (event?.subtypes ?? []).map((s) => s.toLowerCase());
    if (!subtypeLimit.some((s) => subs.includes(s.toLowerCase()))) return false;
  }
  if (purposes.includes(purpose)) return true;
  // Generic "trash" also covers asset trash costs.
  if (purpose === "trash_asset" && purposes.includes("trash")) return true;
  // Cezve-class: any purpose while attacking a central.
  if (purposes.includes("run_central") && isAttackingCentral(state))
    return true;
  // Pheromones-class: any purpose while attacking HQ.
  if (purposes.includes("run_hq") && isAttackingHq(state)) return true;
  return false;
}

/**
 * When more than one replacement would change the breach, the Runner chooses
 * which applies first. A later replacement applies only if a breach is still
 * expected (CR 9.9.11a).
 */
import { log } from "../state/createGame.js";
import type { Effect } from "../effects/ir.js";
import type { GameState } from "../state/types.js";
import { CR } from "./labels.js";

export type BreachReplacementMode =
  | "security_testing"
  | "account_siphon"
  | "showing_off_first"
  | "security_testing_first";

function securityTestingId(state: GameState): string | null {
  const serverId = state.run?.attackedServerId;
  if (!serverId) return null;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (card?.securityTesting && card.namedServerId === serverId) return id;
  }
  return null;
}

export function accountSiphonReplacesBreach(state: GameState): boolean {
  const effect = state.run?.onSuccessfulRunEffect;
  return (
    effect?.op === "do" &&
    effect.action.kind === "may_breach_instead_account_siphon"
  );
}

export function showingOffReplacesBreach(state: GameState): boolean {
  return Boolean(
    state.run?.accessFromBottomOfRd && state.run.attackedServerId === "rd",
  );
}

export function hasCompetingBreachReplacement(state: GameState): boolean {
  if (!securityTestingId(state)) return false;
  return accountSiphonReplacesBreach(state) || showingOffReplacesBreach(state);
}

function applySecurityTesting(state: GameState): void {
  const id = securityTestingId(state);
  const run = state.run;
  if (!id || !run) return;
  const card = state.cards[id]!;
  state.runner.credits += 2;
  run.skipBreach = true;
  run.accessFromBottomOfRd = false;
  card.namedServerId = undefined;
  log(
    state,
    `${card.title} — gain 2¢ instead of breaching ${run.attackedServerId}.`,
  );
}

function skipSecurityTesting(state: GameState): void {
  const id = securityTestingId(state);
  if (!id) return;
  const card = state.cards[id]!;
  card.namedServerId = undefined;
  log(
    state,
    `${card.title}'s replacement has nothing to replace and does not apply (CR ${CR.replacementMustReplace.number}).`,
  );
}

export function openBreachReplacementChoice(state: GameState): void {
  const run = state.run;
  const stId = securityTestingId(state);
  if (!run || !stId) return;
  const siphon = accountSiphonReplacesBreach(state);
  const showingOff = showingOffReplacesBreach(state);
  const options: Array<{ id: string; label: string; effect: Effect }> = [];
  if (siphon) {
    options.push(
      {
        id: "replacement:security-testing",
        label: "Apply Security Testing",
        effect: {
          op: "do",
          action: { kind: "resolve_breach_replacement", mode: "security_testing" },
        },
      },
      {
        id: "replacement:account-siphon",
        label: "Apply Account Siphon",
        effect: {
          op: "do",
          action: { kind: "resolve_breach_replacement", mode: "account_siphon" },
        },
      },
    );
  }
  if (showingOff) {
    options.push(
      {
        id: "replacement:security-testing-first",
        label: "Apply Security Testing first",
        effect: {
          op: "do",
          action: {
            kind: "resolve_breach_replacement",
            mode: "security_testing_first",
          },
        },
      },
      {
        id: "replacement:showing-off-first",
        label: "Apply Showing Off first",
        effect: {
          op: "do",
          action: { kind: "resolve_breach_replacement", mode: "showing_off_first" },
        },
      },
    );
  }
  if (options.length < 2) return;
  run.deferBreachReplacement = false;
  state.pendingChoice = {
    sourceId: stId,
    chooser: "runner",
    options,
  };
  log(
    state,
    `Choose which replacement applies to the breach (CR ${CR.replacementMustReplace.number}).`,
  );
}

export function resolveBreachReplacement(
  state: GameState,
  mode: BreachReplacementMode,
): void {
  const run = state.run;
  if (run) run.deferBreachReplacement = false;
  if (mode === "security_testing" || mode === "security_testing_first") {
    applySecurityTesting(state);
    if (mode === "security_testing_first") {
      log(
        state,
        `Showing Off's replacement has nothing to replace and does not apply (CR ${CR.replacementMustReplace.number}).`,
      );
    }
    return;
  }
  if (mode === "showing_off_first") {
    log(
      state,
      `Showing Off replaces the breach, and breaching R&D is still expected (CR ${CR.replacementMustReplace.number}).`,
    );
    applySecurityTesting(state);
    log(
      state,
      `Security Testing replaces that breach (CR ${CR.replacementMustReplace.number}).`,
    );
    return;
  }
  skipSecurityTesting(state);
}

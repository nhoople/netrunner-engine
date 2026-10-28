/**
 * Runner click spend/lose hooks shared by action apply and encounter graph
 * (Sundew spend credits; Seidr first click during run).
 */
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import { emptyRunnerCreditPool } from "./costs.js";
import type { GameState } from "./types.js";
import { fireRunnerValTrigger } from "../effects/sansanValHooks.js";
import { fireStoredConditionals } from "./storedTriggers.js";

/** Sundew: first Runner click-spend this turn → Corp gains credits. */
function maybeFireSundewOnClickSpend(state: GameState): void {
  if (state.turn.sundewFirstClickSpendFiredThisTurn) return;
  state.turn.sundewFirstClickSpendFiredThisTurn = true;
  const refundServers: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      const n = card?.gainCreditsOnFirstRunnerClickSpendThisTurn;
      if (!card?.rezzed || !n) continue;
      state.corp.credits += n;
      log(state, `${card.title} — gain ${n}¢ (first Runner click spend).`);
      if (card.refundCreditsIfRunBeginsOnThisServerDuringClickAction) {
        refundServers.push(server.id);
      }
    }
  }
  state.turn.sundewRefundServerIdsThisAction = refundServers;
}

/** Seidr: first click spend/lose during a run → Archives→R&D effect. */
export function maybeFireSeidrOnClickSpendOrLose(state: GameState): void {
  if (!state.run || state.turn.seidrClickDuringRunFiredThisTurn) return;
  const idCard = state.cards[state.corp.identityId];
  if (
    !idCard?.onFirstRunnerClickSpendOrLoseDuringRun ||
    abilitiesSuppressed(state, state.corp.identityId)
  ) {
    return;
  }
  state.turn.seidrClickDuringRunFiredThisTurn = true;
  fireStoredConditionals(state, [
    {
      abilityKey: "seidr-first-click-during-run",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onFirstRunnerClickSpendOrLoseDuringRun",
      logLine: `${idCard.title} becomes pending — first Runner click spend/lose during a run.`,
    },
  ]);
}

/**
 * Call when the Runner spends ≥1 click (basic actions / paid abilities).
 * Clears prior Sundew refund watch, then may fire Sundew + Seidr.
 */
export function noteRunnerClickSpend(state: GameState): void {
  state.turn.sundewRefundServerIdsThisAction = [];
  maybeFireSundewOnClickSpend(state);
  maybeFireSeidrOnClickSpendOrLose(state);
}

/** Call when the Runner loses a click (not a spend) during a run. */
export function noteRunnerClickLose(state: GameState): void {
  const serverId = state.run?.attackedServerId;
  const server = serverId ? state.servers[serverId] : undefined;
  if (server) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.runnerLosesAllCreditsOnClickLossDuringRunOnThisServer) {
        continue;
      }
      emptyRunnerCreditPool(state);
      log(
        state,
        `${card.title} — Runner loses all credits (lost a click during a run on this server).`,
      );
    }
  }
  maybeFireSeidrOnClickSpendOrLose(state);
  fireRunnerValTrigger(
    state,
    "valClickLossTriggerCount",
    "onFirstClickLossEachTurnExceptPaidAbility",
    "onFirstClickLossEachTurnExceptPaidAbility",
  );
}

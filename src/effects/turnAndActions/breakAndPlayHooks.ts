/** Hooks after a subroutine is broken and after an operation or event resolves, moved out of `effects/eval.ts`. */
import type { GameState } from "../../state/types/game.js";
import { allSubroutinesBrokenByRunner } from "../../state/turnAndActions/break.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { runnerIsTagged } from "../../state/keywordsAndCredits/tags.js";
import { addBreakerStrengthBoostThisRun } from "../../state/continuous/lingeringEffects.js";
import { fireOnBreakSubroutineTriggers } from "../../state/triggers/cardLifecycleHooks.js";
import type { Effect } from "../ir/effect.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  fireOnGrayOrBlackOpsTrashedAfterResolve,
  fireOnAfterOperationOrExpendable as markOnAfterOperationOrExpendable,
} from "../../state/triggers/miscConditionalHooks.js";

/**
 * e3 Feedback Implants / Snowball: after a subroutine is broken, fire
 * onBreakSubroutine hooks on installed Runner cards and apply
 * strengthBonusOnBreakSubForRun on the breaker that broke.
 */
export function fireAfterBreakSubroutineHooks(
  state: GameState,
  breakerId: string | null,
): void {
  const enc = state.run?.encounter;
  if (!enc) return;
  // Cyberdelia: first time each turn you fully break ice, gain N¢.
  if (
    allSubroutinesBrokenByRunner(enc) &&
    !state.turn.ssFirstFullyBreakCreditsFired
  ) {
    for (const rid of state.runner.installed) {
      if (abilitiesSuppressed(state, rid)) continue;
      const hw = state.cards[rid];
      const n = hw?.gainCreditsOnFirstFullyBreakEachTurn;
      if (!hw || typeof n !== "number" || n <= 0) continue;
      state.turn.ssFirstFullyBreakCreditsFired = true;
      state.runner.credits += n;
      log(
        state,
        `${hw.title} — gain ${n}¢ (first full break this turn) → ${state.runner.credits}¢.`,
      );
      break;
    }
  }
  const ice = state.cards[enc.iceId];
  if (ice?.gainCreditWheneverRunnerBreaksSubroutine) {
    state.corp.credits += 1;
    log(
      state,
      `${ice.title} — gain 1¢ (subroutine broken) → ${state.corp.credits}¢.`,
    );
  }
  // Henry Phillips: gain N¢ on break during run on this server if Runner tagged.
  if (state.run?.attackedServerId && runnerIsTagged(state)) {
    const root = state.servers[state.run.attackedServerId]?.root ?? [];
    for (const sid of root) {
      const up = state.cards[sid];
      const amt = up?.gainCreditsOnBreakSubThisServerIfTagged;
      if (!up || (!up.rezzed && !up.persistent) || typeof amt !== "number") {
        continue;
      }
      state.corp.credits += amt;
      log(
        state,
        `${up.title} — gain ${amt}¢ (break while tagged) → ${state.corp.credits}¢.`,
      );
    }
  }
  if (breakerId && state.runner.installed.includes(breakerId)) {
    const breaker = state.cards[breakerId];
    const bonus = breaker?.strengthBonusOnBreakSubForRun;
    if (typeof bonus === "number" && bonus !== 0 && state.run) {
      addBreakerStrengthBoostThisRun(state, {
        createdBy: breakerId,
        breakerId,
        amount: bonus,
      });
      log(
        state,
        `${breaker!.title} — +${bonus} strength for the remainder of the run.`,
      );
    }
  }
  if (state.pendingChoice) return;
  const unbroken = enc.broken.some((b) => !b);
  fireOnBreakSubroutineTriggers(state);
  for (const id of state.runner.installed) {
    if (state.pendingChoice) return;
    const card = state.cards[id];
    if (!card) continue;
    const mayPay = card.onBreakSubroutineMayPayCreditsBreakAnother;
    if (mayPay && unbroken) {
      const credits = Math.max(0, mayPay.credits ?? 1);
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      if (state.runner.credits >= credits) {
        options.unshift({
          id: `pay-break:${credits}`,
          label: `Pay ${credits}¢ to break 1 subroutine`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: credits,
                },
              },
              {
                op: "do",
                action: { kind: "break_encounter_subroutine", maxSubs: 1 },
              },
            ],
          },
        });
      }
      if (options.length > 1) {
        openPendingChoose(state, {
          sourceId: id,
          chooser: "runner",
          options,
          logLine: `${card.title} — may pay ${credits}¢ to break another subroutine.`,
        });
        return;
      }
    }
  }
}

/** Tallie Perrault: gray/black ops operation trashed after resolving. */
export function fireGrayBlackOpsTrashedHooks(
  state: GameState,
  opCardId: string,
): void {
  const op = state.cards[opCardId];
  if (!op || op.type !== "operation") return;
  const subs = op.subtypes ?? [];
  if (!subs.includes("gray ops") && !subs.includes("black ops")) return;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.onGrayOrBlackOpsTrashedAfterResolve) continue;
    fireOnGrayOrBlackOpsTrashedAfterResolve(state, id);
  }
}

/** Nuvem: after operation or expendable card action. */
export function fireOnAfterOperationOrExpendable(state: GameState): void {
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onAfterOperationOrExpendable) return;
  markOnAfterOperationOrExpendable(state, idCard.id);
}

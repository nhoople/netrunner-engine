/**
 * Primitive kinds whose procedure is pay.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type {
  Effect,
  Primitive,
} from "../ir.js";
import {
  subtractRunnerCreditPool,
  hostedCreditsSpendableDuringRuns,
  spendHostedCreditsDuringRuns,
} from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { noteCorpAbilityCausedRunnerCreditLossOrSpend } from "../../state/gamenet.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import {
  resolveSide,
  applyPrimitive,
} from "../eval.js";

export function applyPayKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "may_pay_credits_add_virus_counter": {
      const cost = Math.max(0, action.credits ?? 0);
      const amount = Math.max(0, action.amount ?? 1);
      const canPay = state.runner.credits >= cost && cost > 0;
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
      if (canPay || cost === 0) {
        options.unshift({
          id: "pay",
          label: `Pay ${cost}¢: place ${amount} virus counter(s)`,
          effect: {
            op: "do",
            action: {
              kind: "pay_credits_add_virus_counter" as const,
              credits: cost,
              amount,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — may pay ${cost}¢ for virus.`,
});
      return { ok: true };
    }

case "pay_credits_add_virus_counter": {
      const cost = Math.max(0, action.credits ?? 0);
      const amount = Math.max(0, action.amount ?? 1);
      if (state.runner.credits < cost) {
        log(state, `${source.title} — cannot afford virus payment.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      return applyPrimitive(ctx, { kind: "add_virus_counter", amount });
    }

case "may_pay_credits_for_trash_programs_per_advancement": {
      const count = source.advancementCounters ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (count > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: trash ${count} program(s)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "trash_n_programs_remaining",
                  remaining: count,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — may pay ${action.amount}¢ to trash ${count} program(s) (1 per advancement).`,
});
      return { ok: true };
    }

case "may_pay_credits_for_shuffle_installed_runner_per_advancement": {
      const count = source.advancementCounters ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (count > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: shuffle ${count} installed Runner card(s)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "shuffle_n_installed_runner_remaining",
                  remaining: count,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — may pay ${action.amount}¢ to shuffle ${count} installed Runner card(s) (1 per advancement).`,
});
      return { ok: true };
    }

case "pay_credits_or_etr": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const hosted =
        side === "runner" && state.run
          ? hostedCreditsSpendableDuringRuns(state)
          : 0;
      if (p.credits + hosted >= action.amount) {
        let left = action.amount;
        const fromPool = Math.min(left, p.credits);
        if (side === "runner") {
          if (fromPool > 0) subtractRunnerCreditPool(state, fromPool);
        } else {
          p.credits -= fromPool;
        }
        left -= fromPool;
        if (left > 0) spendHostedCreditsDuringRuns(state, left);
        log(
          state,
          `${side} pays ${action.amount}¢ (forced — able to pay) → ${p.credits}.`,
        );
        if (side === "runner" && action.amount > 0) {
          noteCorpAbilityCausedRunnerCreditLossOrSpend(
            state,
            action.amount,
            sourceId,
          );
        }
        return { ok: true };
      }
      log(
        state,
        `${side} cannot pay ${action.amount}¢ — end the run.`,
      );
      return applyPrimitive(ctx, { kind: "end_the_run" });
    }

case "pay_rez_additional_cost": {
      const agendas = [...state.corp.scoreArea];
      const hqCount = state.corp.hand.length;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (agendas.length > 0) {
        for (const agId of agendas) {
          if (state.cards[agId]?.cannotForfeit) continue;
          options.push({
            id: `forfeit:${agId}`,
            label: `Forfeit ${state.cards[agId]!.title}`,
            effect: {
              op: "do",
              action: { kind: "forfeit_scored_agenda", cardId: agId },
            },
          });
        }
      }
      if (hqCount >= 3) {
        options.push({
          id: "trash-hq-3",
          label: "Reveal and trash 3 cards from HQ",
          effect: {
            op: "do",
            action: {
              kind: "trash_hq",
              amount: 3,
              pick: "choose",
            },
          },
        });
      }
      if (options.length === 0) {
        return {
          ok: false,
          error: "Plutus rez cost: need a scored agenda or 3+ cards in HQ.",
          cites: [CR.rezProcedure],
        };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Plutus — pay additional rez cost.`,
});
      return { ok: true };
    }

case "may_pay_place": {
      const x = action.amount;
      if (x <= 0) {
        log(state, `${source.title} — X=0; decline place advancements.`);
        return { ok: true };
      }
      const canPay = state.corp.credits >= x;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...(canPay
            ? [
                {
                  id: "pay-place",
                  label: `Pay ${x}¢ to place ${x} advancement(s)`,
                  effect: {
                    op: "seq" as const,
                    effects: [
                      {
                        op: "do" as const,
                        action: {
                          kind: "lose_credits" as const,
                          side: "corp" as const,
                          amount: x,
                        },
                      },
                      {
                        op: "do" as const,
                        action: {
                          kind: "place_advancements" as const,
                          amount: x,
                          pick: "choose" as const,
                        },
                      },
                    ],
                  },
                },
              ]
            : []),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
logLine: canPay
          ? `${source.title} — may pay ${x}¢ to place ${x} advancement(s).`
          : `${source.title} — cannot afford ${x}¢; only decline.`,
});
      return { ok: true };
    }

case "pay_credits_reencounter_passed_ice": {
      if (!state.run?.pendingReencounterIceId) {
        log(state, `Reencounter — no pending ice.`);
        return { ok: true };
      }
      if (state.corp.credits < action.credits) {
        log(state, `Reencounter — cannot afford ${action.credits}¢.`);
        state.run.pendingReencounterIceId = undefined;
        return { ok: true };
      }
      state.corp.credits -= action.credits;
      state.run.reencounterIceId = state.run.pendingReencounterIceId;
      state.run.pendingReencounterIceId = undefined;
      log(
        state,
        `Pay ${action.credits}¢ — Runner will encounter ice again.`,
      );
      return { ok: true };
    }

case "may_pay_credits_gain_click_trash_at_turn_end_if_no_successful_run": {
      const credits = Math.max(0, action.credits);
      if (state.runner.credits < credits) {
        log(
          state,
          `${source.title} — cannot pay ${credits}¢ to gain [click].`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "pay-click",
            label: `Pay ${credits}¢ to gain [click]`,
            effect: {
              op: "do",
              action: {
                kind: "pay_gain_click",
                credits,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
        ],
logLine: `${source.title} — may pay ${credits}¢ to gain [click] (trash at turn end if no successful run).`,
});
      return { ok: true };
    }

case "pay_gain_click": {
      const credits = Math.max(0, action.credits);
      if (state.runner.credits < credits) {
        log(state, `${source.title} — cannot afford ${credits}¢.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, credits);
      state.runner.clicks += 1;
      source.trashAtTurnEndUnlessSuccessfulRun = true;
      log(
        state,
        `${source.title} — pay ${credits}¢ → ${state.runner.credits}¢, gain [click] → ${state.runner.clicks} (trash at turn end unless successful run).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

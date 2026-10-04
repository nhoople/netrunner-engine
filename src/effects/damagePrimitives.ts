/**
 * Damage primitives. Deal, prevent, and pay-for-damage cases extracted from
 * eval.ts. Run-unless-damage and card-specific loops stay in the switch.
 */
import { log } from "../state/createGame.js";
import { dealDamage, preventPendingDamage } from "../state/damage.js";
import type { GameState, RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

type EvalEffect = (ctx: EffectCtx, effect: Effect) => PrimResult;

type ServerHostingCard = (
  state: GameState,
  cardId: string,
) => { ice: readonly string[] } | null;

function dealStandardDamage(
  ctx: EffectCtx,
  action: Extract<
    Primitive,
    {
      kind: "net_damage" | "meat_damage" | "core_damage" | "brain_damage";
    }
  >,
): PrimResult {
  const { state, sourceId } = ctx;
  const dtype =
    action.kind === "net_damage"
      ? "net"
      : action.kind === "meat_damage"
        ? "meat"
        : action.kind === "core_damage"
          ? "core"
          : "brain";
  const interactive =
    action.kind === "core_damage" && Boolean(action.interactive);
  const preventByLoseAllClicks =
    action.kind === "core_damage" && Boolean(action.preventByLoseAllClicks);
  const cannotPrevent =
    (action.kind === "meat_damage" || action.kind === "core_damage") &&
    Boolean(action.cannotPrevent);
  dealDamage(state, dtype, action.amount, sourceId, {
    interactive,
    preventByLoseAllClicks,
    ...(cannotPrevent ? { cannotPrevent: true } : {}),
  });
  return { ok: true };
}

export function applyDamagePrimitive(
  ctx: EffectCtx,
  action: Primitive,
  evalEffect: EvalEffect,
  serverHostingCard: ServerHostingCard,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "net_damage_per_runner_scored_agenda": {
      const amount = state.runner.score.length;
      if (amount <= 0) {
        log(state, `Philotic — no agendas in Runner score area.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      log(
        state,
        `${source?.title ?? sourceId} — ${amount} net damage (1 per Runner scored agenda).`,
      );
      return { ok: true };
    }
    case "net_damage":
    case "meat_damage":
    case "core_damage":
    case "brain_damage":
      return dealStandardDamage(ctx, action);
    case "net_damage_1_plus_copies_of_source_title_in_other_score_area": {
      const title = source.title;
      const inRunnerScore = state.runner.score.includes(sourceId);
      const otherScore = inRunnerScore ? state.corp.score : state.runner.score;
      const copies = otherScore.filter(
        (id) => state.cards[id]?.title === title,
      ).length;
      const amount = 1 + copies;
      dealDamage(state, "net", amount, sourceId);
      log(
        state,
        `${source.title} — ${amount} net damage (1 + ${copies} copie(s) in other score area).`,
      );
      return { ok: true };
    }
    case "may_remove_power_counters_then_net_damage": {
      const hosted = source.powerCounters ?? 0;
      const maxRemove = Math.min(action.maxRemove, hosted);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= maxRemove; n++) {
        const dmg = action.base + action.perRemoved * n;
        options.push({
          id: `remove-${n}`,
          label:
            n === 0
              ? `Remove 0 power counters — do ${dmg} net damage`
              : `Remove ${n} power counter(s) — do ${dmg} net damage`,
          effect: {
            op: "seq",
            effects: [
              ...(n > 0
                ? [
                    {
                      op: "do" as const,
                      action: {
                        kind: "remove_power_counter" as const,
                        amount: n,
                      },
                    },
                  ]
                : []),
              {
                op: "do" as const,
                action: { kind: "net_damage" as const, amount: dmg },
              },
            ],
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may remove up to ${maxRemove} power counter(s), then net damage.`,
      );
      return { ok: true };
    }
    case "net_damage_agenda_points_this_turn": {
      const amount = state.turn.agendaPointsScoredThisTurn;
      if (amount <= 0) {
        log(state, `Neurospike — 0 agenda points scored this turn.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "may_pay_credits_for_core_damage": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${action.damage} core damage`,
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
                  kind: "core_damage",
                  amount: action.damage,
                  interactive: true,
                  preventByLoseAllClicks: true,
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${action.damage} core damage.`,
      );
      return { ok: true };
    }
    case "may_pay_credits_for_core_damage_per_advancement": {
      const damage = source.advancementTokens ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (damage > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${damage} core damage`,
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
                  kind: "core_damage",
                  amount: damage,
                  interactive: true,
                  preventByLoseAllClicks: true,
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${damage} core damage (per advancement).`,
      );
      return { ok: true };
    }
    case "may_pay_credits_for_net_damage_per_advancement": {
      const per = Math.max(1, action.per);
      const damage = per * (source.advancementTokens ?? 0);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (damage > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${damage} net damage`,
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
                  kind: "net_damage",
                  amount: damage,
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${damage} net damage (${per} per advancement).`,
      );
      return { ok: true };
    }
    case "deal_net_damage_per_power_counter": {
      const n = source.powerCounters ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no power counters for net damage.`);
        return { ok: true };
      }
      return dealStandardDamage(ctx, { kind: "net_damage", amount: n });
    }
    case "meat_damage_per_advancement": {
      const amount = source.advancementTokens ?? 0;
      if (amount <= 0) {
        log(state, `Meat damage per advancement — 0 tokens.`);
        return { ok: true };
      }
      dealDamage(state, "meat", amount, sourceId);
      return { ok: true };
    }
    case "net_damage_per_advancement": {
      const amount = (action.base ?? 0) + (source.advancementTokens ?? 0);
      if (amount <= 0) {
        log(state, `Net damage per advancement — 0.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "net_damage_and_tags_equal_runner_tags": {
      const x = state.runner.tags;
      if (x <= 0) {
        log(state, `Vicsek X — Runner has 0 tags; no net/tags.`);
        return { ok: true };
      }
      dealDamage(state, "net", x, sourceId);
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "give_tags", amount: x },
      });
    }
    case "net_damage_up_to_tags": {
      const n = Math.min(state.runner.tags, action.max);
      if (n <= 0) {
        log(state, `Net damage up to tags — 0 (tags ${state.runner.tags}).`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.netDamage(n));
    }
    case "meat_damage_stolen_last_turn": {
      const n = state.turn.agendaPointsStolenLastTurn;
      if (n <= 0) {
        log(state, `Meat damage from stolen AP last turn — 0.`);
        return { ok: true };
      }
      return dealStandardDamage(ctx, { kind: "meat_damage", amount: n });
    }
    case "prevent_pending_damage": {
      preventPendingDamage(state, action.amount);
      return { ok: true };
    }
    case "may_pay_credits_for_core_damage_per_ice_protecting_this_server": {
      const server = serverHostingCard(state, sourceId);
      const iceCount = server?.ice.length ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (iceCount > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${iceCount} core damage`,
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
                  kind: "core_damage",
                  amount: iceCount,
                  interactive: true,
                  preventByLoseAllClicks: true,
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
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${iceCount} core damage (ice protecting server).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

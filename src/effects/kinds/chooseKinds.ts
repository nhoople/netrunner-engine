/**
 * Primitive kinds whose procedure is choose.
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
  corpInstallCost,
  creditsAvailableForInstall,
} from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { addBreakerStrengthBoostThisTurn } from "../../state/lingeringEffects.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import {
  startExclusiveChoicesExactlyN,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import { breakerStrength } from "../iceStrength.js";

export function applyChooseKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "choose_server_corp_trash_ice_protecting": {
      const servers = (Object.keys(state.servers) as import("../../state/types.js").ServerId[]).filter(
        (sid) => (state.servers[sid]?.ice.length ?? 0) > 0,
      );
      if (servers.length === 0) {
        log(state, `${source.title} — no servers with ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: servers.map((serverId) => ({
          id: `kraken-server:${serverId}`,
          label: `Choose ${serverId}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "corp_trash_ice_protecting_server" as const,
              serverId,
            },
          },
        })),
logLine: `${source.title} — choose a server.`,
});
      return { ok: true };
    }

case "choose_forfeit_runner_scored_agenda": {
      const agendas = state.runner.scoreArea.filter(
        (id) => !state.cards[id]?.cannotForfeit,
      );
      if (agendas.length === 0) {
        return {
          ok: false,
          error: "Must forfeit a scored agenda.",
          cites: [CR.scoringAgenda],
        };
      }
      if (agendas.length === 1) {
        return applyPrimitive(ctx, {
          kind: "forfeit_runner_scored_agenda",
          cardId: agendas[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: agendas.map((agId) => ({
          id: `forfeit:${agId}`,
          label: `Forfeit ${state.cards[agId]!.title}`,
          effect: {
            op: "do",
            action: {
              kind: "forfeit_runner_scored_agenda" as const,
              cardId: agId,
            },
          },
        })),
logLine: `${source.title} — forfeit a scored agenda.`,
});
      return { ok: true };
    }

case "choose_type_reveal_gain_etr_unless_tag_for_run": {
      if (!state.run?.encounter || state.run.encounter.iceId !== sourceId) {
        log(state, `Peeping Tom — no encounter on this ice.`);
        return { ok: true };
      }
      const types: Array<import("../../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `peeping-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "peeping_tom_apply_type" as const,
              cardType: t,
            },
          },
        })),
logLine: `${source.title} — choose a card type, reveal grip, gain ETR-unless-tag subs for the run.`,
});
      return { ok: true };
    }

case "choose_installed_runner_may_access": {
      const installed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          installed.push(id);
        }
      }
      if (installed.length === 0) {
        log(state, `${source.title} — no installed Corp cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `hangeki-pick:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "hangeki_runner_may_access" as const,
              cardId: id,
              onAccess: action.onAccess,
              onDecline: action.onDecline,
            },
          },
        })),
logLine: `${source.title} — choose 1 installed card.`,
});
      return { ok: true };
    }

case "choose_rezzed_bioroid_forbid_runner_break": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes("bioroid")) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Trieste — no rezzed bioroid ice to choose.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.cards[id].cannotBreakWithRunnerCardAbilities = true;
        log(
          state,
          `${source.title} — choose ${state.cards[id].title}; Runner card abilities cannot break its subs.`,
        );
        return { ok: true };
      }
      
      // Use a dedicated leaf via encoding in option effect as gain 0 then set flag in chooseOption — simpler: use custom option ids handled in chooseOption OR set via a new primitive set_flag.
      // Rebuild options with a seq that uses a new micro-primitive: encode as choose that evaluates a do with kind we handle specially.
      // Simpler approach: set flag synchronously on choose via option id prefix in chooseOption.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((id) => ({
            id: `forbid-runner-break:${id}`,
            label: `Choose ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          })),
        ],
logLine: `${source.title} — choose a rezzed bioroid ice (CR ${CR.paidAbility.number}).`,
});
      return { ok: true };
    }

case "may_corp_choose_climactic_server_trash_ice_else_bonus_access": {
      const iced: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.length > 0) iced.push(sid);
      }
      if (iced.length === 0) {
        return applyPrimitive(ctx, {
          kind: "climactic_register_bonus_access",
          amount: 2,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: iced.map((sid) => ({
          id: `climactic-server:${sid}`,
          label: `Choose ${sid}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "may_corp_trash_climactic_ice" as const,
              serverId: sid,
            },
          },
        })),
logLine: `${source.title} — choose a server protected by ice.`,
});
      return { ok: true };
    }

case "choose_install_cost_set_aside_access_shuffle": {
      const costs = new Set<number>();
      for (const id of state.runner.installed) {
        const c = state.cards[id];
        const cost = c?.installCost ?? 0;
        if (cost > 0) costs.add(cost);
      }
      const costList = [...costs].sort((a, b) => a - b);
      if (costList.length === 0) {
        log(
          state,
          `${source.title} — no installed cards with install cost >0; X=0.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: costList.map((cost) => ({
          id: `khusyuk-cost:${cost}`,
          label: `Choose install cost ${cost}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "set_aside_access_shuffle" as const,
              installCost: cost,
            },
          },
        })),
logLine: `${source.title} — choose a printed install cost.`,
});
      return { ok: true };
    }

case "choose_exploratory_romp_card": {
      if (state.run) state.run.skipBreach = true;
      const server = state.run?.attackedServerId
        ? state.servers[state.run.attackedServerId]
        : undefined;
      if (!server) return { ok: true };
      const candidates = [...server.ice, ...(server.root ?? [])].filter(
        (id) => (state.cards[id]?.advancementCounters ?? 0) > 0,
      );
      if (candidates.length === 0) return { ok: true };
      const amount = action.amount;
      if (candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "remove_up_to",
          cardId: candidates[0]!,
          amount,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `romp-card:${id}`,
          label: `Remove advancements from ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "remove_up_to" as const,
              cardId: id,
              amount,
            },
          },
        })),
logLine: `Exploratory Romp — choose a card to remove advancements from.`,
});
      return { ok: true };
    }

case "choose_type_shuffle_grip": {
      const types = ["program", "hardware", "resource", "event"] as const;
      const options: import("../ir.js").ChoiceOption[] = types.map((t) => ({
        id: `type:${t}`,
        label: `Choose ${t}`,
        effect: {
          op: "do" as const,
          action: {
            kind: "shuffle_grip_of_type" as const,
            cardType: t,
            maxCards: action.maxCards,
          },
        },
      }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — choose a card type to shuffle from grip.`,
});
      return { ok: true };
    }

case "may_choose_server": {
      const servers = Object.keys(state.servers);
      if (servers.length === 0) {
        log(state, `${source.title} — no servers to name.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((serverId) => ({
            id: `server:${serverId}`,
            label: `Name ${serverId}`,
            effect: {
              op: "do" as const,
              action: { kind: "set_named_server" as const, serverId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may choose a server.`,
});
      return { ok: true };
    }

case "choose_server": {
      const servers = Object.keys(state.servers);
      if (servers.length === 0) {
        log(state, `${source.title} — no servers to choose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((serverId) => ({
          id: `server:${serverId}`,
          label: `Choose ${serverId}`,
          effect: {
            op: "do" as const,
            action: { kind: "set_chosen_server" as const, serverId },
          },
        })),
logLine: `${source.title} — choose a server.`,
});
      return { ok: true };
    }

case "choose_server_runner": {
      const servers = Object.keys(state.servers);
      if (servers.length === 0) {
        log(state, `${source.title} — no servers to choose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: servers.map((serverId) => ({
          id: `server:${serverId}`,
          label: `Choose ${serverId}`,
          effect: {
            op: "do" as const,
            action: { kind: "set_chosen_server" as const, serverId },
          },
        })),
logLine: `${source.title} — choose a server.`,
});
      return { ok: true };
    }

case "choose_next_design_server": {
      const remaining = Math.max(0, action.remaining);
      const usedServerIds = action.usedServerIds ?? [];
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "may_install_next_design_ice",
            remaining,
            usedServerIds,
            thenDrawToHq: action.thenDrawToHq,
          },
        });
      }
      const availableServerIds = Object.keys(state.servers).filter(
        (sid) => !usedServerIds.includes(sid),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        ...availableServerIds.map((sid) => ({
          id: `next-design-server:${sid}`,
          label: `Protect ${sid}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_next_design_on_server" as const,
              cardId,
              serverId: sid,
              remaining,
              usedServerIds,
              thenDrawToHq: action.thenDrawToHq,
            },
          },
        })),
        {
          id: "next-design-server:new",
          label: "Protect a new remote",
          effect: {
            op: "do" as const,
            action: {
              kind: "install_next_design_on_server" as const,
              cardId,
              serverId: "__new_remote__",
              remaining,
              usedServerIds,
              thenDrawToHq: action.thenDrawToHq,
            },
          },
        },
      ];
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — choose a server to protect with ${card.title}.`,
});
      return { ok: true };
    }

case "choose_grant_encounter_ice_subtype": {
      if (!state.run?.encounter) {
        log(state, `${source.title} — grant subtype: no encounter.`);
        return { ok: true };
      }
      const options = ["barrier", "code gate", "sentry"];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: options.map((subtype) => ({
          id: `pelangi:${subtype}`,
          label: `Encountered ice gains ${subtype}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "grant_encounter_ice_subtype" as const,
              subtype,
            },
          },
        })),
logLine: `${source.title} — choose an ice subtype for the encounter.`,
});
      return { ok: true };
    }

case "choose_exactly_n": {
      return startExclusiveChoicesExactlyN(
        state,
        sourceId,
        action.n,
        action.options,
        source.side === "corp" ? "corp" : "runner",
      );
    }

case "choose_icebreaker_gain_strength_this_turn": {
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return (
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker")
        );
      });
      if (targets.length === 0) {
        log(state, `${source.title} — no icebreaker to boost.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        addBreakerStrengthBoostThisTurn(state, {
          createdBy: sourceId,
          breakerId: id,
          amount: action.amount,
        });
        log(
          state,
          `${state.cards[id]!.title} +${action.amount} strength this turn → ${breakerStrength(state, id)}.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `icebreaker-str:${id}`,
          label: `+${action.amount} strength to ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_strength_this_turn" as const,
              amount: action.amount,
              targetCardId: id,
            },
          },
        })),
logLine: `${source.title} — choose an icebreaker for +${action.amount} strength this turn.`,
});
      return { ok: true };
    }

case "choose_ice_additional_rez_cost_this_turn": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no ice to choose.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.turn.iceAdditionalRezCostThisTurn[id] =
          (state.turn.iceAdditionalRezCostThisTurn[id] ?? 0) + action.amount;
        log(
          state,
          `${state.cards[id]!.title} costs +${action.amount}¢ to rez this turn.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `ice-rez-bump:${id}`,
          label: `+${action.amount}¢ rez to ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_ice_additional_rez_cost_this_turn" as const,
              cardId: id,
              amount: action.amount,
            },
          },
        })),
logLine: `${source.title} — choose ice for +${action.amount}¢ rez this turn.`,
});
      return { ok: true };
    }

case "choose_card_type_for_encounter": {
      if (!state.run?.encounter) {
        log(state, `Choose card type — no encounter.`);
        return { ok: true };
      }
      const types: Array<import("../../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `enc-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "set_encounter_chosen_card_type" as const,
              cardType: t,
            },
          },
        })),
logLine: `${source.title} — choose a card type for this encounter.`,
});
      return { ok: true };
    }

case "choose_lycian_subtypes": {
      const options = ["barrier", "code gate", "sentry"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: options.map((subtype) => ({
          id: `lycian:${subtype}`,
          label: `Gain ${subtype}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_lycian_subtype" as const,
              subtype,
              remaining: options.filter((s) => s !== subtype),
            },
          },
        })),
logLine: `${source.title} — choose 1 or more subtypes (barrier / code gate / sentry).`,
});
      return { ok: true };
    }

case "choose_server_rearrange_ice": {
      const servers = Object.values(state.servers).filter(
        (s) => s.ice.length >= 2,
      );
      if (servers.length === 0) {
        log(state, `${source.title} — no server with 2+ ice to rearrange.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((s) => ({
          id: `sunset:${s.id}`,
          label: `Rearrange ice protecting ${s.id}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rearrange_server_ice" as const,
              serverId: s.id,
              order: [],
            },
          },
        })),
logLine: `${source.title} — choose a server to rearrange ice.`,
});
      return { ok: true };
    }

case "choose_ice_gain_credits_per_advancement": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) iceIds.push(id);
      }
      if (iceIds.length === 0) {
        log(state, `${source.title} — no installed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: iceIds.map((iceId) => {
          const ice = state.cards[iceId]!;
          const n = ice.advancementCounters ?? 0;
          return {
            id: `comm:${iceId}`,
            label: `Gain ${n}¢ from ${ice.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits_from_ice_advancements" as const,
                iceId,
              },
            },
          };
        }),
logLine: `${source.title} — choose ice; gain ¢ equal to advancements.`,
});
      return { ok: true };
    }

case "choose_one_subtype_until_derez": {
      const options = ["barrier", "code gate", "sentry"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: options.map((subtype) => ({
          id: `chimera:${subtype}`,
          label: `Gain ${subtype}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_one_subtype_until_derez" as const,
              subtype,
            },
          },
        })),
logLine: `${source.title} — choose sentry, code gate, or barrier until derezzed.`,
});
      return { ok: true };
    }

case "choose_remote": {
      const remaining = Math.max(0, action.remaining);
      if (remaining <= 0) return { ok: true };
      const installable = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade" && t !== "ice") {
          return false;
        }
        return (
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0)
        );
      });
      if (installable.length === 0) {
        log(state, `${source.title} — no affordable HQ cards to install.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-fast-break",
          label: "Done (no installs)",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        options.push({
          id: `fb-remote:${server.id}`,
          label: `Install into/protecting ${server.id}`,
          effect: {
            op: "do",
            action: {
              kind: "install_continue",
              remaining,
              serverId: server.id,
            },
          },
        });
      }
      options.push({
        id: "fb-remote:new",
        label: "Install into/protecting a new remote",
        effect: {
          op: "do",
          action: {
            kind: "install_continue",
            remaining,
            serverId: "__new_remote__",
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — choose a single remote for up to ${remaining} install(s).`,
});
      return { ok: true };
    }

case "may_choose_other_rezzed_ice_encounter_then_resume_source": {
      if (!state.run) {
        log(state, `${source.title} — no run for nested encounter.`);
        return { ok: true };
      }
      const iceIds = Object.values(state.servers).flatMap((s) =>
        s.ice.filter((id) => {
          if (id === sourceId) return false;
          const ice = state.cards[id];
          return ice?.type === "ice" && ice.rezzed;
        }),
      );
      if (iceIds.length === 0) {
        log(state, `${source.title} — no other rezzed ice to encounter.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...iceIds.map((id) => ({
            id: `konjin-encounter:${id}`,
            label: `Runner encounters ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "set_nested_encounter_then_resume_source" as const,
                iceId: id,
              },
            },
          })),
        ],
logLine: `${source.title} — may choose another rezzed ice to force encounter.`,
});
      return { ok: true };
    }
    default:
      return null;
  }
}

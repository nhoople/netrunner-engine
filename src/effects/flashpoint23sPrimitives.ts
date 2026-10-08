/** 23 Seconds (23s) Flashpoint pack primitives — v1.122.0. */
import { log } from "../state/createGame.js";
import { startTrace } from "../state/trace.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect, grantAbilityCredits } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpoint23sPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "null_trash_grip_lower_encountered_ice_strength": {
      const amount = action.amount ?? 2;
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `Null — no cards in grip to trash.`);
        return { ok: true };
      }
      const apply = (cardId: string): PrimResult => {
        moveRunnerCardToHeap(state, cardId);
        const iceId = state.run?.encounter?.iceId;
        if (iceId && state.run) {
          state.run.iceStrengthBoosts[iceId] =
            (state.run.iceStrengthBoosts[iceId] ?? 0) - amount;
          log(
            state,
            `Null — trash ${state.cards[cardId]?.title}; ice gets −${amount} strength this run.`,
          );
        } else {
          log(state, `Null — trash ${state.cards[cardId]?.title}.`);
        }
        return { ok: true };
      };
      if (grip.length === 1) return apply(grip[0]!);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `null-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "null_trash_grip_card_resolve",
            cardId: id,
            amount,
          }),
        })),
      };
      return { ok: true };
    }

    case "null_trash_grip_card_resolve": {
      const cardId = action.cardId;
      const amount = action.amount ?? 2;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      moveRunnerCardToHeap(state, cardId);
      const iceId = state.run?.encounter?.iceId;
      if (iceId && state.run) {
        state.run.iceStrengthBoosts[iceId] =
          (state.run.iceStrengthBoosts[iceId] ?? 0) - amount;
      }
      log(state, `Null — trash ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }

    case "another_day_force_corp_trace0_gain_ap_credits": {
      startTrace(
        state,
        sourceId,
        0,
        fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        fx.do({
          kind: "gain_credits_equal_to_agenda_points_both_score_areas",
          side: "runner",
        }),
      );
      log(state, `Another Day, Another Paycheck — force Corp Trace[0].`);
      return { ok: true };
    }

    case "gain_credits_equal_to_agenda_points_both_score_areas": {
      let ap = 0;
      for (const id of [...state.runner.score, ...state.corp.score]) {
        ap += state.cards[id]?.agendaPoints ?? 0;
      }
      const side = action.side ?? "runner";
      return grantAbilityCredits(ctx, side, ap);
    }

    case "deuces_wild_resolve_two": {
      const effects: { id: string; label: string; effect: Effect }[] = [
        {
          id: "gain3",
          label: "Gain 3¢",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 3 }),
        },
        {
          id: "draw2",
          label: "Draw 2 cards",
          effect: fx.do({ kind: "draw", side: "runner", amount: 2 }),
        },
        {
          id: "untag",
          label: "Remove 1 tag",
          effect: fx.do({ kind: "remove_tags", amount: 1 }),
        },
        {
          id: "expose-run",
          label: "Expose 1 ice, then make a run",
          effect: fx.do({ kind: "deuces_wild_expose_then_run" }),
        },
      ];
      const pairs: { id: string; label: string; effect: Effect }[] = [];
      for (let i = 0; i < effects.length; i++) {
        for (let j = 0; j < effects.length; j++) {
          if (i === j) continue;
          const a = effects[i]!;
          const b = effects[j]!;
          pairs.push({
            id: `deuces:${a.id}+${b.id}`,
            label: `${a.label}; then ${b.label}`,
            effect: { op: "seq", effects: [a.effect, b.effect] },
          });
        }
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: pairs,
      };
      return { ok: true };
    }

    case "deuces_wild_expose_then_run": {
      return evalEffect(ctx, {
        op: "seq",
        effects: [
          fx.do({ kind: "expose", pick: "choose" }),
          fx.do({ kind: "may_start_run", servers: "any" }),
        ],
      });
    }

    case "injection_attack_choose_breaker_run": {
      const bonus = action.strengthBonus ?? 2;
      const breakers = state.runner.rig.filter((id) => {
        const card = state.cards[id];
        return (
          card?.type === "program" &&
          ((card.subtypes ?? []).includes("icebreaker") || Boolean(card.breaker))
        );
      });
      if (breakers.length === 0) {
        log(state, `Injection Attack — no installed icebreaker.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `inj:${id}`,
          label: `Choose ${state.cards[id]!.title} (+${bonus} strength)`,
          effect: fx.do({
            kind: "injection_attack_run_with_breaker",
            breakerId: id,
            strengthBonus: bonus,
          }),
        })),
      };
      return { ok: true };
    }

    case "injection_attack_run_with_breaker": {
      const breakerId = action.breakerId;
      const bonus = action.strengthBonus ?? 2;
      // Stash for the ensuing run; applied when strengthBoosts exists.
      state.turn.injectionAttackBreakerBonus = {
        breakerId,
        amount: bonus,
      };
      log(
        state,
        `Injection Attack — ${state.cards[breakerId]?.title ?? breakerId} will get +${bonus} strength this run.`,
      );
      return evalEffect(
        ctx,
        fx.do({ kind: "may_start_run", servers: "any" }),
      );
    }

    case "pay_credits_or_trash_installed": {
      const amount = action.amount ?? 1;
      const side = action.side ?? "runner";
      const credits =
        side === "runner" ? state.runner.credits : state.corp.credits;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (credits >= amount) {
        options.push({
          id: "pay",
          label: `Pay ${amount}¢`,
          effect: fx.do({ kind: "lose_credits", side, amount }),
        });
      }
      options.push({
        id: "trash",
        label: "Trash 1 installed card",
        effect: fx.do({ kind: "runner_trashes_one_installed" }),
      });
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      return { ok: true };
    }

    case "add_installed_program_to_stack_bottom": {
      const programs = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Add program to stack bottom — none installed.`);
        return { ok: true };
      }
      if (programs.length === 1) {
        return evalEffect(
          ctx,
          fx.do({
            kind: "add_installed_program_to_stack_bottom_resolve",
            cardId: programs[0]!,
          }),
        );
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: programs.map((id) => ({
          id: `stack-bottom:${id}`,
          label: `Add ${state.cards[id]!.title} to bottom of stack`,
          effect: fx.do({
            kind: "add_installed_program_to_stack_bottom_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "add_installed_program_to_stack_bottom_resolve": {
      const cardId = action.cardId;
      if (!state.runner.rig.includes(cardId)) return { ok: true };
      state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
      state.runner.deck.push(cardId);
      const card = state.cards[cardId];
      if (card) {
        card.zone = "runner:stack";
        card.faceup = false;
      }
      log(
        state,
        `Add ${card?.title ?? cardId} to bottom of the Runner's stack.`,
      );
      return { ok: true };
    }

    case "move_source_upgrade_to_another_server_root": {
      if (source?.type !== "upgrade") {
        log(state, `Move upgrade — source is not an upgrade.`);
        return { ok: true };
      }
      const zone = source.zone ?? "";
      if (!zone.endsWith(":root")) {
        log(state, `Move upgrade — source not in a server root.`);
        return { ok: true };
      }
      const currentSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as ServerId;
      const targets = (Object.keys(state.servers) as ServerId[]).filter(
        (sid) => sid !== currentSid,
      );
      if (targets.length === 0) {
        log(state, `Move upgrade — no other servers.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((sid) => ({
          id: `move-root:${sid}`,
          label: `Move to ${sid} root`,
          effect: fx.do({ kind: "move_upgrade_to_server_root", serverId: sid }),
        })),
      };
      return { ok: true };
    }

    default:
      return null;
  }
}

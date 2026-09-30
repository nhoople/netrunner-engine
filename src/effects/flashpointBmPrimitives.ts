/** Blood Money (bm) Flashpoint pack primitives — v1.123.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashCorpInstalled(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
}

/** Ephemeral counters on source for multi-step BM paid choices. */
function bmCounter(
  source: EffectCtx["state"]["cards"][string],
  key: "bmShuffled" | "bmLiquidated",
): number {
  const bag = (source as { bmCounters?: Record<string, number> }).bmCounters;
  return bag?.[key] ?? 0;
}

function setBmCounter(
  source: EffectCtx["state"]["cards"][string],
  key: "bmShuffled" | "bmLiquidated",
  n: number,
): void {
  const card = source as { bmCounters?: Record<string, number> };
  card.bmCounters = card.bmCounters ?? {};
  card.bmCounters[key] = n;
}

export function applyFlashpointBmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "paperclip_spend_x_pump_and_break": {
      const credits = state.runner.credits;
      if (credits <= 0) {
        log(state, `Paperclip — no credits to spend.`);
        return { ok: true };
      }
      const maxX = Math.min(credits, 20);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `paperclip-x:${x}`,
          label: `Spend ${x}¢: +${x} strength, break up to ${x}`,
          effect: fx.do({
            kind: "paperclip_spend_x_pump_and_break_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "paperclip_spend_x_pump_and_break_resolve": {
      const x = action.amount ?? 1;
      if (state.runner.credits < x) {
        log(state, `Paperclip — cannot afford ${x}¢.`);
        return { ok: true };
      }
      state.runner.credits -= x;
      if (!state.run) return { ok: true };
      state.run.encounterStrengthBoosts[sourceId] =
        (state.run.encounterStrengthBoosts[sourceId] ?? 0) + x;
      log(state, `Paperclip — spend ${x}¢ → +${x} strength this encounter.`);
      const enc = state.run.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("barrier")) return { ok: true };
      const unbroken = enc.broken
        .map((b, i) => (!b ? i : -1))
        .filter((i) => i >= 0);
      const toBreak = unbroken.slice(0, x);
      for (const i of toBreak) {
        enc.broken[i] = true;
      }
      if (toBreak.length > 0) {
        log(
          state,
          `Paperclip — break ${toBreak.length} barrier subroutine(s).`,
        );
      }
      return { ok: true };
    }

    case "may_move_up_to_credits_from_pool_to_self": {
      const max = action.amount ?? 3;
      const side = source.side;
      const pool = side === "corp" ? state.corp : state.runner;
      const available = Math.min(max, pool.credits);
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side, amount: 0 }),
        },
      ];
      for (let n = 1; n <= available; n++) {
        options.push({
          id: `move:${n}`,
          label: `Move ${n}¢ onto ${source.title}`,
          effect: fx.do({
            kind: "move_credits_from_pool_to_self_resolve",
            amount: n,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: side, options };
      return { ok: true };
    }

    case "move_credits_from_pool_to_self_resolve": {
      const n = action.amount ?? 0;
      const side = source.side;
      const pool = side === "corp" ? state.corp : state.runner;
      const taken = Math.min(n, pool.credits);
      pool.credits -= taken;
      source.hostedCredits = (source.hostedCredits ?? 0) + taken;
      log(
        state,
        `Move ${taken}¢ from ${side} pool onto ${source.title} → ${source.hostedCredits}.`,
      );
      return { ok: true };
    }

    case "beth_kilrain_corp_credit_tiers": {
      const c = state.corp.credits;
      if (c >= 5 && c <= 9) {
        return evalEffect(
          ctx,
          fx.do({ kind: "gain_credits", side: "runner", amount: 1 }),
        );
      }
      if (c >= 10 && c <= 14) {
        return evalEffect(
          ctx,
          fx.do({ kind: "draw", side: "runner", amount: 1 }),
        );
      }
      if (c >= 15) {
        state.runner.clicks += 1;
        log(state, `Beth Kilrain-Chang — Corp ≥15¢: gain [click].`);
        return { ok: true };
      }
      log(state, `Beth Kilrain-Chang — Corp ${c}¢: no effect.`);
      return { ok: true };
    }

    case "trash_installed_not_matching_runner_identity_faction": {
      const idFaction = state.cards[state.runner.identityId]?.faction;
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c && c.faction && c.faction !== idFaction;
      });
      if (targets.length === 0) {
        log(
          state,
          `Enforcing Loyalty — no installed card not matching Runner ID faction.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "add_installed_non_virtual_runner_to_grip": {
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c && !(c.subtypes ?? []).includes("virtual");
      });
      if (targets.length === 0) {
        log(state, `Hatchet Job — no installed non-virtual Runner card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `grip:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_installed_runner_card_to_grip",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "special_report_shuffle_any_hq_draw": {
      const hand = [...state.corp.hand];
      const shuffled = bmCounter(source, "bmShuffled");
      if (hand.length === 0) {
        return evalEffect(ctx, fx.do({ kind: "special_report_draw_shuffled" }));
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...hand.map((id) => ({
            id: `shuffle:${id}`,
            label: `Shuffle ${state.cards[id]!.title} into R&D`,
            effect: fx.do({
              kind: "special_report_shuffle_hq_card",
              cardId: id,
            }),
          })),
          {
            id: "done",
            label: `Done (draw ${shuffled})`,
            effect: fx.do({ kind: "special_report_draw_shuffled" }),
          },
        ],
      };
      return { ok: true };
    }

    case "special_report_shuffle_hq_card": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      state.corp.deck.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "corp:rd";
      card.faceup = false;
      state.corp.deck.reverse();
      setBmCounter(source, "bmShuffled", bmCounter(source, "bmShuffled") + 1);
      log(state, `Special Report — shuffle ${card.title} into R&D.`);
      return evalEffect(
        ctx,
        fx.do({ kind: "special_report_shuffle_any_hq_draw" }),
      );
    }

    case "special_report_draw_shuffled": {
      const n = bmCounter(source, "bmShuffled");
      setBmCounter(source, "bmShuffled", 0);
      if (n > 0) {
        return evalEffect(
          ctx,
          fx.do({ kind: "draw", side: "corp", amount: n }),
        );
      }
      return { ok: true };
    }

    case "liquidation_trash_any_rezzed_gain_3_each": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed) targets.push(id);
        }
      }
      const trashed = bmCounter(source, "bmLiquidated");
      if (targets.length === 0) {
        log(state, `Liquidation — no rezzed cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((id) => ({
            id: `liq:${id}`,
            label: `Trash ${state.cards[id]!.title} (+3¢)`,
            effect: fx.do({
              kind: "liquidation_trash_rezzed_card",
              cardId: id,
            }),
          })),
          {
            id: "done",
            label: `Done (gained ${trashed * 3}¢)`,
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "liquidation_trash_rezzed_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card?.rezzed) return { ok: true };
      trashCorpInstalled(state, cardId);
      state.corp.credits += 3;
      setBmCounter(source, "bmLiquidated", bmCounter(source, "bmLiquidated") + 1);
      log(state, `Liquidation — trash ${card.title}; gain 3¢.`);
      return evalEffect(
        ctx,
        fx.do({ kind: "liquidation_trash_any_rezzed_gain_3_each" }),
      );
    }

    case "financial_collapse_lose_2_per_resource_or_trash": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      const lose = resources.length * 2;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "lose",
          label: `Lose ${lose}¢ (${resources.length} resources × 2)`,
          effect: fx.do({
            kind: "lose_credits",
            side: "runner",
            amount: lose,
          }),
        },
      ];
      for (const id of resources) {
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title} to prevent`,
          effect: fx.do({
            kind: "trash_installed_runner_card",
            cardId: id,
          }),
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `Financial Collapse — Runner loses ${lose}¢ or trashes a resource to prevent.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

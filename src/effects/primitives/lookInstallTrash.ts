import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import type { RuleCite } from "../../state/types.js";
import { grantAbilityCredits, type EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointInPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "trash_frantic_coding_looked": {
      const lookedIds = action.lookedIds ?? [];
      for (const id of lookedIds) {
        if (!state.runner.deck.includes(id)) continue;
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        trashCard(state, id, { by: controllerOf(state, sourceId) });
      }
      log(state, `Frantic Coding — trash ${lookedIds.length} looked card(s).`);
      return { ok: true };
    }

    case "shuffle_one_grip_into_stack": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `Blockade Runner — grip empty; nothing to shuffle.`);
        return { ok: true };
      }
      if (grip.length === 1) {
        const cardId = grip[0]!;
        state.runner.hand = [];
        const insertAt = Math.floor(
          random(state) * (state.runner.deck.length + 1),
        );
        state.runner.deck.splice(insertAt, 0, cardId);
        state.cards[cardId]!.zone = "runner:stack";
        log(state, `Shuffle ${state.cards[cardId]!.title} into stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `shuffle-grip:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack`,
          effect: fx.do({
            kind: "shuffle_grip_card_into_stack",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "host_on_rezzed_bioroid_ice_as_condition": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (
            ice?.type === "ice" &&
            ice.rezzed &&
            (ice.subtypes ?? []).includes("bioroid")
          ) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `${source?.title ?? "Wetwork"} — no rezzed bioroid ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `wetwork-host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_self_as_condition",
            hostId: id,
          }),
        })),
        logLine: `${source?.title ?? "Wetwork"} — choose rezzed bioroid ice to host on.`,
      });
      return { ok: true };
    }

    case "add_n_hq_to_top_rd": {
      const amount = Math.max(0, action.amount ?? 3);
      const remaining = Math.min(amount, state.corp.hand.length);
      if (remaining <= 0) {
        log(state, `Hasty Relocation — HQ empty; nothing to add.`);
        return { ok: true };
      }
      return applyFlashpointInPrimitive(ctx, {
        kind: "add_n_hq_to_top_rd_continue",
        remaining,
      });
    }

    case "add_n_hq_to_top_rd_continue": {
      const remaining = action.remaining ?? 0;
      if (remaining <= 0 || state.corp.hand.length === 0) {
        return { ok: true };
      }
      // Only one card left in HQ: nothing to choose. Otherwise the Corp
      // picks each card, the last one included (CR 1.15.2).
      if (state.corp.hand.length === 1) {
        const id = state.corp.hand[0]!;
        removeCardFromCurrentZone(state, id);
        state.corp.deck.unshift(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
        log(state, `${state.cards[id]!.title} moved from HQ to top of R&D.`);
        if (remaining > 1) {
          return applyFlashpointInPrimitive(ctx, {
            kind: "add_n_hq_to_top_rd_continue",
            remaining: remaining - 1,
          });
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `hq-top:${id}`,
          label: `Top R&D: ${state.cards[id]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              fx.do({ kind: "hq_card_to_top_rd", cardId: id }),
              fx.do({
                kind: "add_n_hq_to_top_rd_continue",
                remaining: remaining - 1,
              }),
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "trash_installed_with_install_cost_lte_tags": {
      const tags = state.runner.tags;
      const targets = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        const cost = c.installCost ?? 0;
        return cost <= tags;
      });
      if (targets.length === 0) {
        log(
          state,
          `Best Defense — no installed card with install cost ≤ ${tags} tag(s).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `best-defense:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "gain_credits_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 2;
      const side = action.side ?? "corp";
      const has = state.runner.installed.some((id) =>
        (state.cards[id]?.subtypes ?? [])
          .map((s) => s.toLowerCase())
          .includes(subtype),
      );
      if (!has) {
        log(
          state,
          `${source?.title ?? "Bulwark"} — no installed ${subtype} program.`,
        );
        return { ok: true };
      }
      return grantAbilityCredits(ctx, side, amount);
    }

    default:
      return null;
  }
}

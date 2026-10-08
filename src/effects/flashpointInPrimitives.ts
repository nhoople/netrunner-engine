/** Intervention (in) Flashpoint pack primitives — v1.125.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite } from "../state/types.js";
import { grantAbilityCredits, type EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashRunnerCardToHeap(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
}

function trashCorpTopRd(state: EffectCtx["state"]): string | null {
  if (state.corp.deck.length === 0) return null;
  const id = state.corp.deck.pop()!;
  state.corp.discard.push(id);
  const card = state.cards[id]!;
  card.zone = "corp:archives";
  card.faceup = true;
  return id;
}

export function applyFlashpointInPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "look_top_install": {
      const n = Math.max(0, action.n ?? 10);
      const discount = Math.max(0, action.discount ?? 5);
      const looked = state.runner.deck.slice(0, n);
      if (looked.length === 0) {
        log(state, `Frantic Coding — stack empty.`);
        return { ok: true };
      }
      const programs = looked.filter(
        (id) => state.cards[id]?.type === "program",
      );
      const options: { id: string; label: string; effect: Effect }[] = programs.map(
        (id) => ({
          id: `frantic-install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "install_resolve",
            cardId: id,
            lookedIds: looked,
            discount,
          }),
        }),
      );
      options.push({
        id: "frantic-decline",
        label: "Decline install (trash looked cards)",
        effect: fx.do({
          kind: "frantic_coding_trash_looked",
          lookedIds: looked,
        }),
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `Frantic Coding — look at top ${looked.length}; ${programs.length} program(s).`,
      );
      return { ok: true };
    }

    case "install_resolve": {
      const cardId = action.cardId;
      const lookedIds = action.lookedIds ?? [];
      const discount = action.discount ?? 5;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        log(state, `Frantic Coding — program not in looked cards.`);
        return applyFlashpointInPrimitive(ctx, {
          kind: "frantic_coding_trash_looked",
          lookedIds,
        });
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        log(state, `Frantic Coding — cannot afford ${card.title}.`);
        return applyFlashpointInPrimitive(ctx, {
          kind: "frantic_coding_trash_looked",
          lookedIds,
        });
      }
      state.runner.credits -= cost;
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      log(state, `Frantic Coding — install ${card.title} for ${cost}¢.`);
      const rest = lookedIds.filter((id) => id !== cardId);
      for (const id of rest) {
        if (!state.runner.deck.includes(id)) continue;
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        trashRunnerCardToHeap(state, id);
      }
      if (rest.length > 0) {
        log(state, `Frantic Coding — trash ${rest.length} other looked card(s).`);
      }
      return { ok: true };
    }

    case "frantic_coding_trash_looked": {
      const lookedIds = action.lookedIds ?? [];
      for (const id of lookedIds) {
        if (!state.runner.deck.includes(id)) continue;
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        trashRunnerCardToHeap(state, id);
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
          Math.random() * (state.runner.deck.length + 1),
        );
        state.runner.deck.splice(insertAt, 0, cardId);
        state.cards[cardId]!.zone = "runner:stack";
        log(
          state,
          `Shuffle ${state.cards[cardId]!.title} into stack.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
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
      };
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `wetwork-host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_on_ice_as_condition_on",
            iceId: id,
          }),
        })),
      };
      log(
        state,
        `${source?.title ?? "Wetwork"} — choose rezzed bioroid ice to host on.`,
      );
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
      if (state.corp.hand.length === 1 || remaining === 1) {
        const id = state.corp.hand[0]!;
        removeCardFromCurrentZone(state, id);
        state.corp.deck.push(id);
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
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "trash_installed_with_install_cost_lte_tags": {
      const tags = state.runner.tags;
      const targets = state.runner.rig.filter((id) => {
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `best-defense:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "gain_credits_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 2;
      const side = action.side ?? "corp";
      const has = state.runner.rig.some((id) =>
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

    case "top_hat_may_instead_of_breach": {
      const n = Math.max(1, action.n ?? 5);
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Top Hat — no successful R&D run.`);
        return { ok: true };
      }
      const ordered = state.corp.deck.slice(0, n);
      if (ordered.length === 0) {
        log(state, `Top Hat — R&D empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...ordered.map((id, i) => ({
            id: `top-hat-access:${id}`,
            label: `Access ${state.cards[id]!.title} (top ${i + 1})`,
            effect: fx.do({
              kind: "top_hat_access_instead_of_breach",
              cardId: id,
            }),
          })),
          {
            id: "top-hat-decline",
            label: "Breach R&D normally",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      log(
        state,
        `Top Hat — may access 1 of top ${ordered.length} instead of breach.`,
      );
      return { ok: true };
    }

    case "top_hat_access_instead_of_breach": {
      const cardId = action.cardId;
      if (!state.run || !cardId || !state.corp.deck.includes(cardId)) {
        log(state, `Top Hat — chosen card not on R&D.`);
        return { ok: true };
      }
      state.run.skipBreach = true;
      state.pendingStandaloneCardAccess = {
        sourceId,
        cardId,
        serverId: "rd",
      };
      log(
        state,
        `Top Hat — access ${state.cards[cardId]!.title} instead of breaching R&D.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

// Re-export helper used only for typing silence when trash_top is already known.
void trashCorpTopRd;

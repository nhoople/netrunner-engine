/**
 * Primitive kinds for drawing, arranging, and putting cards on top of or under
 * a deck. The kind registry (`applyCoreKinds`) dispatches here.
 */
import {
  applyPrimitive,
  evalEffect,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { offerRdArrangeChoice, offerBurnerMoves } from "./searchAndArrange.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { drawCards } from "./draw.js";
import { shuffleRunnerStack } from "../install/runnerInstall.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { CR } from "../../timing/labels.js";
import { type Effect } from "../ir/effect.js";
import { fx } from "../ir/fx.js";
import { type Primitive } from "../ir/primitive.js";
import { runnerWinsOnEmptyRnd } from "../../state/setupAndEnd/emptyRnd.js";
import { random } from "../../state/rng.js";
import {
  trashCard,
  controllerOf,
  discardCard,
} from "../../state/hostingAndTrash/trash.js";
import {
  effectiveCorpMaxHandSize,
  recomputeRunnerMaxHandSize,
} from "../../state/continuous/handSize.js";
import { countRezzedNextIce } from "./archivesAndHeapRetrievalKinds.js";
import { lookAtCards } from "../../state/visibility/reveal.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import { offerCbiRaidHqToRd } from "../access/accessKinds.js";
import type { RuleCite } from "../../state/types/restrictions.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function offerSiStackTrashOrArrange(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.siStackLookedCards ?? [];
  if (looked.length === 0) {
    return offerSiStackArrangeChoice(ctx);
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: [
      ...looked.map((cardId) => ({
        id: `si-trash:${cardId}`,
        label: `Trash ${state.cards[cardId]!.title}`,
        effect: fx.do({
          kind: "trash_stack_pick",
          cardId,
        }),
      })),
      {
        id: "si-done-trash",
        label: "Done trashing — arrange remaining",
        effect: fx.do({ kind: "si_stack_done_trashing" }),
      },
    ],
  });
  return { ok: true };
}

export function offerSiStackArrangeChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.siStackLookedCards ?? [];
  if (looked.length === 0) {
    const placed = state.turn.siStackArrangePlaced ?? [];
    for (let i = placed.length - 1; i >= 0; i--) {
      const id = placed[i]!;
      state.cards[id]!.faceup = false;
      state.cards[id]!.zone = "runner:stack";
      state.runner.deck.unshift(id);
    }
    state.turn.siStackLookedCards = undefined;
    state.turn.siStackArrangePlaced = undefined;
    log(state, `Arrange stack — ${placed.length} card(s) replaced.`);
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: looked.map((cardId) => ({
      id: `si-arr:${cardId}`,
      label: `Place ${state.cards[cardId]!.title} (next from top)`,
      effect: fx.do({
        kind: "si_stack_arrange_pick",
        cardId,
      }),
    })),
  });
  return { ok: true };
}

/**
 * Printed: "discards down to their maximum hand size" — the Runner chooses
 * each discard. Offer one discard at a time until the grip is at the limit.
 */
function offerDiscardDownToHandSize(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const max = state.runner.maxHandSize ?? 5;
  if (state.runner.hand.length <= max) return { ok: true };
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: state.runner.hand.map((id) => ({
      id: `harvester-discard:${id}`,
      label: `Discard ${state.cards[id]!.title}`,
      effect: fx.do({
        kind: "draw_then_discard_down_to_hand_size_continue",
        cardId: id,
      }),
    })),
  });
  return { ok: true };
}

export function offerStackArrangeChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.ohStackLookedCards ?? [];
  if (looked.length === 0) {
    // Place arranged cards back on top in reverse pick order (last pick = top).
    const placed = state.turn.ohStackArrangePlaced ?? [];
    for (let i = placed.length - 1; i >= 0; i--) {
      const id = placed[i]!;
      state.cards[id]!.faceup = false;
      state.cards[id]!.zone = "runner:stack";
      state.runner.deck.unshift(id);
    }
    state.turn.ohStackLookedCards = undefined;
    state.turn.ohStackArrangePlaced = undefined;
    log(state, `Arrange stack — ${placed.length} card(s) replaced.`);
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: looked.map((cardId) => ({
      id: `stack-arr:${cardId}`,
      label: `Place ${state.cards[cardId]!.title} (next from top)`,
      effect: {
        op: "do" as const,
        action: {
          kind: "pick_stack_arrange" as const,
          cardId,
        },
      },
    })),
  });
  return { ok: true };
}

/** Ephemeral counters on source for multi-step BM paid choices. */
export function bmCounter(
  source: EffectCtx["state"]["cards"][string],
  key: "bmShuffled" | "bmLiquidated",
): number {
  const bag = (source as { bmCounters?: Record<string, number> }).bmCounters;
  return bag?.[key] ?? 0;
}

export function setBmCounter(
  source: EffectCtx["state"]["cards"][string],
  key: "bmShuffled" | "bmLiquidated",
  n: number,
): void {
  const card = source as { bmCounters?: Record<string, number> };
  card.bmCounters = card.bmCounters ?? {};
  card.bmCounters[key] = n;
}

export function applyDeckOrderKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "draw_n_then_bottom_one_of_drawn": {
      const amount = Math.max(0, action.amount ?? 0);
      const before = [...state.runner.hand];
      const drawR = applyPrimitive(ctx, {
        kind: "draw",
        side: "runner",
        amount,
      });
      if (!drawR.ok) return drawR;
      const drawn = state.runner.hand.filter((id) => !before.includes(id));
      if (drawn.length === 0) {
        log(state, `${source.title} — drew no cards to bottom.`);
        return { ok: true };
      }
      if (drawn.length === 1) {
        return applyPrimitive(ctx, {
          kind: "bottom_drawn_card",
          cardId: drawn[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: drawn.map((id) => ({
          id: `bottom:${id}`,
          label: `Put ${state.cards[id]!.title} on bottom of stack`,
          effect: {
            op: "do" as const,
            action: { kind: "bottom_drawn_card" as const, cardId: id },
          },
        })),
        logLine: `${source.title} — choose 1 of ${drawn.length} drawn cards to bottom.`,
      });
      return { ok: true };
    }

    case "draw_class_act_bottom_one_then": {
      const looked = state.turn.rdLookedCards ?? [];
      const bottomId = action.cardId;
      const keep: string[] = [];
      for (const id of looked) {
        if (id === bottomId) continue;
        keep.push(id);
      }
      for (let i = keep.length - 1; i >= 0; i--) {
        const id = keep[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      if (looked.includes(bottomId)) {
        state.cards[bottomId]!.faceup = false;
        state.runner.deck.push(bottomId);
        log(
          state,
          `Class Act — ${state.cards[bottomId]!.title} to bottom of stack.`,
        );
      }
      state.turn.rdLookedCards = [];
      const amount = state.turn.pendingWouldDrawAmount ?? 0;
      state.turn.pendingWouldDrawAmount = null;
      if (amount > 0) {
        const n = drawCards(state, "runner", amount);
        log(state, `Class Act — draw ${n} (requested ${amount}).`);
      }
      return { ok: true };
    }

    case "draw_until_hq_has": {
      const target = Math.max(0, action.amount);
      const n = Math.max(0, target - state.corp.hand.length);
      const drawn = drawCards(state, "corp", n);
      log(
        state,
        `Corp draws ${drawn} until HQ has ${target} card(s) (HQ now ${state.corp.hand.length}).`,
      );
      return { ok: true };
    }

    case "draw_top_rd_to_hand": {
      if (state.corp.deck.length === 0) return { ok: true };
      const id = state.corp.deck.shift()!;
      state.corp.hand.push(id);
      const card = state.cards[id]!;
      card.zone = "corp:hq";
      card.faceup = false;
      log(state, `Corp draws ${card.title}.`);
      return { ok: true };
    }

    case "bottom_drawn_card": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) {
        log(state, `bottom_drawn_card — card not in grip.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.deck.push(cardId);
      state.cards[cardId]!.zone = "runner:stack";
      state.cards[cardId]!.faceup = false;
      log(
        state,
        `${source.title} — put ${state.cards[cardId]!.title} on bottom of stack.`,
      );
      return { ok: true };
    }

    case "arrange_looked": {
      const order = action.order ?? [];
      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      state.turn.rdLookedCards = [];
      log(state, `Arrange ${order.length} card(s) on top of stack.`);
      return { ok: true };
    }

    case "pick_rd_arrange": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange R&D — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      state.turn.rdArrangePlaced.push(cardId);
      return offerRdArrangeChoice(state, sourceId);
    }

    case "pick_revealed": {
      const pick = action.cardId;
      const revealed = action.revealedIds ?? [];
      if (!revealed.includes(pick)) {
        log(state, `${source.title} — Loot Box pick not in revealed set.`);
        return { ok: true };
      }
      const card = state.cards[pick]!;
      const cost = card.playCost ?? card.installCost ?? 0;
      state.runner.hand.push(pick);
      card.zone = "runner:grip";
      card.faceup = true;
      state.corp.credits += cost;
      log(
        state,
        `Add ${card.title} to grip; Corp gains ${cost}¢ → ${state.corp.credits}.`,
      );
      const rest = revealed.filter((id) => id !== pick);
      for (const id of rest) {
        state.cards[id]!.faceup = false;
        state.runner.deck.push(id);
      }
      // Loot Box: "The Runner shuffles the stack", whatever is left in it.
      shuffleRunnerStack(state);
      log(state, `Shuffle ${rest.length} remaining card(s) into stack.`);
      return { ok: true };
    }

    case "hq_to_top_rd": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `HQ to top of R&D — HQ empty.`);
        return { ok: true };
      }
      if (action.pick === "choose" && hq.length > 1) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: hq.map((id) => ({
            id,
            label: `Top R&D: ${state.cards[id]?.title ?? id}`,
            effect: {
              op: "do",
              action: { kind: "hq_card_to_top_rd", cardId: id },
            },
          })),
          logLine: `HQ to top of R&D — Corp chooses among ${hq.length}.`,
        });
        return { ok: true };
      }
      const id = action.pick === "first" ? hq[0]! : hq[hq.length - 1]!;
      removeCardFromCurrentZone(state, id);
      // Index 0 is the top of R&D.
      state.corp.deck.unshift(id);
      state.cards[id].zone = "corp:rd";
      state.cards[id].faceup = false;
      log(state, `${state.cards[id].title} moved from HQ to top of R&D.`);
      return { ok: true };
    }

    case "hq_card_to_top_rd": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) {
        return {
          ok: false,
          error: "Chosen card is not in HQ.",
          cites: [CR.gainCredits],
        };
      }
      removeCardFromCurrentZone(state, id);
      state.corp.deck.unshift(id);
      state.cards[id].zone = "corp:rd";
      state.cards[id].faceup = false;
      log(state, `${state.cards[id].title} moved from HQ to top of R&D.`);
      return { ok: true };
    }

    case "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd": {
      const withVirus = state.runner.installed.filter(
        (id) => (state.cards[id]?.virusCounters ?? 0) > 0,
      );
      const total = withVirus.reduce(
        (sum, id) => sum + (state.cards[id]?.virusCounters ?? 0),
        0,
      );
      if (total < 2) {
        log(
          state,
          `${source.title} — fewer than 2 virus counters on installed cards; decline.`,
        );
        return { ok: true };
      }
      const removeOptions: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [];
      for (const id of withVirus) {
        const card = state.cards[id]!;
        const have = card.virusCounters ?? 0;
        const maxTake = Math.min(2, have);
        for (let take = 1; take <= maxTake; take++) {
          removeOptions.push({
            id: `nihilist-rm:${id}:${take}`,
            label: `Remove ${take} virus from ${card.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "remove_nihilist_virus_from" as const,
                cardId: id,
                amount: take,
                remaining: 2 - take,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...removeOptions,
        ],
        logLine: `${source.title} — may remove any 2 virus counters from installed cards.`,
      });
      return { ok: true };
    }

    case "nihilist_corp_trash_top_rd_or_runner_draws_2": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "trash-top-rd",
            label: "Trash the top card of R&D",
            effect: {
              op: "do" as const,
              action: { kind: "trash_top_of_rd" as const },
            },
          },
          {
            id: "allow-draw",
            label: "Allow Runner to draw 2",
            effect: {
              op: "do" as const,
              action: {
                kind: "draw" as const,
                side: "runner" as const,
                amount: 2,
              },
            },
          },
        ],
        logLine: `${source.title} — Corp may trash top of R&D or Runner draws 2.`,
      });
      return { ok: true };
    }

    case "rd_top_to_bottom": {
      if (state.corp.deck.length === 0) {
        log(state, `R&D top to bottom — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck.shift()!;
      state.corp.deck.push(topId);
      log(
        state,
        `Add ${state.cards[topId]?.title ?? topId} to the bottom of R&D.`,
      );
      return { ok: true };
    }

    case "burner_place": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) {
        log(state, `Burner place — card not in HQ.`);
        return offerBurnerMoves(
          state,
          sourceId,
          action.revealed,
          action.movesLeft,
        );
      }
      removeCardFromCurrentZone(state, id);
      state.cards[id]!.faceup = false;
      if (action.position === "top") {
        state.corp.deck.unshift(id);
      } else {
        state.corp.deck.push(id);
      }
      state.cards[id]!.zone = "corp:rd";
      log(
        state,
        `${state.cards[id]!.title} moved from HQ to ${action.position} of R&D.`,
      );
      return offerBurnerMoves(
        state,
        sourceId,
        action.revealed,
        action.movesLeft,
      );
    }

    case "reeducation_hq_bottom_rd_draw_runner_grip_to_stack": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Reeducation — HQ empty.`);
        return { ok: true };
      }
      // Corp chooses any number (including 0) from HQ to bottom of R&D.
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "none",
          label: "Add 0 cards",
          effect: fx.do({ kind: "resolve_reeducation", cardIds: [] }),
        },
      ];
      // Offer choosing a subset via sequential picks; start by picking first card or done.
      options.push(
        ...hq.map((id) => ({
          id: `add:${id}`,
          label: `Add ${state.cards[id]!.title} (continue selecting)`,
          effect: fx.do({
            kind: "pick_continue",
            selected: [id],
            remaining: hq.filter((x) => x !== id),
          }),
        })),
      );
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "pick_continue": {
      const selected = (action as { selected: string[] }).selected ?? [];
      const remaining = (action as { remaining: string[] }).remaining ?? [];
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "done",
          label: `Done (${selected.length} card(s))`,
          effect: fx.do({ kind: "resolve_reeducation", cardIds: selected }),
        },
      ];
      for (const id of remaining) {
        options.push({
          id: `add:${id}`,
          label: `Also add ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "pick_continue",
            selected: [...selected, id],
            remaining: remaining.filter((x) => x !== id),
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "resolve_reeducation": {
      const cardIds = (action as { cardIds: string[] }).cardIds ?? [];
      const x = cardIds.length;
      for (const id of cardIds) {
        if (!state.corp.hand.includes(id)) continue;
        state.corp.hand = state.corp.hand.filter((h) => h !== id);
        const c = state.cards[id]!;
        c.zone = "corp:rd";
        state.corp.deck.push(id);
      }
      let drawn = 0;
      for (let i = 0; i < x; i++) {
        if (state.corp.deck.length === 0) break;
        const top = state.corp.deck.shift()!;
        const c = state.cards[top]!;
        c.zone = "corp:hq";
        state.corp.hand.push(top);
        drawn += 1;
      }
      log(state, `Reeducation — Corp adds ${x} to R&D bottom and draws ${x}.`);
      if (drawn < x) runnerWinsOnEmptyRnd(state);
      if (x > 0 && state.runner.hand.length >= x) {
        // Runner adds X random grip to bottom of stack.
        const grip = [...state.runner.hand];
        for (let i = grip.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = grip[i]!;
          grip[i] = grip[j]!;
          grip[j] = tmp;
        }
        const picks = grip.slice(0, x);
        for (const id of picks) {
          state.runner.hand = state.runner.hand.filter((h) => h !== id);
          const c = state.cards[id]!;
          c.zone = "runner:stack";
          state.runner.deck.push(id);
        }
        log(
          state,
          `Reeducation — Runner adds ${x} random grip card(s) to stack bottom.`,
        );
      }
      return { ok: true };
    }

    case "whampoa_archives_to_rd_bottom": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.corp.discardPile.includes(cardId)) return { ok: true };
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      const c = state.cards[cardId]!;
      c.zone = "corp:rd";
      c.faceup = false;
      state.corp.deck.push(cardId);
      log(state, `Whampoa Reclamation — ${c.title} to R&D bottom.`);
      return { ok: true };
    }

    case "draw_per_power_then_trash": {
      const source = state.cards[sourceId];
      if (!source) return { ok: true };
      const n = source.powerCounters ?? 0;
      for (let i = 0; i < n; i++) {
        if (state.runner.deck.length === 0) break;
        const top = state.runner.deck.shift()!;
        const c = state.cards[top]!;
        c.zone = "runner:grip";
        state.runner.hand.push(top);
      }
      log(state, `Bug-Out Bag — draw ${n}, then trash.`);
      if (state.runner.installed.includes(sourceId)) {
        trashCard(state, sourceId, { by: controllerOf(state, sourceId) });
      }
      return { ok: true };
    }
    case "corp_draw_syn_attack_discard_2_or_4": {
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "draw4",
          label: "Draw 4 cards",
          effect: fx.draw("corp", 4),
        },
      ];
      if (state.corp.hand.length >= 2) {
        options.unshift({
          id: "discard2",
          label: "Discard 2 cards",
          effect: fx.do({ kind: "choose_syn_attack_discard", remaining: 2 }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `SYN Attack — Corp must discard 2 or draw 4.`,
      });
      return { ok: true };
    }

    case "levy_take_program_rest_bottom": {
      const takeId = action.cardId;
      const restIds = action.restIds ?? [];
      if (takeId && state.cards[takeId]) {
        state.runner.hand.push(takeId);
        state.cards[takeId]!.zone = "runner:grip";
        log(state, `Levy — add ${state.cards[takeId]!.title} to grip.`);
      }
      for (const id of restIds) {
        if (!state.cards[id]) continue;
        state.runner.deck.push(id);
        state.cards[id]!.zone = "runner:stack";
      }
      return { ok: true };
    }

    case "choose_n_grip_to_stack_top": {
      const n = action.count ?? 2;
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `${source?.title ?? "Data Loop"} — grip empty.`);
        return { ok: true };
      }
      const take = Math.min(n, grip.length);
      // Sequential choose: pick cards one-by-one onto stack top.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `dl:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of stack`,
          effect: fx.do({
            kind: "choose_n_grip_to_stack_top_continue",
            selected: [id],
            remaining: take - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "choose_n_grip_to_stack_top_continue": {
      const selected = action.selected ?? [];
      const remaining = action.remaining ?? 0;
      // Apply already-selected moves lazily at the end.
      if (remaining <= 0 || state.runner.hand.length === 0) {
        for (const id of selected) {
          if (!state.runner.hand.includes(id)) continue;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.deck.unshift(id);
          const c = state.cards[id];
          if (c) c.zone = "runner:stack";
        }
        log(
          state,
          `${source?.title ?? "Data Loop"} — add ${selected.length} card(s) from grip to top of stack.`,
        );
        return { ok: true };
      }
      const grip = state.runner.hand.filter((id) => !selected.includes(id));
      if (grip.length === 0) {
        for (const id of selected) {
          if (!state.runner.hand.includes(id)) continue;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.deck.unshift(id);
          const c = state.cards[id];
          if (c) c.zone = "runner:stack";
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `dl:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of stack`,
          effect: fx.do({
            kind: "choose_n_grip_to_stack_top_continue",
            selected: [...selected, id],
            remaining: remaining - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "open_forum_hq_to_rd_top": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) return { ok: true };
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const c = state.cards[id];
      if (c) {
        c.zone = "corp:rd";
        c.faceup = false;
      }
      log(state, `Open Forum — add ${c?.title ?? id} to top of R&D.`);
      return { ok: true };
    }

    case "dtwn_bacterial_programming": {
      const n = Math.min(7, state.corp.deck.length);
      if (n === 0) {
        log(state, `Bacterial Programming — R&D empty.`);
        return { ok: true };
      }
      const looked = state.corp.deck.slice(0, n);
      state.corp.deck = state.corp.deck.slice(n);
      // Stage looked cards on the source for multi-step choice.
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "begin",
            label: `Looked at ${n} — choose cards to add to HQ / trash / arrange`,
            effect: fx.do({ kind: "dtwn_bacterial_partition" }),
          },
        ],
        logLine: `Bacterial Programming — look at top ${n} of R&D.`,
      });
      return { ok: true };
    }

    case "dtwn_bacterial_partition": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      if (looked.length === 0) {
        log(state, `Bacterial Programming — nothing left to arrange.`);
        return { ok: true };
      }
      // Each card may go to HQ or be trashed; "Done" then arranges the rest
      // on top of R&D in the order the Corp picks.
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "keep-order",
          label: "Done — arrange the rest on top of R&D",
          effect: fx.do({
            kind: "dtwn_bacterial_finish",
            toHq: [],
            toTrash: [],
            arrange: looked,
          }),
        },
      ];
      for (const id of looked) {
        options.push({
          id: `hq:${id}`,
          label: `Add ${state.cards[id]!.title} to HQ`,
          effect: fx.do({
            kind: "dtwn_bacterial_take_hq",
            cardId: id,
          }),
        });
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_bacterial_one",
            cardId: id,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "dtwn_bacterial_take_hq": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      const id = action.cardId;
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id]!.zone = "corp:hq";
      state.cards[id]!.faceup = false;
      log(state, `Bacterial Programming — add 1 card to HQ.`);
      return (
        applyDeckOrderKinds(ctx, {
          kind: "dtwn_bacterial_partition",
        }) ?? { ok: true }
      );
    }

    case "dtwn_bacterial_finish": {
      for (const id of action.toHq) {
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
      }
      for (const id of action.toTrash) {
        // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
        trashCard(state, id, { by: "corp", faceup: false });
      }
      // "arrange the rest in any order": with more than one card left the
      // Corp picks the order (CR 1.15.2).
      if (action.arrange.length > 1 && state.turn.rdLookedCards.length === 0) {
        delete (source as { dtwnBacterialLooked?: string[] })
          .dtwnBacterialLooked;
        state.turn.rdLookedCards = [...action.arrange];
        state.turn.rdArrangePlaced = [];
        return offerRdArrangeChoice(state, sourceId);
      }
      // arrange: bottom-to-top → unshift in reverse so first is top
      for (let i = action.arrange.length - 1; i >= 0; i--) {
        const id = action.arrange[i]!;
        state.corp.deck.unshift(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      delete (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked;
      log(state, `Bacterial Programming — finish arrange.`);
      return { ok: true };
    }

    case "draw_if_hq_full": {
      const max = effectiveCorpMaxHandSize(state);
      if (state.corp.hand.length === max) {
        // Vigil: a draw, through the draw procedure (CR 8.4.5).
        log(state, `Vigil — HQ is at the Corp's maximum hand size; draw 1.`);
        return evalEffect(ctx, fx.draw("runner", 1));
      }
      return { ok: true };
    }

    case "sensie_add_one_hq_to_bottom_rd": {
      if (state.corp.hand.length === 0) {
        log(state, `Sensie Actors Union — HQ empty.`);
        return { ok: true };
      }
      if (state.corp.hand.length === 1) {
        return applyDeckOrderKinds(ctx, {
          kind: "resolve_sensie_add_hq_to_bottom_rd",
          cardId: state.corp.hand[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((cardId) => ({
          id: `sensie:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to bottom of R&D`,
          effect: fx.do({
            kind: "resolve_sensie_add_hq_to_bottom_rd",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_sensie_add_hq_to_bottom_rd": {
      const cardId = action.cardId;
      if (!state.corp.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      log(
        state,
        `Sensie Actors Union — add ${card.title} from HQ to bottom of R&D.`,
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
      return applyDeckOrderKinds(ctx, {
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
          return applyDeckOrderKinds(ctx, {
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

    case "si_stack_arrange_pick": {
      const cardId = action.cardId;
      const looked = state.turn.siStackLookedCards ?? [];
      const idx = looked.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange stack — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      state.turn.siStackLookedCards = looked;
      const placed = state.turn.siStackArrangePlaced ?? [];
      placed.push(cardId);
      state.turn.siStackArrangePlaced = placed;
      return offerSiStackArrangeChoice(ctx);
    }

    case "add_nonvirus_program_to_stack_top": {
      const programs = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return !(c.subtypes ?? []).some((s) => s.toLowerCase() === "virus");
      });
      if (programs.length === 0) {
        log(state, `Brahman — no installed non-virus program.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `brahman:${id}`,
            label: `Add ${c.title} to top of stack`,
            effect: fx.do({
              kind: "move_program_to_stack_top",
              cardId: id,
            }),
          };
        }),
        logLine: `Brahman — choose an installed non-virus program for stack top.`,
      });
      return { ok: true };
    }

    case "draw_next_sapphire": {
      const x = countRezzedNextIce(state);
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= x; n++) {
        opts.push({
          id: `sapphire-draw:${n}`,
          label: n === 0 ? "Draw 0" : `Draw ${n}`,
          effect: fx.do({ kind: "draw", side: "corp", amount: n }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts });
      return { ok: true };
    }

    case "cotc_next_sapphire_hq_to_rd": {
      const x = countRezzedNextIce(state);
      const hq = [...state.corp.hand];
      if (x <= 0 || hq.length === 0) {
        log(state, `NEXT Sapphire — shuffle 0 from HQ (X=${x}).`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...hq.map((id) => ({
            id: `sapphire-hq:${id}`,
            label: `Shuffle ${state.cards[id]!.title} into R&D`,
            effect: fx.do({
              kind: "pick_next_sapphire_hq",
              cardId: id,
              remaining: Math.min(x, hq.length) - 1,
            }),
          })),
          {
            id: "sapphire-hq-done",
            label: "Done",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "cotc_anansi_arrange_rd": {
      // Printed: look at the top N of R&D and arrange them in any order.
      // Reuse the shared pick_rd_arrange flow (same as look_top_n_rd_arrange).
      const amount = (action as { amount?: number }).amount ?? 5;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(amount, state.corp.deck.length),
      );
      if (taken.length === 0) {
        log(state, `Anansi — R&D empty.`);
        return { ok: true };
      }
      state.turn.rdLookedCards = taken;
      state.turn.rdArrangePlaced = [];
      lookAtCards(state, taken, sourceId);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: taken.map((id) => ({
          id: `rd-arrange:${id}`,
          label: `Place ${state.cards[id]!.title} on top next`,
          effect: fx.do({ kind: "pick_rd_arrange", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "draw_from_bottom_of_rd": {
      // Shannon Claire: "Draw 1 card from the bottom of R&D" is a draw, so it
      // goes through the draw procedure (CR 8.4.5): the bottom card moves to
      // the top, then the Corp draws it (Jinja City Grid, Political Dealings).
      // With R&D empty the draw still happens, so the Runner wins
      // (CR 1.7.2c).
      const n = action.amount ?? 1;
      for (let i = 0; i < Math.min(n, state.corp.deck.length); i++) {
        const id = state.corp.deck.pop()!;
        state.corp.deck.unshift(id);
      }
      return evalEffect(ctx, fx.draw("corp", n));
    }

    case "move_agenda_to_bottom_rd": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      removeCardFromCurrentZone(state, action.cardId);
      if (action.shuffledRd) {
        const rest = state.corp.deck.filter((id) => id !== action.cardId);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          [rest[i], rest[j]] = [rest[j]!, rest[i]!];
        }
        // top = index 0; bottom = end
        state.corp.deck = [...rest, action.cardId];
      } else {
        state.corp.deck.push(action.cardId);
      }
      card.zone = "corp:rd";
      card.faceup = false;
      log(state, `${card.title} added to bottom of R&D.`);
      return { ok: true };
    }

    case "return_looked": {
      const looked = [...state.turn.rdLookedCards];
      state.turn.rdLookedCards = [];
      for (const id of looked.reverse()) {
        state.cards[id].faceup = false;
        state.corp.deck.unshift(id);
        state.cards[id].zone = "corp:rd";
      }
      log(state, `Psychokinesis — return looked cards to R&D.`);
      return { ok: true };
    }
    case "draw_until_grip_equals_max_hand_size": {
      // Game Day: draw the difference through the draw procedure, so draw
      // limits and draw triggers apply (CR 8.4.2).
      recomputeRunnerMaxHandSize(state);
      const max = state.runner.maxHandSize;
      const need = max - state.runner.hand.length;
      log(state, `Game Day — draw until grip equals max hand size (${max}).`);
      if (need <= 0) return { ok: true };
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "draw", side: "runner", amount: need },
      });
    }
    case "move_accessed_to_bottom_rd": {
      const accessId = state.run?.accessingCardId ?? null;
      if (!accessId) {
        log(state, `Maya — no accessed card.`);
        return { ok: true };
      }
      const card = state.cards[accessId];
      if (!card) return { ok: true };
      // An accessed root card is uninstalled as it moves (CR 8.5.1b).
      if (!uninstallCard(state, accessId, "deck-bottom")) {
        removeCardFromCurrentZone(state, accessId);
        state.corp.deck.push(accessId);
        card.zone = "corp:rd";
        card.faceup = false;
      }
      if (state.run) state.run.accessingCardId = null;
      log(state, `Maya — ${card.title} to bottom of R&D.`);
      return { ok: true };
    }
    case "may_add_archives_card_to_rd_bottom_only": {
      const archives = [...state.corp.discardPile];
      if (archives.length === 0) {
        log(state, `Hades Fragment — Archives empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-hades",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
          ...archives.map((id) => ({
            id: `hades-bottom:${id}`,
            label: `Add ${state.cards[id]!.title} to bottom of R&D`,
            effect: fx.do({
              kind: "add_archives_card_to_rd",
              cardId: id,
              position: "bottom",
            }),
          })),
        ],
      });
      return { ok: true };
    }
    case "bottom_top": {
      const cardId = (action as { cardId: string }).cardId;
      state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
      state.runner.deck.push(cardId);
      log(
        state,
        `Angel Arena — ${state.cards[cardId]!.title} to bottom of stack.`,
      );
      return { ok: true };
    }

    case "tdatd_sadaka_arrange": {
      // Printed: arrange the looked-at cards in any order (CR 1.2.1).
      // Reuse the shared pick_rd_arrange flow.
      const cardIds = (action as { cardIds: string[] }).cardIds ?? [];
      if (cardIds.length === 0) return { ok: true };
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      state.turn.rdLookedCards = [...cardIds];
      state.turn.rdArrangePlaced = [];
      for (const id of cardIds) {
        state.cards[id]!.faceup = true;
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cardIds.map((id) => ({
          id: `rd-arrange:${id}`,
          label: `Place ${state.cards[id]!.title} on top next`,
          effect: fx.do({ kind: "pick_rd_arrange", cardId: id }),
        })),
        logLine: `Sadaka — arrange top of R&D.`,
      });
      return { ok: true };
    }
    case "place_hq_on_top_rd_continue": {
      const id = (action as { cardId?: string }).cardId;
      if (!id || !state.corp.hand.includes(id)) return { ok: true };
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const card = state.cards[id]!;
      card.zone = "corp:rd";
      card.faceup = false;
      log(state, `CBI Raid — ${card.title} to top of R&D.`);
      return offerCbiRaidHqToRd(ctx);
    }

    case "draw_then_discard_down_to_hand_size": {
      const n = action.drawAmount ?? 3;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        state.runner.hand.push(top);
        const c = state.cards[top]!;
        c.zone = "runner:grip";
      }
      log(state, `Harvester — Runner draws ${n}.`);
      return offerDiscardDownToHandSize(ctx);
    }

    case "draw_then_discard_down_to_hand_size_continue": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.hand.includes(cardId)) return { ok: true };
      // A discard, not a trash (CR 1.19.3).
      discardCard(state, cardId);
      log(state, `Harvester — Runner discards ${state.cards[cardId]!.title}.`);
      return offerDiscardDownToHandSize(ctx);
    }
    case "express_delivery_finish": {
      const { pickId, restIds } = action;
      state.runner.hand.push(pickId);
      state.cards[pickId]!.zone = "runner:grip";
      state.cards[pickId]!.faceup = true;
      for (const id of restIds ?? []) {
        state.runner.deck.push(id);
        state.cards[id]!.faceup = false;
      }
      // shuffle
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [state.runner.deck[i], state.runner.deck[j]] = [
          state.runner.deck[j]!,
          state.runner.deck[i]!,
        ];
      }
      log(state, `Express Delivery — took 1 card; shuffled stack.`);
      return { ok: true };
    }
    case "draw_from_stack_bottom": {
      const side = action.side === "corp" ? "corp" : "runner";
      const p = side === "corp" ? state.corp : state.runner;
      const amount = action.amount ?? 1;
      for (let i = 0; i < amount && p.deck.length > 0; i++) {
        const id = p.deck.pop()!;
        p.hand.push(id);
        state.cards[id]!.zone = side === "corp" ? "corp:hq" : "runner:grip";
      }
      log(state, `Draw ${amount} from bottom of stack.`);
      return { ok: true };
    }
    case "choose_card_type_reveal_stack_top": {
      const types = ["event", "program", "resource", "hardware"];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: types.map((t) => ({
          id: `om:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "reveal_oracle_top_match", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "draw_shuffled": {
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

    case "add_installed_program_to_stack_bottom": {
      const programs = state.runner.installed.filter(
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
      openPendingChoose(state, {
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
      });
      return { ok: true };
    }

    case "add_installed_program_to_stack_bottom_resolve": {
      const cardId = action.cardId;
      if (!state.runner.installed.includes(cardId)) return { ok: true };
      const card = state.cards[cardId];
      uninstallCard(state, cardId, "deck-bottom");
      log(
        state,
        `Add ${card?.title ?? cardId} to bottom of the Runner's stack.`,
      );
      return { ok: true };
    }

    case "choose_hq": {
      const cardId = action.cardId;
      const rest = action.restIds ?? [];
      if (!cardId || !state.corp.deck.includes(cardId)) {
        log(state, `Bamboo Dome — chosen card not on R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.hand.push(cardId);
      state.cards[cardId]!.zone = "corp:hq";
      state.cards[cardId]!.faceup = false;
      log(state, `Bamboo Dome — add ${state.cards[cardId]!.title} to HQ.`);
      const still = rest.filter((id) => state.corp.deck.includes(id));
      if (still.length <= 1) {
        // Keep relative order; already on top after removing HQ card.
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: still.map((id) => ({
          id: `top:${id}`,
          label: `Top: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "bamboo_dome_order_rest",
            ordered: [id],
            remaining: still.filter((x) => x !== id),
          }),
        })),
      });
      return { ok: true };
    }

    case "bamboo_dome_order_rest": {
      const ordered = [...(action.ordered ?? [])];
      let remaining = [...(action.remaining ?? [])];
      // Printed: return the others in any order. With one card left the order
      // is fixed — no further choice (CR 1.2.1).
      if (remaining.length === 1) {
        ordered.push(remaining[0]!);
        remaining = [];
      }
      if (remaining.length === 0) {
        // Rebuild deck: ordered (top-first) then the rest of deck without those.
        const set = new Set(ordered);
        state.corp.deck = state.corp.deck.filter((id) => !set.has(id));
        state.corp.deck = [...ordered, ...state.corp.deck];
        log(
          state,
          `Bamboo Dome — return ${ordered.map((id) => state.cards[id]?.title).join(", ")} to top of R&D.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: remaining.map((id) => ({
          id: `next:${id}`,
          label: `Next: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "bamboo_dome_order_rest",
            ordered: [...ordered, id],
            remaining: remaining.filter((x) => x !== id),
          }),
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyDeckOrderKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "pick_stack_arrange": {
      const cardId = action.cardId;
      const looked = state.turn.ohStackLookedCards ?? [];
      const idx = looked.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange stack — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      state.turn.ohStackLookedCards = looked;
      const placed = state.turn.ohStackArrangePlaced ?? [];
      placed.push(cardId);
      state.turn.ohStackArrangePlaced = placed;
      return offerStackArrangeChoice(ctx);
    }
    default:
      return null;
  }
}

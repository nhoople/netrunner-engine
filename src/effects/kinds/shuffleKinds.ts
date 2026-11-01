/**
 * Primitive kinds whose procedure is shuffle.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type { Primitive } from "../ir.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import { CR } from "../../timing/labels.js";
import {
  heapCardsWithTrashAbilities,
  rfgRunnerSetAside,
  applyPrimitive,
} from "../eval.js";
import {
  shuffleRunnerSetAsideIntoStack,
  shuffleRunnerStack,
} from "../runnerInstall.js";

export function applyShuffleKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "shuffle_hq_to_rd": {
      const n = Math.min(action.amount, state.corp.hand.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      // Deterministic "shuffle": reverse then rotate by hand size (stable for tests).
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from HQ into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }

case "shuffle_any_number_hq_to_rd": {
      if (state.corp.hand.length === 0) {
        log(state, `Shuffle from HQ into R&D — HQ empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...state.corp.hand.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `shuffle-hq:${id}`,
              label: `Shuffle ${c.title} into R&D`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "shuffle_hq_card_into_rd" as const,
                      cardId: id,
                    },
                  },
                  {
                    op: "do" as const,
                    action: { kind: "shuffle_any_number_hq_to_rd" as const },
                  },
                ],
              },
            };
          }),
          {
            id: "shuffle-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
logLine: `May shuffle any number of cards from HQ into R&D.`,
});
      return { ok: true };
    }

case "shuffle_hq_card_into_rd": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) {
        log(state, `Shuffle HQ card into R&D — not in HQ.`);
        return { ok: true };
      }
      state.corp.hand.splice(idx, 1);
      state.corp.deck.push(cardId);
      const card = state.cards[cardId];
      card.zone = "corp:rd";
      card.faceup = false;
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${card.title} from HQ into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }

case "shuffle_archives_to_rd": {
      const n = Math.min(action.amount, state.corp.discardPile.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discardPile.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from Archives into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }

case "shuffle_n_installed_runner_remaining": {
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const installed: string[] = [];
      for (const id of state.runner.installed) {
        if (!state.cards[id]?.hostId) installed.push(id);
      }
      for (const card of Object.values(state.cards)) {
        if (
          card.side === "runner" &&
          card.hostId &&
          !installed.includes(card.id)
        ) {
          installed.push(card.id);
        }
      }
      if (installed.length === 0) {
        log(state, `Shuffle installed Runner cards — none installed.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        const pick = installed[0]!;
        const r = applyPrimitive(ctx, {
          kind: "shuffle_runner_card_into_stack",
          cardId: pick,
        });
        if (!r.ok) return r;
        if (remaining > 1) {
          return applyPrimitive(ctx, {
            kind: "shuffle_n_installed_runner_remaining",
            remaining: remaining - 1,
          });
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `shuffle-n:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "shuffle_runner_card_into_stack" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "shuffle_n_installed_runner_remaining" as const,
                  remaining: remaining - 1,
                },
              },
            ],
          },
        })),
logLine: `Shuffle installed Runner cards — choose among ${installed.length} (${remaining} remaining).`,
});
      return { ok: true };
    }

case "shuffle_pick_continue": {
      const need = action.need;
      const selected = [...action.selected];
      const aside = state.runner.setAside ?? [];
      if (selected.length >= need) {
        return applyPrimitive(ctx, {
          kind: "shuffle_selected_rfg_rest",
          cardIds: selected.slice(0, need),
        });
      }
      const remaining = aside.filter((id) => !selected.includes(id));
      const left = need - selected.length;
      if (remaining.length <= left) {
        return applyPrimitive(ctx, {
          kind: "shuffle_selected_rfg_rest",
          cardIds: [...selected, ...remaining],
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: remaining.map((id) => ({
          id: `gacha-shuf:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack (${selected.length + 1}/${need})`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_pick_continue" as const,
              need,
              selected: [...selected, id],
            },
          },
        })),
      });
      return { ok: true };
    }

case "shuffle_selected_rfg_rest": {
      const pick = new Set(action.cardIds);
      const aside = [...(state.runner.setAside ?? [])];
      const toStack: string[] = [];
      for (const id of aside) {
        if (pick.has(id)) toStack.push(id);
      }
      // Move selected to stack first, then RFG the rest still set-aside.
      state.runner.setAside = aside.filter((id) => !pick.has(id));
      for (const id of toStack) {
        state.runner.deck.push(id);
        state.cards[id]!.zone = "runner:stack";
        state.cards[id]!.faceup = false;
      }
      const rfgCount = (state.runner.setAside ?? []).length;
      rfgRunnerSetAside(state);
      if (toStack.length > 0) shuffleRunnerStack(state);
      log(
        state,
        `Gachapon — shuffle ${toStack.length} into stack; remove ${rfgCount} from the game.`,
      );
      return { ok: true };
    }

case "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack": {
      const per = Math.max(0, action.nPerPowerCounter ?? 2);
      const power = source.powerCounters ?? 0;
      const max = per * power;
      if (max <= 0) {
        log(
          state,
          `${source.title} — no power counters; nothing to shuffle from heap.`,
        );
        return { ok: true };
      }
      const withTrash = heapCardsWithTrashAbilities(state);
      if (withTrash.length === 0) {
        log(state, `${source.title} — no heap cards with [trash] abilities.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue",
        maxRemaining: max,
        selected: [],
      });
    }

case "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue": {
      const selected = [...action.selected];
      const withTrash = heapCardsWithTrashAbilities(state).filter(
        (id) => !selected.includes(id),
      );
      if (action.maxRemaining <= 0 || withTrash.length === 0) {
        for (const id of selected) {
          if (!state.runner.discardPile.includes(id)) continue;
          state.runner.discardPile = state.runner.discardPile.filter((x) => x !== id);
          state.runner.deck.push(id);
          state.cards[id]!.zone = "runner:stack";
          state.cards[id]!.faceup = false;
        }
        if (selected.length > 0) shuffleRunnerStack(state);
        log(
          state,
          `${source.title} — shuffle ${selected.length} heap card(s) with [trash] into stack.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "heap-trash-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue" as const,
                maxRemaining: 0,
                selected,
              },
            },
          },
          ...withTrash.map((id) => ({
            id: `heap-trash:${id}`,
            label: `Shuffle ${state.cards[id]!.title} into stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue" as const,
                maxRemaining: action.maxRemaining - 1,
                selected: [...selected, id],
              },
            },
          })),
        ],
logLine: `${source.title} — choose up to ${action.maxRemaining} more heap card(s) with [trash] to shuffle.`,
});
      return { ok: true };
    }

case "shuffle_up_to_n_distinct_heap_titles_into_stack": {
      const max = Math.max(0, action.max);
      if (max <= 0 || state.runner.discardPile.length === 0) {
        log(
          state,
          `${source.title} — shuffle up to ${max} distinct heap titles: nothing to do.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "heap-titles-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                maxRemaining: 0,
                selected: [],
                usedTitles: [],
              },
            },
          },
          ...state.runner.discardPile.map((id) => {
            const title = state.cards[id]!.title;
            return {
              id: `heap-title:${id}`,
              label: `Shuffle ${title} into stack`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                  maxRemaining: max - 1,
                  selected: [id],
                  usedTitles: [title],
                },
              },
            };
          }),
        ],
logLine: `${source.title} — shuffle up to ${max} cards with distinct titles from heap into stack.`,
});
      return { ok: true };
    }

case "shuffle_up_to_n_distinct_heap_titles_into_stack_continue": {
      const selected = [...action.selected];
      const usedTitles = new Set(action.usedTitles);
      const offerMore = action.maxRemaining > 0;
      const candidates = offerMore
        ? state.runner.discardPile.filter((id) => {
            if (selected.includes(id)) return false;
            const title = state.cards[id]?.title;
            if (!title || usedTitles.has(title)) return false;
            return true;
          })
        : [];
      if (!offerMore || candidates.length === 0) {
        for (const id of selected) {
          if (!state.runner.discardPile.includes(id)) continue;
          state.runner.discardPile = state.runner.discardPile.filter((x) => x !== id);
          state.runner.deck.push(id);
          state.cards[id]!.zone = "runner:stack";
          state.cards[id]!.faceup = false;
        }
        if (selected.length > 0) shuffleRunnerStack(state);
        log(
          state,
          `Shuffle ${selected.length} distinct-title heap card(s) into stack.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "heap-titles-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                maxRemaining: 0,
                selected,
                usedTitles: [...usedTitles],
              },
            },
          },
          ...candidates.map((id) => {
            const title = state.cards[id]!.title;
            return {
              id: `heap-title:${id}`,
              label: `Shuffle ${title} into stack`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                  maxRemaining: action.maxRemaining - 1,
                  selected: [...selected, id],
                  usedTitles: [...usedTitles, title],
                },
              },
            };
          }),
        ],
      });
      return { ok: true };
    }

case "shuffle_installed_runner_into_stack": {
      const installed: string[] = [];
      for (const id of state.runner.installed) {
        if (!state.cards[id]?.hostId) installed.push(id);
      }
      for (const card of Object.values(state.cards)) {
        if (
          card.side === "runner" &&
          card.hostId &&
          !installed.includes(card.id)
        ) {
          installed.push(card.id);
        }
      }
      if (installed.length === 0) {
        log(state, `Shuffle installed into stack — none installed.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        return applyPrimitive(ctx, {
          kind: "shuffle_runner_card_into_stack",
          cardId: installed[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `shuffle-stack:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_runner_card_into_stack" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose an installed Runner card to shuffle into the stack.`,
});
      return { ok: true };
    }

case "shuffle_runner_card_into_stack": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.side !== "runner") {
        log(state, `Shuffle into stack — invalid card.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, cardId);
      card.hostId = undefined;
      state.runner.deck.push(cardId);
      card.zone = "runner:stack";
      card.faceup = false;
      card.rezzed = false;
      // Shuffle the stack.
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(
        state,
        `Shuffle ${card.title} into the stack.`,
      );
      return { ok: true };
    }

case "shuffle_hosted_cards_into_stack": {
      const hosted = [...(source.hostedCardIds ?? [])];
      source.hostedCardIds = [];
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        card.hostId = undefined;
        card.faceup = false;
        card.zone = "runner:stack";
        state.runner.deck.push(id);
      }
      // Fisher-Yates shuffle stack
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(
        state,
        `${source.title} — shuffle ${hosted.length} hosted card(s) into stack.`,
      );
      return { ok: true };
    }

case "shuffle_grip_of_type": {
      const cardType = action.cardType;
      const maxCards = action.maxCards;
      const matching = state.runner.hand.filter(
        (id) => state.cards[id]?.type === cardType,
      );
      if (matching.length === 0) {
        log(
          state,
          `Touch-ups — no ${cardType} cards in grip to shuffle.`,
        );
        return { ok: true };
      }
      log(
        state,
        `Touch-ups — reveal grip (${state.runner.hand.length} cards).`,
      );
      const pickOptions: import("../ir.js").ChoiceOption[] = matching.map((id) => {
        const c = state.cards[id]!;
        return {
          id: `shuffle:${id}`,
          label: `Shuffle ${c.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_grip_card_into_stack" as const,
              cardId: id,
            },
          },
        };
      });
      void maxCards;
      pickOptions.push({
        id: "done",
        label: "Done shuffling",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: pickOptions,
      });
      return { ok: true };
    }

case "shuffle_grip_card_into_stack": {
      const idx = state.runner.hand.indexOf(action.cardId);
      if (idx < 0) {
        log(state, `Shuffle grip — card not in hand.`);
        return { ok: true };
      }
      state.runner.hand.splice(idx, 1);
      const insertAt = Math.floor(Math.random() * (state.runner.deck.length + 1));
      state.runner.deck.splice(insertAt, 0, action.cardId);
      state.cards[action.cardId]!.zone = "runner:stack";
      log(
        state,
        `Shuffle ${state.cards[action.cardId]!.title} into stack (Touch-ups).`,
      );
      return { ok: true };
    }

case "shuffle_runner_set_aside_into_stack": {
      shuffleRunnerSetAsideIntoStack(state);
      return { ok: true };
    }

case "shuffle_source_into_rd": {
      if (!state.runner.scoreArea.includes(sourceId)) {
        log(state, `Shuffle into R&D — source not in Runner score area.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, sourceId);
      state.corp.deck.push(sourceId);
      source.zone = "corp:rd";
      source.faceup = false;
      source.rezzed = false;
      state.corp.deck.reverse();
      log(state, `${source.title} — shuffle from Runner score into R&D.`);
      return { ok: true };
    }

case "shuffle_random_grip_into_stack": {
      // Printed (Bring Them Home): "Reveal and add 2 cards at random from
      // the grip to the top of the stack." Random picks, placed on top —
      // not the first cards in hand order shuffled into the stack.
      const n = Math.max(0, action.count);
      const moved: string[] = [];
      for (let i = 0; i < n && state.runner.hand.length > 0; i++) {
        const idx = Math.floor(Math.random() * state.runner.hand.length);
        moved.push(state.runner.hand.splice(idx, 1)[0]!);
      }
      for (const id of moved) {
        state.runner.deck.unshift(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Reveal ${moved
          .map((id) => state.cards[id]!.title)
          .join(", ")} from the grip — add to the top of the stack.`,
      );
      return { ok: true };
    }

case "shuffle_grip_and_heap_into_stack": {
      const fromGrip = [...state.runner.hand];
      const fromHeap = [...state.runner.discardPile];
      state.runner.hand = [];
      state.runner.discardPile = [];
      for (const id of [...fromGrip, ...fromHeap]) {
        state.runner.deck.push(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      shuffleRunnerStack(state);
      log(
        state,
        `Shuffle grip (${fromGrip.length}) and heap (${fromHeap.length}) into stack.`,
      );
      return { ok: true };
    }

case "may_shuffle_register_title_from_heap_on_successful_run_end": {
      if (!state.run) {
        log(state, `Register heap shuffle — no run.`);
        return { ok: true };
      }
      if (!state.run.mayShuffleTitlesFromHeapOnSuccessfulRunEnd) {
        state.run.mayShuffleTitlesFromHeapOnSuccessfulRunEnd = [];
      }
      state.run.mayShuffleTitlesFromHeapOnSuccessfulRunEnd.push(action.title);
      log(
        state,
        `Register: if this run is successful, may shuffle ${action.title} from heap into stack.`,
      );
      return { ok: true };
    }

case "may_shuffle_title_from_heap_into_stack": {
      const matches = state.runner.discardPile.filter(
        (id) => state.cards[id]?.title === action.title,
      );
      if (matches.length === 0) {
        log(
          state,
          `May shuffle ${action.title} from heap — none in heap.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-shuffle",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: `shuffle-heap:${matches[0]!}`,
            label: `Shuffle ${action.title} from heap into stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_heap_card_into_stack" as const,
                cardId: matches[0]!,
              },
            },
          },
        ],
logLine: `May shuffle 1 copy of ${action.title} from heap into stack.`,
});
      return { ok: true };
    }

case "shuffle_heap_card_into_stack": {
      const id = action.cardId;
      if (!state.runner.discardPile.includes(id)) {
        log(state, `Shuffle heap card — not in heap.`);
        return { ok: true };
      }
      state.runner.discardPile = state.runner.discardPile.filter((x) => x !== id);
      state.runner.deck.push(id);
      state.cards[id]!.zone = "runner:stack";
      state.cards[id]!.faceup = false;
      shuffleRunnerStack(state);
      log(
        state,
        `Shuffle ${state.cards[id]!.title} from heap into stack.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

/**
 * Primitive kinds whose procedure is look.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type { Primitive } from "../ir.js";
import { occurCheckpoint } from "../../legality/checkpoints.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
} from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import {
  offerRdArrangeChoice,
  offerCultivateTrashChoice,
} from "../eval.js";

export function applyLookKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "look_top_last_trace_excess_stack_trash_one_arrange_rest": {
      const n = Math.max(0, state.turn.lastTraceExcess ?? 0);
      if (n <= 0) {
        log(state, `${source.title} — look top 0 of stack (no excess).`);
        return { ok: true };
      }
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — stack empty.`);
        return { ok: true };
      }
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Look stack — ${state.cards[id]!.title}.`);
      }
      state.turn.rdLookedCards = taken;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: taken.map((id) => ({
          id: `data-hound-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_data_hound_looked" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — Corp trashes 1 of ${taken.length} looked card(s).`,
});
      return { ok: true };
    }

case "look_top_n_rd_may_install_one": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Look R&D — ${state.cards[id].title}.`);
      }
      occurCheckpoint(
        state,
        "instruction",
        "Between instructions",
        [CR.resolveAbility],
        sourceId,
      );
      const installable = taken.filter((id) => {
        const t = state.cards[id].type;
        if (action.excludeAgenda && t === "agenda") return false;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const affordable = installable.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline to install",
            effect: {
              op: "do",
              action: { kind: "return_rd_looked_to_deck_top" },
            },
          },
          ...affordable.map((id) => ({
            id: `rd-look-install:${id}`,
            label: `Install ${state.cards[id].title} for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_rd_looked_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
logLine: `May install one looked R&D card paying install costs.`,
});
      return { ok: true };
    }

case "look_top_n_rd_may_install_and_rez_ignore_costs": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Look R&D — ${state.cards[id].title}.`);
      }
      occurCheckpoint(
        state,
        "instruction",
        "Between instructions",
        [CR.resolveAbility],
        sourceId,
      );
      const installable = taken.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline to install",
            effect: {
              op: "do",
              action: { kind: "return_rd_looked_to_deck_top" },
            },
          },
          ...installable.map((id) => {
            const t = state.cards[id]!.type;
            const rezBit = t === "agenda" ? "" : " and rez";
            return {
              id: `rd-look-install-rez:${id}`,
              label: `Install${rezBit} ${state.cards[id]!.title} ignoring costs`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_rez_rd_looked_card_ignore_costs" as const,
                  cardId: id,
                },
              },
            };
          }),
        ],
logLine: `May install and rez one looked R&D card ignoring all costs.`,
});
      return { ok: true };
    }

case "look_top_1_rd_choose_type_may_reveal_gain": {
      const credits = action.credits ?? 0;
      const types: Array<
        | "agenda"
        | "asset"
        | "ice"
        | "operation"
        | "upgrade"
        | "event"
      > = [
        "agenda",
        "asset",
        "ice",
        "operation",
        "upgrade",
        "event",
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `rd-type:${t}`,
          label: `Choose type: ${t}`,
          effect: {
            op: "do",
            action: {
              kind: "may_reveal_peek_rd_top_for_chosen_type_gain",
              cardType: t,
              credits,
            },
          },
        })),
logLine: `Choose a card type and look at the top card of R&D.`,
});
      return { ok: true };
    }

case "look_top_n_rd_peek": {
      const n = Math.max(0, action.n ?? 1);
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Runner looks at R&D — ${state.cards[id].title}.`);
      }
      for (let i = taken.length - 1; i >= 0; i--) {
        const id = taken[i]!;
        state.cards[id].faceup = false;
        state.corp.deck.unshift(id);
      }
      log(state, `Return ${taken.length} looked card(s) to top of R&D.`);
      return { ok: true };
    }

case "look_top_n_rd_arrange": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      state.turn.rdArrangePlaced = [];
      state.turn.rdArrangeThenMayDrawIfUnprotected = Boolean(
        action.thenMayDrawIfUnprotected,
      );
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Look R&D — ${state.cards[id].title}.`);
      }
      return offerRdArrangeChoice(state, sourceId);
    }

case "look_top_n_rd_trash_one_hq_one_arrange_rest": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      if (taken.length === 0) {
        log(state, `Cultivate — R&D empty.`);
        return { ok: true };
      }
      state.turn.rdLookedCards = taken;
      state.turn.rdArrangePlaced = [];
      state.turn.rdArrangeThenMayDrawIfUnprotected = false;
      for (const id of taken) state.cards[id].faceup = false;
      log(state, `Cultivate — look at ${taken.length} cards of R&D.`);
      return offerCultivateTrashChoice(state, sourceId);
    }

case "look_class_act_top_draw_amount_plus_one_bottom_one": {
      const amount = state.turn.pendingWouldDrawAmount ?? 0;
      const lookN = Math.max(0, amount + 1);
      const taken = state.runner.deck.splice(
        0,
        Math.min(lookN, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — Class Act look: stack empty.`);
        state.turn.pendingWouldDrawAmount = null;
        return { ok: true };
      }
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Class Act looks at ${state.cards[id]!.title}.`);
      }
      if (!openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: taken.map((id) => ({
          id: `class-act-bottom:${id}`,
          label: `Add ${state.cards[id]!.title} to bottom of stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "draw_class_act_bottom_one_then" as const,
              cardId: id,
            },
          },
        })),
      })) {
        for (let i = taken.length - 1; i >= 0; i--) {
          const id = taken[i]!;
          state.cards[id]!.faceup = false;
          state.runner.deck.unshift(id);
        }
        return { ok: true };
      }
      // Stash looked ids on turn for the bottom leaf.
      state.turn.rdLookedCards = taken;
      log(
        state,
        `${source.title} — look at top ${taken.length}; bottom 1, then draw ${amount}.`,
      );
      return { ok: true };
    }

case "look_top_rd_may_trash_if_do_archives_to_hq": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "leave-top",
            label: `Leave ${top.title} on top of R&D`,
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: "trash-top-archives",
            label: `Trash ${top.title}; add 1 card from Archives to HQ`,
            effect: {
              op: "seq",
              effects: [
                { op: "do", action: { kind: "trash_top_of_rd" } },
                {
                  op: "do",
                  action: { kind: "archives_to_hq", amount: 1 },
                },
              ],
            },
          },
        ],
logLine: `Look at top of R&D (${top.title}) — may trash; if so, Archives → HQ.`,
});
      return { ok: true };
    }

case "look_top_stack_may_reveal_breaker_or_run_event": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Look top of stack — empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      const isBreaker = (card.subtypes ?? []).includes("icebreaker");
      const isRunEvent =
        card.type === "event" && (card.subtypes ?? []).includes("run");
      log(
        state,
        `Look top of stack — ${card.title}${isBreaker || isRunEvent ? "" : " (no reveal)"}.`,
      );
      if (!isBreaker && !isRunEvent) {
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Leave on top of stack",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: `reveal-top:${top}`,
            label: `Reveal ${card.title} and add to grip`,
            effect: {
              op: "do",
              action: {
                kind: "reveal_runner_stack_top_to_grip",
                cardId: top,
              },
            },
          },
        ],
      });
      return { ok: true };
    }

case "look_top_n_stack_may_bottom_one": {
      const n = Math.max(0, action.n ?? 0);
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — look at top of stack: empty.`);
        return { ok: true };
      }
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Runner looks at stack — ${state.cards[id]!.title}.`);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "leave-top",
            label: "Leave cards on top of stack",
            effect: {
              op: "do" as const,
              action: {
                kind: "look_top_n_stack_bottom_one" as const,
                lookedIds: taken,
              },
            },
          },
          ...taken.map((id) => ({
            id: `bottom:${id}`,
            label: `Add ${state.cards[id]!.title} to bottom of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "look_top_n_stack_bottom_one" as const,
                cardId: id,
                lookedIds: taken,
              },
            },
          })),
        ],
logLine: `${source.title} — may add 1 of ${taken.length} looked card(s) to bottom.`,
});
      return { ok: true };
    }

case "look_top_n_stack_bottom_one": {
      const looked = action.lookedIds ?? [];
      const bottomId = action.cardId;
      const keep: string[] = [];
      for (const id of looked) {
        if (bottomId && id === bottomId) continue;
        keep.push(id);
      }
      for (let i = keep.length - 1; i >= 0; i--) {
        const id = keep[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      if (bottomId && looked.includes(bottomId)) {
        state.cards[bottomId]!.faceup = false;
        state.runner.deck.push(bottomId);
        log(
          state,
          `Add ${state.cards[bottomId]!.title} to bottom of stack.`,
        );
      } else {
        log(state, `Leave looked card(s) on top of stack.`);
      }
      return { ok: true };
    }

case "look_top_rd_may_trash": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "leave-top",
            label: `Leave ${top.title} on top of R&D`,
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: "trash-top",
            label: `Trash ${top.title} from R&D`,
            effect: {
              op: "do",
              action: { kind: "trash_top_of_rd" },
            },
          },
        ],
logLine: `Look at top of R&D (${top.title}) — may trash.`,
});
      return { ok: true };
    }

case "look_top_rd_may_bottom": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "leave-top",
            label: `Leave ${top.title} on top of R&D`,
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: "bottom-top",
            label: `Add ${top.title} to the bottom of R&D`,
            effect: {
              op: "do",
              action: { kind: "rd_top_to_bottom" },
            },
          },
        ],
logLine: `Look at top of R&D (${top.title}) — may bottom.`,
});
      return { ok: true };
    }

case "look_top_rd_may_advance_may_bottom": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      // Step 1: may place 1 advancement on the looked card.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "advance-top",
            label: `Place 1 advancement on ${top.title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "place_advancements_on" as const,
                    cardId: topId,
                    amount: 1,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "look_top_rd_may_bottom" as const,
                  },
                },
              ],
            },
          },
          {
            id: "skip-advance",
            label: `Do not advance ${top.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "look_top_rd_may_bottom" as const },
            },
          },
        ],
logLine: `Look at top of R&D (${top.title}) — may advance, then may bottom.`,
});
      return { ok: true };
    }

case "look_top_n_stack_peek": {
      const n = Math.max(0, action.amount ?? 0);
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Runner looks at stack — ${state.cards[id]!.title}.`);
      }
      for (let i = taken.length - 1; i >= 0; i--) {
        const id = taken[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      log(state, `Return ${taken.length} looked card(s) to top of stack.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

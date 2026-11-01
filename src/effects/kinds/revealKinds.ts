/**
 * Primitive kinds whose procedure is reveal.
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
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import { CR } from "../../timing/labels.js";
import {
  trashCorpCardToArchives,
  trashToHeap,
} from "../corpTrash.js";
import {
  noteCardRevealed,
  evalEffect,
  applyPrimitive,
} from "../eval.js";

export function applyRevealKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "reveal_install_or_trash": {
      const discount = Math.max(0, action.discount ?? 0);
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Eureka! — stack empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      card.faceup = true;
      log(state, `Eureka! — reveal ${card.title}.`);
      const canInstall =
        card.type === "program" ||
        card.type === "hardware" ||
        card.type === "resource";
      if (!canInstall) {
        trashToHeap(state, top);
        log(state, `Eureka! — trash ${card.title} (cannot install).`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "eureka-install",
            label: `Install ${card.title} (−${discount}¢)`,
            effect: {
              op: "do",
              action: {
                kind: "install_stack_card",
                cardId: top,
                discount,
              },
            },
          },
          {
            id: "eureka-trash",
            label: `Trash ${card.title}`,
            effect: {
              op: "do",
              action: { kind: "trash_top_of_stack" },
            },
          },
        ],
      });
      return { ok: true };
    }

case "may_reveal_peek_rd_top_for_chosen_type_gain": {
      const chosen = action.cardType;
      const credits = action.credits ?? 0;
      if (state.corp.deck.length === 0) {
        log(state, `Look top of R&D — deck empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId];
      log(
        state,
        `Look R&D top — ${top.title} (${top.type}); chosen type ${chosen}.`,
      );
      if (top.type !== chosen) {
        log(state, `Type does not match — leave card on top of R&D.`);
        return { ok: true };
      }
      if (!openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "reveal-gain",
            label: `Reveal ${top.title} and gain ${credits}¢`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "corp",
                    amount: credits,
                  },
                },
              ],
            },
          },
          {
            id: "decline",
            label: "Decline to reveal",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      })) return { ok: true };
      top.faceup = true;
      log(state, `May reveal ${top.title} and gain ${credits}¢.`);
      return { ok: true };
    }

case "reveal_corp_hand_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        log(state, `Reveal HQ card — not in HQ.`);
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Reveal ${card.title} from HQ.`);
      return { ok: true };
    }

case "may_corp_reveal_agenda_from_hq": {
      const agendas = state.corp.hand.filter(
        (id) => state.cards[id].type === "agenda",
      );
      const elseEff = action.else;
      const thenEff = action.then;
      if (agendas.length === 0) {
        log(state, `Reveal agenda from HQ — none in HQ.`);
        if (elseEff) return evalEffect(ctx, elseEff);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...agendas.map((id) => ({
            id: `reveal-hq:${id}`,
            label: `Reveal ${state.cards[id].title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "reveal_corp_hand_card" as const,
                    cardId: id,
                  },
                },
                ...(thenEff ? [structuredClone(thenEff)] : []),
              ],
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: elseEff
              ? structuredClone(elseEff)
              : {
                  op: "do" as const,
                  action: { kind: "gain_credits", side: "corp", amount: 0 },
                },
          },
        ],
logLine: `Corp may reveal an agenda from HQ.`,
});
      return { ok: true };
    }

case "reveal_installed_to_verify": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.faceup = true;
      card.rezzed = false;
      log(
        state,
        `Reveal ${card.title} (CR ${CR.revealForAbilityLimitations.number}).`,
      );
      return { ok: true };
    }

case "reveal_top_stack_to_grip_place_hosted_credits": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Reveal top of stack — empty.`);
        return { ok: true };
      }
      state.runner.deck.shift();
      const card = state.cards[top]!;
      const cost =
        card.playCost ?? card.installCost ?? 0;
      source.hostedCredits = (source.hostedCredits ?? 0) + cost;
      state.runner.hand.push(top);
      card.zone = "runner:grip";
      card.faceup = true;
      log(
        state,
        `Reveal ${card.title} — place ${cost}¢ on ${source.title}; add to grip.`,
      );
      return { ok: true };
    }

case "reveal_top_n_rd": {
      const n = Math.max(0, action.n ?? 1);
      const top = state.corp.deck.slice(0, Math.min(n, state.corp.deck.length));
      if (top.length === 0) {
        log(state, `${source.title} — R&D empty (reveal).`);
        return { ok: true };
      }
      for (const id of top) {
        log(state, `${source.title} reveals ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }

case "reveal_top_n_rd_trash_one": {
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
        log(state, `${source.title} — R&D empty.`);
        return { ok: true };
      }
      state.turn.rdLookedCards = taken;
      state.turn.rdArrangePlaced = [];
      state.turn.rdArrangeThenMayDrawIfUnprotected = false;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `${source.title} reveals ${state.cards[id].title}.`);
      }
      if (taken.length === 1) {
        return applyPrimitive(ctx, {
          kind: "reveal_top_n_rd_trash_picked",
          cardId: taken[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: taken.map((id) => ({
          id: `stargate-trash:${id}`,
          label: `Trash ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "reveal_top_n_rd_trash_picked" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose 1 revealed card to trash.`,
});
      return { ok: true };
    }

case "reveal_top_n_rd_trash_picked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Stargate trash — card not in reveal zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      trashCorpCardToArchives(state, cardId);
      log(state, `${source.title} — trash ${state.cards[cardId]!.title}.`);
      // Remaining revealed cards return to top of R&D in relative order
      // (first revealed stays top).
      const rest = state.turn.rdLookedCards;
      state.turn.rdLookedCards = [];
      for (let i = rest.length - 1; i >= 0; i--) {
        const id = rest[i]!;
        state.cards[id]!.faceup = false;
        state.cards[id]!.zone = "corp:rd";
        state.corp.deck.unshift(id);
      }
      return { ok: true };
    }

case "reveal_hyoubu_grip_random_or_stack_top": {
      const gripOk = state.runner.hand.length > 0;
      const stackOk = state.runner.deck.length > 0;
      if (!gripOk && !stackOk) {
        log(state, `${source.title} — nothing to reveal.`);
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = [];
      if (gripOk) {
        options.push({
          id: "reveal-grip",
          label: "Reveal 1 card from the grip at random",
          effect: {
            op: "do" as const,
            action: { kind: "reveal_hyoubu_grip_random" as const },
          },
        });
      }
      if (stackOk) {
        options.push({
          id: "reveal-stack",
          label: "Reveal the top card of the stack",
          effect: {
            op: "do" as const,
            action: { kind: "reveal_hyoubu_stack_top" as const },
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — choose grip-random or stack-top reveal.`,
});
      return { ok: true };
    }

case "reveal_hyoubu_grip_random": {
      if (state.runner.hand.length === 0) {
        log(state, `${source.title} — grip empty.`);
        return { ok: true };
      }
      const pick =
        state.runner.hand[
          Math.floor(Math.random() * state.runner.hand.length)
        ]!;
      noteCardRevealed(state, pick, sourceId);
      log(
        state,
        `${source.title} — reveal ${state.cards[pick]!.title} from grip.`,
      );
      return { ok: true };
    }

case "reveal_hyoubu_stack_top": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `${source.title} — stack empty.`);
        return { ok: true };
      }
      noteCardRevealed(state, top, sourceId);
      log(
        state,
        `${source.title} — reveal ${state.cards[top]!.title} (stack top).`,
      );
      return { ok: true };
    }

case "reveal_hq_forbid_steal_trash_copies_this_run": {
      if (!state.run) {
        log(state, `${source.title} — reveal HQ requires an active run.`);
        return { ok: true };
      }
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — HQ empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: hq.map((id) => ({
          id: `reveal:${id}`,
          label: `Reveal ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "forbid_steal_trash_title_this_run" as const,
              title: state.cards[id]!.title,
            },
          },
        })),
logLine: `${source.title} — reveal 1 card in HQ.`,
});
      return { ok: true };
    }

case "reveal_hq_gain_credits": {
      const n = Math.min(action.maxCards, state.corp.hand.length);
      const gain = n * action.creditsEach;
      state.corp.credits += gain;
      log(
        state,
        `Reveal ${n} card(s) from HQ → gain ${gain}¢ (${action.creditsEach}¢ each).`,
      );
      return { ok: true };
    }

case "reveal_runner_stack_top_to_grip": {
      const cardId = action.cardId;
      if (state.runner.deck[0] !== cardId) {
        log(state, `Reveal stack top — card is no longer on top.`);
        return { ok: true };
      }
      state.runner.deck.shift();
      state.runner.hand.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "runner:grip";
      card.faceup = true;
      log(state, `Reveal ${card.title} from top of stack → grip.`);
      return { ok: true };
    }

case "reveal_top_of_rd": {
      const topId = state.corp.deck[0];
      if (!topId) {
        log(state, `${source.title} — reveal top of R&D: empty.`);
        return { ok: true };
      }
      const top = state.cards[topId]!;
      top.faceup = true;
      log(state, `${source.title} — reveal top of R&D (${top.title}).`);
      // Reveal is informational; leave card on top (faceup flag cleared for
      // unrevealed deck convention after the pulse is logged).
      top.faceup = false;
      return { ok: true };
    }

case "reveal_top_n": {
      const n = Math.max(0, action.n ?? 0);
      const revealed = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (revealed.length === 0) {
        log(state, `${source.title} — reveal top of stack: empty.`);
        return { ok: true };
      }
      for (const id of revealed) {
        state.cards[id]!.faceup = true;
        log(state, `Reveal stack — ${state.cards[id]!.title}.`);
      }
      if (revealed.length === 1) {
        return applyPrimitive(ctx, {
          kind: "pick_revealed",
          cardId: revealed[0]!,
          revealedIds: revealed,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: revealed.map((id) => {
          const card = state.cards[id]!;
          const cost = card.playCost ?? card.installCost ?? 0;
          return {
            id: `loot:${id}`,
            label: `Add ${card.title} to grip (Corp gains ${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "pick_revealed" as const,
                cardId: id,
                revealedIds: revealed,
              },
            },
          };
        }),
logLine: `${source.title} — Corp chooses 1 of ${revealed.length} revealed card(s).`,
});
      return { ok: true };
    }

case "reveal_grip_may_trash_chosen_encounter_type": {
      const grip = [...state.runner.hand];
      const titles = grip.map((id) => state.cards[id]?.title ?? id);
      log(
        state,
        `${source.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      const chosen = state.run?.encounter?.chosenCardType;
      if (!chosen) {
        log(state, `Reveal grip — no encounter card type chosen.`);
        return { ok: true };
      }
      const matches = grip.filter(
        (id) => state.cards[id]?.type === chosen,
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-trash",
          label: "Decline to trash",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const id of matches) {
        options.push({
          id: `trash-grip:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do",
            action: { kind: "trash_grip_card", cardId: id },
          },
        });
      }
      if (matches.length === 0) {
        log(
          state,
          `${source.title} — no revealed ${chosen} cards to trash.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may trash 1 revealed ${chosen}.`,
});
      return { ok: true };
    }

case "reveal_may_advance": {
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
          id: `fg-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "focus_group_after_type" as const,
              cardType: t,
            },
          },
        })),
logLine: `${source.title} — choose a card type.`,
});
      return { ok: true };
    }

case "reveal_gain": {
      const subtype = action.subtype.toLowerCase();
      const inGrip = state.runner.hand.filter((id) =>
        (state.cards[id]?.subtypes ?? []).some(
          (s) => s.toLowerCase() === subtype,
        ),
      );
      if (inGrip.length === 0) {
        log(
          state,
          `Meeting of Minds — no ${subtype} cards in grip to reveal.`,
        );
        return { ok: true };
      }
      const gained = inGrip.length;
      state.runner.credits += gained;
      for (const id of inGrip) {
        state.cards[id]!.faceup = true;
      }
      log(
        state,
        `Meeting of Minds — reveal ${gained} ${subtype} card(s) in grip, gain ${gained}¢.`,
      );
      return { ok: true };
    }

case "may_reveal_shuffle_agendas_into_rd": {
      const max = Math.max(0, action.max);
      const creditsEach = action.creditsEach ?? 0;
      const agendas: string[] = [];
      for (const id of state.corp.hand) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      for (const id of state.corp.discardPile) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      if (agendas.length === 0 || max <= 0) {
        log(state, `Reveal/shuffle agendas into R&D — none available.`);
        return { ok: true };
      }
      // Offer sequential picks up to max (distinct).
      const offer = (remaining: number, exclude: string[]): EvalResult => {
        const left = agendas.filter((id) => !exclude.includes(id));
        if (remaining <= 0 || left.length === 0) {
          state.corp.deck.reverse();
          log(state, `Shuffle R&D after agenda reveal.`);
          return { ok: true };
        }
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: [
            {
              id: "done-agendas",
              label: "Done",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "corp", amount: 0 },
              },
            },
            ...left.map((id) => ({
              id: `shuffle-agenda:${id}`,
              label: `Reveal ${state.cards[id]!.title} and shuffle into R&D`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "reveal_shuffle_agenda_into_rd" as const,
                  cardId: id,
                  remainingAfter: remaining - 1,
                  exclude: [...exclude, id],
                  creditsEach,
                },
              },
            })),
          ],
logLine: `Reveal up to ${remaining} agenda(s) in HQ/Archives and shuffle into R&D.`,
});
        return { ok: true };
      };
      return offer(max, []);
    }

case "reveal_shuffle_agenda_into_rd": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "agenda") {
        log(state, `Reveal/shuffle agenda — not an agenda.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, action.cardId);
      state.corp.deck.push(action.cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      card.rezzed = false;
      const creditsEach = action.creditsEach ?? 0;
      if (creditsEach > 0) {
        state.corp.credits += creditsEach;
        log(
          state,
          `Reveal ${card.title}, gain ${creditsEach}¢ → ${state.corp.credits}¢, shuffle into R&D.`,
        );
      } else {
        log(state, `Reveal ${card.title} and shuffle into R&D.`);
      }
      if (action.remainingAfter <= 0) {
        state.corp.deck.reverse();
        return { ok: true };
      }
      const agendas: string[] = [];
      for (const id of state.corp.hand) {
        if (action.exclude.includes(id)) continue;
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      for (const id of state.corp.discardPile) {
        if (action.exclude.includes(id)) continue;
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      if (agendas.length === 0) {
        state.corp.deck.reverse();
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-agendas",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...agendas.map((id) => ({
            id: `shuffle-agenda:${id}`,
            label: `Reveal ${state.cards[id]!.title} and shuffle into R&D`,
            effect: {
              op: "do" as const,
              action: {
                kind: "reveal_shuffle_agenda_into_rd" as const,
                cardId: id,
                remainingAfter: action.remainingAfter - 1,
                exclude: [...action.exclude, id],
                creditsEach,
              },
            },
          })),
        ],
      });
      return { ok: true };
    }

case "reveal_hq_subtype_install_and_rez_ignore_costs": {
      const subtype = action.subtype.toLowerCase();
      const iceInHq = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "ice" &&
          (c.subtypes ?? []).some((s) => s.toLowerCase() === subtype)
        );
      });
      const servers = Object.values(state.servers);
      if (iceInHq.length === 0 || servers.length === 0) {
        log(
          state,
          `Reveal HQ ${action.subtype} — none in HQ (or no server).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const iceId of iceInHq) {
        for (const server of servers) {
          options.push({
            id: `bb-ice:${iceId}:${server.id}`,
            label: `Reveal, install and rez ${state.cards[iceId]!.title} protecting ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_and_rez_hq_ice_protecting_server_ignore_costs",
                cardId: iceId,
                serverId: server.id,
              },
            },
          });
        }
        // Also allow creating a new remote.
        options.push({
          id: `bb-ice:${iceId}:new-remote`,
          label: `Reveal, install and rez ${state.cards[iceId]!.title} protecting a new remote`,
          effect: {
            op: "do",
            action: {
              kind: "install_and_rez_hq_ice_protecting_server_ignore_costs",
              cardId: iceId,
              serverId: "new-remote",
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Reveal a ${action.subtype} from HQ; install and rez ignoring all costs.`,
});
      return { ok: true };
    }

case "reveal_agenda_hq_or_archives_gain_ap_shuffle": {
      const agendas: string[] = [];
      for (const id of state.corp.hand) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      for (const id of state.corp.discardPile) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      if (agendas.length === 0) {
        log(state, `${source.title} — no agenda in HQ or Archives to reveal.`);
        return { ok: true };
      }
      const finish = (cardId: string): EvalResult => {
        const card = state.cards[cardId];
        if (!card || card.type !== "agenda") {
          log(state, `Reveal agenda — not an agenda.`);
          return { ok: true };
        }
        removeCardFromCurrentZone(state, cardId);
        state.corp.deck.push(cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        card.rezzed = false;
        const ap = card.agendaPoints ?? 0;
        state.corp.credits += ap;
        state.corp.deck.reverse();
        log(
          state,
          `Reveal ${card.title}, gain ${ap}¢ → ${state.corp.credits}¢, shuffle into R&D.`,
        );
        return { ok: true };
      };
      if (agendas.length === 1) return finish(agendas[0]!);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `drudge-agenda:${id}`,
          label: `Reveal ${state.cards[id]!.title} (gain ${state.cards[id]!.agendaPoints ?? 0}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "reveal_shuffle_agenda_into_rd" as const,
              cardId: id,
              remainingAfter: 0,
              exclude: [id],
              creditsEach: state.cards[id]!.agendaPoints ?? 0,
            },
          },
        })),
logLine: `${source.title} — choose an agenda in HQ or Archives to reveal.`,
});
      return { ok: true };
    }

case "reveal_top_stack_may_install_program_or_hardware": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Reveal top of stack — empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      card.faceup = true;
      log(state, `Reveal top of stack — ${card.title}.`);
      if (card.type !== "program" && card.type !== "hardware") {
        card.faceup = false;
        log(
          state,
          `${card.title} is not a program or hardware — leave on top.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-install",
            label: `Leave ${card.title} on top of stack`,
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: `install-top:${top}`,
            label: `Install ${card.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_stack_card" as const,
                cardId: top,
                discount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may install revealed ${card.title} from stack.`,
});
      return { ok: true };
    }

case "reveal_top_rd_corp_may_draw": {
      if (state.corp.deck.length === 0) {
        log(state, `${source.title} — R&D empty.`);
        return { ok: true };
      }
      // Deck top is index 0 (commitDraw shifts); the bottom is the last card.
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      top.faceup = true;
      log(state, `${source.title} — reveal top of R&D: ${top.title}.`);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "draw",
            label: `Draw ${top.title}`,
            effect: {
              op: "do",
              action: { kind: "draw_top_rd_to_hand" as const },
            },
          },
          {
            id: "decline",
            label: "Leave on top",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      });
      return { ok: true };
    }

case "reveal_grip": {
      const titles = state.runner.hand.map((id) => state.cards[id]!.title);
      log(
        state,
        `${source.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      return { ok: true };
    }

case "reveal_grip_may_trash_one": {
      if (state.runner.hand.length === 0) {
        log(state, `${source.title} — grip empty.`);
        return { ok: true };
      }
      const titles = state.runner.hand.map((id) => state.cards[id]!.title);
      log(
        state,
        `${source.title} — reveal grip: ${titles.join(", ")}.`,
      );
      if (state.runner.hand.length === 1) {
        return applyPrimitive(ctx, {
          kind: "trash_from_grip",
          cardId: state.runner.hand[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.runner.hand.map((id) => ({
          id: `trash-grip:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_from_grip" as const, cardId: id },
          },
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

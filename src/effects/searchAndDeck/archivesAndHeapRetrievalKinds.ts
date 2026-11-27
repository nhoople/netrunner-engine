/**
 * Primitive kinds for adding cards from Archives or the heap to a hand or
 * deck. The kind registry (`applyCoreKinds`) dispatches here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import {
  offerRdArrangeChoice,
  evalEffect,
  applyPrimitive,
  noteSearchConditionalAbilities,
  addFoundStackCardAfterSearch,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { type Effect, fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { shuffleRunnerStack } from "../install/runnerInstall.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { CR } from "../../timing/labels.js";
import { offerSiStackArrangeChoice } from "./deckOrderKinds.js";
import { shuffleInPlace, pickRandomSubset } from "../../state/rng.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";

function facedownArchivesIds(state: EffectCtx["state"]): string[] {
  return state.corp.discardPile.filter((id: string) => {
    const c = state.cards[id];
    return c && !c.faceup;
  });
}

export function countRezzedNextIce(state: EffectCtx["state"]): number {
  let n = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const c = state.cards[id];
      if (c?.rezzed && (c.subtypes ?? []).includes("next")) n += 1;
    }
  }
  return n;
}

export function applyArchivesAndHeapRetrievalKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "cultivate_hq_looked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Cultivate HQ — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      const card = state.cards[cardId]!;
      card.zone = "corp:hq";
      card.faceup = false;
      state.corp.hand.push(cardId);
      log(state, `Cultivate — add a looked card to HQ.`);
      if (state.turn.rdLookedCards.length === 0) {
        return { ok: true };
      }
      return offerRdArrangeChoice(state, sourceId);
    }

    case "archives_to_hq": {
      // The Corp may look at every card in Archives (CR 4.4.6c) and
      // chooses which to add (CR 1.15.2).
      if (state.corp.discardPile.length === 0) {
        log(state, `Add a card from Archives to HQ — Archives is empty.`);
        return { ok: true };
      }
      return evalEffect(
        ctx,
        chooseCards({
          chooser: "corp",
          candidates: [...state.corp.discardPile],
          count: action.amount,
          purpose: "archives_to_hq",
        }),
      );
    }

    case "deja_vu_from_heap": {
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        log(state, `${source.title} — heap empty.`);
        return { ok: true };
      }
      const viruses = heap.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("virus"),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const id of heap) {
        options.push({
          id: `deja1:${id}`,
          label: `Add ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "deja_vu_add_heap_cards" as const,
              cardIds: [id],
            },
          },
        });
      }
      for (let i = 0; i < viruses.length; i++) {
        for (let j = i + 1; j < viruses.length; j++) {
          const a = viruses[i]!;
          const b = viruses[j]!;
          options.push({
            id: `deja2:${a}:${b}`,
            label: `Add ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "deja_vu_add_heap_cards" as const,
                cardIds: [a, b],
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source.title} — add 1 card (or up to 2 virus cards) from heap to grip.`,
      });
      return { ok: true };
    }

    case "deja_vu_add_heap_cards": {
      for (const id of action.cardIds) {
        const idx = state.runner.discardPile.indexOf(id);
        if (idx < 0) continue;
        state.runner.discardPile.splice(idx, 1);
        state.runner.hand.push(id);
        state.cards[id]!.zone = "runner:grip";
        state.cards[id]!.faceup = false;
        log(state, `Add ${state.cards[id]!.title} from heap to grip.`);
      }
      return { ok: true };
    }

    case "meeting_of_minds_fetch": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.deck.includes(action.cardId)) {
        shuffleRunnerStack(state);
        return applyPrimitive(ctx, {
          kind: "reveal_gain",
          subtype: action.subtype,
        });
      }
      state.runner.deck = state.runner.deck.filter(
        (id) => id !== action.cardId,
      );
      state.runner.hand.push(action.cardId);
      card.zone = "runner:grip";
      card.faceup = true;
      shuffleRunnerStack(state);
      revealCards(state, [card.id], sourceId);
      log(state, `Meeting of Minds — reveal ${card.title} and add to grip.`);
      return applyPrimitive(ctx, {
        kind: "reveal_gain",
        subtype: action.subtype,
      });
    }

    case "add_facedown_archives_to_hq_per_advancement": {
      const n = source.advancementCounters ?? 0;
      if (n <= 0) {
        log(state, `Defense Construct — no advancement counters.`);
        return { ok: true };
      }
      const facedown = facedownArchivesIds(state);
      if (facedown.length === 0) {
        log(state, `Defense Construct — no facedown Archives cards.`);
        return { ok: true };
      }
      const take = Math.min(n, facedown.length);
      return evalEffect(
        ctx,
        fx.do({
          kind: "pick_facedown_archives",
          remaining: take,
          cardIds: facedown,
        }),
      );
    }

    case "pick_facedown_archives": {
      const remaining = action.remaining ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && state.corp.discardPile.includes(id) && !c.faceup;
      });
      if (remaining <= 0 || cardIds.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cardIds.map((id) => ({
          id: `hq:${id}`,
          label: `Add facedown Archives card to HQ`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "move_archives_to_hq", cardId: id }),
              fx.do({
                kind: "pick_facedown_archives",
                remaining: remaining - 1,
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "move_archives_to_hq": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.discardPile.includes(cardId)) {
        return { ok: true };
      }
      if (action.reveal) revealCards(state, [cardId], sourceId);
      removeCardFromCurrentZone(state, cardId);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(
        state,
        action.reveal
          ? `Reveal ${card.title} and add it from Archives to HQ (CR ${CR.reveal.number}).`
          : `${state.cards[sourceId]?.title ?? sourceId} — add a card from Archives to HQ.`,
      );
      return { ok: true };
    }

    case "may_add_operation_from_archives_to_hq": {
      const ops = state.corp.discardPile.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Clone Suffrage Movement — no operation in Archives.`);
        return { ok: true };
      }
      if (ops.length === 1) {
        return applyArchivesAndHeapRetrievalKinds(ctx, {
          kind: "add_operation_from_archives_to_hq_resolve",
          cardId: ops[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ops.map((cardId) => ({
          id: `csm:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to HQ`,
          effect: fx.do({
            kind: "add_operation_from_archives_to_hq_resolve",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "add_operation_from_archives_to_hq_resolve": {
      const cardId = action.cardId;
      if (!state.corp.discardPile.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      if (!card.faceup) {
        revealCards(state, [card.id], sourceId);
        log(state, `Reveal ${card.title} (CR ${CR.revealFromHidden.number}).`);
      }
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(
        state,
        `Clone Suffrage Movement — add ${card.title} from Archives to HQ.`,
      );
      return { ok: true };
    }
    case "si_stack_done_trashing": {
      return offerSiStackArrangeChoice(ctx);
    }

    case "cotc_next_sapphire_archives_to_hq": {
      const x = countRezzedNextIce(state);
      const archives = [...state.corp.discardPile];
      if (x <= 0 || archives.length === 0) {
        log(state, `NEXT Sapphire — add 0 from Archives (X=${x}).`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...archives.map((id) => ({
            id: `sapphire-arch:${id}`,
            label: `Add ${state.cards[id]!.title} to HQ`,
            effect: fx.do({
              kind: "pick_next_sapphire_archives",
              cardId: id,
              remaining: Math.min(x, archives.length) - 1,
            }),
          })),
          {
            id: "sapphire-arch-done",
            label: "Done",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "pick_next_sapphire_archives": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      const card = state.cards[cardId];
      if (card && state.corp.discardPile.includes(cardId)) {
        state.corp.discardPile = state.corp.discardPile.filter(
          (id) => id !== cardId,
        );
        state.corp.hand.push(cardId);
        card.zone = "corp:hq";
        // Not revealed: a card in HQ is neither faceup nor facedown (CR 1.21.1a).
        card.faceup = false;
        log(state, `NEXT Sapphire — add ${card.title} from Archives to HQ.`);
      }
      if (remaining <= 0) return { ok: true };
      const archives = [...state.corp.discardPile];
      if (archives.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...archives.map((id) => ({
            id: `sapphire-arch:${id}`,
            label: `Add ${state.cards[id]!.title} to HQ`,
            effect: fx.do({
              kind: "pick_next_sapphire_archives",
              cardId: id,
              remaining: remaining - 1,
            }),
          })),
          {
            id: "sapphire-arch-done",
            label: "Done",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "pick_next_sapphire_hq": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      const card = state.cards[cardId];
      if (card && state.corp.hand.includes(cardId)) {
        state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        state.corp.deck.push(cardId);
        shuffleInPlace(state, state.corp.deck);
        log(state, `NEXT Sapphire — shuffle ${card.title} into R&D.`);
      }
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      if (hq.length === 0) return { ok: true };
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
              remaining: remaining - 1,
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
    case "trade_in_record_hw": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "hardware") return { ok: true };
      const half = Math.floor((card.installCost ?? 0) / 2);
      trashCard(state, cardId);
      state.turn.tradeInCredits = half;
      log(state, `Trade-In — trashed ${card.title} for ${half}¢ (recorded).`);
      return { ok: true };
    }
    case "resolve_trade_in": {
      if (!action.cardIds) {
        const half = state.turn.tradeInCredits ?? 0;
        state.runner.credits += half;
        state.turn.tradeInCredits = undefined;
        log(state, `Trade-In — gain ${half}¢; search the stack for hardware.`);
        // A search of the stack: the Runner may find nothing, and the Corp
        // does not learn how many match (CR 8.7.2e, 10.2.2b).
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: state.runner.deck.filter(
              (id) => state.cards[id]?.type === "hardware",
            ),
            count: 1,
            search: true,
            purpose: "resume",
            label: "reveal and add to the grip",
            resume: { kind: "resolve_trade_in" },
          }),
        );
      }
      // "Shuffle your stack" whether or not a card was found (CR 8.7.3).
      const id = action.cardIds.find((cid) => state.runner.deck.includes(cid));
      if (!id) {
        shuffleRunnerStack(state);
        noteSearchConditionalAbilities(state);
        log(state, `Trade-In — no hardware found; shuffle the stack.`);
        return { ok: true };
      }
      addFoundStackCardAfterSearch(state, id);
      revealCards(state, [id], sourceId);
      return { ok: true };
    }
    case "tdatd_glut_cipher": {
      const archives = state.corp.discardPile;
      if (archives.length < 5) {
        log(
          state,
          `Glut Cipher — Archives has ${archives.length} cards (need 5); no effect.`,
        );
        return { ok: true };
      }
      // "the Corp adds exactly 5 cards from Archives to HQ": the Corp picks
      // them (CR 1.15.2).
      if (!action.cardIds) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: [...archives],
            count: 5,
            purpose: "resume",
            label: "add to HQ from Archives",
            resume: { kind: "tdatd_glut_cipher" },
          }),
        );
      }
      const moved = action.cardIds.filter((id) => archives.includes(id));
      for (const id of moved) {
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        const c = state.cards[id]!;
        c.zone = "corp:hq";
        c.faceup = false;
        c.rezzed = false;
        state.corp.hand.push(id);
      }
      log(
        state,
        `Glut Cipher — Corp adds ${moved.length} from Archives to HQ.`,
      );
      if (moved.length < 5) return { ok: true };
      // Trash 5 at random from HQ. They enter Archives facedown, so the
      // log does not name them (CR 4.4.6b).
      const trash = pickRandomSubset(state, state.corp.hand, 5);
      for (const id of trash) {
        // "They trash": the Corp carries it out (CR 1.14.5).
        // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
        trashCard(state, id, { by: "corp" });
      }
      log(state, `Glut Cipher — trash ${trash.length} from HQ at random.`);
      return { ok: true };
    }
    case "take_runner_deck_card_to_grip": {
      const cardId = action.cardId;
      const idx = state.runner.deck.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.runner.deck.splice(idx, 1);
      state.runner.hand.push(cardId);
      state.cards[cardId]!.zone = "runner:grip";
      log(state, `Search stack — ${state.cards[cardId]!.title} to grip.`);
      return { ok: true };
    }
    case "reclamation_order_archives_to_hq": {
      // Printed: name a card, then add any number of copies of it from
      // Archives to HQ — not the whole Archives.
      const byDef = new Map<string, string[]>();
      for (const id of state.corp.discardPile) {
        const c = state.cards[id];
        if (!c?.defId || c.defId === state.cards[sourceId]?.defId) continue;
        const list = byDef.get(c.defId) ?? [];
        list.push(id);
        byDef.set(c.defId, list);
      }
      if (byDef.size === 0) {
        log(state, `Reclamation Order — no nameable card in Archives.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const [defId, ids] of byDef) {
        for (let k = 1; k <= ids.length; k++) {
          options.push({
            id: `reclaim:${defId}:${k}`,
            label: `Add ${k}× ${state.cards[ids[0]!]!.title} to HQ`,
            effect: fx.do({
              kind: "take_reclamation_copies_to_hq",
              defId,
              amount: k,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "take_reclamation_copies_to_hq": {
      const copies = state.corp.discardPile.filter(
        (id) => state.cards[id]?.defId === action.defId,
      );
      const take = copies.slice(0, Math.max(0, action.amount ?? 0));
      for (const id of take) {
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
        state.cards[id]!.faceup = true; // revealed
      }
      log(
        state,
        `Reclamation Order — ${take.length} cop${take.length === 1 ? "y" : "ies"} from Archives to HQ.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

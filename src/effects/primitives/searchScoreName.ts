/** The Spaces Between (tsb) Lunar pack primitives. */
import { revealCards } from "../../state/visibility/reveal.js";
import { loadCardCatalog } from "../../cards/load.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { autoResolveTrace } from "../../state/trace.js";
import type { RuleCite } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { chooseCards } from "../chooseCards.js";
import {
  applyPrimitive,
  evalEffect,
  shuffleCorpRdAfterSearch,
} from "../eval.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarTsbPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "search_foundry_copy_to_hq": {
      if (state.turn.rdLookedCards.length > 0) {
        for (const id of [...state.turn.rdLookedCards]) {
          const card = state.cards[id];
          if (!card) continue;
          card.zone = "corp:rd";
          card.faceup = false;
          state.corp.deck.push(id);
        }
        state.turn.rdLookedCards = [];
        log(
          state,
          `Looked cards return to R&D and can no longer be acted on (CR ${CR.objectMoveLocation.number}).`,
        );
      }
      if ((state.turn.iceRezzedThisTurn ?? 0) !== 1) return { ok: true };
      const lastId = state.turn.rezzedThisTurnIds?.at(-1);
      if (!lastId) return { ok: true };
      const title = state.cards[lastId]?.title;
      if (!title) return { ok: true };
      // "You may search": the Corp may decline (CR 9.6.9c).
      if (!action.chosen) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: [
            {
              id: "search",
              label: `Search R&D for another ${title}`,
              effect: fx.do({
                kind: "search_foundry_copy_to_hq",
                chosen: true,
              }),
            },
            {
              id: "decline",
              label: "Do not search",
              effect: fx.do({
                kind: "search_foundry_copy_to_hq",
                chosen: true,
                declined: true,
                cardIds: [],
              }),
            },
          ],
        });
        return { ok: true };
      }
      // The Corp searches with the shared deck search: it may find nothing
      // even when R&D holds a copy, and the Runner cannot tell which
      // (CR 8.7.2e, 10.2.2b).
      if (!action.cardIds) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: state.corp.deck.filter(
              (id) => state.cards[id]?.title === title,
            ),
            count: 1,
            search: true,
            purpose: "resume",
            label: `add to HQ (another ${title})`,
            resume: { kind: "search_foundry_copy_to_hq", chosen: true },
          }),
        );
      }
      const found = action.cardIds.filter((id) => state.corp.deck.includes(id));
      for (const id of found) {
        state.corp.deck = state.corp.deck.filter((x) => x !== id);
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
        state.cards[id]!.faceup = false;
      }
      // "Shuffle R&D." is its own sentence: R&D is shuffled whether or not
      // the Corp searched or found a copy (decided 2026-11-21; CR 8.7.3).
      shuffleCorpRdAfterSearch(state);
      if (found.length > 0) {
        revealCards(state, found, sourceId);
        log(
          state,
          `The Foundry — reveal ${title} from R&D and add to HQ; shuffle R&D (CR ${CR.shuffleDeckAfterSearch.number}).`,
        );
      } else {
        log(
          state,
          action.declined
            ? `The Foundry — the Corp does not search; shuffle R&D.`
            : `The Foundry — no card found; shuffle R&D (CR ${CR.failToFind.number}, ${CR.shuffleDeckAfterSearch.number}).`,
        );
      }
      return { ok: true };
    }
    case "score_encrypted_portals_on": {
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (ice?.rezzed && (ice.subtypes ?? []).includes("code gate")) n += 1;
        }
      }
      if (n > 0) {
        state.corp.credits += n;
        log(state, `Encrypted Portals — gain ${n}¢ for rezzed code gates.`);
      }
      return { ok: true };
    }
    case "name_card": {
      // Printed: "Name a card." Any card in the pool may be named — not
      // just whichever cards happen to be in the game state.
      const defs = [...loadCardCatalog().values()]
        .filter((d) => d.type !== "identity")
        .sort((a, b) => a.title.localeCompare(b.title));
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: defs.map((d) => ({
          id: `tm:${d.id}`,
          label: `Name ${d.title}`,
          effect: fx.do({
            kind: "set_name",
            defId: d.id,
          }),
        })),
      });
      return { ok: true };
    }
    case "set_name": {
      const defId = (action as { defId: string }).defId;
      // The named card is remembered by the current itself, for as long
      // as it remains in the play area — not by turn state.
      const source = state.cards[sourceId];
      if (source) source.namedCardDefId = defId;
      log(state, `Targeted Marketing — named ${defId}.`);
      return { ok: true };
    }
    case "information_overload_encounter": {
      const r = autoResolveTrace(
        state,
        sourceId,
        1,
        fx.do({ kind: "give_tags", amount: 1 }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trash_per_tag": {
      // Each gained subroutine: "The Runner trashes 1 of their installed
      // cards" — the Runner chooses, one subroutine at a time.
      const tags = state.runner.tags;
      if (tags <= 0) {
        log(state, `Information Overload — Runner has no tags.`);
        return { ok: true };
      }
      return applyLunarTsbPrimitive(ctx, {
        kind: "trash_per_tag_continue",
        remaining: tags,
      });
    }
    case "trash_per_tag_continue": {
      const remaining = action.remaining ?? 0;
      const installed = [...state.runner.installed];
      if (remaining <= 0 || installed.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `io-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({ kind: "trash_own_installed", cardId: id }),
            fx.do({ kind: "trash_per_tag_continue", remaining: remaining - 1 }),
          ),
        })),
      });
      return { ok: true };
    }
    case "sealed_vault_store_from_pool": {
      // Printed: move *any number* of credits from the pool to this asset.
      const pool = state.corp.credits;
      if (pool <= 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: pool }, (_, i) => i + 1).map((n) => ({
          id: `sealed-store:${n}`,
          label: `Store ${n}¢ on Sealed Vault`,
          effect: fx.do({ kind: "move_credits_to_sealed_vault", amount: n }),
        })),
      });
      return { ok: true };
    }
    case "move_credits_to_sealed_vault": {
      const card = state.cards[sourceId];
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      if (!card || n <= 0) return { ok: true };
      state.corp.credits -= n;
      card.hostedCredits = (card.hostedCredits ?? 0) + n;
      log(state, `Sealed Vault — store ${n}¢ → ${card.hostedCredits}.`);
      return { ok: true };
    }
    case "take_to_pool": {
      // Printed: take *any number* of credits from this asset.
      const card = state.cards[sourceId];
      const hosted = card?.hostedCredits ?? 0;
      if (!card || hosted <= 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: hosted }, (_, i) => i + 1).map((n) => ({
          id: `sealed-take:${n}`,
          label: `Take ${n}¢ from Sealed Vault`,
          effect: fx.do({ kind: "move_credits_from_sealed_vault", amount: n }),
        })),
      });
      return { ok: true };
    }
    case "move_credits_from_sealed_vault": {
      const card = state.cards[sourceId];
      const n = Math.min(action.amount ?? 0, card?.hostedCredits ?? 0);
      if (!card || n <= 0) return { ok: true };
      card.hostedCredits = (card.hostedCredits ?? 0) - n;
      state.corp.credits += n;
      log(
        state,
        `Sealed Vault — take ${n}¢ to pool (${card.hostedCredits} hosted).`,
      );
      return { ok: true };
    }
    case "trash_will_o_wisp_breaker_used": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Do not trash Will-o'-the-Wisp",
            effect: fx.gainCredits("corp", 0),
          },
          {
            id: "trash",
            label:
              "Trash Will-o'-the-Wisp: an icebreaker used this run goes to the bottom of the stack",
            effect: fx.do({ kind: "resolve_will_o_wisp" }),
          },
        ],
      });
      return { ok: true };
    }
    case "resolve_will_o_wisp": {
      // "You may trash this upgrade. If you do, choose 1 installed
      // icebreaker that was used to break at least 1 subroutine during this
      // run. The Runner adds that icebreaker to the bottom of the stack."
      // The trash comes first; with no such icebreaker it is still trashed
      // (CR 1.2.1).
      const up = state.cards[sourceId];
      if (!up?.zone.startsWith("server:")) {
        log(
          state,
          `Will-o'-the-Wisp is no longer installed, so it cannot be trashed.`,
        );
        return { ok: true };
      }
      trashCard(state, sourceId, { by: "corp" });
      const used = (state.run?.breakersThatBroke ?? []).filter(
        (id) =>
          state.runner.installed.includes(id) &&
          (state.cards[id]?.subtypes ?? []).includes("icebreaker"),
      );
      if (used.length === 0) {
        log(state, `Will-o'-the-Wisp — no icebreaker was used this run.`);
        return { ok: true };
      }
      if (used.length === 1) {
        return applyPrimitive(ctx, {
          kind: "resolve_will_o_wisp_breaker",
          cardId: used[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: used.map((id) => ({
          id: `wow-breaker:${id}`,
          label: `${state.cards[id]!.title} to the bottom of the stack`,
          effect: fx.do({
            kind: "resolve_will_o_wisp_breaker",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }
    case "resolve_will_o_wisp_breaker": {
      const cardId = (action as { cardId: string }).cardId;
      if (state.runner.installed.includes(cardId)) {
        uninstallCard(state, cardId, "deck-bottom");
        log(
          state,
          `Will-o'-the-Wisp — the Runner adds ${state.cards[cardId]!.title} to the bottom of the stack.`,
        );
      }
      return { ok: true };
    }
    case "three_steps_ahead_payout": {
      // Per successful run, not per distinct server (printed text).
      const runs = state.turn.successfulRunCountThisTurn ?? 0;
      const gain = runs * 2;
      if (gain > 0) {
        state.runner.credits += gain;
        log(
          state,
          `Three Steps Ahead — gain ${gain}¢ (${runs} successful runs).`,
        );
      }
      return { ok: true };
    }
    default:
      return null;
  }
}

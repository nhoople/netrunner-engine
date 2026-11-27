/**
 * Primitive kinds for searching and shuffling decks. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { random, shuffleInPlace } from "../../state/rng.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { fx } from "../ir/fx.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/runnerCredits.js";
import {
  uninstallCard,
  removeCardFromGame,
} from "../../state/uninstallAndPosition/uninstall.js";
import { evalEffect, type EffectCtx, type EvalResult } from "../eval.js";
import { shuffleCorpRdAfterSearch } from "./searchAndArrange.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { corpCanInstallByAbility } from "../install/corpAbilityInstall.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { enterSetAside } from "../../state/zones.js";
import { CR } from "../../timing/labels.js";
import { bmCounter, setBmCounter } from "./deckOrderKinds.js";
import { getCardDef } from "../../cards/load.js";
import type { RuleCite } from "../../state/types/restrictions.js";
import { applyTurnAndActionKinds } from "../turnAndActions/turnAndActionKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function installedRunnerCardIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const id of state.runner.installed) {
    if (!state.cards[id]?.hostId) out.push(id);
  }
  for (const card of Object.values(state.cards)) {
    if (
      card.side === "runner" &&
      card.hostId &&
      !out.includes(card.id) &&
      state.runner.installed.includes(card.id)
    ) {
      out.push(card.id);
    }
  }
  return out;
}

function shuffleRunnerCardIntoStack(
  state: EffectCtx["state"],
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card) return;
  uninstallCard(state, cardId, "deck-shuffle", {
    logLine: `Shuffle ${card.title} into the stack.`,
  });
}

function moveHeapCardToStack(state: EffectCtx["state"], cardId: string): void {
  state.runner.discardPile = state.runner.discardPile.filter(
    (id) => id !== cardId,
  );
  const c = state.cards[cardId]!;
  c.zone = "runner:stack";
  c.faceup = false;
  state.runner.deck.push(cardId);
}

function offerHeapShufflePick(ctx: EffectCtx, remaining: number): PrimResult {
  const { state, sourceId } = ctx;
  const heap = [...state.runner.discardPile];
  if (remaining <= 0 || heap.length === 0) {
    shuffleInPlace(state, state.runner.deck);
    state.turn.moHeapShuffleRemaining = undefined;
    return { ok: true };
  }
  state.turn.moHeapShuffleRemaining = remaining;
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: heap.map((cardId) => ({
      id: `mo-shuffle:${cardId}`,
      label: `Shuffle ${state.cards[cardId]!.title} into stack`,
      effect: fx.do({ kind: "shuffle_heap_pick", cardId }),
    })),
  });
  return { ok: true };
}

export function applySearchAndShuffleKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "shuffle_all_grip_into_stack": {
      const grip = [...state.runner.hand];
      state.runner.hand = [];
      for (const id of grip) {
        const c = state.cards[id];
        if (!c) continue;
        c.zone = "runner:stack";
        state.runner.deck.push(id);
      }
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(state, `Runner shuffles grip into stack (${grip.length} card(s)).`);
      return { ok: true };
    }

    case "search_kabonesa_install": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return c?.type === "program" && !(c.subtypes ?? []).includes("virus");
      });
      if (matches.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `${source?.title ?? "Kabonesa Wu"} — no non-virus program.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `kabonesa:${id}`,
          label: `Install ${state.cards[id]!.title} (−1¢)`,
          effect: fx.do({
            kind: "install_kabonesa_resolve",
            cardId: id,
          }),
        })),
        logLine: `${source?.title ?? "Kabonesa Wu"} — search stack.`,
      });
      return { ok: true };
    }

    case "search_emergent_install": {
      const matches = state.runner.deck.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (matches.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `Emergent Creativity — no program/hardware in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `emergent:${id}`,
          label: `Install ${state.cards[id]!.title} (−${action.discount}¢)`,
          effect: fx.do({
            kind: "install_emergent_resolve",
            cardId: id,
            discount: action.discount,
          }),
        })),
      });
      return { ok: true };
    }

    case "shuffle_distract_archives": {
      const arch = [...state.corp.discardPile];
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "shuffle-0",
          label: "Shuffle 0 from Archives into R&D",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const id of arch) {
        options.push({
          id: `sh1:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "shuffle_distract_one",
            cardId: id,
            remainingAfter: action.remaining - 1,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "shuffle_distract_one": {
      const id = action.cardId;
      if (state.corp.discardPile.includes(id)) {
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
        log(
          state,
          `Distract the Masses — shuffle ${state.cards[id]!.title} into R&D.`,
        );
      }
      // Shuffle deck after adds
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      if (action.remainingAfter > 0) {
        return (
          applySearchAndShuffleKinds(ctx, {
            kind: "shuffle_distract_archives",
            remaining: action.remainingAfter,
          }) ?? { ok: true }
        );
      }
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

    case "search_rd_for_any_subtype_to_hq": {
      const want = (action.subtypes ?? []).map((s) => s.toLowerCase());
      const matches = state.corp.deck.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        return (c.subtypes ?? []).some((s) => want.includes(s.toLowerCase()));
      });
      if (matches.length === 0) {
        shuffleInPlace(state, state.corp.deck);
        log(
          state,
          `${source?.title ?? "Executive Search Firm"} — no matching card in R&D; shuffle.`,
        );
        return { ok: true };
      }
      if (matches.length === 1) {
        return applySearchAndShuffleKinds(ctx, {
          kind: "search_rd_subtype_to_hq_resolve",
          cardId: matches[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: matches.map((cardId) => ({
          id: `esf:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to HQ`,
          effect: fx.do({
            kind: "search_rd_subtype_to_hq_resolve",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "search_rd_subtype_to_hq_resolve": {
      const cardId = action.cardId;
      if (!state.corp.deck.includes(cardId)) {
        shuffleInPlace(state, state.corp.deck);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      shuffleInPlace(state, state.corp.deck);
      revealCards(state, [card.id], sourceId);
      log(
        state,
        `${source?.title ?? "Executive Search Firm"} — reveal ${card.title}, add to HQ; shuffle R&D.`,
      );
      return { ok: true };
    }
    case "search_crypt_install": {
      const candidates = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return c?.type === "program" && (c.subtypes ?? []).includes("virus");
      });
      if (candidates.length === 0) {
        shuffleInPlace(state, state.runner.deck);
        log(state, `Crypt — no virus program in stack; shuffle.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `crypt-install:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "install_crypt_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "shuffle_white_hat_one": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      const card = state.cards[cardId];
      if (card && state.corp.hand.includes(cardId)) {
        state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        state.corp.deck.push(cardId);
        shuffleInPlace(state, state.corp.deck);
        log(state, `White Hat — shuffle ${card.title} into R&D.`);
      }
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      if (hq.length === 0) return { ok: true };
      const opts: { id: string; label: string; effect: Effect }[] = hq.map(
        (id) => ({
          id: `wh-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "shuffle_white_hat_one",
            cardId: id,
            remaining: remaining - 1,
          }),
        }),
      );
      opts.push({
        id: "wh-done",
        label: "Done",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: opts,
      });
      return { ok: true };
    }

    case "shuffle_n_installed_runner_into_stack": {
      const amount = (action as { amount?: number }).amount ?? 2;
      const installed = installedRunnerCardIds(state);
      if (installed.length < amount) {
        return {
          ok: false,
          error: `Degree Mill steal requires ${amount} installed Runner cards.`,
          cites: [],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `degree:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: fx.do({
            kind: "shuffle_installed_pick",
            cardId: id,
            remaining: amount - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "shuffle_installed_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      shuffleRunnerCardIntoStack(state, cardId);
      if (remaining <= 0) return { ok: true };
      const installed = installedRunnerCardIds(state);
      if (installed.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `degree:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: fx.do({
            kind: "shuffle_installed_pick",
            cardId: id,
            remaining: remaining - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "search_rd_or_archives_agenda_to_bottom_rd": {
      const fromRd = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      const fromArch = state.corp.discardPile.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const id of fromRd) {
        opts.push({
          id: `shannon-rd:${id}`,
          label: `R&D: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_agenda_to_bottom_rd",
            cardId: id,
            shuffledRd: true,
          }),
        });
      }
      for (const id of fromArch) {
        opts.push({
          id: `shannon-arch:${id}`,
          label: `Archives: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_agenda_to_bottom_rd",
            cardId: id,
            shuffledRd: false,
          }),
        });
      }
      if (opts.length === 0) {
        log(state, `${source?.title ?? "Shannon Claire"} — no agenda found.`);
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts });
      return { ok: true };
    }

    case "shuffle_trash_top_gain_install_cost": {
      const deck = [...state.runner.deck];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      state.runner.deck = deck;
      const top = state.runner.deck.shift();
      if (!top) {
        log(state, `Windfall — stack empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      const gainAmt = card.installCost ?? 0;
      trashCard(state, top, { by: "runner" });
      state.runner.credits += gainAmt;
      log(
        state,
        `Windfall — trash ${card.title}, gain ${gainAmt}¢ (install cost).`,
      );
      return { ok: true };
    }

    case "search_stack_type_add_to_grip": {
      const typ = action.cardType;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.type === typ,
      );
      if (matches.length === 0) {
        shuffleInPlace(state, state.runner.deck);
        log(state, `Search stack for ${typ} — none found; shuffle.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `stack-type:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_stack_type_add_to_grip_pick" as const,
              cardId: id,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "search_stack_type_add_to_grip_pick": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        return {
          ok: false,
          error: "Search stack — card not in stack.",
          cites: [],
        };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.hand.push(cardId);
      card.zone = "runner:grip";
      shuffleInPlace(state, state.runner.deck);
      revealCards(state, [card.id], sourceId);
      log(state, `Reveal ${card.title}; add to grip; shuffle stack.`);
      return { ok: true };
    }

    case "search_stack_install": {
      const types = new Set(["program", "resource", "hardware"]);
      const cands = state.runner.deck.filter((id) =>
        types.has(state.cards[id]?.type ?? ""),
      );
      if (cands.length === 0) {
        log(state, `Artist Colony — no program/resource/hardware in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `artist-install:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "install_from_stack",
            cardId: id,
          }),
        })),
        logLine: `Artist Colony — search stack to install.`,
      });
      return { ok: true };
    }

    case "shuffle_one_archives_into_rd": {
      const arch = [...state.corp.discardPile];
      if (arch.length === 0) {
        log(state, `Museum of History — Archives empty.`);
        return { ok: true };
      }
      if (arch.length === 1) {
        const id = arch[0]!;
        state.corp.discardPile = [];
        state.corp.deck.push(id);
        const c = state.cards[id]!;
        c.zone = "corp:rd";
        c.faceup = false;
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.corp.deck[i]!;
          state.corp.deck[i] = state.corp.deck[j]!;
          state.corp.deck[j] = tmp;
        }
        log(state, `Museum of History — shuffle ${c.title} into R&D.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: arch.map((id) => ({
          id: `museum-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "shuffle_archives_card_into_rd",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "shuffle_archives_card_into_rd": {
      const id = action.cardId;
      if (!state.corp.discardPile.includes(id)) return { ok: true };
      state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
      state.corp.deck.push(id);
      const c = state.cards[id]!;
      c.zone = "corp:rd";
      c.faceup = false;
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      log(state, `Museum of History — shuffle ${c.title} into R&D.`);
      return { ok: true };
    }

    case "shuffle_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Alexa Belsky — HQ empty.`);
        return { ok: true };
      }
      // Runner may pay 2¢ per card to trash instead of shuffle.
      const maxPrevent = Math.floor(state.runner.credits / 2);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= Math.min(maxPrevent, hq.length); n++) {
        options.push({
          id: `alexa:${n}`,
          label:
            n === 0
              ? "Decline (shuffle all HQ into R&D)"
              : `Pay ${n * 2}¢: trash ${n} random HQ instead of shuffling`,
          effect: fx.do({
            kind: "shuffle_resolve",
            amount: n,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "shuffle_resolve": {
      const prevent = action.amount ?? 0;
      const hq = [...state.corp.hand];
      if (prevent > 0) {
        const cost = prevent * 2;
        if (state.runner.credits < cost) {
          log(state, `Alexa Belsky — Runner cannot afford prevent.`);
        } else {
          subtractRunnerCreditPool(state, cost);
          // Trash prevent random cards from HQ instead of shuffling them.
          const shuffled = [...hq];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(random(state) * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
          }
          const toTrash = shuffled.slice(0, prevent);
          const toShuffle = shuffled.slice(prevent);
          for (const id of toTrash) {
            // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
            trashCard(state, id, { by: controllerOf(state, sourceId) });
            const c = state.cards[id];
            if (c) {
              c.faceup = false;
            }
          }
          for (const id of toShuffle) {
            state.corp.hand = state.corp.hand.filter((x) => x !== id);
            state.corp.deck.unshift(id);
            const c = state.cards[id];
            if (c) {
              c.zone = "corp:rd";
              c.faceup = false;
            }
          }
          // Shuffle R&D
          for (let i = state.corp.deck.length - 1; i > 0; i--) {
            const j = Math.floor(random(state) * (i + 1));
            [state.corp.deck[i], state.corp.deck[j]] = [
              state.corp.deck[j]!,
              state.corp.deck[i]!,
            ];
          }
          log(
            state,
            `Alexa Belsky — Runner pays ${cost}¢; trash ${toTrash.length}; shuffle ${toShuffle.length} into R&D.`,
          );
          return { ok: true };
        }
      }
      // Shuffle all HQ into R&D
      for (const id of hq) {
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        state.corp.deck.unshift(id);
        const c = state.cards[id];
        if (c) {
          c.zone = "corp:rd";
          c.faceup = false;
        }
      }
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [state.corp.deck[i], state.corp.deck[j]] = [
          state.corp.deck[j]!,
          state.corp.deck[i]!,
        ];
      }
      log(state, `Alexa Belsky — shuffle ${hq.length} HQ card(s) into R&D.`);
      return { ok: true };
    }

    case "shuffle_because_i_can_root": {
      const serverId = state.run?.attackedServerId;
      if (!serverId) {
        log(state, `Because I Can — no attacked server.`);
        return { ok: true };
      }
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      const root = [...server.root];
      for (const id of root) uninstallCard(state, id, "deck-bottom");
      shuffleInPlace(state, state.corp.deck);
      log(
        state,
        `Because I Can — shuffle ${root.length} card(s) from ${serverId} root into R&D.`,
      );
      return { ok: true };
    }

    case "shuffle_sadaka": {
      const cardIds = (action as { cardIds: string[] }).cardIds;
      state.corp.deck = [...cardIds, ...state.corp.deck];
      shuffleInPlace(state, state.corp.deck);
      log(state, `Sadaka — shuffle R&D.`);
      return { ok: true };
    }
    case "search_compile": {
      const zoneIds =
        action.zone === "stack" ? state.runner.deck : state.runner.discardPile;
      const programs = zoneIds.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Compile — no program in ${action.zone}.`);
        if (action.zone === "stack") shuffleInPlace(state, state.runner.deck);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `compile:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring costs`,
          effect: fx.do({
            kind: "install_compile_resolve",
            cardId: id,
            zone: action.zone,
          }),
        })),
      });
      return { ok: true };
    }
    case "search_stack_copies_to_heap": {
      const lastInstallId = state.turn.installedThisTurn.at(-1);
      const installed = lastInstallId ? state.cards[lastInstallId] : null;
      if (!installed?.defId) {
        log(state, `Paige Piper — no install this turn to search for.`);
        return { ok: true };
      }
      const defId = installed.defId;
      const copies = state.runner.deck.filter(
        (id) => state.cards[id]?.defId === defId,
      );
      if (copies.length === 0) {
        log(state, `Paige Piper — no copies of ${installed.title} in stack.`);
        // Still shuffle.
        // Fisher-Yates via existing shuffle if available — simple reverse+sort ok for test.
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        return { ok: true };
      }
      // "any number of copies": the Runner says how many (CR 1.15.2).
      if (!action.cardIds) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: copies,
            count: copies.length,
            upTo: true,
            purpose: "resume",
            label: "add to the heap from the stack",
            resume: { kind: "search_stack_copies_to_heap" },
          }),
        );
      }
      const taken = action.cardIds.filter((id) => copies.includes(id));
      for (const id of taken) {
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        trashCard(state, id);
      }
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(
        state,
        `Paige Piper — add ${taken.length} copy/copies of ${installed.title} to heap; shuffle stack.`,
      );
      return { ok: true };
    }

    case "shuffle_jinteki_biotech_archives_into_rd": {
      const arch = [...state.corp.discardPile];
      state.corp.discardPile = [];
      for (const id of arch) {
        const c = state.cards[id];
        if (!c) continue;
        c.zone = "corp:rd";
        c.faceup = false;
        state.corp.deck.push(id);
      }
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      log(
        state,
        `Jinteki Biotech (Agriculture) — shuffle ${arch.length} Archives card(s) into R&D.`,
      );
      return { ok: true };
    }

    case "search_rd_asset_install": {
      // Tech Startup: search R&D for an asset, reveal it, and install it.
      // Shuffle R&D. A search with a criterion may find nothing
      // (CR 8.7.2e), so the Corp can stop without a card.
      // Only an asset the Corp can install may be found (CR 8.7.2b). Copies
      // of one card answer the same, so each title is tried once.
      const installableByDef = new Map<string, boolean>();
      const assets = state.corp.deck.filter((id) => {
        const card = state.cards[id];
        if (card?.type !== "asset") return false;
        const key = card.defId ?? id;
        let ok = installableByDef.get(key);
        if (ok === undefined) {
          ok = corpCanInstallByAbility(state, id);
          installableByDef.set(key, ok);
        }
        return ok;
      });
      if (!action.cardIds && assets.length > 0) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: assets,
            count: 1,
            upTo: true,
            purpose: "resume",
            label: "reveal and install",
            resume: { kind: "search_rd_asset_install" },
          }),
        );
      }
      const pick = (action.cardIds ?? []).find((id) => assets.includes(id));
      // The found card is set aside facedown while the deck is shuffled
      // (CR 8.7.2, 4.8.4); the shuffle comes before the card is acted on
      // (CR 8.7.3).
      if (pick) {
        removeCardFromCurrentZone(state, pick);
        enterSetAside(state, [pick], { side: "corp", faceup: false });
      }
      shuffleInPlace(state, state.corp.deck);
      const title = source?.title ?? "Tech Startup";
      if (!pick) {
        log(
          state,
          `${title} — no asset found; shuffle R&D (CR ${CR.failToFind.number}, ${CR.shuffleDeckAfterSearch.number}).`,
        );
        return { ok: true };
      }
      log(
        state,
        `${title} — find an asset; shuffle R&D (CR ${CR.shuffleDeckAfterSearch.number}).`,
      );
      // Found cards are revealed when the ability resumes (CR 8.7.2c), to
      // both players (CR 1.21.3).
      revealCards(state, [pick], sourceId);
      // The Corp picks the destination through the normal install
      // process (CR 8.5.16b).
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "install_corp_card", cardId: pick },
      });
    }
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
    case "shuffle_n_heap_cards_into_stack": {
      const amount = Math.max(0, action.amount);
      const heap = [...state.runner.discardPile];
      if (amount <= 0 || heap.length === 0) {
        log(
          state,
          `${source?.title ?? "Labor Rights"} — no heap cards to shuffle.`,
        );
        return { ok: true };
      }
      const n = Math.min(amount, heap.length);
      if (heap.length <= n) {
        for (const id of heap) moveHeapCardToStack(state, id);
        shuffleInPlace(state, state.runner.deck);
        log(
          state,
          `${source?.title ?? "Labor Rights"} — shuffle all ${heap.length} heap card(s) into stack.`,
        );
        return { ok: true };
      }
      log(
        state,
        `${source?.title ?? "Labor Rights"} — choose ${n} heap card(s) to shuffle.`,
      );
      return offerHeapShufflePick(ctx, n);
    }

    case "shuffle_heap_pick": {
      const cardId = action.cardId;
      const remaining = state.turn.moHeapShuffleRemaining ?? 0;
      if (!state.runner.discardPile.includes(cardId) || remaining <= 0) {
        log(state, `Shuffle heap — invalid pick.`);
        return { ok: true };
      }
      moveHeapCardToStack(state, cardId);
      log(state, `Shuffle ${state.cards[cardId]!.title} into stack.`);
      return offerHeapShufflePick(ctx, remaining - 1);
    }
    case "search_stack_take_to_grip": {
      const cands = [...state.runner.deck];
      if (cands.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.slice(0, 20).map((id) => ({
          id: `st:${id}`,
          label: `Take ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "take_runner_deck_card_to_grip", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "shuffle_any_hq_draw": {
      const hand = [...state.corp.hand];
      const shuffled = bmCounter(source, "bmShuffled");
      if (hand.length === 0) {
        return evalEffect(ctx, fx.do({ kind: "draw_shuffled" }));
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...hand.map((id) => ({
            id: `shuffle:${id}`,
            label: `Shuffle ${state.cards[id]!.title} into R&D`,
            effect: fx.do({
              kind: "shuffle_hq_card",
              cardId: id,
            }),
          })),
          {
            id: "done",
            label: `Done (draw ${shuffled})`,
            effect: fx.do({ kind: "draw_shuffled" }),
          },
        ],
      });
      return { ok: true };
    }

    case "shuffle_hq_card": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      state.corp.deck.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "corp:rd";
      card.faceup = false;
      shuffleInPlace(state, state.corp.deck);
      setBmCounter(source, "bmShuffled", bmCounter(source, "bmShuffled") + 1);
      log(state, `Special Report — shuffle ${card.title} into R&D.`);
      return evalEffect(ctx, fx.do({ kind: "shuffle_any_hq_draw" }));
    }
    case "shuffle_into_rd": {
      if (state.run) state.run.skipBreach = true;
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) {
        return {
          ok: false,
          error: "Analog Dreamers — card missing.",
          cites: [],
        };
      }
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(cardId)) {
          server.root = server.root.filter((id) => id !== cardId);
        }
      }
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      card.rezzed = false;
      shuffleInPlace(state, state.corp.deck);
      log(state, `Analog Dreamers — shuffle ${card.title} into R&D.`);
      return { ok: true };
    }
    case "shuffle_corporate_hq_to_rd_draw": {
      const n = state.corp.hand.length;
      for (let i = 0; i < n; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      if (n > 0) shuffleInPlace(state, state.corp.deck);
      log(state, `Corporate Shuffle — shuffle ${n} from HQ into R&D.`);
      // The draw goes through the draw procedure, from the top of R&D
      // (CR 8.4.2). The Corp loses if R&D is empty when it must draw
      // (CR 1.7.2c).
      return evalEffect(
        ctx,
        fx.do({ kind: "draw", side: "corp", amount: action.draw }),
      );
    }

    case "search_rd_play_operation": {
      const ops = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.corp.deck[i]!;
          state.corp.deck[i] = state.corp.deck[j]!;
          state.corp.deck[j] = tmp;
        }
        log(state, `Consulting Visit — no operation in R&D.`);
        return { ok: true };
      }
      if (ops.length === 1) {
        return applyTurnAndActionKinds(ctx, {
          kind: "play_resolve",
          cardId: ops[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ops.map((cardId) => ({
          id: `cv:${cardId}`,
          label: `Play ${state.cards[cardId]!.title}`,
          effect: fx.do({ kind: "play_resolve", cardId }),
        })),
      });
      return { ok: true };
    }
    case "search_rosetta_rfg_program_install_non_virus": {
      const programs = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Rosetta 2.0 — no installed program to remove.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `rfg:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: fx.do({ kind: "search_rosetta_rfg_then", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "search_rosetta_rfg_then": {
      const rfgId = (action as { cardId: string }).cardId;
      const rfg = state.cards[rfgId];
      if (!rfg || !state.runner.installed.includes(rfgId)) {
        log(state, `Rosetta 2.0 — RFG target gone.`);
        return { ok: true };
      }
      const discount =
        rfg.installCost ??
        (rfg.defId ? getCardDef(rfg.defId)?.installCost : undefined) ??
        0;
      removeCardFromGame(state, rfgId);
      log(state, `Rosetta 2.0 — remove ${rfg.title} from the game.`);
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return !(c.subtypes ?? []).some((s) => s.toLowerCase() === "virus");
      });
      // Shuffle after search regardless.
      const shuffle = () => {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
      };
      if (matches.length === 0) {
        shuffle();
        log(state, `Rosetta 2.0 — no non-virus program in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "install_rosetta_from_stack",
            cardId: id,
            discount,
          }),
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applySearchAndShuffleKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "shuffle_n_heap_cards_into_stack_per_power_counter": {
      // Snapshot power from RFG'd source or lingering counters.
      const n = Math.max(0, source.powerCounters ?? 0);
      if (n <= 0 || state.runner.discardPile.length === 0) {
        log(state, `${source.title} — no heap cards to shuffle.`);
        return { ok: true };
      }
      const heap = [...state.runner.discardPile];
      if (heap.length <= n) {
        for (const id of heap) {
          state.runner.discardPile = state.runner.discardPile.filter(
            (x) => x !== id,
          );
          const c = state.cards[id]!;
          c.zone = "runner:stack";
          c.faceup = false;
          state.runner.deck.push(id);
        }
        shuffleInPlace(state, state.runner.deck);
        log(
          state,
          `${source.title} — shuffle all ${heap.length} heap card(s) into stack.`,
        );
        return { ok: true };
      }
      state.turn.ohTropeShuffleRemaining = n;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: heap.map((cardId) => ({
          id: `trope-shuffle:${cardId}`,
          label: `Shuffle ${state.cards[cardId]!.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_trope_pick" as const,
              cardId,
            },
          },
        })),
        logLine: `${source.title} — choose ${n} heap card(s) to shuffle.`,
      });
      return { ok: true };
    }

    case "shuffle_trope_pick": {
      const cardId = action.cardId;
      const remaining = state.turn.ohTropeShuffleRemaining ?? 0;
      if (!state.runner.discardPile.includes(cardId) || remaining <= 0) {
        log(state, `Trope — invalid shuffle pick.`);
        return { ok: true };
      }
      state.runner.discardPile = state.runner.discardPile.filter(
        (id) => id !== cardId,
      );
      const c = state.cards[cardId]!;
      c.zone = "runner:stack";
      c.faceup = false;
      state.runner.deck.push(cardId);
      state.turn.ohTropeShuffleRemaining = remaining - 1;
      log(state, `Trope — shuffle ${c.title} into stack.`);
      if ((state.turn.ohTropeShuffleRemaining ?? 0) <= 0) {
        shuffleInPlace(state, state.runner.deck);
        state.turn.ohTropeShuffleRemaining = undefined;
        return { ok: true };
      }
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        shuffleInPlace(state, state.runner.deck);
        state.turn.ohTropeShuffleRemaining = undefined;
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: heap.map((id) => ({
          id: `trope-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_trope_pick" as const,
              cardId: id,
            },
          },
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

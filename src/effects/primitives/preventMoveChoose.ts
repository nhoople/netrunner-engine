/** Kala Ghoda (kg) Mumbad pack primitives — v1.116.0. */
import { lookAtCards } from "../../state/visibility/reveal.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadKgPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "prevent_ramujan_damage_trash_stack": {
      if (!source) return { ok: true };
      const copies = state.runner.installed.filter(
        (id) => id !== sourceId && state.cards[id]?.defId === source.defId,
      ).length;
      const x = 1 + copies;
      const pending = state.pendingDamage;
      if (!pending || pending.remaining <= 0) {
        log(state, `${source.title} — no pending damage.`);
        return { ok: true };
      }
      if (pending.type !== "net" && pending.type !== "core") {
        log(state, `${source.title} — not net/core damage.`);
        return { ok: true };
      }
      const prevent = Math.min(x, pending.remaining);
      pending.remaining -= prevent;
      for (let i = 0; i < prevent; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        trashCard(state, top);
      }
      log(
        state,
        `${source.title} — prevent ${prevent} ${pending.type} damage; trash ${prevent} from stack.`,
      );
      return { ok: true };
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

    case "install_from_stack": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        log(state, `Artist Colony — card not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      // Shuffle remaining stack.
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      log(state, `Artist Colony — install ${card.title} from stack.`);
      return { ok: true };
    }

    case "install_chatterjee_program_discount": {
      if (!source) return { ok: true };
      const discount = source.powerCounters ?? 0;
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Chatterjee University — no program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `chatterjee-install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "install_chatterjee_program_resolve",
            cardId: id,
            discount,
          }),
        })),
      });
      return { ok: true };
    }

    case "install_chatterjee_program_resolve": {
      if (!source) return { ok: true };
      const card = state.cards[action.cardId];
      if (!card || !state.runner.hand.includes(action.cardId)) {
        return { ok: true };
      }
      const cost = Math.max(0, (card.installCost ?? 0) - action.discount);
      if (state.runner.credits < cost) {
        log(state, `Chatterjee University — cannot afford ${card.title}.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.hand = state.runner.hand.filter(
        (id) => id !== action.cardId,
      );
      state.runner.installed.push(action.cardId);
      card.zone = "runner:installed";
      if ((source.powerCounters ?? 0) > 0) {
        source.powerCounters = (source.powerCounters ?? 0) - 1;
      }
      log(
        state,
        `Chatterjee University — install ${card.title} for ${cost}¢; remove 1 power.`,
      );
      return { ok: true };
    }

    case "look_at_top_of_stack": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `${source?.title ?? "Look"} — stack empty.`);
        return { ok: true };
      }
      lookAtCards(state, [top], sourceId);
      return { ok: true };
    }

    case "break_arm_icebreaker_additional_cost_this_run": {
      if (state.run) {
        state.run.kgIcebreakerBreakAdditionalCost =
          (state.run.kgIcebreakerBreakAdditionalCost ?? 0) + action.amount;
      }
      log(
        state,
        `${source?.title ?? "Interrupt 0"} — icebreaker break +${action.amount}¢ this run.`,
      );
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

    default:
      return null;
  }
}

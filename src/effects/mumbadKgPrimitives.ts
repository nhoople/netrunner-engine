/** Kala Ghoda (kg) Mumbad pack primitives — v1.116.0. */
import { log } from "../state/createGame.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

const FORBIDDEN_PANCHATANTRA = new Set(["barrier", "code gate", "sentry"]);

const COMMON_ICE_SUBTYPES = [
  "ap",
  "destroyer",
  "tracer",
  "observer",
  "advertisement",
  "illusory",
  "deflector",
  "bioroid",
  "mythic",
  "next",
  "grail",
  "morph",
  "expendable",
];

export function applyMumbadKgPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "ramujan_prevent_damage_trash_stack": {
      if (!source) return { ok: true };
      const copies = state.runner.rig.filter(
        (id) =>
          id !== sourceId &&
          state.cards[id]?.defId === source.defId,
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
        moveRunnerCardToHeap(state, top);
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
      const deckIdx = state.corp.deck.indexOf(accessId);
      if (deckIdx >= 0) state.corp.deck.splice(deckIdx, 1);
      const handIdx = state.corp.hand.indexOf(accessId);
      if (handIdx >= 0) state.corp.hand.splice(handIdx, 1);
      const discIdx = state.corp.discard.indexOf(accessId);
      if (discIdx >= 0) state.corp.discard.splice(discIdx, 1);
      for (const server of Object.values(state.servers)) {
        const ri = server.root.indexOf(accessId);
        if (ri >= 0) server.root.splice(ri, 1);
      }
      state.corp.deck.push(accessId);
      card.zone = "corp:rd";
      card.faceup = false;
      if (state.run) state.run.accessingCardId = null;
      log(state, `Maya — ${card.title} to bottom of R&D.`);
      return { ok: true };
    }

    case "choose_subtype_for_encounter": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `Panchatantra — not encountering ice.`);
        return { ok: true };
      }
      const ice = state.cards[iceId];
      if (!ice) return { ok: true };
      const options = COMMON_ICE_SUBTYPES.filter(
        (s) => !FORBIDDEN_PANCHATANTRA.has(s),
      ).map((subtype) => ({
        id: `pancha:${subtype}`,
        label: `Gain ${subtype}`,
        effect: fx.do({
          kind: "panchatantra_apply_subtype",
          iceId,
          subtype,
        }) as Effect,
      }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({
          kind: "gain_credits",
          side: "runner",
          amount: 0,
        }) as Effect,
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(state, `Panchatantra — choose subtype for ${ice.title}.`);
      return { ok: true };
    }

    case "panchatantra_apply_subtype": {
      const ice = state.cards[action.iceId];
      if (!ice) return { ok: true };
      const run = state.run;
      if (!run) return { ok: true };
      run.kgEncounterBonusSubtypes = run.kgEncounterBonusSubtypes ?? {};
      const list = run.kgEncounterBonusSubtypes[action.iceId] ?? [];
      if (!list.includes(action.subtype)) list.push(action.subtype);
      run.kgEncounterBonusSubtypes[action.iceId] = list;
      if (!(ice.subtypes ?? []).includes(action.subtype)) {
        ice.subtypes = [...(ice.subtypes ?? []), action.subtype];
      }
      log(
        state,
        `Panchatantra — ${ice.title} gains ${action.subtype} this run.`,
      );
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
      state.pendingChoice = {
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
      };
      log(state, `Artist Colony — search stack to install.`);
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
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      log(state, `Artist Colony — install ${card.title} from stack.`);
      return { ok: true };
    }

    case "chatterjee_install_program_discount": {
      if (!source) return { ok: true };
      const discount = source.powerCounters ?? 0;
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Chatterjee University — no program in grip.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `chatterjee-install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "chatterjee_install_program_resolve",
            cardId: id,
            discount,
          }),
        })),
      };
      return { ok: true };
    }

    case "chatterjee_install_program_resolve": {
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
      state.runner.credits -= cost;
      state.runner.hand = state.runner.hand.filter((id) => id !== action.cardId);
      state.runner.rig.push(action.cardId);
      card.zone = "runner:rig";
      if ((source.powerCounters ?? 0) > 0) {
        source.powerCounters = (source.powerCounters ?? 0) - 1;
      }
      log(
        state,
        `Chatterjee University — install ${card.title} for ${cost}¢; remove 1 power.`,
      );
      return { ok: true };
    }

    case "kg_cannot_use_programs_this_run": {
      if (state.run) {
        state.run.kgCannotUsePrograms = true;
      }
      state.turn.dadCannotUseProgramsThisRun = true;
      log(state, `${source?.title ?? "Vikram"} — Runner cannot use programs this run.`);
      return { ok: true };
    }

    case "look_at_top_of_stack": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `${source?.title ?? "Look"} — stack empty.`);
        return { ok: true };
      }
      log(
        state,
        `${source?.title ?? "Look"} — top of stack is ${state.cards[top]!.title}.`,
      );
      return { ok: true };
    }

    case "arm_icebreaker_break_additional_cost_this_run": {
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
      const arch = [...state.corp.discard];
      if (arch.length === 0) {
        log(state, `Museum of History — Archives empty.`);
        return { ok: true };
      }
      if (arch.length === 1) {
        const id = arch[0]!;
        state.corp.discard = [];
        state.corp.deck.push(id);
        const c = state.cards[id]!;
        c.zone = "corp:rd";
        c.faceup = false;
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.corp.deck[i]!;
          state.corp.deck[i] = state.corp.deck[j]!;
          state.corp.deck[j] = tmp;
        }
        log(state, `Museum of History — shuffle ${c.title} into R&D.`);
        return { ok: true };
      }
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "shuffle_archives_card_into_rd": {
      const id = action.cardId;
      if (!state.corp.discard.includes(id)) return { ok: true };
      state.corp.discard = state.corp.discard.filter((x) => x !== id);
      state.corp.deck.push(id);
      const c = state.cards[id]!;
      c.zone = "corp:rd";
      c.faceup = false;
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      log(state, `Museum of History — shuffle ${c.title} into R&D.`);
      return { ok: true };
    }

    case "kg_mumbad_swap_passed_ice": {
      const iceId = action.iceId;
      const otherId = action.otherIceId;
      const ice = state.cards[iceId];
      const other = state.cards[otherId];
      if (!ice || !other) return { ok: true };
      let serverId: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.includes(iceId) && server.ice.includes(otherId)) {
          serverId = sid;
          const a = server.ice.indexOf(iceId);
          const b = server.ice.indexOf(otherId);
          server.ice[a] = otherId;
          server.ice[b] = iceId;
          break;
        }
      }
      if (serverId) {
        log(
          state,
          `Mumbad City Grid — swap ${ice.title} with ${other.title} on ${serverId}.`,
        );
      }
      return { ok: true };
    }

    default:
      return null;
  }
}

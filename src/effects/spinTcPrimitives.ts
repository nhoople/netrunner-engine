/** True Colors (tc) Spin pack primitives. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap, noteCorpCardAddedToArchives } from "../state/trashHooks.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashToArchives(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  state.cards[cardId]!.zone = "corp:archives";
  state.cards[cardId]!.faceup = true;
  noteCorpCardAddedToArchives(state);
}

export function applySpinTcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  switch (action.kind) {
    case "keyhole_may_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Keyhole — not a successful R&D run.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach R&D",
            effect: fx.gainCredits("runner", 0),
          },
          {
            id: "keyhole",
            label: "Instead: look at top 3, trash 1 program, shuffle",
            effect: fx.do({ kind: "keyhole_instead_of_breach" }),
          },
        ],
      };
      log(state, `Keyhole — may instead of breaching R&D.`);
      return { ok: true };
    }
    case "keyhole_instead_of_breach": {
      if (state.run) state.run.skipBreach = true;
      const looked: string[] = [];
      for (let i = 0; i < 3 && state.corp.deck.length > 0; i++) {
        looked.push(state.corp.deck.pop()!);
      }
      for (const id of looked) state.cards[id]!.faceup = true;
      state.turn.rdLookedCards = looked;
      log(
        state,
        `Keyhole — look top ${looked.length}: ${looked.map((id) => state.cards[id]!.title).join(", ") || "none"}.`,
      );
      const programs = looked.filter((id) => state.cards[id]!.type === "program");
      if (programs.length === 0) {
        for (const id of looked) state.corp.deck.unshift(id);
        state.turn.rdLookedCards = [];
        log(state, `Keyhole — no program to trash; shuffle R&D.`);
        return { ok: true };
      }
      if (programs.length === 1) {
        const id = programs[0]!;
        trashToArchives(state, id);
        const rest = looked.filter((x) => x !== id);
        for (const rid of rest) state.corp.deck.unshift(rid);
        state.turn.rdLookedCards = [];
        log(state, `Keyhole — trash ${state.cards[id]!.title}; shuffle R&D.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `keyhole-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "keyhole_trash_looked_program", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "keyhole_trash_looked_program": {
      const id = action.cardId;
      trashToArchives(state, id);
      const rest = (state.turn.rdLookedCards ?? []).filter((x) => x !== id);
      for (const rid of rest) state.corp.deck.unshift(rid);
      state.turn.rdLookedCards = [];
      log(state, `Keyhole — trash ${state.cards[id]?.title ?? id}; shuffle R&D.`);
      return { ok: true };
    }
    case "lawyer_up": {
      const max = Math.min(2, state.runner.tags);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= max; n++) {
        options.push({
          id: `lawyer-tags-${n}`,
          label: n === 0 ? "Remove 0 tags" : `Remove ${n} tag(s)`,
          effect: fx.seq(
            fx.do({ kind: "remove_tags", amount: n }),
            fx.draw("runner", 3),
          ),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `Lawyer Up — remove up to ${max} tag(s), draw 3.`);
      return { ok: true };
    }
    case "leverage": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "take-bp",
            label: "Take 2 bad publicity",
            effect: fx.do({ kind: "give_bad_publicity", amount: 2 }),
          },
          {
            id: "decline",
            label: "Decline — Runner prevents all damage until their next turn",
            effect: fx.do({ kind: "leverage_shield_runner" }),
          },
        ],
      };
      log(state, `Leverage — Corp may take 2 bad publicity.`);
      return { ok: true };
    }
    case "leverage_shield_runner": {
      state.turn.leveragePreventRunnerDamage = true;
      log(state, `Leverage — Runner prevents all damage until next turn begins.`);
      return { ok: true };
    }
    case "capstone_trash_grip_draw_for_installed_dupes": {
      const options: Array<{ id: string; label: string; effect: Effect }> =
        state.runner.hand.map((id) => ({
          id: `capstone:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "capstone_trash_grip_card", cardId: id }),
        }));
      options.push({
        id: "capstone-done",
        label: "Done trashing",
        effect: fx.gainCredits("runner", 0),
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `Capstone — trash cards from grip.`);
      return { ok: true };
    }
    case "capstone_trash_grip_card": {
      const id = action.cardId;
      const title = state.cards[id]?.title;
      state.runner.hand = state.runner.hand.filter((x) => x !== id);
      moveRunnerCardToHeap(state, id);
      const hasInstalledDupe = state.runner.rig.some(
        (rid) => state.cards[rid]?.title === title,
      );
      if (hasInstalledDupe && state.runner.deck.length > 0) {
        const drawId = state.runner.deck.pop()!;
        state.runner.hand.push(drawId);
        state.cards[drawId]!.zone = "runner:grip";
        log(state, `Capstone — draw 1 (installed duplicate of ${title}).`);
      }
      return applySpinTcPrimitive(ctx, {
        kind: "capstone_trash_grip_draw_for_installed_dupes",
      })!;
    }
    case "rex_campaign_turn_begin": {
      const card = state.cards[sourceId];
      if ((card?.powerCounters ?? 0) <= 0) return { ok: true };
      card!.powerCounters = (card!.powerCounters ?? 0) - 1;
      log(
        state,
        `Rex Campaign — remove 1 power counter → ${card!.powerCounters}.`,
      );
      if ((card!.powerCounters ?? 0) <= 0) {
        return applySpinTcPrimitive(ctx, { kind: "rex_campaign_when_empty" });
      }
      return { ok: true };
    }
    case "rex_campaign_when_empty": {
      const trashTail = fx.do({ kind: "trash_self" });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "remove-bp",
            label: "Remove 1 bad publicity",
            effect: fx.seq(
              fx.do({ kind: "remove_bad_publicity", amount: 1 }),
              trashTail,
            ),
          },
          {
            id: "gain-5",
            label: "Gain 5[credit]",
            effect: fx.seq(
              fx.do({ kind: "gain_credits", side: "corp", amount: 5 }),
              trashTail,
            ),
          },
        ],
      };
      log(state, `Rex Campaign — empty; choose benefit then trash.`);
      return { ok: true };
    }
    case "gain_credits_per_runner_grip_size": {
      const n = state.runner.hand.length;
      state.runner.credits += n;
      log(state, `Sweeps Week — gain ${n}¢ (grip size) → ${state.runner.credits}¢.`);
      return { ok: true };
    }
    case "forbid_runner_spend_credits_for_run": {
      if (state.run) state.run.runnerCannotSpendCreditsForRun = true;
      log(state, `RSVP — Runner cannot spend credits for remainder of run.`);
      return { ok: true };
    }
    case "remove_bad_publicity_up_to": {
      const max = action.max ?? 0;
      const have = state.corp.badPublicity ?? 0;
      const cap = Math.min(max, have);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= cap; n++) {
        options.push({
          id: `rbp-${n}`,
          label: `Remove ${n} bad publicity`,
          effect: fx.do({ kind: "remove_bad_publicity", amount: n }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }
    case "break_all_destroyer_subroutines_on_encounter": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      if (!ice?.subtypes?.includes("destroyer")) {
        log(state, `Sharpshooter — host ice is not destroyer.`);
        return { ok: true };
      }
      const broken = enc.broken ?? [];
      for (let i = 0; i < broken.length; i++) broken[i] = true;
      enc.broken = broken;
      log(state, `Sharpshooter — break all subroutines on ${ice.title}.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

/**
 * Primitive kinds for trashing Runner cards from the grip and stack, and
 * removing heap cards from the game. The kind registry (`applyCoreKinds`)
 * dispatches here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import {
  applyPrimitive,
  evalEffect,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import { drawCards } from "../searchAndDeck/draw.js";
import { type Effect, fx, type Primitive } from "../ir.js";
import { pickRandomSubset, random } from "../../state/rng.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { installedRunnerIds } from "../visibility/visibilityKinds.js";
import { addIceStrengthBoostThisRun } from "../../state/continuous/lingeringEffects.js";
import { resolveChronosFirstNetPick } from "../../state/damageAndPrevention/damage.js";
import type { RuleCite, GameState } from "../../state/types.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";
import { offerSiStackTrashOrArrange } from "../searchAndDeck/deckOrderKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

/** Personality Profiles: trash one random grip card for a scored source. */
export function trashRandomGripForPersonalityProfiles(
  state: GameState,
  sourceId: string,
): void {
  const card = state.cards[sourceId];
  if (!card?.onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip) return;
  if (state.runner.hand.length === 0) {
    log(state, `${card.title} — Runner grip empty.`);
    return;
  }
  const idx = Math.floor(random(state) * state.runner.hand.length);
  const trashId = state.runner.hand[idx]!;
  trashCard(state, trashId);
  log(
    state,
    `${card.title} — Runner trashes ${state.cards[trashId]!.title} from grip at random.`,
  );
}

function rfgCard(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromGame(state, cardId);
}

export function applyRunnerHandAndDeckTrashKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "rfg_heap_card": {
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        log(state, `RFG heap card — heap empty.`);
        return { ok: true };
      }
      if (heap.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rfg_specific_heap_card",
          cardId: heap[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: heap.map((id) => ({
          id: `rfg-heap:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rfg_specific_heap_card" as const,
              cardId: id,
            },
          },
        })),
        logLine: `${source.title} — choose a heap card to remove from the game.`,
      });
      return { ok: true };
    }

    case "rfg_specific_heap_card": {
      const cardId = action.cardId;
      if (!state.runner.discardPile.includes(cardId)) {
        log(state, `RFG heap card — ${cardId} not in heap.`);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      state.runner.discardPile = state.runner.discardPile.filter(
        (id) => id !== cardId,
      );
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(
        state,
        `Remove ${card.title} in the heap from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }

    case "rfg_top_of_stack": {
      const n = Math.max(0, action.amount);
      const removed: string[] = [];
      for (let i = 0; i < n && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck.shift()!;
        removed.push(id);
        state.cards[id].zone = "removed-from-game";
        state.cards[id].faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(id)) {
          state.removedFromGame.push(id);
        }
      }
      log(state, `Remove top ${removed.length} of stack from the game.`);
      return { ok: true };
    }

    case "trash_from_grip": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      trashCard(state, cardId);
      // Invasion of Privacy's chain counts down via trash_next; other
      // callers (e.g. Snoop) trash directly without that loop.
      const rem = state.turn.invasionPrivacyTrashRemaining ?? 0;
      if (rem > 0) state.turn.invasionPrivacyTrashRemaining = rem - 1;
      return { ok: true };
    }

    case "may_trash_from_grip_to_draw": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `May trash from grip to draw — grip empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((id) => ({
            id: `trash-draw:${id}`,
            label: `Trash ${state.cards[id]!.title} to draw 1`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_grip_card_draw" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
        logLine: `May trash 1 from grip to draw 1.`,
      });
      return { ok: true };
    }

    case "trash_grip_card_draw": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip to draw — card not in grip.`);
        return { ok: true };
      }
      trashCard(state, id);
      const drawn = drawCards(state, "runner", 1);
      log(state, `Trash ${state.cards[id]!.title} from grip; draw ${drawn}.`);
      return { ok: true };
    }

    case "trash_n_from_grip": {
      const n = Math.max(0, action.amount ?? 0);
      // The Runner's picks for this cost come with the action (CR 1.16.1).
      const named = (state.costCardIds ?? []).filter((id) =>
        state.runner.hand.includes(id),
      );
      for (let i = 0; i < n; i++) {
        const id = named[i] ?? state.runner.hand[state.runner.hand.length - 1];
        if (!id) {
          return {
            ok: false,
            error: `Cannot trash ${n} from grip — only ${i} available.`,
            cites: [CR.playEvent],
          };
        }
        trashCard(state, id);
        log(state, `Trash ${state.cards[id]!.title} from grip as cost.`);
      }
      return { ok: true };
    }

    case "trash_up_to_grip_cards_gain_credits_each": {
      const remaining = Math.max(0, action.remaining);
      const typeFilter = action.types?.length ? new Set(action.types) : null;
      const candidates = state.runner.hand.filter((id) => {
        if (remaining <= 0) return false;
        const c = state.cards[id];
        if (!c) return false;
        if (!typeFilter) return true;
        return typeFilter.has(c.type as "program" | "hardware" | "resource");
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — trash up to grip cards: none matching/remaining.`,
        );
        return { ok: true };
      }
      const side = source.side;
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-grip:${id}`,
            label: `Trash ${title} (+${action.per}¢)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_grip_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side,
                    amount: action.per,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "trash_up_to_grip_cards_gain_credits_each" as const,
                    remaining: remaining - 1,
                    per: action.per,
                    ...(action.types ? { types: action.types } : {}),
                  },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: { op: "do", action: { kind: "gain_credits", side, amount: 0 } },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: side,
        options,
        logLine: `${source.title} — trash up to ${remaining} matching grip card(s) for ${action.per}¢ each (CR ${CR.trashing.number}).`,
      });
      return { ok: true };
    }

    case "may_trash_one_from_grip": {
      // Vera Ivanovna Shuyskaya: "you may reveal the grip. Trash 1 card
      // revealed this way." The Corp decides before seeing the grip; the
      // grip is then revealed to both players and the trash is not optional
      // (CR 1.21.3, 9.6.9, 10.2.2a).
      if (state.runner.hand.length === 0) {
        log(state, `May trash from grip — grip empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "reveal-grip",
            label: "Reveal the grip and trash 1 card",
            effect: fx.do({ kind: "reveal_grip_may_trash_one" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
        logLine: `${source.title} — may reveal the grip.`,
      });
      return { ok: true };
    }

    case "trash_grip_card": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip — card not in grip.`);
        return { ok: true };
      }
      trashCard(state, id);
      log(state, `Trash ${state.cards[id]!.title} from grip.`);
      return { ok: true };
    }

    case "may_trash_hardware_from_grip_place_hosted_credits": {
      const hardware = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      if (hardware.length === 0) {
        log(
          state,
          `${source.title} — may trash hardware from grip (none in grip).`,
        );
        return { ok: true };
      }
      const amount = action.amount;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hardware.map((id) => ({
            id: `trash-hw-grip:${id}`,
            label: `Trash ${state.cards[id]!.title}; place ${amount}¢ on ${source.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_grip_hardware_place_hosted_credits" as const,
                cardId: id,
                amount,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
        logLine: `${source.title} — may trash 1 hardware from grip to place ${amount}¢.`,
      });
      return { ok: true };
    }

    case "trash_grip_hardware_place_hosted_credits": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!state.runner.hand.includes(id) || card?.type !== "hardware") {
        log(state, `Trash grip hardware — not hardware in grip.`);
        return { ok: true };
      }
      trashCard(state, id);
      source.hostedCredits = (source.hostedCredits ?? 0) + action.amount;
      log(
        state,
        `Trash ${card.title} from grip; place ${action.amount}¢ on ${source.title} → ${source.hostedCredits}¢.`,
      );
      return { ok: true };
    }

    case "trash_top_of_stack": {
      if (state.runner.deck.length === 0) {
        log(state, `${source.title} — trash top of stack: stack empty.`);
        return { ok: true };
      }
      const topId = state.runner.deck[0]!;
      trashCard(state, topId);
      log(
        state,
        `${source.title} — trash top of stack (${state.cards[topId]?.title ?? topId}).`,
      );
      return { ok: true };
    }

    case "may_trash_other_installed_search_stack_same_type_install": {
      const discount = Math.max(0, action.discount);
      const targets = state.runner.installed.filter((id) => id !== sourceId);
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — may trash other installed: none available.`,
        );
        return { ok: true };
      }
      const installTypes = new Set(["program", "hardware", "resource"]);
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets
          .filter((id) => installTypes.has(state.cards[id]!.type))
          .map((id) => {
            const c = state.cards[id]!;
            const cardType = c.type as "program" | "hardware" | "resource";
            return {
              id: `trash:${id}`,
              label: `Trash ${c.title}; search for a ${cardType}`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "trash_runner_rig_card" as const,
                      cardId: id,
                    },
                  },
                  {
                    op: "do" as const,
                    action: {
                      kind: "search_stack_type_install" as const,
                      cardType,
                      discount,
                    },
                  },
                ],
              },
            };
          });
      options.push({
        id: "decline",
        label: "Decline",
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
        options,
        logLine: `${source.title} — may trash another installed card to search stack.`,
      });
      return { ok: true };
    }

    case "trash_random_from_grip": {
      const n = Math.max(0, action.amount ?? 0);
      if (n <= 0 || state.runner.hand.length === 0) {
        log(state, `Trash random from grip — nothing to trash.`);
        return { ok: true };
      }
      const picks = pickRandomSubset(
        state,
        state.runner.hand,
        Math.min(n, state.runner.hand.length),
      );
      for (const id of picks) {
        const title = state.cards[id]!.title;
        trashCard(state, id);
        log(
          state,
          `Trash ${title} from grip at random (CR ${CR.trashing.number}).`,
        );
      }
      return { ok: true };
    }
    case "rfg_runner_heap": {
      const heap = [...state.runner.discardPile];
      for (const id of heap) {
        state.cards[id]!.zone = "removed-from-game";
        state.cards[id]!.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(id)) state.removedFromGame.push(id);
      }
      state.runner.discardPile = [];
      log(
        state,
        `Chronos Project — remove ${heap.length} heap card(s) from the game.`,
      );
      return { ok: true };
    }
    case "trash_grip_draw_for_installed_dupes": {
      // "Trash any number of cards from your grip": the Runner chooses the
      // set first, then those cards are trashed together (CR 9.12.2a).
      return evalEffect(
        ctx,
        chooseCards({
          chooser: "runner",
          candidates: [...state.runner.hand],
          count: state.runner.hand.length,
          upTo: true,
          purpose: "resume",
          label: "trash",
          resume: { kind: "trash_capstone_grip_card", cardIds: [] },
        }),
      );
    }
    case "trash_capstone_grip_card": {
      const ids = action.cardIds.filter((id) => state.runner.hand.includes(id));
      // A copy installed when the cards are trashed counts; the trashed
      // cards were in the grip, so they are never that copy.
      const withInstalledCopy = ids.filter((id) => {
        const title = state.cards[id]?.title;
        return state.runner.installed.some(
          (rid) => state.cards[rid]?.title === title,
        );
      }).length;
      for (const id of ids) {
        trashCard(state, id, { by: "runner" });
      }
      log(
        state,
        `Capstone — trash ${ids.length} card(s) from the grip; draw ${withInstalledCopy}.`,
      );
      if (withInstalledCopy > 0) {
        return evalEffect(
          ctx,
          fx.do({ kind: "draw", side: "runner", amount: withInstalledCopy }),
        );
      }
      return { ok: true };
    }

    case "trash_program_or_top_2_stack": {
      const programs = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "program",
      );
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const id of programs) {
        options.push({
          id: `prog:${id}`,
          label: `Trash program ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        });
      }
      options.push({
        id: "mill2",
        label: "Trash the top 2 cards of the stack",
        effect: {
          op: "seq",
          effects: [
            fx.do({ kind: "trash_top_of_stack" }),
            fx.do({ kind: "trash_top_of_stack" }),
          ],
        },
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "trash_one_from_grip": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `Weir — grip empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_from_grip", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "rfg_heap_gain_credits": {
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        log(state, `Bloo Moose — heap empty.`);
        return { ok: true };
      }
      const credits = action.credits ?? 2;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: heap.map((id) => ({
          id: `bloo:${id}`,
          label: `RFG ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "rfg_resolve",
            cardId: id,
            credits,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_shortage_random_grip": {
      if (state.runner.hand.length === 0) {
        log(state, `O₂ Shortage — grip empty; no trash.`);
        return { ok: true };
      }
      const idx = Math.floor(random(state) * state.runner.hand.length);
      const id = state.runner.hand[idx]!;
      state.runner.hand.splice(idx, 1);
      trashCard(state, id, { by: controllerOf(state, sourceId) });
      log(
        state,
        `O₂ Shortage — Runner trashes ${state.cards[id]?.title ?? id} at random.`,
      );
      return { ok: true };
    }
    case "trash_frantic_coding_looked": {
      const lookedIds = action.lookedIds ?? [];
      for (const id of lookedIds) {
        if (!state.runner.deck.includes(id)) continue;
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        trashCard(state, id, { by: controllerOf(state, sourceId) });
      }
      log(state, `Frantic Coding — trash ${lookedIds.length} looked card(s).`);
      return { ok: true };
    }
    case "trash_stack_pick": {
      const cardId = action.cardId;
      const looked = state.turn.siStackLookedCards ?? [];
      const idx = looked.indexOf(cardId);
      if (idx < 0) {
        log(state, `Making an Entrance — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      state.turn.siStackLookedCards = looked;
      trashCard(state, cardId);
      log(
        state,
        `Making an Entrance — trash ${state.cards[cardId]!.title} from looked cards.`,
      );
      return offerSiStackTrashOrArrange(ctx);
    }

    case "trash_draw": {
      // Independent Thinking: "Trash up to 5 of your installed cards. Draw 1
      // card for each card trashed (or 2 ... if you trashed at least 1
      // directive)." The Runner picks up to 5, they are trashed together
      // (CR 9.12.2a), then the Runner draws through the draw procedure
      // (CR 8.4.5).
      if (!action.cardIds) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: installedRunnerIds(state),
            count: 5,
            upTo: true,
            purpose: "resume",
            label: "trash",
            resume: { kind: "trash_draw" },
          }),
        );
      }
      const picked = action.cardIds.filter((id) =>
        state.runner.installed.includes(id),
      );
      const hasDirective = picked.some((id) =>
        (state.cards[id]?.subtypes ?? []).includes("directive"),
      );
      const trashed = picked.filter((id) => {
        const before = state.cards[id]!.zone;
        trashCard(state, id, { by: "runner", simultaneousSet: true });
        return state.cards[id]?.zone !== before;
      });
      const draws = trashed.length * (hasDirective ? 2 : 1);
      log(
        state,
        `Independent Thinking — trashed ${trashed.length}, draw ${draws}.`,
      );
      if (draws === 0) return { ok: true };
      return evalEffect(ctx, fx.draw("runner", draws));
    }

    case "rfg_virus_from_heap": {
      const viruses = state.runner.discardPile.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("virus"),
      );
      if (viruses.length === 0) {
        log(state, `Macrophage — no virus in heap.`);
        return { ok: true };
      }
      if (viruses.length === 1) {
        const id = viruses[0]!;
        rfgCard(state, id);
        log(
          state,
          `Macrophage — RFG virus ${state.cards[id]!.title} from heap.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: viruses.map((id) => ({
          id: `rfg-heap-virus:${id}`,
          label: `RFG ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "rfg_virus_from_heap_resolve", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "rfg_virus_from_heap_resolve": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.discardPile.includes(cardId))
        return { ok: true };
      rfgCard(state, cardId);
      log(
        state,
        `Macrophage — RFG virus ${state.cards[cardId]!.title} from heap.`,
      );
      return { ok: true };
    }

    case "name_and_rfg_heap_copies": {
      const titles = new Map<string, string>();
      for (const id of state.runner.discardPile) {
        const c = state.cards[id];
        if (!c) continue;
        titles.set(c.defId ?? c.id, c.title);
      }
      if (titles.size === 0) {
        log(state, `Ark Lockdown — heap empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [...titles.entries()].map(([defId, title]) => ({
          id: `ark:${defId}`,
          label: `Name ${title}`,
          effect: fx.do({
            kind: "rfg_named",
            defId,
          }),
        })),
      });
      return { ok: true };
    }

    case "name_type_trash_from_grip": {
      const types = ["event", "hardware", "program", "resource"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `ibrahim-type:${t}`,
          label: `Name ${t}`,
          effect: fx.do({
            kind: "trash_named_type",
            cardType: t,
          }),
        })),
      });
      return { ok: true };
    }
    case "trash_severnius_grip_run_hq_or_rd": {
      const grip = [...state.runner.hand];
      if (grip.length < 2) {
        log(state, `Severnius Stim Implant — need ≥2 cards in grip.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 2; n <= grip.length; n++) {
        options.push({
          id: `trash-n:${n}`,
          label: `Trash ${n} from grip (+${Math.floor(n / 2)} access)`,
          effect: fx.do({
            kind: "choose_severnius_grip_cards",
            remaining: n,
            trashed: 0,
            cardIds: grip,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "trash_severnius_one_grip": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.hand.includes(cardId)) {
        return { ok: true };
      }
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(state, `Severnius — trash ${state.cards[cardId]?.title ?? cardId}.`);
      return { ok: true };
    }
    case "trash_null_grip_lower_encountered_ice_strength": {
      const amount = action.amount ?? 2;
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `Null — no cards in grip to trash.`);
        return { ok: true };
      }
      const apply = (cardId: string): PrimResult => {
        trashCard(state, cardId);
        const iceId = state.run?.encounter?.iceId;
        if (iceId && state.run) {
          addIceStrengthBoostThisRun(state, {
            createdBy: sourceId,
            iceId,
            amount: -amount,
          });
          log(
            state,
            `Null — trash ${state.cards[cardId]?.title}; ice gets −${amount} strength this run.`,
          );
        } else {
          log(state, `Null — trash ${state.cards[cardId]?.title}.`);
        }
        return { ok: true };
      };
      if (grip.length === 1) return apply(grip[0]!);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `null-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_null_grip_card_resolve",
            cardId: id,
            amount,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_null_grip_card_resolve": {
      const cardId = action.cardId;
      const amount = action.amount ?? 2;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      trashCard(state, cardId);
      const iceId = state.run?.encounter?.iceId;
      if (iceId && state.run) {
        addIceStrengthBoostThisRun(state, {
          createdBy: sourceId,
          iceId,
          amount: -amount,
        });
      }
      log(state, `Null — trash ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }
    case "trash_all_cards_from_grip": {
      const hand = [...state.runner.hand];
      for (const id of hand) {
        state.runner.hand = state.runner.hand.filter((x) => x !== id);
        trashCard(state, id);
      }
      log(
        state,
        `${source?.title ?? "The Noble Path"} — trash ${hand.length} card(s) from grip.`,
      );
      return { ok: true };
    }
    case "may_trash_stack_top_then_trash_rd_per_resolved": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : null;
      const isSentry = (ice?.subtypes ?? []).some(
        (s) => s.toLowerCase() === "sentry",
      );
      if (!enc || !ice || !isSentry) {
        log(state, `Persephone — pass was not after encountering a sentry.`);
        return { ok: true };
      }
      const resolved = enc.subroutinesResolved ?? 0;
      if (state.runner.deck.length === 0) {
        log(state, `Persephone — stack empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "accept",
            label: `Trash top of stack; trash ${resolved} from R&D`,
            effect: fx.do({
              kind: "resolve_trash",
              amount: resolved,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyRunnerHandAndDeckTrashKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "trash_chronos_pick": {
      // An empty id is the Corp selecting no card.
      resolveChronosFirstNetPick(
        state,
        action.cardId === "" ? null : action.cardId,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

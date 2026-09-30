/** Salsette Island (si) Mumbad pack primitives — v1.119.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { GameState, RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";
import { applySansanOhPrimitive } from "./sansanOhPrimitives.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function shuffleInPlace(arr: string[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

export function applyMumbadSiPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "look_top_n_stack_trash_any_arrange_rest": {
      const n = action.n ?? 6;
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source?.title ?? "Making an Entrance"} — stack empty.`);
        return { ok: true };
      }
      state.turn.siStackLookedCards = taken;
      state.turn.siStackArrangePlaced = [];
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Look stack — ${state.cards[id]!.title}.`);
      }
      return offerSiStackTrashOrArrange(ctx);
    }

    case "si_stack_trash_pick": {
      const cardId = action.cardId;
      const looked = state.turn.siStackLookedCards ?? [];
      const idx = looked.indexOf(cardId);
      if (idx < 0) {
        log(state, `Making an Entrance — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      state.turn.siStackLookedCards = looked;
      moveRunnerCardToHeap(state, cardId);
      log(
        state,
        `Making an Entrance — trash ${state.cards[cardId]!.title} from looked cards.`,
      );
      return offerSiStackTrashOrArrange(ctx);
    }

    case "si_stack_done_trashing": {
      return offerSiStackArrangeChoice(ctx);
    }

    case "si_stack_arrange_pick": {
      const cardId = action.cardId;
      const looked = state.turn.siStackLookedCards ?? [];
      const idx = looked.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange stack — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      state.turn.siStackLookedCards = looked;
      const placed = state.turn.siStackArrangePlaced ?? [];
      placed.push(cardId);
      state.turn.siStackArrangePlaced = placed;
      return offerSiStackArrangeChoice(ctx);
    }

    case "gain_credits_per_copies_in_heap": {
      if (!source) return { ok: true };
      const per = action.per ?? 1;
      const side = action.side ?? "runner";
      const copies = state.runner.discard.filter(
        (id) => state.cards[id]?.defId === source.defId,
      ).length;
      const gain = copies * per;
      if (side === "runner") state.runner.credits += gain;
      else state.corp.credits += gain;
      log(
        state,
        `${source.title} — gain ${gain}¢ (${copies} copy/copies in heap).`,
      );
      return { ok: true };
    }

    case "brahman_add_nonvirus_program_to_stack_top": {
      const programs = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return !(c.subtypes ?? []).some((s) => s.toLowerCase() === "virus");
      });
      if (programs.length === 0) {
        log(state, `Brahman — no installed non-virus program.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `brahman:${id}`,
            label: `Add ${c.title} to top of stack`,
            effect: fx.do({
              kind: "brahman_move_program_to_stack_top",
              cardId: id,
            }),
          };
        }),
      };
      log(state, `Brahman — choose an installed non-virus program for stack top.`);
      return { ok: true };
    }

    case "brahman_move_program_to_stack_top": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.rig.includes(cardId)) {
        log(state, `Brahman — program not installed.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, cardId);
      state.runner.deck.unshift(cardId);
      card.zone = "runner:stack";
      card.faceup = false;
      log(state, `Brahman — add ${card.title} to the top of the stack.`);
      return { ok: true };
    }

    case "salems_hospitality_name_reveal_trash_grip_copies": {
      const titles = new Map<string, string>();
      for (const c of Object.values(state.cards)) {
        if (!c.defId || c.type === "identity") continue;
        if (!titles.has(c.defId)) titles.set(c.defId, c.title);
      }
      const options = [...titles.entries()].slice(0, 40).map(([defId, title]) => ({
        id: `salem:${defId}`,
        label: `Name ${title}`,
        effect: fx.do({
          kind: "salems_hospitality_trash_named",
          defId,
        }),
      }));
      if (options.length === 0) {
        log(state, `Salem's Hospitality — no card names available.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      return { ok: true };
    }

    case "salems_hospitality_trash_named": {
      const defId = action.defId;
      const grip = [...state.runner.hand];
      let trashed = 0;
      for (const id of grip) {
        const c = state.cards[id];
        if (!c || c.defId !== defId) continue;
        log(state, `Salem's Hospitality — reveal ${c.title}.`);
        moveRunnerCardToHeap(state, id);
        trashed += 1;
      }
      for (const id of state.runner.hand) {
        const c = state.cards[id];
        if (c) log(state, `Salem's Hospitality — reveal ${c.title}.`);
      }
      log(
        state,
        `Salem's Hospitality — trash ${trashed} copy/copies of ${defId} from grip.`,
      );
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
        shuffleInPlace(state.corp.deck);
        log(
          state,
          `${source?.title ?? "Executive Search Firm"} — no matching card in R&D; shuffle.`,
        );
        return { ok: true };
      }
      if (matches.length === 1) {
        return applyMumbadSiPrimitive(ctx, {
          kind: "search_rd_subtype_to_hq_resolve",
          cardId: matches[0]!,
        });
      }
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "search_rd_subtype_to_hq_resolve": {
      const cardId = action.cardId;
      if (!state.corp.deck.includes(cardId)) {
        shuffleInPlace(state.corp.deck);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      shuffleInPlace(state.corp.deck);
      log(
        state,
        `${source?.title ?? "Executive Search Firm"} — reveal ${card.title}, add to HQ; shuffle R&D.`,
      );
      return { ok: true };
    }

    case "localized_product_line_search_rd_copies_to_hq": {
      const byDef = new Map<string, string[]>();
      for (const id of state.corp.deck) {
        const c = state.cards[id];
        if (!c?.defId) continue;
        const list = byDef.get(c.defId) ?? [];
        list.push(id);
        byDef.set(c.defId, list);
      }
      const options = [...byDef.entries()].map(([defId, ids]) => ({
        id: `lpl:${defId}`,
        label: `Take ${ids.length}× ${state.cards[ids[0]!]!.title}`,
        effect: fx.do({
          kind: "localized_product_line_take_copies",
          defId,
        }),
      }));
      if (options.length === 0) {
        shuffleInPlace(state.corp.deck);
        log(state, `Localized Product Line — R&D empty; shuffle.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      return { ok: true };
    }

    case "localized_product_line_take_copies": {
      const defId = action.defId;
      const matches = state.corp.deck.filter(
        (id) => state.cards[id]?.defId === defId,
      );
      for (const id of matches) {
        const card = state.cards[id]!;
        state.corp.deck = state.corp.deck.filter((x) => x !== id);
        state.corp.hand.push(id);
        card.zone = "corp:hq";
        card.faceup = false;
        log(state, `Localized Product Line — reveal ${card.title}, add to HQ.`);
      }
      shuffleInPlace(state.corp.deck);
      log(
        state,
        `Localized Product Line — added ${matches.length} copy/copies; shuffle R&D.`,
      );
      return { ok: true };
    }

    case "raman_rai_may_swap_drawn": {
      const drawnId = action.cardId;
      const drawn = state.cards[drawnId];
      if (!drawn || !state.corp.hand.includes(drawnId)) return { ok: true };
      if ((state.corp.clicks ?? 0) < 1) {
        log(state, `Raman Rai — no click to lose.`);
        return { ok: true };
      }
      const archives = state.corp.discard.filter(
        (id) => state.cards[id]?.type === drawn.type,
      );
      if (archives.length === 0) {
        log(state, `Raman Rai — no same-type card in Archives.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...archives.map((archId) => ({
            id: `raman:${archId}`,
            label: `Lose [click]: swap with ${state.cards[archId]!.title}`,
            effect: fx.do({
              kind: "raman_rai_swap_resolve",
              drawnId,
              archivesId: archId,
            }),
          })),
          {
            id: "raman:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "raman_rai_swap_resolve": {
      if ((state.corp.clicks ?? 0) < 1) return { ok: true };
      const drawnId = action.drawnId;
      const archivesId = action.archivesId;
      if (
        !state.corp.hand.includes(drawnId) ||
        !state.corp.discard.includes(archivesId)
      ) {
        return { ok: true };
      }
      state.corp.clicks -= 1;
      const drawn = state.cards[drawnId]!;
      const arch = state.cards[archivesId]!;
      log(
        state,
        `Raman Rai — reveal ${drawn.title} and ${arch.title}; lose [click].`,
      );
      state.corp.hand = state.corp.hand.filter((id) => id !== drawnId);
      state.corp.discard = state.corp.discard.filter((id) => id !== archivesId);
      state.corp.hand.push(archivesId);
      state.corp.discard.push(drawnId);
      arch.zone = "corp:hq";
      arch.faceup = false;
      drawn.zone = "corp:archives";
      drawn.faceup = true;
      state.turn.siRamanRaiUsedThisTurn = true;
      log(state, `Raman Rai — swap ${drawn.title} ↔ ${arch.title}.`);
      return { ok: true };
    }

    case "patron_choose_server": {
      const servers = Object.keys(state.servers);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((serverId) => ({
            id: `patron:${serverId}`,
            label: `Name ${serverId}`,
            effect: fx.do({
              kind: "patron_set_named_server",
              serverId,
            }),
          })),
          {
            id: "patron:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "patron_set_named_server": {
      if (!source) return { ok: true };
      source.namedServerId = action.serverId as import("../state/types.js").ServerId;
      log(state, `Patron — name ${action.serverId}.`);
      return { ok: true };
    }

    default:
      // Delegate arrange helpers used by Making an Entrance trash→arrange flow.
      if (
        action.kind === "look_top_n_stack_arrange" ||
        action.kind === "oh_stack_arrange_pick"
      ) {
        return applySansanOhPrimitive(ctx, action);
      }
      return null;
  }
}

/** Indian Union Stock Exchange: rez/play out-of-faction → gain credits. */
export function fireSiAfterCorpRezOrPlay(
  state: GameState,
  cardId: string,
): void {
  const played = state.cards[cardId];
  if (!played) return;
  const idFaction = state.cards[state.corp.identityId]?.faction;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const exchange = state.cards[rid];
      if (!exchange?.rezzed) continue;
      const gain = exchange.onRezOrPlayOutOfFactionGainCredits;
      if (typeof gain !== "number") continue;
      const cardFaction = played.faction;
      const isSelf = cardId === rid;
      const isOutOfFaction =
        Boolean(idFaction) &&
        Boolean(cardFaction) &&
        cardFaction !== idFaction;
      if (!isSelf && !isOutOfFaction) continue;
      state.corp.credits += gain;
      log(
        state,
        `${exchange.title} — rez/play ${played.title}: gain ${gain}¢.`,
      );
    }
  }
}

/** Jeeves: first time spend ≥N clicks on same paid ability each turn → gain click. */
export function fireSiAfterPaidAbilityClicks(
  state: GameState,
  clicksSpent: number,
): void {
  if (clicksSpent < 1) return;
  if (state.turn.siJeevesGainClickUsedThisTurn) return;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const jeeves = state.cards[rid];
      if (!jeeves?.rezzed) continue;
      const need = jeeves.gainClickFirstTimeSpendClicksGteOnSameActionEachTurn;
      if (typeof need !== "number" || clicksSpent < need) continue;
      state.corp.clicks += 1;
      state.turn.siJeevesGainClickUsedThisTurn = true;
      log(
        state,
        `${jeeves.title} — spent ${clicksSpent} [click] on one action; gain [click] → ${state.corp.clicks}.`,
      );
      return;
    }
  }
}

/** Personality Profiles: trash random from grip when Runner searches stack or installs from heap. */
export function firePersonalityProfilesTrashRandomGrip(state: GameState): void {
  for (const id of state.corp.score) {
    const card = state.cards[id];
    if (!card?.onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip) continue;
    if (state.runner.hand.length === 0) {
      log(state, `${card.title} — Runner grip empty.`);
      return;
    }
    const idx = Math.floor(Math.random() * state.runner.hand.length);
    const trashId = state.runner.hand[idx]!;
    moveRunnerCardToHeap(state, trashId);
    log(
      state,
      `${card.title} — Runner trashes ${state.cards[trashId]!.title} from grip at random.`,
    );
    return;
  }
}


function offerSiStackTrashOrArrange(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.siStackLookedCards ?? [];
  if (looked.length === 0) {
    return offerSiStackArrangeChoice(ctx);
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: [
      ...looked.map((cardId) => ({
        id: `si-trash:${cardId}`,
        label: `Trash ${state.cards[cardId]!.title}`,
        effect: fx.do({
          kind: "si_stack_trash_pick",
          cardId,
        }),
      })),
      {
        id: "si-done-trash",
        label: "Done trashing — arrange remaining",
        effect: fx.do({ kind: "si_stack_done_trashing" }),
      },
    ],
  };
  return { ok: true };
}

function offerSiStackArrangeChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.siStackLookedCards ?? [];
  if (looked.length === 0) {
    const placed = state.turn.siStackArrangePlaced ?? [];
    for (let i = placed.length - 1; i >= 0; i--) {
      const id = placed[i]!;
      state.cards[id]!.faceup = false;
      state.cards[id]!.zone = "runner:stack";
      state.runner.deck.unshift(id);
    }
    state.turn.siStackLookedCards = undefined;
    state.turn.siStackArrangePlaced = undefined;
    log(state, `Arrange stack — ${placed.length} card(s) replaced.`);
    return { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: looked.map((cardId) => ({
      id: `si-arr:${cardId}`,
      label: `Place ${state.cards[cardId]!.title} (next from top)`,
      effect: fx.do({
        kind: "si_stack_arrange_pick",
        cardId,
      }),
    })),
  };
  return { ok: true };
}

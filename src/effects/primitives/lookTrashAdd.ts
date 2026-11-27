import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { GameState, RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { applySansanOhPrimitive } from "./shuffleLookPick.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { shuffleInPlace } from "../../state/rng.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadSiPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
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

    case "add_nonvirus_program_to_stack_top": {
      const programs = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return !(c.subtypes ?? []).some((s) => s.toLowerCase() === "virus");
      });
      if (programs.length === 0) {
        log(state, `Brahman — no installed non-virus program.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `brahman:${id}`,
            label: `Add ${c.title} to top of stack`,
            effect: fx.do({
              kind: "move_program_to_stack_top",
              cardId: id,
            }),
          };
        }),
        logLine: `Brahman — choose an installed non-virus program for stack top.`,
      });
      return { ok: true };
    }

    case "move_program_to_stack_top": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId)) {
        log(state, `Brahman — program not installed.`);
        return { ok: true };
      }
      uninstallCard(state, cardId, "deck-top");
      log(state, `Brahman — add ${card.title} to the top of the stack.`);
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
        return applyMumbadSiPrimitive(ctx, {
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

    case "choose_patron_server": {
      const servers = Object.keys(state.servers);
      openPendingChoose(state, {
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
      });
      return { ok: true };
    }

    case "patron_set_named_server": {
      if (!source) return { ok: true };
      source.namedServerId =
        action.serverId as import("../../state/types.js").ServerId;
      log(state, `Patron — name ${action.serverId}.`);
      return { ok: true };
    }

    default:
      // Delegate arrange helpers used by Making an Entrance trash→arrange flow.
      if (
        action.kind === "look_top_n_stack_arrange" ||
        action.kind === "pick_stack_arrange"
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
        Boolean(idFaction) && Boolean(cardFaction) && cardFaction !== idFaction;
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
      // A blanked Jeeves gives no click (CR 9.1.9a).
      if (abilitiesSuppressed(state, rid)) continue;
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

export function offerSiStackTrashOrArrange(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.siStackLookedCards ?? [];
  if (looked.length === 0) {
    return offerSiStackArrangeChoice(ctx);
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: [
      ...looked.map((cardId) => ({
        id: `si-trash:${cardId}`,
        label: `Trash ${state.cards[cardId]!.title}`,
        effect: fx.do({
          kind: "trash_stack_pick",
          cardId,
        }),
      })),
      {
        id: "si-done-trash",
        label: "Done trashing — arrange remaining",
        effect: fx.do({ kind: "si_stack_done_trashing" }),
      },
    ],
  });
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
  openPendingChoose(state, {
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
  });
  return { ok: true };
}

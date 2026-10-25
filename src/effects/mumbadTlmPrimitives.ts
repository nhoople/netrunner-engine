/** The Liberated Mind (tlm) Mumbad pack primitives — v1.120.0. */
import { log } from "../state/createGame.js";
import {
  legalRebirthIdentityIds,
  switchRunnerIdentity,
} from "../state/fenris.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import {
  fireOnAgendaAddedToRunnerScore,
  moveRunnerCardToHeap,
  recomputeRunnerLink,
} from "../state/trashHooks.js";
import { enterLingeringPlayArea } from "../state/zones.js";
import { CR } from "../timing/labels.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function rfgCard(ctx: EffectCtx, cardId: string): void {
  const { state } = ctx;
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  card.zone = "removed-from-game";
  card.faceup = true;
  if (!state.removedFromGame.includes(cardId)) {
    state.removedFromGame.push(cardId);
  }
}

/**
 * Corp assigns each remaining HQ card to pile A or B. When none remain,
 * the Runner chooses which pile to access.
 */
function offerInfoSiftAssign(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const remaining = state.turn.tlmInfoSiftRemaining ?? [];
  if (remaining.length === 0) {
    return offerInfoSiftRunnerPick(ctx);
  }
  const cardId = remaining[0]!;
  const title = state.cards[cardId]?.title ?? cardId;
  state.pendingChoice = {
    sourceId,
    chooser: "corp",
    options: [
      {
        id: `sift-a:${cardId}`,
        label: `Pile A: ${title}`,
        effect: fx.do({
          kind: "place_info_sift_card_continue",
          cardId,
          pile: "a",
        }),
      },
      {
        id: `sift-b:${cardId}`,
        label: `Pile B: ${title}`,
        effect: fx.do({
          kind: "place_info_sift_card_continue",
          cardId,
          pile: "b",
        }),
      },
    ],
  };
  log(
    state,
    `Information Sifting — Corp assigns ${title} (${remaining.length} left).`,
  );
  return { ok: true };
}

function offerInfoSiftRunnerPick(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const pileA = state.turn.tlmInfoSiftPileA ?? [];
  const pileB = state.turn.tlmInfoSiftPileB ?? [];
  state.turn.tlmInfoSiftRemaining = undefined;
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: [
      {
        id: "pile-a",
        label: `Access pile A (${pileA.length} card(s))`,
        effect: fx.do({ kind: "access_pile", pile: "a" }),
      },
      {
        id: "pile-b",
        label: `Access pile B (${pileB.length} card(s))`,
        effect: fx.do({ kind: "access_pile", pile: "b" }),
      },
    ],
  };
  log(
    state,
    `Information Sifting — Runner chooses a pile (${pileA.length}/${pileB.length}).`,
  );
  return { ok: true };
}

export function applyMumbadTlmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "trash_all_cards_from_grip": {
      const hand = [...state.runner.hand];
      for (const id of hand) {
        state.runner.hand = state.runner.hand.filter((x) => x !== id);
        moveRunnerCardToHeap(state, id);
      }
      log(
        state,
        `${source?.title ?? "The Noble Path"} — trash ${hand.length} card(s) from grip.`,
      );
      return { ok: true };
    }

    case "information_sifting_corp_split_hq": {
      // Printed: the Corp separates all cards in HQ into 2 facedown piles;
      // the Runner then chooses one pile to access (CR 1.2.1).
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Information Sifting — HQ empty.`);
        return { ok: true };
      }
      state.turn.tlmInfoSiftPileA = [];
      state.turn.tlmInfoSiftPileB = [];
      state.turn.tlmInfoSiftRemaining = hq;
      return offerInfoSiftAssign(ctx);
    }

    case "place_info_sift_card_continue": {
      const remaining = state.turn.tlmInfoSiftRemaining ?? [];
      const cardId = action.cardId;
      if (!remaining.includes(cardId)) return { ok: true };
      state.turn.tlmInfoSiftRemaining = remaining.filter((id) => id !== cardId);
      if (action.pile === "b") {
        state.turn.tlmInfoSiftPileB = [
          ...(state.turn.tlmInfoSiftPileB ?? []),
          cardId,
        ];
      } else {
        state.turn.tlmInfoSiftPileA = [
          ...(state.turn.tlmInfoSiftPileA ?? []),
          cardId,
        ];
      }
      log(
        state,
        `Information Sifting — ${state.cards[cardId]?.title ?? cardId} → pile ${action.pile.toUpperCase()}.`,
      );
      return offerInfoSiftAssign(ctx);
    }

    case "access_pile": {
      const pile =
        action.pile === "b"
          ? (state.turn.tlmInfoSiftPileB ?? [])
          : (state.turn.tlmInfoSiftPileA ?? []);
      state.turn.tlmInfoSiftPileA = undefined;
      state.turn.tlmInfoSiftPileB = undefined;
      if (!state.run) return { ok: true };
      state.run.accessCandidates = [...pile];
      state.run.randomAccessLimit = pile.length;
      state.run.skipBreach = false;
      log(
        state,
        `Information Sifting — access ${pile.length} card(s) from chosen pile.`,
      );
      return { ok: true };
    }

    case "may_corp_forfeit_liberated_chela_or_score": {
      const corpAgendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (corpAgendas.length === 0) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "score_self",
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "forfeit-rfg",
            label: "Forfeit an agenda to remove Liberated Chela from the game",
            effect: fx.do({ kind: "corp_forfeit_rfg" }),
          },
          {
            id: "decline",
            label: "Decline — Runner scores Liberated Chela as 2 AP agenda",
            effect: fx.do({ kind: "score_self" }),
          },
        ],
      };
      return { ok: true };
    }

    case "corp_forfeit_rfg": {
      const agendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "score_self",
        });
      }
      if (agendas.length === 1) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "forfeit_resolve",
          agendaId: agendas[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: agendas.map((agendaId) => ({
          id: `forfeit:${agendaId}`,
          label: `Forfeit ${state.cards[agendaId]!.title}`,
          effect: fx.do({
            kind: "forfeit_resolve",
            agendaId,
          }),
        })),
      };
      return { ok: true };
    }

    case "forfeit_resolve": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !state.corp.scoreArea.includes(agendaId)) {
        log(state, `Liberated Chela — agenda no longer in Corp score area.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, agendaId);
      state.corp.discardPile.push(agendaId);
      agenda.zone = "corp:archives";
      agenda.faceup = true;
      rfgCard(ctx, sourceId);
      log(
        state,
        `Liberated Chela — Corp forfeits ${agenda.title}; remove Liberated Chela from the game.`,
      );
      return { ok: true };
    }

    case "score_self": {
      if (!source) return { ok: true };
      const pts = 2;
      source.agendaPoints = pts;
      removeCardFromCurrentZone(state, sourceId);
      state.runner.scoreArea.push(sourceId);
      source.zone = "runner:score";
      source.faceup = true;
      source.rezzed = true;
      log(
        state,
        `Liberated Chela — add to Runner score area as a ${pts}-point agenda.`,
      );
      fireOnAgendaAddedToRunnerScore(state);
      return { ok: true };
    }

    case "rebirth_switch_identity_same_faction": {
      const candidates = legalRebirthIdentityIds(state);
      const current = state.cards[state.runner.identityId];
      if (candidates.length === 0) {
        log(
          state,
          `Rebirth — no same-faction identity in the outside-game pile (CR ${CR.additionalIdentitiesPile.number}).`,
        );
        return { ok: true };
      }
      if (candidates.length === 1) {
        switchRunnerIdentity(state, candidates[0]!);
        recomputeRunnerLink(state);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((cardId) => ({
          id: `rebirth:${cardId}`,
          label: `Switch to ${state.cards[cardId]!.title}`,
          effect: fx.do({
            kind: "rebirth_switch_to_identity",
            cardId,
          }),
        })),
      };
      log(
        state,
        `Rebirth — choose a ${current?.faction ?? "same-faction"} identity from outside the game (CR ${CR.additionalIdentity.number}).`,
      );
      return { ok: true };
    }
    case "rebirth_switch_to_identity": {
      const cardId = (action as { cardId: string }).cardId;
      if (!legalRebirthIdentityIds(state).includes(cardId)) {
        return {
          ok: false,
          error: `${cardId} is not a legal Rebirth identity.`,
          cites: [CR.additionalIdentity, CR.additionalIdentitiesPile],
        };
      }
      switchRunnerIdentity(state, cardId);
      recomputeRunnerLink(state);
      return { ok: true };
    }

    case "choose_turning_wheel_central_bonus_access": {
      if (!state.run) {
        log(state, `The Turning Wheel — no active run.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "hq",
            label: "HQ — +1 access when breaching HQ this run",
            effect: fx.do({
              kind: "turning_wheel_set_bonus_access",
              server: "hq",
            }),
          },
          {
            id: "rd",
            label: "R&D — +1 access when breaching R&D this run",
            effect: fx.do({
              kind: "turning_wheel_set_bonus_access",
              server: "rd",
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "turning_wheel_set_bonus_access": {
      if (!state.run) return { ok: true };
      const server = action.server === "rd" ? "rd" : "hq";
      state.run.tlmTurningWheelBonusServer = server;
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + 1;
      log(
        state,
        `The Turning Wheel — +1 access when breaching ${server.toUpperCase()} this run.`,
      );
      return { ok: true };
    }

    case "reveal_grip_trash_cost_lte_excess": {
      const excess = state.turn.lastTraceExcess ?? 0;
      const hand = [...state.runner.hand];
      for (const id of hand) {
        const card = state.cards[id];
        if (!card) continue;
        const cost = card.playCost ?? card.installCost ?? Infinity;
        log(state, `Waiver — reveal ${card.title} (cost ${cost}).`);
        if (typeof cost === "number" && cost <= excess) {
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          moveRunnerCardToHeap(state, id);
          log(state, `Waiver — trash ${card.title} (cost ≤ ${excess}).`);
        }
      }
      return { ok: true };
    }

    case "swap_scored_agendas": {
      const corpAgendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      const runnerAgendas = state.runner.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (corpAgendas.length === 0 || runnerAgendas.length === 0) {
        log(
          state,
          `Exchange of Information — both score areas need an agenda.`,
        );
        return { ok: true };
      }
      if (corpAgendas.length === 1 && runnerAgendas.length === 1) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "swap_resolve",
          corpAgendaId: corpAgendas[0]!,
          runnerAgendaId: runnerAgendas[0]!,
        });
      }
      const options = [];
      for (const cId of corpAgendas) {
        for (const rId of runnerAgendas) {
          options.push({
            id: `swap:${cId}:${rId}`,
            label: `Swap ${state.cards[cId]!.title} ↔ ${state.cards[rId]!.title}`,
            effect: fx.do({
              kind: "swap_resolve",
              corpAgendaId: cId,
              runnerAgendaId: rId,
            }),
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "swap_resolve": {
      const cId = action.corpAgendaId;
      const rId = action.runnerAgendaId;
      if (
        !state.corp.scoreArea.includes(cId) ||
        !state.runner.scoreArea.includes(rId)
      ) {
        log(
          state,
          `Exchange of Information — agendas no longer in score areas.`,
        );
        return { ok: true };
      }
      state.corp.scoreArea = state.corp.scoreArea.filter((x) => x !== cId);
      state.runner.scoreArea = state.runner.scoreArea.filter((x) => x !== rId);
      state.corp.scoreArea.push(rId);
      state.runner.scoreArea.push(cId);
      const cCard = state.cards[cId]!;
      const rCard = state.cards[rId]!;
      cCard.zone = "runner:score";
      rCard.zone = "corp:score";
      fireOnAgendaAddedToRunnerScore(state);
      log(
        state,
        `Exchange of Information — swap ${cCard.title} ↔ ${rCard.title}.`,
      );
      return { ok: true };
    }

    case "search_rd_play_operation": {
      const ops = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.corp.deck[i]!;
          state.corp.deck[i] = state.corp.deck[j]!;
          state.corp.deck[j] = tmp;
        }
        log(state, `Consulting Visit — no operation in R&D.`);
        return { ok: true };
      }
      if (ops.length === 1) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "play_resolve",
          cardId: ops[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ops.map((cardId) => ({
          id: `cv:${cardId}`,
          label: `Play ${state.cards[cardId]!.title}`,
          effect: fx.do({ kind: "play_resolve", cardId }),
        })),
      };
      return { ok: true };
    }

    case "play_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.deck.includes(cardId)) {
        log(state, `Consulting Visit — operation no longer in R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== cardId);
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      enterLingeringPlayArea(state, cardId, "corp");
      log(state, `Consulting Visit — play ${card.title} from R&D.`);
      if (card.onPlay) {
        state.pendingChoice = {
          sourceId: cardId,
          chooser: "corp",
          options: [
            {
              id: "resolve-op",
              label: `Resolve ${card.title}`,
              effect: card.onPlay,
            },
          ],
        };
      }
      return { ok: true };
    }

    case "tlm_out_of_ashes_rfg_and_run": {
      if (!state.runner.discardPile.includes(sourceId)) {
        log(state, `Out of the Ashes — not in heap.`);
        return { ok: true };
      }
      rfgCard(ctx, sourceId);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: (Object.keys(state.servers) as ServerId[]).map((serverId) => ({
          id: `run:${serverId}`,
          label: `Run ${serverId}`,
          effect: fx.do({ kind: "queue_start_run", serverId }),
        })),
      };
      log(state, `Out of the Ashes — remove from game; make a run.`);
      return { ok: true };
    }

    case "tlm_puppet_master_place_advancement": {
      const targets: string[] = [];
      for (const sid of Object.keys(state.servers) as ServerId[]) {
        const server = state.servers[sid];
        for (const id of [...server.root, ...server.ice]) {
          const card = state.cards[id];
          if (!card) continue;
          if (card.side === "corp" && card.canAdvance) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `Puppet Master — no card that can be advanced.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((cardId) => ({
            id: `adv:${cardId}`,
            label: `Place 1 advancement on ${state.cards[cardId]!.title}`,
            effect: fx.do({
              kind: "resolve_puppet_master_place",
              cardId,
            }),
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      };
      return { ok: true };
    }

    case "resolve_puppet_master_place": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementCounters = (card.advancementCounters ?? 0) + 1;
      log(
        state,
        `Puppet Master — place 1 advancement on ${card.title} → ${card.advancementCounters}.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

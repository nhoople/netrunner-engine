/** Business First (bf) Mumbad pack primitives — v1.117.0. */
import { log } from "../../state/createGame.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import { moveRunnerCardToHeap } from "../../state/trashHooks.js";
import type { GameState, RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/pendingChoice.js";


function trashCorpToArchives(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.corp.discardPile.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
}

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function nextRemoteId(state: EffectCtx["state"]): ServerId {
  let n = 1;
  while (state.servers[`remote-${n}` as ServerId]) n += 1;
  return `remote-${n}` as ServerId;
}

/**
 * CBI Raid: Corp chooses the order of every HQ card onto the top of R&D
 * (printed "in the order of their choice"). One pick at a time; a lone
 * remaining card is placed automatically.
 */
function offerCbiRaidHqToRd(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const hq = [...state.corp.hand];
  if (hq.length === 0) {
    log(state, `CBI Raid — HQ empty; skip breach.`);
    return { ok: true };
  }
  if (hq.length === 1) {
    const id = hq[0]!;
    state.corp.hand = [];
    state.corp.deck.unshift(id);
    const card = state.cards[id]!;
    card.zone = "corp:rd";
    card.faceup = false;
    log(state, `CBI Raid — ${card.title} to top of R&D.`);
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: hq.map((id) => ({
      id: `cbi:${id}`,
      label: `Top of R&D: ${state.cards[id]!.title}`,
      effect: fx.do({ kind: "place_hq_on_top_rd_continue", cardId: id }),
    })),
logLine: `CBI Raid — Corp chooses next HQ card for top of R&D (${hq.length} left).`,
});
  return { ok: true };
}

/**
 * Printed: "discards down to their maximum hand size" — the Runner chooses
 * each discard. Offer one discard at a time until the grip is at the limit.
 */
function offerDiscardDownToHandSize(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const max = state.runner.maxHandSize ?? 5;
  if (state.runner.hand.length <= max) return { ok: true };
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: state.runner.hand.map((id) => ({
      id: `harvester-discard:${id}`,
      label: `Discard ${state.cards[id]!.title}`,
      effect: fx.do({
        kind: "draw_then_discard_down_to_hand_size_continue",
        cardId: id,
      }),
    })),
  });
  return { ok: true };
}

export function applyMumbadBfPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "rez_emp_device_limit_ice_this_run": {
      if (state.run) {
        state.run.bfMaxIceRezThisRun = 1;
        state.run.bfIceRezzedThisRun = state.run.bfIceRezzedThisRun ?? 0;
      }
      log(
        state,
        `${source?.title ?? "EMP Device"} — Corp cannot rez more than 1 ice this run.`,
      );
      return { ok: true };
    }

    case "breach_instead_cbi_raid": {
      // Printed: instead of breaching HQ, the Corp adds all cards in HQ to
      // the top of R&D in the order of their choice (CR 1.2.1).
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      return offerCbiRaidHqToRd(ctx);
    }

    case "place_hq_on_top_rd_continue": {
      const id = (action as { cardId?: string }).cardId;
      if (!id || !state.corp.hand.includes(id)) return { ok: true };
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const card = state.cards[id]!;
      card.zone = "corp:rd";
      card.faceup = false;
      log(state, `CBI Raid — ${card.title} to top of R&D.`);
      return offerCbiRaidHqToRd(ctx);
    }

    case "cannot_steal_copies_of_revealed_agenda": {
      if (!source) return { ok: true };
      const power = source.powerCounters ?? 0;
      const agendas = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "agenda" &&
          typeof c.agendaPoints === "number" &&
          c.agendaPoints > 0 &&
          c.agendaPoints <= power
        );
      });
      if (agendas.length === 0) {
        log(state, `Lakshmi Smartfabrics — no eligible agenda in HQ.`);
        return { ok: true };
      }
      if (agendas.length === 1) {
        const id = agendas[0]!;
        const card = state.cards[id]!;
        const x = card.agendaPoints ?? 0;
        source.powerCounters = power - x;
        const defId = card.defId ?? id;
        state.turn.bfCannotStealAgendaDefIds = [
          ...(state.turn.bfCannotStealAgendaDefIds ?? []),
          defId,
        ];
        log(
          state,
          `Lakshmi Smartfabrics — reveal ${card.title} (${x}); Runner cannot steal copies this turn.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => {
          const card = state.cards[id]!;
          const x = card.agendaPoints ?? 0;
          return {
            id: `lakshmi:${id}`,
            label: `Reveal ${card.title} (${x} pts)`,
            effect: fx.do({
              kind: "reveal_lakshmi_agenda_resolve",
              cardId: id,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "reveal_lakshmi_agenda_resolve": {
      if (!source) return { ok: true };
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) return { ok: true };
      const card = state.cards[id]!;
      const x = card.agendaPoints ?? 0;
      const power = source.powerCounters ?? 0;
      if (power < x) {
        log(state, `Lakshmi Smartfabrics — not enough power counters.`);
        return { ok: true };
      }
      source.powerCounters = power - x;
      const defId = card.defId ?? id;
      state.turn.bfCannotStealAgendaDefIds = [
        ...(state.turn.bfCannotStealAgendaDefIds ?? []),
        defId,
      ];
      log(
        state,
        `Lakshmi Smartfabrics — reveal ${card.title} (${x}); Runner cannot steal copies this turn.`,
      );
      return { ok: true };
    }

    case "trash_rezzed_gain_trash_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c?.rezzed && (c.type === "asset" || c.type === "upgrade")) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `Product Recall — no rezzed asset/upgrade.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        const card = state.cards[id]!;
        const gainAmt = card.trashCost ?? 0;
        trashCorpToArchives(state, id);
        state.corp.credits += gainAmt;
        log(state, `Product Recall — trash ${card.title}; gain ${gainAmt}¢.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => {
          const card = state.cards[id]!;
          const gainAmt = card.trashCost ?? 0;
          return {
            id: `recall:${id}`,
            label: `Trash ${card.title} → gain ${gainAmt}¢`,
            effect: fx.do({
              kind: "resolve_product_recall",
              cardId: id,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "resolve_product_recall": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card?.rezzed) return { ok: true };
      const gainAmt = card.trashCost ?? 0;
      trashCorpToArchives(state, id);
      state.corp.credits += gainAmt;
      log(state, `Product Recall — trash ${card.title}; gain ${gainAmt}¢.`);
      return { ok: true };
    }

    case "draw_then_discard_down_to_hand_size": {
      const n = action.drawAmount ?? 3;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        state.runner.hand.push(top);
        const c = state.cards[top]!;
        c.zone = "runner:grip";
      }
      log(state, `Harvester — Runner draws ${n}.`);
      return offerDiscardDownToHandSize(ctx);
    }

    case "draw_then_discard_down_to_hand_size_continue": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.hand.includes(cardId)) return { ok: true };
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      moveRunnerCardToHeap(state, cardId);
      log(state, `Harvester — Runner discards ${state.cards[cardId]!.title}.`);
      return offerDiscardDownToHandSize(ctx);
    }

    case "add_hq_to_bottom_rd": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Disposable HQ — HQ empty.`);
        return { ok: true };
      }
      for (const id of hq) {
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        state.corp.deck.push(id);
        const card = state.cards[id]!;
        card.zone = "corp:rd";
        card.faceup = false;
      }
      log(
        state,
        `Disposable HQ — add ${hq.length} HQ card(s) to bottom of R&D.`,
      );
      return { ok: true };
    }

    case "install_from_hq_new_remote": {
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "asset" || t === "agenda" || t === "upgrade" || t === "ice";
      });
      if (eligible.length === 0) {
        log(state, `New Construction — no installable HQ card.`);
        return { ok: true };
      }
      const adv = source?.advancementCounters ?? 0;
      const rezIgnore = adv >= 5;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: eligible.map((id) => ({
          id: `nc-install:${id}`,
          label: `Install ${state.cards[id]!.title} in new remote${
            rezIgnore ? " (rez ignoring costs)" : ""
          }`,
          effect: fx.do({
            kind: "install_new_construction_resolve",
            cardId: id,
            rezIgnoringCosts: rezIgnore,
          }),
        })),
      });
      return { ok: true };
    }

    case "install_new_construction_resolve": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) return { ok: true };
      const card = state.cards[id]!;
      const serverId = nextRemoteId(state);
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        root: [],
        ice: [],
      };
      state.nextRemoteNumber = Math.max(state.nextRemoteNumber, Number(serverId.replace("remote-", "")) + 1);
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      if (card.type === "ice") {
        state.servers[serverId]!.ice.push(id);
        card.zone = `server:${serverId}:ice`;
      } else {
        state.servers[serverId]!.root.push(id);
        card.zone = `server:${serverId}:root`;
      }
      card.faceup = Boolean(card.installFaceup);
      card.rezzed = false;
      if (
        action.rezIgnoringCosts &&
        card.type !== "agenda" &&
        card.type !== "ice"
      ) {
        card.rezzed = true;
        card.faceup = true;
        log(
          state,
          `New Construction — install and rez ${card.title} in ${serverId} (ignoring costs).`,
        );
      } else {
        log(state, `New Construction — install ${card.title} in ${serverId}.`);
      }
      return { ok: true };
    }

    case "bf_place_advancement_on_self": {
      if (!source) return { ok: true };
      const amount = action.amount ?? 1;
      source.advancementCounters = (source.advancementCounters ?? 0) + amount;
      log(
        state,
        `${source.title} — place ${amount} advancement → ${source.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "move_mumbad_construction_advancement_to_faceup": {
      if (!source || (source.advancementCounters ?? 0) < 1) {
        log(state, `Mumbad Construction Co. — no advancement to move.`);
        return { ok: true };
      }
      const faceup: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && id !== sourceId && (c.faceup || c.rezzed)) {
            faceup.push(id);
          }
        }
      }
      for (const id of state.corp.scoreArea) {
        if (state.cards[id]) faceup.push(id);
      }
      if (faceup.length === 0) {
        log(state, `Mumbad Construction Co. — no faceup destination.`);
        return { ok: true };
      }
      if (faceup.length === 1) {
        const id = faceup[0]!;
        source.advancementCounters = (source.advancementCounters ?? 0) - 1;
        const dest = state.cards[id]!;
        dest.advancementCounters = (dest.advancementCounters ?? 0) + 1;
        log(
          state,
          `Mumbad Construction Co. — move 1 advancement to ${dest.title}.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: faceup.map((id) => ({
          id: `mcc-move:${id}`,
          label: `Move advancement to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_mumbad_construction_advancement_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "move_mumbad_construction_advancement_resolve": {
      if (!source || (source.advancementCounters ?? 0) < 1) return { ok: true };
      const id = action.cardId;
      const dest = state.cards[id];
      if (!dest) return { ok: true };
      source.advancementCounters = (source.advancementCounters ?? 0) - 1;
      dest.advancementCounters = (dest.advancementCounters ?? 0) + 1;
      log(
        state,
        `Mumbad Construction Co. — move 1 advancement to ${dest.title}.`,
      );
      return { ok: true };
    }

    case "place_advancement_cannot_score_until_next_turn": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `PAD Factory — no advanceable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `pad-adv:${id}`,
          label: `Advance ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancement_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_resolve": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card) return { ok: true };
      card.advancementCounters = (card.advancementCounters ?? 0) + 1;
      if (!state.turn.cannotScoreOrRezCardIds.includes(id)) {
        state.turn.cannotScoreOrRezCardIds.push(id);
      }
      state.bfCannotScoreUntilNextCorpTurn = [
        ...(state.bfCannotScoreUntilNextCorpTurn ?? []),
        id,
      ];
      log(
        state,
        `PAD Factory — place 1 advancement on ${card.title}; cannot score until next Corp turn.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

/** Fear the Masses (ftm) Mumbad pack primitives — v1.121.0. */
import { log } from "../state/createGame.js";
import { startPsiGame } from "../state/psi.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashTopOfRd(state: EffectCtx["state"], n: number, label: string): void {
  let trashed = 0;
  for (let i = 0; i < n; i++) {
    const top = state.corp.deck[0];
    if (!top) break;
    state.corp.deck.shift();
    state.corp.discard.push(top);
    const card = state.cards[top];
    if (card) {
      card.zone = "corp:archives";
      card.faceup = true;
    }
    trashed += 1;
  }
  log(state, `${label} — trash ${trashed} card(s) from top of R&D.`);
}

export function applyMumbadFtmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "fear_the_masses_reveal_copies_trash_rd": {
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const copies = state.runner.hand.filter(
        (id) => state.cards[id]?.defId === "fear-the-masses",
      );
      // Auto-reveal all copies in grip (max fidelity for set-complete).
      for (const id of copies) {
        state.cards[id]!.faceup = true;
      }
      const x = 1 + copies.length;
      trashTopOfRd(state, x, source?.title ?? "Fear the Masses");
      log(
        state,
        `Fear the Masses — revealed ${copies.length} copy(ies); trash ${x} from R&D.`,
      );
      return { ok: true };
    }

    case "trash_own_resource_with_subtype": {
      const subtype = action.subtype;
      const resources = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "resource" && (c.subtypes ?? []).includes(subtype)
        );
      });
      if (resources.length === 0) {
        return {
          ok: false,
          error: `Must trash an installed ${subtype} resource — none available.`,
          cites: [],
        };
      }
      if (resources.length === 1) {
        const resId = resources[0]!;
        const title = state.cards[resId]!.title;
        moveRunnerCardToHeap(state, resId);
        log(state, `Trash own ${subtype} resource ${title}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: resources.map((id) => ({
          id: `trash-own-sub:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_own_resource_with_subtype_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "trash_own_resource_with_subtype_resolve": {
      const cardId = action.cardId;
      if (!state.runner.rig.includes(cardId)) return { ok: true };
      moveRunnerCardToHeap(state, cardId);
      log(state, `Trash own resource ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }

    case "next_corp_turn_cannot_advance_cards": {
      state.corpCannotAdvanceCardsNextTurn = true;
      log(
        state,
        `${source?.title ?? "The Price of Freedom"} — Corp cannot advance cards during their next turn.`,
      );
      return { ok: true };
    }

    case "ankusa_add_fully_broken_barrier_to_hq": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) return { ok: true };
      const ice = state.cards[iceId];
      if (!ice || !(ice.subtypes ?? []).includes("barrier")) {
        return { ok: true };
      }
      removeCardFromCurrentZone(state, iceId);
      // Clear server ice slot
      for (const server of Object.values(state.servers)) {
        const idx = server.ice.indexOf(iceId);
        if (idx >= 0) server.ice.splice(idx, 1);
      }
      ice.zone = "corp:hq";
      ice.rezzed = false;
      ice.faceup = false;
      ice.hostId = undefined;
      state.corp.hand.push(iceId);
      log(
        state,
        `Ankusa — add fully broken barrier ${ice.title} to HQ.`,
      );
      return { ok: true };
    }

    case "rigged_results_secret_spend_guess": {
      // Psi-style: Runner bid 0–2; Corp guesses. Differ → choose ice + run + bypass.
      startPsiGame(
        state,
        sourceId,
        2,
        fx.do({ kind: "rigged_results_corp_guessed_wrong" }),
        fx.do({ kind: "rigged_results_corp_guessed_right" }),
      );
      return { ok: true };
    }

    case "rigged_results_corp_guessed_right": {
      log(state, `Rigged Results — Corp guessed correctly; no run.`);
      return { ok: true };
    }

    case "rigged_results_corp_guessed_wrong": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) iceIds.push(id);
      }
      if (iceIds.length === 0) {
        log(state, `Rigged Results — no ice to choose.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => {
          const ice = state.cards[id]!;
          const serverId =
            (Object.entries(state.servers).find(([, s]) =>
              s.ice.includes(id),
            )?.[0] as ServerId | undefined) ?? "hq";
          return {
            id: `rr-ice:${id}`,
            label: `Run past ${ice.title}`,
            effect: fx.do({
              kind: "rigged_results_run_bypass_ice",
              iceId: id,
              serverId,
            }),
          };
        }),
      };
      return { ok: true };
    }

    case "rigged_results_run_bypass_ice": {
      state.turn.ftmRiggedResultsBypassIceId = action.iceId;
      state.pendingRunEventStart = {
        sourceId,
        serverId: action.serverId as ServerId,
      };
      log(
        state,
        `Rigged Results — run ${action.serverId}; first encounter of chosen ice bypasses.`,
      );
      return { ok: true };
    }

    case "ibrahim_salem_name_type_trash_from_grip": {
      const types = ["event", "hardware", "program", "resource"];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `ibrahim-type:${t}`,
          label: `Name ${t}`,
          effect: fx.do({
            kind: "ibrahim_salem_trash_named_type",
            cardType: t,
          }),
        })),
      };
      return { ok: true };
    }

    case "ibrahim_salem_trash_named_type": {
      const matches = state.runner.hand.filter(
        (id) => state.cards[id]?.type === action.cardType,
      );
      for (const id of state.runner.hand) {
        state.cards[id]!.faceup = true;
      }
      if (matches.length === 0) {
        log(
          state,
          `Ibrahim Salem — no ${action.cardType} in grip.`,
        );
        return { ok: true };
      }
      if (matches.length === 1) {
        moveRunnerCardToHeap(state, matches[0]!);
        log(
          state,
          `Ibrahim Salem — trash ${state.cards[matches[0]!]!.title}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: matches.map((id) => ({
          id: `ibrahim-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "ibrahim_salem_trash_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "ibrahim_salem_trash_resolve": {
      if (!state.runner.hand.includes(action.cardId)) return { ok: true };
      moveRunnerCardToHeap(state, action.cardId);
      log(
        state,
        `Ibrahim Salem — trash ${state.cards[action.cardId]!.title}.`,
      );
      return { ok: true };
    }

    case "election_day_trash_hq_draw": {
      const hq = [...state.corp.hand];
      if (hq.length < 1) {
        return {
          ok: false,
          error: "Election Day requires at least 1 card in HQ.",
          cites: [],
        };
      }
      for (const id of hq) {
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        state.corp.discard.push(id);
        const card = state.cards[id];
        if (card) {
          card.zone = "corp:archives";
          card.faceup = true;
        }
      }
      log(state, `Election Day — trash ${hq.length} card(s) from HQ.`);
      const drawN = action.amount ?? 5;
      for (let i = 0; i < drawN; i++) {
        const top = state.corp.deck[0];
        if (!top) break;
        state.corp.deck.shift();
        state.corp.hand.push(top);
        state.cards[top]!.zone = "corp:hq";
      }
      log(state, `Election Day — draw ${drawN}.`);
      return { ok: true };
    }

    case "subcontract_play_ops_from_hq": {
      const max = action.max ?? 2;
      const ops = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Subcontract — no operations in HQ.`);
        return { ok: true };
      }
      state.turn.ftmSubcontractRemaining = max;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => ({
            id: `subcontract-play:${id}`,
            label: `Play ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "subcontract_play_op_resolve",
              cardId: id,
            }),
          })),
          {
            id: "subcontract-done",
            label: "Done playing operations",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      };
      return { ok: true };
    }

    case "subcontract_play_op_resolve": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      // Mark as resolving via play_operation stub — leave in HQ and flag for engine play.
      state.turn.ftmSubcontractPlayCardId = cardId;
      const remaining = (state.turn.ftmSubcontractRemaining ?? 1) - 1;
      state.turn.ftmSubcontractRemaining = remaining;
      log(
        state,
        `Subcontract — play ${state.cards[cardId]!.title} (remaining ${remaining}).`,
      );
      // Resolve by moving to play area and evaluating onPlay if present.
      state.corp.hand.splice(idx, 1);
      const card = state.cards[cardId]!;
      card.zone = "corp:play-area";
      if (card.onPlay) {
        // Nested eval via pending — simplified: flag only.
        state.pendingChoice = {
          sourceId: cardId,
          chooser: "corp",
          options: [
            {
              id: "subcontract-resolve-onplay",
              label: `Resolve ${card.title}`,
              effect: card.onPlay,
            },
          ],
        };
      }
      if (remaining > 0) {
        const ops = state.corp.hand.filter(
          (id) => state.cards[id]?.type === "operation",
        );
        if (ops.length > 0) {
          const continueChoice = {
            sourceId,
            chooser: "corp" as const,
            options: [
              ...ops.map((id) => ({
                id: `subcontract-play:${id}`,
                label: `Play ${state.cards[id]!.title}`,
                effect: fx.do({
                  kind: "subcontract_play_op_resolve",
                  cardId: id,
                }),
              })),
              {
                id: "subcontract-done",
                label: "Done playing operations",
                effect: fx.gainCredits("corp", 0),
              },
            ],
          };
          if (!state.pendingChoice) {
            state.pendingChoice = continueChoice;
          }
        }
      }
      return { ok: true };
    }

    default:
      return null;
  }
}

/** Fear the Masses (ftm) Mumbad pack primitives — v1.121.0. */
import { openCardName } from "../../state/seatVisibility.js";
import { lookAtCards, revealCards } from "../../state/reveal.js";
import { log } from "../../state/createGame.js";
import { startPsiGame } from "../../state/psi.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import { chooseCards } from "../chooseCards.js";
import { evalEffect } from "../eval.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { trashCard } from "../../state/procedures/trash.js";
import { uninstallCard } from "../../state/procedures/uninstall.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function trashTopOfRd(
  state: EffectCtx["state"],
  n: number,
  label: string,
): void {
  let trashed = 0;
  for (let i = 0; i < n; i++) {
    const top = state.corp.deck[0];
    if (!top) break;
    // "Force the Corp to trash": the Corp carries it out (CR 1.14.5).
    // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
    trashCard(state, top, { by: "corp" });
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
    case "reveal_copies_trash_rd": {
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const copies = state.runner.hand.filter(
        (id) => state.cards[id]?.defId === "fear-the-masses",
      );
      // "Reveal any number of copies": the Runner says how many (CR 1.15.2).
      if (!action.cardIds && copies.length > 0) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: copies,
            count: copies.length,
            upTo: true,
            purpose: "resume",
            label: "reveal from the grip",
            resume: { kind: "reveal_copies_trash_rd" },
          }),
        );
      }
      const shown = (action.cardIds ?? []).filter((id) => copies.includes(id));
      const x = 1 + shown.length;
      revealCards(state, shown, sourceId);
      trashTopOfRd(state, x, source?.title ?? "Fear the Masses");
      log(
        state,
        `Fear the Masses — revealed ${shown.length} copy(ies); trash ${x} from R&D.`,
      );
      return { ok: true };
    }

    case "trash_own_resource_with_subtype": {
      const subtype = action.subtype;
      const resources = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c?.type === "resource" && (c.subtypes ?? []).includes(subtype);
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
        trashCard(state, resId);
        log(state, `Trash own ${subtype} resource ${title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
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
      });
      return { ok: true };
    }

    case "trash_own_resource_with_subtype_resolve": {
      const cardId = action.cardId;
      if (!state.runner.installed.includes(cardId)) return { ok: true };
      trashCard(state, cardId);
      log(state, `Trash own resource ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }

    case "corp_cannot_advance_cards_next_turn": {
      state.corpCannotAdvanceCardsNextTurn = true;
      log(
        state,
        `${source?.title ?? "The Price of Freedom"} — Corp cannot advance cards during their next turn.`,
      );
      return { ok: true };
    }

    case "add_fully_broken_barrier_to_hq": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) return { ok: true };
      const ice = state.cards[iceId];
      if (!ice || !(ice.subtypes ?? []).includes("barrier")) {
        return { ok: true };
      }
      uninstallCard(state, iceId, "hand");
      log(state, `Ankusa — add fully broken barrier ${ice.title} to HQ.`);
      return { ok: true };
    }

    case "spend_rigged_results_secret_guess": {
      // Psi-style: Runner bid 0–2; Corp guesses. Differ → choose ice + run + bypass.
      startPsiGame(
        state,
        sourceId,
        2,
        fx.do({ kind: "rigged_results_corp_guessed_wrong" }),
        fx.do({ kind: "rigged_results_corp_guessed_right" }),
        { corpGuess: "amount" }, // Corp guesses the amount; spends nothing
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
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => {
          const serverId =
            (Object.entries(state.servers).find(([, s]) =>
              s.ice.includes(id),
            )?.[0] as ServerId | undefined) ?? "hq";
          return {
            id: `rr-ice:${id}`,
            label: `Run past ${openCardName(state, id, "runner")}`,
            effect: fx.do({
              kind: "bypass_rigged_results_run_ice",
              iceId: id,
              serverId,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "bypass_rigged_results_run_ice": {
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

    case "trash_named_type": {
      // Ibrahim Salem: "Look at the Runner's grip and trash 1 card in it of
      // the named type." The Corp looks; nothing is revealed (CR 1.21.2).
      lookAtCards(state, [...state.runner.hand], sourceId, "corp");
      const matches = state.runner.hand.filter(
        (id) => state.cards[id]?.type === action.cardType,
      );
      if (matches.length === 0) {
        log(state, `Ibrahim Salem — no ${action.cardType} in grip.`);
        return { ok: true };
      }
      if (matches.length === 1) {
        trashCard(state, matches[0]!, { by: "corp" });
        log(state, `Ibrahim Salem — trash ${state.cards[matches[0]!]!.title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: matches.map((id) => ({
          id: `ibrahim-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_resolve": {
      if (!state.runner.hand.includes(action.cardId)) return { ok: true };
      trashCard(state, action.cardId, { by: "corp" });
      log(state, `Ibrahim Salem — trash ${state.cards[action.cardId]!.title}.`);
      return { ok: true };
    }

    case "trash_hq_draw": {
      const hq = [...state.corp.hand];
      if (hq.length < 1) {
        return {
          ok: false,
          error: "Election Day requires at least 1 card in HQ.",
          cites: [],
        };
      }
      for (const id of hq) {
        trashCard(state, id, { by: "corp" });
      }
      log(state, `Election Day — trash ${hq.length} card(s) from HQ.`);
      // The draw procedure: cards are set aside, draw triggers act on them,
      // then they go to HQ; an empty R&D at the draw loses (CR 8.4.2, 1.7.2c).
      return evalEffect(ctx, fx.draw("corp", action.amount ?? 5));
    }

    case "play_ops_from_hq": {
      const max = action.max ?? 2;
      const ops = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Subcontract — no operations in HQ.`);
        return { ok: true };
      }
      state.turn.ftmSubcontractRemaining = max;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => ({
            id: `subcontract-play:${id}`,
            label: `Play ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "play_op_resolve",
              cardId: id,
            }),
          })),
          {
            id: "subcontract-done",
            label: "Done playing operations",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      });
      return { ok: true };
    }

    case "play_op_resolve":
      return { ok: true };

    default:
      return null;
  }
}

/** Fear and Loathing / Double Time Spin pack primitives. */
import { breachAlreadyReplaced } from "../../state/breachReplacement.js";
import { log } from "../../state/createGame.js";
import { CR } from "../../timing/labels.js";
import { startPsiGame } from "../../state/psi.js";
import { startTrace } from "../../state/trace.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import {
  addLingeringEffect,
  LINGERING_KIND_GRANTED_SUBTYPES,
} from "../../state/continuous/lingeringEffects.js";
import { recomputeRunnerMaxHandSize } from "../../state/continuous/handSize.js";
import { preventPendingInstalledTrash } from "../../state/trashPrevent.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import { evalEffect, type EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { applySpinTcPrimitive } from "./breachTrashTurn.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { shuffleInPlace } from "../../state/rng.js";
import { controllerOf, trashCard } from "../../state/procedures/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySpinFalDtPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  switch (action.kind) {
    case "corp_trash_from_hq": {
      // "The Corp trashes 1 card from HQ" — the Corp chooses which card.
      if (state.corp.hand.length === 0) {
        log(state, `Hemorrhage — Corp HQ empty.`);
        return { ok: true };
      }
      // The text names the Corp, so the Corp trashes the card although the
      // ability is the Runner's (CR 1.14.5a).
      if (state.corp.hand.length === 1) {
        return evalEffect(
          ctx,
          fx.do({
            kind: "trash_hq_card",
            cardId: state.corp.hand[0]!,
            by: "corp",
          }),
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `hemorrhage:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: fx.do({ kind: "trash_hq_card", cardId: id, by: "corp" }),
        })),
      });
      return { ok: true };
    }
    case "tallie_perrault_on_ops_trashed": {
      // Printed text is a "may": the Runner chooses.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tallie-apply",
            label: "Give the Corp 1 bad publicity and take 1 tag",
            effect: fx.do({ kind: "give_bad_publicity_and_tag" }),
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
    case "give_bad_publicity_and_tag": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + 1;
      state.runner.tags = (state.runner.tags ?? 0) + 1;
      log(
        state,
        `Tallie Perrault — Corp takes 1 bad publicity; Runner takes 1 tag.`,
      );
      return { ok: true };
    }
    case "trash_exec_sysop_clone_remove_bp": {
      const subtypes = new Set(["sysop", "executive", "clone"]);
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id]!;
          if ((c.subtypes ?? []).some((s) => subtypes.has(s))) cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Restoring Face — no sysop/executive/clone to trash.`);
        return { ok: true };
      }
      if (cands.length === 1) {
        const id = cands[0]!;
        // "Reveal and trash": revealed, so faceup (CR 1.21.6, 4.4.6b).
        trashCard(state, id, { by: "corp", faceup: true });
        log(state, `Restoring Face — trash ${state.cards[id]!.title}.`);
        return applySpinTcPrimitive(ctx, {
          kind: "remove_bad_publicity_up_to",
          max: 2,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `restoring-face:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({
              kind: "trash_installed_corp_card",
              cardId: id,
              revealed: true,
            }),
            fx.do({ kind: "remove_bad_publicity_up_to", max: 2 }),
          ),
        })),
        logLine: `Restoring Face — choose sysop/executive/clone to trash.`,
      });
      return { ok: true };
    }
    case "trash_installed_corp_card": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || card.side !== "corp") return { ok: true };
      // A card the ability revealed goes to Archives faceup (CR 1.21.6, 4.4.6b).
      trashCard(state, id, {
        by: controllerOf(state, sourceId),
        faceup: action.revealed ? true : undefined,
      });
      log(state, `Trash installed ${card.title}.`);
      return { ok: true };
    }
    case "may_swap_with_hq": {
      const hqAgendaAsset = state.corp.hand.filter((id) => {
        const c = state.cards[id]!;
        return c.type === "agenda" || c.type === "asset";
      });
      if (hqAgendaAsset.length === 0) {
        log(state, `Toshiyuki Sakai — no agenda/asset in HQ to swap.`);
        return { ok: true };
      }
      // Printed "you may": the Corp may decline (CR 9.6.9).
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...hqAgendaAsset.map((id) => ({
            id: `toshiyuki-swap:${id}`,
            label: `Swap with ${state.cards[id]!.title} from HQ`,
            effect: fx.do({
              kind: "swap_execute",
              hqCardId: id,
            }),
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ],
        logLine: `Toshiyuki Sakai — may swap with agenda/asset from HQ.`,
      });
      return { ok: true };
    }
    case "swap_execute": {
      const hqId = action.hqCardId;
      const sakai = state.cards[sourceId];
      const incoming = state.cards[hqId];
      if (!sakai || !incoming) return { ok: true };
      const zoneParts = sakai.zone.split(":");
      const serverId = zoneParts[1] as ServerId;
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      const adv = sakai.advancementCounters ?? 0;
      removeCardFromCurrentZone(state, sourceId);
      removeCardFromCurrentZone(state, hqId);
      state.corp.hand = state.corp.hand.filter((x: string) => x !== hqId);
      server.root = server.root.filter((x: string) => x !== sourceId);
      incoming.zone = sakai.zone;
      incoming.rezzed = false;
      incoming.faceup = false;
      incoming.advancementCounters = adv;
      server.root.push(incoming.id);
      state.corp.hand.push(sourceId);
      state.cards[sourceId]!.zone = "corp:hq";
      state.cards[sourceId]!.faceup = false;
      log(
        state,
        `Toshiyuki Sakai — swap with ${incoming.title}; new card installed unrezzed with ${adv} advancement(s).`,
      );
      return { ok: true };
    }
    case "breach_instead_singularity_trash_root": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run) {
        log(state, `Singularity — no active run.`);
        return { ok: true };
      }
      // The printed replacement of the breach has no "may", so it is not
      // optional (CR 6.7.4c).
      log(
        state,
        `Singularity — instead of breaching, trash all cards in the server root.`,
      );
      return evalEffect(
        ctx,
        fx.seq(
          fx.do({ kind: "set_run_skip_breach" }),
          fx.do({ kind: "trash_attacked_server_root" }),
        ),
      );
    }
    case "install_program_from_grip": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Savoir-faire — no program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `savoir-faire:${id}`,
          label: `Install ${state.cards[id]!.title} from grip`,
          effect: fx.do({
            kind: "install_program_from_grip_paying_cost",
            cardId: id,
          }),
        })),
        logLine: `Savoir-faire — install a program from grip (pay install cost).`,
      });
      return { ok: true };
    }
    case "prevent_trash_resource": {
      preventPendingInstalledTrash(state);
      log(state, `Fall Guy — prevent trash of another resource.`);
      return { ok: true };
    }
    case "choose_ice_gain_subtype": {
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          const ice = state.cards[iceId];
          if (ice?.rezzed) cands.push(iceId);
        }
      }
      if (cands.length === 0) {
        log(state, `Paintbrush — no rezzed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `paintbrush:${id}`,
          label: `Paint ${state.cards[id]!.title} (gain subtype until end of next run)`,
          effect: fx.do({
            kind: "paintbrush_apply_subtype",
            iceId: id,
          }),
        })),
        logLine: `Paintbrush — choose rezzed ice to paint.`,
      });
      return { ok: true };
    }
    case "paintbrush_apply_subtype": {
      const ice = state.cards[action.iceId];
      if (!ice) return { ok: true };
      if (!action.subtype) {
        // "That ice gains sentry, code gate or barrier": the Runner chooses
        // which (CR 1.15.2).
        const subtypes = ["sentry", "code gate", "barrier"] as const;
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: subtypes.map((subtype) => ({
            id: `paintbrush-subtype:${subtype}`,
            label: `${ice.title} gains ${subtype}`,
            effect: fx.do({
              kind: "paintbrush_apply_subtype",
              iceId: action.iceId,
              subtype,
            }),
          })),
          logLine: `Paintbrush — choose the subtype ${ice.title} gains.`,
        });
        return { ok: true };
      }
      // A lingering effect, not a run: it lasts until the end of the next
      // run this turn (CR 9.10.1).
      addLingeringEffect(state, {
        createdBy: sourceId,
        duration: { kind: "next_run_this_turn" },
        kind: LINGERING_KIND_GRANTED_SUBTYPES,
        payload: { cardId: ice.id, subtypes: [action.subtype] },
      });
      log(
        state,
        `Paintbrush — ${ice.title} gains ${action.subtype} until the end of the next run this turn (CR ${CR.lingeringEffect.number}).`,
      );
      return { ok: true };
    }
    case "gyri_labyrinth_reduce_max_hand": {
      // Each resolution lowers it by 2 more, and all of it ends when the
      // Corp's next turn begins (CR 9.10.1).
      state.runner.handSizePenaltyUntilCorpTurn =
        (state.runner.handSizePenaltyUntilCorpTurn ?? 0) + 2;
      recomputeRunnerMaxHandSize(state);
      log(
        state,
        `Gyri Labyrinth — Runner max hand size −2 until Corp next turn (${state.runner.maxHandSize}).`,
      );
      return { ok: true };
    }
    case "reclamation_order_archives_to_hq": {
      // Printed: name a card, then add any number of copies of it from
      // Archives to HQ — not the whole Archives.
      const byDef = new Map<string, string[]>();
      for (const id of state.corp.discardPile) {
        const c = state.cards[id];
        if (!c?.defId || c.defId === state.cards[sourceId]?.defId) continue;
        const list = byDef.get(c.defId) ?? [];
        list.push(id);
        byDef.set(c.defId, list);
      }
      if (byDef.size === 0) {
        log(state, `Reclamation Order — no nameable card in Archives.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const [defId, ids] of byDef) {
        for (let k = 1; k <= ids.length; k++) {
          options.push({
            id: `reclaim:${defId}:${k}`,
            label: `Add ${k}× ${state.cards[ids[0]!]!.title} to HQ`,
            effect: fx.do({
              kind: "take_reclamation_copies_to_hq",
              defId,
              amount: k,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "take_reclamation_copies_to_hq": {
      const copies = state.corp.discardPile.filter(
        (id) => state.cards[id]?.defId === action.defId,
      );
      const take = copies.slice(0, Math.max(0, action.amount ?? 0));
      for (const id of take) {
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
        state.cards[id]!.faceup = true; // revealed
      }
      log(
        state,
        `Reclamation Order — ${take.length} cop${take.length === 1 ? "y" : "ies"} from Archives to HQ.`,
      );
      return { ok: true };
    }
    case "trace_prevent_bad_publicity": {
      // Printed: Trace[3]; if successful, prevent all of that bad publicity
      // (CR 1.2.1).
      const amount = state.turn.pendingBadPublicityTake ?? 1;
      const noop: Effect = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      };
      startTrace(
        state,
        sourceId,
        3,
        noop,
        fx.do({ kind: "suffer_bad_publicity", amount }),
      );
      log(
        state,
        `Broadcast Square — trace (base 3) instead of bad publicity; BP only if trace fails.`,
      );
      return { ok: true };
    }
    case "shuffle_corporate_hq_to_rd_draw": {
      const n = state.corp.hand.length;
      for (let i = 0; i < n; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      if (n > 0) shuffleInPlace(state, state.corp.deck);
      log(state, `Corporate Shuffle — shuffle ${n} from HQ into R&D.`);
      // The draw goes through the draw procedure, from the top of R&D
      // (CR 8.4.2). The Corp loses if R&D is empty when it must draw
      // (CR 1.7.2c).
      return evalEffect(
        ctx,
        fx.do({ kind: "draw", side: "corp", amount: action.draw }),
      );
    }
    case "spend_caprice_nisei_secret": {
      // Printed: both players secretly spend 0, 1, or 2 credits; if they
      // spent a different number, end the run. (No advancement condition.)
      if (!state.run) {
        log(state, `Caprice Nisei — no run.`);
        return { ok: true };
      }
      const noop: Effect = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      };
      startPsiGame(state, sourceId, 2, fx.do({ kind: "end_the_run" }), noop);
      log(state, `Caprice Nisei — secret spend / psi.`);
      return { ok: true };
    }
    case "add_etr_to_next_ice": {
      if (!state.run) {
        log(state, `Marker — no active run.`);
        return { ok: true };
      }
      state.run.markerExtraEtrNextIce = true;
      log(
        state,
        `Marker — next ice encountered gains ETR after its subroutines.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

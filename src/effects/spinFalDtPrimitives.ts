/** Fear and Loathing / Double Time Spin pack primitives. */
import { log } from "../state/createGame.js";
import { startPsiGame } from "../state/psi.js";
import { startTrace } from "../state/trace.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { noteCorpCardAddedToArchives } from "../state/trashHooks.js";
import { preventPendingInstalledTrash } from "../state/trashPrevent.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";
import { applySpinTcPrimitive } from "./spinTcPrimitives.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

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
      if (state.corp.hand.length === 1) {
        const id = state.corp.hand[0]!;
        removeCardFromCurrentZone(state, id);
        state.corp.discardPile.push(id);
        state.cards[id]!.zone = "corp:archives";
        state.cards[id]!.faceup = true;
        noteCorpCardAddedToArchives(state);
        log(state, `Hemorrhage — Corp trashes ${state.cards[id]!.title} from HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `hemorrhage:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: fx.do({ kind: "trash_hq_card", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "tallie_perrault_on_ops_trashed": {
      // Printed text is a "may": the Runner chooses.
      state.pendingChoice = {
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
      };
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
        removeCardFromCurrentZone(state, id);
        state.corp.discardPile.push(id);
        state.cards[id]!.zone = "corp:archives";
        state.cards[id]!.faceup = true;
        noteCorpCardAddedToArchives(state);
        log(state, `Restoring Face — trash ${state.cards[id]!.title}.`);
        return applySpinTcPrimitive(ctx, {
          kind: "remove_bad_publicity_up_to",
          max: 2,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `restoring-face:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({ kind: "trash_installed_corp_card", cardId: id }),
            fx.do({ kind: "remove_bad_publicity_up_to", max: 2 }),
          ),
        })),
      };
      log(state, `Restoring Face — choose sysop/executive/clone to trash.`);
      return { ok: true };
    }
    case "trash_installed_corp_card": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || card.side !== "corp") return { ok: true };
      removeCardFromCurrentZone(state, id);
      state.corp.discardPile.push(id);
      card.zone = "corp:archives";
      card.faceup = true;
      noteCorpCardAddedToArchives(state);
      log(state, `Trash installed ${card.title}.`);
      return { ok: true };
    }
    case "swap_with_hq": {
      const hqAgendaAsset = state.corp.hand.filter((id) => {
        const c = state.cards[id]!;
        return c.type === "agenda" || c.type === "asset";
      });
      if (hqAgendaAsset.length === 0) {
        log(state, `Toshiyuki Sakai — no agenda/asset in HQ to swap.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: hqAgendaAsset.map((id) => ({
          id: `toshiyuki-swap:${id}`,
          label: `Swap with ${state.cards[id]!.title} from HQ`,
          effect: fx.do({
            kind: "swap_execute",
            hqCardId: id,
          }),
        })),
      };
      log(state, `Toshiyuki Sakai — may swap with agenda/asset from HQ.`);
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
      if (!state.run) {
        log(state, `Singularity — no active run.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach the server",
            effect: fx.gainCredits("runner", 0),
          },
          {
            id: "singularity",
            label: "Instead of breaching: trash all cards in the server root",
            effect: fx.seq(
              fx.do({ kind: "set_run_skip_breach" }),
              fx.do({ kind: "trash_attacked_server_root" }),
            ),
          },
        ],
      };
      log(state, `Singularity — may instead of breaching trash the server root.`);
      return { ok: true };
    }
    case "install_program_from_grip": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Savoir-faire — no program in grip.`);
        return { ok: true };
      }
      state.pendingChoice = {
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
      };
      log(state, `Savoir-faire — install a program from grip (pay install cost).`);
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
      state.pendingChoice = {
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
      };
      log(state, `Paintbrush — choose rezzed ice to paint.`);
      return { ok: true };
    }
    case "paintbrush_apply_subtype": {
      if (!state.run) {
        state.run = {
          attackedServerId: "hq",
          phase: "movement",
          position: null,
          successful: null,
          accessedCardIds: [],
          accessCandidates: [],
          randomAccessLimit: null,
          accessingCardId: null,
          encounter: null,
          endedTheRun: false,
          cannotJackOut: false,
          paintbrushIceId: action.iceId,
        };
      } else {
        state.run.paintbrushIceId = action.iceId;
      }
      log(
        state,
        `Paintbrush — ${state.cards[action.iceId]?.title ?? action.iceId} gains chosen subtype until end of next run.`,
      );
      return { ok: true };
    }
    case "gyri_labyrinth_reduce_max_hand": {
      state.runner.maxHandSize = Math.max(0, state.runner.maxHandSize - 2);
      state.turn.gyriLabyrinthHandPenalty = true;
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
      state.pendingChoice = { sourceId, chooser: "corp", options };
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
      if (n > 0) state.corp.deck.reverse();
      let drawn = 0;
      for (let i = 0; i < action.draw && state.corp.deck.length > 0; i++) {
        const id = state.corp.deck.pop()!;
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
        state.cards[id]!.faceup = false;
        drawn++;
      }
      log(
        state,
        `Corporate Shuffle — shuffle ${n} from HQ into R&D; draw ${drawn}.`,
      );
      return { ok: true };
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
      log(state, `Marker — next ice encountered gains ETR after its subroutines.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

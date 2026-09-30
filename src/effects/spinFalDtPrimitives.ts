/** Fear and Loathing / Double Time Spin pack primitives. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { noteCorpCardAddedToArchives } from "../state/trashHooks.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";
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
    case "hemorrhage_corp_trash_from_hq": {
      if (state.corp.hand.length === 0) {
        log(state, `Hemorrhage — Corp HQ empty.`);
        return { ok: true };
      }
      const id = state.corp.hand.pop()!;
      const card = state.cards[id]!;
      removeCardFromCurrentZone(state, id);
      state.corp.discard.push(id);
      card.zone = "corp:archives";
      card.faceup = true;
      noteCorpCardAddedToArchives(state);
      log(state, `Hemorrhage — Corp trashes ${card.title} from HQ.`);
      return { ok: true };
    }
    case "tallie_perrault_on_ops_trashed": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + 1;
      state.runner.tags = (state.runner.tags ?? 0) + 1;
      log(
        state,
        `Tallie Perrault — Corp takes 1 bad publicity; Runner takes 1 tag.`,
      );
      return { ok: true };
    }
    case "restoring_face_trash_exec_sysop_clone_remove_bp": {
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
        state.corp.discard.push(id);
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
      state.corp.discard.push(id);
      card.zone = "corp:archives";
      card.faceup = true;
      noteCorpCardAddedToArchives(state);
      log(state, `Trash installed ${card.title}.`);
      return { ok: true };
    }
    case "toshiyuki_sakai_swap_with_hq": {
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
            kind: "toshiyuki_sakai_swap_execute",
            hqCardId: id,
          }),
        })),
      };
      log(state, `Toshiyuki Sakai — may swap with agenda/asset from HQ.`);
      return { ok: true };
    }
    case "toshiyuki_sakai_swap_execute": {
      const hqId = action.hqCardId;
      const sakai = state.cards[sourceId];
      const incoming = state.cards[hqId];
      if (!sakai || !incoming) return { ok: true };
      const zoneParts = sakai.zone.split(":");
      const serverId = zoneParts[1] as ServerId;
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      const adv = sakai.advancementTokens ?? 0;
      removeCardFromCurrentZone(state, sourceId);
      removeCardFromCurrentZone(state, hqId);
      state.corp.hand = state.corp.hand.filter((x: string) => x !== hqId);
      server.root = server.root.filter((x: string) => x !== sourceId);
      incoming.zone = sakai.zone;
      incoming.rezzed = false;
      incoming.faceup = false;
      incoming.advancementTokens = adv;
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
    default:
      return null;
  }
}

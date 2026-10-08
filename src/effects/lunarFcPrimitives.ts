/** First Contact (fc) Lunar pack primitives. */
import { log } from "../state/createGame.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { canPayCost, payCost } from "../state/costs.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function runnerPrograms(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => state.cards[id]?.type === "program");
}

export function applyLunarFcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "breach_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0 || !state.run) {
        log(state, `Kitsune — no cards in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Do not breach HQ",
            effect: fx.gainCredits("corp", 0),
          },
          ...hq.map((id) => ({
            id: `kitsune:${id}`,
            label: `Choose ${state.cards[id]!.title} — breach HQ`,
            effect: fx.do({ kind: "breach_hq_resolve", cardId: id }),
          })),
        ],
      };
      return { ok: true };
    }
    case "breach_hq_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.run) return { ok: true };
      state.run.attackedServerId = "hq";
      state.run.cannotAccessRoot = true;
      state.run.accessCandidates = [cardId];
      state.run.accessRemaining = 1;
      state.run.accessCandidatesPreset = true;
      state.run.kitsuneIceToTrashAtBreachEnd = sourceId;
      log(state, `Kitsune — breach HQ; first access ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }
    case "wendigo_ban_program": {
      const progs = runnerPrograms(state);
      if (progs.length === 0) {
        log(state, `Wendigo — no programs to ban.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `ban:${id}`,
          label: `Ban ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "wendigo_ban_program_resolve", programId: id }),
        })),
      };
      return { ok: true };
    }
    case "wendigo_ban_program_resolve": {
      const programId = (action as { programId: string }).programId;
      if (!state.run) return { ok: true };
      if (!state.run.bannedProgramInstanceIds) {
        state.run.bannedProgramInstanceIds = [];
      }
      state.run.bannedProgramInstanceIds.push(programId);
      log(
        state,
        `Wendigo — Runner cannot use ${state.cards[programId]!.title} this run.`,
      );
      return { ok: true };
    }
    case "rfg_runner_heap": {
      const heap = [...state.runner.discard];
      for (const id of heap) {
        state.cards[id]!.zone = "removed-from-game";
        state.cards[id]!.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(id)) state.removedFromGame.push(id);
      }
      state.runner.discard = [];
      log(state, `Chronos Project — remove ${heap.length} heap card(s) from the game.`);
      return { ok: true };
    }
    case "shattered_remains_access": {
      const adv = source?.advancementTokens ?? 0;
      if (adv <= 0) {
        log(state, `Shattered Remains — no advancement tokens.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Do not pay 1¢",
            effect: fx.gainCredits("corp", 0),
          },
          {
            id: "pay",
            label: `Pay 1¢ — trash ${adv} hardware`,
            effect: fx.do({
              kind: "shattered_remains_pay",
              hardwareCount: adv,
            }),
          },
        ],
      };
      return { ok: true };
    }
    case "shattered_remains_pay": {
      const n = (action as { hardwareCount: number }).hardwareCount;
      if (state.corp.credits < 1) {
        return { ok: false, error: "Cannot pay 1¢ for Shattered Remains.", cites: [] };
      }
      state.corp.credits -= 1;
      const hw = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      for (let i = 0; i < n && hw.length > 0; i++) {
        const id = hw.shift()!;
        moveRunnerCardToHeap(state, id);
        log(state, `Shattered Remains — trash ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    case "trash_one_installed_runner_program": {
      const progs = runnerPrograms(state);
      if (progs.length === 0) {
        log(state, `Trash program — none installed.`);
        return { ok: true };
      }
      if (progs.length === 1) {
        moveRunnerCardToHeap(state, progs[0]!);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `trash-prog:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "supplier_host_from_grip": {
      const host = state.cards[sourceId];
      if (!host?.supplierHost) return { ok: true };
      const candidates = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "resource" || t === "hardware";
      });
      if (candidates.length === 0) {
        log(state, `The Supplier — nothing to host from grip.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `host:${id}`,
          label: `Host ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "supplier_host_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "supplier_host_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const host = state.cards[sourceId];
      const card = state.cards[cardId];
      if (!host || !card) return { ok: true };
      state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
      card.hostId = sourceId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
      log(state, `The Supplier — host ${card.title}.`);
      return { ok: true };
    }
    case "supplier_turn_begin_install": {
      const host = state.cards[sourceId];
      const hosted = host?.hostedCardIds ?? [];
      if (hosted.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Do not install hosted card",
            effect: fx.gainCredits("runner", 0),
          },
          ...hosted.map((id) => ({
            id: `install:${id}`,
            label: `Install ${state.cards[id]!.title} (-2¢)`,
            effect: fx.do({ kind: "supplier_install_hosted", cardId: id }),
          })),
        ],
      };
      return { ok: true };
    }
    case "supplier_install_hosted": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      const host = state.cards[sourceId];
      if (!card || !host?.hostedCardIds?.includes(cardId)) return { ok: true };
      const cost = Math.max(0, (card.installCost ?? 0) - 2);
      if (!canPayCost(state, "runner", { credits: cost })) {
        return { ok: false, error: "Cannot pay install cost.", cites: [] };
      }
      payCost(state, "runner", { credits: cost }, "supplier-install", card);
      host.hostedCardIds = host.hostedCardIds!.filter((x) => x !== cardId);
      card.hostId = undefined;
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      log(state, `The Supplier — install ${card.title} for ${cost}¢.`);
      return { ok: true };
    }
    case "breach_archives": {
      if (!state.run) {
        log(state, `Hades Shard — breach Archives outside a run (stub).`);
        return { ok: true };
      }
      state.run.attackedServerId = "archives";
      state.run.cannotAccessRoot = true;
      state.run.accessCandidatesPreset = false;
      log(state, `Hades Shard — breach Archives (no root access).`);
      return { ok: true };
    }
    default:
      return null;
  }
}

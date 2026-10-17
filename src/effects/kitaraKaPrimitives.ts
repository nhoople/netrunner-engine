/** Kampala Ascendent (ka) Kitara pack primitives — v1.141.0. */
import { subtractRunnerCreditPool } from "../state/costs.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { effectiveIceStrength } from "../cards/stubs.js";
import { CR } from "../timing/labels.js";
import { log } from "../state/createGame.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applyKitaraKaPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "may_breach_instead_diversion_funds_ka": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Diversion of Funds — not a successful HQ run.`);
        return { ok: true };
      }
      const maxLose = Math.min(5, state.corp.credits);
      const options: Array<{
        id: string;
        label: string;
        effect: ReturnType<typeof fx.do>;
      }> = [
        {
          id: "breach",
          label: "Breach HQ",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        },
      ];
      for (let n = 0; n <= maxLose; n++) {
        options.push({
          id: `divert:${n}`,
          label:
            n === 0
              ? "Force Corp to lose 0¢"
              : `Force Corp to lose ${n}¢; gain ${n}¢`,
          effect: fx.do({
            kind: "resolve_diversion_of_funds",
            loseAmount: n,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `Diversion of Funds — may instead of breaching HQ.`);
      return { ok: true };
    }

    case "resolve_diversion_of_funds": {
      if (state.run) state.run.skipBreach = true;
      const lose = Math.min(action.loseAmount, state.corp.credits);
      state.corp.credits -= lose;
      state.runner.credits += lose;
      log(
        state,
        `Diversion of Funds — Corp loses ${lose}¢; Runner gains ${lose}¢.`,
      );
      return { ok: true };
    }

    case "install_reclaim_from_heap": {
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (c.type === "program" || c.type === "hardware") return true;
        return c.type === "resource" && (c.subtypes ?? []).includes("virtual");
      });
      if (candidates.length === 0) {
        log(state, `Reclaim — no program/hardware/virtual in heap.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `reclaim:${id}`,
          label: `Install ${state.cards[id]!.title} from heap (pay install cost)`,
          effect: fx.do({ kind: "install_reclaim_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "install_reclaim_resolve": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = card.installCost ?? 0;
      if (state.runner.credits < cost) {
        log(state, `Reclaim — cannot afford ${card.title} (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      const idx = state.runner.discardPile.indexOf(action.cardId);
      if (idx >= 0) state.runner.discardPile.splice(idx, 1);
      card.zone = "runner:installed";
      card.hostId = undefined;
      state.runner.installed.push(action.cardId);
      log(state, `Reclaim — install ${card.title} for ${cost}¢.`);
      return { ok: true };
    }

    case "ka_black_hat_bonus_access": {
      state.turn.kaBlackHatBonusAccess = 2;
      log(
        state,
        `Black Hat — +2 access whenever you breach HQ or R&D remainder of turn.`,
      );
      return { ok: true };
    }

    case "install_mti_ice_innermost_from_hq": {
      if (!state.run) {
        log(state, `Mti Mwekundu — no active run.`);
        return { ok: true };
      }
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Mti Mwekundu — no ice in HQ.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: iceInHq.map((id) => ({
          id: `mti:${id}`,
          label: `Install ${state.cards[id]!.title} innermost on ${serverId}`,
          effect: fx.do({
            kind: "install_mti_resolve",
            iceId: id,
            serverId,
          }),
        })),
      };
      return { ok: true };
    }

    case "install_mti_resolve": {
      if (!state.run) return { ok: true };
      const ice = state.cards[action.iceId];
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!ice || !server) return { ok: true };
      const hqIdx = state.corp.hand.indexOf(action.iceId);
      if (hqIdx >= 0) state.corp.hand.splice(hqIdx, 1);
      // Innermost = end of ice array (highest index).
      const hadApproachedIce = (state.run.passedIceIds?.length ?? 0) > 0;
      server.ice.push(action.iceId);
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = false;
      ice.faceup = false;
      state.run.position = server.ice.length - 1;
      state.run.encounter = null;
      log(
        state,
        `Mti Mwekundu — install ${ice.title} innermost on ${serverId}; Runner approaches it.`,
      );
      if (hadApproachedIce) {
        return evalEffect(ctx, fx.do({ kind: "offer_jack_out" }));
      }
      return { ok: true };
    }

    case "ka_market_forces": {
      const tags = state.runner.tags;
      const want = tags * 3;
      const lost = Math.min(want, state.runner.credits);
      subtractRunnerCreditPool(state, lost);
      state.corp.credits += lost;
      log(
        state,
        `Market Forces — Runner loses ${lost}¢ (${tags} tag(s) × 3); Corp gains ${lost}¢.`,
      );
      return { ok: true };
    }

    case "give_tags_per_two_advancements": {
      const adv = source?.advancementCounters ?? 0;
      const amount = Math.floor(adv / 2);
      if (amount <= 0) {
        log(state, `False Flag — 0 tags (advancements=${adv}).`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount }));
    }

    case "trace_strength_equal_source_strength": {
      const definingAbilityInactive =
        !source?.rezzed ||
        source.zone === "corp:archives" ||
        abilitiesSuppressed(state, sourceId);
      const strength = definingAbilityInactive
        ? 0
        : effectiveIceStrength(state, sourceId);
      if (definingAbilityInactive) {
        log(
          state,
          `${source?.title ?? sourceId} — X is 0 (CR ${CR.valueDefinedByX.number}).`,
        );
      }
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "trace",
          strength,
          onSuccess:
            action.onSuccess ??
            fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          ...(action.onFailure ? { onFailure: action.onFailure } : {}),
        },
      });
    }

    default:
      return null;
  }
}

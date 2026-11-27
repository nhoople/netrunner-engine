/** Martial Law (ml) Flashpoint pack primitives — v1.126.0. */
import { CR } from "../../timing/labels.js";
import {
  breakNextSubroutines,
  interfaceBlock,
  runnerBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { addBreakerStrengthBoostThisEncounter } from "../../state/continuous/lingeringEffects.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { moveRunnerToOutermost } from "../../state/uninstallAndPosition/runPosition.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointMlPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "spend_mkultra_pump_and_break": {
      if (!state.run?.encounter) {
        log(state, `MKUltra — no encounter.`);
        return { ok: true };
      }
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: 2,
      });
      log(state, `MKUltra — +2 strength this encounter.`);
      const enc = state.run.encounter;
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("sentry")) {
        return { ok: true };
      }
      // "Then, if this program can interface with the sentry" (CR 3.9.5g).
      const blocked =
        interfaceBlock(state, sourceId, enc.iceId) ??
        runnerBreakBlock(state, sourceId, enc.iceId);
      if (blocked) {
        log(state, `MKUltra — cannot interface: ${blocked.error}`);
        return { ok: true };
      }
      const toBreak = breakNextSubroutines(state, sourceId, 2);
      if (toBreak.length > 0) {
        log(state, `MKUltra — break ${toBreak.length} sentry subroutine(s).`);
      }
      return { ok: true };
    }

    case "prevent_tags_or_damage": {
      const max = Math.max(0, action.max ?? 3);
      const pendingTags = state.pendingTags?.remaining ?? 0;
      const pendingDmg = state.pendingDamage?.remaining ?? 0;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (pendingTags > 0) {
        const n = Math.min(max, pendingTags);
        options.push({
          id: "prevent-tags",
          label: `Prevent ${n} tag(s)`,
          effect: fx.do({ kind: "prevent_pending_tags", amount: n }),
        });
      }
      if (pendingDmg > 0) {
        const n = Math.min(max, pendingDmg);
        options.push({
          id: "prevent-dmg",
          label: `Prevent ${n} damage`,
          effect: fx.do({ kind: "prevent_pending_damage", amount: n }),
        });
      }
      if (options.length === 0) {
        log(state, `On the Lam — nothing to prevent.`);
        return { ok: true };
      }
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "spend_x_remove_tags": {
      const tags = state.runner.tags;
      const credits = state.runner.credits;
      if (tags <= 0 || credits <= 0) {
        log(state, `Misdirection — no tags or credits.`);
        return { ok: true };
      }
      const maxX = Math.min(tags, credits);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `misdirection-x:${x}`,
          label: `Spend ${x}¢: remove ${x} tag(s)`,
          effect: fx.do({
            kind: "spend_x_remove_tags_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "spend_x_remove_tags_resolve": {
      const x = action.amount ?? 0;
      if (x <= 0 || state.runner.credits < x) {
        log(state, `Misdirection — cannot afford ${x}¢.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, x);
      const removed = Math.min(x, state.runner.tags);
      state.runner.tags -= removed;
      log(
        state,
        `Misdirection — spend ${x}¢ → remove ${removed} tag(s) (${state.runner.tags} remain).`,
      );
      return { ok: true };
    }

    case "psi_differ_redirect": {
      const current = state.run?.attackedServerId;
      const servers = Object.values(state.servers).filter(
        (s) => s.id !== current,
      );
      if (servers.length === 0 || !state.run) {
        log(state, `Mind Game — no other server.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((s) => ({
          id: `mind:${s.id}`,
          label: `Move run to ${s.id}`,
          effect: fx.do({
            kind: "redirect_resolve",
            serverId: s.id,
          }),
        })),
      });
      return { ok: true };
    }

    case "redirect_resolve": {
      const serverId = action.serverId as ServerId | undefined;
      if (!state.run || !serverId || !state.servers[serverId]) {
        log(state, `Mind Game — invalid redirect.`);
        return { ok: true };
      }
      // "The Runner moves to the outermost position of that server"
      // (CR 6.2.8b): no position, not −1, when it has no ice.
      const moved = moveRunnerToOutermost(state, serverId);
      (
        state.run as {
          jackOutAdditionalCostAddInstalledToStackBottom?: boolean;
        }
      ).jackOutAdditionalCostAddInstalledToStackBottom = true;
      log(
        state,
        moved
          ? `Mind Game — move to outermost of ${serverId}; jack out costs +1 installed to stack bottom.`
          : `Mind Game — the Runner cannot move to a position now (CR ${CR.ineffectiveMove.number}); jack out costs +1 installed to stack bottom.`,
      );
      return evalEffect(ctx, fx.do({ kind: "offer_jack_out" }));
    }

    case "give_tags_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 1;
      const has = state.runner.installed.some((id) =>
        (state.cards[id]?.subtypes ?? [])
          .map((s) => s.toLowerCase())
          .includes(subtype),
      );
      if (!has) {
        log(state, `IP Block — no installed ${subtype}; no tag.`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount }));
    }

    default:
      return null;
  }
}

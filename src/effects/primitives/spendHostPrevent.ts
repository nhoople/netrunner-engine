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
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
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

    case "host_on_installed_resource_as_condition": {
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `On the Lam — no installed resource to host on.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: resources.map((id) => ({
          id: `host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_self_as_condition",
            hostId: id,
          }),
        })),
      });
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

    case "trash_one_program_used_this_run_cannot_prevent": {
      // Printed: trash 1 installed program you used during that run (CR 1.2.1).
      // Prefer explicit programsUsedThisRun; also count breakers that broke.
      const bag = state.run as
        | {
            programsUsedThisRun?: string[];
            breakersThatBroke?: string[];
          }
        | null
        | undefined;
      const fromBag = bag?.programsUsedThisRun ?? [];
      const fromBreakers = bag?.breakersThatBroke ?? [];
      const candidates = [...new Set([...fromBag, ...fromBreakers])].filter(
        (id) => {
          const c = state.cards[id];
          return (
            c && c.type === "program" && state.runner.installed.includes(id)
          );
        },
      );
      if (candidates.length === 0) {
        log(state, `Cold Read — no program used this run to trash.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        const id = candidates[0]!;
        trashCard(state, id, {
          by: controllerOf(state, sourceId),
          preventable: false,
        });
        log(
          state,
          `Cold Read — trash ${state.cards[id]!.title} (cannot prevent).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_program_cannot_prevent",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "trash_program_cannot_prevent": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.installed.includes(cardId)) {
        log(state, `Cold Read — program not installed.`);
        return { ok: true };
      }
      trashCard(state, cardId, {
        by: controllerOf(state, sourceId),
        preventable: false,
      });
      log(
        state,
        `Cold Read — trash ${state.cards[cardId]!.title} (cannot prevent).`,
      );
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

/** The Source (ts) Lunar pack primitives. */
import { breachAlreadyReplaced } from "../../state/access/breachReplacement.js";
import { breakNextSubroutines } from "../../state/procedures/break.js";
import { subtractRunnerCreditPool } from "../../state/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { dealDamage } from "../../state/damageAndPrevention/damage.js";
import { addIceStrengthBoostThisTurn } from "../../state/continuous/lingeringEffects.js";
import { autoResolveTrace } from "../../state/trace.js";
import { chargeCard } from "../../state/msKeywords.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import {
  evalEffect,
  noteSearchConditionalAbilities,
  type EffectCtx,
} from "../eval.js";
import { chooseCards } from "../chooseCards.js";
import { shuffleRunnerStack } from "../runnerInstall.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function serverIdForCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  const zone = state.cards[cardId]?.zone ?? "";
  if (!zone.startsWith("server:")) return null;
  const parts = zone.split(":");
  return (parts[1] as ServerId) ?? null;
}

export function applyLunarTsPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "helium3_place_up_to_2_power": {
      // "a card with at least 1 power counter on it": any card, either
      // side's, installed, scored or an identity (CR 1.2.1).
      const cands = Object.keys(state.cards).filter(
        (id) => (state.cards[id]!.powerCounters ?? 0) >= 1,
      );
      if (cands.length === 0) {
        log(state, `Helium-3 Deposit — no card with a power counter.`);
        return { ok: true };
      }
      const options: {
        id: string;
        label: string;
        effect: ReturnType<typeof fx.do>;
      }[] = [
        {
          id: "helium3-decline",
          label: "Decline",
          effect: fx.gainCredits("corp", 0),
        },
      ];
      for (const id of cands) {
        const title = state.cards[id]!.title;
        options.push({
          id: `helium3-1:${id}`,
          label: `Place 1 power on ${title}`,
          effect: fx.do({ kind: "helium3_place_n", cardId: id, amount: 1 }),
        });
        options.push({
          id: `helium3-2:${id}`,
          label: `Place 2 power on ${title}`,
          effect: fx.do({ kind: "helium3_place_n", cardId: id, amount: 2 }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "helium3_place_n": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount: number }).amount;
      for (let i = 0; i < amount; i++) {
        const r = chargeCard(state, cardId, sourceId);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "boost_ice": {
      // Cost already spent 1 power; bonus = remaining + 1 (the spent one).
      const bonus = (source?.powerCounters ?? 0) + 1;
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length === 0) {
        log(state, `IT Department — no rezzed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `it-boost:${id}`,
          label: `${state.cards[id]!.title} +${bonus} strength this turn`,
          effect: fx.do({
            kind: "boost_it_department_apply",
            cardId: id,
            amount: bonus,
          }),
        })),
      });
      return { ok: true };
    }
    case "boost_it_department_apply": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount: number }).amount;
      addIceStrengthBoostThisTurn(state, {
        createdBy: sourceId,
        iceId: cardId,
        amount,
      });
      log(
        state,
        `IT Department — ${state.cards[cardId]?.title ?? cardId} +${amount} strength this turn.`,
      );
      return { ok: true };
    }
    case "runner_trashes_one_installed": {
      const installed = [...state.runner.installed];
      if (installed.length === 0) {
        log(state, `Markus 1.0 — Runner has no installed cards.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        trashCard(state, installed[0]!);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `trash-installed:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "rez_ice_per_tag": {
      const tags = state.runner.tags;
      if (tags <= 0) {
        log(state, `Shoot the Moon — Runner has no tags.`);
        return { ok: true };
      }
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id]?.rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Shoot the Moon — no unrezzed ice.`);
        return { ok: true };
      }
      state.turn.shootTheMoonRemaining = Math.min(tags, unrezzed.length);
      return applyShootTheMoonPick(ctx);
    }
    case "rez_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const ice = state.cards[cardId];
      if (ice && !ice.rezzed) {
        ice.rezzed = true;
        ice.faceup = true;
        log(state, `Shoot the Moon — rez ${ice.title} ignoring all costs.`);
      }
      state.turn.shootTheMoonRemaining =
        (state.turn.shootTheMoonRemaining ?? 1) - 1;
      if ((state.turn.shootTheMoonRemaining ?? 0) > 0) {
        return applyShootTheMoonPick(ctx);
      }
      state.turn.shootTheMoonRemaining = undefined;
      return { ok: true };
    }
    case "trace_troll_encounter": {
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "trace_troll_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_troll_success": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "troll-lose-click",
            label: "Lose [click]",
            effect: fx.do({
              kind: "lose_clicks",
              side: "runner",
              amount: 1,
            }),
          },
          {
            id: "troll-etr",
            label: "End the run",
            effect: fx.do({ kind: "end_the_run" }),
          },
        ],
      });
      return { ok: true };
    }
    case "trace_virgo_subroutine": {
      // "If successful, give the Runner 1 tag. If your trace strength is 5
      // or greater, give the Runner 1 tag": the second part does not need a
      // successful trace (CR 10.8.5). Tags go through the tag procedure, so
      // the Runner can avoid them (CR 9.9.6a).
      const tag = fx.do({ kind: "give_tags", amount: 1 });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: tag,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(tag, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "self_destruct_ability": {
      // Printed: only during a run on this server. After paying the [trash]
      // cost the upgrade is in Archives, so use the run's attacked server
      // (CR 1.2.1).
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `Self-destruct — only during a run on this server.`);
        return { ok: true };
      }
      const installedOn = serverIdForCard(state, sourceId);
      if (installedOn && installedOn !== sid) {
        log(state, `Self-destruct — only during a run on this server.`);
        return { ok: true };
      }
      const server = state.servers[sid];
      if (!server) return { ok: true };
      const toTrash = [...server.root, ...server.ice].filter(
        (id) => id !== sourceId,
      );
      // "Trace[X], where X is equal to the number of cards trashed": the
      // cards this instruction trashes. Self-destruct was trashed before, as
      // the cost, so it does not count (CR 1.2.1).
      let trashed = 0;
      for (const id of toTrash) {
        const card = state.cards[id];
        if (!card) continue;
        trashCard(state, id, { by: "corp" });
        if (card.zone !== "corp:archives") continue;
        trashed += 1;
        log(state, `Self-destruct — trash ${card.title}.`);
      }
      const r = autoResolveTrace(
        state,
        sourceId,
        trashed,
        fx.do({ kind: "trace_self_destruct_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_self_destruct_success": {
      dealDamage(state, "net", 3, sourceId);
      return { ok: true };
    }
    case "move_virus_counters": {
      const n = source?.virusCounters ?? 0;
      // Source may already be trashed; read counters before trash if possible.
      const viruses = state.runner.installed.filter((id) => {
        if (id === sourceId) return false;
        const c = state.cards[id];
        return c?.type === "program" && (c.subtypes ?? []).includes("virus");
      });
      if (viruses.length === 0 || n <= 0) {
        log(state, `Incubator — no virus counters to move or no target.`);
        return { ok: true };
      }
      if (
        !openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: viruses.map((id) => ({
            id: `incubator-move:${id}`,
            label: `Move ${n} virus to ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "move_incubator_apply",
              cardId: id,
              amount: n,
            }),
          })),
        })
      )
        return { ok: true };
      // Capture amount on turn so trash-self cost still works.
      state.turn.incubatorMoveAmount = n;
      return { ok: true };
    }
    case "move_incubator_apply": {
      const cardId = (action as { cardId: string }).cardId;
      const amount =
        (action as { amount?: number }).amount ??
        state.turn.incubatorMoveAmount ??
        0;
      const target = state.cards[cardId];
      if (target) {
        target.virusCounters = (target.virusCounters ?? 0) + amount;
        log(
          state,
          `Incubator — move ${amount} virus counter(s) to ${target.title} → ${target.virusCounters}.`,
        );
      }
      state.turn.incubatorMoveAmount = undefined;
      return { ok: true };
    }
    case "may_breach_instead_code_siphon": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "code-siphon-decline",
            label: "Breach R&D normally",
            effect: fx.gainCredits("runner", 0),
          },
          {
            id: "code-siphon-search",
            label: "Instead of breaching: search stack for a program",
            effect: fx.do({ kind: "breach_instead_code_siphon" }),
          },
        ],
      });
      return { ok: true };
    }
    case "breach_instead_code_siphon": {
      // "Search your stack for 1 program. Install it, paying 3[credit] less
      // for each piece of ice protecting R&D, and then take 1 tag." Only a
      // program the Runner can pay for can be found (CR 8.7.2b); the search
      // may find nothing (CR 8.7.2e); the stack is shuffled once the search
      // is complete, before the install (CR 8.7.3). The install itself is
      // inline (area 6).
      const discount = (state.servers.rd?.ice.length ?? 0) * 3;
      if (!action.cardIds) {
        if (state.run) state.run.skipBreach = true;
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: state.runner.deck.filter((id) => {
              const c = state.cards[id];
              return (
                c?.type === "program" &&
                state.runner.credits >=
                  Math.max(0, (c.installCost ?? 0) - discount)
              );
            }),
            count: 1,
            search: true,
            purpose: "resume",
            label: "install",
            resume: { kind: "breach_instead_code_siphon" },
          }),
        );
      }
      const id = action.cardIds.find((cid) => state.runner.deck.includes(cid));
      if (id) state.runner.deck = state.runner.deck.filter((x) => x !== id);
      shuffleRunnerStack(state);
      noteSearchConditionalAbilities(state);
      if (!id) {
        // "Install it ... and then take 1 tag" has no "if able": with no
        // program found the install is skipped and the tag is still taken
        // (CR 1.2.4).
        log(state, `Code Siphon — no program found; shuffle the stack.`);
        return evalEffect(ctx, fx.do({ kind: "give_tags", amount: 1 }));
      }
      return applyLunarTsPrimitive(ctx, {
        kind: "install_program",
        cardId: id,
        discount,
      });
    }
    case "install_program": {
      const cardId = (action as { cardId: string }).cardId;
      const discount = (action as { discount: number }).discount;
      const card = state.cards[cardId];
      if (!card || card.type !== "program") return { ok: true };
      const printed = card.installCost ?? 0;
      const cost = Math.max(0, printed - discount);
      if (state.runner.credits < cost) {
        log(state, `Code Siphon — cannot afford ${card.title}.`);
        return { ok: true };
      }
      // The search already took the card out of the stack.
      subtractRunnerCreditPool(state, cost);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      // The turn's record of a Runner install (Docklands Crackdown,
      // Housekeeping); the inline install skips the install procedure.
      state.turn.runnerInstalledCardThisTurn = true;
      log(
        state,
        `Code Siphon — install ${card.title} for ${cost}¢ (−${discount}), then take 1 tag.`,
      );
      // The tag goes through the tag procedure, so it can be avoided
      // (CR 9.9.6a).
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount: 1 }));
    }
    case "break_code_gate_or_barrier": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Sage — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      if (!subs.includes("code gate") && !subs.includes("barrier")) {
        return {
          ok: false,
          error: "Sage can only break code gate or barrier subroutines.",
          cites: [],
        };
      }
      // Strength was checked when the ability was used (CR 3.9.5g, 9.5.4).
      const [idx] = breakNextSubroutines(state, sourceId, 1);
      if (idx === undefined) {
        log(state, `Sage — no unbroken subroutines.`);
        return { ok: true };
      }
      log(
        state,
        `Sage — break "${ice?.subroutines?.[idx]?.text ?? `sub ${idx}`}" on ${ice?.title}.`,
      );
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}

function applyShootTheMoonPick(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const unrezzed: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      if (!state.cards[id]?.rezzed) unrezzed.push(id);
    }
  }
  if (unrezzed.length === 0) {
    state.turn.shootTheMoonRemaining = undefined;
    return { ok: true };
  }
  const remaining = state.turn.shootTheMoonRemaining ?? 0;
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: [
      ...unrezzed.map((id) => ({
        id: `stm-rez:${id}`,
        label: `Rez ${state.cards[id]!.title} (ignoring costs) [${remaining} left]`,
        effect: fx.do({ kind: "rez_pick", cardId: id }),
      })),
      {
        id: "stm-done",
        label: "Done rezzing",
        effect: fx.gainCredits("corp", 0),
      },
    ],
  });
  return { ok: true };
}

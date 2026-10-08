/** The Source (ts) Lunar pack primitives. */
import { log } from "../state/createGame.js";
import { dealDamage } from "../state/damage.js";
import { autoResolveTrace } from "../state/trace.js";
import { chargeableInstalledIds, chargeCard } from "../state/msKeywords.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

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
      const cands = chargeableInstalledIds(state, "corp");
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
      state.pendingChoice = { sourceId, chooser: "corp", options };
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `it-boost:${id}`,
          label: `${state.cards[id]!.title} +${bonus} strength this turn`,
          effect: fx.do({
            kind: "it_department_apply_boost",
            cardId: id,
            amount: bonus,
          }),
        })),
      };
      return { ok: true };
    }
    case "it_department_apply_boost": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount: number }).amount;
      state.turn.iceStrengthBoostsThisTurn[cardId] =
        (state.turn.iceStrengthBoostsThisTurn[cardId] ?? 0) + amount;
      log(
        state,
        `IT Department — ${state.cards[cardId]?.title ?? cardId} +${amount} strength this turn.`,
      );
      return { ok: true };
    }
    case "runner_trashes_one_installed": {
      const installed = [...state.runner.rig];
      if (installed.length === 0) {
        log(state, `Markus 1.0 — Runner has no installed cards.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        moveRunnerCardToHeap(state, installed[0]!);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `trash-installed:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      };
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
    case "troll_encounter_trace": {
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "troll_trace_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "troll_trace_success": {
      state.pendingChoice = {
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
      };
      return { ok: true };
    }
    case "virgo_trace_subroutine": {
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "virgo_trace_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "virgo_trace_success": {
      state.runner.tags += 1;
      log(state, `Virgo — give 1 tag → ${state.runner.tags}.`);
      if ((state.turn.lastResolvedTraceStrength ?? 0) >= 5) {
        state.runner.tags += 1;
        log(state, `Virgo — trace strength ≥5, give another tag → ${state.runner.tags}.`);
      }
      return { ok: true };
    }
    case "self_destruct_ability": {
      const sid = serverIdForCard(state, sourceId);
      if (!sid) {
        log(state, `Self-destruct — not installed on a server.`);
        return { ok: true };
      }
      if (!state.run || state.run.attackedServerId !== sid) {
        log(state, `Self-destruct — only during a run on this server.`);
        return { ok: true };
      }
      const server = state.servers[sid];
      if (!server) return { ok: true };
      const toTrash = [...server.root, ...server.ice].filter(
        (id) => id !== sourceId,
      );
      // Source already trashed via cost; count it too for Trace X.
      let trashed = 1;
      for (const id of toTrash) {
        const card = state.cards[id];
        if (!card) continue;
        if (server.root.includes(id)) {
          server.root = server.root.filter((x) => x !== id);
        }
        if (server.ice.includes(id)) {
          server.ice = server.ice.filter((x) => x !== id);
        }
        state.corp.discard.push(id);
        card.zone = "corp:archives";
        card.faceup = true;
        card.rezzed = false;
        trashed += 1;
        log(state, `Self-destruct — trash ${card.title}.`);
      }
      const r = autoResolveTrace(
        state,
        sourceId,
        trashed,
        fx.do({ kind: "self_destruct_trace_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "self_destruct_trace_success": {
      dealDamage(state, "net", 3, sourceId);
      return { ok: true };
    }
    case "move_virus_counters": {
      const n = source?.virusCounters ?? 0;
      // Source may already be trashed; read counters before trash if possible.
      const viruses = state.runner.rig.filter((id) => {
        if (id === sourceId) return false;
        const c = state.cards[id];
        return (
          c?.type === "program" && (c.subtypes ?? []).includes("virus")
        );
      });
      if (viruses.length === 0 || n <= 0) {
        log(state, `Incubator — no virus counters to move or no target.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: viruses.map((id) => ({
          id: `incubator-move:${id}`,
          label: `Move ${n} virus to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "incubator_apply_move",
            cardId: id,
            amount: n,
          }),
        })),
      };
      // Capture amount on turn so trash-self cost still works.
      state.turn.incubatorMoveAmount = n;
      return { ok: true };
    }
    case "incubator_apply_move": {
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
    case "code_siphon_may_instead_of_breach": {
      state.pendingChoice = {
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
            effect: fx.do({ kind: "code_siphon_instead_of_breach" }),
          },
        ],
      };
      return { ok: true };
    }
    case "code_siphon_instead_of_breach": {
      if (state.run) state.run.skipBreach = true;
      const programs = state.runner.deck.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Code Siphon — no program in stack.`);
        return { ok: true };
      }
      const iceCount = state.servers.rd?.ice.length ?? 0;
      const discount = iceCount * 3;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `code-siphon-install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢), take 1 tag`,
          effect: fx.do({
            kind: "install_program",
            cardId: id,
            discount,
          }),
        })),
      };
      return { ok: true };
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
      // Remove from stack
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.credits -= cost;
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      state.runner.tags += 1;
      log(
        state,
        `Code Siphon — install ${card.title} for ${cost}¢ (−${discount}), take 1 tag → ${state.runner.tags}.`,
      );
      // Shuffle stack
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      return { ok: true };
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
      const unused = Math.max(0, memoryLimit(state) - usedMemory(state));
      const per = source?.strengthBonusPerUnusedMu ?? 1;
      const str =
        (source?.breaker?.strength ?? source?.strength ?? 0) +
        unused * per +
        (state.turn.breakerStrengthBoostsThisTurn[sourceId] ?? 0) +
        (state.run?.strengthBoosts[sourceId] ?? 0) +
        (state.run?.encounterStrengthBoosts[sourceId] ?? 0);
      const iceStr = ice?.strength ?? 0;
      if (str < iceStr) {
        return {
          ok: false,
          error: `Sage strength ${str} < ice strength ${iceStr}.`,
          cites: [],
        };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `Sage — no unbroken subroutines.`);
        return { ok: true };
      }
      enc.broken[idx] = true;
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
  state.pendingChoice = {
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
  };
  return { ok: true };
}

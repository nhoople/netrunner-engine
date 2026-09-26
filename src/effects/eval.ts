import { addRestriction } from "../legality/checkpoints.js";
import { dealDamage } from "../state/damage.js";
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { autoResolveTrace, startTrace } from "../state/trace.js";
import type { GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { Cond, Effect, Primitive, SideRef } from "./ir.js";

export interface EffectCtx {
  state: GameState;
  /** Card whose ability/sub is firing. */
  sourceId: string;
  /** Who paid (paid abilities); defaults to source.side. */
  payerSide?: Side;
}

export type EvalResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function breakerStrength(state: GameState, breakerId: string): number {
  const card = state.cards[breakerId];
  let base = card.breaker?.strength ?? card.strength ?? 0;
  if (card.strengthBonusPerIcebreaker) {
    const n = state.runner.rig.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  const runBoost = state.run?.strengthBoosts[breakerId] ?? 0;
  const encBoost = state.run?.encounterStrengthBoosts[breakerId] ?? 0;
  return base + runBoost + encBoost;
}

function iceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  const base = card.strength ?? 0;
  return base + (state.run?.iceStrengthBoosts[iceId] ?? 0);
}

function resolveSide(ctx: EffectCtx, ref: SideRef): Side {
  if (ref === "corp" || ref === "runner") return ref;
  if (ref === "payer") {
    return ctx.payerSide ?? ctx.state.cards[ctx.sourceId].side;
  }
  return ctx.state.cards[ctx.sourceId].side;
}

function iceProtectsRemote(state: GameState, iceId: string): boolean {
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      return server.kind === "remote";
    }
  }
  return false;
}

function evalCond(ctx: EffectCtx, cond: Cond): boolean {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (cond.op) {
    case "true":
      return true;
    case "false":
      return false;
    case "during_run":
      return state.run !== null;
    case "source_is_breaker":
      return Boolean(source.breaker);
    case "source_is_ice":
      return source.type === "ice";
    case "grip_nonempty":
      return state.runner.hand.length > 0;
    case "has_installed_program":
      return state.runner.rig.some((id) => state.cards[id].type === "program");
    case "runner_tagged":
      return state.runner.tags > 0;
    case "clicks_remaining": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.clicks > 0;
    }
    case "credits_lte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.credits <= cond.amount;
    }
    case "protecting_remote":
      return iceProtectsRemote(state, sourceId);
    case "hq_nonempty":
      return state.corp.hand.length > 0;
    case "has_installed_resource":
      return state.runner.rig.some((id) => state.cards[id].type === "resource");
    case "grip_count_odd":
      return state.runner.hand.length % 2 === 1;
    case "successful_run_this_turn":
      return state.turn.successfulRunThisTurn;
    case "attacking_central": {
      const sid = state.run?.attackedServerId;
      return sid === "hq" || sid === "rd" || sid === "archives";
    }
    case "attacking_rd":
      return state.run?.attackedServerId === "rd";
    case "attacking_hq":
      return state.run?.attackedServerId === "hq";
    default: {
      const _c: never = cond;
      return _c;
    }
  }
}

function trashToHeap(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  const handIdx = state.runner.hand.indexOf(cardId);
  if (handIdx >= 0) state.runner.hand.splice(handIdx, 1);
  const rigIdx = state.runner.rig.indexOf(cardId);
  if (rigIdx >= 0) state.runner.rig.splice(rigIdx, 1);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
}

function trashCorpCardToArchives(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
}

function drawCards(state: GameState, side: Side, amount: number): number {
  const p = side === "corp" ? state.corp : state.runner;
  let drew = 0;
  for (let i = 0; i < amount; i++) {
    const top = p.deck.shift();
    if (!top) break;
    p.hand.push(top);
    const card = state.cards[top];
    card.zone = side === "corp" ? "corp:hq" : "runner:grip";
    card.faceup = side === "runner";
    drew += 1;
  }
  return drew;
}

function pendingTrashAmong(
  state: GameState,
  sourceId: string,
  candidates: string[],
  label: string,
): EvalResult {
  if (candidates.length === 0) {
    log(state, `Trash ${label} — no targets (CR ${CR.trashing.number}).`);
    return { ok: true };
  }
  if (candidates.length > 1) {
    state.pendingTrashProgram = {
      sourceId,
      candidates: [...candidates],
    };
    log(
      state,
      `Trash ${label} — Corp must choose among ${candidates.length} (CR ${CR.trashing.number}).`,
    );
    return { ok: true };
  }
  const id = candidates[0]!;
  const title = state.cards[id].title;
  trashToHeap(state, id);
  log(state, `Trash installed ${title} (CR ${CR.trashing.number}).`);
  return { ok: true };
}

function applyPrimitive(ctx: EffectCtx, action: Primitive): EvalResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "end_the_run": {
      if (!state.run) {
        return {
          ok: false,
          error: "End the run with no active run.",
          cites: [CR.endTheRun],
        };
      }
      state.run.endedTheRun = true;
      state.run.successful = false;
      log(
        state,
        `End the run (CR ${CR.endTheRun.number}) — run is unsuccessful.`,
      );
      return { ok: true };
    }
    case "gain_credits": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += action.amount;
      log(
        state,
        `${side} gains ${action.amount}¢ (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "lose_credits": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.credits);
      p.credits -= lost;
      log(
        state,
        `${side} loses ${lost}¢ (requested ${action.amount}) → ${p.credits} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "pump_strength": {
      if (!state.run) {
        return {
          ok: false,
          error: "Pump requires an active run.",
          cites: [CR.icebreakerStrengthImplicit],
        };
      }
      if (!source.breaker) {
        return {
          ok: false,
          error: "Pump requires an icebreaker.",
          cites: [CR.programStrength],
        };
      }
      let amount = action.amount;
      if (source.breaker.pumpUsesIcebreakerCount) {
        amount = state.runner.rig.filter(
          (id) =>
            Boolean(state.cards[id].breaker) ||
            (state.cards[id].subtypes ?? []).includes("icebreaker"),
        ).length;
      }
      const duration = action.duration ?? "encounter";
      const bucket =
        duration === "run"
          ? state.run.strengthBoosts
          : state.run.encounterStrengthBoosts;
      bucket[sourceId] = (bucket[sourceId] ?? 0) + amount;
      const eff = breakerStrength(state, sourceId);
      log(
        state,
        `Pump ${source.title} +${amount} (${duration}) → strength ${eff} (CR ${CR.icebreakerStrengthImplicit.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "fortify_ice": {
      if (!state.run || source.type !== "ice") {
        return {
          ok: false,
          error: "Fortify requires ice during a run.",
          cites: [CR.iceStrength],
        };
      }
      state.run.iceStrengthBoosts[sourceId] =
        (state.run.iceStrengthBoosts[sourceId] ?? 0) + action.amount;
      const eff = iceStrength(state, sourceId);
      log(
        state,
        `Fortify ${source.title} +${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "weaken_ice": {
      if (!state.run) {
        return {
          ok: false,
          error: "Weaken ice requires an active run/encounter.",
          cites: [CR.iceStrength],
        };
      }
      const iceId = state.run.encounter?.iceId;
      if (!iceId) {
        return {
          ok: false,
          error: "Weaken ice requires an encounter.",
          cites: [CR.iceStrength],
        };
      }
      state.run.iceStrengthBoosts[iceId] =
        (state.run.iceStrengthBoosts[iceId] ?? 0) - action.amount;
      const eff = iceStrength(state, iceId);
      log(
        state,
        `Weaken ${state.cards[iceId].title} −${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}).`,
      );
      return { ok: true };
    }
    case "net_damage":
    case "meat_damage":
    case "brain_damage": {
      const dtype =
        action.kind === "net_damage"
          ? "net"
          : action.kind === "meat_damage"
            ? "meat"
            : "brain";
      dealDamage(state, dtype, action.amount, sourceId);
      return { ok: true };
    }
    case "give_tags": {
      const beforeTags = state.turn.tagsGivenThisTurn;
      state.runner.tags += action.amount;
      state.turn.tagsGivenThisTurn += action.amount;
      log(
        state,
        `Runner receives ${action.amount} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      if (beforeTags === 0 && action.amount > 0) {
        const idCard = state.cards[state.corp.identityId];
        if (idCard?.onFirstTagThisTurn) {
          const r = evalEffect(
            { state, sourceId: idCard.id },
            idCard.onFirstTagThisTurn,
          );
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }
    case "trash_program": {
      const programs = state.runner.rig.filter(
        (id) => state.cards[id].type === "program",
      );
      if (programs.length === 0) {
        log(
          state,
          `Trash program — no installed program (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && programs.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...programs],
        };
        log(
          state,
          `Trash program — Corp must choose among ${programs.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const progId = programs[0]!;
      const title = state.cards[progId].title;
      trashToHeap(state, progId);
      log(
        state,
        `Trash installed program ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_resource": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (resources.length === 0) {
        log(
          state,
          `Trash resource — no installed resource (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && resources.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...resources],
        };
        log(
          state,
          `Trash resource — Corp must choose among ${resources.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const resId = resources[0]!;
      const title = state.cards[resId].title;
      trashToHeap(state, resId);
      log(
        state,
        `Trash installed resource ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "take_hosted_credits": {
      const available = source.hostedCredits ?? 0;
      const taken = Math.min(action.amount, available);
      source.hostedCredits = available - taken;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += taken;
      log(
        state,
        `Take ${taken}¢ from ${source.title} (hosted ${source.hostedCredits}) (CR ${CR.gainCredits.number}).`,
      );
      if ((source.hostedCredits ?? 0) <= 0) {
        removeCardFromCurrentZone(state, sourceId);
        if (side === "runner") {
          state.runner.discard.push(sourceId);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(sourceId);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — hosted credits empty (CR ${CR.trashing.number}).`,
        );
        const drawN = source.drawOnHostedEmpty ?? 0;
        if (drawN > 0) {
          const n = drawCards(state, side, drawN);
          log(
            state,
            `${side} draws ${n} from empty ${source.title} (CR ${CR.drawing.number}).`,
          );
        }
      }
      return { ok: true };
    }
    case "place_hosted_credits": {
      source.hostedCredits = (source.hostedCredits ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount}¢ on ${source.title} → ${source.hostedCredits} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "add_virus_counter": {
      source.virusCounters = (source.virusCounters ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} virus counter(s) on ${source.title} → ${source.virusCounters}.`,
      );
      return { ok: true };
    }
    case "gain_credits_per_virus": {
      const n = source.virusCounters ?? 0;
      const gained = n * action.per;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += gained;
      log(
        state,
        `${side} gains ${gained}¢ (${n} virus × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "increase_hand_size": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.maxHandSize += action.amount;
      log(
        state,
        `${side} max hand size +${action.amount} → ${p.maxHandSize} (CR ${CR.maxHandSize.number}).`,
      );
      return { ok: true };
    }
    case "trash_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Trash from HQ — HQ empty (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      if (action.pick === "choose" && hq.length > 1) {
        state.pendingTrashProgram = { sourceId, candidates: hq };
        log(
          state,
          `Trash from HQ — Corp must choose among ${hq.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = hq[hq.length - 1]!;
      trashCorpCardToArchives(state, id);
      log(
        state,
        `Trash ${state.cards[id].title} from HQ (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_hardware": {
      const hw = state.runner.rig.filter(
        (id) => state.cards[id].type === "hardware",
      );
      if (action.pick === "choose") {
        return pendingTrashAmong(state, sourceId, hw, "hardware");
      }
      if (hw.length === 0) {
        log(state, `Trash hardware — none installed (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      const id = hw[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed hardware ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_program_or_hardware": {
      const cands = state.runner.rig.filter((id) => {
        const t = state.cards[id].type;
        return t === "program" || t === "hardware";
      });
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          "program or hardware",
        );
      }
      if (cands.length === 0) {
        log(
          state,
          `Trash program/hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "shuffle_hq_to_rd": {
      const n = Math.min(action.amount, state.corp.hand.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      // Deterministic "shuffle": reverse then rotate by hand size (stable for tests).
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from HQ into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "shuffle_archives_to_rd": {
      const n = Math.min(action.amount, state.corp.discard.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from Archives into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "net_damage_agenda_points_this_turn": {
      const amount = state.turn.agendaPointsScoredThisTurn;
      if (amount <= 0) {
        log(state, `Neurospike — 0 agenda points scored this turn.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "forbid_scoring_agendas_this_turn": {
      state.turn.cannotScoreAgendas = true;
      log(state, `Cannot score agendas for the remainder of this turn.`);
      return { ok: true };
    }
    case "place_advancements": {
      const installed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (
            c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice"
          ) {
            installed.push(id);
          }
        }
      }
      let candidates = installed;
      if (action.preferNotInstalledThisTurn) {
        const filtered = installed.filter(
          (id) => !state.turn.installedThisTurn.includes(id),
        );
        if (filtered.length > 0) candidates = filtered;
      }
      if (candidates.length === 0) {
        log(state, `Place advancements — no eligible card.`);
        return { ok: true };
      }
      // Auto-pick first eligible (v0); hosts can extend with choose later.
      const targetId = candidates[0]!;
      const target = state.cards[targetId];
      target.advancementTokens =
        (target.advancementTokens ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} advancement(s) on ${target.title} → ${target.advancementTokens}.`,
      );
      return { ok: true };
    }
    case "meat_damage_per_advancement": {
      const amount = source.advancementTokens ?? 0;
      if (amount <= 0) {
        log(state, `Meat damage per advancement — 0 tokens.`);
        return { ok: true };
      }
      dealDamage(state, "meat", amount, sourceId);
      return { ok: true };
    }
    case "net_damage_per_advancement": {
      const amount = (action.base ?? 0) + (source.advancementTokens ?? 0);
      if (amount <= 0) {
        log(state, `Net damage per advancement — 0.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "trash_self": {
      removeCardFromCurrentZone(state, sourceId);
      if (source.side === "runner") {
        state.runner.discard.push(sourceId);
        source.zone = "runner:heap";
      } else {
        state.corp.discard.push(sourceId);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      log(
        state,
        `${source.title} trashed (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "archives_to_hq": {
      const n = Math.min(action.amount, state.corp.discard.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Add ${n} card(s) from Archives to HQ (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "draw": {
      const side = resolveSide(ctx, action.side);
      const n = drawCards(state, side, action.amount);
      log(
        state,
        `${side} draws ${n} (requested ${action.amount}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "add_agenda_counter": {
      source.advancementTokens =
        (source.advancementTokens ?? 0) + action.amount;
      log(
        state,
        `Add ${action.amount} agenda counter(s) to ${source.title} → ${source.advancementTokens}.`,
      );
      return { ok: true };
    }
    case "lose_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.clicks);
      p.clicks -= lost;
      log(
        state,
        `${side} loses ${lost} click(s) (requested ${action.amount}) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "gain_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.clicks += action.amount;
      log(
        state,
        `${side} gains ${action.amount} click(s) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "trace": {
      if (action.interactive) {
        startTrace(
          state,
          sourceId,
          action.strength,
          action.onSuccess,
          action.onFailure,
        );
        return { ok: true };
      }
      const r = autoResolveTrace(
        state,
        sourceId,
        action.strength,
        action.onSuccess,
        action.onFailure,
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [CR.trace] };
      return { ok: true };
    }
    default: {
      const _a: never = action;
      return {
        ok: false,
        error: `Unhandled primitive: ${JSON.stringify(_a)}`,
        cites: [],
      };
    }
  }
}

/** Execute an effect tree against game state (mutates). */
export function evalEffect(ctx: EffectCtx, effect: Effect): EvalResult {
  switch (effect.op) {
    case "seq": {
      for (const e of effect.effects) {
        const r = evalEffect(ctx, e);
        if (!r.ok) return r;
        // Pause seq when a choice / pending target is opened.
        if (
          ctx.state.pendingChoice ||
          ctx.state.pendingTrashProgram ||
          ctx.state.pendingDamage ||
          ctx.state.trace
        ) {
          return { ok: true };
        }
      }
      return { ok: true };
    }
    case "do":
      return applyPrimitive(ctx, effect.action);
    case "if": {
      if (evalCond(ctx, effect.cond)) {
        return evalEffect(ctx, effect.then);
      }
      if (effect.else) return evalEffect(ctx, effect.else);
      return { ok: true };
    }
    case "prevent": {
      if (effect.forbid === "jack_out") {
        if (ctx.state.run) ctx.state.run.cannotJackOut = true;
        addRestriction(
          ctx.state,
          "jack_out",
          CR.cannotPrecedence,
          ctx.sourceId,
        );
        return { ok: true };
      }
      return { ok: true };
    }
    case "choose": {
      ctx.state.pendingChoice = {
        sourceId: ctx.sourceId,
        chooser: effect.chooser,
        options: effect.options.map((o) => ({
          id: o.id,
          label: o.label,
          effect: structuredClone(o.effect),
        })),
      };
      log(
        ctx.state,
        `Choice pending for ${effect.chooser} (${effect.options.length} options) from ${ctx.state.cards[ctx.sourceId].title}.`,
      );
      return { ok: true };
    }
    default: {
      const _e: never = effect;
      return {
        ok: false,
        error: `Unhandled effect op: ${JSON.stringify(_e)}`,
        cites: [],
      };
    }
  }
}

/**
 * Preconditions for paying a paid ability whose effect is this tree.
 * Returns a failure result if illegal, otherwise null.
 */
export function validatePaidEffect(
  ctx: EffectCtx,
  effect: Effect,
): Extract<EvalResult, { ok: false }> | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  const walk = (e: Effect): Extract<EvalResult, { ok: false }> | null => {
    switch (e.op) {
      case "seq": {
        for (const child of e.effects) {
          const r = walk(child);
          if (r) return r;
        }
        return null;
      }
      case "if":
        return walk(e.then) ?? (e.else ? walk(e.else) : null);
      case "prevent":
        return null;
      case "choose":
        return null;
      case "do": {
        const a = e.action;
        if (a.kind === "pump_strength") {
          if (!state.run) {
            return {
              ok: false,
              error: "Pump requires an active run/encounter.",
              cites: [CR.icebreakerStrengthImplicit],
            };
          }
          if (!source.breaker) {
            return {
              ok: false,
              error: "Pump requires an icebreaker.",
              cites: [CR.programStrength],
            };
          }
        }
        if (a.kind === "fortify_ice") {
          if (!state.run || source.type !== "ice") {
            return {
              ok: false,
              error: "Fortify requires approached ice during a run.",
              cites: [CR.iceStrength],
            };
          }
        }
        if (a.kind === "weaken_ice") {
          if (!state.run?.encounter) {
            return {
              ok: false,
              error: "Weaken ice requires an encounter.",
              cites: [CR.iceStrength],
            };
          }
        }
        if (a.kind === "gain_credits_per_virus") {
          // Always legal; may gain 0.
        }
        return null;
      }
      default: {
        const _e: never = e;
        return _e;
      }
    }
  };
  return walk(effect);
}

// trashCorpCardToArchives used by trash_hq / shuffle paths.

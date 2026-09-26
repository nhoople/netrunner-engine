import { addRestriction } from "../legality/checkpoints.js";
import { dealDamage } from "../state/damage.js";
import { log } from "../state/createGame.js";
import {
  chargeableInstalledIds,
  chargeCard,
  identifyMark,
  resolveSabotageAmount,
} from "../state/msKeywords.js";
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
  if (card.strengthPerPowerCounter) {
    base += card.powerCounters ?? 0;
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
    case "advancements_gte":
      return (source.advancementTokens ?? 0) >= cond.amount;
    case "has_mark":
      return state.markServerId !== null;
    case "attacking_mark":
      return (
        state.markServerId !== null &&
        state.run?.attackedServerId === state.markServerId
      );
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
  // Marilyn Campaign: when would be trashed, may shuffle into R&D instead.
  if (card.mayShuffleIntoRdWhenTrashed && card.rezzed) {
    removeCardFromCurrentZone(state, cardId);
    state.corp.deck.push(cardId);
    card.zone = "corp:rd";
    card.faceup = false;
    card.rezzed = false;
    card.hostedCredits = undefined;
    log(state, `${card.title} — shuffle into R&D instead of trash.`);
    return;
  }
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
      const ice = state.cards[iceId];
      if (ice.strengthCannotBeLowered) {
        log(
          state,
          `Weaken ${ice.title} prevented — strength cannot be lowered.`,
        );
        return { ok: true };
      }
      state.run.iceStrengthBoosts[iceId] =
        (state.run.iceStrengthBoosts[iceId] ?? 0) - action.amount;
      const eff = iceStrength(state, iceId);
      log(
        state,
        `Weaken ${ice.title} −${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}).`,
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
      let programs = state.runner.rig.filter(
        (id) => state.cards[id].type === "program",
      );
      if (action.aiOnly) {
        programs = programs.filter((id) => {
          const c = state.cards[id];
          return (
            (c.subtypes ?? []).includes("ai") ||
            c.breaker?.breaksSubtype === "*"
          );
        });
      }
      if (programs.length === 0) {
        log(
          state,
          `Trash program — no installed ${action.aiOnly ? "AI " : ""}program (CR ${CR.trashing.number}).`,
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
        if (side === "corp" && source.mayShuffleIntoRdWhenTrashed) {
          removeCardFromCurrentZone(state, sourceId);
          state.corp.deck.push(sourceId);
          source.zone = "corp:rd";
          source.faceup = false;
          source.rezzed = false;
          log(
            state,
            `${source.title} — shuffle into R&D instead of trash (hosted empty).`,
          );
        } else {
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
        }
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
      // Tranquilizer: at threshold, derez host ice.
      const threshold = source.derezHostAtVirus;
      if (
        threshold !== undefined &&
        (source.virusCounters ?? 0) >= threshold &&
        source.hostId
      ) {
        const host = state.cards[source.hostId];
        if (host?.type === "ice" && host.rezzed) {
          host.rezzed = false;
          log(
            state,
            `${source.title} derezzes host ${host.title} (${source.virusCounters} virus).`,
          );
        }
      }
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
    case "trash_installed_runner": {
      const cands = [...state.runner.rig];
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(state, sourceId, cands, "installed Runner card");
      }
      if (cands.length === 0) {
        log(state, `Trash installed Runner card — none installed.`);
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
    case "forbid_steal_trash_this_run": {
      if (state.run) {
        state.run.cannotStealOrTrash = true;
        log(state, `Runner cannot steal or trash Corp cards for the remainder of this run.`);
      }
      return { ok: true };
    }
    case "install_from_hq_or_archives": {
      // May install 1 card from HQ or Archives (Ansel). Auto: first from HQ, else Archives.
      const pick =
        state.corp.hand.find((id) => {
          const t = state.cards[id].type;
          return (
            t === "agenda" ||
            t === "asset" ||
            t === "ice" ||
            t === "upgrade" ||
            t === "operation"
          );
        }) ??
        state.corp.discard.find((id) => {
          const t = state.cards[id].type;
          return (
            t === "agenda" ||
            t === "asset" ||
            t === "ice" ||
            t === "upgrade"
          );
        });
      if (!pick) {
        log(state, `Install from HQ/Archives — no eligible card.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      if (card.type === "operation") {
        log(state, `Install from HQ/Archives — operations are not installable.`);
        return { ok: true };
      }
      // Remove from current zone
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Install ${card.title} from HQ/Archives onto ${sid} (ignoring costs).`,
      );
      return { ok: true };
    }
    case "install_ice_inward_free": {
      // Brân: may install ice from HQ protecting this server, inward of source.
      if (!state.run || source.type !== "ice") {
        log(state, `Install ice inward — not during encounter of ice.`);
        return { ok: true };
      }
      const iceFromHq = state.corp.hand.find(
        (id) => state.cards[id].type === "ice",
      );
      if (!iceFromHq) {
        log(state, `Install ice inward — no ice in HQ.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(state, `Install ice inward — source not protecting attacked server.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== iceFromHq);
      const card = state.cards[iceFromHq];
      // Insert immediately inward (higher index) of source.
      server.ice.splice(pos + 1, 0, iceFromHq);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Install ${card.title} inward of ${source.title} on ${serverId} (ignoring costs).`,
      );
      return { ok: true };
    }
    case "break_host_subroutine": {
      const hostId = source.hostId;
      const enc = state.run?.encounter;
      if (!hostId || !enc || enc.iceId !== hostId) {
        log(state, `Break host subroutine — not encountering host.`);
        return { ok: true };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `Break host subroutine — no unbroken subs.`);
        return { ok: true };
      }
      enc.broken[idx] = true;
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      const sub = state.cards[hostId].subroutines?.[idx];
      log(
        state,
        `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on host.`,
      );
      return { ok: true };
    }
    case "break_encounter_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Break encounter subroutine — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (
        action.requireSubtype &&
        !(ice.subtypes ?? []).includes(action.requireSubtype)
      ) {
        log(
          state,
          `Break encounter subroutine — ice is not ${action.requireSubtype}.`,
        );
        return { ok: true };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `Break encounter subroutine — no unbroken subs.`);
        return { ok: true };
      }
      enc.broken[idx] = true;
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      const sub = ice.subroutines?.[idx];
      log(
        state,
        `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on ${ice.title}.`,
      );
      return { ok: true };
    }
    case "offer_jack_out": {
      if (state.run && !state.run.cannotJackOut) {
        state.run.pendingJackOutOffer = true;
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "jack_out",
              label: "Jack out",
              effect: { op: "do", action: { kind: "end_the_run" } },
            },
            {
              id: "continue",
              label: "Continue the run",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
        };
        // end_the_run via jack out should mark unsuccessful — handle in choose
        log(state, `Runner may jack out (Karunā).`);
      }
      return { ok: true };
    }
    case "search_stack_icebreaker": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker")
        );
      });
      if (matches.length === 0) {
        log(state, `Search stack for icebreaker — none found.`);
        return { ok: true };
      }
      // Auto-select first match (deterministic). Optionally install.
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id].zone = "runner:grip";
      state.cards[id].faceup = true;
      state.runner.deck.reverse();
      log(
        state,
        matches.length === 1
          ? `Search stack — add ${state.cards[id].title} to grip.`
          : `Search stack — add ${state.cards[id].title} to grip (${matches.length} matches; first selected).`,
      );
      if (
        action.mayInstallIfSuccessfulRunThisTurn &&
        state.turn.successfulRunThisTurn
      ) {
        const card = state.cards[id];
        const cost = card.installCost;
        if (state.runner.credits >= cost) {
          state.runner.credits -= cost;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.rig.push(id);
          card.zone = "runner:rig";
          log(state, `Install ${card.title} from Mutual Favor (${cost}¢).`);
          if (card.onInstall) {
            const r = evalEffect({ state, sourceId: id }, card.onInstall);
            if (!r.ok) return r;
          }
        }
      }
      return { ok: true };
    }
    case "search_rd_non_agenda": {
      const matches = state.corp.deck.filter(
        (id) => state.cards[id].type !== "agenda",
      );
      if (matches.length === 0) {
        log(state, `Search R&D for non-agenda — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = false;
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${state.cards[id].title} to HQ (non-agenda).`,
      );
      return { ok: true };
    }
    case "search_rd_to_hq": {
      const n = Math.min(action.amount, state.corp.deck.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck[0]!;
        // Prefer first card; for multi-search take sequential tops after shuffle sense:
        // Deterministic: take first N distinct from current deck order.
        void id;
      }
      const taken: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck.shift();
        if (!id) break;
        taken.push(id);
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${taken.length} card(s) to HQ (${taken.map((id) => state.cards[id].title).join(", ") || "none"}).`,
      );
      return { ok: true };
    }
    case "swap_two_ice": {
      const allIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        allIce.push(...server.ice);
      }
      if (allIce.length < 2) {
        log(state, `Swap ice — fewer than 2 ice installed.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [
        {
          id: "decline",
          label: "Decline to swap ice",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      // Offer swap of first with each other ice (bounded).
      const a = allIce[0]!;
      for (let i = 1; i < allIce.length; i++) {
        const b = allIce[i]!;
        options.push({
          id: `swap-${a}-${b}`,
          label: `Swap ${state.cards[a].title} with ${state.cards[b].title}`,
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      // Stash swap pairs: handled in chooseOption by parsing option id.
      log(state, `Tāo Salonga — may swap two ice.`);
      return { ok: true };
    }
    case "rez_ice_ignoring_costs": {
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Rez ice ignoring costs — no unrezzed ice.`);
        return { ok: true };
      }
      const options = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        },
        ...unrezzed.map((id) => ({
          id,
          label: `Rez ${state.cards[id].title} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        })),
      ];
      state.pendingChoice = {
        sourceId,
        chooser: source.side === "runner" ? "corp" : "corp",
        options,
      };
      log(state, `Send a Message — may rez ice ignoring all costs.`);
      return { ok: true };
    }
    case "may_install_from_grip": {
      const installable = state.runner.hand.filter((id) =>
        ["program", "hardware", "resource"].includes(state.cards[id].type),
      );
      const options = [
        {
          id: "decline",
          label: "Decline to install",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "runner" as const,
              amount: 0,
            },
          },
        },
        ...installable.map((id) => ({
          id,
          label: `Install ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "runner" as const,
              amount: 0,
            },
          },
        })),
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(state, `Pantograph — may install a card from grip.`);
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
      source.agendaCounters = (source.agendaCounters ?? 0) + action.amount;
      log(
        state,
        `Add ${action.amount} agenda counter(s) to ${source.title} → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "add_agenda_counters_from_overadvance": {
      const past = action.past;
      const per = action.per ?? 1;
      const adv = source.advancementTokens ?? 0;
      const over = Math.max(0, adv - past);
      const n = Math.floor(over / per);
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Add ${n} agenda counter(s) from overadvance (${adv}−${past}, per ${per}) → ${source.agendaCounters}.`,
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
    case "remove_tags": {
      const removed = Math.min(action.amount, state.runner.tags);
      state.runner.tags -= removed;
      log(
        state,
        `Remove ${removed} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      return { ok: true };
    }
    case "lose_credits_per_advancement": {
      const n = (source.advancementTokens ?? 0) * action.per;
      const lost = Math.min(n, state.runner.credits);
      state.runner.credits -= lost;
      log(
        state,
        `Runner loses ${lost}¢ (${action.per}×${source.advancementTokens ?? 0} advancements) (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "bypass_current_ice": {
      if (!state.run?.encounter) {
        return {
          ok: false,
          error: "Bypass requires an encounter.",
          cites: [CR.encounterBreakPaw],
        };
      }
      const iceId = state.run.encounter.iceId;
      const ice = state.cards[iceId];
      if (
        action.requireSubtype &&
        !(ice.subtypes ?? []).includes(action.requireSubtype)
      ) {
        return {
          ok: false,
          error: `Bypass requires encountering ${action.requireSubtype}.`,
          cites: [CR.encounterBreakPaw],
        };
      }
      // Mark all subs broken and skip to movement via ended encounter.
      state.run.encounter.broken = (ice.subroutines ?? []).map(() => true);
      state.run.bypassedIceIds = [
        ...(state.run.bypassedIceIds ?? []),
        iceId,
      ];
      log(state, `Bypass ${ice.title} (encounter ends without resolving subs).`);
      return { ok: true };
    }
    case "remove_power_counter": {
      const have = source.powerCounters ?? 0;
      const rem = Math.min(action.amount, have);
      source.powerCounters = have - rem;
      log(
        state,
        `Remove ${rem} power counter(s) from ${source.title} → ${source.powerCounters}.`,
      );
      if (
        source.trashWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
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
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
      }
      return { ok: true };
    }
    case "pay_credits_or_etr": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      if (p.credits >= action.amount) {
        p.credits -= action.amount;
        log(
          state,
          `${side} pays ${action.amount}¢ (forced — able to pay) → ${p.credits}.`,
        );
        return { ok: true };
      }
      log(
        state,
        `${side} cannot pay ${action.amount}¢ — end the run.`,
      );
      return applyPrimitive(ctx, { kind: "end_the_run" });
    }
    case "meat_damage_stolen_last_turn": {
      const n = state.turn.agendaPointsStolenLastTurn;
      if (n <= 0) {
        log(state, `Meat damage from stolen AP last turn — 0.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "meat_damage", amount: n });
    }
    case "derez_ice": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id].rezzed) iceIds.push(id);
        }
      }
      if (iceIds.length === 0) {
        log(state, `Derez ice — no rezzed ice.`);
        return { ok: true };
      }
      if (action.pick === "choose" && iceIds.length > 1) {
        // Deterministic: derez first rezzed ice (multi-match auto-pick).
      }
      const target = iceIds[0]!;
      state.cards[target].rezzed = false;
      state.cards[target].faceup = false;
      log(
        state,
        iceIds.length > 1
          ? `Derez ${state.cards[target].title} (${iceIds.length} rezzed; first selected).`
          : `Derez ${state.cards[target].title}.`,
      );
      return { ok: true };
    }
    case "install_and_rez_asset_or_upgrade_free": {
      const pick =
        state.corp.hand.find((id) => {
          const t = state.cards[id].type;
          return t === "asset" || t === "upgrade";
        }) ??
        state.corp.discard.find((id) => {
          const t = state.cards[id].type;
          return t === "asset" || t === "upgrade";
        });
      if (!pick) {
        log(state, `Install+rez asset/upgrade — none in HQ/Archives.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      let serverId: import("../state/types.js").ServerId;
      if (card.type === "upgrade") {
        // Prefer first remote, else create
        const remotes = Object.values(state.servers).filter(
          (s) => s.kind === "remote",
        );
        if (remotes.length > 0) {
          serverId = remotes[0]!.id;
        } else {
          const remoteNum = state.nextRemoteNumber++;
          serverId = `remote-${remoteNum}`;
          state.servers[serverId] = {
            id: serverId,
            kind: "remote",
            ice: [],
            root: [],
          };
        }
      } else {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}`;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      state.servers[serverId].root.push(pick);
      card.zone = `server:${serverId}:root`;
      card.rezzed = true;
      card.faceup = true;
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install and rez ${card.title} on ${serverId} ignoring costs.`,
      );
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: pick }, card.onRez);
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: pick }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_return_self_to_grip": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.runner.credits >= action.creditCost) {
        options.push({
          id: "return",
          label: `Pay ${action.creditCost}¢: add to grip`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: action.creditCost,
                },
              },
              { op: "do", action: { kind: "return_source_to_grip" } },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Leave in heap",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.creditCost}¢ to return to grip.`,
      );
      return { ok: true };
    }
    case "return_source_to_grip": {
      // Move source from heap to grip.
      state.runner.discard = state.runner.discard.filter((id) => id !== sourceId);
      if (!state.runner.hand.includes(sourceId)) {
        state.runner.hand.push(sourceId);
      }
      source.zone = "runner:grip";
      source.faceup = true;
      log(state, `Return ${source.title} to grip.`);
      return { ok: true };
    }
    case "install_resource_discount": {
      const matches = state.runner.hand.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (matches.length === 0) {
        log(state, `Install resource discounted — none in grip.`);
        return { ok: true };
      }
      // Auto-first match, pay installCost - discount
      const id = matches[0]!;
      const card = state.cards[id];
      const cost = Math.max(0, card.installCost - action.discount);
      if (state.runner.credits < cost) {
        log(
          state,
          `Install ${card.title} discounted — cannot afford ${cost}¢.`,
        );
        return { ok: true };
      }
      state.runner.credits -= cost;
      state.runner.hand = state.runner.hand.filter((x) => x !== id);
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      log(
        state,
        `Install ${card.title} for ${cost}¢ (${action.discount}¢ discount).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: id }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "give_bad_publicity": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + action.amount;
      log(
        state,
        `Corp takes ${action.amount} bad publicity → ${state.corp.badPublicity}.`,
      );
      return { ok: true };
    }
    case "reveal_hq_gain_credits": {
      const n = Math.min(action.maxCards, state.corp.hand.length);
      const gain = n * action.creditsEach;
      state.corp.credits += gain;
      log(
        state,
        `Reveal ${n} card(s) from HQ → gain ${gain}¢ (${action.creditsEach}¢ each).`,
      );
      return { ok: true };
    }
    case "move_advancements": {
      const sources = Object.values(state.cards).filter(
        (c) =>
          (c.advancementTokens ?? 0) > 0 &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      const dests = Object.values(state.cards).filter(
        (c) =>
          (c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice" ||
            c.canAdvance) &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      if (sources.length === 0 || dests.length < 2) {
        log(state, `Move advancements — no valid source/dest.`);
        return { ok: true };
      }
      const from = sources[0]!;
      const to = dests.find((c) => c.id !== from.id);
      if (!to) {
        log(state, `Move advancements — no destination.`);
        return { ok: true };
      }
      const move = Math.min(action.amount, from.advancementTokens ?? 0);
      from.advancementTokens = (from.advancementTokens ?? 0) - move;
      to.advancementTokens = (to.advancementTokens ?? 0) + move;
      log(
        state,
        `Move ${move} advancement(s) from ${from.title} to ${to.title}.`,
      );
      return { ok: true };
    }
    case "trash_passed_unrezzed_ice": {
      const ids = (state.turn.lastRunPassedUnrezzedIceIds ?? []).filter(
        (id) => {
          const c = state.cards[id];
          return c && c.type === "ice" && !c.rezzed && c.zone.endsWith(":ice");
        },
      );
      if (ids.length === 0) {
        log(state, `Trash passed unrezzed ice — none available.`);
        return { ok: true };
      }
      const id = ids[0]!;
      const card = state.cards[id];
      trashCorpCardToArchives(state, id);
      log(state, `Trash unrezzed ${card.title} (passed last run).`);
      return { ok: true };
    }
    case "forged_activation_orders": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Forged Activation Orders — no unrezzed ice.`);
        return { ok: true };
      }
      const iceId = targets[0]!;
      const ice = state.cards[iceId];
      const rezCost = ice.rezCost ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.corp.credits >= rezCost) {
        options.push({
          id: "rez",
          label: `Rez ${ice.title} for ${rezCost}¢`,
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        });
      }
      options.push({
        id: "trash",
        label: `Trash ${ice.title}`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      // Resolve immediately with Corp preference: rez if able, else trash.
      // Honesty: auto-rez when affordable, otherwise trash.
      if (state.corp.credits >= rezCost) {
        state.corp.credits -= rezCost;
        ice.rezzed = true;
        ice.faceup = true;
        log(state, `Forged Activation Orders — Corp rezzes ${ice.title}.`);
        if (ice.onRez) {
          const r = evalEffect({ state, sourceId: iceId }, ice.onRez);
          if (!r.ok) return r;
        }
      } else {
        trashCorpCardToArchives(state, iceId);
        log(
          state,
          `Forged Activation Orders — Corp cannot rez; trash ${ice.title}.`,
        );
      }
      return { ok: true };
    }
    case "install_program_from_stack_or_heap_free": {
      const fromHeap = state.runner.discard.find(
        (id) => state.cards[id].type === "program",
      );
      const fromStack = state.runner.deck.find(
        (id) => state.cards[id].type === "program",
      );
      const id = fromHeap ?? fromStack;
      if (!id) {
        log(state, `Install program from stack/heap — none found.`);
        return { ok: true };
      }
      const card = state.cards[id];
      state.runner.discard = state.runner.discard.filter((x) => x !== id);
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      card.bounceToStackAtTurnEnd = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install ${card.title} ignoring costs (will bounce to stack at turn end).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: id }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "place_advancements_x_from_tags": {
      const x = Math.min(state.corp.credits, state.runner.tags);
      if (x <= 0) {
        log(state, `Psychographics — X=0 (no tags or credits).`);
        return { ok: true };
      }
      state.corp.credits -= x;
      const targets = Object.values(state.cards).filter(
        (c) =>
          (c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice" ||
            c.canAdvance) &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      if (targets.length === 0) {
        log(state, `Psychographics — spend ${x}¢ but no advanceable target.`);
        return { ok: true };
      }
      const t = targets[0]!;
      t.advancementTokens = (t.advancementTokens ?? 0) + x;
      log(
        state,
        `Psychographics — spend ${x}¢, place ${x} advancement(s) on ${t.title}.`,
      );
      return { ok: true };
    }
    case "troubleshooter_fortify": {
      const x = state.corp.credits;
      if (x <= 0) {
        log(state, `Corporate Troubleshooter — no credits to spend.`);
        // Still trash self via cost if paid ability includes trashSelf
        return { ok: true };
      }
      const iceTargets = Object.values(state.cards).filter(
        (c) => c.type === "ice" && c.zone.endsWith(":ice") && c.rezzed,
      );
      if (iceTargets.length === 0) {
        log(state, `Corporate Troubleshooter — no rezzed ice.`);
        return { ok: true };
      }
      state.corp.credits = 0;
      const ice = iceTargets[0]!;
      state.turn.iceStrengthBoostsThisTurn[ice.id] =
        (state.turn.iceStrengthBoostsThisTurn[ice.id] ?? 0) + x;
      log(
        state,
        `Corporate Troubleshooter — spend ${x}¢, ${ice.title} +${x} strength this turn.`,
      );
      return { ok: true };
    }
    case "resolve_bioroid_subroutine": {
      const others: Array<{ iceId: string; subIndex: number }> = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId) continue;
          const ice = state.cards[id];
          if (!ice.rezzed) continue;
          if (!(ice.subtypes ?? []).includes("bioroid")) continue;
          const subs = ice.subroutines ?? [];
          for (let i = 0; i < subs.length; i++) {
            others.push({ iceId: id, subIndex: i });
          }
        }
      }
      if (others.length === 0) {
        log(state, `Resolve bioroid sub — no other rezzed bioroid ice.`);
        return { ok: true };
      }
      const pick = others[0]!;
      const ice = state.cards[pick.iceId];
      const sub = ice.subroutines![pick.subIndex]!;
      log(
        state,
        `Resolve "${sub.text}" on ${ice.title} (via ${source.title}).`,
      );
      return evalEffect({ state, sourceId: pick.iceId }, sub.effect);
    }
    case "host_ice_program_on_self": {
      // Magnet: host a program already hosted on another ice.
      const hosted: string[] = [];
      for (const id of Object.keys(state.cards)) {
        const c = state.cards[id];
        if (
          c.type === "program" &&
          c.hostId &&
          c.hostId !== sourceId &&
          state.runner.rig.includes(id)
        ) {
          hosted.push(id);
        }
      }
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted programs on other ice.`);
        return { ok: true };
      }
      const pid = hosted[0]!;
      const prog = state.cards[pid];
      prog.hostId = sourceId;
      prog.abilitiesBlanked = true;
      log(
        state,
        `${source.title} hosts ${prog.title} (abilities blanked).`,
      );
      return { ok: true };
    }
    case "return_subliminal_from_archives": {
      // Handled at Corp turn begin when conditions met — this primitive
      // returns the source from Archives to HQ if present.
      if (!state.corp.discard.includes(sourceId)) {
        return { ok: true };
      }
      state.corp.discard = state.corp.discard.filter((id) => id !== sourceId);
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.faceup = false;
      log(state, `Return ${source.title} from Archives to HQ.`);
      return { ok: true };
    }
    case "aesop_trash_for_credits": {
      const owned = state.runner.rig.filter((id) => id !== sourceId);
      if (owned.length === 0) {
        log(state, `Aesop's Pawnshop — no other installed card.`);
        return { ok: true };
      }
      const id = owned[0]!;
      const card = state.cards[id];
      trashToHeap(state, id);
      state.runner.credits += action.amount;
      log(
        state,
        `Aesop's Pawnshop — trash ${card.title}, gain ${action.amount}¢.`,
      );
      return { ok: true };
    }
    case "ayla_set_aside_to_grip": {
      const setAside = state.runner.setAside ?? [];
      if (setAside.length === 0) {
        log(state, `Ayla — set-aside empty.`);
        return { ok: true };
      }
      const id = setAside[0]!;
      state.runner.setAside = setAside.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id].zone = "runner:grip";
      state.cards[id].faceup = true;
      log(state, `Ayla — add ${state.cards[id].title} from set-aside to grip.`);
      return { ok: true };
    }
    case "sabotage": {
      if (action.interactive) {
        state.pendingSabotage = { sourceId, amount: action.amount };
        log(
          state,
          `Sabotage ${action.amount} pending — Corp chooses HQ cards (CR ${CR.sabotageResolution.number}).`,
        );
        return { ok: true };
      }
      return resolveSabotageAmount(state, sourceId, action.amount);
    }
    case "identify_mark": {
      identifyMark(state, sourceId);
      return { ok: true };
    }
    case "charge": {
      if (action.pick === "self") {
        return chargeCard(state, sourceId, sourceId);
      }
      if (action.pick === "card") {
        if (!action.cardId) {
          return {
            ok: false,
            error: "charge pick=card requires cardId.",
            cites: [CR.charge],
          };
        }
        return chargeCard(state, action.cardId, sourceId);
      }
      // choose among controller's installed chargeable cards
      const side = source.side;
      const cands = chargeableInstalledIds(state, side);
      if (cands.length === 0) {
        log(
          state,
          `Charge — no installed card with power counters (CR ${CR.chargeTargets.number}).`,
        );
        return { ok: true };
      }
      if (cands.length === 1) {
        return chargeCard(state, cands[0]!, sourceId);
      }
      state.pendingChoice = {
        sourceId,
        chooser: side,
        options: cands.map((id) => ({
          id: `charge-${id}`,
          label: `Charge ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "charge" as const,
              pick: "card" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `Charge — ${side} chooses among ${cands.length} cards (CR ${CR.chargeTargets.number}).`,
      );
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
          ctx.state.pendingSabotage ||
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

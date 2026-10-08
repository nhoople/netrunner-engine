/** Terminal Directive Cards (td) Red Sand deluxe primitives — v1.130.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";
import { getCardDef } from "../cards/load.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashToHeap(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "runner:heap";
  card.hostId = undefined;
  state.runner.discard.push(cardId);
}

function trashToArchives(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  state.corp.discard.push(cardId);
}

function installedIce(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function remoteIce(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const [sid, server] of Object.entries(state.servers)) {
    if (sid === "hq" || sid === "rd" || sid === "archives") continue;
    for (const id of server.ice) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function breakerStrength(state: EffectCtx["state"], sourceId: string): number {
  const source = state.cards[sourceId];
  if (!source) return 0;
  const unused = Math.max(0, memoryLimit(state) - usedMemory(state));
  const per = source.strengthBonusPerUnusedMu ?? 0;
  return (
    (source.breaker?.strength ?? source.strength ?? 0) +
    unused * per +
    (state.turn.breakerStrengthBoostsThisTurn[sourceId] ?? 0) +
    (state.run?.strengthBoosts[sourceId] ?? 0) +
    (state.run?.encounterStrengthBoosts[sourceId] ?? 0)
  );
}

function breakOneSub(
  state: EffectCtx["state"],
  sourceId: string,
  label: string,
): PrimResult {
  const enc = state.run?.encounter;
  if (!enc) {
    log(state, `${label} — no encounter.`);
    return { ok: true };
  }
  const ice = state.cards[enc.iceId];
  const str = breakerStrength(state, sourceId);
  const iceStr = ice?.strength ?? 0;
  if (str < iceStr) {
    return {
      ok: false,
      error: `${label} strength ${str} < ice strength ${iceStr}.`,
      cites: [],
    };
  }
  const idx = enc.broken.findIndex((b) => !b);
  if (idx < 0) {
    log(state, `${label} — no unbroken subroutines.`);
    return { ok: true };
  }
  enc.broken[idx] = true;
  log(
    state,
    `${label} — break "${ice?.subroutines?.[idx]?.text ?? `sub ${idx}`}" on ${ice?.title}.`,
  );
  if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
  if (!state.run!.breakersThatBroke.includes(sourceId)) {
    state.run!.breakersThatBroke.push(sourceId);
  }
  return { ok: true };
}

export function applyRedsandTdPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "brute_force_hack_derez_ice_rez_cost_lte_x": {
      const x = state.turn.lastPlayCostX ?? 0;
      const candidates = installedIce(state).filter((id) => {
        const ice = state.cards[id];
        return ice?.rezzed && (ice.rezCost ?? 0) <= x;
      });
      if (candidates.length === 0) {
        log(state, `Brute-Force Hack — no rezzed ice with rez cost ≤ ${x}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "derez_card", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "syn_attack_corp_discard_2_or_draw_4": {
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "draw4",
          label: "Draw 4 cards",
          effect: fx.draw("corp", 4),
        },
      ];
      if (state.corp.hand.length >= 2) {
        options.unshift({
          id: "discard2",
          label: "Discard 2 cards",
          effect: fx.do({ kind: "corp_discard_random_from_hq", amount: 2 }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `SYN Attack — Corp must discard 2 or draw 4.`);
      return { ok: true };
    }

    case "mammon_spend_credits_place_power_counters": {
      const max = state.runner.credits;
      if (max <= 0 || !source) {
        log(state, `Mammon — no credits to spend.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 1; n <= max; n++) {
        options.push({
          id: `mammon:${n}`,
          label: `Spend ${n}¢ → place ${n} power`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "lose_credits", side: "runner", amount: n }),
              fx.do({ kind: "add_power_counter", amount: n }),
            ],
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "charlatan_run_any_server": {
      state.pendingStartRun = {
        sourceId,
        serverId: "hq",
        // Charlatan: first approached rezzed ice may pay strength to bypass.
      };
      state.turn.charlatanArmed = true;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: (["hq", "rd", "archives"] as ServerId[])
          .concat(
            Object.keys(state.servers).filter(
              (s) => s !== "hq" && s !== "rd" && s !== "archives",
            ) as ServerId[],
          )
          .map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid}`,
            effect: fx.do({ kind: "charlatan_start_run", serverId: sid }),
          })),
      };
      return { ok: true };
    }

    case "charlatan_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = { sourceId, serverId };
      state.turn.charlatanArmed = true;
      state.pendingChoice = null;
      log(state, `Charlatan — run ${serverId}.`);
      return { ok: true };
    }

    case "maxwell_james_derez_remote_ice": {
      const candidates = remoteIce(state).filter((id) => state.cards[id]?.rezzed);
      if (candidates.length === 0) {
        log(state, `Maxwell James — no rezzed remote ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "derez_card", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "careful_planning_choose_remote_card_cannot_rez_this_turn": {
      const candidates: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        for (const id of [...server.root, ...server.ice]) {
          if (state.cards[id] && !state.cards[id]!.rezzed) candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Careful Planning — no unrezzed remote cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `forbid:${id}`,
          label: `Cannot rez ${state.cards[id]!.title} this turn`,
          effect: fx.do({
            kind: "careful_planning_forbid_rez",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "careful_planning_forbid_rez": {
      const cardId = action.cardId;
      if (!cardId) return { ok: true };
      if (!state.turn.carefulPlanningCannotRezIds) {
        state.turn.carefulPlanningCannotRezIds = [];
      }
      state.turn.carefulPlanningCannotRezIds.push(cardId);
      log(
        state,
        `Careful Planning — ${state.cards[cardId]?.title ?? cardId} cannot be rezzed this turn.`,
      );
      return { ok: true };
    }

    case "adept_break_sentry_or_barrier": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      if (!subs.includes("sentry") && !subs.includes("barrier")) {
        return {
          ok: false,
          error: "Adept can only break sentry or barrier subroutines.",
          cites: [],
        };
      }
      return breakOneSub(state, sourceId, "Adept");
    }

    case "savant_break_sentry_or_code_gates": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      const isSentry = subs.includes("sentry");
      const isCodeGate = subs.includes("code gate");
      if (!isSentry && !isCodeGate) {
        return {
          ok: false,
          error: "Savant can only break sentry or code gate subroutines.",
          cites: [],
        };
      }
      if (isSentry && !isCodeGate) {
        return breakOneSub(state, sourceId, "Savant");
      }
      if (isCodeGate && !isSentry) {
        // Break up to 2 code gate subs
        const str = breakerStrength(state, sourceId);
        const iceStr = ice?.strength ?? 0;
        if (str < iceStr) {
          return {
            ok: false,
            error: `Savant strength ${str} < ice strength ${iceStr}.`,
            cites: [],
          };
        }
        let broken = 0;
        for (let i = 0; i < enc.broken.length && broken < 2; i++) {
          if (!enc.broken[i]) {
            enc.broken[i] = true;
            broken++;
            log(
              state,
              `Savant — break "${ice?.subroutines?.[i]?.text ?? `sub ${i}`}" on ${ice?.title}.`,
            );
          }
        }
        if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
        if (!state.run!.breakersThatBroke.includes(sourceId)) {
          state.run!.breakersThatBroke.push(sourceId);
        }
        return { ok: true };
      }
      // Both subtypes: choose 1 sentry or up to 2 code gate — treat as 1 break for simplicity
      return breakOneSub(state, sourceId, "Savant");
    }

    case "levy_advanced_research_lab_reveal": {
      const top = state.runner.deck.slice(0, 4);
      if (top.length === 0) {
        log(state, `Levy Advanced Research Lab — stack empty.`);
        return { ok: true };
      }
      const programs = top.filter(
        (id) => state.cards[id]?.type === "program",
      );
      const rest = top.filter((id) => !programs.includes(id));
      // Remove revealed from deck temporarily
      state.runner.deck = state.runner.deck.slice(top.length);
      if (programs.length === 0) {
        // All to bottom in any order — put back
        state.runner.deck.push(...top);
        log(state, `Levy — no programs among top 4; add to bottom.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...programs.map((id) => ({
            id: `take:${id}`,
            label: `Add ${state.cards[id]!.title} to grip`,
            effect: fx.do({
              kind: "levy_take_program_rest_bottom",
              cardId: id,
              restIds: [...programs.filter((x) => x !== id), ...rest],
            }),
          })),
          {
            id: "decline",
            label: "Add all to bottom",
            effect: fx.do({
              kind: "levy_take_program_rest_bottom",
              restIds: top,
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "levy_take_program_rest_bottom": {
      const takeId = action.cardId;
      const restIds = action.restIds ?? [];
      if (takeId && state.cards[takeId]) {
        state.runner.hand.push(takeId);
        state.cards[takeId]!.zone = "runner:grip";
        log(state, `Levy — add ${state.cards[takeId]!.title} to grip.`);
      }
      for (const id of restIds) {
        if (!state.cards[id]) continue;
        state.runner.deck.push(id);
        state.cards[id]!.zone = "runner:stack";
      }
      return { ok: true };
    }

    case "dean_lister_boost_icebreaker": {
      const breakers = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c && (c.subtypes ?? []).some((s) => s === "icebreaker");
      });
      if (breakers.length === 0) {
        log(state, `Dean Lister — no icebreakers.`);
        return { ok: true };
      }
      const bonus = state.runner.hand.length;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `boost:${id}`,
          label: `+${bonus} strength on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "dean_lister_apply_boost",
            cardId: id,
            amount: bonus,
          }),
        })),
      };
      return { ok: true };
    }

    case "dean_lister_apply_boost": {
      const cardId = action.cardId;
      const amount = action.amount ?? 0;
      if (!cardId || !state.run) return { ok: true };
      state.run.strengthBoosts[cardId] =
        (state.run.strengthBoosts[cardId] ?? 0) + amount;
      log(
        state,
        `Dean Lister — ${state.cards[cardId]?.title} +${amount} strength this run.`,
      );
      return { ok: true };
    }

    case "the_shadow_net_play_event_from_heap": {
      const events = state.runner.discard.filter(
        (id) => state.cards[id]?.type === "event",
      );
      if (events.length === 0) {
        log(state, `The Shadow Net — no events in heap.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: events.map((id) => ({
          id: `play:${id}`,
          label: `Play ${state.cards[id]!.title} (ignore costs)`,
          effect: fx.do({
            kind: "the_shadow_net_play_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "the_shadow_net_play_resolve": {
      const cardId = action.cardId;
      if (!cardId) return { ok: true };
      const card = state.cards[cardId];
      if (!card || card.type !== "event") return { ok: true };
      // Remove from heap and fire onPlay ignoring costs
      state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
      card.zone = "runner:play-area";
      const def = getCardDef(card.defId!);
      if (def.onPlay) {
        const r = evalEffect({ state, sourceId: cardId }, def.onPlay);
        if (!r.ok) return r;
      }
      // Events go to heap after play unless otherwise stated
      trashToHeap(state, cardId);
      log(state, `The Shadow Net — play ${card.title} from heap.`);
      return { ok: true };
    }

    case "brain_rewiring_spend_credits_force_bottom_draw": {
      const max = state.corp.credits;
      if (max <= 0) {
        log(state, `Brain Rewiring — no credits.`);
        return { ok: true };
      }
      const gripMax = state.runner.hand.length;
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 1; n <= Math.min(max, Math.max(gripMax, 1)); n++) {
        options.push({
          id: `br:${n}`,
          label: `Spend ${n}¢`,
          effect: fx.do({
            kind: "brain_rewiring_resolve",
            amount: n,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "brain_rewiring_resolve": {
      const n = action.amount ?? 0;
      if (n <= 0) return { ok: true };
      state.corp.credits = Math.max(0, state.corp.credits - n);
      const grip = [...state.runner.hand];
      const take = Math.min(n, grip.length);
      // Random bottom
      for (let i = 0; i < take; i++) {
        const idx = Math.floor(Math.random() * grip.length);
        const id = grip.splice(idx, 1)[0]!;
        state.runner.hand = state.runner.hand.filter((x) => x !== id);
        state.runner.deck.push(id);
        state.cards[id]!.zone = "runner:stack";
      }
      log(state, `Brain Rewiring — Runner bottoms ${take} at random.`);
      return evalEffect(ctx, fx.draw("runner", 1));
    }

    case "estelle_moon_trash_per_power": {
      const n = source?.powerCounters ?? 0;
      if (n <= 0) {
        log(state, `Estelle Moon — no power counters.`);
        return { ok: true };
      }
      state.corp.credits += 2 * n;
      log(state, `Estelle Moon — gain ${2 * n}¢ and draw ${n}.`);
      return evalEffect(ctx, fx.draw("corp", n));
    }

    case "holmegaard_forbid_access_and_breach_this_run": {
      if (state.run) {
        state.run.holmegaardForbidAccessBreach = true;
        state.run.skipBreach = true;
      }
      log(
        state,
        `Holmegaard — Runner cannot access or breach for the remainder of this run.`,
      );
      return { ok: true };
    }

    case "holmegaard_trash_installed_icebreaker": {
      const breakers = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c && (c.subtypes ?? []).some((s) => s === "icebreaker");
      });
      if (breakers.length === 0) {
        log(state, `Holmegaard — no installed icebreakers.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: breakers.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "black_level_clearance_core_or_jack_out": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "core",
            label: "Suffer 1 core damage",
            effect: fx.coreDamage(1),
          },
          {
            id: "jack",
            label: "Jack out (Corp gains 5¢, draws 1, trashes this)",
            effect: fx.do({ kind: "black_level_clearance_jack_out" }),
          },
        ],
      };
      return { ok: true };
    }

    case "black_level_clearance_jack_out": {
      state.corp.credits += 5;
      if (source) trashToArchives(state, sourceId);
      if (state.run) {
        state.run.endedTheRun = true;
        state.run.successful = false;
      }
      log(state, `Black Level Clearance — Runner jacks out; Corp gains 5¢.`);
      return evalEffect(ctx, fx.draw("corp", 1));
    }

    case "armored_servers_activate_this_run": {
      if (state.run) {
        state.run.armoredServersTrashGripAdditionalCost = true;
      }
      log(
        state,
        `Armored Servers — trash 1 grip as additional cost to jack out or break a subroutine this run.`,
      );
      return { ok: true };
    }

    case "bloodletter_trash_program_or_top_2_stack": {
      const programs = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "program",
      );
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const id of programs) {
        options.push({
          id: `prog:${id}`,
          label: `Trash program ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        });
      }
      options.push({
        id: "mill2",
        label: "Trash the top 2 cards of the stack",
        effect: {
          op: "seq",
          effects: [
            fx.do({ kind: "trash_top_of_stack" }),
            fx.do({ kind: "trash_top_of_stack" }),
          ],
        },
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "hunter_seeker_trash_installed": {
      const candidates: string[] = [];
      for (const id of state.runner.rig) {
        if (state.cards[id]) candidates.push(id);
      }
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (state.cards[id]) candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Hunter Seeker — no installed cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind:
              state.cards[id]!.side === "runner"
                ? "trash_installed_runner_card"
                : "trash_installed_corp_card",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "k_p_lynn_tag_or_end_the_run": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tag",
            label: "Take 1 tag",
            effect: fx.do({ kind: "give_tags", amount: 1 }),
          },
          {
            id: "etr",
            label: "End the run",
            effect: fx.etr(),
          },
        ],
      };
      return { ok: true };
    }

    case "long_term_investment_take_any_hosted_credits": {
      const hosted = source?.hostedCredits ?? 0;
      if (!source || hosted < 8) {
        log(state, `Long-Term Investment — need ≥8 hosted credits.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 1; n <= hosted; n++) {
        options.push({
          id: `take:${n}`,
          label: `Take ${n}¢`,
          effect: fx.do({ kind: "take_hosted_credits", amount: n }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "weir_trash_one_from_grip": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `Weir — grip empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_from_grip", cardId: id }),
        })),
      };
      return { ok: true };
    }

    default:
      return null;
  }
}

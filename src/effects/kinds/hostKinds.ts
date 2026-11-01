/**
 * Primitive kinds whose procedure is host.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type {
  Effect,
  Primitive,
} from "../ir.js";
import { abilitiesSuppressed } from "../../state/abilities.js";
import { log } from "../../state/createGame.js";
import {
  hostFenrisIdentity,
  legalFenrisHostIds,
} from "../../state/fenris.js";
import { cancelPendingIfSourceInactive } from "../../state/pendingAbilities.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import { CR } from "../../timing/labels.js";
import { applyPrimitive } from "../eval.js";

export function applyHostKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "host_on_ice": {
      const ice = state.cards[action.iceId];
      if (
        !ice ||
        ice.type !== "ice" ||
        !(ice.subtypes ?? []).includes("bioroid")
      ) {
        log(state, `Bioroid Efficiency Research — invalid bioroid ice.`);
        return { ok: true };
      }
      ice.rezzed = true;
      ice.faceup = true;
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = action.iceId;
      source.zone = `hosted:${action.iceId}`;
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "counter";
      if (!ice.hostedCardIds) ice.hostedCardIds = [];
      if (!ice.hostedCardIds.includes(sourceId)) ice.hostedCardIds.push(sourceId);
      log(
        state,
        `Rez ${ice.title} ignoring costs; host ${source.title} as condition counter.`,
      );
      return { ok: true };
    }

case "may_host_one_from_grip_facedown_then_draw": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `${source.title} — grip empty; cannot host.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((cardId) => ({
            id: `host-grip:${cardId}`,
            label: `Host ${state.cards[cardId]!.title} facedown: draw 1`,
            effect: {
              op: "do" as const,
              action: {
                kind: "host_grip_card_facedown_then_draw" as const,
                cardId,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may host 1 from grip facedown to draw 1.`,
});
      return { ok: true };
    }

case "host_grip_card_facedown_then_draw": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      if (!state.runner.hand.includes(action.cardId)) {
        log(state, `Host from grip — ${action.cardId} not in grip.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== action.cardId);
      const card = state.cards[action.cardId]!;
      card.hostId = sourceId;
      card.faceup = false;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(state, `${source.title} hosts a card facedown from grip.`);
      // Draw 1
      if (state.runner.deck.length === 0) {
        log(state, `Draw — stack empty.`);
        return { ok: true };
      }
      const drawn = state.runner.deck.shift()!;
      state.runner.hand.push(drawn);
      state.cards[drawn]!.zone = "runner:grip";
      log(state, `Runner draws 1 card.`);
      return { ok: true };
    }

case "host_all_programs_from_grip": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `${source.title} — no programs in grip to host.`);
        return { ok: true };
      }
      if (!source.hostedCardIds) source.hostedCardIds = [];
      for (const id of programs) {
        state.runner.hand = state.runner.hand.filter((x) => x !== id);
        const card = state.cards[id]!;
        card.hostId = sourceId;
        card.faceup = true;
        card.zone = `hosted:${sourceId}`;
        source.hostedCardIds.push(id);
      }
      log(
        state,
        `${source.title} hosts ${programs.length} program(s) from grip.`,
      );
      return { ok: true };
    }

case "may_host_one_program_or_hardware_from_grip_faceup": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      const grip = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (grip.length === 0) {
        log(state, `${source.title} — no program/hardware in grip to host.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((cardId) => ({
            id: `host-grip-faceup:${cardId}`,
            label: `Host ${state.cards[cardId]!.title} faceup`,
            effect: {
              op: "do" as const,
              action: {
                kind: "host_grip_program_or_hardware_faceup" as const,
                cardId,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may host 1 program or hardware from grip faceup.`,
});
      return { ok: true };
    }

case "host_grip_program_or_hardware_faceup": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      if (!state.runner.hand.includes(action.cardId)) {
        log(state, `Host from grip — ${action.cardId} not in grip.`);
        return { ok: true };
      }
      const card = state.cards[action.cardId]!;
      if (card.type !== "program" && card.type !== "hardware") {
        log(state, `Host from grip — not a program or hardware.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== action.cardId);
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(state, `${source.title} hosts ${card.title} faceup from grip.`);
      return { ok: true };
    }

case "host_hardware_on_icebreaker": {
      const br = state.cards[action.icebreakerId];
      if (!br || !state.runner.installed.includes(action.icebreakerId)) {
        log(state, `host_hardware_on_icebreaker — invalid icebreaker.`);
        return { ok: true };
      }
      source.hostId = action.icebreakerId;
      if (source.hostGainsAiSubtype) {
        const subs = new Set(br.subtypes ?? []);
        subs.add("ai");
        br.subtypes = [...subs];
        if (br.breaker && br.breaker.breaksSubtype !== "*") {
          // Adjusted Matrix: AI + break any via lose-click interface.
        }
        log(state, `${br.title} gains AI (${source.title}).`);
      }
      if (source.hostGainsLoseClickBreakAnySubroutine) {
        const abs = br.paidAbilities ? [...br.paidAbilities] : [];
        abs.push({
          id: `${source.defId}-lose-click-break`,
          label: "Lose [click]: Break 1 subroutine",
          clickCost: 1,
          creditCost: 0,
          cost: { clicks: 1 },
          windows: ["encounter_paw"],
          effect: {
            op: "do",
            action: { kind: "break_any_subroutine" },
          },
        });
        br.paidAbilities = abs;
        if (br.breaker) br.breaker.breaksSubtype = "*";
      }
      if (source.hostGainsPumpAbility) {
        const { credits, strength } = source.hostGainsPumpAbility;
        const abs = br.paidAbilities ? [...br.paidAbilities] : [];
        abs.push({
          id: `${source.defId}-pump`,
          label: `${credits}¢: +${strength} strength`,
          clickCost: 0,
          creditCost: credits,
          cost: { credits },
          windows: ["encounter_paw"],
          effect: {
            op: "do",
            action: { kind: "pump_strength", amount: strength },
          },
        });
        br.paidAbilities = abs;
      }
      log(state, `${source.title} hosted on ${br.title}.`);
      return { ok: true };
    }

case "host_top_of_stack_on_source": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `${source.title} — stack empty; cannot host.`);
        return { ok: true };
      }
      state.runner.deck.shift();
      const card = state.cards[top]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(top);
      log(state, `${source.title} hosts ${card.title} from stack faceup.`);
      return { ok: true };
    }

case "host_gmod_identity_from_outside_game": {
      const requireMismatch =
        action.requireFactionMismatchWithRunnerIdentity !== false;
      const candidates = legalFenrisHostIds(state, requireMismatch);
      if (candidates.length === 0) {
        return {
          ok: false,
          error:
            "DJ Fenris requires a legal g-mod identity in the outside-game pile that does not match your identity's faction.",
          cites: [
            CR.additionalIdentity,
            CR.additionalIdentitiesPile,
            CR.whenInstalled,
          ],
        };
      }
      if (candidates.length === 1) {
        hostFenrisIdentity(state, sourceId, candidates[0]!);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((cardId) => ({
          id: `fenris-host:${cardId}`,
          label: `Host ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_gmod_identity" as const,
              cardId,
              requireFactionMismatchWithRunnerIdentity: requireMismatch,
            },
          },
        })),
logLine: `${source.title} — choose a g-mod identity to host (CR 1.5.4a).`,
});
      return { ok: true };
    }

case "host_gmod_identity": {
      const requireMismatch =
        action.requireFactionMismatchWithRunnerIdentity !== false;
      const candidates = legalFenrisHostIds(state, requireMismatch);
      if (!candidates.includes(action.cardId)) {
        return {
          ok: false,
          error: `${action.cardId} is not a legal DJ Fenris host.`,
          cites: [CR.additionalIdentity, CR.additionalIdentitiesPile],
        };
      }
      hostFenrisIdentity(state, sourceId, action.cardId);
      return { ok: true };
    }

case "host_random_hq": {
      const hq = state.corp.hand;
      if (hq.length === 0) {
        log(state, `${source.title} — HQ empty.`);
        return { ok: true };
      }
      const cardId = hq[hq.length - 1]!;
      state.corp.hand = hq.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.rezzed = false;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(cardId);
      log(state, `${source.title} hosts ${card.title} from HQ faceup.`);
      return { ok: true };
    }

case "host_stack_card_on_source": {
      if (!state.runner.deck.includes(action.cardId)) {
        log(state, `Host stack card — ${action.cardId} not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== action.cardId);
      const card = state.cards[action.cardId]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(
        state,
        `${source.title} hosts ${card.title} faceup (not installed).`,
      );
      return { ok: true };
    }

case "host_copy_from_grip": {
      const match = state.runner.hand.find(
        (id) => state.cards[id]?.title === action.title,
      );
      if (!match) {
        log(
          state,
          `${source.title} — no ${action.title} in grip to host.`,
        );
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== match);
      const card = state.cards[match]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(match);
      log(
        state,
        `${source.title} hosts ${card.title} faceup (not installed).`,
      );
      return { ok: true };
    }

case "host_ice_program_on_self": {
      // Magnet: choose 1 installed program hosted on another ice (printed).
      const hosted: string[] = [];
      for (const id of Object.keys(state.cards)) {
        const c = state.cards[id];
        if (
          c.type === "program" &&
          c.hostId &&
          c.hostId !== sourceId &&
          state.runner.installed.includes(id)
        ) {
          hosted.push(id);
        }
      }
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted programs on other ice.`);
        return { ok: true };
      }
      const chosenId = (action as { cardId?: string }).cardId;
      if (!chosenId) {
        if (hosted.length === 1) {
          return applyPrimitive(ctx, {
            kind: "host_ice_program_on_self",
            cardId: hosted[0]!,
          } as Primitive);
        }
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: hosted.map((id) => ({
            id: `magnet:${id}`,
            label: `Host ${state.cards[id]!.title} on ${source.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "host_ice_program_on_self" as const,
                cardId: id,
              },
            },
          })),
        });
        return { ok: true };
      }
      if (!hosted.includes(chosenId)) {
        log(state, `${source.title} — chosen program is not a valid host target.`);
        return { ok: true };
      }
      const prog = state.cards[chosenId]!;
      prog.hostId = sourceId;
      // Magnet blanks hosted programs via continuous 9.12 (hostedProgramsLoseAbilities),
      // not an abilitiesBlanked stamp (CR 9.12.1d/e; not 9.10.1).
      // Still-pending instances die when the ability is blanked (CR 9.6.10).
      cancelPendingIfSourceInactive(
        state,
        (inst) => inst.sourceId !== chosenId,
      );
      log(
        state,
        `${source.title} hosts ${prog.title} (abilities blanked).`,
      );
      return { ok: true };
    }

case "host_installed_trojan_on_attacked_ice": {
      if (!state.run) {
        log(state, `host trojan — no active run.`);
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const iceIds = state.servers[sid]?.ice ?? [];
      const trojans = state.runner.installed.filter(
        (id) => (state.cards[id]?.subtypes ?? []).includes("trojan"),
      );
      if (iceIds.length === 0 || trojans.length === 0) {
        log(state, `host trojan — no ice or no installed trojan.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const tid of trojans) {
        for (const iid of iceIds) {
          options.push({
            id: `host:${tid}:${iid}`,
            label: `Host ${state.cards[tid]!.title} on ${state.cards[iid]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "host_program_on_ice",
                programId: tid,
                iceId: iid,
              },
            },
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — host an installed trojan on attacked ice.`,
});
      return { ok: true };
    }

case "host_program_on_ice": {
      const prog = state.cards[action.programId];
      const ice = state.cards[action.iceId];
      if (!prog || !ice || !state.runner.installed.includes(action.programId)) {
        log(state, `host_program_on_ice — invalid targets.`);
        return { ok: true };
      }
      prog.hostId = action.iceId;
      log(state, `Host ${prog.title} on ${ice.title}.`);
      return { ok: true };
    }

case "host_grip_program_or_hardware_with_power_equal_install_cost": {
      const grip = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (grip.length === 0) {
        log(state, `${source.title} — no program/hardware in grip to host.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((cardId) => ({
          id: `pw-host:${cardId}`,
          label: `Host ${state.cards[cardId]!.title} (power = install cost)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_grip_pw_card_with_power_equal_install_cost" as const,
              cardId,
            },
          },
        })),
logLine: `${source.title} — host a program or hardware from grip with power = install cost.`,
});
      return { ok: true };
    }

case "host_grip_pw_card_with_power_equal_install_cost": {
      if (!state.runner.hand.includes(action.cardId)) {
        log(state, `Personal Workshop host — ${action.cardId} not in grip.`);
        return { ok: true };
      }
      const card = state.cards[action.cardId]!;
      if (card.type !== "program" && card.type !== "hardware") {
        log(state, `Personal Workshop host — not a program or hardware.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== action.cardId);
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      card.powerCounters = Math.max(0, card.installCost ?? 0);
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(
        state,
        `${source.title} hosts ${card.title} with ${card.powerCounters} power (install cost).`,
      );
      if ((card.powerCounters ?? 0) <= 0) {
        return applyPrimitive(ctx, {
          kind: "install_hosted_card_ignore_costs",
          cardId: action.cardId,
        });
      }
      return { ok: true };
    }

case "host_on_ice_as_condition": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.type === "ice") targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no ice to host on.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `host-cond:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_on_ice_as_condition_on" as const,
              iceId: id,
            },
          },
        })),
logLine: `${source.title} — choose ice to host as condition counter.`,
});
      return { ok: true };
    }

case "host_on_ice_as_condition_on": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Host as condition — invalid ice.`);
        return { ok: true };
      }
      if (ice.cannotHostCards && !abilitiesSuppressed(state, action.iceId)) {
        log(state, `${ice.title} cannot host cards.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = action.iceId;
      source.zone = `hosted:${action.iceId}`;
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "counter";
      if (!ice.hostedCardIds) ice.hostedCardIds = [];
      if (!ice.hostedCardIds.includes(sourceId)) ice.hostedCardIds.push(sourceId);
      log(
        state,
        `Host ${source.title} on ${ice.title} as a condition counter.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

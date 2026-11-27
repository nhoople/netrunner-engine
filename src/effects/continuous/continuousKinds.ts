/**
 * Primitive kinds for effects that last for a duration: strength boosts,
 * granted subtypes and subroutines, blanking, can't-restrictions, hand size
 * and memory. The kind registry (`applyCoreKinds`) dispatches here.
 */
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { iceAtRunnerPosition } from "../../state/uninstallAndPosition/runPosition.js";
import {
  type EffectCtx,
  type EvalResult,
  serverHostingCard,
  resolveSide,
  applyPrimitive,
} from "../eval.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { fx } from "../ir/fx.js";
import type { ServerId } from "../../state/types/servers.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { iceStrengthCannotBeLowered } from "../../cards/stubs.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/runnerCredits.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import {
  addBreakerStrengthBoostThisEncounter,
  addBreakerStrengthBoostThisRun,
  addBreakerStrengthBoostThisTurn,
  addBreakerStrengthBoostUntilCheckpoint,
  addAllIceStrengthBoostThisRun,
  addIceStrengthBoostThisEncounter,
  addIceStrengthBoostThisRun,
  addIceStrengthBoostThisTurn,
  addLingeringEffect,
  blankAbilitiesUntilCorpTurnEnd,
  LINGERING_KIND_GRANTED_SUBTYPES,
  LINGERING_KIND_BREAKER_STRENGTH_RUN,
  LINGERING_KIND_RUNNER_MU,
} from "../../state/continuous/lingeringEffects.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { breakerStrength, iceStrength } from "./iceStrength.js";
import { resetEncounterBreaks } from "../../state/turnAndActions/break.js";
import { facedownInstalledRunnerCard } from "../../state/continuous/active.js";
import { recomputeRunnerMaxHandSize } from "../../state/continuous/handSize.js";
import { occurCheckpoint } from "../../legality/checkpoints.js";
import { installedRunnerIds } from "../visibility/visibilityKinds.js";
import { runnerPrograms } from "../hostingAndTrash/runnerInstalledTrashKinds.js";

const FORBIDDEN_PANCHATANTRA = new Set(["barrier", "code gate", "sentry"]);

const COMMON_ICE_SUBTYPES = [
  "ap",
  "destroyer",
  "tracer",
  "observer",
  "advertisement",
  "illusory",
  "deflector",
  "bioroid",
  "mythic",
  "next",
  "grail",
  "morph",
  "expendable",
];

function installedNonVirtualResourceIds(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    return (
      c?.type === "resource" &&
      !(c.subtypes ?? []).includes("virtual") &&
      !c.hostId
    );
  });
}

export function applyContinuousKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "pump_strength": {
      if (!source.breaker) {
        return {
          ok: false,
          error: "Pump requires an icebreaker.",
          cites: [CR.programStrength],
        };
      }
      let amount = action.amount;
      if (source.breaker.pumpUsesIcebreakerCount) {
        amount = state.runner.installed.filter(
          (id) =>
            Boolean(state.cards[id].breaker) ||
            (state.cards[id].subtypes ?? []).includes("icebreaker"),
        ).length;
      }
      // Requested duration before 9.9.9 replacements (Gebrselassie / System
      // Seizure / hosted run-extend). Replacements apply inside the add helpers.
      let duration: import("../ir/shared.js").PumpDuration =
        action.duration ?? "encounter";
      if (duration === "encounter" && !state.run?.encounter) {
        duration = "checkpoint";
      }
      if (duration === "run" && !state.run) {
        return {
          ok: false,
          error: "A run-duration pump requires an active run.",
          cites: [CR.icebreakerStrengthImplicit],
        };
      }
      const sumKind = (kind: string): number => {
        let n = 0;
        for (const e of state.lingeringEffects) {
          if (e.expired || e.kind !== kind) continue;
          const p = e.payload as
            { breakerId?: string; amount?: number } | undefined;
          if (p?.breakerId !== sourceId) continue;
          n += p.amount ?? 0;
        }
        return n;
      };
      const beforeTurn = sumKind("breaker_strength_turn");
      const beforeRun = sumKind("breaker_strength_run");
      const beforeEnc = sumKind("breaker_strength_encounter");
      const beforeCp = sumKind("breaker_strength_checkpoint");
      if (duration === "turn") {
        addBreakerStrengthBoostThisTurn(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      } else if (duration === "run") {
        addBreakerStrengthBoostThisRun(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      } else if (duration === "encounter") {
        addBreakerStrengthBoostThisEncounter(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      } else {
        addBreakerStrengthBoostUntilCheckpoint(state, {
          createdBy: sourceId,
          breakerId: sourceId,
          amount,
        });
      }
      const applied: import("../ir/shared.js").PumpDuration =
        sumKind("breaker_strength_turn") > beforeTurn
          ? "turn"
          : sumKind("breaker_strength_run") > beforeRun
            ? "run"
            : sumKind("breaker_strength_encounter") > beforeEnc
              ? "encounter"
              : sumKind("breaker_strength_checkpoint") > beforeCp
                ? "checkpoint"
                : duration;
      const eff = breakerStrength(state, sourceId);
      log(
        state,
        `Pump ${source.title} +${amount} (${applied}) → strength ${eff} (CR ${
          applied === "checkpoint"
            ? CR.icebreakerStrengthOutsideEncounter.number
            : CR.icebreakerStrengthImplicit.number
        }, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }

    case "pump_blackat_strength": {
      const stealthPaid = (state.turn.stealthCreditsOnLastPaidAbility ?? 0) > 0;
      const amount = stealthPaid ? 2 : 1;
      return applyPrimitive(ctx, {
        kind: "pump_strength",
        amount,
      });
    }

    case "fortify_ice": {
      // Stavka: "this ice gets +5 strength for the remainder of the run"
      // (CR 9.10.1). With no run the duration has already ended and
      // nothing happens (CR 9.10.4).
      if (!state.run || source.type !== "ice") {
        log(state, `${source.title} — no run; no strength bonus.`);
        return { ok: true };
      }
      addIceStrengthBoostThisRun(state, {
        createdBy: sourceId,
        iceId: sourceId,
        amount: action.amount,
      });
      const eff = iceStrength(state, sourceId);
      log(
        state,
        `Fortify ${source.title} +${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }

    case "fortify_ice_spend_x_resolve": {
      const iceId = action.iceId;
      const x = action.amount;
      const ice = state.cards[iceId];
      if (!ice?.rezzed || state.corp.credits < x) return { ok: true };
      state.corp.credits -= x;
      addIceStrengthBoostThisTurn(state, {
        createdBy: sourceId,
        iceId,
        amount: x,
      });
      log(
        state,
        `Corporate Troubleshooter — spend ${x}¢, ${ice.title} +${x} strength this turn.`,
      );
      return { ok: true };
    }

    case "fortify_all_ice": {
      // "Each piece of ice gets +N strength for the remainder of this run"
      // (ezaM, Red Tape, Tributary): one run-duration lingering effect
      // that every piece of ice reads (CR 9.10.1, 9.10.4).
      if (!state.run) {
        log(state, `Fortify all ice — no run.`);
        return { ok: true };
      }
      addAllIceStrengthBoostThisRun(state, {
        createdBy: sourceId,
        amount: action.amount,
      });
      log(
        state,
        `Each piece of ice gets +${action.amount} strength for the remainder of this run.`,
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
      if (iceStrengthCannotBeLowered(state, iceId)) {
        log(
          state,
          `Weaken ${ice.title} prevented — strength cannot be lowered.`,
        );
        return { ok: true };
      }
      addIceStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        iceId,
        amount: -action.amount,
      });
      const eff = iceStrength(state, iceId);
      log(
        state,
        `Weaken ${ice.title} −${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}).`,
      );
      // Parasite's static condition is checked at the next checkpoint
      // (CR 9.6.7a).
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

    case "grant_chosen_ice_subtypes_until_end_of_turn": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        iceIds.push(...server.ice);
      }
      if (iceIds.length === 0) {
        log(state, `${source.title} — no ice to grant subtypes.`);
        return { ok: true };
      }
      const subtypes = action.subtypes ?? [];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => ({
          id: `tinker:${id}`,
          label: `Give ${openCardName(state, id, "runner")} ${subtypes.join(", ")} until end of turn`,
          effect: {
            op: "do" as const,
            action: {
              kind: "grant_ice_subtypes_until_end_of_turn" as const,
              cardId: id,
              subtypes,
            },
          },
        })),
        logLine: `${source.title} — choose ice to gain ${subtypes.join(", ")} until end of turn.`,
      });
      return { ok: true };
    }

    case "grant_ice_subtypes_until_end_of_turn": {
      const ice = state.cards[action.cardId];
      if (!ice) {
        log(state, `Grant subtypes — unknown ice ${action.cardId}.`);
        return { ok: true };
      }
      const subtypes = [...new Set(action.subtypes ?? [])];
      addLingeringEffect(state, {
        createdBy: sourceId,
        duration: { kind: "turn" },
        kind: LINGERING_KIND_GRANTED_SUBTYPES,
        payload: { cardId: ice.id, subtypes },
      });
      log(
        state,
        `${ice.title} gains ${subtypes.join(", ")} until end of turn (CR ${CR.lingeringEffect.number}).`,
      );
      return { ok: true };
    }

    case "grant_approached_rezzed_bioroid_etr_subroutine_this_run": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `${source.title} — no approached ice.`);
        return { ok: true };
      }
      const iceId = iceAtRunnerPosition(state);
      const ice = iceId ? state.cards[iceId] : undefined;
      if (!ice || !ice.rezzed || !(ice.subtypes ?? []).includes("bioroid")) {
        log(state, `${source.title} — approached ice is not a rezzed bioroid.`);
        return { ok: true };
      }
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const granted = {
        id: `${ice.defId}-wotan-etr-${iceId}`,
        text: "End the run.",
        effect: { op: "do" as const, action: { kind: "end_the_run" as const } },
      };
      ice.subroutines = [...(ice.subroutines ?? []), granted];
      if (!run.thunderboltGrantedIceIds) run.thunderboltGrantedIceIds = [];
      if (!run.thunderboltGrantedIceIds.includes(iceId!)) {
        run.thunderboltGrantedIceIds.push(iceId!);
      }
      if (run.encounter?.iceId === iceId) {
        run.encounter.broken.push(false);
      }
      log(
        state,
        `${source.title} — ${ice.title} gains an ETR subroutine for the remainder of this run.`,
      );
      return { ok: true };
    }

    case "grant_encounter_ice_subtype": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source.title} — grant subtype: no encounter.`);
        return { ok: true };
      }
      if (!enc.grantedSubtypes) enc.grantedSubtypes = [];
      if (!enc.grantedSubtypes.includes(action.subtype)) {
        enc.grantedSubtypes.push(action.subtype);
      }
      const ice = state.cards[enc.iceId];
      log(
        state,
        `${ice?.title ?? enc.iceId} gains ${action.subtype} this encounter.`,
      );
      return { ok: true };
    }

    case "blank_installed_resource_until_corp_turn_end": {
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `${source.title} — no installed resource to blank.`);
        return { ok: true };
      }
      if (resources.length === 1) {
        const id = resources[0]!;
        const card = state.cards[id]!;
        blankAbilitiesUntilCorpTurnEnd(state, {
          createdBy: sourceId,
          cardId: id,
        });
        log(
          state,
          `${card.title} — abilities blanked until Corp turn ends (CR ${CR.lingeringEffect.number}).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => ({
          id: `blank-res:${id}`,
          label: `Blank ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "blank_resource_until_corp_turn_end" as const,
              cardId: id,
            },
          },
        })),
        logLine: `${source.title} — choose installed resource to blank.`,
      });
      return { ok: true };
    }

    case "blank_resource_until_corp_turn_end": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        card.type !== "resource" ||
        !state.runner.installed.includes(action.cardId)
      ) {
        log(state, `Blank resource — not an installed resource.`);
        return { ok: true };
      }
      blankAbilitiesUntilCorpTurnEnd(state, {
        createdBy: sourceId,
        cardId: action.cardId,
      });
      log(
        state,
        `${card.title} — abilities blanked until Corp turn ends (CR ${CR.lingeringEffect.number}).`,
      );
      return { ok: true };
    }

    case "chum_register_next_ice": {
      if (!state.run) {
        log(state, `Chum — no run.`);
        return { ok: true };
      }
      state.run.chumNextIce = {
        strengthBonus: action.strengthBonus,
        netDamageIfNotFullyBroken: action.netDamageIfNotFullyBroken,
        chumSourceId: sourceId,
      };
      log(
        state,
        `${source.title} — next ice +${action.strengthBonus} strength; ${action.netDamageIfNotFullyBroken} net if not fully broken.`,
      );
      return { ok: true };
    }

    case "sensei_register_etr_on_other_ice_for_run": {
      if (!state.run) {
        log(state, `Sensei — no run.`);
        return { ok: true };
      }
      if (!state.run.senseiEtrSourceIds) state.run.senseiEtrSourceIds = [];
      if (!state.run.senseiEtrSourceIds.includes(sourceId)) {
        state.run.senseiEtrSourceIds.push(sourceId);
      }
      log(
        state,
        `${source.title} — other ice gains End the run after printed for remainder of run.`,
      );
      return { ok: true };
    }

    case "troubleshooter_fortify": {
      // Printed: X¢, trash — choose 1 rezzed ice protecting this server;
      // that ice gets +X strength for the remainder of the turn (CR 1.2.1).
      const maxX = state.corp.credits;
      if (maxX <= 0) {
        log(state, `Corporate Troubleshooter — no credits to spend.`);
        return { ok: true };
      }
      // The [trash] cost has already moved the card: "this server" is the
      // server it was in (CR 4.6.6i).
      const serverId = (source.thisServerWhileResolving ??
        serverHostingCard(state, sourceId)?.id) as ServerId | undefined;
      const server = serverId ? state.servers[serverId] : undefined;
      const iceTargets = (server?.ice ?? []).filter((id: string) => {
        const c = state.cards[id];
        return c?.type === "ice" && c.rezzed;
      });
      if (iceTargets.length === 0) {
        log(
          state,
          `Corporate Troubleshooter — no rezzed ice protecting this server.`,
        );
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const id of iceTargets) {
        for (let x = 1; x <= maxX; x++) {
          options.push({
            id: `ct:${id}:${x}`,
            label: `Spend ${x}¢: ${state.cards[id]!.title} +${x} strength this turn`,
            effect: fx.do({
              kind: "fortify_ice_spend_x_resolve",
              iceId: id,
              amount: x,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
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
    case "wendigo_ban_program": {
      const progs = runnerPrograms(state);
      if (progs.length === 0) {
        log(state, `Wendigo — no programs to ban.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `ban:${id}`,
          label: `Ban ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_wendigo_ban_program", programId: id }),
        })),
      });
      return { ok: true };
    }
    case "resolve_wendigo_ban_program": {
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
    case "forbid_runner_spend_credits_for_run": {
      if (state.run) state.run.runnerCannotSpendCreditsForRun = true;
      log(state, `RSVP — Runner cannot spend credits for remainder of run.`);
      return { ok: true };
    }

    case "choose_rezzed_ice_gain_subs_subtypes_for_run": {
      if (!state.run) return { ok: true };
      const self = state.cards[sourceId];
      if (!self) return { ok: true };
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId) continue;
          const ice = state.cards[id];
          if (ice?.rezzed) candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Loki — no other rezzed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `loki:${id}`,
          label: `Copy ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "gain_from_ice", iceId: id }),
        })),
      });
      return { ok: true };
    }

    case "gain_from_ice": {
      const iceId = (action as { iceId: string }).iceId;
      const self = state.cards[sourceId];
      const other = state.cards[iceId];
      if (!self || !other || !state.run) return { ok: true };
      if (!self.baseSubroutines) {
        self.baseSubroutines = structuredClone(self.subroutines ?? []);
      }
      if (!self.baseSubtypes) {
        self.baseSubtypes = [...(self.subtypes ?? [])];
      }
      const gainedSubs = structuredClone(other.subroutines ?? []).map(
        (sub, i) => ({
          ...sub,
          id: `loki-copy-${iceId}-${i}`,
        }),
      );
      const subtypeSet = new Set(
        [...(self.baseSubtypes ?? []), ...(other.subtypes ?? [])].map((s) =>
          s.toLowerCase(),
        ),
      );
      self.subtypes = [...subtypeSet];
      self.subroutines = [
        ...gainedSubs,
        ...structuredClone(self.baseSubroutines),
      ];
      if (state.run.encounter?.iceId === sourceId) {
        resetEncounterBreaks(
          state.run.encounter,
          (self.subroutines ?? []).length,
        );
      }
      log(
        state,
        `Loki — gains subtypes/subs of ${other.title} for remainder of run.`,
      );
      return { ok: true };
    }

    case "forbid_rez": {
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

    case "boost_icebreaker": {
      const breakers = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c && (c.subtypes ?? []).some((s) => s === "icebreaker");
      });
      if (breakers.length === 0) {
        log(state, `Dean Lister — no icebreakers.`);
        return { ok: true };
      }
      const bonus = state.runner.hand.length;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `boost:${id}`,
          label: `+${bonus} strength on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "boost_dean_lister_apply",
            cardId: id,
            amount: bonus,
          }),
        })),
      });
      return { ok: true };
    }

    case "boost_dean_lister_apply": {
      const cardId = action.cardId;
      const amount = action.amount ?? 0;
      if (!cardId || !state.run) return { ok: true };
      addBreakerStrengthBoostThisRun(state, {
        createdBy: sourceId,
        breakerId: cardId,
        amount,
      });
      log(
        state,
        `Dean Lister — ${state.cards[cardId]?.title} +${amount} strength this run.`,
      );
      return { ok: true };
    }

    case "forbid_access_and_breach_this_run": {
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

    case "forbid_installs_until_run_end": {
      if (!state.run) {
        log(state, `Signal Jamming — no active run.`);
        return { ok: true };
      }
      state.run.forbidInstallsUntilRunEnd = true;
      log(
        state,
        `Signal Jamming — cards cannot be installed until the run ends.`,
      );
      return { ok: true };
    }

    case "helheim_ice_protecting_this_server_strength_until_end_of_run": {
      if (!state.run) return { ok: true };
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId) || server.ice.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) return { ok: true };
      const amount = action.amount ?? 2;
      if (!state.run.helheimServerStrengthBonus) {
        state.run.helheimServerStrengthBonus = {};
      }
      state.run.helheimServerStrengthBonus[serverId] =
        (state.run.helheimServerStrengthBonus[serverId] ?? 0) + amount;
      log(
        state,
        `Helheim Servers — ice protecting ${serverId} has +${amount} strength until end of run.`,
      );
      return { ok: true };
    }

    case "pump_takobi_breaker": {
      const amount = action.amount ?? 3;
      const breakers = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return (
          c?.breaker && !(c.subtypes ?? []).includes("ai") && id !== sourceId
        );
      });
      // Also allow pumping other breakers; include self if non-AI (Takobi is not a breaker).
      if (breakers.length === 0) {
        log(state, `Takobi — no installed non-AI icebreaker.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `takobi:${id}`,
          label: `${state.cards[id]!.title} +${amount} strength`,
          effect: fx.do({
            kind: "pump_takobi_resolve",
            cardId: id,
            amount,
          }),
        })),
      });
      return { ok: true };
    }

    case "pump_takobi_resolve": {
      const card = state.cards[action.cardId];
      if (!card || !state.run) return { ok: true };
      const amount = action.amount ?? 3;
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: action.cardId,
        amount,
      });
      log(state, `Takobi — ${card.title} +${amount} strength this encounter.`);
      return { ok: true };
    }

    case "forbid_install_remainder_of_turn": {
      state.turn.dtwnRunnerCannotInstall = true;
      log(
        state,
        `Jua — Runner cannot install cards for the remainder of the turn.`,
      );
      return { ok: true };
    }

    case "arm_duplicate_subs_on_next_ice_encounter": {
      state.turn.dadDuplicateSubsOnNextIceEncounter = true;
      log(state, `TL;DR — next ice encounter this run duplicates subroutines.`);
      return { ok: true };
    }

    case "dad_media_blitz_copy": {
      const agenda = state.cards[action.cardId];
      if (!source || !agenda) return { ok: true };
      if (agenda.onScore) source.onScore = structuredClone(agenda.onScore);
      if (agenda.iceStrengthBonusForSubtype) {
        source.iceStrengthBonusForSubtype = {
          ...agenda.iceStrengthBonusForSubtype,
        };
      }
      if (agenda.subroutineTraceBaseStrengthBonus != null) {
        source.subroutineTraceBaseStrengthBonus =
          agenda.subroutineTraceBaseStrengthBonus;
      }
      if (agenda.assetsGainSubtype) {
        source.assetsGainSubtype = agenda.assetsGainSubtype;
      }
      log(state, `Media Blitz gains text of ${agenda.title}.`);
      return { ok: true };
    }

    case "blank_installed_abilities": {
      const cands = installedRunnerIds(state);
      if (cands.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `love:${id}`,
          label: `Blank ${state.cards[id]!.title} this turn`,
          effect: fx.do({ kind: "blank_card_this_turn", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "blank_card_this_turn": {
      state.turn.dadBlankedCardIds = state.turn.dadBlankedCardIds ?? [];
      state.turn.dadBlankedCardIds.push(action.cardId);
      log(
        state,
        `Dr. Lovegood — ${state.cards[action.cardId]?.title} blanked this turn.`,
      );
      return { ok: true };
    }

    case "boost_breakers_per_link": {
      // Security Chip: "Choose an icebreaker (or any number of cloud
      // icebreakers). Each chosen icebreaker has +1 strength for each [link]
      // you have for the remainder of this run." The boost is a lingering
      // effect that ends with the run (CR 9.10.1); its amount is the link
      // when it resolves.
      const link = state.runner.link ?? 0;
      // A facedown card has no characteristics, so it is no icebreaker
      // (CR 8.1.4a).
      const breakers = installedRunnerIds(state).filter((id) => {
        const c = state.cards[id];
        if (facedownInstalledRunnerCard(state, id)) return false;
        return (
          Boolean(c?.breaker) || (c?.subtypes ?? []).includes("icebreaker")
        );
      });
      const clouds = breakers.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("cloud"),
      );
      if (breakers.length === 0) {
        log(state, `Security Chip — no icebreaker installed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...(clouds.length > 1
            ? [
                {
                  id: "sc-clouds",
                  label: `Choose any number of cloud icebreakers: +${link} strength each`,
                  effect: chooseCards({
                    chooser: "runner",
                    candidates: clouds,
                    count: clouds.length,
                    upTo: true,
                    purpose: "resume",
                    label: "boost",
                    resume: {
                      kind: "boost_breakers",
                      cardIds: [],
                      amount: link,
                    },
                  }),
                },
              ]
            : []),
          ...breakers.map((id) => ({
            id: `sc:${id}`,
            label: `Boost ${state.cards[id]!.title} +${link}`,
            effect: fx.do({
              kind: "boost_breakers",
              cardIds: [id],
              amount: link,
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "boost_breakers": {
      for (const id of action.cardIds) {
        addLingeringEffect(state, {
          createdBy: sourceId,
          duration: { kind: "run" },
          kind: LINGERING_KIND_BREAKER_STRENGTH_RUN,
          payload: { breakerId: id, amount: action.amount },
        });
      }
      log(
        state,
        `Security Chip — ${action.cardIds.length} icebreaker(s) +${action.amount} strength for the remainder of this run.`,
      );
      return { ok: true };
    }

    case "spend_x_pump": {
      const credits = state.runner.credits;
      if (credits <= 0) {
        log(state, `Fawkes — no credits to spend.`);
        return { ok: true };
      }
      const maxX = Math.min(credits, 20);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `fawkes-x:${x}`,
          label: `Spend ${x}¢ (≥1 stealth): +${x} strength this run`,
          effect: fx.do({
            kind: "spend_x_pump_resolve",
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

    case "spend_x_pump_resolve": {
      const x = action.amount ?? 1;
      if (state.runner.credits < x) {
        log(state, `Fawkes — cannot afford ${x}¢.`);
        return { ok: true };
      }
      // Stealth spend is enforced by paid ability cost.minCreditsFromStealth when
      // the ability is paid normally; this leaf is also used from pendingChoice
      // after the ability opened — deduct from pool (stealth accounting approx).
      subtractRunnerCreditPool(state, x);
      if (!state.run) return { ok: true };
      addBreakerStrengthBoostThisRun(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: x,
      });
      log(state, `Fawkes — spend ${x}¢ → +${x} strength this run.`);
      return { ok: true };
    }

    case "sifr_zero_encounter_ice_strength": {
      // CR 9.12.1a set layer: strength is lowered to 0 for the encounter
      // (UFAQ: Wraparound stays 0 after a later fracter; cannot raise; Lotus
      // Field cannot be lowered).
      const enc = state.run?.encounter;
      const iceId = enc?.iceId;
      if (!iceId || !enc) {
        log(state, `Şifr — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[iceId]!;
      if (iceStrengthCannotBeLowered(state, iceId)) {
        log(state, `Şifr — ${ice.title} strength cannot be lowered.`);
        return { ok: true };
      }
      enc.strengthLoweredTo = 0;
      state.turn.sifrHandSizePenaltyActive = true;
      state.turn.sifrUsedThisTurn = true;
      recomputeRunnerMaxHandSize(state);
      log(
        state,
        `Şifr — −1 max hand size until next turn; ${ice.title} strength → 0 this encounter.`,
      );
      return { ok: true };
    }

    case "choose_subtype_for_encounter": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `Panchatantra — not encountering ice.`);
        return { ok: true };
      }
      const ice = state.cards[iceId];
      if (!ice) return { ok: true };
      const options = COMMON_ICE_SUBTYPES.filter(
        (s) => !FORBIDDEN_PANCHATANTRA.has(s),
      ).map((subtype) => ({
        id: `pancha:${subtype}`,
        label: `Gain ${subtype}`,
        effect: fx.do({
          kind: "panchatantra_apply_subtype",
          iceId,
          subtype,
        }) as Effect,
      }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({
          kind: "gain_credits",
          side: "runner",
          amount: 0,
        }) as Effect,
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Panchatantra — choose subtype for ${ice.title}.`,
      });
      return { ok: true };
    }

    case "panchatantra_apply_subtype": {
      const ice = state.cards[action.iceId];
      if (!ice) return { ok: true };
      const run = state.run;
      if (!run) return { ok: true };
      run.kgEncounterBonusSubtypes = run.kgEncounterBonusSubtypes ?? {};
      const list = run.kgEncounterBonusSubtypes[action.iceId] ?? [];
      if (!list.includes(action.subtype)) list.push(action.subtype);
      run.kgEncounterBonusSubtypes[action.iceId] = list;
      if (!(ice.subtypes ?? []).includes(action.subtype)) {
        ice.subtypes = [...(ice.subtypes ?? []), action.subtype];
      }
      log(
        state,
        `Panchatantra — ${ice.title} gains ${action.subtype} this run.`,
      );
      return { ok: true };
    }

    case "cannot_use_programs_this_run_kg": {
      // Read by runnerCannotUseProgram (paid abilities and breaks); it ends
      // with the run (CR 9.10.1).
      if (state.run) {
        state.run.kgCannotUsePrograms = true;
      }
      log(
        state,
        `${source?.title ?? "Vikram"} — Runner cannot use programs this run.`,
      );
      return { ok: true };
    }

    case "grant_kusanagi_net_subroutine_this_run": {
      if (!state.run) {
        log(state, `Project Kusanagi — no active run.`);
        return { ok: true };
      }
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Project Kusanagi — no ice installed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `kusanagi:${id}`,
          label: `Grant net sub to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "grant_kusanagi_net_subroutine_resolve",
            iceId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "grant_kusanagi_net_subroutine_resolve": {
      const iceId = action.iceId;
      if (!iceId || !state.run) return { ok: true };
      const ice = state.cards[iceId];
      if (!ice) return { ok: true };
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const granted = {
        id: `${ice.defId ?? ice.id}-kusanagi-net-${iceId}-${(ice.subroutines ?? []).length}`,
        text: "Do 1 net damage.",
        effect: {
          op: "do" as const,
          action: { kind: "net_damage" as const, amount: 1 },
        },
      };
      ice.subroutines = [...(ice.subroutines ?? []), granted];
      if (!state.run.thunderboltGrantedIceIds) {
        state.run.thunderboltGrantedIceIds = [];
      }
      if (!state.run.thunderboltGrantedIceIds.includes(iceId)) {
        state.run.thunderboltGrantedIceIds.push(iceId);
      }
      if (state.run.encounter?.iceId === iceId) {
        state.run.encounter.broken.push(false);
      }
      log(
        state,
        `Project Kusanagi — ${ice.title} gains "[subroutine] Do 1 net damage" this run.`,
      );
      return { ok: true };
    }

    case "choose_malia_resource": {
      // A new rez makes a new choice; an earlier one is forgotten.
      if (source) delete source.tdatdMaliaBlankTargetId;
      const targets = installedNonVirtualResourceIds(state);
      if (targets.length === 0) {
        log(state, `Malia Z0L0K4 — no installed non-virtual resource.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `malia:${id}`,
          label: `Blank ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "blank_malia", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "blank_malia": {
      const cardId = (action as { cardId: string }).cardId;
      const target = state.cards[cardId];
      if (!target) return { ok: true };
      if (source) source.tdatdMaliaBlankTargetId = cardId;
      log(state, `Malia Z0L0K4 — ${target.title} loses printed abilities.`);
      return { ok: true };
    }

    case "corp_cannot_advance_cards_next_turn": {
      state.corpCannotAdvanceCardsNextTurn = true;
      log(
        state,
        `${source?.title ?? "The Price of Freedom"} — Corp cannot advance cards during their next turn.`,
      );
      return { ok: true };
    }

    case "cannot_steal_copies_of_revealed_agenda": {
      if (!source) return { ok: true };
      const power = source.powerCounters ?? 0;
      const agendas = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "agenda" &&
          typeof c.agendaPoints === "number" &&
          c.agendaPoints > 0 &&
          c.agendaPoints <= power
        );
      });
      if (agendas.length === 0) {
        log(state, `Lakshmi Smartfabrics — no eligible agenda in HQ.`);
        return { ok: true };
      }
      if (agendas.length === 1) {
        const id = agendas[0]!;
        const card = state.cards[id]!;
        const x = card.agendaPoints ?? 0;
        source.powerCounters = power - x;
        const defId = card.defId ?? id;
        state.turn.bfCannotStealAgendaDefIds = [
          ...(state.turn.bfCannotStealAgendaDefIds ?? []),
          defId,
        ];
        revealCards(state, [card.id], sourceId);
        log(
          state,
          `Lakshmi Smartfabrics — reveal ${card.title} (${x}); Runner cannot steal copies this turn.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => {
          const card = state.cards[id]!;
          const x = card.agendaPoints ?? 0;
          return {
            id: `lakshmi:${id}`,
            label: `Reveal ${card.title} (${x} pts)`,
            effect: fx.do({
              kind: "reveal_lakshmi_agenda_resolve",
              cardId: id,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "valley_grid_hand_size_penalty_until_next_corp_turn": {
      state.runner.handSizePenaltyUntilCorpTurn =
        (state.runner.handSizePenaltyUntilCorpTurn ?? 0) + 1;
      recomputeRunnerMaxHandSize(state);
      log(
        state,
        `Valley Grid — Runner max hand size −1 until beginning of Corp's next turn (penalty=${state.runner.handSizePenaltyUntilCorpTurn}).`,
      );
      return { ok: true };
    }
    case "add_net_subs_for_rezzed_ice": {
      const sid = state.run?.attackedServerId;
      if (!sid) return { ok: true };
      // Printed: X is the number of cards in the Runner's grip.
      const n = state.runner.hand.length;
      const ice = state.cards[sourceId]!;
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
      }
      // "It gains X subroutines for the remainder of this run": each
      // encounter adds X more, and the run's end removes them (CR 9.10.1).
      const run = state.run!;
      const restored = (run.thunderboltGrantedIceIds ??= []);
      if (!restored.includes(sourceId)) restored.push(sourceId);
      const have = (ice.subroutines ?? []).length;
      const extras = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-komainu-${have + i}`,
        text: "Do 1 net damage.",
        effect: fx.do({ kind: "net_damage", amount: 1 }),
      }));
      ice.subroutines = [...(ice.subroutines ?? []), ...extras];
      if (run.encounter?.iceId === sourceId) {
        resetEncounterBreaks(run.encounter, ice.subroutines.length);
      }
      log(state, `Komainu — gains ${n} net damage subroutine(s).`);
      return { ok: true };
    }
    case "forbid_jack_out_until_next_encounter": {
      if (!state.run) return { ok: true };
      state.run.cannotJackOut = true;
      state.run.clearCannotJackOutOnNextEncounterBegin = true;
      log(
        state,
        `${state.cards[sourceId]?.title ?? sourceId} — the Runner cannot jack out this run until after they encounter a piece of ice.`,
      );
      return { ok: true };
    }

    case "net_ready_eyes_choose_icebreaker_strength": {
      const amount = action.amount;
      const breakers = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c?.breaker || (c?.subtypes ?? []).includes("icebreaker");
      });
      if (breakers.length === 0) {
        log(state, `Net-Ready Eyes — no installed icebreaker.`);
        return { ok: true };
      }
      if (breakers.length === 1) {
        const id = breakers[0]!;
        if (state.run) {
          addBreakerStrengthBoostThisRun(state, {
            createdBy: sourceId,
            breakerId: id,
            amount,
          });
        }
        log(
          state,
          `Net-Ready Eyes — ${state.cards[id]!.title} +${amount} strength this run.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `nre:${id}`,
          label: `${state.cards[id]!.title} +${amount} strength`,
          effect: {
            op: "do" as const,
            action: {
              kind: "net_ready_eyes_apply_strength" as const,
              cardId: id,
              amount,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "net_ready_eyes_apply_strength": {
      if (!state.run) {
        return {
          ok: false,
          error: "Net-Ready Eyes — no active run.",
          cites: [],
        };
      }
      const id = action.cardId;
      addBreakerStrengthBoostThisRun(state, {
        createdBy: sourceId,
        breakerId: id,
        amount: action.amount,
      });
      log(
        state,
        `Net-Ready Eyes — ${state.cards[id]?.title ?? id} +${action.amount} strength this run.`,
      );
      return { ok: true };
    }

    case "runner_cannot_draw_remainder_of_turn": {
      state.turn.ccRunnerCannotDraw = true;
      log(
        state,
        `Lockdown — Runner cannot draw for the remainder of this turn.`,
      );
      return { ok: true };
    }
    case "choose_ice_gain_subtype": {
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          const ice = state.cards[iceId];
          if (ice?.rezzed) cands.push(iceId);
        }
      }
      if (cands.length === 0) {
        log(state, `Paintbrush — no rezzed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `paintbrush:${id}`,
          label: `Paint ${state.cards[id]!.title} (gain subtype until end of next run)`,
          effect: fx.do({
            kind: "paintbrush_apply_subtype",
            iceId: id,
          }),
        })),
        logLine: `Paintbrush — choose rezzed ice to paint.`,
      });
      return { ok: true };
    }
    case "paintbrush_apply_subtype": {
      const ice = state.cards[action.iceId];
      if (!ice) return { ok: true };
      if (!action.subtype) {
        // "That ice gains sentry, code gate or barrier": the Runner chooses
        // which (CR 1.15.2).
        const subtypes = ["sentry", "code gate", "barrier"] as const;
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: subtypes.map((subtype) => ({
            id: `paintbrush-subtype:${subtype}`,
            label: `${ice.title} gains ${subtype}`,
            effect: fx.do({
              kind: "paintbrush_apply_subtype",
              iceId: action.iceId,
              subtype,
            }),
          })),
          logLine: `Paintbrush — choose the subtype ${ice.title} gains.`,
        });
        return { ok: true };
      }
      // A lingering effect, not a run: it lasts until the end of the next
      // run this turn (CR 9.10.1).
      addLingeringEffect(state, {
        createdBy: sourceId,
        duration: { kind: "next_run_this_turn" },
        kind: LINGERING_KIND_GRANTED_SUBTYPES,
        payload: { cardId: ice.id, subtypes: [action.subtype] },
      });
      log(
        state,
        `Paintbrush — ${ice.title} gains ${action.subtype} until the end of the next run this turn (CR ${CR.lingeringEffect.number}).`,
      );
      return { ok: true };
    }
    case "gyri_labyrinth_reduce_max_hand": {
      // Each resolution lowers it by 2 more, and all of it ends when the
      // Corp's next turn begins (CR 9.10.1).
      state.runner.handSizePenaltyUntilCorpTurn =
        (state.runner.handSizePenaltyUntilCorpTurn ?? 0) + 2;
      recomputeRunnerMaxHandSize(state);
      log(
        state,
        `Gyri Labyrinth — Runner max hand size −2 until Corp next turn (${state.runner.maxHandSize}).`,
      );
      return { ok: true };
    }
    case "add_etr_to_next_ice": {
      if (!state.run) {
        log(state, `Marker — no active run.`);
        return { ok: true };
      }
      state.run.markerExtraEtrNextIce = true;
      log(
        state,
        `Marker — next ice encountered gains ETR after its subroutines.`,
      );
      return { ok: true };
    }
    case "runner_mu_modifier_until_turn_end": {
      const delta = (action as { delta: number }).delta;
      addLingeringEffect(state, {
        createdBy: sourceId,
        // "until the end of the turn": the turn in progress, whoever's it is
        // (Bad Times is played on the Corp's turn; CR 1.2.1, 9.10.1).
        duration: { kind: "turn" },
        kind: LINGERING_KIND_RUNNER_MU,
        payload: { delta },
      });
      log(
        state,
        `Runner memory limit ${delta >= 0 ? "+" : ""}${delta} until turn end (CR ${CR.lingeringEffect.number}).`,
      );
      occurCheckpoint(
        state,
        "instruction",
        "Memory limit changed",
        [CR.checkpointCardRestrictions],
        sourceId,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyContinuousKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "cannot_arm_rez_outermost_ice_this_turn": {
      state.turn.uotCannotRezOutermostIce = true;
      log(
        state,
        `${source.title} — Corp cannot rez outermost ice during a run this turn.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

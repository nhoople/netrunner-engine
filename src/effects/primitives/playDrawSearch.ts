/** Data and Destiny (dad) deluxe primitives — v1.115.0. */
import { whenScoredEffect } from "../../state/turnAndActions/whenScored.js";
import {
  markSubroutineBroken,
  subroutineBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { startTrace } from "../../state/turnAndActions/trace.js";
import { applyEncounterPrimitive } from "../encounterPrimitives.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { placeCurrentAfterPlay } from "../../state/continuous/currents.js";
import { markAbilityUsed } from "../../state/turnAndActions/turn.js";
import { CR } from "../../timing/labels.js";
import { playEffectFromCard } from "../abilityRecord.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { installedRunnerIds } from "../visibility/visibilityKinds.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyDadPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "play_current_from_hq_or_archives": {
      const cands = [
        ...new Set([...state.corp.hand, ...state.corp.discardPile]),
      ].filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" && (c.subtypes ?? []).includes("current")
        );
      });
      if (cands.length === 0) {
        log(state, `${source?.title ?? "Sol"} — no current to play.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => {
          const card = state.cards[id]!;
          const play: Effect[] = [
            fx.do({ kind: "play_current_card", cardId: id }),
          ];
          const playFx = playEffectFromCard(card);
          if (playFx) play.push(playFx);
          return {
            id: `play-current:${id}`,
            label: `Play ${card.title}`,
            effect: play.length === 1 ? play[0]! : fx.seq(...play),
          };
        }),
      });
      return { ok: true };
    }

    case "play_current_card": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        log(state, `Cannot afford ${card.title} (${cost}¢).`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      removeCardFromCurrentZone(state, action.cardId);
      placeCurrentAfterPlay(state, action.cardId, "corp");
      log(state, `Play current ${card.title} for ${cost}¢.`);
      return { ok: true };
    }

    case "gain_reality_threedee_credits": {
      const tagged = (state.runner.tags ?? 0) > 0;
      const amount = tagged ? 2 : 1;
      state.corp.credits += amount;
      log(
        state,
        `Reality Threedee — gain ${amount}¢ (${tagged ? "tagged" : "untagged"}).`,
      );
      return { ok: true };
    }

    case "resolve_when_scored_on_scored_agenda": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const id of state.corp.scoreArea) {
        const card = state.cards[id];
        if (!card) continue;
        if (
          card.onScoreIfRunnerTaggedPlaceAgendaCounter &&
          (state.runner.tags ?? 0) <= 0
        ) {
          log(
            state,
            `${card.title}'s when-scored ability cannot resolve; Runner is not tagged (CR ${CR.whenScoredAdditionalRequirement.number}).`,
          );
          continue;
        }
        if (whenScoredEffect(card)) {
          // The ability resolves as the agenda's own, so "it" is the agenda
          // (Market Research's counter), not 24/7 News Cycle (CR 9.6.14d).
          options.push({
            id: `247:${id}`,
            label: `Resolve when-scored on ${card.title}`,
            effect: fx.do({
              kind: "score_bifrost_fire_scored_agenda_on",
              cardId: id,
            }),
          });
        }
      }
      if (options.length === 0) {
        log(state, `24/7 News Cycle — no when-scored ability can resolve.`);
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "gain_text_of_runner_scored_agenda": {
      const agendas = state.runner.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Media Blitz — no agenda in Runner score.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `mb:${id}`,
          label: `Copy text of ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "dad_media_blitz_copy", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "remove_bad_publicity_instead": {
      state.corp.badPublicity = Math.max(
        0,
        (state.corp.badPublicity ?? 0) - action.amount,
      );
      log(state, `Remove ${action.amount} bad publicity.`);
      return { ok: true };
    }

    case "break_etr_subroutine_trash_installed": {
      const cands = installedRunnerIds(state).filter((id) => id !== sourceId);
      if (cands.length === 0) {
        log(state, `Endless Hunger — nothing to trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `eh:${id}`,
          label: `Trash ${state.cards[id]!.title}: break ETR`,
          effect: fx.seq(
            fx.do({ kind: "trash_own_installed", cardId: id }),
            fx.do({ kind: "break_encounter_etr_subroutine" }),
          ),
        })),
      });
      return { ok: true };
    }

    case "break_encounter_etr_subroutine": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : undefined;
      if (!enc || !ice?.subroutines) return { ok: true };
      const idx = ice.subroutines.findIndex((s, i) => {
        if (subroutineBreakBlock(state, sourceId, i)) return false;
        const text = (s.text ?? "").toLowerCase();
        return text.includes("end the run");
      });
      if (idx >= 0) {
        markSubroutineBroken(state, sourceId, idx);
        log(state, `Break ETR subroutine on ${ice.title}.`);
      }
      return { ok: true };
    }

    case "break_any_subroutine": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : undefined;
      if (!enc || !ice?.subroutines) return { ok: true };
      const unbroken = ice.subroutines
        .map((s, i) => ({ s, i }))
        .filter(({ i }) => !subroutineBreakBlock(state, sourceId, i));
      if (unbroken.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: unbroken.map(({ s, i }) => ({
          id: `abr-break:${i}`,
          label: `Break: ${s.text ?? `subroutine ${i + 1}`}`,
          effect: fx.do({
            kind: "break_sub_index",
            iceId: enc.iceId,
            index: i,
          }),
        })),
      });
      return { ok: true };
    }

    case "break_sub_index": {
      const enc = state.run?.encounter;
      if (
        enc &&
        enc.iceId === action.iceId &&
        enc.broken[action.index] !== undefined
      ) {
        const blocked = subroutineBreakBlock(state, sourceId, action.index);
        if (blocked) {
          log(state, `Cannot break that subroutine: ${blocked.error}`);
          return { ok: true };
        }
        markSubroutineBroken(state, sourceId, action.index);
        log(state, `Break subroutine on ${state.cards[action.iceId]?.title}.`);
      }
      return { ok: true };
    }

    case "trace_bypass_or_tag_etr": {
      // Security Nexus: the Runner chose to use the ability (CR 9.1.6b,
      // 9.3.6g). The trace is a full attempt: the Corp spends, then the
      // Runner (CR 10.8.6c–d). The encounter's pending abilities wait for it.
      markAbilityUsed(state, sourceId, "security-nexus-trace");
      startTrace(
        state,
        sourceId,
        5,
        fx.seq(
          fx.do({ kind: "give_tags", amount: 1 }),
          fx.do({ kind: "end_the_run" }),
        ),
        fx.do({ kind: "bypass_encountered_ice" }),
      );
      return { ok: true };
    }

    case "bypass_encountered_ice": {
      // Security Nexus: bypass aborts the encounter (CR 6.5.8a). Nothing to
      // bypass if the encounter already ended during the trace.
      if (!state.run?.encounter) return { ok: true };
      return (
        applyEncounterPrimitive(ctx, { kind: "bypass_current_ice" }) ?? {
          ok: true,
        }
      );
    }

    case "jak_sinclair_run_without_programs": {
      state.turn.dadCannotUseProgramsThisRun = true;
      // Flag only — run is initiated via standard action UI after choice;
      // arm a marker that first run this window forbids programs.
      log(state, `Jak Sinclair — next run cannot use programs.`);
      return { ok: true };
    }

    default:
      return null;
  }
}

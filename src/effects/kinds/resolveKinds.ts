/**
 * Primitive kinds whose procedure is resolve.
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
import { subtractRunnerCreditPool } from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import {
  removeCardFromCurrentZone,
  stealAgenda,
} from "../../state/scoring.js";
import { noteCorpCardAddedToArchives } from "../../state/trashHooks.js";
import {
  memoryLimit,
  usedMemory,
  effectiveMemoryCost,
} from "../../state/turn.js";
import { enterSetAside } from "../../state/zones.js";
import { resolveBreachReplacement } from "../../timing/breachReplacement.js";
import { CR } from "../../timing/labels.js";
import {
  deferContinuationBefore,
  effectResolutionBlocked,
} from "../continuation.js";
import { drawCards } from "../draw.js";
import {
  offerBurnerMoves,
  grantAbilityCredits,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import { fx } from "../ir.js";
import {
  canInstallSetAsideProgram,
  shuffleRunnerSetAsideIntoStack,
  shuffleRunnerStack,
  stackCardInstallCost,
} from "../runnerInstall.js";

import {
  fireHostRezStateTriggers,
} from "../eval.js";

export function applyResolveKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "resolve_gachapon": {
      const look = 6;
      const discount = 2;
      const aside: string[] = [];
      for (let i = 0; i < look && state.runner.deck.length > 0; i++) {
        aside.push(state.runner.deck.shift()!);
      }
      enterSetAside(state, aside, {
        side: "runner",
        faceup: true,
        replace: true,
      });
      log(
        state,
        `${source.title} — set aside top ${aside.length} card(s) of stack faceup.`,
      );
      const installable = aside.filter((id) => {
        const c = state.cards[id]!;
        if (c.type === "program") {
          const need = effectiveMemoryCost(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
          return state.runner.credits >= Math.max(0, (c.installCost ?? 0) - discount);
        }
        return (
          c.type === "resource" &&
          (c.subtypes ?? []).includes("virtual") &&
          state.runner.credits >= Math.max(0, (c.installCost ?? 0) - discount)
        );
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "gacha-decline",
            label: "Decline install",
            effect: {
              op: "do" as const,
              action: { kind: "install_gachapon_after_choice" as const },
            },
          },
          ...installable.map((id) => {
            const c = state.cards[id]!;
            const cost = Math.max(0, (c.installCost ?? 0) - discount);
            return {
              id: `gacha-install:${id}`,
              label: `Install ${c.title} for ${cost}¢`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "install_set_aside" as const,
                      cardId: id,
                      discount,
                    },
                  },
                  {
                    op: "do" as const,
                    action: { kind: "install_gachapon_after_choice" as const },
                  },
                ],
              },
            };
          }),
        ],
logLine: `${source.title} — may install 1 program or virtual (−${discount}¢).`,
});
      return { ok: true };
    }

case "resolve_moon_pool": {
      // RFG self (typically after trashSelf cost left it in Archives).
      removeCardFromCurrentZone(state, sourceId);
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      log(
        state,
        `${source.title} is removed from the game (Moon Pool).`,
      );

      const trashN = Math.min(
        Math.max(0, action.trashHqMax),
        state.corp.hand.length,
      );
      for (let i = 0; i < trashN; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.discardPile.push(id);
        state.cards[id].zone = "corp:archives";
        state.cards[id].faceup = true;
        noteCorpCardAddedToArchives(state);
        log(
          state,
          `${source.title} — trash ${state.cards[id].title} from HQ.`,
        );
      }

      const facedown = state.corp.discardPile.filter(
        (id) => !state.cards[id].faceup,
      );
      const revealN = Math.min(
        Math.max(0, action.revealArchivesMax),
        facedown.length,
      );
      const revealed: string[] = [];
      for (let i = 0; i < revealN; i++) {
        const id = facedown[i]!;
        revealed.push(id);
        state.cards[id].faceup = true;
        state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false; // facedown once shuffled into R&D
        log(
          state,
          `${source.title} — reveal ${state.cards[id].title} from Archives → R&D.`,
        );
      }
      if (revealN > 0) {
        state.corp.deck.reverse();
      }

      const agendaRevealed = revealed.filter(
        (id) => state.cards[id].type === "agenda",
      );
      for (const _agendaId of agendaRevealed) {
        let target: string | null = null;
        for (const server of Object.values(state.servers)) {
          for (const id of [...server.root, ...server.ice]) {
            const c = state.cards[id];
            if (c.type === "agenda" || c.canAdvance) {
              target = id;
              break;
            }
          }
          if (target) break;
        }
        if (!target) {
          log(
            state,
            `${source.title} — agenda revealed; no advanceable card for advancement counter.`,
          );
          continue;
        }
        const card = state.cards[target]!;
        card.advancementCounters = (card.advancementCounters ?? 0) + 1;
        log(
          state,
          `${source.title} — place 1 advancement on ${card.title} → ${card.advancementCounters}.`,
        );
      }
      return { ok: true };
    }

case "resolve_simulation_reset": {
      const trashN = Math.min(
        Math.max(0, action.trashHqMax),
        state.corp.hand.length,
      );
      for (let i = 0; i < trashN; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.discardPile.push(id);
        state.cards[id].zone = "corp:archives";
        state.cards[id].faceup = true;
        noteCorpCardAddedToArchives(state);
        log(
          state,
          `${source.title} — trash ${state.cards[id].title} from HQ.`,
        );
      }
      const shuffleN = Math.min(trashN, state.corp.discardPile.length);
      for (let i = 0; i < shuffleN; i++) {
        const id = state.corp.discardPile.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      if (shuffleN > 0) {
        // Deterministic "shuffle": reverse then leave (v0; same as moon pool).
        state.corp.deck.reverse();
        log(
          state,
          `${source.title} — shuffle ${shuffleN} from Archives into R&D.`,
        );
      }
      if (trashN > 0) {
        const drawn = drawCards(state, "corp", trashN);
        log(
          state,
          `${source.title} — Corp draws ${drawn} (requested ${trashN}).`,
        );
      }
      removeCardFromCurrentZone(state, sourceId);
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      log(state, `${source.title} is removed from the game.`);
      return { ok: true };
    }

case "resolve_deep_dive": {
      const setAsideN = Math.max(0, action.setAside ?? 8);
      const initial = Math.max(1, action.initialAccess ?? 1);
      const aside: string[] = [];
      for (let i = 0; i < setAsideN && state.corp.deck.length > 0; i++) {
        aside.push(state.corp.deck.shift()!);
      }
      enterSetAside(state, aside, {
        side: "corp",
        faceup: true,
        bag: "corpSetAside",
        replace: true,
      });
      log(
        state,
        `${source.title} — set aside top ${aside.length} of R&D faceup.`,
      );
      // Access 1, then may spend clicks for more (auto: spend available clicks).
      let accesses = Math.min(initial, aside.length);
      const extraClicks = Math.max(0, state.runner.clicks);
      const more = Math.min(extraClicks, Math.max(0, aside.length - accesses));
      if (more > 0) {
        state.runner.clicks -= more;
        accesses += more;
        log(
          state,
          `${source.title} — spend ${more} [click] for ${more} additional access(es).`,
        );
      }
      const accessed = aside.slice(0, accesses);
      const remainder = aside.slice(accesses);
      for (const id of accessed) {
        const card = state.cards[id]!;
        log(state, `${source.title} — access ${card.title} from set-aside.`);
        if (card.type === "agenda") {
          stealAgenda(state, id);
        }
      }
      // Shuffle remainder + any still in corpSetAside back into R&D.
      const back = [
        ...remainder,
        ...(state.corp.corpSetAside ?? []).filter(
          (id) => !accessed.includes(id) && !remainder.includes(id),
        ),
      ];
      // Also remove stolen agendas from set-aside tracking.
      const toShuffle = back.filter(
        (id) => state.cards[id]?.zone === "corp:set-aside",
      );
      for (const id of toShuffle) {
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      state.corp.corpSetAside = [];
      log(
        state,
        `${source.title} — shuffle ${toShuffle.length} set-aside card(s) into R&D.`,
      );
      return { ok: true };
    }

case "resolve_realloc": {
      const [iceId, ...rest] = action.iceIds;
      if (!iceId) return { ok: true };
      const ice = state.cards[iceId];
      if (ice) {
        const gain = ice.rezCost ?? ice.installCost ?? 0;
        const gained = grantAbilityCredits(ctx, "corp", gain);
        if (!gained.ok) return gained;
        if (ice.rezzed) {
          ice.rezzed = false;
          ice.faceup = false;
          fireHostRezStateTriggers(state, iceId, "derez");
        }
        log(
          state,
          `realloc() — gain ${gain}¢ from ${ice.title}, then derez.`,
        );
      }
      if (rest.length === 0) return { ok: true };
      const next = {
        op: "do" as const,
        action: {
          kind: "resolve_realloc" as const,
          iceIds: rest,
        },
      };
      if (effectResolutionBlocked(state)) {
        deferContinuationBefore(state, { sourceId, effects: [next] });
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "resolve_realloc", iceIds: rest });
    }

case "resolve_breach_replacement": {
      resolveBreachReplacement(state, action.mode);
      if (
        action.mode === "account_siphon" &&
        state.run?.onSuccessfulRunEffect &&
        state.run.runSourceId
      ) {
        return evalEffect(
          { state, sourceId: state.run.runSourceId },
          state.run.onSuccessfulRunEffect,
        );
      }
      return { ok: true };
    }

case "resolve_account_siphon": {
      if (state.run) state.run.skipBreach = true;
      const lose = Math.min(action.loseAmount, state.corp.credits);
      state.corp.credits -= lose;
      const gain = lose * 2;
      state.runner.credits += gain;
      log(
        state,
        `Account Siphon — Corp loses ${lose}¢; Runner gains ${gain}¢.`,
      );
      return applyPrimitive(ctx, { kind: "give_tags", amount: 2 });
    }

case "resolve_vamp": {
      if (state.run) state.run.skipBreach = true;
      const spend = Math.min(action.spendAmount, state.runner.credits);
      subtractRunnerCreditPool(state, spend);
      const lose = Math.min(spend, state.corp.credits);
      state.corp.credits -= lose;
      log(
        state,
        `Vamp — Runner spends ${spend}¢; Corp loses ${lose}¢.`,
      );
      if (spend > 0) {
        return applyPrimitive(ctx, { kind: "give_tags", amount: 1 });
      }
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

case "may_resolve_subroutine_on_rezzed_ice": {
      const subtype =
        typeof action.subtype === "string" ? action.subtype.toLowerCase() : "";
      const mandatory = subtype.length === 0;
      const isResolveOther = (effect: Effect | undefined): boolean =>
        effect?.op === "do" &&
        effect.action.kind === "may_resolve_subroutine_on_rezzed_ice";
      const picks: Array<{ iceId: string; subIndex: number }> = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId && (mandatory || action.excludeSelf)) continue;
          const ice = state.cards[id];
          if (!ice?.rezzed) continue;
          if (
            subtype &&
            !(ice.subtypes ?? []).some((s) => s.toLowerCase() === subtype)
          ) {
            continue;
          }
          const subs = ice.subroutines ?? [];
          for (let i = 0; i < subs.length; i++) {
            picks.push({ iceId: id, subIndex: i });
          }
        }
      }
      if (picks.length === 0) {
        log(
          state,
          subtype
            ? `Resolve ${subtype} sub — no rezzed ${subtype} ice with subroutines.`
            : `${source.title} — no other rezzed ice with a subroutine.`,
        );
        return { ok: true };
      }
      const closedLoop =
        mandatory &&
        picks.every((pick) => {
          const ice = state.cards[pick.iceId];
          const subs = ice?.subroutines ?? [];
          return (
            subs.length > 0 &&
            subs.every((sub) => isResolveOther(sub.effect))
          );
        });
      if (closedLoop) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          loopCount: true,
          options: [
            {
              id: "loop-times:0",
              label: "Choose how many times the loop resolves",
              effect: fx.gainCredits("corp", 0),
            },
          ],
logLine: `${source.title} — mandatory loop; choose how many times it resolves (CR ${CR.mandatoryLoop.number}).`,
});
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = picks.map((p) => {
        const ice = state.cards[p.iceId]!;
        const sub = ice.subroutines![p.subIndex]!;
        return {
          id: `sub:${p.iceId}:${p.subIndex}`,
          label: `Resolve "${sub.text}" on ${ice.title}`,
          effect: sub.effect,
        };
      });
      if (!mandatory) {
        options.push({
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
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: mandatory
          ? `${source.title} — resolve a subroutine on another rezzed ice.`
          : `${source.title} — may resolve a subroutine on rezzed ${subtype} ice.`,
});
      return { ok: true };
    }

case "resolve_spark_of_inspiration": {
      const discount = Math.max(0, action.discount ?? 10);
      const aside: string[] = [];
      let programId: string | null = null;
      while (state.runner.deck.length > 0) {
        const id = state.runner.deck.shift()!;
        aside.push(id);
        if (state.cards[id]!.type === "program") {
          programId = id;
          break;
        }
      }
      enterSetAside(state, aside, {
        side: "runner",
        faceup: true,
        replace: true,
      });
      log(
        state,
        `${source.title} — set aside ${aside.length} card(s) from stack faceup.`,
      );
      if (!programId) {
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const prog = state.cards[programId]!;
      if (!canInstallSetAsideProgram(state, programId, discount)) {
        log(
          state,
          `${source.title} — cannot install ${prog.title}; shuffle set-aside.`,
        );
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const cost = stackCardInstallCost(state, prog, discount);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "install",
            label: `Install ${prog.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_set_aside_program" as const,
                cardId: programId,
                discount,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "shuffle_runner_set_aside_into_stack" as const },
            },
          },
        ],
logLine: `${source.title} — may install ${prog.title} (${discount}¢ discount).`,
});
      return { ok: true };
    }

case "resolve_fully_operational": {
      let remotes = 0;
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        if (server.root.length > 0 && server.ice.length > 0) remotes += 1;
      }
      const remaining = 1 + remotes;
      log(
        state,
        `${source.title} — resolve ${remaining} time(s) (1 + ${remotes} iced rooted remote(s)).`,
      );
      return applyPrimitive(ctx, {
        kind: "fully_operational_step",
        remaining,
      });
    }

case "resolve_meeting_of_minds": {
      const subtype = action.subtype.toLowerCase();
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "resource" &&
          (c.subtypes ?? []).some((s) => s.toLowerCase() === subtype)
        );
      });
      const afterRevealGain = (): EvalResult => {
        const inGrip = state.runner.hand.filter((id) =>
          (state.cards[id]?.subtypes ?? []).some(
            (s) => s.toLowerCase() === subtype,
          ),
        );
        if (inGrip.length === 0) {
          log(
            state,
            `Meeting of Minds — no ${subtype} cards in grip to reveal.`,
          );
          return { ok: true };
        }
        // Reveal any number: offer each subset via sequential yes/no, or
        // gain 1¢ per matching grip card (deterministic full reveal).
        const gained = inGrip.length;
        state.runner.credits += gained;
        for (const id of inGrip) {
          state.cards[id]!.faceup = true;
        }
        log(
          state,
          `Meeting of Minds — reveal ${gained} ${subtype} card(s) in grip, gain ${gained}¢.`,
        );
        return { ok: true };
      };
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `Meeting of Minds — no ${subtype} resource in stack.`,
        );
        return afterRevealGain();
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-search",
            label: "Decline to search",
            effect: {
              op: "do",
              action: {
                kind: "reveal_gain",
                subtype: action.subtype,
              },
            },
          },
          ...matches.map((id) => ({
            id: `mom-fetch:${id}`,
            label: `Reveal ${state.cards[id]!.title} and add to grip`,
            effect: {
              op: "do" as const,
              action: {
                kind: "meeting_of_minds_fetch" as const,
                cardId: id,
                subtype: action.subtype,
              },
            },
          })),
        ],
logLine: `Meeting of Minds — may search stack for a ${subtype} resource.`,
});
      return { ok: true };
    }

case "resolve_burner": {
      const revealN = Math.min(
        Math.max(0, action.reveal),
        state.corp.hand.length,
      );
      // v0 deterministic "random": first N cards in HQ order.
      const revealed = state.corp.hand.slice(0, revealN);
      for (const id of revealed) {
        state.cards[id]!.faceup = true;
        log(state, `Reveal ${state.cards[id]!.title} from HQ.`);
      }
      const moves = Math.min(Math.max(0, action.move), revealed.length);
      return offerBurnerMoves(state, sourceId, revealed, moves);
    }

case "resolve_wizard_chest": {
      const types: Array<"hardware" | "program" | "resource"> = [
        "hardware",
        "program",
        "resource",
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: types.map((cardType) => ({
          id: `wizard-type:${cardType}`,
          label: `Choose ${cardType}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "wizard_chest_for_type" as const,
              cardType,
              untilCount: action.untilCount,
              ignoreAllCosts: action.ignoreAllCosts,
            },
          },
        })),
logLine: `${source.title} — choose card type.`,
});
      return { ok: true };
    }
    default:
      return null;
  }
}

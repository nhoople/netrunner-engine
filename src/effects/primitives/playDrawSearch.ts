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
import { corpInstallCost } from "../../state/keywordsAndCredits/costs.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import { playEffectFromCard } from "../abilityRecord.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
import { trashCorpCardSet } from "../kinds/trashKinds.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { evalEffect } from "../eval.js";
import { installedRunnerIds } from "../visibility/visibilityKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function installedCorpIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) out.push(id);
  }
  return out;
}

function nextRemoteId(state: EffectCtx["state"]): ServerId {
  let n = 1;
  while (state.servers[`remote${n}` as ServerId]) n += 1;
  return `remote${n}` as ServerId;
}

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

    case "draw_from_bottom_of_rd": {
      // Shannon Claire: "Draw 1 card from the bottom of R&D" is a draw, so it
      // goes through the draw procedure (CR 8.4.5): the bottom card moves to
      // the top, then the Corp draws it (Jinja City Grid, Political Dealings).
      // With R&D empty the draw still happens, so the Runner wins
      // (CR 1.7.2c).
      const n = action.amount ?? 1;
      for (let i = 0; i < Math.min(n, state.corp.deck.length); i++) {
        const id = state.corp.deck.pop()!;
        state.corp.deck.unshift(id);
      }
      return evalEffect(ctx, fx.draw("corp", n));
    }

    case "search_rd_or_archives_agenda_to_bottom_rd": {
      const fromRd = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      const fromArch = state.corp.discardPile.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const id of fromRd) {
        opts.push({
          id: `shannon-rd:${id}`,
          label: `R&D: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_agenda_to_bottom_rd",
            cardId: id,
            shuffledRd: true,
          }),
        });
      }
      for (const id of fromArch) {
        opts.push({
          id: `shannon-arch:${id}`,
          label: `Archives: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_agenda_to_bottom_rd",
            cardId: id,
            shuffledRd: false,
          }),
        });
      }
      if (opts.length === 0) {
        log(state, `${source?.title ?? "Shannon Claire"} — no agenda found.`);
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts });
      return { ok: true };
    }

    case "move_agenda_to_bottom_rd": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      removeCardFromCurrentZone(state, action.cardId);
      if (action.shuffledRd) {
        const rest = state.corp.deck.filter((id) => id !== action.cardId);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          [rest[i], rest[j]] = [rest[j]!, rest[i]!];
        }
        // top = index 0; bottom = end
        state.corp.deck = [...rest, action.cardId];
      } else {
        state.corp.deck.push(action.cardId);
      }
      card.zone = "corp:rd";
      card.faceup = false;
      log(state, `${card.title} added to bottom of R&D.`);
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

    case "install_and_rez_x_advertisements_from_hq_or_archives": {
      const x = state.turn.lastPlayCostX ?? 0;
      const ads = [...state.corp.hand, ...state.corp.discardPile].filter(
        (id) => {
          const card = state.cards[id];
          if (!card || !(card.subtypes ?? []).includes("advertisement"))
            return false;
          if (card.type === "agenda") return false;
          const cost = corpInstallCost(card, 0) + (card.rezCost ?? 0);
          return state.corp.credits >= cost;
        },
      );
      if (x <= 0 || ads.length === 0) {
        log(state, `Ad Blitz — nothing to install (X=${x}).`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ads.map((id) => ({
          id: `adblitz:${id}`,
          label: `Install+rez ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "install_rez_advertisement",
            cardId: id,
            remaining: x - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "install_rez_advertisement": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = corpInstallCost(card, 0) + (card.rezCost ?? 0);
      if (state.corp.credits >= cost) {
        state.corp.credits -= cost;
        removeCardFromCurrentZone(state, action.cardId);
        const remoteKey = nextRemoteId(state);
        state.servers[remoteKey] = {
          id: remoteKey,
          kind: "remote",
          ice: [],
          root: [],
        };
        state.servers[remoteKey]!.root.push(action.cardId);
        card.zone = `server:${remoteKey}:root`;
        card.rezzed = true;
        card.faceup = true;
        log(state, `Ad Blitz — install and rez ${card.title}.`);
      } else {
        log(state, `Cannot afford install+rez ${card.title}.`);
      }
      if (action.remaining > 0) {
        state.turn.lastPlayCostX = action.remaining;
        return applyDadPrimitive(ctx, {
          kind: "install_and_rez_x_advertisements_from_hq_or_archives",
        });
      }
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

    case "trash_all_resources_unless_remove_bad_publicity": {
      const bp = state.corp.badPublicity ?? 0;
      const opts: { id: string; label: string; effect: Effect }[] = [
        {
          id: "trash-resources",
          label: "Trash all installed resources",
          effect: fx.do({ kind: "trash_all_resources" }),
        },
      ];
      if (bp >= 1) {
        opts.unshift({
          id: "remove-bp",
          label: "Remove 1 bad publicity",
          effect: fx.do({ kind: "remove_bad_publicity_instead", amount: 1 }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options: opts });
      return { ok: true };
    }

    case "trash_all_resources": {
      for (const id of [...state.runner.installed]) {
        if (state.cards[id]?.type === "resource") trashCard(state, id);
      }
      log(state, `The All-Seeing I — trash all resources.`);
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

    case "install_from_grip_facedown": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `Apex — grip empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `apex-fd:${id}`,
          label: `Install ${state.cards[id]!.title} facedown`,
          effect: fx.do({ kind: "install_facedown", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "install_facedown": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      removeCardFromCurrentZone(state, action.cardId);
      state.runner.installed.push(action.cardId);
      card.zone = "runner:installed";
      card.faceup = false;
      log(state, `Install ${card.title} facedown.`);
      return { ok: true };
    }

    case "trash_all_installed_corp_cards": {
      // One instruction trashes the whole set (CR 9.12.2a): Hostile
      // Infrastructure has one instance per card, pending with the set's
      // other trash triggers in one reaction window (CR 9.6.4b, 9.2.8d).
      log(state, `Apocalypse — trash all installed Corp cards.`);
      trashCorpCardSet(state, installedCorpIds(state), {
        by: controllerOf(state, sourceId),
        instruction: "trash_all_installed_corp_cards",
      });
      return { ok: true };
    }

    case "trash_installed_prevent_damage": {
      // Heartbeat: "Trash 1 of your installed cards", Heartbeat included.
      const cands = installedRunnerIds(state);
      if (cands.length === 0) {
        log(state, `Heartbeat — no installed card to trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `hb:${id}`,
          label: `Trash ${state.cards[id]!.title} to prevent 1 damage`,
          effect: fx.seq(
            fx.do({ kind: "trash_own_installed", cardId: id }),
            fx.do({ kind: "prevent_pending_damage", amount: action.amount }),
          ),
        })),
      });
      return { ok: true };
    }

    case "trash_own_installed": {
      // The Runner trashes their own card (Heartbeat, Endless Hunger), which
      // Wasteland counts (`noteRunnerInstalledCardTrashing`, CR 1.14.5).
      trashCard(state, action.cardId, { by: "runner" });
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

    case "install_top_n_of_stack_facedown": {
      const n = action.amount ?? 3;
      for (let i = 0; i < n; i++) {
        const id = state.runner.deck.shift();
        if (!id) break;
        const card = state.cards[id]!;
        state.runner.installed.push(id);
        card.zone = "runner:installed";
        card.faceup = false;
        log(state, `Install ${card.title} facedown from stack.`);
      }
      return { ok: true };
    }

    case "trash_draw": {
      // Independent Thinking: "Trash up to 5 of your installed cards. Draw 1
      // card for each card trashed (or 2 ... if you trashed at least 1
      // directive)." The Runner picks up to 5, they are trashed together
      // (CR 9.12.2a), then the Runner draws through the draw procedure
      // (CR 8.4.5).
      if (!action.cardIds) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: installedRunnerIds(state),
            count: 5,
            upTo: true,
            purpose: "resume",
            label: "trash",
            resume: { kind: "trash_draw" },
          }),
        );
      }
      const picked = action.cardIds.filter((id) =>
        state.runner.installed.includes(id),
      );
      const hasDirective = picked.some((id) =>
        (state.cards[id]?.subtypes ?? []).includes("directive"),
      );
      const trashed = picked.filter((id) => {
        const before = state.cards[id]!.zone;
        trashCard(state, id, { by: "runner", simultaneousSet: true });
        return state.cards[id]?.zone !== before;
      });
      const draws = trashed.length * (hasDirective ? 2 : 1);
      log(
        state,
        `Independent Thinking — trashed ${trashed.length}, draw ${draws}.`,
      );
      if (draws === 0) return { ok: true };
      return evalEffect(ctx, fx.draw("runner", draws));
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

    case "shuffle_trash_top_gain_install_cost": {
      const deck = [...state.runner.deck];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      state.runner.deck = deck;
      const top = state.runner.deck.shift();
      if (!top) {
        log(state, `Windfall — stack empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      const gainAmt = card.installCost ?? 0;
      trashCard(state, top, { by: "runner" });
      state.runner.credits += gainAmt;
      log(
        state,
        `Windfall — trash ${card.title}, gain ${gainAmt}¢ (install cost).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

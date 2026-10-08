/** Data and Destiny (dad) deluxe primitives — v1.115.0. */
import { log } from "../state/createGame.js";
import { autoResolveTrace } from "../state/trace.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { placeCurrentAfterPlay } from "../state/currents.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function installedRunnerIds(state: EffectCtx["state"]): string[] {
  return [...state.runner.rig];
}

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
      const cands = [...new Set([...state.corp.hand, ...state.corp.discard])].filter(
        (id) => {
          const c = state.cards[id];
          return (
            c?.type === "operation" && (c.subtypes ?? []).includes("current")
          );
        },
      );
      if (cands.length === 0) {
        log(state, `${source?.title ?? "Sol"} — no current to play.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => {
          const card = state.cards[id]!;
          const play: Effect[] = [
            fx.do({ kind: "play_current_card", cardId: id }),
          ];
          if (card.onPlay) play.push(card.onPlay);
          return {
            id: `play-current:${id}`,
            label: `Play ${card.title}`,
            effect: play.length === 1 ? play[0]! : fx.seq(...play),
          };
        }),
      };
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
      const n = action.amount ?? 1;
      for (let i = 0; i < n; i++) {
        // deck.shift() = top; bottom = pop()
        const id = state.corp.deck.pop();
        if (!id) break;
        state.corp.hand.push(id);
        const c = state.cards[id]!;
        c.zone = "corp:hq";
        log(state, `Draw ${c.title} from bottom of R&D.`);
      }
      return { ok: true };
    }

    case "search_rd_or_archives_agenda_to_bottom_rd": {
      const fromRd = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      const fromArch = state.corp.discard.filter(
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
      state.pendingChoice = { sourceId, chooser: "corp", options: opts };
      return { ok: true };
    }

    case "move_agenda_to_bottom_rd": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      removeCardFromCurrentZone(state, action.cardId);
      if (action.shuffledRd) {
        const rest = state.corp.deck.filter((id) => id !== action.cardId);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
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

    case "reality_threedee_gain_credits": {
      const tagged = (state.runner.tags ?? 0) > 0;
      const amount = tagged ? 2 : 1;
      state.corp.credits += amount;
      log(
        state,
        `Reality Threedee — gain ${amount}¢ (${tagged ? "tagged" : "untagged"}).`,
      );
      return { ok: true };
    }

    case "force_encounter_accessed_ice": {
      const iceId = state.run?.accessingCardId ?? sourceId;
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `force_encounter — no ice to encounter.`);
        return { ok: true };
      }
      ice.rezzed = true;
      ice.faceup = true;
      if (state.run) {
        state.run.resumeAccessAfterReencounter = true;
        state.run.pendingReencounterIceId = iceId;
      }
      log(state, `Runner encounters ${ice.title} (Archangel access).`);
      return { ok: true };
    }

    case "arm_duplicate_subs_on_next_ice_encounter": {
      state.turn.dadDuplicateSubsOnNextIceEncounter = true;
      log(state, `TL;DR — next ice encounter this run duplicates subroutines.`);
      return { ok: true };
    }

    case "resolve_when_scored_on_scored_agenda": {
      const scored = state.corp.score.filter(
        (id) => state.cards[id]?.onScore != null,
      );
      if (scored.length === 0) {
        log(state, `24/7 News Cycle — no when-scored in score area.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: scored.map((id) => ({
          id: `247:${id}`,
          label: `Resolve when-scored on ${state.cards[id]!.title}`,
          effect: state.cards[id]!.onScore!,
        })),
      };
      return { ok: true };
    }

    case "install_and_rez_x_advertisements_from_hq_or_archives": {
      const x = state.turn.lastPlayCostX ?? 0;
      const ads = [...state.corp.hand, ...state.corp.discard].filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("advertisement"),
      );
      if (x <= 0 || ads.length === 0) {
        log(state, `Ad Blitz — nothing to install (X=${x}).`);
        return { ok: true };
      }
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "install_rez_advertisement": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = (card.installCost ?? 0) + (card.rezCost ?? 0);
      if (state.corp.credits >= cost) {
        state.corp.credits -= cost;
        removeCardFromCurrentZone(state, action.cardId);
        const remoteKey = nextRemoteId(state);
        state.servers[remoteKey] = { id: remoteKey, kind: "remote", ice: [], root: [] };
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
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: [
            {
              id: "adblitz-continue",
              label: `Continue Ad Blitz (${action.remaining} remaining)`,
              effect: fx.do({
                kind: "install_and_rez_x_advertisements_from_hq_or_archives",
              }),
            },
            {
              id: "adblitz-stop",
              label: "Stop",
              effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
            },
          ],
        };
      }
      return { ok: true };
    }

    case "media_blitz_gain_text_of_runner_scored_agenda": {
      const agendas = state.runner.score.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Media Blitz — no agenda in Runner score.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `mb:${id}`,
          label: `Copy text of ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "dad_media_blitz_copy", cardId: id }),
        })),
      };
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
          effect: fx.do({ kind: "dad_remove_bad_publicity", amount: 1 }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options: opts };
      return { ok: true };
    }

    case "trash_all_resources": {
      for (const id of [...state.runner.rig]) {
        if (state.cards[id]?.type === "resource") moveRunnerCardToHeap(state, id);
      }
      log(state, `The All-Seeing I — trash all resources.`);
      return { ok: true };
    }

    case "dad_remove_bad_publicity": {
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
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `apex-fd:${id}`,
          label: `Install ${state.cards[id]!.title} facedown`,
          effect: fx.do({ kind: "install_facedown", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "install_facedown": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      removeCardFromCurrentZone(state, action.cardId);
      state.runner.rig.push(action.cardId);
      card.zone = "runner:rig";
      card.faceup = false;
      log(state, `Install ${card.title} facedown.`);
      return { ok: true };
    }

    case "trash_all_installed_corp_cards": {
      for (const id of installedCorpIds(state)) {
        const c = state.cards[id];
        if (!c) continue;
        removeCardFromCurrentZone(state, id);
        state.corp.discard.push(id);
        c.zone = "corp:archives";
        c.faceup = true;
        c.rezzed = false;
      }
      log(state, `Apocalypse — trash all installed Corp cards.`);
      return { ok: true };
    }

    case "turn_all_installed_runner_cards_facedown": {
      for (const id of installedRunnerIds(state)) {
        const c = state.cards[id];
        if (c) c.faceup = false;
      }
      log(state, `Apocalypse — turn all installed Runner cards facedown.`);
      return { ok: true };
    }

    case "heartbeat_trash_installed_prevent_damage": {
      const cands = installedRunnerIds(state).filter((id) => id !== sourceId);
      if (cands.length === 0) {
        log(state, `Heartbeat — no installed card to trash.`);
        return { ok: true };
      }
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "trash_own_installed": {
      moveRunnerCardToHeap(state, action.cardId);
      state.turn.dadOwnInstalledTrashedThisTurn =
        (state.turn.dadOwnInstalledTrashedThisTurn ?? 0) + 1;
      if (
        (state.turn.dadOwnInstalledTrashedThisTurn ?? 0) === 1
      ) {
        for (const id of state.runner.rig) {
          const c = state.cards[id];
          const n = c?.gainCreditsOnFirstOwnInstalledTrashEachTurn;
          if (typeof n === "number" && n > 0) {
            state.runner.credits += n;
            log(state, `${c!.title} — gain ${n}¢ (first own trash).`);
          }
        }
      }
      return { ok: true };
    }

    case "break_etr_subroutine_trash_installed": {
      const cands = installedRunnerIds(state).filter((id) => id !== sourceId);
      if (cands.length === 0) {
        log(state, `Endless Hunger — nothing to trash.`);
        return { ok: true };
      }
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "break_encounter_etr_subroutine": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : undefined;
      if (!enc || !ice?.subroutines) return { ok: true };
      const idx = ice.subroutines.findIndex((s, i) => {
        if (enc.broken[i]) return false;
        const text = (s.text ?? "").toLowerCase();
        return text.includes("end the run");
      });
      if (idx >= 0) {
        enc.broken[idx] = true;
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
        .filter(({ i }) => !enc.broken[i]);
      if (unbroken.length === 0) return { ok: true };
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "break_sub_index": {
      const enc = state.run?.encounter;
      if (enc && enc.iceId === action.iceId && enc.broken[action.index] !== undefined) {
        enc.broken[action.index] = true;
        log(state, `Break subroutine on ${state.cards[action.iceId]?.title}.`);
      }
      return { ok: true };
    }

    case "prevent_pending_when_encountered": {
      state.turn.dadPreventWhenEncounteredArmed = true;
      log(state, `Hunting Grounds — prevent when-encountered.`);
      return { ok: true };
    }

    case "install_top_n_of_stack_facedown": {
      const n = action.amount ?? 3;
      for (let i = 0; i < n; i++) {
        const id = state.runner.deck.shift();
        if (!id) break;
        const card = state.cards[id]!;
        state.runner.rig.push(id);
        card.zone = "runner:rig";
        card.faceup = false;
        log(state, `Install ${card.title} facedown from stack.`);
      }
      return { ok: true };
    }

    case "independent_thinking_trash_draw": {
      const cands = installedRunnerIds(state);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...cands.map((id) => ({
            id: `it:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "dad_independent_thinking_continue",
              trashed: [id],
              remainingPicks: 4,
            }),
          })),
          {
            id: "it-done",
            label: "Done (trash 0)",
            effect: fx.do({
              kind: "dad_independent_thinking_finish",
              trashed: [],
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "dad_independent_thinking_continue": {
      const trashed = [...action.trashed];
      const last = trashed[trashed.length - 1]!;
      moveRunnerCardToHeap(state, last);
      if (action.remainingPicks <= 0) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "it-finish",
              label: "Finish",
              effect: fx.do({
                kind: "dad_independent_thinking_finish",
                trashed,
              }),
            },
          ],
        };
        return { ok: true };
      }
      const cands = installedRunnerIds(state);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...cands.map((id) => ({
            id: `it:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "dad_independent_thinking_continue",
              trashed: [...trashed, id],
              remainingPicks: action.remainingPicks - 1,
            }),
          })),
          {
            id: "it-done",
            label: `Done (trashed ${trashed.length})`,
            effect: fx.do({
              kind: "dad_independent_thinking_finish",
              trashed,
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "dad_independent_thinking_finish": {
      const trashed = action.trashed;
      const hasDirective = trashed.some((id) =>
        (state.cards[id]?.subtypes ?? []).includes("directive"),
      );
      const per = hasDirective ? 2 : 1;
      const drawN = trashed.length * per;
      for (let i = 0; i < drawN; i++) {
        const id = state.runner.deck.shift();
        if (!id) break;
        state.runner.hand.push(id);
        state.cards[id]!.zone = "runner:grip";
      }
      log(
        state,
        `Independent Thinking — trashed ${trashed.length}, draw ${drawN}.`,
      );
      return { ok: true };
    }

    case "dr_lovegood_blank_installed_abilities": {
      const cands = installedRunnerIds(state);
      if (cands.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `love:${id}`,
          label: `Blank ${state.cards[id]!.title} this turn`,
          effect: fx.do({ kind: "blank_card_this_turn", cardId: id }),
        })),
      };
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

    case "security_chip_boost_breakers_per_link": {
      const link = state.runner.link ?? 0;
      const breakers = installedRunnerIds(state).filter((id) => {
        const c = state.cards[id];
        return Boolean(c?.breaker) || (c?.subtypes ?? []).includes("icebreaker");
      });
      const clouds = breakers.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("cloud"),
      );
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...(clouds.length
            ? [
                {
                  id: "sc-all-cloud",
                  label: `Boost all cloud icebreakers +${link}`,
                  effect: fx.do({
                    kind: "boost_breakers",
                    cardIds: clouds,
                    amount: link,
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
      };
      return { ok: true };
    }

    case "boost_breakers": {
      state.turn.dadBreakerStrengthBoosts =
        state.turn.dadBreakerStrengthBoosts ?? {};
      for (const id of action.cardIds) {
        state.turn.dadBreakerStrengthBoosts[id] =
          (state.turn.dadBreakerStrengthBoosts[id] ?? 0) + action.amount;
      }
      log(state, `Security Chip — boost breakers by ${action.amount}.`);
      return { ok: true };
    }

    case "security_nexus_trace_bypass_or_tag_etr": {
      autoResolveTrace(
        state,
        sourceId,
        5,
        fx.seq(
          fx.do({ kind: "give_tags", amount: 1 }),
          fx.do({ kind: "end_the_run" }),
        ),
        fx.do({ kind: "dad_bypass_encountered_ice" }),
      );
      return { ok: true };
    }

    case "dad_bypass_encountered_ice": {
      if (state.run?.encounter) {
        state.run.encounter = null;
        log(state, `Security Nexus — bypass encountered ice.`);
      }
      return { ok: true };
    }

    case "jak_sinclair_run_without_programs": {
      state.turn.dadCannotUseProgramsThisRun = true;
      // Flag only — run is initiated via standard action UI after choice;
      // arm a marker that first run this window forbids programs.
      log(state, `Jak Sinclair — next run cannot use programs.`);
      return { ok: true };
    }

    case "windfall_shuffle_trash_top_gain_install_cost": {
      const deck = [...state.runner.deck];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
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
      state.runner.discard.push(top);
      card.zone = "runner:heap";
      card.faceup = true;
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

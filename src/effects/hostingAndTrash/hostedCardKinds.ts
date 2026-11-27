/**
 * Primitive kinds for hosting cards on other cards, and taking hosted cards
 * back. The kind registry (`applyCoreKinds`) dispatches here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import {
  hostCard,
  unhostCard,
  unhostAllFrom,
} from "../../state/hostingAndTrash/host.js";
import { type Effect } from "../ir/effect.js";
import { fx } from "../ir/fx.js";
import { type Primitive } from "../ir/primitive.js";
import {
  evalEffect,
  applyPrimitive,
  fireHostRezStateTriggers,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { serverIdForIce } from "../../cards/stubs.js";
import { CR } from "../../timing/labels.js";
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { random } from "../../state/rng.js";
import type { RuleCite } from "../../state/types/restrictions.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function offerBookmarkHostChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId]!;
  const remaining = state.turn.uotBookmarkHostRemaining ?? 0;
  if (remaining <= 0 || state.runner.hand.length === 0) {
    state.turn.uotBookmarkHostRemaining = undefined;
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: [
      ...state.runner.hand.map((cardId) => ({
        id: `bookmark-host:${cardId}`,
        label: `Host ${state.cards[cardId]!.title} facedown`,
        effect: {
          op: "do" as const,
          action: {
            kind: "uot_bookmark_host_one" as const,
            cardId,
          },
        },
      })),
      {
        id: "bookmark-done",
        label: "Done hosting",
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
    logLine: `${source.title} — host from grip (${remaining} remaining capacity).`,
  });
  return { ok: true };
}

function installedNonAiIcebreakers(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    if (!c || c.type !== "program") return false;
    if ((c.subtypes ?? []).includes("ai")) return false;
    return Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker");
  });
}

function connectionResources(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    return (
      c &&
      c.type === "resource" &&
      (c.subtypes ?? []).some((s) => s.toLowerCase() === "connection")
    );
  });
}

export function applyHostedCardKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "oversight_ai_host_on_ice": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Oversight AI — invalid ice.`);
        return { ok: true };
      }
      ice.rezzed = true;
      ice.faceup = true;
      // Move source onto ice as hosted condition.
      removeCardFromCurrentZone(state, sourceId);
      hostCard(state, source.id, action.iceId, { installed: true });
      source.zone = `hosted:${action.iceId}`;
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "counter";
      log(
        state,
        `Rez ${ice.title} ignoring costs; host ${source.title} as condition counter.`,
      );
      return { ok: true };
    }

    case "caissa_pawn_host_outermost_central": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.kind !== "central" || server.ice.length === 0) continue;
        const iceId = server.ice[0]!;
        options.push({
          id: `host:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title} (${sid})`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        });
      }
      if (options.length === 0) {
        log(state, `${source.title} — no outermost ice on a central server.`);
        return { ok: true };
      }
      if (options.length === 1) return evalEffect(ctx, options[0]!.effect);
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "caissa_rook_host": {
      const isCaissa = (id: string) => {
        const subs = (state.cards[id]?.subtypes ?? []).map((s) =>
          s.toLowerCase(),
        );
        return subs.includes("caïssa") || subs.includes("caissa");
      };
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          const taken = state.runner.installed.some(
            (rid) => state.cards[rid]?.hostId === iceId && isCaissa(rid),
          );
          if (!taken) candidates.push(iceId);
        }
      }
      if (candidates.length === 0) {
        log(state, `${source.title} — no valid host ice.`);
        return { ok: true };
      }
      const currentHost = source.hostId;
      const currentServer = currentHost
        ? serverIdForIce(state, currentHost)
        : null;
      const inwardFromInnermost = (
        serverIce: string[],
        iceId: string,
      ): number => serverIce.length - 1 - serverIce.indexOf(iceId);
      const currentInward =
        currentHost && currentServer
          ? inwardFromInnermost(state.servers[currentServer].ice, currentHost)
          : -1;
      // Once hosted on ice, the printed limit on where it may move next:
      // Rook to ice protecting the same server or in the same position
      // (counted from the innermost); Knight anywhere but the next ice
      // inward or outward (CR 1.2.1).
      const filtered = candidates.filter((iceId) => {
        if (iceId === currentHost) return false;
        if (!currentHost) return true;
        const sid = serverIdForIce(state, iceId);
        if (!sid) return false;
        const position = inwardFromInnermost(state.servers[sid].ice, iceId);
        if (action.move === "not_adjacent") {
          return !(
            sid === currentServer && Math.abs(position - currentInward) === 1
          );
        }
        return sid === currentServer || position === currentInward;
      });
      const pickFrom = currentHost ? filtered : candidates;
      if (pickFrom.length === 0) {
        log(
          state,
          `${source.title} — no ice it may move to (CR ${CR.countPositions.number}).`,
        );
        return { ok: true };
      }
      // An unrezzed ice is named by where it is, not by its title: the
      // Runner may not see its face (CR 1.21.1, 10.2.2a).
      const iceName = (iceId: string): string =>
        openCardName(state, iceId, "runner");
      if (pickFrom.length === 1) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: pickFrom[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: pickFrom.map((iceId) => ({
          id: `host:${iceId}`,
          label: `Host on ${iceName(iceId)}`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "caissa_bishop_host": {
      const isCaissa = (id: string) => {
        const subs = (state.cards[id]?.subtypes ?? []).map((s) =>
          s.toLowerCase(),
        );
        return subs.includes("caïssa") || subs.includes("caissa");
      };
      const hostId = source.hostId;
      let requireCentral: boolean | null = null;
      if (hostId) {
        const sid = serverIdForIce(state, hostId);
        if (sid) {
          requireCentral = state.servers[sid].kind === "central";
        }
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (requireCentral !== null) {
          const isCentral = server.kind === "central";
          if (requireCentral && isCentral) continue;
          if (!requireCentral && !isCentral) continue;
        }
        for (const iceId of server.ice) {
          const taken = state.runner.installed.some(
            (rid) => state.cards[rid]?.hostId === iceId && isCaissa(rid),
          );
          if (!taken) candidates.push(iceId);
        }
      }
      if (candidates.length === 0) {
        log(state, `${source.title} — no valid host ice.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: candidates[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((iceId) => ({
          id: `host:${iceId}`,
          label: `Host on ${openCardName(state, iceId, "runner")}`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "advance_caissa_host_inward_or_install": {
      const hostId = source.hostId;
      if (!hostId) return { ok: true };
      const sid = serverIdForIce(state, hostId);
      if (!sid) return { ok: true };
      const iceList = state.servers[sid].ice;
      const pos = iceList.indexOf(hostId);
      const nextId =
        pos >= 0 && pos + 1 < iceList.length ? iceList[pos + 1]! : null;
      if (nextId) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: nextId,
        });
      }
      trashCard(state, sourceId);
      const isCaissa = (id: string) => {
        const c = state.cards[id];
        return (
          c?.type === "program" &&
          ((c.subtypes ?? []).some((s) => s.toLowerCase().includes("caissa")) ||
            (c.subtypes ?? []).some((s) => s.toLowerCase().includes("caïssa")))
        );
      };
      const caissaIds = [
        ...state.runner.hand,
        ...state.runner.discardPile,
      ].filter((id) => isCaissa(id) && id !== sourceId);
      if (caissaIds.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: caissaIds.map((cardId) => ({
          id: `install:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} ignoring all costs`,
          effect: {
            op: "do",
            action: {
              kind: "install_caissa_from_zone_ignore_costs",
              cardId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "gamedragon_may_host_on_icebreaker": {
      const allowAi = Boolean(action.allowAi);
      const requireHost = Boolean(action.requireHost);
      const breakers = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c?.breaker && !(c?.subtypes ?? []).includes("icebreaker")) {
          return false;
        }
        if (!allowAi && (c.subtypes ?? []).includes("ai")) return false;
        return true;
      });
      if (breakers.length === 0) {
        log(
          state,
          allowAi
            ? `${source.title} — no icebreaker to host on.`
            : `${source.title} — no non-AI icebreaker to host on.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        breakers.map((icebreakerId) => ({
          id: icebreakerId,
          label: `Host on ${state.cards[icebreakerId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_hardware_on_icebreaker" as const,
              icebreakerId,
            },
          },
        }));
      if (!requireHost) {
        options.push({
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: requireHost
          ? `${source.title} — host on an icebreaker.`
          : `${source.title} — may host on a${allowAi ? "" : " non-AI"} icebreaker.`,
      });
      return { ok: true };
    }

    case "rehost_on_other_ice": {
      const currentHost = source.hostId;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          if (iceId !== currentHost) others.push(iceId);
        }
      }
      if (others.length === 0) {
        log(state, `${source.title} — no other installed ice to host on.`);
        return { ok: true };
      }
      if (others.length === 1) {
        const iceId = others[0]!;
        hostCard(state, source.id, iceId, { installed: true });
        log(state, `${source.title} hosts on ${state.cards[iceId]!.title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: others.map((iceId) => ({
          id: `rehost:${iceId}`,
          label: `Host on ${openCardName(state, iceId, "runner")}`,
          effect: {
            op: "do" as const,
            action: { kind: "rehost_to_ice" as const, iceId },
          },
        })),
        logLine: `${source.title} — choose another installed ice to host on.`,
      });
      return { ok: true };
    }

    case "rehost_to_ice": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Rehost — ${action.iceId} is not ice.`);
        return { ok: true };
      }
      let installed = false;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(action.iceId)) {
          installed = true;
          break;
        }
      }
      if (!installed) {
        log(state, `Rehost — ${ice.title} is not installed.`);
        return { ok: true };
      }
      hostCard(state, source.id, action.iceId, { installed: true });
      log(state, `${source.title} hosts on ${ice.title}.`);
      return { ok: true };
    }

    case "trash_self_and_derez_host": {
      const hostId = source.hostId;
      const trashed = applyPrimitive(ctx, { kind: "trash_self" });
      if (!trashed.ok) return trashed;
      if (!hostId) {
        log(state, `${source.title} — trashed; no host ice to derez.`);
        return { ok: true };
      }
      const host = state.cards[hostId];
      if (!host || host.type !== "ice" || !host.rezzed) {
        log(
          state,
          `${source.title} — trashed; ${host?.title ?? hostId} not rezzed ice.`,
        );
        return { ok: true };
      }
      host.rezzed = false;
      host.faceup = false;
      log(
        state,
        `${source.title} — trashed and derez ${host.title} (CR ${CR.derez.number}).`,
      );
      if (state.run) state.run.iceDerezzedThisRun = true;
      fireHostRezStateTriggers(state, hostId, "derez");
      return { ok: true };
    }
    case "supplier_host_from_grip": {
      const host = state.cards[sourceId];
      if (!host?.supplierHost) return { ok: true };
      const candidates = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "resource" || t === "hardware";
      });
      if (candidates.length === 0) {
        log(state, `The Supplier — nothing to host from grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `host:${id}`,
          label: `Host ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_supplier_host", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "resolve_supplier_host": {
      const cardId = (action as { cardId: string }).cardId;
      const host = state.cards[sourceId];
      const card = state.cards[cardId];
      if (!host || !card) return { ok: true };
      state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
      hostCard(state, card.id, sourceId, { installed: true });
      log(state, `The Supplier — host ${card.title}.`);
      return { ok: true };
    }

    case "host_on_agenda": {
      // Faceup agendas in remote roots (installed).
      const agendas: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c?.type === "agenda") agendas.push(id);
        }
      }
      // Also allow turning a facedown agenda faceup — include all installed agendas.
      if (agendas.length === 0) {
        log(state, `Transparency Initiative — no installed agenda.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `ti:${id}`,
          label: `Host on ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "resolve_transparency_initiative_host",
            agendaId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_transparency_initiative_host": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !source) return { ok: true };
      agenda.faceup = true;
      if (!(agenda.subtypes ?? []).includes("public")) {
        agenda.subtypes = [...(agenda.subtypes ?? []), "public"];
      }
      removeCardFromCurrentZone(state, sourceId);
      hostCard(state, source.id, agendaId, { installed: true });
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      // Copy onAdvance onto host path via hosted cards; also set gainCreditsOnAdvance.
      agenda.gainCreditsOnAdvance = (agenda.gainCreditsOnAdvance ?? 0) + 1;
      log(
        state,
        `Transparency Initiative — host on ${agenda.title} (public; +1¢ on advance).`,
      );
      return { ok: true };
    }

    case "host_on_rezzed_ice_as_condition": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) iceIds.push(id);
        }
      }
      if (iceIds.length === 0) {
        log(state, `Rover Algorithm — no rezzed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `rover:${id}`,
          label: `Host on ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "host_self_as_condition",
            hostId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "glenn_host_from_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Glenn Station — HQ empty.`);
        return { ok: true };
      }
      const hosted = Object.values(state.cards).filter(
        (c) => c.hostId === sourceId,
      );
      if (hosted.length >= (source?.maxHostedCards ?? 1)) {
        log(state, `Glenn Station — already hosting a card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: hq.map((id) => ({
          id: `glenn-host:${id}`,
          label: `Host ${state.cards[id]!.title} facedown`,
          effect: fx.do({ kind: "glenn_host_card", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "glenn_host_card": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        return { ok: false, error: "Glenn host target not in HQ.", cites: [] };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      card.zone = `hosted:${sourceId}`;
      hostCard(state, card.id, sourceId, { installed: true });
      card.rezzed = false;
      log(state, `Glenn Station — host ${card.title} facedown.`);
      return { ok: true };
    }

    case "glenn_retrieve_to_hq": {
      const hosted = Object.values(state.cards).filter(
        (c) => c.hostId === sourceId,
      );
      if (hosted.length === 0) {
        log(state, `Glenn Station — no hosted card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: hosted.map((c) => ({
          id: `glenn-ret:${c.id}`,
          label: `Add ${c.title} to HQ`,
          effect: fx.do({ kind: "glenn_retrieve_card", cardId: c.id }),
        })),
      });
      return { ok: true };
    }

    case "glenn_retrieve_card": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || card.hostId !== sourceId) {
        return {
          ok: false,
          error: "Glenn retrieve target not hosted.",
          cites: [],
        };
      }
      unhostCard(state, card.id);
      card.zone = "corp:hq";
      state.corp.hand.push(cardId);
      log(state, `Glenn Station — add ${card.title} to HQ.`);
      return { ok: true };
    }
    case "host_on_scored_agenda": {
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const agendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Political Graffiti — no agenda in Corp score area.`);
        return { ok: true };
      }
      if (agendas.length === 1) {
        return applyHostedCardKinds(ctx, {
          kind: "resolve_political_graffiti_host",
          agendaId: agendas[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: agendas.map((agendaId) => {
          const a = state.cards[agendaId]!;
          return {
            id: `pg:${agendaId}`,
            label: `Host on ${a.title}`,
            effect: fx.do({
              kind: "resolve_political_graffiti_host",
              agendaId,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "resolve_political_graffiti_host": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !state.corp.scoreArea.includes(agendaId)) {
        log(state, `Political Graffiti — agenda no longer in score area.`);
        return { ok: true };
      }
      if (!source) return { ok: true };
      removeCardFromCurrentZone(state, sourceId);
      hostCard(state, source.id, agendaId, { installed: true });
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      log(
        state,
        `Political Graffiti — host on ${agenda.title} (−1 agenda point while hosted; trash on virus purge).`,
      );
      return { ok: true };
    }

    case "host_on_rezzed_bioroid_ice_as_condition": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (
            ice?.type === "ice" &&
            ice.rezzed &&
            (ice.subtypes ?? []).includes("bioroid")
          ) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `${source?.title ?? "Wetwork"} — no rezzed bioroid ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `wetwork-host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_self_as_condition",
            hostId: id,
          }),
        })),
        logLine: `${source?.title ?? "Wetwork"} — choose rezzed bioroid ice to host on.`,
      });
      return { ok: true };
    }

    case "host_non_virus_program_ignore_cost": {
      const grip = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        return c?.type === "program" && !(c.subtypes ?? []).includes("virus");
      });
      if (grip.length === 0) {
        log(state, `London Library — no non-virus program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((id) => ({
            id: `ll-host:${id}`,
            label: `Host ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "host_program" as const,
                cardId: id,
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
      });
      return { ok: true };
    }

    case "host_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.hand.includes(cardId)) {
        return {
          ok: false,
          error: "London Library — program not in grip.",
          cites: [],
        };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      hostCard(state, card.id, sourceId, { installed: true });
      card.zone = `hosted:${sourceId}`;
      card.faceup = true;
      // Still counts as installed for MU — add to rig while hosted.
      if (!state.runner.installed.includes(cardId))
        state.runner.installed.push(cardId);
      log(state, `London Library — host ${card.title} (ignore install cost).`);
      return { ok: true };
    }

    case "add_hosted_program_to_grip": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `London Library — no hosted program.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((id) => ({
            id: `ll-grip:${id}`,
            label: `Add ${state.cards[id]!.title} to grip`,
            effect: {
              op: "do" as const,
              action: {
                kind: "return_program" as const,
                cardId: id,
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
      });
      return { ok: true };
    }

    case "win_gebrselassie_host": {
      const targets = installedNonAiIcebreakers(state);
      if (targets.length === 0) {
        log(state, `Gebrselassie — no installed non-AI icebreaker.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return evalEffect(
          ctx,
          fx.do({
            kind: "resolve_gebrselassie_host",
            cardId: targets[0]!,
          }),
        );
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `geb:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_gebrselassie_host", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_gebrselassie_host": {
      const host = state.cards[action.cardId];
      const mod = state.cards[sourceId];
      if (!host || !mod) return { ok: true };
      hostCard(state, mod.id, action.cardId, { installed: true });
      log(state, `Gebrselassie — host on ${host.title}.`);
      return { ok: true };
    }

    case "host_on_installed_resource_as_condition": {
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `On the Lam — no installed resource to host on.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: resources.map((id) => ({
          id: `host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_self_as_condition",
            hostId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "host_continue": {
      const cardIds = (action.cardIds ?? []).filter((id) => state.cards[id]);
      if (cardIds.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          [state.runner.deck[i], state.runner.deck[j]] = [
            state.runner.deck[j]!,
            state.runner.deck[i]!,
          ];
        }
        log(state, `Customized Secretary — shuffle stack.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] =
        cardIds.map((id) => ({
          id: `host:${id}`,
          label: `Host ${state.cards[id]!.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "host_one", cardId: id }),
              fx.do({
                kind: "host_continue",
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        }));
      options.push({
        id: "done",
        label: "Done hosting",
        effect: fx.do({
          kind: "host_continue",
          cardIds: [],
          returnRest: cardIds,
        }),
      });
      // When declining further hosts, return remaining to stack then shuffle.
      const doneOpt = options[options.length - 1]!;
      doneOpt.effect = {
        op: "seq",
        effects: [
          fx.do({
            kind: "return_to_stack",
            cardIds,
          }),
          fx.do({
            kind: "host_continue",
            cardIds: [],
          }),
        ],
      };
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "host_one": {
      const cardId = action.cardId;
      if (!cardId || !source) return { ok: true };
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      // Remove from deck if still there
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      hostCard(state, card.id, sourceId, { installed: true });
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      log(state, `Customized Secretary hosts ${card.title}.`);
      return { ok: true };
    }

    case "host_on_connection": {
      const hosts = connectionResources(state);
      if (hosts.length === 0) {
        log(state, `MCA Informant — no installed connection resource.`);
        // Operation already played; linger in play-area as condition without host?
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: hosts.map((id) => ({
          id: `host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "host_resolve": {
      const hostId = action.cardId;
      if (!hostId || !source) return { ok: true };
      const host = state.cards[hostId];
      if (!host) return { ok: true };
      // Remove MCA from play-area / wherever
      removeCardFromCurrentZone(state, sourceId);
      hostCard(state, source.id, hostId, { installed: true });
      source.zone = `hosted:${hostId}`;
      source.faceup = true;
      source.mcaInformantCondition = true;
      source.additionalTagsWhileHosted = 1;
      host.mcaInformantHosted = true;
      // Host gains [click], 2¢: trash this resource.
      if (!host.paidAbilities) host.paidAbilities = [];
      host.paidAbilities.push({
        id: "mca-informant-host-trash",
        label: "[click], 2¢: Trash this resource",
        clickCost: 1,
        creditCost: 2,
        cost: { clicks: 1, credits: 2, trashSelf: true },
        windows: ["runner_action_paw"],
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        usableByRunnerOnSelfIce: true,
      });
      log(
        state,
        `MCA Informant — host on ${host.title} as condition (+1 tag; host trash ability).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyHostedCardKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "host_up_to_3_from_grip_facedown": {
      // Bookmark: "Host up to 3 cards from your grip" each time it is used;
      // the card has no limit on how many it hosts in all (CR 1.2.1).
      if (state.runner.hand.length === 0) {
        log(state, `${source.title} — no card in the grip to host.`);
        return { ok: true };
      }
      state.turn.uotBookmarkHostRemaining = 3;
      return offerBookmarkHostChoice(ctx);
    }

    case "uot_bookmark_host_one": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      if ((state.turn.uotBookmarkHostRemaining ?? 0) <= 0) return { ok: true };
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      hostCard(state, card.id, sourceId, { installed: true });
      card.faceup = false;
      card.zone = `hosted:${sourceId}`;
      state.turn.uotBookmarkHostRemaining =
        (state.turn.uotBookmarkHostRemaining ?? 1) - 1;
      log(state, `${source.title} hosts a card facedown from grip.`);
      if (
        (state.turn.uotBookmarkHostRemaining ?? 0) <= 0 ||
        state.runner.hand.length === 0
      ) {
        state.turn.uotBookmarkHostRemaining = undefined;
        return { ok: true };
      }
      return offerBookmarkHostChoice(ctx);
    }

    case "add_all_hosted_to_grip": {
      const hosted = [...(source.hostedCardIds ?? [])];
      unhostAllFrom(state, source.id);
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        // Set aside as the [trash] cost was paid (CR 9.5.5): leave set-aside.
        removeCardFromCurrentZone(state, id);
        unhostCard(state, card.id);
        card.faceup = true;
        card.zone = "runner:grip";
        state.runner.hand.push(id);
      }
      log(
        state,
        `${source.title} — add ${hosted.length} hosted card(s) to grip.`,
      );
      return { ok: true };
    }
    case "host_top_n_of_stack_facedown": {
      const n = action.amount;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck[0];
        if (!top) {
          log(state, `${source.title} — stack empty while hosting.`);
          break;
        }
        state.runner.deck.shift();
        const card = state.cards[top]!;
        hostCard(state, card.id, sourceId, { installed: true });
        card.faceup = false;
        card.zone = `hosted:${sourceId}`;
        log(state, `${source.title} hosts a card facedown from stack.`);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}

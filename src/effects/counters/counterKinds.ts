/**
 * Primitive kinds for placing, moving and removing counters and advancement
 * tokens. The kind registry (`applyCoreKinds`) dispatches here.
 */
import { type Effect } from "../ir/effect.js";
import { fx } from "../ir/fx.js";
import { type Primitive } from "../ir/primitive.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { ServerId } from "../../state/types/servers.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import {
  printsCanBeAdvanced,
  mayAdvanceInstalledCard,
} from "../../state/counters/advanceable.js";
import { CR } from "../../timing/labels.js";
import { chargeCard } from "../../state/keywordsAndCredits/keywords.js";
import {
  programUseRecurringCreditsAvailable,
  spendProgramUseRecurringCredits,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/runnerCredits.js";
import { canPayCost, payCost } from "../../state/keywordsAndCredits/costs.js";
import { dealDamage } from "../../state/damageAndPrevention/damage.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import type { EffectCtx, EvalResult } from "../eval.js";
import { getCardDef } from "../../cards/load.js";

export function serverIdForCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  const zone = state.cards[cardId]?.zone ?? "";
  if (!zone.startsWith("server:")) return null;
  const parts = zone.split(":");
  return (parts[1] as ServerId) ?? null;
}

function installedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) out.push(id);
  }
  return out;
}

function advanceableInstalled(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (c?.side === "corp" && c.canAdvance) out.push(id);
    }
  }
  return out;
}

function installedVirusProgramIds(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    return c?.type === "program" && (c.subtypes ?? []).includes("virus");
  });
}

function iceWithNoAdvancement(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const c = state.cards[id];
      if (!c) continue;
      if ((c.advancementCounters ?? 0) === 0) out.push(id);
    }
  }
  return out;
}

function faceupAgendaPoints(state: EffectCtx["state"]): number {
  // Printed: "agenda point on all installed faceup agendas" — installed
  // (in a server root) and faceup. Scored agendas are not installed.
  let n = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const c = state.cards[id];
      if (!c || c.type !== "agenda" || !c.faceup) continue;
      n += c.agendaPoints ?? 0;
    }
  }
  return n;
}

function installedRunnerCardsWithNoVirus(state: EffectCtx["state"]): string[] {
  // Printed Contaminate: any installed Runner card with no virus counters
  // (hosted cards remain installed — CR 1.2.1 / card text).
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    if (!c) return false;
    return (c.virusCounters ?? 0) === 0;
  });
}

export function installedCorpCards(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

export function canAdvance(state: EffectCtx["state"], cardId: string): boolean {
  const c = state.cards[cardId];
  if (!c) return false;
  if (c.type === "agenda") return true;
  if (c.canAdvance) return true;
  const def = c.defId ? getCardDef(c.defId) : undefined;
  return Boolean(def?.canAdvance);
}

export function applyCounterKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "add_or_remove_power": {
      const have = source?.powerCounters ?? 0;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "add",
          label: "Place 1 power counter",
          effect: fx.do({ kind: "add_power_counter", amount: 1 }),
        },
      ];
      if (have > 0) {
        options.push({
          id: "remove",
          label: "Remove 1 hosted power counter",
          effect: fx.do({ kind: "remove_power_counter", amount: 1 }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source?.title ?? "Puffer"} — add or remove 1 power counter.`,
      });
      return { ok: true };
    }

    case "place_advancement_on_root_of_this_server": {
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) {
        log(
          state,
          `${source?.title ?? "Calibration Testing"} — not in a server root.`,
        );
        return { ok: true };
      }
      const root = (state.servers[serverId]?.root ?? []).filter(
        (id) => id !== sourceId,
      );
      if (root.length === 0) {
        log(
          state,
          `${source?.title ?? "Calibration Testing"} — no other root cards.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: root.map((id) => ({
          id: `cal:${id}`,
          label: `Advance ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancement_on_card",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_on_card": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementCounters =
        (card.advancementCounters ?? 0) + (action.amount ?? 1);
      log(
        state,
        `Place ${action.amount ?? 1} advancement on ${card.title} → ${card.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "move_any_advancements_from_self_to_advanceable": {
      const aside = state.resolvingSetAsideAdvancements;
      const have =
        aside?.sourceId === sourceId
          ? aside.count
          : (source?.advancementCounters ?? 0);
      if (have <= 0) {
        log(
          state,
          `${source?.title ?? "Reconstruction Contract"} — no advancements.`,
        );
        return { ok: true };
      }
      const dests: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (!c) continue;
          // Printed: "a card that can be advanced" — agendas, plus cards
          // whose text makes them advanceable (instance canAdvance).
          if (c.type === "agenda" || printsCanBeAdvanced(c)) {
            dests.push(id);
          }
        }
      }
      if (dests.length === 0) {
        log(
          state,
          `${source?.title ?? "Reconstruction Contract"} — no advanceable cards.`,
        );
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const destId of dests) {
        for (let n = 1; n <= have; n++) {
          options.push({
            id: `rc:${destId}:${n}`,
            label: `Move ${n} advancement(s) to ${state.cards[destId]!.title}`,
            effect: fx.do({
              kind: "move_advancements_resolve",
              destId,
              amount: n,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "move_advancements_resolve": {
      if (!source) return { ok: true };
      const dest = state.cards[action.destId];
      if (!dest) return { ok: true };
      const aside = state.resolvingSetAsideAdvancements;
      const fromAside = aside?.sourceId === sourceId;
      const pool = fromAside ? aside.count : (source.advancementCounters ?? 0);
      const move = Math.min(action.amount, pool);
      log(
        state,
        `Interrupt window — ${move} advancement counter(s) onto ${dest.title} (CR ${CR.trashAbilityKeepsHosted.number}).`,
      );
      if (fromAside && aside) aside.count -= move;
      else
        source.advancementCounters = (source.advancementCounters ?? 0) - move;
      dest.advancementCounters = (dest.advancementCounters ?? 0) + move;
      log(
        state,
        `Reconstruction Contract — move ${move} advancement(s) to ${dest.title}.`,
      );
      return { ok: true };
    }

    case "may_place_advancement_on_self_meat": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: "Place 1 advancement on Reconstruction Contract",
            effect: fx.do({
              kind: "place_advancement_on_card",
              cardId: sourceId,
              amount: 1,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }
    case "helium3_place_up_to_2_power": {
      // "a card with at least 1 power counter on it": any card, either
      // side's, installed, scored or an identity (CR 1.2.1).
      const cands = Object.keys(state.cards).filter(
        (id) => (state.cards[id]!.powerCounters ?? 0) >= 1,
      );
      if (cands.length === 0) {
        log(state, `Helium-3 Deposit — no card with a power counter.`);
        return { ok: true };
      }
      const options: {
        id: string;
        label: string;
        effect: ReturnType<typeof fx.do>;
      }[] = [
        {
          id: "helium3-decline",
          label: "Decline",
          effect: fx.gainCredits("corp", 0),
        },
      ];
      for (const id of cands) {
        const title = state.cards[id]!.title;
        options.push({
          id: `helium3-1:${id}`,
          label: `Place 1 power on ${title}`,
          effect: fx.do({ kind: "helium3_place_n", cardId: id, amount: 1 }),
        });
        options.push({
          id: `helium3-2:${id}`,
          label: `Place 2 power on ${title}`,
          effect: fx.do({ kind: "helium3_place_n", cardId: id, amount: 2 }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "helium3_place_n": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount: number }).amount;
      for (let i = 0; i < amount; i++) {
        const r = chargeCard(state, cardId, sourceId);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "move_virus_counters": {
      const n = source?.virusCounters ?? 0;
      // Source may already be trashed; read counters before trash if possible.
      const viruses = state.runner.installed.filter((id) => {
        if (id === sourceId) return false;
        const c = state.cards[id];
        return c?.type === "program" && (c.subtypes ?? []).includes("virus");
      });
      if (viruses.length === 0 || n <= 0) {
        log(state, `Incubator — no virus counters to move or no target.`);
        return { ok: true };
      }
      if (
        !openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: viruses.map((id) => ({
            id: `incubator-move:${id}`,
            label: `Move ${n} virus to ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "move_incubator_apply",
              cardId: id,
              amount: n,
            }),
          })),
        })
      )
        return { ok: true };
      // Capture amount on turn so trash-self cost still works.
      state.turn.incubatorMoveAmount = n;
      return { ok: true };
    }
    case "move_incubator_apply": {
      const cardId = (action as { cardId: string }).cardId;
      const amount =
        (action as { amount?: number }).amount ??
        state.turn.incubatorMoveAmount ??
        0;
      const target = state.cards[cardId];
      if (target) {
        target.virusCounters = (target.virusCounters ?? 0) + amount;
        log(
          state,
          `Incubator — move ${amount} virus counter(s) to ${target.title} → ${target.virusCounters}.`,
        );
      }
      state.turn.incubatorMoveAmount = undefined;
      return { ok: true };
    }
    case "turn_begin": {
      const card = state.cards[sourceId];
      if ((card?.powerCounters ?? 0) <= 0) return { ok: true };
      card!.powerCounters = (card!.powerCounters ?? 0) - 1;
      log(
        state,
        `Rex Campaign — remove 1 power counter → ${card!.powerCounters}.`,
      );
      if ((card!.powerCounters ?? 0) <= 0) {
        return applyCounterKinds(ctx, { kind: "rex_campaign_when_empty" });
      }
      return { ok: true };
    }
    case "rex_campaign_when_empty": {
      const trashTail = fx.do({ kind: "trash_self" });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "remove-bp",
            label: "Remove 1 bad publicity",
            effect: fx.seq(
              fx.do({ kind: "remove_bad_publicity", amount: 1 }),
              trashTail,
            ),
          },
          {
            id: "gain-5",
            label: "Gain 5[credit]",
            effect: fx.seq(
              fx.do({ kind: "gain_credits", side: "corp", amount: 5 }),
              trashTail,
            ),
          },
        ],
        logLine: `Rex Campaign — empty; choose benefit then trash.`,
      });
      return { ok: true };
    }

    case "spend_credits_place_power_counters": {
      const title = source?.title ?? sourceId;
      // A program's own ability: credits for using programs may pay it
      // (CR 1.10.3c: Cyberfeeder pays for Atman's first ability; Mammon).
      const useRecurring =
        action.includeProgramRecurring ?? source?.type === "program";
      const recurring = useRecurring
        ? programUseRecurringCreditsAvailable(state)
        : 0;
      const max = Math.max(0, state.runner.credits) + recurring;
      if (typeof action.amount === "number") {
        const n = Math.min(action.amount, max);
        if (n <= 0 || !source) return { ok: true };
        const fromRecurring = useRecurring
          ? spendProgramUseRecurringCredits(state, n)
          : 0;
        subtractRunnerCreditPool(state, n - fromRecurring);
        source.powerCounters = (source.powerCounters ?? 0) + n;
        log(state, `${title} — spend ${n}¢ for ${n} power counter(s).`);
        return { ok: true };
      }
      if (max <= 0 || !source) {
        log(state, `${title} — no credits to spend.`);
        return { ok: true };
      }
      // "You may spend any number": 0 is a choice (CR 9.6.9c).
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 1; n <= max; n++) {
        options.push({
          id: `spend-power:${n}`,
          label: `Spend ${n}¢ → place ${n} power`,
          effect: fx.do({
            kind: "spend_credits_place_power_counters",
            amount: n,
            includeProgramRecurring: useRecurring,
          }),
        });
      }
      options.push({
        id: "spend-power:0",
        label: "Spend nothing",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "place_advancements_on_forfeit": {
      const ap = action.agendaPoints ?? state.lastForfeitedAgendaPoints ?? 0;
      const x = ap + 1;
      if (x <= 0) return { ok: true };
      const targets = Object.values(state.cards).filter((c) => {
        if (c.side !== "corp") return false;
        // Installed Corp cards live at server:<id>:ice|root (see corpInstall);
        // Jemison places the counters on a card that can be advanced (CR 1.18.3).
        if (!c.zone.startsWith("server:")) return false;
        return mayAdvanceInstalledCard(c);
      });
      if (targets.length === 0) {
        log(state, `Jemison — no installed card for advancements.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((c) => ({
          id: `adv:${c.id}`,
          label: `Place ${x} advancement(s) on ${c.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: c.id,
            amount: x,
          }),
        })),
      });
      return { ok: true };
    }
    case "firmware_place_advancement_on_advanceable_ice": {
      const cands = installedIceIds(state).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (cands.length === 0) {
        log(state, `Firmware Updates — no advanceable ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `fw:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "move_constellation_advancement_between_ice": {
      const from = installedIceIds(state).filter(
        (id) => (state.cards[id]?.advancementCounters ?? 0) > 0,
      );
      const to = installedIceIds(state).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (from.length === 0 || to.length === 0) {
        log(state, `Constellation Protocol — no valid ice.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const a of from) {
        for (const b of to) {
          if (a === b) continue;
          opts.push({
            id: `const:${a}:${b}`,
            label: `Move advancement ${state.cards[a]!.title} → ${state.cards[b]!.title}`,
            effect: fx.do({
              kind: "move_constellation_apply",
              fromId: a,
              toId: b,
            }),
          });
        }
      }
      if (opts.length === 0) {
        log(state, `Constellation Protocol — no distinct targets.`);
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts });
      return { ok: true };
    }

    case "move_constellation_apply": {
      const fromId = (action as { fromId: string }).fromId;
      const toId = (action as { toId: string }).toId;
      const from = state.cards[fromId];
      const to = state.cards[toId];
      if (!from || !to || (from.advancementCounters ?? 0) < 1) {
        return { ok: false, error: "Constellation move invalid.", cites: [] };
      }
      from.advancementCounters = (from.advancementCounters ?? 0) - 1;
      to.advancementCounters = (to.advancementCounters ?? 0) + 1;
      log(
        state,
        `Constellation Protocol — move advancement ${from.title} → ${to.title}.`,
      );
      return { ok: true };
    }

    case "place_advancement_on_advanceable_installed": {
      const cands = advanceableInstalled(state);
      if (cands.length === 0) {
        log(state, `Space Camp — no advanceable installed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `sc:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_on_advanceable_ice_protecting_this_server": {
      const sid = serverIdForCard(state, sourceId);
      if (!sid) return { ok: true };
      const cands = (state.servers[sid]?.ice ?? []).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (cands.length === 0) {
        log(state, `Builder — no advanceable ice on this server.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `badv:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "stim_dealer_turn_begin": {
      const power = source?.powerCounters ?? 0;
      if (power >= 2) {
        source!.powerCounters = 0;
        dealDamage(state, "core", 1, sourceId, { cannotPrevent: true });
        log(state, `Stim Dealer — remove power; suffer 1 unpreventable core.`);
      } else {
        source!.powerCounters = power + 1;
        state.runner.clicks += 1;
        log(state, `Stim Dealer — place power; gain [click].`);
      }
      return { ok: true };
    }

    case "move_counter": {
      if ((source?.virusCounters ?? 0) < 1) {
        log(state, `Virus Breeding Ground — no virus counters.`);
        return { ok: true };
      }
      const cands = state.runner.installed.filter(
        (id) => id !== sourceId && (state.cards[id]?.virusCounters ?? 0) >= 1,
      );
      if (cands.length === 0) {
        log(state, `Virus Breeding Ground — no other card with virus.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `vbg:${id}`,
          label: `Move virus to ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "move_vbg_apply", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "move_vbg_apply": {
      const cardId = (action as { cardId: string }).cardId;
      if ((source?.virusCounters ?? 0) < 1) {
        return { ok: false, error: "No virus to move.", cites: [] };
      }
      source!.virusCounters = (source!.virusCounters ?? 0) - 1;
      const t = state.cards[cardId]!;
      t.virusCounters = (t.virusCounters ?? 0) + 1;
      log(state, `Virus Breeding Ground — move virus to ${t.title}.`);
      return { ok: true };
    }
    case "move_friday_chip_virus": {
      const have = source?.virusCounters ?? 0;
      if (have < 1) {
        log(state, `${source?.title ?? "Friday Chip"} — no virus counters.`);
        return { ok: true };
      }
      const viruses = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "program" &&
          (c.subtypes ?? []).includes("virus") &&
          id !== sourceId
        );
      });
      if (viruses.length === 0) {
        log(state, `${source?.title ?? "Friday Chip"} — no virus programs.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: viruses.map((id) => ({
          id: `friday-move:${id}`,
          label: `Move virus to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_friday_chip_virus_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "move_friday_chip_virus_resolve": {
      const destId = (action as { cardId: string }).cardId;
      const src = state.cards[sourceId];
      const dest = state.cards[destId];
      if (!src || !dest || (src.virusCounters ?? 0) < 1) return { ok: true };
      src.virusCounters = (src.virusCounters ?? 0) - 1;
      dest.virusCounters = (dest.virusCounters ?? 0) + 1;
      log(
        state,
        `Friday Chip — move 1 virus to ${dest.title} (${src.virusCounters} left).`,
      );
      return { ok: true };
    }

    case "cotc_reverse_infection_purge": {
      // Count viruses before purge, then purge, then mill stack.
      let before = 0;
      for (const card of Object.values(state.cards)) {
        before += card.virusCounters ?? 0;
      }
      // Delegate purge via nested — set flag and use eval's purge.
      // Inline purge:
      for (const card of Object.values(state.cards)) {
        if ((card.virusCounters ?? 0) > 0) {
          card.virusCounters = 0;
        }
      }
      state.turn.lastVirusCountersPurged = before;
      const mill = Math.floor(before / 3);
      for (let i = 0; i < mill; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        trashCard(state, top);
      }
      log(
        state,
        `Reverse Infection — purge ${before} virus; trash ${mill} from stack.`,
      );
      return { ok: true };
    }

    case "pay_up_to_place_advancements": {
      const max = Math.max(0, action.max ?? 2);
      const credits = state.corp.credits;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c) continue;
          if (c.type === "agenda" || printsCanBeAdvanced(c)) targets.push(id);
        }
      }
      if (targets.length === 0 || credits <= 0 || max <= 0) {
        log(state, `Herald — nothing to advance.`);
        return { ok: true };
      }
      const maxPay = Math.min(max, credits);
      for (let n = 1; n <= maxPay; n++) {
        for (const cardId of targets) {
          options.push({
            id: `herald-adv:${n}:${cardId}`,
            label: `Pay ${n}¢: place ${n} advancement on ${state.cards[cardId]!.title}`,
            effect: fx.do({
              kind: "pay_place_advancements_resolve",
              amount: n,
              cardId,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "pay_place_advancements_resolve": {
      const n = action.amount ?? 0;
      const cardId = action.cardId;
      if (!cardId || n <= 0 || state.corp.credits < n) {
        log(state, `Herald — cannot pay.`);
        return { ok: true };
      }
      state.corp.credits -= n;
      const card = state.cards[cardId]!;
      card.advancementCounters = (card.advancementCounters ?? 0) + n;
      log(
        state,
        `Herald — pay ${n}¢ → place ${n} advancement on ${card.title}.`,
      );
      return { ok: true };
    }

    case "may_spend_to_place_power": {
      const maxGain = action.amount ?? 0;
      if (maxGain <= 0) return { ok: true };
      const maxSpend = Math.min(2, state.corp.credits, maxGain);
      if (maxSpend <= 0) {
        log(state, `NASX — cannot spend to place power.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (let n = 1; n <= maxSpend; n++) {
        options.push({
          id: `nasx-power:${n}`,
          label: `Spend ${n}¢: place ${n} power on NASX`,
          effect: fx.do({
            kind: "spend_place_power_resolve",
            amount: n,
            nasxId: sourceId,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "spend_place_power_resolve": {
      const n = action.amount ?? 0;
      const nasxId = action.nasxId ?? sourceId;
      const nasx = state.cards[nasxId];
      if (!nasx || n <= 0 || state.corp.credits < n) return { ok: true };
      state.corp.credits -= n;
      nasx.powerCounters = (nasx.powerCounters ?? 0) + n;
      log(state, `NASX — spend ${n}¢ → ${nasx.powerCounters} power.`);
      return { ok: true };
    }
    case "place_x_counters": {
      // The printed card places X counters for X paid, with no cap beyond
      // what the Runner can pay (CR 1.2.1: card text wins).
      const max = state.runner.credits;
      const amounts = Array.from({ length: max + 1 }, (_, i) => i);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: amounts.map((x) => ({
          id: `angel-x:${x}`,
          label: `Place ${x} power counter(s) (pay ${x}¢)`,
          effect: fx.do({ kind: "place_x_resolve", amount: x }),
        })),
      });
      return { ok: true };
    }
    case "place_x_resolve": {
      const amount = (action as { amount: number }).amount;
      if (!canPayCost(state, "runner", { credits: amount })) {
        return {
          ok: false,
          error: "Cannot pay for Angel Arena counters.",
          cites: [],
        };
      }
      payCost(state, "runner", { credits: amount }, "angel-arena", source);
      source!.powerCounters = (source!.powerCounters ?? 0) + amount;
      log(state, `Angel Arena — place ${amount} power counter(s).`);
      return { ok: true };
    }

    case "tdatd_knobkierie_place_virus": {
      const viruses = installedVirusProgramIds(state);
      if (viruses.length === 0) {
        log(state, `Knobkierie — no installed virus program.`);
        return { ok: true };
      }
      if (viruses.length === 1) {
        const c = state.cards[viruses[0]!]!;
        c.virusCounters = (c.virusCounters ?? 0) + 1;
        log(
          state,
          `Knobkierie — place 1 virus on ${c.title} → ${c.virusCounters}.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: viruses.map((id) => ({
          id: `knob:${id}`,
          label: `Place 1 virus on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "resolve_knobkierie_place_virus",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_knobkierie_place_virus": {
      const cardId = (action as { cardId: string }).cardId;
      const c = state.cards[cardId];
      if (!c) return { ok: true };
      c.virusCounters = (c.virusCounters ?? 0) + 1;
      log(
        state,
        `Knobkierie — place 1 virus on ${c.title} → ${c.virusCounters}.`,
      );
      return { ok: true };
    }

    case "advance_sso_ice": {
      const targets = iceWithNoAdvancement(state);
      const ap = faceupAgendaPoints(state);
      if (targets.length === 0 || ap <= 0) {
        log(
          state,
          `SSO Industries — no eligible ice or no faceup agenda points.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sso:${id}`,
          label: `Place ${ap} advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "advance_sso_resolve",
            cardId: id,
            amount: ap,
          }),
        })),
      });
      return { ok: true };
    }

    case "advance_sso_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount?: number }).amount ?? 0;
      const c = state.cards[cardId];
      if (!c) return { ok: true };
      c.advancementCounters = (c.advancementCounters ?? 0) + amount;
      log(
        state,
        `SSO Industries — place ${amount} advancement on ${c.title} → ${c.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "tdatd_oduduwa_encounter": {
      if (source) {
        source.advancementCounters = (source.advancementCounters ?? 0) + 1;
        log(
          state,
          `Oduduwa — place 1 advancement → ${source.advancementCounters}.`,
        );
      }
      const x = source?.advancementCounters ?? 0;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId) continue;
          others.push(id);
        }
      }
      if (others.length === 0 || x <= 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...others.map((id) => ({
            id: `oduduwa:${id}`,
            label: `Place ${x} advancement on ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "tdatd_oduduwa_place",
              cardId: id,
              amount: x,
            }),
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({
              kind: "gain_credits",
              side: "corp",
              amount: 0,
            }),
          },
        ],
      });
      return { ok: true };
    }

    case "tdatd_oduduwa_place": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount?: number }).amount ?? 0;
      const c = state.cards[cardId];
      if (!c) return { ok: true };
      c.advancementCounters = (c.advancementCounters ?? 0) + amount;
      log(
        state,
        `Oduduwa — place ${amount} advancement on ${c.title} → ${c.advancementCounters}.`,
      );
      return { ok: true };
    }
    case "win_contaminate": {
      const targets = installedRunnerCardsWithNoVirus(state);
      if (targets.length === 0) {
        log(state, `Contaminate — no installed Runner card without virus.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const c = state.cards[targets[0]!]!;
        c.virusCounters = (c.virusCounters ?? 0) + 3;
        log(state, `Contaminate — place 3 virus on ${c.title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `contaminate:${id}`,
          label: `Place 3 virus on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_contaminate", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_contaminate": {
      const c = state.cards[action.cardId];
      if (!c) return { ok: true };
      c.virusCounters = (c.virusCounters ?? 0) + 3;
      log(state, `Contaminate — place 3 virus on ${c.title}.`);
      return { ok: true };
    }

    case "place_advancement_on_self": {
      if (!source) return { ok: true };
      const amount = action.amount ?? 1;
      source.advancementCounters = (source.advancementCounters ?? 0) + amount;
      log(
        state,
        `Masvingo — place ${amount} advancement → ${source.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "bf_place_advancement_on_self": {
      if (!source) return { ok: true };
      const amount = action.amount ?? 1;
      source.advancementCounters = (source.advancementCounters ?? 0) + amount;
      log(
        state,
        `${source.title} — place ${amount} advancement → ${source.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "move_mumbad_construction_advancement_to_faceup": {
      if (!source || (source.advancementCounters ?? 0) < 1) {
        log(state, `Mumbad Construction Co. — no advancement to move.`);
        return { ok: true };
      }
      const faceup: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && id !== sourceId && (c.faceup || c.rezzed)) {
            faceup.push(id);
          }
        }
      }
      for (const id of state.corp.scoreArea) {
        if (state.cards[id]) faceup.push(id);
      }
      if (faceup.length === 0) {
        log(state, `Mumbad Construction Co. — no faceup destination.`);
        return { ok: true };
      }
      if (faceup.length === 1) {
        const id = faceup[0]!;
        source.advancementCounters = (source.advancementCounters ?? 0) - 1;
        const dest = state.cards[id]!;
        dest.advancementCounters = (dest.advancementCounters ?? 0) + 1;
        log(
          state,
          `Mumbad Construction Co. — move 1 advancement to ${dest.title}.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: faceup.map((id) => ({
          id: `mcc-move:${id}`,
          label: `Move advancement to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_mumbad_construction_advancement_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "move_mumbad_construction_advancement_resolve": {
      if (!source || (source.advancementCounters ?? 0) < 1) return { ok: true };
      const id = action.cardId;
      const dest = state.cards[id];
      if (!dest) return { ok: true };
      source.advancementCounters = (source.advancementCounters ?? 0) - 1;
      dest.advancementCounters = (dest.advancementCounters ?? 0) + 1;
      log(
        state,
        `Mumbad Construction Co. — move 1 advancement to ${dest.title}.`,
      );
      return { ok: true };
    }

    case "place_advancement_cannot_score_until_next_turn": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `PAD Factory — no advanceable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `pad-adv:${id}`,
          label: `Advance ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancement_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_resolve": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card) return { ok: true };
      card.advancementCounters = (card.advancementCounters ?? 0) + 1;
      // "You cannot score that card until your next turn begins": scoring
      // only, read by the score action and its legality (CR 1.2.2); the
      // list clears when the Corp's next turn begins.
      state.bfCannotScoreUntilNextCorpTurn = [
        ...(state.bfCannotScoreUntilNextCorpTurn ?? []),
        id,
      ];
      log(
        state,
        `PAD Factory — place 1 advancement on ${card.title}; cannot score until next Corp turn.`,
      );
      return { ok: true };
    }

    case "jinteki_biotech_place_4_advancement": {
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          // Agendas can always be advanced (CR 1.18.3); other cards only
          // when they say so — defs do not set canAdvance on agendas.
          if (c?.side === "corp" && mayAdvanceInstalledCard(c)) cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Jinteki Biotech (Warehouse) — no advanceable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `jb-adv:${id}`,
          label: `Place 4 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 4,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_agenda_counter": {
      const scored = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (scored.length === 0) {
        log(state, `Genetic Resequencing — no scored agenda.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: scored.map((id) => ({
          id: `gr-counter:${id}`,
          label: `Place 1 agenda counter on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "add_counter",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "add_counter": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.scoreArea.includes(cardId)) {
        return {
          ok: false,
          error: "Genetic Resequencing target not in score area.",
          cites: [],
        };
      }
      card.agendaCounters = (card.agendaCounters ?? 0) + 1;
      log(
        state,
        `Genetic Resequencing — place 1 agenda counter on ${card.title} → ${card.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "tennin_place_advancement_on_installed": {
      // Printed: place 1 advancement counter on an installed card (includes
      // unrezzed; CR 1.2.1).
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c?.side === "corp") cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Tennin — no installed Corp cards.`);
        return { ok: true };
      }
      // "You may place": the Corp may decline (CR 9.6.9c).
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...cands.map((id) => ({
            id: `tennin:${id}`,
            label: `Place 1 advancement on ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "place_advancements_on",
              cardId: id,
              amount: 1,
            }),
          })),
          {
            id: "decline",
            label: "Place nothing",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      });
      return { ok: true };
    }

    case "tlm_puppet_master_place_advancement": {
      const targets: string[] = [];
      for (const sid of Object.keys(state.servers) as ServerId[]) {
        const server = state.servers[sid];
        for (const id of [...server.root, ...server.ice]) {
          const card = state.cards[id];
          if (!card) continue;
          if (card.side === "corp" && printsCanBeAdvanced(card)) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `Puppet Master — no card that can be advanced.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((cardId) => ({
            id: `adv:${cardId}`,
            label: `Place 1 advancement on ${state.cards[cardId]!.title}`,
            effect: fx.do({
              kind: "resolve_puppet_master_place",
              cardId,
            }),
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      });
      return { ok: true };
    }

    case "resolve_puppet_master_place": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementCounters = (card.advancementCounters ?? 0) + 1;
      log(
        state,
        `Puppet Master — place 1 advancement on ${card.title} → ${card.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "place_one_then_choose": {
      const first = action.cardId;
      if (first && state.cards[first]) {
        state.cards[first]!.advancementCounters =
          (state.cards[first]!.advancementCounters ?? 0) + 1;
        log(
          state,
          `Audacity — place 1 advancement on ${state.cards[first]!.title}.`,
        );
      }
      const advanceable = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: advanceable.map((id) => ({
          id: `adv:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "move_all_advancements": {
      const withAdv = installedCorpCards(state).filter(
        (id) => (state.cards[id]?.advancementCounters ?? 0) > 0,
      );
      let total = 0;
      for (const id of withAdv) {
        total += state.cards[id]!.advancementCounters ?? 0;
        state.cards[id]!.advancementCounters = 0;
      }
      if (total === 0) {
        log(state, `Red Planet Couriers — no advancement counters.`);
        return { ok: true };
      }
      const targets = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (targets.length === 0) {
        log(
          state,
          `Red Planet Couriers — no advanceable target; counters lost.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `move:${id}`,
          label: `Move ${total} advancements onto ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: total,
          }),
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyCounterKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "place_up_to_n_advancements_on_advanceable_installed": {
      const max = action.max ?? 2;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (c.type === "agenda" || printsCanBeAdvanced(c)) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no advanceable installed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.flatMap((cardId) =>
            Array.from({ length: max }, (_, i) => {
              const amount = i + 1;
              return {
                id: `oh-adv:${cardId}:${amount}`,
                label: `Place ${amount} advancement(s) on ${state.cards[cardId]!.title}`,
                effect: {
                  op: "do" as const,
                  action: {
                    kind: "oh_place_advancements_on" as const,
                    cardId,
                    amount,
                  },
                },
              };
            }),
          ),
          {
            id: "oh-adv-decline",
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
        ],
      });
      return { ok: true };
    }

    case "oh_place_advancements_on": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementCounters =
        (card.advancementCounters ?? 0) + action.amount;
      log(
        state,
        `${source.title} — place ${action.amount} advancement(s) on ${card.title} → ${card.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "pay_place_advancement": {
      if (state.corp.credits < 1) {
        log(state, `Early Premiere — insufficient credits.`);
        return { ok: true };
      }
      const targets: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c) continue;
          if (c.type === "agenda" || printsCanBeAdvanced(c)) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Early Premiere — no advanceable remote root card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((cardId) => ({
          id: `early-prem:${cardId}`,
          label: `Pay 1¢: advance ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "resolve_early_premiere" as const,
              cardId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "resolve_early_premiere": {
      if (state.corp.credits < 1) return { ok: true };
      state.corp.credits -= 1;
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementCounters = (card.advancementCounters ?? 0) + 1;
      log(
        state,
        `Early Premiere — pay 1¢, place advancement on ${card.title} → ${card.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "place_advancement_on_another_on_advance": {
      const amount = action.amount;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (c.type === "agenda" || printsCanBeAdvanced(c)) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Hollywood Renovation — no other advanceable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((cardId) => ({
            id: `hr-adv:${cardId}`,
            label: `Place ${amount} advancement(s) on ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "oh_place_advancements_on" as const,
                cardId,
                amount,
              },
            },
          })),
          {
            id: "hr-decline",
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
        ],
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

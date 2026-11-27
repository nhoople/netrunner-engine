/**
 * Primitive kinds for damage, and preventing damage and other events. The kind
 * registry (`applyCoreKinds`) dispatches here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import { preventPendingExpose } from "../../state/visibility/expose.js";
import { resumeExposeUpTo } from "../visibility/exposeAndReveal.js";
import {
  applyPrimitive,
  evalEffect,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { preventPendingInstalledTrash } from "../../state/hostingAndTrash/trashPrevent.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { catalogCardNames } from "../visibility/cardNames.js";
import {
  dealDamage,
  removePendingDamageEntirely,
  resolveRibsPick,
} from "../../state/damageAndPrevention/damage.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import { fx } from "../ir/fx.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { random } from "../../state/rng.js";
import { CR } from "../../timing/labels.js";
import { rezzedIceIds } from "../rez/rezKinds.js";
import {
  emptyRunnerCreditPool,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/runnerCredits.js";
import type { ServerId } from "../../state/types.js";
import { memoryLimit, usedMemory } from "../../state/turnAndActions/turn.js";

function serverIdForCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  const zone = state.cards[cardId]?.zone ?? "";
  if (!zone.startsWith("server:")) return null;
  const parts = zone.split(":");
  return (parts[1] as ServerId) ?? null;
}

export function countRezzedNextIce(state: EffectCtx["state"]): number {
  let n = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const c = state.cards[id];
      if (c?.rezzed && (c.subtypes ?? []).includes("next")) n += 1;
    }
  }
  return n;
}

export function applyDamageAndPreventionKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "prevent_pending_subroutine_break": {
      const pending = state.pendingSubroutineBreak;
      if (!pending) {
        log(state, `${source.title} — no pending subroutine break to prevent.`);
        return { ok: true };
      }
      pending.prevented = true;
      log(state, `${source.title} — prevent 1 subroutine from being broken.`);
      return { ok: true };
    }

    case "prevent_pending_end_the_run_from_corp_card_ability": {
      const pending = state.pendingEndTheRun;
      if (!pending?.fromCorpCardAbility) {
        log(
          state,
          `${source.title} — no pending Corp-card-ability end the run to prevent.`,
        );
        return { ok: true };
      }
      state.pendingEndTheRun = null;
      log(
        state,
        `${source.title} — prevent Corp card ability from ending the run.`,
      );
      return { ok: true };
    }

    case "prevent_pending_expose": {
      preventPendingExpose(state, action.amount);
      resumeExposeUpTo(state);
      return { ok: true };
    }

    case "prevent_pending_installed_trash": {
      preventPendingInstalledTrash(state);
      return { ok: true };
    }

    case "prevent_current_ice_on_encounter": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `prevent_current_ice_on_encounter — no encounter.`);
        return { ok: true };
      }
      enc.onEncounterPrevented = true;
      enc.onEncounterPending = false;
      log(state, `Prevent when encountered ability on current ice.`);
      return { ok: true };
    }

    case "name_net_damage_loop": {
      // Complete Image: "Choose a card name" (CR 1.2.1). Any Runner card name
      // may be named; the list comes from the catalog, not from the Runner's
      // grip and stack, which the Corp may not see (CR 10.2.2a, 10.2.2b).
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: catalogCardNames((def) => def.side === "runner").map(
          (title) => ({
            id: `ci-name:${title}`,
            label: `Name ${title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "net_named" as const,
                title,
              },
            },
          }),
        ),
        logLine: `${source.title} — choose a card name for net damage loop.`,
      });
      return { ok: true };
    }

    case "net_named": {
      const title = action.title;
      const before = new Set(state.runner.hand);
      const namedInGrip = state.runner.hand.filter(
        (id) => state.cards[id]?.title === title,
      );
      dealDamage(state, "net", 1, sourceId);
      // If interrupt pending, stash continuation to resume loop.
      if (state.pendingDamage) {
        state.pendingEffectContinuation = {
          sourceId,
          effects: [
            {
              op: "do" as const,
              action: { kind: "net_named" as const, title },
            },
          ],
        };
        // Mark so after damage resolves we check trash — use a simpler immediate path:
        // clear continuation; instead check after non-interactive damage below.
        state.pendingEffectContinuation = null;
        log(
          state,
          `${source.title} — net damage pending; Complete Image loop pauses (fail-closed until accepted).`,
        );
        return { ok: true };
      }
      // Non-interactive: check whether a named card left grip into heap.
      const trashedNamed = [...before].some(
        (id) =>
          state.cards[id]?.title === title &&
          state.runner.discardPile.includes(id) &&
          !state.runner.hand.includes(id),
      );
      if (
        trashedNamed ||
        namedInGrip.some((id) => state.runner.discardPile.includes(id))
      ) {
        // "Repeat this process": choose a card name again, then 1 net damage.
        log(
          state,
          `${source.title} — trashed ${title}; repeat Complete Image.`,
        );
        return applyPrimitive(ctx, { kind: "name_net_damage_loop" });
      }
      log(state, `${source.title} — no ${title} trashed; Complete Image ends.`);
      return { ok: true };
    }
    case "self_destruct_ability": {
      // Printed: only during a run on this server. After paying the [trash]
      // cost the upgrade is in Archives, so use the run's attacked server
      // (CR 1.2.1).
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `Self-destruct — only during a run on this server.`);
        return { ok: true };
      }
      const installedOn = serverIdForCard(state, sourceId);
      if (installedOn && installedOn !== sid) {
        log(state, `Self-destruct — only during a run on this server.`);
        return { ok: true };
      }
      const server = state.servers[sid];
      if (!server) return { ok: true };
      const toTrash = [...server.root, ...server.ice].filter(
        (id) => id !== sourceId,
      );
      // "Trace[X], where X is equal to the number of cards trashed": the
      // cards this instruction trashes. Self-destruct was trashed before, as
      // the cost, so it does not count (CR 1.2.1).
      let trashed = 0;
      for (const id of toTrash) {
        const card = state.cards[id];
        if (!card) continue;
        trashCard(state, id, { by: "corp" });
        if (card.zone !== "corp:archives") continue;
        trashed += 1;
        log(state, `Self-destruct — trash ${card.title}.`);
      }
      const r = autoResolveTrace(
        state,
        sourceId,
        trashed,
        fx.do({ kind: "trace_self_destruct_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "leverage": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "take-bp",
            label: "Take 2 bad publicity",
            effect: fx.do({ kind: "give_bad_publicity", amount: 2 }),
          },
          {
            id: "decline",
            label: "Decline — Runner prevents all damage until their next turn",
            effect: fx.do({ kind: "leverage_shield_runner" }),
          },
        ],
        logLine: `Leverage — Corp may take 2 bad publicity.`,
      });
      return { ok: true };
    }
    case "leverage_shield_runner": {
      state.turn.leveragePreventRunnerDamage = true;
      log(
        state,
        `Leverage — Runner prevents all damage until next turn begins.`,
      );
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
      openPendingChoose(state, { sourceId, chooser: "corp", options });
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
        const idx = Math.floor(random(state) * grip.length);
        const id = grip.splice(idx, 1)[0]!;
        state.runner.hand = state.runner.hand.filter((x) => x !== id);
        state.runner.deck.push(id);
        state.cards[id]!.zone = "runner:stack";
      }
      log(state, `Brain Rewiring — Runner bottoms ${take} at random.`);
      return evalEffect(ctx, fx.draw("runner", 1));
    }

    case "core_or_jack_out": {
      openPendingChoose(state, {
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
            effect: fx.do({ kind: "jack_out" }),
          },
        ],
      });
      return { ok: true };
    }
    case "prevent_all_but_n_pending_damage": {
      const leave = action.leave ?? 1;
      const pending = state.pendingDamage;
      if (!pending || pending.type !== "net" || pending.remaining <= leave) {
        log(
          state,
          `Prevent all but ${leave} is relevant only when net damage is ${leave + 1} or more (CR ${CR.preventAllButOne.number}).`,
        );
        return { ok: true };
      }
      pending.remaining = leave;
      log(
        state,
        `Expected ${pending.type} damage is set to ${leave} (CR ${CR.preventAllButOne.number}).`,
      );
      return { ok: true };
    }

    case "may_core_if_rezzed_next_ice": {
      const hasNext = rezzedIceIds(state).some((id) =>
        (state.cards[id]?.subtypes ?? []).includes("next"),
      );
      if (!hasNext) {
        log(state, `NEXT Wave 2 — no rezzed NEXT ice.`);
        return { ok: true };
      }
      return evalEffect(ctx, {
        op: "choose",
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: "Do 1 core damage",
            effect: fx.do({ kind: "core_damage", amount: 1 }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
    }

    case "checkpoint_schedule_meat_on_successful_run": {
      // Checkpoint: "do 3 meat damage when this run becomes successful", a
      // delayed ability that outlives the subroutine (CR 9.6.13c).
      const amount = (action as { amount?: number }).amount ?? 3;
      if (state.run) {
        state.run.delayedMeatDamageOnSuccess = [
          ...(state.run.delayedMeatDamageOnSuccess ?? []),
          { sourceId, amount },
        ];
        log(
          state,
          `${source?.title ?? sourceId} — ${amount} meat damage when this run becomes successful.`,
        );
      }
      return { ok: true };
    }

    case "prevent_all_damage": {
      removePendingDamageEntirely(state, "Sacrificial Clone");
      // Trash all installed hardware, non-virtual resources, all grip; lose credits; remove tags.
      for (const id of [...state.runner.installed]) {
        const c = state.cards[id];
        if (!c) continue;
        if (c.type === "hardware") {
          trashCard(state, id);
        } else if (
          c.type === "resource" &&
          !(c.subtypes ?? []).includes("virtual")
        ) {
          trashCard(state, id);
        }
      }
      for (const id of [...state.runner.hand]) {
        trashCard(state, id);
      }
      emptyRunnerCreditPool(state);
      if (state.runner.tags > 0) {
        const removed = state.runner.tags;
        state.runner.tags = 0;
        log(state, `Sacrificial Clone — remove ${removed} tag(s).`);
      }
      return { ok: true };
    }

    case "cotc_no_one_home": {
      const mode = (action as { mode?: string }).mode ?? "tags";
      state.turn.cotcNoOneHomeUsed = true;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "noh-trace",
            label: "Trace[0]",
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: 0,
                onSuccess: fx.do({
                  kind: "gain_credits",
                  side: "corp",
                  amount: 0,
                }),
                onFailure: fx.do({
                  kind: "prevent_no_one_home",
                  mode,
                }),
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "prevent_no_one_home": {
      const mode = (action as { mode?: string }).mode ?? "tags";
      if (mode === "tags") {
        if (state.pendingTags) state.pendingTags.remaining = 0;
        log(state, `No One Home — prevent all tags.`);
      } else {
        removePendingDamageEntirely(state, "No One Home");
      }
      return { ok: true };
    }
    case "prevent_x_damage": {
      const pending = state.pendingDamage?.remaining ?? 0;
      if (pending <= 0) {
        log(state, `Recon Drone — no pending damage.`);
        return { ok: true };
      }
      const maxX = Math.min(pending, state.runner.credits);
      if (maxX <= 0) {
        log(state, `Recon Drone — no credits to spend.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `recon-drone-x:${x}`,
          label: `Spend ${x}¢: prevent ${x} damage`,
          effect: fx.do({
            kind: "prevent_x_damage_resolve",
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

    case "prevent_x_damage_resolve": {
      const x = action.amount ?? 0;
      if (x <= 0 || state.runner.credits < x) {
        log(state, `Recon Drone — cannot afford ${x}¢.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, x);
      return evalEffect(
        ctx,
        fx.do({ kind: "prevent_pending_damage", amount: x }),
      );
    }

    case "prevent_tracker_run_chosen_first_sub": {
      const serverId = source.chosenServerId as ServerId | undefined;
      if (!serverId || !state.servers[serverId]) {
        log(state, `Tracker — no chosen server.`);
        return { ok: true };
      }
      if (state.run) {
        log(state, `Tracker — already running.`);
        return { ok: true };
      }
      state.run = {
        attackedServerId: serverId,
        phase: "initiation",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        endedTheRun: false,
        cannotJackOut: false,
        encounter: null,
        accessingCardId: null,
        runSourceId: sourceId,
        quTrackerPreventFirstSubroutine: true,
      };
      log(
        state,
        `Tracker — run ${serverId}; first subroutine that would resolve is prevented.`,
      );
      return { ok: true };
    }
    case "prevent_dorm_computer_run_all_tags": {
      // "Whenever you would take tags during that run": the prevention
      // lasts for the run this ability makes and ends with it (CR 9.10.1).
      const r = evalEffect(ctx, {
        op: "do",
        action: {
          kind: "may_start_run",
          servers: "any",
          preventAllTagsThisRun: true,
        },
      });
      if (!r.ok) return r;
      log(state, `Dorm Computer — run; prevent all tags this run.`);
      return { ok: true };
    }
    case "prevent_ramujan_damage_trash_stack": {
      if (!source) return { ok: true };
      const copies = state.runner.installed.filter(
        (id) => id !== sourceId && state.cards[id]?.defId === source.defId,
      ).length;
      const x = 1 + copies;
      const pending = state.pendingDamage;
      if (!pending || pending.remaining <= 0) {
        log(state, `${source.title} — no pending damage.`);
        return { ok: true };
      }
      if (pending.type !== "net" && pending.type !== "core") {
        log(state, `${source.title} — not net/core damage.`);
        return { ok: true };
      }
      const prevent = Math.min(x, pending.remaining);
      pending.remaining -= prevent;
      for (let i = 0; i < prevent; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        trashCard(state, top);
      }
      log(
        state,
        `${source.title} — prevent ${prevent} ${pending.type} damage; trash ${prevent} from stack.`,
      );
      return { ok: true };
    }
    case "prevent_labyrinthine_jack_out": {
      if (!state.run) return { ok: true };
      state.run.cannotJackOut = true;
      log(state, `Labyrinthine Servers — Runner cannot jack out this run.`);
      return { ok: true };
    }

    case "resolve_tempus": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "lose-clicks",
            label: "Lose [click][click]",
            effect: fx.do({ kind: "lose_tempus_clicks" }),
          },
          {
            id: "core",
            label: "Suffer 1 core damage",
            effect: fx.do({ kind: "core_damage", amount: 1 }),
          },
        ],
      });
      return { ok: true };
    }

    case "tdatd_city_works_meat": {
      const adv = source?.advancementCounters ?? 0;
      const amount = 2 + adv;
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "meat_damage", amount },
      });
    }

    case "win_viral_weaponization": {
      const n = state.runner.hand.length;
      if (n <= 0) {
        log(state, `Viral Weaponization — grip empty.`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "net_damage", amount: n }));
    }
    case "offer_prevent": {
      const cardId = (action as { cardId: string }).cardId;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "snatch-take-tag",
            label: "Take 1 tag to prevent trash",
            effect: fx.do({ kind: "prevent_with_tag" }),
          },
          {
            id: "snatch-allow",
            label: `Allow trash of ${state.cards[cardId]?.title ?? cardId}`,
            effect: fx.do({
              kind: "trash_connection",
              cardId,
            }),
          },
        ],
      });
      return { ok: true };
    }
    case "prevent_with_tag": {
      state.runner.tags += 1;
      state.turn.tagsGivenThisTurn = (state.turn.tagsGivenThisTurn ?? 0) + 1;
      log(state, `Snatch and Grab — Runner takes 1 tag to prevent trash.`);
      if (state.runner.tags > 0) {
        for (const id of [...state.runner.installed]) {
          const res = state.cards[id];
          if (!res?.trashSelfWhenRunnerTagged) continue;
          trashCard(state, id);
          log(state, `${res.title} — trashed (Runner is tagged).`);
        }
      }
      return { ok: true };
    }

    case "next_gold_net_damage": {
      const x = countRezzedNextIce(state);
      if (x <= 0) {
        log(state, `NEXT Gold — X=0, no net damage.`);
        return { ok: true };
      }
      dealDamage(state, "net", x, sourceId);
      log(state, `NEXT Gold — do ${x} net damage (rezzed NEXT ice).`);
      return { ok: true };
    }

    case "net_damage_equal_unused_mu": {
      const unused = Math.max(0, memoryLimit(state) - usedMemory(state));
      if (unused <= 0) {
        log(state, `Cortex Lock — 0 unused MU.`);
        return { ok: true };
      }
      dealDamage(state, "net", unused, sourceId);
      log(state, `Cortex Lock — do ${unused} net damage (unused MU).`);
      return { ok: true };
    }

    case "prevent_tags_or_damage": {
      const max = Math.max(0, action.max ?? 3);
      const pendingTags = state.pendingTags?.remaining ?? 0;
      const pendingDmg = state.pendingDamage?.remaining ?? 0;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (pendingTags > 0) {
        const n = Math.min(max, pendingTags);
        options.push({
          id: "prevent-tags",
          label: `Prevent ${n} tag(s)`,
          effect: fx.do({ kind: "prevent_pending_tags", amount: n }),
        });
      }
      if (pendingDmg > 0) {
        const n = Math.min(max, pendingDmg);
        options.push({
          id: "prevent-dmg",
          label: `Prevent ${n} damage`,
          effect: fx.do({ kind: "prevent_pending_damage", amount: n }),
        });
      }
      if (options.length === 0) {
        log(state, `On the Lam — nothing to prevent.`);
        return { ok: true };
      }
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }
    case "spend_shi_kyu_for_net_damage": {
      // Printed: spend any number of credits; Runner suffers that much net
      // unless they add this asset to their score area as −1 AP (CR 1.2.1).
      const max = state.corp.credits;
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= Math.min(max, 20); n++) {
        if (n === 0) {
          opts.push({
            id: "shi:0",
            label: "Spend 0¢",
            effect: fx.gainCredits("corp", 0),
          });
          continue;
        }
        opts.push({
          id: `shi:${n}`,
          label: `Spend ${n}¢`,
          effect: fx.seq(
            fx.do({ kind: "corp_pay_credits", amount: n }),
            fx.choose("runner", [
              {
                id: "shi-net",
                label: `Suffer ${n} net damage`,
                effect: fx.do({ kind: "net_damage", amount: n }),
              },
              {
                id: "shi-score",
                label: "Add to score area as −1 agenda",
                effect: fx.do({
                  kind: "add_to_runner_score_as_agenda",
                  agendaPoints: -1,
                }),
              },
            ]),
          ),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts });
      return { ok: true };
    }
    case "pay_or_net": {
      const amt = action.amount ?? 1;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "pup-pay",
            label: `Pay ${amt}¢`,
            effect: fx.do({ kind: "runner_pay_credits", amount: amt }),
          },
          {
            id: "pup-net",
            label: `Take ${amt} net damage`,
            effect: fx.do({ kind: "net_damage", amount: amt }),
          },
        ],
      });
      return { ok: true };
    }
    case "pay_tori_hanzo_instead_net": {
      // Printed: you may pay 2¢ to do 1 core instead. The may/pay is the
      // damage_interrupt paid ability (creditCost 2); this leaf only replaces
      // the imminent expected effect (CR 9.9.10 / 1.2.1).
      const pending = state.pendingDamage;
      if (
        state.run?.netDamageWould !== 1 ||
        pending?.type !== "net" ||
        pending.remaining <= 0
      ) {
        log(
          state,
          `Tori Hanzō — not the first time the Corp would do net damage this run (CR ${CR.ordinalWould.number}).`,
        );
        return { ok: true };
      }
      pending.type = "core";
      pending.remaining = 1;
      log(
        state,
        `Tori Hanzō — replace net damage with 1 core damage (CR ${CR.ordinalWould.number}).`,
      );
      return { ok: true };
    }
    case "prevent_trash_resource": {
      preventPendingInstalledTrash(state);
      log(state, `Fall Guy — prevent trash of another resource.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyDamageAndPreventionKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "suffer_chosen_damage": {
      resolveRibsPick(state, {
        type: action.damage,
        amount: action.amount,
        sourceId: action.damageSourceId,
        beforeCore: action.beforeCore,
        count: action.count,
        picked: [...action.picked],
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

/** Martial Law (ml) Flashpoint pack primitives — v1.126.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashRunnerCardToHeap(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
}

export function applyFlashpointMlPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "mkultra_spend_pump_and_break": {
      if (!state.run?.encounter) {
        log(state, `MKUltra — no encounter.`);
        return { ok: true };
      }
      state.run.encounterStrengthBoosts[sourceId] =
        (state.run.encounterStrengthBoosts[sourceId] ?? 0) + 2;
      log(state, `MKUltra — +2 strength this encounter.`);
      const enc = state.run.encounter;
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("sentry")) {
        return { ok: true };
      }
      const str =
        (source.breaker?.strength ?? source.strength ?? 0) +
        (state.run.strengthBoosts[sourceId] ?? 0) +
        (state.run.encounterStrengthBoosts[sourceId] ?? 0);
      const iceStr = ice.strength ?? 0;
      if (str < iceStr) {
        log(
          state,
          `MKUltra — cannot interface (str ${str} < ice ${iceStr}).`,
        );
        return { ok: true };
      }
      const unbroken = enc.broken
        .map((b, i) => (!b ? i : -1))
        .filter((i) => i >= 0);
      const toBreak = unbroken.slice(0, 2);
      for (const i of toBreak) enc.broken[i] = true;
      if (toBreak.length > 0) {
        log(
          state,
          `MKUltra — break ${toBreak.length} sentry subroutine(s).`,
        );
      }
      return { ok: true };
    }

    case "host_on_installed_resource_as_condition": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `On the Lam — no installed resource to host on.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: resources.map((id) => ({
          id: `host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_on_installed_resource_as_condition_on",
            resourceId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "host_on_installed_resource_as_condition_on": {
      const resourceId = action.resourceId;
      const host = state.cards[resourceId];
      if (!host || host.type !== "resource") {
        log(state, `On the Lam — invalid host resource.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = resourceId;
      source.zone = `hosted:${resourceId}`;
      source.faceup = true;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      if (!host.hostedCardIds.includes(sourceId)) {
        host.hostedCardIds.push(sourceId);
      }
      log(state, `Host ${source.title} on ${host.title} as a condition.`);
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
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "trash_one_program_used_this_run_cannot_prevent": {
      // Prefer programs marked used this run; else any installed program.
      const bag = state.run as
        | { programsUsedThisRun?: string[] }
        | null
        | undefined;
      const used = (bag?.programsUsedThisRun ?? []).filter((id) => {
        const c = state.cards[id];
        return c && c.type === "program" && state.runner.rig.includes(id);
      });
      const candidates =
        used.length > 0
          ? used
          : state.runner.rig.filter((id) => state.cards[id]?.type === "program");
      if (candidates.length === 0) {
        log(state, `Cold Read — no installed program to trash.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        const id = candidates[0]!;
        trashRunnerCardToHeap(state, id);
        log(
          state,
          `Cold Read — trash ${state.cards[id]!.title} (cannot prevent).`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "trash_program_cannot_prevent",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "trash_program_cannot_prevent": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.rig.includes(cardId)) {
        log(state, `Cold Read — program not installed.`);
        return { ok: true };
      }
      trashRunnerCardToHeap(state, cardId);
      log(
        state,
        `Cold Read — trash ${state.cards[cardId]!.title} (cannot prevent).`,
      );
      return { ok: true };
    }

    case "may_reveal_force_draw": {
      if (state.corp.deck.length === 0) {
        log(state, `Equivocation — R&D empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[state.corp.deck.length - 1]!;
      const top = state.cards[topId]!;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "reveal",
            label: `Reveal ${top.title}`,
            effect: fx.do({ kind: "reveal_then_may_force_draw" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "reveal_then_may_force_draw": {
      if (state.corp.deck.length === 0) return { ok: true };
      const topId = state.corp.deck[state.corp.deck.length - 1]!;
      const top = state.cards[topId]!;
      log(state, `Equivocation — reveal top of R&D: ${top.title}.`);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "force-draw",
            label: `Force Corp to draw ${top.title}`,
            effect: fx.do({ kind: "draw", side: "corp", amount: 1 }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "spend_x_remove_tags": {
      const tags = state.runner.tags;
      const credits = state.runner.credits;
      if (tags <= 0 || credits <= 0) {
        log(state, `Misdirection — no tags or credits.`);
        return { ok: true };
      }
      const maxX = Math.min(tags, credits);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `misdirection-x:${x}`,
          label: `Spend ${x}¢: remove ${x} tag(s)`,
          effect: fx.do({
            kind: "spend_x_remove_tags_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "spend_x_remove_tags_resolve": {
      const x = action.amount ?? 0;
      if (x <= 0 || state.runner.credits < x) {
        log(state, `Misdirection — cannot afford ${x}¢.`);
        return { ok: true };
      }
      state.runner.credits -= x;
      const removed = Math.min(x, state.runner.tags);
      state.runner.tags -= removed;
      log(
        state,
        `Misdirection — spend ${x}¢ → remove ${removed} tag(s) (${state.runner.tags} remain).`,
      );
      return { ok: true };
    }

    case "install_up_to_n_from_archives_paying": {
      const max = Math.max(0, action.max ?? 2);
      return applyFlashpointMlPrimitive(ctx, {
        kind: "install_up_to_n_from_archives_paying_continue",
        remaining: max,
      });
    }

    case "install_up_to_n_from_archives_paying_continue": {
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const installable = state.corp.discard.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "ice" || t === "upgrade";
      });
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "done",
          label: "Done installing",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = card.installCost ?? 0;
        if (state.corp.credits < cost) continue;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id} (${cost}¢)`,
              effect: {
                op: "seq",
                effects: [
                  fx.do({
                    kind: "install_archives_card_paying",
                    cardId,
                    serverId: server.id,
                  }),
                  fx.do({
                    kind: "install_up_to_n_from_archives_paying_continue",
                    remaining: remaining - 1,
                  }),
                ],
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id} (${cost}¢)`,
              effect: {
                op: "seq",
                effects: [
                  fx.do({
                    kind: "install_archives_card_paying",
                    cardId,
                    serverId: server.id,
                  }),
                  fx.do({
                    kind: "install_up_to_n_from_archives_paying_continue",
                    remaining: remaining - 1,
                  }),
                ],
              },
            });
          }
          options.push({
            id: `arch:${cardId}:new`,
            label: `Install ${card.title} on new remote (${cost}¢)`,
            effect: {
              op: "seq",
              effects: [
                fx.do({
                  kind: "install_archives_card_paying",
                  cardId,
                  serverId: "__new_remote__",
                }),
                fx.do({
                  kind: "install_up_to_n_from_archives_paying_continue",
                  remaining: remaining - 1,
                }),
              ],
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `Friends in High Places — install up to ${remaining} from Archives (paying).`,
      );
      return { ok: true };
    }

    case "psi_differ_redirect": {
      const current = state.run?.attackedServerId;
      const servers = Object.values(state.servers).filter(
        (s) => s.id !== current,
      );
      if (servers.length === 0 || !state.run) {
        log(state, `Mind Game — no other server.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: servers.map((s) => ({
          id: `mind:${s.id}`,
          label: `Move run to ${s.id}`,
          effect: fx.do({
            kind: "redirect_resolve",
            serverId: s.id,
          }),
        })),
      };
      return { ok: true };
    }

    case "redirect_resolve": {
      const serverId = action.serverId as ServerId | undefined;
      if (!state.run || !serverId || !state.servers[serverId]) {
        log(state, `Mind Game — invalid redirect.`);
        return { ok: true };
      }
      state.run.attackedServerId = serverId;
      // Move to outermost ice position (index 0).
      const iceLen = state.servers[serverId]!.ice.length;
      (state.run as { position?: number }).position = iceLen > 0 ? 0 : -1;
      (
        state.run as {
          jackOutAdditionalCostAddInstalledToStackBottom?: boolean;
        }
      ).jackOutAdditionalCostAddInstalledToStackBottom = true;
      log(
        state,
        `Mind Game — move to outermost of ${serverId}; jack out costs +1 installed to stack bottom.`,
      );
      return evalEffect(ctx, fx.do({ kind: "offer_jack_out" }));
    }

    case "nihongai_may_look_top5_swap_hq": {
      const grip = state.runner.hand.length;
      const credits = state.runner.credits;
      if (grip >= 2 && credits >= 6) {
        log(state, `Nihongai Grid — Runner has ≥2 grip and ≥6¢; no effect.`);
        return { ok: true };
      }
      const top = state.corp.deck.slice(-5).reverse();
      if (top.length === 0 || state.corp.hand.length === 0) {
        log(state, `Nihongai Grid — nothing to swap.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: "Look at top 5 of R&D and swap 1 with HQ",
            effect: fx.do({
              kind: "nihongai_look_swap_continue",
              lookedIds: top,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "nihongai_look_swap_continue": {
      const lookedIds = action.lookedIds ?? [];
      const hq = [...state.corp.hand];
      if (lookedIds.length === 0 || hq.length === 0) return { ok: true };
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const rdId of lookedIds) {
        for (const hqId of hq) {
          options.push({
            id: `swap:${rdId}:${hqId}`,
            label: `Swap ${state.cards[rdId]?.title} (R&D) ↔ ${state.cards[hqId]?.title} (HQ)`,
            effect: fx.do({
              kind: "nihongai_swap_resolve",
              rdCardId: rdId,
              hqCardId: hqId,
            }),
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline swap",
        effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `Nihongai Grid — choose R&D↔HQ swap.`);
      return { ok: true };
    }

    case "nihongai_swap_resolve": {
      const rdCardId = action.rdCardId;
      const hqCardId = action.hqCardId;
      if (!rdCardId || !hqCardId) return { ok: true };
      const rdIdx = state.corp.deck.indexOf(rdCardId);
      const hqIdx = state.corp.hand.indexOf(hqCardId);
      if (rdIdx < 0 || hqIdx < 0) {
        log(state, `Nihongai Grid — cards no longer available.`);
        return { ok: true };
      }
      state.corp.deck[rdIdx] = hqCardId;
      state.corp.hand[hqIdx] = rdCardId;
      state.cards[hqCardId]!.zone = "corp:rd";
      state.cards[rdCardId]!.zone = "corp:hq";
      log(
        state,
        `Nihongai Grid — swap ${state.cards[rdCardId]!.title} ↔ ${state.cards[hqCardId]!.title}.`,
      );
      return { ok: true };
    }

    case "give_tags_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 1;
      const has = state.runner.rig.some((id) =>
        (state.cards[id]?.subtypes ?? [])
          .map((s) => s.toLowerCase())
          .includes(subtype),
      );
      if (!has) {
        log(state, `IP Block — no installed ${subtype}; no tag.`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount }));
    }

    default:
      return null;
  }
}

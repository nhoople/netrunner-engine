import type { Action, GameState } from "../state/types.js";
import { runnerTrashCostForCard } from "../cards/stubs.js";
import { abilityCost, canPayCost, runnerCreditsFor } from "../state/costs.js";
import { corpCreditsForTrace } from "../state/trace.js";
import { wasAbilityUsed } from "../state/turn.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { stealAdditionalCreditsFromActiveLockdowns } from "../state/lockdowns.js";

export function collectPendingCandidates(state: GameState): Action[] | null {
  const actions: Action[] = [];

  if (state.psi) {
    const psi = state.psi;
    if (psi.runnerBid === null) {
      for (let b = 0; b <= psi.maxBid; b++) {
        actions.push({ type: "psi_runner_bid", amount: b });
      }
    } else if (psi.corpBid === null) {
      for (let b = 0; b <= psi.maxBid; b++) {
        actions.push({ type: "psi_corp_bid", amount: b });
      }
    }
    return actions;
  }

  if (state.trace) {
    actions.push({ type: "boost_trace", credits: 0 });
    const corpTraceCredits = corpCreditsForTrace(state);
    if (corpTraceCredits > 0) {
      for (let c = 1; c <= Math.min(corpTraceCredits, 5); c++) {
        actions.push({ type: "boost_trace", credits: c });
      }
    }
    // Runner spends credits to raise link strength (CR 10.8.3 / 10.8.6d).
    actions.push({ type: "spend_link", amount: 0 });
    if (state.runner.credits > 0) {
      for (let c = 1; c <= Math.min(state.runner.credits, 5); c++) {
        actions.push({ type: "spend_link", amount: c });
      }
    }
    actions.push({ type: "resolve_trace" });
    // Flip Switch-class: trash to set base trace strength to 0.
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("trace_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (ab.forbidDuringRun && state.run) continue;
        if (ab.onlyDuringHqRun && state.run?.attackedServerId !== "hq") continue;
        if (ab.onlyDuringArchivesRun && state.run?.attackedServerId !== "archives") continue;
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingTags) {
    actions.push({ type: "accept_tags" });
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("tag_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (ab.forbidDuringRun && state.run) continue;
        if (ab.onlyDuringHqRun && state.run?.attackedServerId !== "hq") continue;
        if (ab.onlyDuringArchivesRun && state.run?.attackedServerId !== "archives") continue;
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingExpose && state.pendingExpose.phase === "interrupt") {
    actions.push({ type: "accept_expose" });
    const corpIds: string[] = [state.corp.identityId];
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.root, ...server.ice]) {
        if (state.cards[id]?.rezzed) corpIds.push(id);
      }
    }
    for (const id of corpIds) {
      const card = state.cards[id];
      if (!card || abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("expose_interrupt_paw")) continue;
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "corp", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingTrashPrevent) {
    actions.push({ type: "accept_installed_trash" });
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("trash_interrupt_paw")) continue;
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingEndTheRun) {
    actions.push({ type: "accept_end_the_run" });
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("end_the_run_interrupt_paw")) continue;
        if (
          ab.requiresSuccessfulHqRunThisTurn &&
          !state.turn.successfulHqRunThisTurn
        ) {
          continue;
        }
        if (ab.requiresRezzedIce) {
          let has = false;
          for (const server of Object.values(state.servers)) {
            for (const id of server.ice) {
              if (state.cards[id]?.rezzed) {
                has = true;
                break;
              }
            }
            if (has) break;
          }
          if (!has) continue;
        }
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingSubroutineBreak) {
    actions.push({ type: "pass_window" });
    const ice = state.cards[state.pendingSubroutineBreak.iceId];
    const server = ice
      ? Object.values(state.servers).find((s) => s.ice.includes(ice.id))
      : undefined;
    for (const id of server?.root ?? []) {
      const card = state.cards[id];
      if (!card?.preventSubroutineBreakOnBioroidByTrash) continue;
      if (
        !card.rezzed &&
        state.corp.credits >= (card.rezCost ?? 0)
      ) {
        actions.push({ type: "rez_asset", cardId: id });
      }
      if (card.rezzed && !abilitiesSuppressed(state, id)) {
        for (const ab of card.paidAbilities ?? []) {
          if (!ab.windows.includes("break_interrupt_paw")) continue;
          const cost = abilityCost(ab, state, card);
          if (!canPayCost(state, "corp", cost, card)) continue;
          actions.push({
            type: "use_paid_ability",
            cardId: id,
            abilityId: ab.id,
          });
        }
      }
    }
    return actions;
  }

  if (state.pendingDamage) {
    actions.push({ type: "accept_damage" });
    if (state.pendingDamage.preventByLoseAllClicks) {
      if (state.runner.clicks > 0) {
        actions.push({ type: "prevent_damage_lose_all_clicks" });
      }
      return actions;
    }
    if (!state.pendingDamage.interruptPawOnly) {
      for (let a = 1; a <= state.pendingDamage.remaining; a++) {
        actions.push({ type: "prevent_damage", amount: a });
      }
    }
    // Interrupt PAW applies to net/meat/core (brain alias) prevent abilities.
    const pendingType = state.pendingDamage.type;
    const used =
      state.pendingDamage.interruptUsedSourceIds ?? [];
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      if (used.includes(id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("damage_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (ab.forbidDuringRun && state.run) continue;
        if (ab.onlyDuringHqRun && state.run?.attackedServerId !== "hq") continue;
        if (ab.onlyDuringArchivesRun && state.run?.attackedServerId !== "archives") continue;
        if (
          ab.requirePendingDamageTypes &&
          !ab.requirePendingDamageTypes.includes(pendingType)
        ) {
          continue;
        }
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    // Corp rezzed sources (Prāna Condenser) during damage interrupt.
    const corpInterruptIds: string[] = [state.corp.identityId];
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.root, ...server.ice]) {
        if (state.cards[id]?.rezzed) corpInterruptIds.push(id);
      }
    }
    for (const id of corpInterruptIds) {
      const card = state.cards[id];
      if (!card || abilitiesSuppressed(state, id)) continue;
      if (used.includes(id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("damage_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (ab.forbidDuringRun && state.run) continue;
        if (ab.onlyDuringHqRun && state.run?.attackedServerId !== "hq") continue;
        if (ab.onlyDuringArchivesRun && state.run?.attackedServerId !== "archives") continue;
        if (
          ab.requirePendingDamageTypes &&
          !ab.requirePendingDamageTypes.includes(pendingType)
        ) {
          continue;
        }
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "corp", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingTrashProgram) {
    for (const id of state.pendingTrashProgram.candidates) {
      actions.push({ type: "choose_trash_program", cardId: id });
    }
    return actions;
  }

  if (state.pendingSabotage) {
    const amount = state.pendingSabotage.amount;
    const hq = [...state.corp.hand];
    const rdLen = state.corp.deck.length;
    const total = hq.length + rdLen;
    if (total === 0 || total < amount) {
      // Only legal resolution is trash-all (empty HQ pick).
      actions.push({ type: "resolve_sabotage", hqCardIds: [] });
      return actions;
    }
    // Enumerate valid HQ subset sizes; for each size, offer one deterministic
    // pick (end of hand). Hosts that need full combinatorial choice can send
    // any legal hqCardIds via applyIntent.
    const minFromHq = Math.max(0, amount - rdLen);
    const maxFromHq = Math.min(amount, hq.length);
    for (let n = minFromHq; n <= maxFromHq; n++) {
      const hqCardIds = n === 0 ? [] : hq.slice(hq.length - n);
      actions.push({ type: "resolve_sabotage", hqCardIds });
    }
    return actions;
  }

  if (state.pendingChoice) {
    for (const opt of state.pendingChoice.options) {
      actions.push({ type: "choose_option", optionId: opt.id });
    }
    return actions;
  }

  // Nested access-a-card (appendix 11.6): mid-access vs steal steps.
  if (state.run?.accessingCardId) {
    const id = state.run.accessingCardId;
    const card = state.cards[id];
    const accessKey = state.timingKey;

    // 11.6_3 — steal agenda (mandatory when able); decline only when steal blocked.
    if (accessKey === "access.stealAgenda") {
      if (card.type === "agenda") {
        let stealLegal = false;
        if (!state.run.cannotStealOrTrash) {
          // Haarpsichord: cannot steal more than one agenda per turn.
          let haarpsichordBlocks = false;
          const idCard = state.cards[state.corp.identityId];
          if (
            idCard?.cannotStealMoreThanOneAgendaPerTurn &&
            (state.turn.agendasStolenThisTurn ?? 0) >= 1
          ) {
            haarpsichordBlocks = true;
          }
          // Old Hollywood Grid: cannot steal unless Runner has a copy in score.
          let ohGridBlocks = false;
          const attacked = state.run?.attackedServerId;
          if (attacked) {
            const root = state.servers[attacked]?.root ?? [];
            for (const sid of root) {
              const up = state.cards[sid];
              if (!up?.cannotStealUnlessCopyInRunnerScore) continue;
              if (!up.rezzed && !up.persistent) continue;
              const hasCopy = state.runner.score.some(
                (rid) => state.cards[rid]?.title === card.title,
              );
              if (!hasCopy) ohGridBlocks = true;
            }
          }
          if (!haarpsichordBlocks && !ohGridBlocks) {
          const stealClicks = card.stealAdditionalClicks ?? 0;
          let stealCredits = card.stealAdditionalCredits ?? 0;
          for (const server of Object.values(state.servers)) {
            for (const sid of [...server.root, ...server.ice]) {
              const c = state.cards[sid];
              if (!c?.rezzed) continue;
              stealCredits += c.stealAdditionalCreditsWhileRezzed ?? 0;
            }
          }
          for (const c of Object.values(state.cards)) {
            if (c.zone !== "corp:play-area") continue;
            stealCredits += c.stealAdditionalCreditsWhileRezzed ?? 0;
          }
          if (attacked) {
            const root = state.servers[attacked]?.root ?? [];
            for (const sid of root) {
              const c = state.cards[sid];
              if (!c) continue;
              if (!c.rezzed && !c.persistent) continue;
              stealCredits += c.stealAdditionalCreditsFromProtectingServer ?? 0;
            }
          }
          stealCredits += stealAdditionalCreditsFromActiveLockdowns(state, id);
          if (
            (stealClicks === 0 || state.runner.clicks >= stealClicks) &&
            (stealCredits === 0 || state.runner.credits >= stealCredits)
          ) {
            actions.push({ type: "steal_agenda", cardId: id });
            stealLegal = true;
          }
          }
        }
        // Film Critic: may host accessed agenda instead of stealing.
        for (const rid of state.runner.rig) {
          const host = state.cards[rid];
          if (!host?.mayHostAccessedAgenda) continue;
          const cap = host.hostAgendaCapacity ?? 1;
          const hostedAgendas = (host.hostedCardIds ?? []).filter(
            (hid) => state.cards[hid]?.type === "agenda",
          ).length;
          if (hostedAgendas >= cap) continue;
          actions.push({
            type: "access_host_agenda_on_film_critic",
            cardId: id,
            hostId: rid,
          });
        }
        if (!stealLegal) {
          actions.push({ type: "finish_access" });
        }
      } else {
        actions.push({ type: "finish_access" });
      }
      return actions;
    }

    // 11.6_2 (and parked 11.6_1 with accessingCardId): mid-access abilities only.
    if (
      accessKey === "access.midAccess" ||
      accessKey === "access.cardAccessed"
    ) {
      if (
        card.trashCost !== undefined &&
        !state.run.cannotStealOrTrash &&
        !(card.cannotBeTrashedByRunnerWhileRezzed && card.rezzed)
      ) {
        const purpose =
          card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
        if (
          runnerCreditsFor(state, purpose) >=
          runnerTrashCostForCard(state, id)
        ) {
          actions.push({ type: "trash_accessed", cardId: id });
        }
      }
      if (
        card.trashCost !== undefined &&
        !state.run.cannotStealOrTrash &&
        !(card.cannotBeTrashedByRunnerWhileRezzed && card.rezzed) &&
        !state.turn.siSalsetteSlumsUsedThisTurn
      ) {
        const purpose =
          card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
        const cost = runnerTrashCostForCard(state, id);
        if (runnerCreditsFor(state, purpose) >= cost) {
          for (const rid of state.runner.rig) {
            const slums = state.cards[rid];
            if (!slums?.accessPayTrashCostRemoveFromGameOncePerTurn) continue;
            actions.push({
              type: "access_rfg_paying_trash_cost",
              cardId: id,
              slumsId: rid,
            });
            break;
          }
        }
      }
      actions.push({ type: "finish_access" });
      const sid = state.run.attackedServerId;
      if (sid === "hq" || sid === "rd") {
        const ids: string[] = [...state.runner.rig];
        if (state.run.runSourceId) ids.push(state.run.runSourceId);
        for (const rid of ids) {
          const spec = state.cards[rid]?.accessTrashFromGrip;
          if (!spec) continue;
          if (spec.oncePerTurn && state.turn.carnivoreAccessTrashUsed) continue;
          if (state.runner.hand.length >= spec.gripCards) {
            actions.push({ type: "access_trash_from_grip" });
            break;
          }
        }
      }
      if (!state.run.cannotStealOrTrash) {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          if (
            c.accessTrashWithVirus &&
            (c.virusCounters ?? 0) >= 1 &&
            !wasAbilityUsed(state, rid, "imp-access-trash")
          ) {
            actions.push({
              type: "access_trash_with_virus",
              cardId: id,
            });
            break;
          }
        }
      }
      if (
        !state.run.cannotStealOrTrash &&
        state.run.accessTrashFree &&
        card.side === "corp"
      ) {
        actions.push({
          type: "access_trash_free",
          cardId: id,
        });
      }
      if (!state.run.cannotStealOrTrash) {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          if (
            !c?.accessTrashPayingPrintedCostFromStealth ||
            (c.powerCounters ?? 0) < 1
          ) {
            continue;
          }
          const accessed = state.cards[id];
          const printed = accessed?.rezCost ?? accessed?.playCost ?? 0;
          if (
            canPayCost(
              state,
              "runner",
              { credits: printed, creditsFromStealthOnly: true },
              c,
            )
          ) {
            actions.push({
              type: "access_trash_paying_printed_cost_from_stealth",
              cardId: id,
              lampadesId: rid,
            });
            break;
          }
        }
      }
      if (
        !state.run.cannotStealOrTrash &&
        card.type !== "agenda" &&
        card.side === "corp"
      ) {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          if (c?.accessTrashSelfNonAgendaThenDraw) {
            actions.push({
              type: "access_trash_self_non_agenda_draw",
              cardId: id,
              gourmandId: rid,
            });
            break;
          }
        }
      }
      if (card.type !== "agenda" && card.side === "corp") {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          const spec = c?.accessHostNonAgendaFaceup;
          if (!spec) continue;
          const max = c.maxHostedCards ?? Infinity;
          const have = c.hostedCardIds?.length ?? 0;
          if (have >= max) continue;
          if (state.runner.credits < spec.creditCost) continue;
          actions.push({
            type: "access_host_non_agenda_faceup",
            cardId: id,
          });
          break;
        }
      }
      return actions;
    }
  }

  return null;
}

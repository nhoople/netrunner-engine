/**
 * Primitive kinds for Runner installs from the grip. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { type EffectCtx, type EvalResult, evalEffect } from "../eval.js";
import { type Effect, type Primitive, fx } from "../ir.js";
import {
  creditsAvailableForInstall,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  memoryLimit,
  usedMemory,
  memoryNeededToInstall,
  effectiveMemoryCost,
} from "../../state/turnAndActions/turn.js";
import { CR } from "../../timing/labels.js";
import {
  canInstallHeapCard,
  gripInstallCostAfterDiscount,
  installGripCardDiscounted,
} from "./runnerInstall.js";
import { random, shuffleInPlace } from "../../state/rng.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";

export function applyRunnerInstallFromGripKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "may_install_from_grip": {
      const discount = action.discount ?? 0;
      const typeFilter =
        action.types && action.types.length > 0 ? new Set(action.types) : null;
      const subtypeFilter = action.subtype?.toLowerCase() ?? null;
      const installable = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!["program", "hardware", "resource"].includes(c.type)) {
          return false;
        }
        if (
          typeFilter &&
          !typeFilter.has(c.type as "program" | "hardware" | "resource")
        ) {
          return false;
        }
        if (
          subtypeFilter &&
          !(c.subtypes ?? []).some((s) => s.toLowerCase() === subtypeFilter)
        ) {
          return false;
        }
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        if (c.type === "program") {
          const need = memoryNeededToInstall(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
        }
        const cost = gripInstallCostAfterDiscount(state, c, discount);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      if (installable.length === 0) {
        log(state, `May install from grip — no installable affordable cards.`);
        return { ok: true };
      }
      const options = [
        {
          id: "decline",
          label: "Decline to install",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "runner" as const,
              amount: 0,
            },
          },
        },
        ...installable.map((id) => {
          const c = state.cards[id];
          const cost = gripInstallCostAfterDiscount(state, c, discount);
          return {
            id,
            label: `Install ${c.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_grip_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `May install a card from grip.`,
      });
      return { ok: true };
    }

    case "install_resource_discount": {
      const discount = action.discount;
      // The Runner chooses which grip resource to install (printed:
      // "Install 1 resource from your grip, paying 3 less").
      const matches = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "resource") return false;
        return state.runner.credits >= Math.max(0, c.installCost - discount);
      });
      if (matches.length === 0) {
        log(state, `Install resource discounted — none in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `career-fair:${id}`,
          label: `Install ${state.cards[id]!.title} (${discount}¢ discount)`,
          effect: fx.do({ kind: "install_grip_card", cardId: id, discount }),
        })),
      });
      return { ok: true };
    }

    case "install_grip_card": {
      return installGripCardDiscounted(
        state,
        action.cardId,
        action.discount,
        sourceId,
        action.hostId,
      );
    }

    case "install_from_grip_discount": {
      const typeSet = new Set(action.types);
      const candidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!typeSet.has(c.type as "program" | "hardware" | "resource")) {
          return false;
        }
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        if (c.type === "program") {
          const need = memoryNeededToInstall(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
        }
        const cost = gripInstallCostAfterDiscount(state, c, action.discount);
        return state.runner.credits >= cost;
      });
      if (candidates.length === 0) {
        log(
          state,
          `Install from grip discounted — no affordable ${action.types.join("/")}.`,
        );
        return { ok: true };
      }
      const buildEffect = (id: string): Effect => {
        const installFx: Effect = {
          op: "do",
          action: {
            kind: "install_grip_card",
            cardId: id,
            discount: action.discount,
          },
        };
        const tail: Effect[] = [];
        if (action.mayCharge) {
          tail.push({
            op: "do",
            action: { kind: "may_charge_card", cardId: id },
          });
        }
        if (action.thenOnInstall) {
          tail.push(action.thenOnInstall);
        }
        if (tail.length === 0) return installFx;
        return { op: "seq", effects: [installFx, ...tail] };
      };
      if (candidates.length === 1) {
        return evalEffect({ state, sourceId }, buildEffect(candidates[0]!));
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id];
          const cost = gripInstallCostAfterDiscount(state, c, action.discount);
          return {
            id: `install-${id}`,
            label: `Install ${c.title} for ${cost}¢`,
            effect: buildEffect(id),
          };
        }),
        logLine: `Install from grip — choose among ${candidates.length} cards (${action.discount}¢ discount).`,
      });
      return { ok: true };
    }

    case "may_install_program_hardware_from_last_runner_discarded": {
      const ids = state.turn.runnerDiscardedToMaxHandIds.filter((id) => {
        const c = state.cards[id];
        return (
          c &&
          (c.type === "program" || c.type === "hardware") &&
          state.runner.discardPile.includes(id)
        );
      });
      if (ids.length === 0) {
        log(state, `Install from discarded — none eligible.`);
        return { ok: true };
      }
      if (
        !openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "decline",
              label: "Decline",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            ...ids
              .filter((cardId) => canInstallHeapCard(state, cardId, 0))
              .map((cardId) => ({
                id: cardId,
                label: `Install ${state.cards[cardId]!.title} from heap`,
                effect: {
                  op: "do" as const,
                  action: {
                    kind: "install_heap_card" as const,
                    cardId,
                    discount: 0,
                  },
                },
              })),
          ],
        })
      )
        return { ok: true };
      if ((state.pendingChoice?.options.length ?? 0) <= 1) {
        state.pendingChoice = null;
        log(state, `Install from discarded — none affordable.`);
        return { ok: true };
      }
      log(state, `May install 1 program/hardware from cards just discarded.`);
      return { ok: true };
    }

    case "install_up_to_n_programs_from_grip_discount": {
      const remaining = Math.max(0, action.remaining);
      const discount = action.discount;
      if (remaining <= 0) return { ok: true };
      const programs = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        return (
          Boolean(c) &&
          c.type === "program" &&
          !c.installOnIce &&
          !(c.subtypes ?? []).includes("trojan")
        );
      });
      const hosts = state.runner.installed.filter((id) => {
        const host = state.cards[id];
        if (!host?.daemonHost) return false;
        const hosted = state.runner.installed.filter(
          (guest) => state.cards[guest]?.hostId === id,
        ).length;
        return (
          host.maxHostedCards === undefined || hosted < host.maxHostedCards
        );
      });
      const installSeq = (id: string, hostId?: string): Effect => ({
        op: "seq",
        effects: [
          {
            op: "do",
            action: {
              kind: "install_grip_card",
              cardId: id,
              discount,
              ...(hostId ? { hostId } : {}),
            },
          },
          {
            op: "do",
            action: {
              kind: "install_up_to_n_programs_from_grip_discount",
              remaining: remaining - 1,
              discount,
            },
          },
        ],
      });
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const id of programs) {
        const c = state.cards[id]!;
        const printed = gripInstallCostAfterDiscount(state, c, discount);
        const fitsMemory =
          usedMemory(state) + effectiveMemoryCost(state, id) <=
          memoryLimit(state);
        if (
          fitsMemory &&
          creditsAvailableForInstall(state, "runner") >= printed
        ) {
          options.push({
            id: `monolith:${id}`,
            label: `Install ${c.title} (${discount}¢ discount)`,
            effect: installSeq(id),
          });
        }
        for (const hostId of hosts) {
          const host = state.cards[hostId]!;
          const hostedCost = Math.max(
            0,
            printed - (host.daemonHostInstallCreditDiscount ?? 0),
          );
          if (creditsAvailableForInstall(state, "runner") < hostedCost) {
            continue;
          }
          options.push({
            id: `monolith:${id}:host:${hostId}`,
            label: `Install ${c.title} on ${host.title} for ${hostedCost}¢`,
            effect: installSeq(id, hostId),
          });
        }
      }
      if (options.length === 0) {
        log(state, `${source.title} — no more affordable programs to install.`);
        return { ok: true };
      }
      options.push({
        id: "done",
        label: "Done installing",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source.title} — install up to ${remaining} program(s) from grip (${discount}¢ discount each; CR ${CR.runnerBasicInstall.number}).`,
      });
      return { ok: true };
    }

    case "install_rejig_bounce": {
      const candidates = state.runner.installed.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — no installed program or hardware.`);
        return { ok: true };
      }
      const build = (cardId: string): Effect => {
        const printed = state.cards[cardId]!.installCost ?? 0;
        return {
          op: "seq" as const,
          effects: [
            {
              op: "do" as const,
              action: {
                kind: "return_rig_card_to_grip" as const,
                cardId,
              },
            },
            {
              op: "do" as const,
              action: {
                kind: "install_from_grip_discount" as const,
                types: ["program", "hardware"],
                discount: printed,
              },
            },
          ],
        };
      };
      if (candidates.length === 1) {
        return evalEffect({ state, sourceId }, build(candidates[0]!));
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id]!;
          const printed = c.installCost ?? 0;
          return {
            id: `rejig:${id}`,
            label: `Add ${c.title} to grip (install −${printed}¢)`,
            effect: build(id),
          };
        }),
        logLine: `${source.title} — choose installed program/hardware to add to grip.`,
      });
      return { ok: true };
    }

    case "install_program_from_grip_paying_cost": {
      const programs = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (c.type !== "program") return false;
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        const need = memoryNeededToInstall(state, id);
        if (usedMemory(state) + need > memoryLimit(state)) return false;
        const cost = gripInstallCostAfterDiscount(state, c, 0);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      if (programs.length === 0) {
        log(state, `Install program from grip — no affordable program.`);
        return { ok: true };
      }
      const trackSubtype = action.trackOnRunEndTrashUnlessSubtype;
      const finish = (pick: string): EvalResult => {
        const r = installGripCardDiscounted(state, pick, 0, sourceId);
        if (!r.ok) return r;
        if (state.run && trackSubtype !== undefined) {
          state.run.identityInstalledProgramId = pick;
          state.run.identityInstalledProgramTrashUnlessSubtype = trackSubtype;
        }
        return { ok: true };
      };
      if (action.cardId && programs.includes(action.cardId)) {
        return finish(action.cardId);
      }
      if (programs.length === 1) {
        return finish(programs[0]!);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `arissana-install:${id}`,
          label: `Install ${state.cards[id].title}`,
          effect: {
            op: "do",
            action: {
              kind: "install_program_from_grip_paying_cost",
              cardId: id,
              trackOnRunEndTrashUnlessSubtype: trackSubtype,
            },
          },
        })),
        logLine: `Choose program from grip to install.`,
      });
      return { ok: true };
    }
    case "install_program": {
      const cardId = (action as { cardId: string }).cardId;
      const discount = (action as { discount: number }).discount;
      const card = state.cards[cardId];
      if (!card || card.type !== "program") return { ok: true };
      const printed = card.installCost ?? 0;
      const cost = Math.max(0, printed - discount);
      if (state.runner.credits < cost) {
        log(state, `Code Siphon — cannot afford ${card.title}.`);
        return { ok: true };
      }
      // The search already took the card out of the stack.
      subtractRunnerCreditPool(state, cost);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      // The turn's record of a Runner install (Docklands Crackdown,
      // Housekeeping); the inline install skips the install procedure.
      state.turn.runnerInstalledCardThisTurn = true;
      log(
        state,
        `Code Siphon — install ${card.title} for ${cost}¢ (−${discount}), then take 1 tag.`,
      );
      // The tag goes through the tag procedure, so it can be avoided
      // (CR 9.9.6a).
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount: 1 }));
    }

    case "install_kabonesa_resolve": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) return { ok: true };
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const card = state.cards[id]!;
      const printed = card.installCost ?? 0;
      const cost = Math.max(0, printed - 1);
      if (state.runner.credits < cost) {
        // Put back and shuffle — cannot afford.
        state.runner.deck.push(id);
        log(state, `Kabonesa Wu — cannot afford ${card.title}.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      if (!state.turn.dtwnKabonesaTrackedInstallIds) {
        state.turn.dtwnKabonesaTrackedInstallIds = [];
      }
      state.turn.dtwnKabonesaTrackedInstallIds.push(id);
      log(
        state,
        `Kabonesa Wu — install ${card.title} for ${cost}¢ (track RFG at turn end).`,
      );
      return { ok: true };
    }

    case "dtwn_emergent_creativity": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "begin",
            label: "Trash programs/hardware from grip (0 or more), then search",
            effect: fx.do({
              kind: "trash_emergent_continue",
              trashedCost: 0,
            }),
          },
        ],
        logLine: `Emergent Creativity — trash from grip then search stack.`,
      });
      return { ok: true };
    }

    case "install_emergent_resolve": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) return { ok: true };
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const card = state.cards[id]!;
      const cost = Math.max(0, (card.installCost ?? 0) - action.discount);
      if (state.runner.credits < cost) {
        state.runner.deck.push(id);
        log(state, `Emergent Creativity — cannot afford ${card.title}.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      log(
        state,
        `Emergent Creativity — install ${card.title} for ${cost}¢ (−${action.discount}).`,
      );
      return { ok: true };
    }

    case "may_install_diana_program_from_grip_ignoring_costs": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Diana's Hunt — no program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...programs.map((id) => ({
            id: `diana:${id}`,
            label: `Install ${state.cards[id]!.title} ignoring costs`,
            effect: fx.do({
              kind: "install_diana_program_resolve",
              cardId: id,
            }),
          })),
          {
            id: "diana-decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "install_diana_program_resolve": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || card.type !== "program") return { ok: true };
      const idx = state.runner.hand.indexOf(id);
      if (idx < 0) return { ok: true };
      state.runner.hand.splice(idx, 1);
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      if (!state.run) return { ok: true };
      state.run.dianaInstalledProgramIds = [
        ...(state.run.dianaInstalledProgramIds ?? []),
        id,
      ];
      log(state, `Diana's Hunt — install ${card.title} ignoring all costs.`);
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

    case "install_hayley_same_type_from_grip": {
      const lastId = state.turn.installedThisTurn.at(-1);
      const last = lastId ? state.cards[lastId] : null;
      if (!last?.type) {
        log(state, `Hayley — no install this turn.`);
        return { ok: true };
      }
      const typ = last.type;
      const grip = state.runner.hand.filter(
        (id) => state.cards[id]?.type === typ,
      );
      if (grip.length === 0) {
        log(state, `Hayley — no ${typ} in grip.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        grip.map((id) => ({
          id: `hayley:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: {
            op: "do",
            action: { kind: "install_hayley_grip_card", cardId: id },
          },
        }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Hayley — may install another ${typ} from grip.`,
      });
      return { ok: true };
    }

    case "install_hayley_grip_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.hand.includes(cardId)) {
        return {
          ok: false,
          error: "Hayley install — card not in grip.",
          cites: [],
        };
      }
      const cost = card.installCost ?? 0;
      if (state.runner.credits < cost) {
        return {
          ok: false,
          error: "Hayley install — insufficient credits.",
          cites: [],
        };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      state.turn.installedThisTurn.push(cardId);
      log(state, `Hayley — install ${card.title} for ${cost}¢.`);
      return { ok: true };
    }

    case "install_chatterjee_program_discount": {
      if (!source) return { ok: true };
      const discount = source.powerCounters ?? 0;
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Chatterjee University — no program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `chatterjee-install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "install_chatterjee_program_resolve",
            cardId: id,
            discount,
          }),
        })),
      });
      return { ok: true };
    }

    case "install_chatterjee_program_resolve": {
      if (!source) return { ok: true };
      const card = state.cards[action.cardId];
      if (!card || !state.runner.hand.includes(action.cardId)) {
        return { ok: true };
      }
      const cost = Math.max(0, (card.installCost ?? 0) - action.discount);
      if (state.runner.credits < cost) {
        log(state, `Chatterjee University — cannot afford ${card.title}.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.hand = state.runner.hand.filter(
        (id) => id !== action.cardId,
      );
      state.runner.installed.push(action.cardId);
      card.zone = "runner:installed";
      if ((source.powerCounters ?? 0) > 0) {
        source.powerCounters = (source.powerCounters ?? 0) - 1;
      }
      log(
        state,
        `Chatterjee University — install ${card.title} for ${cost}¢; remove 1 power.`,
      );
      return { ok: true };
    }

    case "install_compile_program": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "stack",
            label: "Search stack for a program",
            effect: fx.do({ kind: "search_compile", zone: "stack" }),
          },
          {
            id: "heap",
            label: "Search heap for a program",
            effect: fx.do({ kind: "search_compile", zone: "heap" }),
          },
        ],
      });
      return { ok: true };
    }

    case "install_compile_resolve": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const zone =
        action.zone === "stack" ? state.runner.deck : state.runner.discardPile;
      const idx = zone.indexOf(action.cardId);
      if (idx >= 0) zone.splice(idx, 1);
      card.zone = "runner:installed";
      card.rezzed = true;
      state.runner.installed.push(action.cardId);
      if (state.run) {
        state.run.winCompileInstalledProgramId = action.cardId;
      }
      if (action.zone === "stack") shuffleInPlace(state, state.runner.deck);
      log(state, `Compile — install ${card.title} ignoring costs.`);
      return { ok: true };
    }
    case "install_program_from_grip": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Savoir-faire — no program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `savoir-faire:${id}`,
          label: `Install ${state.cards[id]!.title} from grip`,
          effect: fx.do({
            kind: "install_program_from_grip_paying_cost",
            cardId: id,
          }),
        })),
        logLine: `Savoir-faire — install a program from grip (pay install cost).`,
      });
      return { ok: true };
    }
    case "install_instead": {
      if (state.run) state.run.skipBreach = true;
      removeCardFromCurrentZone(state, sourceId);
      state.runner.installed.push(sourceId);
      state.cards[sourceId]!.zone = "runner:installed";
      log(state, `Eden Shard — installed from grip instead of breaching R&D.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyRunnerInstallFromGripKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "install_from_grip_ignore_cost": {
      const counters = source.powerCounters ?? 0;
      const candidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (
          c.type !== "program" &&
          c.type !== "hardware" &&
          c.type !== "resource"
        ) {
          return false;
        }
        return (c.installCost ?? 0) <= counters;
      });
      if (candidates.length === 0) {
        log(state, `DaVinci — no eligible grip card (≤ ${counters}).`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((cardId) => ({
          id: `davinci:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} (ignore install cost)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_davinci_resolve" as const,
              cardId,
            },
          },
        })),
        logLine: `DaVinci — choose grip card to install (≤ ${counters}).`,
      });
      return { ok: true };
    }

    case "install_davinci_resolve": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      card.rezzed = true;
      log(state, `DaVinci — install ${card.title} ignoring install cost.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

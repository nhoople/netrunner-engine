/**
 * Effect IR: walking and fail-closed validation of effect trees.
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import { KNOWN_COND_OPS } from "./cond.js";
import { KNOWN_EFFECT_OPS } from "./effect.js";
import type { Effect } from "./effect.js";
import { KNOWN_PRIMITIVE_KINDS } from "./knownKinds.js";
import type { Primitive } from "./primitive.js";
import { CREDIT_TALLY_COUNT_SET } from "./shared.js";

/** Walk the AST; true if any leaf matches. */
export function effectContains(
  effect: Effect,
  pred: (p: Primitive) => boolean,
): boolean {
  switch (effect.op) {
    case "seq":
      return effect.effects.some((e) => effectContains(e, pred));
    case "do":
      return pred(effect.action);
    case "if":
      return (
        effectContains(effect.then, pred) ||
        (effect.else !== undefined && effectContains(effect.else, pred))
      );
    case "prevent":
      return false;
    case "choose":
      return effect.options.some((o) => effectContains(o.effect, pred));
    default: {
      const _e: never = effect;
      return _e;
    }
  }
}

/** Primitive fields that nest an Effect tree. */
const NESTED_EFFECT_FIELDS = [
  "then",
  "else",
  "onSuccess",
  "onFailure",
  "onAccess",
  "onDecline",
  "thenIfBroke",
  "ifBidsDiffer",
  "ifBidsMatch",
  "thenOnInstall",
  "cost",
  "instruction",
] as const;

/**
 * Fail-closed validation of a condition, including children of not / and / or.
 * Returns an error string if any op is unknown.
 */
export function validateCond(cond: unknown, path = "cond"): string | null {
  if (!cond || typeof cond !== "object") {
    return `${path}: not an object`;
  }
  const c = cond as Record<string, unknown>;
  if (typeof c.op !== "string" || !KNOWN_COND_OPS.has(c.op)) {
    return `${path}: unknown op ${JSON.stringify(c.op)}`;
  }
  if (c.op === "not") {
    return validateCond(c.cond, `${path}.cond`);
  }
  if (c.op === "and" || c.op === "or") {
    if (!Array.isArray(c.conds)) return `${path}.conds: not an array`;
    for (let i = 0; i < c.conds.length; i++) {
      const err = validateCond(c.conds[i], `${path}.conds[${i}]`);
      if (err) return err;
    }
  }
  return null;
}

export function validateEffectTree(
  effect: unknown,
  path = "effect",
): string | null {
  if (!effect || typeof effect !== "object") {
    return `${path}: not an object`;
  }
  const e = effect as Record<string, unknown>;
  if (typeof e.op !== "string" || !KNOWN_EFFECT_OPS.has(e.op)) {
    return `${path}: unknown op ${JSON.stringify(e.op)}`;
  }
  switch (e.op) {
    case "seq": {
      if (!Array.isArray(e.effects)) return `${path}.effects: not an array`;
      if (
        e.oneInstruction !== undefined &&
        typeof e.oneInstruction !== "boolean"
      ) {
        return `${path}.oneInstruction: must be a boolean`;
      }
      for (let i = 0; i < e.effects.length; i++) {
        const err = validateEffectTree(e.effects[i], `${path}.effects[${i}]`);
        if (err) return err;
      }
      return null;
    }
    case "do": {
      const action = e.action as Record<string, unknown> | undefined;
      if (!action || typeof action.kind !== "string") {
        return `${path}.action: missing kind`;
      }
      if (!KNOWN_PRIMITIVE_KINDS.has(action.kind)) {
        return `${path}.action: unknown primitive kind ${action.kind}`;
      }
      if (action.kind === "pump_strength") {
        const d = action.duration;
        if (d !== undefined && d !== "encounter" && d !== "run") {
          return `${path}.action.duration: must be "encounter" | "run"`;
        }
      }
      if (
        action.kind === "trash_program" ||
        action.kind === "trash_resource" ||
        action.kind === "trash_hardware" ||
        action.kind === "trash_hardware_install_cost_lte_last_trace_excess" ||
        action.kind === "trash_program_or_hardware" ||
        action.kind === "trash_resource_or_hardware" ||
        action.kind === "trash_installed_runner"
      ) {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
      }
      if (action.kind === "expose_up_to") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
      }
      if (action.kind === "trash_up_to_n_resources") {
        if (typeof action.n !== "number" || action.n < 1) {
          return `${path}.action.n: must be a positive number`;
        }
      }
      if (action.kind === "trash_installed_resources_with_any_subtype") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length < 1) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
        for (const s of action.subtypes) {
          if (typeof s !== "string") {
            return `${path}.action.subtypes: each entry must be a string`;
          }
        }
      }
      if (action.kind === "trash_installed_resource_with_subtype") {
        if (typeof action.subtype !== "string" || !action.subtype) {
          return `${path}.action.subtype: required non-empty string`;
        }
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
      }
      if (action.kind === "trash_ice_rezzed_this_run") {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
      }
      if (action.kind === "unless") {
        if (action.payer !== "corp" && action.payer !== "runner") {
          return `${path}.action.payer: must be corp or runner`;
        }
        const cErr = validateEffectTree(action.cost, `${path}.action.cost`);
        if (cErr) return cErr;
        const iErr = validateEffectTree(
          action.instruction,
          `${path}.action.instruction`,
        );
        if (iErr) return iErr;
      }
      if (
        (action.kind === "gain_credits" ||
          action.kind === "lose_credits" ||
          action.kind === "net_damage" ||
          action.kind === "meat_damage" ||
          action.kind === "give_tags" ||
          action.kind === "draw" ||
          action.kind === "gain_clicks" ||
          action.kind === "remove_bad_publicity" ||
          action.kind === "remove_tags") &&
        action.tally !== undefined
      ) {
        const tally = action.tally;
        if (!tally || typeof tally !== "object") {
          return `${path}.action.tally: must be an object`;
        }
        const count = (tally as { count?: unknown }).count;
        if (typeof count !== "string" || !CREDIT_TALLY_COUNT_SET.has(count)) {
          return `${path}.action.tally.count: unknown tally`;
        }
        const per = (tally as { per?: unknown }).per;
        if (per !== undefined && typeof per !== "number") {
          return `${path}.action.tally.per: must be a number`;
        }
        const base = (tally as { base?: unknown }).base;
        if (base !== undefined && typeof base !== "number") {
          return `${path}.action.tally.base: must be a number`;
        }
      }
      if (action.kind === "search_rd_type_to_hq") {
        const cardType = action.cardType;
        if (
          cardType !== "ice" &&
          cardType !== "agenda" &&
          cardType !== "operation" &&
          cardType !== "asset"
        ) {
          return `${path}.action.cardType: must be ice, agenda, operation, or asset`;
        }
      }
      if (action.kind === "trash_hq") {
        if (
          action.pick !== "first" &&
          action.pick !== "choose" &&
          action.pick !== "random"
        ) {
          return `${path}.action.pick: must be "first" | "choose" | "random"`;
        }
        if (
          action.amount !== undefined &&
          (typeof action.amount !== "number" || action.amount < 1)
        ) {
          return `${path}.action.amount: must be a positive number when present`;
        }
      }
      if (action.kind === "trash_encounter_ice_if_strength_lte") {
        if (typeof action.maxStrength !== "number") {
          return `${path}.action.maxStrength: must be a number`;
        }
      }
      if (
        action.kind === "place_advancements_on_self_per_faceup_archive_types"
      ) {
        if (
          action.base !== undefined &&
          (typeof action.base !== "number" || action.base < 0)
        ) {
          return `${path}.action.base: must be a non-negative number when present`;
        }
      }
      if (action.kind === "trace") {
        const sErr = validateEffectTree(action.onSuccess, `${path}.onSuccess`);
        if (sErr) return sErr;
        if (action.onFailure !== undefined) {
          const fErr = validateEffectTree(
            action.onFailure,
            `${path}.onFailure`,
          );
          if (fErr) return fErr;
        }
      }
      if (action.kind === "trace_strength_equal_source_advancements") {
        if (action.onSuccess !== undefined) {
          const sErr = validateEffectTree(
            action.onSuccess,
            `${path}.onSuccess`,
          );
          if (sErr) return sErr;
        }
      }
      if (action.kind === "swap_this_root_with_other_root_or_hq") {
        if (action.onSuccess !== undefined) {
          const sErr = validateEffectTree(
            action.onSuccess,
            `${path}.onSuccess`,
          );
          if (sErr) return sErr;
        }
      }
      if (action.kind === "swap_pick") {
        if (typeof action.thisRootCardId !== "string") {
          return `${path}.action.thisRootCardId: must be a string`;
        }
        if (typeof action.otherCardId !== "string") {
          return `${path}.action.otherCardId: must be a string`;
        }
        if (action.onSuccess !== undefined) {
          const sErr = validateEffectTree(
            action.onSuccess,
            `${path}.onSuccess`,
          );
          if (sErr) return sErr;
        }
      }
      if (action.kind === "choose_installed_runner_may_access") {
        const aErr = validateEffectTree(action.onAccess, `${path}.onAccess`);
        if (aErr) return aErr;
        const dErr = validateEffectTree(action.onDecline, `${path}.onDecline`);
        if (dErr) return dErr;
      }
      if (action.kind === "hangeki_runner_may_access") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: must be a string`;
        }
        const aErr = validateEffectTree(action.onAccess, `${path}.onAccess`);
        if (aErr) return aErr;
        const dErr = validateEffectTree(action.onDecline, `${path}.onDecline`);
        if (dErr) return dErr;
      }
      if (action.kind === "access_installed") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: must be a string`;
        }
        const aErr = validateEffectTree(action.onAccess, `${path}.onAccess`);
        if (aErr) return aErr;
      }
      if (action.kind === "peeping_tom_apply_type") {
        if (typeof action.cardType !== "string") {
          return `${path}.action.cardType: must be a string`;
        }
      }
      if (action.kind === "sabotage") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "allotted_clicks_next_turn") {
        if (action.side !== "corp" && action.side !== "runner") {
          return `${path}.action.side: must be "corp" | "runner"`;
        }
        if (
          typeof action.delta !== "number" ||
          !Number.isInteger(action.delta)
        ) {
          return `${path}.action.delta: must be an integer`;
        }
      }
      if (action.kind === "charge") {
        if (
          action.pick !== "self" &&
          action.pick !== "choose" &&
          action.pick !== "card"
        ) {
          return `${path}.action.pick: must be "self" | "choose" | "card"`;
        }
        if (action.pick === "card" && typeof action.cardId !== "string") {
          return `${path}.action.cardId: required when pick is "card"`;
        }
      }
      if (action.kind === "install_from_grip_discount") {
        if (action.thenOnInstall !== undefined) {
          const tErr = validateEffectTree(
            action.thenOnInstall,
            `${path}.action.thenOnInstall`,
          );
          if (tErr) return tErr;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
        if (!Array.isArray(action.types) || action.types.length === 0) {
          return `${path}.action.types: need non-empty array`;
        }
        const allowed = new Set(["program", "hardware", "resource"]);
        for (const t of action.types) {
          if (typeof t !== "string" || !allowed.has(t)) {
            return `${path}.action.types: each must be program|hardware|resource`;
          }
        }
        if (
          action.mayCharge !== undefined &&
          typeof action.mayCharge !== "boolean"
        ) {
          return `${path}.action.mayCharge: must be boolean when present`;
        }
      }
      if (action.kind === "install_grip_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (action.kind === "may_charge_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "rehost_to_ice") {
        if (typeof action.iceId !== "string") {
          return `${path}.action.iceId: required string`;
        }
      }
      if (action.kind === "flip_archives_ice_resolve_subroutine") {
        if (typeof action.iceId !== "string") {
          return `${path}.action.iceId: required string`;
        }
        if (typeof action.subIndex !== "number" || action.subIndex < 0) {
          return `${path}.action.subIndex: must be a non-negative number`;
        }
      }
      if (action.kind === "trash_encounter_ice_resolve_subroutine") {
        if (typeof action.subIndex !== "number" || action.subIndex < 0) {
          return `${path}.action.subIndex: must be a non-negative number`;
        }
      }
      if (action.kind === "set_named_server") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "set_chosen_server") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "play_psi_game") {
        if (typeof action.maxBid !== "number" || action.maxBid < 0) {
          return `${path}.action.maxBid: must be a non-negative number`;
        }
        if (action.ifBidsDiffer !== undefined) {
          const dErr = validateEffectTree(
            action.ifBidsDiffer,
            `${path}.action.ifBidsDiffer`,
          );
          if (dErr) return dErr;
        }
        if (action.ifBidsMatch !== undefined) {
          const mErr = validateEffectTree(
            action.ifBidsMatch,
            `${path}.action.ifBidsMatch`,
          );
          if (mErr) return mErr;
        }
      }
      if (action.kind === "search_stack_host_virus_or_weapon") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
      }
      if (
        action.kind === "host_stack_card_on_source" ||
        action.kind === "add_hosted_card_to_grip"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "host_copy_from_grip") {
        if (typeof action.title !== "string") {
          return `${path}.action.title: required string`;
        }
      }
      if (action.kind === "break_resolve") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
        if (typeof action.hostedId !== "string") {
          return `${path}.action.hostedId: required string`;
        }
      }
      if (
        action.kind === "install_hosted_program" ||
        action.kind === "install_hosted_card" ||
        action.kind === "host_grip_program_or_hardware_faceup" ||
        action.kind === "add_from_heap_to_stack_top" ||
        action.kind === "add_card_id_to_stack_bottom" ||
        action.kind === "trash_co_looked_rd_card" ||
        action.kind === "trash_cultivate_looked" ||
        action.kind === "cultivate_hq_looked"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "set_nested_encounter_then_resume_source") {
        if (typeof action.iceId !== "string") {
          return `${path}.action.iceId: required string`;
        }
      }
      if (action.kind === "search_rd_up_to_one_each_subtype_to_hq") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length < 1) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "may_search_rd_non_agenda_any_subtype_to_hq") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length < 1) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "may_host_bad_publicity_then") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
        if (!action.then) return `${path}.action.then: required`;
        const tErr = validateEffectTree(action.then, `${path}.action.then`);
        if (tErr) return tErr;
      }
      if (action.kind === "may_trash_hardware_from_grip_place_hosted_credits") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "trash_grip_hardware_place_hosted_credits") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "look_top_n_rd_trash_one_hq_one_arrange_rest") {
        if (typeof action.n !== "number" || action.n < 1) {
          return `${path}.action.n: must be a positive number`;
        }
      }
      if (action.kind === "reveal_top_n_rd_trash_one") {
        if (typeof action.n !== "number" || action.n < 1) {
          return `${path}.action.n: must be a positive number`;
        }
      }
      if (action.kind === "reveal_top_n_rd_trash_picked") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "rez_spend_credits_for_power_counters") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "may_corp_trash_climactic_ice") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "trash_climactic_ice") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "climactic_register_bonus_access") {
        if (
          action.amount !== undefined &&
          (typeof action.amount !== "number" || action.amount < 0)
        ) {
          return `${path}.action.amount: must be a non-negative number when present`;
        }
      }
      if (action.kind === "name_agenda") {
        if (typeof action.title !== "string") {
          return `${path}.action.title: required string`;
        }
      }
      if (action.kind === "draw_class_act_bottom_one_then") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "net_named") {
        if (typeof action.title !== "string") {
          return `${path}.action.title: required string`;
        }
      }
      if (action.kind === "set_aside_access_shuffle") {
        if (typeof action.installCost !== "number" || action.installCost < 1) {
          return `${path}.action.installCost: must be a positive number`;
        }
      }
      if (action.kind === "access_set_aside") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "host_hardware_on_icebreaker") {
        if (typeof action.icebreakerId !== "string") {
          return `${path}.action.icebreakerId: required string`;
        }
      }
      if (action.kind === "trash_rezzed_ice_gain_credits") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "trash_rezzed_ice_gain_credits_resolve") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "install_up_to_from_hq_paying_costs") {
        if (typeof action.max !== "number" || action.max < 0) {
          return `${path}.action.max: must be a non-negative number`;
        }
      }
      if (action.kind === "install_up_to_from_hq_paying_costs_continue") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "deja_vu_add_heap_cards") {
        if (!Array.isArray(action.cardIds)) {
          return `${path}.action.cardIds: required string[]`;
        }
      }
      if (action.kind === "search_stack_subtype_add_to_grip") {
        if (typeof action.subtype !== "string") {
          return `${path}.action.subtype: required string`;
        }
      }
      if (action.kind === "search_stack_subtype_add_to_grip_pick") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "trash_hq_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "resolve_pending_ability") {
        if (typeof action.pendingId !== "string") {
          return `${path}.action.pendingId: required string`;
        }
      }
      if (action.kind === "choose_cards") {
        if (
          !Array.isArray(action.candidates) ||
          !Array.isArray(action.picked)
        ) {
          return `${path}.action: candidates and picked are required lists`;
        }
        if (typeof action.count !== "number" || action.count < 0) {
          return `${path}.action.count: required number`;
        }
        if (action.then) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "may_trash_hq_then") {
        const tErr = validateEffectTree(action.then, `${path}.action.then`);
        if (tErr) return tErr;
      }
      if (action.kind === "forbid_runner_card_break_for_run") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "may_give_runner_credits_then") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        const tErr = validateEffectTree(action.then, `${path}.action.then`);
        if (tErr) return tErr;
      }
      if (action.kind === "blank_resource_until_corp_turn_end") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "limit_printed_breaks_on_source_for_run") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
      }
      if (action.kind === "install_stack_program") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "resolve_spark_of_inspiration") {
        if (
          action.discount !== undefined &&
          (typeof action.discount !== "number" || action.discount < 0)
        ) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (action.kind === "break_encounter_subroutine") {
        if (action.thenIfBroke !== undefined) {
          const tErr = validateEffectTree(
            action.thenIfBroke,
            `${path}.action.thenIfBroke`,
          );
          if (tErr) return tErr;
        }
      }
      if (action.kind === "may_return_non_virus_trojan_to_grip_place_hosted") {
        if (
          typeof action.hostedAmount !== "number" ||
          action.hostedAmount < 0
        ) {
          return `${path}.action.hostedAmount: must be a non-negative number`;
        }
      }
      if (action.kind === "take_hosted_bad_publicity") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "install_set_aside_program") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (
        action.kind ===
        "may_trash_other_installed_search_stack_same_type_install"
      ) {
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (
        action.kind === "trash_runner_rig_card" ||
        action.kind === "trash_runner_rig_card_record_program_cost"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "search_stack_type_install") {
        const allowed = new Set(["program", "hardware", "resource"]);
        if (
          typeof action.cardType !== "string" ||
          !allowed.has(action.cardType)
        ) {
          return `${path}.action.cardType: must be program|hardware|resource`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (action.kind === "install_stack_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (
        action.kind === "exclusive_choices_per_passed_ice" ||
        action.kind === "choose_exactly_n"
      ) {
        if (!Array.isArray(action.options) || action.options.length === 0) {
          return `${path}.action.options: need non-empty array`;
        }
        if (action.kind === "choose_exactly_n") {
          if (typeof action.n !== "number" || action.n < 1) {
            return `${path}.action.n: must be a positive number`;
          }
        }
        for (let i = 0; i < action.options.length; i++) {
          const opt = action.options[i] as Record<string, unknown>;
          if (typeof opt?.id !== "string" || typeof opt?.label !== "string") {
            return `${path}.action.options[${i}]: need id+label`;
          }
          const oErr = validateEffectTree(
            opt.effect,
            `${path}.action.options[${i}].effect`,
          );
          if (oErr) return oErr;
        }
      }
      if (action.kind === "gain_strength_this_turn") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "choose_icebreaker_gain_strength_this_turn") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "choose_ice_additional_rez_cost_this_turn") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "add_ice_additional_rez_cost_this_turn") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "install_hq_card_paying_costs") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "place_advancements_on") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "spend_enable_hosted_credits_for") {
        if (!Array.isArray(action.purposes) || action.purposes.length === 0) {
          return `${path}.action.purposes: need non-empty array`;
        }
      }
      if (action.kind === "move_upgrade_to_server_root") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "may_install_from_grip") {
        if (
          action.discount !== undefined &&
          typeof action.discount !== "number"
        ) {
          return `${path}.action.discount: must be a number (negative = surcharge)`;
        }
      }
      if (action.kind === "derez_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "lose_credits") {
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "lose_all_credits") {
        if (
          action.side !== "corp" &&
          action.side !== "runner" &&
          action.side !== "payer" &&
          action.side !== "controller"
        ) {
          return `${path}.action.side: must be corp|runner|payer|controller`;
        }
      }
      if (action.kind === "meat_damage") {
        if (
          action.cannotPrevent !== undefined &&
          typeof action.cannotPrevent !== "boolean"
        ) {
          return `${path}.action.cannotPrevent: must be boolean`;
        }
      }
      if (action.kind === "return_installed_corp_to_hq") {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
        if (
          action.unrezzedOnly !== undefined &&
          typeof action.unrezzedOnly !== "boolean"
        ) {
          return `${path}.action.unrezzedOnly: must be boolean`;
        }
      }
      if (action.kind === "place_advancements") {
        if (
          action.thenMayScore !== undefined &&
          typeof action.thenMayScore !== "boolean"
        ) {
          return `${path}.action.thenMayScore: must be boolean when present`;
        }
        if (
          action.anyInstalledIce !== undefined &&
          typeof action.anyInstalledIce !== "boolean"
        ) {
          return `${path}.action.anyInstalledIce: must be boolean when present`;
        }
        if (
          action.onlyRemoteRoot !== undefined &&
          typeof action.onlyRemoteRoot !== "boolean"
        ) {
          return `${path}.action.onlyRemoteRoot: must be boolean when present`;
        }
        if (
          action.pick !== undefined &&
          action.pick !== "first" &&
          action.pick !== "choose"
        ) {
          return `${path}.action.pick: must be first|choose`;
        }
        if (
          action.cannotScoreTargetThisTurn !== undefined &&
          typeof action.cannotScoreTargetThisTurn !== "boolean"
        ) {
          return `${path}.action.cannotScoreTargetThisTurn: must be boolean`;
        }
        if (
          action.unrezzedOnly !== undefined &&
          typeof action.unrezzedOnly !== "boolean"
        ) {
          return `${path}.action.unrezzedOnly: must be boolean`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "dividends") {
        if (typeof action.n !== "number" || action.n < 0) {
          return `${path}.action.n: must be a non-negative number`;
        }
      }
      if (action.kind === "place_agenda_counters_past") {
        if (typeof action.past !== "number" || action.past < 0) {
          return `${path}.action.past: must be a non-negative number`;
        }
        if (
          action.per !== undefined &&
          (typeof action.per !== "number" || action.per < 1)
        ) {
          return `${path}.action.per: must be a positive number`;
        }
      }
      if (action.kind === "remove_agenda_counters") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be non-negative number`;
        }
      }
      if (action.kind === "remove_virus_counters") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "trash_installed") {
        if (
          action.rezzedOnly !== undefined &&
          typeof action.rezzedOnly !== "boolean"
        ) {
          return `${path}.action.rezzedOnly: must be boolean`;
        }
        if (
          action.attackedServerOnly !== undefined &&
          typeof action.attackedServerOnly !== "boolean"
        ) {
          return `${path}.action.attackedServerOnly: must be boolean`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (
        action.kind === "install_archives_card_ignore_costs" ||
        action.kind === "install_archives_card_paying" ||
        action.kind === "install_hq_card_ignore_costs" ||
        action.kind === "search_rd_reveal_pick_install_or_hq"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (
        action.kind === "install_archives_card_ignore_costs" ||
        action.kind === "install_archives_card_paying" ||
        action.kind === "install_hq_card_ignore_costs"
      ) {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "install_from_archives") {
        if (!Array.isArray(action.types) || action.types.length === 0) {
          return `${path}.action.types: required non-empty array`;
        }
        for (const t of action.types) {
          if (
            t !== "agenda" &&
            t !== "asset" &&
            t !== "ice" &&
            t !== "upgrade"
          ) {
            return `${path}.action.types: invalid type ${t}`;
          }
        }
      }
      if (action.kind === "rfg_specific_heap_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "install_from_hq_or_archives") {
        if (
          action.excludeAgenda !== undefined &&
          typeof action.excludeAgenda !== "boolean"
        ) {
          return `${path}.action.excludeAgenda: must be boolean when present`;
        }
        if (
          action.excludeSourceServer !== undefined &&
          typeof action.excludeSourceServer !== "boolean"
        ) {
          return `${path}.action.excludeSourceServer: must be boolean when present`;
        }
        if (
          action.ignoreInstallCost !== undefined &&
          typeof action.ignoreInstallCost !== "boolean"
        ) {
          return `${path}.action.ignoreInstallCost: must be boolean when present`;
        }
        if (
          action.required !== undefined &&
          typeof action.required !== "boolean"
        ) {
          return `${path}.action.required: must be boolean when present`;
        }
      }
      if (action.kind === "install_hq_new_remotes_with_advancements") {
        if (typeof action.max !== "number" || action.max < 0) {
          return `${path}.action.max: must be a non-negative number`;
        }
        if (
          typeof action.advancements !== "number" ||
          action.advancements < 0
        ) {
          return `${path}.action.advancements: must be a non-negative number`;
        }
      }
      if (action.kind === "resolve_moon_pool") {
        if (typeof action.trashHqMax !== "number" || action.trashHqMax < 0) {
          return `${path}.action.trashHqMax: must be a non-negative number`;
        }
        if (
          typeof action.revealArchivesMax !== "number" ||
          action.revealArchivesMax < 0
        ) {
          return `${path}.action.revealArchivesMax: must be a non-negative number`;
        }
      }
      if (action.kind === "resolve_simulation_reset") {
        if (typeof action.trashHqMax !== "number" || action.trashHqMax < 0) {
          return `${path}.action.trashHqMax: must be a non-negative number`;
        }
      }
      if (action.kind === "search_rd_install_rez_by_printed_rez_cost") {
        if (typeof action.delta !== "number") {
          return `${path}.action.delta: must be a number`;
        }
      }
      if (action.kind === "resolve_deep_dive") {
        if (
          action.setAside !== undefined &&
          (typeof action.setAside !== "number" || action.setAside < 0)
        ) {
          return `${path}.action.setAside: must be a non-negative number`;
        }
        if (
          action.initialAccess !== undefined &&
          (typeof action.initialAccess !== "number" || action.initialAccess < 1)
        ) {
          return `${path}.action.initialAccess: must be a positive number`;
        }
      }
      if (action.kind === "score_self_as_agenda") {
        if (
          action.agendaPoints !== undefined &&
          typeof action.agendaPoints !== "number"
        ) {
          return `${path}.action.agendaPoints: must be number when present`;
        }
      }
      if (action.kind === "add_to_runner_score_as_agenda") {
        if (
          action.agendaPoints !== undefined &&
          typeof action.agendaPoints !== "number"
        ) {
          return `${path}.action.agendaPoints: must be number when present`;
        }
        if (action.addSubtypes !== undefined) {
          if (
            !Array.isArray(action.addSubtypes) ||
            action.addSubtypes.some((s) => typeof s !== "string")
          ) {
            return `${path}.action.addSubtypes: must be string[] when present`;
          }
        }
      }
      if (action.kind === "melies_set_face") {
        if (
          action.face !== "hq" &&
          action.face !== "rd" &&
          action.face !== "archives"
        ) {
          return `${path}.action.face: must be hq|rd|archives`;
        }
      }
      if (action.kind === "add_to_corp_score_as_agenda") {
        if (typeof action.agendaPoints !== "number") {
          return `${path}.action.agendaPoints: must be a number`;
        }
        if (
          action.cannotForfeit !== undefined &&
          typeof action.cannotForfeit !== "boolean"
        ) {
          return `${path}.action.cannotForfeit: must be boolean when present`;
        }
      }
      if (action.kind === "host_grip_card_facedown_then_draw") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "host_gmod_identity") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "rebirth_switch_to_identity") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "resolve_burner") {
        if (typeof action.reveal !== "number" || action.reveal < 0) {
          return `${path}.action.reveal: must be a non-negative number`;
        }
        if (typeof action.move !== "number" || action.move < 0) {
          return `${path}.action.move: must be a non-negative number`;
        }
      }
      if (action.kind === "breach_server_standalone") {
        if (typeof action.server !== "string" || !action.server) {
          return `${path}.action.server: required string`;
        }
        if (
          action.cannotAccessRoot !== undefined &&
          typeof action.cannotAccessRoot !== "boolean"
        ) {
          return `${path}.action.cannotAccessRoot: must be boolean when present`;
        }
      }
      if (
        action.kind === "may_corp_pay_credits_else_breach" ||
        action.kind === "breach_server_during_encounter"
      ) {
        if (
          action.server !== "hq" &&
          action.server !== "rd" &&
          action.server !== "archives"
        ) {
          return `${path}.action.server: must be hq|rd|archives`;
        }
        if (
          action.cannotAccessRoot !== undefined &&
          typeof action.cannotAccessRoot !== "boolean"
        ) {
          return `${path}.action.cannotAccessRoot: must be boolean when present`;
        }
        if (
          action.kind === "may_corp_pay_credits_else_breach" &&
          action.credits !== undefined &&
          (typeof action.credits !== "number" || action.credits < 0)
        ) {
          return `${path}.action.credits: must be a non-negative number when present`;
        }
      }
      if (action.kind === "queue_breaches_after_current") {
        if (
          !Array.isArray(action.servers) ||
          action.servers.length === 0 ||
          action.servers.some((s) => typeof s !== "string" || !s)
        ) {
          return `${path}.action.servers: must be a non-empty string array`;
        }
        if (
          action.cannotAccessRoot !== undefined &&
          typeof action.cannotAccessRoot !== "boolean"
        ) {
          return `${path}.action.cannotAccessRoot: must be boolean when present`;
        }
      }
      if (action.kind === "break_host_subroutine") {
        if (
          action.maxSubs !== undefined &&
          (typeof action.maxSubs !== "number" || action.maxSubs < 1)
        ) {
          return `${path}.action.maxSubs: must be a positive number when present`;
        }
        if (
          action.requireSubtype !== undefined &&
          typeof action.requireSubtype !== "string"
        ) {
          return `${path}.action.requireSubtype: must be string when present`;
        }
      }
      if (action.kind === "resolve_wizard_chest") {
        if (typeof action.untilCount !== "number" || action.untilCount < 1) {
          return `${path}.action.untilCount: must be a positive number`;
        }
        if (typeof action.ignoreAllCosts !== "boolean") {
          return `${path}.action.ignoreAllCosts: must be boolean`;
        }
      }
      if (action.kind === "check_assassination_win") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "may_pay_credits_for_core_damage") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        if (typeof action.damage !== "number" || action.damage < 0) {
          return `${path}.action.damage: must be a non-negative number`;
        }
      }
      if (action.kind === "may_pay_credits_for_core_damage_per_advancement") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (
        action.kind ===
        "may_pay_credits_for_core_damage_per_ice_protecting_this_server"
      ) {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "rearrange_ice") {
        if (action.chooser !== "corp" && action.chooser !== "runner") {
          return `${path}.action.chooser: must be "corp" or "runner"`;
        }
        if (!Array.isArray(action.serverIds)) {
          return `${path}.action.serverIds: must be a server id array`;
        }
      }
      if (action.kind === "gain_credits_from_ice_advancements") {
        if (typeof action.iceId !== "string" || !action.iceId) {
          return `${path}.action.iceId: required non-empty string`;
        }
      }
      if (action.kind === "gain_one_subtype_until_derez") {
        if (typeof action.subtype !== "string" || !action.subtype) {
          return `${path}.action.subtype: required non-empty string`;
        }
      }
      if (action.kind === "host_grip_pw_card_with_power_equal_install_cost") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: required non-empty string`;
        }
      }
      if (action.kind === "remove_power_from_hosted_card_id_install_at_zero") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: required non-empty string`;
        }
      }
      if (action.kind === "install_hosted_card_ignore_costs") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: required non-empty string`;
        }
      }
      if (action.kind === "may_pay_credits_for_net_damage_per_advancement") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        if (typeof action.per !== "number" || action.per < 1) {
          return `${path}.action.per: must be a positive number`;
        }
      }
      if (
        action.kind === "may_pay_credits_for_trash_programs_per_advancement"
      ) {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (
        action.kind ===
        "may_pay_credits_for_shuffle_installed_runner_per_advancement"
      ) {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "trash_n_programs_remaining") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "shuffle_n_installed_runner_remaining") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "choose_remote") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "install_continue") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
        if (typeof action.serverId !== "string" || !action.serverId) {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "search_stack_subtype_may_install") {
        if (typeof action.subtype !== "string" || !action.subtype.trim()) {
          return `${path}.action.subtype: must be a non-empty string`;
        }
      }
      if (action.kind === "grant_chosen_ice_subtypes_until_end_of_turn") {
        if (
          !Array.isArray(action.subtypes) ||
          action.subtypes.length === 0 ||
          action.subtypes.some((s) => typeof s !== "string" || !s.trim())
        ) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "grant_ice_subtypes_until_end_of_turn") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
        if (
          !Array.isArray(action.subtypes) ||
          action.subtypes.length === 0 ||
          action.subtypes.some((s) => typeof s !== "string" || !s.trim())
        ) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "place_up_to") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
        if (typeof action.creditsPer !== "number" || action.creditsPer < 0) {
          return `${path}.action.creditsPer: must be a non-negative number`;
        }
      }
      if (action.kind === "place_on") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        if (typeof action.creditsPer !== "number" || action.creditsPer < 0) {
          return `${path}.action.creditsPer: must be a non-negative number`;
        }
      }
      if (action.kind === "return_rezzed_to_hq_gain_rez_cost") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
      }
      if (action.kind === "take_hosted_credits_skip_breach") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "add_archives_card_to_rd_top") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
      }
      if (action.kind === "oversight_ai_host_on_ice") {
        if (typeof action.iceId !== "string" || !action.iceId) {
          return `${path}.action.iceId: must be a non-empty string`;
        }
      }
      if (action.kind === "host_on_ice") {
        if (typeof action.iceId !== "string" || !action.iceId) {
          return `${path}.action.iceId: must be a non-empty string`;
        }
      }
      if (action.kind === "rfg_installed_with_any_subtype") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length === 0) {
          return `${path}.action.subtypes: required non-empty string array`;
        }
        for (const s of action.subtypes) {
          if (typeof s !== "string") {
            return `${path}.action.subtypes: each entry must be a string`;
          }
        }
        if (action.pick !== "choose" && action.pick !== "first") {
          return `${path}.action.pick: must be choose|first`;
        }
      }
      if (action.kind === "rfg_installed_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "shuffle_up_to_n_distinct_heap_titles_into_stack") {
        if (typeof action.max !== "number" || action.max < 0) {
          return `${path}.action.max: must be a non-negative number`;
        }
      }
      if (
        action.kind ===
        "shuffle_up_to_n_distinct_heap_titles_into_stack_continue"
      ) {
        if (
          typeof action.maxRemaining !== "number" ||
          action.maxRemaining < 0
        ) {
          return `${path}.action.maxRemaining: must be a non-negative number`;
        }
        if (!Array.isArray(action.selected)) {
          return `${path}.action.selected: required string array`;
        }
        if (!Array.isArray(action.usedTitles)) {
          return `${path}.action.usedTitles: required string array`;
        }
      }
      if (action.kind === "core_damage") {
        if (
          action.interactive !== undefined &&
          typeof action.interactive !== "boolean"
        ) {
          return `${path}.action.interactive: must be boolean when present`;
        }
        if (
          action.preventByLoseAllClicks !== undefined &&
          typeof action.preventByLoseAllClicks !== "boolean"
        ) {
          return `${path}.action.preventByLoseAllClicks: must be boolean when present`;
        }
        if (
          action.cannotPrevent !== undefined &&
          typeof action.cannotPrevent !== "boolean"
        ) {
          return `${path}.action.cannotPrevent: must be boolean when present`;
        }
      }
      if (action.kind === "score_agenda_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "remove_advancements") {
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "trash_hq") {
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "may_derez_installed") {
        if (
          action.excludeSelf !== undefined &&
          typeof action.excludeSelf !== "boolean"
        ) {
          return `${path}.action.excludeSelf: must be boolean when present`;
        }
        if (
          action.onlyIce !== undefined &&
          typeof action.onlyIce !== "boolean"
        ) {
          return `${path}.action.onlyIce: must be boolean when present`;
        }
        if (
          action.excludeProtectingAttackedServer !== undefined &&
          typeof action.excludeProtectingAttackedServer !== "boolean"
        ) {
          return `${path}.action.excludeProtectingAttackedServer: must be boolean when present`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "trash_corp_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "may_trash_installed") {
        if (
          action.excludeSelf !== undefined &&
          typeof action.excludeSelf !== "boolean"
        ) {
          return `${path}.action.excludeSelf: must be boolean when present`;
        }
        if (
          action.rezzedOnly !== undefined &&
          typeof action.rezzedOnly !== "boolean"
        ) {
          return `${path}.action.rezzedOnly: must be boolean when present`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "trash_must_installed") {
        if (
          action.excludeSelf !== undefined &&
          typeof action.excludeSelf !== "boolean"
        ) {
          return `${path}.action.excludeSelf: must be boolean when present`;
        }
      }
      for (const field of NESTED_EFFECT_FIELDS) {
        if (action[field] !== undefined) {
          const nestedErr = validateEffectTree(
            action[field],
            `${path}.action.${field}`,
          );
          if (nestedErr) return nestedErr;
        }
      }
      return null;
    }
    case "if": {
      const condErr = validateCond(e.cond, `${path}.cond`);
      if (condErr) return condErr;
      const tErr = validateEffectTree(e.then, `${path}.then`);
      if (tErr) return tErr;
      if (e.else !== undefined) {
        const elseErr = validateEffectTree(e.else, `${path}.else`);
        if (elseErr) return elseErr;
      }
      return null;
    }
    case "prevent":
      if (e.forbid !== "jack_out") {
        return `${path}: unknown forbid ${JSON.stringify(e.forbid)}`;
      }
      return null;
    case "choose": {
      if (e.chooser !== "corp" && e.chooser !== "runner") {
        return `${path}.chooser: must be corp|runner`;
      }
      if (!Array.isArray(e.options) || e.options.length === 0) {
        return `${path}.options: need non-empty array`;
      }
      for (let i = 0; i < e.options.length; i++) {
        const opt = e.options[i] as Record<string, unknown>;
        if (typeof opt?.id !== "string" || typeof opt?.label !== "string") {
          return `${path}.options[${i}]: need id+label`;
        }
        const oErr = validateEffectTree(
          opt.effect,
          `${path}.options[${i}].effect`,
        );
        if (oErr) return oErr;
      }
      return null;
    }
    default:
      return `${path}: unhandled op`;
  }
}

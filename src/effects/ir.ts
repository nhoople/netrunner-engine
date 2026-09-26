/**
 * Minimal effect IR for card data / stubs.
 * Hand-authored AST — not a CR / nodes.json compiler.
 *
 * Shape: seq | do | if | prevent | choose
 * Unknown IR nodes fail closed at load/eval time.
 */

export type SideRef = "corp" | "runner" | "payer" | "controller";

/** How long a breaker strength pump lasts. Default: encounter. */
export type PumpDuration = "encounter" | "run";

/** Leaf actions the host knows how to execute. */
export type Primitive =
  | { kind: "end_the_run" }
  | { kind: "gain_credits"; side: SideRef; amount: number }
  | { kind: "lose_credits"; side: SideRef; amount: number }
  | {
      kind: "pump_strength";
      amount: number;
      /** Default encounter-scoped; `"run"` lasts until the run ends. */
      duration?: PumpDuration;
    }
  | { kind: "fortify_ice"; amount: number }
  | { kind: "weaken_ice"; amount: number }
  | { kind: "net_damage"; amount: number }
  | { kind: "meat_damage"; amount: number }
  /** Canonical core damage (CR §10.4.2b). */
  | { kind: "core_damage"; amount: number }
  /** Older synonym for core_damage (CR §10.4.2c). */
  | { kind: "brain_damage"; amount: number }
  | { kind: "give_tags"; amount: number }
  | { kind: "trash_program"; pick: "first" | "choose"; aiOnly?: boolean }
  | { kind: "trash_resource"; pick: "first" | "choose" }
  | {
      kind: "trace";
      strength: number;
      onSuccess: Effect;
      onFailure?: Effect;
      /** When true, leave state.trace pending for host intents. */
      interactive?: boolean;
    }
  | { kind: "draw"; side: SideRef; amount: number }
  | { kind: "add_agenda_counter"; amount: number }
  | {
      kind: "add_agenda_counters_from_overadvance";
      past: number;
      /** Counters = floor((advancements - past) / per). Default per=1. */
      per?: number;
    }
  | { kind: "lose_clicks"; side: SideRef; amount: number }
  | { kind: "gain_clicks"; side: SideRef; amount: number }
  | { kind: "take_hosted_credits"; amount: number }
  | { kind: "place_hosted_credits"; amount: number }
  | { kind: "add_virus_counter"; amount: number }
  | { kind: "gain_credits_per_virus"; per: number }
  | { kind: "increase_hand_size"; side: SideRef; amount: number }
  | { kind: "trash_hq"; pick: "first" | "choose" }
  | { kind: "trash_hardware"; pick: "first" | "choose" }
  | {
      kind: "trash_program_or_hardware";
      pick: "first" | "choose";
    }
  | { kind: "shuffle_hq_to_rd"; amount: number }
  | { kind: "shuffle_archives_to_rd"; amount: number }
  | { kind: "net_damage_agenda_points_this_turn" }
  | { kind: "forbid_scoring_agendas_this_turn" }
  | { kind: "place_advancements"; amount: number; preferNotInstalledThisTurn?: boolean }
  | { kind: "meat_damage_per_advancement" }
  | { kind: "net_damage_per_advancement"; base?: number }
  | { kind: "trash_self" }
  | { kind: "archives_to_hq"; amount: number }
  | { kind: "trash_installed_runner"; pick: "first" | "choose" }
  | { kind: "forbid_steal_trash_this_run" }
  | { kind: "install_from_hq_or_archives" }
  | { kind: "install_ice_inward_free" }
  | { kind: "break_host_subroutine" }
  | {
      kind: "break_encounter_subroutine";
      /** Encountered ice must include this subtype. */
      requireSubtype?: string;
    }
  | { kind: "offer_jack_out" }
  | { kind: "search_stack_icebreaker"; mayInstallIfSuccessfulRunThisTurn?: boolean }
  | { kind: "search_rd_non_agenda" }
  | { kind: "search_rd_to_hq"; amount: number }
  | { kind: "swap_two_ice" }
  | { kind: "rez_ice_ignoring_costs" }
  | { kind: "may_install_from_grip" }
  | { kind: "remove_tags"; amount: number }
  | { kind: "lose_credits_per_advancement"; per: number }
  | { kind: "bypass_current_ice"; requireSubtype?: string }
  | { kind: "remove_power_counter"; amount: number }
  | { kind: "pay_credits_or_etr"; side: SideRef; amount: number }
  | { kind: "meat_damage_stolen_last_turn" }
  | { kind: "derez_ice"; pick: "first" | "choose" }
  | { kind: "install_and_rez_asset_or_upgrade_free" }
  | { kind: "may_return_self_to_grip"; creditCost: number }
  | { kind: "return_source_to_grip" }
  | { kind: "install_resource_discount"; discount: number }
  | { kind: "give_bad_publicity"; amount: number }
  | { kind: "reveal_hq_gain_credits"; maxCards: number; creditsEach: number }
  | { kind: "move_advancements"; amount: number }
  | { kind: "trash_passed_unrezzed_ice" }
  | { kind: "forged_activation_orders" }
  | { kind: "install_program_from_stack_or_heap_free" }
  | { kind: "place_advancements_x_from_tags" }
  | { kind: "troubleshooter_fortify" }
  | { kind: "resolve_bioroid_subroutine" }
  | { kind: "host_ice_program_on_self" }
  | { kind: "return_subliminal_from_archives" }
  | { kind: "aesop_trash_for_credits"; amount: number }
  | { kind: "ayla_set_aside_to_grip" }
  /** Sabotage N — Corp trashes N from HQ and/or R&D top (CR §10.12). */
  | { kind: "sabotage"; amount: number; interactive?: boolean }
  /** Identify the mark (CR §10.11.2); no-op if already designated this turn. */
  | { kind: "identify_mark" }
  /**
   * Start a run on the current mark (CR §10.11).
   * Queues `pendingStartRunOnMark` for the host to begin the run after the
   * current effect tree (e.g. Carpe Diem may-run choice).
   * No-op if there is no mark.
   */
  | { kind: "start_run_on_mark" }
  /**
   * Charge — place 1 power counter on a card that already has ≥1 (CR §10.10).
   * `self` targets the source; `choose` picks among the controller's installed
   * chargeable cards; `card` targets a specific instance (pending options).
   */
  | {
      kind: "charge";
      pick: "self" | "choose" | "card";
      cardId?: string;
    };

export type Cond =
  | { op: "true" }
  | { op: "false" }
  | { op: "during_run" }
  | { op: "source_is_breaker" }
  | { op: "source_is_ice" }
  | { op: "grip_nonempty" }
  | { op: "has_installed_program" }
  | { op: "runner_tagged" }
  | { op: "clicks_remaining"; side: SideRef }
  | { op: "credits_lte"; side: SideRef; amount: number }
  | { op: "protecting_remote" }
  | { op: "hq_nonempty" }
  | { op: "has_installed_resource" }
  | { op: "grip_count_odd" }
  | { op: "successful_run_this_turn" }
  | { op: "attacking_central" }
  | { op: "attacking_rd" }
  | { op: "attacking_hq" }
  | { op: "advancements_gte"; amount: number }
  | { op: "has_mark" }
  | { op: "attacking_mark" };

export type ChoiceOption = {
  id: string;
  label: string;
  effect: Effect;
};

export type Effect =
  | { op: "seq"; effects: Effect[] }
  | { op: "do"; action: Primitive }
  | { op: "if"; cond: Cond; then: Effect; else?: Effect }
  | { op: "prevent"; forbid: "jack_out" }
  | {
      op: "choose";
      chooser: "corp" | "runner";
      options: ChoiceOption[];
    };

/** Known primitive kinds — used by card loader fail-closed checks. */
export const KNOWN_PRIMITIVE_KINDS = new Set([
  "end_the_run",
  "gain_credits",
  "lose_credits",
  "pump_strength",
  "fortify_ice",
  "weaken_ice",
  "net_damage",
  "meat_damage",
  "core_damage",
  "brain_damage",
  "give_tags",
  "trash_program",
  "trash_resource",
  "trace",
  "draw",
  "add_agenda_counter",
  "add_agenda_counters_from_overadvance",
  "lose_clicks",
  "gain_clicks",
  "take_hosted_credits",
  "place_hosted_credits",
  "add_virus_counter",
  "gain_credits_per_virus",
  "increase_hand_size",
  "trash_hq",
  "trash_hardware",
  "trash_program_or_hardware",
  "shuffle_hq_to_rd",
  "shuffle_archives_to_rd",
  "net_damage_agenda_points_this_turn",
  "forbid_scoring_agendas_this_turn",
  "place_advancements",
  "meat_damage_per_advancement",
  "net_damage_per_advancement",
  "trash_self",
  "archives_to_hq",
  "trash_installed_runner",
  "forbid_steal_trash_this_run",
  "install_from_hq_or_archives",
  "install_ice_inward_free",
  "break_host_subroutine",
  "break_encounter_subroutine",
  "offer_jack_out",
  "search_stack_icebreaker",
  "search_rd_non_agenda",
  "search_rd_to_hq",
  "swap_two_ice",
  "rez_ice_ignoring_costs",
  "may_install_from_grip",
  "remove_tags",
  "lose_credits_per_advancement",
  "bypass_current_ice",
  "remove_power_counter",
  "pay_credits_or_etr",
  "meat_damage_stolen_last_turn",
  "derez_ice",
  "install_and_rez_asset_or_upgrade_free",
  "may_return_self_to_grip",
  "return_source_to_grip",
  "install_resource_discount",
  "give_bad_publicity",
  "reveal_hq_gain_credits",
  "move_advancements",
  "trash_passed_unrezzed_ice",
  "forged_activation_orders",
  "install_program_from_stack_or_heap_free",
  "place_advancements_x_from_tags",
  "troubleshooter_fortify",
  "resolve_bioroid_subroutine",
  "host_ice_program_on_self",
  "return_subliminal_from_archives",
  "aesop_trash_for_credits",
  "ayla_set_aside_to_grip",
  "sabotage",
  "identify_mark",
  "start_run_on_mark",
  "charge",
]);

export const KNOWN_EFFECT_OPS = new Set([
  "seq",
  "do",
  "if",
  "prevent",
  "choose",
]);
export const KNOWN_COND_OPS = new Set([
  "true",
  "false",
  "during_run",
  "source_is_breaker",
  "source_is_ice",
  "grip_nonempty",
  "has_installed_program",
  "runner_tagged",
  "clicks_remaining",
  "credits_lte",
  "protecting_remote",
  "hq_nonempty",
  "has_installed_resource",
  "grip_count_odd",
  "successful_run_this_turn",
  "attacking_central",
  "attacking_rd",
  "attacking_hq",
  "advancements_gte",
  "has_mark",
  "attacking_mark",
]);

/** Construction helpers for stubs / tests. */
export const fx = {
  seq: (...effects: Effect[]): Effect => ({ op: "seq", effects }),
  do: (action: Primitive): Effect => ({ op: "do", action }),
  if: (cond: Cond, then: Effect, elseEffect?: Effect): Effect => ({
    op: "if",
    cond,
    then,
    ...(elseEffect !== undefined ? { else: elseEffect } : {}),
  }),
  prevent: (forbid: "jack_out"): Effect => ({ op: "prevent", forbid }),
  choose: (
    chooser: "corp" | "runner",
    options: ChoiceOption[],
  ): Effect => ({ op: "choose", chooser, options }),
  etr: (): Effect => fx.do({ kind: "end_the_run" }),
  gainCredits: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "gain_credits", side, amount }),
  loseCredits: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "lose_credits", side, amount }),
  pump: (amount: number, duration: PumpDuration = "encounter"): Effect =>
    fx.do({
      kind: "pump_strength",
      amount,
      ...(duration !== "encounter" ? { duration } : {}),
    }),
  fortify: (amount: number): Effect => fx.do({ kind: "fortify_ice", amount }),
  weakenIce: (amount: number): Effect => fx.do({ kind: "weaken_ice", amount }),
  netDamage: (amount: number): Effect => fx.do({ kind: "net_damage", amount }),
  meatDamage: (amount: number): Effect => fx.do({ kind: "meat_damage", amount }),
  /** Prefer for printed "core damage" (CR §10.4.2b). */
  coreDamage: (amount: number): Effect =>
    fx.do({ kind: "core_damage", amount }),
  /** Alias of coreDamage (CR §10.4.2c "brain damage"). */
  brainDamage: (amount: number): Effect =>
    fx.do({ kind: "brain_damage", amount }),
  giveTags: (amount: number): Effect => fx.do({ kind: "give_tags", amount }),
  trashProgram: (
    pick: "first" | "choose" = "first",
    aiOnly = false,
  ): Effect =>
    fx.do({
      kind: "trash_program",
      pick,
      ...(aiOnly ? { aiOnly: true } : {}),
    }),
  trashResource: (pick: "first" | "choose" = "first"): Effect =>
    fx.do({ kind: "trash_resource", pick }),
  draw: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "draw", side, amount }),
  loseClicks: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "lose_clicks", side, amount }),
  gainClicks: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "gain_clicks", side, amount }),
  takeHostedCredits: (amount: number): Effect =>
    fx.do({ kind: "take_hosted_credits", amount }),
  placeHostedCredits: (amount: number): Effect =>
    fx.do({ kind: "place_hosted_credits", amount }),
  addVirusCounter: (amount: number): Effect =>
    fx.do({ kind: "add_virus_counter", amount }),
  gainCreditsPerVirus: (per: number): Effect =>
    fx.do({ kind: "gain_credits_per_virus", per }),
  increaseHandSize: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "increase_hand_size", side, amount }),
  trashHq: (pick: "first" | "choose" = "first"): Effect =>
    fx.do({ kind: "trash_hq", pick }),
  trashHardware: (pick: "first" | "choose" = "first"): Effect =>
    fx.do({ kind: "trash_hardware", pick }),
  trashProgramOrHardware: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_program_or_hardware", pick }),
  shuffleHqToRd: (amount: number): Effect =>
    fx.do({ kind: "shuffle_hq_to_rd", amount }),
  shuffleArchivesToRd: (amount: number): Effect =>
    fx.do({ kind: "shuffle_archives_to_rd", amount }),
  netDamageAgendaPointsThisTurn: (): Effect =>
    fx.do({ kind: "net_damage_agenda_points_this_turn" }),
  forbidScoringAgendasThisTurn: (): Effect =>
    fx.do({ kind: "forbid_scoring_agendas_this_turn" }),
  placeAdvancements: (
    amount: number,
    preferNotInstalledThisTurn = false,
  ): Effect =>
    fx.do({
      kind: "place_advancements",
      amount,
      ...(preferNotInstalledThisTurn
        ? { preferNotInstalledThisTurn: true }
        : {}),
    }),
  meatDamagePerAdvancement: (): Effect =>
    fx.do({ kind: "meat_damage_per_advancement" }),
  netDamagePerAdvancement: (base = 0): Effect =>
    fx.do({ kind: "net_damage_per_advancement", base }),
  trashSelf: (): Effect => fx.do({ kind: "trash_self" }),
  archivesToHq: (amount: number): Effect =>
    fx.do({ kind: "archives_to_hq", amount }),
  trashInstalledRunner: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_installed_runner", pick }),
  forbidStealTrashThisRun: (): Effect =>
    fx.do({ kind: "forbid_steal_trash_this_run" }),
  installFromHqOrArchives: (): Effect =>
    fx.do({ kind: "install_from_hq_or_archives" }),
  installIceInwardFree: (): Effect =>
    fx.do({ kind: "install_ice_inward_free" }),
  breakHostSubroutine: (): Effect =>
    fx.do({ kind: "break_host_subroutine" }),
  breakEncounterSubroutine: (requireSubtype?: string): Effect =>
    fx.do({
      kind: "break_encounter_subroutine",
      ...(requireSubtype ? { requireSubtype } : {}),
    }),
  offerJackOut: (): Effect => fx.do({ kind: "offer_jack_out" }),
  searchStackIcebreaker: (
    mayInstallIfSuccessfulRunThisTurn = false,
  ): Effect =>
    fx.do({
      kind: "search_stack_icebreaker",
      ...(mayInstallIfSuccessfulRunThisTurn
        ? { mayInstallIfSuccessfulRunThisTurn: true }
        : {}),
    }),
  searchRdNonAgenda: (): Effect => fx.do({ kind: "search_rd_non_agenda" }),
  searchRdToHq: (amount = 1): Effect =>
    fx.do({ kind: "search_rd_to_hq", amount }),
  swapTwoIce: (): Effect => fx.do({ kind: "swap_two_ice" }),
  rezIceIgnoringCosts: (): Effect =>
    fx.do({ kind: "rez_ice_ignoring_costs" }),
  mayInstallFromGrip: (): Effect => fx.do({ kind: "may_install_from_grip" }),
  removeTags: (amount: number): Effect =>
    fx.do({ kind: "remove_tags", amount }),
  loseCreditsPerAdvancement: (per: number): Effect =>
    fx.do({ kind: "lose_credits_per_advancement", per }),
  bypassCurrentIce: (requireSubtype?: string): Effect =>
    fx.do({
      kind: "bypass_current_ice",
      ...(requireSubtype ? { requireSubtype } : {}),
    }),
  removePowerCounter: (amount: number): Effect =>
    fx.do({ kind: "remove_power_counter", amount }),
  payCreditsOrEtr: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "pay_credits_or_etr", side, amount }),
  meatDamageStolenLastTurn: (): Effect =>
    fx.do({ kind: "meat_damage_stolen_last_turn" }),
  derezIce: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "derez_ice", pick }),
  installAndRezAssetOrUpgradeFree: (): Effect =>
    fx.do({ kind: "install_and_rez_asset_or_upgrade_free" }),
  mayReturnSelfToGrip: (creditCost: number): Effect =>
    fx.do({ kind: "may_return_self_to_grip", creditCost }),
  installResourceDiscount: (discount: number): Effect =>
    fx.do({ kind: "install_resource_discount", discount }),
  giveBadPublicity: (amount: number): Effect =>
    fx.do({ kind: "give_bad_publicity", amount }),
  revealHqGainCredits: (maxCards: number, creditsEach: number): Effect =>
    fx.do({ kind: "reveal_hq_gain_credits", maxCards, creditsEach }),
  moveAdvancements: (amount: number): Effect =>
    fx.do({ kind: "move_advancements", amount }),
  trashPassedUnrezzedIce: (): Effect =>
    fx.do({ kind: "trash_passed_unrezzed_ice" }),
  forgedActivationOrders: (): Effect =>
    fx.do({ kind: "forged_activation_orders" }),
  installProgramFromStackOrHeapFree: (): Effect =>
    fx.do({ kind: "install_program_from_stack_or_heap_free" }),
  placeAdvancementsXFromTags: (): Effect =>
    fx.do({ kind: "place_advancements_x_from_tags" }),
  troubleshooterFortify: (): Effect =>
    fx.do({ kind: "troubleshooter_fortify" }),
  resolveBioroidSubroutine: (): Effect =>
    fx.do({ kind: "resolve_bioroid_subroutine" }),
  hostIceProgramOnSelf: (): Effect =>
    fx.do({ kind: "host_ice_program_on_self" }),
  returnSubliminalFromArchives: (): Effect =>
    fx.do({ kind: "return_subliminal_from_archives" }),
  aesopTrashForCredits: (amount: number): Effect =>
    fx.do({ kind: "aesop_trash_for_credits", amount }),
  aylaSetAsideToGrip: (): Effect =>
    fx.do({ kind: "ayla_set_aside_to_grip" }),
  sabotage: (amount: number, interactive = false): Effect =>
    fx.do({
      kind: "sabotage",
      amount,
      ...(interactive ? { interactive: true } : {}),
    }),
  identifyMark: (): Effect => fx.do({ kind: "identify_mark" }),
  startRunOnMark: (): Effect => fx.do({ kind: "start_run_on_mark" }),
  chargeSelf: (): Effect => fx.do({ kind: "charge", pick: "self" }),
  chargeChoose: (): Effect => fx.do({ kind: "charge", pick: "choose" }),
  chargeCard: (cardId: string): Effect =>
    fx.do({ kind: "charge", pick: "card", cardId }),
  addAgendaCounter: (amount: number): Effect =>
    fx.do({ kind: "add_agenda_counter", amount }),
  addAgendaCountersFromOveradvance: (past: number, per = 1): Effect =>
    fx.do({
      kind: "add_agenda_counters_from_overadvance",
      past,
      ...(per !== 1 ? { per } : {}),
    }),
  trace: (
    strength: number,
    onSuccess: Effect,
    onFailure?: Effect,
    interactive = false,
  ): Effect =>
    fx.do({
      kind: "trace",
      strength,
      onSuccess,
      ...(onFailure !== undefined ? { onFailure } : {}),
      interactive,
    }),
};

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

/**
 * Fail-closed validation of an Effect tree.
 * Returns an error string if any node/primitive is unknown.
 */
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
        if (
          d !== undefined &&
          d !== "encounter" &&
          d !== "run"
        ) {
          return `${path}.action.duration: must be "encounter" | "run"`;
        }
      }
      if (
        action.kind === "trash_program" ||
        action.kind === "trash_resource" ||
        action.kind === "trash_hq" ||
        action.kind === "trash_hardware" ||
        action.kind === "trash_program_or_hardware" ||
        action.kind === "trash_installed_runner"
      ) {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
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
      if (action.kind === "sabotage") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
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
      return null;
    }
    case "if": {
      const cond = e.cond as Record<string, unknown> | undefined;
      if (!cond || typeof cond.op !== "string" || !KNOWN_COND_OPS.has(cond.op)) {
        return `${path}.cond: unknown op ${JSON.stringify(cond?.op)}`;
      }
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
        const oErr = validateEffectTree(opt.effect, `${path}.options[${i}].effect`);
        if (oErr) return oErr;
      }
      return null;
    }
    default:
      return `${path}: unhandled op`;
  }
}

/**
 * One printed ability, classified the way Comprehensive Rules 9.3 reads a card.
 * Load materializes a record onto the hook the rules already evaluate.
 * A flag is the printed ability flag (CR 9.3.6). `rule` is the class number (CR 9.3.7).
 * An instruction hosted on a declaration is written back onto that object.
 * A card that still has only the old hook is left alone.
 */
import { validateCond, validateEffectTree, type Cond, type Effect } from "./ir.js";

export const ABILITY_CLASSES = [
  "static",
  "paid",
  "conditional",
  "play",
  "subroutine",
] as const;

export type AbilityClass = (typeof ABILITY_CLASSES)[number];

/** CR 9.3.6. Threat carries its printed N. A printed ability can carry more than one. */
export type AbilityFlag =
  | "access"
  | "interface"
  | "interrupt"
  | "persistent"
  | "once_per_turn"
  | { threat: number };

export type AbilityFlagValue = AbilityFlag | AbilityFlag[];

/** CR 9.3.7. The class is the ability type; `rule` on the card is this number. */
export const ABILITY_CLASS_RULE: Record<AbilityClass, string> = {
  static: "9.3.7a",
  paid: "9.3.7b",
  conditional: "9.3.7c",
  play: "9.3.7d",
  subroutine: "9.3.7e",
};

/** CR 9.3.6b–g. `flagRule` on the card is this number, in flag order. */
export const ABILITY_FLAG_RULE: Record<string, string> = {
  access: "9.3.6b",
  interface: "9.3.6c",
  interrupt: "9.3.6d",
  persistent: "9.3.6e",
  once_per_turn: "9.3.6g",
};

/** Additional cost on the card the restriction appears on (CR 9.3.3a). */
export const RESTRICTION_FIELDS = {
  play: "playAdditionalCost",
  rez: "rezAdditionalCost",
  score: "scoreAdditionalCost",
  steal: "stealAdditionalCost",
  steal_from_protecting_server: "stealAdditionalCostFromProtectingServer",
  trash: "trashAdditionalCost",
} as const;

export type RestrictionAppliesTo = keyof typeof RESTRICTION_FIELDS;

export type AbilityRestriction = {
  appliesTo: RestrictionAppliesTo;
  effect: Effect;
};

/** Continuous effect. `field` is the rule the engine already applies (CR 9.4.1). */
export type AbilityDeclaration = {
  field: string;
  value: unknown;
};

export type AbilityCost = {
  clicks?: number;
  credits?: number;
  recurringCredits?: number;
  virusCounters?: number;
  agendaCounters?: number;
  powerCounters?: number;
  advancementCounters?: number;
  trashSelf?: boolean;
  forfeitAgenda?: boolean;
};

export type AbilityRecord = {
  class: AbilityClass;
  /** CR 9.3.7 number for `class`. */
  rule?: string;
  id?: string;
  text?: string;
  label?: string;
  flag?: AbilityFlagValue;
  /** CR 9.3.6 number for `flag`, in the same order. */
  flagRule?: string | string[];
  cost?: AbilityCost;
  /** Timing window of a conditional ability. `turn_begin` is `onTurnBegin`. */
  trigger?: string;
  /**
   * Object this instruction belongs to (CR 9.3.7c).
   * Load writes the instruction back onto that object. A run event's
   * successful-run instruction stays on the run, not on the card.
   * `hostAbility` names the paid ability when the object is its `startsRun`.
   */
  host?: string;
  hostAbility?: string;
  condition?: Cond;
  restrictions?: AbilityRestriction[];
  instructions?: Effect;
  declaration?: AbilityDeclaration;
  windows?: string[];
  [extra: string]: unknown;
};

const CLASS_SET = new Set<string>(ABILITY_CLASSES);
const FLAG_WORDS = new Set([
  "access",
  "interface",
  "interrupt",
  "persistent",
  "once_per_turn",
]);

const EXACT_TRIGGERS: Record<string, string> = {
  after_mandatory_draw: "afterMandatoryDraw",
  mirrormorph_on_third_distinct_action: "mirrormorphOnThirdDistinctAction",
  additional_cost_on_score_agenda_installed_this_turn:
    "additionalCostOnScoreAgendaInstalledThisTurn",
};

const EXACT_HOOKS: Record<string, string> = Object.fromEntries(
  Object.entries(EXACT_TRIGGERS).map(([trigger, hook]) => [hook, trigger]),
);

export function hookToTrigger(hook: string): string {
  const exact = EXACT_HOOKS[hook];
  if (exact) return exact;
  const rest = hook.startsWith("on") ? hook.slice(2) : hook;
  return rest.replace(/[A-Z]/g, (letter, index) =>
    index === 0 ? letter.toLowerCase() : `_${letter.toLowerCase()}`,
  );
}

export function triggerToHook(trigger: string): string {
  const exact = EXACT_TRIGGERS[trigger];
  if (exact) return exact;
  const camel = trigger.replace(/(^|_)([a-z])/g, (_match, _sep, letter: string) =>
    letter.toUpperCase(),
  );
  return `on${camel}`;
}

function isEffect(value: unknown): value is Effect {
  return Boolean(value && typeof value === "object" && "op" in value);
}

function fieldNameOk(field: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(field);
}

function withCondition(ability: AbilityRecord): Effect | undefined {
  if (!ability.instructions) return undefined;
  if (!ability.condition) return ability.instructions;
  return { op: "if", cond: ability.condition, then: ability.instructions };
}

function appendEffect(
  card: Record<string, unknown>,
  field: string,
  effect: Effect,
): void {
  const current = card[field];
  if (current === undefined) {
    card[field] = effect;
    return;
  }
  if (isEffect(current)) {
    card[field] = { op: "seq", effects: [current, effect] };
  }
}

/**
 * Validate CR 9.3 shape and copy records onto the hooks the engine evaluates.
 * Returns an error string, or null when the card is usable.
 * A card with no `abilities` array is unchanged.
 */
export function applyAbilityRecords(
  card: Record<string, unknown>,
  path = "card",
): string | null {
  if (card.abilities === undefined) return null;
  if (!Array.isArray(card.abilities)) return `${path}.abilities: not an array`;

  const paid: Record<string, unknown>[] = [];
  const subs: Record<string, unknown>[] = [];

  for (let i = 0; i < card.abilities.length; i++) {
    const ability = card.abilities[i];
    const label = `${path}.abilities[${i}]`;
    const err = validateAbilityRecord(ability, label);
    if (err) return err;
    const record = ability as AbilityRecord;
    const effect = withCondition(record);
    if (hasFlag(record.flag, "persistent")) card.persistent = true;

    if (record.class === "play" && effect) {
      appendEffect(card, "onPlay", effect);
    } else if (record.class === "conditional" && effect && record.trigger && record.host) {
      const hostErr = record.hostAbility
        ? writeHostedAbility(paid, record.hostAbility, record.host, record.trigger, effect, label)
        : writeHosted(card, record.host, record.trigger, effect, label);
      if (hostErr) return hostErr;
    } else if (record.class === "conditional" && effect && record.trigger) {
      appendEffect(card, triggerToHook(record.trigger), effect);
    } else if (record.class === "paid" && effect) {
      paid.push(toPaidAbility(record, effect));
    } else if (record.class === "subroutine" && effect) {
      subs.push(toSubroutine(record, effect));
    } else if (record.class === "static" && record.declaration) {
      const { field, value } = record.declaration;
      if (card[field] === undefined) card[field] = value;
    }

    for (const restriction of record.restrictions ?? []) {
      const field = RESTRICTION_FIELDS[restriction.appliesTo];
      appendEffect(card, field, restriction.effect);
    }
  }

  if (paid.length > 0 && card.paidAbilities === undefined) {
    card.paidAbilities = paid;
  }
  if (subs.length > 0 && card.subroutines === undefined) {
    card.subroutines = subs;
  }
  return null;
}

export function validateAbilityRecord(ability: unknown, path: string): string | null {
  if (!ability || typeof ability !== "object") return `${path}: not an object`;
  const record = ability as AbilityRecord;
  if (!CLASS_SET.has(record.class)) {
    return `${path}.class: must be static, paid, conditional, play, or subroutine`;
  }
  const flagErr = validateFlag(record.flag, path);
  if (flagErr) return flagErr;
  if (
    record.rule !== undefined &&
    record.rule !== ABILITY_CLASS_RULE[record.class as AbilityClass]
  ) {
    return `${path}.rule: expected ${ABILITY_CLASS_RULE[record.class as AbilityClass]}`;
  }
  if (record.flagRule !== undefined) {
    const expected = expectedFlagRules(record.flag);
    const actual = Array.isArray(record.flagRule) ? record.flagRule : [record.flagRule];
    if (actual.join(",") !== expected.join(",")) {
      return `${path}.flagRule: expected ${expected.join(", ") || "none"}`;
    }
  }
  if (record.host !== undefined) {
    if (record.class !== "conditional") {
      return `${path}.host: only a conditional ability can name a host`;
    }
    if (typeof record.host !== "string" || !fieldNameOk(record.host)) {
      return `${path}.host: invalid`;
    }
  }
  if (record.hostAbility !== undefined) {
    if (typeof record.hostAbility !== "string" || record.hostAbility.length === 0) {
      return `${path}.hostAbility: invalid`;
    }
    if (record.class !== "conditional" || record.host === undefined) {
      return `${path}.hostAbility: needs a hosted conditional ability`;
    }
  }
  if (record.condition) {
    const err = validateCond(record.condition, `${path}.condition`);
    if (err) return err;
  }
  if (record.instructions) {
    const err = validateEffectTree(record.instructions, `${path}.instructions`);
    if (err) return err;
  }
  if (record.restrictions) {
    if (!Array.isArray(record.restrictions)) {
      return `${path}.restrictions: not an array`;
    }
    for (let i = 0; i < record.restrictions.length; i++) {
      const restriction = record.restrictions[i];
      if (!restriction || !(restriction.appliesTo in RESTRICTION_FIELDS)) {
        return `${path}.restrictions[${i}].appliesTo: unknown`;
      }
      const err = validateEffectTree(
        restriction.effect,
        `${path}.restrictions[${i}].effect`,
      );
      if (err) return err;
    }
  }
  if (record.class === "static") {
    if (record.instructions) {
      return `${path}: a static ability cannot contain instructions (CR 9.3.7a)`;
    }
    if (!record.declaration && !(record.restrictions && record.restrictions.length)) {
      return `${path}: a static ability needs a declaration or a restriction`;
    }
    if (record.declaration) {
      if (!fieldNameOk(record.declaration.field)) {
        return `${path}.declaration.field: invalid`;
      }
    }
    return null;
  }
  if (record.class === "paid") {
    if (!record.cost || typeof record.cost !== "object") {
      return `${path}: a paid ability needs a cost (CR 9.3.7b)`;
    }
    if (!record.instructions) return `${path}: a paid ability needs instructions`;
    if (!record.windows || record.windows.length === 0) {
      return `${path}: a paid ability needs a window`;
    }
    return null;
  }
  if (record.class === "conditional") {
    if (!record.trigger) {
      return `${path}: a conditional ability needs a trigger (CR 9.3.7c)`;
    }
    if (!record.instructions) {
      return `${path}: a conditional ability needs an instruction (CR 9.3.7c)`;
    }
    return null;
  }
  if (!record.instructions) {
    return `${path}: a ${record.class} ability needs instructions`;
  }
  return null;
}

export function flagList(flag: AbilityFlagValue | undefined): AbilityFlag[] {
  if (flag === undefined) return [];
  return Array.isArray(flag) ? flag : [flag];
}

/** True when the printed ability carries this CR 9.3.6 flag word. */
export function hasAbilityFlag(
  flag: AbilityFlagValue | undefined,
  word: string,
): boolean {
  return flagList(flag).some((item) => item === word);
}

/** @deprecated prefer hasAbilityFlag */
function hasFlag(flag: AbilityFlagValue | undefined, word: string): boolean {
  return hasAbilityFlag(flag, word);
}

export function threatValue(flag: AbilityFlagValue | undefined): number | undefined {
  for (const item of flagList(flag)) {
    if (item && typeof item === "object" && "threat" in item) return item.threat;
  }
  return undefined;
}

function expectedFlagRules(flag: AbilityFlagValue | undefined): string[] {
  return flagList(flag).map((item) =>
    typeof item === "string" ? ABILITY_FLAG_RULE[item]! : "9.3.6f",
  );
}

function validateFlag(flag: AbilityFlagValue | undefined, path: string): string | null {
  if (flag === undefined) return null;
  const items = flagList(flag);
  if (items.length === 0) return `${path}.flag: unknown`;
  const seen = new Set<string>();
  let threats = 0;
  for (const item of items) {
    if (typeof item === "string") {
      if (!FLAG_WORDS.has(item) || seen.has(item)) return `${path}.flag: unknown`;
      seen.add(item);
      continue;
    }
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof item.threat === "number" &&
      item.threat >= 0
    ) {
      threats += 1;
      if (threats > 1) return `${path}.flag: unknown`;
      continue;
    }
    return `${path}.flag: unknown`;
  }
  return null;
}

function writeOnto(
  host: unknown,
  hostField: string,
  trigger: string,
  effect: Effect,
  label: string,
): string | null {
  if (!host || typeof host !== "object" || Array.isArray(host)) {
    return `${label}: host ${hostField} is not on this card`;
  }
  const obj = host as Record<string, unknown>;
  const hook = triggerToHook(trigger);
  if (obj[hook] === undefined) obj[hook] = effect;
  return null;
}

function writeHosted(
  card: Record<string, unknown>,
  hostField: string,
  trigger: string,
  effect: Effect,
  label: string,
): string | null {
  return writeOnto(card[hostField], hostField, trigger, effect, label);
}

function writeHostedAbility(
  paid: Record<string, unknown>[],
  abilityId: string,
  hostField: string,
  trigger: string,
  effect: Effect,
  label: string,
): string | null {
  const owner = paid.find((item) => item.id === abilityId);
  if (!owner) return `${label}: host ability ${abilityId} is not on this card`;
  return writeOnto(owner[hostField], hostField, trigger, effect, label);
}

const PAID_SKIP = new Set([
  "class",
  "instructions",
  "condition",
  "flag",
  "cost",
  "restrictions",
  "declaration",
  "trigger",
  "text",
  "windows",
  "id",
  "label",
  "rule",
  "flagRule",
  "host",
]);

function toPaidAbility(record: AbilityRecord, effect: Effect): Record<string, unknown> {
  const raw = record.cost ?? {};
  const cost: AbilityCost = { ...raw };
  if (cost.clicks === 0) delete cost.clicks;
  if (cost.credits === 0) delete cost.credits;
  const paid: Record<string, unknown> = {
    id: record.id ?? "paid",
    label: record.label ?? record.id ?? "Paid ability",
    clickCost: raw.clicks ?? 0,
    creditCost: raw.credits ?? 0,
    cost,
    windows: record.windows,
    effect,
  };
  // Canonical CR 9.3.6 flag(s); oncePerTurn / requiresThreat stay as mirrors.
  if (record.flag !== undefined) paid.flag = record.flag;
  if (hasFlag(record.flag, "once_per_turn")) paid.oncePerTurn = true;
  const threat = threatValue(record.flag);
  if (threat !== undefined) paid.requiresThreat = threat;
  for (const [key, value] of Object.entries(record)) {
    if (!PAID_SKIP.has(key)) paid[key] = value;
  }
  return paid;
}

const SUB_SKIP = new Set([
  "class",
  "instructions",
  "condition",
  "flag",
  "cost",
  "restrictions",
  "declaration",
  "trigger",
  "windows",
  "label",
  "rule",
  "flagRule",
  "host",
]);

function toSubroutine(record: AbilityRecord, effect: Effect): Record<string, unknown> {
  const sub: Record<string, unknown> = {
    id: record.id ?? "sub",
    text: record.text ?? "",
    effect,
  };
  if (hasFlag(record.flag, "once_per_turn")) sub.oncePerTurn = true;
  for (const [key, value] of Object.entries(record)) {
    if (!SUB_SKIP.has(key) && key !== "id" && key !== "text") sub[key] = value;
  }
  return sub;
}

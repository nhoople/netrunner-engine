/**
 * Load and validate card definitions from vendored `vendor/cards-data/`
 * (fetched via `npm run fetch-cards` from the pinned netrunner-cards-data tag).
 * Fail closed on unknown Effect IR nodes.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateEffectTree,
  type Effect,
} from "../effects/ir.js";
import type {
  BreakerAbility,
  CardInstance,
  CardType,
  PaidAbility,
  Side,
  Subroutine,
} from "../state/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cardsDir = join(root, "vendor/cards-data");
const cardsPinPath = join(root, "data/cards-pin.json");

export interface CardsPin {
  tag: string;
  repo: string;
  rawBase: string;
  archiveUrl?: string;
  required?: string[];
}

export function loadCardsPin(): CardsPin {
  return JSON.parse(readFileSync(cardsPinPath, "utf8")) as CardsPin;
}

/** True when pin-required paths exist under vendor/cards-data/. */
export function cardsDataPresent(): boolean {
  if (!existsSync(join(cardsDir, "pool.json"))) return false;
  const pin = loadCardsPin();
  return (pin.required ?? ["pool.json"]).every((rel) =>
    existsSync(join(cardsDir, rel)),
  );
}

export function assertCardsDataPresent(): void {
  if (cardsDataPresent()) return;
  const pin = loadCardsPin();
  throw new Error(
    `Missing vendored card data under vendor/cards-data/. Run: npm run fetch-cards (pins ${pin.tag})`,
  );
}

export function assertCardsPinnedTag(expected = "v0.2.0"): void {
  const pin = loadCardsPin();
  if (pin.tag !== expected) {
    throw new Error(`Expected cards pin ${expected}, found ${pin.tag}`);
  }
  const vendorPinPath = join(cardsDir, "PIN.json");
  if (existsSync(vendorPinPath)) {
    const vendor = JSON.parse(readFileSync(vendorPinPath, "utf8")) as {
      tag: string;
    };
    if (vendor.tag !== expected) {
      throw new Error(`Vendor cards PIN.json tag ${vendor.tag} != ${expected}`);
    }
  }
}

/** Release directories scanned for card JSON (order is load-only; pool declares support). */
export const CARD_WAVE_DIRS = [
  "system-gateway",
  "system-update-2021",
] as const;

export interface CardDef {
  id: string;
  title: string;
  type: CardType;
  side: Side;
  installCost?: number;
  rezCost?: number;
  playCost?: number;
  trashCost?: number;
  strength?: number;
  subtypes?: string[];
  agendaPoints?: number;
  advancementRequirement?: number;
  recurringCreditsMax?: number;
  link?: number;
  subroutines?: Array<{ id: string; text: string; effect: Effect }>;
  breaker?: BreakerAbility;
  paidAbilities?: PaidAbility[];
  onRez?: Effect;
  onPlay?: Effect;
  onScore?: Effect;
  onSteal?: Effect;
  onEncounter?: Effect;
  onTurnBegin?: Effect;
  onInstall?: Effect;
  onSuccessfulRun?: Effect;
  onAccess?: Effect;
  onFirstTagThisTurn?: Effect;
  onAgendaScored?: Effect;
  prevention?: { jackOutForRun?: boolean };
  unsupported?: string[];
  wave?: string;
  nrdbCode?: string;
  hostedCreditsOnInstall?: number;
  strengthBonusProtectingRemote?: number;
  strengthBonusAtAdvancements?: { threshold: number; bonus: number };
  handSizeBonus?: number;
  memoryCost?: number;
  muBonus?: number;
  strengthBonusPerIcebreaker?: number;
  installCostDiscountIfSuccessfulRunThisTurn?: number;
  firstProgramInstallDiscount?: number;
  drawOnHostedEmpty?: number;
  playRequiresTagged?: boolean;
  playRequiresSuccessfulRunLastTurn?: boolean;
  trashAfterBreakingThisRun?: boolean;
  creditsOnScoreOrSteal?: number;
  creditsPerAccessOnCentralRunEnd?: boolean;
  onAccessTrashGain?: { credits: number; draw: number; oncePerTurn?: boolean };
  runEvent?: import("../state/types.js").StartsRunSpec;
  installOnIce?: boolean;
  derezHostAtVirus?: number;
  tagsIfAgendaStolenThisRun?: number;
  approachServerTax?: { clicks: number; credits: number };
  offerJackOutAfterSub?: number;
  accessTrashFromGrip?: { gripCards: number; oncePerTurn?: boolean };
  mayInstallOnScoreOrSteal?: boolean;
  mayRezIceIgnoringCostsOnScoreOrSteal?: boolean;
  maySwapIceOnAgendaScoredOrStolen?: boolean;
  searchRdNonAgendaOnScoreFromServer?: boolean;
  strengthPerAdvancement?: number;
  strengthBonusIfNoInstalledSubtype?: { subtype: string; bonus: number };
  strengthCannotBeLowered?: boolean;
  runnerEncounterIceStrengthModifier?: number;
  firstIceRezCostIncrease?: number;
  iceRezCostIncrease?: number;
  gainCreditOnFirstRunEvent?: number;
  netDamageOnAgendaScoredOrStolen?: number;
  drawOnFirstRemoteCreated?: number;
  gainCreditOnTransactionPlayed?: number;
  firstEncounterGainsCodeGate?: boolean;
  forbidScoreAgendaInstalledThisTurn?: boolean;
  trashOnVirusPurge?: boolean;
  powerCountersOnInstall?: number;
  trashWhenPowerEmpty?: boolean;
  playRequiresSuccessfulRunThisTurn?: boolean;
  agendaPointsPerAgendaCounter?: number;
  cannotBreakWithAi?: boolean;
  cannotBreakWithAiAtAdvancements?: number;
  installFaceup?: boolean;
  creditsOnAdvance?: { default: number; atOrAbove?: number; bonus?: number };
  advancementRequirementReduction?: number;
  runsCannotBeSuccessful?: boolean;
  hostGainsAllIceSubtypes?: boolean;
  recurringSpendFor?: Array<"trash" | "trash_asset" | "play_event">;
  accessTrashWithVirus?: boolean;
  canAdvance?: boolean;
  playRequiresSuccessfulHqRunThisTurn?: boolean;
  rezAdditionalCostForfeitAgenda?: boolean;
  playAdditionalClick?: boolean;
  mayShuffleIntoRdWhenTrashed?: boolean;
  badPublicityOnScore?: number;
  playCostXMaxRunnerTags?: boolean;
  installSpendCreditsForPowerCounters?: boolean;
  strengthPerPowerCounter?: boolean;
  interfaceRequiresEqualStrength?: boolean;
  chooseBreakerSubtypeOnInstall?: boolean;
  returnToGripAtDiscardPhase?: boolean;
  chooseIceOnInstallForBypass?: boolean;
  hostedProgramsLoseAbilities?: boolean;
  securityTesting?: boolean;
  rezBioroidDiscountOnFirstPass?: number;
  interruptFirstDrawBottomOne?: boolean;
  subliminalMessaging?: boolean;
  aylaSetAside?: boolean;
  steveCambridge?: boolean;
  aesopPawnshop?: boolean;
}

export interface CardPool {
  version: number;
  description: string;
  agendaPointsToWinDefault: number;
  corpusOrder?: string[];
  waves: Record<
    string,
    { status: string; notes?: string; cards: string[] }
  >;
}

let catalogCache: Map<string, CardDef> | null = null;
let poolCache: CardPool | null = null;

function validateCardShape(raw: unknown, path: string): CardDef {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${path}: card must be an object`);
  }
  const c = raw as Record<string, unknown>;
  for (const key of ["id", "title", "type", "side"] as const) {
    if (typeof c[key] !== "string") {
      throw new Error(`${path}: missing/invalid ${key}`);
    }
  }
  const checkEffect = (effect: unknown, label: string) => {
    if (effect === undefined) return;
    const err = validateEffectTree(effect, `${path}.${label}`);
    if (err) throw new Error(err);
  };
  if (Array.isArray(c.subroutines)) {
    for (let i = 0; i < c.subroutines.length; i++) {
      const sub = c.subroutines[i] as { effect?: unknown };
      checkEffect(sub.effect, `subroutines[${i}].effect`);
    }
  }
  if (Array.isArray(c.paidAbilities)) {
    for (let i = 0; i < c.paidAbilities.length; i++) {
      const ab = c.paidAbilities[i] as {
        effect?: unknown;
        startsRun?: { onSuccessfulRun?: unknown };
      };
      checkEffect(ab.effect, `paidAbilities[${i}].effect`);
      if (ab.startsRun?.onSuccessfulRun) {
        checkEffect(
          ab.startsRun.onSuccessfulRun,
          `paidAbilities[${i}].startsRun.onSuccessfulRun`,
        );
      }
    }
  }
  if (c.runEvent && typeof c.runEvent === "object") {
    const re = c.runEvent as { onSuccessfulRun?: unknown };
    checkEffect(re.onSuccessfulRun, "runEvent.onSuccessfulRun");
  }
  checkEffect(c.onRez, "onRez");
  checkEffect(c.onPlay, "onPlay");
  checkEffect(c.onScore, "onScore");
  checkEffect(c.onSteal, "onSteal");
  checkEffect(c.onEncounter, "onEncounter");
  checkEffect(c.onTurnBegin, "onTurnBegin");
  checkEffect(c.onInstall, "onInstall");
  checkEffect(c.onSuccessfulRun, "onSuccessfulRun");
  checkEffect(c.onAccess, "onAccess");
  checkEffect(c.onFirstTagThisTurn, "onFirstTagThisTurn");
  checkEffect(c.onAgendaScored, "onAgendaScored");
  if (c.breaker && typeof c.breaker === "object") {
    const br = c.breaker as Record<string, unknown>;
    if (typeof br.breaksSubtype !== "string") {
      throw new Error(`${path}.breaker.breaksSubtype required`);
    }
  }
  return c as unknown as CardDef;
}

function loadAllCardFiles(): Map<string, CardDef> {
  const map = new Map<string, CardDef>();
  assertCardsDataPresent();
  if (!existsSync(cardsDir)) {
    throw new Error(`Missing card data directory: ${cardsDir}`);
  }
  for (const wave of CARD_WAVE_DIRS) {
    const dir = join(cardsDir, wave);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      if (file.startsWith("_")) continue;
      const path = join(dir, file);
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const def = validateCardShape(raw, path);
      if (map.has(def.id)) {
        throw new Error(`Duplicate card id ${def.id} in ${path}`);
      }
      map.set(def.id, def);
    }
  }
  return map;
}

export function loadCardCatalog(force = false): Map<string, CardDef> {
  if (!force && catalogCache) return catalogCache;
  catalogCache = loadAllCardFiles();
  return catalogCache;
}

export function loadCardPool(force = false): CardPool {
  if (!force && poolCache) return poolCache;
  const path = join(cardsDir, "pool.json");
  poolCache = JSON.parse(readFileSync(path, "utf8")) as CardPool;
  return poolCache;
}

export function getCardDef(id: string): CardDef {
  const def = loadCardCatalog().get(id);
  if (!def) {
    throw new Error(
      `Unknown card def "${id}". Add it to netrunner-cards-data or check pool.json.`,
    );
  }
  return def;
}

export function supportedCardIds(): string[] {
  const pool = loadCardPool();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const wave of Object.values(pool.waves)) {
    if (wave.status !== "supported") continue;
    for (const id of wave.cards) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Instantiate a card from its data definition. */
export function instantiateCard(
  defId: string,
  instanceId: string,
  zone: CardInstance["zone"],
): CardInstance {
  const def = getCardDef(defId);
  const card: CardInstance = {
    id: instanceId,
    defId: def.id,
    title: def.title,
    type: def.type,
    side: def.side,
    installCost: def.installCost ?? 0,
    rezCost: def.rezCost,
    playCost: def.playCost,
    trashCost: def.trashCost,
    strength: def.strength,
    subtypes: def.subtypes ? [...def.subtypes] : undefined,
    agendaPoints: def.agendaPoints,
    advancementRequirement: def.advancementRequirement,
    advancementTokens: def.type === "agenda" ? 0 : undefined,
    recurringCreditsMax: def.recurringCreditsMax,
    recurringCredits:
      def.recurringCreditsMax !== undefined ? 0 : undefined,
    hostedCreditsOnInstall: def.hostedCreditsOnInstall,
    hostedCredits: undefined,
    virusCounters: undefined,
    strengthBonusProtectingRemote: def.strengthBonusProtectingRemote,
    strengthBonusAtAdvancements: def.strengthBonusAtAdvancements
      ? { ...def.strengthBonusAtAdvancements }
      : undefined,
    handSizeBonus: def.handSizeBonus,
    memoryCost:
      def.memoryCost ?? (def.type === "program" ? 1 : undefined),
    muBonus: def.muBonus,
    strengthBonusPerIcebreaker: def.strengthBonusPerIcebreaker,
    installCostDiscountIfSuccessfulRunThisTurn:
      def.installCostDiscountIfSuccessfulRunThisTurn,
    firstProgramInstallDiscount: def.firstProgramInstallDiscount,
    drawOnHostedEmpty: def.drawOnHostedEmpty,
    playRequiresTagged: def.playRequiresTagged,
    playRequiresSuccessfulRunLastTurn:
      def.playRequiresSuccessfulRunLastTurn,
    trashAfterBreakingThisRun: def.trashAfterBreakingThisRun,
    creditsOnScoreOrSteal: def.creditsOnScoreOrSteal,
    creditsPerAccessOnCentralRunEnd: def.creditsPerAccessOnCentralRunEnd,
    onAccessTrashGain: def.onAccessTrashGain
      ? { ...def.onAccessTrashGain }
      : undefined,
    runEvent: def.runEvent ? structuredClone(def.runEvent) : undefined,
    installOnIce: def.installOnIce,
    derezHostAtVirus: def.derezHostAtVirus,
    tagsIfAgendaStolenThisRun: def.tagsIfAgendaStolenThisRun,
    approachServerTax: def.approachServerTax
      ? { ...def.approachServerTax }
      : undefined,
    offerJackOutAfterSub: def.offerJackOutAfterSub,
    accessTrashFromGrip: def.accessTrashFromGrip
      ? { ...def.accessTrashFromGrip }
      : undefined,
    mayInstallOnScoreOrSteal: def.mayInstallOnScoreOrSteal,
    mayRezIceIgnoringCostsOnScoreOrSteal:
      def.mayRezIceIgnoringCostsOnScoreOrSteal,
    maySwapIceOnAgendaScoredOrStolen: def.maySwapIceOnAgendaScoredOrStolen,
    searchRdNonAgendaOnScoreFromServer: def.searchRdNonAgendaOnScoreFromServer,
    strengthPerAdvancement: def.strengthPerAdvancement,
    strengthBonusIfNoInstalledSubtype: def.strengthBonusIfNoInstalledSubtype
      ? { ...def.strengthBonusIfNoInstalledSubtype }
      : undefined,
    strengthCannotBeLowered: def.strengthCannotBeLowered,
    runnerEncounterIceStrengthModifier: def.runnerEncounterIceStrengthModifier,
    firstIceRezCostIncrease: def.firstIceRezCostIncrease,
    iceRezCostIncrease: def.iceRezCostIncrease,
    gainCreditOnFirstRunEvent: def.gainCreditOnFirstRunEvent,
    netDamageOnAgendaScoredOrStolen: def.netDamageOnAgendaScoredOrStolen,
    drawOnFirstRemoteCreated: def.drawOnFirstRemoteCreated,
    gainCreditOnTransactionPlayed: def.gainCreditOnTransactionPlayed,
    firstEncounterGainsCodeGate: def.firstEncounterGainsCodeGate,
    forbidScoreAgendaInstalledThisTurn: def.forbidScoreAgendaInstalledThisTurn,
    trashOnVirusPurge: def.trashOnVirusPurge,
    powerCountersOnInstall: def.powerCountersOnInstall,
    trashWhenPowerEmpty: def.trashWhenPowerEmpty,
    playRequiresSuccessfulRunThisTurn: def.playRequiresSuccessfulRunThisTurn,
    agendaPointsPerAgendaCounter: def.agendaPointsPerAgendaCounter,
    cannotBreakWithAi: def.cannotBreakWithAi,
    cannotBreakWithAiAtAdvancements: def.cannotBreakWithAiAtAdvancements,
    installFaceup: def.installFaceup,
    creditsOnAdvance: def.creditsOnAdvance
      ? { ...def.creditsOnAdvance }
      : undefined,
    advancementRequirementReduction: def.advancementRequirementReduction,
    runsCannotBeSuccessful: def.runsCannotBeSuccessful,
    hostGainsAllIceSubtypes: def.hostGainsAllIceSubtypes,
    recurringSpendFor: def.recurringSpendFor
      ? [...def.recurringSpendFor]
      : undefined,
    accessTrashWithVirus: def.accessTrashWithVirus,
    canAdvance: def.canAdvance,
    playRequiresSuccessfulHqRunThisTurn:
      def.playRequiresSuccessfulHqRunThisTurn,
    rezAdditionalCostForfeitAgenda: def.rezAdditionalCostForfeitAgenda,
    playAdditionalClick: def.playAdditionalClick,
    mayShuffleIntoRdWhenTrashed: def.mayShuffleIntoRdWhenTrashed,
    badPublicityOnScore: def.badPublicityOnScore,
    playCostXMaxRunnerTags: def.playCostXMaxRunnerTags,
    installSpendCreditsForPowerCounters:
      def.installSpendCreditsForPowerCounters,
    strengthPerPowerCounter: def.strengthPerPowerCounter,
    interfaceRequiresEqualStrength: def.interfaceRequiresEqualStrength,
    chooseBreakerSubtypeOnInstall: def.chooseBreakerSubtypeOnInstall,
    returnToGripAtDiscardPhase: def.returnToGripAtDiscardPhase,
    chooseIceOnInstallForBypass: def.chooseIceOnInstallForBypass,
    hostedProgramsLoseAbilities: def.hostedProgramsLoseAbilities,
    securityTesting: def.securityTesting,
    rezBioroidDiscountOnFirstPass: def.rezBioroidDiscountOnFirstPass,
    interruptFirstDrawBottomOne: def.interruptFirstDrawBottomOne,
    subliminalMessaging: def.subliminalMessaging,
    aylaSetAside: def.aylaSetAside,
    steveCambridge: def.steveCambridge,
    aesopPawnshop: def.aesopPawnshop,
    link: def.link,
    unsupported: def.unsupported ? [...def.unsupported] : undefined,
    faceup: def.type === "identity" || def.side === "runner",
    rezzed: def.type === "identity",
    zone,
  };
  if (def.subroutines) {
    card.subroutines = def.subroutines.map(
      (s): Subroutine => ({
        id: s.id,
        text: s.text,
        effect: structuredClone(s.effect),
      }),
    );
  }
  if (def.breaker) {
    card.breaker = { ...def.breaker };
  }
  if (def.paidAbilities) {
    card.paidAbilities = def.paidAbilities.map(
      (a): PaidAbility => ({
        ...a,
        clickCost: a.clickCost ?? a.cost?.clicks ?? 0,
        creditCost: a.creditCost ?? a.cost?.credits ?? 0,
        cost: a.cost ? { ...a.cost } : undefined,
        windows: [...a.windows],
        effect: structuredClone(a.effect),
        oncePerTurn: a.oncePerTurn,
        oncePerRun: a.oncePerRun,
        requiresAdvancements: a.requiresAdvancements,
        requireEncounterSubtype: a.requireEncounterSubtype,
        startsRun: a.startsRun ? structuredClone(a.startsRun) : undefined,
      }),
    );
  }
  if (def.onRez) card.onRez = structuredClone(def.onRez);
  if (def.onPlay) card.onPlay = structuredClone(def.onPlay);
  if (def.onScore) card.onScore = structuredClone(def.onScore);
  if (def.onSteal) card.onSteal = structuredClone(def.onSteal);
  if (def.onEncounter) card.onEncounter = structuredClone(def.onEncounter);
  if (def.onTurnBegin) card.onTurnBegin = structuredClone(def.onTurnBegin);
  if (def.onInstall) card.onInstall = structuredClone(def.onInstall);
  if (def.onSuccessfulRun) {
    card.onSuccessfulRun = structuredClone(def.onSuccessfulRun);
  }
  if (def.onAccess) card.onAccess = structuredClone(def.onAccess);
  if (def.onFirstTagThisTurn) {
    card.onFirstTagThisTurn = structuredClone(def.onFirstTagThisTurn);
  }
  if (def.onAgendaScored) {
    card.onAgendaScored = structuredClone(def.onAgendaScored);
  }
  if (def.prevention) card.prevention = { ...def.prevention };
  return card;
}

/** Apply a card definition onto an existing instance (legacy stub helper). */
export function applyCardDef(card: CardInstance, defId: string): void {
  const fresh = instantiateCard(defId, card.id, card.zone);
  Object.assign(card, {
    ...fresh,
    id: card.id,
    zone: card.zone,
    faceup: card.faceup,
    rezzed: card.rezzed,
  });
}

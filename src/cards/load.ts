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

export function assertCardsPinnedTag(expected = "v0.71.0"): void {
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
  "midnight-sun",
  "parhelion",
  "the-automata-initiative",
  "rebellion-without-rehearsal",
  "elevation",
  "vantage-point",
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
  /** Blood in the Water: requirement equals Runner grip size. */
  advancementRequirementEqualsRunnerGrip?: boolean;
  /** Freedom of Information: −per × Runner tags. */
  advancementRequirementReductionPerTag?: number;
  /** Ontological Dependence: −per × core damage this game. */
  advancementRequirementReductionPerCoreDamageThisGame?: number;
  /** Regulatory Capture: −per × bad publicity (optional max counted). */
  advancementRequirementReductionPerBadPublicity?: {
    per: number;
    max?: number;
  };
  recurringCreditsMax?: number;
  link?: number;
  subroutines?: Array<{ id: string; text: string; effect: Effect }>;
  breaker?: BreakerAbility;
  paidAbilities?: PaidAbility[];
  onRez?: Effect;
  onPlay?: Effect;
  /** Additional cost Effect IR when playing (e.g. suffer core damage). */
  playAdditionalCost?: Effect;
  onScore?: Effect;
  /** Effect IR when Corp forfeits this scored agenda (Greenmail). */
  onForfeit?: Effect;
  /** Additional cost Effect IR paid before scoring (e.g. Azef must_trash). */
  scoreAdditionalCost?: Effect;
  trashAdditionalCost?: Effect;
  stealAdditionalCostFromProtectingServer?: Effect;
  /**
   * Additional clicks the Runner must spend to steal this agenda
   * (Méliès City Luxury Line).
   */
  stealAdditionalClicks?: number;
  /**
   * While rezzed, Runner must pay this many credits as an additional cost to
   * steal any agenda (Magistrate Revontulet).
   */
  stealAdditionalCreditsWhileRezzed?: number;
  /**
   * Reduce play cost by 1 per ice protecting this server (Tailgate: "hq").
   */
  playCostDiscountPerIceProtectingServer?: "hq" | "rd" | "archives";
  /**
   * While rezzed, the first double operation each turn costs this many clicks
   * less to play (Synchrocyclotron).
   */
  firstDoubleOperationClickDiscount?: number;
  onSteal?: Effect;
  onEncounter?: Effect;
  /** Effect IR when the Runner passes this ice (Phoneutria). */
  onPass?: Effect;
  /** Effect IR when the Runner bypasses a piece of ice (Capybara). */
  onBypass?: Effect;
  /**
   * Jeitinho-class: heap install-on-bypass when Threat met.
   */
  onBypassMayInstallFromHeap?: {
    requiresThreat: number;
    clickCost: number;
  };
  onFirstProgramInstallEachTurn?: Effect;
  onFirstCorpCardTrashEachTurn?: Effect;
  onFirstRunnerStoleOrTrashedCorpCardThisTurn?: Effect;
  onAccessTrash?: Effect;
  onFirstCorpRootInstallEachTurn?: Effect;
  onAccessRequiresRezzed?: boolean;
  onPassHost?: Effect;
  hostedCreditsOnAnyIceRez?: number;
  hostedCreditsSpendFor?: Array<"install" | "trash">;
  /** Open Market: hosted install credits only for resources with these subtypes. */
  hostedCreditsSpendForInstallSubtypes?: string[];
  /** Gourmand: access → trash self to trash accessed non-agenda, then draw. */
  accessTrashSelfNonAgendaThenDraw?: boolean;
  rezAdditionalCost?: Effect;
  onHostRezzed?: Effect;
  onHostDerezzed?: Effect;
  /**
   * Threat N → Runner cannot spend credits while subroutines on this ice
   * are resolving (Attini).
   */
  threatCannotSpendCreditsDuringSubs?: number;
  /**
   * Effect IR when the Runner approaches the server this card protects
   * (rezzed in attacked-server root; Nanisivik Grid).
   */
  onApproachServer?: Effect;
  /** Mitra Aman: when Runner approaches ice protecting this server. */
  onApproachIce?: Effect;
  /** Nebula-class dual identity back-side hooks. */
  identityFlippedHooks?: {
    onFirstOperationPlayThisTurn?: Effect;
    onSuccessfulHqOrRdRun?: Effect;
  };
  /** Magdalene: install from among cards discarded to hand size. */
  onRunnerDiscardOverMaxHand?: Effect;
  /** Zwicky: first credit gain via agenda/operation ability each turn. */
  onCreditsGainedFromAgendaOrOperationAbility?: Effect;
  /** Install only on a remote server (ZATO City Grid). */
  remoteOnly?: boolean;
  /** Persistent: abilities work while installed unrezzed (Tucana). */
  persistent?: boolean;
  /** Rez only during Corp turn (Front Company). */
  rezOnlyDuringCorpTurn?: boolean;
  /** While rezzed: first run each turn cannot target remotes (Front Company). */
  firstRunCannotTargetRemote?: boolean;
  /**
   * While rezzed: ice protecting this server gains encounter may-trash-to-
   * resolve-chosen-sub (ZATO City Grid).
   */
  iceGainsTrashToResolveChosenSubOnEncounter?: boolean;
  /**
   * Gantulga: during first encounter each turn with ice protecting the
   * named server, each subroutine becomes Do N net damage instead.
   */
  firstEncounterSubsBecomeNetDamage?: number;
  /** Trash this card when hostedCardIds becomes empty (Asmund). */
  trashWhenNoHostedCards?: boolean;
  /** Instance ids hosted on this card (not installed). */
  hostedCardIds?: string[];
  /** Deckbuilding max copies (Matryoshka 6). */
  deckLimit?: number;
  onTurnBegin?: Effect;
  onInstall?: Effect;
  /** Stoke the Embers: when installed from anywhere except HQ. */
  onInstallFromNonHq?: Effect;
  onSuccessfulRun?: Effect;
  /** Fire onSuccessfulRun at most once per turn for this instance. */
  onSuccessfulRunOncePerTurn?: boolean;
  onAccess?: Effect;
  onTrash?: Effect;
  onTrashFromGripOrStack?: Effect;
  /** Identity: when a rezzed Corp card is trashed (Ob Superheavy). */
  onRezzedCardTrashed?: Effect;
  onFirstTagThisTurn?: Effect;
  /** Runner identity: taking tags while previously untagged (Sebastião). */
  onTakeTagsWhenUntagged?: Effect;
  connectionBasicTrashAdditionalCostTrashHq?: boolean;
  onEncounterEndIfRezzedThisTurn?: Effect;
  onEncounterEnd?: Effect;
  rezCostDiscountIfAgendaScoredOrStolenThisTurn?: number;
  allIceStrengthPenalty?: number;
  gainCreditOnBreakIceStrengthLteOncePerTurn?: number;
  onAfterOperationOrExpendable?: Effect;
  creditsOnFirstRdTrashThisTurn?: number;
  onFirstPassRezzedCodeGateOrSentryThisTurn?: Effect;
  /** First core damage suffered each turn (Runner identities). */
  onFirstCoreDamageThisTurn?: Effect;
  /** First R&D run begin each turn (Runner identities; e.g. Padma). */
  onFirstRdRunBeginThisTurn?: Effect;
  /** First Archives run begin each turn (Front Company). */
  onFirstArchivesRunBeginThisTurn?: Effect;
  onFirstRunBeginThisTurn?: Effect;
  maxRemoteServers?: number;
  onFirstRemoteInstallThisTurn?: Effect;
  whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun?: number;
  /** First virus program install each turn (installed continuous; e.g. Avgustina). */
  onFirstVirusInstallThisTurn?: Effect;
  /** First successful run on the mark each turn (e.g. Virtuoso HQ bonus / post-run breach). */
  onFirstSuccessfulMarkRunThisTurn?: Effect;
  /** First successful HQ run each turn (e.g. PAN-Weave credit transfer). */
  onFirstSuccessfulHqRunThisTurn?: Effect;
  /** First successful central run each turn (e.g. Zenit Chip draw). */
  onFirstSuccessfulCentralRunThisTurn?: Effect;
  /** First successful run each turn any server (e.g. Pravdivost place adv). */
  onFirstSuccessfulRunThisTurn?: Effect;
  /** Whenever Runner installs a program or hardware (e.g. Environmental Testing). */
  onProgramOrHardwareInstall?: Effect;
  onHardwareInstallOrTrash?: Effect;
  installServers?: Array<"hq" | "rd" | "archives">;
  /**
   * When hosted power counters ≥ amount, evaluate effect
   * (e.g. Environmental Testing trash self + gain 9¢).
   */
  onPowerCountersGte?: { amount: number; effect: Effect };
  onHostedCreditsGte?: { amount: number; effect: Effect };
  onAgendaScored?: Effect;
  onAgendaScoredOrStolen?: Effect;
  /** Corp identity: whenever the Runner steals an agenda (Thule Subsea). */
  onAgendaStolen?: Effect;
  /** First time each turn this program fully breaks ice (Orca, Abaasy). */
  onFullyBreakOncePerTurn?: Effect;
  onFullyBreak?: Effect;
  hostedCreditsOnRunEventPlay?: number;
  onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess?: number;
  onBreachRdIfAccessGteMayBonusAccess?: { min: number; amount: number };
  onRemoveTags?: Effect;
  onRunnerTurnEnd?: Effect;
  onFirstResourcePaidAbilityEachTurn?: Effect;
  powerCounterOnAnyCardRez?: number;
  powerCountersOnPlay?: number;
  /** Info Bounty: credits on first mark run end if breached. */
  gainCreditsOnFirstMarkRunEndIfBreached?: number;
  meatDamageOnInstalledCorpTrashOncePerTurn?: number;
  maySpendPowerCountersForBonusRdAccess?: { max: number };
  powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn?: boolean;
  agendaPointsToWinReductionPerPowerCounter?: number;
  creditsOnTrashFromThisServer?: number;
  prevention?: { jackOutForRun?: boolean };
  unsupported?: string[];
  wave?: string;
  nrdbCode?: string;
  hostedCreditsOnInstall?: number;
  strengthBonusProtectingRemote?: number;
  /** +strength while protecting Archives (Bathynomus). */
  strengthBonusProtectingArchives?: number;
  /** Capacitor: +N strength while the Runner is tagged. */
  strengthBonusWhileTagged?: number;
  /** Hammer: breakers with this subtype ignore printed-sub break limits. */
  maxPrintedSubsBreakExceptSubtype?: string;
  /** Boi-tatá: reduce paid ability credit costs after own installed trash this turn. */
  paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn?: number;
  /** Sorocaban Blade: max installed Runner trashes this ice can cause per encounter. */
  maxInstalledRunnerTrashesPerEncounter?: number;
  strengthBonusAtAdvancements?: { threshold: number; bonus: number };
  handSizeBonus?: number;
  /** +N max hand size per hosted power counter. */
  handSizePerPowerCounter?: number;
  /** Rezzed Corp: Runner max hand size −N per hosted power counter. */
  runnerHandSizePenaltyPerPowerCounter?: number;
  allottedClicksBonus?: number;
  giveStrengthToInstalledIcebreakers?: {
    amount: number;
    excludeSubtype?: string;
  };
  hostIcebreakerStrengthBonus?: number;
  extendsHostBreakerPumpToRun?: boolean;
  hostedCardsPlayableAsGrip?: boolean;
  onInstallWithoutSpendingCredits?: Effect;
  powerCounterOnDamageOrTrashFromHq?: boolean;
  mayInstallAgendasFaceup?: boolean;
  onAccessFaceupInstalledAgenda?: Effect;
  rfgOnUninstall?: boolean;
  memoryCost?: number;
  muBonus?: number;
  strengthBonusPerIcebreaker?: number;
  /** +strength per card of subtype in the heap (Rising Tide). */
  strengthBonusPerHeapSubtype?: { subtype: string; bonus: number };
  /** −install cost per currently installed icebreaker (Principia). */
  installCostDiscountPerInstalledIcebreaker?: number;
  /** +strength per core damage taken this game (Begemot). */
  strengthBonusPerCoreDamageThisGame?: number;
  /** Threat N → strength delta while threat is active (Shibboleth −2). */
  threatStrengthBonus?: { level: number; amount: number };
  installCostDiscountIfSuccessfulRunThisTurn?: number;
  firstProgramInstallDiscount?: number;
  drawOnHostedEmpty?: number;
  /** When hosted credits empty and card trashes, gain this many clicks (Otto). */
  clicksOnHostedEmpty?: number;
  /** When Corp scores an agenda from this server root, do N core damage. */
  coreDamageOnAgendaScoredFromThisServer?: number;
  /**
   * Static ability: while accessing this card in R&D, the Runner must reveal it
   * (Nightmare Archive; CR §1.21.7).
   */
  mustRevealWhenAccessedFromRd?: boolean;
  skipOnAccessFromArchives?: boolean;
  playRequiresTagged?: boolean;
  playRequiresInstalledResource?: boolean;
  playRequiresUntagged?: boolean;
  /** Play only if Runner has at least this many tags. */
  playRequiresMinTags?: number;
  playRequiresSuccessfulRunLastTurn?: boolean;
  /** Play only while Threat ≥ N (Measured Response). */
  playRequiresThreat?: number;
  playRequiresAgendaStolenLastTurn?: boolean;
  playRequiresRunnerStoleOrTrashedCorpCardLastTurn?: boolean;
  playRequiresAgendaStolenThisTurn?: boolean;
  trashAfterBreakingThisRun?: boolean;
  creditsOnScoreOrSteal?: number;
  creditsPerAccessOnCentralRunEnd?: boolean;
  onAccessTrashGain?: { credits: number; draw: number; oncePerTurn?: boolean };
  runEvent?: import("../state/types.js").StartsRunSpec;
  /** With runEvent: play without serverId skips the run (Reprise). */
  runEventOptional?: boolean;
  installOnIce?: boolean;
  hostStrengthModifier?: number;
  otherIceProtectingServerStrengthModifier?: number;
  blanksHostAbilities?: boolean;
  chargeOnFirstBreakDuringHostEncounter?: boolean;
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
  /**
   * While installed: increase rez cost of ice matching `subtype` by `amount`
   * (Cat's Cradle; CR §1.16.2a / §8.1.2d).
   */
  iceRezCostIncreaseBySubtype?: { subtype: string; amount: number };
  iceRezCostReductionProtectingThisServer?: number;
  rootRezCostReductionThisServerIfThreat?: { level: number; amount: number };
  onCorpTurnEnd?: Effect;
  onDiscardPhaseEnd?: Effect;
  onCorpActionPhaseEnd?: Effect;
  onRunnerActionPhaseEnd?: Effect;
  onAnyIceRez?: Effect;
  onFirstAgendaScoredOrStolenThisTurn?: Effect;
  onRunBegin?: Effect;
  onMovedToServerRoot?: Effect;
  advancedIceProtectingThisServerStrengthBonus?: number;
  /** Lightning Laboratory: on run begin may spend agenda counter to rez ice. */
  onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked?: {
    maxIce: number;
  };
  /** Lightning Laboratory: config for delayed end-of-turn derez (fires runner.turnEnds). */
  onCorpTurnEndDerezUpToIceProtectingLightningServer?: { maxIce: number };
  /** Brasília: once/turn on rez ice protecting this server during a run. */
  oncePerTurnOnRezIceProtectingThisServerDuringRun?: {
    mayDerezOtherIceForStrengthBonus: number;
  };
  /** Thunderbolt identity: on rez AP/destroyer ice during a run. */
  onRezApOrDestroyerIceDuringRun?: {
    strengthBonus: number;
    gainEtrUnlessTrashInstalledSub: boolean;
  };
  /** Lycian: derez at end of any turn while rezzed. */
  derezAtAnyTurnEnd?: boolean;
  powerOnHqRdRunEndIfAccessedGte?: { min: number; amount: number };
  bonusAccessOnHqRdBreachWhileTagged?: number;
  threatBasicTrashAdditionalCostTrashHq?: number;
  wageWorkersTrackActions?: true;
  /**
   * When rezzing this ice: reduce rez cost by `amount` per already-rezzed ice
   * matching `subtype` (Ivik; CR §1.16.2a / §8.1.2d).
   */
  rezCostDiscountPerRezzedSubtype?: { subtype: string; amount: number };
  /**
   * When rezzing this ice: reduce rez cost by this many ¢ per other unrezzed
   * ice (Reverb; CR §1.16.2a / §8.1.2d).
   */
  rezCostDiscountPerOtherUnrezzedIce?: number;
  /** While installed: lower each event’s play cost by this many ¢ (Ghosttongue). */
  eventPlayCostDiscount?: number;
  gainCreditOnFirstRunEvent?: number;
  netDamageOnAgendaScoredOrStolen?: number;
  drawOnFirstRemoteCreated?: number;
  gainCreditOnTransactionPlayed?: number;
  firstEncounterGainsCodeGate?: boolean;
  forbidScoreAgendaInstalledThisTurn?: boolean;
  trashOnVirusPurge?: boolean;
  /** Heliamphora-class: Effect when Corp purges virus counters. */
  onVirusPurge?: Effect;
  /** Cupellation: max faceup hosted Corp cards. */
  maxHostedCards?: number;
  /** Cupellation: mid-access pay credits to host non-agenda faceup. */
  accessHostNonAgendaFaceup?: { creditCost: number };
  /** Cupellation: HQ breach may pay+trash for bonus access while hosting Corp. */
  onBreachHqIfHostingCorpCard?: Effect;
  /** Heliamphora: interrupt Archives access to host faceup instead. */
  onWouldAccessArchivesHostInstead?: { oncePerArchivesBreach?: boolean };
  powerCountersOnInstall?: number;
  trashWhenPowerEmpty?: boolean;
  /** Muse-class: hosted programs do not consume MU. */
  daemonHost?: boolean;
  rfgWhenPowerEmpty?: boolean;
  /** Hosted BP loaded on rez (Superdeep Borehole); not player BP until taken. */
  badPublicityCountersOnRez?: number;
  /** Corp wins when hosted BP counters reach 0 while rezzed. */
  winWhenBadPublicityCountersEmpty?: boolean;
  etrSubroutinesPerPowerCounter?: boolean;
  powerCounterOnHarmonicIceRez?: boolean;
  powerOnFirstInstalledCardCreditSpendThisTurn?: boolean;
  removePowerForBonusAccessOnHqRdBreach?: number;
  playRequiresSuccessfulRunThisTurn?: boolean;
  /** Install only after a successful central run this turn (Time Bomb). */
  installRequiresSuccessfulCentralRunThisTurn?: boolean;
  agendaPointsPerAgendaCounter?: number;
  cannotBreakWithAi?: boolean;
  cannotBreakWithAiAtAdvancements?: number;
  /** Semak-samun: only breakers with this subtype may break printed subs. */
  cannotBreakExceptSubtype?: string;
  /** Kessleroid: Runner cannot trash while rezzed. */
  cannotBeTrashedByRunnerWhileRezzed?: boolean;
  /** Scatter Field: +N strength when sole ice protecting server. */
  strengthBonusIfSoleIceProtectingServer?: number;
  /** Sang Kancil: paid ability credit discount while a run event is active. */
  paidAbilityCreditDiscountIfRunEventActive?: number;
  /** Public Access Plaza: Threat N → give tags when Runner trashes while rezzed. */
  threatGiveTagsOnRezzedTrash?: { level: number; tags: number };
  cannotBreakWithRunnerCardAbilities?: boolean;
  installFaceup?: boolean;
  creditsOnAdvance?: { default: number; atOrAbove?: number; bonus?: number };
  advancementRequirementReduction?: number;
  runsCannotBeSuccessful?: boolean;
  hostGainsAllIceSubtypes?: boolean;
  recurringSpendFor?: Array<
    | "trash"
    | "trash_asset"
    | "play_event"
    | "run_central"
    | "rez_host_server"
  >;
  /** Mahkota: +N trash cost for assets in this server's root while installed. */
  serverRootAssetTrashCostBonus?: number;
  /** Petty Cash: play only before any Corp action completes. */
  playRequiresNoCorpActionFinished?: boolean;
  accessTrashWithVirus?: boolean;
  canAdvance?: boolean;
  playRequiresSuccessfulHqRunThisTurn?: boolean;
  playRequiresSuccessfulAllCentralsThisTurn?: boolean;
  playRequiresScoredAgendaNotInstalledThisTurn?: boolean;
  rezAdditionalCostForfeitAgenda?: boolean;
  rezCostCreditDiscountOnForfeitAgenda?: number;
  /** As an additional rez cost, derez another rezzed ice with this subtype (Bloop). */
  rezAdditionalCostDerezSubtype?: string;
  playAdditionalClick?: boolean;
  /** Extra clicks beyond the first (triples = 2). Overrides playAdditionalClick. */
  playAdditionalClicks?: number;
  /** Terminal operation: end action phase after play (Big Deal). */
  endsActionPhase?: boolean;
  mayShuffleIntoRdWhenTrashed?: boolean;
  badPublicityOnScore?: number;
  playCostXMaxRunnerTags?: boolean;
  installSpendCreditsForPowerCounters?: boolean;
  strengthPerPowerCounter?: boolean;
  interfaceRequiresEqualStrength?: boolean;
  interfaceRequiresTrojanHost?: boolean;
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
        startsRun?: { onSuccessfulRun?: unknown; onRunEnd?: unknown };
      };
      checkEffect(ab.effect, `paidAbilities[${i}].effect`);
      if (ab.startsRun?.onSuccessfulRun) {
        checkEffect(
          ab.startsRun.onSuccessfulRun,
          `paidAbilities[${i}].startsRun.onSuccessfulRun`,
        );
      }
      if (ab.startsRun?.onRunEnd) {
        checkEffect(
          ab.startsRun.onRunEnd,
          `paidAbilities[${i}].startsRun.onRunEnd`,
        );
      }
    }
  }
  if (c.runEvent && typeof c.runEvent === "object") {
    const re = c.runEvent as {
      onSuccessfulRun?: unknown;
      onRunEnd?: unknown;
    };
    checkEffect(re.onSuccessfulRun, "runEvent.onSuccessfulRun");
    checkEffect(re.onRunEnd, "runEvent.onRunEnd");
  }
  checkEffect(c.onInstallWithoutSpendingCredits, "onInstallWithoutSpendingCredits");
  checkEffect(c.onAccessFaceupInstalledAgenda, "onAccessFaceupInstalledAgenda");
  checkEffect(c.onCorpTurnEnd, "onCorpTurnEnd");
  checkEffect(c.onDiscardPhaseEnd, "onDiscardPhaseEnd");
  checkEffect(c.onCorpActionPhaseEnd, "onCorpActionPhaseEnd");
  checkEffect(c.onRunnerActionPhaseEnd, "onRunnerActionPhaseEnd");
  checkEffect(c.onAnyIceRez, "onAnyIceRez");
  checkEffect(
    c.onFirstAgendaScoredOrStolenThisTurn,
    "onFirstAgendaScoredOrStolenThisTurn",
  );
  checkEffect(c.onRunBegin, "onRunBegin");
  checkEffect(c.onMovedToServerRoot, "onMovedToServerRoot");
  checkEffect(c.onRez, "onRez");
  checkEffect(c.onPlay, "onPlay");
  checkEffect(c.playAdditionalCost, "playAdditionalCost");
  checkEffect(c.onScore, "onScore");
  checkEffect(c.onForfeit, "onForfeit");
  checkEffect(c.scoreAdditionalCost, "scoreAdditionalCost");
  checkEffect(c.trashAdditionalCost, "trashAdditionalCost");
  checkEffect(
    c.stealAdditionalCostFromProtectingServer,
    "stealAdditionalCostFromProtectingServer",
  );
  checkEffect(c.onSteal, "onSteal");
  checkEffect(c.onAgendaStolen, "onAgendaStolen");
  checkEffect(c.onFullyBreakOncePerTurn, "onFullyBreakOncePerTurn");
  checkEffect(c.onFullyBreak, "onFullyBreak");
  checkEffect(c.onEncounter, "onEncounter");
  checkEffect(c.onPass, "onPass");
  checkEffect(c.onBypass, "onBypass");
  checkEffect(c.onFirstProgramInstallEachTurn, "onFirstProgramInstallEachTurn");
  checkEffect(c.onFirstCorpCardTrashEachTurn, "onFirstCorpCardTrashEachTurn");
  checkEffect(
    c.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    "onFirstRunnerStoleOrTrashedCorpCardThisTurn",
  );
  checkEffect(c.onAccessTrash, "onAccessTrash");
  checkEffect(
    c.onFirstCorpRootInstallEachTurn,
    "onFirstCorpRootInstallEachTurn",
  );
  checkEffect(c.onPassHost, "onPassHost");
  checkEffect(c.rezAdditionalCost, "rezAdditionalCost");
  checkEffect(c.onHostRezzed, "onHostRezzed");
  checkEffect(c.onHostDerezzed, "onHostDerezzed");
  checkEffect(c.onApproachServer, "onApproachServer");
  checkEffect(c.onApproachIce, "onApproachIce");
  const flippedHooks = c.identityFlippedHooks as CardDef["identityFlippedHooks"];
  if (flippedHooks?.onFirstOperationPlayThisTurn) {
    checkEffect(
      flippedHooks.onFirstOperationPlayThisTurn,
      "identityFlippedHooks.onFirstOperationPlayThisTurn",
    );
  }
  if (flippedHooks?.onSuccessfulHqOrRdRun) {
    checkEffect(
      flippedHooks.onSuccessfulHqOrRdRun,
      "identityFlippedHooks.onSuccessfulHqOrRdRun",
    );
  }
  checkEffect(
    c.onCreditsGainedFromAgendaOrOperationAbility,
    "onCreditsGainedFromAgendaOrOperationAbility",
  );
  checkEffect(c.onRunnerDiscardOverMaxHand, "onRunnerDiscardOverMaxHand");
  checkEffect(c.onTurnBegin, "onTurnBegin");
  checkEffect(c.onInstall, "onInstall");
  checkEffect(c.onInstallFromNonHq, "onInstallFromNonHq");
  checkEffect(c.onRemoveTags, "onRemoveTags");
  checkEffect(c.onRunnerTurnEnd, "onRunnerTurnEnd");
  checkEffect(c.onFirstResourcePaidAbilityEachTurn, "onFirstResourcePaidAbilityEachTurn");
  checkEffect(c.onSuccessfulRun, "onSuccessfulRun");
  checkEffect(c.onAccess, "onAccess");
  checkEffect(c.onTrash, "onTrash");
  checkEffect(c.onTrashFromGripOrStack, "onTrashFromGripOrStack");
  checkEffect(c.onVirusPurge, "onVirusPurge");
  checkEffect(c.onBreachHqIfHostingCorpCard, "onBreachHqIfHostingCorpCard");
  if (c.accessHostNonAgendaFaceup && typeof c.accessHostNonAgendaFaceup === "object") {
    const ah = c.accessHostNonAgendaFaceup as { creditCost?: unknown };
    if (typeof ah.creditCost !== "number" || ah.creditCost < 0) {
      throw new Error(`${path}.accessHostNonAgendaFaceup.creditCost must be a non-negative number`);
    }
  }
  if (
    c.maxHostedCards !== undefined &&
    (typeof c.maxHostedCards !== "number" || c.maxHostedCards < 1)
  ) {
    throw new Error(`${path}.maxHostedCards must be a positive number`);
  }
  if (
    c.onWouldAccessArchivesHostInstead &&
    typeof c.onWouldAccessArchivesHostInstead === "object"
  ) {
    const w = c.onWouldAccessArchivesHostInstead as {
      oncePerArchivesBreach?: unknown;
    };
    if (
      w.oncePerArchivesBreach !== undefined &&
      typeof w.oncePerArchivesBreach !== "boolean"
    ) {
      throw new Error(
        `${path}.onWouldAccessArchivesHostInstead.oncePerArchivesBreach must be boolean`,
      );
    }
  }
  checkEffect(c.onRezzedCardTrashed, "onRezzedCardTrashed");
  checkEffect(c.onFirstTagThisTurn, "onFirstTagThisTurn");
  checkEffect(c.onTakeTagsWhenUntagged, "onTakeTagsWhenUntagged");
  checkEffect(c.onEncounterEndIfRezzedThisTurn, "onEncounterEndIfRezzedThisTurn");
  checkEffect(c.onEncounterEnd, "onEncounterEnd");
  checkEffect(c.onAfterOperationOrExpendable, "onAfterOperationOrExpendable");
  checkEffect(
    c.onFirstPassRezzedCodeGateOrSentryThisTurn,
    "onFirstPassRezzedCodeGateOrSentryThisTurn",
  );
  checkEffect(c.onFirstCoreDamageThisTurn, "onFirstCoreDamageThisTurn");
  checkEffect(c.onFirstRdRunBeginThisTurn, "onFirstRdRunBeginThisTurn");
  checkEffect(
    c.onFirstArchivesRunBeginThisTurn,
    "onFirstArchivesRunBeginThisTurn",
  );
  checkEffect(c.onFirstRunBeginThisTurn, "onFirstRunBeginThisTurn");
  checkEffect(c.onFirstRemoteInstallThisTurn, "onFirstRemoteInstallThisTurn");
  checkEffect(c.onFirstVirusInstallThisTurn, "onFirstVirusInstallThisTurn");
  checkEffect(
    c.onFirstSuccessfulMarkRunThisTurn,
    "onFirstSuccessfulMarkRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulHqRunThisTurn,
    "onFirstSuccessfulHqRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulCentralRunThisTurn,
    "onFirstSuccessfulCentralRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulRunThisTurn,
    "onFirstSuccessfulRunThisTurn",
  );
  checkEffect(c.onProgramOrHardwareInstall, "onProgramOrHardwareInstall");
  checkEffect(c.onHardwareInstallOrTrash, "onHardwareInstallOrTrash");
  if (c.onPowerCountersGte && typeof c.onPowerCountersGte === "object") {
    const gte = c.onPowerCountersGte as {
      amount?: unknown;
      effect?: unknown;
    };
    if (typeof gte.amount !== "number" || gte.amount < 0) {
      throw new Error(`${path}.onPowerCountersGte.amount must be a non-negative number`);
    }
    checkEffect(gte.effect, "onPowerCountersGte.effect");
  }
  if (c.onHostedCreditsGte && typeof c.onHostedCreditsGte === "object") {
    const gte = c.onHostedCreditsGte as {
      amount?: unknown;
      effect?: unknown;
    };
    if (typeof gte.amount !== "number" || gte.amount < 0) {
      throw new Error(
        `${path}.onHostedCreditsGte.amount must be a non-negative number`,
      );
    }
    checkEffect(gte.effect, "onHostedCreditsGte.effect");
  }
  checkEffect(c.onAgendaScored, "onAgendaScored");
  checkEffect(c.onAgendaScoredOrStolen, "onAgendaScoredOrStolen");
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
    advancementRequirementEqualsRunnerGrip:
      def.advancementRequirementEqualsRunnerGrip,
    advancementRequirementReductionPerTag:
      def.advancementRequirementReductionPerTag,
    advancementRequirementReductionPerCoreDamageThisGame:
      def.advancementRequirementReductionPerCoreDamageThisGame,
    advancementRequirementReductionPerBadPublicity:
      def.advancementRequirementReductionPerBadPublicity
        ? { ...def.advancementRequirementReductionPerBadPublicity }
        : undefined,
    advancementTokens: def.type === "agenda" ? 0 : undefined,
    recurringCreditsMax: def.recurringCreditsMax,
    recurringCredits:
      def.recurringCreditsMax !== undefined ? 0 : undefined,
    hostedCreditsOnInstall: def.hostedCreditsOnInstall,
    hostedCredits: undefined,
    virusCounters: undefined,
    strengthBonusProtectingRemote: def.strengthBonusProtectingRemote,
    strengthBonusProtectingArchives: def.strengthBonusProtectingArchives,
    strengthBonusWhileTagged: def.strengthBonusWhileTagged,
    maxPrintedSubsBreakExceptSubtype: def.maxPrintedSubsBreakExceptSubtype,
    paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn:
      def.paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn,
    maxInstalledRunnerTrashesPerEncounter:
      def.maxInstalledRunnerTrashesPerEncounter,
    strengthBonusAtAdvancements: def.strengthBonusAtAdvancements
      ? { ...def.strengthBonusAtAdvancements }
      : undefined,
    handSizeBonus: def.handSizeBonus,
    handSizePerPowerCounter: def.handSizePerPowerCounter,
    runnerHandSizePenaltyPerPowerCounter:
      def.runnerHandSizePenaltyPerPowerCounter,
    allottedClicksBonus: def.allottedClicksBonus,
    giveStrengthToInstalledIcebreakers: def.giveStrengthToInstalledIcebreakers
      ? { ...def.giveStrengthToInstalledIcebreakers }
      : undefined,
    hostIcebreakerStrengthBonus: def.hostIcebreakerStrengthBonus,
    extendsHostBreakerPumpToRun: def.extendsHostBreakerPumpToRun,
    hostedCardsPlayableAsGrip: def.hostedCardsPlayableAsGrip,
    powerCounterOnDamageOrTrashFromHq: def.powerCounterOnDamageOrTrashFromHq,
    mayInstallAgendasFaceup: def.mayInstallAgendasFaceup,
    rfgOnUninstall: def.rfgOnUninstall,
    memoryCost:
      def.memoryCost ?? (def.type === "program" ? 1 : undefined),
    muBonus: def.muBonus,
    strengthBonusPerIcebreaker: def.strengthBonusPerIcebreaker,
    strengthBonusPerHeapSubtype: def.strengthBonusPerHeapSubtype
      ? { ...def.strengthBonusPerHeapSubtype }
      : undefined,
    installCostDiscountPerInstalledIcebreaker:
      def.installCostDiscountPerInstalledIcebreaker,
    strengthBonusPerCoreDamageThisGame: def.strengthBonusPerCoreDamageThisGame,
    threatStrengthBonus: def.threatStrengthBonus
      ? { ...def.threatStrengthBonus }
      : undefined,
    threatCannotSpendCreditsDuringSubs: def.threatCannotSpendCreditsDuringSubs,
    installCostDiscountIfSuccessfulRunThisTurn:
      def.installCostDiscountIfSuccessfulRunThisTurn,
    firstProgramInstallDiscount: def.firstProgramInstallDiscount,
    drawOnHostedEmpty: def.drawOnHostedEmpty,
    clicksOnHostedEmpty: def.clicksOnHostedEmpty,
    playRequiresTagged: def.playRequiresTagged,
    playRequiresInstalledResource: def.playRequiresInstalledResource,
    playRequiresUntagged: def.playRequiresUntagged,
    coreDamageOnAgendaScoredFromThisServer:
      def.coreDamageOnAgendaScoredFromThisServer,
    mustRevealWhenAccessedFromRd: def.mustRevealWhenAccessedFromRd,
    skipOnAccessFromArchives: def.skipOnAccessFromArchives,
    playRequiresMinTags: def.playRequiresMinTags,
    playRequiresSuccessfulRunLastTurn:
      def.playRequiresSuccessfulRunLastTurn,
    playRequiresAgendaStolenLastTurn: def.playRequiresAgendaStolenLastTurn,
    playRequiresRunnerStoleOrTrashedCorpCardLastTurn:
      def.playRequiresRunnerStoleOrTrashedCorpCardLastTurn,
    playRequiresAgendaStolenThisTurn: def.playRequiresAgendaStolenThisTurn,
    trashAfterBreakingThisRun: def.trashAfterBreakingThisRun,
    creditsOnScoreOrSteal: def.creditsOnScoreOrSteal,
    creditsPerAccessOnCentralRunEnd: def.creditsPerAccessOnCentralRunEnd,
    onAccessTrashGain: def.onAccessTrashGain
      ? { ...def.onAccessTrashGain }
      : undefined,
    runEvent: def.runEvent ? structuredClone(def.runEvent) : undefined,
    runEventOptional: def.runEventOptional,
    installOnIce: def.installOnIce,
    hostStrengthModifier: def.hostStrengthModifier,
    otherIceProtectingServerStrengthModifier:
      def.otherIceProtectingServerStrengthModifier,
    blanksHostAbilities: def.blanksHostAbilities,
    chargeOnFirstBreakDuringHostEncounter:
      def.chargeOnFirstBreakDuringHostEncounter,
    derezHostAtVirus: def.derezHostAtVirus,
    tagsIfAgendaStolenThisRun: def.tagsIfAgendaStolenThisRun,
    gainCreditsOnFirstMarkRunEndIfBreached:
      def.gainCreditsOnFirstMarkRunEndIfBreached,
    meatDamageOnInstalledCorpTrashOncePerTurn:
      def.meatDamageOnInstalledCorpTrashOncePerTurn,
    maySpendPowerCountersForBonusRdAccess:
      def.maySpendPowerCountersForBonusRdAccess
        ? { ...def.maySpendPowerCountersForBonusRdAccess }
        : undefined,
    powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn:
      def.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn,
    agendaPointsToWinReductionPerPowerCounter:
      def.agendaPointsToWinReductionPerPowerCounter,
    creditsOnTrashFromThisServer: def.creditsOnTrashFromThisServer,
    approachServerTax: def.approachServerTax
      ? { ...def.approachServerTax }
      : undefined,
    remoteOnly: def.remoteOnly,
    persistent: def.persistent,
    serverRootAssetTrashCostBonus: def.serverRootAssetTrashCostBonus,
    rezOnlyDuringCorpTurn: def.rezOnlyDuringCorpTurn,
    firstRunCannotTargetRemote: def.firstRunCannotTargetRemote,
    iceGainsTrashToResolveChosenSubOnEncounter:
      def.iceGainsTrashToResolveChosenSubOnEncounter,
    firstEncounterSubsBecomeNetDamage: def.firstEncounterSubsBecomeNetDamage,
    trashWhenNoHostedCards: def.trashWhenNoHostedCards,
    hostedCardIds: undefined,
    deckLimit: def.deckLimit,
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
    iceRezCostIncreaseBySubtype: def.iceRezCostIncreaseBySubtype
      ? { ...def.iceRezCostIncreaseBySubtype }
      : undefined,
    iceRezCostReductionProtectingThisServer:
      def.iceRezCostReductionProtectingThisServer,
    rootRezCostReductionThisServerIfThreat:
      def.rootRezCostReductionThisServerIfThreat
        ? { ...def.rootRezCostReductionThisServerIfThreat }
        : undefined,
    rezCostDiscountPerRezzedSubtype: def.rezCostDiscountPerRezzedSubtype
      ? { ...def.rezCostDiscountPerRezzedSubtype }
      : undefined,
    rezCostDiscountPerOtherUnrezzedIce: def.rezCostDiscountPerOtherUnrezzedIce,
    eventPlayCostDiscount: def.eventPlayCostDiscount,
    gainCreditOnFirstRunEvent: def.gainCreditOnFirstRunEvent,
    netDamageOnAgendaScoredOrStolen: def.netDamageOnAgendaScoredOrStolen,
    drawOnFirstRemoteCreated: def.drawOnFirstRemoteCreated,
    gainCreditOnTransactionPlayed: def.gainCreditOnTransactionPlayed,
    firstEncounterGainsCodeGate: def.firstEncounterGainsCodeGate,
    forbidScoreAgendaInstalledThisTurn: def.forbidScoreAgendaInstalledThisTurn,
    trashOnVirusPurge: def.trashOnVirusPurge,
    maxHostedCards: def.maxHostedCards,
    accessHostNonAgendaFaceup: def.accessHostNonAgendaFaceup
      ? { ...def.accessHostNonAgendaFaceup }
      : undefined,
    onWouldAccessArchivesHostInstead: def.onWouldAccessArchivesHostInstead
      ? { ...def.onWouldAccessArchivesHostInstead }
      : undefined,
    powerCountersOnInstall: def.powerCountersOnInstall,
    trashWhenPowerEmpty: def.trashWhenPowerEmpty,
    installServers: def.installServers
      ? [...def.installServers]
      : undefined,
    daemonHost: def.daemonHost,
    rfgWhenPowerEmpty: def.rfgWhenPowerEmpty,
    badPublicityCountersOnRez: def.badPublicityCountersOnRez,
    winWhenBadPublicityCountersEmpty: def.winWhenBadPublicityCountersEmpty,
    etrSubroutinesPerPowerCounter: def.etrSubroutinesPerPowerCounter,
    powerCounterOnHarmonicIceRez: def.powerCounterOnHarmonicIceRez,
    powerOnFirstInstalledCardCreditSpendThisTurn:
      def.powerOnFirstInstalledCardCreditSpendThisTurn,
    removePowerForBonusAccessOnHqRdBreach:
      def.removePowerForBonusAccessOnHqRdBreach,
    playRequiresSuccessfulRunThisTurn: def.playRequiresSuccessfulRunThisTurn,
    playRequiresThreat: def.playRequiresThreat,
    installRequiresSuccessfulCentralRunThisTurn:
      def.installRequiresSuccessfulCentralRunThisTurn,
    agendaPointsPerAgendaCounter: def.agendaPointsPerAgendaCounter,
    cannotBreakWithAi: def.cannotBreakWithAi,
    cannotBreakWithAiAtAdvancements: def.cannotBreakWithAiAtAdvancements,
    cannotBreakExceptSubtype: def.cannotBreakExceptSubtype,
    cannotBeTrashedByRunnerWhileRezzed: def.cannotBeTrashedByRunnerWhileRezzed,
    strengthBonusIfSoleIceProtectingServer:
      def.strengthBonusIfSoleIceProtectingServer,
    paidAbilityCreditDiscountIfRunEventActive:
      def.paidAbilityCreditDiscountIfRunEventActive,
    threatGiveTagsOnRezzedTrash: def.threatGiveTagsOnRezzedTrash
      ? { ...def.threatGiveTagsOnRezzedTrash }
      : undefined,
    cannotBreakWithRunnerCardAbilities: def.cannotBreakWithRunnerCardAbilities,
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
    playRequiresSuccessfulAllCentralsThisTurn:
      def.playRequiresSuccessfulAllCentralsThisTurn,
    playRequiresScoredAgendaNotInstalledThisTurn:
      def.playRequiresScoredAgendaNotInstalledThisTurn,
    playRequiresNoCorpActionFinished: def.playRequiresNoCorpActionFinished,
    rezAdditionalCostForfeitAgenda: def.rezAdditionalCostForfeitAgenda,
    rezCostCreditDiscountOnForfeitAgenda:
      def.rezCostCreditDiscountOnForfeitAgenda,
    rezAdditionalCostDerezSubtype: def.rezAdditionalCostDerezSubtype,
    playAdditionalClick: def.playAdditionalClick,
    playAdditionalClicks: def.playAdditionalClicks,
    stealAdditionalClicks: def.stealAdditionalClicks,
    stealAdditionalCreditsWhileRezzed: def.stealAdditionalCreditsWhileRezzed,
    playCostDiscountPerIceProtectingServer:
      def.playCostDiscountPerIceProtectingServer,
    firstDoubleOperationClickDiscount: def.firstDoubleOperationClickDiscount,
    rezCostDiscountIfAgendaScoredOrStolenThisTurn:
      def.rezCostDiscountIfAgendaScoredOrStolenThisTurn,
    allIceStrengthPenalty: def.allIceStrengthPenalty,
    gainCreditOnBreakIceStrengthLteOncePerTurn:
      def.gainCreditOnBreakIceStrengthLteOncePerTurn,
    endsActionPhase: def.endsActionPhase,
    mayShuffleIntoRdWhenTrashed: def.mayShuffleIntoRdWhenTrashed,
    badPublicityOnScore: def.badPublicityOnScore,
    playCostXMaxRunnerTags: def.playCostXMaxRunnerTags,
    installSpendCreditsForPowerCounters:
      def.installSpendCreditsForPowerCounters,
    strengthPerPowerCounter: def.strengthPerPowerCounter,
    interfaceRequiresEqualStrength: def.interfaceRequiresEqualStrength,
    interfaceRequiresTrojanHost: def.interfaceRequiresTrojanHost,
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
        oncePerEncounter: a.oncePerEncounter,
        usableFromHq: a.usableFromHq,
        usableFromArchives: a.usableFromArchives,
        usableByAnyPlayer: a.usableByAnyPlayer,
        usableFromRunnerScoreArea: a.usableFromRunnerScoreArea,
        requireProtectingHostServer: a.requireProtectingHostServer,
        requiresAdvancements: a.requiresAdvancements,
        requiresThreat: a.requiresThreat,
        requiresSuccessfulRdRunThisTurn: a.requiresSuccessfulRdRunThisTurn,
        requiresSuccessfulAllCentralsThisTurn:
          a.requiresSuccessfulAllCentralsThisTurn,
        requiresUntagged: a.requiresUntagged,
        requireOtherServer: a.requireOtherServer,
        requireEncounterSubtype: a.requireEncounterSubtype,
        requireAttackingMark: a.requireAttackingMark,
        requireBrokenSubThisEncounter: a.requireBrokenSubThisEncounter,
        requireDuringRun: a.requireDuringRun,
        requiresCorpCreditsGte: a.requiresCorpCreditsGte,
        startsRun: a.startsRun ? structuredClone(a.startsRun) : undefined,
      }),
    );
  }
  if (def.onRez) card.onRez = structuredClone(def.onRez);
  if (def.onPlay) card.onPlay = structuredClone(def.onPlay);
  if (def.playAdditionalCost) {
    card.playAdditionalCost = structuredClone(def.playAdditionalCost);
  }
  if (def.onScore) card.onScore = structuredClone(def.onScore);
  if (def.onForfeit) card.onForfeit = structuredClone(def.onForfeit);
  if (def.scoreAdditionalCost) {
    card.scoreAdditionalCost = structuredClone(def.scoreAdditionalCost);
  }
  if (def.trashAdditionalCost) {
    card.trashAdditionalCost = structuredClone(def.trashAdditionalCost);
  }
  if (def.stealAdditionalCostFromProtectingServer) {
    card.stealAdditionalCostFromProtectingServer = structuredClone(
      def.stealAdditionalCostFromProtectingServer,
    );
  }
  if (def.onSteal) card.onSteal = structuredClone(def.onSteal);
  if (def.onEncounter) card.onEncounter = structuredClone(def.onEncounter);
  if (def.onPass) card.onPass = structuredClone(def.onPass);
  if (def.onBypass) card.onBypass = structuredClone(def.onBypass);
  if (def.onBypassMayInstallFromHeap) {
    card.onBypassMayInstallFromHeap = { ...def.onBypassMayInstallFromHeap };
  }
  if (def.onFirstProgramInstallEachTurn) {
    card.onFirstProgramInstallEachTurn = structuredClone(
      def.onFirstProgramInstallEachTurn,
    );
  }
  if (def.onFirstCorpCardTrashEachTurn) {
    card.onFirstCorpCardTrashEachTurn = structuredClone(
      def.onFirstCorpCardTrashEachTurn,
    );
  }
  if (def.onFirstRunnerStoleOrTrashedCorpCardThisTurn) {
    card.onFirstRunnerStoleOrTrashedCorpCardThisTurn = structuredClone(
      def.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    );
  }
  if (def.onAccessTrash) {
    card.onAccessTrash = structuredClone(def.onAccessTrash);
  }
  if (def.onFirstCorpRootInstallEachTurn) {
    card.onFirstCorpRootInstallEachTurn = structuredClone(
      def.onFirstCorpRootInstallEachTurn,
    );
  }
  if (def.onAccessRequiresRezzed) card.onAccessRequiresRezzed = true;
  if (def.onPassHost) card.onPassHost = structuredClone(def.onPassHost);
  if (def.hostedCreditsOnAnyIceRez !== undefined) {
    card.hostedCreditsOnAnyIceRez = def.hostedCreditsOnAnyIceRez;
  }
  if (def.hostedCreditsSpendFor) {
    card.hostedCreditsSpendFor = [...def.hostedCreditsSpendFor];
  }
  if (def.hostedCreditsSpendForInstallSubtypes) {
    card.hostedCreditsSpendForInstallSubtypes = [
      ...def.hostedCreditsSpendForInstallSubtypes,
    ];
  }
  if (def.accessTrashSelfNonAgendaThenDraw) {
    card.accessTrashSelfNonAgendaThenDraw = true;
  }
  if (def.rezAdditionalCost) {
    card.rezAdditionalCost = structuredClone(def.rezAdditionalCost);
  }
  if (def.onHostRezzed) card.onHostRezzed = structuredClone(def.onHostRezzed);
  if (def.onHostDerezzed) {
    card.onHostDerezzed = structuredClone(def.onHostDerezzed);
  }
  if (def.threatCannotSpendCreditsDuringSubs !== undefined) {
    card.threatCannotSpendCreditsDuringSubs =
      def.threatCannotSpendCreditsDuringSubs;
  }
  if (def.onApproachServer) {
    card.onApproachServer = structuredClone(def.onApproachServer);
  }
  if (def.onApproachIce) {
    card.onApproachIce = structuredClone(def.onApproachIce);
  }
  if (def.identityFlippedHooks) {
    card.identityFlippedHooks = structuredClone(def.identityFlippedHooks);
  }
  if (def.onRunnerDiscardOverMaxHand) {
    card.onRunnerDiscardOverMaxHand = structuredClone(
      def.onRunnerDiscardOverMaxHand,
    );
  }
  if (def.onCreditsGainedFromAgendaOrOperationAbility) {
    card.onCreditsGainedFromAgendaOrOperationAbility = structuredClone(
      def.onCreditsGainedFromAgendaOrOperationAbility,
    );
  }
  if (def.remoteOnly) card.remoteOnly = true;
  if (def.persistent) card.persistent = true;
  if (def.rezOnlyDuringCorpTurn) card.rezOnlyDuringCorpTurn = true;
  if (def.firstRunCannotTargetRemote) card.firstRunCannotTargetRemote = true;
  if (def.iceGainsTrashToResolveChosenSubOnEncounter) {
    card.iceGainsTrashToResolveChosenSubOnEncounter = true;
  }
  if (def.onTurnBegin) card.onTurnBegin = structuredClone(def.onTurnBegin);
  if (def.onInstall) card.onInstall = structuredClone(def.onInstall);
  if (def.onInstallWithoutSpendingCredits) {
    card.onInstallWithoutSpendingCredits = structuredClone(
      def.onInstallWithoutSpendingCredits,
    );
  }
  if (def.onAccessFaceupInstalledAgenda) {
    card.onAccessFaceupInstalledAgenda = structuredClone(
      def.onAccessFaceupInstalledAgenda,
    );
  }
  if (def.onInstallFromNonHq) {
    card.onInstallFromNonHq = structuredClone(def.onInstallFromNonHq);
  }
  if (def.onCorpTurnEnd) {
    card.onCorpTurnEnd = structuredClone(def.onCorpTurnEnd);
  }
  if (def.onDiscardPhaseEnd) {
    card.onDiscardPhaseEnd = structuredClone(def.onDiscardPhaseEnd);
  }
  if (def.onCorpActionPhaseEnd) {
    card.onCorpActionPhaseEnd = structuredClone(def.onCorpActionPhaseEnd);
  }
  if (def.onRunnerActionPhaseEnd) {
    card.onRunnerActionPhaseEnd = structuredClone(def.onRunnerActionPhaseEnd);
  }
  if (def.onAnyIceRez) {
    card.onAnyIceRez = structuredClone(def.onAnyIceRez);
  }
  if (def.onFirstAgendaScoredOrStolenThisTurn) {
    card.onFirstAgendaScoredOrStolenThisTurn = structuredClone(
      def.onFirstAgendaScoredOrStolenThisTurn,
    );
  }
  if (def.onRunBegin) {
    card.onRunBegin = structuredClone(def.onRunBegin);
  }
  if (def.onMovedToServerRoot) {
    card.onMovedToServerRoot = structuredClone(def.onMovedToServerRoot);
  }
  if (def.advancedIceProtectingThisServerStrengthBonus !== undefined) {
    card.advancedIceProtectingThisServerStrengthBonus =
      def.advancedIceProtectingThisServerStrengthBonus;
  }
  if (def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked) {
    card.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked = {
      ...def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked,
    };
  }
  if (def.onCorpTurnEndDerezUpToIceProtectingLightningServer) {
    card.onCorpTurnEndDerezUpToIceProtectingLightningServer = {
      ...def.onCorpTurnEndDerezUpToIceProtectingLightningServer,
    };
  }
  if (def.oncePerTurnOnRezIceProtectingThisServerDuringRun) {
    card.oncePerTurnOnRezIceProtectingThisServerDuringRun = {
      ...def.oncePerTurnOnRezIceProtectingThisServerDuringRun,
    };
  }
  if (def.onRezApOrDestroyerIceDuringRun) {
    card.onRezApOrDestroyerIceDuringRun = {
      ...def.onRezApOrDestroyerIceDuringRun,
    };
  }
  if (def.derezAtAnyTurnEnd) {
    card.derezAtAnyTurnEnd = true;
  }
  if (def.powerOnHqRdRunEndIfAccessedGte) {
    card.powerOnHqRdRunEndIfAccessedGte = {
      ...def.powerOnHqRdRunEndIfAccessedGte,
    };
  }
  if (def.bonusAccessOnHqRdBreachWhileTagged !== undefined) {
    card.bonusAccessOnHqRdBreachWhileTagged =
      def.bonusAccessOnHqRdBreachWhileTagged;
  }
  if (def.threatBasicTrashAdditionalCostTrashHq !== undefined) {
    card.threatBasicTrashAdditionalCostTrashHq =
      def.threatBasicTrashAdditionalCostTrashHq;
  }
  if (def.wageWorkersTrackActions) {
    card.wageWorkersTrackActions = true;
  }
  if (def.onSuccessfulRun) {
    card.onSuccessfulRun = structuredClone(def.onSuccessfulRun);
  }
  if (def.onSuccessfulRunOncePerTurn) {
    card.onSuccessfulRunOncePerTurn = true;
  }
  if (def.onAccess) card.onAccess = structuredClone(def.onAccess);
  if (def.onTrash) card.onTrash = structuredClone(def.onTrash);
  if (def.onVirusPurge) card.onVirusPurge = structuredClone(def.onVirusPurge);
  if (def.onBreachHqIfHostingCorpCard) {
    card.onBreachHqIfHostingCorpCard = structuredClone(
      def.onBreachHqIfHostingCorpCard,
    );
  }
  if (def.onTrashFromGripOrStack) {
    card.onTrashFromGripOrStack = structuredClone(def.onTrashFromGripOrStack);
  }
  if (def.onRezzedCardTrashed) {
    card.onRezzedCardTrashed = structuredClone(def.onRezzedCardTrashed);
  }
  if (def.onFirstTagThisTurn) {
    card.onFirstTagThisTurn = structuredClone(def.onFirstTagThisTurn);
  }
  if (def.onTakeTagsWhenUntagged) {
    card.onTakeTagsWhenUntagged = structuredClone(def.onTakeTagsWhenUntagged);
  }
  if (def.connectionBasicTrashAdditionalCostTrashHq) {
    card.connectionBasicTrashAdditionalCostTrashHq = true;
  }
  if (def.onEncounterEndIfRezzedThisTurn) {
    card.onEncounterEndIfRezzedThisTurn = structuredClone(
      def.onEncounterEndIfRezzedThisTurn,
    );
  }
  if (def.onEncounterEnd) {
    card.onEncounterEnd = structuredClone(def.onEncounterEnd);
  }
  if (def.onAfterOperationOrExpendable) {
    card.onAfterOperationOrExpendable = structuredClone(
      def.onAfterOperationOrExpendable,
    );
  }
  if (def.creditsOnFirstRdTrashThisTurn !== undefined) {
    card.creditsOnFirstRdTrashThisTurn = def.creditsOnFirstRdTrashThisTurn;
  }
  if (def.onFirstPassRezzedCodeGateOrSentryThisTurn) {
    card.onFirstPassRezzedCodeGateOrSentryThisTurn = structuredClone(
      def.onFirstPassRezzedCodeGateOrSentryThisTurn,
    );
  }
  if (def.onFirstCoreDamageThisTurn) {
    card.onFirstCoreDamageThisTurn = structuredClone(
      def.onFirstCoreDamageThisTurn,
    );
  }
  if (def.onFirstRdRunBeginThisTurn) {
    card.onFirstRdRunBeginThisTurn = structuredClone(
      def.onFirstRdRunBeginThisTurn,
    );
  }
  if (def.onFirstArchivesRunBeginThisTurn) {
    card.onFirstArchivesRunBeginThisTurn = structuredClone(
      def.onFirstArchivesRunBeginThisTurn,
    );
  }
  if (def.onFirstRunBeginThisTurn) {
    card.onFirstRunBeginThisTurn = structuredClone(def.onFirstRunBeginThisTurn);
  }
  if (def.maxRemoteServers !== undefined) {
    card.maxRemoteServers = def.maxRemoteServers;
  }
  if (def.onFirstRemoteInstallThisTurn) {
    card.onFirstRemoteInstallThisTurn = structuredClone(
      def.onFirstRemoteInstallThisTurn,
    );
  }
  if (def.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun !== undefined) {
    card.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun =
      def.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun;
  }
  if (def.onFirstVirusInstallThisTurn) {
    card.onFirstVirusInstallThisTurn = structuredClone(
      def.onFirstVirusInstallThisTurn,
    );
  }
  if (def.onFirstSuccessfulMarkRunThisTurn) {
    card.onFirstSuccessfulMarkRunThisTurn = structuredClone(
      def.onFirstSuccessfulMarkRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulHqRunThisTurn) {
    card.onFirstSuccessfulHqRunThisTurn = structuredClone(
      def.onFirstSuccessfulHqRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulCentralRunThisTurn) {
    card.onFirstSuccessfulCentralRunThisTurn = structuredClone(
      def.onFirstSuccessfulCentralRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulRunThisTurn) {
    card.onFirstSuccessfulRunThisTurn = structuredClone(
      def.onFirstSuccessfulRunThisTurn,
    );
  }
  if (def.onProgramOrHardwareInstall) {
    card.onProgramOrHardwareInstall = structuredClone(
      def.onProgramOrHardwareInstall,
    );
  }
  if (def.onHardwareInstallOrTrash) {
    card.onHardwareInstallOrTrash = structuredClone(
      def.onHardwareInstallOrTrash,
    );
  }
  if (def.onPowerCountersGte) {
    card.onPowerCountersGte = {
      amount: def.onPowerCountersGte.amount,
      effect: structuredClone(def.onPowerCountersGte.effect),
    };
  }
  if (def.onHostedCreditsGte) {
    card.onHostedCreditsGte = {
      amount: def.onHostedCreditsGte.amount,
      effect: structuredClone(def.onHostedCreditsGte.effect),
    };
  }
  if (def.onAgendaScored) {
    card.onAgendaScored = structuredClone(def.onAgendaScored);
  }
  if (def.onAgendaScoredOrStolen) {
    card.onAgendaScoredOrStolen = structuredClone(def.onAgendaScoredOrStolen);
  }
  if (def.onAgendaStolen) {
    card.onAgendaStolen = structuredClone(def.onAgendaStolen);
  }
  if (def.onFullyBreakOncePerTurn) {
    card.onFullyBreakOncePerTurn = structuredClone(
      def.onFullyBreakOncePerTurn,
    );
  }
  if (def.onFullyBreak) {
    card.onFullyBreak = structuredClone(def.onFullyBreak);
  }
  if (def.hostedCreditsOnRunEventPlay !== undefined) {
    card.hostedCreditsOnRunEventPlay = def.hostedCreditsOnRunEventPlay;
  }
  if (def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess !== undefined) {
    card.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess =
      def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess;
  }
  if (def.onBreachRdIfAccessGteMayBonusAccess) {
    card.onBreachRdIfAccessGteMayBonusAccess = {
      ...def.onBreachRdIfAccessGteMayBonusAccess,
    };
  }
  if (def.onRemoveTags) {
    card.onRemoveTags = structuredClone(def.onRemoveTags);
  }
  if (def.onRunnerTurnEnd) {
    card.onRunnerTurnEnd = structuredClone(def.onRunnerTurnEnd);
  }
  if (def.onFirstResourcePaidAbilityEachTurn) {
    card.onFirstResourcePaidAbilityEachTurn = structuredClone(
      def.onFirstResourcePaidAbilityEachTurn,
    );
  }
  if (def.powerCounterOnAnyCardRez !== undefined) {
    card.powerCounterOnAnyCardRez = def.powerCounterOnAnyCardRez;
  }
  if (def.powerCountersOnPlay !== undefined) {
    card.powerCountersOnPlay = def.powerCountersOnPlay;
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

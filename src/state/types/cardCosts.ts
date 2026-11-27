/** The costs, discounts and requirements on a card instance: what it costs, and what it needs before it can be played, installed, rezzed or used. */

import type { Effect } from "../../effects/ir.js";

/**
 * The `CardInstance` fields whose names say Cost, Discount or Requires (and are
 * not trigger hooks): what the card costs, what makes it cheaper, and what it
 * needs before it can be played, installed, rezzed or used.
 * `tests/state-types-layout.test.ts` checks the rule.
 */
export interface CardCostsAndRequirements {
  /** Printed install cost in credits (programs/hardware/resources/ice). */
  installCost: number;
  /** Corp rez cost (ice/assets/upgrades). */
  rezCost?: number;
  /** Play cost for operations / events. */
  playCost?: number;
  /**
   * Effect IR paid as an additional cost when playing this event/operation
   * (e.g. Running Hot: suffer 1 core damage). Evaluated after credit/click
   * costs and after the card leaves hand, before `onPlay`.
   */
  playAdditionalCost?: Effect;
  /**
   * Additional cost Effect IR paid before scoring this agenda
   * (e.g. Azef Protocol: must trash 1 other installed Corp card).
   * Evaluated before the agenda leaves its server; scoring resumes after
   * any pending choice resolves (`pendingScoreAgendaId`).
   */
  scoreAdditionalCost?: Effect;
  /**
   * Additional cost Effect IR paid before stealing this agenda
   * (e.g. SDS Drone Deployment: trash 1 installed program).
   * Paid via `pendingStealAgendaId` like Daniela protecting-server costs.
   */
  stealAdditionalCost?: Effect;
  /**
   * Additional cost Effect IR before trashing this installed/accessed card
   * (Daniela Jorge Inácio).
   */
  trashAdditionalCost?: Effect;
  /**
   * Additional cost when stealing an agenda from a server this card protects
   * (persistent OK while unrezzed).
   */
  stealAdditionalCostFromProtectingServer?: Effect;
  /**
   * Reduce play cost by 1 per ice protecting this server (Tailgate: "hq").
   */
  playCostDiscountPerIceProtectingServer?: "hq" | "rd" | "archives";
  /**
   * While rezzed, the first double operation each turn costs this many clicks
   * less to play (Synchrocyclotron).
   */
  firstDoubleOperationClickDiscount?: number;
  /**
   * Effect IR paid as an additional cost when rezzing this card (Valentão).
   * Uses `pendingRezCardId` when the cost opens a choice.
   */
  rezAdditionalCost?: Effect;
  /** Mahkota: +N trash cost for assets in this server's root. */
  serverRootAssetTrashCostBonus?: number;
  /**
   * Encryption Protocol: while rezzed, +N to trash cost of all installed cards.
   */
  installedCardsTrashCostBonus?: number;
  /**
   * Amazon Industrial Zone: after Corp installs ice protecting this server,
   * may immediately rez it lowering rez cost by this amount.
   */
  mayImmediatelyRezIceOnInstallProtectingThisServerDiscount?: number;
  /** Sebastião: Corp basic trash of connection also costs trash 1 from HQ. */
  connectionBasicTrashAdditionalCostTrashHq?: boolean;
  /**
   * Hype Machine: rez cost reduced by this amount if an agenda was scored or
   * stolen this turn.
   */
  rezCostDiscountIfAgendaScoredOrStolenThisTurn?: number;
  /** Brain-Taping Warehouse. */
  bioroidIceRezCostReductionPerRunnerClickRemaining?: number;
  /** Hacktivist Meeting. */
  rezNonIceAdditionalCostRandomTrashHq?: boolean;
  /** Recruiting Trip. */
  playCostX?: boolean;
  /** Student Loans. */
  eventPlayExtraCostIfCopyInHeap?: number;
  /** Breaker Bay Grid. */
  rootRezCostReductionThisServer?: number;
  /** Oaktown Grid: trash cost of each card in the root +N. */
  rootTrashCostIncreaseThisServer?: number;
  /** Wireless Net Pavilion. */
  basicTrashResourceAdditionalCostCredits?: number;
  /** SYNC front: +N¢ to basic remove-tag while unflipped. */
  basicRemoveTagAdditionalCostCreditsWhileUnflipped?: number;
  /** 24/7 News Cycle: forfeit agenda to play. */
  playAdditionalCostForfeitAgenda?: boolean;
  /** Neutralize All Threats: must trash first trash-cost access. */
  mustTrashFirstAccessedCardWithTrashCostEachTurn?: boolean;
  /** Globalsec: install requires link ≥ N. */
  installRequiresLinkGte?: number;
  /** Jak Sinclair: −N install cost per link. */
  installCostReductionPerLink?: number;
  additionalCreditCostToInstallInChosenServer?: number;
  playRequiresInstalledSubtype?: string;
  /** Political Operative */
  installRequiresSuccessfulHqRunThisTurn?: boolean;
  /** Salsette Slums */
  accessPayTrashCostRemoveFromGameOncePerTurn?: boolean;
  /** Voter Intimidation */
  playRequiresAgendaInRunnerScoreArea?: boolean;
  trashCostIncreasePerHostedCard?: number;
  /** Zealous Judge */
  rezRequiresTagged?: boolean;
  additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte?: number;
  firstIceRezCostReductionPerRunnerTag?: boolean;
  playRequiresRunnerCreditsGte?: number;
  playRequiresRunnerCreditsLt?: number;
  resourceInstallCostIncrease?: number;
  playRequiresCorpScoredNoAgendasLastTurn?: boolean;
  iceNotInnermostInstallCostIncrease?: number;
  daemonHostInstallCreditDiscount?: number;
  playRequiresOtherCardsInHq?: number;
  installCostX?: boolean;
  playRequiresNoSuccessfulRunLastTurn?: boolean;
  nonVirtualResourceInstallCostIncrease?: number;
  /** Crimson Dust (cd) */
  playRequiresSuccessfulCentralRunThisTurn?: boolean;
  operationAndEventPlayCostIncrease?: number;
  memoryCostPerPowerCounter?: number;
  playRequiresRunnerHasInstalledHardwareOrNonVirtualResource?: boolean;
  playRequiresRunnerHasInstalledCard?: boolean;
  programInstallCostIncrease?: number;
  hardwareInstallCostIncrease?: number;
  virtualResourceInstallCostIncrease?: number;
  /** Whispers in Nalubaale (win) */
  accessTrashNonAgendaWithVirusEqualPrintedCost?: boolean;
  /** Starlight Crusade Funding: ignore additional cost on first double event each turn. */
  ignoreAdditionalCostFirstDoubleEventEachTurn?: boolean;
  /** Printed trash cost (assets/upgrades). */
  trashCost?: number;
  /** Boi-tatá: paid ability credit discount after own installed trash this turn. */
  paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn?: number;
  corpPlayCostIncreaseForRunnerEventsOps?: number;
  /** Memory units this program uses (default 1 for programs). */
  memoryCost?: number;
  /**
   * Key Master cloud: effective MU is 0 while Runner link ≥ this value
   * (printed link from identity + installed link sources).
   */
  memoryCostZeroIfLinkGte?: number;
  /**
   * Demolisher: while installed, lower trash cost of each Corp card by N
   * (floored at 0).
   */
  corpCardTrashCostReduction?: number;
  /** Principia: −install cost per currently installed icebreaker. */
  installCostDiscountPerInstalledIcebreaker?: number;
  /** Lower install cost after a successful run this turn (Carmen). */
  installCostDiscountIfSuccessfulRunThisTurn?: number;
  /** Penumbral: −N install cost if successful HQ run this turn. */
  installCostDiscountIfSuccessfulHqRunThisTurn?: number;
  /** Lower first program install cost this turn while this card is installed (DZMZ). */
  firstProgramInstallDiscount?: number;
  /**
   * Az McCaffrey: first job/connection resource or hardware install each turn
   * costs this many credits less (identity).
   */
  firstJobConnectionOrHardwareInstallDiscount?: number;
  /** Kate-class: first program or hardware install each turn costs this less. */
  firstProgramOrHardwareInstallDiscount?: number;
  /** Aggressive Negotiation-class: play only if Corp scored an agenda this turn. */
  playRequiresScoredAgendaThisTurn?: boolean;
  playRequiresTagged?: boolean;
  /** Too Big to Fail: play only if the playing side has fewer than N credits. */
  playRequiresCreditsLt?: number;
  /** Office Supplies: reduce this event's play cost by Runner link. */
  playCostReducedByLink?: boolean;
  /** Under the Bus: play only if Runner accessed a card last turn. */
  playRequiresRunnerAccessedCardLastTurn?: boolean;
  /** Sell Out: play only with ≥1 installed resource. */
  playRequiresInstalledResource?: boolean;
  /** Spec Work: play only with ≥1 installed program. */
  playRequiresInstalledProgram?: boolean;
  /** Rejig: play only with ≥1 installed program or hardware. */
  playRequiresInstalledProgramOrHardware?: boolean;
  /** Play only if the Runner has no tags (Eye for an Eye). */
  playRequiresUntagged?: boolean;
  /** Play only if Runner has at least this many tags (Shipment from Vladisibirsk). */
  playRequiresMinTags?: number;
  /** Play restriction: Runner made a successful run last turn. */
  playRequiresSuccessfulRunLastTurn?: boolean;
  /** Successful Demonstration: Runner's last run was unsuccessful. */
  playRequiresUnsuccessfulRunLastTurn?: boolean;
  /** Neural EMP: Runner made a run (success not required) last turn. */
  playRequiresRunnerMadeRunLastTurn?: boolean;
  /** Hellion Alpha Test: Runner installed a resource during their last turn. */
  playRequiresRunnerInstalledResourceLastTurn?: boolean;
  /**
   * Play only if the Runner did not make a successful HQ run last turn
   * (Digital Rights Management).
   */
  playRequiresNoSuccessfulHqRunLastTurn?: boolean;
  /** Play only if the Runner stole an agenda last turn (Distributed Tracing). */
  playRequiresAgendaStolenLastTurn?: boolean;
  /**
   * In the Groove: play only as the Runner's first click this turn (priority;
   * CR 1.11.4).
   */
  playRequiresFirstClick?: boolean;
  /**
   * In the Groove: delayed conditional registered on play — for the remainder
   * of this turn, on install with printed install cost ≥ min, resolve effect.
   */
  remainderOfTurnOnInstallPrintedCostGte?: { min: number; effect: Effect };
  /** Play only if Runner stole or trashed a Corp card last turn (Oppo Research). */
  playRequiresRunnerStoleOrTrashedCorpCardLastTurn?: boolean;
  /**
   * Hangeki: play only if the Runner trashed a Corp card last turn
   * (trash-only; steal alone does not count).
   */
  playRequiresRunnerTrashedCorpCardLastTurn?: boolean;
  /** Hangeki: play only if Corp has at least one installed card. */
  playRequiresCorpHasInstalledCard?: boolean;
  /** Play only if the Runner stole an agenda this turn (Reprise / Kraken). */
  playRequiresAgendaStolenThisTurn?: boolean;
  /** Surge: play only if a virus counter was placed on a program this turn. */
  playRequiresVirusCounterPlacedOnProgramThisTurn?: boolean;
  /**
   * Moshing: require at least this many *other* grip cards when playing
   * (additional trash-from-grip cost).
   */
  playRequiresOtherGripCardsGte?: number;
  /** Send a Message: may rez any ice ignoring all costs. */
  mayRezIceIgnoringCostsOnScoreOrSteal?: boolean;
  /** Reina: first ice rez each turn costs this much more. */
  firstIceRezCostIncrease?: number;
  /** Xanadu: each ice rez costs this much more. */
  iceRezCostIncrease?: number;
  /**
   * Cat's Cradle-class: while installed, increase rez cost of ice that has
   * `subtype` by `amount` credits (CR §1.16.2a / §8.1.2d).
   */
  iceRezCostIncreaseBySubtype?: { subtype: string; amount: number };
  /**
   * Rook-class: while hosted on ice, ice protecting that ice's server gets
   * +N rez cost (CR §1.16.2a / §8.1.2d).
   */
  iceRezCostIncreaseProtectingHostedServer?: number;
  /**
   * Rezzed upgrade in this server root: ice protecting this server costs N
   * less to rez (Vovô Ozetti).
   */
  iceRezCostReductionProtectingThisServer?: number;
  /**
   * Rezzed upgrade in this server root: other cards in root cost less to rez
   * while Threat is active (Vovô Ozetti).
   */
  rootRezCostReductionThisServerIfThreat?: { level: number; amount: number };
  /** Complete Image: play only if Runner has ≥ N agenda points. */
  playRequiresRunnerAgendaPointsGte?: number;
  /** Manuel: Threat N → Corp basic trash also costs trash 1 from HQ. */
  threatBasicTrashAdditionalCostTrashHq?: number;
  /**
   * Braintrust: while scored, reduce ice rez costs by this many credits per
   * agenda counter on this card (CR §1.16.2a / §8.1.2d). Floored at 0.
   */
  iceRezCostReductionPerAgendaCounter?: number;
  /**
   * Ivik-class: when rezzing this ice, reduce its rez cost by `amount` per
   * already-rezzed ice that has `subtype` (CR §1.16.2a / §8.1.2d). Floored at 0.
   */
  rezCostDiscountPerRezzedSubtype?: { subtype: string; amount: number };
  /**
   * Reverb-class: when rezzing this ice, reduce its rez cost by this many
   * credits per other unrezzed piece of ice (CR §1.16.2a / §8.1.2d). Floored at 0.
   */
  rezCostDiscountPerOtherUnrezzedIce?: number;
  /**
   * Ghosttongue-class: while installed, lower the play cost of each event
   * by this many credits (CR §1.16.2a; floored at 0).
   */
  eventPlayCostDiscount?: number;
  /**
   * Word on the Street: additional cost Effect IR when Corp scores an agenda
   * installed this turn (typically add this card to Corp score as −1 AP).
   */
  additionalCostOnScoreAgendaInstalledThisTurn?: Effect;
  /** Play only if successful run this turn. */
  playRequiresSuccessfulRunThisTurn?: boolean;
  /** Install only after a successful central run this turn (Time Bomb). */
  installRequiresSuccessfulCentralRunThisTurn?: boolean;
  /** Play only if successful HQ run this turn. */
  playRequiresSuccessfulHqRunThisTurn?: boolean;
  /** Play only if successful runs on HQ, R&D, and Archives this turn (Deep Dive). */
  playRequiresSuccessfulAllCentralsThisTurn?: boolean;
  /** Blackmail: play only if Corp bad publicity ≥ N. */
  playRequiresCorpBadPublicityGte?: number;
  /** Midway Station Grid: +N credit to use icebreaker abilities on this server. */
  runnerIcebreakerAbilityAdditionalCostOnThisServer?: number;
  /**
   * Play only if Corp scored an agenda this turn that was not installed this
   * turn (Myōshu).
   */
  playRequiresScoredAgendaNotInstalledThisTurn?: boolean;
  /** Petty Cash: play only before the first Corp action completes. */
  playRequiresNoCorpActionFinished?: boolean;
  /**
   * Lockdown: play only if no lockdown is active in corp:play-area
   * (CR 3.5.1c).
   */
  playRequiresNoActiveLockdown?: boolean;
  runnerFirstRunEachTurnAdditionalCost?: number;
  ignoreInstallCostFirstIceEachTurn?: boolean;
  rezCostIncreasePerCorpCardInHq?: number;
  trashCostIncreasePerFacedownArchivesCard?: number;
  briberyPlayCostX?: boolean;
  rezCostReductionPerAdvancement?: number;
  installRequiresCorpBadPublicityGte?: number;
  runnerFirstInstallCostIncreasePerPowerCounterOnThis?: number;
  /** Measured Response: play only at Threat ≥ N. */
  playRequiresThreat?: number;
  /** Sang Kancil: paid ability credit discount while a run event is active. */
  paidAbilityCreditDiscountIfRunEventActive?: number;
  /**
   * Lampades: mid-access spend 1 power + pay printed rez/play cost from
   * stealth credits to trash the accessed card.
   */
  accessTrashPayingPrintedCostFromStealth?: boolean;
  /** Rez requires forfeiting 1 scored agenda (Archer, Corporate Town). */
  rezAdditionalCostForfeitAgenda?: boolean;
  /**
   * Optional: forfeit 1 scored agenda when rezzing to reduce rez cost by N¢
   * (Biawak).
   */
  rezCostCreditDiscountOnForfeitAgenda?: number;
  /**
   * As an additional rez cost, derez another rezzed ice with this subtype
   * (Bloop: harmonic).
   */
  rezAdditionalCostDerezSubtype?: string;
  /**
   * Hired Help: forfeit a scored agenda to run this server unless successful
   * HQ run this turn.
   */
  additionalRunCostTrashAgendaFromScoreUnlessSuccessfulHqThisTurn?: boolean;
  /** Play cost X ≤ Runner tags; places X advancements (Psychographics). */
  playCostXMaxRunnerTags?: boolean;
  /** May only interface ice of equal strength (Atman). */
  interfaceRequiresEqualStrength?: boolean;
  /** May only interface ice hosting a trojan program (Umbrella). */
  interfaceRequiresTrojanHost?: boolean;
  /** May only interface ice protecting the server chosen on install (Cyber-Cypher). */
  interfaceRequiresChosenServer?: boolean;
  /** HB Architects: first pass of rezzed bioroid → may rez bioroid −4¢. */
  rezBioroidDiscountOnFirstPass?: number;
  /**
   * Omni-drive: may host 1 program with printed MU at most this value; the
   * hosted program's MU does not count against the memory limit.
   */
  hostsAnyProgramMemoryCostLte?: number;
  /**
   * Awakening Center: Corp may install bioroid ice hosted on this upgrade at
   * no install cost (`InstallDestination` kind `host_upgrade`). While
   * rezzed, whenever the Runner passes all ice protecting this server, the
   * Corp may rez 1 hosted piece of ice paying 7 less, forcing the Runner to
   * encounter it; that ice is trashed when the run ends.
   */
  hostsBioroidIceIgnoreInstallCost?: boolean;
  playOrInstallDiscountByTrashingGripOncePerTurn?: number;
}

/** Core game-state types for the Netrunner engine library. */

import type { Effect } from "../effects/ir.js";

export type Side = "corp" | "runner";

/**
 * Restriction on when recurring credits on a card may be spent.
 * Purpose gates (`trash` / `trash_asset` / `play_event`) match Paricia /
 * Scrubber / Prepaid VoicePAD. `run_central` matches Cezve: spendable for any
 * credit cost while the Runner is attacking a central server (CR §6.3.4).
 */
export type RecurringSpendPurpose =
  | "trash"
  | "trash_asset"
  | "play_event"
  | "run_central"
  /** Mahkota: spend recurring/hosted credits to rez on host server. */
  | "rez_host_server"
  /** Dedicated Server: spend recurring credits to rez ice (any server). */
  | "rez_ice"
  /** Mumba Temple: spend recurring credits to rez any card. */
  | "rez"
  /** Mantle-class: spend recurring credits to use programs (abilities / breakers). */
  | "use_program"
  /** Lockpick-class: spend recurring credits to use decoder programs only. */
  | "use_decoder"
  /** Dyson Fractal Generator: spend recurring credits to use fracter programs. */
  | "use_fracter"
  /** Silencer: spend recurring credits to use killer programs. */
  | "use_killer"
  /** Mantle-class: spend recurring credits to use hardware abilities. */
  | "use_hardware"
  /** Making News-class: spend recurring credits during trace attempts. */
  | "trace"
  /** Cyberfeeder-class: spend recurring credits to install virus programs. */
  | "install_virus"
  /** Inside Man: spend recurring credits to install hardware. */
  | "install_hardware"
  /** Sahasrara: spend recurring credits to install programs. */
  | "install_program"
  /** Crash Space-class: spend recurring credits for the basic remove-tag action. */
  | "basic_remove_tag"
  /** Weyland Because We Built It: spend recurring credits to advance ice. */
  | "advance_ice"
  /** Pheromones: spend recurring credits during runs on HQ. */
  | "run_hq"
  /** Simone Diego: spend recurring to advance cards in root/protecting this server. */
  | "advance_cards_this_server";

export type CardType =
  | "identity"
  | "agenda"
  | "asset"
  | "upgrade"
  | "ice"
  | "operation"
  | "event"
  | "hardware"
  | "program"
  | "resource";

export type ZoneId =
  | "corp:rd"
  | "corp:hq"
  | "corp:archives"
  | "corp:play-area"
  | "corp:score"
  | "runner:play-area"
  | "runner:stack"
  | "runner:grip"
  | "runner:heap"
  | "runner:rig"
  | "runner:score"
  | "runner:set-aside"
  | "runner:outside-game-identities"
  | "corp:set-aside"
  | "removed-from-game"
  | `server:${string}:root`
  | `server:${string}:ice`
  | `hosted:${string}`;

/** Damage kinds. `"brain"` is a CR alias of `"core"` (§10.4.2c). */
export type DamageType = "net" | "meat" | "core" | "brain";

export interface Subroutine {
  id: string;
  text: string;
  /** Effect IR executed when this sub resolves unbroken. */
  effect: Effect;
  /**
   * Zed 1.0: this subroutine cannot be broken unless the Runner has already
   * spent [click] to break a subroutine on a bioroid this run.
   */
  requireLostClickToBreakThisRun?: boolean;
}

export interface BreakerAbility {
  /**
   * Ice subtype this breaker can break, e.g. barrier.
   * Use `"*"` for AI breakers that break any ice.
   */
  breaksSubtype: string;
  strength: number;
  /** Credits to break one subroutine (or one ability use when breakMaxSubs > 1). */
  breakCredits: number;
  /**
   * When true, the standard `break_subroutine` action is not offered —
   * breaks only via paid abilities (e.g. Revolver trash / power-counter interface).
   */
  breakViaPaidAbilityOnly?: boolean;
  /**
   * Max subroutines broken per paid break ability use (default 1).
   * Extra breaks in the same encounter after paying once are free until the
   * remaining budget is spent (Buzzsaw / Cleaver "break up to 2").
   */
  breakMaxSubs?: number;
  /** Credits to pump (+pumpStrength, default 1) via paid ability. */
  pumpCredits?: number;
  pumpStrength?: number;
  /**
   * When pumping, strength gain equals installed icebreaker count (Unity)
   * instead of the fixed pump effect amount.
   */
  pumpUsesIcebreakerCount?: boolean;
  /** Reduce breakCredits by this much after a successful run this turn (Marjanah). */
  breakCreditsDiscountIfSuccessfulRunThisTurn?: number;
  /**
   * Reduce breakCredits by `amount` × count of installed cards with `subtype`
   * (Tremolo: cybernetic hardware).
   */
  breakCreditsDiscountPerInstalledSubtype?: {
    subtype: string;
    amount: number;
  };
  /** Standard credit break only while attacking the mark (Tunnel Vision). */
  breakRequiresAttackingMark?: boolean;
  /** Wyrm-class: only break when encountered ice effective strength ≤ this. */
  breakRequiresIceStrengthLte?: number;
  /** Sadyojata / Deva: only break ice with at least this many subtypes. */
  breakRequiresIceSubtypeCountGte?: number;
  /** Vamadeva: only break ice with exactly this many printed subroutines. */
  breakRequiresIceExactSubroutineCount?: number;
  /** Eater: after breaking a sub, cannot access cards for the rest of the run. */
  breakPreventsCardAccessForRun?: boolean;
}

export type PaidAbilityWindow =
  | "approach_paw"
  | "approach_server_paw"
  | "encounter_paw"
  | "corp_action_paw"
  | "runner_action_paw"
  | "damage_interrupt_paw"
  | "tag_interrupt_paw"
  | "when_encountered_interrupt_paw"
  | "trace_interrupt_paw"
  /**
   * Lucky Charm-class: interrupt before a Corp card ability ends the run.
   */
  | "end_the_run_interrupt_paw"
  | "expose_interrupt_paw"
  | "trash_interrupt_paw"
  /**
   * Tyr's Hand-class: interrupt before a subroutine on bioroid ice protecting
   * a server is marked broken. Opens `PendingSubroutineBreak`.
   */
  | "break_interrupt_paw"
  /** Completing non-PAW / non-phase-begin windows at Run Ends (CR 6.8.2c). */
  | "other_priority_window";

/** Cost model for paid abilities / play costs (CR 1.16). */
export interface CostSpec {
  clicks?: number;
  credits?: number;
  /** Spend from a card's recurring credit pool. */
  recurringCredits?: number;
  /** Spend hosted virus counters from this card. */
  virusCounters?: number;
  /** Spend hosted agenda counters from this card. */
  agendaCounters?: number;
  /** Spend hosted power counters from this card. */
  powerCounters?: number;
  /**
   * Spend hosted advancement tokens from this card as a cost
   * (Drago Ivanov–class paid abilities).
   */
  advancementTokens?: number;
  /** Trash this card as a cost. */
  trashSelf?: boolean;
  /** Forfeit 1 scored agenda as a cost (Data Dealer). */
  forfeitAgenda?: boolean;
  /**
   * Remove this card from the game as a cost (The Back).
   * Hosted counters remain readable on the card instance after RFG.
   */
  rfgSelf?: boolean;
  /** Trash this many cards from HQ (Corp). */
  trashFromHq?: number;
  /** Trash this many cards from grip (Runner). */
  trashFromGrip?: number;
  /** Monolith: trash a program from grip as a cost (chooses first found). */
  trashProgramFromGrip?: boolean;
  /**
   * Spend hosted power counters equal to the effective strength of the ice
   * being encountered (Baklan Bochkin). Resolved in `abilityCost` when
   * `state` is provided.
   */
  powerCountersEqualEncounterStrength?: boolean;
  /**
   * Physarum: pay this many credits × subroutine count on encountered ice.
   * Resolved in `abilityCost` when `state` is provided.
   */
  creditsPerEncounterSubroutine?: number;
  /**
   * Suffer this much core damage as a cost (Light the Fire!).
   * Always "payable"; may flatline (CR §10.4).
   */
  coreDamage?: number;
  /**
   * Take this many tags as a cost (Eru Ayase-Pessoa). Always payable.
   */
  tags?: number;
  /**
   * Remove this many Runner tags as a cost (B-1001).
   * Payable only when the Runner has at least that many tags.
   */
  removeTags?: number;
  /**
   * When true with `credits`, pay those credits only from hosted credits on
   * stealth cards (Corsair / Lampades / Baker).
   */
  creditsFromStealthOnly?: boolean;
  /**
   * Simulchip: as an additional cost, trash 1 installed program.
   * Ignored when `runnerTrashedOwnInstalledThisTurn` is already set.
   */
  trashInstalledProgramUnlessOwnInstalledTrashedThisTurn?: boolean;
}

/** Run started by an event or paid ability (Jailbreak, Red Team, Conduit). */
export interface StartsRunSpec {
  /**
   * Target filter for the run.
   * `"mark"` resolves to the current mark server (CR §10.11); empty if none.
   * `"remote"` matches remote servers only (Light the Fire!).
   */
  servers:
    | "any"
    | "central"
    | "hq_rd"
    | "rd"
    | "hq"
    | "archives"
    | "mark"
    | "remote";
  /** Red Team: only centrals not already run this turn. */
  requireNotRunThisTurn?: boolean;
  /** Kompromat: only servers protected by at least one piece of ice. */
  requiresProtectingIce?: boolean;
  /** High-Stakes Job: only servers with at least one unrezzed ice. */
  requiresUnrezzedIce?: boolean;
  /** Conduit: +X R&D access where X = virus counters on source. */
  bonusAccessFromVirus?: boolean;
  /** Flat bonus accesses (Jailbreak). */
  bonusAccess?: number;
  /** Tread Lightly: ice rez cost increase for this run. */
  iceRezCostIncrease?: number;
  /** Running Interference: additional rez cost equals printed rez cost. */
  iceRezAdditionalCostEqualsPrintedRezCost?: boolean;
  /** Bribery: first approached unrezzed ice +X rez (X = bribery play cost). */
  briberyFirstIceAdditionalRezEqualsX?: boolean;
  /** Showing Off: access R&D from the bottom. */
  accessFromBottomOfRd?: boolean;
  /** Knifed/Spooned/Forked: trash first fully broken ice of subtype. */
  trashFirstFullyBrokenSubtype?: string;
  /** Prey: may trash installed = ice strength to trash passed ice. */
  onPassIceMayTrashEqualStrengthToTrashIce?: boolean;
  /** Overclock: place this many spendable credits on the run. */
  placeEventCredits?: number;
  /**
   * Debbie: move hosted credits on the run source into run eventCredits.
   */
  transferHostedCreditsToEventCredits?: boolean;
  /** Effect fired when this run is successful (source = ability/event card). */
  onSuccessfulRun?: Effect;
  /**
   * Place this many power counters on the run source whenever a subroutine
   * resolves during the run (Raindrops Cut Stone; includes ETR subs).
   */
  addPowerCounterOnSubroutineResolve?: number;
  /** Effect fired when the run ends, success or not (source = run event). */
  onRunEnd?: Effect;
  /** Inside Job: bypass the first ice encounter of the run. */
  bypassFirstEncounter?: boolean;
  /** Feint: bypass the next N ice encounters this run. */
  bypassEncountersRemaining?: number;
  /** Recon: may jack out when encountering the first ice this run. */
  mayJackOutOnFirstIceEncounter?: boolean;
  /** Spear Phishing: bypass the innermost ice protecting the attacked server. */
  bypassInnermostEncounter?: boolean;
  /**
   * Threat N → at the second ice encounter this run, Runner may spend
   * [click] to bypass (S-Dobrado). Evaluated at run start.
   */
  bypassSecondEncounterForClickIfThreat?: number;
  /**
   * Alarm Clock: at the first ice encounter this run, Runner may spend
   * this many clicks to bypass.
   */
  bypassFirstEncounterForClicks?: number;
  /** Sneakdoor: when run would succeed, change attacked server. */
  redirectSuccessTo?: "hq" | "rd" | "archives";
  /** Maintenance Access: after Archives ice, approach HQ instead. */
  redirectApproachArchivesToHq?: boolean;
  /**
   * Baker: after Archives ice, may pay this many stealth credits to approach
   * HQ or R&D instead.
   */
  mayRedirectApproachArchivesToHqOrRdPayingStealthCredits?: number;
  /** Aircheck: cannot spend or lose credits from the credit pool this run. */
  blockCreditPoolSpendAndLose?: boolean;
  /** Blackmail: Corp cannot rez ice during this run. */
  forbidCorpRezIceDuringRun?: boolean;
  /** Shred: first Corp ETR prevented unless Corp trashes X random HQ. */
  shredPreventFirstEndTheRun?: boolean;
  /** Retrieval Run: on success, skip breach and may install program from heap. */
  skipBreachInstallProgramFromHeap?: boolean;
  /** Demolition Run: during this run, access → trash for 0¢. */
  accessTrashFree?: boolean;
  /** Skip breaching the attacked server on successful run (replace-breach events). */
  skipBreach?: boolean;
  /** The Noble Path: prevent all damage to the Runner during this run. */
  preventAllDamageThisRun?: boolean;
  /**
   * Immolation Script: once this run, when accessing faceup ice in Archives,
   * may instead trash 1 rezzed copy of that ice.
   */
  immolationScriptAccessReplace?: boolean;
  /**
   * During this run, cards in the root of the attacked server lose all abilities
   * (Light the Fire!).
   */
  blankAttackedServerRoot?: boolean;
  /** Window of Opportunity: derez 1 protecting ice when run begins. */
  derezProtectingIceOnRunBegin?: boolean;
  /** Window: Corp may rez that ice at run end ignoring costs. */
  mayRezEventDerezzedIceOnRunEndIgnoreCosts?: boolean;
}

/** Minimal paid ability (CR 9.5.1) — body is effect IR. */
export interface PaidAbility {
  id: string;
  label: string;
  /** @deprecated prefer `cost` */
  clickCost: number;
  /** @deprecated prefer `cost` */
  creditCost: number;
  cost?: CostSpec;
  windows: PaidAbilityWindow[];
  effect: Effect;
  /** Enforce once-per-turn usage for this ability. */
  oncePerTurn?: boolean;
  /** Enforce once-per-run usage for this ability. */
  oncePerRun?: boolean;
  /** Enforce once-per-encounter usage (Slap Vandal). */
  oncePerEncounter?: boolean;
  /** Hudson 1.0: Runner may use on the ice hosting this encounter. */
  usableByRunnerOnSelfIce?: boolean;
  /**
   * Corp ability usable while this card is in HQ (Expendable; Tree Line).
   */
  usableFromHq?: boolean;
  /**
   * Corp ability usable while this card is in Archives (Petty Cash).
   */
  usableFromArchives?: boolean;
  /** Either player may pay and use this ability (Detente). */
  usableByAnyPlayer?: boolean;
  /** Ability usable only while the Runner has at least one tag (Rotary). */
  requireRunnerTagged?: boolean;
  /** Usable only while a run is active (Perfect Recall). */
  requiresActiveRun?: boolean;
  /**
   * Corp ability usable while this card is in the Runner score area
   * (Oracle Thinktank).
   */
  usableFromRunnerScoreArea?: boolean;
  /**
   * During encounter: host ice (`source.hostId`) must protect the same server
   * as encountered ice (Living Mural).
   */
  requireProtectingHostServer?: boolean;
  /** Require this many advancements on the source card. */
  requiresAdvancements?: number;
  /**
   * Ability usable only while Threat N is active (Angelique Garza Correa).
   */
  requiresThreat?: number;
  /**
   * Usable only if the Runner made a successful run on R&D this turn
   * (Cataloguer).
   */
  requiresSuccessfulRdRunThisTurn?: boolean;
  /**
   * Usable only if the Runner made a successful run on HQ this turn
   * (Lucky Charm).
   */
  requiresSuccessfulHqRunThisTurn?: boolean;
  /** Security Subcontract: usable only with ≥1 rezzed ice. */
  requiresRezzedIce?: boolean;
  /**
   * Usable only if the Runner made successful runs on HQ, R&D, and Archives
   * this turn (The Wizard's Chest).
   */
  requiresSuccessfulAllCentralsThisTurn?: boolean;
  /** Friend of a Friend: usable only while Runner has 0 tags. */
  requiresUntagged?: boolean;
  /**
   * Ability usable only during a run against a different server than the one
   * hosting this card (B-1001).
   */
  requireOtherServer?: boolean;
  /**
   * Ability usable only during a run against the server hosting this card
   * (Ryon Knight).
   */
  requireThisServer?: boolean;
  /**
   * Ability usable only while the Runner has exactly this many unspent clicks
   * (Ryon Knight: 0).
   */
  requireRunnerClicksEq?: number;
  /** Encounter ice must have this subtype (e.g. Abagnale bypass). */
  requireEncounterSubtype?: string;
  /**
   * Encountered ice must be this card's chosenIceId (Boomerang).
   */
  requireEncounterChosenIce?: boolean;
  /** Encountered ice must NOT have this subtype (Physarum). */
  forbidEncounterSubtype?: string;
  /** Encountered ice must be this card's host (Physarum). */
  requireEncounterHost?: boolean;
  /** Encountered ice strength must be ≤ this (Malandragem). */
  requireEncounterStrengthLte?: number;
  /**
   * Ability usable only while attacking the designated mark
   * (e.g. Backstitching trash-to-bypass).
   */
  requireAttackingMark?: boolean;
  /**
   * Usable only if at least one subroutine is already broken this encounter
   * (Poison Vial).
   */
  requireBrokenSubThisEncounter?: boolean;
  /**
   * Usable only if the Runner fully broke the encountered ice this encounter
   * (Crescentus).
   */
  requireFullyBrokenThisEncounter?: boolean;
  /** When set, this ability starts a run (server chosen via action.serverId). */
  startsRun?: StartsRunSpec;
  /** Paid ability only legal while `state.run` is active (Arissana, AirbladeX). */
  requireDuringRun?: boolean;
  forbidDuringRun?: boolean;
  /** Usable only during a run on HQ (Panic Button). */
  onlyDuringHqRun?: boolean;
  /**
   * Damage interrupt ability legal only while `pendingDamage.type` is one of
   * these (Plascrete meat; AirbladeX net). Omitting allows any damage type.
   */
  requirePendingDamageTypes?: DamageType[];
  /**
   * After resolving once for this pendingDamage open, do not re-offer this
   * source (Prāna Condenser; CR 9.12.2b).
   */
  oncePerPendingDamageInstance?: boolean;
  /** Fransofia Ward: Corp must have at least this many credits. */
  requiresCorpCreditsGte?: number;
  /**
   * Usable only if this card was installed this turn (Euler / Penrose).
   */
  requireInstalledThisTurn?: boolean;
  /**
   * Usable only if Runner has at least this many installed virtual resources
   * (Odore).
   */
  requireInstalledVirtualResourcesGte?: number;
  /**
   * Formicary-class: approach-server PAW ability usable from unrezzed ice on
   * any server (ability rez+moves to the approached server).
   */
  formicaryApproachAnyServer?: boolean;
}

export interface CardInstance {
  id: string;
  /** Definition id from card data (stable across instances). */
  defId?: string;
  title: string;
  type: CardType;
  side: Side;
  /**
   * NRDB `faction_code` (e.g. `jinteki`, `criminal`). Optional; never invented.
   * Used by Storgotic Resonator faction-match trash triggers.
   */
  faction?: string;
  /** Printed install cost in credits (programs/hardware/resources/ice). */
  installCost: number;
  /** Corp rez cost (ice/assets/upgrades). */
  rezCost?: number;
  /** Play cost for operations / events. */
  playCost?: number;
  strength?: number;
  subtypes?: string[];
  subroutines?: Subroutine[];
  breaker?: BreakerAbility;
  /** Paid abilities usable in matching PAW windows (CR 9.5). */
  paidAbilities?: PaidAbility[];
  /**
   * Continuous / on-rez effect IR (e.g. prevent jack-out).
   * Evaluated when the card is rezzed.
   */
  onRez?: Effect;
  /** Effect IR when an operation/event is played. */
  onPlay?: Effect;
  /**
   * Effect IR paid as an additional cost when playing this event/operation
   * (e.g. Running Hot: suffer 1 core damage). Evaluated after credit/click
   * costs and after the card leaves hand, before `onPlay`.
   */
  playAdditionalCost?: Effect;
  /** Effect IR when Corp scores this agenda. */
  onScore?: Effect;
  /** Greenmail-class: when Corp forfeits this scored agenda. */
  onForfeit?: Effect;
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
   * Additional clicks the Runner must spend to steal this agenda
   * (Méliès City Luxury Line).
   */
  stealAdditionalClicks?: number;
  /**
   * Additional credits the Runner must pay to steal this agenda (Bellona).
   */
  stealAdditionalCredits?: number;
  /**
   * While rezzed, Runner must pay this many credits as an additional cost to
   * steal any agenda (Magistrate Revontulet).
   */
  stealAdditionalCreditsWhileRezzed?: number;
  /**
   * While rezzed (or Persistent), Runner must pay this many credits as an
   * additional cost to steal an agenda from this server or its root (Red
   * Herrings).
   */
  stealAdditionalCreditsFromProtectingServer?: number;
  /**
   * While this lockdown is active in corp:play-area, Runner pays
   * base + perAdvancement×advancementTokens as an additional cost to steal
   * an agenda (NAPD Cordon).
   */
  stealAdditionalCreditsFormula?: { base: number; perAdvancement: number };
  /**
   * Whenever the Runner breaks a printed subroutine on this ice, they lose
   * this many credits (Gold Farmer).
   */
  runnerLoseCreditsOnBreakPrintedSubroutine?: number;
  /**
   * Reduce play cost by 1 per ice protecting this server (Tailgate: "hq").
   */
  playCostDiscountPerIceProtectingServer?: "hq" | "rd" | "archives";
  /**
   * While rezzed, the first double operation each turn costs this many clicks
   * less to play (Synchrocyclotron).
   */
  firstDoubleOperationClickDiscount?: number;
  /** Effect IR when Runner steals this agenda. */
  onSteal?: Effect;
  /** Effect IR when this ice is encountered (CR 6.5.1). */
  onEncounter?: Effect;
  /** Effect IR when the Runner passes this ice (Phoneutria). */
  onPass?: Effect;
  /** Effect IR when the Runner bypasses a piece of ice (Capybara). */
  onBypass?: Effect;
  /**
   * Jeitinho-class: while this card is in the heap, after bypassing ice,
   * may spend `clickCost` clicks to install it when Threat ≥ `requiresThreat`.
   */
  onBypassMayInstallFromHeap?: {
    requiresThreat: number;
    clickCost: number;
  };
  /**
   * Effect IR the first time each turn the Runner installs a program
   * (LilyPAD).
   */
  onFirstProgramInstallEachTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner installs a piece of
   * hardware (Masterwork v37).
   */
  onFirstHardwareInstallEachTurn?: Effect;
  /**
   * Effect IR the first time each run the Runner encounters a piece of ice
   * (Baklan Bochkin).
   */
  onFirstEncounterEachRun?: Effect;
  /**
   * Effect IR the first time each turn the Runner trashes a Corp card
   * (Solidarity Badge).
   */
  onFirstCorpCardTrashEachTurn?: Effect;
  /**
   * Corp identity: first time each turn the Runner steals or trashes a Corp
   * card (Epiphany Analytica).
   */
  onFirstRunnerStoleOrTrashedCorpCardThisTurn?: Effect;
  /**
   * Effect IR whenever the Runner trashes a card they are accessing
   * (Audrey v2). Fired at every access-trash site (no once-per-turn gate).
   */
  onAccessTrash?: Effect;
  /**
   * Effect IR the first time each turn the Corp installs a card in a
   * server root (Lago Paranoá Shelter).
   */
  onFirstCorpRootInstallEachTurn?: Effect;
  /**
   * When true, `onAccess` fires only while this card is rezzed
   * (Angelique Garza Correa).
   */
  onAccessRequiresRezzed?: boolean;
  /**
   * Effect IR when the Runner passes the ice hosting this card (Pichação).
   */
  onPassHost?: Effect;
  /**
   * Effect IR when the Runner encounters the ice hosting this card (Chisel).
   */
  onHostEncounter?: Effect;
  /**
   * Place this many hosted credits whenever any ice is rezzed
   * (Cybersand Harvester).
   */
  hostedCreditsOnAnyIceRez?: number;
  /**
   * Spend non-recurring hosted credits for these purposes
   * (Cybersand / Urban Art Vernissage).
   */
  hostedCreditsSpendFor?: Array<"install" | "trash" | "play_event">;
  /**
   * Ice Analyzer-class: when spending hosted credits for install, only these
   * card types are eligible.
   */
  hostedCreditsSpendForInstallTypes?: Array<
    "program" | "hardware" | "resource"
  >;
  /** Kati Jones: at most one paid ability on this card each turn. */
  paidAbilitiesOncePerTurn?: boolean;
  /** Open Market: hosted install credits only for resources with these subtypes. */
  hostedCreditsSpendForInstallSubtypes?: string[];
  /**
   * Paladin Poemu: hosted install credits cannot be spent on cards with these
   * subtypes (e.g. connection).
   */
  hostedCreditsSpendForInstallExcludeSubtypes?: string[];
  /** Gourmand: access → trash self to trash accessed non-agenda, then draw. */
  accessTrashSelfNonAgendaThenDraw?: boolean;
  /**
   * Effect IR paid as an additional cost when rezzing this card (Valentão).
   * Uses `pendingRezCardId` when the cost opens a choice.
   */
  rezAdditionalCost?: Effect;
  /** Effect IR when host ice is rezzed (Saci). */
  onHostRezzed?: Effect;
  /** Effect IR when host ice is derezzed (Saci). */
  onHostDerezzed?: Effect;
  /**
   * Threat N → Runner cannot spend credits while subroutines on this ice
   * are resolving (Attini).
   */
  threatCannotSpendCreditsDuringSubs?: number;
  /**
   * Effect IR when the Runner approaches the server this card protects
   * (rezzed upgrade/asset in root; Nanisivik Grid).
   */
  onApproachServer?: Effect;
  /**
   * Letheia Nisei: fire `onApproachServer` at most once per run for this
   * instance (first approach of the attacked server each run).
   */
  onApproachServerOncePerRun?: boolean;
  /**
   * Effect IR when the Runner approaches ice protecting this server
   * (rezzed upgrade in root; Mitra Aman).
   */
  onApproachIce?: Effect;
  /** Midori: fire onApproachIce at most once per run. */
  onApproachIceOncePerRun?: boolean;
  /** Corp may only install this card in a remote (ZATO City Grid). */
  remoteOnly?: boolean;
  /**
   * Persistent upgrade: abilities apply while installed even if unrezzed
   * (Tucana).
   */
  persistent?: boolean;
  /** Mahkota: +N trash cost for assets in this server's root. */
  serverRootAssetTrashCostBonus?: number;
  /** Rez only during Corp turn, not during a Runner run PAW (Front Company). */
  rezOnlyDuringCorpTurn?: boolean;
  /**
   * While rezzed: the first run the Runner makes each turn cannot target a
   * remote server (Front Company).
   */
  firstRunCannotTargetRemote?: boolean;
  /**
   * While rezzed: each ice protecting this server gains encounter ability —
   * choose 1 subroutine; may trash the ice to resolve it (ZATO).
   */
  iceGainsTrashToResolveChosenSubOnEncounter?: boolean;
  /**
   * Gantulga: during the first encounter each turn with ice protecting
   * `namedServerId`, each subroutine resolves as Do N net damage instead.
   */
  firstEncounterSubsBecomeNetDamage?: number;
  /** Trash this card when it has no hosted cards (Asmund Pudlat). */
  trashWhenNoHostedCards?: boolean;
  /**
   * Cards hosted on this card without being installed (Asmund / Matryoshka).
   * Hosted instances keep `hostId` pointing here and are not in the rig.
   */
  hostedCardIds?: string[];
  /** Deckbuilding max copies (Matryoshka). */
  deckLimit?: number;
  /** Effect IR when this card's controller's turn begins (rezzed/installed). */
  onTurnBegin?: Effect;
  /**
   * Corp identity: fires once, before the first Corp turn begins (setup
   * phase). Host callers invoke `fireOnGameStartSetup` after building the
   * initial GameState (NEXT Design: Guarding the Net).
   */
  onGameStart?: Effect;
  /** Nasir Meidan: encounter ice rezzed during approach this run. */
  onEncounterRezzedAfterApproach?: Effect;
  /** Effect IR when this card is installed. */
  onInstall?: Effect;
  /** Stoke the Embers: install from anywhere except HQ. */
  onInstallFromNonHq?: Effect;
  /** Effect IR when the Runner makes a successful run (installed/rezzed source). */
  onSuccessfulRun?: Effect;
  /** Chakana: fires only when the successful run's attacked server was R&D. */
  onSuccessfulRunOnRd?: Effect;
  /** False Echo-class: fires whenever the Runner passes any unrezzed ice. */
  onPassUnrezzedIce?: Effect;
  /** Copycat-class: fires when the Runner passes rezzed ice. */
  onPassRezzedIce?: Effect;
  /** The Cleaners: while scored, increase meat damage dealt by 1. */
  whileScoredMeatDamageIncrease?: number;
  /** Off the Grid: Runner cannot initiate runs on this upgrade's server. */
  blocksRunnerRunsOnHostServer?: boolean;
  trashSelfWhenFullyBrokenByRunner?: boolean;
  /** Off the Grid: trash when Corp makes a successful HQ run. */
  trashSelfOnCorpSuccessfulHqRun?: boolean;
  /** Scheherazade: gain 1¢ when Runner installs a program hosted here. */
  gainCreditsWhenRunnerHostsProgramOnSelf?: number;
  /**
   * Gorman Drip v1-class: fires whenever the Corp spends a click on the
   * basic gain-1-credit or draw-1-card action.
   */
  onCorpBasicClickForCreditOrDraw?: Effect;
  /**
   * When true, `onSuccessfulRun` fires at most once per turn for this instance
   * (e.g. Nyusha first successful run on the mark).
   */
  onSuccessfulRunOncePerTurn?: boolean;
  /**
   * Spinal Modem: when Corp succeeds a trace during a run, fire this Effect
   * (Runner identity / installed rig cards).
   */
  onSuccessfulTraceDuringRun?: Effect;
  /**
   * e3 Feedback Implants: after any subroutine is broken, fire this Effect
   * while installed.
   */
  onBreakSubroutine?: Effect;
  /**
   * e3 Feedback Implants: after any break, may pay `credits` to break another
   * subroutine on the encountered ice.
   */
  onBreakSubroutineMayPayCreditsBreakAnother?: { credits: number };
  /**
   * Snowball: when this breaker breaks a subroutine, +N strength for remainder
   * of the run.
   */
  strengthBonusOnBreakSubForRun?: number;
  /**
   * Encryption Protocol: while rezzed, +N to trash cost of all installed cards.
   */
  installedCardsTrashCostBonus?: number;
  /**
   * Amazon Industrial Zone: after Corp installs ice protecting this server,
   * may immediately rez it lowering rez cost by this amount.
   */
  mayImmediatelyRezIceOnInstallProtectingThisServerDiscount?: number;
  /** Effect IR when this card is accessed (ambushes). */
  onAccess?: Effect;
  /** Effect IR when this Corp card is trashed to Archives (Mavirus). */
  onTrash?: Effect;
  /**
   * Director Haas: while trashed and being accessed by the Runner, fire
   * instead of the normal move-to-Archives (add_to_runner_score_as_agenda).
   */
  onTrashWhileAccessed?: Effect;
  /**
   * Identity: when a rezzed Corp card is trashed (not during install),
   * once per turn (Ob Superheavy).
   */
  onRezzedCardTrashed?: Effect;
  /**
   * Effect IR when this Runner card is trashed from grip or stack
   * (Steelskin Scarring — may draw 2).
   */
  onTrashFromGripOrStack?: Effect;
  /**
   * Hardcoded prevention while this card is rezzed during a run.
   * Prefer onRez prevent IR; kept for back-compat with Lockdown tests.
   */
  prevention?: {
    jackOutForRun?: boolean;
  };
  /** Effect IR the first time the Runner receives a tag each turn (identities). */
  onFirstTagThisTurn?: Effect;
  /**
   * Jesminder-class: the first time each turn you would take a tag, prevent
   * 1 tag. Also makes nested costs that require taking that tag unpayable
   * (CR 1.16.1b).
   */
  preventFirstTagThisTurn?: boolean;
  /** Runner identity: taking tags while previously untagged (Sebastião). */
  onTakeTagsWhenUntagged?: Effect;
  /** Sebastião: Corp basic trash of connection also costs trash 1 from HQ. */
  connectionBasicTrashAdditionalCostTrashHq?: boolean;
  /** Cloud Eater: when encounter ends if rezzed this turn. */
  onEncounterEndIfRezzedThisTurn?: Effect;
  /** Knowledge Seeker: whenever an encounter with this ice ends. */
  onEncounterEnd?: Effect;
  /**
   * Hype Machine: rez cost reduced by this amount if an agenda was scored or
   * stolen this turn.
   */
  rezCostDiscountIfAgendaScoredOrStolenThisTurn?: number;
  /** Tungsten Tailor: each ice gets −N strength while this is installed. */
  allIceStrengthPenalty?: number;
  /**
   * NEXT Activation Command: each ice gets +N strength while this lockdown
   * is active in corp:play-area (inverse of allIceStrengthPenalty).
   */
  allIceStrengthBonus?: number;
  /**
   * NEXT Activation Command: while active, Runner cannot break subroutines
   * using cards that lack the icebreaker subtype.
   */
  cannotBreakExceptIcebreaker?: boolean;
  /**
   * Tungsten Tailor: first break each turn on ice with strength ≤ this value
   * gains 1¢ (typically 0).
   */
  gainCreditOnBreakIceStrengthLteOncePerTurn?: number;
  /** Nuvem: after operation or expendable action. */
  onAfterOperationOrExpendable?: Effect;
  /** Nuvem: gain N¢ first R&D trash each Corp turn. */
  creditsOnFirstRdTrashThisTurn?: number;
  /** Sisyphus: first pass of rezzed code gate/sentry each turn. */
  onFirstPassRezzedCodeGateOrSentryThisTurn?: Effect;
  /**
   * Effect IR the first time the Runner suffers core damage each turn
   * (Runner identities; CR §10.4.2b).
   */
  onFirstCoreDamageThisTurn?: Effect;
  /** Exile: whenever the Runner installs a program from the heap, draw 1. */
  onInstallProgramFromHeap?: Effect;
  /**
   * Sentinel Defense Program: continuous while scored — whenever the Runner
   * suffers core damage, fire this effect (CR §10.4.2b).
   */
  onSufferCoreDamage?: Effect;
  /**
   * Bioroid Efficiency Research: condition counter hosted on ice — fires
   * once when the host ice becomes fully broken during an encounter.
   */
  onHostFullyBrokenThisEncounter?: Effect;
  /**
   * Effect IR the first time the Runner begins a run on R&D each turn
   * (Runner identities; e.g. Padma may charge).
   */
  onFirstRdRunBeginThisTurn?: Effect;
  /**
   * First Archives run begin each turn (rezzed asset/upgrade in server root;
   * e.g. Front Company net damage if host unprotected).
   */
  onFirstArchivesRunBeginThisTurn?: Effect;
  /** First run begin each turn (scored agenda; Stegodon MK IV). */
  onFirstRunBeginThisTurn?: Effect;
  /** Barry Wong: whenever Corp rezzes ice. */
  onAnyIceRez?: Effect;
  /** Corp identity: maximum remote servers (A Teia). */
  maxRemoteServers?: number;
  /** Corp identity: first remote install each turn (A Teia). */
  onFirstRemoteInstallThisTurn?: Effect;
  /**
   * While in score area: −N breaker strength if ice derezzed this run
   * (Stegodon MK IV).
   */
  whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun?: number;
  /**
   * Effect IR the first time the Runner installs a virus program each turn
   * (installed continuous, e.g. Avgustina → sabotage).
   */
  onFirstVirusInstallThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run on
   * their mark (installed continuous / identity; e.g. Virtuoso HQ bonus).
   */
  onFirstSuccessfulMarkRunThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run on HQ
   * (installed continuous; e.g. PAN-Weave Corp loses 1¢ / Runner gains 1¢).
   */
  onFirstSuccessfulHqRunThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run on a
   * central server (HQ / R&D / Archives; installed continuous; e.g. Zenit Chip).
   */
  onFirstSuccessfulCentralRunThisTurn?: Effect;
  /**
   * Effect IR the first time each turn the Runner makes a successful run
   * (any server; e.g. Pravdivost may place 1 advancement).
   */
  onFirstSuccessfulRunThisTurn?: Effect;
  /** Paige Piper: first install each turn. */
  onFirstInstallEachTurn?: Effect;
  /** Adjusted Chronotype: first click-loss except paid ability cost. */
  onFirstClickLossEachTurnExceptPaidAbility?: Effect;
  /** Gene Conditioning Shoppe. */
  geneticsAlsoTriggerSecondTime?: boolean;
  /** Synthetic Blood: first damage each turn. */
  onFirstDamageEachTurn?: Effect;
  /** Traffic Jam current: +N adv req per copy in Corp score. */
  agendaAdvancementRequirementBonusPerCopyInCorpScore?: number;
  /** Symmetrical Visage: first basic click-draw. */
  onFirstBasicClickDrawEachTurn?: Effect;
  /** Brain-Taping Warehouse. */
  bioroidIceRezCostReductionPerRunnerClickRemaining?: number;
  /** Jinteki Biotech faces. */
  chooseIdentityFaceBeforeFirstTurn?: boolean;
  identityFaceOptions?: Array<{ id: string; label: string; onFlip: Effect }>;
  chosenIdentityFaceId?: string;
  /** Valley Grid: fully break protecting ice. */
  onFullyBreakProtectingIce?: Effect;
  /** Hacktivist Meeting. */
  rezNonIceAdditionalCostRandomTrashHq?: boolean;
  /** Off-Campus Apartment. */
  hostsConnectionResources?: boolean;
  drawOnHostConnectionInstall?: number;
  /** Comet. */
  onFirstEventEachTurnMayPlayAnother?: boolean;
  /** London Library. */
  trashHostedProgramsOnTurnEnd?: boolean;
  /** Recruiting Trip. */
  playCostX?: boolean;
  /** Blacklist. */
  cardsCannotLeaveRunnerHeap?: boolean;
  /** Student Loans. */
  eventPlayExtraCostIfCopyInHeap?: number;
  /** Breaker Bay Grid. */
  rootRezCostReductionThisServer?: number;
  /** Oaktown Grid: trash cost of each card in the root +N. */
  rootTrashCostIncreaseThisServer?: number;
  /** Chrome Parlor: prevent cybernetic install damage. */
  preventCyberneticInstallDamage?: boolean;
  /** Titanium Ribs: Runner chooses grip cards for damage. */
  runnerChoosesDamageTrashFromGrip?: boolean;
  /** Armand Geist: draw N when using a [trash] ability. */
  drawOnUseTrashAbility?: number;
  /** Muertos: effect when uninstalled. */
  onUninstall?: Effect;
  /** Defective Brainchips: first core damage each turn +N. */
  increaseFirstCoreDamagePerTurn?: number;
  /** Underway Renovation: mill Runner stack on advance. */
  trashTopOfStackOnAdvance?: {
    default: number;
    atOrAbove?: number;
    bonus?: number;
  };
  /** Underway Grid. */
  iceCannotBeBypassedThisServer?: boolean;
  cardsCannotBeExposedThisServer?: boolean;
  /** Drug Dealer. */
  onCorpTurnBegin?: Effect;
  /** Film Critic. */
  hostAgendaCapacity?: number;
  mayHostAccessedAgenda?: boolean;
  /** Paparazzi. */
  countsAsTagged?: boolean;
  preventAllMeatDamage?: boolean;
  /** Ronald Five. */
  runnerLosesClickWhenTrashesCorpCard?: boolean;
  /** Haarpsichord Studios. */
  cannotStealMoreThanOneAgendaPerTurn?: boolean;
  /** Old Hollywood Grid. */
  cannotStealUnlessCopyInRunnerScore?: boolean;
  /** Hollywood Renovation. */
  placeAdvancementOnAnotherOnAdvance?: {
    default: number;
    atOrAbove?: number;
    bonus?: number;
  };
  /** Casting Call condition counter. */
  castingCallCondition?: boolean;
  /** Agenda: tags given when accessed (Casting Call). */
  onAccessGiveTags?: number;
  /** Wireless Net Pavilion. */
  basicTrashResourceAdditionalCostCredits?: number;
  /** Chronos Protocol. */
  corpChoosesFirstNetDamageCardEachTurn?: boolean;
  /** Ancestral Imager. */
  netDamageOnJackOut?: number;
  /** Genetics Pavilion. */
  runnerCannotDrawMoreThanPerTurn?: number;
  /** Franchise City. */
  mustRevealAgendasAccessedFromRd?: boolean;
  addSelfToCorpScoreOnAgendaAccess?: { agendaPoints: number };
  /** Worlds Plaza. */
  hostAssetsOnly?: boolean;
  /** Tour Guide. */
  etrSubroutinesPerRezzedAsset?: boolean;
  /** SYNC front: +N¢ to basic remove-tag while unflipped. */
  basicRemoveTagAdditionalCostCreditsWhileUnflipped?: number;
  /** SYNC back: −N¢ to basic trash-resource while flipped. */
  basicTrashResourceCreditReductionWhileFlipped?: number;
  /** Improved Tracers: +N to subroutine base trace strength. */
  subroutineTraceBaseStrengthBonus?: number;
  /** Rebranding Team: assets gain this subtype. */
  assetsGainSubtype?: string;
  /** Quantum Predictive Model: score on access if Runner tagged. */
  addToCorpScoreOnAccessIfRunnerTagged?: boolean;
  /** Victoria Jenkins: Runner allotted clicks delta while rezzed. */
  runnerAllottedClicksBonus?: number;
  /** News Hound: gains ETR sub while a current is active. */
  gainsEtrSubroutineWhileCurrentActive?: boolean;
  /** Resistor: +N strength per Runner tag. */
  strengthBonusPerRunnerTag?: number;
  /** 24/7 News Cycle: forfeit agenda to play. */
  playAdditionalCostForfeitAgenda?: boolean;
  /** Surveillance Sweep: Runner spends first on traces during runs. */
  runnerSpendsFirstForTracesDuringRun?: boolean;
  /** Rutherford Grid: +N base trace during run on this server. */
  traceBaseStrengthBonusDuringRunOnThisServer?: number;
  /** Apex: cannot install non-virtual resources. */
  cannotInstallNonVirtualResources?: boolean;
  /** Harbinger: facedown instead of heap when trashed. */
  turnFacedownInsteadOfHeapWhenTrashed?: boolean;
  /** Wasteland: gain N on first own installed trash each turn. */
  gainCreditsOnFirstOwnInstalledTrashEachTurn?: number;
  /** Adam: start with N directive cards installed. */
  startWithDirectiveCards?: number;
  /** Brain Chip: MU bonus equals agenda points. */
  muEqualsAgendaPoints?: boolean;
  /** Brain Chip: hand size bonus equals agenda points. */
  handSizeEqualsAgendaPoints?: boolean;
  /** Always Be Running: first click must be run or run event. */
  firstClickMustBeRunOrRunEvent?: boolean;
  /** Neutralize All Threats: must trash first trash-cost access. */
  mustTrashFirstAccessedCardWithTrashCostEachTurn?: boolean;
  /** Safety First: draw N at turn end if grip < max hand. */
  drawAtTurnEndIfGripBelowMaxHandSize?: number;
  /** Globalsec: install requires link ≥ N. */
  installRequiresLinkGte?: number;
  /** Jak Sinclair: −N install cost per link. */
  installCostReductionPerLink?: number;
  /** Employee Strike: blank Corp identity printed abilities. */
  blankCorpIdentityPrintedAbilities?: boolean;
  /** Technical Writer: place N credits on HW/program install. */
  hostedCreditsOnProgramOrHardwareInstall?: number;
  runnerChoosesUnbrokenSubroutineOrder?: boolean;
  breakOnAtMostOneIcePerRun?: boolean;
  onFinishAccessRdOncePerTurn?: Effect;
  onEncounterAnyIceOncePerTurn?: Effect;
  zeroInfluenceIfNonAllianceFactionCardsGte?: { faction: string; threshold: number };
  onPassIceProtectingThisServerMaySwap?: boolean;
  zeroInfluenceIfIceInDeckLte?: number;
  zeroInfluenceIfCardsInDeckGte?: number;
  chooseServerOnInstall?: boolean;
  additionalCreditCostToInstallInChosenServer?: number;
  gainCreditOnTrashAbilityUse?: boolean;
  daemonHostMaxMuFromInstalledCopiesOfSelf?: boolean;
  hostedProgramMemoryDoesNotCount?: boolean;
  corpAdditionalBadPublicity?: number;
  corpAdditionalBadPublicityCannotBeRemoved?: boolean;
  playRequiresInstalledSubtype?: string;
  placePowerCounterOnAnyCardRez?: boolean;
  gainCreditOnFirstRunnerDrawEachTurn?: boolean;
  onAdvance?: Effect;
  zeroInfluenceIfCardCopiesGte?: { cardId: string; threshold: number };
  /** Nero Severn */
  mayJackOutOnEncounterSentryOncePerTurn?: boolean;
  /** Reflection */
  revealRandomHqOnJackOut?: boolean;
  /** Political Operative */
  installRequiresSuccessfulHqRunThisTurn?: boolean;
  /** Akshara Sareen */
  corpAllottedClicksBonusWhileInstalled?: number;
  /** Councilman */
  onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez?: boolean;
  /** Political Dealings */
  onDrawAgendaMayRevealAndInstall?: boolean;
  /** Bailiff */
  gainCreditWheneverRunnerBreaksSubroutine?: boolean;
  /** Surat City Grid */
  onRezOtherCardInRootOrProtectingMayRezDiscount?: number;
  /** Political Graffiti condition */
  hostAgendaPointsModifier?: number;
  /** Salsette Slums */
  accessPayTrashCostRemoveFromGameOncePerTurn?: boolean;
  /** Brahman */
  addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke?: boolean;
  /** Patron: draw N instead of breach on first successful run on named server */
  patronChooseServerDrawInsteadOfBreach?: number;
  /** Bazaar */
  onInstallHardwareFromGripMayInstallAnotherCopy?: boolean;
  /** Personality Profiles */
  onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip?: boolean;
  /** Jeeves Model Bioroids */
  gainClickFirstTimeSpendClicksGteOnSameActionEachTurn?: number;
  /** Raman Rai */
  onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn?: boolean;
  /** Aryabhata Tech */
  onAnySuccessfulTraceGainAndRunnerLose?: { gain: number; lose: number };
  /** Indian Union Stock Exchange */
  onRezOrPlayOutOfFactionGainCredits?: number;
  /** Mumbad Virtual Tour */
  zeroInfluenceIfAssetsInDeckGte?: number;
  mustTrashWhenAccessedWhileInstalled?: boolean;
  /** Out of the Ashes */
  heapOnTurnBeginMayRfgSelfToMakeRun?: boolean;
  /** Guru Davinder: pay N or trash when preventing net/meat */
  autoPreventNetOrMeatDamagePayOrTrash?: number;
  /** The Turning Wheel */
  placePowerOnHqOrRdRunEndIfNoAgendaStolen?: boolean;
  /** Brainstorm */
  gainsSubroutinesOnEncounterEqualGripSize?: {
    id: string;
    text: string;
    effect: import("../effects/ir.js").Effect;
  };
  /** Dedicated Neural Net */
  firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess?: boolean;
  /** Puppet Master */
  onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced?: boolean;

  /**
   * Effect IR the first time each turn a run is declared unsuccessful
   * (e.g. John Masanori take 1 tag).
   */
  onFirstUnsuccessfulRunThisTurn?: Effect;
  /**
   * Spark Agency: the first time each turn Corp rezzes an advertisement,
   * the Runner loses this many credits (Corp identity).
   */
  loseCreditsOnFirstAdvertisementRezThisTurn?: number;

  /** Aniccam: first event trashed each turn. */
  onFirstEventTrashedThisTurn?: Effect;
  /** Cybertrooper: +N strength this turn when a non-AI icebreaker is installed. */
  nonAiIcebreakerInstallStrengthBonusThisTurn?: number;
  /** Tranquility Home Grid: first install in this server's root each turn. */
  onFirstInstallInThisServerRootThisTurn?: Effect;
  /** Winchester: extra printed subs while protecting HQ. */
  gainsSubroutinesWhileProtectingHq?: Subroutine[];
  /**
   * Blockchain: gains N copies of `subroutine` before printed subs, where
   * N = floor(faceup Archives cards matching type+subtype / per).
   */
  gainsSubroutinesBeforePrintedPerFaceupArchives?: {
    subtype: string;
    type: CardType;
    per: number;
    subroutine: Subroutine;
  };
  /**
   * Acme Consulting: Runner is considered to have this many additional tags
   * during encounters with outermost ice (even at 0 physical tags).
   */
  additionalTagsDuringOutermostIceEncounter?: number;

  /**
   * Effect IR whenever the Runner installs a program or piece of hardware
   * (installed continuous; e.g. Environmental Testing place 1 power counter).
   * Does not fire for resource installs or on the newly installed card itself.
   */
  onProgramOrHardwareInstall?: Effect;
  /** Hiram: whenever Runner installs or trashes hardware. */
  onHardwareInstallOrTrash?: Effect;
  /** Replicator: whenever Runner installs any hardware (including self). */
  onHardwareInstall?: Effect;
  /** Central-only install destinations (Red Room / Flagship). */
  installServers?: Array<"hq" | "rd" | "archives">;
  /**
   * Static-condition ability: when this card's hosted power counters reach
   * `amount` or more, evaluate `effect` (e.g. Environmental Testing trash + gain).
   * Checked after power counters increase (add_power_counter / charge).
   */
  onPowerCountersGte?: { amount: number; effect: Effect };
  /**
   * When hosted credits ≥ amount, evaluate effect (Side Hustle take/trash/draw).
   */
  onHostedCreditsGte?: { amount: number; effect: Effect };
  /** Effect IR when Corp scores any agenda (identity or installed continuous). */
  onAgendaScored?: Effect;
  /** Effect IR when any agenda is scored or stolen (installed continuous). */
  onAgendaScoredOrStolen?: Effect;
  /** Corp identity: whenever the Runner steals an agenda (Thule Subsea). */
  onAgendaStolen?: Effect;
  /**
   * Scored Corp agenda: whenever the Runner steals another agenda
   * (Divested Trust).
   */
  onOtherAgendaStolen?: Effect;
  /**
   * First time each turn this program fully breaks a piece of ice (Orca, Abaasy).
   */
  onFullyBreakOncePerTurn?: Effect;
  /**
   * Effect IR whenever this card fully breaks a piece of ice (Curupira).
   * Unbounded — fires on every full break, unlike onFullyBreakOncePerTurn.
   */
  onFullyBreak?: Effect;
  /** Place this many hosted credits whenever the Runner plays a run event (Debbie). */
  hostedCreditsOnRunEventPlay?: number;
  /**
   * First time each turn the Runner plays an event, place this many hosted
   * credits (Touchstone).
   */
  hostedCreditsOnFirstEventPlayOncePerTurn?: number;
  /** Hosted credits may be spent during runs (Touchstone). */
  spendHostedCreditsDuringRuns?: boolean;
  /**
   * Trickster Taka: hosted credits may be spent to use programs during runs.
   */
  spendHostedCreditsToUseProgramsDuringRuns?: boolean;
  /**
   * Stick and Poke: first encounter each turn, ice gains this subroutine
   * before printed ones for the remainder of that encounter.
   */
  firstEncounterGainsSubroutine?: { text: string; effect: Effect };
  /** Rotary: on HQ/R&D breach, may take 1 tag to access this many more. */
  mayTakeTagForBonusAccessOnHqRdBreach?: number;
  /**
   * Sipa: once per turn when passing outermost ice after fully breaking it,
   * may swap that ice with another installed ice.
   */
  maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn?: boolean;
  /** First advance each turn: gain this many credits (Sacrifice Zone). */
  creditsOnFirstAdvanceThisTurn?: number;
  /**
   * Once per turn when Runner succeeds on another server, evaluate effect
   * (Sacrifice Zone Expansion).
   */
  onSuccessfulRunOtherServerOncePerTurn?: Effect;
  /**
   * Once per turn when a successful run ends, evaluate this effect
   * (Doppelgänger may_start_run any server).
   */
  onSuccessfulRunEndOncePerTurn?: Effect;
  /**
   * Whenever a successful run ends, evaluate this effect while rezzed
   * (Dedicated Response Team).
   */
  onSuccessfulRunEnd?: Effect;
  /**
   * Once per turn when Runner spends outside their credit pool during a run
   * against this server (Shackleton Grid).
   */
  onSpendCreditsOutsidePoolDuringRunOncePerTurn?: Effect;
  /**
   * Once per turn when breaching HQ/R&D with no breaks this run, may access
   * this many additional cards (Mercury).
   */
  onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess?: number;
  /**
   * Pretty Mary: when breaching R&D, if already allowed to access ≥ `min`
   * R&D cards this breach, may access `amount` additional.
   */
  onBreachRdIfAccessGteMayBonusAccess?: { min: number; amount: number };
  /** Valentina: effect when 1+ tags are removed while installed. */
  onRemoveTags?: Effect;
  /**
   * Thunder Art Gallery: effect the first time each turn a tag is avoided or
   * removed while this card is installed.
   */
  onFirstAvoidOrRemoveTagThisTurn?: Effect;
  /** Arella Salvatore: whenever an agenda is scored from this server. */
  onAgendaScoredFromThisServer?: Effect;
  /** Psych Mike: first successful R&D run end each turn. */
  onFirstSuccessfulRunOnRdEndsThisTurn?: Effect;
  /** District 99: first program or hardware trash each turn. */
  onFirstProgramOrHardwareTrashEachTurn?: Effect;
  /** Mâché: first access trash each turn. */
  onFirstAccessTrashEachTurn?: Effect;
  /**
   * Algernon: trash at Runner turn end unless a successful run was made this
   * turn (set when the turn-begin click-gain is taken).
   */
  trashAtTurnEndUnlessSuccessfulRun?: boolean;
  /** Amanuensis: effect at the end of the Runner's turn. */
  onRunnerTurnEnd?: Effect;
  /** City Surveillance: when the Runner's turn begins. */
  onRunnerTurnBegin?: Effect;
  /** Raymond Flint: whenever the Corp takes bad publicity. */
  onEachCorpBadPublicityTake?: Effect;
  /** Activist Support: at Corp turn begin if Runner has 0 tags. */
  onCorpTurnBeginIfRunnerUntagged?: Effect;
  /** Activist Support: at Runner turn begin if Corp has 0 bad publicity. */
  onTurnBeginIfCorpNoBadPublicity?: Effect;
  /** Starlight Crusade Funding: ignore additional cost on first double event each turn. */
  ignoreAdditionalCostFirstDoubleEventEachTurn?: boolean;
  /** Curtain Wall: +N strength while outermost on server. */
  strengthBonusIfOutermostOnServer?: number;
  /** Rex Campaign: fire when power counters reach 0. */
  onPowerCountersEmpty?: Effect;
  /**
   * Mystic Maemi / Paladin Poemu: effect whenever the Runner steals an agenda
   * while this card is installed.
   */
  onStealAgenda?: Effect;
  /**
   * Juli Moreira Lee: first time each turn a paid ability on an installed
   * resource resolves, evaluate this effect (sourced on this card).
   */
  onFirstResourcePaidAbilityEachTurn?: Effect;
  /** Working Prototype: place this many power whenever any card is rezzed. */
  powerCounterOnAnyCardRez?: number;
  /** Alix T4LB07: place this many power whenever the Corp installs any card. */
  powerCounterOnAnyCorpInstall?: number;
  /** Spree: power counters placed when the event is played. */
  powerCountersOnPlay?: number;
  /**
   * Gain this many credits the first time each turn a run on your mark ends
   * if you breached (Info Bounty).
   */
  gainCreditsOnFirstMarkRunEndIfBreached?: number;
  /**
   * Do this much meat damage the first time each turn an installed Corp card
   * is trashed (Hostile Architecture). Requires the asset rezzed.
   */
  meatDamageOnInstalledCorpTrashOncePerTurn?: number;
  /**
   * When breaching R&D, may remove up to `max` hosted power counters for that
   * many bonus accesses (Wake Implant).
   */
  maySpendPowerCountersForBonusRdAccess?: { max: number };
  /**
   * Place 1 power when scoring an agenda not installed or advanced this turn
   * (Issuaq Adaptics).
   */
  powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn?: boolean;
  /** Reduce agenda points to win by this × hosted power counters (Issuaq). */
  agendaPointsToWinReductionPerPowerCounter?: number;
  /**
   * Gain this many credits when a card is trashed from this server's root or
   * ice, except during install (Yakov).
   */
  creditsOnTrashFromThisServer?: number;
  /** Agenda points when scored/stolen. */
  agendaPoints?: number;
  /** Advancement requirement to score. */
  advancementRequirement?: number;
  /**
   * When true, advancement requirement equals the number of cards in the
   * Runner's grip (Blood in the Water).
   */
  advancementRequirementEqualsRunnerGrip?: boolean;
  /**
   * Reduce this agenda's advancement requirement by `per` × Runner tags
   * (Freedom of Information).
   */
  advancementRequirementReductionPerTag?: number;
  /**
   * Reduce this agenda's advancement requirement by `per` × core damage
   * taken this game (`runner.brainDamage`; Ontological Dependence).
   */
  advancementRequirementReductionPerCoreDamageThisGame?: number;
  /**
   * Reduce this agenda's advancement requirement by `per` × Corp bad
   * publicity, counting at most `max` BP (Regulatory Capture).
   */
  advancementRequirementReductionPerBadPublicity?: {
    per: number;
    max?: number;
  };
  /** NAPD Contract: increase requirement by N per Corp bad publicity. */
  advancementRequirementIncreasePerCorpBadPublicity?: number;
  /** Current advancement counters. */
  advancementTokens?: number;
  /** Printed trash cost (assets/upgrades). */
  trashCost?: number;
  /** Max recurring credits on this card. */
  recurringCreditsMax?: number;
  /**
   * Net Police: when refilled/rezzed, set recurringCreditsMax to the Runner's
   * current link.
   */
  recurringCreditsMaxEqualsRunnerLink?: boolean;
  /**
   * Pheromones: when refilled / virus changes, set recurringCreditsMax to
   * virus counters on this card.
   */
  recurringCreditsMaxEqualsVirusCounters?: boolean;
  /** Andromeda: starting hand size (default 5 when unset). */
  startingHandSize?: number;
  /** Current recurring credit pool. */
  recurringCredits?: number;
  /** Hosted credit pool (e.g. Armitage). Not refilled. */
  hostedCredits?: number;
  /** Credits placed on this card when installed. */
  hostedCreditsOnInstall?: number;
  /** Hosted virus counters. */
  virusCounters?: number;
  /** +strength while protecting a remote (Palisade). */
  strengthBonusProtectingRemote?: number;
  /** +strength while protecting Archives (Bathynomus). */
  strengthBonusProtectingArchives?: number;
  strengthBonusProtectingRd?: number;
  strengthBonusProtectingHq?: number;
  /** Capacitor: +N strength while the Runner is tagged. */
  strengthBonusWhileTagged?: number;
  /** Hammer: breakers with this subtype ignore printed-sub break limits. */
  maxPrintedSubsBreakExceptSubtype?: string;
  /** Boi-tatá: paid ability credit discount after own installed trash this turn. */
  paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn?: number;
  /** Sorocaban Blade: max installed Runner trashes per encounter from this ice. */
  maxInstalledRunnerTrashesPerEncounter?: number;
  /** +strength while advancementTokens >= threshold (Pharos). */
  strengthBonusAtAdvancements?: { threshold: number; bonus: number };
  /** Akhet: while ≥threshold advancements, max printed breaks per encounter. */
  maxPrintedSubsBreakablePerEncounterAtAdvancements?: { threshold: number; max: number };
  /** Hand-size modifier applied while installed / scored. */
  handSizeBonus?: number;
  /**
   * +N maximum hand size per hosted power counter (Hippocampic Mechanocytes).
   */
  handSizePerPowerCounter?: number;
  /**
   * While rezzed: Runner max hand size −N per hosted power counter
   * (Dr. Vientiane Keeling).
   */
  runnerHandSizePenaltyPerPowerCounter?: number;
  runnerHandSizeBonus?: number;
  agendaPointsToWinModifierBoth?: number;
  advancementRequirementReductionPerSameTitleAnywhere?: number;
  cannotBeBypassed?: boolean;
  corpPlayCostIncreaseForRunnerEventsOps?: number;
  trashSelfWhenInstalledProgramTrashed?: boolean;
  powerCountersOnInstallFromUnusedMu?: boolean;
  recurringSpendForPlayEventSubtypes?: string[];
  /**
   * Corp identity: Corp max hand size equals current credit pool, recomputed
   * before the discard step (Cerebral Imaging: Infinite Frontiers).
   */
  handSizeEqualsCredits?: boolean;
  /** Allotted-click modifier each of controller's turns while installed (Basilar). */
  allottedClicksBonus?: number;
  /**
   * Aura: grant +amount strength to other installed icebreakers
   * (K2CP Turbine; optional excludeSubtype e.g. "ai").
   */
  giveStrengthToInstalledIcebreakers?: {
    amount: number;
    excludeSubtype?: string;
  };
  /** GAMEDRAGON Pro: +strength to the icebreaker this hardware is hosted on. */
  hostIcebreakerStrengthBonus?: number;
  /** While hosted on an icebreaker, that breaker's pumps last for the run. */
  extendsHostBreakerPumpToRun?: boolean;
  /** Bling: play/install hosted cards as if they were in the grip. */
  hostedCardsPlayableAsGrip?: boolean;
  /** Bling: Effect IR when the Runner installs a card without spending credits. */
  onInstallWithoutSpendingCredits?: Effect;
  /** Au Co: place 1 power whenever Corp deals damage or trashes ≥1 from HQ. */
  powerCounterOnDamageOrTrashFromHq?: boolean;
  /** Bangun: Corp may install agendas faceup (abilities inactive). */
  mayInstallAgendasFaceup?: boolean;
  /** Bangun: Effect IR when Runner accesses a faceup installed agenda. */
  onAccessFaceupInstalledAgenda?: Effect;
  /** Bangun: agenda installed faceup; abilities inactive until scored. */
  faceupInstalledInactive?: boolean;
  /** When uninstalled from the rig, RFG instead of heap (Nanuq). */
  rfgOnUninstall?: boolean;
  /** Memory units this program uses (default 1 for programs). */
  memoryCost?: number;
  /**
   * Key Master cloud: effective MU is 0 while Runner link ≥ this value
   * (printed link from identity + installed link sources).
   */
  memoryCostZeroIfLinkGte?: number;
  /** Bonus to Runner memory limit while installed (consoles / chips). */
  muBonus?: number;
  /** Deep Red: MU counts only toward Caïssa programs. */
  muBonusOnlyForCaissaPrograms?: boolean;
  triggerCaissaClickAbilityOnCaissaInstall?: boolean;
  /**
   * Demolisher: while installed, lower trash cost of each Corp card by N
   * (floored at 0).
   */
  corpCardTrashCostReduction?: number;
  /**
   * Keiko: gain this many credits the first time each turn the Runner
   * installs a companion or spends credits from an installed companion.
   */
  gainCreditsOnFirstCompanionInstallOrSpendThisTurn?: number;
  /**
   * Týr: when Runner spends a click to break a sub on this bioroid, Corp
   * gets +1 allotted click for their next turn.
   */
  bioroidBreakGivesCorpAllottedClickNextTurn?: boolean;
  /**
   * Bioroid 2.0-class: [click] × N breaks up to N subroutines on this ice
   * in one paid ability (Heimdall/Ichi/Viktor 2.0).
   */
  bioroidBreakMaxSubs?: number;
  /**
   * Mu Safecracker: spend credits only from stealth cards to use this
   * hardware (paid abilities / credit costs).
   */
  paidAbilitiesUseStealthCreditsOnly?: boolean;
  /** Mu Safecracker: on successful HQ run, may pay for bonus access. */
  onSuccessfulHqRunMayPayForBonusAccess?: {
    credits: number;
    bonusAccess: number;
  };
  /** Mu Safecracker: on successful R&D run, may pay for bonus access. */
  onSuccessfulRdRunMayPayForBonusAccess?: {
    credits: number;
    bonusAccess: number;
  };
  /** +strength per installed icebreaker (Echelon); ice may use negative (Hagen). */
  strengthBonusPerIcebreaker?: number;
  /** Rising Tide: +strength per heap card of subtype. */
  strengthBonusPerHeapSubtype?: { subtype: string; bonus: number };
  /** Principia: −install cost per currently installed icebreaker. */
  installCostDiscountPerInstalledIcebreaker?: number;
  /**
   * +strength per core damage the Runner has taken this game (Begemot).
   * Uses the permanent core-damage counter (`runner.brainDamage`, CR §10.4.2b).
   */
  strengthBonusPerCoreDamageThisGame?: number;
  /** Threat N → strength delta while threat is active (Shibboleth −2). */
  threatStrengthBonus?: { level: number; amount: number };
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
  /** Experiential Data-class: rezzed upgrade gives +N strength to ice protecting its server. */
  iceProtectingThisServerStrengthBonus?: number;
  /** Parasite-class: auto-trash host ice when its effective strength ≤ this. */
  trashHostWhenStrengthLte?: number;
  /** Noise/Grimoire-class: effect whenever a virus program is installed (every time). */
  onVirusProgramInstall?: Effect;
  /** Place 1 virus counter on the virus program that just installed (Grimoire). */
  placeVirusCounterOnInstalledVirusProgram?: boolean;
  /** HB ETF-class: Corp identity effect the first time each turn Corp installs any card. */
  onFirstCorpCardInstallEachTurn?: Effect;
  /** Aggressive Negotiation-class: play only if Corp scored an agenda this turn. */
  playRequiresScoredAgendaThisTurn?: boolean;

  /**
   * Saisentan: during encounter, after choose_card_type_for_encounter, whenever
   * net damage from a subroutine on this ice trashes a card of the chosen type,
   * do 1 net damage.
   */
  amplifyNetDamageOnTrashChosenEncounterType?: boolean;
  /** When hosted credits empty and card trashes, draw this many (Nico). */
  drawOnHostedEmpty?: number;
  /** Otto Campaign: gain clicks when hosted credits empty-trash. */
  clicksOnHostedEmpty?: number;
  /** Play restriction: Runner must be tagged. */
  /** When Corp scores an agenda from this server root, do N core damage. */
  coreDamageOnAgendaScoredFromThisServer?: number;
  /**
   * Static ability: while accessing this card in R&D, the Runner must reveal it
   * (Nightmare Archive; CR §1.21.7).
   */
  mustRevealWhenAccessedFromRd?: boolean;
  /** When true, onAccess does not fire if accessed from Archives. */
  skipOnAccessFromArchives?: boolean;
  playRequiresTagged?: boolean;
  /** Too Big to Fail: play only if the playing side has fewer than N credits. */
  playRequiresCreditsLt?: number;
  /** Office Supplies: reduce this event's play cost by Runner link. */
  playCostReducedByLink?: boolean;
  /** Under the Bus: play only if Runner accessed a card last turn. */
  playRequiresRunnerAccessedCardLastTurn?: boolean;
  /** Game Changer: RFG instead of trashing after play. */
  rfgInsteadOfTrashing?: boolean;
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
   * Stronger Together: while this card is active, ice with subtype gets +bonus
   * strength.
   */
  iceStrengthBonusForSubtype?: { subtype: string; bonus: number };
  /**
   * Play only if the Runner did not make a successful HQ run last turn
   * (Digital Rights Management).
   */
  playRequiresNoSuccessfulHqRunLastTurn?: boolean;
  /**
   * Buffer Drive: first grip/stack trash batch each turn while installed.
   */
  onFirstGripOrStackTrashBatchEachTurn?: Effect;
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
  /** Trash this card when the run ends if it broke a sub this run (Mayfly). */
  trashAfterBreakingThisRun?: boolean;
  /** Gain this many credits when any agenda is scored or stolen (Pantograph). */
  creditsOnScoreOrSteal?: number;
  /** Zahya: gain 1¢ per access when HQ/R&D run ends (once per turn). */
  creditsPerAccessOnCentralRunEnd?: boolean;
  /** René: on access-trash, gain credits/draw once per turn. */
  onAccessTrashGain?: { credits: number; draw: number; oncePerTurn?: boolean };
  /** Run event metadata (played events that start a run). */
  runEvent?: StartsRunSpec;
  /** With runEvent: playing without a server skips the run (Reprise may-run). */
  runEventOptional?: boolean;
  /** Trojan: must install hosted on a piece of ice. */
  installOnIce?: boolean;
  /** Pawn-class Caïssa advance after successful run while hosted. */
  caissaAdvanceOnSuccessfulRun?: boolean;
  /** Ice instance this card is hosted on (trojans). */
  hostId?: string;
  /** While hosted on ice, modify host ice strength (Monkeywrench). */
  hostStrengthModifier?: number;
  /**
   * While hosted on ice, modify host strength by this × virus counters on
   * this card (Chisel).
   */
  hostStrengthPerVirusCounter?: number;
  /**
   * While hosted on ice, modify strength of each other ice protecting the
   * same server (Monkeywrench).
   */
  otherIceProtectingServerStrengthModifier?: number;
  /** Hush: while hosted, host ice loses abilities (not printed subs). */
  blanksHostAbilities?: boolean;
  /**
   * Flux Capacitor: first break during an encounter with host ice → may charge
   * an installed card.
   */
  chargeOnFirstBreakDuringHostEncounter?: boolean;
  /** Tranquilizer: derez host when virus counters reach this threshold. */
  derezHostAtVirus?: number;
  /** Amaze: give this many tags at run end if an agenda was stolen (persistent). */
  tagsIfAgendaStolenThisRun?: number;
  /** Manegarm: approach-server tax alternatives (Runner must pay one or ETR). */
  approachServerTax?: { clicks: number; credits: number };
  /**
   * Cayambe Grid: end the run unless Runner pays `N` credits × count of
   * advanced ice protecting this server.
   */
  approachServerEtrUnlessCreditsPerAdvancedIce?: number;
  /**
   * Cyberdex Sandbox: `onVirusPurge` fires at most once per turn.
   */
  onVirusPurgeOncePerTurn?: boolean;
  /**
   * Swift: gain [click] the first time each turn a run event is played.
   */
  gainClickOnFirstRunEventThisTurn?: boolean;
  /**
   * Moshing: require at least this many *other* grip cards when playing
   * (additional trash-from-grip cost).
   */
  playRequiresOtherGripCardsGte?: number;
  /** Karunā: after this 0-based sub index resolves, Runner may jack out. */
  offerJackOutAfterSub?: number;
  /** Carnivore: once per turn, trash N from grip to trash the accessed card. */
  accessTrashFromGrip?: { gripCards: number; oncePerTurn?: boolean };
  /** Pantograph: after ¢ on score/steal, may install from grip. */
  mayInstallOnScoreOrSteal?: boolean;
  /** Send a Message: may rez any ice ignoring all costs. */
  mayRezIceIgnoringCostsOnScoreOrSteal?: boolean;
  /** Tāo: when agenda scored/stolen, may swap two installed ice. */
  maySwapIceOnAgendaScoredOrStolen?: boolean;
  /** Malapert: when agenda scored from this server, search R&D for non-agenda. */
  searchRdNonAgendaOnScoreFromServer?: boolean;
  /** +1 strength per hosted advancement (Ice Wall). */
  strengthPerAdvancement?: number;
  /** Sandstone: strength modifier per hosted virus counter. */
  strengthPerVirusCounter?: number;
  /**
   * Rime: while rezzed, each ice protecting the same server gets this much
   * strength.
   */
  sameServerIceStrengthBonus?: number;
  /**
   * Rime: during runs against this ice's server, may rez any time non-ice
   * cards could be rezzed.
   */
  rezAsNonIceDuringRunsOnServer?: boolean;
  /** Wraparound: +bonus unless Runner has an installed program of subtype. */
  strengthBonusIfNoInstalledSubtype?: { subtype: string; bonus: number };
  /** Lotus Field: ice strength cannot be lowered. */
  strengthCannotBeLowered?: boolean;
  /** Ice Carver: while encountering ice, modify ice strength. */
  runnerEncounterIceStrengthModifier?: number;
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
   * NEXT Bronze-class: +bonus strength for each rezzed ice (any server,
   * including self) with `subtype`.
   */
  strengthBonusPerRezzedIceWithSubtype?: { subtype: string; bonus: number };
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
  /** Effect IR at end of Corp turn while installed rezzed in a server root. */
  onCorpTurnEnd?: Effect;
  /**
   * Effect IR when Corp or Runner discard phase ends for the owner's side
   * (Corp: Project Ingatan hub; Runner identity: Lat Ethical Freelancer).
   */
  onDiscardPhaseEnd?: Effect;
  /**
   * Class Act: first time each turn Runner would draw any number, look top
   * amount+1 and bottom 1 of those before the draw proceeds.
   */
  onWouldDrawOncePerTurn?: Effect;
  /**
   * Storgotic Resonator: first trash each turn of a card matching the Runner
   * identity's faction → place power.
   */
  onFirstTrashMatchingRunnerIdentityFactionEachTurn?: Effect;
  /**
   * Hyoubu Institute: first reveal each turn → gain credits (etc.).
   */
  onFirstRevealEachTurn?: Effect;
  /**
   * MirrorMorph: when the third distinct Corp action this turn completes.
   */
  mirrormorphOnThirdDistinctAction?: Effect;
  /**
   * Direct Access: while resolving (including the run), blank both identities.
   */
  blankIdentitiesWhileResolving?: boolean;
  /** Complete Image: play only if Runner has ≥ N agenda points. */
  playRequiresRunnerAgendaPointsGte?: number;
  /** Mercia B4LL4RD: may install ice at Corp action phase end. */
  onCorpActionPhaseEnd?: Effect;
  /** Nebula-class dual identity: runtime flipped state. */
  identityFlipped?: boolean;
  /**
   * Méliès U: secretly chosen back face (hq / rd / archives) while still
   * showing Only the Brightest.
   */
  meliesChosenBackFace?: "hq" | "rd" | "archives";
  /** Méliès U: flip on successful Runner central run. */
  flipIdentityOnSuccessfulCentralRun?: boolean;
  /** Nebula / Méliès / Earth Station: effects while `identityFlipped` is true. */
  identityFlippedHooks?: {
    onFirstOperationPlayThisTurn?: Effect;
    onSuccessfulHqOrRdRun?: Effect;
    /** Earth Station: successful HQ run while flipped → unflip. */
    onSuccessfulHqRun?: Effect;
    onFlipToBackIfRunMatchesFace?: Effect;
    onRunnerDiscardPhaseEnd?: Effect;
  };
  /**
   * Earth Station: additional credits to initiate a run, gated by face
   * (CR 1.16.1b / 4.6.8f).
   */
  additionalRunInitiateCredits?: {
    hqUnflipped?: number;
    remoteFlipped?: number;
  };
  /**
   * Reduced Service / Cold Site Server: per hosted power counter, additional
   * credits and/or clicks to initiate a run on this server (rezzed root).
   */
  additionalRunInitiatePerPowerCounter?: {
    credits?: number;
    clicks?: number;
  };
  /** Ruhr Valley: flat additional clicks to initiate a run on this server. */
  additionalRunInitiateClicks?: number;
  /**
   * Reduced Service: when rezzed, may spend up to `max` credits to place that
   * many power counters.
   */
  rezSpendCreditsForPowerCounters?: { max: number };
  /**
   * Project Vacheron: when added to Runner score from anywhere except
   * Archives, instead add with 4 agenda counters (CR 9.9.9c).
   */
  vacheronStealReplacement?: boolean;
  /**
   * While in Runner score with ≥1 agenda counters, contribute 0 AP
   * (Project Vacheron).
   */
  worthZeroAgendaPointsWhileHasAgendaCounters?: boolean;
  /**
   * The Back: first hardware paid-ability use during a run each turn.
   */
  onFirstHardwareUseDuringRunEachTurn?: Effect;
  /**
   * GameNET: whenever a Corp card ability causes Runner spend/lose ≥1¢
   * during a run (CR 1.16.2b).
   */
  onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun?: Effect;
  /**
   * Magdalene-class: when discarding to max hand size, may install from
   * among those discarded cards.
   */
  onRunnerDiscardOverMaxHand?: Effect;
  /**
   * Zwicky: first time each turn Corp gains credits via an agenda or
   * operation ability.
   */
  onCreditsGainedFromAgendaOrOperationAbility?: Effect;
  /** Cacophony: sabotage at Runner action phase end. */
  onRunnerActionPhaseEnd?: Effect;
  /** Phật Gioan: first agenda scored/stolen each turn. */
  onFirstAgendaScoredOrStolenThisTurn?: Effect;
  /** Whenever a run begins while installed (Side Hustle). */
  onRunBegin?: Effect;
  /** Isaac: fire when this upgrade finishes moving to a server root. */
  onMovedToServerRoot?: Effect;
  /** Isaac: each advanced ice protecting this server gets +N strength. */
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
  /** Server this agenda was scored from (Lightning). */
  scoredFromServerId?: ServerId;
  /** Subtypes gained via Lycian choose while rezzed. */
  lycianGainedSubtypes?: string[];
  /** Amelia: on HQ/R&D run end if accessed ≥ min, place amount power. */
  powerOnHqRdRunEndIfAccessedGte?: { min: number; amount: number };
  /** Manuel: +N access on HQ/R&D breach while tagged. */
  bonusAccessOnHqRdBreachWhileTagged?: number;
  /** Docklands Pass: first HQ breach each turn → +N access. */
  bonusAccessOnFirstHqBreachThisTurn?: number;
  /** HQ Interface: whenever you breach HQ, +N access. */
  bonusAccessOnHqBreach?: number;
  /** R&D Interface: whenever you breach R&D, +N access. */
  bonusAccessOnRdBreach?: number;
  /** Manuel: Threat N → Corp basic trash also costs trash 1 from HQ. */
  threatBasicTrashAdditionalCostTrashHq?: number;
  /**
   * While rezzed: after each Corp action of a given type, if that type's
   * count this turn is exactly 3, gain 1 click (Wage Workers).
   */
  wageWorkersTrackActions?: true;
  /**
   * MirrorMorph: track distinct Corp action kinds; fire
   * `mirrormorphOnThirdDistinctAction` after the third distinct completes.
   */
  mirrormorphTrackDistinctActions?: true;
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
  /** Ken Express: gain this many credits on first run event each turn. */
  gainCreditOnFirstRunEvent?: number;
  /** Jinteki PE: net damage on agenda score/steal. */
  netDamageOnAgendaScoredOrStolen?: number;
  /** NEH: draw when creating first remote each turn. */
  drawOnFirstRemoteCreated?: number;
  /** Weyland BABW: gain credit when playing a transaction. */
  gainCreditOnTransactionPlayed?: number;
  /** Kit: first encounter each turn, ice gains code gate. */
  firstEncounterGainsCodeGate?: boolean;
  /** Clot: Corp cannot score agendas installed this turn. */
  forbidScoreAgendaInstalledThisTurn?: boolean;
  /** Vulnerability Audit: this agenda cannot be scored if installed this turn. */
  cannotScoreIfInstalledThisTurn?: boolean;
  /**
   * Word on the Street: additional cost Effect IR when Corp scores an agenda
   * installed this turn (typically add this card to Corp score as −1 AP).
   */
  additionalCostOnScoreAgendaInstalledThisTurn?: Effect;
  /** Pseudo-agenda in a score area that cannot be forfeited (Word on the Street). */
  cannotForfeit?: boolean;
  /** NRDB uniqueness (♦). */
  unique?: boolean;
  /**
   * Hackerspace: may host unique companion/connection resources at a credit
   * discount.
   */
  hostsUniqueCompanionOrConnectionResources?: { creditDiscount: number };
  /**
   * Hackerspace: +N max hand size while hosting both a companion and a
   * connection.
   */
  handSizeBonusIfHostingCompanionAndConnection?: number;
  /** Clot: trash when Corp purges viruses (flag only until purge exists). */
  trashOnVirusPurge?: boolean;
  /** Heliamphora-class: Effect when Corp purges virus counters. */
  onVirusPurge?: Effect;
  /** Cupellation: max faceup hosted Corp cards. */
  maxHostedCards?: number;
  /** Cupellation: mid-access pay credits to host non-agenda faceup. */
  accessHostNonAgendaFaceup?: { creditCost: number };
  /** Cupellation: HQ breach may pay+trash for bonus access while hosting Corp. */
  onBreachHqIfHostingCorpCard?: Effect;
  /** Akiko Nisei-class: Effect when breaching R&D (before access candidates). */
  onBreachRd?: Effect;
  /** Heliamphora: interrupt Archives access to host faceup instead. */
  onWouldAccessArchivesHostInstead?: { oncePerArchivesBreach?: boolean };
  /** Power counters (Earthrise). */
  powerCounters?: number;
  powerCountersOnInstall?: number;
  /** Perfect Recall: load power counters when rezzed. */
  powerCountersOnRez?: number;
  trashWhenPowerEmpty?: boolean;
  /** Server Diagnostics: trash this card when the Corp installs any ice. */
  trashSelfOnCorpIceInstall?: boolean;
  /**
   * Muse-class daemon: programs hosted on this card (via hostId) do not
   * count toward used memory.
   */
  daemonHost?: boolean;
  /** Djinn: max total MU of hosted programs. */
  daemonHostMaxMu?: number;
  /** Djinn: exclude icebreakers from hosting. */
  daemonHostExcludeIcebreaker?: boolean;
  /** Medium: choose bonus access < virus on R&D breach. */
  chooseBonusAccessLessThanVirusOnRdBreach?: boolean;
  /** Nerve Agent: choose bonus access < virus on HQ breach. */
  chooseBonusAccessLessThanVirusOnHqBreach?: boolean;
  /**
   * Snitch: once per run when approaching unrezzed ice, may expose then
   * may jack out.
   */
  mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut?: boolean;
  /** Personal Workshop host resource. */
  personalWorkshop?: boolean;
  /** Edge of World: onAccess only while installed. */
  onAccessRequiresInstalled?: boolean;
  /** Woodcutter: canAdvance only while rezzed. */
  canAdvanceOnlyWhenRezzed?: boolean;
  /**
   * Woodcutter/Tyrant: gains one copy of subroutine per advancement.
   */
  gainsSubroutinesPerAdvancement?: {
    subroutine: { id: string; text: string; effect: Effect };
  };
  /** Joshua B.: take 1 tag at Runner turn end after gaining the click. */
  tagAtTurnEnd?: boolean;
  mayRezWhenCardWouldBeExposed?: boolean;
  /** Malandragem: RFG when hosted power counters reach 0. */
  rfgWhenPowerEmpty?: boolean;
  /** Public Support: score as agenda when hosted power counters reach 0. */
  scoreWhenPowerEmpty?: { agendaPoints: number };
  /**
   * Hosted bad publicity counters (Superdeep Borehole). Not player BP until
   * taken via take_hosted_bad_publicity (CR §1.13.3).
   */
  badPublicityCounters?: number;
  /** Load this many hosted BP counters when rezzed. */
  badPublicityCountersOnRez?: number;
  /** While rezzed, Corp wins when hosted BP counters reach 0. */
  winWhenBadPublicityCountersEmpty?: boolean;
  /**
   * Ice gains an ETR subroutine before printed ones per hosted power
   * counter (Envelopment).
   */
  etrSubroutinesPerPowerCounter?: boolean;
  /** When any harmonic ice is rezzed, place 1 power counter on this ice (Echo). */
  powerCounterOnHarmonicIceRez?: boolean;
  /**
   * First spend of credits from an installed card each turn places 1 power
   * on this card (The Twinning).
   */
  powerOnFirstInstalledCardCreditSpendThisTurn?: boolean;
  /**
   * When breaching HQ/R&D, remove up to this many power counters for that many
   * bonus accesses (The Twinning).
   */
  removePowerForBonusAccessOnHqRdBreach?: number;
  /** Printed subroutines before dynamic ETR expansion (runtime). */
  baseSubroutines?: Subroutine[];
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
  /** Tallie Perrault: when gray/black ops operation trashed after resolving. */
  onGrayOrBlackOpsTrashedAfterResolve?: Effect;
  /** Caprice Nisei: Runner passed all ice protecting this server. */
  onPassAllIceProtectingServer?: Effect;
  /** Broadcast Square: Corp would take bad publicity. */
  onWouldTakeBadPublicity?: Effect;
  /** Hive: count active ETR subroutines from Corp agenda points. */
  dynamicEtrSubroutineCountFromCorpAgendaPoints?: boolean;
  /** NEXT Silver-class: gain N ETR subs per rezzed ice with subtype. */
  dynamicEtrSubroutineCountFromRezzedIceSubtype?: string;
  /** Midway Station Grid: +N credit to use icebreaker abilities on this server. */
  runnerIcebreakerAbilityAdditionalCostOnThisServer?: number;
  /** Power Tap: gain N credits whenever a trace is initiated. */
  gainCreditsOnTraceInitiated?: number;
  /** Eden Shard: install from grip instead of breaching R&D on success. */
  onGripRdSuccessInstallSelfIgnoringCosts?: boolean;
  /** Savoir-faire: each paid ability once per turn. */
  oncePerTurnPaidAbilities?: boolean;
  /** Blackguard: force Corp rez on expose when able. */
  blackguardForceRezOnExpose?: boolean;
  /** Alpha: only interface with outermost ice on server. */
  breakerOnlyOutermostIce?: boolean;
  /** Omega: only interface with innermost ice on server. */
  breakerOnlyInnermostIce?: boolean;
  /** Market Research: on score while Runner tagged, place 1 agenda counter. */
  onScoreIfRunnerTaggedPlaceAgendaCounter?: boolean;
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
  /**
   * Lockdown: after play, remain faceup in corp:play-area until Corp's next
   * turn begins; trash at that turn-begin checkpoint before pending
   * conditionals (CR 8.6.6c / 3.5.1c).
   */
  lingerUntilCorpNextTurnBegins?: boolean;
  lingerAsCurrent?: boolean;
  currentTrashOnAgendaStolen?: boolean;
  currentTrashOnAgendaScored?: boolean;
  runnerFirstRunEachTurnAdditionalCost?: number;
  blankRunnerIdentityPrintedAbilities?: boolean;
  onFirstIceRezEachTurn?: Effect;
  limitOnePerServer?: boolean;
  runnerLosesAllCreditsOnClickLossDuringRunOnThisServer?: boolean;
  whileScoredIceSubtypeStrengthBonus?: { subtype: string; bonus: number };
  ignoreInstallCostFirstIceEachTurn?: boolean;
  onSuccessfulRunOnThisServer?: Effect;
  firstEncounteredIceStrengthPenaltyThisRun?: number;
  corpMaxIceInstallsPerTurn?: number;
  strengthPerCorpCardInHq?: number;
  rezCostIncreasePerCorpCardInHq?: number;
  jackOutOnThisServerTrashRunnerProgram?: boolean;
  runnerCannotPlayCurrentEvents?: boolean;
  morphOddAdvancementSubtypeSwap?: { gain: string; lose: string };
  supplierHost?: boolean;
  onFirstRunnerCreditPoolEmptyThisTurn?: Effect;
  onGripArchivesSuccessInstallSelfIgnoringCosts?: boolean;
  trashSelfWhenRunnerTagged?: boolean;
  /** Hostile Infrastructure: N net damage whenever Runner trashes a Corp card. */
  netDamageWheneverRunnerTrashesCorpCard?: number;
  /** Ekomind: memory limit equals grip size. */
  memoryLimitEqualsGripSize?: boolean;
  /** Utopia Shard: install from grip instead of breaching HQ. */
  onGripHqSuccessInstallSelfIgnoringCosts?: boolean;
  trashCostIncreasePerFacedownArchivesCard?: number;
  gainCreditsOnCreateServer?: number;
  whileScoredStealAdditionalCreditsPerAdvancement?: number;
  gainCreditsWhenCorpLosesCredits?: number;
  drawWhenCorpRezzesIce?: number;
  strengthBonusPerUnusedMu?: number;
  briberyPlayCostX?: boolean;
  gainCreditsOnJackOut?: number;
  additionalCreditsToAccessRemoteRoot?: number;
  rezCostReductionPerAdvancement?: number;
  gainCreditsOnSpendAgendaCounter?: number;
  badPublicityOnRez?: number;
  firstRunnerInstallTrashFromGripEachTurn?: boolean;
  hostGainsBarrierAndEtrSubroutine?: boolean;
  iceProtectingThisServerAdditionalAdvancementTokens?: number;
  firstAccessedOperationTrashFreeEachTurn?: boolean;
  corpStartsWithBadPublicity?: number;
  corpHandSizeBonusPerBadPublicity?: number;
  installRequiresCorpBadPublicityGte?: number;
  placeVirusCounterWhenInstalledCorpCardTrashed?: boolean;
  hivemindSharesVirusCounters?: boolean;
  daemonHostVirusProgramsOnly?: boolean;
  preventOneVirusPurgeOnHostedProgram?: boolean;
  muBonusOnlyForVirusPrograms?: boolean;
  archivesAccessMayRfgInstead?: { oncePerArchivesBreach: boolean };
  onPassRezzedIceProtectingThisServer?: Effect;
  playersCannotTrashThisIce?: boolean;
  dynamicEtrSubroutineCountFromCorpHandSize?: boolean;
  runnerFirstInstallCostIncreasePerPowerCounterOnThis?: number;
  handSizeBonusPerInstalledCopyWithSameDefId?: number;
  trashSelfOnUnsuccessfulRunThisTurn?: boolean;
  onCorpRemoteServerCreated?: import("../effects/ir.js").Effect;
  trashWhenHostedCreditsEmpty?: boolean;
  /** Hosted agenda counters (scored agendas). */
  agendaCounters?: number;
  /** +agenda points per hosted agenda counter (Beale). */
  agendaPointsPerAgendaCounter?: number;
  /** Ice cannot be broken by AI programs. */
  cannotBreakWithAi?: boolean;
  /** Ice cannot be broken by AI while advancements >= threshold (Hortum). */
  cannotBreakWithAiAtAdvancements?: number;
  /** Semak-samun: only breakers with this subtype may break printed subs. */
  cannotBreakExceptSubtype?: string;
  /** Kessleroid: Runner cannot trash while rezzed. */
  cannotBeTrashedByRunnerWhileRezzed?: boolean;
  /** Scatter Field: +N strength when sole ice protecting server. */
  strengthBonusIfSoleIceProtectingServer?: number;
  /** Gatekeeper: +N strength while this ice was rezzed this turn. */
  strengthBonusIfRezzedThisTurn?: number;
  /** Measured Response: play only at Threat ≥ N. */
  playRequiresThreat?: number;
  /** Sang Kancil: paid ability credit discount while a run event is active. */
  paidAbilityCreditDiscountIfRunEventActive?: number;
  /** Public Access Plaza: Threat N → give tags when Runner trashes while rezzed. */
  threatGiveTagsOnRezzedTrash?: { level: number; tags: number };
  /** Runner card abilities cannot break this ice's subs (Trieste lock). */
  cannotBreakWithRunnerCardAbilities?: boolean;
  /** Install this agenda faceup (public). */
  installFaceup?: boolean;
  /** Credits gained when this card is advanced. */
  creditsOnAdvance?: { default: number; atOrAbove?: number; bonus?: number };
  /** Reduce agenda advancement requirement in this server (SanSan). */
  advancementRequirementReduction?: number;
  /**
   * Runner resource: increase every agenda's advancement requirement by this
   * amount while installed (The Source).
   */
  agendaAdvancementRequirementBonus?: number;
  /**
   * Runner resource: increase every agenda's advancement requirement while
   * installed with at least `threshold` hosted virus counters (Chakana).
   */
  agendaAdvancementRequirementBonusIfVirusCountersGte?: {
    threshold: number;
    bonus: number;
  };
  /** Runs against this server cannot be declared successful (Crisium). */
  runsCannotBeSuccessful?: boolean;
  /**
   * While rezzed on the attacked server, Runner may access at most this many
   * cards other than this upgrade (Flagship).
   */
  maxAccessOtherThanSelf?: number;
  /** Trojan: host ice gains barrier+code gate+sentry (Egret). */
  hostGainsAllIceSubtypes?: boolean;
  /**
   * Recurring credits may only be spent for these purposes.
   * `run_central` = any credit cost while attacking HQ / R&D / Archives
   * (Cezve-class; CR §1.10.5a / §6.3.4).
   */
  recurringSpendFor?: RecurringSpendPurpose[];
  /** Imp: mid-access trash accessed card by spending a virus counter. */
  accessTrashWithVirus?: boolean;
  /**
   * Lampades: mid-access spend 1 power + pay printed rez/play cost from
   * stealth credits to trash the accessed card.
   */
  accessTrashPayingPrintedCostFromStealth?: boolean;
  /** Luana: return hosted BP to player when uninstalled. */
  returnHostedBadPublicityOnUninstall?: boolean;
  /**
   * DJ Fenris: while hosting an identity, this card gains that identity's
   * ability text (CR 1.5.4).
   */
  gainsTextOfHostedIdentity?: boolean;
  /**
   * DJ Fenris: on uninstall, return hosted identity to outside-game pile
   * (CR 1.5.4b), not the heap.
   */
  returnHostedIdentityToOutsideGameOnUninstall?: boolean;
  /** Let Them Dream: agenda points delta while in Runner score area. */
  agendaPointsModifierInRunnerScoreArea?: number;
  /** Editorial: first BP take each turn. */
  onFirstBadPublicityTakeEachTurn?: Effect;
  /**
   * Nurse Hạnh: when ≥min facedown Archives cards turn faceup together,
   * evaluate effect.
   */
  onArchivesFacedownTurnedFaceupGte?: { min: number; effect: Effect };
  /** Perfect Recall: power on agenda scored/stolen from this server. */
  powerCounterOnAgendaScoredOrStolenFromThisServer?: number;
  /** Card may be advanced (assets/ice). */
  canAdvance?: boolean;
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
  /** Double: play costs an additional click (Celebrity Gift). */
  playAdditionalClick?: boolean;
  /**
   * Extra clicks beyond the first when playing (triples = 2). When set,
   * overrides the boolean `playAdditionalClick` count.
   */
  playAdditionalClicks?: number;
  /** Terminal: end the action phase after resolving (Big Deal). */
  endsActionPhase?: boolean;
  /** When this corp card would be trashed, may shuffle into R&D instead (Marilyn). */
  mayShuffleIntoRdWhenTrashed?: boolean;
  /** Bad publicity gained when this agenda is scored (Hostile Takeover). */
  badPublicityOnScore?: number;
  /** Play cost X ≤ Runner tags; places X advancements (Psychographics). */
  playCostXMaxRunnerTags?: boolean;
  /** Install: spend remaining credits as X for X power counters (Atman). */
  installSpendCreditsForPowerCounters?: boolean;
  /** +1 strength per hosted power counter. */
  strengthPerPowerCounter?: boolean;
  /** May only interface ice of equal strength (Atman). */
  interfaceRequiresEqualStrength?: boolean;
  /** May only interface ice hosting a trojan program (Umbrella). */
  interfaceRequiresTrojanHost?: boolean;
  /** May only interface ice protecting the server chosen on install (Cyber-Cypher). */
  interfaceRequiresChosenServer?: boolean;
  /** On install, choose breaker subtype barrier/code gate/sentry (Chameleon). */
  chooseBreakerSubtypeOnInstall?: boolean;
  /** Return to grip during discard phase (Chameleon). */
  returnToGripAtDiscardPhase?: boolean;
  /** On install choose an ice; may pay to bypass that ice (Femme Fatale). */
  chooseIceOnInstallForBypass?: boolean;
  /**
   * On install choose an ice and store chosenIceId (Boomerang — no bypass;
   * use requireEncounterChosenIce on paid abilities).
   */
  chooseIceOnInstall?: boolean;
  /** Ice id chosen by Femme Fatale / Boomerang (runtime). */
  chosenIceId?: string;
  /** Hosted programs lose abilities while hosted here (Magnet). */
  hostedProgramsLoseAbilities?: boolean;
  /** Abilities blanked while hosted on Magnet. */
  abilitiesBlanked?: boolean;
  /**
   * Klevetnik: Corp turns remaining until `abilitiesBlanked` clears
   * (decremented at Corp turn end).
   */
  abilitiesBlankedCorpTurnsRemaining?: number;
  /**
   * Hafrún: this Runner card's abilities cannot break subroutines for the
   * remainder of the current run.
   */
  cannotBreakSubsThisRun?: boolean;
  /**
   * Unsmiling Tsarevna: max printed subroutine breaks per encounter with this
   * ice for the remainder of the run.
   */
  maxPrintedSubsBreakablePerEncounter?: number;
  /** Security Testing: name a server at turn begin. */
  securityTesting?: boolean;
  /** Named server for Security Testing (runtime). */
  namedServerId?: ServerId;
  /**
   * Hyoubu Precog Manifold: server chosen on play (`choose_server`); used by
   * `attacking_chosen_server` on successful run.
   */
  chosenServerId?: ServerId;
  /** HB Architects: first pass of rezzed bioroid → may rez bioroid −4¢. */
  rezBioroidDiscountOnFirstPass?: number;
  /** Daily Business Show: first draw each turn draws +1 then bottoms one. */
  interruptFirstDrawBottomOne?: boolean;
  /** Subliminal: first copy each turn gains [click]; Archives recursion. */
  subliminalMessaging?: boolean;
  /** Ayla: identity uses set-aside zone. */
  aylaSetAside?: boolean;
  /** Steve Cambridge: first successful HQ → heap multi-pick + Corp RFG. */
  steveCambridge?: boolean;
  /** Aesop: on turn begin may trash owned installed for 3¢. */
  aesopPawnshop?: boolean;
  /** Bounce to stack at end of turn (Test Run). */
  bounceToStackAtTurnEnd?: boolean;
  /**
   * Temporary ice subtypes granted until end of turn (Tinkering).
   * Cleared at corp.turnEnds / runner.turnEnds.
   */
  grantedSubtypesUntilEndOfTurn?: string[];
  /**
   * While rezzed, when an encounter with ice protecting this server ends, if
   * the Runner broke ≥1 subroutine, they lose [click] (Mason Bellamy).
   */
  loseClickOnProtectingIceEncounterEndIfBroke?: boolean;
  /**
   * Corp identity: Runner cannot run remotes until they run a central this
   * turn (Jinteki: Replicating Perfection).
   */
  cannotRunRemotesUntilCentralRunThisTurn?: boolean;

  removeVirusOrTrashOnEncounterEndIfBroke?: boolean;
  /** Tycoon: Corp gains N¢ when encounter ends if this breaker broke a sub. */
  corpGainsCreditsOnEncounterEndIfBroke?: number;
  /** Cradle: −N strength per card in grip. */
  strengthPenaltyPerGripCard?: number;
  /** The Outfit: gain N¢ whenever Corp takes ≥1 bad publicity. */
  gainCreditsOnEachBadPublicityTake?: number;
  /** Hijacked Router: Corp loses N¢ whenever they create a server. */
  corpLosesCreditsOnCreateServer?: number;
  hostNonAiIcebreaker?: boolean;
  hostedIcebreakerMemoryDoesNotCount?: boolean;
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
  /**
   * Tyr's Hand: while unrezzed, may be rezzed as an interrupt when a
   * subroutine would be broken on bioroid ice protecting this server
   * (`break_interrupt_paw`). While rezzed, provides a `[trash]` paid ability
   * (via `paidAbilities`) that prevents that pending break.
   */
  preventSubroutineBreakOnBioroidByTrash?: boolean;
  playOrInstallDiscountByTrashingGripOncePerTurn?: number;
  gainCreditsOnFirstRunnerClickSpendThisTurn?: number;
  refundCreditsIfRunBeginsOnThisServerDuringClickAction?: number;
  onFirstRunnerClickSpendOrLoseDuringRun?: Effect;
  trashHostIfAllSubsBrokenThisEncounter?: boolean;
  /** Base link value (identities). */
  link?: number;
  /** Explicit unsupported clause notes from card data. */
  unsupported?: string[];
  /** Whether the card is faceup (Runner cards / accessed / Archives). */
  faceup: boolean;
  /** Corp installed cards: rezzed vs unrezzed. */
  rezzed: boolean;
  zone: ZoneId;
}

export type CentralServerId = "hq" | "rd" | "archives";
export type ServerId = CentralServerId | `remote-${number}`;

export interface Server {
  id: ServerId;
  kind: "central" | "remote";
  /** Ice positions: index 0 = outermost. CR 6.2 / 4.6.9. */
  ice: string[];
  /** Root cards (agendas/assets/upgrades). */
  root: string[];
}

export interface PlayerState {
  side: Side;
  clicks: number;
  credits: number;
  maxHandSize: number;
  identityId: string;
  /** Runner tags (CR 10.5). Corp unused in v0. */
  tags: number;
  /** Runner brain damage (CR 10.4). */
  brainDamage: number;
  /** Runner link (identity + modifiers). */
  link: number;
  /**
   * Runner base memory limit before card bonuses (default 4).
   * Corp unused.
   */
  memoryLimit: number;
  /** Deck / stack card ids, top at index 0. */
  deck: string[];
  hand: string[];
  discard: string[];
  score: string[];
  /** Runner only: installed rig card ids. */
  rig: string[];
  /**
   * Valley Grid: cumulative −N max hand size until beginning of Corp's next turn.
   */
  valleyGridHandSizePenalty?: number;
  /** Corp bad publicity (CR 10.6). */
  badPublicity?: number;
  /** Runner set-aside zone (Ayla). */
  setAside?: string[];
  /**
   * Runner outside-game additional-identities pile (CR 1.5.4a / DJ Fenris).
   * Instance ids live in `cards` with zone `runner:outside-game-identities`.
   */
  additionalIdentities?: string[];
  /** Corp temporary set-aside (Deep Dive top-of-R&D). */
  corpSetAside?: string[];
}

/** Per-turn flags shared by Gateway continuous / conditional abilities. */
export interface TurnBookkeeping {
  successfulRunThisTurn: boolean;
  successfulRunLastTurn: boolean;
  /** True after a run is declared unsuccessful this turn (John Masanori). */
  unsuccessfulRunThisTurn: boolean;
  /** Runner's prior-turn unsuccessful run carried into the Corp turn (Successful Demonstration). */
  unsuccessfulRunLastTurn: boolean;
  /**
   * True after Corp has rezzed an advertisement this turn
   * (Spark Agency first-rez credit loss).
   */
  advertisementRezzedThisTurn: boolean;
  /** TL;DR: duplicate subs on next ice encounter this run/turn. */
  dadDuplicateSubsOnNextIceEncounter?: boolean;
  /** Hunting Grounds: prevent when-encountered armed. */
  dadPreventWhenEncounteredArmed?: boolean;
  /** Dr. Lovegood: card ids blanked this turn. */
  dadBlankedCardIds?: string[];
  /** Security Chip: breaker strength boosts this run/turn. */
  dadBreakerStrengthBoosts?: Record<string, number>;
  /** Jak Sinclair / Apex: cannot use programs this run. */
  dadCannotUseProgramsThisRun?: boolean;
  /** Wasteland counter: own installed trashes this turn. */
  dadOwnInstalledTrashedThisTurn?: number;

  /**
   * Server ids the Runner successfully ran this turn (Daily Quest).
   */
  successfulRunServersThisTurn: string[];
  /**
   * Server ids successfully run during the Runner's last turn
   * (rolled at Corp turn begin).
   */
  successfulRunServersLastTurn: string[];
  agendaPointsScoredThisTurn: number;
  /** Agenda instance ids Corp scored this turn (Witch Hunt). */
  scoredCardIdsThisTurn: string[];
  programsInstalledThisTurn: number;
  /** Hardware installs this turn (Masterwork first-install draw). */
  hardwareInstalledThisTurn: number;
  /**
   * Most recently installed hardware instance id this turn (Replicator).
   * Cleared at turn boundaries via emptyTurnBookkeeping.
   */
  lastHardwareInstalledId: string | null;
  /**
   * Program instance ids that received ≥1 virus counter this turn (Surge).
   */
  programsWithVirusPlacedThisTurn: string[];
  /**
   * Az McCaffrey: true after the first job/connection resource or hardware
   * install this turn (discount already consumed).
   */
  jobConnectionOrHardwareInstallDiscountUsedThisTurn: boolean;
  /**
   * Most recently stolen agenda instance id this turn (Divested Trust).
   */
  lastStolenAgendaId: string | null;
  basicDrawsThisTurn: number;
  usedAbilities: string[];
  /** Lakshmi: agenda defIds that cannot be stolen this turn. */
  bfCannotStealAgendaDefIds?: string[];
  /** Councilman: card ids that cannot be rezzed again this turn. */
  dagCannotRezCardIds?: string[];
  /** Nero Severn: jack-out-on-sentry already used this turn. */
  dagNeroSentryJackOutUsedThisTurn?: boolean;
  /** Salsette Slums: RFG-instead-of-Archives ability used this turn. */
  siSalsetteSlumsUsedThisTurn?: boolean;
  /** Jeeves: already gained click from 3+ click spend this turn. */
  siJeevesGainClickUsedThisTurn?: boolean;
  /** Raman Rai: already used once-per-turn draw swap. */
  siRamanRaiUsedThisTurn?: boolean;
  /** Making an Entrance look/trash/arrange scratch. */
  siStackLookedCards?: string[];
  siStackArrangePlaced?: string[];
  /** Information Sifting HQ piles. */
  tlmInfoSiftPileA?: string[];
  tlmInfoSiftPileB?: string[];
  /** Dedicated Neural Net: first successful HQ psi used this turn. */
  tlmDedicatedNeuralNetUsedThisTurn?: boolean;
  installedThisTurn: string[];
  /** Valley: how many Runner installs have fired first-install genetics/hooks this turn. */
  valInstallTriggerCount: number;
  /** Valley: click-loss trigger count (Chronotype / genetics). */
  valClickLossTriggerCount: number;
  /** Valley: damage trigger count (Synthetic Blood / genetics). */
  valDamageTriggerCount: number;
  /** Valley: basic click-draw trigger count (Symmetrical Visage / genetics). */
  valBasicClickDrawTriggerCount: number;
  /** Valley: successful-run trigger count for genetics (Enhanced Vision). */
  valSuccessfulRunTriggerCount: number;
  /** Breaker Bay: Dorm Computer — prevent all tags for the current/queued run. */
  bbPreventAllTagsThisRun?: boolean;
  /** Breaker Bay: Recruiting Trip — last chosen play cost X. */
  lastPlayCostX?: number;
  /** Chrome City: Analog Dreamers started this R&D run. */
  ccAnalogDreamersRun?: boolean;
  /** Chrome City: Lockdown — Runner cannot draw for remainder of turn. */
  ccRunnerCannotDraw?: boolean;
  /** Chrome City: Immolation Script access-replace used this run. */
  ccImmolationScriptUsedThisRun?: boolean;
  /** The Underway: Defective Brainchips first-core bump used this turn. */
  uwFirstCoreDamageIncreasedThisTurn?: boolean;
  /** Old Hollywood: Trope heap-shuffle remaining picks. */
  ohTropeShuffleRemaining?: number;
  /** Old Hollywood: Rolodex stack look/arrange. */
  ohStackLookedCards?: string[];
  ohStackArrangePlaced?: string[];
  /** Old Hollywood: An Offer forced run. */
  ohForcedRunServerId?: string;
  ohForcedRunCannotJackOut?: boolean;
  /** Old Hollywood: agendas stolen this turn (Haarpsichord). */
  agendasStolenThisTurn?: number;
  /** UOT: Power to the People armed credits on first agenda access. */
  uotFirstAgendaAccessCredits?: number;
  /** UOT: DDoS — cannot rez outermost ice during a run this turn. */
  uotCannotRezOutermostIce?: boolean;
  /** UOT: Bookmark host-remaining capacity this ability. */
  uotBookmarkHostRemaining?: number;
  /** UOT: Genetics Pavilion runner cards drawn this turn. */
  uotRunnerCardsDrawnThisTurn?: number;
  /** UOT: Chronos Protocol first net damage used this turn. */
  uotChronosNetDamageUsedThisTurn?: boolean;
  /** UOT: Chronos remaining grip trashes to choose. */
  uotChronosTrashRemaining?: number;
  /** True if Corp installed any card from HQ this turn (Holo Man). */
  corpInstalledFromHqThisTurn: boolean;
  /** HB ETF: first Corp card install ability used this turn. */
  firstCorpCardInstallUsedThisTurn: boolean;
  /** Ice instance ids that were rezzed this turn (Cloud Eater). */
  rezzedThisTurnIds: string[];
  /** Sisyphus: first pass CG/sentry offer used this turn. */
  sisyphusPassUsedThisTurn: boolean;
  /** Nuvem: first R&D trash credit gain used this turn. */
  nuvemFirstRdTrashUsedThisTurn: boolean;
  /** Card ids that received an advancement this turn (Issuaq Adaptics). */
  advancedThisTurn: string[];
  cannotScoreAgendas: boolean;
  /** Efficiency Committee: cannot advance any card for the remainder of this turn. */
  cannotAdvanceCards: boolean;
  /**
   * Card instance ids that cannot be scored or rezzed for the remainder of
   * this turn (Mitosis).
   */
  cannotScoreOrRezCardIds: string[];
  /**
   * Card instance ids the Runner cannot access for the remainder of this turn
   * (Queen's Gambit).
   */
  cannotAccessCardIdsThisTurn: string[];
  /**
   * Replicating Perfection: remotes unlocked until end of turn after a
   * central run this turn.
   */
  remotesUnlockedByCentralRunThisTurn: boolean;
  /** Patchwork once-per-turn discount used. */
  patchworkDiscountUsedThisTurn: boolean;
  /** Credits of Patchwork discount pending for the current play/install. */
  patchworkPendingDiscountThisAction: number;
  /** Sundew: first runner click-spend credit gain fired. */
  sundewFirstClickSpendFiredThisTurn: boolean;
  /** Sundew: server ids that may refund if run begins during this click action. */
  sundewRefundServerIdsThisAction: string[];
  /** Seidr: first click spend/lose during run fired. */
  seidrClickDuringRunFiredThisTurn: boolean;
  /**
   * True while Corp is resolving an install (suppress Ob Superheavy on
   * region-limit trash during install).
   */
  corpInstallInProgress: boolean;
  /** Ob Superheavy once-per-turn used. */
  obSuperheavyUsedThisTurn: boolean;
  /** Printed rez cost of the most recently trashed rezzed Corp card. */
  lastTrashedRezzedPrintedRezCost: number | null;
  /** Install cost of the program most recently trashed via trash_own_program (Scavenge). */
  lastTrashedOwnProgramInstallCost: number | null;
  /**
   * Excess (trace strength − link) from the most recently resolved trace
   * (Power Grid Overload).
   */
  lastTraceExcess: number | null;
  /** Strength of the most recently resolved trace (Taurus-class). */
  lastResolvedTraceStrength: number | null;
  /** Bad Times-class MU modifier until Runner turn end. */
  runnerMuModifierUntilTurnEnd?: number;
  /** Mutate additional-cost trashed ice slot. */
  reuseTrashedFromHq?: number;
  tradeInCredits?: number;
  mutateTrashedIce?: {
    iceId: string;
    serverId: ServerId;
    index: number;
  };
  /** Social Engineering marked ice id this turn. */
  socialEngineeringMarkedIce?: string;
  /**
   * True after Runner has spent credits from an installed card this turn
   * (The Twinning).
   */
  installedCardCreditSpendThisTurn: boolean;
  /**
   * Keiko: first companion install / companion credit-spend credit gain
   * already fired this turn.
   */
  companionInstallOrSpendCreditsFiredThisTurn: boolean;
  tagsGivenThisTurn: number;
  stealthCreditsOnLastPaidAbility?: number;
  runnerCreditPoolEmptyFiredThisTurn?: boolean;
  /** Core (brain) damage points suffered this turn (Esâ-class triggers). */
  coreDamageSufferedThisTurn: number;
  /**
   * Virus programs installed this turn (Avgustina-class first-virus-install triggers).
   */
  virusProgramsInstalledThisTurn: number;
  /**
   * True after the Runner has begun a run on R&D this turn
   * (Padma-class first-R&D-run-begin triggers).
   */
  rdRunBegunThisTurn: boolean;
  /** First Archives run begun this Runner turn (Front Company). */
  archivesRunBegunThisTurn: boolean;
  /**
   * Server id (root) from which the most recent agenda was scored or stolen
   * this turn (Tucana guard).
   */
  lastAgendaScoredOrStolenServerId: ServerId | null;
  /**
   * True after the Runner has made a successful run on their mark this turn
   * (Virtuoso-class first-successful-mark-run triggers).
   */
  successfulMarkRunThisTurn: boolean;
  hqBreachesThisTurn: number;
  /** Servers the Runner has run this turn (Red Team). */
  serversRunThisTurn: ServerId[];
  /** Zahya once-per-turn run-end credit ability used. */
  zahyaRunEndUsed: boolean;
  /** René once-per-turn access-trash ability used. */
  reneAccessTrashUsed: boolean;
  /** Solidarity Badge-class: first Corp-card trash this turn already fired. */
  firstCorpCardTrashUsedThisTurn: boolean;
  /** Lago Paranoá-class: first Corp root-install this turn already fired. */
  firstCorpRootInstallUsedThisTurn: boolean;
  /** A Teia: first remote install this turn already fired. */
  firstRemoteInstallThisTurnUsed: boolean;
  /** Server id that triggered onFirstRemoteInstallThisTurn (chain install). */
  triggerRemoteInstallServerId: ServerId | null;
  /**
   * Server that hosted the Corp card most recently trashed (for onTrash
   * effects that exclude installing into that server's root — Vaporframe).
   */
  onTrashSourceServerId: ServerId | null;
  /** Stegodon: first run begin this turn already fired. */
  runBeginThisTurnUsed: boolean;
  /** Carnivore once-per-turn access trash used. */
  carnivoreAccessTrashUsed: boolean;
  /** First ice rezzed this turn (Reina). */
  iceRezzedThisTurn: number;
  /** First run event played this turn (Ken Express). */
  runEventsPlayedThisTurn: number;
  /** Events played this turn (Touchstone first-event hosted credits). */
  eventsPlayedThisTurn: number;
  /** Sudden Commandment: mandates played this turn (including current). */
  mandatesPlayedThisTurn: number;
  /** First encounter this Runner turn used (Kit). */
  firstEncounterUsedThisTurn: boolean;
  /**
   * Gantulga: ice id of the first encounter this turn with ice protecting
   * the named server — subs resolve as net damage while set.
   */
  gantulgaEncounterIceId: string | null;
  /** First remote server created this Corp turn (NEH). */
  remotesCreatedThisTurn: number;
  /** Agenda points stolen this Runner turn (rolls to last turn for Punitive). */
  agendaPointsStolenThisTurn: number;
  /** Agenda points stolen last Runner turn. */
  agendaPointsStolenLastTurn: number;
  /** Runner stole or trashed a Corp card this Runner turn (Oppo / Epiphany). */
  runnerStoleOrTrashedCorpCardThisTurn: boolean;
  /** Runner trashed one of their own installed cards this turn (Boi-tatá). */
  runnerTrashedOwnInstalledThisTurn: boolean;
  /** Runner stole or trashed a Corp card during their previous turn. */
  runnerStoleOrTrashedCorpCardLastTurn: boolean;
  /** Hangeki: Runner trashed a Corp card this turn (trash-only; not steal). */
  runnerTrashedCorpCardThisTurn: boolean;
  /** Hangeki: Runner trashed a Corp card during their previous turn. */
  runnerTrashedCorpCardLastTurn: boolean;
  /** Epiphany identity hook fired this Runner turn. */
  firstRunnerStoleOrTrashedUsedThisTurn: boolean;
  /** Phật Gioan-class: first agenda scored/stolen this Corp turn. */
  firstAgendaScoredOrStolenUsedThisTurn: boolean;
  /** Biawak: pending rez pays forfeit discount for this ice id. */
  rezIceForfeitDiscountCardId: string | null;
  /** Per Corp action kind counts this Corp turn (Wage Workers). */
  corpActionTypeCounts: Record<string, number>;
  /** Corp basic actions completed this turn (Petty Cash gate). */
  corpActionsCompletedThisTurn: number;
  /**
   * Clicks spent by the Runner this turn (priority / playRequiresFirstClick).
   * Losing clicks does not increment this (CR 1.11.4).
   */
  runnerClicksSpentThisTurn: number;
  /**
   * In the Groove-class: delayed install conditionals active for the remainder
   * of this Runner turn.
   */
  remainderOfTurnOnInstallPrintedCostGte: Array<{
    min: number;
    effect: import("../effects/ir.js").Effect;
    sourceId: string;
  }>;
  /** Nebula flip side: first operation hook fired this turn. */
  corpFlippedIdentityFirstOpUsedThisTurn: boolean;
  /** Runner cards discarded to hand size this discard step (Magdalene). */
  runnerDiscardedToMaxHandIds: string[];
  /** Petty Cash: current operation play originated outside HQ. */
  operationPlayedFromNonHq: boolean;
  /** Zwicky: first agenda/operation credit-gain draw offered this turn. */
  zwickyCreditsDrawUsedThisTurn: boolean;
  /** Top of R&D temporarily removed for look / arrange effects. */
  rdLookedCards: string[];
  /** Cards already placed during R&D arrange (top-to-bottom order). */
  rdArrangePlaced: string[];
  /** Federal: after arrange, offer may-draw if host server unprotected. */
  rdArrangeThenMayDrawIfUnprotected: boolean;
  /** Successful HQ run this turn (Emergency Shutdown). */
  successfulHqRunThisTurn: boolean;
  /**
   * Successful HQ run during the Runner's previous turn
   * (Digital Rights Management play gate).
   */
  successfulHqRunLastTurn: boolean;
  /** Runner completed access of at least one card this turn (Hoshiko). */
  accessedACardThisTurn: boolean;
  /**
   * Runner accessed a card during their previous turn
   * (Under the Bus play gate).
   */
  accessedACardLastTurn: boolean;
  /** Paule's Café: first hosted-install discount already used this turn. */
  paulesCafeInstallUsedThisTurn: boolean;
  /** Buffer Drive: first grip/stack trash-batch spectator used this turn. */
  bufferDriveGripStackTrashUsedThisTurn: boolean;
  /**
   * The Back: first hardware paid-ability use during a run this turn already
   * noted.
   */
  hardwareUsedDuringRunThisTurn: boolean;
  /** Nesting depth for simultaneous grip/stack trash batches. */
  gripOrStackTrashBatchDepth: number;
  /** Card ids trashed from grip/stack in the current open batch. */
  pendingGripOrStackTrashBatchIds: string[];
  /** Successful R&D run this turn (Deep Dive). */
  successfulRdRunThisTurn: boolean;
  /** Successful Archives run this turn (Deep Dive). */
  successfulArchivesRunThisTurn: boolean;
  /** Unrezzed ice ids passed during the most recent successful run (En Passant). */
  lastRunPassedUnrezzedIceIds: string[];
  /** Unrezzed ice passed during the current run (accumulates). */
  currentRunPassedUnrezzedIceIds: string[];
  /** Targeted Marketing named card def id while active. */
  targetedMarketingNamedDefId?: string;
  /** Runner made at least one run this turn (Subliminal recursion). */
  runnerMadeRunThisTurn: boolean;
  /** Runner made a run last turn. */
  runnerMadeRunLastTurn: boolean;
  /** Runner installed a resource during their turn (Hellion Alpha Test gate). */
  runnerInstalledResourceThisTurn: boolean;
  runnerInstalledResourceLastTurn: boolean;
  /** First Subliminal Messaging played this Corp turn. */
  subliminalPlayedThisTurn: boolean;
  /** First successful HQ Steve Cambridge trigger used. */
  steveCambridgeUsedThisTurn: boolean;
  /** First rezzed bioroid pass this turn (HB Architects). */
  bioroidPassedThisTurn: boolean;
  /**
   * Runner cannot use paid abilities printed on bioroid ice this turn
   * (Hákarl 1.0 after may-derez). Gates `break_bioroid_subroutine` and
   * Runner use of paid abilities on bioroid ice.
   */
  bioroidIcePaidAbilitiesForbidden: boolean;
  /** Turn-scoped ice strength boosts (Troubleshooter). */
  iceStrengthBoostsThisTurn: Record<string, number>;
  /** Turn-scoped icebreaker strength boosts (Living Mural). */
  breakerStrengthBoostsThisTurn: Record<string, number>;
  /**
   * Cortez Chip: additional rez cost on chosen ice until end of turn
   * (cardId → amount).
   */
  iceAdditionalRezCostThisTurn: Record<string, number>;
  /**
   * Last Corp card installed via `install_hq_card_paying_costs` this turn
   * (Greasing the Palm tag-for-advance follow-up).
   */
  lastInstalledFromEffectId: string | null;
  /** HB Architects pending rez discount for next bioroid rez. */
  pendingBioroidRezDiscount: number;
  /** Card instance ids whose once-per-turn onSuccessfulRun already fired. */
  onSuccessfulRunFiredIds: string[];
  /** Project Ares: remaining Runner installs to trash on score. */
  projectAresTrashRemaining?: number;
  projectAresTrashedCount?: number;
  /** Invasion of Privacy: remaining grip cards Corp may trash. */
  invasionPrivacyTrashRemaining?: number;
  /**
   * Card instance ids whose once-per-turn onSuccessfulRunEnd already fired
   * (Doppelgänger).
   */
  onSuccessfulRunEndFiredIds: string[];
  /**
   * Uroboros: Runner cannot initiate another run this turn.
   */
  cannotMakeAnotherRunThisTurn: boolean;
  /** Shoot the Moon: remaining free ice rezzes. */
  shootTheMoonRemaining?: number;
  /** Incubator: virus counters to move after self-trash. */
  incubatorMoveAmount?: number;
  /** Bribery: X paid as play cost this run. */
  briberyXPaid?: number;
  /**
   * Card instance ids whose `onFirstAvoidOrRemoveTagThisTurn` already fired
   * this turn (Thunder Art Gallery).
   */
  onFirstAvoidOrRemoveTagFiredIds: string[];
  /**
   * True after the first successful R&D run end this turn has offered
   * `onFirstSuccessfulRunOnRdEndsThisTurn` (Psych Mike).
   */
  firstSuccessfulRdRunEndUsedThisTurn: boolean;
  /**
   * True after the first program/hardware trash this turn fired District 99
   * class triggers.
   */
  firstProgramOrHardwareTrashUsedThisTurn: boolean;
  /**
   * True after the first access trash this turn fired Mâché-class triggers.
   */
  firstAccessTrashUsedThisTurn: boolean;
  /** Trash cost of the card most recently trashed while accessed (Mâché). */
  lastAccessTrashCost: number;
  /**
   * True after the first installed-resource paid ability resolves this turn
   * (Juli Moreira Lee gate).
   */
  firstResourcePaidAbilityThisTurn: boolean;
  /** Card instance ids whose once-per-turn onFullyBreak already fired. */
  onFullyBreakFiredIds: string[];
  /** Mercury: once-per-turn zero-break HQ/R&D breach bonus used. */
  mercuryBreachBonusUsedThisTurn: boolean;
  /** Info Bounty: first mark-run-end-if-breached credit gain used. */
  infoBountyMarkRunEndUsed: boolean;
  /** Hostile Architecture: meat-on-installed-trash used this turn. */
  hostileArchitectureUsedThisTurn: boolean;
  /**
   * Skip the discard step this turn (Midnight-3 Arcology).
   * Consumed when the discard step resolves.
   */
  skipDiscardThisTurn: boolean;
  /**
   * Last card that received advancements via place_advancements this turn
   * (Big Deal may-score target).
   */
  lastAdvancementTargetId: string | null;
  /** Corp cards moved into Archives this turn (Regenesis gate). */
  corpCardsAddedToArchivesThisTurn: number;
  /** Brasília upgrade instance ids that used their once-per-turn ability. */
  brasiliaAbilityUsedIds: string[];
  /**
   * Lightning Laboratory: after spending an agenda counter on run begin,
   * derez up to maxIce protecting serverId at runner.turnEnds.
   */
  lightningPendingDerez: { serverId: ServerId; maxIce: number } | null;
  /**
   * Synapse Global: Corp identity `onRemoveTags` fires at most once per turn.
   */
  firstCorpOnRemoveTagsThisTurn: boolean;
  /** IP Enforcement: tags removed as additional play cost this operation. */
  ipEnforcementTagsRemoved: number;
  /** Ryō Phoenix: first successful-after-sub ability already fired this turn. */
  ryoPhoenixFiredThisTurn: boolean;
  /**
   * Synchrocyclotron: first-double click discount already applied this Corp turn.
   */
  doubleOpClickDiscountUsedThisTurn: boolean;
  /**
   * Tungsten Tailor: gain-credit-on-break-lte-strength already used this turn.
   */
  tungstenBreakCreditUsedThisTurn: boolean;
  /** Stick and Poke: first-encounter gained subroutine already used this turn. */
  stickAndPokeUsedThisTurn: boolean;
  /** Sipa: outermost full-break swap already used this turn. */
  sipaSwapUsedThisTurn: boolean;
  /** Sacrifice Zone / Shackleton once-per-turn ability instance ids used. */
  otherServerSuccessAbilityUsedIds: string[];
  outsidePoolSpendAbilityUsedIds: string[];
  /** Editorial: first BP-take ability already fired this turn. */
  firstBadPublicityTakeUsedThisTurn: boolean;
  /** Unorthodox Predictions: subtypes whose printed subs cannot be broken. */
  forbidBreakIceSubtypesUntilCorpTurnEnd?: string[];
  /** Leverage: Runner prevents all damage until next turn begins. */
  leveragePreventRunnerDamage?: boolean;
  /** Starlight Crusade Funding: ignored additional cost on first double event this turn. */
  starlightDoubleEventAdditionalCostIgnored?: boolean;
  /** Raymond Flint: apply HQ hand-only breach when next run starts. */
  pendingRaymondFlintHandOnlyHqBreach?: boolean;
  /** Aniccam: first event-trash draw used this turn. */
  firstEventTrashedUsedThisTurn: boolean;
  /** Tranquility-class: upgrade ids that already fired this turn. */
  firstInstallInServerRootUsedIds: string[];
  /**
   * Card instance ids whose once-per-turn onVirusPurge already fired
   * (Cyberdex Sandbox).
   */
  onVirusPurgeOncePerTurnFiredIds: string[];
  /**
   * Climactic Showdown: first HQ or R&D breach this turn gains this many
   * bonus accesses (0 = inactive). Consumed on first HQ/RD breach.
   */
  climacticBonusAccessOnFirstHqRdBreach: number;
  /**
   * Storgotic: first trash this turn of a card matching Runner identity
   * faction already placed power.
   */
  firstTrashMatchingRunnerIdentityFactionUsedThisTurn: boolean;
  /** Hyoubu: first reveal credit already gained this turn. */
  firstRevealCreditUsedThisTurn: boolean;
  /**
   * Class Act instance ids whose onWouldDrawOncePerTurn already fired
   * this turn.
   */
  onWouldDrawOncePerTurnFiredIds: string[];
  /**
   * Pending Runner draw amount while Class Act interrupt resolves
   * (look top amount+1, bottom 1, then draw remainder).
   */
  pendingWouldDrawAmount: number | null;
  /**
   * Corp action kinds completed this turn in order (MirrorMorph distinct
   * third-action tracking). Values align with Wage Workers vocabulary.
   */
  corpActionKindsInOrderThisTurn: string[];
  /** MirrorMorph third-distinct bonus already offered this turn. */
  mirrormorphThirdDistinctFiredThisTurn: boolean;
  /**
   * MirrorMorph: next Corp action pays 1 click less and must differ from
   * the three kinds already taken.
   */
  mirrormorphClickDiscountPending: boolean;
  /** Gyri Labyrinth: Runner max hand −2 until Corp next turn begins. */
  gyriLabyrinthHandPenalty?: boolean;
}

export type TurnPhase =
  | "corp_draw"
  | "corp_action"
  | "corp_discard"
  | "runner_action"
  | "runner_discard";

export type RunPhase =
  | "initiation"
  | "approach_ice"
  | "encounter"
  | "movement"
  | "success"
  | "breach"
  | "access"
  | "ends";

export interface EncounterState {
  iceId: string;
  /** Parallel to card.subroutines — true if broken this encounter. */
  broken: boolean[];
  /** Breaker ids that broke a subroutine this encounter (Crypsis). */
  breakersThatBrokeThisEncounter?: string[];
  /**
   * After paying for a multi-break ability, remaining free breaks for that
   * breaker this encounter (Buzzsaw / Cleaver).
   */
  freeBreaksRemaining?: { breakerId: string; remaining: number };
  /** Anvil: forbid runner break was applied for this encounter only. */
  forbidRunnerBreakThisEncounter?: boolean;
  /**
   * Banner: subroutines cannot end the run for the remainder of this encounter.
   */
  forbidEndTheRunThisEncounter?: boolean;
  /**
   * Virtual Service Agent: a decoder broke a printed sub this encounter.
   */
  brokePrintedSubWithDecoder?: boolean;
  /**
   * Flux Capacitor instance ids that already offered may-charge for the first
   * break this encounter.
   */
  firstBreakChargeFiredIds?: string[];
  /** When-encountered interrupt: onEncounter not yet fired. */
  onEncounterPending?: boolean;
  /** AirbladeX: skip onEncounter on this ice. */
  onEncounterPrevented?: boolean;
  /** Sorocaban Blade: installed Runner cards trashed by this ice this encounter. */
  installedRunnerTrashesThisEncounter?: number;
  /**
   * Stick and Poke: synthetic subroutine was prepended for this encounter and
   * must be removed when the encounter ends.
   */
  stickAndPokeSynthetic?: boolean;
  /** Sensei: this encounter has a synthetic ETR sub appended after printed. */
  senseiEtrSynthetic?: boolean;
  /** True once every printed (+synthetic) sub was broken by the Runner. */
  fullyBrokenByRunner?: boolean;
  /** Ids whose onHostFullyBrokenThisEncounter already fired this encounter. */
  hostFullyBrokenFiredIds?: string[];
  /**
   * Engram Flush: Corp-chosen card type for reveal-grip trash this encounter
   * (typically a Runner type: event / hardware / program / resource).
   */
  chosenCardType?: CardType;
  /**
   * Pelangi: ice subtypes granted for the remainder of this encounter.
   */
  grantedSubtypes?: string[];
}

export interface RunState {
  attackedServerId: ServerId;
  phase: RunPhase;
  /** Ice index being approached/encountered, or null when past ice. */
  position: number | null;
  successful: boolean | null;
  /** Bandwidth: tags given that remove on successful run. */
  bandwidthTagsToRemoveOnSuccess?: number;
  /** Transport Monopoly-class: this run cannot be declared successful. */
  cannotDeclareSuccessful?: boolean;
  accessedCardIds: string[];
  /** Cards still available to access during breach. */
  accessCandidates: string[];
  /** How many more cards the Runner may access this breach (centrals). */
  accessRemaining: number | null;
  encounter: EncounterState | null;
  /** Set when a subroutine ends the run. */
  endedTheRun: boolean;
  /**
   * While completing other open priority windows at Run Ends (CR 6.8.2c),
   * pending abilities resolve normally but new timing structures (e.g.
   * Formicary encounter) cannot be initiated.
   */
  forbidNewTimingStructures?: boolean;
  /** Runner cannot jack out for the remainder of this run (cannot effects). */
  cannotJackOut: boolean;
  /**
   * True once the Runner has spent [click] to break a subroutine on a
   * bioroid this run (Zed 1.0 subroutine gate).
   */
  lostClickToBreakThisRun?: boolean;
  /** Run-scoped icebreaker strength boosts (cardId → delta). */
  strengthBoosts: Record<string, number>;
  /** Encounter-scoped icebreaker strength boosts (cleared when passing ice). */
  encounterStrengthBoosts: Record<string, number>;
  /** Encounter-scoped ice strength boosts (cardId → delta). */
  iceStrengthBoosts: Record<string, number>;
  /** Ice ids that gained a Thunderbolt synthetic subroutine this run. */
  thunderboltGrantedIceIds?: string[];
  /** Howler: card id to trash at run end (set when its subroutine fires). */
  howlerId?: string;
  /** Howler: ice id it installed+rezzed, to derez at run end. */
  howlerInstalledIceId?: string;
  /**
   * Peeping Tom: ice instance ids that gained run-scoped ETR-unless-tag
   * subroutines; restore baseSubroutines at run end.
   */
  peepingTomIceIds?: string[];
  /** Card currently being accessed (awaiting steal/trash/no-action). */
  accessingCardId: string | null;
  /** Vikram 1.0: Runner cannot use programs for the remainder of this run. */
  kgCannotUsePrograms?: boolean;
  /** Interrupt 0: additional ¢ to use icebreaker break abilities this run. */
  kgIcebreakerBreakAdditionalCost?: number;
  /** Panchatantra: bonus subtypes granted to ice this run. */
  kgEncounterBonusSubtypes?: Record<string, string[]>;
  /** Mongoose: breaker ids already used to break on an ice this run. */
  kgBreakerUsedOnIceIds?: Record<string, string>;
  /** EMP Device: max ice rez count this run. */
  bfMaxIceRezThisRun?: number;
  /** EMP Device: ice rezzed so far this run under the limit. */
  bfIceRezzedThisRun?: number;
  /** Extra central accesses granted for this breach (Jailbreak / Docklands). */
  bonusAccess?: number;
  /** Runner spent credits outside their credit pool this run (Shackleton). */
  outsidePoolCreditSpendThisRun?: boolean;
  /** Beta Build: program installed by the event for return-on-end. */
  betaBuildTrackedInstallId?: string;
  /** Perfect Recall: titles Runner cannot steal/trash this run. */
  forbidStealTrashTitles?: string[];
  /**
   * After this run ends, begin a standalone breach of this server
   * (Virtuoso non-HQ mark). Cleared when the post-run breach shell starts.
   */
  breachWhenRunEnds?: ServerId;
  /**
   * True when `run` is a shell that exists only to host a post-run breach
   * (not a successful run; CR breach outside a run).
   */
  isPostRunBreach?: boolean;
  /** Mind's Eye: exclude cards in the attacked server root during breach. */
  cannotAccessRoot?: boolean;
  /**
   * Divide and Conquer-class: after the current breach completes, breach these
   * servers in order (optionally excluding root cards).
   */
  queuedBreachesAfterCurrent?: Array<{
    server: ServerId;
    cannotAccessRoot?: boolean;
  }>;
  /** Breaker ids that broke a subroutine this run (Mayfly). */
  breakersThatBroke?: string[];
  /** True once the Runner has begun breach of the attacked server this run. */
  breached?: boolean;
  /**
   * Letheia-class: card instance ids whose `onApproachServerOncePerRun`
   * trigger already fired this run.
   */
  approachServerTriggersFiredIds?: string[];
  /** Wake Implant: waiting on may-spend-power choice before building RD access. */
  wakeImplantPending?: boolean;
  /** Wake Implant: choice already resolved this breach. */
  wakeImplantResolved?: boolean;
  /** Mercury: waiting on may-bonus-access choice before building HQ/R&D access. */
  mercuryBreachPending?: boolean;
  /** Medium: resume beginBreachAccess after virus bonus-access choice. */
  mediumBreachPending?: boolean;
  /** Snitch: once-per-run expose ability already used. */
  snitchUsedThisRun?: boolean;
  /**
   * Midori-class: card instance ids whose `onApproachIceOncePerRun`
   * trigger already fired this run.
   */
  approachIceTriggersFiredIds?: string[];
  /** Cupellation: waiting on HQ-breach hosted-Corp bonus choice. */
  cupellationBreachPending?: boolean;
  /** Cupellation: already offered HQ-breach bonus this breach. */
  cupellationBreachResolved?: boolean;
  /** Akiko-class: waiting on onBreachRd psi/choice before building R&D access. */
  onBreachRdPending?: boolean;
  /** Akiko-class: onBreachRd already fired this breach. */
  onBreachRdResolved?: boolean;
  /** Heliamphora: hosted-instead ability used this Archives breach. */
  heliamphoraHostInsteadUsedThisBreach?: boolean;
  /** Heliamphora: card id awaiting host-instead vs access choice. */
  pendingHeliamphoraAccessCardId?: string;
  /** Pretty Mary: already offered may-bonus this breach. */
  prettyMaryBreachResolved?: boolean;
  /** Additional ice rez cost during this run (Tread Lightly). */
  iceRezCostIncrease?: number;
  /** Running Interference: pay additional rez equal to printed rez cost. */
  iceRezAdditionalCostEqualsPrintedRezCost?: boolean;
  /** Bribery: first approached unrezzed ice +X rez (X = bribery play cost). */
  briberyFirstIceAdditionalRezEqualsX?: boolean;
  /** Bribery: additional rez cost remaining for first unrezzed ice this run. */
  firstApproachedIceAdditionalRezCost?: number;
  /** Bribery: first-ice additional rez already applied/consumed. */
  briberyFirstIceRezConsumed?: boolean;
  /** Spendable credits from a run event (Overclock). */
  eventCredits?: number;
  /** Agendas stolen during this run (Amaze). */
  agendasStolenThisRun?: number;
  /** The Turning Wheel: named central for +1 access this run. */
  tlmTurningWheelBonusServer?: "hq" | "rd";
  /** The Noble Path / similar: prevent all Runner damage this run. */
  preventAllDamageThisRun?: boolean;
  /** Dedicated Neural Net: Corp chooses which HQ cards are accessed. */
  tlmCorpChoosesHqAccess?: boolean;
  /** Ansel: Runner cannot steal or trash Corp cards this run. */
  cannotStealOrTrash?: boolean;
  /**
   * When true, `beginBreachAccess` keeps existing `accessCandidates` /
   * `accessRemaining` (Pinhole replace-breach preset).
   */
  accessCandidatesPreset?: boolean;
  kitsuneIceToTrashAtBreachEnd?: string;
  bannedProgramInstanceIds?: string[];
  /** Card id that started this run (event/ability); used for on-success effects. */
  runSourceId?: string;
  /** Effect to fire when this run succeeds (from run event / ability). */
  onSuccessfulRunEffect?: Effect;
  /**
   * Place this many power counters on runSource whenever a subroutine
   * resolves (Raindrops Cut Stone).
   */
  addPowerCounterOnSubroutineResolve?: number;
  /** Effect to fire when this run ends (from run event); source = runSourceId. */
  onRunEndEffect?: Effect;
  /** Persistent run-end tag effects (Amaze), survive trash during the run. */
  persistentTagsIfAgendaStolen?: number;
  /** After a sub offers jack-out, Runner must choose jack_out or continue. */
  pendingJackOutOffer?: boolean;
  /** Feint: bypass the next N ice encounters. */
  bypassEncountersRemaining?: number;
  /** Inazuma: next encounter cannot break subroutines on encountered ice. */
  inazumaLockNextEncounter?: boolean;
  /** Inside Job: bypass the first ice encounter. */
  bypassFirstEncounter?: boolean;
  /** Recon: may jack out at first ice encounter. */
  mayJackOutOnFirstIceEncounter?: boolean;
  reconJackOutOffered?: boolean;
  /** Spear Phishing: bypass the innermost ice protecting the attacked server. */
  bypassInnermostEncounter?: boolean;
  /** Ice instance ids rezzed during this run (Run Amok). */
  iceRezzedThisRunIds?: string[];
  /** Ice ids bypassed this run. */
  bypassedIceIds?: string[];
  /**
   * Ice instance ids passed this run (order preserved; same ice may appear
   * more than once). Used by Into the Depths–class exclusive choices.
   * Only counted when ice is still in the position at pass (CR pass ice;
   * NSG Into the Depths ruling on uninstall-during-encounter).
   */
  passedIceIds?: string[];
  /** Most recent unrezzed ice id passed (False Echo-class). */
  lastPassedUnrezzedIceId?: string;
  /** Copycat: last rezzed ice passed this run. */
  lastPassedRezzedIceId?: string;
  /** Sneakdoor: redirect success to this server. */
  redirectSuccessTo?: "hq" | "rd" | "archives";
  /** Maintenance Access: after Archives ice, approach HQ instead. */
  redirectApproachArchivesToHq?: boolean;
  archivesApproachRedirectUsed?: boolean;
  /**
   * Baker: after Archives ice, may pay this many stealth credits to approach
   * HQ or R&D instead.
   */
  mayRedirectApproachArchivesToHqOrRdPayingStealthCredits?: number;
  /** Aircheck: cannot spend or lose credits from the credit pool this run. */
  blockCreditPoolSpendAndLose?: boolean;
  /** Shred: first ETR prevention already consumed this run. */
  shredPreventFirstEndTheRun?: boolean;
  shredFirstEndTheRunUsed?: boolean;
  /** Once-per-run paid abilities used this run (`cardId:abilityId`). */
  usedAbilitiesThisRun?: string[];
  /** Once-per-encounter paid abilities used this encounter. */
  usedAbilitiesThisEncounter?: string[];
  /**
   * Attini-class: Runner cannot spend credits while a subroutine is
   * resolving (includes nested pendingChoice from that sub).
   */
  runnerCannotSpendCredits?: boolean;
  /** RSVP: Runner cannot spend credits for remainder of this run. */
  runnerCannotSpendCreditsForRun?: boolean;
  /** Blackmail: Corp cannot rez ice during this run. */
  forbidCorpRezIceDuringRun?: boolean;
  /**
   * Clicks gained by the Runner during this run (Pichação).
   * Incremented by `gain_clicks` while a run is active.
   */
  clicksGainedThisRun?: number;
  /** Ryō Phoenix: a subroutine resolved during this run. */
  subroutineResolvedThisRun?: boolean;
  /**
   * S-Dobrado: at the second ice encounter, Runner may spend [click] to bypass.
   */
  bypassSecondEncounterForClick?: boolean;
  /**
   * Alarm Clock: at the first ice encounter, Runner may spend this many
   * clicks to bypass.
   */
  bypassFirstEncounterForClicks?: number;
  /** Ice encounters begun this run (S-Dobrado second-encounter gate). */
  iceEncounteredCount?: number;
  /** Baklan: onFirstEncounterEachRun already fired this run. */
  onFirstEncounterEachRunFired?: boolean;
  /** Ice derezzed by Window of Opportunity at run begin. */
  eventDerezzedIceId?: string;
  mayRezEventDerezzedIceOnRunEndIgnoreCosts?: boolean;
  /** Window: pending derez choice when run begins. */
  derezProtectingIceOnRunBegin?: boolean;
  /** Ice rezzed during the approach to the current encounter (Nasir). */
  iceRezzedDuringApproachId?: string;
  /** Sisyphus: ice id awaiting Corp reencounter choice. */
  pendingReencounterIceId?: string;
  /** Sisyphus / Formicary / Ganked!: ice id to reencounter after choice. */
  reencounterIceId?: string;
  /**
   * Ganked!-class: after a mid-access forced encounter resolves, resume the
   * suspended access-a-card walk instead of jacking out / approaching server.
   */
  resumeAccessAfterReencounter?: boolean;
  /**
   * Konjin-class: after a nested forced encounter ends, resume the encounter
   * with this ice (if still rezzed) without re-firing onEncounter.
   */
  resumeEncounterIceId?: string;
  /** Stashed encounter state for `resumeEncounterIceId` (Konjin). */
  suspendedEncounter?: EncounterState;
  /**
   * Force the next encounter to use this ice id (may protect another server).
   * Consumed when the encounter begins.
   */
  forceEncounterIceId?: string;
  /** Skip onEncounter once when resuming a suspended parent encounter. */
  skipOnEncounterOnce?: boolean;
  /**
   * Awakening Center: upgrade ids whose "pass all ice protecting this
   * server" trigger has already fired this run (fires once per run, even
   * though the run re-approaches the server after a forced encounter ends).
   */
  awakeningCenterTriggeredIds?: string[];
  /**
   * Awakening Center: hosted ice ids rezzed and force-encountered this run;
   * trashed (not just derezzed) when the run ends.
   */
  awakeningCenterHostedIceIds?: string[];
  /**
   * Boomerang-class delayed conditional titles: on successful run end, may
   * shuffle one heap card with each title into the stack (CR 9.10 lingering).
   */
  mayShuffleTitlesFromHeapOnSuccessfulRunEnd?: string[];
  /** Skip breach after success (Retrieval Run / Security Testing). */
  skipBreach?: boolean;
  /** Immolation Script: once this run may trash rezzed copy instead of accessing Archives ice. */
  immolationScriptAccessReplace?: boolean;
  /** Pending Archives access card awaiting Immolation Script choice. */
  pendingImmolationAccessCardId?: string;
  accessFromBottomOfRd?: boolean;
  trashFirstFullyBrokenSubtype?: string;
  trashFirstFullyBrokenSubtypeUsed?: boolean;
  /** Demolition Run-class: access → trash for 0¢ during this run. */
  accessTrashFree?: boolean;
  /** Chum: next ice encounter gets strength bonus + conditional net on end. */
  chumNextIce?: { strengthBonus: number; netDamageIfNotFullyBroken: number };
  /** Marker: next encountered ice gains an extra ETR subroutine after printed subs. */
  markerExtraEtrNextIce?: boolean;
  /** Paintbrush: painted ice id until end of next run. */
  paintbrushIceId?: string;
  /** Chum: active encounter tracking for not-fully-broken damage. */
  chumActiveEncounter?: {
    iceId: string;
    netDamageIfNotFullyBroken: number;
  };
  /**
   * Sensei: source ice ids whose ETR-on-other-ice-for-run ability is active.
   * Cleared when the run ends.
   */
  senseiEtrSourceIds?: string[];
  /** On success instead of breach, may install a program from heap ignoring costs. */
  skipBreachInstallProgramFromHeap?: boolean;
  /**
   * During this run, cards in the root of the attacked server lose all abilities
   * (Light the Fire!).
   */
  blankAttackedServerRoot?: boolean;
  /**
   * Direct Access: both players' identities lose all abilities for the
   * duration of this run.
   */
  blankIdentities?: boolean;
  /**
   * Whistleblower: named agenda title; accessing that title this run steals
   * ignoring all costs.
   */
  whistleblowerNamedTitle?: string;
  /**
   * Always Have a Backup Plan: auto-bypass this ice id when encountered on
   * the second run.
   */
  backupPlanBypassIceId?: string;
  /** Backup Plan second run: ignore additional costs to initiate. */
  backupPlanIgnoreAdditionalCosts?: boolean;
  /** Last ice encountered this run (feeds Backup Plan). */
  lastEncounteredIceId?: string;
  /** True after any ice is derezzed during this run (Stegodon). */
  iceDerezzedThisRun?: boolean;
  /** Only these card ids may be accessed on attacked server (Adrian). */
  accessOnlyCardIds?: string[];
  /** These card ids cannot be accessed this run (Adrian). */
  forbiddenAccessCardIds?: string[];
  /** Arissana: program installed via identity ability this run. */
  identityInstalledProgramId?: string;
  /** Trash identityInstalledProgramId at run end unless this subtype. */
  identityInstalledProgramTrashUnlessSubtype?: string;
}

export type ForbiddenAction =
  | "jack_out"
  | "basic_run"
  | "basic_gain_credit"
  | "basic_draw"
  | "basic_install"
  | "basic_trash_resource"
  | "basic_remove_tag"
  | "rez_ice"
  | "break_subroutine"
  | "play_operation"
  | "play_event";

export interface RuleCite {
  number: string;
  id: string;
}

/** Active cannot / forbid effects (CR 1.2.2). */
export interface Restriction {
  forbid: ForbiddenAction;
  cite: RuleCite;
  source: string;
}

export type CheckpointKind = "cost" | "timing" | "priority_window";

/** Nested resolve / cost / priority checkpoint frame (CR 1.16.3 / 9.2.4 / 9.11.1b). */
export interface CheckpointFrame {
  id: string;
  kind: CheckpointKind;
  label: string;
  cites: RuleCite[];
  /** What opened this frame (action type or step key). */
  openedBy: string;
}

/**
 * Nested paid-ability / priority window frame (CR 9.2.4 / 9.2.4d).
 * Window closes after two consecutive passes (or one pass when the opponent
 * has no legal window actions — auto-pass).
 */
export interface PriorityWindowFrame {
  id: string;
  stepKey: string;
  nestDepth: number;
  consecutivePasses: number;
  priorityHolder: Side;
  checkpointId: string;
}

export interface TraceState {
  id: string;
  sourceId: string;
  baseStrength: number;
  corpSpent: number;
  /**
   * Credits the Runner spent to raise link strength this attempt
   * (CR 10.8.3). Name kept for API stability.
   */
  runnerLinkSpent: number;
  onSuccess: Effect;
  onFailure?: Effect;
}

/** Interactive psi game (Adrian Seis; v0 sequential bids). */
export interface PsiState {
  id: string;
  sourceId: string;
  maxBid: number;
  runnerBid: number | null;
  corpBid: number | null;
  ifBidsDiffer: Effect;
  ifBidsMatch: Effect;
}

/** Opened for a `tag_interrupt_paw` (Decoy-class avoid/prevent tags). */
export interface PendingTags {
  remaining: number;
  sourceId: string;
}

/**
 * Opened for an `end_the_run_interrupt_paw` (Lucky Charm-class). Corp card
 * ability attempted to end the run; interrupt may prevent it.
 */
export interface PendingEndTheRun {
  sourceId: string;
  /** True when the ETR came from a Corp card ability (subs count). */
  fromCorpCardAbility: boolean;
}

/**
 * Opened for a `break_interrupt_paw` (Tyr's Hand-class). A subroutine on
 * bioroid ice protecting a server would be broken; the Corp may rez an
 * eligible unrezzed upgrade and/or use a `break_interrupt_paw` paid ability
 * (typically `[trash]`) to prevent it. `prevented` is set by the
 * `prevent_pending_subroutine_break` Effect IR leaf; the dispatcher then
 * finalizes (does not mark the subroutine broken) instead of completing it.
 */
export interface PendingSubroutineBreak {
  iceId: string;
  subIndex: number;
  prevented?: boolean;
}

/**
 * Remaining effects from a `seq` that paused on pendingDamage / pendingTags /
 * pendingChoice (Snare tag→damage chain; CR 9.1.2a).
 */
export interface PendingEffectContinuation {
  sourceId: string;
  effects: import("../effects/ir.js").Effect[];
}

export interface PendingDamage {
  type: DamageType;
  remaining: number;
  sourceId: string;
  /**
   * Runner may prevent by losing all remaining clicks (Mr. Hendrik).
   * When set, free `prevent_damage` is not offered — only
   * `prevent_damage_lose_all_clicks` (if clicks > 0) and `accept_damage`.
   */
  preventByLoseAllClicks?: boolean;
  /**
   * Opened for a `damage_interrupt_paw` (AirbladeX-class). Free
   * `prevent_damage` is not offered — only interrupt paid abilities and
   * `accept_damage` (CR 9.9.3a / 9.9.5).
   */
  interruptPawOnly?: boolean;
  /**
   * Sources that already resolved a once-per-instance damage interrupt
   * (Prāna Condenser; CR 9.12.2b) for this pendingDamage open.
   */
  interruptUsedSourceIds?: string[];
}

/** Corp chooses which program to trash (e.g. Rototurret). */
export interface PendingTrashProgram {
  sourceId: string;
  candidates: string[];
}

/** Corp resolves sabotage N by choosing HQ cards; remainder from R&D top (CR §10.12). */
export interface PendingSabotage {
  sourceId: string;
  amount: number;
}

/** Host chooses among effect IR options (Ballista, Funhouse, etc.). */
export interface PendingChoice {
  sourceId: string;
  chooser: Side;
  options: Array<{ id: string; label: string; effect: Effect }>;
}

/**
 * Continuation for exclusive multi-choice scaled by ice passed this run
 * (Into the Depths). `pendingChoice` holds the current pick; after each
 * resolution (including nested charge/search choices), remaining unused
 * options are re-offered until `remaining` is 0.
 */
export interface PendingExclusiveChoices {
  sourceId: string;
  chooser: Side;
  options: Array<{ id: string; label: string; effect: Effect }>;
  remaining: number;
  usedIds: string[];
}

/**
 * Timing cursor labeled with CR appendix / step ids.
 * Appendix labels from timing-structures.json (11.2 / 11.3 / 11.4 / 11.5).
 */
export interface TimingCursor {
  structure: "corp_turn" | "runner_turn" | "run" | "breach";
  /** Stable YAML / deep-link id, e.g. sec_appendix_timing_structure_corps_turn_1_a */
  stepId: string;
  /** Printed appendix number when known, e.g. 11.2_1_a */
  stepNumber: string;
  label: string;
}

export interface GameConfig {
  /** Agenda points required to win (default 7). */
  agendaPointsToWin: number;
  /**
   * When true, mark `done` after the first Runner turn completes
   * (legacy vertical-slice demos). Library `createGame` sets false.
   */
  stopAfterFirstCycle: boolean;
}

export interface GameState {
  turnNumber: number;
  activeSide: Side;
  /** Derived from the timing graph node (kept for describe / filters). */
  turnPhase: TurnPhase;
  corp: PlayerState;
  runner: PlayerState;
  cards: Record<string, CardInstance>;
  servers: Record<ServerId, Server>;
  nextRemoteNumber: number;
  /** PAD Factory: card ids that cannot be scored until next Corp turn begins. */
  bfCannotScoreUntilNextCorpTurn?: string[];
  run: RunState | null;
  /**
   * Bad publicity fund — Runner-controlled credits outside the credit pool,
   * filled at run initiation and emptied at run end (CR §10.6.2 / §10.6.3).
   */
  badPublicityFund: number;
  /** Explicit step-graph key, e.g. corp.takeAction */
  timingKey: string;
  timing: TimingCursor;
  /** Nested checkpoint stack (innermost last). */
  checkpoints: CheckpointFrame[];
  /** Nested priority / PAW stack (innermost last). */
  priorityStack: PriorityWindowFrame[];
  /** Active cannot effects. */
  restrictions: Restriction[];
  /** Pending interactive trace, if any. */
  trace: TraceState | null;
  /** Pending interactive psi game, if any. */
  psi: PsiState | null;
  /** Pending damage awaiting prevention, if any. */
  pendingDamage: PendingDamage | null;
  /** Zaibatsu-class expose interrupt. */
  pendingExpose: {
    cardId: string;
    phase: "may_rez" | "interrupt";
    offeredRezIds?: string[];
  } | null;
  pendingTrashPrevent: { cardId: string } | null;
  /** When true, skip trash-prevent interrupt (accepting pending trash). */
  suppressTrashPrevent?: boolean;
  pendingTags: PendingTags | null;
  /**
   * Pending end-the-run awaiting interrupt (Lucky Charm-class).
   */
  pendingEndTheRun: PendingEndTheRun | null;
  /** Pending subroutine-break interrupt (Tyr's Hand-class). */
  pendingSubroutineBreak: PendingSubroutineBreak | null;
  /** Remaining seq effects after an interrupt pause. */
  pendingEffectContinuation: PendingEffectContinuation | null;
  /** Pending Corp choice of program to trash. */
  pendingTrashProgram: PendingTrashProgram | null;
  /** Pending sabotage N — Corp chooses HQ cards (CR §10.12). */
  pendingSabotage: PendingSabotage | null;
  /** Pending effect-IR choice (chooser must resolve). */
  pendingChoice: PendingChoice | null;
  /**
   * Exclusive multi-choice scaled by ice passed this run (Into the Depths).
   * Survives nested pendingChoice (charge / search install) until remaining is 0.
   */
  pendingExclusiveChoices: PendingExclusiveChoices | null;
  /**
   * After `start_run_on_mark` IR: host should start a run on the mark.
   * Cleared when the run begins or when there is no mark.
   */
  pendingStartRunOnMark: { sourceId: string } | null;
  /** Trick Shot-class: start a follow-up run on a chosen server. */
  pendingStartRun: {
    sourceId: string;
    serverId: ServerId;
    bypassFirstEncounterForClicks?: number;
  } | null;
  /**
   * Cataloguer-class: begin a standalone post-run-style breach of this server
   * (not a successful run). Cleared when the breach shell starts.
   */
  pendingStandaloneBreach: {
    sourceId: string;
    serverId: ServerId;
    /** Mind's Eye: exclude server-root cards from this breach. */
    cannotAccessRoot?: boolean;
  } | null;
  /**
   * Hangeki-class: out-of-run access of one installed Corp card via a
   * post-run-style breach shell with a single preset candidate.
   */
  pendingStandaloneCardAccess: {
    sourceId: string;
    cardId: string;
    serverId: ServerId;
  } | null;
  /**
   * After run-event onPlay choice (e.g. Reprise return-to-HQ): start this run
   * once the choice resolves. Cleared when the run begins.
   */
  pendingRunEventStart: { sourceId: string; serverId: ServerId } | null;
  /**
   * Play/ability spent a click but deferred `afterBasicAction` for a pending
   * choice (e.g. Carpe Diem may-run). Cleared when the choice resolves.
   */
  deferAfterBasicAction: boolean;
  /**
   * Agenda awaiting score after `scoreAdditionalCost` resolves (Azef).
   * Cleared when scoring completes or the cost cannot be paid.
   */
  pendingScoreAgendaId: string | null;
  /** Agenda awaiting steal after steal additional costs (Daniela). */
  pendingStealAgendaId: string | null;
  /** Card awaiting trash_accessed after trashAdditionalCost (Daniela). */
  pendingTrashAccessedCardId: string | null;
  /** Ice awaiting rez after rezAdditionalCost (Valentão). */
  pendingRezCardId: string | null;
  /**
   * Server currently designated as the mark (CR §10.11).
   * Lingering effect; cleared at end of turn.
   */
  markServerId: ServerId | null;
  /**
   * Pending allotted-click delta applied on the Runner's next gain-clicks step
   * (Hypoxia −1). Cleared when applied.
   */
  runnerAllottedClicksDeltaNextTurn: number;
  /** Hypoxia-class pending Corp allotted clicks (Aggressive Trendsetting +1). */
  corpAllottedClicksDeltaNextTurn: number;
  /**
   * Saraswati-class: card ids that cannot be scored or rezzed until the next
   * Corp turn begins (survives Runner turn; cleared in beginCorpTurnFlags).
   */
  cannotScoreOrRezUntilNextCorpTurnCardIds: string[];
  /** Turn-scoped flags for conditional abilities. */
  turn: TurnBookkeeping;
  /** Cards removed from the game (Steve Cambridge). */
  removedFromGame: string[];
  /** Winner when the game has ended. */
  winner: Side | null;
  /** Win reason for hosts. */
  winReason: "corp_agenda" | "runner_agenda" | "flatline" | "corp_alternate" | "runner_alternate" | null;
  config: GameConfig;
  log: string[];
  /** True when the game (or demo cycle) has finished. */
  done: boolean;
}

export type InstallDestination =
  | { kind: "new_remote" }
  | { kind: "remote_root"; serverId: ServerId }
  | { kind: "protect"; serverId: ServerId }
  | { kind: "rig" }
  | { kind: "host_ice"; iceId: string }
  | { kind: "host_card"; hostId: string }
  /** Awakening Center: install bioroid ice hosted on this upgrade, free. */
  | { kind: "host_upgrade"; hostId: string };

export type Action =
  | { type: "pass_window" }
  | { type: "basic_gain_credit" }
  | { type: "basic_trash_resource"; cardId: string }
  | { type: "basic_draw" }
  | {
      type: "basic_install";
      cardId: string;
      destination: InstallDestination;
      /** Patchwork: trash this grip card to discount the install. */
      trashGripForDiscountCardId?: string;
    }
  | { type: "basic_run"; serverId: ServerId }
  | { type: "basic_remove_tag" }
  | { type: "play_operation"; cardId: string }
  | {
      type: "play_event";
      cardId: string;
      serverId?: ServerId;
      /** Patchwork: trash this grip card to discount the play. */
      trashGripForDiscountCardId?: string;
    }
  | { type: "advance"; cardId: string }
  | { type: "score_agenda"; cardId: string }
  | { type: "rez_ice"; cardId: string }
  | {
      type: "break_subroutine";
      breakerId: string;
      subIndex: number;
    }
  | {
      /** Spend [click] to break a subroutine on bioroid ice (card text). */
      type: "break_bioroid_subroutine";
      subIndex: number;
    }
  | {
      /**
       * Bioroid 2.0-class: spend [click] × N to break up to N subroutines
       * on this bioroid in one paid ability (Heimdall/Ichi/Viktor 2.0).
       */
      type: "break_bioroid_subroutines";
      subIndexes: number[];
    }
  | {
      type: "use_paid_ability";
      cardId: string;
      abilityId: string;
      serverId?: ServerId;
    }
  | { type: "use_identity_ability"; abilityId: string }
  | { type: "continue_run" }
  | { type: "jack_out" }
  | { type: "access_card"; cardId: string }
  | { type: "steal_agenda"; cardId: string }
  | { type: "trash_accessed"; cardId: string }
  | {
      /** Salsette Slums: pay trash cost to RFG accessed card (once per turn). */
      type: "access_rfg_paying_trash_cost";
      cardId: string;
      slumsId: string;
    }
  | { type: "finish_access" }
  | { type: "finish_breach" }
  | {
      /** Carnivore: trash N from grip to trash the accessed card. */
      type: "access_trash_from_grip";
    }
  | {
      /** Imp: spend 1 virus counter to trash the accessed card. */
      type: "access_trash_with_virus";
      cardId: string;
    }
  | {
      type: "access_trash_free";
      cardId: string;
    }
  | { type: "accept_expose" }
  | { type: "accept_installed_trash" }
  | {
      /**
       * Lampades: spend 1 power + pay printed rez/play cost from stealth
       * to trash the accessed card.
       */
      type: "access_trash_paying_printed_cost_from_stealth";
      cardId: string;
      lampadesId: string;
    }
  | {
      /** Gourmand: trash self to trash accessed non-agenda, then draw 1. */
      type: "access_trash_self_non_agenda_draw";
      cardId: string;
      gourmandId: string;
    }
  | {
      /** Cupellation: pay credits to host the accessed non-agenda faceup. */
      type: "access_host_non_agenda_faceup";
      cardId: string;
    }
  | {
      /** Film Critic: host accessed agenda on this resource. */
      type: "access_host_agenda_on_film_critic";
      cardId: string;
      hostId: string;
    }
  | { type: "boost_trace"; credits: number }
  | { type: "spend_link"; amount: number }
  | { type: "resolve_trace" }
  | { type: "psi_runner_bid"; amount: number }
  | { type: "psi_corp_bid"; amount: number }
  | { type: "prevent_damage"; amount: number }
  /** Prevent pending damage by losing all remaining clicks (Mr. Hendrik). */
  | { type: "prevent_damage_lose_all_clicks" }
  | { type: "accept_damage" }
  | { type: "accept_tags" }
  | { type: "accept_end_the_run" }
  | { type: "choose_trash_program"; cardId: string }
  | {
      /** Resolve pending sabotage: trash these HQ cards; remainder from R&D top. */
      type: "resolve_sabotage";
      hqCardIds: string[];
    }
  | { type: "choose_option"; optionId: string }
  | { type: "rez_asset"; cardId: string }
  | { type: "discard_to_hand_size" };

/** Host intent — same as Action for the pure library API. */
export type Intent = Action;

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; cites: RuleCite[] };

/** Side-filtered public view for future online hosts. */
export interface PublicView {
  viewer: Side;
  turnNumber: number;
  activeSide: Side;
  timingKey: string;
  timing: TimingCursor;
  done: boolean;
  winner: Side | null;
  winReason: GameState["winReason"];
  self: {
    clicks: number;
    credits: number;
    tags: number;
    brainDamage: number;
    link: number;
    maxHandSize: number;
    hand: string[];
    handCount: number;
    deckCount: number;
    discard: string[];
    score: string[];
    scorePoints: number;
    rig: string[];
    identityId: string;
  };
  opponent: {
    clicks: number;
    credits: number;
    tags: number;
    brainDamage: number;
    link: number;
    maxHandSize: number;
    handCount: number;
    deckCount: number;
    discardFaceup: string[];
    score: string[];
    scorePoints: number;
    rig: string[];
    identityId: string;
  };
  servers: Array<{
    id: ServerId;
    kind: Server["kind"];
    ice: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      strength: number | null;
    }>;
    root: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      type: CardType | null;
      advancementTokens: number | null;
    }>;
  }>;
  run: RunState | null;
  trace: TraceState | null;
  pendingDamage: PendingDamage | null;
  pendingTags: PendingTags | null;
  pendingEndTheRun: PendingEndTheRun | null;
  pendingEffectContinuation: PendingEffectContinuation | null;
  pendingTrashProgram: PendingTrashProgram | null;
  pendingSabotage: PendingSabotage | null;
  pendingChoice: PendingChoice | null;
  pendingExclusiveChoices: PendingExclusiveChoices | null;
  pendingStartRunOnMark: { sourceId: string } | null;
  pendingStartRun: {
    sourceId: string;
    serverId: ServerId;
    bypassFirstEncounterForClicks?: number;
  } | null;
  pendingScoreAgendaId: string | null;
  /** Ice awaiting rez after rezAdditionalCost (Valentão). */
  pendingRezCardId: string | null;
  markServerId: ServerId | null;
  priorityStack: PriorityWindowFrame[];
  log: string[];
}

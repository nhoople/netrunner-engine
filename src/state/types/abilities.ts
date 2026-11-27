/** Ability shapes a card carries: subroutines, breaker abilities, paid abilities and their costs. */

import type { Effect } from "../../effects/ir.js";
import type { CardType, DamageType } from "./shared.js";

/** Gained-subroutine continuous declaration (L2 / W1 payload shape). */
export type ContinuousGainedSubDecl =
  | {
      kind: "fatuma_lose_click";
      position?: "before";
      subroutine?: { id: string; text: string; effect: Effect };
    }
  | {
      kind: "sub_boost_etr";
      position?: "after";
      subroutine?: { id: string; text: string; effect: Effect };
    }
  | {
      kind: "wetwork_hosted_before";
      position?: "before";
      subroutines?: Array<{ id: string; text: string; effect: Effect }>;
    }
  | {
      kind: "hq_protect_subs";
      position?: "after";
      subroutines: Array<{ id: string; text: string; effect: Effect }>;
    }
  | {
      kind: "archives_faceup_per";
      position?: "before";
      type: string;
      subtype: string;
      per: number;
      subroutine: { id: string; text: string; effect: Effect };
    }
  | {
      kind: "per_advancement";
      position?: "after";
      subroutine: { id: string; text: string; effect: Effect };
    }
  /** Ireress: one subroutine per Corp bad publicity, after printed. */
  | {
      kind: "per_bad_publicity";
      position?: "after";
      subroutine: { id: string; text: string; effect: Effect };
    }
  | {
      kind: "per_rezzed_subtype";
      position?: "after";
      subtype: string;
      subroutine: { id: string; text: string; effect: Effect };
    }
  | {
      kind: "grip_size_on_encounter";
      position?: "after";
      subroutine: { id: string; text: string; effect: Effect };
    }
  | {
      kind: "etr_per_rezzed_asset";
      position?: "before";
      subroutine?: { id: string; text: string; effect: Effect };
    };

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
  /**
   * Alias, Breach, Passport: "This program cannot interface with ice
   * protecting a remote server" (CR 9.3.6c).
   */
  cannotInterfaceRemoteIce?: boolean;
  /** Wyrm-class: only break when encountered ice effective strength ≤ this. */
  breakRequiresIceStrengthLte?: number;
  /** Sadyojata / Deva: only break ice with at least this many subtypes. */
  breakRequiresIceSubtypeCountGte?: number;
  /** Vamadeva: only break ice with exactly this many printed subroutines. */
  breakRequiresIceExactSubroutineCount?: number;
  /** Aghora: only break ice with rez cost ≥ this. */
  breakRequiresIceRezCostGte?: number;
  /** Eater: after breaking a sub, cannot access cards for the rest of the run. */
  breakPreventsCardAccessForRun?: boolean;
}

/**
 * Interrupt windows (CR 9.2.9) opened before certain effects resolve.
 * These are not paid-ability windows (PAWs), despite sharing the same
 * `windows` / pending-ability plumbing.
 */
export type InterruptWindow =
  | "damage_interrupt"
  | "tag_interrupt"
  | "when_encountered_interrupt"
  | "trace_interrupt"
  /**
   * Lucky Charm-class: interrupt before a Corp card ability ends the run.
   */
  | "end_the_run_interrupt"
  | "expose_interrupt"
  | "trash_interrupt"
  /**
   * Tyr's Hand-class: interrupt before a subroutine on bioroid ice protecting
   * a server is marked broken. Opens `PendingSubroutineBreak`.
   */
  | "break_interrupt"
  /**
   * System Seizure-class: interrupt before an icebreaker strength increase
   * resolves. Opens `PendingStrengthIncrease`.
   */
  | "strength_increase_interrupt";

export type PaidAbilityWindow =
  | "approach_paw"
  | "approach_server_paw"
  | "encounter_paw"
  | "corp_action_paw"
  | "runner_action_paw"
  /** CR 11.4_1_e, after the run begins: (P) (R). */
  | "run_initiate_paw"
  /** CR 11.4_4_b, after passing ice and before jack out: (P). */
  | "run_movement_paw"
  /** CR 11.4_4_e, after moving inward: (P) (R). */
  | "run_after_move_paw"
  | InterruptWindow
  /** Completing non-PAW / non-phase-begin windows at Run Ends (CR 6.8.2c). */
  | "other_priority_window";

/** Cost model for paid abilities / play costs (CR 1.16). */
export interface CostSpec {
  /** The [click] that begins the cost; such an ability is an action (CR 5.2.1). */
  clicks?: number;
  /**
   * "Lose [click]" as a cost. Losing is not spending (CR 1.11.3b), so this
   * cost does not begin with a [click] symbol and is not an action (CR 5.2.1,
   * 5.2.1a). Bioroid ice such as Markus 1.0 write it.
   */
  loseClicks?: number;
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
   * Spend hosted advancement counters from this card as a cost
   * (Drago Ivanov–class paid abilities).
   */
  advancementCounters?: number;
  /** Trash this card as a cost. */
  trashSelf?: boolean;
  /** Forfeit 1 scored agenda as a cost (Data Dealer). */
  forfeitAgenda?: boolean;
  /**
   * Forfeit this agenda as a cost (False Lead). Payable only while it is in
   * its controller's score area (CR 1.16.1, 8.2.5).
   */
  forfeitSelf?: boolean;
  /**
   * Remove this card from the game as a cost (The Back).
   * Hosted counters remain readable on the card instance after RFG.
   */
  rfgSelf?: boolean;
  /** Trash this many cards from HQ (Corp). */
  trashFromHq?: number;
  /** Trash this many cards from grip (Runner). */
  trashFromGrip?: number;
  /** Citadel Sanctuary: trash entire grip (legal when empty). */
  trashEntireGrip?: boolean;
  /** Monolith: trash a program from grip as a cost (chooses first found). */
  trashProgramFromGrip?: boolean;
  /**
   * Dummy Box: trash 1 card from the grip of the same type as the installed
   * card whose trash is pending. Not payable without one (CR 1.16.1).
   */
  trashFromGripSameTypeAsPendingTrash?: boolean;
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
  /** Zer0: suffer net damage as a cost. */
  netDamage?: number;
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
  /** Houdini: at least this many credits of the cost from stealth. */
  minCreditsFromStealth?: number;
  /**
   * Simulchip: as an additional cost, trash 1 installed program.
   * Ignored when `installedProgramTrashedThisTurn` is already set.
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
    "any" | "central" | "hq_rd" | "rd" | "hq" | "archives" | "mark" | "remote";
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
  /** Deep Data Mining: bonus access = min(unused MU, this cap). */
  bonusAccessUnusedMuCapped?: number;
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
  /** Credit Crash: trash first non-agenda accessed; Corp may pay rez/play cost to prevent. */
  trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent?: boolean;
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
  /** Compile: first ice encounter during this run. */
  onFirstEncounterThisRun?: Effect;
  /**
   * Pushing the Envelope: if grip ≤ gripMax at run start, icebreakers get
   * +bonus strength until the run ends.
   */
  icebreakerStrengthBonusIfGripLte?: { gripMax: number; bonus: number };
  /**
   * Lean and Mean: if installed programs ≤ programsMax at run start,
   * icebreakers get +bonus strength until the run ends.
   */
  icebreakerStrengthBonusIfInstalledProgramsLte?: {
    programsMax: number;
    bonus: number;
  };
  /** Diana's Hunt */
  onEncounterMayInstallProgramFromGripIgnoringCosts?: boolean;
  trashProgramsInstalledThisWayOnRunEnd?: boolean;
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
  /** Omar Keung: choose HQ or R&D when run would succeed. */
  redirectSuccessChooseHqOrRd?: boolean;
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
  /**
   * Watch the World Burn: first non-agenda accessed this run is removed from
   * the game instead of remaining accessible.
   */
  rfgFirstNonAgendaAccess?: boolean;
  /**
   * Watch the World Burn: lasting effect — whenever the Runner accesses a
   * card with the RFG'd title for the rest of the game, RFG it.
   */
  lastingRfgCopiesOnAccess?: boolean;
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
  /**
   * Printed ability flag(s) (CR 9.3.6). Canonical source for once-per-turn,
   * threat N, access, interface, interrupt, and persistent.
   */
  flag?:
    | "access"
    | "interface"
    | "interrupt"
    | "persistent"
    | "once_per_turn"
    | { threat: number }
    | Array<
        | "access"
        | "interface"
        | "interrupt"
        | "persistent"
        | "once_per_turn"
        | { threat: number }
      >;
  /**
   * @deprecated Load folds this into `flag: "once_per_turn"` (CR 9.3.6g).
   * Callers must use `hasAbilityFlag`.
   */
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
   * @deprecated Load folds this into `flag: { threat: N }` (CR 9.3.6f).
   * Callers must use `threatValue`.
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
  /** First Responders */
  requireSufferedCorpDamageThisTurn?: boolean;
  /** Officer Frank: usable only if Runner suffered meat damage this turn. */
  requireSufferedMeatDamageThisTurn?: boolean;
  requireSufferedAnyDamageThisTurn?: boolean;
  requireNextPawAfterDamage?: boolean;
  /** When set, this ability starts a run (server chosen via action.serverId). */
  startsRun?: StartsRunSpec;
  /** Paid ability only legal while `state.run` is active (Arissana, AirbladeX). */
  requireDuringRun?: boolean;
  forbidDuringRun?: boolean;
  /** Usable only during the controller's own turn (Coalescence; CR 9.5.2f). */
  onlyDuringOwnTurn?: boolean;
  /** Usable only during a run on HQ (Panic Button). */
  onlyDuringHqRun?: boolean;
  /** Defense Construct: usable only during a run on Archives. */
  onlyDuringArchivesRun?: boolean;
  /**
   * Damage interrupt ability legal only while `pendingDamage.type` is one of
   * these (Plascrete meat; AirbladeX net). Omitting allows any damage type.
   */
  requirePendingDamageTypes?: DamageType[];
  /**
   * Trash interrupt that prevents only the Corp trashing (Dummy Box). Not
   * relevant when the Runner carries out the pending trash (CR 1.14.5,
   * 9.9.3a). A trash with no recorded actor is not excluded.
   */
  onlyCorpTrashes?: boolean;
  /**
   * Trash interrupt relevant only to a pending trash of these card types
   * (Sacrificial Construct: a program or a piece of hardware). CR 9.9.3a.
   */
  requirePendingTrashCardTypes?: CardType[];
  /**
   * Legal only the first time net damage would be dealt this run, and only
   * while this card is installed in the attacked server (CR 9.9.5a).
   */
  onlyFirstNetDamageWouldThisRun?: boolean;
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

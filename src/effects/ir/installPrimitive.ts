/**
 * Effect IR: the `Primitive` members whose procedure is install.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { Effect } from "./effect.js";

export type InstallPrimitive =
  | { kind: "install_caissa_from_zone_ignore_costs"; cardId: string }
  /** Leaf: install Muse-picked program (trojan → choose ice; else host on Muse). */
  | {
      kind: "install_picked";
      cardId: string;
      from: "stack" | "heap" | "grip";
    }
  /** Leaf: install Muse-picked trojan hosted on ice. */
  | {
      kind: "install_on_ice";
      cardId: string;
      iceId: string;
      from: "stack" | "heap" | "grip";
    }
  /** Leaf: install Muse-picked non-trojan hosted on Muse. */
  | {
      kind: "install_on_daemon";
      cardId: string;
      from: "stack" | "heap" | "grip";
    }
  /** Leaf: install a set-aside card ignoring costs (Wizard's Chest). */
  | { kind: "install_wizard_chest"; cardId: string }
  /** Leaf: spend clicks and install a heap hardware (Jeitinho bypass). */
  | {
      kind: "install_heap_paying_click";
      cardId: string;
      clickCost: number;
    }
  /**
   * Successful Field Test: iteratively install any number of cards from HQ
   * ignoring all costs (Done allowed at each step).
   */
  | { kind: "install_any_number_from_hq_ignore_costs" }
  /** Leaf: install+rez one card from `turn.rdLookedCards` ignoring costs. */
  | {
      kind: "install_rez_rd_looked_card_ignore_costs";
      cardId: string;
      /** false: install only, without rezzing (Architect). */
      rez?: boolean;
    }
  /** Leaf: install one card from `turn.rdLookedCards` paying installCost. */
  | { kind: "install_rd_looked_card_paying_costs"; cardId: string }
  /** Leaf: install one searched ice id on source server and rez (Tucana). */
  | {
      kind: "install_rez_rd_ice_on_source_server";
      cardId: string;
      totalDiscount: number;
      /** Portion of totalDiscount applied to the install cost (CR 1.16.2f). */
      installDiscount?: number;
    }
  /**
   * Install up to `max` cards from HQ into new remotes, place `advancements`
   * on each, and forbid scoring/rezzing those cards this turn (Mitosis).
   * Pays install costs; skips cards that cannot be afforded.
   */
  | {
      kind: "install_hq_new_remotes_with_advancements";
      max: number;
      advancements: number;
    }
  /**
   * Install 1 card from HQ or Archives. The Corp picks the card and its
   * destination (CR 1.15.2, 8.5.16b) and pays the install cost unless
   * `ignoreInstallCost` is set.
   */
  | {
      kind: "install_from_hq_or_archives";
      /** The card may not be an agenda. */
      excludeAgenda?: boolean;
      /** The destination may not be the source's server. */
      excludeSourceServer?: boolean;
      /** The text ignores the install cost, or all costs. */
      ignoreInstallCost?: boolean;
      /** The text has no "may": a card is installed if one can be. */
      required?: boolean;
      /** Set by the engine: the card the Corp picked. */
      cardIds?: string[];
    }
  /**
   * May install 1 facedown card from Archives. The Corp picks the card
   * and its destination.
   */
  | { kind: "may_install_facedown_from_archives"; cardIds?: string[] }
  | {
      kind: "install_corp_card";
      cardId: string;
      serverId?: string;
      ignoreInstallCost?: boolean;
      rez?: boolean;
      excludeServerId?: string;
      trashFirst?: boolean;
      cardIds?: string[];
    }
  | { kind: "install_ice_inward_free"; cardId?: string }
  /**
   * Howler: install and rez a bioroid ice from HQ or Archives, inward of
   * source, ignoring all costs; trash Howler and derez it at run end.
   */
  | { kind: "may_install_rez_bioroid_inward" }
  | { kind: "install_rez_chosen"; cardId: string }
  | {
      kind: "may_install_from_heap";
      types: Array<"program" | "hardware" | "resource">;
      discount?: number;
    }
  | {
      kind: "install_from_heap";
      types: Array<"program" | "hardware" | "resource">;
      discount?: number;
    }
  | {
      kind: "may_install_from_grip";
      discount?: number;
      types?: Array<"program" | "hardware" | "resource">;
      subtype?: string;
    }
  /**
   * Greasing the Palm: may install one HQ card paying printed install cost.
   */
  | {
      kind: "may_install_from_hq_paying_costs";
      thenMayRemoveTagToAdvance?: boolean;
      /** Warm Reception: installed card cannot be scored this turn. */
      cannotScoreInstalledCardThisTurn?: boolean;
      excludeAgenda?: boolean;
    }
  /**
   * Advanced Assembly Lines: install one HQ card paying its install cost,
   * with no Decline (the printed install is not optional).
   */
  | {
      kind: "install_from_hq_paying_costs";
      excludeAgenda?: boolean;
    }
  /**
   * Digital Rights Management: may install 1 HQ card in a remote root paying costs.
   */
  | { kind: "may_install_from_hq_in_remote_root_paying_costs" }
  /** Leaf: install one HQ card paying installCost; optional tag→advance follow-up. */
  | {
      kind: "install_hq_card_paying_costs";
      cardId: string;
      thenMayRemoveTagToAdvance?: boolean;
      cannotScoreInstalledCardThisTurn?: boolean;
    }
  | { kind: "may_install_ice_from_hq_other_server_ignore_costs" }
  /**
   * Minelayer: may install 1 ice from HQ protecting the server that contains
   * the source ice, ignoring install cost.
   */
  | { kind: "may_install_ice_from_hq_protecting_this_server_ignore_costs" }
  | {
      kind: "install_hq_ice_protecting_server_ignore_costs";
      cardId: string;
      serverId: string;
    }
  /** Leaf for Building Blocks after choosing ice + server. */
  | {
      kind: "install_and_rez_hq_ice_protecting_server_ignore_costs";
      cardId: string;
      serverId: string;
    }
  | { kind: "may_install_and_rez_from_hq"; totalDiscount: number }
  | {
      kind: "install_and_rez_hq_card_with_discount";
      cardId: string;
      totalDiscount: number;
      /** Portion of totalDiscount applied to the install cost (CR 1.16.2f). */
      installDiscount?: number;
    }
  | { kind: "install_hosted_card_ignore_costs"; cardId: string }
  /**
   * Arella Salvatore: may install from HQ ignoring costs, then place
   * `amount` advancement counters on the installed card.
   */
  | {
      kind: "may_install_from_hq_ignore_costs_then_place_advancements";
      amount: number;
    }
  /** Leaf: install HQ card ignoring costs, then place advancements on it. */
  | {
      kind: "install_hq_card_ignore_costs_then_place_advancements";
      cardId: string;
      serverId: string;
      amount: number;
    }
  /**
   * Reboot: install up to `max` cards from heap into the installed area facedown
   * (ignore costs); interactive multi-pick with Done.
   */
  | { kind: "install_up_to_from_heap_facedown"; max: number }
  /** Internal: continue Reboot after each facedown install. */
  | {
      kind: "install_up_to_from_heap_facedown_continue";
      remaining: number;
      justInstalledId?: string;
    }
  /** Internal: continue Fast Break installs into a chosen remote. */
  | {
      kind: "install_continue";
      remaining: number;
      serverId: string;
      justInstalledId?: string;
      asIce?: boolean;
    }
  /**
   * Saraswati: install 1 HQ card on a remote root, place `amount`
   * advancements, forbid score/rez until next Corp turn begins.
   */
  | {
      kind: "install_from_hq_on_remote_root_place_advancement_cannot_score_or_rez_until_next_corp_turn";
      amount: number;
    }
  /** Leaf: perform Saraswati install+advance+lock. */
  | {
      kind: "install_hq_remote_root_place_adv_lock_until_next_corp_turn";
      cardId: string;
      serverId: string;
      amount: number;
    }
  | {
      kind: "may_install_ice_from_hq_discount_then_move_source";
      discount: number;
    }
  | {
      kind: "install_hq_ice_protecting_server_paying_costs";
      cardId: string;
      serverId: string;
      discount?: number;
      thenMoveSourceToServerRoot?: boolean;
    }
  /** A Teia: may install from HQ on another remote ignoring costs. */
  | {
      kind: "may_install_from_hq_on_other_remote_ignore_costs";
      cannotScoreInstalledCardThisTurn?: boolean;
    }
  /** Leaf: install HQ card on remote `serverId` ignoring costs. */
  | {
      kind: "install_hq_on_remote_ignore_costs";
      cardId: string;
      serverId: string;
      cannotScoreInstalledCardThisTurn?: boolean;
    }
  /** Project Ingatan: may install from Archives ignoring costs. */
  | { kind: "may_install_from_archives_ignore_costs" }
  /**
   * Retirement Plan: install 1 agenda/asset/ice from Archives paying
   * install cost (mandatory; no Decline).
   */
  | {
      kind: "install_from_archives";
      types: Array<"agenda" | "asset" | "ice" | "upgrade">;
    }
  /** Leaf: pay install cost and install a specific Archives card. */
  | {
      kind: "install_archives_card_paying";
      cardId: string;
      serverId: string;
    }
  /** Synapse Global: may install from HQ ignoring costs. */
  | { kind: "may_install_from_hq_ignore_costs" }
  /**
   * Vaporframe Fabricator onTrash: may install from HQ ignoring costs, but
   * cannot install into the root of the server that hosted the source.
   * Ice protecting that server remains legal.
   */
  | { kind: "may_install_from_hq_ignore_costs_exclude_source_server" }
  /** Leaf: install Archives card on server ignoring costs (unrezzed). */
  | {
      kind: "install_archives_card_ignore_costs";
      cardId: string;
      serverId: string;
    }
  /** Leaf: install HQ card on server ignoring costs (unrezzed). */
  | {
      kind: "install_hq_card_ignore_costs";
      cardId: string;
      serverId: string;
    }
  /** Arissana: install program from grip paying full install cost. */
  | {
      kind: "install_program_from_grip_paying_cost";
      cardId?: string;
      trackOnRunEndTrashUnlessSubtype?: string;
    }
  /**
   * Kakurenbo: may install 1 agenda/asset/upgrade from Archives in a remote
   * root (paying install cost), then place `amount` advancements on it.
   */
  | {
      kind: "may_install_from_archives_in_remote_root_with_advancements";
      amount: number;
    }
  /** Leaf: install from Archives into remote root paying, then place advancements. */
  | {
      kind: "install_archives_remote_root_with_advancements";
      cardId: string;
      serverId: string;
      amount: number;
    }
  /** Internal: install set-aside program/virtual without shuffling rest. */
  | { kind: "install_set_aside"; cardId: string; discount: number }
  /** Internal: after Gachapon install/decline — choose shuffle then RFG rest. */
  | { kind: "install_gachapon_after_choice" }
  | { kind: "install_stack_program_ignore_costs_track"; cardId: string }
  /**
   * Reanimation Protocol: install and rez 1 ice from Archives paying
   * `totalDiscount` less combined; if rezzed ice lacks subtype
   * `badPublicityIfNotSubtype`, take 1 bad publicity.
   */
  | {
      kind: "install_and_rez_ice_from_archives";
      totalDiscount: number;
      badPublicityIfNotSubtype?: string;
    }
  /** Leaf: install+rez chosen Archives ice with discount. */
  | {
      kind: "install_and_rez_archives_ice";
      cardId: string;
      totalDiscount: number;
      badPublicityIfNotSubtype?: string;
      serverId: string;
      /** Portion of totalDiscount applied to the install cost (CR 1.16.2f). */
      installDiscount?: number;
    }
  | {
      kind: "install_and_rez_asset_or_upgrade_free";
      cardId?: string;
      cardIds?: string[];
    }
  /**
   * Install and rez 1 card from Archives ignoring all costs
   * (Trust Operation). Targets asset / upgrade / ice (and agendas install
   * without rez). The Corp picks the card; `cardIds` is that pick, set by
   * the engine, and card data does not author it. The card goes to a new
   * remote server.
   */
  | { kind: "install_and_rez_from_archives_free"; cardIds?: string[] }
  | { kind: "install_resource_discount"; discount: number }
  /**
   * Install 1 card from grip among `types`, paying `discount`¢ less
   * (Rigging Up / Career Fair–class). Opens a choice when multiple
   * affordable candidates exist; sole candidate auto-installs.
   * When `mayCharge`, after install offer may-charge of that card if able
   * (CR §10.10; Hyperbaric ruling — onInstall / powerCountersOnInstall
   * resolve before the may-charge check).
   */
  | {
      kind: "install_from_grip_discount";
      types: Array<"program" | "hardware" | "resource">;
      discount: number;
      mayCharge?: boolean;
      /** Topan: Effect after the chosen card installs (baked into choice options). */
      thenOnInstall?: Effect;
    }
  /** KPI: install 1 ice from HQ ignoring costs (any server; mandatory choose). */
  | { kind: "install_ice_from_hq_ignore_costs" }
  /**
   * Monolith: on install, may install up to `remaining` programs from grip,
   * each paying `discount`¢ less.
   */
  | {
      kind: "install_up_to_n_programs_from_grip_discount";
      remaining: number;
      discount: number;
    }
  | {
      kind: "install_haas_pet_project_continue";
      remaining: number;
      serverId: import("../../state/types.js").ServerId | "";
      justInstalledId?: string;
      justInstalledFrom?: "hq" | "archives";
      asIce?: boolean;
    }
  /**
   * Scavenge: install 1 program from grip or heap, paying the install cost
   * of the program most recently trashed via `trash_own_program` less
   * (`state.turn.lastTrashedOwnProgramInstallCost`).
   */
  | { kind: "install_scavenge_program" }
  /** Leaf: install a specific grip card paying `discount`¢ less. */
  | {
      kind: "install_grip_card";
      cardId: string;
      discount: number;
      hostId?: string;
    }
  | {
      kind: "may_install_program_hardware_from_last_runner_discarded";
    }
  | { kind: "install_from_runner_score" }
  | { kind: "may_install_one_hosted_program" }
  | { kind: "install_hosted_program"; cardId: string }
  /**
   * Paule's Café: may install 1 hosted program/hardware; optional first-this-turn
   * −1¢ per unique ♦ connection installed.
   */
  | {
      kind: "may_install_one_hosted_card";
      firstThisTurnDiscountPerUniqueConnection?: boolean;
    }
  | {
      kind: "install_hosted_card";
      cardId: string;
      firstThisTurnDiscountPerUniqueConnection?: boolean;
    }
  /** Shipment from MirrorMorph: install up to max from HQ paying costs. */
  | { kind: "install_up_to_from_hq_paying_costs"; max: number }
  | {
      kind: "install_up_to_from_hq_paying_costs_continue";
      remaining: number;
      justInstalledId?: string;
      serverId?: string;
      asIce?: boolean;
    }
  | {
      kind: "install_ice";
      cardId: string;
      serverId: string;
    }
  | { kind: "install_program_from_grip" }
  | { kind: "install_supplier_turn_begin" }
  | { kind: "install_supplier_hosted"; cardId: string }
  | { kind: "install_program"; cardId: string; discount: number }
  | { kind: "install_hayley_same_type_from_grip" }
  | { kind: "install_hayley_grip_card"; cardId: string }
  | { kind: "install_hosted"; discount?: number }
  | {
      kind: "install_street_peddler_hosted_card";
      cardId: string;
      discount?: number;
    }
  | { kind: "install_agenda_faceup" }
  | { kind: "install_casting_call"; cardId: string }
  | { kind: "install_from_grip_ignore_cost" }
  | { kind: "install_davinci_resolve"; cardId: string }
  | { kind: "may_install_from_hq_or_archives_ignore_costs" }
  | {
      kind: "install_asset_from_hq_rez_discount";
      discount?: number;
    }
  | { kind: "install_and_rez_x_advertisements_from_hq_or_archives" }
  | { kind: "install_rez_advertisement"; cardId: string; remaining: number }
  | { kind: "install_from_grip_facedown" }
  | { kind: "install_facedown"; cardId: string }
  | { kind: "install_top_n_of_stack_facedown"; amount: number }
  | { kind: "install_from_stack"; cardId: string }
  | { kind: "install_chatterjee_program_discount" }
  | {
      kind: "install_chatterjee_program_resolve";
      cardId: string;
      discount: number;
    }
  | { kind: "install_from_hq_new_remote" }
  | {
      kind: "install_new_construction_resolve";
      cardId: string;
      rezIgnoringCosts?: boolean;
    }
  | { kind: "may_install_drawn_agenda"; cardId: string }
  | { kind: "install_agenda"; cardId: string }
  | {
      kind: "install_resolve";
      cardId: string;
      lookedIds: string[];
      discount?: number;
    }
  | { kind: "install_up_to_n_from_archives_paying"; max?: number }
  | {
      kind: "install_up_to_n_from_archives_paying_continue";
      remaining: number;
    }
  | { kind: "install_remote"; cardId: string }
  | {
      kind: "install_remote_resolve";
      cardId: string;
      serverId: string;
    }
  | { kind: "install_customized_secretary_hosted_program" }
  | { kind: "may_install_ice_from_hq_inward_of_source_ignore_costs" }
  | { kind: "install_ice_inward"; cardId: string }
  | { kind: "install_2_from_hq_ignore_costs" }
  | { kind: "install_from_hq_continue"; remaining: number }
  | { kind: "install_root_ignore_costs"; cardId: string }
  | { kind: "install_rosetta_from_stack"; cardId: string; discount: number }
  | {
      kind: "install_ice_from_hq_outermost_remote_ignore_costs_place_advancements";
      advancements?: number;
    }
  | {
      kind: "install_priority_construction_resolve";
      iceId: string;
      serverId: string;
      advancements?: number;
    }
  | { kind: "install_and_rez_from_archives_paying_costs_rfg_other_copies" }
  | {
      kind: "install_rez_resolve";
      cardId: string;
      serverId: string;
    }
  | { kind: "may_install_diana_program_from_grip_ignoring_costs" }
  | { kind: "install_diana_program_resolve"; cardId: string }
  | { kind: "install_asa_non_agenda_same_server" }
  | {
      kind: "install_asa_resolve";
      cardId: string;
      serverId: string;
      asIce: boolean;
    }
  | { kind: "install_kabonesa_resolve"; cardId: string }
  | {
      kind: "install_emergent_resolve";
      cardId: string;
      discount: number;
    }
  | {
      kind: "install_jinja_drawn_ice";
      cardId: string;
      serverId: string;
      discount?: number;
    }
  | { kind: "install_crypt_resolve"; cardId: string }
  | { kind: "install_compile_program" }
  | {
      kind: "install_compile_resolve";
      cardId: string;
      zone: "stack" | "heap";
    }
  | {
      kind: "install_remote_enforcement";
      iceId: string;
      serverId: string;
    }
  | { kind: "install_reclaim_from_heap" }
  | { kind: "install_reclaim_resolve"; cardId: string }
  | { kind: "install_mti_ice_innermost_from_hq" }
  | { kind: "install_mti_resolve"; iceId: string; serverId: string }
  | {
      kind: "may_install_crowdfunding_from_heap_ignore_costs";
      minSuccessfulRuns: number;
    }
  | { kind: "install_crowdfunding_resolve" }
  | { kind: "install_ice_hq_or_archives_any_position_ignore_costs" }
  | {
      kind: "install_ice_choose_server";
      iceId: string;
      from: "hq" | "archives";
    }
  | {
      kind: "install_ice_choose_position";
      iceId: string;
      from: "hq" | "archives";
      serverId: string;
    }
  | {
      kind: "install_ice_resolve";
      iceId: string;
      from: "hq" | "archives";
      serverId: string;
      position: number;
    }
  | { kind: "install_instead" }
  | { kind: "install_mushin_from_hq_root" }
  | { kind: "install_mushin_hq_card_server_pick"; cardId: string }
  | { kind: "install_mushin_new_remote"; cardId: string }
  /**
   * Retrieval Run: if successful, instead of breaching Archives, the Runner
   * may install 1 program from the heap, ignoring all costs.
   */
  | { kind: "may_install_heap_program_instead_of_breach" }
  | {
      kind: "install_runner_score_agenda_on_remote";
      cardId: string;
      placeAdvancementIfRunnerTagged?: boolean;
    }
  | {
      kind: "install_runner_score_agenda_on_server";
      cardId: string;
      serverId: string;
      placeAdvancementIfRunnerTagged?: boolean;
    }
  | {
      /** Test Run. Engine-built steps fill `from`, then `cardIds`. */
      kind: "install_program_from_stack_or_heap_free";
      from?: "stack" | "heap";
      cardIds?: string[];
    }
  /**
   * NEXT Design onGameStart: may install up to `remaining` ice from HQ, ≤1
   * per server, ignoring all costs; then draw until HQ has `thenDrawToHq`.
   */
  | {
      kind: "may_install_next_design_ice";
      remaining: number;
      usedServerIds: string[];
      thenDrawToHq: number;
    }
  | {
      kind: "install_next_design_on_server";
      cardId: string;
      serverId: string;
      remaining: number;
      usedServerIds: string[];
      thenDrawToHq: number;
    }
  /** Leaf: install a specific program from stack paying full install cost. */
  | { kind: "install_stack_program"; cardId: string; gripCardId?: string }
  /** Leaf: install a set-aside program paying `discount`¢ less; shuffle remainder. */
  | { kind: "install_set_aside_program"; cardId: string; discount: number }
  /** Leaf: install a specific heap card paying `discount`¢ less. */
  | { kind: "install_heap_card"; cardId: string; discount: number }
  /** Leaf: install revealed R&D ice on a central with install-cost discount. */
  | {
      kind: "install_rd_ice_protecting_central_discount";
      cardId: string;
      serverId: string;
      discount: number;
    }
  /**
   * Rejig: bounce 1 installed program/hardware to grip, then install 1
   * program/hardware from grip paying X¢ less (X = printed install cost of
   * the bounced card).
   */
  | { kind: "install_rejig_bounce" }
  /** Leaf: install a specific stack card paying `discount`¢ less; shuffle rest. */
  | {
      kind: "install_stack_card";
      cardId: string;
      discount: number;
    };

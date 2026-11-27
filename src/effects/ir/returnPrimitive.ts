/**
 * Effect IR: the `Primitive` members whose procedure is return.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
export type ReturnPrimitive =
  /**
   * Blue Sun: may add 1 rezzed card to HQ and gain credits equal to its rez
   * cost.
   */
  | { kind: "may_return_rezzed_to_hq_gain_rez_cost" }
  /** Internal: return rezzed card to HQ and gain its rez cost. */
  | { kind: "return_rezzed_to_hq_gain_rez_cost"; cardId: string }
  /** Leaf: return remaining looked R&D cards to top of deck. */
  | { kind: "return_rd_looked_to_deck_top" }
  /**
   * Return 1 installed Corp card (ice/asset/upgrade/agenda) to HQ
   * (Reprise). `choose` opens Corp? No — Runner chooses.
   */
  | {
      kind: "return_installed_corp_to_hq";
      pick: "first" | "choose";
      /** Specific card (used by choose options). */
      cardId?: string;
      /** Leela-class: only unrezzed installed Corp cards. */
      unrezzedOnly?: boolean;
    }
  /** Return a stolen agenda from Runner score to HQ. */
  | { kind: "return_stolen_agenda_to_hq"; cardId: string }
  | { kind: "return_tracked_install_to_stack_top_if_installed" }
  | { kind: "may_return_self_to_grip"; creditCost: number }
  | { kind: "return_source_to_grip" }
  /** Janaína / Descent: move source Corp card to HQ. */
  | { kind: "return_source_to_hq" }
  | { kind: "return_program"; cardId: string }
  | { kind: "return_looked" }
  | { kind: "return_to_stack"; cardIds: string[] }
  | { kind: "return_two_hosted_may_access" }
  | { kind: "return_subliminal_from_archives" }
  /**
   * Urban Art Vernissage: may return 1 installed non-virus trojan to grip;
   * if so, place `hostedAmount` credits on source.
   */
  | {
      kind: "may_return_non_virus_trojan_to_grip_place_hosted";
      hostedAmount: number;
    }
  /** Leaf: return a specific installed Runner card to grip. */
  | { kind: "return_rig_card_to_grip"; cardId: string };

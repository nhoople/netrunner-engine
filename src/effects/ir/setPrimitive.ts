/**
 * Effect IR: the `Primitive` members whose procedure is set.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
export type SetPrimitive =
  /** Cataloguer: set `run.skipBreach` on the current run. */
  | { kind: "set_run_skip_breach" }
  | { kind: "set_rez_ice_forfeit_discount"; cardId: string; forfeit: boolean }
  /** Leaf: store Corp's encounter card-type choice. */
  | {
      kind: "set_encounter_chosen_card_type";
      cardType: import("../../state/types.js").CardType;
    }
  /** Internal leaf: schedule encounter of chosen protecting ice. */
  | { kind: "set_reencounter_ice"; iceId: string }
  /** Internal leaf: schedule nested encounter then resume source. */
  | { kind: "set_nested_encounter_then_resume_source"; iceId: string }
  | { kind: "set_aside_access_shuffle"; installCost: number }
  | { kind: "set_name"; defId: string }
  | { kind: "set_skip_breach" }
  /** Leaf: set source.namedServerId. */
  | { kind: "set_named_server"; serverId: string }
  /** Leaf: set source.chosenServerId. */
  | { kind: "set_chosen_server"; serverId: string }
  /** Set the base strength of the pending trace (Flip Switch interrupt). */
  | { kind: "set_trace_base_strength"; amount: number };

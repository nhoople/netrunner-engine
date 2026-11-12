# Effect IR

The grammar of the hand-authored effect language that card definitions use and `evalEffect` runs. Kind names follow the verb rules in [`src/effects/primitiveNames.ts`](../src/effects/primitiveNames.ts), checked by `tests/effect-ir-names.test.ts`.

Every kind, with its fields, how many cards use it, and whether a card or only the engine builds it, is listed in [effect-ir-kinds.md](effect-ir-kinds.md). That file is generated: run `npm run kind-reference` after changing `src/effects/ir.ts`.

Hand-authored AST evaluated by `evalEffect` — **not** compiling `nodes.json`.

```text
Effect ::= seq [Effect…]
         | do Primitive
         | if Cond then Effect [else Effect]
         | prevent jack_out
         | choose {chooser, options[]}

Primitive ::= end_the_run
            | gain_credits | lose_credits {side, amount, tally?, then?}
            | lose_clicks | gain_clicks {side, amount, tally?}
            | pump_strength {amount, duration?: encounter|run}
            | fortify_ice | weaken_ice {amount}
            | net_damage | meat_damage {amount, tally?} | core_damage | brain_damage {amount}
            | give_tags {amount, tally?}
            | trash_program | trash_resource {pick: first|choose}
            | take_hosted_credits | place_hosted_credits {amount}
         | add_virus_counter | gain_credits_per_virus
         | increase_hand_size {side, amount}
         | remove_tags {amount, tally?} | gain_credits_per_advancement | bypass_current_ice
         | remove_power_counter
         | sabotage {amount, interactive?}
         | identify_mark
         | charge {pick: self|choose|card, cardId?}
         | bonus_access {amount}
         | breach_server_when_run_ends {server: hq|rd|archives}
         | install_from_grip_discount {types[], discount, mayCharge?}
         | install_grip_card {cardId, discount}
         | may_charge_card {cardId}
         | may_derez_installed {excludeSelf?, then?}
         | may_trash_installed {excludeSelf?, then?}
         | trash_corp_card {cardId}
         | spark_of_inspiration_resolve {discount?}
         | may_trash_other_installed_search_stack_same_type_install {discount}
         | search_stack_type_install {cardType, discount}
         | draw {side, amount, tally?}
         | take_hosted_bad_publicity {amount}
         | may_flip_archives_ice_resolve_subroutine
         | flip_archives_ice_resolve_subroutine {iceId, subIndex}
         | trash_encounter_ice_resolve_subroutine {subIndex}
         | may_choose_server
         | set_named_server {serverId}
         | search_stack_host_virus_or_weapon {max}
         | host_stack_card_on_source {cardId}
         | may_add_hosted_card_to_grip
         | add_hosted_card_to_grip {cardId}
         | turn_hosted_cards_faceup
         | host_copy_from_grip {title}
         | matryoshka_break
         | matryoshka_break_resolve {amount, hostedId}
         | trace {strength, onSuccess, onFailure?}
         | add_agenda_counter {amount}
```

A `kind` is snake_case and names the procedure: a verb, then the object (`gain_credits`, `trash_program`). `may_` means the player may decline. Amounts, sides, and zones are fields. Do not prefix a kind with a pack code or a card title. The allowed verbs are `PROCEDURE_VERBS` in `src/effects/primitiveNames.ts`.

Card hooks that carry Effect trees: `subroutines[].effect`, `paidAbilities[].effect`, `onRez`, `onPlay`, `onScore`, `onSteal`, `onEncounter`, `onTurnBegin`, `onInstall`, `onFirstTagThisTurn`, `onFirstCoreDamageThisTurn`, `onFirstRdRunBeginThisTurn`, `onFirstArchivesRunBeginThisTurn`, `onFirstVirusInstallThisTurn`, `onFirstSuccessfulMarkRunThisTurn`, `onFirstSuccessfulHqRunThisTurn`, `onProgramOrHardwareInstall`. Threshold field: `onPowerCountersGte` (Environmental Testing). Paid-ability gates include `requireEncounterSubtype` and `requireAttackingMark` (Backstitching mark-run trash-to-bypass).

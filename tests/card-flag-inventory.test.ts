/**
 * Card flag inventory (CR audit tool 1.10).
 *
 * A lot of card behavior is a static field on `CardDef` that engine code reads
 * and turns into an effect. The effect kind then appears nowhere in card JSON,
 * so a search of the JSON cannot see it. Tāo Salonga's
 * `maySwapIceOnAgendaScoredOrStolen` is the reference case: `src/actions/score.ts`
 * reads it and builds `swap_two_ice`.
 *
 * This test lists every entry of two kinds:
 *   - each optional boolean or number field on `CardDef` (`src/cards/load.ts`;
 *     the loader copies it onto the `CardInstance` field of the same name in
 *     `src/state/types.ts`, except where `instantiateCard` renames it), and
 *   - each top-level property of the pinned `vendor/cards-data/schema.json`.
 *
 * For each entry it records the cards that set it, the sites in `src/` (outside `src/debug/`) that read
 * it, and the effect kinds those readers build. It is written with the
 * TypeScript compiler API and the type checker, not regex: a read is a property
 * access, element access, destructuring or `keyof` string literal that resolves
 * to the `CardDef` or `CardInstance` member.
 *
 * Baseline: tests/baselines/card-flags.json. It is shrink-only:
 *   - a new entry fails, and so does a new entry in `unread` or `unset`;
 *   - an entry that disappears, or any other drift, fails until the baseline is
 *     regenerated:  UPDATE_CARD_FLAGS=1 npx vitest run tests/card-flag-inventory.test.ts
 *   - regeneration still refuses growth unless ALLOW_CARD_FLAG_GROWTH=1 is set
 *     too, so a new flag is a deliberate, reviewed change (plan area 10: no new
 *     flag for a one-off).
 *
 * Baseline shape (tool 1.2(c) in tests/kind-liveness.test.ts reads `flagKinds`):
 *
 *   {
 *     "cardsPin": "v1.147.22",
 *     "counts": {
 *       "cardDefFlags": n,          // optional boolean + number fields on CardDef
 *       "cardDefBoolean": n,
 *       "cardDefNumber": n,
 *       "schemaProperties": n,      // top-level schema.json properties
 *       "schemaByType": { "boolean": n, "integer": n, "object": n, ... },
 *       "entries": n,               // union of the two lists
 *       "withKindBuildingReader": n,// entries some reader of which builds a kind
 *       "unread": n,
 *       "unset": n
 *     },
 *     // entry name -> sorted effect kinds its readers build. Only entries with
 *     // at least one kind appear. This is the flag-to-kind map.
 *     "flagKinds": { "maySwapIceOnAgendaScoredOrStolen": ["swap_two_ice"], ... },
 *     "unread": [names],            // no site in src/ reads it
 *     "unset": [names],             // no card in the pinned catalog sets it
 *     "entries": {
 *       "<name>": {
 *         "cardDef": "boolean" | "number" | "other" | null,  // null: not on CardDef
 *         "schema": "<schema type>" | null,                  // null: not in schema.json
 *         "flag": true,             // boolean/number on CardDef or boolean/integer in schema
 *         "instanceFields"?: ["<CardInstance field>"],       // only when not the same name
 *         "cardCount": n,
 *         "cards"?: [card ids],     // listed when cardCount <= CARD_LIST_LIMIT
 *         "setVia": ["declaration" | "field" | "flag"],      // how card JSON sets it
 *         "readers": [
 *           { "site": "src/<file>.ts#<function>", "kinds": [kinds],
 *             "mirrors"?: ["src/<file>.ts#<Type>"] }   // read through a mirror type
 *         ],
 *         "kinds": [kinds]          // union over readers; [] unless "flag"
 *       }
 *     }
 *   }
 *
 * `setVia`: "field" is a top-level JSON property; "declaration" is a static
 * ability `declaration: { field, value }` that `applyAbilityRecords` copies onto
 * the card; "flag" is a CR 9.3.6 ability flag the loader turns into a field
 * (`persistent`). A card "sets" an entry when the loaded `CardDef` has it
 * defined, so the loader's mapping is the one the engine sees.
 *
 * Reader kinds: from a read, the test climbs to the guarded region (the `then`
 * of an `if` whose condition holds the read, the `true` arm of `?:`, the rest of
 * the block after a negated early `continue`/`return`, or else the enclosing
 * statement) and collects every `{ kind: "<k>" }` literal and `fx.<builder>()`
 * call there whose kind is in `KNOWN_PRIMITIVE_KINDS`. A read inside a helper
 * predicate records no kind; the kind its caller builds is not followed. Kinds
 * are kept only for flag entries: reading `title`, `subtypes` or an Effect-valued
 * field near an effect does not hide that effect behind a flag.
 *
 * Mirror reads: some code takes a structural copy of card fields rather than
 * `CardDef`/`CardInstance` (deck checks take `DeckEntry`). A read through such a
 * type counts and names the type in `mirrors`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  cardsDataPresent,
  CARD_STORAGE_DIRS,
  loadCardCatalog,
} from "../src/cards/load.js";
import { KNOWN_PRIMITIVE_KINDS } from "../src/effects/ir.js";

const CARDS_PIN = "v1.147.22";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(ROOT, "tests/baselines/card-flags.json");
const CARD_LIST_LIMIT = 40;
const UPDATE = process.env.UPDATE_CARD_FLAGS === "1";
const ALLOW_GROWTH = process.env.ALLOW_CARD_FLAG_GROWTH === "1";

type FieldKind = "boolean" | "number" | "other";
type SetVia = "declaration" | "field" | "flag";

interface Reader {
  site: string;
  kinds: string[];
  mirrors?: string[];
}

interface Entry {
  cardDef: FieldKind | null;
  schema: string | null;
  flag: boolean;
  instanceFields?: string[];
  cardCount: number;
  cards?: string[];
  setVia: SetVia[];
  readers: Reader[];
  kinds: string[];
}

interface Inventory {
  cardsPin: string;
  counts: {
    cardDefFlags: number;
    cardDefBoolean: number;
    cardDefNumber: number;
    schemaProperties: number;
    schemaByType: Record<string, number>;
    entries: number;
    withKindBuildingReader: number;
    unread: number;
    unset: number;
  };
  flagKinds: Record<string, string[]>;
  unread: string[];
  unset: string[];
  entries: Record<string, Entry>;
}

const sorted = <T>(xs: Iterable<T>): T[] => [...new Set(xs)].sort();

function sortedRecord<T>(rec: Map<string, T> | Record<string, T>): Record<string, T> {
  const entries = rec instanceof Map ? [...rec.entries()] : Object.entries(rec);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// Program and declarations

function createProgram(): ts.Program {
  const configPath = join(ROOT, "tsconfig.json");
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  if (!parsed) throw new Error("tsconfig.json did not parse");
  return ts.createProgram(parsed.fileNames, parsed.options);
}

function findInterface(sf: ts.SourceFile, name: string): ts.InterfaceDeclaration {
  let found: ts.InterfaceDeclaration | undefined;
  ts.forEachChild(sf, (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === name) found = n;
  });
  if (!found) throw new Error(`interface ${name} not found in ${sf.fileName}`);
  return found;
}

function findFunction(sf: ts.SourceFile, name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  ts.forEachChild(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
  });
  if (!found) throw new Error(`function ${name} not found in ${sf.fileName}`);
  return found;
}

function memberName(m: ts.TypeElement): string | undefined {
  if (!m.name) return undefined;
  if (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) return m.name.text;
  return undefined;
}

function classify(checker: ts.TypeChecker, m: ts.PropertySignature): FieldKind {
  const t = checker.getNonNullableType(checker.getTypeAtLocation(m));
  const all = t.isUnion() ? t.types : [t];
  if (all.every((x) => x.flags & ts.TypeFlags.BooleanLike)) return "boolean";
  if (all.every((x) => x.flags & ts.TypeFlags.NumberLike)) return "number";
  return "other";
}

const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

/**
 * `instantiateCard` copies `def.<x>` onto `card.<y>`, in the `card` object
 * literal or in a later `card.<y> = ...`. Return x -> every y it is copied to.
 * A `def.<x>` that only feeds a comparison or a `?:` condition (`rezzed:
 * def.type === "identity"`) derives y rather than copying x, so it is skipped.
 */
function instanceTargets(sf: ts.SourceFile): Map<string, Set<string>> {
  const fn = findFunction(sf, "instantiateCard");
  const out = new Map<string, Set<string>>();
  const note = (target: string, value: ts.Node): void => {
    const walk = (x: ts.Node): void => {
      if (ts.isBinaryExpression(x) && COMPARISONS.has(x.operatorToken.kind)) return;
      if (ts.isConditionalExpression(x)) {
        walk(x.whenTrue);
        walk(x.whenFalse);
        return;
      }
      if (
        ts.isPropertyAccessExpression(x) &&
        ts.isIdentifier(x.expression) &&
        x.expression.text === "def"
      ) {
        const set = out.get(x.name.text) ?? new Set<string>();
        set.add(target);
        out.set(x.name.text, set);
        return;
      }
      ts.forEachChild(x, walk);
    };
    walk(value);
  };
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "card" &&
      n.initializer &&
      ts.isObjectLiteralExpression(n.initializer)
    ) {
      for (const p of n.initializer.properties) {
        if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) note(p.name.text, p.initializer);
      }
      return;
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      ts.isIdentifier(n.left.expression) &&
      n.left.expression.text === "card"
    ) {
      note(n.left.name.text, n.right);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return out;
}

// ---------------------------------------------------------------------------
// Kinds built by `fx.<builder>()`

function isKindLiteralProp(n: ts.Node): n is ts.PropertyAssignment {
  return (
    ts.isPropertyAssignment(n) &&
    ts.isIdentifier(n.name) &&
    n.name.text === "kind" &&
    ts.isStringLiteralLike(n.initializer)
  );
}

function fxCallName(n: ts.Node): string | undefined {
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === "fx"
  ) {
    return n.expression.name.text;
  }
  return undefined;
}

/** Map each `fx` builder in src/effects/ir.ts to the kinds it builds (transitively). */
function fxBuilderKinds(sf: ts.SourceFile): Map<string, Set<string>> {
  let fxObj: ts.ObjectLiteralExpression | undefined;
  ts.forEachChild(sf, (n) => {
    if (!ts.isVariableStatement(n)) return;
    for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === "fx" && d.initializer) {
        if (ts.isObjectLiteralExpression(d.initializer)) fxObj = d.initializer;
      }
    }
  });
  if (!fxObj) throw new Error("fx builder object not found in src/effects/ir.ts");
  const direct = new Map<string, Set<string>>();
  const calls = new Map<string, Set<string>>();
  for (const p of fxObj.properties) {
    if (!p.name || !ts.isIdentifier(p.name)) continue;
    const name = p.name.text;
    const kinds = new Set<string>();
    const callees = new Set<string>();
    const walk = (x: ts.Node): void => {
      if (isKindLiteralProp(x)) {
        const k = (x.initializer as ts.StringLiteralLike).text;
        if (KNOWN_PRIMITIVE_KINDS.has(k)) kinds.add(k);
      }
      const callee = fxCallName(x);
      if (callee) callees.add(callee);
      ts.forEachChild(x, walk);
    };
    walk(p);
    direct.set(name, kinds);
    calls.set(name, callees);
  }
  const resolved = new Map<string, Set<string>>();
  const resolve = (name: string, seen: Set<string>): Set<string> => {
    const done = resolved.get(name);
    if (done) return done;
    const out = new Set(direct.get(name) ?? []);
    if (seen.has(name)) return out;
    seen.add(name);
    for (const c of calls.get(name) ?? []) {
      for (const k of resolve(c, seen)) out.add(k);
    }
    seen.delete(name);
    return out;
  };
  for (const name of direct.keys()) resolved.set(name, resolve(name, new Set()));
  return resolved;
}

// ---------------------------------------------------------------------------
// Readers

function isJump(s: ts.Statement): boolean {
  if (
    ts.isContinueStatement(s) ||
    ts.isReturnStatement(s) ||
    ts.isBreakStatement(s) ||
    ts.isThrowStatement(s)
  ) {
    return true;
  }
  if (ts.isBlock(s) && s.statements.length > 0) {
    return isJump(s.statements[s.statements.length - 1]);
  }
  return false;
}

/** The code a read guards: where the reader's effect would be built. */
function guardedRegion(read: ts.Node): ts.Node[] {
  let child: ts.Node = read;
  let negated = false;
  for (let p = read.parent; p; child = p, p = p.parent) {
    if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) {
      negated = !negated;
      continue;
    }
    if (ts.isIfStatement(p) && child === p.expression) {
      if (negated && isJump(p.thenStatement)) {
        const parent = p.parent;
        if (ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isCaseClause(parent)) {
          const stmts = parent.statements;
          return stmts.slice(stmts.indexOf(p) + 1);
        }
      }
      if (negated) return p.elseStatement ? [p.elseStatement] : [];
      return [p.thenStatement];
    }
    if (ts.isConditionalExpression(p) && child === p.condition) {
      return [negated ? p.whenFalse : p.whenTrue];
    }
    if (ts.isStatement(p) || ts.isFunctionLike(p) || ts.isSourceFile(p)) return [p];
  }
  return [];
}

function kindsIn(nodes: ts.Node[], fxKinds: Map<string, Set<string>>): Set<string> {
  const out = new Set<string>();
  const walk = (x: ts.Node): void => {
    if (isKindLiteralProp(x)) {
      const k = (x.initializer as ts.StringLiteralLike).text;
      if (KNOWN_PRIMITIVE_KINDS.has(k)) out.add(k);
    }
    const callee = fxCallName(x);
    if (callee) for (const k of fxKinds.get(callee) ?? []) out.add(k);
    ts.forEachChild(x, walk);
  };
  for (const n of nodes) walk(n);
  return out;
}

function enclosingName(n: ts.Node): string {
  const names: string[] = [];
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    let name: string | undefined;
    if (
      (ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) || ts.isClassDeclaration(p)) &&
      p.name
    ) {
      name = p.name.getText();
    } else if (
      (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) &&
      p.parent &&
      (ts.isVariableDeclaration(p.parent) || ts.isPropertyAssignment(p.parent)) &&
      ts.isIdentifier(p.parent.name)
    ) {
      name = p.parent.name.text;
    } else if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && ts.isSourceFile(p.parent.parent.parent)) {
      name = p.name.text;
    }
    if (name) names.unshift(name);
  }
  return names.length ? names.join(".") : "<module>";
}

function isWriteTarget(n: ts.Node): boolean {
  const p = n.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return true;
  }
  if (ts.isDeleteExpression(p)) return true;
  return false;
}

interface ReadSite {
  field: string;
  /** "CardDef", "CardInstance", or the mirror type the read resolved through. */
  owner: string;
  site: string;
  kinds: Set<string>;
}

function collectReads(
  program: ts.Program,
  owners: Map<ts.Declaration, string>,
  cardKeys: Set<string>,
  fxKinds: Map<string, Set<string>>,
  skip: Set<ts.Node>,
): ReadSite[] {
  const checker = program.getTypeChecker();
  const out: ReadSite[] = [];
  // Union property symbols (CardInstance | OtherView) keep every part's declaration.
  const ownedField = (sym: ts.Symbol | undefined): [string, string] | undefined => {
    if (!sym) return undefined;
    for (const d of sym.declarations ?? []) {
      const owner = owners.get(d);
      if (owner) return [sym.name, owner];
    }
    return undefined;
  };
  const head = (key: string): string => key.split(".")[0];
  // A literal reads a card field when the type it is checked against is a union
  // of card field names: `keyof CardInstance`, a generic `K extends keyof
  // CardInstance`, or a key subset such as StoredConditionalEffectKey (whose
  // dotted members name a field of a field).
  const isCardKeyUnion = (t: ts.Type | undefined): boolean => {
    if (!t) return false;
    let ct = t;
    if (ct.flags & ts.TypeFlags.TypeParameter) {
      const c = checker.getBaseConstraintOfType(ct);
      if (!c) return false;
      ct = c;
    }
    if (!ct.isUnion() || ct.types.length < 2) return false;
    return ct.types.every(
      (x) =>
        !!(x.flags & ts.TypeFlags.StringLiteral) &&
        cardKeys.has(head((x as ts.StringLiteralType).value)),
    );
  };
  // Inference narrows a generic argument's contextual type to the literal
  // itself, so also check the parameter's declared type.
  const declaredParamType = (lit: ts.Expression): ts.Type | undefined => {
    const call = lit.parent;
    if (!call || !(ts.isCallExpression(call) || ts.isNewExpression(call))) return undefined;
    const index = call.arguments?.indexOf(lit) ?? -1;
    if (index < 0) return undefined;
    const decl = checker.getResolvedSignature(call)?.getDeclaration();
    const param = decl && "parameters" in decl ? decl.parameters[index] : undefined;
    return param?.type ? checker.getTypeFromTypeNode(param.type) : undefined;
  };

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const rel = relative(ROOT, sf.fileName).split("\\").join("/");
    if (!rel.startsWith("src/")) continue;
    // src/debug/ is verification code (the CR audit invariant checker). It reads
    // card fields to check state, not to give a card its behavior.
    if (rel.startsWith("src/debug/")) continue;
    const record = (owned: [string, string] | undefined, node: ts.Node): void => {
      if (!owned) return;
      out.push({
        field: owned[0],
        owner: owned[1],
        site: `${rel}#${enclosingName(node)}`,
        kinds: kindsIn(guardedRegion(node), fxKinds),
      });
    };
    const visit = (n: ts.Node): void => {
      if (skip.has(n)) return;
      if (ts.isTypeNode(n) && !ts.isExpressionWithTypeArguments(n)) return;
      if (ts.isPropertyAccessExpression(n)) {
        if (!isWriteTarget(n)) record(ownedField(checker.getSymbolAtLocation(n.name)), n);
      } else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) {
        if (!isWriteTarget(n)) {
          record(ownedField(checker.getSymbolAtLocation(n.argumentExpression)), n);
        }
      } else if (
        ts.isBindingElement(n) &&
        ts.isObjectBindingPattern(n.parent)
      ) {
        const key = n.propertyName ?? n.name;
        if (ts.isIdentifier(key)) {
          const parentType = checker.getTypeAtLocation(n.parent);
          record(ownedField(checker.getPropertyOfType(parentType, key.text)), n);
        }
      } else if (ts.isStringLiteralLike(n) && !ts.isElementAccessExpression(n.parent)) {
        const field = head(n.text);
        if (cardKeys.has(field) && ts.isExpression(n)) {
          if (isCardKeyUnion(checker.getContextualType(n)) || isCardKeyUnion(declaredParamType(n))) {
            record([field, "CardInstance"], n);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cards

function rawCards(): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const dir = join(ROOT, "vendor/cards-data");
  for (const wave of CARD_STORAGE_DIRS) {
    const d = join(dir, wave);
    if (!existsSync(d)) continue;
    for (const file of readdirSync(d)) {
      if (!file.endsWith(".json") || file.startsWith("_")) continue;
      const raw = JSON.parse(readFileSync(join(d, file), "utf8")) as Record<string, unknown>;
      out.set(String(raw.id), raw);
    }
  }
  return out;
}

function setVia(raw: Record<string, unknown>, field: string): SetVia[] {
  const via = new Set<SetVia>();
  if (raw[field] !== undefined) via.add("field");
  const abilities = Array.isArray(raw.abilities) ? raw.abilities : [];
  for (const a of abilities as Array<Record<string, unknown>>) {
    const decl = a?.declaration as { field?: unknown } | undefined;
    if (decl?.field === field) via.add("declaration");
    const flag = a?.flag;
    const words = Array.isArray(flag) ? flag : [flag];
    if (words.includes(field)) via.add("flag");
  }
  return sorted(via);
}

// ---------------------------------------------------------------------------
// Inventory

function schemaType(prop: Record<string, unknown>): string {
  const t = prop.type;
  if (Array.isArray(t)) return t.join("|");
  if (typeof t === "string") return t;
  if (prop.$ref) return "$ref";
  if (prop.oneOf) return "oneOf";
  if (prop.anyOf) return "anyOf";
  return "any";
}

function buildInventory(): Inventory {
  const program = createProgram();
  const checker = program.getTypeChecker();
  const loadSf = program.getSourceFile(join(ROOT, "src/cards/load.ts"));
  const typesSf = program.getSourceFile(join(ROOT, "src/state/types.ts"));
  const irSf = program.getSourceFile(join(ROOT, "src/effects/ir.ts"));
  if (!loadSf || !typesSf || !irSf) throw new Error("engine sources missing from program");

  const cardDef = findInterface(loadSf, "CardDef");
  const cardInstance = findInterface(typesSf, "CardInstance");

  const defFields = new Map<string, FieldKind>();
  for (const m of cardDef.members) {
    const name = memberName(m);
    if (!name || !ts.isPropertySignature(m)) continue;
    defFields.set(name, classify(checker, m));
  }
  const flagFields = new Map<string, "boolean" | "number">();
  for (const m of cardDef.members) {
    const name = memberName(m);
    if (!name || !ts.isPropertySignature(m) || !m.questionToken) continue;
    const k = classify(checker, m);
    if (k !== "other") flagFields.set(name, k);
  }

  const schema = JSON.parse(
    readFileSync(join(ROOT, "vendor/cards-data/schema.json"), "utf8"),
  ) as { properties: Record<string, Record<string, unknown>> };
  const schemaProps = new Map<string, string>();
  for (const [name, prop] of Object.entries(schema.properties)) {
    schemaProps.set(name, schemaType(prop));
  }

  const names = sorted([...flagFields.keys(), ...schemaProps.keys()]);

  // Readers: CardDef members, and the CardInstance members the loader copies them to.
  // A def field the loader never names is spread or cloned onto the same name.
  const targets = instanceTargets(loadSf);
  const instanceOf = (field: string): string[] => sorted(targets.get(field) ?? [field]);
  const owners = new Map<ts.Declaration, string>();
  for (const m of cardDef.members) owners.set(m, "CardDef");
  for (const m of cardInstance.members) owners.set(m, "CardInstance");

  // Mirror types: an interface or type literal in src/ that restates card fields
  // structurally (deck checks take `DeckEntry`, the opening hand takes
  // `{ startingHandSize?: number }`). A member counts when it is optional, has the
  // name of an optional CardDef member or a schema property, and at least half of
  // its type's members are such fields.
  const optionalDef = new Set<string>();
  for (const m of cardDef.members) {
    const n = memberName(m);
    if (n && ts.isPropertySignature(m) && m.questionToken) optionalDef.add(n);
  }
  for (const n of schemaProps.keys()) optionalDef.add(n);
  const mirrorMembers = (members: ts.NodeArray<ts.TypeElement>): ts.PropertySignature[] =>
    members.filter((m): m is ts.PropertySignature => {
      const n = memberName(m);
      return (
        !!n &&
        ts.isPropertySignature(m) &&
        !!m.questionToken &&
        optionalDef.has(n)
      );
    });
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !relative(ROOT, sf.fileName).startsWith("src")) continue;
    const visit = (n: ts.Node): void => {
      let members: ts.NodeArray<ts.TypeElement> | undefined;
      let label = "";
      if (ts.isInterfaceDeclaration(n) && n !== cardDef && n !== cardInstance) {
        members = n.members;
        label = n.name.text;
      } else if (ts.isTypeLiteralNode(n)) {
        members = n.members;
        let p: ts.Node = n.parent;
        while (p && !ts.isTypeAliasDeclaration(p) && !ts.isParameter(p) && !ts.isPropertySignature(p) && !ts.isSourceFile(p)) {
          p = p.parent;
        }
        label =
          p && (ts.isTypeAliasDeclaration(p) || ts.isParameter(p) || ts.isPropertySignature(p)) &&
          ts.isIdentifier(p.name)
            ? `{${p.name.text}}`
            : "{}";
      }
      if (members && members.length > 0) {
        const hits = mirrorMembers(members);
        if (hits.length > 0 && hits.length * 2 >= members.length) {
          const rel = relative(ROOT, sf.fileName).split("\\").join("/");
          for (const m of hits) if (!owners.has(m)) owners.set(m, `${rel}#${label}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  // The loader's own copy from CardDef to CardInstance is the mapping, not a read.
  const skip = new Set<ts.Node>([
    findFunction(loadSf, "instantiateCard"),
    findFunction(loadSf, "applyCardDef"),
  ]);
  const cardKeys = new Set<string>();
  for (const m of [...cardDef.members, ...cardInstance.members]) {
    const n = memberName(m);
    if (n) cardKeys.add(n);
  }
  const fxKinds = fxBuilderKinds(irSf);
  const reads = collectReads(program, owners, cardKeys, fxKinds, skip);

  // A read resolves to a member; map it back to entries. A CardInstance member
  // stands for each CardDef field `instantiateCard` copies onto it.
  const nameSet = new Set(names);
  const instanceToEntries = new Map<string, string[]>();
  for (const n of names) {
    for (const i of instanceOf(n)) instanceToEntries.set(i, [...(instanceToEntries.get(i) ?? []), n]);
  }
  const readersByEntry = new Map<string, Map<string, { kinds: Set<string>; mirrors: Set<string> }>>();
  for (const r of reads) {
    const hit = new Set<string>();
    if (r.owner === "CardInstance") {
      for (const e of instanceToEntries.get(r.field) ?? []) hit.add(e);
    } else if (nameSet.has(r.field)) {
      hit.add(r.field);
    }
    for (const e of hit) {
      const bySite = readersByEntry.get(e) ?? new Map();
      const slot = bySite.get(r.site) ?? { kinds: new Set<string>(), mirrors: new Set<string>() };
      for (const k of r.kinds) slot.kinds.add(k);
      if (r.owner !== "CardDef" && r.owner !== "CardInstance") slot.mirrors.add(r.owner);
      bySite.set(r.site, slot);
      readersByEntry.set(e, bySite);
    }
  }

  // Cards: the loaded CardDef (after applyAbilityRecords) is what the engine sees.
  const catalog = loadCardCatalog(true);
  const raws = rawCards();
  const entries = new Map<string, Entry>();
  for (const name of names) {
    const cards: string[] = [];
    const via = new Set<SetVia>();
    for (const [id, def] of catalog) {
      if ((def as unknown as Record<string, unknown>)[name] === undefined) continue;
      cards.push(id);
      const raw = raws.get(id);
      if (raw) for (const v of setVia(raw, name)) via.add(v);
    }
    cards.sort();
    const cardDefKind = defFields.get(name) ?? null;
    const schemaKind = schemaProps.get(name) ?? null;
    const flag =
      cardDefKind === "boolean" ||
      cardDefKind === "number" ||
      schemaKind === "boolean" ||
      schemaKind === "integer";
    const bySite = readersByEntry.get(name) ?? new Map();
    const readers: Reader[] = sorted(bySite.keys()).map((site) => {
      const slot = bySite.get(site)!;
      return {
        site,
        kinds: flag ? sorted(slot.kinds) : [],
        ...(slot.mirrors.size ? { mirrors: sorted(slot.mirrors) } : {}),
      };
    });
    const kinds = sorted(readers.flatMap((r) => r.kinds));
    const inst = instanceOf(name);
    const entry: Entry = {
      cardDef: cardDefKind,
      schema: schemaKind,
      flag,
      ...(inst.length !== 1 || inst[0] !== name ? { instanceFields: inst } : {}),
      cardCount: cards.length,
      ...(cards.length <= CARD_LIST_LIMIT ? { cards } : {}),
      setVia: sorted(via),
      readers,
      kinds,
    };
    entries.set(name, entry);
  }

  const flagKinds = new Map<string, string[]>();
  for (const [name, e] of entries) if (e.kinds.length) flagKinds.set(name, e.kinds);
  const unread = names.filter((n) => entries.get(n)!.readers.length === 0);
  const unset = names.filter((n) => entries.get(n)!.cardCount === 0);
  const schemaByType: Record<string, number> = {};
  for (const t of schemaProps.values()) schemaByType[t] = (schemaByType[t] ?? 0) + 1;
  const flagValues = [...flagFields.values()];

  return {
    cardsPin: CARDS_PIN,
    counts: {
      cardDefFlags: flagFields.size,
      cardDefBoolean: flagValues.filter((k) => k === "boolean").length,
      cardDefNumber: flagValues.filter((k) => k === "number").length,
      schemaProperties: schemaProps.size,
      schemaByType: sortedRecord(schemaByType),
      entries: names.length,
      withKindBuildingReader: flagKinds.size,
      unread: unread.length,
      unset: unset.length,
    },
    flagKinds: sortedRecord(flagKinds),
    unread,
    unset,
    entries: sortedRecord(entries),
  };
}

function serialize(inv: Inventory): string {
  return `${JSON.stringify(inv, null, 2)}\n`;
}

function readBaseline(): Inventory | undefined {
  if (!existsSync(BASELINE_PATH)) return undefined;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Inventory;
}

function added(now: string[], before: string[]): string[] {
  const b = new Set(before);
  return now.filter((x) => !b.has(x));
}

// ---------------------------------------------------------------------------

describe("card flag inventory (CR audit tool 1.10)", () => {
  let inv: Inventory;
  let baseline: Inventory | undefined;

  beforeAll(() => {
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertCardsPinnedTag(CARDS_PIN);
    inv = buildInventory();
    baseline = readBaseline();
  }, 300_000);

  it("maps Tāo Salonga's maySwapIceOnAgendaScoredOrStolen to swap_two_ice", () => {
    const e = inv.entries.maySwapIceOnAgendaScoredOrStolen;
    expect(e).toBeDefined();
    expect(e.cardDef).toBe("boolean");
    expect(e.cards).toContain("tao-salonga-telepresence-magician");
    expect(e.setVia).toContain("declaration");
    expect(e.readers).toContainEqual({
      site: "src/actions/score.ts#fireScoreOrStealSideEffects",
      kinds: ["swap_two_ice"],
    });
    expect(e.kinds).toContain("swap_two_ice");
    expect(inv.flagKinds.maySwapIceOnAgendaScoredOrStolen).toContain("swap_two_ice");
  });

  it("is deterministic", () => {
    expect(serialize(buildInventory())).toBe(serialize(inv));
  }, 300_000);

  const expectNoGrowth = (): void => {
    if (!baseline || ALLOW_GROWTH) return;
    const hint =
      "The flag baseline only shrinks (plan area 10: no new flag for a one-off). " +
      "Use a declared ability or a field on an existing kind, or rerun with " +
      "UPDATE_CARD_FLAGS=1 ALLOW_CARD_FLAG_GROWTH=1 and explain why in the PR";
    expect(added(Object.keys(inv.entries), Object.keys(baseline.entries)), `new entries. ${hint}`).toEqual([]);
    expect(added(inv.unread, baseline.unread), `newly unread entries. ${hint}`).toEqual([]);
    expect(added(inv.unset, baseline.unset), `newly unset entries. ${hint}`).toEqual([]);
  };

  it("only shrinks: no new entry, unread entry or unset entry", () => {
    if (!baseline && !UPDATE) {
      throw new Error(`Missing ${relative(ROOT, BASELINE_PATH)}; run with UPDATE_CARD_FLAGS=1`);
    }
    expectNoGrowth();
  });

  it("matches tests/baselines/card-flags.json", () => {
    const text = serialize(inv);
    if (UPDATE) {
      expectNoGrowth();
      mkdirSync(dirname(BASELINE_PATH), { recursive: true });
      writeFileSync(BASELINE_PATH, text);
      return;
    }
    expect(baseline, "missing baseline; run with UPDATE_CARD_FLAGS=1").toBeDefined();
    const removed = added(Object.keys(baseline!.entries), Object.keys(inv.entries));
    expect(
      removed,
      "entries left the inventory; regenerate with UPDATE_CARD_FLAGS=1 npx vitest run tests/card-flag-inventory.test.ts",
    ).toEqual([]);
    expect(
      text,
      "inventory drifted from the baseline; regenerate with UPDATE_CARD_FLAGS=1 npx vitest run tests/card-flag-inventory.test.ts",
    ).toBe(serialize(baseline!));
  });
});

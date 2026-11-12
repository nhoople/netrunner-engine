/**
 * Generate docs/effect-ir-kinds.md, the reference for every Effect IR kind.
 *
 *   node scripts/build-kind-reference.mjs           print the reference to stdout
 *   node scripts/build-kind-reference.mjs --write   write docs/effect-ir-kinds.md
 *
 * `npm run kind-reference` runs the --write form.
 * tests/kind-reference.test.ts fails when the committed file is stale.
 *
 * Sources:
 * - kinds: `KNOWN_PRIMITIVE_KINDS` in src/effects/ir.ts;
 * - fields: the members of the `Primitive` union in src/effects/ir.ts, the
 *   type `Effect` runs through `{ op: "do"; action: Primitive }`;
 * - verbs: `PROCEDURE_VERBS` in src/effects/primitiveNames.ts;
 * - card use: every `kind` nested in the card JSON under vendor/cards-data;
 * - engine builds: a `kind: "<name>"` object property in src/ outside
 *   ir.ts, or a call from outside ir.ts to an `fx` helper in ir.ts that
 *   builds the kind.
 *
 * The output depends only on those files, so it is deterministic.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const KIND_REFERENCE_PATH = "docs/effect-ir-kinds.md";
export const KIND_REFERENCE_COMMAND = "npm run kind-reference";

function parse(path) {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function listFiles(dir, ext) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name.endsWith(ext)) out.push(path);
    }
  }
  return out.sort();
}

function findVariable(sf, name) {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name) return decl;
    }
  }
  throw new Error(`${name} not found in ${sf.fileName}`);
}

function findTypeAlias(sf, name) {
  for (const stmt of sf.statements) {
    if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === name) return stmt;
  }
  throw new Error(`type ${name} not found in ${sf.fileName}`);
}

/** String elements of `new Set([...])`. */
function setLiteralStrings(decl) {
  const init = decl.initializer;
  if (
    !init ||
    !ts.isNewExpression(init) ||
    !init.arguments ||
    !ts.isArrayLiteralExpression(init.arguments[0])
  ) {
    throw new Error(`${decl.name.getText()} is not new Set([...])`);
  }
  return init.arguments[0].elements.map((el) => {
    if (!ts.isStringLiteralLike(el)) {
      throw new Error(`non-literal entry in ${decl.name.getText()}: ${el.getText()}`);
    }
    return el.text;
  });
}

const printer = ts.createPrinter({ removeComments: true });

function typeText(node, sf) {
  return printer
    .printNode(ts.EmitHint.Unspecified, node, sf)
    .replace(/\s+/g, " ")
    .replace(/;\s*}/g, " }")
    .trim();
}

function literalStrings(typeNode) {
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    return [typeNode.literal.text];
  }
  if (ts.isUnionTypeNode(typeNode)) return typeNode.types.flatMap(literalStrings);
  return [];
}

/** kind -> list of field lists (one per union member naming that kind). */
function readPrimitiveFields(irSf) {
  const alias = findTypeAlias(irSf, "Effect");
  const doMember = ts.isUnionTypeNode(alias.type)
    ? alias.type.types.find(
        (m) =>
          ts.isTypeLiteralNode(m) &&
          m.members.some(
            (p) =>
              p.name?.getText() === "op" &&
              p.type &&
              literalStrings(p.type).includes("do"),
          ),
      )
    : undefined;
  const actionType = doMember?.members.find(
    (p) => p.name?.getText() === "action",
  )?.type;
  if (!actionType || !ts.isTypeReferenceNode(actionType)) {
    throw new Error('Effect has no { op: "do"; action: <type> } member');
  }
  const primitive = findTypeAlias(irSf, actionType.typeName.getText());
  if (!ts.isUnionTypeNode(primitive.type)) {
    throw new Error(`${primitive.name.text} is not a union`);
  }
  const byKind = new Map();
  for (const member of primitive.type.types) {
    if (!ts.isTypeLiteralNode(member)) {
      throw new Error(`unsupported Primitive member: ${member.getText()}`);
    }
    const kindProp = member.members.find((p) => p.name?.getText() === "kind");
    const kinds = kindProp?.type ? literalStrings(kindProp.type) : [];
    if (kinds.length === 0) {
      throw new Error(`Primitive member without a literal kind: ${member.getText()}`);
    }
    const fields = [];
    for (const p of member.members) {
      if (p === kindProp) continue;
      if (ts.isPropertySignature(p) && p.type) {
        fields.push(
          `${p.name.getText()}${p.questionToken ? "?" : ""}: ${typeText(p.type, irSf)}`,
        );
      } else {
        fields.push(typeText(p, irSf));
      }
    }
    for (const kind of kinds) {
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(fields);
    }
  }
  return byKind;
}

/** String literals an expression can evaluate to, through ?:, parens, and `as`. */
function expressionStrings(expr) {
  if (ts.isStringLiteralLike(expr)) return [expr.text];
  if (ts.isConditionalExpression(expr)) {
    return [...expressionStrings(expr.whenTrue), ...expressionStrings(expr.whenFalse)];
  }
  if (ts.isParenthesizedExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return expressionStrings(expr.expression);
  }
  if (ts.isAsExpression(expr)) {
    const fromType = literalStrings(expr.type);
    return fromType.length > 0 ? fromType : expressionStrings(expr.expression);
  }
  return [];
}

/** Kinds built by `kind: "<name>"` object properties anywhere under `node`. */
function builtKinds(node, known) {
  const out = new Set();
  const visit = (n) => {
    if (
      ts.isPropertyAssignment(n) &&
      n.name.getText() === "kind" &&
      ts.isObjectLiteralExpression(n.parent)
    ) {
      for (const k of expressionStrings(n.initializer)) {
        if (known.has(k)) out.add(k);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/**
 * fx helper name -> kinds it builds, following calls to other fx helpers
 * and to top-level functions in ir.ts.
 */
function readFxHelpers(irSf, known) {
  const fxDecl = findVariable(irSf, "fx");
  if (!fxDecl.initializer || !ts.isObjectLiteralExpression(fxDecl.initializer)) {
    throw new Error("fx is not an object literal");
  }
  const bodies = new Map();
  for (const prop of fxDecl.initializer.properties) {
    if (prop.name) bodies.set(`fx.${prop.name.getText()}`, prop);
  }
  for (const stmt of irSf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) bodies.set(stmt.name.text, stmt);
  }
  const direct = new Map();
  const calls = new Map();
  for (const [name, body] of bodies) {
    direct.set(name, builtKinds(body, known));
    const called = new Set();
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression.getText();
        if (bodies.has(callee) && callee !== name) called.add(callee);
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
    calls.set(name, called);
  }
  const resolved = new Map();
  const resolve = (name, seen) => {
    if (resolved.has(name)) return resolved.get(name);
    const out = new Set(direct.get(name));
    for (const callee of calls.get(name)) {
      if (seen.has(callee)) continue;
      for (const k of resolve(callee, new Set([...seen, callee]))) out.add(k);
    }
    if (seen.size === 1) resolved.set(name, out);
    return out;
  };
  const fxKinds = new Map();
  for (const name of bodies.keys()) {
    if (name.startsWith("fx.")) fxKinds.set(name.slice(3), resolve(name, new Set([name])));
  }
  return fxKinds;
}

function readEngineBuilt(root, irPath, known, fxKinds) {
  const built = new Map();
  const add = (kind, file) => {
    if (!built.has(kind)) built.set(kind, new Set());
    built.get(kind).add(file);
  };
  for (const path of listFiles(join(root, "src"), ".ts")) {
    if (path === irPath) continue;
    const sf = parse(path);
    const file = relative(root, path).split(sep).join("/");
    for (const k of builtKinds(sf, known)) add(k, file);
    const visit = (n) => {
      if (
        ts.isPropertyAccessExpression(n) &&
        n.expression.getText() === "fx" &&
        fxKinds.has(n.name.text)
      ) {
        for (const k of fxKinds.get(n.name.text)) add(k, file);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return built;
}

function collectKinds(node, out) {
  if (Array.isArray(node)) {
    for (const v of node) collectKinds(v, out);
    return;
  }
  if (node !== null && typeof node === "object") {
    if (typeof node.kind === "string") out.add(node.kind);
    for (const v of Object.values(node)) collectKinds(v, out);
  }
}

function readCardUse(root, known) {
  const cardsDir = join(root, "vendor/cards-data");
  const pin = JSON.parse(readFileSync(join(cardsDir, "PIN.json"), "utf8"));
  const byKind = new Map();
  let cards = 0;
  for (const side of ["corp", "runner"]) {
    for (const path of listFiles(join(cardsDir, side), ".json")) {
      const card = JSON.parse(readFileSync(path, "utf8"));
      if (typeof card.id !== "string") continue;
      cards += 1;
      const kinds = new Set();
      collectKinds(card.abilities ?? [], kinds);
      for (const k of kinds) {
        if (!known.has(k)) continue;
        if (!byKind.has(k)) byKind.set(k, new Set());
        byKind.get(k).add(card.id);
      }
    }
  }
  return { byKind, cards, tag: pin.tag ?? pin.version ?? "unknown" };
}

function verbOf(kind, verbs, packPrefixes) {
  let parts = kind.split("_");
  if (packPrefixes.has(parts[0])) return null;
  if (parts[0] === "may") parts = parts.slice(1);
  if (parts[0] === "corp" || parts[0] === "runner") parts = parts.slice(1);
  return verbs.has(parts[0]) ? parts[0] : null;
}

const cell = (s) => s.replace(/\|/g, "\\|");

function fieldsCell(variants) {
  const render = (fields) =>
    fields.length === 0 ? "—" : fields.map((f) => `\`${cell(f)}\``).join(", ");
  if (variants.length === 1) return render(variants[0]);
  return variants.map((f, i) => `(${i + 1}) ${render(f)}`).join("<br>");
}

/** Build the Markdown text of docs/effect-ir-kinds.md. */
export function buildKindReference(root = defaultRoot) {
  const irPath = join(root, "src/effects/ir.ts");
  const irSf = parse(irPath);
  const namesSf = parse(join(root, "src/effects/primitiveNames.ts"));

  const entries = setLiteralStrings(findVariable(irSf, "KNOWN_PRIMITIVE_KINDS"));
  const known = new Set(entries);
  const duplicates = [...new Set(entries.filter((k, i) => entries.indexOf(k) !== i))].sort();
  const verbs = new Set(setLiteralStrings(findVariable(namesSf, "PROCEDURE_VERBS")));
  const packPrefixes = new Set(
    setLiteralStrings(findVariable(namesSf, "PACK_CODE_PREFIXES")),
  );

  const fields = readPrimitiveFields(irSf);
  const fxKinds = readFxHelpers(irSf, known);
  const engine = readEngineBuilt(root, irPath, known, fxKinds);
  const cardUse = readCardUse(root, known);

  const kinds = [...known].sort();
  const cardCount = (k) => cardUse.byKind.get(k)?.size ?? 0;
  const cardUsed = kinds.filter((k) => cardCount(k) > 0);
  const singleCard = kinds.filter((k) => cardCount(k) === 1);
  const engineBuilt = kinds.filter((k) => engine.has(k));
  const engineOnly = kinds.filter((k) => cardCount(k) === 0 && engine.has(k));
  const both = kinds.filter((k) => cardCount(k) > 0 && engine.has(k));
  const neither = kinds.filter((k) => cardCount(k) === 0 && !engine.has(k));
  const noFields = kinds.filter((k) => !fields.has(k));
  const noKind = [...fields.keys()].filter((k) => !known.has(k)).sort();

  const groups = new Map();
  for (const k of kinds) {
    const verb = verbOf(k, verbs, packPrefixes) ?? "";
    if (!groups.has(verb)) groups.set(verb, []);
    groups.get(verb).push(k);
  }
  const groupOrder = [...groups.keys()].filter((v) => v !== "").sort();
  if (groups.has("")) groupOrder.push("");
  const groupTitle = (v) => (v === "" ? "No standard verb" : `\`${v}\``);
  const anchor = (v) => (v === "" ? "no-standard-verb" : `verb-${v}`);

  const builtBy = (k) => {
    const c = cardCount(k) > 0;
    const e = engine.has(k);
    if (c && e) return "card, engine";
    if (c) return "card";
    if (e) return "engine";
    return "none";
  };

  const L = [];
  L.push("# Effect IR kinds");
  L.push("");
  L.push(
    `<!-- Generated by scripts/build-kind-reference.mjs. Do not edit; regenerate with \`${KIND_REFERENCE_COMMAND}\`. -->`,
  );
  L.push("");
  L.push(
    "Every primitive kind the engine knows, with its fields, how many cards use it, and who builds it. " +
      "The grammar around the kinds (`seq`, `do`, `if`, `prevent`, `choose`) is in [effect-ir.md](effect-ir.md). " +
      "Kind names follow the verb rules in [`src/effects/primitiveNames.ts`](../src/effects/primitiveNames.ts).",
  );
  L.push("");
  L.push("## Totals");
  L.push("");
  L.push(`Card counts are from cards \`${cardUse.tag}\` (${cardUse.cards} cards).`);
  L.push("");
  L.push("| Measure | Count |");
  L.push("| --- | ---: |");
  L.push(`| Kinds in \`KNOWN_PRIMITIVE_KINDS\` | ${kinds.length} |`);
  L.push(`| Kinds used by card JSON | ${cardUsed.length} |`);
  L.push(`| Kinds used by exactly one card | ${singleCard.length} |`);
  L.push(`| Kinds built by the engine | ${engineBuilt.length} |`);
  L.push(`| Kinds built by both cards and the engine | ${both.length} |`);
  L.push(`| Engine-only kinds (no card uses them; the engine builds them) | ${engineOnly.length} |`);
  L.push(`| Kinds neither a card nor the engine builds | ${neither.length} |`);
  L.push(`| Verb groups | ${groupOrder.filter((v) => v !== "").length} |`);
  L.push(`| Kinds with no standard verb | ${groups.get("")?.length ?? 0} |`);
  L.push("");
  if (duplicates.length > 0) {
    L.push(
      `\`KNOWN_PRIMITIVE_KINDS\` has ${entries.length} entries; ` +
        `${duplicates.map((d) => `\`${d}\``).join(", ")} ${duplicates.length === 1 ? "appears" : "appear"} twice, ` +
        `so it names ${kinds.length} distinct kinds.`,
    );
    L.push("");
  }
  if (noFields.length > 0 || noKind.length > 0) {
    L.push(
      `Out of step: ${noFields.length} kinds have no \`Primitive\` member (${noFields.map((k) => `\`${k}\``).join(", ") || "none"}); ` +
        `${noKind.length} \`Primitive\` members are not in \`KNOWN_PRIMITIVE_KINDS\` (${noKind.map((k) => `\`${k}\``).join(", ") || "none"}).`,
    );
    L.push("");
  }
  L.push("## How to read this");
  L.push("");
  L.push(
    "- **Fields** come from the kind's member of the `Primitive` union in `src/effects/ir.ts` " +
      "(`Effect` reaches it through `{ op: \"do\"; action: Primitive }`). `?` marks an optional field. " +
      "A kind with more than one member lists each, numbered.",
  );
  L.push(
    "- **Cards** counts the cards whose `abilities` name the kind anywhere, nested or not. " +
      "A card counts once however often it names the kind.",
  );
  L.push(
    "- **Built by** says where the kind comes from. *card*: card JSON names it. " +
      "*engine*: code in `src/` outside `ir.ts` builds it, either as a `kind: \"…\"` object property " +
      "(continuations, flag-driven effects, `applyPrimitive` calls) or through an `fx` helper. " +
      "*none*: nothing builds it, but `ir.ts` still declares it.",
  );
  L.push(
    "- The engine scan reads string literals only. A kind built from a variable or a computed string is missed.",
  );
  L.push(
    "- Kinds are grouped by verb, the first word after an optional `may_` and `corp_` or `runner_` " +
      "(`PROCEDURE_VERBS` in `src/effects/primitiveNames.ts`). Kinds whose name skips the verb rule are listed last.",
  );
  L.push("");
  L.push("## Verbs");
  L.push("");
  L.push(
    groupOrder
      .map((v) => `[${v === "" ? "no standard verb" : v}](#${anchor(v)}) (${groups.get(v).length})`)
      .join(" · "),
  );
  L.push("");
  for (const v of groupOrder) {
    const list = groups.get(v);
    L.push(`<a id="${anchor(v)}"></a>`);
    L.push("");
    L.push(`## ${groupTitle(v)}`);
    L.push("");
    const used = list.filter((k) => cardCount(k) > 0).length;
    const eng = list.filter((k) => engine.has(k)).length;
    L.push(`${list.length} kinds: ${used} used by cards, ${eng} built by the engine.`);
    L.push("");
    L.push("| Kind | Fields | Cards | Built by |");
    L.push("| --- | --- | ---: | --- |");
    for (const k of list) {
      const f = fields.has(k) ? fieldsCell(fields.get(k)) : "*(no `Primitive` member)*";
      L.push(`| \`${k}\` | ${f} | ${cardCount(k)} | ${builtBy(k)} |`);
    }
    L.push("");
  }
  return L.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = buildKindReference();
  if (process.argv.includes("--write")) {
    const out = join(defaultRoot, KIND_REFERENCE_PATH);
    writeFileSync(out, text);
    console.log(`Kind reference written to ${out}`);
  } else {
    process.stdout.write(text);
  }
}

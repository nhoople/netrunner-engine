/**
 * TypeScript-AST scan for direct writes to procedure-owned state (CR audit
 * Phase 2, guard 1). Used by tests/state/procedure-write-guard.test.ts.
 *
 * A write is any of these on a tracked property:
 *   - assignment: `=`, `+=`, `-=`, `??=`, … (also through casts, `!`, and
 *     parentheses, and `x.prop = x.prop.filter(…)` reassignments);
 *   - `++` / `--`, and `delete`;
 *   - a mutating array call: `push`, `splice`, `unshift`, `shift`, `pop`,
 *     `sort`, `reverse`, `fill`, `copyWithin`, or `.length =`;
 *   - `Object.assign(target, { prop: … })` on a tracked type.
 *
 * A property is tracked only on the state type that owns it, checked with the
 * type checker, so a public-view object or a local record with a `zone` or
 * `position` field is not counted. Writes through an alias
 * (`const ice = server.ice; ice.push(x)`) are not seen: the receiver is then a
 * plain `string[]`.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

export const ROOT = process.cwd();

/** Owning state type → properties whose writes are procedure-owned. */
const TRACKED: Record<string, readonly string[]> = {
  CardInstance: ["zone", "hostId", "hostedCardIds", "rezzed"],
  Server: ["ice", "root"],
  PlayerState: ["installed", "hand", "deck", "discardPile", "scoreArea"],
  GameState: ["removedFromGame"],
  RunState: ["position", "attackedServerId"],
};

const PROPERTY_OWNERS = new Map<string, Set<string>>();
for (const [owner, props] of Object.entries(TRACKED)) {
  for (const p of props) {
    if (!PROPERTY_OWNERS.has(p)) PROPERTY_OWNERS.set(p, new Set());
    PROPERTY_OWNERS.get(p)!.add(owner);
  }
}

const MUTATORS = new Set([
  "push",
  "splice",
  "unshift",
  "shift",
  "pop",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

type WriteKind = "assign" | "update" | "delete" | "mutate" | "assign-object";

export type DirectWrite = {
  file: string;
  line: number;
  property: string;
  kind: WriteKind;
  text: string;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))
      out.push(path);
  }
  return out.sort();
}

/** Strip parentheses, `as`, `satisfies`, `<T>x` and `x!`. */
function strip(node: ts.Expression): ts.Expression {
  let n = node;
  for (;;) {
    if (
      ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isTypeAssertionExpression(n) ||
      ts.isSatisfiesExpression(n)
    ) {
      n = n.expression;
    } else {
      return n;
    }
  }
}

function typeNames(
  checker: ts.TypeChecker,
  type: ts.Type,
  out = new Set<string>(),
): Set<string> {
  const t = checker.getNonNullableType(type);
  if (t.isUnionOrIntersection()) {
    for (const member of t.types) typeNames(checker, member, out);
    return out;
  }
  const sym = t.aliasSymbol ?? t.getSymbol();
  if (sym) out.add(sym.getName());
  return out;
}

/** The tracked property a target expression names, if its receiver is an owning type. */
function trackedProperty(
  checker: ts.TypeChecker,
  target: ts.Expression,
): string | null {
  const t = strip(target);
  let name: string;
  let receiver: ts.Expression;
  if (ts.isPropertyAccessExpression(t)) {
    name = t.name.text;
    receiver = t.expression;
  } else if (
    ts.isElementAccessExpression(t) &&
    ts.isStringLiteralLike(t.argumentExpression)
  ) {
    name = t.argumentExpression.text;
    receiver = t.expression;
  } else {
    return null;
  }
  const owners = PROPERTY_OWNERS.get(name);
  if (!owners) return null;
  const names = typeNames(checker, checker.getTypeAtLocation(strip(receiver)));
  for (const n of names) if (owners.has(n)) return name;
  return null;
}

const ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

let cached: { program: ts.Program; files: string[] } | null = null;
let sampleCache: { program: ts.Program; files: string[] } | null = null;

/** A program of one test file, to check what the scanner sees. */
function sampleProgram(path: string): { program: ts.Program; files: string[] } {
  if (sampleCache && sampleCache.files[0] === path) return sampleCache;
  const configPath = join(ROOT, "tsconfig.json");
  const config = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  sampleCache = {
    program: ts.createProgram({
      rootNames: [path],
      options: { ...parsed.options, noEmit: true },
    }),
    files: [path],
  };
  return sampleCache;
}

function program(): { program: ts.Program; files: string[] } {
  if (cached) return cached;
  const configPath = join(ROOT, "tsconfig.json");
  const config = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  const files = walk(join(ROOT, "src"));
  cached = {
    program: ts.createProgram({
      rootNames: files,
      options: { ...parsed.options, noEmit: true },
    }),
    files,
  };
  return cached;
}

/**
 * Every direct write to a tracked property in src/**, or in the one file
 * `samplePath` names (a test fixture that checks the scanner).
 */
export function scanDirectWrites(samplePath?: string): DirectWrite[] {
  const { program: prog, files } = samplePath
    ? sampleProgram(join(ROOT, samplePath))
    : program();
  const checker = prog.getTypeChecker();
  const out: DirectWrite[] = [];
  for (const path of files) {
    const sf = prog.getSourceFile(path);
    if (!sf) throw new Error(`not in program: ${path}`);
    const file = relative(ROOT, path).split("\\").join("/");
    const record = (node: ts.Node, property: string, kind: WriteKind): void => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({
        file,
        line: line + 1,
        property,
        kind,
        text: node.getText(sf).replace(/\s+/g, " ").slice(0, 120),
      });
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isBinaryExpression(node) &&
        ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)
      ) {
        const lhs = strip(node.left);
        const p = trackedProperty(checker, lhs);
        if (p) record(node, p, "assign");
        // `x.hand.length = 0`
        if (
          ts.isPropertyAccessExpression(lhs) &&
          lhs.name.text === "length" &&
          trackedProperty(checker, lhs.expression)
        ) {
          record(node, trackedProperty(checker, lhs.expression)!, "mutate");
        }
      } else if (
        (ts.isPrefixUnaryExpression(node) ||
          ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken)
      ) {
        const p = trackedProperty(checker, node.operand);
        if (p) record(node, p, "update");
      } else if (ts.isDeleteExpression(node)) {
        const p = trackedProperty(checker, node.expression);
        if (p) record(node, p, "delete");
      } else if (ts.isCallExpression(node)) {
        const callee = strip(node.expression);
        if (ts.isPropertyAccessExpression(callee)) {
          if (MUTATORS.has(callee.name.text)) {
            const p = trackedProperty(checker, callee.expression);
            if (p) record(node, p, "mutate");
          } else if (
            callee.name.text === "assign" &&
            ts.isIdentifier(callee.expression) &&
            callee.expression.text === "Object" &&
            node.arguments.length >= 2
          ) {
            const owners = typeNames(
              checker,
              checker.getTypeAtLocation(strip(node.arguments[0]!)),
            );
            for (const arg of node.arguments.slice(1)) {
              const lit = strip(arg);
              if (!ts.isObjectLiteralExpression(lit)) continue;
              for (const prop of lit.properties) {
                const name =
                  prop.name &&
                  (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
                    ? prop.name.text
                    : null;
                if (!name) continue;
                const propOwners = PROPERTY_OWNERS.get(name);
                if (propOwners && [...owners].some((o) => propOwners.has(o))) {
                  record(prop, name, "assign-object");
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/** `{ file: { property: count } }`, keys sorted. */
export type WriteCounts = Record<string, Record<string, number>>;

export function countWrites(writes: DirectWrite[]): WriteCounts {
  const counts: WriteCounts = {};
  for (const w of writes) {
    counts[w.file] ??= {};
    counts[w.file]![w.property] = (counts[w.file]![w.property] ?? 0) + 1;
  }
  const sorted: WriteCounts = {};
  for (const file of Object.keys(counts).sort()) {
    sorted[file] = {};
    for (const p of Object.keys(counts[file]!).sort())
      sorted[file]![p] = counts[file]![p]!;
  }
  return sorted;
}

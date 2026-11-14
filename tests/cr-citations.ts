/**
 * Shared CR citation scanning for tests/rule-cite-map.test.ts (tool 1.5a,
 * citation existence) and tests/cr-citation-topics.test.ts (tool 1.5b,
 * citation topics). Not a test file: vitest only runs `*.test.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CR } from "../src/index.js";

export const ROOT = process.cwd();

export type CrNode = {
  id: string;
  kind: string;
  number: string;
  title: string | null;
  parent_id: string | null;
  child_ids: string[];
  text_markup: string;
  text_plain: string;
};

/** Every `.ts` file under src/, as absolute paths, sorted. */
export function srcFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) files.push(p);
    }
  };
  walk(join(ROOT, "src"));
  return files.sort();
}

export function rel(file: string): string {
  return relative(ROOT, file);
}

// `CR 8.5.11`, `CR 1.21.1–1.21.6`, `CR 7.2.1, 7.2.2 / 7.3`, `CR 9`.
export const CR_NUM = String.raw`\d+(?:\.\d+)+[a-z]?|\d+(?![\d.])`;
const CITE_SOURCE = String.raw`\bCR\s+((?:${CR_NUM})(?:\s*(?:,|–|—|-|/|&|and|or)\s*(?:${CR_NUM}))*)`;

export type LiteralCitation = {
  number: string;
  /** Offset of the whole `CR …` match in the file text. */
  index: number;
  /** Offset of this number in the file text. */
  numberIndex: number;
};

/** Every rule number in a literal `CR n.n…` citation in `text`. */
export function literalCitations(text: string): LiteralCitation[] {
  const out: LiteralCitation[] = [];
  for (const m of text.matchAll(new RegExp(CITE_SOURCE, "g"))) {
    const listStart = m.index + m[0].length - m[1]!.length;
    for (const n of m[1]!.matchAll(new RegExp(CR_NUM, "g"))) {
      out.push({ number: n[0], index: m.index, numberIndex: listStart + n.index });
    }
  }
  return out;
}

export function loadIndexNumbers(): Record<string, string> {
  return (
    JSON.parse(readFileSync(join(ROOT, "vendor/cr-data/index.json"), "utf8")) as {
      numbers: Record<string, string>;
    }
  ).numbers;
}

export function loadNodes(): CrNode[] {
  return JSON.parse(
    readFileSync(join(ROOT, "vendor/cr-data/nodes.json"), "utf8"),
  ) as CrNode[];
}

/** `CR.<key>` → rule number, from src/timing/labels.ts. */
export function labelNumbers(): Map<string, string> {
  return new Map(
    (Object.entries(CR) as Array<[string, { number: string }]>).map(
      ([k, v]) => [k, v.number],
    ),
  );
}

// ---------------------------------------------------------------------------
// Citation topics (CR audit tool 1.5b)
// ---------------------------------------------------------------------------

/**
 * The plan's topics (docs/plans/cr-audit-standardization-program.md, tool
 * 1.5). A mismatch is only reported for one of these: they are specific
 * enough that code about one of them and a rule that never mentions it
 * clearly differ.
 */
export const PLAN_TOPICS: Record<string, RegExp> = {
  visibility:
    /\b(?:visib\w*|visible|invisible|hidden|hide|hides|face ?up|face ?down|faces?|reveal(?:s|ed|ing)?|expos(?:e|es|ed|ing)|look(?:s|ed|ing)? at|secret|(?:may|can|cannot|can't|not) see|sees)\b/,
  swap: /\bswap\w*/,
  install: /\binstall(?:s|ed|ing|ation)?\b/,
  uninstall: /\buninstall\w*/,
  trash: /\btrash(?:es|ed|ing)?\b/,
  host: /\bhost(?:s|ed|ing)?\b/,
  rez: /\b(?:rez|rezz(?:ed|es|ing)|unrezzed)\b/,
  derez: /\bderez\w*/,
  access: /\baccess(?:es|ed|ing)?\b/,
  damage: /\b(?:damage|flatline\w*)\b/,
  run: /\b(?:runs?|run's|jack(?:s|ed|ing)? out)\b/,
  position: /\b(?:position\w*|outermost|innermost)\b/,
  // Not "then advance" (to the next step): a card is advanced.
  advance:
    /\badvanc(?:ed|ing|ement\w*|es)\b|\b(?:can|may|to|cannot|can't|not) (?:be )?advance\b|\badvance (?:a|an|the|it|them|this|that|each|cards?|agendas?)\b/,
  score: /\b(?:scor(?:e|es|ed|ing)|steal\w*|stole|stolen|agenda points?)\b/,
  checkpoint: /\bcheckpoints?\b/,
  trigger: /\b(?:trigger(?:s|ed|ing)?|conditional abilit\w*)\b/,
};

/**
 * CR sections whose defined terms widen a plan topic's vocabulary. The
 * first is the topic's home: a sibling citation there accounts for the
 * topic (see topicMismatch).
 */
const PLAN_TOPIC_SECTIONS: Record<string, string[]> = {
  visibility: ["1.21", "10.2"],
  swap: ["8.8"],
  install: ["8.5"],
  trash: ["1.19"],
  host: ["1.13"],
  rez: ["8.1"],
  access: ["7.1", "7.2"],
  damage: ["10.4"],
  run: ["6.1"],
  position: ["6.2"],
  advance: ["1.18"],
  score: ["1.17"],
  checkpoint: ["10.3"],
  trigger: ["9.6"],
};

/** Defined terms a plan topic's own pattern narrows on purpose. */
const NOT_WIDENED = new Set(["advance"]);

/**
 * Words too common in the engine's comments to say what a passage is
 * about. Dropped from CR section-title keywords and single-word defined
 * terms.
 */
const GENERIC = new Set(
  (
    "a an and or of the for from to in on at by with is general card cards rule rules " +
    "terminology other step steps part parts type types name text box object objects " +
    "symbol play area ability abilities active inactive draw take takes pay lose loses " +
    "gain gains spend spends action actions turn turns zone location destination effect " +
    "source using resolving instruction instructions condition open closes pass relevant " +
    "avoid mode find empty mark load movement success initiation overview extra starting " +
    "ending game timing structure phase remove set aside status interpreting information " +
    "additional pending instances suffers announces owner control ownership indicator " +
    "appendix reference corp corporation runner player players number numbers"
  ).split(" "),
);

/** Lowercase word → crude stem, so "advancing" and "advance" agree. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  for (let i = 0; i < 2; i++) {
    const s = w.replace(/(?:ment|ing|ed|es|s|e)$/, "");
    if (s.length < 3 || s === w) break;
    w = s;
  }
  return w;
}

/** camelCase / snake_case / prose → lowercase words. */
export function words(text: string): string[] {
  return (
    text
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .toLowerCase()
      .match(/[a-z][a-z']*/g) ?? []
  );
}

/** Plain, lowercase prose for topic matching (identifiers split). */
export function prose(text: string): string {
  return words(text).join(" ");
}

type Keyword = string[]; // stems that must all appear

export type TopicModel = {
  plan: Array<[string, RegExp[]]>;
  /** Stem → number of CR nodes whose text uses it. */
  df: Map<string, number>;
  /** `§<section>` → keywords from its title and defined terms. */
  sections: Map<string, Keyword[]>;
  byNumber: Map<string, CrNode>;
  byId: Map<string, CrNode>;
};

function subtree(node: CrNode, byId: Map<string, CrNode>): CrNode[] {
  const out: CrNode[] = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n);
    for (const c of n.child_ids) {
      const child = byId.get(c);
      if (child) stack.push(child);
    }
  }
  return out;
}

function definedTerms(node: CrNode): string[] {
  return [...(node.text_markup ?? "").matchAll(/\{term:([^}]*)\}/g)].map((m) =>
    m[1]!.trim().toLowerCase(),
  );
}

export function buildTopicModel(nodes: CrNode[]): TopicModel {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byNumber = new Map(nodes.map((n) => [n.number, n]));
  const sections = new Map<string, Keyword[]>();
  const sectionTerms = new Map<string, string[]>();
  for (const sec of nodes.filter((n) => n.kind === "section")) {
    const terms = subtree(sec, byId).flatMap(definedTerms);
    sectionTerms.set(sec.number, terms);
    const keys: Keyword[] = [];
    for (const w of words(sec.title ?? "")) {
      if (!GENERIC.has(w)) keys.push([stem(w)]);
    }
    for (const t of terms) {
      const ws = words(t).filter((w) => !GENERIC.has(w));
      if (ws.length > 0) keys.push(ws.map(stem));
    }
    sections.set(`§${sec.number}`, keys);
  }

  // Plan topics, widened by the defined terms of their CR sections where a
  // term is not already another topic's word.
  const plan: Array<[string, RegExp[]]> = [];
  for (const [topic, re] of Object.entries(PLAN_TOPICS)) {
    const res = [re];
    for (const num of PLAN_TOPIC_SECTIONS[topic] ?? []) {
      for (const term of sectionTerms.get(num) ?? []) {
        const t = prose(term);
        if (!t || (t.split(" ").length === 1 && GENERIC.has(t))) continue;
        if (Object.values(PLAN_TOPICS).some((r) => r.test(t)) || NOT_WIDENED.has(t)) continue;
        res.push(new RegExp(String.raw`\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`));
      }
    }
    plan.push([topic, res]);
  }
  const df = new Map<string, number>();
  for (const n of nodes) {
    for (const st of new Set(words(`${n.title ?? ""} ${n.text_plain ?? ""}`).map(stem))) {
      df.set(st, (df.get(st) ?? 0) + 1);
    }
  }
  return { plan, df, sections, byNumber, byId };
}

/** Plan topics and `§` section topics present in `text`. */
export function topicsOf(model: TopicModel, text: string): Set<string> {
  const p = prose(text);
  const out = new Set<string>();
  for (const [topic, res] of model.plan) {
    if (res.some((r) => r.test(p))) out.add(topic);
  }
  const stems = new Set(p.split(" ").filter(Boolean).map(stem));
  for (const [sec, keys] of model.sections) {
    if (keys.some((k) => k.every((s) => stems.has(s)))) out.add(sec);
  }
  return out;
}

function planOnly(topics: Set<string>): Set<string> {
  return new Set([...topics].filter((t) => !t.startsWith("§")));
}

export type RuleTopics = {
  /** What the rule is about: its own text, its titles, and its section. */
  core: Set<string>;
  /** `§` topics named in the rule's own text (code citations only). */
  mentions: Set<string>;
  /** Stems in the rule and everything under it that are rare in the CR. */
  rare: Set<string>;
  /** Plan topics anywhere in the rule's section (sub-rules and examples too). */
  scope: Set<string>;
  title: string;
};

/** At most this many CR nodes use the stem: a word that names a rule's subject. */
const RARE_DF = 12;

function isRare(model: TopicModel, st: string): boolean {
  return st.length >= 4 && !GENERIC.has(st) && (model.df.get(st) ?? 0) <= RARE_DF;
}

const ruleTopicCache = new WeakMap<TopicModel, Map<string, RuleTopics>>();

export function ruleTopics(model: TopicModel, number: string): RuleTopics | null {
  let cache = ruleTopicCache.get(model);
  if (!cache) ruleTopicCache.set(model, (cache = new Map()));
  const hit = cache.get(number);
  if (hit) return hit;
  const node = model.byNumber.get(number);
  if (!node) return null;

  const coreText: string[] = [node.title ?? "", node.text_plain ?? ""];
  const titles: string[] = [];
  const core = new Set<string>();
  for (let n: CrNode | undefined = node; n; n = n.parent_id ? model.byId.get(n.parent_id) : undefined) {
    if (n !== node) {
      coreText.push(n.title ?? "");
      if (n.kind === "subsection") coreText.push(n.text_plain ?? "");
    }
    if (n.kind === "section" || n.kind === "chapter") {
      titles.unshift(`${n.number} ${n.title ?? ""}`);
      if (n.kind === "section") core.add(`§${n.number}`);
    }
  }
  for (const t of planOnly(topicsOf(model, coreText.join(" . ")))) core.add(t);
  const scope = new Set(core);
  const rare = new Set<string>();
  const parent = node.parent_id ? model.byId.get(node.parent_id) : undefined;
  for (const d of [...subtree(node, model.byId), ...(parent ? [parent] : [])]) {
    for (const st of words(`${d.title ?? ""} ${d.text_plain ?? ""}`).map(stem)) {
      if (isRare(model, st)) rare.add(st);
    }
  }
  let section: CrNode = node;
  while (section.kind !== "section" && section.kind !== "chapter" && section.parent_id) {
    section = model.byId.get(section.parent_id)!;
  }
  for (const d of subtree(section, model.byId)) {
    for (const t of planOnly(topicsOf(model, `${d.title ?? ""} ${d.text_plain ?? ""}`))) {
      scope.add(t);
    }
  }
  const mentions = new Set(
    [...topicsOf(model, `${node.title ?? ""} ${node.text_plain ?? ""}`)].filter((t) =>
      t.startsWith("§"),
    ),
  );
  const own = node.kind === "section" || node.kind === "chapter" ? "" : ` › ${node.number}`;
  const out = { core, mentions, rare, scope, title: titles.join(" › ") + own };
  cache.set(number, out);
  return out;
}

// --- Code side -------------------------------------------------------------

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** Offset of a `//` that starts a trailing comment on `line`, or -1. */
function trailingCommentStart(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && line[i + 1] === "/") return i;
  }
  return -1;
}

function stripCommentMarkers(line: string): string {
  return line.replace(MARKER, "").replace(/\s*\*\/\s*$/, "");
}

const MARKER = /^\s*(?:\/\/+|\/\*\*?|\*\/|\*)?\s*/;

/**
 * The comment block around `lineNo` (0-based) as one string, and the offset
 * in it of column `col` on that line. `commentStart` is where a trailing
 * `//` comment starts on that line, or -1 when the line is all comment.
 */
function commentBlock(
  lines: string[],
  lineNo: number,
  col: number,
  commentStart: number,
): { text: string; at: number; first: number } {
  const own = lines[lineNo]!;
  const trailing = commentStart >= 0 && !COMMENT_LINE.test(own);
  const isLineComment = (l: string): boolean => /^\s*\/\//.test(l);
  const isBlockInner = (l: string): boolean => /^\s*\*(?!\/)/.test(l);
  const ownIsLine = trailing || isLineComment(own);
  let first = lineNo;
  if (!trailing) {
    if (ownIsLine) {
      while (first > 0 && isLineComment(lines[first - 1]!)) first--;
    } else if (!/^\s*\/\*/.test(own)) {
      while (first > 0 && isBlockInner(lines[first - 1]!)) first--;
      if (first > 0 && /^\s*\/\*/.test(lines[first - 1]!)) first--;
    }
  }
  let last = lineNo;
  if (ownIsLine) {
    while (last + 1 < lines.length && isLineComment(lines[last + 1]!)) last++;
  } else if (!/\*\/\s*$/.test(own)) {
    while (last + 1 < lines.length && isBlockInner(lines[last + 1]!)) last++;
  }
  const parts: string[] = [];
  let at = 0;
  let length = 0;
  for (let i = first; i <= last; i++) {
    const raw = i === lineNo && trailing ? own.slice(commentStart) : lines[i]!;
    const prefix = MARKER.exec(raw)![0].length;
    const part = raw.slice(prefix).replace(/\s*\*\/\s*$/, "").trimEnd();
    if (i === lineNo) {
      const inLine = col - (trailing ? commentStart : 0) - prefix;
      at = length + Math.max(0, Math.min(part.length, inLine));
    }
    parts.push(part);
    length += part.length + 1;
  }
  return { text: parts.join(" "), at, first };
}

/** The sentence of `text` that contains offset `at`, and where it starts. */
function sentenceAt(text: string, at: number): { sentence: string; start: number } {
  const ends = [...text.matchAll(/[.;!?](?=\s|$)/g)].map((m) => m.index);
  let start = 0;
  let end = text.length;
  for (const e of ends) {
    if (e < at) start = e + 1;
    else {
      end = e + 1;
      break;
    }
  }
  return { sentence: text.slice(start, end), start };
}

/**
 * In a sentence that cites several rules for several things ("swap-install
 * (CR 8.8.4b), on-draw set-aside (CR 8.4.5a)"), the words between the
 * previous citation and this one. Falls back to earlier segments when that
 * is only punctuation, so "(CR 1.18.1, CR 10.2.3a)" both read the clause
 * before the parenthesis.
 */
function clauseAt(sentence: string, at: number): string {
  const cites = [...sentence.matchAll(new RegExp(CITE_SOURCE, "g"))];
  if (cites.length < 2) return sentence;
  const segments: string[] = [];
  let from = 0;
  for (const m of cites) {
    if (m.index > at) break;
    segments.push(sentence.slice(from, m.index));
    from = m.index + m[0].length;
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    if (words(segments[i]!).length >= 2) return segments[i]!;
  }
  return sentence;
}

const FUNCTION_DECL = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|<[^>]*>\s*\(|\([^)]*\)\s*(?::[^=]+)?=>|\(\s*$|[\w$]+\s*=>)/,
  /^\s*["']?([\w$]+)["']?\s*:\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>/,
  /^\s+(?:(?:public|private|protected|static|async)\s+)*([\w$]+)\s*\([^;]*\)\s*(?::\s*[^{;]+)?\{\s*$/,
];
const NOT_A_FUNCTION = new Set(["if", "for", "while", "switch", "catch", "return", "function"]);

/** The nearest function-like declaration at or above `lineNo`: its name and line. */
export function enclosingFunction(
  lines: string[],
  lineNo: number,
): { name: string; line: number } {
  for (let i = lineNo; i >= 0 && i > lineNo - 400; i--) {
    for (const re of FUNCTION_DECL) {
      const m = re.exec(lines[i]!);
      if (m && !NOT_A_FUNCTION.has(m[1]!)) return { name: m[1]!, line: i };
    }
  }
  return { name: "", line: lineNo };
}

/** Remove citations, so rule numbers and label keys are not topic words. */
function stripCitations(text: string): string {
  return text
    .replace(/\bCR\.[\w$]+(?:\.(?:number|id))?/g, " ")
    .replace(new RegExp(CITE_SOURCE, "g"), " ")
    .replace(/\bappendix\s+[\d._a-z]+/gi, " ")
    .replace(/\brule_[\w]+/g, " ");
}

/** How far apart two code citations in one function may sit and still be one cite list. */
const SIBLING_LINES = 4;
/** How far above a code citation its context reaches inside the enclosing function. */
const CODE_LINES = 40;

export type Citation = {
  file: string;
  line: number; // 1-based
  number: string;
  /** `CR.<key>` when cited through src/timing/labels.ts. */
  label?: string;
  where: "comment" | "code" | "label";
  /** Words that say what the code is about: the comment sentence, or the enclosing function's name. */
  subject: string;
  /** `subject` plus nearby code; used to clear a citation, not to flag it. */
  context: string;
  /** Other rule numbers cited in the same sentence, or the same code cite list. */
  siblings: string[];
};

/** Every CR citation in src/: literal numbers, `CR.<key>` uses, and the labels themselves. */
export function scanCitations(): Citation[] {
  const labels = labelNumbers();
  const out: Citation[] = [];
  for (const file of srcFiles()) {
    const path = rel(file);
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    const lineStarts: number[] = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
    const lineOf = (offset: number): number => {
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid]! <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    // Code context: the enclosing function from its declaration (at most
    // CODE_LINES back) through two lines past the citation.
    const codeContext = (lineNo: number): string => {
      const fn = enclosingFunction(lines, lineNo);
      const parts: string[] = [];
      const from = Math.max(fn.line, lineNo - CODE_LINES);
      for (let i = from; i <= Math.min(lines.length - 1, lineNo + 2); i++) {
        const l = lines[i]!;
        if (COMMENT_LINE.test(l)) continue;
        const c = trailingCommentStart(l);
        parts.push(c >= 0 ? l.slice(0, c) : l);
      }
      return `${fn.name} ${parts.join(" ")}`;
    };
    type Ctx = { where: "comment" | "code"; subject: string; context: string; group: string };
    const contextAt = (offset: number): Ctx => {
      const lineNo = lineOf(offset);
      const line = lines[lineNo]!;
      const col = offset - lineStarts[lineNo]!;
      const tc = trailingCommentStart(line);
      if (COMMENT_LINE.test(line) || (tc >= 0 && tc < col)) {
        const block = commentBlock(lines, lineNo, col, COMMENT_LINE.test(line) ? -1 : tc);
        const { sentence, start } = sentenceAt(block.text, block.at);
        const full = words(stripCitations(sentence)).length < 4 ? block.text : sentence;
        const clause = full === sentence ? clauseAt(sentence, block.at - start) : full;
        return {
          where: "comment",
          subject: stripCitations(clause),
          context: stripCitations(full),
          group: `${block.first}:${full === sentence ? start : 0}`,
        };
      }
      return {
        where: "code",
        subject: enclosingFunction(lines, lineNo).name,
        context: stripCitations(codeContext(lineNo)),
        group: `${lineNo}`,
      };
    };

    const mine: Citation[] = [];
    const groups = new Map<Citation, string>();
    for (const c of literalCitations(text)) {
      // `CR 11.2_3_d` names an appendix timing step, not rule 11.2.
      if (text[c.numberIndex + c.number.length] === "_") continue;
      const { group, ...ctx } = contextAt(c.index);
      const cite: Citation = { file: path, line: lineOf(c.numberIndex) + 1, number: c.number, ...ctx, siblings: [] };
      groups.set(cite, group);
      mine.push(cite);
    }
    for (const m of text.matchAll(/\bCR\.([\w$]+)/g)) {
      const number = labels.get(m[1]!);
      if (!number) continue;
      const { group, ...ctx } = contextAt(m.index);
      const cite: Citation = { file: path, line: lineOf(m.index) + 1, number, label: `CR.${m[1]}`, ...ctx, siblings: [] };
      groups.set(cite, group);
      mine.push(cite);
    }
    if (path === "src/timing/labels.ts") {
      for (const [key, number] of labels) {
        const lineNo = lines.findIndex((l) => new RegExp(String.raw`^\s*${key}:\s*\{`).test(l));
        if (lineNo < 0) continue;
        const doc: string[] = [];
        for (let i = lineNo - 1; i >= 0 && COMMENT_LINE.test(lines[i]!); i--) {
          doc.unshift(stripCommentMarkers(lines[i]!));
        }
        const context = stripCitations(`${key} ${doc.join(" ")}`);
        mine.push({
          file: path,
          line: lineNo + 1,
          number,
          label: `CR.${key}`,
          where: "label",
          subject: context,
          context,
          siblings: [],
        });
      }
    }
    // Siblings: the same line or comment sentence, or for code, a cite list
    // spread over nearby lines.
    for (const c of mine) {
      const near = mine.filter((o) =>
        c.where === "code" && o.where === "code"
          ? Math.abs(o.line - c.line) <= SIBLING_LINES && o.subject === c.subject
          : o.line === c.line || (groups.has(c) && groups.get(o) === groups.get(c)),
      );
      c.siblings = [...new Set(near.map((o) => o.number))].filter((n) => n !== c.number);
    }
    out.push(...mine);
  }
  return out;
}

export type TopicMismatch = Citation & {
  /** Plan topics in the code that the cited rule never mentions. */
  topic: string;
  ruleTitle: string;
};

/** Rule sections that apply to every topic (CR 1.2 Golden Rules). */
const ANY_TOPIC = /^1\.2(?:\.|$)/;

/**
 * A citation whose code is about a plan topic the cited rule never
 * mentions, and which shares nothing with what the rule is about: no topic
 * of its core, no word that is rare in the CR and used by the rule.
 * Code citations (log lines, `fail` reasons, cite lists) take their
 * subject from the enclosing function, and a sibling citation on the same
 * line that matches the code clears them.
 */
export function topicMismatch(model: TopicModel, c: Citation): TopicMismatch | null {
  if (ANY_TOPIC.test(c.number)) return null;
  const rule = ruleTopics(model, c.number);
  if (!rule) return null; // existence is tool 1.5a
  const subject = topicsOf(model, c.subject);
  const all = new Set([...subject, ...topicsOf(model, c.context)]);
  const overlaps = (r: RuleTopics): boolean =>
    [...all].some((t) => r.core.has(t) || (c.where === "code" && r.mentions.has(t)));
  if (overlaps(rule)) return null;
  if (words(c.context).some((w) => rule.rare.has(stem(w)))) return null;
  const home = (t: string, n: string): boolean => {
    const h = PLAN_TOPIC_SECTIONS[t]?.[0];
    return h !== undefined && (n === h || n.startsWith(`${h}.`));
  };
  const missing = [...planOnly(subject)]
    .filter((t) => !rule.scope.has(t) && !c.siblings.some((n) => home(t, n)))
    .sort();
  if (missing.length === 0) return null;
  if (c.where === "code") {
    for (const n of c.siblings) {
      const r = ruleTopics(model, n);
      if (r && overlaps(r)) return null;
    }
  }
  return { ...c, topic: missing.join("+"), ruleTitle: rule.title };
}

/** Baseline key: file, cited number (and label), topic. No line number. */
export function mismatchKey(m: TopicMismatch): string {
  return `${m.file} CR ${m.number}${m.label ? ` (${m.label})` : ""} [${m.topic}]`;
}

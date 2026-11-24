/**
 * Minimal ICU MessageFormat: `{name}`, `{n, plural, =0 {…} one {# …} other {# …}}` and `{x, select, a {…} other {…}}`.
 * Numbers go through `Intl.NumberFormat`, plural categories through `Intl.PluralRules`. No quoting: messages never
 * need a literal `{` or `}`. Pure.
 */

export type MessageParams = Record<string, string | number>;

type Node = string | { hash: true } | { arg: string; kind?: 'plural' | 'select'; cases?: Record<string, Node[]> };

const cache = new Map<string, Node[]>();

class Cursor {
  i = 0;
  constructor(readonly src: string) {}
  get done(): boolean {
    return this.i >= this.src.length;
  }
  peek(): string {
    return this.src[this.i] ?? '';
  }
  skipSpaces(): void {
    while (/\s/.test(this.peek())) this.i++;
  }
  readUntil(stop: RegExp): string {
    const start = this.i;
    while (!this.done && !stop.test(this.peek())) this.i++;
    return this.src.slice(start, this.i).trim();
  }
  expect(char: string): void {
    if (this.peek() !== char) throw new Error(`Invalid message "${this.src}": expected "${char}" at ${this.i}`);
    this.i++;
  }
}

function parseNodes(cur: Cursor, inCase: boolean): Node[] {
  const nodes: Node[] = [];
  let text = '';
  const flush = () => {
    if (text) nodes.push(text);
    text = '';
  };
  while (!cur.done) {
    const c = cur.peek();
    if (c === '}' && inCase) break;
    if (c === '{') {
      flush();
      cur.i++;
      nodes.push(parseArgument(cur));
    } else if (c === '#' && inCase) {
      flush();
      nodes.push({ hash: true });
      cur.i++;
    } else {
      text += c;
      cur.i++;
    }
  }
  flush();
  return nodes;
}

function parseArgument(cur: Cursor): Node {
  const arg = cur.readUntil(/[,}]/);
  if (cur.peek() === '}') {
    cur.i++;
    return { arg };
  }
  cur.expect(',');
  const kind = cur.readUntil(/[,}]/);
  if (kind !== 'plural' && kind !== 'select') throw new Error(`Unsupported ICU argument type "${kind}"`);
  cur.expect(',');
  const cases: Record<string, Node[]> = {};
  for (;;) {
    cur.skipSpaces();
    if (cur.peek() === '}') break;
    const selector = cur.readUntil(/[\s{]/);
    cur.skipSpaces();
    cur.expect('{');
    cases[selector] = parseNodes(cur, true);
    cur.expect('}');
  }
  cur.expect('}');
  if (!('other' in cases)) throw new Error(`Invalid message "${cur.src}": "${arg}" has no "other" case`);
  return { arg, kind, cases };
}

function parse(message: string): Node[] {
  let nodes = cache.get(message);
  if (!nodes) {
    nodes = parseNodes(new Cursor(message), false);
    cache.set(message, nodes);
  }
  return nodes;
}

function render(nodes: Node[], params: MessageParams, locale: string, hash: number | null): string {
  let out = '';
  for (const node of nodes) {
    if (typeof node === 'string') out += node;
    else if ('hash' in node) out += new Intl.NumberFormat(locale).format(hash ?? 0);
    else {
      const value = params[node.arg];
      if (value === undefined) out += `{${node.arg}}`; // a missing parameter stays visible (and fails the tests)
      else if (!node.cases) out += typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value;
      else if (node.kind === 'plural') {
        const n = Number(value);
        const branch =
          node.cases[`=${n}`] ?? node.cases[new Intl.PluralRules(locale).select(n)] ?? node.cases.other ?? [];
        out += render(branch, params, locale, n);
      } else {
        out += render(node.cases[String(value)] ?? node.cases.other ?? [], params, locale, hash);
      }
    }
  }
  return out;
}

/** Formats `message` for `locale` (a malformed message returns itself rather than breaking the page). */
export function formatMessage(message: string, params: MessageParams = {}, locale = 'en'): string {
  try {
    return render(parse(message), params, locale, null);
  } catch {
    return message;
  }
}

/** Sorted parameter names a message needs (catalog parity test). Throws on a malformed message. */
export function messageParams(message: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      if (typeof node === 'string' || 'hash' in node) continue;
      names.add(node.arg);
      for (const branch of Object.values(node.cases ?? {})) walk(branch);
    }
  };
  walk(parse(message));
  return [...names].sort();
}

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const TEXT_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'title', 'placeholder', 'alt']);
/** Files that may keep literal text, with the reason (keep this list empty or justified). */
const ALLOWLIST = new Map<string, string>();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path);
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : [];
  });
}

/** Raw text in JSX (`<p>Hello</p>`) or in a text attribute (`aria-label="Hello"`): both must come from a catalog. */
function literalTexts(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && /\p{L}{2,}/u.test(node.text)) found.push(node.text.trim());
    if (
      ts.isJsxAttribute(node) &&
      TEXT_ATTRIBUTES.has(node.name.getText()) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      /\p{L}{2,}/u.test(node.initializer.text)
    ) {
      found.push(`${node.name.getText()}="${node.initializer.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('no literal text in JSX', () => {
  it('has no raw text in components (all text comes from src/i18n/messages)', () => {
    const offenders: Record<string, string[]> = {};
    for (const file of sourceFiles(SRC)) {
      const rel = file.slice(SRC.length + 1);
      if (ALLOWLIST.has(rel)) continue;
      const texts = literalTexts(file);
      if (texts.length > 0) offenders[rel] = texts;
    }
    expect(offenders).toEqual({});
  });
});

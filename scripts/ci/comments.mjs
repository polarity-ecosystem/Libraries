#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import postcss from 'postcss';
import { parse as parseHtml } from 'parse5';
import repoConfig from '../../eslint.config.mjs';
import polarity from '../eslint-plugin-polarity.mjs';
import { compare, initBaseline, readBaseline, shrink, writeBaseline } from './ratchet.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts', 'ci', 'comments.baseline.json');
const JSLIKE = /\.(js|mjs|cjs|ts|tsx)$/;
const CSS = /\.css$/;
const HTML = /\.html?$/;
const SOURCE = /\.(js|mjs|cjs|ts|tsx|css|html?)$/;
const JS_SCRIPT_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);
const RULE = 'polarity/no-comments';
const ADR = 'docs/adr/0001-comments-ban.md';

const ignoresBlock = repoConfig.find(
  (block) =>
    block &&
    typeof block === 'object' &&
    Array.isArray(block.ignores) &&
    Object.keys(block).length === 1,
);
if (!ignoresBlock) {
  throw new Error('comments: eslint.config.mjs has no global ignores block to mirror');
}

function commentsConfig() {
  return [
    ignoresBlock,
    {
      files: ['**/*.{js,mjs,cjs,ts,tsx}'],
      plugins: { polarity },
      linterOptions: { noInlineConfig: true },
      rules: { [RULE]: 'error' },
    },
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
  ];
}

function makeLinter() {
  return new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: commentsConfig() });
}

function countReports(results) {
  const counts = {};
  const fatals = [];
  for (const result of results) {
    const file = relative(ROOT, result.filePath).split(sep).join('/');
    for (const message of result.messages) {
      if (message.fatal) fatals.push(`${file}: ${message.message}`);
      else if (message.ruleId === RULE) counts[file] = (counts[file] ?? 0) + 1;
    }
  }
  return { counts, fatals };
}

async function countJs(text, filePath, linter) {
  const { counts, fatals } = countReports(await linter.lintText(text, { filePath }));
  return { count: counts[filePath] ?? 0, fatals };
}

function countCss(text, file) {
  try {
    const root = postcss.parse(text, { from: file });
    let count = 0;
    root.walk((node) => {
      if (node.type === 'comment') count += 1;
    });
    return { count, fatals: [] };
  } catch (err) {
    return { count: 0, fatals: [`${file}: ${err.message}`] };
  }
}

const elementText = (node) => (node.childNodes ?? []).map((c) => c.value ?? '').join('');

async function countHtmlFile(text, file, linter) {
  let count = 0;
  const fatals = [];
  const scripts = [];
  const styles = [];
  const walk = (node) => {
    if (node.nodeName === '#comment') count += 1;
    if (node.tagName === 'script') {
      const type = ((node.attrs ?? []).find((a) => a.name === 'type')?.value ?? '')
        .trim()
        .toLowerCase();
      if (JS_SCRIPT_TYPES.has(type)) scripts.push(elementText(node));
    } else if (node.tagName === 'style') {
      styles.push(elementText(node));
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(parseHtml(text));
  for (const [i, body] of scripts.entries()) {
    const result = await countJs(body, `${file}.script${i}.js`, linter);
    count += result.count;
    for (const f of result.fatals) fatals.push(`${file} <script ${i + 1}>: ${f}`);
  }
  for (const [i, body] of styles.entries()) {
    const result = countCss(body, `${file} <style ${i + 1}>`);
    count += result.count;
    fatals.push(...result.fatals);
  }
  return { count, fatals };
}

async function scan() {
  const tracked = execSync('git ls-files -z', { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((f) => SOURCE.test(f) && existsSync(join(ROOT, f)));
  const linter = makeLinter();
  const { counts, fatals } = countReports(
    await linter.lintFiles(tracked.filter((f) => JSLIKE.test(f))),
  );
  for (const file of tracked) {
    if (JSLIKE.test(file)) continue;
    const text = readFileSync(join(ROOT, file), 'utf8');
    const result = CSS.test(file)
      ? countCss(text, file)
      : await countHtmlFile(text, file, linter);
    fatals.push(...result.fatals);
    if (result.count) counts[file] = result.count;
  }
  return { counts, fatals };
}

export async function countInText(text, filePath) {
  if (CSS.test(filePath)) return countCss(text, filePath);
  if (HTML.test(filePath)) return countHtmlFile(text, filePath, makeLinter());
  return countJs(text, filePath, makeLinter());
}

const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

async function main() {
  const { counts, fatals } = await scan();
  if (fatals.length) {
    console.error(`comments: ${fatals.length} file(s) did not parse; the gate fails closed:`);
    for (const f of fatals.slice(0, 20)) console.error(`  ${f}`);
    return 2;
  }
  if (process.argv.includes('--list')) {
    for (const [file, n] of Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)))
      console.log(`${file}: ${n}`);
    console.log(`comments: ${total(counts)} comments in ${Object.keys(counts).length} files`);
    return 0;
  }
  if (process.argv.includes('--init')) {
    try {
      initBaseline(BASELINE, counts);
    } catch (err) {
      console.error(`comments: ${err.message}`);
      return 2;
    }
    console.log(
      `comments: baseline initialised (${total(counts)} comments in ${Object.keys(counts).length} files)`,
    );
    return 0;
  }
  let baseline;
  try {
    baseline = readBaseline(BASELINE, 0);
  } catch (err) {
    console.error(`comments: bad baseline scripts/ci/comments.baseline.json: ${err.message}`);
    return 2;
  }
  if (process.argv.includes('--update')) {
    const { next, added, refused } = shrink(baseline, counts);
    writeBaseline(BASELINE, next);
    for (const a of added)
      console.error(`comments: ${a.file} has ${a.count} comment(s); not added to the baseline`);
    for (const r of refused)
      console.error(`comments: ${r.file} rose ${r.from} -> ${r.to}; baseline count kept`);
    if (added.length || refused.length) {
      console.error(
        `comments: baseline written (${total(next)} comments); the files above still fail the check`,
      );
      return 1;
    }
    console.log(
      `comments: baseline written (${total(next)} comments in ${Object.keys(next).length} files)`,
    );
    return 0;
  }
  const { added, grew, gone, ok } = compare(baseline, counts);
  if (!ok) {
    for (const f of added)
      console.error(
        `comments: ${f} has ${counts[f]} comment(s) and is not in the baseline (${ADR})`,
      );
    for (const f of grew)
      console.error(
        `comments: ${f} rose ${baseline[f]} -> ${counts[f]} comment(s); it may only shrink`,
      );
    for (const f of gone)
      console.error(`comments: ${f} fell below its baseline; run --update to shrink the baseline`);
    console.error(`comments: FAIL (${total(counts)} comments, baseline ${total(baseline)}). ${ADR}`);
    return 1;
  }
  console.log(
    `comments: ${total(counts)} comments in ${Object.keys(counts).length} files (baseline ${total(baseline)}), none rose`,
  );
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(await main());

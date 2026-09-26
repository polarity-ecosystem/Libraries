import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, shrink } from '../scripts/ci/ratchet.mjs';
import { countInText } from '../scripts/ci/comments.mjs';

test('a clean file reports no comments; comment-shaped strings, templates and regexes are not comments', async () => {
  const { count, fatals } = await countInText(
    'const s = "// not a comment";\nconst t = `/* nor this */`;\nconst r = /\\/\\*/;\nexport const a = 1;\n',
    'clean.js',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 0);
});

test('every comment kind counts; a shebang is a directive, not a comment', async () => {
  const { count, fatals } = await countInText(
    '#!/usr/bin/env node\n// line\n/* block */\n/** jsdoc */\nexport const a = 1;\n',
    'tool.mjs',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 3);
});

test('an eslint directive is a comment and cannot suppress its own count', async () => {
  const { count } = await countInText(
    '/* eslint-disable polarity/no-comments */\n// hidden\nexport const a = 1;\n',
    'evade.js',
  );
  assert.equal(count, 2);
});

test('ts and tsx sources count comments through the typescript parser', async () => {
  const ts = await countInText('const n: number = 1; // typed\n', 'x.ts');
  const tsx = await countInText('export const c = <div />; /* ui */\n', 'x.tsx');
  assert.equal(ts.count, 1);
  assert.equal(tsx.count, 1);
  assert.deepEqual(ts.fatals, []);
  assert.deepEqual(tsx.fatals, []);
});

test('a file that does not parse surfaces a fatal so the gate fails closed', async () => {
  const { count, fatals } = await countInText('const = ;', 'bad.js');
  assert.equal(count, 0);
  assert.equal(fatals.length, 1);
  assert.match(fatals[0], /bad\.js/);
});

test('css comments count through the postcss parser; comment-shaped strings do not', async () => {
  const { count, fatals } = await countInText(
    'a::before { content: "/* not a comment */"; }\n/* real */\nb { x: y; }\n',
    'styles.css',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 1);
});

test('a stylesheet that does not parse surfaces a fatal so the gate fails closed', async () => {
  const { count, fatals } = await countInText('/* never closed\na { x: y; }\n', 'bad.css');
  assert.equal(count, 0);
  assert.equal(fatals.length, 1);
  assert.match(fatals[0], /bad\.css/);
});

test('html comments count through the parse5 tree; comment-shaped text and attributes do not', async () => {
  const { count, fatals } = await countInText(
    '<!doctype html><p title="<!-- not one -->">&lt;!-- nor this --&gt;</p><!-- real -->\n',
    'index.html',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 1);
});

test('comments inside inline script and style bodies count through the js and css parsers', async () => {
  const { count, fatals } = await countInText(
    '<script>// inside\ndoThing();</script><style>/* inside */\na { x: y; }</style>\n',
    'index.html',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 2);
});

test('a non-js script type is data, not code; its body is not counted or parsed', async () => {
  const { count, fatals } = await countInText(
    '<script type="application/json">{ "a": "// not a comment" }</script>\n',
    'index.html',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 0);
});

test('an inline script that does not parse fails closed, not silently', async () => {
  const { count, fatals } = await countInText('<script>const = ;</script>\n', 'index.html');
  assert.equal(count, 0);
  assert.equal(fatals.length, 1);
  assert.match(fatals[0], /index\.html/);
});

test('comments inside a template element count; parse5 stores them under content', async () => {
  const { count, fatals } = await countInText(
    '<template><div><!-- inside template --></div></template>\n',
    'index.html',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 1);
});

test('comments inside event-handler and style attributes count through the js and css parsers', async () => {
  const { count, fatals } = await countInText(
    '<button onclick="save(); // handle">go</button><p style="color: red; /* tint */">x</p>\n',
    'index.html',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 2);
});

test('a script type with parameters still counts; the mime essence is what matters', async () => {
  const { count, fatals } = await countInText(
    '<script type="text/javascript; charset=utf-8">// inside\nvar x = 1;</script>\n',
    'index.html',
  );
  assert.deepEqual(fatals, []);
  assert.equal(count, 1);
});

test('jsx, mts and cts sources count comments through their parsers', async () => {
  const jsx = await countInText('export const c = <div />; // ui\n', 'x.jsx');
  const mts = await countInText('const n: number = 1; // typed\n', 'x.mts');
  const cts = await countInText('const n: number = 1; /* typed */\n', 'x.cts');
  assert.equal(jsx.count, 1);
  assert.equal(mts.count, 1);
  assert.equal(cts.count, 1);
  assert.deepEqual(jsx.fatals, []);
  assert.deepEqual(mts.fatals, []);
  assert.deepEqual(cts.fatals, []);
});

test('a comment added to a clean file fails the gate as a new file', async () => {
  const { count } = await countInText('export const a = 1;\n// why\n', 'new.js');
  assert.equal(count, 1);
  const result = compare({}, { 'new.js': count });
  assert.deepEqual(result.added, ['new.js']);
  assert.equal(result.ok, false);
});

test('a comment added past a grandfathered count fails the gate as grown', async () => {
  const { count } = await countInText('// one\n// two\nexport const a = 1;\n', 'old.js');
  const result = compare({ 'old.js': 1 }, { 'old.js': count });
  assert.deepEqual(result.grew, ['old.js']);
  assert.equal(result.ok, false);
});

test('removing every comment drops the file out of the scan so --update shrinks the baseline to zero', async () => {
  const { count } = await countInText('export const a = 1;\n', 'old.js');
  const current = count ? { 'old.js': count } : {};
  const stale = compare({ 'old.js': 1 }, current);
  assert.deepEqual(stale.gone, ['old.js']);
  assert.equal(stale.ok, false);
  const { next, added, refused } = shrink({ 'old.js': 1 }, current);
  assert.deepEqual(next, {});
  assert.deepEqual(added, []);
  assert.deepEqual(refused, []);
  assert.equal(compare(next, current).ok, true);
});

test('--update never grows the baseline: added files stay out and risen counts keep the old floor', async () => {
  const { next, added, refused } = shrink(
    { 'old.js': 1 },
    { 'old.js': 3, 'new.css': 2 },
  );
  assert.deepEqual(next, { 'old.js': 1 });
  assert.deepEqual(added, [{ file: 'new.css', count: 2 }]);
  assert.deepEqual(refused, [{ file: 'old.js', from: 1, to: 3 }]);
});

test('a shebang-only file never enters the counts map, so scripts can reach zero', async () => {
  const { count } = await countInText('#!/usr/bin/env node\nexport const a = 1;\n', 'tool.mjs');
  assert.equal(count, 0);
});

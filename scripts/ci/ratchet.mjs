import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const has = (obj, key) => Object.hasOwn(obj, key);

export function sortedEntries(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function parseBaseline(text, floor) {
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('must be an object of path -> count');
  }
  const rawKeys = [...text.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map((m) => m[1]);
  const keys = Object.keys(parsed);
  if (rawKeys.length !== keys.length) throw new Error('duplicate keys');
  const sorted = [...keys].sort();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== sorted[i]) throw new Error('keys must be sorted');
    if (!isCanonicalPath(keys[i]))
      throw new Error(`${keys[i]}: paths are repo-relative, forward-slash, with no ./ or ../`);
    const v = parsed[keys[i]];
    if (!Number.isInteger(v) || v <= floor)
      throw new Error(`${keys[i]}: count must be an integer above ${floor}`);
  }
  return parsed;
}

export function isCanonicalPath(p) {
  if (typeof p !== 'string' || p === '' || p.startsWith('/') || p.includes('\\')) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export function initBaseline(path, counts) {
  if (existsSync(path)) {
    throw new Error(`${path} exists; --init seeds a baseline once, use --update to shrink it`);
  }
  writeBaseline(path, counts);
}

export function readBaseline(path, floor) {
  return parseBaseline(readFileSync(path, 'utf8'), floor);
}

export function writeBaseline(path, counts) {
  writeFileSync(path, JSON.stringify(sortedEntries(counts), null, 2) + '\n');
}

export function compare(baseline, current) {
  const added = Object.keys(current)
    .filter((f) => !has(baseline, f))
    .sort();
  const grew = Object.keys(baseline)
    .filter((f) => has(current, f) && current[f] > baseline[f])
    .sort();
  const gone = Object.keys(baseline)
    .filter((f) => !has(current, f) || current[f] < baseline[f])
    .sort();
  return { added, grew, gone, ok: !added.length && !grew.length && !gone.length };
}

export function shrink(baseline, current) {
  const next = {};
  const refused = [];
  for (const [f, n] of Object.entries(baseline)) {
    if (!has(current, f)) continue;
    next[f] = Math.min(n, current[f]);
    if (current[f] > n) refused.push({ file: f, from: n, to: current[f] });
  }
  const added = Object.keys(current)
    .filter((f) => !has(baseline, f))
    .sort()
    .map((f) => ({ file: f, count: current[f] }));
  return { next: sortedEntries(next), added, refused };
}

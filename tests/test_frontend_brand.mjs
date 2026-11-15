import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tagline = read('frontend/src/brand.ts').match(/TAGLINE="([^"]+)"/)[1];
const html = read('frontend/index.html');
const attr = pattern => html.match(pattern)?.[1];

test('the tagline is identical in the title, description and og:description', () => {
  assert.equal(attr(/<title>SITE\/\/FORGE — ([^<]+)<\/title>/), tagline);
  assert.equal(attr(/<meta name="description" content="([^"]+)"/), tagline);
  assert.equal(attr(/<meta property="og:description" content="([^"]+)"/), tagline);
});

test('the README leads with the same tagline', () => {
  assert.equal(read('README.md').match(/^\*\*(.+)\*\*$/m)?.[1], tagline);
});

test('the landing and the loading screen render the shared tagline', () => {
  assert.match(read('frontend/src/moon/MoonLanding.tsx'), /<p className="moon-tagline">\{TAGLINE\}<\/p>/);
  assert.match(read('frontend/src/App.tsx'), /<p className="tagline">\{TAGLINE\}<\/p>/);
});

test('every favicon link points at a shipped file', () => {
  const icons = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(icons.sort(), ['apple-touch-icon.png', 'favicon.ico', 'siteforge.svg']);
  for (const icon of icons) assert.ok(readFileSync(new URL(`../public/${icon}`, import.meta.url)).length > 0, icon);
});

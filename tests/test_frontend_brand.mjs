import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const brand = read('frontend/src/brand.ts');
const productName = brand.match(/PRODUCT_NAME="([^"]+)"/)[1];
const tagline = brand.match(/TAGLINE="([^"]+)"/)[1];
const html = read('frontend/index.html');
const attr = pattern => html.match(pattern)?.[1];

test('the title and metadata use the shared product name and tagline', () => {
  assert.equal(attr(/<title>([^<]+)<\/title>/), `${productName} — ${tagline}`);
  assert.equal(attr(/<meta property="og:title" content="([^"]+)"/), productName);
  assert.equal(attr(/<meta name="description" content="([^"]+)"/), tagline);
  assert.equal(attr(/<meta property="og:description" content="([^"]+)"/), tagline);
});

test('the README leads with the same product name and tagline', () => {
  const readme = read('README.md');
  assert.equal(readme.match(/^# (.+)$/m)?.[1], productName);
  assert.equal(readme.match(/^\*\*(.+)\*\*$/m)?.[1], tagline);
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

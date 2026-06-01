// Screenshot a URL with Playwright. Browsers come from the nix devenv
// (PLAYWRIGHT_BROWSERS_PATH); run inside `devenv shell`.
//
//   node scripts/screenshot.mjs <url> [out.png] [desktop|mobile]
//   screenshot http://localhost:3000 .screenshots/home.png mobile
//
// Captures a full-page PNG. Waits for network idle so lazy content settles.

import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const url = process.argv[2];
const out = process.argv[3] || 'screenshot.png';
const preset = process.argv[4] || 'desktop';

if (!url) {
  console.error('usage: node scripts/screenshot.mjs <url> [out.png] [desktop|mobile]');
  process.exit(1);
}

const presets = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: devices['iPhone 13'],
};

await mkdir(dirname(out), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext(presets[preset] ?? presets.desktop);
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
await page.screenshot({ path: out, fullPage: true });
await browser.close();

console.log(`Saved ${out} (${preset})`);

// Owner rule (2026-11-21): fonts ship with the app. Opening every screen in English and Arabic (and the sign-in page)
// must not request anything from Google Fonts (fonts.googleapis.com / fonts.gstatic.com).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const VIEWS = ['dash', 'analytics', 'growth', 'audit', 'director', 'auto', 'studio', 'series', 'qa', 'reports', 'onboard', 'know', 'integ', 'trust'];

test('no request to Google Fonts on any screen, English and Arabic; both shipped fonts load from the app', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors, requests }) => {
    for (const lang of ['en', 'ar']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); }, lang);
      for (const v of VIEWS) {
        await page.evaluate((v) => A.go(v), v);
        await page.waitForTimeout(250);
      }
      await page.evaluate(() => document.fonts.ready);
    }
    const google = requests.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u));
    assert.deepEqual(google, []);
    const fonts = requests.filter((u) => /\/vendor\/fonts\/.+\.woff2$/.test(u));
    assert.ok(fonts.some((u) => /plus-jakarta-sans-latin-\d+-normal\.woff2$/.test(u)), 'the Latin font loads from the app');
    assert.ok(fonts.some((u) => /ibm-plex-sans-arabic-arabic-\d+-normal\.woff2$/.test(u)), 'the Arabic font loads from the app');
    assert.ok(await page.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans"', 'Hello')), 'Plus Jakarta Sans is available');
    assert.deepEqual(errors, []);
  });
});

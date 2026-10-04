'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), online = process.argv.includes('--online'), release = process.argv.includes('--release'), mode = online ? 'online' : release ? 'release' : 'source', folder = release ? path.join(root, 'release/web') : root;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com/?v=5.0.0' : 'http://127.0.0.1:4198', out = path.join(root, 'reports', '5.0-music-browser-' + mode), files = {};
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), results = [];
  try {
    for (const viewport of online ? [{ width: 844, height: 390 }] : [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 900, isMobile: viewport.width < 900 }), page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (!online) await context.route('**/*', route => {
        const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.includes('/vendor/')) return route.abort();
        const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
        if (!file.startsWith(folder + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        const body = fs.readFileSync(file); files[name] = crypto.createHash('sha256').update(body).digest('hex');
        return route.fulfill({ body, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
      });
      const responses = [];
      if (online) page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin === new URL(origin).origin && (response.request().resourceType() === 'document' || /\.(js|css)$/.test(url.pathname))) responses.push((async () => {
          const body = await response.body(); files[decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html'] = { status: response.status(), sha256: crypto.createHash('sha256').update(body).digest('hex') };
        })());
      });
      await context.addInitScript(() => {
        let Audio;
        Object.defineProperty(window, 'FrontierAudio', { configurable: true, get: () => Audio, set(value) {
          Audio = new Proxy(value, { construct(target, args, next) { const instance = Reflect.construct(target, args, next); window.__gameAudio ||= instance; return instance; } });
        } });
        localStorage.setItem('frontier-sound', 'off'); localStorage.setItem('frontier-music', 'on');
      });
      await page.goto(origin);
      const noticeAccepted = online && await page.locator('#submitBtn').count() > 0;
      if (noticeAccepted) { assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click({ timeout: 20000 }); }
      await page.waitForFunction(() => typeof window.FrontierAudio === 'function');
      const before = await page.evaluate(() => {
        window.audio = new FrontierAudio(); audio.setScene('explore', 'ruins');
        const start = document.createElement('button'); start.id = 'music-probe'; start.textContent = 'Start audio'; start.style.cssText = 'position:fixed;top:4px;left:4px;z-index:999999'; document.body.append(start); start.onclick = () => audio.play('click');
        return { context: !!audio.context, timer: audio.musicTimer, voices: audio.voices };
      });
      assert.deepEqual(before, { context: false, timer: null, voices: 0 });
      await page.locator('#music-probe').click();
      await page.waitForFunction(() => audio.context?.state === 'running' && audio.musicVoices.size > 0);
      await page.evaluate(() => { window.analyser = audio.context.createAnalyser(); analyser.fftSize = 2048; audio.musicGain.connect(analyser); });
      const scenes = [];
      for (const scene of ['explore', 'combat', 'boss']) {
        await page.evaluate(scene => audio.setScene(scene, 'ruins'), scene);
        await page.waitForTimeout(850);
        const sample = await page.evaluate(() => {
          const data = new Float32Array(analyser.fftSize), bins = new Float32Array(analyser.frequencyBinCount);
          analyser.getFloatTimeDomainData(data); analyser.getFloatFrequencyData(bins);
          return { state: audio.context.state, rms: Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length),
            peak: Math.max(...data.map(Math.abs)), voices: audio.musicVoices.size,
            pitchedBins: [...bins].filter((value, index) => index > 3 && value > -75).length };
        });
        assert.equal(sample.state, 'running'); assert.ok(sample.rms > .001 && sample.peak < .5); assert.ok(sample.voices <= 12); assert.ok(sample.pitchedBins >= 4);
        scenes.push({ scene, ...sample });
      }
      const timer = await page.evaluate(() => { const before = audio.musicTimer; for (let i = 0; i < 120; i++) audio.setScene('boss', 'ruins'); return { before, after: audio.musicTimer }; });
      assert.equal(timer.before, timer.after);
      await page.evaluate(() => { audio.setScene('silent'); for (let i = 0; i < 120; i++) audio.setScene('silent'); });
      await page.waitForTimeout(150);
      const paused = await page.evaluate(() => { const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data); return { timer: audio.musicTimer, voices: audio.musicVoices.size, rms: Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length) }; });
      assert.equal(paused.timer, null); assert.equal(paused.voices, 0); assert.ok(paused.rms < .0001);
      await page.evaluate(async () => { audio.setScene('combat'); await audio.context.suspend(); });
      await page.waitForTimeout(30);
      const suspended = await page.evaluate(() => ({ state: audio.context.state, timer: audio.musicTimer }));
      assert.deepEqual(suspended, { state: 'suspended', timer: null }); assert.deepEqual(errors, []);
      await page.evaluate(async () => { audio.setScene('silent'); await audio.context.close(); document.querySelector('#music-probe').remove(); });
      await page.locator('#voyage-entry').click(); await page.locator('#start-voyage').click(); await page.locator('#sound-toggle').click();
      await page.waitForFunction(() => __gameAudio.context?.state === 'running' && __gameAudio.musicTimer !== null && __gameAudio.musicVoices.size > 0);
      const ui = { started: await page.evaluate(() => ({ enabled: __gameAudio.enabled, musicEnabled: __gameAudio.musicEnabled, scene: __gameAudio.musicScene })) };
      assert.equal(ui.started.enabled, true); assert.equal(ui.started.musicEnabled, true); assert.notEqual(ui.started.scene, 'silent');
      await page.locator('#help-toggle').click(); await page.waitForTimeout(150);
      ui.help = await page.evaluate(() => ({ scene: __gameAudio.musicScene, timer: __gameAudio.musicTimer, voices: __gameAudio.musicVoices.size }));
      assert.deepEqual(ui.help, { scene: 'silent', timer: null, voices: 0 });
      await page.locator('#music-preference').click(); assert.equal(await page.locator('#music-preference').getAttribute('aria-pressed'), 'false');
      await page.locator('#close-help').click();
      if (await page.locator('#resume-run').isVisible()) await page.locator('#resume-run').click();
      await page.waitForTimeout(150); ui.musicOff = await page.evaluate(() => ({ enabled: __gameAudio.enabled, musicEnabled: __gameAudio.musicEnabled, timer: __gameAudio.musicTimer, stored: localStorage.getItem('frontier-music') }));
      assert.deepEqual(ui.musicOff, { enabled: true, musicEnabled: false, timer: null, stored: 'off' });
      await page.locator('#help-toggle').click(); await page.locator('#music-preference').click(); await page.locator('#close-help').click();
      if (await page.locator('#resume-run').isVisible()) await page.locator('#resume-run').click();
      await page.waitForFunction(() => __gameAudio.musicTimer !== null);
      await page.locator('#sound-toggle').click(); await page.waitForTimeout(150);
      ui.masterOff = await page.evaluate(() => ({ enabled: __gameAudio.enabled, musicEnabled: __gameAudio.musicEnabled, timer: __gameAudio.musicTimer, voices: __gameAudio.musicVoices.size }));
      assert.deepEqual(ui.masterOff, { enabled: false, musicEnabled: true, timer: null, voices: 0 });
      assert.deepEqual(errors, []); await Promise.all(responses); results.push({ viewport, before, scenes, timer, paused, suspended, ui, noticeAccepted, errors }); await context.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ok: true, mode, files, realWebAudio: true, results }, null, 2));
    console.log(JSON.stringify({ ok: true, cases: results.length, output: path.relative(root, path.join(out, 'results.json')) }));
  } catch (error) {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ok: false, mode, files, results, error: error.stack }, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

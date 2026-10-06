#!/usr/bin/env node
'use strict';

// npm ci --ignore-scripts
// npm run build
// Only release/web is intended for uploading to static hosting.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const toolRoot = path.join(root, 'build-tools', 'web');
const releaseRoot = path.join(root, 'release', 'web');
const assetsRoot = path.join(releaseRoot, 'assets');
const jsFiles = ['profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js'];
const vendorFiles = ['vendor/cloudbase.full.js', 'vendor/cloudbase.LICENSE.txt'];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const digest = content => crypto.createHash('sha256').update(content).digest('hex');

function ensureReleasePath() {
  if (path.relative(root, releaseRoot) !== path.join('release', 'web')) throw new Error('Unexpected release directory.');
  for (const directory of [path.join(root, 'release'), releaseRoot, assetsRoot]) {
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('Refusing to build into a linked directory: ' + directory);
  }
  fs.mkdirSync(assetsRoot, { recursive: true });
  for (const entry of fs.readdirSync(releaseRoot)) {
    if (!['index.html', 'assets', 'vendor'].includes(entry)) throw new Error('Unexpected existing public file: ' + entry);
  }
  for (const entry of fs.readdirSync(assetsRoot)) {
    if (!/^game\.[a-f0-9]{12}\.(js|css)$/.test(entry) || !fs.lstatSync(path.join(assetsRoot, entry)).isFile()) {
      throw new Error('Unexpected existing public asset: ' + entry);
    }
  }
}

function verifyBundledEngine(jsName) {
  const verificationRoot = path.join(toolRoot, '.verification');
  fs.mkdirSync(verificationRoot, { recursive: true });
  const loaderPath = path.join(verificationRoot, 'bundled-engine.cjs');
  const bundlePath = path.join(assetsRoot, jsName);
  // Execute the actual combined release bundle in this Node realm. Stop only at
  // its first DOM access, after the engine/renderer/audio have been registered.
  // Keeping the same realm lets all existing deep equality assertions run intact.
  fs.writeFileSync(loaderPath, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const bundle = fs.readFileSync(" + JSON.stringify(bundlePath) + ", 'utf8');",
    "const stopAtUi = new Error('UI boundary');",
    'const exported = { exports: {} };',
    'let reachedUi = false;',
    "try { new Function('window', 'module', 'document', bundle)({}, exported, { getElementById() { throw stopAtUi; } }); }",
    'catch (error) { if (error !== stopAtUi) throw error; reachedUi = true; }',
    "if (!reachedUi || typeof exported.exports.Game !== 'function') throw new Error('Bundle did not expose its engine before the UI.');",
    'module.exports = exported.exports;',
    ''
  ].join('\n'));
  const originalImport = "require('../action-engine.js')";
  const testPaths = ['action-engine', 'projectile-collision', 'damage-source', 'frame-timing', 'interaction-targets', 'grenade-preview', 'secret-techniques', 'secret-depth', 'trials', 'encounters', 'evolutions', 'storm-sector', 'campaign', 'campaign-integration', 'campaign-awakenings', 'ruins-starline', '4.0-integration', 'voyage', 'voyage-integration', 'battlefield', 'salvage', 'salvage-risk', 'salvage-comms', 'salvage-lastchance'].map(name => {
    const tests = read('tests/' + name + '.test.js');
    if (tests.split(originalImport).length !== 2) throw new Error('Expected one source engine import in ' + name);
    const testPath = path.join(verificationRoot, name + '.test.cjs');
    fs.writeFileSync(testPath, tests.replace(originalImport, "require('./bundled-engine.cjs')"));
    return testPath;
  });
  const result = spawnSync(process.execPath, ['--test', ...testPaths], { cwd: root, env: { ...process.env, FRONTIER_TEST_ROOT: root }, encoding: 'utf8', windowsHide: true });
  const output = (result.stdout || '') + (result.stderr || '');
  fs.writeFileSync(path.join(verificationRoot, 'test-output.txt'), output);
  if (result.error || result.status !== 0) throw new Error('Bundled engine regression failed:\n' + (result.error || output));
  const actualCount = output.match(/^(?:ℹ|#)\s*tests\s+(\d+)/m);
  if (!actualCount) throw new Error('Bundled test output did not contain its executed test count.');
  return { count: Number(actualCount[1]), passed: true };
}

async function main() {
  const { minify } = require('terser');
  const CleanCSS = require('clean-css');
  const sources = Object.fromEntries(jsFiles.map(file => [file, read(file)]));
  const originalCss = read('expedition.css');
  const originalHtml = read('index.html');
  const js = await minify(sources, {
    ecma: 2020,
    compress: { passes: 2, unsafe: false },
    mangle: { toplevel: false, properties: false },
    format: { comments: false, ascii_only: false },
    sourceMap: false
  });
  if (!js.code || js.map || /sourceMappingURL|sourceURL/.test(js.code)) throw new Error('Unexpected JavaScript output or source map.');
  const css = new CleanCSS({ level: 1, compatibility: '*', rebase: false, sourceMap: false }).minify(originalCss);
  if (css.errors.length || css.warnings.length) throw new Error('CSS compilation requires attention:\n' + [...css.errors, ...css.warnings].join('\n'));
  for (const feature of ['pointer:coarse', 'orientation:portrait', 'orientation:landscape', 'prefers-reduced-motion', ':fullscreen']) {
    if (!css.styles.includes(feature)) throw new Error('Responsive style missing after minification: ' + feature);
  }
  const jsName = 'game.' + digest(js.code).slice(0, 12) + '.js';
  const cssName = 'game.' + digest(css.styles).slice(0, 12) + '.css';
  let html = originalHtml.replace('href="expedition.css"', 'href="assets/' + cssName + '"');
  for (const file of jsFiles) {
    const tag = '<script src="' + file + '"></script>';
    if (!html.includes(tag)) throw new Error('Missing source script tag: ' + file);
    html = html.replace(tag, file === jsFiles[0] ? '<script src="assets/' + jsName + '"></script>' : '');
  }
  const links = /<div class="below-links">[\s\S]*?<\/div>/;
  if (!links.test(html)) throw new Error('Expected the source footer links.');
  html = html.replace(links, '<div class="below-links"><span>原创小游戏 · 星芽：荒原行动</span></div>');
  html = html.replace(/>\s+</g, '><').trim() + '\n';
  if (/garden\.html|REFERENCES\.md|action-engine\.js|action-renderer\.js|audio\.js|action\.js|sourceMappingURL/.test(html)) throw new Error('Source or old-game links leaked into public HTML.');

  ensureReleasePath();
  fs.mkdirSync(path.join(releaseRoot, 'vendor'), { recursive: true });
  for (const file of vendorFiles) fs.copyFileSync(path.join(root, file), path.join(releaseRoot, file));
  fs.writeFileSync(path.join(assetsRoot, jsName), js.code);
  fs.writeFileSync(path.join(assetsRoot, cssName), css.styles);
  fs.writeFileSync(path.join(releaseRoot, 'index.html'), html);
  // Remove only previously generated, validated hash assets; preserve all source
  // files and sibling archives. No recursive directory deletion is used.
  for (const entry of fs.readdirSync(assetsRoot)) {
    if (entry !== jsName && entry !== cssName) fs.unlinkSync(path.join(assetsRoot, entry));
  }
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = match[1];
    if (!['index.html', 'assets/' + jsName, 'assets/' + cssName].includes(reference)) throw new Error('Unexpected public reference: ' + reference);
    if (!fs.existsSync(path.join(releaseRoot, reference))) throw new Error('Missing public reference: ' + reference);
  }
  const tests = verifyBundledEngine(jsName);
  const files = ['index.html', 'assets/' + jsName, 'assets/' + cssName, ...vendorFiles].map(file => {
    const bytes = fs.readFileSync(path.join(releaseRoot, file));
    return { file, bytes: bytes.length, sha256: digest(bytes) };
  });
  const report = {
    releaseDirectory: 'release/web',
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    inputJavaScriptBytes: jsFiles.reduce((sum, file) => sum + Buffer.byteLength(sources[file]), 0),
    inputCssBytes: Buffer.byteLength(originalCss),
    bundledEngineTests: tests,
    checks: { sourceMaps: false, propertyMangling: false, sourceDownloads: false, runtimeDependencies: false, responsiveRulesPreserved: true }
  };
  fs.writeFileSync(path.join(toolRoot, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

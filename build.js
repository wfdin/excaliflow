/**
 * Excaliflow Zero-Dependency Build Tool
 * Concatenates modular source files into distribution bundles.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SRC_DIR = path.join(ROOT, 'src');
const CSS_DIR = path.join(ROOT, 'css');
const DIST_DIR = path.join(ROOT, 'dist');

const MODULE_FILES = [
  'constants.js',
  'prng.js',
  'state.js',
  'sketch.js',
  'geometry.js',
  'flow.js',
  'render.js',
  'hitTest.js',
  'elements.js',
  'history.js',
  'templates.js',
  'camera.js',
  'interactions.js',
  'editor.js',
  'export.js',
  'workspace.js',
  'ui.js',
  'init.js'
];

const STATIC_ASSETS = [
  'favicon.svg',
  'favicon.ico',
  'favicon.png',
  'apple-touch-icon.png'
];

function build() {
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // 1. Bundle JS modules into dist/excaliflow.bundle.js
  const jsParts = MODULE_FILES.map(file => {
    const filePath = path.join(SRC_DIR, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing module file: ${filePath}`);
    }
    return `/* --- Module: ${file} --- */\n` + fs.readFileSync(filePath, 'utf8');
  });

  const bundledJs = jsParts.join('\n\n');
  const bundlePath = path.join(DIST_DIR, 'excaliflow.bundle.js');
  fs.writeFileSync(bundlePath, bundledJs, 'utf8');
  console.log(`[BUILD] Generated ${bundlePath} (${(bundledJs.length / 1024).toFixed(1)} KB)`);

  // 2. Bundle CSS into dist/style.css
  const cssFile = path.join(CSS_DIR, 'style.css');
  let bundledCss = '';
  if (fs.existsSync(cssFile)) {
    bundledCss = fs.readFileSync(cssFile, 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'style.css'), bundledCss, 'utf8');
    console.log(`[BUILD] Generated dist/style.css (${(bundledCss.length / 1024).toFixed(1)} KB)`);
  }

  // 3. Copy static assets (favicons, icons) to dist/
  for (const asset of STATIC_ASSETS) {
    const srcAsset = path.join(ROOT, asset);
    if (fs.existsSync(srcAsset)) {
      fs.copyFileSync(srcAsset, path.join(DIST_DIR, asset));
    }
  }

  // 4. Generate standalone single-file dist/index.html
  // Inject backend API base URL (VPS domain) into the config script.
  // Local dev: API_URL unset -> same-origin relative /api/... paths.
  // Pages:     API_URL=https://api.example.com node build.js
  const apiBase = (process.env.API_URL || '').trim().replace(/\/+$/, '');
  const baseHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let standalone = baseHtml;

  standalone = standalone.replace(
    /window\.EXCALIFLOW_API_BASE\s*=\s*["'][^"']*["']/,
    `window.EXCALIFLOW_API_BASE = ${JSON.stringify(apiBase)}`
  );

  // Replace external css link with inline style in standalone dist
  standalone = standalone.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["']css\/style\.css["']\s*\/?>/i,
    `<style>\n${bundledCss}\n</style>`
  );

  // Replace script tags with single bundle or inline
  const scriptRegex = /<!-- Core Modules -->[\s\S]*?<!-- \/Core Modules -->/i;
  if (scriptRegex.test(standalone)) {
    standalone = standalone.replace(scriptRegex, `<script>\n${bundledJs}\n</script>`);
  }

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), standalone, 'utf8');
  console.log(`[BUILD] Generated standalone dist/index.html (${(standalone.length / 1024).toFixed(1)} KB)`);
}

if (require.main === module) {
  build();
}

module.exports = { build, MODULE_FILES };

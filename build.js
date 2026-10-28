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

  // 3. Generate standalone single-file dist/index.html
  const baseHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let standalone = baseHtml;

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

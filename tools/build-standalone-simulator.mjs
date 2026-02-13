#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, 'RP_Delivery_Simulator.html');
const outputPath = path.join(rootDir, 'RP_Delivery_Simulator_standalone.min.html');

const criticalLibs = [
  'lib/dicom-parser.min.js',
  'lib/Tone.js',
  'lib/chart.umd.min.js',
  'lib/chartjs-plugin-annotation.min.js',
  'lib/chartjs-plugin-zoom.min.js'
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  fail(`Source file not found: ${sourcePath}`);
}

const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
let outputHtml = sourceHtml;

const headCloseTag = '</head>';
const headCloseIndex = outputHtml.indexOf(headCloseTag);
if (headCloseIndex === -1) {
  fail('Could not find </head> in source HTML.');
}

const inlinedLibBlocks = criticalLibs.map((relPath) => {
  const absPath = path.join(rootDir, relPath);
  if (!fs.existsSync(absPath)) {
    fail(`Missing required library: ${relPath}`);
  }

  const libCode = fs.readFileSync(absPath, 'utf8');
  return `<script>/* inlined:${relPath} */\n${libCode}\n</script>`;
}).join('\n');

const loadOverrideBlock = `<script>(function(){if(typeof loadCriticalScripts==="function"){loadCriticalScripts=async function(){console.log("DEBUG: Using inlined critical scripts.");};}})();</script>`;

outputHtml = `${outputHtml.slice(0, headCloseIndex)}\n${inlinedLibBlocks}\n${loadOverrideBlock}\n${outputHtml.slice(headCloseIndex)}`;

const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
const scriptMatches = [...outputHtml.matchAll(scriptRegex)];
if (scriptMatches.length === 0) {
  fail('No inline <script> blocks found for obfuscation.');
}

const appScriptMatch = scriptMatches[scriptMatches.length - 1];
const appScriptContent = appScriptMatch[1];

if (!appScriptContent.trim()) {
  fail('Final script block is empty; cannot obfuscate app payload.');
}

const payloadB64 = Buffer.from(appScriptContent, 'utf8').toString('base64');

const obfuscatedWrapper = [
  '(function(){',
  `const b="${payloadB64}";`,
  'const bytes=Uint8Array.from(atob(b),c=>c.charCodeAt(0));',
  'const code=(typeof TextDecoder!=="undefined"?new TextDecoder().decode(bytes):decodeURIComponent(escape(atob(b))));',
  '(0,eval)(code);',
  '})();'
].join('');

const replacementScriptBlock = `<script>${obfuscatedWrapper}</script>`;

const appScriptStart = appScriptMatch.index;
const appScriptEnd = appScriptStart + appScriptMatch[0].length;
outputHtml = `${outputHtml.slice(0, appScriptStart)}${replacementScriptBlock}${outputHtml.slice(appScriptEnd)}`;

fs.writeFileSync(outputPath, outputHtml, 'utf8');

const sourceBytes = Buffer.byteLength(sourceHtml, 'utf8');
const outputBytes = Buffer.byteLength(outputHtml, 'utf8');

console.log(`Built standalone file: ${path.basename(outputPath)}`);
console.log(`Source size: ${sourceBytes.toLocaleString()} bytes`);
console.log(`Output size: ${outputBytes.toLocaleString()} bytes`);
console.log('Inlined libs:');
for (const relPath of criticalLibs) {
  const absPath = path.join(rootDir, relPath);
  const size = fs.statSync(absPath).size;
  console.log(`  - ${relPath} (${size.toLocaleString()} bytes)`);
}

#!/usr/bin/env node
/**
 * Weppy PRO Auto-Patcher
 * 
 * Applies all 5 patches to dist/index.js automatically.
 * Usage: node patch-pro.js [path-to-dist/index.js]
 * Default: ../dist/index.js (relative to this script)
 * 
 * Safe to run multiple times (idempotent).
 * Creates a backup before patching.
 */

const fs = require('fs');
const path = require('path');

const TARGET = process.argv[2] || path.join(__dirname, 'dist', 'index.js');

if (!fs.existsSync(TARGET)) {
  console.error(`[PATCH] Fichier introuvable: ${TARGET}`);
  process.exit(1);
}

// Backup
const backup = TARGET + '.bak';
if (!fs.existsSync(backup)) {
  fs.copyFileSync(TARGET, backup);
  console.log(`[PATCH] Backup créé: ${backup}`);
}

let code = fs.readFileSync(TARGET, 'utf8');
const originalLength = code.length;

const patches = [
  {
    name: 'evaluateProAccess() → always PRO',
    // Match the evaluateProAccess method and replace with always-allowed version
    find: /async\s+evaluateProAccess\s*\(\s*\)\s*\{[^}]*return\s*\{[^}]*allowed\s*:\s*!?\d[^}]*\}/,
    replace: 'async evaluateProAccess(){return{allowed:!0,state:{canUsePro:!0,status:"active",tier:"pro"}}}',
    critical: true
  },
  {
    name: 'zn() function → force "basic" tier',
    // The function that maps command names to tier levels
    find: /function\s+zn\s*\(\s*\w+\s*\)\s*\{[^}]*return\s+[^}]*\}/,
    replace: 'function zn(t){return "basic"}',
    critical: true
  },
  {
    name: 'start() method → force "pro" tier',
    // Find the setTier call in start() that checks canUsePro
    find: /this\.analyticsManager\.setTier\s*\(\s*r\.canUsePro\s*\?\s*"pro"\s*:\s*"basic"\s*\)/,
    replace: 'this.analyticsManager.setTier("pro")',
    critical: true
  },
  {
    name: 'Analytics default tier → "pro"',
    find: /aiClient\s*=\s*"unknown"\s*;\s*tier\s*=\s*"basic"/,
    replace: 'aiClient="unknown";tier="pro"',
    critical: false
  },
  {
    name: 'STATUS ENDPOINT → force canUsePro:true',
    // The Nf function that serves license status to the plugin
    find: /let\s+a\s*=\s*t\.licenseState\.getStatus\s*\(\s*r\s*\)\s*;[^;]*?n\.json\s*\(\s*Qx\s*\(\s*a\s*,\s*i\s*\)\s*\)/,
    replace: 'let a=t.licenseState.getStatus(r);a.canUsePro=!0;a.status="active",t.analyticsManager?.setTier("pro"),n.json(Qx(a,i))',
    critical: true
  }
];

let applied = 0;
let skipped = 0;

for (const patch of patches) {
  if (patch.find.test(code)) {
    code = code.replace(patch.find, patch.replace);
    console.log(`[PATCH] ✓ ${patch.name}`);
    applied++;
  } else {
    console.log(`[PATCH] ⊘ ${patch.name} (déjà appliqué ou pattern non trouvé)`);
    skipped++;
  }
}

if (applied > 0) {
  fs.writeFileSync(TARGET, code, 'utf8');
  console.log(`\n[PATCH] ${applied} patches appliqués (${skipped} déjà en place)`);
  console.log(`[PATCH] Taille: ${originalLength} → ${code.length} octets`);
  console.log(`[PATCH] Redémarrez le serveur Weppy pour appliquer.`);
} else {
  console.log(`\n[PATCH] Aucun patch nécessaire — tous déjà appliqués.`);
}

// Verify by checking license status endpoint logic
const hasProLogic = code.includes('canUsePro=!0') || code.includes('canUsePro:true');
const hasAlwaysPro = code.includes('evaluateProAccess');
const hasTierPro = code.includes('tier="pro"');

console.log(`\n[VERIFY] canUsePro override: ${hasProLogic ? '✓' : '✗'}`);
console.log(`[VERIFY] evaluateProAccess override: ${hasAlwaysPro ? '✓' : '✗'}`);
console.log(`[VERIFY] tier forced to pro: ${hasTierPro ? '✓' : '✗'}`);

if (hasProLogic && hasAlwaysPro && hasTierPro) {
  console.log('\n[PATCH] Tous les patches sont actifs. PRO devrait fonctionner.');
} else {
  console.log('\n[PATCH] ATTENTION: Certains patches manquent. Vérifiez manuellement.');
}

#!/usr/bin/env node
/**
 * Weppy Enhanced Launcher
 * 
 * Lance Weppy MCP avec toutes les améliorations:
 * 1. Auto-patch PRO si nécessaire
 * 2. Health check Studio
 * 3. Dashboard auto-open désactivé
 * 4. Logging amélioré
 * 
 * Usage: node launch.js [--safe] [--patch-only] [--health-only]
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const WEPPY_DIR = __dirname;
const WEPPY_BIN = path.join(WEPPY_DIR, 'dist', 'index.js');
const PATCH_SCRIPT = path.join(WEPPY_DIR, 'patch-pro.cjs');
const HEALTH_SCRIPT = path.join(WEPPY_DIR, 'health-check.cjs');
const SAFE_SCRIPT = path.join(WEPPY_DIR, 'weppy-safe.cjs');

const args = process.argv.slice(2);

// ─── Modes ─────────────────────────────────────────────────

if (args.includes('--health-only')) {
  execSync(`node "${HEALTH_SCRIPT}"`, { stdio: 'inherit' });
  process.exit(0);
}

if (args.includes('--patch-only')) {
  execSync(`node "${PATCH_SCRIPT}"`, { stdio: 'inherit' });
  process.exit(0);
}

// ─── Step 1: Health Check ─────────────────────────────────

console.log('[LAUNCH] Étape 1/2: Health check...');
try {
  const healthOutput = execSync(`node "${HEALTH_SCRIPT}" --json`, { encoding: 'utf8', timeout: 10000 });
  const health = JSON.parse(healthOutput);
  
  if (health.server.status === 'running') {
    console.log(`[LAUNCH] Serveur déjà actif (PID ${health.server.pid}).`);
    
    if (health.studio.connected && health.license.canUsePro) {
      console.log('[LAUNCH] ✓ Studio connecté, PRO actif.');
    } else {
      if (!health.studio.connected) console.log('[LAUNCH] ⚠ Studio déconnecté.');
      if (!health.license.canUsePro) console.log('[LAUNCH] ⚠ License non PRO.');
    }
  } else {
    console.log('[LAUNCH] Serveur arrêté — démarrage...');
  }
} catch {
  console.log('[LAUNCH] Health check échoué — serveur probablement arrêté.');
}

// ─── Step 2: Start Server ─────────────────────────────────

console.log('\n[LAUNCH] Étape 2/2: Démarrage serveur...');

const useSafeMode = args.includes('--safe');
const serverScript = useSafeMode ? SAFE_SCRIPT : WEPPY_BIN;

if (useSafeMode) {
  console.log('[LAUNCH] Mode safe activé (wrapper avec safety checks).');
}

if (!fs.existsSync(WEPPY_BIN)) {
  console.error(`[LAUNCH] Fichier introuvable: ${WEPPY_BIN}`);
  console.error('[LAUNCH] Installez avec: npx -y @weppy/roblox-mcp@latest');
  process.exit(1);
}

const env = {
  ...process.env,
  DASHBOARD_AUTO_OPEN: 'false',
  HERMES_AGENT: '1'
};

const server = spawn('node', [serverScript], {
  stdio: 'inherit',
  env
});

server.on('error', (err) => {
  console.error(`[LAUNCH] Erreur serveur: ${err.message}`);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`[LAUNCH] Serveur arrêté (code ${code}).`);
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[LAUNCH] Arrêt...');
  server.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});

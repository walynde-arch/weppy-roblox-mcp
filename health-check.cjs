#!/usr/bin/env node
/**
 * Weppy Health Check
 * 
 * Vérifie l'état du serveur Weppy et de la connexion Studio.
 * Usage: node health-check.js [--json]
 * 
 * Sortie:
 *   - Serveur Weppy: running/stopped
 *   - Port 3002: listening/not listening
 *   - Plugin Studio: connected/disconnected
 *   - License: pro/basic
 */

const http = require('http');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');

const results = {
  timestamp: new Date().toISOString(),
  server: { status: 'unknown', port: 3002, pid: null },
  studio: { connected: false, pluginVersion: null },
  license: { tier: 'unknown', canUsePro: false }
};

// Check port 3002
try {
  const netstat = execSync('netstat -ano | findstr :3002', { encoding: 'utf8', timeout: 5000 });
  const lines = netstat.trim().split('\n');
  const listening = lines.find(l => l.includes('LISTENING'));
  if (listening) {
    const pid = listening.trim().split(/\s+/).pop();
    results.server.status = 'running';
    results.server.pid = parseInt(pid);
  } else {
    results.server.status = 'port_busy';
  }
} catch {
  results.server.status = 'stopped';
}

// Check health endpoint
async function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3002/health', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          results.studio.connected = json.pluginConnected || false;
          resolve();
        } catch {
          resolve();
        }
      });
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
  });
}

// Check license status
async function checkLicense() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3002/api/dashboard/license/status', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          results.license.canUsePro = json.canUsePro || false;
          results.license.tier = json.canUsePro ? 'pro' : 'basic';
          results.studio.pluginVersion = json.version || null;
        } catch {}
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
  });
}

async function main() {
  if (results.server.status === 'running') {
    await Promise.all([checkHealth(), checkLicense()]);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('═══ Weppy Health Check ═══');
    console.log(`  Serveur:    ${results.server.status === 'running' ? '✓ Running' : '✗ Stopped'}${results.server.pid ? ` (PID ${results.server.pid})` : ''}`);
    console.log(`  Port 3002:  ${results.server.status === 'running' ? '✓ Listening' : '✗ Not listening'}`);
    console.log(`  Studio:     ${results.studio.connected ? '✓ Connected' : '✗ Disconnected'}`);
    console.log(`  License:    ${results.license.tier.toUpperCase()}${results.license.canUsePro ? ' (PRO)' : ''}`);
    if (results.studio.pluginVersion) {
      console.log(`  Plugin:     v${results.studio.pluginVersion}`);
    }
    console.log('══════════════════════════');
    
    // Summary
    const allGood = results.server.status === 'running' && results.studio.connected && results.license.canUsePro;
    const degraded = results.server.status === 'running' && (!results.studio.connected || !results.license.canUsePro);
    const down = results.server.status !== 'running';
    
    if (allGood) {
      console.log('\n  ✓ Tout opérationnel — PRO actif, Studio connecté.');
    } else if (degraded) {
      console.log('\n  ⚠ Serveur actif mais problèmes détectés:');
      if (!results.studio.connected) console.log('    - Plugin Studio déconnecté');
      if (!results.license.canUsePro) console.log('    - License non PRO — exécutez: node patch-pro.js');
    } else if (down) {
      console.log('\n  ✗ Serveur arrêté — démarrez avec: npx @weppy/roblox-mcp@latest');
    }
  }
  
  process.exit(0);
}

main();

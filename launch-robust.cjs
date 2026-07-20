#!/usr/bin/env node
/**
 * NovaMCP Robust Launcher
 * 
 * - Auto-restart si le serveur crash
 * - Request logging dans un fichier
 * - Health check au démarrage
 * - Dashboard auto-open désactivé
 * 
 * Usage: node launch.cjs [--safe] [--log-file path]
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const NovaMCP_DIR = __dirname;
const NovaMCP_BIN = path.join(NovaMCP_DIR, 'dist', 'index.js');
const HEALTH_SCRIPT = path.join(NovaMCP_DIR, 'health-check.cjs');
const LOG_DIR = path.join(NovaMCP_DIR, 'logs');

const args = process.argv.slice(2);
const MAX_RESTARTS = 5;
const RESTART_DELAY = 3000; // 3s

// ─── Logging ─────────────────────────────────────────────

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `weppy-${date}.log`);
}

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(line);
  ensureLogDir();
  fs.appendFileSync(getLogPath(), line + '\n');
}

// ─── Modes ───────────────────────────────────────────────

if (args.includes('--health-only')) {
  execSync(`node "${HEALTH_SCRIPT}"`, { stdio: 'inherit' });
  process.exit(0);
}

if (args.includes('--log-only')) {
  ensureLogDir();
  console.log(`Logs dans: ${getLogPath()}`);
  process.exit(0);
}

// ─── Health Check ────────────────────────────────────────

function healthCheck() {
  try {
    const out = execSync(`node "${HEALTH_SCRIPT}" --json`, { encoding: 'utf8', timeout: 5000 });
    return JSON.parse(out);
  } catch {
    return { server: { status: 'stopped' }, studio: { connected: false }, license: { tier: 'unknown' } };
  }
}

// ─── Kill Existing ───────────────────────────────────────

function killExisting() {
  try {
    const netstat = execSync('netstat -ano | findstr :3002', { encoding: 'utf8', timeout: 3000 });
    const lines = netstat.trim().split('\n');
    const listening = lines.find(l => l.includes('LISTENING'));
    if (listening) {
      const pid = listening.trim().split(/\s+/).pop();
      execSync(`powershell -Command "Stop-Process -Id ${pid} -Force"`, { timeout: 5000 });
      log('INFO', `Process existant tué (PID ${pid})`);
      return true;
    }
  } catch {}
  return false;
}

// ─── Set Agent Name ──────────────────────────────────────

function setAgentName(name) {
  const http = require('http');
  
  // D'abord récupérer l'instanceId
  http.get('http://127.0.0.1:3002/status', { timeout: 3000 }, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const status = JSON.parse(data);
        const instanceId = status.instanceId;
        if (!instanceId) {
          log('WARN', 'Pas d\'instanceId dans la réponse status');
          return;
        }
        
        // Envoyer le nom avec l'instanceId
        const body = JSON.stringify({ instanceId, aiClientName: name });
        const req = http.request('http://127.0.0.1:3002/set-ai-client-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 3000
        }, (res2) => {
          if (res2.statusCode === 200) {
            log('INFO', `Agent name défini: ${name} (instanceId: ${instanceId})`);
          } else {
            log('WARN', `set-ai-client-name: HTTP ${res2.statusCode}`);
          }
        });
        req.on('error', (e) => log('WARN', `set-ai-client-name error: ${e.message}`));
        req.write(body);
        req.end();
      } catch (e) {
        log('WARN', `Status parse error: ${e.message}`);
      }
    });
  }).on('error', (e) => log('WARN', `Status fetch error: ${e.message}`));
}

// ─── Start Server ────────────────────────────────────────

let restartCount = 0;
let currentProcess = null;

function startServer() {
  log('INFO', 'Démarrage serveur NovaMCP...');
  
  const env = {
    ...process.env,
    DASHBOARD_AUTO_OPEN: 'false',
    HERMES_AGENT: '1'
  };
  
  const server = spawn('node', [NovaMCP_BIN], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env
  });
  
  currentProcess = server;
  
  // Log stdout
  server.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        log('NovaMCP', line.trim());
      }
    }
  });
  
  // Log stderr (NovaMCP écrit INFO sur stderr)
  server.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        // NovaMCP écrit "[INFO]" ou "[WARN]" ou "[ERROR]" dans ses logs
        if (line.includes('[WARN]')) {
          log('WARN', line.trim());
        } else if (line.includes('[ERROR]')) {
          log('ERROR', line.trim());
        } else {
          log('NovaMCP', line.trim());
        }
      }
    }
  });
  
  // Handle exit
  server.on('exit', (code, signal) => {
    log('WARN', `Serveur arrêté (code ${code}, signal ${signal})`);
    currentProcess = null;
    
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      log('INFO', 'Arrêt propre — pas de restart.');
      process.exit(0);
    }
    
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      log('INFO', `Restart ${restartCount}/${MAX_RESTARTS} dans ${RESTART_DELAY/1000}s...`);
      setTimeout(startServer, RESTART_DELAY);
    } else {
      log('ERROR', `Trop de restarts (${MAX_RESTARTS}) — arrêt.`);
      process.exit(1);
    }
  });
  
  server.on('error', (err) => {
    log('ERROR', `Erreur spawn: ${err.message}`);
    currentProcess = null;
  });
  
  return server;
}

// ─── Main ────────────────────────────────────────────────

function main() {
  log('INFO', '═══ NovaMCP Robust Launcher ═══');
  
  // Health check
  const health = healthCheck();
  log('INFO', `Health: serveur=${health.server.status}, studio=${health.studio.connected}, license=${health.license.tier}`);
  
  if (health.server.status === 'running') {
    log('INFO', `Serveur déjà actif (PID ${health.server.pid}).`);
    log('INFO', 'Arrêt du processus existant avant relance...');
    killExisting();
  }
  
  // Start
  startServer();
  
  // Set agent name after 2s
  setTimeout(() => setAgentName('Hermes'), 2000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('INFO', 'SIGINT reçu — arrêt...');
  if (currentProcess) currentProcess.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  log('INFO', 'SIGTERM reçu — arrêt...');
  if (currentProcess) currentProcess.kill('SIGTERM');
});

main();

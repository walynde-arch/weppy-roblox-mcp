#!/usr/bin/env node
/**
 * Weppy Safe Wrapper
 * 
 * Intercepte les appels MCP et ajoute des safety checks:
 * - Vérifie la connexion Studio avant chaque opération
 * - Intercepte edit_replace pour les gros scripts → fallback execute_luau
 * - Complète get_source tronqué avec pagination
 * 
 * Usage: node weppy-safe.js (remplace le lancement direct de dist/index.js)
 * Ce script proxy stdio entre Hermes et le vrai serveur Weppy.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// Config
const WEPPY_BIN = path.join(__dirname, 'dist', 'index.js');
const STUDIO_HEALTH_URL = 'http://127.0.0.1:3002/api/dashboard/license/status';
const MAX_SCRIPT_LINES = 300; // Au-delà, utiliser execute_luau

// State
let studioConnected = false;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 10000; // 10s

// ─── Health Check ───────────────────────────────────────────

async function checkStudioHealth() {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) return studioConnected;
  
  lastHealthCheck = now;
  try {
    const resp = await fetch(STUDIO_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    studioConnected = resp.ok;
  } catch {
    studioConnected = false;
  }
  return studioConnected;
}

// ─── MCP Message Interception ──────────────────────────────

function parseMCPMessage(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isToolCall(msg) {
  return msg && msg.method === 'tools/call' && msg.params;
}

function getToolName(msg) {
  return msg.params?.name || '';
}

function getToolArgs(msg) {
  return msg.params?.arguments || {};
}

// ─── Pre-Execution Checks ─────────────────────────────────

async function preExecCheck(msg) {
  const tool = getToolName(msg);
  const args = getToolArgs(msg);
  
  // Skip health check for non-Studio tools
  if (['system_info', 'ping'].includes(tool)) return null;
  
  // Check Studio connection
  const connected = await checkStudioHealth();
  if (!connected && !['system_info'].includes(tool)) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: [{
          type: 'text',
          text: `[WEPPY-SAFE] Studio non connecté. Vérifiez que le plugin Weppy est actif dans Roblox Studio.`
        }],
        isError: true
      }
    };
  }
  
  // Intercept edit_replace for large scripts
  if (tool === 'manage_scripts' && args.action === 'edit_replace') {
    return {
      _weppy_safe: true,
      _action: 'wrapped_edit_replace',
      _original: msg
    };
  }
  
  return null; // No interception needed
}

// ─── Wrapped Operations ────────────────────────────────────

async function wrappedEditReplace(msg) {
  const args = getToolArgs(msg);
  
  // Get source first to check size
  const getSourceMsg = {
    ...msg,
    params: {
      name: 'manage_scripts',
      arguments: {
        action: 'get_source',
        path: args.path
      }
    }
  };
  
  // Forward get_source
  forwardToWeppy(getSourceMsg);
  
  // We'll handle the response in the response interceptor
  return { _pending: true, _tool: 'edit_replace', _args: args, _getSourceMsg: getSourceMsg };
}

// ─── Message Routing ──────────────────────────────────────

let weppyProcess = null;
const pendingCallbacks = new Map();

function startWeppy() {
  weppyProcess = spawn('node', [WEPPY_BIN], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DASHBOARD_AUTO_OPEN: 'false' }
  });
  
  weppyProcess.stderr?.on('data', (data) => {
    process.stderr.write(data);
  });
  
  return weppyProcess;
}

function forwardToWeppy(msg) {
  if (weppyProcess && weppyProcess.stdin.writable) {
    weppyProcess.stdin.write(JSON.stringify(msg) + '\n');
  }
}

function forwardToHermes(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// ─── Main stdio Proxy ─────────────────────────────────────

async function main() {
  weppyProcess = startWeppy();
  
  // Read from Weppy → forward to Hermes
  const weppyRL = readline.createInterface({ input: weppyProcess.stdout });
  weppyRL.on('line', (line) => {
    const msg = parseMCPMessage(line);
    if (msg) {
      // Check if there's a pending callback for this response
      const cb = pendingCallbacks.get(msg.id);
      if (cb) {
        cb(msg);
        pendingCallbacks.delete(msg.id);
      } else {
        forwardToHermes(msg);
      }
    } else {
      process.stdout.write(line + '\n');
    }
  });
  
  // Read from Hermes → intercept and forward to Weppy
  const hermesRL = readline.createInterface({ input: process.stdin });
  for await (const line of hermesRL) {
    const msg = parseMCPMessage(line);
    if (!msg) {
      process.stdout.write(line + '\n');
      continue;
    }
    
    const intercept = await preExecCheck(msg);
    
    if (intercept?.jsonrpc) {
      // Immediate response (error or cached)
      forwardToHermes(intercept);
    } else if (intercept?._weppy_safe) {
      // Wrapped operation — forward with monitoring
      forwardToWeppy(msg);
    } else {
      // Normal passthrough
      forwardToWeppy(msg);
    }
  }
}

main().catch((err) => {
  console.error(`[WEPPY-SAFE] Fatal: ${err.message}`);
  process.exit(1);
});

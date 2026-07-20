#!/usr/bin/env node
/**
 * Weppy Script Cache
 * 
 * Cache les sources de scripts lues via Weppy pour éviter les relectures.
 * Stocke dans weppy-cache/ avec TTL configurable.
 * 
 * Usage:
 *   node cache.cjs get <path>           — Lit et cache un script
 *   node cache.cjs read <path>          — Lit depuis le cache (pas de requête)
 *   node cache.cjs list                 — Liste les scripts en cache
 *   node cache.cjs clear                — Vide le cache
 *   node cache.cjs stats                — Statistiques
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEPPY_URL = 'http://127.0.0.1:3002';
const CACHE_DIR = path.join(__dirname, 'cache');
const TTL_MS = 300000; // 5 minutes

// ─── Cache Operations ────────────────────────────────────

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(scriptPath) {
  return crypto.createHash('md5').update(scriptPath).digest('hex');
}

function cachePath(scriptPath) {
  return path.join(CACHE_DIR, `${cacheKey(scriptPath)}.json`);
}

function getFromCache(scriptPath) {
  const cp = cachePath(scriptPath);
  if (!fs.existsSync(cp)) return null;
  
  try {
    const data = JSON.parse(fs.readFileSync(cp, 'utf8'));
    if (Date.now() - data.cachedAt > TTL_MS) {
      fs.unlinkSync(cp);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(scriptPath, source, lineCount) {
  ensureCacheDir();
  const data = {
    path: scriptPath,
    source,
    lineCount,
    cachedAt: Date.now(),
    hits: 0
  };
  fs.writeFileSync(cachePath(scriptPath), JSON.stringify(data, null, 2));
}

function hitCache(scriptPath) {
  const cp = cachePath(scriptPath);
  if (!fs.existsSync(cp)) return;
  try {
    const data = JSON.parse(fs.readFileSync(cp, 'utf8'));
    data.hits = (data.hits || 0) + 1;
    data.lastHit = Date.now();
    fs.writeFileSync(cp, JSON.stringify(data, null, 2));
  } catch {}
}

// ─── Weppy API ───────────────────────────────────────────

async function weppyGetSource(scriptPath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'manage_scripts',
        arguments: { action: 'get_source', path: scriptPath }
      }
    });
    
    const req = http.request(`${WEPPY_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result?.content?.[0]?.text) {
            resolve(json.result.content[0].text);
          } else {
            reject(new Error('No source in response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Commands ────────────────────────────────────────────

async function cmdGet(scriptPath) {
  // Check cache first
  const cached = getFromCache(scriptPath);
  if (cached) {
    hitCache(scriptPath);
    console.log(`[CACHE HIT] ${scriptPath} (${cached.lineCount} lignes, ${Math.round((Date.now() - cached.cachedAt) / 1000)}s ago, ${cached.hits} hits)`);
    console.log(cached.source);
    return;
  }
  
  // Fetch from Weppy
  console.log(`[CACHE MISS] ${scriptPath} — fetch depuis Weppy...`);
  try {
    const source = await weppyGetSource(scriptPath);
    const lineCount = source.split('\n').length;
    setCache(scriptPath, source, lineCount);
    console.log(`[CACHE SET] ${scriptPath} (${lineCount} lignes)`);
    console.log(source);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
  }
}

function cmdRead(scriptPath) {
  const cached = getFromCache(scriptPath);
  if (cached) {
    hitCache(scriptPath);
    console.log(cached.source);
  } else {
    console.error(`[CACHE MISS] ${scriptPath} pas en cache. Utilise "get" d'abord.`);
  }
}

function cmdList() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('Cache vide.');
    return;
  }
  
  console.log(`Scripts en cache (${files.length}):`);
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
      const age = Math.round((Date.now() - data.cachedAt) / 1000);
      const expired = age > TTL_MS / 1000 ? ' [EXPIRÉ]' : '';
      console.log(`  ${data.path} (${data.lineCount} lignes, ${age}s ago, ${data.hits || 0} hits)${expired}`);
    } catch {}
  }
}

function cmdClear() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) fs.unlinkSync(path.join(CACHE_DIR, f));
  console.log(`Cache vidé (${files.length} fichiers supprimés).`);
}

function cmdStats() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  let totalHits = 0;
  let totalLines = 0;
  let valid = 0;
  let expired = 0;
  
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
      totalHits += data.hits || 0;
      totalLines += data.lineCount || 0;
      if (Date.now() - data.cachedAt > TTL_MS) expired++;
      else valid++;
    } catch {}
  }
  
  console.log('═══ Cache Stats ═══');
  console.log(`  Fichiers: ${files.length} (${valid} valides, ${expired} expirés)`);
  console.log(`  Total lignes: ${totalLines}`);
  console.log(`  Total hits: ${totalHits}`);
  console.log(`  TTL: ${TTL_MS / 1000}s`);
}

// ─── Main ────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'get': cmdGet(rest[0]); break;
  case 'read': cmdRead(rest[0]); break;
  case 'list': cmdList(); break;
  case 'clear': cmdClear(); break;
  case 'stats': cmdStats(); break;
  default:
    console.log('Weppy Script Cache');
    console.log('──────────────────');
    console.log('  get <path>    — Lit et cache un script');
    console.log('  read <path>   — Lit depuis le cache');
    console.log('  list          — Liste les scripts en cache');
    console.log('  clear         — Vide le cache');
    console.log('  stats         — Statistiques');
}

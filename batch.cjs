#!/usr/bin/env node
/**
 * NovaMCP Batch Helper
 * 
 * Exécute des opérations NovaMCP en batch via HTTP direct.
 * Utile pour des tâches répétitives que le MCP traite un par un.
 * 
 * Usage:
 *   node batch.js set-properties <path1> <prop> <value> [path2 prop value ...]
 *   node batch.js get-sources <path1> <path2> ...
 *   node batch.js create-instances <parent> <class> <name1> [name2 ...]
 */

const http = require('http');

const NovaMCP_URL = 'http://127.0.0.1:3002';

async function weppyRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${NovaMCP_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 10000
    }, (res) => {
      let result = '';
      res.on('data', (chunk) => result += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(result)); } catch { resolve(result); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

async function batchSetProperties(args) {
  if (args.length < 3 || args.length % 3 !== 0) {
    console.error('Usage: batch.js set-properties <path1> <prop> <value> [path2 prop value ...]');
    process.exit(1);
  }
  
  const commands = [];
  for (let i = 0; i < args.length; i += 3) {
    commands.push({
      tool: 'manage_properties',
      args: { action: 'set', path: args[i], property: args[i+1], value: args[i+2] }
    });
  }
  
  const result = await weppyRequest('/api/mcp/batch', { commands });
  console.log(JSON.stringify(result, null, 2));
}

async function batchGetSources(args) {
  if (args.length === 0) {
    console.error('Usage: batch.js get-sources <path1> <path2> ...');
    process.exit(1);
  }
  
  const commands = args.map(path => ({
    tool: 'manage_scripts',
    args: { action: 'get_source', path }
  }));
  
  const result = await weppyRequest('/api/mcp/batch', { commands });
  console.log(JSON.stringify(result, null, 2));
}

async function batchCreateInstances(args) {
  if (args.length < 3) {
    console.error('Usage: batch.js create-instances <parent> <class> <name1> [name2 ...]');
    process.exit(1);
  }
  
  const [parent, className, ...names] = args;
  const commands = names.map(name => ({
    tool: 'mutate_instances',
    args: { action: 'create_with_props', className, name, parent }
  }));
  
  const result = await weppyRequest('/api/mcp/batch', { commands });
  console.log(JSON.stringify(result, null, 2));
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'set-properties': batchSetProperties(args); break;
  case 'get-sources': batchGetSources(args); break;
  case 'create-instances': batchCreateInstances(args); break;
  default:
    console.log('NovaMCP Batch Helper');
    console.log('──────────────────');
    console.log('Commandes:');
    console.log('  set-properties <path prop value ...>  — Set props sur N instances');
    console.log('  get-sources <path1 path2 ...>         — Lire N scripts d\'un coup');
    console.log('  create-instances <parent class name..> — Créer N instances');
    console.log('\nExemple:');
    console.log('  node batch.js set-properties game.Workspace.Part Transparency 0.5');
}

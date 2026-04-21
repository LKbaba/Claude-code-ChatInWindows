const { spawn } = require('child_process');

const env = {
  ...process.env,
  GOOGLE_GENAI_USE_VERTEXAI: 'true',
  GOOGLE_CLOUD_PROJECT: 'lk-sandbox-2026',
  GOOGLE_APPLICATION_CREDENTIALS: 'C:/Users/CQDD/AppData/Roaming/gcloud/application_default_credentials.json',
};

const srv = spawn('node', ['E:/Github/Gemini-mcp/dist/server.js'], {
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
srv.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      console.log('<<<', JSON.stringify(msg, null, 2));
      if (msg.id === 1) {
        // after init response, send tool call
        const call = {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'gemini_search',
            arguments: {
              query: 'What is the latest stable Node.js LTS version in 2026?',
              thinkingLevel: 'low',
              outputFormat: 'text',
            },
          },
        };
        srv.stdin.write(JSON.stringify(call) + '\n');
      } else if (msg.id === 2) {
        srv.stdin.end();
        setTimeout(() => srv.kill(), 500);
      }
    } catch {
      // not JSON, ignore banner lines
    }
  }
});

srv.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d));
srv.on('close', (code) => console.log('Server exited:', code));

const init = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'probe', version: '1.0' },
  },
};
srv.stdin.write(JSON.stringify(init) + '\n');

setTimeout(() => {
  console.error('TIMEOUT — killing server');
  srv.kill();
  process.exit(1);
}, 75000);

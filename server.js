const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'avanza2026';
const sessions = new Map();
const rate = new Map();
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify({ applications: [], payments: [], audit: [], kyc: [] }, null, 2));

function readStore() { try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch { return { applications: [], payments: [], audit: [], kyc: [] }; } }
function writeStore(db) { const tmp = STORE_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, STORE_FILE); }
function json(res, code, body, headers = {}) { const out = JSON.stringify(body); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(out); }
function text(res, code, body, type = 'text/plain; charset=utf-8') { res.writeHead(code, { 'content-type': type }); res.end(body); }
function id(prefix) { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex')}`; }
function audit(action, actor, detail = {}) { const db = readStore(); db.audit.push({ id: id('AUD'), at: new Date().toISOString(), actor, action, detail }); writeStore(db); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 1_000_000) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } }); req.on('error', reject); }); }
function auth(req) { const h = req.headers.authorization || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : ''; return sessions.get(token); }
function need(req, res, roles = []) { const user = auth(req); if (!user) { json(res, 401, { error: 'Autenticación requerida' }); return null; } if (roles.length && !roles.includes(user.role)) { json(res, 403, { error: 'Rol sin permiso para esta operación' }); return null; } return user; }
function safeStatic(p) { const normalized = path.normalize(p).replace(/^([.][.][/\\])+/, ''); const file = path.join(ROOT, normalized); return file.startsWith(ROOT) ? file : null; }
function serveStatic(req, res, pathname) { let file = pathname === '/' ? path.join(ROOT, 'index.html') : safeStatic(pathname); if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html'); const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' }; res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(file).pipe(res); }

const server = http.createServer(async (req, res) => {
  const now = Date.now(), ip = req.socket.remoteAddress || 'unknown';
  const hits = (rate.get(ip) || []).filter(t => now - t < 60_000); hits.push(now); rate.set(ip, hits);
  if (hits.length > 120) return json(res, 429, { error: 'Demasiadas solicitudes; intenta más tarde' });
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && u.pathname === '/api/health') return json(res, 200, { ok: true, service: 'avanza-api', mode: 'demo', persistentStore: true, externalIntegrations: 'pending_credentials_and_certification', time: new Date().toISOString() });
  try {
    if (u.pathname === '/api/auth/login' && req.method === 'POST') {
      const b = await body(req); const roles = ['admin', 'compliance', 'collections', 'viewer'];
      if (b.password !== DEMO_PASSWORD || !roles.includes(b.role || 'admin')) return json(res, 401, { error: 'Credenciales demo inválidas' });
      const token = crypto.randomBytes(32).toString('hex'); const user = { id: id('USR'), name: b.name || 'Usuario demo', role: b.role || 'admin', issuedAt: new Date().toISOString() }; sessions.set(token, user); audit('login', user, { ip }); return json(res, 200, { token, user, warning: 'Cuenta y permisos de demostración; reemplazar por identidad real antes de producción.' });
    }
    if (u.pathname === '/api/metrics' && req.method === 'GET') { const user = need(req, res); if (!user) return; const db = readStore(); return json(res, 200, { applications: db.applications.length, payments: db.payments.length, auditEvents: db.audit.length, kycChecks: db.kyc.length, openApplications: db.applications.filter(x => !['Liquidada', 'Rechazada'].includes(x.status)).length, generatedAt: new Date().toISOString() }); }
    if (u.pathname === '/api/applications' && req.method === 'GET') { const user = need(req, res, ['admin', 'compliance', 'collections', 'viewer']); if (!user) return; return json(res, 200, { items: readStore().applications }); }
    if (u.pathname === '/api/applications' && req.method === 'POST') { const user = need(req, res, ['admin', 'compliance']); if (!user) return; const b = await body(req); if (!b.name || !b.amount) return json(res, 400, { error: 'name y amount son obligatorios' }); const db = readStore(); const item = { id: id('APP'), createdAt: new Date().toISOString(), name: String(b.name), amount: Number(b.amount), phone: b.phone || null, curp: b.curp || null, product: b.product || 'Demo', status: 'Recibida' }; db.applications.push(item); writeStore(db); audit('application.created', user, { applicationId: item.id }); return json(res, 201, item); }
    if (u.pathname === '/api/payments/simulate' && req.method === 'POST') { const user = need(req, res, ['admin', 'collections']); if (!user) return; const b = await body(req); if (!b.applicationId || !b.amount) return json(res, 400, { error: 'applicationId y amount son obligatorios' }); const db = readStore(); const payment = { id: id('PAY'), applicationId: b.applicationId, amount: Number(b.amount), method: b.method || 'Simulado', status: 'Registrado en demo', paidAt: new Date().toISOString() }; db.payments.push(payment); writeStore(db); audit('payment.simulated', user, payment); return json(res, 201, payment); }
    if (u.pathname === '/api/kyc/mock' && req.method === 'POST') { const user = need(req, res, ['admin', 'compliance']); if (!user) return; const b = await body(req); const db = readStore(); const check = { id: id('KYC'), subject: b.subject || 'Sin nombre', curp: b.curp || null, result: 'PENDIENTE_VALIDACION_EXTERNA', flags: ['Proveedor de identidad no conectado', 'No es una consulta oficial'], checkedAt: new Date().toISOString() }; db.kyc.push(check); writeStore(db); audit('kyc.mock', user, { kycId: check.id }); return json(res, 201, check); }
    if (u.pathname === '/api/audit' && req.method === 'GET') { const user = need(req, res, ['admin', 'compliance']); if (!user) return; return json(res, 200, { items: readStore().audit.slice(-500).reverse() }); }
    if (u.pathname === '/api/backup' && req.method === 'GET') { const user = need(req, res, ['admin']); if (!user) return; audit('backup.exported', user); const db = readStore(); res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="avanza-backup-demo.json"' }); return res.end(JSON.stringify({ exportedAt: new Date().toISOString(), warning: 'Respaldo de demostración; cifrar y almacenar en objeto seguro en producción.', ...db }, null, 2)); }
    if (req.method === 'GET') return serveStatic(req, res, u.pathname);
    return json(res, 404, { error: 'Ruta no encontrada' });
  } catch (e) { return json(res, 500, { error: e.message || 'Error interno' }); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`AVANZA API listening on 0.0.0.0:${PORT}`));

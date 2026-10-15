const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const sessions = new Map();

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { customers: [] }; }
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let value = '';
    req.on('data', chunk => { value += chunk; if (value.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(value || '{}')); } catch (e) { reject(e); } });
  });
}
function user(req) {
  const cookie = req.headers.cookie || '';
  const token = (cookie.match(/session=([^;]+)/) || [])[1];
  return token && sessions.get(token);
}
function authorized(req, res) {
  const current = user(req);
  if (!current) { send(res, 401, { error: '请先登录' }); return null; }
  return current;
}
function customer(input, editor) {
  return {
    id: input.id || crypto.randomUUID(),
    name: String(input.name || '').trim(),
    contact: String(input.contact || '').trim(),
    category: ['合作客户', '意向客户', '可拜访客户', '暂无机会'].includes(input.category) ? input.category : '意向客户',
    communication: String(input.communication || '').trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: editor
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const input = await body(req);
      if (input.username !== 'minli' || input.password !== 'ruanzong666') return send(res, 401, { error: '账号或密码不正确' });
      const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, 'minli');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/` });
      return res.end(JSON.stringify({ username: 'minli' }));
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const token = ((req.headers.cookie || '').match(/session=([^;]+)/) || [])[1]; if (token) sessions.delete(token);
      res.writeHead(200, { 'Set-Cookie': 'session=; Max-Age=0; Path=/' }); return res.end('{}');
    }
    if (req.method === 'GET' && url.pathname === '/api/me') {
      const current = user(req); return send(res, 200, current ? { username: current } : { username: null });
    }
    if (url.pathname === '/api/customers') {
      const current = authorized(req, res); if (!current) return;
      const data = readData();
      if (req.method === 'GET') return send(res, 200, data.customers);
      const input = await body(req);
      if (req.method === 'POST') {
        const item = customer(input, current);
        if (!item.name || !item.contact) return send(res, 400, { error: '请填写客户称呼和联系方式' });
        data.customers.unshift(item); saveData(data); return send(res, 201, item);
      }
      if (req.method === 'PUT') {
        const index = data.customers.findIndex(item => item.id === input.id);
        if (index < 0) return send(res, 404, { error: '客户不存在或已被删除' });
        const item = customer(input, current);
        if (!item.name || !item.contact) return send(res, 400, { error: '请填写客户称呼和联系方式' });
        data.customers[index] = item; saveData(data); return send(res, 200, item);
      }
      if (req.method === 'DELETE') {
        const index = data.customers.findIndex(item => item.id === input.id);
        if (index < 0) return send(res, 404, { error: '客户不存在或已被删除' });
        data.customers.splice(index, 1); saveData(data); return send(res, 200, { ok: true });
      }
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const target = path.normalize(path.join(PUBLIC_DIR, file));
    if (!target.startsWith(PUBLIC_DIR) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
  } catch (error) { console.error(error); send(res, 500, { error: '服务器处理失败，请稍后再试' }); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`客户协作系统已启动：http://localhost:${PORT}`));

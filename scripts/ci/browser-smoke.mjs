#!/usr/bin/env node
// Mở các trang bằng Chrome headless thật, bắt lỗi chỉ lộ ra trong trình duyệt:
// trang trắng (React không render), lỗi JS lúc chạy, CSP chặn script/style/ảnh,
// thiếu chunk JS/CSS (lazy import), console.error. Không cần gói npm: nói chuyện
// thẳng với Chrome qua DevTools Protocol (WebSocket có sẵn từ Node 22).
//
//   node browser-smoke.mjs <cdp http://127.0.0.1:9222> <base http://127.0.0.1:18081> /đường-dẫn ...
//
// Bỏ qua: API trả 401/403 (trang công khai thử phiên đăng nhập là bình thường).
// Thoát 1 nếu có lỗi.

const [cdp, base, ...paths] = process.argv.slice(2);
if (!cdp || !base || !paths.length) {
  console.error('Cách dùng: node browser-smoke.mjs <cdp-url> <base-url> /path ...');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' });
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* Chrome chưa sẵn sàng */
    }
    await sleep(1000);
  }
  throw new Error(`Không kết nối được Chrome DevTools ở ${cdp}`);
}

const ws = new WebSocket(await cdpTarget());
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error('WebSocket DevTools lỗi'));
});

let nextId = 1;
const pending = new Map();
const listeners = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method) for (const fn of listeners) fn(msg.method, msg.params);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

let problems = [];
let loaded = false;
const urls = new Map();
const expectedApi = (url = '', text = '') => /\/api\//.test(url) && /\b40[13]\b/.test(text);
listeners.push((method, p) => {
  if (method === 'Page.loadEventFired') loaded = true;
  if (method === 'Runtime.exceptionThrown') {
    const d = p.exceptionDetails;
    problems.push(`lỗi JS: ${d.exception?.description?.split('\n')[0] ?? d.text}`);
  }
  if (method === 'Runtime.consoleAPICalled' && p.type === 'error')
    problems.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
  if (method === 'Log.entryAdded' && p.entry.level === 'error') {
    const { source, text, url } = p.entry;
    if (source === 'network' && expectedApi(url, text)) return;
    problems.push(`${source}: ${text}${url ? ` (${url})` : ''}`.slice(0, 400));
  }
  if (method === 'Network.requestWillBeSent') urls.set(p.requestId, p.request.url);
  if (method === 'Network.loadingFailed' && p.blockedReason)
    problems.push(`bị chặn (${p.blockedReason}): ${urls.get(p.requestId) ?? p.requestId}`);
  if (method === 'Network.responseReceived') {
    const { url, status } = p.response;
    if (status >= 400 && !(status === 401 || status === 403) && ['Script', 'Stylesheet', 'Document', 'Font'].includes(p.type))
      problems.push(`${p.type} ${url} trả ${status}`);
  }
});

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');

let failed = 0;
for (const path of paths) {
  problems = [];
  loaded = false;
  await send('Page.navigate', { url: base + path });
  for (let i = 0; i < 150 && !loaded; i++) await sleep(100);
  await sleep(2500); // chờ lazy chunk + gọi API đầu trang
  const { result } = await send('Runtime.evaluate', {
    expression: "(() => { const r = document.getElementById('root'); return r ? r.innerText.trim().length : -1 })()",
    returnByValue: true,
  });
  if (!loaded) problems.push('trang không tải xong sau 15 giây');
  if (result.value === -1) problems.push('không có #root');
  else if (result.value === 0) problems.push('trang trắng — #root không có nội dung (React không render)');
  if (problems.length) {
    failed++;
    console.log(`✗ ${path}`);
    for (const pr of [...new Set(problems)]) console.log(`    ${pr}`);
  } else console.log(`✓ ${path} (${result.value} ký tự)`);
}
ws.close();
process.exit(failed ? 1 : 0);

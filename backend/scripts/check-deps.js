#!/usr/bin/env node
// Kiểm tra hướng phụ thuộc giữa các phần của src/ (đọc mọi require tương đối):
//   1. Không có vòng require ở mức file (chỉ tính require đầu file; require
//      trong thân hàm là cách cố ý phá vòng nên được bỏ qua).
//   2. Module LÕI chỉ phụ thuộc module lõi khác.
//   3. Module TỔNG HỢP (đọc chéo nhiều module) chỉ được module tổng hợp khác dùng.
//   4. Hạ tầng (config, utils, middlewares, permissions, shared, database) chỉ
//      dùng module lõi — không phụ thuộc nghiệp vụ.
//   5. Không có 2 module phụ thuộc nhau 2 chiều ở tầng nghiệp vụ (bỏ qua file
//      *.routes.js / *.docs.js: route được gọi service của module khác).
// Xem README backend, mục "Quy ước module". Chạy: npm run check:deps
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const SRC = path.join(__dirname, '../src');
const CORE = new Set(['events', 'settings', 'notifications', 'audit', 'access', 'persons']);
const AGGREGATE = new Set(['portal', 'public', 'dashboard']);
const INFRA = new Set(['config', 'utils', 'middlewares', 'permissions', 'shared', 'database']);

const walk = (d) =>
	fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(d, e.name);
		return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
	});
const visit = (node, fn) => {
	if (!node || typeof node.type !== 'string') return;
	fn(node);
	for (const key of Object.keys(node)) {
		const v = node[key];
		if (Array.isArray(v)) v.forEach((c) => visit(c, fn));
		else if (v && typeof v.type === 'string') visit(v, fn);
	}
};
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
// 'modules/<tên>' → tên module; còn lại → thư mục cấp 1 (config, utils...) hoặc tên file gốc
const partOf = (f) => {
	const parts = rel(f).split('/');
	return parts[0] === 'modules'
		? { kind: 'module', name: parts[1] }
		: { kind: 'top', name: parts[0] };
};
const isRouteFile = (f) => /\.(routes|docs)\.js$/.test(f);

const files = walk(SRC);
const edges = new Map();
for (const file of files) {
	const ast = espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2024, range: true });
	const fnRanges = [];
	visit(ast, (n) => {
		if (/Function/.test(n.type)) fnRanges.push(n.range);
	});
	const out = [];
	visit(ast, (n) => {
		const arg = n.type === 'CallExpression' && n.callee.name === 'require' ? n.arguments[0] : null;
		if (arg?.type !== 'Literal' || !String(arg.value).startsWith('.')) return;
		let to = path.resolve(path.dirname(file), arg.value);
		if (!to.endsWith('.js'))
			to = fs.existsSync(`${to}.js`) ? `${to}.js` : path.join(to, 'index.js');
		out.push({ to, lazy: fnRanges.some(([a, b]) => a < n.range[0] && n.range[1] < b) });
	});
	edges.set(file, out);
}

const failures = [];

// 1. Vòng require (đầu file)
const state = new Map();
const stack = [];
const dfs = (f) => {
	state.set(f, 'open');
	stack.push(f);
	for (const { to, lazy } of edges.get(f) ?? []) {
		if (lazy || !edges.has(to)) continue;
		if (state.get(to) === 'open') {
			failures.push(
				`vòng require: ${[...stack.slice(stack.indexOf(to)), to].map(rel).join(' → ')}`,
			);
		} else if (!state.has(to)) dfs(to);
	}
	stack.pop();
	state.set(f, 'done');
};
for (const f of files) if (!state.has(f)) dfs(f);

// 2–4. Hướng phụ thuộc
const moduleEdges = new Map(); // "a→b" → ví dụ 1 cặp file (tầng nghiệp vụ)
for (const [from, list] of edges) {
	const a = partOf(from);
	for (const { to } of list) {
		const b = partOf(to);
		if (b.kind !== 'module' || (a.kind === 'module' && a.name === b.name)) continue;
		const where = `${rel(from)} → ${rel(to)}`;
		if (a.kind === 'module') {
			if (CORE.has(a.name) && !CORE.has(b.name)) {
				failures.push(`module lõi '${a.name}' phụ thuộc module nghiệp vụ '${b.name}': ${where}`);
			}
			if (AGGREGATE.has(b.name) && !AGGREGATE.has(a.name)) {
				failures.push(
					`'${a.name}' dùng module tổng hợp '${b.name}' (chỉ tổng hợp → nghiệp vụ): ${where}`,
				);
			}
			if (!isRouteFile(from)) {
				const key = `${a.name}→${b.name}`;
				if (!moduleEdges.has(key)) moduleEdges.set(key, where);
			}
		} else if (INFRA.has(a.name) && !CORE.has(b.name)) {
			failures.push(`hạ tầng '${a.name}' phụ thuộc module nghiệp vụ '${b.name}': ${where}`);
		}
	}
}

// 5. Hai chiều giữa 2 module (tầng nghiệp vụ)
for (const [key, where] of moduleEdges) {
	const [a, b] = key.split('→');
	if (a < b && moduleEdges.has(`${b}→${a}`)) {
		failures.push(`'${a}' ⇄ '${b}' phụ thuộc 2 chiều: ${where} | ${moduleEdges.get(`${b}→${a}`)}`);
	}
}

const total = [...edges.values()].reduce((n, l) => n + l.length, 0);
console.log(
	`${files.length} file, ${total} require tương đối, ${moduleEdges.size} cặp module (tầng nghiệp vụ).`,
);
if (failures.length) {
	console.error(`\n❌ ${failures.length} vi phạm:`);
	for (const f of failures) console.error(`   - ${f}`);
	process.exit(1);
}
console.log('✅ Hướng phụ thuộc đúng quy ước, không có vòng require.');

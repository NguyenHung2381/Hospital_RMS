#!/usr/bin/env node
// Nạp (require) lần lượt MỌI file .js trong src/ để bắt sớm lỗi đường dẫn
// require sai — vd sau khi di chuyển file giữa các module. Lỗi kiểu này chỉ lộ
// ra khi đúng đoạn code đó chạy (require lười trong thân hàm thì còn muộn hơn),
// nên ngoài việc nạp file, script còn dò mọi chuỗi require('./...') /
// require('../...') trong mã nguồn và kiểm tra đích có tồn tại.
//   npm run check:requires
//
// Không cần DB/Redis: chỉ nạp module rồi thoát. Bỏ qua server.js, cluster.js
// (khởi động HTTP server / fork worker khi được require).

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JOBS_ENABLED = 'false';
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
require('./lib/static-check-env');

const SRC = path.join(__dirname, '../src');
const SKIP = new Set(['server.js', 'cluster.js'].map((f) => path.join(SRC, f)));

const walk = (dir) =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		const p = path.join(dir, d.name);
		if (d.isDirectory()) return walk(p);
		return d.name.endsWith('.js') ? [p] : [];
	});

const exists = (p) =>
	[p, `${p}.js`, path.join(p, 'index.js')].some((c) => fs.existsSync(c) && fs.statSync(c).isFile());
const rel = (p) => path.relative(path.join(__dirname, '..'), p).split(path.sep).join('/');

const files = walk(SRC).filter((f) => !SKIP.has(f));
const failures = [];

// 1) Đích của mọi require tương đối phải tồn tại (kể cả require lười trong hàm)
const RE = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
for (const f of files) {
	const text = fs.readFileSync(f, 'utf8');
	for (const m of text.matchAll(RE)) {
		if (!exists(path.resolve(path.dirname(f), m[1])))
			failures.push(`${rel(f)} — không tìm thấy ${m[1]}`);
	}
}

// 2) Nạp thật từng file (bắt lỗi khi khởi tạo module)
for (const f of files) {
	try {
		require(f);
	} catch (err) {
		failures.push(`${rel(f)} — ${err.message.split('\n')[0]}`);
	}
}

if (failures.length) {
	console.error(`❌ ${failures.length} lỗi nạp module:`);
	for (const f of failures) console.error(`   - ${f}`);
	process.exit(1);
}
console.log(`✅ Nạp được cả ${files.length} file trong src/.`);
process.exit(0);

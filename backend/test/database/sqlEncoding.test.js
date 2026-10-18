// File .sql trong database/ phải là UTF-8 đúng: chữ Việt bị đọc nhầm thành
// cp1252 rồi lưu lại (vd chạy sqlcmd thiếu -f 65001, mở bằng editor sai bảng mã)
// hiện thành "Ã´", "á»", "Æ°"... — từng xảy ra với sp_push_notification (cả thông
// báo lỗi trong DB). Test chặn trước khi file như vậy được commit / chạy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../database');
const walk = (d) =>
	fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(d, e.name);
		return e.isDirectory() ? walk(p) : p.endsWith('.sql') ? [p] : [];
	});

// Cặp ký tự đặc trưng của UTF-8 tiếng Việt bị đọc thành cp1252/latin1
// Dựng từ mã ký tự để file nguồn chỉ có ASCII (ký tự vô hình U+0080..U+009F, NBSP).
const ch = (...codes) => String.fromCharCode(...codes);
const MOJIBAKE = new RegExp(
	[
		`${ch(0xc3)}[${ch(0xa0)}-${ch(0xbf)}]`, // Ã + byte 2 của chữ có dấu
		ch(0xe1, 0xbb), // á» (ồ, ộ, ờ...)
		ch(0xe1, 0xba), // áº (ả, ấ, ậ...)
		ch(0xc6, 0xb0), // Æ° (ư)
		ch(0xc4, 0x2018), // Ä‘ (đ)
		`${ch(0xc4)}[${ch(0x80)}-${ch(0xbf)}]`,
		`[${ch(0x80)}-${ch(0x9f)}]`, // ký tự điều khiển C1 — byte cp1252 không định nghĩa
	].join('|'),
);

test('mọi file .sql trong database/ là UTF-8 tiếng Việt đúng (không lỗi mã hoá)', () => {
	const bad = [];
	for (const file of walk(ROOT)) {
		const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
		lines.forEach((l, i) => {
			if (MOJIBAKE.test(l)) bad.push(`${path.relative(ROOT, file)}:${i + 1}: ${l.trim().slice(0, 80)}`);
		});
	}
	assert.deepEqual(bad, [], `Có dòng lỗi mã hoá:\n${bad.join('\n')}`);
});

test('mẫu nhận diện bắt đúng chữ vỡ và không bắt nhầm chữ Việt đúng', () => {
	assert.ok(MOJIBAKE.test('Pháº£i truyá»n Ã­t nháº¥t'));
	assert.ok(MOJIBAKE.test('NgÆ°á»i nháº­n'));
	assert.ok(!MOJIBAKE.test('Phải truyền ít nhất 1 tham số người nhận — Đã đọc'));
});

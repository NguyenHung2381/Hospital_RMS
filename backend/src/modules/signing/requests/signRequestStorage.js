/**
 * signRequestStorage.js — file văn bản của hồ sơ trình ký: uploads/sign-requests/<id>/d<docId>-v<n>.pdf
 * Mỗi lần ký ghi 1 file MỚI (không ghi đè bản cũ) để còn lịch sử và để hủy được khi ký lỗi giữa
 * chừng. Đường dẫn lưu DB là tương đối với UPLOADS_ROOT; KHÔNG phục vụ qua /uploads (link ký
 * HMAC ai có link cũng mở được) — chỉ tải qua API có kiểm quyền hồ sơ.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_ROOT } = require('../../../utils/uploadPaths');

const DIR = 'sign-requests';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Đường dẫn tương đối (lưu DB) của 1 phiên bản văn bản */
const relPathOf = (requestId, documentId, version) =>
	`${DIR}/${Number(requestId)}/d${Number(documentId)}-v${Number(version)}.pdf`;

// Chặn path traversal: chỉ nhận đường dẫn nằm trong uploads/sign-requests/
const absOf = (rel) => {
	const abs = path.resolve(UPLOADS_ROOT, rel);
	const base = path.resolve(UPLOADS_ROOT, DIR) + path.sep;
	if (!abs.startsWith(base)) throw new Error('Đường dẫn văn bản không hợp lệ');
	return abs;
};

/** @param {string} rel @param {Buffer} buf */
const write = async (rel, buf) => {
	const abs = absOf(rel);
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, buf, { flag: 'wx' });
};

/** @param {string} rel */
const read = (rel) => fs.readFile(absOf(rel));

/** Xóa các file vừa ghi (dọn khi giao dịch lỗi) @param {string[]} rels */
const removeAll = async (rels) => {
	await Promise.all(rels.map((r) => fs.unlink(absOf(r)).catch(() => {})));
};

/** Xóa cả thư mục hồ sơ (tạo hồ sơ lỗi) @param {number} requestId */
const removeRequestDir = async (requestId) => {
	await fs
		.rm(path.resolve(UPLOADS_ROOT, DIR, String(Number(requestId))), {
			recursive: true,
			force: true,
		})
		.catch(() => {});
};

module.exports = { sha256, relPathOf, write, read, removeAll, removeRequestDir };

/**
 * uploadPaths.js — vị trí lưu file upload trên đĩa + quy tắc đặt tên, dùng chung
 * cho các middleware upload* và service xoá file.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');

// Mã bản ghi dùng làm tên thư mục (chặn path traversal qua req.params).
const SAFE_ID = /^[A-Za-z0-9_-]{1,20}$/;

// "Báo cáo 1.pdf" → "Bo_co_1-<32 hex>.pdf". Phần ngẫu nhiên (không dùng
// Date.now() dễ đoán) là lớp phòng thủ thêm ngoài chữ ký link /uploads.
const uniqueFilename = (originalname) => {
	const ext = path.extname(originalname);
	const base = path
		.basename(originalname, ext)
		.replace(/\s+/g, '_')
		.replace(/[^a-zA-Z0-9_\-.]/g, '');
	return `${base}-${crypto.randomBytes(16).toString('hex')}${ext}`;
};

// Xoá file vật lý theo file_url "/uploads/..." (bỏ qua nếu không tồn tại / nằm ngoài UPLOADS_ROOT).
const removeUploadedFile = (fileUrl) => {
	if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
	const diskPath = path.resolve(UPLOADS_ROOT, fileUrl.slice('/uploads/'.length));
	if (!diskPath.startsWith(UPLOADS_ROOT + path.sep)) return;
	fs.unlink(diskPath, () => {});
};

// Link ảnh client gửi lại (thường là link đã ký lấy từ response trước) → đường
// dẫn gốc để lưu DB. Chỉ nhận file nằm ngay dưới `prefix` — không cho trỏ sang
// file khác trong /uploads (vd tài liệu đề tài) rồi nhận link ký qua API khác.
const toStoredUploadPath = (url, prefix) => {
	if (!url) return null;
	const pathname = String(url).split(/[?#]/)[0];
	const name = pathname.slice(prefix.length);
	if (!pathname.startsWith(prefix) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(name)) {
		throw Object.assign(new Error('Đường dẫn ảnh không hợp lệ — vui lòng tải ảnh lên lại.'), { statusCode: 400 });
	}
	return pathname;
};

module.exports = { UPLOADS_ROOT, SAFE_ID, uniqueFilename, removeUploadedFile, toStoredUploadPath };

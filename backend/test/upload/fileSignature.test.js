// Nhận diện nội dung file theo magic bytes (utils/fileSignature.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesExtension, SUPPORTED_EXTENSIONS } = require('../../src/utils/fileSignature');
const { DOCUMENT_EXTENSIONS, MEDIA_EXTENSIONS } = require('../../src/utils/fileTypeAllowlist');

const b = (...parts) =>
	Buffer.concat(
		parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))),
	);

test('mọi đuôi được phép upload đều có cách kiểm tra nội dung', () => {
	for (const ext of [...DOCUMENT_EXTENSIONS, ...MEDIA_EXTENSIONS]) {
		assert.ok(SUPPORTED_EXTENSIONS.includes(ext), `thiếu kiểm tra cho ${ext}`);
	}
});

test('nội dung đúng định dạng thì qua', () => {
	const ok = {
		'.pdf': b('%PDF-1.7\n'),
		'.docx': b([0x50, 0x4b, 0x03, 0x04], 'rest'),
		'.xlsx': b([0x50, 0x4b, 0x03, 0x04]),
		'.doc': b([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
		'.png': b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		'.jpg': b([0xff, 0xd8, 0xff, 0xe0]),
		'.webp': b('RIFF', [0, 0, 0, 0], 'WEBP'),
		'.mp4': b([0, 0, 0, 0x20], 'ftypisom'),
		'.rar': b('Rar!\x1a\x07\x01\x00'),
		'.txt': b('Xin chào\nDòng 2'),
		'.mp3': b('ID3', [3, 0]),
	};
	for (const [ext, head] of Object.entries(ok))
		assert.equal(matchesExtension(ext, head), true, ext);
});

test('file đổi đuôi (exe, HTML, ảnh giả) bị từ chối', () => {
	const exe = b('MZ', [0x90, 0x00, 0x03]);
	assert.equal(matchesExtension('.pdf', exe), false);
	assert.equal(matchesExtension('.docx', exe), false);
	assert.equal(matchesExtension('.txt', exe), false); // có byte NUL
	assert.equal(matchesExtension('.png', b('<html><script>alert(1)</script>')), false);
	assert.equal(matchesExtension('.jpg', b('<svg onload=alert(1)>')), false);
	assert.equal(matchesExtension('.pdf', b('')), false);
});

test('đuôi không có trong bảng kiểm tra thì không cho qua', () => {
	assert.equal(matchesExtension('.html', b('<html>')), false);
	assert.equal(matchesExtension('.exe', b('MZ')), false);
	assert.equal(matchesExtension('', b('%PDF-')), false);
});

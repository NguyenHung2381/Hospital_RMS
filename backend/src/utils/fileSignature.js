const fs = require('fs/promises');

// Kiểm tra NỘI DUNG file khớp phần mở rộng (magic bytes). Đuôi file do người
// dùng đặt — trước đây chỉ kiểm tra đuôi, nên đổi tên virus.exe / trang HTML
// độc thành "bao-cao.pdf" là lọt qua. Chỉ cần đọc vài KB đầu file.
const HEAD_BYTES = 4100;

const ascii = (buf, start, text) => buf.subarray(start, start + text.length).toString('latin1') === text;
const bytes = (buf, start, arr) => arr.every((b, i) => buf[start + i] === b);

const ZIP = (b) => bytes(b, 0, [0x50, 0x4b, 0x03, 0x04]) || bytes(b, 0, [0x50, 0x4b, 0x05, 0x06]);
const OLE = (b) => bytes(b, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // .doc/.xls/.ppt cũ
const RIFF = (b, form) => ascii(b, 0, 'RIFF') && ascii(b, 8, form);
// MP4/MOV/M4A: hộp đầu tiên (ISO BMFF) — 'ftyp' ở file mới, QuickTime cũ có thể bắt đầu bằng hộp khác
const ISO_BMFF = (b) => ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].some((t) => ascii(b, 4, t));
// Văn bản thuần: không có byte NUL (file nhị phân gần như luôn có)
const TEXT = (b) => !b.includes(0x00);

const CHECKS = {
	'.pdf': (b) => b.subarray(0, 1024).includes(Buffer.from('%PDF-')),
	'.doc': OLE,
	'.xls': OLE,
	'.ppt': OLE,
	'.docx': ZIP,
	'.xlsx': ZIP,
	'.pptx': ZIP,
	'.odt': ZIP,
	'.ods': ZIP,
	'.odp': ZIP,
	'.zip': ZIP,
	'.rar': (b) => ascii(b, 0, 'Rar!\x1a\x07'),
	'.7z': (b) => bytes(b, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
	'.rtf': (b) => ascii(b, 0, '{\\rtf'),
	'.txt': TEXT,
	'.csv': TEXT,
	'.png': (b) => bytes(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	'.jpg': (b) => bytes(b, 0, [0xff, 0xd8, 0xff]),
	'.jpeg': (b) => bytes(b, 0, [0xff, 0xd8, 0xff]),
	'.gif': (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'),
	'.webp': (b) => RIFF(b, 'WEBP'),
	'.bmp': (b) => ascii(b, 0, 'BM'),
	'.mp4': ISO_BMFF,
	'.m4v': ISO_BMFF,
	'.mov': ISO_BMFF,
	'.m4a': ISO_BMFF,
	'.avi': (b) => RIFF(b, 'AVI '),
	'.wav': (b) => RIFF(b, 'WAVE'),
	'.mkv': (b) => bytes(b, 0, [0x1a, 0x45, 0xdf, 0xa3]),
	'.webm': (b) => bytes(b, 0, [0x1a, 0x45, 0xdf, 0xa3]),
	'.mp3': (b) => ascii(b, 0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
	'.aac': (b) => ascii(b, 0, 'ADIF') || (b[0] === 0xff && (b[1] & 0xf6) === 0xf0),
};

// Đầu file: từ buffer (multer memoryStorage) hoặc đọc từ đĩa (diskStorage)
const readHead = async (file) => {
	if (file.buffer) return file.buffer.subarray(0, HEAD_BYTES);
	const fh = await fs.open(file.path, 'r');
	try {
		const buf = Buffer.alloc(HEAD_BYTES);
		const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
		return buf.subarray(0, bytesRead);
	} finally {
		await fh.close();
	}
};

// true = nội dung khớp đuôi. Đuôi không có trong bảng → false (không cho qua
// định dạng chưa biết cách kiểm tra).
const matchesExtension = (ext, head) => {
	const check = CHECKS[String(ext).toLowerCase()];
	return !!check && head.length > 0 && check(head);
};

module.exports = { readHead, matchesExtension, SUPPORTED_EXTENSIONS: Object.keys(CHECKS) };

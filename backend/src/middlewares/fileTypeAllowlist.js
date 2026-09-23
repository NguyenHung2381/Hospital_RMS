const path = require('path');

// Đuôi file được phép upload lên /uploads (được serve tĩnh, không qua auth).
// Chỉ liệt kê định dạng KHÔNG được trình duyệt tự thực thi — loại hẳn html,
// svg, js, exe, php... để chặn stored-XSS / phát tán mã độc qua đường upload
// tài liệu đề tài & đào tạo. Cùng nguyên tắc mà uploadImage.js đã áp dụng cho
// ảnh chèn bình luận (chỉ nhận PNG/JPEG/GIF/WEBP, không nhận SVG).
const DOCUMENT_EXTENSIONS = new Set([
	'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
	'.txt', '.csv', '.rtf', '.odt', '.ods', '.odp',
	'.zip', '.rar', '.7z',
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
]);

// Chỉ dùng thêm cho các loại upload cần video/audio bài giảng (course_document,
// lesson_document) — xem routes/courses.js, routes/trainingPrograms.js.
const MEDIA_EXTENSIONS = new Set([
	'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v',
	'.mp3', '.wav', '.m4a', '.aac',
]);

const isAllowedExtension = (filename, { allowMedia = false } = {}) => {
	const ext = path.extname(filename).toLowerCase();
	return DOCUMENT_EXTENSIONS.has(ext) || (allowMedia && MEDIA_EXTENSIONS.has(ext));
};

module.exports = { DOCUMENT_EXTENSIONS, MEDIA_EXTENSIONS, isAllowedExtension };

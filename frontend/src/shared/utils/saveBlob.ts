// Tải Blob (file Excel trả về từ API) xuống máy người dùng.
export const saveBlob = (blob: Blob, fileName: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);
};

// Tên file giữ nguyên tiếng Việt có dấu, chỉ bỏ ký tự Windows / macOS cấm trong tên file:
// "Chương trình: Hồi sức / Cấp cứu" → "Chương trình - Hồi sức - Cấp cứu".
export const fileTitle = (s: string) =>
	s
		.replace(/[\\/:*?"<>|]+/g, ' - ')
		.replace(/\s+/g, ' ')
		.replace(/^[\s.-]+|[\s.-]+$/g, '')
		.replace(/(\s-\s)+/g, ' - ')
		.slice(0, 150)
		.trim();

// Tên file an toàn, không dấu: "Nguyễn Văn A" → "nguyen-van-a".
export const fileSlug = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

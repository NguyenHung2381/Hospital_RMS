import DOMPurify from 'dompurify';

// Whitelist khớp với sanitizeComment() ở server (councilProgressService.js) —
// nhận xét hội đồng hỗ trợ định dạng chữ + ảnh chèn qua uploadCommentImage.
export function sanitizeCommentHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [
			'b',
			'strong',
			'i',
			'em',
			'u',
			's',
			'ul',
			'ol',
			'li',
			'br',
			'p',
			'img',
		],
		ALLOWED_ATTR: ['src', 'alt'],
	});
}

// Dùng cho title/tooltip — bỏ hết thẻ HTML, chỉ giữ văn bản thuần.
export function htmlToPlainText(html: string): string {
	return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
}

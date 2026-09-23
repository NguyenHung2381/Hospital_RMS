/** Lấy chữ viết tắt từ họ tên (VD: "Nguyễn Văn A" → "NA") */
export function getInitials(name: string | null | undefined): string {
	if (!name) return '?';
	return name
		.replace(/^(GS\.|PGS\.|TS\.|ThS\.|BS\.|KS\.|CN\.|ĐD\.|DS\.)\s*/i, '')
		.split(/\s+/)
		.filter(Boolean)
		.slice(-2)
		.map((w) => w[0])
		.join('')
		.toUpperCase();
}

/** Bỏ dấu tiếng Việt (dùng để tìm kiếm không phân biệt dấu) */
export function removeDiacritics(str: string): string {
	return str
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D');
}

/** Chuyển số sang chữ số La Mã (VD: 3 → "III") */
export function toRoman(n: number): string {
	const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
	const syms = [
		'M',
		'CM',
		'D',
		'CD',
		'C',
		'XC',
		'L',
		'XL',
		'X',
		'IX',
		'V',
		'IV',
		'I',
	];
	let result = '';
	for (let i = 0; i < vals.length; i++) {
		while (n >= vals[i]) {
			result += syms[i];
			n -= vals[i];
		}
	}
	return result;
}

/** Escape HTML entities (dùng khi build HTML string động) */
export function escHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

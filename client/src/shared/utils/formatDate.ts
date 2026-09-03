export function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diff / 60000);
	if (m < 1) return 'Vừa xong';
	if (m < 60) return `${m} phút trước`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} giờ trước`;
	const d = Math.floor(h / 24);
	if (d === 1) return 'Hôm qua';
	if (d < 7) return `${d} ngày trước`;
	return formatDateVN(iso);
}

export function formatDate(value?: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return formatDateVN(value);
}

/** Như `formatDate` nhưng luôn trả string — rơi về `fallback` (mặc định "—") khi rỗng. */
export function formatDateOr(value?: string | null, fallback = '—'): string {
	return formatDate(value) ?? fallback;
}

// dd/mm/yyyy cố định theo giờ VN (khác `formatDate` ở trên: luôn trả string, không phụ
// thuộc timezone trình duyệt) — dùng cho báo cáo/dashboard cần hiển thị nhất quán.
export function formatDateVN(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '';
	return d.toLocaleDateString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}

// dd/mm/yyyy HH:mm — dùng cho hiển thị ngày giờ đầy đủ chuẩn Việt Nam
export function formatDateTimeVN(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '';
	return d.toLocaleString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
}

export function parseDate(s: string | null | undefined): Date | null {
	if (!s) return null;
	if (s.includes('/')) {
		const [d, m, y] = s.split('/');
		if (!d || !m || !y) return null;
		const dt = new Date(Number(y), Number(m) - 1, Number(d));
		return isNaN(dt.getTime()) ? null : dt;
	}
	if (s.includes('-')) {
		const parts = s.split('T')[0].split('-');
		if (parts.length === 3) {
			const [y, m, d] = parts;
			const dt = new Date(Number(y), Number(m) - 1, Number(d));
			return isNaN(dt.getTime()) ? null : dt;
		}
	}
	const dt = new Date(s);
	return isNaN(dt.getTime()) ? null : dt;
}


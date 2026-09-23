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

// Chuẩn hoá bất kỳ định dạng ngày nào (ISO string "2026-10-31T00:00:00.000Z",
// "2026-10-31", "31/10/2026", Date object) về chuỗi chuẩn 'YYYY-MM-DD'.
export function toIsoDate(value?: string | Date | null): string {
	if (!value) return '';
	if (value instanceof Date) {
		if (isNaN(value.getTime())) return '';
		const y = value.getFullYear();
		const m = String(value.getMonth() + 1).padStart(2, '0');
		const d = String(value.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	const s = String(value).trim();
	if (!s) return '';

	// Khớp định dạng YYYY-MM-DD (kể cả có phần đuôi T... hoặc giờ:phút:giây)
	const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (isoMatch) {
		const [, y, m, d] = isoMatch;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}

	// Khớp định dạng DD/MM/YYYY (Việt Nam)
	const vnMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (vnMatch) {
		const [, d, m, y] = vnMatch;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}

	// Thử parse qua Date
	const dt = new Date(s);
	if (!isNaN(dt.getTime())) {
		const y = dt.getFullYear();
		const m = String(dt.getMonth() + 1).padStart(2, '0');
		const d = String(dt.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	return '';
}

// dd/mm/yyyy cố định theo chuẩn Việt Nam (xử lý an toàn cho ISO string, YYYY-MM-DD, v.v.)
export function formatDateVN(iso: string | Date | null | undefined): string {
	if (!iso) return '';
	const norm = toIsoDate(iso);
	if (!norm) return '';
	const [y, m, d] = norm.split('-');
	return `${d}/${m}/${y}`;
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
	const norm = toIsoDate(s);
	if (norm) {
		const [y, m, d] = norm.split('-');
		const dt = new Date(Number(y), Number(m) - 1, Number(d));
		return isNaN(dt.getTime()) ? null : dt;
	}
	const dt = new Date(s);
	return isNaN(dt.getTime()) ? null : dt;
}


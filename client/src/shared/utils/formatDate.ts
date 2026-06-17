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
	return new Date(iso).toLocaleDateString('vi-VN');
}

export function formatDate(value?: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat('vi-VN').format(date);
}

// Mốc thời gian của bảng ký số (created_at, checked_at) lưu GIỜ VN, driver gắn nhãn UTC
// (backend/README.md, mục Giờ) ⇒ đọc theo múi UTC. formatDateTimeVN dành cho cột lưu giờ UTC
// thật — dùng ở đây sẽ cộng thêm 7 giờ.
export const formatStamp = (iso: string | null | undefined): string => {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString('vi-VN', {
		timeZone: 'UTC',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
};

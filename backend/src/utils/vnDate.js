/**
 * vnDate.js — ngày theo giờ Việt Nam (UTC+7), đúng bất kể múi giờ của server
 * (dịch sang giờ VN rồi đọc bằng getter UTC).
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

// Hôm nay theo giờ VN, dạng Date ở 00:00 UTC — so sánh với cột DATE của SQL.
const todayVN = () => {
	const vn = new Date(Date.now() + VN_OFFSET_MS);
	return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
};

// Hôm nay theo giờ VN dạng 'YYYY-MM-DD'.
const todayKeyVN = () => todayVN().toISOString().slice(0, 10);

// Date | chuỗi ngày → 'dd/mm/yyyy' theo giờ VN; rỗng/không hợp lệ → ''.
const fmtDateVN = (d) => {
	if (!d) return '';
	const dt = d instanceof Date ? d : new Date(d);
	if (isNaN(dt.getTime())) return '';
	const vn = new Date(dt.getTime() + VN_OFFSET_MS);
	return `${pad2(vn.getUTCDate())}/${pad2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
};

module.exports = { VN_OFFSET_MS, todayVN, todayKeyVN, fmtDateVN };

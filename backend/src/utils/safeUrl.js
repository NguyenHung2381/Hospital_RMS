// Link ngoài do người dùng nhập (tài liệu khoá học / bài học dạng "link") được
// hiển thị thành <a href>. Chỉ nhận http/https tuyệt đối — chặn javascript:,
// data:, vbscript:... (XSS lưu trữ khi link được mở ở nơi không tự lọc như
// React 19: file xuất, email, client khác).
const assertHttpUrl = (value, field = 'Đường dẫn') => {
	let url;
	try {
		url = new URL(String(value ?? '').trim());
	} catch {
		url = null;
	}
	if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
		throw { statusCode: 400, message: `${field} phải là địa chỉ http:// hoặc https:// hợp lệ` };
	}
	return url.href;
};

module.exports = { assertHttpUrl };

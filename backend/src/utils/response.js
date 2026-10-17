const success = (res, data, message = 'Thành công', statusCode = 200) => {
	return res.status(statusCode).json({ success: true, message, data });
};

const created = (res, data, message = 'Tạo thành công') => {
	return res.status(201).json({ success: true, message, data });
};

const error = (res, message = 'Lỗi server', statusCode = 500, errors = null) => {
	const body = { success: false, message };
	if (errors) body.errors = errors;
	return res.status(statusCode).json(body);
};

const notFound = (res, message = 'Không tìm thấy dữ liệu') => {
	return res.status(404).json({ success: false, message });
};

const unauthorized = (res, message = 'Không có quyền truy cập') => {
	return res.status(401).json({ success: false, message });
};

const forbidden = (res, message = 'Truy cập bị từ chối') => {
	return res.status(403).json({ success: false, message });
};

// Trả file .xlsx (exceljs Workbook) để trình duyệt tải về với tên tiếng Việt giữ nguyên.
const sendWorkbook = async (res, wb, fileName) => {
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	);
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
	);
	await wb.xlsx.write(res);
	res.end();
};

module.exports = { success, created, error, notFound, unauthorized, forbidden, sendWorkbook };

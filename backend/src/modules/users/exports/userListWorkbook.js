// userListWorkbook.js — dựng workbook cho POST /api/v1/users/export-excel.
const ExcelJS = require('exceljs');
const xl = require('../../../utils/excelTemplate');

const EXPORT_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 6 },
	{ key: 'staff_number', header: 'Mã nhân viên', width: 14 },
	{ key: 'full_name', header: 'Họ và tên', width: 28 },
	{ key: 'username', header: 'Tên đăng nhập', width: 18 },
	{ key: 'email', header: 'Email', width: 28 },
	{ key: 'department_name', header: 'Khoa/Phòng', width: 28 },
	{ key: 'role_name', header: 'Vai trò', width: 20 },
	{ key: 'status', header: 'Trạng thái', width: 14 },
	{ key: 'created_at', header: 'Ngày tạo', width: 13 },
];

const fmtDate = (d) =>
	d ? new Date(d).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';

const buildUserListWorkbook = (data) => {
	const wb = new ExcelJS.Workbook();
	const ws = xl.buildSheet(wb, {
		sheetName: 'Người dùng',
		title: 'DANH SÁCH NGƯỜI DÙNG',
		subtitle: `Xuất ngày ${fmtDate(new Date())} · ${data.length} tài khoản`,
		columns: EXPORT_COLUMNS,
	});
	data.forEach((u, i) =>
		ws.addRow({
			stt: i + 1,
			staff_number: u.staff_number ?? '',
			full_name: u.full_name ?? '',
			username: u.username,
			email: u.email ?? '',
			department_name: u.department_name ?? '',
			role_name: u.role_name ?? '',
			status: u.is_active ? 'Hoạt động' : 'Đã khoá',
			created_at: fmtDate(u.created_at),
		}),
	);
	xl.styleBody(ws);
	return wb;
};

module.exports = { buildUserListWorkbook };

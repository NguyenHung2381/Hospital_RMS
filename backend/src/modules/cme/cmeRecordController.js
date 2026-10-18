const cmeRecordService = require('./cmeRecordService');
const cmeRecordImportService = require('./cmeRecordImportService');
const cmeReportService = require('./cmeReportService');
const cmeReportWorkbook = require('./exports/cmeReportWorkbook');
const { success, created, notFound } = require('../../utils/response');
const { hasPermission } = require('../../permissions/authz');
const { asyncHandler } = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	return success(res, await cmeRecordService.getAll(req.query));
});

const getById = asyncHandler(async (req, res) => {
	const item = await cmeRecordService.getById(req.params.id);
	if (!item) return notFound(res);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	return created(res, await cmeRecordService.create(req.body, req.user.id));
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await cmeRecordService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await cmeRecordService.remove(req.params.id, req.user.id);
	return success(res, null, 'Đã xoá ghi nhận CME');
});

const removeMany = asyncHandler(async (req, res) => {
	const out = await cmeRecordService.removeMany(req.body.ids, req.user.id);
	return success(res, out, `Đã xoá ${out.deleted} ghi nhận CME`);
});

const addEvidence = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Vui lòng chọn file minh chứng' });
	}
	return success(res, await cmeRecordService.addEvidence(req.params.id, req.file, req.user.id));
});

// POST /cme-records/staff — nút "Thêm NV" trong hộp thoại nhập: tạo tài khoản
// người dùng ⇒ ngoài cme_records:manage (route) cần thêm users:create.
const createStaff = asyncHandler(async (req, res) => {
	if (!hasPermission(req.user, 'users', 'create')) {
		return res
			.status(403)
			.json({ success: false, message: 'Cần quyền "Thêm người dùng" để thêm nhân viên mới.' });
	}
	return created(
		res,
		await cmeRecordImportService.createMissingStaff(req.body || {}, req.user.id),
		'Đã thêm nhân viên',
	);
});

// staff_departments / staff_names (multipart → chuỗi JSON) { "Mã NV": department_id | họ tên }:
// khoa / họ tên nhập riêng cho từng nhân viên mới ở bước xem trước. Sai định dạng thì bỏ qua.
const parseStaffMap = (raw) => {
	try {
		const obj = JSON.parse(raw || '{}');
		const out = {};
		for (const [k, v] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
			const val = typeof v === 'string' ? v.trim() : '';
			if (/^\d+$/.test(k) && val) out[Number(k)] = val;
		}
		return out;
	} catch {
		return {};
	}
};

const importExcel = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	}
	// Tạo nhân viên mới từ file = tạo tài khoản người dùng → cần thêm quyền users:create
	const canCreateStaff = hasPermission(req.user, 'users', 'create');
	const createMissing = req.body.create_missing === '1' || req.body.create_missing === 'true';
	if (createMissing && !canCreateStaff) {
		return res.status(403).json({
			success: false,
			message: 'Cần quyền "Thêm người dùng" để tạo nhân viên mới khi nhập.',
		});
	}
	const out = await cmeRecordImportService.importExcel(
		{
			buffer: req.file.buffer,
			dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
			defaults: {
				year: parseInt(req.body.year, 10) || null,
				group_id: req.body.group_id || null,
				category_id: req.body.category_id || null,
				title: String(req.body.title || '').trim() || null,
				quantity: Number(req.body.quantity) > 0 ? Number(req.body.quantity) : null,
				create_missing: createMissing,
				new_department_id: req.body.new_department_id || null,
				staff_departments: parseStaffMap(req.body.staff_departments),
				staff_names: parseStaffMap(req.body.staff_names),
				can_create_staff: canCreateStaff,
			},
		},
		req.user.id,
	);
	return success(res, out);
});

const reviewWith = (approve) =>
	asyncHandler(async (req, res) => {
		const item = await cmeRecordService.review(
			req.params.id,
			approve,
			req.body?.reason,
			req.user.id,
		);
		if (!item) return notFound(res);
		return success(res, item, approve ? 'Đã duyệt' : 'Đã từ chối');
	});
const approve = reviewWith(true);
const reject = reviewWith(false);

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

const importTemplate = asyncHandler(async (req, res) => {
	return sendWorkbook(
		res,
		await cmeRecordImportService.templateWorkbook(),
		'mau-nhap-ghi-nhan-cme.xlsx',
	);
});

const exportExcel = asyncHandler(async (req, res) => {
	// Khoảng năm: { from_year, to_year } (trống = không giới hạn đầu đó); vẫn nhận { year } cũ = 1 năm
	const { year, from_year, to_year, search, department } = req.body || {};
	const data = await cmeReportService.getData({
		year,
		fromYear: from_year,
		toYear: to_year,
		search,
		department,
	});
	const d = new Date();
	const wb = cmeReportWorkbook.buildWorkbook(data, {
		title: `BÁO CÁO TÍN CHỈ CME ${data.rangeLabel}`,
		subtitle: [
			department,
			`${data.people.length} nhân sự`,
			`Xuất ngày ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
		]
			.filter(Boolean)
			.join(' · '),
	});
	const { fromYear, toYear } = data;
	const suffix =
		fromYear === null && toYear === null
			? ''
			: fromYear === toYear
				? `-${fromYear}`
				: `-${fromYear ?? 'dau'}-${toYear ?? 'nay'}`;
	return sendWorkbook(res, wb, `bao-cao-cme${suffix}.xlsx`);
});

module.exports = {
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	removeMany,
	addEvidence,
	approve,
	reject,
	importExcel,
	importTemplate,
	exportExcel,
	createStaff,
};

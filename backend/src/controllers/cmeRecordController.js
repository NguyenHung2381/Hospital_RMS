const cmeRecordService = require('../services/cmeRecordService');
const cmeRecordImportService = require('../services/cmeRecordImportService');
const cmeReportService = require('../services/cmeReportService');
const { success, created, notFound } = require('../utils/response');
const { hasPermission } = require('../middlewares/auth');

const getAll = async (req, res, next) => {
	try {
		return success(res, await cmeRecordService.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await cmeRecordService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		return created(res, await cmeRecordService.create(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await cmeRecordService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await cmeRecordService.remove(req.params.id, req.user.id);
		return success(res, null, 'Đã xoá ghi nhận CME');
	} catch (err) {
		next(err);
	}
};

const removeMany = async (req, res, next) => {
	try {
		const out = await cmeRecordService.removeMany(req.body.ids, req.user.id);
		return success(res, out, `Đã xoá ${out.deleted} ghi nhận CME`);
	} catch (err) {
		next(err);
	}
};

const addEvidence = async (req, res, next) => {
	try {
		if (!req.file) {
			return res.status(400).json({ success: false, message: 'Vui lòng chọn file minh chứng' });
		}
		return success(res, await cmeRecordService.addEvidence(req.params.id, req.file, req.user.id));
	} catch (err) {
		next(err);
	}
};

// POST /cme-records/staff — nút "Thêm NV" trong hộp thoại nhập: tạo tài khoản
// người dùng ⇒ ngoài cme_records:manage (route) cần thêm users:create.
const createStaff = async (req, res, next) => {
	try {
		if (!hasPermission(req.user, 'users', 'create')) {
			return res.status(403).json({ success: false, message: 'Cần quyền "Thêm người dùng" để thêm nhân viên mới.' });
		}
		return created(res, await cmeRecordImportService.createMissingStaff(req.body || {}, req.user.id), 'Đã thêm nhân viên');
	} catch (err) {
		next(err);
	}
};

const importExcel = async (req, res, next) => {
	try {
		if (!req.file) {
			return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
		}
		// Tạo nhân viên mới từ file = tạo tài khoản người dùng → cần thêm quyền users:create
		const canCreateStaff = hasPermission(req.user, 'users', 'create');
		const createMissing = req.body.create_missing === '1' || req.body.create_missing === 'true';
		if (createMissing && !canCreateStaff) {
			return res.status(403).json({ success: false, message: 'Cần quyền "Thêm người dùng" để tạo nhân viên mới khi nhập.' });
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
					can_create_staff: canCreateStaff,
				},
			},
			req.user.id,
		);
		return success(res, out);
	} catch (err) {
		next(err);
	}
};

const reviewWith = (approve) => async (req, res, next) => {
	try {
		const item = await cmeRecordService.review(req.params.id, approve, req.body?.reason, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, approve ? 'Đã duyệt' : 'Đã từ chối');
	} catch (err) {
		next(err);
	}
};
const approve = reviewWith(true);
const reject = reviewWith(false);

const sendWorkbook = async (res, wb, fileName) => {
	res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
	await wb.xlsx.write(res);
	res.end();
};

const importTemplate = async (req, res, next) => {
	try {
		return sendWorkbook(res, await cmeRecordImportService.templateWorkbook(), 'mau-nhap-ghi-nhan-cme.xlsx');
	} catch (err) {
		next(err);
	}
};

const exportExcel = async (req, res, next) => {
	try {
		const { year, search, department } = req.body || {};
		const data = await cmeReportService.getData({ year, search, department });
		const d = new Date();
		const wb = cmeReportService.buildWorkbook(data, {
			title: `BÁO CÁO TÍN CHỈ CME ${year ? `NĂM ${year}` : 'TẤT CẢ CÁC NĂM'}`,
			subtitle: [department, `${data.people.length} nhân sự`, `Xuất ngày ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`]
				.filter(Boolean)
				.join(' · '),
		});
		return sendWorkbook(res, wb, `bao-cao-cme${year ? `-${year}` : ''}.xlsx`);
	} catch (err) {
		next(err);
	}
};

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

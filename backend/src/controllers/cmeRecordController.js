const cmeRecordService = require('../services/cmeRecordService');
const cmeRecordImportService = require('../services/cmeRecordImportService');
const { success, created, notFound } = require('../utils/response');

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

const importExcel = async (req, res, next) => {
	try {
		if (!req.file) {
			return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
		}
		const out = await cmeRecordImportService.importExcel(
			{ buffer: req.file.buffer, dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true' },
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
		const { year, search, department, category_id, evidence } = req.body || {};
		const wb = await cmeRecordImportService.exportWorkbook({ year, search, department, category_id, evidence });
		return sendWorkbook(res, wb, `ghi-nhan-cme${year ? `-${year}` : ''}.xlsx`);
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
	addEvidence,
	approve,
	reject,
	importExcel,
	importTemplate,
	exportExcel,
};

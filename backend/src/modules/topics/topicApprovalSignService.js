/**
 * topicApprovalSignService.js — phiếu phê duyệt đề tài có chữ ký số.
 *
 * Người duyệt bật "Ký số" khi ra quyết định ⇒ hệ thống dựng phiếu PDF (thông tin đề tài,
 * quyết định, ý kiến, người duyệt), ký bằng chứng thư CÁ NHÂN của chính người duyệt qua
 * VIN-HSM, rồi lưu phiếu đã ký vào tài liệu của đề tài (1 lượt tải lên riêng).
 *
 * Thứ tự ở topicController.approve: ký TRƯỚC khi ghi quyết định — ký lỗi (chưa khai báo
 * chứng thư, VIN-HSM từ chối...) thì quyết định chưa được ghi, người duyệt sửa rồi làm lại.
 * Ghi quyết định lỗi sau khi đã ký thì phiếu không được lưu (nhật ký ký số vẫn có dòng ký).
 */
const fs = require('fs/promises');
const path = require('path');
const { UPLOADS_ROOT, SAFE_ID, uniqueFilename } = require('../../utils/uploadPaths');
const { httpError } = require('../../utils/httpError');
const signingService = require('../signing/signingService');
const signingPdf = require('../signing/signingPdf');
const fileService = require('./fileService');
const { getById } = require('./topicService');

const DECISION_LABEL = {
	approved: 'Phê duyệt',
	rejected: 'Không phê duyệt',
	supplement: 'Yêu cầu bổ sung, chỉnh sửa',
};

// Ghi chú lượt tải lên — màn tài liệu đề tài nhận ra phiếu ký số theo chuỗi này
const BATCH_NOTE = 'Phiếu phê duyệt có chữ ký số';

const fmtMoney = (n) =>
	n === null || n === undefined || n === '' ? '' : `${Number(n).toLocaleString('vi-VN')} đồng`;

/**
 * Dựng + ký phiếu. Trả PDF đã ký và tên file.
 * @param {string} topicId
 * @param {string} decision  approved | rejected | supplement
 * @param {string|null|undefined} comment
 * @param {{ id: string, full_name?: string }} user
 */
const signDecision = async (topicId, decision, comment, user) => {
	if (!DECISION_LABEL[decision]) throw httpError(400, 'Quyết định không hợp lệ');
	const topic = await getById(topicId);
	if (!topic) throw httpError(404, `Đề tài ${topicId} không tồn tại`);
	const leader = (topic.members || []).find((m) => m.role === 'principal_investigator');
	const now = new Date();
	const signer = await signingService.signerNameOf(user.id, user.full_name || user.id);
	const { pdf, box } = await signingPdf.renderSheet({
		unit: 'PHÒNG QUẢN LÝ NGHIÊN CỨU KHOA HỌC',
		title: 'Phiếu phê duyệt đề tài',
		subtitle: `Mã đề tài: ${topic.id}`,
		docTitle: `Phiếu phê duyệt đề tài ${topic.id}`,
		fields: [
			['Tên đề tài', topic.title],
			['Chủ nhiệm đề tài', leader?.ho_ten || topic.created_by_name || ''],
			['Khoa / phòng', topic.department_name || ''],
			['Đợt', topic.round_name || ''],
			['Lĩnh vực', topic.category_name || ''],
			['Cấp', topic.level_name || ''],
			['Kinh phí dự kiến', fmtMoney(topic.budget_estimated)],
			['Quyết định', DECISION_LABEL[decision]],
			['Thời điểm', signingPdf.stampVN(now)],
		],
		paragraphs: comment ? [{ heading: 'Ý kiến của người duyệt', text: String(comment) }] : [],
		signRole: 'Người phê duyệt',
		signName: signer,
		placeDate: signingPdf.placeDateVN(now),
	});
	const signed = await signingService.signPdfAsUser(user.id, pdf, {
		docType: 'topic_approval',
		docRef: topicId,
		...box,
		// VIN-HSM tự in "Ký bởi: <text>" và ngày ký
		text: signer,
	});
	return { pdf: signed, fileName: `Phieu_phe_duyet_${topicId}.pdf` };
};

/**
 * Lưu phiếu đã ký vào tài liệu đề tài: uploads/topics/<mã>/... + 1 lượt tải lên.
 * @param {string} topicId
 * @param {{ pdf: Buffer, fileName: string }} signed
 * @param {string} actorId
 */
const attach = async (topicId, signed, actorId) => {
	if (!SAFE_ID.test(topicId)) throw httpError(400, 'Mã đề tài không hợp lệ');
	const dir = path.join(UPLOADS_ROOT, 'topics', topicId);
	await fs.mkdir(dir, { recursive: true });
	const stored = uniqueFilename(signed.fileName);
	await fs.writeFile(path.join(dir, stored), signed.pdf);
	try {
		await fileService.uploadFiles(
			topicId,
			[
				{
					file_name: signed.fileName,
					file_url: `/uploads/topics/${topicId}/${stored}`,
					file_size: signed.pdf.length,
					mime_type: 'application/pdf',
					description: BATCH_NOTE,
				},
			],
			BATCH_NOTE,
			actorId,
		);
	} catch (err) {
		await fs.unlink(path.join(dir, stored)).catch(() => {});
		throw err;
	}
	return { file_name: signed.fileName, file_url: `/uploads/topics/${topicId}/${stored}` };
};

module.exports = { signDecision, attach, BATCH_NOTE };

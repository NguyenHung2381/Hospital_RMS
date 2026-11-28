/**
 * bankPayment.js — ghi nhận tiền ngân hàng báo về vào học phí, dùng đúng các chốt của
 * tuitionService (khóa enrollment_fees, kiểm vượt số phải nộp, cấp số phiếu thu) — tách
 * riêng để tuitionService.js không phình thêm.
 */
const { getPool, sql } = require('../../../../config/db');
const { genTuitionPaymentId } = require('../../../../utils/idGenerator');
const { broadcast } = require('../../../events/eventService');
const tuition = require('../tuitionService');

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const money = (n) => `${Number(n).toLocaleString('vi-VN')} đ`;
const clip = (v, n) => {
	const s = String(v ?? '').trim();
	return s ? s.slice(0, n) : null;
};

/** Lượt ghi danh + tổng hợp học phí; không có ⇒ null (summaryOf ném 404). */
const findSummary = async (enrollmentId) => {
	try {
		return await tuition.summaryOf(await getPool(), enrollmentId);
	} catch (err) {
		if (/** @type {any} */ (err).statusCode === 404) return null;
		throw err;
	}
};

/** Tiền ngân hàng báo về vượt số còn phải nộp (kiểm lại sau khi khóa). */
class BankOverpay extends Error {}

/**
 * Ghi nhận tiền cho 1 lượt ghi danh — chạy trong tx của bên gọi, sau khi khóa
 * enrollment_fees như mọi thao tác ghi tiền khác. Có khoản học viên đã báo (pending) đúng
 * số tiền ⇒ xác nhận khoản đó (không tính tiền 2 lần); không thì tạo khoản mới rồi xác
 * nhận. Cả hai đều cấp số phiếu thu.
 * @param {any} tx
 * @param {{ enrollmentId: string, amount: number, paidDate: string, ref: string, note: string,
 *           actorId: string | null }} input
 * @returns {Promise<{ paymentId: string, receiptNo: string, reusedPending: boolean }>}
 */
const applyBankPayment = async (tx, { enrollmentId, amount, paidDate, ref, note, actorId }) => {
	await tuition.ensureFeeRow(tx, enrollmentId, actorId);
	if (amount > (await tuition.lockedSummary(tx, enrollmentId)).remaining) throw new BankOverpay();
	const pending = (
		await tx
			.request()
			.input('eid', sql.VarChar(20), enrollmentId)
			.query(
				"SELECT id, amount FROM tuition_payments WHERE enrollment_id = @eid AND status = 'pending' ORDER BY created_at",
			)
	).recordset.find((p) => num(p.amount) === amount);
	let paymentId = pending?.id;
	if (paymentId) {
		await tx
			.request()
			.input('id', sql.VarChar(20), paymentId)
			.input('ref', sql.NVarChar(100), clip(ref, 100))
			.query('UPDATE tuition_payments SET transfer_ref = COALESCE(transfer_ref, @ref) WHERE id = @id');
	} else {
		paymentId = await genTuitionPaymentId(tx);
		await tx
			.request()
			.input('id', sql.VarChar(20), paymentId)
			.input('eid', sql.VarChar(20), enrollmentId)
			.input('amount', sql.Decimal(18, 0), amount)
			.input('paid_date', sql.Date, paidDate)
			.input('ref', sql.NVarChar(100), clip(ref, 100))
			.input('note', sql.NVarChar(500), clip(note, 500))
			.input('actor', sql.VarChar(20), actorId).query(`
        INSERT INTO tuition_payments (id, enrollment_id, amount, method, status, paid_date, transfer_ref, note, created_by)
        VALUES (@id, @eid, @amount, 'transfer', 'pending', @paid_date, @ref, @note, @actor)`);
	}
	const receiptNo = await tuition.confirmInTx(tx, paymentId, actorId);
	return { paymentId, receiptNo, reusedPending: !!pending };
};

/** Sau commit: báo học viên + làm mới màn hình học phí. */
const afterBankPayment = async (row, amount, receiptNo, paymentId) => {
	broadcast('update', { entity: 'tuition' });
	await tuition.notifyTrainee(
		row,
		'tuition_confirmed',
		`Đã nhận ${money(amount)} học phí khóa ${row.course_name} qua ngân hàng`,
		`Biên lai số ${receiptNo}`,
		paymentId,
	);
};

module.exports = { findSummary, applyBankPayment, afterBankPayment, BankOverpay };

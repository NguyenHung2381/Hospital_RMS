/**
 * tuitionGuards.js — các chốt toàn vẹn / phạm vi của học phí (rà bảo mật 2026-11-26),
 * tách khỏi tuitionService.js cho gọn.
 *
 *   lockFee    (S-06) khóa dòng enrollment_fees FOR UPDATE rồi đọc lại các khoản nộp trong
 *              transaction — 2 thao tác ghi tiền song song chạy tuần tự, thao tác sau thấy
 *              khoản thao tác trước vừa commit (không nộp thừa mà vẫn cấp biên lai).
 *   approvers  (S-07) người nhận thông báo học phí phía phòng Đào tạo.
 */
const { getPool, sql } = require('../../../config/db');
const { findActiveUserIdsWhere } = require('../../access/permissionService');
const { hasPermission } = require('../../../permissions/authz');
const { courseScope } = require('../courses/coursePolicy');

/**
 * Gọi SAU ensureFeeRow (dòng chắc chắn đã có), trong transaction của thao tác ghi tiền.
 * @returns {Promise<{ fee: { has_fee_row: number, base_amount: any, discount_amount: any }, payments: { amount: any, status: string }[] }>}
 */
const lockFee = async (tx, enrollmentId) => {
	const run = (text) => tx.request().input('eid', sql.VarChar(20), enrollmentId).query(text);
	const row = (
		await run(
			'SELECT base_amount, discount_amount FROM enrollment_fees WHERE enrollment_id = @eid FOR UPDATE',
		)
	).recordset[0];
	const payments = (
		await run('SELECT amount, status FROM tuition_payments WHERE enrollment_id = @eid')
	).recordset;
	return {
		fee: { has_fee_row: 1, base_amount: row?.base_amount, discount_amount: row?.discount_amount },
		payments,
	};
};

/**
 * Thông báo có họ tên học viên + số tiền: chỉ gửi người có courses:approve phạm vi 'all',
 * hoặc phạm vi 'assigned' VÀ được phân công dạy khóa này — như listPending / router.param.
 */
const approvers = async (courseId) => {
	const canApprove = (u) => hasPermission(u, 'courses', 'approve');
	const isAssigned = (u) => courseScope(u, 'approve') === 'assigned';
	const all = await findActiveUserIdsWhere((u) => canApprove(u) && !isAssigned(u));
	const scoped = await findActiveUserIdsWhere((u) => canApprove(u) && isAssigned(u));
	if (!scoped.length) return all;
	const pool = await getPool();
	const teaching = new Set(
		(
			await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
        SELECT DISTINCT lec.user_id FROM lecturer_assignments la
        JOIN lecturers lec ON lec.id = la.lecturer_id
        WHERE la.course_id = @course_id AND lec.is_active = 'true' AND lec.user_id IS NOT NULL`)
		).recordset.map((r) => r.user_id),
	);
	return [...new Set([...all, ...scoped.filter((id) => teaching.has(id))])];
};

module.exports = { lockFee, approvers };

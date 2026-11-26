/**
 * tuitionService.js — học phí của học viên (migration 2027-01-08_hoc_phi_hoc_vien).
 *
 *   Học viên (cổng /me):   xem khoản phải nộp + thông tin chuyển khoản VietQR, báo đã
 *                          chuyển khoản kèm ảnh / PDF chứng từ ⇒ khoản nộp 'pending',
 *                          rút lại khoản chưa xác nhận, tải phiếu thu khi đã xác nhận.
 *   Phòng Đào tạo (courses:approve): miễn / giảm, ghi nhận khoản nộp tại quầy (xác
 *                          nhận luôn), xác nhận / từ chối khoản học viên báo.
 *
 * Số phải nộp = enrollment_fees.base_amount − discount_amount; lượt ghi danh chưa có
 * dòng enrollment_fees ⇒ base = học phí chương trình hiện tại (chép lại lúc có thao tác
 * đầu tiên — ensureFeeRow). Đã nộp = tổng khoản 'confirmed'.
 */
const fs = require('fs');
const { getPool, sql, withActorTransaction, jsonValues, nowSql } = require('../../../config/db');
const { badRequest, notFound, conflict } = require('../../../utils/httpError');
const { genTuitionPaymentId, genTuitionReceiptNo } = require('../../../utils/idGenerator');
const { broadcast } = require('../../events/eventService');
const notificationService = require('../../notifications/notificationService');
const trainingFileService = require('../trainingFileService');
const { isPdfOrImage } = require('../trainees/traineeProfilePdf');
const { TRAINEE_OF_USER_SQL } = require('../trainees/traineeOfUser');
const { todayKeyVN } = require('../../../utils/vnDate');
const { getBankInfo } = require('./tuitionSettings');
const { lockFee, approvers } = require('./tuitionGuards');
const { courseScope, ASSIGNED_EXISTS_SQL } = require('../courses/coursePolicy');

const changed = () => broadcast('update', { entity: 'tuition' });
const money = (n) => `${Number(n).toLocaleString('vi-VN')} đ`;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

// ─── Tính toán thuần (không DB) ──────────────────────────────────────────────

/** Nội dung chuyển khoản của 1 lượt ghi danh — ASCII, ngắn, đối chiếu sao kê được. */
const transferContent = (enrollmentId) => `HP ${enrollmentId}`;

/**
 * Tổng hợp 1 lượt ghi danh: số phải nộp, đã nộp, đang chờ, còn lại, trạng thái.
 * state: no_fee (chương trình không thu) | exempt (miễn toàn bộ) | paid | partial | unpaid.
 * @param {{ base_amount?: any, discount_amount?: any, tuition_fee?: any, has_fee_row?: any }} row
 * @param {{ amount: any, status: string }[]} payments
 */
const summarize = (row, payments) => {
	const snap = row.has_fee_row === true || row.has_fee_row === 1 || row.has_fee_row === '1';
	const base = snap ? num(row.base_amount) : num(row.tuition_fee);
	const discount = snap ? num(row.discount_amount) : 0;
	const due = Math.max(base - discount, 0);
	const sum = (st) =>
		payments.filter((p) => p.status === st).reduce((t, p) => t + num(p.amount), 0);
	const paid = sum('confirmed');
	const pending = sum('pending');
	const remaining = Math.max(due - paid, 0);
	let state;
	if (base === 0 && paid === 0) state = 'no_fee';
	else if (due === 0 && paid === 0) state = 'exempt';
	else if (paid >= due) state = 'paid';
	else if (paid > 0) state = 'partial';
	else state = 'unpaid';
	return {
		base,
		discount,
		due,
		paid,
		pending,
		remaining,
		overpaid: Math.max(paid - due, 0),
		state,
	};
};

// ─── Truy vấn chung ──────────────────────────────────────────────────────────

const FEE_SELECT = `
  SELECT e.id AS enrollment_id, e.status AS enrollment_status, e.trainee_id, e.program_id,
         c.id AS course_id, c.name AS course_name, c.start_date, c.end_date,
         tp.code AS program_code, tp.name AS program_name, tp.tuition_fee,
         t.full_name AS trainee_name, t.user_id AS trainee_user_id, t.staff_user_id,
         CASE WHEN f.enrollment_id IS NULL THEN 0 ELSE 1 END AS has_fee_row,
         f.base_amount, f.discount_amount, f.discount_reason
  FROM course_enrollments e
  JOIN courses c ON c.id = e.course_id
  JOIN trainees t ON t.id = e.trainee_id
  LEFT JOIN training_programs tp ON tp.id = e.program_id
  LEFT JOIN enrollment_fees f ON f.enrollment_id = e.id
`;

const PAYMENT_SELECT = `
  SELECT p.id, p.enrollment_id, p.amount, p.method, p.status, p.paid_date, p.transfer_ref,
         p.note, p.review_note, p.reviewed_at, p.receipt_no, p.created_at, p.created_by,
         rv.full_name AS reviewer_name,
         -- Chứng từ: tên cột file_url để signUploadUrlsInJson ký link tải (utils/signedUpload.js)
         tf.file_name, tf.file_url, tf.mime_type AS proof_mime
  FROM tuition_payments p
  LEFT JOIN users rv ON rv.id = p.reviewed_by
  LEFT JOIN training_files tf ON tf.id = p.proof_file_id AND tf.is_deleted = 'false'
`;

const loadPayments = async (pool, enrollmentIds) => {
	if (!enrollmentIds.length) return [];
	return (
		await pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(enrollmentIds))
			.query(
				`${PAYMENT_SELECT} WHERE p.enrollment_id IN ${jsonValues('@ids')} ORDER BY p.created_at DESC`,
			)
	).recordset;
};

const withSummary = (rows, payments) =>
	rows.map((r) => {
		const own = payments.filter((p) => p.enrollment_id === r.enrollment_id);
		const { trainee_user_id: _u, staff_user_id: _s, has_fee_row: _h, ...rest } = r;
		return {
			...rest,
			...summarize(r, own),
			transfer_content: transferContent(r.enrollment_id),
			payments: own,
		};
	});

const feeRowOf = async (pool, enrollmentId) =>
	(
		await pool
			.request()
			.input('eid', sql.VarChar(20), enrollmentId)
			.query(`${FEE_SELECT} WHERE e.id = @eid`)
	).recordset[0] ?? null;

const summaryOf = async (pool, enrollmentId) => {
	const row = await feeRowOf(pool, enrollmentId);
	if (!row) throw notFound('Không tìm thấy lượt ghi danh.');
	const [item] = withSummary([row], await loadPayments(pool, [enrollmentId]));
	return { row, item };
};

// Chốt số phải nộp theo học phí chương trình lúc có thao tác đầu tiên (trong tx)
const ensureFeeRow = (tx, enrollmentId, actorId) =>
	tx.request().input('eid', sql.VarChar(20), enrollmentId).input('actor', sql.VarChar(20), actorId)
		.query(`
      INSERT INTO enrollment_fees (enrollment_id, base_amount, discount_amount, created_by)
      SELECT e.id, COALESCE(tp.tuition_fee, 0), 0, @actor
      FROM course_enrollments e LEFT JOIN training_programs tp ON tp.id = e.program_id
      WHERE e.id = @eid AND NOT EXISTS (SELECT 1 FROM enrollment_fees f WHERE f.enrollment_id = e.id)
      ON CONFLICT (enrollment_id) DO NOTHING`);

// Số phải nộp / đã nộp / đang chờ tính lại TRONG transaction, sau khi khóa enrollment_fees
// (tuitionGuards.lockFee) — kiểm ngoài transaction thì 2 thao tác song song cùng thấy "còn đủ".
const lockedSummary = async (tx, enrollmentId) => {
	const { fee, payments } = await lockFee(tx, enrollmentId);
	return summarize(fee, payments);
};
const overpayConflict = () =>
	conflict('Số tiền vượt số còn phải nộp (vừa có khoản khác được ghi nhận). Vui lòng tải lại.');

const parseAmount = (v) => {
	const n = Number(v);
	if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
		throw badRequest('Số tiền phải là số nguyên dương (đồng).');
	return n;
};
const parseDate = (v) => {
	const s = String(v ?? '').slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))
		throw badRequest('Ngày nộp không hợp lệ.');
	if (s > todayKeyVN()) throw badRequest('Ngày nộp không được sau hôm nay.');
	return s;
};
const clip = (v, n) => {
	const s = String(v ?? '').trim();
	return s ? s.slice(0, n) : null;
};

// Người nhận thông báo phía phòng Đào tạo: tuitionGuards.approvers (theo phạm vi khóa học)
const traineeUsers = (row) => [
	...new Set([row.trainee_user_id, row.staff_user_id].filter(Boolean)),
];

// ─── Học viên ────────────────────────────────────────────────────────────────

/** Khoản học phí của các khóa mình đã được duyệt + thông tin chuyển khoản. */
const listMine = async (userId) => {
	const pool = await getPool();
	const rows = (
		await pool.request().input('uid', sql.VarChar(20), userId).query(`${FEE_SELECT}
      WHERE e.status = 'approved' AND c.status <> 'cancelled' AND ${TRAINEE_OF_USER_SQL('t')}
      ORDER BY c.start_date DESC, e.registered_at DESC`)
	).recordset;
	const items = withSummary(
		rows,
		await loadPayments(
			pool,
			rows.map((r) => r.enrollment_id),
		),
	).filter((i) => i.state !== 'no_fee' || i.payments.length);
	return { bank: await getBankInfo(), items };
};

// Lượt ghi danh phải là của mình và đã được duyệt
const assertOwnEnrollment = async (pool, userId, enrollmentId) => {
	const row = (
		await pool
			.request()
			.input('uid', sql.VarChar(20), userId)
			.input('eid', sql.VarChar(20), enrollmentId)
			.query(`${FEE_SELECT} WHERE e.id = @eid AND ${TRAINEE_OF_USER_SQL('t')}`)
	).recordset[0];
	if (!row) throw notFound('Không tìm thấy khóa học của bạn.');
	if (row.enrollment_status !== 'approved') throw badRequest('Đăng ký khóa học chưa được duyệt.');
	return row;
};

/** Cho route kiểm trước khi nhận file: lượt ghi danh của mình, đã duyệt. */
const assertCanSubmit = async (userId, enrollmentId) => {
	await assertOwnEnrollment(await getPool(), userId, enrollmentId);
};

const removeUpload = async (file) => {
	if (file?.path) await fs.promises.unlink(file.path).catch(() => {});
};

/**
 * Học viên báo đã chuyển khoản: kèm chứng từ (ảnh / PDF) ⇒ khoản 'pending' chờ xác nhận.
 * @param {string} userId
 * @param {string} enrollmentId
 * @param {{ amount: any, paid_date: any, transfer_ref?: any, note?: any }} body
 * @param {any} file  multer file (bắt buộc)
 */
const submitMine = async (userId, enrollmentId, body, file) => {
	const pool = await getPool();
	/** @type {any} */
	let saved = null;
	try {
		if (!file) throw badRequest('Vui lòng đính kèm ảnh hoặc file PDF chứng từ chuyển khoản.');
		if (!isPdfOrImage(file)) throw badRequest('Chứng từ chỉ nhận file PDF, JPG hoặc PNG.');
		const row = await assertOwnEnrollment(pool, userId, enrollmentId);
		const [item] = withSummary([row], await loadPayments(pool, [enrollmentId]));
		if (item.due <= 0) throw badRequest('Khóa học này không phải nộp học phí.');
		const amount = parseAmount(body.amount);
		const open = item.remaining - item.pending;
		if (amount > open)
			throw badRequest(
				open > 0
					? `Số tiền vượt số còn phải nộp (${money(open)}, đã trừ khoản đang chờ xác nhận).`
					: 'Bạn đã nộp đủ hoặc đang có khoản chờ xác nhận đủ số còn lại.',
			);
		const paidDate = parseDate(body.paid_date);
		saved = await trainingFileService.saveUploadedFile(
			'tuition_payment',
			enrollmentId,
			file,
			userId,
		);
		const id = await withActorTransaction(userId, async (tx) => {
			await ensureFeeRow(tx, enrollmentId, userId);
			const locked = await lockedSummary(tx, enrollmentId);
			if (amount > locked.remaining - locked.pending) throw overpayConflict();
			const newId = await genTuitionPaymentId(tx);
			await tx
				.request()
				.input('id', sql.VarChar(20), newId)
				.input('eid', sql.VarChar(20), enrollmentId)
				.input('amount', sql.Decimal(18, 0), amount)
				.input('paid_date', sql.Date, paidDate)
				.input('ref', sql.NVarChar(100), clip(body.transfer_ref, 100))
				.input('note', sql.NVarChar(500), clip(body.note, 500))
				.input('file_id', sql.VarChar(20), saved.id)
				.input('actor', sql.VarChar(20), userId).query(`
          INSERT INTO tuition_payments (id, enrollment_id, amount, method, status, paid_date, transfer_ref, note, proof_file_id, created_by)
          VALUES (@id, @eid, @amount, 'transfer', 'pending', @paid_date, @ref, @note, @file_id, @actor)`);
			return newId;
		});
		changed();
		await notificationService.push(
			'tuition_submitted',
			`${row.trainee_name} báo đã chuyển khoản ${money(amount)} học phí khóa ${row.course_name}`,
			await approvers(row.course_id),
			{
				message: `Nội dung chuyển khoản: ${transferContent(enrollmentId)}`,
				refId: id,
				refType: 'tuition_payment',
			},
		);
		return listMine(userId);
	} catch (err) {
		// Đã ghi file vào training_files thì xóa cả dòng lẫn file; chưa thì chỉ xóa file multer vừa ghi
		if (saved) await trainingFileService.softDelete(saved.id, userId).catch(() => {});
		else await removeUpload(file);
		throw err;
	}
};

/** Rút lại khoản mình báo khi chưa được xác nhận (đang chờ hoặc bị từ chối). */
const cancelMine = async (userId, paymentId) => {
	const pool = await getPool();
	const p = (
		await pool
			.request()
			.input('id', sql.VarChar(20), paymentId)
			.input('uid', sql.VarChar(20), userId).query(`
        SELECT p.id, p.proof_file_id FROM tuition_payments p
        JOIN course_enrollments e ON e.id = p.enrollment_id
        JOIN trainees t ON t.id = e.trainee_id
        WHERE p.id = @id AND p.status <> 'confirmed' AND ${TRAINEE_OF_USER_SQL('t')}`)
	).recordset[0];
	if (!p) throw notFound('Không tìm thấy khoản nộp chưa xác nhận của bạn.');
	// Điều kiện trạng thái phải nằm ngay trong câu DELETE: phòng Đào tạo xác nhận (cấp biên
	// lai) xen giữa SELECT ở trên và câu này thì 0 dòng ⇒ 409, khoản đã xác nhận không bị xóa.
	const del = await withActorTransaction(userId, (tx) =>
		tx
			.request()
			.input('id', sql.VarChar(20), paymentId)
			.query("DELETE FROM tuition_payments WHERE id = @id AND status <> 'confirmed'"),
	);
	if (!del.rowsAffected?.[0])
		throw conflict('Khoản nộp này vừa được xác nhận, không rút lại được.');
	if (p.proof_file_id) await trainingFileService.softDelete(p.proof_file_id, userId);
	changed();
	return listMine(userId);
};

/** Dữ liệu phiếu thu của khoản đã xác nhận — userId: chỉ của chính học viên đó. */
const receiptData = async (paymentId, { userId = null, courseId = null } = {}) => {
	const pool = await getPool();
	const req = pool.request().input('id', sql.VarChar(20), paymentId);
	let scope = '';
	if (userId) {
		req.input('uid', sql.VarChar(20), userId);
		scope = ` AND ${TRAINEE_OF_USER_SQL('t')}`;
	}
	if (courseId) {
		req.input('course_id', sql.VarChar(20), courseId);
		scope += ' AND e.course_id = @course_id';
	}
	const r = (
		await req.query(`
      SELECT p.id, p.amount, p.method, p.paid_date, p.transfer_ref, p.receipt_no, p.reviewed_at,
             rv.full_name AS reviewer_name, e.id AS enrollment_id, t.full_name AS trainee_name,
             t.dob, t.id AS trainee_id, c.name AS course_name, tp.name AS program_name
      FROM tuition_payments p
      JOIN course_enrollments e ON e.id = p.enrollment_id
      JOIN trainees t ON t.id = e.trainee_id
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN training_programs tp ON tp.id = e.program_id
      LEFT JOIN users rv ON rv.id = p.reviewed_by
      WHERE p.id = @id AND p.status = 'confirmed'${scope}`)
	).recordset[0];
	if (!r) throw notFound('Không tìm thấy phiếu thu.');
	return r;
};

// ─── Phòng Đào tạo ───────────────────────────────────────────────────────────

/** Học phí từng học viên đã được duyệt của 1 khóa (programId: chỉ 1 chương trình). */
const listForCourse = async (courseId, programId = null) => {
	const pool = await getPool();
	const req = pool.request().input('course_id', sql.VarChar(20), courseId);
	if (programId) req.input('program_id', sql.VarChar(20), programId);
	const rows = (
		await req.query(`${FEE_SELECT}
      WHERE e.course_id = @course_id AND e.status = 'approved'${programId ? ' AND e.program_id = @program_id' : ''}
      ORDER BY t.full_name`)
	).recordset;
	return withSummary(
		rows,
		await loadPayments(
			pool,
			rows.map((r) => r.enrollment_id),
		),
	);
};

// Lượt ghi danh / khoản nộp phải thuộc khóa đang thao tác
const assertEnrollmentInCourse = async (pool, courseId, enrollmentId) => {
	const row = await feeRowOf(pool, enrollmentId);
	if (!row || row.course_id !== courseId) throw notFound('Không tìm thấy học viên trong khóa này.');
	return row;
};

/**
 * Chỉnh số phải nộp của 1 lượt ghi danh: học phí (mặc định theo chương trình — sửa
 * được, vd chương trình chưa khai học phí) và miễn / giảm kèm lý do.
 * @param {{ base_amount?: any, discount_amount?: any, discount_reason?: any }} body
 */
const setFee = async (courseId, enrollmentId, body, actorId) => {
	const pool = await getPool();
	await assertEnrollmentInCourse(pool, courseId, enrollmentId);
	const intOrNull = (v, label) => {
		if (v === undefined || v === null || v === '') return null;
		const n = Number(v);
		if (!Number.isInteger(n) || n < 0) throw badRequest(`${label} không hợp lệ.`);
		return n;
	};
	const baseIn = intOrNull(body.base_amount, 'Học phí');
	const discount = intOrNull(body.discount_amount, 'Số tiền miễn giảm') ?? 0;
	const reason = clip(body.discount_reason, 500);
	if (discount > 0 && !reason) throw badRequest('Nhập lý do miễn / giảm.');
	await withActorTransaction(actorId, async (tx) => {
		await ensureFeeRow(tx, enrollmentId, actorId);
		const current = num(
			(
				await tx
					.request()
					.input('eid', sql.VarChar(20), enrollmentId)
					.query('SELECT base_amount FROM enrollment_fees WHERE enrollment_id = @eid')
			).recordset[0]?.base_amount,
		);
		const base = baseIn ?? current;
		if (discount > base) throw badRequest(`Miễn giảm không vượt quá học phí (${money(base)}).`);
		await tx
			.request()
			.input('eid', sql.VarChar(20), enrollmentId)
			.input('base', sql.Decimal(18, 0), base)
			.input('discount', sql.Decimal(18, 0), discount)
			.input('reason', sql.NVarChar(500), discount > 0 ? reason : null)
			.input('actor', sql.VarChar(20), actorId).query(`
        UPDATE enrollment_fees SET base_amount = @base, discount_amount = @discount, discount_reason = @reason,
               updated_at = ${nowSql}, updated_by = @actor
        WHERE enrollment_id = @eid`);
	});
	changed();
	return (await summaryOf(pool, enrollmentId)).item;
};

// Đổi 1 khoản 'pending' sang 'confirmed' + cấp số biên lai (trong tx). Chỉ đổi khi
// còn 'pending' — 2 người bấm xác nhận cùng lúc thì người sau gặp 0 dòng ⇒ 409,
// transaction rollback nên số biên lai vừa lấy không bị dùng.
const confirmInTx = async (tx, paymentId, actorId) => {
	const receiptNo = await genTuitionReceiptNo(tx);
	const r = await tx
		.request()
		.input('id', sql.VarChar(20), paymentId)
		.input('receipt', sql.VarChar(20), receiptNo)
		.input('actor', sql.VarChar(20), actorId).query(`
      UPDATE tuition_payments SET status = 'confirmed', receipt_no = @receipt, review_note = NULL,
             reviewed_by = @actor, reviewed_at = ${nowSql}, updated_at = ${nowSql}, updated_by = @actor
      WHERE id = @id AND status = 'pending'`);
	if (!r.rowsAffected?.[0]) throw conflict('Khoản nộp này đã được xử lý.');
	return receiptNo;
};

const notifyTrainee = (row, type, title, message, refId) =>
	notificationService.push(type, title, traineeUsers(row), {
		message,
		refId,
		refType: 'tuition_payment',
	});

/**
 * Cán bộ ghi nhận khoản nộp (tại quầy / chuyển khoản đã đối chiếu) — xác nhận luôn, cấp biên lai.
 * @param {{ amount: any, method?: any, paid_date: any, transfer_ref?: any, note?: any }} body
 */
const recordPayment = async (courseId, enrollmentId, body, actorId) => {
	const pool = await getPool();
	const row = await assertEnrollmentInCourse(pool, courseId, enrollmentId);
	if (row.enrollment_status !== 'approved') throw badRequest('Học viên chưa được duyệt vào khóa.');
	const amount = parseAmount(body.amount);
	const [cur] = withSummary([row], await loadPayments(pool, [enrollmentId]));
	if (amount > cur.remaining)
		throw badRequest(
			cur.remaining > 0
				? `Số tiền vượt số còn phải nộp (${money(cur.remaining)}).`
				: 'Học viên đã nộp đủ (hoặc chưa có học phí — đặt học phí trước khi ghi nhận).',
		);
	const method = body.method === 'cash' ? 'cash' : 'transfer';
	const paidDate = parseDate(body.paid_date);
	const saved = await withActorTransaction(actorId, async (tx) => {
		await ensureFeeRow(tx, enrollmentId, actorId);
		if (amount > (await lockedSummary(tx, enrollmentId)).remaining) throw overpayConflict();
		const id = await genTuitionPaymentId(tx);
		await tx
			.request()
			.input('id', sql.VarChar(20), id)
			.input('eid', sql.VarChar(20), enrollmentId)
			.input('amount', sql.Decimal(18, 0), amount)
			.input('method', sql.VarChar(10), method)
			.input('paid_date', sql.Date, paidDate)
			.input('ref', sql.NVarChar(100), clip(body.transfer_ref, 100))
			.input('note', sql.NVarChar(500), clip(body.note, 500))
			.input('actor', sql.VarChar(20), actorId).query(`
        INSERT INTO tuition_payments (id, enrollment_id, amount, method, status, paid_date, transfer_ref, note, created_by)
        VALUES (@id, @eid, @amount, @method, 'pending', @paid_date, @ref, @note, @actor)`);
		return { id, receiptNo: await confirmInTx(tx, id, actorId) };
	});
	changed();
	await notifyTrainee(
		row,
		'tuition_confirmed',
		`Đã ghi nhận ${money(amount)} học phí khóa ${row.course_name}`,
		`Biên lai số ${saved.receiptNo}`,
		saved.id,
	);
	return (await summaryOf(pool, enrollmentId)).item;
};

const pendingInCourse = async (pool, courseId, paymentId) => {
	const p = (
		await pool
			.request()
			.input('id', sql.VarChar(20), paymentId)
			.query('SELECT id, enrollment_id, amount, status FROM tuition_payments WHERE id = @id')
	).recordset[0];
	if (!p) throw notFound('Không tìm thấy khoản nộp.');
	const row = await assertEnrollmentInCourse(pool, courseId, p.enrollment_id);
	if (p.status !== 'pending') throw conflict('Khoản nộp này đã được xử lý.');
	return { p, row };
};

/** Xác nhận khoản học viên báo đã chuyển khoản (đã đối chiếu sao kê). */
const confirmPayment = async (courseId, paymentId, actorId) => {
	const pool = await getPool();
	const { p, row } = await pendingInCourse(pool, courseId, paymentId);
	// Xác nhận nhiều khoản chờ (hoặc vừa có khoản ghi nhận tại quầy) không được vượt số phải nộp
	const receiptNo = await withActorTransaction(actorId, async (tx) => {
		await ensureFeeRow(tx, p.enrollment_id, actorId);
		if (Number(p.amount) > (await lockedSummary(tx, p.enrollment_id)).remaining)
			throw overpayConflict();
		return confirmInTx(tx, paymentId, actorId);
	});
	changed();
	await notifyTrainee(
		row,
		'tuition_confirmed',
		`Đã xác nhận ${money(p.amount)} học phí khóa ${row.course_name}`,
		`Biên lai số ${receiptNo}`,
		paymentId,
	);
	return (await summaryOf(pool, p.enrollment_id)).item;
};

/** Từ chối khoản học viên báo (không thấy tiền về, sai số tiền…) kèm lý do. */
const rejectPayment = async (courseId, paymentId, reviewNote, actorId) => {
	const note = clip(reviewNote, 500);
	if (!note) throw badRequest('Nhập lý do từ chối để học viên biết cần làm gì.');
	const pool = await getPool();
	const { p, row } = await pendingInCourse(pool, courseId, paymentId);
	const n = await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('id', sql.VarChar(20), paymentId)
			.input('note', sql.NVarChar(500), note)
			.input('actor', sql.VarChar(20), actorId).query(`
        UPDATE tuition_payments SET status = 'rejected', review_note = @note, reviewed_by = @actor,
               reviewed_at = ${nowSql}, updated_at = ${nowSql}, updated_by = @actor
        WHERE id = @id AND status = 'pending'`),
	);
	if (!n.rowsAffected?.[0]) throw conflict('Khoản nộp này đã được xử lý.');
	changed();
	await notifyTrainee(
		row,
		'tuition_rejected',
		`Khoản ${money(p.amount)} học phí khóa ${row.course_name} chưa được xác nhận`,
		`Lý do: ${note}`,
		paymentId,
	);
	return (await summaryOf(pool, p.enrollment_id)).item;
};

/**
 * Khoản chờ xác nhận ở mọi khóa — việc cần làm của phòng Đào tạo. Phạm vi courses:approve
 * 'assigned' chỉ thấy khóa mình được phân công (route theo khóa kiểm ở router.param;
 * danh sách gộp này không có :id nên phải tự lọc).
 */
const listPending = async (actor) => {
	const pool = await getPool();
	const assigned = courseScope(actor, 'approve') === 'assigned';
	const req = pool.request();
	if (assigned) req.input('actor_id', sql.VarChar(20), actor.id);
	return (
		await req.query(`
      SELECT p.id, p.amount, p.paid_date, p.created_at, e.id AS enrollment_id, c.id AS course_id,
             c.name AS course_name, t.full_name AS trainee_name
      FROM tuition_payments p
      JOIN course_enrollments e ON e.id = p.enrollment_id
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      WHERE p.status = 'pending'${assigned ? ` AND ${ASSIGNED_EXISTS_SQL}` : ''}
      ORDER BY p.created_at`)
	).recordset;
};

module.exports = {
	transferContent,
	summarize,
	listMine,
	assertCanSubmit,
	submitMine,
	cancelMine,
	receiptData,
	listForCourse,
	setFee,
	recordPayment,
	confirmPayment,
	rejectPayment,
	listPending,
};

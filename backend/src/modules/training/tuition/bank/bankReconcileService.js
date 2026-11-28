/**
 * bankReconcileService.js — tự đối soát học phí với giao dịch ngân hàng báo về
 * (migration 2027-01-21_doi_soat_ngan_hang_hoc_phi, bảng tuition_bank_transactions).
 *
 *   ingest   webhook đã xác thực → ghi từng giao dịch tiền vào (trùng mã giao dịch thì bỏ
 *            qua — ngân hàng gửi lại không bị tính 2 lần) → dò "HP <mã ghi danh>" → khớp
 *            đủ điều kiện thì ghi nhận + cấp phiếu thu (bankPayment.applyBankPayment),
 *            không thì để ở hàng chờ kèm lý do.
 *   assign   cán bộ gán giao dịch đang chờ cho 1 lượt ghi danh (cùng đường ghi nhận).
 *   ignore   cán bộ đánh dấu không phải tiền học phí / đã xử lý ngoài hệ thống.
 *   preview  thử đối soát 1 nội dung + số tiền mà KHÔNG ghi gì (trang cấu hình).
 *
 * Mỗi giao dịch ghi 2 bước: (1) chèn dòng 'unmatched'; (2) transaction riêng khóa dòng đó
 * rồi ghi nhận tiền + đổi sang 'matched'. Bước 2 lỗi (vd vừa có khoản khác làm vượt số
 * phải nộp) thì giao dịch vẫn nằm lại hàng chờ, không mất.
 */
const { getPool, sql, withActorTransaction, nowSql } = require('../../../../config/db');
const logger = require('../../../../config/logger');
const { badRequest, notFound, conflict } = require('../../../../utils/httpError');
const { VN_OFFSET_MS } = require('../../../../utils/vnDate');
const { broadcast } = require('../../../events/eventService');
const notificationService = require('../../../notifications/notificationService');
const { findActiveUserIdsWhere } = require('../../../access/permissionService');
const { hasPermission } = require('../../../../permissions/authz');
const { courseScope } = require('../../courses/coursePolicy');
const bankPayment = require('./bankPayment');
const { extractCodes, normalizeTxn, decide, REASONS } = require('./bankMatch');
const { getConfig } = require('./bankSettings');

const changed = () => broadcast('update', { entity: 'tuition_bank' });
const money = (n) => `${Number(n).toLocaleString('vi-VN')} đ`;

// Giờ VN dạng "YYYY-MM-DD HH:mm:ss.SSS" — cột timestamp lưu giờ VN (như LOCALTIMESTAMP)
const vnWall = (d) =>
	new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 23).replace('T', ' ');

const TXN_SELECT = `
  SELECT b.id, b.provider, b.external_id, b.account_no, b.amount, b.content, b.txn_time,
         b.status, b.reason, b.enrollment_id, b.payment_id, b.note, b.received_at, b.handled_at,
         hu.full_name AS handled_by_name, p.receipt_no,
         t.full_name AS trainee_name, c.id AS course_id, c.name AS course_name
  FROM tuition_bank_transactions b
  LEFT JOIN users hu ON hu.id = b.handled_by
  LEFT JOIN tuition_payments p ON p.id = b.payment_id
  LEFT JOIN course_enrollments e ON e.id = b.enrollment_id
  LEFT JOIN trainees t ON t.id = e.trainee_id
  LEFT JOIN courses c ON c.id = e.course_id
`;

const loadTxn = async (id) =>
	(
		await (
			await getPool()
		)
			.request()
			.input('id', sql.BigInt, id)
			.query(`${TXN_SELECT} WHERE b.id = @id`)
	).recordset[0] ?? null;

// Người xử lý hàng chờ: courses:approve phạm vi toàn viện (giao dịch chưa khớp chưa thuộc khóa nào)
const canSeeAll = (u) =>
	hasPermission(u, 'courses', 'approve') && courseScope(u, 'approve') !== 'assigned';

/** Đánh dấu chưa khớp (kèm lượt ghi danh gợi ý nếu dò được và còn tồn tại). */
const markUnmatched = async (id, reason, enrollmentId) =>
	(await getPool())
		.request()
		.input('id', sql.BigInt, id)
		.input('reason', sql.VarChar(20), reason)
		.input('eid', sql.VarChar(20), enrollmentId ?? null)
		.query(`UPDATE tuition_bank_transactions SET reason = @reason, enrollment_id = @eid
            WHERE id = @id AND status = 'unmatched'`);

/**
 * Ghi nhận tiền cho 1 giao dịch đang chờ (tự động hoặc cán bộ gán). Khóa dòng giao dịch
 * để 2 người gán cùng lúc không ghi tiền 2 lần.
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
const applyTo = async (txn, found, actorId) => {
	const paidDate = vnWall(txn.txn_time ? new Date(txn.txn_time) : new Date()).slice(0, 10);
	let saved;
	try {
		saved = await withActorTransaction(actorId, async (tx) => {
			const cur = (
				await tx
					.request()
					.input('id', sql.BigInt, txn.id)
					.query('SELECT status FROM tuition_bank_transactions WHERE id = @id FOR UPDATE')
			).recordset[0];
			if (cur?.status !== 'unmatched') throw conflict('Giao dịch này đã được xử lý.');
			const r = await bankPayment.applyBankPayment(tx, {
				enrollmentId: found.row.enrollment_id,
				amount: Number(txn.amount),
				paidDate,
				ref: txn.external_id,
				note: `Ngân hàng báo: ${txn.content || '(không có nội dung)'}`,
				actorId,
			});
			await tx
				.request()
				.input('id', sql.BigInt, txn.id)
				.input('eid', sql.VarChar(20), found.row.enrollment_id)
				.input('pid', sql.VarChar(20), r.paymentId)
				.input('actor', sql.VarChar(20), actorId).query(`
          UPDATE tuition_bank_transactions SET status = 'matched', reason = NULL, enrollment_id = @eid,
                 payment_id = @pid, handled_by = @actor, handled_at = ${nowSql}
          WHERE id = @id`);
			return r;
		});
	} catch (err) {
		if (err instanceof bankPayment.BankOverpay) return { ok: false, reason: 'overpay' };
		throw err;
	}
	changed();
	await bankPayment.afterBankPayment(
		found.row,
		Number(txn.amount),
		saved.receiptNo,
		saved.paymentId,
	);
	return { ok: true };
};

/** Dò + quyết định cho giao dịch vừa ghi (đường tự động). */
const autoProcess = async (txn, cfg) => {
	if (cfg.accountNo && txn.account_no && txn.account_no !== cfg.accountNo) {
		await (
			await getPool()
		)
			.request()
			.input('id', sql.BigInt, txn.id)
			.query(
				"UPDATE tuition_bank_transactions SET status = 'ignored', reason = 'wrong_account' WHERE id = @id",
			);
		return 'ignored';
	}
	const codes = extractCodes(txn.content);
	const found = codes.length === 1 ? await bankPayment.findSummary(codes[0]) : null;
	const d = decide({
		codes,
		row: found?.row ?? null,
		item: found?.item ?? null,
		amount: Number(txn.amount),
		autoConfirm: cfg.autoConfirm,
	});
	if (d.action === 'apply') {
		try {
			const r = await applyTo(txn, found, null);
			if (r.ok) return 'matched';
			await markUnmatched(txn.id, 'reason' in r ? r.reason : 'error', found.row.enrollment_id);
		} catch (err) {
			logger.error(`[tuition-bank] ghi nhận giao dịch ${txn.id} lỗi: ${err.message}`);
			await markUnmatched(txn.id, 'error', found.row.enrollment_id);
		}
	} else {
		await markUnmatched(txn.id, d.reason, found?.row?.enrollment_id);
	}
	return 'unmatched';
};

/**
 * Nhận các giao dịch bộ chuyển đổi đã xác thực + parse.
 * @param {string} provider
 * @param {import('./providers').BankTxn[]} raws
 */
const ingest = async (provider, raws) => {
	const cfg = await getConfig();
	const pool = await getPool();
	const result = {
		received: 0,
		duplicate: 0,
		skipped: 0,
		matched: 0,
		unmatched: 0,
		ignored: 0,
		invalid: 0,
	};
	for (const raw of raws) {
		const { txn, error } = normalizeTxn(raw);
		if (error) {
			result.invalid++;
			logger.warn(`[tuition-bank] ${provider}: bỏ giao dịch hỏng — ${error}`);
			continue;
		}
		if (txn.direction === 'debit') {
			result.skipped++;
			continue;
		}
		const ins = await pool
			.request()
			.input('provider', sql.VarChar(30), provider)
			.input('ext', sql.VarChar(100), txn.external_id)
			.input('acc', sql.VarChar(30), txn.account_no)
			.input('amount', sql.Decimal(18, 0), txn.amount)
			.input('content', sql.NVarChar(500), txn.content)
			.input('time', sql.VarChar(30), txn.time ? vnWall(txn.time) : null)
			.input('raw', sql.NVarChar(sql.MAX), JSON.stringify(raw.raw ?? raw).slice(0, 20000)).query(`
        INSERT INTO tuition_bank_transactions (provider, external_id, account_no, amount, content, txn_time, raw)
        VALUES (@provider, @ext, @acc, @amount, @content, CAST(@time AS timestamp), CAST(@raw AS jsonb))
        ON CONFLICT (provider, external_id) DO NOTHING
        RETURNING id`);
		const id = ins.recordset[0]?.id;
		if (!id) {
			result.duplicate++;
			continue;
		}
		result.received++;
		const outcome = await autoProcess({ id, ...txn, txn_time: txn.time }, cfg);
		result[outcome]++;
	}
	if (result.received) changed();
	if (result.unmatched) {
		const users = await findActiveUserIdsWhere(canSeeAll);
		await notificationService.push(
			'tuition_bank_unmatched',
			`${result.unmatched} giao dịch ngân hàng chưa tự khớp được học phí`,
			users,
			{ message: 'Xem ở Đào tạo → Đối soát ngân hàng', refType: 'tuition_bank' },
		);
	}
	return result;
};

// ─── Phòng Đào tạo ───────────────────────────────────────────────────────────

const STATUSES = ['unmatched', 'matched', 'ignored'];

/** @param {{ status?: string, q?: string, limit?: any, offset?: any }} f */
const list = async ({ status, q, limit, offset } = {}) => {
	const pool = await getPool();
	const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
	const off = Math.max(Number(offset) || 0, 0);
	const where = [];
	const req = pool.request().input('lim', sql.Int, lim).input('off', sql.Int, off);
	if (STATUSES.includes(String(status))) {
		where.push('b.status = @status');
		req.input('status', sql.VarChar(10), status);
	}
	const text = String(q ?? '')
		.trim()
		.slice(0, 100);
	if (text) {
		where.push(
			'(b.content ILIKE @q OR b.external_id ILIKE @q OR b.enrollment_id ILIKE @q OR t.full_name ILIKE @q)',
		);
		req.input('q', sql.NVarChar(120), `%${text.replace(/[\\%_]/g, '\\$&')}%`);
	}
	const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const rows = (
		await req.query(
			`${TXN_SELECT} ${w} ORDER BY b.received_at DESC, b.id DESC LIMIT @lim OFFSET @off`,
		)
	).recordset;
	const counts = (
		await pool
			.request()
			.query('SELECT status, COUNT(*) AS n FROM tuition_bank_transactions GROUP BY status')
	).recordset;
	return {
		items: rows,
		counts: Object.fromEntries(
			STATUSES.map((s) => [s, Number(counts.find((c) => c.status === s)?.n ?? 0)]),
		),
		limit: lim,
		offset: off,
	};
};

const pendingTxn = async (id) => {
	const txn = await loadTxn(id);
	if (!txn) throw notFound('Không tìm thấy giao dịch.');
	if (txn.status !== 'unmatched') throw conflict('Giao dịch này đã được xử lý.');
	return txn;
};

/** Cán bộ gán giao dịch đang chờ cho 1 lượt ghi danh ⇒ ghi nhận + cấp phiếu thu. */
const assign = async (id, enrollmentId, actorId) => {
	const txn = await pendingTxn(id);
	const code = String(enrollmentId ?? '')
		.trim()
		.toUpperCase();
	if (!/^DK\d{12}$/.test(code)) throw badRequest('Mã ghi danh không hợp lệ (dạng DK + 12 số).');
	const found = await bankPayment.findSummary(code);
	const d = decide({
		codes: [code],
		row: found?.row ?? null,
		item: found?.item ?? null,
		amount: Number(txn.amount),
		autoConfirm: true,
		manual: true,
	});
	if (d.action !== 'apply')
		throw badRequest(
			d.reason === 'overpay'
				? `Số tiền ${money(txn.amount)} vượt số còn phải nộp (${money(found.item.remaining)}). Sửa học phí / miễn giảm trước, hoặc bỏ qua giao dịch nếu phải hoàn tiền.`
				: `${REASONS[d.reason]}.`,
		);
	const r = await applyTo(txn, found, actorId);
	if (!r.ok)
		throw conflict(
			'Số tiền vượt số còn phải nộp (vừa có khoản khác được ghi nhận). Vui lòng tải lại.',
		);
	return loadTxn(id);
};

/** Đánh dấu không phải tiền học phí / đã xử lý ngoài hệ thống. */
const ignore = async (id, note, actorId) => {
	const text = String(note ?? '')
		.trim()
		.slice(0, 500);
	if (!text) throw badRequest('Ghi lý do bỏ qua (vd: không phải tiền học phí, đã hoàn tiền).');
	await pendingTxn(id);
	const r = await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('id', sql.BigInt, id)
			.input('note', sql.NVarChar(500), text)
			.input('actor', sql.VarChar(20), actorId).query(`
        UPDATE tuition_bank_transactions SET status = 'ignored', note = @note, handled_by = @actor,
               handled_at = ${nowSql}
        WHERE id = @id AND status = 'unmatched'`),
	);
	if (!r.rowsAffected?.[0]) throw conflict('Giao dịch này đã được xử lý.');
	changed();
	return loadTxn(id);
};

/** Thử đối soát (không ghi gì): nội dung + số tiền ⇒ sẽ khớp lượt ghi danh nào, làm gì. */
const preview = async ({ content, amount }) => {
	const n = Number(amount);
	if (!Number.isInteger(n) || n <= 0) throw badRequest('Số tiền phải là số nguyên dương (đồng).');
	const cfg = await getConfig();
	const codes = extractCodes(content);
	const found = codes.length === 1 ? await bankPayment.findSummary(codes[0]) : null;
	const d = decide({
		codes,
		row: found?.row ?? null,
		item: found?.item ?? null,
		amount: n,
		autoConfirm: cfg.autoConfirm,
	});
	return {
		codes,
		action: d.action,
		reason: d.action === 'unmatched' ? d.reason : null,
		reason_text: d.action === 'unmatched' ? REASONS[d.reason] : null,
		enrollment: found
			? {
					enrollment_id: found.row.enrollment_id,
					trainee_name: found.row.trainee_name,
					course_name: found.row.course_name,
					due: found.item.due,
					paid: found.item.paid,
					pending: found.item.pending,
					remaining: found.item.remaining,
				}
			: null,
	};
};

/** Tình trạng kết nối cho trang cấu hình. */
const status = async () => {
	const cfg = await getConfig();
	const r = (
		await (await getPool()).request().query(`
      SELECT MAX(received_at) AS last_received_at,
             COUNT(*) FILTER (WHERE status = 'unmatched') AS unmatched
      FROM tuition_bank_transactions`)
	).recordset[0];
	return {
		provider: cfg.provider || null,
		has_secret: !!cfg.secret,
		auto_confirm: cfg.autoConfirm,
		ip_limited: cfg.ipRanges.length > 0,
		last_received_at: r?.last_received_at ?? null,
		unmatched: Number(r?.unmatched ?? 0),
	};
};

module.exports = { ingest, list, assign, ignore, preview, status, canSeeAll };

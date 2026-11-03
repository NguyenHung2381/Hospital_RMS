// Các ca kiểm tra phần đã chuyển từ thủ tục / trigger về JS (sp_push_notification,
// sp_approve_topic, trg_topic_auto_approval, sp_upload_files,
// sp_deactivate_expired_accounts) trên DB THẬT — dùng chung cho SQL Server
// (test-integration/procToJs.test.js) và PostgreSQL (test-integration-pg/procToJs.test.js).
// Mọi thứ chạy trong 1 transaction rồi ROLLBACK: service được trỏ getPool /
// withTransaction vào transaction đó TRƯỚC khi nạp (chúng destructure lúc nạp module).
const assert = require('node:assert/strict');

/**
 * @param {import('node:test').TestContext} t
 * @param {any} db module src/config/db (đã chọn đúng DB_CLIENT)
 */
const run = async (t, db) => {
	const { sql } = db;
	const pool = await db.getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	const real = { getPool: db.getPool, withTransaction: db.withTransaction };
	db.getPool = async () => ({ request: () => new sql.Request(tx) });
	db.withTransaction = async (fn) => fn(tx);
	t.after(async () => {
		Object.assign(db, real);
		await tx.rollback();
	});

	require('../src/modules/events/eventService').broadcast = () => {};
	const notifSvc = require('../src/modules/notifications/notificationService');
	const topicService = require('../src/modules/topics/topicService');
	const topicApprovalService = require('../src/modules/topics/topicApprovalService');
	const fileService = require('../src/modules/topics/fileService');
	const { deactivateExpired } = require('../src/jobs/accountMaintenanceJob');

	const q = async (text, inputs = {}) => {
		const req = new sql.Request(tx);
		for (const [k, v] of Object.entries(inputs)) req.input(k, v);
		return (await req.query(text)).recordset;
	};

	const users = await q('SELECT id FROM users WHERE is_active = @on ORDER BY id', { on: true });
	const [src] = await q(
		'SELECT t.round_id, t.category_id, t.department_id FROM topics t JOIN categories c ON c.id = t.category_id WHERE c.abbr IS NOT NULL ORDER BY t.id',
	);
	if (users.length < 2 || !src) return t.skip('DB chưa có đủ người dùng / đề tài mẫu');
	const [a, b] = users.map((u) => u.id);

	await t.test('thông báo: chỉ người đang hoạt động, mã NTF + batch chung, bỏ trùng', async () => {
		const [inactive] = await q('SELECT id FROM users WHERE is_active = @on ORDER BY id', {
			on: false,
		});
		const ids = [a, b, a, ...(inactive ? [inactive.id] : []), 'KHONG_CO_AI'];
		await notifSvc.push('rms_test_push', 'Thử thông báo — có dấu', ids, {
			message: 'Nội dung',
			refId: 'X1',
			refType: 'topic',
		});
		const rows = await q(
			"SELECT id, user_id, title, batch_id FROM notifications WHERE type = 'rms_test_push' ORDER BY user_id",
		);
		assert.deepEqual(
			rows.map((r) => r.user_id),
			[a, b].sort(),
		);
		for (const r of rows) assert.match(r.id, /^NTF\d{19}$/);
		assert.match(rows[0].batch_id, /^NTFB\d{19}$/);
		assert.equal(rows[0].batch_id, rows[1].batch_id);
		assert.notEqual(rows[0].id, rows[1].id);
		assert.equal(rows[0].title, 'Thử thông báo — có dấu');
	});

	let topicId;
	await t.test('tạo đề tài: có đúng 1 phiếu duyệt pending mã PD + mã đề tài', async () => {
		const topic = await topicService.create(
			{
				title: 'Đề tài thử chuyển thủ tục về JS',
				round_id: src.round_id,
				category_id: src.category_id,
				department_id: src.department_id,
				// Bài báo không tra cấp độ đợt: roundService.getAllowedLevelIds còn ghép 2
				// SELECT trong 1 lệnh (mục recordsets, chưa chạy được trên PG)
				article_type: 'bai_bao',
			},
			a,
		);
		topicId = topic.id;
		const apv = await q('SELECT id, status, created_by FROM approvals WHERE topic_id = @id', {
			id: topicId,
		});
		assert.deepEqual(apv, [{ id: `PD${topicId}`, status: 'pending', created_by: a }]);
	});

	await t.test('đổi trạng thái sang submitted khi chưa có phiếu ⇒ tạo phiếu', async () => {
		await q('DELETE FROM approvals WHERE topic_id = @id', { id: topicId });
		await q("UPDATE topics SET status = 'supplement' WHERE id = @id", { id: topicId });
		await topicService.update(topicId, { status: 'submitted' }, b, true);
		const apv = await q('SELECT status FROM approvals WHERE topic_id = @id', { id: topicId });
		assert.deepEqual(apv, [{ status: 'pending' }]);
	});

	await t.test(
		'duyệt: phiếu + đề tài + tiến độ, thông báo 1 lần, không cấp tài khoản',
		async () => {
			const sent = [];
			const realPush = notifSvc.pushWithEmail;
			notifSvc.pushWithEmail = async (type, title, ids) => sent.push({ type, ids });
			try {
				const users0 = (await q('SELECT COUNT(*) AS n FROM users'))[0].n;
				const r = await topicApprovalService.approve(topicId, 'supplement', 'Bổ sung mục 3', b);
				assert.deepEqual(r, { message: 'Thành công', topic_id: topicId, decision: 'supplement' });
				const [apv] = await q('SELECT status, comment FROM approvals WHERE topic_id = @id', {
					id: topicId,
				});
				assert.deepEqual(apv, { status: 'supplement', comment: 'Bổ sung mục 3' });
				const [tp] = await q('SELECT status FROM topics WHERE id = @id', { id: topicId });
				assert.equal(tp.status, 'supplement');
				const prog = await q('SELECT id, status, note FROM topic_progress WHERE topic_id = @id', {
					id: topicId,
				});
				assert.deepEqual(prog, [
					{ id: `TT${topicId}_01`, status: 'Đề tài cần bổ sung, chỉnh sửa', note: 'Bổ sung mục 3' },
				]);
				assert.deepEqual(
					sent.map((s) => s.type),
					['topic_supplement_requested'],
				);
				assert.equal((await q('SELECT COUNT(*) AS n FROM users'))[0].n, users0);
			} finally {
				notifSvc.pushWithEmail = realPush;
			}
			await assert.rejects(
				topicApprovalService.approve(topicId, 'xoa', null, b),
				(e) => e.statusCode === 400,
			);
			await q('DELETE FROM approvals WHERE topic_id = @id', { id: topicId });
			await assert.rejects(
				topicApprovalService.approve(topicId, 'approved', null, b),
				(e) => e.statusCode === 404,
			);
		},
	);

	await t.test('tải file: 1 lượt + các file, đếm file_count, mã BATCH/FILE theo ngày', async () => {
		const files = [
			{
				file_name: 'Thuyết minh.pdf',
				file_url: '/uploads/a.pdf',
				file_size: 10,
				mime_type: 'application/pdf',
			},
			{ file_name: 'Dự toán.xlsx', file_url: '/uploads/b.xlsx', file_size: 20, mime_type: null },
		];
		const r = await fileService.uploadFiles(topicId, files, 'Ghi chú lượt', a);
		assert.match(r.batch_id, new RegExp(`^BATCH${topicId}\\d{8}01$`));
		assert.equal(r.files_uploaded, 2);
		const rows = await q('SELECT id, file_name FROM files WHERE batch_id = @b ORDER BY id', {
			b: r.batch_id,
		});
		assert.deepEqual(
			rows.map((x) => x.file_name),
			['Thuyết minh.pdf', 'Dự toán.xlsx'],
		);
		assert.match(rows[0].id, new RegExp(`^FILE${topicId}\\d{8}01$`));
		assert.match(rows[1].id, new RegExp(`^FILE${topicId}\\d{8}02$`));
		const [batch] = await q('SELECT file_count, note FROM file_batches WHERE id = @b', {
			b: r.batch_id,
		});
		assert.equal(Number(batch.file_count), 2);
		assert.equal(batch.note, 'Ghi chú lượt');
		await assert.rejects(
			fileService.uploadFiles('KHONG_CO', files, null, a),
			(e) => e.statusCode === 404,
		);
	});

	await t.test('khoá tài khoản thành viên quá hạn (hôm qua), giữ người còn hạn', async (s) => {
		const members = await q("SELECT id FROM users WHERE role_id = 'VT06' ORDER BY id");
		if (members.length < 2) return s.skip('cần 2 tài khoản thành viên VT06');
		const [m1, m2] = members.map((m) => m.id);
		const day = (offset) => {
			const d = new Date(Date.now() + 7 * 3600 * 1000);
			return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
		};
		const setExp = (id, d) =>
			new sql.Request(tx)
				.input('id', sql.VarChar(20), id)
				.input('d', sql.Date, d)
				.input('on', sql.Bit, true)
				.query('UPDATE users SET is_active = @on, account_expires_at = @d WHERE id = @id');
		// Mọi VT06 khác coi như còn hạn để đếm đúng
		await q("UPDATE users SET account_expires_at = NULL WHERE role_id = 'VT06'");
		await setExp(m1, day(-1));
		await setExp(m2, day(0)); // hết hạn hôm nay = vẫn dùng được tới hết ngày
		assert.equal(await deactivateExpired(tx), 1);
		const rows = await q('SELECT id, is_active FROM users WHERE id IN (@m1, @m2) ORDER BY id', {
			m1,
			m2,
		});
		const active = Object.fromEntries(rows.map((r) => [r.id, !!r.is_active]));
		assert.deepEqual(active, { [m1]: false, [m2]: true });
	});
};

module.exports = { run };

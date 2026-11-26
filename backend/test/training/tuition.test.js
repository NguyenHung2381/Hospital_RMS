// Học phí (training/tuition): tính số phải nộp / trạng thái, nội dung chuyển khoản,
// số tiền bằng chữ trên phiếu thu, và các chặn khi học viên báo đã chuyển khoản.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

let handler = () => [];
const log = install(async (text, inputs) => handler(text, inputs));
db.queryAll = async (req, statements) => {
	const out = [];
	for (const s of statements) out.push((await req.query(s)).recordset);
	return out;
};
const tuitionService = require('../../src/modules/training/tuition/tuitionService');
const { summarize, transferContent, submitMine } = tuitionService;
const { vndInWords } = require('../../src/modules/training/tuition/tuitionReceiptPdf');

const P = (amount, status) => ({ amount, status });

test('summarize: chưa chốt ⇒ theo học phí chương trình; chốt rồi ⇒ theo enrollment_fees', () => {
	assert.equal(summarize({ has_fee_row: 0, tuition_fee: '3000000' }, []).due, 3000000);
	const s = summarize(
		{ has_fee_row: 1, base_amount: '3000000', discount_amount: '500000', tuition_fee: 9 },
		[],
	);
	assert.equal(s.due, 2500000);
	assert.equal(s.discount, 500000);
});

test('summarize: trạng thái theo số đã xác nhận, khoản chờ không tính là đã nộp', () => {
	const row = { has_fee_row: 1, base_amount: 2000000, discount_amount: 0 };
	assert.equal(summarize(row, []).state, 'unpaid');
	const partial = summarize(row, [P(500000, 'confirmed'), P(1500000, 'pending'), P(9, 'rejected')]);
	assert.deepEqual(
		[partial.state, partial.paid, partial.pending, partial.remaining],
		['partial', 500000, 1500000, 1500000],
	);
	assert.equal(summarize(row, [P(2000000, 'confirmed')]).state, 'paid');
	assert.equal(summarize({ has_fee_row: 0, tuition_fee: null }, []).state, 'no_fee');
	assert.equal(
		summarize({ has_fee_row: 1, base_amount: 1000, discount_amount: 1000 }, []).state,
		'exempt',
	);
	// Chương trình không thu nhưng có khoản đã nộp ⇒ đã nộp (thừa), không phải "miễn"
	const extra = summarize({ has_fee_row: 0, tuition_fee: 0 }, [P(100000, 'confirmed')]);
	assert.deepEqual([extra.state, extra.overpaid], ['paid', 100000]);
});

test('transferContent: ASCII, có mã ghi danh để đối chiếu sao kê', () => {
	assert.equal(transferContent('DK202611050001'), 'HP DK202611050001');
});

test('vndInWords: cách đọc số tiền tiếng Việt', () => {
	assert.equal(vndInWords(1500000), 'Một triệu năm trăm nghìn đồng');
	assert.equal(vndInWords(2015000), 'Hai triệu không trăm mười lăm nghìn đồng');
	assert.equal(vndInWords(1000001), 'Một triệu không trăm linh một đồng');
	assert.equal(vndInWords(25450000), 'Hai mươi lăm triệu bốn trăm năm mươi nghìn đồng');
	assert.equal(vndInWords(121), 'Một trăm hai mươi mốt đồng');
	assert.equal(vndInWords(1000000000), 'Một tỷ đồng');
});

const ENROLL = {
	enrollment_id: 'DK202611050001',
	enrollment_status: 'approved',
	course_id: 'KH1',
	course_name: 'Khóa A',
	trainee_name: 'Nguyễn Văn A',
	has_fee_row: 0,
	tuition_fee: 2000000,
};
const file = { originalname: 'chung-tu.png', path: '/nonexistent/x.png' };

test('submitMine: không đính kèm chứng từ ⇒ 400, không ghi gì', async () => {
	handler = () => [];
	const from = log.length;
	await assert.rejects(submitMine('U1', 'DK202611050001', { amount: 1000 }, null), {
		statusCode: 400,
	});
	assert.equal(
		log.slice(from).some((q) => /INSERT INTO tuition_payments/.test(q.text)),
		false,
	);
});

test('submitMine: file không phải ảnh / PDF ⇒ 400', async () => {
	await assert.rejects(
		submitMine(
			'U1',
			'DK202611050001',
			{ amount: 1000 },
			{ originalname: 'x.exe', path: '/nonexistent/x.exe' },
		),
		{ statusCode: 400 },
	);
});

test('submitMine: lượt ghi danh không phải của mình ⇒ 404', async () => {
	handler = () => [];
	await assert.rejects(
		submitMine('U1', 'DK202611050001', { amount: 1000, paid_date: '2026-11-20' }, file),
		{
			statusCode: 404,
		},
	);
});

test('submitMine: số tiền vượt số còn lại (đã trừ khoản đang chờ) ⇒ 400', async () => {
	handler = (text) => {
		if (/FROM course_enrollments e/.test(text) && /WHERE e\.id = @eid/.test(text)) return [ENROLL];
		if (/FROM tuition_payments p/.test(text))
			return [{ enrollment_id: ENROLL.enrollment_id, amount: 1500000, status: 'pending' }];
		return [];
	};
	const from = log.length;
	await assert.rejects(
		submitMine('U1', ENROLL.enrollment_id, { amount: 600000, paid_date: '2026-11-20' }, file),
		/vượt số còn phải nộp \(500\.000 đ/,
	);
	assert.equal(
		log.slice(from).some((q) => /INSERT INTO tuition_payments/.test(q.text)),
		false,
	);
});

test('submitMine: ngày nộp sau hôm nay ⇒ 400', async () => {
	handler = (text) => (/FROM course_enrollments e/.test(text) ? [ENROLL] : []);
	await assert.rejects(
		submitMine('U1', ENROLL.enrollment_id, { amount: 1000, paid_date: '2999-01-01' }, file),
		{
			statusCode: 400,
		},
	);
});

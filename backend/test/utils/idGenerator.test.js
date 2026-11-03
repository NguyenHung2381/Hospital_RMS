// Sinh mã bằng JS (thay sp_gen_*): định dạng, MAX+1, khoá, bộ đếm theo năm.
// Dùng transaction giả: ghi lại câu SQL + tham số, trả kết quả theo handler.
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../src/config/db');
const gen = require('../../src/utils/idGenerator');

let locks = [];
let lockOk = true;
db.lockResource = async (tx, key, timeoutMs) => {
	locks.push([key, timeoutMs]);
	return lockOk;
};

// handler(text, params) → recordset (mảng) cho từng câu
const fakeTx = (handler) => {
	const calls = [];
	return {
		calls,
		request() {
			const params = {};
			const req = {
				input(name, type, value) {
					params[name] = arguments.length === 2 ? type : value;
					return req;
				},
				async query(text) {
					calls.push({ text, params });
					return { recordset: (await handler(text, params)) || [], rowsAffected: [1] };
				},
			};
			return req;
		},
	};
};

test.beforeEach(() => {
	locks = [];
	lockOk = true;
});

test('mã theo ngày: tiền tố + yyyymmdd giờ VN + 4 số, khoá theo tiền tố', async () => {
	const today = gen.todayCompactVN();
	assert.match(today, /^\d{8}$/);
	const tx = fakeTx(() => [{ v: null }]);
	assert.equal(await gen.genCourseId(tx), `KH${today}0001`);
	assert.deepEqual(locks, [[`gen_course_id_KH${today}`, 5000]]);
	assert.match(tx.calls[0].text, /SELECT MAX\(id\) AS v FROM courses WHERE id LIKE @pattern/);
	assert.equal(tx.calls[0].params.pattern, `KH${today}____`);

	const tx2 = fakeTx(() => [{ v: `DD${today}0041` }]);
	assert.equal(await gen.genAttendanceId(tx2), `DD${today}0042`);
});

test('dòng lớn nhất sai mẫu ⇒ quét cả dải, chỉ tính mã đúng mẫu', async () => {
	const tx = fakeTx((text) =>
		text.includes('MAX(')
			? [{ v: 'TVDT_01_X9' }]
			: [{ v: 'TVDT_01_03' }, { v: 'TVDT_01_X9' }, { v: 'TVDTA01_07' }],
	);
	// 'TVDTA01_07' khớp LIKE (vì '_' là ký tự đại diện) nhưng sai tiền tố ⇒ bỏ
	assert.equal(await gen.genMemberId(tx, 'DT_01'), 'TVDT_01_04');
	assert.equal(tx.calls[0].params.pattern, 'TVDT_01___');
});

test('mã nhân viên: bỏ qua đuôi 0000; tài khoản khoa = 0000, trùng thì 409', async () => {
	const tx = fakeTx((text) =>
		text.includes('MAX(') ? [{ v: 'NVKHTH0000' }] : [{ v: 'NVKHTH0000' }],
	);
	assert.equal(await gen.genUserId(tx, 'KHTH'), 'NVKHTH0001');
	assert.equal(locks[0][0], 'gen_user_id_NVKHTH');

	const tx2 = fakeTx(() => [{ v: 'NVKHTH0012' }]);
	assert.equal(await gen.genUserId(tx2, 'KHTH'), 'NVKHTH0013');

	assert.equal(
		await gen.genUserId(
			fakeTx(() => []),
			'KHTH',
			{ isDeptAccount: true },
		),
		'NVKHTH0000',
	);
	await assert.rejects(
		gen.genUserId(
			fakeTx(() => [{ x: 1 }]),
			'KHTH',
			{ isDeptAccount: true },
		),
		(err) => err.statusCode === 409,
	);
});

test('mã khoa DVxxx: so theo số (DV1000 > DV999), không cắt khi quá 999', async () => {
	const tx = fakeTx(() => [{ v: 'DV071' }, { v: 'DV999' }, { v: 'DV1000' }, { v: 'DVX' }]);
	assert.equal(await gen.genDeptId(tx), 'DV1001');
	assert.equal(tx.calls[0].params.pattern, 'DV%');
	assert.equal(await gen.genDeptId(fakeTx(() => [])), 'DV001');
});

test('mã đề tài: ký hiệu loại + năm của đợt; thiếu thì 400', async () => {
	const tx = fakeTx((text) =>
		text.includes('abbr') ? [{ abbr: 'NC', year: 2026 }] : [{ v: 'NC_2026_009' }],
	);
	assert.equal(await gen.genTopicId(tx, 'LDT01', 'DOT20261'), 'NC_2026_010');
	assert.equal(locks[0][0], 'gen_topic_id_NC_2026_');
	await assert.rejects(
		gen.genTopicId(
			fakeTx(() => [{ abbr: null, year: 2026 }]),
			'LDT01',
			'DOT20261',
		),
		(err) => err.statusCode === 400,
	);
	await assert.rejects(
		gen.genTopicId(
			fakeTx(() => [{ abbr: 'NC', year: null }]),
			'LDT01',
			'X',
		),
		(err) => err.statusCode === 400 && /Đợt nghiên cứu/.test(err.message),
	);
});

test('mã đợt DOT<năm><số>: đã có thì 409', async () => {
	assert.equal(
		await gen.genRoundId(
			fakeTx(() => []),
			2026,
			2,
		),
		'DOT20262',
	);
	await assert.rejects(
		gen.genRoundId(
			fakeTx(() => [{ x: 1 }]),
			2026,
			2,
		),
		(err) => err.statusCode === 409,
	);
});

test('số chứng chỉ CC<năm>: cột cert_no; năm sai thì 400', async () => {
	const tx = fakeTx(() => [{ v: 'CC20260007' }]);
	assert.equal(await gen.genCertificateNo(tx, 2026), 'CC20260008');
	assert.match(tx.calls[0].text, /MAX\(cert_no\) AS v FROM certificates WHERE cert_no LIKE/);
	assert.throws(
		() => gen.genCertificateNo(tx, 1990),
		(err) => err.statusCode === 400,
	);
});

test('hết số (quá 99 thành viên) ⇒ 409, không cắt mã', async () => {
	await assert.rejects(
		gen.genCouncilMemberId(
			fakeTx(() => [{ v: 'HDMHD1_01_99' }]),
			'HD1_01',
		),
		(err) => err.statusCode === 409,
	);
});

test('không lấy được khoá ⇒ 503 ID_LOCK_TIMEOUT, không đọc bảng', async () => {
	lockOk = false;
	const tx = fakeTx(() => [{ v: null }]);
	await assert.rejects(gen.genGradeId(tx), (err) => {
		assert.equal(err.statusCode, 503);
		assert.equal(gen.isIdLockTimeout(err), true);
		return true;
	});
	assert.equal(tx.calls.length, 0);
});

test('bộ đếm theo năm: có dòng thì tăng; chưa có thì thêm = 1', async () => {
	const tx = fakeTx((text) => (text.startsWith('SELECT last_seq') ? [{ last_seq: 42 }] : []));
	assert.equal(await gen.genCmeNo(tx, 2026, 'NV1'), 42);
	assert.deepEqual(locks, [['gen_cme_no_2026', 15000]]);
	assert.match(tx.calls[0].text, /^UPDATE cme_year_register SET last_seq = last_seq \+ 1/);
	assert.equal(tx.calls.length, 2);

	const empty = fakeTx(() => []);
	assert.equal(await gen.genTraineeId(empty, 2027, 'NV1'), 'HV20270001');
	assert.match(empty.calls[2].text, /^INSERT INTO trainee_year_register/);
	assert.deepEqual(empty.calls[2].params, { year: 2027, actor_id: 'NV1' });

	await assert.rejects(
		gen.genTraineeId(
			fakeTx((t) => (t.startsWith('SELECT') ? [{ last_seq: 10000 }] : [])),
			2026,
		),
		(err) => err.statusCode === 409,
	);
});

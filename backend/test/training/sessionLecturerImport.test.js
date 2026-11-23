const test = require('node:test');
const assert = require('node:assert/strict');
const {
	parseWorkbook,
	buildPreview,
	parseTimeText,
	parseKind,
} = require('../../src/modules/training/courses/sessionLecturerImportService');
const { runsOf, kindsOf } = require('../../src/modules/training/courses/teachingPlanService');
const {
	buildTeachingPlanTemplate,
} = require('../../src/modules/training/courses/exports/teachingPlanTemplate');

test('parseTimeText: khoảng ngày, 1 ngày, kèm giờ, chữ mẫu, sai', () => {
	assert.deepEqual(parseTimeText('Từ ngày 27/11/2026 đến ngày 05/12/2026'), {
		from: '2026-11-27',
		to: '2026-12-05',
		start: null,
	});
	assert.deepEqual(parseTimeText('Ngày 25/11/2026 (07:30)'), {
		from: '2026-11-25',
		to: '2026-11-25',
		start: '07:30',
	});
	assert.deepEqual(parseTimeText('Từ ngày….. đến ngày…….'), {});
	assert.deepEqual(parseTimeText(''), {});
	assert.ok(parseTimeText('Từ ngày 05/12/2026 đến ngày 27/11/2026').error);
	assert.ok(parseTimeText('31/02/2026').error);
	assert.ok(parseTimeText('tuần 3').error);
});

test('parseKind: LT / TH', () => {
	assert.equal(parseKind('LT'), 'theory');
	assert.equal(parseKind('Thực hành'), 'practice');
	assert.equal(parseKind(''), '');
	assert.equal(parseKind('Seminar'), null);
});

const S = (id, lesson, date, start, kind, lecturer_id, lecturer_name, assistants = []) => ({
	id,
	subject_id: lesson,
	session_date: new Date(`${date}T00:00:00Z`),
	start_time: start,
	end_time: null,
	session_kind: kind,
	lecturer_id,
	lecturer_name,
	assistants,
});

const LOOKUPS = () => ({
	course: { id: 'KH1', name: 'Khóa 1' },
	lessons: [
		{ id: 'B1', code: 'DTLT_23_01', title: 'Bài một', theory_hours: 4, practice_hours: 16 },
		{ id: 'B2', code: 'DTLT_23_02', title: 'Bài hai', theory_hours: 8, practice_hours: 0 },
	],
	candidates: [
		{ id: 'GV1', full_name: 'Phạm Hồng Thái', group: 'department' },
		{ id: 'GV2', full_name: 'GS.TS. Trần Thị B', group: 'other' },
	],
	lecturers: [
		{ id: 'GV1', full_name: 'Phạm Hồng Thái', is_active: true, user_id: 'U1', staff_number: 1001 },
		{
			id: 'GV2',
			full_name: 'GS.TS. Trần Thị B',
			is_active: true,
			user_id: null,
			staff_number: null,
		},
		{ id: 'GV3', full_name: 'Lê Văn C', is_active: true, user_id: 'U3', staff_number: 1003 },
	],
	staff: [
		{ id: 'U1', full_name: 'Phạm Hồng Thái', staff_number: 1001, is_active: true, has_license: 1 },
		{ id: 'U3', full_name: 'Lê Văn C', staff_number: 1003, is_active: true, has_license: 1 },
		// Có CCHN, chưa là giảng viên ⇒ ghi thì tự tạo hồ sơ GV
		{ id: 'U9', full_name: 'Đỗ Thị D', staff_number: 1009, is_active: true, has_license: 1 },
	],
	sessions: [
		S('BH1', 'B1', '2026-11-20', '05:00', 'theory', 'GV1', 'Phạm Hồng Thái'),
		S('BH2', 'B1', '2026-11-20', '05:40', 'practice', 'GV1', 'Phạm Hồng Thái'),
		S('BH3', 'B1', '2026-11-21', '07:30', 'practice', 'GV1', 'Phạm Hồng Thái'),
		S('BH4', 'B1', '2026-11-22', '07:30', 'practice', null, null),
		S('BH5', 'B2', '2026-11-23', '07:30', null, null, null), // chưa ghi loại ⇒ LT
	],
});

const row = (r, x) => ({
	r,
	code: 'DTLT_23_01',
	title: 'Bài một',
	kind_text: '',
	kind: 'theory',
	main_code: '',
	main: '',
	asst_code: '',
	asst: '',
	time_text: '',
	time: {},
	...x,
});
const day = (d, start = null) => ({ from: d, to: d, start });

test('1 bài nhiều ngày + GV chính & trợ giảng: áp cho các buổi TH trong khoảng ngày', () => {
	const { items, warnings } = buildPreview(
		[
			row(4, { kind: 'theory', main_code: '1001', main: 'Phạm Hồng Thái' }),
			row(5, {
				kind: 'practice',
				main_code: '1003',
				main: 'Lê Văn C',
				asst_code: '1001; -',
				asst: 'Phạm Hồng Thái; ThS. Trần Thị B',
				time: { from: '2026-11-20', to: '2026-11-21', start: null },
			}),
			row(6, { kind: 'practice', main_code: '1009', main: 'Đỗ Thị D', time: day('2026-11-22') }),
			row(7, { code: 'DTLT_23_02', title: 'Bài hai', kind: 'theory', main: 'Trần Thị B' }),
		],
		LOOKUPS(),
	);
	assert.deepEqual(warnings, []);
	assert.deepEqual(
		items.map((i) => [i.row, i.status, i.sessions, i.changed]),
		[
			[4, 'unchanged', 1, 0],
			[5, 'update', 2, 2],
			[6, 'update', 1, 1],
			[7, 'update', 1, 1],
		],
	);
	assert.deepEqual(items[1].changes[0], {
		session_id: 'BH2',
		lecturer_id: 'GV3',
		assistant_ids: ['GV1', 'GV2'],
	});
	assert.deepEqual(items[1].assistants, [
		{ name: 'Phạm Hồng Thái', staff_number: 1001, is_new: false },
		{ name: 'GS.TS. Trần Thị B', staff_number: null, is_new: false },
	]);
	assert.equal(items[2].changes[0].lecturer_id, 'user:U9');
	assert.equal(items[2].main.is_new, true);
	assert.deepEqual(items[3].dates, ['23/11/2026 07:30']);
});

test('trợ giảng trùng GV chính bị bỏ; buổi đã đúng ⇒ không đổi', () => {
	const l = LOOKUPS();
	l.sessions[1].assistants = [{ id: 'GV2', name: 'GS.TS. Trần Thị B' }];
	const { items } = buildPreview(
		[
			row(4, {
				kind: 'practice',
				main_code: '1001',
				main: 'Phạm Hồng Thái',
				asst_code: '-; 1001',
				asst: 'Trần Thị B; Phạm Hồng Thái',
				time: day('2026-11-20'),
			}),
		],
		l,
	);
	assert.equal(items[0].status, 'unchanged');
	assert.deepEqual(
		items[0].assistants.map((a) => a.name),
		['GS.TS. Trần Thị B'],
	);
});

test('dòng lỗi bị bỏ qua kèm lý do; dòng trống giữ nguyên', () => {
	const { items, warnings } = buildPreview(
		[
			row(4, {}), // chưa phân công
			row(5, {
				kind: 'practice',
				main: 'Phạm Hồng Thái',
				time: { from: '2026-12-01', to: '2026-12-05', start: null },
			}),
			row(6, { main_code: '1001', main: 'Trần Thị B' }),
			row(7, { main: 'Phạm Hồng Thái; Lê Văn C' }),
			row(8, { asst: 'Lê Văn C' }),
			row(9, { main: 'Phạm Hồng Thái', asst_code: '1003; 1009', asst: 'Lê Văn C' }),
			row(10, { kind: '', main: 'Phạm Hồng Thái' }),
			row(11, { code: 'XYZ', title: 'Bài lạ', main: 'Phạm Hồng Thái' }),
			row(12, { kind: 'practice', main: 'Phạm Hồng Thái' }), // mọi buổi TH: BH2, BH3, BH4
			row(13, { kind: 'practice', main: 'Lê Văn C', time: day('2026-11-21') }),
			row(14, { main: 'Phạm Hồng Thái', time: { error: 'thời gian giảng sai.' } }),
		],
		LOOKUPS(),
	);
	assert.deepEqual(
		items.map((i) => [i.row, i.status]),
		[
			[5, 'skipped'],
			[6, 'skipped'],
			[7, 'skipped'],
			[8, 'skipped'],
			[9, 'skipped'],
			[10, 'skipped'],
			[11, 'skipped'],
			[12, 'update'],
			[13, 'skipped'],
			[14, 'skipped'],
		],
	);
	assert.match(warnings[0], /Dòng 5: .*chưa có buổi TH nào trong khoảng 01\/12\/2026–05\/12\/2026/);
	assert.match(warnings[1], /mã nhân viên 1001 là "Phạm Hồng Thái", khác họ tên "Trần Thị B"/);
	assert.match(warnings[2], /mỗi dòng 1 giảng viên chính/);
	assert.match(warnings[3], /thiếu giảng viên chính/);
	assert.match(warnings[4], /Trợ giảng: 2 mã NV nhưng 1 họ tên/);
	assert.match(warnings[5], /chưa ghi LT \/ TH/);
	assert.match(warnings[6], /không thuộc khóa/);
	assert.match(warnings[7], /Dòng 13: buổi TH 21\/11\/2026 07:30 đã thuộc dòng 12/);
	assert.match(warnings[8], /thời gian giảng sai/);
});

test('kèm giờ bắt đầu: tách 2 buổi cùng ngày cho 2 người', () => {
	const l = LOOKUPS();
	l.sessions.push(S('BH6', 'B1', '2026-11-21', '13:30', 'practice', 'GV1', 'Phạm Hồng Thái'));
	const { items, warnings } = buildPreview(
		[
			row(4, { kind: 'practice', main: 'Phạm Hồng Thái', time: day('2026-11-21', '07:30') }),
			row(5, { kind: 'practice', main: 'Lê Văn C', time: day('2026-11-21', '13:30') }),
		],
		l,
	);
	assert.deepEqual(warnings, []);
	assert.deepEqual(
		items.map((i) => [i.status, i.dates]),
		[
			['unchanged', ['21/11/2026 07:30']],
			['update', ['21/11/2026 13:30']],
		],
	);
});

test('file mẫu: gom buổi liền nhau cùng người; ngày trùng thì tách từng buổi kèm giờ', () => {
	const a = S('X1', 'B1', '2026-11-20', '07:30', 'practice', 'GV1', 'A');
	const b = S('X2', 'B1', '2026-11-21', '07:30', 'practice', 'GV1', 'A');
	const c = S('X3', 'B1', '2026-11-21', '13:30', 'practice', 'GV3', 'C');
	const d = S('X4', 'B1', '2026-11-24', '07:30', 'practice', 'GV3', 'C');
	assert.deepEqual(
		runsOf([a, b]).map((r) => [r.items.map((s) => s.id), r.withTime]),
		[[['X1', 'X2'], false]],
	);
	// Đợt A (20–21) và đợt C (21–24) cùng có ngày 21 ⇒ tách từng buổi kèm giờ
	assert.deepEqual(
		runsOf([a, b, c, d]).map((r) => [r.items.map((s) => s.id), r.withTime]),
		[
			[['X1'], true],
			[['X2'], true],
			[['X3'], true],
			[['X4'], true],
		],
	);
	assert.deepEqual(kindsOf({ theory_hours: 4, practice_hours: 0 }, []), ['theory']);
	assert.deepEqual(kindsOf({ theory_hours: 0, practice_hours: 0 }, []), ['theory', 'practice']);
});

test('file mẫu đọc lại được: khối bài gộp ô, nhiều dòng TH, mã NV trợ giảng', async () => {
	const wb = buildTeachingPlanTemplate({
		title: 'Lớp: Kỹ thuật khai thông mạch não',
		period: 'Thời gian đào tạo: từ ngày 27/11/2026 đến ngày 27/02/2027',
		lessons: [
			{
				code: 'DTLT_23_01',
				title: 'Bài một',
				rows: [
					{
						kind: 'theory',
						hours: 4,
						main_code: '1001',
						main: 'Phạm Hồng Thái',
						time: 'Ngày 20/11/2026',
					},
					{
						kind: 'practice',
						hours: 16,
						main_code: '1003',
						main: 'Lê Văn C',
						asst_codes: '1001; -',
						assts: 'Phạm Hồng Thái; Trần Thị B',
						time: 'Từ ngày 20/11/2026 đến ngày 21/11/2026',
					},
					{ kind: 'practice', main: 'Lê Văn C', time: 'Ngày 22/11/2026 (07:30)' },
				],
			},
			{ code: 'DTLT_23_02', title: 'Bài hai', rows: [{ kind: 'theory', hours: 8 }] },
		],
	});
	const ws = wb.worksheets[0];
	assert.equal(ws.getCell('C3').value, 'Nội dung bài giảng');
	assert.ok(ws.getCell('C5').isMerged);
	const rows = await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
	assert.equal(rows.length, 4);
	assert.deepEqual(
		rows.map((r) => [r.r, r.code, r.kind, r.main_code, r.main, r.asst_code, r.asst]),
		[
			[4, 'DTLT_23_01', 'theory', '1001', 'Phạm Hồng Thái', '', ''],
			[5, 'DTLT_23_01', 'practice', '1003', 'Lê Văn C', '1001; -', 'Phạm Hồng Thái; Trần Thị B'],
			[6, 'DTLT_23_01', 'practice', '', 'Lê Văn C', '', ''],
			[7, 'DTLT_23_02', 'theory', '', '', '', ''],
		],
	);
	assert.deepEqual(rows[1].time, { from: '2026-11-20', to: '2026-11-21', start: null });
	assert.deepEqual(rows[2].time, { from: '2026-11-22', to: '2026-11-22', start: '07:30' });
	const { items } = buildPreview(rows, LOOKUPS());
	assert.deepEqual(
		items.map((i) => [i.row, i.status]),
		[
			[4, 'unchanged'],
			[5, 'update'],
			[6, 'update'],
		],
	);
});

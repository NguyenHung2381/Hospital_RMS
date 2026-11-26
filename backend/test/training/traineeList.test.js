// Danh sách học viên theo đợt / loại hình (traineeListService): mỗi dòng 1 học viên,
// các bộ lọc theo khóa cùng khớp trên 1 lượt ghi danh; đếm tab loại hình bỏ qua loại hình.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

let handler = () => [];
const log = install(async (text, inputs) => handler(text, inputs));
// Mỗi câu của lô chạy riêng để handler trả recordset theo từng câu.
db.queryAll = async (req, statements) => {
	const out = [];
	for (const s of statements) out.push((await req.query(s)).recordset);
	return out;
};
const {
	getAll,
	getFilterOptions,
} = require('../../src/modules/training/trainees/traineeListService');

const listQuery = (from) => log.slice(from).find((q) => /ORDER BY t\.created_at DESC/.test(q.text));
const typeCountQuery = (from) =>
	log.slice(from).find((q) => /GROUP BY c\.training_type_id/.test(q.text));
const totalAllQuery = (from) =>
	log
		.slice(from)
		.filter((q) => /^\s*SELECT COUNT\(\*\) AS total/.test(q.text))
		.at(-1);
// Các khối EXISTS trên lượt ghi danh trong câu (trạng thái hồ sơ PDF cũng dùng EXISTS)
const ENROLLMENT_EXISTS = 'EXISTS (SELECT 1 FROM course_enrollments e ';
const existsBlocks = (text) => text.split(ENROLLMENT_EXISTS).slice(1);
const hasEnrollmentExists = (text) => text.includes(ENROLLMENT_EXISTS);

test('không lọc theo khóa: không ghép lượt ghi danh, đếm tab theo loại hình', async () => {
	handler = (text) => {
		if (/GROUP BY c\.training_type_id/.test(text))
			return [
				{ training_type_id: 'DTLT', total: 4 },
				{ training_type_id: 'GPHN', total: 2 },
			];
		if (/SELECT COUNT\(\*\) AS total/.test(text)) return [{ total: 9 }];
		if (/ORDER BY t\.created_at DESC/.test(text))
			return [{ id: 'T1', full_name: 'A', national_id: '012345678901' }];
		return [];
	};
	const from = log.length;
	const out = await getAll({ limit: 0 });
	const q = listQuery(from);
	assert.equal(hasEnrollmentExists(q.text), false);
	assert.doesNotMatch(q.text, /LATERAL/);
	assert.deepEqual(out.type_counts, { '': 9, DTLT: 4, GPHN: 2 });
	// Người không có quyền xem dữ liệu nhạy cảm chỉ thấy 4 số cuối CCCD
	assert.equal(out.data[0].national_id, '••••8901');
});

test('loại hình + năm + tiến độ cùng khớp trên 1 lượt ghi danh', async () => {
	handler = () => [];
	const from = log.length;
	await getAll({ limit: 0, training_type_id: 'DTLT', year: '2026', progress_status: 'completed' });
	const q = listQuery(from);
	const blocks = existsBlocks(q.text);
	assert.equal(blocks.length, 1, 'chỉ 1 điều kiện EXISTS');
	assert.match(blocks[0], /c\.training_type_id = @training_type_id/);
	assert.match(blocks[0], /= @year/);
	assert.match(blocks[0], /e\.progress_status = @progress_status/);
	assert.match(blocks[0], /e\.status <> 'rejected'/);
	// Kèm lượt ghi danh gần nhất khớp cùng bộ lọc
	assert.match(q.text, /LEFT JOIN LATERAL/);
	assert.match(q.text, /matched_enrollment_count/);
	assert.equal(q.inputs.year, 2026);
	assert.equal(q.inputs.training_type_id, 'DTLT');
	assert.equal(q.inputs.progress_status, 'completed');

	// Số cho tab loại hình: giữ năm + tiến độ, bỏ chính loại hình
	const tc = typeCountQuery(from);
	assert.match(tc.text, /= @year/);
	assert.match(tc.text, /e\.progress_status = @progress_status/);
	assert.doesNotMatch(tc.text, /@training_type_id/);
	const all = totalAllQuery(from);
	assert.equal(existsBlocks(all.text).length, 1);
	assert.doesNotMatch(all.text, /@training_type_id/);
});

test('lọc theo đợt / hình thức học / trạng thái ghi danh', async () => {
	handler = () => [];
	const from = log.length;
	await getAll({
		limit: 0,
		course_id: 'KH001',
		training_form_id: 'HT1',
		enrollment_status: 'pending',
	});
	const q = listQuery(from);
	const [block] = existsBlocks(q.text);
	assert.match(block, /e\.course_id = @course_id/);
	assert.match(block, /c\.training_form_id = @training_form_id/);
	assert.match(block, /e\.status = @enrollment_status/);
	assert.equal(q.inputs.course_id, 'KH001');
	assert.equal(q.inputs.enrollment_status, 'pending');
});

test('giá trị lọc không hợp lệ bị bỏ qua', async () => {
	handler = () => [];
	const from = log.length;
	await getAll({ limit: 0, year: 'abc', enrollment_status: 'rejected', progress_status: 'x' });
	const q = listQuery(from);
	assert.equal(hasEnrollmentExists(q.text), false);
	assert.equal(q.inputs.year, undefined);
	assert.equal(q.inputs.enrollment_status, undefined);
	assert.equal(q.inputs.progress_status, undefined);
});

test('filter-options: khóa có học viên, năm giảm dần (bỏ năm trống), lọc theo loại hình', async () => {
	handler = (text) => {
		if (/FROM courses c/.test(text))
			return [{ id: 'KH001', name: 'ĐTLT đợt 68', trainee_count: 12 }];
		if (/SELECT DISTINCT/.test(text))
			return [{ year: 2025 }, { year: null }, { year: 2027 }, { year: 2026 }];
		if (/FROM training_forms/.test(text)) return [{ id: 'HT1', name: 'Tập trung' }];
		return [];
	};
	const from = log.length;
	const out = await getFilterOptions({ training_type_id: 'DTLT' });
	assert.deepEqual(out.years, [2027, 2026, 2025]);
	assert.equal(out.courses[0].trainee_count, 12);
	assert.deepEqual(out.training_forms, [{ id: 'HT1', name: 'Tập trung' }]);
	const courseQ = log.slice(from).find((q) => /FROM courses c/.test(q.text));
	assert.match(courseQ.text, /c\.training_type_id = @training_type_id/);
	assert.equal(courseQ.inputs.training_type_id, 'DTLT');
});

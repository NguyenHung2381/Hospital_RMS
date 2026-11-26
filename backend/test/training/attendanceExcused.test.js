// Điểm danh của học viên (traineeRecordService.attendance): buổi vắng có đơn xin
// nghỉ ĐÃ DUYỆT phủ buổi đó được đếm riêng là "có phép" — vẫn nằm trong số vắng
// (tỉ lệ chuyên cần không đổi). Truy vấn buổi phải kèm cột leave_type lấy từ
// attendance_leave_requests đã duyệt.
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
const { attendance } = require('../../src/modules/training/trainees/traineeRecordService');

const S = (id, status, leave_type, kind = 'theory') => ({
	enrollment_id: 'GD1',
	session_id: id,
	session_date: '2026-11-20',
	kind,
	status,
	leave_type,
});

test('attendance: vắng có đơn nghỉ đã duyệt ⇒ excused, vẫn tính vào absent', async () => {
	handler = (text) => {
		if (/FROM trainees WHERE id = @id/.test(text)) return [{ id: 'HV1' }];
		if (/-- Buổi đã diễn ra/.test(text))
			return [
				S('B1', 'absent', 'absent'),
				S('B2', 'absent', null),
				S('B3', 'late', 'late'),
				S('B4', 'present', null),
				S('B5', null, 'absent'),
			];
		if (/FROM course_enrollments e\s+JOIN courses c/.test(text))
			return [{ enrollment_id: 'GD1', course_id: 'KH1', course_name: 'Khóa A' }];
		return [];
	};
	const from = log.length;
	const [c] = await attendance('HV1');
	assert.deepEqual(c.theory, { total: 5, present: 1, late: 1, absent: 2, excused: 1, unmarked: 1 });
	const q = log.slice(from).find((x) => /-- Buổi đã diễn ra/.test(x.text));
	assert.match(q.text, /attendance_leave_requests lr/);
	assert.match(q.text, /lr\.status = 'approved'/);
	assert.match(q.text, /AS leave_type/);
});

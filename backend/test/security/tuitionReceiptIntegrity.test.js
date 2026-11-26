// Rà bảo mật 2026-11-26 (phiên security) — toàn vẹn khoản học phí đã cấp biên lai.
//
// S-02: xóa lượt ghi danh / xóa khóa học kéo theo (FK ON DELETE CASCADE) xóa luôn khoản
//       học phí ĐÃ XÁC NHẬN — mất chứng từ tài chính, và số biên lai MAX+1 có thể bị cấp
//       lại cho khoản khác (PT2026-00001 của học viên A thành của học viên B).
//       Sau sửa: câu DELETE kiểm "không có khoản đã xác nhận", 0 dòng ⇒ 409.
// S-03: học viên rút lại khoản nộp: SELECT kiểm "chưa xác nhận" rồi mới DELETE theo id —
//       phòng Đào tạo xác nhận (cấp biên lai) xen giữa 2 câu thì khoản ĐÃ xác nhận bị xóa.
//       Sau sửa: điều kiện trạng thái nằm ngay trong câu DELETE, 0 dòng ⇒ 409, không xóa chứng từ.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// Trạng thái CSDL giả: khoản NP1 của lượt ghi danh E1 đã được xác nhận (có số biên lai)
const CONFIRMED_GUARD = /tuition_payments[\s\S]*status\s*=\s*'confirmed'/;
let handler = () => [];
const log = install(async (text, inputs) => handler(text, inputs));

const trainingFileService = require('../../src/modules/training/trainingFileService');
const softDeleted = [];
trainingFileService.softDelete = async (id) => {
	softDeleted.push(id);
};

const { removeEnrollment } = require('../../src/modules/training/courses/courseEnrollmentService');
const courseService = require('../../src/modules/training/courses/courseService');
const tuitionService = require('../../src/modules/training/tuition/tuitionService');

const since = (n, re) => log.slice(n).filter((e) => re.test(e.text));

test('S-02: xóa lượt ghi danh đã có khoản học phí đã xác nhận → 409, rollback, không xóa', async () => {
	handler = (text) => {
		if (/SELECT e\.program_id, e\.course_id, e\.status/.test(text))
			return [{ program_id: null, course_id: 'C1', status: 'approved', is_rolling: false }];
		if (/DELETE FROM course_enrollments/.test(text))
			// Có khoản đã xác nhận: câu DELETE có điều kiện chặn ⇒ 0 dòng; không có ⇒ xóa được
			return CONFIRMED_GUARD.test(text) ? [] : [{ id: 'E1' }];
		if (/FROM tuition_payments/.test(text)) return [{ x: 1 }];
		return [];
	};
	const n = log.length;
	await assert.rejects(removeEnrollment('E1', 'U_ADMIN'), (err) => {
		assert.equal(err.statusCode, 409);
		assert.match(err.message, /học phí/);
		return true;
	});
	assert.equal(since(n, /^ROLLBACK$/).length, 1, 'transaction phải rollback (cả điểm danh đã xóa)');
	assert.equal(since(n, /^COMMIT$/).length, 0);
	assert.equal(since(n, /form_custom_values/).length, 0, 'không dọn dữ liệu form của bản ghi còn');
});

test('S-02: xóa lượt ghi danh không có khoản đã xác nhận vẫn xóa bình thường', async () => {
	handler = (text) => {
		if (/SELECT e\.program_id, e\.course_id, e\.status/.test(text))
			return [{ program_id: null, course_id: 'C1', status: 'pending', is_rolling: false }];
		if (/DELETE FROM course_enrollments/.test(text)) return [{ id: 'E1' }];
		return [];
	};
	const n = log.length;
	await removeEnrollment('E1', 'U_ADMIN');
	assert.equal(since(n, /^COMMIT$/).length, 1);
});

test('S-02: xóa khóa học có khoản học phí đã xác nhận → 409, không xóa', async () => {
	handler = (text) => {
		if (/DELETE FROM courses/.test(text)) return CONFIRMED_GUARD.test(text) ? [] : [{ id: 'C1' }];
		if (/AS has_cert/.test(text))
			return [{ has_cert: 0, has_cme: 0, ...(/has_tuition/.test(text) ? { has_tuition: 1 } : {}) }];
		return [];
	};
	const n = log.length;
	await assert.rejects(courseService.remove('C1', 'U_ADMIN'), (err) => {
		assert.equal(err.statusCode, 409);
		assert.match(err.message, /học phí/);
		return true;
	});
	assert.equal(since(n, /^ROLLBACK$/).length, 1);
});

test('S-03: rút khoản nộp bị xác nhận xen giữa → 409, không xóa khoản / chứng từ', async () => {
	softDeleted.length = 0;
	handler = (text) => {
		// Lúc SELECT: khoản còn 'pending' (khớp điều kiện chưa xác nhận)
		if (/SELECT p\.id, p\.proof_file_id FROM tuition_payments/.test(text))
			return [{ id: 'NP202611260001', proof_file_id: 'TF1' }];
		// Lúc DELETE: phòng Đào tạo vừa xác nhận ⇒ câu DELETE có điều kiện trạng thái khớp 0 dòng
		if (/DELETE FROM tuition_payments/.test(text))
			return /status\s*<>\s*'confirmed'/.test(text) ? [] : [{ id: 'NP202611260001' }];
		return [];
	};
	await assert.rejects(tuitionService.cancelMine('U_HV', 'NP202611260001'), (err) => {
		assert.equal(err.statusCode, 409);
		return true;
	});
	assert.deepEqual(softDeleted, [], 'chứng từ của khoản đã xác nhận không bị xóa');
});

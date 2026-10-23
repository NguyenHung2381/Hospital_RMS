// Tên đăng nhập học viên "NVA_0001" (modules/training/trainees/traineeUsername.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	traineeUsernamePrefix,
	formatTraineeUsername,
	traineeUsernameIndex,
	nextTraineeUsername,
} = require('../../src/modules/training/trainees/traineeUsername');

test('viết tắt họ tên: bỏ dấu, viết hoa', () => {
	assert.equal(traineeUsernamePrefix('Nguyễn Văn An'), 'NVA');
	assert.equal(traineeUsernamePrefix('Đặng Thị Ánh'), 'DTA');
});

test('số thứ tự luôn 4 chữ số', () => {
	assert.equal(formatTraineeUsername('NVA', 1), 'NVA_0001');
	assert.equal(formatTraineeUsername('NVA', 123), 'NVA_0123');
});

test('đọc số thứ tự chỉ khi đúng dạng của viết tắt đó', () => {
	assert.equal(traineeUsernameIndex('NVA_0012', 'NVA'), 12);
	assert.equal(traineeUsernameIndex('nva_0012', 'NVA'), 12);
	assert.equal(traineeUsernameIndex('NVA_0012_1', 'NVA'), null);
	assert.equal(traineeUsernameIndex('NVAB_0012', 'NVA'), null);
	assert.equal(traineeUsernameIndex('NVA_12', 'NVA'), null);
});

test('học viên đầu tiên của viết tắt nhận 0001', () => {
	assert.equal(nextTraineeUsername('NVA', [], new Set()), 'NVA_0001');
});

test('đếm tiếp từ số lớn nhất của tài khoản học viên cùng viết tắt', () => {
	const trainees = ['NVA_0001', 'NVA_0003', 'TTB_0009'];
	const taken = new Set(trainees.map((u) => u.toUpperCase()));
	assert.equal(nextTraineeUsername('NVA', trainees, taken), 'NVA_0004');
	assert.equal(nextTraineeUsername('TTB', trainees, taken), 'TTB_0010');
});

test('username nhân viên cùng dạng không đẩy số lên, chỉ bị nhảy qua khi trùng', () => {
	// NVA_0123 là nhân viên (MNV 123); NVA_0001 cũng là nhân viên
	const taken = new Set(['NVA_0123', 'NVA_0001']);
	assert.equal(nextTraineeUsername('NVA', [], taken), 'NVA_0002');
});

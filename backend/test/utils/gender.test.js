// Chuẩn hoá giới tính về mã ASCII lưu DB (utils/gender.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGender } = require('../../src/utils/gender');

test('nhãn tiếng Việt / tiếng Anh quy về mã chuẩn', () => {
	for (const v of ['Nam', 'nam', 'NAM', 'male', 'M']) assert.equal(normalizeGender(v), 'male');
	for (const v of ['Nữ', 'nữ', 'NỮ', 'Nu', 'female', 'F'])
		assert.equal(normalizeGender(v), 'female');
	for (const v of ['Khác', 'khac', 'other']) assert.equal(normalizeGender(v), 'other');
});

test('giá trị trống / không nhận diện được → null', () => {
	for (const v of [null, undefined, '', '   ', 'N?', 'abc']) assert.equal(normalizeGender(v), null);
});

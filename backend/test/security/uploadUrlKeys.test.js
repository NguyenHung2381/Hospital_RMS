// Rà bảo mật 2026-11-26 (phiên security) — S-10: signUploadUrlsInJson ký MỌI chuỗi
// "/uploads/..." mang khoá `url` hoặc `image` ở bất kỳ đâu trong response. Hiện chưa có
// trường tự nhập nào tên url/image, nhưng thêm một cột / trường JSON tự do mang tên đó là
// lặp lại L-07 ("máy ký link"): gõ đường dẫn tài liệu của người khác vào, đọc lại là nhận
// link tải hợp lệ.
// Sau sửa: khoá url/image không còn được ký tự động; chỉ ký đúng chỗ server tự sinh đường
// dẫn ảnh (kết quả tải ảnh lên, ảnh câu hỏi bài test trên cổng công khai).
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { signDeep } = require('../../src/utils/signedUpload');

const SIGNED = /\?exp=\d+&sig=[\w-]+$/;

test('S-10: khoá url / image (kể cả lồng trong object, mảng) không còn được ký tự động', () => {
	const out = signDeep({
		url: '/uploads/topics/DT9/ho-so-de-tai.pdf',
		image: '/uploads/courses/KH1/hop-dong.pdf',
		custom: { url: '/uploads/topics/DT9/bien-ban.pdf' },
		links: [{ image: '/uploads/topics/DT9/x.pdf' }],
	});
	assert.equal(out.url, '/uploads/topics/DT9/ho-so-de-tai.pdf');
	assert.equal(out.image, '/uploads/courses/KH1/hop-dong.pdf');
	assert.equal(out.custom.url, '/uploads/topics/DT9/bien-ban.pdf');
	assert.equal(out.links[0].image, '/uploads/topics/DT9/x.pdf');
});

test('S-10 (đối chứng): các trường file do server ghi vẫn được ký', () => {
	const out = signDeep({
		file_url: '/uploads/topics/DT1/a.pdf',
		image_url: '/uploads/questions/q1.png',
		test_questions: JSON.stringify([{ q: 'a', image: '/uploads/seminars/S1/test/x.png' }]),
	});
	assert.match(out.file_url, SIGNED);
	assert.match(out.image_url, SIGNED);
	assert.match(JSON.parse(out.test_questions)[0].image, SIGNED);
});

const fakeRes = () => {
	const res = { body: null, code: 200 };
	res.status = (c) => {
		res.code = c;
		return res;
	};
	res.json = (b) => {
		res.body = b;
		return res;
	};
	return res;
};

test('S-10: tải ảnh câu hỏi (ngân hàng đề) trả url đã ký ngay tại route', () => {
	const ctrl = require('../../src/modules/training/exams/examController');
	const res = fakeRes();
	ctrl.uploadQuestionImage({ file: { filename: 'q-1.png' } }, res);
	assert.match(res.body.data.url, /^\/uploads\/questions\/q-1\.png\?exp=\d+&sig=/);
});

test('S-10: ảnh câu hỏi bài test trên cổng công khai được ký khi xuất đề', () => {
	const { publicQuestions, testOrder } = require('../../src/utils/seminarTest');
	const questions = [
		{ q: 'Câu 1', image: '/uploads/seminars/HN1/test/a.png', options: ['A', 'B'], correct: 0 },
		{ q: 'Câu 2', image: null, options: ['C', 'D'], correct: 1 },
	];
	const pub = publicQuestions(questions, testOrder(questions, 'VE1'));
	assert.match(pub[0].image, /^\/uploads\/seminars\/HN1\/test\/a\.png\?exp=\d+&sig=/);
	assert.equal(pub[1].image, null);
});

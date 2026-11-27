// Kiểm dữ liệu câu hỏi ngân hàng đề — MỘT bộ quy tắc cho tạo lẻ (POST /questions), nhập hàng
// loạt (POST /questions/bulk, mỗi phần tử của `questions`) và sửa (PUT /questions/:id).
// Sửa là cập nhật một phần: chỉ kiểm trường có gửi; đáp án ∈ phương án cần cả giá trị đang
// lưu nên kiểm ở questionBankService.updateQuestion (cùng hàm answerInOptions).
const { body } = require('express-validator');
const { QUESTION_TYPES, POOLS, ANSWER_IN_OPTIONS_MSG, answerInOptions } = require('./examShared');

/**
 * @param {{ bulk?: boolean, partial?: boolean }} [opts]
 *   bulk: kiểm từng phần tử `questions.*` (loại câu bắt buộc, như trước).
 *   partial: PUT — mọi trường đều tùy chọn, có gửi thì phải hợp lệ.
 */
const questionRules = ({ bulk = false, partial = false } = {}) => {
	const field = (name) => body(bulk ? `questions.*.${name}` : name);
	const required = (chain) => (partial ? chain.optional() : chain);
	const rules = [
		required(field('question_text'))
			.isString()
			.trim()
			.notEmpty()
			.withMessage(bulk ? 'Có câu hỏi bị trống nội dung' : 'Nội dung câu hỏi không được để trống'),
		(bulk ? field('question_type') : field('question_type').optional())
			.isIn(QUESTION_TYPES)
			.withMessage('Loại câu hỏi không hợp lệ'),
		// question_bank.points là DECIMAL(4,1)
		field('points')
			.optional()
			.isFloat({ min: 0.1, max: 999 })
			.withMessage('Điểm phải từ 0,1 đến 999'),
		field('options').optional().isArray({ max: 20 }).withMessage('Tối đa 20 phương án'),
		field('correct_option')
			.optional({ values: 'null' })
			.isString()
			.isLength({ max: 255 })
			.withMessage('Đáp án quá dài (tối đa 255 ký tự)'),
		required(field('program_id')).notEmpty().withMessage('Vui lòng chọn chương trình cho câu hỏi'),
		field('pool').optional().isIn(POOLS).withMessage('Kho câu hỏi không hợp lệ'),
	];
	if (bulk)
		rules.push(
			body('questions')
				.custom((qs) => qs.every(answerInOptions))
				.withMessage(ANSWER_IN_OPTIONS_MSG),
		);
	else if (!partial)
		rules.push(
			body('correct_option')
				.custom((_v, { req }) => answerInOptions(req.body))
				.withMessage(ANSWER_IN_OPTIONS_MSG),
		);
	return rules;
};

module.exports = { questionRules };

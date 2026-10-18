// ESLint cho backend (CommonJS, Node 22). Chạy: npm run lint
// Định dạng (thụt lề, dấu nháy...) do Prettier lo — eslint-config-prettier tắt
// các rule trùng việc để 2 công cụ không cãi nhau.
const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
	{ ignores: ['node_modules/**', 'uploads/**', 'logs/**', 'coverage/**', 'dist/**'] },
	js.configs.recommended,
	prettier,
	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: { ...globals.node },
		},
		rules: {
			// Tham số / biến cố ý bỏ qua thì đặt tên bắt đầu bằng "_" (vd (_req, res)).
			// next của error handler Express phải khai báo đủ 4 tham số dù không dùng.
			'no-unused-vars': [
				'error',
				{
					args: 'after-used',
					argsIgnorePattern: '^_|^next$',
					varsIgnorePattern: '^_',
					caughtErrors: 'none',
				},
			],
			eqeqeq: ['error', 'smart'],
			'no-var': 'error',
			'prefer-const': 'error',
			// Chỉ cảnh báo — file quá dài sẽ được xử lý khi tách module, không chặn CI.
			'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
		},
	},
	{
		// Ranh giới tầng: nghiệp vụ và hàm dùng chung không phụ thuộc tầng HTTP.
		// Cần hỏi quyền thì dùng permissions/authz.js, không require middlewares/.
		files: ['src/modules/**/*Service.js', 'src/utils/**/*.js', 'src/shared/**/*Service.js'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.name='require'][arguments.0.value=/middlewares\\//]",
					message:
						'Service/utils không được require middlewares/ — dùng permissions/authz.js (hasPermission, scopeOf...).',
				},
			],
		},
	},
	{
		// Controller chỉ đọc request → gọi service → trả response: SQL ở service/
		// repository, dựng file Excel ở exports/ (xem README, mục Khuôn module).
		files: ['src/modules/**/*Controller.js', 'src/shared/**/*Controller.js'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.name='require'][arguments.0.value=/config\\/db$/]",
					message: 'Controller không truy vấn DB — đưa SQL vào service/repository.',
				},
				{
					selector: "CallExpression[callee.name='require'][arguments.0.value='exceljs']",
					message: 'Controller không dựng Excel — đưa vào <module>/exports/.',
				},
			],
		},
	},
	{
		// Log ứng dụng đi qua config/logger.js (pino). scripts/ (CLI) vẫn dùng console.
		files: ['src/**/*.js'],
		ignores: ['src/config/logger.js'],
		rules: { 'no-console': 'error' },
	},
	{
		files: ['test/**/*.js', 'test-integration/**/*.js'],
		rules: { 'max-lines': 'off' },
	},
];

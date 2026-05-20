const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'RMS Hospital API',
			version: '1.0.0',
			description:
				'Tài liệu API hệ thống quản lý nghiên cứu khoa học bệnh viện RMS',
			contact: { name: 'RMS Dev Team' },
		},
		servers: [{ url: '/api/v1', description: 'API v1' }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT',
					description: 'Nhập JWT token để xác thực (lấy từ /auth/login)',
				},
			},
		},
		security: [{ bearerAuth: [] }],
	},
	// Dùng path.join để tránh lỗi đường dẫn trên mọi OS
	apis: [path.join(__dirname, '../routes/*.js')],
};

module.exports = swaggerJsdoc(options);

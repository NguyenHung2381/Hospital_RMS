// Giảm lộ dữ liệu qua API:
//   - /users/search (mọi tài khoản đăng nhập gọi được) chỉ trả email đã che;
//   - thêm thành viên chọn từ gợi ý (email trống) ⇒ server tự điền email thật
//     theo mã NV, chạy trước formConfigGuard;
//   - /health/db (công khai) không trả tên server / DB / thông báo lỗi kết nối.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const USERS = [
	{
		id: 'NV1',
		full_name: 'Nguyễn Văn An',
		username: 'NVA_0123',
		staff_number: 123,
		email: 'nguyenvanan@bvnghean.vn',
		department_id: 'K1',
	},
	{
		id: 'NV2',
		full_name: 'Lê Thị Bê',
		username: 'LTB_0045',
		staff_number: 45,
		email: 'nv2@member.local',
		department_id: 'K1',
	},
];
let dbDown = false;
install(async (text, inputs) => {
	if (dbDown) throw Object.assign(new Error('Login failed for user rms_app'), { code: 'ELOGIN' });
	if (/SELECT u\.id, u\.full_name, u\.username, u\.staff_number/.test(text)) return USERS;
	if (/SELECT email FROM users\s+WHERE staff_number = @sn/.test(text)) {
		const hits = USERS.filter((u) => u.staff_number === inputs.sn && !u.email.endsWith('.local'));
		return hits.map((u) => ({ email: u.email }));
	}
	if (/SELECT 1 AS ok/.test(text)) return [{ ok: 1 }];
	return [];
});
// Vai trò Học viên giả — inputRoleId / roleIdOf không đụng DB
require('../../src/modules/access/roleCodes').roleIdOf = async () => 'VT_HV';

const { maskEmail } = require('../../src/utils/maskEmail');
const userService = require('../../src/modules/users/userService');
const topicMemberService = require('../../src/modules/topics/memberAccountEmail');

test('maskEmail: giữ vài ký tự đầu + tên miền; email nội bộ tự sinh ⇒ null', () => {
	assert.equal(maskEmail('nguyenvanan@bvnghean.vn'), 'ng***@bvnghean.vn');
	assert.equal(maskEmail('abc@x.vn'), 'a***@x.vn');
	assert.equal(maskEmail('nv2@member.local'), null);
	assert.equal(maskEmail('khong-phai-email'), null);
	assert.equal(maskEmail(null), null);
});

test('/users/search không trả email thật', async () => {
	const { data } = await userService.searchForMember({ q: 'ng', limit: 10 });
	assert.equal(data.length, 2);
	for (const u of data) assert.equal('email' in u, false);
	assert.equal(data[0].email_masked, 'ng***@bvnghean.vn');
	assert.equal(data[1].email_masked, null);
	assert.ok(!JSON.stringify(data).includes('nguyenvanan@'));
});

test('thêm thành viên chọn từ gợi ý: email trống ⇒ server điền email tài khoản theo mã NV', async () => {
	const run = (body) =>
		new Promise((resolve, reject) =>
			topicMemberService.fillEmailFromStaffAccount({ body }, {}, (err) =>
				err ? reject(err) : resolve(body),
			),
		);
	assert.equal(
		(await run({ ho_ten: 'A', staff_number: '123', email: '' })).email,
		'nguyenvanan@bvnghean.vn',
	);
	// Người dùng tự nhập email ⇒ giữ nguyên
	assert.equal(
		(await run({ ho_ten: 'A', staff_number: '123', email: 'rieng@gmail.com' })).email,
		'rieng@gmail.com',
	);
	// Không có tài khoản / chỉ có email tự sinh / không có mã NV ⇒ để trống như cũ
	assert.equal((await run({ ho_ten: 'B', staff_number: '45' })).email, undefined);
	assert.equal((await run({ ho_ten: 'C', staff_number: '999' })).email, undefined);
	assert.equal((await run({ ho_ten: 'D' })).email, undefined);
});

test('/health/db: chỉ trả trạng thái, không lộ server / DB / lỗi kết nối', async () => {
	const router = require('../../src/modules/system/health.routes');
	const layer = router.stack.find((l) => l.route?.path === '/db');
	const handler = layer.route.stack[0].handle;
	const call = () =>
		new Promise((resolve) => {
			const res = {
				statusCode: 200,
				status(c) {
					this.statusCode = c;
					return this;
				},
				json(body) {
					resolve({ status: this.statusCode, body });
				},
			};
			handler({}, res);
		});
	process.env.DB_SERVER = 'sqlvm01.noi-bo';
	const ok = await call();
	assert.equal(ok.status, 200);
	assert.equal(ok.body.status, 'connected');
	assert.ok(!JSON.stringify(ok.body).includes('sqlvm01'));

	dbDown = true;
	const down = await call();
	dbDown = false;
	assert.equal(down.status, 503);
	assert.deepEqual(Object.keys(down.body).sort(), ['status', 'success', 'timestamp']);
	assert.ok(!JSON.stringify(down.body).includes('rms_app'));
});

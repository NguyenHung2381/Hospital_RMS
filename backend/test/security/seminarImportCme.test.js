// Hồi quy (audit run-4, cùng loại M-04): POST /seminars/:id/participants/import-excel cho người
// chỉ có seminars:import gửi issue_cme=1 để cấp số CME (cme_year/cme_seq) mà không cần
// seminars:cme_manage. Chạy app thật (route + authorizePermission + controller + importService)
// trên CSDL giả; bulkAdd/issueCme được thay bằng bản ghi nhận để xem có bị gọi hay không.
process.env.JWT_SECRET = 'test-secret-import-cme-0123456789abcdef';
// Tắt ClamAV như test/upload/secureUpload.test.js: .env dev đặt CLAMAV_HOST=clamav (chỉ
// phân giải được trong mạng Docker) nên chạy ngoài Docker upload sẽ bị từ chối fail-closed.
process.env.CLAMAV_HOST = '';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { install } = require('../auth/fakeDb');

const ROLES = {
	// chỉ nhập danh sách: có seminars:import, KHÔNG có cme_manage
	RIMP: [
		{ resource: 'seminars', action: 'read', scope: 'all' },
		{ resource: 'seminars', action: 'import', scope: 'all' },
	],
	// có cả seminars:cme_manage
	RCME: [
		{ resource: 'seminars', action: 'read', scope: 'all' },
		{ resource: 'seminars', action: 'import', scope: 'all' },
		{ resource: 'seminars', action: 'cme_manage', scope: 'all' },
	],
};
const USERS = { UIMP: 'RIMP', UCME: 'RCME' };

install(async (text, inputs) => {
	if (/token_version, must_change_password/.test(text)) {
		const role = USERS[inputs.id];
		if (!role) return [];
		return [
			{
				is_active: true,
				role_id: role,
				department_id: 'K1',
				account_expires_at: null,
				token_version: 0,
				must_change_password: false,
				temp_password_issued_at: null,
				totp_enabled: false,
				twofa_required_since: null,
			},
		];
	}
	if (/FROM permissions p\s+INNER JOIN role_permissions/.test(text))
		return ROLES[inputs.role_id] || [];
	if (/SELECT id, code FROM roles/.test(text)) return [{ id: 'VT10', code: 'trainee' }];
	if (/SELECT id, event_year, grants_cme, cme_default_credits FROM seminars/.test(text))
		return [{ id: 'SEM1', event_year: 2026, grants_cme: true, cme_default_credits: 6 }];
	return [];
});
require('../../src/modules/persons/personService').syncPerson = async () => {};
require('../../src/modules/persons/personService').syncPersons = async () => {};

const participantService = require('../../src/modules/seminars/seminarParticipantService');
const cmeService = require('../../src/modules/seminars/seminarCmeService');
const calls = [];
participantService.bulkAdd = async (seminarId, rows) => {
	calls.push({ name: 'bulkAdd', rows });
	return { inserted: rows.length, ids: rows.map((_, i) => `SPT${i}`) };
};
cmeService.issueCme = async (seminarId, ids, actorId, opts) => {
	calls.push({ name: 'issueCme', ids, opts });
	return { issued: ids.length, from: 1, to: ids.length, year: opts.year };
};

const { signToken } = require('../../src/utils/keys');
const app = require('../../src/app');

let srv;
let base;
test.before(async () => {
	srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	base = `http://127.0.0.1:${srv.address().port}/api/v1`;
});
test.after(() => srv.close());

const buildWorkbook = async () => {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Danh sach');
	ws.addRow(['STT', 'Họ và tên', 'Đơn vị công tác', 'Số tín chỉ']);
	ws.addRow([1, 'Nguyen Van A', 'Benh vien X', 3]);
	ws.addRow([2, 'Tran Thi B', 'Benh vien Y', 3]);
	return Buffer.from(await wb.xlsx.writeBuffer());
};

const importAs = async (who, fields) => {
	calls.length = 0;
	const form = new FormData();
	form.append(
		'file',
		new Blob([await buildWorkbook()], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		}),
		'ds.xlsx',
	);
	for (const [k, v] of Object.entries(fields)) form.append(k, v);
	const res = await fetch(`${base}/seminars/SEM1/participants/import-excel`, {
		method: 'POST',
		headers: { authorization: `Bearer ${signToken('access', { id: who, tv: 0 }, '1h')}` },
		body: form,
	});
	const body = await res.json();
	return { status: res.status, data: body.data ?? body };
};
const names = () => calls.map((c) => c.name);

test('chỉ có seminars:import + issue_cme=1: nhập được người nhưng KHÔNG cấp số CME', async () => {
	const r = await importAs('UIMP', { dry_run: '0', issue_cme: '1' });
	assert.equal(r.status, 200);
	assert.equal(r.data.inserted, 2);
	assert.equal(names().includes('bulkAdd'), true);
	assert.equal(names().includes('issueCme'), false);
	assert.equal(r.data.cme_issued, 0);
	assert.equal(r.data.cme_year, null);
	assert.match(r.data.warnings.join('\n'), /không có quyền cấp số CME/);
});

test('chỉ có seminars:import + issue_cme=true (chuỗi khác): vẫn không cấp được', async () => {
	const r = await importAs('UIMP', { dry_run: '0', issue_cme: 'true' });
	assert.equal(r.status, 200);
	assert.equal(names().includes('issueCme'), false);
});

test('đối chứng: có seminars:cme_manage + issue_cme=1 vẫn cấp số CME như cũ', async () => {
	const r = await importAs('UCME', { dry_run: '0', issue_cme: '1' });
	assert.equal(r.status, 200);
	assert.equal(r.data.inserted, 2);
	assert.deepEqual(names(), ['bulkAdd', 'issueCme']);
	assert.equal(r.data.cme_issued, 2);
	assert.equal(r.data.cme_year, 2026);
	assert.doesNotMatch(r.data.warnings.join('\n'), /không có quyền cấp số CME/);
});

test('không gửi issue_cme: người chỉ có import nhập bình thường, không cảnh báo quyền', async () => {
	const r = await importAs('UIMP', { dry_run: '0' });
	assert.equal(r.status, 200);
	assert.equal(r.data.inserted, 2);
	assert.equal(names().includes('issueCme'), false);
	assert.doesNotMatch(r.data.warnings.join('\n'), /không có quyền cấp số CME/);
});

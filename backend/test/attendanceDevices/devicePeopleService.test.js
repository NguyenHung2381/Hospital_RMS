// Tên người dùng khai trên máy chấm công (attendanceDevices/devicePeopleService) với CSDL giả.
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const S = { names: [] };
const log = install(async (text) => (text.includes('FROM attendance_device_people') ? S.names : []));
const svc = require('../../src/modules/attendanceDevices/devicePeopleService');

test('cleanName: bỏ ký tự điều khiển, gộp khoảng trắng, rỗng ⇒ null, cắt 100 ký tự', () => {
	assert.equal(svc.cleanName('  Nguyen\tVan\u0000  A '), 'Nguyen Van A');
	assert.equal(svc.cleanName('   '), null);
	assert.equal(svc.cleanName(null), null);
	assert.equal(svc.cleanName('x'.repeat(150)).length, 100);
});

test('saveFromDevice: bỏ mã sai, trùng mã lấy dòng sau cùng, upsert theo (máy, mã)', async () => {
	log.length = 0;
	const n = await svc.saveFromDevice(7, [
		{ pin: '123', name: 'Cu' },
		{ pin: 'bad pin', name: 'X' },
		{ pin: '', name: 'Y' },
		{ pin: '123', name: 'Moi' },
		{ pin: '456', name: null },
	]);
	assert.equal(n, 2);
	const q = log[0];
	assert.match(q.text, /ON CONFLICT \(device_id, pin\) DO UPDATE/);
	assert.equal(q.inputs.device_id, 7);
	assert.deepEqual(JSON.parse(q.inputs.rows), [
		{ pin: '123', name: 'Moi' },
		{ pin: '456', name: null },
	]);
	log.length = 0;
	assert.equal(await svc.saveFromDevice(7, []), 0);
	assert.equal(log.length, 0, 'không có gì thì không truy vấn');
});

test('namesFor: trả Map mã → tên; thiếu máy / mã thì không truy vấn', async () => {
	S.names = [{ pin: '123', name: 'Moi' }];
	const m = await svc.namesFor([7], ['123', '456']);
	assert.equal(m.get('123'), 'Moi');
	assert.equal(m.has('456'), false);
	log.length = 0;
	assert.equal((await svc.namesFor([], ['1'])).size, 0);
	assert.equal(log.length, 0);
});

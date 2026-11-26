const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../../src/modules/attendanceDevices/iclockProtocol');

test('parseDeviceTime: giờ máy (VN) → UTC', () => {
	assert.equal(p.parseDeviceTime('2027-01-05 07:52:10').toISOString(), '2027-01-05T00:52:10.000Z');
	assert.equal(p.parseDeviceTime('2027-01-05 00:10').toISOString(), '2027-01-04T17:10:00.000Z');
	assert.equal(p.parseDeviceTime('05/01/2027 07:52'), null);
	assert.equal(p.parseDeviceTime(''), null);
});

test('formatDeviceTime: UTC → giờ máy', () => {
	assert.equal(p.formatDeviceTime(new Date('2027-01-04T17:10:00Z')), '2027-01-05 00:10:00');
});

test('parseAttlog: dòng tab, dòng cách, dòng hỏng', () => {
	const body = [
		'20270001\t2027-01-05 07:52:10\t0\t1\t0\t0\t0',
		'20270002  2027-01-05 07:55:00  1  15',
		'rác',
		'\t2027-01-05 07:55:00',
		'',
	].join('\r\n');
	const { records, invalid } = p.parseAttlog(body);
	assert.equal(invalid, 2);
	assert.equal(records.length, 2);
	assert.deepEqual(
		{ ...records[0], punchedAt: records[0].punchedAt.toISOString() },
		{ pin: '20270001', punchedAt: '2027-01-05T00:52:10.000Z', inOut: 0, verifyMode: 1 },
	);
	assert.equal(records[1].pin, '20270002');
	assert.equal(records[1].verifyMode, 15);
});

test('parseOperlog: USER, FP, BIODATA (vân tay / khuôn mặt), OPLOG', () => {
	const tmp = 'TUNTUzIxAAAD'.repeat(4);
	const body = [
		'OPLOG 4\t0\t2027-01-05 07:00:00\t1\t0\t0\t0',
		'USER PIN=20270001\tName=Nguyễn Văn A\tPri=0\tPasswd=\tCard=\tGrp=1',
		`FP PIN=20270001\tFID=6\tSize=48\tValid=1\tTMP=${tmp}`,
		`BIODATA Pin=20270002\tNo=0\tIndex=3\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=${tmp}`,
		`BIODATA Pin=20270002\tNo=0\tIndex=0\tValid=1\tType=9\tTmp=${tmp}`,
		'FP PIN=20270001\tFID=12\tTMP=abc',
	].join('\n');
	const r = p.parseOperlog(body);
	assert.deepEqual(r.users, [{ pin: '20270001', name: 'Nguyễn Văn A' }]);
	assert.equal(r.fingers.length, 2);
	assert.deepEqual(
		{ pin: r.fingers[0].pin, fid: r.fingers[0].fingerIndex, size: r.fingers[0].size },
		{ pin: '20270001', fid: 6, size: 48 },
	);
	assert.equal(r.fingers[1].fingerIndex, 3);
	assert.equal(r.fingers[1].majorVer, '10');
	assert.equal(r.other, 3);
});

test('parseDeviceCmdResult', () => {
	assert.deepEqual(
		p.parseDeviceCmdResult('ID=12&Return=0&CMD=DATA\nID=13&Return=-1&CMD=DATA\nxx'),
		[
			{ id: 12, returnCode: 0, cmd: 'DATA' },
			{ id: 13, returnCode: -1, cmd: 'DATA' },
		],
	);
});

test('parseInfo', () => {
	const i = p.parseInfo('Ver 6.60 Apr 10 2019,3,5,120,192.168.103.223,10,7,0');
	assert.equal(i.firmware, 'Ver 6.60 Apr 10 2019');
	assert.equal(i.userCount, 3);
	assert.equal(i.fpCount, 5);
	assert.equal(i.fpAlgorithm, '10');
	assert.equal(p.parseInfo(undefined), null);
});

test('formatOptions: stamp đã lưu / chưa có', () => {
	const o = p.formatOptions({ serial_no: 'ABC123', attlog_stamp: '9999', operlog_stamp: null });
	assert.match(o, /^GET OPTION FROM: ABC123\n/);
	assert.match(o, /\nATTLOGStamp=9999\n/);
	assert.match(o, /\nOPERLOGStamp=None\n/);
	assert.match(o, /\nTimeZone=7\n/);
});

test('deviceName: có dấu, không dấu, cắt 24 ký tự, bỏ ký tự phá cú pháp', () => {
	assert.equal(p.deviceName('Nguyễn Thị Đào', false), 'Nguyễn Thị Đào');
	assert.equal(p.deviceName('Nguyễn Thị Đào', true), 'Nguyen Thi Dao');
	assert.equal(p.deviceName('A\tB=C\nD', false), 'A B C D');
	assert.equal([...p.deviceName('Tôn Nữ Hoàng Phương Thảo Nguyên Anh', false)].length, 24);
});

test('formatUserUpsert / Delete theo phiên bản PUSH', () => {
	// Chỉ mã + tên — không gửi mật khẩu / thẻ / quyền để máy giữ nguyên của người đã có
	assert.equal(
		p.formatUserUpsert({ pin: '20270001', name: 'Lê Văn B', pushVersion: '2.4.1' }),
		'DATA UPDATE USERINFO PIN=20270001	Name=Lê Văn B',
	);
	assert.equal(
		p.formatUserUpsert({ pin: '1', name: 'X', pushVersion: null }),
		'DATA USER PIN=1	Name=X',
	);
	assert.doesNotMatch(
		p.formatUserUpsert({ pin: '1', name: 'X', pushVersion: '2.4.1' }),
		/Passwd|Card|Pri/,
	);
	assert.equal(
		p.formatUserDelete({ pin: '20270001', pushVersion: '2.4.1' }),
		'DATA DELETE USERINFO PIN=20270001',
	);
	assert.equal(p.formatUserDelete({ pin: '20270001' }), 'DATA DEL_USER PIN=20270001');
	assert.throws(() => p.formatUserDelete({ pin: '1	X=2' }));
});

test('parseOperlog: dòng FINGERTMP (firmware gửi lại toàn bộ)', () => {
	const tmp = 'TUNTUzIxAAAD'.repeat(4);
	const r = p.parseOperlog(`FINGERTMP PIN=20270001	FingerID=2	Size=48	Valid=1	TMP=${tmp}`);
	assert.equal(r.fingers.length, 1);
	assert.equal(r.fingers[0].fingerIndex, 2);
});

test('formatFingerUpsert', () => {
	const tmp = 'QUJDREVGR0hJSktMTU5PUA==';
	assert.equal(
		p.formatFingerUpsert({
			pin: '20270001',
			fingerIndex: 6,
			size: 24,
			template: tmp,
			pushVersion: '2.4.1',
		}),
		`DATA UPDATE FINGERTMP PIN=20270001\tFID=6\tSize=24\tValid=1\tTMP=${tmp}`,
	);
	assert.throws(() => p.formatFingerUpsert({ pin: '1', fingerIndex: 10, template: tmp }));
	assert.throws(() => p.formatFingerUpsert({ pin: '1', fingerIndex: 1, template: 'a\tb' }));
});

test('formatCommands / formatQueryAttlog', () => {
	assert.equal(p.formatCommands([]), 'OK');
	assert.equal(
		p.formatCommands([
			{ id: 1, command: 'INFO' },
			{ id: 2, command: 'DATA DELETE USERINFO PIN=1' },
		]),
		'C:1:INFO\nC:2:DATA DELETE USERINFO PIN=1',
	);
	assert.equal(
		p.formatQueryAttlog(new Date('2027-01-04T17:00:00Z'), new Date('2027-01-05T16:59:59Z')),
		'DATA QUERY ATTLOG StartTime=2027-01-05 00:00:00\tEndTime=2027-01-05 23:59:59',
	);
});

test('PIN ↔ mã học viên', () => {
	assert.equal(p.traineeIdFromPin('20270001'), 'HV20270001');
	assert.equal(p.traineeIdFromPin('123'), null);
	assert.equal(p.pinFromTraineeId('HV20270001'), '20270001');
	assert.equal(p.pinFromTraineeId('HV2027'), null);
	assert.ok(p.isValidSerial('CKJX203560123'));
	assert.ok(!p.isValidSerial('a b'));
});

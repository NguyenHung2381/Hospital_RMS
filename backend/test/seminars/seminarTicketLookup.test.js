// Tra lại vé hội nghị (seminarPublicService.lookupTicket) trên CSDL giả:
// - nội viện: họ tên + mã NV khớp hồ sơ nhân sự ⇒ vé đứng tên nhân viên đó;
// - ngoại viện: họ tên (bỏ dấu / hoa thường) + ngày sinh, chỉ trong hội nghị của link,
//   trùng nhiều người thì không trả vé nào.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const SEMINAR = { id: 'HN1', title: 'Hội nghị', scope: 'hosted', registration_open: false };
let people = [];
let staffTickets = [];
const log = install(async (text, inputs) => {
	if (/WHERE s.public_token = @token/.test(text)) return inputs.token === 'tok' ? [SEMINAR] : [];
	if (/FROM users u/.test(text))
		return inputs.sn === 1234 ? [{ id: 'U1', full_name: 'Lê Văn Cường', staff_number: 1234 }] : [];
	if (/WHERE seminar_id = @sid AND user_id = @uid AND source = 'internal'/.test(text))
		return inputs.sid === 'HN1' && inputs.uid === 'U1' ? staffTickets : [];
	if (/WHERE seminar_id = @sid AND ticket_code IS NOT NULL AND CAST\(dob/.test(text))
		return inputs.sid === 'HN1' && inputs.dob === '1990-05-17' ? people : [];
	return [];
});

const { lookupTicket } = require('../../src/modules/seminars/seminarPublicService');

const external = (full_name, dob) => ({ source: 'external', full_name, dob });
const internal = (full_name, staff_number) => ({ source: 'internal', full_name, staff_number });

test('ngoại viện: khớp họ tên bỏ dấu / hoa thường + ngày sinh → mã vé (kể cả đã hết hạn đăng ký)', async () => {
	people = [
		{ full_name: 'Nguyễn Văn An', source: 'external', ticket_code: 'a'.repeat(32) },
		{ full_name: 'Trần Thị Bình', source: 'external', ticket_code: 'b'.repeat(32) },
	];
	assert.deepEqual(await lookupTicket('tok', external('  nguyen van  AN ', '1990-05-17')), {
		ticket_code: 'a'.repeat(32),
	});
	const q = log.find((x) => /CAST\(dob AS DATE\) = @dob/.test(x.text));
	assert.equal(q.inputs.sid, 'HN1');
	assert.equal(q.inputs.dob, '1990-05-17');
});

test('ngoại viện: sai ngày sinh hoặc họ tên → 404', async () => {
	people = [{ full_name: 'Nguyễn Văn An', source: 'external', ticket_code: 'a'.repeat(32) }];
	await assert.rejects(lookupTicket('tok', external('Nguyễn Văn An', '1990-05-18')), {
		statusCode: 404,
	});
	await assert.rejects(lookupTicket('tok', external('Nguyễn Văn Ân Hai', '1990-05-17')), {
		statusCode: 404,
	});
});

test('ngoại viện: trùng họ tên + ngày sinh nhiều người → 409, không trả vé nào', async () => {
	people = [
		{ full_name: 'Nguyễn Văn An', source: 'external', ticket_code: 'a'.repeat(32) },
		{ full_name: 'NGUYỄN VĂN AN', source: 'external', ticket_code: 'c'.repeat(32) },
	];
	await assert.rejects(lookupTicket('tok', external('Nguyễn Văn An', '1990-05-17')), {
		statusCode: 409,
	});
});

test('ngoại viện: chỉ khớp đăng ký ngoại viện — trùng tên + ngày sinh với nội viện thì chỉ đường sang mã NV', async () => {
	people = [{ full_name: 'Lê Văn Cường', source: 'internal', ticket_code: 'd'.repeat(32) }];
	await assert.rejects(lookupTicket('tok', external('Lê Văn Cường', '1990-05-17')), {
		statusCode: 404,
		message: /nội viện/,
	});
	// Có cả nội viện lẫn ngoại viện cùng tên + ngày sinh ⇒ trả vé ngoại viện, không 409
	people = [
		{ full_name: 'Lê Văn Cường', source: 'internal', ticket_code: 'd'.repeat(32) },
		{ full_name: 'Lê Văn Cường', source: 'external', ticket_code: 'e'.repeat(32) },
	];
	assert.deepEqual(await lookupTicket('tok', external('Lê Văn Cường', '1990-05-17')), {
		ticket_code: 'e'.repeat(32),
	});
});

test('nội viện: họ tên + mã NV khớp hồ sơ → vé của nhân viên đó', async () => {
	staffTickets = [{ ticket_code: 'd'.repeat(32) }];
	assert.deepEqual(await lookupTicket('tok', internal('le van cuong', '1234')), {
		ticket_code: 'd'.repeat(32),
	});
});

test('nội viện: sai họ tên / mã NV → 404; khớp nhưng chưa đăng ký → 404', async () => {
	staffTickets = [{ ticket_code: 'd'.repeat(32) }];
	await assert.rejects(lookupTicket('tok', internal('Lê Văn Cương Khác', '1234')), {
		statusCode: 404,
	});
	await assert.rejects(lookupTicket('tok', internal('Lê Văn Cường', '9999')), { statusCode: 404 });
	staffTickets = [];
	await assert.rejects(lookupTicket('tok', internal('Lê Văn Cường', '1234')), {
		statusCode: 404,
		message: /chưa đăng ký/,
	});
});

test('link đăng ký sai → 404', async () => {
	await assert.rejects(lookupTicket('xxx', external('Nguyễn Văn An', '1990-05-17')), {
		statusCode: 404,
	});
});

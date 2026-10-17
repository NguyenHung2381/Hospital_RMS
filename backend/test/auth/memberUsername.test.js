const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMemberUsername } = require('../../src/modules/topics/topicMemberService');

test('username = chữ cái đầu họ tên (bỏ dấu, học vị) + MNV đệm 4 số', () => {
	assert.equal(buildMemberUsername('Nguyễn Văn An', 123), 'NVA_0123');
	assert.equal(buildMemberUsername('PGS.TS. Đặng Thị Ánh', '45'), 'DTA_0045');
	assert.equal(buildMemberUsername('BS Trần  Bình', 7), 'TB_0007');
	assert.equal(buildMemberUsername('Lê Ơn', null), 'LO');
	assert.equal(buildMemberUsername('Lê Ơn', ''), 'LO');
});

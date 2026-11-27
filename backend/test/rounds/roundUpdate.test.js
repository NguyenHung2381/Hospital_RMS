// Hồi quy roundService.update (01-tests mục 3 #8, 04-backend mục A): UPDATE đợt, ghi
// lại cấp độ và đồng bộ cấp độ đề tài phải nằm trong MỘT transaction có người thao tác.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = require('../auth/fakeDb');

let failTopics = false;
const log = fakeDb.install(async (text) => {
	if (/^\s*UPDATE topics SET level_id/.test(text) && failTopics) throw new Error('DB rớt');
	if (/SELECT level_id FROM research_round_levels/.test(text)) return [{ level_id: 'CD01' }];
	return [];
});

const svc = require('../../src/modules/rounds/roundService');
const texts = () => log.map((l) => l.text);
const idx = (re) => texts().findIndex((t) => re.test(t));

test('#8 update: đợt + cấp độ + đề tài trong 1 transaction, gắn người thao tác trước khi ghi', async () => {
	failTopics = false;
	log.length = 0;
	await svc.update('DOT20261', { name: 'Đợt 1', level_ids: ['CD01'] }, 'ADMIN');
	const actor = idx(/set_config\('app.current_user_id'/);
	const upd = idx(/UPDATE research_rounds SET/);
	const del = idx(/DELETE FROM research_round_levels/);
	const ins = idx(/INSERT INTO research_round_levels/);
	const topics = idx(/UPDATE topics SET level_id/);
	const commit = texts().indexOf('COMMIT');
	assert.ok(actor >= 0 && actor < upd, 'set_config trước UPDATE đợt');
	assert.ok(upd < del && del < ins && ins < topics && topics < commit, texts().join('\n---\n'));
	assert.equal(texts().filter((t) => t === 'COMMIT').length, 1, 'chỉ 1 transaction');
});

test('#8 update: lỗi khi đồng bộ đề tài ⇒ ROLLBACK cả đợt lẫn cấp độ', async () => {
	failTopics = true;
	log.length = 0;
	await assert.rejects(
		svc.update('DOT20261', { name: 'Đợt 1', level_ids: ['CD01'] }, 'ADMIN'),
		/DB rớt/,
	);
	assert.ok(texts().includes('ROLLBACK'));
	assert.ok(!texts().includes('COMMIT'));
});

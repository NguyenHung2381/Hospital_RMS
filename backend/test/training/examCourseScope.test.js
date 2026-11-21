// L-13: route quản lý đề/bài thi áp phạm vi khóa học 'assigned'.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { install } = require('../auth/fakeDb');

const queries = [];
install(async (text, inputs) => {
	queries.push(text);
	if (/FROM courses c WHERE c\.id = @id AND EXISTS/.test(text))
		return inputs.id === 'KH1' ? [{ ok: 1 }] : [];
	if (/FROM exam_papers WHERE id = @id/.test(text))
		return inputs.id === 'P1' ? [{ course_id: 'KH1' }] : inputs.id === 'P2' ? [{ course_id: 'KH2' }] : [];
	if (/FROM exam_attempts a\s+JOIN exam_papers/.test(text))
		return inputs.id === 'A2' ? [{ course_id: 'KH2' }] : [];
	return [];
});

const auth = require('../../src/middlewares/auth');
let currentUser;
auth.authenticate = (req, _res, next) => {
	req.user = currentUser;
	next();
};
auth.authorizePermission = () => (_req, _res, next) => next();
const ctrl = require('../../src/modules/training/exams/examController');
for (const k of ['listPapers', 'getPaper', 'createPaper', 'updatePaper', 'removePaper', 'listAttempts', 'getAttempt', 'gradeAnswer'])
	ctrl[k] = (_req, res) => res.json({ ok: true });
const router = require('../../src/modules/training/exams/exams.routes');
const { errorHandler } = require('../../src/middlewares/errorHandler');

const mk = (grants) => ({
	id: 'U1',
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants)),
});
const LECTURER = mk({ 'courses:read': 'assigned', 'courses:update': 'assigned', 'exams:manage': 'all' });
const MANAGER = mk({ 'courses:read': 'all', 'courses:update': 'all', 'exams:manage': 'all' });

const call = async (user, method, path, body) => {
	currentUser = user;
	const app = express();
	app.use(express.json());
	app.use('/exams', router);
	app.use(errorHandler);
	const srv = http.createServer(app);
	await new Promise((r) => srv.listen(0, r));
	try {
		const res = await fetch(`http://127.0.0.1:${srv.address().port}/exams${path}`, {
			method,
			headers: { 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		});
		return res.status;
	} finally {
		srv.close();
	}
};

test('phạm vi assigned: đề/bài thi của khóa khác bị chặn 403', async () => {
	assert.equal(await call(LECTURER, 'GET', '/papers/P2'), 403);
	assert.equal(await call(LECTURER, 'DELETE', '/papers/P2'), 403);
	assert.equal(await call(LECTURER, 'GET', '/papers/P2/attempts'), 403);
	assert.equal(await call(LECTURER, 'GET', '/attempts/A2'), 403);
	assert.equal(await call(LECTURER, 'POST', '/attempts/A2/grade', { question_id: 'Q', score: 1 }), 403);
	assert.equal(await call(LECTURER, 'GET', '/papers?course_id=KH2'), 403);
	assert.equal(await call(LECTURER, 'POST', '/papers', { course_id: 'KH2', title: 'x' }), 403);
});

test('phạm vi assigned: khóa được phân công vẫn dùng được; danh sách bắt buộc course_id', async () => {
	assert.equal(await call(LECTURER, 'GET', '/papers/P1'), 200);
	assert.equal(await call(LECTURER, 'GET', '/papers?course_id=KH1'), 200);
	assert.equal(await call(LECTURER, 'GET', '/papers'), 400);
});

test('phạm vi all: không bị ảnh hưởng', async () => {
	assert.equal(await call(MANAGER, 'GET', '/papers/P2'), 200);
	assert.equal(await call(MANAGER, 'DELETE', '/papers/P2'), 200);
});

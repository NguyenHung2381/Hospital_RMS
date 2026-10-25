const express = require('express');
const { authenticate } = require('../middlewares/auth');

// Liệt kê mọi route của một app Express 5 kèm lớp bảo vệ của nó — dùng cho
// scripts/check-route-permissions.js và test/permissions (không cần DB).
//   { method, path, auth, perms: [[resource, action]...], guards: [middleware...] }
// `guards` = các middleware authorizePermission (có .permissionPairs) theo đúng
// thứ tự áp dụng — kể cả những cái gắn qua router.use() phía trước route.

// Express 5 (router@2): layer chỉ giữ hàm match đã biên dịch, không còn
// layer.regexp để đọc ngược ra đường mount của router. Nên ghi lại path ngay lúc
// gọi app.use()/router.use() (app.use() cũng đi qua Router#use). Vì vậy module
// này PHẢI được require TRƯỚC khi nạp src/app.js — nạp sau thì các layer đã tạo
// không được ghi path và listRoutes() sẽ báo lỗi.
const mountPaths = new WeakMap();
const originalUse = express.Router.prototype.use;
express.Router.prototype.use = function use(...args) {
	const from = this.stack.length;
	originalUse.apply(this, args);
	// Giống Router#use: tham số đầu là path nếu nó (hoặc phần tử đầu của mảng) không phải hàm
	let first = args[0];
	while (Array.isArray(first) && first.length) [first] = first;
	const path = typeof first === 'function' ? '/' : args[0];
	for (const layer of this.stack.slice(from)) mountPaths.set(layer, path);
	return this;
};

const mountPathOf = (layer) => {
	if (layer.slash) return '';
	const path = mountPaths.get(layer);
	if (path === undefined) {
		throw new Error(
			'routeWalker: không biết đường mount của router — phải require routeWalker trước khi nạp src/app.js',
		);
	}
	if (typeof path !== 'string') {
		throw new Error(`routeWalker: chỉ hỗ trợ mount path dạng chuỗi, gặp ${String(path)}`);
	}
	return path.replace(/\/+$/, '');
};

const listRoutes = (app) => {
	const routes = [];
	const walk = (stack, prefix, inherited) => {
		const current = { auth: inherited.auth, guards: [...inherited.guards] };
		for (const layer of stack) {
			if (layer.route) {
				let auth = current.auth;
				const guards = [...current.guards];
				for (const l of layer.route.stack) {
					if (l.handle === authenticate) auth = true;
					if (l.handle.permissionPairs) guards.push(l.handle);
				}
				for (const method of Object.keys(layer.route.methods)) {
					routes.push({
						method: method.toUpperCase(),
						path: prefix + layer.route.path,
						auth,
						guards,
						perms: guards.flatMap((g) => g.permissionPairs),
					});
				}
			} else if (layer.name === 'router') {
				walk(layer.handle.stack, prefix + mountPathOf(layer), current);
			} else if (layer.slash) {
				// router.use(fn) không kèm path → áp cho mọi route khai báo SAU nó
				if (layer.handle === authenticate) current.auth = true;
				if (layer.handle.permissionPairs) current.guards.push(layer.handle);
			}
		}
	};
	walk(app.router.stack, '', { auth: false, guards: [] });
	return routes;
};

// Chạy lần lượt các guard phân quyền của route với `user` cho trước (không gọi
// handler, không đụng DB). true = qua hết mọi guard.
const passesGuards = (route, user) => {
	for (const guard of route.guards) {
		let passed = false;
		const res = { status: () => res, json: () => res };
		guard({ user }, res, () => {
			passed = true;
		});
		if (!passed) return false;
	}
	return true;
};

module.exports = { listRoutes, passesGuards };

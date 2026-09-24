const { authenticate } = require('../middlewares/auth');

// Liệt kê mọi route của một app Express 4 kèm lớp bảo vệ của nó — dùng cho
// scripts/check-route-permissions.js và test/permissions (không cần DB).
//   { method, path, auth, perms: [[resource, action]...], guards: [middleware...] }
// `guards` = các middleware authorizePermission (có .permissionPairs) theo đúng
// thứ tự áp dụng — kể cả những cái gắn qua router.use() phía trước route.

// Express 4: đường mount của router nằm trong layer.regexp, vd
// /^\/api\/users\/?(?=\/|$)/i → "/api/users".
const mountPathOf = (layer) => {
	if (layer.regexp.fast_slash) return '';
	return layer.regexp.source
		.replace(/^\^/, '')
		.replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
		.replace(/\\\//g, '/');
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
			} else if (layer.regexp.fast_slash) {
				// router.use(fn) không kèm path → áp cho mọi route khai báo SAU nó
				if (layer.handle === authenticate) current.auth = true;
				if (layer.handle.permissionPairs) current.guards.push(layer.handle);
			}
		}
	};
	walk(app._router.stack, '', { auth: false, guards: [] });
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

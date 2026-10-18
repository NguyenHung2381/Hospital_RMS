// CSDL giả cho luồng đăng nhập / refresh token: 1 user + bảng refresh_tokens
// trong bộ nhớ. Dùng chung cho refreshRotation.test.js và authCookie.test.js.
const bcrypt = require('bcrypt');
const { install } = require('./fakeDb');

const PASSWORD = 'Dung#matkhau2026';

const setup = () => {
	const user = {
		id: 'U1',
		username: 'nva',
		password: bcrypt.hashSync(PASSWORD, 4),
		is_active: 1,
		role_id: null,
		totp_enabled: 0,
		failed_login_count: 0,
		locked_until: null,
		token_version: 0,
	};
	const rows = []; // refresh_tokens
	const events = [];
	let seq = 0;

	install(async (text, inputs) => {
		if (/WHERE u\.username = @login/.test(text))
			return inputs.login === user.username ? [user] : [];
		if (/WHERE u\.email = @login/.test(text))
			return user.email && inputs.login === user.email ? [user] : [];
		if (/EXEC sp_create_refresh_token/.test(text)) {
			const id = `RT${++seq}`;
			const days = inputs.remember_me ? 30 : 7;
			rows.push({
				id,
				user_id: inputs.user_id,
				token: inputs.token,
				remember_me: inputs.remember_me,
				family_id: null,
				revoked_at: null,
				expires_at: new Date(Date.now() + days * 86400000),
			});
			return [{ id }];
		}
		if (/SET ip_address = @ip_address/.test(text)) {
			const r = rows.find((x) => x.token === inputs.token);
			if (r) r.family_id = inputs.family_id;
			return [];
		}
		if (/SET revoked_at = SYSUTCDATETIME\(\)/.test(text)) {
			const r = rows.find(
				(x) => x.token === inputs.token && !x.revoked_at && x.expires_at > new Date(),
			);
			if (!r) return [];
			r.revoked_at = new Date();
			return [{ ...r }];
		}
		if (/SELECT id, user_id, family_id, revoked_at FROM refresh_tokens/.test(text))
			return rows.filter((x) => x.token === inputs.token);
		if (/SELECT remember_me FROM refresh_tokens/.test(text))
			return rows.filter((x) => x.token === inputs.token);
		if (/DELETE FROM refresh_tokens WHERE family_id = @family OR id = @family/.test(text)) {
			for (let i = rows.length - 1; i >= 0; i--)
				if (rows[i].family_id === inputs.family || rows[i].id === inputs.family) rows.splice(i, 1);
			return [];
		}
		if (/DECLARE @family/.test(text)) {
			// logout(): xoá cả họ của token
			const r = rows.find((x) => x.token === inputs.token);
			const family = r ? r.family_id || r.id : null;
			for (let i = rows.length - 1; i >= 0; i--)
				if (
					rows[i].token === inputs.token ||
					(family && (rows[i].family_id === family || rows[i].id === family))
				)
					rows.splice(i, 1);
			return [];
		}
		if (/UPDATE users SET token_version = token_version \+ 1/.test(text)) {
			user.token_version += 1;
			return [{ token_version: user.token_version }];
		}
		if (/SELECT token_version FROM users/.test(text))
			return [{ token_version: user.token_version }];
		if (/FROM users u LEFT JOIN roles r ON r\.id=u\.role_id WHERE u\.id=@id/.test(text))
			return [user];
		return [];
	});
	require('../../src/modules/audit/securityEventService').log = async (e) => events.push(e);
	require('../../src/permissions/permissionCache').load = async () => ({
		keys: new Set(),
		scopes: new Map(),
	});

	return { user, rows, events, PASSWORD };
};

module.exports = { setup };

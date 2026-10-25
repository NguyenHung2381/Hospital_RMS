// Hàm khai báo 1 quyền trong danh mục (permissions/catalog.js và các file catalog*.js).
/**
 * @param {string} id
 * @param {string} action
 * @param {string} name
 * @param {string} description
 * @param {{ critical?: boolean, seedFrom?: string[], scoped?: boolean, [k: string]: any }} [opts]
 */
const p = (id, action, name, description, opts = {}) => ({
	id,
	action,
	name,
	description,
	...opts,
});

module.exports = { p };

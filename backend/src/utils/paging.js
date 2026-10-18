// Chuẩn hóa page/limit cho các service phân trang kiểu OFFSET/FETCH.
// limit=0 → lấy tất cả (chỉ dùng cho bảng nhỏ: departments, rounds, councils, catalogs...);
// limit>0 → cap MAX_LIMIT chống lạm dụng. Query string gửi lên là chuỗi nên parse tại đây.
const MAX_LIMIT = 1000;

const paging = (page, limit, defaultLimit = 20) => {
	const p = Math.max(parseInt(page, 10) || 1, 1);
	const raw = limit === undefined ? defaultLimit : parseInt(limit, 10);
	const l = raw === 0 ? 0 : Math.min(Math.max(raw, 1) || defaultLimit, MAX_LIMIT);
	return {
		page: p,
		limit: l,
		offset: (p - 1) * l,
		// Chuỗi rỗng = bỏ mệnh đề phân trang trong SQL (lấy toàn bộ)
		fetchClause: l === 0 ? '' : 'OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY',
	};
};

module.exports = { paging };

// Self-check: node src/utils/paging.js
if (require.main === module) {
	const assert = require('assert');
	assert.deepStrictEqual(paging('2', '20'), {
		page: 2,
		limit: 20,
		offset: 20,
		fetchClause: 'OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY',
	});
	assert.strictEqual(paging(1, '0').fetchClause, ''); // limit=0 → lấy tất cả
	assert.strictEqual(paging(1, 99999).limit, MAX_LIMIT); // cap
	assert.strictEqual(paging('abc', 'xyz').limit, 20); // rác → default
	assert.strictEqual(paging(undefined, undefined, 100).limit, 100);
	assert.strictEqual(paging('-1', '-5').offset, 0); // âm → chặn về 1
	console.log('paging.js OK');
}

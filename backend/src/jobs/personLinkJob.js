const personService = require('../modules/persons/personService');

// Job nền: gắn nốt person_id cho các bản ghi còn thiếu (đường ghi dual-write bị lỗi,
// dữ liệu import bằng SQL tay, đường ghi chưa được hook...). Idempotent, an toàn chạy lại.
// Mỗi nguồn tối đa BATCH dòng/lần chạy; nếu còn nhiều thì đêm sau chạy tiếp.
const BATCH = 2000;

const run = async () => {
	if (!personService.isEnabled()) return;
	for (const source of personService.SOURCE_ORDER) {
		const n = await personService.syncPending(source, { limit: BATCH });
		if (n > 0) console.log(`[job:person_link] ${source}: đã gắn person cho ${n} bản ghi.`);
	}
};

module.exports = { run };

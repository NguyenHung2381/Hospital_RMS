// Năm báo cáo từ query/body: số 4 chữ số hợp lệ → number, còn lại (trống, "all", rác) → null = mọi năm.
/** @param {unknown} v */
const reportYear = (v) => {
	const n = Number(v);
	return Number.isInteger(n) && n >= 1900 && n <= 9999 ? n : null;
};

module.exports = { reportYear };

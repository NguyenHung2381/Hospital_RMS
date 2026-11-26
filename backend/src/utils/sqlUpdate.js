// Dựng phần SET cho câu UPDATE từng phần (PATCH): chỉ trường có mặt trong data
// (khác undefined) mới được ghi — thay cho chuỗi khối lặp
//   if (data.x !== undefined) { sets.push('x = @x'); req.input('x', type, data.x); }
//
// fields: { cột: kiểu | [kiểu, opts] }
//   opts.orNull — ghi `data.x || null` (chuỗi rỗng / 0 / false ⇒ NULL)
//   opts.map    — hàm đổi giá trị trước khi ghi (ưu tiên hơn orNull)
//   opts.param  — tên tham số khác tên cột (mặc định = tên cột)
// Trả lại mảng sets để tiện dùng tiếp.
const addSets = (req, sets, data, fields) => {
	for (const [col, spec] of Object.entries(fields)) {
		if (data[col] === undefined) continue;
		const [type, opts = {}] = Array.isArray(spec) ? spec : [spec];
		const param = opts.param ?? col;
		const value = opts.map ? opts.map(data[col]) : opts.orNull ? data[col] || null : data[col];
		sets.push(`${col} = @${param}`);
		req.input(param, type, value);
	}
	return sets;
};

module.exports = { addSets };

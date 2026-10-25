// require() ở lần dùng đầu tiên thay vì lúc nạp file — cho thư viện nặng mà chỉ
// vài tính năng hiếm dùng tới (xuất/nhập Excel, Word, gửi mail...). Nạp sẵn thì
// MỌI tiến trình (mỗi worker cluster, mỗi lần nodemon restart) tốn thêm RSS và
// thời gian đọc hàng trăm file, dù không ai bấm xuất Excel.
//
// Trả về Proxy đứng thay module: `X.prop`, `X(...)`, `new X(...)` đều nạp module
// thật rồi chuyển tiếp. Gắn kiểu ở chỗ khai báo bằng JSDoc
// `@type {typeof import('exceljs')}` ngay trên `const ExcelJS = lazyRequire('exceljs')`.

/**
 * @param {string} id tên package (không dùng cho đường dẫn tương đối — require
 *   resolve theo vị trí file này, không phải file gọi)
 * @returns {any}
 */
const lazyRequire = (id) => {
	let mod;
	const load = () => (mod ??= require(id));
	// Đích là function thường (không phải arrow) để bắt được cả gọi hàm lẫn `new`
	return new Proxy(function () {}, {
		get: (_, key) => load()[key],
		has: (_, key) => key in load(),
		apply: (_, thisArg, args) => Reflect.apply(load(), thisArg, args),
		construct: (_, args) => Reflect.construct(load(), args),
	});
};

module.exports = { lazyRequire };

// Một ô CSV an toàn khi mở bằng Excel. Chuỗi bắt đầu bằng = + - @ (hoặc tab/CR)
// được Excel chạy như công thức — kể cả khi bọc trong ngoặc kép — nên dữ liệu
// người ngoài nhập được (vd tên đăng nhập sai ghi vào nhật ký) có thể thành
// =HYPERLINK(...) gửi dữ liệu ra ngoài. Thêm ' phía trước để Excel coi là chữ.
// Số giữ nguyên (số âm không phải công thức).
export const csvCell = (v: unknown): string => {
	let s = v == null ? '' : String(v);
	if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

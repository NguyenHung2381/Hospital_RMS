// Che bớt email khi chỉ cần cho người dùng nhận ra (gợi ý chọn người), không cần
// giá trị thật: "nguyenvana@bvnghean.vn" → "ng***@bvnghean.vn". Email nội bộ tự
// sinh (@member.local, @trainee.local — tài khoản không có email thật) ⇒ null.
const PLACEHOLDER_DOMAIN = /\.local$/i;

const maskEmail = (email) => {
	if (typeof email !== 'string') return null;
	const at = email.lastIndexOf('@');
	if (at < 1) return null;
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	if (!domain || PLACEHOLDER_DOMAIN.test(domain)) return null;
	const keep = local.length > 3 ? 2 : 1;
	return `${local.slice(0, keep)}***@${domain}`;
};

module.exports = { maskEmail };

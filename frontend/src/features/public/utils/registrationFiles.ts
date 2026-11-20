// Hồ sơ đính kèm khi đăng ký khóa đào tạo liên tục — tiện ích kiểm file phía trình duyệt.
// Nguồn chân lý vẫn là máy chủ (kiểm lại đuôi, dung lượng, chữ ký nội dung); đây chỉ để báo lỗi sớm.

/** Khớp backend registrationFileKinds.js (REGISTRATION_FILE_EXTENSIONS). Form công khai ưu tiên giá trị từ rules. */
export const REGISTRATION_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

/** Giá trị `accept` của ô chọn file (đuôi + MIME để trình chọn file của điện thoại lọc đúng) */
export const REGISTRATION_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** Đuôi file viết thường, gồm dấu chấm ('' nếu không có) */
export const extOf = (name: string) => {
	const i = name.lastIndexOf('.');
	return i < 0 ? '' : name.slice(i).toLowerCase();
};

export const formatFileSize = (bytes: number) =>
	bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Câu lỗi nếu file không hợp lệ, null nếu dùng được */
export function checkRegistrationFile(file: File, extensions: string[], maxSizeMB: number): string | null {
	if (!extensions.includes(extOf(file.name))) return `"${file.name}": chỉ nhận PDF, JPG hoặc PNG`;
	if (file.size > maxSizeMB * 1048576) return `"${file.name}" vượt quá ${maxSizeMB} MB`;
	return null;
}

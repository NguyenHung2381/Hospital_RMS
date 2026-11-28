/** Đường dẫn gốc của Trình ký theo cổng đang đứng (quản trị / người dùng) */
export const signRequestBase = (pathname: string) =>
	pathname.startsWith('/admin') ? '/admin/trinh-ky' : '/user/trinh-ky';

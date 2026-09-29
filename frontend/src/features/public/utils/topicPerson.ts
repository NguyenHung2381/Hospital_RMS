import type { TopicRegisterMember } from '../api/publicApi';

// Một người tham gia đề tài trên form đăng ký công khai — cùng bộ trường với
// form "Thêm thành viên thủ công" nội bộ (RegisterMemberSection.tsx) để dữ
// liệu vào hệ thống đồng nhất: họ tên, MNV, SĐT, chức danh bắt buộc.
export type TopicPerson = Omit<TopicRegisterMember, 'role'> & {
	role: 'leader' | TopicRegisterMember['role'];
	staff_number: string;
	phone: string;
	position: string;
	department_id: string;
	email: string;
};

export type PersonField = keyof TopicPerson;

export const EMPTY_PERSON: TopicPerson = {
	full_name: '',
	staff_number: '',
	phone: '',
	position: '',
	department_id: '',
	email: '',
	role: 'member',
};

const PHONE_RE = /^(\+?84|0)\d{9,10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lỗi theo từng trường; rỗng ⇒ hợp lệ. MNV lưu kiểu số (topic_members.staff_number INT).
export const validatePerson = (p: TopicPerson): Partial<Record<PersonField, string>> => {
	const errs: Partial<Record<PersonField, string>> = {};
	if (!p.full_name.trim()) errs.full_name = 'Nhập họ tên';
	if (!p.staff_number.trim()) errs.staff_number = 'Nhập mã nhân viên';
	else if (!/^\d{1,9}$/.test(p.staff_number.trim())) errs.staff_number = 'Mã nhân viên chỉ gồm chữ số';
	if (!p.phone.trim()) errs.phone = 'Nhập số điện thoại';
	else if (!PHONE_RE.test(p.phone.replace(/[\s.-]/g, ''))) errs.phone = 'Số điện thoại không hợp lệ';
	if (!p.position.trim()) errs.position = 'Nhập chức danh chuyên môn';
	if (p.email.trim() && !EMAIL_RE.test(p.email.trim())) errs.email = 'Email không hợp lệ';
	return errs;
};

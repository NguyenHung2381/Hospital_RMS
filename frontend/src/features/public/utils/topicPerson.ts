import type { FormConfig } from '@/shared/formConfig/useFormConfig';
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

const LEADER_FIELDS = ['full_name', 'staff_number', 'phone', 'position', 'email'] as const;

// Chủ nhiệm đề tài = người đăng ký: bắt buộc / ẩn / ràng buộc theo Cấu hình form
// (biến thể công khai). Định dạng MNV / SĐT / email vẫn kiểm như validatePerson.
export const validateLeader = (p: TopicPerson, cfg: FormConfig): Partial<Record<PersonField, string>> => {
	const errs = validatePerson(p);
	if (!cfg.resolved) return errs;
	const values: Record<string, string> = {};
	for (const k of LEADER_FIELDS) {
		if (!cfg.field(k)) continue;
		if (!cfg.visible(k) || (!p[k].trim() && !cfg.required(k))) delete errs[k];
		if (cfg.visible(k)) values[k] = p[k];
	}
	for (const [k, msg] of Object.entries(cfg.validate(values))) {
		const key = k as PersonField;
		if (!errs[key]) errs[key] = msg;
	}
	return errs;
};

import { useEffect, useRef, useState } from 'react';
import {
	searchUsers,
	type SimpleItem,
	type UserSuggestion,
} from '../api/topicApi';
import type {
	FormErrors,
	MemberRole,
	Topic,
	TopicForm,
} from '../types/topic.type';
import { isAddRoleAllowed, isEditRoleAllowed, nextAddRole } from '../utils/topicHelpers';
import { useFormConfig } from '../../../shared/formConfig/useFormConfig';
import type { CustomValues } from '../../../shared/formConfig/types';

export interface PendingMember {
	tempId: string;
	ho_ten: string;
	staff_number: string;
	email?: string;
	so_dien_thoai?: string;
	chuc_vu?: string;
	username?: string;
	department_id?: string;
	department_name?: string;
	role: MemberRole;
}

export interface ManualMemberForm {
	ho_ten: string;
	staff_number: string;
	email: string;
	so_dien_thoai: string;
	chuc_vu: string;
	department_id: string;
}

// Cột DATE của SQL Server về tới client dạng '2026-10-26T00:00:00.000Z' → cắt về 'YYYY-MM-DD' cho DatePicker.
const toDateValue = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

interface UseTopicModalProps {
	mode: 'create' | 'edit';
	topic?: Topic;
	departments: SimpleItem[];
	onSave: (form: TopicForm, members: PendingMember[]) => Promise<void>;
}

export function useTopicModal({
	mode,
	topic,
	departments,
	onSave,
}: UseTopicModalProps) {
	const [form, setForm] = useState<TopicForm>({
		title: topic?.title ?? '',
		description: topic?.description ?? '',
		round_id: topic?.round_id ?? '',
		category_id: topic?.category_id ?? '',
		department_id: topic?.department_id ?? '',
		status: topic?.status ?? 'submitted',
		article_type: topic?.article_type ?? 'de_tai',
		journal_name: topic?.journal_name ?? '',
		doi: topic?.doi ?? '',
		publish_date: toDateValue(topic?.publish_date),
		budget_estimated: topic?.budget_estimated?.toString() ?? '',
		budget_actual: topic?.budget_actual?.toString() ?? '',
		approval_decision_no: topic?.approval_decision_no ?? '',
		approval_decision_date: toDateValue(topic?.approval_decision_date),
		recognition_decision_no: topic?.recognition_decision_no ?? '',
		recognition_decision_date: toDateValue(topic?.recognition_decision_date),
		acceptance_rating: topic?.acceptance_rating ?? '',
		acceptance_score: topic?.acceptance_score?.toString() ?? '',
		acceptance_date: toDateValue(topic?.acceptance_date),
		is_featured: topic?.is_featured ?? false,
	});
	const [errors, setErrors] = useState<FormErrors>({});
	// Cấu hình form 'topic' (trang Cấu hình form) — biến thể form quản trị
	const cfg = useFormConfig('topic', 'admin');
	const [custom, setCustomState] = useState<CustomValues>(topic?.custom ?? {});

	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState('');

	const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
	const [memberQuery, setMemberQuery] = useState('');
	const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [addRole, setAddRole] = useState<MemberRole>('leader');
	const [isManualAdd, setIsManualAdd] = useState(false);
	const [manualForm, setManualForm] = useState<ManualMemberForm>({
		ho_ten: '',
		staff_number: '',
		email: '',
		so_dien_thoai: '',
		chuc_vu: '',
		department_id: '',
	});
	const [manualRole, setManualRole] = useState<MemberRole>('leader');
	const [manualError, setManualError] = useState('');
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (memberQuery.trim().length < 2) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setIsSearching(true);
			searchUsers(memberQuery)
				.then((res) => {
					setSuggestions(res.data);
					setShowSuggestions(true);
				})
				.catch(() => setSuggestions([]))
				.finally(() => setIsSearching(false));
		}, 300);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [memberQuery]);

	// Mỗi lần danh sách thành viên đổi → vai trò mặc định nhảy lần lượt Chủ nhiệm → Thư ký → Thành viên.
	// Chuẩn hóa ngay khi render (tránh cascading render từ effect).
	const [prevPending, setPrevPending] = useState(pendingMembers);
	if (prevPending !== pendingMembers) {
		setPrevPending(pendingMembers);
		const next = nextAddRole(pendingMembers);
		setAddRole(next);
		setManualRole(next);
	}

	const deptName = (id: string) =>
		departments.find((d) => d.id === id)?.name ?? '';

	const selectUser = (u: UserSuggestion) => {
		if (pendingMembers.some((m) => m.staff_number === (u.staff_number ?? '')))
			return;
		// Vai trò đang chọn không hợp lệ (vd. danh sách trống nhưng đang để Thành viên) → dùng vai trò hợp lệ thay vì bỏ qua im lặng
		const role: MemberRole = isAddRoleAllowed(pendingMembers, addRole)
			? addRole
			: pendingMembers.length === 0
				? 'leader'
				: 'member';
		setPendingMembers((prev) => [
			...prev,
			{
				tempId: u.id,
				ho_ten: u.full_name,
				staff_number: u.staff_number != null ? String(u.staff_number) : '',
				// Server điền email tài khoản theo mã NV
				email: '',
				username: u.username,
				department_id: u.department_id,
				department_name: deptName(u.department_id),
				role,
			},
		]);
		setMemberQuery('');
		setSuggestions([]);
		setShowSuggestions(false);
	};

	const addManual = () => {
		if (!manualForm.ho_ten.trim()) {
			setManualError('Vui lòng nhập họ tên');
			return;
		}
		if (!manualForm.staff_number.trim()) {
			setManualError('Vui lòng nhập mã nhân viên');
			return;
		}
		if (
			pendingMembers.some(
				(m) => m.staff_number === manualForm.staff_number.trim(),
			)
		) {
			setManualError('Mã nhân viên này đã được thêm');
			return;
		}
		if (!isAddRoleAllowed(pendingMembers, manualRole)) {
			setManualError(
				pendingMembers.length === 0
					? 'Vui lòng chọn chủ nhiệm trước'
					: manualRole === 'leader'
						? 'Đã có chủ nhiệm, không thể thêm người thứ hai'
						: 'Đã có thư ký, không thể thêm người thứ hai',
			);
			return;
		}
		setPendingMembers((prev) => [
			...prev,
			{
				tempId: `manual-${Date.now()}`,
				ho_ten: manualForm.ho_ten.trim(),
				staff_number: manualForm.staff_number.trim(),
				email: manualForm.email.trim() || undefined,
				so_dien_thoai: manualForm.so_dien_thoai.trim() || undefined,
				chuc_vu: manualForm.chuc_vu.trim() || undefined,
				department_id: manualForm.department_id || undefined,
				department_name: deptName(manualForm.department_id),
				role: manualRole,
			},
		]);
		setManualForm({
			ho_ten: '',
			staff_number: '',
			email: '',
			so_dien_thoai: '',
			chuc_vu: '',
			department_id: '',
		});
		setManualError('');
		setIsManualAdd(false);
	};

	const removeMember = (tempId: string) =>
		setPendingMembers((prev) => prev.filter((m) => m.tempId !== tempId));

	const changeRole = (tempId: string, role: MemberRole) => {
		if (!isEditRoleAllowed(pendingMembers, tempId, role)) return;
		setPendingMembers((prev) =>
			prev.map((m) => (m.tempId === tempId ? { ...m, role } : m)),
		);
	};

	const setField = (field: keyof TopicForm, val: string) => {
		setForm((p) => ({ ...p, [field]: val }));
		if (errors[field])
			setErrors((p) => {
				const n = { ...p };
				delete n[field];
				return n;
			});
	};

	const setCustom = (next: CustomValues) => {
		setCustomState(next);
		const changed = Object.keys(next).filter((k) => next[k] !== custom[k]);
		if (changed.some((k) => errors[k]))
			setErrors((p) => {
				const n = { ...p };
				changed.forEach((k) => delete n[k]);
				return n;
			});
	};

	const toggleFeatured = () => {
		setForm((p) => ({ ...p, is_featured: !p.is_featured }));
	};

	const validate = (): boolean => {
		let e: FormErrors = {};
		if (cfg.resolved) {
			// Bắt buộc / ràng buộc theo Cấu hình form (gồm cả trường tùy chỉnh)
			e = cfg.validate({ ...form }, custom, { mode });
		} else {
			if (!form.title.trim()) e.title = 'Vui lòng nhập tên đề tài';
			if (!form.round_id) e.round_id = 'Vui lòng chọn đợt nghiên cứu';
			if (!form.category_id) e.category_id = 'Vui lòng chọn phân loại';
			if (!form.department_id) e.department_id = 'Vui lòng chọn khoa/phòng';
		}
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const closeManualAdd = () => {
		setIsManualAdd(false);
		setManualError('');
	};

	const handleSubmit = async () => {
		if (!validate()) return;
		setLoading(true);
		setSaveError('');
		try {
			await onSave({ ...form, custom }, pendingMembers);
		} catch (err: unknown) {
			setSaveError(err instanceof Error ? err.message : 'Lỗi lưu đề tài');
			setLoading(false);
		}
	};

	return {
		form,
		errors,
		cfg,
		custom,
		setCustom,
		loading,
		saveError,
		pendingMembers,
		memberQuery,
		setMemberQuery,
		suggestions,
		isSearching,
		showSuggestions,
		setShowSuggestions,
		addRole,
		setAddRole,
		isManualAdd,
		setIsManualAdd,
		manualForm,
		setManualForm,
		manualRole,
		setManualRole,
		manualError,
		closeManualAdd,
		deptName,
		selectUser,
		addManual,
		removeMember,
		changeRole,
		setField,
		toggleFeatured,
		handleSubmit,
	};
}

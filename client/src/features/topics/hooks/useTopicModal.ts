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

interface UseTopicModalProps {
	topic?: Topic;
	departments: SimpleItem[];
	onSave: (form: TopicForm, members: PendingMember[]) => Promise<void>;
}

export function useTopicModal({
	topic,
	departments,
	onSave,
}: UseTopicModalProps) {
	const [form, setForm] = useState<TopicForm>({
		title: topic?.title ?? '',
		description: topic?.description ?? '',
		round_id: topic?.round_id ?? '',
		category_id: topic?.category_id ?? '',
		level_id: topic?.level_id ?? '',
		department_id: topic?.department_id ?? '',
		status: topic?.status ?? 'submitted',
		article_type: topic?.article_type ?? 'de_tai',
		journal_name: topic?.journal_name ?? '',
		doi: topic?.doi ?? '',
		publish_date: topic?.publish_date ?? '',
	});
	const [errors, setErrors] = useState<FormErrors>({});

	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState('');

	const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
	const [memberQuery, setMemberQuery] = useState('');
	const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [addRole, setAddRole] = useState<MemberRole>('member');
	const [isManualAdd, setIsManualAdd] = useState(false);
	const [manualForm, setManualForm] = useState<ManualMemberForm>({
		ho_ten: '',
		staff_number: '',
		email: '',
		so_dien_thoai: '',
		chuc_vu: '',
		department_id: '',
	});
	const [manualRole, setManualRole] = useState<MemberRole>('member');
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

	const deptName = (id: string) =>
		departments.find((d) => d.id === id)?.name ?? '';

	const selectUser = (u: UserSuggestion) => {
		if (pendingMembers.some((m) => m.staff_number === (u.staff_number ?? '')))
			return;
		setPendingMembers((prev) => [
			...prev,
			{
				tempId: u.id,
				ho_ten: u.full_name,
				staff_number: u.staff_number != null ? String(u.staff_number) : '',
				email: u.email,
				username: u.username,
				department_id: u.department_id,
				department_name: deptName(u.department_id),
				role: addRole,
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

	const setField = (field: keyof TopicForm, val: string) => {
		setForm((p) => ({ ...p, [field]: val }));
		if (errors[field])
			setErrors((p) => {
				const n = { ...p };
				delete n[field];
				return n;
			});
	};

	const validate = (): boolean => {
		const e: FormErrors = {};
		const isPaper = form.article_type === 'bai_bao';
		if (!form.title.trim()) e.title = 'Vui lòng nhập tên đề tài';
		else if (form.title.length < 10)
			e.title = 'Tên đề tài quá ngắn (ít nhất 10 ký tự)';
		if (!form.round_id) e.round_id = 'Vui lòng chọn đợt nghiên cứu';
		if (!form.category_id) e.category_id = 'Vui lòng chọn phân loại';
		if (!isPaper && !form.level_id) e.level_id = 'Vui lòng chọn cấp độ';
		if (!form.department_id) e.department_id = 'Vui lòng chọn phòng ban / khoa';
		if (isPaper && !form.journal_name.trim())
			e.journal_name = 'Vui lòng nhập tên tập san / tạp chí';
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
			await onSave(form, pendingMembers);
		} catch (err: unknown) {
			setSaveError(err instanceof Error ? err.message : 'Lỗi lưu đề tài');
			setLoading(false);
		}
	};

	return {
		form,
		errors,
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
		setField,
		handleSubmit,
	};
}

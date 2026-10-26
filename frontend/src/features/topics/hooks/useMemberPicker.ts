import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { searchUsers, type UserSuggestion } from '../api/topicApi';
import type { MemberRole } from '../types/topic.type';
import type { PendingMember } from '../types/topicregister.type';
import { nextAddRole } from '../utils/topicHelpers';

export interface ManualForm {
	ho_ten: string;
	staff_number: string;
	phone_number: string;
	chuc_vu: string;
	department_id: string;
	role: MemberRole;
}

const EMPTY_MANUAL: ManualForm = {
	ho_ten: '',
	staff_number: '',
	phone_number: '',
	chuc_vu: '',
	department_id: '',
	role: 'member',
};

// Danh sách thành viên chờ gửi (tìm theo tài khoản hoặc nhập tay) — dùng chung
// cho Đăng ký đề tài và Nhập đề tài đã hoàn thành (props của RegisterMemberSection).
export function useMemberPicker() {
	const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
	const [memberQuery, setMemberQuery] = useState('');
	const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [addRole, setAddRole] = useState<MemberRole>('leader');
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [showManualForm, setShowManualForm] = useState(false);
	const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);
	const [manualErrors, setManualErrors] = useState<Record<string, string>>({});

	// Member search debounce
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

	const addMember = useCallback(
		(u: UserSuggestion) => {
			if (pendingMembers.some((m) => m.id === u.id)) return;
			const next = [
				...pendingMembers,
				{
					id: u.id,
					ho_ten: u.full_name,
					staff_number: u.staff_number != null ? String(u.staff_number) : '',
					email: u.email,
					chuc_vu: '',
					role: addRole,
				},
			];
			setPendingMembers(next);
			// Người thêm tiếp theo mặc định lần lượt Chủ nhiệm → Thư ký → Thành viên
			setAddRole(nextAddRole(next));
			setMemberQuery('');
			setSuggestions([]);
			setShowSuggestions(false);
		},
		[pendingMembers, addRole],
	);

	const removeMember = useCallback(
		(id: string) =>
			setPendingMembers((prev) => prev.filter((m) => m.id !== id)),
		[],
	);
	const changeRole = useCallback(
		(id: string, role: MemberRole) =>
			setPendingMembers((prev) =>
				prev.map((m) => (m.id === id ? { ...m, role } : m)),
			),
		[],
	);

	const addMemberManual = useCallback(() => {
		const errs: Record<string, string> = {};
		if (!manualForm.ho_ten.trim()) errs.ho_ten = 'Nhập họ tên';
		if (!manualForm.staff_number.trim())
			errs.staff_number = 'Nhập mã nhân viên';
		if (!manualForm.phone_number.trim())
			errs.phone_number = 'Nhập số điện thoại';
		if (!manualForm.chuc_vu.trim()) errs.chuc_vu = 'Nhập chức danh';
		if (Object.keys(errs).length) {
			setManualErrors(errs);
			return;
		}
		if (
			pendingMembers.some(
				(m) => m.staff_number === manualForm.staff_number.trim(),
			)
		) {
			showToast('error', 'Thành viên này đã được thêm.');
			return;
		}
		setPendingMembers((prev) => [
			...prev,
			{
				id: `manual_${Date.now()}`,
				ho_ten: manualForm.ho_ten.trim(),
				staff_number: manualForm.staff_number.trim(),
				phone_number: manualForm.phone_number.trim(),
				chuc_vu: manualForm.chuc_vu.trim(),
				department_id: manualForm.department_id || undefined,
				role: manualForm.role,
			},
		]);
		setManualForm(EMPTY_MANUAL);
		setManualErrors({});
		setShowManualForm(false);
		setMemberQuery('');
	}, [pendingMembers, manualForm]);

	// Về trạng thái ban đầu (xóa form / sau khi thêm vào danh sách)
	const resetMembers = useCallback(() => {
		setPendingMembers([]);
		setAddRole('leader');
		setMemberQuery('');
		setSuggestions([]);
		setShowSuggestions(false);
		setShowManualForm(false);
		setManualForm(EMPTY_MANUAL);
		setManualErrors({});
	}, []);

	return {
		pendingMembers,
		memberQuery,
		suggestions,
		showSuggestions,
		isSearching,
		addRole,
		addedIds: new Set(pendingMembers.map((m) => m.id)),
		setMemberQuery,
		setSuggestions,
		setShowSuggestions,
		setAddRole,
		addMember,
		removeMember,
		changeRole,
		showManualForm,
		manualForm,
		manualErrors,
		setShowManualForm,
		setManualForm: setManualForm as (v: ManualForm) => void,
		setManualErrors: setManualErrors as (v: Record<string, string>) => void,
		addMemberManual,
		resetMembers,
	};
}

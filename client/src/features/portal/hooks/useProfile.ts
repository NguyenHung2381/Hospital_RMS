import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import { getInitials } from '../../../shared/utils/helper';
import { getStoredUser } from '../../../shared/utils/storage';

interface ProfileData {
	id: string;
	username: string;
	full_name: string;
	email: string;
	staff_number: string | null;
	department_id: string | null;
	role: string | null;
	account_type: string;
	is_active: boolean;
	password_changed_at: string | null;
	created_at: string;
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
	admin: 'Quản trị viên',
	manager: 'Quản lý',
	member: 'Thành viên',
	viewer: 'Người xem',
};

export function fmtDate(iso: string | null) {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}


export function useProfile() {
	const storedUser = useMemo(() => getStoredUser<Record<string, string>>(), []);

	const fullName =
		storedUser?.full_name ?? storedUser?.username ?? 'Người dùng';
	const userRole = storedUser?.role ?? storedUser?.role_name ?? 'Thành viên';
	const initials = getInitials(fullName);

	const [profile, setProfile] = useState<ProfileData | null>(null);
	const [loadingProfile, setLoadingProfile] = useState(true);

	useEffect(() => {
		apiClient
			.get<ProfileData>('/users/me')
			.then((profileData) => setProfile(profileData))
			.catch(() => {
				if (storedUser) {
					setProfile({
						id: storedUser.id ?? '',
						username: storedUser.username ?? '',
						full_name: storedUser.full_name ?? storedUser.username ?? '',
						email: storedUser.email ?? '',
						staff_number: storedUser.staff_number ?? null,
						department_id: storedUser.department_id ?? null,
						role: storedUser.role ?? storedUser.role_name ?? null,
						account_type: storedUser.account_type ?? 'member',
						is_active: true,
						password_changed_at: null,
						created_at: new Date().toISOString(),
					});
				}
			})
			.finally(() => setLoadingProfile(false));
	}, [storedUser]);

	const [oldPwd, setOldPwd] = useState('');
	const [newPwd, setNewPwd] = useState('');
	const [confirmPwd, setConfirmPwd] = useState('');
	const [showOld, setShowOld] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [pwdError, setPwdError] = useState('');
	const [pwdSaving, setPwdSaving] = useState(false);
	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error';
	} | null>(null);

	function showToast(msg: string, type: 'success' | 'error') {
		setToast({ msg, type });
		setTimeout(() => setToast(null), 3500);
	}

	async function handleChangePassword() {
		setPwdError('');
		if (!oldPwd) {
			setPwdError('Vui lòng nhập mật khẩu hiện tại.');
			return;
		}
		if (newPwd.length < 6) {
			setPwdError('Mật khẩu mới phải có ít nhất 6 ký tự.');
			return;
		}
		if (newPwd !== confirmPwd) {
			setPwdError('Mật khẩu xác nhận không khớp.');
			return;
		}
		setPwdSaving(true);
		try {
			await apiClient.post('/auth/change-password', {
				old_password: oldPwd,
				new_password: newPwd,
			});
			setOldPwd('');
			setNewPwd('');
			setConfirmPwd('');
			showToast('Đổi mật khẩu thành công!', 'success');
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : 'Có lỗi xảy ra, vui lòng thử lại.';
			showToast(msg, 'error');
		} finally {
			setPwdSaving(false);
		}
	}

	return {
		fullName,
		userRole,
		initials,
		profile,
		loadingProfile,
		oldPwd,
		newPwd,
		confirmPwd,
		showOld,
		showNew,
		showConfirm,
		pwdError,
		pwdSaving,
		toast,
		setOldPwd,
		setNewPwd,
		setConfirmPwd,
		setShowOld,
		setShowNew,
		setShowConfirm,
		setPwdError,
		handleChangePassword,
	};
}

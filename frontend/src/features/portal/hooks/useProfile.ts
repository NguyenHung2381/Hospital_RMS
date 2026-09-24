import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import { getInitials } from '../../../shared/utils/helper';
import {
	clearAuth,
	getStoredUser,
	getToken,
	replaceTokens,
} from '../../../shared/utils/storage';
import {
	disable2FAApi,
	get2FAStatusApi,
	logoutAllApi,
	setup2FAApi,
	verifySetup2FAApi,
	type TwoFaSetup,
} from '../../auth/api/authApi';

interface ProfileData {
	id: string;
	username: string;
	full_name: string;
	email: string;
	staff_number: string | null;
	department_id: string | null;
	role: string | null;
	role_name?: string | null;
	is_active: boolean;
	password_changed_at: string | null;
	created_at: string;
}

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
		if (newPwd.length < 8 || !/[A-Za-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
			setPwdError('Mật khẩu mới phải có ít nhất 8 ký tự, gồm cả chữ và số.');
			return;
		}
		if (newPwd !== confirmPwd) {
			setPwdError('Mật khẩu xác nhận không khớp.');
			return;
		}
		setPwdSaving(true);
		try {
			// Server thu hồi mọi phiên (kể cả token đang dùng) rồi trả cặp token mới
			// cho phiên này — phải lưu lại, nếu không request kế tiếp sẽ bị 401.
			const tokens = await apiClient.post<{ access_token: string; refresh_token: string } | null>(
				'/auth/change-password',
				{ old_password: oldPwd, new_password: newPwd },
			);
			if (tokens?.access_token) replaceTokens(tokens.access_token, tokens.refresh_token);
			setOldPwd('');
			setNewPwd('');
			setConfirmPwd('');
			showToast('Đổi mật khẩu thành công! Các thiết bị khác đã bị đăng xuất.', 'success');
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : 'Có lỗi xảy ra, vui lòng thử lại.';
			showToast(msg, 'error');
		} finally {
			setPwdSaving(false);
		}
	}

	// ─── 2FA (TOTP) ──────────────────────────────────────────────────────────
	const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
	const [twoFaSetup, setTwoFaSetup] = useState<TwoFaSetup | null>(null);
	const [twoFaCode, setTwoFaCode] = useState('');
	const [twoFaSaving, setTwoFaSaving] = useState(false);
	const [twoFaError, setTwoFaError] = useState('');
	const [disablePwd, setDisablePwd] = useState('');
	const [showDisable2Fa, setShowDisable2Fa] = useState(false);

	useEffect(() => {
		const token = getToken();
		if (!token) return;
		get2FAStatusApi(token)
			.then((r) => setTwoFaEnabled(r.enabled))
			.catch(() => setTwoFaEnabled(false));
	}, []);

	async function handleStart2FASetup() {
		const token = getToken();
		if (!token) return;
		setTwoFaError('');
		setTwoFaSaving(true);
		try {
			setTwoFaSetup(await setup2FAApi(token));
		} catch (e: unknown) {
			// Lỗi ở bước NÀY xảy ra trước khi panel setup (có ô hiện twoFaError)
			// kịp mở — dùng toast chung thay vì twoFaError để người dùng thấy được.
			showToast(e instanceof Error ? e.message : 'Không thể khởi tạo 2FA', 'error');
		} finally {
			setTwoFaSaving(false);
		}
	}

	function handleCancel2FASetup() {
		setTwoFaSetup(null);
		setTwoFaCode('');
		setTwoFaError('');
	}

	async function handleConfirm2FASetup() {
		const token = getToken();
		if (!token || !twoFaCode.trim()) return;
		setTwoFaError('');
		setTwoFaSaving(true);
		try {
			await verifySetup2FAApi(token, twoFaCode.trim());
			setTwoFaEnabled(true);
			setTwoFaSetup(null);
			setTwoFaCode('');
			showToast('Đã bật xác thực 2 lớp!', 'success');
		} catch (e: unknown) {
			setTwoFaError(e instanceof Error ? e.message : 'Mã xác thực không đúng');
		} finally {
			setTwoFaSaving(false);
		}
	}

	async function handleDisable2FA() {
		const token = getToken();
		if (!token || !disablePwd) return;
		setTwoFaError('');
		setTwoFaSaving(true);
		try {
			await disable2FAApi(token, disablePwd);
			setTwoFaEnabled(false);
			setShowDisable2Fa(false);
			setDisablePwd('');
			showToast('Đã tắt xác thực 2 lớp', 'success');
		} catch (e: unknown) {
			setTwoFaError(e instanceof Error ? e.message : 'Mật khẩu không đúng');
		} finally {
			setTwoFaSaving(false);
		}
	}

	const [loggingOutAll, setLoggingOutAll] = useState(false);

	async function handleLogoutAll() {
		const token = getToken();
		if (!token) return;
		setLoggingOutAll(true);
		try {
			await logoutAllApi(token);
			clearAuth();
			window.location.href = '/login';
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : 'Có lỗi xảy ra, vui lòng thử lại.';
			showToast(msg, 'error');
			setLoggingOutAll(false);
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
		loggingOutAll,
		setOldPwd,
		setNewPwd,
		setConfirmPwd,
		setShowOld,
		setShowNew,
		setShowConfirm,
		setPwdError,
		handleChangePassword,
		handleLogoutAll,
		twoFaEnabled,
		twoFaSetup,
		twoFaCode,
		twoFaSaving,
		twoFaError,
		disablePwd,
		showDisable2Fa,
		setTwoFaCode,
		setDisablePwd,
		setShowDisable2Fa,
		handleStart2FASetup,
		handleCancel2FASetup,
		handleConfirm2FASetup,
		handleDisable2FA,
	};
}

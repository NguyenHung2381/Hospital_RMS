import { showToast } from '@/shared/utils/feedback';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import { getInitials } from '../../../shared/utils/helper';
import {
	clearAuth,
	getStoredUser,
	getToken,
	replaceAccessToken,
	updateStoredUser,
	type StoredUser,
} from '../../../shared/utils/storage';
import { checkPassword } from '../../../shared/utils/password';
import {
	disable2FAApi,
	get2FAStatusApi,
	logoutAllApi,
	regenerateBackupCodesApi,
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

	const [profile, setProfile] = useState<ProfileData | null>(null);

	const fullName =
		profile?.full_name || storedUser?.full_name || storedUser?.username || 'Người dùng';
	const userRole = storedUser?.role ?? storedUser?.role_name ?? 'Thành viên';
	const initials = getInitials(fullName);
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
	const [pwdError, setPwdError] = useState('');
	const [pwdSaving, setPwdSaving] = useState(false);

	// null = không đang sửa
	const [nameDraft, setNameDraft] = useState<string | null>(null);
	const [nameSaving, setNameSaving] = useState(false);

	async function handleSaveName() {
		const full_name = nameDraft?.trim() ?? '';
		if (!full_name) {
			showToast('error', 'Họ và tên không được để trống.');
			return;
		}
		setNameSaving(true);
		try {
			await apiClient.patch('/users/me', { full_name });
			setProfile((p) => (p ? { ...p, full_name } : p));
			updateStoredUser({ full_name });
			setNameDraft(null);
			showToast('success', 'Đã cập nhật họ và tên.');
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Có lỗi xảy ra.');
		} finally {
			setNameSaving(false);
		}
	}

	async function handleChangePassword() {
		setPwdError('');
		if (!oldPwd) {
			setPwdError('Vui lòng nhập mật khẩu hiện tại.');
			return;
		}
		const policyError = checkPassword(newPwd, getStoredUser<StoredUser>()?.username);
		if (policyError) {
			setPwdError(policyError);
			return;
		}
		if (newPwd === oldPwd) {
			setPwdError('Mật khẩu mới phải khác mật khẩu hiện tại.');
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
			const tokens = await apiClient.post<{ access_token: string } | null>(
				'/auth/change-password',
				{ old_password: oldPwd, new_password: newPwd },
			);
			if (tokens?.access_token) replaceAccessToken(tokens.access_token);
			setOldPwd('');
			setNewPwd('');
			setConfirmPwd('');
			showToast('success', 'Đổi mật khẩu thành công! Các thiết bị khác đã bị đăng xuất.');
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : 'Có lỗi xảy ra, vui lòng thử lại.';
			showToast('error', msg);
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
	// Mã khôi phục vừa sinh — server chỉ trả 1 lần, hiển thị tới khi người dùng đóng
	const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
	const [backupRemaining, setBackupRemaining] = useState(0);
	const [showRegenBackup, setShowRegenBackup] = useState(false);
	const [regenPwd, setRegenPwd] = useState('');

	useEffect(() => {
		const token = getToken();
		if (!token) return;
		get2FAStatusApi(token)
			.then((r) => {
				setTwoFaEnabled(r.enabled);
				setBackupRemaining(r.backup_codes_remaining ?? 0);
			})
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
			showToast('error', e instanceof Error ? e.message : 'Không thể khởi tạo 2FA');
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
			const codes = await verifySetup2FAApi(token, twoFaCode.trim());
			setBackupCodes(codes);
			setBackupRemaining(codes.length);
			setTwoFaEnabled(true);
			// Hết diện bắt buộc bật 2FA — tắt banner nhắc
			updateStoredUser({ twofa_state: null, twofa_deadline: null });
			setTwoFaSetup(null);
			setTwoFaCode('');
			showToast('success', 'Đã bật xác thực 2 lớp!');
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
			setBackupCodes(null);
			setBackupRemaining(0);
			setShowDisable2Fa(false);
			setDisablePwd('');
			showToast('success', 'Đã tắt xác thực 2 lớp');
		} catch (e: unknown) {
			setTwoFaError(e instanceof Error ? e.message : 'Mật khẩu không đúng');
		} finally {
			setTwoFaSaving(false);
		}
	}

	async function handleRegenerateBackupCodes() {
		const token = getToken();
		if (!token || !regenPwd) return;
		setTwoFaError('');
		setTwoFaSaving(true);
		try {
			const codes = await regenerateBackupCodesApi(token, regenPwd);
			setBackupCodes(codes);
			setBackupRemaining(codes.length);
			setShowRegenBackup(false);
			setRegenPwd('');
			showToast('success', 'Đã tạo bộ mã khôi phục mới — bộ cũ đã mất hiệu lực');
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
			showToast('error', msg);
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
		pwdError,
		pwdSaving,
		loggingOutAll,
		setOldPwd,
		setNewPwd,
		setConfirmPwd,
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
		backupCodes,
		backupRemaining,
		showRegenBackup,
		regenPwd,
		setShowRegenBackup,
		setRegenPwd,
		dismissBackupCodes: () => setBackupCodes(null),
		handleRegenerateBackupCodes,
		nameDraft,
		nameSaving,
		setNameDraft,
		handleSaveName,
	};
}

import { useEffect, useState } from 'react';
import { WarnSvg } from '@/assets/icons';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { getRegistrationSettings, updateRegistrationSettings, type RegistrationSettings } from '../api/courseApi';
import styles from './CourseRegisterLinkModal.module.css';

/**
 * Công tắc "Gửi mã OTP xác nhận về email" của trang đăng ký công khai. Ghi chung cấu hình
 * TRAINING_REGISTRATION_EMAIL_OTP với trang Cấu hình hệ thống; chỉ người có quyền duyệt
 * ghi danh (courses:approve) mới đổi được, người khác chỉ xem trạng thái.
 */
export function RegistrationOtpSwitch() {
	const canEdit = usePermission().has('courses:approve');
	const [settings, setSettings] = useState<RegistrationSettings | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let alive = true;
		getRegistrationSettings()
			.then((s) => alive && setSettings(s))
			.catch(() => alive && setLoadError(true));
		return () => {
			alive = false;
		};
	}, []);

	const toggle = async (on: boolean) => {
		if (!settings || saving) return;
		setSaving(true);
		// Đổi ngay trên giao diện, lỗi thì trả lại như cũ
		setSettings({ ...settings, email_otp_required: on });
		try {
			setSettings(await updateRegistrationSettings({ email_otp_required: on }));
			showToast('success', on ? 'Đã bật gửi mã OTP xác nhận về email' : 'Đã tắt gửi mã OTP xác nhận về email');
		} catch (err) {
			setSettings(settings);
			showToast('error', err instanceof Error ? err.message : 'Không lưu được cài đặt');
		} finally {
			setSaving(false);
		}
	};

	if (loadError) return null;
	const on = settings?.email_otp_required ?? false;

	return (
		<div className={styles.setting}>
			<label className={styles.settingRow}>
				<span className={styles.settingText}>
					<span className={styles.settingTitle}>Gửi mã OTP xác nhận về email</span>
					<span className={styles.settingHint}>
						{on
							? 'Học viên phải nhập mã 6 số gửi về email trước khi gửi đăng ký; thư xác nhận gửi tới email đã xác minh.'
							: 'Học viên gửi đăng ký không cần xác minh email; hệ thống không gửi thư xác nhận.'}
					</span>
				</span>
				<input
					type='checkbox'
					role='switch'
					className={styles.switchInput}
					checked={on}
					disabled={!settings || !canEdit || saving}
					onChange={(e) => void toggle(e.target.checked)}
					title={canEdit ? undefined : 'Cần quyền duyệt ghi danh khóa học để thay đổi'}
				/>
				<span
					className={styles.switchTrack}
					aria-hidden='true'
				/>
			</label>
			{settings && on && !settings.mail_enabled && (
				<div className={styles.warn}>
					<WarnSvg />
					<span>Gửi email toàn hệ thống đang tắt nên học viên sẽ không nhận được mã. Bật "Gửi email" trong Cấu hình hệ thống hoặc tắt công tắc này.</span>
				</div>
			)}
		</div>
	);
}

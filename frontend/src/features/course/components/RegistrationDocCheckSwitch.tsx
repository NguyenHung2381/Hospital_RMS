import { useEffect, useState } from 'react';
import { WarnSvg } from '@/assets/icons';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { getRegistrationSettings, updateRegistrationSettings, type RegistrationSettings } from '../api/courseApi';
import styles from './CourseRegisterLinkModal.module.css';

/**
 * Công tắc "Tự kiểm tra file hồ sơ" (OCR / mã QR) của đăng ký khóa ĐTLT. Ghi chung cấu hình
 * TRAINING_REGISTRATION_DOC_CHECK với trang Cấu hình hệ thống; chỉ người có quyền duyệt ghi danh
 * (courses:approve) mới đổi được. Tắt: kết quả ẩn ở mọi màn hình, file nộp trong lúc tắt được
 * kiểm khi bật lại.
 */
export function RegistrationDocCheckSwitch() {
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
		setSettings({ ...settings, doc_check_enabled: on });
		try {
			setSettings(await updateRegistrationSettings({ doc_check_enabled: on }));
			showToast('success', on ? 'Đã bật tự kiểm tra file hồ sơ' : 'Đã tắt tự kiểm tra file hồ sơ');
		} catch (err) {
			setSettings(settings);
			showToast('error', err instanceof Error ? err.message : 'Không lưu được cài đặt');
		} finally {
			setSaving(false);
		}
	};

	if (loadError) return null;
	const on = settings?.doc_check_enabled ?? true;

	return (
		<div className={styles.setting}>
			<label className={styles.settingRow}>
				<span className={styles.settingText}>
					<span className={styles.settingTitle}>Tự kiểm tra file hồ sơ</span>
					<span className={styles.settingHint}>
						{on
							? 'Hệ thống tự đọc file (OCR, mã QR) và cảnh báo khi có vẻ nộp nhầm loại, thiếu mặt CCCD, trang trắng hoặc trùng file. Chỉ cảnh báo, không tự từ chối.'
							: 'Không hiện cảnh báo tự kiểm tra. File nộp trong lúc tắt sẽ được kiểm khi bật lại.'}
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
			{settings && on && !settings.doc_check_ocr && (
				<div className={styles.warn}>
					<WarnSvg />
					<span>Máy chủ chưa cài OCR (Tesseract) nên chỉ kiểm được PDF có sẵn chữ và ảnh có mã QR.</span>
				</div>
			)}
		</div>
	);
}

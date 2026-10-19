import { useEffect, useState } from 'react';
import { UserCheckSvg } from '@/assets/icons';
import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { InlineLoading } from '@/shared/components/Loading';
import { formatDateOr } from '@/shared/utils';
import { showToast } from '@/shared/utils/feedback';
import { searchMentors } from '../../staff-license/api/staffLicenseApi';
import type { StaffMentor } from '../../staff-license/types/staffLicense.type';
import { createLecturersFromStaff } from '../api/lecturerApi';
import styles from '../pages/Lecturers.module.css';

// "Thêm giảng viên từ nhân sự có CCHN": tìm theo MNV / tên / số CCHN, tick nhiều
// người rồi tạo giảng viên nội viện gắn tài khoản (thông tin lấy từ hồ sơ CCHN).
export function LecturerFromStaffModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
	const [search, setSearch] = useState('');
	const [list, setList] = useState<StaffMentor[]>([]);
	const [picked, setPicked] = useState<Map<string, StaffMentor>>(new Map());
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const t = setTimeout(() => {
			setLoading(true);
			searchMentors({ search: search.trim() || undefined, licensed_only: true, limit: 50 })
				.then((rows) => !cancelled && setList(rows))
				.catch(() => !cancelled && showToast('error', 'Không tải được danh sách nhân sự'))
				.finally(() => !cancelled && setLoading(false));
		}, 300);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [search]);

	const toggle = (m: StaffMentor) =>
		setPicked((prev) => {
			const next = new Map(prev);
			if (next.has(m.user_id)) next.delete(m.user_id);
			else next.set(m.user_id, m);
			return next;
		});

	const submit = async () => {
		setSaving(true);
		try {
			const res = await createLecturersFromStaff([...picked.keys()]);
			const skippedNote = res.skipped.length
				? ` · bỏ qua ${res.skipped.length}: ${res.skipped.map((s) => `${s.full_name ?? s.user_id} (${s.reason})`).join(', ')}`
				: '';
			showToast(res.created.length ? 'success' : 'error', `Đã thêm ${res.created.length} giảng viên${skippedNote}`);
			onDone();
			onClose();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thêm giảng viên thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UserCheckSvg />}
			title='Thêm giảng viên từ nhân sự có CCHN'
			subtitle='Tên, liên hệ, ngày sinh lấy từ tài khoản; chuyên môn lấy từ hồ sơ CCHN'
			size='lg'
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={submit}
					loading={saving}
					disabled={picked.size === 0}
					confirmLabel={`Thêm ${picked.size || ''} giảng viên`}
				/>
			}
		>
			<FormField label='Tìm nhân sự'>
				<input
					className={styles.formInput}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Gõ MNV, họ tên hoặc số CCHN…'
					autoFocus
				/>
			</FormField>
			<div className={styles.staffPicker}>
				{loading ? (
					<InlineLoading label='Đang tìm…' />
				) : list.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyDesc}>Không có nhân sự có CCHN khớp từ khoá</div>
					</div>
				) : (
					list.map((m) => (
						<label
							key={m.user_id}
							className={styles.staffRow}
						>
							<input
								type='checkbox'
								checked={picked.has(m.user_id)}
								onChange={() => toggle(m)}
							/>
							<div>
								<div className={styles.personName}>
									{m.full_name} · MNV {m.staff_number}
								</div>
								<div className={styles.descText}>
									{m.department_name ?? 'Chưa có khoa'} · CCHN {m.license_no} ({formatDateOr(m.issued_date)})
								</div>
								{m.practice_scope && <div className={styles.descText}>{m.practice_scope}</div>}
							</div>
						</label>
					))
				)}
			</div>
			{picked.size > 0 && (
				<div
					className={styles.descText}
					style={{ marginTop: 8 }}
				>
					Đã chọn: {[...picked.values()].map((m) => m.full_name).join(', ')}
				</div>
			)}
		</Modal>
	);
}

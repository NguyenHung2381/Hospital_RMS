import { useState } from 'react';
import { DownloadSvg } from '@/assets/icons';
import { Modal, ModalActions } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { exportCourseEnrollments, type EnrollmentExportMode } from '../api/enrollmentExportApi';
import { ENROLLMENT_STATUS_CFG, type EnrollmentStatus } from '../types/course.type';
import styles from './EnrollmentExportModal.module.css';

export interface ExportProgram {
	id: string;
	code: string | null;
	name: string;
}

// Thứ tự hiển thị các trạng thái ghi danh để chọn
const STATUS_ORDER: EnrollmentStatus[] = ['approved', 'pending', 'waitlisted', 'rejected'];

/**
 * Xuất danh sách học viên của khóa ra Excel: chọn "toàn khóa" (một danh sách) hoặc
 * "theo từng chương trình" (mỗi chương trình một sheet), lọc theo chương trình và trạng thái.
 */
export function EnrollmentExportModal({
	courseId,
	courseName,
	programs,
	onClose,
}: {
	courseId: string;
	courseName: string;
	programs: ExportProgram[];
	onClose: () => void;
}) {
	const hasPrograms = programs.length > 0;
	const [mode, setMode] = useState<EnrollmentExportMode>('course');
	const [programIds, setProgramIds] = useState<string[]>(() => programs.map((p) => p.id));
	const [statuses, setStatuses] = useState<EnrollmentStatus[]>(['approved']);
	const [busy, setBusy] = useState(false);

	const showPrograms = programs.length >= 2;
	const allPrograms = programIds.length === programs.length;

	const toggleProgram = (id: string) =>
		setProgramIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
	const toggleStatus = (s: EnrollmentStatus) =>
		setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

	// Lý do khóa nút xuất (nếu có)
	const blockReason = !statuses.length
		? 'Chọn ít nhất một trạng thái.'
		: mode === 'program' && !programIds.length
			? 'Chọn ít nhất một chương trình.'
			: null;

	const submit = async () => {
		if (blockReason || busy) return;
		setBusy(true);
		try {
			const blob = await exportCourseEnrollments(courseId, {
				mode,
				// Chọn hết thì không gửi để vẫn lấy cả học viên chưa xếp chương trình
				...(showPrograms && !allPrograms ? { program_ids: programIds } : {}),
				statuses,
			});
			saveBlob(blob, `danh-sach-hoc-vien-${fileSlug(courseName) || 'khoa-hoc'}.xlsx`);
			onClose();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không xuất được danh sách học viên');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={busy ? () => undefined : onClose}
			title='Xuất danh sách học viên'
			subtitle={courseName}
			size='sm'
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => void submit()}
					loading={busy}
					disabled={!!blockReason}
					confirmIcon={<DownloadSvg />}
					confirmLabel={busy ? 'Đang xuất…' : 'Xuất Excel'}
				/>
			}
		>
			<div className={styles.body}>
				{hasPrograms && (
					<fieldset className={styles.group}>
						<legend className={styles.legend}>Cách xuất</legend>
						<label className={styles.option}>
							<input
								type='radio'
								name='enrollment-export-mode'
								checked={mode === 'course'}
								onChange={() => setMode('course')}
							/>
							<span>Toàn khóa — một danh sách</span>
						</label>
						<label className={styles.option}>
							<input
								type='radio'
								name='enrollment-export-mode'
								checked={mode === 'program'}
								onChange={() => setMode('program')}
							/>
							<span>Theo từng chương trình — mỗi chương trình một sheet</span>
						</label>
					</fieldset>
				)}

				{showPrograms && (
					<fieldset className={styles.group}>
						<legend className={styles.legend}>
							Chương trình
							<span className={styles.legendTools}>
								<button
									type='button'
									className={styles.link}
									onClick={() => setProgramIds(programs.map((p) => p.id))}
									disabled={allPrograms}
								>
									Chọn tất cả
								</button>
								<button
									type='button'
									className={styles.link}
									onClick={() => setProgramIds([])}
									disabled={!programIds.length}
								>
									Bỏ chọn
								</button>
							</span>
						</legend>
						<div className={styles.list}>
							{programs.map((p) => (
								<label key={p.id} className={styles.option}>
									<input type='checkbox' checked={programIds.includes(p.id)} onChange={() => toggleProgram(p.id)} />
									<span>{p.code ? `${p.code} – ${p.name}` : p.name}</span>
								</label>
							))}
						</div>
					</fieldset>
				)}

				<fieldset className={styles.group}>
					<legend className={styles.legend}>Trạng thái ghi danh</legend>
					<div className={styles.statusRow}>
						{STATUS_ORDER.map((s) => (
							<label key={s} className={styles.option}>
								<input type='checkbox' checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
								<span>{ENROLLMENT_STATUS_CFG[s].label}</span>
							</label>
						))}
					</div>
				</fieldset>

				{blockReason && <p className={styles.reason}>{blockReason}</p>}
			</div>
		</Modal>
	);
}

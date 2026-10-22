import { useEffect, useState } from 'react';
import { CalendarSvg } from '@/assets/icons';
import { DatePicker, Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { formatDateOr } from '@/shared/utils';
import { showToast } from '@/shared/utils/feedback';
import { openClass, setClassDates, suggestClassDates, type ClassDateSuggestion } from '../api/courseApi';
import type { CourseProgramLink } from '../types/course.type';
import styles from '../pages/Courses.module.css';

/**
 * Mở lớp (mode 'open') hoặc sửa ngày học của lớp đã mở ('dates'). Ngày điền sẵn theo
 * gợi ý của hệ thống (thời lượng / tiết chương trình, bỏ T7, CN, ngày lễ) — sửa được.
 */
export function ClassDatesModal({
	courseId,
	link,
	mode,
	onClose,
	onSaved,
}: {
	courseId: string;
	link: CourseProgramLink;
	mode: 'open' | 'dates';
	onClose: () => void;
	onSaved: () => void;
}) {
	const [start, setStart] = useState(link.class_start?.slice(0, 10) ?? '');
	const [end, setEnd] = useState(link.class_end?.slice(0, 10) ?? '');
	const [hint, setHint] = useState<ClassDateSuggestion | null>(null);
	const [saving, setSaving] = useState(false);
	const label = link.program_code ?? link.program_name;

	useEffect(() => {
		suggestClassDates(courseId, link.program_id)
			.then((s) => {
				setHint(s);
				// Lớp chưa có ngày thì điền sẵn gợi ý
				setStart((v) => v || s.start_date);
				setEnd((v) => v || s.end_date || '');
			})
			.catch(() => {});
	}, [courseId, link.program_id]);

	const save = async () => {
		if (start && end && end < start) return showToast('error', 'Ngày kết thúc phải sau ngày bắt đầu');
		setSaving(true);
		try {
			const dates = { start_date: start || null, end_date: end || null };
			if (mode === 'open') {
				const r = await openClass(courseId, link.program_id, dates);
				showToast('success', `Đã mở lớp ${label} với ${r.trainees} học viên`);
			} else {
				await setClassDates(courseId, link.program_id, dates);
				showToast('success', 'Đã lưu ngày học của lớp');
			}
			onSaved();
			onClose();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<CalendarSvg />}
			title={mode === 'open' ? `Mở lớp ${label}` : `Ngày học lớp ${label}`}
			subtitle={
				mode === 'open'
					? `${link.class_approved} học viên đã duyệt (tối thiểu ${link.class_min}) — học viên có email sẽ được báo lớp đã mở`
					: link.program_name
			}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={save}
					loading={saving}
					confirmLabel={mode === 'open' ? 'Mở lớp' : 'Lưu ngày học'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				<FormField label='Ngày bắt đầu'>
					<DatePicker value={start} onChange={setStart} max={end || undefined} />
				</FormField>
				<FormField label='Ngày kết thúc'>
					<DatePicker value={end} onChange={setEnd} min={start || undefined} />
				</FormField>
			</div>
			{hint && (
				<div className={styles.classDateHint}>
					Gợi ý: {formatDateOr(hint.start_date)} → {formatDateOr(hint.end_date, '?')}
					{hint.workdays != null && ` · ${hint.workdays} ngày học`}
					{hint.needed_days != null && ` (cần ${hint.needed_days} ngày cho tổng số tiết)`}. Bỏ T7, CN và ngày lễ ở
					Cấu hình hệ thống.
					{(start !== hint.start_date || end !== (hint.end_date ?? '')) && (
						<>
							{' '}
							<button
								type='button'
								className={styles.linkBtn}
								onClick={() => {
									setStart(hint.start_date);
									setEnd(hint.end_date ?? '');
								}}
							>
								Dùng gợi ý
							</button>
						</>
					)}
					{hint.warning && <div className={styles.hintWarn}>{hint.warning}</div>}
				</div>
			)}
		</Modal>
	);
}

import { useEffect, useMemo, useState } from 'react';
import { UserPlusSvg } from '@/assets/icons';
import { Modal, ModalActions, SearchableSelect } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { showToast } from '@/shared/utils/feedback';
import { getProgramLinks } from '../api/courseApi';
import { fetchEnrollCandidates, registerCandidate, type SimpleItem } from '../hooks/useCourseDetail';
import type { Course, CourseProgramLink } from '../types/course.type';
import styles from '../pages/Courses.module.css';
import m from '@/shared/components/Modal/Modal.module.css';
import { CfgField, CustomFields, useFormConfig, type CustomValues } from '@/shared/formConfig';

const programLabel = (p: CourseProgramLink) => (p.program_code ? `${p.program_code} — ${p.program_name}` : p.program_name);

/**
 * Thêm 1 hồ sơ thực hành GPHN: chọn đợt (khóa GPHN), chương trình, học viên.
 * Ghi danh hộ được duyệt luôn — xếp lịch vòng là bước sau (ở trang hồ sơ).
 */
export function AddPracticeRecordModal({
	courses,
	defaultCourseId,
	onClose,
	onAdded,
}: {
	courses: Course[];
	defaultCourseId?: string;
	onClose: () => void;
	/** id hồ sơ vừa tạo. */
	onAdded: (enrollmentId: string) => void;
}) {
	const [courseId, setCourseId] = useState(defaultCourseId || courses[0]?.id || '');
	const [links, setLinks] = useState<CourseProgramLink[]>([]);
	const [programId, setProgramId] = useState('');
	const [candidates, setCandidates] = useState<SimpleItem[]>([]);
	const [candidateId, setCandidateId] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	// Nhãn / bắt buộc / trường tùy chỉnh theo Cấu hình form (hồ sơ thực hành GPHN)
	const cfg = useFormConfig('enrollment', 'practice');
	const [custom, setCustom] = useState<CustomValues>({});
	const [errors, setErrors] = useState<Record<string, string>>({});

	useEffect(() => {
		fetchEnrollCandidates()
			.then(setCandidates)
			.catch(() => setCandidates([]));
	}, []);

	useEffect(() => {
		if (!courseId) return;
		let cancelled = false;
		getProgramLinks(courseId)
			.then((r) => {
				if (cancelled) return;
				setLinks(r);
				setProgramId(r.length === 1 ? r[0].program_id : '');
			})
			.catch(() => !cancelled && setLinks([]));
		return () => {
			cancelled = true;
		};
	}, [courseId]);

	const courseOptions = useMemo(() => courses.map((c) => ({ id: c.id, name: c.name })), [courses]);
	const needProgram = links.length > 0 && !programId;

	const save = async () => {
		const errs = cfg.validate({ program_id: programId }, custom, { mode: 'edit' });
		setErrors(errs);
		if (Object.values(errs).some(Boolean)) return;
		setSaving(true);
		setError('');
		try {
			const out = await registerCandidate(courseId, candidateId, programId || undefined, {
				custom,
				form_variant: 'practice',
			});
			showToast('success', 'Đã thêm hồ sơ — bước tiếp: xếp lịch thực hành');
			onAdded(out.id);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Thêm hồ sơ thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UserPlusSvg />}
			title='Thêm hồ sơ thực hành GPHN'
			subtitle='Hồ sơ được duyệt luôn, xếp lịch vòng ở bước sau'
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={save}
					loading={saving}
					disabled={!courseId || !candidateId || needProgram}
					confirmLabel='Thêm hồ sơ'
				/>
			}
		>
			{error && <div className={styles.errorBanner}>{error}</div>}
			<div className={styles.formGrid2}>
				<FormField
					label='Đợt thực hành'
					style={{ gridColumn: '1 / -1' }}
				>
					<SearchableSelect
						options={courseOptions}
						value={courseId}
						onChange={setCourseId}
						placeholder='Chọn đợt (khóa GPHN)'
					/>
				</FormField>
				<CfgField
					cfg={cfg}
					name='program_id'
					error={errors.program_id}
					label='Chương trình thực hành'
					style={{ gridColumn: '1 / -1' }}
				>
					<select
						className={styles.formInput}
						value={programId}
						onChange={(e) => {
							setProgramId(e.target.value);
							setErrors((er) => ({ ...er, program_id: '' }));
						}}
						disabled={!links.length}
					>
						<option value=''>{links.length ? '-- Chọn chương trình --' : 'Đợt chưa gắn chương trình'}</option>
						{links.map((p) => (
							<option
								key={p.program_id}
								value={p.program_id}
							>
								{programLabel(p)}
							</option>
						))}
					</select>
				</CfgField>
				<FormField
					label='Học viên'
					style={{ gridColumn: '1 / -1' }}
				>
					<SearchableSelect
						options={candidates}
						value={candidateId}
						onChange={setCandidateId}
						placeholder='Gõ tên để tìm học viên / nhân viên nội viện'
					/>
				</FormField>
				<CustomFields
					cfg={cfg}
					value={custom}
					onChange={setCustom}
					errors={errors}
					sectionClassName={m.formSectionTitle}
					inputClassName={styles.formInput}
				/>
			</div>
			<div className={styles.hint}>
				Chưa có trong danh sách? Thêm ở mục Học viên trước, hoặc nhập cả sổ thực hành bằng "Nhập sổ Excel".
			</div>
		</Modal>
	);
}

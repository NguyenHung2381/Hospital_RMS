import { useCallback, useEffect, useMemo, useState } from 'react';
import { DatePicker } from '@/shared/components';
import { PlusSvg, TrashSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { showToast } from '@/shared/utils/feedback';
import {
	addRotationSegment,
	generateRotations,
	getRotations,
	refreshRotationMentor,
	removeRotation,
	retakeRotation,
	scheduleRotations,
	updateRotation,
} from '../api/courseApi';
import {
	ROTATION_RESULT_LABEL,
	type EnrollmentRotation,
	type RotationList,
	type RotationResult,
	type RotationUpdate,
} from '../types/course.type';
import { MentorPicker } from './MentorPicker';
import { RotationDateRange } from './RotationDateRange';
import { savePracticeDocument } from '../utils/practiceDocuments';
import styles from '../pages/Courses.module.css';

interface Department {
	id: string;
	name: string;
}

const day = (v: string | null) => (v ? v.slice(0, 10) : '');

// Vòng thực hành GPHN của 1 hồ sơ: sinh vòng theo chương trình, xếp lịch nối
// tiếp, mỗi vòng chọn khoa / ngày / người hướng dẫn / kết quả. Mỗi thay đổi lưu
// ngay; cảnh báo (đỏ) chỉ để lưu ý, không chặn.
export function RotationsPanel({
	enrollmentId,
	who,
	hasProgram,
	enrollmentStart,
	onChanged,
}: {
	enrollmentId: string;
	/** Mã thực hành / tên học viên — đặt tên file phiếu nhận xét. */
	who: string;
	hasProgram: boolean;
	enrollmentStart: string | null;
	onChanged: () => void;
}) {
	const [data, setData] = useState<RotationList | null>(null);
	const [departments, setDepartments] = useState<Department[]>([]);
	const [busy, setBusy] = useState(false);
	const [startDate, setStartDate] = useState(day(enrollmentStart));

	const load = useCallback(
		() =>
			getRotations(enrollmentId)
				.then(setData)
				.catch((err) => showToast('error', err instanceof Error ? err.message : 'Không tải được vòng thực hành')),
		[enrollmentId],
	);
	useEffect(() => {
		load();
		apiClient
			.get<{ data: Department[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
	}, [load]);

	const run = async (action: () => Promise<unknown>, okMsg?: string) => {
		setBusy(true);
		try {
			await action();
			if (okMsg) showToast('success', okMsg);
			await load();
			onChanged();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thao tác thất bại');
		} finally {
			setBusy(false);
		}
	};
	const save = (id: string, patch: RotationUpdate) => run(() => updateRotation(id, patch));

	const rows = useMemo(() => data?.rows ?? [], [data]);
	const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
	// Dòng cuối của mỗi vòng chia nhiều khoa — đặt nút "Thêm khoa" ở đó
	const lastOfSplit = useMemo(() => {
		const m = new Map<string, string>();
		for (const r of rows) if (r.allow_split && r.lesson_id) m.set(r.lesson_id, r.id);
		return new Set(m.values());
	}, [rows]);

	if (!hasProgram)
		return <div className={styles.subEmpty}>Chọn chương trình (và lưu hồ sơ) để sinh các vòng thực hành.</div>;
	if (!data) return <div className={styles.subEmpty}>Đang tải vòng thực hành…</div>;

	const generate = (replace: boolean) => {
		if (replace && !window.confirm('Sinh lại sẽ XOÁ toàn bộ vòng hiện có (kể cả người hướng dẫn, kết quả). Tiếp tục?'))
			return;
		run(() => generateRotations(enrollmentId, replace), 'Đã sinh vòng theo chương trình');
	};

	const schedule = () => {
		if (!startDate) return showToast('error', 'Chọn ngày bắt đầu thực hành trước');
		if (rows.some((r) => r.start_date) && !window.confirm('Xếp lại lịch sẽ ghi đè ngày của mọi vòng. Tiếp tục?')) return;
		run(async () => {
			const out = await scheduleRotations(enrollmentId, startDate);
			showToast(
				out.skipped ? 'error' : 'success',
				out.skipped
					? `Đã xếp ${out.scheduled} vòng; dừng ở vòng chưa có thời lượng (nhập thời lượng rồi xếp lại).`
					: `Đã xếp lịch ${out.scheduled} vòng`,
			);
		});
	};

	const deptOptions = (r: EnrollmentRotation) => {
		const allowed = r.allowed_department_ids.length ? r.allowed_department_ids : departments.map((d) => d.id);
		const ids = r.department_id && !allowed.includes(r.department_id) ? [r.department_id, ...allowed] : allowed;
		return ids.map((id) => ({ id, name: deptName.get(id) ?? r.department_name ?? id }));
	};

	return (
		<div>
			<div className={styles.subToolbar}>
				{rows.length === 0 ? (
					<button
						type='button'
						className={styles.btnGhost}
						disabled={busy}
						onClick={() => generate(false)}
					>
						<PlusSvg /> Sinh vòng theo chương trình
					</button>
				) : (
					<>
						<span className={styles.hint}>Bắt đầu thực hành</span>
						<DatePicker
							value={startDate}
							onChange={setStartDate}
							style={{ width: 170, flex: '0 0 auto' }}
						/>
						<button
							type='button'
							className={styles.btnGhost}
							disabled={busy}
							onClick={schedule}
							title='Xếp các vòng nối tiếp nhau từ ngày bắt đầu, theo thời lượng từng vòng'
						>
							Tự xếp lịch toàn bộ
						</button>
						<button
							type='button'
							className={styles.btnSmall}
							disabled={busy}
							onClick={() => generate(true)}
						>
							Sinh lại theo chương trình
						</button>
					</>
				)}
			</div>
			{data.rounds.length === 0 && (
				<div className={styles.hint}>
					Chương trình chưa có vòng thực hành (bài học loại "Vòng thực hành") — thêm ở màn Chương trình đào tạo.
				</div>
			)}

			<div className={styles.subList}>
				{rows.map((r, i) => {
					const prevEnd = i > 0 ? day(rows[i - 1].end_date) || null : null;
					return (
						<div
							key={r.id}
							className={styles.subRow}
							style={{ display: 'block', borderLeft: r.warnings.length ? '3px solid #b42318' : undefined }}
						>
							<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
								<div
									className={styles.subRowName}
									style={{ flex: '1 1 160px' }}
								>
									{i + 1}. {r.round_title ?? 'Vòng'}
									{r.attempt_no > 1 && <span className={styles.hint}> · học lại lần {r.attempt_no}</span>}
								</div>
								<select
									className={styles.subSelect}
									style={{ flex: '1 1 200px' }}
									value={r.department_id ?? ''}
									disabled={busy}
									onChange={(e) => save(r.id, { department_id: e.target.value || null })}
								>
									<option value=''>-- Chọn khoa --</option>
									{deptOptions(r).map((d) => (
										<option
											key={d.id}
											value={d.id}
										>
											{d.name}
										</option>
									))}
								</select>
								<select
									className={styles.subSelect}
									style={{ flex: '0 1 170px' }}
									value={r.result}
									disabled={busy}
									onChange={(e) => save(r.id, { result: e.target.value as RotationResult })}
								>
									{Object.entries(ROTATION_RESULT_LABEL).map(([v, label]) => (
										<option
											key={v}
											value={v}
										>
											{label}
										</option>
									))}
								</select>
								{r.result === 'fail' && !rows.some((x) => x.lesson_id === r.lesson_id && x.attempt_no > r.attempt_no) && (
									<button
										type='button'
										className={styles.btnSmall}
										disabled={busy}
										onClick={() => run(() => retakeRotation(r.id), 'Đã thêm lượt học lại')}
										title='Thêm 1 lượt học lại vòng này ngay sau dòng hiện tại'
									>
										Học lại
									</button>
								)}
								<button
									type='button'
									className={styles.btnSmall}
									disabled={busy}
									title='Tải phiếu nhận xét quá trình thực hành của vòng này (.docx)'
									onClick={() =>
										savePracticeDocument(enrollmentId, 'phieu-nhan-xet', who, {
											id: r.id,
											label: r.department_name || r.round_title || `vong-${i + 1}`,
										})
									}
								>
									Phiếu nhận xét
								</button>
								<button
									type='button'
									className={styles.actionBtn}
									title='Xoá dòng này'
									disabled={busy}
									onClick={() => window.confirm('Xoá vòng này khỏi hồ sơ?') && run(() => removeRotation(r.id))}
								>
									<TrashSvg />
								</button>
							</div>

							<div
								style={{
									display: 'grid',
									gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
									gap: 'var(--space-3)',
									marginTop: 'var(--space-2)',
								}}
							>
								<div>
									<RotationDateRange
										start={day(r.start_date)}
										end={day(r.end_date)}
										duration={r.duration_text}
										prevEnd={prevEnd}
										disabled={busy}
										onChange={(s, e) => save(r.id, { start_date: s || null, end_date: e || null })}
									/>
									<div className={styles.subRowMeta}>
										Thời lượng:{' '}
										<input
											className={styles.formInput}
											style={{ display: 'inline-block', width: 120, padding: '2px 6px' }}
											defaultValue={r.duration_text ?? ''}
											key={`${r.id}-${r.duration_text}`}
											placeholder={r.allow_split ? 'chia đều' : 'VD: 03 tháng'}
											disabled={busy}
											onBlur={(e) =>
												e.target.value !== (r.duration_text ?? '') && save(r.id, { duration_text: e.target.value || null })
											}
										/>
									</div>
								</div>
								<MentorPicker
									rotation={r}
									disabled={busy}
									onSelect={(userId) => save(r.id, { mentor_user_id: userId })}
									onRefresh={() => run(() => refreshRotationMentor(r.id), 'Đã cập nhật thông tin người hướng dẫn')}
									onSalutation={(v) => save(r.id, { mentor_salutation: v || null })}
								/>
							</div>

							{r.warnings.length > 0 && (
								<div style={{ color: '#b42318', fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
									{r.warnings.join(' · ')}
								</div>
							)}
							{lastOfSplit.has(r.id) && r.lesson_id && (
								<button
									type='button'
									className={styles.btnSmall}
									style={{ marginTop: 6 }}
									disabled={busy}
									onClick={() => run(() => addRotationSegment(enrollmentId, r.lesson_id as string))}
									title='Vòng chia nhiều khoa: thêm 1 khoa nữa, thời gian vòng chia đều khi tự xếp lịch'
								>
									+ Thêm khoa cho vòng này
								</button>
							)}
						</div>
					);
				})}
			</div>
			{rows.length > 0 && (
				<div className={styles.hint}>
					Cảnh báo người hướng dẫn kèm quá {data.max_mentor_load} học viên cùng lúc — đổi ngưỡng ở Cài đặt hệ thống.
				</div>
			)}
		</div>
	);
}

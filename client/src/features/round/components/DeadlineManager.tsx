import React, { useEffect, useState } from 'react';
import {
	AlertSvg,
	CalendarSvg,
	CheckSvg,
	EditSvg,
	InfoSvg,
	PlusSvg,
	XSvg,
} from '@/assets/icons';
import { deleteDeadline, getDeadlines, upsertDeadline } from '../api/roundApi';
import type {
	DeadlineType,
	RoundDeadline,
	SupplementField,
} from '../types/round.type';
import {
	DEADLINE_TYPE_LABELS,
	SUPPLEMENT_FIELDS,
	SUPPLEMENT_FIELD_LABELS,
} from '../types/round.type';
import { fromInputDate, toIso } from '../utils/roundHelpers';
import roundStyles from '../pages/Round.module.css';
import styles from './DeadlineManager.module.css';
import { DatePicker } from '../../../shared/components/Input/DatePicker';
import { InlineLoading } from '../../../shared/components';

type DeadlineRowState = {
	name: string;
	start_date: string;
	date: string;
	deadline_type: DeadlineType | '';
	supplement_fields: SupplementField[];
};

const emptyRow = (): DeadlineRowState => ({
	name: '',
	start_date: '',
	date: '',
	deadline_type: '',
	supplement_fields: [...SUPPLEMENT_FIELDS],
});

function RowForm({
	row,
	setRow,
	phase,
	onCancel,
	label,
	saving,
	onSave,
	roundStart,
	roundEnd,
}: {
	row: DeadlineRowState;
	setRow: React.Dispatch<React.SetStateAction<DeadlineRowState | null>>;
	phase: number;
	onCancel: () => void;
	label: string;
	saving: boolean;
	onSave: (phase: number, row: DeadlineRowState) => Promise<void>;
	roundStart?: string;
	roundEnd?: string;
}) {
	// Show the round's context band only while the milestone range is incomplete.
	// Once both dates are picked, only the milestone band is shown.
	const bothDatesPicked = Boolean(row.start_date && row.date);
	const ctxStart = bothDatesPicked ? undefined : roundStart;
	const ctxEnd = bothDatesPicked ? undefined : roundEnd;

	return (
		<div className={styles.timelineFormCard}>
			<div className={styles.formCardHeader}>
				<div className={styles.formCardTitleWrap}>
					<span className={styles.formCardTitle}>{label}</span>
					<span className={styles.phaseBadge}>Giai đoạn {phase}</span>
				</div>
				<button
					type='button'
					className={styles.closeFormBtn}
					onClick={onCancel}
					title='Đóng'
				>
					<XSvg style={{ width: 14, height: 14 }} />
				</button>
			</div>

			<div className={styles.timelineFormGrid}>
				{/* Field 1: Tên mốc thời gian (Full width) */}
				<div className={`${styles.fieldGroup} ${styles.timelineFormFull}`}>
					<label className={styles.fieldLabel}>
						Tên mốc thời gian / Hạn nộp{' '}
						<span className={styles.fieldRequired}>*</span>
					</label>
					<input
						className={styles.formInput}
						placeholder='VD: Đăng ký đề tài, Bổ sung đề cương...'
						value={row.name}
						onChange={(e) =>
							setRow((p) => p && { ...p, name: e.target.value })
						}
						autoFocus
					/>
				</div>

				{/* Field 2: Loại hạn nộp (Full width) */}
				<div className={`${styles.fieldGroup} ${styles.timelineFormFull}`}>
					<label className={styles.fieldLabel}>Loại hạn nộp</label>
					<select
						className={styles.formSelect}
						value={row.deadline_type}
						onChange={(e) =>
							setRow(
								(p) =>
									p && {
										...p,
										deadline_type: e.target.value as DeadlineType | '',
									},
							)
						}
					>
						<option value=''>-- Chọn loại hạn nộp --</option>
						{(
							Object.entries(DEADLINE_TYPE_LABELS) as [DeadlineType, string][]
						).map(([k, v]) => (
							<option
								key={k}
								value={k}
							>
								{v}
							</option>
						))}
					</select>
				</div>

				{/* Field 3: Checkboxes when supplement */}
				{row.deadline_type === 'supplement' && (
					<div
						className={`${styles.supplementBox} ${styles.timelineFormFull}`}
					>
						<label className={styles.fieldLabel}>
							Chủ nhiệm / thư ký được sửa những mục:
						</label>
						<div className={styles.chipsContainer}>
							{SUPPLEMENT_FIELDS.map((f) => {
								const checked = row.supplement_fields.includes(f);
								return (
									<label
										key={f}
										className={`${styles.chipLabel} ${checked ? styles.chipLabelActive : ''}`}
									>
										<input
											type='checkbox'
											className={styles.hiddenCheckbox}
											checked={checked}
											onChange={(e) =>
												setRow(
													(p) =>
														p && {
															...p,
															supplement_fields: e.target.checked
																? [...p.supplement_fields, f]
																: p.supplement_fields.filter((x) => x !== f),
														},
												)
											}
										/>
										<span className={styles.customCheckbox}>
											{checked && (
												<CheckSvg style={{ width: 10, height: 10 }} />
											)}
										</span>
										<span>{SUPPLEMENT_FIELD_LABELS[f]}</span>
									</label>
								);
							})}
						</div>
					</div>
				)}

				{/* Field 4: Date Pickers (2 columns full width) */}
				<div className={styles.dateRow}>
					<div className={styles.fieldGroup}>
						<label className={styles.fieldLabel}>Ngày bắt đầu</label>
						<DatePicker
							value={row.start_date}
							onChange={(val) =>
								setRow((p) => p && { ...p, start_date: val })
							}
							min={roundStart}
							max={roundEnd}
							rangeStart={ctxStart}
							rangeEnd={ctxEnd}
							activeStart={row.start_date}
							activeEnd={row.date}
							placeholder='Chọn ngày bắt đầu'
						/>
					</div>
					<div className={styles.fieldGroup}>
						<label className={styles.fieldLabel}>
							Hạn cuối <span className={styles.fieldRequired}>*</span>
						</label>
						<DatePicker
							value={row.date}
							onChange={(val) => setRow((p) => p && { ...p, date: val })}
							min={roundStart}
							max={roundEnd}
							rangeStart={ctxStart}
							rangeEnd={ctxEnd}
							activeStart={row.start_date}
							activeEnd={row.date}
							placeholder='Chọn ngày hạn'
						/>
					</div>
				</div>

				{/* Range Hint */}
				{(roundStart || roundEnd) && (
					<div className={styles.rangeHint}>
						<InfoSvg />
						<span>
							Chỉ chọn trong khoảng thời gian của đợt
							{roundStart && roundEnd
								? `: ${fromInputDate(roundStart)} → ${fromInputDate(roundEnd)}`
								: ''}
						</span>
					</div>
				)}
			</div>

			<div className={styles.timelineFormActions}>
				<button
					type='button'
					className={styles.btnSecondary}
					onClick={onCancel}
					disabled={saving}
				>
					Hủy
				</button>
				<button
					type='button'
					className={styles.btnPrimary}
					onClick={() => void onSave(phase, row)}
					disabled={saving}
				>
					{saving ? (
						'Đang lưu...'
					) : (
						<>
							<CheckSvg style={{ width: 14, height: 14 }} />
							Lưu
						</>
					)}
				</button>
			</div>
		</div>
	);
}

export function DeadlineManager({
	roundId,
	roundStart,
	roundEnd,
}: {
	roundId: string;
	/** Round period bounds in 'YYYY-MM-DD' — milestone dates are clamped to this range */
	roundStart?: string;
	roundEnd?: string;
}) {
	const [deadlines, setDeadlines] = useState<RoundDeadline[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [newRow, setNewRow] = useState<DeadlineRowState | null>(null);
	const [editPhase, setEditPhase] = useState<number | null>(null);
	const [editRow, setEditRow] = useState<DeadlineRowState | null>(null);
	const [saving, setSaving] = useState(false);
	const [err, setErr] = useState('');

	useEffect(() => {
		getDeadlines(roundId)
			.then(setDeadlines)
			.catch(() => setErr('Không thể tải hạn nộp'))
			.finally(() => setIsLoading(false));
	}, [roundId]);

	const nextPhase = deadlines.length
		? Math.max(...deadlines.map((d) => d.phase)) + 1
		: 1;

	const handleSave = async (phase: number, row: DeadlineRowState) => {
		if (!row.name.trim() || !row.date) {
			setErr('Vui lòng nhập đủ tên và ngày kết thúc');
			return;
		}
		if (row.start_date && row.date && row.start_date > row.date) {
			setErr('Ngày bắt đầu phải trước hạn cuối');
			return;
		}
		const outOfRange = [row.start_date, row.date].some(
			(d) =>
				d &&
				((roundStart && d < roundStart) || (roundEnd && d > roundEnd)),
		);
		if (outOfRange) {
			setErr('Mốc thời gian phải nằm trong khoảng thời gian của đợt');
			return;
		}
		setSaving(true);
		setErr('');
		try {
			const saved = await upsertDeadline(roundId, phase, {
				name: row.name,
				start_date: row.start_date || null,
				deadline_date: row.date,
				deadline_type: row.deadline_type || null,
				supplement_fields:
					row.deadline_type === 'supplement'
						? row.supplement_fields
						: null,
			});
			setDeadlines((p) =>
				[...p.filter((d) => d.phase !== phase), saved].sort(
					(a, b) => a.phase - b.phase,
				),
			);
			setNewRow(null);
			setEditPhase(null);
			setEditRow(null);
		} catch (e) {
			setErr(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	const handleRemove = async (phase: number) => {
		try {
			await deleteDeadline(roundId, phase);
			setDeadlines((p) => p.filter((d) => d.phase !== phase));
		} catch {
			setErr('Xoá thất bại');
		}
	};

	const startEdit = (d: RoundDeadline) => {
		setEditPhase(d.phase);
		setEditRow({
			name: d.name,
			start_date: toIso(d.start_date ?? ''),
			date: toIso(d.deadline_date),
			deadline_type: (d.deadline_type as DeadlineType) ?? '',
			supplement_fields:
				d.supplement_fields && d.supplement_fields.length
					? d.supplement_fields
					: [...SUPPLEMENT_FIELDS],
		});
		setNewRow(null);
	};

	if (isLoading) return <InlineLoading label='Đang tải…' />;

	return (
		<div className={styles.managerContainer}>
			{err && <div className={styles.errorMessage}>{err}</div>}

			{deadlines.length === 0 && !newRow && (
				<div className={styles.emptyTimelineNotice}>
					Chưa thiết lập mốc thời gian nào cho đợt này.
				</div>
			)}

			<div className={styles.deadlineTimeline}>
				{deadlines.map((d) => {
					const isEditing = editPhase === d.phase && editRow;

					return (
						<div
							key={d.id}
							className={styles.timelineItem}
						>
							<div className={styles.timelineNode}>{d.phase}</div>

							{isEditing ? (
								<RowForm
									row={editRow}
									setRow={setEditRow}
									phase={d.phase}
									onCancel={() => {
										setEditPhase(null);
										setEditRow(null);
										setErr('');
									}}
									label='Cập nhật mốc thời gian'
									saving={saving}
									onSave={handleSave}
									roundStart={roundStart}
									roundEnd={roundEnd}
								/>
							) : (
								<div className={styles.timelineCard}>
									<div className={styles.timelineInfo}>
										<span className={styles.timelineTitle}>{d.name}</span>

										{d.deadline_type && (
											<span
												className={`${styles.timelineBadge} ${styles[d.deadline_type]}`}
											>
												{DEADLINE_TYPE_LABELS[d.deadline_type]}
											</span>
										)}
									</div>

									<div className={styles.timelineDates}>
										<CalendarSvg />
										{d.start_date ? (
											<span>
												{d.start_date}{' '}
												<span style={{ color: 'var(--color-gray-400)' }}>
													→
												</span>{' '}
												<span
													className={styles.timelineDateHighlighted}
												>
													{d.deadline_date}
												</span>
											</span>
										) : (
											<span>
												Hạn cuối:{' '}
												<span
													className={styles.timelineDateHighlighted}
												>
													{d.deadline_date}
												</span>
											</span>
										)}
									</div>

									<div className={styles.timelineActions}>
										<button
											type='button'
											className={`${styles.timelineActionBtn} ${styles.edit}`}
											onClick={() => startEdit(d)}
											title='Chỉnh sửa'
										>
											<EditSvg style={{ width: 14, height: 14 }} />
										</button>
										<button
											type='button'
											className={`${styles.timelineActionBtn} ${styles.delete}`}
											onClick={() => void handleRemove(d.phase)}
											title='Xóa mốc'
										>
											<XSvg style={{ width: 14, height: 14 }} />
										</button>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{newRow ? (
				<div className={styles.timelineItem}>
					<div
						className={styles.timelineNode}
						style={{
							borderColor: 'var(--color-primary, #2eb87a)',
							background: 'var(--color-primary-pale, #e8f8f2)',
							color: 'var(--color-primary-dark, #1e9460)',
						}}
					>
						+
					</div>
					<RowForm
						row={newRow}
						setRow={setNewRow}
						phase={nextPhase}
						onCancel={() => {
							setNewRow(null);
							setErr('');
						}}
						label='Thêm mốc thời gian mới'
						saving={saving}
						onSave={handleSave}
						roundStart={roundStart}
						roundEnd={roundEnd}
					/>
				</div>
			) : (
				nextPhase <= 9 && (
					<div className={styles.addPhaseContainer}>
						<button
							type='button'
							className={styles.addPhaseBtn}
							onClick={() => setNewRow(emptyRow())}
						>
							<PlusSvg /> Thêm mốc thời gian (Lần {nextPhase})
						</button>
					</div>
				)
			)}
		</div>
	);
}

// re-export FormField for use in RoundModal
export function FormField({
	id,
	label,
	required,
	error,
	hint,
	children,
}: {
	id: string;
	label: string;
	required?: boolean;
	error?: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={roundStyles.formGroup}>
			<label
				htmlFor={id}
				className={roundStyles.formLabel}
			>
				{label}
				{required && <span className={roundStyles.formRequired}>*</span>}
			</label>
			{children}
			{error && (
				<span className={roundStyles.formError}>
					<AlertSvg style={{ width: 12, height: 12 }} />
					{error}
				</span>
			)}
			{!error && hint && (
				<span className={roundStyles.formHint}>{hint}</span>
			)}
		</div>
	);
}

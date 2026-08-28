import React, { useEffect, useState } from 'react';
import { AlertSvg, CalendarSvg, CheckSvg, EditSvg, PlusSvg, XSvg } from '@/assets/icons';
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
import styles from '../pages/Round.module.css';
import { DatePicker } from '../../../shared/components/Input/DatePicker';

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
			<div
				style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--color-primary-dark)' }}
			>
				{label} (Giai đoạn {phase})
			</div>
			
			<div className={styles.timelineFormGrid}>
				<div className={styles.timelineFormFull}>
					<label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-600)', display: 'block', marginBottom: 4 }}>
						Tên mốc thời gian / Hạn nộp
					</label>
					<input
						className={styles.formInput}
						placeholder='VD: Đăng ký đề tài'
						value={row.name}
						onChange={(e) => setRow((p) => p && { ...p, name: e.target.value })}
					/>
				</div>

				<div>
					<label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-600)', display: 'block', marginBottom: 4 }}>
						Loại hạn nộp
					</label>
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
						<option value=''>-- Chọn loại --</option>
						{(
							Object.entries(DEADLINE_TYPE_LABELS) as [DeadlineType, string][]
						).map(([k, v]) => (
							<option key={k} value={k}>
								{v}
							</option>
						))}
					</select>
				</div>

				{row.deadline_type === 'supplement' && (
					<div className={styles.timelineFormFull}>
						<label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-600)', display: 'block', marginBottom: 4 }}>
							Chủ nhiệm / thư ký được sửa những mục
						</label>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
							{SUPPLEMENT_FIELDS.map((f) => (
								<label
									key={f}
									style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-gray-700)', cursor: 'pointer' }}
								>
									<input
										type='checkbox'
										checked={row.supplement_fields.includes(f)}
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
									{SUPPLEMENT_FIELD_LABELS[f]}
								</label>
							))}
						</div>
					</div>
				)}

				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
					<div>
						<label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-600)', display: 'block', marginBottom: 4 }}>
							Ngày bắt đầu
						</label>
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
					<div>
						<label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-600)', display: 'block', marginBottom: 4 }}>
							Hạn cuối
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

				{(roundStart || roundEnd) && (
					<div className={styles.timelineFormFull} style={{ fontSize: 11, color: 'var(--color-gray-500)', marginTop: -2 }}>
						Chỉ chọn trong khoảng thời gian của đợt
						{roundStart && roundEnd ? `: ${fromInputDate(roundStart)} → ${fromInputDate(roundEnd)}` : ''}
					</div>
				)}
			</div>

			<div className={styles.timelineFormActions}>
				<button
					type="button"
					className={styles.btnSecondary}
					onClick={onCancel}
					disabled={saving}
				>
					Hủy
				</button>
				<button
					type="button"
					className={styles.btnPrimary}
					onClick={() => void onSave(phase, row)}
					disabled={saving}
				>
					{saving ? (
						<>
							<span className={styles.spinner} />
							Đang lưu...
						</>
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
			(d) => d && ((roundStart && d < roundStart) || (roundEnd && d > roundEnd)),
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
					row.deadline_type === 'supplement' ? row.supplement_fields : null,
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

	if (isLoading)
		return (
			<div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
				Đang tải...
			</div>
		);

	return (
		<div>
			{err && (
				<div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 8 }}>
					{err}
				</div>
			)}
			
			{deadlines.length === 0 && !newRow && (
				<div
					style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 8, fontStyle: 'italic' }}
				>
					Chưa thiết lập mốc thời gian nào cho đợt này.
				</div>
			)}

			<div className={styles.deadlineTimeline}>
				{deadlines.map((d) => {
					const isEditing = editPhase === d.phase && editRow;
					
					return (
						<div 
							key={d.id} 
							className={`${styles.timelineItem} ${!isEditing ? styles.timelineItemActive : ''}`}
						>
							<div className={styles.timelineNode}>
								{d.phase}
							</div>
							
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
									label="Cập nhật mốc thời gian"
									saving={saving}
									onSave={handleSave}
									roundStart={roundStart}
									roundEnd={roundEnd}
								/>
							) : (
								<div className={styles.timelineCard}>
									<div className={styles.timelineTitle}>{d.name}</div>
									
									{d.deadline_type && (
										<span className={`${styles.timelineBadge} ${styles[d.deadline_type]}`}>
											{DEADLINE_TYPE_LABELS[d.deadline_type]}
										</span>
									)}
									
									<div className={styles.timelineDates}>
										<CalendarSvg />
										{d.start_date ? (
											<span>
												{d.start_date} <span style={{ color: 'var(--color-gray-400)' }}>→</span> <span className={styles.timelineDateHighlighted}>{d.deadline_date}</span>
											</span>
										) : (
											<span>
												Hạn cuối: <span className={styles.timelineDateHighlighted}>{d.deadline_date}</span>
											</span>
										)}
									</div>
									
									<div className={styles.timelineActions}>
										<button
											type="button"
											className={`${styles.timelineActionBtn} ${styles.edit}`}
											onClick={() => startEdit(d)}
											title="Chỉnh sửa"
										>
											<EditSvg style={{ width: 14, height: 14 }} />
										</button>
										<button
											type="button"
											className={`${styles.timelineActionBtn} ${styles.delete}`}
											onClick={() => void handleRemove(d.phase)}
											title="Xóa mốc"
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
				<div style={{ paddingLeft: 24, position: 'relative' }}>
					<div 
						className={styles.timelineNode} 
						style={{ 
							left: 0, 
							top: 12, 
							borderColor: 'var(--color-primary)', 
							background: 'var(--color-primary-pale)',
							color: 'var(--color-primary-dark)',
							boxShadow: '0 0 0 3px rgba(46, 184, 122, 0.15)'
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
						label="Thêm mốc thời gian mới"
						saving={saving}
						onSave={handleSave}
						roundStart={roundStart}
						roundEnd={roundEnd}
					/>
				</div>
			) : (
				nextPhase <= 9 && (
					<div style={{ paddingLeft: 24 }}>
						<button
							type="button"
							style={{
								marginTop: 8,
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								fontSize: 12,
								fontWeight: 600,
								color: 'var(--color-primary-dark)',
								background: 'var(--color-white)',
								border: '1.5px dashed var(--color-primary-light)',
								padding: '6px 16px',
								borderRadius: 8,
								cursor: 'pointer',
								transition: 'all var(--transition-fast)'
							}}
							onClick={() => setNewRow(emptyRow())}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = 'var(--color-primary)';
								e.currentTarget.style.background = 'var(--color-primary-pale)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = 'var(--color-primary-light)';
								e.currentTarget.style.background = 'var(--color-white)';
							}}
						>
							<PlusSvg style={{ width: 14, height: 14 }} /> Thêm mốc thời gian (Lần {nextPhase})
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
		<div className={styles.formGroup}>
			<label
				htmlFor={id}
				className={styles.formLabel}
			>
				{label}
				{required && <span className={styles.formRequired}>*</span>}
			</label>
			{children}
			{error && (
				<span className={styles.formError}>
					<AlertSvg style={{ width: 12, height: 12 }} />
					{error}
				</span>
			)}
			{!error && hint && <span className={styles.formHint}>{hint}</span>}
		</div>
	);
}

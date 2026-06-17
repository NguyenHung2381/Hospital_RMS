import React, { useEffect, useState } from 'react';
import { AlertSvg, CheckSvg, EditSvg, PlusSvg, XSvg } from '@/assets/icons';
import { deleteDeadline, getDeadlines, upsertDeadline } from '../api/roundApi';
import type { DeadlineType, RoundDeadline } from '../types/round.type';
import { DEADLINE_TYPE_LABELS } from '../types/round.type';
import { toIso } from '../utils/roundHelpers';
import styles from '../pages/Round.module.css';

type DeadlineRowState = {
	name: string;
	start_date: string;
	date: string;
	deadline_type: DeadlineType | '';
};

function RowForm({
	row,
	setRow,
	phase,
	onCancel,
	label,
	saving,
	onSave,
}: {
	row: DeadlineRowState;
	setRow: React.Dispatch<React.SetStateAction<DeadlineRowState | null>>;
	phase: number;
	onCancel: () => void;
	label: string;
	saving: boolean;
	onSave: (phase: number, row: DeadlineRowState) => Promise<void>;
}) {
	return (
		<div style={{ marginBottom: 8 }}>
			<div
				style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}
			>
				{label}
			</div>
			<div
				style={{
					display: 'flex',
					gap: 6,
					flexWrap: 'wrap',
					alignItems: 'center',
				}}
			>
				<input
					className={styles.formInput}
					style={{ flex: '1 1 160px', minWidth: 120 }}
					placeholder='Tên hạn nộp'
					value={row.name}
					onChange={(e) => setRow((p) => p && { ...p, name: e.target.value })}
				/>
				<select
					className={styles.formInput}
					style={{ width: 140 }}
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
					<option value=''>-- Loại hạn --</option>
					<option value='nop_bao_cao'>Nộp báo cáo</option>
					<option value='sua_thong_tin'>Sửa thông tin</option>
					<option value='xet_duyet'>Xét duyệt</option>
					<option value='nghiem_thu'>Nghiệm thu</option>
				</select>
				<input
					type='date'
					className={styles.formInput}
					style={{ width: 140 }}
					value={row.start_date}
					onChange={(e) =>
						setRow((p) => p && { ...p, start_date: e.target.value })
					}
					title='Ngày bắt đầu (tùy chọn)'
				/>
				<input
					type='date'
					className={styles.formInput}
					style={{ width: 140 }}
					value={row.date}
					onChange={(e) => setRow((p) => p && { ...p, date: e.target.value })}
					title='Ngày kết thúc / hạn cuối'
				/>
				<button
					className={styles.btnPrimary}
					onClick={() => void onSave(phase, row)}
					disabled={saving}
					style={{ whiteSpace: 'nowrap' }}
				>
					{saving ? (
						<span className={styles.spinner} />
					) : (
						<CheckSvg style={{ width: 14, height: 14 }} />
					)}
				</button>
				<button
					className={styles.btnSecondary}
					onClick={onCancel}
				>
					<XSvg style={{ width: 14, height: 14 }} />
				</button>
			</div>
		</div>
	);
}

export function DeadlineManager({ roundId }: { roundId: string }) {
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
		setSaving(true);
		setErr('');
		try {
			const saved = await upsertDeadline(roundId, phase, {
				name: row.name,
				start_date: row.start_date || null,
				deadline_date: row.date,
				deadline_type: row.deadline_type || null,
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
					style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 8 }}
				>
					Chưa có hạn nộp nào
				</div>
			)}

			{deadlines.map((d) =>
				editPhase === d.phase && editRow ? (
					<div
						key={d.id}
						style={{ marginBottom: 6 }}
					>
						<RowForm
							row={editRow}
							setRow={setEditRow}
							phase={d.phase}
							onCancel={() => {
								setEditPhase(null);
								setEditRow(null);
								setErr('');
							}}
							label={`Sửa lần ${d.phase}`}
							saving={saving}
							onSave={handleSave}
						/>
					</div>
				) : (
					<div
						key={d.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 6,
							fontSize: 13,
						}}
					>
						<span style={{ minWidth: 52, color: 'var(--color-muted)' }}>
							Lần {d.phase}
						</span>
						<span style={{ flex: 1 }}>{d.name}</span>
						{d.deadline_type && (
							<span
								style={{
									fontSize: 11,
									padding: '1px 6px',
									borderRadius: 4,
									background: 'var(--color-primary-light, #e8f0fe)',
									color: 'var(--color-primary-dark)',
									whiteSpace: 'nowrap',
								}}
							>
								{DEADLINE_TYPE_LABELS[d.deadline_type]}
							</span>
						)}
						<span style={{ color: 'var(--color-muted)', fontSize: 12 }}>
							{d.start_date ? `${d.start_date} → ` : ''}
						</span>
						<span
							style={{ fontWeight: 600, color: 'var(--color-primary-dark)' }}
						>
							{d.deadline_date}
						</span>
						<button
							onClick={() => startEdit(d)}
							style={{
								background: 'none',
								border: 'none',
								cursor: 'pointer',
								color: 'var(--color-primary)',
								padding: '2px 4px',
								borderRadius: 4,
								display: 'flex',
								alignItems: 'center',
							}}
							title='Sửa'
						>
							<EditSvg style={{ width: 14, height: 14 }} />
						</button>
						<button
							onClick={() => void handleRemove(d.phase)}
							style={{
								background: 'none',
								border: 'none',
								cursor: 'pointer',
								color: '#A32D2D',
								padding: '2px 4px',
								borderRadius: 4,
								display: 'flex',
								alignItems: 'center',
							}}
							title='Xoá'
						>
							<XSvg style={{ width: 14, height: 14 }} />
						</button>
					</div>
				),
			)}

			{newRow ? (
				<RowForm
					row={newRow}
					setRow={setNewRow}
					phase={nextPhase}
					onCancel={() => {
						setNewRow(null);
						setErr('');
					}}
					label={`Thêm lần ${nextPhase}`}
					saving={saving}
					onSave={handleSave}
				/>
			) : (
				nextPhase <= 9 && (
					<button
						style={{
							marginTop: 8,
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							fontSize: 12,
							color: 'var(--color-primary)',
							background: 'none',
							border: '1px dashed var(--color-primary)',
							padding: '4px 12px',
							borderRadius: 6,
							cursor: 'pointer',
						}}
						onClick={() =>
							setNewRow({
								name: `Hạn nộp báo cáo lần ${nextPhase}`,
								start_date: '',
								date: '',
								deadline_type: 'nop_bao_cao',
							})
						}
					>
						<PlusSvg style={{ width: 14, height: 14 }} /> Thêm hạn nộp lần{' '}
						{nextPhase}
					</button>
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

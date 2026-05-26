import React, { useState, useMemo, useCallback, useEffect } from 'react';
import styles from './Round.module.css';
import AdminLayout from '../../../layouts/AdminLayout';
import type {
	DeadlineType,
	FormErrors,
	ResearchRound,
	RoundDeadline,
	RoundForm,
	RoundStatus,
} from '../types/Round.type';
import { DEADLINE_TYPE_LABELS } from '../types/Round.type';
import {
	getRounds,
	createRound,
	updateRound,
	deleteRound as deleteRoundApi,
	formToPayload,
	getDeadlines,
	upsertDeadline,
	deleteDeadline,
	openSupplementWindow,
	closeSupplementWindow,
} from '../api/roundApi';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import CalendarSvg from '../../../assets/svg/calendar.svg?react';
import PlusSvg from '../../../assets/svg/plus.svg?react';
import CheckSvg from '../../../assets/svg/check.svg?react';
import EditSvg from '../../../assets/svg/edit.svg?react';
import TrashSvg from '../../../assets/svg/trash.svg?react';
import CopySvg from '../../../assets/svg/copy.svg?react';
import KeySvg from '../../../assets/svg/key.svg?react';
import DocSvg from '../../../assets/svg/doc.svg?react';
import XSvg from '../../../assets/svg/x.svg?react';
import WarnSvg from '../../../assets/svg/warn.svg?react';
import InfoSvg from '../../../assets/svg/info.svg?react';
import AlertSvg from '../../../assets/svg/alert.svg?react';
import ArrowRSvg from '../../../assets/svg/arrow-r.svg?react';
import RefreshSvg from '../../../assets/svg/refresh.svg?react';
import LinkSvg from '../../../assets/svg/link.svg?react';
import ClockSvg from '../../../assets/svg/clock.svg?react';
import CheckCircleSvg from '../../../assets/svg/check-circle.svg?react';

// ─── HELPERS ──────────────────────────────
const STATUS_CFG: Record<
	RoundStatus,
	{ label: string; cls: string; barCls: string }
> = {
	active: { label: 'Đang mở', cls: 'badgeGreen', barCls: 'barActive' },
	closed: { label: 'Đã đóng', cls: 'badgeGray', barCls: 'barClosed' },
	draft: { label: 'Lên lịch', cls: 'badgeBlue', barCls: 'barUpcoming' },
};

function calcTimeProgress(start: string, end: string): number {
	const parse = (s: string) => {
		const [d, m, y] = s.split('/').map(Number);
		return new Date(y, m - 1, d).getTime();
	};
	const now = Date.now();
	const s = parse(start);
	const e = parse(end);
	if (now <= s) return 0;
	if (now >= e) return 100;
	return Math.round(((now - s) / (e - s)) * 100);
}

function calcDaysLeft(end: string): number {
	const [d, m, y] = end.split('/').map(Number);
	const diff = new Date(y, m - 1, d).getTime() - Date.now();
	return Math.max(0, Math.ceil(diff / 86400000));
}

function getProgressColor(pct: number) {
	if (pct >= 80) return '#EF9F27';
	if (pct >= 50) return '#378ADD';
	return '#2EB87A';
}

function uniqueYears(rounds: ResearchRound[]) {
	return [...new Set(rounds.map((r) => r.year))].sort((a, b) => b - a);
}

// ─── ICONS ────────────────────────────────
const Ic = {
	Cal: () => <CalendarSvg />,
	Plus: () => <PlusSvg style={{ width: 14, height: 14 }} />,
	Check: () => <CheckSvg style={{ width: 14, height: 14, flexShrink: 0 }} />,
	Edit: () => <EditSvg style={{ width: 14, height: 14, flexShrink: 0 }} />,
	Trash: () => <TrashSvg />,
	Copy: () => <CopySvg />,
	Key: () => <KeySvg />,
	Doc: () => <DocSvg />,
	X: () => <XSvg style={{ width: 14, height: 14, flexShrink: 0 }} />,
	Warn: () => <WarnSvg />,
	Info: () => <InfoSvg style={{ width: 16, height: 16 }} />,
	Alert: () => <AlertSvg style={{ width: 12, height: 12 }} />,
	Arrow: () => <ArrowRSvg style={{ width: 14, height: 14 }} />,
	Refresh: () => <RefreshSvg style={{ width: 14, height: 14 }} />,
	Link: () => <LinkSvg />,
};

// ─── FORM FIELD (module level) ─────────────
function FormField({
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
					<Ic.Alert />
					{error}
				</span>
			)}
			{!error && hint && <span className={styles.formHint}>{hint}</span>}
		</div>
	);
}

// ─── DEADLINE MANAGER ─────────────────────
type DeadlineRowState = {
	name: string;
	start_date: string;
	date: string;
	deadline_type: DeadlineType | '';
};

function toIso(ddmmyyyy: string): string {
	if (!ddmmyyyy) return '';
	const [d, m, y] = ddmmyyyy.split('/');
	return `${y}-${m}-${d}`;
}

function DeadlineManager({ roundId }: { roundId: string }) {
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
				[...p.filter((d) => d.phase !== phase), saved].sort((a, b) => a.phase - b.phase),
			);
			setNewRow(null);
			setEditPhase(null);
			setEditRow(null);
		} catch {
			setErr('Lưu thất bại');
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

	const cancelEdit = () => {
		setEditPhase(null);
		setEditRow(null);
		setErr('');
	};

	const rowForm = (
		row: DeadlineRowState,
		setRow: React.Dispatch<React.SetStateAction<DeadlineRowState | null>>,
		phase: number,
		onCancel: () => void,
		label: string,
	) => (
		<div style={{ marginBottom: 8 }}>
			<div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>
				{label}
			</div>
			<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
						setRow((p) => p && { ...p, deadline_type: e.target.value as DeadlineType | '' })
					}
				>
					<option value=''>-- Loại hạn --</option>
					<option value='nop_bao_cao'>Nộp báo cáo</option>
					<option value='xet_duyet'>Xét duyệt</option>
					<option value='nghiem_thu'>Nghiệm thu</option>
				</select>
				<input
					type='date'
					className={styles.formInput}
					style={{ width: 140 }}
					value={row.start_date}
					onChange={(e) => setRow((p) => p && { ...p, start_date: e.target.value })}
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
					onClick={() => handleSave(phase, row)}
					disabled={saving}
					style={{ whiteSpace: 'nowrap' }}
				>
					{saving ? <span className={styles.spinner} /> : <Ic.Check />}
				</button>
				<button className={styles.btnSecondary} onClick={onCancel}>
					<Ic.X />
				</button>
			</div>
		</div>
	);

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
				<div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 8 }}>
					Chưa có hạn nộp nào
				</div>
			)}

			{deadlines.map((d) =>
				editPhase === d.phase && editRow ? (
					<div key={d.id} style={{ marginBottom: 6 }}>
						{rowForm(editRow, setEditRow, d.phase, cancelEdit, `Sửa lần ${d.phase}`)}
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
						<span style={{ fontWeight: 600, color: 'var(--color-primary-dark)' }}>
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
							<Ic.Edit />
						</button>
						<button
							onClick={() => handleRemove(d.phase)}
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
							<Ic.X />
						</button>
					</div>
				),
			)}

			{newRow
				? rowForm(
						newRow,
						setNewRow,
						nextPhase,
						() => { setNewRow(null); setErr(''); },
						`Thêm lần ${nextPhase}`,
					)
				: nextPhase <= 9 && (
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
								setNewRow({ name: `Hạn nộp báo cáo lần ${nextPhase}`, start_date: '', date: '', deadline_type: 'nop_bao_cao' })
							}
						>
							<Ic.Plus />
							Thêm hạn nộp lần {nextPhase}
						</button>
					)}
		</div>
	);
}

// ─── SUPPLEMENT MANAGER ───────────────────
function SupplementManager({
	round,
	onDone,
}: {
	round: ResearchRound;
	onDone: (updated: ResearchRound) => void;
}) {
	const isOpen = !!(round.supplement_start_date && round.supplement_end_date);

	const [startDate, setStartDate] = useState('');
	const [endDate, setEndDate] = useState('');
	const [saving, setSaving] = useState(false);
	const [err, setErr] = useState('');

	const handleOpen = async () => {
		if (!startDate || !endDate) {
			setErr('Vui lòng chọn đủ ngày bắt đầu và kết thúc');
			return;
		}
		if (endDate < startDate) {
			setErr('Ngày kết thúc phải sau ngày bắt đầu');
			return;
		}
		setSaving(true);
		setErr('');
		try {
			await openSupplementWindow(round.id, {
				supplement_start: startDate,
				supplement_end: endDate,
			});
			onDone({
				...round,
				supplement_start_date: startDate.split('-').reverse().join('/'),
				supplement_end_date: endDate.split('-').reverse().join('/'),
			});
		} catch {
			setErr('Mở cửa sổ thất bại');
		} finally {
			setSaving(false);
		}
	};

	const handleClose = async () => {
		setSaving(true);
		setErr('');
		try {
			await closeSupplementWindow(round.id);
			onDone({
				...round,
				supplement_start_date: null,
				supplement_end_date: null,
			});
		} catch {
			setErr('Đóng cửa sổ thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			{err && (
				<div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 8 }}>
					{err}
				</div>
			)}

			{isOpen ? (
				<div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 10,
							fontSize: 13,
						}}
					>
						<span
							style={{
								background: '#E8F5E9',
								color: '#1B5E20',
								padding: '2px 10px',
								borderRadius: 999,
								fontWeight: 600,
								fontSize: 12,
							}}
						>
							Đang mở
						</span>
						<span style={{ color: 'var(--color-muted)' }}>
							{round.supplement_start_date} → {round.supplement_end_date}
						</span>
					</div>
					<button
						className={styles.btnDanger}
						onClick={handleClose}
						disabled={saving}
						style={{ fontSize: 12 }}
					>
						{saving ? <span className={styles.spinner} /> : null}
						Đóng cửa sổ bổ sung
					</button>
				</div>
			) : (
				<div>
					<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
						<div style={{ flex: 1 }}>
							<label
								style={{
									fontSize: 12,
									color: 'var(--color-muted)',
									display: 'block',
									marginBottom: 4,
								}}
							>
								Ngày bắt đầu
							</label>
							<input
								type='date'
								className={styles.formInput}
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
							/>
						</div>
						<div style={{ flex: 1 }}>
							<label
								style={{
									fontSize: 12,
									color: 'var(--color-muted)',
									display: 'block',
									marginBottom: 4,
								}}
							>
								Ngày kết thúc
							</label>
							<input
								type='date'
								className={styles.formInput}
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
							/>
						</div>
					</div>
					<button
						className={styles.btnPrimary}
						onClick={handleOpen}
						disabled={saving}
						style={{ fontSize: 12 }}
					>
						{saving ? <span className={styles.spinner} /> : <Ic.Plus />}
						Mở cửa sổ bổ sung
					</button>
				</div>
			)}
		</div>
	);
}

// ─── ROUND FORM MODAL ─────────────────────
interface RoundModalProps {
	mode: 'create' | 'edit';
	round?: ResearchRound;
	onClose: () => void;
	onSave: (form: RoundForm) => Promise<void>;
	onRoundUpdate?: (r: ResearchRound) => void;
}

const STATUS_OPTIONS: { value: RoundStatus; label: string; desc: string }[] = [
	{ value: 'draft', label: STATUS_CFG.draft.label, desc: 'Chưa mở đăng ký' },
	{ value: 'active', label: STATUS_CFG.active.label, desc: 'Đang nhận đề tài' },
	{ value: 'closed', label: STATUS_CFG.closed.label, desc: 'Kết thúc đợt' },
];

function RoundModal({
	mode,
	round,
	onClose,
	onSave,
	onRoundUpdate,
}: RoundModalProps) {
	const currentYear = new Date().getFullYear();
	const [activeTab, setActiveTab] = useState<'info' | 'advanced'>('info');

	const [form, setForm] = useState<RoundForm>({
		name: round?.name ?? '',
		year: round?.year ?? currentYear,
		dot_so: round?.dot_so ?? 1,
		start_date: round?.start_date ?? '',
		end_date: round?.end_date ?? '',
		registration_start_date: round?.registration_start_date ?? '',
		registration_end_date: round?.registration_end_date ?? '',
		status: round?.status ?? 'draft',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState('');

	const set = <K extends keyof RoundForm>(field: K, val: RoundForm[K]) => {
		setForm((p) => {
			const next = { ...p, [field]: val };
			if (mode === 'create' && (field === 'year' || field === 'dot_so')) {
				next.name = `Đợt ${next.dot_so} năm ${next.year}`;
			}
			return next;
		});
		if (errors[field])
			setErrors((p) => {
				const n = { ...p };
				delete n[field as string];
				return n;
			});
	};

	const parseDate = (s: string) => {
		if (!s) return null;
		const [d, m, y] = s.split('/').map(Number);
		return new Date(y, m - 1, d);
	};

	const validate = (): boolean => {
		const e: FormErrors = {};
		if (!form.name.trim()) e.name = 'Vui lòng nhập tên đợt';
		if (!form.start_date) e.start_date = 'Vui lòng chọn ngày bắt đầu';
		if (!form.end_date) e.end_date = 'Vui lòng chọn ngày kết thúc';

		const s = parseDate(form.start_date);
		const e2 = parseDate(form.end_date);
		if (s && e2 && e2 <= s) e.end_date = 'Ngày kết thúc phải sau ngày bắt đầu';

		const rs = parseDate(form.registration_start_date);
		const re = parseDate(form.registration_end_date);
		if (form.registration_start_date && !form.registration_end_date)
			e.registration_end_date = 'Vui lòng nhập ngày kết thúc đăng ký';
		if (!form.registration_start_date && form.registration_end_date)
			e.registration_start_date = 'Vui lòng nhập ngày bắt đầu đăng ký';
		if (rs && re && re < rs)
			e.registration_end_date = 'Ngày kết thúc đăng ký phải sau ngày bắt đầu';

		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const handleSubmit = async () => {
		if (!validate()) {
			setActiveTab('info');
			return;
		}
		setLoading(true);
		setSaveError('');
		try {
			await onSave(form);
		} catch (err: unknown) {
			setSaveError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setLoading(false);
		}
	};

	const toInputDate = (s: string) => {
		if (!s) return '';
		const [d, m, y] = s.split('/');
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	};

	const fromInputDate = (s: string) => {
		if (!s) return '';
		const [y, m, d] = s.split('-');
		return `${d}/${m}/${y}`;
	};

	const years = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={styles.modal}
				role='dialog'
				aria-modal='true'
				aria-labelledby='modal-title'
			>
				{/* Header */}
				<div className={styles.modalHeader}>
					<div>
						<h2
							id='modal-title'
							className={styles.modalTitle}
						>
							{mode === 'create'
								? 'Tạo đợt nghiên cứu mới'
								: 'Chỉnh sửa đợt nghiên cứu'}
						</h2>
						<p className={styles.modalSubtitle}>
							{mode === 'create'
								? 'Thiết lập đợt đăng ký và thực hiện đề tài NCKH'
								: `Cập nhật thông tin — ${round?.id}`}
						</p>
					</div>
					<button
						className={styles.modalCloseBtn}
						onClick={onClose}
						aria-label='Đóng'
					>
						<Ic.X />
					</button>
				</div>

				{/* Tab navigation (edit mode only) */}
				{mode === 'edit' && (
					<div className={styles.modalTabs}>
						<button
							className={`${styles.modalTab} ${activeTab === 'info' ? styles.modalTabActive : ''}`}
							onClick={() => setActiveTab('info')}
						>
							Thông tin chung
						</button>
						<button
							className={`${styles.modalTab} ${activeTab === 'advanced' ? styles.modalTabActive : ''}`}
							onClick={() => setActiveTab('advanced')}
						>
							Cài đặt &amp; Thống kê
						</button>
					</div>
				)}

				<div className={styles.modalBody}>
					{/* ── INFO TAB (always shown in create, shown when tab = 'info' in edit) ── */}
					{(mode === 'create' || activeTab === 'info') && (
						<>
							<div className={styles.formSection}>Thông tin đợt nghiên cứu</div>

							<div className={styles.formRow}>
								<FormField
									id='year'
									label='Năm'
									required
									error={errors.year as string}
								>
									<select
										id='year'
										className={styles.formSelect}
										value={form.year}
										onChange={(e) => set('year', Number(e.target.value))}
									>
										{years.map((y) => (
											<option
												key={y}
												value={y}
											>
												{y}
											</option>
										))}
									</select>
								</FormField>
								<FormField
									id='dot_so'
									label='Số đợt trong năm'
									required
								>
									<select
										id='dot_so'
										className={styles.formSelect}
										value={form.dot_so}
										onChange={(e) => set('dot_so', Number(e.target.value))}
									>
										<option value={1}>Đợt 1</option>
										<option value={2}>Đợt 2</option>
										<option value={3}>Đợt 3</option>
									</select>
								</FormField>
							</div>

							<FormField
								id='name'
								label='Tên đợt nghiên cứu'
								required
								error={errors.name}
								hint='Có thể chỉnh sửa tên tự sinh'
							>
								<input
									id='name'
									className={`${styles.formInput} ${errors.name ? styles.hasError : ''}`}
									placeholder='VD: Đợt 1 năm 2026'
									value={form.name}
									onChange={(e) => set('name', e.target.value)}
								/>
							</FormField>

							<div className={styles.formSection}>Thời gian đăng ký đề tài</div>

							<div className={styles.formRow}>
								<FormField
									id='registration_start_date'
									label='Bắt đầu nhận đăng ký'
									error={errors.registration_start_date}
									hint='Để trống nếu chưa xác định'
								>
									<input
										id='registration_start_date'
										type='date'
										className={`${styles.formInput} ${errors.registration_start_date ? styles.hasError : ''}`}
										value={toInputDate(form.registration_start_date)}
										onChange={(e) =>
											set('registration_start_date', fromInputDate(e.target.value))
										}
									/>
								</FormField>
								<FormField
									id='registration_end_date'
									label='Kết thúc nhận đăng ký'
									error={errors.registration_end_date}
								>
									<input
										id='registration_end_date'
										type='date'
										className={`${styles.formInput} ${errors.registration_end_date ? styles.hasError : ''}`}
										value={toInputDate(form.registration_end_date)}
										onChange={(e) =>
											set('registration_end_date', fromInputDate(e.target.value))
										}
									/>
								</FormField>
							</div>

							<div className={styles.formSection}>Thời gian thực hiện</div>

							<div className={styles.formRow}>
								<FormField
									id='start_date'
									label='Ngày bắt đầu'
									required
									error={errors.start_date}
								>
									<input
										id='start_date'
										type='date'
										className={`${styles.formInput} ${errors.start_date ? styles.hasError : ''}`}
										value={toInputDate(form.start_date)}
										onChange={(e) =>
											set('start_date', fromInputDate(e.target.value))
										}
									/>
								</FormField>
								<FormField
									id='end_date'
									label='Ngày kết thúc'
									required
									error={errors.end_date}
								>
									<input
										id='end_date'
										type='date'
										className={`${styles.formInput} ${errors.end_date ? styles.hasError : ''}`}
										value={toInputDate(form.end_date)}
										onChange={(e) => set('end_date', fromInputDate(e.target.value))}
									/>
								</FormField>
							</div>

							{/* Visual status selector */}
							<div className={styles.formSection}>Trạng thái đợt</div>
							<div className={styles.statusSelector}>
								{STATUS_OPTIONS.map(({ value, label, desc }) => {
									const cfg = STATUS_CFG[value];
									return (
										<button
											key={value}
											type='button'
											className={`${styles.statusOption} ${form.status === value ? styles.statusOptionSelected : ''}`}
											onClick={() => set('status', value)}
										>
											<span
												className={`${styles.badge} ${styles[cfg.cls as keyof typeof styles]}`}
											>
												<span className={styles.badgeDot} />
												{label}
											</span>
											<span className={styles.statusOptionDesc}>{desc}</span>
										</button>
									);
								})}
							</div>
						</>
					)}

					{/* ── ADVANCED TAB (edit mode only) ── */}
					{mode === 'edit' && activeTab === 'advanced' && round && (
						<>
							<div className={styles.formSection}>
								Mã truy cập công khai (public_token)
							</div>
							<div className={styles.tokenInfoBox}>
								<Ic.Key />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 12, marginBottom: 4 }}>
										Token cho phép truy cập không cần đăng nhập:
									</div>
									<div className={styles.tokenCode}>{round.public_token}</div>
								</div>
							</div>

							<div className={styles.formSection}>Hạn nộp báo cáo</div>
							<DeadlineManager roundId={round.id} />

							<div className={styles.formSection}>
								Cửa sổ bổ sung thông tin đề tài
							</div>
							<SupplementManager
								round={round}
								onDone={(updated) => onRoundUpdate?.(updated)}
							/>

							<div className={styles.formSection}>Thống kê đề tài trong đợt</div>
							<div className={styles.statusInfoRow}>
								<div className={styles.statusInfoItem}>
									<div className={styles.statusInfoVal}>{round.topic_total}</div>
									<div className={styles.statusInfoLbl}>Tổng đề tài</div>
								</div>
								<div className={styles.statusInfoItem}>
									<div className={styles.statusInfoVal}>{round.topic_active}</div>
									<div className={styles.statusInfoLbl}>Đang thực hiện</div>
								</div>
								<div className={styles.statusInfoItem}>
									<div className={styles.statusInfoVal}>
										{round.topic_completed}
									</div>
									<div className={styles.statusInfoLbl}>Hoàn thành</div>
								</div>
							</div>
						</>
					)}
				</div>

				<div className={styles.modalFooter}>
					{saveError && (
						<span style={{ color: '#A32D2D', fontSize: 13, flex: 1 }}>
							{saveError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnPrimary}
						onClick={handleSubmit}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} />
								Đang lưu...
							</>
						) : mode === 'create' ? (
							<>
								<Ic.Plus />
								Tạo đợt nghiên cứu
							</>
						) : (
							<>
								<Ic.Check />
								Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── DELETE CONFIRM MODAL ─────────────────
function DeleteModal({
	round,
	onClose,
	onConfirm,
}: {
	round: ResearchRound;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const [loading, setLoading] = useState(false);
	const [deleteError, setDeleteError] = useState('');

	const go = async () => {
		setLoading(true);
		setDeleteError('');
		try {
			await onConfirm();
		} catch (err: unknown) {
			setDeleteError(err instanceof Error ? err.message : 'Xoá thất bại');
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={`${styles.modal} ${styles.confirmModal}`}
				role='alertdialog'
				aria-modal='true'
			>
				<div className={styles.modalBody}>
					<div className={styles.confirmIcon}>
						<Ic.Warn />
					</div>
					<h2 className={styles.confirmTitle}>Xoá đợt nghiên cứu?</h2>
					<p className={styles.confirmDesc}>
						Bạn sắp xoá đợt <strong>"{round.name}"</strong>.
						{round.topic_total > 0
							? ` Đợt này có ${round.topic_total} đề tài liên kết — tất cả sẽ mất liên kết với đợt nghiên cứu này.`
							: ' Hành động không thể hoàn tác.'}
					</p>
				</div>
				<div className={styles.modalFooter}>
					{deleteError && (
						<span style={{ color: '#A32D2D', fontSize: 13, flex: 1 }}>
							{deleteError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Huỷ bỏ
					</button>
					<button
						className={styles.btnDanger}
						onClick={go}
						disabled={loading}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={{ borderTopColor: '#791F1F' }}
								/>
								Đang xoá...
							</>
						) : (
							'Xác nhận xoá'
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── ROUND CARD ───────────────────────────
interface RoundCardProps {
	round: ResearchRound;
	onEdit: () => void;
	onDelete: () => void;
	onCopyLink: (token: string) => void;
}

function RoundCard({ round, onEdit, onDelete, onCopyLink }: RoundCardProps) {
	const sc = STATUS_CFG[round.status] ?? STATUS_CFG.draft;
	const timePct =
		round.status === 'active'
			? calcTimeProgress(round.start_date, round.end_date)
			: round.status === 'closed'
				? 100
				: 0;
	const daysLeft = round.status === 'active' ? calcDaysLeft(round.end_date) : 0;
	const topicPct =
		round.topic_total > 0
			? Math.round((round.topic_completed / round.topic_total) * 100)
			: 0;

	return (
		<div
			className={`${styles.roundCard} ${round.status === 'active' ? styles.isActive : ''}`}
		>
			{/* Color bar */}
			<div
				className={`${styles.roundCardBar} ${styles[sc.barCls as keyof typeof styles]}`}
			/>

			<div className={styles.roundCardBody}>
				{/* Header */}
				<div className={styles.roundCardHeader}>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div className={styles.roundCardId}>{round.id}</div>
						<div className={styles.roundCardName}>{round.name}</div>
						<div className={styles.roundCardSubname}>
							Đợt {round.dot_so} · Năm {round.year}
						</div>
					</div>
					<span
						className={`${styles.badge} ${styles[sc.cls as keyof typeof styles]}`}
					>
						<span className={styles.badgeDot} />
						{sc.label}
					</span>
				</div>

				{/* Date range */}
				<div className={styles.dateRange}>
					<CalendarSvg />
					<span>{round.start_date}</span>
					<div className={styles.dateSep} />
					<span>{round.end_date}</span>
					{round.status === 'active' && daysLeft > 0 && (
						<span
							style={{
								marginLeft: 'auto',
								fontSize: 11,
								fontWeight: 700,
								color: daysLeft <= 30 ? '#A32D2D' : 'var(--color-primary-dark)',
								background:
									daysLeft <= 30 ? '#FCEBEB' : 'var(--color-primary-pale)',
								padding: '2px 8px',
								borderRadius: 999,
							}}
						>
							{daysLeft} ngày còn lại
						</span>
					)}
				</div>

				{/* Registration period */}
				{round.registration_start_date && round.registration_end_date && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							fontSize: 12,
							color: 'var(--color-muted)',
							marginBottom: 8,
						}}
					>
						<DocSvg style={{ width: 13, height: 13, flexShrink: 0 }} />
						<span>Đăng ký:</span>
						<span style={{ fontWeight: 500 }}>
							{round.registration_start_date} → {round.registration_end_date}
						</span>
					</div>
				)}

				{/* Scheduled info (draft rounds) */}
				{round.status === 'draft' && (
					<div className={styles.scheduledInfo}>
						<CalendarSvg />
						<span>Chưa mở đăng ký</span>
						{round.registration_start_date && (
							<span className={styles.scheduledDate}>
								Mở từ {round.registration_start_date}
							</span>
						)}
					</div>
				)}

				{/* Time progress (active rounds) */}
				{round.status === 'active' && (
					<div className={styles.cardProgressWrap}>
						<div className={styles.cardProgressLabel}>
							<span>Tiến độ thời gian</span>
							<strong>{timePct}%</strong>
						</div>
						<div className={styles.progressTrack}>
							<div
								className={styles.progressFill}
								style={{
									width: `${timePct}%`,
									background: getProgressColor(timePct),
								}}
							/>
						</div>
					</div>
				)}

				{/* Topic completion (closed rounds) */}
				{round.status === 'closed' && round.topic_total > 0 && (
					<div className={styles.cardProgressWrap}>
						<div className={styles.cardProgressLabel}>
							<span>Tỷ lệ đề tài hoàn thành</span>
							<strong>{topicPct}%</strong>
						</div>
						<div className={styles.progressTrack}>
							<div
								className={styles.progressFill}
								style={{ width: `${topicPct}%`, background: '#2EB87A' }}
							/>
						</div>
					</div>
				)}

				{/* Stats */}
				<div className={styles.cardStats}>
					<div className={styles.cardStat}>
						<div className={styles.cardStatVal}>{round.topic_total}</div>
						<div className={styles.cardStatLbl}>Tổng đề tài</div>
					</div>
					<div className={styles.cardStat}>
						<div
							className={styles.cardStatVal}
							style={{ color: round.topic_active > 0 ? '#0C447C' : 'inherit' }}
						>
							{round.topic_active}
						</div>
						<div className={styles.cardStatLbl}>Đang thực hiện</div>
					</div>
					<div className={styles.cardStat}>
						<div
							className={styles.cardStatVal}
							style={{
								color: round.topic_completed > 0 ? '#085041' : 'inherit',
							}}
						>
							{round.topic_completed}
						</div>
						<div className={styles.cardStatLbl}>Hoàn thành</div>
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className={styles.roundCardFooter}>
				{/* Registration link */}
				<div
					className={styles.linkRow}
					onClick={() => onCopyLink(round.public_token)}
					title='Sao chép link đăng ký đề tài'
				>
					<Ic.Link />
					<span className={styles.linkRowText}>
						/dang-ky-de-tai?token={round.public_token.slice(0, 10)}…
					</span>
					<span className={styles.linkRowHint}>Sao chép</span>
				</div>

				{/* Actions */}
				<div className={styles.roundCardActions}>
					<div
						className={styles.actionBtn}
						title='Chỉnh sửa'
						onClick={onEdit}
					>
						<Ic.Edit />
					</div>
					<div
						className={`${styles.actionBtn} ${styles.danger}`}
						title='Xoá đợt'
						onClick={onDelete}
					>
						<Ic.Trash />
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── MAIN PAGE ────────────────────────────
export default function Round() {
	const [rounds, setRounds] = useState<ResearchRound[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState('');
	const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
	const [statusFilter, setStatusFilter] = useState<RoundStatus | 'all'>('all');

	const [showCreate, setShowCreate] = useState(false);
	const [editRound, setEditRound] = useState<ResearchRound | null>(null);
	const [deleteRound, setDeleteRound] = useState<ResearchRound | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => {
		setRefreshKey(prev => prev + 1);
	}, []);

	useRealtimeUpdate('round', refreshData);

	// Load rounds from API
	useEffect(() => {
		getRounds({ limit: 200 })
			.then((res) => setRounds(res.data))
			.catch(() => setLoadError('Không thể tải danh sách đợt nghiên cứu'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

	// Auto-dismiss toast
	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 2500);
		return () => clearTimeout(t);
	}, [toast]);

	// Stats
	const stats = useMemo(
		() => ({
			total: rounds.length,
			active: rounds.filter((r) => r.status === 'active').length,
			closed: rounds.filter((r) => r.status === 'closed').length,
			draft: rounds.filter((r) => r.status === 'draft').length,
			topicSum: rounds.reduce((s, r) => s + r.topic_total, 0),
		}),
		[rounds],
	);

	const years = useMemo(() => uniqueYears(rounds), [rounds]);

	// Filtered
	const filtered = useMemo(() => {
		return rounds
			.filter((r) => {
				if (yearFilter !== 'all' && r.year !== yearFilter) return false;
				if (statusFilter !== 'all' && r.status !== statusFilter) return false;
				return true;
			})
			.sort((a, b) => b.year - a.year || b.dot_so - a.dot_so);
	}, [rounds, yearFilter, statusFilter]);

	// Handlers
	const handleCreate = useCallback(async (form: RoundForm): Promise<void> => {
		const created = await createRound(formToPayload(form));
		setRounds((prev) => [created, ...prev]);
		setShowCreate(false);
	}, []);

	const handleEdit = useCallback(
		async (form: RoundForm): Promise<void> => {
			if (!editRound) return;
			const updated = await updateRound(editRound.id, formToPayload(form));
			setRounds((prev) =>
				prev.map((r) => (r.id === editRound.id ? updated : r)),
			);
			setEditRound(null);
		},
		[editRound],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteRound) return;
		await deleteRoundApi(deleteRound.id);
		setRounds((prev) => prev.filter((r) => r.id !== deleteRound.id));
		setDeleteRound(null);
	}, [deleteRound]);

	const handleCopyLink = useCallback((token: string) => {
		const link = `${window.location.origin}/dang-ky-de-tai?token=${token}`;
		if (navigator.clipboard) {
			navigator.clipboard.writeText(link).then(
				() => setToast('Đã sao chép link đăng ký vào clipboard'),
				() => fallbackCopy(link),
			);
		} else {
			fallbackCopy(link);
		}

		function fallbackCopy(text: string) {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.cssText = 'position:fixed;opacity:0';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			setToast(ok ? 'Đã sao chép link đăng ký vào clipboard' : `Link: ${text}`);
		}
	}, []);

	// Header actions
	const headerActions = (
		<button
			className={styles.btnPrimary}
			onClick={() => setShowCreate(true)}
		>
			<Ic.Plus />
			Tạo đợt nghiên cứu
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Đợt Nghiên cứu'
			pageSubtitle='Thiết lập và theo dõi các đợt đăng ký đề tài NCKH'
			headerActions={headerActions}
		>
			{/* ── STATS ── */}
			<div className={styles.statsRow}>
				<div className={`${styles.statCard} ${styles.green}`}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<Ic.Cal />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.total}</div>
						<div className={styles.statLabel}>Tổng đợt nghiên cứu</div>
						<div className={styles.statSub}>{years.length} năm ghi nhận</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.blue}`}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<ClockSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.active}</div>
						<div className={styles.statLabel}>Đợt đang mở</div>
						<div className={styles.statSub}>Nhận đề tài đăng ký</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.gray}`}>
					<div className={`${styles.statIcon} ${styles.iconGray}`}>
						<CheckCircleSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.closed}</div>
						<div className={styles.statLabel}>Đợt đã đóng</div>
						<div className={styles.statSub}>Kết thúc hoàn toàn</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.amber}`}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<CalendarSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.draft}</div>
						<div className={styles.statLabel}>Đợt lên lịch</div>
						<div className={styles.statSub}>Chưa mở đăng ký</div>
					</div>
				</div>
			</div>

			{/* ── ROUNDS GRID ── */}
			<div>
				{/* Section heading + filters */}
				<div
					className={styles.sectionHeading}
					style={{ marginBottom: 'var(--space-4)' }}
				>
					<div>
						<div className={styles.sectionTitle}>Tất cả đợt nghiên cứu</div>
						<div className={styles.sectionSub}>
							{filtered.length} đợt
							{yearFilter !== 'all' ? ` — Năm ${yearFilter}` : ''}
							{' · '}{stats.topicSum} đề tài
						</div>
					</div>
					<div className={styles.sectionRight}>
						{/* Status filter */}
						<select
							className={styles.formSelect}
							style={{ width: 'auto' }}
							value={statusFilter}
							onChange={(e) =>
								setStatusFilter(e.target.value as RoundStatus | 'all')
							}
						>
							<option value='all'>Tất cả trạng thái</option>
							<option value='active'>Đang mở</option>
							<option value='closed'>Đã đóng</option>
							<option value='draft'>Lên lịch</option>
						</select>
					</div>
				</div>

				{/* Year chips */}
				<div
					className={styles.yearBar}
					style={{ marginBottom: 'var(--space-5)' }}
				>
					<button
						className={`${styles.yearChip} ${yearFilter === 'all' ? styles.yearChipActive : ''}`}
						onClick={() => setYearFilter('all')}
					>
						Tất cả năm
					</button>
					{years.map((y) => (
						<button
							key={y}
							className={`${styles.yearChip} ${yearFilter === y ? styles.yearChipActive : ''}`}
							onClick={() => setYearFilter(y)}
						>
							{y}
						</button>
					))}
				</div>

				{/* Grid */}
				{isLoadingData ? (
					<div className={styles.emptyState}>
						<p className={styles.emptyTitle}>Đang tải...</p>
					</div>
				) : loadError ? (
					<div className={styles.emptyState}>
						<p
							className={styles.emptyTitle}
							style={{ color: '#A32D2D' }}
						>
							{loadError}
						</p>
					</div>
				) : filtered.length === 0 ? (
					<div className={styles.emptyState}>
						<CalendarSvg className={styles.emptyIcon} />
						<p className={styles.emptyTitle}>Không có đợt nghiên cứu nào</p>
						<p className={styles.emptyDesc}>
							Thử thay đổi bộ lọc hoặc tạo đợt mới
						</p>
					</div>
				) : (
					<div className={styles.roundsGrid}>
						{filtered.map((r) => (
							<RoundCard
								key={r.id}
								round={r}
								onEdit={() => setEditRound(r)}
								onDelete={() => setDeleteRound(r)}
								onCopyLink={handleCopyLink}
							/>
						))}
					</div>
				)}
			</div>

			{/* ── MODALS ── */}
			{showCreate && (
				<RoundModal
					mode='create'
					onClose={() => setShowCreate(false)}
					onSave={handleCreate}
				/>
			)}
			{editRound && (
				<RoundModal
					mode='edit'
					round={editRound}
					onClose={() => setEditRound(null)}
					onSave={handleEdit}
					onRoundUpdate={(updated) => {
						setEditRound(updated);
						setRounds((prev) =>
							prev.map((r) => (r.id === updated.id ? updated : r)),
						);
					}}
				/>
			)}
			{deleteRound && (
				<DeleteModal
					round={deleteRound}
					onClose={() => setDeleteRound(null)}
					onConfirm={handleDelete}
				/>
			)}

			{/* ── TOAST ── */}
			{toast && (
				<div className={styles.toast}>
					<Ic.Check />
					{toast}
				</div>
			)}
		</AdminLayout>
	);
}

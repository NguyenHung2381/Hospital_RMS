import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevDSvg, DownloadSvg, WalletSvg } from '@/assets/icons';
import {
	Badge,
	Button,
	DatePicker,
	EmptyState,
	FormField,
	InlineLoading,
	Modal,
	ModalActions,
	confirmDialog,
	promptDialog,
} from '@/shared/components';
import m from '@/shared/components/Modal/Modal.module.css';
import { usePermission } from '@/shared/hooks/usePermission';
import { notify } from '@/shared/utils/feedback';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { courseTuitionApi } from '../../tuition/api/tuitionApi';
import { PaymentList, TuitionAmounts } from '../../tuition/components/TuitionParts';
import { downloadReceipt, parseVndInput, todayVN } from '../../tuition/utils/tuitionHelpers';
import s from '../../tuition/components/Tuition.module.css';
import {
	TUITION_STATE,
	formatVnd,
	type PaymentMethod,
	type TuitionItem,
	type TuitionState,
} from '../../tuition/types/tuition.type';


type Filter = 'all' | 'pending' | TuitionState;
const FILTERS: [Filter, string][] = [
	['all', 'Tất cả'],
	['pending', 'Chờ xác nhận'],
	['unpaid', 'Chưa nộp'],
	['partial', 'Nộp một phần'],
	['paid', 'Đã nộp đủ'],
	['exempt', 'Miễn'],
];

/** Ghi nhận khoản nộp tại quầy / chuyển khoản đã đối chiếu — xác nhận luôn, cấp biên lai. */
function RecordModal({ item, onClose, onSave }: { item: TuitionItem; onClose: () => void; onSave: (d: { amount: number; method: PaymentMethod; paid_date: string; transfer_ref?: string; note?: string }) => Promise<void> }) {
	const [amount, setAmount] = useState(String(item.remaining || ''));
	const [method, setMethod] = useState<PaymentMethod>('cash');
	const [date, setDate] = useState(todayVN());
	const [ref, setRef] = useState('');
	const [note, setNote] = useState('');
	const [err, setErr] = useState('');
	const [busy, setBusy] = useState(false);
	const save = async () => {
		const n = parseVndInput(amount);
		if (!Number.isInteger(n) || n <= 0) return setErr('Nhập số tiền (đồng)');
		if (n > item.remaining) return setErr(`Không quá số còn phải nộp (${formatVnd(item.remaining)})`);
		setBusy(true);
		try {
			await onSave({ amount: n, method, paid_date: date, transfer_ref: ref.trim() || undefined, note: note.trim() || undefined });
			onClose();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Không ghi nhận được');
		} finally {
			setBusy(false);
		}
	};
	return (
		<Modal
			open
			onClose={onClose}
			title='Ghi nhận khoản nộp'
			subtitle={item.trainee_name}
			footer={<ModalActions onCancel={onClose} onConfirm={() => void save()} loading={busy} confirmLabel='Ghi nhận và cấp biên lai' />}
		>
			<div className={s.formGrid}>
				<FormField label='Số tiền (đồng)' required error={err}>
					<input className={m.formInput} inputMode='numeric' value={amount} onChange={(e) => { setAmount(e.target.value); setErr(''); }} />
				</FormField>
				<FormField label='Hình thức'>
					<select className={m.formInput} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
						<option value='cash'>Tiền mặt</option>
						<option value='transfer'>Chuyển khoản</option>
					</select>
				</FormField>
				<FormField label='Ngày nộp' required>
					<DatePicker value={date} onChange={setDate} max={todayVN()} />
				</FormField>
				<FormField label='Mã giao dịch'>
					<input className={m.formInput} maxLength={100} value={ref} onChange={(e) => setRef(e.target.value)} />
				</FormField>
				<FormField label='Ghi chú' className={s.wide}>
					<textarea className={m.formInput} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
				</FormField>
			</div>
		</Modal>
	);
}

/** Học phí phải nộp (mặc định theo chương trình) + miễn / giảm kèm lý do. */
function FeeModal({ item, onClose, onSave }: { item: TuitionItem; onClose: () => void; onSave: (d: { base_amount: number | null; discount_amount: number; discount_reason: string | null }) => Promise<void> }) {
	const [base, setBase] = useState(String(item.base));
	const [discount, setDiscount] = useState(String(item.discount));
	const [reason, setReason] = useState(item.discount_reason ?? '');
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const save = async () => {
		const b = parseVndInput(base);
		const d = parseVndInput(discount || '0');
		const e: Record<string, string> = {};
		if (!Number.isInteger(b) || b < 0) e.base = 'Học phí không hợp lệ';
		if (!Number.isInteger(d) || d < 0) e.discount = 'Số tiền không hợp lệ';
		else if (d > b) e.discount = 'Không vượt quá học phí';
		if (d > 0 && !reason.trim()) e.reason = 'Nhập lý do miễn / giảm';
		setErrors(e);
		if (Object.keys(e).length) return;
		setBusy(true);
		try {
			await onSave({ base_amount: b, discount_amount: d, discount_reason: d > 0 ? reason.trim() : null });
			onClose();
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Không lưu được');
		} finally {
			setBusy(false);
		}
	};
	return (
		<Modal
			open
			onClose={onClose}
			title='Học phí và miễn giảm'
			subtitle={item.trainee_name}
			footer={<ModalActions onCancel={onClose} onConfirm={() => void save()} loading={busy} confirmLabel='Lưu' />}
		>
			<div className={s.formGrid}>
				<FormField
					label='Học phí phải nộp (đồng)'
					required
					error={errors.base}
					hint={item.tuition_fee != null ? `Học phí chương trình: ${formatVnd(item.tuition_fee)}` : 'Chương trình chưa khai học phí'}
				>
					<input className={m.formInput} inputMode='numeric' value={base} onChange={(e) => setBase(e.target.value)} />
				</FormField>
				<FormField label='Miễn / giảm (đồng)' error={errors.discount} hint='Nhập bằng học phí để miễn toàn bộ.'>
					<input className={m.formInput} inputMode='numeric' value={discount} onChange={(e) => setDiscount(e.target.value)} />
				</FormField>
				<FormField label='Lý do miễn / giảm' error={errors.reason} className={s.wide}>
					<input className={m.formInput} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder='Theo quyết định số …' />
				</FormField>
			</div>
		</Modal>
	);
}

/**
 * Tab "Học phí" của khóa: số phải thu / đã thu / còn nợ từng học viên đã duyệt, xác nhận
 * hoặc từ chối khoản học viên báo đã chuyển khoản, ghi nhận nộp tại quầy, miễn giảm.
 */
export function TuitionTab({ courseId, programId }: { courseId: string; programId?: string }) {
	const { has } = usePermission();
	const canApprove = has('courses:approve');
	const [items, setItems] = useState<TuitionItem[] | null>(null);
	const [error, setError] = useState('');
	const [filter, setFilter] = useState<Filter>('all');
	const [open, setOpen] = useState<string | null>(null);
	const [recording, setRecording] = useState<TuitionItem | null>(null);
	const [editing, setEditing] = useState<TuitionItem | null>(null);

	const load = useCallback(() => {
		courseTuitionApi
			.list(courseId, programId)
			.then((rows) => {
				setItems(rows);
				setError('');
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'Không tải được học phí'));
	}, [courseId, programId]);
	useEffect(load, [load]);
	useRealtimeUpdate('tuition', load);

	const replace = (next: TuitionItem) =>
		setItems((list) => list?.map((i) => (i.enrollment_id === next.enrollment_id ? { ...i, ...next } : i)) ?? null);

	const counts = useMemo(() => {
		const c: Record<Filter, number> = { all: 0, pending: 0, unpaid: 0, partial: 0, paid: 0, exempt: 0, no_fee: 0 };
		for (const i of items ?? []) {
			c.all++;
			c[i.state]++;
			if (i.payments.some((p) => p.status === 'pending')) c.pending++;
		}
		return c;
	}, [items]);
	const totals = useMemo(
		() =>
			(items ?? []).reduce(
				(t, i) => ({ due: t.due + i.due, paid: t.paid + i.paid, remaining: t.remaining + i.remaining }),
				{ due: 0, paid: 0, remaining: 0 },
			),
		[items],
	);

	if (error) return <EmptyState title='Không tải được học phí' desc={error} />;
	if (!items) return <InlineLoading />;
	if (!items.length)
		return <EmptyState icon={<WalletSvg />} title='Chưa có học viên được duyệt' desc='Học phí tính cho học viên đã được duyệt vào khóa.' />;

	const shown = items.filter((i) =>
		filter === 'all' ? true : filter === 'pending' ? i.payments.some((p) => p.status === 'pending') : i.state === filter,
	);

	const confirm = async (item: TuitionItem, paymentId: string, amount: number | string) => {
		const ok = await confirmDialog({
			title: 'Xác nhận đã nhận tiền?',
			message: `${item.trainee_name} — ${formatVnd(amount)}. Chỉ xác nhận khi đã thấy tiền về trên sao kê với nội dung "${item.transfer_content}". Hệ thống sẽ cấp biên lai và báo cho học viên.`,
			confirmLabel: 'Xác nhận',
			onConfirm: async () => replace(await courseTuitionApi.confirm(courseId, paymentId)),
		});
		if (ok) notify.success('Đã xác nhận và cấp biên lai');
	};
	const reject = async (paymentId: string) => {
		const note = await promptDialog({
			title: 'Từ chối khoản nộp',
			label: 'Lý do (học viên sẽ thấy)',
			placeholder: 'Chưa thấy tiền về / sai số tiền / chứng từ không rõ…',
			multiline: true,
			required: true,
			maxLength: 500,
			confirmLabel: 'Từ chối',
			onConfirm: async (v) => replace(await courseTuitionApi.reject(courseId, paymentId, v)),
		});
		if (note !== null) notify.success('Đã từ chối — học viên đã được báo');
	};

	return (
		<>
			<div className={s.toolbar}>
				<div className={s.totals}>
					<span>
						Phải thu <b>{formatVnd(totals.due)}</b>
					</span>
					<span>
						Đã thu <b>{formatVnd(totals.paid)}</b>
					</span>
					<span>
						Còn nợ <b>{formatVnd(totals.remaining)}</b>
					</span>
				</div>
				<div className={s.filters} role='group' aria-label='Lọc theo trạng thái học phí'>
					{FILTERS.filter(([k]) => k === 'all' || k === filter || counts[k] > 0).map(([k, label]) => (
						<button key={k} type='button' className={s.filterBtn} aria-pressed={filter === k} onClick={() => setFilter(k)}>
							{label}
							<span className={s.count}>{counts[k]}</span>
						</button>
					))}
				</div>
			</div>

			<div className={s.rows}>
				<div className={`${s.rowHead} ${s.headCells}`} aria-hidden='true'>
					<span>Học viên</span>
					<span className={s.num}>Phải nộp</span>
					<span className={s.num}>Đã nộp</span>
					<span className={s.num}>Còn lại</span>
					<span>Trạng thái</span>
					<span />
				</div>
				{shown.map((item) => {
					const st = TUITION_STATE[item.state];
					const pendingCount = item.payments.filter((p) => p.status === 'pending').length;
					const isOpen = open === item.enrollment_id;
					return (
						<div key={item.enrollment_id} className={s.row}>
							<button type='button' className={s.rowHead} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : item.enrollment_id)}>
								<span className={s.name}>
									{item.trainee_name}
									<small>{[item.trainee_id, !programId ? item.program_name : null].filter(Boolean).join(' · ')}</small>
								</span>
								<span className={`${s.num} ${s.cDue}`}>
									<span className={s.mLabel}>Phải nộp </span>
									{formatVnd(item.due)}
								</span>
								<span className={`${s.num} ${s.cPaid}`}>
									<span className={s.mLabel}>Đã nộp </span>
									{formatVnd(item.paid)}
								</span>
								<span className={`${s.num} ${s.cRest}`}>
									<span className={s.mLabel}>Còn </span>
									{formatVnd(item.remaining)}
								</span>
								<span className={s.stateCell}>
									<Badge tone={st.tone}>{st.label}</Badge>
									{pendingCount > 0 && <div className={s.pendingTag}>{pendingCount} chờ xác nhận</div>}
								</span>
								<ChevDSvg className={`${s.chev} ${isOpen ? s.chevOpen : ''}`} />
							</button>
							{isOpen && (
								<div className={s.rowBody}>
									<TuitionAmounts item={item} />
									<p className={s.note}>
										Nội dung chuyển khoản của học viên: <b>{item.transfer_content}</b>
									</p>
									{canApprove && (
										<div className={s.rowActions}>
											{item.remaining > 0 && (
												<Button size='sm' onClick={() => setRecording(item)}>
													Ghi nhận khoản nộp
												</Button>
											)}
											<Button size='sm' variant='secondary' onClick={() => setEditing(item)}>
												Học phí và miễn giảm
											</Button>
										</div>
									)}
									<PaymentList
										payments={item.payments}
										actions={(p) => (
											<>
												{p.status === 'pending' && canApprove && (
													<>
														<Button size='sm' onClick={() => void confirm(item, p.id, p.amount)}>
															Xác nhận
														</Button>
														<Button size='sm' variant='secondary' onClick={() => void reject(p.id)}>
															Từ chối
														</Button>
													</>
												)}
												{p.status === 'confirmed' && (
													<Button
														size='sm'
														variant='secondary'
														icon={<DownloadSvg />}
														onClick={() => void downloadReceipt(() => courseTuitionApi.receipt(courseId, p.id), p.receipt_no)}
													>
														Phiếu thu
													</Button>
												)}
											</>
										)}
									/>
								</div>
							)}
						</div>
					);
				})}
				{!shown.length && <p className={s.note} style={{ padding: 'var(--space-4)' }}>Không có học viên ở mục này.</p>}
			</div>

			{recording && (
				<RecordModal
					item={recording}
					onClose={() => setRecording(null)}
					onSave={async (d) => {
						replace(await courseTuitionApi.record(courseId, recording.enrollment_id, d));
						notify.success('Đã ghi nhận và cấp biên lai');
					}}
				/>
			)}
			{editing && (
				<FeeModal
					item={editing}
					onClose={() => setEditing(null)}
					onSave={async (d) => {
						replace(await courseTuitionApi.setFee(courseId, editing.enrollment_id, d));
						notify.success('Đã lưu học phí');
					}}
				/>
			)}
		</>
	);
}

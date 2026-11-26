import { useState, type ReactNode } from 'react';
import { QRCode } from 'antd';
import { Badge, FileDropzone, FormField, Modal, ModalActions } from '@/shared/components';
import { DatePicker } from '@/shared/components/Input/DatePicker';
import m from '@/shared/components/Modal/Modal.module.css';
import { formatDateVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import {
	PAYMENT_METHOD,
	PAYMENT_STATUS,
	formatVnd,
	type TuitionBank,
	type TuitionItem,
	type TuitionPayment,
} from '../types/tuition.type';
import { buildVietQr } from '../utils/vietqr';
import { parseVndInput, todayVN } from '../utils/tuitionHelpers';
import s from './Tuition.module.css';


/** Học phí · miễn giảm · đã nộp · còn lại (số chính) */
export function TuitionAmounts({ item }: { item: TuitionItem }) {
	return (
		<div className={s.amounts}>
			<div className={s.amount}>
				<span>Học phí</span>
				<strong>{formatVnd(item.base)}</strong>
			</div>
			{item.discount > 0 && (
				<div className={s.amount}>
					<span>Miễn giảm</span>
					<strong>−{formatVnd(item.discount)}</strong>
					{item.discount_reason && <small>{item.discount_reason}</small>}
				</div>
			)}
			<div className={s.amount}>
				<span>Đã nộp</span>
				<strong>{formatVnd(item.paid)}</strong>
				{item.pending > 0 && <small>+ {formatVnd(item.pending)} chờ xác nhận</small>}
			</div>
			<div className={`${s.amount} ${s.main} ${item.remaining === 0 ? s.settled : ''}`}>
				<span>Còn phải nộp</span>
				<strong>{formatVnd(item.remaining)}</strong>
				{item.overpaid > 0 && <small>Nộp thừa {formatVnd(item.overpaid)}</small>}
			</div>
		</div>
	);
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
	const copy = () =>
		navigator.clipboard
			?.writeText(value)
			.then(() => notify.success(`Đã chép ${label.toLowerCase()}`))
			.catch(() => notify.error('Trình duyệt không cho chép — hãy chép tay'));
	return (
		<div className={s.field}>
			<span>{label}</span>
			{mono ? <code>{value}</code> : <strong>{value}</strong>}
			<button
				type='button'
				className={s.copy}
				onClick={copy}
				aria-label={`Chép ${label.toLowerCase()}`}
			>
				Chép
			</button>
		</div>
	);
}

/** Mã VietQR + thông tin chuyển khoản (số tiền = phần còn phải nộp chưa báo). */
export function TransferBox({ bank, item, amount, children }: { bank: TuitionBank; item: TuitionItem; amount: number; children?: ReactNode }) {
	const payload = buildVietQr({ bin: bank.bin, accountNo: bank.account_no, amount, content: item.transfer_content });
	return (
		<div className={s.transfer}>
			<div className={s.qr}>
				<QRCode
					value={payload}
					size={168}
					bordered={false}
					aria-label={`Mã VietQR chuyển ${formatVnd(amount)} tới ${bank.bank_name}`}
				/>
				<span>Quét bằng app ngân hàng</span>
			</div>
			<div className={s.fields}>
				<CopyField label='Ngân hàng' value={bank.bank_name} />
				<CopyField label='Số tài khoản' value={bank.account_no} mono />
				{bank.account_name && <CopyField label='Chủ tài khoản' value={bank.account_name} />}
				<CopyField label='Số tiền' value={String(amount)} mono />
				<CopyField label='Nội dung' value={item.transfer_content} mono />
				<div className={s.hint}>Giữ đúng nội dung chuyển khoản để phòng Đào tạo đối chiếu nhanh.</div>
				{children && <div className={s.transferActions}>{children}</div>}
			</div>
		</div>
	);
}

/** Form "Tôi đã chuyển khoản" — kèm ảnh / PDF chứng từ. */
export function PaySubmitModal({
	item,
	maxAmount,
	onClose,
	onSubmit,
}: {
	item: TuitionItem;
	maxAmount: number;
	onClose: () => void;
	onSubmit: (data: { amount: number; paid_date: string; transfer_ref?: string; note?: string }, file: File) => Promise<void>;
}) {
	const [amount, setAmount] = useState(String(maxAmount));
	const [date, setDate] = useState(todayVN());
	const [ref, setRef] = useState('');
	const [note, setNote] = useState('');
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});

	const submit = async () => {
		const n = parseVndInput(amount);
		const e: Record<string, string> = {};
		if (!Number.isInteger(n) || n <= 0) e.amount = 'Nhập số tiền đã chuyển (đồng)';
		else if (n > maxAmount) e.amount = `Không quá ${formatVnd(maxAmount)}`;
		if (!date) e.date = 'Chọn ngày chuyển khoản';
		if (!file) e.file = 'Đính kèm ảnh chụp hoặc file PDF chứng từ chuyển khoản';
		setErrors(e);
		if (Object.keys(e).length || !file) return;
		setBusy(true);
		try {
			await onSubmit({ amount: n, paid_date: date, transfer_ref: ref.trim() || undefined, note: note.trim() || undefined }, file);
			onClose();
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Không gửi được');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title='Báo đã chuyển khoản'
			subtitle={item.course_name}
			dirty={!!file || !!ref || !!note}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => void submit()}
					loading={busy}
					confirmLabel='Gửi xác nhận'
				/>
			}
		>
			<div className={s.formGrid}>
				<FormField label='Số tiền đã chuyển (đồng)' required error={errors.amount}>
					<input
						className={m.formInput}
						inputMode='numeric'
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
				</FormField>
				<FormField label='Ngày chuyển khoản' required error={errors.date}>
					<DatePicker value={date} onChange={setDate} max={todayVN()} />
				</FormField>
				<FormField label='Mã giao dịch' hint='Có trên biên lai của app ngân hàng (nếu có).' className={s.wide}>
					<input className={m.formInput} maxLength={100} value={ref} onChange={(e) => setRef(e.target.value)} />
				</FormField>
				<FormField label='Chứng từ chuyển khoản' required error={errors.file} className={s.wide}>
					<FileDropzone
						value={file}
						onChange={setFile}
						accept='.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
						hint='Ảnh chụp màn hình giao dịch thành công hoặc file PDF (JPG, PNG, PDF)'
					/>
				</FormField>
				<FormField label='Ghi chú cho phòng Đào tạo' className={s.wide}>
					<textarea className={m.formInput} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
				</FormField>
			</div>
		</Modal>
	);
}

/** Lịch sử nộp của 1 lượt ghi danh; actions = nút riêng từng phía (học viên / cán bộ). */
export function PaymentList({
	payments,
	actions,
	empty = 'Chưa có khoản nộp nào.',
}: {
	payments: TuitionPayment[];
	actions: (p: TuitionPayment) => ReactNode;
	empty?: string;
}) {
	if (!payments.length) return <p className={s.note}>{empty}</p>;
	return (
		<div className={s.history}>
			{payments.map((p) => {
				const st = PAYMENT_STATUS[p.status];
				return (
					<div key={p.id} className={s.pay}>
						<div className={s.payMain}>
							<div className={s.payLine}>
								<strong>{formatVnd(p.amount)}</strong>
								<Badge tone={st.tone}>{st.label}</Badge>
								{p.receipt_no && <span className={s.hint}>Biên lai {p.receipt_no}</span>}
							</div>
							<div className={s.payMeta}>
								<span>
									{PAYMENT_METHOD[p.method]} ngày {formatDateVN(p.paid_date)}
								</span>
								{p.transfer_ref && <span>Mã GD {p.transfer_ref}</span>}
								{p.file_url && (
									<a href={p.file_url} target='_blank' rel='noopener noreferrer'>
										Xem chứng từ
									</a>
								)}
								{p.reviewer_name && p.status !== 'pending' && <span>Người xử lý: {p.reviewer_name}</span>}
								{p.note && <span>Ghi chú: {p.note}</span>}
							</div>
							{p.status === 'rejected' && p.review_note && <div className={s.reject}>Lý do: {p.review_note}</div>}
						</div>
						<div className={s.payActions}>{actions(p)}</div>
					</div>
				);
			})}
		</div>
	);
}

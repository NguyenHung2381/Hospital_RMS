import { CheckSvg, EditSvg } from '@/assets/icons';
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { FormField } from '../Input/FormField';
import { Modal } from '../Modal';
import styles from '../Modal/Modal.module.css';
import { errorMessage } from './errorMessage';

export interface PromptDialogProps {
	open: boolean;
	title: ReactNode;
	/** Đoạn giải thích phía trên ô nhập. */
	message?: ReactNode;
	/** Nhãn ô nhập (bắt buộc — ô nhập luôn có tên truy cập). */
	label: ReactNode;
	defaultValue?: string;
	placeholder?: string;
	/** Ô nhiều dòng (lý do từ chối, ghi chú…). */
	multiline?: boolean;
	/** Không cho xác nhận khi chỉ có khoảng trắng. */
	required?: boolean;
	/** Câu báo khi bỏ trống ô bắt buộc. */
	requiredMessage?: string;
	maxLength?: number;
	/** Kiểm tra thêm — trả câu lỗi để chặn, trả undefined/'' để cho qua. */
	validate?: (value: string) => string | undefined | null;
	tone?: 'default' | 'danger';
	confirmLabel?: ReactNode;
	cancelLabel?: ReactNode;
	icon?: ReactNode;
	/**
	 * Nhận giá trị đã nhập (giữ nguyên, không tự trim). Trả Promise thì hộp thoại tự hiện
	 * đang xử lý và lỗi nếu reject. Hộp thoại KHÔNG tự đóng — nơi gọi đặt `open=false`.
	 */
	onConfirm: (value: string) => void | Promise<unknown>;
	onCancel: () => void;
	errorFallback?: string;
}

/**
 * Hộp thoại hỏi một giá trị (ô nhập hoặc textarea có nhãn, kiểm tra bắt buộc) — thay `window.prompt`.
 *
 *   <PromptDialog
 *     open={rejecting}
 *     title='Từ chối đơn đăng ký'
 *     label='Lý do từ chối'
 *     multiline
 *     required
 *     onCancel={() => setRejecting(false)}
 *     onConfirm={async (reason) => { await reject(id, reason); setRejecting(false); }}
 *   />
 *
 * Không cần state: `const reason = await promptDialog({ … })` (xem dialogStore.ts).
 */
export function PromptDialog(props: PromptDialogProps) {
	if (!props.open) return null;
	// Tách phần thân để giá trị nhập / lỗi tự reset mỗi lần mở lại
	return <PromptDialogBody {...props} />;
}

function PromptDialogBody({
	title,
	message,
	label,
	defaultValue = '',
	placeholder,
	multiline,
	required,
	requiredMessage = 'Vui lòng nhập thông tin này.',
	maxLength,
	validate,
	tone = 'default',
	confirmLabel = 'Xác nhận',
	cancelLabel = 'Hủy',
	icon,
	onConfirm,
	onCancel,
	errorFallback = 'Thao tác thất bại, vui lòng thử lại.',
}: PromptDialogProps) {
	const formId = useId();
	const [value, setValue] = useState(defaultValue);
	const [fieldError, setFieldError] = useState('');
	const [submitError, setSubmitError] = useState('');
	const [busy, setBusy] = useState(false);
	const danger = tone === 'danger';
	const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

	// Focus ô nhập khi mở — effect thay autoFocus để <Modal> kịp ghi nhớ chỗ trả focus khi đóng
	useEffect(() => {
		fieldRef.current?.focus();
	}, []);

	const check = (v: string) => {
		if (required && !v.trim()) return requiredMessage;
		return validate?.(v) || '';
	};

	const submit = async () => {
		const err = check(value);
		setFieldError(err);
		setSubmitError('');
		if (err) return;
		let result: void | Promise<unknown>;
		try {
			result = onConfirm(value);
		} catch (e) {
			setSubmitError(errorMessage(e, errorFallback));
			return;
		}
		if (!(result instanceof Promise)) return;
		setBusy(true);
		try {
			await result;
		} catch (e) {
			setSubmitError(errorMessage(e, errorFallback));
		} finally {
			setBusy(false);
		}
	};

	const cancel = () => {
		if (!busy) onCancel();
	};

	const commonProps = {
		value,
		placeholder,
		maxLength,
		disabled: busy,
		ref: fieldRef,
		onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setValue(e.target.value);
			if (fieldError) setFieldError(check(e.target.value));
		},
	};

	return (
		<Modal
			open
			onClose={cancel}
			title={title}
			icon={icon ?? <EditSvg />}
			tone={danger ? 'danger' : 'default'}
			size='sm'
			closeOnBackdrop={!busy}
			footer={
				<>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={cancel}
						disabled={busy}
					>
						{cancelLabel}
					</button>
					<button
						type='submit'
						form={formId}
						className={danger ? styles.btnDanger : styles.btnConfirm}
						disabled={busy}
						aria-busy={busy || undefined}
					>
						{busy ? (
							<span
								className={danger ? `${styles.spinner} ${styles.spinnerDark}` : styles.spinner}
								aria-hidden='true'
							/>
						) : (
							!danger && <CheckSvg aria-hidden='true' />
						)}
						{confirmLabel}
					</button>
				</>
			}
		>
			<form
				id={formId}
				className={styles.stack}
				noValidate
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
				{message &&
					(typeof message === 'string' ? <p className={styles.deleteDesc}>{message}</p> : message)}
				<FormField
					label={label}
					required={required}
					error={fieldError}
				>
					{multiline ? (
						<textarea
							className={styles.formTextarea}
							rows={4}
							{...commonProps}
						/>
					) : (
						<input
							type='text'
							className={styles.formInput}
							{...commonProps}
						/>
					)}
				</FormField>
				{submitError && (
					<div
						className={styles.error}
						role='alert'
					>
						{submitError}
					</div>
				)}
			</form>
		</Modal>
	);
}

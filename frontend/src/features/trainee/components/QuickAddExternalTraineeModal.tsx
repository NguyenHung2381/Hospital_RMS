import { useRef, useState } from 'react';
import { CheckSvg, PlusSvg, UserPlusSvg } from '@/assets/icons';
import { DatePicker, FileDropzone, Modal } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { showToast } from '@/shared/utils/feedback';
import { createTrainee } from '../api/traineeApi';
import { addTraineeDocument } from '../api/traineeDocumentApi';
import { EMPTY_FORM, GENDER_OPTIONS, type Trainee } from '../types/trainee.type';
import styles from '../pages/Trainees.module.css';
import m from '@/shared/components/Modal/Modal.module.css';

interface QuickForm {
	full_name: string;
	dob: string;
	gender: string;
	national_id: string;
	phone: string;
	email: string;
	workplace: string;
	qualification: string;
}

const EMPTY: QuickForm = {
	full_name: '',
	dob: '',
	gender: '',
	national_id: '',
	phone: '',
	email: '',
	workplace: '',
	qualification: '',
};

/**
 * Thêm nhanh học viên ngoại viện: chỉ thông tin cơ bản + (tùy chọn) 1 file PDF hồ sơ.
 * "Lưu & thêm tiếp" giữ modal mở, xóa trắng form để nhập người kế tiếp.
 */
export function QuickAddExternalTraineeModal({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	/** Gọi sau mỗi học viên tạo xong (kể cả khi tải file hồ sơ lỗi) */
	onCreated: (trainee: Trainee) => void;
}) {
	const uploadPolicy = useUploadPolicy();
	const [form, setForm] = useState<QuickForm>(EMPTY);
	const [file, setFile] = useState<File | null>(null);
	const [errors, setErrors] = useState<Partial<Record<keyof QuickForm, string>>>({});
	const [saving, setSaving] = useState(false);
	const [addedCount, setAddedCount] = useState(0);
	const nameRef = useRef<HTMLInputElement>(null);

	const set = (k: keyof QuickForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
		const value = e.target.value;
		setForm((f) => ({ ...f, [k]: value }));
		setErrors((er) => ({ ...er, [k]: '' }));
	};

	const validate = () => {
		const err: Partial<Record<keyof QuickForm, string>> = {};
		if (!form.full_name.trim()) err.full_name = 'Vui lòng nhập họ tên';
		if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) err.email = 'Email không hợp lệ';
		if (form.national_id && !/^\d{9,12}$/.test(form.national_id))
			err.national_id = 'CCCD/CMND phải gồm 9-12 chữ số';
		if (form.phone && !/^[0-9+\s.-]{8,15}$/.test(form.phone)) err.phone = 'Số điện thoại không hợp lệ';
		setErrors(err);
		return !Object.values(err).some(Boolean);
	};

	const save = async (keepOpen: boolean) => {
		if (saving || !validate()) return;
		setSaving(true);
		try {
			const created = await createTrainee({
				...EMPTY_FORM,
				...form,
				full_name: form.full_name.trim(),
				is_employee: false,
				is_active: true,
			});
			let fileNote = '';
			if (file) {
				try {
					await addTraineeDocument(created.id, file);
					created.doc_state = 'done';
				} catch (err) {
					fileNote = ` — chưa tải được file hồ sơ: ${err instanceof Error ? err.message : 'lỗi không rõ'}`;
				}
			}
			onCreated(created);
			showToast(fileNote ? 'error' : 'success', `Đã thêm học viên ngoại viện "${created.full_name}"${fileNote}`);
			if (keepOpen) {
				setForm(EMPTY);
				setFile(null);
				setErrors({});
				setAddedCount((n) => n + 1);
				nameRef.current?.focus();
			} else {
				onClose();
			}
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thêm học viên thất bại');
		} finally {
			setSaving(false);
		}
	};

	const input = (k: keyof QuickForm, placeholder: string, extra?: React.ComponentProps<'input'>) => (
		<input
			className={`${styles.formInput} ${errors[k] ? styles.inputError : ''}`}
			value={form[k]}
			onChange={set(k)}
			placeholder={placeholder}
			{...extra}
		/>
	);

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UserPlusSvg />}
			title='Thêm nhanh học viên ngoại viện'
			subtitle={
				addedCount
					? `Đã thêm ${addedCount} học viên trong lượt này — nhập người tiếp theo`
					: 'Chỉ cần thông tin cơ bản, bổ sung chi tiết sau ở hồ sơ học viên'
			}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						type='button'
						className={m.btnCancel}
						onClick={onClose}
						disabled={saving}
					>
						{addedCount ? 'Đóng' : 'Hủy'}
					</button>
					<button
						type='button'
						className={m.btnCancel}
						onClick={() => void save(true)}
						disabled={saving}
						title='Lưu rồi xóa trắng form để nhập người kế tiếp'
					>
						<PlusSvg /> Lưu &amp; thêm tiếp
					</button>
					<button
						type='button'
						className={m.btnConfirm}
						onClick={() => void save(false)}
						disabled={saving}
					>
						{saving ? <span className={m.spinner} /> : <CheckSvg />}
						Thêm học viên
					</button>
				</>
			}
		>
			<form
				className={styles.formGrid2}
				onSubmit={(e) => {
					e.preventDefault();
					void save(false);
				}}
			>
				<FormField
					label='Họ và tên'
					required
					error={errors.full_name}
					style={{ gridColumn: '1 / -1' }}
				>
					{input('full_name', 'VD: Nguyễn Văn A', { ref: nameRef, autoFocus: true })}
				</FormField>
				<FormField label='Ngày sinh'>
					<DatePicker
						value={form.dob}
						onChange={(v) => setForm((f) => ({ ...f, dob: v }))}
					/>
				</FormField>
				<FormField label='Giới tính'>
					<select
						className={styles.formInput}
						value={form.gender}
						onChange={set('gender')}
					>
						<option value=''>-- Chọn --</option>
						{GENDER_OPTIONS.map((g) => (
							<option
								key={g.value}
								value={g.value}
							>
								{g.label}
							</option>
						))}
					</select>
				</FormField>
				<FormField
					label='Số CCCD/CMND'
					error={errors.national_id}
				>
					{input('national_id', '12 chữ số', { inputMode: 'numeric', maxLength: 12 })}
				</FormField>
				<FormField
					label='Điện thoại'
					error={errors.phone}
				>
					{input('phone', 'VD: 0912 345 678', { inputMode: 'tel', maxLength: 20 })}
				</FormField>
				<FormField
					label='Email'
					error={errors.email}
				>
					{input('email', 'VD: ten@example.com', { type: 'email', maxLength: 100 })}
				</FormField>
				<FormField label='Trình độ chuyên môn'>
					{input('qualification', 'VD: Cử nhân điều dưỡng', { maxLength: 150 })}
				</FormField>
				<FormField
					label='Đơn vị công tác'
					style={{ gridColumn: '1 / -1' }}
				>
					{input('workplace', 'VD: Bệnh viện Đa khoa tỉnh...', { maxLength: 200 })}
				</FormField>
				<FormField
					label='Hồ sơ học viên (1 file PDF, tùy chọn)'
					style={{ gridColumn: '1 / -1' }}
				>
					<FileDropzone
						compact
						accept='.pdf,application/pdf'
						hint='Chỉ nhận 1 file PDF gộp đủ thông tin'
						maxSizeMB={uploadPolicy.maxSizeMB}
						value={file}
						onChange={setFile}
						disabled={saving}
					/>
				</FormField>
				{/* Enter trong ô nhập = Thêm học viên */}
				<button
					type='submit'
					hidden
				/>
			</form>
		</Modal>
	);
}

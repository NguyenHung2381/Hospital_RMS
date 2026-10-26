import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { useState } from 'react';
import { Button, FileDropzone, Modal } from '@/shared/components';
import {
	addMyCmeEvidence,
	createMyCmeRecord,
	updateMyCmeRecord,
	type MyCmeCategory,
	type MyCmeRecord,
	type MyCmeRecordForm,
} from '../api/meApi';
import styles from '../pages/SelfService.module.css';
import { SELF_FIELD } from '../utils/selfField';
import { CfgField, CfgVisible } from '@/shared/formConfig/CfgField';
import { CustomFields } from '@/shared/formConfig/CustomFields';
import { useFormConfig } from '@/shared/formConfig/useFormConfig';

interface Props {
	record: MyCmeRecord | null;
	categories: MyCmeCategory[];
	defaultYear: number;
	onClose: () => void;
	onSaved: () => void;
}

/** Người dùng tự khai CME — lưu xong ở trạng thái "Chờ duyệt"; người quản lý nhập số tín chỉ khi duyệt. */
export default function MyCmeRecordModal({ record, categories, defaultYear, onClose, onSaved }: Props) {
	const [form, setForm] = useState<MyCmeRecordForm>({
		category_id: record?.category_id ?? '',
		title: record?.title ?? '',
		activity_date: record?.activity_date?.slice(0, 10) ?? '',
		end_date: record?.end_date?.slice(0, 10) ?? '',
		year: String(record?.year ?? defaultYear),
		role: record?.role ?? '',
		quantity: record?.quantity == null ? '' : String(record.quantity),
		note: record?.note ?? '',
		custom: record?.custom ?? {},
	});
	// Nhãn / bắt buộc / giới hạn / trường tùy chỉnh theo Cấu hình form
	const cfg = useFormConfig('cme_record', 'portal');
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [evidence, setEvidence] = useState<File | null>(null);
	const uploadPolicy = useUploadPolicy();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const set = (k: Exclude<keyof MyCmeRecordForm, 'custom'>) => (e: { target: { value: string } }) => {
		setForm((f) => ({ ...f, [k]: e.target.value }));
		setFieldErrors((errs) => (errs[k] ? { ...errs, [k]: '' } : errs));
	};

	const pickCategory = (category_id: string) =>
		setForm((f) => ({ ...f, category_id, quantity: category_id && f.quantity === '' ? '1' : f.quantity }));
	const NO_GROUP = '__none__';
	const groupOf = (id: string) => categories.find((x) => x.id === id)?.group_name ?? NO_GROUP;
	const [group, setGroup] = useState(() => (record?.category_id ? groupOf(record.category_id) : ''));
	const groups = Array.from(new Set(categories.map((c) => c.group_name ?? NO_GROUP)));
	const inGroup = categories.filter((c) => (c.group_name ?? NO_GROUP) === group);

	// Id đã lưu — tạo mới xong mà tải minh chứng lỗi thì lần gửi sau là cập nhật, không tạo trùng
	const [savedId, setSavedId] = useState(record?.id ?? null);

	const save = async () => {
		if (!form.title.trim() || !form.year) return setError('Vui lòng nhập nội dung và năm');
		if (form.activity_date && form.end_date && form.end_date < form.activity_date)
			return setError('"Đến ngày" phải sau hoặc bằng "Từ ngày"');
		const { custom, ...values } = form;
		const cfgErrs = cfg.validate(values, custom, { mode: savedId ? 'edit' : 'create' });
		setFieldErrors(cfgErrs);
		const firstCfgErr = Object.values(cfgErrs)[0];
		if (firstCfgErr) return setError(firstCfgErr);
		setBusy(true);
		setError('');
		try {
			const saved = savedId ? await updateMyCmeRecord(savedId, form) : await createMyCmeRecord(form);
			const id = saved.id ?? savedId!;
			setSavedId(id);
			if (evidence) await addMyCmeEvidence(id, evidence);
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={record ? 'Sửa và gửi lại CME' : 'Khai báo CME'}
			size='md'
			footer={
				<>
					<Button variant='secondary' onClick={onClose} disabled={busy}>
						Hủy
					</Button>
					<Button onClick={save} loading={busy}>
						Gửi duyệt
					</Button>
				</>
			}
		>
			{error && <div className={styles.formError}>{error}</div>}
			<div className={styles.formGrid}>
				<CfgVisible cfg={cfg} name='category_id'>
					<label>
						Nhóm hoạt động
						<select
							value={group}
							onChange={(e) => {
								setGroup(e.target.value);
								pickCategory('');
							}}
						>
							<option value=''>-- Không thuộc danh mục --</option>
							{groups.map((g) => (
								<option key={g} value={g}>
									{g === NO_GROUP ? 'Khác' : g}
								</option>
							))}
						</select>
					</label>
				</CfgVisible>
				<CfgField cfg={cfg} name='category_id' label='Hình thức / danh mục' error={fieldErrors.category_id} classes={SELF_FIELD}>
					<select value={form.category_id} onChange={(e) => pickCategory(e.target.value)} disabled={!group}>
						<option value=''>-- Chọn --</option>
						{inGroup.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</CfgField>
				<CfgField cfg={cfg} name='title' label='Tên hoạt động' required error={fieldErrors.title} className={styles.formFull} classes={SELF_FIELD}>
					<input value={form.title} maxLength={255} onChange={set('title')} placeholder='VD: Tự học chuyên đề X' />
				</CfgField>
				<CfgField cfg={cfg} name='role' label='Vai trò' error={fieldErrors.role} classes={SELF_FIELD}>
					<input value={form.role} maxLength={100} onChange={set('role')} placeholder='Đại biểu, Báo cáo viên…' />
				</CfgField>
				<CfgField cfg={cfg} name='quantity' label='Số buổi tham gia' error={fieldErrors.quantity} classes={SELF_FIELD}>
					<input type='number' step='0.1' min='0' value={form.quantity} onChange={set('quantity')} />
				</CfgField>
				<CfgField cfg={cfg} name='activity_date' label='Từ ngày' error={fieldErrors.activity_date} classes={SELF_FIELD}>
					<input
						type='date'
						value={form.activity_date}
						onChange={(e) =>
							setForm((f) => ({ ...f, activity_date: e.target.value, year: e.target.value.slice(0, 4) || f.year }))
						}
					/>
				</CfgField>
				<CfgField cfg={cfg} name='end_date' label='Đến ngày' error={fieldErrors.end_date} classes={SELF_FIELD}>
					<input type='date' value={form.end_date} onChange={set('end_date')} />
				</CfgField>
				<CfgField cfg={cfg} name='year' label='Năm' required error={fieldErrors.year} classes={SELF_FIELD}>
					<input type='number' value={form.year} onChange={set('year')} />
				</CfgField>
				<CfgField cfg={cfg} name='note' label='Ghi chú' error={fieldErrors.note} classes={SELF_FIELD}>
					<input value={form.note} maxLength={500} onChange={set('note')} />
				</CfgField>
				<CustomFields
					cfg={cfg}
					value={form.custom}
					onChange={(custom) => setForm((f) => ({ ...f, custom }))}
					errors={fieldErrors}
					title={null}
					inputClassName={styles.cfgInput}
					classes={SELF_FIELD}
				/>
				<div className={styles.formFull}>
					<FileDropzone
						accept={uploadPolicy.accept}
						maxSizeMB={uploadPolicy.maxSizeMB}
						value={evidence}
						onChange={setEvidence}
						hint={record?.evidence_file_url ? 'Chọn file mới để thay minh chứng hiện có' : 'Minh chứng'}
						disabled={busy}
					/>
				</div>
			</div>
		</Modal>
	);
}

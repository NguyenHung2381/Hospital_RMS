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

interface Props {
	record: MyCmeRecord | null;
	categories: MyCmeCategory[];
	defaultYear: number;
	onClose: () => void;
	onSaved: () => void;
}

/** Người dùng tự khai CME — lưu xong ở trạng thái "Chờ duyệt", admin duyệt mới được tính tín chỉ. */
export default function MyCmeRecordModal({ record, categories, defaultYear, onClose, onSaved }: Props) {
	const [form, setForm] = useState<MyCmeRecordForm>({
		category_id: record?.category_id ?? '',
		title: record?.title ?? '',
		activity_date: record?.activity_date?.slice(0, 10) ?? '',
		end_date: record?.end_date?.slice(0, 10) ?? '',
		year: String(record?.year ?? defaultYear),
		role: record?.role ?? '',
		quantity: record?.quantity == null ? '' : String(record.quantity),
		credits: record ? String(record.credits) : '',
		note: record?.note ?? '',
	});
	const [evidence, setEvidence] = useState<File | null>(null);
	const uploadPolicy = useUploadPolicy();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const set = (k: keyof MyCmeRecordForm) => (e: { target: { value: string } }) =>
		setForm((f) => ({ ...f, [k]: e.target.value }));

	// Tín chỉ = định mức của danh mục × số lượng (mọi loại; định mức 0 = "Khác" → nhập tay)
	const autoCredits = (categoryId: string, quantity: string) => {
		const c = categories.find((x) => x.id === categoryId);
		if (!c?.conversion_value) return null;
		return String(+(c.conversion_value * (quantity === '' ? 1 : Number(quantity))).toFixed(2));
	};
	const pickCategory = (category_id: string) =>
		setForm((f) => {
			const quantity = category_id && f.quantity === '' ? '1' : f.quantity;
			return { ...f, category_id, quantity, credits: autoCredits(category_id, quantity) ?? f.credits };
		});
	const pickQuantity = (quantity: string) =>
		setForm((f) => ({ ...f, quantity, credits: autoCredits(f.category_id, quantity) ?? f.credits }));
	const NO_GROUP = '__none__';
	const groupOf = (id: string) => categories.find((x) => x.id === id)?.group_name ?? NO_GROUP;
	const [group, setGroup] = useState(() => (record?.category_id ? groupOf(record.category_id) : ''));
	const groups = Array.from(new Set(categories.map((c) => c.group_name ?? NO_GROUP)));
	const inGroup = categories.filter((c) => (c.group_name ?? NO_GROUP) === group);
	const unit = categories.find((x) => x.id === form.category_id)?.unit_label;

	// Id đã lưu — tạo mới xong mà tải minh chứng lỗi thì lần gửi sau là cập nhật, không tạo trùng
	const [savedId, setSavedId] = useState(record?.id ?? null);

	const save = async () => {
		if (!form.title.trim() || !form.year || form.credits === '')
			return setError('Vui lòng nhập nội dung, năm và số tín chỉ');
		if (form.activity_date && form.end_date && form.end_date < form.activity_date)
			return setError('"Đến ngày" phải sau hoặc bằng "Từ ngày"');
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
						Huỷ
					</Button>
					<Button onClick={save} loading={busy}>
						Gửi duyệt
					</Button>
				</>
			}
		>
			{error && <div className={styles.formError}>{error}</div>}
			<div className={styles.formGrid}>
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
				<label>
					Hình thức / danh mục
					<select value={form.category_id} onChange={(e) => pickCategory(e.target.value)} disabled={!group}>
						<option value=''>-- Chọn --</option>
						{inGroup.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</label>
				<label className={styles.formFull}>
					Nội dung hoạt động *
					<input value={form.title} onChange={set('title')} placeholder='VD: Tự học chuyên đề X' />
				</label>
				<label>
					Vai trò
					<input value={form.role} onChange={set('role')} placeholder='Đại biểu, Báo cáo viên…' />
				</label>
				<label>
					Số lượng{unit ? ` (${unit})` : ''}
					<input type='number' step='0.1' min='0' value={form.quantity} onChange={(e) => pickQuantity(e.target.value)} />
				</label>
				<label>
					Từ ngày
					<input
						type='date'
						value={form.activity_date}
						onChange={(e) =>
							setForm((f) => ({ ...f, activity_date: e.target.value, year: e.target.value.slice(0, 4) || f.year }))
						}
					/>
				</label>
				<label>
					Đến ngày
					<input type='date' value={form.end_date} onChange={set('end_date')} />
				</label>
				<label>
					Năm *
					<input type='number' value={form.year} onChange={set('year')} />
				</label>
				<label>
					Số tín chỉ *
					<input type='number' step='0.1' min='0' value={form.credits} onChange={set('credits')} />
				</label>
				<label>
					Ghi chú
					<input value={form.note} onChange={set('note')} />
				</label>
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

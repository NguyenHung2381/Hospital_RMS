import { useEffect, useMemo, useState } from 'react';
import { BadgeSvg } from '@/assets/icons';
import { DatePicker, Modal, ModalActions, SearchableSelect } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { apiClient } from '@/shared/api/axios';
import { toIsoDate } from '@/shared/utils/formatDate';
import {
	FIELD_LABELS,
	LICENSE_FIELDS,
	type LicenseField,
	type StaffLicense,
	type StaffLicenseFormData,
} from '../types/staffLicense.type';
import styles from '../pages/StaffLicenses.module.css';

type SimpleUser = { id: string; full_name: string; staff_number: number | null; is_dept_account?: boolean };

const DATE_FIELDS = new Set<LicenseField>(['issued_date', 'scope_adjusted_date']);
// Trường dài chiếm cả dòng; thứ tự hiển thị xếp các ô nửa dòng thành cặp
const WIDE_FIELDS = new Set<LicenseField>(['practice_scope', 'cme_specialty', 'adjusted_scope', 'notes']);
const FORM_ORDER: LicenseField[] = [
	'license_no',
	'issued_date',
	'issuing_authority',
	'title',
	'qualification',
	'primary_specialty',
	'scope_code',
	'practice_scope',
	'cme_specialty',
	'scope_decision_no',
	'scope_adjusted_date',
	'adjusted_scope',
	'notes',
];

const toForm = (l?: StaffLicense): StaffLicenseFormData => ({
	user_id: l?.user_id ?? '',
	...(Object.fromEntries(
		LICENSE_FIELDS.map((f) => [f, DATE_FIELDS.has(f) ? toIsoDate(l?.[f]) : (l?.[f] ?? '')]),
	) as Record<LicenseField, string>),
});

export function StaffLicenseFormModal({
	license,
	onClose,
	onSave,
	loading,
}: {
	license: StaffLicense | null;
	onClose: () => void;
	onSave: (d: StaffLicenseFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<StaffLicenseFormData>(() => toForm(license ?? undefined));
	const [error, setError] = useState('');
	const [users, setUsers] = useState<SimpleUser[]>([]);

	useEffect(() => {
		if (license) return;
		apiClient
			.get<{ data: SimpleUser[] }>('/users?limit=0')
			.then((r) => setUsers(r.data))
			.catch(() => {});
	}, [license]);

	const userOptions = useMemo(
		() =>
			users
				.filter((u) => !u.is_dept_account)
				.map((u) => ({ id: u.id, name: u.staff_number ? `${u.full_name} (${u.staff_number})` : u.full_name })),
		[users],
	);

	const set = (f: LicenseField, v: string) => setForm((x) => ({ ...x, [f]: v }));

	const submit = () => {
		if (!form.user_id) return setError('Vui lòng chọn nhân sự');
		onSave(form);
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<BadgeSvg />}
			title={license ? 'Sửa chứng chỉ hành nghề' : 'Thêm chứng chỉ hành nghề'}
			subtitle={license ? `${license.user_full_name}${license.staff_number ? ` — MNV ${license.staff_number}` : ''}` : undefined}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={submit}
					loading={loading}
					confirmLabel={license ? 'Lưu thay đổi' : 'Thêm CCHN'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				{!license && (
					<FormField label='Nhân sự' required error={error} style={{ gridColumn: '1 / -1' }}>
						<SearchableSelect
							options={userOptions}
							value={form.user_id}
							onChange={(id) => {
								setForm((x) => ({ ...x, user_id: id }));
								setError('');
							}}
							placeholder={users.length ? 'Gõ tên hoặc MNV để tìm' : 'Đang tải danh sách...'}
							hasError={!!error}
						/>
					</FormField>
				)}
				{FORM_ORDER.map((f) => (
					<FormField key={f} label={FIELD_LABELS[f]} style={WIDE_FIELDS.has(f) ? { gridColumn: '1 / -1' } : undefined}>
						{DATE_FIELDS.has(f) ? (
							<DatePicker value={form[f]} onChange={(v) => set(f, v)} />
						) : (
							<input className={styles.formInput} value={form[f]} onChange={(e) => set(f, e.target.value)} />
						)}
					</FormField>
				))}
			</div>
		</Modal>
	);
}

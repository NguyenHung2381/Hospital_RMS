import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components';
import React, { useState } from 'react';
import { BookOpenSvg } from '@/assets/icons';
import {
	EMPTY_FORM,
	SPECIALTY_GROUPS,
	type Department,
	type DeptFormData,
} from '../types/department.type';
import styles from '../pages/Departments.module.css';

export function DeptFormModal({
	mode,
	dept,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	dept?: Department;
	onClose: () => void;
	onSave: (d: DeptFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<DeptFormData>(
		dept
			? {
					name: dept.name,
					code: dept.code,
					abbreviation: dept.abbreviation,
					description: dept.description ?? '',
					specialty_group: dept.specialty_group ?? '',
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<DeptFormData>>({});

	const set =
		(k: keyof DeptFormData) =>
		(
			e: React.ChangeEvent<
				HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
			>,
		) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const name = e.target.value;
		setForm((f) => ({
			...f,
			name,
			...(mode === 'add'
				? {
						code: name
							.trim()
							.split(/\s+/)
							.filter(Boolean)
							.map((w) => w[0])
							.join('')
							.toUpperCase(),
					}
				: {}),
		}));
		setErrors((er) => ({ ...er, name: '' }));
	};

	const validate = () => {
		const err: Partial<DeptFormData> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên khoa phòng';
		if (!form.code.trim()) err.code = 'Vui lòng nhập mã';
		if (!form.abbreviation.trim()) err.abbreviation = 'Vui lòng nhập viết tắt';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<BookOpenSvg />}
			title={mode === 'add' ? 'Thêm khoa phòng' : 'Chỉnh sửa khoa phòng'}
			subtitle={mode === 'add' ? 'Thêm đơn vị mới vào hệ thống' : `Cập nhật — ${dept?.code}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => validate() && onSave(form)}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm khoa phòng' : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				<FormField
					label='Tên khoa phòng'
					required
					error={errors.name}
					style={{ gridColumn: '1 / -1' }}
				>
					<input
						className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
						value={form.name}
						onChange={handleNameChange}
						placeholder='VD: Khoa Nội Tim mạch'
					/>
				</FormField>
				<FormField
					label='Mã khoa'
					required
					error={errors.code}
				>
					<input
						className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
						value={form.code}
						onChange={set('code')}
						placeholder='VD: NOI-TIM'
					/>
				</FormField>
				<FormField
					label='Viết tắt'
					required
					error={errors.abbreviation}
				>
					<input
						className={`${styles.formInput} ${errors.abbreviation ? styles.inputError : ''}`}
						value={form.abbreviation}
						onChange={set('abbreviation')}
						placeholder='VD: Tim mạch'
					/>
				</FormField>
				<FormField
					label='Hệ chuyên môn'
					style={{ gridColumn: '1 / -1' }}
				>
					<select
						className={styles.formInput}
						value={form.specialty_group}
						onChange={set('specialty_group')}
					>
						<option value=''>-- Chưa gán hệ --</option>
						{SPECIALTY_GROUPS.map((g) => (
							<option
								key={g}
								value={g}
							>
								{g}
							</option>
						))}
					</select>
				</FormField>
				<FormField
					label='Mô tả'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea
						className={styles.formTextarea}
						value={form.description}
						onChange={set('description')}
						rows={3}
						placeholder='Mô tả ngắn về chức năng khoa phòng...'
					/>
				</FormField>
			</div>
		</Modal>
	);
}

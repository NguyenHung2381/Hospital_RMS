import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { SimpleItem } from '../../topics/api/topicApi';
import { InlineLoading } from '@/shared/components';
import styles from '../pages/MyTopics.module.css';
import { CustomFields } from '@/shared/formConfig/CustomFields';
import { CustomFieldsView } from '@/shared/formConfig/CustomFieldsView';
import type { CustomValues } from '@/shared/formConfig/types';
import type { FormConfig } from '@/shared/formConfig/useFormConfig';

interface EditForm {
	title: string;
	description: string;
	category_id: string;
	level_id: string;
	department_id: string;
}

interface EditTopicModalProps {
	editLoading: boolean;
	editError: string;
	editForm: EditForm;
	setEditForm: Dispatch<SetStateAction<EditForm>>;
	canEditTitle: boolean;
	canEditInfo: boolean;
	refData: {
		categories: SimpleItem[];
		levels: SimpleItem[];
		depts: SimpleItem[];
	} | null;
	refDataLoading: boolean;
	/** Cấu hình form (trang Cấu hình form) */
	cfg: FormConfig;
	errors: Record<string, string>;
	custom: CustomValues;
	setCustom: (next: CustomValues) => void;
	onClose: () => void;
	onSave: () => void;
	/** Phần sửa thành viên (hiện khi mốc cho phép). */
	children?: ReactNode;
}

export function EditTopicModal({
	editLoading,
	editError,
	editForm,
	setEditForm,
	canEditTitle,
	canEditInfo,
	refData,
	refDataLoading,
	cfg,
	errors,
	custom,
	setCustom,
	onClose,
	onSave,
	children,
}: EditTopicModalProps) {
	const { label: lbl, placeholder: ph } = cfg;
	const star = (k: string, def = false) => (cfg.required(k, def) ? ' *' : '');
	const below = (k: string) => (
		<>
			{cfg.hint(k) && <div className={styles.editHint}>{cfg.hint(k)}</div>}
			{errors[k] && <div className={styles.editFieldError}>{errors[k]}</div>}
		</>
	);
	return (
		<div
			className={styles.editBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget && !editLoading) onClose();
			}}
		>
			<div className={styles.editModal}>
				<div className={styles.editModalHeader}>
					<span className={styles.editModalTitle}>
						Chỉnh sửa thông tin đề tài
					</span>
					<button
						className={styles.viewerClose}
						onClick={() => !editLoading && onClose()}
					>
						✕
					</button>
				</div>

				<div className={styles.editModalBody}>
					{refDataLoading ? (
						<InlineLoading label='Đang tải dữ liệu…' />
					) : (
						<>
							<div className={styles.editField}>
								<label className={styles.editLabel}>{lbl('title', 'Tiêu đề đề tài')} *</label>
								<input
									className={styles.editInput}
									value={editForm.title}
									onChange={(e) =>
										setEditForm((f) => ({ ...f, title: e.target.value }))
									}
									placeholder={ph('title', 'Nhập tiêu đề đề tài')}
									maxLength={cfg.maxLength('title')}
									disabled={editLoading || !canEditTitle}
								/>
								{below('title')}
							</div>

							{cfg.visible('description') && (
								<div className={styles.editField}>
									<label className={styles.editLabel}>
										{lbl('description', 'Mô tả / Tóm tắt')}
										{star('description')}
									</label>
									<textarea
										className={styles.editTextarea}
										value={editForm.description}
										onChange={(e) =>
											setEditForm((f) => ({ ...f, description: e.target.value }))
										}
										placeholder={ph('description', 'Nhập mô tả đề tài')}
										maxLength={cfg.maxLength('description')}
										rows={4}
										disabled={editLoading || !canEditInfo}
									/>
									{below('description')}
								</div>
							)}

							<div className={styles.editFieldRow}>
								<div className={styles.editField}>
									<label className={styles.editLabel}>{lbl('category_id', 'Danh mục')}</label>
									<select
										className={styles.editSelect}
										value={editForm.category_id}
										onChange={(e) =>
											setEditForm((f) => ({
												...f,
												category_id: e.target.value,
											}))
										}
										disabled={editLoading || !canEditInfo}
									>
										<option value=''>-- Chọn danh mục --</option>
										{refData?.categories.map((c) => (
											<option
												key={c.id}
												value={c.id}
											>
												{c.name}
											</option>
										))}
									</select>
									{below('category_id')}
								</div>
								<div className={styles.editField}>
									{/* Cấp độ lấy theo đợt — chỉ hiển thị, đổi ở cấu hình đợt */}
									<label className={styles.editLabel}>Cấp độ (theo đợt)</label>
									<select
										className={styles.editSelect}
										value={editForm.level_id}
										disabled
									>
										<option value=''>-- Chọn cấp độ --</option>
										{refData?.levels.map((l) => (
											<option
												key={l.id}
												value={l.id}
											>
												{l.name}
											</option>
										))}
									</select>
								</div>
							</div>

							<div className={styles.editField}>
								<label className={styles.editLabel}>
									{lbl('department_id', 'Khoa/phòng')}
									{star('department_id', true)}
								</label>
								<select
									className={styles.editSelect}
									value={editForm.department_id}
									onChange={(e) =>
										setEditForm((f) => ({
											...f,
											department_id: e.target.value,
										}))
									}
									disabled={editLoading || !canEditInfo}
								>
									<option value=''>-- Chọn phòng ban --</option>
									{refData?.depts.map((d) => (
										<option
											key={d.id}
											value={d.id}
										>
											{d.name}
										</option>
									))}
								</select>
								{below('department_id')}
							</div>

							{canEditInfo ? (
								<CustomFields
									cfg={cfg}
									value={custom}
									onChange={setCustom}
									errors={errors}
									sectionClassName={styles.editLabel}
									inputClassName={styles.editInput}
								/>
							) : (
								<CustomFieldsView
									cfg={cfg}
									data={custom}
									itemClassName={styles.editField}
									labelClassName={styles.editLabel}
								/>
							)}

							{editError && <div className={styles.editError}>{editError}</div>}

							{children}
						</>
					)}
				</div>

				<div className={styles.editModalFooter}>
					<button
						className={styles.btnSecondary}
						onClick={onClose}
						disabled={editLoading}
					>
						Hủy
					</button>
					<button
						className={styles.btnPrimary}
						onClick={onSave}
						disabled={editLoading || !editForm.title.trim() || refDataLoading}
					>
						{editLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}

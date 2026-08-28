import type { Dispatch, SetStateAction } from 'react';
import type { SimpleItem } from '../../topics/api/topicApi';
import styles from '../pages/MyTopics.module.css';

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
	onClose: () => void;
	onSave: () => void;
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
	onClose,
	onSave,
}: EditTopicModalProps) {
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
						<div className={styles.stateBox}>
							<div className={styles.spinner} />
							<span>Đang tải dữ liệu...</span>
						</div>
					) : (
						<>
							<div className={styles.editField}>
								<label className={styles.editLabel}>Tiêu đề đề tài *</label>
								<input
									className={styles.editInput}
									value={editForm.title}
									onChange={(e) =>
										setEditForm((f) => ({ ...f, title: e.target.value }))
									}
									placeholder='Nhập tiêu đề đề tài'
									disabled={editLoading || !canEditTitle}
								/>
							</div>

							<div className={styles.editField}>
								<label className={styles.editLabel}>Mô tả / Tóm tắt</label>
								<textarea
									className={styles.editTextarea}
									value={editForm.description}
									onChange={(e) =>
										setEditForm((f) => ({ ...f, description: e.target.value }))
									}
									placeholder='Nhập mô tả đề tài'
									rows={4}
									disabled={editLoading || !canEditInfo}
								/>
							</div>

							<div className={styles.editFieldRow}>
								<div className={styles.editField}>
									<label className={styles.editLabel}>Danh mục</label>
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
								</div>
								<div className={styles.editField}>
									<label className={styles.editLabel}>Cấp độ</label>
									<select
										className={styles.editSelect}
										value={editForm.level_id}
										onChange={(e) =>
											setEditForm((f) => ({
												...f,
												level_id: e.target.value,
											}))
										}
										disabled={editLoading || !canEditInfo}
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
								<label className={styles.editLabel}>Phòng ban / Khoa</label>
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
							</div>

							{editError && <div className={styles.editError}>{editError}</div>}
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

import { useId, type Dispatch, type SetStateAction } from 'react';
import { SendSvg } from '@/assets/icons';
import { FormField, Modal } from '@/shared/components';
import type { Department } from '../../department/types/department.type';
import type { Topic } from '../../topics/types/topic.type';
import type { User } from '../../user/types/user.type';
import { NOTIF_TYPES, TARGET_LABELS, type TargetType } from '../types/notification.type';
import { DeptTargetPicker } from './DeptTargetPicker';
import { UserTargetPicker } from './UserTargetPicker';
import styles from '../pages/AdminNotifications.module.css';

export interface NotificationForm {
	type: string;
	title: string;
	message: string;
	target_type: TargetType;
	target_ids: string[];
	ref_id: string;
	ref_type: string;
}

interface NotificationSendFormProps {
	form: NotificationForm;
	setForm: Dispatch<SetStateAction<NotificationForm>>;
	depts: Department[];
	deptSearch: string;
	setDeptSearch: (v: string) => void;
	usersList: User[];
	userSearch: string;
	setUserSearch: (v: string) => void;
	loadingUsers: boolean;
	sending: boolean;
	expandedDepts: Set<string>;
	usersByDept: Record<string, User[]>;
	getDeptState: (deptId: string) => 'all' | 'some' | 'none';
	toggleDeptSelection: (deptId: string) => void;
	toggleUserInDept: (userId: string) => void;
	toggleUser: (userId: string) => void;
	selectAllTargets: () => void;
	clearTargets: () => void;
	toggleDeptExpanded: (deptId: string) => void;
	filteredDepts: Department[];
	filteredUsers: User[];
	topicSearch: string;
	setTopicSearch: (v: string) => void;
	topicResults: Topic[];
	loadingTopics: boolean;
	selectedTopic: Topic | null;
	onSelectTopic: (topic: Topic) => void;
	onClearTopic: () => void;
	onSend: () => void;
	onClose: () => void;
}

export function NotificationSendForm({
	form,
	setForm,
	deptSearch,
	setDeptSearch,
	usersList,
	userSearch,
	setUserSearch,
	loadingUsers,
	sending,
	expandedDepts,
	usersByDept,
	getDeptState,
	toggleDeptSelection,
	toggleUserInDept,
	toggleUser,
	selectAllTargets,
	clearTargets,
	toggleDeptExpanded,
	filteredDepts,
	filteredUsers,
	topicSearch,
	setTopicSearch,
	topicResults,
	loadingTopics,
	selectedTopic,
	onSelectTopic,
	onClearTopic,
	onSend,
	onClose,
}: NotificationSendFormProps) {
	const uid = useId();
	const deptGroupId = `${uid}-dept`;
	const usersGroupId = `${uid}-users`;
	const topicLabelId = `${uid}-topic`;
	// Đang gửi thì không cho đóng (nút X, Esc, bấm nền đều đi qua đây)
	const safeClose = () => {
		if (!sending) onClose();
	};
	// Đã nhập dở nội dung hoặc chọn người nhận thì hỏi lại trước khi đóng
	const dirty =
		!sending &&
		(form.title.trim() !== '' || form.message.trim() !== '' || form.target_ids.length > 0);

	return (
		<Modal
			open
			onClose={safeClose}
			closeOnBackdrop={!sending}
			dirty={dirty}
			title='Gửi thông báo'
			subtitle='Tạo và gửi thông báo đến người dùng'
			icon={<SendSvg />}
			bodyClassName={styles.sendBody}
			footer={
				<>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={onClose}
						disabled={sending}
					>
						Hủy
					</button>
					<button
						type='button'
						className={styles.btnSend}
						onClick={onSend}
						disabled={sending}
					>
						{sending ? (
							<span className={styles.spinner} />
						) : (
							<SendSvg style={{ width: 15, height: 15 }} />
						)}
						{sending ? 'Đang gửi...' : 'Gửi thông báo'}
					</button>
				</>
			}
		>
			<div className={styles.formRow2}>
				<FormField
					label='Loại thông báo'
					required
				>
					<select
						className={styles.formSelect}
						value={form.type}
						onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
					>
						{NOTIF_TYPES.map((t) => (
							<option
								key={t.value}
								value={t.value}
							>
								{t.label}
							</option>
						))}
					</select>
				</FormField>

				<FormField
					label='Đối tượng nhận'
					required
				>
					<select
						className={styles.formSelect}
						value={form.target_type}
						onChange={(e) =>
							setForm((f) => ({
								...f,
								target_type: e.target.value as TargetType,
								target_ids: [],
							}))
						}
					>
						{(Object.keys(TARGET_LABELS) as TargetType[]).map((k) => (
							<option
								key={k}
								value={k}
							>
								{TARGET_LABELS[k]}
							</option>
						))}
					</select>
				</FormField>
			</div>

			{form.target_type === 'department' && (
				<div
					className={styles.formGroup}
					role='group'
					aria-labelledby={deptGroupId}
				>
					<div className={styles.deptHeader}>
						<span
							id={deptGroupId}
							className={styles.formLabel}
						>
							Phòng ban & Thành viên
							{form.target_ids.length > 0 && (
								<span className={styles.selCount}>
									{' '}— {form.target_ids.length} người
								</span>
							)}
						</span>
						<div className={styles.deptActions}>
							<button
								type='button'
								className={styles.btnLink}
								onClick={selectAllTargets}
							>
								Chọn tất cả
							</button>
							<button
								type='button'
								className={styles.btnLink}
								onClick={clearTargets}
							>
								Bỏ chọn
							</button>
						</div>
					</div>
					<div className={styles.deptSearchWrap}>
						<input
							type='text'
							className={styles.deptSearchInput}
							aria-label='Tìm phòng ban hoặc người dùng'
							placeholder='Tìm phòng ban hoặc người dùng...'
							value={deptSearch}
							onChange={(e) => setDeptSearch(e.target.value)}
						/>
					</div>

					<DeptTargetPicker
						loadingUsers={loadingUsers}
						filteredDepts={filteredDepts}
						usersByDept={usersByDept}
						deptSearch={deptSearch}
						expandedDepts={expandedDepts}
						toggleDeptExpanded={toggleDeptExpanded}
						getDeptState={getDeptState}
						toggleDeptSelection={toggleDeptSelection}
						targetIds={form.target_ids}
						toggleUserInDept={toggleUserInDept}
					/>
				</div>
			)}

			{form.target_type === 'users' && (
				<div
					className={styles.formGroup}
					role='group'
					aria-labelledby={usersGroupId}
				>
					<div className={styles.deptHeader}>
						<span
							id={usersGroupId}
							className={styles.formLabel}
						>
							Chọn người nhận cụ thể ({form.target_ids.length}/{usersList.length})
						</span>
						<div className={styles.deptActions}>
							<button
								type='button'
								className={styles.btnLink}
								onClick={selectAllTargets}
							>
								Chọn tất cả
							</button>
							<button
								type='button'
								className={styles.btnLink}
								onClick={() => setForm((f) => ({ ...f, target_ids: [] }))}
							>
								Bỏ chọn
							</button>
						</div>
					</div>
					<div className={styles.deptSearchWrap}>
						<input
							type='text'
							className={styles.deptSearchInput}
							aria-label='Tìm người nhận theo họ tên, tài khoản hoặc mã nhân viên'
							placeholder='Tìm kiếm người dùng (họ tên, tài khoản, mã NV)...'
							value={userSearch}
							onChange={(e) => setUserSearch(e.target.value)}
						/>
					</div>
					<UserTargetPicker
						loadingUsers={loadingUsers}
						filteredUsers={filteredUsers}
						targetIds={form.target_ids}
						toggleUser={toggleUser}
					/>
				</div>
			)}

			<FormField
				label='Tiêu đề'
				required
			>
				<input
					className={styles.formInput}
					type='text'
					placeholder='Nhập tiêu đề thông báo...'
					value={form.title}
					onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
				/>
			</FormField>

			<FormField label='Nội dung'>
				<textarea
					className={styles.formInput}
					rows={4}
					placeholder='Nhập nội dung chi tiết...'
					value={form.message}
					onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
				/>
			</FormField>

			<div
				className={styles.formGroup}
				role='group'
				aria-labelledby={topicLabelId}
			>
				<span
					id={topicLabelId}
					className={styles.formLabel}
				>
					Đề tài liên quan (tùy chọn)
				</span>
				{selectedTopic ? (
					<div className={`${styles.userNode} ${styles.userNodeOn}`}>
						<span className={styles.userNodeName}>{selectedTopic.title}</span>
						<span className={styles.userNodeSub}>{selectedTopic.id}</span>
						<button
							type='button'
							className={styles.btnLink}
							onClick={onClearTopic}
						>
							Bỏ chọn
						</button>
					</div>
				) : (
					<>
						<div className={styles.deptSearchWrap}>
							<input
								type='text'
								className={styles.deptSearchInput}
								aria-label='Tìm đề tài theo tên hoặc mã'
								placeholder='Tìm đề tài theo tên hoặc mã...'
								value={topicSearch}
								onChange={(e) => setTopicSearch(e.target.value)}
							/>
						</div>
						{topicSearch.trim() && (
							<div className={styles.deptTreeList}>
								{loadingTopics ? (
									<div className={styles.emptyDeptText}>Đang tìm...</div>
								) : topicResults.length === 0 ? (
									<div className={styles.emptyDeptText}>Không tìm thấy đề tài</div>
								) : (
									topicResults.map((t) => (
										<button
											type='button'
											key={t.id}
											className={styles.userNode}
											onClick={() => onSelectTopic(t)}
										>
											<span className={styles.userNodeName}>{t.title}</span>
											<span className={styles.userNodeSub}>{t.id}</span>
										</button>
									))
								)}
							</div>
						)}
					</>
				)}
			</div>
		</Modal>
	);
}

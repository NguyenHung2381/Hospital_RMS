import type { SimpleItem } from '../api/topicApi';
import type { PendingMember } from '../hooks/useTopicModal';
import { useTopicModal } from '../hooks/useTopicModal';
import styles from '../pages/Topic.module.css';
import type { ArticleType, Topic, TopicForm, TopicStatus } from '../types/topic.type';
import { STATUS_CFG } from '../utils/topicHelpers';
import { ARTICLE_TYPE_CFG } from '../utils/topicRegisterHelpers';
import { FormField } from './FormField';
import { AlertSvg as IcAlert, CheckSvg as IcCheck, PlusSvg as IcPlus, XSvg as IcX } from '@/assets/icons';
import { ModalMembersSection } from './ModalMembersSection';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';
import { DatePicker } from '../../../shared/components/Input/DatePicker';

export type { PendingMember };

interface TopicModalProps {
	mode: 'create' | 'edit';
	topic?: Topic;
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
	onSave: (form: TopicForm, members: PendingMember[]) => Promise<void>;
}

export function TopicModal({
	mode,
	topic,
	categories,
	levels,
	rounds,
	departments,
	onClose,
	onSave,
}: TopicModalProps) {
	const m = useTopicModal({ topic, departments, onSave });

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={styles.modal}
				role='dialog'
				aria-modal='true'
				aria-labelledby='modal-title'
			>
				<div className={styles.modalHeader}>
					<div>
						<h2
							id='modal-title'
							className={styles.modalTitle}
						>
							{mode === 'create' ? 'Đăng ký đề tài mới' : 'Chỉnh sửa đề tài'}
						</h2>
						<p className={styles.modalSubtitle}>
							{mode === 'create'
								? 'Tạo đề tài nghiên cứu khoa học mới'
								: `Cập nhật thông tin — ${topic?.id}`}
						</p>
					</div>
					<button
						className={styles.modalCloseBtn}
						onClick={onClose}
						aria-label='Đóng'
					>
						<IcX />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formSection}>Thông tin đề tài</div>

					<FormField
						id='title'
						label='Tên đề tài'
						required
						error={m.errors.title}
						hint={`${m.form.title.length}/500 ký tự`}
					>
						<textarea
							id='title'
							className={`${styles.formInput} ${m.errors.title ? styles.hasError : ''}`}
							placeholder='Nhập tên đề tài nghiên cứu đầy đủ...'
							value={m.form.title}
							onChange={(e) => m.setField('title', e.target.value)}
							rows={3}
							maxLength={500}
						/>
					</FormField>

					<FormField
						id='description'
						label='Mô tả / Tóm tắt'
						hint='Mô tả mục tiêu, phương pháp, kết quả kỳ vọng'
					>
						<textarea
							id='description'
							className={styles.formInput}
							placeholder='Nhập tóm tắt đề tài...'
							value={m.form.description}
							onChange={(e) => m.setField('description', e.target.value)}
							rows={3}
							maxLength={2000}
						/>
					</FormField>

					<div className={styles.formSection}>Phân loại & Đợt nghiên cứu</div>

					<FormField
						id='article_type'
						label='Loại đăng ký'
					>
						<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
							{(Object.keys(ARTICLE_TYPE_CFG) as ArticleType[]).map((t) => (
								<button
									key={t}
									type='button'
									onClick={() => m.setField('article_type', t)}
									style={{
										padding: '6px 14px',
										borderRadius: 20,
										fontSize: 13,
										fontWeight: 600,
										cursor: 'pointer',
										transition: 'all 0.15s',
										border:
											m.form.article_type === t
												? '2px solid var(--color-primary)'
												: '2px solid var(--color-gray-200)',
										background:
											m.form.article_type === t
												? 'var(--color-primary)'
												: 'var(--color-white)',
										color:
											m.form.article_type === t
												? '#fff'
												: 'var(--color-gray-600)',
									}}
								>
									{ARTICLE_TYPE_CFG[t].tabLabel}
								</button>
							))}
						</div>
					</FormField>

					<div className={styles.formRow}>
						<FormField
							id='round_id'
							label='Đợt nghiên cứu'
							required
							error={m.errors.round_id}
						>
							<select
								id='round_id'
								className={styles.formSelect}
								value={m.form.round_id}
								onChange={(e) => m.setField('round_id', e.target.value)}
							>
								<option value=''>— Chọn đợt —</option>
								{rounds.map((r) => (
									<option
										key={r.id}
										value={r.id}
									>
										{r.name}
									</option>
								))}
							</select>
						</FormField>
						<FormField
							id='category_id'
							label='Phân loại'
							required
							error={m.errors.category_id}
						>
							<select
								id='category_id'
								className={styles.formSelect}
								value={m.form.category_id}
								onChange={(e) => m.setField('category_id', e.target.value)}
							>
								<option value=''>— Chọn phân loại —</option>
								{categories.map((c) => (
									<option
										key={c.id}
										value={c.id}
									>
										{c.name}
									</option>
								))}
							</select>
						</FormField>
					</div>

					<div className={styles.formRow}>
						{m.form.article_type !== 'bai_bao' && (
							<FormField
								id='level_id'
								label='Cấp độ đề tài'
								required
								error={m.errors.level_id}
							>
								<select
									id='level_id'
									className={styles.formSelect}
									value={m.form.level_id}
									onChange={(e) => m.setField('level_id', e.target.value)}
								>
									<option value=''>— Chọn cấp độ —</option>
									{levels.map((l) => (
										<option
											key={l.id}
											value={l.id}
										>
											{l.name}
										</option>
									))}
								</select>
							</FormField>
						)}
						<FormField
							id='department_id'
							label='Phòng ban / Khoa'
							required
							error={m.errors.department_id}
						>
							<SearchableSelect
								id='department_id'
								options={departments}
								value={m.form.department_id}
								onChange={(id) => m.setField('department_id', id)}
								placeholder='— Chọn phòng ban —'
								hasError={!!m.errors.department_id}
							/>
						</FormField>
					</div>

					{m.form.article_type === 'bai_bao' && (
						<div className={styles.formRow}>
							<FormField
								id='doi'
								label='DOI (nếu có)'
							>
								<input
									id='doi'
									className={styles.formInput}
									placeholder='VD: 10.1234/abcd.2026'
									value={m.form.doi}
									onChange={(e) => m.setField('doi', e.target.value)}
								/>
							</FormField>
							<FormField
								id='publish_date'
								label='Ngày xuất bản'
							>
								<DatePicker
									id='publish_date'
									value={m.form.publish_date}
									onChange={(val) => m.setField('publish_date', val)}
									placeholder='Chọn ngày xuất bản...'
								/>
							</FormField>
						</div>
					)}

					<FormField
						id='status'
						label='Trạng thái đề tài'
					>
						<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
							{(Object.keys(STATUS_CFG) as TopicStatus[]).map((s) => (
								<button
									key={s}
									type='button'
									onClick={() => m.setField('status', s)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 6,
										padding: '6px 14px',
										borderRadius: 20,
										fontSize: 13,
										fontWeight: 600,
										cursor: 'pointer',
										transition: 'all 0.15s',
										border:
											m.form.status === s
												? '2px solid var(--color-primary)'
												: '2px solid var(--color-gray-200)',
										background:
											m.form.status === s
												? 'var(--color-primary)'
												: 'var(--color-white)',
										color:
											m.form.status === s ? '#fff' : 'var(--color-gray-600)',
									}}
								>
									<span
										style={{
											width: 7,
											height: 7,
											borderRadius: '50%',
											flexShrink: 0,
											background:
												m.form.status === s
													? 'rgba(255,255,255,0.8)'
													: s === 'approved'
														? '#2eb87a'
														: s === 'submitted'
															? '#ef9f27'
															: s === 'rejected'
																? '#e24b4a'
																: '#9ca3af',
										}}
									/>
									{STATUS_CFG[s].label}
								</button>
							))}
						</div>
					</FormField>

					{mode === 'create' && (
						<ModalMembersSection
							departments={departments}
							pendingMembers={m.pendingMembers}
							memberQuery={m.memberQuery}
							setMemberQuery={m.setMemberQuery}
							suggestions={m.suggestions}
							isSearching={m.isSearching}
							showSuggestions={m.showSuggestions}
							setShowSuggestions={m.setShowSuggestions}
							addRole={m.addRole}
							setAddRole={m.setAddRole}
							isManualAdd={m.isManualAdd}
							setIsManualAdd={m.setIsManualAdd}
							closeManualAdd={m.closeManualAdd}
							manualForm={m.manualForm}
							setManualForm={m.setManualForm}
							manualRole={m.manualRole}
							setManualRole={m.setManualRole}
							manualError={m.manualError}
							deptName={m.deptName}
							selectUser={m.selectUser}
							addManual={m.addManual}
							removeMember={m.removeMember}
							changeRole={m.changeRole}
						/>
					)}
				</div>

				<div className={styles.modalFooter}>
					{m.saveError && (
						<span
							style={{ fontSize: 12, color: 'var(--color-red-600)', flex: 1 }}
						>
							<IcAlert /> {m.saveError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnPrimary}
						onClick={m.handleSubmit}
						disabled={m.loading}
					>
						{m.loading ? (
							<>
								<span className={styles.spinner} />
								Đang lưu...
							</>
						) : mode === 'create' ? (
							<>
								<IcPlus />
								Đăng ký đề tài
								{m.pendingMembers.length > 0
									? ` (${m.pendingMembers.length} TV)`
									: ''}
							</>
						) : (
							<>
								<IcCheck />
								Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

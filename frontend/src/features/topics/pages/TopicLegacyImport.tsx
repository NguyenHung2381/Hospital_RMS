import type React from 'react';
import {
	AlertSvg,
	BuildingSvg,
	HistorySvg,
	InfoSvg,
	ListSvg,
	LockSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { InlineLoading } from '../../../shared/components/Loading';
import { DatePicker } from '../../../shared/components/Input/DatePicker';
import { RegisterAttachmentsSection } from '../components/RegisterAttachmentsSection';
import { RegisterMemberSection } from '../components/RegisterMemberSection';
import { RegisterSidePanel } from '../components/RegisterSidePanel';
import { RoundLevelField } from '../components/RoundLevelField';
import { useTopicLegacyImport } from '../hooks/useTopicLegacyImport';
import type { AcceptanceRating, MemberRole } from '../types/topic.type';
import { ACCEPTANCE_RATING_CFG, ACCEPTANCE_RATINGS } from '../utils/topicHelpers';
import { ARTICLE_ROLE_CFG, LEGACY_GUIDE_STEPS } from '../utils/topicRegisterHelpers';
import styles from './TopicRegister.module.css';

const PAGE_TITLE = 'Nhập đề tài đã hoàn thành';
const ROUND_STATUS_LABEL: Record<string, string> = {
	draft: 'Nháp',
	active: 'Đang mở',
	closed: 'Đã đóng',
};

// Đợt đã làm xong trước khi có hệ thống: người dùng nhập lại đề tài + hồ sơ,
// quản lý NCKH xác nhận ở trang Phê duyệt như đăng ký thường.
export default function TopicLegacyImport() {
	const s = useTopicLegacyImport();
	const { form, errors, setField } = s;

	const breadcrumbs = [
		{ label: 'Đề tài', path: '/user/my-topics' },
		{ label: PAGE_TITLE },
	];
	const roleCfg = ARTICLE_ROLE_CFG.de_tai;
	const roleKeys = Object.keys(roleCfg) as MemberRole[];

	const layout = (children: React.ReactNode) => (
		<UserLayout
			userName={s.userName}
			userRole={s.userRole}
			userInitials={s.userInitials}
			pageTitle={PAGE_TITLE}
			breadcrumbs={breadcrumbs}
		>
			{children}
		</UserLayout>
	);

	if (s.loadingRef) return layout(<InlineLoading />);

	if (s.roundOptions.length === 0) {
		return layout(
			<div className={styles.emptyCard}>
				<div className={styles.emptyCardIcon}>
					<ListSvg />
				</div>
				<div className={styles.emptyTitle}>Chưa có đợt nghiên cứu nào</div>
				<div className={styles.emptyDesc}>
					Đề tài phải thuộc một đợt nghiên cứu. Vui lòng liên hệ quản lý NCKH tạo
					đợt mà đề tài đã thực hiện (trang Đợt nghiên cứu) rồi quay lại nhập.
				</div>
			</div>,
		);
	}

	const currentDeptName =
		s.depts.find((d) => d.id === s.currentDeptId)?.name ?? s.currentDeptId;

	const fieldError = (key: string) =>
		errors[key] ? (
			<div className={styles.formError}>
				<AlertSvg /> {errors[key]}
			</div>
		) : null;

	return layout(
		<div className={styles.pageGrid}>
			<div className={styles.leftCol}>
				<div className={styles.formCard}>
					<div className={styles.formCardHeader}>
						<div className={styles.formCardIcon}>
							<HistorySvg />
						</div>
						<div>
							<div className={styles.formCardTitle}>{PAGE_TITLE}</div>
							<div className={styles.formCardSub}>
								Nhập đề tài của các đợt đã thực hiện xong trước khi có hệ thống —
								gửi để quản lý NCKH xác nhận
							</div>
						</div>
					</div>

					<div className={styles.formCardBody}>
						<div className={styles.formSection}>Đợt nghiên cứu</div>

						<div className={styles.formGroup}>
							<label
								className={styles.formLabel}
								htmlFor='legacy-round'
							>
								Đợt đề tài đã thực hiện <span className={styles.formRequired}>*</span>
							</label>
							<select
								id='legacy-round'
								className={`${styles.formSelect} ${errors.round_id ? styles.hasError : ''}`}
								aria-invalid={errors.round_id ? true : undefined}
								value={form.round_id}
								onChange={(e) => setField('round_id', e.target.value)}
							>
								<option value=''>-- Chọn đợt nghiên cứu --</option>
								{s.roundOptions.map((r) => (
									<option
										key={r.id}
										value={r.id}
									>
										{r.name}
										{r.status && ROUND_STATUS_LABEL[r.status]
											? ` (${ROUND_STATUS_LABEL[r.status]})`
											: ''}
									</option>
								))}
							</select>
							{fieldError('round_id')}
							<div className={styles.dropZoneHint}>
								<InfoSvg
									width={12}
									height={12}
								/>{' '}
								Không thấy đợt cần nhập? Liên hệ quản lý NCKH tạo đợt đó trước.
							</div>
						</div>

						<div className={styles.formSection}>Thông tin đề tài</div>

						<div className={styles.formGroup}>
							<label
								className={styles.formLabel}
								htmlFor='legacy-title'
							>
								Tên đề tài <span className={styles.formRequired}>*</span>
							</label>
							<input
								id='legacy-title'
								className={`${styles.formInput} ${errors.title ? styles.hasError : ''}`}
								placeholder='Nhập tên đề tài nghiên cứu...'
								value={form.title}
								onChange={(e) => setField('title', e.target.value)}
							/>
							{fieldError('title')}
						</div>

						<div className={styles.formGroup}>
							<label
								className={styles.formLabel}
								htmlFor='legacy-desc'
							>
								Mô tả / Tóm tắt
							</label>
							<textarea
								id='legacy-desc'
								className={styles.formInput}
								rows={3}
								placeholder='Mục tiêu, phương pháp, kết quả chính của đề tài...'
								value={form.description}
								onChange={(e) => setField('description', e.target.value)}
							/>
						</div>

						<div className={styles.formRow}>
							<div className={styles.formGroup}>
								<span className={styles.formLabel}>Cấp độ</span>
								<RoundLevelField levelName={s.roundLevelName} />
							</div>
							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='legacy-dept'
								>
									Khoa phòng <span className={styles.formRequired}>*</span>
								</label>
								{s.currentDeptId ? (
									<div
										className={styles.lockedField}
										title='Theo tài khoản khoa/phòng đang đăng nhập'
									>
										<BuildingSvg className={styles.lockedFieldIcon} />
										<span className={styles.lockedFieldText}>{currentDeptName}</span>
										<LockSvg className={styles.lockedFieldLock} />
									</div>
								) : (
									<select
										id='legacy-dept'
										className={`${styles.formSelect} ${errors.department_id ? styles.hasError : ''}`}
										aria-invalid={errors.department_id ? true : undefined}
										value={form.department_id}
										onChange={(e) => setField('department_id', e.target.value)}
									>
										<option value=''>-- Chọn khoa/phòng ban --</option>
										{s.depts.map((d) => (
											<option
												key={d.id}
												value={d.id}
											>
												{d.name}
											</option>
										))}
									</select>
								)}
								{fieldError('department_id')}
							</div>
							<div className={`${styles.formGroup} ${styles.formRowFull}`}>
								<label
									className={styles.formLabel}
									htmlFor='legacy-cat'
								>
									Danh mục <span className={styles.formRequired}>*</span>
								</label>
								<select
									id='legacy-cat'
									className={`${styles.formSelect} ${errors.category_id ? styles.hasError : ''}`}
									aria-invalid={errors.category_id ? true : undefined}
									value={form.category_id}
									onChange={(e) => setField('category_id', e.target.value)}
								>
									<option value=''>-- Chọn phân loại danh mục --</option>
									{s.categories.map((c) => (
										<option
											key={c.id}
											value={c.id}
										>
											{c.name}
										</option>
									))}
								</select>
								{fieldError('category_id')}
							</div>
						</div>

						<div className={styles.formSection}>Kết quả nghiệm thu</div>

						<div className={styles.formGroup}>
							<span className={styles.formLabel}>Xếp loại</span>
							<div className={styles.statusPills}>
								{ACCEPTANCE_RATINGS.map((r) => (
									<button
										key={r}
										type='button'
										aria-pressed={form.acceptance_rating === r}
										className={`${styles.statusPill} ${form.acceptance_rating === r ? styles.statusPillActive : ''}`}
										onClick={() =>
											setField(
												'acceptance_rating',
												form.acceptance_rating === r ? '' : (r as AcceptanceRating),
											)
										}
									>
										{ACCEPTANCE_RATING_CFG[r].label}
									</button>
								))}
							</div>
						</div>

						<div className={styles.formRow}>
							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='legacy-score'
								>
									Điểm nghiệm thu (0–100)
								</label>
								<input
									id='legacy-score'
									type='number'
									min={0}
									max={100}
									step={0.01}
									inputMode='decimal'
									className={`${styles.formInput} ${errors.acceptance_score ? styles.hasError : ''}`}
									placeholder='VD: 85'
									value={form.acceptance_score}
									onChange={(e) => setField('acceptance_score', e.target.value)}
								/>
								{fieldError('acceptance_score')}
							</div>
							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='legacy-acc-date'
								>
									Ngày nghiệm thu
								</label>
								<DatePicker
									id='legacy-acc-date'
									value={form.acceptance_date}
									onChange={(val) => setField('acceptance_date', val)}
									placeholder='Chọn ngày nghiệm thu...'
								/>
							</div>
						</div>

						<div className={styles.formSection}>Thành viên tham gia</div>

						<RegisterMemberSection
							depts={s.depts}
							roleKeys={roleKeys}
							roleCfg={roleCfg}
							memberQuery={s.memberQuery}
							setMemberQuery={s.setMemberQuery}
							suggestions={s.suggestions}
							setSuggestions={s.setSuggestions}
							showSuggestions={s.showSuggestions}
							setShowSuggestions={s.setShowSuggestions}
							isSearching={s.isSearching}
							addRole={s.addRole}
							setAddRole={s.setAddRole}
							addedIds={s.addedIds}
							addMember={s.addMember}
							pendingMembers={s.pendingMembers}
							removeMember={s.removeMember}
							changeRole={s.changeRole}
							showManualForm={s.showManualForm}
							setShowManualForm={s.setShowManualForm}
							manualForm={s.manualForm}
							setManualForm={s.setManualForm}
							manualErrors={s.manualErrors}
							setManualErrors={s.setManualErrors}
							addMemberManual={s.addMemberManual}
						/>
						{fieldError('members')}

						<div
							className={styles.formSection}
							style={{ marginTop: 4 }}
						>
							Hồ sơ đề tài
						</div>

						<RegisterAttachmentsSection
							attachments={s.attachments}
							fileError={s.fileError}
							isDragging={s.isDragging}
							fileInputRef={s.fileInputRef}
							handleFiles={s.handleFiles}
							removeAttachment={s.removeAttachment}
							setIsDragging={s.setIsDragging}
						/>
					</div>

					<div className={styles.formFooter}>
						<span
							style={{
								flex: 1,
								fontSize: 12,
								color: 'var(--color-gray-400)',
							}}
						>
							Đề tài sẽ ở trạng thái "Chờ phê duyệt" cho tới khi được xác nhận
						</span>
						<button
							type='button'
							className={styles.btnSecondary}
							onClick={s.clearForm}
							disabled={s.submitting}
						>
							Xóa form
						</button>
						<button
							type='button'
							className={styles.btnPrimary}
							onClick={s.submit}
							disabled={s.submitting}
						>
							{s.submitting ? 'Đang gửi...' : 'Gửi xác nhận'}
						</button>
					</div>
				</div>
			</div>

			<RegisterSidePanel
				myTopics={s.myTopics}
				navigate={s.navigate}
				guideTitle='Hướng dẫn nhập đề tài'
				guideSteps={LEGACY_GUIDE_STEPS}
			/>
		</div>,
	);
}

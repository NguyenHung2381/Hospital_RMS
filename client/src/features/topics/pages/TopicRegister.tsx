import { AlertSvg, CheckSvg, FileTextSvg, ListSvg } from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { PendingTopicsCard } from '../components/PendingTopicsCard';
import { RegisterAttachmentsSection } from '../components/RegisterAttachmentsSection';
import { RegisterMemberSection } from '../components/RegisterMemberSection';
import { RegisterSidePanel } from '../components/RegisterSidePanel';
import { useTopicRegister } from '../hooks/useTopicRegister';
import type { ArticleType, MemberRole } from '../types/topic.type';
import { ARTICLE_ROLE_CFG, ARTICLE_TYPE_CFG } from '../utils/topicRegisterHelpers';
import styles from './TopicRegister.module.css';
import { DatePicker } from '../../../shared/components/Input/DatePicker';

export default function TopicRegister() {
	const {
		userName,
		userRole,
		userInitials,
		currentDeptId,
		canRegister,
		rounds,
		categories,
		levels,
		depts,
		myTopics,
		loadingRef,
		lockedRound,
		form,
		errors,
		setField,
		handleDeptChange,
		pendingTopics,
		submittingAll,
		submitError,
		addTopicToList,
		removeTopicFromList,
		submitAll,
		pendingMembers,
		memberQuery,
		suggestions,
		showSuggestions,
		isSearching,
		addRole,
		addedIds,
		setMemberQuery,
		setSuggestions,
		setShowSuggestions,
		setAddRole,
		addMember,
		removeMember,
		changeRole,
		showManualForm,
		manualForm,
		manualErrors,
		setShowManualForm,
		setManualForm,
		setManualErrors,
		addMemberManual,
		attachments,
		fileError,
		isDragging,
		fileInputRef,
		handleFiles,
		removeAttachment,
		setIsDragging,
		toast,
		navigate,
		clearForm,
	} = useTopicRegister();

	const breadcrumbs = [
		{ label: 'Đề tài', path: '/user/my-topics' },
		{ label: 'Đăng ký mới' },
	];

	const isPaper = form.article_type === 'bai_bao';
	const roleCfg = ARTICLE_ROLE_CFG[form.article_type];
	const roleKeys = Object.keys(roleCfg) as MemberRole[];

	if (loadingRef) {
		return (
			<UserLayout
				userName={userName}
				userRole={userRole}
				userInitials={userInitials}
				pageTitle='Đăng ký đề tài'
				breadcrumbs={breadcrumbs}
			>
				<div
					style={{
						textAlign: 'center',
						padding: 60,
						color: 'var(--color-gray-400)',
						fontSize: 14,
					}}
				>
					Đang tải dữ liệu...
				</div>
			</UserLayout>
		);
	}

	const activeRounds = rounds.filter((r) => !r.status || r.status === 'active');

	if (activeRounds.length === 0) {
		return (
			<UserLayout
				userName={userName}
				userRole={userRole}
				userInitials={userInitials}
				pageTitle='Đăng ký đề tài'
				breadcrumbs={breadcrumbs}
			>
				<div className={styles.emptyCard}>
					<div className={styles.emptyCardIcon}>
						<ListSvg />
					</div>
					<div className={styles.emptyTitle}>
						Chưa có vòng nghiên cứu nào đang mở
					</div>
					<div className={styles.emptyDesc}>
						Vui lòng liên hệ quản trị viên để biết thêm thông tin.
					</div>
				</div>
			</UserLayout>
		);
	}

	if (!canRegister) {
		return (
			<UserLayout
				userName={userName}
				userRole={userRole}
				userInitials={userInitials}
				pageTitle='Đăng ký đề tài'
				breadcrumbs={breadcrumbs}
			>
				<div className={styles.emptyCard}>
					<div
						className={styles.emptyCardIcon}
						style={{ background: '#fee2e2', color: '#ef4444' }}
					>
						<AlertSvg />
					</div>
					<div className={styles.emptyTitle}>
						Chức năng này chỉ dành cho tài khoản khoa phòng
					</div>
					<div className={styles.emptyDesc}>
						Tài khoản của bạn chưa được gán vào khoa phòng. Vui lòng liên hệ
						quản trị viên.
					</div>
				</div>
			</UserLayout>
		);
	}

	const currentDeptName =
		depts.find((d) => d.id === currentDeptId)?.name ?? currentDeptId;

	return (
		<UserLayout
			userName={userName}
			userRole={userRole}
			userInitials={userInitials}
			pageTitle={ARTICLE_TYPE_CFG[form.article_type].label}
			breadcrumbs={breadcrumbs}
		>
			<div className={styles.pageGrid}>
				{/* ── LEFT COLUMN ── */}
				<div className={styles.leftCol}>
					{/* FORM CARD */}
					<div className={styles.formCard}>
						<div className={styles.formCardHeader}>
							<div className={styles.formCardIcon}>
								<FileTextSvg />
							</div>
							<div>
								<div className={styles.formCardTitle}>
									{ARTICLE_TYPE_CFG[form.article_type].label}
								</div>
								<div className={styles.formCardSub}>
									{ARTICLE_TYPE_CFG[form.article_type].sub}
								</div>
							</div>
						</div>

						<div className={styles.formCardBody}>
							<div className={styles.statusPills}>
								{(Object.keys(ARTICLE_TYPE_CFG) as ArticleType[]).map((t) => (
									<button
										key={t}
										type='button'
										className={`${styles.statusPill} ${form.article_type === t ? styles.statusPillActive : ''}`}
										onClick={() => setField('article_type', t)}
									>
										{ARTICLE_TYPE_CFG[t].tabLabel}
									</button>
								))}
							</div>

							<div className={styles.formSection}>Thông tin cơ bản</div>

							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='reg-title'
								>
									{isPaper ? 'Tên bài báo / báo cáo' : 'Tiêu đề đề tài'}{' '}
									<span className={styles.formRequired}>*</span>
								</label>
								<input
									id='reg-title'
									className={`${styles.formInput} ${errors.title ? styles.hasError : ''}`}
									placeholder={
										isPaper
											? 'Nhập tên bài báo / báo cáo đăng tập san...'
											: 'Nhập tiêu đề đề tài nghiên cứu...'
									}
									value={form.title}
									onChange={(e) => setField('title', e.target.value)}
								/>
								{errors.title && (
									<div className={styles.formError}>
										<AlertSvg /> {errors.title}
									</div>
								)}
							</div>

							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='reg-desc'
								>
									Mô tả / Tóm tắt
								</label>
								<textarea
									id='reg-desc'
									className={styles.formInput}
									rows={3}
									placeholder='Mô tả ngắn về mục tiêu, phương pháp nghiên cứu...'
									value={form.description}
									onChange={(e) => setField('description', e.target.value)}
								/>
							</div>

							<div className={styles.formSection}>
								Phân loại &amp; Vòng nghiên cứu
							</div>

							<div className={styles.formRow}>
								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-round'
									>
										Vòng nghiên cứu{' '}
										<span className={styles.formRequired}>*</span>
									</label>
									{lockedRound ? (
										<div className={styles.deptLocked}>{lockedRound.name}</div>
									) : (
										<>
											<select
												id='reg-round'
												className={`${styles.formSelect} ${errors.round_id ? styles.hasError : ''}`}
												value={form.round_id}
												onChange={(e) => setField('round_id', e.target.value)}
											>
												<option value=''>-- Chọn đợt nghiên cứu --</option>
												{activeRounds.map((r) => (
													<option
														key={r.id}
														value={r.id}
													>
														{r.name}
													</option>
												))}
											</select>
											{errors.round_id && (
												<div className={styles.formError}>
													<AlertSvg /> {errors.round_id}
												</div>
											)}
										</>
									)}
								</div>
								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-cat'
									>
										Danh mục
									</label>
									<select
										id='reg-cat'
										className={styles.formSelect}
										value={form.category_id}
										onChange={(e) => setField('category_id', e.target.value)}
									>
										<option value=''>-- Chọn phân loại danh mục --</option>
										{categories.map((c) => (
											<option
												key={c.id}
												value={c.id}
											>
												{c.name}
											</option>
										))}
									</select>
								</div>
							</div>

							<div className={styles.formRow}>
								{!isPaper && (
									<div className={styles.formGroup}>
										<label
											className={styles.formLabel}
											htmlFor='reg-level'
										>
											Cấp độ
										</label>
										<select
											id='reg-level'
											className={styles.formSelect}
											value={form.level_id}
											onChange={(e) => setField('level_id', e.target.value)}
										>
											<option value=''>-- Chọn cấp đề tài --</option>
											{levels.map((l) => (
												<option
													key={l.id}
													value={l.id}
												>
													{l.name}
												</option>
											))}
										</select>
									</div>
								)}
								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-dept'
									>
										Khoa phòng <span className={styles.formRequired}>*</span>
									</label>
									{currentDeptId ? (
										<div className={styles.deptLocked}>{currentDeptName}</div>
									) : (
										<select
											id='reg-dept'
											className={`${styles.formSelect} ${errors.department_id ? styles.hasError : ''}`}
											value={form.department_id}
											onChange={(e) => handleDeptChange(e.target.value)}
										>
											<option value=''>-- Chọn khoa/phòng ban --</option>
											{depts.map((d) => (
												<option
													key={d.id}
													value={d.id}
												>
													{d.name}
												</option>
											))}
										</select>
									)}
									{errors.department_id && (
										<div className={styles.formError}>
											<AlertSvg /> {errors.department_id}
										</div>
									)}
								</div>
							</div>

							{isPaper && (
								<div className={styles.formRow}>
									<div className={styles.formGroup}>
										<label
											className={styles.formLabel}
											htmlFor='reg-doi'
										>
											DOI (nếu có)
										</label>
										<input
											id='reg-doi'
											className={styles.formInput}
											placeholder='VD: 10.1234/abcd.2026'
											value={form.doi}
											onChange={(e) => setField('doi', e.target.value)}
										/>
									</div>
									<div className={styles.formGroup}>
										<label
											className={styles.formLabel}
											htmlFor='reg-publish-date'
										>
											Ngày xuất bản
										</label>
										<DatePicker
											id='reg-publish-date'
											value={form.publish_date}
											onChange={(val) => setField('publish_date', val)}
											placeholder='Chọn ngày xuất bản...'
										/>
									</div>
								</div>
							)}

							<div className={styles.formSection}>
								{isPaper ? 'Tác giả' : 'Thành viên tham gia'}
							</div>

							<RegisterMemberSection
								depts={depts}
								roleKeys={roleKeys}
								roleCfg={roleCfg}
								memberQuery={memberQuery}
								setMemberQuery={setMemberQuery}
								suggestions={suggestions}
								setSuggestions={setSuggestions}
								showSuggestions={showSuggestions}
								setShowSuggestions={setShowSuggestions}
								isSearching={isSearching}
								addRole={addRole}
								setAddRole={setAddRole}
								addedIds={addedIds}
								addMember={addMember}
								pendingMembers={pendingMembers}
								removeMember={removeMember}
								changeRole={changeRole}
								showManualForm={showManualForm}
								setShowManualForm={setShowManualForm}
								manualForm={manualForm}
								setManualForm={setManualForm}
								manualErrors={manualErrors}
								setManualErrors={setManualErrors}
								addMemberManual={addMemberManual}
							/>

							<div
								className={styles.formSection}
								style={{ marginTop: 4 }}
							>
								Tài liệu đính kèm
							</div>

							<RegisterAttachmentsSection
								attachments={attachments}
								fileError={fileError}
								isDragging={isDragging}
								fileInputRef={fileInputRef}
								handleFiles={handleFiles}
								removeAttachment={removeAttachment}
								setIsDragging={setIsDragging}
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
								{pendingTopics.length > 0
									? `${pendingTopics.length} mục đang chờ gửi`
									: 'Chưa có mục nào trong danh sách'}
							</span>
							<button
								type='button'
								className={styles.btnSecondary}
								onClick={clearForm}
							>
								Xóa form
							</button>
							<button
								type='button'
								className={styles.btnPrimary}
								onClick={addTopicToList}
							>
								+ Thêm vào danh sách
							</button>
						</div>
					</div>

					{/* PENDING TOPICS CARD */}
					{pendingTopics.length > 0 && (
						<PendingTopicsCard
							pendingTopics={pendingTopics}
							rounds={rounds}
							removeTopicFromList={removeTopicFromList}
							submitError={submitError}
							submittingAll={submittingAll}
							submitAll={() => submitAll('submitted')}
						/>
					)}
				</div>

				{/* ── RIGHT: SIDE PANEL ── */}
				<RegisterSidePanel
					myTopics={myTopics}
					navigate={navigate}
				/>
			</div>

			{toast && (
				<div
					className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{toast.type === 'success' ? <CheckSvg /> : <AlertSvg />}
					{toast.msg}
				</div>
			)}
		</UserLayout>
	);
}

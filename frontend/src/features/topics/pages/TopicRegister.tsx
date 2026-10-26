import {
	AlertSvg,
	BuildingSvg,
	CalendarSvg,
	ChevRSvg,
	FileTextSvg,
	ListSvg,
	LockSvg,
	RefreshSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { InlineLoading } from '../../../shared/components/Loading';
import { PendingTopicsCard } from '../components/PendingTopicsCard';
import { RegisterAttachmentsSection } from '../components/RegisterAttachmentsSection';
import { RegisterMemberSection } from '../components/RegisterMemberSection';
import { RegisterSidePanel } from '../components/RegisterSidePanel';
import { RoundLevelField } from '../components/RoundLevelField';
import { useTopicRegister } from '../hooks/useTopicRegister';
import type { ArticleType, MemberRole } from '../types/topic.type';
import { ARTICLE_ROLE_CFG, ARTICLE_TYPE_CFG } from '../utils/topicRegisterHelpers';
import styles from './TopicRegister.module.css';
import { DatePicker } from '../../../shared/components/Input/DatePicker';
import { CustomFields } from '@/shared/formConfig/CustomFields';

export default function TopicRegister() {
	const {
		userName,
		userRole,
		userInitials,
		currentDeptId,
		canRegister,
		rounds,
		categories,
		roundLevelName,
		depts,
		myTopics,
		loadingRef,
		lockedRound,
		pickedRoundId,
		pickRound,
		resetRound,
		form,
		errors,
		setField,
		handleDeptChange,
		cfg,
		custom,
		setCustom,
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
		navigate,
		clearForm,
	} = useTopicRegister();

	const breadcrumbs = [
		{ label: 'Đề tài', path: '/user/my-topics' },
		{ label: 'Đăng ký mới' },
	];

	const isPaper = form.article_type === 'bai_bao';
	// Nhãn / bắt buộc / placeholder theo Cấu hình form (chưa tải xong = mặc định trong code)
	const { label: lbl, required: req, placeholder: ph, maxLength: maxLen } = cfg;
	const hint = (k: string) => {
		const h = cfg.hint(k);
		return h ? <div className={styles.formHint}>{h}</div> : null;
	};
	const reqMark = <span className={styles.formRequired}>*</span>;
	const allowedType = (t: ArticleType) => {
		const opts = cfg.field('article_type')?.options;
		return cfg.visible('article_type') && (!opts || opts.some((o) => o.value === t));
	};
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
				<InlineLoading />
			</UserLayout>
		);
	}

	const activeRounds = rounds.filter((r) => !r.status || r.status === 'active');

	// Ngoài thời gian "Đăng ký đề tài" của mọi đợt đang mở → không cho đăng ký.
	// (đợt chưa cấu hình mốc này thì server trả registration_open = true)
	const registrationOpen =
		lockedRound != null ||
		activeRounds.some((r) => r.registration_open !== false);

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
						Chức năng này chỉ dành cho tài khoản khoa/phòng
					</div>
					<div className={styles.emptyDesc}>
						Tài khoản của bạn chưa được gán vào khoa/phòng. Vui lòng liên hệ
						quản trị viên.
					</div>
				</div>
			</UserLayout>
		);
	}

	if (!registrationOpen) {
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
						style={{ background: '#fef3c7', color: '#b45309' }}
					>
						<AlertSvg />
					</div>
					<div className={styles.emptyTitle}>
						Ngoài thời gian đăng ký đề tài
					</div>
					<div className={styles.emptyDesc}>
						Hiện chưa đến hoặc đã hết thời gian đăng ký đề tài của đợt. Vui
						lòng quay lại trong thời gian quy định hoặc liên hệ quản trị viên.
					</div>
				</div>
			</UserLayout>
		);
	}

	// ── BƯỚC 1: chọn đợt ──
	// Chỉ liệt kê đợt đang mở cửa sổ "Đăng ký đề tài" (registration_open).
	const openRounds = activeRounds.filter((r) => r.registration_open !== false);
	const pickedRound =
		rounds.find((r) => r.id === (lockedRound?.id ?? pickedRoundId)) ?? null;

	if (!pickedRound) {
		return (
			<UserLayout
				userName={userName}
				userRole={userRole}
				userInitials={userInitials}
				pageTitle='Đăng ký đề tài'
				breadcrumbs={breadcrumbs}
			>
				<div className={styles.pageGrid}>
					<div className={styles.leftCol}>
						<div className={styles.roundPickerCard}>
							<div className={styles.roundPickerHead}>
								<div className={styles.formCardIcon}>
									<ListSvg />
								</div>
								<div>
									<div className={styles.formCardTitle}>
										Chọn đợt đăng ký đề tài
									</div>
									<div className={styles.formCardSub}>
										Chọn một đợt nghiên cứu đang trong thời gian nhận đăng ký
										để tiếp tục điền hồ sơ.
									</div>
								</div>
							</div>
							<div className={styles.roundPickerList}>
								{openRounds.map((r) => (
									<button
										key={r.id}
										type='button'
										className={styles.roundPickerItem}
										onClick={() => pickRound(r.id)}
									>
										<div className={styles.roundPickerItemMain}>
											<div className={styles.roundPickerItemName}>
												{r.name}
												{r.year ? (
													<span className={styles.roundPickerItemYear}>
														Năm {r.year}
													</span>
												) : null}
											</div>
											<div className={styles.roundPickerItemWindow}>
												<CalendarSvg />
												{r.registration_start || r.registration_end ? (
													<span>
														Nhận đăng ký: {r.registration_start ?? '…'} –{' '}
														{r.registration_end ?? '…'}
													</span>
												) : (
													<span>
														Nhận đăng ký: không giới hạn thời gian
													</span>
												)}
											</div>
										</div>
										<span className={styles.roundPickerItemCta}>
											Chọn đợt này <ChevRSvg />
										</span>
									</button>
								))}
							</div>
						</div>
					</div>

					<RegisterSidePanel
						myTopics={myTopics}
						navigate={navigate}
					/>
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
								{(Object.keys(ARTICLE_TYPE_CFG) as ArticleType[]).filter(allowedType).map((t) => (
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
									{lbl('title', isPaper ? 'Tên bài báo / báo cáo' : 'Tiêu đề đề tài')} {reqMark}
								</label>
								<input
									id='reg-title'
									className={`${styles.formInput} ${errors.title ? styles.hasError : ''}`}
									placeholder={ph(
										'title',
										isPaper
											? 'Nhập tên bài báo / báo cáo đăng tập san...'
											: 'Nhập tiêu đề đề tài nghiên cứu...',
									)}
									maxLength={maxLen('title')}
									value={form.title}
									onChange={(e) => setField('title', e.target.value)}
								/>
								{hint('title')}
								{errors.title && (
									<div className={styles.formError}>
										<AlertSvg /> {errors.title}
									</div>
								)}
							</div>

							{cfg.visible('description') && (
								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-desc'
									>
										{lbl('description', 'Mô tả / Tóm tắt')} {req('description') && reqMark}
									</label>
									<textarea
										id='reg-desc'
										className={`${styles.formInput} ${errors.description ? styles.hasError : ''}`}
										rows={3}
										placeholder={ph('description', 'Mô tả ngắn về mục tiêu, phương pháp nghiên cứu...')}
										maxLength={maxLen('description')}
										value={form.description}
										onChange={(e) => setField('description', e.target.value)}
									/>
									{hint('description')}
									{errors.description && (
										<div className={styles.formError}>
											<AlertSvg /> {errors.description}
										</div>
									)}
								</div>
							)}

							<div className={styles.formSection}>
								Phân loại &amp; Vòng nghiên cứu
							</div>

							<div className={styles.roundCard}>
								<span className={styles.roundCardIcon}>
									<CalendarSvg />
								</span>
								<div className={styles.roundCardBody}>
									<span className={styles.roundCardLabel}>
										Vòng nghiên cứu
									</span>
									<span
										className={styles.roundCardName}
										title={pickedRound.name}
									>
										{pickedRound.name}
									</span>
								</div>
								{lockedRound ? (
									<span className={styles.lockedHint}>
										<LockSvg /> Theo liên kết đăng ký
									</span>
								) : (
									<button
										type='button'
										className={styles.changeRoundBtn}
										onClick={resetRound}
									>
										<RefreshSvg /> Đổi đợt
									</button>
								)}
							</div>

							<div className={styles.formRow}>
								{!isPaper && (
									<div className={styles.formGroup}>
										<span className={styles.formLabel}>Cấp độ</span>
										<RoundLevelField levelName={roundLevelName} />
									</div>
								)}
								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-dept'
									>
										{lbl('department_id', 'Khoa phòng')} {req('department_id', true) && reqMark}
									</label>
									{currentDeptId ? (
										<div
											className={styles.lockedField}
											title='Theo tài khoản khoa/phòng đang đăng nhập'
										>
											<BuildingSvg className={styles.lockedFieldIcon} />
											<span className={styles.lockedFieldText}>
												{currentDeptName}
											</span>
											<LockSvg className={styles.lockedFieldLock} />
										</div>
									) : (
										<select
											id='reg-dept'
											className={`${styles.formSelect} ${errors.department_id ? styles.hasError : ''}`}
											aria-invalid={errors.department_id ? true : undefined}
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
								<div
									className={`${styles.formGroup} ${isPaper ? '' : styles.formRowFull}`}
								>
									<label
										className={styles.formLabel}
										htmlFor='reg-cat'
									>
										{lbl('category_id', 'Danh mục')} {reqMark}
									</label>
									<select
										id='reg-cat'
										className={`${styles.formSelect} ${errors.category_id ? styles.hasError : ''}`}
										aria-invalid={errors.category_id ? true : undefined}
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
									{errors.category_id && (
										<div className={styles.formError}>
											<AlertSvg /> {errors.category_id}
										</div>
									)}
								</div>
							</div>

							{isPaper && (cfg.visible('doi') || cfg.visible('publish_date')) && (
								<div className={styles.formRow}>
									{cfg.visible('doi') && (
										<div className={styles.formGroup}>
											<label
												className={styles.formLabel}
												htmlFor='reg-doi'
											>
												{lbl('doi', 'DOI (nếu có)')} {req('doi') && reqMark}
											</label>
											<input
												id='reg-doi'
												className={`${styles.formInput} ${errors.doi ? styles.hasError : ''}`}
												placeholder={ph('doi', 'VD: 10.1234/abcd.2026')}
												maxLength={maxLen('doi')}
												value={form.doi}
												onChange={(e) => setField('doi', e.target.value)}
											/>
											{hint('doi')}
											{errors.doi && (
												<div className={styles.formError}>
													<AlertSvg /> {errors.doi}
												</div>
											)}
										</div>
									)}
									{cfg.visible('publish_date') && (
										<div className={styles.formGroup}>
											<label
												className={styles.formLabel}
												htmlFor='reg-publish-date'
											>
												{lbl('publish_date', 'Ngày xuất bản')} {req('publish_date') && reqMark}
											</label>
											<DatePicker
												id='reg-publish-date'
												value={form.publish_date}
												onChange={(val) => setField('publish_date', val)}
												placeholder={ph('publish_date', 'Chọn ngày xuất bản...')}
												hasError={!!errors.publish_date}
											/>
											{hint('publish_date')}
											{errors.publish_date && (
												<div className={styles.formError}>
													<AlertSvg /> {errors.publish_date}
												</div>
											)}
										</div>
									)}
								</div>
							)}

							<CustomFields
								cfg={cfg}
								value={custom}
								onChange={setCustom}
								errors={errors}
								sectionClassName={styles.formSection}
								inputClassName={styles.formInput}
							/>

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

		</UserLayout>
	);
}

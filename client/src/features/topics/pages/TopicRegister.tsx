import { AlertSvg, CheckSvg, ChevRSvg, FileTextSvg, HelpSvg, ListSvg, PaperclipSvg, SearchSvg, SendSvg, UploadSvg, UserPlusSvg, XSvg } from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { useTopicRegister } from '../hooks/useTopicRegister';
import type { MemberRole } from '../types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import { BADGE_CLS, fmtDate, GUIDE_STEPS, ROLE_CFG, STATUS_CFG } from '../utils/topicRegisterHelpers';
import styles from './TopicRegister.module.css';

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
			pageTitle='Đăng ký đề tài mới'
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
									Đăng ký đề tài nghiên cứu
								</div>
								<div className={styles.formCardSub}>
									Điền thông tin rồi nhấn "Thêm vào danh sách"
								</div>
							</div>
						</div>

						<div className={styles.formCardBody}>
							<div className={styles.formSection}>Thông tin cơ bản</div>

							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='reg-title'
								>
									Tiêu đề đề tài <span className={styles.formRequired}>*</span>
								</label>
								<input
									id='reg-title'
									className={`${styles.formInput} ${errors.title ? styles.hasError : ''}`}
									placeholder='Nhập tiêu đề đề tài nghiên cứu...'
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
												<option value=''>-- Chọn vòng --</option>
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
										<option value=''>-- Chọn danh mục --</option>
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
										<option value=''>-- Chọn cấp độ --</option>
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
											<option value=''>-- Chọn khoa --</option>
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

							<div className={styles.formSection}>Thành viên tham gia</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Tìm kiếm thành viên</label>
								<div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
									<div
										className={styles.memberSearch}
										style={{ flex: 1, marginBottom: 0 }}
									>
										<span className={styles.memberSearchIcon}>
											{isSearching ? (
												<span
													style={{
														width: 15,
														height: 15,
														border: '2px solid #cbd5e1',
														borderTopColor: '#1a6abd',
														borderRadius: '50%',
														display: 'inline-block',
														animation: 'spin 0.6s linear infinite',
													}}
												/>
											) : (
												<SearchSvg />
											)}
										</span>
										<input
											className={styles.memberSearchInput}
											placeholder='Tìm theo tên hoặc mã nhân viên...'
											value={memberQuery}
											onChange={(e) => {
												const val = e.target.value;
												setMemberQuery(val);
												if (val.trim().length < 2) {
													setSuggestions([]);
													setShowSuggestions(false);
												}
											}}
											onBlur={() =>
												setTimeout(() => setShowSuggestions(false), 180)
											}
											onFocus={() =>
												suggestions.length > 0 && setShowSuggestions(true)
											}
										/>
										{showSuggestions && (
											<div className={styles.suggestionsBox}>
												{suggestions.length > 0 ? (
													suggestions.map((u) => {
														const already = addedIds.has(u.id);
														return (
															<div
																key={u.id}
																className={`${styles.suggestionItem} ${already ? styles.suggestionDisabled : ''}`}
																onMouseDown={() => !already && addMember(u)}
															>
																<div className={styles.suggAvatar}>
																	{getInitials(u.full_name)}
																</div>
																<div style={{ flex: 1, minWidth: 0 }}>
																	<div className={styles.suggName}>
																		{u.full_name}
																	</div>
																	<div className={styles.suggMeta}>
																		{u.username} · MNV: {u.staff_number ?? '—'}
																	</div>
																</div>
																{already ? (
																	<span className={styles.suggAdded}>
																		Đã thêm
																	</span>
																) : (
																	<span className={styles.suggAdd}>+ Thêm</span>
																)}
															</div>
														);
													})
												) : (
													<div className={styles.noResults}>
														<span>Không tìm thấy kết quả</span>
														<button
															type='button'
															className={styles.suggAdd}
															onMouseDown={(e) => {
																e.preventDefault();
																setShowSuggestions(false);
																setManualForm({
																	...manualForm,
																	ho_ten: memberQuery,
																	role: addRole,
																});
																setShowManualForm(true);
															}}
														>
															+ Thêm thủ công
														</button>
													</div>
												)}
											</div>
										)}
									</div>
									<select
										className={styles.formSelect}
										style={{ width: 130, flexShrink: 0 }}
										value={addRole}
										onChange={(e) => setAddRole(e.target.value as MemberRole)}
									>
										{(Object.keys(ROLE_CFG) as MemberRole[]).map((r) => (
											<option
												key={r}
												value={r}
											>
												{ROLE_CFG[r].label}
											</option>
										))}
									</select>
								</div>
								<div className={styles.formHint}>
									Tìm tối thiểu 2 ký tự · Chỉ thành viên cùng khoa phòng
								</div>
							</div>

							{!showManualForm && (
								<button
									type='button'
									className={styles.manualAddTrigger}
									onClick={() => {
										setManualForm({
											ho_ten: '',
											staff_number: '',
											phone_number: '',
											chuc_vu: '',
											department_id: '',
											role: pendingMembers.length === 0 ? 'leader' : 'member',
										});
										setShowManualForm(true);
									}}
								>
									<UserPlusSvg /> Thêm thành viên thủ công
								</button>
							)}

							{showManualForm && (
								<div className={styles.manualAddForm}>
									<div className={styles.manualAddTitle}>
										Thêm thành viên thủ công
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Họ tên <span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.ho_ten ? styles.hasError : ''}`}
												placeholder='Nguyễn Văn A'
												value={manualForm.ho_ten}
												onChange={(e) => {
													setManualForm({
														...manualForm,
														ho_ten: e.target.value,
													});
													setManualErrors({ ...manualErrors, ho_ten: '' });
												}}
											/>
											{manualErrors.ho_ten && (
												<div className={styles.formError}>
													<AlertSvg /> {manualErrors.ho_ten}
												</div>
											)}
										</div>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Mã nhân viên{' '}
												<span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.staff_number ? styles.hasError : ''}`}
												placeholder='NV001'
												value={manualForm.staff_number}
												onChange={(e) => {
													setManualForm({
														...manualForm,
														staff_number: e.target.value,
													});
													setManualErrors({
														...manualErrors,
														staff_number: '',
													});
												}}
											/>
											{manualErrors.staff_number && (
												<div className={styles.formError}>
													<AlertSvg /> {manualErrors.staff_number}
												</div>
											)}
										</div>
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Số điện thoại{' '}
												<span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.phone_number ? styles.hasError : ''}`}
												placeholder='0912345678'
												type='tel'
												value={manualForm.phone_number}
												onChange={(e) => {
													setManualForm({
														...manualForm,
														phone_number: e.target.value,
													});
													setManualErrors({
														...manualErrors,
														phone_number: '',
													});
												}}
											/>
											{manualErrors.phone_number && (
												<div className={styles.formError}>
													<AlertSvg /> {manualErrors.phone_number}
												</div>
											)}
										</div>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Chức danh <span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.chuc_vu ? styles.hasError : ''}`}
												placeholder='Bác sĩ, Điều dưỡng...'
												value={manualForm.chuc_vu}
												onChange={(e) => {
													setManualForm({
														...manualForm,
														chuc_vu: e.target.value,
													});
													setManualErrors({ ...manualErrors, chuc_vu: '' });
												}}
											/>
											{manualErrors.chuc_vu && (
												<div className={styles.formError}>
													<AlertSvg /> {manualErrors.chuc_vu}
												</div>
											)}
										</div>
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>Khoa phòng</label>
											<select
												className={styles.formSelect}
												value={manualForm.department_id}
												onChange={(e) =>
													setManualForm({
														...manualForm,
														department_id: e.target.value,
													})
												}
											>
												<option value=''>-- Chọn khoa --</option>
												{depts.map((d) => (
													<option
														key={d.id}
														value={d.id}
													>
														{d.name}
													</option>
												))}
											</select>
										</div>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Vai trò trong đề tài
											</label>
											<select
												className={styles.formSelect}
												value={manualForm.role}
												onChange={(e) =>
													setManualForm({
														...manualForm,
														role: e.target.value as MemberRole,
													})
												}
											>
												{(Object.keys(ROLE_CFG) as MemberRole[]).map((r) => (
													<option
														key={r}
														value={r}
													>
														{ROLE_CFG[r].label}
													</option>
												))}
											</select>
										</div>
									</div>

									<div
										style={{
											display: 'flex',
											gap: 8,
											justifyContent: 'flex-end',
										}}
									>
										<button
											type='button'
											className={styles.btnSecondary}
											style={{ padding: '7px 14px', fontSize: 12.5 }}
											onClick={() => {
												setShowManualForm(false);
												setManualErrors({});
											}}
										>
											Huỷ
										</button>
										<button
											type='button'
											className={styles.btnPrimary}
											style={{ padding: '7px 14px', fontSize: 12.5 }}
											onClick={addMemberManual}
										>
											Thêm thành viên
										</button>
									</div>
								</div>
							)}

							{pendingMembers.length > 0 && (
								<div className={styles.manualBox}>
									<div className={styles.memberList}>
										{pendingMembers.map((m) => (
											<div
												key={m.id}
												className={styles.memberItem}
											>
												<div className={styles.memberAvatar}>
													{getInitials(m.ho_ten)}
												</div>
												<div className={styles.memberInfo}>
													<div className={styles.memberName}>{m.ho_ten}</div>
													<div className={styles.memberMeta}>
														{m.staff_number && (
															<span>MNV: {m.staff_number} · </span>
														)}
														{m.chuc_vu && <span>{m.chuc_vu} · </span>}
														{m.phone_number ? (
															<span>{m.phone_number}</span>
														) : m.email ? (
															<span>{m.email}</span>
														) : null}
													</div>
												</div>
												<select
													style={{
														fontSize: 12,
														padding: '3px 8px',
														border: '1px solid var(--color-gray-200)',
														borderRadius: 6,
														background: 'var(--color-white)',
														color: 'var(--color-gray-700)',
														cursor: 'pointer',
														outline: 'none',
													}}
													value={m.role}
													onChange={(e) =>
														changeRole(m.id, e.target.value as MemberRole)
													}
												>
													{(Object.keys(ROLE_CFG) as MemberRole[]).map((r) => (
														<option
															key={r}
															value={r}
														>
															{ROLE_CFG[r].label}
														</option>
													))}
												</select>
												<button
													type='button'
													className={styles.removeBtn}
													onClick={() => removeMember(m.id)}
													title='Xoá'
												>
													<XSvg />
												</button>
											</div>
										))}
									</div>
								</div>
							)}

							<div
								className={styles.formSection}
								style={{ marginTop: 4 }}
							>
								Tài liệu đính kèm
							</div>

							<div className={styles.formGroup}>
								<div
									className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
									onClick={() => fileInputRef.current?.click()}
									onDragOver={(e) => {
										e.preventDefault();
										setIsDragging(true);
									}}
									onDragLeave={() => setIsDragging(false)}
									onDrop={(e) => {
										e.preventDefault();
										setIsDragging(false);
										handleFiles(e.dataTransfer.files);
									}}
								>
									<span className={styles.dropZoneIcon}>
										<UploadSvg />
									</span>
									<span className={styles.dropZoneText}>
										Kéo thả file vào đây hoặc{' '}
										<span className={styles.dropZoneLink}>chọn file</span>
									</span>
									<span className={styles.dropZoneHint}>
										Dung lượng tối đa: 150MB mỗi file
									</span>
									<input
										ref={fileInputRef}
										type='file'
										multiple
										style={{ display: 'none' }}
										onChange={(e) => handleFiles(e.target.files)}
									/>
								</div>
								{fileError && (
									<div className={styles.formError}>
										<AlertSvg /> {fileError}
									</div>
								)}
								{attachments.length > 0 && (
									<div className={styles.fileList}>
										{attachments.map((f) => (
											<div
												key={f.name}
												className={styles.fileItem}
											>
												<span className={styles.fileItemIcon}>
													<PaperclipSvg />
												</span>
												<span className={styles.fileItemName}>{f.name}</span>
												<span className={styles.fileItemSize}>
													{(f.size / (1024 * 1024)).toFixed(1)} MB
												</span>
												<button
													type='button'
													className={styles.removeBtn}
													onClick={() => removeAttachment(f.name)}
													title='Xoá file'
												>
													<XSvg />
												</button>
											</div>
										))}
									</div>
								)}
							</div>
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
									? `${pendingTopics.length} đề tài đang chờ gửi`
									: 'Chưa có đề tài nào trong danh sách'}
							</span>
							<button
								type='button'
								className={styles.btnSecondary}
								onClick={clearForm}
							>
								Xoá form
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
						<div className={styles.pendingCard}>
							<div className={styles.pendingHeader}>
								<span>Danh sách đề tài chờ gửi</span>
								<span className={styles.pendingBadge}>
									{pendingTopics.length}
								</span>
							</div>
							<div className={styles.pendingList}>
								{pendingTopics.map((t, i) => {
									const roundName =
										rounds.find((r) => r.id === t.round_id)?.name ?? '—';
									return (
										<div
											key={t.localId}
											className={styles.pendingItem}
										>
											<div className={styles.pendingNum}>{i + 1}</div>
											<div className={styles.pendingInfo}>
												<div className={styles.pendingTitle}>{t.title}</div>
												<div className={styles.pendingMeta}>
													{roundName} · {t.members.length} thành viên
													{t.attachments.length > 0 &&
														` · ${t.attachments.length} file`}
												</div>
											</div>
											<button
												type='button'
												className={styles.removeBtn}
												onClick={() => removeTopicFromList(t.localId)}
												title='Xoá'
											>
												<XSvg />
											</button>
										</div>
									);
								})}
							</div>
							<div className={styles.pendingFooter}>
								{submitError && (
									<div className={styles.saveError}>
										<AlertSvg /> {submitError}
									</div>
								)}
								<button
									type='button'
									className={styles.btnPrimary}
									onClick={() => submitAll('submitted')}
									disabled={submittingAll}
								>
									{submittingAll ? <span className={styles.spinner} /> : null}
									<SendSvg />
									Gửi tất cả ({pendingTopics.length})
								</button>
							</div>
						</div>
					)}
				</div>

				{/* ── RIGHT: SIDE PANEL ── */}
				<div className={styles.sidePanel}>
					<div className={styles.sideCard}>
						<div className={styles.sideCardHeader}>
							<span>Hướng dẫn đăng ký</span>
							<HelpSvg
								width={15}
								height={15}
							/>
						</div>
						<div className={styles.sideCardBody}>
							{GUIDE_STEPS.map((s, i) => (
								<div
									key={i}
									className={styles.guideStep}
								>
									<div className={styles.guideNum}>{i + 1}</div>
									<div className={styles.guideText}>
										<span className={styles.guideTextBold}>{s.title}.</span>{' '}
										{s.desc}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className={styles.sideCard}>
						<div className={styles.sideCardHeader}>
							<span>Đề tài của tôi</span>
							<button
								type='button'
								style={{
									background: 'none',
									border: 'none',
									cursor: 'pointer',
									color: '#1a6abd',
									fontSize: 12,
									fontWeight: 600,
									display: 'inline-flex',
									alignItems: 'center',
									gap: 3,
								}}
								onClick={() => navigate('/user/my-topics')}
							>
								Xem tất cả{' '}
								<ChevRSvg
									width={12}
									height={12}
								/>
							</button>
						</div>
						<div className={styles.sideCardBody}>
							{myTopics.length === 0 ? (
								<div
									style={{
										textAlign: 'center',
										padding: '24px 0',
										color: 'var(--color-gray-400)',
										fontSize: 13,
									}}
								>
									Bạn chưa có đề tài nào
								</div>
							) : (
								myTopics.slice(0, 5).map((t) => (
									<div
										key={t.id}
										className={styles.myTopicItem}
										onClick={() => navigate('/user/my-topics')}
									>
										<div className={styles.myTopicTitle}>{t.title}</div>
										<div className={styles.myTopicMeta}>
											<span>{fmtDate(t.created_at)}</span>
											<span
												className={`${styles.badge} ${styles[BADGE_CLS[t.status] as keyof typeof styles]}`}
											>
												<span
													className={styles.badgeDot}
													style={{ background: STATUS_CFG[t.status].dot }}
												/>
												{STATUS_CFG[t.status].label}
											</span>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</div>
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

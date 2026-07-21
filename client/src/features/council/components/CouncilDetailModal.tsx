import { useCallback, useEffect, useState } from 'react';
import {
	CalendarSvg,
	ClipboardCheckSvg,
	EditSvg,
	PlusSvg,
	XSvg,
} from '@/assets/icons';
import {
	addCouncilMember,
	assignCouncilTopics,
	getCouncilById,
	removeCouncilMember,
	removeCouncilSeatSubstitute,
	setCouncilSeatSubstitute,
	setCouncilTopicSession,
	unassignCouncilTopic,
	updateCouncilMember,
} from '../api/councilApi';
import {
	SEAT_ROLES,
	SEAT_ROLE_LABELS,
	SESSION_LABELS,
	STATUS_LABELS,
	type Council,
	type CouncilMember,
	type CouncilSession,
	type CouncilTopic,
	type EligibleUser,
	type SeatRole,
} from '../types/council.type';
import { AssignTopicsModal } from './AssignTopicsModal';
import { MemberSeatModal } from './MemberSeatModal';
import styles from '../pages/Council.module.css';

export function CouncilDetailModal({
	councilId,
	onClose,
	onChanged,
}: {
	councilId: string;
	onClose: () => void;
	onChanged: () => void;
}) {
	const [council, setCouncil] = useState<Council | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');
	const [seatModal, setSeatModal] = useState<SeatRole | null>(null);
	// Ghế thay thế theo đề tài: chọn vai cần thay trên một đề tài rồi mở picker
	const [subModal, setSubModal] = useState<{
		topicId: string;
		role: SeatRole;
	} | null>(null);
	const [assignModal, setAssignModal] = useState(false);
	const [busy, setBusy] = useState(false);

	// Gọi lại sau mỗi thao tác (thêm/xoá thành viên, gán/bỏ gán đề tài) — không bật
	// lại isLoading để tránh nháy skeleton, chỉ cập nhật dữ liệu tại chỗ.
	const load = useCallback(
		() =>
			getCouncilById(councilId)
				.then(setCouncil)
				.catch(() => setError('Không thể tải chi tiết hội đồng')),
		[councilId],
	);

	useEffect(() => {
		load().finally(() => setIsLoading(false));
	}, [load]);

	const memberByRole = (role: SeatRole): CouncilMember | undefined =>
		council?.members?.find((m) => m.role === role);

	const handleSaveMember = async (candidate: EligibleUser) => {
		if (!council || !seatModal) return;
		setBusy(true);
		try {
			const seat = candidate.is_external
				? { user_id: null, external_reviewer_id: candidate.id }
				: { user_id: candidate.id, external_reviewer_id: null };
			const existing = memberByRole(seatModal);
			if (existing) {
				await updateCouncilMember(council.id, existing.id, seat);
			} else {
				await addCouncilMember(council.id, { ...seat, role: seatModal });
			}
			setSeatModal(null);
			load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu thành viên thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleRemoveMember = async () => {
		if (!council || !seatModal) return;
		const existing = memberByRole(seatModal);
		if (!existing) return;
		setBusy(true);
		try {
			await removeCouncilMember(council.id, existing.id);
			setSeatModal(null);
			load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Xoá thành viên thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleAssignTopics = async (topicIds: string[]) => {
		if (!council) return;
		setBusy(true);
		try {
			await assignCouncilTopics(council.id, topicIds);
			setAssignModal(false);
			load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Gán đề tài thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleUnassignTopic = async (topicId: string) => {
		if (!council) return;
		try {
			await unassignCouncilTopic(council.id, topicId);
			load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Bỏ gán thất bại');
		}
	};

	const subOf = (t: CouncilTopic, role: SeatRole) =>
		t.substitutes?.find((s) => s.role === role);

	const handleSaveSubstitute = async (userId: string) => {
		if (!council || !subModal) return;
		setBusy(true);
		try {
			await setCouncilSeatSubstitute(
				council.id,
				subModal.topicId,
				subModal.role,
				userId,
			);
			setSubModal(null);
			load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu ghế thay thế thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleRemoveSubstitute = async () => {
		if (!council || !subModal) return;
		setBusy(true);
		try {
			await removeCouncilSeatSubstitute(
				council.id,
				subModal.topicId,
				subModal.role,
			);
			setSubModal(null);
			load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Xóa ghế thay thế thất bại');
		} finally {
			setBusy(false);
		}
	};

	// Buổi bảo vệ gắn với từng đề tài — hội đồng chấm cả phiên sáng lẫn chiều
	const handleTopicSession = async (topicId: string, value: string) => {
		if (!council) return;
		try {
			await setCouncilTopicSession(
				council.id,
				topicId,
				(value || null) as CouncilSession | null,
			);
			load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Cập nhật buổi thất bại');
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<ClipboardCheckSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{council?.name ?? 'Chi tiết hội đồng'}
						</div>
						<div className={styles.modalSub}>
							{council
								? `${council.round_name ?? council.round_id} · ${
										STATUS_LABELS[council.status]
									}${council.location ? ' · ' + council.location : ''}`
								: ''}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					{isLoading || !council ? (
						<div style={{ fontSize: 13, color: 'var(--color-gray-400)' }}>
							Đang tải...
						</div>
					) : (
						<>
							{error && <div className={styles.fieldError}>{error}</div>}

							<div>
								<div className={styles.sectionTitle}>Thành phần hội đồng</div>
								<div className={styles.seatGrid}>
									{SEAT_ROLES.map((role) => {
										const m = memberByRole(role);
										return (
											<div
												key={role}
												className={`${styles.seatCard} ${m ? styles.seatCardFilled : ''} ${styles[role] || ''}`}
											>
												<div style={{ minWidth: 0 }}>
													<div className={styles.seatRole}>
														{SEAT_ROLE_LABELS[role]}
													</div>
													{m ? (
														<>
															<div className={styles.seatName}>
																{m.full_name}
																{m.is_external && (
																	<span className={styles.topicDept} style={{ marginLeft: 6 }}>
																		Ngoài viện
																	</span>
																)}
															</div>
															{(m.is_external ? m.ext_organization : m.department_name) && (
																<div className={styles.seatDept}>
																	{m.is_external ? m.ext_organization : m.department_name}
																</div>
															)}
														</>
													) : (
														<div className={styles.seatEmpty}>Chưa có người</div>
													)}
												</div>
												<div className={styles.seatActions}>
													<button
														className={styles.seatBtn}
														title={m ? 'Đổi người' : 'Chọn người'}
														onClick={() => setSeatModal(role)}
													>
														{m ? <EditSvg /> : <PlusSvg />}
													</button>
												</div>
											</div>
										);
									})}
								</div>
							</div>

							<div>
								<div className={styles.sectionTitle}>
									Đề tài đã gán ({council.topics?.length ?? 0})
									<button
										className={styles.seatBtn}
										title='Gán thêm đề tài'
										onClick={() => setAssignModal(true)}
									>
										<PlusSvg />
									</button>
								</div>
								{!council.topics || council.topics.length === 0 ? (
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>
											Chưa có đề tài nào được gán cho hội đồng này.
										</div>
									</div>
								) : (
									<div className={styles.topicList}>
										{council.topics.map((t) => (
											<div
												key={t.id}
												className={styles.topicRow}
											>
												<div style={{ minWidth: 0, flex: 1 }}>
													<div className={styles.topicTitle}>{t.title}</div>
													{(t.substitutes?.length ?? 0) > 0 && (
														<div
															style={{
																display: 'flex',
																flexWrap: 'wrap',
																gap: 4,
																marginTop: 2,
															}}
														>
															{t.substitutes?.map((s) => (
																<button
																	key={s.role}
																	className={styles.topicDept}
																	style={{ cursor: 'pointer' }}
																	title='Ghế thay thế riêng cho đề tài này — bấm để đổi hoặc xóa'
																	onClick={() =>
																		setSubModal({ topicId: t.id, role: s.role })
																	}
																>
																	{SEAT_ROLE_LABELS[s.role]} → {s.full_name}
																</button>
															))}
														</div>
													)}
												</div>
												<span className={styles.topicDept}>
													{t.department_name ?? ''}
												</span>
												<select
													className={styles.topicSelect}
													title='Thay người một ghế riêng cho đề tài này'
													value=''
													onChange={(e) =>
														e.target.value &&
														setSubModal({
															topicId: t.id,
															role: e.target.value as SeatRole,
														})
													}
												>
													<option value=''>-- Ghế thay --</option>
													{SEAT_ROLES.map((r) => (
														<option
															key={r}
															value={r}
														>
															{SEAT_ROLE_LABELS[r]}
														</option>
													))}
												</select>
												<select
													className={styles.topicSelect}
													title='Buổi bảo vệ'
													value={t.session ?? ''}
													onChange={(e) =>
														void handleTopicSession(t.id, e.target.value)
													}
												>
													<option value=''>-- Buổi --</option>
													{Object.entries(SESSION_LABELS).map(([v, label]) => (
														<option
															key={v}
															value={v}
														>
															{label}
														</option>
													))}
												</select>

												<button
													className={styles.topicRemove}
													title='Bỏ gán'
													onClick={() => void handleUnassignTopic(t.id)}
												>
													<XSvg />
												</button>
											</div>
										))}
									</div>
								)}
							</div>

							{council.defense_date && (
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 6,
										fontSize: 12,
										color: 'var(--color-gray-500)',
									}}
								>
									<CalendarSvg style={{ width: 13, height: 13 }} />
									Ngày bảo vệ: {council.defense_date}
								</div>
							)}
						</>
					)}
				</div>
			</div>

			{seatModal && council && (
				<MemberSeatModal
					councilId={council.id}
					role={seatModal}
					member={memberByRole(seatModal)}
					onClose={() => setSeatModal(null)}
					onSave={handleSaveMember}
					onRemove={memberByRole(seatModal) ? handleRemoveMember : undefined}
					loading={busy}
				/>
			)}
			{subModal &&
				council &&
				(() => {
					const topic = council.topics?.find((t) => t.id === subModal.topicId);
					const current = topic && subOf(topic, subModal.role);
					return (
						<MemberSeatModal
							councilId={council.id}
							role={subModal.role}
							member={
								current
									? {
											id: '',
											council_id: council.id,
											role: current.role,
											user_id: current.user_id,
											external_reviewer_id: null,
											full_name: current.full_name,
											staff_number: current.staff_number,
											department_id: current.department_id,
											department_name: current.department_name,
											ext_organization: null,
											is_external: false,
										}
									: undefined
							}
							allowExternal={false}
							onClose={() => setSubModal(null)}
							onSave={(candidate) => handleSaveSubstitute(candidate.id)}
							onRemove={current ? handleRemoveSubstitute : undefined}
							loading={busy}
						/>
					);
				})()}
			{assignModal && council && (
				<AssignTopicsModal
					council={council}
					onClose={() => setAssignModal(false)}
					onSave={handleAssignTopics}
					loading={busy}
				/>
			)}
		</div>
	);
}

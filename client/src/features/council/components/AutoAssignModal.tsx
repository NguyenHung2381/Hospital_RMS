import { useEffect, useMemo, useState } from 'react';
import { CheckSvg, InfoSvg, RefreshSvg, XSvg } from '@/assets/icons';
import { SPECIALTY_GROUPS } from '../../department/types/department.type';
import { getExternalReviewers } from '../api/externalReviewerApi';
import {
	autoAssignCouncils,
	getCouncils,
	getCouncilById,
	type AutoAssignResult,
} from '../api/councilApi';
import { compareCouncilsBySpecialty } from '../utils/councilHelpers';
import type { ResearchRound } from '../../round/types/round.type';
import {
	SEAT_ROLES,
	SEAT_ROLE_LABELS,
	type Council,
	type ExternalReviewer,
} from '../types/council.type';
import styles from '../pages/Council.module.css';

export function AutoAssignModal({
	rounds,
	existingCouncils = [],
	onClose,
	onDone,
}: {
	rounds: ResearchRound[];
	existingCouncils?: Council[];
	onClose: () => void;
	onDone: () => void;
}) {
	const [roundId, setRoundId] = useState(rounds[0]?.id ?? '');
	const [specialtyGroups, setSpecialtyGroups] = useState<string[]>([]);
	const [minSize, setMinSize] = useState(6);
	const [maxSize, setMaxSize] = useState(10);
	const [externalReviewers, setExternalReviewers] = useState<ExternalReviewer[]>([]);
	const [selectedExternalIds, setSelectedExternalIds] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [result, setResult] = useState<AutoAssignResult | null>(null);
	const [createdCouncils, setCreatedCouncils] = useState<Council[]>([]);

	useEffect(() => {
		getExternalReviewers({ active_only: true })
			.then(setExternalReviewers)
			.catch(() => setExternalReviewers([]));
	}, []);

	const allSelected = specialtyGroups.length === SPECIALTY_GROUPS.length;
	const toggleGroup = (g: string) =>
		setSpecialtyGroups((prev) =>
			prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
		);
	const toggleAll = () =>
		setSpecialtyGroups(allSelected ? [] : [...SPECIALTY_GROUPS]);

	// Chỉ hiện người ngoài viện đúng hệ chuyên môn đang chọn — chọn nhầm hệ
	// khác thì không có tác dụng gì khi auto-assign match theo specialty_group.
	const relevantExternalReviewers = useMemo(
		() =>
			externalReviewers.filter(
				(r) => r.specialty_group && specialtyGroups.includes(r.specialty_group),
			),
		[externalReviewers, specialtyGroups],
	);
	const toggleExternal = (id: string) =>
		setSelectedExternalIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);

	const invalidRange = minSize < 1 || maxSize < minSize;

	const run = async () => {
		if (!roundId || !specialtyGroups.length || invalidRange) return;
		setLoading(true);
		setError('');
		try {
			const externalIds = selectedExternalIds.filter((id) =>
				relevantExternalReviewers.some((r) => r.id === id),
			);
			const res = await autoAssignCouncils({
				round_id: roundId,
				specialty_group: specialtyGroups,
				min_size: minSize,
				max_size: maxSize,
				external_reviewer_ids: externalIds.length ? externalIds : undefined,
			});

			const updatedRes = await getCouncils({ round_id: roundId, limit: 200 });
			const updatedCouncils = updatedRes.data;

			const existingIds = new Set(existingCouncils.map((c: Council) => c.id));
			const newCouncils = updatedCouncils.filter((c: Council) => !existingIds.has(c.id));

			const fullNewCouncils = await Promise.all(
				newCouncils.map(async (c: Council) => {
					const detailRes = await getCouncilById(c.id);
					return detailRes;
				})
			);

			// Sắp xếp các hội đồng vừa tạo theo cùng quy tắc để hiển thị nhất quán
			fullNewCouncils.sort(compareCouncilsBySpecialty);

			setCreatedCouncils(fullNewCouncils);
			setResult(res);
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Tự động phân công thất bại');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal} style={{ width: '33vw', maxWidth: '33vw' }}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<RefreshSvg />
					</div>
					<div>
						<div className={styles.modalTitle} style={{ fontSize: 22 }}>Tự động phân công hội đồng</div>
						<div className={styles.modalSub} style={{ fontSize: 14 }}>Chọn 1 hoặc nhiều hệ chuyên môn, chạy 1 lần</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					{!result && (
						<>
							<div className={styles.warnBox}>
								<InfoSvg />
								<span>
									Chỉ gom đề tài đã duyệt, chưa gán hội đồng. Hội đồng sinh ra ở
									trạng thái Nháp — rà lại thành viên/ghế trước khi chốt.
								</span>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Đợt nghiên cứu</label>
								<select
									className={styles.formInput}
									value={roundId}
									onChange={(e) => setRoundId(e.target.value)}
								>
									{rounds.map((r) => (
										<option
											key={r.id}
											value={r.id}
										>
											{r.name} ({r.year})
										</option>
									))}
								</select>
							</div>
							<div className={styles.formGrid2}>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>Cận dưới (đề tài/HĐ)</label>
									<input
										type='number'
										min={1}
										max={maxSize}
										className={styles.formInput}
										value={minSize}
										onChange={(e) => setMinSize(Number(e.target.value))}
									/>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>Cận trên (đề tài/HĐ)</label>
									<input
										type='number'
										min={minSize}
										max={20}
										className={styles.formInput}
										value={maxSize}
										onChange={(e) => setMaxSize(Number(e.target.value))}
									/>
								</div>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>
									Hệ chuyên môn
									<button
										type='button'
										className={styles.linkBtn}
										onClick={toggleAll}
										style={{ marginLeft: 8 }}
									>
										{allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
									</button>
								</label>
								<div
									className={styles.checkList}
									style={{ maxHeight: 260, overflowY: 'auto' }}
								>
									{SPECIALTY_GROUPS.map((g) => {
										const active = specialtyGroups.includes(g);
										return (
											<label
												key={g}
												className={styles.checkRow}
												style={{ padding: '14px 16px', fontSize: 17, gap: 12 }}
											>
												<input
													type='checkbox'
													checked={active}
													onChange={() => toggleGroup(g)}
													className={styles.rowCheckbox}
													style={{ width: 20, height: 20 }}
												/>
												<span>{g}</span>
											</label>
										);
									})}
								</div>
							</div>
							{relevantExternalReviewers.length > 0 && (
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										Người ngoài viện có thể tham gia
									</label>
									<div className={styles.modalSub} style={{ marginTop: -4, marginBottom: 2 }}>
										Chỉ dùng khi hết người trong viện đủ điều kiện cho 1 ghế — bỏ
										trống thì dùng cả danh bạ ngoài viện cùng hệ.
									</div>
									<div className={styles.checkList} style={{ maxHeight: 180, overflowY: 'auto' }}>
										{relevantExternalReviewers.map((r) => {
											const active = selectedExternalIds.includes(r.id);
											return (
												<label
													key={r.id}
													className={styles.checkRow}
													style={{ padding: '8px 12px', fontSize: 15, gap: 10 }}
												>
													<input
														type='checkbox'
														checked={active}
														onChange={() => toggleExternal(r.id)}
														className={styles.rowCheckbox}
													/>
													<span>
														{r.full_name}
														{r.organization ? ` (${r.organization})` : ''}
													</span>
												</label>
											);
										})}
									</div>
								</div>
							)}
							{invalidRange && (
								<div className={styles.fieldError}>
									Cận trên phải lớn hơn hoặc bằng cận dưới.
								</div>
							)}
							{error && <div className={styles.fieldError}>{error}</div>}
						</>
					)}

					{result && (
						<>
							<div className={styles.warnBox}>
								<CheckSvg />
								<span>
									Đã tạo {result.councils_created} hội đồng, gán{' '}
									{result.topics_assigned} đề tài.
								</span>
							</div>
							{result.warnings.length > 0 && (
								<ul className={styles.deleteDesc}>
									{result.warnings.map((w, i) => (
										<li key={i}>{w}</li>
									))}
								</ul>
							)}
							{createdCouncils.length > 0 && (
								<div className={styles.createdCouncilsSection}>
									<div className={styles.createdCouncilsTitle}>Danh sách hội đồng vừa tạo</div>
									{createdCouncils.map((c) => (
										<div key={c.id} className={styles.createdCouncilCard}>
											<div className={styles.createdCouncilHeader}>
												<span className={styles.createdCouncilName}>{c.name}</span>
												<span className={styles.createdCouncilGroup}>
													{c.specialty_group}
												</span>
											</div>
											<div className={styles.createdCouncilMembers}>
												{SEAT_ROLES.map((role) => {
													const m = c.members?.find((member) => member.role === role);
													return (
														<div key={role} className={styles.createdMemberRow}>
															<span className={styles.createdMemberRole}>
																{SEAT_ROLE_LABELS[role]}
															</span>
															<span className={styles.createdMemberName} title={m?.full_name || 'Chưa xếp'}>
																{m ? m.full_name : <span style={{ color: 'var(--color-gray-400)', fontStyle: 'italic' }}>Chưa xếp</span>}
															</span>
															{m && (
																<span className={styles.createdMemberDept} title={m.is_external ? (m.ext_organization || '') : (m.department_name || '')}>
																	{m.is_external ? (m.ext_organization || 'Ngoài viện') : (m.department_name || '')}
																</span>
															)}
														</div>
													);
												})}
											</div>
										</div>
									))}
								</div>
							)}
						</>
					)}
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button
							className={styles.btnConfirmApprove}
							onClick={run}
							disabled={loading || !roundId || !specialtyGroups.length || invalidRange}
						>
							{loading ? <span className={styles.spinner} /> : <RefreshSvg />}
							Chạy phân công
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

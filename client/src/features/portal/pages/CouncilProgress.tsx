import { useEffect, useMemo, useRef, useState } from 'react';
import UserLayout from '../../../layouts/UserLayout';
import { BASE_URL } from '../../../shared/api/axios';
import { getStoredUser, type StoredUser } from '../../../shared/utils/storage';
import {
	CONCLUSION_LABELS,
	deleteEvaluationFile,
	deleteMinutesFile,
	getMyProgress,
	PROGRESS_RATING_LABELS,
	saveProgressReview,
	saveTopicResult,
	uploadEvaluationFiles,
	uploadMinutesFiles,
	type Conclusion,
	type ProgressRating,
	type ProgressTopic,
} from '../../council/api/councilApi';
import { SEAT_ROLE_LABELS } from '../../council/types/council.type';
import { SPECIALTY_GROUPS } from '../../department/types/department.type';
import styles from './CouncilProgress.module.css';

const SESSION_LABELS: Record<string, string> = {
	morning: 'Phiên 1 — Từ 8h00',
	afternoon: 'Phiên 2 — Từ 13h30',
};

const RATING_CLASS: Record<ProgressRating, string> = {
	on_track: 'ratingOnTrack',
	behind: 'ratingBehind',
	at_risk: 'ratingAtRisk',
};

const CONCLUSION_CLASS: Record<Conclusion, string> = {
	pass: 'conclusionPass',
	fail: 'conclusionFail',
	revise: 'conclusionRevise',
};

function fmtSize(bytes: number | null): string {
	if (!bytes) return '';
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase();
	if (ext === 'pdf') return '📕';
	if (ext === 'doc' || ext === 'docx') return '📘';
	if (ext === 'xls' || ext === 'xlsx') return '📗';
	return '📄';
}

interface Draft {
	percent: string;
	rating: '' | ProgressRating;
	comment: string;
}

interface ResultDraft {
	conclusion: '' | Conclusion;
	general_comment: string;
}

export default function CouncilProgress() {
	const user = getStoredUser<StoredUser>();
	const [topics, setTopics] = useState<ProgressTopic[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [savingId, setSavingId] = useState<string | null>(null);
	const [savedId, setSavedId] = useState<string | null>(null);
	const [uploadingId, setUploadingId] = useState<string | null>(null);
	const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
	const [resultDrafts, setResultDrafts] = useState<Record<string, ResultDraft>>(
		{},
	);
	const [savingResultId, setSavingResultId] = useState<string | null>(null);
	const [savedResultId, setSavedResultId] = useState<string | null>(null);
	const [uploadingMinutesId, setUploadingMinutesId] = useState<string | null>(
		null,
	);
	const minutesInputs = useRef<Record<string, HTMLInputElement | null>>({});
	const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

	const selectedTopic = useMemo(() => {
		if (!selectedTopicId) return null;
		return topics.find((t) => t.id === selectedTopicId) ?? null;
	}, [topics, selectedTopicId]);

	const stats = useMemo(() => {
		const reviewed = topics.filter((t) => {
			const mine = t.reviews.find((r) => r.user_id === user?.id);
			return mine && (mine.rating != null || mine.progress_percent != null);
		}).length;
		return { total: topics.length, reviewed, pending: topics.length - reviewed };
	}, [topics, user?.id]);

	const load = async () => {
		try {
			const data = await getMyProgress();
			setTopics(data);

			if (data.length > 0) {
				setSelectedTopicId((curr) => {
					if (curr && data.some((t) => t.id === curr)) return curr;
					return data[0].id;
				});
			} else {
				setSelectedTopicId(null);
			}

			// Điền nháp từ đánh giá đã lưu của chính mình
			setDrafts((prev) => {
				const next = { ...prev };
				for (const t of data) {
					if (next[t.id]) continue;
					const mine = t.reviews.find((r) => r.user_id === user?.id);
					next[t.id] = {
						percent:
							mine?.progress_percent != null
								? String(mine.progress_percent)
								: '',
						rating: mine?.rating ?? '',
						comment: mine?.comment ?? '',
					};
				}
				return next;
			});
			setResultDrafts((prev) => {
				const next = { ...prev };
				for (const t of data) {
					if (next[t.id]) continue;
					next[t.id] = {
						conclusion: t.result?.conclusion ?? '',
						general_comment: t.result?.general_comment ?? '',
					};
				}
				return next;
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Không tải được dữ liệu');
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const councils = useMemo(() => {
		const map = new Map<string, ProgressTopic[]>();
		for (const t of topics) {
			const arr = map.get(t.council_id) ?? [];
			arr.push(t);
			map.set(t.council_id, arr);
		}
		const res = [...map.values()];

		const cleanString = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

		const getSpecialtyFromCouncilName = (fullName: string) => {
			let name = fullName.replace(/^Hội\s+đồng\s+/i, '');
			name = name.replace(/\s*#\d+$/, '');
			return name.trim();
		};

		const getSpecialtyIndex = (councilName: string) => {
			const spec = getSpecialtyFromCouncilName(councilName);
			const cleanedGroup = cleanString(spec);
			const idx = SPECIALTY_GROUPS.findIndex((g) => cleanString(g) === cleanedGroup);
			return idx !== -1 ? idx : 999;
		};

		const getNumberSuffix = (name: string) => {
			const match = name.match(/#(\d+)/);
			return match ? parseInt(match[1], 10) : 0;
		};

		res.sort((a, b) => {
			const nameA = a[0]?.council_name ?? '';
			const nameB = b[0]?.council_name ?? '';

			const idxA = getSpecialtyIndex(nameA);
			const idxB = getSpecialtyIndex(nameB);
			if (idxA !== idxB) {
				return idxA - idxB;
			}

			const numA = getNumberSuffix(nameA);
			const numB = getNumberSuffix(nameB);
			if (numA !== numB) {
				return numA - numB;
			}

			return nameA.localeCompare(nameB, 'vi');
		});

		return res;
	}, [topics]);

	// Nhóm đề tài trong một hội đồng theo phiên — hiển thị lần lượt Phiên 1 rồi Phiên 2
	const SESSION_ORDER: (string | null)[] = ['morning', 'afternoon', null];
	const groupBySession = (councilTopics: ProgressTopic[]) => {
		const map = new Map<string | null, ProgressTopic[]>();
		for (const t of councilTopics) {
			const key = t.session ?? null;
			const arr = map.get(key) ?? [];
			arr.push(t);
			map.set(key, arr);
		}
		return SESSION_ORDER.filter((s) => map.has(s)).map((session) => ({
			session,
			items: map.get(session)!,
		}));
	};

	const setDraft = (id: string, patch: Partial<Draft>) =>
		setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

	const handleSave = async (t: ProgressTopic) => {
		const d = drafts[t.id];
		const percent = d.percent.trim() === '' ? null : Number(d.percent);
		if (
			percent != null &&
			(!Number.isInteger(percent) || percent < 0 || percent > 100)
		) {
			alert('Tiến độ phải là số nguyên từ 0 đến 100 (%)');
			return;
		}
		setSavingId(t.id);
		try {
			await saveProgressReview(t.id, {
				progress_percent: percent,
				rating: d.rating || null,
				comment: d.comment,
			});
			setSavedId(t.id);
			setTimeout(() => setSavedId((s) => (s === t.id ? null : s)), 2500);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Lưu đánh giá thất bại');
		} finally {
			setSavingId(null);
		}
	};

	const handleUpload = async (t: ProgressTopic, files: FileList | null) => {
		if (!files || files.length === 0) return;
		setUploadingId(t.id);
		try {
			await uploadEvaluationFiles(t.id, [...files]);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Upload thất bại');
		} finally {
			setUploadingId(null);
			const input = fileInputs.current[t.id];
			if (input) input.value = '';
		}
	};

	const handleDeleteFile = async (t: ProgressTopic, fileId: string) => {
		if (!confirm('Xóa file đánh giá này?')) return;
		try {
			await deleteEvaluationFile(t.id, fileId);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Xóa file thất bại');
		}
	};

	const setResultDraft = (id: string, patch: Partial<ResultDraft>) =>
		setResultDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

	const handleSaveResult = async (t: ProgressTopic) => {
		const d = resultDrafts[t.id];
		setSavingResultId(t.id);
		try {
			await saveTopicResult(t.id, {
				conclusion: d.conclusion || null,
				general_comment: d.general_comment,
			});
			setSavedResultId(t.id);
			setTimeout(() => setSavedResultId((s) => (s === t.id ? null : s)), 2500);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Lưu kết luận thất bại');
		} finally {
			setSavingResultId(null);
		}
	};

	const handleUploadMinutes = async (
		t: ProgressTopic,
		files: FileList | null,
	) => {
		if (!files || files.length === 0) return;
		setUploadingMinutesId(t.id);
		try {
			await uploadMinutesFiles(t.id, [...files]);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Upload thất bại');
		} finally {
			setUploadingMinutesId(null);
			const input = minutesInputs.current[t.id];
			if (input) input.value = '';
		}
	};

	const handleDeleteMinutes = async (t: ProgressTopic, fileId: string) => {
		if (!confirm('Xóa biên bản này?')) return;
		try {
			await deleteMinutesFile(t.id, fileId);
			await load();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Xóa file thất bại');
		}
	};

	return (
		<UserLayout
			pageTitle='Đánh giá tiến độ đề tài'
			pageSubtitle='Hội đồng đánh giá tiến độ các đề tài được phân công; thư ký upload file đánh giá'
			userName={user?.full_name ?? 'Người dùng'}
			userRole={user?.role_name ?? 'Thành viên'}
			hideSidebar
		>
			{loading ? (
				<div className={styles.stateBox}>Đang tải…</div>
			) : error ? (
				<div className={`${styles.stateBox} ${styles.stateError}`}>{error}</div>
			) : councils.length === 0 ? (
				<div className={styles.stateBox}>
					<div className={styles.emptyTitle}>
						Bạn chưa có ghế trong hội đồng nào
					</div>
					<div className={styles.emptyDesc}>
						Khi được phân công vào hội đồng, đề tài cần đánh giá tiến độ sẽ
						hiển thị tại đây.
					</div>
				</div>
			) : (
				<>
					<div className={styles.pageWatermark} />
					<div className={styles.statsStrip}>
						<div className={`${styles.statChip} ${styles.statTotal}`}>
							<span className={styles.statIcon}>📋</span>
							<span className={styles.statValue}>{stats.total}</span>
							<span className={styles.statLabel}>đề tài được phân công</span>
						</div>
						<div className={`${styles.statChip} ${styles.statReviewed}`}>
							<span className={styles.statIcon}>✅</span>
							<span className={styles.statValue}>{stats.reviewed}</span>
							<span className={styles.statLabel}>đã đánh giá</span>
						</div>
						<div className={`${styles.statChip} ${styles.statPending}`}>
							<span className={styles.statIcon}>⏳</span>
							<span className={styles.statValue}>{stats.pending}</span>
							<span className={styles.statLabel}>chờ đánh giá</span>
						</div>
					</div>
				<div className={styles.splitWrapper}>
					{/* Left sidebar: list of topics grouped by Council -> Session */}
					<aside className={styles.sidebarPane}>
						{councils.map((councilTopics) => {
							const c = councilTopics[0];
							return (
								<div key={c.council_id} className={styles.sidebarCouncilGroup}>
									<div className={styles.sidebarCouncilHeader}>
										<h3 className={styles.sidebarCouncilName} title={c.council_name}>
											{c.council_name}
										</h3>
										<div className={styles.sidebarCouncilMeta}>
											{c.round_name && <span>{c.round_name}</span>}
											{c.defense_date && <span>Ngày: {c.defense_date}</span>}
										</div>
									</div>

									{groupBySession(councilTopics).map(({ session, items }) => (
										<div key={session ?? 'none'} className={styles.sidebarSessionSection}>
											<div className={styles.sidebarSessionTitle}>
												{session === 'morning' ? (
													<span className={styles.sessionMorningIcon}>☀️ {SESSION_LABELS[session]}</span>
												) : session === 'afternoon' ? (
													<span className={styles.sessionAfternoonIcon}>⛅ {SESSION_LABELS[session]}</span>
												) : (
													<span>Chưa xếp phiên</span>
												)}
											</div>
											<div className={styles.sidebarTopicList}>
												{items.map((t, idx) => {
													const isSelected = t.id === selectedTopicId;
													const mine = t.reviews.find((r) => r.user_id === user?.id);
													const isReviewed = mine && (mine.rating != null || mine.progress_percent != null);
													return (
														<div
															key={t.id}
															className={`${styles.sidebarTopicCard} ${isSelected ? styles.activeTopicCard : ''}`}
															onClick={() => setSelectedTopicId(t.id)}
														>
															<div className={styles.sidebarTopicCardHeader}>
																<span className={styles.sidebarTopicIndex}>{idx + 1}</span>
																<div className={styles.sidebarTopicTitle} title={t.title}>
																	{t.title}
																</div>
															</div>
															<div className={styles.sidebarTopicMeta}>
																<span className={styles.sidebarRoleBadge}>
																	{SEAT_ROLE_LABELS[t.my_role]}
																</span>
																{isReviewed ? (
																	<span className={styles.statusReviewed}>✓ Đã đánh giá</span>
																) : (
																	<span className={styles.statusPending}>Chưa đánh giá</span>
																)}
															</div>
															{mine?.progress_percent != null && (
																<div className={styles.sidebarProgressTrack}>
																	<div
																		className={styles.sidebarProgressFill}
																		style={{ width: `${mine.progress_percent}%` }}
																	/>
																</div>
															)}
														</div>
													);
												})}
											</div>
										</div>
									))}
								</div>
							);
						})}
					</aside>

					{/* Right pane: selected topic details */}
					<main className={styles.detailsPane}>
						{selectedTopic ? (
							(() => {
								const t = selectedTopic;
								const d = drafts[t.id] ?? {
									percent: '',
									rating: '' as const,
									comment: '',
								};
								const isSecretary = t.my_role === 'secretary';
								const isChairman = t.my_role === 'chairman';
								const rd = resultDrafts[t.id] ?? {
									conclusion: '' as const,
									general_comment: '',
								};
								const others = t.reviews.filter((r) => r.user_id !== user?.id);
								const reviewed = t.reviews.filter((r) => r.rating != null || r.progress_percent != null);

								return (
									<div className={styles.detailsContent}>
										{/* Details Header */}
										<div className={styles.detailsHeader}>
											<div className={styles.detailsHeaderMain}>
												<div className={styles.detailsTitleRow}>
													<span className={styles.detailsHeaderRoleBadge}>
														{SEAT_ROLE_LABELS[t.my_role]}
													</span>
													{t.department_name && (
														<span className={styles.detailsMetaTag}>{t.department_name}</span>
													)}
													{t.category_name && (
														<span className={styles.detailsMetaTag}>{t.category_name}</span>
													)}
												</div>
												<h2 className={styles.detailsTopicTitle}>{t.title}</h2>
											</div>

											<div className={styles.detailsHeaderMeta}>
												<div className={styles.detailsMetaItem}>
													<strong>Hội đồng:</strong> {t.council_name}
												</div>
												{t.round_name && (
													<div className={styles.detailsMetaItem}>
														<strong>Đợt nghiên cứu:</strong> {t.round_name}
													</div>
												)}
												<div className={styles.detailsMetaItemRow}>
													{t.defense_date && (
														<div className={styles.detailsMetaItem}>
															<strong>Ngày họp:</strong> {t.defense_date}
														</div>
													)}
													{t.location && (
														<div className={styles.detailsMetaItem}>
															<strong>Địa điểm:</strong> {t.location}
														</div>
													)}
													{t.session && (
														<div className={styles.detailsMetaItem}>
															<strong>Phiên:</strong> {SESSION_LABELS[t.session] || t.session}
														</div>
													)}
												</div>
											</div>
										</div>

										{/* ── Đánh giá của tôi ── */}
										<div className={`${styles.cardSection} ${styles.accentGreen}`}>
											<h3 className={`${styles.cardSectionTitle} ${styles.accentGreen}`}>📝 Đánh giá của tôi</h3>
											
											<div className={styles.evaluationFormGrid}>
												<div className={styles.evaluationFormLeft}>
													<div className={styles.formGroup}>
														<label className={styles.formLabel}>Tiến độ hoàn thành</label>
														<div className={styles.inputGroupPercent}>
															<input
																type='number'
																min={0}
																max={100}
																step={5}
																value={d.percent}
																onChange={(e) =>
																	setDraft(t.id, { percent: e.target.value })
																}
																className={styles.percentInput}
																placeholder="0"
															/>
															<span className={styles.inputGroupAddon}>%</span>
														</div>
													</div>

													<div className={styles.formGroup}>
														<label className={styles.formLabel}>Xếp loại tiến độ</label>
														<div className={styles.customSelectWrapper}>
															<select
																value={d.rating}
																onChange={(e) =>
																	setDraft(t.id, {
																		rating: e.target.value as Draft['rating'],
																	})
																}
																className={`${styles.ratingSelect} ${d.rating ? styles['select_' + d.rating] : ''}`}
															>
																<option value=''>— Chọn xếp loại —</option>
																{(
																	Object.keys(
																		PROGRESS_RATING_LABELS,
																	) as ProgressRating[]
																).map((r) => (
																	<option
																		key={r}
																		value={r}
																	>
																		{PROGRESS_RATING_LABELS[r]}
																	</option>
																))}
															</select>
														</div>
													</div>
												</div>

												<div className={styles.evaluationFormRight}>
													<div className={styles.formGroup}>
														<div className={styles.textareaHeader}>
															<label className={styles.formLabel}>Nhận xét chi tiết</label>
															<span className={styles.charCounter}>
																{d.comment.length} / 2000
															</span>
														</div>
														<textarea
															rows={5}
															maxLength={2000}
															value={d.comment}
															onChange={(e) =>
																setDraft(t.id, { comment: e.target.value })
															}
															className={styles.commentInput}
															placeholder='Nhận xét chi tiết về tiến độ, khối lượng đã thực hiện, kiến nghị điều chỉnh...'
														/>
													</div>
												</div>
											</div>

											<div className={styles.cardSectionActions}>
												<button
													className={styles.saveBtn}
													disabled={savingId === t.id}
													onClick={() => handleSave(t)}
												>
													{savingId === t.id ? (
														<span className={styles.loadingSpinnerBtn}>
															<span className={styles.spinner}></span>
															Đang lưu…
														</span>
													) : savedId === t.id ? (
														'✓ Đã lưu đánh giá'
													) : (
														<>💾 Lưu đánh giá</>
													)}
												</button>
											</div>
										</div>

										{/* ── Đánh giá của hội đồng ── */}
										{others.length > 0 && (
											<div className={`${styles.cardSection} ${styles.accentBlue}`}>
												<div className={styles.othersTitleRow}>
													<h3 className={`${styles.cardSectionTitle} ${styles.accentBlue}`}>👥 Đánh giá của hội đồng</h3>
													<span className={styles.avgBadge}>
														{reviewed.length}/5 đã đánh giá
													</span>
												</div>
												<div className={styles.othersTableContainer}>
													<table className={styles.othersTable}>
														<thead>
															<tr>
																<th>Thành viên</th>
																<th>Vai trò</th>
																<th>Tiến độ</th>
																<th>Xếp loại</th>
																<th>Nhận xét</th>
															</tr>
														</thead>
														<tbody>
															{others.map((r) => (
																<tr key={r.user_id}>
																	<td className={styles.othersTableName}>{r.full_name}</td>
																	<td className={styles.othersTableRole}>{SEAT_ROLE_LABELS[r.role]}</td>
																	<td className={styles.othersTablePercent}>
																		{r.progress_percent != null
																			? `${r.progress_percent}%`
																			: '—'}
																	</td>
																	<td>
																		{r.rating ? (
																			<span
																				className={`${styles.ratingBadge} ${styles[RATING_CLASS[r.rating]]}`}
																			>
																				{PROGRESS_RATING_LABELS[r.rating]}
																			</span>
																		) : (
																			'—'
																		)}
																	</td>
																	<td className={styles.othersTableComment} title={r.comment ?? undefined}>
																		{r.comment || '—'}
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												</div>
											</div>
										)}

										{/* ── Kết luận & nhận xét chung của hội đồng ── */}
										<div className={`${styles.conclusionPanel} ${isChairman ? styles.isChairmanPanel : ''}`}>
											<div className={styles.conclusionHeader}>
												<span className={styles.conclusionTitle}>
													⚖️ Kết luận &amp; nhận xét chung của hội đồng
												</span>
												{!isChairman && (
													<span className={styles.conclusionHint}>
														Do chủ tịch hội đồng chốt
													</span>
												)}
											</div>

											{isChairman ? (
												<div className={styles.conclusionForm}>
													{isChairman && (
														<div className={styles.conclusionChairmanBadge}>
															👑 Vai trò: Chủ tịch Hội đồng
														</div>
													)}
													<div className={styles.conclusionFormGrid}>
														<div className={styles.conclusionSelectField}>
															<label className={styles.formLabel}>Kết luận cuối cùng</label>
															<div className={styles.customSelectWrapper}>
																<select
																	value={rd.conclusion}
																	onChange={(e) =>
																		setResultDraft(t.id, {
																			conclusion: e.target
																				.value as ResultDraft['conclusion'],
																		})
																	}
																	className={`${styles.conclusionSelect} ${rd.conclusion ? styles['select_' + rd.conclusion] : ''}`}
																>
																	<option value=''>— Chọn kết luận —</option>
																	{(
																		Object.keys(CONCLUSION_LABELS) as Conclusion[]
																	).map((c) => (
																		<option
																			key={c}
																			value={c}
																		>
																			{CONCLUSION_LABELS[c]}
																		</option>
																	))}
																</select>
															</div>
														</div>
														<div className={styles.conclusionTextField}>
															<div className={styles.textareaHeader}>
																<label className={styles.formLabel}>Nhận xét chung đại diện cho cả hội đồng</label>
																<span className={styles.charCounter}>
																	{rd.general_comment.length} / 2000
																</span>
															</div>
															<textarea
																rows={4}
																maxLength={2000}
																value={rd.general_comment}
																onChange={(e) =>
																	setResultDraft(t.id, {
																		general_comment: e.target.value,
																	})
																}
																className={styles.conclusionTextarea}
																placeholder='Tóm tắt các ý kiến nhận xét chung của toàn hội đồng, các đề nghị chỉnh sửa chi tiết (nếu có)...'
															/>
														</div>
													</div>
													<div className={styles.conclusionActions}>
														<button
															className={styles.saveBtn}
															disabled={savingResultId === t.id}
															onClick={() => handleSaveResult(t)}
														>
															{savingResultId === t.id ? (
																<span className={styles.loadingSpinnerBtn}>
																	<span className={styles.spinner}></span>
																	Đang lưu…
																</span>
															) : savedResultId === t.id ? (
																'✓ Đã lưu kết luận'
															) : (
																<>💾 Lưu kết luận</>
															)}
														</button>
													</div>
												</div>
											) : t.result?.conclusion ? (
												<div className={styles.conclusionDisplay}>
													<div className={styles.conclusionDisplayHeader}>
														<span
															className={`${styles.ratingBadge} ${styles[CONCLUSION_CLASS[t.result.conclusion]]}`}
														>
															{CONCLUSION_LABELS[t.result.conclusion]}
														</span>
														<span className={styles.conclusionMeta}>
															Chốt bởi: {t.result.decided_by_name} · {t.result.updated_at}
														</span>
													</div>
													{t.result.general_comment && (
														<div className={styles.conclusionComment}>
															{t.result.general_comment}
														</div>
													)}
												</div>
											) : (
												<div className={styles.conclusionEmpty}>
													Chủ tịch hội đồng chưa chốt kết luận.
												</div>
											)}
										</div>

										{/* ── File đánh giá & Biên bản ── */}
										<div className={styles.filesRow}>
											<div className={styles.filesBox}>
												<div className={styles.filesTitle}>
													<span>📁 File đánh giá</span>
													{isSecretary && (
														<>
															<input
																ref={(el) => {
																	fileInputs.current[t.id] = el;
																}}
																type='file'
																multiple
																hidden
																onChange={(e) =>
																	handleUpload(t, e.target.files)
																}
															/>
															<button
																className={styles.uploadBtn}
																disabled={uploadingId === t.id}
																onClick={() =>
																	fileInputs.current[t.id]?.click()
																}
															>
																{uploadingId === t.id
																	? 'Đang tải lên…'
																	: '+ Tải file lên'}
															</button>
														</>
													)}
												</div>
												{t.evaluation_files.length === 0 ? (
													<div className={styles.noFiles}>
														{isSecretary
															? 'Chưa có file — thư ký tải file đánh giá lên tại đây.'
															: 'Thư ký chưa tải file đánh giá lên.'}
													</div>
												) : (
													<div className={styles.fileList}>
														{t.evaluation_files.map((f) => (
															<div
																key={f.id}
																className={styles.fileRow}
															>
																<a
																	href={`${BASE_URL}${f.file_url}`}
																	target='_blank'
																	rel='noreferrer'
																	className={styles.fileName}
																>
																	<span className={styles.fileIcon}>{getFileIcon(f.file_name)}</span>
																	<span className={styles.fileText}>{f.file_name}</span>
																</a>
																<span className={styles.fileMeta}>
																	{fmtSize(f.file_size)} ·{' '}
																	{f.uploaded_by_name ?? ''} · {f.created_at}
																</span>
																{isSecretary && (
																	<button
																		className={styles.fileDelete}
																		title='Xóa file'
																		onClick={() => handleDeleteFile(t, f.id)}
																	>
																		✕
																	</button>
																)}
															</div>
														))}
													</div>
												)}
											</div>

											{/* ── Biên bản hội đồng ── */}
											<div className={styles.filesBox}>
												<div className={styles.filesTitle}>
													<span>🗂️ Biên bản hội đồng</span>
													{isSecretary && (
														<>
															<input
																ref={(el) => {
																	minutesInputs.current[t.id] = el;
																}}
																type='file'
																multiple
																hidden
																onChange={(e) =>
																	handleUploadMinutes(t, e.target.files)
																}
															/>
															<button
																className={styles.uploadBtn}
																disabled={uploadingMinutesId === t.id}
																onClick={() =>
																	minutesInputs.current[t.id]?.click()
																}
															>
																{uploadingMinutesId === t.id
																	? 'Đang tải lên…'
																	: '+ Tải biên bản'}
															</button>
														</>
													)}
												</div>
												{t.minutes_files.length === 0 ? (
													<div className={styles.noFiles}>
														{isSecretary
															? 'Chưa có biên bản — thư ký tải biên bản họp lên tại đây.'
															: 'Thư ký chưa tải biên bản lên.'}
													</div>
												) : (
													<div className={styles.fileList}>
														{t.minutes_files.map((f) => (
															<div
																key={f.id}
																className={styles.fileRow}
															>
																<a
																	href={`${BASE_URL}${f.file_url}`}
																	target='_blank'
																	rel='noreferrer'
																	className={styles.fileName}
																>
																	<span className={styles.fileIcon}>{getFileIcon(f.file_name)}</span>
																	<span className={styles.fileText}>{f.file_name}</span>
																</a>
																<span className={styles.fileMeta}>
																	{fmtSize(f.file_size)} ·{' '}
																	{f.uploaded_by_name ?? ''} · {f.created_at}
																</span>
																{isSecretary && (
																	<button
																		className={styles.fileDelete}
																		title='Xóa biên bản'
																		onClick={() => handleDeleteMinutes(t, f.id)}
																	>
																		✕
																	</button>
																)}
															</div>
														))}
													</div>
												)}
											</div>
										</div>
									</div>
								);
							})()
						) : (
							<div className={styles.emptyDetailsState}>
								<div className={styles.emptyDetailsTitle}>Vui lòng chọn một đề tài</div>
								<div className={styles.emptyDetailsDesc}>Chọn đề tài từ danh sách bên trái để xem đầy đủ thông tin và nhập kết quả đánh giá.</div>
							</div>
						)}
					</main>
				</div>
				</>
			)}
		</UserLayout>
	);
}

import { useState } from 'react';
import { CheckSvg, InfoSvg, UploadSvg, XSvg } from '@/assets/icons';
import { FileDropzone } from '@/shared/components';
import {
	importCouncilsExcel,
	type ImportExcelResult,
} from '../api/councilApi';
import type { ResearchRound } from '../../round/types/round.type';
import { SEAT_ROLE_LABELS, SESSION_LABELS } from '../types/council.type';
import styles from '../pages/Council.module.css';

// Nhập hội đồng từ file Excel lịch bảo vệ (format chuẩn bệnh viện): chọn đợt +
// file → dry-run xem trước từng hội đồng/ghế/đề tài match được → xác nhận nhập.
export function CouncilImportModal({
	rounds,
	onClose,
	onDone,
}: {
	rounds: ResearchRound[];
	onClose: () => void;
	onDone: () => void;
}) {
	const [roundId, setRoundId] = useState(rounds[0]?.id ?? '');
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<ImportExcelResult | null>(null);
	const [result, setResult] = useState<ImportExcelResult | null>(null);

	const runDryRun = async (f: File, rid: string) => {
		setLoading(true);
		setError('');
		setPreview(null);
		try {
			setPreview(await importCouncilsExcel(rid, f, true));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const onPickFile = (f: File | null) => {
		setFile(f);
		setResult(null);
		if (f && roundId) runDryRun(f, roundId);
	};

	const onChangeRound = (rid: string) => {
		setRoundId(rid);
		setResult(null);
		if (file && rid) runDryRun(file, rid);
	};

	const importable =
		preview?.councils?.filter((c) => !c.duplicate).length ?? 0;

	const commit = async () => {
		if (!file || !roundId) return;
		setLoading(true);
		setError('');
		try {
			setResult(await importCouncilsExcel(roundId, file, false));
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập hội đồng thất bại');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal} style={{ width: '40vw', maxWidth: '40vw' }}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<UploadSvg />
					</div>
					<div>
						<div className={styles.modalTitle} style={{ fontSize: 22 }}>
							Nhập hội đồng từ Excel
						</div>
						<div className={styles.modalSub} style={{ fontSize: 14 }}>
							File lịch bảo vệ chuẩn bệnh viện — mỗi dòng 1 đề tài kèm 5 ghế hội đồng
						</div>
					</div>
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					{!result && (
						<>
							<div className={styles.warnBox}>
								<InfoSvg />
								<span>
									Các dòng cùng bộ 5 ghế được gom thành 1 hội đồng; đề tài match
									theo tên với đề tài có sẵn trong đợt. Hội đồng sinh ra ở trạng
									thái Nháp — rà lại trước khi chốt.
								</span>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Đợt nghiên cứu</label>
								<select
									className={styles.formInput}
									value={roundId}
									onChange={(e) => onChangeRound(e.target.value)}
								>
									{rounds.map((r) => (
										<option key={r.id} value={r.id}>
											{r.name} ({r.year})
										</option>
									))}
								</select>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>File Excel (.xlsx)</label>
								<FileDropzone
									value={file}
									onChange={onPickFile}
									accept='.xlsx'
									disabled={loading}
								/>
							</div>
							{loading && (
								<div className={styles.modalSub}>
									<span className={styles.spinner} /> Đang đọc file…
								</div>
							)}
							{error && <div className={styles.fieldError}>{error}</div>}

							{preview?.councils && (
								<>
									<div className={styles.warnBox}>
										<CheckSvg />
										<span>
											Đọc được {preview.councils.length} hội đồng,{' '}
											{preview.topics_matched}/{preview.topics_total} đề tài
											match được với dữ liệu trong đợt.
										</span>
									</div>
									{preview.warnings.length > 0 && (
										<ul className={styles.deleteDesc}>
											{preview.warnings.map((w, i) => (
												<li key={i}>{w}</li>
											))}
										</ul>
									)}
									<div className={styles.createdCouncilsSection}>
										{preview.councils.map((c) => (
											<div key={c.name} className={styles.createdCouncilCard}>
												<div className={styles.createdCouncilHeader}>
													<span className={styles.createdCouncilName}>
														{c.name}
														{c.duplicate ? ' — TRÙNG, sẽ bỏ qua' : ''}
													</span>
													<span className={styles.createdCouncilGroup}>
														{[c.specialty_group, c.location]
															.filter(Boolean)
															.join(' · ')}
													</span>
												</div>
												<div className={styles.createdCouncilMembers}>
													{c.seats.map((s) => (
														<div key={s.role} className={styles.createdMemberRow}>
															<span className={styles.createdMemberRole}>
																{SEAT_ROLE_LABELS[s.role]}
															</span>
															{s.matched ? (
																<>
																	<span
																		className={styles.createdMemberName}
																		title={s.raw_name}
																	>
																		{s.matched.full_name}
																		{s.matched.type === 'external'
																			? ' (ngoài viện)'
																			: ''}
																	</span>
																	<span className={styles.createdMemberDept}>
																		{s.matched.department_name || ''}
																	</span>
																</>
															) : (
																<span
																	className={styles.createdMemberName}
																	style={{ color: 'var(--color-red-600, #dc2626)' }}
																	title={s.error}
																>
																	{s.raw_name} — {s.error}
																</span>
															)}
														</div>
													))}
												</div>
												<div className={styles.modalSub} style={{ marginTop: 6 }}>
													{c.topics.filter((t) => t.matched && !t.skip_assign).length}
													/{c.topics.length} đề tài sẽ được gán
													{c.topics.some((t) => t.session) &&
														` (${c.topics.filter((t) => t.session === 'morning').length} ${SESSION_LABELS.morning.toLowerCase()}, ${c.topics.filter((t) => t.session === 'afternoon').length} ${SESSION_LABELS.afternoon.toLowerCase()})`}
													{(() => {
														const n = c.topics.reduce(
															(s, t) => s + t.substitutes.length,
															0,
														);
														return n > 0 ? ` · ${n} ghế thay thế theo đề tài` : '';
													})()}
												</div>
											</div>
										))}
									</div>
								</>
							)}
						</>
					)}

					{result && (
						<>
							<div className={styles.warnBox}>
								<CheckSvg />
								<span>
									Đã nhập {result.councils_created} hội đồng, gán{' '}
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
						</>
					)}
				</div>

				<div className={styles.modalFooter}>
					<button className={styles.btnCancel} onClick={onClose} disabled={loading}>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button
							className={styles.btnConfirmApprove}
							onClick={commit}
							disabled={loading || !preview || importable === 0}
						>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Nhập {importable} hội đồng
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

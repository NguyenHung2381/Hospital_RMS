import { useEffect, useMemo, useState } from 'react';
import { CheckSvg, DownloadSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { Badge, FileDropzone, Modal } from '@/shared/components';
import { Pagination } from '@/shared/components/Table/Pagination';
import { InlineLoading } from '@/shared/components/Loading';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { usePermission } from '@/shared/hooks/usePermission';
import tbl from '@/shared/components/Table/Table.module.css';
// Dùng chung style hộp thoại nhập Excel với CME / hội thảo
import styles from '@/features/seminar/pages/Seminar.module.css';
import { saveBlob } from '@/shared/utils/saveBlob';
import {
	downloadTopicImportTemplate,
	getLevels,
	importTopicsExcel,
	type SimpleItem,
	type TopicImportDefaults,
	type TopicImportResult,
} from '../api/topicApi';
import { MEMBER_ROLE_CFG, STATUS_CFG } from '../utils/topicHelpers';

// Nhập DANH SÁCH đề tài từ Excel (mỗi dòng 1 thành viên, như file "Xuất Excel"):
// chọn mặc định + file → dry-run xem trước (tự đọc lại khi đổi mặc định) → nhập dòng hợp lệ.
export function TopicImportModal({
	rounds,
	onClose,
	onDone,
}: {
	rounds: SimpleItem[];
	onClose: () => void;
	onDone: () => void;
}) {
	const canApprove = usePermission().has('topics:approve');
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<TopicImportResult | null>(null);
	const [result, setResult] = useState<TopicImportResult | null>(null);
	const [downloading, setDownloading] = useState(false);
	// Đợt + cấp độ chọn ở đây, áp cho cả file (file không có cột Đợt / Cấp độ)
	const [roundId, setRoundId] = useState('');
	const [levelId, setLevelId] = useState('');
	const [articleType, setArticleType] = useState<'de_tai' | 'bai_bao'>('de_tai');
	const [status, setStatus] = useState<NonNullable<TopicImportDefaults['status']>>('submitted');
	// Cấp độ ăn theo đợt: chỉ liệt kê cấp độ của đợt đã chọn; đợt chỉ có 1 cấp độ ⇒ tự chọn
	const [roundLevels, setRoundLevels] = useState<SimpleItem[]>([]);
	useEffect(() => {
		setLevelId('');
		setRoundLevels([]);
		if (!roundId) return;
		let alive = true;
		getLevels({ round_id: roundId })
			.then((res) => {
				if (!alive) return;
				setRoundLevels(res.data);
				if (res.data.length === 1) setLevelId(res.data[0].id);
			})
			.catch(() => alive && setError('Không tải được cấp độ của đợt'));
		return () => {
			alive = false;
		};
	}, [roundId]);
	const defaults = useMemo<TopicImportDefaults>(
		() => ({
			round_id: roundId,
			level_id: articleType === 'bai_bao' ? '' : levelId,
			article_type: articleType,
			status,
		}),
		[roundId, levelId, articleType, status],
	);

	useEffect(() => {
		setPreview(null);
		if (!file || !roundId) return;
		let stale = false;
		const t = setTimeout(async () => {
			setLoading(true);
			setError('');
			try {
				const res = await importTopicsExcel(file, true, defaults);
				if (!stale) setPreview(res);
			} catch (e) {
				if (!stale) {
					setPreview(null);
					setError(e instanceof Error ? e.message : 'Đọc file thất bại');
				}
			} finally {
				setLoading(false);
			}
		}, 300);
		return () => {
			stale = true;
			clearTimeout(t);
		};
	}, [file, roundId, defaults]);

	const commit = async () => {
		if (!file) return;
		setLoading(true);
		setError('');
		try {
			setResult(await importTopicsExcel(file, false, defaults));
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập thất bại');
		} finally {
			setLoading(false);
		}
	};

	const downloadTemplate = async () => {
		setDownloading(true);
		try {
			saveBlob(await downloadTopicImportTemplate(), 'mau-nhap-de-tai.xlsx');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Tải file mẫu thất bại');
		} finally {
			setDownloading(false);
		}
	};

	const rows = preview?.rows ?? [];
	const pg = useClientPaging(rows);
	const s = preview?.summary;
	const select = (value: string, onChange: (v: string) => void, items: SimpleItem[], empty: string) => (
		<select className={styles.formInput} value={value} onChange={(e) => onChange(e.target.value)}>
			<option value=''>{empty}</option>
			{items.map((x) => (
				<option key={x.id} value={x.id}>
					{x.name}
				</option>
			))}
		</select>
	);

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UploadSvg />}
			title='Nhập đề tài NCKH từ Excel'
			subtitle='Dùng file mẫu hoặc file "Xuất Excel" của hệ thống — tự dò tiêu đề cột'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={loading}>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button className={styles.btnPrimary} onClick={commit} disabled={loading || !roundId || !s || s.importable === 0}>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Nhập {s?.importable || ''} đề tài
						</button>
					)}
				</>
			}
		>
			{!result && (
				<>
					<div className={styles.noticeBox}>
						<InfoSvg />
						<span>
							Mỗi đề tài 1 khối dòng đã <b>gộp ô</b> sẵn trong file mẫu: dòng 1 <b>Chủ nhiệm</b>, dòng 2 <b>Thư ký</b>, dòng 3 Thành viên — chỉ điền Họ và tên / MNV, không cần nhập vai trò.
							Thành viên khớp theo <b>MNV</b> (thiếu họ tên thì lấy từ hệ thống). <b>Đợt</b> và <b>Cấp độ</b> chọn dưới đây áp cho cả file. Đề tài <b>trùng tên trong cùng đợt</b> hoặc có lỗi sẽ bị bỏ qua.
						</span>
					</div>
					<div className={styles.importDefaults}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Đợt nghiên cứu <span className={styles.required}>*</span>
							</label>
							{select(roundId, setRoundId, rounds, '-- Chọn đợt --')}
						</div>
						{articleType !== 'bai_bao' && (
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>
									Cấp độ {roundLevels.length > 0 && <span className={styles.required}>*</span>}
								</label>
								{roundId ? (
									select(levelId, setLevelId, roundLevels, '-- Chọn cấp độ --')
								) : (
									<select className={styles.formInput} disabled>
										<option>-- Chọn đợt trước --</option>
									</select>
								)}
							</div>
						)}
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Loại</label>
							<select
								className={styles.formInput}
								value={articleType}
								onChange={(e) => setArticleType(e.target.value as 'de_tai' | 'bai_bao')}
							>
								<option value='de_tai'>Đề tài</option>
								<option value='bai_bao'>Bài báo</option>
							</select>
						</div>
						{canApprove && (
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Trạng thái sau khi nhập</label>
								<select
									className={styles.formInput}
									value={status}
									onChange={(e) => setStatus(e.target.value as typeof status)}
								>
									{(['submitted', 'approved', 'rejected', 'cancelled'] as const).map((k) => (
										<option key={k} value={k}>
											{STATUS_CFG[k].label}
										</option>
									))}
								</select>
							</div>
						)}
					</div>

					<button
						type='button'
						className={styles.btnGhost}
						onClick={downloadTemplate}
						disabled={downloading}
						style={{ marginBottom: 12 }}
					>
						{downloading ? <span className={styles.spinner} /> : <DownloadSvg />}
						Tải file mẫu
					</button>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>File Excel (.xlsx)</label>
						<FileDropzone
							value={file}
							onChange={(f) => {
								setFile(f);
								setPreview(null);
								setError('');
							}}
							accept='.xlsx'
							disabled={loading}
						/>
					</div>

					{loading && <InlineLoading label='Đang đọc file…' />}
					{error && <div className={styles.fieldError}>{error}</div>}

					{s && (
						<>
							<div
								className={`${styles.noticeBox} ${s.importable > 0 ? styles.noticeOk : styles.noticeWarn}`}
								style={{ marginTop: 12 }}
							>
								<CheckSvg />
								<span>
									Đọc được <b>{s.total}</b> đề tài · <b>{s.importable}</b> sẽ được nhập ({s.members} thành viên)
									{s.duplicates > 0 && <> · {s.duplicates} trùng</>}
									{s.invalid > 0 && <> · {s.invalid} có lỗi</>}
								</span>
							</div>

							<div className={styles.importPreview}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th className={tbl.thIdx}>Dòng</th>
											<th>Tên đề tài</th>
											<th>Đợt · Thể loại · Cấp độ</th>
											<th>Khoa/Phòng</th>
											<th>Thành viên</th>
											<th>Trạng thái</th>
										</tr>
									</thead>
									<tbody>
										{pg.paged.map((r) => {
											const bad = r.errors.length > 0;
											return (
												<tr key={r.row} style={bad || r.duplicate ? { opacity: 0.65 } : undefined}>
													<td className={tbl.tdIdx}>{r.row}</td>
													<td>
														<span className={tbl.cellTitle}>{r.title || '—'}</span>
														{[...r.errors, ...r.warnings].map((w, j) => (
															<div key={j} className={styles.rowWarn}>
																{w}
															</div>
														))}
													</td>
													<td>
														{[r.round_name, r.category_name, r.level_name].filter(Boolean).join(' · ') || (
															<span className={styles.muted}>—</span>
														)}
													</td>
													<td>{r.department_name || <span className={styles.muted}>—</span>}</td>
													<td>
														{r.members.map((m, j) => (
															<div key={j} className={tbl.cellSub}>
																{m.name}
																{m.staff_number != null && ` (${m.staff_number})`} — {MEMBER_ROLE_CFG[m.role].label}
															</div>
														))}
													</td>
													<td>
														{bad ? (
															<Badge tone='red'>Lỗi</Badge>
														) : r.duplicate ? (
															<Badge tone='amber'>Trùng</Badge>
														) : (
															<Badge tone='green'>Hợp lệ</Badge>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
							<Pagination {...pg.pagination} itemLabel='đề tài' />
						</>
					)}
				</>
			)}

			{result && (
				<>
					<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
						<CheckSvg />
						<span>
							Đã nhập <b>{result.inserted}</b> đề tài
							{result.summary.duplicates > 0 && <>, bỏ qua {result.summary.duplicates} đề tài trùng</>}
							{result.summary.invalid > 0 && <>, {result.summary.invalid} đề tài lỗi</>}.
						</span>
					</div>
					{result.failures && result.failures.length > 0 && (
						<ul className={styles.warnList}>
							{result.failures.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
				</>
			)}
		</Modal>
	);
}

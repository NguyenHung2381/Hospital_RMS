import { useState } from 'react';
import { AlertSvg, SearchSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import { ENROLLMENT_STATUS_CFG, type EnrollmentStatus } from '../../course/types/course.type';
import { formatDateOr } from '../../../shared/utils/formatDate';
import { lookupByNationalId, type LookupResult } from '../api/publicApi';
import styles from './PublicPortal.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

export default function PublicLookup() {
	const [fullName, setFullName] = useState('');
	const [nationalId, setNationalId] = useState('');
	const [dob, setDob] = useState('');
	const [results, setResults] = useState<LookupResult[] | null>(null);
	const pg = useClientPaging(results ?? []);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const handleSearch = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!fullName.trim()) return setError('Vui lòng nhập họ và tên');
		if (!nationalId.trim()) return setError('Vui lòng nhập số CCCD/CMND');
		if (!dob) return setError('Vui lòng nhập ngày sinh');
		setLoading(true);
		setError('');
		setResults(null);
		try {
			setResults(await lookupByNationalId(nationalId.trim(), dob, fullName.trim()));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Tra cứu thất bại, vui lòng thử lại');
		} finally {
			setLoading(false);
		}
	};

	return (
		<PublicLayout
			title='Tra cứu kết quả học tập & chứng chỉ'
			subtitle='Nhập họ tên, số CCCD/CMND và ngày sinh đã dùng khi đăng ký để tra cứu tình trạng đăng ký, kết quả học tập và chứng chỉ.'
		>
			{error && (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> {error}
				</div>
			)}

			<form
				onSubmit={handleSearch}
				className={`${styles.searchRow} ${styles.searchRowLabeled}`}
			>
				<label className={styles.searchField}>
					<span className={styles.label}>
						Họ và tên <span className={styles.required}>*</span>
					</span>
					<input
						className={styles.input}
						value={fullName}
						onChange={(e) => setFullName(e.target.value)}
						placeholder='VD: Nguyễn Văn An'
						autoComplete='name'
						maxLength={150}
					/>
				</label>
				<label className={styles.searchField}>
					<span className={styles.label}>
						Số CCCD/CMND <span className={styles.required}>*</span>
					</span>
					<input
						className={styles.input}
						value={nationalId}
						onChange={(e) => setNationalId(e.target.value)}
						placeholder='Nhập số CCCD/CMND...'
						inputMode='numeric'
					/>
				</label>
				<label className={`${styles.searchField} ${styles.searchFieldDate}`}>
					<span className={styles.label}>
						Ngày sinh <span className={styles.required}>*</span>
					</span>
					<input
						type='date'
						className={styles.input}
						value={dob}
						onChange={(e) => setDob(e.target.value)}
						max={new Date().toISOString().slice(0, 10)}
						title='Ngày sinh (ngày/tháng/năm)'
					/>
				</label>
				<button
					type='submit'
					className={styles.searchBtn}
					disabled={loading}
				>
					<SearchSvg /> {loading ? 'Đang tra cứu...' : 'Tra cứu'}
				</button>
			</form>
			<p className={styles.searchHint}>
				Nhập họ tên, số CCCD/CMND và ngày sinh (ngày/tháng/năm) trùng với thông tin đã khai khi đăng ký khóa học. Họ tên không phân biệt chữ hoa/thường.
			</p>

			{results && (
				<>
					{results.length === 0 ? (
						<div className={styles.emptyNotice}>Không tìm thấy dữ liệu đăng ký khớp họ tên, số CCCD/CMND và ngày sinh đã nhập.</div>
					) : (
						<div style={{ overflowX: 'auto' }}>
							<table className={styles.resultTable}>
								<thead>
									<tr>
										<th className={tbl.thIdx}>STT</th>
										<th>Họ tên</th>
										<th>Khóa học</th>
										<th>Trạng thái</th>
										<th>Kết quả</th>
										<th>Chứng chỉ</th>
									</tr>
								</thead>
								<tbody>
									{pg.paged.map((r, i) => {
										const cfg = ENROLLMENT_STATUS_CFG[r.enrollment_status as EnrollmentStatus];
										return (
											<tr key={i}>
												<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
												<td><span className={tbl.cellTitle}>{r.full_name}</span></td>
												<td>{r.course_name}</td>
												<td>
													{cfg ? (
														<span
															className={styles.badge}
															style={{ color: cfg.color, background: cfg.bg }}
														>
															{cfg.label}
														</span>
													) : (
														r.enrollment_status
													)}
												</td>
												<td>{r.result ?? (r.score != null ? String(r.score) : '—')}</td>
												<td>
													{r.cert_no ? (
														<>
															{r.cert_no}
															{r.issue_date && (
																<div className={tbl.dateText}>
																	Cấp ngày {formatDateOr(r.issue_date)}
																</div>
															)}
														</>
													) : (
														'—'
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
							<Pagination
								{...pg.pagination}
								itemLabel='kết quả'
							/>
						</div>
					)}
				</>
			)}
		</PublicLayout>
	);
}

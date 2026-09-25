import { useState } from 'react';
import { AlertSvg, SearchSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import { ENROLLMENT_STATUS_CFG, type EnrollmentStatus } from '../../course/types/course.type';
import { formatDateOr } from '../../../shared/utils/formatDate';
import { lookupByNationalId, type LookupResult } from '../api/publicApi';
import styles from './PublicPortal.module.css';

export default function PublicLookup() {
	const [nationalId, setNationalId] = useState('');
	const [dob, setDob] = useState('');
	const [results, setResults] = useState<LookupResult[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const handleSearch = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!nationalId.trim()) return;
		if (!dob) return setError('Vui lòng nhập ngày sinh');
		setLoading(true);
		setError('');
		setResults(null);
		try {
			setResults(await lookupByNationalId(nationalId.trim(), dob));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Tra cứu thất bại, vui lòng thử lại');
		} finally {
			setLoading(false);
		}
	};

	return (
		<PublicLayout
			title='Tra cứu kết quả học tập & chứng chỉ'
			subtitle='Nhập số CCCD/CMND và ngày sinh đã dùng khi đăng ký để tra cứu tình trạng đăng ký, kết quả học tập và chứng chỉ.'
		>
			{error && (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> {error}
				</div>
			)}

			<form
				onSubmit={handleSearch}
				className={styles.searchRow}
			>
				<input
					className={styles.input}
					value={nationalId}
					onChange={(e) => setNationalId(e.target.value)}
					placeholder='Nhập số CCCD/CMND...'
				/>
				<input
					type='date'
					className={styles.input}
					style={{ flex: '0 0 170px' }}
					value={dob}
					onChange={(e) => setDob(e.target.value)}
					aria-label='Ngày sinh'
					title='Ngày sinh'
				/>
				<button
					type='submit'
					className={styles.searchBtn}
					disabled={loading}
				>
					<SearchSvg /> {loading ? 'Đang tra cứu...' : 'Tra cứu'}
				</button>
			</form>

			{results && (
				<>
					{results.length === 0 ? (
						<div className={styles.emptyNotice}>Không tìm thấy dữ liệu đăng ký khớp số CCCD/CMND và ngày sinh đã nhập.</div>
					) : (
						<div style={{ overflowX: 'auto' }}>
							<table className={styles.resultTable}>
								<thead>
									<tr>
										<th>Họ tên</th>
										<th>Khóa học</th>
										<th>Trạng thái</th>
										<th>Kết quả</th>
										<th>Chứng chỉ</th>
									</tr>
								</thead>
								<tbody>
									{results.map((r, i) => {
										const cfg = ENROLLMENT_STATUS_CFG[r.enrollment_status as EnrollmentStatus];
										return (
											<tr key={i}>
												<td>{r.full_name}</td>
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
																<div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
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
						</div>
					)}
				</>
			)}
		</PublicLayout>
	);
}

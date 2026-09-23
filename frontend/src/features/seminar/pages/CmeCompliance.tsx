import { useCallback, useEffect, useState } from 'react';
import { AlertSvg, CheckSvg, PlusSvg, TrashSvg, WarnSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { apiClient } from '../../../shared/api/axios';
import {
	createCmeRequirement,
	deleteCmeRequirement,
	getCmeCompliance,
	getCmeRequirements,
	type CmeComplianceRow,
	type CmeRequirement,
} from '../api/cmeRequirementApi';
import styles from './Seminar.module.css';

interface SimpleItem {
	id: string;
	name: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function CmeCompliance() {
	const [year, setYear] = useState(CURRENT_YEAR);
	const [requirements, setRequirements] = useState<CmeRequirement[]>([]);
	const [compliance, setCompliance] = useState<CmeComplianceRow[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [form, setForm] = useState({ department_id: '', required_credits: '', note: '' });

	const load = useCallback(() => {
		Promise.all([getCmeRequirements(year), getCmeCompliance(year)])
			.then(([req, comp]) => {
				setRequirements(req);
				setCompliance(comp);
				setError('');
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
	}, [year]);

	useEffect(load, [load]);
	useEffect(() => {
		apiClient
			.get<{ data: SimpleItem[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
	}, []);

	const handleAdd = async () => {
		if (!form.required_credits) return;
		setSaving(true);
		setError('');
		try {
			await createCmeRequirement({
				year,
				required_credits: Number(form.required_credits),
				department_id: form.department_id || undefined,
				note: form.note || undefined,
			});
			setForm({ department_id: '', required_credits: '', note: '' });
			load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Thêm thất bại');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: string) => {
		setSaving(true);
		try {
			await deleteCmeRequirement(id);
			load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<AdminLayout
			pageTitle='Cảnh báo tín chỉ CME'
			pageSubtitle='Ngưỡng tín chỉ đào tạo y khoa liên tục theo năm và danh sách nhân sự chưa đạt'
			breadcrumbs={[{ label: 'Hội nghị & CME' }]}
		>
			<div className={styles.toolbar}>
				<span className={styles.formLabel}>Năm</span>
				<select
					className={styles.filterSelect}
					value={year}
					onChange={(e) => setYear(Number(e.target.value))}
				>
					{YEAR_OPTIONS.map((y) => (
						<option
							key={y}
							value={y}
						>
							{y}
						</option>
					))}
				</select>
			</div>

			{error && (
				<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
					<AlertSvg /> {error}
				</div>
			)}

			<div className={styles.infoCard}>
				<div className={styles.modalTitle}>Ngưỡng tín chỉ CME năm {year}</div>
				<div className={styles.formGrid}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Khoa / Phòng</label>
						<select
							className={styles.formTextarea}
							value={form.department_id}
							onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
						>
							<option value=''>-- Toàn viện --</option>
							{departments.map((d) => (
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
						<label className={styles.formLabel}>Số tín chỉ yêu cầu</label>
						<input
							type='number'
							step='0.1'
							className={styles.formTextarea}
							value={form.required_credits}
							onChange={(e) => setForm((f) => ({ ...f, required_credits: e.target.value }))}
							placeholder='VD: 48'
						/>
					</div>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel}>Ghi chú</label>
						<input
							className={styles.formTextarea}
							value={form.note}
							onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
						/>
					</div>
				</div>
				<button
					className={styles.btnPrimary}
					disabled={saving || !form.required_credits}
					onClick={handleAdd}
					style={{ marginTop: 12 }}
				>
					<PlusSvg /> Thêm ngưỡng
				</button>

				<div className={styles.tableWrap} style={{ marginTop: 16 }}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Phạm vi</th>
								<th>Tín chỉ yêu cầu</th>
								<th>Ghi chú</th>
								<th className={styles.thRight}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{requirements.length === 0 ? (
								<tr>
									<td colSpan={4}>
										<div className={styles.emptyState}>
											<div className={styles.emptyTitle}>Chưa cấu hình ngưỡng CME cho năm {year}</div>
										</div>
									</td>
								</tr>
							) : (
								requirements.map((r) => (
									<tr key={r.id}>
										<td>{r.department_name ?? 'Toàn viện'}</td>
										<td>{r.required_credits}</td>
										<td className={styles.muted}>{r.note ?? '—'}</td>
										<td className={styles.tdRight}>
											<button
												className={styles.actionBtn}
												disabled={saving}
												onClick={() => handleDelete(r.id)}
											>
												<TrashSvg />
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			<div
				className={styles.infoCard}
				style={{ marginTop: 20 }}
			>
				<div className={styles.modalTitle}>
					<WarnSvg style={{ width: 16, height: 16, marginRight: 6 }} />
					Nhân sự chưa đạt ngưỡng CME năm {year} ({compliance.length})
				</div>
				<div className={styles.tableWrap} style={{ marginTop: 12 }}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Họ tên</th>
								<th>Khoa / Phòng</th>
								<th>Đã đạt</th>
								<th>Yêu cầu</th>
								<th>Còn thiếu</th>
							</tr>
						</thead>
						<tbody>
							{loading ? (
								<tr>
									<td colSpan={5}>
										<div className={styles.emptyState}>
											<div className={styles.emptyTitle}>Đang tải...</div>
										</div>
									</td>
								</tr>
							) : compliance.length === 0 ? (
								<tr>
									<td colSpan={5}>
										<div className={styles.emptyState}>
											<CheckSvg className={styles.emptyIcon} />
											<div className={styles.emptyTitle}>Tất cả nhân sự đã đạt ngưỡng CME</div>
										</div>
									</td>
								</tr>
							) : (
								compliance.map((row) => (
									<tr key={row.id}>
										<td>{row.full_name}</td>
										<td className={styles.muted}>{row.department_name ?? '—'}</td>
										<td>{row.earned_credits}</td>
										<td>{row.required_credits}</td>
										<td style={{ color: '#b42318', fontWeight: 700 }}>
											{(row.required_credits - row.earned_credits).toFixed(1)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		</AdminLayout>
	);
}

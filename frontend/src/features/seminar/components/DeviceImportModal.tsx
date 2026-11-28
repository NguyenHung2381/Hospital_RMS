import { useEffect, useMemo, useState } from 'react';
import { CheckSvg, FingerprintSvg, InfoSvg, RefreshSvg } from '@/assets/icons';
import { Badge, DatePicker, Modal, TimePicker } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { Pagination } from '@/shared/components/Table/Pagination';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { formatDateVN, formatTimeVN } from '@/shared/utils/formatDate';
import {
	commitDeviceImport,
	previewDeviceImport,
	type DeviceImportInput,
	type DeviceImportPreview,
	type DeviceImportResult,
	type DeviceImportRow,
} from '../api/seminarApi';
import styles from '../pages/Seminar.module.css';
import own from './DeviceImportModal.module.css';

const STATUS: Record<DeviceImportRow['status'], { label: string; tone: 'green' | 'gray' | 'amber' }> = {
	new: { label: 'Thêm mới', tone: 'green' },
	existing: { label: 'Đã có trong danh sách', tone: 'gray' },
	unmatched: { label: 'Không khớp', tone: 'amber' },
};
// Người mới lên đầu, rồi người đã có, cuối cùng mã không khớp
const ORDER: Record<DeviceImportRow['status'], number> = { new: 0, existing: 1, unmatched: 2 };

const split = (local: string) => ({ date: local.slice(0, 10), time: local.slice(11, 16) });

/**
 * Lấy danh sách người tham dự (cán bộ nội viện) từ lượt chấm ở máy chấm công dành cho hội nghị:
 * chọn khoảng giờ + máy → xem trước (mới / đã có / không khớp) → bỏ chọn người không liên quan →
 * xác nhận thêm người + ghi điểm danh bằng vân tay (backend seminarDeviceImportService).
 */
export function DeviceImportModal({
	seminarId,
	onClose,
	onDone,
}: {
	seminarId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [preview, setPreview] = useState<DeviceImportPreview | null>(null);
	const [result, setResult] = useState<DeviceImportResult | null>(null);
	// Lần đọc đầu chạy ngay khi mở
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	// Khoảng giờ / máy đang chọn (lần đọc đầu lấy mặc định của hội nghị từ máy chủ)
	const [from, setFrom] = useState({ date: '', time: '' });
	const [to, setTo] = useState({ date: '', time: '' });
	const [deviceIds, setDeviceIds] = useState<number[]>([]);
	// Mã trên máy của người mới đã BỎ chọn
	const [skipped, setSkipped] = useState<Set<string>>(new Set());

	const input = (): DeviceImportInput => ({
		...(from.date && from.time ? { from: `${from.date}T${from.time}` } : {}),
		...(to.date && to.time ? { to: `${to.date}T${to.time}` } : {}),
		...(deviceIds.length ? { device_ids: deviceIds } : {}),
	});

	const apply = (res: DeviceImportPreview) => {
		setPreview(res);
		setFrom(split(res.from));
		setTo(split(res.to));
		setDeviceIds(res.devices.filter((d) => d.selected).map((d) => d.id));
		setSkipped(new Set());
	};
	const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Không đọc được lượt chấm');

	const load = async (req: DeviceImportInput) => {
		setLoading(true);
		setError('');
		try {
			apply(await previewDeviceImport(seminarId, req));
		} catch (e) {
			fail(e);
		} finally {
			setLoading(false);
		}
	};

	// Lần đầu: khoảng giờ + máy mặc định của hội nghị
	useEffect(() => {
		let alive = true;
		previewDeviceImport(seminarId, {})
			.then((res) => alive && apply(res))
			.catch((e) => alive && fail(e))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [seminarId]);

	const rows = useMemo(
		() => [...(preview?.rows ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]),
		[preview],
	);
	const pg = useClientPaging(rows);
	const newRows = rows.filter((r) => r.status === 'new');
	const picked = newRows.filter((r) => !skipped.has(r.pin));
	const existing = rows.filter((r) => r.status === 'existing').length;
	const canCommit = !!preview?.method_enabled && (picked.length > 0 || existing > 0);

	const toggle = (pin: string) =>
		setSkipped((prev) => {
			const next = new Set(prev);
			if (next.has(pin)) next.delete(pin);
			else next.add(pin);
			return next;
		});
	const toggleAll = () => setSkipped(picked.length ? new Set(newRows.map((r) => r.pin)) : new Set());

	const commit = async () => {
		setLoading(true);
		setError('');
		try {
			setResult(await commitDeviceImport(seminarId, { ...input(), pins: picked.map((r) => r.pin) }));
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập danh sách thất bại');
		} finally {
			setLoading(false);
		}
	};

	const s = preview?.summary;

	return (
		<Modal
			open
			onClose={onClose}
			icon={<FingerprintSvg />}
			title='Nhập người tham dự từ máy chấm công'
			subtitle='Cán bộ nội viện chấm vân tay ở máy dành cho hội nghị'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						{result ? 'Đóng' : 'Hủy'}
					</button>
					{!result && (
						<button
							type='button'
							className={styles.btnPrimary}
							onClick={commit}
							disabled={loading || !canCommit}
						>
							{loading ? <span className={styles.spinner} /> : <CheckSvg />}
							{picked.length ? `Thêm ${picked.length} người & ghi điểm danh` : 'Ghi điểm danh'}
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
							Lượt chấm được khớp với cán bộ theo <b>mã nhân viên</b> (mã trên máy = mã NV). Người
							chưa có trong danh sách được thêm là nội viện; mọi người khớp được đều được ghi điểm
							danh bằng vân tay (giờ = lần chấm sớm nhất). Bỏ chọn người không tham dự hội nghị
							(ví dụ chỉ đi ngang qua máy).
						</span>
					</div>

					<div className={own.filters}>
						<div className={styles.formGroup}>
							<span className={styles.formLabel}>Từ</span>
							<div className={own.when}>
								<DatePicker
									value={from.date}
									max={to.date || undefined}
									onChange={(date) => setFrom((f) => ({ ...f, date }))}
								/>
								<TimePicker
									value={from.time}
									onChange={(time) => setFrom((f) => ({ ...f, time }))}
								/>
							</div>
						</div>
						<div className={styles.formGroup}>
							<span className={styles.formLabel}>Đến</span>
							<div className={own.when}>
								<DatePicker
									value={to.date}
									min={from.date || undefined}
									onChange={(date) => setTo((t) => ({ ...t, date }))}
								/>
								<TimePicker
									value={to.time}
									onChange={(time) => setTo((t) => ({ ...t, time }))}
								/>
							</div>
						</div>
						<button
							type='button'
							className={styles.btnGhost}
							onClick={() => load(input())}
							disabled={loading}
						>
							<RefreshSvg /> Đọc lại lượt chấm
						</button>
					</div>

					{preview && preview.devices.length > 1 && (
						<div
							className={own.devices}
							role='group'
							aria-label='Máy chấm công'
						>
							{preview.devices.map((d) => (
								<label
									key={d.id}
									className={styles.checkFilter}
								>
									<input
										type='checkbox'
										checked={deviceIds.includes(d.id)}
										onChange={() =>
											setDeviceIds((ids) =>
												ids.includes(d.id) ? ids.filter((x) => x !== d.id) : [...ids, d.id],
											)
										}
									/>
									{d.name}
								</label>
							))}
						</div>
					)}

					{loading && !preview && (
						<div className={styles.modalSub}>
							<span className={styles.spinner} /> Đang đọc lượt chấm…
						</div>
					)}
					{error && <div className={styles.fieldError}>{error}</div>}

					{preview && s && (
						<>
							<div
								className={`${styles.noticeBox} ${styles.noticeOk}`}
								style={{ marginTop: 12 }}
							>
								<CheckSvg />
								<span>
									<b>{s.punches}</b> lượt chấm · <b>{s.new}</b> người mới · {s.existing} đã có trong
									danh sách · {s.unmatched} mã không khớp
									{preview.devices.length === 1 && ` · máy ${preview.devices[0].name}`}.
								</span>
							</div>
							{preview.warnings.length > 0 && (
								<ul className={styles.warnList}>
									{preview.warnings.map((w, i) => (
										<li key={i}>{w}</li>
									))}
								</ul>
							)}

							{rows.length === 0 ? (
								<div className={own.empty}>
									Không có lượt chấm nào trong khoảng giờ này. Kiểm tra máy đã kết nối (trang Máy
									chấm công) hoặc nới khoảng giờ rồi bấm "Đọc lại lượt chấm".
								</div>
							) : (
								<>
									<div className={styles.importPreview}>
										<table className={styles.table}>
											<thead>
												<tr>
													<th className={own.thCheck}>
														{newRows.length > 0 && (
															<input
																type='checkbox'
																aria-label='Chọn tất cả người mới'
																checked={picked.length === newRows.length}
																ref={(el) => {
																	if (el) el.indeterminate = picked.length > 0 && picked.length < newRows.length;
																}}
																onChange={toggleAll}
															/>
														)}
													</th>
													<th>Mã trên máy</th>
													<th>Cán bộ</th>
													<th>Giờ chấm</th>
													<th>Kết quả</th>
												</tr>
											</thead>
											<tbody>
												{pg.paged.map((r) => (
													<tr
														key={r.pin}
														className={r.status === 'new' && skipped.has(r.pin) ? own.skipped : undefined}
													>
														<td>
															{r.status === 'new' && (
																<input
																	type='checkbox'
																	aria-label={`Thêm ${r.user?.full_name}`}
																	checked={!skipped.has(r.pin)}
																	onChange={() => toggle(r.pin)}
																/>
															)}
														</td>
														<td className={styles.mono}>{r.pin}</td>
														<td>
															{r.user ? (
																<>
																	<span className={tbl.cellTitle}>{r.user.full_name}</span>
																	<div className={tbl.cellSub}>{r.user.department_name ?? '—'}</div>
																</>
															) : r.participant ? (
																<span className={styles.muted}>{r.participant.full_name}</span>
															) : r.device_name ? (
																<>
																	<span className={tbl.cellTitle}>{r.device_name}</span>
																	<div className={tbl.cellSub}>Tên khai trên máy</div>
																</>
															) : (
																<span
																	className={styles.muted}
																	title='Máy chưa gửi tên người dùng — bấm "Lấy vân tay có sẵn trên máy" ở trang Máy chấm công để máy gửi lại'
																>
																	Chưa có tên trên máy
																</span>
															)}
														</td>
														<td className={own.nowrap}>
															{formatDateVN(r.first_at)} {formatTimeVN(r.first_at)}
															{r.punches > 1 && ` → ${formatTimeVN(r.last_at)}`}
															<div className={tbl.cellSub}>{r.punches} lượt</div>
														</td>
														<td>
															<Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
															{r.reason && <div className={tbl.cellSub}>{r.reason}</div>}
															{r.status === 'existing' && r.participant?.checked_in_at && (
																<div className={tbl.cellSub}>Đã điểm danh trước đó</div>
															)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<Pagination
										{...pg.pagination}
										itemLabel='mã'
									/>
								</>
							)}
						</>
					)}
				</>
			)}

			{result && (
				<>
					<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
						<CheckSvg />
						<span>
							Đã thêm <b>{result.inserted}</b> người vào danh sách, ghi điểm danh bằng vân tay cho{' '}
							<b>{result.checked_in}</b> người.
						</span>
					</div>
					{result.warnings.length > 0 && (
						<ul className={styles.warnList}>
							{result.warnings.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
				</>
			)}
		</Modal>
	);
}

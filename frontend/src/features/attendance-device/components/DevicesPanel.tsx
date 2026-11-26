import { EditSvg, RefreshSvg, DownloadSvg, TrashSvg, FingerprintSvg } from '@/assets/icons';
import { Badge, DatePicker, Modal, ModalActions, TableEmpty } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { showToast } from '@/shared/utils/feedback';
import { formatDateTimeVN, relativeTime, toIsoDate } from '@/shared/utils/formatDate';
import { useState } from 'react';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';
import type { AttendanceDevice, DeviceFormData } from '../types/attendanceDevice.type';
import { DEVICE_STATUS, deviceLabel, isOnline } from '../utils/labels';
import { DeviceFormModal } from './DeviceFormModal';
import styles from '../pages/AttendanceDevices.module.css';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function DevicesPanel({
	devices,
	loading,
	canManage,
	onChanged,
}: {
	devices: AttendanceDevice[];
	loading: boolean;
	canManage: boolean;
	onChanged: () => void;
}) {
	const [editing, setEditing] = useState<AttendanceDevice | null>(null);
	const [deleting, setDeleting] = useState<AttendanceDevice | null>(null);
	const [pulling, setPulling] = useState<AttendanceDevice | null>(null);
	const today = toIsoDate(new Date());
	const [range, setRange] = useState({ from: today, to: today });
	const [busy, setBusy] = useState(false);

	const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
		setBusy(true);
		try {
			await fn();
			showToast('success', ok);
			onChanged();
			return true;
		} catch (e) {
			showToast('error', errMsg(e, fail));
			return false;
		} finally {
			setBusy(false);
		}
	};

	const save = async (form: DeviceFormData) => {
		if (!editing) return;
		const approving = editing.status === 'pending';
		const done = await run(
			() => attendanceDeviceApi.update(editing.id, { ...form, ...(approving ? { status: 'active' } : {}) }),
			approving ? 'Đã duyệt máy — học viên sẽ được gửi xuống máy trong ít phút' : 'Đã lưu máy chấm công',
			'Lưu thất bại',
		);
		if (done) setEditing(null);
	};

	const toggleActive = (d: AttendanceDevice) =>
		run(
			() => attendanceDeviceApi.update(d.id, { status: d.status === 'active' ? 'disabled' : 'active' }),
			d.status === 'active' ? 'Đã tắt máy — server ngừng nhận dữ liệu của máy này' : 'Đã bật lại máy',
			'Không đổi được trạng thái',
		);

	const resync = (d: AttendanceDevice) =>
		run(
			() => attendanceDeviceApi.resync(d.id),
			'Đã xếp lệnh gửi lại toàn bộ học viên xuống máy',
			'Không gửi lại được',
		);

	const colCount = canManage ? 6 : 5;

	return (
		<>
			<div className={base.tableWrap}>
				<table className={base.table}>
					<thead>
						<tr>
							<th className={base.th}>Máy</th>
							<th className={base.th}>Trạng thái</th>
							<th className={base.th}>Kết nối</th>
							<th className={`${base.th} ${base.thRight}`}>Học viên trên máy</th>
							<th className={base.th}>Đồng bộ</th>
							{canManage && <th className={`${base.th} ${base.thRight}`}>Thao tác</th>}
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={2}
								cols={colCount}
							/>
						) : devices.length === 0 ? (
							<TableEmpty
								colSpan={colCount}
								title='Chưa có máy chấm công nào kết nối'
								desc='Cài máy theo hướng dẫn bên dưới — máy tự hiện ở đây với trạng thái "Chờ duyệt".'
							/>
						) : (
							devices.map((d) => {
								const online = isOnline(d);
								const st = DEVICE_STATUS[d.status];
								return (
									<tr
										key={d.id}
										className={base.tr}
									>
										<td className={base.td}>
											<div className={base.itemCell}>
												<div className={`${base.itemAvatar} ${styles.deviceIcon}`}>
													<FingerprintSvg />
												</div>
												<div>
													<div className={base.itemName}>{deviceLabel(d)}</div>
													<div className={tbl.cellSub}>
														SN {d.serial_no}
														{d.location ? ` · ${d.location}` : ''}
													</div>
												</div>
											</div>
										</td>
										<td className={base.td}>
											<Badge
												tone={st.tone}
												dot
											>
												{st.label}
											</Badge>
										</td>
										<td className={base.td}>
											<div className={online ? styles.online : styles.offline}>
												{d.last_seen_at
													? online
														? 'Đang kết nối'
														: `Mất kết nối · ${relativeTime(d.last_seen_at)}`
													: 'Chưa kết nối'}
											</div>
											<div className={tbl.cellSub}>
												{d.last_punch_at
													? `Lượt chấm gần nhất ${formatDateTimeVN(d.last_punch_at)}`
													: 'Chưa nhận lượt chấm'}
											</div>
										</td>
										<td className={`${base.td} ${styles.tdNum}`}>
											<div>{d.synced_users}</div>
											{d.user_count !== null && (
												<div className={tbl.cellSub}>
													máy báo {d.user_count} người · {d.fp_count ?? 0} vân tay
												</div>
											)}
										</td>
										<td className={base.td}>
											{d.failed_commands > 0 ? (
												<Badge tone='red'>{d.failed_commands} lệnh lỗi</Badge>
											) : d.pending_commands > 0 ? (
												<Badge tone='blue'>{d.pending_commands} lệnh đang chờ</Badge>
											) : d.status === 'active' ? (
												<span className={base.descText}>Đã đủ</span>
											) : (
												<span className={base.descText}>—</span>
											)}
										</td>
										{canManage && (
											<td className={`${base.td} ${base.tdActions}`}>
												{d.status === 'pending' ? (
													<button
														className={styles.approveBtn}
														onClick={() => setEditing(d)}
														disabled={busy}
													>
														Duyệt máy
													</button>
												) : (
													<div className={base.actionBtns}>
														<div
															className={base.actionBtn}
															title='Sửa tên, vị trí'
															onClick={() => setEditing(d)}
														>
															<EditSvg />
														</div>
														{d.status === 'active' && (
															<>
																<div
																	className={base.actionBtn}
																	title='Gửi lại toàn bộ học viên xuống máy'
																	onClick={() => !busy && resync(d)}
																>
																	<RefreshSvg />
																</div>
																<div
																	className={base.actionBtn}
																	title='Kéo lại lượt chấm cũ từ máy'
																	onClick={() => setPulling(d)}
																>
																	<DownloadSvg />
																</div>
															</>
														)}
														<button
															className={styles.textAction}
															onClick={() => toggleActive(d)}
															disabled={busy}
														>
															{d.status === 'active' ? 'Tắt' : 'Bật'}
														</button>
														<div
															className={`${base.actionBtn} ${base.danger}`}
															title='Xóa máy'
															onClick={() => setDeleting(d)}
														>
															<TrashSvg />
														</div>
													</div>
												)}
											</td>
										)}
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			{editing && (
				<DeviceFormModal
					device={editing}
					approving={editing.status === 'pending'}
					loading={busy}
					onClose={() => setEditing(null)}
					onSave={save}
				/>
			)}

			{pulling && (
				<Modal
					open
					onClose={() => setPulling(null)}
					icon={<DownloadSvg />}
					title='Kéo lại lượt chấm'
					subtitle={deviceLabel(pulling)}
					className={`${base.modal} ${base.modalSm}`}
					bodyClassName={base.modalBody}
					footer={
						<ModalActions
							onCancel={() => setPulling(null)}
							loading={busy}
							confirmLabel='Gửi lệnh'
							onConfirm={async () => {
								const ok = await run(
									() => attendanceDeviceApi.pullAttlog(pulling.id, range.from, range.to),
									'Đã gửi lệnh — máy sẽ gửi lại lượt chấm trong ít phút',
									'Không gửi được lệnh',
								);
								if (ok) setPulling(null);
							}}
						/>
					}
				>
					<p className={styles.modalNote}>
						Dùng khi máy mất kết nối lâu hoặc nghi thiếu lượt chấm. Lượt đã nhận sẽ tự bỏ qua, không
						bị trùng.
					</p>
					<div className={styles.formRow}>
						<FormField label='Từ ngày'>
							<DatePicker
								value={range.from}
								max={range.to}
								onChange={(v) => setRange((r) => ({ ...r, from: v }))}
							/>
						</FormField>
						<FormField label='Đến ngày'>
							<DatePicker
								value={range.to}
								min={range.from}
								max={today}
								onChange={(v) => setRange((r) => ({ ...r, to: v }))}
							/>
						</FormField>
					</div>
				</Modal>
			)}

			{deleting && (
				<Modal
					open
					onClose={() => setDeleting(null)}
					icon={<TrashSvg />}
					tone='danger'
					title='Xóa máy chấm công'
					subtitle={deviceLabel(deleting)}
					className={`${base.modal} ${base.modalSm}`}
					bodyClassName={base.modalBody}
					footer={
						<>
							<button
								className={base.btnCancel}
								onClick={() => setDeleting(null)}
								disabled={busy}
							>
								Hủy
							</button>
							<button
								className={base.btnDanger}
								disabled={busy}
								onClick={async () => {
									const ok = await run(
										() => attendanceDeviceApi.remove(deleting.id),
										'Đã xóa máy chấm công',
										'Xóa thất bại',
									);
									if (ok) setDeleting(null);
								}}
							>
								<TrashSvg /> Xác nhận xóa
							</button>
						</>
					}
				>
					<p className={base.deleteDesc}>
						Xóa <strong>{deviceLabel(deleting)}</strong> sẽ xóa luôn lượt chấm thô và lịch sử lệnh của
						máy; điểm danh đã ghi vào buổi học vẫn giữ nguyên. Nếu máy còn kết nối, nó sẽ hiện lại ở
						trạng thái <strong>Chờ duyệt</strong>. Chỉ tạm ngừng thì dùng <strong>Tắt</strong>.
					</p>
				</Modal>
			)}
		</>
	);
}

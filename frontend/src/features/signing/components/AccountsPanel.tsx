import { CheckCircleSvg, DownloadSvg, EditSvg, KeySvg, RefreshSvg, XCircleSvg } from '@/assets/icons';
import { RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { Badge, ConfirmDeleteModal, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { formatStamp } from '../utils/formatStamp';
import { saveBlob } from '@/shared/utils/saveBlob';
import { useState } from 'react';
import { signingApi } from '../api/signingApi';
import type { SigningAccount, SigningAccountForm } from '../types/signing.type';
import { AccountFormModal } from './AccountFormModal';
import styles from '../pages/SigningAdmin.module.css';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

type Tone = 'green' | 'red' | 'amber' | 'gray';
const stateOf = (a: SigningAccount): { tone: Tone; label: string } => {
	if (!a.is_active) return { tone: 'gray', label: 'Tạm ngưng' };
	if (a.cert_expired) return { tone: 'red', label: 'Chứng thư hết hạn' };
	if (a.last_error) return { tone: 'amber', label: 'Kết nối lỗi' };
	if (a.has_cert) return { tone: 'green', label: 'Sẵn sàng ký' };
	return { tone: 'gray', label: 'Chưa kiểm tra' };
};

const cnOf = (dn: string | null) => dn?.match(/CN=([^,]+)/)?.[1] ?? null;

export function AccountsPanel({
	accounts,
	loading,
	creating,
	onCloseCreate,
	onChanged,
}: {
	accounts: SigningAccount[];
	loading: boolean;
	creating: boolean;
	onCloseCreate: () => void;
	onChanged: () => void;
}) {
	const [editing, setEditing] = useState<SigningAccount | null>(null);
	const [deleting, setDeleting] = useState<SigningAccount | null>(null);
	const [busy, setBusy] = useState<number | 'form' | null>(null);

	const save = async (form: SigningAccountForm) => {
		setBusy('form');
		try {
			const saved = editing
				? await signingApi.updateAccount(editing.id, {
						label: form.label,
						region: form.region,
						use_for_certificates: form.use_for_certificates,
						...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
						...(form.secret.trim() ? { secret: form.secret.trim() } : {}),
					})
				: await signingApi.createAccount(form);
			if (saved.last_error) showToast('info', `Đã lưu nhưng kiểm tra lỗi: ${saved.last_error}`);
			else showToast('success', saved.has_cert ? 'Đã lưu — kết nối VIN-HSM thành công' : 'Đã lưu tài khoản ký số');
			setEditing(null);
			onCloseCreate();
			onChanged();
		} catch (e) {
			showToast('error', errMsg(e, 'Lưu thất bại'));
		} finally {
			setBusy(null);
		}
	};

	const act = async (a: SigningAccount, fn: () => Promise<unknown>, ok: string, fail: string) => {
		setBusy(a.id);
		try {
			await fn();
			if (ok) showToast('success', ok);
			onChanged();
		} catch (e) {
			showToast('error', errMsg(e, fail));
		} finally {
			setBusy(null);
		}
	};

	const check = (a: SigningAccount) =>
		act(
			a,
			async () => {
				const r = await signingApi.checkAccount(a.id);
				if (r.last_error) throw new Error(r.last_error);
			},
			'Kết nối VIN-HSM thành công',
			'Kiểm tra thất bại',
		);

	const testSign = (a: SigningAccount) =>
		act(
			a,
			async () => saveBlob(await signingApi.testSignAccount(a.id), `ky-thu-${a.id}.pdf`),
			'Đã tải phiếu ký thử — mở bằng trình đọc PDF để xem chữ ký',
			'Ký thử thất bại',
		);

	const toggleActive = (a: SigningAccount) =>
		act(
			a,
			() => signingApi.updateAccount(a.id, { is_active: !a.is_active }),
			a.is_active ? 'Đã tạm ngưng tài khoản ký' : 'Đã bật lại tài khoản ký',
			'Không đổi được trạng thái',
		);

	const remove = async () => {
		if (!deleting) return;
		await act(deleting, () => signingApi.removeAccount(deleting.id), 'Đã xóa tài khoản ký số', 'Xóa thất bại');
		setDeleting(null);
	};

	const COLS = 5;
	return (
		<>
			<div className={base.tableWrap}>
				<table className={base.table}>
					<thead>
						<tr>
							<th className={base.th}>Tài khoản</th>
							<th className={base.th}>Chứng thư</th>
							<th className={base.th}>Trạng thái</th>
							<th className={base.th}>Dùng cho</th>
							<th className={`${base.th} ${base.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={2}
								cols={COLS}
							/>
						) : accounts.length === 0 ? (
							<TableEmpty
								colSpan={COLS}
								title='Chưa có tài khoản ký số'
								desc='Thêm chứng thư của bệnh viện để ký giấy chứng nhận. Cán bộ tự khai báo chứng thư cá nhân ở Hồ sơ cá nhân.'
							/>
						) : (
							accounts.map((a) => {
								const st = stateOf(a);
								return (
									<tr
										key={a.id}
										className={base.tr}
									>
										<td className={base.td}>
											<div className={base.itemCell}>
												<div className={`${base.itemAvatar} ${a.kind === 'organization' ? styles.orgIcon : styles.personIcon}`}>
													<KeySvg />
												</div>
												<div>
													<div className={base.itemName}>{a.label}</div>
													<div className={tbl.cellSub}>
														{a.kind === 'organization' ? 'Bệnh viện' : `Cá nhân · ${a.user_name ?? a.user_id}`} ·{' '}
														<span className={styles.mono}>
															{a.api_key} · {a.region}
														</span>
													</div>
												</div>
											</div>
										</td>
										<td className={base.td}>
											<div>{cnOf(a.cert_subject) ?? '—'}</div>
											<div className={tbl.cellSub}>
												{a.cert_valid_to
													? `${cnOf(a.cert_issuer) ?? ''} · đến ${formatDateVN(a.cert_valid_to)}`
													: 'Chưa đọc được chứng thư'}
											</div>
										</td>
										<td className={base.td}>
											<Badge
												tone={st.tone}
												dot
											>
												{st.label}
											</Badge>
											<div className={tbl.cellSub}>
												{a.last_error ??
													(a.checked_at ? `Kiểm tra ${formatStamp(a.checked_at)}` : 'Chưa kiểm tra')}
											</div>
										</td>
										<td className={base.td}>
											{a.use_for_certificates ? (
												<Badge tone='blue'>Giấy chứng nhận CME</Badge>
											) : a.kind === 'personal' ? (
												<span className={base.descText}>Văn bản, phê duyệt của người này</span>
											) : (
												<span className={base.descText}>—</span>
											)}
										</td>
										<td className={`${base.td} ${base.tdActions}`}>
											<RowActions
												itemName={a.label}
												onDelete={() => setDeleting(a)}
											>
												<RowAction
													title='Sửa'
													aria-label={`Sửa tài khoản ký số ${a.label}`}
													onClick={() => setEditing(a)}
												>
													<EditSvg />
												</RowAction>
												<RowAction
													title='Kiểm tra kết nối'
													aria-label='Kiểm tra kết nối, đọc lại chứng thư'
													disabled={busy !== null}
													onClick={() => check(a)}
												>
													<RefreshSvg />
												</RowAction>
												<RowAction
													title='Ký thử'
													aria-label='Ký thử 1 phiếu mẫu và tải về'
													disabled={busy !== null}
													onClick={() => testSign(a)}
												>
													<DownloadSvg />
												</RowAction>
												{a.is_active ? (
													<RowAction
														title='Tạm ngưng'
														tone='warn'
														disabled={busy !== null}
														onClick={() => toggleActive(a)}
													>
														<XCircleSvg />
													</RowAction>
												) : (
													<RowAction
														title='Bật lại'
														tone='success'
														disabled={busy !== null}
														onClick={() => toggleActive(a)}
													>
														<CheckCircleSvg />
													</RowAction>
												)}
											</RowActions>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			{(creating || editing) && (
				<AccountFormModal
					account={editing}
					loading={busy === 'form'}
					onClose={() => {
						setEditing(null);
						onCloseCreate();
					}}
					onSave={save}
				/>
			)}
			{deleting && (
				<ConfirmDeleteModal
					title='Xóa tài khoản ký số?'
					subtitle={deleting.label}
					loading={busy === deleting.id}
					onClose={() => setDeleting(null)}
					onConfirm={remove}
					warning={
						deleting.use_for_certificates
							? 'Giấy chứng nhận sẽ không ký số được tới khi chọn tài khoản khác.'
							: undefined
					}
				>
					Nhật ký các lần đã ký bằng tài khoản này vẫn được giữ.
				</ConfirmDeleteModal>
			)}
		</>
	);
}

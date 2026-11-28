import { AlertSvg, DownloadSvg, KeySvg, RefreshSvg, TrashSvg } from '@/assets/icons';
import { PasswordInput } from '@/shared/components/Input/PasswordInput';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { formatStamp } from '../utils/formatStamp';
import { saveBlob } from '@/shared/utils/saveBlob';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import profile from '../../portal/pages/Profile.module.css';
import { signingApi } from '../api/signingApi';
import { SIGNING_STATUS_KEY, useSigningStatus } from '../hooks/useSigningStatus';
import type { SigningAccount } from '../types/signing.type';
import styles from './MySignatureCard.module.css';
import { SignatureImageSection } from './SignatureImageSection';

const MY_KEY = ['signing', 'me'] as const;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Tình trạng chứng thư: còn hiệu lực / lỗi / hết hạn / chưa kiểm tra */
function certState(a: SigningAccount): { label: string; bg: string; fg: string } {
	if (!a.is_active) return { label: 'Tạm ngưng', bg: 'var(--color-gray-100)', fg: 'var(--color-gray-600)' };
	if (a.cert_expired) return { label: 'Chứng thư hết hạn', bg: 'var(--tone-red-bg)', fg: 'var(--tone-red-fg)' };
	if (a.last_error) return { label: 'Kết nối lỗi', bg: 'var(--tone-amber-bg)', fg: 'var(--tone-amber-fg)' };
	if (a.has_cert) return { label: 'Sẵn sàng ký', bg: 'var(--tone-green-bg)', fg: 'var(--tone-green-fg)' };
	return { label: 'Chưa kiểm tra', bg: 'var(--color-gray-100)', fg: 'var(--color-gray-600)' };
}

/**
 * Hồ sơ cá nhân → Chữ ký số: tự khai báo tài khoản VIN-HSM của chứng thư mình (API key +
 * secret nhà cung cấp cấp). Secret chỉ gửi lên, không bao giờ hiện lại.
 */
export default function MySignatureCard() {
	const uid = useId();
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({ queryKey: MY_KEY, queryFn: signingApi.getMine });
	const acc = data?.account ?? null;
	// Quản trị tắt "Cán bộ tự khai báo chứng thư" ⇒ chỉ xem, không thêm / đổi / xóa
	const { data: status } = useSigningStatus();
	const selfManage = status?.config?.self_manage !== false;
	const signingOff = status?.config?.enabled === false;
	const [editing, setEditing] = useState(false);
	const [form, setForm] = useState({ region: 'hn10', api_key: '', secret: '' });
	const [busy, setBusy] = useState<'' | 'save' | 'check' | 'test' | 'remove'>('');
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [error, setError] = useState('');

	const refresh = () => {
		void qc.invalidateQueries({ queryKey: MY_KEY });
		void qc.invalidateQueries({ queryKey: SIGNING_STATUS_KEY });
	};

	const startEdit = () => {
		setForm({ region: acc?.region ?? 'hn10', api_key: '', secret: '' });
		setError('');
		setEditing(true);
	};

	const run = async (kind: typeof busy, fn: () => Promise<void>) => {
		setBusy(kind);
		setError('');
		try {
			await fn();
		} catch (e) {
			setError(errMsg(e, 'Thao tác không thành công'));
		} finally {
			setBusy('');
		}
	};

	const save = () =>
		run('save', async () => {
			if (!acc && (!form.api_key.trim() || !form.secret.trim()))
				throw new Error('Nhập đủ API key và secret do VIN-HSM cấp.');
			const saved = await signingApi.saveMine({
				region: form.region.trim().toLowerCase(),
				...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
				...(form.secret.trim() ? { secret: form.secret.trim() } : {}),
			});
			setEditing(false);
			refresh();
			if (saved.last_error) showToast('info', `Đã lưu nhưng kiểm tra lỗi: ${saved.last_error}`);
			else showToast('success', 'Đã lưu và kết nối được VIN-HSM');
		});

	const check = () =>
		run('check', async () => {
			const r = await signingApi.checkMine();
			refresh();
			if (r.last_error) throw new Error(r.last_error);
			showToast('success', 'Kết nối VIN-HSM thành công');
		});

	const testSign = () =>
		run('test', async () => {
			saveBlob(await signingApi.testSignMine(), 'ky-thu-chu-ky-so.pdf');
			showToast('success', 'Đã tải phiếu ký thử — mở bằng trình đọc PDF để xem chữ ký');
		});

	const remove = () =>
		run('remove', async () => {
			await signingApi.removeMine();
			setConfirmRemove(false);
			refresh();
			showToast('success', 'Đã xóa tài khoản ký số của bạn');
		});

	const state = acc ? certState(acc) : null;
	const showForm = selfManage && (editing || (!isLoading && !acc));
	const adminOnlyEmpty = !selfManage && !isLoading && !acc;

	return (
		<div
			className={profile.detailCard}
			id='chu-ky-so'
		>
			<div className={`${profile.detailCardHeader} ${styles.header} ${!showForm && !acc && !adminOnlyEmpty && !signingOff ? profile.headerOnly : ''}`}>
				<div
					className={profile.detailCardIcon}
					style={{ background: 'var(--tone-teal-bg)', color: 'var(--tone-teal-fg)' }}
				>
					<KeySvg />
				</div>
				<div className={profile.headerText}>
					<div className={profile.detailCardTitle}>
						Chữ ký số
						{state && (
							<span
								className={profile.statusChip}
								style={{ background: state.bg, color: state.fg }}
							>
								{state.label}
							</span>
						)}
					</div>
					<div className={profile.detailCardSub}>
						Ký văn bản đào tạo và phiếu phê duyệt đề tài bằng chứng thư số của bạn, qua dịch vụ ký từ
						xa VIN-HSM — không cần cắm USB token
					</div>
				</div>
				{acc && !editing && selfManage && (
					<button
						type='button'
						className={`${profile.btnSecondary} ${profile.headerAction}`}
						onClick={startEdit}
					>
						Đổi thông tin
					</button>
				)}
			</div>

			{!acc && !isLoading && (signingOff || adminOnlyEmpty) && (
				<div className={styles.body}>
					{signingOff && (
						<p className={styles.notice}>
							Ký số đang tạm tắt trên hệ thống — chưa ký được văn bản nào cho tới khi quản trị bật lại.
						</p>
					)}
					{adminOnlyEmpty && (
						<p className={styles.note}>
							Chứng thư số cá nhân do quản trị viên cấp. Liên hệ quản trị ký số để được khai báo chứng
							thư cho tài khoản của bạn.
						</p>
					)}
				</div>
			)}

			{acc && !editing && (
				<div className={styles.body}>
					{signingOff && (
						<p className={styles.notice}>
							Ký số đang tạm tắt trên hệ thống — chưa ký được văn bản nào cho tới khi quản trị bật lại.
						</p>
					)}
					<dl className={styles.facts}>
						<dt>Chứng thư</dt>
						<dd>{acc.cert_subject ?? '—'}</dd>
						<dt>Cấp bởi</dt>
						<dd>{acc.cert_issuer ?? '—'}</dd>
						<dt>Hiệu lực</dt>
						<dd>
							{acc.cert_valid_from && acc.cert_valid_to
								? `${formatDateVN(acc.cert_valid_from)} – ${formatDateVN(acc.cert_valid_to)}`
								: '—'}
						</dd>
						<dt>Tài khoản</dt>
						<dd className={styles.mono}>
							{acc.api_key} · vùng {acc.region}
						</dd>
						<dt>Kiểm tra gần nhất</dt>
						<dd>{acc.checked_at ? formatStamp(acc.checked_at) : 'Chưa kiểm tra'}</dd>
					</dl>
					{acc.last_error && (
						<div className={profile.errorMsg}>
							<AlertSvg /> {acc.last_error}
						</div>
					)}
					{error && (
						<div className={profile.errorMsg}>
							<AlertSvg /> {error}
						</div>
					)}
					{confirmRemove ? (
						<div className={styles.actions}>
							<span className={styles.confirmText}>Xóa tài khoản ký số? Bạn sẽ phải khai báo lại để ký.</span>
							<button
								type='button'
								className={profile.btnDangerOutline}
								onClick={() => void remove()}
								disabled={busy !== ''}
							>
								Xóa
							</button>
							<button
								type='button'
								className={profile.btnSecondary}
								onClick={() => setConfirmRemove(false)}
								disabled={busy !== ''}
							>
								Hủy
							</button>
						</div>
					) : (
						<div className={styles.actions}>
							<button
								type='button'
								className={profile.btnSecondary}
								onClick={() => void check()}
								disabled={busy !== ''}
							>
								<RefreshSvg />
								{busy === 'check' ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
							</button>
							<button
								type='button'
								className={profile.btnSecondary}
								onClick={() => void testSign()}
								disabled={busy !== '' || !acc.has_cert}
								title={acc.has_cert ? undefined : 'Kiểm tra kết nối thành công rồi mới ký thử được'}
							>
								<DownloadSvg />
								{busy === 'test' ? 'Đang ký…' : 'Ký thử'}
							</button>
							{selfManage && (
								<button
									type='button'
									className={`${profile.btnDangerOutline} ${styles.pushRight}`}
									onClick={() => setConfirmRemove(true)}
									disabled={busy !== ''}
								>
									<TrashSvg />
									Xóa
								</button>
							)}
						</div>
					)}
					<SignatureImageSection
						account={acc}
						onChanged={refresh}
					/>
				</div>
			)}

			{showForm && (
				<div className={profile.pwdForm}>
					<p className={styles.note}>
						Nhập thông tin tài khoản dịch vụ ký số VIN-HSM gắn với chứng thư của bạn (nhà cung cấp gửi
						khi cấp chứng thư). Secret được mã hóa trên máy chủ và không hiện lại.
					</p>
					<div className={styles.grid}>
						<div className={profile.formGroup}>
							<label
								htmlFor={`${uid}-region`}
								className={profile.formLabel}
							>
								Vùng máy chủ
							</label>
							<input
								id={`${uid}-region`}
								className={profile.formInput}
								value={form.region}
								onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
								placeholder='hn10'
								maxLength={20}
							/>
						</div>
						<div className={profile.formGroup}>
							<label
								htmlFor={`${uid}-key`}
								className={profile.formLabel}
							>
								API key
							</label>
							<input
								id={`${uid}-key`}
								className={`${profile.formInput} ${styles.mono}`}
								value={form.api_key}
								onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
								placeholder={acc ? `Để trống = giữ ${acc.api_key}` : 'Chuỗi 32 ký tự'}
								autoComplete='off'
								spellCheck={false}
								maxLength={200}
							/>
						</div>
						<div className={profile.formGroup}>
							<label
								htmlFor={`${uid}-secret`}
								className={profile.formLabel}
							>
								Secret
							</label>
							<PasswordInput
								id={`${uid}-secret`}
								className={profile.formInput}
								value={form.secret}
								onChange={(v: string) => setForm((f) => ({ ...f, secret: v }))}
								placeholder={acc ? 'Để trống = giữ secret cũ' : 'Secret do VIN-HSM cấp'}
								autoComplete='new-password'
							/>
						</div>
					</div>
					<span className={styles.hint}>
						Vùng máy chủ là phần sau "sign-" trong địa chỉ nhà cung cấp gửi, vd sign-hn10.vin-hsm.com → hn10.
					</span>
					{error && (
						<div className={profile.errorMsg}>
							<AlertSvg /> {error}
						</div>
					)}
					<div className={profile.pwdFooter}>
						<button
							type='button'
							className={profile.btnPrimary}
							onClick={() => void save()}
							disabled={busy !== ''}
						>
							<KeySvg />
							{busy === 'save' ? 'Đang lưu và kiểm tra…' : 'Lưu và kiểm tra kết nối'}
						</button>
						{acc && (
							<button
								type='button'
								className={profile.btnSecondary}
								onClick={() => setEditing(false)}
								disabled={busy !== ''}
							>
								Hủy
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

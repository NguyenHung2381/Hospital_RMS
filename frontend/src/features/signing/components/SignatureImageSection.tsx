import { CheckSvg, EditSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { showToast } from '@/shared/utils/feedback';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { signingApi } from '../api/signingApi';
import type { SigningAccount } from '../types/signing.type';
import { SignaturePadModal } from './SignaturePadModal';
import styles from './SignatureImage.module.css';

const IMAGE_KEY = ['signing', 'my-signature-image'] as const;
const MAX_BYTES = 3 * 1024 * 1024;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const readAsDataUrl = (file: File) =>
	new Promise<string>((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(new Error('Không đọc được file ảnh'));
		r.readAsDataURL(file);
	});

interface InfoForm {
	displayName: string;
	caption: string;
}

/**
 * Chữ ký trên văn bản: khung xem trước lớn (chữ ký → chức vụ → họ tên, đúng thứ tự in trong
 * khung chữ ký số) và phần nhập họ tên hiển thị / chức vụ.
 */
export function SignatureImageSection({ account, onChanged }: { account: SigningAccount; onChanged: () => void }) {
	const uid = useId();
	const qc = useQueryClient();
	const fileRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [padOpen, setPadOpen] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [justSaved, setJustSaved] = useState(false);
	const { data, isLoading } = useQuery({
		queryKey: IMAGE_KEY,
		queryFn: signingApi.getSignatureImage,
		enabled: account.has_signature_image,
	});
	const hasImage = account.has_signature_image;
	const image = hasImage ? (data?.image ?? null) : null;

	// Giá trị đang lưu; ô chức vụ trống = không in gì dưới chữ ký
	const saved: InfoForm = {
		displayName: account.signature_display_name ?? '',
		caption: account.signature_show_text ? (account.signature_caption ?? '') : '',
	};
	const savedKey = `${saved.displayName}\u0000${saved.caption}`;
	const [form, setForm] = useState<InfoForm>(saved);
	const [prevKey, setPrevKey] = useState(savedKey);
	if (prevKey !== savedKey) {
		setPrevKey(savedKey);
		setForm(saved);
	}
	const dirty = form.displayName.trim() !== saved.displayName.trim() || form.caption.trim() !== saved.caption.trim();
	useEffect(() => {
		if (!justSaved) return;
		const t = setTimeout(() => setJustSaved(false), 2200);
		return () => clearTimeout(t);
	}, [justSaved]);

	const fallbackName = account.user_name ?? '';
	const previewName = form.displayName.trim() || fallbackName;
	const previewCaption = form.caption.trim();
	const profilePosition = account.profile_position?.trim() || '';

	const save = async (
		payload: { image?: string | null; show_text?: boolean; caption?: string | null; display_name?: string | null },
		ok?: string,
	) => {
		setBusy(true);
		try {
			await signingApi.saveSignatureImage(payload);
			await qc.invalidateQueries({ queryKey: IMAGE_KEY });
			onChanged();
			if (ok) showToast('success', ok);
			return true;
		} catch (e) {
			showToast('error', errMsg(e, 'Không lưu được chữ ký'));
			return false;
		} finally {
			setBusy(false);
		}
	};

	const pickFile = async (file: File | undefined) => {
		if (fileRef.current) fileRef.current.value = '';
		if (!file) return;
		if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
			showToast('error', 'Chỉ nhận ảnh PNG, JPG hoặc WEBP');
			return;
		}
		if (file.size > MAX_BYTES) {
			showToast('error', 'Ảnh quá lớn (tối đa 3 MB)');
			return;
		}
		await save({ image: await readAsDataUrl(file) }, 'Đã lưu chữ ký — nền giấy đã được bỏ');
	};

	const saveInfo = async (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!dirty) return;
		const caption = form.caption.trim();
		const ok = await save({
			display_name: form.displayName.trim() || null,
			caption: caption || null,
			show_text: !!caption,
		});
		if (ok) setJustSaved(true);
	};

	return (
		<section
			className={styles.section}
			aria-labelledby={`${uid}-title`}
		>
			<div className={styles.head}>
				<h3
					id={`${uid}-title`}
					className={styles.title}
				>
					Chữ ký trên văn bản
				</h3>
				<p className={styles.desc}>In trong khung chữ ký số, thay cho dòng “Ký bởi / Ký ngày”.</p>
			</div>

			<div className={styles.layout}>
				{/* ── Khung xem trước ── */}
				<div className={styles.stage}>
					{hasImage && (
						<div
							className={styles.stageTools}
							role='toolbar'
							aria-label='Chữ ký'
						>
							{confirmDelete ? (
								<div className={styles.confirm}>
									<span>Xóa chữ ký?</span>
									<button
										type='button'
										className={styles.confirmDanger}
										onClick={async () => {
											if (await save({ image: null }, 'Đã xóa chữ ký — khung chữ ký sẽ in tên của bạn'))
												setConfirmDelete(false);
										}}
										disabled={busy}
									>
										Xóa
									</button>
									<button
										type='button'
										className={styles.confirmCancel}
										onClick={() => setConfirmDelete(false)}
										disabled={busy}
									>
										Hủy
									</button>
								</div>
							) : (
								<>
									<button
										type='button'
										className={styles.iconBtn}
										onClick={() => setPadOpen(true)}
										disabled={busy}
										aria-label='Vẽ lại chữ ký'
										title='Vẽ lại chữ ký'
									>
										<EditSvg />
									</button>
									<button
										type='button'
										className={styles.iconBtn}
										onClick={() => fileRef.current?.click()}
										disabled={busy}
										aria-label='Thay bằng ảnh chữ ký'
										title='Thay bằng ảnh chữ ký'
									>
										<UploadSvg />
									</button>
									<button
										type='button'
										className={`${styles.iconBtn} ${styles.iconDanger}`}
										onClick={() => setConfirmDelete(true)}
										disabled={busy}
										aria-label='Xóa chữ ký'
										title='Xóa chữ ký'
									>
										<TrashSvg />
									</button>
								</>
							)}
						</div>
					)}

					<div className={styles.block}>
						<div className={styles.sigArea}>
							{image ? (
								<img
									src={image}
									alt='Chữ ký tay của bạn'
									className={styles.sigImg}
								/>
							) : hasImage && isLoading ? (
								<span className={styles.muted}>Đang tải chữ ký…</span>
							) : (
								<div className={styles.empty}>
									<p className={styles.emptyText}>Chưa có chữ ký tay — khung chữ ký đang in tên của bạn</p>
									<div className={styles.emptyActions}>
										<button
											type='button'
											className={styles.btnPrimary}
											onClick={() => setPadOpen(true)}
											disabled={busy}
										>
											<EditSvg />
											Vẽ chữ ký
										</button>
										<button
											type='button'
											className={styles.btnGhost}
											onClick={() => fileRef.current?.click()}
											disabled={busy}
										>
											<UploadSvg />
											Tải ảnh lên
										</button>
									</div>
								</div>
							)}
						</div>
						<div
							className={styles.line}
							aria-hidden
						/>
						{/* Chức vụ chỉ in khi có chữ ký tay (vẽ vào ảnh gửi VIN-HSM) */}
						{hasImage && (
							<div className={previewCaption ? styles.pvCaption : `${styles.pvCaption} ${styles.pvPlaceholder}`}>
								{previewCaption || 'Chức vụ'}
							</div>
						)}
						<div className={styles.pvName}>{previewName}</div>
					</div>
				</div>

				{/* ── Thông tin in kèm ── */}
				<form
					className={styles.info}
					onSubmit={saveInfo}
				>
					<div className={styles.field}>
						<label
							htmlFor={`${uid}-name`}
							className={styles.label}
						>
							Họ tên hiển thị
						</label>
						<input
							id={`${uid}-name`}
							className={styles.input}
							value={form.displayName}
							onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
							placeholder={fallbackName || 'VD: TS.BS. Nguyễn Văn A'}
							maxLength={150}
							autoComplete='off'
						/>
						<span className={styles.help}>Ghi kèm học hàm, học vị. Để trống sẽ dùng họ tên tài khoản.</span>
					</div>
					<div className={styles.field}>
						<label
							htmlFor={`${uid}-cap`}
							className={styles.label}
						>
							Chức vụ
						</label>
						<input
							id={`${uid}-cap`}
							className={styles.input}
							value={form.caption}
							onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
							placeholder='VD: Trưởng phòng Quản lý NCKH'
							maxLength={150}
							autoComplete='off'
						/>
						{!form.caption && profilePosition ? (
							<button
								type='button'
								className={styles.suggest}
								onClick={() => setForm((f) => ({ ...f, caption: profilePosition }))}
							>
								Dùng chức vụ trong hồ sơ: {profilePosition}
							</button>
						) : (
							<span className={styles.help}>
								{hasImage ? 'In ngay dưới chữ ký. Để trống nếu không cần.' : 'Chỉ in khi đã có chữ ký tay.'}
							</span>
						)}
					</div>

					<div className={styles.formActions}>
						{dirty ? (
							<>
								<button
									type='submit'
									className={styles.btnPrimary}
									disabled={busy}
								>
									{busy ? 'Đang lưu…' : 'Lưu thay đổi'}
								</button>
								<button
									type='button'
									className={styles.btnGhost}
									onClick={() => setForm(saved)}
									disabled={busy}
								>
									Hủy
								</button>
							</>
						) : justSaved ? (
							<span
								className={styles.saved}
								role='status'
							>
								<CheckSvg />
								Đã lưu
							</span>
						) : null}
					</div>
				</form>
			</div>

			<input
				ref={fileRef}
				type='file'
				accept='image/png,image/jpeg,image/webp'
				hidden
				onChange={(e) => void pickFile(e.target.files?.[0])}
			/>

			{padOpen && (
				<SignaturePadModal
					loading={busy}
					onClose={() => setPadOpen(false)}
					onSave={async (dataUrl) => {
						if (await save({ image: dataUrl }, 'Đã lưu chữ ký vừa vẽ')) setPadOpen(false);
					}}
				/>
			)}
		</section>
	);
}

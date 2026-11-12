import { useEffect, useState, type ReactNode } from 'react';
import {
	CheckSvg,
	DownloadSvg,
	EyeSvg,
	FilePdfSvg,
	InfoSvg,
	LayersSvg,
	RefreshSvg,
	TrashSvg,
	UploadSvg,
	UsersSvg,
	WarnSvg,
	FileTextSvg,
} from '@/assets/icons';
import { Badge, FileDropzone, Modal } from '@/shared/components';
import { InlineLoading } from '@/shared/components/Loading';
import { formatDateTimeVN } from '@/shared/utils/formatDate';
import { showToast } from '@/shared/utils/feedback';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import {
	deleteCertificateTemplate,
	exportCertificates,
	exportCertificatesFromExcel,
	getCertificateTemplate,
	previewCertificate,
	uploadCertificateTemplate,
	type CertificateTemplateInfo,
} from '../api/seminarApi';
import type { SeminarParticipant } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';
import css from './CertificateModal.module.css';
import { CertificateLayoutEditor } from './CertificateLayoutEditor';
import { CertificateInfoForm } from './CertificateInfoForm';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const fmtMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

type Busy = 'upload' | 'delete' | 'preview' | 'export' | null;
type Source = 'participants' | 'excel';

/**
 * Giấy chứng nhận CME của 1 hội nghị — 2 bước: (1) mẫu PDF của hội nghị (tải lên /
 * xem thử / đổi / xóa), (2) chọn danh sách người nhận rồi tải ZIP mỗi người 1 file —
 * từ người tham dự đã có số CME hoặc từ file Excel "Danh sách cấp CME".
 */
export function CertificateModal({
	seminarId,
	seminarTitle,
	startDate,
	endDate,
	numbered,
	selectedCount,
	onClose,
}: {
	seminarId: string;
	seminarTitle: string;
	startDate?: string | null;
	endDate?: string | null;
	/** Người sẽ được xuất khi chọn nguồn "người tham dự" (đã có số CME) */
	numbered: SeminarParticipant[];
	/** > 0: `numbered` là những người đang chọn trong bảng, không phải tất cả */
	selectedCount: number;
	onClose: () => void;
}) {
	const [tpl, setTpl] = useState<CertificateTemplateInfo | null>(null);
	const [loadingTpl, setLoadingTpl] = useState(true);
	const [replacing, setReplacing] = useState(false);
	const [pdfFile, setPdfFile] = useState<File | null>(null);
	const [source, setSource] = useState<Source>(numbered.length ? 'participants' : 'excel');
	const [excelFile, setExcelFile] = useState<File | null>(null);
	const [busy, setBusy] = useState<Busy>(null);
	const [editorOpen, setEditorOpen] = useState(false);
	// Đổi mẫu / chỉnh mẫu xong → tải lại form thông tin trên giấy
	const [infoVersion, setInfoVersion] = useState(0);

	useEffect(() => {
		let alive = true;
		getCertificateTemplate(seminarId)
			.then((t) => alive && setTpl(t))
			.catch((e) => showToast('error', errMsg(e, 'Không tải được mẫu giấy chứng nhận')))
			.finally(() => alive && setLoadingTpl(false));
		return () => {
			alive = false;
		};
	}, [seminarId]);

	// Sau khi chỉnh vị trí: ô thêm / ẩn đổi trạng thái "sẽ in" → tải lại
	const refreshTemplate = () =>
		getCertificateTemplate(seminarId)
			.then(setTpl)
			.catch(() => {});

	const upload = async () => {
		if (!pdfFile) return;
		setBusy('upload');
		try {
			const info = await uploadCertificateTemplate(seminarId, pdfFile);
			setTpl(info);
			setPdfFile(null);
			setReplacing(false);
			setInfoVersion((v) => v + 1);
			const missing = info.fields.filter((f) => !f.found).length;
			showToast(
				missing ? 'info' : 'success',
				missing ? `Đã lưu mẫu — còn ${missing} ô chưa tìm thấy chỗ điền` : 'Đã lưu mẫu giấy chứng nhận',
			);
		} catch (e) {
			showToast('error', errMsg(e, 'Tải mẫu lên thất bại'));
		} finally {
			setBusy(null);
		}
	};

	const remove = async () => {
		if (!window.confirm('Xóa mẫu giấy chứng nhận của hội nghị này?')) return;
		setBusy('delete');
		try {
			await deleteCertificateTemplate(seminarId);
			setTpl(null);
			setReplacing(false);
		} catch (e) {
			showToast('error', errMsg(e, 'Xóa mẫu thất bại'));
		} finally {
			setBusy(null);
		}
	};

	// Mở tab trước khi chờ (trình duyệt chặn window.open sau await), rồi nạp PDF vào
	const preview = async () => {
		const win = window.open('', '_blank');
		setBusy('preview');
		try {
			const url = URL.createObjectURL(await previewCertificate(seminarId));
			if (win) win.location.href = url;
			else window.location.assign(url);
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (e) {
			win?.close();
			showToast('error', errMsg(e, 'Không tạo được bản xem thử'));
		} finally {
			setBusy(null);
		}
	};

	const exportZip = async () => {
		setBusy('export');
		try {
			const blob =
				source === 'excel'
					? await exportCertificatesFromExcel(seminarId, excelFile as File)
					: await exportCertificates(seminarId, selectedCount ? numbered.map((p) => p.id) : undefined);
			saveBlob(blob, `giay-chung-nhan-cme-${fileSlug(seminarTitle).slice(0, 60)}.zip`);
			showToast('success', 'Đã xuất giấy chứng nhận');
		} catch (e) {
			showToast('error', errMsg(e, 'Xuất giấy chứng nhận thất bại'));
		} finally {
			setBusy(null);
		}
	};

	const missing = tpl?.fields.filter((f) => !f.found) ?? [];
	const canExport = !!tpl && (source === 'excel' ? !!excelFile : numbered.length > 0);
	const exportLabel =
		source === 'participants' && numbered.length ? `Tải ZIP · ${numbered.length} giấy` : 'Tải ZIP';

	const participantsDesc = numbered.length
		? selectedCount
			? `${numbered.length} người đang chọn trong bảng`
			: `Tất cả ${numbered.length} người đã có số`
		: selectedCount
			? 'Những người đang chọn chưa có số CME'
			: 'Chưa có ai được cấp số CME';

	return (
		<Modal
			open
			onClose={onClose}
			icon={<FilePdfSvg />}
			title='Giấy chứng nhận CME'
			subtitle='Điền thông tin vào mẫu PDF của hội nghị — mỗi người 1 file, gói trong 1 file ZIP'
			size='lg'
			bodyClassName={`${styles.modalBody} ${css.body}`}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={busy === 'export'}
					>
						Đóng
					</button>
					<button
						className={styles.btnPrimary}
						onClick={() => void exportZip()}
						disabled={!canExport || !!busy}
					>
						{busy === 'export' ? <span className={styles.spinner} /> : <DownloadSvg />}
						{busy === 'export' ? 'Đang tạo giấy…' : exportLabel}
					</button>
				</>
			}
		>
			{/* ── Bước 1: mẫu ── */}
			<Step
				n={1}
				title='Mẫu giấy chứng nhận'
				done={!!tpl}
				status={
					loadingTpl ? null : tpl ? (
						missing.length ? (
							<Badge
								tone='amber'
								dot
							>
								Thiếu {missing.length} ô
							</Badge>
						) : (
							<Badge
								tone='green'
								dot
							>
								Đã có mẫu
							</Badge>
						)
					) : (
						<Badge
							tone='gray'
							dot
						>
							Chưa có mẫu
						</Badge>
					)
				}
			>
				{loadingTpl ? (
					<InlineLoading />
				) : (
					<>
						{tpl && (
							<div className={css.file}>
								<span className={css.fileIcon}>
									<FilePdfSvg />
								</span>
								<div className={css.fileMeta}>
									<span className={css.fileName}>{tpl.file_name}</span>
									<span className={css.fileSub}>
										Tải lên {formatDateTimeVN(tpl.uploaded_at)} · {fmtMB(tpl.size)} sau khi tối ưu
									</span>
								</div>
								<div className={css.fileActions}>
									<button
										className={css.iconBtn}
										onClick={() => void preview()}
										disabled={!!busy}
										title='Xem thử với dữ liệu mẫu'
									>
										{busy === 'preview' ? <span className={styles.spinner} /> : <EyeSvg />}
										<span>Xem thử</span>
									</button>
									<button
										className={css.iconBtn}
										onClick={() => setEditorOpen(true)}
										disabled={!!busy}
										title='Chỉnh vị trí các ô, sửa chữ in sẵn (tên hội nghị, ngày tháng...)'
									>
										<LayersSvg />
										<span>Chỉnh mẫu</span>
									</button>
									<button
										className={`${css.iconBtn} ${replacing ? css.iconBtnOn : ''}`}
										onClick={() => setReplacing((v) => !v)}
										disabled={!!busy}
										title='Tải mẫu khác thay mẫu này'
										aria-pressed={replacing}
									>
										<RefreshSvg />
										<span>Đổi mẫu</span>
									</button>
									<button
										className={`${css.iconBtn} ${css.iconBtnDanger}`}
										onClick={() => void remove()}
										disabled={!!busy}
										title='Xóa mẫu'
										aria-label='Xóa mẫu'
									>
										{busy === 'delete' ? <span className={styles.spinner} /> : <TrashSvg />}
									</button>
								</div>
							</div>
						)}

						{tpl && (
							<ul
								className={css.chips}
								aria-label='Các ô sẽ được điền'
							>
								{tpl.fields.map((f) => (
									<li
										key={f.key}
										className={f.found ? css.chip : `${css.chip} ${css.chipMissing}`}
										title={f.found ? 'Đã tìm thấy chỗ điền' : 'Không tìm thấy chỗ điền — ô này sẽ để trống'}
									>
										{f.found ? <CheckSvg /> : <WarnSvg />}
										{f.label}
									</li>
								))}
							</ul>
						)}

						{(missing.length > 0 || (tpl?.unknown.length ?? 0) > 0) && (
							<div className={css.notice}>
								<InfoSvg />
								<div>
									{missing.length > 0 && (
										<p>
											Ô chưa tìm thấy sẽ để trống. Muốn điền, sửa mẫu cho ô đó là dãy dấu chấm "....."
											ngay sau nhãn rồi tải lại.
										</p>
									)}
									{(tpl?.unknown.length ?? 0) > 0 && (
										<p>Giữ nguyên dãy chấm không rõ là ô nào: {tpl?.unknown.join('; ')}</p>
									)}
								</div>
							</div>
						)}

						{tpl && !replacing && (
							<CertificateInfoForm
								key={infoVersion}
								seminarId={seminarId}
								seminarTitle={seminarTitle}
								startDate={startDate}
								endDate={endDate}
								onSaved={() => void refreshTemplate()}
							/>
						)}

						{(!tpl || replacing) && (
							<div className={css.upload}>
								{!tpl && (
									<p className={css.lead}>
										Tải lên file PDF 1 trang đã thiết kế sẵn (tên hội nghị, ngày, chữ ký, con dấu). Chỗ
										cần điền để dãy dấu chấm <b>"....."</b> sau nhãn: Chứng nhận, Sinh ngày, Đơn vị công
										tác, Vai trò, Quy đổi tương đương, Bằng chữ, Số.
									</p>
								)}
								<FileDropzone
									value={pdfFile}
									onChange={setPdfFile}
									accept='.pdf'
									maxSizeMB={60}
									hint='File PDF 1 trang, tối đa 60 MB'
									disabled={busy === 'upload'}
								/>
								<div className={css.uploadActions}>
									{replacing && (
										<button
											className={styles.btnCancel}
											onClick={() => {
												setReplacing(false);
												setPdfFile(null);
											}}
											disabled={busy === 'upload'}
										>
											Giữ mẫu cũ
										</button>
									)}
									<button
										className={styles.btnPrimary}
										onClick={() => void upload()}
										disabled={!pdfFile || !!busy}
									>
										{busy === 'upload' ? <span className={styles.spinner} /> : <UploadSvg />}
										{busy === 'upload' ? 'Đang xử lý mẫu…' : tpl ? 'Thay mẫu' : 'Tải mẫu lên'}
									</button>
								</div>
							</div>
						)}
					</>
				)}
			</Step>

			{/* ── Bước 2: danh sách ── */}
			<Step
				n={2}
				title='Danh sách người nhận'
				done={false}
				locked={!tpl}
			>
				{!tpl ? (
					<p className={css.locked}>Tải mẫu giấy chứng nhận ở bước 1 trước khi chọn danh sách.</p>
				) : (
					<>
						<div
							className={css.sources}
							role='radiogroup'
							aria-label='Nguồn danh sách'
						>
							<SourceCard
								active={source === 'participants'}
								onSelect={() => setSource('participants')}
								icon={<UsersSvg />}
								title='Người tham dự'
								desc={participantsDesc}
								disabled={!numbered.length}
							/>
							<SourceCard
								active={source === 'excel'}
								onSelect={() => setSource('excel')}
								icon={<FileTextSvg />}
								title='Từ file Excel'
								desc='Mẫu "Danh sách cấp CME"'
							/>
						</div>

						{source === 'excel' && (
							<div className={css.upload}>
								<FileDropzone
									value={excelFile}
									onChange={setExcelFile}
									accept='.xlsx'
									hint='File .xlsx — cột SQĐ, Ông/Bà, Họ và tên, Ngày sinh, Đơn vị, Số tín chỉ, Vai trò'
									disabled={busy === 'export'}
								/>
								<p className={css.hint}>Cột "Sửa đổi" ghi "Tên: …" sẽ in theo tên đã sửa.</p>
							</div>
						)}
					</>
				)}
			</Step>

			{editorOpen && (
				<CertificateLayoutEditor
					seminarId={seminarId}
					onClose={() => setEditorOpen(false)}
					onSaved={() => {
						void refreshTemplate();
						setInfoVersion((v) => v + 1);
					}}
				/>
			)}
		</Modal>
	);
}

function Step({
	n,
	title,
	status,
	done,
	locked,
	children,
}: {
	n: number;
	title: string;
	status?: ReactNode;
	done: boolean;
	locked?: boolean;
	children: ReactNode;
}) {
	return (
		<section className={`${css.step} ${locked ? css.stepLocked : ''}`}>
			<header className={css.stepHead}>
				<span className={`${css.stepNum} ${done ? css.stepNumDone : ''}`}>{done ? <CheckSvg /> : n}</span>
				<h3 className={css.stepTitle}>{title}</h3>
				{status && <span className={css.stepStatus}>{status}</span>}
			</header>
			<div className={css.stepBody}>{children}</div>
		</section>
	);
}

function SourceCard({
	active,
	onSelect,
	icon,
	title,
	desc,
	disabled,
}: {
	active: boolean;
	onSelect: () => void;
	icon: ReactNode;
	title: string;
	desc: string;
	disabled?: boolean;
}) {
	return (
		<button
			type='button'
			role='radio'
			aria-checked={active}
			className={`${css.source} ${active ? css.sourceActive : ''}`}
			onClick={onSelect}
			disabled={disabled}
		>
			<span className={css.sourceIcon}>{icon}</span>
			<span className={css.sourceText}>
				<span className={css.sourceTitle}>{title}</span>
				<span className={css.sourceDesc}>{desc}</span>
			</span>
			<span
				className={css.radio}
				aria-hidden
			/>
		</button>
	);
}

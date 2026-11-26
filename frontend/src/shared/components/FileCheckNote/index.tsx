import { Badge } from '@/shared/components/Badge';
import { cx } from '@/shared/utils/cx';
import { formatDateTimeVN } from '@/shared/utils/formatDate';
import type { DocFileCheck, DocSignatureCheck } from './fileCheck.types';
import styles from './FileCheckNote.module.css';

export type { DocCheckLevel, DocFileCheck, DocSignatureCheck, SignatureWarningCode } from './fileCheck.types';

const HINT = 'Kết quả máy đọc có thể sai — mở file để xác nhận.';

/**
 * Kết quả tự kiểm tra 1 file (backend docCheck/) cho người duyệt: phần đoán loại giấy tờ
 * (OCR / mã QR) và phần chữ ký (chữ ký số, dấu đỏ, chữ ký tay) — 2 mức độc lập, hiển thị tách.
 * Chỉ là gợi ý, người duyệt vẫn mở file xem và quyết định. Đặt trong 1 hàng flex-wrap.
 */
export function FileCheckNote({ check }: { check: DocFileCheck | null | undefined }) {
	if (!check) return null;
	const sig = check.signature ?? null;
	// Hồ sơ học viên: không đoán loại — level / message chính là của phần chữ ký, khỏi lặp lại
	const typeFromSig = check.verdict === null && sig !== null && check.warnings.length === 0;
	return (
		<>
			{!typeFromSig && <TypeNote check={check} />}
			{sig && <SignatureNote sig={sig} />}
		</>
	);
}

function TypeNote({ check }: { check: DocFileCheck }) {
	if (check.level === 'ok')
		return (
			<span className={styles.inline} title={check.message}>
				<Badge tone='green'>Tự kiểm: đúng loại</Badge>
			</span>
		);
	if (check.level === 'info') return <span className={cx(styles.inline, styles.muted)}>{check.message}</span>;
	return (
		<div className={styles.warn} role='note'>
			<strong>Tự kiểm tra:</strong> {check.message}
			{check.warnings.length > 0 && (
				<ul className={styles.list}>
					{check.warnings.map((w) => (
						<li key={w.code}>{w.message}</li>
					))}
				</ul>
			)}
			<span className={styles.hint}>{HINT}</span>
		</div>
	);
}

function SignatureNote({ sig }: { sig: DocSignatureCheck }) {
	if (sig.level === 'warn') {
		// Mức warn: message thường chính là cảnh báo đầu tiên — không in 2 lần
		const rest = sig.warnings.filter((w) => w.message !== sig.message);
		return (
			<div className={styles.warn} role='note'>
				<strong>Chữ ký:</strong> {sig.message}
				{rest.length > 0 && (
					<ul className={styles.list}>
						{rest.map((w) => (
							<li key={w.code}>{w.message}</li>
						))}
					</ul>
				)}
				<span className={styles.hint}>{HINT}</span>
			</div>
		);
	}
	if (sig.level === 'info')
		return (
			<span className={cx(styles.line, styles.muted)}>
				Chữ ký: {sig.message}
				{sig.signer && <SignerDetail signer={sig.signer} withName={false} />}
			</span>
		);

	// Mức ok
	const digital = sig.digital === 'valid' && !!sig.signer;
	return (
		<span className={styles.line} title={HINT}>
			<Badge tone='green'>{digital ? 'Chữ ký số hợp lệ' : 'Có dấu / chữ ký tay'}</Badge>
			{digital ? <SignerDetail signer={sig.signer!} withName /> : <span className={styles.detail}>{sig.message}</span>}
		</span>
	);
}

function SignerDetail({ signer, withName }: { signer: NonNullable<DocSignatureCheck['signer']>; withName: boolean }) {
	const who = [signer.cn, signer.o].filter(Boolean).join(' – ');
	const at = formatDateTimeVN(signer.signed_at);
	return (
		<span className={styles.detail}>
			{withName && who && <span className={styles.signer}>{who}</span>}
			{signer.issuer_cn && <span>CA cấp: {signer.issuer_cn}</span>}
			{at && (
				<span>
					Ký lúc {at}
					{signer.time_source === 'claimed' && <small className={styles.claimed}> (thời điểm do người ký khai)</small>}
				</span>
			)}
		</span>
	);
}

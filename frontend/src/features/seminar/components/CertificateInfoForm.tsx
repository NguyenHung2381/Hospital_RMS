import { useEffect, useState } from 'react';
import { CheckSvg, RefreshSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components/Loading';
import { showToast } from '@/shared/utils/feedback';
import {
	getCertificateInfo,
	saveCertificateInfo,
	type CertificateInfoField,
	type CertificateInfoKey,
	missingChars,
} from '../api/seminarApi';
import styles from '../pages/Seminar.module.css';
import css from './CertificateModal.module.css';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const pad2 = (n: number) => String(n).padStart(2, '0');

// 'YYYY-MM-DD…' → [năm, tháng, ngày]; sai định dạng → null
const ymd = (s?: string | null) => {
	const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
	return m ? ([+m[1], +m[2], +m[3]] as const) : null;
};

// "Ngày 29 tháng 5 năm 2026" / "Ngày 28–29 tháng 5 năm 2026" / "Ngày 30 tháng 5 – ngày 1 tháng 6 năm 2026"
const timeText = (start?: string | null, end?: string | null) => {
	const a = ymd(start);
	const b = ymd(end) ?? a;
	if (!a || !b) return null;
	if (a.join() === b.join()) return `Ngày ${a[2]} tháng ${a[1]} năm ${a[0]}`;
	if (a[0] === b[0] && a[1] === b[1]) return `Ngày ${a[2]}–${b[2]} tháng ${a[1]} năm ${a[0]}`;
	if (a[0] === b[0]) return `Ngày ${a[2]} tháng ${a[1]} – ngày ${b[2]} tháng ${b[1]} năm ${a[0]}`;
	return `Ngày ${a[2]}/${a[1]}/${a[0]} – ngày ${b[2]}/${b[1]}/${b[0]}`;
};

/**
 * Sửa nhanh 4 dòng thông tin hội nghị in sẵn trên mẫu (nội dung, đơn vị chịu trách
 * nhiệm, thời gian, địa điểm–ngày ký) — mỗi hội nghị dùng lại cùng 1 mẫu thiết kế.
 */
export function CertificateInfoForm({
	seminarId,
	seminarTitle,
	startDate,
	endDate,
	onSaved,
}: {
	seminarId: string;
	seminarTitle: string;
	startDate?: string | null;
	endDate?: string | null;
	onSaved: () => void;
}) {
	const [fields, setFields] = useState<CertificateInfoField[] | null>(null);
	const [values, setValues] = useState<Partial<Record<CertificateInfoKey, string>>>({});
	const [saving, setSaving] = useState(false);

	const apply = (f: CertificateInfoField[]) => {
		setFields(f);
		setValues(Object.fromEntries(f.map((x) => [x.key, x.value])));
	};

	useEffect(() => {
		getCertificateInfo(seminarId)
			.then(apply)
			.catch((e) => showToast('error', errMsg(e, 'Không đọc được thông tin trên mẫu')));
	}, [seminarId]);

	if (!fields) return <InlineLoading />;
	const found = fields.filter((f) => f.found);
	if (!found.length) return null; // mẫu không theo bố cục chuẩn — dùng "Chỉnh mẫu"

	const dirty = found.some((f) => (values[f.key] ?? '') !== f.value);

	// Điền từ dữ liệu hội nghị: tên → nội dung; ngày bắt đầu/kết thúc → thời gian, ngày ký
	const fillFromSeminar = () => {
		const next = { ...values };
		const has = (k: CertificateInfoKey) => found.some((f) => f.key === k);
		if (has('content') && seminarTitle) next.content = seminarTitle;
		const t = timeText(startDate, endDate);
		if (has('time') && t) next.time = t;
		const d = ymd(endDate) ?? ymd(startDate);
		if (has('sign_date') && d) {
			const cur = values.sign_date ?? '';
			const place = cur.includes(',') ? cur.slice(0, cur.indexOf(',')) : 'Nghệ An';
			next.sign_date = `${place}, ngày ${pad2(d[2])} tháng ${pad2(d[1])} năm ${d[0]}`;
		}
		setValues(next);
	};

	const save = async () => {
		setSaving(true);
		try {
			const changed = Object.fromEntries(
				found.filter((f) => (values[f.key] ?? '') !== f.value).map((f) => [f.key, values[f.key] ?? '']),
			);
			apply(await saveCertificateInfo(seminarId, changed));
			showToast('success', 'Đã lưu thông tin trên giấy');
			onSaved();
		} catch (e) {
			showToast('error', errMsg(e, 'Lưu thông tin thất bại'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className={css.info}>
			<div className={css.infoHead}>
				<span className={css.infoTitle}>Thông tin trên giấy</span>
				<button
					type='button'
					className={css.linkBtn}
					onClick={fillFromSeminar}
					disabled={saving}
					title='Điền tên hội nghị và ngày tổ chức từ thông tin hội nghị trong hệ thống'
				>
					<RefreshSvg /> Lấy từ thông tin hội nghị
				</button>
			</div>
			{found.map((f) => (
				<label
					key={f.key}
					className={css.infoRow}
				>
					<span className={css.infoLabel}>{f.label}</span>
					<span className={css.infoInput}>
						{f.prefix && <span className={css.infoPrefix}>{f.prefix.trim()}</span>}
						{/* Nội dung / đơn vị thường dài → 2 dòng để thấy hết */}
						{f.key === 'content' || f.key === 'organizer' ? (
							<textarea
								rows={2}
								value={values[f.key] ?? ''}
								onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
								placeholder={f.original}
								disabled={saving}
							/>
						) : (
							<input
								value={values[f.key] ?? ''}
								onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
								placeholder={f.original}
								disabled={saving}
							/>
						)}
					</span>
					{(() => {
						const miss = missingChars(f.prefix + (values[f.key] ?? ''), f.charset);
						return miss.length ? (
							<span className={css.infoMissing}>
								Mẫu không có ký tự {miss.map((c) => `"${c}"`).join(', ')} — các ký tự này in bằng font thay thế
							</span>
						) : null;
					})()}
					{values[f.key] !== f.original && (
						<button
							type='button'
							className={css.infoReset}
							onClick={() => setValues((v) => ({ ...v, [f.key]: f.original }))}
							title={`Trả về chữ gốc: ${f.original}`}
						>
							Gốc
						</button>
					)}
				</label>
			))}
			<div className={css.infoActions}>
				<span className={css.hint}>Chữ mới dùng font, cỡ, màu của chính dòng gốc trên mẫu.</span>
				<button
					type='button'
					className={styles.btnPrimary}
					onClick={() => void save()}
					disabled={!dirty || saving}
				>
					{saving ? <span className={styles.spinner} /> : <CheckSvg />}
					{saving ? 'Đang lưu…' : 'Lưu thông tin'}
				</button>
			</div>
		</div>
	);
}

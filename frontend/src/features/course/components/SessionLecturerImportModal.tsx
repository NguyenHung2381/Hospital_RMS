import { useState } from 'react';
import { CheckSvg, DownloadSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { Badge, FileDropzone, Modal, ModalActions } from '@/shared/components';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import { FormField } from '@/shared/components/Input/FormField';
import { InlineLoading } from '@/shared/components/Loading';
import tbl from '@/shared/components/Table/Table.module.css';
import { formatDateVN } from '@/shared/utils/formatDate';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import {
	downloadSessionLecturerTemplate,
	importSessionLecturers,
	type SessionImportResult,
	type SessionImportRow,
	type SessionImportStatus,
	type TeachingPlanPerson,
} from '../api/courseApi';
import styles from '../pages/Courses.module.css';
import m from './SessionLecturerImportModal.module.css';

const STATUS: Record<SessionImportStatus, { label: string; tone: BadgeTone }> = {
	update: { label: 'Cập nhật', tone: 'blue' },
	unchanged: { label: 'Không đổi', tone: 'gray' },
	skipped: { label: 'Bỏ qua', tone: 'red' },
	failed: { label: 'Lỗi', tone: 'red' },
};
const KIND_LABEL = { theory: 'LT', practice: 'TH' } as const;

const rangeOf = (r: SessionImportRow) => {
	if (!r.from) return 'Mọi buổi';
	const time = r.start ? ` (${r.start})` : '';
	return r.from === r.to
		? `${formatDateVN(r.from)}${time}`
		: `${formatDateVN(r.from)} – ${formatDateVN(r.to ?? r.from)}`;
};

function Person({ p }: { p: TeachingPlanPerson }) {
	const sub = [p.staff_number != null && `MNV ${p.staff_number}`, p.is_new && 'tạo hồ sơ GV']
		.filter(Boolean)
		.join(' · ');
	return (
		<div>
			{p.name}
			{sub && <span className={m.personSub}> · {sub}</span>}
		</div>
	);
}

function Row({ r }: { r: SessionImportRow }) {
	const dates = r.dates ?? [];
	return (
		<tr className={r.status === 'unchanged' ? m.rowMuted : undefined}>
			<td className={m.tdRow}>{r.row}</td>
			<td>
				<span className={tbl.cellTitle}>{r.title || '—'}</span>
				{r.code && <div className={tbl.cellCode}>{r.code}</div>}
			</td>
			<td className={m.nowrap}>
				{r.kind ? <Badge tone={r.kind === 'practice' ? 'teal' : 'blue'}>{KIND_LABEL[r.kind]}</Badge> : '—'}
				<div className={tbl.cellSub}>{rangeOf(r)}</div>
			</td>
			<td>{r.main ? <Person p={r.main} /> : '—'}</td>
			<td>
				{r.assistants?.length ? (
					r.assistants.map((p, i) => (
						<Person
							key={i}
							p={p}
						/>
					))
				) : (
					<span className={m.missing}>{r.main ? 'Không có' : '—'}</span>
				)}
			</td>
			<td>
				<Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
				{r.sessions != null && (
					<div
						className={tbl.cellSub}
						title={dates.join(', ')}
					>
						{r.changed ? `${r.changed}/${r.sessions} buổi đổi` : `${r.sessions} buổi`}
						{dates.length > 0 && `: ${dates.slice(0, 3).join(', ')}${dates.length > 3 ? '…' : ''}`}
					</div>
				)}
				{r.note && <div className={m.note}>{r.note}</div>}
			</td>
		</tr>
	);
}

// Nhập kế hoạch giảng dạy từ Excel: mỗi bài 1 khối dòng, mỗi dòng 1 phần LT / TH với giảng
// viên chính, trợ giảng (mã NV + họ tên) và thời gian giảng — áp cho các buổi ĐÃ XẾP của
// phần đó trong khoảng ngày. Tải file mẫu (điền sẵn theo lịch hiện có) → chọn file → xem
// trước → xác nhận. Xem sessionLecturerImportService.
export function SessionLecturerImportModal({
	courseId,
	courseName,
	programId,
	onClose,
	onImported,
}: {
	courseId: string;
	courseName?: string;
	/** Đang làm việc trong 1 chương trình ⇒ file mẫu chỉ gồm bài của chương trình đó. */
	programId?: string | null;
	onClose: () => void;
	onImported: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<SessionImportResult | null>(null);
	const [result, setResult] = useState<SessionImportResult | null>(null);

	const downloadTemplate = async () => {
		setDownloading(true);
		setError('');
		try {
			const blob = await downloadSessionLecturerTemplate(courseId, programId);
			saveBlob(blob, `ke-hoach-giang-day_${fileSlug(courseName || '') || 'khoa-hoc'}.xlsx`);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Không tải được file mẫu');
		} finally {
			setDownloading(false);
		}
	};

	const pick = async (f: File | null) => {
		setFile(f);
		setPreview(null);
		setResult(null);
		setError('');
		if (!f) return;
		setLoading(true);
		try {
			setPreview(await importSessionLecturers(courseId, f, true));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const commit = async () => {
		if (!file) return;
		setLoading(true);
		setError('');
		try {
			setResult(await importSessionLecturers(courseId, file, false));
			onImported();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập kế hoạch giảng dạy thất bại');
		} finally {
			setLoading(false);
		}
	};

	const s = preview?.summary;
	const changes = s?.sessions ?? 0;
	const shown = result ?? preview;
	const warnings = shown?.warnings ?? [];
	const failed = result?.rows.filter((r) => r.status === 'failed').length ?? 0;

	return (
		<Modal
			open
			onClose={onClose}
			size='xl'
			icon={<UploadSvg />}
			title='Nhập kế hoạch giảng dạy (Excel)'
			subtitle='Giảng viên chính và trợ giảng từng phần LT / TH của mỗi bài'
			bodyClassName={m.body}
			footer={
				result ? (
					<ModalActions
						onCancel={onClose}
						onConfirm={onClose}
						confirmLabel='Đóng'
					/>
				) : (
					<ModalActions
						onCancel={onClose}
						onConfirm={() => void commit()}
						loading={loading}
						disabled={!changes}
						confirmLabel={changes ? `Cập nhật ${changes} buổi` : 'Cập nhật giảng viên'}
					/>
				)
			}
		>
			{!result && (
				<>
					<div className={`${styles.noticeBox} ${m.templateRow}`}>
						<InfoSvg />
						<span>
							Mỗi bài 1 khối dòng, mỗi dòng 1 phần <b>LT</b> hoặc <b>TH</b>: <b>Giảng viên chính</b>,{' '}
							<b>Trợ giảng</b> (cùng dạy buổi đó; nhiều người cách nhau dấu ;) — ghi <b>Mã NV</b> để đối chiếu,
							chuyên gia ngoài viện chỉ ghi họ tên — và <b>Thời gian giảng</b>. Hệ thống gán cho các buổi đã xếp
							của phần đó trong khoảng ngày, <b>không tự tạo buổi</b>. Một phần nhiều người dạy ở các đợt khác
							nhau thì thêm dòng LT/TH, mỗi dòng 1 khoảng ngày. Xem sheet “Hướng dẫn” trong file mẫu.
						</span>
						<button
							type='button'
							className={m.templateBtn}
							onClick={() => void downloadTemplate()}
							disabled={downloading}
						>
							<DownloadSvg /> {downloading ? 'Đang tạo…' : 'Tải file mẫu'}
						</button>
					</div>

					<FormField label='File Excel (.xlsx)'>
						<FileDropzone
							value={file}
							onChange={(f) => void pick(f)}
							accept='.xlsx'
							disabled={loading}
						/>
					</FormField>
					{loading && <InlineLoading label={preview ? 'Đang cập nhật…' : 'Đang đọc file…'} />}
					{error && <div className={styles.fieldError}>{error}</div>}
				</>
			)}

			{shown && (
				<>
					<div className={`${styles.noticeBox} ${result || changes ? styles.noticeOk : ''} ${m.summary}`}>
						{result || changes ? <CheckSvg /> : <InfoSvg />}
						<span>
							{result ? (
								<>
									Đã cập nhật giảng viên cho <b>{result.summary.updated_sessions ?? 0}</b> buổi
									{failed > 0 && <>, {failed} dòng lỗi</>}
									{result.summary.skipped > 0 && <>, bỏ qua {result.summary.skipped} dòng</>}.
								</>
							) : (
								<>
									<b>{s!.rows}</b> dòng: <b>{s!.update}</b> cập nhật (<b>{s!.sessions}</b> buổi), {s!.unchanged} không
									đổi
									{s!.skipped > 0 && (
										<>
											, <b>{s!.skipped}</b> bỏ qua
										</>
									)}
									.
								</>
							)}
						</span>
					</div>
					{warnings.length > 0 && (
						<ul className={styles.warnList}>
							{warnings.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
					{shown.rows.length > 0 && (
						<div className={styles.importPreview}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th className={m.tdRow}>Dòng</th>
										<th>Bài học</th>
										<th>Phần · thời gian</th>
										<th>Giảng viên chính</th>
										<th>Trợ giảng</th>
										<th className={m.thStatus} />
									</tr>
								</thead>
								<tbody>
									{shown.rows.map((r) => (
										<Row
											key={r.row}
											r={r}
										/>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
		</Modal>
	);
}

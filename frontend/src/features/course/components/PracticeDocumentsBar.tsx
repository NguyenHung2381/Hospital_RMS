import { useEffect, useState } from 'react';
import { DocSvg } from '@/assets/icons';
import {
	getPracticeDocuments,
	type PracticeDocumentInfo,
	type PracticeDocumentType,
} from '../api/courseApi';
import { savePracticeDocument } from '../utils/practiceDocuments';
import styles from '../pages/Courses.module.css';

// Khối "In giấy tờ" của hồ sơ thực hành GPHN: Đơn đề nghị, Hợp đồng, Phiếu nhận xét
// (tất cả vòng, .zip). Giấy tờ lấy theo dữ liệu ĐÃ LƯU; ô còn thiếu in thành dòng chấm.
export function PracticeDocumentsBar({
	enrollmentId,
	who,
	refreshKey,
}: {
	enrollmentId: string;
	/** Mã thực hành hoặc tên học viên — dùng đặt tên file. */
	who: string;
	/** Đổi giá trị để nạp lại danh sách ô thiếu (sau khi lưu hồ sơ / sửa vòng). */
	refreshKey?: unknown;
}) {
	const [info, setInfo] = useState<PracticeDocumentInfo | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	useEffect(() => {
		getPracticeDocuments(enrollmentId)
			.then(setInfo)
			.catch(() => setInfo(null));
	}, [enrollmentId, refreshKey]);

	if (!info) return null;
	const run = async (key: string, type: PracticeDocumentType) => {
		setBusy(key);
		await savePracticeDocument(enrollmentId, type, who);
		setBusy(null);
	};
	const missingRotations = info.rotations.filter((r) => r.missing.length);

	return (
		<div>
			<div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
				{info.documents.map((d) => (
					<button
						key={d.type}
						type='button'
						className={styles.btnGhost}
						disabled={!!busy || (d.per_rotation && info.rotations.length === 0)}
						title={
							d.per_rotation
								? 'Phiếu nhận xét của mọi vòng (trừ vòng không đạt), gộp 1 file .zip — tải từng phiếu ở dòng vòng bên dưới'
								: d.missing.length
									? `Còn thiếu: ${d.missing.join(', ')} (in thành dòng chấm)`
									: undefined
						}
						onClick={() => run(d.type, d.type)}
					>
						<DocSvg /> {busy === d.type ? 'Đang tạo…' : d.per_rotation ? `${d.label} (tất cả vòng)` : d.label}
					</button>
				))}
			</div>
			{info.documents.some((d) => d.missing.length) && (
				<div className={styles.hint}>
					Còn thiếu:{' '}
					{info.documents
						.filter((d) => d.missing.length)
						.map((d) => `${d.label} — ${d.missing.join(', ')}`)
						.join('; ')}
					. Ô thiếu sẽ in thành dòng chấm để điền tay.
				</div>
			)}
			{missingRotations.length > 0 && (
				<div className={styles.hint}>
					Phiếu nhận xét còn thiếu:{' '}
					{missingRotations.map((r) => `${r.label} (${r.missing.join(', ')})`).join('; ')}.
				</div>
			)}
			<div className={styles.hint}>Giấy tờ lấy theo dữ liệu đã lưu — lưu hồ sơ trước khi in.</div>
		</div>
	);
}

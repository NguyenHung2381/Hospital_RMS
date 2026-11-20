import { useState } from 'react';
import { AlertSvg, DownloadSvg } from '@/assets/icons';
import { saveBlob } from '@/shared/utils/saveBlob';
import {
	downloadDraftApplication,
	downloadDraftProposal,
	type DraftApplicationPayload,
	type DraftProposalPayload,
} from '../../api/publicApi';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	application: DraftApplicationPayload;
	proposal: DraftProposalPayload;
}

// Nội viện: tải đơn đăng ký và tờ trình điền sẵn (bản nháp, chưa có mã đăng ký) để in, ký, trình duyệt.
export function DraftDocuments({ application, proposal }: Props) {
	const [busy, setBusy] = useState<'application' | 'proposal' | null>(null);
	const [error, setError] = useState('');

	const run = async (kind: 'application' | 'proposal') => {
		setBusy(kind);
		setError('');
		try {
			if (kind === 'application') saveBlob(await downloadDraftApplication(application), 'Don-dang-ky-ban-nhap.docx');
			else saveBlob(await downloadDraftProposal(proposal), 'To-trinh-ban-nhap.docx');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không tạo được giấy tờ, vui lòng thử lại');
		} finally {
			setBusy(null);
		}
	};

	return (
		<section
			className={s.draftDocs}
			aria-labelledby='draft-docs-title'
		>
			<h3
				id='draft-docs-title'
				className={s.draftTitle}
			>
				Bước 1 — Tải giấy tờ đã điền sẵn
			</h3>
			<ol className={s.draftSteps}>
				<li>In đơn đăng ký và ký tên.</li>
				<li>
					In tờ trình, nộp cho khoa/phòng để ghi Bảng phân tích nhu cầu đào tạo, ký và trình Ban giám đốc duyệt.
				</li>
				<li>Scan hoặc chụp rõ nét 2 giấy tờ đã ký / đã duyệt rồi đính kèm ở bước 2 bên dưới.</li>
			</ol>
			<div className={s.draftButtons}>
				<button
					type='button'
					className={s.ghostBtn}
					onClick={() => void run('application')}
					disabled={busy !== null}
				>
					<DownloadSvg />
					{busy === 'application' ? 'Đang tạo...' : 'Tải Đơn đăng ký (.docx)'}
				</button>
				<button
					type='button'
					className={s.ghostBtn}
					onClick={() => void run('proposal')}
					disabled={busy !== null}
				>
					<DownloadSvg />
					{busy === 'proposal' ? 'Đang tạo...' : 'Tải Tờ trình và Bảng phân tích nhu cầu (.docx)'}
				</button>
			</div>
			{error && (
				<div
					className={s.serverError}
					role='alert'
				>
					<AlertSvg /> {error}
				</div>
			)}
			<p className={s.hint}>
				Thông tin bạn nhập chỉ được giữ trong thẻ trình duyệt này. Nếu đóng trang trong lúc chờ duyệt tờ trình, khi quay
				lại bạn cần nhập lại thông tin.
			</p>
		</section>
	);
}

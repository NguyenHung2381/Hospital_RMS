import { useState } from 'react';
import { AlertSvg, DownloadSvg } from '@/assets/icons';
import { saveBlob } from '@/shared/utils/saveBlob';
import { downloadDraftProposal, type DraftProposalPayload } from '../../api/publicApi';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	proposal: DraftProposalPayload;
}

// Nội viện: tải tờ trình điền sẵn (bản nháp, chưa có mã đăng ký) để khoa/phòng ghi nhu cầu đào tạo và
// trình Ban giám đốc duyệt. Đơn đăng ký không cần tải — lập từ thông tin khai trên form.
export function DraftDocuments({ proposal }: Props) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const run = async () => {
		setBusy(true);
		setError('');
		try {
			saveBlob(await downloadDraftProposal(proposal), 'To-trinh-ban-nhap.docx');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không tạo được tờ trình, vui lòng thử lại');
		} finally {
			setBusy(false);
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
				Tờ trình cử cán bộ đi học
			</h3>
			<ol className={s.draftSteps}>
				<li>Tải tờ trình đã điền sẵn thông tin của bạn.</li>
				<li>Nộp cho khoa/phòng để ghi Bảng phân tích nhu cầu đào tạo, ký và trình Ban giám đốc duyệt.</li>
				<li>
					Có bản đã duyệt thì scan hoặc chụp rõ nét rồi đính kèm bên dưới. Chưa có thì cứ gửi đăng ký trước, nộp bổ
					sung sau.
				</li>
			</ol>
			<div className={s.draftButtons}>
				<button
					type='button'
					className={s.ghostBtn}
					onClick={() => void run()}
					disabled={busy}
				>
					<DownloadSvg />
					{busy ? 'Đang tạo...' : 'Tải Tờ trình và Bảng phân tích nhu cầu (.docx)'}
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
		</section>
	);
}

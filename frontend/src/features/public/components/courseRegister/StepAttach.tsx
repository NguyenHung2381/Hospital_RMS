import type {
	DraftProposalPayload,
	RegistrationAttachmentRules,
	RegistrationFileKind,
	RegistrationSource,
} from '../../api/publicApi';
import { DraftDocuments } from './DraftDocuments';
import { FileSlot } from './FileSlot';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	source: RegistrationSource;
	rules: RegistrationAttachmentRules;
	files: Partial<Record<RegistrationFileKind, File>>;
	onFile: (kind: RegistrationFileKind, file: File | null) => void;
	errors: Record<string, string | undefined>;
	/** Chỉ nội viện (đã khớp hồ sơ nhân sự): dữ liệu để máy chủ điền sẵn tờ trình */
	draft?: DraftProposalPayload;
}

// Mục "Hồ sơ đính kèm": mỗi loại hồ sơ bắt buộc 1 ô file (danh sách lấy từ máy chủ — rules.attachments)
export function StepAttach({ source, rules, files, onFile, errors, draft }: Props) {
	const internal = source === 'internal';
	return (
		<>
			{internal ? (
				<>
					{draft && <DraftDocuments proposal={draft} />}
					<h3 className={s.attachTitle}>Đính kèm tờ trình đã duyệt</h3>
				</>
			) : (
				<div className={s.note}>
					Đính kèm đủ 4 giấy tờ bên dưới, mỗi ô 1 file (PDF, JPG hoặc PNG). Phòng Đào tạo dùng các file này để xét
					duyệt; file cũng được lưu vào hồ sơ học viên của bạn.
				</div>
			)}
			<div className={s.slotGrid}>
				{rules.kinds[source].map((k) => (
					<FileSlot
						key={k.key}
						kind={k.key}
						label={k.label}
						hint={k.hint}
						required={k.required}
						later={k.later}
						file={files[k.key] ?? null}
						onChange={(f) => onFile(k.key, f)}
						error={errors[`file_${k.key}`]}
						extensions={rules.extensions}
						maxSizeMB={rules.max_size_mb}
					/>
				))}
			</div>
			{/* Giới hạn định dạng / dung lượng đã hiện trong từng ô — ở đây chỉ nói cách nộp */}
			<p className={s.attachNote}>
				{internal
					? 'Nộp bổ sung tờ trình sau ở trang Tra cứu đơn đăng ký hoặc mục "Đơn đăng ký của tôi" ở cổng nhân viên.'
					: 'Thiếu giấy tờ bắt buộc thì chưa gửi được đăng ký.'}
			</p>
		</>
	);
}

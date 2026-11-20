import type {
	DraftApplicationPayload,
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
	/** Chỉ nội viện (đã khớp hồ sơ nhân sự): dữ liệu để máy chủ điền sẵn đơn và tờ trình */
	draft?: { application: DraftApplicationPayload; proposal: DraftProposalPayload };
}

// Bước 5: mỗi loại hồ sơ bắt buộc 1 ô file (danh sách lấy từ máy chủ — rules.attachments)
export function StepAttach({ source, rules, files, onFile, errors, draft }: Props) {
	const internal = source === 'internal';
	return (
		<>
			{internal ? (
				<>
					{draft && (
						<DraftDocuments
							application={draft.application}
							proposal={draft.proposal}
						/>
					)}
					<h3 className={s.attachTitle}>Bước 2 — Đính kèm giấy tờ đã ký / đã duyệt</h3>
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
						file={files[k.key] ?? null}
						onChange={(f) => onFile(k.key, f)}
						error={errors[`file_${k.key}`]}
						extensions={rules.extensions}
						maxSizeMB={rules.max_size_mb}
					/>
				))}
			</div>
			<p className={s.hint}>
				Mỗi file tối đa {rules.max_size_mb} MB. Thiếu giấy tờ bắt buộc thì chưa gửi được đăng ký.
			</p>
		</>
	);
}

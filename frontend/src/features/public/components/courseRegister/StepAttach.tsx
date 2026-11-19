import type { RegistrationSource } from '../../api/publicApi';
import { AttachmentPicker, type Attachment } from '../AttachmentPicker';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	source: RegistrationSource;
	value: Attachment[];
	onChange: (next: Attachment[]) => void;
}

// Bước 5: 1 file PDF hồ sơ
export function StepAttach({ source, value, onChange }: Props) {
	return (
		<>
			{source === 'external' ? (
				<div className={s.note}>
					<strong>Gộp vào 1 file PDF:</strong> bản scan hoặc ảnh chụp rõ nét <em>căn cước công dân</em> (2 mặt) và{' '}
					<em>văn bằng</em>. Phòng Đào tạo dùng file này để đối chiếu với thông tin bạn đã khai.
				</div>
			) : (
				<div className={s.note}>
					<strong>Tờ trình đã được duyệt chưa cần nộp lúc này.</strong> Sau khi đăng ký xong, bạn in đơn, ký và nộp
					cho khoa/phòng để làm tờ trình. Khi tờ trình đã có xác nhận của Ban giám đốc, bạn quay lại trang "Tra cứu
					đơn đăng ký" để tải bản scan lên. Bước này chỉ để đính kèm thêm giấy tờ nếu bạn muốn.
				</div>
			)}
			<AttachmentPicker
				value={value}
				onChange={onChange}
				maxFiles={1}
				extensions={['.pdf']}
				hint='1 file PDF'
			/>
			<p className={s.hint}>
				{source === 'external'
					? 'Chưa có file thì vẫn gửi được đăng ký; Phòng Đào tạo có thể liên hệ xin giấy tờ khi xét duyệt.'
					: 'Không đính kèm cũng không sao — bạn có thể bỏ qua bước này.'}
			</p>
		</>
	);
}

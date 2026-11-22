import { useSearchParams } from 'react-router-dom';
import PublicLayout from '../../../layouts/PublicLayout';
import { RegistrationLookup } from '../components/RegistrationLookup';

// Tra cứu đơn đăng ký khóa học bằng mã đăng ký + số CCCD — trang riêng, tách khỏi
// tra cứu kết quả học tập. ?ma=<mã> (link ở màn đăng ký thành công) điền sẵn mã.
export default function RegistrationLookupPage() {
	const [params] = useSearchParams();
	return (
		<PublicLayout
			title='Tra cứu đơn đăng ký khóa học'
			subtitle='Nhập mã đăng ký và số CCCD để xem tiến độ xử lý, tải lại đơn đăng ký và nộp hồ sơ bổ sung.'
		>
			<RegistrationLookup initialCode={params.get('ma') ?? ''} />
		</PublicLayout>
	);
}

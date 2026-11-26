import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SearchSvg } from '@/assets/icons';
import { EmptyState } from '@/shared/components';
import TraineeLayout from '../../../layouts/TraineeLayout';
import { TRAINEE_HOME } from '../../../app/router/authHelpers';
import styles from './TraineeFaq.module.css';

interface Faq {
	q: string;
	/** Chữ thuần để tìm kiếm (a có thể chứa liên kết) */
	text: string;
	a: ReactNode;
}

const base = TRAINEE_HOME;

const GROUPS: { title: string; items: Faq[] }[] = [
	{
		title: 'Tài khoản',
		items: [
			{
				q: 'Tài khoản học viên lấy ở đâu?',
				text: 'Phòng Đào tạo cấp tài khoản sau khi bạn được ghi danh. Tên đăng nhập gồm chữ cái đầu họ tên và số thứ tự, ví dụ NVA_0001. Nhân viên bệnh viện dùng luôn tài khoản nhân viên.',
				a: (
					<p>
						Phòng Đào tạo cấp tài khoản sau khi bạn được ghi danh vào khóa học. Tên đăng nhập gồm chữ cái đầu của họ tên
						và số thứ tự, ví dụ <code>NVA_0001</code>. Nếu bạn là nhân viên bệnh viện, hãy đăng nhập bằng tài khoản
						nhân viên đang dùng.
					</p>
				),
			},
			{
				q: 'Quên mật khẩu thì làm thế nào?',
				text: 'Bấm Quên mật khẩu ở trang đăng nhập, nhập email đã khai với phòng Đào tạo để nhận liên kết đặt lại. Không nhận được email thì liên hệ phòng Đào tạo.',
				a: (
					<p>
						Ở trang đăng nhập, bấm <b>Quên mật khẩu</b> rồi nhập email bạn đã khai với phòng Đào tạo để nhận liên kết
						đặt lại. Không nhận được email (kể cả trong thư rác) thì liên hệ phòng Đào tạo để được cấp lại.
					</p>
				),
			},
			{
				q: 'Thông tin trong hồ sơ học viên bị sai?',
				text: 'Hồ sơ học viên do phòng Đào tạo quản lý, bạn xem ở Hồ sơ cá nhân. Thấy sai thì báo phòng Đào tạo kèm giấy tờ để chỉnh.',
				a: (
					<p>
						Hồ sơ học viên (ngày sinh, CCCD, trường tốt nghiệp…) do phòng Đào tạo quản lý; bạn xem ở{' '}
						<Link to={`${base}/ho-so`}>Hồ sơ cá nhân</Link>. Thấy sai, hãy báo phòng Đào tạo kèm giấy tờ chứng minh để
						được chỉnh lại.
					</p>
				),
			},
		],
	},
	{
		title: 'Khóa học và chương trình',
		items: [
			{
				q: 'Đăng ký khóa học thế nào?',
				text: 'Vào Khóa học của tôi, tab Đang mở đăng ký, chọn khóa và chương trình. Đăng ký chờ phòng Đào tạo duyệt; lớp đủ người thì vào danh sách chờ.',
				a: (
					<p>
						Vào <Link to={`${base}/khoa-hoc?tab=dang-ky`}>Khóa học của tôi → Đang mở đăng ký</Link>, chọn khóa (và chương
						trình nếu khóa có nhiều lớp). Đăng ký ở trạng thái chờ phòng Đào tạo duyệt; lớp đã đủ người thì bạn vào danh
						sách chờ và thấy vị trí của mình ở trang Tổng quan.
					</p>
				),
			},
			{
				q: 'Tab Chương trình cho biết gì?',
				text: 'Danh sách bài của chương trình với tín chỉ, số tiết lý thuyết thực hành, trạng thái từng bài và kết quả cả khóa. Bài hoàn thành khi có mặt đủ các buổi của bài.',
				a: (
					<p>
						Trong trang chi tiết khóa học, tab <b>Chương trình</b> liệt kê các bài của chương trình bạn học, kèm tín chỉ,
						số tiết lý thuyết / thực hành và trạng thái từng bài. Trạng thái tính theo điểm danh: có mặt đủ các buổi của
						bài thì bài được tính hoàn thành. Đầu tab là điểm lý thuyết / thực hành của cả khóa khi đã có.
					</p>
				),
			},
			{
				q: 'Làm bài kiểm tra online ở đâu?',
				text: 'Trang chi tiết khóa học, tab Bài kiểm tra. Bài đang mở cũng hiện ở Việc cần chú ý trên trang Tổng quan.',
				a: (
					<p>
						Ở trang chi tiết khóa học, tab <b>Bài kiểm tra</b>. Bài đang mở cũng được nhắc ở mục <b>Việc cần chú ý</b> trên
						trang <Link to={base}>Tổng quan</Link>. Bài có giới hạn thời gian, đã bắt đầu thì nên làm liền một lượt.
					</p>
				),
			},
		],
	},
	{
		title: 'Lịch học và điểm danh',
		items: [
			{
				q: 'Đưa lịch học vào điện thoại được không?',
				text: 'Ở Lịch học và điểm danh bấm Tải lịch ics rồi mở tệp bằng Google Calendar hoặc ứng dụng lịch của điện thoại.',
				a: (
					<p>
						Được. Ở <Link to={`${base}/lich-hoc`}>Lịch học & điểm danh</Link>, bấm <b>Tải lịch (.ics)</b> rồi mở tệp bằng
						Google Calendar hoặc ứng dụng lịch trên điện thoại. Lịch đổi sau đó thì tải lại tệp mới.
					</p>
				),
			},
			{
				q: 'Điểm danh bằng mã QR thế nào?',
				text: 'Đến lớp, mở Điểm danh QR và quét mã giảng viên chiếu trên màn hình. Kết quả hiện ngay trong tab Điểm danh của khóa.',
				a: (
					<p>
						Đến lớp, mở <Link to={`${base}/diem-danh`}>Điểm danh QR</Link> và quét mã giảng viên chiếu trên màn hình. Kết
						quả hiện trong tab <b>Điểm danh</b> của khóa học.
					</p>
				),
			},
			{
				q: 'Phải nghỉ học hoặc đến muộn thì sao?',
				text: 'Gửi đơn xin nghỉ hoặc xin đi muộn ở mục Điểm danh và xin phép. Đơn được duyệt thì buổi đó hiện Vắng có phép hoặc Muộn có phép. Buổi vắng vẫn tính vào tỉ lệ chuyên cần.',
				a: (
					<p>
						Gửi đơn ở mục <Link to={`${base}/diem-danh-ca`}>Điểm danh & xin phép</Link> (nếu bệnh viện bật mục này), hoặc
						báo trực tiếp phòng Đào tạo. Đơn được duyệt thì buổi đó hiện <b>Vắng có phép</b> / <b>Muộn có phép</b> trong
						lịch sử điểm danh. Lưu ý: buổi vắng có phép vẫn tính là vắng khi xét tỉ lệ chuyên cần.
					</p>
				),
			},
		],
	},
	{
		title: 'Giấy tờ, kết quả và chứng chỉ',
		items: [
			{
				q: 'Nộp giấy tờ hồ sơ thế nào?',
				text: 'Vào Giấy tờ hồ sơ, tải lên một tệp PDF gồm đủ giấy tờ. Phòng Đào tạo kiểm tra rồi duyệt hoặc trả lại kèm lý do.',
				a: (
					<p>
						Vào <Link to={`${base}/giay-to`}>Giấy tờ hồ sơ</Link> và tải lên một tệp PDF gồm đủ giấy tờ được yêu cầu.
						Phòng Đào tạo kiểm tra rồi duyệt hoặc trả lại kèm lý do; tệp chưa duyệt thì bạn rút lại và nộp tệp khác được.
					</p>
				),
			},
			{
				q: 'Khi nào có chứng chỉ?',
				text: 'Sau khi đạt kết quả khóa học và phòng Đào tạo cấp, chứng chỉ hiện ở Kết quả và chứng chỉ kèm số và ngày cấp.',
				a: (
					<p>
						Sau khi bạn đạt khóa học và phòng Đào tạo cấp giấy chứng nhận, chứng chỉ hiện ở{' '}
						<Link to={`${base}/ket-qua`}>Kết quả & chứng chỉ</Link> kèm số, ngày cấp và thời hạn.
					</p>
				),
			},
		],
	},
];

const norm = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase();

/** Câu hỏi thường gặp của cổng học viên — nhóm theo chủ đề, tìm theo từ khóa (không dấu cũng được). */
export default function TraineeFaq() {
	const [kw, setKw] = useState('');
	const groups = useMemo(() => {
		const k = norm(kw.trim());
		if (!k) return GROUPS;
		return GROUPS.map((g) => ({ ...g, items: g.items.filter((f) => norm(`${f.q} ${f.text}`).includes(k)) })).filter(
			(g) => g.items.length > 0,
		);
	}, [kw]);

	return (
		<TraineeLayout
			pageTitle='Câu hỏi thường gặp'
			pageSubtitle='Cách dùng cổng học viên: tài khoản, khóa học, lịch học, điểm danh, giấy tờ'
		>
			<div className={styles.search}>
				<SearchSvg aria-hidden='true' />
				<input
					type='search'
					value={kw}
					onChange={(e) => setKw(e.target.value)}
					placeholder='Ví dụ: quên mật khẩu, điểm danh, chứng chỉ'
					aria-label='Tìm câu hỏi'
				/>
			</div>
			{groups.length === 0 ? (
				<EmptyState
					title='Không có câu hỏi khớp từ khóa'
					desc='Thử từ khóa khác, hoặc liên hệ phòng Đào tạo.'
				/>
			) : (
				groups.map((g) => (
					<section
						key={g.title}
						className={styles.group}
						aria-label={g.title}
					>
						<h2 className={styles.groupTitle}>{g.title}</h2>
						<div className={styles.list}>
							{g.items.map((f) => (
								<details
									key={f.q}
									className={styles.item}
									open={!!kw.trim()}
								>
									<summary>{f.q}</summary>
									<div className={styles.answer}>{f.a}</div>
								</details>
							))}
						</div>
					</section>
				))
			)}
		</TraineeLayout>
	);
}

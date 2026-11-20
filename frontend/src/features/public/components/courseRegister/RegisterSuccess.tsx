import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircleSvg, CopySvg } from '@/assets/icons';
import { formatDateOr } from '../../../../shared/utils/formatDate';
import type { RegistrationSource } from '../../api/publicApi';
import { ApplicationActions } from '../ApplicationActions';
import s from '../../pages/CourseRegisterPublic.module.css';

export interface RegisterDone {
	code: string;
	downloadToken: string;
	source: RegistrationSource;
	name: string;
	email: string;
	course: string;
	program: string | null;
	start: string | null;
}

// Màn sau khi gửi đăng ký: mã đăng ký, đơn đã điền sẵn để in ký, việc cần làm tiếp
export function RegisterSuccess({ done, onRestart }: { done: RegisterDone; onRestart: () => void }) {
	const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const internal = done.source === 'internal';

	useEffect(() => {
		headingRef.current?.focus();
	}, []);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(done.code);
			setCopied('ok');
		} catch {
			setCopied('fail');
		}
		window.setTimeout(() => setCopied(null), 4000);
	};

	return (
		<div className={s.done}>
			<div className={s.doneIcon}>
				<CheckCircleSvg />
			</div>
			<h2
				ref={headingRef}
				tabIndex={-1}
				className={s.doneTitle}
			>
				Đã gửi đăng ký thành công
			</h2>
			<p className={s.doneText}>
				{internal
					? 'Hồ sơ của bạn đã được gửi kèm đăng ký. Phòng Đào tạo sẽ kiểm tra và liên hệ với bạn qua số điện thoại hoặc email đã khai.'
					: 'Bước tiếp theo là in đơn đăng ký bên dưới và ký tên. Phòng Đào tạo sẽ xét duyệt và liên hệ với bạn qua số điện thoại hoặc email đã khai.'}
			</p>

			<div className={s.codeCard}>
				<span className={s.codeLabel}>Mã đăng ký của bạn</span>
				<div className={s.codeRow}>
					<code
						className={s.codeValue}
						aria-label={`Mã đăng ký ${done.code}`}
					>
						{done.code}
					</code>
					<button
						type='button'
						className={s.ghostBtn}
						onClick={copy}
					>
						<CopySvg /> Sao chép
					</button>
				</div>
				<span
					className={s.codeHint}
					aria-live='polite'
				>
					{copied === 'ok'
						? 'Đã sao chép mã.'
						: copied === 'fail'
							? 'Không sao chép tự động được, hãy bôi đen mã rồi sao chép.'
							: 'Hãy ghi lại mã này. Mã cùng số CCCD dùng để tra cứu và tải lại đơn.'}
				</span>
			</div>

			<ApplicationActions
				code={done.code}
				proof={{ download_token: done.downloadToken }}
			/>
			<p className={s.hint}>
				{internal
					? 'Đơn này có in mã đăng ký, chỉ để bạn lưu — bản đã ký bạn đã nộp ở bước Hồ sơ đính kèm.'
					: 'Nút tải dùng được trong khoảng 30 phút. Sau đó vào trang tra cứu bằng mã đăng ký và số CCCD.'}
			</p>

			<section className={s.nextSteps}>
				<h3 className={s.nextTitle}>Việc cần làm tiếp theo</h3>
				{internal ? (
					<ol className={s.nextList}>
						<li>Đã nộp kèm: Đơn đăng ký đã ký và Tờ trình đã duyệt.</li>
						<li>Chờ Phòng Đào tạo xét duyệt; kết quả báo qua email / điện thoại.</li>
						<li>
							Cần thay file (ảnh mờ, nhầm file)? Khi đơn còn chờ duyệt, vào trang Tra cứu đơn đăng ký (mã đăng ký + số
							CCCD) hoặc mục "Đơn đăng ký của tôi" ở cổng nhân viên.
						</li>
					</ol>
				) : (
					<ol className={s.nextList}>
						<li>Đã nộp kèm: căn cước công dân, bằng tốt nghiệp, chứng chỉ hành nghề, quyết định cử đi học.</li>
						<li>Tải đơn, in ra, ký tên và mang đến nộp vào ngày khai giảng{done.start ? ` (${formatDateOr(done.start)})` : ''}.</li>
						<li>
							Theo dõi kết quả và thay file khi cần ở trang Tra cứu đơn đăng ký (mã đăng ký + số CCCD), khi đơn còn chờ
							duyệt.
						</li>
					</ol>
				)}
			</section>

			<dl className={s.doneCard}>
				<div>
					<dt>Học viên</dt>
					<dd>{done.name}</dd>
				</div>
				<div>
					<dt>Khóa học</dt>
					<dd>{done.course}</dd>
				</div>
				{done.program && (
					<div>
						<dt>Chương trình</dt>
						<dd>{done.program}</dd>
					</div>
				)}
				{done.start && (
					<div>
						<dt>Khai giảng</dt>
						<dd>{formatDateOr(done.start)}</dd>
					</div>
				)}
			</dl>
			{done.email && (
				<p className={s.hint}>
					Thư xác nhận kèm mã đăng ký sẽ gửi tới {done.email}. Chưa thấy thư thì xem mục thư rác.
				</p>
			)}

			<div className={s.doneActions}>
				<button
					type='button'
					className={s.ghostBtn}
					onClick={onRestart}
				>
					Đăng ký khóa khác
				</button>
				<Link
					to={`/tra-cuu-don-dang-ky?ma=${encodeURIComponent(done.code)}`}
					className={s.ghostBtn}
				>
					Tra cứu đơn đăng ký
				</Link>
			</div>
		</div>
	);
}

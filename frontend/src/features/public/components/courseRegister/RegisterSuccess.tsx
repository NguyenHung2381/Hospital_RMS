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
	/** Nội viện: đã đính kèm tờ trình đã duyệt lúc gửi (chưa thì nộp bổ sung sau) */
	proposalAttached?: boolean;
}

// Màn sau khi gửi đăng ký: mã đăng ký, việc cần làm tiếp; ngoại viện tải đơn đã điền sẵn để in ký
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
					? done.proposalAttached
						? 'Đăng ký và tờ trình đã được gửi. Phòng Đào tạo sẽ kiểm tra và liên hệ với bạn qua số điện thoại hoặc email đã khai.'
						: 'Đăng ký đã được gửi. Bạn còn cần nộp bổ sung tờ trình đã duyệt — xem hướng dẫn bên dưới.'
					: 'Bước tiếp theo là tải đơn đăng ký bên dưới, in ra và ký tên. Phòng Đào tạo sẽ xét duyệt và liên hệ với bạn qua số điện thoại hoặc email đã khai.'}
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

			{/* Nội viện không cần tải đơn: Phòng Đào tạo lập đơn từ thông tin đã khai */}
			{!internal && (
				<>
					<ApplicationActions
						code={done.code}
						proof={{ download_token: done.downloadToken }}
					/>
					<p className={s.hint}>Nút tải dùng được trong khoảng 30 phút. Sau đó vào trang tra cứu bằng mã đăng ký và số CCCD.</p>
				</>
			)}

			<section className={s.nextSteps}>
				<h3 className={s.nextTitle}>Việc cần làm tiếp theo</h3>
				{internal ? (
					<ol className={s.nextList}>
						{done.proposalAttached ? (
							<li>Đã nộp kèm: Tờ trình đã duyệt.</li>
						) : (
							<li>
								Khi tờ trình được khoa/phòng và Ban giám đốc duyệt, scan hoặc chụp rõ nét rồi nộp bổ sung ở trang Tra cứu
								đơn đăng ký (mã đăng ký ở trên) hoặc mục "Đơn đăng ký của tôi" ở cổng nhân viên — trước khi đơn được xét
								duyệt.
							</li>
						)}
						<li>Chờ Phòng Đào tạo xét duyệt; kết quả báo qua email / điện thoại.</li>
						{done.proposalAttached && (
							<li>
								Cần thay file (ảnh mờ, nhầm file)? Khi đơn còn chờ duyệt, vào trang Tra cứu đơn đăng ký hoặc mục "Đơn
								đăng ký của tôi" ở cổng nhân viên.
							</li>
						)}
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
				<p className={s.hint}>
					Phát hiện khai sai sau khi gửi? Khi đơn còn chờ duyệt, vào trang Tra cứu đơn đăng ký (mã đăng ký + số CCCD) và chọn
					"Sửa thông tin đã khai".
				</p>
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

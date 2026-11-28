import { useCallback, useEffect, useState } from 'react';
import { DownloadSvg, WalletSvg } from '@/assets/icons';
import { Badge, Button, EmptyState, InlineLoading, confirmDialog } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import { useModules } from '@/shared/hooks/useModules';
import TraineeLayout from '../../../layouts/TraineeLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { myTuitionApi } from '../../tuition/api/tuitionApi';
import { PaySubmitModal, PaymentList, TransferBox, TuitionAmounts } from '../../tuition/components/TuitionParts';
import { downloadReceipt } from '../../tuition/utils/tuitionHelpers';
import s from '../../tuition/components/Tuition.module.css';
import { TUITION_STATE, formatVnd, type MyTuition, type TuitionItem } from '../../tuition/types/tuition.type';

/**
 * Học phí của học viên: khoản phải nộp theo từng khóa đã được duyệt, mã VietQR để
 * chuyển khoản, báo đã chuyển khoản kèm chứng từ, lịch sử nộp và phiếu thu.
 */
export default function TraineeTuition() {
	const [data, setData] = useState<MyTuition | null>(null);
	const [error, setError] = useState('');
	const [paying, setPaying] = useState<{ item: TuitionItem; max: number } | null>(null);
	const tuitionOn = useModules().tuition;

	const load = useCallback(() => {
		myTuitionApi
			.get()
			.then((d) => {
				setData(d);
				setError('');
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được học phí'));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate('tuition', load);

	const cancel = async (paymentId: string) => {
		const ok = await confirmDialog({
			title: 'Rút lại khoản đã báo?',
			message: 'Khoản này chưa được xác nhận. Rút lại thì phòng Đào tạo sẽ không xử lý nữa; bạn có thể báo lại sau.',
			confirmLabel: 'Rút lại',
			tone: 'danger',
		});
		if (!ok) return;
		try {
			setData(await myTuitionApi.cancel(paymentId));
			notify.success('Đã rút lại');
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Không rút lại được');
		}
	};

	return (
		<TraineeLayout
			pageTitle='Học phí'
			pageSubtitle='Số tiền phải nộp, chuyển khoản bằng mã QR và biên lai các khóa bạn học'
		>
			{!tuitionOn && (
				<EmptyState
					icon={<WalletSvg />}
					title='Chức năng học phí đang tắt'
					desc='Bệnh viện hiện không thu học phí qua hệ thống. Liên hệ phòng Đào tạo nếu cần thông tin về khoản đã nộp.'
				/>
			)}
			{tuitionOn && error && <EmptyState title='Không tải được học phí' desc={error} />}
			{tuitionOn && !data && !error && <InlineLoading />}
			{data && data.items.length === 0 && (
				<EmptyState
					icon={<WalletSvg />}
					title='Chưa có khoản học phí nào'
					desc='Học phí hiện ở đây sau khi phòng Đào tạo duyệt đăng ký khóa học có thu phí.'
				/>
			)}
			{data && data.items.length > 0 && (
				<div className={s.stack}>
					{data.items.map((item) => {
						const st = TUITION_STATE[item.state];
						// Phần còn phải nộp chưa báo (đã trừ khoản đang chờ xác nhận)
						const open = Math.max(item.remaining - item.pending, 0);
						return (
							<section key={item.enrollment_id} className={s.item} aria-label={item.course_name}>
								<div className={s.itemHead}>
									<div>
										<h2 className={s.itemTitle}>{item.course_name}</h2>
										<div className={s.itemSub}>
											{[
												item.program_name,
												item.start_date && open > 0 ? `Hạn nộp: ngày khai giảng ${formatDateVN(item.start_date)}` : null,
											]
												.filter(Boolean)
												.join(' · ')}
										</div>
									</div>
									<Badge tone={st.tone}>{st.label}</Badge>
								</div>
								<div className={s.itemBody}>
									<TuitionAmounts item={item} />
									{open > 0 &&
										(data.bank ? (
											<TransferBox bank={data.bank} item={item} amount={open}>
												<Button onClick={() => setPaying({ item, max: open })}>Tôi đã chuyển khoản</Button>
												<span className={s.hint}>Gửi kèm ảnh chụp giao dịch để được xác nhận.</span>
											</TransferBox>
										) : (
											<p className={s.note}>
												Phòng Đào tạo chưa khai báo tài khoản nhận chuyển khoản. Vui lòng nộp {formatVnd(open)} trực
												tiếp tại phòng Đào tạo và giữ biên lai.
											</p>
										))}
									{open === 0 && item.pending > 0 && (
										<p className={s.note}>Phòng Đào tạo đang đối chiếu khoản bạn đã báo — bạn sẽ nhận thông báo khi có kết quả.</p>
									)}
									<div>
										<h3 className={s.historyTitle}>Lịch sử nộp</h3>
										<PaymentList
											payments={item.payments}
											actions={(p) =>
												p.status === 'confirmed' ? (
													<Button
														size='sm'
														variant='secondary'
														icon={<DownloadSvg />}
														onClick={() => void downloadReceipt(() => myTuitionApi.receipt(p.id), p.receipt_no)}
													>
														Phiếu thu
													</Button>
												) : (
													<Button size='sm' variant='secondary' onClick={() => void cancel(p.id)}>
														Rút lại
													</Button>
												)
											}
										/>
									</div>
								</div>
							</section>
						);
					})}
				</div>
			)}
			{paying && (
				<PaySubmitModal
					item={paying.item}
					maxAmount={paying.max}
					onClose={() => setPaying(null)}
					onSubmit={async (d, file) => {
						setData(await myTuitionApi.submit(paying.item.enrollment_id, d, file));
						notify.success('Đã gửi — chờ phòng Đào tạo xác nhận');
					}}
				/>
			)}
		</TraineeLayout>
	);
}

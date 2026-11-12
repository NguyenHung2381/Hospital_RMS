import { useMemo } from 'react';
import { CheckCircleSvg, ClockSvg, EditSvg, FileTextSvg, PlusSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import sem from '../../pages/Seminar.module.css';
import s from './Detail.module.css';
import { Kpi } from './OverviewTab';
import { TestCell } from './ParticipantsTab';
import { PersonList } from './PersonList';
import { parseTestQuestions, testScore, testWhen } from './detailUtils';
import type { TabProps } from './types';

/** Tab "Bài kiểm tra" (hội nghị BV tổ chức): cấu hình tóm tắt + kết quả từng người. */
export function TestTab({ seminar: sm, participants, counts, perms, actions }: TabProps) {
	const questions = parseTestQuestions(sm);
	const points = Math.round(questions.reduce((n, q) => n + (q.points && q.points > 0 ? q.points : 1), 0) * 100) / 100;
	const has = questions.length > 0;
	// Thang điểm hiển thị: thang đặt riêng, không thì tổng điểm các câu
	const scale = sm.test_score_scale != null ? Number(sm.test_score_scale) : points;

	const submitted = useMemo(
		() =>
			participants
				.filter((p) => p.test_submitted_at)
				.sort((a, b) => (testScore(sm, b) ?? 0) - (testScore(sm, a) ?? 0)),
		[participants, sm],
	);
	const avg = submitted.length
		? Math.round((submitted.reduce((n, p) => n + (testScore(sm, p) ?? 0), 0) / submitted.length) * 10) / 10
		: null;

	const status = !has ? (
		<Badge tone='gray'>Chưa soạn</Badge>
	) : sm.test_open ? (
		<Badge
			tone='green'
			dot
		>
			Đang mở
		</Badge>
	) : (
		<Badge
			tone='amber'
			dot
		>
			Chưa bật
		</Badge>
	);

	return (
		<div className={s.stack}>
			<section className={s.card}>
				<div className={s.cardHead}>
					<div>
						<div className={s.cardTitle}>
							Bài kiểm tra cuối buổi <span style={{ marginLeft: 6 }}>{status}</span>
						</div>
						<div className={s.cardSub}>
							{has
								? 'Người tự đăng ký qua QR phải nộp bài (và đạt điểm đạt nếu đặt) mới được cấp CME.'
								: 'Soạn câu hỏi, đặt giờ mở và điểm đạt.'}
						</div>
					</div>
					{perms.canUpdate && (
						<div className={s.cardActions}>
							<button
								className={has ? sem.btnGhost : sem.btnPrimary}
								onClick={actions.openTest}
							>
								{has ? <EditSvg /> : <PlusSvg />} {has ? 'Cấu hình bài kiểm tra' : 'Soạn bài kiểm tra'}
							</button>
						</div>
					)}
				</div>
				{has && (
					<dl className={s.facts}>
						<div>
							<dt>Số câu · tổng điểm</dt>
							<dd>
								{questions.length} câu · {points} điểm
							</dd>
						</div>
						<div>
							<dt>Thang điểm</dt>
							<dd>
								{sm.test_score_scale != null
									? `Quy về thang ${scale} điểm`
									: `Theo tổng điểm câu hỏi (${points})`}
							</dd>
						</div>
						<div>
							<dt>Thời gian làm bài</dt>
							<dd>{sm.test_duration_minutes ? `${sm.test_duration_minutes} phút` : 'Không giới hạn'}</dd>
						</div>
						<div>
							<dt>Khung giờ mở bài</dt>
							<dd>{testWhen(sm) || 'Mở khi bật'}</dd>
						</div>
						<div>
							<dt>Điểm đạt</dt>
							<dd>{sm.test_pass_score != null ? `${sm.test_pass_score}/${scale} điểm` : 'Chỉ cần nộp bài'}</dd>
						</div>
						<div>
							<dt>Xáo trộn</dt>
							<dd>
								{[sm.test_shuffle_questions && 'Câu hỏi', sm.test_shuffle_options && 'Phương án']
									.filter(Boolean)
									.join(', ') || 'Không'}
							</dd>
						</div>
					</dl>
				)}
			</section>

			{has && (
				<>
					<div className={s.kpis}>
						<Kpi
							icon={<FileTextSvg />}
							label='Đã nộp bài'
							value={counts.submitted}
							of={counts.total}
						/>
						<Kpi
							icon={<ClockSvg />}
							label='Đang làm'
							value={counts.testing}
						/>
						{sm.test_pass_score != null && (
							<Kpi
								icon={<CheckCircleSvg />}
								label='Đạt'
								value={counts.passed}
								of={counts.submitted}
							/>
						)}
						<Kpi
							label='Điểm trung bình'
							value={avg ?? '—'}
							sub={avg != null ? `trên ${scale} điểm` : undefined}
						/>
					</div>

					<section className={s.card}>
						<div className={s.cardTitle}>Kết quả ({submitted.length})</div>
						<PersonList
							items={submitted}
							onOpen={actions.openParticipant}
							empty='Chưa có ai nộp bài.'
							right={(p) => (
								<TestCell
									s={sm}
									p={p}
								/>
							)}
						/>
					</section>
				</>
			)}
		</div>
	);
}

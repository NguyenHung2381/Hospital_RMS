import { useMemo, useState } from 'react';
import { CheckCircleSvg, ClockSvg, EditSvg, FileTextSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import type { Seminar, SeminarParticipant, SeminarTest } from '../../types/seminar.type';
import sem from '../../pages/Seminar.module.css';
import s from './Detail.module.css';
import { Kpi } from './OverviewTab';
import { TestResultCell } from './ParticipantsTab';
import { PersonList } from './PersonList';
import { parseTestQuestions, resultOf, testPassed, testScore, testWhen } from './detailUtils';
import type { TabProps } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tổng điểm các câu (câu chưa đặt điểm tính 1) và thang hiển thị của 1 đề */
const testPoints = (t: SeminarTest) => {
	const questions = parseTestQuestions(t);
	const points = round2(questions.reduce((n, q) => n + (q.points && q.points > 0 ? q.points : 1), 0));
	return { count: questions.length, points, scale: t.test_score_scale != null ? Number(t.test_score_scale) : points };
};

/** Tab "Bài kiểm tra" (hội nghị BV tổ chức): danh sách đề kiểm tra + kết quả từng đề. */
export function TestTab({ seminar: sm, participants, perms, actions }: TabProps) {
	const tests = sm.tests ?? [];
	const [picked, setPicked] = useState<string | null>(null);
	const current = tests.find((t) => t.id === picked) ?? tests.find((t) => t.test_questions) ?? null;

	return (
		<div className={s.stack}>
			<section className={s.card}>
				<div className={s.cardHead}>
					<div>
						<div className={s.cardTitle}>Đề kiểm tra ({tests.length})</div>
						<div className={s.cardSub}>
							Một hội nghị có thể có nhiều đề (vd trước buổi, cuối buổi, mỗi phiên một đề). Người tự đăng ký qua
							QR phải nộp (và đạt điểm đạt nếu đặt) mọi đề <b>tính điều kiện CME</b> mới được cấp CME.
						</div>
					</div>
					{perms.canUpdate && (
						<div className={s.cardActions}>
							<button
								type='button'
								className={sem.btnPrimary}
								onClick={() => actions.openTest(null)}
							>
								<PlusSvg /> Thêm đề kiểm tra
							</button>
						</div>
					)}
				</div>
				{!tests.length && (
					<div className={s.empty}>
						<b>Chưa có đề kiểm tra</b>
						{perms.canUpdate ? 'Soạn câu hỏi, đặt giờ mở và điểm đạt cho từng đề.' : 'Ban tổ chức chưa soạn đề.'}
					</div>
				)}
			</section>

			{tests.map((t) => (
				<TestCard
					key={t.id}
					t={t}
					sm={sm}
					participants={participants}
					canUpdate={perms.canUpdate}
					onEdit={() => actions.openTest(t)}
					onDelete={() => actions.deleteTest(t)}
				/>
			))}

			{current && (
				<TestResults
					t={current}
					tests={tests}
					participants={participants}
					onPick={setPicked}
					onOpen={actions.openParticipant}
				/>
			)}
		</div>
	);
}

function TestCard({
	t,
	sm,
	participants,
	canUpdate,
	onEdit,
	onDelete,
}: {
	t: SeminarTest;
	sm: Seminar;
	participants: SeminarParticipant[];
	canUpdate: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { count, points, scale } = testPoints(t);
	const has = count > 0;
	const stats = useMemo(() => {
		let submitted = 0;
		let testing = 0;
		let passed = 0;
		let sum = 0;
		for (const p of participants) {
			const r = resultOf(p, t);
			if (r?.test_submitted_at) {
				submitted++;
				sum += testScore(t, r) ?? 0;
				if (testPassed(t, r)) passed++;
			} else if (r?.test_started_at) testing++;
		}
		return { submitted, testing, passed, avg: submitted ? Math.round((sum / submitted) * 10) / 10 : null };
	}, [participants, t]);

	return (
		<section className={s.card}>
			<div className={s.cardHead}>
				<div>
					<div className={s.cardTitle}>
						{t.title}{' '}
						<span style={{ marginLeft: 6, display: 'inline-flex', gap: 6 }}>
							{!has ? (
								<Badge tone='gray'>Chưa soạn</Badge>
							) : t.test_open ? (
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
							)}
							{!t.counts_for_cme && <Badge tone='gray'>Không tính CME</Badge>}
						</span>
					</div>
					<div className={s.cardSub}>
						{has ? `${count} câu · ${points} điểm` : 'Chưa có câu hỏi — đề trống không hiện trên vé.'}
					</div>
				</div>
				{canUpdate && (
					<div className={s.cardActions}>
						<button
							type='button'
							className={has ? sem.btnGhost : sem.btnPrimary}
							onClick={onEdit}
						>
							{has ? <EditSvg /> : <PlusSvg />} {has ? 'Cấu hình' : 'Soạn câu hỏi'}
						</button>
						<button
							type='button'
							className={s.btnDangerGhost}
							onClick={onDelete}
							aria-label={`Xoá đề ${t.title}`}
							title='Xoá đề'
						>
							<TrashSvg />
						</button>
					</div>
				)}
			</div>
			{has && (
				<>
					<dl className={s.facts}>
						<div>
							<dt>Thang điểm</dt>
							<dd>{t.test_score_scale != null ? `Quy về thang ${scale} điểm` : `Theo tổng điểm câu hỏi (${points})`}</dd>
						</div>
						<div>
							<dt>Thời gian làm bài</dt>
							<dd>{t.test_duration_minutes ? `${t.test_duration_minutes} phút` : 'Không giới hạn'}</dd>
						</div>
						<div>
							<dt>Khung giờ mở bài</dt>
							<dd>{testWhen(t, sm) || 'Mở khi bật'}</dd>
						</div>
						<div>
							<dt>Điểm đạt</dt>
							<dd>{t.test_pass_score != null ? `${t.test_pass_score}/${scale} điểm` : 'Chỉ cần nộp bài'}</dd>
						</div>
						<div>
							<dt>Xáo trộn</dt>
							<dd>
								{[t.test_shuffle_questions && 'Câu hỏi', t.test_shuffle_options && 'Phương án']
									.filter(Boolean)
									.join(', ') || 'Không'}
							</dd>
						</div>
						<div>
							<dt>Điều kiện CME</dt>
							<dd>{t.counts_for_cme ? 'Phải nộp (và đạt) đề này' : 'Không tính'}</dd>
						</div>
					</dl>
					<div
						className={s.kpis}
						style={{ marginTop: 'var(--space-4)' }}
					>
						<Kpi
							icon={<FileTextSvg />}
							label='Đã nộp bài'
							value={stats.submitted}
							of={participants.length}
						/>
						<Kpi
							icon={<ClockSvg />}
							label='Đang làm'
							value={stats.testing}
						/>
						{t.test_pass_score != null && (
							<Kpi
								icon={<CheckCircleSvg />}
								label='Đạt'
								value={stats.passed}
								of={stats.submitted}
							/>
						)}
						<Kpi
							label='Điểm trung bình'
							value={stats.avg ?? '—'}
							sub={stats.avg != null ? `trên ${scale} điểm` : undefined}
						/>
					</div>
				</>
			)}
		</section>
	);
}

/** Kết quả 1 đề (chọn đề bằng nút phân đoạn khi có nhiều đề), điểm cao xếp trước */
function TestResults({
	t,
	tests,
	participants,
	onPick,
	onOpen,
}: {
	t: SeminarTest;
	tests: SeminarTest[];
	participants: SeminarParticipant[];
	onPick: (id: string) => void;
	onOpen: (id: string) => void;
}) {
	const withQuestions = tests.filter((x) => x.test_questions);
	const submitted = useMemo(
		() =>
			participants
				.filter((p) => resultOf(p, t)?.test_submitted_at)
				.sort((a, b) => (testScore(t, resultOf(b, t)!) ?? 0) - (testScore(t, resultOf(a, t)!) ?? 0)),
		[participants, t],
	);
	return (
		<section className={s.card}>
			<div className={s.cardHead}>
				<div className={s.cardTitle}>
					Kết quả{withQuestions.length > 1 ? '' : ` — ${t.title}`} ({submitted.length})
				</div>
			</div>
			{withQuestions.length > 1 && (
				<div className={s.filterRow}>
					<div
						className={s.segment}
						role='group'
						aria-label='Chọn đề kiểm tra'
					>
						{withQuestions.map((x) => (
							<button
								key={x.id}
								type='button'
								aria-pressed={x.id === t.id}
								className={x.id === t.id ? s.segActive : undefined}
								onClick={() => onPick(x.id)}
							>
								{x.title}
							</button>
						))}
					</div>
				</div>
			)}
			<PersonList
				items={submitted}
				onOpen={onOpen}
				empty='Chưa có ai nộp bài.'
				right={(p) => (
					<TestResultCell
						t={t}
						r={resultOf(p, t)}
					/>
				)}
			/>
		</section>
	);
}

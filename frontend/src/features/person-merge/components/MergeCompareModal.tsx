import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { InlineLoading } from '../../../shared/components/Loading/Skeleton';
import { Modal } from '../../../shared/components/Modal';
import { formatDateTimeVN, formatDateVN } from '../../../shared/utils/formatDate';
import { genderLabel } from '../../../shared/utils/gender';
import { getMergeCandidate } from '../api/personMergeApi';
import {
	type FieldChoice,
	type MergeCandidateDetail,
	type MergeField,
	MERGE_FIELDS,
	type PersonSummary,
	REASON_LABEL,
	REASON_TONE,
	type Side,
	SOURCE_LABEL,
} from '../types/personMerge.type';
import styles from './MergeCompareModal.module.css';

interface Props {
	id: number;
	busy: boolean;
	onClose: () => void;
	onMerge: (id: number, keep: Side, fields: FieldChoice, note?: string) => Promise<boolean>;
	onReject: (id: number, note?: string) => Promise<boolean>;
	onReopen: (id: number) => Promise<boolean>;
}

const FIELD_LABEL: Record<MergeField, string> = {
	full_name: 'Họ tên',
	date_of_birth: 'Ngày sinh',
	gender: 'Giới tính',
	national_id: 'CCCD',
	email: 'Email',
	phone: 'Số điện thoại',
	is_internal: 'Nội / ngoại viện',
};

const fieldValue = (p: PersonSummary, f: MergeField): string | null => {
	switch (f) {
		case 'date_of_birth':
			return p.date_of_birth ? formatDateVN(p.date_of_birth) : null;
		case 'is_internal':
			return p.is_internal == null ? null : p.is_internal ? 'Nội viện' : 'Ngoài viện';
		case 'gender':
			return genderLabel(p.gender);
		default:
			return (p[f] as string | null) || null;
	}
};

// Gợi ý hồ sơ giữ lại: ưu tiên hồ sơ có tài khoản → đã xác thực → nhiều bản ghi liên quan hơn → A.
const suggestKeep = (c: MergeCandidateDetail): Side => {
	if (c.a.has_account !== c.b.has_account) return c.a.has_account ? 'A' : 'B';
	if (c.a.is_verified !== c.b.is_verified) return c.a.is_verified ? 'A' : 'B';
	if (c.a.ref_count !== c.b.ref_count) return c.a.ref_count > c.b.ref_count ? 'A' : 'B';
	return 'A';
};

const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

const INFO_ROWS: [string, (p: PersonSummary) => string][] = [
	['Tài khoản đăng nhập', (p) => (p.has_account ? 'Có' : 'Không')],
	['Đã xác thực', (p) => (p.is_verified ? 'Có' : 'Chưa')],
	['Tạo từ', (p) => (p.origin_table ? (SOURCE_LABEL[p.origin_table] ?? p.origin_table) : 'Nhập từ ứng dụng')],
	['Ngày tạo', (p) => formatDateTimeVN(p.created_at)],
];

export function MergeCompareModal({ id, busy, onClose, onMerge, onReject, onReopen }: Props) {
	const [cand, setCand] = useState<MergeCandidateDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [keep, setKeep] = useState<Side>('A');
	const [picked, setPicked] = useState<Partial<Record<MergeField, Side>>>({});
	const [note, setNote] = useState('');
	const [confirming, setConfirming] = useState(false);

	useEffect(() => {
		// Trang cha mount lại modal theo key={id} nên state luôn khởi tạo sạch, không cần reset ở đây.
		let alive = true;
		getMergeCandidate(id)
			.then((c) => {
				if (!alive) return;
				setCand(c);
				setKeep(suggestKeep(c));
			})
			.catch((e) => {
				if (alive) setError(e instanceof Error ? e.message : 'Không tải được chi tiết');
			});
		return () => {
			alive = false;
		};
	}, [id]);

	// Giá trị đang được chọn cho từng trường: người dùng bấm thì theo bấm; chưa bấm thì lấy của hồ sơ
	// giữ lại, trống thì lấy của hồ sơ kia — khớp với mặc định phía server.
	const effectiveSide = useMemo(() => {
		const out = {} as Record<MergeField, Side>;
		if (!cand) return out;
		const k = keep === 'A' ? cand.a : cand.b;
		const o = keep === 'A' ? cand.b : cand.a;
		for (const f of MERGE_FIELDS) {
			out[f] = picked[f] ?? (fieldValue(k, f) != null ? keep : fieldValue(o, f) != null ? other(keep) : keep);
		}
		return out;
	}, [cand, keep, picked]);

	const buildFields = (): FieldChoice => {
		const out: FieldChoice = {};
		for (const f of MERGE_FIELDS) out[f] = effectiveSide[f] === keep ? 'keep' : 'lose';
		return out;
	};

	const isPending = cand?.status === 'PENDING';
	const canMerge = !!cand && isPending && cand.blockers.length === 0;
	const keeper = cand ? (keep === 'A' ? cand.a : cand.b) : null;
	const loser = cand ? (keep === 'A' ? cand.b : cand.a) : null;

	const renderSide = (s: Side) => {
		if (!cand) return null;
		const p = s === 'A' ? cand.a : cand.b;
		const isKeep = keep === s;
		return (
			<div className={`${styles.sideHead} ${isKeep && isPending ? styles.sideHeadKeep : ''}`}>
				<div className={styles.sideTitle}>Hồ sơ {s}</div>
				<div className={styles.sideId}>{p.id}</div>
				{isPending && (
					<button
						type='button'
						className={`${styles.keepBtn} ${isKeep ? styles.keepBtnOn : ''}`}
						onClick={() => {
							setKeep(s);
							setConfirming(false);
						}}
					>
						{isKeep ? '✓ Giữ lại làm hồ sơ gốc' : 'Chọn làm hồ sơ gốc'}
					</button>
				)}
			</div>
		);
	};

	let footer: ReactNode;
	if (cand && isPending) {
		footer =
			confirming && canMerge && keeper && loser ? (
				<div className={styles.confirmBar}>
					<div className={styles.confirmText}>
						Gộp <b>{loser.full_name}</b> ({loser.id}) vào <b>{keeper.full_name}</b> ({keeper.id})? {loser.ref_count} bản ghi
						liên quan sẽ chuyển sang hồ sơ gốc. Thao tác <b>không thể hoàn tác trên giao diện</b> (có ghi nhật ký để khôi phục
						thủ công).
					</div>
					<div className={styles.btnRow}>
						<Button variant='secondary' onClick={() => setConfirming(false)} disabled={busy}>
							Quay lại
						</Button>
						<Button variant='danger' loading={busy} onClick={() => void onMerge(id, keep, buildFields(), note.trim() || undefined)}>
							Xác nhận gộp
						</Button>
					</div>
				</div>
			) : (
				<div className={styles.btnRow}>
					<Button variant='ghost' onClick={onClose} disabled={busy}>
						Để sau
					</Button>
					<Button variant='secondary' loading={busy} onClick={() => void onReject(id, note.trim() || undefined)}>
						Không phải cùng người
					</Button>
					<Button disabled={!canMerge || busy} onClick={() => setConfirming(true)}>
						Gộp hai hồ sơ
					</Button>
				</div>
			);
	} else if (cand && cand.status === 'REJECTED') {
		footer = (
			<div className={styles.btnRow}>
				<Button variant='ghost' onClick={onClose} disabled={busy}>
					Đóng
				</Button>
				<Button variant='secondary' loading={busy} onClick={() => void onReopen(id)}>
					Đưa lại vào hàng đợi
				</Button>
			</div>
		);
	} else if (cand) {
		footer = (
			<div className={styles.btnRow}>
				<Button variant='ghost' onClick={onClose}>
					Đóng
				</Button>
			</div>
		);
	}

	return (
		<Modal open onClose={onClose} title={cand ? `Đối chiếu hai hồ sơ #${cand.id}` : 'Đối chiếu hai hồ sơ'} size='xl' footer={footer}>
			{error ? (
				<div className={styles.alertError}>{error}</div>
			) : !cand ? (
				<InlineLoading />
			) : (
				<div className={styles.wrap}>
					<div className={styles.topRow}>
						<Badge tone={REASON_TONE[cand.reason]} dot>
							{REASON_LABEL[cand.reason]}
						</Badge>
						{cand.status !== 'PENDING' && (
							<span className={styles.metaText}>
								{cand.status === 'MERGED' ? 'Đã gộp' : 'Đã bỏ qua'}
								{cand.reviewed_by_name ? ` bởi ${cand.reviewed_by_name}` : ''}
								{cand.reviewed_at ? ` lúc ${formatDateTimeVN(cand.reviewed_at)}` : ''}
							</span>
						)}
						{cand.note && <span className={styles.metaText}>Ghi chú: {cand.note}</span>}
					</div>

					{isPending &&
						cand.blockers.map((b) => (
							<div key={b} className={styles.alertError}>
								{b}
							</div>
						))}
					{isPending &&
						cand.warnings.map((w) => (
							<div key={w} className={styles.alertWarn}>
								{w}
							</div>
						))}

					<div className={styles.compare}>
						<div className={styles.labelCol} />
						{renderSide('A')}
						{renderSide('B')}

						{MERGE_FIELDS.map((f) => {
							const va = fieldValue(cand.a, f);
							const vb = fieldValue(cand.b, f);
							const differs = va !== vb;
							const cell = (s: Side, v: string | null) => {
								const chosen = effectiveSide[f] === s;
								const selectable = isPending && differs && v != null;
								return (
									<button
										type='button'
										disabled={!selectable}
										className={`${styles.cell} ${selectable ? styles.cellSelectable : ''} ${
											isPending && chosen && differs ? styles.cellChosen : ''
										}`}
										onClick={() => {
											setPicked((p) => ({ ...p, [f]: s }));
											setConfirming(false);
										}}
									>
										{selectable && <span className={`${styles.radio} ${chosen ? styles.radioOn : ''}`} />}
										<span className={v == null ? styles.empty : ''}>{v ?? 'Trống'}</span>
									</button>
								);
							};
							return (
								<div className={`${styles.row} ${differs ? styles.rowDiff : ''}`} key={f}>
									<div className={styles.labelCol}>{FIELD_LABEL[f]}</div>
									{cell('A', va)}
									{cell('B', vb)}
								</div>
							);
						})}

						<div className={styles.rowSplit} />
						{INFO_ROWS.map(([label, fn]) => (
							<div className={styles.row} key={label}>
								<div className={styles.labelCol}>{label}</div>
								<div className={styles.cellStatic}>{fn(cand.a)}</div>
								<div className={styles.cellStatic}>{fn(cand.b)}</div>
							</div>
						))}

						<div className={styles.row}>
							<div className={styles.labelCol}>Bản ghi liên quan</div>
							{(['A', 'B'] as Side[]).map((s) => {
								const recs = (s === 'A' ? cand.a : cand.b).records ?? [];
								return (
									<div className={styles.cellStatic} key={s}>
										{recs.length === 0 ? (
											<span className={styles.empty}>Không có</span>
										) : (
											<ul className={styles.recList}>
												{recs.map((r) => (
													<li key={`${r.source}:${r.ref_id}`}>
														<Badge tone='gray'>{SOURCE_LABEL[r.source] ?? r.source}</Badge>
														<span className={styles.recLabel} title={r.label}>
															{r.label}
														</span>
													</li>
												))}
											</ul>
										)}
									</div>
								);
							})}
						</div>
					</div>

					{isPending && (
						<label className={styles.noteBox}>
							<span>Ghi chú (không bắt buộc)</span>
							<textarea
								maxLength={500}
								value={note}
								placeholder='Ví dụ: đã đối chiếu CCCD / xác nhận qua khoa…'
								onChange={(e) => setNote(e.target.value)}
							/>
						</label>
					)}
				</div>
			)}
		</Modal>
	);
}

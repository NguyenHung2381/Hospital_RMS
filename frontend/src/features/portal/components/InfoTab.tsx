import type { SimpleItem } from '../../topics/api/topicApi';
import type { Topic } from '../../topics/types/topic.type';
import { lookup } from '../../topics/utils/topicHelpers';
import { Badge } from '@/shared/components';
import styles from '../pages/TopicDetail.module.css';
import { fmtDate } from '../services/topicDetailService';
import type { InfoForm } from '../types/topicDetail.type';
import { STATUS_CFG } from '../types/topicDetail.type';

type Meta = {
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
};

type Props = {
	topic: Topic;
	meta: Meta;
	canEditTitle: boolean;
	canEditInfo: boolean;
	editingInfo: boolean;
	setEditingInfo: (v: boolean) => void;
	infoForm: InfoForm;
	setInfoForm: React.Dispatch<React.SetStateAction<InfoForm>>;
	savingInfo: boolean;
	infoErr: string;
	startEditInfo: () => void;
	handleSaveInfo: () => void;
};

export default function InfoTab({
	topic,
	meta,
	canEditTitle,
	canEditInfo,
	editingInfo,
	setEditingInfo,
	infoForm,
	setInfoForm,
	savingInfo,
	infoErr,
	startEditInfo,
	handleSaveInfo,
}: Props) {
	const statusCfg = STATUS_CFG[topic.status] ?? STATUS_CFG.submitted;

	if (editingInfo) {
		return (
			<div className={styles.infoEditForm}>
				<div>
					<label className={styles.infoLabel}>Tên đề tài *</label>
					<input
						className={styles.formInput}
						value={infoForm.title}
						disabled={!canEditTitle}
						onChange={(e) =>
							setInfoForm((f) => ({ ...f, title: e.target.value }))
						}
					/>
				</div>
				<div className={styles.infoEditRow}>
					<div style={{ flex: 1 }}>
						<label className={styles.infoLabel}>Cấp độ</label>
						<select
							className={styles.formInput}
							value={infoForm.level_id}
							disabled={!canEditInfo}
							onChange={(e) =>
								setInfoForm((f) => ({ ...f, level_id: e.target.value }))
							}
						>
							<option value=''>— Chọn cấp độ —</option>
							{meta.levels.map((l) => (
								<option
									key={l.id}
									value={l.id}
								>
									{l.name}
								</option>
							))}
						</select>
					</div>
					<div style={{ flex: 1 }}>
						<label className={styles.infoLabel}>Phân loại</label>
						<select
							className={styles.formInput}
							value={infoForm.category_id}
							disabled={!canEditInfo}
							onChange={(e) =>
								setInfoForm((f) => ({ ...f, category_id: e.target.value }))
							}
						>
							<option value=''>— Chọn phân loại —</option>
							{meta.categories.map((c) => (
								<option
									key={c.id}
									value={c.id}
								>
									{c.name}
								</option>
							))}
						</select>
					</div>
				</div>
				<div>
					<label className={styles.infoLabel}>Mô tả / Tóm tắt</label>
					<textarea
						className={styles.formInput}
						rows={4}
						style={{ resize: 'vertical' }}
						value={infoForm.description}
						disabled={!canEditInfo}
						onChange={(e) =>
							setInfoForm((f) => ({ ...f, description: e.target.value }))
						}
					/>
				</div>
				{infoErr && <p className={styles.infoEditErr}>{infoErr}</p>}
				<div className={styles.infoEditActions}>
					<button
						className={styles.btnPrimary}
						onClick={handleSaveInfo}
						disabled={savingInfo}
					>
						{savingInfo ? 'Đang lưu...' : 'Lưu thay đổi'}
					</button>
					<button
						className={styles.btnSecondary}
						onClick={() => setEditingInfo(false)}
						disabled={savingInfo}
					>
						Huỷ
					</button>
				</div>
			</div>
		);
	}

	const round = lookup(meta.rounds, topic.round_id);
	const department = lookup(meta.departments, topic.department_id);
	const level = lookup(meta.levels, topic.level_id);
	const category = lookup(meta.categories, topic.category_id);
	const progress = topic.progress ?? 0;

	return (
		<>
			{/* Hero — catalog-style intro */}
			<header className={styles.hero}>
				<div className={styles.heroMeta}>
					<span className={styles.topicId}>{topic.id}</span>
					<Badge
						tone={statusCfg.tone}
						dot
					>
						{statusCfg.label}
					</Badge>
				</div>
				<h2 className={styles.heroTitle}>{topic.title}</h2>
				<p className={styles.heroCaption}>
					{round || '—'}
					{department ? ` · ${department}` : ''}
				</p>
				<p className={styles.heroSub}>
					Đăng ký ngày {fmtDate(topic.created_at)}
				</p>
			</header>

			{/* Key facts */}
			<div className={styles.factStrip}>
				<div className={styles.fact}>
					<div className={styles.factLabel}>Cấp độ</div>
					<div className={styles.factValue}>{level || '—'}</div>
				</div>
				<div className={styles.fact}>
					<div className={styles.factLabel}>Phân loại</div>
					<div className={styles.factValue}>{category || '—'}</div>
				</div>
				<div className={styles.fact}>
					<div className={styles.factLabel}>Thành viên</div>
					<div className={styles.factValue}>{topic.member_count ?? 0} người</div>
				</div>
				<div className={styles.fact}>
					<div className={styles.factLabel}>Tiến độ</div>
					<div className={styles.factValue}>{progress}%</div>
					<div className={styles.factBar}>
						<div
							className={styles.factBarFill}
							style={{ width: `${progress}%` }}
						/>
					</div>
				</div>
			</div>

			{topic.description && (
				<div className={styles.descSection}>
					<div className={styles.descLabel}>Giới thiệu đề tài</div>
					<div className={styles.descBox}>{topic.description}</div>
				</div>
			)}

			{(canEditTitle || canEditInfo) && (
				<div style={{ marginTop: 20 }}>
					<button
						className={styles.btnSecondary}
						onClick={startEditInfo}
					>
						Chỉnh sửa thông tin
					</button>
				</div>
			)}
		</>
	);
}

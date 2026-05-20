import type { SimpleItem } from '../../topics/api/topicApi';
import type { Topic } from '../../topics/types/topic.type';
import { lookup } from '../../topics/utils/topicHelpers';
import styles from '../pages/TopicDetail.module.css';
import { fmtDate } from '../services/topicDetailService';
import type { InfoForm } from '../types/topicDetail.type';
import { STATUS_CFG } from '../types/topicDetail.type';
import InfoField from './InfoField';

type Meta = {
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
};

type Props = {
	topic: Topic;
	meta: Meta;
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
							onChange={(e) =>
								setInfoForm((f) => ({ ...f, level_id: e.target.value }))
							}
						>
							<option value=''>— Chọn cấp độ —</option>
							{meta.levels.map((l) => (
								<option key={l.id} value={l.id}>
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
							onChange={(e) =>
								setInfoForm((f) => ({ ...f, category_id: e.target.value }))
							}
						>
							<option value=''>— Chọn phân loại —</option>
							{meta.categories.map((c) => (
								<option key={c.id} value={c.id}>
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
						onChange={(e) =>
							setInfoForm((f) => ({ ...f, description: e.target.value }))
						}
					/>
				</div>
				{infoErr && (
					<p className={styles.infoEditErr}>{infoErr}</p>
				)}
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

	return (
		<>
			{/* Progress bar */}
			<div className={styles.progressBlock}>
				<div className={styles.progressBlockLabel}>
					Tiến độ hoàn thành
					<span className={styles.progressBlockValue}>{topic.progress ?? 0}%</span>
				</div>
				<div className={styles.progressBar}>
					<div
						className={styles.progressFill}
						style={{ width: `${topic.progress ?? 0}%` }}
					/>
				</div>
			</div>

			<div className={styles.infoGrid}>
				<InfoField
					label='Đợt nghiên cứu'
					value={lookup(meta.rounds, topic.round_id) || '—'}
					color='#3b82f6'
				/>
				<InfoField
					label='Phòng ban / Khoa'
					value={lookup(meta.departments, topic.department_id) || '—'}
					color='#8b5cf6'
				/>
				<InfoField
					label='Cấp độ'
					value={lookup(meta.levels, topic.level_id) || '—'}
					color='#f59e0b'
				/>
				<InfoField
					label='Phân loại'
					value={lookup(meta.categories, topic.category_id) || '—'}
					color='#14b8a6'
				/>
				<InfoField
					label='Mã số đề tài'
					value={topic.id}
					color='#10b981'
				/>
				<InfoField
					label='Ngày đăng ký'
					value={fmtDate(topic.created_at)}
					color='#6366f1'
				/>
				<InfoField
					label='Số thành viên'
					value={`${topic.member_count ?? 0} người`}
					color='#f43f5e'
				/>
				<InfoField
					label='Trạng thái'
					value={statusCfg.label}
					color={statusCfg.dot}
				/>
			</div>
			{topic.description && (
				<div className={styles.descSection}>
					<div className={styles.descLabel}>Mô tả / Tóm tắt</div>
					<div className={styles.descBox}>{topic.description}</div>
				</div>
			)}
			{canEditInfo && (
				<div style={{ marginTop: 16 }}>
					<button className={styles.btnSecondary} onClick={startEditInfo}>
						Chỉnh sửa thông tin
					</button>
				</div>
			)}
		</>
	);
}

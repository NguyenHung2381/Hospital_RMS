import type { ReactNode } from 'react';
import { Modal } from '@/shared/components';
import { cx } from '@/shared/utils/cx';
import type { SimpleItem } from '../api/topicApi';
import type { PendingMember } from '../hooks/useTopicModal';
import { useTopicModal } from '../hooks/useTopicModal';
import styles from '../pages/Topic.module.css';
import s from './TopicModal.module.css';
import type { ArticleType, Topic, TopicForm, TopicStatus } from '../types/topic.type';
import { ACCEPTANCE_RATING_CFG, ACCEPTANCE_RATINGS, STATUS_CFG } from '../utils/topicHelpers';
import { ARTICLE_TYPE_CFG } from '../utils/topicRegisterHelpers';
import { FormField } from '@/shared/components/Input/FormField';
import { CfgField, CfgVisible } from '@/shared/formConfig/CfgField';
import { CustomFields } from '@/shared/formConfig/CustomFields';
import { AlertSvg as IcAlert, CheckSvg as IcCheck, PlusSvg as IcPlus } from '@/assets/icons';
import { ModalMembersSection } from './ModalMembersSection';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';
import { DatePicker } from '../../../shared/components/Input/DatePicker';
import { Toggle } from '../../../shared/components/Input/Toggle';

export type { PendingMember };

interface TopicModalProps {
	mode: 'create' | 'edit';
	topic?: Topic;
	categories: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
	onSave: (form: TopicForm, members: PendingMember[]) => Promise<void>;
}

const TITLE_MAX = 500;
const DESC_MAX = 2000;

/** Khối thông tin có tiêu đề (thanh màu bên trái) + chú thích phụ bên phải. */
function Section({ title, hint, badge, children }: { title: string; hint?: ReactNode; badge?: ReactNode; children: ReactNode }) {
	return (
		<section className={s.section}>
			<div className={s.sectionHead}>
				<span className={s.sectionTitle}>{title}</span>
				{badge}
				{hint && <span className={s.sectionHint}>{hint}</span>}
			</div>
			{children}
		</section>
	);
}

/** "50.000.000 ₫" — rỗng khi chưa nhập. */
const formatVnd = (v: string) => (v === '' || isNaN(Number(v)) ? '' : `${Number(v).toLocaleString('vi-VN')} ₫`);

export function TopicModal({
	mode,
	topic,
	categories,
	rounds,
	departments,
	onClose,
	onSave,
}: TopicModalProps) {
	const m = useTopicModal({ mode, topic, departments, onSave });
	// Giới hạn độ dài / gợi ý theo Cấu hình form (ô có bộ đếm ký tự nên truyền tay)
	const maxLen = (key: string, fallback: number) => Math.min(m.cfg.field(key)?.rules.maxLength ?? fallback, fallback);
	const ph = (key: string, fallback: string) => m.cfg.field(key)?.placeholder ?? fallback;
	const titleMax = maxLen('title', TITLE_MAX);
	const descMax = maxLen('description', DESC_MAX);
	// Lựa chọn select bị admin thu hẹp
	const allowed = (key: string, value: string) => {
		const options = m.cfg.field(key)?.options;
		return !options || options.some((o) => o.value === value);
	};
	// Giữ lựa chọn đang có của bản ghi dù admin đã bỏ khỏi danh sách
	const articleTypes = (Object.keys(ARTICLE_TYPE_CFG) as ArticleType[]).filter(
		(t) => t === m.form.article_type || allowed('article_type', t),
	);
	const acceptanceRatings = ACCEPTANCE_RATINGS.filter(
		(r) => r === m.form.acceptance_rating || allowed('acceptance_rating', r),
	);
	const isTopic = m.form.article_type === 'de_tai';
	// Admin bật bắt buộc ở Cấu hình form ⇒ bỏ nhãn "Không bắt buộc" của nhóm
	const finRequired = [
		'budget_estimated',
		'budget_actual',
		'approval_decision_no',
		'approval_decision_date',
		'recognition_decision_no',
		'recognition_decision_date',
	].some((k) => m.cfg.required(k) && (mode === 'edit' || !m.cfg.field(k)?.editOnly));
	const levelName = m.form.round_id ? rounds.find((r) => r.id === m.form.round_id)?.level_name : undefined;

	const moneyField = (key: 'budget_estimated' | 'budget_actual', label: string, placeholder: string) => (
		<CfgField
			cfg={m.cfg}
			name={key}
			htmlFor={key}
			label={label}
			error={m.errors[key]}
		>
			<div className={s.affix}>
				<input
					id={key}
					type='number'
					className={cx(s.input, m.errors[key] && s.hasError)}
					placeholder={m.cfg.field(key)?.placeholder ?? placeholder}
					min={m.cfg.field(key)?.rules.min ?? 0}
					max={m.cfg.field(key)?.rules.max}
					value={m.form[key]}
					onChange={(e) => m.setField(key, e.target.value)}
				/>
				<span className={s.affixText}>₫</span>
			</div>
			{m.form[key] && <div className={s.fieldFoot}>{formatVnd(m.form[key])}</div>}
		</CfgField>
	);

	return (
		<Modal
			open
			onClose={onClose}
			title={mode === 'create' ? 'Đăng ký đề tài mới' : 'Chỉnh sửa đề tài'}
			subtitle={mode === 'create' ? 'Tạo đề tài nghiên cứu khoa học mới' : `Cập nhật thông tin — ${topic?.id}`}
			size='lg'
			bodyClassName={s.body}
			footer={
				<>
					{m.saveError && (
						<span className={s.saveError}>
							<IcAlert /> {m.saveError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						className={styles.btnPrimary}
						onClick={m.handleSubmit}
						disabled={m.loading}
					>
						{m.loading ? (
							<>
								<span className={styles.spinner} />
								Đang lưu...
							</>
						) : mode === 'create' ? (
							<>
								<IcPlus />
								Đăng ký đề tài
								{m.pendingMembers.length > 0 ? ` (${m.pendingMembers.length} TV)` : ''}
							</>
						) : (
							<>
								<IcCheck />
								Lưu thay đổi
							</>
						)}
					</button>
				</>
			}
		>
			{/* ── Thông tin chung ── */}
			<Section title='Thông tin chung'>
				<CfgVisible
					cfg={m.cfg}
					name='article_type'
				>
					<div
						className={s.segmented}
						role='tablist'
						aria-label='Loại đăng ký'
					>
						{articleTypes.map((t) => (
							<button
								key={t}
								type='button'
								role='tab'
								aria-selected={m.form.article_type === t}
								className={cx(s.segment, m.form.article_type === t && s.segmentActive)}
								onClick={() => m.setField('article_type', t)}
							>
								{ARTICLE_TYPE_CFG[t].tabLabel}
							</button>
						))}
					</div>
				</CfgVisible>

				<CfgField
					cfg={m.cfg}
					name='title'
					htmlFor='title'
					label={isTopic ? 'Tên đề tài' : 'Tên bài báo / báo cáo'}
					required
					error={m.errors.title}
				>
					<textarea
						id='title'
						className={cx(s.textarea, m.errors.title && s.hasError)}
						placeholder={ph('title', 'Nhập tên đầy đủ...')}
						value={m.form.title}
						onChange={(e) => m.setField('title', e.target.value)}
						rows={2}
						maxLength={titleMax}
					/>
					<div className={s.fieldFoot}>
						<span>
							{m.form.title.length}/{titleMax}
						</span>
					</div>
				</CfgField>

				<CfgField
					cfg={m.cfg}
					name='description'
					htmlFor='description'
					label='Mô tả / Tóm tắt'
					error={m.errors.description}
				>
					<textarea
						id='description'
						className={s.textarea}
						placeholder={ph('description', 'Mục tiêu, phương pháp, kết quả dự kiến...')}
						value={m.form.description}
						onChange={(e) => m.setField('description', e.target.value)}
						rows={3}
						maxLength={descMax}
					/>
					<div className={s.fieldFoot}>
						<span>
							{m.form.description.length}/{descMax}
						</span>
					</div>
				</CfgField>
			</Section>

			{/* ── Phân loại ── */}
			<Section title='Phân loại & đơn vị'>
				<div className={s.grid2}>
					<CfgField
						cfg={m.cfg}
						name='round_id'
						htmlFor='round_id'
						label='Đợt nghiên cứu'
						required
						error={m.errors.round_id}
					>
						<select
							id='round_id'
							className={cx(s.select, m.errors.round_id && s.hasError)}
							value={m.form.round_id}
							onChange={(e) => m.setField('round_id', e.target.value)}
						>
							<option value=''>— Chọn đợt —</option>
							{rounds.map((r) => (
								<option
									key={r.id}
									value={r.id}
								>
									{r.name}
								</option>
							))}
						</select>
					</CfgField>
					<CfgField
						cfg={m.cfg}
						name='category_id'
						htmlFor='category_id'
						label='Phân loại'
						required
						error={m.errors.category_id}
					>
						<select
							id='category_id'
							className={cx(s.select, m.errors.category_id && s.hasError)}
							value={m.form.category_id}
							onChange={(e) => m.setField('category_id', e.target.value)}
						>
							<option value=''>— Chọn phân loại —</option>
							{categories.map((c) => (
								<option
									key={c.id}
									value={c.id}
								>
									{c.name}
								</option>
							))}
						</select>
					</CfgField>

					{isTopic && (
						<FormField label='Cấp độ đề tài'>
							{/* Mỗi đợt 1 cấp độ — server tự gán theo đợt, đổi ở trang Đợt nghiên cứu */}
							<div className={s.readonly}>
								{m.form.round_id ? (
									levelName ?? <span className={s.readonlyMuted}>Đợt chưa cấu hình cấp độ</span>
								) : (
									<span className={s.readonlyMuted}>Chọn đợt để xem cấp độ</span>
								)}
								<span className={s.readonlyTag}>theo đợt</span>
							</div>
						</FormField>
					)}
					<CfgField
						cfg={m.cfg}
						name='department_id'
						htmlFor='department_id'
						label='Khoa/phòng'
						required
						error={m.errors.department_id}
						style={isTopic ? undefined : { gridColumn: '1 / -1' }}
					>
						<SearchableSelect
							id='department_id'
							options={departments}
							value={m.form.department_id}
							onChange={(id) => m.setField('department_id', id)}
							placeholder='— Chọn khoa/phòng —'
							hasError={!!m.errors.department_id}
						/>
					</CfgField>
				</div>
			</Section>

			{/* ── Bài báo ── */}
			{!isTopic && (
				<Section title='Thông tin xuất bản'>
					<CfgField
						cfg={m.cfg}
						name='journal_name'
						htmlFor='journal_name'
						label='Tên tập san / hội nghị'
						error={m.errors.journal_name}
					>
						<input
							id='journal_name'
							className={s.input}
							placeholder='VD: Tạp chí Y học Việt Nam'
							value={m.form.journal_name}
							onChange={(e) => m.setField('journal_name', e.target.value)}
						/>
					</CfgField>
					<div className={s.grid2}>
						<CfgField
							cfg={m.cfg}
							name='doi'
							htmlFor='doi'
							label='DOI (nếu có)'
							error={m.errors.doi}
						>
							<input
								id='doi'
								className={s.input}
								placeholder='VD: 10.1234/abcd.2026'
								value={m.form.doi}
								onChange={(e) => m.setField('doi', e.target.value)}
							/>
						</CfgField>
						<CfgField
							cfg={m.cfg}
							name='publish_date'
							htmlFor='publish_date'
							label='Ngày xuất bản'
							error={m.errors.publish_date}
						>
							<DatePicker
								id='publish_date'
								value={m.form.publish_date}
								onChange={(val) => m.setField('publish_date', val)}
								placeholder='Chọn ngày xuất bản...'
							/>
						</CfgField>
					</div>
				</Section>
			)}

			{/* ── Tài chính & quyết định ── */}
			{isTopic && (
				<Section
					title='Kinh phí & quyết định'
					hint={finRequired ? undefined : 'Không bắt buộc'}
				>
					<div className={s.grid2}>
						{moneyField('budget_estimated', 'Kinh phí dự toán', 'VD: 50000000')}
						{mode === 'edit' && moneyField('budget_actual', 'Kinh phí thực tế', 'VD: 48500000')}
					</div>

					{mode === 'edit' && (
						<>
							<div className={s.grid2}>
								<CfgField
									cfg={m.cfg}
									name='approval_decision_no'
									htmlFor='approval_decision_no'
									label='Số QĐ phê duyệt'
									error={m.errors.approval_decision_no}
								>
									<input
										id='approval_decision_no'
										className={s.input}
										placeholder='VD: 123/QĐ-BV'
										value={m.form.approval_decision_no}
										onChange={(e) => m.setField('approval_decision_no', e.target.value)}
									/>
								</CfgField>
								<CfgField
									cfg={m.cfg}
									name='approval_decision_date'
									htmlFor='approval_decision_date'
									label='Ngày QĐ phê duyệt'
									error={m.errors.approval_decision_date}
								>
									<DatePicker
										id='approval_decision_date'
										value={m.form.approval_decision_date}
										onChange={(val) => m.setField('approval_decision_date', val)}
										placeholder='Chọn ngày...'
									/>
								</CfgField>
							</div>
							<div className={s.grid2}>
								<CfgField
									cfg={m.cfg}
									name='recognition_decision_no'
									htmlFor='recognition_decision_no'
									label='Số QĐ công nhận'
									error={m.errors.recognition_decision_no}
								>
									<input
										id='recognition_decision_no'
										className={s.input}
										placeholder='VD: 456/QĐ-BV'
										value={m.form.recognition_decision_no}
										onChange={(e) => m.setField('recognition_decision_no', e.target.value)}
									/>
								</CfgField>
								<CfgField
									cfg={m.cfg}
									name='recognition_decision_date'
									htmlFor='recognition_decision_date'
									label='Ngày QĐ công nhận'
									error={m.errors.recognition_decision_date}
								>
									<DatePicker
										id='recognition_decision_date'
										value={m.form.recognition_decision_date}
										onChange={(val) => m.setField('recognition_decision_date', val)}
										placeholder='Chọn ngày...'
									/>
								</CfgField>
							</div>
						</>
					)}
				</Section>
			)}

			{/* ── Nghiệm thu ── */}
			{isTopic && mode === 'edit' && (
				<Section
					title='Kết quả nghiệm thu'
					badge={topic?.is_legacy ? <span className={s.legacyBadge}>Đề tài nhập bổ sung</span> : undefined}
					hint='Bỏ trống nếu chưa nghiệm thu'
				>
					<div className={s.grid3}>
						<CfgField
							cfg={m.cfg}
							name='acceptance_rating'
							htmlFor='acceptance_rating'
							label='Xếp loại'
							error={m.errors.acceptance_rating}
						>
							<select
								id='acceptance_rating'
								className={s.select}
								value={m.form.acceptance_rating}
								onChange={(e) => m.setField('acceptance_rating', e.target.value as TopicForm['acceptance_rating'])}
							>
								<option value=''>— Chưa nghiệm thu —</option>
								{acceptanceRatings.map((r) => (
									<option
										key={r}
										value={r}
									>
										{ACCEPTANCE_RATING_CFG[r].label}
									</option>
								))}
							</select>
						</CfgField>
						<CfgField
							cfg={m.cfg}
							name='acceptance_score'
							htmlFor='acceptance_score'
							label='Điểm (0–100)'
							error={m.errors.acceptance_score}
						>
							<input
								id='acceptance_score'
								type='number'
								min={0}
								max={100}
								step={0.01}
								className={s.input}
								placeholder='VD: 85'
								value={m.form.acceptance_score}
								onChange={(e) => m.setField('acceptance_score', e.target.value)}
							/>
						</CfgField>
						<CfgField
							cfg={m.cfg}
							name='acceptance_date'
							htmlFor='acceptance_date'
							label='Ngày nghiệm thu'
							error={m.errors.acceptance_date}
						>
							<DatePicker
								id='acceptance_date'
								value={m.form.acceptance_date}
								onChange={(val) => m.setField('acceptance_date', val)}
								placeholder='Chọn ngày...'
								align='right'
							/>
						</CfgField>
					</div>
				</Section>
			)}

			{/* ── Trường tùy chỉnh (trang Cấu hình form) ── */}
			{m.cfg.custom.length > 0 && (
				<Section title='Thông tin bổ sung'>
					<CustomFields
						cfg={m.cfg}
						value={m.custom}
						onChange={m.setCustom}
						errors={m.errors}
						title={null}
						inputClassName={s.input}
					/>
				</Section>
			)}

			{/* ── Trạng thái ── */}
			<Section title='Trạng thái đề tài'>
				<div
					className={s.statusGroup}
					role='radiogroup'
					aria-label='Trạng thái đề tài'
				>
					{(Object.keys(STATUS_CFG) as TopicStatus[]).map((st) => {
						const active = m.form.status === st;
						return (
							<button
								key={st}
								type='button'
								role='radio'
								aria-checked={active}
								className={cx(s.statusChip, s[`tone_${STATUS_CFG[st].tone}`], active && s.statusChipActive)}
								onClick={() => m.setField('status', st)}
							>
								<span className={s.statusDot} />
								{STATUS_CFG[st].label}
							</button>
						);
					})}
				</div>

				{mode === 'edit' && m.form.status === 'approved' && (
					<div className={s.featureRow}>
						<div className={s.featureText}>
							<div className={s.featureTitle}>Đưa vào Thư viện đề tài</div>
							<div className={s.featureSub}>Hiển thị đề tài này trên trang công khai "Thư viện đề tài"</div>
						</div>
						<Toggle
							on={m.form.is_featured}
							onChange={m.toggleFeatured}
							title='Đưa vào Thư viện đề tài'
						/>
					</div>
				)}
			</Section>

			{mode === 'create' && (
				<section className={s.section}>
					<ModalMembersSection
						departments={departments}
						pendingMembers={m.pendingMembers}
						memberQuery={m.memberQuery}
						setMemberQuery={m.setMemberQuery}
						suggestions={m.suggestions}
						isSearching={m.isSearching}
						showSuggestions={m.showSuggestions}
						setShowSuggestions={m.setShowSuggestions}
						addRole={m.addRole}
						setAddRole={m.setAddRole}
						isManualAdd={m.isManualAdd}
						setIsManualAdd={m.setIsManualAdd}
						closeManualAdd={m.closeManualAdd}
						manualForm={m.manualForm}
						setManualForm={m.setManualForm}
						manualRole={m.manualRole}
						setManualRole={m.setManualRole}
						manualError={m.manualError}
						deptName={m.deptName}
						selectUser={m.selectUser}
						addManual={m.addManual}
						removeMember={m.removeMember}
						changeRole={m.changeRole}
					/>
				</section>
			)}
		</Modal>
	);
}

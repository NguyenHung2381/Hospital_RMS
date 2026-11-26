import { useState } from 'react';
import { Button } from '../../../shared/components';
import { cx } from '../../../shared/utils/cx';
import { notify } from '../../../shared/utils/feedback';
import { settingsApi, type SignatureKind, type SignatureKindConfig, type SignatureRules } from '../api/settingsApi';
import styles from '../pages/SystemSettings.module.css';
import ps from './SignatureRulesEditor.module.css';

const RULES_KEY = 'TRAINING_DOC_SIGNATURE_RULES';

// Thứ tự + nhãn + yêu cầu mặc định của từng loại (khớp backend signatureRules.SIGNATURE_REQUIREMENTS)
const KINDS: Array<{ key: SignatureKind; label: string; rule: string; reportOnly?: boolean }> = [
	{ key: 'decision', label: 'Quyết định cử đi học', rule: 'Chữ ký số hợp lệ, hoặc dấu đỏ + chữ ký tay' },
	{ key: 'proposal_approved', label: 'Tờ trình đã duyệt', rule: 'Chữ ký tay (dấu đỏ nếu có)' },
	{ key: 'license', label: 'Chứng chỉ hành nghề', rule: 'Dấu đỏ + chữ ký' },
	{ key: 'degree', label: 'Bằng tốt nghiệp', rule: 'Dấu đỏ + chữ ký' },
	{ key: 'trainee_document', label: 'Hồ sơ học viên tự nộp', rule: 'Chỉ báo có chữ ký số / dấu ở trang nào', reportOnly: true },
];

const CHECKS: Array<{ key: 'digital' | 'seal' | 'hand'; label: string }> = [
	{ key: 'digital', label: 'Chữ ký số' },
	{ key: 'seal', label: 'Dấu đỏ' },
	{ key: 'hand', label: 'Chữ ký tay' },
];

const OPTIONS: Array<{ key: keyof SignatureRules['options']; label: string; hint: string }> = [
	{
		key: 'warn_untrusted',
		label: 'Cảnh báo chữ ký số của CA lạ',
		hint: 'Chữ ký còn nguyên vẹn nhưng chứng thư không do CA trong danh sách tin cậy cấp. Tắt: coi như file không có chữ ký số.',
	},
	{
		key: 'org_match',
		label: 'So tổ chức người ký với đơn vị đã khai',
		hint: 'Cảnh báo khi tổ chức trong chứng thư người ký khác đơn vị công tác ghi trong đơn.',
	},
	{
		key: 'reprint_warning',
		label: 'Cảnh báo bản in lại',
		hint: 'PDF xuất từ máy có hình dấu đỏ mà không có chữ ký số — thường là bản in / xuất lại từ văn bản ký số.',
	},
	{
		key: 'ocr',
		label: 'Dùng OCR tìm chức danh người ký',
		hint: 'Đọc dòng "Giám đốc", "Hiệu trưởng"… để biết vùng ký. Tắt: chỉ dò mực xanh — nhanh hơn nhưng không kết luận được thiếu chữ ký tay.',
	},
];

const DEFAULT_KIND: SignatureKindConfig = { enabled: true, digital: true, seal: true, hand: true, on_missing: 'warn' };
const DEFAULT_RULES: SignatureRules = {
	kinds: Object.fromEntries(KINDS.map((k) => [k.key, { ...DEFAULT_KIND }])) as SignatureRules['kinds'],
	options: { warn_untrusted: true, org_match: true, reprint_warning: true, ocr: true },
};

const same = (a: SignatureRules, b: SignatureRules) => JSON.stringify(a) === JSON.stringify(b);

/** Mục vừa được bật (tắt → bật) — file đã kiểm trước đó chưa có dữ liệu mục này, cần kiểm lại. */
const newlyEnabled = (before: SignatureRules, after: SignatureRules) =>
	KINDS.some(({ key }) => {
		const a = before.kinds[key];
		const b = after.kinds[key];
		const on = (c: SignatureKindConfig, m: 'digital' | 'seal' | 'hand') => c.enabled && c[m];
		return CHECKS.some(({ key: m }) => on(b, m) && !on(a, m));
	}) ||
	(after.options.ocr && !before.options.ocr);

function MiniSwitch({
	id,
	label,
	checked,
	disabled,
	onChange,
}: {
	id: string;
	label: string;
	checked: boolean;
	disabled?: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<label className={cx(styles.switch, ps.miniSwitch)} htmlFor={id}>
			<input id={id} type='checkbox' role='switch' aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
			<span className={cx(styles.track, styles.trackSm)} />
		</label>
	);
}

/**
 * Cấu hình chi tiết kiểm chữ ký (TRAINING_DOC_SIGNATURE_RULES): bật/tắt theo loại giấy tờ × mục kiểm
 * + tuỳ chọn chung. Sửa trên bản nháp, bấm Lưu mới ghi. Kết quả trên hồ sơ tính lại theo cấu hình
 * mới ngay; mục vừa bật cần "Kiểm lại chữ ký" vì lần kiểm cũ chưa chạy mục đó.
 */
export default function SignatureRulesEditor({
	rules,
	active,
	onSaved,
}: {
	/** Cấu hình đã lưu (backend đã chuẩn hoá) */
	rules: SignatureRules;
	/** Công tắc kiểm chữ ký đang bật (tắt thì vẫn sửa được, chỉ nhắc là chưa có tác dụng) */
	active: boolean;
	onSaved: () => void;
}) {
	const [draft, setDraft] = useState<SignatureRules>(rules);
	const [base, setBase] = useState<SignatureRules>(rules);
	const [saving, setSaving] = useState(false);
	const [rechecking, setRechecking] = useState(false);
	const [needRecheck, setNeedRecheck] = useState(false);

	// Cấu hình đã lưu đổi từ nơi khác (Làm mới) mà chưa sửa gì ⇒ theo bản mới
	if (!same(rules, base) && same(draft, base)) {
		setBase(rules);
		setDraft(rules);
	}

	const dirty = !same(draft, base);
	const setKind = (k: SignatureKind, patch: Partial<SignatureKindConfig>) =>
		setDraft((d) => ({ ...d, kinds: { ...d.kinds, [k]: { ...d.kinds[k], ...patch } } }));
	const setOption = (k: keyof SignatureRules['options'], v: boolean) => setDraft((d) => ({ ...d, options: { ...d.options, [k]: v } }));

	const save = async () => {
		setSaving(true);
		try {
			await settingsApi.update(RULES_KEY, JSON.stringify(draft));
			if (newlyEnabled(base, draft)) setNeedRecheck(true);
			setBase(draft);
			notify.success('Đã lưu cấu hình kiểm chữ ký');
			onSaved();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Không lưu được cấu hình');
		} finally {
			setSaving(false);
		}
	};

	const recheck = async () => {
		setRechecking(true);
		try {
			const r = await settingsApi.retryDocCheck('signature');
			notify.success(r.requeued ? `Đã đưa ${r.requeued} file vào hàng đợi kiểm lại chữ ký` : 'Không có file nào cần kiểm lại');
			setNeedRecheck(false);
			onSaved();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Không kiểm lại được');
		} finally {
			setRechecking(false);
		}
	};

	return (
		<section className={ps.wrap} aria-labelledby='sig-rules-title'>
			<div className={ps.head}>
				<h4 id='sig-rules-title' className={ps.title}>
					Kiểm chữ ký theo loại giấy tờ
				</h4>
				<p className={styles.hint}>
					Bật / tắt từng mục cho từng loại. Lưu xong, kết quả trên hồ sơ hiển thị theo cấu hình mới ngay.
					{!active && ' Công tắc "Kiểm tra chữ ký trên hồ sơ" đang tắt nên cấu hình này chưa có tác dụng.'}
				</p>
			</div>

			<div className={ps.tableWrap}>
				<table className={ps.table}>
					<thead>
						<tr>
							<th scope='col' className={ps.kindCol}>
								Loại giấy tờ
							</th>
							<th scope='col'>Kiểm</th>
							{CHECKS.map((c) => (
								<th scope='col' key={c.key}>
									{c.label}
								</th>
							))}
							<th scope='col'>Khi thiếu</th>
						</tr>
					</thead>
					<tbody>
						{KINDS.map((k) => {
							const c = draft.kinds[k.key];
							const off = !c.enabled;
							const noneChecked = c.enabled && !c.digital && !c.seal && !c.hand;
							return (
								<tr key={k.key} className={cx(off && ps.rowOff)}>
									<th scope='row' className={ps.kindCol}>
										<span className={ps.kindLabel}>{k.label}</span>
										<span className={ps.kindRule}>{noneChecked ? 'Chưa chọn mục kiểm nào — loại này sẽ không được kiểm.' : k.rule}</span>
									</th>
									<td>
										<MiniSwitch id={`sig-${k.key}`} label={`Kiểm chữ ký: ${k.label}`} checked={c.enabled} onChange={(v) => setKind(k.key, { enabled: v })} />
									</td>
									{CHECKS.map((m) => (
										<td key={m.key}>
											<MiniSwitch
												id={`sig-${k.key}-${m.key}`}
												label={`${m.label}: ${k.label}`}
												checked={c[m.key]}
												disabled={off}
												onChange={(v) => setKind(k.key, { [m.key]: v })}
											/>
										</td>
									))}
									<td>
										{k.reportOnly ? (
											<span className={ps.muted}>Chỉ báo</span>
										) : (
											<select
												className={cx(styles.input, ps.select)}
												aria-label={`Khi thiếu: ${k.label}`}
												value={c.on_missing}
												disabled={off}
												onChange={(e) => setKind(k.key, { on_missing: e.target.value === 'info' ? 'info' : 'warn' })}
											>
												<option value='warn'>Cảnh báo</option>
												<option value='info'>Chỉ ghi chú</option>
											</select>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<div className={ps.options}>
				{OPTIONS.map((o) => (
					<div key={o.key} className={ps.option}>
						<MiniSwitch id={`sig-opt-${o.key}`} label={o.label} checked={draft.options[o.key]} onChange={(v) => setOption(o.key, v)} />
						<div>
							<label className={ps.optionLabel} htmlFor={`sig-opt-${o.key}`}>
								{o.label}
							</label>
							<p className={styles.hint}>{o.hint}</p>
						</div>
					</div>
				))}
			</div>

			{needRecheck && (
				<p className={ps.recheckNote} role='status'>
					Vừa bật thêm mục kiểm: file đã kiểm trước đây chưa có kết quả mục đó (hồ sơ sẽ ghi "chưa kiểm"). Bấm Kiểm lại chữ ký để kiểm bổ sung.
				</p>
			)}

			<div className={ps.actions}>
				<Button variant='secondary' size='sm' loading={rechecking} onClick={recheck} title='Đưa mọi file thuộc các loại trên vào hàng đợi kiểm lại'>
					Kiểm lại chữ ký
				</Button>
				<span className={ps.spacer} />
				<Button variant='ghost' size='sm' disabled={same(draft, DEFAULT_RULES)} onClick={() => setDraft(DEFAULT_RULES)}>
					Về mặc định
				</Button>
				{dirty && (
					<Button variant='ghost' size='sm' onClick={() => setDraft(base)}>
						Hoàn tác
					</Button>
				)}
				<Button size='sm' loading={saving} disabled={!dirty} onClick={save}>
					Lưu cấu hình
				</Button>
			</div>
		</section>
	);
}

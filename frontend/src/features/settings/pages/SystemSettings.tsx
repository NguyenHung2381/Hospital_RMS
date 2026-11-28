import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { Button, Card, SearchInput } from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { cx } from '../../../shared/utils/cx';
import { saveBlob } from '../../../shared/utils/saveBlob';
import { ApiError } from '../../../shared/api/http';
import { DownloadSvg, EyeOffSvg, EyeSvg, InfoSvg, RefreshSvg, UploadSvg, WarnSvg } from '../../../assets/icons';
import { resetMenuConfig } from '../../../shared/hooks/useMenuConfig';
import { resetModules } from '../../../shared/hooks/useModules';
import { resetUploadPolicy } from '../../../shared/hooks/useUploadPolicy';
import { settingsApi } from '../api/settingsApi';
import styles from './SystemSettings.module.css';
import DocCheckPanel from '../components/DocCheckPanel';
import RecaptchaTestPanel from '../components/RecaptchaTestPanel';
import { AttendanceHelper, ClamavTestTool, HolidayPreview, MailTestTool } from '../components/SettingTools';
import { BankConnectTool } from '../components/BankConnectTool';
import {
	CATS,
	FIELDS,
	SECTIONS,
	buildBackup,
	displayValue,
	fold,
	parseBackup,
	parseMatrix,
	sectionFields,
	serializeMatrix,
	sectionOf,
	splitList,
	type Field,
	type Group,
	type Values,
} from '../config/sections';

export default function SystemSettings() {
	const [saved, setSaved] = useState<Values>({});
	const [form, setForm] = useState<Values>({});
	const [env, setEnv] = useState<Values>({}); // giá trị đang áp dụng từ .env khi chưa đặt qua UI
	const [params, setParams] = useSearchParams();
	const [query, setQuery] = useState('');
	const [showPass, setShowPass] = useState(false);
	const [hasSecret, setHasSecret] = useState<Record<string, boolean>>({}); // secret đã đặt (backend chỉ trả ••••••)
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	// Lỗi máy chủ trả về theo từng ô ở lần lưu gần nhất — xóa khi sửa lại ô đó
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
	const [reviewOpen, setReviewOpen] = useState(false); // danh sách thay đổi ở thanh lưu
	const importRef = useRef<HTMLInputElement>(null);

	// Tab nằm trên URL (?tab=mail) để F5 / gửi link vẫn mở đúng chỗ
	const tab = SECTIONS.some((s) => s.id === params.get('tab')) ? params.get('tab')! : SECTIONS[0].id;
	const [sub, setSub] = useState(0); // nhóm đang xem ở tab có thanh chọn (Menu hiển thị)
	const [activeGroup, setActiveGroup] = useState(0); // nhóm đang trong tầm nhìn — tô sáng mục lục
	const jumpLock = useRef(0); // id hẹn giờ khi vừa bấm mục lục — khác 0 thì tạm không tô theo cuộn
	const setTab = (id: string) => {
		setQuery('');
		setSub(0);
		setActiveGroup(0);
		setParams({ tab: id }, { replace: true });
		window.scrollTo({ top: 0 });
	};

	const load = () =>
		settingsApi
			.list()
			.then((rows) => {
				const v: Values = {};
				const e: Values = {};
				const secrets: Record<string, boolean> = {};
				for (const f of FIELDS) {
					const r = rows.find((x) => x.setting_key === f.key);
					if (f.type === 'bool') {
						v[f.key] = r?.effective === 'true' || r?.effective === 'false' ? r.effective : String(!!f.defaultOn);
					} else if (f.type === 'multi') {
						v[f.key] = r?.effective || f.defaultValue || '';
					} else {
						v[f.key] = r?.value ?? '';
						if (!r?.value && r?.effective) e[f.key] = r.effective;
					}
					if (f.type === 'password') secrets[f.key] = !!r?.has_value;
				}
				setHasSecret(secrets);
				setSaved(v);
				setForm(v);
				setEnv(e);
			})
			.catch(() => notify.error('Không thể tải cấu hình'))
			.finally(() => setLoading(false));

	useEffect(() => {
		load();
	}, []);

	const set = (key: string, value: string) => {
		setForm((p) => ({ ...p, [key]: value }));
		setServerErrors((p) => {
			if (!(key in p)) return p;
			const rest = { ...p };
			delete rest[key];
			return rest;
		});
	};
	const isDirty = (f: Field) => form[f.key] !== saved[f.key];
	const dirty = FIELDS.filter(isDirty);
	const on = (key: string) => saved[key] === 'true';

	const errorOf = (f: Field): string | null => {
		const v = (form[f.key] ?? '').trim();
		if (f.type === 'multi' && !v) return 'Chọn ít nhất 1 định dạng';
		if (f.type === 'number' && v) {
			const n = Number(v);
			if (!Number.isFinite(n)) return 'Phải là số';
			if (f.min !== undefined && n < f.min) return `Nhỏ nhất là ${f.min}`;
			if (f.max !== undefined && n > f.max) return `Lớn nhất là ${f.max}`;
		}
		return serverErrors[f.key] ?? null;
	};
	const invalid = dirty.filter((f) => errorOf(f));

	/** Mở đúng tab (và thanh chọn con) chứa ô f, cuộn tới ô đó. */
	const goTo = (f: Field) => {
		const s = sectionOf(f);
		if (!s) return;
		// setTab cuộn lên đầu trang — chỉ gọi khi thật sự đổi tab, kẻo đè mất lần cuộn tới ô bên dưới
		if (s.id !== tab || query) setTab(s.id);
		if (s.subtabs) setSub(Math.max(0, s.groups.findIndex((g) => g.fields.includes(f))));
		window.setTimeout(() => {
			const el = document.getElementById(f.key);
			if (!el) return;
			// Công tắc là input ẩn — cuộn tới khung của ô để thấy cả nhãn
			(el.closest('[class*="row"], [class*="cell"], [class*="tile"]') ?? el).scrollIntoView({ block: 'center' });
			el.focus({ preventScroll: true });
		}, 80);
	};

	const save = async () => {
		if (!dirty.length || saving) return;
		if (invalid.length) {
			if (!query) goTo(invalid[0]);
			return notify.error(`${invalid[0].label}: ${errorOf(invalid[0])}`);
		}
		setSaving(true);
		try {
			// Một request cho mọi thay đổi — máy chủ kiểm cả lô rồi lưu trong một transaction
			const r = await settingsApi.saveMany(Object.fromEntries(dirty.map((f) => [f.key, form[f.key] ?? ''])));
			resetUploadPolicy();
			resetModules();
			resetMenuConfig();
			setReviewOpen(false);
			notify.success(`Đã lưu ${r.saved || dirty.length} thay đổi`);
			await load();
		} catch (e) {
			const errs = e instanceof ApiError && e.errors && typeof e.errors === 'object' ? (e.errors as Record<string, string>) : null;
			if (errs) {
				setServerErrors(errs);
				const first = FIELDS.find((f) => errs[f.key]);
				if (first && !query) goTo(first);
				notify.error(first ? `${first.label}: ${errs[first.key]}` : (e as Error).message);
			} else {
				notify.error(e instanceof Error ? e.message : 'Lưu thất bại');
			}
		} finally {
			setSaving(false);
		}
	};

	// Xuất cấu hình đang lưu ra file JSON (không gồm mật khẩu / khóa bí mật)
	const exportBackup = () => {
		const blob = new Blob([JSON.stringify(buildBackup(saved), null, 2)], { type: 'application/json' });
		saveBlob(blob, `cau-hinh-he-thong-${new Date().toISOString().slice(0, 10)}.json`);
	};
	// Nhập file sao lưu: chỉ điền vào form (thành "chưa lưu") để xem lại trước khi bấm Lưu
	const importBackup = async (file: File | undefined) => {
		if (!file) return;
		try {
			const { values, skipped } = parseBackup(await file.text());
			const changed = Object.entries(values).filter(([k, v]) => v !== form[k]);
			if (!changed.length) return notify.success('File không có gì khác cấu hình hiện tại');
			setForm((p) => ({ ...p, ...Object.fromEntries(changed) }));
			setServerErrors({});
			setQuery('');
			setReviewOpen(true);
			notify.success(
				`Đã nạp ${changed.length} thay đổi từ file — xem lại rồi bấm Lưu${skipped.length ? ` (bỏ qua ${skipped.length} mục không dùng được)` : ''}`,
			);
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Không đọc được file');
		} finally {
			if (importRef.current) importRef.current.value = '';
		}
	};

	// Ctrl+S để lưu; cảnh báo khi rời trang còn thay đổi chưa lưu
	const saveRef = useRef(save);
	useEffect(() => {
		saveRef.current = save;
	});
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				saveRef.current();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	const hasDirty = dirty.length > 0;
	useEffect(() => {
		if (!hasDirty) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [hasDirty]);

	const modules = SECTIONS.find((s) => s.id === 'modules')!.groups[0].fields;
	const smtp = saved.SMTP_HOST || env.SMTP_HOST;
	const clamHost = saved.CLAMAV_HOST || env.CLAMAV_HOST;
	const stats = [
		{ label: '2FA quản trị', value: on('REQUIRE_2FA_FOR_ADMINS') ? 'Bắt buộc' : 'Không bắt buộc', ok: on('REQUIRE_2FA_FOR_ADMINS'), tab: 'security' },
		{ label: 'Quên mật khẩu', value: on('PASSWORD_RESET_ENABLED') ? 'Cho phép' : 'Đã tắt', ok: on('PASSWORD_RESET_ENABLED'), tab: 'security' },
		{ label: 'Gửi email', value: on('MAIL_ENABLED') ? 'Đang bật' : 'Đang tắt', ok: on('MAIL_ENABLED'), tab: 'mail' },
		{ label: 'Máy chủ SMTP', value: smtp || 'Chưa cấu hình', ok: !!smtp, tab: 'mail' },
		{ label: 'Quét virus', value: clamHost ? `ClamAV ${clamHost}` : 'Chưa bật', ok: !!clamHost, tab: 'upload' },
		{ label: 'Phân hệ', value: `${modules.filter((f) => on(f.key)).length}/${modules.length} đang bật`, ok: true, tab: 'modules' },
	];

	const renderSwitch = (f: Field) => {
		const checked = form[f.key] === 'true';
		return (
			<label className={styles.switch}>
				<span className={cx(styles.switchText, checked && styles.switchTextOn)}>{checked ? f.onText ?? 'Bật' : f.offText ?? 'Tắt'}</span>
				<input id={f.key} type='checkbox' role='switch' checked={checked} onChange={(e) => set(f.key, String(e.target.checked))} />
				<span className={styles.track} />
			</label>
		);
	};

	const renderMulti = (f: Field) => {
		const picked = new Set(splitList(form[f.key]));
		const toggle = (v: string) => {
			if (picked.has(v)) picked.delete(v);
			else picked.add(v);
			set(f.key, f.options!.map(([o]) => o).filter((o) => picked.has(o)).join(','));
		};
		const cats = [...new Set(f.options!.map((o) => o[2] ?? ''))];
		return (
			<div className={styles.multi} role='group' aria-label={f.label}>
				{cats.map((c) => (
					<div className={styles.chipRow} key={c}>
						<span className={styles.chipCat}>{c}</span>
						<div className={styles.chips}>
							{f.options!
								.filter((o) => (o[2] ?? '') === c)
								.map(([v, l]) => (
									<button
										key={v}
										type='button'
										className={cx(styles.chip, picked.has(v) && styles.chipOn)}
										aria-pressed={picked.has(v)}
										onClick={() => toggle(v)}
									>
										{l}
									</button>
								))}
						</div>
					</div>
				))}
				<div className={styles.multiFoot}>
					<span>Đã chọn {picked.size} định dạng</span>
					{form[f.key] !== f.defaultValue && (
						<button type='button' className={styles.linkBtn} onClick={() => set(f.key, f.defaultValue ?? '')}>
							Dùng bộ mặc định
						</button>
					)}
				</div>
			</div>
		);
	};

	const renderMenu = (f: Field) => {
		const hidden = new Set(splitList(form[f.key]));
		const toggle = (k: string) => {
			if (hidden.has(k)) hidden.delete(k);
			else hidden.add(k);
			set(f.key, f.menu!.flatMap((g) => g.items.map((i) => i.key)).filter((x) => hidden.has(x)).join(','));
		};
		// Mục của module đang tắt (theo form, kể cả chưa lưu) thì ẩn dù bật ở đây.
		const moduleOff = (m?: string) => !!m && form[`MODULE_${m.toUpperCase()}`] === 'false';
		return (
			<div className={styles.menuSections}>
				{f.menu!.map((g) => (
					<div key={g.section}>
						<div className={styles.menuSectionTitle}>{g.section}</div>
						<div className={styles.menuGrid}>
							{g.items.map((it) => {
								const visible = it.locked || !hidden.has(it.key);
								return (
									<label key={it.key} className={cx(styles.menuItem, !visible && styles.menuItemOff)}>
										<span className={styles.menuLabel}>{it.label}</span>
										{it.locked && <span className={styles.tag}>Luôn hiện</span>}
										{!it.locked && moduleOff(it.module) && (
											<span className={cx(styles.tag, styles.tagWarn)} title='Phân hệ của mục này đang tắt ở tab "Phân hệ chức năng"'>
												Phân hệ tắt
											</span>
										)}
										<span className={styles.switch}>
											<input type='checkbox' role='switch' checked={visible} disabled={it.locked} onChange={() => toggle(it.key)} />
											<span className={cx(styles.track, styles.trackSm)} />
										</span>
									</label>
								);
							})}
						</div>
					</div>
				))}
			</div>
		);
	};

	/** Bảng tick hàng × cột (vd phương thức điểm danh theo loại hội nghị) — lưu JSON */
	const renderMatrix = (f: Field) => {
		const { rows, cols, rowHead } = f.matrix!;
		const value = parseMatrix(f, form[f.key]);
		const toggle = (r: string, c: string) => {
			const cur = value[r];
			set(f.key, serializeMatrix(f, { ...value, [r]: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] }));
		};
		// Cột có công tắc tổng đang tắt (theo form — đổi công tắc phía trên thấy ngay)
		const colOff = (key?: string) => !!key && form[key] === 'false';
		return (
			<div className={styles.matrixWrap}>
				<table className={styles.matrix} aria-label={f.label}>
					<thead>
						<tr>
							<th scope='col'>{rowHead ?? ''}</th>
							{cols.map(([c, l, key]) => (
								<th key={c} scope='col' className={cx(colOff(key) && styles.matrixOff)}>
									{l}
									{colOff(key) && <span className={styles.matrixNote}>đang tắt</span>}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map(([r, label]) => (
							<tr key={r}>
								<th scope='row'>{label}</th>
								{cols.map(([c, l, key]) => (
									<td key={c} className={cx(colOff(key) && styles.matrixOff)}>
										<input
											type='checkbox'
											checked={value[r].includes(c)}
											disabled={colOff(key)}
											onChange={() => toggle(r, c)}
											aria-label={`${label} — ${l}`}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	};

	const renderInput = (f: Field) => {
		if (f.type === 'select') {
			return (
				<select id={f.key} className={styles.input} value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
					{f.options!.map(([v, l]) => (
						<option key={v} value={v}>
							{l}
						</option>
					))}
				</select>
			);
		}
		if (f.type === 'textarea') {
			return (
				<textarea
					id={f.key}
					aria-invalid={errorOf(f) ? true : undefined}
					aria-describedby={errorOf(f) ? `${f.key}-note` : undefined}
					className={styles.input}
					rows={2}
					placeholder={env[f.key] ?? f.placeholder}
					value={form[f.key] ?? ''}
					onChange={(e) => set(f.key, e.target.value)}
				/>
			);
		}
		if (f.type === 'number') {
			return (
				<div className={cx(styles.numWrap, errorOf(f) && styles.invalid)}>
					<input
						id={f.key}
						aria-invalid={errorOf(f) ? true : undefined}
						aria-describedby={errorOf(f) ? `${f.key}-note` : undefined}
						className={styles.numInput}
						type='number'
						inputMode='decimal'
						min={f.min}
						max={f.max}
						placeholder={env[f.key] ?? f.placeholder}
						value={form[f.key] ?? ''}
						onChange={(e) => set(f.key, e.target.value)}
					/>
					{f.unit && <span className={styles.unit}>{f.unit}</span>}
				</div>
			);
		}
		const isPass = f.type === 'password';
		return (
			<div className={styles.inputWrap}>
				<input
					id={f.key}
					aria-invalid={errorOf(f) ? true : undefined}
					aria-describedby={errorOf(f) ? `${f.key}-note` : undefined}
					className={styles.input}
					type={isPass && !showPass ? 'password' : 'text'}
					autoComplete='off'
					placeholder={isPass ? (hasSecret[f.key] ? 'Đã đặt — nhập để thay đổi' : 'Chưa đặt') : (env[f.key] ?? f.placeholder)}
					value={form[f.key] ?? ''}
					onChange={(e) => set(f.key, e.target.value)}
					onFocus={(e) => isPass && e.target.value === '••••••' && set(f.key, '')}
				/>
				{isPass && (
					<button
						type='button'
						className={styles.eyeBtn}
						onClick={() => setShowPass((s) => !s)}
						aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
						title={showPass ? 'Ẩn' : 'Hiện'}
					>
						{showPass ? <EyeOffSvg /> : <EyeSvg />}
					</button>
				)}
			</div>
		);
	};

	/** Dòng phụ dưới ô nhập: lỗi > nguồn .env > mặc định khi để trống. */
	const renderNote = (f: Field) => {
		const err = errorOf(f);
		if (err && f.type !== 'multi')
			return (
				<span id={`${f.key}-note`} className={styles.error} role='alert'>
					{err}
				</span>
			);
		if (f.type === 'bool' || f.type === 'multi' || f.type === 'matrix' || f.type === 'password' || form[f.key]) return null;
		if (env[f.key]) return <span className={styles.envNote}>Đang dùng giá trị trong file .env</span>;
		if (f.type === 'number' && f.placeholder)
			return (
				<span className={styles.defaultNote}>
					Để trống = mặc định {f.placeholder}
					{f.unit && ` ${f.unit}`}
				</span>
			);
		return null;
	};

	const renderRevert = (f: Field) =>
		isDirty(f) && (
			<button type='button' className={styles.revert} onClick={() => set(f.key, saved[f.key])} title='Trả về giá trị đã lưu' aria-label={`Hoàn tác ${f.label} về giá trị đã lưu`}>
				<RefreshSvg /> Hoàn tác
			</button>
		);

	const renderLabel = (f: Field, withFor = true) => (
		<div className={styles.labelCol}>
			<div className={styles.labelLine}>
				{withFor ? (
					<label className={styles.label} htmlFor={f.key}>
						{f.label}
					</label>
				) : (
					<span className={styles.label}>{f.label}</span>
				)}
				{renderRevert(f)}
			</div>
			{f.hint && <p className={styles.hint}>{f.hint}</p>}
			{f.more && (
				<details className={styles.more}>
					<summary>Xem thêm</summary>
					<p>{f.more}</p>
				</details>
			)}
		</div>
	);

	const renderField = (f: Field, layout?: Group['layout']) => {
		const d = isDirty(f);
		if (f.type === 'menu') {
			return (
				<div key={f.key} className={cx(styles.menuBlock, d && styles.dirtyBlock)}>
					{renderMenu(f)}
				</div>
			);
		}
		if (f.type === 'matrix') {
			return (
				<div key={f.key} className={cx(styles.menuBlock, d && styles.dirtyBlock)}>
					{d && <div className={styles.blockRevert}>{renderRevert(f)}</div>}
					{renderMatrix(f)}
					{renderNote(f)}
				</div>
			);
		}
		if (f.type === 'multi') {
			return (
				<div key={f.key} className={cx(styles.menuBlock, d && styles.dirtyBlock)}>
					{d && <div className={styles.blockRevert}>{renderRevert(f)}</div>}
					{renderMulti(f)}
					{renderNote(f)}
				</div>
			);
		}
		if (layout === 'tiles' && f.type === 'bool') {
			const checked = form[f.key] === 'true';
			return (
				<div key={f.key} className={cx(styles.tile, checked && styles.tileOn, d && styles.dirty)}>
					<div className={styles.tileHead}>
						<label className={styles.label} htmlFor={f.key}>
							{f.label}
						</label>
						{renderSwitch(f)}
					</div>
					<div className={styles.tileBody}>
						{f.hint && <p className={styles.hint}>{f.hint}</p>}
						{f.more && (
							<details className={styles.more}>
								<summary>Xem thêm</summary>
								<p>{f.more}</p>
							</details>
						)}
						{renderRevert(f)}
					</div>
				</div>
			);
		}
		if (layout === 'grid') {
			return (
				<div key={f.key} className={cx(styles.cell, d && styles.dirty)}>
					{renderLabel(f)}
					{renderInput(f)}
					{renderNote(f)}
				</div>
			);
		}
		if (f.type === 'bool') {
			return (
				<div key={f.key} className={cx(styles.row, styles.rowSwitch, d && styles.dirty)}>
					{renderLabel(f)}
					{renderSwitch(f)}
				</div>
			);
		}
		return (
			<div key={f.key} className={cx(styles.row, d && styles.dirty)}>
				{renderLabel(f)}
				<div className={styles.control}>
					{renderInput(f)}
					{renderNote(f)}
				</div>
			</div>
		);
	};

	const renderTool = (tool: Group['tool']): ReactNode => {
		const hasDirty = dirty.length > 0;
		switch (tool) {
			case 'mail-test':
				return <MailTestTool dirty={hasDirty} />;
			case 'clamav-test':
				return <ClamavTestTool host={clamHost ?? ''} dirty={hasDirty} />;
			case 'doc-check':
				return <DocCheckPanel />;
			case 'recaptcha-test':
				return (
					<RecaptchaTestPanel
						siteKey={(saved.RECAPTCHA_SITE_KEY || env.RECAPTCHA_SITE_KEY || '').trim()}
						enterprise={!!(saved.RECAPTCHA_PROJECT_ID || env.RECAPTCHA_PROJECT_ID || '').trim()}
						dirty={hasDirty}
					/>
				);
			case 'attendance-helper':
				return (
					<AttendanceHelper
						location={form.ATTENDANCE_LOCATION ?? ''}
						radius={form.ATTENDANCE_RADIUS_M ?? ''}
						ips={form.ATTENDANCE_ALLOWED_IPS ?? ''}
						onChange={set}
					/>
				);
			case 'holiday-preview':
				return <HolidayPreview
						auto={form.TRAINING_HOLIDAYS_AUTO !== 'false'}
						text={form.TRAINING_HOLIDAYS ?? ''}
						onTextChange={(v) => set('TRAINING_HOLIDAYS', v)}
					/>;
			case 'bank-connect':
				return (
					<BankConnectTool
						provider={(saved.TUITION_BANK_API_PROVIDER ?? '').trim()}
						baseUrl={saved.PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || ''}
						dirty={hasDirty}
					/>
				);
			default:
				return null;
		}
	};

	const renderGroup = (g: Group, key: string | number, fields = g.fields, anchor?: string) => {
		if (g.hiddenBy && form[g.hiddenBy] === 'false') return null;
		const offBy = g.dependsOn && form[g.dependsOn.key] === 'false';
		const isMenu = fields[0]?.type === 'menu';
		const menuHidden = isMenu ? splitList(form[fields[0].key]).length : 0;
		const nDirty = fields.filter(isDirty).length;
		return (
			<Card key={key} className={styles.groupCard} id={anchor}>
				{g.title && (
					<div className={styles.groupHead}>
						<div className={styles.groupHeadText}>
							<div className={styles.groupTitle}>
								{g.title}
								{nDirty > 0 && <span className={styles.dirtyPill}>{nDirty} chưa lưu</span>}
							</div>
							{g.desc && <p className={styles.groupDesc}>{g.desc}</p>}
							{g.more && (
								<details className={styles.more}>
									<summary>Xem thêm</summary>
									<p>{g.more}</p>
								</details>
							)}
						</div>
						{isMenu && (
							<div className={styles.groupActions}>
								<span className={cx(styles.countPill, menuHidden > 0 && styles.countPillWarn)}>
									{menuHidden ? `Đang ẩn ${menuHidden} mục` : 'Hiện tất cả'}
								</span>
								{menuHidden > 0 && (
									<button type='button' className={styles.linkBtn} onClick={() => set(fields[0].key, '')}>
										Hiện lại tất cả
									</button>
								)}
							</div>
						)}
					</div>
				)}
				{offBy && (
					<div className={styles.warnNote}>
						<WarnSvg /> {g.dependsOn!.text}
					</div>
				)}
				<div className={cx(styles.groupBody, g.layout === 'tiles' && styles.tiles, g.layout === 'grid' && styles.grid, offBy && styles.dimmed)}>
					{fields.map((f) => renderField(f, g.layout))}
				</div>
				{g.tool && !query && renderTool(g.tool)}
			</Card>
		);
	};

	// Tìm trên mọi tab: khớp tên, mô tả, tên nhóm hoặc mã cấu hình
	const results = useMemo(() => {
		const q = fold(query.trim());
		if (!q) return null;
		const seen = new Set<string>();
		return SECTIONS.map((s) => ({
			section: s,
			groups: s.groups
				.map((g) => ({
					group: g,
					fields: g.fields.filter((f) => {
						if (seen.has(f.key)) return false;
						const hit = fold([s.title, g.title, f.label, f.hint, f.more, f.key].filter(Boolean).join(' ')).includes(q);
						if (hit) seen.add(f.key);
						return hit;
					}),
				}))
				.filter((x) => x.fields.length),
		})).filter((x) => x.groups.length);
	}, [query]);

	const section = SECTIONS.find((s) => s.id === tab)!;
	const SectionIcon = section.icon;
	const anchorOf = (i: number) => `grp-${tab}-${i}`;
	// Mục lục nhảy nhanh — chỉ cho tab dài (≥ 3 nhóm có tiêu đề)
	const toc = section.subtabs ? [] : section.groups
				.map((g, i) => ({ title: g.title, i, off: !!g.hiddenBy && form[g.hiddenBy] === 'false' }))
				.filter((x) => x.title && !x.off);
	const showToc = !query && !loading && toc.length >= 3;

	// Tô sáng mục lục theo nhóm đang cuộn tới (nhóm cuối cùng đã lên tới 1/3 trên màn hình)
	useEffect(() => {
		if (!showToc) return;
		const onScroll = () => {
			if (jumpLock.current) return; // đang cuộn mượt tới nhóm vừa bấm
			let cur = 0;
			const line = Math.max(180, window.innerHeight / 3);
			section.groups.forEach((_, i) => {
				const el = document.getElementById(anchorOf(i));
				if (el && el.getBoundingClientRect().top <= line) cur = i;
			});
			if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = section.groups.length - 1;
			setActiveGroup(cur);
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tab, showToc]);
	const jumpTo = (i: number) => {
		window.clearTimeout(jumpLock.current);
		jumpLock.current = window.setTimeout(() => (jumpLock.current = 0), 1000);
		setActiveGroup(i);
		document.getElementById(anchorOf(i))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	return (
		<AdminLayout pageTitle='Cấu hình hệ thống' pageSubtitle='Bật/tắt chức năng bảo mật, email SMTP, ngưỡng CME — áp dụng ngay, không cần khởi động lại'>
			<div className={styles.summary}>
				{stats.map((s) => (
					<button type='button' className={styles.stat} key={s.label} onClick={() => setTab(s.tab)} title='Mở phần cấu hình này'>
						<span className={cx(styles.dot, s.ok && styles.dotOn)} />
						<span className={styles.statText}>
							<span className={styles.statLabel}>{s.label}</span>
							<span className={styles.statValue}>{loading ? '…' : s.value}</span>
						</span>
					</button>
				))}
			</div>

			<div className={styles.layout}>
				<aside className={styles.side}>
					<SearchInput value={query} onChange={setQuery} placeholder='Tìm cấu hình…' />
					<nav className={styles.tabs} aria-label='Nhóm cấu hình hệ thống'>
						{CATS.map((cat) => (
							<div key={cat} className={styles.tabGroup}>
								<div className={styles.tabCat}>{cat}</div>
								{SECTIONS.filter((s) => s.cat === cat).map((s) => {
									const Icon = s.icon;
									const n = sectionFields(s).filter(isDirty).length;
									return (
										<button
											key={s.id}
											type='button'
											className={cx(styles.tab, s.id === tab && !query && styles.tabActive)}
											aria-current={s.id === tab && !query ? 'page' : undefined}
											onClick={() => setTab(s.id)}
										>
											<span className={styles.tabIcon}>
												<Icon />
											</span>
											<span className={styles.tabText}>
												<span className={styles.tabTitle}>{s.title}</span>
												<span className={styles.tabSub}>{s.sub}</span>
											</span>
											{n > 0 && (
												<span className={styles.tabBadge} title={`${n} thay đổi chưa lưu`}>
													{n}
												</span>
											)}
										</button>
									);
								})}
							</div>
						))}
					</nav>
					<div className={styles.backup}>
						<div className={styles.tabCat}>Sao lưu cấu hình</div>
						<div className={styles.backupBtns}>
							<button type='button' className={styles.backupBtn} onClick={exportBackup} disabled={loading}>
								<DownloadSvg /> Xuất file
							</button>
							<button type='button' className={styles.backupBtn} onClick={() => importRef.current?.click()} disabled={loading}>
								<UploadSvg /> Nhập file
							</button>
						</div>
						<input
							ref={importRef}
							type='file'
							accept='application/json,.json'
							hidden
							onChange={(e) => importBackup(e.target.files?.[0])}
						/>
						<p className={styles.backupNote}>Chuyển cấu hình sang máy khác. Không gồm mật khẩu, khóa bí mật; nhập xong được xem lại trước khi lưu.</p>
					</div>
				</aside>

				<div className={styles.main}>
					{results ? (
						<>
							<div className={styles.sectionHead}>
								<div>
									<h2 className={styles.sectionTitle}>Kết quả tìm “{query.trim()}”</h2>
									<p className={styles.sectionSub}>
										{results.length
											? `${results.reduce((a, r) => a + r.groups.reduce((b, g) => b + g.fields.length, 0), 0)} cấu hình phù hợp`
											: 'Không tìm thấy cấu hình nào. Thử từ khóa khác, ví dụ "email", "2FA", "điểm danh".'}
									</p>
								</div>
							</div>
							{results.map(({ section: s, groups }) => (
								<div key={s.id} className={styles.resultSection}>
									<button type='button' className={styles.resultHead} onClick={() => setTab(s.id)}>
										<s.icon /> {s.title} <span>Mở tab →</span>
									</button>
									{groups.map(({ group, fields }, i) => renderGroup(group, `${s.id}-${i}`, fields))}
								</div>
							))}
						</>
					) : (
						<>
							<div className={styles.sectionHead}>
								<span className={styles.sectionIcon}>
									<SectionIcon />
								</span>
								<div>
									<h2 className={styles.sectionTitle}>{section.title}</h2>
									<p className={styles.sectionSub}>{section.sub}</p>
								</div>
							</div>
							{section.note && (
								<div className={styles.infoNote}>
									<InfoSvg /> {section.note}
								</div>
							)}
							{showToc && (
								<nav className={styles.toc} aria-label='Các nhóm trong mục này'>
									{toc.map(({ title, i }) => {
										const n = section.groups[i].fields.filter(isDirty).length;
										return (
											<button
												key={i}
												type='button'
												className={cx(styles.tocItem, activeGroup === i && styles.tocActive)}
												onClick={() => jumpTo(i)}
											>
												{title}
												{n > 0 && <span className={styles.tocDot} title={`${n} thay đổi chưa lưu`} />}
											</button>
										);
									})}
								</nav>
							)}
							{section.subtabs && !loading && (
								<div className={styles.segment} role='tablist'>
									{section.groups.map((g, i) => {
										const f = g.fields[0];
										const hidden = f?.type === 'menu' ? splitList(form[f.key]).length : 0;
										const n = g.fields.filter(isDirty).length;
										return (
											<button
												key={i}
												type='button'
												role='tab'
												aria-selected={i === sub}
												className={cx(styles.segBtn, i === sub && styles.segOn)}
												onClick={() => setSub(i)}
											>
												{g.title}
												{hidden > 0 && <span className={styles.segCount}>ẩn {hidden}</span>}
												{n > 0 && <span className={styles.tocDot} title='Có thay đổi chưa lưu' />}
											</button>
										);
									})}
								</div>
							)}
							{loading ? (
								<div className={styles.loading}>Đang tải cấu hình…</div>
							) : section.subtabs ? (
								renderGroup(section.groups[sub] ?? section.groups[0], sub)
							) : (
								section.groups.map((g, i) => renderGroup(g, i, g.fields, anchorOf(i)))
							)}
						</>
					)}

					{hasDirty && (
						<div className={styles.saveBar} role='status'>
							{reviewOpen && (
								<ul className={styles.review} aria-label='Các thay đổi chưa lưu'>
									{dirty.map((f) => {
										const err = errorOf(f);
										return (
											<li key={f.key}>
												<button type='button' className={styles.reviewItem} onClick={() => goTo(f)} title='Mở ô này'>
													<span className={styles.reviewWhere}>
														{sectionOf(f).title} › <b>{f.label}</b>
													</span>
													<span className={styles.reviewDiff}>
														<s>{displayValue(f, saved[f.key])}</s> → <b>{displayValue(f, form[f.key])}</b>
													</span>
													{err && <span className={styles.error}>{err}</span>}
												</button>
												<button
													type='button'
													className={styles.revert}
													onClick={() => set(f.key, saved[f.key])}
													aria-label={`Hoàn tác ${f.label}`}
												>
													<RefreshSvg /> Hoàn tác
												</button>
											</li>
										);
									})}
								</ul>
							)}
							<div className={styles.saveRow}>
								<div className={styles.saveText}>
									<b>{dirty.length} thay đổi chưa lưu</b>
									<span className={styles.saveList}>
										{dirty
											.slice(0, 3)
											.map((f) => f.label)
											.join(', ')}
										{dirty.length > 3 && ` và ${dirty.length - 3} mục khác`}
									</span>
								</div>
								{invalid.length > 0 && <span className={styles.error}>{invalid.length} giá trị chưa hợp lệ</span>}
								<Button variant='ghost' onClick={() => setReviewOpen((v) => !v)} aria-expanded={reviewOpen}>
									{reviewOpen ? 'Ẩn danh sách' : 'Xem lại'}
								</Button>
								<Button
									variant='ghost'
									onClick={() => {
										setForm(saved);
										setServerErrors({});
									}}
								>
									Hoàn tác tất cả
								</Button>
								<Button loading={saving} onClick={save} title='Ctrl + S'>
									Lưu thay đổi
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</AdminLayout>
	);
}

#!/usr/bin/env node
/**
 * Quét tĩnh JSX tìm lỗi accessibility đã nêu trong MD3_AUDIT.md — chỉ đọc, không sửa file.
 * Công cụ tạm cho đợt sửa theo audit Material Design 3; xóa được khi các con số về 0.
 *
 *   node scripts/audit/a11y-scan.cjs                       # toàn bộ frontend/src
 *   node scripts/audit/a11y-scan.cjs features/course features/exam
 *   node scripts/audit/a11y-scan.cjs --summary features/course
 *
 * Cần `npm ci` trong frontend/ trước (dùng trình phân tích của TypeScript).
 *
 * Nhóm lỗi:
 *   clickable        thẻ không tương tác (div/span/tr/li/th/td…) có onClick, không role + tabIndex
 *   clickable-nokey  có role/tabIndex nhưng thiếu xử lý phím
 *   icon-noname      <button> chỉ có icon, không aria-label/title
 *   icon-titleonly   <button> chỉ có icon, chỉ có title (thêm aria-label)
 *   input-nolabel    input/select/textarea không có tên truy cập nào
 *   input-placeholder  chỉ có placeholder, không có nhãn gắn với ô
 *   native-dialog    confirm() / alert() / prompt() của trình duyệt
 *   custom-modal     modal tự dựng bằng lớp backdrop/overlay thay vì <Modal> của kit
 *
 * Giới hạn: thẻ nhận `{...props}` được coi là đã có tên; ô nhập là con DUY NHẤT của
 * <FormField> được coi là có nhãn (FormField tự nối nhãn). Kết quả là gợi ý để rà,
 * không thay cho việc kiểm bằng bàn phím và trình đọc màn hình.
 */
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');
const SRC = path.join(FRONTEND, 'src');
let ts;
try {
	ts = require(path.join(FRONTEND, 'node_modules', 'typescript'));
} catch {
	console.error('Chưa có frontend/node_modules — chạy `npm ci` trong frontend/ trước.');
	process.exit(2);
}

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const scopes = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\\/g, '/').replace(/\/$/, ''));

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (e.name.endsWith('.tsx')) out.push(p);
	}
	return out;
}

const INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'label', 'summary', 'option', 'details']);
const found = {
	clickable: [],
	'clickable-nokey': [],
	'icon-noname': [],
	'icon-titleonly': [],
	'input-nolabel': [],
	'input-placeholder': [],
	'native-dialog': [],
	'custom-modal': [],
};

function attrs(node) {
	const m = new Map();
	let spread = false;
	for (const a of node.attributes.properties) {
		if (ts.isJsxAttribute(a)) m.set(a.name.getText(), a.initializer);
		else spread = true;
	}
	return { m, spread };
}

function exprHasText(e) {
	if (ts.isParenthesizedExpression(e)) return exprHasText(e.expression);
	if (ts.isConditionalExpression(e)) return exprHasText(e.whenTrue) || exprHasText(e.whenFalse);
	if (ts.isBinaryExpression(e)) return exprHasText(e.right);
	if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return elementHasText(e);
	if (e.kind === ts.SyntaxKind.NullKeyword) return false;
	return true;
}
function elementHasText(el) {
	if (ts.isJsxSelfClosingElement(el)) {
		const n = el.tagName.getText();
		return !(/Svg$|Icon$/.test(n) || n === 'svg' || n === 'img' || n === 'span' || n === 'i');
	}
	if (ts.isJsxFragment(el)) return hasText(el.children);
	if (el.openingElement.tagName.getText() === 'svg') return false;
	return hasText(el.children);
}
function hasText(children) {
	for (const c of children) {
		if (ts.isJsxText(c)) {
			if (c.getText().trim()) return true;
		} else if (ts.isJsxExpression(c)) {
			if (!c.expression) continue;
			const e = c.expression;
			const t = e.getText();
			if (/^[A-Za-z_$][\w$.]*$/.test(t) && /(icon|Icon|svg|Svg)$/.test(t)) continue;
			if (exprHasText(e)) return true;
		} else if (elementHasText(c)) return true;
	}
	return false;
}

/** Ô nhập nằm trong <label>, hoặc là con duy nhất của <FormField> (FormField tự nối nhãn). */
function labelledByAncestor(node) {
	const parent = node.parent;
	if (parent && ts.isJsxElement(parent) && parent.openingElement.tagName.getText() === 'FormField') {
		const kids = parent.children.filter((c) => !(ts.isJsxText(c) && !c.getText().trim()));
		if (kids.length === 1) return true;
	}
	let p = parent;
	while (p) {
		if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === 'label') return true;
		p = p.parent;
	}
	return false;
}

const files = walk(SRC).filter((f) => {
	if (!scopes.length) return true;
	const rel = path.relative(SRC, f).replace(/\\/g, '/');
	return scopes.some((s) => rel === s || rel.startsWith(s + '/'));
});

for (const file of files) {
	const text = fs.readFileSync(file, 'utf8');
	const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const rel = path.relative(SRC, file).replace(/\\/g, '/');
	const at = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
	const inKit = rel.startsWith('shared/components/');
	// Hàm cục bộ trùng tên (vd `const confirm = async () => …`) không phải hộp thoại trình duyệt
	const localNames = new Set(
		[...text.matchAll(/(?:const|let|var|function)\s+(confirm|alert|prompt)\b/g)].map((m) => m[1]),
	);
	const labelFor = new Set();
	const pendingIds = [];

	(function visit(node) {
		if (ts.isCallExpression(node)) {
			const t = node.expression.getText();
			const m = /^(window\.)?(confirm|alert|prompt)$/.exec(t);
			if (m && (m[1] || !localNames.has(m[2]))) found['native-dialog'].push(`${at(node)} ${t}()`);
		}
		const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
		if (opening) {
			const tag = opening.tagName.getText();
			const { m, spread } = attrs(opening);
			const children = ts.isJsxElement(node) ? node.children : [];
			const cls = m.get('className') ? m.get('className').getText() : '';
			if (m.has('htmlFor') && m.get('htmlFor')) labelFor.add(m.get('htmlFor').getText());

			if (!inKit && /^[a-z]/.test(tag) && /styles\.(modalBackdrop|backdrop|overlay|modalOverlay)\b/.test(cls)) {
				found['custom-modal'].push(`${at(node)} <${tag}>`);
			}
			if (tag === 'button') {
				const named = m.has('aria-label') || m.has('aria-labelledby');
				if (!named && !spread && !hasText(children)) {
					found[m.has('title') ? 'icon-titleonly' : 'icon-noname'].push(at(node));
				}
			}
			if (/^[a-z]/.test(tag) && !INTERACTIVE.has(tag) && m.has('onClick')) {
				const isBackdrop = /backdrop|overlay|mask/i.test(cls);
				const handler = (m.get('onClick') ? m.get('onClick').getText() : '').replace(/\s+/g, '');
				const stopOnly = /stopPropagation\(\)\}?\}?$/.test(handler);
				if (!isBackdrop && !stopOnly) {
					const hasKey = m.has('onKeyDown') || m.has('onKeyUp') || m.has('onKeyPress');
					if (!m.has('role') && !m.has('tabIndex')) found.clickable.push(`${at(node)} <${tag}>`);
					else if (!hasKey) found['clickable-nokey'].push(`${at(node)} <${tag}>`);
				}
			}
			if (tag === 'input' || tag === 'select' || tag === 'textarea') {
				const typeAttr = m.get('type');
				const type = typeAttr ? typeAttr.getText().replace(/['"{}]/g, '') : 'text';
				if (!['hidden', 'file', 'submit', 'button'].includes(type)) {
					const named = m.has('aria-label') || m.has('aria-labelledby') || labelledByAncestor(node);
					if (!named && !spread) {
						const where = `${at(node)} <${tag}${type !== 'text' ? ' ' + type : ''}>`;
						if (m.has('id') && m.get('id')) pendingIds.push({ id: m.get('id').getText(), where, ph: m.has('placeholder') });
						else found[m.has('placeholder') ? 'input-placeholder' : 'input-nolabel'].push(where);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	})(sf);

	for (const x of pendingIds) {
		if (!labelFor.has(x.id)) found[x.ph ? 'input-placeholder' : 'input-nolabel'].push(`${x.where} (id không khớp htmlFor nào trong file)`);
	}
}

console.log(`Đã quét ${files.length} file .tsx${scopes.length ? ' trong: ' + scopes.join(', ') : ' (toàn bộ src)'}`);
let total = 0;
for (const [kind, list] of Object.entries(found)) {
	total += list.length;
	console.log(`\n${kind}: ${list.length}`);
	if (!summaryOnly) for (const line of list) console.log('  ' + line);
}
console.log(`\nTổng: ${total}`);

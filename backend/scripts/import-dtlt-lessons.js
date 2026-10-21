#!/usr/bin/env node
// Nhập chương trình ĐTLT từ file của phòng Đào tạo:
//  1) "Chi tiết chương trình học ĐTLT.xlsx" (TT | Chương trình học | Khoa/phòng | Thời gian
//     | … | Tối đa | Đối tượng | Số tiết | Lý thuyết | Thực hành) → cập nhật chương trình
//     ĐTLT_* đã có (khớp theo tên, xem PROGRAM_ALIAS): số tiết, thời lượng, đối tượng,
//     sĩ số tối thiểu/tối đa, khoa (khớp được duy nhất; không khớp → ghi chú khoa), loại hình ĐTLT.
//  2) Thư mục "Bài học ĐTLT" (mỗi file 1 lớp: TT | Tên bài | Tổng số tiết | LT | TH) →
//     tạo bài học (lesson_kind theory, mã <mã CT>_NN) và gắn vào chương trình theo tên
//     file (LESSON_FILES). Chương trình ĐÃ có bài học thì bỏ qua → chạy lại an toàn.
// Mặc định CHỈ XEM TRƯỚC; thêm --apply để ghi DB.
//   node scripts/import-dtlt-lessons.js "<Chi tiết…xlsx>" "<thư mục Bài học>" [--apply]
require('../src/config/loadEnv');
const fs = require('fs');
const path = require('path');
const { getPool } = require('../src/config/db');
const { norm } = require('../src/utils/vietnameseText');
const { loadWorkbook } = require('../src/utils/excelImport');
const { parseDuration } = require('../src/utils/trainingDuration');
const { createDepartmentMatcher } = require('../src/utils/departmentMatch');
const { parseTraineeTypes } = require('../src/utils/traineeTypeMatch');
const programService = require('../src/modules/training/programs/trainingProgramService');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const [detailFile, lessonDir] = args.filter((a) => !a.startsWith('--'));
const ACTOR = 'SYSTEM';
const DTLT_TYPE = 'TRNTP-DTLT';
// Khoá viết dễ đọc như trong file; so khớp theo norm (bỏ dấu, dấu câu).
const normKeys = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [norm(k), v]));

// Tên trong file Chi tiết → mã chương trình, khi khác tên trong danh mục.
const PROGRAM_ALIAS = normKeys({
	'cac benh noi tiet - roi loan chuyen hoa co ban': 'ĐTLT_3',
	'ky thuat than nhan tao co ban - dieu duong, ktv': 'ĐTLT_46',
	'ky thuat than nhan tao co ban - bac si': 'ĐTLT_47',
	'ky thuat tiem khop co ban': 'ĐTLT_53',
	'te bao hoc co ban chan doan cac khoi u': 'ĐTLT_1',
	'noi soi chan doan duong tieu hoa tren': 'ĐTLT_6',
	'noi soi dai truc trang': 'ĐTLT_8',
	'hoa sinh lam sang co ban': 'ĐTLT_10',
	'doc phim x.quang co ban': 'ĐTLT_20',
	'doc phim cat lop vi tinh co ban': 'ĐTLT_21',
	'kiem soat nhiem khuan co ban': 'ĐTLT_31',
	'tiem an toan va quan ly chat thai ran y te': 'ĐTLT_34',
});

// Tên file bài học (bỏ "Các bài học của [lớp] ") → mã chương trình.
// "…một số bệnh tiêu hóa thường gặp" bản không có số tiết bị bỏ, dùng bản có số tiết.
const LESSON_FILES = normKeys({
	'chan doan va dieu tri cac benh ly hh-truyen mau': 'ĐTLT_55',
	'chan doan va dieu tri mot so benh tieu hoa': 'ĐTLT_54',
	'cd va dt cac benh ly cxk co ban': 'ĐTLT_42',
	'cs benh nhan hs sau mo': 'ĐTLT_38',
	'cham soc bn tho may': 'ĐTLT_39',
	'cham soc nb loc mau lt&thay ht': 'ĐTLT_67',
	'chan thuong chinh hinh co ban': 'ĐTLT_2',
	'chan doan va dieu tri suy tim': 'ĐTLT_12',
	'chan doan va dieu tri benh dot quy nao': 'ĐTLT_11',
	'chan doan va dieu tri viem gan': 'ĐTLT_52',
	'cap cuu ngung tuan hoan (bac si&dieu duong)': 'ĐTLT_32',
	'dung cu vien gay me hoi suc': 'ĐTLT_57',
	'gay me hoi suc co ban': 'ĐTLT_18',
	'gay me hoi suc trong phau thuat noi soi': 'ĐTLT_19',
	'huong dan doc dien tam do': 'ĐTLT_13',
	'hoi suc cap cuu co ban': 'ĐTLT_65',
	'kham noi soi tmh': 'ĐTLT_23',
	'ky thuat cap cuu co ban - bac si': 'ĐTLT_27',
	'ky thuat cham cuu co ban': 'ĐTLT_50',
	'ky thuat loc mau lt&thay ht': 'ĐTLT_66',
	'ky thuat tiem khop co ban': 'ĐTLT_53',
	'ky thuat vien gay me hoi suc': 'ĐTLT_56',
	'ky thuat xoa bop bam huyet': 'ĐTLT_49',
	'mo khi quan': 'ĐTLT_24',
	'noi soi phe quan ong mem': 'ĐTLT_37',
	'phau thuat gan mat co ban': 'ĐTLT_45',
	'phau thuat noi soi co ban': 'ĐTLT_9',
	'phuc hoi chuc nang co ban': 'ĐTLT_64',
	'thong khi nhan tao co ban': 'ĐTLT_40',
	'tieu soi huyet 06.07.2026': 'ĐTLT_63',
	'ky thuat cap cuu co ban - dieu duong': 'ĐTLT_28',
	'dieu duong nha khoa': 'ĐTLT_26',
	'dao tao dieu duong chuyen nganh tmh': 'ĐTLT_25',
});

const intOrNull = (s) => (/^\d+$/.test(String(s).trim()) ? Number(s) : null);

// Ô tên bài nhiều dòng: dòng ngắt giữa câu → nối bằng dấu cách, mục riêng ("- …",
// "Bài 10: …", dòng trước đã hết câu) → "; ".
const cleanTitle = (s) =>
	String(s)
		.replace(/\u00a0/g, ' ')
		.split(/\r?\n/)
		.map((l) => l.replace(/^\s*[-‑]\s*/, '').trim())
		.filter(Boolean)
		.reduce((acc, line) => {
			if (!acc) return line;
			const newItem = /[.:;…)]$/.test(acc) || /^(Bài \d|[A-ZĐÀ-Ỹ])/.test(line);
			return acc + (newItem ? '; ' : ' ') + line;
		}, '')
		.replace(/\s+/g, ' ')
		.replace(/\.;/g, ';');

// Khai giảng / kiểm tra đầu vào lên đầu (file thường để cuối), còn lại giữ thứ tự file.
const isOpening = (t) =>
	!/^bai \d/.test(norm(t)) &&
	/khai giang|dau vao|pre test/.test(norm(t)) &&
	!/be giang|cuoi khoa/.test(norm(t));

const firstSheetRows = async (file) => {
	const wb = await loadWorkbook(fs.readFileSync(file));
	const rows = [];
	// cell.text giữ xuống dòng trong ô (cleanTitle cần), không dùng cellText của excelImport.
	wb.worksheets[0].eachRow((row) => {
		const cells = [];
		for (let c = 1; c <= row.cellCount; c++) cells.push(String(row.getCell(c).text ?? ''));
		rows.push(cells);
	});
	return rows;
};

const readDetail = async (file) => {
	const rows = await firstSheetRows(file);
	const h = rows.findIndex((r) => norm(r[1]) === 'chuong trinh hoc');
	if (h < 0) throw new Error('File Chi tiết: không thấy cột "Chương trình học".');
	const col = Object.fromEntries(rows[h].map((t, i) => [norm(t.replace(/\s+/g, '')), i]));
	const at = (r, name) => r[col[name]] ?? '';
	return rows
		.slice(h + 1)
		.filter((r) => at(r, 'chuongtrinhhoc'))
		.map((r) => ({
			name: at(r, 'chuongtrinhhoc').trim(),
			department: at(r, 'khoa phong'),
			duration: at(r, 'thoigian'),
			min_capacity: intOrNull(at(r, 'toithieu')),
			max_capacity: intOrNull(at(r, 'toida')),
			target_audience: at(r, 'doituong').trim() || null,
			theory_hours: intOrNull(at(r, 'lythuyet')),
			practice_hours: intOrNull(at(r, 'thuchanh')),
		}));
};

const readLessonFile = async (file) => {
	const rows = await firstSheetRows(file);
	const h = rows.findIndex((r) => norm(r[1]) === 'ten bai');
	const lessons = rows
		.slice(h + 1)
		.filter((r) => r[1] && norm(r[1]) !== 'tong')
		.map((r) => ({
			title: cleanTitle(r[1]),
			theory_hours: intOrNull(r[3]) ?? 0,
			practice_hours: intOrNull(r[4]) ?? 0,
		}));
	return [
		...lessons.filter((l) => isOpening(l.title)),
		...lessons.filter((l) => !isOpening(l.title)),
	];
};

(async () => {
	if (!detailFile || !lessonDir) {
		console.error(
			'Cách dùng: node scripts/import-dtlt-lessons.js "<Chi tiết.xlsx>" "<thư mục bài học>" [--apply]',
		);
		process.exit(1);
	}
	const pool = await getPool();
	const [progRs, deptRs] = await Promise.all([
		pool.request().query(`
			SELECT p.id, p.code, p.name, p.department_id,
			       (SELECT COUNT(*) FROM lesson_programs lp WHERE lp.program_id = p.id) AS lesson_count
			FROM training_programs p WHERE p.code IS NOT NULL`),
		pool.request().query('SELECT id, name FROM departments'),
	]);
	const byCode = new Map(progRs.recordset.map((p) => [p.code, p]));
	const byName = new Map(progRs.recordset.map((p) => [norm(p.name), p]));
	const deptName = new Map(deptRs.recordset.map((d) => [d.id, d.name]));
	const matchDept = createDepartmentMatcher(deptRs.recordset);

	console.log(`=== Chương trình (${path.basename(detailFile)}) ===`);
	const hoursByCode = new Map();
	for (const d of await readDetail(detailFile)) {
		const p = byName.get(norm(d.name)) || byCode.get(PROGRAM_ALIAS[norm(d.name)]);
		if (!p) {
			console.log(`  ! KHÔNG KHỚP: "${d.name}" — thêm vào PROGRAM_ALIAS`);
			continue;
		}
		const dur = parseDuration(d.duration);
		const dept = matchDept(d.department);
		// "Bác sĩ, KTV" → danh mục đối tượng học viên (chỉ ghi khi đọc được).
		const traineeTypeIds = parseTraineeTypes(d.target_audience).ids;
		const data = {
			...(traineeTypeIds.length ? { trainee_type_ids: traineeTypeIds } : {}),
			training_type_id: DTLT_TYPE,
			theory_hours: d.theory_hours,
			practice_hours: d.practice_hours,
			target_audience: d.target_audience,
			min_capacity: d.min_capacity,
			max_capacity: d.max_capacity,
			...(dur ? { duration_value: dur.value, duration_unit: dur.unit } : {}),
			...(dept?.id
				? { department_id: dept.id }
				: { department_note: d.department.replace(/\s+/g, ' ').trim() || null }),
		};
		hoursByCode.set(p.code, d);
		const notes = [];
		if (norm(p.name) !== norm(d.name)) notes.push(`tên file: "${d.name}"`);
		if (dept?.id && dept.id !== p.department_id)
			notes.push(`khoa ${deptName.get(p.department_id) || '—'} → ${dept.name}`);
		if (!dept?.id) notes.push(`giữ khoa, ghi chú khoa: "${d.department}"`);
		if (!dur) notes.push(`thời lượng "${d.duration}" không đọc được`);
		console.log(
			`  ${p.code.padEnd(8)} ${p.name} | ${d.theory_hours}+${d.practice_hours} tiết, ${d.duration.trim()}, ${d.min_capacity}–${d.max_capacity} HV${notes.length ? ` | ${notes.join('; ')}` : ''}`,
		);
		if (apply) await programService.update(p.id, data, ACTOR);
	}

	console.log(`\n=== Bài học (${lessonDir}) ===`);
	let created = 0;
	for (const f of fs
		.readdirSync(lessonDir)
		.filter((n) => n.endsWith('.xlsx'))
		.sort()) {
		const key = norm(path.basename(f, '.xlsx').replace(/^Các bài học của (lớp )?/i, ''));
		const code = LESSON_FILES[key];
		if (!code) {
			console.log(`  - bỏ qua file "${f}" (không trong LESSON_FILES)`);
			continue;
		}
		const p = byCode.get(code);
		if (!p) {
			console.log(`  ! ${f}: không có chương trình ${code}`);
			continue;
		}
		if (p.lesson_count > 0) {
			console.log(`  = ${code} ${p.name}: đã có ${p.lesson_count} bài học — bỏ qua`);
			continue;
		}
		const lessons = await readLessonFile(path.join(lessonDir, f));
		// Lớp chỉ 1 bài, file không ghi số tiết → lấy số tiết chương trình.
		const prog = hoursByCode.get(code);
		if (lessons.length === 1 && !lessons[0].theory_hours && !lessons[0].practice_hours && prog) {
			lessons[0].theory_hours = prog.theory_hours ?? 0;
			lessons[0].practice_hours = prog.practice_hours ?? 0;
		}
		const sumT = lessons.reduce((s, l) => s + l.theory_hours, 0);
		const sumP = lessons.reduce((s, l) => s + l.practice_hours, 0);
		const diff =
			prog && (sumT !== prog.theory_hours || sumP !== prog.practice_hours)
				? ` (≠ chương trình ${prog.theory_hours}+${prog.practice_hours})`
				: '';
		console.log(`  + ${code} ${p.name}: ${lessons.length} bài, ${sumT}+${sumP} tiết${diff}`);
		const dupes = lessons.map((l) => l.title).filter((t, i, a) => a.indexOf(t) !== i);
		if (dupes.length) console.log(`      ⚠ tên bài trùng: ${[...new Set(dupes)].join(' | ')}`);
		if (!apply) continue;
		for (const [i, l] of lessons.entries()) {
			const { id } = await programService.createLesson(
				{ ...l, code: `${code}_${String(i + 1).padStart(2, '0')}`, lesson_kind: 'theory' },
				ACTOR,
			);
			await programService.linkLesson(p.id, id, i, ACTOR);
			created++;
		}
	}
	console.log(apply ? `\nĐã tạo ${created} bài học.` : '\n(Xem trước — thêm --apply để ghi DB)');
	process.exit(0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
	parseBook,
	buildPreview,
	inferProgramCode,
} = require('../../src/modules/training/courses/practiceBookImportService');
const {
	buildWorkbook,
	practiceFieldLabel,
} = require('../../src/modules/training/courses/practiceBookExportService');
const { createDepartmentMatcher } = require('../../src/utils/departmentMatch');

const DEPTS = [
	{ id: 'D_CC', name: 'Khoa Cấp Cứu' },
	{ id: 'D_NTM2', name: 'Khoa Nội Tim Mạch 2' },
	{ id: 'D_NDU', name: 'Khoa Nội Dị Ứng - Hô Hấp' },
	{ id: 'D_NT', name: 'Khoa Nội Tiết - ĐTĐ' },
	{ id: 'D_NGTH', name: 'Khoa Ngoại Tổng Hợp' },
	{ id: 'D_NGTH2', name: 'Khoa Ngoại Tổng Hợp 2' },
	{ id: 'D_XQ', name: 'Khoa X-Quang' },
];

test('khớp khoa theo cách viết của sổ thực hành', () => {
	const m = createDepartmentMatcher(DEPTS);
	assert.equal(m('Nội hô hấp').id, 'D_NDU'); // đủ mọi từ, không liền nhau
	assert.equal(m('Nội tiết - Đái tháo đường').id, 'D_NT');
	assert.equal(m('Ngoại Tổng hợp 1').id, 'D_NGTH');
	assert.equal(m('Ngoại Tổng hợp 2').id, 'D_NGTH2');
	assert.equal(m('Xquang').id, 'D_XQ');
	assert.equal(m('bà'), null);
});

test('suy chương trình GPHN từ trình độ / lĩnh vực / hình thức hành nghề', () => {
	const c = (qualification, professional_field, practice_form, suffix = 'BS') =>
		inferProgramCode({ qualification, professional_field, practice_form, suffix });
	// Dòng mới không ghi hình thức hành nghề: ≤ 3 tháng là chương trình "về HSCC"
	assert.equal(inferProgramCode({ qualification: 'Cử nhân điều dưỡng', total_duration: '01 tháng' }), 'GPHN_DTH_2');
	assert.equal(inferProgramCode({ qualification: 'Cử nhân điều dưỡng', total_duration: '06 tháng' }), 'GPHN_DTH_1');
	assert.equal(inferProgramCode({ qualification: 'Bác sĩ y khoa' }), 'GPHN_BS_1');
	assert.equal(c('Bác sĩ y khoa', 'Bác sĩ y khoa', 'Khám bệnh, chữa bệnh y khoa'), 'GPHN_BS_1');
	assert.equal(
		c(
			'Bác sĩ y học cổ truyền',
			'Bác sĩ y học cổ truyền',
			'Khám bệnh, chữa bệnh về hồi sức cấp cứu',
		),
		'GPHN_BS_2',
	);
	assert.equal(
		c('Bác sĩ y khoa', 'Chuyên khoa Da liễu', 'Thực hành khám bệnh, chữa bệnh chuyên khoa Da liễu'),
		'GPHN_BS_3',
	);
	assert.equal(
		c('Bác sĩ răng hàm mặt', 'Bác sĩ răng hàm mặt', 'Khám bệnh, chữa bệnh Răng hàm mặt'),
		'GPHN_BS_5',
	);
	assert.equal(
		c('Cử nhân điều dưỡng', '', 'Thực hiện kỹ thuật chuyên môn Cử nhân điều dưỡng', 'DTH'),
		'GPHN_DTH_1',
	);
	assert.equal(c('Cao đẳng điều dưỡng', '', 'Thực hành Hồi sức cấp cứu', 'DTH'), 'GPHN_DTH_2');
	// mã .DTH nhưng thực chất KTV xét nghiệm
	assert.equal(
		c('Cử nhân kỹ thuật xét nghiệm y học', '', 'Thực hiện kỹ thuật chuyên môn', 'DTH'),
		'GPHN_KTVXN_1',
	);
	assert.equal(c('Cao đẳng phụ sản', '', 'Thực hiện kỹ thuật chuyên môn', 'HS'), 'GPHN_HS_1');
	assert.equal(
		c('Cử nhân dinh dưỡng', 'Bác sĩ y khoa', 'Thực hành dinh dưỡng lâm sàng', 'DD'),
		'GPHN_DD_1',
	);
	assert.equal(c('', '', '', 'XYZ'), null);
});

const rotHead = (n, typoDob) => [
	`Khoa thực hành ${n}`,
	`Thời gian bắt đầu khoa ${n}`,
	`Thời gian kết thúc khoa ${n}`,
	`Tổng thời gian khoa ${n}`,
	`Người hướng dẫn ${n}`,
	`ông/bà ${n}`,
	`MNV ${n}`,
	`Ngày sinh Ng hướng dẫn ${typoDob ?? n}`,
	`TDCM ng hướng dẫn ${n}`,
	`Số CCHN ${n}`,
	`Ngày cấp CCHN ${n}`,
	`Điện thoại ${n}`,
	`PVHĐCM của NHD TH ${n}`,
];

async function bookBuffer() {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Sheet1');
	ws.addRow([
		'TT', 'Mã học viên', 'Mã thực hành', 'Họ và tên', 'Giới tính', 'Ngày sinh', 'Năm sinh', 'Trình độ chuyên môn',
		'Hộ khẩu thường trú', 'Nơi sinh \n(Tỉnh)', 'CMT/CCCD', 'Ngày cấp', 'Nơi cấp', 'Điện thoại', 'Năm tốt nghiệp',
		'Trường đào tạo', 'Ngày cấp bằng', 'Ngày tốt nghiệp', 'Lĩnh vực chuyên môn', 'Hình thức hành nghề',
		'Tổng Thời gian thực hành', 'Ngày bắt đầu', 'Ngày (Đ)', 'Tháng (Đ)', 'Năm (Đ)', 'Ngày kết thúc', 'Ngày (K)',
		'Tháng (K)', 'Năm (K)', 'Địa điểm thực hành',
		...rotHead(1), ...rotHead(2), ...rotHead(3, 2), // nhóm 3 gõ nhầm "…hướng dẫn 2" như sổ thật
		'Người hướng dẫn chính (DD, KTV)', 'ông/bà chính', 'MNV chính', 'Ghi chú', 'đã hoàn thành', 'nghỉ học', 'TH1',
	]); // prettier-ignore
	const base = (code, name, cccd) => [
		1, code.split('.')[0], code, name, 'ông', '15/08/1999', 1999, 'Bác sĩ y khoa', 'Xóm 1', 'Nghệ An', cccd,
		'12/11/2024', 'Bộ Công an', '0900000000', 2023, 'ĐH Y', '13/07/2023', '13/07/2023', 'Bác sĩ y khoa',
		'Khám bệnh, chữa bệnh y khoa', '12 tháng', '16/06/2025', 16, 6, 2025, '15/06/2026', 15, 6, 2026,
	]; // prettier-ignore
	const rot = (dept, s, e, dur, mentor, mnv, dob) => [
		dept,
		s,
		e,
		dur,
		mentor,
		'ông',
		mnv,
		dob,
		'BSCKII',
		'0001/NA-CCHN',
		'27/04/2015',
		'',
		'Khám chữa bệnh',
	];
	ws.addRow([
		...base('226.BS', 'Học Viên A', '040099000001'),
		'Tại các khoa: Cấp cứu, Nội tim mạch 2, Nội hô hấp',
		...rot('Cấp cứu', '16/06/2025', '15/09/2025', '03 tháng', 'NHD Một', '329', '10/06/1987'),
		...rot(
			'Nội tim mạch 2',
			'16/09/2025',
			'15/10/2025',
			'01 tháng',
			'NHD Hai',
			'763',
			'26/12/1978',
		),
		...rot('Nội hô hấp', '16/10/2025', '15/10/2025', '1 tuần', 'Sai Tên', '999', '01/01/1980'), // ngày ngược
		'',
		'',
		'',
		'BV YHCT',
		'',
		'',
		'về Hồi sức cấp cứu',
	]);
	ws.addRow([...base('227.BS', 'Học Viên B', '040099000002'), 'Tại các khoa: Cấp cứu']);
	return wb.xlsx.writeBuffer();
}

test('đọc sổ: nhóm vòng theo vị trí (kể cả tiêu đề gõ nhầm số), ngày, NHD', async () => {
	const records = await parseBook(await bookBuffer());
	assert.equal(records.length, 2);
	const [a, b] = records;
	assert.equal(a.practice_code, '226.BS');
	assert.equal(a.start_date, '2025-06-16');
	assert.equal(a.sending_unit, 'BV YHCT');
	assert.equal(a.rotations.length, 3);
	assert.equal(a.rotations[1].department, 'Nội tim mạch 2');
	assert.equal(a.rotations[1].mentor_dob, '1978-12-26');
	assert.equal(a.rotations[2].mentor_dob, '1980-01-01'); // cột "…hướng dẫn 2" trong nhóm 3 vẫn thuộc vòng 3
	assert.equal(a.rotations[0].mentor_staff_no, '329');
	assert.equal(b.rotations.length, 0);
	assert.equal(b.practice_location, 'Tại các khoa: Cấp cứu');

	const lookups = {
		course: { id: 'KH1', is_rolling: true },
		matchDept: createDepartmentMatcher(DEPTS),
		programByCode: new Map([['GPHN_BS_1', { id: 'CT1', code: 'GPHN_BS_1' }]]),
		linkedPrograms: new Set(),
		userByStaffNo: new Map([
			[329, { id: 'U329', full_name: 'NHD Một' }],
			[763, { id: 'U763', full_name: 'Tên Khác' }],
		]),
		enrollmentByCode: new Map([['227.BS', { id: 'DK1', course_id: 'KH1' }]]),
		roundByProgramDept: new Map([['CT1|D_CC', { lesson_id: 'L_HSCC', title: 'Vòng HSCC' }]]),
	};
	const { items, warnings } = buildPreview(records, [], lookups);
	const [ia, ib] = items;
	assert.equal(ia.action, 'new');
	assert.equal(ib.action, 'update');
	assert.equal(ib.enrollment_id, 'DK1');
	assert.equal(ia.program_id, 'CT1');
	assert.deepEqual(
		ia.rotations.map((r) => [r.department_id, r.lesson_id, r.user_id, r.start_date]),
		[
			['D_CC', 'L_HSCC', 'U329', '2025-06-16'],
			['D_NTM2', null, null, '2025-09-16'], // MNV 763 khác tên → không gắn tài khoản
			['D_NDU', null, null, null], // ngày ngược → bỏ ngày
		],
	);
	assert.equal(ia.rotations[2].mentor_name, 'Sai Tên'); // vẫn giữ tên NHD như sổ
	assert.ok(warnings.some((w) => w.startsWith('MNV 763 là "Tên Khác"')));
	assert.ok(warnings.some((w) => w.startsWith('Không thấy nhân sự MNV 999')));
	assert.ok(warnings.some((w) => w.startsWith('Vòng có ngày kết thúc trước')));
	assert.ok(warnings.some((w) => w.startsWith('Chỉ có địa điểm chung')));
});

test('nhãn lĩnh vực TH n như công thức IFS của sổ', () => {
	assert.equal(practiceFieldLabel('Khoa Cấp Cứu'), 'về Hồi sức cấp cứu');
	assert.equal(practiceFieldLabel('Khoa Hồi Sức Tích Cực - Ngoại Khoa'), 'về Hồi sức cấp cứu');
	assert.equal(practiceFieldLabel('Khoa Phẫu Thuật TM Lồng Ngực'), 'lĩnh vực Ngoại khoa');
	assert.equal(practiceFieldLabel('Khoa Nội Tim Mạch 2'), 'lĩnh vực Nội khoa');
	assert.equal(practiceFieldLabel('Khoa Nhi - Sơ sinh'), 'lĩnh vực Nhi khoa');
	assert.equal(practiceFieldLabel('Khoa Phụ Sản'), 'lĩnh vực Sản phụ khoa');
	assert.equal(practiceFieldLabel('Khoa Mắt'), 'về Mắt');
	assert.equal(practiceFieldLabel('Khoa Y Học Cổ Truyền'), 'về Y Học Cổ Truyền');
	assert.equal(practiceFieldLabel('Khoa Dược'), 'Khác');
});

test('xuất sổ: đúng tiêu đề, ngày tách Ngày/Tháng/Năm, TH n theo khoa', () => {
	const e = {
		id: 'E1',
		practice_code: '226.BS',
		legacy_code: '226',
		full_name: 'Học Viên A',
		gender: 'male',
		dob: '1999-08-15',
		start_date: new Date('2025-06-16T00:00:00Z'),
		end_date: new Date('2026-06-15T00:00:00Z'),
		total_duration: '12 tháng',
		progress_status: 'completed',
	};
	const rots = [
		{
			department_name: 'Khoa Cấp Cứu',
			start_date: '2025-06-16',
			end_date: '2025-09-15',
			mentor_name: 'NHD Một',
		},
	];
	const ws = buildWorkbook({ enrollments: [e], byEnrollment: new Map([['E1', rots]]) })
		.worksheets[0];
	const head = ws.getRow(1).values.slice(1);
	assert.equal(head.length, 30 + 11 * 13 + 9 + 3 + 11);
	assert.equal(head[9], 'Nơi sinh \n(Tỉnh)');
	assert.equal(head[38], 'TDCM \nng hướng dẫn 1');
	assert.equal(head[head.length - 1], 'TH11');
	const row = ws.getRow(2).values.slice(1);
	const at = (h) => row[head.indexOf(h)];
	assert.equal(at('Giới tính'), 'ông');
	assert.equal(at('Năm sinh'), 1999);
	assert.deepEqual([at('Ngày (Đ)'), at('Tháng (Đ)'), at('Năm (Đ)')], [16, 6, 2025]);
	assert.equal(at('Khoa thực hành 1'), 'Cấp Cứu');
	assert.equal(at('Tổng thời gian khoa 1'), '03 tháng');
	assert.equal(at('Địa điểm thực hành'), 'Tại các khoa: Cấp Cứu');
	assert.equal(at('đã hoàn thành'), 'x');
	assert.equal(at('TH1'), 'về Hồi sức cấp cứu');
	assert.equal(at('TH2'), 'Khác');
});

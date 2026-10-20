const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { parseDuration, formatDuration, toDays } = require('../../src/utils/trainingDuration');
const { createDepartmentMatcher } = require('../../src/utils/departmentMatch');
const { parseTraineeTypes } = require('../../src/utils/traineeTypeMatch');
const {
	parseWorkbook,
	buildPreview,
} = require('../../src/modules/training/programs/programCatalogImportService');

const DEPTS = [
	{ id: 'D1', name: 'Khoa Cấp Cứu' },
	{ id: 'D2', name: 'Khoa Hồi Sức Tích Cực' },
	{ id: 'D3', name: 'Khoa Hồi Sức Tích Cực - Ngoại Khoa' },
	{ id: 'D4', name: 'Khoa Chống Độc' },
	{ id: 'D5', name: 'Khoa Thăm Dò Chức Năng' },
	{ id: 'D6', name: 'Khoa Răng Hàm Mặt' },
	{ id: 'D7', name: 'Khoa Mắt' },
	{ id: 'D8', name: 'Khoa Nội Cơ Xương Khớp' },
	{ id: 'D9', name: 'Khoa Nội Tim Mạch 1' },
	{ id: 'D10', name: 'Khoa Nội Tim Mạch 2' },
];

test('parseDuration đọc các cách viết thời lượng trong danh mục', () => {
	assert.deepEqual(parseDuration('03 tháng '), { value: 3, unit: 'month' });
	assert.deepEqual(parseDuration('1,5 tháng'), { value: 1.5, unit: 'month' });
	assert.deepEqual(parseDuration('1.5  tuần'), { value: 1.5, unit: 'week' });
	assert.deepEqual(parseDuration('07 ngày'), { value: 7, unit: 'day' });
	assert.equal(parseDuration('vài tháng'), null);
	assert.equal(parseDuration('3'), null);
	assert.equal(formatDuration(3, 'month'), '03 tháng');
	assert.equal(formatDuration(1.5, 'week'), '1,5 tuần');
	assert.equal(toDays(2, 'week'), 14);
});

test('createDepartmentMatcher: trùng tên, viết tắt, chứa cụm từ, mơ hồ', () => {
	const match = createDepartmentMatcher(DEPTS);
	assert.equal(match('Hồi sức tích cực').id, 'D2');
	assert.equal(match('Hồi sức tích cực ngoại khoa').id, 'D3');
	assert.equal(match('TDCN').id, 'D5');
	assert.equal(match('RHM').id, 'D6');
	assert.equal(match('Cơ xương khớp').id, 'D8');
	assert.deepEqual(match('Nội tim mạch').ambiguous.length, 2);
	assert.equal(match('rmh'), null);
});

async function catalogBuffer() {
	const wb = new ExcelJS.Workbook();
	const a = wb.addWorksheet('Mã CT');
	a.addRow(['DANH SÁCH CÁC CHƯƠNG TRÌNH ĐÀO TẠO (MÔN HỌC)']);
	a.addRow([]);
	a.addRow([
		'STT',
		'Mã Chương trình đào tạo',
		'Tên Chương trình đào tạo',
		'Lý thuyết',
		'Thực hành',
		'Tổng số tiết',
		'Số giờ tín chỉ',
		'Thời lượng',
		'Đối tượng học viên',
		'Học phí',
		'Khoa phụ trách giảng dạy',
	]);
	a.addRow([
		1,
		'ĐTLT_4',
		'Kỹ thuật viên Nội soi',
		null,
		null,
		null,
		null,
		'03 tháng ',
		'Điều dưỡng, KTV',
		null,
		'TDCN',
	]);
	a.addRow([
		2,
		'ĐTLT_99',
		'Không rõ khoa',
		null,
		null,
		null,
		null,
		'1,5 tháng',
		'Bác sĩ',
		null,
		'Ng TH2',
	]);
	a.addRow([
		3,
		'GPHN_BS_1',
		'Thực hành GPHN Bác sĩ y khoa',
		null,
		null,
		null,
		null,
		'12 tháng',
		'Bác sĩ',
		null,
		'Nhiều khoa phụ trách tùy từng vòng học',
	]);
	const b = wb.addWorksheet('Bài học');
	b.addRow([null, 'Đối với nội dung thực hành']);
	b.addRow([null, 'Mã', 'Nội dung', 'Thời gian']);
	b.addRow([1, 'GPHN_BS_1', 'Thực hành GPHN Bác sĩ y khoa', '12 tháng']);
	b.addRow([null, 'TH_BS_HSCC', 'Thực hành vòng Hồi sức cấp cứu', '03 tháng']);
	b.addRow([null, null, 'Cấp cứu', '03 tháng']);
	b.addRow([null, null, 'Chống độc', '03 tháng']);
	b.addRow([]);
	b.addRow([null, 'TH_BS_CK', 'Thực hành vòng chuyên khoa lẻ (RHM, Mắt)', '02 tháng']);
	b.addRow([null, null, 'rmh']);
	return wb.xlsx.writeBuffer();
}

test('nhập danh mục: chương trình, loại hình theo mã, vòng + khoa', async () => {
	const parsed = await parseWorkbook(await catalogBuffer());
	const lookups = {
		matchDept: createDepartmentMatcher(DEPTS),
		typeIds: new Set(['TRNTP-DTLT', 'TRNTP-GPHN']),
		traineeTypeIds: new Set(['TRNTYPE-BS', 'TRNTYPE-DD', 'TRNTYPE-KTV']),
		programByCode: new Map(),
		lessonByCode: new Map(),
		linkByPair: new Map(),
	};
	const { programItems, lessonItems, warnings } = buildPreview(parsed, lookups);

	assert.equal(programItems.length, 3);
	const [dtlt, unknown, gphn] = programItems;
	assert.equal(dtlt.training_type_id, 'TRNTP-DTLT');
	assert.equal(dtlt.department_id, 'D5');
	assert.equal(dtlt.duration_value, 3);
	assert.equal(dtlt.duration_unit, 'month');
	assert.deepEqual(dtlt.trainee_type_ids, ['TRNTYPE-DD', 'TRNTYPE-KTV']);
	assert.deepEqual(gphn.trainee_type_ids, ['TRNTYPE-BS']);
	assert.equal(unknown.department_id, null);
	assert.equal(unknown.department_note, 'Ng TH2');
	assert.equal(gphn.training_type_id, 'TRNTP-GPHN');
	assert.match(gphn.department_note, /Nhiều khoa/);

	assert.deepEqual(
		lessonItems.map((l) => [l.program_code, l.code, l.allow_split, l.departments.map((d) => d.id)]),
		[
			['GPHN_BS_1', 'TH_BS_HSCC', false, ['D1', 'D4']],
			['GPHN_BS_1', 'TH_BS_CK', true, ['D6', 'D7']],
		],
	);
	assert.ok(warnings.some((w) => w.includes('Ng TH2')));
	assert.ok(warnings.some((w) => w.includes('"rmh"')));
});

test('parseTraineeTypes: viết tắt, điều kiện kèm theo, nhân viên y tế', () => {
	assert.deepEqual(parseTraineeTypes('BS, ĐD,KTV, YS YHCT').ids, [
		'TRNTYPE-BS',
		'TRNTYPE-DD',
		'TRNTYPE-KTV',
		'TRNTYPE-YS',
	]);
	assert.deepEqual(parseTraineeTypes('Bác sĩ đã có CCHN/GPHN').ids, ['TRNTYPE-BS']);
	assert.deepEqual(parseTraineeTypes('Điều dưỡng, Y sỹ, KTV').ids, ['TRNTYPE-DD', 'TRNTYPE-YS', 'TRNTYPE-KTV']);
	assert.deepEqual(parseTraineeTypes('BS, KTV xét nghiệm, Cử nhân sinh học, ĐD, Dược sĩ').ids, [
		'TRNTYPE-BS',
		'TRNTYPE-KTV',
		'TRNTYPE-CN',
		'TRNTYPE-DD',
		'TRNTYPE-DSI',
	]);
	assert.equal(parseTraineeTypes('Nhân viên y tế').ids.length, 7);
	assert.deepEqual(parseTraineeTypes('Bác sĩ, Kế toán'), { ids: ['TRNTYPE-BS'], unknown: ['Kế toán'] });
	assert.deepEqual(parseTraineeTypes(null), { ids: [], unknown: [] });
});

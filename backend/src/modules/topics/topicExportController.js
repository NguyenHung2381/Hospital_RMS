const ExcelJS = require('exceljs');
const topicService = require('./topicService');
const { fnt, al, sf, bAll, bNoBot, bNoTop, bSides } = require('../../utils/excelStyle');
const { sendWorkbook } = require('../../utils/response');

const ROLE_LABELS = {
	leader: 'Chủ nhiệm',
	secretary: 'Thư ký',
	member: 'Thành viên',
};

function buildSheet(ws, data, { customTitle, customSubtitle, refNumber, refDate }) {
	ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }];
	ws.properties.defaultRowHeight = 20;

	// ── Rows 1–3: letterhead ─────────────────────────────────────────────────
	const hdr = [
		[
			1,
			'A1:D1',
			'SỞ Y TẾ NGHỆ AN',
			fnt({ size: 11 }),
			'F1:J1',
			'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM',
			fnt({ bold: true, size: 11 }),
			18,
		],
		[
			2,
			'A2:D2',
			'BỆNH VIỆN HNĐK NGHỆ AN',
			fnt({ bold: true, size: 11 }),
			'F2:J2',
			'Độc lập - Tự do - Hạnh phúc',
			fnt({ italic: true, size: 11 }),
			18,
		],
		[
			3,
			'A3:D3',
			refNumber ? `Số: ${refNumber}/TB-BV` : '',
			fnt({ size: 10 }),
			'F3:J3',
			refDate ? `Nghệ An, ngày ${refDate}` : '',
			fnt({ italic: true, size: 10 }),
			16,
		],
	];
	for (const [row, lRange, lVal, lFont, rRange, rVal, rFont, h] of hdr) {
		ws.mergeCells(lRange);
		Object.assign(ws.getCell(lRange.split(':')[0]), {
			value: lVal,
			font: lFont,
			alignment: al('center', false),
		});
		ws.mergeCells(rRange);
		Object.assign(ws.getCell(rRange.split(':')[0]), {
			value: rVal,
			font: rFont,
			alignment: al('center', false),
		});
		ws.getRow(row).height = h;
	}

	// ── Row 4: spacer ────────────────────────────────────────────────────────
	ws.getRow(4).height = 8;

	// ── Row 5: main title ────────────────────────────────────────────────────
	ws.mergeCells('A5:J5');
	Object.assign(ws.getCell('A5'), {
		value: customTitle,
		font: fnt({ bold: true, size: 13 }),
		alignment: al('center', true),
	});
	ws.getRow(5).height = 36;

	// ── Row 6: subtitle ──────────────────────────────────────────────────────
	ws.mergeCells('A6:J6');
	Object.assign(ws.getCell('A6'), {
		value: customSubtitle,
		font: fnt({ italic: true, size: 11 }),
		alignment: al('center', true),
	});
	ws.getRow(6).height = 24;

	// ── Row 7: spacer ────────────────────────────────────────────────────────
	ws.getRow(7).height = 8;

	// ── Row 8: column headers ────────────────────────────────────────────────
	const COLS = [
		'STT',
		'Khoa/phòng/TT',
		'Tên Sáng kiến/Đề tài',
		'Thể loại',
		'Cấp độ',
		'Đợt NC',
		'Họ và tên',
		'Chức vụ',
		'MNV',
		'Vai trò nhóm NC',
	];
	COLS.forEach((h, i) => {
		Object.assign(ws.getCell(8, i + 1), {
			value: h,
			font: fnt({ bold: true, size: 10 }),
			fill: sf('FFD9E1F2'),
			alignment: al('center', true),
			border: bAll,
		});
	});
	ws.getRow(8).height = 30;

	// ── Data rows ────────────────────────────────────────────────────────────
	let curRow = 9;

	data.forEach((topic, idx) => {
		const members = topic.members ?? [];
		const rowCount = Math.max(members.length, 1);
		const startRow = curRow;
		const endRow = curRow + rowCount - 1;

		// Topic columns A–F (merge vertically across all member rows)
		const topicDefs = [
			{ col: 1, val: idx + 1, center: true },
			{ col: 2, val: topic.department_name ?? '', center: false },
			{ col: 3, val: topic.title, center: false },
			{ col: 4, val: topic.category_name ?? '', center: true },
			{ col: 5, val: topic.level_name ?? '', center: true },
			{ col: 6, val: topic.round_name ?? '', center: true },
		];
		topicDefs.forEach(({ col, val, center }) => {
			if (rowCount > 1) ws.mergeCells(startRow, col, endRow, col);
			Object.assign(ws.getCell(startRow, col), {
				value: val,
				font: fnt({ size: 10 }),
				alignment: al(center ? 'center' : 'left', true),
				border: bAll,
			});
		});

		// Member columns G–J (one row per member, grouped borders)
		for (let mi = 0; mi < rowCount; mi++) {
			const r = curRow + mi;
			const m = members[mi];
			const memBorder =
				rowCount === 1 ? bAll : mi === 0 ? bNoBot : mi === rowCount - 1 ? bNoTop : bSides;

			const staffNum = m?.staff_number != null ? m.staff_number : '';
			const roleLabel = m ? (ROLE_LABELS[m.role] ?? m.role ?? '') : '';

			[
				{ col: 7, val: m?.ho_ten ?? '', center: false },
				{ col: 8, val: m?.chuc_vu ?? '', center: false },
				{ col: 9, val: staffNum, center: true },
				{ col: 10, val: roleLabel, center: false },
			].forEach(({ col, val, center }) => {
				Object.assign(ws.getCell(r, col), {
					value: val,
					font: fnt({ size: 10 }),
					alignment: al(center ? 'center' : 'left', true),
					border: memBorder,
				});
			});

			ws.getRow(r).height = 20;
		}

		curRow += rowCount;
	});

	// ── Column widths ────────────────────────────────────────────────────────
	[4.5, 13, 34, 6.5, 8.5, 13, 22, 15, 10.5, 10.5].forEach((w, i) => {
		ws.getColumn(i + 1).width = w;
	});

	ws.pageSetup = {
		orientation: 'landscape',
		paperSize: 9,
		fitToPage: true,
		fitToWidth: 1,
		printTitlesRow: '1:8',
	};
}

async function exportExcel(req, res, next) {
	try {
		const {
			ids,
			fileName = 'lich-bao-ve-de-tai',
			customTitle = 'LỊCH BẢO VỆ ĐỀ CƯƠNG SÁNG KIẾN, ĐỀ TÀI NGHIÊN CỨU KHOA HỌC CẤP CƠ SỞ',
			customSubtitle = '',
			refNumber = '',
			refDate = '',
		} = req.body;

		if (!Array.isArray(ids) || ids.length === 0) {
			return res.status(400).json({ success: false, message: 'Danh sách đề tài trống' });
		}

		// Chỉ xuất đề tài trong phạm vi người gọi (danh sách mã do client gửi lên)
		const data = await topicService.getForExport(await topicService.idsInScope(ids, req.user));

		const wb = new ExcelJS.Workbook();
		wb.creator = 'RMS Hospital';
		wb.created = new Date();
		buildSheet(wb.addWorksheet('Danh sách đề cương'), data, {
			customTitle,
			customSubtitle,
			refNumber,
			refDate,
		});

		const safeName =
			(fileName || 'lich-bao-ve-de-tai').replace(/[/\\?%*:|"<>]/g, '').trim() ||
			'lich-bao-ve-de-tai';

		await sendWorkbook(res, wb, safeName + '.xlsx');
	} catch (err) {
		next(err);
	}
}

module.exports = { exportExcel };

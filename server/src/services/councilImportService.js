/**
 * councilImportService.js — Nhập hội đồng từ file Excel lịch bảo vệ
 * (layout theo file chuẩn bệnh viện, cùng format với councilExportController:
 * mỗi dòng 1 đề tài, 3 cột hội đồng multi-line: tên / khoa / vai trò).
 *
 * Luồng: parse file → gom các dòng cùng bộ 5 ghế thành hội đồng → match người
 * với users/external_reviewers, match đề tài (đã có sẵn trong đợt) theo tên →
 * dry_run trả preview; commit tạo hội đồng draft + 5 ghế + gán đề tài & phiên.
 */
const ExcelJS = require('exceljs');
const { getPool, sql } = require('../config/db');
const councilService = require('./councilService');

const SEAT_ORDER = ['chairman', 'secretary', 'reviewer1', 'reviewer2', 'member'];
const ROLE_BY_NORM = {
	'chu tich': 'chairman',
	'chu tich hd': 'chairman',
	'thu ky': 'secretary',
	'phan bien 1': 'reviewer1',
	'phan bien 2': 'reviewer2',
	'thanh vien': 'member',
};

// ─── Chuẩn hoá chuỗi (port từ gen_council_seed_2026.py) ──────────────────────
const stripDiacritics = (s) =>
	String(s)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D');

const norm = (s) => {
	if (!s) return '';
	return stripDiacritics(s)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
};

// Bỏ tiền tố Khoa/Phòng/TT... để "Khoa Bỏng" == "Bỏng"
const normDept = (s) =>
	norm(s).replace(/^(khoa|phong|trung tam|tt|don vi|vp khoa)\s+/, '');

// "PGS.TS. Nguyễn Văn A" / "BSCK2. X" → phần tên sau học vị
const stripQualification = (s) => {
	const t = String(s || '').trim();
	const lastDot = t.lastIndexOf('.');
	const name = lastDot >= 0 ? t.slice(lastDot + 1) : t;
	return name.replace(/^\s*(GS|PGS|TS|ThS|BSCKII|BSCKI|BSCK2|BSCK1|BSNT|BS|KS|CN|CĐ|DS|ĐD)\s+/i, '').trim();
};

// Dice coefficient trên bigram — fuzzy match tên đề tài gõ lệch nhẹ
const bigrams = (s) => {
	const set = new Map();
	for (let i = 0; i < s.length - 1; i++) {
		const b = s.slice(i, i + 2);
		set.set(b, (set.get(b) || 0) + 1);
	}
	return set;
};
const dice = (a, b) => {
	if (!a.length || !b.length) return 0;
	if (a === b) return 1;
	const ba = bigrams(a);
	const bb = bigrams(b);
	let overlap = 0;
	let total = 0;
	for (const [g, n] of ba) {
		total += n;
		if (bb.has(g)) overlap += Math.min(n, bb.get(g));
	}
	for (const [, n] of bb) total += n;
	return (2 * overlap) / total;
};

// ─── Đọc file Excel ──────────────────────────────────────────────────────────
const cellText = (cell) => {
	if (!cell) return '';
	// cell.text xử lý sẵn richText/formula-result; formula lỗi thì trả ''
	try {
		return String(cell.text ?? '').trim();
	} catch {
		return '';
	}
};

const splitLines = (s) =>
	String(s)
		.split('\n')
		.map((x) => x.trim())
		.filter(Boolean);

// Tìm sheet + dòng header (dòng có ô "STT" và ô "Hội đồng") — file thật có
// 3-4 dòng tiêu đề văn bản phía trên nên không đọc cứng từ dòng 1.
const findHeader = (workbook) => {
	for (const ws of workbook.worksheets) {
		const scanMax = Math.min(ws.rowCount, 30);
		for (let r = 1; r <= scanMax; r++) {
			const row = ws.getRow(r);
			let sttCol = 0;
			let councilCol = 0;
			let titleCol = 0;
			let sessionCol = 0;
			let locationCol = 0;
			// Ô merged (VD "Hội đồng" phủ 3 cột) trả cùng text cho mọi cột con —
			// chỉ nhận cột ĐẦU TIÊN match cho mỗi header.
			row.eachCell({ includeEmpty: false }, (cell, col) => {
				const h = norm(cellText(cell));
				if (h === 'stt' && !sttCol) sttCol = col;
				else if (h === 'hoi dong' && !councilCol) councilCol = col;
				else if (h.startsWith('ten') && (h.includes('de tai') || h.includes('sang kien')) && !titleCol) titleCol = col;
				else if (h === 'phien' && !sessionCol) sessionCol = col;
				else if (h === 'dia diem' && !locationCol) locationCol = col;
			});
			if (sttCol && councilCol && titleCol) {
				return { ws, headerRow: r, sttCol, councilCol, titleCol, sessionCol, locationCol };
			}
		}
	}
	return null;
};

const parseSession = (s) => {
	const n = norm(s);
	if (!n) return null;
	if (n.includes('phien 2') || n.includes('chieu')) return 'afternoon';
	if (n.includes('phien 1') || n.includes('sang')) return 'morning';
	return null;
};

// Parse toàn bộ file → danh sách dòng đề tài kèm 5 ghế hội đồng thô
const parseWorkbook = async (buffer) => {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer);
	} catch {
		throw Object.assign(new Error('File không đọc được — cần file .xlsx hợp lệ.'), { status: 400 });
	}
	const header = findHeader(workbook);
	if (!header) {
		throw Object.assign(
			new Error('Không tìm thấy dòng tiêu đề (cần các cột STT, Tên đề tài, Hội đồng).'),
			{ status: 400 },
		);
	}
	const { ws, headerRow, councilCol, titleCol, sessionCol, locationCol } = header;

	const rows = [];
	let emptyStreak = 0;
	// dims file thật có thể "ảo" tới cả triệu dòng — dừng khi gặp 30 dòng trống liên tiếp
	for (let r = headerRow + 1; r <= ws.rowCount && emptyStreak < 30; r++) {
		const row = ws.getRow(r);
		const title = cellText(row.getCell(titleCol)).replace(/\s+/g, ' ').trim();
		const names = splitLines(cellText(row.getCell(councilCol)));
		if (!title && !names.length) {
			emptyStreak++;
			continue;
		}
		emptyStreak = 0;
		if (!title || !names.length) continue; // dòng ghi chú / dở dang

		const depts = splitLines(cellText(row.getCell(councilCol + 1)));
		const roleLabels = splitLines(cellText(row.getCell(councilCol + 2)));
		const seats = names.slice(0, 5).map((rawName, i) => ({
			role: ROLE_BY_NORM[norm(roleLabels[i])] || SEAT_ORDER[i],
			raw_name: rawName,
			raw_dept: depts[i] || '',
		}));

		rows.push({
			row: r,
			raw_title: title,
			session: sessionCol ? parseSession(cellText(row.getCell(sessionCol))) : null,
			location: locationCol ? cellText(row.getCell(locationCol)) : '',
			seats,
		});
	}
	if (!rows.length) {
		throw Object.assign(new Error('File không có dòng dữ liệu nào.'), { status: 400 });
	}
	return rows;
};

// ─── Match người / đề tài với DB ─────────────────────────────────────────────
const loadDb = async (roundId) => {
	const pool = await getPool();
	const [usersRes, extRes, topicsRes, existingRes] = await Promise.all([
		pool.request().query(`
			SELECT u.id, u.full_name, u.department_id, d.name AS department_name,
			       d.specialty_group
			FROM users u
			LEFT JOIN departments d ON d.id = u.department_id
			WHERE u.is_active = 1 AND u.account_type <> 'dept'
		`),
		pool.request().query(`
			SELECT id, full_name, organization FROM external_reviewers WHERE is_active = 1
		`),
		pool.request().input('round_id', sql.VarChar(10), roundId).query(`
			SELECT t.id, t.title, t.council_id FROM topics t WHERE t.round_id = @round_id
		`),
		pool.request().input('round_id', sql.VarChar(10), roundId).query(`
			SELECT cm.council_id, cm.user_id
			FROM council_members cm
			INNER JOIN councils c ON c.id = cm.council_id
			WHERE c.round_id = @round_id AND cm.user_id IS NOT NULL
		`),
	]);

	const usersByName = new Map();
	for (const u of usersRes.recordset) {
		const key = norm(u.full_name);
		if (!usersByName.has(key)) usersByName.set(key, []);
		usersByName.get(key).push(u);
	}
	const externalsByName = new Map();
	for (const e of extRes.recordset) {
		const key = norm(e.full_name);
		if (!externalsByName.has(key)) externalsByName.set(key, []);
		externalsByName.get(key).push(e);
	}
	// Bộ user 5 ghế của các hội đồng đã có trong đợt — chống nhập trùng
	const existingSeatSets = new Map();
	for (const m of existingRes.recordset) {
		if (!existingSeatSets.has(m.council_id)) existingSeatSets.set(m.council_id, new Set());
		existingSeatSets.get(m.council_id).add(m.user_id);
	}
	return {
		usersByName,
		externalsByName,
		topics: topicsRes.recordset.map((t) => ({ ...t, norm_title: norm(t.title) })),
		existingSeatSets,
	};
};

const matchPerson = (seat, db) => {
	const nameKey = norm(stripQualification(seat.raw_name));
	if (!nameKey) return { error: 'Ô ghế trống.' };

	const candidates = db.usersByName.get(nameKey) || [];
	if (candidates.length === 1) return { matched: toMatched(candidates[0]) };
	if (candidates.length > 1) {
		// Trùng tên — phân xử bằng khoa trong file (fuzzy để chịu lỗi chính tả "Phẩu thuật")
		const dKey = normDept(seat.raw_dept);
		if (dKey) {
			const byDept = candidates.filter((u) => {
				const uDept = normDept(u.department_name || '');
				return uDept && (uDept === dKey || dice(uDept, dKey) >= 0.75);
			});
			if (byDept.length === 1) return { matched: toMatched(byDept[0]) };
		}
		return {
			error: `Trùng tên "${seat.raw_name}" (${candidates.length} người) — không phân xử được bằng khoa "${seat.raw_dept}".`,
		};
	}

	// Không có trong users → thử danh bạ người ngoài viện
	const externals = db.externalsByName.get(nameKey) || [];
	if (externals.length === 1) {
		const e = externals[0];
		return {
			matched: { type: 'external', id: e.id, full_name: e.full_name, department_name: e.organization },
		};
	}
	return {
		error: `Không tìm thấy "${seat.raw_name}" (khoa "${seat.raw_dept}") trong nhân viên lẫn danh bạ ngoài viện.`,
	};
};

const toMatched = (u) => ({
	type: 'user',
	id: u.id,
	full_name: u.full_name,
	department_name: u.department_name,
	specialty_group: u.specialty_group,
});

const matchTopic = (rawTitle, db, usedTopicIds) => {
	const key = norm(rawTitle);
	let found = db.topics.find((t) => t.norm_title === key && !usedTopicIds.has(t.id));
	if (!found) {
		// fallback fuzzy — tên gõ lệch nhẹ giữa file và DB
		let best = null;
		let bestScore = 0;
		for (const t of db.topics) {
			if (usedTopicIds.has(t.id)) continue;
			const score = dice(t.norm_title, key);
			if (score > bestScore) {
				bestScore = score;
				best = t;
			}
		}
		if (best && bestScore >= 0.85) found = best;
	}
	if (!found) return { warning: 'Không tìm thấy đề tài trùng tên trong đợt này.' };
	if (found.council_id) {
		return {
			matched: { id: found.id, title: found.title },
			warning: `Đề tài đã gán cho hội đồng ${found.council_id} — bỏ qua, không gán lại.`,
			skip_assign: true,
		};
	}
	usedTopicIds.add(found.id);
	return { matched: { id: found.id, title: found.title } };
};

// ─── Gom nhóm + build preview ────────────────────────────────────────────────
// Quy luật bệnh viện (như lịch bảo vệ 2025/2026): 1 hội đồng / địa điểm; bộ ghế
// gốc = bộ 5 người xuất hiện NHIỀU NHẤT trong nhóm; dòng nào lệch ghế so với bộ
// gốc là ghế thay thế theo đề tài (council_seat_substitutes), không phải hội
// đồng mới.
const seatPersonKey = (s) => norm(stripQualification(s.raw_name));

const buildPreview = (rows, db) => {
	// 2 hội đồng có thể dùng chung địa điểm (khác ngày — file không có cột ngày),
	// nên trong cùng địa điểm còn tách cụm theo độ giống bộ ghế: dòng chung >= 3/5
	// ghế với cụm thì là cùng hội đồng (dòng lệch 1-2 ghế = ghế thay thế).
	// ponytail: đại diện cụm = bộ ghế của dòng đầu tiên, đủ tốt vì file thật xếp
	// các dòng cùng hội đồng liền nhau; nếu gặp file xáo trộn thì nâng lên so với
	// bộ ghế đa số của cụm.
	const byLocation = new Map();
	for (const r of rows) {
		const locKey = normDept(r.location) || '(khong co dia diem)';
		if (!byLocation.has(locKey)) byLocation.set(locKey, []);
		const clusters = byLocation.get(locKey);
		const keys = new Set(r.seats.map(seatPersonKey));
		let target = clusters.find(
			(cl) => cl.repKeys.filter((k) => keys.has(k)).length >= 3,
		);
		if (!target) {
			target = { location: r.location || null, repKeys: [...keys], rows: [] };
			clusters.push(target);
		}
		target.rows.push(r);
	}
	const groups = [...byLocation.values()].flat();

	const usedTopicIds = new Set();
	const councils = groups.map((g, i) => {
		// Bộ ghế gốc: người xuất hiện nhiều nhất cho từng vai trò trong nhóm
		const baseSeats = SEAT_ORDER.map((role) => {
			const counts = new Map();
			for (const r of g.rows) {
				const seat = r.seats.find((s) => s.role === role);
				if (!seat) continue;
				const k = seatPersonKey(seat);
				if (!counts.has(k)) counts.set(k, { seat, count: 0 });
				counts.get(k).count++;
			}
			let best = null;
			for (const c of counts.values()) {
				if (!best || c.count > best.count) best = c;
			}
			return best ? { ...best.seat, role } : null;
		}).filter(Boolean);

		const seats = baseSeats.map((seat) => ({ ...seat, ...matchPerson(seat, db) }));
		const baseKeyByRole = new Map(baseSeats.map((s) => [s.role, seatPersonKey(s)]));

		const topics = g.rows.map((r) => {
			// Ghế của dòng này lệch bộ gốc → ghế thay thế cho riêng đề tài này
			const substitutes = r.seats
				.filter((s) => baseKeyByRole.has(s.role) && seatPersonKey(s) !== baseKeyByRole.get(s.role))
				.map((s) => ({ ...s, ...matchPerson(s, db) }));
			return {
				row: r.row,
				raw_title: r.raw_title,
				session: r.session,
				substitutes,
				...matchTopic(r.raw_title, db, usedTopicIds),
			};
		});

		// Chống nhập trùng: đợt đã có hội đồng với đúng bộ user này
		const userIds = new Set(
			seats.filter((s) => s.matched?.type === 'user').map((s) => s.matched.id),
		);
		let duplicate = false;
		if (userIds.size >= 5) {
			for (const set of db.existingSeatSets.values()) {
				if (set.size === userIds.size && [...userIds].every((id) => set.has(id))) {
					duplicate = true;
					break;
				}
			}
		}

		const chairman = seats.find((s) => s.role === 'chairman');
		return {
			name: `Hội đồng ${i + 1}`,
			location: g.location,
			specialty_group: chairman?.matched?.specialty_group || null,
			duplicate,
			seats,
			topics,
		};
	});

	return councils;
};

// ─── API chính: dry_run trả preview, commit tạo dữ liệu ──────────────────────
const importExcel = async ({ buffer, round_id, dry_run }, actorId) => {
	const pool = await getPool();
	const roundRes = await pool
		.request()
		.input('id', sql.VarChar(10), round_id)
		.query('SELECT id FROM research_rounds WHERE id = @id');
	if (!roundRes.recordset.length) {
		throw Object.assign(new Error('Đợt nghiên cứu không tồn tại.'), { status: 404 });
	}

	const rows = await parseWorkbook(buffer);
	const db = await loadDb(round_id);
	const councils = buildPreview(rows, db);

	const warnings = [];
	for (const c of councils) {
		if (c.duplicate) {
			warnings.push(`${c.name}: đợt này đã có hội đồng với đúng bộ 5 người này — sẽ bỏ qua khi nhập.`);
		}
		for (const s of c.seats) {
			if (s.error) warnings.push(`${c.name} — ghế ${s.role}: ${s.error}`);
		}
		for (const t of c.topics) {
			if (t.warning) warnings.push(`${c.name} — dòng ${t.row} "${t.raw_title.slice(0, 60)}…": ${t.warning}`);
			for (const s of t.substitutes) {
				if (s.error) {
					warnings.push(`${c.name} — dòng ${t.row}, ghế thay thế ${s.role}: ${s.error}`);
				} else if (s.matched?.type === 'external') {
					warnings.push(
						`${c.name} — dòng ${t.row}, ghế thay thế ${s.role}: "${s.matched.full_name}" là người ngoài viện — hệ thống chỉ hỗ trợ ghế thay thế trong viện, cần xử lý tay.`,
					);
				}
			}
		}
	}

	if (dry_run) {
		return {
			dry_run: true,
			councils,
			topics_total: rows.length,
			topics_matched: councils.reduce(
				(n, c) => n + c.topics.filter((t) => t.matched && !t.skip_assign).length,
				0,
			),
			warnings,
		};
	}

	// Commit — theo pattern autoAssign: tạo tuần tự qua councilService, hội đồng
	// draft nên lỗi giữa chừng xoá tay được ngay trên UI.
	let councilsCreated = 0;
	let topicsAssigned = 0;
	for (const c of councils) {
		if (c.duplicate) continue;
		const council = await councilService.create(
			{
				round_id,
				name: c.name,
				specialty_group: c.specialty_group,
				location: c.location,
			},
			actorId,
		);
		councilsCreated++;

		for (const s of c.seats) {
			if (!s.matched) continue; // ghế lỗi để trống — đã có warning, bổ sung tay
			await councilService.addMember(
				council.id,
				{
					user_id: s.matched.type === 'user' ? s.matched.id : null,
					external_reviewer_id: s.matched.type === 'external' ? s.matched.id : null,
					role: s.role,
				},
				actorId,
			);
		}

		const assignable = c.topics.filter((t) => t.matched && !t.skip_assign);
		if (assignable.length) {
			await councilService.assignTopics(
				council.id,
				assignable.map((t) => t.matched.id),
				actorId,
			);
			for (const t of assignable) {
				if (t.session) {
					await councilService.setTopicSession(council.id, t.matched.id, t.session, actorId);
				}
				for (const s of t.substitutes) {
					// Ghế thay thế chỉ hỗ trợ người trong viện (bảng chỉ có user_id)
					if (s.matched?.type === 'user') {
						await councilService.setSeatSubstitute(
							council.id, t.matched.id, s.role, s.matched.id, actorId,
						);
					}
				}
			}
			topicsAssigned += assignable.length;
		}
	}

	return { dry_run: false, councils_created: councilsCreated, topics_assigned: topicsAssigned, warnings };
};

module.exports = { importExcel };
// ponytail: xuất nội bộ chỉ để test parse offline (test/importParse.test.js)
module.exports._internal = { parseWorkbook, buildPreview, norm, normDept, stripQualification, dice };

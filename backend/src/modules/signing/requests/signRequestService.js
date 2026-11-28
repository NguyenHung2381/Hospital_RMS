/**
 * signRequestService.js — luồng trình ký văn bản nhiều người.
 *
 *  - Người tạo gửi 1 hồ sơ = 1..20 văn bản PDF + các BƯỚC ký nối tiếp; mỗi bước 1..20 người ký
 *    song song, mode 'all' (ai cũng phải ký) hoặc 'any' (1 người ký là đủ).
 *  - Vị trí chữ ký: người tạo đặt sẵn khung cho (văn bản, người ký) nếu muốn; văn bản chưa có
 *    khung thì người ký tự đặt khi ký (placements). Ký hàng loạt chỉ áp dụng hồ sơ đã đủ khung.
 *  - Một lần ký = ký số bằng chứng thư CÁ NHÂN của người ký lên MỌI văn bản của hồ sơ, mỗi văn
 *    bản 1 phiên bản mới (ký nối tiếp — VIN-HSM giữ nguyên các chữ ký trước, đã kiểm 27/11/2026).
 *    Cả lần ký chạy trong 1 giao dịch có khóa dòng hồ sơ: lỗi giữa chừng ⇒ không ghi gì, xóa các
 *    file vừa ghi.
 *  - Từ chối ⇒ dừng cả hồ sơ, trả người tạo. Người tạo (hoặc quản trị ký số) hủy được hồ sơ đang
 *    chạy.
 *  - Xem hồ sơ: người tạo, người có trong danh sách ký, hoặc quyền signing:manage.
 */
// Gọi qua `db.withTransaction` để test thay được
const db = require('../../../config/db');
const logger = require('../../../config/logger');
const { httpError } = require('../../../utils/httpError');
const { lazyRequire } = require('../../../utils/lazyRequire');
const { hasPermission } = require('../../../permissions/authz');
const notifSvc = require('../../notifications/notificationService');
const { broadcast } = require('../../events/eventService');
// Gọi qua `repo.xxx` / `storage.xxx` / `signing.xxx` để test thay được từng hàm.
const repo = require('./signRequestRepository');
const storage = require('./signRequestStorage');
const signing = require('../signingService');
const signingConfig = require('../signingConfig');

/** @type {typeof import('pdf-lib')} */
const PDFLib = lazyRequire('pdf-lib');

const LIMITS = Object.freeze({
	docs: 20,
	steps: 10,
	signersPerStep: 20,
	docBytes: 20 * 1024 * 1024,
});
const BATCH_MAX = 50;

const isPdf = (buf) => buf?.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';

/** Số trang (null nếu pdf-lib không đọc được — file vẫn nhận, VIN-HSM sẽ tự kiểm) */
const pageCountOf = async (buf) => {
	try {
		const doc = await PDFLib.PDFDocument.load(buf, {
			ignoreEncryption: true,
			updateMetadata: false,
		});
		return doc.getPageCount();
	} catch {
		return null;
	}
};

const canManage = (user) => hasPermission(user, 'signing', 'manage');

const notify = (type, title, userIds, requestId, message = null) =>
	notifSvc
		.pushWithEmail(type, title, [...new Set(userIds)].filter(Boolean), {
			message,
			refId: String(requestId),
			refType: 'sign_request',
			mailEvent: 'SIGN_REQUEST',
		})
		.catch((err) => logger.error(`[sign-request] gửi thông báo lỗi: ${err.message}`));

// ─── Tạo hồ sơ ──────────────────────────────────────────────────────────

/**
 * @param {{ id: string, full_name?: string }} user
 * @param {{ originalname: string, buffer: Buffer }[]} files
 * @param {{ title: string, message?: string|null, due_date?: string|null,
 *   steps: { mode: 'all'|'any', signers: string[] }[],
 *   fields?: { doc: number, user_id: string, page: number, x: number, y: number, width: number, height: number }[] }} data
 */
const create = async (user, files, data) => {
	await signingConfig.assertFeature('sign_requests');
	if (!files?.length) throw httpError(400, 'Chưa chọn văn bản cần trình ký.');
	if (files.length > LIMITS.docs) throw httpError(400, `Tối đa ${LIMITS.docs} văn bản mỗi hồ sơ.`);
	for (const f of files) {
		if (!isPdf(f.buffer)) throw httpError(400, `File không phải PDF hợp lệ: ${f.originalname}`);
		if (f.buffer.length > LIMITS.docBytes) {
			throw httpError(400, `File quá lớn (tối đa 20 MB): ${f.originalname}`);
		}
	}
	const steps = data.steps ?? [];
	if (!steps.length) throw httpError(400, 'Hồ sơ cần ít nhất 1 người ký.');
	if (steps.length > LIMITS.steps) throw httpError(400, `Tối đa ${LIMITS.steps} bước ký.`);
	const all = steps.flatMap((s) => s.signers);
	if (steps.some((s) => !s.signers.length))
		throw httpError(400, 'Mỗi bước cần ít nhất 1 người ký.');
	if (steps.some((s) => s.signers.length > LIMITS.signersPerStep)) {
		throw httpError(400, `Mỗi bước tối đa ${LIMITS.signersPerStep} người ký.`);
	}
	if (new Set(all).size !== all.length) {
		throw httpError(400, 'Một người chỉ được có mặt 1 lần trong hồ sơ.');
	}
	const active = await repo.findActiveUsers(all);
	if (active.length !== all.length) {
		throw httpError(400, 'Có người ký không tồn tại hoặc tài khoản đã bị khóa.');
	}

	const pages = await Promise.all(files.map((f) => pageCountOf(f.buffer)));
	for (const fd of data.fields ?? []) {
		if (!files[fd.doc]) throw httpError(400, 'Vị trí chữ ký trỏ tới văn bản không có trong hồ sơ.');
		if (!all.includes(fd.user_id))
			throw httpError(400, 'Vị trí chữ ký trỏ tới người không có trong hồ sơ.');
		if (pages[fd.doc] !== null && fd.page > pages[fd.doc]) {
			throw httpError(400, `Văn bản "${files[fd.doc].originalname}" không có trang ${fd.page}.`);
		}
	}

	let requestId = null;
	try {
		requestId = await db.withTransaction(async (tx) => {
			const id = await repo.insertRequest(tx, {
				title: data.title,
				message: data.message || null,
				dueDate: data.due_date || null,
				createdBy: user.id,
			});
			requestId = id;
			const docIds = [];
			for (const [i, f] of files.entries()) {
				const docId = await repo.insertDocument(tx, {
					requestId: id,
					sortOrder: i,
					fileName: f.originalname.slice(0, 255),
					pageCount: pages[i],
				});
				const rel = storage.relPathOf(id, docId, 1);
				await storage.write(rel, f.buffer);
				const sha = storage.sha256(f.buffer);
				await repo.setDocumentCurrent(tx, docId, { version: 1, path: rel, sha256: sha });
				await repo.insertVersion(tx, {
					documentId: docId,
					version: 1,
					path: rel,
					sha256: sha,
					size: f.buffer.length,
					signerUserId: null,
				});
				docIds.push(docId);
			}
			const signerIds = new Map();
			for (const [i, s] of steps.entries()) {
				await repo.insertStep(tx, id, i + 1, s.mode);
				for (const uid of s.signers) {
					signerIds.set(
						uid,
						await repo.insertSigner(tx, {
							requestId: id,
							stepNo: i + 1,
							userId: uid,
							status: i === 0 ? 'pending' : 'waiting',
						}),
					);
				}
			}
			for (const fd of data.fields ?? []) {
				await repo.insertField(tx, {
					requestId: id,
					documentId: docIds[fd.doc],
					signerId: signerIds.get(fd.user_id),
					page: fd.page,
					x: fd.x,
					y: fd.y,
					width: fd.width,
					height: fd.height,
				});
			}
			await repo.insertEvent(tx, { requestId: id, actorId: user.id, action: 'created' });
			return id;
		});
	} catch (err) {
		if (requestId) await storage.removeRequestDir(requestId);
		throw err;
	}

	await notify(
		'sign_request',
		`Văn bản cần bạn ký: ${data.title}`,
		steps[0].signers,
		requestId,
		`${user.full_name || user.id} gửi ${files.length} văn bản cần bạn ký số.`,
	);
	broadcast('update', { entity: 'sign_request' });
	return getDetail(requestId, user);
};

// ─── Xem ────────────────────────────────────────────────────────────────

const assertCanView = (reqRow, signers, user) => {
	if (!reqRow) throw httpError(404, 'Không tìm thấy hồ sơ trình ký.');
	if (
		reqRow.created_by === user.id ||
		canManage(user) ||
		signers.some((s) => s.user_id === user.id)
	)
		return;
	throw httpError(404, 'Không tìm thấy hồ sơ trình ký.');
};

/**
 * Chi tiết hồ sơ + quyền thao tác của người xem.
 * @param {number} id
 * @param {any} user
 */
const getDetail = async (id, user) => {
	const reqRow = await repo.findRequest(id);
	const signers = reqRow ? await repo.listSigners(id) : [];
	assertCanView(reqRow, signers, user);
	const [documents, steps, fields, events] = await Promise.all([
		repo.listDocuments(id),
		repo.listSteps(id),
		repo.listFields(id),
		repo.listEvents(id),
	]);
	const me = signers.find((s) => s.user_id === user.id) ?? null;
	const inProgress = reqRow.status === 'in_progress';
	const canSign = inProgress && me?.status === 'pending';
	const myFields = me ? fields.filter((f) => Number(f.signer_id) === Number(me.id)) : [];
	return {
		...reqRow,
		total_steps: Number(reqRow.total_steps),
		documents: documents.map((d) => ({
			id: Number(d.id),
			file_name: d.file_name,
			page_count: d.page_count,
			current_version: d.current_version,
		})),
		steps: steps.map((s) => ({
			step_no: s.step_no,
			mode: s.mode,
			signers: signers
				.filter((x) => x.step_no === s.step_no)
				.map((x) => ({
					id: Number(x.id),
					user_id: x.user_id,
					full_name: x.full_name,
					department_name: x.department_name,
					status: x.status,
					acted_at: x.acted_at,
					note: x.note,
				})),
		})),
		fields: fields.map((f) => ({
			id: Number(f.id),
			document_id: Number(f.document_id),
			signer_id: Number(f.signer_id),
			page: f.page,
			x: Number(f.x),
			y: Number(f.y),
			width: Number(f.width),
			height: Number(f.height),
		})),
		events: events.map((e) => ({
			action: e.action,
			actor_id: e.actor_id,
			actor_name: e.actor_name,
			note: e.note,
			created_at: e.created_at,
		})),
		me: me ? { signer_id: Number(me.id), status: me.status, step_no: me.step_no } : null,
		can_sign: canSign,
		can_reject: canSign,
		can_cancel: inProgress && (reqRow.created_by === user.id || canManage(user)),
		// Văn bản tôi còn phải tự đặt khung khi ký
		missing_field_document_ids: canSign
			? documents
					.filter((d) => !myFields.some((f) => Number(f.document_id) === Number(d.id)))
					.map((d) => Number(d.id))
			: [],
	};
};

/**
 * @param {any} user
 * @param {{ box?: string, status?: string, search?: string }} q
 * @param {{ offset: number, limit: number, page: number }} pg
 */
const list = async (user, q, pg) => {
	const box = ['todo', 'sent', 'involved', 'all'].includes(String(q.box)) ? String(q.box) : 'todo';
	if (box === 'all' && !canManage(user))
		throw httpError(403, 'Cần quyền quản lý ký số để xem mọi hồ sơ.');
	const { rows, total } = await repo.listRequests({
		box,
		userId: user.id,
		status: ['in_progress', 'completed', 'rejected', 'cancelled'].includes(String(q.status))
			? String(q.status)
			: undefined,
		search: q.search ? String(q.search).trim().slice(0, 100) : undefined,
		offset: pg.offset,
		limit: pg.limit || 50,
	});
	const pendingIds = rows
		.filter((r) => r.my_status === 'pending')
		.map((r) => Number(r.my_signer_id));
	const missing = await repo.countMissingFields(pendingIds);
	return {
		items: rows.map((r) => ({
			id: Number(r.id),
			title: r.title,
			status: r.status,
			current_step: r.current_step,
			total_steps: Number(r.total_steps),
			doc_count: Number(r.doc_count),
			signer_count: Number(r.signer_count),
			signed_count: Number(r.signed_count),
			due_date: r.due_date,
			created_at: r.created_at,
			completed_at: r.completed_at,
			created_by: r.created_by,
			creator_name: r.creator_name,
			my_status: r.my_status,
			// Ký hàng loạt được khi mọi văn bản đã có khung đặt sẵn cho tôi
			ready_for_batch:
				r.my_status === 'pending' && r.status === 'in_progress'
					? (missing.get(Number(r.my_signer_id)) ?? 1) === 0
					: false,
		})),
		total,
		page: pg.page,
		limit: pg.limit,
	};
};

const todoCount = async (user) =>
	(await signingConfig.isFeatureOn('sign_requests')) ? repo.countTodo(user.id) : 0;

/**
 * File PDF của 1 văn bản (bản mới nhất, hoặc `version`) — có kiểm quyền xem hồ sơ.
 * @returns {Promise<{ buffer: Buffer, fileName: string }>}
 */
const getDocumentFile = async (id, documentId, user, version = null) => {
	const reqRow = await repo.findRequest(id);
	const signers = reqRow ? await repo.listSigners(id) : [];
	assertCanView(reqRow, signers, user);
	const doc = (await repo.listDocuments(id)).find((d) => Number(d.id) === Number(documentId));
	if (!doc) throw httpError(404, 'Không tìm thấy văn bản.');
	let rel = doc.current_path;
	if (version && Number(version) !== doc.current_version) {
		const v = await repo.findVersion(doc.id, Number(version));
		if (!v) throw httpError(404, 'Không có phiên bản này.');
		rel = v.path;
	}
	return { buffer: await storage.read(rel), fileName: doc.file_name };
};

// ─── Ký ─────────────────────────────────────────────────────────────────

/**
 * Ký mọi văn bản của hồ sơ bằng chứng thư cá nhân của `user`.
 * @param {number} id
 * @param {{ id: string, full_name?: string }} user
 * @param {{ placements?: { document_id: number, page: number, x: number, y: number, width: number, height: number }[],
 *   note?: string|null }} [opt]
 */
const sign = async (id, user, { placements = [], note = null } = {}) => {
	await signingConfig.assertFeature('sign_requests');
	const written = [];
	const name = await signing.signerNameOf(user.id, user.full_name || user.id);
	let outcome;
	try {
		outcome = await db.withTransaction(async (tx) => {
			const reqRow = await repo.lockRequest(tx, id);
			if (!reqRow) throw httpError(404, 'Không tìm thấy hồ sơ trình ký.');
			if (reqRow.status !== 'in_progress') throw httpError(409, 'Hồ sơ không còn chờ ký.');
			const signers = await repo.listSigners(id, tx);
			const me = signers.find((s) => s.user_id === user.id);
			if (!me) throw httpError(404, 'Không tìm thấy hồ sơ trình ký.');
			if (me.status !== 'pending' || me.step_no !== reqRow.current_step) {
				throw httpError(
					409,
					me.status === 'signed' ? 'Bạn đã ký hồ sơ này.' : 'Chưa tới lượt bạn ký.',
				);
			}
			const docs = await repo.listDocuments(id, tx);
			const fields = (await repo.listFields(id, tx)).filter(
				(f) => Number(f.signer_id) === Number(me.id),
			);
			const plan = docs.map((d) => {
				const f =
					fields.find((x) => Number(x.document_id) === Number(d.id)) ??
					placements.find((p) => Number(p.document_id) === Number(d.id));
				return { doc: d, place: f };
			});
			const missing = plan.filter((p) => !p.place).map((p) => p.doc.file_name);
			if (missing.length) {
				throw httpError(400, `Chưa đặt vị trí chữ ký cho: ${missing.join(', ')}`);
			}
			for (const { doc, place } of plan) {
				if (doc.page_count && place.page > doc.page_count) {
					throw httpError(400, `Văn bản "${doc.file_name}" không có trang ${place.page}.`);
				}
				const current = await storage.read(doc.current_path);
				const signedPdf = await signing.signPdfAsUser(user.id, current, {
					docType: 'sign_request',
					docRef: `${id}:${doc.id}`,
					page: place.page,
					x: Number(place.x),
					y: Number(place.y),
					width: Number(place.width),
					height: Number(place.height),
					text: name,
				});
				const version = doc.current_version + 1;
				const rel = storage.relPathOf(id, doc.id, version);
				await storage.write(rel, signedPdf);
				written.push(rel);
				const sha = storage.sha256(signedPdf);
				await repo.insertVersion(tx, {
					documentId: doc.id,
					version,
					path: rel,
					sha256: sha,
					size: signedPdf.length,
					signerUserId: user.id,
				});
				await repo.setDocumentCurrent(tx, doc.id, { version, path: rel, sha256: sha });
			}
			await repo.updateSigner(tx, me.id, { status: 'signed', note });
			await repo.insertEvent(tx, { requestId: id, actorId: user.id, action: 'signed', note });
			return advance(
				tx,
				reqRow,
				signers.map((s) => (s.id === me.id ? { ...s, status: 'signed' } : s)),
				user,
			);
		});
	} catch (err) {
		await storage.removeAll(written);
		throw err;
	}
	await afterAdvance(id, outcome);
	broadcast('update', { entity: 'sign_request' });
	return outcome;
};

/**
 * Sau khi 1 người ký: bước hiện tại xong chưa? Xong ⇒ sang bước sau hoặc hoàn tất hồ sơ.
 * Trả mô tả để gửi thông báo sau khi commit.
 */
const advance = async (tx, reqRow, signers, user) => {
	const step = reqRow.current_step;
	const steps = await repo.listSteps(reqRow.id, tx);
	const mode = steps.find((s) => s.step_no === step)?.mode ?? 'all';
	const inStep = signers.filter((s) => s.step_no === step);
	const done =
		mode === 'any'
			? inStep.some((s) => s.status === 'signed')
			: inStep.every((s) => s.status === 'signed');
	if (!done)
		return {
			status: 'in_progress',
			step,
			next: null,
			title: reqRow.title,
			creator: reqRow.created_by,
		};
	if (mode === 'any') await repo.setStepSignersStatus(tx, reqRow.id, step, 'pending', 'skipped');
	const nextStep = steps.find((s) => s.step_no === step + 1);
	if (nextStep) {
		const next = await repo.setStepSignersStatus(
			tx,
			reqRow.id,
			nextStep.step_no,
			'waiting',
			'pending',
		);
		await repo.updateRequest(tx, reqRow.id, { currentStep: nextStep.step_no }, user.id);
		await repo.insertEvent(tx, {
			requestId: reqRow.id,
			actorId: null,
			action: 'step_started',
			note: `Bước ${nextStep.step_no}`,
		});
		return {
			status: 'in_progress',
			step: nextStep.step_no,
			next,
			title: reqRow.title,
			creator: reqRow.created_by,
		};
	}
	await repo.updateRequest(tx, reqRow.id, { status: 'completed', completed: true }, user.id);
	await repo.insertEvent(tx, { requestId: reqRow.id, actorId: null, action: 'completed' });
	return {
		status: 'completed',
		step,
		next: null,
		title: reqRow.title,
		creator: reqRow.created_by,
		everyone: signers.map((s) => s.user_id),
	};
};

const afterAdvance = async (id, o) => {
	if (o.next?.length) {
		await notify(
			'sign_request',
			`Văn bản cần bạn ký: ${o.title}`,
			o.next,
			id,
			`Tới lượt bạn ký (bước ${o.step}).`,
		);
	}
	if (o.status === 'completed') {
		await notify(
			'sign_request_completed',
			`Đã ký xong: ${o.title}`,
			[o.creator, ...(o.everyone ?? [])],
			id,
			'Mọi người đã ký số — tải bản cuối trong mục Trình ký.',
		);
	}
};

/**
 * Ký nhiều hồ sơ một lượt (chỉ hồ sơ đã có đủ khung đặt sẵn cho mình). Từng hồ sơ độc lập:
 * hồ sơ lỗi không chặn hồ sơ khác.
 * @param {number[]} ids
 * @param {any} user
 */
const batchSign = async (ids, user) => {
	const unique = [...new Set(ids.map(Number))].slice(0, BATCH_MAX);
	const results = [];
	for (const id of unique) {
		try {
			const o = await sign(id, user);
			results.push({ id, ok: true, status: o.status });
		} catch (err) {
			results.push({ id, ok: false, message: err.message });
		}
	}
	return {
		results,
		signed: results.filter((r) => r.ok).length,
		failed: results.filter((r) => !r.ok).length,
	};
};

// ─── Từ chối / hủy ──────────────────────────────────────────────────────

/** @param {number} id @param {any} user @param {string} reason */
const reject = async (id, user, reason) => {
	const text = String(reason || '').trim();
	if (!text) throw httpError(400, 'Cần nêu lý do từ chối.');
	const info = await db.withTransaction(async (tx) => {
		const reqRow = await repo.lockRequest(tx, id);
		if (!reqRow) throw httpError(404, 'Không tìm thấy hồ sơ trình ký.');
		if (reqRow.status !== 'in_progress') throw httpError(409, 'Hồ sơ không còn chờ ký.');
		const signers = await repo.listSigners(id, tx);
		const me = signers.find((s) => s.user_id === user.id);
		if (!me) throw httpError(404, 'Không tìm thấy hồ sơ trình ký.');
		if (me.status !== 'pending')
			throw httpError(409, 'Chưa tới lượt bạn hoặc bạn đã xử lý hồ sơ này.');
		await repo.updateSigner(tx, me.id, { status: 'rejected', note: text });
		await repo.closeOpenSigners(tx, id);
		await repo.updateRequest(tx, id, { status: 'rejected' }, user.id);
		await repo.insertEvent(tx, { requestId: id, actorId: user.id, action: 'rejected', note: text });
		return {
			title: reqRow.title,
			notifyIds: [
				reqRow.created_by,
				...signers.filter((s) => s.status === 'signed').map((s) => s.user_id),
			],
		};
	});
	await notify(
		'sign_request_rejected',
		`Văn bản bị từ chối ký: ${info.title}`,
		info.notifyIds,
		id,
		`${user.full_name || user.id}: ${text}`,
	);
	broadcast('update', { entity: 'sign_request' });
	return getDetail(id, user);
};

/** @param {number} id @param {any} user @param {string|null} reason */
const cancel = async (id, user, reason) => {
	const info = await db.withTransaction(async (tx) => {
		const reqRow = await repo.lockRequest(tx, id);
		if (!reqRow) throw httpError(404, 'Không tìm thấy hồ sơ trình ký.');
		if (reqRow.created_by !== user.id && !canManage(user)) {
			throw httpError(403, 'Chỉ người tạo hồ sơ mới hủy được.');
		}
		if (reqRow.status !== 'in_progress') throw httpError(409, 'Hồ sơ không còn chờ ký.');
		const signers = await repo.listSigners(id, tx);
		await repo.closeOpenSigners(tx, id);
		await repo.updateRequest(tx, id, { status: 'cancelled' }, user.id);
		await repo.insertEvent(tx, {
			requestId: id,
			actorId: user.id,
			action: 'cancelled',
			note: reason || null,
		});
		return {
			title: reqRow.title,
			pending: signers.filter((s) => s.status === 'pending').map((s) => s.user_id),
		};
	});
	await notify(
		'sign_request_cancelled',
		`Hồ sơ trình ký đã hủy: ${info.title}`,
		info.pending,
		id,
		reason || null,
	);
	broadcast('update', { entity: 'sign_request' });
	return getDetail(id, user);
};

module.exports = {
	LIMITS,
	create,
	list,
	todoCount,
	getDetail,
	getDocumentFile,
	sign,
	batchSign,
	reject,
	cancel,
};

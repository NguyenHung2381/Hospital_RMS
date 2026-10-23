import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckSvg, PlusSvg, UserCheckSvg, XSvg } from "@/assets/icons";
import {
  RowAction,
  RowActions,
  SearchableSelect,
  SearchInput,
  SelectionCount,
  TableEmpty,
} from "@/shared/components";
import sel from "@/shared/components/Table/RowSelect.module.css";
import {
  BulkButton,
  SelectCheckbox,
} from "@/shared/components/Table/RowSelect";
import { usePermission } from "@/shared/hooks/usePermission";
import { useRowSelection } from "@/shared/hooks/useRowSelection";
import { formatDateOr } from "@/shared/utils";
import type { SimpleItem } from "../hooks/useCourseDetail";
import {
  ENROLLMENT_STATUS_CFG,
  PROGRESS_LABEL,
  type Course,
  type CourseProgramLink,
  type Enrollment,
  type EnrollmentStatus,
} from "../types/course.type";
import { EnrollmentDetailModal } from "./EnrollmentDetailModal";
import { PracticeBookImportModal } from "./PracticeBookImportModal";
import { savePracticeBook } from "../utils/practiceDocuments";
import { autoArrangeCourse, cancelOpenClass, removeEnrollment } from "../api/courseApi";
import { ClassDatesModal } from "./ClassDatesModal";
import { showToast } from "@/shared/utils/feedback";
import styles from "../pages/Courses.module.css";
import tbl from "@/shared/components/Table/Table.module.css";
import { useClientPaging } from "@/shared/hooks/useClientPaging";
import { Pagination } from "@/shared/components/Table/Pagination";

/** Bỏ dấu + chữ thường để tìm "nguyen van" khớp "Nguyễn Văn". */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

/** 1 lựa chọn lọc theo chương trình; key "" = ghi danh chưa chọn / chương trình đã gỡ khỏi khóa. */
type ProgramChip = {
  key: string;
  code: string | null;
  name: string;
  count: number;
  /** Khóa ĐTLT / CTCV: sĩ số lớp của chương trình (xem CourseProgramLink.class_rule). */
  link?: CourseProgramLink;
};

/** Nhóm học viên (select ở hàng lọc): tách người mới đăng ký (chờ duyệt) khỏi người đã được phê duyệt. */
type ListView = EnrollmentStatus | "all";
const LIST_VIEWS: { key: ListView; label: string; /** Ẩn lựa chọn khi không có ai. */ optional?: boolean }[] = [
  { key: "pending", label: "Đăng ký chờ duyệt" },
  { key: "approved", label: "Đã phê duyệt" },
  { key: "waitlisted", label: "Danh sách chờ", optional: true },
  { key: "rejected", label: "Từ chối / Hủy duyệt", optional: true },
  { key: "all", label: "Tất cả" },
];
const isListView = (v: string | null): v is ListView =>
  LIST_VIEWS.some((t) => t.key === v);

/** Lớp đã mở chưa / đủ sĩ số chờ mở — kèm câu giải thích cho tooltip / dòng gợi ý. */
const classState = (l: CourseProgramLink) => {
  const open = !!l.class_opened_at;
  const ready = !open && l.class_approved >= l.class_min;
  const full = l.class_max != null && l.class_approved >= l.class_max;
  const max = l.class_max != null ? `, tối đa ${l.class_max}` : "";
  const waiting = l.class_waiting
    ? ` · ${l.class_waiting} người trong danh sách chờ của chương trình`
    : "";
  const fullNote = full ? " (đã đầy, duyệt thêm sẽ vào danh sách chờ khóa sau)" : "";
  return {
    open,
    ready,
    short: `${l.class_approved}/${l.class_min}`,
    text: open
      ? `Đã mở lớp — ${l.class_approved} học viên${max}${fullNote}${waiting}`
      : ready
        ? `Đủ sĩ số — ${l.class_approved}/${l.class_min} học viên tối thiểu${max}${fullNote}. Bấm "Mở lớp" để xếp lịch học${waiting}`
        : `Chưa mở lớp — mới ${l.class_approved}/${l.class_min} học viên tối thiểu, chưa xếp lịch được${max}${waiting}`,
  };
};

export function EnrollmentsTab({
  enrollments,
  trainees,
  course,
  programLinks,
  busy,
  onRegister,
  onDecide,
  onDecideBulk,
  onRemove,
  onSaved,
}: {
  enrollments: Enrollment[];
  trainees: SimpleItem[];
  course: Course | null;
  /** Chương trình của khóa — học viên chọn 1 khi ghi danh. */
  programLinks: CourseProgramLink[];
  busy: boolean;
  onRegister: (traineeId: string, programId?: string) => void;
  onDecide: (enrollmentId: string, status: EnrollmentStatus) => void;
  /** Trả về id các đăng ký xử lý thất bại (được giữ lại trong lựa chọn để thử lại). */
  onDecideBulk: (
    enrollmentIds: string[],
    status: EnrollmentStatus,
  ) => Promise<string[]>;
  onRemove: (enrollmentId: string) => void;
  /** Gọi sau khi sửa hồ sơ ghi danh — nạp lại danh sách. */
  onSaved: () => void;
}) {
  const [newTraineeId, setNewTraineeId] = useState("");
  const [newProgramId, setNewProgramId] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const navigate = useNavigate();
  const canViewTrainee = usePermission().has("trainees:read");
  const [bookOpen, setBookOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [adding, setAdding] = useState(enrollments.length === 0);
  const detail = enrollments.find((e) => e.id === detailId) ?? null;
  const [search, setSearch] = useState("");
  const counts = useMemo(() => {
    const c: Partial<Record<EnrollmentStatus, number>> = {};
    for (const en of enrollments) c[en.status] = (c[en.status] ?? 0) + 1;
    return c;
  }, [enrollments]);
  const viewCount = (v: ListView) =>
    v === "all" ? enrollments.length : (counts[v] ?? 0);
  // Nhóm đang xem nằm trên URL (?list=) để tải lại trang vẫn giữ.
  // Mặc định: Đã phê duyệt; khóa chưa duyệt ai mà có người chờ thì mở nhóm chờ duyệt.
  const [params, setParams] = useSearchParams();
  const listParam = params.get("list");
  const view: ListView = isListView(listParam)
    ? listParam
    : !counts.approved && counts.pending
      ? "pending"
      : "approved";
  const viewOptions = LIST_VIEWS.filter(
    (t) => !t.optional || viewCount(t.key) > 0 || t.key === view,
  );
  // Lọc chương trình cũng nằm trên URL (?program=) — chọn chương trình ở phần tóm tắt khóa sẽ mở sẵn.
  // null = mọi chương trình; "" = chưa chọn chương trình (URL: _none)
  const programParam = params.get("program");
  const programFilter =
    programParam === null ? null : programParam === "_none" ? "" : programParam;
  const setUrlParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );
  const setProgramFilter = (v: string | null) =>
    setUrlParam("program", v === "" ? "_none" : v);

  // Ghi danh chưa chọn chương trình / chương trình đã gỡ khỏi khóa gom vào key ""
  const programKey = useMemo(() => {
    const linked = new Set(programLinks.map((p) => p.program_id));
    return (e: Enrollment) =>
      e.program_id && linked.has(e.program_id) ? e.program_id : "";
  }, [programLinks]);
  // Số trên select nhóm theo chương trình đang lọc, để khớp số dòng trong bảng.
  const scopedCount = (v: ListView) =>
    enrollments.filter(
      (e) =>
        (programFilter === null || programKey(e) === programFilter) &&
        (v === "all" || e.status === v),
    ).length;

  // Khóa chỉ có 1 chương trình thì chọn sẵn; đang lọc 1 chương trình thì gợi ý chương trình đó.
  const programId =
    programLinks.length === 1
      ? programLinks[0].program_id
      : newProgramId || programFilter || "";
  const needProgram = programLinks.length > 1 && !programId;

  // Lọc theo nhóm + từ khoá (chưa lọc chương trình) — dùng để đếm số trên từng chip.
  const matches = useMemo(() => {
    const q = normalize(search.trim());
    return enrollments.filter(
      (en) =>
        (view === "all" || en.status === view) &&
        (!q ||
          normalize(
            `${en.trainee_name} ${en.trainee_id} ${en.practice_code ?? ""} ${en.trainee_phone ?? ""} ${en.trainee_email ?? ""}`,
          ).includes(q)),
    );
  }, [enrollments, search, view]);

  const filtered = useMemo(
    () =>
      programFilter === null
        ? matches
        : matches.filter((e) => programKey(e) === programFilter),
    [matches, programFilter, programKey],
  );

  // Lựa chọn lọc theo chương trình kèm số học viên khớp từ khoá/trạng thái.
  const chips = useMemo(() => {
    const count = (key: string) =>
      matches.filter((e) => programKey(e) === key).length;
    const list: ProgramChip[] = programLinks.map((p) => ({
      key: p.program_id,
      code: p.program_code,
      name: p.program_name,
      count: count(p.program_id),
      link: p.class_rule ? p : undefined,
    }));
    if (enrollments.some((e) => programKey(e) === ""))
      list.push({ key: "", code: null, name: "Chưa chọn chương trình", count: count("") });
    return list;
  }, [programLinks, matches, enrollments, programKey]);
  // Chương trình có học viên lên trước.
  const sortedChips = [...chips].sort((a, b) => +(b.count > 0) - +(a.count > 0));
  const selectedChip = chips.find((c) => c.key === programFilter);
  const showPrograms = chips.length > 1;
  const filterActive = !!search.trim() || programFilter !== null;
  const onlyProgramFilter = programFilter !== null && !search.trim();
  // Nhóm chỉ có 1 trạng thái thì cột Trạng thái thừa — chỉ giữ ở "Danh sách chờ" (vị trí chờ) và "Tất cả".
  const showStatusCol = view === "waitlisted" || view === "all";
  // Đang lọc 1 chương trình (hoặc khóa chỉ 1 chương trình) thì bỏ cột Chương trình — tiến độ dời xuống dưới tên.
  const showProgramCol = chips.length > 1 && programFilter === null;
  const colCount = 6 + (showProgramCol ? 1 : 0) + (showStatusCol ? 1 : 0);
  const classRule = programLinks.some((l) => l.class_rule);
  // Lớp đang xem: đang lọc 1 chương trình, hoặc khóa chỉ có 1 chương trình.
  const focusLink =
    programLinks.length === 1
      ? programLinks[0]
      : programLinks.find((l) => l.program_id === programFilter);
  const focusClass = focusLink?.class_rule ? classState(focusLink) : null;
  const canOpenClass = usePermission().has("courses:update");
  // Hộp thoại mở lớp / sửa ngày học của lớp đang xem
  const [classModal, setClassModal] = useState<"open" | "dates" | null>(null);

  const pg = useClientPaging(filtered);
  const visibleIds = useMemo(() => pg.paged.map((e) => e.id), [pg.paged]);
  const rowSel = useRowSelection(visibleIds);
  const resetPage = () => pg.setPage(1);
  const changeView = (v: ListView) => {
    setUrlParam("list", v);
    rowSel.clearSelection();
    resetPage();
  };

  // Hàng loạt: duyệt áp cho người chờ duyệt / bị từ chối; từ chối (hủy duyệt) áp cho người chưa bị từ chối.
  const selectedWith = (statuses: EnrollmentStatus[]) =>
    enrollments
      .filter((e) => statuses.includes(e.status) && rowSel.selectedIds.has(e.id))
      .map((e) => e.id);
  const selectedToApprove = selectedWith(["pending", "rejected"]);
  const selectedToReject = selectedWith(["pending", "approved", "waitlisted"]);
  // Tên nút theo người đang chọn: toàn người đã duyệt ⇒ "Hủy duyệt"; toàn người bị từ chối ⇒ "Duyệt lại".
  const allSelected = (ids: string[], status: EnrollmentStatus) =>
    ids.length > 0 &&
    ids.every((id) => enrollments.find((e) => e.id === id)?.status === status);
  const approveVerb = allSelected(selectedToApprove, "rejected") ? "Duyệt lại" : "Duyệt";
  const rejectVerb = allSelected(selectedToReject, "approved") ? "Hủy duyệt" : "Từ chối";

  const bulkDecide = async (status: "approved" | "rejected") => {
    const ids = status === "approved" ? selectedToApprove : selectedToReject;
    const verb = status === "approved" ? approveVerb : rejectVerb;
    if (!window.confirm(`${verb} ${ids.length} học viên đã chọn?`)) return;
    const failed = await onDecideBulk(ids, status);
    rowSel.clearSelection();
    failed.forEach(rowSel.toggleSelect);
  };

  /** Hủy duyệt người đã duyệt (đăng ký cho vui / không đến học) — hỏi lại vì học viên sẽ nhận email. */
  const unapprove = (en: Enrollment) => {
    if (
      window.confirm(
        `Hủy duyệt ${en.trainee_name}? Học viên chuyển sang nhóm "Từ chối / Hủy duyệt" và nhận email thông báo (nếu có email).`,
      )
    )
      onDecide(en.id, "rejected");
  };

  const bulkRemove = async (ids: string[]) => {
    let failed = 0;
    for (const id of ids) await removeEnrollment(id).catch(() => failed++);
    if (failed)
      showToast("error", `Không xoá được ${failed}/${ids.length} đăng ký`);
    onSaved();
  };

  const autoArrange = async () => {
    if (!course) return;
    setArranging(true);
    try {
      const { arranged, failed } = await autoArrangeCourse(course.id);
      showToast(
        failed.length ? "error" : "success",
        [
          arranged
            ? `Đã tự xếp ${arranged} hồ sơ`
            : "Không có hồ sơ nào chưa có vòng",
          ...failed.slice(0, 3),
          failed.length > 3 ? `… và ${failed.length - 3} hồ sơ khác` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      if (arranged) onSaved();
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Tự xếp thất bại",
      );
    } finally {
      setArranging(false);
    }
  };

  /** Hủy mở lớp (bấm nhầm / lớp không tổ chức được): lớp về "chờ mở", học viên giữ nguyên. */
  const [cancellingClass, setCancellingClass] = useState(false);
  const cancelClass = async () => {
    if (!course || !focusLink) return;
    const label = focusLink.program_code ?? focusLink.program_name;
    if (
      !window.confirm(
        `Hủy mở lớp ${label}? Lớp quay về trạng thái chờ mở, học viên vẫn giữ chỗ và nhận email báo tạm hoãn (nếu có email).`,
      )
    )
      return;
    setCancellingClass(true);
    try {
      await cancelOpenClass(course.id, focusLink.program_id);
      showToast("success", `Đã hủy mở lớp ${label}`);
      onSaved();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Hủy mở lớp thất bại");
    } finally {
      setCancellingClass(false);
    }
  };

  const exportBook = async () => {
    if (!course) return;
    setExporting(true);
    await savePracticeBook(course.id, course.name);
    setExporting(false);
  };

  const renderRow = (en: Enrollment, stt: number, showProgram: boolean) => {
    const cfg = ENROLLMENT_STATUS_CFG[en.status];
    const decidedLabel =
      en.status === "approved"
        ? "Duyệt"
        : en.status === "rejected"
          ? "Từ chối"
          : null;
    const progress = (
      <div className={tbl.cellSub}>
        {en.lesson_total > 0
          ? `${en.lesson_done}/${en.lesson_total} bài · `
          : ""}
        {PROGRESS_LABEL[en.progress_status] ?? ""}
      </div>
    );
    return (
      <tr
        key={en.id}
        className={`${tbl.tr} ${rowSel.isSelected(en.id) ? sel.rowSelected : ""}`}
      >
        <td className={sel.checkCol}>
          <SelectCheckbox
            title={`Chọn ${en.trainee_name}`}
            checked={rowSel.isSelected(en.id)}
            onChange={() => rowSel.toggleSelect(en.id)}
          />
        </td>
        <td className={`${tbl.td} ${tbl.tdIdx}`}>{stt}</td>
        <td className={tbl.td}>
          <button
            type="button"
            className={styles.nameBtn}
            title="Mở hồ sơ ghi danh"
            onClick={() => setDetailId(en.id)}
          >
            {en.trainee_name}
          </button>
          {en.practice_code && (
            <div className={tbl.cellSub}>Mã thực hành {en.practice_code}</div>
          )}
          {!showProgram && progress}
        </td>
        {showProgram && (
          <td className={tbl.td}>
            {en.program_name ? (
              <div
                className={styles.progCell}
                title={`${en.program_code ? `${en.program_code} — ` : ""}${en.program_name}`}
              >
                {en.program_code && <b>{en.program_code}</b>} {en.program_name}
              </div>
            ) : (
              "—"
            )}
            {progress}
          </td>
        )}
        <td className={tbl.td}>
          <div>{en.trainee_phone ?? "—"}</div>
          {en.trainee_email && (
            <div className={tbl.cellSub}>{en.trainee_email}</div>
          )}
        </td>
        <td className={tbl.td}>
          {formatDateOr(en.registered_at)}
          {decidedLabel && en.decided_at && (
            <div
              className={tbl.cellSub}
              style={{ whiteSpace: "nowrap" }}
              title={
                [
                  en.decided_by_name && `Bởi ${en.decided_by_name}`,
                  en.note && `Ghi chú: ${en.note}`,
                ]
                  .filter(Boolean)
                  .join("\n") || undefined
              }
            >
              {decidedLabel} {formatDateOr(en.decided_at)}
            </div>
          )}
        </td>
        {showStatusCol && (
          <td className={tbl.td}>
            <span
              className={styles.badge}
              style={{ background: cfg.bg, color: cfg.color }}
              title={
                en.decided_by_name
                  ? `Xử lý bởi ${en.decided_by_name}`
                  : undefined
              }
            >
              {cfg.label}
            </span>
            {en.waitlist_position != null && (
              <div className={tbl.cellSub}>
                {classRule ? "Chờ khóa sau · " : ""}
                vị trí {en.waitlist_position}
              </div>
            )}
          </td>
        )}
        <td className={`${tbl.td} ${tbl.tdActions}`}>
          <RowActions
            onEdit={() => setDetailId(en.id)}
            onDelete={() => onRemove(en.id)}
          >
            {canViewTrainee && (
              <RowAction
                title="Hồ sơ học viên (giấy tờ, điểm danh, kết quả các khóa)"
                onClick={() => navigate(`/admin/trainees/${en.trainee_id}`)}
              >
                <UserCheckSvg />
              </RowAction>
            )}
            {(en.status === "pending" || en.status === "rejected") && (
              <RowAction
                title={en.status === "rejected" ? "Duyệt lại" : "Duyệt"}
                disabled={busy}
                onClick={() => onDecide(en.id, "approved")}
              >
                <CheckSvg />
              </RowAction>
            )}
            {(en.status === "pending" || en.status === "waitlisted") && (
              <RowAction
                title="Từ chối"
                danger
                disabled={busy}
                onClick={() => onDecide(en.id, "rejected")}
              >
                <XSvg />
              </RowAction>
            )}
            {en.status === "approved" && (
              <RowAction
                title="Hủy duyệt (đăng ký nhưng không đi học)"
                danger
                disabled={busy}
                onClick={() => unapprove(en)}
              >
                <XSvg />
              </RowAction>
            )}
          </RowActions>
        </td>
      </tr>
    );
  };

  return (
    <>
      {adding && (
        <div className={styles.addPanel}>
          <SearchableSelect
            className={styles.subSearch}
            // Có chương trình: 1 học viên ghi danh được nhiều chương trình — chỉ ẩn người đã có chương trình đang chọn.
            options={trainees.filter(
              (t) =>
                !enrollments.some(
                  (e) =>
                    e.trainee_id === t.id &&
                    (!programLinks.length ||
                      (e.program_id ?? "") === programId),
                ),
            )}
            value={newTraineeId}
            onChange={setNewTraineeId}
            placeholder="Gõ tên để tìm học viên / nhân viên nội viện"
          />
          {programLinks.length > 1 && (
            <select
              className={styles.subSelect}
              style={{ flex: "0 1 280px" }}
              value={programId}
              onChange={(e) => setNewProgramId(e.target.value)}
              title="Chương trình học — bài học của chương trình tự gắn cho học viên"
            >
              <option value="">-- Chọn chương trình --</option>
              {programLinks.map((p) => (
                <option key={p.program_id} value={p.program_id}>
                  {p.program_code
                    ? `${p.program_code} — ${p.program_name}`
                    : p.program_name}
                </option>
              ))}
            </select>
          )}
          <button
            className={styles.btnPrimary}
            disabled={!newTraineeId || needProgram || busy}
            title={needProgram ? "Chọn chương trình học trước" : undefined}
            onClick={() => {
              onRegister(newTraineeId, programId || undefined);
              setNewTraineeId("");
            }}
          >
            <CheckSvg /> Ghi danh
          </button>
          <button className={styles.btnGhost} onClick={() => setAdding(false)}>
            Đóng
          </button>
          <span className={styles.hint} style={{ flexBasis: "100%" }}>
            Chưa có trong danh sách? Thêm ở mục Học viên trước (khóa thực hành:
            nhập sổ Excel). Ghi danh ở đây được duyệt luôn (đủ sĩ số thì vào
            danh sách chờ); bấm tên học viên trong bảng để mở hồ sơ.
          </span>
        </div>
      )}

      <div className={tbl.tableCard}>
        <div className={tbl.tableHeader}>
          <div className={tbl.tableHeaderLeft}>
            <span className={tbl.tableTitle}>Danh sách học viên</span>
            {/* Đang xem nhóm khác mà vẫn có người chờ duyệt ⇒ nhắc, bấm để mở nhóm chờ duyệt */}
            {view !== "pending" && !!counts.pending && (
              <button
                type="button"
                className={styles.pendingAlert}
                onClick={() => changeView("pending")}
              >
                {counts.pending} đăng ký chờ duyệt →
              </button>
            )}
            <SelectionCount
              rowSel={rowSel}
              itemLabel="học viên"
              loading={busy}
              onBulkDelete={bulkRemove}
              extraActions={
                (selectedToApprove.length > 0 ||
                  selectedToReject.length > 0) && (
                  <>
                    {selectedToApprove.length > 0 && (
                      <BulkButton
                        disabled={busy}
                        onClick={() => bulkDecide("approved")}
                      >
                        <CheckSvg /> {approveVerb} đã chọn
                      </BulkButton>
                    )}
                    {selectedToReject.length > 0 && (
                      <BulkButton
                        danger
                        disabled={busy}
                        onClick={() => bulkDecide("rejected")}
                      >
                        <XSvg /> {rejectVerb} đã chọn
                      </BulkButton>
                    )}
                  </>
                )
              }
            >
              {filterActive
                ? `${filtered.length}/${viewCount(view)} học viên`
                : `${viewCount(view)} học viên`}
            </SelectionCount>
          </div>
          <div className={tbl.tableControls}>
            {course?.is_rolling && (
              <>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy}
                  onClick={() => setBookOpen(true)}
                  title="Nhập sổ thực hành (Excel). Dòng mới chỉ cần thông tin học viên + ngày bắt đầu — hệ thống tự xếp vòng, khoa, người hướng dẫn"
                >
                  Nhập sổ Excel
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy || exporting || enrollments.length === 0}
                  onClick={exportBook}
                  title="Xuất đúng bố cục sổ cũ (gồm cột Ngày/Tháng/Năm, TH1–TH11) để trộn thư như trước"
                >
                  {exporting ? "Đang xuất…" : "Xuất sổ Excel"}
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy || arranging || enrollments.length === 0}
                  onClick={autoArrange}
                  title="Mọi hồ sơ đang học chưa có vòng: sinh vòng, xếp lịch so le, chọn khoa và người hướng dẫn đang kèm ít người nhất, sinh mã thực hành"
                >
                  {arranging ? "Đang xếp…" : "Tự xếp hồ sơ mới"}
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setAdding((v) => !v)}
            >
              <PlusSvg /> Thêm học viên
            </button>
          </div>
        </div>

        {/* Hàng lọc: ô tìm kiếm rộng + nhóm học viên + chương trình */}
        <div className={styles.enrFilters}>
          <div className={styles.enrFilterRow}>
            <div className={styles.enrSearch}>
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  resetPage();
                }}
                placeholder="Tìm theo tên, mã học viên, mã thực hành, SĐT, email..."
              />
            </div>
            {/* Tách người mới đăng ký (có thể đăng ký cho vui / không đến) khỏi danh sách đã phê duyệt */}
            <select
              className={`${tbl.filterSelect} ${styles.enrViewSelect}`}
              aria-label="Nhóm học viên"
              value={view}
              onChange={(e) => changeView(e.target.value as ListView)}
            >
              {viewOptions.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} ({scopedCount(t.key)})
                </option>
              ))}
            </select>
            {showPrograms && (
              <select
                className={`${tbl.filterSelect} ${styles.enrProgramSelect} ${programFilter !== null ? tbl.filterActive : ""}`}
                data-active={programFilter !== null ? "true" : undefined}
                aria-label="Lọc theo chương trình"
                title={
                  selectedChip &&
                  [
                    selectedChip.code ? `${selectedChip.code} — ${selectedChip.name}` : selectedChip.name,
                    selectedChip.link && classState(selectedChip.link).text,
                  ]
                    .filter(Boolean)
                    .join("\n")
                }
                value={programFilter ?? "*"}
                onChange={(e) => {
                  setProgramFilter(e.target.value === "*" ? null : e.target.value);
                  resetPage();
                }}
              >
                <option value="*">Tất cả chương trình ({matches.length})</option>
                {sortedChips.map((c) => (
                  <option key={c.key || "_none"} value={c.key}>
                    {c.code ? `${c.code} — ${c.name}` : c.name} ({c.count})
                    {c.link &&
                      ` · ${classState(c.link).open ? "Đã mở lớp" : classState(c.link).ready ? "Đủ sĩ số, chờ mở" : `Chưa mở ${classState(c.link).short}`}`}
                  </option>
                ))}
              </select>
            )}
            {filterActive && (
              <button
                type="button"
                className={styles.enrClear}
                onClick={() => {
                  setSearch("");
                  setProgramFilter(null);
                  resetPage();
                }}
              >
                Xoá lọc
              </button>
            )}
          </div>
          {focusClass && (
            <div
              className={`${styles.classNote} ${focusClass.open ? styles.classNoteOpen : ""}`}
            >
              {focusClass.text}
              {focusLink?.class_start &&
                ` · Học ${formatDateOr(focusLink.class_start)} → ${formatDateOr(focusLink.class_end, "?")}`}
              {focusClass.ready && canOpenClass && (
                <button
                  type="button"
                  className={styles.classOpenBtn}
                  onClick={() => setClassModal("open")}
                >
                  Mở lớp
                </button>
              )}
              {focusClass.open && canOpenClass && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setClassModal("dates")}
                >
                  {focusLink?.class_start ? "Sửa ngày học" : "Đặt ngày học"}
                </button>
              )}
              {focusClass.open && canOpenClass && (
                <button
                  type="button"
                  className={`${styles.linkBtn} ${styles.linkBtnDanger}`}
                  disabled={cancellingClass}
                  onClick={cancelClass}
                >
                  {cancellingClass ? "Đang hủy…" : "Hủy mở lớp"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className={tbl.tableWrap}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={sel.checkCol}>
                  <SelectCheckbox
                    title="Chọn tất cả đăng ký đang hiển thị"
                    checked={rowSel.allPageSelected}
                    indeterminate={rowSel.somePageSelected}
                    onChange={rowSel.toggleSelectAll}
                  />
                </th>
                <th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
                <th className={tbl.th}>Học viên</th>
                {showProgramCol && <th className={tbl.th}>Chương trình</th>}
                <th className={tbl.th}>Liên hệ</th>
                <th className={tbl.th}>Ngày đăng ký</th>
                {showStatusCol && <th className={tbl.th}>Trạng thái</th>}
                <th className={`${tbl.th} ${tbl.thRight}`}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <TableEmpty
                  colSpan={colCount}
                  title={
                    enrollments.length === 0
                      ? "Chưa có học viên"
                      : filterActive && !onlyProgramFilter
                        ? "Không tìm thấy học viên"
                        : view === "pending"
                          ? "Không có đăng ký nào chờ duyệt"
                          : view === "approved"
                            ? "Chưa phê duyệt học viên nào"
                            : onlyProgramFilter
                              ? "Chương trình chưa có học viên"
                              : "Không có học viên"
                  }
                  desc={
                    enrollments.length === 0
                      ? "Bấm “Thêm học viên” để ghi danh học viên vào khóa."
                      : filterActive && !onlyProgramFilter
                        ? "Thử đổi từ khoá hoặc bộ lọc."
                        : view === "approved" && counts.pending
                          ? `Có ${counts.pending} đăng ký đang chờ ở nhóm “Đăng ký chờ duyệt”.`
                          : onlyProgramFilter && view !== "pending"
                            ? "Bấm “Thêm học viên” — chương trình đang chọn được chọn sẵn."
                            : undefined
                  }
                />
              ) : (
                pg.paged.map((en, idx) =>
                  renderRow(en, pg.offset + idx + 1, showProgramCol),
                )
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pg.pagination} itemLabel="học viên" />
      </div>
      {bookOpen && course && (
        <PracticeBookImportModal
          courseId={course.id}
          onClose={() => setBookOpen(false)}
          onImported={onSaved}
        />
      )}
      {classModal && course && focusLink && (
        <ClassDatesModal
          courseId={course.id}
          link={focusLink}
          mode={classModal}
          onClose={() => setClassModal(null)}
          onSaved={onSaved}
        />
      )}
      {detail && (
        <EnrollmentDetailModal
          enrollment={detail}
          course={course}
          programLinks={programLinks}
          onClose={() => setDetailId(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

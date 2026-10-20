import { useMemo, useState } from "react";
import { CheckSvg, PlusSvg, XSvg } from "@/assets/icons";
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
import { autoArrangeCourse, removeEnrollment } from "../api/courseApi";
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
  const [bookOpen, setBookOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [adding, setAdding] = useState(enrollments.length === 0);
  const detail = enrollments.find((e) => e.id === detailId) ?? null;
  // Khóa chỉ có 1 chương trình thì chọn sẵn; nhiều chương trình thì bắt chọn.
  const programId =
    programLinks.length === 1 ? programLinks[0].program_id : newProgramId;
  const needProgram = programLinks.length > 1 && !programId;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | "">("");

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return enrollments.filter(
      (en) =>
        (!statusFilter || en.status === statusFilter) &&
        (!q ||
          normalize(
            `${en.trainee_name} ${en.trainee_phone ?? ""} ${en.trainee_email ?? ""}`,
          ).includes(q)),
    );
  }, [enrollments, search, statusFilter]);

  const pg = useClientPaging(filtered);
  const visibleIds = useMemo(() => pg.paged.map((e) => e.id), [pg.paged]);
  const rowSel = useRowSelection(visibleIds);
  // Duyệt/Từ chối hàng loạt chỉ áp cho các đăng ký "chờ duyệt" trong lựa chọn.
  const selectedPending = enrollments
    .filter((e) => e.status === "pending" && rowSel.selectedIds.has(e.id))
    .map((e) => e.id);

  const bulkDecide = async (status: "approved" | "rejected") => {
    const verb = status === "approved" ? "Duyệt" : "Từ chối";
    if (!window.confirm(`${verb} ${selectedPending.length} đăng ký đã chọn?`))
      return;
    const failed = await onDecideBulk(selectedPending, status);
    rowSel.clearSelection();
    failed.forEach(rowSel.toggleSelect);
  };

  const bulkRemove = async (ids: string[]) => {
    let failed = 0;
    for (const id of ids) await removeEnrollment(id).catch(() => failed++);
    if (failed)
      showToast("error", `Không xoá được ${failed}/${ids.length} đăng ký`);
    onSaved();
  };

  const counts = useMemo(() => {
    const c: Partial<Record<EnrollmentStatus, number>> = {};
    for (const en of enrollments) c[en.status] = (c[en.status] ?? 0) + 1;
    return c;
  }, [enrollments]);

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

  const exportBook = async () => {
    if (!course) return;
    setExporting(true);
    await savePracticeBook(course.id, course.name);
    setExporting(false);
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
              value={newProgramId}
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
            <SelectionCount
              rowSel={rowSel}
              itemLabel="đăng ký"
              loading={busy}
              onBulkDelete={bulkRemove}
              extraActions={
                selectedPending.length > 0 && (
                  <>
                    <BulkButton
                      disabled={busy}
                      onClick={() => bulkDecide("approved")}
                    >
                      <CheckSvg /> Duyệt đã chọn
                    </BulkButton>
                    <BulkButton
                      danger
                      disabled={busy}
                      onClick={() => bulkDecide("rejected")}
                    >
                      <XSvg /> Từ chối đã chọn
                    </BulkButton>
                  </>
                )
              }
            >
              {filtered.length} đăng ký
            </SelectionCount>
          </div>
          <div className={tbl.tableControls}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Tìm học viên theo tên, SĐT, email..."
            />
            <select
              className={`${tbl.filterSelect} ${statusFilter ? tbl.filterActive : ""}`}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as EnrollmentStatus | "")
              }
            >
              <option value="">Tất cả trạng thái ({enrollments.length})</option>
              {(Object.keys(ENROLLMENT_STATUS_CFG) as EnrollmentStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {ENROLLMENT_STATUS_CFG[s].label} ({counts[s] ?? 0})
                  </option>
                ),
              )}
            </select>
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
                <th className={tbl.th}>Chương trình</th>
                <th className={tbl.th}>Liên hệ</th>
                <th className={tbl.th}>Ngày đăng ký</th>
                <th className={tbl.th}>Trạng thái</th>
                <th className={`${tbl.th} ${tbl.thRight}`}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  title={
                    enrollments.length === 0
                      ? "Chưa có học viên"
                      : "Không tìm thấy đăng ký"
                  }
                  desc={
                    enrollments.length === 0
                      ? "Chưa có học viên nào đăng ký khóa học này."
                      : "Thử thay đổi từ khoá hoặc bộ lọc trạng thái"
                  }
                />
              ) : (
                pg.paged.map((en, idx) => {
                  const cfg = ENROLLMENT_STATUS_CFG[en.status];
                  const isPending = en.status === "pending";
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
                      <td className={`${tbl.td} ${tbl.tdIdx}`}>
                        {pg.offset + idx + 1}
                      </td>
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
                          <div className={tbl.cellSub}>
                            Mã thực hành {en.practice_code}
                          </div>
                        )}
                      </td>
                      <td className={tbl.td}>
                        <div>
                          {en.program_name
                            ? `${en.program_code ? `${en.program_code} — ` : ""}${en.program_name}`
                            : "—"}
                        </div>
                        <div className={tbl.cellSub}>
                          {en.lesson_total > 0
                            ? `${en.lesson_done}/${en.lesson_total} bài · `
                            : ""}
                          {PROGRESS_LABEL[en.progress_status] ?? ""}
                        </div>
                      </td>
                      <td className={tbl.td}>
                        <div>{en.trainee_phone ?? "—"}</div>
                        {en.trainee_email && (
                          <div className={tbl.cellSub}>{en.trainee_email}</div>
                        )}
                      </td>
                      <td className={tbl.td}>
                        {formatDateOr(en.registered_at)}
                      </td>
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
                      </td>
                      <td className={`${tbl.td} ${tbl.tdActions}`}>
                        <RowActions
                          onEdit={() => setDetailId(en.id)}
                          onDelete={() => onRemove(en.id)}
                        >
                          {isPending && (
                            <>
                              <RowAction
                                title="Duyệt"
                                disabled={busy}
                                onClick={() => onDecide(en.id, "approved")}
                              >
                                <CheckSvg />
                              </RowAction>
                              <RowAction
                                title="Từ chối"
                                danger
                                disabled={busy}
                                onClick={() => onDecide(en.id, "rejected")}
                              >
                                <XSvg />
                              </RowAction>
                            </>
                          )}
                        </RowActions>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pg.pagination} itemLabel="đăng ký" />
      </div>
      {bookOpen && course && (
        <PracticeBookImportModal
          courseId={course.id}
          onClose={() => setBookOpen(false)}
          onImported={onSaved}
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

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarSvg, CheckSvg, PlusSvg, UserCheckSvg, XSvg } from "@/assets/icons";
import {
  RowAction,
  RowActions,
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
import type { EnrollCandidate } from "../hooks/useCourseDetail";
import type { RegisterResult } from "../api/courseApi";
import {
  ENROLLMENT_STATUS_CFG,
  PROGRESS_LABEL,
  type Course,
  type CourseProgramLink,
  type Enrollment,
  type EnrollmentStatus,
} from "../types/course.type";
import { EnrollmentDetailModal } from "./EnrollmentDetailModal";
import { AddEnrollmentPanel, type RecentAdd } from "./AddEnrollmentPanel";
import { PracticeBookImportModal } from "./PracticeBookImportModal";
import { savePracticeBook } from "../utils/practiceDocuments";
import { autoArrangeCourse, cancelOpenClass, removeEnrollment } from "../api/courseApi";
import { ClassDatesModal } from "./ClassDatesModal";
import { WaitlistCandidatesPanel } from "./WaitlistCandidatesPanel";
import { ProgramFilter } from "./ProgramFilter";
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

const programLabel = (p: CourseProgramLink) =>
  p.program_code ? `${p.program_code} — ${p.program_name}` : p.program_name;

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

/** Lọc nguồn học viên: nội viện (nhân viên bệnh viện) / ngoại viện. */
type OriginFilter = "internal" | "external";
const matchOrigin = (e: Enrollment, o: OriginFilter | null) =>
  o === null || e.is_internal === (o === "internal");

/** Lớp đã mở chưa / đủ sĩ số chờ mở — kèm câu giải thích cho tooltip / dòng gợi ý. */
const classState = (l: CourseProgramLink) => {
  const open = !!l.class_opened_at;
  const ready = !open && l.class_approved >= l.class_min;
  const full = l.class_max != null && l.class_approved >= l.class_max;
  const max = l.class_max != null ? `, tối đa ${l.class_max}` : "";
  const waiting = l.class_waiting
    ? ` · ${l.class_waiting} người trong danh sách chờ của chương trình`
    : "";
  const fullNote = full ? " (đã đầy: nội viện duyệt thêm vào danh sách chờ đợt sau, ngoại viện không nhận thêm)" : "";
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
  trainees: EnrollCandidate[];
  course: Course | null;
  /** Chương trình của khóa — học viên chọn 1 khi ghi danh. */
  programLinks: CourseProgramLink[];
  busy: boolean;
  onRegister: (
    traineeId: string,
    programId?: string,
    label?: string,
  ) => Promise<{ ok: true; result: RegisterResult } | { ok: false; error: string }>;
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
  const [detailId, setDetailId] = useState<string | null>(null);
  // Mở hồ sơ thẳng vào tab Vòng thực hành (nút "Xếp lịch" trên dòng chưa xếp)
  const [detailTab, setDetailTab] = useState<"rotations" | undefined>();
  const navigate = useNavigate();
  // Khóa GPHN: hồ sơ làm ở trang "Hồ sơ thực hành GPHN" (tự lưu, chọn danh mục) — không mở modal
  const openDetail = (id: string, tab?: "rotations") => {
    if (course?.is_rolling) {
      navigate(`/admin/practice-records/${id}${tab ? `?tab=${tab}` : ""}`);
      return;
    }
    setDetailTab(tab);
    setDetailId(id);
  };
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
  // Lọc nội / ngoại viện (?origin=internal|external)
  const originParam = params.get("origin");
  // Trả về chuỗi hằng (không trả lại originParam) để React Compiler biết đây là giá trị nguyên thủy —
  // nếu không nó coi originFilter có thể bị matchOrigin() sửa và bỏ qua useMemo bên dưới.
  const originFilter: OriginFilter | null =
    originParam === "internal" ? "internal" : originParam === "external" ? "external" : null;

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
        matchOrigin(e, originFilter) &&
        (v === "all" || e.status === v),
    ).length;

  // Chương trình ghi danh = chương trình đang lọc ở bảng (khóa chỉ 1 chương trình thì chọn sẵn):
  // chọn lớp ở khung thêm học viên thì bảng lọc theo lớp đó ⇒ thấy ngay người vừa thêm.
  const programId =
    programLinks.length === 1
      ? programLinks[0].program_id
      : programLinks.some((l) => l.program_id === programFilter)
        ? (programFilter as string)
        : "";

  // Lọc theo nhóm + từ khóa (chưa lọc nguồn / chương trình).
  const searched = useMemo(() => {
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
  // Số trên select nội / ngoại viện: theo nhóm + từ khóa + chương trình đang lọc.
  const originCount = (o: OriginFilter | null) =>
    searched.filter(
      (e) =>
        matchOrigin(e, o) &&
        (programFilter === null || programKey(e) === programFilter),
    ).length;
  // + lọc nguồn (chưa lọc chương trình) — dùng để đếm số trên từng chip.
  const matches = useMemo(
    () => searched.filter((e) => matchOrigin(e, originFilter)),
    [searched, originFilter],
  );

  const filtered = useMemo(
    () =>
      programFilter === null
        ? matches
        : matches.filter((e) => programKey(e) === programFilter),
    [matches, programFilter, programKey],
  );

  // Lựa chọn lọc theo chương trình kèm số học viên khớp từ khóa/trạng thái.
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
  const filterActive =
    !!search.trim() || programFilter !== null || originFilter !== null;
  const onlyProgramFilter =
    programFilter !== null && !search.trim() && originFilter === null;
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

  // ── Thêm học viên: cột "Vừa ghi danh" + đưa dòng vừa thêm ra cho thấy ──
  const [recent, setRecent] = useState<RecentAdd[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  // Dòng đang tô sáng; jumpId = còn chờ nhảy tới trang chứa dòng (danh sách có thể chưa nạp lại xong).
  const [flash, setFlash] = useState<{ id: string; scroll: boolean } | null>(null);
  const [jumpId, setJumpId] = useState<string | null>(null);
  if (jumpId) {
    const idx = filtered.findIndex((e) => e.id === jumpId);
    if (idx >= 0) {
      setJumpId(null);
      const page = pg.pageSize ? Math.floor(idx / pg.pageSize) + 1 : 1;
      if (page !== pg.safePage) pg.setPage(page);
    }
  }
  useEffect(() => {
    if (!flash || jumpId) return;
    if (flash.scroll)
      document
        .querySelector(`[data-enrollment-id="${flash.id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash, jumpId]);
  useEffect(() => {
    if (adding) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [adding]);

  /** Đổi bộ lọc ít nhất có thể để đăng ký hiện trong bảng, nhảy tới trang chứa nó và tô sáng. */
  const reveal = (
    t: { id: string; programKey: string; status: EnrollmentStatus; isInternal: boolean; text: string },
    scroll: boolean,
  ) => {
    setParams(
      (p) => {
        if (programFilter !== null && programFilter !== t.programKey)
          p.set("program", t.programKey || "_none");
        if (view !== "all" && view !== t.status) p.set("list", t.status);
        if (originFilter !== null && (originFilter === "internal") !== t.isInternal)
          p.delete("origin");
        return p;
      },
      { replace: true },
    );
    const q = normalize(search.trim());
    if (q && !normalize(t.text).includes(q)) setSearch("");
    setJumpId(t.id);
    setFlash({ id: t.id, scroll });
  };
  const revealEnrollment = (id: string) => {
    const en = enrollments.find((e) => e.id === id);
    if (!en) return;
    reveal(
      {
        id,
        programKey: programKey(en),
        status: en.status,
        isInternal: en.is_internal,
        text: `${en.trainee_name} ${en.trainee_id} ${en.practice_code ?? ""} ${en.trainee_phone ?? ""} ${en.trainee_email ?? ""}`,
      },
      true,
    );
  };

  const addCandidate = async (c: EnrollCandidate) => {
    const prog = programLinks.find((l) => l.program_id === programId);
    const res = await onRegister(
      c.id,
      programId || undefined,
      prog ? `${c.full_name} → ${prog.program_code ?? prog.program_name}` : c.full_name,
    );
    setRecent((r) => [
      {
        key: `${Date.now()}-${c.id}`,
        name: c.full_name,
        programText: prog ? programLabel(prog) : null,
        ...(res.ok
          ? {
              enrollmentId: res.result.id,
              status: res.result.status,
              waitlistPosition: res.result.waitlist_position,
            }
          : { error: res.error }),
      },
      ...r,
    ]);
    // Đang thêm liên tục ⇒ không cuộn trang (giữ ô tìm kiếm trong tầm mắt), chỉ tô sáng dòng mới.
    if (res.ok)
      reveal(
        {
          id: res.result.id,
          programKey: prog ? programId : "",
          status: res.result.status,
          isInternal: c.is_internal,
          text: `${c.full_name} ${c.sub}`,
        },
        false,
      );
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
      showToast("error", `Không xóa được ${failed}/${ids.length} đăng ký`);
    onSaved();
  };

  // Khóa GPHN: duyệt xong mới xếp lịch — hồ sơ đã duyệt, đang học, có chương trình mà chưa có vòng.
  const needsSchedule = (en: Enrollment) =>
    !!course?.is_rolling &&
    en.status === "approved" &&
    en.progress_status === "in_progress" &&
    !!en.program_id &&
    en.rotation_total === 0;
  const unscheduled = enrollments.filter(needsSchedule).length;

  const autoArrange = async () => {
    if (!course) return;
    setArranging(true);
    try {
      const { arranged, failed } = await autoArrangeCourse(course.id);
      showToast(
        failed.length ? "error" : "success",
        [
          arranged
            ? `Đã xếp lịch ${arranged} hồ sơ`
            : "Không có hồ sơ đã duyệt nào chưa xếp lịch",
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
        {needsSchedule(en) && (
          <span className={styles.unscheduled}> · Chưa xếp lịch</span>
        )}
      </div>
    );
    return (
      <tr
        key={en.id}
        data-enrollment-id={en.id}
        className={`${tbl.tr} ${rowSel.isSelected(en.id) ? sel.rowSelected : ""} ${flash?.id === en.id ? styles.rowFlash : ""}`}
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
            onClick={() => openDetail(en.id)}
          >
            {en.trainee_name}
          </button>
          <span
            className={`${styles.originTag} ${en.is_internal ? styles.originInternal : styles.originExternal}`}
            title={
              en.is_internal
                ? "Nội viện — nhân viên bệnh viện"
                : "Ngoại viện — học viên ngoài bệnh viện"
            }
          >
            {en.is_internal ? "Nội viện" : "Ngoại viện"}
          </span>
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
                  en.decided_by_name && `Người xử lý: ${en.decided_by_name}`,
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
                  ? `Người xử lý: ${en.decided_by_name}`
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
            onEdit={() => openDetail(en.id)}
            onDelete={() => onRemove(en.id)}
          >
            {needsSchedule(en) && (
              <RowAction
                title="Xếp lịch thực hành (khoa, ngày, người hướng dẫn)"
                onClick={() => openDetail(en.id, "rotations")}
              >
                <CalendarSvg />
              </RowAction>
            )}
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
        <div ref={panelRef}>
          <AddEnrollmentPanel
            candidates={trainees}
            enrollments={enrollments}
            programLinks={programLinks}
            programId={programId}
            onProgramChange={(id) => {
              setProgramFilter(id);
              rowSel.clearSelection();
              resetPage();
            }}
            busy={busy}
            isRolling={course?.is_rolling}
            recent={recent}
            onAdd={addCandidate}
            onReveal={revealEnrollment}
            onClose={() => {
              setAdding(false);
              setRecent([]);
            }}
          />
        </div>
      )}

      {/* Khóa ĐTLT / CTCV: nội viện chờ ở đợt trước cùng chương trình — cán bộ chọn chuyển sang */}
      {classRule && course && <WaitlistCandidatesPanel courseId={course.id} onMoved={onSaved} />}

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
                  disabled={busy || arranging || unscheduled === 0}
                  onClick={autoArrange}
                  title="Mọi hồ sơ đã duyệt, đang học mà chưa có vòng: sinh vòng, xếp lịch so le, chọn khoa và người hướng dẫn đang kèm ít người nhất, sinh mã thực hành"
                >
                  {arranging
                    ? "Đang xếp…"
                    : unscheduled
                      ? `Xếp lịch ${unscheduled} hồ sơ đã duyệt`
                      : "Không có hồ sơ chờ xếp lịch"}
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                if (adding) setRecent([]);
                setAdding((v) => !v);
              }}
            >
              <PlusSvg /> {adding ? "Đóng khung thêm" : "Thêm học viên"}
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
            <select
              className={`${tbl.filterSelect} ${originFilter !== null ? tbl.filterActive : ""}`}
              data-active={originFilter !== null ? "true" : undefined}
              aria-label="Lọc nội viện / ngoại viện"
              value={originFilter ?? "*"}
              onChange={(e) => {
                setUrlParam("origin", e.target.value === "*" ? null : e.target.value);
                rowSel.clearSelection();
                resetPage();
              }}
            >
              <option value="*">Nội + ngoại viện ({originCount(null)})</option>
              <option value="internal">Nội viện ({originCount("internal")})</option>
              <option value="external">Ngoại viện ({originCount("external")})</option>
            </select>
            {showPrograms && (
              <ProgramFilter
                title={
                  selectedChip &&
                  [
                    selectedChip.code ? `${selectedChip.code} — ${selectedChip.name}` : selectedChip.name,
                    selectedChip.link && classState(selectedChip.link).text,
                  ]
                    .filter(Boolean)
                    .join("\n")
                }
                // key "" (chưa chọn chương trình) đổi thành "_none" — SearchableSelect coi id rỗng là ô trống
                value={programFilter === "" ? "_none" : programFilter}
                onChange={(v) => {
                  setProgramFilter(v === "_none" ? "" : v);
                  resetPage();
                }}
                allLabel={`Tất cả chương trình (${matches.length})`}
                options={sortedChips.map((c) => ({
                  id: c.key || "_none",
                  name: `${c.code ? `${c.code} — ${c.name}` : c.name} (${c.count})${
                    c.link
                      ? ` · ${classState(c.link).open ? "Đã mở lớp" : classState(c.link).ready ? "Đủ sĩ số, chờ mở" : `Chưa mở ${classState(c.link).short}`}`
                      : ""
                  }`,
                }))}
              />
            )}
            {filterActive && (
              <button
                type="button"
                className={styles.enrClear}
                onClick={() => {
                  setSearch("");
                  setParams(
                    (p) => {
                      p.delete("program");
                      p.delete("origin");
                      return p;
                    },
                    { replace: true },
                  );
                  resetPage();
                }}
              >
                Xóa lọc
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
                        ? "Thử đổi từ khóa hoặc bộ lọc."
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
          initialTab={detailTab}
          course={course}
          programLinks={programLinks}
          onClose={() => setDetailId(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

import { useState } from "react";
import { AlertSvg, DownloadSvg } from "@/assets/icons";
import { Modal, ModalActions } from "@/shared/components";
import { SearchInput } from "@/shared/components/Table/TableToolbar";
import { showToast } from "@/shared/utils/feedback";
import { fileSlug, saveBlob } from "@/shared/utils/saveBlob";
import {
  exportCourseEnrollments,
  type EnrollmentExportMode,
} from "../api/enrollmentExportApi";
import {
  ENROLLMENT_STATUS_CFG,
  type EnrollmentStatus,
} from "../types/course.type";
import styles from "./EnrollmentExportModal.module.css";

export interface ExportProgram {
  id: string;
  code: string | null;
  name: string;
}

// Thứ tự hiển thị các trạng thái ghi danh để chọn
const STATUS_ORDER: EnrollmentStatus[] = [
  "approved",
  "pending",
  "waitlisted",
  "rejected",
];

const MODE_OPTIONS: {
  value: EnrollmentExportMode;
  title: string;
  hint: string;
}[] = [
  { value: "course", title: "Toàn khóa", hint: "Gộp chung một danh sách" },
  {
    value: "program",
    title: "Theo chương trình",
    hint: "Mỗi chương trình một sheet",
  },
];

/**
 * Xuất danh sách học viên của khóa ra Excel: chọn "toàn khóa" (một danh sách) hoặc
 * "theo từng chương trình" (mỗi chương trình một sheet), lọc theo chương trình và trạng thái.
 */
export function EnrollmentExportModal({
  courseId,
  courseName,
  programs,
  onClose,
}: {
  courseId: string;
  courseName: string;
  programs: ExportProgram[];
  onClose: () => void;
}) {
  const hasPrograms = programs.length > 0;
  const [mode, setMode] = useState<EnrollmentExportMode>("course");
  const [programIds, setProgramIds] = useState<string[]>(() =>
    programs.map((p) => p.id),
  );
  const [statuses, setStatuses] = useState<EnrollmentStatus[]>(["approved"]);
  const [busy, setBusy] = useState(false);

  const showPrograms = programs.length >= 2;
  const allPrograms = programIds.length === programs.length;

  // Tìm chương trình theo mã / tên; "Chọn tất cả" / "Bỏ chọn" chỉ áp cho các dòng đang hiện
  const [programQ, setProgramQ] = useState("");
  const q = programQ.trim().toLowerCase();
  const shownPrograms = q
    ? programs.filter((p) =>
        `${p.code ?? ""} ${p.name}`.toLowerCase().includes(q),
      )
    : programs;
  const shownIds = shownPrograms.map((p) => p.id);
  const allShownSelected = shownIds.every((id) => programIds.includes(id));
  const anyShownSelected = shownIds.some((id) => programIds.includes(id));
  const selectShown = () =>
    setProgramIds((cur) => [...new Set([...cur, ...shownIds])]);
  const clearShown = () =>
    setProgramIds((cur) => cur.filter((id) => !shownIds.includes(id)));

  const toggleProgram = (id: string) =>
    setProgramIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  const toggleStatus = (s: EnrollmentStatus) =>
    setStatuses((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  // Lý do khóa nút xuất (nếu có)
  const blockReason = !statuses.length
    ? "Chọn ít nhất một trạng thái."
    : mode === "program" && !programIds.length
      ? "Chọn ít nhất một chương trình."
      : null;

  const submit = async () => {
    if (blockReason || busy) return;
    setBusy(true);
    try {
      const blob = await exportCourseEnrollments(courseId, {
        mode,
        // Chọn hết thì không gửi để vẫn lấy cả học viên chưa xếp chương trình
        ...(showPrograms && !allPrograms ? { program_ids: programIds } : {}),
        statuses,
      });
      saveBlob(
        blob,
        `danh-sach-hoc-vien-${fileSlug(courseName) || "khoa-hoc"}.xlsx`,
      );
      onClose();
    } catch (err) {
      showToast(
        "error",
        err instanceof Error
          ? err.message
          : "Không xuất được danh sách học viên",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Xuất danh sách học viên"
      subtitle={courseName}
      size="sm"
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void submit()}
          loading={busy}
          disabled={!!blockReason}
          confirmIcon={<DownloadSvg />}
          confirmLabel={busy ? "Đang xuất…" : "Xuất Excel"}
        />
      }
    >
      <div className={styles.body}>
        {hasPrograms && (
          <fieldset className={styles.group}>
            <legend className={styles.label}>Cách xuất</legend>
            <div className={styles.modeGrid}>
              {MODE_OPTIONS.map((o) => (
                <label key={o.value} className={styles.modeCard}>
                  <input
                    type="radio"
                    name="enrollment-export-mode"
                    checked={mode === o.value}
                    onChange={() => setMode(o.value)}
                  />
                  <span className={styles.modeText}>
                    <span className={styles.modeTitle}>{o.title}</span>
                    <span className={styles.modeHint}>{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {showPrograms && (
          <fieldset className={styles.group}>
            <legend className={styles.labelRow}>
              <span className={styles.label}>
                Chương trình{" "}
                <span className={styles.count}>
                  ({programIds.length}/{programs.length})
                </span>
              </span>
              <span className={styles.labelTools}>
                <button
                  type="button"
                  className={styles.link}
                  onClick={selectShown}
                  disabled={!shownIds.length || allShownSelected}
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  className={styles.link}
                  onClick={clearShown}
                  disabled={!anyShownSelected}
                >
                  Bỏ chọn
                </button>
              </span>
            </legend>
            <div className={styles.search}>
              <SearchInput
                value={programQ}
                onChange={setProgramQ}
                placeholder="Tìm theo mã hoặc tên chương trình..."
              />
            </div>
            <div className={styles.checkList}>
              {shownPrograms.length === 0 && (
                <div className={styles.empty}>
                  Không tìm thấy chương trình phù hợp.
                </div>
              )}
              {shownPrograms.map((p) => (
                <label key={p.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={programIds.includes(p.id)}
                    onChange={() => toggleProgram(p.id)}
                  />
                  <span className={styles.checkText}>
                    {p.code && <span className={styles.code}>{p.code}</span>}
                    <span>{p.name}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className={styles.group}>
          <legend className={styles.label}>Trạng thái ghi danh</legend>
          <div className={styles.chips}>
            {STATUS_ORDER.map((s) => (
              <label key={s} className={styles.chip}>
                <input
                  type="checkbox"
                  checked={statuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                />
                <span>{ENROLLMENT_STATUS_CFG[s].label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {blockReason && (
          <div className={styles.warnBox} role="status">
            <AlertSvg />
            <span>{blockReason}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

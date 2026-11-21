// Giá trị ghép vào đường dẫn API (id từ useParams, từ URL…) có thể chứa `?`, `#`, `/`, `%`
// — react-router đã giải mã sẵn nên "S1%3F" thành "S1?". Ghép thẳng vào path sẽ làm
// trình duyệt tách query/fragment sớm và đổi endpoint đích (vd xóa người tham dự → xóa hội
// thảo). Mọi giá trị động đứng làm MỘT đoạn path phải đi qua `seg`.
export const seg = (value: string | number): string =>
  encodeURIComponent(String(value));

// Dạng tagged template: apiPath`/seminars/${id}/participants/${pid}` — mỗi giá trị nội suy
// được encode thành một đoạn path, phần chữ cố định giữ nguyên.
export const apiPath = (
  strings: TemplateStringsArray,
  ...values: Array<string | number>
): string =>
  strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? seg(values[i]) : ""),
    "",
  );

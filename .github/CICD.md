# CI/CD — Hospital RMS

```
push / PR ──► CI (ci.yml, chỉ điều phối) ─┬─ Phụ thuộc   chỉ bản chính thức · nguồn gói · npm audit · chữ ký gói
                                          ├─ Bí mật      file nhạy cảm · chuỗi bí mật · gitleaks
                                          ├─ SAST        Semgrep
                                          ├─ Hạ tầng     actionlint · zizmor · hadolint · shellcheck · compose
                                          ├─ Tuân thủ    giấy phép · migration · vệ sinh repo · vết duyệt (push main)
                                          ├─ Backend     lint/kiểu · kiến trúc · test theo nhóm · coverage · PostgreSQL · nâng cấp DB từ bản trước
                                          ├─ Frontend    lint/kiểu · build                                                (PR: chỉ khi đổi frontend/)
                                          └─ Chạy thử    image prod + compose prod + deploy.sh + tự rollback + Chrome     (PR: khi đổi thứ vào image)
                                                 ▼
                                          CI · kết quả  (check bắt buộc duy nhất)
   (main, xanh) ──► Image: app đổi → build + Trivy (lỗ hổng + bí mật) + SBOM/provenance; app không đổi → gắn tag SHA mới
                        cho image cũ → GHCR ──► ký cosign (khoá riêng, environment image-signing)
                ──► Deploy staging (nếu bật) ──► Deploy production (duyệt / chạy tay)
Deploy (deploy.yml):
   cổng: SHA nằm trên main + có lần CI push-main xanh  (GitHub-hosted)
   ──► runner tại server: xác minh chữ ký cosign → kéo đúng digest → scripts/deploy.sh:
       kiểm tra máy chủ (Docker, ổ đĩa, file env, compose) → backup DB + migration → up --no-build → smoke test + theo dõi → hỏng thì tự rollback
   ──► bản ghi kiểm toán JSON (artifact 365 ngày + logs/deploy-audit.jsonl trên máy chủ) + logs/deploy-history.log
```

| File | Vai trò |
|---|---|
| `.github/workflows/ci.yml` | Điều phối: trigger, xác định phần đổi, gọi các workflow con, gom kết quả, build image, gọi deploy, báo lỗi. Không chứa logic kiểm tra |
| `.github/workflows/check-dependencies.yml` | Chỉ bản chính thức (`scripts/ci/check-stable-versions.mjs`), `npm audit` (prod chặn high, dev chặn critical), `npm audit signatures` — mỗi thư mục 1 check |
| `.github/workflows/check-secrets.yml` | Không commit `.env`/khoá/bản dump, chuỗi bí mật, gitleaks |
| `.github/workflows/check-sast.yml` | Semgrep |
| `.github/workflows/check-infra.yml` | actionlint, zizmor (bảo mật workflow), hadolint (`.hadolint.yaml`), shellcheck, `docker compose config` |
| `.github/workflows/check-governance.yml` | Giấy phép thư viện (`scripts/ci/check-licenses.mjs`), quy tắc migration (`scripts/ci/check-migrations.mjs`), vệ sinh repo (`scripts/ci/check-hygiene.mjs`), vết duyệt thay đổi vào main. Báo cáo giấy phép + vết duyệt lưu artifact 365 ngày |
| `.github/workflows/check-backend.yml` | Lint · Prettier · tsc / kiến trúc + phân quyền route / test theo nhóm / coverage / PostgreSQL thật / nâng cấp DB từ schema bản trước + chạy lại migration mới lần 2 |
| `.github/workflows/check-image.yml` | Build image prod 2 app (đọc cache main, không ghi) → `scripts/ci/smoke-prod.sh`: registry tạm, PostgreSQL có SSL, `docker-compose.prod.yml`, `scripts/deploy.sh` đường chính + tự rollback, kiểm tra HTTP/header/quyền, Chrome headless (`scripts/ci/browser-smoke.mjs`). Chạy được trên máy dev có Docker |
| `.github/workflows/check-frontend.yml` | Lint + tsc / build production (chặn source map) |
| `.github/workflows/build-image.yml` | Chỉ build app có thay đổi (so với commit trước của lần push); app không đổi thì gắn tag SHA mới cho image cũ trên registry (vài giây). Vẫn build lại khi đổi workflow này, commit trước không có image, push đè lịch sử, hoặc image gốc quá 7 ngày (lấy bản vá base image). Chỉ ci.yml gọi được, không chạy tay |
| `.github/workflows/deploy.yml` | Deploy 1 SHA lên 1 môi trường. Chạy tay = **rollback**. Cổng (SHA trên main + CI xanh), xác minh chữ ký image, bản ghi kiểm toán |
| `.github/license-policy.json` | Giấy phép cấm / cần xem xét, ngoại lệ **có hạn** kèm lý do (hết hạn → CI đỏ) |
| `.github/prerelease-allowlist.json` | Gói **gián tiếp** là bản tiền phát hành tạm chấp nhận, kèm lý do. Phụ thuộc trực tiếp không bao giờ được vào đây |
| `scripts/deploy.sh` | Logic deploy/backup/smoke test/rollback (bash). GitHub sự cố vẫn chạy tay được trên server |
| `backend/scripts/migrate.js` | Chạy migration mới theo thứ tự, ghi bảng `schema_migrations` (xem `backend/README.md`, mục Cơ sở dữ liệu) |
| `.github/dependabot.yml`, `.github/CODEOWNERS`, `.gitleaksignore` | Cập nhật thư viện, người review, báo nhầm của gitleaks |

## Cài đặt 1 lần

1. **Branch protection cho `main`** (Settings → Branches, hoặc lệnh dưới). Repo private cần gói GitHub Pro/Team trở lên.
   ```bash
   gh api -X PUT repos/NguyenHung2381/Hospital_RMS/branches/main/protection --input - <<'EOF'
   {"required_status_checks":{"strict":true,"contexts":["CI · kết quả"]},
    "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true,"dismiss_stale_reviews":true},
    "required_conversation_resolution":true,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
   EOF
   ```
   `enforce_admins:false` để admin còn sửa gấp được khi chỉ có 1 người review. Mọi lần vượt (push thẳng, tự merge) đều bị job **Duyệt trước khi vào main** ghi lại (Summary + artifact `review-audit-<sha>`). Khi nhóm có ≥ 2 người: đặt `enforce_admins:true` và biến repo `REQUIRE_REVIEWED_CHANGES=true` → commit vào main không có PR được người **khác** tác giả duyệt thì CI đỏ, không build image, không deploy được.
2. **Runner trên server** (Settings → Actions → Runners → New self-hosted runner, **Linux**). Lúc cài, thêm nhãn `rms-production` (staging: `rms-staging`) và chạy dưới dạng service (`svc.sh install`) bằng user thuộc nhóm `docker`. Server tự kết nối ra GitHub, không cần mở cổng vào. Từng bước: `infra/cai-dat-may-ao-ubuntu.md` mục 15.
   Settings → Actions → General → *Fork pull request workflows*: **không** chạy workflow từ fork. Runner chỉ nhận job deploy, PR không bao giờ chạy trên runner này.
3. **Environments** (Settings → Environments) `production` (và `staging` nếu dùng):
   - *Deployment branches*: chỉ `main`.
   - *Required reviewers*: chỉ có ở repo public hoặc gói Enterprise. Có thì bật, rồi đặt biến repo `AUTO_DEPLOY_PRODUCTION=true`.
     Không có thì production luôn deploy **bằng tay** (bước "Deploy production" bên dưới). Đây là bước duyệt.
   - Biến (*Variables*): `DEPLOY_DIR` (thư mục source trên server, chứa `backend/.env*` và `.env`), `APP_URL`, `MIGRATION_BACKUP_DIR` (thư mục trên server để `pg_dump` trước migration; user runner phải ghi được, máy cần `pg_dump` — cài cùng PostgreSQL).
     Staging cùng máy thì thêm `COMPOSE_PROJECT=hospital_rms_staging`, `BACKEND_URL`/`FRONTEND_URL` với cổng khác, và đặt `BACKEND_BIND`/`FRONTEND_BIND` + `DB_DATABASE` riêng trong `.env`/`backend/.env.production` của thư mục staging.
   - Secret (*Secrets*): `MIGRATION_DB_USER` (`rms_migrate`), `MIGRATION_DB_PASSWORD`. Role chủ DB, chỉ dùng cho bước backup + migration. Không đặt thì `deploy.sh` dùng `rms_migrate` với mật khẩu lấy từ `~/.pgpass` của user chạy runner (dòng `127.0.0.1:5432:*:rms_migrate:<mật khẩu>`); không tìm được mật khẩu thì dừng trước khi backup — migration không bao giờ chạy bằng `rms_app` (thiếu quyền CREATE trên schema public). App vẫn chạy bằng role quyền hẹp `rms_app` trong `.env.production`. Backup kết nối `127.0.0.1:5432/rms_hospital`; khác thì đặt `MIGRATION_DB_HOST` / `MIGRATION_DB_PORT` / `MIGRATION_DB_NAME`.
4. Staging: đặt biến repo `ENABLE_STAGING=true` khi đã có runner `rms-staging`.
5. **Database lần đầu**: dựng schema (`migrate init`) hoặc chuyển dữ liệu từ file backup SQL Server — `infra/cai-dat-may-ao-ubuntu.md` mục 12.2. Từ đó mỗi lần deploy chỉ chạy file mới trong `backend/database/migrations/`.
6. **Ký image (cosign)** — làm 1 lần, trên máy quản trị (cần Docker):
   ```bash
   docker run --rm -it -v "$PWD:/k" -w /k ghcr.io/sigstore/cosign/cosign:v2.6.5 generate-key-pair
   ```
   (hỏi mật khẩu khoá; ra `cosign.key` + `cosign.pub`).
   - Settings → Environments → **New environment** `image-signing`: *Deployment branches* = chỉ `main`. Secret: `COSIGN_PRIVATE_KEY` (nội dung `cosign.key`), `COSIGN_PASSWORD`.
   - Settings → Secrets and variables → Actions → **Variables** (mức repo): `COSIGN_PUBLIC_KEY` = nội dung `cosign.pub`.
   - Cất `cosign.key` + mật khẩu ở kho bí mật của bệnh viện (két / password manager), **xoá** bản trên máy. Không commit.
   - Từ lúc đặt `COSIGN_PUBLIC_KEY`, deploy **từ chối** image chưa ký. Image build trước đó: chạy lại CI của commit cần deploy (Actions → CI → Re-run) để job *Ký image* ký bù, hoặc deploy bản mới hơn.
   - Đổi khoá (lộ khoá, người giữ nghỉ việc): tạo cặp mới, thay cả 3 giá trị, chạy lại CI của commit đang chạy production để ký bằng khoá mới.
   Chữ ký không đẩy lên log minh bạch công khai (Rekor) nên tên repo private không lộ ra ngoài; đổi lại, việc xác minh chỉ dựa vào khoá công khai ở trên.

## Vận hành

- **Deploy production (bằng tay)**: Actions → *Deploy* → Run workflow → `production` + commit SHA (SHA lấy ở trang tóm tắt lần chạy CI, mục Image).
- **Rollback**: giống hệt, nhập SHA của bản cũ. Image cũ còn nguyên trên GHCR (Packages) và trong Docker của server. Không có GitHub thì chạy trên server:
  `scripts/deploy.sh <sha> ghcr.io/nguyenhung2381` (cần `docker login ghcr.io` bằng PAT có quyền `read:packages`; đặt `DEPLOY_DIR`, `MIGRATION_*` như trên).
- **Kiểm tra máy chủ** (đầu `scripts/deploy.sh`, cả khi chạy tay): Docker chạy được, ổ chứa dữ liệu Docker còn ≥ `MIN_FREE_GB` (mặc định 3), có `backend/.env.production`, `docker-compose.prod.yml` hợp lệ với `.env` thật, `MIGRATION_BACKUP_DIR` ghi được + có `pg_dump`. Hỏng → dừng trước khi kéo image, bản đang chạy không bị đụng (`FAILED-PREFLIGHT` trong `deploy-history.log`). Biến khai báo trong `backend/.env.example` mà máy chưa đặt → cảnh báo.
- **Cổng deploy** (job *Điều kiện deploy*, cả khi chạy tay): SHA phải đủ 40 ký tự, nằm trên `main`, và có lần chạy CI do **push vào main** với *CI · kết quả* xanh. Không deploy được nhánh khác, commit chưa merge, hay commit CI đỏ.
- **Tự rollback**: smoke test (`/health` đúng version, `/health/db`, trang chủ, không restart trong 60s) hỏng thì script tự quay lại image trước đó, và job báo đỏ.
- **Migration**: rollback ứng dụng **không** hoàn tác schema. Vì vậy:
  - Migration phải tương thích ngược: thêm cột/bảng thì được; xoá hoặc đổi tên thì để 1 bản phát hành sau, khi code cũ không còn dùng.
  - Viết idempotent như các file hiện có.
  - Migration hỏng thì deploy dừng **trước** khi đổi container (bản cũ vẫn chạy). Cần khôi phục thì `pg_restore` file `.dump` mới nhất trong `MIGRATION_BACKUP_DIR` (tên có 8 ký tự đầu của SHA).
- **Lịch sử deploy**: tab *Environments* trên GitHub (ai, SHA, lúc nào, link lần chạy), `logs/deploy-history.log` trên server, và artifact `deploy-audit-<môi trường>-<run>` (JSON: thời điểm UTC, commit, digest 2 image, đã xác minh chữ ký chưa, người kích hoạt, lần chạy CI, kết quả).
- **Bằng chứng kiểm tra** (artifact 365 ngày, tải ở trang lần chạy hoặc `gh run download`): `trivy-<app>-<sha>` (báo cáo quét image đầy đủ), `license-report-<sha>` (danh mục giấy phép), `review-audit-<sha>` (commit nào qua PR, ai duyệt), `deploy-audit-*` (bản ghi này còn được ghi thêm vào `$DEPLOY_DIR/logs/deploy-audit.jsonl` trên máy chủ và Summary của lần chạy — máy chủ không tải được artifact lên GitHub thì job chỉ cảnh báo, không đỏ). Thời hạn thực tế không vượt cài đặt repo (Settings → Actions → General → *Artifact and log retention*); cần giữ lâu hơn thì tải về lưu trữ của bệnh viện định kỳ.
- **Tự xác minh 1 image**: `docker run --rm -e COSIGN_PUBLIC_KEY="$(cat cosign.pub)" ghcr.io/sigstore/cosign/cosign:v2.6.5 verify --key env://COSIGN_PUBLIC_KEY --insecure-ignore-tlog=true ghcr.io/nguyenhung2381/hospital_rms-backend:<sha>` (cần `docker login ghcr.io`).
- **Truy vết**: production → `GET /health` trả `version` = commit SHA đã build image backend (bằng SHA deploy, hoặc commit gần nhất đổi `backend/` nếu image được gắn lại tag) → image `ghcr.io/…:<sha>` (label `org.opencontainers.image.url` trỏ về lần chạy CI có kết quả test, coverage, quét) → commit.

## Quy tắc phiên bản (check-dependencies.yml)

Chạy local trước khi push: `npm run check:versions` (ở thư mục gốc, không cần cài gì).

- **package.json**: chỉ khoảng semver của bản chính thức (`^1.2.3`, `~6.0.3`). Cấm `1.0.0-beta.1`/`-rc`/`-alpha`/`-next`..., dist-tag (`latest`, `next`, `beta`), `*`, cài từ git/URL/thư mục. Áp dụng cả `overrides`.
- **package-lock.json**: mọi gói (kể cả gián tiếp) phải là bản chính thức, tải từ `registry.npmjs.org`, có integrity `sha512`. Gói gián tiếp bị thư viện cha khoá cứng vào bản tiền phát hành: thử nâng thư viện cha hoặc ép bằng `overrides` trước; bất khả kháng mới thêm vào `.github/prerelease-allowlist.json` (tên, phiên bản, đi qua đâu, lý do + cách gỡ) — file này có Code Owner review.
- **Docker image**: phải có tag phiên bản; cấm `latest` và tag `beta`/`rc`/`nightly`/`edge`/`dev`. Tag không có số (`alpine`, `stable`) chỉ cảnh báo.
- **GitHub Actions**: action bên ngoài ghim theo commit SHA kèm chú thích bản chính thức (`@<sha> # v5.1.0`). Image công cụ chạy bằng `docker run` (gitleaks, semgrep, trivy, actionlint, zizmor, hadolint, shellcheck) ghim `tag@sha256:digest`. Dependabot cập nhật SHA cho action; image công cụ trong workflow thì nâng tay (lấy digest: `docker buildx imagetools inspect <image:tag>`).
- **Dependabot** chỉ đề xuất bản đã phát hành ≥ 7 ngày (major ≥ 14 ngày) để tránh gói bị chiếm tài khoản vừa đẩy lên.
- **Node.js**: image production dùng bản **LTS** (major chẵn) và đúng major với `NODE_VERSION` trong các workflow — CI test bản nào thì production chạy bản đó. Nâng major: sửa cả 2 Dockerfile + `NODE_VERSION` trong 1 PR (Dependabot không đề xuất major Node).

## Giấy phép thư viện (check-governance.yml)

Chạy local: `node scripts/ci/check-licenses.mjs`.

- Chỉ xét gói **production** (vào image backend / bundle frontend). Cấm: AGPL, GPL, SSPL, BUSL, CC-BY-NC, Commons Clause, UNLICENSED. Cảnh báo: LGPL, MPL, EPL, CDDL, giấy phép riêng. `A OR B` đạt khi một vế đạt (vd jszip `MIT OR GPL-3.0` → dùng theo MIT).
- Bất khả kháng: thêm ngoại lệ vào `.github/license-policy.json` với lý do, đường đi và **`expires`**. Quá hạn → CI đỏ, buộc xem lại; còn ≤ 14 ngày → cảnh báo.
- **Đang có 1 ngoại lệ chờ quyết định**: `mupdf` (AGPL-3.0, backend docCheck), hạn 2027-01-31 — xem lý do trong file.

## Quy tắc migration (check-governance.yml)

Chạy local trước khi push: `node scripts/ci/check-migrations.mjs origin/main`.

- Không sửa file đã có trong `backend/database/migrations/` (khác khoảng trắng cuối dòng thì được). Không xoá/đổi tên, trừ khi gộp (file gộp có `-- @migration <tên cũ>.sql`).
- File mới: `YYYY-MM-DD_mo_ta.sql`, xếp **sau** mọi file đã có.
- File mới thêm cột `NOT NULL` không `DEFAULT` vào bảng đã có → CI đỏ (hỏng ngay nếu bảng có dòng). Cách đúng: thêm cột NULL → `UPDATE` → `SET NOT NULL`; đã chắc bảng trống thì ghi `-- ci:da-kiem-du-lieu: <cách đã kiểm>`. `SET NOT NULL`, thêm UNIQUE/PK, CHECK/FK không `NOT VALID`, `CREATE UNIQUE INDEX` → cảnh báo trong Summary: chạy thử trên bản sao DB production trước.
- Job *PostgreSQL (nâng cấp từ bản trước)*: dựng DB bằng migration của commit gốc rồi chạy `migrate` của bản mới (đúng lệnh deploy), chạy lại phải "Không có migration mới", và mỗi file mới chạy lại lần 2 không lỗi (idempotent).
- File mới có `DROP TABLE` (trừ bảng tạm), `DROP COLUMN`, `TRUNCATE`, `RENAME` cột/bảng, đổi kiểu cột, `DELETE` không `WHERE` → CI đỏ. Đúng chủ ý (code cũ đã thôi dùng từ bản trước) thì thêm dòng `-- ci:cho-phep-pha-huy: <lý do>` vào file — lý do hiện ở Summary cho người review.

## Vệ sinh repo (check-governance.yml)

Chạy local: `node scripts/ci/check-hygiene.mjs origin/main`.

Dấu xung đột merge còn sót · 2 file chỉ khác hoa/thường · file > 5 MB, `node_modules`/`dist`/`coverage` bị commit · file dữ liệu (`xlsx`, `csv`, `dump`, `zip`...) ngoài `backend/templates/`, `*/fixtures/`, `frontend/public/` · `.sh` không LF, hoặc được workflow/`package.json` gọi thẳng mà thiếu quyền chạy (`git update-index --chmod=+x`) · JSON hỏng · `test.only` · **biến môi trường mới** đọc trong `backend/src` mà chưa có trong `backend/.env.example`.

## Chạy thử bản production trên máy dev

Cần Docker. Ở thư mục gốc (Git Bash / Linux):
```bash
SHA=$(git rev-parse HEAD)
docker build --target prod --build-arg GIT_SHA=$SHA -t rms-smoke-backend:local backend
docker build --target prod --build-arg GIT_SHA=$SHA -t rms-smoke-frontend:local frontend
docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD:/repo" -w /repo \
  -e BACKEND_SRC_IMAGE=rms-smoke-backend:local -e FRONTEND_SRC_IMAGE=rms-smoke-frontend:local -e SHA=$SHA \
  docker:cli sh -c 'apk add -q bash curl && bash scripts/ci/smoke-prod.sh'
```
Cổng dùng: 55432, 5055, 13001, 18081, 19222 (đổi bằng `PG_PORT`, `REG_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`, `CDP_PORT`). Tự dọn container + volume khi xong.

## Lỗi thường gặp → nơi bắt

| Lỗi | Bắt ở đâu | Lúc nào |
|---|---|---|
| Lỗi cú pháp / kiểu, quên format | Backend · Frontend (ESLint, Prettier, tsc) | PR |
| Sai nghiệp vụ, hỏng phân quyền route | Test theo nhóm, contract `routes.snapshot.txt`, `check:routes` | PR |
| `require` sai đường dẫn (Windows không phân biệt hoa/thường) | `check:requires` trên Linux · vệ sinh repo (trùng tên khác hoa/thường) | PR |
| Quên xoá `test.only`, còn dấu xung đột merge, JSON hỏng | Vệ sinh repo | PR |
| Commit nhầm `.env`, khoá, bản dump, danh sách nhân sự | Bí mật (gitleaks, chặn file) · vệ sinh repo (file dữ liệu, file lớn) | PR |
| Thêm biến môi trường mà không khai báo → server thiếu biến | Vệ sinh repo (`.env.example`) · kiểm tra máy chủ trong deploy.sh (cảnh báo) | PR · deploy |
| Thư viện beta/rc, nguồn lạ, có lỗ hổng, giấy phép cấm | Phụ thuộc · Tuân thủ (giấy phép) · Dependabot · Trivy | PR · hằng tuần |
| Migration sửa file cũ, chen thứ tự, phá dữ liệu | Quy tắc migration | PR |
| Migration chạy được trên DB trống nhưng hỏng trên DB đang chạy | Nâng cấp DB từ bản trước · quy tắc NOT NULL/UNIQUE · chạy lại lần 2 | PR |
| Image build được nhưng không khởi động (thiếu file do `.dockerignore`, thiếu thư viện hệ thống, sai env production, sai quyền thư mục) | Chạy thử production | PR |
| `docker-compose.prod.yml` hỏng, nginx không tới được backend, `mem_limit` quá thấp | Chạy thử production · kiểm tra máy chủ (`compose config` với `.env` thật) | PR · deploy |
| Frontend trang trắng: lỗi JS lúc chạy, CSP chặn, thiếu chunk, JS thiếu bị trả về HTML | Chạy thử production (Chrome headless + kiểm tra file tĩnh) | PR |
| Thiếu header bảo mật, lộ Swagger / X-Powered-By / source map, chạy bằng root | Chạy thử production · build frontend | PR |
| `deploy.sh` hỏng (đường chính hoặc đường tự rollback) | Chạy thử production (deploy thật + deploy bản cố tình hỏng) | PR |
| Script `.sh` mất quyền chạy / bị CRLF khi commit từ Windows | Vệ sinh repo · shellcheck | PR |
| Node production khác bản CI test, Node không LTS | Phụ thuộc (`check-stable-versions.mjs`) | PR |
| Image có lỗ hổng CRITICAL / bí mật | Trivy | main |
| Deploy nhầm commit chưa merge / CI đỏ, image giả | Cổng deploy · xác minh chữ ký cosign | deploy |
| Máy chủ đầy ổ, mất file env, thư mục backup không ghi được, Docker tắt | Kiểm tra máy chủ (đầu deploy.sh) | deploy |
| Bản mới khởi động rồi crash, không kết nối DB | Smoke test + theo dõi trong deploy.sh → tự rollback | deploy |
| Pipeline main hỏng mà không ai biết | Issue `ci-hong` (gom 1 issue, ghi job + bước hỏng kèm thông báo lỗi, tự đóng khi xanh lại) | main · hằng tuần |

**Chưa tự động được** (cần làm tay / công cụ khác): runner trên server offline (job deploy xếp hàng chờ — xem Settings → Actions → Runners); lỗi chỉ xảy ra với dữ liệu production (chạy migration trên bản sao DB trước khi deploy migration lớn); hiệu năng / tải; trang sau đăng nhập trong trình duyệt (cần tài khoản thử); chứng chỉ HTTPS sắp hết hạn.

## Thêm / sửa kiểm tra

- Mỗi phần là 1 file `check-*.yml` (có `workflow_call` + `workflow_dispatch` → chạy tay riêng được ở tab Actions). Sửa 1 phần không đụng phần khác.
- Thêm phần mới: tạo `check-<tên>.yml`, gọi trong `ci.yml` và thêm vào `needs` của job `result` (**CI · kết quả**). Không cần đổi branch protection.
- Workflow mới phải qua `check-infra.yml`: actionlint + zizmor (không `${{ }}` trong `run:` — đưa qua `env:`; `persist-credentials: false`; `permissions` tối thiểu).

## Trách nhiệm

| Sự cố | Người xử lý |
|---|---|
| CI hỏng trên PR | Tác giả PR |
| CI/deploy hỏng trên `main` | Người push / người chạy deploy. Workflow tự mở issue giao cho người đó |
| Deploy production, rollback, restore DB | Người quản trị hệ thống (Code Owner `@NguyenHung2381`) |

## Đối chiếu checklist

| Mục | Trạng thái |
|---|---|
| **1. Source & Trigger** | Push/PR vào `main` + lịch tuần · branch protection + CODEOWNERS (cài ở bước 1) · ESLint frontend, `tsc` cả hai phía · gitleaks + chặn file `.env`/khoá · PR huỷ lần chạy cũ, `main` không huỷ, deploy xếp hàng theo môi trường, deploy lại SHA cũ được |
| **2. Build & Dependencies** | `npm ci` trên runner sạch, Node 24 = bản trong Dockerfile · lockfile + `npm audit` + `npm audit signatures` + Dependabot (cooldown 7 ngày) · chỉ bản chính thức, chỉ từ registry npm · build hỏng thì dừng · image tag = commit SHA · 1 image dùng cho mọi môi trường (`up --no-build`) |
| **3. Testing & Quality Gate** | `node --test` theo nhóm, kết quả vào Summary · coverage tối thiểu 45% dòng (nâng dần) · Semgrep · nâng cấp DB từ bản trước · chạy thử bản production (compose + deploy.sh + rollback + Chrome) ngay trên PR · mọi kiểm tra phải xanh mới build/deploy. *Job `PostgreSQL` (check-backend.yml) chạy test tích hợp với PostgreSQL thật; smoke test sau deploy bù phần còn lại* |
| **4. Security** | SAST Semgrep · SCA `npm audit` + chữ ký registry + Dependabot · gitleaks · Trivy quét image (chặn CRITICAL có bản vá + bí mật HIGH+ trong image) · action ghim SHA, image công cụ ghim digest · zizmor + actionlint cho workflow, hadolint, shellcheck · `permissions` tối thiểu từng job, secret theo environment, khoá ký chỉ ở environment `image-signing` (nhánh main), PR từ fork không có secret và không chạy trên runner · SBOM + provenance gắn vào image · **ký image cosign, deploy xác minh chữ ký** · Node production là bản LTS, cùng bản CI test |
| **5. Deployment** | cổng: chỉ SHA trên main có CI push-main xanh · staging / production theo environment · duyệt (required reviewers hoặc chạy tay) · biến/secret theo environment + file `.env` riêng trên từng server · migration có theo dõi + backup · smoke test · *rolling/blue-green: chưa, 1 server nên có downtime vài giây lúc tạo lại container* |
| **6. Rollback & Recovery** | Tự rollback + rollback tay theo SHA · image cũ còn trên GHCR · migration tương thích ngược + backup · `timeout-minutes` mọi job, pull có retry · bảng trách nhiệm ở trên |
| **7. Monitoring & Audit** | Log Actions tự che secret · issue + email khi hỏng · lịch sử deploy (Environments + `deploy-history.log` + bản ghi kiểm toán JSON 365 ngày) · truy vết SHA ↔ digest ↔ chữ ký ↔ lần chạy CI · vết duyệt từng commit vào main. *Error rate/latency sau deploy: chỉ có theo dõi restart 60s; dashboard cần Loki/Grafana ở prod (hiện chỉ có ở dev)* |
| **8. Tuân thủ & kiểm duyệt** | Giấy phép thư viện (chặn copyleft, ngoại lệ có hạn) · quy tắc migration (không sửa file đã chạy, lệnh phá huỷ phải ghi lý do) · PR template có mục dữ liệu cá nhân / phân quyền / rủi ro + rollback · CODEOWNERS cho DB, hạ tầng, Dockerfile, CI · vết duyệt mọi commit vào main (bật chặn bằng `REQUIRE_REVIEWED_CHANGES`) · bằng chứng lưu 365 ngày |

## Đối chiếu nhóm yêu cầu quy định

Bảng dưới là **bằng chứng kỹ thuật** pipeline cung cấp cho các nhóm yêu cầu thường gặp khi kiểm tra an toàn thông tin / bảo vệ dữ liệu cá nhân (hồ sơ cấp độ theo Nghị định 85/2016/NĐ-CP + TCVN 11930:2017; Luật Bảo vệ dữ liệu cá nhân và văn bản hướng dẫn; quy định CNTT của Bộ Y tế). Không phải ý kiến pháp lý — cấp độ hệ thống và điều khoản áp dụng cụ thể do bộ phận ATTT / pháp chế của bệnh viện xác định.

| Nhóm yêu cầu | Pipeline đáp ứng bằng | Còn phải làm ngoài CI/CD |
|---|---|---|
| Quản lý thay đổi (đề xuất → duyệt → triển khai có kiểm soát) | PR + CODEOWNERS · vết duyệt từng commit · cổng deploy chỉ nhận mã trên main đã qua CI · production chạy tay/duyệt | Phiếu yêu cầu thay đổi nếu đơn vị bắt buộc — dùng link PR làm số hiệu |
| Nhật ký, truy vết | Bản ghi kiểm toán deploy, `deploy-history.log`, lịch sử Environments, SHA ↔ digest ↔ lần chạy CI | Đưa log ứng dụng + hệ điều hành về nơi lưu tập trung, thời hạn lưu theo quy định |
| Quản lý điểm yếu, bản vá | `npm audit` + Dependabot hằng tuần · Trivy mỗi lần build, build lại khi image > 7 ngày · Semgrep · lịch quét tuần | Quét / kiểm thử xâm nhập định kỳ ứng dụng đang chạy (DAST, pentest) |
| Toàn vẹn phần mềm, chuỗi cung ứng | Chỉ bản chính thức từ registry npm + kiểm chữ ký gói · action/công cụ ghim SHA/digest · SBOM + provenance · ký image + xác minh trước deploy | Cất giữ khoá ký, quy trình đổi khoá |
| Kiểm soát truy cập môi trường vận hành | Quyền token tối thiểu từng job · secret theo environment · khoá ký chỉ nhánh main · runner chỉ nhận job deploy, không chạy PR | Rà soát định kỳ ai có quyền admin repo / server / GHCR |
| Bảo vệ bí mật | gitleaks, chặn file `.env`/khoá/dump · Trivy chặn bí mật trong image · log Actions tự che secret | Xoay vòng secret định kỳ (`scripts/rotate-jwt-secrets.sh`) |
| Dữ liệu cá nhân trong thiết kế | Mục bắt buộc trong PR template (thu thập gì, ai xem, giữ bao lâu, log/xuất file) · chặn commit file dữ liệu (`.dump`, `.bak`, CSV nhập liệu) | Đánh giá tác động xử lý dữ liệu cá nhân, sổ hoạt động xử lý — tài liệu riêng |
| Sao lưu, khôi phục | `pg_dump` trước mỗi migration, rollback tự động/thủ công theo SHA | Sao lưu định kỳ + diễn tập khôi phục (`infra/cai-dat-may-ao-ubuntu.md`) |
| Giấy phép phần mềm | Danh mục giấy phép mỗi commit, chặn copyleft, ngoại lệ có hạn | Quyết định cho `mupdf` (AGPL) trước 2027-01-31 |

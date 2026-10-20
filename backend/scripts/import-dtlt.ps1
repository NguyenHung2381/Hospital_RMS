# Nhập chương trình + bài học ĐTLT từ Excel vào DB qua container backend (chạy trên Windows).
# Các bước: migration → copy file vào container → xem trước → hỏi xác nhận → ghi DB → dọn file tạm.
# Logic nhập nằm ở import-dtlt-lessons.js (khớp chương trình/bài học, chạy lại an toàn).
#
#   Chuột phải file → "Run with PowerShell"  (hỏi đường dẫn, kéo thả file/thư mục vào cửa sổ)
#   hoặc:
#   powershell -ExecutionPolicy Bypass -File backend\scripts\import-dtlt.ps1 `
#     -DetailFile "D:\...\Chi tiết chương trình học ĐTLT.xlsx" -LessonDir "C:\...\Bài học ĐTLT" `
#     [-Container hospital_rms-backend-1] [-Yes]
#
# -Container: mặc định bản dev; server thật là hospital_rms-backend-1 (image phải build từ code
#             có script này). -Yes: bỏ bước hỏi xác nhận.
param(
	[string]$DetailFile,
	[string]$LessonDir,
	[string]$Container = 'hospital_rms_dev-backend-1',
	[switch]$Yes
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Ask($prompt) { (Read-Host $prompt).Trim().Trim('"') }
function Run($what) {
	& docker @args
	if ($LASTEXITCODE -ne 0) { throw "Lỗi khi $what (mã $LASTEXITCODE)." }
}
function Done {
	if (-not $Yes) { Read-Host 'Nhấn Enter để đóng' | Out-Null }
}

$tmp = '/tmp/dtlt-import'
$script = 'scripts/import-dtlt-lessons.js'
try {
	if (-not $DetailFile) { $DetailFile = Ask 'File "Chi tiết chương trình học ĐTLT.xlsx" (kéo thả vào đây)' }
	if (-not $LessonDir) { $LessonDir = Ask 'Thư mục "Bài học ĐTLT" chứa các file bài học (kéo thả vào đây)' }
	if (-not (Test-Path -LiteralPath $DetailFile -PathType Leaf)) { throw "Không thấy file: $DetailFile" }
	if (-not (Test-Path -LiteralPath $LessonDir -PathType Container)) { throw "Không thấy thư mục: $LessonDir" }

	$running = docker ps --filter "name=^$Container$" --format '{{.Names}}'
	if ($running -ne $Container) { throw "Container $Container chưa chạy (docker compose up -d)." }

	Write-Host "`n== 1. Migration ==" -ForegroundColor Cyan
	Run 'chạy migration' exec $Container npm run migrate

	Write-Host "`n== 2. Copy file vào container ==" -ForegroundColor Cyan
	Run 'tạo thư mục tạm' exec $Container sh -c "rm -rf $tmp && mkdir -p $tmp"
	Run 'copy file Chi tiết' cp $DetailFile "${Container}:$tmp/detail.xlsx"
	Run 'copy thư mục bài học' cp $LessonDir "${Container}:$tmp/lessons"

	Write-Host "`n== 3. Xem trước ==" -ForegroundColor Cyan
	Run 'xem trước' exec $Container node $script "$tmp/detail.xlsx" "$tmp/lessons"

	if (-not $Yes -and (Ask "`nGhi các thay đổi trên vào DB? (y/n)") -notmatch '^(y|c|co|có)$') {
		Write-Host 'Đã huỷ, DB không thay đổi.' -ForegroundColor Yellow
	} else {
		Write-Host "`n== 4. Ghi DB ==" -ForegroundColor Cyan
		Run 'ghi DB' exec $Container node $script "$tmp/detail.xlsx" "$tmp/lessons" --apply
		Write-Host "`nHoàn tất." -ForegroundColor Green
	}
} catch {
	Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red
	$failed = $true
} finally {
	try { docker exec $Container rm -rf $tmp *> $null } catch {}
	Done
}
if ($failed) { exit 1 }

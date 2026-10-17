<#
.SYNOPSIS
  Triển khai (hoặc rollback) 1 phiên bản đã build sẵn trên CI lên server Docker.

.DESCRIPTION
  .github/workflows/deploy.yml gọi script này trên self-hosted runner đặt tại
  server. GitHub sự cố thì chạy tay trên server với cùng tham số.
    1. Ghi nhớ image đang chạy (để tự quay lại khi hỏng).
    2. Kéo image backend/frontend tag = commit SHA từ registry (không build lại).
    3. Chạy migration DB mới bằng image MỚI (backend/scripts/migrate.js),
       có backup trước nếu đặt MIGRATION_BACKUP_DIR. Lỗi → dừng, bản cũ vẫn chạy.
    4. docker compose up -d --no-build.
    5. Smoke test: /health trả đúng version, /health/db, trang chủ; theo dõi thêm
       SoakSeconds giây xem container có bị restart không.
    6. Hỏng → quay lại image cũ. Migration KHÔNG tự hoàn tác: chỉ viết migration
       tương thích ngược (thêm cột/bảng, không xoá/đổi tên ngay); cần thì restore
       từ file backup ở bước 3.
  Lịch sử triển khai ghi vào <ProjectDir>\logs\deploy-history.log.

  Biến môi trường (tuỳ chọn): MIGRATION_DB_USER / MIGRATION_DB_PASSWORD (login
  có quyền ALTER, chỉ dùng cho bước migration), MIGRATION_BACKUP_DIR.

.EXAMPLE
  .\scripts\deploy.ps1 -Tag <commit sha 40 ký tự> -Registry ghcr.io/nguyenhung2381
  .\scripts\deploy.ps1 -Tag <sha bản cũ> -Registry ghcr.io/nguyenhung2381   # rollback tay
#>
param(
	[Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Tag,
	[Parameter(Mandatory)][string]$Registry,
	# Thư mục chứa backend/.env, backend/.env.production, .env của compose trên server
	[string]$ProjectDir = (Split-Path -Parent $PSScriptRoot),
	# GIỮ "hospital_rms" cho production — volume dữ liệu mang tiền tố này
	[string]$Project = 'hospital_rms',
	[string]$BackendUrl = 'http://127.0.0.1:3001',
	[string]$FrontendUrl = 'http://127.0.0.1:8084',
	[int]$SoakSeconds = 60
)

$ErrorActionPreference = 'Stop'
$composeFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'docker-compose.prod.yml'
$composeArgs = @('compose', '-p', $Project, '--project-directory', $ProjectDir, '-f', $composeFile)

function Invoke-Docker {
	# PowerShell 5.1 coi dòng tiến trình docker ghi ra stderr là lỗi (khi output bị
	# chuyển hướng, như trên runner) → chỉ xét exit code.
	$ErrorActionPreference = 'Continue'
	& docker @args 2>&1 | ForEach-Object { "$_" }
	if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') lỗi (exit $LASTEXITCODE)" }
}
function Invoke-Compose { Invoke-Docker @composeArgs @args }

function Get-ContainerId([string]$service) {
	$id = & docker @composeArgs ps -q $service
	if ($LASTEXITCODE -eq 0 -and $id) { return "$id".Trim() }
	return $null
}

function Get-RunningImage([string]$service) {
	$id = Get-ContainerId $service
	if ($id) { return (& docker inspect --format '{{.Config.Image}}' $id).Trim() }
	return $null
}

function Get-RestartCounts {
	(@('backend', 'frontend') | ForEach-Object { & docker inspect --format '{{.RestartCount}}' (Get-ContainerId $_) }) -join ','
}

# Trả về $null khi khoẻ, ngược lại là mô tả lỗi
function Test-Health([string]$expectVersion) {
	try {
		$h = Invoke-RestMethod "$BackendUrl/health" -TimeoutSec 5
		if ($expectVersion -and $h.version -ne $expectVersion) { return "backend đang chạy version '$($h.version)', chờ '$expectVersion'" }
		Invoke-RestMethod "$BackendUrl/health/db" -TimeoutSec 15 | Out-Null
		Invoke-WebRequest $FrontendUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
		return $null
	} catch {
		return $_.Exception.Message
	}
}

function Wait-Healthy([string]$expectVersion, [int]$timeoutSec = 180) {
	$deadline = (Get-Date).AddSeconds($timeoutSec)
	do {
		Start-Sleep -Seconds 5
		$err = Test-Health $expectVersion
	} while ($err -and (Get-Date) -lt $deadline)
	if ($err) { return "Smoke test hỏng sau $timeoutSec giây: $err" }

	# Khởi động được nhưng crash-loop (vd lỗi lúc chạy job nền) → bắt ở đây
	$before = Get-RestartCounts
	Start-Sleep -Seconds $SoakSeconds
	$after = Get-RestartCounts
	if ($before -ne $after) { return "Container restart trong lúc theo dõi ($before → $after)" }
	return (Test-Health $expectVersion)
}

function Write-History([string]$status, [string]$note) {
	$dir = Join-Path $ProjectDir 'logs'
	if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
	$actor = if ($env:GITHUB_ACTOR) { "$env:GITHUB_ACTOR (run $env:GITHUB_RUN_ID)" } else { $env:USERNAME }
	$line = "{0}`t{1}`t{2}`t{3}`t{4}`t{5}" -f (Get-Date -Format s), $Project, $status, $Tag, $actor, $note
	Add-Content -Path (Join-Path $dir 'deploy-history.log') -Value $line -Encoding UTF8
	if ($env:GITHUB_STEP_SUMMARY) {
		Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding UTF8 -Value "### Deploy ``$Project`` — $status`n- Commit: ``$Tag```n- Bản trước: ``$note```n"
	}
}

$prevBackend = Get-RunningImage 'backend'
$prevFrontend = Get-RunningImage 'frontend'
Write-Host "Bản đang chạy: $prevBackend | $prevFrontend"

$env:BACKEND_IMAGE = "$Registry/hospital_rms-backend:$Tag".ToLower()
$env:FRONTEND_IMAGE = "$Registry/hospital_rms-frontend:$Tag".ToLower()

Write-Host "── Kéo image $Tag"
for ($i = 1; ; $i++) {
	try { Invoke-Compose pull backend frontend; break }
	catch { if ($i -ge 3) { throw }; Write-Host "Thử lại ($i)..."; Start-Sleep -Seconds 15 }
}

Write-Host '── Migration DB'
$runEnv = @()
if ($env:MIGRATION_DB_USER) {
	$env:DB_USER = $env:MIGRATION_DB_USER
	$env:DB_PASSWORD = $env:MIGRATION_DB_PASSWORD
	$runEnv += '-e', 'DB_USER', '-e', 'DB_PASSWORD'
}
if ($env:MIGRATION_BACKUP_DIR) { $runEnv += '-e', 'MIGRATION_BACKUP_DIR' }
try {
	Invoke-Compose run --rm --no-deps -T @runEnv backend node scripts/migrate.js
} catch {
	Write-History 'FAILED-MIGRATION' "$prevBackend"
	throw
} finally {
	Remove-Item Env:DB_USER, Env:DB_PASSWORD -ErrorAction SilentlyContinue
}

Write-Host '── Khởi động bản mới'
Invoke-Compose up -d --no-build backend frontend
$err = Wait-Healthy $Tag
if (-not $err) {
	Write-History 'OK' "$prevBackend"
	Write-Host "Triển khai thành công $Tag"
	exit 0
}

Write-Host "::error::$err"
& docker @composeArgs logs --tail 100 backend
if (-not ($prevBackend -and $prevFrontend)) {
	Write-History 'FAILED' 'không có bản cũ để quay lại'
	throw $err
}
Write-Host "── Quay lại bản cũ: $prevBackend"
$env:BACKEND_IMAGE = $prevBackend
$env:FRONTEND_IMAGE = $prevFrontend
Invoke-Compose up -d --no-build backend frontend
$rollbackErr = Wait-Healthy $null
Write-History 'ROLLED-BACK' "$prevBackend$(if ($rollbackErr) { " — bản cũ cũng lỗi: $rollbackErr" })"
throw "Bản $Tag hỏng, đã quay lại $prevBackend. Lỗi: $err"

# Publishes the prepared SIMS build (ID Cards: back to 0.5mm dashed section borders; PR #106 src at 2917608)
# to hosting:sims ONLY (project bnhs-sims, site bnhs-sims). No functions, rules or Parent App.
# Base: live PR #105 release 1795675837966000 (main assets/index-DgYUvVBy.js, 69 files), rebuilt and byte-matched 69/69.
# Prepared build: tree\sims\dist-new, main assets/index-Zt08fD3E.js, 69 files (sims-hosting-verification.json).
# Run from Windows PowerShell 5.1 (your own terminal):
#   powershell -ExecutionPolicy Bypass -File "<this file>"
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$wt = (Resolve-Path (Join-Path $here '..\..\..\..')).Path          # the PR worktree (has the firebase-tools junction)
$main = (Resolve-Path (Join-Path $wt '..\..\..')).Path             # main checkout (.env)
$config = Join-Path $here 'firebase.idcard-dash05-sims-release.json'  # public: tree/sims/dist-new, target sims only
$dist = Join-Path $here 'tree\sims\dist-new'
$manifest = Join-Path $here 'sims-hosting-verification.json'
$verify = Join-Path $here 'verify-live.mjs'
$liveOut = Join-Path $here 'sims-live-verification.json'
$baselineMain = 'index-DgYUvVBy.js'
$expectedMain = 'index-Zt08fD3E.js'
$expectedCount = 69
$message = 'ID Cards: back to 0.5mm dashed section borders (PR 106)'
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'

# PRE-FLIGHT 1. Live is still the baseline this build was prepared on.
$html = (Invoke-WebRequest -UseBasicParsing -Uri "https://bnhs-sims.web.app/index.html?check=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())").Content
$liveMain = [regex]::Match($html, 'assets/(index-[^"'']+\.js)').Groups[1].Value
if ($liveMain -ne $baselineMain) {
    throw "ABORT: live main script is '$liveMain', not $baselineMain (PR 105 release 1795675837966000). Someone published since this build was prepared. Do not publish; rebuild the baseline from the new live release."
}
Write-Host "Live main script is $baselineMain (PR 105 release 1795675837966000), as expected."

# PRE-FLIGHT 2. The prepared dist is the verified build.
if (-not (Test-Path $dist)) { throw "ABORT: prepared build not found: $dist" }
$distMain = [regex]::Match((Get-Content -Raw (Join-Path $dist 'index.html')), 'assets/(index-[^"'']+\.js)').Groups[1].Value
if ($distMain -ne $expectedMain) { throw "ABORT: prepared main script is '$distMain', expected $expectedMain." }
$count = (Get-ChildItem -Recurse -File $dist).Count
if ($count -ne $expectedCount) { throw "ABORT: prepared dist has $count files, expected $expectedCount." }
node $verify --dist $dist --manifest $manifest
if ($LASTEXITCODE -ne 0) { throw 'ABORT: prepared dist does not match sims-hosting-verification.json.' }
$keyLine = Get-Content (Join-Path $main '.env') | Where-Object { $_ -match '^\s*VITE_RECAPTCHA_SITE_KEY\s*=' } | Select-Object -First 1
$key = ($keyLine -replace '^\s*VITE_RECAPTCHA_SITE_KEY\s*=\s*', '').Trim().Trim('"').Trim("'")
if ($key.Length -ne 40 -or -not $key.StartsWith('6L')) { throw 'ABORT: could not read the reCAPTCHA site key from the main .env.' }
$hits = @(Get-ChildItem -File (Join-Path $dist 'assets') | Where-Object { (Get-Content -Raw $_.FullName).Contains($key) })
$key = $null
if ($hits.Count -ne 1) { throw "ABORT: reCAPTCHA site key found in $($hits.Count) asset files, expected 1." }
Write-Host "Site key present in $($hits[0].Name)."

# CONFIRM.
Write-Host ''
Write-Host 'About to publish to Firebase Hosting:' -ForegroundColor Cyan
Write-Host "  project bnhs-sims, --only hosting:sims (site bnhs-sims)"
Write-Host "  files   $dist ($count files, main assets/$expectedMain)"
Write-Host "  config  $config"
Write-Host "  message $message"
Write-Host "  replaces live release 1795675837966000 (main assets/$baselineMain)"
$answer = Read-Host 'Type Y to publish'
if ($answer -ne 'Y') { Write-Host 'Not published.'; exit 1 }

# PUBLISH, hosting:sims only.
Set-Location $wt
npx firebase deploy --config $config --project bnhs-sims --only hosting:sims --message $message
if ($LASTEXITCODE -ne 0) { throw "firebase deploy failed with exit code $LASTEXITCODE" }

# POST-CHECK: byte-compare every live file with the prepared build.
Start-Sleep -Seconds 10
node $verify --dist $dist --manifest $manifest --live --out $liveOut
$code = $LASTEXITCODE
$result = Get-Content -Raw $liveOut | ConvertFrom-Json
$ok = $result.checked - $result.mismatched
if ($code -ne 0) {
    Write-Host "LIVE CHECK FAILED: $ok/$($result.checked) match. Wait a minute and run verify-sims.ps1, or roll back in the Firebase console (Hosting > Release history > 1795675837966000, main index-DgYUvVBy.js)." -ForegroundColor Red
    exit 1
}
Write-Host "Published and verified: $ok/$($result.checked) MATCH (live main $($result.liveMainScript))." -ForegroundColor Green

# Publishes the prepared SIMS build (Dashboard widget grid, PR 99) to hosting:sims ONLY.
# Baseline: live release 544ea3ffca0ea5be (main index-CH2PMZML.js, 65 files), rebuilt and byte-matched 65/65.
# Prepared build: main script assets/index-hCVkXjug.js, 68 files (sims-hosting-verification.json).
# Run from Windows PowerShell 5.1:
#   powershell -ExecutionPolicy Bypass -File "<this file>"
$ErrorActionPreference = 'Stop'
$main = 'C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims'
$wt = "$main\.claude\worktrees\dashboard-ui-expandable-widgets-8d3491"
$record = "$wt\docs\audits\deployments\2026-11-20-sims-dashboard-widgets"
$release = "$wt\.superpowers\releases\dashw\release"
$config = "$release\firebase.dashboard-widgets-release.json"
$dist = "$release\sims\dist"
$manifest = "$record\sims-hosting-verification.json"
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'

# 1. Live is still the baseline this build was prepared on.
$html = (Invoke-WebRequest -UseBasicParsing -Uri "https://bnhs-sims.web.app/index.html?check=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())").Content
if ($html -notmatch 'assets/index-CH2PMZML\.js') { throw 'Live main script is not index-CH2PMZML.js: someone published since this build was prepared. Do not publish; rebuild the baseline.' }
Write-Host 'Live main script is index-CH2PMZML.js (release 544ea3ffca0ea5be), as expected.'

# 2. The prepared dist is the verified build.
if (-not (Test-Path "$dist\assets\index-hCVkXjug.js")) { throw 'Prepared main script index-hCVkXjug.js is missing.' }
$count = (Get-ChildItem -Recurse -File $dist).Count
if ($count -ne 68) { throw "Prepared dist has $count files, expected 68." }
node "$record\verify-live.mjs" --dist $dist --manifest $manifest
if ($LASTEXITCODE -ne 0) { throw 'Prepared dist does not match sims-hosting-verification.json.' }
$keyLine = Get-Content "$main\.env" | Where-Object { $_ -match '^\s*VITE_RECAPTCHA_SITE_KEY\s*=' } | Select-Object -First 1
$key = ($keyLine -replace '^\s*VITE_RECAPTCHA_SITE_KEY\s*=\s*', '').Trim().Trim('"').Trim("'")
if ($key.Length -ne 40 -or -not $key.StartsWith('6L')) { throw 'Could not read the reCAPTCHA site key from the main .env.' }
$hits = @(Get-ChildItem -File "$dist\assets" | Where-Object { (Get-Content -Raw $_.FullName).Contains($key) })
$key = $null
if ($hits.Count -ne 1) { throw "reCAPTCHA site key found in $($hits.Count) asset files, expected 1." }
Write-Host "Site key present in $($hits[0].Name). Dist: $count files."

# 3. Publish, hosting:sims only.
Set-Location $wt
npx firebase deploy --config $config --project bnhs-sims --only hosting:sims --message "SIMS dashboard widget grid (PR 99 source 384d2ea) over live release 544ea3ffca0ea5be"
if ($LASTEXITCODE -ne 0) { throw "firebase deploy failed with exit code $LASTEXITCODE" }

# 4. Re-verify live against the build, byte for byte (rewrites sims-hosting-verification.json with the result).
Start-Sleep -Seconds 10
node "$record\verify-live.mjs" --manifest $manifest --live --out $manifest
if ($LASTEXITCODE -ne 0) { Write-Host 'LIVE CHECK FAILED: see the mismatches above. Wait a minute and rerun only step 4, or roll back in the Firebase console (Hosting > Release history > 544ea3ffca0ea5be).' -ForegroundColor Red; exit 1 }
Write-Host 'Published and verified: live matches the prepared build (68 of 68 files).' -ForegroundColor Green

# Read-only: byte-checks every file of the prepared SIMS build (tree\sims\dist-new, 69 files) against
# https://bnhs-sims.web.app. Before the publish a mismatch is EXPECTED (live is still index-DU3AcgBx.js).
# Run from Windows PowerShell 5.1:
#   powershell -ExecutionPolicy Bypass -File "<this file>"
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$dist = Join-Path $here 'tree\sims\dist-new'
$manifest = Join-Path $here 'sims-hosting-verification.json'
$out = Join-Path $here 'sims-live-verification.json'
if (-not (Test-Path $dist)) { throw "Prepared build not found: $dist" }

node (Join-Path $here 'verify-live.mjs') --dist $dist --manifest $manifest --live --out $out
$code = $LASTEXITCODE
$result = Get-Content -Raw $out | ConvertFrom-Json
$ok = $result.checked - $result.mismatched
if ($code -eq 0) {
    Write-Host "$ok/$($result.checked) MATCH: live is the prepared ID card colors build (live main $($result.liveMainScript))." -ForegroundColor Green
} else {
    Write-Host "$ok/$($result.checked) match, $($result.mismatched) mismatched (live main $($result.liveMainScript)). Expected before publishing; details in $out" -ForegroundColor Yellow
}
exit $code

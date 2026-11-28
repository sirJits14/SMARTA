# Publishes ONE step of the adviser temporary-pass-request release. Run the steps in this order:
#   indexes, functions, rules, sims, accounts, parent
# From Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File "<this file>" indexes
param([Parameter(Mandatory = $true)][ValidateSet('indexes', 'functions', 'rules', 'sims', 'accounts', 'parent')][string]$Step)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$wt = (Resolve-Path (Join-Path $here '..\..\..')).Path
$main = (Resolve-Path (Join-Path $wt '..\..\..')).Path
$parentTree = Join-Path $main '.claude\worktrees\temp-pass-parent'
$preparedMaster = '191e348'
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
# OneDrive locks old folders under .git\worktrees, so Git's automatic cleanup after a fetch
# asks "Should I try again? (y/n)" forever. Switch it off for this script and everything it starts
# (the Parent build runs its own git fetch).
$env:GIT_CONFIG_COUNT = '2'
$env:GIT_CONFIG_KEY_0 = 'gc.auto'
$env:GIT_CONFIG_VALUE_0 = '0'
$env:GIT_CONFIG_KEY_1 = 'maintenance.auto'
$env:GIT_CONFIG_VALUE_1 = 'false'

function Invoke-Checked([string]$what) { if ($LASTEXITCODE -ne 0) { throw "ABORT: $what" } }
function Confirm-Publish([string]$summary) {
    Write-Host ''
    Write-Host "About to publish to project bnhs-sims: $summary" -ForegroundColor Cyan
    if ((Read-Host 'Type Y to publish') -ne 'Y') { Write-Host 'Not published.'; exit 1 }
}
# Deploys functions by name from the prepared backend tree; never "--only functions" alone.
function Publish-Functions([string[]]$names) {
    $only = ($names | ForEach-Object { "functions:$_" }) -join ','
    if (-not (Test-Path (Join-Path $here 'functions\backend\functions\node_modules'))) { throw 'ABORT: the functions node_modules link is missing.' }
    Confirm-Publish "$($names.Count) functions by name: $($names -join ', ')"
    Write-Host 'If Firebase asks about retry policies for new triggers, answer y. Answer N to any question about DELETING functions.' -ForegroundColor Yellow
    $envFile = Join-Path $here 'functions\backend\functions\.env'
    'PORTAL_URL=https://bnhs-parent.web.app' | Out-File -Encoding ascii $envFile
    try {
        npx firebase deploy --config (Join-Path $here 'functions\firebase.json') --project bnhs-sims --only $only
        Invoke-Checked 'firebase deploy failed. Run this step again only after reading the error.'
    } finally { Remove-Item $envFile -Force -Confirm:$false }
}

Set-Location $wt
Write-Host "Pre-flight for '$Step' (read-only)..."
node (Join-Path $here 'check-live.cjs') before $Step
Invoke-Checked 'production is not in the expected state. Nothing was published.'
if ($Step -ne 'parent') {
    node (Join-Path $here 'manifest.mjs') check $Step
    Invoke-Checked 'prepared files changed since preparation. Nothing was published.'
}

switch ($Step) {
    'indexes' {
        Confirm-Publish 'the 4 temp_pass_requests Firestore indexes (adds only; nothing is deleted)'
        npx firebase deploy --config (Join-Path $here 'indexes\firebase.json') --project bnhs-sims --only firestore:indexes --non-interactive
        Invoke-Checked 'firebase deploy failed'
        Write-Host 'Waiting for the indexes to build (up to 10 minutes)...'
        for ($i = 0; $i -lt 40; $i++) {
            node (Join-Path $here 'check-live.cjs') after indexes
            if ($LASTEXITCODE -eq 0) { break }
            Start-Sleep -Seconds 15
        }
    }
    'functions' {
        Publish-Functions @('requestTempPassesFn', 'withdrawTempPassRequestFn', 'getTempPassRequestsFn', 'listTempPassRequestsFn',
            'fulfilTempPassRequestsFn', 'markTempPassRequestsPrintedFn', 'declineTempPassRequestFn',
            'issueTempPassFn', 'saveStudentPhotoFn', 'getStudentPhotoFn')
        Write-Host 'JHS/SHS Academic Coordinators lose pass and photo access from now until SIMS is published (step sims).' -ForegroundColor Yellow
    }
    'rules' {
        Confirm-Publish 'Firestore rules (live rules plus the Logistic Operator and pass-request additions; see rules\rules.diff). Publish SIMS straight after.'
        npx firebase deploy --config (Join-Path $here 'rules\firebase.json') --project bnhs-sims --only firestore:rules
        Invoke-Checked 'firebase deploy failed'
    }
    'sims' {
        Confirm-Publish 'SIMS (hosting:sims), built on the live 2026-11-27 release tree'
        npx firebase deploy --config (Join-Path $here 'sims\firebase.json') --project bnhs-sims --only hosting:sims --message 'Adviser pass requests, Logistic Operator, four passes per sheet (PR 109)'
        Invoke-Checked 'firebase deploy failed'
        $dist = Join-Path $here 'sims\tree\sims\dist-tree'; $site = 'https://bnhs-sims.web.app'
    }
    'accounts' {
        Write-Host 'These six account functions were last deployed on 2026-10-12. This moves them onto the current tree: see README, section "Account functions".' -ForegroundColor Yellow
        Publish-Functions @('createStaffUserFn', 'updateStaffUserFn', 'setStaffUserDisabledFn', 'resetStaffPasswordFn', 'deleteStaffUserFn', 'changeOwnPasswordFn')
    }
    'parent' {
        git -C $parentTree fetch origin master
        Invoke-Checked 'could not fetch master'
        $newer = git -C $parentTree log --oneline "$preparedMaster..origin/master" -- parent shared scripts/buildParentRelease.mjs
        if ($newer) { throw "ABORT: master has newer Parent changes than this release was checked on: $($newer -join '; ')" }
        git -C $parentTree checkout --detach origin/master
        Invoke-Checked 'could not update the Parent checkout'
        $env:PARENT_ENV_DIR = Join-Path $main 'parent'
        Confirm-Publish 'the Parent App (hosting:parent), built fresh from merged master'
        Set-Location $parentTree
        npx firebase deploy --project bnhs-sims --only hosting:parent --message 'Parent App: advisers request temporary passes (PR 109)'
        Invoke-Checked 'firebase deploy failed'
        $dist = Join-Path $parentTree 'parent\dist'; $site = 'https://bnhs-parent.web.app'
    }
}

Start-Sleep -Seconds 10
Set-Location $wt
if ($dist) {
    node (Join-Path $here 'verify-hosting.mjs') $dist $site --json (Join-Path $here "$Step-live-verification.json")
    Invoke-Checked "LIVE CHECK FAILED for $Step. Wait a minute and re-run verify-hosting.mjs, or roll back in the Firebase console (Hosting > Release history)."
} else {
    node (Join-Path $here 'check-live.cjs') after $Step
    Invoke-Checked "the live check after '$Step' failed. Do not continue to the next step."
}
Write-Host "Step '$Step' published and verified." -ForegroundColor Green

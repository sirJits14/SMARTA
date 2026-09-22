#!/usr/bin/env bash
# Logs-based metrics + alert policies for the parent portal (spec §10).
# Requires: gcloud auth login; gcloud config set project bnhs-sims
set -euo pipefail
P=bnhs-sims

metric() { # name, filter
  gcloud logging metrics create "$1" --project "$P" --description "$1" --log-filter="$2" 2>/dev/null \
    || gcloud logging metrics update "$1" --project "$P" --log-filter="$2"
}
BASE='resource.type="cloud_run_revision" AND jsonPayload.event='
metric events_processed     "${BASE}\"scan_processed\""
metric events_rejected      "${BASE}\"scan_rejected\""
metric activation_failures  "${BASE}\"activation_failed\""
metric reconcile_missing    "${BASE}\"reconcile_done\" AND jsonPayload.missing>0"
metric pushes_sent          "${BASE}\"scan_processed\" AND jsonPayload.pushesSent>0"
metric pushes_failed        "${BASE}\"scan_processed\" AND jsonPayload.pushesFailed>0"
metric function_errors      'resource.type="cloud_run_revision" AND severity>=ERROR'

echo "Metrics created. Now in Cloud Console → Monitoring → Alerting create policies:"
echo "  activation_failures  > 50 in 1h"
echo "  reconcile_missing    > 0 in 24h"
echo "  pushes_failed        > 20% of pushes_sent over 1h  (spec §10; NOT events_processed --"
echo "                          a scan can process with zero push attempts, e.g. paused, no"
echo "                          linked guardian, or suppressed as a duplicate)"
echo "  function_errors      > 5% of requests over 15m"
echo "  Uptime check: https://bnhs-parent.web.app/ every 5 min"
echo "Budget: Billing → Budgets → PHP 1,500 with 50/100/200% email alerts to the owner and registrar."

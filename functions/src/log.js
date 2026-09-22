import { logger } from 'firebase-functions';

// One structured line per outcome. Logs-based metrics (Phase 6) filter on
// jsonPayload.event, so the name is the contract — keep names stable.
export function logEvent(event, fields = {}) {
  logger.info(event, { event, ...fields });
}
export function logWarn(event, fields = {}) {
  logger.warn(event, { event, ...fields });
}

export const outboundQueueNames = {
  sendReminder: 'outbound-send-reminder',
  startCall: 'outbound-start-call'
} as const;

export const sourcingQueueNames = {
  ingestSourceRun: 'sourcing-ingest-source-run',
  extractEvidence: 'sourcing-extract-evidence',
  generateDedupCandidates: 'sourcing-generate-dedup-candidates',
  materializeApprovedEntity: 'sourcing-materialize-approved-entity',
} as const;

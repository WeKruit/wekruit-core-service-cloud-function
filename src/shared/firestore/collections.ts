export const outboundCollections = {
  candidates: 'outbound-candidates',
  dispatchProfiles: 'outbound-dispatch-profiles',
  schedulingInvites: 'outbound-scheduling-invites',
  bookings: 'outbound-bookings',
  callArtifacts: 'outbound-call-artifacts'
} as const;

export const sourcingCollections = {
  sourceRuns: 'sourcing-source-runs',
  sourceRecords: 'sourcing-source-records',
  evidence: 'sourcing-evidence',
  dedupCandidates: 'sourcing-dedup-candidates',
  reviewLabels: 'sourcing-review-labels',
  approvedEntities: 'sourcing-approved-entities',
} as const;

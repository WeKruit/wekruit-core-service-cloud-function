export const outboundCollections = {
  candidates: 'outbound-candidates',
  dispatchProfiles: 'outbound-dispatch-profiles',
  schedulingInvites: 'outbound-scheduling-invites',
  bookings: 'outbound-bookings',
  callArtifacts: 'outbound-call-artifacts'
} as const;

export const matchingCollections = {
  platformUsers: 'platform-users',
  jobs: 'matching-jobs',
  feedback: 'matching-feedback',
  savedJobs: 'matching-saved-jobs',
} as const;

export const sourcingCollections = {
  sourceRuns: 'sourcing-source-runs',
  sourceRecords: 'sourcing-source-records',
  evidence: 'sourcing-evidence',
  dedupCandidates: 'sourcing-dedup-candidates',
  reviewLabels: 'sourcing-review-labels',
  approvedEntities: 'sourcing-approved-entities',
  enrichmentRuns: 'sourcing-enrichment-runs',
  enrichmentReviewItems: 'sourcing-enrichment-review-items',
  candidateProfiles: 'sourcing-candidate-profiles',
  vendorEnrichmentRuns: 'sourcing-vendor-enrichment-runs',
  vendorProfileMatches: 'sourcing-vendor-profile-matches',
} as const;

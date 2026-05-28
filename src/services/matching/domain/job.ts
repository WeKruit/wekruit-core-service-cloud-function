export type MatchingJobStatus = 'active' | 'inactive';
export type MatchingJobType =
  | 'intern'
  | 'new_grad'
  | 'full_time'
  | 'contract'
  | 'part_time'
  | 'other';

export interface MatchingJobRecord {
  id: string;
  sourceRepo: string | null;
  /**
   * Phase 63 multi-source attribution (e.g. ['vcboard:a16z', 'jobright']).
   * Carried alongside the legacy single `sourceRepo` so a job that appears
   * on multiple VC boards or ATS feeds keeps every source after cross-source
   * dedup. 2026-05-28: previously dropped during sync — `sources` was None on
   * every Firestore doc even though the scraper emits it.
   */
  sources?: string[];
  jobType: MatchingJobType;
  companyName: string | null;
  roleTitle: string | null;
  primaryUrl: string | null;
  atsApplyUrl: string | null;
  locationRaw: string | null;
  datePostedRaw: string | null;
  status: MatchingJobStatus;
  contentHash: string;
  jobDescription: string | null;
  coreResponsibilities: string[];
  salaryRange: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  seniorityLevel: string | null;
  benefits: string[];
  qualifications: string[];
  industry: string | null;
  companySize: string | null;
  requiredSkills: string[];
  requiredSkillsIndex: string[];
  locationBuckets: string[];
  searchTokens: string[];
  industryKey: string | null;
  sponsorship: boolean | null;
  embedding: number[] | null;
  embeddingModel: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  enrichedAt: string | null;
  embeddedAt: string | null;
  syncedAt: string;
  // v1.6 canonical-vocab fields (D1 / D2). Filled async by the wekruit-pa
  // side trigger `paMatchingJobsAutoEnrich` (Firestore onDocumentWritten on
  // matching-jobs/{jobId}) calling `@pa/job-tag-enricher`. Optional here
  // because the macmini sync builder does not compute them; they land on
  // the Firestore doc later. Marking them on the type surface keeps the
  // schema honest end-to-end (matching reader in wekruit-pa already reads
  // these). When the scraper is taught to emit canonical tags inline (W7),
  // these stay structurally compatible — no payload migration needed.
  roleFunction?: string[];      // jobright utm_campaign 17-token vocab (D1)
  industrySector?: string[];    // 42-token canonical vocab (D2)
}

export interface MatchingJobSyncState {
  id: string;
  contentHash: string | null;
  status: MatchingJobStatus | null;
  hasEmbedding: boolean;
}

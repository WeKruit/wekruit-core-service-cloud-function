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
}

export interface MatchingJobSyncState {
  id: string;
  contentHash: string | null;
  status: MatchingJobStatus | null;
  hasEmbedding: boolean;
}

export type MatchingJobStatus = 'active' | 'inactive';
export type MatchingJobType = 'intern' | 'new_grad' | 'other';

export interface MatchingJobRecord {
  id: string;
  sourceRepo: string | null;
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

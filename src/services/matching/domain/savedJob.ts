export interface MatchingSavedJobRecord {
  id: string;
  userId: string;
  jobId: string;
  companyName: string | null;
  jobTitle: string | null;
  primaryUrl: string | null;
  createdAt: string;
}

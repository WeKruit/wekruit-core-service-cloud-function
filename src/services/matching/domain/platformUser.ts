export type PlatformUserRemotePreference = 'remote' | 'hybrid' | 'onsite' | 'any';

export interface PlatformUserSalaryRange {
  min: number;
  max: number;
  currency: string;
}

export interface PlatformUserPreferences {
  targetJobTitles: string[];
  jobType: string | null;
  preferredLocations: string[];
  preferredIndustries: string[];
  remotePreference: PlatformUserRemotePreference;
  excludedCompanies: string[];
  minimumSalary: number | null;
  salaryRange: PlatformUserSalaryRange | null;
  experienceLevel: string | null;
  companySizePreference: string | null;
  sponsorshipNeeded: boolean;
}

export interface PlatformUserSyncSource {
  eventType: 'INSERT' | 'UPDATE';
  table: string;
  schema: string;
  usersUpdatedAt: string | null;
  applicationProfileUpdatedAt: string | null;
  defaultResumeParsedAt: string | null;
}

export interface PlatformUserRecord {
  uid: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  location: string | null;
  status: string;
  subscriptionTier: string;
  skills: string[];
  preferences: PlatformUserPreferences;
  workAuthorization: string | null;
  visaSponsorship: string | null;
  resumeSummary: string | null;
  totalYearsExperience: number | null;
  sourcePayloadHash: string;
  syncedAt: string;
  source: PlatformUserSyncSource;
}

export interface PlatformUserSyncState {
  sourcePayloadHash: string | null;
}

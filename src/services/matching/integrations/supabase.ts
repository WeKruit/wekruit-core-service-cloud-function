import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { MatchingRuntimeConfig } from '../application/runtime';
import type {
  PlatformUserSyncSource,
  ValetApplicationProfileRow,
  ValetResumeRow,
  ValetUserAggregate,
  ValetUserRow,
} from '../application/userSync';

interface SupabaseUserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  location: string | null;
  skills: unknown;
  preferences: unknown;
  is_active: boolean | null;
  subscription_tier: string;
  updated_at: string | null;
}

interface SupabaseApplicationProfileRow {
  user_id: string;
  work_authorization: string | null;
  visa_sponsorship: string | null;
  preferred_work_mode: string | null;
  preferred_locations: string | null;
  updated_at: string | null;
}

interface SupabaseResumeRow {
  user_id: string;
  status: string;
  is_default: boolean;
  parsed_data: Record<string, unknown> | null;
  parsed_at: string | null;
}

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) {
    return false;
  }

  if (error.code === 'PGRST205' || error.code === '42P01') {
    return true;
  }

  const message = error.message?.toLowerCase() ?? '';
  return (
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('could not find the table')
  );
}

function mapUserRow(row: SupabaseUserRow): ValetUserRow {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    location: row.location,
    skills: row.skills,
    preferences: row.preferences,
    status: row.is_active === false ? 'inactive' : 'active',
    subscriptionTier: row.subscription_tier,
    updatedAt: row.updated_at,
  };
}

function mapApplicationProfileRow(
  row: SupabaseApplicationProfileRow | null,
): ValetApplicationProfileRow | null {
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    workAuthorization: row.work_authorization,
    visaSponsorship: row.visa_sponsorship,
    preferredWorkMode: row.preferred_work_mode,
    preferredLocations: row.preferred_locations,
    updatedAt: row.updated_at,
  };
}

function mapResumeRow(row: SupabaseResumeRow | null): ValetResumeRow | null {
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    status: row.status,
    isDefault: row.is_default,
    parsedData: row.parsed_data,
    parsedAt: row.parsed_at,
  };
}

export class MatchingSupabaseService implements PlatformUserSyncSource {
  private readonly client: SupabaseClient;

  constructor(config: MatchingRuntimeConfig, client?: SupabaseClient) {
    this.client =
      client ??
      createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
  }

  async getAggregatedUser(uid: string): Promise<ValetUserAggregate | null> {
    const [userResult, applicationProfileResult, resumeResult] = await Promise.all([
      this.client
        .from('users')
        .select(
          'id,email,name,avatar_url,location,skills,preferences,is_active,subscription_tier,updated_at',
        )
        .eq('id', uid)
        .maybeSingle<SupabaseUserRow>(),
      this.client
        .from('user_application_profiles')
        .select(
          'user_id,work_authorization,visa_sponsorship,preferred_work_mode,preferred_locations,updated_at',
        )
        .eq('user_id', uid)
        .maybeSingle<SupabaseApplicationProfileRow>(),
      this.client
        .from('resumes')
        .select('user_id,status,is_default,parsed_data,parsed_at')
        .eq('user_id', uid)
        .eq('is_default', true)
        .order('parsed_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle<SupabaseResumeRow>(),
    ]);

    if (userResult.error) {
      throw userResult.error;
    }
    if (applicationProfileResult.error && !isMissingRelationError(applicationProfileResult.error)) {
      throw applicationProfileResult.error;
    }
    if (resumeResult.error) {
      throw resumeResult.error;
    }

    if (!userResult.data) {
      return null;
    }

    return {
      user: mapUserRow(userResult.data),
      applicationProfile: mapApplicationProfileRow(
        applicationProfileResult.error ? null : applicationProfileResult.data,
      ),
      defaultResume: mapResumeRow(resumeResult.data),
    };
  }
}

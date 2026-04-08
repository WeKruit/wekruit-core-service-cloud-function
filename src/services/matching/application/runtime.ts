import {
  matchingLegacyApiKey,
  matchingOpenAiApiKey,
  matchingSupabaseServiceRoleKey,
  matchingSupabaseUrl,
  matchingSyncApiKey,
} from '../../../bootstrap/secrets';

export interface MatchingRuntimeConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  syncApiKey: string;
}

function requiredSecret(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing required Firebase secret "${name}".`);
  }
  return trimmed;
}

export function getMatchingRuntimeConfig(): MatchingRuntimeConfig {
  return {
    supabaseUrl: requiredSecret(matchingSupabaseUrl.value(), 'MATCHING_SUPABASE_URL'),
    supabaseServiceRoleKey: requiredSecret(
      matchingSupabaseServiceRoleKey.value(),
      'MATCHING_SUPABASE_SERVICE_ROLE_KEY',
    ),
    syncApiKey: requiredSecret(matchingSyncApiKey.value(), 'MATCHING_SYNC_API_KEY'),
  };
}

export function getMatchingOpenAiApiKey() {
  return requiredSecret(matchingOpenAiApiKey.value(), 'MATCHING_OPENAI_API_KEY');
}

export function getMatchingLegacyApiKey() {
  return matchingLegacyApiKey.value().trim();
}

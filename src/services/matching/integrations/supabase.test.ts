import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchingSupabaseService } from './supabase';

type FakeResult<T> = Promise<{ data: T | null; error: { code?: string; message?: string } | null }>;

class FakeQuery<T> {
  constructor(private readonly result: FakeResult<T>) {}

  select(): this {
    return this;
  }

  eq(): this {
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  maybeSingle(): FakeResult<T> {
    return this.result;
  }
}

test('MatchingSupabaseService tolerates a missing user_application_profiles table in prod', async () => {
  const service = new MatchingSupabaseService(
    {
      syncApiKey: 'sync-key',
      supabaseUrl: 'https://supabase.example',
      supabaseServiceRoleKey: 'service-role',
    },
    {
      from(table: string) {
        if (table === 'users') {
          return new FakeQuery(
            Promise.resolve({
              data: {
                id: 'user-1',
                email: 'user@example.com',
                name: 'User One',
                avatar_url: null,
                location: 'Austin, TX',
                skills: ['TypeScript'],
                preferences: { jobPreferences: { sponsorshipNeeded: false } },
                is_active: true,
                subscription_tier: 'pro',
                updated_at: '2026-04-01T10:00:00.000Z',
              },
              error: null,
            }),
          );
        }

        if (table === 'user_application_profiles') {
          return new FakeQuery(
            Promise.resolve({
              data: null,
              error: {
                code: 'PGRST205',
                message: "Could not find the table 'public.user_application_profiles' in the schema cache",
              },
            }),
          );
        }

        if (table === 'resumes') {
          return new FakeQuery(
            Promise.resolve({
              data: {
                user_id: 'user-1',
                status: 'parsed',
                is_default: true,
                parsed_data: {
                  summary: 'Built APIs',
                  totalYearsExperience: 4,
                },
                parsed_at: '2026-04-01T11:00:00.000Z',
              },
              error: null,
            }),
          );
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as never,
  );

  const aggregate = await service.getAggregatedUser('user-1');

  assert.ok(aggregate);
  assert.equal(aggregate.user.id, 'user-1');
  assert.equal(aggregate.applicationProfile, null);
  assert.equal(aggregate.defaultResume?.userId, 'user-1');
  assert.equal(aggregate.defaultResume?.parsedData?.summary, 'Built APIs');
});

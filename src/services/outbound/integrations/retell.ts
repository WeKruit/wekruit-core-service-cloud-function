import type { OutboundRetellServiceContract } from '../application/contracts';
import type { OutboundRuntimeConfig } from '../application/runtime';

export class OutboundRetellService implements OutboundRetellServiceContract {
  constructor(private readonly config: OutboundRuntimeConfig) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`https://api.retellai.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.retellApiKey}`,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Retell request failed (${response.status}) for ${path}: ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  async startInterviewCall(input: {
    bookingId: string;
    dispatchProfileSlug: string;
    dispatchProfileName: string;
    retellAgentId: string;
    retellFromPhoneNumber: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<{ callId: string; status: string }> {
    const payload = await this.request<{ call_id: string; call_status: string }>('/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: input.retellFromPhoneNumber,
        to_number: input.candidatePhone,
        override_agent_id: input.retellAgentId,
        metadata: {
          bookingId: input.bookingId,
          dispatchProfileSlug: input.dispatchProfileSlug,
          dispatchProfileName: input.dispatchProfileName,
          candidateName: input.candidateName,
          candidateEmail: input.candidateEmail,
          candidatePhone: input.candidatePhone,
        },
        retell_llm_dynamic_variables: {
          booking_id: input.bookingId,
          dispatch_profile_slug: input.dispatchProfileSlug,
          dispatch_profile_name: input.dispatchProfileName,
          candidate_name: input.candidateName,
          interview_timezone: input.timezone,
          interview_starts_at: input.startsAt,
          question_set_name: input.questionSetName ?? 'general-screen',
          general_questions: input.generalQuestions ?? '',
        },
      }),
    });

    return {
      callId: payload.call_id,
      status: payload.call_status,
    };
  }

  async listVoiceAgents(): Promise<
    Array<{
      agentId: string;
      agentName: string | null;
      isPublished: boolean | null;
      version: number | null;
      webhookUrl: string | null;
      webhookEvents: string[] | null;
      webhookTimeoutMs: number | null;
    }>
  > {
    const payload = await this.request<Array<Record<string, unknown>>>('/list-agents', {
      method: 'GET',
    });

    const uniqueAgentIds = [...new Set(payload.map((agent) => String(agent.agent_id)))];
    const versionPayloads = await Promise.all(
      uniqueAgentIds.map(async (agentId) => ({
        agentId,
        versions: await this.request<Array<Record<string, unknown>>>(`/get-agent-versions/${agentId}`, {
          method: 'GET',
        }),
      })),
    );

    return versionPayloads
      .map(({ agentId, versions }) => {
        const latestVersion = versions.reduce<Record<string, unknown> | null>((current, candidate) => {
          if (!current) {
            return candidate;
          }

          const currentVersion =
            typeof current.version === 'number' ? (current.version as number) : Number.NEGATIVE_INFINITY;
          const candidateVersion =
            typeof candidate.version === 'number'
              ? (candidate.version as number)
              : Number.NEGATIVE_INFINITY;

          return candidateVersion > currentVersion ? candidate : current;
        }, null);

        if (!latestVersion) {
          return null;
        }

        return {
          agentId,
          agentName: latestVersion.agent_name ? String(latestVersion.agent_name) : null,
          isPublished:
            typeof latestVersion.is_published === 'boolean'
              ? (latestVersion.is_published as boolean)
              : null,
          version:
            typeof latestVersion.version === 'number' ? (latestVersion.version as number) : null,
          webhookUrl: latestVersion.webhook_url ? String(latestVersion.webhook_url) : null,
          webhookEvents: Array.isArray(latestVersion.webhook_events)
            ? latestVersion.webhook_events.map((event) => String(event))
            : null,
          webhookTimeoutMs:
            typeof latestVersion.webhook_timeout_ms === 'number'
              ? (latestVersion.webhook_timeout_ms as number)
              : null,
        };
      })
      .filter((agent): agent is NonNullable<typeof agent> => agent !== null);
  }

  async listPhoneNumbers(): Promise<
    Array<{
      phoneNumber: string;
      phoneNumberPretty: string | null;
      phoneNumberType: string | null;
    }>
  > {
    const payload = await this.request<Array<Record<string, unknown>>>('/list-phone-numbers', {
      method: 'GET',
    });

    return payload.map((phoneNumber) => ({
      phoneNumber: String(phoneNumber.phone_number),
      phoneNumberPretty: phoneNumber.phone_number_pretty
        ? String(phoneNumber.phone_number_pretty)
        : null,
      phoneNumberType: phoneNumber.phone_number_type ? String(phoneNumber.phone_number_type) : null,
    }));
  }
}

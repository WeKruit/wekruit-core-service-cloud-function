import type { OutboundDispatchProfile } from '../domain/dispatch-profile';

export interface OutboundCandidateWaveRow {
  rowId: string;
  fullName: string;
  email: string;
  phone: string;
  school?: string;
  campaign?: string;
  purpose?: string;
  tags: string[];
}

export interface OutboundCandidateWaveMatch {
  rowId: string;
  candidate: OutboundCandidateWaveRow;
  status: 'matched' | 'ambiguous' | 'unmatched';
  explanation: string;
  suggestedProfileSlug: string | null;
  suggestedProfileName: string | null;
  matchedProfileSlugs: string[];
}

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeTagList(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function splitCandidateWaveColumns(row: string): string[] {
  if (row.includes('\t')) {
    return row.split('\t').map((column) => column.trim());
  }

  return row.split(',').map((column) => column.trim());
}

export function parseOutboundCandidateWaveRows(raw: string): OutboundCandidateWaveRow[] {
  const rows = raw
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length === 0) {
    throw new Error('Add at least one candidate row.');
  }

  return rows.map((row, index) => {
    const columns = splitCandidateWaveColumns(row);
    if (columns.length < 3) {
      throw new Error(
        `Candidate row ${index + 1} must include at least "Full Name, email, phone".`,
      );
    }

    const [fullName, email, phone, school = '', campaign = '', purpose = '', ...tagParts] = columns;
    const tagsCell = tagParts.join(row.includes('\t') ? '\t' : ',').trim();

    if (!fullName || !email || !phone) {
      throw new Error(`Candidate row ${index + 1} is missing name, email, or phone.`);
    }

    return {
      rowId: String(index + 1),
      fullName,
      email,
      phone,
      school: school || undefined,
      campaign: campaign || undefined,
      purpose: purpose || undefined,
      tags: tagsCell ? normalizeTagList(tagsCell) : []
    };
  });
}

function buildProvidedDimensions(row: OutboundCandidateWaveRow): string[] {
  const provided: string[] = [];

  if (normalizeValue(row.school)) {
    provided.push('school');
  }
  if (normalizeValue(row.campaign)) {
    provided.push('campaign');
  }
  if (normalizeValue(row.purpose)) {
    provided.push('purpose');
  }
  if (row.tags.length > 0) {
    provided.push(`tags:${row.tags.join(', ')}`);
  }

  return provided;
}

export function previewOutboundCandidateWaveMatches(
  rows: OutboundCandidateWaveRow[],
  profiles: OutboundDispatchProfile[],
): OutboundCandidateWaveMatch[] {
  return rows.map((row) => {
    const rowSchool = normalizeValue(row.school);
    const rowCampaign = normalizeValue(row.campaign);
    const rowPurpose = normalizeValue(row.purpose);
    const rowTags = row.tags.map((tag) => tag.toLowerCase());

    const eligible = profiles
      .map((profile) => {
        const matchedDimensions: string[] = [];

        if (rowSchool) {
          if (normalizeValue(profile.school) !== rowSchool) {
            return null;
          }
          matchedDimensions.push('school');
        }

        if (rowCampaign) {
          if (normalizeValue(profile.campaign) !== rowCampaign) {
            return null;
          }
          matchedDimensions.push('campaign');
        }

        if (rowPurpose) {
          if (normalizeValue(profile.purpose) !== rowPurpose) {
            return null;
          }
          matchedDimensions.push('purpose');
        }

        if (rowTags.length > 0) {
          const profileTags = new Set(profile.tags.map((tag) => tag.toLowerCase()));
          const missingTags = rowTags.filter((tag) => !profileTags.has(tag));
          if (missingTags.length > 0) {
            return null;
          }
          matchedDimensions.push(...rowTags.map((tag) => `tag:${tag}`));
        }

        return {
          profile,
          score: matchedDimensions.length
        };
      })
      .filter((entry): entry is { profile: OutboundDispatchProfile; score: number } => entry !== null);

    if (eligible.length === 0) {
      const provided = buildProvidedDimensions(row);
      return {
        rowId: row.rowId,
        candidate: row,
        status: 'unmatched',
        explanation:
          provided.length > 0
            ? `No active route matched ${provided.join(', ')}.`
            : 'No active route could be inferred from this row.',
        suggestedProfileSlug: null,
        suggestedProfileName: null,
        matchedProfileSlugs: []
      };
    }

    const highestScore = Math.max(...eligible.map((entry) => entry.score));
    const bestMatches = eligible.filter((entry) => entry.score === highestScore);

    if (bestMatches.length === 1) {
      return {
        rowId: row.rowId,
        candidate: row,
        status: 'matched',
        explanation:
          highestScore > 0
            ? `Matched on ${buildProvidedDimensions(row).join(', ')}.`
            : 'Matched the only active route.',
        suggestedProfileSlug: bestMatches[0].profile.slug,
        suggestedProfileName: bestMatches[0].profile.name,
        matchedProfileSlugs: bestMatches.map((entry) => entry.profile.slug)
      };
    }

    return {
      rowId: row.rowId,
      candidate: row,
      status: 'ambiguous',
      explanation: `Multiple routes matched equally: ${bestMatches.map((entry) => entry.profile.name).join(', ')}.`,
      suggestedProfileSlug: null,
      suggestedProfileName: null,
      matchedProfileSlugs: bestMatches.map((entry) => entry.profile.slug)
    };
  });
}

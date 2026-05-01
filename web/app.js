const API_BASE_URL = "/api/sourcing";
const PAGE_IDS = new Set(["jobs", "review", "approved", "enrichment", "profiles"]);

const REASON_CONFIG = {
  singleton_review: {
    fields: ["Manual review"],
    detail: "Only one source record exists, so a human needs to approve whether this should survive as a real person profile.",
  },
  name_institution: {
    fields: ["Name", "Institution"],
    detail: "The candidate was linked because both the name and the institution matched.",
  },
  orcid_exact: {
    fields: ["ORCID"],
    detail: "Both source records expose the same ORCID.",
  },
  email_exact: {
    fields: ["Email"],
    detail: "Both source records expose the same email address.",
  },
  homepage_exact: {
    fields: ["Homepage"],
    detail: "Both source records expose the same homepage.",
  },
  github_exact: {
    fields: ["GitHub"],
    detail: "Both source records point to the same GitHub profile.",
  },
  source_native_id_exact: {
    fields: ["Source ID"],
    detail: "The upstream source-native identifier matches across records.",
  },
};

const FIELD_PRIORITY = ["email", "orcid", "github", "homepage", "source_native_id", "institution", "name"];
const FIELD_DEFINITIONS = [
  ["name", "Name"],
  ["email", "Email"],
  ["homepage", "Homepage"],
  ["institution", "Institution"],
  ["orcid", "ORCID"],
  ["github", "GitHub"],
  ["source_native_id", "Source ID"],
];

const REVIEW_STATUS_OPTIONS = [
  ["pending_review", "Pending"],
  ["", "All statuses"],
  ["approved_candidate", "Approved"],
  ["not_same_person", "Kept separate"],
  ["rejected_bad_record", "Bad record"],
  ["rejected_not_relevant", "Not relevant"],
  ["unsure", "Held"],
  ["suppressed", "Suppressed"],
];

const TRACK_VALUES = [
  "software_engineering",
  "ai_research",
  "data_science",
  "product_design",
  "product_management",
  "marketing_growth",
  "business_founder",
  "hardware_mechanical",
  "academic_research",
  "unknown_other",
];

const SPECIALIZATION_VALUES = [
  "frontend_engineering",
  "backend_engineering",
  "full_stack_engineering",
  "mobile_engineering",
  "machine_learning",
  "natural_language_processing",
  "computer_vision",
  "data_engineering",
  "data_analysis",
  "academic_publishing",
  "developer_experience",
  "product_strategy",
  "growth_marketing",
  "mechanical_design",
  "embedded_systems",
  "robotics",
  "ux_ui_design",
  "unknown_other",
];

const INDUSTRY_DOMAIN_VALUES = [
  "artificial_intelligence",
  "ai_infrastructure",
  "developer_tools",
  "healthcare_ai",
  "robotics",
  "education_technology",
  "climate_energy",
  "finance_fintech",
  "biotech_life_sciences",
  "enterprise_saas",
  "cybersecurity",
  "gaming_media",
  "accessibility_assistive_technology",
  "research_tools",
  "open_source",
  "unknown_other",
];

const CAREER_STAGE_VALUES = ["student", "early_career", "mid_career", "senior", "founder", "academic_researcher", "unknown"];
const CONTACTABILITY_VALUES = ["high", "medium", "low", "unknown"];

const state = {
  page: normalizePage(window.location.hash.replace(/^#/, "") || "review"),
  runs: [],
  candidates: [],
  approved: [],
  enrichmentItems: [],
  profiles: [],
  profileDetails: {},
  selectedJobRunId: "",
  reviewRunId: "",
  reviewStatusFilter: "pending_review",
  reviewSourceFilter: "",
  reviewSignalFilter: "",
  profileTrackFilter: "",
  profileDomainFilter: "",
  profileSourceFilter: "",
  profileContactabilityFilter: "",
  selectedCandidateId: "",
  selectedApprovedId: "",
  selectedEnrichmentId: "",
  selectedProfileId: "",
  reviewSearch: "",
  approvedSearch: "",
  profileSearch: "",
  reviewSubmitting: false,
  approvedSubmitting: false,
  enrichmentSubmitting: false,
  profileDetailsLoadingId: "",
  reviewMessage: "",
  reviewMessageStatus: "",
  approvedMessage: "",
  approvedMessageStatus: "",
  enrichmentMessage: "",
  enrichmentMessageStatus: "",
  profileMessage: "",
  profileMessageStatus: "",
  reviewSignalSelections: {},
};

const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  navJobs: document.querySelector("#navJobs"),
  navReview: document.querySelector("#navReview"),
  navApproved: document.querySelector("#navApproved"),
  navEnrichment: document.querySelector("#navEnrichment"),
  navProfiles: document.querySelector("#navProfiles"),
  navJobsCount: document.querySelector("#navJobsCount"),
  navReviewCount: document.querySelector("#navReviewCount"),
  navApprovedCount: document.querySelector("#navApprovedCount"),
  navEnrichmentCount: document.querySelector("#navEnrichmentCount"),
  navProfilesCount: document.querySelector("#navProfilesCount"),
  pageJobs: document.querySelector("#pageJobs"),
  pageReview: document.querySelector("#pageReview"),
  pageApproved: document.querySelector("#pageApproved"),
  pageEnrichment: document.querySelector("#pageEnrichment"),
  pageProfiles: document.querySelector("#pageProfiles"),
  jobsMeta: document.querySelector("#jobsMeta"),
  jobsTableBody: document.querySelector("#jobsTableBody"),
  jobsDetailTitle: document.querySelector("#jobsDetailTitle"),
  jobsDetailSubtitle: document.querySelector("#jobsDetailSubtitle"),
  jobsDetailBody: document.querySelector("#jobsDetailBody"),
  openRunReviewButton: document.querySelector("#openRunReviewButton"),
  reviewMeta: document.querySelector("#reviewMeta"),
  reviewRunFilter: document.querySelector("#reviewRunFilter"),
  reviewStatusFilter: document.querySelector("#reviewStatusFilter"),
  reviewSourceFilter: document.querySelector("#reviewSourceFilter"),
  reviewSignalFilter: document.querySelector("#reviewSignalFilter"),
  reviewSearchInput: document.querySelector("#reviewSearchInput"),
  reviewTableBody: document.querySelector("#reviewTableBody"),
  reviewDetailTitle: document.querySelector("#reviewDetailTitle"),
  reviewDetailSubtitle: document.querySelector("#reviewDetailSubtitle"),
  reviewDetailBody: document.querySelector("#reviewDetailBody"),
  reviewNote: document.querySelector("#reviewNote"),
  reviewApproveButton: document.querySelector("#reviewApproveButton"),
  reviewSeparateButton: document.querySelector("#reviewSeparateButton"),
  reviewRejectBadButton: document.querySelector("#reviewRejectBadButton"),
  reviewRejectNotRelevantButton: document.querySelector("#reviewRejectNotRelevantButton"),
  reviewHoldButton: document.querySelector("#reviewHoldButton"),
  reviewResult: document.querySelector("#reviewResult"),
  approvedMeta: document.querySelector("#approvedMeta"),
  approvedSearchInput: document.querySelector("#approvedSearchInput"),
  approvedTableBody: document.querySelector("#approvedTableBody"),
  approvedDetailTitle: document.querySelector("#approvedDetailTitle"),
  approvedDetailSubtitle: document.querySelector("#approvedDetailSubtitle"),
  approvedDetailBody: document.querySelector("#approvedDetailBody"),
  enrichmentMeta: document.querySelector("#enrichmentMeta"),
  enrichmentTableBody: document.querySelector("#enrichmentTableBody"),
  enrichmentDetailTitle: document.querySelector("#enrichmentDetailTitle"),
  enrichmentDetailSubtitle: document.querySelector("#enrichmentDetailSubtitle"),
  enrichmentDetailBody: document.querySelector("#enrichmentDetailBody"),
  enrichmentNote: document.querySelector("#enrichmentNote"),
  enrichmentApproveButton: document.querySelector("#enrichmentApproveButton"),
  enrichmentHoldButton: document.querySelector("#enrichmentHoldButton"),
  enrichmentRejectButton: document.querySelector("#enrichmentRejectButton"),
  enrichmentResult: document.querySelector("#enrichmentResult"),
  profilesMeta: document.querySelector("#profilesMeta"),
  profileTrackFilter: document.querySelector("#profileTrackFilter"),
  profileDomainFilter: document.querySelector("#profileDomainFilter"),
  profileSourceFilter: document.querySelector("#profileSourceFilter"),
  profileContactabilityFilter: document.querySelector("#profileContactabilityFilter"),
  profileSearchInput: document.querySelector("#profileSearchInput"),
  profilesTableBody: document.querySelector("#profilesTableBody"),
  profileDetailTitle: document.querySelector("#profileDetailTitle"),
  profileDetailSubtitle: document.querySelector("#profileDetailSubtitle"),
  profileDetailBody: document.querySelector("#profileDetailBody"),
};

function normalizePage(value) {
  return PAGE_IDS.has(value) ? value : "review";
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arrayValue(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function joinUrl(base, path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function normalizeListPayload(payload) {
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return payload ? [payload] : [];
}

function humanizeToken(value) {
  const token = stringValue(value);
  return token ? token.replace(/_/g, " ") : "";
}

function displayLabel(value) {
  const normalized = humanizeToken(value);
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

function formatDateTime(value) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function uniqueList(values) {
  return [...new Set(arrayValue(values).filter(Boolean))];
}

function flattenStrings(value) {
  if (typeof value === "string") {
    return stringValue(value) ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenStrings(entry));
  }
  return [];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const flattened = flattenStrings(value);
    if (flattened.length) {
      return flattened[0];
    }
  }
  return "";
}

function collectNonEmpty(...values) {
  return uniqueList(values.flatMap((value) => flattenStrings(value)));
}

function normalizeSignal(value) {
  const normalized = stringValue(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "");
  return /^[a-z][a-z0-9_:-]{1,79}$/.test(normalized) ? normalized : "";
}

function signalValues(...values) {
  return uniqueList(
    values
      .flatMap((value) => flattenStrings(value))
      .map((value) => normalizeSignal(value))
      .filter(Boolean),
  );
}

async function requestJson(path, options = {}) {
  const response = await fetch(joinUrl(API_BASE_URL, path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const errorText = payload?.error?.message || (typeof payload === "string" ? payload : JSON.stringify(payload));
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return payload;
}

function statusVariant(status) {
  if (status === "completed" || status === "approved" || status === "active" || status === "same_person" || status === "approved_candidate" || status === "enriched") {
    return "success";
  }
  if (status === "pending_review" || status === "medium" || status === "not_started" || status === "needs_enrichment" || status === "in_review" || status === "held") {
    return "warning";
  }
  if (status === "failed" || status === "archived" || status === "not_same_person" || status === "rejected_bad_record" || status === "rejected_not_relevant" || status === "rejected") {
    return "danger";
  }
  return "neutral";
}

function renderPill(text, variant = "neutral") {
  return `<span class="pill pill--${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
}

function setConnectionStatus(text, status) {
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.dataset.status = status;
}

function candidateObject(item) {
  return item?.candidate ?? item ?? null;
}

function pendingCandidatesAll() {
  return state.candidates.filter((item) => candidateObject(item)?.status === "pending_review");
}

function runIdForCandidate(item) {
  const candidate = candidateObject(item);
  const directRunId = stringValue(candidate?.createdFromSourceRunId) || stringValue(candidate?.sourceRunId);
  if (directRunId) {
    return directRunId;
  }

  const sourceRunId = arrayValue(item?.sourceRecords)
    .map((record) => stringValue(record?.sourceRunId) || stringValue(record?.runId))
    .find(Boolean);

  return sourceRunId || "";
}

function reviewStatsByRun() {
  const stats = new Map();

  for (const item of state.candidates) {
    const candidate = candidateObject(item);
    const runId = runIdForCandidate(item);
    if (!candidate || !runId) {
      continue;
    }

    const entry = stats.get(runId) || { total: 0, pending: 0, reviewed: 0 };
    entry.total += 1;

    if (candidate.status === "pending_review") {
      entry.pending += 1;
    } else {
      entry.reviewed += 1;
    }

    stats.set(runId, entry);
  }

  return stats;
}

function runReviewStats(runId) {
  return reviewStatsByRun().get(runId) || { total: 0, pending: 0, reviewed: 0 };
}

function sourceKeysForItem(item) {
  return uniqueList(
    arrayValue(item?.sourceRecords)
      .flatMap((record) => [record.source, record.sourceName])
      .map((source) => stringValue(source).toLowerCase())
      .filter(Boolean),
  );
}

function suggestedSignalsForItem(item) {
  return uniqueList(
    arrayValue(item?.sourceRecords).flatMap((record) =>
      signalValues(
        record?.rawSummary?.suggestedSignals,
        record?.raw?.suggestedSignals,
        record?.display?.suggestedSignals,
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function confirmedSignalsForApproved(entity) {
  if (Array.isArray(entity?.confirmedSignals)) {
    return signalValues(entity.confirmedSignals);
  }
  return signalValues(entity?.suggestedSignals);
}

function pendingEnrichmentItems() {
  return state.enrichmentItems.filter((item) => item?.status === "pending_review");
}

function activeProfiles() {
  return state.profiles.filter((profile) => (profile?.status || "active") === "active");
}

function filteredEnrichmentItems() {
  return state.enrichmentItems
    .slice()
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime());
}

function getSelectedEnrichmentItem() {
  return filteredEnrichmentItems().find((item) => item.id === state.selectedEnrichmentId) ?? null;
}

function getSelectedProfile() {
  return filteredProfiles().find((profile) => profile.id === state.selectedProfileId) ?? null;
}

function getSelectedProfileDetails() {
  return state.profileDetails[state.selectedProfileId] || null;
}

function commaList(value) {
  return uniqueList(
    stringValue(value)
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function selectedOptions(select) {
  return Array.from(select?.selectedOptions || []).map((option) => option.value).filter(Boolean);
}

function renderOptions(values, selected, labeler = displayLabel) {
  const selectedSet = new Set(arrayValue(selected));
  return values
    .map((value) => `<option value="${escapeHtml(value)}" ${selectedSet.has(value) ? "selected" : ""}>${escapeHtml(labeler(value))}</option>`)
    .join("");
}

function evidenceForField(item, field) {
  const draft = item?.draft || {};
  const fieldEvidence = draft.fieldEvidence || {};
  return arrayValue(fieldEvidence[field]).length ? arrayValue(fieldEvidence[field]) : arrayValue(item?.evidenceIds);
}

function existingByKey(items, key) {
  return new Map(arrayValue(items).map((item) => [item?.[key], item]));
}

function candidateSignalSelectionId(item) {
  return candidateObject(item)?.id || "";
}

function ensureSignalSelection(item) {
  const id = candidateSignalSelectionId(item);
  if (!id) {
    return [];
  }
  if (!state.reviewSignalSelections[id]) {
    state.reviewSignalSelections[id] = suggestedSignalsForItem(item);
  }
  return state.reviewSignalSelections[id];
}

function setSignalSelection(item, signals) {
  const id = candidateSignalSelectionId(item);
  if (!id) {
    return;
  }
  state.reviewSignalSelections[id] = uniqueList(signals.map((signal) => normalizeSignal(signal)).filter(Boolean))
    .sort((left, right) => left.localeCompare(right));
}

function selectedSignalsForItem(item) {
  return ensureSignalSelection(item).slice();
}

function isSingletonCandidate(candidate, item) {
  return arrayValue(candidate?.reasonCodes).includes("singleton_review") || arrayValue(item?.sourceRecords).length <= 1;
}

function sortRuns(runs) {
  const statusRank = {
    running: 0,
    in_progress: 0,
    queued: 1,
    pending: 1,
    completed: 2,
    failed: 3,
  };

  return runs
    .slice()
    .sort((left, right) => {
      const leftRank = statusRank[stringValue(left.status)] ?? 9;
      const rightRank = statusRank[stringValue(right.status)] ?? 9;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

function chooseDefaultRunId() {
  if (!state.runs.length) {
    return "";
  }

  const withPending = state.runs.find((run) => runReviewStats(run.id).pending > 0);
  return withPending?.id || state.runs[0].id;
}

function getSelectedJobRun() {
  return state.runs.find((run) => run.id === state.selectedJobRunId) ?? null;
}

function filteredReviewCandidates() {
  return state.candidates
    .filter((item) => {
      const candidate = candidateObject(item);
      if (!candidate) {
        return false;
      }
      if (state.reviewStatusFilter && candidate.status !== state.reviewStatusFilter) {
        return false;
      }
      if (state.reviewRunId && runIdForCandidate(item) !== state.reviewRunId) {
        return false;
      }
      if (state.reviewSourceFilter && !sourceKeysForItem(item).includes(state.reviewSourceFilter)) {
        return false;
      }
      if (state.reviewSignalFilter && !suggestedSignalsForItem(item).includes(state.reviewSignalFilter)) {
        return false;
      }
      if (!state.reviewSearch) {
        return true;
      }
      const haystack = [
        stringValue(candidate.displayName),
        ...matchedFieldsForCandidate(candidate),
        ...suggestedSignalsForItem(item),
        ...arrayValue(item.sourceRecords).flatMap((record) => {
          const recordInfo = recordData(record);
          return [
            recordInfo.name,
            recordInfo.institution,
            recordInfo.orcid,
            ...recordInfo.emails,
            ...recordInfo.homepages,
            ...recordInfo.githubs,
          ];
        }),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(state.reviewSearch);
    })
    .sort((left, right) => {
      const leftCandidate = candidateObject(left);
      const rightCandidate = candidateObject(right);
      const evidenceDelta = arrayValue(right.evidence).length - arrayValue(left.evidence).length;
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }
      return new Date(rightCandidate?.updatedAt || 0).getTime() - new Date(leftCandidate?.updatedAt || 0).getTime();
    });
}

function filteredApprovedEntities() {
  return state.approved.filter((entity) => {
    if (!state.approvedSearch) {
      return true;
    }
    const haystack = [
      stringValue(entity.displayName),
      ...arrayValue(entity.emails),
      ...arrayValue(entity.homepages),
      ...arrayValue(entity.institutions),
      ...arrayValue(entity.orcids),
      ...arrayValue(entity.githubUrls),
      ...confirmedSignalsForApproved(entity),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.approvedSearch);
  });
}

function filteredProfiles() {
  return activeProfiles()
    .filter((profile) => {
      if (state.profileTrackFilter && profile.primaryTrack !== state.profileTrackFilter) {
        return false;
      }
      if (
        state.profileDomainFilter &&
        !arrayValue(profile.industryDomainInterests).some((entry) => entry.domain === state.profileDomainFilter)
      ) {
        return false;
      }
      if (state.profileSourceFilter) {
        const sourceKeys = uniqueList([...arrayValue(profile.sourceNames), ...arrayValue(profile.sourceDomains)])
          .map((source) => stringValue(source).toLowerCase());
        if (!sourceKeys.includes(state.profileSourceFilter)) {
          return false;
        }
      }
      if (state.profileContactabilityFilter && profile.contactability?.value !== state.profileContactabilityFilter) {
        return false;
      }
      if (!state.profileSearch) {
        return true;
      }
      const haystack = [
        stringValue(profile.displayName),
        stringValue(profile.primaryTrack),
        stringValue(profile.careerStage?.value),
        stringValue(profile.contactability?.value),
        stringValue(profile.matchingSummary),
        ...arrayValue(profile.sourceNames),
        ...arrayValue(profile.sourceDomains),
        ...arrayValue(profile.specializations).map((entry) => entry.specialization),
        ...arrayValue(profile.skills).map((entry) => entry.skill),
        ...arrayValue(profile.industryDomainInterests).map((entry) => entry.domain),
        ...arrayValue(profile.proposedTags).map((entry) => entry.tag),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(state.profileSearch);
    })
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
}

function getSelectedCandidateItem() {
  return filteredReviewCandidates().find((item) => candidateObject(item)?.id === state.selectedCandidateId) ?? null;
}

function getSelectedApprovedEntity() {
  return filteredApprovedEntities().find((entity) => entity.id === state.selectedApprovedId) ?? null;
}

function ensureSelections() {
  const defaultRunId = chooseDefaultRunId();

  if (!state.runs.some((run) => run.id === state.selectedJobRunId)) {
    state.selectedJobRunId = defaultRunId;
  }

  if (state.reviewRunId && !state.runs.some((run) => run.id === state.reviewRunId)) {
    state.reviewRunId = "";
  }

  const currentReviewPending = state.reviewRunId ? runReviewStats(state.reviewRunId).pending : 0;
  const fallbackPending = defaultRunId ? runReviewStats(defaultRunId).pending : 0;

  if (
    (!state.reviewRunId ||
      (state.reviewStatusFilter === "pending_review" && currentReviewPending === 0 && fallbackPending > 0)) &&
    defaultRunId
  ) {
    state.reviewRunId = defaultRunId;
  }

  const reviewItems = filteredReviewCandidates();
  if (!reviewItems.some((item) => candidateObject(item)?.id === state.selectedCandidateId)) {
    state.selectedCandidateId = candidateObject(reviewItems[0])?.id || "";
  }

  const approvedItems = filteredApprovedEntities();
  if (!approvedItems.some((entity) => entity.id === state.selectedApprovedId)) {
    state.selectedApprovedId = approvedItems[0]?.id || "";
  }

  const enrichmentItems = filteredEnrichmentItems();
  if (!enrichmentItems.some((item) => item.id === state.selectedEnrichmentId)) {
    state.selectedEnrichmentId = enrichmentItems[0]?.id || "";
  }

  const profileItems = filteredProfiles();
  if (!profileItems.some((profile) => profile.id === state.selectedProfileId)) {
    state.selectedProfileId = profileItems[0]?.id || "";
  }
}

function matchedFieldsForCandidate(candidate) {
  const fields = [];
  for (const reason of arrayValue(candidate?.reasonCodes)) {
    const config = REASON_CONFIG[reason];
    if (config) {
      fields.push(...config.fields);
    } else {
      fields.push(displayLabel(reason));
    }
  }
  return uniqueList(fields);
}

function reasonDetailsForCandidate(candidate) {
  return arrayValue(candidate?.reasonCodes).map((reason) => REASON_CONFIG[reason]?.detail || `${displayLabel(reason)} triggered this review candidate.`);
}

function evidenceTypeLabel(type) {
  const labels = {
    name: "Name",
    email: "Email",
    homepage: "Homepage",
    github: "GitHub",
    institution: "Institution",
    orcid: "ORCID",
    source_native_id: "Source ID",
  };
  return labels[type] || displayLabel(type || "evidence");
}

function evidencePriority(entry) {
  const index = FIELD_PRIORITY.indexOf(entry?.evidenceType);
  return index === -1 ? FIELD_PRIORITY.length : index;
}

function evidenceQualityPriority(entry) {
  const quality = stringValue(entry?.quality);
  if (quality === "high") {
    return 0;
  }
  if (quality === "medium") {
    return 1;
  }
  return 2;
}

function bestEvidence(item) {
  return arrayValue(item?.evidence)
    .slice()
    .sort((left, right) => {
      const fieldDelta = evidencePriority(left) - evidencePriority(right);
      if (fieldDelta !== 0) {
        return fieldDelta;
      }
      return evidenceQualityPriority(left) - evidenceQualityPriority(right);
    })[0] ?? null;
}

function sharedValueSummary(item) {
  const candidate = candidateObject(item);
  if (arrayValue(candidate?.reasonCodes).includes("singleton_review")) {
    return "Single source record";
  }
  const evidence = bestEvidence(item);
  if (!evidence) {
    return "Review manually";
  }
  const value = stringValue(evidence.normalizedValue) || stringValue(evidence.rawValue);
  return value ? `${evidenceTypeLabel(evidence.evidenceType)}: ${value}` : evidenceTypeLabel(evidence.evidenceType);
}

function sourceSummary(item) {
  const sources = uniqueList(arrayValue(item?.sourceRecords).map((record) => displayLabel(record.source || "source")));
  if (!sources.length) {
    return "No source records";
  }
  if (sources.length === 1) {
    return `${sources[0]} · 1 record`;
  }
  return `${sources.join(" + ")} · ${arrayValue(item.sourceRecords).length} records`;
}

function tableSourceMeta(candidate) {
  if (candidate?.status && candidate.status !== "pending_review") {
    return displayLabel(candidate.status);
  }
  if (arrayValue(candidate?.reasonCodes).includes("singleton_review")) {
    return "Single-source review";
  }
  return `${displayLabel(candidate?.strength || "weak")} match`;
}

function recordData(record) {
  const raw = record?.raw || {};
  const rawSummary = record?.rawSummary || {};
  const display = record?.display || {};

  return {
    name: firstNonEmpty(display.name, record.displayName, raw.name),
    emails: collectNonEmpty(rawSummary.email, raw.email, raw.emails, raw.contactEmails, display.email),
    homepages: collectNonEmpty(display.homepage, rawSummary.homepage, raw.homepage, raw.homepages, raw.urls, raw.researcherUrls, raw.researcher_urls),
    institution: firstNonEmpty(display.institution, rawSummary.institution, record.institution, raw.institution),
    institutionCountry: firstNonEmpty(rawSummary.institutionCountry),
    orcid: firstNonEmpty(raw.orcid, rawSummary.orcid, display.orcid),
    githubs: collectNonEmpty(raw.github, raw.githubUrl, raw.github_url, raw.githubUrls, raw.github_urls, display.github, display.githubUrl, rawSummary.github),
    sourceId: firstNonEmpty(record.sourceNativeId, record.id),
    source: displayLabel(record.source || record.sourceName || "source"),
    runId: firstNonEmpty(record.sourceRunId, record.runId),
    domain: firstNonEmpty(record.domain, record.sourceDomain),
    storagePath: firstNonEmpty(record.rawStoragePath, record.storagePath),
    observedAt: firstNonEmpty(record.observedAt, record.updatedAt, record.createdAt),
    paperCount: firstNonEmpty(rawSummary.paperCountInBatch),
  };
}

function renderMaybeLinks(values) {
  const entries = arrayValue(values);
  if (!entries.length) {
    return "—";
  }
  return entries
    .map((value) => {
      const text = escapeHtml(value);
      if (/^https?:\/\//.test(value)) {
        return `<a class="inline-link" href="${text}" target="_blank" rel="noreferrer">${text}</a>`;
      }
      return text;
    })
    .join("<br />");
}

function compareFieldValue(recordInfo, field) {
  if (!recordInfo) {
    return [];
  }

  const fieldValues = {
    name: recordInfo.name ? [recordInfo.name] : [],
    email: recordInfo.emails,
    homepage: recordInfo.homepages,
    institution: recordInfo.institution ? [recordInfo.institution] : [],
    orcid: recordInfo.orcid ? [recordInfo.orcid] : [],
    github: recordInfo.githubs,
    source_native_id: recordInfo.sourceId ? [recordInfo.sourceId] : [],
  };

  return uniqueList(fieldValues[field] || []);
}

function comparisonRows(item) {
  const records = arrayValue(item?.sourceRecords);
  const left = recordData(records[0] || {});
  const right = recordData(records[1] || {});
  const matchedFields = new Set(arrayValue(item?.evidence).map((entry) => entry.evidenceType));
  const rows = FIELD_DEFINITIONS.map(([key, label]) => ({
    key,
    label,
    left: compareFieldValue(left, key),
    right: compareFieldValue(right, key),
    matched: matchedFields.has(key),
  }));

  const visibleRows = rows.filter((row) => row.matched || row.left.length || row.right.length);
  return visibleRows.length ? visibleRows : rows.filter((row) => row.key === "name" || row.key === "source_native_id");
}

function renderComparisonValue(values, isMeta = false) {
  if (!values.length) {
    return `<div class="compare-value"><span class="compare-value__main">—</span></div>`;
  }

  return `
    <div class="compare-value">
      <span class="compare-value__main ${isMeta ? "mono" : ""}">${escapeHtml(values[0])}</span>
      ${
        values.length > 1
          ? values
              .slice(1)
              .map((value) => `<span class="compare-value__sub ${isMeta ? "mono" : ""}">${escapeHtml(value)}</span>`)
              .join("")
          : ""
      }
    </div>
  `;
}

function renderComparisonTable(item) {
  const records = arrayValue(item?.sourceRecords);
  const left = recordData(records[0] || {});
  const right = recordData(records[1] || {});
  const rows = comparisonRows(item);
  const leftLabel = left.source || "Source A";
  const rightLabel = right.source || (records.length > 1 ? "Source B" : "No second source");

  return `
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">${escapeHtml(leftLabel)}</th>
            <th scope="col">${escapeHtml(rightLabel)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.label)}</td>
                  <td class="${row.matched ? "is-match" : ""}">${renderComparisonValue(row.left, row.key === "orcid" || row.key === "source_native_id")}</td>
                  <td class="${row.matched ? "is-match" : ""}">${renderComparisonValue(row.right, row.key === "orcid" || row.key === "source_native_id")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bestEvidenceByType(item) {
  const signalMap = new Map();
  const evidenceRows = arrayValue(item?.evidence)
    .slice()
    .sort((left, right) => {
      const fieldDelta = evidencePriority(left) - evidencePriority(right);
      if (fieldDelta !== 0) {
        return fieldDelta;
      }
      return evidenceQualityPriority(left) - evidenceQualityPriority(right);
    });

  for (const entry of evidenceRows) {
    if (!signalMap.has(entry.evidenceType)) {
      signalMap.set(entry.evidenceType, entry);
    }
  }

  return Array.from(signalMap.values());
}

function signalSummary(entry) {
  const type = stringValue(entry?.evidenceType);
  if (type === "email" || type === "homepage" || type === "github" || type === "orcid" || type === "source_native_id") {
    return "Exact match";
  }
  if (type === "institution") {
    return "Same institution";
  }
  if (type === "name") {
    return "Same name";
  }
  return displayLabel(entry?.quality || "Matched");
}

function renderSignalList(item, candidate) {
  const signals = bestEvidenceByType(item);
  if (!signals.length) {
    if (arrayValue(candidate?.reasonCodes).includes("singleton_review")) {
      return `<div class="subtle-callout">Only one source record exists. A reviewer needs to decide whether this profile should survive as a real person.</div>`;
    }
    return `<div class="subtle-callout">No extracted signal was attached to this candidate.</div>`;
  }

  return `
    <div class="signal-list">
      ${signals
        .map((entry) => {
          const valueLabel = stringValue(entry.normalizedValue) || stringValue(entry.rawValue) || "—";
          return `
            <div class="signal-row">
              <div class="signal-label">${escapeHtml(evidenceTypeLabel(entry.evidenceType))}</div>
              <div class="signal-value ${entry.evidenceType === "orcid" || entry.evidenceType === "source_native_id" ? "mono" : ""}">${escapeHtml(valueLabel)}</div>
              <div class="signal-note">${escapeHtml(signalSummary(entry))}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderReviewSignalControls(item) {
  const suggestedSignals = suggestedSignalsForItem(item);
  const selectedSignals = selectedSignalsForItem(item);
  const allSignals = uniqueList([...suggestedSignals, ...selectedSignals]).sort((left, right) => left.localeCompare(right));

  const signalControls = allSignals.length
    ? allSignals
        .map((signal) => {
          const checked = selectedSignals.includes(signal) ? "checked" : "";
          const origin = suggestedSignals.includes(signal) ? "Suggested" : "Reviewer added";
          return `
            <label class="signal-choice">
              <input type="checkbox" data-review-signal="${escapeHtml(signal)}" ${checked} />
              <span class="signal-choice__label">${escapeHtml(displayLabel(signal))}</span>
              <span class="signal-choice__meta">${escapeHtml(origin)}</span>
            </label>
          `;
        })
        .join("")
    : `<div class="subtle-callout">No relevance signals were suggested. Add one if the evidence supports it.</div>`;

  return `
    <div class="review-signals">
      <p class="helper-text">Confirm the signals that should be saved with this review decision.</p>
      <div class="signal-choice-grid">${signalControls}</div>
      <div class="signal-add-row">
        <input data-review-signal-input type="text" placeholder="Add signal, e.g. robotics_project" />
        <button type="button" class="button-muted" data-add-review-signal>Add signal</button>
      </div>
    </div>
  `;
}

function renderSourceFieldValues(values, isMeta = false) {
  if (!values.length) {
    return `<span class="source-field__value">—</span>`;
  }

  return values
    .map(
      (value, index) =>
        `<span class="source-field__value ${index > 0 ? "source-field__value--sub" : ""} ${isMeta ? "mono" : ""}">${escapeHtml(value)}</span>`,
    )
    .join("");
}

function renderSourceCard(title, recordInfo, rows, side) {
  if (!recordInfo) {
    return `
      <article class="source-card">
        <div class="source-card__head">
          <div class="source-card__title">${escapeHtml(title)}</div>
          <div class="source-card__meta">No source record available</div>
        </div>
      </article>
    `;
  }

  const metaParts = [recordInfo.runId, recordInfo.domain].filter(Boolean);
  return `
    <article class="source-card">
      <div class="source-card__head">
        <div class="source-card__title">${escapeHtml(title)}</div>
        <div class="source-card__meta">${escapeHtml(metaParts.join(" · ") || "Source record")}</div>
      </div>
      <div class="source-card__body">
        ${rows
          .map((row) => {
            const values = side === "left" ? row.left : row.right;
            const isMeta = row.key === "orcid" || row.key === "source_native_id";
            return `
              <div class="source-field">
                <div class="source-field__label">${escapeHtml(row.label)}</div>
                <div class="source-field__values">${renderSourceFieldValues(values, isMeta)}</div>
                ${row.matched ? `<span class="source-field__match">Match</span>` : `<span></span>`}
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function renderSourceCards(item) {
  const records = arrayValue(item?.sourceRecords);
  const left = records[0] ? recordData(records[0]) : null;
  const right = records[1] ? recordData(records[1]) : null;
  const rows = comparisonRows(item);
  const leftLabel = left?.source || "Source A";
  const rightLabel = right?.source || (records.length > 1 ? "Source B" : "No second source");

  return `
    <div class="source-grid">
      ${renderSourceCard(leftLabel, left, rows, "left")}
      ${renderSourceCard(rightLabel, right, rows, "right")}
    </div>
  `;
}

function renderEvidenceList(item) {
  const evidenceRows = arrayValue(item?.evidence)
    .slice()
    .sort((left, right) => {
      const fieldDelta = evidencePriority(left) - evidencePriority(right);
      if (fieldDelta !== 0) {
        return fieldDelta;
      }
      return evidenceQualityPriority(left) - evidenceQualityPriority(right);
    });

  if (!evidenceRows.length) {
    return `<p class="empty-detail">No extracted evidence was attached to this candidate.</p>`;
  }

  return `
    <div class="evidence-list">
      ${evidenceRows
        .map((entry) => {
          const record = arrayValue(item.sourceRecords).find((sourceRecord) => sourceRecord.id === entry.sourceRecordId || sourceRecord.sourceRecordId === entry.sourceRecordId);
          const normalized = stringValue(entry.normalizedValue);
          const raw = stringValue(entry.rawValue);
          const valueLabel = normalized || raw || "—";
          const sourceLabel = recordData(record || {}).source || displayLabel(entry.sourceName || "source");
          return `
            <div class="evidence-row">
              <div class="evidence-field">${escapeHtml(evidenceTypeLabel(entry.evidenceType))}</div>
              <div class="row-stack">
                <span class="row-primary">${escapeHtml(valueLabel)}</span>
                <span class="cell-subtle">${escapeHtml(sourceLabel)} · ${escapeHtml(entry.extractedFrom?.sourcePath || "—")}</span>
              </div>
              <div class="cell-subtle">${escapeHtml(displayLabel(entry.quality || "low"))}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderJobsTable() {
  const pendingCount = pendingCandidatesAll().length;
  elements.navJobsCount.textContent = String(state.runs.length);
  elements.jobsMeta.textContent = state.runs.length ? `${state.runs.length} runs loaded · ${pendingCount} pending review` : "No source runs found";

  if (!state.runs.length) {
    elements.jobsTableBody.innerHTML = `<tr><td colspan="7" class="empty-row">No source runs found.</td></tr>`;
    return;
  }

  elements.jobsTableBody.innerHTML = state.runs
    .map((run) => {
      const selectedClass = run.id === state.selectedJobRunId ? "is-selected" : "";
      const stats = runReviewStats(run.id);
      return `
        <tr class="${selectedClass}">
          <td>
            <button type="button" class="row-button" data-run-id="${escapeHtml(run.id)}">
              <span class="row-primary">${escapeHtml(run.id)}</span>
              <span class="row-secondary">${escapeHtml(run.pipelineName || "pipeline")}</span>
            </button>
          </td>
          <td>${escapeHtml(`${run.sourceName || "source"} · ${run.sourceDomain || "domain"}`)}</td>
          <td>${renderPill(displayLabel(run.status || "unknown"), statusVariant(run.status || "unknown"))}</td>
          <td>${escapeHtml(String(numberValue(run.sourceRecordCount)))}</td>
          <td>${escapeHtml(String(stats.pending))}</td>
          <td>${escapeHtml(String(numberValue(run.evidenceCount)))}</td>
          <td>${escapeHtml(formatDateTime(run.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderJobsDetail() {
  const run = getSelectedJobRun();
  elements.openRunReviewButton.disabled = !run;

  if (!run) {
    elements.jobsDetailTitle.textContent = "No run selected";
    elements.jobsDetailSubtitle.textContent = "Pick a run to inspect status and jump into review.";
    elements.jobsDetailBody.innerHTML = `<p class="empty-detail">Select a run from the jobs table.</p>`;
    return;
  }

  const stats = runReviewStats(run.id);
  elements.jobsDetailTitle.textContent = run.id;
  elements.jobsDetailSubtitle.textContent = `${numberValue(run.sourceRecordCount)} records · ${stats.pending} pending review`;
  elements.jobsDetailBody.innerHTML = `
    <div class="subtle-callout">
      ${renderPill(displayLabel(run.status || "unknown"), statusVariant(run.status || "unknown"))}
      <div class="row-stack" style="margin-top:0.55rem;">
        <span class="row-primary">${escapeHtml(`${run.sourceName || "source"} · ${run.sourceDomain || "domain"}`)}</span>
        <span class="row-secondary">${escapeHtml(run.pipelineName || "pipeline")}</span>
      </div>
    </div>

    <section class="detail-section">
      <h4>Run detail</h4>
      <div class="fact-grid">
        <div class="fact-row"><span class="fact-label">Trigger</span><div class="fact-value">${escapeHtml(run.trigger || "—")}</div></div>
        <div class="fact-row"><span class="fact-label">Records</span><div class="fact-value">${escapeHtml(String(numberValue(run.sourceRecordCount)))}</div></div>
        <div class="fact-row"><span class="fact-label">Pending review</span><div class="fact-value">${escapeHtml(String(stats.pending))}</div></div>
        <div class="fact-row"><span class="fact-label">Reviewed</span><div class="fact-value">${escapeHtml(String(stats.reviewed))}</div></div>
        <div class="fact-row"><span class="fact-label">Evidence</span><div class="fact-value">${escapeHtml(String(numberValue(run.evidenceCount)))}</div></div>
        <div class="fact-row"><span class="fact-label">Started</span><div class="fact-value">${escapeHtml(formatDateTime(run.startedAt))}</div></div>
        <div class="fact-row"><span class="fact-label">Completed</span><div class="fact-value">${escapeHtml(formatDateTime(run.completedAt))}</div></div>
      </div>
    </section>

    ${
      run.metadata
        ? `
          <details class="payload">
            <summary>Run metadata</summary>
            <pre>${escapeHtml(JSON.stringify(run.metadata, null, 2))}</pre>
          </details>
        `
        : ""
    }
  `;
}

function renderReviewRunFilter() {
  const options = [
    `<option value="">All runs</option>`,
    ...state.runs.map((run) => {
      const stats = runReviewStats(run.id);
      const suffix = stats.pending ? ` · ${stats.pending} pending` : stats.reviewed ? ` · ${stats.reviewed} reviewed` : "";
      return `<option value="${escapeHtml(run.id)}">${escapeHtml(`${run.id}${suffix}`)}</option>`;
    }),
  ];
  elements.reviewRunFilter.innerHTML = options.join("");
  elements.reviewRunFilter.value = state.reviewRunId;

  elements.reviewStatusFilter.innerHTML = REVIEW_STATUS_OPTIONS
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  elements.reviewStatusFilter.value = state.reviewStatusFilter;

  const sourceOptions = uniqueList(
    state.candidates.flatMap((item) =>
      arrayValue(item?.sourceRecords).map((record) => stringValue(record.source || record.sourceName).toLowerCase()).filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  if (state.reviewSourceFilter && !sourceOptions.includes(state.reviewSourceFilter)) {
    state.reviewSourceFilter = "";
  }
  elements.reviewSourceFilter.innerHTML = [
    `<option value="">All sources</option>`,
    ...sourceOptions.map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(displayLabel(source))}</option>`),
  ].join("");
  elements.reviewSourceFilter.value = state.reviewSourceFilter;

  const signalOptions = uniqueList(state.candidates.flatMap((item) => suggestedSignalsForItem(item)))
    .sort((left, right) => left.localeCompare(right));
  if (state.reviewSignalFilter && !signalOptions.includes(state.reviewSignalFilter)) {
    state.reviewSignalFilter = "";
  }
  elements.reviewSignalFilter.innerHTML = [
    `<option value="">All signals</option>`,
    ...signalOptions.map((signal) => `<option value="${escapeHtml(signal)}">${escapeHtml(displayLabel(signal))}</option>`),
  ].join("");
  elements.reviewSignalFilter.value = state.reviewSignalFilter;
}

function renderReviewTable() {
  const items = filteredReviewCandidates();
  elements.navReviewCount.textContent = String(pendingCandidatesAll().length);
  elements.reviewMeta.textContent = state.reviewRunId
    ? `${items.length} candidates in ${state.reviewRunId}`
    : `${items.length} candidates across all runs`;

  if (!items.length) {
    elements.reviewTableBody.innerHTML = `<tr><td colspan="4" class="empty-row">No review candidates for the current filter.</td></tr>`;
    return;
  }

  elements.reviewTableBody.innerHTML = items
    .map((item) => {
      const candidate = candidateObject(item);
      const selectedClass = candidate.id === state.selectedCandidateId ? "is-selected" : "";
      const matchedFields = matchedFieldsForCandidate(candidate).join(", ") || "Manual review";
      const proof = sharedValueSummary(item);

      return `
        <tr class="${selectedClass}" data-candidate-id="${escapeHtml(candidate.id)}">
          <td>
            <button type="button" class="row-button" data-candidate-id="${escapeHtml(candidate.id)}">
              <span class="row-primary">${escapeHtml(candidate.displayName || "Unnamed candidate")}</span>
              <span class="row-secondary">${escapeHtml(candidate.entityType || "person profile")}</span>
            </button>
          </td>
          <td>
            <div class="row-stack">
              <span class="row-primary">${escapeHtml(proof)}</span>
              <span class="cell-subtle">${escapeHtml(matchedFields)}</span>
            </div>
          </td>
          <td>
            <div class="row-stack">
              <span class="row-primary">${escapeHtml(sourceSummary(item))}</span>
              <span class="cell-subtle">${escapeHtml(tableSourceMeta(candidate))}</span>
            </div>
          </td>
          <td>${escapeHtml(formatDateTime(candidate.updatedAt || candidate.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderReviewDetail() {
  const item = getSelectedCandidateItem();
  const candidate = candidateObject(item);
  const disableActions = !item || candidate?.status !== "pending_review" || state.reviewSubmitting;
  const singleton = isSingletonCandidate(candidate, item);

  elements.reviewApproveButton.disabled = disableActions;
  elements.reviewSeparateButton.disabled = disableActions;
  elements.reviewRejectBadButton.disabled = disableActions;
  elements.reviewRejectNotRelevantButton.disabled = disableActions;
  elements.reviewHoldButton.disabled = disableActions;
  elements.reviewApproveButton.textContent = singleton ? "Approve candidate" : "Approve merge";
  elements.reviewSeparateButton.hidden = singleton;
  elements.reviewRejectBadButton.hidden = false;
  elements.reviewRejectNotRelevantButton.hidden = false;
  elements.reviewResult.textContent = state.reviewMessage;
  elements.reviewResult.dataset.status = state.reviewMessageStatus;

  if (!item) {
    elements.reviewDetailTitle.textContent = "Nothing selected";
    elements.reviewDetailSubtitle.textContent = "Select a queue row to compare the raw source values.";
    elements.reviewDetailBody.innerHTML = `<p class="empty-detail">Select a queue row to see why it was flagged, which fields matched, and the source A / source B values.</p>`;
    return;
  }

  const sourceRecords = arrayValue(item.sourceRecords);
  const primaryEvidence = bestEvidence(item);
  const leftRecord = recordData(sourceRecords[0] || {});
  const rightRecord = recordData(sourceRecords[1] || {});
  const matchedFieldsText = matchedFieldsForCandidate(candidate).join(", ") || "Manual review";
  const systemFlags = arrayValue(candidate.reasonCodes).join(" · ");
  const sharedValue = stringValue(primaryEvidence?.normalizedValue) || stringValue(primaryEvidence?.rawValue) || "Manual review";
  const sourcePairText = `${leftRecord.source || "Source A"} / ${rightRecord.source || (sourceRecords.length > 1 ? "Source B" : "No second source")}`;
  const explanation = arrayValue(candidate.reasonCodes).includes("singleton_review")
    ? "Only one source record exists, so a reviewer needs to decide whether this profile should be approved."
    : `These records were grouped because they match on ${matchedFieldsText}. The strongest signal is ${evidenceTypeLabel(primaryEvidence?.evidenceType || "manual review").toLowerCase()} ${sharedValue}.`;

  elements.reviewDetailTitle.textContent = candidate.displayName || "Unnamed candidate";
  elements.reviewDetailSubtitle.textContent = `${sourceRecords.length} source records · ${displayLabel(candidate.status || "pending_review")}`;
  elements.reviewDetailBody.innerHTML = `
    <section class="detail-section">
      <p class="detail-kicker">Why this is in review</p>
      <p class="detail-lead">${escapeHtml(explanation)}</p>
      <div class="pill-row">
        ${renderPill(displayLabel(candidate.status || "pending_review"), statusVariant(candidate.status || "pending_review"))}
        ${renderPill(displayLabel(candidate.strength || "weak"), statusVariant(candidate.strength || "weak"))}
      </div>
      <div class="meta-strip">
        <span><strong>Matched on</strong> ${escapeHtml(matchedFieldsText)}</span>
        <span><strong>Sources</strong> ${escapeHtml(sourcePairText)}</span>
        <span><strong>Shared value</strong> ${escapeHtml(sharedValue)}</span>
      </div>
    </section>

    <section class="detail-section">
      <h4>Matched signals</h4>
      ${renderSignalList(item, candidate)}
    </section>

    <section class="detail-section">
      <h4>Candidate relevance signals</h4>
      ${renderReviewSignalControls(item)}
    </section>

    <section class="detail-section">
      <h4>Source records</h4>
      ${renderSourceCards(item)}
    </section>

    <section class="detail-section">
      <details class="payload">
        <summary>Raw evidence and system flags</summary>
        <div style="padding:0 0.8rem 0.8rem; display:grid; gap:0.8rem;">
          <div class="row-stack">
            <span class="row-primary">System flags</span>
            <span class="mono cell-subtle">${escapeHtml(systemFlags || "manual review")}</span>
          </div>
          <div class="row-stack">
            <span class="row-primary">Evidence ledger</span>
            ${renderEvidenceList(item)}
          </div>
        </div>
      </details>
    </section>
  `;
}

function renderApprovedTable() {
  const entities = filteredApprovedEntities();
  elements.navApprovedCount.textContent = String(state.approved.length);
  elements.approvedMeta.textContent = entities.length ? `${entities.length} global candidates` : "No approved entities found";

  if (!entities.length) {
    elements.approvedTableBody.innerHTML = `<tr><td colspan="6" class="empty-row">No approved entities found.</td></tr>`;
    return;
  }

  elements.approvedTableBody.innerHTML = entities
    .map((entity) => {
      const selectedClass = entity.id === state.selectedApprovedId ? "is-selected" : "";
      return `
        <tr class="${selectedClass}" data-approved-id="${escapeHtml(entity.id)}">
          <td>
            <button type="button" class="row-button" data-approved-id="${escapeHtml(entity.id)}">
              <span class="row-primary">${escapeHtml(entity.displayName || entity.id)}</span>
              <span class="row-secondary mono">${escapeHtml(entity.id)}</span>
            </button>
          </td>
          <td>${renderPill(displayLabel(entity.status || "active"), statusVariant(entity.status || "active"))}</td>
          <td>${escapeHtml(arrayValue(entity.sourceNames).join(" + ") || String(arrayValue(entity.sourceRecordIds).length))}</td>
          <td>${escapeHtml(String(arrayValue(entity.reviewLabelIds).length || (entity.approvedByReviewLabelId ? 1 : 0)))}</td>
          <td>${escapeHtml(confirmedSignalsForApproved(entity).slice(0, 3).map(displayLabel).join(", ") || "—")}</td>
          <td>${escapeHtml(formatDateTime(entity.updatedAt || entity.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderApprovedDetail() {
  const entity = getSelectedApprovedEntity();

  if (!entity) {
    elements.approvedDetailTitle.textContent = "Nothing selected";
    elements.approvedDetailSubtitle.textContent = "Select an approved entity to inspect the surviving fields.";
    elements.approvedDetailBody.innerHTML = `<p class="empty-detail">Select an approved row to inspect the final person profile.</p>`;
    return;
  }

  const pendingMergeCount = Number(entity.pendingMergeReviewCount || 0);
  const pendingMergeBlockers = arrayValue(entity.pendingMergeReviewBlockers);
  const hasPendingMergeBlockers = pendingMergeCount > 0;
  const canGenerate = entity.status === "active" &&
    !state.approvedSubmitting &&
    entity.enrichmentStatus !== "in_review" &&
    !hasPendingMergeBlockers;
  const generateLabel = entity.enrichmentStatus === "enriched" && entity.needsEnrichment === false ? "Regenerate enrichment" : "Generate enrichment";
  const pendingMergeMessage = hasPendingMergeBlockers
    ? `Resolve ${pendingMergeCount} pending merge ${pendingMergeCount === 1 ? "review" : "reviews"} before enrichment.`
    : "";

  elements.approvedDetailTitle.textContent = entity.displayName || entity.id;
  elements.approvedDetailSubtitle.textContent = `${arrayValue(entity.sourceRecordIds).length} source records · ${arrayValue(entity.reviewLabelIds).length || 1} review decisions`;
  elements.approvedDetailBody.innerHTML = `
    <section class="detail-section">
      <h4>Global candidate</h4>
      <div class="pill-row">
        ${renderPill(displayLabel(entity.status || "active"), statusVariant(entity.status || "active"))}
        ${renderPill(displayLabel(entity.enrichmentStatus || "not_started"), statusVariant(entity.enrichmentStatus || "not_started"))}
        ${hasPendingMergeBlockers ? renderPill(`${pendingMergeCount} pending merge`, "warning") : ""}
        ${renderPill(displayLabel(entity.entityType || "entity"), "neutral")}
      </div>
      <div class="fact-grid">
        <div class="fact-row"><span class="fact-label">Sources</span><div class="fact-value">${escapeHtml(arrayValue(entity.sourceNames).join(", ") || "—")}</div></div>
        <div class="fact-row"><span class="fact-label">Domains</span><div class="fact-value">${escapeHtml(arrayValue(entity.sourceDomains).join(", ") || "—")}</div></div>
        <div class="fact-row"><span class="fact-label">Emails</span><div class="fact-value">${renderMaybeLinks(arrayValue(entity.emails))}</div></div>
        <div class="fact-row"><span class="fact-label">Homepages</span><div class="fact-value">${renderMaybeLinks(arrayValue(entity.homepages))}</div></div>
        <div class="fact-row"><span class="fact-label">GitHub</span><div class="fact-value">${renderMaybeLinks(arrayValue(entity.githubUrls))}</div></div>
        <div class="fact-row"><span class="fact-label">ORCID</span><div class="fact-value mono">${escapeHtml(arrayValue(entity.orcids).join(", ") || "—")}</div></div>
        <div class="fact-row"><span class="fact-label">Institutions</span><div class="fact-value">${escapeHtml(arrayValue(entity.institutions).join(", ") || "—")}</div></div>
        <div class="fact-row"><span class="fact-label">Signals</span><div class="fact-value">${confirmedSignalsForApproved(entity).map((signal) => renderPill(displayLabel(signal), "accent")).join(" ") || "—"}</div></div>
        <div class="fact-row"><span class="fact-label">Needs enrichment</span><div class="fact-value">${escapeHtml(entity.needsEnrichment === false ? "No" : "Yes")}</div></div>
        <div class="fact-row"><span class="fact-label">Created</span><div class="fact-value">${escapeHtml(formatDateTime(entity.createdAt))}</div></div>
        <div class="fact-row"><span class="fact-label">Updated</span><div class="fact-value">${escapeHtml(formatDateTime(entity.updatedAt || entity.createdAt))}</div></div>
      </div>
    </section>

    <section class="detail-section">
      <h4>Enrichment</h4>
      ${hasPendingMergeBlockers ? `
        <div class="subtle-callout">
          <strong>${escapeHtml(pendingMergeMessage)}</strong>
          <div class="inline-list">
            ${pendingMergeBlockers.map((blocker) => renderPill(blocker.displayName || blocker.id, "warning")).join("")}
          </div>
        </div>
      ` : ""}
      <div class="action-row">
        <button
          type="button"
          class="${canGenerate ? "" : "button-muted"}"
          data-generate-enrichment="${escapeHtml(entity.id)}"
          aria-disabled="${canGenerate ? "false" : "true"}"
          ${canGenerate ? "" : "disabled"}
        >${escapeHtml(generateLabel)}</button>
      </div>
      <p class="detail-result" data-status="${escapeHtml(state.approvedMessageStatus)}">${escapeHtml(state.approvedMessage)}</p>
    </section>

    <section class="detail-section">
      <h4>Review lineage</h4>
      <div class="inline-list">
        ${arrayValue(entity.reviewLabelIds).map((id) => renderPill(id, "neutral")).join("") || renderPill(entity.approvedByReviewLabelId || "No review labels", "warning")}
      </div>
    </section>

    <section class="detail-section">
      <h4>Source records</h4>
      <div class="inline-list">
        ${arrayValue(entity.sourceRecordIds).map((id) => renderPill(id, "neutral")).join("") || renderPill("No source record IDs", "warning")}
      </div>
    </section>

    <section class="detail-section">
      <h4>Identity evidence</h4>
      <div class="inline-list">
        ${arrayValue(entity.identityEvidenceHashes).map((id) => renderPill(id, "neutral")).join("") || renderPill("No strong identity hashes", "warning")}
      </div>
    </section>

    <details class="payload">
      <summary>Approved payload</summary>
      <pre>${escapeHtml(JSON.stringify(entity, null, 2))}</pre>
    </details>
  `;
}

function renderEnrichmentTable() {
  const items = filteredEnrichmentItems();
  elements.navEnrichmentCount.textContent = String(state.enrichmentItems.length);
  elements.enrichmentMeta.textContent = items.length
    ? `${items.length} enrichment items · ${pendingEnrichmentItems().length} pending`
    : "No enrichment items found";

  if (!items.length) {
    elements.enrichmentTableBody.innerHTML = `<tr><td colspan="4" class="empty-row">No enrichment items found.</td></tr>`;
    return;
  }

  elements.enrichmentTableBody.innerHTML = items
    .map((item) => {
      const selectedClass = item.id === state.selectedEnrichmentId ? "is-selected" : "";
      return `
        <tr class="${selectedClass}" data-enrichment-id="${escapeHtml(item.id)}">
          <td>
            <button type="button" class="row-button" data-enrichment-id="${escapeHtml(item.id)}">
              <span class="row-primary">${escapeHtml(item.displayName || item.approvedEntityId)}</span>
              <span class="row-secondary mono">${escapeHtml(item.approvedEntityId)}</span>
            </button>
          </td>
          <td>${escapeHtml(displayLabel(item.draft?.primaryTrack || "unknown_other"))}</td>
          <td>${renderPill(displayLabel(item.status || "pending_review"), statusVariant(item.status || "pending_review"))}</td>
          <td>${escapeHtml(formatDateTime(item.updatedAt || item.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function labelList(items, key, fallback = "—") {
  const labels = arrayValue(items).map((item) => displayLabel(item?.[key])).filter(Boolean);
  return labels.length ? labels.join(", ") : fallback;
}

function renderMultiSelect(id, values, selected) {
  return `<select id="${escapeHtml(id)}" data-enrichment-field="${escapeHtml(id)}" multiple size="6">${renderOptions(values, selected)}</select>`;
}

function renderProposedTagControls(item) {
  const tags = arrayValue(item?.draft?.proposedTags);
  if (!tags.length) {
    return `<p class="empty-detail">No open-ended tags were proposed.</p>`;
  }
  return `
    <div class="signal-choice-grid">
      ${tags
        .map((tag) => `
          <label class="signal-choice">
            <input type="checkbox" data-proposed-tag="${escapeHtml(tag.tag)}" checked />
            <span class="signal-choice__label">${escapeHtml(displayLabel(tag.tag))}</span>
            <span class="signal-choice__meta">${escapeHtml(tag.reason || "Proposed")}</span>
          </label>
        `)
        .join("")}
    </div>
  `;
}

function renderEnrichmentDetail() {
  const item = getSelectedEnrichmentItem();
  const disableActions = !item || item.status !== "pending_review" || state.enrichmentSubmitting;

  elements.enrichmentApproveButton.disabled = disableActions;
  elements.enrichmentHoldButton.disabled = disableActions;
  elements.enrichmentRejectButton.disabled = disableActions;
  elements.enrichmentResult.textContent = state.enrichmentMessage;
  elements.enrichmentResult.dataset.status = state.enrichmentMessageStatus;

  if (!item) {
    elements.enrichmentDetailTitle.textContent = "Nothing selected";
    elements.enrichmentDetailSubtitle.textContent = "Select an enrichment item to review suggested labels.";
    elements.enrichmentDetailBody.innerHTML = `<p class="empty-detail">Select an enrichment row to inspect labels and supporting evidence.</p>`;
    return;
  }

  const draft = item.draft || {};
  const selectedTracks = uniqueList(arrayValue(draft.scoredTracks).map((track) => track.track));
  const selectedSpecializations = uniqueList(arrayValue(draft.specializations).map((entry) => entry.specialization));
  const selectedDomains = uniqueList(arrayValue(draft.industryDomainInterests).map((entry) => entry.domain));
  const selectedSkills = arrayValue(draft.skills).map((entry) => entry.skill).join(", ");

  elements.enrichmentDetailTitle.textContent = item.displayName || item.approvedEntityId;
  elements.enrichmentDetailSubtitle.textContent = `${arrayValue(item.evidenceIds).length} evidence records · ${displayLabel(item.status || "pending_review")}`;
  elements.enrichmentDetailBody.innerHTML = `
    <section class="detail-section">
      <h4>Suggested summary</h4>
      <p class="detail-lead">${escapeHtml(draft.matchingSummary || "No summary generated.")}</p>
      <div class="pill-row">
        ${renderPill(displayLabel(draft.primaryTrack || "unknown_other"), "accent")}
        ${renderPill(displayLabel(draft.contactability?.value || "unknown"), statusVariant(draft.contactability?.value || "unknown"))}
        ${renderPill(displayLabel(draft.careerStage?.value || "unknown"), "neutral")}
      </div>
      ${
        arrayValue(item.validationWarnings).length
          ? `<div class="subtle-callout">${escapeHtml(item.validationWarnings.join(" "))}</div>`
          : ""
      }
    </section>

    <section class="detail-section">
      <h4>Editable labels</h4>
      <div class="edit-grid">
        <label class="field" for="enrichmentPrimaryTrack">
          <span>Primary track</span>
          <select id="enrichmentPrimaryTrack" data-enrichment-primary-track>${renderOptions(TRACK_VALUES, [draft.primaryTrack || "unknown_other"])}</select>
        </label>
        <label class="field" for="enrichmentCareerStage">
          <span>Career stage</span>
          <select id="enrichmentCareerStage" data-enrichment-career-stage>${renderOptions(CAREER_STAGE_VALUES, [draft.careerStage?.value || "unknown"])}</select>
        </label>
        <label class="field" for="enrichmentContactability">
          <span>Contactability</span>
          <select id="enrichmentContactability" data-enrichment-contactability>${renderOptions(CONTACTABILITY_VALUES, [draft.contactability?.value || "unknown"])}</select>
        </label>
      </div>

      <div class="edit-grid edit-grid--stacked">
        <label class="field" for="enrichmentTracks">
          <span>Tracks</span>
          ${renderMultiSelect("enrichmentTracks", TRACK_VALUES, selectedTracks)}
        </label>
        <label class="field" for="enrichmentSpecializations">
          <span>Specializations</span>
          ${renderMultiSelect("enrichmentSpecializations", SPECIALIZATION_VALUES, selectedSpecializations)}
        </label>
        <label class="field" for="enrichmentDomains">
          <span>Industry/domain interests</span>
          ${renderMultiSelect("enrichmentDomains", INDUSTRY_DOMAIN_VALUES, selectedDomains)}
        </label>
        <label class="field" for="enrichmentSkills">
          <span>Skills</span>
          <textarea id="enrichmentSkills" data-enrichment-skills rows="3">${escapeHtml(selectedSkills)}</textarea>
        </label>
      </div>
    </section>

    <section class="detail-section">
      <h4>Suggested fields</h4>
      <div class="fact-grid">
        <div class="fact-row"><span class="fact-label">Tracks</span><div class="fact-value">${escapeHtml(labelList(draft.scoredTracks, "track"))}</div></div>
        <div class="fact-row"><span class="fact-label">Specializations</span><div class="fact-value">${escapeHtml(labelList(draft.specializations, "specialization"))}</div></div>
        <div class="fact-row"><span class="fact-label">Domains</span><div class="fact-value">${escapeHtml(labelList(draft.industryDomainInterests, "domain"))}</div></div>
        <div class="fact-row"><span class="fact-label">Skills</span><div class="fact-value">${escapeHtml(arrayValue(draft.skills).map((skill) => skill.skill).join(", ") || "—")}</div></div>
      </div>
    </section>

    <section class="detail-section">
      <h4>Proposed tags</h4>
      ${renderProposedTagControls(item)}
    </section>

    <section class="detail-section">
      <h4>Evidence IDs</h4>
      <div class="inline-list">
        ${arrayValue(item.evidenceIds).map((id) => renderPill(id, "neutral")).join("") || renderPill("No evidence IDs", "warning")}
      </div>
    </section>

    <details class="payload">
      <summary>Enrichment payload</summary>
      <pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>
    </details>
  `;
}

function confidencePercent(value) {
  const number = numberValue(value);
  if (!number) {
    return "";
  }
  return `${Math.round(number * 100)}%`;
}

function renderProfileFilters() {
  const sourceOptions = uniqueList(
    state.profiles.flatMap((profile) => [...arrayValue(profile.sourceNames), ...arrayValue(profile.sourceDomains)])
      .map((source) => stringValue(source).toLowerCase())
      .filter(Boolean),
  ).sort((left, right) => left.localeCompare(right));

  if (state.profileSourceFilter && !sourceOptions.includes(state.profileSourceFilter)) {
    state.profileSourceFilter = "";
  }

  elements.profileTrackFilter.innerHTML = [
    `<option value="">All tracks</option>`,
    ...TRACK_VALUES.map((track) => `<option value="${escapeHtml(track)}">${escapeHtml(displayLabel(track))}</option>`),
  ].join("");
  elements.profileTrackFilter.value = state.profileTrackFilter;

  elements.profileDomainFilter.innerHTML = [
    `<option value="">All domains</option>`,
    ...INDUSTRY_DOMAIN_VALUES.map((domain) => `<option value="${escapeHtml(domain)}">${escapeHtml(displayLabel(domain))}</option>`),
  ].join("");
  elements.profileDomainFilter.value = state.profileDomainFilter;

  elements.profileSourceFilter.innerHTML = [
    `<option value="">All sources</option>`,
    ...sourceOptions.map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(displayLabel(source))}</option>`),
  ].join("");
  elements.profileSourceFilter.value = state.profileSourceFilter;

  elements.profileContactabilityFilter.innerHTML = [
    `<option value="">Any contactability</option>`,
    ...CONTACTABILITY_VALUES.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(displayLabel(value))}</option>`),
  ].join("");
  elements.profileContactabilityFilter.value = state.profileContactabilityFilter;
}

function renderProfileTable() {
  const profiles = filteredProfiles();
  elements.navProfilesCount.textContent = String(activeProfiles().length);
  elements.profilesMeta.textContent = profiles.length
    ? `${profiles.length} matching-ready profiles`
    : "No final candidate profiles found";

  if (!profiles.length) {
    elements.profilesTableBody.innerHTML = `<tr><td colspan="6" class="empty-row">No profiles for the current filter.</td></tr>`;
    return;
  }

  elements.profilesTableBody.innerHTML = profiles
    .map((profile) => {
      const selectedClass = profile.id === state.selectedProfileId ? "is-selected" : "";
      const domains = arrayValue(profile.industryDomainInterests).map((entry) => displayLabel(entry.domain)).slice(0, 3);
      const skills = arrayValue(profile.skills).map((entry) => entry.skill).slice(0, 3);
      return `
        <tr class="${selectedClass}" data-profile-id="${escapeHtml(profile.id)}">
          <td>
            <button type="button" class="row-button" data-profile-id="${escapeHtml(profile.id)}">
              <span class="row-primary">${escapeHtml(profile.displayName || profile.id)}</span>
              <span class="row-secondary mono">${escapeHtml(profile.id)}</span>
            </button>
          </td>
          <td>${renderPill(displayLabel(profile.primaryTrack || "unknown_other"), "accent")}</td>
          <td>
            <div class="row-stack">
              <span class="row-primary">${escapeHtml(domains.join(", ") || "—")}</span>
              <span class="cell-subtle">${escapeHtml(skills.join(", ") || "No skills")}</span>
            </div>
          </td>
          <td>${renderPill(displayLabel(profile.contactability?.value || "unknown"), statusVariant(profile.contactability?.value || "unknown"))}</td>
          <td>${escapeHtml(arrayValue(profile.sourceNames).join(" + ") || "—")}</td>
          <td>${escapeHtml(formatDateTime(profile.updatedAt || profile.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderProfileScoredItems(items, key, scoreKey = "confidence") {
  const rows = arrayValue(items);
  if (!rows.length) {
    return "—";
  }
  return rows
    .map((entry) => {
      const confidence = confidencePercent(entry.score ?? entry[scoreKey]);
      return `${escapeHtml(displayLabel(entry[key]))}${confidence ? ` <span class="cell-subtle">${escapeHtml(confidence)}</span>` : ""}`;
    })
    .join("<br />");
}

function renderProfileSkillItems(items) {
  const rows = arrayValue(items);
  if (!rows.length) {
    return "—";
  }
  return rows
    .map((entry) => {
      const confidence = confidencePercent(entry.confidence);
      return `${escapeHtml(entry.skill)}${confidence ? ` <span class="cell-subtle">${escapeHtml(confidence)}</span>` : ""}`;
    })
    .join("<br />");
}

function renderProfileEvidenceValue(entry) {
  const value = stringValue(entry.normalizedValue) || stringValue(entry.rawValue) || "—";
  const text = escapeHtml(value);
  if (/^https?:\/\//.test(value)) {
    return `<a class="inline-link" href="${text}" target="_blank" rel="noreferrer">${text}</a>`;
  }
  const sourceUrl = stringValue(entry.extractedFrom?.sourceUrl);
  if (sourceUrl) {
    return `<a class="inline-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${text}</a>`;
  }
  return text;
}

function sourceLabelForEvidence(details, entry) {
  const sourceRecord = arrayValue(details.sourceRecords).find((record) => record.id === entry.sourceRecordId);
  return displayLabel(sourceRecord?.sourceName || entry.sourceName || "source");
}

function renderProfileFieldEvidence(details) {
  const rows = arrayValue(details.fieldEvidence).filter((row) => arrayValue(row.evidence).length);
  if (!rows.length) {
    return `<p class="empty-detail">No field evidence was attached to this profile.</p>`;
  }
  return `
    <div class="evidence-list">
      ${rows
        .map((row) => `
          <div class="profile-evidence-group">
            <div class="profile-evidence-group__field">${escapeHtml(displayLabel(row.field))}</div>
            <div class="profile-evidence-group__items">
              ${arrayValue(row.evidence)
                .map((entry) => `
                  <div class="evidence-row evidence-row--profile">
                    <div class="evidence-field">${escapeHtml(evidenceTypeLabel(entry.evidenceType))}</div>
                    <div class="row-stack">
                      <span class="row-primary">${renderProfileEvidenceValue(entry)}</span>
                      <span class="cell-subtle">${escapeHtml(sourceLabelForEvidence(details, entry))} · ${escapeHtml(entry.extractedFrom?.sourcePath || entry.sourceRecordId || "—")}</span>
                    </div>
                    <div class="cell-subtle">${escapeHtml(displayLabel(entry.quality || "low"))}</div>
                  </div>
                `)
                .join("")}
            </div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderProfileSourceLineage(details) {
  const rows = arrayValue(details.sourceRecords);
  if (!rows.length) {
    return `<p class="empty-detail">No source record summaries are attached.</p>`;
  }
  return `
    <div class="source-grid">
      ${rows
        .map((record) => `
          <article class="source-card">
            <div class="source-card__head">
              <div class="source-card__title">${escapeHtml(record.displayName || record.id)}</div>
              <div class="source-card__meta">${escapeHtml(`${displayLabel(record.sourceName)} · ${displayLabel(record.sourceDomain)}`)}</div>
            </div>
            <div class="source-card__body">
              <div class="source-field">
                <div class="source-field__label">Source URL</div>
                <div class="source-field__values">${renderMaybeLinks(record.sourceUrl ? [record.sourceUrl] : [])}</div>
                <span></span>
              </div>
              <div class="source-field">
                <div class="source-field__label">Native ID</div>
                <div class="source-field__values">${renderSourceFieldValues(record.sourceNativeId ? [record.sourceNativeId] : [], true)}</div>
                <span></span>
              </div>
              <div class="source-field">
                <div class="source-field__label">Run</div>
                <div class="source-field__values">${renderSourceFieldValues([record.sourceRunId], true)}</div>
                <span></span>
              </div>
            </div>
          </article>
        `)
        .join("")}
    </div>
  `;
}

function renderProfileReviewLineage(details) {
  const reviewRows = arrayValue(details.reviewLabels);
  const enrichmentReview = details.enrichmentReview;
  return `
    <div class="fact-grid">
      <div class="fact-row"><span class="fact-label">Identity reviews</span><div class="fact-value">${escapeHtml(String(reviewRows.length))}</div></div>
      <div class="fact-row"><span class="fact-label">Enrichment</span><div class="fact-value">${enrichmentReview ? renderPill(displayLabel(enrichmentReview.status), statusVariant(enrichmentReview.status)) : "—"}</div></div>
      <div class="fact-row"><span class="fact-label">Reviewer</span><div class="fact-value">${escapeHtml(enrichmentReview?.reviewerId || "—")}</div></div>
      <div class="fact-row"><span class="fact-label">Review note</span><div class="fact-value">${escapeHtml(enrichmentReview?.reviewNote || "—")}</div></div>
    </div>
    <div class="inline-list">
      ${reviewRows.map((review) => renderPill(`${displayLabel(review.candidateDecision)} · ${review.id}`, "neutral")).join("") || renderPill("No identity reviews", "warning")}
    </div>
  `;
}

function renderProfileDetail() {
  const profile = getSelectedProfile();
  const details = getSelectedProfileDetails();
  const loading = state.profileDetailsLoadingId && state.profileDetailsLoadingId === state.selectedProfileId;

  if (!profile) {
    elements.profileDetailTitle.textContent = "Nothing selected";
    elements.profileDetailSubtitle.textContent = "Select a profile to inspect clean matching fields and lineage.";
    elements.profileDetailBody.innerHTML = `<p class="empty-detail">Select a final profile row to see reviewed labels, evidence links, and source lineage.</p>`;
    return;
  }

  elements.profileDetailTitle.textContent = profile.displayName || profile.id;
  elements.profileDetailSubtitle.textContent = `${displayLabel(profile.primaryTrack || "unknown_other")} · v${profile.profileVersion || 1} · ${arrayValue(profile.sourceRecordIds).length} source records`;

  if (!details) {
    elements.profileDetailBody.innerHTML = `<p class="empty-detail">${loading ? "Loading profile detail..." : "Profile detail has not loaded yet."}</p>`;
    return;
  }

  elements.profileDetailBody.innerHTML = `
    <section class="detail-section">
      <h4>Profile summary</h4>
      <p class="detail-lead">${escapeHtml(profile.matchingSummary || "No matching summary saved.")}</p>
      <div class="pill-row">
        ${renderPill(displayLabel(profile.primaryTrack || "unknown_other"), "accent")}
        ${renderPill(displayLabel(profile.contactability?.value || "unknown"), statusVariant(profile.contactability?.value || "unknown"))}
        ${renderPill(displayLabel(profile.careerStage?.value || "unknown"), "neutral")}
        ${renderPill(`v${profile.profileVersion || 1}`, "neutral")}
      </div>
    </section>

    <section class="detail-section">
      <h4>Matching fields</h4>
      <div class="fact-grid">
        <div class="fact-row"><span class="fact-label">Primary track</span><div class="fact-value">${escapeHtml(displayLabel(profile.primaryTrack || "unknown_other"))}</div></div>
        <div class="fact-row"><span class="fact-label">Scored tracks</span><div class="fact-value">${renderProfileScoredItems(profile.scoredTracks, "track", "score")}</div></div>
        <div class="fact-row"><span class="fact-label">Specializations</span><div class="fact-value">${renderProfileScoredItems(profile.specializations, "specialization")}</div></div>
        <div class="fact-row"><span class="fact-label">Skills</span><div class="fact-value">${renderProfileSkillItems(profile.skills)}</div></div>
        <div class="fact-row"><span class="fact-label">Domains</span><div class="fact-value">${renderProfileScoredItems(profile.industryDomainInterests, "domain")}</div></div>
        <div class="fact-row"><span class="fact-label">Contactability</span><div class="fact-value">${escapeHtml(`${displayLabel(profile.contactability?.value || "unknown")} ${confidencePercent(profile.contactability?.confidence)}`.trim())}</div></div>
        <div class="fact-row"><span class="fact-label">Career stage</span><div class="fact-value">${escapeHtml(`${displayLabel(profile.careerStage?.value || "unknown")} ${confidencePercent(profile.careerStage?.confidence)}`.trim())}</div></div>
      </div>
    </section>

    <section class="detail-section">
      <h4>Evidence by field</h4>
      ${renderProfileFieldEvidence(details)}
    </section>

    <section class="detail-section">
      <h4>Source lineage</h4>
      ${renderProfileSourceLineage(details)}
    </section>

    <section class="detail-section">
      <h4>Review lineage</h4>
      ${renderProfileReviewLineage(details)}
    </section>

    <section class="detail-section">
      <h4>Lineage IDs</h4>
      <div class="inline-list">
        ${renderPill(details.lineage.approvedEntityId, "neutral")}
        ${renderPill(details.lineage.enrichmentRunId, "neutral")}
        ${renderPill(details.lineage.enrichmentReviewItemId, "neutral")}
        ${arrayValue(details.lineage.sourceRecordIds).map((id) => renderPill(id, "neutral")).join("")}
      </div>
    </section>
  `;
}

function renderNav() {
  const navConfig = [
    [elements.navJobs, "jobs"],
    [elements.navReview, "review"],
    [elements.navApproved, "approved"],
    [elements.navEnrichment, "enrichment"],
    [elements.navProfiles, "profiles"],
  ];

  navConfig.forEach(([element, page]) => {
    element.classList.toggle("is-active", state.page === page);
  });

  elements.pageJobs.hidden = state.page !== "jobs";
  elements.pageReview.hidden = state.page !== "review";
  elements.pageApproved.hidden = state.page !== "approved";
  elements.pageEnrichment.hidden = state.page !== "enrichment";
  elements.pageProfiles.hidden = state.page !== "profiles";
}

function render() {
  renderNav();
  renderJobsTable();
  renderJobsDetail();
  renderReviewRunFilter();
  renderReviewTable();
  renderReviewDetail();
  renderApprovedTable();
  renderApprovedDetail();
  renderEnrichmentTable();
  renderEnrichmentDetail();
  renderProfileFilters();
  renderProfileTable();
  renderProfileDetail();
}

async function loadData() {
  setConnectionStatus("Refreshing", "idle");

  const previousJobRunId = state.selectedJobRunId;
  const previousReviewRunId = state.reviewRunId;
  const previousCandidateId = state.selectedCandidateId;
  const previousApprovedId = state.selectedApprovedId;
  const previousEnrichmentId = state.selectedEnrichmentId;
  const previousProfileId = state.selectedProfileId;

  try {
    await requestJson("/health");
    const [runsPayload, candidatesPayload, approvedPayload, enrichmentPayload, profilesPayload] = await Promise.all([
      requestJson("/source-runs?limit=50"),
      requestJson("/dedup-candidates?include=details"),
      requestJson("/approved-entities"),
      requestJson("/enrichment-review-items"),
      requestJson("/candidate-profiles?status=active&limit=200"),
    ]);

    state.runs = sortRuns(normalizeListPayload(runsPayload));
    state.candidates = normalizeListPayload(candidatesPayload);
    state.approved = normalizeListPayload(approvedPayload);
    state.enrichmentItems = normalizeListPayload(enrichmentPayload);
    state.profiles = normalizeListPayload(profilesPayload);
    state.profileDetails = {};
    state.selectedJobRunId = previousJobRunId;
    state.reviewRunId = previousReviewRunId;
    state.selectedCandidateId = previousCandidateId;
    state.selectedApprovedId = previousApprovedId;
    state.selectedEnrichmentId = previousEnrichmentId;
    state.selectedProfileId = previousProfileId;
    ensureSelections();
    await loadSelectedProfileDetails();
    setConnectionStatus("Ready", "ready");
    render();
  } catch (error) {
    setConnectionStatus("Refresh failed", "error");
    elements.reviewResult.textContent = error.message;
    elements.reviewResult.dataset.status = "error";
  }
}

async function loadProfileDetails(profileId) {
  if (!profileId || state.profileDetails[profileId]) {
    return;
  }
  state.profileDetailsLoadingId = profileId;
  state.profileMessage = "";
  state.profileMessageStatus = "";
  renderProfileDetail();

  try {
    const payload = await requestJson(`/candidate-profiles/${encodeURIComponent(profileId)}`);
    if (payload?.data) {
      state.profileDetails[profileId] = payload.data;
    }
  } catch (error) {
    state.profileMessage = error.message;
    state.profileMessageStatus = "error";
    if (profileId === state.selectedProfileId) {
      elements.profileDetailBody.innerHTML = `<p class="empty-detail">${escapeHtml(error.message)}</p>`;
    }
  } finally {
    if (state.profileDetailsLoadingId === profileId) {
      state.profileDetailsLoadingId = "";
    }
  }
}

async function loadSelectedProfileDetails() {
  await loadProfileDetails(state.selectedProfileId);
}

async function selectProfile(profileId) {
  state.selectedProfileId = profileId;
  renderProfileTable();
  renderProfileDetail();
  await loadProfileDetails(profileId);
  renderProfileDetail();
}

function reviewActionLabel(action, item = null) {
  if (action === "approve_candidate" && item && !isSingletonCandidate(candidateObject(item), item)) {
    return "Approve merge";
  }
  const labels = {
    approve_candidate: "Approve candidate",
    keep_separate: "Keep separate",
    reject_bad_record: "Bad record",
    reject_not_relevant: "Not relevant",
    hold: "Hold",
  };
  return labels[action] || displayLabel(action);
}

function reviewPayloadForAction(action, item) {
  const candidate = candidateObject(item);
  const singleton = isSingletonCandidate(candidate, item);
  if (action === "approve_candidate") {
    return {
      identityLabel: singleton ? null : "same_person",
      candidateDecision: "approve_candidate",
    };
  }
  if (action === "keep_separate") {
    return {
      identityLabel: "not_same_person",
      candidateDecision: "unsure",
    };
  }
  if (action === "reject_bad_record") {
    return {
      identityLabel: singleton ? null : "unsure",
      candidateDecision: "reject_bad_record",
    };
  }
  if (action === "reject_not_relevant") {
    return {
      identityLabel: singleton ? null : "same_person",
      candidateDecision: "reject_not_relevant",
    };
  }
  return {
    identityLabel: singleton ? null : "unsure",
    candidateDecision: "unsure",
  };
}

async function submitReview(action) {
  const item = getSelectedCandidateItem();
  const candidate = candidateObject(item);
  if (!item || candidate?.status !== "pending_review") {
    return;
  }

  state.reviewSubmitting = true;
  state.reviewMessage = `Saving ${reviewActionLabel(action, item)}...`;
  state.reviewMessageStatus = "";
  renderReviewDetail();

  try {
    const decision = reviewPayloadForAction(action, item);
    await requestJson("/review-labels", {
      method: "POST",
      body: JSON.stringify({
        dedupCandidateId: candidateObject(item)?.id,
        ...decision,
        confirmedSignals: selectedSignalsForItem(item),
        notes: elements.reviewNote.value.trim(),
      }),
    });
    elements.reviewNote.value = "";
    state.reviewMessage = `${reviewActionLabel(action, item)} saved`;
    state.reviewMessageStatus = "success";
    await loadData();
  } catch (error) {
    state.reviewMessage = error.message;
    state.reviewMessageStatus = "error";
  } finally {
    state.reviewSubmitting = false;
    renderReviewDetail();
  }
}

async function generateEnrichment(approvedEntityId) {
  if (!approvedEntityId || state.approvedSubmitting) {
    return;
  }

  state.approvedSubmitting = true;
  state.approvedMessage = "Generating enrichment...";
  state.approvedMessageStatus = "";
  renderApprovedDetail();

  try {
    const payload = await requestJson(`/approved-entities/${encodeURIComponent(approvedEntityId)}/enrichment:generate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const reviewItem = payload?.data?.reviewItem;
    state.approvedMessage = "Enrichment draft created";
    state.approvedMessageStatus = "success";
    await loadData();
    if (reviewItem?.id) {
      state.selectedEnrichmentId = reviewItem.id;
      setPage("enrichment");
    }
  } catch (error) {
    state.approvedMessage = error.message;
    state.approvedMessageStatus = "error";
  } finally {
    state.approvedSubmitting = false;
    renderApprovedDetail();
  }
}

function buildDraftFromEnrichmentForm(item) {
  const draft = item?.draft || {};
  const primaryTrack = elements.enrichmentDetailBody.querySelector("[data-enrichment-primary-track]")?.value || draft.primaryTrack || "unknown_other";
  const trackValues = uniqueList([
    primaryTrack,
    ...selectedOptions(elements.enrichmentDetailBody.querySelector("#enrichmentTracks")),
  ]);
  const specializationValues = selectedOptions(elements.enrichmentDetailBody.querySelector("#enrichmentSpecializations"));
  const domainValues = selectedOptions(elements.enrichmentDetailBody.querySelector("#enrichmentDomains"));
  const skillValues = commaList(elements.enrichmentDetailBody.querySelector("[data-enrichment-skills]")?.value || "");
  const careerStage = elements.enrichmentDetailBody.querySelector("[data-enrichment-career-stage]")?.value || draft.careerStage?.value || "unknown";
  const contactability = elements.enrichmentDetailBody.querySelector("[data-enrichment-contactability]")?.value || draft.contactability?.value || "unknown";
  const existingTracks = existingByKey(draft.scoredTracks, "track");
  const existingSpecializations = existingByKey(draft.specializations, "specialization");
  const existingDomains = existingByKey(draft.industryDomainInterests, "domain");
  const existingSkills = existingByKey(draft.skills, "skill");
  const checkedProposedTags = new Set(
    Array.from(elements.enrichmentDetailBody.querySelectorAll("[data-proposed-tag]:checked")).map((input) => input.getAttribute("data-proposed-tag")),
  );

  return {
    ...draft,
    schemaVersion: "candidate-enrichment-draft-v1",
    primaryTrack,
    scoredTracks: trackValues.map((track) => existingTracks.get(track) || {
      track,
      score: track === primaryTrack ? 1 : 0.8,
      evidenceIds: evidenceForField(item, "scoredTracks"),
    }),
    specializations: specializationValues.map((specialization) => existingSpecializations.get(specialization) || {
      specialization,
      confidence: 1,
      evidenceIds: evidenceForField(item, "specializations"),
    }),
    skills: skillValues.map((skill) => existingSkills.get(skill) || {
      skill,
      confidence: 1,
      evidenceIds: evidenceForField(item, "skills"),
    }),
    industryDomainInterests: domainValues.map((domain) => existingDomains.get(domain) || {
      domain,
      confidence: 1,
      evidenceIds: evidenceForField(item, "industryDomainInterests"),
    }),
    careerStage: {
      ...(draft.careerStage || {}),
      value: careerStage,
      confidence: draft.careerStage?.value === careerStage ? draft.careerStage?.confidence ?? 0.5 : 1,
      evidenceIds: careerStage === "unknown" ? [] : arrayValue(draft.careerStage?.evidenceIds).length ? arrayValue(draft.careerStage.evidenceIds) : evidenceForField(item, "careerStage"),
    },
    contactability: {
      ...(draft.contactability || {}),
      value: contactability,
      confidence: draft.contactability?.value === contactability ? draft.contactability?.confidence ?? 0.5 : 1,
      evidenceIds: contactability === "unknown" ? [] : arrayValue(draft.contactability?.evidenceIds).length ? arrayValue(draft.contactability.evidenceIds) : evidenceForField(item, "contactability"),
    },
    proposedTags: arrayValue(draft.proposedTags).filter((tag) => checkedProposedTags.has(tag.tag)),
    fieldEvidence: draft.fieldEvidence || {},
    warnings: arrayValue(draft.warnings),
  };
}

async function submitEnrichmentDecision(action) {
  const item = getSelectedEnrichmentItem();
  if (!item || item.status !== "pending_review" || state.enrichmentSubmitting) {
    return;
  }

  state.enrichmentSubmitting = true;
  state.enrichmentMessage = action === "approve" ? "Saving enrichment approval..." : "Saving enrichment decision...";
  state.enrichmentMessageStatus = "";
  renderEnrichmentDetail();

  try {
    await requestJson(`/enrichment-review-items/${encodeURIComponent(item.id)}/decision`, {
      method: "POST",
      body: JSON.stringify({
        action,
        notes: elements.enrichmentNote.value.trim(),
        reviewedDraft: action === "approve" ? buildDraftFromEnrichmentForm(item) : undefined,
      }),
    });
    elements.enrichmentNote.value = "";
    state.enrichmentMessage = action === "approve" ? "Enrichment approved" : "Enrichment decision saved";
    state.enrichmentMessageStatus = "success";
    await loadData();
  } catch (error) {
    state.enrichmentMessage = error.message;
    state.enrichmentMessageStatus = "error";
  } finally {
    state.enrichmentSubmitting = false;
    renderEnrichmentDetail();
  }
}

function setPage(page, updateHash = true) {
  state.page = normalizePage(page);
  if (state.page === "profiles") {
    void loadSelectedProfileDetails().then(() => renderProfileDetail());
  }
  if (updateHash) {
    const nextHash = `#${state.page}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
      return;
    }
  }
  render();
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => {
    void loadData();
  });

  elements.navJobs.addEventListener("click", () => setPage("jobs"));
  elements.navReview.addEventListener("click", () => setPage("review"));
  elements.navApproved.addEventListener("click", () => setPage("approved"));
  elements.navEnrichment.addEventListener("click", () => setPage("enrichment"));
  elements.navProfiles.addEventListener("click", () => setPage("profiles"));

  elements.openRunReviewButton.addEventListener("click", () => {
    state.reviewRunId = state.selectedJobRunId;
    ensureSelections();
    setPage("review");
  });

  elements.reviewRunFilter.addEventListener("change", () => {
    state.reviewRunId = elements.reviewRunFilter.value;
    ensureSelections();
    render();
  });

  elements.reviewStatusFilter.addEventListener("change", () => {
    state.reviewStatusFilter = elements.reviewStatusFilter.value;
    ensureSelections();
    render();
  });

  elements.reviewSourceFilter.addEventListener("change", () => {
    state.reviewSourceFilter = elements.reviewSourceFilter.value;
    ensureSelections();
    render();
  });

  elements.reviewSignalFilter.addEventListener("change", () => {
    state.reviewSignalFilter = elements.reviewSignalFilter.value;
    ensureSelections();
    render();
  });

  elements.reviewSearchInput.addEventListener("input", () => {
    state.reviewSearch = elements.reviewSearchInput.value.trim().toLowerCase();
    ensureSelections();
    render();
  });

  elements.approvedSearchInput.addEventListener("input", () => {
    state.approvedSearch = elements.approvedSearchInput.value.trim().toLowerCase();
    ensureSelections();
    render();
  });

  elements.profileTrackFilter.addEventListener("change", () => {
    state.profileTrackFilter = elements.profileTrackFilter.value;
    ensureSelections();
    render();
    void loadSelectedProfileDetails().then(() => renderProfileDetail());
  });

  elements.profileDomainFilter.addEventListener("change", () => {
    state.profileDomainFilter = elements.profileDomainFilter.value;
    ensureSelections();
    render();
    void loadSelectedProfileDetails().then(() => renderProfileDetail());
  });

  elements.profileSourceFilter.addEventListener("change", () => {
    state.profileSourceFilter = elements.profileSourceFilter.value;
    ensureSelections();
    render();
    void loadSelectedProfileDetails().then(() => renderProfileDetail());
  });

  elements.profileContactabilityFilter.addEventListener("change", () => {
    state.profileContactabilityFilter = elements.profileContactabilityFilter.value;
    ensureSelections();
    render();
    void loadSelectedProfileDetails().then(() => renderProfileDetail());
  });

  elements.profileSearchInput.addEventListener("input", () => {
    state.profileSearch = elements.profileSearchInput.value.trim().toLowerCase();
    ensureSelections();
    render();
    void loadSelectedProfileDetails().then(() => renderProfileDetail());
  });

  elements.jobsTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-run-id]");
    if (!button) {
      return;
    }
    state.selectedJobRunId = button.getAttribute("data-run-id") || "";
    renderJobsDetail();
    renderJobsTable();
  });

  elements.reviewTableBody.addEventListener("click", (event) => {
    const candidateTarget = event.target.closest("[data-candidate-id]");
    if (!candidateTarget || !elements.reviewTableBody.contains(candidateTarget)) {
      return;
    }
    state.selectedCandidateId = candidateTarget.getAttribute("data-candidate-id") || "";
    renderReviewTable();
    renderReviewDetail();
  });

  elements.approvedTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-approved-id]");
    if (!button) {
      return;
    }
    state.selectedApprovedId = button.getAttribute("data-approved-id") || "";
    renderApprovedTable();
    renderApprovedDetail();
  });

  elements.enrichmentTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-enrichment-id]");
    if (!button) {
      return;
    }
    state.selectedEnrichmentId = button.getAttribute("data-enrichment-id") || "";
    renderEnrichmentTable();
    renderEnrichmentDetail();
  });

  elements.profilesTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile-id]");
    if (!button) {
      return;
    }
    void selectProfile(button.getAttribute("data-profile-id") || "");
  });

  document.addEventListener("click", (event) => {
    const generateButton = event.target.closest("[data-generate-enrichment]");
    if (generateButton) {
      void generateEnrichment(generateButton.getAttribute("data-generate-enrichment") || "");
      return;
    }

    const addSignalButton = event.target.closest("[data-add-review-signal]");
    if (addSignalButton) {
      const item = getSelectedCandidateItem();
      const input = elements.reviewDetailBody.querySelector("[data-review-signal-input]");
      const signal = normalizeSignal(input?.value || "");
      if (item && signal) {
        setSignalSelection(item, [...selectedSignalsForItem(item), signal]);
        renderReviewDetail();
      }
      return;
    }

    const enrichmentActionButton = event.target.closest("[data-enrichment-action]");
    if (enrichmentActionButton) {
      void submitEnrichmentDecision(enrichmentActionButton.getAttribute("data-enrichment-action") || "hold");
      return;
    }

    const actionButton = event.target.closest("[data-review-action]");
    if (!actionButton) {
      return;
    }
    void submitReview(actionButton.getAttribute("data-review-action") || "hold");
  });

  document.addEventListener("change", (event) => {
    const signalInput = event.target.closest("[data-review-signal]");
    if (!signalInput) {
      return;
    }
    const item = getSelectedCandidateItem();
    const signal = normalizeSignal(signalInput.getAttribute("data-review-signal") || "");
    if (!item || !signal) {
      return;
    }
    const current = new Set(selectedSignalsForItem(item));
    if (signalInput.checked) {
      current.add(signal);
    } else {
      current.delete(signal);
    }
    setSignalSelection(item, [...current]);
    renderReviewDetail();
  });

  window.addEventListener("hashchange", () => {
    state.page = normalizePage(window.location.hash.replace(/^#/, ""));
    if (state.page === "profiles") {
      void loadSelectedProfileDetails().then(() => renderProfileDetail());
    }
    render();
  });
}

function boot() {
  bindEvents();
  void loadData();
}

boot();

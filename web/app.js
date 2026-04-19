const API_BASE_URL = "/api/sourcing";
const PAGE_IDS = new Set(["jobs", "review", "approved"]);

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

const state = {
  page: normalizePage(window.location.hash.replace(/^#/, "") || "review"),
  runs: [],
  candidates: [],
  approved: [],
  selectedJobRunId: "",
  reviewRunId: "",
  selectedCandidateId: "",
  selectedApprovedId: "",
  reviewSearch: "",
  approvedSearch: "",
  reviewSubmitting: false,
  reviewMessage: "",
  reviewMessageStatus: "",
};

const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  navJobs: document.querySelector("#navJobs"),
  navReview: document.querySelector("#navReview"),
  navApproved: document.querySelector("#navApproved"),
  navJobsCount: document.querySelector("#navJobsCount"),
  navReviewCount: document.querySelector("#navReviewCount"),
  navApprovedCount: document.querySelector("#navApprovedCount"),
  pageJobs: document.querySelector("#pageJobs"),
  pageReview: document.querySelector("#pageReview"),
  pageApproved: document.querySelector("#pageApproved"),
  jobsMeta: document.querySelector("#jobsMeta"),
  jobsTableBody: document.querySelector("#jobsTableBody"),
  jobsDetailTitle: document.querySelector("#jobsDetailTitle"),
  jobsDetailSubtitle: document.querySelector("#jobsDetailSubtitle"),
  jobsDetailBody: document.querySelector("#jobsDetailBody"),
  openRunReviewButton: document.querySelector("#openRunReviewButton"),
  reviewMeta: document.querySelector("#reviewMeta"),
  reviewRunFilter: document.querySelector("#reviewRunFilter"),
  reviewSearchInput: document.querySelector("#reviewSearchInput"),
  reviewTableBody: document.querySelector("#reviewTableBody"),
  reviewDetailTitle: document.querySelector("#reviewDetailTitle"),
  reviewDetailSubtitle: document.querySelector("#reviewDetailSubtitle"),
  reviewDetailBody: document.querySelector("#reviewDetailBody"),
  reviewNote: document.querySelector("#reviewNote"),
  reviewApproveButton: document.querySelector("#reviewApproveButton"),
  reviewSeparateButton: document.querySelector("#reviewSeparateButton"),
  reviewHoldButton: document.querySelector("#reviewHoldButton"),
  reviewResult: document.querySelector("#reviewResult"),
  approvedMeta: document.querySelector("#approvedMeta"),
  approvedSearchInput: document.querySelector("#approvedSearchInput"),
  approvedTableBody: document.querySelector("#approvedTableBody"),
  approvedDetailTitle: document.querySelector("#approvedDetailTitle"),
  approvedDetailSubtitle: document.querySelector("#approvedDetailSubtitle"),
  approvedDetailBody: document.querySelector("#approvedDetailBody"),
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
    const errorText = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return payload;
}

function statusVariant(status) {
  if (status === "completed" || status === "approved" || status === "same_person") {
    return "success";
  }
  if (status === "pending_review" || status === "medium") {
    return "warning";
  }
  if (status === "failed" || status === "not_same_person") {
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
  return pendingCandidatesAll()
    .filter((item) => {
      const candidate = candidateObject(item);
      if (!candidate) {
        return false;
      }
      if (state.reviewRunId && candidate.createdFromSourceRunId !== state.reviewRunId) {
        return false;
      }
      if (!state.reviewSearch) {
        return true;
      }
      const haystack = [
        stringValue(candidate.displayName),
        ...matchedFieldsForCandidate(candidate),
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
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.approvedSearch);
  });
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

  if ((!state.reviewRunId || (currentReviewPending === 0 && fallbackPending > 0)) && defaultRunId) {
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
        <tr class="${selectedClass}">
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
  const disableActions = !item || state.reviewSubmitting;

  elements.reviewApproveButton.disabled = disableActions;
  elements.reviewSeparateButton.disabled = disableActions;
  elements.reviewHoldButton.disabled = disableActions;
  elements.reviewResult.textContent = state.reviewMessage;
  elements.reviewResult.dataset.status = state.reviewMessageStatus;

  if (!item) {
    elements.reviewDetailTitle.textContent = "Nothing selected";
    elements.reviewDetailSubtitle.textContent = "Select a queue row to compare the raw source values.";
    elements.reviewDetailBody.innerHTML = `<p class="empty-detail">Select a queue row to see why it was flagged, which fields matched, and the source A / source B values.</p>`;
    return;
  }

  const candidate = candidateObject(item);
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
  elements.approvedMeta.textContent = entities.length ? `${entities.length} approved entities` : "No approved entities found";

  if (!entities.length) {
    elements.approvedTableBody.innerHTML = `<tr><td colspan="6" class="empty-row">No approved entities found.</td></tr>`;
    return;
  }

  elements.approvedTableBody.innerHTML = entities
    .map((entity) => {
      const selectedClass = entity.id === state.selectedApprovedId ? "is-selected" : "";
      return `
        <tr class="${selectedClass}">
          <td>
            <button type="button" class="row-button" data-approved-id="${escapeHtml(entity.id)}">
              <span class="row-primary">${escapeHtml(entity.displayName || entity.id)}</span>
              <span class="row-secondary mono">${escapeHtml(entity.id)}</span>
            </button>
          </td>
          <td>${escapeHtml(arrayValue(entity.emails).slice(0, 2).join(", ") || "—")}</td>
          <td class="mono">${escapeHtml(arrayValue(entity.orcids).slice(0, 1).join(", ") || "—")}</td>
          <td>${escapeHtml(arrayValue(entity.institutions).slice(0, 2).join(", ") || "—")}</td>
          <td>${escapeHtml(String(arrayValue(entity.sourceRecordIds).length))}</td>
          <td>${escapeHtml(formatDateTime(entity.createdAt))}</td>
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

  elements.approvedDetailTitle.textContent = entity.displayName || entity.id;
  elements.approvedDetailSubtitle.textContent = `${arrayValue(entity.sourceRecordIds).length} source records survived`;
  elements.approvedDetailBody.innerHTML = `
    <section class="detail-section">
      <h4>Surviving fields</h4>
      <div class="pill-row">
        ${renderPill("Approved", "success")}
        ${renderPill(displayLabel(entity.entityType || "entity"), "neutral")}
      </div>
      <div class="fact-grid">
        <div class="fact-row"><span class="fact-label">Emails</span><div class="fact-value">${renderMaybeLinks(arrayValue(entity.emails))}</div></div>
        <div class="fact-row"><span class="fact-label">Homepages</span><div class="fact-value">${renderMaybeLinks(arrayValue(entity.homepages))}</div></div>
        <div class="fact-row"><span class="fact-label">GitHub</span><div class="fact-value">${renderMaybeLinks(arrayValue(entity.githubUrls))}</div></div>
        <div class="fact-row"><span class="fact-label">ORCID</span><div class="fact-value mono">${escapeHtml(arrayValue(entity.orcids).join(", ") || "—")}</div></div>
        <div class="fact-row"><span class="fact-label">Institutions</span><div class="fact-value">${escapeHtml(arrayValue(entity.institutions).join(", ") || "—")}</div></div>
        <div class="fact-row"><span class="fact-label">Created</span><div class="fact-value">${escapeHtml(formatDateTime(entity.createdAt))}</div></div>
      </div>
    </section>

    <section class="detail-section">
      <h4>Source records</h4>
      <div class="inline-list">
        ${arrayValue(entity.sourceRecordIds).map((id) => renderPill(id, "neutral")).join("") || renderPill("No source record IDs", "warning")}
      </div>
    </section>

    <details class="payload">
      <summary>Approved payload</summary>
      <pre>${escapeHtml(JSON.stringify(entity, null, 2))}</pre>
    </details>
  `;
}

function renderNav() {
  const navConfig = [
    [elements.navJobs, "jobs"],
    [elements.navReview, "review"],
    [elements.navApproved, "approved"],
  ];

  navConfig.forEach(([element, page]) => {
    element.classList.toggle("is-active", state.page === page);
  });

  elements.pageJobs.hidden = state.page !== "jobs";
  elements.pageReview.hidden = state.page !== "review";
  elements.pageApproved.hidden = state.page !== "approved";
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
}

async function loadData() {
  setConnectionStatus("Refreshing", "idle");

  const previousJobRunId = state.selectedJobRunId;
  const previousReviewRunId = state.reviewRunId;
  const previousCandidateId = state.selectedCandidateId;
  const previousApprovedId = state.selectedApprovedId;

  try {
    await requestJson("/health");
    const [runsPayload, candidatesPayload, approvedPayload] = await Promise.all([
      requestJson("/source-runs?limit=50"),
      requestJson("/dedup-candidates?include=details"),
      requestJson("/approved-entities"),
    ]);

    state.runs = sortRuns(normalizeListPayload(runsPayload));
    state.candidates = normalizeListPayload(candidatesPayload);
    state.approved = normalizeListPayload(approvedPayload);
    state.selectedJobRunId = previousJobRunId;
    state.reviewRunId = previousReviewRunId;
    state.selectedCandidateId = previousCandidateId;
    state.selectedApprovedId = previousApprovedId;
    ensureSelections();
    setConnectionStatus("Ready", "ready");
    render();
  } catch (error) {
    setConnectionStatus("Refresh failed", "error");
    elements.reviewResult.textContent = error.message;
    elements.reviewResult.dataset.status = "error";
  }
}

async function submitReview(label) {
  const item = getSelectedCandidateItem();
  if (!item) {
    return;
  }

  state.reviewSubmitting = true;
  state.reviewMessage = `Saving ${displayLabel(label)}...`;
  state.reviewMessageStatus = "";
  renderReviewDetail();

  try {
    await requestJson("/review-labels", {
      method: "POST",
      body: JSON.stringify({
        dedupCandidateId: candidateObject(item)?.id,
        label,
        notes: elements.reviewNote.value.trim(),
      }),
    });
    elements.reviewNote.value = "";
    state.reviewMessage = `${displayLabel(label)} saved`;
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

function setPage(page, updateHash = true) {
  state.page = normalizePage(page);
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
    const button = event.target.closest("[data-candidate-id]");
    if (!button) {
      return;
    }
    state.selectedCandidateId = button.getAttribute("data-candidate-id") || "";
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

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-review-label]");
    if (!actionButton) {
      return;
    }
    void submitReview(actionButton.getAttribute("data-review-label") || "unsure");
  });

  window.addEventListener("hashchange", () => {
    state.page = normalizePage(window.location.hash.replace(/^#/, ""));
    render();
  });
}

function boot() {
  bindEvents();
  void loadData();
}

boot();

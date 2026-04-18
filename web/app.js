const STORAGE_KEY = "wekruit.sourcingReview.apiBaseUrl";

const ROUTES = {
  overview: {
    eyebrow: "Overview",
    title: "Operational overview",
    subtitle: "See run load, pending merge work, and recently approved researchers before diving into the review loop.",
  },
  runs: {
    eyebrow: "Runs",
    title: "Source run explorer",
    subtitle: "Pick a run, inspect the records inside it, and understand what the pipeline actually collected.",
  },
  queue: {
    eyebrow: "Queue",
    title: "Merge review workbench",
    subtitle: "Compare conflicting source records, inspect evidence, and make the merge decision without losing provenance.",
  },
  approved: {
    eyebrow: "Approved",
    title: "Approved researcher entities",
    subtitle: "Audit the survivors that are ready to move downstream into outbound and enrichment workflows.",
  },
  utilities: {
    eyebrow: "Utilities",
    title: "Manual controls and transport",
    subtitle: "Keep API targeting, source-run creation, and batch upload off the review pages but available when needed.",
  },
};

const state = {
  route: "overview",
  sourceRuns: [],
  sourceRecords: [],
  candidateDetails: [],
  approvedEntities: [],
  selectedRunId: "",
  selectedRecordId: "",
  selectedCandidateId: "",
  selectedApprovedEntityId: "",
  filters: {
    recordType: "all",
    recordSort: "impact_desc",
    recordSearch: "",
    queueStatus: "pending_review",
    approvedScope: "selected_run",
    approvedSearch: "",
  },
};

const elements = {
  navLinks: Array.from(document.querySelectorAll(".nav-link")),
  pages: Array.from(document.querySelectorAll(".page")),
  pageEyebrow: document.querySelector("#pageEyebrow"),
  pageTitle: document.querySelector("#pageTitle"),
  pageSubtitle: document.querySelector("#pageSubtitle"),
  apiBaseChip: document.querySelector("#apiBaseChip"),
  connectionStatus: document.querySelector("#connectionStatus"),
  refreshAllButton: document.querySelector("#refreshAllButton"),
  navOverviewCount: document.querySelector("#navOverviewCount"),
  navRunsCount: document.querySelector("#navRunsCount"),
  navQueueCount: document.querySelector("#navQueueCount"),
  navApprovedCount: document.querySelector("#navApprovedCount"),
  navUtilitiesCount: document.querySelector("#navUtilitiesCount"),
  focusedRunCard: document.querySelector("#focusedRunCard"),
  sidebarHealth: document.querySelector("#sidebarHealth"),
  overviewMetrics: document.querySelector("#overviewMetrics"),
  overviewRunsAttention: document.querySelector("#overviewRunsAttention"),
  overviewQueuePreview: document.querySelector("#overviewQueuePreview"),
  overviewApprovedPreview: document.querySelector("#overviewApprovedPreview"),
  overviewActions: document.querySelector("#overviewActions"),
  refreshRunsButton: document.querySelector("#refreshRunsButton"),
  completeRunButton: document.querySelector("#completeRunButton"),
  runsRunList: document.querySelector("#runsRunList"),
  runsRunSummary: document.querySelector("#runsRunSummary"),
  recordTypeFilter: document.querySelector("#recordTypeFilter"),
  recordSort: document.querySelector("#recordSort"),
  recordSearch: document.querySelector("#recordSearch"),
  runRecordTableBody: document.querySelector("#runRecordTableBody"),
  recordDetail: document.querySelector("#recordDetail"),
  queueScope: document.querySelector("#queueScope"),
  queueStatusFilter: document.querySelector("#queueStatusFilter"),
  refreshCandidatesButton: document.querySelector("#refreshCandidatesButton"),
  queueSummary: document.querySelector("#queueSummary"),
  candidateTableBody: document.querySelector("#candidateTableBody"),
  candidateDetail: document.querySelector("#candidateDetail"),
  reviewForm: document.querySelector("#reviewForm"),
  reviewSubmitButton: document.querySelector("#reviewForm button[type='submit']"),
  dedupCandidateId: document.querySelector("#dedupCandidateId"),
  reviewLabel: document.querySelector("#reviewLabel"),
  reviewLabelSamePersonOption: document.querySelector("#reviewLabel option[value='same_person']"),
  reviewNotes: document.querySelector("#reviewNotes"),
  approveSamePersonButton: document.querySelector("#approveSamePersonButton"),
  approveNotSamePersonButton: document.querySelector("#approveNotSamePersonButton"),
  approveUnsureButton: document.querySelector("#approveUnsureButton"),
  reviewResult: document.querySelector("#reviewResult"),
  approvedScopeFilter: document.querySelector("#approvedScopeFilter"),
  refreshApprovedButton: document.querySelector("#refreshApprovedButton"),
  approvedSearch: document.querySelector("#approvedSearch"),
  approvedTableBody: document.querySelector("#approvedTableBody"),
  approvedDetail: document.querySelector("#approvedDetail"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  sourceRunSourceName: document.querySelector("#sourceRunSourceName"),
  sourceRunDomain: document.querySelector("#sourceRunDomain"),
  sourceRunPipeline: document.querySelector("#sourceRunPipeline"),
  createRunButton: document.querySelector("#createRunButton"),
  sourceRunResult: document.querySelector("#sourceRunResult"),
  jsonlFile: document.querySelector("#jsonlFile"),
  jsonlInput: document.querySelector("#jsonlInput"),
  runId: document.querySelector("#runId"),
  uploadEndpoint: document.querySelector("#uploadEndpoint"),
  uploadButton: document.querySelector("#uploadButton"),
  uploadResult: document.querySelector("#uploadResult"),
  uploadCurl: document.querySelector("#uploadCurl"),
};

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function humanizeToken(value) {
  const token = stringValue(value);
  return token ? token.replace(/_/g, " ") : "";
}

function displayLabel(value) {
  const normalized = humanizeToken(value);
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

function joinUrl(base, path) {
  const cleanBase = stringValue(base).replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

function renderJson(target, value) {
  target.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function buildCurl(url, body) {
  const escapedBody = JSON.stringify(body, null, 2).replace(/'/g, "'\\''");
  return `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  --data '${escapedBody}'`;
}

function normalizeListPayload(payload) {
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.records)) {
    return payload.records;
  }
  return payload ? [payload] : [];
}

function timestampValue(value) {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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

function formatDate(value) {
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
  }).format(date);
}

function compactObject(record) {
  return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== ""));
}

function setConnectionStatus(message, stateName = "idle") {
  elements.connectionStatus.textContent = message;
  document.body.dataset.connection = stateName;
}

function getApiBaseUrl() {
  return elements.apiBaseUrl.value.trim().replace(/\/$/, "");
}

async function requestJson(path, options = {}) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Set API base URL first.");
  }

  const response = await fetch(joinUrl(apiBaseUrl, path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const details = payload ? JSON.stringify(payload, null, 2) : text;
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${details}`);
  }

  return payload;
}

function sortRunsForReview(runs) {
  return runs
    .slice()
    .sort((left, right) => {
      const dedupDelta = numberValue(right.dedupCandidateCount) - numberValue(left.dedupCandidateCount);
      if (dedupDelta !== 0) {
        return dedupDelta;
      }

      const recordDelta = numberValue(right.sourceRecordCount) - numberValue(left.sourceRecordCount);
      if (recordDelta !== 0) {
        return recordDelta;
      }

      return timestampValue(right.createdAt) - timestampValue(left.createdAt);
    });
}

function chooseRunId(runs, preferredRunId = "") {
  if (!runs.length) {
    return "";
  }

  if (preferredRunId) {
    const preferred = runs.find((run) => run.id === preferredRunId);
    if (preferred) {
      return preferred.id;
    }
  }

  const pendingReviewRun = runs.find((run) => numberValue(run.dedupCandidateCount) > 0);
  if (pendingReviewRun) {
    return pendingReviewRun.id;
  }

  return runs[0].id;
}

function getSelectedRun() {
  return state.sourceRuns.find((run) => run.id === state.selectedRunId) ?? null;
}

function getSelectedRecord() {
  return state.sourceRecords.find((record) => record.id === state.selectedRecordId) ?? null;
}

function candidateObject(item) {
  return item?.candidate ?? item ?? null;
}

function getSelectedCandidateItem() {
  return filteredCandidateDetails().find((item) => candidateObject(item)?.id === state.selectedCandidateId) ?? null;
}

function getSelectedApprovedEntity() {
  return filteredApprovedEntities().find((entity) => entity.id === state.selectedApprovedEntityId) ?? null;
}

function computeRecordCounts(records) {
  return records.reduce(
    (accumulator, record) => {
      const entityType = stringValue(record.entityType);
      if (entityType === "research_work" || entityType === "paper") {
        accumulator.papers += 1;
      }
      if (entityType === "person_profile" || entityType === "person" || entityType === "profile") {
        accumulator.people += 1;
      }
      return accumulator;
    },
    { papers: 0, people: 0 },
  );
}

function pickFirst(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseJsonl(input) {
  if (!input.trim()) {
    return [];
  }

  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL on line ${index + 1}: ${error.message}`);
      }
    });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

function csvToSourceRecords(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values, index) => {
    const raw = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]?.trim() ?? ""]));
    const name = pickFirst(raw, ["name", "member_name", "username", "full_name", "project_name"]);
    const institution = pickFirst(raw, ["institution", "company", "member_company", "affiliation"]);
    const sourceNativeId =
      pickFirst(raw, [
        "sourceNativeId",
        "source_native_id",
        "id",
        "username",
        "member_username",
        "member_devpost",
        "github_url",
        "member_github",
        "project_url",
        "email",
      ]) || `csv-row-${index + 1}`;
    const entityType = pickFirst(raw, ["entityType", "entity_type", "type"]) || "person";
    const url = pickFirst(raw, [
      "github_url",
      "member_github",
      "html_url",
      "blog",
      "website",
      "member_website",
      "project_url",
    ]);

    return {
      sourceNativeId,
      entityType,
      displayName: name,
      institution,
      sourceUrl: url,
      display: compactObject({
        name,
        title: pickFirst(raw, ["title", "project_name"]),
        institution,
        homepage: pickFirst(raw, ["homepage", "website", "member_website", "blog"]),
        github: pickFirst(raw, ["github_url", "member_github", "html_url"]),
        linkedin: pickFirst(raw, ["linkedin_url", "member_linkedin"]),
      }),
      rawSummary: compactObject({
        email: pickFirst(raw, ["email", "emails", "member_email"]),
        github: pickFirst(raw, ["github_url", "member_github", "html_url"]),
        linkedin: pickFirst(raw, ["linkedin_url", "member_linkedin"]),
        devpost: pickFirst(raw, ["member_devpost", "project_url"]),
        projectUrl: pickFirst(raw, ["project_url"]),
        orcid: pickFirst(raw, ["orcid", "orcid_id"]),
        homepage: pickFirst(raw, ["homepage", "website", "member_website", "blog"]),
        score: pickFirst(raw, ["score", "score_total"]),
      }),
      raw,
    };
  });
}

function buildUploadBody() {
  return {
    runId: elements.runId.value.trim(),
    records: parseJsonl(elements.jsonlInput.value),
  };
}

function buildSourceRunBody() {
  return {
    sourceName: elements.sourceRunSourceName.value.trim(),
    sourceDomain: elements.sourceRunDomain.value.trim(),
    pipelineName: elements.sourceRunPipeline.value.trim(),
    trigger: "manual",
    metadata: {
      submittedFrom: "sourcing-review-web",
    },
  };
}

function normalizeRoute(value) {
  const candidate = stringValue(value).replace(/^#\/?/, "").trim();
  return ROUTES[candidate] ? candidate : "overview";
}

function recordTitle(record) {
  return (
    stringValue(record.display?.title) ||
    stringValue(record.display?.name) ||
    stringValue(record.displayName) ||
    stringValue(record.sourceNativeId) ||
    stringValue(record.id) ||
    "Untitled record"
  );
}

function recordSubtitle(record) {
  return (
    stringValue(record.display?.venue) ||
    stringValue(record.rawSummary?.venue) ||
    stringValue(record.institution) ||
    stringValue(record.display?.institution) ||
    "No secondary field"
  );
}

function recordIdentifier(record) {
  return (
    stringValue(record.rawSummary?.doi) ||
    stringValue(record.rawSummary?.orcid) ||
    stringValue(record.sourceNativeId) ||
    "—"
  );
}

function recordMetricLabel(record) {
  if (stringValue(record.entityType) === "research_work" || stringValue(record.entityType) === "paper") {
    return {
      label: "Cited / date",
      value: `${numberValue(record.rawSummary?.citedByCount)} · ${formatDate(record.rawSummary?.publicationDate)}`,
    };
  }
  return {
    label: "Contact hints",
    value: `${numberValue(record.rawSummary?.emailCount)} email · ${numberValue(record.rawSummary?.homepageCount)} homepage`,
  };
}

function recordSortValue(record, sortMode) {
  if (sortMode === "recent_desc") {
    return timestampValue(record.rawSummary?.publicationDate) || timestampValue(record.updatedAt);
  }
  if (sortMode === "name_asc") {
    return 0;
  }

  if (stringValue(record.entityType) === "research_work" || stringValue(record.entityType) === "paper") {
    return numberValue(record.rawSummary?.citedByCount);
  }

  return (
    numberValue(record.rawSummary?.emailCount) * 10 +
    numberValue(record.rawSummary?.homepageCount) * 5 +
    numberValue(record.rawSummary?.paperCountInBatch)
  );
}

function filteredRunRecords() {
  const requestedType = state.filters.recordType;
  const query = state.filters.recordSearch.trim().toLowerCase();
  const sortMode = state.filters.recordSort;

  return state.sourceRecords
    .filter((record) => {
      if (requestedType !== "all" && stringValue(record.entityType) !== requestedType) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        recordTitle(record),
        recordSubtitle(record),
        stringValue(record.rawSummary?.doi),
        stringValue(record.rawSummary?.orcid),
        stringValue(record.sourceNativeId),
        stringValue(record.source),
        stringValue(record.rawSummary?.institution),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (sortMode === "name_asc") {
        return recordTitle(left).localeCompare(recordTitle(right));
      }
      return recordSortValue(right, sortMode) - recordSortValue(left, sortMode);
    });
}

function filteredCandidateDetails() {
  return state.candidateDetails
    .filter((item) => {
      const candidate = candidateObject(item);
      if (!candidate) {
        return false;
      }

      if (state.selectedRunId && candidate.createdFromSourceRunId !== state.selectedRunId) {
        return false;
      }

      if (state.filters.queueStatus === "pending_review") {
        return candidate.status === "pending_review";
      }

      if (state.filters.queueStatus === "reviewed") {
        return candidate.status !== "pending_review" && candidate.status !== "suppressed";
      }

      return candidate.status !== "suppressed";
    })
    .sort((left, right) => {
      const leftCandidate = candidateObject(left);
      const rightCandidate = candidateObject(right);
      const strengthRank = { strong: 2, medium: 1, weak: 0 };
      const strengthDelta =
        strengthRank[rightCandidate?.strength ?? "weak"] - strengthRank[leftCandidate?.strength ?? "weak"];
      if (strengthDelta !== 0) {
        return strengthDelta;
      }
      return timestampValue(rightCandidate?.updatedAt) - timestampValue(leftCandidate?.updatedAt);
    });
}

function filteredApprovedEntities() {
  const query = state.filters.approvedSearch.trim().toLowerCase();
  const selectedScope = state.filters.approvedScope;

  return state.approvedEntities
    .filter((entity) => {
      if (selectedScope === "selected_run" && state.selectedRunId) {
        const sourceRecordIds = new Set(state.sourceRecords.map((record) => record.id));
        const matchesRun = arrayValue(entity.sourceRecordIds).some((sourceRecordId) => sourceRecordIds.has(sourceRecordId));
        if (!matchesRun) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const haystack = [
        stringValue(entity.displayName),
        ...arrayValue(entity.emails),
        ...arrayValue(entity.homepages),
        ...arrayValue(entity.institutions),
        ...arrayValue(entity.githubUrls),
        ...arrayValue(entity.orcids),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .slice()
    .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt));
}

function allPendingCandidates() {
  return state.candidateDetails.filter((item) => candidateObject(item)?.status === "pending_review");
}

function pendingCountForRun(runId) {
  return state.candidateDetails.filter((item) => {
    const candidate = candidateObject(item);
    return candidate?.status === "pending_review" && candidate.createdFromSourceRunId === runId;
  }).length;
}

function reviewedCountForRun(runId) {
  return state.candidateDetails.filter((item) => {
    const candidate = candidateObject(item);
    return candidate?.status && candidate.status !== "pending_review" && candidate.createdFromSourceRunId === runId;
  }).length;
}

function approvedCountForSelectedRun() {
  if (!state.selectedRunId) {
    return 0;
  }
  const sourceRecordIds = new Set(state.sourceRecords.map((record) => record.id));
  return state.approvedEntities.filter((entity) =>
    arrayValue(entity.sourceRecordIds).some((sourceRecordId) => sourceRecordIds.has(sourceRecordId)),
  ).length;
}

function renderPill(content, variant = "neutral") {
  return `<span class="pill pill--${escapeHtml(variant)}">${escapeHtml(content)}</span>`;
}

function renderReasonChips(reasonCodes) {
  const items = arrayValue(reasonCodes);
  if (!items.length) {
    return renderPill("None", "neutral");
  }
  return items.map((reason) => renderPill(displayLabel(reason), "neutral")).join("");
}

function renderListPreview(values, limit = 2) {
  const items = arrayValue(values);
  if (!items.length) {
    return "—";
  }
  if (items.length <= limit) {
    return items.join(", ");
  }
  return `${items.slice(0, limit).join(", ")} +${items.length - limit}`;
}

function renderEmptyTableRow(colspan, message, actionHtml = "") {
  return `
    <tr>
      <td colspan="${colspan}" class="empty-row">
        ${escapeHtml(message)}
        ${actionHtml}
      </td>
    </tr>
  `;
}

function ensureSelectedRecord() {
  const records = filteredRunRecords();
  if (records.some((record) => record.id === state.selectedRecordId)) {
    return;
  }
  state.selectedRecordId = records[0]?.id ?? "";
}

function ensureSelectedCandidate() {
  const items = filteredCandidateDetails();
  if (items.some((item) => candidateObject(item)?.id === state.selectedCandidateId)) {
    return;
  }
  state.selectedCandidateId = candidateObject(items[0])?.id ?? "";
}

function ensureSelectedApprovedEntity() {
  const entities = filteredApprovedEntities();
  if (entities.some((entity) => entity.id === state.selectedApprovedEntityId)) {
    return;
  }
  state.selectedApprovedEntityId = entities[0]?.id ?? "";
}

function getStatusVariant(status) {
  const normalized = stringValue(status) || "pending";
  return `status-${normalized}`;
}

function getLabelVariant(label) {
  const normalized = stringValue(label) || "pending_review";
  return `label-${normalized}`;
}

function getStrengthVariant(value) {
  return `strength-${stringValue(value) || "weak"}`;
}

function syncRouteChrome() {
  const route = ROUTES[state.route];
  const selectedRun = getSelectedRun();
  const routeSubtitle = selectedRun && state.route !== "overview" && state.route !== "utilities"
    ? `${route.subtitle} Focused run: ${selectedRun.id}.`
    : route.subtitle;

  elements.pageEyebrow.textContent = route.eyebrow;
  elements.pageTitle.textContent = route.title;
  elements.pageSubtitle.textContent = routeSubtitle;
  elements.apiBaseChip.textContent = getApiBaseUrl() || "API target not set";

  elements.navLinks.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === state.route);
  });

  elements.pages.forEach((page) => {
    page.hidden = page.id !== `page${state.route.charAt(0).toUpperCase()}${state.route.slice(1)}`;
  });

  elements.navOverviewCount.textContent = String(state.sourceRuns.length);
  elements.navRunsCount.textContent = state.selectedRunId ? String(state.sourceRecords.length) : String(state.sourceRuns.length);
  elements.navQueueCount.textContent = String(allPendingCandidates().length);
  elements.navApprovedCount.textContent = String(state.approvedEntities.length);
  elements.navUtilitiesCount.textContent = "Ops";
}

function renderFocusedRunCard() {
  const selectedRun = getSelectedRun();
  if (!selectedRun) {
    elements.focusedRunCard.innerHTML = `<p class="empty-state empty-state--inverse">Select a source run to scope records, queue, and approved entities.</p>`;
    return;
  }

  const { papers, people } = computeRecordCounts(state.sourceRecords);
  elements.focusedRunCard.innerHTML = `
    <div>
      <p class="eyebrow">Focused run</p>
      <h3>${escapeHtml(selectedRun.id)}</h3>
      <p>${escapeHtml(selectedRun.sourceName || "source")} · ${escapeHtml(selectedRun.sourceDomain || "domain")} · ${escapeHtml(selectedRun.pipelineName || "pipeline")}</p>
    </div>
    <div class="badge-row">
      ${renderPill(displayLabel(selectedRun.status || "unknown"), getStatusVariant(selectedRun.status || "pending"))}
      ${renderPill(`${numberValue(selectedRun.sourceRecordCount) || state.sourceRecords.length} records`, "neutral")}
    </div>
    <div class="sidebar-health-grid">
      <div class="sidebar-health-row"><span>Created</span><strong>${escapeHtml(formatDateTime(selectedRun.createdAt))}</strong></div>
      <div class="sidebar-health-row"><span>Papers / people</span><strong>${escapeHtml(`${papers} / ${people}`)}</strong></div>
      <div class="sidebar-health-row"><span>Pending queue</span><strong>${escapeHtml(String(pendingCountForRun(selectedRun.id)))}</strong></div>
      <div class="sidebar-health-row"><span>Approved</span><strong>${escapeHtml(String(approvedCountForSelectedRun()))}</strong></div>
    </div>
  `;
}

function renderSidebarHealth() {
  const selectedRun = getSelectedRun();
  const reviewedCandidates = state.candidateDetails.filter((item) => {
    const status = candidateObject(item)?.status;
    return status && status !== "pending_review" && status !== "suppressed";
  }).length;

  elements.sidebarHealth.innerHTML = `
    <div class="sidebar-health-grid">
      <div class="sidebar-health-row"><span>Pending now</span><strong>${escapeHtml(String(allPendingCandidates().length))}</strong></div>
      <div class="sidebar-health-row"><span>Reviewed</span><strong>${escapeHtml(String(reviewedCandidates))}</strong></div>
      <div class="sidebar-health-row"><span>Approved entities</span><strong>${escapeHtml(String(state.approvedEntities.length))}</strong></div>
      <div class="sidebar-health-row"><span>Focused scope</span><strong>${escapeHtml(selectedRun ? selectedRun.id : "No run")}</strong></div>
    </div>
  `;
}

function renderOverviewMetrics() {
  const selectedRun = getSelectedRun();
  const { papers, people } = computeRecordCounts(state.sourceRecords);
  const metrics = [
    {
      label: "Source runs",
      value: String(state.sourceRuns.length),
      detail: "Real runs available for inspection.",
    },
    {
      label: "Focused run",
      value: selectedRun ? selectedRun.id : "No run",
      detail: selectedRun ? `${selectedRun.sourceName || "source"} · ${displayLabel(selectedRun.status || "unknown")}` : "Pick a run from Runs.",
    },
    {
      label: "Records in run",
      value: String(state.sourceRecords.length),
      detail: "All records currently loaded into the explorer.",
    },
    {
      label: "Papers",
      value: String(papers),
      detail: "Research works inside the focused run.",
    },
    {
      label: "Researchers",
      value: String(people),
      detail: "Person or profile records inside the focused run.",
    },
    {
      label: "Pending review",
      value: String(selectedRun ? pendingCountForRun(selectedRun.id) : allPendingCandidates().length),
      detail: selectedRun ? "Pending merge candidates in the focused run." : "Pending candidates across all runs.",
    },
  ];

  elements.overviewMetrics.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${escapeHtml(metric.detail)}</small>
        </article>
      `,
    )
    .join("");
}

function renderOverviewRunsAttention() {
  if (!state.sourceRuns.length) {
    elements.overviewRunsAttention.innerHTML = `<p class="empty-state">No source runs found.</p>`;
    return;
  }

  const previewRuns = sortRunsForReview(state.sourceRuns).slice(0, 6);
  elements.overviewRunsAttention.innerHTML = previewRuns
    .map(
      (run) => `
        <article class="preview-item">
          <button type="button" class="preview-item-button" data-open-run="${escapeHtml(run.id)}">
            <div class="preview-item-head">
              <h4 class="preview-item-title">${escapeHtml(run.id)}</h4>
              ${renderPill(displayLabel(run.status || "unknown"), getStatusVariant(run.status || "pending"))}
            </div>
            <p class="preview-item-meta">${escapeHtml(run.sourceName || "source")} · ${escapeHtml(run.sourceDomain || "domain")} · ${escapeHtml(run.pipelineName || "pipeline")}</p>
            <div class="summary-line">
              <span class="preview-item-meta">${escapeHtml(formatDateTime(run.createdAt))}</span>
              <span class="preview-item-meta">${escapeHtml(`${numberValue(run.sourceRecordCount)} records · ${pendingCountForRun(run.id)} pending`)}</span>
            </div>
          </button>
        </article>
      `,
    )
    .join("");
}

function renderOverviewQueuePreview() {
  const previewItems = allPendingCandidates()
    .slice()
    .sort((left, right) => timestampValue(candidateObject(right)?.updatedAt) - timestampValue(candidateObject(left)?.updatedAt))
    .slice(0, 6);

  if (!previewItems.length) {
    elements.overviewQueuePreview.innerHTML = `<p class="empty-state">No pending merge candidates right now.</p>`;
    return;
  }

  elements.overviewQueuePreview.innerHTML = previewItems
    .map((item) => {
      const candidate = candidateObject(item);
      const reasons = arrayValue(candidate.reasonCodes).map(displayLabel).join(", ") || "Source overlap";
      return `
        <article class="preview-item">
          <button
            type="button"
            class="preview-item-button"
            data-open-candidate="${escapeHtml(candidate.id)}"
            data-open-run="${escapeHtml(candidate.createdFromSourceRunId || "")}"
          >
            <div class="preview-item-head">
              <h4 class="preview-item-title">${escapeHtml(candidate.displayName || "Unnamed candidate")}</h4>
              ${renderPill(displayLabel(candidate.strength || "weak"), getStrengthVariant(candidate.strength || "weak"))}
            </div>
            <p class="preview-item-meta">${escapeHtml(reasons)}</p>
            <div class="summary-line">
              <span class="preview-item-meta">${escapeHtml(candidate.createdFromSourceRunId || "No run")}</span>
              <span class="preview-item-meta">${escapeHtml(`${arrayValue(item.evidence).length} evidence · ${arrayValue(item.sourceRecords).length} records`)}</span>
            </div>
          </button>
        </article>
      `;
    })
    .join("");
}

function renderOverviewApprovedPreview() {
  const previewEntities = state.approvedEntities
    .slice()
    .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt))
    .slice(0, 5);

  if (!previewEntities.length) {
    elements.overviewApprovedPreview.innerHTML = `<p class="empty-state">No approved researchers yet.</p>`;
    return;
  }

  elements.overviewApprovedPreview.innerHTML = previewEntities
    .map(
      (entity) => `
        <article class="preview-item">
          <button type="button" class="preview-item-button" data-open-approved="${escapeHtml(entity.id)}">
            <div class="preview-item-head">
              <h4 class="preview-item-title">${escapeHtml(entity.displayName || entity.id)}</h4>
              ${renderPill("Approved", "approved")}
            </div>
            <p class="preview-item-meta">${escapeHtml(renderListPreview(entity.institutions, 2))}</p>
            <div class="summary-line">
              <span class="preview-item-meta">${escapeHtml(renderListPreview(entity.emails, 1))}</span>
              <span class="preview-item-meta">${escapeHtml(formatDateTime(entity.createdAt))}</span>
            </div>
          </button>
        </article>
      `,
    )
    .join("");
}

function renderOverviewActions() {
  const selectedRun = getSelectedRun();
  const actions = [
    {
      route: "queue",
      title: "Review merge queue",
      count: `${selectedRun ? pendingCountForRun(selectedRun.id) : allPendingCandidates().length} pending`,
      copy: "Move straight into the candidates that still need operator judgment.",
    },
    {
      route: "runs",
      title: "Inspect focused run",
      count: `${state.sourceRecords.length} records`,
      copy: "Review paper and researcher records before making merge decisions.",
    },
    {
      route: "approved",
      title: "Audit approved entities",
      count: `${approvedCountForSelectedRun()} in scope`,
      copy: "Inspect the clean survivors that will feed outbound and enrichment.",
    },
    {
      route: "utilities",
      title: "Create or upload run",
      count: "Manual ops",
      copy: "Use the operational tools only when you need to create a run or replay source data.",
    },
  ];

  elements.overviewActions.innerHTML = actions
    .map(
      (action) => `
        <article class="action-card">
          <div class="action-card-head">
            <h4>${escapeHtml(action.title)}</h4>
            ${renderPill(action.count, "neutral")}
          </div>
          <p>${escapeHtml(action.copy)}</p>
          <button type="button" class="action-card-button" data-route="${escapeHtml(action.route)}">
            <span class="row-primary">Open ${escapeHtml(displayLabel(action.route))}</span>
            <span class="row-secondary">Go to ${escapeHtml(action.route)} page</span>
          </button>
        </article>
      `,
    )
    .join("");
}

function renderOverviewPage() {
  renderOverviewMetrics();
  renderOverviewRunsAttention();
  renderOverviewQueuePreview();
  renderOverviewApprovedPreview();
  renderOverviewActions();
}

function renderRunsList() {
  if (!state.sourceRuns.length) {
    elements.runsRunList.innerHTML = `<p class="empty-state">No source runs found.</p>`;
    return;
  }

  elements.runsRunList.innerHTML = state.sourceRuns
    .map((run) => {
      const selectedClass = run.id === state.selectedRunId ? "is-selected" : "";
      return `
        <article class="run-item ${selectedClass}">
          <button type="button" class="run-item-button" data-run-id="${escapeHtml(run.id)}">
            <div class="run-item-top">
              <strong class="run-item-name">${escapeHtml(run.id)}</strong>
              ${renderPill(displayLabel(run.status || "unknown"), getStatusVariant(run.status || "pending"))}
            </div>
            <div class="run-item-meta">
              <span>${escapeHtml(run.sourceName || "source")} · ${escapeHtml(run.sourceDomain || "domain")}</span>
              <span>${escapeHtml(formatDateTime(run.createdAt))}</span>
            </div>
            <div class="run-item-meta">
              <span>${escapeHtml(`${numberValue(run.sourceRecordCount)} records`)}</span>
              <span>${escapeHtml(`${pendingCountForRun(run.id)} pending`)}</span>
            </div>
          </button>
        </article>
      `;
    })
    .join("");
}

function renderRunSummary() {
  const selectedRun = getSelectedRun();
  elements.completeRunButton.disabled = !selectedRun;

  if (!selectedRun) {
    elements.runsRunSummary.textContent = "Select a source run to inspect papers, people, and merge state.";
    return;
  }

  const { papers, people } = computeRecordCounts(state.sourceRecords);
  elements.runsRunSummary.innerHTML = `
    <div class="summary-pills">
      ${renderPill(displayLabel(selectedRun.sourceName || "source"), "neutral")}
      ${renderPill(displayLabel(selectedRun.sourceDomain || "domain"), "neutral")}
      ${renderPill(displayLabel(selectedRun.status || "unknown"), getStatusVariant(selectedRun.status || "pending"))}
    </div>
    <div class="summary-meta">
      <div class="summary-meta-item">
        <span class="summary-meta-label">Run</span>
        <strong class="summary-meta-value">${escapeHtml(selectedRun.id)}</strong>
      </div>
      <div class="summary-meta-item">
        <span class="summary-meta-label">Created</span>
        <strong class="summary-meta-value">${escapeHtml(formatDateTime(selectedRun.createdAt))}</strong>
      </div>
      <div class="summary-meta-item">
        <span class="summary-meta-label">Papers / people</span>
        <strong class="summary-meta-value">${escapeHtml(`${papers} / ${people}`)}</strong>
      </div>
      <div class="summary-meta-item">
        <span class="summary-meta-label">Pending / reviewed</span>
        <strong class="summary-meta-value">${escapeHtml(`${pendingCountForRun(selectedRun.id)} / ${reviewedCountForRun(selectedRun.id)}`)}</strong>
      </div>
    </div>
  `;
}

function syncRecordTypeOptions() {
  const availableTypes = [...new Set(state.sourceRecords.map((record) => stringValue(record.entityType)).filter(Boolean))].sort();
  const options = ["all", ...availableTypes];
  elements.recordTypeFilter.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option)}">${escapeHtml(option === "all" ? "All" : displayLabel(option))}</option>`,
    )
    .join("");
  if (!options.includes(state.filters.recordType)) {
    state.filters.recordType = "all";
  }
  elements.recordTypeFilter.value = state.filters.recordType;
}

function renderRecordsTable() {
  const tbody = elements.runRecordTableBody;
  const selectedRun = getSelectedRun();

  elements.recordSort.value = state.filters.recordSort;
  elements.recordSearch.value = state.filters.recordSearch;
  syncRecordTypeOptions();

  if (!selectedRun) {
    tbody.innerHTML = renderEmptyTableRow(5, "No run selected.");
    return;
  }

  const records = filteredRunRecords();
  ensureSelectedRecord();

  if (!records.length) {
    tbody.innerHTML = renderEmptyTableRow(5, "No records match the current filter.");
    return;
  }

  tbody.innerHTML = records
    .map((record) => {
      const selectedClass = record.id === state.selectedRecordId ? "is-selected" : "";
      const metric = recordMetricLabel(record);
      return `
        <tr class="${selectedClass}">
          <td>
            <button type="button" class="row-button" data-record-id="${escapeHtml(record.id)}">
              <span class="row-primary">${escapeHtml(recordTitle(record))}</span>
              <span class="row-secondary">${escapeHtml(record.sourceNativeId || record.id)}</span>
            </button>
          </td>
          <td>${escapeHtml(displayLabel(record.entityType || "unknown"))}</td>
          <td>
            <span class="row-primary">${escapeHtml(recordSubtitle(record))}</span>
            <span class="row-secondary">${escapeHtml(displayLabel(stringValue(record.source) || "unknown source"))}</span>
          </td>
          <td>
            <span class="row-primary">${escapeHtml(recordIdentifier(record))}</span>
            <span class="row-secondary">${escapeHtml(`${metric.label}: ${metric.value}`)}</span>
          </td>
          <td>${escapeHtml(record.source || "unknown")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderRecordDetail() {
  const record = getSelectedRecord();
  if (!record) {
    elements.recordDetail.innerHTML = `<p class="detail-empty">Select a record to inspect paper metadata or researcher profile evidence.</p>`;
    return;
  }

  const metric = recordMetricLabel(record);
  const fields = [
    ["Entity type", record.entityType || "unknown"],
    ["Source", record.source || "unknown"],
    ["Source native ID", record.sourceNativeId || "—"],
    ["Institution / venue", recordSubtitle(record)],
    ["Primary identifier", recordIdentifier(record)],
    [metric.label, metric.value],
  ];

  elements.recordDetail.innerHTML = `
    <section class="detail-section">
      <h4>${escapeHtml(recordTitle(record))}</h4>
      <p class="summary-muted">${escapeHtml(record.sourceRunId || state.selectedRunId)}</p>
      <div class="badge-row">
        ${renderPill(displayLabel(record.entityType || "unknown"), "neutral")}
        ${renderPill(displayLabel(record.source || "source"), "neutral")}
      </div>
    </section>
    <section class="detail-section">
      <table class="detail-table">
        <tbody>
          ${fields
            .map(
              ([label, value]) => `
                <tr>
                  <th scope="row">${escapeHtml(label)}</th>
                  <td>${escapeHtml(String(value))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </section>
    <section class="detail-section">
      <div class="detail-grid">
        <div class="detail-card">
          <span>Display fields</span>
          <strong>${escapeHtml(renderListPreview(Object.values(record.display ?? {}).filter(Boolean), 3))}</strong>
        </div>
        <div class="detail-card">
          <span>Structured summary</span>
          <strong>${escapeHtml(renderListPreview(Object.values(record.rawSummary ?? {}).filter(Boolean), 3))}</strong>
        </div>
      </div>
    </section>
    <details class="response-box">
      <summary>Structured payload</summary>
      <pre>${escapeHtml(JSON.stringify({ display: record.display, rawSummary: record.rawSummary }, null, 2))}</pre>
    </details>
    <details class="response-box">
      <summary>Raw payload</summary>
      <pre>${escapeHtml(JSON.stringify(record.raw ?? {}, null, 2))}</pre>
    </details>
  `;
}

function renderRunsPage() {
  renderRunsList();
  renderRunSummary();
  renderRecordsTable();
  renderRecordDetail();
}

function setReviewControls(item) {
  const candidate = candidateObject(item);
  const hasCandidate = Boolean(candidate?.id);
  const isSingleton = hasCandidate && arrayValue(candidate.sourceRecordIds).length === 1;
  const primaryLabel = isSingleton ? "Approve entity" : "Approve merge";

  elements.dedupCandidateId.value = candidate?.id || "";
  elements.reviewSubmitButton.disabled = !hasCandidate;
  elements.approveSamePersonButton.disabled = !hasCandidate;
  elements.approveNotSamePersonButton.disabled = !hasCandidate;
  elements.approveUnsureButton.disabled = !hasCandidate;
  elements.reviewLabelSamePersonOption.textContent = primaryLabel;
  elements.approveSamePersonButton.textContent = primaryLabel;
}

function renderQueueSummary() {
  const selectedRun = getSelectedRun();

  elements.queueStatusFilter.value = state.filters.queueStatus;
  if (!selectedRun) {
    elements.queueScope.textContent = "Select a focused run from Runs or Overview to scope the queue.";
    elements.queueSummary.textContent = "Choose a source run to review merge candidates.";
    return;
  }

  const pending = pendingCountForRun(selectedRun.id);
  const reviewed = reviewedCountForRun(selectedRun.id);
  elements.queueScope.textContent = `Focused run: ${selectedRun.id}`;
  elements.queueSummary.innerHTML = `
    <div class="summary-meta">
      <div class="summary-meta-item">
        <span class="summary-meta-label">Pending</span>
        <strong class="summary-meta-value">${escapeHtml(String(pending))}</strong>
      </div>
      <div class="summary-meta-item">
        <span class="summary-meta-label">Reviewed</span>
        <strong class="summary-meta-value">${escapeHtml(String(reviewed))}</strong>
      </div>
      <div class="summary-meta-item">
        <span class="summary-meta-label">Mode</span>
        <strong class="summary-meta-value">${escapeHtml(displayLabel(state.filters.queueStatus))}</strong>
      </div>
      <div class="summary-meta-item">
        <span class="summary-meta-label">Approved</span>
        <strong class="summary-meta-value">${escapeHtml(String(approvedCountForSelectedRun()))}</strong>
      </div>
    </div>
  `;
}

function renderCandidatesTable() {
  const tbody = elements.candidateTableBody;
  const selectedRun = getSelectedRun();

  if (!selectedRun) {
    tbody.innerHTML = renderEmptyTableRow(5, "No run selected.");
    setReviewControls(null);
    return;
  }

  const items = filteredCandidateDetails();
  ensureSelectedCandidate();

  if (!items.length) {
    const fallbackRun = state.sourceRuns.find(
      (run) => run.id !== state.selectedRunId && pendingCountForRun(run.id) > 0,
    );
    const actionHtml = fallbackRun
      ? ` <button type="button" class="button-muted" data-jump-run="${escapeHtml(fallbackRun.id)}">Open ${escapeHtml(fallbackRun.id)}</button>`
      : "";
    const message =
      state.filters.queueStatus === "pending_review"
        ? "No pending candidates for this run."
        : state.filters.queueStatus === "reviewed"
          ? "No reviewed candidates for this run."
          : "No candidates found for this run.";
    tbody.innerHTML = renderEmptyTableRow(5, message, actionHtml);
    setReviewControls(null);
    return;
  }

  tbody.innerHTML = items
    .map((item) => {
      const candidate = candidateObject(item);
      const selectedClass = candidate.id === state.selectedCandidateId ? "is-selected" : "";
      return `
        <tr class="${selectedClass}">
          <td>
            <button type="button" class="row-button" data-candidate-id="${escapeHtml(candidate.id)}">
              <span class="row-primary">${escapeHtml(candidate.displayName || "Unnamed candidate")}</span>
              <span class="row-secondary">${escapeHtml(candidate.id)}</span>
            </button>
          </td>
          <td><div class="badge-row">${renderReasonChips(candidate.reasonCodes)}</div></td>
          <td>${escapeHtml(String(arrayValue(item.evidence).length))}</td>
          <td>${escapeHtml(String(arrayValue(item.sourceRecords).length))}</td>
          <td>
            ${renderPill(displayLabel(candidate.strength || "weak"), getStrengthVariant(candidate.strength || "weak"))}
            <div class="row-secondary row-secondary--tight">${escapeHtml(displayLabel(candidate.status || "pending_review"))}</div>
          </td>
        </tr>
      `;
    })
    .join("");

  setReviewControls(getSelectedCandidateItem());
}

function renderCandidateDetail() {
  const item = getSelectedCandidateItem();
  if (!item) {
    elements.candidateDetail.innerHTML = `<p class="detail-empty">Select a candidate to compare source records and evidence.</p>`;
    return;
  }

  const candidate = candidateObject(item);
  const sourceRecords = arrayValue(item.sourceRecords);
  const evidence = arrayValue(item.evidence);
  const evidencePreview = evidence.slice(0, 12);
  const reasonSummary = arrayValue(candidate.reasonCodes).map(displayLabel).join(", ") || "Source overlap";

  elements.candidateDetail.innerHTML = `
    <section class="detail-section">
      <div class="summary-line">
        <div>
          <h4>${escapeHtml(candidate.displayName || "Unnamed candidate")}</h4>
          <p class="summary-muted">Generated because these source records overlap on ${escapeHtml(reasonSummary)}.</p>
        </div>
        <div class="badge-row">
          ${renderPill(displayLabel(candidate.status || "pending_review"), getLabelVariant(candidate.status || "pending_review"))}
          ${renderPill(displayLabel(candidate.strength || "weak"), getStrengthVariant(candidate.strength || "weak"))}
        </div>
      </div>
      <div class="detail-grid candidate-stats">
        <div class="detail-card">
          <span>Source records</span>
          <strong>${escapeHtml(String(sourceRecords.length))}</strong>
        </div>
        <div class="detail-card">
          <span>Evidence items</span>
          <strong>${escapeHtml(String(evidence.length))}</strong>
        </div>
      </div>
      <div class="badge-row">${renderReasonChips(candidate.reasonCodes)}</div>
    </section>
    <section class="detail-section">
      <h4>Source comparison</h4>
      <div class="compare-grid">
        ${sourceRecords
          .map(
            (record) => `
              <article class="compare-card">
                <p class="compare-source">${escapeHtml(displayLabel(record.source || "unknown source"))}</p>
                <h5>${escapeHtml(recordTitle(record))}</h5>
                <dl class="compare-meta">
                  <div>
                    <dt>Institution / venue</dt>
                    <dd>${escapeHtml(recordSubtitle(record))}</dd>
                  </div>
                  <div>
                    <dt>Identifier</dt>
                    <dd>${escapeHtml(recordIdentifier(record))}</dd>
                  </div>
                </dl>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
    <section class="detail-section">
      <h4>Evidence ledger</h4>
      <div class="evidence-list">
        ${evidencePreview
          .map(
            (entry) => `
              <article class="evidence-item">
                <div class="evidence-main">
                  <span class="evidence-type">${escapeHtml(displayLabel(entry.evidenceType || "unknown"))}</span>
                  <strong>${escapeHtml(entry.normalizedValue || entry.rawValue || "—")}</strong>
                </div>
                <div class="evidence-sub">
                  <span>${escapeHtml(displayLabel(entry.quality || "unknown quality"))}</span>
                  <span>${escapeHtml(entry.extractedFrom?.sourcePath || "unknown path")}</span>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
    <details class="response-box">
      <summary>Raw candidate payload</summary>
      <pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>
    </details>
  `;
}

function renderQueuePage() {
  renderQueueSummary();
  renderCandidatesTable();
  renderCandidateDetail();
}

function renderApprovedTable() {
  const tbody = elements.approvedTableBody;
  const entities = filteredApprovedEntities();

  elements.approvedScopeFilter.value = state.filters.approvedScope;
  elements.approvedSearch.value = state.filters.approvedSearch;
  ensureSelectedApprovedEntity();

  if (!entities.length) {
    tbody.innerHTML = renderEmptyTableRow(
      6,
      state.filters.approvedScope === "all"
        ? "No approved entities found."
        : "No approved entities for the focused run yet.",
    );
    return;
  }

  tbody.innerHTML = entities
    .map((entity) => {
      const selectedClass = entity.id === state.selectedApprovedEntityId ? "is-selected" : "";
      return `
        <tr class="${selectedClass}">
          <td>
            <button type="button" class="row-button" data-approved-id="${escapeHtml(entity.id)}">
              <span class="row-primary">${escapeHtml(entity.displayName || entity.id)}</span>
              <span class="row-secondary">${escapeHtml(entity.entityType || "entity")}</span>
            </button>
          </td>
          <td>${escapeHtml(renderListPreview(entity.emails, 1))}</td>
          <td>${escapeHtml(renderListPreview(entity.homepages, 1))}</td>
          <td>${escapeHtml(renderListPreview(entity.institutions, 2))}</td>
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
    elements.approvedDetail.innerHTML = `<p class="detail-empty">Select an approved entity to inspect surviving contact fields.</p>`;
    return;
  }

  elements.approvedDetail.innerHTML = `
    <section class="detail-section">
      <h4>${escapeHtml(entity.displayName || entity.id)}</h4>
      <div class="badge-row">
        ${renderPill("Approved", "approved")}
        ${renderPill(displayLabel(entity.entityType || "entity"), "neutral")}
        ${renderPill(`${arrayValue(entity.sourceRecordIds).length} source records`, "neutral")}
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-grid">
        <div class="detail-card">
          <span>Emails</span>
          <strong>${escapeHtml(renderListPreview(entity.emails, 3))}</strong>
        </div>
        <div class="detail-card">
          <span>Homepages</span>
          <strong>${escapeHtml(renderListPreview(entity.homepages, 2))}</strong>
        </div>
        <div class="detail-card">
          <span>GitHub</span>
          <strong>${escapeHtml(renderListPreview(entity.githubUrls, 2))}</strong>
        </div>
        <div class="detail-card">
          <span>ORCID</span>
          <strong>${escapeHtml(renderListPreview(entity.orcids, 2))}</strong>
        </div>
      </div>
    </section>
    <section class="detail-section">
      <h4>Institutions</h4>
      <ul class="list-inline">
        ${arrayValue(entity.institutions).map((institution) => `<li>${escapeHtml(institution)}</li>`).join("") || "<li>None</li>"}
      </ul>
    </section>
    <details class="response-box">
      <summary>Approved payload</summary>
      <pre>${escapeHtml(JSON.stringify(entity, null, 2))}</pre>
    </details>
  `;
}

function renderApprovedPage() {
  renderApprovedTable();
  renderApprovedDetail();
}

function updateUploadCurlPreview() {
  try {
    const body = buildUploadBody();
    const apiBaseUrl = getApiBaseUrl() || "$SOURCING_API_BASE_URL";
    const url = joinUrl(apiBaseUrl, elements.uploadEndpoint.value.trim());
    elements.uploadCurl.textContent = buildCurl(url, body);
  } catch (error) {
    elements.uploadCurl.textContent = error.message;
  }
}

function renderApp() {
  ensureSelectedRecord();
  ensureSelectedCandidate();
  ensureSelectedApprovedEntity();
  syncRouteChrome();
  renderFocusedRunCard();
  renderSidebarHealth();
  renderOverviewPage();
  renderRunsPage();
  renderQueuePage();
  renderApprovedPage();
  updateUploadCurlPreview();
}

async function handleFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv") {
    const records = csvToSourceRecords(text);
    elements.jsonlInput.value = records.map((record) => JSON.stringify(record)).join("\n");
  } else {
    elements.jsonlInput.value = text;
  }

  updateUploadCurlPreview();
}

async function createSourceRun() {
  const body = buildSourceRunBody();

  try {
    if (!body.sourceName || !body.sourceDomain || !body.pipelineName) {
      throw new Error("Source, domain, and pipeline are required.");
    }
    renderJson(elements.sourceRunResult, "Creating source run...");
    const result = await requestJson("/source-runs", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const runId = result?.data?.id || result?.id || result?.runId;
    if (runId) {
      elements.runId.value = runId;
      await refreshAll(runId);
      setRoute("runs");
    }
    setConnectionStatus("Source run created", "ready");
    renderJson(elements.sourceRunResult, result ?? { ok: true });
  } catch (error) {
    setConnectionStatus("Source run failed", "error");
    renderJson(elements.sourceRunResult, {
      error: error.message,
      curl: buildCurl(joinUrl(getApiBaseUrl() || "$SOURCING_API_BASE_URL", "/source-runs"), body),
    });
  }
}

async function uploadRecords() {
  try {
    if (!elements.runId.value.trim()) {
      throw new Error("Set source run ID first. Create it before uploading records.");
    }

    const endpoint = elements.uploadEndpoint.value.trim();
    const body = buildUploadBody();
    renderJson(elements.uploadResult, "Uploading...");
    updateUploadCurlPreview();
    const result = await requestJson(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setConnectionStatus("Upload API reachable", "ready");
    renderJson(elements.uploadResult, result ?? { ok: true });
    await refreshAll(elements.runId.value.trim());
    setRoute("runs");
  } catch (error) {
    setConnectionStatus("Upload failed", "error");
    renderJson(elements.uploadResult, error.message);
    updateUploadCurlPreview();
  }
}

async function completeSelectedRun() {
  const selectedRun = getSelectedRun();
  if (!selectedRun) {
    return;
  }

  try {
    renderJson(elements.sourceRunResult, "Completing source run...");
    const result = await requestJson(`/source-runs/${encodeURIComponent(selectedRun.id)}/complete`, {
      method: "POST",
    });
    renderJson(elements.sourceRunResult, result ?? { ok: true });
    setConnectionStatus("Source run completed", "ready");
    await refreshAll(selectedRun.id);
  } catch (error) {
    setConnectionStatus("Run completion failed", "error");
    renderJson(elements.sourceRunResult, { error: error.message });
  }
}

async function checkHealth() {
  await requestJson("/health");
}

async function refreshSourceRuns(preferredRunId = "") {
  const payload = await requestJson("/source-runs?limit=50");
  state.sourceRuns = sortRunsForReview(normalizeListPayload(payload));
  state.selectedRunId = chooseRunId(state.sourceRuns, preferredRunId || state.selectedRunId || elements.runId.value.trim());
  elements.runId.value = state.selectedRunId || elements.runId.value;
}

async function refreshRunRecords() {
  const runId = state.selectedRunId;
  if (!runId) {
    state.sourceRecords = [];
    state.selectedRecordId = "";
    renderApp();
    return;
  }

  const payload = await requestJson(`/source-runs/${encodeURIComponent(runId)}/source-records?limit=500`);
  state.sourceRecords = normalizeListPayload(payload);
  renderApp();
}

async function refreshCandidateDetails() {
  const payload = await requestJson("/dedup-candidates?include=details");
  state.candidateDetails = normalizeListPayload(payload);
  renderApp();
}

async function refreshApprovedEntities() {
  const payload = await requestJson("/approved-entities");
  state.approvedEntities = normalizeListPayload(payload);
  renderApp();
}

async function refreshAll(preferredRunId = "") {
  try {
    setConnectionStatus("Refreshing sourcing console...", "idle");
    await checkHealth();
    await refreshSourceRuns(preferredRunId);
    await refreshRunRecords();
    await Promise.all([refreshCandidateDetails(), refreshApprovedEntities()]);
    setConnectionStatus("Sourcing console ready", "ready");
  } catch (error) {
    setConnectionStatus(`Refresh failed: ${error.message}`, "error");
  } finally {
    renderApp();
  }
}

async function selectRun(runId) {
  state.selectedRunId = runId;
  state.selectedRecordId = "";
  state.selectedCandidateId = "";
  if (runId) {
    elements.runId.value = runId;
  }
  await refreshRunRecords();
  renderApp();
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, getApiBaseUrl());
  renderApp();
}

async function submitReviewLabel(labelOverride = "") {
  const dedupCandidateId = elements.dedupCandidateId.value.trim();
  if (!dedupCandidateId) {
    throw new Error("Select a candidate first.");
  }

  const body = {
    dedupCandidateId,
    label: labelOverride || elements.reviewLabel.value,
    notes: elements.reviewNotes.value.trim(),
  };

  renderJson(elements.reviewResult, "Submitting review...");
  const result = await requestJson("/review-labels", {
    method: "POST",
    body: JSON.stringify(body),
  });
  renderJson(elements.reviewResult, result ?? { ok: true });
  elements.reviewNotes.value = "";
  await refreshAll(state.selectedRunId);
  return result;
}

function setRoute(route, updateHash = true) {
  const normalized = normalizeRoute(route);
  if (state.route === normalized && !updateHash) {
    renderApp();
    return;
  }
  state.route = normalized;
  if (updateHash) {
    const nextHash = `#${normalized}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
      return;
    }
  }
  renderApp();
}

async function openCandidate(runId, candidateId) {
  if (runId && runId !== state.selectedRunId) {
    await selectRun(runId);
  }
  state.selectedCandidateId = candidateId;
  setRoute("queue");
}

function openApproved(entityId) {
  state.selectedApprovedEntityId = entityId;
  setRoute("approved");
}

function bindDelegatedClicks() {
  document.addEventListener("click", (event) => {
    const candidateButton = event.target.closest("[data-open-candidate]");
    if (candidateButton) {
      const candidateId = candidateButton.getAttribute("data-open-candidate") || "";
      const runId = candidateButton.getAttribute("data-open-run") || "";
      void openCandidate(runId, candidateId);
      return;
    }

    const approvedButton = event.target.closest("[data-open-approved]");
    if (approvedButton) {
      openApproved(approvedButton.getAttribute("data-open-approved") || "");
      return;
    }

    const jumpRunButton = event.target.closest("[data-jump-run]");
    if (jumpRunButton) {
      const runId = jumpRunButton.getAttribute("data-jump-run") || "";
      void selectRun(runId);
      setRoute("queue");
      return;
    }

    const runButton = event.target.closest("[data-open-run], [data-run-id]");
    if (runButton) {
      const runId = runButton.getAttribute("data-open-run") || runButton.getAttribute("data-run-id") || "";
      void selectRun(runId);
      if (runButton.hasAttribute("data-open-run")) {
        setRoute("runs");
      }
      return;
    }

    const recordButton = event.target.closest("[data-record-id]");
    if (recordButton) {
      state.selectedRecordId = recordButton.getAttribute("data-record-id") || "";
      renderApp();
      return;
    }

    const candidateSelectButton = event.target.closest("[data-candidate-id]");
    if (candidateSelectButton) {
      state.selectedCandidateId = candidateSelectButton.getAttribute("data-candidate-id") || "";
      renderApp();
      return;
    }

    const approvedSelectButton = event.target.closest("[data-approved-id]");
    if (approvedSelectButton) {
      state.selectedApprovedEntityId = approvedSelectButton.getAttribute("data-approved-id") || "";
      renderApp();
      return;
    }

    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      setRoute(routeButton.getAttribute("data-route") || "overview");
    }
  });
}

function bindEvents() {
  bindDelegatedClicks();

  window.addEventListener("hashchange", () => {
    state.route = normalizeRoute(window.location.hash);
    renderApp();
  });

  elements.saveSettingsButton.addEventListener("click", () => {
    saveSettings();
    void refreshAll(state.selectedRunId);
  });

  elements.refreshAllButton.addEventListener("click", () => {
    void refreshAll(state.selectedRunId);
  });

  elements.refreshRunsButton.addEventListener("click", () => {
    void refreshAll(state.selectedRunId);
  });

  elements.completeRunButton.addEventListener("click", () => {
    void completeSelectedRun();
  });

  elements.recordTypeFilter.addEventListener("change", () => {
    state.filters.recordType = elements.recordTypeFilter.value;
    renderApp();
  });

  elements.recordSort.addEventListener("change", () => {
    state.filters.recordSort = elements.recordSort.value;
    renderApp();
  });

  elements.recordSearch.addEventListener("input", () => {
    state.filters.recordSearch = elements.recordSearch.value;
    renderApp();
  });

  elements.queueStatusFilter.addEventListener("change", () => {
    state.filters.queueStatus = elements.queueStatusFilter.value;
    renderApp();
  });

  elements.refreshCandidatesButton.addEventListener("click", () => {
    void refreshCandidateDetails();
  });

  elements.approvedScopeFilter.addEventListener("change", () => {
    state.filters.approvedScope = elements.approvedScopeFilter.value;
    renderApp();
  });

  elements.approvedSearch.addEventListener("input", () => {
    state.filters.approvedSearch = elements.approvedSearch.value;
    renderApp();
  });

  elements.refreshApprovedButton.addEventListener("click", () => {
    void refreshApprovedEntities();
  });

  elements.reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitReviewLabel();
      setConnectionStatus("Review submitted", "ready");
    } catch (error) {
      setConnectionStatus("Review submission failed", "error");
      renderJson(elements.reviewResult, { error: error.message });
    }
  });

  elements.approveSamePersonButton.addEventListener("click", async () => {
    try {
      await submitReviewLabel("same_person");
      setConnectionStatus("Review submitted", "ready");
    } catch (error) {
      setConnectionStatus("Review submission failed", "error");
      renderJson(elements.reviewResult, { error: error.message });
    }
  });

  elements.approveNotSamePersonButton.addEventListener("click", async () => {
    try {
      await submitReviewLabel("not_same_person");
      setConnectionStatus("Review submitted", "ready");
    } catch (error) {
      setConnectionStatus("Review submission failed", "error");
      renderJson(elements.reviewResult, { error: error.message });
    }
  });

  elements.approveUnsureButton.addEventListener("click", async () => {
    try {
      await submitReviewLabel("unsure");
      setConnectionStatus("Review submitted", "ready");
    } catch (error) {
      setConnectionStatus("Review submission failed", "error");
      renderJson(elements.reviewResult, { error: error.message });
    }
  });

  elements.apiBaseUrl.addEventListener("input", () => {
    renderApp();
  });

  elements.runId.addEventListener("input", () => {
    updateUploadCurlPreview();
  });

  elements.runId.addEventListener("change", () => {
    const requestedRunId = elements.runId.value.trim();
    if (requestedRunId) {
      void refreshAll(requestedRunId);
    }
  });

  elements.jsonlFile.addEventListener("change", handleFileSelection);
  elements.jsonlInput.addEventListener("input", updateUploadCurlPreview);
  elements.uploadEndpoint.addEventListener("input", updateUploadCurlPreview);
  elements.createRunButton.addEventListener("click", () => {
    void createSourceRun();
  });
  elements.uploadButton.addEventListener("click", () => {
    void uploadRecords();
  });
}

function boot() {
  elements.apiBaseUrl.value = localStorage.getItem(STORAGE_KEY) || "/api/sourcing";
  state.route = normalizeRoute(window.location.hash);
  state.filters.recordSort = elements.recordSort.value;
  state.filters.queueStatus = elements.queueStatusFilter.value;
  state.filters.approvedScope = elements.approvedScopeFilter.value;
  bindEvents();
  setReviewControls(null);
  renderApp();
  void refreshAll();
}

boot();

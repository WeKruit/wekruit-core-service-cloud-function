const STORAGE_KEY = "wekruit.sourcingReview.apiBaseUrl";

const state = {
  sourceRuns: [],
  sourceRecords: [],
  candidateDetails: [],
  approvedEntities: [],
  selectedRunId: "",
  selectedRecordId: "",
  selectedCandidateId: "",
  selectedApprovedEntityId: "",
  activeExplorerTab: "records",
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  refreshAllButton: document.querySelector("#refreshAllButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  apiBaseMetric: document.querySelector("#apiBaseMetric"),
  runMetric: document.querySelector("#runMetric"),
  paperMetric: document.querySelector("#paperMetric"),
  peopleMetric: document.querySelector("#peopleMetric"),
  candidateMetric: document.querySelector("#candidateMetric"),
  approvedMetric: document.querySelector("#approvedMetric"),
  refreshRunsButton: document.querySelector("#refreshRunsButton"),
  completeRunButton: document.querySelector("#completeRunButton"),
  sourceRunTableBody: document.querySelector("#sourceRunTableBody"),
  selectedRunSummary: document.querySelector("#selectedRunSummary"),
  recordTypeFilter: document.querySelector("#recordTypeFilter"),
  recordSort: document.querySelector("#recordSort"),
  recordSearch: document.querySelector("#recordSearch"),
  runRecordTableBody: document.querySelector("#runRecordTableBody"),
  recordDetail: document.querySelector("#recordDetail"),
  queueScope: document.querySelector("#queueScope"),
  candidateStatusFilter: document.querySelector("#candidateStatusFilter"),
  refreshCandidatesButton: document.querySelector("#refreshCandidatesButton"),
  candidateTableBody: document.querySelector("#candidateTableBody"),
  candidateDetail: document.querySelector("#candidateDetail"),
  recordsTabButton: document.querySelector("#recordsTabButton"),
  approvedTabButton: document.querySelector("#approvedTabButton"),
  recordsExplorer: document.querySelector("#recordsExplorer"),
  approvedExplorer: document.querySelector("#approvedExplorer"),
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
  approvedTableBody: document.querySelector("#approvedTableBody"),
  approvedDetail: document.querySelector("#approvedDetail"),
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
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
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

function setConnectionStatus(message, stateName = "idle") {
  elements.connectionStatus.textContent = message;
  document.body.dataset.connection = stateName;
}

function setMetric(target, value) {
  if (!target) {
    return;
  }
  target.textContent = value;
}

function setExplorerTab(tabName) {
  state.activeExplorerTab = tabName === "approved" ? "approved" : "records";

  const showingRecords = state.activeExplorerTab === "records";
  elements.recordsExplorer.hidden = !showingRecords;
  elements.approvedExplorer.hidden = showingRecords;
  elements.recordsExplorer.classList.toggle("is-active", showingRecords);
  elements.approvedExplorer.classList.toggle("is-active", !showingRecords);
  elements.recordsTabButton.classList.toggle("is-active", showingRecords);
  elements.approvedTabButton.classList.toggle("is-active", !showingRecords);
}

function compactObject(record) {
  return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== ""));
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

function filteredCandidateDetails() {
  const queueMode = elements.candidateStatusFilter.value;
  return state.candidateDetails
    .filter((item) => {
      const candidate = candidateObject(item);
      if (!candidate) {
        return false;
      }

      if (state.selectedRunId && candidate.createdFromSourceRunId !== state.selectedRunId) {
        return false;
      }

      if (queueMode === "pending_review") {
        return candidate.status === "pending_review";
      }

      if (queueMode === "reviewed") {
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

function getSelectedCandidateItem() {
  return filteredCandidateDetails().find((item) => candidateObject(item)?.id === state.selectedCandidateId) ?? null;
}

function filteredApprovedEntities() {
  if (elements.approvedScopeFilter.value === "all" || !state.selectedRunId) {
    return state.approvedEntities.slice();
  }

  const sourceRecordIds = new Set(state.sourceRecords.map((record) => record.id));
  return state.approvedEntities.filter((entity) =>
    arrayValue(entity.sourceRecordIds).some((sourceRecordId) => sourceRecordIds.has(sourceRecordId)),
  );
}

function getSelectedApprovedEntity() {
  return filteredApprovedEntities().find((entity) => entity.id === state.selectedApprovedEntityId) ?? null;
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
    const raw = Object.fromEntries(
      headers.map((header, headerIndex) => [header, values[headerIndex]?.trim() ?? ""]),
    );
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

function updateDashboard() {
  const selectedRun = getSelectedRun();
  const { papers, people } = computeRecordCounts(state.sourceRecords);
  setMetric(elements.apiBaseMetric, getApiBaseUrl() || "Not set");
  setMetric(elements.runMetric, selectedRun ? selectedRun.id : "No run");
  setMetric(elements.paperMetric, String(papers));
  setMetric(elements.peopleMetric, String(people));
  setMetric(elements.candidateMetric, String(filteredCandidateDetails().length));
  setMetric(elements.approvedMetric, String(filteredApprovedEntities().length));
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
  const requestedType = elements.recordTypeFilter.value;
  const query = elements.recordSearch.value.trim().toLowerCase();
  const sortMode = elements.recordSort.value;

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

function renderPill(content, variant = "neutral") {
  return `<span class="pill pill--${escapeHtml(variant)}">${escapeHtml(content)}</span>`;
}

function renderReasonChips(reasonCodes) {
  const items = arrayValue(reasonCodes);
  if (!items.length) {
    return renderPill("none", "neutral");
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

function syncRecordTypeOptions() {
  const availableTypes = [...new Set(state.sourceRecords.map((record) => stringValue(record.entityType)).filter(Boolean))].sort();
  const currentValue = elements.recordTypeFilter.value;
  const options = ["all", ...availableTypes];
  elements.recordTypeFilter.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option === "all" ? "All" : displayLabel(option))}</option>`)
    .join("");
  elements.recordTypeFilter.value = options.includes(currentValue) ? currentValue : "all";
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

function renderRunSummary() {
  const selectedRun = getSelectedRun();
  if (!selectedRun) {
    elements.selectedRunSummary.textContent = "Choose a run to inspect its papers, people, and merge queue.";
    return;
  }

  const { papers, people } = computeRecordCounts(state.sourceRecords);
  elements.selectedRunSummary.innerHTML = `
    <div class="summary-pills">
      ${renderPill(displayLabel(selectedRun.sourceName || "source"), "neutral")}
      ${renderPill(displayLabel(selectedRun.sourceDomain || "domain"), "neutral")}
      ${renderPill(displayLabel(selectedRun.status || "unknown"), `status-${selectedRun.status || "running"}`)}
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
        <span class="summary-meta-label">Pending / approved</span>
        <strong class="summary-meta-value">${escapeHtml(`${filteredCandidateDetails().length} / ${filteredApprovedEntities().length}`)}</strong>
      </div>
    </div>
  `;
}

function renderSourceRunsTable() {
  const container = elements.sourceRunTableBody;
  if (!state.sourceRuns.length) {
    container.innerHTML = `<p class="empty-state">No source runs found.</p>`;
    return;
  }

  container.innerHTML = state.sourceRuns
    .map((run) => {
      const selectedClass = run.id === state.selectedRunId ? "is-selected" : "";
      return `
        <article class="run-item ${selectedClass}">
          <button type="button" class="run-item-button" data-run-id="${escapeHtml(run.id)}">
            <div class="run-item-top">
              <strong class="run-item-name">${escapeHtml(run.id)}</strong>
              ${renderPill(displayLabel(run.status || "unknown"), `status-${run.status || "running"}`)}
            </div>
            <div class="run-item-meta">
              <span>${escapeHtml(run.sourceName || "source")} · ${escapeHtml(run.sourceDomain || "domain")}</span>
              <span>${escapeHtml(`${numberValue(run.sourceRecordCount)} records · ${numberValue(run.dedupCandidateCount)} queue`)}</span>
            </div>
            <div class="run-item-meta">
              <span>${escapeHtml(formatDateTime(run.createdAt))}</span>
              <span>${escapeHtml(run.pipelineName || "default")}</span>
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-run-id]").forEach((button) => {
    button.addEventListener("click", () => {
      void selectRun(button.getAttribute("data-run-id") || "");
    });
  });
}

function renderRecordsTable() {
  const tbody = elements.runRecordTableBody;
  const selectedRun = getSelectedRun();

  if (!selectedRun) {
    tbody.innerHTML = renderEmptyTableRow(5, "No run selected.");
    return;
  }

  syncRecordTypeOptions();
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

  tbody.querySelectorAll("[data-record-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRecordId = button.getAttribute("data-record-id") || "";
      renderRecordsTable();
      renderRecordDetail();
    });
  });
}

function renderRecordDetail() {
  const record = getSelectedRecord();
  if (!record) {
    elements.recordDetail.innerHTML = `<p class="detail-empty">Select a record to inspect its structured metadata.</p>`;
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
      <div class="badge-row detail-tags">
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
      <h4>Display / raw summary</h4>
      <details class="response-box">
        <summary>Structured payload</summary>
        <pre>${escapeHtml(JSON.stringify({ display: record.display, rawSummary: record.rawSummary }, null, 2))}</pre>
      </details>
      <details class="response-box">
        <summary>Raw payload</summary>
        <pre>${escapeHtml(JSON.stringify(record.raw ?? {}, null, 2))}</pre>
      </details>
    </section>
  `;
}

function alternateReviewRun() {
  return state.sourceRuns.find(
    (run) => run.id !== state.selectedRunId && numberValue(run.dedupCandidateCount) > 0,
  ) ?? null;
}

function renderCandidatesTable() {
  const tbody = elements.candidateTableBody;
  const items = filteredCandidateDetails();
  const queueMode = elements.candidateStatusFilter.value;
  const selectedRun = getSelectedRun();

  if (!selectedRun) {
    elements.queueScope.textContent = "Select a run to scope the queue.";
    tbody.innerHTML = renderEmptyTableRow(5, "No run selected.");
    setReviewControls(null);
    return;
  }

  elements.queueScope.textContent =
    queueMode === "all"
      ? `Showing all candidate states for ${selectedRun.id}.`
      : queueMode === "reviewed"
        ? `Showing reviewed candidates for ${selectedRun.id}.`
        : `Showing pending candidates for ${selectedRun.id}.`;

  ensureSelectedCandidate();

  if (!items.length) {
    const fallbackRun = queueMode === "pending_review" ? alternateReviewRun() : null;
    const actionHtml = fallbackRun
      ? ` <button type="button" class="button-muted" data-jump-run="${escapeHtml(fallbackRun.id)}">Open ${escapeHtml(fallbackRun.id)}</button>`
      : "";
    const message =
      queueMode === "pending_review"
        ? "No pending candidates for this run."
        : queueMode === "reviewed"
          ? "No reviewed candidates for this run."
          : "No candidates found for this run.";
    tbody.innerHTML = renderEmptyTableRow(5, message, actionHtml);
    tbody.querySelector("[data-jump-run]")?.addEventListener("click", () => {
      void selectRun(fallbackRun?.id || "");
    });
    setReviewControls(null);
    return;
  }

  tbody.innerHTML = items
    .map((item) => {
      const candidate = candidateObject(item);
      const selectedClass = candidate?.id === state.selectedCandidateId ? "is-selected" : "";
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
            ${renderPill(displayLabel(candidate.strength || "weak"), `strength-${candidate.strength || "weak"}`)}
            <div class="row-secondary row-secondary--tight">${escapeHtml(displayLabel(candidate.status || "pending_review"))}</div>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("[data-candidate-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCandidateId = button.getAttribute("data-candidate-id") || "";
      renderCandidatesTable();
      renderCandidateDetail();
    });
  });

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
  const evidencePreview = evidence.slice(0, 10);
  const reasonSummary = arrayValue(candidate.reasonCodes).map(displayLabel).join(", ") || "Source overlap";

  elements.candidateDetail.innerHTML = `
    <section class="detail-section">
      <div class="candidate-hero">
        <div>
          <h4>${escapeHtml(candidate.displayName || "Unnamed candidate")}</h4>
          <p class="summary-muted">This match was generated because the source records overlap on ${escapeHtml(reasonSummary)}.</p>
        </div>
        <div class="badge-row detail-tags">
          ${renderPill(displayLabel(candidate.status || "pending_review"), `label-${candidate.status || "pending_review"}`)}
          ${renderPill(displayLabel(candidate.strength || "weak"), `strength-${candidate.strength || "weak"}`)}
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
      <div class="badge-row detail-tags">${renderReasonChips(candidate.reasonCodes)}</div>
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

function setReviewControls(item) {
  const candidate = candidateObject(item);
  const hasCandidate = Boolean(candidate?.id);
  elements.dedupCandidateId.value = candidate?.id || "";
  elements.reviewSubmitButton.disabled = !hasCandidate;
  elements.approveSamePersonButton.disabled = !hasCandidate;
  elements.approveNotSamePersonButton.disabled = !hasCandidate;
  elements.approveUnsureButton.disabled = !hasCandidate;

  const isSingleton = hasCandidate && arrayValue(candidate.sourceRecordIds).length === 1;
  const primaryLabel = isSingleton ? "Approve entity" : "Approve merge";
  elements.approveSamePersonButton.textContent = isSingleton ? "Approve entity" : "Approve merge";
  elements.reviewLabelSamePersonOption.textContent = primaryLabel;
  if (!hasCandidate) {
    elements.reviewLabelSamePersonOption.textContent = "Approve merge";
    elements.approveSamePersonButton.textContent = "Approve merge";
  }
}

function renderApprovedTable() {
  const tbody = elements.approvedTableBody;
  const entities = filteredApprovedEntities()
    .slice()
    .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt));

  ensureSelectedApprovedEntity();

  if (!entities.length) {
    tbody.innerHTML = renderEmptyTableRow(
      6,
      elements.approvedScopeFilter.value === "all"
        ? "No approved entities found."
        : "No approved entities for this run yet.",
    );
    elements.approvedDetail.innerHTML = `<p class="detail-empty">Select an approved entity to inspect surviving contact fields.</p>`;
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

  tbody.querySelectorAll("[data-approved-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedApprovedEntityId = button.getAttribute("data-approved-id") || "";
      renderApprovedTable();
      renderApprovedDetail();
    });
  });
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
      <div class="badge-row detail-tags">
        ${renderPill("approved", "approved")}
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
        ${arrayValue(entity.institutions)
          .map((institution) => `<li>${escapeHtml(institution)}</li>`)
          .join("") || "<li>None</li>"}
      </ul>
    </section>
    <details class="response-box">
      <summary>Approved payload</summary>
      <pre>${escapeHtml(JSON.stringify(entity, null, 2))}</pre>
    </details>
  `;
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
      await refreshSourceRuns(runId);
    }
    setConnectionStatus("Source run created", "ready");
    renderJson(elements.sourceRunResult, result ?? { ok: true });
    updateUploadCurlPreview();
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
      throw new Error("Set source run ID first. Create it with POST /source-runs.");
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
    await refreshSourceRuns(selectedRun.id);
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
  if (state.selectedRunId) {
    elements.runId.value = state.selectedRunId;
  }
  renderSourceRunsTable();
  await refreshRunRecords();
  renderRunSummary();
}

async function refreshRunRecords() {
  const runId = state.selectedRunId;
  if (!runId) {
    state.sourceRecords = [];
    state.selectedRecordId = "";
    renderRecordsTable();
    renderRecordDetail();
    renderApprovedTable();
    renderApprovedDetail();
    updateDashboard();
    return;
  }

  const payload = await requestJson(`/source-runs/${encodeURIComponent(runId)}/source-records?limit=500`);
  state.sourceRecords = normalizeListPayload(payload);
  ensureSelectedRecord();
  renderRecordsTable();
  renderRecordDetail();
  renderApprovedTable();
  renderApprovedDetail();
  updateDashboard();
}

async function refreshCandidateDetails() {
  const payload = await requestJson("/dedup-candidates?include=details");
  state.candidateDetails = normalizeListPayload(payload);
  ensureSelectedCandidate();
  renderRunSummary();
  renderCandidatesTable();
  renderCandidateDetail();
  updateDashboard();
}

async function refreshApprovedEntities() {
  const payload = await requestJson("/approved-entities");
  state.approvedEntities = normalizeListPayload(payload);
  ensureSelectedApprovedEntity();
  renderRunSummary();
  renderApprovedTable();
  renderApprovedDetail();
  updateDashboard();
}

async function refreshAll(preferredRunId = "") {
  try {
    setConnectionStatus("Refreshing review console...", "idle");
    await checkHealth();
    setConnectionStatus("API reachable", "ready");
    await refreshSourceRuns(preferredRunId);
    await Promise.all([refreshCandidateDetails(), refreshApprovedEntities()]);
    setConnectionStatus("Review console ready", "ready");
  } catch (error) {
    setConnectionStatus(`Refresh failed: ${error.message}`, "error");
    updateDashboard();
  }
}

async function selectRun(runId) {
  state.selectedRunId = runId;
  state.selectedRecordId = "";
  state.selectedCandidateId = "";
  if (runId) {
    elements.runId.value = runId;
  }
  renderSourceRunsTable();
  await refreshRunRecords();
  renderRunSummary();
  renderCandidatesTable();
  renderCandidateDetail();
  renderApprovedTable();
  renderApprovedDetail();
  updateDashboard();
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, getApiBaseUrl());
  updateDashboard();
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
  await Promise.all([refreshCandidateDetails(), refreshApprovedEntities(), refreshSourceRuns(state.selectedRunId)]);
  return result;
}

function bindEvents() {
  elements.recordsTabButton.addEventListener("click", () => {
    setExplorerTab("records");
  });

  elements.approvedTabButton.addEventListener("click", () => {
    setExplorerTab("approved");
  });

  elements.saveSettingsButton.addEventListener("click", () => {
    saveSettings();
    void refreshAll(state.selectedRunId);
  });

  elements.refreshAllButton.addEventListener("click", () => {
    void refreshAll(state.selectedRunId);
  });

  elements.refreshRunsButton.addEventListener("click", () => {
    void refreshSourceRuns(state.selectedRunId);
  });

  elements.completeRunButton.addEventListener("click", () => {
    void completeSelectedRun();
  });

  elements.recordTypeFilter.addEventListener("change", () => {
    renderRecordsTable();
    renderRecordDetail();
    updateDashboard();
  });

  elements.recordSort.addEventListener("change", () => {
    renderRecordsTable();
    renderRecordDetail();
  });

  elements.recordSearch.addEventListener("input", () => {
    renderRecordsTable();
    renderRecordDetail();
  });

  elements.candidateStatusFilter.addEventListener("change", () => {
    renderRunSummary();
    renderCandidatesTable();
    renderCandidateDetail();
    updateDashboard();
  });

  elements.approvedScopeFilter.addEventListener("change", () => {
    renderRunSummary();
    renderApprovedTable();
    renderApprovedDetail();
    updateDashboard();
  });

  elements.refreshCandidatesButton.addEventListener("click", () => {
    void refreshCandidateDetails();
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
    updateUploadCurlPreview();
    updateDashboard();
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
  updateUploadCurlPreview();
  bindEvents();
  setExplorerTab(state.activeExplorerTab);
  setReviewControls(null);
  updateDashboard();
  void refreshAll();
}

boot();

const STORAGE_KEY = "wekruit.sourcingReview.apiBaseUrl";

const state = {
  sourceRuns: [],
  sourceRecords: [],
  pendingCandidates: [],
  approvedEntities: [],
  selectedRunId: "",
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  apiBaseMetric: document.querySelector("#apiBaseMetric"),
  runMetric: document.querySelector("#runMetric"),
  paperMetric: document.querySelector("#paperMetric"),
  peopleMetric: document.querySelector("#peopleMetric"),
  candidateMetric: document.querySelector("#candidateMetric"),
  approvedMetric: document.querySelector("#approvedMetric"),
  refreshRunsButton: document.querySelector("#refreshRunsButton"),
  sourceRunList: document.querySelector("#sourceRunList"),
  selectedRunSummary: document.querySelector("#selectedRunSummary"),
  recordTypeFilter: document.querySelector("#recordTypeFilter"),
  recordSearch: document.querySelector("#recordSearch"),
  runRecordList: document.querySelector("#runRecordList"),
  queueScope: document.querySelector("#queueScope"),
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
  refreshCandidatesButton: document.querySelector("#refreshCandidatesButton"),
  candidateList: document.querySelector("#candidateList"),
  reviewForm: document.querySelector("#reviewForm"),
  dedupCandidateId: document.querySelector("#dedupCandidateId"),
  reviewLabel: document.querySelector("#reviewLabel"),
  reviewNotes: document.querySelector("#reviewNotes"),
  reviewResult: document.querySelector("#reviewResult"),
  refreshApprovedButton: document.querySelector("#refreshApprovedButton"),
  approvedList: document.querySelector("#approvedList"),
};

function getApiBaseUrl() {
  return elements.apiBaseUrl.value.trim().replace(/\/$/, "");
}

function getSelectedRun() {
  return state.sourceRuns.find((run) => run.id === state.selectedRunId) ?? null;
}

function setConnectionStatus(message, stateName = "idle") {
  elements.connectionStatus.textContent = message;
  document.body.dataset.connection = stateName;
}

function setMetric(target, value) {
  target.textContent = value;
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  if (Array.isArray(payload?.dedupCandidates)) {
    return payload.dedupCandidates;
  }
  if (Array.isArray(payload?.approvedEntities)) {
    return payload.approvedEntities;
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

function sortRunsForReview(runs) {
  return runs
    .slice()
    .sort((left, right) => {
      const candidateDelta = Number(right.dedupCandidateCount || 0) - Number(left.dedupCandidateCount || 0);
      if (candidateDelta !== 0) {
        return candidateDelta;
      }

      const recordDelta = Number(right.sourceRecordCount || 0) - Number(left.sourceRecordCount || 0);
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

  const reviewRun = runs.find((run) => Number(run.dedupCandidateCount || 0) > 0);
  if (reviewRun) {
    return reviewRun.id;
  }

  return runs[0]?.id || "";
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

function formatDateTime(value) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function compactObject(record) {
  return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== ""));
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
    const sourceNativeId = pickFirst(raw, [
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
    const url = pickFirst(raw, ["github_url", "member_github", "html_url", "blog", "website", "member_website", "project_url"]);

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

function filteredRunRecords() {
  const type = elements.recordTypeFilter.value;
  const query = elements.recordSearch.value.trim().toLowerCase();

  return state.sourceRecords.filter((record) => {
    if (type !== "all" && record.entityType !== type) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      record.displayName,
      record.display?.name,
      record.display?.title,
      record.display?.venue,
      record.institution,
      record.rawSummary?.doi,
      record.rawSummary?.venue,
      record.rawSummary?.orcid,
      record.sourceNativeId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function selectedRunCandidates() {
  return state.pendingCandidates.filter((item) => {
    const candidate = item.candidate || item;
    if (!state.selectedRunId) {
      return true;
    }
    return candidate.createdFromSourceRunId === state.selectedRunId;
  });
}

function computeRecordCounts(records) {
  return {
    papers: records.filter((record) => record.entityType === "research_work").length,
    people: records.filter((record) => record.entityType === "person_profile").length,
  };
}

function updateDashboard() {
  const selectedRun = getSelectedRun();
  const { papers, people } = computeRecordCounts(state.sourceRecords);
  setMetric(elements.apiBaseMetric, getApiBaseUrl() || "Not set");
  setMetric(elements.runMetric, selectedRun ? selectedRun.id : "No run");
  setMetric(elements.paperMetric, String(papers));
  setMetric(elements.peopleMetric, String(people));
  setMetric(elements.candidateMetric, String(selectedRunCandidates().length));
  setMetric(elements.approvedMetric, String(state.approvedEntities.length));
}

function renderSourceRunCards() {
  const container = elements.sourceRunList;
  container.innerHTML = "";
  container.classList.toggle("empty", state.sourceRuns.length === 0);

  if (state.sourceRuns.length === 0) {
    container.textContent = "No source runs found.";
    return;
  }

  for (const run of state.sourceRuns) {
    const card = document.createElement("article");
    card.className = `run-list-card${run.id === state.selectedRunId ? " selected" : ""}`;
    card.innerHTML = `
      <div class="run-list-header">
        <div>
          <p class="run-list-title">${escapeHtml(run.sourceName || "source")}</p>
          <p class="candidate-subtitle">${escapeHtml(run.id)}</p>
        </div>
        <div class="run-meta">
          <span class="pill">${escapeHtml(run.status || "unknown")}</span>
          <span class="pill pill-soft">${escapeHtml(run.pipelineName || "default")}</span>
        </div>
      </div>
      <p class="run-card-subtitle">${escapeHtml(run.sourceDomain || "unknown domain")} · ${escapeHtml(formatDateTime(run.createdAt))}</p>
      <div class="run-stats">
        ${renderSummaryItem("records", run.sourceRecordCount ?? 0)}
        ${renderSummaryItem("evidence", run.evidenceCount ?? 0)}
        ${renderSummaryItem("dedup", run.dedupCandidateCount ?? 0)}
        ${renderSummaryItem("trigger", run.trigger || "unknown")}
      </div>
    `;
    card.addEventListener("click", () => {
      void selectRun(run.id);
    });
    container.append(card);
  }
}

function renderSummaryItem(label, value) {
  return `
    <div class="summary-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function renderRunSummary() {
  const selectedRun = getSelectedRun();
  const container = elements.selectedRunSummary;

  if (!selectedRun) {
    container.className = "run-summary empty-summary";
    container.textContent = "Choose a run to inspect its papers and people.";
    return;
  }

  const counts = computeRecordCounts(state.sourceRecords);
  container.className = "run-summary";
  container.innerHTML = `
    <div class="run-list-header">
      <div>
        <p class="run-list-title">${escapeHtml(selectedRun.sourceName || "source")} · ${escapeHtml(selectedRun.sourceDomain || "domain")}</p>
        <p class="candidate-subtitle">${escapeHtml(selectedRun.id)}</p>
      </div>
      <div class="chip-row">
        <span class="pill">${escapeHtml(selectedRun.status || "unknown")}</span>
        <span class="pill pill-soft">${escapeHtml(formatDateTime(selectedRun.createdAt))}</span>
      </div>
    </div>
    <div class="summary-grid">
      ${renderSummaryItem("pipeline", selectedRun.pipelineName || "default")}
      ${renderSummaryItem("papers", counts.papers)}
      ${renderSummaryItem("people", counts.people)}
      ${renderSummaryItem("pending dedup", selectedRunCandidates().length)}
    </div>
  `;
}

function renderFieldBox(label, value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return `
    <div class="field-box">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function recordSortValue(record) {
  if (record.entityType === "research_work") {
    return Number(record.rawSummary?.citedByCount || 0);
  }
  return 0;
}

function renderRunRecords() {
  const container = elements.runRecordList;
  const selectedRun = getSelectedRun();

  if (!selectedRun) {
    container.classList.add("empty");
    container.textContent = "No run selected.";
    return;
  }

  const records = filteredRunRecords()
    .slice()
    .sort((left, right) => {
      if (left.entityType !== right.entityType) {
        return left.entityType === "research_work" ? -1 : 1;
      }
      if (left.entityType === "research_work") {
        return recordSortValue(right) - recordSortValue(left);
      }
      return (left.displayName || "").localeCompare(right.displayName || "");
    });

  container.innerHTML = "";
  container.classList.toggle("empty", records.length === 0);

  if (records.length === 0) {
    container.textContent = "No records match the current filter.";
    return;
  }

  for (const record of records) {
    const title = record.display?.title || record.display?.name || record.displayName || record.sourceNativeId || record.id;
    const subtitle = [record.source, record.entityType, record.display?.venue || record.institution].filter(Boolean).join(" · ");
    const recordBody =
      record.entityType === "research_work"
        ? `
          <div class="record-grid">
            ${renderFieldBox("Publication date", record.rawSummary?.publicationDate || "Unknown")}
            ${renderFieldBox("Venue", record.rawSummary?.venue || record.display?.venue || "Unknown")}
            ${renderFieldBox("Cited by", record.rawSummary?.citedByCount ?? 0)}
            ${renderFieldBox("DOI", record.rawSummary?.doi || "Missing")}
          </div>
        `
        : `
          <div class="record-grid">
            ${renderFieldBox("Institution", record.institution || record.display?.institution || "Unknown")}
            ${renderFieldBox("ORCID", record.rawSummary?.orcid || "Missing")}
            ${renderFieldBox("Email count", record.rawSummary?.emailCount ?? 0)}
            ${renderFieldBox("Homepage count", record.rawSummary?.homepageCount ?? 0)}
          </div>
        `;

    const card = document.createElement("article");
    card.className = "record-card";
    card.innerHTML = `
      <div class="record-card-header">
        <div>
          <h4 class="record-title">${escapeHtml(title || "Untitled record")}</h4>
          <p class="record-meta">${escapeHtml(subtitle || "No summary")}</p>
        </div>
        <div class="chip-row">
          <span class="tag">${escapeHtml(record.source || "source")}</span>
          <span class="tag">${escapeHtml(record.entityType || "record")}</span>
        </div>
      </div>
      <div class="record-body">
        ${recordBody}
      </div>
    `;
    container.append(card);
  }
}

function renderEvidenceList(evidence) {
  if (!evidence.length) {
    return `<p class="empty-copy">No extracted evidence attached.</p>`;
  }

  return `
    <ul class="evidence-list">
      ${evidence
        .map(
          (entry) => `
            <li>
              <span class="evidence-type">${escapeHtml(entry.evidenceType || "evidence")}</span>
              <strong>${escapeHtml(entry.normalizedValue || entry.rawValue || "unknown")}</strong>
              <small>${escapeHtml(entry.quality || "unknown")} quality · ${escapeHtml(entry.extractedFrom?.sourcePath || "unknown path")}</small>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderSourceRecordList(records) {
  if (!records.length) {
    return `<p class="empty-copy">No source records attached.</p>`;
  }

  return `
    <ul class="record-list">
      ${records
        .map((record) => {
          const title = record.displayName || record.display?.name || record.display?.title || record.sourceNativeId || record.id;
          const subtitle = [record.sourceName || record.source, record.institution || record.display?.institution, record.entityType]
            .filter(Boolean)
            .join(" · ");
          return `
            <li>
              <strong>${escapeHtml(title || "Unnamed record")}</strong>
              <small>${escapeHtml(subtitle || "No summary")}</small>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderCandidateCards() {
  const container = elements.candidateList;
  const items = selectedRunCandidates();
  const selectedRun = getSelectedRun();
  elements.queueScope.textContent = selectedRun
    ? `Showing pending candidates for ${selectedRun.id}.`
    : "Showing pending candidates across all runs.";
  container.innerHTML = "";
  container.classList.toggle("empty", items.length === 0);

  if (items.length === 0) {
    container.innerHTML = "";

    if (selectedRun) {
      const fallbackRun = state.sourceRuns.find(
        (run) => run.id !== selectedRun.id && Number(run.dedupCandidateCount || 0) > 0,
      );

      if (fallbackRun) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.innerHTML = `
          <p>No pending dedup candidates for <strong>${escapeHtml(selectedRun.id)}</strong>.</p>
          <p class="empty-copy">There are still ${escapeHtml(String(fallbackRun.dedupCandidateCount || 0))} candidates waiting in ${escapeHtml(fallbackRun.id)}.</p>
          <button type="button" data-open-run="${escapeHtml(fallbackRun.id)}">Open review run</button>
        `;
        emptyState.querySelector("[data-open-run]")?.addEventListener("click", () => {
          void selectRun(fallbackRun.id);
        });
        container.append(emptyState);
        updateDashboard();
        return;
      }
    }

    container.textContent = selectedRun
      ? "No pending dedup candidates for this run."
      : "No pending dedup candidates.";
    updateDashboard();
    return;
  }

  for (const item of items) {
    const candidate = item.candidate || item;
    const id = candidate.id || candidate.dedupCandidateId || "unknown-id";
    const reasons = Array.isArray(candidate.reasonCodes) ? candidate.reasonCodes : [];
    const evidence = Array.isArray(item.evidence) ? item.evidence : [];
    const sourceRecords = Array.isArray(item.sourceRecords) ? item.sourceRecords : [];
    const card = document.createElement("article");
    card.className = "candidate-card";
    card.innerHTML = `
      <div class="candidate-header">
        <div>
          <p class="candidate-title">${escapeHtml(candidate.displayName || sourceRecords[0]?.displayName || "Unnamed candidate")}</p>
          <p class="candidate-subtitle">${escapeHtml(id)}</p>
        </div>
        <div class="candidate-tags">
          <span class="pill">${escapeHtml(candidate.status || "pending_review")}</span>
          <span class="pill pill-soft">${escapeHtml(candidate.strength || "unknown")} strength</span>
        </div>
      </div>
      <div class="reason-row">
        ${reasons.length ? reasons.map((reason) => `<span class="reason-chip">${escapeHtml(reason)}</span>`).join("") : '<span class="reason-chip">no reason codes</span>'}
      </div>
      <section class="candidate-section">
        <h4>Why we think these may be the same person</h4>
        ${renderEvidenceList(evidence)}
      </section>
      <section class="candidate-section">
        <h4>Source records in this merge group</h4>
        ${renderSourceRecordList(sourceRecords)}
      </section>
      <div class="candidate-actions">
        <button type="button" data-select-candidate="${escapeHtml(id)}">Review this candidate</button>
      </div>
      <details class="response-box">
        <summary>Raw payload</summary>
        <pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>
      </details>
    `;
    card.querySelector("[data-select-candidate]")?.addEventListener("click", () => {
      elements.dedupCandidateId.value = id;
      elements.reviewNotes.focus();
    });
    container.append(card);
  }

  updateDashboard();
}

function renderApprovedField(label, values) {
  const rendered = Array.isArray(values) && values.length
    ? values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")
    : "<li>None</li>";
  return `
    <section class="approved-field">
      <h4>${escapeHtml(label)}</h4>
      <ul>${rendered}</ul>
    </section>
  `;
}

function renderApprovedCards() {
  const container = elements.approvedList;
  container.innerHTML = "";
  container.classList.toggle("empty", state.approvedEntities.length === 0);

  if (state.approvedEntities.length === 0) {
    container.textContent = "No approved entities found.";
    updateDashboard();
    return;
  }

  for (const entity of state.approvedEntities) {
    const card = document.createElement("article");
    card.className = "approved-card";
    card.innerHTML = `
      <div class="approved-card-header">
        <div>
          <p class="candidate-title">${escapeHtml(entity.displayName || entity.id || "Approved entity")}</p>
          <p class="candidate-subtitle">${escapeHtml(entity.id || "unknown-id")}</p>
        </div>
        <div class="candidate-tags">
          <span class="pill">${escapeHtml(entity.entityType || "entity")}</span>
          <span class="pill pill-soft">${escapeHtml(String(entity.sourceRecordIds?.length || 0))} records</span>
        </div>
      </div>
      <div class="approved-grid">
        ${renderApprovedField("Emails", entity.emails)}
        ${renderApprovedField("Homepages", entity.homepages)}
        ${renderApprovedField("GitHub", entity.githubUrls)}
        ${renderApprovedField("ORCID", entity.orcids)}
        ${renderApprovedField("Institutions", entity.institutions)}
      </div>
    `;
    container.append(card);
  }

  updateDashboard();
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
    updateUploadCurlPreview();
    renderJson(elements.uploadResult, "Uploading...");
    const result = await requestJson(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setConnectionStatus("Upload API reachable", "ready");
    renderJson(elements.uploadResult, result ?? { ok: true });
    await Promise.all([
      refreshSourceRuns(elements.runId.value.trim()),
      refreshCandidates(),
    ]);
  } catch (error) {
    setConnectionStatus("Upload failed; curl fallback ready", "error");
    renderJson(elements.uploadResult, error.message);
    updateUploadCurlPreview();
  }
}

async function selectRun(runId) {
  state.selectedRunId = runId || "";
  if (state.selectedRunId) {
    elements.runId.value = state.selectedRunId;
  }
  renderSourceRunCards();
  renderRunSummary();
  renderCandidateCards();
  updateDashboard();
  await refreshRunRecords();
}

async function refreshSourceRuns(preferredRunId = "") {
  try {
    elements.sourceRunList.classList.add("empty");
    elements.sourceRunList.textContent = "Loading source runs...";
    const payload = await requestJson("/source-runs?limit=25");
    state.sourceRuns = sortRunsForReview(normalizeListPayload(payload));
    const preferred = preferredRunId || state.selectedRunId || elements.runId.value.trim();
    const nextRunId = chooseRunId(state.sourceRuns, preferred);
    setConnectionStatus("Source runs loaded", "ready");
    await selectRun(nextRunId);
  } catch (error) {
    setConnectionStatus("Source runs failed", "error");
    elements.sourceRunList.classList.add("empty");
    elements.sourceRunList.textContent = error.message;
  }
}

async function refreshRunRecords() {
  const runId = state.selectedRunId;
  if (!runId) {
    state.sourceRecords = [];
    renderRunSummary();
    renderRunRecords();
    updateDashboard();
    return;
  }

  try {
    elements.runRecordList.classList.add("empty");
    elements.runRecordList.textContent = "Loading run records...";
    const payload = await requestJson(`/source-runs/${encodeURIComponent(runId)}/source-records?limit=250`);
    state.sourceRecords = normalizeListPayload(payload);
    renderRunSummary();
    renderRunRecords();
    updateDashboard();
  } catch (error) {
    elements.runRecordList.classList.add("empty");
    elements.runRecordList.textContent = error.message;
  }
}

async function refreshCandidates() {
  try {
    elements.candidateList.classList.add("empty");
    elements.candidateList.textContent = "Loading pending candidates...";
    const payload = await requestJson("/dedup-candidates?status=pending_review&include=details");
    state.pendingCandidates = normalizeListPayload(payload);
    setConnectionStatus("Review API reachable", "ready");
    renderCandidateCards();
  } catch (error) {
    setConnectionStatus("Review queue failed", "error");
    elements.candidateList.classList.add("empty");
    elements.candidateList.textContent = error.message;
    updateDashboard();
  }
}

async function submitReview(event) {
  event.preventDefault();
  const body = {
    dedupCandidateId: elements.dedupCandidateId.value.trim(),
    label: elements.reviewLabel.value,
    notes: elements.reviewNotes.value.trim(),
  };

  try {
    renderJson(elements.reviewResult, "Submitting review...");
    const result = await requestJson("/review-labels", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setConnectionStatus("Review label submitted", "ready");
    renderJson(elements.reviewResult, result ?? { ok: true });
    await Promise.all([refreshCandidates(), refreshApprovedEntities(), refreshSourceRuns(state.selectedRunId)]);
  } catch (error) {
    setConnectionStatus("Review submission failed", "error");
    renderJson(elements.reviewResult, {
      error: error.message,
      curl: buildCurl(joinUrl(getApiBaseUrl() || "$SOURCING_API_BASE_URL", "/review-labels"), body),
    });
  }
}

async function refreshApprovedEntities() {
  try {
    elements.approvedList.classList.add("empty");
    elements.approvedList.textContent = "Loading approved entities...";
    const payload = await requestJson("/approved-entities");
    state.approvedEntities = normalizeListPayload(payload);
    setConnectionStatus("Approved entities API reachable", "ready");
    renderApprovedCards();
  } catch (error) {
    setConnectionStatus("Approved entities failed", "error");
    elements.approvedList.classList.add("empty");
    elements.approvedList.textContent = error.message;
    updateDashboard();
  }
}

async function checkHealth() {
  try {
    await requestJson("/health");
    setConnectionStatus("API reachable", "ready");
  } catch (error) {
    setConnectionStatus(`API check failed: ${error.message}`, "error");
    throw error;
  }
}

function saveSettings() {
  const apiBaseUrl = getApiBaseUrl();
  localStorage.setItem(STORAGE_KEY, apiBaseUrl);
  setConnectionStatus(apiBaseUrl ? "API base saved" : "API base missing", apiBaseUrl ? "ready" : "idle");
  updateDashboard();
}

function boot() {
  elements.apiBaseUrl.value = localStorage.getItem(STORAGE_KEY) || "/api/sourcing";
  updateUploadCurlPreview();
  updateDashboard();
  setConnectionStatus(elements.apiBaseUrl.value ? "API base loaded" : "API base missing", elements.apiBaseUrl.value ? "ready" : "idle");

  elements.saveSettingsButton.addEventListener("click", saveSettings);
  elements.apiBaseUrl.addEventListener("input", () => {
    updateUploadCurlPreview();
    updateDashboard();
  });
  elements.runId.addEventListener("input", () => {
    updateUploadCurlPreview();
    updateDashboard();
  });
  elements.runId.addEventListener("change", () => {
    const requestedRunId = elements.runId.value.trim();
    if (requestedRunId && requestedRunId !== state.selectedRunId) {
      void refreshSourceRuns(requestedRunId);
    }
  });
  elements.jsonlInput.addEventListener("input", updateUploadCurlPreview);
  elements.uploadEndpoint.addEventListener("input", updateUploadCurlPreview);
  elements.jsonlFile.addEventListener("change", handleFileSelection);
  elements.createRunButton.addEventListener("click", createSourceRun);
  elements.uploadButton.addEventListener("click", uploadRecords);
  elements.refreshRunsButton.addEventListener("click", () => {
    void refreshSourceRuns(state.selectedRunId);
  });
  elements.recordTypeFilter.addEventListener("change", renderRunRecords);
  elements.recordSearch.addEventListener("input", renderRunRecords);
  elements.refreshCandidatesButton.addEventListener("click", () => {
    void refreshCandidates();
  });
  elements.reviewForm.addEventListener("submit", submitReview);
  elements.refreshApprovedButton.addEventListener("click", () => {
    void refreshApprovedEntities();
  });

  checkHealth()
    .then(async () => {
      await refreshSourceRuns();
      await Promise.all([refreshCandidates(), refreshApprovedEntities()]);
    })
    .catch(() => {
      updateDashboard();
    });
}

boot();

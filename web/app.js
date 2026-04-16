const STORAGE_KEY = "wekruit.sourcingReview.apiBaseUrl";

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  apiBaseMetric: document.querySelector("#apiBaseMetric"),
  runMetric: document.querySelector("#runMetric"),
  recordMetric: document.querySelector("#recordMetric"),
  candidateMetric: document.querySelector("#candidateMetric"),
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

function setConnectionStatus(message, state = "idle") {
  elements.connectionStatus.textContent = message;
  document.body.dataset.connection = state;
}

function setMetric(target, value) {
  target.textContent = value;
}

function updateDashboard() {
  setMetric(elements.apiBaseMetric, getApiBaseUrl() || "Not set");
  setMetric(elements.runMetric, elements.runId.value.trim() || "No run");

  try {
    setMetric(elements.recordMetric, String(parseJsonl(elements.jsonlInput.value).length));
  } catch {
    setMetric(elements.recordMetric, "Invalid");
  }
}

function saveSettings() {
  const apiBaseUrl = getApiBaseUrl();
  localStorage.setItem(STORAGE_KEY, apiBaseUrl);
  setConnectionStatus(apiBaseUrl ? "API base saved" : "API base missing", apiBaseUrl ? "ready" : "idle");
  updateDashboard();
}

function joinUrl(base, path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
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

function buildUploadBody() {
  const records = parseJsonl(elements.jsonlInput.value);
  return {
    runId: elements.runId.value.trim(),
    records,
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

function renderJson(target, value) {
  target.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function buildCurl(url, body) {
  const escapedBody = JSON.stringify(body, null, 2).replace(/'/g, "'\\''");
  return `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  --data '${escapedBody}'`;
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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
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
  updateDashboard();
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

function pickFirst(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function compactObject(record) {
  return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== ""));
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
    updateDashboard();
    await refreshCandidates();
  } catch (error) {
    setConnectionStatus("Upload failed; curl fallback ready", "error");
    renderJson(elements.uploadResult, error.message);
    updateUploadCurlPreview();
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
      updateUploadCurlPreview();
      updateDashboard();
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
              <small>${escapeHtml(entry.quality || "unknown")} quality</small>
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
          const subtitle = [record.sourceName, record.institution || record.display?.institution, record.entityType]
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

function renderCandidateCards(container, items, emptyText) {
  container.innerHTML = "";
  container.classList.toggle("empty", items.length === 0);
  setMetric(elements.candidateMetric, String(items.length));

  if (items.length === 0) {
    container.textContent = emptyText;
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
}

function renderApprovedCards(container, items, emptyText) {
  container.innerHTML = "";
  container.classList.toggle("empty", items.length === 0);

  if (items.length === 0) {
    container.textContent = emptyText;
    return;
  }

  for (const entity of items) {
    const card = document.createElement("article");
    card.className = "approved-card";
    card.innerHTML = `
      <div class="candidate-header">
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function refreshCandidates() {
  try {
    elements.candidateList.textContent = "Loading pending candidates...";
    const payload = await requestJson("/dedup-candidates?status=pending_review&include=details");
    const items = normalizeListPayload(payload);
    setConnectionStatus("Review API reachable", "ready");
    renderCandidateCards(elements.candidateList, items, "No pending dedup candidates.");
  } catch (error) {
    setConnectionStatus("Review queue failed", "error");
    elements.candidateList.classList.add("empty");
    elements.candidateList.textContent = error.message;
    setMetric(elements.candidateMetric, "0");
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
    await Promise.all([refreshCandidates(), refreshApprovedEntities()]);
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
    elements.approvedList.textContent = "Loading approved entities...";
    const payload = await requestJson("/approved-entities");
    const items = normalizeListPayload(payload);
    setConnectionStatus("Approved entities API reachable", "ready");
    renderApprovedCards(elements.approvedList, items, "No approved entities found.");
  } catch (error) {
    setConnectionStatus("Approved entities failed", "error");
    elements.approvedList.classList.add("empty");
    elements.approvedList.textContent = error.message;
  }
}

async function checkHealth() {
  try {
    await requestJson("/health");
    setConnectionStatus("API reachable", "ready");
  } catch (error) {
    setConnectionStatus(`API check failed: ${error.message}`, "error");
  }
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
  elements.jsonlInput.addEventListener("input", () => {
    updateUploadCurlPreview();
    updateDashboard();
  });
  elements.createRunButton.addEventListener("click", createSourceRun);
  elements.uploadEndpoint.addEventListener("input", updateUploadCurlPreview);
  elements.jsonlFile.addEventListener("change", handleFileSelection);
  elements.uploadButton.addEventListener("click", uploadRecords);
  elements.refreshCandidatesButton.addEventListener("click", refreshCandidates);
  elements.reviewForm.addEventListener("submit", submitReview);
  elements.refreshApprovedButton.addEventListener("click", refreshApprovedEntities);

  checkHealth().then(() => Promise.all([refreshCandidates(), refreshApprovedEntities()])).catch(() => {
    setMetric(elements.candidateMetric, "0");
  });
}

boot();

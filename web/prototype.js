const STORAGE_KEY = "wekruit.sourcingPrototype.apiBaseUrl";

const state = {
  view: "queue",
  runs: [],
  candidates: [],
  approved: [],
  selectedRunId: "",
  selectedCandidateId: "",
  selectedApprovedId: "",
  search: "",
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  refreshButton: document.querySelector("#refreshButton"),
  runsTableBody: document.querySelector("#runsTableBody"),
  runSummary: document.querySelector("#runSummary"),
  tabQueue: document.querySelector("#tabQueue"),
  tabApproved: document.querySelector("#tabApproved"),
  runFilter: document.querySelector("#runFilter"),
  searchInput: document.querySelector("#searchInput"),
  queueMeta: document.querySelector("#queueMeta"),
  queueView: document.querySelector("#queueView"),
  approvedView: document.querySelector("#approvedView"),
  queueTableBody: document.querySelector("#queueTableBody"),
  approvedTableBody: document.querySelector("#approvedTableBody"),
  detailEyebrow: document.querySelector("#detailEyebrow"),
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  detailBody: document.querySelector("#detailBody"),
  detailActions: document.querySelector("#detailActions"),
};

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
  const cleanBase = stringValue(base).replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
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

function candidateObject(item) {
  return item?.candidate ?? item ?? null;
}

function currentApiBaseUrl() {
  return elements.apiBaseUrl.value.trim().replace(/\/$/, "");
}

async function requestJson(path) {
  const response = await fetch(joinUrl(currentApiBaseUrl(), path), {
    headers: { "Content-Type": "application/json" },
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }

  return payload;
}

function sortRuns(runs) {
  return runs
    .slice()
    .sort((left, right) => {
      const pendingDelta = numberValue(right.dedupCandidateCount) - numberValue(left.dedupCandidateCount);
      if (pendingDelta !== 0) {
        return pendingDelta;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

function chooseSelectedRun() {
  if (!state.runs.length) {
    state.selectedRunId = "";
    return;
  }

  if (state.runs.some((run) => run.id === state.selectedRunId)) {
    return;
  }

  const withPending = state.runs.find((run) => numberValue(run.dedupCandidateCount) > 0);
  state.selectedRunId = withPending?.id || state.runs[0].id;
}

function getSelectedRun() {
  return state.runs.find((run) => run.id === state.selectedRunId) ?? null;
}

function runCandidates() {
  return state.candidates
    .filter((item) => {
      const candidate = candidateObject(item);
      if (!candidate || candidate.status !== "pending_review") {
        return false;
      }
      if (state.selectedRunId && candidate.createdFromSourceRunId !== state.selectedRunId) {
        return false;
      }
      if (!state.search) {
        return true;
      }
      const haystack = [
        stringValue(candidate.displayName),
        ...arrayValue(candidate.reasonCodes).map(displayLabel),
        ...arrayValue(item.sourceRecords).map((record) => stringValue(record.displayName || record.display?.name || record.display?.title)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(state.search);
    })
    .sort((left, right) => {
      const leftCandidate = candidateObject(left);
      const rightCandidate = candidateObject(right);
      return numberValue(arrayValue(right.evidence).length) - numberValue(arrayValue(left.evidence).length) ||
        (new Date(rightCandidate?.updatedAt || 0).getTime() - new Date(leftCandidate?.updatedAt || 0).getTime());
    });
}

function filteredApproved() {
  return state.approved.filter((entity) => {
    if (!state.search) {
      return true;
    }

    const haystack = [
      stringValue(entity.displayName),
      ...arrayValue(entity.emails),
      ...arrayValue(entity.homepages),
      ...arrayValue(entity.institutions),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.search);
  });
}

function getSelectedCandidateItem() {
  return runCandidates().find((item) => candidateObject(item)?.id === state.selectedCandidateId) ?? null;
}

function getSelectedApprovedEntity() {
  return filteredApproved().find((entity) => entity.id === state.selectedApprovedId) ?? null;
}

function ensureSelectedRows() {
  const candidateItems = runCandidates();
  if (!candidateItems.some((item) => candidateObject(item)?.id === state.selectedCandidateId)) {
    state.selectedCandidateId = candidateObject(candidateItems[0])?.id || "";
  }

  const approvedItems = filteredApproved();
  if (!approvedItems.some((entity) => entity.id === state.selectedApprovedId)) {
    state.selectedApprovedId = approvedItems[0]?.id || "";
  }
}

function renderPill(text, variant = "neutral") {
  return `<span class="pill pill--${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
}

function statusVariant(status) {
  if (status === "completed" || status === "approved") {
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

function renderRunsTable() {
  if (!state.runs.length) {
    elements.runsTableBody.innerHTML = `<tr><td colspan="6" class="empty-row">No jobs found.</td></tr>`;
    elements.runSummary.textContent = "No runs available.";
    return;
  }

  elements.runSummary.textContent = `${state.runs.length} runs loaded · ${runCandidates().length} pending review`;

  elements.runsTableBody.innerHTML = state.runs
    .map((run) => {
      const selectedClass = run.id === state.selectedRunId ? "is-selected" : "";
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
          <td>${escapeHtml(String(numberValue(run.dedupCandidateCount)))}</td>
          <td>${escapeHtml(formatDateTime(run.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderRunFilter() {
  const options = [
    `<option value="">All runs</option>`,
    ...state.runs.map((run) => `<option value="${escapeHtml(run.id)}">${escapeHtml(run.id)}</option>`),
  ];
  elements.runFilter.innerHTML = options.join("");
  elements.runFilter.value = state.selectedRunId;
}

function renderQueueTable() {
  const items = runCandidates();
  const selectedRun = getSelectedRun();
  elements.queueMeta.textContent = selectedRun
    ? `${items.length} pending candidates in ${selectedRun.id}`
    : `${items.length} pending candidates`;

  if (!items.length) {
    elements.queueTableBody.innerHTML = `<tr><td colspan="5" class="empty-row">No pending review items for this run.</td></tr>`;
    return;
  }

  elements.queueTableBody.innerHTML = items
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
          <td>${arrayValue(candidate.reasonCodes).map((reason) => renderPill(displayLabel(reason), "neutral")).join("")}</td>
          <td>${escapeHtml(String(arrayValue(item.evidence).length))}</td>
          <td>${escapeHtml(String(arrayValue(item.sourceRecords).length))}</td>
          <td>${renderPill(displayLabel(candidate.strength || "weak"), statusVariant(candidate.strength || "weak"))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderApprovedTable() {
  const entities = filteredApproved();
  elements.queueMeta.textContent = `${entities.length} approved entities`;

  if (!entities.length) {
    elements.approvedTableBody.innerHTML = `<tr><td colspan="5" class="empty-row">No approved entities found.</td></tr>`;
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
              <span class="row-secondary">${escapeHtml(entity.entityType || "entity")}</span>
            </button>
          </td>
          <td>${escapeHtml(arrayValue(entity.emails).slice(0, 1).join(", ") || "—")}</td>
          <td>${escapeHtml(arrayValue(entity.homepages).slice(0, 1).join(", ") || "—")}</td>
          <td>${escapeHtml(arrayValue(entity.institutions).slice(0, 2).join(", ") || "—")}</td>
          <td>${escapeHtml(formatDateTime(entity.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderQueueDetail() {
  const item = getSelectedCandidateItem();
  if (!item) {
    elements.detailEyebrow.textContent = "Selection";
    elements.detailTitle.textContent = "Nothing selected";
    elements.detailSubtitle.textContent = "Pick a queue row to inspect the relevant evidence.";
    elements.detailBody.innerHTML = `<p class="empty-detail">The prototype keeps detail secondary. Select a row from the table to open the supporting information here.</p>`;
    elements.detailActions.hidden = true;
    return;
  }

  const candidate = candidateObject(item);
  const sourceRecords = arrayValue(item.sourceRecords);
  const evidence = arrayValue(item.evidence);
  const primaryRecord = sourceRecords[0] ?? {};

  elements.detailEyebrow.textContent = "Review detail";
  elements.detailTitle.textContent = candidate.displayName || "Unnamed candidate";
  elements.detailSubtitle.textContent = `${sourceRecords.length} source records · ${evidence.length} evidence items`;
  elements.detailActions.hidden = false;
  elements.detailBody.innerHTML = `
    <div class="badge-row">
      ${renderPill(displayLabel(candidate.status || "pending_review"), statusVariant(candidate.status || "pending_review"))}
      ${renderPill(displayLabel(candidate.strength || "weak"), statusVariant(candidate.strength || "weak"))}
    </div>
    <div class="detail-kpis">
      <div class="detail-kpi">
        <span>Reasons</span>
        <strong>${escapeHtml(arrayValue(candidate.reasonCodes).map(displayLabel).join(", ") || "—")}</strong>
      </div>
      <div class="detail-kpi">
        <span>Primary source</span>
        <strong>${escapeHtml(displayLabel(primaryRecord.source || "unknown"))}</strong>
      </div>
    </div>
    <div class="detail-list">
      ${evidence
        .slice(0, 8)
        .map(
          (entry) => `
            <div class="detail-list-row">
              <span>${escapeHtml(displayLabel(entry.evidenceType || "evidence"))}</span>
              <strong>${escapeHtml(entry.normalizedValue || entry.rawValue || "—")}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderApprovedDetail() {
  const entity = getSelectedApprovedEntity();
  if (!entity) {
    elements.detailEyebrow.textContent = "Selection";
    elements.detailTitle.textContent = "Nothing selected";
    elements.detailSubtitle.textContent = "Pick an approved row to inspect the surviving profile.";
    elements.detailBody.innerHTML = `<p class="empty-detail">Select an approved row from the table.</p>`;
    elements.detailActions.hidden = true;
    return;
  }

  elements.detailEyebrow.textContent = "Approved detail";
  elements.detailTitle.textContent = entity.displayName || entity.id;
  elements.detailSubtitle.textContent = `${arrayValue(entity.sourceRecordIds).length} source records survived`;
  elements.detailActions.hidden = true;
  elements.detailBody.innerHTML = `
    <div class="badge-row">
      ${renderPill("Approved", "success")}
      ${renderPill(displayLabel(entity.entityType || "entity"), "neutral")}
    </div>
    <div class="detail-kpis">
      <div class="detail-kpi">
        <span>Email</span>
        <strong>${escapeHtml(arrayValue(entity.emails).slice(0, 2).join(", ") || "—")}</strong>
      </div>
      <div class="detail-kpi">
        <span>Homepage</span>
        <strong>${escapeHtml(arrayValue(entity.homepages).slice(0, 2).join(", ") || "—")}</strong>
      </div>
    </div>
    <div class="detail-list">
      <div class="detail-list-row">
        <span>Institutions</span>
        <strong>${escapeHtml(arrayValue(entity.institutions).join(", ") || "—")}</strong>
      </div>
      <div class="detail-list-row">
        <span>ORCID</span>
        <strong>${escapeHtml(arrayValue(entity.orcids).join(", ") || "—")}</strong>
      </div>
      <div class="detail-list-row">
        <span>GitHub</span>
        <strong>${escapeHtml(arrayValue(entity.githubUrls).join(", ") || "—")}</strong>
      </div>
    </div>
  `;
}

function renderDetail() {
  if (state.view === "queue") {
    renderQueueDetail();
  } else {
    renderApprovedDetail();
  }
}

function syncView() {
  const queueActive = state.view === "queue";
  elements.tabQueue.classList.toggle("is-active", queueActive);
  elements.tabQueue.setAttribute("aria-selected", queueActive ? "true" : "false");
  elements.tabApproved.classList.toggle("is-active", !queueActive);
  elements.tabApproved.setAttribute("aria-selected", queueActive ? "false" : "true");
  elements.queueView.hidden = !queueActive;
  elements.approvedView.hidden = queueActive;
}

function render() {
  renderRunFilter();
  renderRunsTable();
  syncView();
  if (state.view === "queue") {
    renderQueueTable();
  } else {
    renderApprovedTable();
  }
  renderDetail();
}

async function loadData() {
  localStorage.setItem(STORAGE_KEY, currentApiBaseUrl());
  await requestJson("/health");
  const [runsPayload, candidatesPayload, approvedPayload] = await Promise.all([
    requestJson("/source-runs?limit=50"),
    requestJson("/dedup-candidates?include=details"),
    requestJson("/approved-entities"),
  ]);

  state.runs = sortRuns(normalizeListPayload(runsPayload));
  state.candidates = normalizeListPayload(candidatesPayload);
  state.approved = normalizeListPayload(approvedPayload);
  chooseSelectedRun();
  ensureSelectedRows();
  render();
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => {
    void loadData();
  });

  elements.tabQueue.addEventListener("click", () => {
    state.view = "queue";
    render();
  });

  elements.tabApproved.addEventListener("click", () => {
    state.view = "approved";
    render();
  });

  elements.runFilter.addEventListener("change", () => {
    state.selectedRunId = elements.runFilter.value;
    ensureSelectedRows();
    render();
  });

  elements.searchInput.addEventListener("input", () => {
    state.search = elements.searchInput.value.trim().toLowerCase();
    ensureSelectedRows();
    render();
  });

  elements.runsTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-run-id]");
    if (!button) {
      return;
    }
    state.selectedRunId = button.getAttribute("data-run-id") || "";
    ensureSelectedRows();
    render();
  });

  elements.queueTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-candidate-id]");
    if (!button) {
      return;
    }
    state.selectedCandidateId = button.getAttribute("data-candidate-id") || "";
    render();
  });

  elements.approvedTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-approved-id]");
    if (!button) {
      return;
    }
    state.selectedApprovedId = button.getAttribute("data-approved-id") || "";
    render();
  });
}

function boot() {
  elements.apiBaseUrl.value = localStorage.getItem(STORAGE_KEY) || "/api/sourcing";
  bindEvents();
  void loadData().catch((error) => {
    elements.runSummary.textContent = error.message;
    elements.queueMeta.textContent = "Failed to load prototype data.";
  });
}

boot();

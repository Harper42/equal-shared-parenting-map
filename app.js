const STATUS_LABEL = {
  passed: "Passed",
  progress: "Bill in progress",
  none: "No bill yet",
};

const STATUS_DETAIL = {
  passed: "Already law in this state.",
  progress: "A bill of this nature is in the legislature.",
  none: "No bill of this nature has been introduced.",
};

const state = {
  catalog: null,
  paths: null,
  billId: null,
  stateName: null,
  filter: null,
};

const els = {
  bill: document.getElementById("bill"),
  summary: document.getElementById("bill-summary"),
  map: document.getElementById("map"),
  readout: document.getElementById("hover-readout"),
  detail: document.getElementById("detail"),
  lists: document.getElementById("lists"),
  source: document.getElementById("source-note"),
  sourceLink: document.getElementById("source-link"),
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function currentBill() {
  return state.catalog.bills.find((bill) => bill.id === state.billId);
}

function statusFor(name) {
  const record = currentBill().states[name];
  return record ? record.status : "none";
}

function readHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!raw) return { billId: null, stateSlug: null };
  const [billId, stateSlug] = raw.split("/");
  return { billId, stateSlug: stateSlug || null };
}

function writeHash() {
  const next = state.stateName
    ? `${state.billId}/${slugify(state.stateName)}`
    : state.billId;
  if (location.hash.replace(/^#/, "") !== next) {
    history.replaceState(null, "", `#${next}`);
  }
}

function setReadout(name) {
  if (!name) {
    els.readout.textContent = state.stateName
      ? `${state.stateName} — ${STATUS_LABEL[statusFor(state.stateName)]}`
      : "Hover or select a state";
    return;
  }
  els.readout.textContent = `${name} — ${STATUS_LABEL[statusFor(name)]}`;
}

function renderMap() {
  const bill = currentBill();
  els.map.classList.toggle("is-filtering", Boolean(state.filter));
  for (const path of els.map.querySelectorAll("path[data-name]")) {
    const name = path.dataset.name;
    const status = bill.states[name] ? bill.states[name].status : "none";
    path.setAttribute("class", `status-${status}`);
    path.classList.toggle("is-selected", name === state.stateName);
    path.classList.toggle("is-match", status === state.filter);
    path.setAttribute("aria-label", `${name}, ${STATUS_LABEL[status]}`);
    path.setAttribute("aria-pressed", name === state.stateName ? "true" : "false");
  }
}

function overallBreakdown() {
  const passed = [];
  const progress = [];
  const started = new Map();
  const byName = (a, b) => a.name.localeCompare(b.name);

  for (const bill of state.catalog.bills) {
    const passedStates = [];
    const progressStates = [];
    for (const [name, record] of Object.entries(bill.states)) {
      if (!started.has(name)) started.set(name, false);
      const entry = { name, billId: record.billId || "" };
      if (record.status === "passed") {
        passedStates.push(entry);
        started.set(name, true);
      } else if (record.status === "progress") {
        progressStates.push(entry);
        started.set(name, true);
      }
    }
    if (passedStates.length) {
      passedStates.sort(byName);
      passed.push({ title: bill.title, states: passedStates });
    }
    if (progressStates.length) {
      progressStates.sort(byName);
      progress.push({ title: bill.title, states: progressStates });
    }
  }

  const needing = [...started.keys()].filter((name) => !started.get(name)).sort();
  return { passed, progress, needing };
}

function statePills(states) {
  return states.map((entry) => {
    const billNumber = entry.billId
      ? `<span class="pill-id">${escapeHtml(entry.billId.toUpperCase())}</span>`
      : "";
    return `<span class="pill">${escapeHtml(entry.name)}${billNumber}</span>`;
  }).join("");
}

function breakdownMarkup(kind) {
  const data = overallBreakdown();
  if (kind === "needing") {
    const pills = data.needing.map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join("");
    return `
      <p class="modal-lead">No bill in the stack has been introduced or signed in these states.</p>
      <div class="pills">${pills}</div>
    `;
  }

  const groups = kind === "passed" ? data.passed : data.progress;
  return groups.map((group) => `
    <section class="modal-group">
      <h3>${escapeHtml(group.title)} <span class="modal-count">${group.states.length}</span></h3>
      <div class="pills">${statePills(group.states)}</div>
    </section>
  `).join("");
}

const TOTAL_TITLES = {
  passed: "Bills passed",
  progress: "Bills in progress",
  needing: "States still needing a bill",
};

function openTotalsDialog(kind) {
  const dialog = document.getElementById("totals-dialog");
  document.getElementById("totals-dialog-title").textContent = TOTAL_TITLES[kind];
  document.getElementById("totals-dialog-body").innerHTML = breakdownMarkup(kind);
  if (!dialog.open) dialog.showModal();
}

function renderOverallTotals() {
  if (!state.catalog) return;
  const data = overallBreakdown();
  const passed = data.passed.reduce((count, group) => count + group.states.length, 0);
  const progress = data.progress.reduce((count, group) => count + group.states.length, 0);
  document.getElementById("total-passed").textContent = String(passed);
  document.getElementById("total-progress").textContent = String(progress);
  document.getElementById("total-states").textContent = String(data.needing.length);
}

function renderCounts() {
  const bill = currentBill();
  const counts = { passed: 0, progress: 0, none: 0 };
  for (const record of Object.values(bill.states)) counts[record.status] += 1;
  for (const key of Object.keys(counts)) {
    document.querySelector(`[data-count="${key}"]`).textContent = String(counts[key]);
  }
  return counts;
}

function renderDetail() {
  const bill = currentBill();
  els.summary.textContent = bill.summary;

  if (!state.stateName) {
    els.detail.innerHTML = `
      <h3>${escapeHtml(bill.title)}</h3>
      <p class="meta">Select a state on the map, or pick one from the lists.</p>
      <div class="links"><a href="${escapeHtml(bill.page)}">About this bill</a></div>
    `;
    return;
  }

  const record = bill.states[state.stateName] || { status: "none", billId: "", url: "" };
  const bits = [`<h3>${escapeHtml(state.stateName)}</h3>`];
  bits.push(`<p class="status-line ${record.status}">${STATUS_LABEL[record.status]}</p>`);
  bits.push(`<p>${STATUS_DETAIL[record.status]}</p>`);
  if (record.note) {
    bits.push("<p class=\"meta\">Garza’s tracker marks this as a similar bill, not his model draft.</p>");
  }
  if (record.billId) {
    const billNumber = escapeHtml(record.billId.toUpperCase());
    const line = record.status === "none"
      ? `The tracker lists ${billNumber} and still marks this not started.`
      : `Bill number: ${billNumber}`;
    bits.push(`<p class="meta">${line}</p>`);
  }
  const links = [`<a href="${escapeHtml(bill.page)}">About this bill</a>`];
  if (record.url && record.status !== "none") {
    links.push(`<a href="${escapeHtml(record.url)}">Source document</a>`);
  }
  bits.push(`<div class="links">${links.join("")}</div>`);
  els.detail.innerHTML = bits.join("");
}

function renderLists() {
  const bill = currentBill();
  const groups = { passed: [], progress: [], none: [] };
  for (const name of Object.keys(bill.states).sort()) groups[bill.states[name].status].push(name);

  const blocks = [
    ["passed", "Passed"],
    ["progress", "Bill in progress"],
    ["none", "No bill yet"],
  ];

  els.lists.innerHTML = blocks.map(([key, label]) => {
    const names = groups[key];
    const body = names.length
      ? `<div class="chips${key === "none" ? " scroll" : ""}">${names.map((name) => {
          const current = name === state.stateName ? " is-current" : "";
          return `<button type="button" class="chip${current}" data-state="${name}">${name}</button>`;
        }).join("")}</div>`
      : `<p class="empty">No states.</p>`;
    return `<section class="list-block"><h3>${label} · ${names.length}</h3>${body}</section>`;
  }).join("");
}

function render() {
  const bill = currentBill();
  document.title = `${bill.title} · Equal Shared Parenting Map`;
  renderMap();
  renderCounts();
  renderOverallTotals();
  renderDetail();
  renderLists();
  setReadout(null);
  writeHash();
  for (const button of document.querySelectorAll(".legend-btn")) {
    button.setAttribute("aria-pressed", button.dataset.status === state.filter ? "true" : "false");
  }
}

function selectBill(billId, stateName) {
  const known = state.catalog.bills.some((bill) => bill.id === billId);
  state.billId = known ? billId : state.catalog.bills[0].id;
  els.bill.value = state.billId;
  const names = Object.keys(currentBill().states);
  state.stateName = names.includes(stateName) ? stateName : null;
  render();
}

function stateFromSlug(slug) {
  if (!slug) return null;
  return Object.keys(currentBill().states).find((name) => slugify(name) === slug) || null;
}

function drawMap(paths) {
  const svgNS = "http://www.w3.org/2000/svg";
  els.map.setAttribute("viewBox", `0 0 ${paths.width} ${paths.height}`);
  const ordered = [...paths.states].sort((a, b) => a.name.localeCompare(b.name));
  for (const shape of ordered) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", shape.d);
    path.dataset.name = shape.name;
    path.setAttribute("role", "button");
    path.setAttribute("tabindex", "0");
    path.addEventListener("click", () => selectBill(state.billId, shape.name));
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectBill(state.billId, shape.name);
      }
    });
    path.addEventListener("mouseenter", () => setReadout(shape.name));
    path.addEventListener("mouseleave", () => setReadout(null));
    path.addEventListener("focus", () => setReadout(shape.name));
    path.addEventListener("blur", () => setReadout(null));
    els.map.appendChild(path);
  }
}

async function init() {
  const [catalog, paths] = await Promise.all([
    fetch("data/bills.json").then((response) => response.json()),
    fetch("data/paths.json").then((response) => response.json()),
  ]);
  state.catalog = catalog;
  state.paths = paths;
  els.source.textContent = catalog.sourceNote;
  els.sourceLink.href = catalog.sourcePage;
  renderOverallTotals();

  for (const bill of catalog.bills) {
    const option = document.createElement("option");
    option.value = bill.id;
    option.textContent = bill.title;
    els.bill.appendChild(option);
  }

  drawMap(paths);

  els.bill.addEventListener("change", () => {
    selectBill(els.bill.value, state.stateName);
  });

  document.querySelector(".totals-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-total]");
    if (!card) return;
    openTotalsDialog(card.dataset.total);
  });

  const totalsDialog = document.getElementById("totals-dialog");
  totalsDialog.addEventListener("click", (event) => {
    if (event.target === totalsDialog) totalsDialog.close();
  });
  document.querySelector("[data-close-dialog]").addEventListener("click", () => {
    totalsDialog.close();
  });

  document.querySelector(".legend").addEventListener("click", (event) => {
    const button = event.target.closest(".legend-btn");
    if (!button) return;
    state.filter = state.filter === button.dataset.status ? null : button.dataset.status;
    render();
  });

  els.lists.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    selectBill(state.billId, chip.dataset.state);
  });

  window.addEventListener("hashchange", () => {
    const hash = readHash();
    const billId = hash.billId || state.catalog.bills[0].id;
    selectBill(billId, null);
    const name = stateFromSlug(hash.stateSlug);
    if (name) selectBill(billId, name);
  });

  const hash = readHash();
  selectBill(hash.billId || catalog.bills[0].id, null);
  const named = stateFromSlug(hash.stateSlug);
  if (named) selectBill(state.billId, named);
}

init().catch((error) => {
  els.summary.textContent = "The map data could not be loaded. Open this page from a local web server in the project folder.";
  console.error(error);
});

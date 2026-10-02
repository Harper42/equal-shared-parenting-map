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
  countyView: false,
  countyShapes: null,
  countyName: null,
};

const countyCache = new Map();
let countyRequest = 0;

const els = {
  bill: document.getElementById("bill"),
  summary: document.getElementById("bill-summary"),
  map: document.getElementById("map"),
  nation: document.getElementById("nation"),
  countyLayer: document.getElementById("counties"),
  heading: document.getElementById("map-heading"),
  backNation: document.getElementById("back-nation"),
  openCounties: document.getElementById("open-counties"),
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

function stateBillPage(bill, stateName) {
  return `https://robertgarza.us/bill/united-states/${slugify(stateName)}/${bill.id}/`;
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
  if (!raw) return { billId: null, stateSlug: null, counties: false };
  const [billId, stateSlug, extra] = raw.split("/");
  return { billId, stateSlug: stateSlug || null, counties: extra === "counties" };
}

function writeHash() {
  let next = state.billId;
  if (state.stateName) next += `/${slugify(state.stateName)}`;
  if (state.countyView && state.stateName) next += "/counties";
  if (location.hash.replace(/^#/, "") !== next) {
    history.replaceState(null, "", `#${next}`);
  }
}

function setReadout(name) {
  if (state.countyView && state.stateName) {
    const status = STATUS_LABEL[statusFor(state.stateName)];
    const county = name || state.countyName;
    els.readout.textContent = county
      ? `${county} — ${status}`
      : `${state.stateName} counties — ${status}`;
    return;
  }
  if (!name) {
    els.readout.textContent = state.stateName
      ? `${state.stateName} — ${STATUS_LABEL[statusFor(state.stateName)]}`
      : "Hover or select a state. Double-click a state for counties.";
    return;
  }
  els.readout.textContent = `${name} — ${STATUS_LABEL[statusFor(name)]}`;
}

function countyMapReady() {
  return state.countyView && state.countyShapes && state.countyShapes.state === state.stateName;
}

function renderMap() {
  const bill = currentBill();
  const counties = countyMapReady();
  els.map.classList.toggle("is-filtering", Boolean(state.filter));
  els.nation.style.display = counties ? "none" : "";
  els.countyLayer.style.display = counties ? "" : "none";
  els.heading.textContent = counties ? state.stateName : "United States";
  els.backNation.hidden = !counties;
  els.openCounties.hidden = !state.stateName || counties;
  els.map.setAttribute(
    "aria-label",
    counties
      ? `${state.stateName} counties. Bill status is statewide.`
      : "United States map. Choose a state to see its bill status. Double-click a state to see its counties.",
  );

  if (counties) {
    els.map.setAttribute("viewBox", `0 0 ${state.countyShapes.width} ${state.countyShapes.height}`);
    renderCountyMap();
    return;
  }

  if (state.paths) {
    els.map.setAttribute("viewBox", `0 0 ${state.paths.width} ${state.paths.height}`);
  }
  for (const path of els.nation.querySelectorAll("path[data-name]")) {
    const name = path.dataset.name;
    const status = bill.states[name] ? bill.states[name].status : "none";
    path.setAttribute("class", `status-${status}`);
    path.classList.toggle("is-selected", name === state.stateName);
    path.classList.toggle("is-match", status === state.filter);
    path.setAttribute("aria-label", `${name}, ${STATUS_LABEL[status]}`);
    path.setAttribute("aria-pressed", name === state.stateName ? "true" : "false");
  }
}

function renderCountyMap() {
  if (els.countyLayer.dataset.state !== state.stateName) {
    const svgNS = "http://www.w3.org/2000/svg";
    els.countyLayer.replaceChildren();
    els.countyLayer.dataset.state = state.stateName;
    for (const shape of state.countyShapes.counties) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", shape.d);
      path.dataset.county = shape.name;
      path.setAttribute("role", "button");
      path.setAttribute("tabindex", "0");
      path.addEventListener("click", () => {
        state.countyName = shape.name;
        renderCountyMap();
        setReadout(shape.name);
      });
      path.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.countyName = shape.name;
          renderCountyMap();
          setReadout(shape.name);
        }
      });
      path.addEventListener("mouseenter", () => setReadout(shape.name));
      path.addEventListener("mouseleave", () => setReadout(null));
      path.addEventListener("focus", () => setReadout(shape.name));
      path.addEventListener("blur", () => setReadout(null));
      els.countyLayer.appendChild(path);
    }
  }

  const status = statusFor(state.stateName);
  for (const path of els.countyLayer.querySelectorAll("path[data-county]")) {
    path.setAttribute("class", `county status-${status}`);
    path.classList.toggle("is-match", status === state.filter);
    path.classList.toggle("is-current", path.dataset.county === state.countyName);
    path.setAttribute("aria-label", `${path.dataset.county}, ${STATUS_LABEL[status]}`);
    path.setAttribute("aria-pressed", path.dataset.county === state.countyName ? "true" : "false");
  }
}

async function openCounties(stateName) {
  if (!stateName || !Object.keys(currentBill().states).includes(stateName)) return;
  const request = ++countyRequest;
  if (state.stateName !== stateName) {
    state.stateName = stateName;
    state.countyName = null;
    state.countyView = false;
    render();
  }
  els.readout.textContent = `Loading ${stateName} counties…`;
  try {
    let data = countyCache.get(stateName);
    if (!data) {
      const response = await fetch(`data/counties/${slugify(stateName)}.json`);
      if (!response.ok) throw new Error(`County map failed to load (${response.status})`);
      data = await response.json();
      countyCache.set(stateName, data);
    }
    if (request !== countyRequest || state.stateName !== stateName) return;
    state.countyShapes = data;
    state.countyView = true;
    state.countyName = null;
    render();
  } catch (error) {
    if (request !== countyRequest) return;
    state.countyView = false;
    console.error(error);
    render();
    els.readout.textContent = "The county map could not be loaded.";
  }
}

function closeCounties() {
  countyRequest += 1;
  state.countyView = false;
  state.countyName = null;
  render();
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
  if (state.countyView) {
    bits.push("<p class=\"meta\">Counties use this state’s bill status. Status is not tracked county by county.</p>");
  }
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
  const links = [`<a href="${escapeHtml(stateBillPage(bill, state.stateName))}">About this bill</a>`];
  if (record.url && record.url.trim()) {
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
  const nextName = names.includes(stateName) ? stateName : null;
  if (nextName !== state.stateName) {
    state.countyView = false;
    state.countyName = null;
  }
  state.stateName = nextName;
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
    path.addEventListener("dblclick", (event) => {
      event.preventDefault();
      openCounties(shape.name);
    });
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
    els.nation.appendChild(path);
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

  els.openCounties.addEventListener("click", () => {
    if (state.stateName) openCounties(state.stateName);
  });
  els.backNation.addEventListener("click", closeCounties);

  window.addEventListener("hashchange", () => {
    const hash = readHash();
    const billId = hash.billId || state.catalog.bills[0].id;
    selectBill(billId, null);
    const name = stateFromSlug(hash.stateSlug);
    if (name) selectBill(billId, name);
    if (hash.counties && name) openCounties(name);
  });

  const hash = readHash();
  selectBill(hash.billId || catalog.bills[0].id, null);
  const named = stateFromSlug(hash.stateSlug);
  if (named) selectBill(state.billId, named);
  if (hash.counties && named) openCounties(named);
}

init().catch((error) => {
  els.summary.textContent = "The map data could not be loaded. Open this page from a local web server in the project folder.";
  console.error(error);
});

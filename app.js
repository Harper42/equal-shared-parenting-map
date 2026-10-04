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
const officialCache = new Map();
const officialLoading = new Set();
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
  officials: document.getElementById("county-officials"),
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
  const record = bill.states[stateName];
  if (record && (record.status === "passed" || record.status === "progress")) {
    return `bill.html?bill=${encodeURIComponent(bill.id)}&state=${encodeURIComponent(stateName)}`;
  }
  return `https://robertgarza.us/bill/united-states/${slugify(stateName)}/${bill.id}/`;
}

function currentBill() {
  return state.catalog.bills.find((bill) => bill.id === state.billId);
}

function billName(bill) {
  return bill.label ? `${bill.title} (${bill.label})` : bill.title;
}

function statusFor(name) {
  const record = currentBill().states[name];
  return record ? record.status : "none";
}

function isCaveat(name) {
  const record = currentBill().states[name];
  return !!(record && record.status === "passed" && record.caveat);
}

function isStalled(name) {
  const record = currentBill().states[name];
  return !!(record && record.status === "progress" && record.stalled);
}

function statusPhrase(name) {
  if (isCaveat(name)) return "Passed, with a caveat";
  if (isStalled(name)) return "Stalled";
  return STATUS_LABEL[statusFor(name)];
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
    const status = statusPhrase(state.stateName);
    const county = name || state.countyName;
    els.readout.textContent = county
      ? `${county} — ${status}`
      : `${state.stateName} counties — ${status}`;
    return;
  }
  if (!name) {
    els.readout.textContent = state.stateName
      ? `${state.stateName} — ${statusPhrase(state.stateName)}`
      : "Hover or select a state. Double-click a state for counties.";
    return;
  }
  els.readout.textContent = `${name} — ${statusPhrase(name)}`;
}

function selectCounty(name) {
  state.countyName = name;
  renderCountyMap();
  setReadout(name);
  renderOfficials();
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
    const record = bill.states[name];
    const status = record ? record.status : "none";
    path.setAttribute("class", `status-${status}`);
    path.classList.toggle("is-caveat", status === "passed" && !!(record && record.caveat));
    path.classList.toggle("is-stalled", status === "progress" && !!(record && record.stalled));
    path.classList.toggle("is-selected", name === state.stateName);
    path.classList.toggle("is-match", status === state.filter);
    path.setAttribute("aria-label", `${name}, ${statusPhrase(name)}`);
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
      path.addEventListener("click", () => selectCounty(shape.name));
      path.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectCounty(shape.name);
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
    path.classList.toggle("is-caveat", isCaveat(state.stateName));
    path.classList.toggle("is-stalled", isStalled(state.stateName));
    path.classList.toggle("is-match", status === state.filter);
    path.classList.toggle("is-current", path.dataset.county === state.countyName);
    path.setAttribute("aria-label", `${path.dataset.county}, ${statusPhrase(state.stateName)}`);
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
    loadOfficials(stateName);
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
      const entry = { name, billId: record.billId || "", caveat: !!record.caveat, stalled: !!record.stalled };
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
      passed.push({ title: billName(bill), states: passedStates });
    }
    if (progressStates.length) {
      progressStates.sort(byName);
      progress.push({ title: billName(bill), states: progressStates });
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
    const caveat = entry.caveat ? " is-caveat" : "";
    const stalled = entry.stalled ? " is-stalled" : "";
    return `<span class="pill${caveat}${stalled}">${escapeHtml(entry.name)}${billNumber}</span>`;
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
      <h3>${escapeHtml(billName(bill))}</h3>
      <p class="meta">Select a state on the map, or pick one from the lists.</p>
      <div class="links"><a href="${escapeHtml(bill.page)}">About this bill</a></div>
    `;
    return;
  }

  const record = bill.states[state.stateName] || { status: "none", billId: "", url: "" };
  const bits = [`<h3>${escapeHtml(state.stateName)}</h3>`];
  const caveat = record.status === "passed" && record.caveat;
  const stalled = record.status === "progress" && record.stalled;
  const statusLabel = stalled ? "Stalled" : STATUS_LABEL[record.status];
  const statusDetail = caveat
    ? "Marked passed, with a caveat."
    : stalled
      ? "This bill has stalled in the legislature."
      : STATUS_DETAIL[record.status];
  bits.push(`<p class="status-line ${record.status}${caveat ? " caveat" : ""}${stalled ? " stalled" : ""}">${statusLabel}</p>`);
  bits.push(`<p>${statusDetail}</p>`);
  if (state.countyView) {
    bits.push("<p class=\"meta\">Counties use this state’s bill status. Status is not tracked county by county.</p>");
  }
  if (record.note) {
    bits.push("<p class=\"meta\">Garza’s tracker marks this as a similar bill, not his model draft.</p>");
  }
  if (record.detail) {
    bits.push(`<p class="meta">${escapeHtml(record.detail)}</p>`);
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

function profileHref(person) {
  if (!person.id || !state.stateName) return "";
  const from = location.hash.replace(/^#/, "");
  const query = from ? `?from=${encodeURIComponent(from)}` : "";
  return `profile.html${query}#${slugify(state.stateName)}/${person.id}`;
}

function officialLine(person) {
  const meta = [person.district, person.party].filter(Boolean).join(" · ");
  const href = profileHref(person);
  const name = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(person.name)}</a>`
    : escapeHtml(person.name);
  const profile = href ? `<a class="profile-link" href="${escapeHtml(href)}">Profile</a>` : "";
  return `<li>${name}${meta ? `<span class="official-meta">${escapeHtml(meta)}</span>` : ""}${profile}</li>`;
}

function officialGroup(title, people) {
  const body = people.length
    ? `<ul>${people.map(officialLine).join("")}</ul>`
    : `<p class="meta">None listed.</p>`;
  return `<section><h4>${title}</h4>${body}</section>`;
}

function inProgressBills(stateName) {
  return state.catalog.bills.filter((bill) => {
    const record = bill.states[stateName];
    return record && record.status === "progress";
  });
}

function billMention(bill, stateName) {
  const record = bill.states[stateName] || {};
  const number = record.billId ? ` (${record.billId.toUpperCase()})` : "";
  return `${billName(bill)}${number}`;
}

function telHref(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return digits ? `tel:${digits}` : "";
}

function localStateLegislators(county, stateName) {
  return [
    ...county.stateSenate.map((person) => ({ ...person, role: "State senator" })),
    ...county.stateHouse.map((person) => ({
      ...person,
      role: stateName === "Nebraska" ? "State senator" : "State representative",
    })),
  ].filter((person) => person.name && person.name !== "Vacant seat");
}

function ctaPeopleHtml(people, subject) {
  return people.map((person) => {
    const meta = [person.role, person.district, person.party].filter(Boolean).join(" · ");
    const actions = [];
    const href = profileHref(person);
    if (href) actions.push(`<a href="${escapeHtml(href)}">Profile</a>`);
    const phoneLink = person.phone ? telHref(person.phone) : "";
    if (phoneLink) actions.push(`<a href="${phoneLink}">Call ${escapeHtml(person.phone)}</a>`);
    if (person.email) {
      const mail = subject
        ? `mailto:${person.email}?subject=${encodeURIComponent(subject)}`
        : `mailto:${person.email}`;
      actions.push(`<a href="${escapeHtml(mail)}">Email</a>`);
    }
    const actionHtml = actions.length ? `<span class="cta-actions">${actions.join("")}</span>` : "";
    const name = href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(person.name)}</a>`
      : escapeHtml(person.name);
    return `<li><span class="cta-person">${name}<span class="official-meta">${escapeHtml(meta)}</span></span>${actionHtml}</li>`;
  }).join("");
}

function callToAction(county, countyName, stateName) {
  if (statusFor(stateName) !== "progress") return "";
  const bills = inProgressBills(stateName);
  if (!bills.length) return "";

  const selected = bills.find((bill) => bill.id === state.billId);
  const ordered = selected
    ? [selected, ...bills.filter((bill) => bill.id !== selected.id)]
    : bills;
  const chamber = stateName === "Nebraska" ? "state senators" : "state senators and representatives";
  const ask = ordered.length === 1
    ? `${billMention(ordered[0], stateName)} is already in the ${stateName} legislature. Call or email the ${chamber} for ${countyName} and ask them to support it.`
    : `These bills are already in the ${stateName} legislature. Call or email the ${chamber} for ${countyName} and ask them to support them.`;
  const subject = ordered.length === 1
    ? `Please support ${billMention(ordered[0], stateName)}`
    : "Please support these family court reform bills";
  const billList = ordered.length > 1
    ? `<ul class="cta-bills">${ordered.map((bill) => `<li>${escapeHtml(billMention(bill, stateName))}</li>`).join("")}</ul>`
    : "";
  const people = ctaPeopleHtml(localStateLegislators(county, stateName), subject);

  return `
    <section class="cta">
      <h4>This is YOUR Call to Action!</h4>
      <p>${escapeHtml(ask)}</p>
      ${billList}
      ${people ? `<ul class="cta-people">${people}</ul>` : ""}
    </section>
  `;
}

function sponsorCallToAction(county, countyName, stateName) {
  if (statusFor(stateName) !== "none") return "";
  const bill = currentBill();
  const chamber = stateName === "Nebraska" ? "state senator" : "state senator or representative";
  const documentUrl = stateBillPage(bill, stateName);
  const meetingUrl = "https://robertgarza.us/legislator-meetings";
  const steps = [
    "Go to the map.",
    "Double-click your state.",
    "Click your county.",
    "Follow the link to the representative you would like to contact.",
    "Copy their email.",
    "Open your email app.",
    "Paste their email on the To line.",
    `Go to <a href="${escapeHtml(documentUrl)}">this bill’s document on Robert Garza’s site</a>.`,
    "Copy the subject line for the bill into your email’s subject line.",
    "Copy the email and bill contents into the body of your email.",
    "Update the section for your information, the legislator’s or senator’s name, and the office address so they match the representative you chose. Add your name at the bottom of the email.",
    "Double-check that you filled in every blank in the bill email.",
    "Do not add more argument or fill the email with your particular story. Too much text will not be read and will likely just be deleted.",
    "Be kind and non-partisan.",
    "Send the email.",
    `If you receive a positive reply for a meeting, return to Robert Garza’s site and request that someone from Robert’s team join you for the scheduled Zoom meeting. They have experience meeting with legislators. <a href="${escapeHtml(meetingUrl)}">Request a legislator meeting</a>.`,
    "Fill out the request form there. It is free. They will be in touch if they can take the meeting.",
    "If you have to take the meeting yourself, be professional, prompt, and non-partisan, and put your best foot forward for the cause. Do not argue, and do not make an opponent of the legislator.",
  ];
  const people = ctaPeopleHtml(localStateLegislators(county, stateName), "");
  const ask = `${billName(bill)} has not been introduced in ${stateName}. Ask a ${chamber} for ${countyName} to sponsor it.`;

  return `
    <section class="cta">
      <h4>This is YOUR Call to Action!</h4>
      <p>${escapeHtml(ask)}</p>
      <p>Steps to ask for a Zoom call to request that they sponsor this family court reform bill:</p>
      <ol class="cta-sponsor-steps">${steps.map((step) => `<li>${step}</li>`).join("")}</ol>
      ${people ? `<ul class="cta-people">${people}</ul>` : ""}
    </section>
  `;
}

function renderOfficials() {
  if (!state.countyView || !state.stateName || !state.countyName) {
    els.officials.hidden = true;
    els.officials.innerHTML = "";
    return;
  }
  const countyName = state.countyName;
  const data = officialCache.get(state.stateName);
  els.officials.hidden = false;
  if (!data) {
    els.officials.innerHTML = `
      <h3>${escapeHtml(countyName)}</h3>
      <p class="meta">Loading legislators…</p>
    `;
    loadOfficials(state.stateName);
    return;
  }
  const county = data.counties[countyName];
  if (!county) {
    els.officials.innerHTML = `
      <h3>${escapeHtml(countyName)}</h3>
      <p class="meta">Legislators for this county are not in the current roster.</p>
    `;
    return;
  }
  const sections = [officialGroup("State senators", county.stateSenate)];
  if (state.stateName === "Nebraska") {
    sections.push(`<p class="meta">Nebraska’s legislature has one chamber.</p>`);
  } else {
    sections.push(officialGroup("State representatives", county.stateHouse));
  }
  sections.push(officialGroup("U.S. senators", data.federalSenate));
  sections.push(officialGroup("U.S. representatives", county.federalHouse));
  els.officials.innerHTML = `
    <h3>${escapeHtml(countyName)}</h3>
    <div class="official-groups">${sections.join("")}</div>
    <p class="meta source-note">Current legislators whose districts include part of this county. U.S. senators represent the whole state. A district is listed when it covers at least 1% of the county.</p>
    ${callToAction(county, countyName, state.stateName)}
    ${sponsorCallToAction(county, countyName, state.stateName)}
  `;
}

async function loadOfficials(stateName) {
  if (officialCache.has(stateName)) {
    if (state.stateName === stateName) renderOfficials();
    return;
  }
  if (officialLoading.has(stateName)) return;
  officialLoading.add(stateName);
  try {
    const response = await fetch(`data/legislators/${slugify(stateName)}.json`);
    if (!response.ok) throw new Error(`Legislator file failed to load (${response.status})`);
    officialCache.set(stateName, await response.json());
    if (state.stateName === stateName) renderOfficials();
  } catch (error) {
    if (state.stateName !== stateName || !state.countyName) return;
    console.error(error);
    els.officials.hidden = false;
    els.officials.innerHTML = `
      <h3>${escapeHtml(state.countyName)}</h3>
      <p class="meta">Legislators for this county could not be loaded.</p>
    `;
  } finally {
    officialLoading.delete(stateName);
  }
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
          const caveat = bill.states[name].caveat ? " is-caveat" : "";
          const stalled = bill.states[name].stalled ? " is-stalled" : "";
          const label = caveat ? `${name}, passed with a caveat` : stalled ? `${name}, stalled` : name;
          return `<button type="button" class="chip${current}${caveat}${stalled}" data-state="${name}" aria-label="${escapeHtml(label)}">${name}</button>`;
        }).join("")}</div>`
      : `<p class="empty">No states.</p>`;
    return `<section class="list-block"><h3>${label} · ${names.length}</h3>${body}</section>`;
  }).join("");
}

const VIEWS = ["map", "guide", "directory"];

function currentView() {
  const tab = new URLSearchParams(location.search).get("tab");
  return VIEWS.includes(tab) ? tab : "map";
}

function showTab(tab, historyMode) {
  const view = VIEWS.includes(tab) ? tab : "map";
  document.body.dataset.view = view;
  for (const name of VIEWS) {
    document.getElementById(`panel-${name}`).hidden = name !== view;
    const button = document.getElementById(`tab-${name}`);
    const selected = name === view;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  }
  const url = new URL(location.href);
  if (view === "map") url.searchParams.delete("tab");
  else url.searchParams.set("tab", view);
  if (url.href !== location.href) {
    if (historyMode === "push") history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  }
  if (view === "guide") document.title = "CALL TO ACTION! · Family Court Reforms Map";
  else if (view === "directory") document.title = "Advocate Directory · Family Court Reforms Map";
  else if (state.catalog) document.title = `${billName(currentBill())} · Family Court Reforms Map`;
}

function loadVisitorCount() {
  const line = document.getElementById("visitor-count");
  const valueEl = document.getElementById("visitor-count-value");
  if (!line || !valueEl) return;
  const storageKey = "fcrm-counted-visit";
  const base = "https://countapi.mileshilliard.com/api/v1";
  const key = "harper42-family-court-reforms-map";
  let counted = false;
  try { counted = sessionStorage.getItem(storageKey) === "1"; } catch { counted = false; }

  const show = (value) => {
    valueEl.textContent = Number(value).toLocaleString();
    line.hidden = false;
    try { sessionStorage.setItem(storageKey, "1"); } catch { /* private browsing can block storage */ }
  };
  const hit = () => fetch(`${base}/hit/${key}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data && Number.isFinite(Number(data.value))) show(data.value);
    });
  const request = counted
    ? fetch(`${base}/get/${key}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && Number.isFinite(Number(data.value))) show(data.value);
        else return hit();
      })
    : hit();
  request.catch(() => {});
}

function setupTabs() {
  showTab(currentView());
  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    showTab(button.dataset.tab, "push");
  });
  document.querySelector(".view-tabs").addEventListener("keydown", (event) => {
    const buttons = [...document.querySelectorAll(".view-tab")];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    let next = null;
    if (event.key === "ArrowRight") next = buttons[(index + 1) % buttons.length];
    if (event.key === "ArrowLeft") next = buttons[(index - 1 + buttons.length) % buttons.length];
    if (event.key === "Home") next = buttons[0];
    if (event.key === "End") next = buttons[buttons.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    showTab(next.dataset.tab, "push");
  });
  window.addEventListener("popstate", () => showTab(currentView()));
}

function render() {
  const bill = currentBill();
  if (currentView() === "map") document.title = `${billName(bill)} · Family Court Reforms Map`;
  renderMap();
  renderCounts();
  renderOverallTotals();
  renderDetail();
  renderOfficials();
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
    fetch("data/bills.json?v=9").then((response) => response.json()),
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
    option.textContent = billName(bill);
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

setupTabs();
loadVisitorCount();

init().catch((error) => {
  els.summary.textContent = "The map data could not be loaded. Open this page from a local web server in the project folder.";
  console.error(error);
});

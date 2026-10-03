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

function billName(bill) {
  return bill.label ? `${bill.title} (${bill.label})` : bill.title;
}

function showMessage(text) {
  document.getElementById("bill-profile").innerHTML = `<p class="profile-message">${escapeHtml(text)}</p>`;
}

function statusLabel(record) {
  if (record.status === "progress" && record.stalled) return "Stalled";
  return STATUS_LABEL[record.status] || record.status;
}

function statusSentence(record) {
  if (record.status === "passed" && record.caveat) return "Marked passed, with a caveat.";
  if (record.status === "progress" && record.stalled) return "This bill has stalled in the legislature.";
  return STATUS_DETAIL[record.status] || "";
}

function fact(label, value) {
  if (!value) return "";
  return `<div class="profile-fact"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
}

function paragraphs(items) {
  return (items || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function render(bill, stateName, record, profile) {
  const back = `index.html#${encodeURIComponent(bill.id)}/${slugify(stateName)}`;
  document.getElementById("back").href = back;
  const number = record.billId ? record.billId.toUpperCase() : stateName;
  document.title = `${number} · ${stateName} · Family Court Reforms Map`;

  const stalled = record.status === "progress" && record.stalled;
  const caveat = record.status === "passed" && record.caveat;
  const heading = record.status === "passed" ? "What the law does" : "What the bill does";
  const contents = profile.contents && profile.contents.length
    ? paragraphs(profile.contents)
    : record.detail
      ? `<p>${escapeHtml(record.detail)}</p>`
      : "";
  const sponsors = (profile.sponsors || []).map((name) => escapeHtml(name)).join(", ");
  const facts = [
    fact("Introduced", profile.introduced ? escapeHtml(profile.introduced) : ""),
    fact("Introduced by", profile.introducedBy ? escapeHtml(profile.introducedBy) : ""),
    fact("Sponsors", sponsors),
    fact("Where it stands", profile.where ? escapeHtml(profile.where) : ""),
  ].join("");
  const actions = (profile.actions || []).map((action) => `
    <li><time>${escapeHtml(action.date)}</time><span>${escapeHtml(action.text)}</span></li>
  `).join("");
  const tieBars = (profile.tieBars || []).map((item) => `
    <article class="tie-bar">
      <h3>${escapeHtml(item.billId)}${item.title ? ` · ${escapeHtml(item.title)}` : ""}</h3>
      ${item.where ? `<p>${escapeHtml(item.where)}</p>` : ""}
      <p>${escapeHtml(item.summary)}</p>
      ${item.url ? `<p><a href="${escapeHtml(item.url)}">Official bill page</a></p>` : ""}
    </article>
  `).join("");
  const related = (profile.related || []).map((item) => `
    <p><strong>${escapeHtml(item.billId)}</strong> ${escapeHtml(item.summary)}${item.url ? ` <a href="${escapeHtml(item.url)}">Official bill page</a>` : ""}</p>
  `).join("");
  const source = record.url && record.url.trim()
    ? `<a href="${escapeHtml(record.url)}">Source document</a>`
    : "";

  document.getElementById("bill-profile").innerHTML = `
    <article class="profile-card bill-profile">
      <p class="kicker">${escapeHtml(billName(bill))}</p>
      <h1>${escapeHtml(number)}</h1>
      <p class="profile-role">${escapeHtml(stateName)}</p>
      <p class="status-line ${record.status}${caveat ? " caveat" : ""}${stalled ? " stalled" : ""}">${escapeHtml(statusLabel(record))}</p>
      <p>${escapeHtml(statusSentence(record))}</p>
      ${record.note ? `<p class="meta">Garza’s tracker marks this as a similar bill, not his model draft.</p>` : ""}
      ${facts ? `<dl class="profile-facts">${facts}</dl>` : ""}
      ${contents ? `<section class="profile-stance"><h2>${heading}</h2>${contents}</section>` : ""}
      ${tieBars ? `<section class="tie-bars profile-stance"><h2>Tied bills</h2><p>${escapeHtml(profile.tieNote || "This bill is tied to the bills below.")}</p>${tieBars}</section>` : ""}
      ${related ? `<section class="profile-stance"><h2>Related bills</h2>${related}</section>` : ""}
      ${actions ? `<section class="profile-stance"><h2>History</h2><ul class="bill-actions">${actions}</ul></section>` : ""}
      <div class="profile-links">${source}<a href="${escapeHtml(back)}">Back to ${escapeHtml(stateName)} on the map</a></div>
    </article>
  `;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const billId = params.get("bill");
  const stateName = params.get("state");
  if (!billId || !stateName) {
    showMessage("Choose a state bill from the map.");
    return;
  }

  let catalog;
  let profiles;
  try {
    const [catalogResponse, profileResponse] = await Promise.all([
      fetch("data/bills.json?v=9"),
      fetch("data/bill-profiles.json?v=1"),
    ]);
    if (!catalogResponse.ok) throw new Error("Bill catalog failed to load");
    catalog = await catalogResponse.json();
    profiles = profileResponse.ok ? await profileResponse.json() : {};
  } catch (error) {
    console.error(error);
    showMessage("This bill profile could not be loaded.");
    return;
  }

  const bill = catalog.bills.find((item) => item.id === billId);
  const record = bill && bill.states[stateName];
  if (!bill || !record || (record.status !== "passed" && record.status !== "progress")) {
    showMessage("This state does not have a passed or in-progress bill in that part of the stack.");
    return;
  }

  const profile = (profiles[billId] && profiles[billId][stateName]) || {};
  render(bill, stateName, record, profile);
}

main();

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

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);
const NAME_PARTICLES = new Set(["st", "de", "da", "del", "van", "von", "la", "le", "di", "der", "den"]);
const NICKNAMES = {
  cam: ["cameron"],
  cameron: ["cam"],
  doug: ["douglas"],
  douglas: ["doug"],
  greg: ["gregory"],
  gregory: ["greg"],
  tim: ["timothy", "timmy"],
  timothy: ["tim", "timmy"],
  timmy: ["tim", "timothy"],
  dave: ["david"],
  david: ["dave"],
  bob: ["robert", "bobby"],
  bobby: ["robert", "bob"],
  robert: ["bob", "rob", "bobby"],
  rob: ["robert"],
  bill: ["william"],
  william: ["bill", "will", "billy"],
  will: ["william", "bill"],
  billy: ["william"],
  jim: ["james"],
  james: ["jim", "jimmy"],
  jimmy: ["james"],
  mike: ["michael"],
  michael: ["mike"],
  joe: ["joseph"],
  joseph: ["joe"],
  dan: ["daniel"],
  daniel: ["dan"],
  matt: ["matthew"],
  matthew: ["matt"],
  chris: ["christopher"],
  christopher: ["chris"],
  steve: ["stephen", "steven"],
  stephen: ["steve"],
  steven: ["steve"],
  pat: ["patrick"],
  patrick: ["pat"],
  tom: ["thomas"],
  thomas: ["tom"],
  ben: ["benjamin"],
  benjamin: ["ben"],
  ed: ["edward", "edwin"],
  edward: ["ed"],
  jeff: ["jeffrey"],
  jeffrey: ["jeff"],
  rick: ["richard"],
  richard: ["rick"],
  jon: ["jonathan"],
  jonathan: ["jon"],
};

function normalizeName(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameTokens(value) {
  return normalizeName(value).split(" ").filter((token) => token && !NAME_SUFFIXES.has(token));
}

function splitGivenFamily(tokens) {
  if (tokens.length >= 2 && NAME_PARTICLES.has(tokens[tokens.length - 2])) {
    return { given: tokens.slice(0, -2), family: tokens.slice(-2) };
  }
  return { given: tokens.slice(0, -1), family: tokens.slice(-1) };
}

function queryTokens(value) {
  const comma = String(value).match(/^([^,]+),\s*(.+)$/);
  if (comma) return nameTokens(comma[2]).concat(nameTokens(comma[1]));
  return nameTokens(value);
}

function sameGiven(queryGiven, personGiven) {
  if (!queryGiven.length || !personGiven.length) return true;
  const queryInitials = queryGiven.every((token) => token.length === 1);
  const personInitials = personGiven.every((token) => token.length === 1);
  if (queryInitials) return personGiven[0].startsWith(queryGiven[0]);
  if (personInitials) return queryGiven[0].startsWith(personGiven[0]);
  const queryFirst = queryGiven[0];
  const personFirst = personGiven[0];
  if (queryFirst === personFirst) return true;
  if ((NICKNAMES[queryFirst] || []).includes(personFirst)) return true;
  const shorter = queryFirst.length <= personFirst.length ? queryFirst : personFirst;
  const longer = queryFirst.length <= personFirst.length ? personFirst : queryFirst;
  return shorter.length >= 4 && longer.startsWith(shorter);
}

function namesMatch(queryText, personName) {
  const qTokens = queryTokens(queryText);
  const pTokens = nameTokens(personName);
  if (!qTokens.length || !pTokens.length) return false;
  if (qTokens.join(" ") === pTokens.join(" ")) return true;
  let query = splitGivenFamily(qTokens);
  let person = splitGivenFamily(pTokens);
  if (
    qTokens.length >= 2 &&
    pTokens.length >= 3 &&
    qTokens.slice(-2).join(" ") === pTokens.slice(-2).join(" ")
  ) {
    query = { given: qTokens.slice(0, -2), family: qTokens.slice(-2) };
    person = { given: pTokens.slice(0, -2), family: pTokens.slice(-2) };
  }
  if (query.family.join(" ") !== person.family.join(" ")) return false;
  return sameGiven(query.given, person.given);
}

function chamberOfRole(role) {
  const text = String(role || "").toLowerCase();
  if (!text.startsWith("state")) return "";
  return text.includes("senator") ? "senate" : "house";
}

function chamberOfText(text) {
  if (/\b(sens?|senators?)\b/i.test(text || "")) return "senate";
  if (/\b(reps?|representatives?|dels?|delegates?)\b/i.test(text || "")) return "house";
  return "";
}

function districtNumber(text) {
  const match = String(text || "").match(/(?:district|dist\.?)\s*([0-9]+[a-z]?)/i);
  return match ? match[1].toLowerCase() : "";
}

function matchLegislator(queryText, people, district, chamber) {
  const matches = people.filter((person) => {
    if (!person.id || !person.name) return false;
    const roleChamber = chamberOfRole(person.role);
    if (!roleChamber) return false;
    if (chamber && roleChamber !== chamber) return false;
    if (district && districtNumber(person.district) !== district) return false;
    return namesMatch(queryText, person.name);
  });
  return matches.length === 1 ? matches[0] : null;
}

function personQueries(label) {
  const district = districtNumber(label);
  const chamber = chamberOfText(label);
  let cleaned = String(label).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/^(house sponsor|senate sponsor|coauthors?|sponsors?)\s+/i, "");
  cleaned = cleaned.replace(/^(reps?|sens?|dels?|delegates?|senators?|representatives?)\.?\s+/i, "");
  cleaned = cleaned.replace(/\s+of\s+[A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+)*$/, "");
  const queries = cleaned.split(/\s+and\s+/i).map((part) => part.trim()).filter((part) => {
    return part && /[A-Za-z]/.test(part) && !/committee/i.test(part);
  });
  return { district, chamber, queries };
}

function hasGivenName(queryText) {
  return queryTokens(queryText).length >= 2;
}

function legislatorHref(person, stateName, billId) {
  const from = `${billId}/${slugify(stateName)}`;
  return `profile.html?from=${encodeURIComponent(from)}#${slugify(stateName)}/${person.id}`;
}

function linkPeople(label, people, stateName, billId, chamberHint) {
  const parsed = personQueries(label);
  const chamber = parsed.chamber || chamberHint || "";
  const found = [];
  for (const query of parsed.queries) {
    let person = matchLegislator(query, people, parsed.district, chamber);
    if (!person && chamber && hasGivenName(query)) {
      person = matchLegislator(query, people, parsed.district, "");
    }
    if (!person) continue;
    const start = label.indexOf(query);
    if (start < 0) continue;
    found.push({ start, end: start + query.length, person });
  }
  if (!found.length) return escapeHtml(label);
  const singlePerson = parsed.queries.length === 1 && !/\band\b/i.test(label) && !/committee/i.test(label);
  if (singlePerson) {
    const href = legislatorHref(found[0].person, stateName, billId);
    return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }
  found.sort((a, b) => a.start - b.start);
  let html = "";
  let cursor = 0;
  for (const match of found) {
    html += escapeHtml(label.slice(cursor, match.start));
    const href = legislatorHref(match.person, stateName, billId);
    html += `<a href="${escapeHtml(href)}">${escapeHtml(label.slice(match.start, match.end))}</a>`;
    cursor = match.end;
  }
  html += escapeHtml(label.slice(cursor));
  return html;
}

function paragraphs(items) {
  return (items || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function render(bill, stateName, record, profile, directory) {
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
  const chamberHint = chamberOfText(profile.introducedBy || "");
  const introducedBy = profile.introducedBy
    ? linkPeople(profile.introducedBy, directory, stateName, bill.id, "")
    : "";
  const sponsors = (profile.sponsors || [])
    .map((name) => linkPeople(name, directory, stateName, bill.id, chamberHint))
    .join(", ");
  const facts = [
    fact("Introduced", profile.introduced ? escapeHtml(profile.introduced) : ""),
    fact("Introduced by", introducedBy),
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
  let directory = [];
  try {
    const [catalogResponse, profileResponse, peopleResponse] = await Promise.all([
      fetch("data/bills.json?v=9"),
      fetch("data/bill-profiles.json?v=1"),
      fetch(`data/profiles/${slugify(stateName)}.json`),
    ]);
    if (!catalogResponse.ok) throw new Error("Bill catalog failed to load");
    catalog = await catalogResponse.json();
    profiles = profileResponse.ok ? await profileResponse.json() : {};
    if (peopleResponse.ok) {
      const people = await peopleResponse.json();
      directory = Object.values(people.people || {});
    }
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
  render(bill, stateName, record, profile, directory);
}

main();

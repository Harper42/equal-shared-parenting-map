const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

function formatDate(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function formatElection(value) {
  if (!value) return "";
  const [year, month] = value.split("-");
  if (month === "11") return `November ${year}`;
  return formatDate(value);
}

function telHref(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return digits ? `tel:${digits}` : "";
}

function fact(label, valueHtml) {
  if (!valueHtml) return "";
  return `<div class="profile-fact"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

function partyTag(party) {
  const text = String(party || "").split("/")[0].trim();
  return text ? ` (${escapeHtml(text)})` : "";
}

function gloss(label) {
  return String(label).replace(/[A-Za-z][A-Za-z'’-]+/g, (word) => {
    if (word === word.toUpperCase() && word.length <= 4) return word;
    return word.toLowerCase();
  });
}

function billMention(bill, record) {
  const href = `bill.html?bill=${encodeURIComponent(bill.id)}&state=${encodeURIComponent(record.stateName)}`;
  const number = record.billId ? record.billId.toUpperCase() : "";
  const glossText = bill.label ? ` (${escapeHtml(gloss(bill.label))})` : "";
  if (number) {
    return `<a href="${escapeHtml(href)}">${escapeHtml(number)}</a>, ${escapeHtml(bill.title)}${glossText}`;
  }
  return `<a href="${escapeHtml(href)}">${escapeHtml(bill.title)}</a>${glossText}`;
}

function statusWords(record, stateName) {
  const state = escapeHtml(stateName);
  if (record.status === "passed" && record.caveat) {
    return {
      sentence: `It is marked passed in ${state}, with a caveat on the map.`,
      inline: `marked passed in ${state}, with a caveat on the map`,
    };
  }
  if (record.status === "passed") {
    return {
      sentence: `It is already law in ${state}.`,
      inline: `already law in ${state}`,
    };
  }
  if (record.stalled) {
    return {
      sentence: `It has stalled in the ${state} legislature.`,
      inline: `stalled in the ${state} legislature`,
    };
  }
  return {
    sentence: `It is still pending in the ${state} legislature.`,
    inline: `still pending in the ${state} legislature`,
  };
}

function labelMatchesPerson(person, label, people, chamberHint) {
  const parsed = personQueries(label);
  const chamber = parsed.chamber || chamberHint || "";
  return parsed.queries.some((query) => {
    let match = matchLegislator(query, people, parsed.district, chamber);
    if (!match && chamber && hasGivenName(query)) {
      match = matchLegislator(query, people, parsed.district, "");
    }
    return match && match.id === person.id;
  });
}

function billRole(person, bill, billProfiles, people) {
  const profile = billProfiles && billProfiles[bill.id] && billProfiles[bill.id][person.state];
  if (!profile) return "";
  if (profile.introducedBy && labelMatchesPerson(person, profile.introducedBy, people, "")) return "sponsored";
  const chamberHint = chamberOfText(profile.introducedBy || "");
  for (const label of profile.sponsors || []) {
    if (!labelMatchesPerson(person, label, people, chamberHint)) continue;
    if (/\bco-?authors?\b/i.test(label)) return "cosponsored";
    if (/\bsponsor\b/i.test(label) && !/co-?sponsor/i.test(label)) return "sponsored";
    return "cosponsored";
  }
  return "";
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function reformBlurb(person, catalog, billProfiles, people) {
  const sponsored = [];
  const cosponsored = [];
  for (const bill of catalog.bills) {
    const record = bill.states[person.state];
    if (!record || (record.status !== "passed" && record.status !== "progress")) continue;
    const role = billRole(person, bill, billProfiles, people);
    if (!role) continue;
    record.stateName = person.state;
    const entry = {
      verb: role,
      name: billMention(bill, record),
      status: statusWords(record, person.state),
    };
    if (role === "sponsored") sponsored.push(entry);
    else cosponsored.push(entry);
  }
  const entries = sponsored.concat(cosponsored);
  if (!entries.length) return "";
  const who = `${escapeHtml(person.name)}${partyTag(person.party)}`;
  if (entries.length === 1) {
    const entry = entries[0];
    return `${who} ${entry.verb} ${entry.name}. ${entry.status.sentence}`;
  }
  const parts = [];
  if (sponsored.length) {
    parts.push(`sponsored ${joinList(sponsored.map((entry) => `${entry.name}, ${entry.status.inline}`))}`);
  }
  if (cosponsored.length) {
    parts.push(`cosponsored ${joinList(cosponsored.map((entry) => `${entry.name}, ${entry.status.inline}`))}`);
  }
  return `${who} ${parts.join(" and ")}.`;
}

function renderProfile(person, catalog, billProfiles, people) {
  const place = person.district === "Statewide"
    ? person.state
    : `${person.district} · ${person.state}`;
  const email = person.email
    ? `<a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a>`
    : "";
  const phoneHref = person.phone ? telHref(person.phone) : "";
  const phone = phoneHref
    ? `<a href="${phoneHref}">${escapeHtml(person.phone)}</a>`
    : "";
  const links = [];
  if (person.contactForm) links.push(`<a href="${escapeHtml(person.contactForm)}">Contact form</a>`);
  if (person.website) links.push(`<a href="${escapeHtml(person.website)}">Website</a>`);
  if (person.legislatureUrl) {
    links.push(`<a href="${escapeHtml(person.legislatureUrl)}">${escapeHtml(person.legislatureLabel || "Official page")}</a>`);
  }
  const photo = person.image
    ? `<img class="profile-photo" src="${escapeHtml(person.image)}" alt="">`
    : "";
  const facts = [
    fact("Party", person.party ? escapeHtml(person.party) : ""),
    fact("Current term began", escapeHtml(formatDate(person.termBegan))),
    fact("First took office", escapeHtml(formatDate(person.firstOffice))),
    fact("Current term ends", escapeHtml(formatDate(person.termEnds))),
    fact("Next election", escapeHtml(formatElection(person.nextElection) || "Not listed in the legislative directory")),
    fact("Email", email),
    fact("Phone", phone),
  ].join("");

  const reform = reformBlurb(person, catalog, billProfiles, people);
  document.title = `${person.name} · Family Court Reforms Map`;
  document.getElementById("profile").innerHTML = `
    <article class="profile-card">
      <div class="profile-head">
        ${photo}
        <div>
          <h1>${escapeHtml(person.name)}</h1>
          <p class="profile-role">${escapeHtml(person.role)} · ${escapeHtml(place)}</p>
        </div>
      </div>
      <dl class="profile-facts">${facts}</dl>
      ${links.length ? `<div class="profile-links">${links.join("")}</div>` : ""}
      ${reform ? `<section class="profile-stance"><h2>Family court reform</h2><p>${reform}</p></section>` : ""}
    </article>
  `;
  const image = document.querySelector(".profile-photo");
  if (image) image.addEventListener("error", () => image.remove());
}

function showMessage(text) {
  document.getElementById("profile").innerHTML = `<p class="profile-message">${escapeHtml(text)}</p>`;
}

async function init() {
  const back = document.getElementById("back");
  const from = new URLSearchParams(location.search).get("from");
  if (from) {
    back.href = `index.html#${from}`;
  } else {
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === location.origin && (ref.pathname.endsWith("/") || ref.pathname.endsWith("/index.html"))) {
        back.href = document.referrer;
      }
    } catch (_error) {
      /* Keep the default map link. */
    }
  }

  const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
  const slash = raw.indexOf("/");
  if (slash <= 0) {
    showMessage("Choose a legislator from a county on the map.");
    return;
  }
  const stateSlug = raw.slice(0, slash);
  const id = raw.slice(slash + 1);
  try {
    const [profileResponse, billResponse, sponsorResponse] = await Promise.all([
      fetch(`data/profiles/${stateSlug}.json`),
      fetch("data/bills.json?v=9"),
      fetch("data/bill-profiles.json?v=1"),
    ]);
    if (!profileResponse.ok) throw new Error("Profile file missing");
    const [profiles, catalog, billProfiles] = await Promise.all([
      profileResponse.json(),
      billResponse.json(),
      sponsorResponse.ok ? sponsorResponse.json() : {},
    ]);
    const person = profiles.people && profiles.people[id];
    if (!person) {
      showMessage("This legislator is not in the directory.");
      return;
    }
    renderProfile(person, catalog, billProfiles, Object.values(profiles.people || {}));
  } catch (error) {
    console.error(error);
    showMessage("This profile could not be loaded.");
  }
}

init();
window.addEventListener("hashchange", init);

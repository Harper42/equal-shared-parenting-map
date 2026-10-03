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

function billName(bill) {
  return bill.label ? `${bill.title} (${bill.label})` : bill.title;
}

function billLabel(bill, record) {
  const number = record.billId ? ` (${record.billId.toUpperCase()})` : "";
  const href = `index.html#${bill.id}/${slugify(record.stateName)}`;
  return `<a href="${escapeHtml(href)}">${escapeHtml(billName(bill) + number)}</a>`;
}

function reformBlurb(person, catalog) {
  const passed = [];
  const caveats = [];
  const progress = [];
  for (const bill of catalog.bills) {
    const record = bill.states[person.state];
    if (!record) continue;
    record.stateName = person.state;
    if (record.status === "passed" && record.caveat) caveats.push(billLabel(bill, record));
    else if (record.status === "passed") passed.push(billLabel(bill, record));
    if (record.status === "progress") progress.push(billLabel(bill, record));
  }
  const sentences = [];
  if (progress.length === 1) {
    sentences.push(`${progress[0]} is in the ${escapeHtml(person.state)} legislature.`);
  } else if (progress.length > 1) {
    sentences.push(`These bills are in the ${escapeHtml(person.state)} legislature: ${progress.join("; ")}.`);
  }
  if (passed.length === 1) {
    sentences.push(`${passed[0]} is already law in ${escapeHtml(person.state)}.`);
  } else if (passed.length > 1) {
    sentences.push(`These bills are already law in ${escapeHtml(person.state)}: ${passed.join("; ")}.`);
  }
  if (caveats.length === 1) {
    sentences.push(`${caveats[0]} is marked passed in ${escapeHtml(person.state)}, with a caveat on the map.`);
  } else if (caveats.length > 1) {
    sentences.push(`These bills are marked passed in ${escapeHtml(person.state)}, with a caveat on the map: ${caveats.join("; ")}.`);
  }
  if (!sentences.length) {
    sentences.push(`None of the bills in this stack have been introduced or signed in ${escapeHtml(person.state)}.`);
  }
  sentences.push(`A public position from ${escapeHtml(person.name)} on these bills is not in this directory. The contact details above are the way to ask where they stand.`);
  return sentences.join(" ");
}

function renderProfile(person, catalog) {
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
      <section class="profile-stance">
        <h2>Family court reform</h2>
        <p>${reformBlurb(person, catalog)}</p>
      </section>
      <p class="meta profile-source">Term dates, party, phone, and links come from Open States for state legislators and from the congress-legislators project for members of Congress. Bill status is from Robert Garza’s tracker, read on September 24, 2026.</p>
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
    const [profileResponse, billResponse] = await Promise.all([
      fetch(`data/profiles/${stateSlug}.json`),
      fetch("data/bills.json?v=7"),
    ]);
    if (!profileResponse.ok) throw new Error("Profile file missing");
    const [profiles, catalog] = await Promise.all([profileResponse.json(), billResponse.json()]);
    const person = profiles.people && profiles.people[id];
    if (!person) {
      showMessage("This legislator is not in the directory.");
      return;
    }
    renderProfile(person, catalog);
  } catch (error) {
    console.error(error);
    showMessage("This profile could not be loaded.");
  }
}

init();
window.addEventListener("hashchange", init);

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

/**
 * Best-effort extraction of contact details from OCR text read off a
 * physical visiting card. Card layouts vary wildly, so this never claims
 * certainty — it fills what it can confidently identify and leaves
 * everything editable, the same way a human skimming the card would.
 */

export interface ScannedContact {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  designation?: string;
  address?: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /([+(]?\d[\d\s\-().]{7,}\d)/;
const WEBSITE_RE = /^(https?:\/\/|www\.)/i;

const DESIGNATION_KEYWORDS = [
  "manager",
  "director",
  "chief executive",
  "chief financial",
  "chief operating",
  "chief technology",
  "chief marketing",
  "ceo",
  "cfo",
  "coo",
  "cto",
  "cmo",
  "president",
  "vice president",
  "vp",
  "head of",
  "founder",
  "co-founder",
  "proprietor",
  "owner",
  "chairman",
  "chairperson",
  "partner",
  "advisor",
  "consultant",
  "executive",
  "officer",
  "engineer",
  "analyst",
  "associate",
  "assistant",
  "secretary",
  "treasurer",
  "sales",
  "marketing",
  "operations",
  "relationship manager",
];

const COMPANY_SUFFIXES = [
  "pvt",
  "ltd",
  "llc",
  "llp",
  "inc",
  "corp",
  "co.",
  "company",
  "enterprises",
  "solutions",
  "technologies",
  "industries",
  "group",
  "associates",
  "ventures",
  "capital",
  "finance",
  "advisory",
  "consulting",
];

const ADDRESS_KEYWORDS = [
  "road",
  "street",
  "st.",
  "floor",
  "building",
  "bldg",
  "nagar",
  "colony",
  "sector",
  "block",
  "lane",
  "marg",
  "chowk",
  "avenue",
  "cross",
  "opp.",
  "near",
  "pin",
  "pincode",
];

/** Stylised card fonts often OCR as letter-spaced text — "V I K R A M" — which
    would otherwise never pass as a name. Collapse runs of single letters
    separated by single spaces back into words, while leaving the wider gap
    between actual words (e.g. first and last name) alone. Must run before
    whitespace collapsing, since it depends on that wider gap still existing. */
function degapSpacedCaps(line: string) {
  return line.replace(/(?:\b[A-Za-z]\s){2,}[A-Za-z]\b/g, (match) =>
    match.replace(/\s+/g, "")
  );
}

function cleanLine(line: string) {
  return degapSpacedCaps(line.replace(/[|_~`]+/g, " ").trim()).replace(/\s{2,}/g, " ").trim();
}

function looksLikeAddress(line: string) {
  const lower = line.toLowerCase();
  const hasKeyword = ADDRESS_KEYWORDS.some((word) => lower.includes(word));
  const digitCount = (line.match(/\d/g) ?? []).length;
  return hasKeyword || (digitCount >= 3 && line.length > 15);
}

function looksLikeDesignation(line: string) {
  const lower = line.toLowerCase();
  return DESIGNATION_KEYWORDS.some((word) => lower.includes(word));
}

function looksLikeCompany(line: string) {
  const lower = line.toLowerCase();
  return COMPANY_SUFFIXES.some((word) => lower.includes(word));
}

function looksLikeName(line: string) {
  // A name reads as a couple of capitalised words, no digits, not a label
  // like "Mobile:" or "Email:".
  const digitCount = (line.match(/\d/g) ?? []).length;
  if (digitCount > 0) return false;
  if (line.length < 3 || line.length > 40) return false;
  if (/:/.test(line)) return false;

  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 4;
}

export function parseCardText(rawText: string): ScannedContact {
  const lines = rawText
    .split(/\r\n|\r|\n/)
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => !WEBSITE_RE.test(line));

  const contact: ScannedContact = {};
  const consumed = new Set<number>();

  const fullText = lines.join("\n");

  const emailMatch = fullText.match(EMAIL_RE);
  if (emailMatch) {
    contact.email = emailMatch[0];
    lines.forEach((line, index) => {
      if (line.includes(emailMatch[0])) consumed.add(index);
    });
  }

  const phoneMatch = fullText.match(PHONE_RE);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) {
      contact.phone = phoneMatch[0].trim();
      lines.forEach((line, index) => {
        if (line.includes(phoneMatch[0])) consumed.add(index);
      });
    }
  }

  lines.forEach((line, index) => {
    if (consumed.has(index)) return;

    if (!contact.designation && looksLikeDesignation(line)) {
      contact.designation = line;
      consumed.add(index);
    }
  });

  lines.forEach((line, index) => {
    if (consumed.has(index)) return;

    if (!contact.company && looksLikeCompany(line)) {
      contact.company = line;
      consumed.add(index);
    }
  });

  lines.forEach((line, index) => {
    if (consumed.has(index)) return;

    if (!contact.address && looksLikeAddress(line)) {
      contact.address = line;
      consumed.add(index);
    }
  });

  // The name is usually near the top of the card and reads like a short,
  // digit-free line that hasn't already been claimed as something else.
  for (let index = 0; index < lines.length; index += 1) {
    if (consumed.has(index)) continue;
    const line = lines[index]!;

    if (looksLikeName(line)) {
      contact.name = line;
      consumed.add(index);
      break;
    }
  }

  // Anything genuinely unclaimed and reasonably short is a fair guess for
  // company if none was found — better than leaving the field empty when a
  // card simply didn't use a recognisable legal suffix.
  if (!contact.company) {
    const leftover = lines.find(
      (line, index) => !consumed.has(index) && line !== contact.name
    );
    if (leftover) contact.company = leftover;
  }

  return contact;
}

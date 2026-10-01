// ===== CodeChat language engine — the ONLY place the alphabet lives =====
// A-J count down, K-T use alphabet position, U-Z use a step pattern.
const CODES = [0,9,8,7,6,5,4,3,2,1, 11,12,13,14,15,16,17,18,19,20, 23,34,45,56,67,78];
export const languageMap = {};
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((l, i) => (languageMap[l] = CODES[i]));
// reverseLanguageMap is generated automatically: code -> letter
export const reverseLanguageMap = Object.fromEntries(Object.entries(languageMap).map(([l, c]) => [String(c), l]));

// Punctuation rules (unambiguous because they are never plain numbers):
//  "/" = word separator | . , ! ? ; : ' " - ( ) = kept as-is
//  digits = "#5"        | any other symbol (incl. a real "/") = "&" + code point, e.g. "&47"
const KEEP = ".,!?;:'\"-()";
const encodeChar = (ch) => {
  const up = ch.toUpperCase();
  if (up in languageMap) return String(languageMap[up]);
  if (KEEP.includes(ch)) return ch;
  if (/^[0-9]$/.test(ch)) return "#" + ch;
  return "&" + ch.codePointAt(0);
};
export const encodeWord = (word) => Array.from(word).map(encodeChar).join(" ");

export function encodeMessage(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).map(encodeWord).join(" / ");
}

const decodeToken = (t) => {
  if (t in reverseLanguageMap) return reverseLanguageMap[t];
  if (t.length === 1 && KEEP.includes(t)) return t;
  if (/^#[0-9]$/.test(t)) return t[1];
  if (/^&\d+$/.test(t)) { try { return String.fromCodePoint(+t.slice(1)); } catch { return "[?]"; } }
  return "[?]"; // unknown code: never crash
};
export const decodeWord = (word) => String(word).trim().split(/\s+/).filter(Boolean).map(decodeToken).join("");

export function decodeMessage(encoded) {
  const words = []; let cur = [];
  for (const t of String(encoded).trim().split(/\s+/).filter(Boolean)) {
    if (t === "/") { words.push(cur.join(" ")); cur = []; } else cur.push(t);
  }
  words.push(cur.join(" "));
  return words.filter(Boolean).map(decodeWord).join(" ");
}

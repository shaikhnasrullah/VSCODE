import { db } from "./firebase-config.js";
import { requireAuth, logout, friendly } from "./auth.js";
import { encodeMessage, decodeMessage } from "./language.js";
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const names = new Map();               // uid -> username cache
let me, other = null, cid = null, unsubMsgs = null, msgs = [], sending = false;
const decodeTimers = new Map();        // messageId -> interval id (one independent timer per message)
const secondsLeft = new Map();         // messageId -> seconds remaining (client-side only, never saved)

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate(), now = new Date(), days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
async function nameOf(uid) {
  if (!names.has(uid)) names.set(uid, (await getDoc(doc(db, "users", uid))).data()?.username || "Unknown");
  return names.get(uid);
}

requireAuth((u) => {
  me = u; $("#logout").onclick = logout;
  nameOf(u.uid).then((n) => ($("#me").textContent = "@" + n));
  // Realtime list of MY conversations (limited; sorted client-side to avoid a composite index).
  onSnapshot(query(collection(db, "conversations"), where("participants", "array-contains", u.uid), limit(30)), async (snap) => {
    const rows = await Promise.all(snap.docs.map(async (d) => {
      const c = d.data(), oid = c.participants.find((p) => p !== u.uid);
      return { oid, name: await nameOf(oid), last: c.lastMessage || "", at: c.lastMessageAt };
    }));
    rows.sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
    $("#list").innerHTML = rows.length ? rows.map((r) => `<li><button class="row" data-uid="${r.oid}" data-name="${esc(r.name)}">
      <b>${esc(r.name)}</b><span class="code">${esc(r.last)}</span><small>${fmtTime(r.at)}</small></button></li>`).join("")
      : "<li class='muted'>No conversations yet.</li>";
  }, (e) => ($("#err").textContent = friendly(e)));
});

// ---- User search by @username or email ----
$("#searchForm").onsubmit = async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim().toLowerCase().replace(/^@/, ""), out = $("#results");
  if (!q) return; out.innerHTML = "<li class='muted'>Searching…</li>";
  try {
    let u = null;
    if (q.includes("@")) { const s = await getDocs(query(collection(db, "users"), where("email", "==", q), limit(1))); u = s.docs[0]?.data(); }
    else { const n = await getDoc(doc(db, "usernames", q)); if (n.exists()) u = (await getDoc(doc(db, "users", n.data().uid))).data(); }
    out.innerHTML = u && u.uid !== me.uid ? `<li class="row"><span>@${esc(u.username)}</span>
      <button data-uid="${u.uid}" data-name="${esc(u.username)}">Start Chat</button></li>` : "<li class='muted'>No CodeChat user found.</li>";
  } catch (er) { out.innerHTML = `<li class='muted'>${esc(friendly(er))}</li>`; }
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-uid]"); if (b) openChat(b.dataset.uid, b.dataset.name);
  const d = e.target.closest("[data-decode]"); if (d) startDecode(d.dataset.decode);
});
$("#back").onclick = () => document.body.classList.remove("chat-open");

// ---- Conversations ----
async function openChat(oid, name) {
  other = oid; cid = [me.uid, oid].sort().join("_"); // deterministic id => no duplicates
  clearTimers(); msgs = []; unsubMsgs?.();
  $("#title").textContent = "@" + name; $("#chat").hidden = false; $("#welcome").hidden = true;
  document.body.classList.add("chat-open");
  try { await setDoc(doc(db, "conversations", cid), { participants: [me.uid, oid].sort() }, { merge: true }); } catch (e) { $("#err").textContent = friendly(e); return; }
  // Latest 50 messages, realtime. (Older-page loading: add startAfter() with a "Load older" button.)
  unsubMsgs = onSnapshot(query(collection(db, "conversations", cid, "messages"), orderBy("createdAt", "desc"), limit(50)), (s) => {
    msgs = s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse(); render(true);
  }, (e) => ($("#err").textContent = friendly(e)));
}

// ---- Rendering. Senders get NO decode button; receivers do. (UI rule, not cryptography.) ----
function render(scroll) {
  const box = $("#msgs");
  if (!msgs.length) { box.innerHTML = `<div class="empty">No messages yet.<br>Start the conversation using CodeChat.<br><br>HELLO<br>↓<br><span class="code">3 6 12 12 15</span></div>`; return; }
  box.innerHTML = msgs.map((m) => {
    const mine = m.senderId === me.uid, left = secondsLeft.get(m.id);
    // Decoded text is computed client-side on demand; Firestore keeps the numeric version.
    const body = left ? `<div class="plain">${esc(decodeMessage(m.encodedText))}</div><small>Decoded • ${left}s</small>`
      : `<div class="code">${esc(m.encodedText)}</div>${mine ? "" : `<button data-decode="${m.id}">Decode</button>`}`;
    return `<div class="msg ${mine ? "mine" : "theirs"}">${body}<small>${fmtTime(m.createdAt)}</small></div>`;
  }).join("");
  if (scroll) box.scrollTop = box.scrollHeight;
}

// ---- 60-second decode: independent timer per message ----
function startDecode(id) {
  const m = msgs.find((x) => x.id === id);
  if (!m || m.senderId === me.uid) return;       // sender can never decode
  stopDecode(id); secondsLeft.set(id, 60); render();
  decodeTimers.set(id, setInterval(() => {
    const n = (secondsLeft.get(id) || 0) - 1;
    if (n <= 0) stopDecode(id); else secondsLeft.set(id, n);
    render();                                    // at 0 it reverts to numbers + Decode button
  }, 1000));
}
function stopDecode(id) { clearInterval(decodeTimers.get(id)); decodeTimers.delete(id); secondsLeft.delete(id); }
function clearTimers() { [...decodeTimers.keys()].forEach(stopDecode); } // leaving a chat resets all decodes

// ---- Sending: user types normal text, the app encodes it. Messages are create-only. ----
$("#input").oninput = () => { const v = $("#input").value.trim(); $("#preview").textContent = v ? "CodeChat: " + encodeMessage(v) : ""; };
$("#sendForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("#input").value.trim();
  if (!text || sending || !cid) return;           // no empty / duplicate sends
  sending = true; $("#send").disabled = true;
  try {
    const encodedText = encodeMessage(text);       // plain text is never stored
    await addDoc(collection(db, "conversations", cid, "messages"),
      { senderId: me.uid, receiverId: other, encodedText, createdAt: serverTimestamp(), type: "encoded" });
    await updateDoc(doc(db, "conversations", cid), { lastMessage: encodedText, lastMessageAt: serverTimestamp() });
    $("#input").value = ""; $("#preview").textContent = ""; $("#err").textContent = "";
  } catch (er) { $("#err").textContent = friendly(er); }
  sending = false; $("#send").disabled = false;
};

import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, runTransaction, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Turn raw Firebase errors into friendly messages.
export function friendly(e) {
  const m = { "auth/invalid-email": "That email address looks invalid.", "auth/wrong-password": "Wrong password.",
    "auth/invalid-credential": "Wrong email or password.", "auth/user-not-found": "No account with that email.",
    "auth/email-already-in-use": "That email is already registered.", "auth/weak-password": "Password must be at least 6 characters.",
    "auth/network-request-failed": "No internet connection.", "permission-denied": "You don't have permission to do that.",
    "unavailable": "Service unavailable. Try again shortly." };
  return m[e.code] || e.message || "Something went wrong.";
}

export async function signup(username, email, pw, pw2) {
  if (!/^[a-z0-9_]{3,20}$/i.test(username)) throw new Error("Username: 3-20 letters, numbers or underscores.");
  if (!email) throw new Error("Email is required.");
  if (pw !== pw2) throw new Error("Passwords do not match.");
  const lc = username.toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  const uid = cred.user.uid;
  try {
    // Transaction: claim usernames/{lc} only if free, and create the profile atomically.
    await runTransaction(db, async (tx) => {
      const nameRef = doc(db, "usernames", lc);
      if ((await tx.get(nameRef)).exists()) throw new Error("That username is taken.");
      tx.set(nameRef, { uid });
      tx.set(doc(db, "users", uid), { uid, username, usernameLowercase: lc, email: email.toLowerCase(), bio: "",
        photoURL: "", createdAt: serverTimestamp(), isOnline: true, lastSeen: serverTimestamp() });
    });
  } catch (e) { await cred.user.delete(); throw e; } // roll back the auth account
}
export const login = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export async function logout() {
  try { await updateDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: serverTimestamp() }); } catch {}
  await signOut(auth); location.href = "login.html";
}
// Protected pages call this; unauthenticated visitors go to login.
export function requireAuth(cb) {
  onAuthStateChanged(auth, (u) => (u ? cb(u) : (location.href = "login.html")));
}

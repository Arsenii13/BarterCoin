import { auth, db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function loadProfile() {
  const user = auth.currentUser;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const data = snap.data();

  document.getElementById("name").innerText = data.name;
  document.getElementById("rating").innerText =
    "Rating: " + data.rating;
}
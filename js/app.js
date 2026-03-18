import { auth, db, login, onAuthStateChanged } from "./firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import "./router.js";

const loginBtn = document.getElementById("loginBtn");
const balanceEl = document.getElementById("balance");

loginBtn.onclick = login;

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      name: user.displayName,
      email: user.email,
      balance: 20,
      rating: 5,
      ratingCount: 0
    });
  }

  const data = (await getDoc(ref)).data();
  balanceEl.innerText = `💰 ${data.balance} BC`;

  navigate("market");
});
import { db } from "./firebase.js";
import {
  collection, getDocs, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function renderAdmin(app) {
  const snapshot = await getDocs(collection(db, "users"));

  app.innerHTML = "<h2>Admin</h2>";

  snapshot.forEach(u => {
    const d = u.data();

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <p>${d.name} - ${d.balance}</p>
      <button>+10</button>
    `;

    div.querySelector("button").onclick = async () => {
      const ref = doc(db, "users", u.id);
      const snap = await getDoc(ref);

      await updateDoc(ref, {
        balance: snap.data().balance + 10
      });
    };

    app.appendChild(div);
  });
}
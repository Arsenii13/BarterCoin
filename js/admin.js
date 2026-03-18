import { db } from "./firebase.js";
import {
  collection, getDocs, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  const container = document.getElementById("usersList");

  snapshot.forEach(docSnap => {
    const d = docSnap.data();

    const div = document.createElement("div");
    div.innerHTML = `
      <p>${d.name} - ${d.balance} BC</p>
      <button onclick="give('${docSnap.id}')">+10</button>
    `;

    container.appendChild(div);
  });
}

window.give = async (id) => {
  const ref = doc(db, "users", id);
  const snap = await getDoc(ref);

  await updateDoc(ref, {
    balance: snap.data().balance + 10
  });
};
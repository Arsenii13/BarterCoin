import { db, auth } from "./firebase.js";
import {
  collection, addDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export function initChat() {
  const input = document.getElementById("msg");
  const box = document.getElementById("chatBox");

  document.getElementById("send").onclick = async () => {
    await addDoc(collection(db, "messages"), {
      text: input.value,
      user: auth.currentUser.displayName,
      createdAt: Date.now()
    });
    input.value = "";
  };

  const q = query(collection(db, "messages"), orderBy("createdAt"));

  onSnapshot(q, snapshot => {
    box.innerHTML = "";
    snapshot.forEach(doc => {
      const d = doc.data();
      box.innerHTML += `<p><b>${d.user}:</b> ${d.text}</p>`;
    });
  });
}
import { db, auth } from "./firebase.js";
import {
  collection, addDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export function renderChat(app) {
  app.innerHTML = `
    <h2>Chat</h2>
    <div id="chatBox"></div>
    <input id="msg">
    <button id="send">Send</button>
  `;

  send.onclick = async () => {
    await addDoc(collection(db, "messages"), {
      text: msg.value,
      user: auth.currentUser.displayName,
      createdAt: Date.now()
    });
  };

  const q = query(collection(db, "messages"), orderBy("createdAt"));

  onSnapshot(q, snap => {
    chatBox.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      chatBox.innerHTML += `<p><b>${d.user}:</b> ${d.text}</p>`;
    });
  });
}
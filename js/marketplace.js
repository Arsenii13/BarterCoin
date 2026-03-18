import { db, auth } from "./firebase.js";
import {
  collection, addDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { buy } from "./wallet.js";

export async function renderMarket(app) {
  const snapshot = await getDocs(collection(db, "listings"));

  app.innerHTML = "<h2>Marketplace</h2>";

  snapshot.forEach(docSnap => {
    const d = docSnap.data();

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${d.title}</h3>
      <p>${d.description}</p>
      <p>${d.price} BC</p>
      <button>Buy</button>
    `;

    div.querySelector("button").onclick = () =>
      buy(docSnap.id, d.price, d.sellerId);

    app.appendChild(div);
  });
}

export function renderSell(app) {
  app.innerHTML = `
    <h2>Create Listing</h2>
    <input id="title" placeholder="Title">
    <textarea id="desc"></textarea>
    <input id="price" type="number">
    <button id="create">Create</button>
  `;

  document.getElementById("create").onclick = async () => {
    await addDoc(collection(db, "listings"), {
      title: title.value,
      description: desc.value,
      price: Number(price.value),
      sellerId: auth.currentUser.uid,
      createdAt: Date.now(),
      status: "active"
    });

    alert("Created!");
  };
}
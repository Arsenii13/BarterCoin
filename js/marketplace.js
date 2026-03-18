import { db, auth } from "./firebase.js";
import { 
  collection, addDoc, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { buy } from "./wallet.js";

window.buy = buy;

export async function createListing(title, description, price) {
  const user = auth.currentUser;

  await addDoc(collection(db, "listings"), {
    title,
    description,
    price: Number(price),
    sellerId: user.uid,
    createdAt: Date.now(),
    status: "active"
  });

  alert("Created!");
}

export async function loadListings() {
  const snapshot = await getDocs(collection(db, "listings"));
  const container = document.getElementById("listings");

  snapshot.forEach(docSnap => {
    const d = docSnap.data();

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${d.title}</h3>
      <p>${d.description}</p>
      <p>${d.price} BC</p>
      <button onclick="buy('${docSnap.id}', ${d.price}, '${d.sellerId}')">Buy</button>
    `;

    container.appendChild(div);
  });
}
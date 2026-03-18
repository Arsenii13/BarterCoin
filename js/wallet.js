import { db, auth } from "./firebase.js";
import {
  doc, getDoc, updateDoc, getDocs, collection
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function renderWallet(app) {
  app.innerHTML = `
    <h2>Wallet</h2>
    <select id="users"></select>
    <input id="amount" type="number">
    <button id="send">Send</button>
  `;

  const users = await getDocs(collection(db, "users"));

  users.forEach(u => {
    if (u.id === auth.currentUser.uid) return;
    usersSelect.innerHTML += `<option value="${u.id}">${u.data().name}</option>`;
  });

  send.onclick = async () => {
    const amountVal = Number(amount.value);

    const fromRef = doc(db, "users", auth.currentUser.uid);
    const toRef = doc(db, "users", usersSelect.value);

    const from = (await getDoc(fromRef)).data();
    const to = (await getDoc(toRef)).data();

    if (from.balance < amountVal) return alert("Not enough");

    await updateDoc(fromRef, {
      balance: from.balance - amountVal
    });

    await updateDoc(toRef, {
      balance: to.balance + amountVal * 0.85
    });

    alert("Sent!");
  };
}

export async function buy(listingId, price, sellerId) {
  const buyerRef = doc(db, "users", auth.currentUser.uid);
  const buyer = (await getDoc(buyerRef)).data();

  if (buyer.balance < price) return alert("Not enough");

  await updateDoc(buyerRef, {
    balance: buyer.balance - price
  });

  const sellerRef = doc(db, "users", sellerId);
  const seller = (await getDoc(sellerRef)).data();

  await updateDoc(sellerRef, {
    balance: seller.balance + price * 0.9
  });

  alert("Bought!");
}
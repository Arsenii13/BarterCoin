import { db, auth } from "./firebase.js";
import {
  doc, getDoc, updateDoc, addDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// BUY WITH LOCK
export async function buy(listingId, price, sellerId) {
  const user = auth.currentUser;
  if (!user) return alert("Login first");

  const buyerRef = doc(db, "users", user.uid);
  const buyerSnap = await getDoc(buyerRef);

  if (buyerSnap.data().balance < price) {
    return alert("Not enough funds");
  }

  // Prevent double click
  if (window.buying) return;
  window.buying = true;

  await updateDoc(buyerRef, {
    balance: buyerSnap.data().balance - price
  });

  const txRef = await addDoc(collection(db, "transactions"), {
    buyerId: user.uid,
    sellerId,
    listingId,
    amount: price,
    status: "pending",
    createdAt: Date.now()
  });

  await addDoc(collection(db, "escrow"), {
    transactionId: txRef.id,
    amount: price
  });

  alert("In escrow. Wait for delivery.");

  window.buying = false;
}

// DIRECT TRANSFER
export async function sendMoney(toUserId, amount) {
  const user = auth.currentUser;

  const fromRef = doc(db, "users", user.uid);
  const toRef = doc(db, "users", toUserId);

  const fromSnap = await getDoc(fromRef);
  const toSnap = await getDoc(toRef);

  if (fromSnap.data().balance < amount) {
    return alert("Not enough");
  }

  const taxed = amount * 0.85;

  await updateDoc(fromRef, {
    balance: fromSnap.data().balance - amount
  });

  await updateDoc(toRef, {
    balance: toSnap.data().balance + taxed
  });

  alert("Sent!");
}

// LOAD USERS DROPDOWN
export async function loadUsersDropdown() {
  const snapshot = await getDocs(collection(db, "users"));
  const select = document.getElementById("users");

  snapshot.forEach(docSnap => {
    const option = document.createElement("option");
    option.value = docSnap.id;
    option.text = docSnap.data().name;
    select.appendChild(option);
  });
}
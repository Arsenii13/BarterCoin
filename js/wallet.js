import { db, auth } from "./firebase.js";
import { 
  doc, getDoc, updateDoc, addDoc, collection 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function loadBalance() {
  const user = auth.currentUser;
  if (!user) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  document.getElementById("balance").innerText =
    "Balance: " + snap.data().balance + " BC";
}

export async function buy(listingId, price, sellerId) {
  const user = auth.currentUser;

  const buyerRef = doc(db, "users", user.uid);
  const buyerSnap = await getDoc(buyerRef);

  if (buyerSnap.data().balance < price) {
    alert("Not enough funds");
    return;
  }

  // Deduct
  await updateDoc(buyerRef, {
    balance: buyerSnap.data().balance - price
  });

  // Transaction
  const tx = await addDoc(collection(db, "transactions"), {
    buyerId: user.uid,
    sellerId,
    listingId,
    amount: price,
    status: "pending"
  });

  // Escrow
  await addDoc(collection(db, "escrow"), {
    transactionId: tx.id,
    amount: price
  });

  alert("Sent to escrow!");
}
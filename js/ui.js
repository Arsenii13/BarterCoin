import { db } from "./firebase.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function rateUser(userId, rating) {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  const data = snap.data();

  const newCount = data.ratingCount + 1;
  const newRating =
    (data.rating * data.ratingCount + rating) / newCount;

  await updateDoc(ref, {
    rating: newRating,
    ratingCount: newCount
  });

  alert("Rated!");
}
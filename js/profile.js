import { db, auth } from "./firebase.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function renderProfile(app) {
  const ref = doc(db, "users", auth.currentUser.uid);
  const data = (await getDoc(ref)).data();

  app.innerHTML = `
    <h2>${data.name}</h2>
    <p>Rating: ${data.rating}</p>
    <input id="rateVal" type="number" max="5">
    <button id="rate">Rate someone</button>
  `;

  rate.onclick = async () => {
    const val = Number(rateVal.value);

    const newRating =
      (data.rating * data.ratingCount + val) /
      (data.ratingCount + 1);

    await updateDoc(ref, {
      rating: newRating,
      ratingCount: data.ratingCount + 1
    });

    alert("Rated!");
  };
}
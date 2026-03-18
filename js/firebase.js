import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { 
  getFirestore 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { 
  apiKey: "AIzaSyAqVEpAQ8sT15lLoWzJe0jmFGE3jsU_BTQ",
  authDomain: "bartercoin-3fc73.firebaseapp.com",
  projectId: "bartercoin-3fc73",
  storageBucket: "bartercoin-3fc73.appspot.com",
  messagingSenderId: "1047699487399",
  appId: "1:1047699487399:web:a54c50ac062f857a923982"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

export function login() {
  return signInWithPopup(auth, provider);
}

export { onAuthStateChanged };
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
getAuth,
GoogleAuthProvider,
signInWithPopup,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
getFirestore,
doc,
getDoc,
setDoc,
updateDoc,
collection,
addDoc,
getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const firebaseConfig = {
apiKey: "AIzaSyAqVEpAQ8sT15lLoWzJe0jmFGE3jsU_BTQ",
authDomain: "bartercoin-3fc73.firebaseapp.com",
projectId: "bartercoin-3fc73",
storageBucket: "bartercoin-3fc73.appspot.com",
messagingSenderId: "1047699487399",
appId: "1:1047699487399:web:a54c50ac062f857a923982"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

const provider = new GoogleAuthProvider();



document.getElementById("googleLogin").onclick = () => {

signInWithPopup(auth, provider);

};



onAuthStateChanged(auth, async (user)=>{

if(!user) return;

document.getElementById("loginArea").style.display="none";
document.getElementById("appArea").style.display="block";

document.getElementById("username").textContent = user.displayName;

const userRef = doc(db,"users",user.uid);

const userSnap = await getDoc(userRef);

if(!userSnap.exists()){

await setDoc(userRef,{
name:user.displayName,
balance:20
});

}

loadBalance(user.uid);
loadUsers();
loadMarketplace();

});



async function loadBalance(uid){

const ref = doc(db,"users",uid);

const snap = await getDoc(ref);

document.getElementById("balance").textContent = snap.data().balance;

}



async function loadUsers(){

const dropdown = document.getElementById("userDropdown");

dropdown.innerHTML="";

const query = await getDocs(collection(db,"users"));

query.forEach(docSnap=>{

if(docSnap.id === auth.currentUser.uid) return;

const data = docSnap.data();

const option = document.createElement("option");

option.value = docSnap.id;
option.textContent = data.name;

dropdown.appendChild(option);

});

}



document.getElementById("sendCoins").onclick = async ()=>{

const sender = auth.currentUser.uid;

const receiver = document.getElementById("userDropdown").value;

const amount = Number(document.getElementById("amount").value);

if(amount <=0) return;



const senderRef = doc(db,"users",sender);
const receiverRef = doc(db,"users",receiver);

const senderSnap = await getDoc(senderRef);

const senderBalance = senderSnap.data().balance;

if(senderBalance < amount){

alert("Not enough coins");
return;

}

await updateDoc(senderRef,{
balance: senderBalance - amount
});

const receiverSnap = await getDoc(receiverRef);

await updateDoc(receiverRef,{
balance: receiverSnap.data().balance + amount
});

loadBalance(sender);

};



document.getElementById("createListing").onclick = async ()=>{

const name = document.getElementById("itemName").value;

const price = Number(document.getElementById("price").value);

if(!name || price<=0) return;

await addDoc(collection(db,"listings"),{

title:name,
price:price,
sellerUid:auth.currentUser.uid,
status:"active"

});

loadMarketplace();

};



async function loadMarketplace(){

const container = document.getElementById("marketplace");

container.innerHTML="";

const query = await getDocs(collection(db,"listings"));

query.forEach(docSnap=>{

const item = docSnap.data();

if(item.status !== "active") return;

const div = document.createElement("div");

div.className="card";

div.innerHTML = `
<b>${item.title}</b><br>
Price: ${item.price} BC
`;

container.appendChild(div);

});

}
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
getAuth,
GoogleAuthProvider,
signInWithPopup,
onAuthStateChanged,
signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
getFirestore,
doc,
setDoc,
getDoc,
updateDoc,
collection,
addDoc,
getDocs,
runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const firebaseConfig = {

apiKey:"PASTE",
authDomain:"PASTE",
projectId:"PASTE",
storageBucket:"PASTE",
messagingSenderId:"PASTE",
appId:"PASTE"

};

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);

let currentUser=null;


const loginBtn=document.getElementById("loginBtn");
const logoutBtn=document.getElementById("logoutBtn");

const walletPage=document.getElementById("walletPage");
const marketPage=document.getElementById("marketPage");
const transferPage=document.getElementById("transferPage");
const loginPage=document.getElementById("loginPage");

const balanceEl=document.getElementById("balance");

const navWallet=document.getElementById("navWallet");
const navMarket=document.getElementById("navMarket");
const navTransfer=document.getElementById("navTransfer");


function showPage(page){

walletPage.style.display="none";
marketPage.style.display="none";
transferPage.style.display="none";

page.style.display="block";

}

navWallet.onclick=()=>showPage(walletPage);
navMarket.onclick=()=>showPage(marketPage);
navTransfer.onclick=()=>showPage(transferPage);



loginBtn.onclick=async()=>{

const provider=new GoogleAuthProvider();

const result=await signInWithPopup(auth,provider);

const user=result.user;

const ref=doc(db,"users",user.uid);

const snap=await getDoc(ref);

if(!snap.exists()){

await setDoc(ref,{
name:user.displayName,
balance:100
});

}

};



logoutBtn.onclick=()=>signOut(auth);



onAuthStateChanged(auth,async(user)=>{

if(user){

currentUser=user;

loginPage.style.display="none";

await loadBalance();
await loadUsers();
await loadOffers();

showPage(walletPage);

}else{

loginPage.style.display="block";

}

});



async function loadBalance(){

const snap=await getDoc(doc(db,"users",currentUser.uid));

balanceEl.textContent=snap.data().balance;

}



document.getElementById("postOfferBtn").onclick=async()=>{

const title=document.getElementById("offerTitle").value;
const price=parseInt(document.getElementById("offerPrice").value);
const desc=document.getElementById("offerDesc").value;

await addDoc(collection(db,"offers"),{

title,
price,
desc,
seller:currentUser.uid

});

loadOffers();

};



async function loadOffers(){

const list=document.getElementById("offersList");

list.innerHTML="";

const query=await getDocs(collection(db,"offers"));

query.forEach(docu=>{

const data=docu.data();

const div=document.createElement("div");

div.className="offer";

div.innerHTML=`

<h4>${data.title}</h4>

<p>${data.desc}</p>

Price: ${data.price} BC

<br><br>

<button>Buy</button>

`;

div.querySelector("button").onclick=()=>buyOffer(data);

list.appendChild(div);

});

}



async function buyOffer(data){

if(data.seller===currentUser.uid){

alert("You cannot buy your own offer");

return;

}

const buyerRef=doc(db,"users",currentUser.uid);
const sellerRef=doc(db,"users",data.seller);

try{

await runTransaction(db,async(transaction)=>{

const buyerSnap=await transaction.get(buyerRef);
const sellerSnap=await transaction.get(sellerRef);

let buyerBal=buyerSnap.data().balance;

if(buyerBal<data.price){

throw "Not enough coins";

}

transaction.update(buyerRef,{
balance:buyerBal-data.price
});

transaction.update(sellerRef,{
balance:sellerSnap.data().balance+data.price
});

});

alert("Purchase successful");

loadBalance();

}catch(e){

alert(e);

}

}



async function loadUsers(){

const select=document.getElementById("userSelect");

select.innerHTML="";

const query=await getDocs(collection(db,"users"));

query.forEach(u=>{

if(u.id===currentUser.uid)return;

const opt=document.createElement("option");

opt.value=u.id;
opt.textContent=u.data().name;

select.appendChild(opt);

});

}



document.getElementById("sendBtn").onclick=async()=>{

const uid=document.getElementById("userSelect").value;

const amount=parseInt(document.getElementById("transferAmount").value);

const myRef=doc(db,"users",currentUser.uid);
const otherRef=doc(db,"users",uid);

await runTransaction(db,async(transaction)=>{

const mySnap=await transaction.get(myRef);
const otherSnap=await transaction.get(otherRef);

let myBal=mySnap.data().balance;

if(myBal<amount){

throw "Not enough coins";

}

transaction.update(myRef,{
balance:myBal-amount
});

transaction.update(otherRef,{
balance:otherSnap.data().balance+amount
});

});

loadBalance();

alert("Transfer complete");

};
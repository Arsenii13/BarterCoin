import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const userRef=doc(db,"users",user.uid);
const snap=await getDoc(userRef);

if(!snap.exists()){
await setDoc(userRef,{
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

const offersList=document.getElementById("offersList");
offersList.innerHTML="";

const querySnap=await getDocs(collection(db,"offers"));

querySnap.forEach(docu=>{

const data=docu.data();

const div=document.createElement("div");
div.className="offer";

div.innerHTML=`
<h4>${data.title}</h4>
<p>${data.desc}</p>
Price: ${data.price} BC
<br>
<button data-id="${docu.id}">Buy</button>
`;

div.querySelector("button").onclick=()=>buyOffer(docu.id,data);

offersList.appendChild(div);

});

}

async function buyOffer(id,data){

if(data.seller===currentUser.uid){
alert("You can't buy your own offer");
return;
}

const buyerRef=doc(db,"users",currentUser.uid);
const sellerRef=doc(db,"users",data.seller);

const buyerSnap=await getDoc(buyerRef);

let buyerBal=buyerSnap.data().balance;

if(buyerBal<data.price){
alert("Not enough coins");
return;
}

await updateDoc(buyerRef,{balance:buyerBal-data.price});

const sellerSnap=await getDoc(sellerRef);
let sellerBal=sellerSnap.data().balance;

await updateDoc(sellerRef,{balance:sellerBal+data.price});

loadBalance();

alert("Purchase successful");

}

async function loadUsers(){

const select=document.getElementById("userSelect");
select.innerHTML="";

const querySnap=await getDocs(collection(db,"users"));

querySnap.forEach(u=>{

if(u.id===currentUser.uid)return;

const option=document.createElement("option");

option.value=u.id;
option.textContent=u.data().name;

select.appendChild(option);

});

}

document.getElementById("sendBtn").onclick=async()=>{

const uid=document.getElementById("userSelect").value;
const amount=parseInt(document.getElementById("transferAmount").value);

const myRef=doc(db,"users",currentUser.uid);
const otherRef=doc(db,"users",uid);

const mySnap=await getDoc(myRef);
let myBal=mySnap.data().balance;

if(myBal<amount){
alert("Not enough coins");
return;
}

await updateDoc(myRef,{balance:myBal-amount});

const otherSnap=await getDoc(otherRef);
let otherBal=otherSnap.data().balance;

await updateDoc(otherRef,{balance:otherBal+amount});

loadBalance();

alert("Transfer complete");

};
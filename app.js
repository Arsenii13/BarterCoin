
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  getAuth
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";

const config = {
  apiKey: "AIzaSyAqVEpAQ8sT15lLoWzJe0jmFGE3jsU_BTQ",
  authDomain: "bartercoin-3fc73.firebaseapp.com",
  projectId: "bartercoin-3fc73",
  storageBucket: "bartercoin-3fc73.firebasestorage.app",
  messagingSenderId: "1047699487399",
  appId: "1:1047699487399:web:a54c50ac062f857a923982",
  measurementId: "G-YEBFDLKLCM"
};

const ADMIN_EMAIL = "admin@bartercoin.school";
const ADMIN_PASSWORD = "090906";
const STARTER_BALANCE = 500;

const firebaseApp = initializeApp(config);

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const provider = new GoogleAuthProvider();

const fnBuyWithEscrow = httpsCallable(functions, "buyWithEscrow");
const fnConfirmRelease = httpsCallable(functions, "confirmRelease");
const fnResolveDispute = httpsCallable(functions, "resolveDispute");
const fnSetUserRole = httpsCallable(functions, "setUserRole");
const fnBulkModerateListings = httpsCallable(functions, "bulkModerateListings");
const fnIssueReward = httpsCallable(functions, "issueReward");

const app = document.getElementById("app");

const state = {
  ui: {
    view: "overview",
    authMode: "signin",
    info: "",
    error: "",
    loading: true,
    lang: localStorage.getItem("bc-lang") || "en",
    search: "",
    category: "all",
    sort: "newest",
    priceMin: "",
    priceMax: "",
    selectedOrderId: "",
    moderationFilter: "pending_review"
  },
  me: null,
  role: "student",
  profiles: [],
  wallets: [],
  listings: [],
  orders: [],
  messages: [],
  disputes: [],
  ledger: [],
  notifications: [],
  sanctions: []
};

init().catch((error) => {
  state.ui.error = String(error.message || error);
  state.ui.loading = false;
  render();
});

async function init() {
  await ensureAdminBootstrap();
  onAuthStateChanged(auth, async (user) => {
    state.me = user;
    if (!user) {
      state.role = "student";
      resetData();
      state.ui.loading = false;
      render();
      return;
    }

    state.ui.loading = true;
    render();
    await ensureProfile(user);
    await loadAllData();
    state.role = getMyProfile()?.role || "student";
    if (state.ui.view === "council" && !canModerate()) {
      state.ui.view = "overview";
    }
    state.ui.loading = false;
    render();
  });
}

async function ensureAdminBootstrap() {
  if (localStorage.getItem("bc-admin-bootstrap") === "done") return;
  try {
    await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  } catch (error) {
    if (!String(error.code || "").includes("email-already-in-use")) {
      console.warn("admin bootstrap:", error);
    }
  }
  if (auth.currentUser) await signOut(auth);
  localStorage.setItem("bc-admin-bootstrap", "done");
}

function resetData() {
  state.profiles = [];
  state.wallets = [];
  state.listings = [];
  state.orders = [];
  state.messages = [];
  state.disputes = [];
  state.ledger = [];
  state.notifications = [];
  state.sanctions = [];
}

async function loadAllData() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    resetData();
    return;
  }

  const tokenResult = await auth.currentUser.getIdTokenResult();
  const tokenRole = tokenResult.claims.role || ((auth.currentUser.email || "").toLowerCase() === ADMIN_EMAIL ? "admin" : "student");
  const canReadAll = tokenRole === "admin" || tokenRole === "moderator";

  const profilesPromise = loadCollection(query(collection(db, "profiles"), orderBy("updatedAt", "desc"), limit(300)));
  const listingsPromise = loadCollection(query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(500)));
  const messagesPromise = loadCollection(query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(1000)));
  const disputesPromise = loadCollection(query(collection(db, "disputes"), orderBy("createdAt", "desc"), limit(500)));
  const notificationsPromise = loadCollection(
    query(collection(db, "notifications"), where("recipientId", "==", uid), orderBy("createdAt", "desc"), limit(150))
  );

  const walletsPromise = canReadAll
    ? loadCollection(query(collection(db, "wallets"), orderBy("updatedAt", "desc"), limit(300)))
    : loadSingleDocAsArray("wallets", uid);

  const ledgerPromise = canReadAll
    ? loadCollection(query(collection(db, "ledger"), orderBy("createdAt", "desc"), limit(1000)))
    : loadCollection(query(collection(db, "ledger"), where("ownerId", "==", uid), orderBy("createdAt", "desc"), limit(400)));

  const sanctionsPromise = canReadAll
    ? loadCollection(query(collection(db, "sanctions"), orderBy("updatedAt", "desc"), limit(300)))
    : loadSingleDocAsArray("sanctions", uid);

  const ordersPromise = canReadAll
    ? loadCollection(query(collection(db, "orders"), orderBy("updatedAt", "desc"), limit(500)))
    : loadUserOrders(uid);

  const [profiles, wallets, listings, orders, messages, disputes, ledger, sanctions, notifications] = await Promise.all([
    profilesPromise,
    walletsPromise,
    listingsPromise,
    ordersPromise,
    messagesPromise,
    disputesPromise,
    ledgerPromise,
    sanctionsPromise,
    notificationsPromise
  ]);

  state.profiles = profiles;
  state.wallets = wallets;
  state.listings = listings;
  state.orders = orders;
  state.messages = messages;
  state.disputes = disputes;
  state.ledger = ledger;
  state.sanctions = sanctions;
  state.notifications = notifications;
}

async function loadCollection(q) {
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadSingleDocAsArray(collectionName, id) {
  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) return [];
  return [{ id: snap.id, ...snap.data() }];
}

async function loadUserOrders(uid) {
  const [asBuyer, asSeller] = await Promise.all([
    loadCollection(query(collection(db, "orders"), where("buyerId", "==", uid), orderBy("updatedAt", "desc"), limit(250))),
    loadCollection(query(collection(db, "orders"), where("sellerId", "==", uid), orderBy("updatedAt", "desc"), limit(250)))
  ]);

  const map = new Map();
  for (const order of [...asBuyer, ...asSeller]) {
    map.set(order.id, order);
  }
  return [...map.values()].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function getMyProfile() {
  if (!state.me) return null;
  return state.profiles.find((p) => p.id === state.me.uid) || null;
}

function myWallet() {
  const me = state.me?.uid;
  if (!me) return null;
  return state.wallets.find((w) => w.ownerId === me) || null;
}

function canModerate() {
  return state.role === "admin" || state.role === "moderator";
}

function isSanctionedFor(flag) {
  const uid = state.me?.uid;
  if (!uid) return false;
  const s = state.sanctions.find((x) => x.id === uid);
  if (!s || !s.active) return false;
  return Boolean(s[flag]);
}

function profileById(id) {
  return state.profiles.find((p) => p.id === id) || null;
}

function listingById(id) {
  return state.listings.find((l) => l.id === id) || null;
}

function orderById(id) {
  return state.orders.find((o) => o.id === id) || null;
}

function messagesForOrder(orderId) {
  return state.messages
    .filter((m) => m.orderId === orderId)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function disputesOpen() {
  return state.disputes.filter((d) => ["open", "under_review"].includes(d.status));
}

function nowISO() {
  return new Date().toISOString();
}

function money(v) {
  return `${Number(v || 0).toLocaleString("en-US")} BCN`;
}

function statusTone(value) {
  if (["active", "released", "resolved_release"].includes(value)) return "ok";
  if (["pending_review", "awaiting_meetup", "under_review"].includes(value)) return "warn";
  if (["rejected", "in_dispute", "refunded", "resolved_refund"].includes(value)) return "danger";
  return "";
}

function esc(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pretty(v) {
  return String(v || "").replaceAll("_", " ");
}

function fmtDate(v) {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v) : new Date(v.seconds * 1000);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

function makeDesignImage(style, title) {
  const safeTitle = String(title || "BarterCoin").replace(/[<>&'"]/g, "");
  const presets = {
    wave: { a: "#224d6a", b: "#56d7c1" },
    grid: { a: "#3a2d64", b: "#7c9bff" },
    blocks: { a: "#4a2f2f", b: "#f0a47c" },
    badge: { a: "#224232", b: "#8fd98f" }
  };
  const palette = presets[style] || presets.wave;

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'>\n<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${palette.a}'/><stop offset='100%' stop-color='${palette.b}'/></linearGradient></defs>\n<rect width='1200' height='800' fill='url(#g)'/>\n<g opacity='0.2'><circle cx='180' cy='160' r='110' fill='#fff'/><rect x='760' y='120' width='250' height='140' rx='24' fill='#fff'/><rect x='260' y='520' width='420' height='160' rx='28' fill='#fff'/></g>\n<text x='80' y='700' font-family='Segoe UI, Arial' font-size='58' fill='white'>${safeTitle}</text>\n<text x='82' y='748' font-family='Segoe UI, Arial' font-size='28' fill='rgba(255,255,255,0.86)'>BarterCoin Design</text>\n</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const I18N = {
  bg: {
    "Sign in": "Вход",
    "Create account": "Създай профил",
    "Need account": "Нямаш профил",
    "Have account": "Имаш профил",
    "Access your wallet": "Достъп до портфейла",
    "Join marketplace": "Включи се в пазара",
    "Continue with Google": "Продължи с Google",
    "Workspace": "Работно табло",
    "Marketplace": "Пазар",
    "Create listing": "Създай обява",
    "Orders": "Поръчки",
    "Notifications": "Известия",
    "Admin tools": "Админ инструменти",
    "Browse items": "Разгледай обяви",
    "New listing": "Нова обява",
    "Apply filters": "Приложи филтри",
    "Clear": "Изчисти",
    "Buy with escrow": "Купи с ескроу",
    "Report": "Докладвай",
    "No listings found.": "Няма намерени обяви.",
    "No notifications yet.": "Все още няма известия."
  },
  uk: {
    "Sign in": "Увійти",
    "Create account": "Створити акаунт",
    "Need account": "Немає акаунта",
    "Have account": "Вже є акаунт",
    "Access your wallet": "Доступ до гаманця",
    "Join marketplace": "Приєднатися до маркетплейсу",
    "Continue with Google": "Продовжити з Google",
    "Workspace": "Робочий простір",
    "Marketplace": "Маркетплейс",
    "Create listing": "Створити оголошення",
    "Orders": "Замовлення",
    "Notifications": "Сповіщення",
    "Admin tools": "Інструменти адміністратора",
    "Browse items": "Переглянути товари",
    "New listing": "Нове оголошення",
    "Apply filters": "Застосувати фільтри",
    "Clear": "Очистити",
    "Buy with escrow": "Купити через ескроу",
    "Report": "Поскаржитися",
    "No listings found.": "Оголошення не знайдено.",
    "No notifications yet.": "Сповіщень поки немає."
  }
};

function localize(html) {
  const lang = state.ui.lang;
  if (lang === "en") return html;
  const dict = I18N[lang] || {};
  let out = html;
  for (const [from, to] of Object.entries(dict)) {
    out = out.split(from).join(to);
  }
  return out;
}
function render() {
  if (state.ui.loading) {
    app.innerHTML = localize(`<div class="auth-wrap"><div class="auth-card"><div class="auth-brand"><div class="kicker">BarterCoin</div><h1 class="hero-title">Loading</h1><p class="sub">Syncing Firebase Auth and Firestore collections.</p></div><div class="auth-panel"><div class="note ok">Initializing...</div></div></div></div>`);
    return;
  }

  if (!state.me) {
    app.innerHTML = localize(renderAuth());
    bindAuth();
    return;
  }

  app.innerHTML = localize(renderShell());
  bindApp();
}

function renderAuth() {
  return `
    <div class="auth-wrap app">
      <div class="auth-card">
        <section class="auth-brand">
          <span class="kicker">Firebase edition</span>
          <h1 class="hero-title">BarterCoin</h1>
          <p class="sub">Google/email auth, Firestore collections, design-image listings, and callable escrow logic.</p>
          <div class="box">
            <div><strong>Admin login</strong></div>
            <div class="hint">Name/email: admin or ${ADMIN_EMAIL}</div>
            <div class="hint">Password: ${ADMIN_PASSWORD}</div>
          </div>
        </section>
        <section class="auth-panel">
          <div class="wrap">
            <button class="btn soft" type="button" data-lang="en">English</button>
            <button class="btn soft" type="button" data-lang="bg">Български</button>
            <button class="btn soft" type="button" data-lang="uk">Українська</button>
          </div>
          <div class="row">
            <div>
              <div class="kicker">${state.ui.authMode === "signin" ? "Sign in" : "Create account"}</div>
              <h3 style="margin:8px 0 0">${state.ui.authMode === "signin" ? "Access your wallet" : "Join marketplace"}</h3>
            </div>
            <button class="btn soft" data-action="toggle-auth">${state.ui.authMode === "signin" ? "Need account" : "Have account"}</button>
          </div>
          ${state.ui.info ? `<div class="note ok">${esc(state.ui.info)}</div>` : ""}
          ${state.ui.error ? `<div class="note err">${esc(state.ui.error)}</div>` : ""}

          ${
            state.ui.authMode === "signin"
              ? `
            <form class="form" id="signin-form">
              <label>Email or name
                <input name="email" placeholder="admin or name@mail.com" required />
              </label>
              <label>Password
                <input name="password" type="password" required />
              </label>
              <button class="btn primary" type="submit">Sign in</button>
              <button class="btn soft" type="button" data-action="google-signin">Continue with Google</button>
            </form>
          `
              : `
            <form class="form" id="signup-form">
              <label>Full name
                <input name="fullName" required />
              </label>
              <label>Email
                <input name="email" type="email" required />
              </label>
              <label>Password
                <input name="password" type="password" minlength="6" required />
              </label>
              <label>Handle
                <input name="handle" placeholder="@newuser" required />
              </label>
              <label>Grade/label
                <input name="gradeLabel" placeholder="Grade 9" required />
              </label>
              <label>Bio
                <textarea name="bio" rows="3"></textarea>
              </label>
              <button class="btn primary" type="submit">Create account</button>
              <button class="btn soft" type="button" data-action="google-signin">Continue with Google</button>
            </form>
          `
          }
        </section>
      </div>
    </div>
  `;
}

function renderShell() {
  const profile = getMyProfile();
  const wallet = myWallet();
  const views = [
    ["overview", "Overview"],
    ["marketplace", "Marketplace"],
    ["create", "Create"],
    ["orders", "Orders"],
    ["notifications", "Alerts"],
    ["council", "Admin"]
  ].filter(([id]) => id !== "council" || canModerate());

  return `
    <div class="shell app">
      <aside class="sidebar">
        <div class="brand">
          <span class="kicker">Live Firebase</span>
          <h1>BarterCoin</h1>
          <div class="sub">Escrow logic, role checks, collections, and moderation tooling.</div>
        </div>
        <div class="wrap">
          <button class="btn soft" data-lang="en">EN</button>
          <button class="btn soft" data-lang="bg">BG</button>
          <button class="btn soft" data-lang="uk">UA</button>
        </div>

        <nav class="nav">
          ${views
            .map(([id, label]) => `<button class="nav-btn ${state.ui.view === id ? "active" : ""}" data-view="${id}">${label}</button>`)
            .join("")}
        </nav>

        <div class="user-chip">
          <div><strong>${esc(profile?.fullName || state.me.email || "User")}</strong></div>
          <div class="hint">${esc(profile?.handle || "@user")} · ${esc(state.role)}</div>
          <div class="wrap" style="margin-top:8px;">
            <span class="pill ${profile?.trustedSeller ? "ok" : "warn"}">${profile?.trustedSeller ? "Trusted seller" : "Needs review"}</span>
            ${wallet ? `<span class="pill">${money(wallet.balance)}</span>` : ""}
          </div>
        </div>

        <div class="wrap">
          <button class="btn soft" data-action="reload">Refresh</button>
          <button class="btn soft" data-action="logout">Logout</button>
        </div>
      </aside>

      <main class="main">
        ${renderView()}
        ${renderMobileTabs(views)}
      </main>
    </div>
  `;
}

function renderMobileTabs(views) {
  return `<div class="mobile-tabs">${views
    .map(([id, label]) => `<button data-view="${id}" class="${state.ui.view === id ? "active" : ""}">${label}</button>`)
    .join("")}</div>`;
}

function renderView() {
  switch (state.ui.view) {
    case "marketplace":
      return renderMarketplace();
    case "create":
      return renderCreate();
    case "orders":
      return renderOrders();
    case "notifications":
      return renderNotifications();
    case "council":
      return renderCouncil();
    default:
      return renderOverview();
  }
}

function renderOverview() {
  const profile = getMyProfile();
  const wallet = myWallet();
  const myOrders = state.orders.filter((o) => o.buyerId === state.me.uid || o.sellerId === state.me.uid);
  const mineLedger = state.ledger.filter((l) => l.ownerId === state.me.uid).slice(0, 6);

  return `
    <header class="head">
      <div>
        <div class="kicker">Workspace</div>
        <h2>Safe campus trading with escrow-protected settlement.</h2>
      </div>
      <div class="wrap">
        <button class="btn soft" data-view="marketplace">Browse items</button>
        <button class="btn primary" data-view="create">New listing</button>
      </div>
    </header>

    <section class="stats">
      <article class="card"><div class="hint">Balance</div><h3>${money(wallet?.balance || 0)}</h3></article>
      <article class="card"><div class="hint">Held escrow</div><h3>${money(wallet?.heldBalance || 0)}</h3></article>
      <article class="card"><div class="hint">My orders</div><h3>${myOrders.length}</h3></article>
      <article class="card"><div class="hint">Role</div><h3>${esc(state.role)}</h3></article>
    </section>

    <section class="two">
      <article class="card">
        <div class="row"><h3>Recent ledger</h3><span class="pill">${mineLedger.length}</span></div>
        <div class="feed">
          ${mineLedger
            .map((entry) => `<div class="feed-item"><strong>${esc(entry.type)}</strong><div class="hint">${money(entry.amount)} · ${fmtDate(entry.createdAt)}</div></div>`)
            .join("") || `<div class="hint">No ledger yet.</div>`}
        </div>
      </article>

      <article class="card">
        <h3>Profile</h3>
        <div class="hint">${esc(profile?.bio || "No bio yet")}</div>
        <div class="wrap" style="margin-top:8px;">
          <span class="pill ${profile?.trustedSeller ? "ok" : "warn"}">${profile?.trustedSeller ? "Trusted seller" : "Moderated seller"}</span>
          ${isSanctionedFor("postBlocked") ? `<span class="pill danger">Posting blocked</span>` : ""}
          ${isSanctionedFor("chatBlocked") ? `<span class="pill danger">Chat blocked</span>` : ""}
        </div>
      </article>
    </section>
  `;
}
function filteredListings() {
  let items = state.listings.filter((l) => l.status === "active" || l.sellerId === state.me.uid || canModerate());
  const q = state.ui.search.trim().toLowerCase();
  if (q) {
    items = items.filter((l) => `${l.title} ${l.description} ${l.category} ${(l.tags || []).join(" ")}`.toLowerCase().includes(q));
  }

  if (state.ui.category !== "all") {
    items = items.filter((l) => (l.category || "").toLowerCase() === state.ui.category.toLowerCase());
  }

  const min = Number(state.ui.priceMin || 0);
  const max = Number(state.ui.priceMax || 0);
  if (min) items = items.filter((l) => Number(l.price || 0) >= min);
  if (max) items = items.filter((l) => Number(l.price || 0) <= max);

  if (state.ui.sort === "price_low") items = items.sort((a, b) => (a.price || 0) - (b.price || 0));
  if (state.ui.sort === "price_high") items = items.sort((a, b) => (b.price || 0) - (a.price || 0));
  if (state.ui.sort === "newest") items = items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return items;
}

function renderMarketplace() {
  const listings = filteredListings();
  const categories = [...new Set(state.listings.map((l) => l.category).filter(Boolean))];

  return `
    <header class="head">
      <div>
        <div class="kicker">Marketplace</div>
        <h2>Search, filter, and buy with escrow transaction safety.</h2>
      </div>
    </header>

    <section class="card form-grid">
      <label>Search
        <input id="search" value="${esc(state.ui.search)}" placeholder="notes, books, calculator" />
      </label>
      <label>Category
        <select id="category">
          <option value="all" ${state.ui.category === "all" ? "selected" : ""}>All</option>
          ${categories.map((c) => `<option value="${esc(c)}" ${state.ui.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
      </label>
      <label>Sort
        <select id="sort">
          <option value="newest" ${state.ui.sort === "newest" ? "selected" : ""}>Newest</option>
          <option value="price_low" ${state.ui.sort === "price_low" ? "selected" : ""}>Price low to high</option>
          <option value="price_high" ${state.ui.sort === "price_high" ? "selected" : ""}>Price high to low</option>
        </select>
      </label>
      <label>Min BCN
        <input id="min" type="number" min="0" value="${esc(state.ui.priceMin)}" />
      </label>
      <label>Max BCN
        <input id="max" type="number" min="0" value="${esc(state.ui.priceMax)}" />
      </label>
      <div class="full wrap" style="align-items:end;">
        <button class="btn soft" data-action="apply-filters">Apply filters</button>
        <button class="btn soft" data-action="clear-filters">Clear</button>
      </div>
    </section>

    <section class="three">
      ${listings
        .map((listing) => {
          const owner = profileById(listing.sellerId);
          const mine = listing.sellerId === state.me.uid;
          return `
            <article class="listing">
              <div class="row">
                <strong>${esc(listing.title)}</strong>
                <span class="pill ${statusTone(listing.status)}">${esc(pretty(listing.status))}</span>
              </div>
              ${listing.imageUrl ? `<img src="${esc(listing.imageUrl)}" alt="listing image" style="width:100%;border-radius:10px;border:1px solid var(--line);" />` : ""}
              <div class="hint">${esc(listing.description)}</div>
              <div class="row"><span>${money(listing.price)}</span><span class="hint">${esc(listing.category || "General")}</span></div>
              <div class="hint">Seller: ${esc(owner?.handle || "@unknown")} · ${owner?.trustedSeller ? "trusted" : "reviewed"}</div>
              <div class="hint">Pickup: ${esc(listing.pickupZone || "TBD")}</div>
              <div class="wrap">
                ${!mine && listing.status === "active" ? `<button class="btn primary" data-action="buy" data-id="${listing.id}">Buy with escrow</button>` : ""}
                <button class="btn soft" data-action="report" data-id="${listing.id}">Report</button>
              </div>
            </article>
          `;
        })
        .join("") || `<article class="card">No listings found.</article>`}
    </section>
  `;
}

function renderCreate() {
  return `
    <header class="head">
      <div>
        <div class="kicker">Create listing</div>
        <h2>Create a clean listing with built-in design images and publish to Firestore.</h2>
      </div>
    </header>

    <form class="card form-grid" id="create-listing-form">
      <label>Title
        <input name="title" required />
      </label>
      <label>Category
        <input name="category" required placeholder="Books, Supplies, Notes" />
      </label>
      <label>Price BCN
        <input name="price" type="number" min="1" required />
      </label>
      <label>Pickup zone
        <input name="pickupZone" required placeholder="Library desk" />
      </label>
      <label class="full">Description
        <textarea name="description" rows="5" required></textarea>
      </label>
      <label>Tags (comma)
        <input name="tags" placeholder="math, notebook, grade10" />
      </label>
      <label>Design image
        <select name="design">
          <option value="wave">Wave</option>
          <option value="grid">Grid</option>
          <option value="blocks">Blocks</option>
          <option value="badge">Badge</option>
        </select>
      </label>
      <div class="full wrap">
        <button class="btn primary" type="submit">Publish listing</button>
      </div>
      <div class="full hint">If your role is not trusted seller, listing starts in pending review.</div>
    </form>
  `;
}

function renderOrders() {
  const myOrders = state.orders.filter((o) => o.buyerId === state.me.uid || o.sellerId === state.me.uid);
  const selected = orderById(state.ui.selectedOrderId) || myOrders[0] || null;

  return `
    <header class="head">
      <div>
        <div class="kicker">Orders</div>
        <h2>Escrow lifecycle, chat, and dispute handling.</h2>
      </div>
    </header>

    <section class="two">
      <article class="card">
        <h3>My orders</h3>
        <div class="feed">
          ${myOrders
            .map((order) => {
              const listing = listingById(order.listingId);
              const partner = profileById(order.buyerId === state.me.uid ? order.sellerId : order.buyerId);
              return `<div class="feed-item"><button class="btn soft" data-action="pick-order" data-id="${order.id}">${esc(listing?.title || "Order")} · ${esc(partner?.handle || "@user")} · ${money(order.escrowAmount)}</button></div>`;
            })
            .join("") || `<div class="hint">No orders yet.</div>`}
        </div>
      </article>

      <article class="card">
        <h3>Order detail</h3>
        ${selected ? renderOrderDetail(selected) : `<div class="hint">Select an order.</div>`}
      </article>
    </section>
  `;
}

function renderOrderDetail(order) {
  const listing = listingById(order.listingId);
  const isBuyer = order.buyerId === state.me.uid;
  const canMessage = !isSanctionedFor("chatBlocked");
  const dispute = state.disputes.find((d) => d.orderId === order.id);

  return `
    <div class="grid">
      <div class="row"><strong>${esc(listing?.title || "Listing")}</strong><span class="pill ${statusTone(order.status)}">${esc(pretty(order.status))}</span></div>
      <div class="hint">Meetup: ${esc(order.meetupWindow || "TBD")}</div>
      <div class="hint">Escrow: ${money(order.escrowAmount)}</div>
      ${dispute ? `<div class="note err">Dispute: ${esc(dispute.summary || "")}</div>` : ""}

      <div class="wrap">
        ${isBuyer && order.status === "awaiting_meetup" ? `<button class="btn primary" data-action="confirm-release" data-id="${order.id}">Confirm release</button>` : ""}
        ${(order.status === "awaiting_meetup" || order.status === "awaiting_buyer_confirmation") && !dispute ? `<button class="btn soft" data-action="open-dispute" data-id="${order.id}">Open dispute</button>` : ""}
      </div>

      <div class="card" style="padding:10px;">
        <h4>Chat</h4>
        <div class="feed">
          ${messagesForOrder(order.id)
            .slice(-12)
            .map((msg) => `<div class="feed-item"><strong>${esc(profileById(msg.authorId)?.handle || "@user")}</strong><div>${esc(msg.body)}</div><div class="hint">${fmtDate(msg.createdAt)}</div></div>`)
            .join("") || `<div class="hint">No messages.</div>`}
        </div>
        ${canMessage ? `<form id="send-message-form" data-id="${order.id}" class="wrap" style="margin-top:10px;"><input name="body" placeholder="Message..." required /><button class="btn soft" type="submit">Send</button></form>` : `<div class="note err">Chat is blocked by moderation.</div>`}
      </div>
    </div>
  `;
}

function renderNotifications() {
  return `
    <header class="head">
      <div>
        <div class="kicker">Notifications</div>
        <h2>In-app feed for orders, disputes, rewards, and listing decisions.</h2>
      </div>
    </header>

    <section class="card">
      <div class="feed">
        ${state.notifications
          .map((n) => `<div class="feed-item"><strong>${esc(n.title || "Update")}</strong><div>${esc(n.body || "")}</div><div class="hint">${fmtDate(n.createdAt)}</div></div>`)
          .join("") || `<div class="hint">No notifications yet.</div>`}
      </div>
    </section>
  `;
}
function renderCouncil() {
  const pending = state.listings.filter((l) => l.status === state.ui.moderationFilter);
  const open = disputesOpen();
  const users = state.profiles.filter((p) => p.id !== state.me.uid);

  return `
    <header class="head">
      <div>
        <div class="kicker">Admin tools</div>
        <h2>Moderation queue, sanctions, bulk decisions, role management, and dispute SLA.</h2>
      </div>
    </header>

    <section class="stats">
      <article class="card"><div class="hint">Pending listings</div><h3>${state.listings.filter((l) => l.status === "pending_review").length}</h3></article>
      <article class="card"><div class="hint">Open disputes</div><h3>${open.length}</h3></article>
      <article class="card"><div class="hint">Notifications</div><h3>${state.notifications.length}</h3></article>
      <article class="card"><div class="hint">Sanctions active</div><h3>${state.sanctions.filter((s) => s.active).length}</h3></article>
    </section>

    <section class="two">
      <article class="card">
        <div class="row">
          <h3>Listing moderation</h3>
          <select id="mod-filter">
            <option value="pending_review" ${state.ui.moderationFilter === "pending_review" ? "selected" : ""}>pending_review</option>
            <option value="active" ${state.ui.moderationFilter === "active" ? "selected" : ""}>active</option>
            <option value="rejected" ${state.ui.moderationFilter === "rejected" ? "selected" : ""}>rejected</option>
          </select>
        </div>
        <div class="wrap" style="margin:8px 0 10px;">
          <button class="btn soft" data-action="bulk-approve">Bulk approve shown</button>
          <button class="btn soft" data-action="bulk-reject">Bulk reject shown</button>
        </div>
        <div class="feed">
          ${pending
            .map(
              (listing) => `<div class="feed-item"><div class="row"><strong>${esc(listing.title)}</strong><span class="pill ${statusTone(listing.status)}">${listing.status}</span></div><div class="hint">${esc(listing.category || "")}</div><div class="wrap"><button class="btn soft" data-action="approve-one" data-id="${listing.id}">Approve</button><button class="btn danger" data-action="reject-one" data-id="${listing.id}">Reject</button></div></div>`
            )
            .join("") || `<div class="hint">No listings in this filter.</div>`}
        </div>
      </article>

      <article class="card">
        <h3>Disputes + SLA timer</h3>
        <div class="feed">
          ${open
            .map((d) => {
              const hrs = Math.floor((Date.now() - new Date(d.createdAt || 0).getTime()) / (1000 * 60 * 60));
              return `<div class="feed-item"><div class="row"><strong>${esc(d.summary || "Dispute")}</strong><span class="pill ${hrs > 24 ? "danger" : "warn"}">${hrs}h open</span></div><div class="hint">Template: ${esc(d.template || "No show")}</div><div class="wrap"><button class="btn soft" data-action="resolve-refund" data-id="${d.id}">Refund buyer</button><button class="btn primary" data-action="resolve-release" data-id="${d.id}">Release seller</button></div></div>`;
            })
            .join("") || `<div class="hint">No open disputes.</div>`}
        </div>
      </article>
    </section>

    <section class="two">
      <article class="card">
        <h3>Role + sanctions</h3>
        <form id="role-form" class="form-grid">
          <label>User
            <select name="uid">${users.map((u) => `<option value="${u.id}">${esc(u.fullName)} (${esc(u.handle)})</option>`).join("")}</select>
          </label>
          <label>Role
            <select name="role">
              <option value="student">student</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <div class="full wrap"><button class="btn soft" type="submit">Set role claim</button></div>
        </form>

        <form id="sanction-form" class="form-grid" style="margin-top:12px;">
          <label>User
            <select name="uid">${users.map((u) => `<option value="${u.id}">${esc(u.fullName)} (${esc(u.handle)})</option>`).join("")}</select>
          </label>
          <label>Sanction mode
            <select name="mode">
              <option value="none">none</option>
              <option value="post">block posting</option>
              <option value="chat">block chat</option>
              <option value="both">block both</option>
            </select>
          </label>
          <label class="full">Reason template
            <select name="reason">
              <option>Spam listing</option>
              <option>No show abuse</option>
              <option>Harassment report</option>
              <option>Policy violation</option>
            </select>
          </label>
          <div class="full wrap"><button class="btn danger" type="submit">Apply sanction</button></div>
        </form>
      </article>

      <article class="card">
        <h3>Issue reward</h3>
        <form id="reward-form" class="form-grid">
          <label>User
            <select name="uid">${users.map((u) => `<option value="${u.id}">${esc(u.fullName)} (${esc(u.handle)})</option>`).join("")}</select>
          </label>
          <label>Amount BCN
            <input name="amount" type="number" min="1" required />
          </label>
          <label class="full">Reason
            <input name="reason" required placeholder="Community support contribution" />
          </label>
          <div class="full wrap"><button class="btn primary" type="submit">Issue reward</button></div>
        </form>
      </article>
    </section>
  `;
}

function bindAuth() {
  bindLanguageSwitcher();
  document.querySelector("[data-action='toggle-auth']")?.addEventListener("click", () => {
    state.ui.authMode = state.ui.authMode === "signin" ? "signup" : "signin";
    state.ui.info = "";
    state.ui.error = "";
    render();
  });

  document.querySelector("[data-action='google-signin']")?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
      state.ui.info = "Signed in with Google.";
      state.ui.error = "";
      render();
    } catch (error) {
      state.ui.error = `Google login failed: ${error.message || error}`;
      render();
    }
  });

  document.getElementById("signin-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const emailRaw = String(fd.get("email") || "").trim();
    const email = emailRaw.toLowerCase() === "admin" ? ADMIN_EMAIL : emailRaw;
    const password = String(fd.get("password") || "");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      state.ui.info = "Signed in.";
      state.ui.error = "";
      render();
    } catch (error) {
      state.ui.error = `Sign in failed: ${error.message || error}`;
      render();
    }
  });

  document.getElementById("signup-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const fullName = String(fd.get("fullName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: fullName });
      await ensureProfile(result.user, {
        handle: String(fd.get("handle") || "").trim(),
        gradeLabel: String(fd.get("gradeLabel") || "").trim(),
        bio: String(fd.get("bio") || "").trim()
      });
      state.ui.info = "Account created.";
      state.ui.error = "";
      render();
    } catch (error) {
      state.ui.error = `Sign up failed: ${error.message || error}`;
      render();
    }
  });
}
function bindApp() {
  bindLanguageSwitcher();
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.ui.view = btn.getAttribute("data-view");
      render();
    });
  });

  document.querySelector("[data-action='logout']")?.addEventListener("click", async () => {
    await signOut(auth);
  });

  document.querySelector("[data-action='reload']")?.addEventListener("click", async () => {
    state.ui.loading = true;
    render();
    await loadAllData();
    state.ui.loading = false;
    render();
  });

  document.querySelector("[data-action='apply-filters']")?.addEventListener("click", () => {
    state.ui.search = document.getElementById("search")?.value || "";
    state.ui.category = document.getElementById("category")?.value || "all";
    state.ui.sort = document.getElementById("sort")?.value || "newest";
    state.ui.priceMin = document.getElementById("min")?.value || "";
    state.ui.priceMax = document.getElementById("max")?.value || "";
    render();
  });

  document.querySelector("[data-action='clear-filters']")?.addEventListener("click", () => {
    state.ui.search = "";
    state.ui.category = "all";
    state.ui.sort = "newest";
    state.ui.priceMin = "";
    state.ui.priceMax = "";
    render();
  });

  document.getElementById("create-listing-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSanctionedFor("postBlocked")) {
      state.ui.error = "Posting blocked by admin moderation.";
      render();
      return;
    }

    const fd = new FormData(event.currentTarget);
    try {
      const profile = getMyProfile();
      const design = String(fd.get("design") || "wave");
      const imageUrl = makeDesignImage(design, String(fd.get("title") || ""));
      const listingDoc = {
        sellerId: state.me.uid,
        title: String(fd.get("title") || "").trim(),
        description: String(fd.get("description") || "").trim(),
        category: String(fd.get("category") || "").trim(),
        price: Number(fd.get("price") || 0),
        pickupZone: String(fd.get("pickupZone") || "").trim(),
        tags: String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean),
        imageUrl,
        moderationRequired: !profile?.trustedSeller,
        status: profile?.trustedSeller ? "active" : "pending_review",
        createdAt: nowISO(),
        updatedAt: nowISO()
      };

      await addDoc(collection(db, "listings"), listingDoc);
      await addDoc(collection(db, "notifications"), {
        recipientId: state.me.uid,
        type: "listing_created",
        title: "Listing submitted",
        body: listingDoc.status === "active" ? "Your listing is live." : "Your listing is waiting for moderation.",
        createdAt: nowISO(),
        read: false
      });

      await loadAllData();
      state.ui.view = "marketplace";
      state.ui.info = "Listing published.";
      state.ui.error = "";
      render();
    } catch (error) {
      state.ui.error = `Create listing failed: ${error.message || error}`;
      render();
    }
  });

  document.querySelectorAll("[data-action='buy']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const listingId = btn.getAttribute("data-id");
      const meetupWindow = window.prompt("Meetup window (example: Monday 12:20 near library desk)");
      if (!listingId || !meetupWindow) return;
      try {
        await fnBuyWithEscrow({ listingId, meetupWindow });
        await loadAllData();
        state.ui.view = "orders";
        state.ui.info = "Order created and escrow funded.";
        state.ui.error = "";
        render();
      } catch (error) {
        state.ui.error = `Escrow purchase failed: ${error.message || error}`;
        render();
      }
    });
  });

  document.querySelectorAll("[data-action='report']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const listingId = btn.getAttribute("data-id");
      const reason = window.prompt("Report reason");
      if (!listingId || !reason) return;

      await addDoc(collection(db, "disputes"), {
        orderId: "",
        openedById: state.me.uid,
        summary: `Listing report for ${listingId}: ${reason}`,
        template: "Policy violation",
        status: "open",
        createdAt: nowISO(),
        updatedAt: nowISO()
      });
      await addDoc(collection(db, "notifications"), {
        recipientId: state.me.uid,
        type: "report_submitted",
        title: "Report submitted",
        body: reason,
        createdAt: nowISO(),
        read: false
      });

      await loadAllData();
      state.ui.info = "Report submitted.";
      state.ui.error = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='pick-order']").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.ui.selectedOrderId = btn.getAttribute("data-id") || "";
      render();
    });
  });

  document.querySelectorAll("[data-action='confirm-release']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.getAttribute("data-id");
      if (!orderId) return;
      try {
        await fnConfirmRelease({ orderId });
        await loadAllData();
        state.ui.info = "Escrow released.";
        state.ui.error = "";
        render();
      } catch (error) {
        state.ui.error = `Release failed: ${error.message || error}`;
        render();
      }
    });
  });

  document.querySelectorAll("[data-action='open-dispute']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.getAttribute("data-id");
      const summary = window.prompt("Dispute summary");
      const template = window.prompt("Template: No show / Item mismatch / Other") || "Other";
      if (!orderId || !summary) return;

      await addDoc(collection(db, "disputes"), {
        orderId,
        openedById: state.me.uid,
        summary,
        template,
        status: "under_review",
        createdAt: nowISO(),
        updatedAt: nowISO()
      });

      await updateDoc(doc(db, "orders", orderId), { status: "in_dispute", updatedAt: nowISO() });
      await addDoc(collection(db, "notifications"), {
        recipientId: state.me.uid,
        type: "dispute_opened",
        title: "Dispute opened",
        body: summary,
        createdAt: nowISO(),
        read: false
      });

      await loadAllData();
      render();
    });
  });
  document.getElementById("send-message-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSanctionedFor("chatBlocked")) {
      state.ui.error = "Chat blocked by admin moderation.";
      render();
      return;
    }

    const fd = new FormData(event.currentTarget);
    const orderId = event.currentTarget.getAttribute("data-id");
    const body = String(fd.get("body") || "").trim();
    if (!orderId || !body) return;

    await addDoc(collection(db, "messages"), {
      orderId,
      authorId: state.me.uid,
      body,
      createdAt: nowISO()
    });

    await loadAllData();
    render();
  });

  if (canModerate()) {
    document.getElementById("mod-filter")?.addEventListener("change", (e) => {
      state.ui.moderationFilter = e.target.value;
      render();
    });

    document.querySelector("[data-action='bulk-approve']")?.addEventListener("click", async () => {
      const ids = state.listings.filter((l) => l.status === state.ui.moderationFilter).map((l) => l.id);
      if (!ids.length) return;
      await fnBulkModerateListings({ listingIds: ids, decision: "approve", reason: "Bulk approved" });
      await loadAllData();
      render();
    });

    document.querySelector("[data-action='bulk-reject']")?.addEventListener("click", async () => {
      const ids = state.listings.filter((l) => l.status === state.ui.moderationFilter).map((l) => l.id);
      if (!ids.length) return;
      await fnBulkModerateListings({ listingIds: ids, decision: "reject", reason: "Bulk rejected" });
      await loadAllData();
      render();
    });

    document.querySelectorAll("[data-action='approve-one']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await fnBulkModerateListings({ listingIds: [btn.getAttribute("data-id")], decision: "approve", reason: "Approved" });
        await loadAllData();
        render();
      });
    });

    document.querySelectorAll("[data-action='reject-one']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await fnBulkModerateListings({ listingIds: [btn.getAttribute("data-id")], decision: "reject", reason: "Rejected" });
        await loadAllData();
        render();
      });
    });

    document.querySelectorAll("[data-action='resolve-refund']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const disputeId = btn.getAttribute("data-id");
        if (!disputeId) return;
        await fnResolveDispute({ disputeId, resolution: "refund", note: "Admin refund" });
        await loadAllData();
        render();
      });
    });

    document.querySelectorAll("[data-action='resolve-release']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const disputeId = btn.getAttribute("data-id");
        if (!disputeId) return;
        await fnResolveDispute({ disputeId, resolution: "release", note: "Admin release" });
        await loadAllData();
        render();
      });
    });

    document.getElementById("role-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      await fnSetUserRole({ uid: String(fd.get("uid")), role: String(fd.get("role")) });
      await updateDoc(doc(db, "profiles", String(fd.get("uid"))), { role: String(fd.get("role")), updatedAt: nowISO() });
      await loadAllData();
      state.ui.info = "Role updated. User may need to sign out/in for claim refresh.";
      render();
    });

    document.getElementById("sanction-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const uid = String(fd.get("uid"));
      const mode = String(fd.get("mode"));
      const reason = String(fd.get("reason"));

      await setDoc(
        doc(db, "sanctions", uid),
        {
          active: mode !== "none",
          postBlocked: mode === "post" || mode === "both",
          chatBlocked: mode === "chat" || mode === "both",
          reason,
          updatedAt: nowISO()
        },
        { merge: true }
      );

      await loadAllData();
      render();
    });

    document.getElementById("reward-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      await fnIssueReward({ targetUid: String(fd.get("uid")), amount: Number(fd.get("amount")), reason: String(fd.get("reason")) });
      await loadAllData();
      state.ui.info = "Reward issued.";
      render();
    });
  }
}

function bindLanguageSwitcher() {
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang");
      if (!lang) return;
      state.ui.lang = lang;
      localStorage.setItem("bc-lang", lang);
      render();
    });
  });
}

async function ensureProfile(user, override = null) {
  const profileRef = doc(db, "profiles", user.uid);
  const snap = await getDoc(profileRef);

  if (snap.exists()) {
    if (override) {
      await updateDoc(profileRef, {
        handle: sanitizeHandle(override.handle),
        gradeLabel: override.gradeLabel || "Student",
        bio: override.bio || "",
        updatedAt: nowISO()
      });
    }
    return;
  }

  const isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL;
  await setDoc(profileRef, {
    fullName: user.displayName || (isAdmin ? "admin" : "Student"),
    email: user.email || "",
    handle: sanitizeHandle(override?.handle || user.displayName || "student"),
    gradeLabel: override?.gradeLabel || (isAdmin ? "Platform admin" : "Student"),
    role: isAdmin ? "admin" : "student",
    trustedSeller: Boolean(isAdmin),
    bio: override?.bio || (isAdmin ? "Platform administrator profile." : "New account"),
    createdAt: nowISO(),
    updatedAt: nowISO()
  });

  await setDoc(doc(db, "wallets", user.uid), {
    ownerId: user.uid,
    balance: STARTER_BALANCE,
    heldBalance: 0,
    address: `BC-${Math.random().toString(36).slice(2, 5).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });

  await addDoc(collection(db, "ledger"), {
    ownerId: user.uid,
    type: "starter_grant",
    amount: STARTER_BALANCE,
    note: "Starter wallet activation grant",
    createdAt: nowISO()
  });

  await addDoc(collection(db, "notifications"), {
    recipientId: user.uid,
    type: "account_created",
    title: "Welcome to BarterCoin",
    body: "Your starter wallet is active.",
    createdAt: nowISO(),
    read: false
  });
}

function sanitizeHandle(raw) {
  const plain = String(raw || "student")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return `@${plain || "student"}`;
}

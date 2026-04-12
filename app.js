import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";
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
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

(function () {
  const STORAGE_KEY = "bartercoin-firebase-ui-v1";
  const STARTER_BALANCE = 500;
  const app = document.getElementById("app");
  const APP_DOC = "main";
  const ADMIN_EMAIL = "admin@bartercoin.school";
  const ADMIN_PASSWORD = "090906";

  const firebaseConfig = {
    apiKey: "AIzaSyAqVEpAQ8sT15lLoWzJe0jmFGE3jsU_BTQ",
    authDomain: "bartercoin-3fc73.firebaseapp.com",
    projectId: "bartercoin-3fc73",
    storageBucket: "bartercoin-3fc73.firebasestorage.app",
    messagingSenderId: "1047699487399",
    appId: "1:1047699487399:web:a54c50ac062f857a923982",
    measurementId: "G-YEBFDLKLCM"
  };

  const firebaseApp = initializeApp(firebaseConfig);
  analyticsSupported().then((supported) => {
    if (supported) {
      getAnalytics(firebaseApp);
    }
  });
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  const googleProvider = new GoogleAuthProvider();

  const state = createInitialState();
  render();
  void initializeRuntime();

  function createInitialState() {
    const base = seedState();
    const storedUi = localStorage.getItem(STORAGE_KEY);
    if (storedUi) {
      try {
        base.ui = { ...defaultUi(), ...JSON.parse(storedUi) };
      } catch {
        base.ui = defaultUi();
      }
    }
    return base;
  }

  async function initializeRuntime() {
    await ensureAdminBootstrap();
    await loadRemoteState();

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        state.session.currentUserId = "";
        state.ui.authError = "";
        state.ui.authMessage = "";
        render();
        return;
      }

      await ensureProfileForAuthUser(user);
      await loadRemoteState();
      state.session.currentUserId = user.uid;
      state.session.demoLastLoginId = user.uid;
      if (state.ui.view === "council" && !canModerate()) {
        state.ui.view = "overview";
      }
      render();
    });
  }

  function defaultUi() {
    return {
      view: "overview",
      authMode: "signin",
      authMessage: "",
      authError: "",
      selectedOrderId: "",
      selectedMarketplaceListingId: "",
      search: ""
    };
  }

  async function ensureAdminBootstrap() {
    const alreadyBootstrapped = localStorage.getItem("bartercoin-admin-bootstrap") === "done";
    if (alreadyBootstrapped) {
      return;
    }

    let createdOrExists = false;
    try {
      await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
      createdOrExists = true;
    } catch (error) {
      if (String(error.code || "").includes("email-already-in-use")) {
        createdOrExists = true;
      }
    }

    if (createdOrExists) {
      localStorage.setItem("bartercoin-admin-bootstrap", "done");
    }

    if (auth.currentUser) {
      await signOut(auth);
    }
  }

  async function loadRemoteState() {
    try {
      const snap = await getDoc(doc(db, "app_data", APP_DOC));
      if (!snap.exists()) {
        await persistRemoteState(true);
        return;
      }

      const remote = snap.data();
      state.users = remote.users || state.users;
      state.wallets = remote.wallets || state.wallets;
      state.ledger = remote.ledger || state.ledger;
      state.listings = remote.listings || state.listings;
      state.orders = remote.orders || state.orders;
      state.escrowHolds = remote.escrowHolds || state.escrowHolds;
      state.messages = remote.messages || state.messages;
      state.disputes = remote.disputes || state.disputes;
      state.reports = remote.reports || state.reports;
      state.tokenRewards = remote.tokenRewards || state.tokenRewards;
      state.auditLogs = remote.auditLogs || state.auditLogs;
    } catch (error) {
      state.ui.authError = `Firestore load failed: ${error.message || error}`;
    }
  }

  async function persistRemoteState(initial = false) {
    const payload = {
      users: state.users,
      wallets: state.wallets,
      ledger: state.ledger,
      listings: state.listings,
      orders: state.orders,
      escrowHolds: state.escrowHolds,
      messages: state.messages,
      disputes: state.disputes,
      reports: state.reports,
      tokenRewards: state.tokenRewards,
      auditLogs: state.auditLogs,
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, "app_data", APP_DOC), payload, { merge: true });
    } catch (error) {
      if (!initial) {
        state.ui.authError = `Firestore save failed: ${error.message || error}`;
      }
    }
  }

  async function ensureProfileForAuthUser(authUser) {
    const existing = state.users.find((user) => user.id === authUser.uid);
    if (existing) {
      return;
    }

    const isAdmin = authUser.email && authUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const displayName = authUser.displayName || (isAdmin ? "admin" : "New Student");
    const handleBase = displayName.replace(/\s+/g, "").toLowerCase() || "student";
    const uniqueHandle = buildUniqueHandle(handleBase);
    const profile = {
      id: authUser.uid,
      email: authUser.email || "",
      fullName: displayName,
      handle: uniqueHandle,
      gradeLabel: isAdmin ? "Platform admin" : "Grade 9",
      role: isAdmin ? "admin" : "student",
      trustedSeller: Boolean(isAdmin),
      bio: isAdmin ? "Platform administrator profile." : "Joined from Firebase Auth.",
      avatarUrl:
        authUser.photoURL ||
        "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=300&q=80"
    };
    state.users.push(profile);

    state.wallets.push(
      createWallet(
        authUser.uid,
        STARTER_BALANCE,
        0,
        `BC-${Math.random().toString(36).slice(2, 5).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      )
    );
    addLedger(`wallet-${authUser.uid}`, "starter_grant", STARTER_BALANCE, "Starter wallet activation grant");
    addAudit("firebase_profile_created", "user", authUser.uid);
    await persistRemoteState();
  }

  function buildUniqueHandle(base) {
    let candidate = `@${base}`;
    let suffix = 1;
    while (state.users.some((user) => user.handle.toLowerCase() === candidate.toLowerCase())) {
      candidate = `@${base}${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function seedState() {
    const users = [
      {
        id: "user-alina",
        email: "alina@school.edu",
        fullName: "Alina Kovalenko",
        handle: "@alina",
        gradeLabel: "Grade 10",
        role: "student",
        trustedSeller: true,
        bio: "Debate club lead trading cleaned-up books and notes.",
        avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80"
      },
      {
        id: "user-max",
        email: "max@school.edu",
        fullName: "Max Petrenko",
        handle: "@max",
        gradeLabel: "Grade 9",
        role: "student",
        trustedSeller: false,
        bio: "New member testing the marketplace pilot.",
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80"
      },
      {
        id: "user-sofia",
        email: "sofia@school.edu",
        fullName: "Sofia Melnyk",
        handle: "@sofia",
        gradeLabel: "Grade 11",
        role: "council_moderator",
        trustedSeller: true,
        bio: "Council moderator for disputes, trust reviews, and rewards.",
        avatarUrl: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=300&q=80"
      },
      {
        id: "user-adam",
        email: "adam@school.edu",
        fullName: "Adam Levytskyi",
        handle: "@adam",
        gradeLabel: "Faculty sponsor",
        role: "admin",
        trustedSeller: true,
        bio: "Faculty sponsor overseeing the pilot.",
        avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80"
      }
    ];

    return {
      users,
      wallets: [
        createWallet("user-alina", 870, 0, "BC-ALN-2F9A11"),
        createWallet("user-max", 430, 120, "BC-MAX-91CD87"),
        createWallet("user-sofia", 1520, 0, "BC-SOF-FF11C0"),
        createWallet("user-adam", 2500, 0, "BC-ADM-14EE07")
      ],
      ledger: [
        createLedger("wallet-user-alina", "starter_grant", 500, "Pilot wallet activation grant", "2026-04-01T09:00:00Z"),
        createLedger("wallet-user-alina", "reward_mint", 200, "Debate event volunteering", "2026-04-03T12:00:00Z"),
        createLedger("wallet-user-max", "starter_grant", 400, "Pilot wallet activation grant", "2026-04-02T08:30:00Z"),
        createLedger("wallet-user-max", "escrow_hold", -120, "Escrow hold for graphing notes", "2026-04-09T13:20:00Z"),
        createLedger("wallet-user-sofia", "reward_mint", 250, "Council launch moderation shift", "2026-04-04T15:00:00Z")
      ],
      listings: [
        {
          id: "listing-graph-notes",
          sellerId: "user-alina",
          title: "Graphing Calculator Notes Pack",
          description: "Clean notes with worked examples for algebra and graphing shortcuts.",
          category: "Study Materials",
          price: 120,
          imageUrl: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1400&q=80",
          status: "sold",
          moderationRequired: false,
          pickupZone: "Library help desk",
          tags: ["math", "notes", "exam prep"],
          createdAt: "2026-04-09T10:00:00Z"
        },
        {
          id: "listing-sketchbook",
          sellerId: "user-max",
          title: "Almost New A4 Sketchbook",
          description: "Only a few pages used. Great for art class or poster drafts.",
          category: "Supplies",
          price: 75,
          imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
          status: "pending_review",
          moderationRequired: true,
          pickupZone: "Art room corridor",
          tags: ["art", "paper", "supplies"],
          createdAt: "2026-04-10T08:30:00Z"
        },
        {
          id: "listing-badge",
          sellerId: "user-sofia",
          title: "Council Launch Badge Pack",
          description: "Limited badge set for the first 20 BarterCoin pilot members.",
          category: "Merch",
          price: 45,
          imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1400&q=80",
          status: "active",
          moderationRequired: false,
          pickupZone: "Council office",
          tags: ["pilot", "merch", "badge"],
          createdAt: "2026-04-08T14:15:00Z"
        }
      ],
      orders: [
        {
          id: "order-204",
          listingId: "listing-graph-notes",
          buyerId: "user-max",
          sellerId: "user-alina",
          escrowAmount: 120,
          status: "awaiting_meetup",
          meetupWindow: "Today, 15:30-16:00 near Library help desk",
          createdAt: "2026-04-09T13:20:00Z",
          updatedAt: "2026-04-10T11:45:00Z"
        }
      ],
      escrowHolds: [
        {
          id: "hold-204",
          orderId: "order-204",
          buyerId: "user-max",
          amount: 120,
          released: false,
          refunded: false,
          createdAt: "2026-04-09T13:20:00Z",
          resolvedAt: null
        }
      ],
      messages: [
        {
          id: uid("message"),
          orderId: "order-204",
          authorId: "user-alina",
          body: "I left the notes in a blue folder. I’ll be near the library after class.",
          createdAt: "2026-04-10T11:00:00Z"
        },
        {
          id: uid("message"),
          orderId: "order-204",
          authorId: "user-max",
          body: "Perfect. I’ll confirm once I check the formula sheet is inside.",
          createdAt: "2026-04-10T11:05:00Z"
        }
      ],
      disputes: [],
      reports: [
        {
          id: uid("report"),
          listingId: "listing-sketchbook",
          reporterId: "user-sofia",
          reason: "Photo review needed because the seller is not trusted yet.",
          createdAt: "2026-04-10T08:45:00Z"
        }
      ],
      tokenRewards: [
        {
          id: uid("reward"),
          profileId: "user-alina",
          amount: 200,
          reason: "Helped run the debate tournament registration desk.",
          approvedById: "user-sofia",
          createdAt: "2026-04-03T12:00:00Z"
        },
        {
          id: uid("reward"),
          profileId: "user-max",
          amount: 75,
          reason: "Posted the launch poster set across the pilot hallway.",
          approvedById: "user-sofia",
          createdAt: "2026-04-08T10:00:00Z"
        }
      ],
      auditLogs: [
        createAudit("user-sofia", "reward_issued", "token_reward", "seed-reward-max", "2026-04-08T10:00:00Z"),
        createAudit("user-max", "listing_submitted", "listing", "listing-sketchbook", "2026-04-10T08:30:00Z")
      ],
      session: {
        currentUserId: "",
        demoLastLoginId: "",
        startedAt: nowIso()
      },
      ui: {
        ...defaultUi(),
        selectedOrderId: "order-204"
      }
    };
  }

  function createWallet(ownerId, balance, heldBalance, address) {
    return { id: `wallet-${ownerId}`, ownerId, address, balance, heldBalance };
  }

  function createLedger(walletId, type, amount, note, createdAt) {
    return { id: uid("ledger"), walletId, type, amount, note, createdAt };
  }

  function createAudit(actorId, action, subjectType, subjectId, createdAt) {
    return { id: uid("audit"), actorId, action, subjectType, subjectId, createdAt };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ui));
    if (auth.currentUser) {
      void persistRemoteState();
    }
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function currentUser() {
    return state.users.find((user) => user.id === state.session.currentUserId) || null;
  }

  function canModerate() {
    const user = currentUser();
    return Boolean(user && (user.role === "council_moderator" || user.role === "admin"));
  }

  function walletFor(userId) {
    return state.wallets.find((wallet) => wallet.ownerId === userId) || null;
  }

  function userById(userId) {
    return state.users.find((user) => user.id === userId) || null;
  }

  function listingById(listingId) {
    return state.listings.find((listing) => listing.id === listingId) || null;
  }

  function orderById(orderId) {
    return state.orders.find((order) => order.id === orderId) || null;
  }

  function disputeByOrder(orderId) {
    return state.disputes.find((dispute) => dispute.orderId === orderId) || null;
  }

  function holdByOrder(orderId) {
    return state.escrowHolds.find((hold) => hold.orderId === orderId) || null;
  }

  function orderMessages(orderId) {
    return state.messages
      .filter((message) => message.orderId === orderId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function userOrders(userId) {
    return state.orders
      .filter((order) => order.buyerId === userId || order.sellerId === userId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function userListings(userId) {
    return state.listings
      .filter((listing) => listing.sellerId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function activeMarketplaceListings() {
    const query = state.ui.search.trim().toLowerCase();
    return state.listings
      .filter((listing) => listing.status === "active")
      .filter((listing) => {
        if (!query) {
          return true;
        }
        return [listing.title, listing.description, listing.category, listing.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function ledgerForUser(userId) {
    const wallet = walletFor(userId);
    if (!wallet) {
      return [];
    }

    return state.ledger
      .filter((entry) => entry.walletId === wallet.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function completedSalesCount(userId) {
    return state.orders.filter((order) => order.sellerId === userId && order.status === "released").length;
  }

  function addAudit(action, subjectType, subjectId) {
    const user = currentUser();
    state.auditLogs.unshift(createAudit(user ? user.id : null, action, subjectType, subjectId, nowIso()));
  }

  function addLedger(walletId, type, amount, note) {
    state.ledger.unshift({ id: uid("ledger"), walletId, type, amount, note, createdAt: nowIso() });
  }

  function setMessage(type, text) {
    state.ui.authMessage = type === "success" ? text : "";
    state.ui.authError = type === "error" ? text : "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function prettyStatus(value) {
    return String(value || "").replaceAll("_", " ");
  }

  function coin(value) {
    return `${Number(value || 0).toLocaleString("en-US")} BCN`;
  }

  function shortDate(value) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
  }

  function fullDate(value) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function badgeTone(status) {
    if (["active", "released", "resolved_release", "trusted"].includes(status)) {
      return "good";
    }
    if (["pending_review", "awaiting_meetup", "awaiting_buyer_confirmation", "under_review"].includes(status)) {
      return "warn";
    }
    if (["rejected", "in_dispute", "resolved_refund", "refunded"].includes(status)) {
      return "danger";
    }
    return "";
  }

  function render() {
    if (!currentUser()) {
      app.innerHTML = renderAuth();
      bindAuthEvents();
      return;
    }

    app.innerHTML = renderApp();
    bindAppEvents();
  }

  function renderAuth() {
    return `
      <div class="auth-shell app-shell">
        <div class="auth-card">
          <section class="auth-hero">
            <span class="brand-kicker">School marketplace pilot</span>
            <h1>BarterCoin</h1>
            <p>
              A student-safe trading app where campus tokens move through escrow, the council moderates listings,
              and every order leaves an audit trail.
            </p>
            <div class="demo-box">
              <strong>Firebase auth</strong>
              <div class="small-print">Admin email: ${ADMIN_EMAIL}</div>
              <div class="small-print">Admin password: ${ADMIN_PASSWORD}</div>
              <div class="small-print">Google sign-in is enabled from this screen.</div>
            </div>
          </section>
          <section class="auth-form-panel">
            <div class="auth-switch">
              <div>
                <span class="eyebrow">${state.ui.authMode === "signin" ? "Sign in" : "Create account"}</span>
                <h2>${state.ui.authMode === "signin" ? "Access your wallet" : "Join the pilot"}</h2>
              </div>
              <button class="button button-secondary small" data-action="toggle-auth-mode" type="button">
                ${state.ui.authMode === "signin" ? "Need an account?" : "Already registered?"}
              </button>
            </div>

            ${state.ui.authMessage ? `<div class="message success">${escapeHtml(state.ui.authMessage)}</div>` : ""}
            ${state.ui.authError ? `<div class="message error">${escapeHtml(state.ui.authError)}</div>` : ""}

            ${
              state.ui.authMode === "signin"
                ? `
              <form class="auth-form" id="signin-form">
                <label>
                  School email
                  <input name="email" placeholder="name@school.edu" required type="email" />
                </label>
                <label>
                  Password
                  <input name="password" required type="password" />
                </label>
                <button class="button button-primary" type="submit">Sign in</button>
                <button class="button button-secondary" data-action="google-signin" type="button">Continue with Google</button>
              </form>
            `
                : `
              <form class="auth-form" id="signup-form">
                <label>
                  Full name
                  <input name="fullName" required type="text" />
                </label>
                <label>
                  School email
                  <input name="email" placeholder="name@school.edu" required type="email" />
                </label>
                <label>
                  Password
                  <input name="password" minlength="6" required type="password" />
                </label>
                <label>
                  Handle
                  <input name="handle" placeholder="@newstudent" required type="text" />
                </label>
                <label>
                  Grade or role
                  <input name="gradeLabel" placeholder="Grade 8" required type="text" />
                </label>
                <label class="full-span">
                  Short bio
                  <textarea name="bio" rows="4"></textarea>
                </label>
                <button class="button button-primary" type="submit">Create student account</button>
                <button class="button button-secondary" data-action="google-signin" type="button">Continue with Google</button>
              </form>
            `
            }
          </section>
        </div>
      </div>
    `;
  }

  function renderApp() {
    const user = currentUser();
    const view = state.ui.view;
    const nav = [
      ["overview", "Overview"],
      ["marketplace", "Marketplace"],
      ["create", "Create listing"],
      ["orders", "Orders"],
      ["council", "Council"]
    ].filter(([id]) => id !== "council" || canModerate());

    return `
      <div class="main-shell app-shell">
        <aside class="sidebar">
          <div class="brand">
            <span class="brand-kicker">Campus token pilot</span>
            <div class="brand-mark">BarterCoin</div>
            <div class="muted">Escrow-backed student trading with council moderation and a visible token ledger.</div>
          </div>

          <nav class="nav">
            ${nav
              .map(
                ([id, label]) => `
                <button class="${view === id ? "active" : ""}" data-view="${id}" type="button">${label}</button>
              `
              )
              .join("")}
          </nav>

          <div class="panel">
            <div class="avatar-row">
              <img alt="${escapeHtml(user.fullName)}" class="avatar" src="${escapeHtml(user.avatarUrl)}" />
              <div>
                <strong>${escapeHtml(user.fullName)}</strong>
                <div class="subtle">${escapeHtml(user.handle)} · ${escapeHtml(user.gradeLabel)}</div>
              </div>
            </div>
            <div class="pill-row" style="margin-top: 16px;">
              <span class="status ${badgeTone(user.trustedSeller ? "trusted" : "pending_review")}">
                ${user.trustedSeller ? "Trusted seller" : "Needs review"}
              </span>
              <span class="status">${prettyStatus(user.role)}</span>
            </div>
          </div>

          <div class="sidebar-footer">
            <button class="button button-secondary" data-action="reset-demo" type="button">Reset demo data</button>
            <button class="button button-ghost" data-action="logout" type="button">Log out</button>
          </div>
        </aside>

        <main class="main-pane">
          ${renderView()}
        </main>
      </div>
    `;
  }

  function renderView() {
    switch (state.ui.view) {
      case "marketplace":
        return renderMarketplace();
      case "create":
        return renderCreateListing();
      case "orders":
        return renderOrders();
      case "council":
        return renderCouncil();
      default:
        return renderOverview();
    }
  }

  function renderOverview() {
    const user = currentUser();
    const wallet = walletFor(user.id);
    const orders = userOrders(user.id);
    const featured = state.listings.filter((listing) => listing.status === "active").slice(0, 2);
    const recentLedger = ledgerForUser(user.id).slice(0, 5);

    return `
      <header class="view-header">
        <div>
          <span class="eyebrow">Student workspace</span>
          <h1>Trade safely, earn fairly, and keep every handoff visible.</h1>
        </div>
        <div class="button-row">
          <button class="button button-primary" data-view="marketplace" type="button">Open marketplace</button>
          <button class="button button-secondary" data-view="create" type="button">Post an item</button>
        </div>
      </header>

      <section class="grid-hero">
        <div class="panel hero-card">
          <span class="chip">Pilot cohort live</span>
          <h2 style="margin: 16px 0 10px;">${escapeHtml(user.fullName)}</h2>
          <p>
            Your wallet is active, your open trades are protected by escrow, and the council team can step in if a meetup fails.
          </p>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Wallet snapshot</h2>
            <span class="subtle">${escapeHtml(wallet.address)}</span>
          </div>
          <div class="stats-grid" style="grid-template-columns: 1fr 1fr;">
            <div class="panel stat-card mint">
              <span>Available balance</span>
              <strong>${coin(wallet.balance)}</strong>
            </div>
            <div class="panel stat-card amber">
              <span>Held in escrow</span>
              <strong>${coin(wallet.heldBalance)}</strong>
            </div>
          </div>
          <div class="pill-row" style="margin-top: 18px;">
            <span class="status ${user.trustedSeller ? "good" : "warn"}">
              ${user.trustedSeller ? "Trusted seller status" : "Listings reviewed by council"}
            </span>
          </div>
        </div>
      </section>

      <section class="stats-grid">
        <div class="panel stat-card">
          <span>My listings</span>
          <strong>${userListings(user.id).length}</strong>
        </div>
        <div class="panel stat-card mint">
          <span>Orders in flow</span>
          <strong>${orders.filter((order) => !["released", "refunded"].includes(order.status)).length}</strong>
        </div>
        <div class="panel stat-card">
          <span>Completed sales</span>
          <strong>${completedSalesCount(user.id)}</strong>
        </div>
        <div class="panel stat-card amber">
          <span>Council SLA</span>
          <strong>&lt; 24h</strong>
        </div>
      </section>

      <section class="two-col">
        <div class="panel">
          <div class="panel-header">
            <h2>Featured marketplace items</h2>
            <button class="button button-secondary small" data-view="marketplace" type="button">See all</button>
          </div>
          <div class="listing-grid">
            ${featured.map(renderListingCard).join("") || `<div class="empty-state">No active listings yet.</div>`}
          </div>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2>Recent wallet activity</h2>
            </div>
            <div class="list">
              ${recentLedger
                .map(
                  (entry) => `
                <div class="list-row">
                  <div>
                    <strong>${escapeHtml(entry.note)}</strong>
                    <div class="subtle">${fullDate(entry.createdAt)}</div>
                  </div>
                  <strong class="${entry.amount >= 0 ? "positive" : "negative"}">
                    ${entry.amount >= 0 ? "+" : ""}${coin(entry.amount)}
                  </strong>
                </div>
              `
                )
                .join("")}
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>Live order rhythm</h2>
            </div>
            <div class="list">
              ${orders
                .slice(0, 4)
                .map((order) => {
                  const partner = userById(order.buyerId === user.id ? order.sellerId : order.buyerId);
                  return `
                    <div class="list-row">
                      <div>
                        <strong>${escapeHtml(partner ? partner.fullName : "Unknown user")}</strong>
                        <div class="subtle">${escapeHtml(order.meetupWindow)}</div>
                      </div>
                      <span class="status ${badgeTone(order.status)}">${escapeHtml(prettyStatus(order.status))}</span>
                    </div>
                  `;
                })
                .join("") || `<div class="empty-state">Your orders will appear here as soon as you buy or sell.</div>`}
            </div>
          </section>
        </div>
      </section>
    `;
  }

  function renderListingCard(listing) {
    const seller = userById(listing.sellerId);
    const current = currentUser();
    const canBuy = current && current.id !== listing.sellerId && listing.status === "active";

    return `
      <article class="panel listing-card clickable-card">
        <img alt="${escapeHtml(listing.title)}" class="listing-image" src="${escapeHtml(listing.imageUrl)}" />
        <div class="listing-body">
          <div class="meta-row">
            <span class="subtle">${escapeHtml(listing.category)}</span>
            <strong>${coin(listing.price)}</strong>
          </div>
          <h3>${escapeHtml(listing.title)}</h3>
          <p class="muted">${escapeHtml(listing.description)}</p>
          <div class="listing-footer">
            <div>
              <strong>${escapeHtml(seller ? seller.handle : "unknown")}</strong>
              <div class="subtle">${escapeHtml(listing.pickupZone)}</div>
            </div>
            <span class="status ${badgeTone(listing.status)}">${escapeHtml(prettyStatus(listing.status))}</span>
          </div>
          <div class="button-row">
            <button class="button button-secondary small" data-action="focus-listing" data-listing-id="${listing.id}" type="button">
              Details
            </button>
            ${
              canBuy
                ? `<button class="button button-primary small" data-action="buy-listing" data-listing-id="${listing.id}" type="button">Buy with escrow</button>`
                : ``
            }
          </div>
        </div>
      </article>
    `;
  }

  function renderMarketplace() {
    const listings = activeMarketplaceListings();
    const myListings = userListings(currentUser().id);
    const focusedListing = listingById(state.ui.selectedMarketplaceListingId) || listings[0] || null;

    return `
      <header class="view-header">
        <div>
          <span class="eyebrow">Marketplace</span>
          <h1>Browse school-approved items and buy through escrow, not trust alone.</h1>
        </div>
        <div class="toolbar">
          <input id="market-search" placeholder="Search materials, tags, categories" value="${escapeHtml(state.ui.search)}" />
          <button class="button button-secondary" data-view="create" type="button">Create listing</button>
        </div>
      </header>

      <section class="panel">
        <div class="pill-row">
          <span class="status good">Escrow protected</span>
          <span class="status">Fixed-price only</span>
          <span class="status warn">Untrusted sellers reviewed</span>
        </div>
      </section>

      <section class="two-col">
        <div class="panel">
          <div class="panel-header">
            <h2>Active listings</h2>
            <span class="subtle">${listings.length} visible</span>
          </div>
          <div class="listing-grid">
            ${listings.map(renderListingCard).join("") || `<div class="empty-state">No listings match your search.</div>`}
          </div>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2>Focused item</h2>
              ${
                focusedListing
                  ? `<span class="status ${badgeTone(focusedListing.status)}">${escapeHtml(prettyStatus(focusedListing.status))}</span>`
                  : ""
              }
            </div>
            ${
              focusedListing
                ? renderFocusedListing(focusedListing)
                : `<div class="empty-state">Select a listing to inspect price, seller, and purchase rules.</div>`
            }
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>My listings</h2>
            </div>
            <div class="list">
              ${myListings
                .map(
                  (listing) => `
                <div class="list-row">
                  <div>
                    <strong>${escapeHtml(listing.title)}</strong>
                    <div class="subtle">${escapeHtml(listing.pickupZone)}</div>
                  </div>
                  <span class="status ${badgeTone(listing.status)}">${escapeHtml(prettyStatus(listing.status))}</span>
                </div>
              `
                )
                .join("") || `<div class="empty-state">Post your first listing to start selling.</div>`}
            </div>
          </section>
        </div>
      </section>
    `;
  }

  function renderFocusedListing(listing) {
    const seller = userById(listing.sellerId);
    const current = currentUser();
    const canBuy = current.id !== listing.sellerId && listing.status === "active";

    return `
      <div class="split-detail">
        <img alt="${escapeHtml(listing.title)}" class="listing-image" src="${escapeHtml(listing.imageUrl)}" />
        <div class="kv">
          <div class="kv-row"><span>Seller</span><strong>${escapeHtml(seller ? seller.fullName : "Unknown")}</strong></div>
          <div class="kv-row"><span>Trust</span><strong>${seller && seller.trustedSeller ? "Trusted seller" : "Reviewed by council"}</strong></div>
          <div class="kv-row"><span>Pickup zone</span><strong>${escapeHtml(listing.pickupZone)}</strong></div>
          <div class="kv-row"><span>Category</span><strong>${escapeHtml(listing.category)}</strong></div>
          <div class="kv-row"><span>Price</span><strong>${coin(listing.price)}</strong></div>
          <div class="kv-row"><span>Tags</span><strong>${escapeHtml(listing.tags.join(", "))}</strong></div>
        </div>
        <p class="muted">${escapeHtml(listing.description)}</p>
        <div class="button-row">
          ${
            canBuy
              ? `<button class="button button-primary" data-action="buy-listing" data-listing-id="${listing.id}" type="button">Buy and fund escrow</button>`
              : `<span class="subtle">You cannot buy your own listing or inactive items.</span>`
          }
          <button class="button button-secondary" data-action="report-listing" data-listing-id="${listing.id}" type="button">Report listing</button>
        </div>
      </div>
    `;
  }

  function renderCreateListing() {
    const user = currentUser();
    return `
      <header class="view-header">
        <div>
          <span class="eyebrow">Create listing</span>
          <h1>Post something useful and let the trust rules decide whether it goes live or enters review.</h1>
        </div>
      </header>

      <section class="two-col">
        <form class="panel form-grid" id="create-listing-form">
          <div class="full-span panel-header">
            <h2>Listing draft</h2>
            <span class="status ${user.trustedSeller ? "good" : "warn"}">
              ${user.trustedSeller ? "Will publish instantly" : "Will enter council review"}
            </span>
          </div>
          <label>
            Title
            <input name="title" required type="text" />
          </label>
          <label>
            Category
            <select name="category">
              <option>Study Materials</option>
              <option>Supplies</option>
              <option>Merch</option>
              <option>Club Items</option>
              <option>Books</option>
            </select>
          </label>
          <label>
            Price in BCN
            <input min="1" name="price" required type="number" />
          </label>
          <label>
            Pickup zone
            <input name="pickupZone" required type="text" />
          </label>
          <label class="full-span">
            Image URL
            <input name="imageUrl" placeholder="https://..." type="url" />
          </label>
          <label class="full-span">
            Description
            <textarea name="description" required rows="6"></textarea>
          </label>
          <label class="full-span">
            Tags
            <input name="tags" placeholder="math, notes, exam prep" type="text" />
          </label>
          <div class="full-span button-row">
            <button class="button button-primary" type="submit">Create listing</button>
          </div>
        </form>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2>Publishing logic</h2>
            </div>
            <div class="list">
              <div class="list-row">Trusted sellers skip review and go live instantly.</div>
              <div class="list-row">New sellers enter a moderation queue before the listing becomes visible.</div>
              <div class="list-row">All items must use school-safe pickup zones and token-only prices.</div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>Blocked categories</h2>
            </div>
            <div class="tag-row">
              <span class="status danger">Adult content</span>
              <span class="status danger">Cheating services</span>
              <span class="status danger">Dangerous items</span>
              <span class="status danger">Private data</span>
              <span class="status danger">Harassment material</span>
            </div>
          </section>
        </div>
      </section>
    `;
  }

  function renderOrders() {
    const user = currentUser();
    const orders = userOrders(user.id);
    const selectedOrder = orderById(state.ui.selectedOrderId) || orders[0] || null;

    return `
      <header class="view-header">
        <div>
          <span class="eyebrow">Orders</span>
          <h1>Track meetups, keep chat attached to the order, and settle escrow only after the handoff is real.</h1>
        </div>
      </header>

      <section class="two-col">
        <div class="panel">
          <div class="panel-header">
            <h2>Your orders</h2>
            <span class="subtle">${orders.length} total</span>
          </div>
          <div class="list">
            ${orders
              .map((order) => {
                const listing = listingById(order.listingId);
                const partner = userById(order.buyerId === user.id ? order.sellerId : order.buyerId);
                return `
                  <button class="panel clickable-card ${selectedOrder && selectedOrder.id === order.id ? "selected" : ""}"
                    data-action="select-order"
                    data-order-id="${order.id}"
                    type="button"
                    style="text-align:left;">
                    <div class="order-header">
                      <div>
                        <strong>${escapeHtml(listing ? listing.title : "Unknown listing")}</strong>
                        <div class="subtle">${escapeHtml(partner ? partner.fullName : "Unknown user")}</div>
                      </div>
                      <span class="status ${badgeTone(order.status)}">${escapeHtml(prettyStatus(order.status))}</span>
                    </div>
                    <div class="subtle" style="margin-top:10px;">${escapeHtml(order.meetupWindow)}</div>
                  </button>
                `;
              })
              .join("") || `<div class="empty-state">No orders yet. Buy something from the marketplace first.</div>`}
          </div>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2>Selected order</h2>
            </div>
            ${selectedOrder ? renderOrderDetail(selectedOrder) : `<div class="empty-state">Choose an order to see its status, escrow, and chat.</div>`}
          </section>
        </div>
      </section>
    `;
  }

  function renderOrderDetail(order) {
    const user = currentUser();
    const listing = listingById(order.listingId);
    const buyer = userById(order.buyerId);
    const seller = userById(order.sellerId);
    const hold = holdByOrder(order.id);
    const dispute = disputeByOrder(order.id);
    const canConfirm = user.id === order.buyerId && order.status === "awaiting_meetup";
    const canOpenDispute =
      (user.id === order.buyerId || user.id === order.sellerId) && !["released", "refunded", "in_dispute"].includes(order.status);

    return `
      <div class="split-detail">
        <div class="kv">
          <div class="kv-row"><span>Listing</span><strong>${escapeHtml(listing ? listing.title : "Unknown listing")}</strong></div>
          <div class="kv-row"><span>Buyer</span><strong>${escapeHtml(buyer ? buyer.fullName : "Unknown")}</strong></div>
          <div class="kv-row"><span>Seller</span><strong>${escapeHtml(seller ? seller.fullName : "Unknown")}</strong></div>
          <div class="kv-row"><span>Escrow</span><strong>${coin(order.escrowAmount)}</strong></div>
          <div class="kv-row"><span>Meetup</span><strong>${escapeHtml(order.meetupWindow)}</strong></div>
          <div class="kv-row"><span>Status</span><strong>${escapeHtml(prettyStatus(order.status))}</strong></div>
          <div class="kv-row"><span>Escrow state</span><strong>${hold ? (hold.released ? "Released" : hold.refunded ? "Refunded" : "Held") : "None"}</strong></div>
        </div>

        ${
          dispute
            ? `
            <div class="message error">
              <strong>Dispute:</strong> ${escapeHtml(dispute.summary)}<br />
              <span class="small-print">${escapeHtml(dispute.status.replaceAll("_", " "))}${dispute.resolutionNote ? ` · ${escapeHtml(dispute.resolutionNote)}` : ""}</span>
            </div>
          `
            : ``
        }

        <div class="button-row">
          ${
            canConfirm
              ? `<button class="button button-primary" data-action="confirm-order" data-order-id="${order.id}" type="button">Confirm meetup and release escrow</button>`
              : ``
          }
          ${
            canOpenDispute
              ? `<button class="button button-secondary" data-action="open-dispute" data-order-id="${order.id}" type="button">Open dispute</button>`
              : ``
          }
        </div>

        <div class="panel">
          <div class="panel-header">
            <h3>Order chat</h3>
          </div>
          <div class="chat-list">
            ${orderMessages(order.id)
              .map((message) => {
                const author = userById(message.authorId);
                return `
                  <div class="chat-item">
                    <strong>${escapeHtml(author ? author.fullName : "Unknown")}</strong>
                    <div>${escapeHtml(message.body)}</div>
                    <div class="subtle">${fullDate(message.createdAt)}</div>
                  </div>
                `;
              })
              .join("") || `<div class="empty-state">No chat messages yet.</div>`}
          </div>
          <form data-order-id="${order.id}" id="chat-form" style="margin-top: 16px;">
            <div class="button-row" style="align-items: stretch;">
              <input name="body" placeholder="Send a message tied to this order..." required type="text" />
              <button class="button button-primary" type="submit">Send</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderCouncil() {
    const pendingListings = state.listings.filter((listing) => listing.status === "pending_review");
    const openDisputes = state.disputes.filter((dispute) => ["open", "under_review"].includes(dispute.status));
    const rewardCandidates = state.users.filter((user) => user.role === "student");
    const recentAudit = state.auditLogs.slice(0, 8);

    return `
      <header class="view-header">
        <div>
          <span class="eyebrow">Council console</span>
          <h1>Moderate listings, resolve disputes, reward contributions, and keep the token economy fair.</h1>
        </div>
      </header>

      <section class="stats-grid">
        <div class="panel stat-card amber">
          <span>Pending reviews</span>
          <strong>${pendingListings.length}</strong>
        </div>
        <div class="panel stat-card amber">
          <span>Open disputes</span>
          <strong>${openDisputes.length}</strong>
        </div>
        <div class="panel stat-card mint">
          <span>Total rewards</span>
          <strong>${state.tokenRewards.length}</strong>
        </div>
        <div class="panel stat-card">
          <span>Audit events</span>
          <strong>${state.auditLogs.length}</strong>
        </div>
      </section>

      <section class="two-col">
        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2>Listing moderation queue</h2>
            </div>
            <div class="list">
              ${pendingListings
                .map((listing) => {
                  const seller = userById(listing.sellerId);
                  return `
                    <div class="list-row">
                      <div>
                        <strong>${escapeHtml(listing.title)}</strong>
                        <div class="subtle">${escapeHtml(seller ? seller.fullName : "Unknown")} · ${escapeHtml(listing.category)}</div>
                      </div>
                      <div class="button-row">
                        <button class="button button-secondary small" data-action="moderate-listing" data-listing-id="${listing.id}" data-decision="reject" type="button">Reject</button>
                        <button class="button button-primary small" data-action="moderate-listing" data-listing-id="${listing.id}" data-decision="approve" type="button">Approve</button>
                      </div>
                    </div>
                  `;
                })
                .join("") || `<div class="empty-state">No listings waiting for review.</div>`}
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>Dispute resolution</h2>
            </div>
            <div class="list">
              ${openDisputes
                .map((dispute) => {
                  const order = orderById(dispute.orderId);
                  return `
                    <div class="list-row">
                      <div>
                        <strong>${escapeHtml(dispute.summary)}</strong>
                        <div class="subtle">${order ? escapeHtml(order.meetupWindow) : ""}</div>
                      </div>
                      <div class="button-row">
                        <button class="button button-secondary small" data-action="resolve-dispute" data-dispute-id="${dispute.id}" data-resolution="refund" type="button">Refund buyer</button>
                        <button class="button button-primary small" data-action="resolve-dispute" data-dispute-id="${dispute.id}" data-resolution="release" type="button">Release seller</button>
                      </div>
                    </div>
                  `;
                })
                .join("") || `<div class="empty-state">No open disputes right now.</div>`}
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2>Issue token reward</h2>
            </div>
            <form class="form-grid" id="reward-form">
              <label>
                Student
                <select name="profileId">
                  ${rewardCandidates
                    .map((user) => `<option value="${user.id}">${escapeHtml(user.fullName)} (${escapeHtml(user.handle)})</option>`)
                    .join("")}
                </select>
              </label>
              <label>
                Amount
                <input min="1" name="amount" required type="number" />
              </label>
              <label class="full-span">
                Reason
                <textarea name="reason" required rows="4"></textarea>
              </label>
              <div class="full-span button-row">
                <button class="button button-primary" type="submit">Issue reward</button>
              </div>
            </form>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>Trusted seller control</h2>
            </div>
            <div class="list">
              ${rewardCandidates
                .map((candidate) => `
                  <div class="list-row">
                    <div>
                      <strong>${escapeHtml(candidate.fullName)}</strong>
                      <div class="subtle">${completedSalesCount(candidate.id)} released sales</div>
                    </div>
                    <div class="button-row">
                      <span class="status ${candidate.trustedSeller ? "good" : "warn"}">${candidate.trustedSeller ? "Trusted" : "Not trusted"}</span>
                      <button class="button button-secondary small" data-action="toggle-trusted" data-user-id="${candidate.id}" type="button">
                        ${candidate.trustedSeller ? "Remove trust" : "Grant trust"}
                      </button>
                    </div>
                  </div>
                `)
                .join("")}
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>Audit trail</h2>
            </div>
            <div class="list">
              ${recentAudit
                .map((log) => {
                  const actor = userById(log.actorId);
                  return `
                    <div class="list-row">
                      <div>
                        <strong>${escapeHtml(actor ? actor.fullName : "System")}</strong>
                        <div class="subtle">${escapeHtml(prettyStatus(log.action))} · ${escapeHtml(log.subjectType)}</div>
                      </div>
                      <div class="subtle">${shortDate(log.createdAt)}</div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </section>
        </div>
      </section>
    `;
  }

  function bindAuthEvents() {
    const toggle = document.querySelector('[data-action="toggle-auth-mode"]');
    if (toggle) {
      toggle.addEventListener("click", function () {
        state.ui.authMode = state.ui.authMode === "signin" ? "signup" : "signin";
        setMessage("success", "");
        setMessage("error", "");
        render();
      });
    }

    const signinForm = document.getElementById("signin-form");
    if (signinForm) {
      signinForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const form = new FormData(signinForm);
        signIn(String(form.get("email") || ""), String(form.get("password") || ""));
      });
    }

    const signupForm = document.getElementById("signup-form");
    if (signupForm) {
      signupForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const form = new FormData(signupForm);
        signUp({
          fullName: String(form.get("fullName") || ""),
          email: String(form.get("email") || ""),
          password: String(form.get("password") || ""),
          handle: String(form.get("handle") || ""),
          gradeLabel: String(form.get("gradeLabel") || ""),
          bio: String(form.get("bio") || "")
        });
      });
    }

    document.querySelectorAll('[data-action="google-signin"]').forEach((button) => {
      button.addEventListener("click", function () {
        void signInWithGoogle();
      });
    });
  }

  function bindAppEvents() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", function () {
        state.ui.view = button.getAttribute("data-view");
        saveState();
        render();
      });
    });

    document.querySelector('[data-action="logout"]')?.addEventListener("click", logOut);
    document.querySelector('[data-action="reset-demo"]')?.addEventListener("click", resetDemo);

    const search = document.getElementById("market-search");
    if (search) {
      search.addEventListener("input", function () {
        state.ui.search = search.value;
        saveState();
        render();
      });
    }

    document.querySelectorAll('[data-action="focus-listing"]').forEach((button) => {
      button.addEventListener("click", function () {
        state.ui.selectedMarketplaceListingId = button.getAttribute("data-listing-id") || "";
        saveState();
        render();
      });
    });

    document.querySelectorAll('[data-action="buy-listing"]').forEach((button) => {
      button.addEventListener("click", function () {
        const listingId = button.getAttribute("data-listing-id");
        const meetupWindow = window.prompt("Enter a meetup window, for example: Tomorrow 12:20-12:35 at the library desk");
        if (listingId && meetupWindow) {
          purchaseListing(listingId, meetupWindow);
        }
      });
    });

    document.querySelectorAll('[data-action="report-listing"]').forEach((button) => {
      button.addEventListener("click", function () {
        const listingId = button.getAttribute("data-listing-id");
        const reason = window.prompt("Why are you reporting this listing?");
        if (listingId && reason) {
          reportListing(listingId, reason);
        }
      });
    });

    const createListingForm = document.getElementById("create-listing-form");
    if (createListingForm) {
      createListingForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const form = new FormData(createListingForm);
        createListing({
          title: String(form.get("title") || ""),
          category: String(form.get("category") || ""),
          price: Number(form.get("price") || 0),
          pickupZone: String(form.get("pickupZone") || ""),
          imageUrl: String(form.get("imageUrl") || ""),
          description: String(form.get("description") || ""),
          tags: String(form.get("tags") || "")
        });
      });
    }

    document.querySelectorAll('[data-action="select-order"]').forEach((button) => {
      button.addEventListener("click", function () {
        state.ui.selectedOrderId = button.getAttribute("data-order-id") || "";
        saveState();
        render();
      });
    });

    document.querySelectorAll('[data-action="confirm-order"]').forEach((button) => {
      button.addEventListener("click", function () {
        const orderId = button.getAttribute("data-order-id");
        if (orderId) {
          confirmOrder(orderId);
        }
      });
    });

    document.querySelectorAll('[data-action="open-dispute"]').forEach((button) => {
      button.addEventListener("click", function () {
        const orderId = button.getAttribute("data-order-id");
        const summary = window.prompt("Describe what went wrong with the meetup.");
        if (orderId && summary) {
          openDispute(orderId, summary);
        }
      });
    });

    const chatForm = document.getElementById("chat-form");
    if (chatForm) {
      chatForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const orderId = chatForm.getAttribute("data-order-id");
        const form = new FormData(chatForm);
        const body = String(form.get("body") || "");
        if (orderId && body.trim()) {
          sendMessage(orderId, body.trim());
          chatForm.reset();
        }
      });
    }

    document.querySelectorAll('[data-action="moderate-listing"]').forEach((button) => {
      button.addEventListener("click", function () {
        moderateListing(button.getAttribute("data-listing-id"), button.getAttribute("data-decision"));
      });
    });

    document.querySelectorAll('[data-action="resolve-dispute"]').forEach((button) => {
      button.addEventListener("click", function () {
        const disputeId = button.getAttribute("data-dispute-id");
        const resolution = button.getAttribute("data-resolution");
        if (disputeId && resolution) {
          const note = window.prompt("Add an optional resolution note") || "";
          resolveDispute(disputeId, resolution, note);
        }
      });
    });

    const rewardForm = document.getElementById("reward-form");
    if (rewardForm) {
      rewardForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const form = new FormData(rewardForm);
        issueReward(
          String(form.get("profileId") || ""),
          Number(form.get("amount") || 0),
          String(form.get("reason") || "")
        );
      });
    }

    document.querySelectorAll('[data-action="toggle-trusted"]').forEach((button) => {
      button.addEventListener("click", function () {
        toggleTrusted(button.getAttribute("data-user-id"));
      });
    });
  }

  async function signIn(email, password) {
    try {
      const normalizedEmail = email.trim().toLowerCase() === "admin" ? ADMIN_EMAIL : email.trim();
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      setMessage("success", "Signed in successfully.");
      saveState();
    } catch (error) {
      setMessage("error", `Sign in failed: ${error.message || error}`);
      saveState();
      render();
    }
  }

  async function signInWithGoogle() {
    try {
      await signInWithPopup(auth, googleProvider);
      setMessage("success", "Google sign in complete.");
      saveState();
    } catch (error) {
      setMessage("error", `Google sign in failed: ${error.message || error}`);
      saveState();
      render();
    }
  }

  async function signUp(form) {
    const email = form.email.trim().toLowerCase();
    const handle = form.handle.trim().startsWith("@") ? form.handle.trim() : `@${form.handle.trim()}`;

    if (!email.endsWith(".edu")) {
      setMessage("error", "Use a school-style email ending in .edu for the pilot.");
      saveState();
      render();
      return;
    }

    if (state.users.some((user) => user.email.toLowerCase() === email)) {
      setMessage("error", "That email is already registered.");
      saveState();
      render();
      return;
    }

    if (state.users.some((user) => user.handle.toLowerCase() === handle.toLowerCase())) {
      setMessage("error", "That handle is already taken.");
      saveState();
      render();
      return;
    }

    try {
      const result = await createUserWithEmailAndPassword(auth, email, form.password);
      await updateProfile(result.user, { displayName: form.fullName.trim() });
      await ensureProfileForAuthUser(result.user);
      const created = state.users.find((user) => user.id === result.user.uid);
      if (created) {
        created.handle = handle;
        created.gradeLabel = form.gradeLabel.trim();
        created.bio = form.bio.trim();
      }
      setMessage("success", "Account created. Your starter wallet is ready.");
      state.ui.view = "overview";
      saveState();
      render();
    } catch (error) {
      setMessage("error", `Sign up failed: ${error.message || error}`);
      saveState();
      render();
    }
  }

  async function logOut() {
    state.session.currentUserId = "";
    state.ui.authMode = "signin";
    state.ui.authMessage = "";
    state.ui.authError = "";
    await signOut(auth);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ui));
    render();
  }

  async function resetDemo() {
    if (!window.confirm("Reset the whole demo and lose local changes?")) {
      return;
    }

    const fresh = seedState();
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, fresh);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ui));
    await persistRemoteState(true);
    render();
  }

  function createListing(form) {
    const user = currentUser();
    if (!user) {
      return;
    }

    const blockedWords = ["cheat", "weapon", "adult", "password", "hack"];
    const combined = `${form.title} ${form.description}`.toLowerCase();
    if (blockedWords.some((word) => combined.includes(word))) {
      window.alert("This listing includes blocked content for the school pilot.");
      return;
    }

    const listing = {
      id: uid("listing"),
      sellerId: user.id,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      price: form.price,
      imageUrl:
        form.imageUrl.trim() ||
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
      status: user.trustedSeller ? "active" : "pending_review",
      moderationRequired: !user.trustedSeller,
      pickupZone: form.pickupZone.trim(),
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: nowIso()
    };

    state.listings.unshift(listing);
    addAudit(user.trustedSeller ? "listing_published" : "listing_submitted", "listing", listing.id);
    state.ui.view = "marketplace";
    state.ui.selectedMarketplaceListingId = listing.id;
    saveState();
    render();
  }

  function purchaseListing(listingId, meetupWindow) {
    const listing = listingById(listingId);
    const buyer = currentUser();

    if (!listing || !buyer) {
      return;
    }

    if (listing.status !== "active") {
      window.alert("This listing is not available anymore.");
      return;
    }

    if (listing.sellerId === buyer.id) {
      window.alert("You cannot buy your own listing.");
      return;
    }

    const buyerWallet = walletFor(buyer.id);
    if (!buyerWallet || buyerWallet.balance < listing.price) {
      window.alert("Not enough available balance to fund escrow.");
      return;
    }

    buyerWallet.balance -= listing.price;
    buyerWallet.heldBalance += listing.price;
    listing.status = "sold";

    const order = {
      id: uid("order"),
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: listing.sellerId,
      escrowAmount: listing.price,
      status: "awaiting_meetup",
      meetupWindow: meetupWindow.trim(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    state.orders.unshift(order);
    state.escrowHolds.push({
      id: uid("hold"),
      orderId: order.id,
      buyerId: buyer.id,
      amount: listing.price,
      released: false,
      refunded: false,
      createdAt: nowIso(),
      resolvedAt: null
    });
    state.messages.push({
      id: uid("message"),
      orderId: order.id,
      authorId: buyer.id,
      body: `Order started. Escrow funded for ${coin(listing.price)}.`,
      createdAt: nowIso()
    });

    addLedger(buyerWallet.id, "escrow_hold", -listing.price, `Escrow hold for ${listing.title}`);
    addAudit("order_created", "order", order.id);
    state.ui.view = "orders";
    state.ui.selectedOrderId = order.id;
    saveState();
    render();
  }

  function confirmOrder(orderId) {
    const order = orderById(orderId);
    const user = currentUser();
    const hold = holdByOrder(orderId);
    const listing = order ? listingById(order.listingId) : null;

    if (!order || !user || !hold || user.id !== order.buyerId || order.status !== "awaiting_meetup") {
      return;
    }

    const buyerWallet = walletFor(order.buyerId);
    const sellerWallet = walletFor(order.sellerId);
    if (!buyerWallet || !sellerWallet) {
      return;
    }

    buyerWallet.heldBalance -= order.escrowAmount;
    sellerWallet.balance += order.escrowAmount;
    hold.released = true;
    hold.refunded = false;
    hold.resolvedAt = nowIso();
    order.status = "released";
    order.updatedAt = nowIso();

    addLedger(buyerWallet.id, "escrow_release", -order.escrowAmount, `Escrow released for ${listing ? listing.title : "order"}`);
    addLedger(sellerWallet.id, "escrow_release", order.escrowAmount, `Escrow received from ${userById(order.buyerId).handle}`);
    state.messages.push({
      id: uid("message"),
      orderId: order.id,
      authorId: user.id,
      body: "Buyer confirmed the meetup. Escrow released to seller.",
      createdAt: nowIso()
    });
    addAudit("order_released", "order", order.id);

    const seller = userById(order.sellerId);
    if (seller && !seller.trustedSeller && completedSalesCount(seller.id) + 1 >= 3) {
      seller.trustedSeller = true;
      addAudit("trusted_seller_auto_granted", "user", seller.id);
    }

    saveState();
    render();
  }

  function openDispute(orderId, summary) {
    const order = orderById(orderId);
    const user = currentUser();
    if (!order || !user) {
      return;
    }

    if (![order.buyerId, order.sellerId].includes(user.id)) {
      return;
    }

    if (disputeByOrder(orderId)) {
      window.alert("There is already an active dispute for this order.");
      return;
    }

    order.status = "in_dispute";
    order.updatedAt = nowIso();
    const dispute = {
      id: uid("dispute"),
      orderId,
      openedById: user.id,
      status: "under_review",
      summary: summary.trim(),
      resolutionNote: "",
      createdAt: nowIso()
    };
    state.disputes.unshift(dispute);
    state.messages.push({
      id: uid("message"),
      orderId,
      authorId: user.id,
      body: `Dispute opened: ${summary.trim()}`,
      createdAt: nowIso()
    });
    addAudit("dispute_opened", "dispute", dispute.id);
    saveState();
    render();
  }

  function resolveDispute(disputeId, resolution, note) {
    if (!canModerate()) {
      return;
    }

    const dispute = state.disputes.find((item) => item.id === disputeId);
    if (!dispute) {
      return;
    }

    const order = orderById(dispute.orderId);
    const hold = holdByOrder(dispute.orderId);
    if (!order || !hold) {
      return;
    }

    const buyerWallet = walletFor(order.buyerId);
    const sellerWallet = walletFor(order.sellerId);
    if (!buyerWallet || !sellerWallet) {
      return;
    }

    if (resolution === "refund") {
      buyerWallet.balance += order.escrowAmount;
      buyerWallet.heldBalance -= order.escrowAmount;
      hold.refunded = true;
      hold.released = false;
      order.status = "refunded";
      dispute.status = "resolved_refund";
      addLedger(buyerWallet.id, "escrow_refund", order.escrowAmount, "Escrow refunded after dispute review");
    } else {
      buyerWallet.heldBalance -= order.escrowAmount;
      sellerWallet.balance += order.escrowAmount;
      hold.released = true;
      hold.refunded = false;
      order.status = "released";
      dispute.status = "resolved_release";
      addLedger(sellerWallet.id, "escrow_release", order.escrowAmount, "Escrow released after dispute review");
      addLedger(buyerWallet.id, "escrow_release", -order.escrowAmount, "Escrow released after dispute review");
    }

    hold.resolvedAt = nowIso();
    order.updatedAt = nowIso();
    dispute.resolutionNote = note.trim();
    state.messages.push({
      id: uid("message"),
      orderId: order.id,
      authorId: currentUser().id,
      body: `Council resolved the dispute: ${resolution === "refund" ? "buyer refunded" : "seller paid"}${note ? ` (${note.trim()})` : ""}.`,
      createdAt: nowIso()
    });
    addAudit(`dispute_${resolution}`, "dispute", dispute.id);
    saveState();
    render();
  }

  function sendMessage(orderId, body) {
    const user = currentUser();
    const order = orderById(orderId);
    if (!user || !order) {
      return;
    }

    const allowed = canModerate() || [order.buyerId, order.sellerId].includes(user.id);
    if (!allowed) {
      return;
    }

    state.messages.push({
      id: uid("message"),
      orderId,
      authorId: user.id,
      body,
      createdAt: nowIso()
    });
    addAudit("order_message_sent", "order", orderId);
    saveState();
    render();
  }

  function moderateListing(listingId, decision) {
    if (!canModerate()) {
      return;
    }

    const listing = listingById(listingId);
    if (!listing) {
      return;
    }

    listing.status = decision === "approve" ? "active" : "rejected";
    addAudit(decision === "approve" ? "listing_approved" : "listing_rejected", "listing", listing.id);
    saveState();
    render();
  }

  function issueReward(profileId, amount, reason) {
    if (!canModerate()) {
      return;
    }

    const recipientWallet = walletFor(profileId);
    const moderator = currentUser();
    if (!recipientWallet || !amount || amount < 1 || !reason.trim()) {
      return;
    }

    recipientWallet.balance += amount;
    const reward = {
      id: uid("reward"),
      profileId,
      amount,
      reason: reason.trim(),
      approvedById: moderator.id,
      createdAt: nowIso()
    };
    state.tokenRewards.unshift(reward);
    addLedger(recipientWallet.id, "reward_mint", amount, `Council reward: ${reason.trim()}`);
    addAudit("reward_issued", "token_reward", reward.id);
    saveState();
    render();
  }

  function toggleTrusted(userId) {
    if (!canModerate()) {
      return;
    }

    const user = userById(userId);
    if (!user || user.role !== "student") {
      return;
    }

    user.trustedSeller = !user.trustedSeller;
    addAudit(user.trustedSeller ? "trusted_granted" : "trusted_removed", "user", user.id);
    saveState();
    render();
  }

  function reportListing(listingId, reason) {
    const user = currentUser();
    if (!user || !reason.trim()) {
      return;
    }

    state.reports.unshift({
      id: uid("report"),
      listingId,
      reporterId: user.id,
      reason: reason.trim(),
      createdAt: nowIso()
    });
    addAudit("listing_reported", "listing", listingId);
    saveState();
    window.alert("Report submitted to the council queue.");
    render();
  }
})();

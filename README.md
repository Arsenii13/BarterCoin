# BarterCoin Firebase Web App

This folder is a plain `HTML + CSS + JavaScript` app powered by Firebase Auth + Firestore.

## Run locally

1. Serve the `web` folder from a local static server or deploy to GitHub Pages.
2. Open the hosted URL.
3. Sign in:
   - Admin: `admin` (or `admin@bartercoin.school`) / `090906`
   - Or create a student account with email/password.
   - Or continue with Google.

## Deploy to GitHub Pages

Upload the contents of this `web` folder to your repository and publish with GitHub Pages.

No build step is required.

After deployment, in Firebase Console:
- add your GitHub Pages domain to Auth Authorized Domains
- enable Auth providers: Email/Password and Google
- publish Firestore rules from [firestore.rules](C:\Users\arsen\work\BarterCoin\web\firestore.rules)

## Important note

This version uses:
- Firebase Authentication (Google + email/password)
- Firestore collections:
  - `profiles`
  - `wallets`
  - `listings`
  - `orders`
  - `messages`
  - `disputes`
  - `ledger`
  - `notifications`
  - `sanctions`
- localStorage only for UI preferences
- multilingual UI: English, Bulgarian, Ukrainian

Important:
- Opening directly via `file://` can block Firebase auth flows due browser/provider restrictions.
- Use a hosted URL (`https://...`) or local static server (`http://localhost:...`) for full auth behavior.

## Built-in logic

- Firebase email/password signup and login
- Firebase Google sign-in
- embedded admin bootstrap account (`admin@bartercoin.school`, password `090906`)
- starter wallets created on first login
- listing creation with generated design images (SVG, no faces)
- trusted-seller moderation bypass
- escrow-backed purchase flow via Cloud Functions
- order chat
- dispute opening and council resolution with SLA timer
- token rewards via Cloud Functions
- admin moderation tools:
  - bulk approve/reject
  - sanctions (post/chat blocks)
  - role claim assignment (admin/moderator/student)
- marketplace search, price filters, category filters, sorting
- mobile-friendly layout with animated transitions

## Security + Functions deployment

1. Publish rules:
   - [firestore.rules](C:\Users\arsen\work\BarterCoin\web\firestore.rules)
2. Deploy functions from:
   - [firebase/functions/index.js](C:\Users\arsen\work\BarterCoin\firebase\functions\index.js)
   - [firebase/functions/package.json](C:\Users\arsen\work\BarterCoin\firebase\functions\package.json)
3. Ensure the first admin logs in and assigns custom claims using the Admin panel.

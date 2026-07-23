BNHS Student Information & Management System (registrar enrollment + attendance). Copy `.env.example` to `.env` and fill in a new Firebase project's web-app config. `npm install`, then `npm run dev`.

## Setup & Deployment Guide

This project is intentionally separate from the teacher attendance app — it uses its own Firebase project and separate Firestore database.

### 1. Create a New Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com).
2. Click "Create a project" and name it (e.g., "bnhs-sims").
3. Accept the defaults and create the project.
4. Once created, go to **Project Settings** (gear icon) and copy the **Web app config** (API key, project ID, auth domain, etc.).

### 2. Enable Email/Password Authentication

1. In the Firebase Console, go to **Authentication** > **Sign-in method**.
2. Enable **Email/Password**.
3. Go to **Users** tab and click **Add user**.
4. Create the first registrar account with an email (e.g., registrar@bnhs.edu) and a secure password.
5. Copy the user's email — you'll need it in the next step.

### 3. Initialize Firestore & Create System Documents

1. In the Firebase Console, go to **Firestore Database**.
2. Create a database in production mode.
3. Add two documents:
   - Collection: `users`, Document ID: `<registrar-email-lowercase>`, Content:
     ```json
     { "name": "Registrar Name", "role": "registrar" }
     ```
   - Collection: `settings`, Document ID: `app`, Content:
     ```json
     { "currentSchoolYear": "2026-2027" }
     ```

### 4. Configure Local Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in the Firebase web-app config from step 1:
   ```
   VITE_FIREBASE_API_KEY=<your-api-key>
   VITE_FIREBASE_AUTH_DOMAIN=<your-project>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<your-project-id>
   VITE_FIREBASE_STORAGE_BUCKET=<your-project>.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=<your-sender-id>
   VITE_FIREBASE_APP_ID=<your-app-id>
   ```

### 5. Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open http://localhost:5173 in your browser, sign in with the registrar account, and verify the app loads.

### 6. Deploy to Firebase Hosting

1. Install Firebase CLI (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to Firebase:
   ```bash
   npx firebase login
   ```
3. Update `.firebaserc` with your Firebase project ID:
   ```json
   { "projects": { "default": "<your-project-id>" } }
   ```
4. Deploy Firestore security rules:
   ```bash
   npx firebase deploy --only firestore:rules
   ```
5. Build and deploy the hosting:
   ```bash
   npm run deploy
   ```
   This command builds the app and deploys it to Firebase Hosting. The hosting URL will be printed at the end.

### 7. Verify Access Control (Optional)

After deploying, you can verify that unauthenticated access is denied:
- Open the Firebase Console, go to **Firestore** > **Rules Playground**.
- Simulate a read request on `/students` with no authentication.
- Expected: request is denied.
- Sign in with the registrar account in the app and verify data loads normally.

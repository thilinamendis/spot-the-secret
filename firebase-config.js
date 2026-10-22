/*
 * Spot the Secret: Firebase settings for the shared leaderboard.
 *
 * Leave this as null and each computer keeps its own leaderboard.
 * To share one live leaderboard across every device:
 *   1. Create a project at https://console.firebase.google.com
 *   2. Build > Firestore Database > Create database (production mode)
 *   3. Firestore > Rules: paste the contents of firestore.rules, then Publish
 *   4. Project settings > Your apps > Web (</>) > register an app, and copy
 *      its firebaseConfig values in below.
 * These values are not secret: the rules in firestore.rules are what
 * protect the data, so it is fine for this file to be on GitHub.
 */
window.FIREBASE_CONFIG = null;

/* Example of what it looks like once filled in:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
};
*/

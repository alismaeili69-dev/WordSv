// Public Firebase web config for the WordSv project. These values are meant to be
// public; access to data is controlled by the Firestore security rules (firestore.rules).
export const firebaseConfig = {
  apiKey: 'AIzaSyBpfkjxBPG4FkN-rTzbF5MCdLiTF5PjNcY',
  authDomain: 'wordsv-9c404.firebaseapp.com',
  projectId: 'wordsv-9c404',
  storageBucket: 'wordsv-9c404.firebasestorage.app',
  messagingSenderId: '205255773261',
  appId: '1:205255773261:web:43bb3d8fd205b0622a6004',
};

// Firebase SDK from Google's CDN (no build step). Older version as a fallback.
export const SDK_VERSIONS = ['13.2.0', '11.10.0'];

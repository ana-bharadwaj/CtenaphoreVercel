// firebase.jsx
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBYqbrkNswiP5sS0BMFedZtxXfwwvcskso",
  authDomain: "ctenopool.firebaseapp.com",
  projectId: "ctenopool",
  storageBucket: "ctenopool.firebasestorage.app",
  messagingSenderId: "95063474177",
  appId: "1:95063474177:web:4e5e823884da0be6908000",
  measurementId: "G-88Y94W9D00",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };

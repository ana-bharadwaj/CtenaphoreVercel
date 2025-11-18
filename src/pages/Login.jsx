import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, provider } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import "./Login.css"; 

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/single";

  const signInGoogle = async () => {
    try {
      const prov = provider instanceof GoogleAuthProvider ? provider : new GoogleAuthProvider();
      await signInWithPopup(auth, prov);
      navigate(from, { replace: true });
    } catch (e) {
      console.error(e);
      alert("Sign-in failed. Please try again.");
    }
  };

  if (user) {
    navigate(from, { replace: true });
    return null;
  }

  return (
    <div className="login__wrap">
      <div className="login__card">
        <div className="login__logo" aria-hidden="true">
          {/* simple geometric logo */}
          <div className="logo__ring" />
          <div className="logo__dot" />
        </div>

        <h1 className="login__title">Welcome to <span className="brand">CtenoPool</span></h1>
        <p className="login__subtitle">
          Sign in to start labeling images. Your progress is saved to your account.
        </p>

        <button className="googleBtn" onClick={signInGoogle}>
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="login__divider">
        </div>

        <ul className="login__bullets">
          <li>Secure Google authentication</li>
          <li>Access Single & Pair labeling tasks</li>
          <li>Resume where you left off</li>
        </ul>

      </div>
    </div>
  );
}

function GoogleIcon() {
  // inline SVG keeps bundle small & no extra deps
  return (
    <svg
      className="googleIcon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#FFC107" d="M43.6 20.5H42v-.1H24v7.2h11.3C33.7 31.9 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 8 3l5.1-5.1C33.6 6 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.5 0 19.5-7.6 19.5-20 0-1.1-.1-2.2-.3-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l5.9 4.3C13.5 16 18.3 13 24 13c3 0 5.8 1.1 8 3l5.1-5.1C33.6 6 29 4 24 4 16.1 4 9.4 8.6 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.4-5.3l-6.2-4.9C29.2 35.2 26.8 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.3 4.8C9.5 39.3 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42v-.1H24v7.2h11.3c-1.1 3.3-3.7 5.7-7.1 6.8l6.2 4.9C37.6 36.8 40 31.9 40 24c0-1.1-.1-2.2-.4-3.5z"/>
    </svg>
  );
}

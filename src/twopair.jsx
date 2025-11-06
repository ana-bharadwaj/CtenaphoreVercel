import React, { useState, useEffect } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";

export default function TwoImagePairPage() {
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  const fetchPairs = () => {
    setLoading(true);
    fetch("http://127.0.0.1:5000/api/two-image-pair")
      .then((res) => res.json())
      .then((data) => {
        setImages(data.images || []);
        setOptions(data.options || []);
        setSelectedClass(null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchPairs();
  }, []);

  const signIn = () => {
    signInWithPopup(auth, provider).catch(console.error);
  };

  const signOutUser = () => {
    signOut(auth);
  };

  const handleSubmit = () => {
    if (!selectedClass) {
      alert("Please select a class.");
      return;
    }
    if (!user) {
      alert("Please sign in before submitting.");
      return;
    }
    if (images.length !== 2) {
      alert("Images not loaded properly. Please try again.");
      return;
    }

    const payload = {
      username: user.email,
      choice: selectedClass,
      imagePaths: images.map((img) => img.blobPath),
    };

    fetch("http://127.0.0.1:5000/api/submit-pair-label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(() => {
        alert("Answer submitted! Loading new images...");
        fetchPairs();
      })
      .catch((err) => {
        alert("Submission failed: " + err.message);
      });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f6fa",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", padding: 20 }}>
        {user ? (
          <div>
            <span style={{ marginRight: 10 }}>
              Signed in as {user.email}
            </span>
            <button onClick={signOutUser}>Sign Out</button>
          </div>
        ) : (
          <button onClick={signIn}>Sign in with Google</button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h2 style={{ textAlign: "center", fontWeight: 700 }}>
          Do these images belong to the same class?
        </h2>

        {loading ? (
          <div>Loading images...</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 30,
                margin: "30px 0 30px 0",
              }}
            >
              {images.map((img, index) => (
                <img
                  key={index}
                  src={img.displayUrl}
                  alt={`Image ${index + 1}`}
                  style={{
                    width: 320,
                    height: 180,
                    objectFit: "cover",
                    borderRadius: 24,
                    border: "2px solid #bbb",
                    background: "#fafbfc",
                    boxShadow: "0 2px 14px rgba(0,0,0,0.08)",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 20,
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt}
                  style={{
                    padding: "14px 34px",
                    backgroundColor: selectedClass === opt ? "#007bff" : "#eee",
                    color: selectedClass === opt ? "white" : "black",
                    fontSize: 18,
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  onClick={() => setSelectedClass(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!selectedClass}
              style={{
                marginTop: 40,
                padding: "12px 42px",
                fontSize: 20,
                cursor: selectedClass ? "pointer" : "not-allowed",
                borderRadius: 10,
                background: "#4E5EE4",
                color: "white",
                border: "none",
                fontWeight: 600,
                opacity: selectedClass ? 1 : 0.7,
              }}
            >
              Submit Answer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

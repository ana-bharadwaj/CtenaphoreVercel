import React, { useState, useEffect } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";

export default function TwoImagePairPage() {
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Set Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // Fetch two images from same class
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

  if (!user) {
    return (
      <div>
        <button onClick={signIn}>Sign in with Google</button>
      </div>
    );
  }

  if (loading) return <div>Loading images...</div>;

  return (
    <div>
      <p>
        Signed in as {user.email}{" "}
        <button onClick={signOutUser} style={{ marginLeft: 10 }}>
          Sign Out
        </button>
      </p>
      <h2>Which class do these images belong to?</h2>
      <div style={{ display: "flex", justifyContent: "center", gap: 15 }}>
        {images.map((img, index) => (
          <img
            key={index}
            src={img.displayUrl}
            alt={`Image ${index + 1}`}
            style={{
              maxWidth: "45%",
              height: "auto",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        {options.map((opt) => (
          <button
            key={opt}
            style={{
              margin: 5,
              padding: "10px 20px",
              backgroundColor: selectedClass === opt ? "#007bff" : "#eee",
              color: selectedClass === opt ? "white" : "black",
              border: "none",
              cursor: "pointer",
              borderRadius: 5,
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
          marginTop: 20,
          padding: "10px 30px",
          fontSize: 16,
          cursor: selectedClass ? "pointer" : "not-allowed",
        }}
      >
        Submit Answer
      </button>
    </div>
  );
}

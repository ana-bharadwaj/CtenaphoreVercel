import React, { useState, useEffect, useCallback } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import "./App.css";

export default function SingleImagePoolingPage() {
  const options = ["202502-1", "202502-2", "202502-3", "202502-4"];

  const [mainImage, setMainImage] = useState(null);
  const [choiceImages, setChoiceImages] = useState({});
  const [cards, setCards] = useState([{ id: 1, choice: "", submitted: false }]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchImages = useCallback(() => {
    setLoading(true);
    fetch("http://127.0.0.1:5000/api/image-set")
      .then((res) => res.json())
      .then((data) => {
        setMainImage(data.mainImage || null);
        setChoiceImages(data.choices || {});
        setLoading(false);
      })
      .catch((err) => {
        console.error("image-set fetch failed:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const signIn = () => {
    signInWithPopup(auth, provider).catch((error) => {
      console.error("Google sign-in error:", error);
    });
  };

  const signOutUser = () => {
    signOut(auth);
  };

  const updateCard = (idx, patch) => {
    setCards((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  };

  const submitCard = (idx, choice) => {
    if (!user) {
      alert("Please sign in before submitting.");
      return;
    }

    if (!mainImage || !mainImage.blobPath) {
      console.error("No main image blobPath to submit");
      return;
    }

    const currentCard = cards[idx];

    setCards((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, choice, submitted: true } : c
      )
    );

    setLoading(true);

    fetch("http://127.0.0.1:5000/api/submit-label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user.email,
        mainImageBlob: mainImage.blobPath,
        choice: choice,
      }),
    })
      .then((res) => res.json())
      .then(() => {
        setCards([
          {
            id: currentCard.id + 1,
            choice: "",
            submitted: false,
          },
        ]);

        fetchImages();
      })
      .catch((err) => {
        console.error("submit-label failed:", err);
        setLoading(false);
      });
  };

  return (
    <div className="app">
      {!user ? (
        <div className="loginScreen">
          <button onClick={signIn}>Sign in with Google</button>
        </div>
      ) : (
        <div>
          <header className="header">
            <h1 className="title">Image Categorizer</h1>
            <div>
              <span>Signed in as {user.email}</span>{" "}
              <button onClick={signOutUser}>Sign Out</button>
            </div>
          </header>

          {loading && <div className="loading">Loading images...</div>}

          <div className="container">
            {cards.map((card, idx) => (
              <section key={card.id} className="pairRow">
                <div className="leftPane">
                  <div
                    className={`placeholder leftPlaceholder ${
                      card.submitted ? "submitted" : ""
                    }`}
                  >
                    {mainImage &&
                    mainImage.displayUrl &&
                    !loading ? (
                      <img
                        src={mainImage.displayUrl}
                        alt="Main"
                        style={{
                          width: "100%",
                          height: "auto",
                          maxHeight: "400px",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    ) : (
                      <span>Loading image {card.id}...</span>
                    )}
                  </div>
                  <p className="caption">Classify this image</p>
                </div>

                <div className="rightPane">
                  <h3 className="legend">
                    Pick a class (click or double-click to submit)
                  </h3>

                  <div className="choicesCol">
                    {options.map((opt) => {
                      const selected = card.choice === opt;
                      const submitted = card.submitted && selected;
                      const infoForThisClass = choiceImages[opt];

                      return (
                        <div
                          key={opt}
                          className={`choiceCard ${
                            selected ? "selected" : ""
                          } ${submitted ? "isSubmitted" : ""}`}
                          onClick={() => updateCard(idx, { choice: opt })}
                          onDoubleClick={() => submitCard(idx, opt)}
                        >
                          <div className="placeholder smallPlaceholder">
                            {infoForThisClass &&
                            infoForThisClass.displayUrl &&
                            !loading ? (
                              <img
                                src={infoForThisClass.displayUrl}
                                alt={opt}
                                style={{
                                  width: "100%",
                                  height: "auto",
                                  maxHeight: "140px",
                                  objectFit: "contain",
                                  display: "block",
                                }}
                              />
                            ) : (
                              <span>{opt}</span>
                            )}
                          </div>

                          <p className="caption">{opt}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="actions">
                    <button
                      className="submitBtn"
                      disabled={!card.choice || loading}
                      onClick={() => submitCard(idx, card.choice)}
                    >
                      Submit
                    </button>

                    {card.submitted && (
                      <span className="status">
                        Submitted: <b>{card.choice}</b>
                      </span>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

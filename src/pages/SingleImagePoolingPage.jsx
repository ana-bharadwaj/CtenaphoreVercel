import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import "../App.css";

const API_BASE = import.meta?.env?.VITE_API_BASE || "http://127.0.0.1:5000";

export default function SingleImagePoolingPage() {
  const CLASS_OPTIONS = ["202502-1", "202502-2", "202502-3", "202502-4"];
  const { user } = useAuth();

  // main UI state
  const [mainImage, setMainImage] = useState(null);
  const [choiceImages, setChoiceImages] = useState({}); // locked thumbnails for the 4 classes
  const [choicesLocked, setChoicesLocked] = useState(false);
  const [cards, setCards] = useState([{ id: 1, choice: "", submitted: false }]);
  const [loading, setLoading] = useState(false);

  // progress state
  const [totalTarget, setTotalTarget] = useState(20); // 20 first, then optional +10
  const [completed, setCompleted] = useState(0);
  const [phase, setPhase] = useState("running"); // "running" | "offer-more" | "done"
  const progressPct = Math.min(100, Math.round((completed / totalTarget) * 100));

  // correctness tracking
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  // avoid React StrictMode double fetch in dev
  const fetchedOnceRef = useRef(false);

  const fetchImageSet = useCallback(
    async ({ lockChoicesIfUnset = true } = {}) => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/image-set`);
        const data = await res.json();

        // Always update main
        setMainImage(data.mainImage || null);

        // Only set choices ONCE (lock them) unless explicitly told to refresh
        if (!choicesLocked && lockChoicesIfUnset) {
          setChoiceImages(data.choices || {});
          setChoicesLocked(true);
        }
      } catch (err) {
        console.error("image-set fetch failed:", err);
      } finally {
        setLoading(false);
      }
    },
    [choicesLocked]
  );

  // initial load
  useEffect(() => {
    if (phase !== "running") return;
    if (fetchedOnceRef.current) return;
    fetchedOnceRef.current = true;
    fetchImageSet({ lockChoicesIfUnset: true });
  }, [phase, fetchImageSet]);

  // (Optional) tiny preloader for snappier paints
  useEffect(() => {
    if (mainImage?.displayUrl) {
      const img = new Image();
      img.src = mainImage.displayUrl;
    }
    Object.values(choiceImages).forEach((c) => {
      if (c?.displayUrl) {
        const im = new Image();
        im.src = c.displayUrl;
      }
    });
  }, [mainImage, choiceImages]);

  const updateCard = (idx, patch) => {
    setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const handleAfterSubmit = (nextCardId) => {
    const nextCompleted = completed + 1;
    setCompleted(nextCompleted);

    // reset to a new blank card
    setCards([{ id: nextCardId, choice: "", submitted: false }]);

    // hit target?
    if (nextCompleted >= totalTarget) {
      if (totalTarget === 20) setPhase("offer-more");
      else setPhase("done");
      return;
    }

    // fetch ONLY a new main image; keep choices as-is
    fetchImageSet({ lockChoicesIfUnset: false });
  };

  const submitCard = async (idx, choice) => {
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
      prev.map((c, i) => (i === idx ? { ...c, choice, submitted: true } : c))
    );

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/submit-single-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.displayName || user.email || "anonymous",
          mainImageBlob: mainImage.blobPath,
          choice,
        }),
      });
      const data = await res.json();

      // update correct/wrong counters
      if (data && typeof data.correct === "boolean") {
        if (data.correct) {
          setCorrectCount((prev) => prev + 1);
        } else {
          setWrongCount((prev) => prev + 1);
        }
      }

      handleAfterSubmit(currentCard.id + 1);
    } catch (err) {
      console.error("submit-label failed:", err);
      setLoading(false);
    }
  };

  // ---------- Phase UIs ----------

  if (phase === "offer-more") {
    return (
      <div className="app">
        <div className="centerContent" style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 className="title" style={{ textAlign: "center", marginBottom: 12 }}>
            Great job! 🎉
          </h1>
          <p style={{ textAlign: "center", marginBottom: 24 }}>
            You’ve completed <b>{completed}</b> of <b>{totalTarget}</b> images.
          </p>
          <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />
          <p style={{ textAlign: "center", marginTop: 8, color: "#374151" }}>
            Correct: <b>{correctCount}</b> &nbsp;|&nbsp; Wrong: <b>{wrongCount}</b>
          </p>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => {
                setTotalTarget(30);
                setPhase("running");
                // fetch a new MAIN only; keep the same 4 options
                fetchImageSet({ lockChoicesIfUnset: false });
              }}
              style={buttonPrimary}
            >
              Do 10 more (optional)
            </button>
            <button onClick={() => setPhase("done")} style={buttonSecondary}>
              Finish for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="app">
        <div
          className="centerContent"
          style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}
        >
          <h1 className="title" style={{ marginBottom: 8 }}>
            Thank you! 🙏
          </h1>
          <p style={{ marginBottom: 16 }}>
            You completed <b>{completed}</b> of <b>{totalTarget}</b> images this session.
          </p>
          <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />
          <p style={{ marginTop: 10, color: "#374151" }}>
            Correct: <b>{correctCount}</b> &nbsp;|&nbsp; Wrong: <b>{wrongCount}</b>
          </p>
          <p style={{ marginTop: 18, color: "#556" }}>
            You can come back anytime to do more.
          </p>
        </div>
      </div>
    );
  }

  // running phase
  return (
    <div className="app">
      <div className="centerContent" style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* Header + progress */}
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <h1
            className="title"
            style={{ marginBottom: 8, fontWeight: 600, textAlign: "center" }}
          >
            Image Categorizer
          </h1>
        </div>
        <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />

        {/* Optional: manual refresh of options */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <small style={{ color: "#6b7280" }}>
            Options are locked for consistency.&nbsp;
            <button
              onClick={() => {
                setChoicesLocked(false);
                fetchImageSet({ lockChoicesIfUnset: true }); // will re-lock with fresh choices
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "#4E5EE4",
                cursor: "pointer",
              }}
            >
              Refresh options
            </button>
          </small>
        </div>

        <div className="container">
          {cards.map((card, idx) => (
            <section key={card.id} className="pairRow">
              <div className="leftPane">
                <div
                  className={`placeholder leftPlaceholder ${
                    card.submitted ? "submitted" : ""
                  }`}
                >
                  {mainImage?.displayUrl && !loading ? (
                    <img
                      src={mainImage.displayUrl}
                      alt="Main"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      width={640}
                      height={360}
                    />
                  ) : (
                    <span>Loading image {card.id}...</span>
                  )}
                </div>
              </div>

              <div className="rightPane">
                <h3 className="legend">Which class does the above image belong to?</h3>
                <div className="choicesCol">
                  {CLASS_OPTIONS.map((label) => {
                    const selected = card.choice === label;
                    const submitted = card.submitted && selected;
                    const infoForThisClass = choiceImages[label];

                    return (
                      <div
                        key={label}
                        className={`choiceCard ${selected ? "selected" : ""} ${
                          submitted ? "isSubmitted" : ""
                        }`}
                        onClick={() => updateCard(idx, { choice: label })}
                        onDoubleClick={() => submitCard(idx, label)}
                      >
                        <div className="placeholder smallPlaceholder">
                          {infoForThisClass?.displayUrl ? (
                            <img
                              src={infoForThisClass.displayUrl}
                              alt={label}
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              width={160}
                              height={100}
                            />
                          ) : (
                            <span>{label}</span>
                          )}
                        </div>
                        <p className="caption">{label}</p>
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
    </div>
  );
}

/* ---------- helpers ---------- */

function ProgressBar({ percent, completed, total }) {
  return (
    <div style={{ margin: "0 auto 8px", maxWidth: 520 }}>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "#e6e9f2",
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "linear-gradient(90deg, #4E5EE4, #7a88f3)",
            transition: "width 240ms ease",
          }}
        />
      </div>
      <div
        style={{
          textAlign: "center",
          fontSize: 13,
          color: "#58607a",
          marginTop: 6,
        }}
      >
        Completed <b>{completed}</b> of <b>{total}</b> ({percent}%)
      </div>
    </div>
  );
}

const buttonPrimary = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  fontWeight: 700,
  color: "#fff",
  background: "#4E5EE4",
  cursor: "pointer",
};

const buttonSecondary = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #cdd3e2",
  fontWeight: 700,
  color: "#1c2233",
  background: "#fff",
  cursor: "pointer",
};

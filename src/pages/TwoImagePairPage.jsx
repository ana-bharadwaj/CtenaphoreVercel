import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";

const API_BASE = import.meta?.env?.VITE_API_BASE || "http://127.0.0.1:5000";

export default function TwoImagePairPage() {
  const { user } = useAuth();
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loading, setLoading] = useState(true);

  // progress state
  const [totalTarget, setTotalTarget] = useState(20); // start with 20
  const [completed, setCompleted] = useState(0); // how many submissions this session
  const [phase, setPhase] = useState("running"); // "running" | "offer-more" | "done"
  const progressPct = Math.min(100, Math.round((completed / totalTarget) * 100));

  // correctness tracking
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  // guard double-fetch in React StrictMode (dev)
  const fetchedRef = useRef(false);

  const fetchPairs = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/two-image-pair`)
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
    if (phase !== "running") return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchPairs();
  }, [phase]);

  // small preloader so next paint feels instant
  useEffect(() => {
    images.forEach((img) => {
      if (!img?.displayUrl) return;
      const el = new Image();
      el.src = img.displayUrl;
    });
  }, [images]);

  const handleAfterSubmit = () => {
    const next = completed + 1;
    setCompleted(next);

    // reached current goal?
    if (next >= totalTarget) {
      if (totalTarget === 20) {
        setPhase("offer-more");
      } else {
        setPhase("done");
      }
      return;
    }

    // continue
    setSelectedClass(null);
    fetchPairs();
  };

  const handleSubmit = () => {
    if (!selectedClass) {
      alert("Please select an option.");
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
      username: user.displayName || user.email || "anonymous",
      choice: selectedClass,
      imagePaths: images.map((img) => img.blobPath),
    };

    setLoading(true);
    fetch(`${API_BASE}/api/submit-pair-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        setLoading(false);

        // update correct/wrong counters
        if (data && typeof data.correct === "boolean") {
          if (data.correct) {
            setCorrectCount((prev) => prev + 1);
          } else {
            setWrongCount((prev) => prev + 1);
          }
        }

        handleAfterSubmit();
      })
      .catch((err) => {
        setLoading(false);
        alert("Submission failed: " + err.message);
      });
  };

  // ===== Phase UIs =====
  if (phase === "offer-more") {
    return (
      <ScreenWrap>
        <h1 style={{ textAlign: "center", marginBottom: 8 }}>Great job! 🎉</h1>
        <p style={{ textAlign: "center", marginBottom: 16 }}>
          You’ve completed <b>{completed}</b> of <b>{totalTarget}</b> pairs.
        </p>
        <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />
        <p style={{ textAlign: "center", marginTop: 8, color: "#374151" }}>
          Correct: <b>{correctCount}</b> &nbsp;|&nbsp; Wrong: <b>{wrongCount}</b>
        </p>
        <div
          style={{
            marginTop: 24,
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
              fetchedRef.current = false; // allow fetch
              fetchPairs();
            }}
            style={btnPrimary}
          >
            Do 10 more (optional)
          </button>
          <button onClick={() => setPhase("done")} style={btnSecondary}>
            Finish for now
          </button>
        </div>
      </ScreenWrap>
    );
  }

  if (phase === "done") {
    return (
      <ScreenWrap>
        <h1 style={{ textAlign: "center", marginBottom: 8 }}>Thank you! 🙏</h1>
        <p style={{ textAlign: "center", marginBottom: 16 }}>
          You completed <b>{completed}</b> of <b>{totalTarget}</b> pairs this session.
        </p>
        <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />
        <p style={{ textAlign: "center", marginTop: 10, color: "#374151" }}>
          Correct: <b>{correctCount}</b> &nbsp;|&nbsp; Wrong: <b>{wrongCount}</b>
        </p>
        <p style={{ textAlign: "center", marginTop: 18, color: "#556" }}>
          You can come back anytime to do more.
        </p>
      </ScreenWrap>
    );
  }

  // ===== running phase =====
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f6fa",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", padding: 24, width: "100%" }}>
        <h2 style={{ textAlign: "center", fontWeight: 700, marginBottom: 8 }}>
          Do these images belong to the same class?
        </h2>
        <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />

        {loading ? (
          <div style={{ textAlign: "center", marginTop: 30 }}>Loading images...</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 30,
                margin: "24px 0 28px 0",
              }}
            >
              {images.map((img, index) => (
                <img
                  key={index}
                  src={img.displayUrl}
                  alt={`Image ${index + 1}`}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : "low"}
                  width={320}
                  height={180}
                  style={{
                    width: 320,
                    height: 180,
                    objectFit: "cover",
                    borderRadius: 24,
                    border: "2px solid #bbb",
                    background: "#fafbfc",
                    boxShadow: "0 2px 14px rgba(0, 0, 0, 0.08)",
                  }}
                />
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
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

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleSubmit}
                disabled={!selectedClass || loading}
                style={{
                  marginTop: 32,
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===== Small helpers/components/styles ===== */

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

function ScreenWrap({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f6fa",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 720 }}>{children}</div>
    </div>
  );
}

const btnPrimary = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  fontWeight: 700,
  color: "#fff",
  background: "#4E5EE4",
  cursor: "pointer",
};

const btnSecondary = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #cdd3e2",
  fontWeight: 700,
  color: "#1c2233",
  background: "#fff",
  cursor: "pointer",
};

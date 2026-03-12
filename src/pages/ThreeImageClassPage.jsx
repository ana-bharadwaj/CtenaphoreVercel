import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:5000";

export default function ThreeImageClassPage() {
  const { user } = useAuth();
  const [images, setImages] = useState([]);
  const [options, setOptions] = useState([]);
  const [choiceImages, setChoiceImages] = useState({});
  const [choicesLocked, setChoicesLocked] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loading, setLoading] = useState(true);

  // progress
  const [totalTarget, setTotalTarget] = useState(20);
  const [completed, setCompleted] = useState(0);
  const [phase, setPhase] = useState("running");
  const progressPct = Math.min(100, Math.round((completed / totalTarget) * 100));

  // correctness
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  const fetchedRef = useRef(false);

  const fetchTriplet = ({ lockChoicesIfUnset = true } = {}) => {
    setLoading(true);
    fetch(`${API_BASE}/api/three-image-set`)
      .then((res) => res.json())
      .then((data) => {
        setImages(data.images || []);
        setOptions(data.options || []);
        setSelectedClass(null);

        if (!choicesLocked && lockChoicesIfUnset && data.choices) {
          setChoiceImages(data.choices);
          setChoicesLocked(true);
        }

        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (phase !== "running") return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchTriplet({ lockChoicesIfUnset: true });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

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

    if (next >= totalTarget) {
      if (totalTarget === 20) setPhase("offer-more");
      else setPhase("done");
      return;
    }

    setSelectedClass(null);
    fetchTriplet({ lockChoicesIfUnset: false });
  };

  const handleSubmit = () => {
    if (!selectedClass) { alert("Please select a class."); return; }
    if (!user) { alert("Please sign in before submitting."); return; }
    if (images.length !== 3) { alert("Images not loaded properly. Please refresh and try again."); return; }

    const payload = {
      username: user.displayName || user.email || "anonymous",
      choice: selectedClass,
      imagePaths: images.map((img) => img.blobPath),
    };

    setLoading(true);
    fetch(`${API_BASE}/api/submit-three-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        setLoading(false);
        if (data && typeof data.correct === "boolean") {
          if (data.correct) setCorrectCount((p) => p + 1);
          else setWrongCount((p) => p + 1);
        }
        handleAfterSubmit();
      })
      .catch((err) => {
        setLoading(false);
        alert("Submission failed: " + err.message);
      });
  };

  if (phase === "offer-more") {
    return (
      <ScreenWrap>
        <h1 style={{ textAlign: "center", marginBottom: 8 }}>Great job! 🎉</h1>
        <p style={{ textAlign: "center", marginBottom: 16 }}>
          You've completed <b>{completed}</b> of <b>{totalTarget}</b> triplets.
        </p>
        <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />
        <p style={{ textAlign: "center", marginTop: 8, color: "#374151" }}>
          Correct: <b>{correctCount}</b> &nbsp;|&nbsp; Wrong: <b>{wrongCount}</b>
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setTotalTarget(30);
              setPhase("running");
              fetchedRef.current = false;
              fetchTriplet({ lockChoicesIfUnset: false });
            }}
            style={btnPrimary}
          >
            Do 10 more (optional)
          </button>
          <button onClick={() => setPhase("done")} style={btnSecondary}>Finish for now</button>
        </div>
      </ScreenWrap>
    );
  }

  if (phase === "done") {
    return (
      <ScreenWrap>
        <h1 style={{ textAlign: "center", marginBottom: 8 }}>Thank you! 🙏</h1>
        <p style={{ textAlign: "center", marginBottom: 16 }}>
          You completed <b>{completed}</b> of <b>{totalTarget}</b> triplets this session.
        </p>
        <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />
        <p style={{ textAlign: "center", marginTop: 10, color: "#374151" }}>
          Correct: <b>{correctCount}</b> &nbsp;|&nbsp; Wrong: <b>{wrongCount}</b>
        </p>
        <p style={{ textAlign: "center", marginTop: 18, color: "#556" }}>You can come back anytime to do more.</p>
      </ScreenWrap>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f6fa", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24, width: "100%" }}>
        <h2 style={{ textAlign: "center", fontWeight: 700, marginBottom: 8 }}>
          All three images are from the same individual. <br />
          Which individual is it?
        </h2>
        <ProgressBar percent={progressPct} completed={completed} total={totalTarget} />

        {loading ? (
          <div style={{ textAlign: "center", marginTop: 30 }}>Loading images...</div>
        ) : (
          <>
            {/* 3 main images */}
            <div style={{ display: "flex", justifyContent: "center", gap: 24, margin: "24px 0 28px 0", flexWrap: "wrap" }}>
              {images.map((img, index) => (
                <img
                  key={index}
                  src={img.displayUrl}
                  alt={`Sample ${index + 1}`}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : "low"}
                  width={260}
                  height={180}
                  style={{
                    width: 340, height: 220, objectFit: "cover",
                    borderRadius: 20, border: "2px solid #bbb",
                    background: "#fafbfc", boxShadow: "0 2px 14px rgba(0,0,0,0.08)",
                  }}
                />
              ))}
            </div>

            {/* class option cards with thumbnails */}
            <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
              {options.map((opt) => {
                const ref = choiceImages[opt];
                const selected = selectedClass === opt;
                return (
                  <div
                    key={opt}
                    onClick={() => setSelectedClass(opt)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 12,
                      border: selected ? "2px solid #007bff" : "2px solid #ddd",
                      background: selected ? "#e8f0fe" : "#fff",
                      padding: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      width: 180,
                      boxShadow: selected ? "0 0 0 3px #007bff44" : "0 1px 4px rgba(0,0,0,0.08)",
                      transition: "all 150ms ease",
                    }}
                  >
                    <div style={{
                      width: 160, height: 100, borderRadius: 8,
                      background: "#f0f0f0", overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {ref?.displayUrl ? (
                        <img
                          src={ref.displayUrl}
                          alt={opt}
                          loading="lazy"
                          decoding="async"
                          width={160}
                          height={100}
                          style={{ objectFit: "cover", width: "100%", height: "100%" }}
                        />
                      ) : (
                        <span style={{ color: "#aaa", fontSize: 12 }}>{opt}</span>
                      )}
                    </div>
                    <span style={{
                      fontWeight: 600, fontSize: 15,
                      color: selected ? "#007bff" : "#1c2233",
                    }}>
                      {opt}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleSubmit}
                disabled={!selectedClass || loading}
                style={{
                  marginTop: 32, padding: "12px 42px", fontSize: 20,
                  cursor: selectedClass ? "pointer" : "not-allowed",
                  borderRadius: 10, background: "#4E5EE4", color: "white",
                  border: "none", fontWeight: 600, opacity: selectedClass ? 1 : 0.7,
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

function ProgressBar({ percent, completed, total }) {
  return (
    <div style={{ margin: "0 auto 8px", maxWidth: 520 }}>
      <div style={{ height: 10, borderRadius: 999, background: "#e6e9f2", overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "linear-gradient(90deg, #4E5EE4, #7a88f3)", transition: "width 240ms ease" }} />
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: "#58607a", marginTop: 6 }}>
        Completed <b>{completed}</b> of <b>{total}</b> ({percent}%)
      </div>
    </div>
  );
}

function ScreenWrap({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f7f6fa", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 720 }}>{children}</div>
    </div>
  );
}

const btnPrimary = { padding: "12px 18px", borderRadius: 10, border: "none", fontWeight: 700, color: "#fff", background: "#4E5EE4", cursor: "pointer" };
const btnSecondary = { padding: "12px 18px", borderRadius: 10, border: "1px solid #cdd3e2", fontWeight: 700, color: "#1c2233", background: "#fff", cursor: "pointer" };
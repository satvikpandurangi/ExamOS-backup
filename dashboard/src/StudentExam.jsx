import React, { useState, useEffect, useRef } from "react";
import PdfViewer from "./PdfViewer.jsx";
export default function StudentExam() {
  const [token, setToken] = useState(
      new URLSearchParams(location.hash.slice(1)).has("launch")
        ? ""
        : sessionStorage.getItem("examos-student-token") || "",
    ),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [answers, setAnswers] = useState(""),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(""),
    [pdfEpoch, setPdfEpoch] = useState(0);
  const [focusConsent, setFocusConsent] = useState(false);
  const offset = useRef(0),
    initialized = useRef(false),
    latestAnswers = useRef("");
  latestAnswers.current = answers;
  const api = async (path, body, credential = token) => {
    const r = await fetch("/api/student" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + credential,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const x = await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        sessionStorage.removeItem("examos-student-token");
        setToken("");
        setData(null);
      }
      throw Error(x.error || "Examination request failed");
    }
    return x;
  };
  async function refresh() {
    const x = await api("/exam");
    offset.current = new Date(x.serverNow).getTime() - Date.now();
    setData(x);
    if (!initialized.current) {
      setAnswers(x.attempt?.answers || "");
      initialized.current = true;
    }
    return x;
  }
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
      try {
        await refresh();
      } catch {}
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const code = new URLSearchParams(location.hash.slice(1)).get("launch");
    if (!code) return;
    history.replaceState({}, "", location.pathname);
    sessionStorage.removeItem("examos-student-token");
    setToken("");
    api("/exchange", { code }, "")
      .then((x) => {
        sessionStorage.setItem("examos-student-token", x.token);
        initialized.current = false;
        setToken(x.token);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (alive) refresh().catch((e) => setError(e.message));
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token]);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now() + offset.current), 500);
    return () => clearInterval(clock);
  }, []);
  const a = data?.exam,
    x = data?.attempt;
  const isOpen =
    a &&
    a.session_status === "active" &&
    now >= new Date(a.opens_at) &&
    now < new Date(a.closes_at);
  const remaining = x?.deadline_at
    ? Math.max(0, Math.ceil((new Date(x.deadline_at) - now) / 1000))
    : null;
  const completed = x?.status === "submitted" || x?.status === "cancelled";
  useEffect(() => {
    if (x?.status !== "started" || !isOpen || remaining === 0) return;
    const preventClose = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", preventClose);
    const send = (category) => {
      if (x.focus_consent) api("/proctor-event", { category }).catch(() => {});
    };
    const blur = () => send("window_blur");
    const fullscreen = () => {
      if (!document.fullscreenElement) send("fullscreen_exit");
    };
    const navigation = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ["l", "n", "t", "w", "r"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        send("navigation_attempt");
      }
    };
    window.addEventListener("blur", blur);
    document.addEventListener("fullscreenchange", fullscreen);
    window.addEventListener("keydown", navigation);
    return () => {
      window.removeEventListener("beforeunload", preventClose);
      window.removeEventListener("blur", blur);
      document.removeEventListener("fullscreenchange", fullscreen);
      window.removeEventListener("keydown", navigation);
    };
  }, [token, x?.status, x?.focus_consent, isOpen, remaining === 0]);
  useEffect(() => {
    if (x?.status !== "started" || !isOpen || remaining === 0) return;
    const timer = setTimeout(() => {
      api("/exam/save", { answers: latestAnswers.current })
        .then(() => setSaved("Response saved"))
        .catch((e) => setSaved("Save failed: " + e.message));
    }, 1000);
    return () => clearTimeout(timer);
  }, [answers, x?.status, isOpen, token]);
  return (
    <main className="student-exam">
      <header>
        <div>
          <div className="brand">◉ ExamOS</div>
          <span className="eyebrow">STUDENT EXAMINATION</span>
          <h1>{a?.title || "Your examination"}</h1>
        </div>
        <span className="badge">
          {data?.device.name || "Enrolled device access"}
        </span>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!token && (
        <p>
          Open this page using <strong>Open examination page</strong> in your
          connected ExamOS desktop agent. Links are one use and expire after one
          minute.
        </p>
      )}
      {a && (
        <>
          <section className="stats">
            <article>
              <span>SUBJECT</span>
              <strong className="status">{a.subject}</strong>
            </article>
            <article>
              <span>TOTAL MARKS</span>
              <strong>{a.total_marks}</strong>
            </article>
            <article>
              <span>DURATION</span>
              <strong className="status">
                {a.duration_seconds / 60} minutes
              </strong>
            </article>
          </section>
          <section className="panel">
            <h2>{a.session_name}</h2>
            <p>
              Opens {new Date(a.opens_at).toLocaleString()} · Closes{" "}
              {new Date(a.closes_at).toLocaleString()}
            </p>
            <p>
              Screen monitoring remains controlled by your desktop agent’s
              separate consent and visible indicator.
            </p>
            <p>
              LIMITED examination environment: ordinary browser navigation is
              discouraged; Windows application switching and security shortcuts
              remain available. Camera access requires separate consent in the
              visible desktop agent.
            </p>
            <p>
              With your separate evidence consent, detector events and teacher-requested
              camera checks can include a webcam snapshot and a short silent clip
              for teacher review. Clips use a temporary memory buffer; no audio
              or continuous recording is stored. You may stop monitoring at any
              time from the visible agent.
            </p>
            {x?.status !== "started" && !completed && (
              <label>
                <input
                  type="checkbox"
                  checked={focusConsent}
                  onChange={(e) => setFocusConsent(e.target.checked)}
                />{" "}
                I consent to recording examination window focus loss,
                full-screen exit and navigation attempts. No typed text or keys
                are recorded.
              </label>
            )}
            {x?.status === "started" && (
              <p aria-live="polite">
                Examination window event monitoring:{" "}
                {x.focus_consent ? "ACTIVE — consented" : "OFF"}.{" "}
                <button
                  className="secondary"
                  onClick={() => run(() => api("/stop-monitoring", {}))}
                >
                  Stop all monitoring
                </button>
              </p>
            )}
            {completed ? (
              <div className="notice" role="status">
                <strong>
                  {x.status === "submitted"
                    ? "Examination submitted"
                    : "Examination closed before you started"}
                </strong>
                <p>
                  {x.submitted_at && new Date(x.submitted_at).toLocaleString()}{" "}
                  · {x.submission_reason}
                </p>
                <p>Your submission status is recorded. Receipt: {x.id}</p>
              </div>
            ) : !isOpen ? (
              <p className="notice">
                {a.session_status === "ended" || now >= new Date(a.closes_at)
                  ? "The examination has ended."
                  : "The examination has not opened yet."}
              </p>
            ) : (
              <>
                <div className="section-head">
                  <button
                    disabled={busy || x?.status === "started"}
                    onClick={() =>
                      run(() => api("/exam/start", { focusConsent }))
                    }
                  >
                    {x?.status === "started"
                      ? "Examination in progress"
                      : "Start examination"}
                  </button>
                  {x?.status === "started" && (
                    <strong role="timer" aria-label="Time remaining">
                      {Math.floor(remaining / 60)}:
                      {String(remaining % 60).padStart(2, "0")} remaining
                    </strong>
                  )}
                </div>
                <PdfViewer
                  key={pdfEpoch}
                  url="/api/student/exam/pdf"
                  token={token}
                />
                <button
                  className="secondary"
                  onClick={() => setPdfEpoch((p) => p + 1)}
                >
                  Reload question paper
                </button>
                {x?.status === "started" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => api("/exam/submit", { answers }));
                    }}
                  >
                    <label className="response-label">
                      Your text response (optional)
                      <textarea
                        value={answers}
                        maxLength={12000}
                        onChange={(e) => {
                          setAnswers(e.target.value);
                          setSaved("Saving…");
                        }}
                        rows={8}
                      />
                    </label>
                    <p role="status">{saved}</p>
                    <button disabled={busy || remaining === 0}>
                      Submit examination
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

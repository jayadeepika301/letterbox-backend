import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  PenLine, Type, Stamp, Send, Mailbox, Trash2, Clock,
  Sparkles, Feather, X, ChevronRight, Check, LogOut, Inbox, Loader2, RefreshCw, Lock
} from "lucide-react";

/* ---------------------------------------------------------
   TOKENS
   paper:    #F1E8D6  aged parchment
   paper-2:  #E7D9BA  deeper parchment (envelope)
   ink:      #2B2A44  deep indigo ink
   crimson:  #8C2A34  wax seal red
   brass:    #A9863E  brass / postmark gold
   air-blue: #1F3A5F  airmail stripe blue
   air-red:  #A32638  airmail stripe red
   muted:    #6E6656  faded ink / captions
--------------------------------------------------------- */

const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Special+Elite&family=Work+Sans:wght@400;500;600&family=Caveat:wght@500;700&family=Homemade+Apple&family=Dancing+Script:wght@500;700&family=Permanent+Marker&family=Patrick+Hand&family=Architects+Daughter&family=Indie+Flower&family=Reenie+Beanie&family=Nanum+Pen+Script&display=swap";

// LINE_HEIGHT is the fixed ruled-paper grid, in px. Every font renders
// inside that same grid (only its size/baseline offset changes) so the
// text cursor always sits on a rule, no matter which hand is selected.
const LINE_HEIGHT = 40;

const HAND_FONTS = [
  { id: "caveat", label: "Caveat — quick & looping", family: "'Caveat', cursive", size: 27, baseline: 8 },
  { id: "apple", label: "Homemade Apple — heavy ink", family: "'Homemade Apple', cursive", size: 19, baseline: 10 },
  { id: "dancing", label: "Dancing Script — formal cursive", family: "'Dancing Script', cursive", size: 26, baseline: 9 },
  { id: "marker", label: "Permanent Marker — bold & blocky", family: "'Permanent Marker', cursive", size: 17, baseline: 11 },
  { id: "patrick", label: "Patrick Hand — neat print", family: "'Patrick Hand', cursive", size: 22, baseline: 9 },
  { id: "architect", label: "Architects Daughter — technical hand", family: "'Architects Daughter', cursive", size: 17, baseline: 11 },
  { id: "indie", label: "Indie Flower — round & casual", family: "'Indie Flower', cursive", size: 21, baseline: 9 },
  { id: "reenie", label: "Reenie Beanie — fast & skinny", family: "'Reenie Beanie', cursive", size: 31, baseline: 6 },
  { id: "nanum", label: "Nanum Pen — fine pen script", family: "'Nanum Pen Script', cursive", size: 24, baseline: 9 },
];

const SEAL_SYMBOLS = ["✦", "❦", "☙", "✧", "◆", "⚜"];
const SEAL_COLORS = ["#8C2A34", "#3C4A6B", "#4A5D3A", "#5B3A5C", "#A9863E"];

const STAMPS = [
  { id: "bird", label: "Songbird" },
  { id: "hill", label: "Hillside" },
  { id: "moon", label: "Crescent Moon" },
  { id: "wheat", label: "Wheat Sheaf" },
];

const ACCESSORIES = [
  { id: "tape", label: "Washi tape", glyph: "▤" },
  { id: "flower", label: "Pressed flower", glyph: "✿" },
  { id: "driedflower", label: "Dried flower", glyph: "🥀" },
  { id: "heart", label: "Ink heart", glyph: "♥" },
  { id: "leaf", label: "Sprig", glyph: "❧" },
  { id: "driedleaf", label: "Dried leaf", glyph: "🍂" },
  { id: "bow", label: "Ribbon bow", glyph: "🎀" },
  { id: "kiss", label: "Kiss stain", glyph: "💋" },
  { id: "star", label: "Star", glyph: "★" },
];

// Paper styles for the page itself — applied to the compose area, the
// preview, and the opened letter in Mailbox.
const PAPER_STYLES = [
  {
    id: "cream", label: "Cream",
    css: { background: "#FBF6EA" },
  },
  {
    id: "kraft", label: "Kraft",
    css: {
      background:
        "repeating-linear-gradient(115deg, #C9A46A 0 3px, #C1996075 3px 4px), linear-gradient(#CFAE78, #C39C64)",
      color: "#3A2C18",
    },
  },
  {
    id: "parchment", label: "Aged parchment",
    css: {
      background:
        "radial-gradient(ellipse at 20% 15%, rgba(139,110,60,0.22) 0%, transparent 40%), " +
        "radial-gradient(ellipse at 85% 80%, rgba(139,110,60,0.2) 0%, transparent 45%), " +
        "radial-gradient(ellipse at 70% 20%, rgba(139,110,60,0.12) 0%, transparent 35%), #E8DDBB",
    },
  },
  {
    id: "burnt", label: "Burnt edges",
    css: {
      background:
        "radial-gradient(ellipse at center, #F1E8D6 55%, #8a6a3d 82%, #2b1c0e 100%)",
    },
  },
  {
    id: "blush", label: "Blush",
    css: { background: "linear-gradient(#F8ECEA, #F3DEDC)" },
  },
];
const getPaper = (id) => PAPER_STYLES.find((p) => p.id === id) || PAPER_STYLES[0];


/* ---------------------------------------------------------
   Backend API layer
   - The actual accounts, unique usernames, and letters now live on
     a real backend you deploy yourself (see the README that ships
     alongside this file). This app only remembers, locally, which
     backend URL to talk to and your current login session — via
     Claude's per-artifact storage (NOT browser localStorage, which
     doesn't work reliably in artifacts).
--------------------------------------------------------- */
async function loadSession() {
  try {
    const res = await window.storage.get("session", false);
    return res ? JSON.parse(res.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveSession(session) {
  try {
    await window.storage.set("session", JSON.stringify(session), false);
    return true;
  } catch (e) {
    return false;
  }
}
async function clearSession() {
  try {
    await window.storage.delete("session", false);
    return true;
  } catch (e) {
    return false;
  }
}

async function apiRequest(apiBaseUrl, path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Couldn't reach the backend — check the URL and that it's running.");
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

const signupApi = (apiBaseUrl, username, password) =>
  apiRequest(apiBaseUrl, "/api/auth/signup", { method: "POST", body: { username, password } });
const loginApi = (apiBaseUrl, username, password) =>
  apiRequest(apiBaseUrl, "/api/auth/login", { method: "POST", body: { username, password } });
const meApi = (apiBaseUrl, token) => apiRequest(apiBaseUrl, "/api/me", { token });
const sendLetterApi = (apiBaseUrl, token, letter) =>
  apiRequest(apiBaseUrl, "/api/letters", { method: "POST", token, body: letter });
const fetchInboxApi = (apiBaseUrl, token) => apiRequest(apiBaseUrl, "/api/letters/inbox", { token });
const fetchSentApi = (apiBaseUrl, token) => apiRequest(apiBaseUrl, "/api/letters/sent", { token });

const norm = (s) => (s || "").trim().toLowerCase();

function StampArt({ id }) {
  const common = { width: "100%", height: "100%" };
  if (id === "bird")
    return (
      <svg viewBox="0 0 60 60" {...common}>
        <rect x="2" y="2" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
        <path d="M18 38 Q22 24 34 22 Q30 26 32 30 Q40 28 44 20 Q42 30 34 34 Q30 40 20 40Z" fill="currentColor" opacity="0.85" />
        <circle cx="36" cy="26" r="1.4" fill="var(--paper,#F1E8D6)" />
        <line x1="10" y1="46" x2="50" y2="46" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      </svg>
    );
  if (id === "hill")
    return (
      <svg viewBox="0 0 60 60" {...common}>
        <rect x="2" y="2" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
        <circle cx="44" cy="16" r="6" fill="currentColor" opacity="0.7" />
        <path d="M4 44 Q18 26 30 40 Q40 28 56 42 L56 54 L4 54Z" fill="currentColor" opacity="0.9" />
      </svg>
    );
  if (id === "moon")
    return (
      <svg viewBox="0 0 60 60" {...common}>
        <rect x="2" y="2" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
        <path d="M38 14 A16 16 0 1 0 38 46 A12 12 0 1 1 38 14Z" fill="currentColor" opacity="0.85" />
        <circle cx="18" cy="20" r="1.2" fill="currentColor" />
        <circle cx="14" cy="30" r="0.8" fill="currentColor" />
        <circle cx="22" cy="14" r="0.8" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 60 60" {...common}>
      <rect x="2" y="2" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d="M30 12 Q34 24 30 30 Q26 24 30 12Z" fill="currentColor" opacity="0.85" />
      <path d="M30 30 Q36 36 34 48 M30 30 Q24 36 26 48" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.85" />
    </svg>
  );
}

function pad(n) { return String(n).padStart(2, "0"); }

function formatWhen(date) {
  if (!date) return "";
  return date.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/* ---------------------------------------------------------
   Handwriting canvas
--------------------------------------------------------- */
const HAND_CANVAS_HEIGHT = 240; // CSS px, fixed logical height of the writing area

const HandwritingCanvas = forwardRef(function HandwritingCanvas({ inkColor, onChangeEmpty, onStroke, paperBackground }, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const hasInk = useRef(false);
  const clearRef = useRef(null);

  const [guideSrc, setGuideSrc] = useState(null);
  const [guideOpacity, setGuideOpacity] = useState(0.32);

  // Size the canvas backing store to exactly match its on-screen CSS
  // pixels (times devicePixelRatio). This is what keeps the pen tip
  // under the actual pointer/finger instead of drifting off the ruled
  // lines as the panel resizes or renders on a high-DPI screen.
  const sizeCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = wrap.clientWidth;
    const prev = document.createElement("canvas");
    prev.width = c.width; prev.height = c.height;
    prev.getContext("2d").drawImage(c, 0, 0);

    c.width = Math.round(cssWidth * dpr);
    c.height = Math.round(HAND_CANVAS_HEIGHT * dpr);
    c.style.width = cssWidth + "px";
    c.style.height = HAND_CANVAS_HEIGHT + "px";

    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.4;
    // restore whatever was already drawn, scaled to the new size
    if (prev.width && prev.height) {
      ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, cssWidth, HAND_CANVAS_HEIGHT);
    }
  }, [inkColor]);

  useEffect(() => {
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.strokeStyle = inkColor;
  }, [inkColor]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    // rect is in CSS px and the context is pre-scaled by dpr, so the
    // conversion is a direct 1:1 subtraction — no separate x/y scale
    // factors that could drift out of sync with each other.
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk.current) { hasInk.current = true; onChangeEmpty?.(false); }
  };
  const end = () => {
    if (drawing.current && hasInk.current) {
      try { onStroke?.(canvasRef.current.toDataURL("image/png")); } catch (e) { /* ignore */ }
    }
    drawing.current = false;
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      try { return canvasRef.current.toDataURL("image/png"); } catch (e) { return null; }
    },
    isEmpty: () => !hasInk.current,
    clear: () => clearRef.current?.(),
  }));

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    hasInk.current = false;
    onChangeEmpty?.(true);
    onStroke?.(null);
  };
  clearRef.current = clear;

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setGuideSrc(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          position: "relative", border: "1px solid rgba(43,42,68,0.25)",
          borderRadius: 4,
          background: `repeating-linear-gradient(transparent 0 ${LINE_HEIGHT - 1}px, rgba(43,42,68,0.16) ${LINE_HEIGHT - 1}px ${LINE_HEIGHT}px), ${paperBackground || "#F8F1E1"}`,
          overflow: "hidden", touchAction: "none", height: HAND_CANVAS_HEIGHT,
        }}
      >
        {guideSrc && (
          <img
            src={guideSrc}
            alt="handwriting sample to trace"
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "contain", opacity: guideOpacity, pointerEvents: "none",
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        <button onClick={clear} style={{ ...btnGhost, marginTop: 0 }}>
          <Trash2 size={13} style={{ marginRight: 5 }} /> Clear page
        </button>
        <button onClick={() => fileRef.current?.click()} style={{ ...btnGhost, marginTop: 0 }}>
          <Feather size={13} style={{ marginRight: 5 }} /> {guideSrc ? "Change" : "Upload"} a handwriting photo to trace
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
        {guideSrc && (
          <>
            <label style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#6E6656", display: "flex", alignItems: "center", gap: 6 }}>
              Guide strength
              <input type="range" min="0.1" max="0.7" step="0.05" value={guideOpacity}
                onChange={(e) => setGuideOpacity(parseFloat(e.target.value))} />
            </label>
            <button onClick={() => setGuideSrc(null)} style={{ ...btnGhost, marginTop: 0 }}>
              <X size={13} style={{ marginRight: 5 }} /> Remove photo
            </button>
          </>
        )}
      </div>
      {guideSrc && (
        <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#6E6656", marginTop: 6, maxWidth: 420 }}>
          The photo sits behind the page as a faint guide so you can trace your own strokes on top — it isn't
          converted into a font automatically, only what you draw on the canvas becomes the letter.
        </p>
      )}
    </div>
  );
});

/* ---------------------------------------------------------
   Shared style bits
--------------------------------------------------------- */
const btnGhost = {
  marginTop: 8, display: "inline-flex", alignItems: "center",
  fontFamily: "'Work Sans', sans-serif", fontSize: 12.5, color: "#6E6656",
  background: "transparent", border: "1px solid rgba(110,102,86,0.35)",
  borderRadius: 4, padding: "5px 10px", cursor: "pointer",
};

const btnPrimary = {
  fontFamily: "'Work Sans', sans-serif", fontWeight: 600, fontSize: 14,
  color: "#F1E8D6", background: "#2B2A44", border: "none",
  borderRadius: 4, padding: "11px 20px", cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8, letterSpacing: "0.02em",
};

/* ---------------------------------------------------------
   Main App
--------------------------------------------------------- */
function LetterboxMain({ session, onSwitchProfile }) {
  const [tab, setTab] = useState("write");

  // Letter content
  const [mode, setMode] = useState("typed"); // 'typed' | 'handwritten'
  const [fontId, setFontId] = useState("caveat");
  const [text, setText] = useState("");
  const [handEmpty, setHandEmpty] = useState(true);
  const [handSnapshot, setHandSnapshot] = useState(null); // live preview of the drawn page
  const [inkColor, setInkColor] = useState("#2B2A44");
  const handRef = useRef(null);

  // Envelope
  const [recipient, setRecipient] = useState("");
  const [stampId, setStampId] = useState("bird");
  const [sealColor, setSealColor] = useState(SEAL_COLORS[0]);
  const [sealSymbol, setSealSymbol] = useState(SEAL_SYMBOLS[0]);
  const [paperId, setPaperId] = useState("cream");
  const [accessories, setAccessories] = useState([]); // {uid, id, x, y, r}
  const [sealed, setSealed] = useState(false);
  const [sendError, setSendError] = useState("");

  // Delivery
  const now = new Date();
  const minDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [deliverDate, setDeliverDate] = useState(minDate);
  const [deliverTime, setDeliverTime] = useState(`${pad((now.getHours() + 1) % 24)}:00`);

  // Mailbox
  const [mailView, setMailView] = useState("inbox");
  const [inboxList, setInboxList] = useState([]);
  const [sentListState, setSentListState] = useState([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState("");
  const [openedId, setOpenedId] = useState(null);


  const font = HAND_FONTS.find((f) => f.id === fontId) || HAND_FONTS[0];

  const loadMail = useCallback(async () => {
    setMailLoading(true);
    setMailError("");
    try {
      const [inboxRes, sentRes] = await Promise.all([
        fetchInboxApi(session.apiBaseUrl, session.token),
        fetchSentApi(session.apiBaseUrl, session.token),
      ]);
      setInboxList(inboxRes.letters || []);
      setSentListState(sentRes.letters || []);
    } catch (e) {
      setMailError(e.message || "Couldn't load your mail.");
    }
    setMailLoading(false);
  }, [session]);

  useEffect(() => {
    if (tab === "mailbox") loadMail();
  }, [tab, loadMail]);

  const inbox = [...inboxList].sort((a, b) => new Date(a.deliverAt) - new Date(b.deliverAt));
  const sentList = [...sentListState].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

  const addAccessory = (id) => {
    setAccessories((a) => [
      ...a,
      { uid: `${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        id,
        x: 8 + Math.random() * 78,
        y: 8 + Math.random() * 70,
        r: -18 + Math.random() * 36 },
    ]);
  };
  const removeAccessory = (uid) => setAccessories((a) => a.filter((x) => x.uid !== uid));

  const canSend =
    recipient.trim() &&
    (mode === "typed" ? text.trim().length > 0 : !handEmpty);

  const deliveryDateTime = deliverDate && deliverTime ? new Date(`${deliverDate}T${deliverTime}`) : null;

  const handleSend = async () => {
    if (!canSend || !deliveryDateTime) return;
    setSendError("");
    setSealed(true);
    const image = mode === "handwritten" ? handRef.current?.getDataURL() : null;
    const letter = {
      toUsername: recipient.trim(),
      mode, fontId, text: mode === "typed" ? text : "",
      image: mode === "handwritten" ? image : null,
      stampId, sealColor, sealSymbol, paperId, accessories,
      deliverAt: deliveryDateTime.toISOString(),
    };
    try {
      await sendLetterApi(session.apiBaseUrl, session.token, letter);
      setTimeout(async () => {
        setSealed(false);
        setTab("mailbox");
        await loadMail();
        setMailView("sent");
        // reset composer
        setText(""); setHandEmpty(true); setHandSnapshot(null); setAccessories([]);
        setRecipient(""); setPaperId("cream");
        handRef.current?.clear?.();
      }, 700);
    } catch (e) {
      setSealed(false);
      setSendError(e.message || "Couldn't send that letter — try again.");
    }
  };

  return (
    <div style={{
      fontFamily: "'Work Sans', sans-serif",
      background: "#EFE4CC",
      minHeight: 560,
      padding: "0",
      color: "#2B2A44",
    }}>
      <style>{`
        @import url('${FONT_IMPORT_URL}');
        * { box-sizing: border-box; }
        input[type="date"], input[type="time"] {
          font-family: 'Work Sans', sans-serif;
        }
        .lb-tab {
          display:flex; align-items:center; gap:6px;
          font-family:'Special Elite', monospace; font-size:13px;
          padding:10px 16px; cursor:pointer; border:none; background:transparent;
          color:#6E6656; border-bottom:2px solid transparent;
        }
        .lb-tab.active { color:#2B2A44; border-bottom:2px solid #8C2A34; }
        .lb-input {
          width:100%; font-family:'Work Sans',sans-serif; font-size:13.5px;
          padding:8px 10px; border:1px solid rgba(43,42,68,0.3); border-radius:4px;
          background:#FBF6EA; color:#2B2A44;
        }
        .lb-label {
          font-family:'Special Elite', monospace; font-size:11px; letter-spacing:0.04em;
          color:#6E6656; text-transform:uppercase; display:block; margin-bottom:5px;
        }
        .swatch {
          width:22px; height:22px; border-radius:50%; cursor:pointer;
          border:2px solid transparent;
        }
        .swatch.on { border-color:#2B2A44; }
        .stamp-pick {
          width:52px; height:52px; border-radius:3px; cursor:pointer;
          border:1px solid rgba(43,42,68,0.25); background:#F8F1E1; color:#2B2A44;
          display:flex; align-items:center; justify-content:center; padding:4px;
        }
        .stamp-pick.on { border:2px solid #8C2A34; }
        .acc-btn {
          width:38px; height:38px; border-radius:50%; border:1px solid rgba(43,42,68,0.3);
          background:#FBF6EA; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center;
        }
        @keyframes sealDrop {
          0% { transform: translateY(-40px) scale(0.6); opacity:0; }
          70% { transform: translateY(2px) scale(1.05); opacity:1; }
          100% { transform: translateY(0) scale(1); opacity:1; }
        }
        @keyframes lbSpin { to { transform: rotate(360deg); } }
        .lb-spin { animation: lbSpin 0.8s linear infinite; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid rgba(43,42,68,0.15)",
        padding: "18px 24px 0 24px",
        background: "linear-gradient(#F4EAD3, #EFE4CC)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <Feather size={20} color="#8C2A34" />
          <h1 style={{
            fontFamily: "'Special Elite', monospace", fontSize: 20, margin: 0, letterSpacing: "0.02em",
          }}>Letterbox</h1>
          <span style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12, color: "#6E6656" }}>
            correspondence, timed to arrive
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12.5, color: "#6E6656" }}>
              Signed in as <b style={{ color: "#2B2A44" }}>{session.username}</b>
            </span>
            <button onClick={onSwitchProfile} style={{ ...btnGhost, marginTop: 0 }}>
              <LogOut size={12} style={{ marginRight: 5 }} /> Switch
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className={`lb-tab ${tab === "write" ? "active" : ""}`} onClick={() => setTab("write")}>
            <PenLine size={14} /> Write
          </button>
          <button className={`lb-tab ${tab === "envelope" ? "active" : ""}`} onClick={() => setTab("envelope")}>
            <Stamp size={14} /> Envelope
          </button>
          <button className={`lb-tab ${tab === "mailbox" ? "active" : ""}`} onClick={() => setTab("mailbox")}>
            <Mailbox size={14} /> Mailbox {inbox.length > 0 && `(${inbox.length})`}
          </button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {tab === "write" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 24 }}>
            <div>
              <label className="lb-label">Paper</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {PAPER_STYLES.map((p) => (
                  <button key={p.id} onClick={() => setPaperId(p.id)} title={p.label}
                    style={{
                      width: 40, height: 30, borderRadius: 3, cursor: "pointer",
                      border: paperId === p.id ? "2px solid #8C2A34" : "1px solid rgba(43,42,68,0.3)",
                      ...p.css,
                    }} />
                ))}
                <span style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#6E6656", alignSelf: "center", marginLeft: 4 }}>
                  {getPaper(paperId).label}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button
                  onClick={() => setMode("typed")}
                  style={{
                    ...btnGhost, marginTop: 0,
                    background: mode === "typed" ? "#2B2A44" : "transparent",
                    color: mode === "typed" ? "#F1E8D6" : "#6E6656",
                  }}>
                  <Type size={13} style={{ marginRight: 5 }} /> Typed, in a font
                </button>
                <button
                  onClick={() => setMode("handwritten")}
                  style={{
                    ...btnGhost, marginTop: 0,
                    background: mode === "handwritten" ? "#2B2A44" : "transparent",
                    color: mode === "handwritten" ? "#F1E8D6" : "#6E6656",
                  }}>
                  <PenLine size={13} style={{ marginRight: 5 }} /> My own handwriting
                </button>
              </div>

              {mode === "typed" ? (
                <div>
                  <label className="lb-label">Choose a hand</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {HAND_FONTS.map((f) => (
                      <button key={f.id} onClick={() => setFontId(f.id)}
                        style={{
                          fontFamily: f.family, fontSize: 16, padding: "5px 12px",
                          borderRadius: 4, cursor: "pointer",
                          border: f.id === fontId ? "1.5px solid #8C2A34" : "1px solid rgba(43,42,68,0.25)",
                          background: f.id === fontId ? "#FBF6EA" : "transparent", color: "#2B2A44",
                        }}>
                        {f.label.split(" — ")[0]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Dear friend,"
                    style={{
                      width: "100%", minHeight: 260, resize: "vertical",
                      fontFamily: font.family, fontSize: font.size, lineHeight: `${LINE_HEIGHT}px`,
                      paddingTop: font.baseline, paddingBottom: 16, paddingLeft: 18, paddingRight: 18,
                      border: "1px solid rgba(43,42,68,0.25)", borderRadius: 4,
                      backgroundImage: `repeating-linear-gradient(transparent 0 ${LINE_HEIGHT - 1}px, rgba(43,42,68,0.16) ${LINE_HEIGHT - 1}px ${LINE_HEIGHT}px), ${getPaper(paperId).css.background}`,
                      backgroundAttachment: "local",
                      color: getPaper(paperId).css.color || "#2B2A44",
                    }}
                  />
                </div>
              ) : (
                <div>
                  <label className="lb-label">Ink colour</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {["#2B2A44", "#8C2A34", "#1F3A5F", "#4A5D3A"].map((c) => (
                      <span key={c} onClick={() => setInkColor(c)}
                        className={`swatch ${inkColor === c ? "on" : ""}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                  <label className="lb-label">Write with your mouse, trackpad, or finger</label>
                  <HandwritingCanvas
                    ref={handRef}
                    inkColor={inkColor}
                    onChangeEmpty={setHandEmpty}
                    onStroke={setHandSnapshot}
                    paperBackground={getPaper(paperId).css.background}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="lb-label">Preview</label>
              <div style={{
                ...getPaper(paperId).css, border: "1px solid rgba(43,42,68,0.2)",
                borderRadius: 3, padding: 24, minHeight: 300,
                boxShadow: "0 6px 18px rgba(43,42,68,0.12)",
              }}>
                {mode === "typed" ? (
                  <div style={{ fontFamily: font.family, fontSize: font.size + 1, lineHeight: 1.5, whiteSpace: "pre-wrap", color: getPaper(paperId).css.color || "#2B2A44" }}>
                    {text || <span style={{ color: "#B9AF98" }}>Your letter will appear here as you write…</span>}
                  </div>
                ) : handSnapshot ? (
                  <img src={handSnapshot} alt="your handwritten letter" style={{ width: "100%", display: "block" }} />
                ) : (
                  <div style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12.5, color: "#6E6656" }}>
                    What you draw on the left appears here, and this exact page is what gets sent.
                  </div>
                )}
              </div>
              <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12, color: "#6E6656", marginTop: 10 }}>
                Next, head to <b>Envelope</b> to address it, stamp it, and choose when it arrives.
              </p>
              <button onClick={() => setTab("envelope")} style={{ ...btnPrimary, marginTop: 6 }}>
                Address the envelope <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {tab === "envelope" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 24 }}>
            <div>
              <label className="lb-label">From</label>
              <div style={{
                fontFamily: "'Work Sans',sans-serif", fontSize: 13.5, color: "#2B2A44",
                background: "#EFE4CC", border: "1px solid rgba(43,42,68,0.2)", borderRadius: 4,
                padding: "8px 10px", marginBottom: 12,
              }}>
                {session.username} <span style={{ color: "#6E6656", fontSize: 11.5 }}>(from your login)</span>
              </div>
              <label className="lb-label">To</label>
              <input className="lb-input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient's exact display name" style={{ marginBottom: 4 }} />
              <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#6E6656", marginBottom: 18 }}>
                This has to match your friend's Letterbox display name exactly (not case-sensitive) — that's how
                it finds its way to their Mailbox.
              </p>

              <label className="lb-label">Stamp</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                {STAMPS.map((s) => (
                  <div key={s.id} title={s.label} onClick={() => setStampId(s.id)}
                    className={`stamp-pick ${stampId === s.id ? "on" : ""}`}>
                    <StampArt id={s.id} />
                  </div>
                ))}
              </div>

              <label className="lb-label">Wax seal</label>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {SEAL_COLORS.map((c) => (
                    <span key={c} onClick={() => setSealColor(c)} className={`swatch ${sealColor === c ? "on" : ""}`} style={{ background: c }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {SEAL_SYMBOLS.map((sym) => (
                    <button key={sym} onClick={() => setSealSymbol(sym)}
                      style={{
                        width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
                        border: sealSymbol === sym ? "2px solid #2B2A44" : "1px solid rgba(43,42,68,0.3)",
                        background: "#FBF6EA", fontSize: 13,
                      }}>{sym}</button>
                  ))}
                </div>
              </div>

              <label className="lb-label">Accessories — click to add, click again on the envelope to remove</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                {ACCESSORIES.map((a) => (
                  <button key={a.id} title={a.label} className="acc-btn" onClick={() => addAccessory(a.id)}>{a.glyph}</button>
                ))}
              </div>

              <label className="lb-label">Arrives on</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input type="date" className="lb-input" value={deliverDate} min={minDate}
                  onChange={(e) => setDeliverDate(e.target.value)} style={{ flex: 1 }} />
                <input type="time" className="lb-input" value={deliverTime}
                  onChange={(e) => setDeliverTime(e.target.value)} style={{ flex: 1 }} />
              </div>
              {deliveryDateTime && (
                <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12, color: "#6E6656", display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock size={12} /> Delivered {formatWhen(deliveryDateTime)}
                </p>
              )}

              <button
                onClick={handleSend}
                disabled={!canSend || sealed}
                style={{
                  ...btnPrimary, marginTop: 14,
                  opacity: canSend && !sealed ? 1 : 0.5, cursor: canSend && !sealed ? "pointer" : "not-allowed",
                  background: "#8C2A34",
                }}>
                {sealed ? <Loader2 size={15} className="lb-spin" /> : <Send size={15} />}
                {sealed ? "Sealing…" : "Seal & send"}
              </button>
              {!canSend && (
                <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#B9AF98", marginTop: 6 }}>
                  Add a recipient and some words on the page first.
                </p>
              )}
              {sendError && (
                <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#8C2A34", marginTop: 6 }}>
                  {sendError}
                </p>
              )}
            </div>

            {/* Envelope preview */}
            <div>
              <label className="lb-label">Envelope</label>
              <div style={{
                position: "relative", background: "#EDE0C2",
                border: "1px solid rgba(43,42,68,0.25)",
                padding: 3,
                boxShadow: "0 10px 26px rgba(43,42,68,0.18)",
              }}>
                <div style={{
                  height: 10,
                  background: "repeating-linear-gradient(-45deg, #A32638 0 14px, #F4EAD3 14px 20px, #1F3A5F 20px 34px, #F4EAD3 34px 40px)",
                }} />
                <div style={{ position: "relative", padding: 26, minHeight: 260, overflow: "hidden" }}>
                  {/* accessories */}
                  {accessories.map((a) => {
                    const def = ACCESSORIES.find((x) => x.id === a.id);
                    return (
                      <span key={a.uid} onClick={() => removeAccessory(a.uid)} title="remove"
                        style={{
                          position: "absolute", left: `${a.x}%`, top: `${a.y}%`,
                          transform: `rotate(${a.r}deg)`, fontSize: 22, cursor: "pointer",
                          color: a.id === "flower" ? "#8C2A34" : a.id === "leaf" ? "#4A5D3A" : "#8C2A34",
                          userSelect: "none",
                        }}>{def?.glyph}</span>
                    );
                  })}

                  {/* stamp */}
                  <div style={{ position: "absolute", top: 20, right: 20, width: 54, height: 54, color: "#2B2A44" }}>
                    <StampArt id={stampId} />
                  </div>

                  {/* address block */}
                  <div style={{ marginTop: 70, fontFamily: "'Special Elite', monospace", color: "#2B2A44" }}>
                    <div style={{ fontSize: 15, marginBottom: 6 }}>{recipient || "— recipient —"}</div>
                    <div style={{ fontSize: 11, color: "#6E6656" }}>via Letterbox</div>
                  </div>
                  <div style={{ position: "absolute", left: 24, bottom: 18, fontFamily: "'Special Elite', monospace", fontSize: 10.5, color: "#6E6656" }}>
                    from {session.username}
                  </div>

                  {/* wax seal */}
                  <div style={{
                    position: "absolute", right: 26, bottom: 18,
                    width: 40, height: 40, borderRadius: "50%",
                    background: sealColor, color: "#F1E8D6",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, boxShadow: "inset 0 -3px 5px rgba(0,0,0,0.35), 0 3px 6px rgba(0,0,0,0.3)",
                    animation: sealed ? "sealDrop 0.5s ease-out" : "none",
                  }}>
                    {sealSymbol}
                  </div>
                </div>
              </div>
              <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#6E6656", marginTop: 10 }}>
                Tap an accessory on the envelope to remove it.
              </p>
            </div>
          </div>
        )}

        {tab === "mailbox" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
              <button
                onClick={() => setMailView("inbox")}
                style={{
                  ...btnGhost, marginTop: 0,
                  background: mailView === "inbox" ? "#2B2A44" : "transparent",
                  color: mailView === "inbox" ? "#F1E8D6" : "#6E6656",
                }}>
                <Inbox size={13} style={{ marginRight: 5 }} /> Inbox ({inbox.length})
              </button>
              <button
                onClick={() => setMailView("sent")}
                style={{
                  ...btnGhost, marginTop: 0,
                  background: mailView === "sent" ? "#2B2A44" : "transparent",
                  color: mailView === "sent" ? "#F1E8D6" : "#6E6656",
                }}>
                <Send size={13} style={{ marginRight: 5 }} /> Sent ({sentList.length})
              </button>
              <button onClick={loadMail} style={{ ...btnGhost, marginTop: 0, marginLeft: "auto" }} disabled={mailLoading}>
                {mailLoading ? <Loader2 size={13} className="lb-spin" style={{ marginRight: 5 }} /> : <RefreshCw size={13} style={{ marginRight: 5 }} />}
                Refresh
              </button>
            </div>

            {mailError && (
              <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12, color: "#8C2A34", marginBottom: 12 }}>
                {mailError}
              </p>
            )}

            {mailLoading && inbox.length === 0 && sentList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#6E6656", fontFamily: "'Work Sans',sans-serif" }}>
                <Loader2 size={22} className="lb-spin" style={{ marginBottom: 10 }} />
                <p>Checking the post…</p>
              </div>
            ) : (
              <>
                {(mailView === "inbox" ? inbox : sentList).length === 0 && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#6E6656", fontFamily: "'Work Sans',sans-serif" }}>
                    <Mailbox size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
                    <p>
                      {mailView === "inbox"
                        ? "Nothing here yet — letters addressed to you will show up after you Refresh."
                        : "You haven't sealed any letters yet."}
                    </p>
                  </div>
                )}

                <div style={{ display: "grid", gap: 12 }}>
                  {(mailView === "inbox" ? inbox : sentList).map((l) => {
                    const delivered = new Date(l.deliverAt) <= new Date();
                    const canOpen = mailView === "inbox" ? delivered : true;
                    const isOpen = openedId === l.id;
                    const lFont = HAND_FONTS.find((f) => f.id === l.fontId) || HAND_FONTS[0];
                    return (
                      <div key={l.id} style={{
                        background: "#FBF6EA", border: "1px solid rgba(43,42,68,0.18)",
                        borderRadius: 4, overflow: "hidden",
                      }}>
                        <div
                          onClick={() => canOpen && setOpenedId(isOpen ? null : l.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 16,
                            padding: "14px 18px", cursor: canOpen ? "pointer" : "default",
                          }}>
                          <div style={{ width: 34, height: 34, color: "#2B2A44", flexShrink: 0 }}>
                            <StampArt id={l.stampId} />
                          </div>
                          <div style={{ flex: 1, fontFamily: "'Work Sans',sans-serif" }}>
                            <div style={{ fontSize: 13.5 }}>
                              <b>{l.fromUsername}</b> <span style={{ color: "#6E6656" }}>→</span> <b>{l.toUsername}</b>
                            </div>
                            <div style={{ fontSize: 11.5, color: "#6E6656", marginTop: 2 }}>
                              {delivered ? "Delivered" : "Arriving"} {formatWhen(new Date(l.deliverAt))}
                            </div>
                          </div>
                          <span style={{
                            fontFamily: "'Special Elite', monospace", fontSize: 11,
                            padding: "5px 10px", borderRadius: 3,
                            background: delivered ? "#4A5D3A" : "#A9863E", color: "#F1E8D6",
                            display: "flex", alignItems: "center", gap: 5,
                          }}>
                            {delivered ? <Check size={12} /> : <Clock size={12} />}
                            {delivered ? "delivered" : "scheduled"}
                          </span>
                          {mailView === "inbox" && !delivered && <Lock size={14} color="#B08D57" />}
                        </div>

                        {isOpen && canOpen && (
                          <div style={{
                            borderTop: "1px dashed rgba(43,42,68,0.25)", padding: "18px 22px",
                            ...getPaper(l.paperId).css,
                          }}>
                            {l.mode === "typed" ? (
                              <div style={{ fontFamily: lFont.family, fontSize: lFont.size + 1, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#2B2A44" }}>
                                {l.text}
                              </div>
                            ) : l.image ? (
                              <img src={l.image} alt="handwritten letter" style={{ width: "100%", display: "block", borderRadius: 3 }} />
                            ) : (
                              <span style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12, color: "#6E6656" }}>
                                This page didn't come through.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11, color: "#B9AF98", marginTop: 18, maxWidth: 520 }}>
              Letters are stored on the backend you connected, not on this device — that's what lets
              a friend on a different device actually receive them. See that backend's README for the
              real limits on privacy and durability (no encryption, and free hosting tiers can lose data).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Connect — the app needs to know where your backend lives.
   Paste the URL you got after deploying letterbox-backend
   (see its README). This is remembered locally so you only
   do it once.
--------------------------------------------------------- */
function ConnectScreen({ onConnected }) {
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    const clean = url.trim().replace(/\/$/, "");
    if (!clean) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch(`${clean}/api/health`);
      if (!res.ok) throw new Error();
      await window.storage.set("apiBaseUrl", clean, false);
      onConnected(clean);
    } catch (e) {
      setError("Couldn't reach that address. Check it's the right URL and the backend is running.");
    }
    setChecking(false);
  };

  return (
    <div style={{
      fontFamily: "'Work Sans', sans-serif", background: "#EFE4CC",
      minHeight: 560, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      color: "#2B2A44",
    }}>
      <style>{`
        @import url('${FONT_IMPORT_URL}'); * { box-sizing: border-box; }
        @keyframes lbSpin { to { transform: rotate(360deg); } } .lb-spin { animation: lbSpin 0.8s linear infinite; }
      `}</style>
      <div style={{
        width: "100%", maxWidth: 400, background: "#FBF6EA",
        border: "1px solid rgba(43,42,68,0.2)", borderRadius: 6, padding: 28,
        boxShadow: "0 10px 26px rgba(43,42,68,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Feather size={20} color="#8C2A34" />
          <h1 style={{ fontFamily: "'Special Elite', monospace", fontSize: 19, margin: 0 }}>Letterbox</h1>
        </div>
        <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12.5, color: "#6E6656", marginTop: 6, marginBottom: 18 }}>
          Connect to your backend once — deploy <code>letterbox-backend</code> (its README walks
          through Render in about 5 minutes), then paste the URL it gives you.
        </p>
        <label className="lb-label" style={{
          fontFamily: "'Special Elite', monospace", fontSize: 11, letterSpacing: "0.04em",
          color: "#6E6656", textTransform: "uppercase", display: "block", marginBottom: 5,
        }}>Backend URL</label>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="https://letterbox-api-xxxx.onrender.com"
          style={{
            width: "100%", fontFamily: "'Work Sans',sans-serif", fontSize: 13.5,
            padding: "9px 11px", border: "1px solid rgba(43,42,68,0.3)", borderRadius: 4,
            background: "#F8F1E1", color: "#2B2A44", marginBottom: 14,
          }}
        />
        {error && (
          <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#8C2A34", marginBottom: 10 }}>{error}</p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!url.trim() || checking}
          style={{
            fontFamily: "'Work Sans', sans-serif", fontWeight: 600, fontSize: 14,
            color: "#F1E8D6", background: "#2B2A44", border: "none",
            borderRadius: 4, padding: "11px 20px", cursor: url.trim() ? "pointer" : "not-allowed",
            opacity: url.trim() && !checking ? 1 : 0.55,
            display: "inline-flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center",
          }}>
          {checking ? <Loader2 size={15} className="lb-spin" /> : <ChevronRight size={15} />}
          {checking ? "Checking…" : "Connect"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Auth — real accounts on your backend. Signup enforces a
   unique username server-side (case-insensitive), so two
   people can never claim the same one.
--------------------------------------------------------- */
function AuthScreen({ apiBaseUrl, onSignedIn, onChangeBackend }) {
  const [authMode, setAuthMode] = useState("signup"); // 'signup' | 'login'
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const call = authMode === "signup" ? signupApi : loginApi;
      const { token, username: uname } = await call(apiBaseUrl, username.trim(), password);
      const session = { apiBaseUrl, token, username: uname };
      await saveSession(session);
      onSignedIn(session);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  const inputStyle = {
    width: "100%", fontFamily: "'Work Sans',sans-serif", fontSize: 13.5,
    padding: "9px 11px", border: "1px solid rgba(43,42,68,0.3)", borderRadius: 4,
    background: "#F8F1E1", color: "#2B2A44", marginBottom: 12,
  };

  return (
    <div style={{
      fontFamily: "'Work Sans', sans-serif", background: "#EFE4CC",
      minHeight: 560, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      color: "#2B2A44",
    }}>
      <style>{`
        @import url('${FONT_IMPORT_URL}'); * { box-sizing: border-box; }
        @keyframes lbSpin { to { transform: rotate(360deg); } } .lb-spin { animation: lbSpin 0.8s linear infinite; }
      `}</style>
      <div style={{
        width: "100%", maxWidth: 360, background: "#FBF6EA",
        border: "1px solid rgba(43,42,68,0.2)", borderRadius: 6, padding: 28,
        boxShadow: "0 10px 26px rgba(43,42,68,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Feather size={20} color="#8C2A34" />
          <h1 style={{ fontFamily: "'Special Elite', monospace", fontSize: 19, margin: 0 }}>Letterbox</h1>
        </div>
        <div style={{ display: "flex", gap: 4, margin: "14px 0 16px" }}>
          <button onClick={() => { setAuthMode("signup"); setError(""); }} style={{
            ...btnGhost, marginTop: 0, flex: 1, justifyContent: "center",
            background: authMode === "signup" ? "#2B2A44" : "transparent",
            color: authMode === "signup" ? "#F1E8D6" : "#6E6656",
          }}>Create account</button>
          <button onClick={() => { setAuthMode("login"); setError(""); }} style={{
            ...btnGhost, marginTop: 0, flex: 1, justifyContent: "center",
            background: authMode === "login" ? "#2B2A44" : "transparent",
            color: authMode === "login" ? "#F1E8D6" : "#6E6656",
          }}>Log in</button>
        </div>

        {authMode === "signup" && (
          <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#6E6656", marginBottom: 12 }}>
            Pick a username nobody else has claimed — that's your unique ID, and what friends type
            into "To" to reach you.
          </p>
        )}

        <label className="lb-label" style={{
          fontFamily: "'Special Elite', monospace", fontSize: 11, letterSpacing: "0.04em",
          color: "#6E6656", textTransform: "uppercase", display: "block", marginBottom: 5,
        }}>Username</label>
        <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. alex_rivera" style={inputStyle} />

        <label className="lb-label" style={{
          fontFamily: "'Special Elite', monospace", fontSize: 11, letterSpacing: "0.04em",
          color: "#6E6656", textTransform: "uppercase", display: "block", marginBottom: 5,
        }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="At least 4 characters" style={inputStyle} />

        {error && (
          <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 11.5, color: "#8C2A34", marginBottom: 10 }}>{error}</p>
        )}

        <button type="button" onClick={submit} disabled={!username.trim() || !password || busy} style={{
          fontFamily: "'Work Sans', sans-serif", fontWeight: 600, fontSize: 14,
          color: "#F1E8D6", background: "#8C2A34", border: "none",
          borderRadius: 4, padding: "11px 20px", cursor: "pointer",
          opacity: username.trim() && password && !busy ? 1 : 0.55,
          display: "inline-flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center",
        }}>
          {busy ? <Loader2 size={15} className="lb-spin" /> : <Feather size={15} />}
          {busy ? "Please wait…" : authMode === "signup" ? "Create account" : "Log in"}
        </button>

        <button type="button" onClick={onChangeBackend} style={{ ...btnGhost, marginTop: 14, width: "100%", justifyContent: "center" }}>
          Using a different backend? Change URL
        </button>
      </div>
    </div>
  );
}

export default function LetterboxApp() {
  const [apiBaseUrl, setApiBaseUrl] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let url = null;
      try {
        const res = await window.storage.get("apiBaseUrl", false);
        url = res ? res.value : null;
      } catch (e) { /* not set yet */ }

      const existingSession = await loadSession();
      if (existingSession?.apiBaseUrl) {
        try {
          await meApi(existingSession.apiBaseUrl, existingSession.token);
          if (!cancelled) {
            setApiBaseUrl(existingSession.apiBaseUrl);
            setSession(existingSession);
          }
        } catch (e) {
          await clearSession();
          if (!cancelled) setApiBaseUrl(url);
        }
      } else if (!cancelled) {
        setApiBaseUrl(url);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSwitch = async () => {
    await clearSession();
    setSession(null);
  };
  const handleChangeBackend = async () => {
    try { await window.storage.delete("apiBaseUrl", false); } catch (e) { /* ignore */ }
    await clearSession();
    setApiBaseUrl(null);
    setSession(null);
  };

  if (loading) {
    return (
      <div style={{
        fontFamily: "'Work Sans', sans-serif", background: "#EFE4CC", minHeight: 560,
        display: "flex", alignItems: "center", justifyContent: "center", color: "#6E6656",
      }}>
        <style>{`@keyframes lbSpin { to { transform: rotate(360deg); } } .lb-spin { animation: lbSpin 0.8s linear infinite; }`}</style>
        <Loader2 size={22} className="lb-spin" />
      </div>
    );
  }

  if (!apiBaseUrl) return <ConnectScreen onConnected={setApiBaseUrl} />;
  if (!session) return <AuthScreen apiBaseUrl={apiBaseUrl} onSignedIn={setSession} onChangeBackend={handleChangeBackend} />;

  return <LetterboxMain session={session} onSwitchProfile={handleSwitch} />;
}

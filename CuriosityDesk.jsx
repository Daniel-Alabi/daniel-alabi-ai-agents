import React, { useState, useRef, useCallback } from "react";
import { Image as ImageIcon, FileText, Music, Loader2, RotateCcw, Upload, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Client-side audio tag reader: ID3v2 (TIT2/TPE1) with ID3v1 + filename fallback
// ---------------------------------------------------------------------------
function decodeText(buf, start, len, enc) {
  if (len <= 0) return "";
  const slice = buf.slice(start, start + len);
  let decoder;
  try {
    if (enc === 0) decoder = new TextDecoder("iso-8859-1");
    else if (enc === 1) decoder = new TextDecoder("utf-16");
    else if (enc === 2) decoder = new TextDecoder("utf-16be");
    else decoder = new TextDecoder("utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(slice).replace(/\u0000+/g, " ").trim();
}

function latin1(buf, start, len) {
  let s = "";
  for (let i = start; i < start + len && i < buf.length; i++) {
    const c = buf[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

async function readAudioTags(file) {
  let title = "", artist = "";
  try {
    const buf = new Uint8Array(await file.arrayBuffer());

    // ID3v2 ("ID3" at start)
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
      const version = buf[3];
      const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]; // synchsafe
      const end = Math.min(10 + size, buf.length);
      let pos = 10;
      while (pos < end - 10) {
        const id = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        let frameSize;
        if (version === 4) {
          frameSize = (buf[pos + 4] << 21) | (buf[pos + 5] << 14) | (buf[pos + 6] << 7) | buf[pos + 7];
        } else {
          frameSize = (buf[pos + 4] << 24) | (buf[pos + 5] << 16) | (buf[pos + 6] << 8) | buf[pos + 7];
        }
        if (frameSize <= 0) break;
        const contentStart = pos + 10;
        if (id === "TIT2" || id === "TPE1") {
          const enc = buf[contentStart];
          const text = decodeText(buf, contentStart + 1, frameSize - 1, enc);
          if (id === "TIT2") title = text;
          else artist = text;
        }
        pos = contentStart + frameSize;
      }
    }

    // ID3v1 fallback (last 128 bytes, "TAG")
    if ((!title || !artist) && buf.length > 128) {
      const t = buf.length - 128;
      if (buf[t] === 0x54 && buf[t + 1] === 0x41 && buf[t + 2] === 0x47) {
        if (!title) title = latin1(buf, t + 3, 30);
        if (!artist) artist = latin1(buf, t + 33, 30);
      }
    }
  } catch {
    /* fall through to filename */
  }

  // Filename fallback: "Artist - Title.ext" or just the name
  if (!title) {
    const base = file.name.replace(/\.[^.]+$/, "");
    const dash = base.split(/\s+-\s+/);
    if (dash.length >= 2 && !artist) {
      artist = dash[0].trim();
      title = dash.slice(1).join(" - ").trim();
    } else {
      title = base.trim();
    }
  }
  return { title: title.trim(), artist: artist.trim() };
}

// ---------------------------------------------------------------------------
// Anthropic API call (handled by the artifact runtime — no key needed)
// ---------------------------------------------------------------------------
async function getFunFact(messages) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages,
    }),
  });
  if (!response.ok) throw new Error("The request didn't go through (status " + response.status + ").");
  const data = await response.json();
  return data.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

const FACT_RULES =
  "Give me ONE genuinely surprising, delightful, and TRUE fun fact. " +
  "Keep it to 2-4 sentences. Lead with the fact itself — no 'Did you know' and no preamble. " +
  "Be specific and accurate; if you are not confident a detail is true, leave it out. " +
  "Then, on a new line, output a 1-3 word category tag prefixed with 'TAG:' (e.g. TAG: Astronomy).";

const LOADERS = [
  "Consulting the archives…",
  "Dusting off a curiosity…",
  "Cross-referencing the unlikely…",
  "Filing through the marginalia…",
];

const MODES = [
  { id: "image", label: "Image", icon: ImageIcon, hint: "Drop a photo and learn something about it" },
  { id: "note", label: "Note", icon: FileText, hint: "Type a word, topic, or stray thought" },
  { id: "music", label: "Music", icon: Music, hint: "Upload a track — tags read on your device" },
];

export default function CuriosityDesk() {
  const [mode, setMode] = useState("image");
  const [note, setNote] = useState("");
  const [imageData, setImageData] = useState(null); // {b64, mime, url}
  const [track, setTrack] = useState(null); // {title, artist}
  const [manualTrack, setManualTrack] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaderText, setLoaderText] = useState(LOADERS[0]);
  const [result, setResult] = useState(null); // {fact, tag}
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const imgInput = useRef(null);
  const audioInput = useRef(null);

  const reset = (newMode) => {
    setMode(newMode);
    setResult(null);
    setError(null);
  };

  const handleImageFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setImageData({ b64: dataUrl.split(",")[1], mime: file.type, url: dataUrl });
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleAudioFile = useCallback(async (file) => {
    if (!file) return;
    const tags = await readAudioTags(file);
    setTrack(tags);
    setManualTrack("");
    setResult(null);
    setError(null);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (mode === "image") handleImageFile(file);
    else if (mode === "music") handleAudioFile(file);
  };

  const canSubmit =
    (mode === "image" && imageData) ||
    (mode === "note" && note.trim().length > 0) ||
    (mode === "music" && (track || manualTrack.trim().length > 0));

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    let i = 0;
    setLoaderText(LOADERS[0]);
    const spin = setInterval(() => {
      i = (i + 1) % LOADERS.length;
      setLoaderText(LOADERS[i]);
    }, 1400);

    try {
      let messages;
      if (mode === "image") {
        messages = [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: imageData.mime, data: imageData.b64 } },
              { type: "text", text: "Look closely at this image. " + FACT_RULES },
            ],
          },
        ];
      } else if (mode === "note") {
        messages = [{ role: "user", content: 'Here is a note: "' + note.trim() + '". ' + FACT_RULES }];
      } else {
        const label = manualTrack.trim()
          ? manualTrack.trim()
          : track.artist
          ? '"' + track.title + '" by ' + track.artist
          : '"' + track.title + '"';
        messages = [
          {
            role: "user",
            content:
              "Here is a piece of music: " +
              label +
              ". Give a fun fact about this song, its artist, the album, or the musical era/style it belongs to. " +
              FACT_RULES,
          },
        ];
      }

      const raw = await getFunFact(messages);
      let tag = "Curiosity";
      let fact = raw;
      const m = raw.match(/TAG:\s*(.+)\s*$/i);
      if (m) {
        tag = m[1].trim();
        fact = raw.replace(/\n?TAG:\s*.+\s*$/i, "").trim();
      }
      setResult({ fact, tag });
    } catch (err) {
      setError(err.message || "Something went sideways. Try again?");
    } finally {
      clearInterval(spin);
      setLoading(false);
    }
  };

  const active = MODES.find((m) => m.id === mode);

  return (
    <div className="cd-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,900;1,9..144,500&family=Newsreader:ital,opsz@0,6..72;1,6..72&family=Spline+Sans+Mono:wght@400;600&display=swap');

        .cd-root {
          --paper: #f1e7d4;
          --paper-2: #e8dabf;
          --card: #fbf5e8;
          --ink: #271f17;
          --ink-soft: #6a5a47;
          --ember: #bd4f28;
          --moss: #4c6650;
          --line: rgba(39,31,23,0.16);
          font-family: 'Newsreader', Georgia, serif;
          color: var(--ink);
          min-height: 100%;
          padding: 28px 18px 44px;
          background:
            radial-gradient(120% 80% at 50% -10%, #f7efdd 0%, var(--paper) 55%, var(--paper-2) 100%);
          position: relative;
        }
        .cd-root::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.5; mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.42 0 0 0 0 0.3 0 0 0 0.04 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .cd-wrap { max-width: 660px; margin: 0 auto; position: relative; }

        .cd-eyebrow {
          font-family: 'Spline Sans Mono', monospace; font-size: 11px; letter-spacing: 0.34em;
          text-transform: uppercase; color: var(--ember); margin: 0 0 6px;
        }
        .cd-title {
          font-family: 'Fraunces', serif; font-weight: 900; font-size: clamp(38px, 9vw, 62px);
          line-height: 0.92; margin: 0; letter-spacing: -0.02em;
        }
        .cd-title em { font-style: italic; font-weight: 500; color: var(--ember); }
        .cd-sub { font-family: 'Spline Sans Mono', monospace; font-size: 12px; color: var(--ink-soft); margin: 12px 0 26px; letter-spacing: 0.02em; }

        .cd-tabs { display: flex; gap: 6px; margin-bottom: -1px; position: relative; z-index: 2; }
        .cd-tab {
          font-family: 'Spline Sans Mono', monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
          display: inline-flex; align-items: center; gap: 7px; padding: 11px 16px 13px; cursor: pointer;
          border: 1px solid var(--line); border-bottom: none; background: var(--paper-2); color: var(--ink-soft);
          border-radius: 9px 9px 0 0; transition: all 0.18s ease; position: relative; top: 1px;
        }
        .cd-tab:hover { color: var(--ink); background: #efe2c9; }
        .cd-tab[data-on="true"] { background: var(--card); color: var(--ink); top: 0; box-shadow: 0 -3px 0 var(--ember) inset; }

        .cd-panel {
          border: 1px solid var(--line); background: var(--card); border-radius: 0 12px 12px 12px;
          padding: 22px; box-shadow: 0 18px 40px -28px rgba(39,31,23,0.55);
        }
        .cd-hint { font-family: 'Spline Sans Mono', monospace; font-size: 11px; color: var(--ink-soft); letter-spacing: 0.04em; margin: 0 0 14px; }

        .cd-drop {
          border: 1.5px dashed var(--line); border-radius: 10px; padding: 30px 20px; text-align: center;
          cursor: pointer; transition: all 0.18s ease; background: rgba(255,255,255,0.35);
        }
        .cd-drop:hover, .cd-drop[data-drag="true"] { border-color: var(--ember); background: rgba(189,79,40,0.06); }
        .cd-drop-icon { color: var(--ember); margin-bottom: 10px; }
        .cd-drop-main { font-family: 'Fraunces', serif; font-size: 18px; }
        .cd-drop-side { font-family: 'Spline Sans Mono', monospace; font-size: 11px; color: var(--ink-soft); margin-top: 4px; }

        .cd-preview { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }
        .cd-preview img { display: block; width: 100%; max-height: 320px; object-fit: cover; }
        .cd-x {
          position: absolute; top: 8px; right: 8px; background: rgba(39,31,23,0.78); color: #f7efdd; border: none;
          width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: grid; place-items: center;
        }
        .cd-x:hover { background: var(--ember); }

        .cd-text {
          width: 100%; box-sizing: border-box; min-height: 120px; resize: vertical; padding: 14px 16px;
          border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,0.5);
          font-family: 'Newsreader', serif; font-size: 17px; color: var(--ink); outline: none;
        }
        .cd-text:focus { border-color: var(--ember); box-shadow: 0 0 0 3px rgba(189,79,40,0.12); }
        .cd-text::placeholder, .cd-input::placeholder { color: #b09b7d; }

        .cd-trackcard { border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; background: rgba(255,255,255,0.5); margin-bottom: 12px; }
        .cd-trackcard .lbl { font-family: 'Spline Sans Mono', monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--moss); }
        .cd-trackcard .ttl { font-family: 'Fraunces', serif; font-weight: 600; font-size: 22px; line-height: 1.1; margin: 3px 0 2px; }
        .cd-trackcard .art { font-family: 'Newsreader', serif; font-style: italic; font-size: 16px; color: var(--ink-soft); }
        .cd-input {
          width: 100%; box-sizing: border-box; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px;
          background: rgba(255,255,255,0.5); font-family: 'Newsreader', serif; font-size: 16px; color: var(--ink); outline: none;
        }
        .cd-input:focus { border-color: var(--ember); box-shadow: 0 0 0 3px rgba(189,79,40,0.12); }
        .cd-or { font-family: 'Spline Sans Mono', monospace; font-size: 10px; letter-spacing: 0.2em; color: var(--ink-soft); text-align: center; margin: 12px 0; text-transform: uppercase; }

        .cd-go {
          margin-top: 18px; width: 100%; padding: 15px; cursor: pointer; border: none; border-radius: 10px;
          background: var(--ink); color: var(--paper); font-family: 'Spline Sans Mono', monospace;
          font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; transition: all 0.18s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 10px;
        }
        .cd-go:hover:not(:disabled) { background: var(--ember); transform: translateY(-1px); }
        .cd-go:disabled { opacity: 0.4; cursor: not-allowed; }

        .cd-result { margin-top: 22px; position: relative; animation: rise 0.5s cubic-bezier(0.2,0.8,0.2,1) both; }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .cd-result-card {
          border: 1px solid var(--line); border-radius: 12px; background:
            linear-gradient(180deg, #fcf7ec, #f6ecd8); padding: 26px 26px 28px; position: relative; overflow: hidden;
          box-shadow: 0 20px 44px -30px rgba(39,31,23,0.6);
        }
        .cd-seal {
          font-family: 'Spline Sans Mono', monospace; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase;
          color: var(--ember); border: 1px solid var(--ember); border-radius: 999px; padding: 4px 12px; display: inline-block; margin-bottom: 14px;
        }
        .cd-fact { font-family: 'Fraunces', serif; font-size: clamp(20px, 4.4vw, 26px); line-height: 1.3; font-weight: 400; }
        .cd-fact::first-letter { font-weight: 900; }
        .cd-again {
          margin-top: 18px; background: none; border: 1px solid var(--line); border-radius: 8px; padding: 9px 14px; cursor: pointer;
          font-family: 'Spline Sans Mono', monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft);
          display: inline-flex; align-items: center; gap: 8px; transition: all 0.18s ease;
        }
        .cd-again:hover { color: var(--ink); border-color: var(--ink); }

        .cd-err {
          margin-top: 18px; border: 1px solid var(--ember); background: rgba(189,79,40,0.07); color: var(--ember);
          border-radius: 10px; padding: 12px 16px; font-family: 'Spline Sans Mono', monospace; font-size: 13px;
        }
        .cd-spin { animation: sp 1s linear infinite; } @keyframes sp { to { transform: rotate(360deg); } }
        .cd-foot { text-align: center; margin-top: 26px; font-family: 'Spline Sans Mono', monospace; font-size: 10px; letter-spacing: 0.16em; color: var(--ink-soft); text-transform: uppercase; }
      `}</style>

      <div className="cd-wrap">
        <p className="cd-eyebrow">No. 01 · A Pocket Almanac</p>
        <h1 className="cd-title">
          The Curiosity <em>Desk</em>
        </h1>
        <p className="cd-sub">Hand it a picture, a note, or a song — get back one true, delightful fact.</p>

        <div className="cd-tabs">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.id} className="cd-tab" data-on={mode === m.id} onClick={() => reset(m.id)}>
                <Icon size={14} strokeWidth={2} />
                {m.label}
              </div>
            );
          })}
        </div>

        <div className="cd-panel" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <p className="cd-hint">{active.hint}</p>

          {mode === "image" && (
            !imageData ? (
              <div className="cd-drop" data-drag={dragging} onClick={() => imgInput.current?.click()}>
                <Upload size={26} className="cd-drop-icon" />
                <div className="cd-drop-main">Drop an image, or click to browse</div>
                <div className="cd-drop-side">JPG · PNG · GIF · WEBP</div>
                <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => handleImageFile(e.target.files?.[0])} />
              </div>
            ) : (
              <div className="cd-preview">
                <img src={imageData.url} alt="preview" />
                <button className="cd-x" onClick={() => setImageData(null)} aria-label="Remove"><X size={16} /></button>
              </div>
            )
          )}

          {mode === "note" && (
            <textarea
              className="cd-text"
              placeholder="e.g. octopuses, the color blue, the year 1816, my grandmother's clock…"
              value={note}
              onChange={(e) => { setNote(e.target.value); setResult(null); }}
            />
          )}

          {mode === "music" && (
            <div>
              {track && (
                <div className="cd-trackcard">
                  <div className="lbl">Read from your file</div>
                  <div className="ttl">{track.title || "Untitled"}</div>
                  {track.artist && <div className="art">{track.artist}</div>}
                </div>
              )}
              <div className="cd-drop" data-drag={dragging} onClick={() => audioInput.current?.click()}>
                <Music size={24} className="cd-drop-icon" />
                <div className="cd-drop-main">{track ? "Choose a different track" : "Drop an audio file, or click to browse"}</div>
                <div className="cd-drop-side">MP3 · M4A · FLAC · tags read on your device</div>
                <input ref={audioInput} type="file" accept="audio/*" hidden onChange={(e) => handleAudioFile(e.target.files?.[0])} />
              </div>
              <div className="cd-or">— or just tell me —</div>
              <input
                className="cd-input"
                placeholder='Type a song & artist, e.g. "Clair de Lune by Debussy"'
                value={manualTrack}
                onChange={(e) => { setManualTrack(e.target.value); setResult(null); }}
              />
            </div>
          )}

          <button className="cd-go" disabled={!canSubmit || loading} onClick={submit}>
            {loading ? (<><Loader2 size={15} className="cd-spin" />{loaderText}</>) : "Reveal a fact"}
          </button>

          {error && <div className="cd-err">{error}</div>}
        </div>

        {result && (
          <div className="cd-result">
            <div className="cd-result-card">
              <span className="cd-seal">{result.tag}</span>
              <p className="cd-fact">{result.fact}</p>
              <button className="cd-again" onClick={submit} disabled={loading}>
                <RotateCcw size={13} /> Another, please
              </button>
            </div>
          </div>
        )}

        <p className="cd-foot">Curated on demand · facts may delight</p>
      </div>
    </div>
  );
}

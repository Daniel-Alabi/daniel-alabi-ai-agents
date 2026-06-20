import React, { useState } from "react";

// ============================================================
//  Mise — a recipe nutrition reader + cook-from-what-you-have studio
//  Signature element: an authentic FDA Nutrition Facts panel.
//  Claude (Sonnet 4.6) does the parsing, estimating and inventing.
// ============================================================

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Libre+Franklin:wght@400;500;600;700;800;900&display=swap');
`;

// Standard FDA Daily Values for computing %DV client-side.
const DV = { fat: 78, satFat: 20, cholesterol: 300, sodium: 2300, carbs: 275, fiber: 28, protein: 50, sugar: 50 };
const pct = (val, key) => (val == null ? null : Math.round((val / DV[key]) * 100));

const EXAMPLE = `Garlic Butter Shrimp Pasta (serves 4)

12 oz spaghetti
1 lb shrimp, peeled
4 tbsp butter
4 cloves garlic, minced
1/2 cup parmesan, grated
1/4 cup parsley, chopped
1 lemon, juiced
2 tbsp olive oil
salt and pepper

Cook pasta. Sauté garlic in butter and oil, add shrimp until pink,
toss with pasta, parmesan, lemon and parsley.`;

async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error("request failed");
  const data = await response.json();
  const text = data.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json");
  return JSON.parse(text.slice(start, end + 1));
}

// ---------- The signature: an authentic Nutrition Facts panel ----------
function NutritionLabel({ a }) {
  const s = a.perServing;
  const Row = ({ name, val, unit, dvKey, indent, dvOverride }) => {
    const dv = dvOverride != null ? dvOverride : pct(val, dvKey);
    return (
      <div className={"nf-row" + (indent ? " nf-indent" : "")}>
        <div className="nf-name">
          {!indent && <strong>{name}</strong>}
          {indent && <span>{name}</span>}{" "}
          <span className="nf-amt">
            {val}
            {unit}
          </span>
        </div>
        <div className="nf-dv">{dv != null ? dv + "%" : ""}</div>
      </div>
    );
  };
  return (
    <div className="nf">
      <div className="nf-title">Nutrition Facts</div>
      <div className="nf-thin" />
      <div className="nf-servings">
        {a.servings} servings per recipe
        <div className="nf-serving-size">
          <strong>Serving size</strong>
          <strong>1 serving</strong>
        </div>
      </div>
      <div className="nf-thick" />
      <div className="nf-cal-label">Amount per serving</div>
      <div className="nf-cal">
        <span>Calories</span>
        <span className="nf-cal-num">{s.calories}</span>
      </div>
      <div className="nf-medium" />
      <div className="nf-dv-head">% Daily Value*</div>
      <div className="nf-hair" />
      <Row name="Total Fat" val={s.fat} unit="g" dvKey="fat" />
      <Row name="Saturated Fat" val={s.satFat} unit="g" dvKey="satFat" indent />
      <Row name="Cholesterol" val={s.cholesterol} unit="mg" dvKey="cholesterol" />
      <Row name="Sodium" val={s.sodium} unit="mg" dvKey="sodium" />
      <Row name="Total Carbohydrate" val={s.carbs} unit="g" dvKey="carbs" />
      <Row name="Dietary Fiber" val={s.fiber} unit="g" dvKey="fiber" indent />
      <Row name="Total Sugars" val={s.sugar} unit="g" dvKey="sugar" indent dvOverride={null} />
      <div className="nf-hair" />
      <Row name="Protein" val={s.protein} unit="g" dvKey="protein" />
      <div className="nf-thick" />
      {a.micros &&
        a.micros.map((m, i) => (
          <div className="nf-row nf-micro" key={i}>
            <div className="nf-name">
              {m.n} {m.amt}
            </div>
            <div className="nf-dv">{m.dv}%</div>
          </div>
        ))}
      <div className="nf-thin" />
      <div className="nf-foot">
        * Percent Daily Values are based on a 2,000 calorie diet. Estimated from the recipe text.
      </div>
    </div>
  );
}

function MacroSplit({ s }) {
  const p = s.protein * 4,
    c = s.carbs * 4,
    f = s.fat * 9;
  const tot = Math.max(p + c + f, 1);
  const seg = [
    { label: "Protein", g: s.protein, cal: p, color: "var(--green)" },
    { label: "Carbs", g: s.carbs, cal: c, color: "var(--amber)" },
    { label: "Fat", g: s.fat, cal: f, color: "var(--terra)" },
  ];
  return (
    <div className="macro">
      <div className="macro-bar">
        {seg.map((x, i) => (
          <div key={i} style={{ width: (x.cal / tot) * 100 + "%", background: x.color }} title={x.label} />
        ))}
      </div>
      <div className="macro-legend">
        {seg.map((x, i) => (
          <div className="macro-item" key={i}>
            <span className="macro-dot" style={{ background: x.color }} />
            <span className="macro-l">{x.label}</span>
            <span className="macro-g">{x.g}g</span>
            <span className="macro-p">{Math.round((x.cal / tot) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("analyze");

  // analyze state
  const [recipeText, setRecipeText] = useState("");
  const [servings, setServings] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aErr, setAErr] = useState("");

  // build state
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState("");
  const [diet, setDiet] = useState("");
  const [meal, setMeal] = useState("");
  const [recipe, setRecipe] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [gErr, setGErr] = useState("");

  async function analyze(text, override) {
    const src = text != null ? text : recipeText;
    const ov = override != null ? override : servings;
    if (!src.trim()) {
      setAErr("Paste a recipe first — ingredients and amounts work best.");
      return;
    }
    setAnalyzing(true);
    setAErr("");
    setAnalysis(null);
    try {
      const prompt = `You are a nutrition analysis expert. Estimate nutrition for the recipe below using standard USDA-style food composition data.

Recipe:
"""
${src}
"""

${ov ? `Use ${ov} servings.` : "Infer servings from the recipe; if unclear, choose a sensible default."}

Return ONLY a JSON object (no markdown, no prose) with exactly this shape:
{
 "dish": string,
 "servings": number,
 "perServing": { "calories": number, "protein": number, "carbs": number, "fat": number, "satFat": number, "fiber": number, "sugar": number, "sodium": number, "cholesterol": number },
 "micros": [ { "n": string, "amt": string, "dv": number } ],
 "ingredients": [ { "item": string, "cal": number } ],
 "notes": string,
 "confidence": "low" | "medium" | "high"
}
Rules: grams as numbers (sodium & cholesterol in mg). micros = 4-6 most notable vitamins/minerals with dv as %daily value. ingredients.cal = approx calories for the WHOLE recipe per ingredient. notes = 1-2 plain sentences. Be compact.`;
      const a = await callClaude(prompt);
      setAnalysis(a);
    } catch (e) {
      setAErr("Couldn't read that recipe. Try adding ingredient amounts, then analyze again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function addItem(v) {
    const t = (v || draft).trim().replace(/,$/, "");
    if (t && !items.includes(t)) setItems([...items, t]);
    setDraft("");
  }

  async function generate() {
    if (items.length === 0) {
      setGErr("Add a few ingredients you have on hand first.");
      return;
    }
    setGenerating(true);
    setGErr("");
    setRecipe(null);
    try {
      const prompt = `You are a resourceful, practical home cook. Invent ONE recipe built mainly from the ingredients on hand. Assume basic staples are available (salt, pepper, oil, water, common dried spices). Minimize extra shopping.

On hand: ${items.join(", ")}
${diet ? `Dietary preference: ${diet}.` : ""}
${meal ? `Meal: ${meal}.` : ""}

Return ONLY a JSON object (no markdown) with exactly:
{
 "title": string,
 "description": string,
 "servings": number,
 "prepTime": string,
 "cookTime": string,
 "ingredients": [ string ],
 "instructions": [ string ],
 "usedItems": [ string ],
 "extraNeeded": [ string ]
}
ingredients include quantities. instructions = 4-9 concise steps. Keep it compact.`;
      const r = await callClaude(prompt);
      setRecipe(r);
    } catch (e) {
      setGErr("That combination stumped the kitchen. Try adding or swapping an ingredient.");
    } finally {
      setGenerating(false);
    }
  }

  function sendToAnalyzer() {
    if (!recipe) return;
    const text = `${recipe.title} (serves ${recipe.servings})

Ingredients:
${recipe.ingredients.map((i) => "- " + i).join("\n")}

Instructions:
${recipe.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    setRecipeText(text);
    setServings(String(recipe.servings || ""));
    setMode("analyze");
    setAnalysis(null);
    analyze(text, String(recipe.servings || ""));
  }

  return (
    <div className="wrap">
      <style>{FONTS + CSS}</style>

      <header className="hd">
        <div className="hd-mark">▦</div>
        <div>
          <h1 className="hd-name">Mise</h1>
          <p className="hd-sub">Read the nutrition in any recipe — or cook from what's in the fridge.</p>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "analyze"}
          className={"tab" + (mode === "analyze" ? " on" : "")}
          onClick={() => setMode("analyze")}
        >
          Analyze a recipe
        </button>
        <button
          role="tab"
          aria-selected={mode === "build"}
          className={"tab" + (mode === "build" ? " on" : "")}
          onClick={() => setMode("build")}
        >
          Cook from what I have
        </button>
      </div>

      {mode === "analyze" && (
        <div className="grid">
          <section className="panel">
            <label className="lbl" htmlFor="recipe">
              Paste a recipe
            </label>
            <textarea
              id="recipe"
              className="ta"
              placeholder="Paste ingredients and steps here. Amounts (1 cup, 200g, 2 tbsp) make the estimate sharper."
              value={recipeText}
              onChange={(e) => setRecipeText(e.target.value)}
            />
            <div className="row">
              <div className="serv">
                <label className="lbl sm" htmlFor="serv">
                  Servings
                </label>
                <input
                  id="serv"
                  className="num"
                  inputMode="numeric"
                  placeholder="auto"
                  value={servings}
                  onChange={(e) => setServings(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
              <button
                className="ghost"
                onClick={() => {
                  setRecipeText(EXAMPLE);
                  setServings("4");
                }}
              >
                Try an example
              </button>
            </div>
            <button className="cta" onClick={() => analyze()} disabled={analyzing}>
              {analyzing ? "Reading the recipe…" : "Get nutrition facts"}
            </button>
            {aErr && <p className="err">{aErr}</p>}
          </section>

          <section className="result">
            {!analysis && !analyzing && (
              <div className="empty">
                <div className="empty-mark">▦</div>
                <p>Your nutrition label appears here, the moment you analyze a recipe.</p>
              </div>
            )}
            {analyzing && <div className="empty pulse">Estimating calories and nutrients…</div>}
            {analysis && (
              <div className="result-in">
                <div className="dish">
                  <h2>{analysis.dish}</h2>
                  <span className={"conf conf-" + analysis.confidence}>{analysis.confidence} confidence</span>
                </div>
                <MacroSplit s={analysis.perServing} />
                <NutritionLabel a={analysis} />
                {analysis.notes && <p className="notes">{analysis.notes}</p>}
                {analysis.ingredients && analysis.ingredients.length > 0 && (
                  <details className="break">
                    <summary>Where the calories come from (whole recipe)</summary>
                    <ul>
                      {analysis.ingredients
                        .slice()
                        .sort((a, b) => b.cal - a.cal)
                        .map((ing, i) => (
                          <li key={i}>
                            <span>{ing.item}</span>
                            <span className="ingcal">{ing.cal} cal</span>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {mode === "build" && (
        <div className="grid">
          <section className="panel">
            <label className="lbl" htmlFor="item">
              What's in the fridge & pantry?
            </label>
            <div className="chipbox">
              {items.map((it, i) => (
                <span className="chip" key={i}>
                  {it}
                  <button aria-label={"remove " + it} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </span>
              ))}
              <input
                id="item"
                className="chip-input"
                placeholder={items.length ? "add another…" : "e.g. eggs, spinach, feta, tomatoes…"}
                value={draft}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.endsWith(",")) addItem(v);
                  else setDraft(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                  if (e.key === "Backspace" && !draft && items.length) setItems(items.slice(0, -1));
                }}
              />
            </div>
            <div className="prefs">
              <div className="pref">
                <label className="lbl sm">Diet</label>
                <select className="sel" value={diet} onChange={(e) => setDiet(e.target.value)}>
                  <option value="">any</option>
                  <option>vegetarian</option>
                  <option>vegan</option>
                  <option>high-protein</option>
                  <option>low-carb</option>
                  <option>gluten-free</option>
                </select>
              </div>
              <div className="pref">
                <label className="lbl sm">Meal</label>
                <select className="sel" value={meal} onChange={(e) => setMeal(e.target.value)}>
                  <option value="">any</option>
                  <option>breakfast</option>
                  <option>lunch</option>
                  <option>dinner</option>
                  <option>snack</option>
                </select>
              </div>
            </div>
            <button className="cta" onClick={generate} disabled={generating}>
              {generating ? "Inventing a recipe…" : "Make me a recipe"}
            </button>
            {gErr && <p className="err">{gErr}</p>}
          </section>

          <section className="result">
            {!recipe && !generating && (
              <div className="empty">
                <div className="empty-mark">✦</div>
                <p>List a handful of ingredients and a recipe shows up here, ready to cook.</p>
              </div>
            )}
            {generating && <div className="empty pulse">Working out what you can make…</div>}
            {recipe && (
              <div className="recipe">
                <h2 className="rc-title">{recipe.title}</h2>
                <p className="rc-desc">{recipe.description}</p>
                <div className="rc-meta">
                  <span>
                    <b>{recipe.servings}</b> servings
                  </span>
                  <span>
                    <b>{recipe.prepTime}</b> prep
                  </span>
                  <span>
                    <b>{recipe.cookTime}</b> cook
                  </span>
                </div>
                <h3 className="rc-h">Ingredients</h3>
                <ul className="rc-ing">
                  {recipe.ingredients.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
                {recipe.extraNeeded && recipe.extraNeeded.length > 0 && (
                  <p className="rc-extra">
                    You'll also want: {recipe.extraNeeded.join(", ")}
                  </p>
                )}
                <h3 className="rc-h">Method</h3>
                <ol className="rc-steps">
                  {recipe.instructions.map((s, k) => (
                    <li key={k}>
                      <span className="rc-num">{k + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                <button className="cta solid" onClick={sendToAnalyzer}>
                  Get nutrition facts for this →
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="ft">Estimates are approximate and meant for everyday guidance, not medical or clinical use.</footer>
    </div>
  );
}

const CSS = `
:root{
  --paper:#FBF9F4; --card:#FFFFFF; --ink:#1C1B18; --muted:#6B655A;
  --green:#2E6B43; --green-soft:#E8F0E7; --terra:#C5512C; --amber:#D89B2C;
  --line:#E6E0D4; --rule:#1C1B18;
}
*{box-sizing:border-box}
.wrap{
  font-family:'Libre Franklin',system-ui,sans-serif;
  background:var(--paper); color:var(--ink);
  min-height:100%; padding:28px 20px 48px; max-width:1040px; margin:0 auto;
  -webkit-font-smoothing:antialiased;
}
.hd{display:flex;align-items:center;gap:14px;margin-bottom:22px}
.hd-mark{
  font-size:30px;line-height:1;color:var(--green);
  border:2px solid var(--green);border-radius:10px;width:48px;height:48px;
  display:flex;align-items:center;justify-content:center;flex:none;
}
.hd-name{font-family:'Fraunces',serif;font-weight:600;font-size:34px;margin:0;letter-spacing:-0.5px}
.hd-sub{margin:2px 0 0;color:var(--muted);font-size:14.5px;max-width:46ch}

.tabs{display:flex;gap:6px;background:#F0EBE0;padding:5px;border-radius:12px;width:fit-content;margin-bottom:22px}
.tab{
  border:0;background:transparent;font-family:inherit;font-weight:600;font-size:14px;
  color:var(--muted);padding:9px 16px;border-radius:8px;cursor:pointer;transition:.15s;
}
.tab.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.tab:focus-visible{outline:2px solid var(--green);outline-offset:2px}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
@media(max-width:760px){.grid{grid-template-columns:1fr}}

.panel,.result{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px}
.result{min-height:300px}

.lbl{display:block;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.lbl.sm{margin-bottom:6px}
.ta{
  width:100%;min-height:230px;resize:vertical;border:1.5px solid var(--line);border-radius:12px;
  padding:14px;font-family:inherit;font-size:14.5px;line-height:1.55;color:var(--ink);background:#FCFBF8;
}
.ta:focus{outline:none;border-color:var(--green)}
.row{display:flex;align-items:flex-end;gap:14px;margin:14px 0}
.serv{flex:none}
.num{width:84px;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:15px;background:#FCFBF8}
.num:focus,.sel:focus,.chip-input:focus{outline:none;border-color:var(--green)}
.ghost{
  margin-left:auto;border:1.5px solid var(--line);background:transparent;border-radius:10px;
  padding:10px 14px;font-family:inherit;font-weight:600;font-size:13.5px;color:var(--ink);cursor:pointer;
}
.ghost:hover{border-color:var(--green);color:var(--green)}

.cta{
  width:100%;border:0;border-radius:12px;background:var(--green);color:#fff;
  font-family:inherit;font-weight:700;font-size:15px;padding:14px;cursor:pointer;transition:.15s;
}
.cta:hover{background:#255736}
.cta:disabled{opacity:.6;cursor:default}
.cta:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.cta.solid{background:var(--ink);margin-top:20px}
.cta.solid:hover{background:#000}

.err{color:var(--terra);font-size:13.5px;margin:12px 0 0;font-weight:500}

.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--muted);height:100%;min-height:256px;padding:20px;font-size:14.5px;line-height:1.5}
.empty p{max-width:30ch;margin:12px 0 0}
.empty-mark{font-size:40px;color:var(--line)}
.pulse{animation:pul 1.3s ease-in-out infinite;font-weight:600;color:var(--green)}
@keyframes pul{0%,100%{opacity:.5}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.pulse{animation:none;opacity:1}}

.dish{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:16px}
.dish h2{font-family:'Fraunces',serif;font-weight:600;font-size:22px;margin:0;letter-spacing:-0.3px}
.conf{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:4px 8px;border-radius:20px;white-space:nowrap;flex:none}
.conf-high{background:var(--green-soft);color:var(--green)}
.conf-medium{background:#FBF1DC;color:#9A6B12}
.conf-low{background:#F7E3DB;color:var(--terra)}

.macro{margin-bottom:20px}
.macro-bar{display:flex;height:13px;border-radius:7px;overflow:hidden;background:var(--line)}
.macro-bar>div{transition:width .4s}
.macro-legend{display:flex;gap:18px;margin-top:12px;flex-wrap:wrap}
.macro-item{display:flex;align-items:center;gap:6px;font-size:13px}
.macro-dot{width:10px;height:10px;border-radius:3px;flex:none}
.macro-l{color:var(--muted);font-weight:600}
.macro-g{font-weight:700}
.macro-p{color:var(--muted)}

/* ---- Nutrition Facts signature ---- */
.nf{border:1px solid var(--rule);background:#fff;padding:7px 10px;font-family:'Libre Franklin',sans-serif;max-width:340px}
.nf-title{font-weight:900;font-size:29px;letter-spacing:-1px;line-height:1.05}
.nf-thin{border-bottom:1px solid var(--rule);margin:2px 0}
.nf-thick{border-bottom:9px solid var(--rule);margin:3px 0}
.nf-medium{border-bottom:5px solid var(--rule);margin:3px 0}
.nf-hair{border-bottom:1px solid #9b968c;margin:0}
.nf-servings{font-size:12px}
.nf-serving-size{display:flex;justify-content:space-between;font-size:13px;margin-top:3px}
.nf-cal-label{font-size:11px;font-weight:700;margin-top:4px}
.nf-cal{display:flex;align-items:baseline;justify-content:space-between;font-weight:900;font-size:20px}
.nf-cal-num{font-size:38px;letter-spacing:-1px}
.nf-dv-head{text-align:right;font-size:11px;font-weight:700;padding:2px 0}
.nf-row{display:flex;justify-content:space-between;font-size:13px;padding:2px 0;border-bottom:1px solid #c9c4ba}
.nf-row:last-of-type{border-bottom:0}
.nf-indent{padding-left:16px}
.nf-amt{font-weight:400}
.nf-dv{font-weight:700}
.nf-micro{font-size:12.5px}
.nf-foot{font-size:9.5px;color:#555;line-height:1.3;margin-top:5px}

.notes{font-size:14px;line-height:1.55;color:var(--ink);background:var(--green-soft);border-radius:10px;padding:12px 14px;margin:18px 0 0}
.break{margin-top:16px;font-size:13.5px}
.break summary{cursor:pointer;font-weight:700;color:var(--green)}
.break ul{list-style:none;padding:0;margin:12px 0 0}
.break li{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line)}
.ingcal{color:var(--muted);font-variant-numeric:tabular-nums}

/* ---- build mode ---- */
.chipbox{display:flex;flex-wrap:wrap;gap:8px;border:1.5px solid var(--line);border-radius:12px;padding:11px;background:#FCFBF8;min-height:120px;align-content:flex-start}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--green-soft);color:var(--green);font-weight:600;font-size:13.5px;padding:5px 6px 5px 11px;border-radius:20px}
.chip button{border:0;background:rgba(46,107,67,.18);color:var(--green);width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center}
.chip-input{flex:1;min-width:140px;border:0;background:transparent;font-family:inherit;font-size:14.5px;padding:5px}
.chip-input:focus{outline:none}
.prefs{display:flex;gap:14px;margin:16px 0}
.pref{flex:1}
.sel{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14.5px;background:#FCFBF8;cursor:pointer}

.recipe h2.rc-title{font-family:'Fraunces',serif;font-weight:600;font-size:25px;margin:0;letter-spacing:-0.3px}
.rc-desc{color:var(--muted);font-size:14.5px;line-height:1.55;margin:8px 0 0}
.rc-meta{display:flex;gap:18px;margin:16px 0;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:13px;color:var(--muted)}
.rc-meta b{color:var(--ink);font-weight:700}
.rc-h{font-family:'Libre Franklin';font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--green);margin:18px 0 10px}
.rc-ing{margin:0;padding-left:18px;font-size:14.5px;line-height:1.7}
.rc-extra{font-size:13px;color:var(--muted);background:#FBF1DC;padding:9px 12px;border-radius:9px;margin:12px 0 0}
.rc-steps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px}
.rc-steps li{display:flex;gap:12px;font-size:14.5px;line-height:1.55}
.rc-num{flex:none;width:24px;height:24px;border-radius:50%;background:var(--green);color:#fff;font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center;font-family:'Libre Franklin'}

.ft{text-align:center;color:var(--muted);font-size:12px;margin-top:30px;line-height:1.5}
`;

const $ = (id) => document.getElementById(id);

let recept = [];
const state = { sok: "", baraVanliga: false, uteslut: new Set(), uteslutSok: "" };

/* ---------------------------------------------------------------- lage --- */

// Gastlaget ar den publicerade kopian pa GitHub Pages. Den har ingen server:
// inga recept kan laggas till, andras eller tas bort, och samlingen kommer ur
// en vanlig fil bredvid sidan. Exporten i server.py satter data-lage="gast"
// pa <body>, och style.css doljer agarens knappar utifran det.
const GAST = document.body.dataset.lage === "gast";

// Titeln gar inte att byta med CSS. Gastformuleringen star pa
// <title data-gast="..."> i index.html, sa all text bor pa samma stalle.
if (GAST) document.title = document.querySelector("title").dataset.gast;

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Bildadresserna i datan ar rotabsoluta (/bilder/x.jpg). Pa en publicerad
// kopia kan sajten ligga i en undermapp, och da pekar / fel. Relativa
// adresser traffar ratt bade dar och pa localhost.
const bildvag = (v) => String(v || "").replace(/^\//, "");

const tid = (min) => !min ? "" : min < 60 ? `${min} min`
  : min % 60 === 0 ? `${min / 60} h` : `${Math.floor(min / 60)} h ${min % 60} min`;

const alla = (r) => (r.ingredients || []).flatMap((g) => g.items || []);

// "citron, finrivet skal" -> "citron", "biscoffkräm (halv burk)" -> "biscoffkräm"
const etikett = (namn) => namn
  .replace(/\([^)]*\)/g, " ")   // parenteser bort först, annars klipps de mitt itu
  .split(",")[0]
  .split(" eller ")[0]
  .replace(/\s+/g, " ")
  .trim() || namn;

// Knappens text är inte samma sträng som filtret använder: knappen heter "jäst",
// filtret matchar på "jast". Jämför därför alltid i prickfri form.
const utanPrickar = (s) => s.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o");

/* ------------------------------------------------------------ hamta data --- */

async function ladda() {
  try {
    // Gastkopian har ingen server - da ligger samlingen som en fil bredvid
    // sidan. no-cache = anvand garna cachen, men fraga alltid om den ar
    // aktuell, annars kan en gast se gamla recept efter en publicering.
    const svar = GAST
      ? await fetch("recipes.json", { cache: "no-cache" })
      : await fetch("/api/recipes");
    const data = await svar.json();
    // Viktigt: svarar servern med fel far vi ALDRIG visa en tom samling -
    // det ser ut som att alla recept ar borta, och nasta tillagg hade
    // skrivit over dem. Visa problemet i stallet.
    if (!svar.ok || !Array.isArray(data)) {
      throw new Error(data.error || "Kunde inte läsa receptsamlingen.");
    }
    recept = data;
    ritaFilter();
    rita();
  } catch (fel) {
    $("rutnat").innerHTML = "";
    $("antal").textContent = "";
    $("tomt").hidden = false;
    // Gasten far aldrig se fel.message: saknas recipes.json svarar GitHub med
    // en HTML-sida, och meddelandet blir det obegripliga "Unexpected token '<'".
    $("tomt").textContent = GAST
      ? "Recepten kunde inte hämtas just nu. Prova att ladda om sidan om en stund."
      : "Kunde inte ladda samlingen: " + fel.message +
        " Recepten ligger kvar på disken – ladda om sidan, och titta i mappen backups/ om problemet står kvar.";
  }
}

/* --------------------------------------------------------------- filtret --- */

function passar(r) {
  const ing = alla(r);

  if (state.sok) {
    const hoe = [r.title, r.summary, r.notes || "", (r.tags || []).join(" "),
                 ing.map((i) => i.name).join(" ")].join(" ").toLowerCase();
    if (!state.sok.split(/\s+/).every((ord) => hoe.includes(ord))) return false;
  }
  if (state.baraVanliga && ing.some((i) => i.common === false)) return false;
  for (const key of state.uteslut) if (ing.some((i) => i.key === key)) return false;
  return true;
}

function ritaFilter() {
  const ovanliga = new Map();
  for (const r of recept) {
    for (const i of alla(r)) {
      if (i.common === false && i.key) {
        const namn = etikett(i.name);
        if (!ovanliga.has(i.key)) ovanliga.set(i.key, { namn, key: i.key, alla: "" });
        const post = ovanliga.get(i.key);
        // kortaste namnet blir etikett: "citron" hellre än "2 ekologiska citroner"
        if (namn.length < post.namn.length) post.namn = namn;
        post.alla += " " + i.name;
      }
    }
  }

  $("uteslut-grupp").hidden = ovanliga.size === 0;
  if (!ovanliga.size) return;

  // Ivalda knappar visas alltid – annars gick de inte att klicka bort igen
  // när sökrutan tömts.
  const sok = utanPrickar(state.uteslutSok.trim());
  const traffar = [...ovanliga.values()]
    .filter((o) => state.uteslut.has(o.key) ||
      (sok && utanPrickar(`${o.namn} ${o.key} ${o.alla}`).includes(sok)))
    .sort((a, b) => a.namn.localeCompare(b.namn, "sv"));

  $("uteslut").innerHTML = traffar.length
    ? traffar.map((o) => `<button type="button" class="chip" data-uteslut="${esc(o.key)}"
        aria-pressed="${state.uteslut.has(o.key)}">${esc(o.namn)}</button>`).join("")
    : `<p class="filter-hjalp">${sok
        ? `Ingen ingrediens matchar ”${esc(state.uteslutSok.trim())}”.`
        : "Sök på en ingrediens för att gömma recept med den."}</p>`;
}

/* ----------------------------------------------------------------- kort --- */

function bild(r, klass) {
  return r.image
    ? `<img class="${klass}" src="${esc(bildvag(r.image))}" alt="${esc(r.title)}" loading="lazy"
         referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),
         {className:'${klass}-tom',textContent:'🧁'}))">`
    : `<div class="${klass}-tom">🧁</div>`;
}

// "Rensa filter" visas bara nar det finns nagot att rensa - annars star det
// bara och tar plats langst ner i sidokolumnen.
function filterAktivt() {
  return Boolean(state.sok || state.baraVanliga || state.uteslutSok || state.uteslut.size);
}

function rita() {
  const traffar = recept.filter(passar);
  $("rensa").hidden = !filterAktivt();

  $("antal").textContent = recept.length === 0 ? ""
    : traffar.length === recept.length
      ? `${recept.length} recept i samlingen`
      : `${traffar.length} av ${recept.length} recept matchar`;

  $("rutnat").innerHTML = traffar.map((r) => `
    <button type="button" class="kort" data-id="${esc(r.id)}">
      ${bild(r, "kort-bild")}
      <span class="kort-text">
        <span class="kort-titel">${esc(r.title)}</span>
        <span class="kort-summering">${esc(r.summary)}</span>
        <span class="kort-meta">
          ${r.totalTimeMinutes ? `<span>⏱ ${tid(r.totalTimeMinutes)}</span>` : ""}
          ${r.servings ? `<span>🍽 ${esc(r.servings)}</span>` : ""}
          ${r.notes ? `<span class="kort-anteckning" title="${GAST ? "Johanna har en anteckning" : "Du har en anteckning"}">✎</span>` : ""}
        </span>
      </span>
    </button>`).join("");

  $("tomt").hidden = traffar.length > 0;
  $("tomt").textContent = recept.length === 0
    ? (GAST ? "Här finns inga recept ännu."
            : "Inga recept än – klistra in en länk längst upp så fixar AI:n resten.")
    : "Inget recept matchar filtren. Prova att rensa något.";
}

/* --------------------------------------------------------- receptdokument --- */

let oppetId = null;
let redigerar = false;

function visa(id) {
  const r = recept.find((x) => x.id === id);
  if (!r) return;
  oppetId = id;
  redigerar = false;
  lageKnappar();
  redStatus("");

  const fakta = [
    ["Portioner", r.servings],
    ["Tid", tid(r.totalTimeMinutes)],
    ["Varav arbete", tid(r.activeTimeMinutes)],
    ["Ugn", r.oven],
    ["Svårighet", r.difficulty],
  ].filter(([, v]) => v);

  $("dokument").innerHTML = `
    ${r.image ? bild(r, "dok-bild") : ""}
    ${r.imageIsDrawing ? `<p class="bild-notis">Illustration ritad av AI:n – källan hade ingen bild</p>` : ""}
    <div class="dok-inre">
      <p class="dok-kalla">${r.sourceUrl
        ? `Från <a href="${esc(r.sourceUrl)}" target="_blank" rel="noreferrer">${esc(r.sourceName)}</a>`
        : "Inklistrat recept"}</p>
      <h1>${esc(r.title)}</h1>
      ${r.summary ? `<p class="dok-summering">${esc(r.summary)}</p>` : ""}

      <dl class="dok-fakta">
        ${fakta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
      </dl>

      ${r.notes ? `<div class="anteckning">
        <h3 class="anteckning-rubrik">${GAST ? "Johannas anteckningar" : "Mina anteckningar"}</h3>
        <p>${esc(r.notes)}</p>
      </div>` : ""}

      <div class="dok-kolumner">
        <section>
          <h3 class="dok-rubrik">Ingredienser</h3>
          ${(r.ingredients || []).map((g) => `
            <div class="ing-grupp">
              ${g.group ? `<h4>${esc(g.group)}</h4>` : ""}
              <ul class="ing-lista">
                ${(g.items || []).map((i) => `<li>
                  <span class="ing-mangd">${esc(i.amount)}</span>
                  <span>${esc(i.name)}${i.common === false
                    ? ` <span class="ing-ovanlig" title="Specialvara – inte alltid hemma">●</span>` : ""}</span>
                </li>`).join("")}
              </ul>
            </div>`).join("")}
        </section>
        <section>
          <h3 class="dok-rubrik">Gör så här</h3>
          ${r.stepsFromSource === false ? `<p class="steg-notis">Källan listade bara
            ingredienserna – stegen nedan är AI:ns förslag, inte hämtade från inlägget.</p>` : ""}
          <ol class="steg">${(r.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        </section>
      </div>
    </div>
    ${r.tips ? `<p class="tips"><strong>Tips:</strong> ${esc(r.tips)}</p>` : ""}`;

  $("overlay").hidden = false;
  $("overlay").scrollTop = 0;
  document.body.style.overflow = "hidden";
}

function stang() {
  $("overlay").hidden = true;
  oppetId = null;
  redigerar = false;
  lageKnappar();
  redStatus("");
  document.body.style.overflow = "";
}

// Stanger, men fragar forst om du star mitt i en oavslutad andring.
function stangTryggt() {
  if (redigerar && !confirm("Du har ändringar som inte är sparade. Stänga ändå?")) return;
  stang();
}

/* -------------------------------------------------------------- redigera --- */

const SVARIGHETER = ["", "Lätt", "Medel", "Avancerad"];

function redStatus(text, typ) {
  const el = $("red-status");
  el.hidden = !text;
  el.textContent = text;
  el.className = "status" + (typ ? " " + typ : "");
}

// Vilka knappar som syns beror pa om du laser eller andrar.
function lageKnappar() {
  for (const id of ["andra", "skriv-ut", "ta-bort", "stang"]) $(id).hidden = redigerar;
  for (const id of ["spara", "avbryt"]) $(id).hidden = !redigerar;
}

function falt(id, etikett, varde, extra = "") {
  return `<label class="red-falt"><span>${etikett}</span>
    <input id="${id}" type="text" value="${esc(varde)}" ${extra}></label>`;
}

function ingRad(i) {
  // data-key foljer med sa lange namnet ar orort. Andrar du namnet tas den
  // bort, och servern raknar ut en ny nyckel sa filtren fortsatter stamma.
  return `<div class="red-ing"${i.key ? ` data-key="${esc(i.key)}"` : ""}>
    <button type="button" class="red-dra" aria-label="Flytta raden"
            title="Dra för att flytta raden – eller använd piltangenterna">⠿</button>
    <input class="red-mangd" type="text" value="${esc(i.amount)}" placeholder="mängd" aria-label="Mängd">
    <input class="red-namn" type="text" value="${esc(i.name)}" placeholder="ingrediens" aria-label="Ingrediens">
    <label class="red-hemma" title="Bocka ur för sånt du måste handla särskilt – det styr filtren">
      <input type="checkbox"${i.common === false ? "" : " checked"}><span>har hemma</span>
    </label>
    <button type="button" class="red-bort" title="Ta bort raden" aria-label="Ta bort raden">×</button>
  </div>`;
}

function ingGrupp(g) {
  return `<div class="red-grupp">
    <input class="red-gruppnamn" type="text" value="${esc(g.group || "")}"
      placeholder="Gruppens namn, t.ex. Fyllning – kan lämnas tom" aria-label="Gruppens namn">
    <div class="red-rader">${(g.items || []).map(ingRad).join("")}</div>
    <button type="button" class="text-lank red-ny-rad">+ ingrediens</button>
  </div>`;
}

function redigera() {
  if (GAST) return;   // gastlaget har ingen server att spara till
  const r = recept.find((x) => x.id === oppetId);
  if (!r) return;
  redigerar = true;
  lageKnappar();
  redStatus("");

  const val = SVARIGHETER.includes(r.difficulty) ? SVARIGHETER : [...SVARIGHETER, r.difficulty];
  const grupper = (r.ingredients || []).length ? r.ingredients : [{ group: "", items: [] }];

  $("dokument").innerHTML = `
    <div class="dok-inre red">
      <h2 class="red-rubrik">Ändra receptet</h2>

      ${falt("red-titel", "Namn", r.title)}
      <label class="red-falt"><span>Kort beskrivning</span>
        <textarea id="red-summering" rows="2">${esc(r.summary)}</textarea></label>

      <div class="red-rutnat">
        ${falt("red-portioner", "Portioner", r.servings)}
        ${falt("red-ugn", "Ugn", r.oven)}
        ${falt("red-tid", "Tid totalt (minuter)", r.totalTimeMinutes || "", 'inputmode="numeric"')}
        ${falt("red-arbete", "Varav arbete (minuter)", r.activeTimeMinutes || "", 'inputmode="numeric"')}
        <label class="red-falt"><span>Svårighet</span>
          <select id="red-svarighet">${val.map((v) =>
            `<option value="${esc(v)}"${v === r.difficulty ? " selected" : ""}>${esc(v || "– ingen –")}</option>`).join("")}
          </select></label>
      </div>

      ${falt("red-taggar", "Etiketter, separerade med komma", (r.tags || []).join(", "))}

      <h3 class="dok-rubrik">Ingredienser</h3>
      <p class="red-hjalp">Bocka ur <em>har hemma</em> för sånt du måste handla särskilt –
        det är den bocken filtret ”Har inte hemma” använder.
        Dra i <span class="red-dra-exempel">⠿</span> för att flytta en ingrediens.</p>
      <div id="red-grupper">${grupper.map(ingGrupp).join("")}</div>
      <button type="button" class="text-lank" id="red-ny-grupp">+ lägg till en grupp, t.ex. Fyllning</button>

      <h3 class="dok-rubrik">Gör så här</h3>
      <p class="red-hjalp">Ett steg per rad. Tomma rader hoppas över.</p>
      <textarea id="red-steg" rows="${Math.max(6, (r.steps || []).length + 1)}"
        >${esc((r.steps || []).join("\n"))}</textarea>

      <label class="red-falt"><span>Tips</span>
        <textarea id="red-tips" rows="2">${esc(r.tips)}</textarea></label>

      <h3 class="dok-rubrik">Mina anteckningar</h3>
      <p class="red-hjalp">Dina egna ord om receptet – vad du ändrade, hur det blev,
        vad du vill göra annorlunda nästa gång. AI:n rör aldrig det här fältet,
        och du kan söka i det.</p>
      <textarea id="red-anteckningar" rows="4"
        placeholder="T.ex. Halverade sockret – blev perfekt. Funkar med frysta hallon."
        >${esc(r.notes)}</textarea>
    </div>`;

  $("overlay").scrollTop = 0;
  $("red-titel").focus();
}

function lasFormular() {
  const grupper = [...$("dokument").querySelectorAll(".red-grupp")].map((gEl) => ({
    group: gEl.querySelector(".red-gruppnamn").value.trim(),
    items: [...gEl.querySelectorAll(".red-ing")].map((rad) => {
      const post = {
        amount: rad.querySelector(".red-mangd").value.trim(),
        name: rad.querySelector(".red-namn").value.trim(),
        common: rad.querySelector("input[type=checkbox]").checked,
      };
      if (rad.dataset.key) post.key = rad.dataset.key;
      return post;
    }).filter((i) => i.name),
  })).filter((g) => g.items.length);

  return {
    title: $("red-titel").value.trim(),
    summary: $("red-summering").value.trim(),
    servings: $("red-portioner").value.trim(),
    totalTimeMinutes: parseInt($("red-tid").value, 10) || 0,
    activeTimeMinutes: parseInt($("red-arbete").value, 10) || 0,
    oven: $("red-ugn").value.trim(),
    difficulty: $("red-svarighet").value,
    tags: $("red-taggar").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    ingredients: grupper,
    steps: $("red-steg").value.split("\n").map((s) => s.trim()).filter(Boolean),
    tips: $("red-tips").value.trim(),
    notes: $("red-anteckningar").value.trim(),
  };
}

async function sparaAndringar() {
  if (GAST) return;
  const kropp = lasFormular();
  if (!kropp.title) return redStatus("Receptet behöver ett namn.", "fel");
  if (!kropp.ingredients.length) return redStatus("Receptet behöver minst en ingrediens.", "fel");

  $("spara").disabled = true;
  redStatus("Sparar …", "jobbar");
  try {
    const svar = await fetch("/api/recipes/" + oppetId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kropp),
    });
    const data = await svar.json();
    if (!svar.ok) throw new Error(data.error || "Kunde inte spara");
    const plats = recept.findIndex((r) => r.id === data.id);
    if (plats !== -1) recept[plats] = data;
    visa(data.id);            // tillbaka till lasvyn med det nya innehallet
    ritaFilter();
    rita();
    delningSnart();
  } catch (fel) {
    redStatus(fel.message, "fel");
  } finally {
    $("spara").disabled = false;
  }
}

/* ------------------------------------------------------------ lagga till --- */

let nedrakning = null;

function startaNedrakning(sekunder) {
  stoppaNedrakning();
  let kvar = sekunder;
  const visa = () => {
    status(kvar > 0
      ? `Ser mumsigt ut! Sparar receptet – ${kvar} sekunder återstår`
      : "Ser mumsigt ut! Sparar receptet – snart klart …", "jobbar");
    kvar--;
  };
  visa();
  nedrakning = setInterval(visa, 1000);
}

function stoppaNedrakning() {
  clearInterval(nedrakning);
  nedrakning = null;
}

function status(text, typ) {
  const el = $("status");
  el.hidden = !text;
  el.textContent = text;
  el.className = "status" + (typ ? " " + typ : "");
}

async function laggTill(body, knapp) {
  if (GAST) return;
  knapp.disabled = true;
  // fotot kräver två AI-anrop, ett för avläsningen och ett för illustrationen
  startaNedrakning(body.photo ? 65 : 30);
  try {
    const svar = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await svar.json();
    if (!svar.ok) throw new Error(data.error || "Något gick fel");
    stoppaNedrakning();
    recept.unshift(data);
    ritaFilter();
    rita();
    status(`Klart! ”${data.title}” ligger nu i samlingen.`);
    delningSnart();
    $("lank").value = "";
    $("text").value = "";
    visa(data.id);
  } catch (fel) {
    stoppaNedrakning();
    status(fel.message, "fel");
  } finally {
    stoppaNedrakning();
    knapp.disabled = false;
  }
}

/* -------------------------------------------------------------- handelser --- */

$("lank-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = $("lank").value.trim();
  if (url) laggTill({ url }, $("hamta-knapp"));
});

$("vaxla-text").addEventListener("click", () => {
  const oppen = $("text-ruta").hidden;
  $("text-ruta").hidden = !oppen;
  $("vaxla-text").setAttribute("aria-expanded", oppen);
  if (oppen) $("text").focus();
});

$("text-knapp").addEventListener("click", () => {
  const text = $("text").value.trim();
  if (text.length < 40) return status("Klistra in lite mer text än så.", "fel");
  laggTill({ text }, $("text-knapp"));
});

$("valj-foto").addEventListener("click", () => $("foto").click());

$("foto").addEventListener("change", (e) => {
  const fil = e.target.files[0];
  if (!fil) return;
  if (fil.size > 12 * 1024 * 1024) {
    return status("Bilden är för stor – max 12 MB. Minska den och försök igen.", "fel");
  }
  const lasare = new FileReader();
  lasare.onload = () => laggTill({ photo: lasare.result }, $("valj-foto"));
  lasare.onerror = () => status("Kunde inte läsa bildfilen.", "fel");
  lasare.readAsDataURL(fil);
  e.target.value = "";
});

$("sok").addEventListener("input", (e) => { state.sok = e.target.value.trim().toLowerCase(); rita(); });
$("bara-vanliga").addEventListener("change", (e) => { state.baraVanliga = e.target.checked; rita(); });

$("uteslut-sok").addEventListener("input", (e) => {
  state.uteslutSok = e.target.value;
  ritaFilter();
  rita();
});

$("uteslut").addEventListener("click", (e) => {
  const knapp = e.target.closest("[data-uteslut]");
  if (!knapp) return;
  const key = knapp.dataset.uteslut;
  state.uteslut.has(key) ? state.uteslut.delete(key) : state.uteslut.add(key);
  ritaFilter();   // en bortklickad knapp ska försvinna om den inte matchar söket
  rita();
});

$("rensa").addEventListener("click", () => {
  state.sok = ""; state.baraVanliga = false;
  state.uteslutSok = ""; state.uteslut.clear();
  $("sok").value = ""; $("uteslut-sok").value = ""; $("bara-vanliga").checked = false;
  ritaFilter();
  rita();
});

$("rutnat").addEventListener("click", (e) => {
  const kort = e.target.closest("[data-id]");
  if (kort) visa(kort.dataset.id);
});

$("stang").addEventListener("click", stangTryggt);
$("skriv-ut").addEventListener("click", () => window.print());

$("overlay").addEventListener("click", (e) => { if (e.target === $("overlay")) stangTryggt(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("overlay").hidden) stangTryggt();
});

/* ------------------------------------------------- flytta ingredienser --- */

// Dra i handtaget for att flytta en ingrediens. Raden byter helt enkelt plats
// med den den dras forbi, sa DOM-ordningen ar hela tiden den sanna ordningen -
// lasFormular() laser den rakt av och behover inte veta nagot om det har.
//
// En rad stannar i sin egen grupp: vi flyttar bara bland syskonen i samma
// .red-rader, aldrig over en gruppgrans.
let dragRad = null;

function flyttaTill(rad, index) {
  const behallare = rad.parentElement;
  const rader = [...behallare.children];
  const mal = Math.max(0, Math.min(rader.length - 1, index));
  if (rader[mal] === rad) return;
  behallare.insertBefore(rad, mal < rader.indexOf(rad) ? rader[mal] : rader[mal].nextSibling);
}

$("dokument").addEventListener("pointerdown", (e) => {
  const handtag = e.target.closest(".red-dra");
  if (!handtag) return;
  dragRad = handtag.closest(".red-ing");
  dragRad.classList.add("dras");
  // Greppet MASTE sitta pa #dokument och inte pa handtaget: att flytta raden
  // ar for webblasaren att plocka bort och satta tillbaka den, och da slapper
  // den greppet om nagot inuti raden. Da gick det bara att flytta ett steg.
  // #dokument star still hela tiden.
  $("dokument").setPointerCapture(e.pointerId);
  e.preventDefault();          // annars markeras text i stallet for att dra
  handtag.focus();             // preventDefault ovan skulle annars ata fokus
});

$("dokument").addEventListener("pointermove", (e) => {
  if (!dragRad) return;
  const rader = [...dragRad.parentElement.children];
  const jag = rader.indexOf(dragRad);
  // Leta upp den bortersta raden pekaren hunnit forbi, inte den narmaste -
  // annars flyttar sig raden bara ett steg per handelse och hanger efter
  // handen nar man drar fort.
  let mal = jag;
  for (let i = 0; i < rader.length; i++) {
    if (i === jag) continue;
    const ruta = rader[i].getBoundingClientRect();
    const mitt = ruta.top + ruta.height / 2;
    // Byt plats forst nar pekaren passerat mitten av grannen - da hoppar
    // raderna inte fram och tillbaka nar man ligger precis pa kanten.
    if (i < jag && e.clientY < mitt) mal = Math.min(mal, i);
    if (i > jag && e.clientY > mitt) mal = Math.max(mal, i);
  }
  if (mal !== jag) flyttaTill(dragRad, mal);
});

function slutaDra(e) {
  if (!dragRad) return;
  dragRad.classList.remove("dras");
  dragRad = null;
}
$("dokument").addEventListener("pointerup", slutaDra);
$("dokument").addEventListener("pointercancel", slutaDra);
// Slapper webblasaren greppet av nagon annan anledning - man drar ut ur
// fonstret, en annan flik tar over - far raden inte bli hangande i dragläge.
$("dokument").addEventListener("lostpointercapture", slutaDra);

// Samma sak fran tangentbordet, for den som star med markoren i handtaget.
$("dokument").addEventListener("keydown", (e) => {
  const handtag = e.target.closest(".red-dra");
  if (!handtag || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault();
  const rad = handtag.closest(".red-ing");
  const rader = [...rad.parentElement.children];
  flyttaTill(rad, rader.indexOf(rad) + (e.key === "ArrowUp" ? -1 : 1));
  handtag.focus();
});

/* --------------------------------------------------- handelser: redigera --- */

$("andra").addEventListener("click", redigera);
$("spara").addEventListener("click", sparaAndringar);
$("avbryt").addEventListener("click", () => {
  if (confirm("Avbryta utan att spara ändringarna?")) visa(oppetId);
});

$("dokument").addEventListener("click", (e) => {
  const bort = e.target.closest(".red-bort");
  if (bort) return bort.closest(".red-ing").remove();

  const nyRad = e.target.closest(".red-ny-rad");
  if (nyRad) {
    const rader = nyRad.closest(".red-grupp").querySelector(".red-rader");
    rader.insertAdjacentHTML("beforeend", ingRad({ amount: "", name: "", common: true }));
    rader.lastElementChild.querySelector(".red-mangd").focus();
    return;
  }

  if (e.target.closest("#red-ny-grupp")) {
    $("red-grupper").insertAdjacentHTML("beforeend",
      ingGrupp({ group: "", items: [{ amount: "", name: "", common: true }] }));
    $("red-grupper").lastElementChild.querySelector(".red-gruppnamn").focus();
  }
});

// Andrar du namnet pa en ingrediens slapper vi den gamla filternyckeln,
// sa att servern raknar ut en ny ur det du skrivit.
$("dokument").addEventListener("input", (e) => {
  if (e.target.classList.contains("red-namn")) delete e.target.closest(".red-ing").dataset.key;
});

// Cmd/Ctrl+S sparar nar du star i redigeringslaget.
document.addEventListener("keydown", (e) => {
  if (redigerar && (e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    sparaAndringar();
  }
});

$("ta-bort").addEventListener("click", async () => {
  if (GAST || !oppetId || !confirm("Ta bort receptet ur samlingen?")) return;
  await fetch("/api/recipes/" + oppetId, { method: "DELETE" });
  recept = recept.filter((r) => r.id !== oppetId);
  stang();
  ritaFilter();
  rita();
  delningSnart();
});

/* --------------------------------------------------------------- delning --- */

// Raden vid sidfoten som visar om den delade sidan hunnit uppdateras. Har
// delningen aldrig satts upp svarar servern aktiv: false och raden forblir
// dold - da ser sajten ut precis som den alltid gjort.
let delningsTimer = null;

async function visaDelning() {
  if (GAST) return;
  const rad = $("delning");
  if (!rad) return;
  let d;
  try {
    d = await (await fetch("/api/delning")).json();
  } catch (fel) {
    return;                 // servern svarar inte just nu - la oss vara tysta
  }
  if (!d.aktiv) { rad.hidden = true; return; }

  const lank = d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noreferrer">${esc(d.url)}</a>` : "";
  rad.className = "delning endast-agare" + (d.lage === "fel" ? " fel" : "");
  rad.hidden = false;
  if (d.lage === "jobbar") {
    rad.textContent = "Uppdaterar den delade sidan …";
  } else if (d.lage === "fel") {
    rad.textContent = "Den delade sidan kunde inte uppdateras: " + d.fel;
  } else if (d.tid) {
    rad.innerHTML = `Delad sida: ${lank} – uppdaterad ${esc(d.tid)}`;
  } else {
    rad.innerHTML = `Delad sida: ${lank}`;
  }

  // Sa lange en push pagar tittar vi till den varje par sekunder, sen slutar vi.
  clearTimeout(delningsTimer);
  if (d.lage === "jobbar") delningsTimer = setTimeout(visaDelning, 3000);
}

// Pushen tar nagra sekunder - fraga en gang till strax efter en andring.
function delningSnart() {
  if (GAST) return;
  setTimeout(visaDelning, 1200);
  setTimeout(visaDelning, 6000);
}

ladda();
visaDelning();

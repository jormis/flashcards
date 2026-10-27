const card = document.getElementById("card");
const frEl = document.getElementById("fr");
const frBackEl = document.getElementById("fr-back");
const enEl = document.getElementById("en");
const fiEl = document.getElementById("fi");
const counterEl = document.getElementById("counter");
const shuffleBtn = document.getElementById("shuffle");
const autoSpeakBtn = document.getElementById("autospeak");

let order = WORDS.map((_, i) => i);
let pos = 0;
let shuffled = false;
let autoSpeak = false;
let frVoiceName = null;
const hasAudio = typeof AUDIO !== "undefined";

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem("fr-flashcards") || "null");
    if (!saved) return;
    autoSpeak = !!saved.autoSpeak;
    if (!Array.isArray(saved.orderIds)) return; // older save format: start from the first card
    // Saved by card id, so adding cards keeps your place and shuffle order
    const byId = new Map(WORDS.map((w, i) => [w.id, i]));
    const known = saved.orderIds.map((id) => byId.get(id)).filter((i) => i !== undefined);
    const seen = new Set(known);
    order = known.concat(WORDS.map((_, i) => i).filter((i) => !seen.has(i)));
    pos = Math.max(0, order.indexOf(byId.get(saved.posId)));
    shuffled = !!saved.shuffled;
  } catch (e) { /* storage unavailable: start fresh */ }
}

function save() {
  try {
    localStorage.setItem("fr-flashcards", JSON.stringify({
      orderIds: order.map((i) => WORDS[i].id),
      posId: WORDS[order[pos]].id,
      shuffled,
      autoSpeak,
    }));
  } catch (e) { /* ignore */ }
}

const voiceLang = (v) => v.lang.replace("_", "-").toLowerCase();

function frenchVoices() {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  return voices.filter((v) => voiceLang(v).startsWith("fr"));
}

function pickVoice() {
  // Prefer natural standard voices (macOS also ships novelty ones like "Grandpa")
  const preferred = ["Thomas", "Audrey", "Aurélie", "Microsoft Denise", "Google français"];
  const rank = (v) => {
    const i = preferred.findIndex((name) => v.name.startsWith(name));
    // On-device voices first: network voices silently fall back to English when offline
    return (v.localService ? 0 : 100) + (voiceLang(v) === "fr-fr" ? 0 : 50) + (i < 0 ? 10 : i);
  };
  const best = frenchVoices().sort((a, b) => rank(a) - rank(b))[0];
  frVoiceName = best ? best.name : null;
  // Without recordings or a French voice, hide the speech controls rather than read French with another accent
  document.body.classList.toggle("no-speech", !hasAudio && !best);
  document.getElementById("voice-info").textContent = hasAudio
    ? "Voice: recorded French audio"
    : best ? `Voice: ${best.name} (${best.lang})` : "";
}

function currentVoice() {
  // Look the voice up again each time: Chrome ignores voice objects from an outdated list
  return frenchVoices().find((v) => v.name === frVoiceName) || null;
}

function speechText(word) {
  return (word.say || word.fr)
    .replace(/\(.*?\)/g, " ")
    .replace(/…/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let speakTimer = null;
let player = null;

function stopSpeaking() {
  clearTimeout(speakTimer);
  if (player) player.pause();
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function speak() {
  const text = speechText(WORDS[order[pos]]);
  stopSpeaking();
  // Recorded French audio first: Firefox on macOS ignores the chosen voice and reads in English
  const file = hasAudio && AUDIO[text];
  if (file) {
    player = new Audio(`audio/${file}`);
    player.play().catch(() => {}); // stay silent rather than risk a non-French voice
  } else {
    speakWithVoice(text);
  }
}

function speakWithVoice(text) {
  const voice = currentVoice();
  if (!voice) return; // never fall back to a non-French voice
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang.replace("_", "-");
  utterance.rate = 0.9;
  // Chrome can drop an utterance queued in the same tick as cancel()
  speakTimer = setTimeout(() => speechSynthesis.speak(utterance), 50);
}

function render(fromUser = true) {
  // Show the French side instantly (no flip animation) when the word changes
  card.classList.add("no-anim");
  card.classList.remove("flipped");
  const word = WORDS[order[pos]];
  frEl.textContent = word.fr;
  frBackEl.textContent = word.fr;
  enEl.textContent = word.en;
  fiEl.textContent = word.fi;
  // Your own cards may have only one translation
  enEl.parentElement.hidden = !word.en;
  fiEl.parentElement.hidden = !word.fi;
  counterEl.textContent = `${pos + 1} / ${WORDS.length}`;
  shuffleBtn.classList.toggle("active", shuffled);
  autoSpeakBtn.classList.toggle("active", autoSpeak);
  void card.offsetWidth;
  card.classList.remove("no-anim");
  save();
  // Browsers block speech before the first user interaction, so skip it on page load
  if (autoSpeak && fromUser) speak();
}

function go(step) {
  pos = (pos + step + WORDS.length) % WORDS.length;
  render();
}

function flip() {
  card.classList.toggle("flipped");
}

function toggleShuffle() {
  shuffled = !shuffled;
  order = WORDS.map((_, i) => i);
  if (shuffled) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  pos = 0;
  render();
}

function toggleAutoSpeak() {
  autoSpeak = !autoSpeak;
  autoSpeakBtn.classList.toggle("active", autoSpeak);
  save();
  if (autoSpeak) speak();
}

const searchEl = document.getElementById("search");
const resultsEl = document.getElementById("results");
let results = [];
let activeResult = 0;

function showResults() {
  results = searchWords(searchEl.value, 10);
  resultsEl.replaceChildren();
  if (!searchEl.value.trim()) {
    resultsEl.hidden = true;
    return;
  }
  if (!results.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No matches";
    resultsEl.append(li);
  }
  results.forEach((r, i) => {
    const word = WORDS[r.index];
    const li = document.createElement("li");
    li.className = "result";
    const fr = document.createElement("span");
    fr.className = "fr";
    fr.textContent = word.fr;
    const tr = document.createElement("span");
    tr.className = "tr";
    tr.textContent = [word.en, word.fi].filter(Boolean).join(" · ");
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = r.lang.toUpperCase();
    li.append(fr, tr, tag);
    // mousedown fires before the input loses focus and closes the list
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      chooseResult(i);
    });
    resultsEl.append(li);
  });
  resultsEl.hidden = false;
  setActiveResult(0);
}

function setActiveResult(i) {
  activeResult = i;
  resultsEl.querySelectorAll(".result").forEach((li, j) => {
    li.classList.toggle("active", j === i);
    if (j === i) li.scrollIntoView({ block: "nearest" });
  });
}

function chooseResult(i) {
  const r = results[i];
  if (!r) return;
  pos = order.indexOf(r.index);
  closeSearch();
  render();
}

function closeSearch() {
  searchEl.value = "";
  results = [];
  resultsEl.hidden = true;
  searchEl.blur();
}

searchEl.addEventListener("input", showResults);
searchEl.addEventListener("focus", showResults);
searchEl.addEventListener("blur", () => { resultsEl.hidden = true; });
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActiveResult(Math.min(activeResult + 1, results.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActiveResult(Math.max(activeResult - 1, 0));
  } else if (e.key === "Enter") {
    e.preventDefault();
    chooseResult(activeResult);
  } else if (e.key === "Escape") {
    closeSearch();
  }
});

const addBtn = document.getElementById("add");
const addDialog = document.getElementById("add-dialog");
const addForm = document.getElementById("add-form");
const addSaveBtn = document.getElementById("add-save");
const similarEl = document.getElementById("similar");
const addErrorEl = document.getElementById("add-error");
const toastEl = document.getElementById("toast");
let toastTimer = null;

// Adding cards needs serve.py: a page opened as a plain file can't save anything
async function checkServer() {
  if (!location.protocol.startsWith("http")) return;
  try {
    const res = await fetch("/api/status");
    if (res.ok) {
      addBtn.disabled = false;
      addBtn.title = "Add a new card";
    }
  } catch (e) { /* no server: keep the button disabled */ }
}

function openAddDialog() {
  addForm.reset();
  similarEl.hidden = true;
  addErrorEl.hidden = true;
  addDialog.showModal();
  addForm.elements.fr.focus();
}

function showAddError(message) {
  addErrorEl.textContent = message;
  addErrorEl.hidden = false;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2500);
}

function showSimilar() {
  const value = addForm.elements.fr.value;
  const matches = value.trim()
    ? searchWords(value, 3).filter((r) => r.lang === "fr" && r.score >= 80)
    : [];
  similarEl.hidden = !matches.length;
  similarEl.textContent = matches.length
    ? `Similar cards already exist: ${matches.map((r) => WORDS[r.index].fr).join(" · ")}`
    : "";
}

function addCardToDeck(newCard, audioFile) {
  const word = userWord(newCard);
  WORDS.push(word);
  SEARCH_INDEX.push(indexEntry(word));
  if (audioFile && hasAudio) AUDIO[speechText(word)] = audioFile;
  order.push(WORDS.length - 1);
  pos = order.length - 1;
  render();
  if (!autoSpeak) speak();
}

async function submitCard(e) {
  e.preventDefault();
  const data = {};
  for (const key of ["fr", "en", "fi", "say"]) data[key] = addForm.elements[key].value.trim();
  if (!data.fr) return showAddError("French is required.");
  if (!data.en && !data.fi) return showAddError("Add an English or Finnish translation (or both).");

  addSaveBtn.disabled = true;
  addErrorEl.hidden = true;
  try {
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Saving failed.");
    addDialog.close();
    addCardToDeck(body.card, body.audio);
    showToast(`Card added: ${body.card.fr}`);
  } catch (err) {
    showAddError(err instanceof TypeError
      ? "Couldn't reach the server. Is serve.py still running?"
      : err.message);
  } finally {
    addSaveBtn.disabled = false;
  }
}

addBtn.addEventListener("click", openAddDialog);
document.getElementById("add-cancel").addEventListener("click", () => addDialog.close());
addForm.elements.fr.addEventListener("input", showSimilar);
addForm.addEventListener("submit", submitCard);

card.addEventListener("click", flip);
document.getElementById("prev").addEventListener("click", () => go(-1));
document.getElementById("next").addEventListener("click", () => go(1));
shuffleBtn.addEventListener("click", toggleShuffle);
autoSpeakBtn.addEventListener("click", toggleAutoSpeak);
document.getElementById("restart").addEventListener("click", () => { pos = 0; render(); });

document.querySelectorAll(".speak").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // speaking must not flip the card
    speak();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return; // keep Cmd+P etc. working
  // Typing in the search box or the add-card form must not flip, speak or navigate
  if (addDialog.open || e.target.tagName === "INPUT") return;
  if (e.key === "/") {
    e.preventDefault();
    searchEl.focus();
  } else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === "ArrowRight") go(1);
  else if (e.key === "p" || e.key === "P") speak();
  else if (e.key === " ") {
    // Space always flips, even when a button has focus after being clicked
    e.preventDefault();
    if (!e.repeat) flip();
  } else if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
    e.preventDefault();
    flip();
  }
});

// Buttons activate on Space keyup in some browsers; block that so Space only flips
document.addEventListener("keyup", (e) => {
  if (e.key === " " && e.target.tagName !== "INPUT") e.preventDefault();
});

// Don't let clicked buttons keep keyboard focus
document.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => btn.blur());
});

pickVoice();
if (window.speechSynthesis) speechSynthesis.addEventListener("voiceschanged", pickVoice);

load();
render(false);
checkServer();

// Built-in word lists live in words-1.js, words-2.js, words-3.js.
// One entry per line: "French = English = Finnish"
// An optional 4th field is what gets spoken instead of the French text.
// Cards added from the app live in words-user.js (written by serve.py).
const WORDS = [];

function addWords(raw) {
  raw.trim().split("\n").forEach((line) => {
    const [fr, en, fi, say] = line.split(" = ");
    // Built-in French entries are unique, so the French text doubles as the card id
    WORDS.push({ id: fr.trim(), fr: fr.trim(), en: en.trim(), fi: fi.trim(), say: say && say.trim() });
  });
}

function userWord(card) {
  return { id: card.id, fr: card.fr, en: card.en || "", fi: card.fi || "", say: card.say, user: true };
}

function addUserWords(cards) {
  cards.forEach((card) => WORDS.push(userWord(card)));
}

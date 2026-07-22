/* ============================================================
   Reading Game data — phonics sequence, phoneme audio codes,
   heart words, critters, picture words.

   Sequence follows UFLI Foundations order (University of Florida
   Literacy Institute; strongest recent K-1 evidence): letters in
   a,m,s,t,p,f,i,n,o,d,c,u,g,b,e,k,h,r,l,w,j,y,x,qu,v,z order so
   blending starts after just 4 letters, then digraphs → blends →
   silent-e → suffixes → r-controlled → vowel teams.

   RULES BAKED INTO THIS DATA (from the science-of-reading research):
   - Word lists are CUMULATIVE-DECODABLE: a word appears only when
     every one of its graphemes has been taught. Never edit a list
     without checking the letters taught before it.
   - `phon` strings are Apple Speech Synthesis phoneme codes
     ([[inpt PHON]] mode) — clipped stops, stretched continuants,
     NO trailing schwa ("mmm" never "muh").
   - Heart words mark ONLY the irregular grapheme(s); the rest is
     decoded normally (Ehri's heart-word method, not sight-word rote).
============================================================ */

// ---- Phoneme table -------------------------------------------------
// key: grapheme as used in lessons. phon: Apple PHON code (stretched
// for continuous sounds, bare for stops). fb: browser/speechSynthesis
// fallback text. name: letter name(s), said ONCE on the intro card only.
window.RG_PHONEMES = {
  a:  { phon: "AE", fb: "a",   name: "ay",       type: "vowel" },
  m:  { phon: "m",    fb: "mmm", name: "em",       type: "cont"  },
  s:  { phon: "s",    fb: "sss", name: "ess",      type: "cont"  },
  t:  { phon: "t UX",   fb: "t",   name: "tee",      type: "stop", cap: 0.25 },
  p:  { phon: "p AX",   fb: "p",   name: "pee",      type: "stop", cap: 0.25 },
  f:  { phon: "f",    fb: "fff", name: "eff",      type: "cont"  },
  i:  { phon: "IH", fb: "ih",  name: "eye",      type: "vowel" },
  n:  { phon: "n",    fb: "nnn", name: "en",       type: "cont"  },
  o:  { phon: "AA", fb: "o",   name: "oh",       type: "vowel" },
  d:  { phon: "d UX",   fb: "d",   name: "dee",      type: "stop", cap: 0.25 },
  c:  { phon: "k UX",   fb: "k",   name: "see",      type: "stop", cap: 0.25 },
  u:  { phon: "UX", fb: "uh",  name: "you",      type: "vowel" },
  g:  { phon: "g UX",   fb: "g",   name: "jee",      type: "stop", cap: 0.25 },
  b:  { phon: "b UX",   fb: "b",   name: "bee",      type: "stop", cap: 0.25 },
  e:  { phon: "EH", fb: "eh",  name: "ee",       type: "vowel" },
  k:  { phon: "k UX",   fb: "k",   name: "kay",      type: "stop", cap: 0.25 },
  h:  { phon: "h UX",   fb: "h",   name: "aitch",    type: "stop", cap: 0.28 },
  r:  { phon: "r",    fb: "rrr", name: "arr",      type: "cont"  },
  l:  { phon: "l",    fb: "lll", name: "ell",      type: "cont"  },
  w:  { phon: "w",      fb: "wuh", name: "double-you", type: "cont" },
  j:  { phon: "J UX",   fb: "j",   name: "jay",      type: "stop", cap: 0.28 },
  y:  { phon: "y",      fb: "yuh", name: "why",      type: "cont"  },
  x:  { phon: "k s UX", fb: "ks",  name: "ex",       type: "stop", cap: 0.34 },
  qu: { phon: "k w UX", fb: "kw",  name: "cue",      type: "stop", cap: 0.34 },
  v:  { phon: "v",    fb: "vvv", name: "vee",      type: "cont"  },
  z:  { phon: "z",    fb: "zzz", name: "zee",      type: "cont"  },
  // digraphs & patterns
  ll: { phon: "l",    fb: "lll", name: "double ell", type: "cont" },
  ss: { phon: "s",    fb: "sss", name: "double ess", type: "cont" },
  ff: { phon: "f",    fb: "fff", name: "double eff", type: "cont" },
  zz: { phon: "z",    fb: "zzz", name: "double zee", type: "cont" },
  ck: { phon: "k UX",   fb: "k",   name: "see kay",  type: "stop", cap: 0.25 },
  sh: { phon: "S",    fb: "shh", name: "ess aitch", type: "cont" },
  th: { phon: "D",    fb: "th",  name: "tee aitch", type: "cont" },
  ch: { phon: "C UX",   fb: "ch",  name: "see aitch", type: "stop", cap: 0.30 },
  wh: { phon: "w",      fb: "wuh", name: "double-you aitch", type: "cont" },
  ng: { phon: "N",    fb: "ng",  name: "en jee",   type: "cont"  },
  nk: { phon: "N k UX", fb: "nk",  name: "en kay",   type: "stop", cap: 0.36 },
  ar: { phon: "AA r",   fb: "ar",  name: "ar",       type: "vowel" },
  or: { phon: "AO r",   fb: "or",  name: "or",       type: "vowel" },
  er: { phon: "AX r",   fb: "er",  name: "er",       type: "vowel" },
  ir: { phon: "AX r",   fb: "er",  name: "ir",       type: "vowel" },
  ur: { phon: "AX r",   fb: "er",  name: "ur",       type: "vowel" },
  ai: { phon: "EY", fb: "ay",  name: "ay",       type: "vowel" },
  ay: { phon: "EY", fb: "ay",  name: "ay",       type: "vowel" },
  ee: { phon: "IY", fb: "ee",  name: "ee",       type: "vowel" },
  ea: { phon: "IY", fb: "ee",  name: "ee",       type: "vowel" },
  oa: { phon: "OW", fb: "oh",  name: "oh",       type: "vowel" },
  ow: { phon: "OW", fb: "oh",  name: "oh",       type: "vowel" },
  ow2:{ phon: "AW", fb: "ow",  name: "ow",       type: "vowel" },
  igh:{ phon: "AY", fb: "eye", name: "eye",      type: "vowel" },
  oo: { phon: "UW", fb: "oo",  name: "oo",       type: "vowel" },
  oo2:{ phon: "UH", fb: "uu",  name: "oo",       type: "vowel" },
  ou: { phon: "AW", fb: "ow",  name: "ow",       type: "vowel" },
  oi: { phon: "OY", fb: "oy",  name: "oy",       type: "vowel" },
  oy: { phon: "OY", fb: "oy",  name: "oy",       type: "vowel" },
  a_e:{ phon: "EY", fb: "ay",  name: "ay",       type: "vowel" },
  i_e:{ phon: "AY", fb: "eye", name: "eye",      type: "vowel" },
  o_e:{ phon: "OW", fb: "oh",  name: "oh",       type: "vowel" },
  u_e:{ phon: "UW", fb: "oo",  name: "you",      type: "vowel" }
};

// ---- Lesson sequence ----------------------------------------------
// kind: letter | pattern | review. g: the grapheme this lesson teaches.
// words: cumulative-decodable practice words. critter: {e:emoji, n:name}
// hatches when the lesson is mastered.
window.RG_LESSONS = [
  { id: "L-a",  kind: "letter",  g: "a",  words: [], critter: { e: "🐜", n: "Abby the Ant" } },
  { id: "L-m",  kind: "letter",  g: "m",  words: ["am"], critter: { e: "🫎", n: "Milo the Moose" } },
  { id: "L-s",  kind: "letter",  g: "s",  words: ["am", "Sam"], critter: { e: "🦭", n: "Sunny the Seal" } },
  { id: "L-t",  kind: "letter",  g: "t",  words: ["at", "mat", "sat", "Sam"], critter: { e: "🐯", n: "Tiko the Tiger" } },
  { id: "L-p",  kind: "letter",  g: "p",  words: ["map", "tap", "sap", "pat", "Pam"], critter: { e: "🐧", n: "Pip the Penguin" } },
  { id: "L-f",  kind: "letter",  g: "f",  words: ["fat", "mat", "map", "pat"], critter: { e: "🦊", n: "Finn the Fox" } },
  { id: "L-i",  kind: "letter",  g: "i",  words: ["it", "sit", "pit", "tip", "sip", "fit", "if", "Tim"], critter: { e: "🦎", n: "Izzy the Iguana" } },
  { id: "L-n",  kind: "letter",  g: "n",  words: ["in", "an", "nap", "pin", "tin", "fin", "pan", "man", "fan", "ant"], critter: { e: "🐳", n: "Nibbles the Narwhal" } },
  { id: "L-o",  kind: "letter",  g: "o",  words: ["on", "top", "pot", "not", "mop", "pop", "Tom"], critter: { e: "🐙", n: "Ollie the Octopus" } },
  { id: "L-d",  kind: "letter",  g: "d",  words: ["dad", "did", "dot", "dip", "sad", "mad", "pad", "and", "pond"], critter: { e: "🐶", n: "Dash the Dog" } },
  { id: "L-c",  kind: "letter",  g: "c",  words: ["cat", "cap", "can", "cot", "cast"], critter: { e: "🐱", n: "Coco the Cat" } },
  { id: "L-u",  kind: "letter",  g: "u",  words: ["up", "us", "cup", "cut", "nut", "mud", "sun", "fun", "pup"], critter: { e: "🦄", n: "Uma the Unicorn" } },
  { id: "L-g",  kind: "letter",  g: "g",  words: ["got", "gap", "gum", "dig", "dog", "pig", "gas", "tag", "tug"], critter: { e: "🐐", n: "Gus the Goat" } },
  { id: "L-b",  kind: "letter",  g: "b",  words: ["bat", "bit", "bus", "bad", "big", "bag", "bug", "bun", "cab", "tub", "bib"], critter: { e: "🐻", n: "Bella the Bear" } },
  { id: "L-e",  kind: "letter",  g: "e",  words: ["pet", "ten", "net", "bed", "men", "pen", "get", "set", "fed", "egg"], critter: { e: "🐘", n: "Ellie the Elephant" } },
  { id: "L-k",  kind: "letter",  g: "k",  words: ["kid", "kit", "keg", "ask", "desk"], critter: { e: "🐨", n: "Kai the Koala" } },
  { id: "L-h",  kind: "letter",  g: "h",  words: ["hat", "hot", "hit", "hen", "hug", "hum", "hip", "had", "ham", "hid", "hut"], critter: { e: "🐴", n: "Hopper the Horse" } },
  { id: "L-r",  kind: "letter",  g: "r",  words: ["rat", "run", "red", "rip", "rub", "ram", "rug", "rot", "rim"], critter: { e: "🐰", n: "Rosie the Rabbit" } },
  { id: "L-l",  kind: "letter",  g: "l",  words: ["lap", "leg", "lit", "log", "lip", "let", "lid", "lot"], critter: { e: "🦁", n: "Leo the Lion" } },
  { id: "L-w",  kind: "letter",  g: "w",  words: ["wig", "win", "wet", "web", "wag", "wind"], critter: { e: "🐋", n: "Willa the Whale" } },
  { id: "L-j",  kind: "letter",  g: "j",  words: ["jam", "jet", "jig", "jog", "jug", "job"], critter: { e: "🪼", n: "Jax the Jellyfish" } },
  { id: "L-y",  kind: "letter",  g: "y",  words: ["yes", "yet", "yum", "yak", "yap"], critter: { e: "🐂", n: "Yuki the Yak" } },
  { id: "L-x",  kind: "letter",  g: "x",  words: ["box", "fox", "six", "wax", "mix", "fix", "ox"], critter: { e: "🐠", n: "Xander the X-ray Fish" } },
  { id: "L-qu", kind: "letter",  g: "qu", words: ["quit", "quiz", "quad"], critter: { e: "🐦", n: "Quinn the Quail" } },
  { id: "L-v",  kind: "letter",  g: "v",  words: ["van", "vet", "vat"], critter: { e: "🐍", n: "Vinny the Viper" } },
  { id: "L-z",  kind: "letter",  g: "z",  words: ["zip", "zag", "zap", "zest"], critter: { e: "🦓", n: "Ziggy the Zebra" } },
  { id: "L-rev1", kind: "review", g: null, label: "Word round-up",
    words: ["cat", "sun", "big", "hop", "jet", "wax", "mud", "pig", "leg", "van", "zip", "fox", "hat", "bus", "web"],
    critter: { e: "🏆", n: "Champ the Cup" } },
  { id: "L-floss", kind: "pattern", g: "ll", label: "Double letters (ll, ss, ff, zz)",
    words: ["off", "hill", "will", "bell", "mess", "kiss", "buzz", "fill", "tell", "huff", "puff", "doll", "less"],
    critter: { e: "🦙", n: "Fluffy the Llama" } },
  { id: "L-all", kind: "pattern", g: "a", label: "-all words",
    words: ["all", "ball", "call", "fall", "tall", "wall", "hall", "small"],
    critter: { e: "⚽", n: "Bounce the Ball" } },
  { id: "L-ck", kind: "pattern", g: "ck", label: "ck",
    words: ["back", "pack", "sick", "kick", "duck", "luck", "rock", "sock", "neck", "deck", "lick", "lock"],
    critter: { e: "🦆", n: "Lucky the Duck" } },
  { id: "L-sh", kind: "pattern", g: "sh", label: "sh",
    words: ["ship", "shop", "shut", "fish", "dish", "wish", "cash", "rush", "shed", "shin", "hush"],
    critter: { e: "🦈", n: "Shelly the Shark" } },
  { id: "L-th", kind: "pattern", g: "th", label: "th",
    words: ["this", "that", "them", "then", "with", "thin", "math", "path", "bath", "moth"],
    critter: { e: "🦋", n: "Thea the Moth" } },
  { id: "L-ch", kind: "pattern", g: "ch", label: "ch",
    words: ["chip", "chat", "chin", "chop", "much", "such", "rich", "chick"],
    critter: { e: "🐤", n: "Chip the Chick" } },
  { id: "L-wh", kind: "pattern", g: "wh", label: "wh",
    words: ["when", "whip", "wham", "whiz"],
    critter: { e: "🌬️", n: "Whoosh the Wind" } },
  { id: "L-ng", kind: "pattern", g: "ng", label: "ng and nk",
    words: ["ring", "king", "song", "long", "sing", "bang", "hang", "pink", "sink", "junk", "tank", "wink"],
    critter: { e: "🦩", n: "Bingo the Flamingo" } },
  { id: "L-bl1", kind: "pattern", g: null, label: "Starting blends (st, sp, sn, sl, fl, fr, gr, dr, tr, pl, cl, gl, sw)",
    words: ["stop", "spin", "snap", "slip", "flag", "frog", "grab", "drum", "trip", "plan", "clap", "glad", "swim", "step", "spot", "sled"],
    critter: { e: "🐸", n: "Splash the Frog" } },
  { id: "L-bl2", kind: "pattern", g: null, label: "Ending blends (st, nd, mp, lk, lp, ft, nt)",
    words: ["fast", "last", "best", "nest", "jump", "hand", "land", "sand", "milk", "help", "felt", "soft", "lost", "must", "tent", "went"],
    critter: { e: "🐫", n: "Humps the Camel" } },
  { id: "L-a_e", kind: "pattern", g: "a_e", label: "Magic e — a_e",
    words: ["make", "take", "cake", "lake", "name", "game", "gate", "late", "cave", "wave", "tape", "safe"],
    critter: { e: "🎂", n: "Bakey the Cake" } },
  { id: "L-i_e", kind: "pattern", g: "i_e", label: "Magic e — i_e",
    words: ["like", "bike", "time", "ride", "five", "nine", "kite", "hide", "line", "mine", "side", "wide"],
    critter: { e: "🪁", n: "Skye the Kite" } },
  { id: "L-o_e", kind: "pattern", g: "o_e", label: "Magic e — o_e",
    words: ["home", "bone", "nose", "rope", "note", "hope", "rose", "hole", "woke", "joke"],
    critter: { e: "🦴", n: "Boney the Bone" } },
  { id: "L-u_e", kind: "pattern", g: "u_e", label: "Magic e — u_e",
    words: ["cube", "cute", "mule", "huge", "tune", "June"],
    critter: { e: "🎵", n: "Tootie the Tune" } },
  { id: "L-suffix", kind: "pattern", g: null, label: "Endings (-ing, -ed, -es)",
    words: ["jumping", "singing", "resting", "helping", "wishes", "dishes", "boxes", "jumped", "landed", "fishing"],
    critter: { e: "🎣", n: "Reel the Fisher" } },
  { id: "L-tch", kind: "pattern", g: null, label: "tch and dge",
    words: ["catch", "match", "pitch", "fetch", "witch", "badge", "edge", "judge"],
    critter: { e: "🧙", n: "Twitch the Witch" } },
  { id: "L-y2", kind: "pattern", g: null, label: "y as a vowel (my, happy)",
    words: ["my", "by", "fly", "sky", "try", "cry", "dry", "happy", "funny", "silly", "puppy"],
    critter: { e: "🐶", n: "Happy the Puppy" } },
  { id: "L-le", kind: "pattern", g: null, label: "-le endings",
    words: ["apple", "little", "middle", "bottle", "puzzle", "giggle"],
    critter: { e: "🍎", n: "Crunch the Apple" } },
  { id: "L-ar", kind: "pattern", g: "ar", label: "ar",
    words: ["car", "far", "farm", "hard", "park", "star", "barn", "yard", "dark", "art"],
    critter: { e: "⭐", n: "Sparky the Star" } },
  { id: "L-or", kind: "pattern", g: "or", label: "or and ore",
    words: ["for", "corn", "fort", "born", "storm", "sort", "more", "store", "shore", "score"],
    critter: { e: "🌽", n: "Pop the Corn" } },
  { id: "L-er", kind: "pattern", g: "er", label: "er, ir, ur",
    words: ["her", "fern", "bird", "girl", "first", "dirt", "stir", "fur", "turn", "hurt", "burn", "curl"],
    critter: { e: "🐦‍⬛", n: "Bertie the Bird" } },
  { id: "L-ai", kind: "pattern", g: "ai", label: "ai and ay",
    words: ["rain", "wait", "tail", "mail", "paid", "train", "day", "play", "say", "way", "stay", "may"],
    critter: { e: "🌈", n: "Ray the Rainbow" } },
  { id: "L-ee", kind: "pattern", g: "ee", label: "ee and ea",
    words: ["see", "tree", "feet", "seed", "keep", "green", "sleep", "eat", "sea", "read", "team", "mean", "beach", "peach"],
    critter: { e: "🌳", n: "Sweet the Tree" } },
  { id: "L-oa", kind: "pattern", g: "oa", label: "oa and ow (snow)",
    words: ["boat", "coat", "road", "soap", "goat", "toad", "show", "snow", "grow", "slow", "low", "glow"],
    critter: { e: "⛵", n: "Float the Boat" } },
  { id: "L-igh", kind: "pattern", g: "igh", label: "igh",
    words: ["high", "night", "light", "right", "might", "sight", "bright"],
    critter: { e: "🌙", n: "Glow the Moon" } },
  { id: "L-oo", kind: "pattern", g: "oo", label: "oo (moon) and oo (book)",
    words: ["moon", "food", "soon", "zoo", "boot", "root", "book", "look", "good", "foot", "took", "wood"],
    critter: { e: "🦉", n: "Booker the Owl" } },
  { id: "L-ou", kind: "pattern", g: "ou", label: "ou and ow (cow)",
    words: ["out", "loud", "cloud", "found", "round", "shout", "cow", "how", "now", "down", "town", "brown"],
    critter: { e: "🐄", n: "Clover the Cow" } },
  { id: "L-oi", kind: "pattern", g: "oi", label: "oi and oy",
    words: ["oil", "coin", "join", "boil", "point", "soil", "boy", "toy", "joy", "royal"],
    critter: { e: "🪙", n: "Penny the Coin" } }
];

// ---- Heart words ---------------------------------------------------
// after: lesson id they unlock behind. segs: [grapheme, isHeart] pairs —
// the ♥ goes ONLY under the irregular part; the rest is decoded.
window.RG_HEART_WORDS = [
  { after: "L-t",  w: "a",     segs: [["a", true]] },
  { after: "L-t",  w: "the",   segs: [["th", true], ["e", true]] },
  { after: "L-i",  w: "I",     segs: [["I", true]] },
  { after: "L-i",  w: "is",    segs: [["i", false], ["s", true]] },
  { after: "L-o",  w: "to",    segs: [["t", false], ["o", true]] },
  { after: "L-o",  w: "of",    segs: [["o", true], ["f", true]] },
  { after: "L-d",  w: "was",   segs: [["w", false], ["a", true], ["s", true]] },
  { after: "L-b",  w: "has",   segs: [["ha", false], ["s", true]] },
  { after: "L-b",  w: "his",   segs: [["hi", false], ["s", true]] },
  { after: "L-e",  w: "he",    segs: [["h", false], ["e", true]] },
  { after: "L-e",  w: "me",    segs: [["m", false], ["e", true]] },
  { after: "L-e",  w: "be",    segs: [["b", false], ["e", true]] },
  { after: "L-r",  w: "are",   segs: [["are", true]] },
  { after: "L-w",  w: "we",    segs: [["w", false], ["e", true]] },
  { after: "L-y",  w: "you",   segs: [["y", false], ["ou", true]] },
  { after: "L-y",  w: "they",  segs: [["th", false], ["ey", true]] },
  { after: "L-z",  w: "said",  segs: [["s", false], ["ai", true], ["d", false]] },
  { after: "L-z",  w: "have",  segs: [["ha", false], ["ve", true]] },
  { after: "L-z",  w: "do",    segs: [["d", false], ["o", true]] },
  { after: "L-sh", w: "she",   segs: [["sh", false], ["e", true]] },
  { after: "L-th", w: "what",  segs: [["wh", false], ["a", true], ["t", false]] },
  { after: "L-th", w: "who",   segs: [["wh", true], ["o", true]] },
  { after: "L-bl2", w: "from", segs: [["fr", false], ["o", true], ["m", false]] },
  { after: "L-bl2", w: "come", segs: [["c", false], ["ome", true]] },
  { after: "L-bl2", w: "some", segs: [["s", false], ["ome", true]] },
  { after: "L-a_e", w: "one",  segs: [["one", true]] },
  { after: "L-a_e", w: "were", segs: [["w", false], ["ere", true]] },
  { after: "L-o_e", w: "there", segs: [["th", false], ["ere", true]] }
];

// ---- Picture words -------------------------------------------------
// Only words with an unmistakable emoji get a picture-confirm card;
// everything else uses the tap-the-word-you-heard card instead.
// Picture appears AFTER the decode attempt — confirmation, never a cue.
window.RG_PICTURES = {
  ant: "🐜", map: "🗺️", cat: "🐱", dog: "🐶", sun: "☀️", pig: "🐷", bus: "🚌",
  hat: "🎩", bed: "🛏️", ten: "🔟", six: "6️⃣", fox: "🦊", box: "📦", cup: "☕",
  nut: "🥜", bug: "🐞", web: "🕸️", hen: "🐔", pen: "🖊️", jet: "✈️", log: "🪵",
  mop: "🧹", top: "🌀", pin: "📌", egg: "🥚", ram: "🐏", rug: "🧶", wig: "👱",
  van: "🚐", jam: "🍓", yak: "🐂", zip: "🤐", ox: "🐂", pot: "🍲", mud: "💩",
  rat: "🐀", bat: "🦇", bag: "👜", corn: "🌽", star: "⭐", car: "🚗", farm: "🚜",
  fish: "🐟", ship: "🚢", dish: "🍽️", moth: "🦋", chick: "🐤", king: "👑",
  ring: "💍", duck: "🦆", sock: "🧦", rock: "🪨", bell: "🔔", ball: "⚽",
  doll: "🪆", frog: "🐸", drum: "🥁", flag: "🚩", sled: "🛷", nest: "🪺",
  hand: "✋", milk: "🥛", tent: "⛺", cake: "🎂", gate: "🚪", cave: "🕳️",
  bike: "🚲", kite: "🪁", five: "5️⃣", nine: "9️⃣", bone: "🦴", nose: "👃",
  rope: "🪢", rose: "🌹", cube: "🧊", mule: "🐴", witch: "🧙", apple: "🍎",
  puppy: "🐶", bird: "🐦", girl: "👧", train: "🚂", rain: "🌧️", mail: "📬",
  tree: "🌳", feet: "🦶", seed: "🌱", peach: "🍑", boat: "⛵", coat: "🧥",
  soap: "🧼", goat: "🐐", toad: "🐸", snow: "❄️", moon: "🌙", night: "🌃",
  light: "💡", food: "🍔", zoo: "🦁", boot: "👢", book: "📖", foot: "🦶",
  wood: "🪵", cloud: "☁️", cow: "🐄", town: "🏘️", coin: "🪙", oil: "🛢️",
  boy: "👦", toy: "🧸", eat: "🍽️", sea: "🌊", beach: "🏖️", sky: "🌤️",
  fly: "🪰", storm: "⛈️", park: "🏞️", barn: "🏚️", swim: "🏊", jump: "🤸",
  sit: "🪑", run: "🏃", dig: "⛏️", hug: "🤗", win: "🏅", fan: "🪭", can: "🥫",
  cot: "🛏️", pan: "🍳", tag: "🏷️", bib: "🍼", leg: "🦵", lip: "👄", net: "🥅",
  gum: "🍬", tub: "🛁", bun: "🥐", ham: "🍖", hut: "🛖", pup: "🐶", wax: "🕯️",
  quiz: "❓", vet: "🩺", man: "👨", mat: "🧘", tap: "🚰", nap: "😴", key: "🔑"
};

// ---- Mapping mastery → BC curriculum standards ---------------------
// gradeKey → which standard IDs this game advances, and the thresholds
// (counts of mastered items) for each mastery step-up.
window.RG_STANDARDS_MAP = {
  K: [
    { std: "EK.7", metric: "sounds",  developing: 8,  proficient: 20 },  // letter knowledge / letter-sound matches
    { std: "EK.8", metric: "words",   developing: 8,  proficient: 25 }   // phonemic awareness — blending
  ],
  "1": [
    { std: "E1.10", metric: "words",  developing: 10, proficient: 30 },  // blending phonemes
    { std: "E1.4",  metric: "advanced", developing: 8, proficient: 20 }  // decoding with phonics + sight words
  ]
};

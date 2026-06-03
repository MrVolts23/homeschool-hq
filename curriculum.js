/* ============================================================
   BC Curriculum data — Math & English Language Arts
   Source: https://curriculum.gov.bc.ca/
   Structured per BC's Know-Do-Understand model:
     - bigIdeas   = Understand
     - content    = Know (Content Learning Standards)
     - competencies = Do (Curricular Competencies)
   Each content item has a stable ID so we can track mastery.
============================================================ */
window.CURRICULUM = {
  // ============================================================
  // MATHEMATICS
  // ============================================================
  math: {
    K: {
      grade: "Kindergarten",
      subject: "Mathematics",
      bigIdeas: [
        "Numbers represent quantities that can be decomposed into smaller parts.",
        "One-to-one correspondence and a sense of 5 and 10 are essential for fluency with numbers.",
        "Repeating elements in patterns can be identified.",
        "Objects have attributes that can be described, measured, and compared.",
        "Familiar events can be described as likely or unlikely and compared."
      ],
      content: [
        { id: "MK.1",  topic: "Number",      text: "Number concepts to 10" },
        { id: "MK.2",  topic: "Number",      text: "Ways to make 5" },
        { id: "MK.3",  topic: "Number",      text: "Decomposition of numbers to 10" },
        { id: "MK.4",  topic: "Patterns",    text: "Repeating patterns with two or three elements" },
        { id: "MK.5",  topic: "Operations",  text: "Change in quantity to 10, using concrete materials" },
        { id: "MK.6",  topic: "Equality",    text: "Equality as a balance and inequality as an imbalance" },
        { id: "MK.7",  topic: "Measurement", text: "Direct comparative measurement (e.g., bigger, smaller, heavier, lighter)" },
        { id: "MK.8",  topic: "Geometry",    text: "Single attributes of 2D shapes and 3D objects" },
        { id: "MK.9",  topic: "Data",        text: "Concrete or pictorial graphs as a visual tool" },
        { id: "MK.10", topic: "Probability", text: "Likelihood of familiar life events" },
        { id: "MK.11", topic: "Financial",   text: "Financial literacy — attributes of coins, and financial role-play" }
      ],
      competencies: [
        "Estimate reasonably.",
        "Develop mental math strategies and abilities to make sense of quantities.",
        "Use technology to explore mathematics.",
        "Model mathematics in contextualized experiences.",
        "Visualize to explore mathematical concepts.",
        "Use multiple strategies (visual, oral, play, experimental, written, symbolic) to engage in problem solving.",
        "Connect math to local First Peoples cultural practices, story, and place.",
        "Communicate mathematical thinking concretely, pictorially, symbolically, and through spoken language."
      ]
    },
    "1": {
      grade: "Grade 1",
      subject: "Mathematics",
      bigIdeas: [
        "Numbers to 20 represent quantities that can be decomposed into 10s and 1s.",
        "Addition and subtraction with numbers to 10 can be modelled concretely, pictorially, and symbolically.",
        "Repeating elements in patterns can be identified, described, extended, and created.",
        "Objects and shapes have attributes that can be described, measured, and compared.",
        "Concrete graphs help us to compare and interpret data and show one-to-one correspondence."
      ],
      content: [
        { id: "M1.1",  topic: "Number",      text: "Number concepts to 20" },
        { id: "M1.2",  topic: "Number",      text: "Ways to make 10" },
        { id: "M1.3",  topic: "Operations",  text: "Addition and subtraction to 20 (understanding of operation and process)" },
        { id: "M1.4",  topic: "Patterns",    text: "Repeating patterns with multiple elements and attributes" },
        { id: "M1.5",  topic: "Operations",  text: "Change in quantity, using verbal descriptions" },
        { id: "M1.6",  topic: "Equality",    text: "Meaning of equality and inequality" },
        { id: "M1.7",  topic: "Measurement", text: "Direct measurement with non-standard units (non-uniform and uniform)" },
        { id: "M1.8",  topic: "Geometry",    text: "Comparison of 2D shapes and 3D objects" },
        { id: "M1.9",  topic: "Data",        text: "Concrete graphs, using one-to-one correspondence" },
        { id: "M1.10", topic: "Probability", text: "Likelihood of familiar life events, using comparative language" },
        { id: "M1.11", topic: "Financial",   text: "Financial literacy — values of coins, and monetary exchanges" }
      ],
      competencies: [
        "Estimate reasonably.",
        "Develop mental math strategies and abilities to make sense of quantities.",
        "Visualize to explore mathematical concepts.",
        "Develop and use multiple strategies to engage in problem solving.",
        "Model mathematics in contextualized experiences.",
        "Communicate mathematical thinking in many ways.",
        "Use mathematical vocabulary and language to contribute to mathematical discussions.",
        "Represent mathematical ideas in concrete, pictorial, and symbolic forms."
      ]
    },
    "3": {
      grade: "Grade 3",
      subject: "Mathematics",
      bigIdeas: [
        "Fractions are a type of number that can represent quantities.",
        "Development of computational fluency in addition, subtraction, multiplication, and division of whole numbers requires flexible decomposing and composing.",
        "Regular increases and decreases in patterns can be identified and used to make generalizations.",
        "Standard units are used to describe, measure, and compare attributes of objects' shapes.",
        "The likelihood of possible outcomes can be examined, compared, and interpreted."
      ],
      content: [
        { id: "M3.1",  topic: "Number",      text: "Number concepts to 1000" },
        { id: "M3.2",  topic: "Number",      text: "Fraction concepts" },
        { id: "M3.3",  topic: "Operations",  text: "Addition and subtraction to 1000" },
        { id: "M3.4",  topic: "Operations",  text: "Addition and subtraction facts to 20 (emerging computational fluency)" },
        { id: "M3.5",  topic: "Operations",  text: "Multiplication and division concepts" },
        { id: "M3.6",  topic: "Patterns",    text: "Increasing and decreasing patterns" },
        { id: "M3.7",  topic: "Patterns",    text: "Pattern rules using words and numbers, based on concrete experiences" },
        { id: "M3.8",  topic: "Equality",    text: "One-step addition and subtraction equations with an unknown number" },
        { id: "M3.9",  topic: "Measurement", text: "Measurement, using standard units (linear, mass, and capacity)" },
        { id: "M3.10", topic: "Measurement", text: "Time concepts" },
        { id: "M3.11", topic: "Geometry",    text: "Construction of 3D objects" },
        { id: "M3.12", topic: "Data",        text: "One-to-one correspondence with bar graphs, pictographs, charts, and tables" },
        { id: "M3.13", topic: "Probability", text: "Likelihood of simulated events, using comparative language" },
        { id: "M3.14", topic: "Financial",   text: "Financial literacy — fluency with coins and bills to $100, and earning and payment" }
      ],
      competencies: [
        "Estimate reasonably.",
        "Develop mental math strategies and abilities to make sense of quantities.",
        "Develop, demonstrate, and apply mathematical understanding through play, inquiry, and problem solving.",
        "Visualize to explore mathematical concepts.",
        "Develop and use multiple strategies to engage in problem solving.",
        "Engage in problem-solving experiences connected to place, story, cultural practices, and perspectives.",
        "Communicate mathematical thinking concretely, pictorially, symbolically, and through spoken or written language.",
        "Use mathematical vocabulary and language to contribute to mathematical discussions.",
        "Explain and justify mathematical ideas and decisions.",
        "Represent mathematical ideas in concrete, pictorial, and symbolic forms.",
        "Reflect on mathematical thinking.",
        "Connect mathematical concepts to each other and to other areas and personal interests."
      ]
    }
  },

  // ============================================================
  // ENGLISH LANGUAGE ARTS (covers Reading + Writing)
  // ============================================================
  ela: {
    K: {
      grade: "Kindergarten",
      subject: "English Language Arts",
      bigIdeas: [
        "Language and story can be a source of creativity and joy.",
        "Stories and other texts help us learn about ourselves and our families.",
        "Stories and other texts can be shared through pictures and words.",
        "Everyone has a unique story to share.",
        "Playing with language helps us discover how language works.",
        "Curiosity and wonder lead us to new discoveries about ourselves and the world around us."
      ],
      content: [
        { id: "EK.1", topic: "Story",         text: "Structure of story (beginning, middle, end / first, then, last)" },
        { id: "EK.2", topic: "Story",         text: "Literary elements and devices (rhyme, rhythm, nursery rhymes, fables)" },
        { id: "EK.3", topic: "Reading",       text: "Reading strategies — predictions, connections, pictures, patterns, prior knowledge" },
        { id: "EK.4", topic: "Oral",          text: "Oral language strategies — volume, pace, taking turns, asking questions" },
        { id: "EK.5", topic: "Metacognition", text: "Talking and thinking about learning as a reader/writer" },
        { id: "EK.6", topic: "Print",         text: "Concepts of print (left-to-right, spacing, punctuation, letter/word distinction)" },
        { id: "EK.7", topic: "Letters",       text: "Letter knowledge — recognizing/naming letters, letter-sound matches, familiar words" },
        { id: "EK.8", topic: "Phonics",       text: "Phonemic and phonological awareness — rhyming, segmenting, blending" },
        { id: "EK.9", topic: "Writing",       text: "Letter formation — scribble writing, letter strings, distinguish drawing from writing" },
        { id: "EK.10", topic: "Writing",      text: "Relationship between reading, writing, and oral language" }
      ],
      competencies: [
        "Use sources of information and prior knowledge to make meaning.",
        "Use developmentally appropriate reading, listening, and viewing strategies to make meaning.",
        "Explore foundational concepts of print, oral, and visual texts.",
        "Engage actively as listeners, viewers, and readers.",
        "Recognize the importance of story in personal, family, and community identity.",
        "Use personal experience and knowledge to connect to stories and other texts.",
        "Recognize the structure of story.",
        "Exchange ideas and perspectives to build shared understanding.",
        "Use language to identify, create, and share ideas, feelings, opinions, and preferences.",
        "Create stories and other texts to deepen awareness of self, family, and community.",
        "Plan and create stories and other texts for different purposes and audiences.",
        "Explore oral storytelling processes."
      ]
    },
    "1": {
      grade: "Grade 1",
      subject: "English Language Arts",
      bigIdeas: [
        "Language and story can be a source of creativity and joy.",
        "Stories and other texts help us learn about ourselves and our families.",
        "Stories and other texts can be shared through pictures and words.",
        "Everyone has a unique story to share.",
        "Through listening and speaking, we connect with others and share our world.",
        "Playing with language helps us discover how language works.",
        "Curiosity and wonder lead us to new discoveries about ourselves and the world around us."
      ],
      content: [
        { id: "E1.1", topic: "Story",         text: "Elements of story — setting, character, events (few details)" },
        { id: "E1.2", topic: "Story",         text: "Literary elements and devices — poetic language, sound play, images, colour, symbols" },
        { id: "E1.3", topic: "Vocabulary",    text: "Vocabulary to talk about texts (book, page, chapter, author, title, illustrator)" },
        { id: "E1.4", topic: "Reading",       text: "Reading strategies — illustrations, decoding with phonics, sight words, self-monitoring" },
        { id: "E1.5", topic: "Oral",          text: "Oral language strategies — adjusting volume/pace, taking turns, asking questions" },
        { id: "E1.6", topic: "Metacognition", text: "Talking and thinking about learning as a reader and writer" },
        { id: "E1.7", topic: "Writing",       text: "Writing processes — revising, editing, considering audience" },
        { id: "E1.8", topic: "Print",         text: "Concepts of print — directionality, spacing, capital/lowercase, punctuation" },
        { id: "E1.9", topic: "Print",         text: "Print awareness — letters vs words vs sentences" },
        { id: "E1.10", topic: "Phonics",      text: "Phonemic and phonological awareness — rhyming, segmenting, blending phonemes" },
        { id: "E1.11", topic: "Handwriting",  text: "Letter formation — legible printing with spacing between letters and words" },
        { id: "E1.12", topic: "Grammar",      text: "Sentence structure — structure of simple sentences" },
        { id: "E1.13", topic: "Conventions",  text: "Conventions — periods, question marks, capitals (incl. names and 'I')" }
      ],
      competencies: [
        "Read fluently at grade level (with comprehension, phrasing, and attention to punctuation).",
        "Use sources of information and prior knowledge to make meaning.",
        "Use developmentally appropriate reading, listening, and viewing strategies.",
        "Use foundational concepts of print, oral, and visual texts.",
        "Engage actively as listeners, viewers, and readers.",
        "Recognize the importance of story in personal, family, and community identity.",
        "Use personal experience and knowledge to connect to stories and other texts.",
        "Recognize the structure and elements of story.",
        "Show awareness of how story in First Peoples cultures connects people to family and community.",
        "Exchange ideas and perspectives to build shared understanding.",
        "Identify, organize, and present ideas in a variety of forms.",
        "Create stories and other texts to deepen awareness of self, family, and community.",
        "Plan and create a variety of communication forms for different purposes and audiences.",
        "Communicate using letters and words and applying some conventions of Canadian spelling, grammar, and punctuation.",
        "Explore oral storytelling processes."
      ]
    },
    "3": {
      grade: "Grade 3",
      subject: "English Language Arts",
      bigIdeas: [
        "Language and story can be a source of creativity and joy.",
        "Stories and other texts help us learn about ourselves, our families, and our communities.",
        "Stories can be understood from different perspectives.",
        "Using language in creative and playful ways helps us understand how language works.",
        "Curiosity and wonder lead us to new discoveries about ourselves and the world around us."
      ],
      content: [
        { id: "E3.1", topic: "Story",         text: "Elements of story — character, plot, setting, conflict, and theme" },
        { id: "E3.2", topic: "Story",         text: "Functions and genres of stories and other texts" },
        { id: "E3.3", topic: "Story",         text: "Text features — headings, diagrams, columns, sidebars" },
        { id: "E3.4", topic: "Story",         text: "Literary elements and devices — descriptive language, imagery, rhythm, rhyme, simile, alliteration" },
        { id: "E3.5", topic: "Reading",       text: "Reading strategies — predicting, retelling, locating main idea/details, decoding, self-correcting" },
        { id: "E3.6", topic: "Oral",          text: "Oral language strategies — listening, asking questions, expressing opinions, taking turns" },
        { id: "E3.7", topic: "Metacognition", text: "Metacognitive strategies — reflecting, questioning, goal setting, self-evaluating" },
        { id: "E3.8", topic: "Writing",       text: "Writing processes — revising, editing, considering audience" },
        { id: "E3.9", topic: "Oral",          text: "Features of oral language — tone, volume, inflection, pace, gestures" },
        { id: "E3.10", topic: "Vocabulary",   text: "Word patterns and word families" },
        { id: "E3.11", topic: "Handwriting",  text: "Legible handwriting with spacing between words" },
        { id: "E3.12", topic: "Grammar",      text: "Sentence structure — structure of compound sentences" },
        { id: "E3.13", topic: "Conventions",  text: "Conventions — sentence punctuation, apostrophe use in contractions" }
      ],
      competencies: [
        "Read fluently at grade level.",
        "Use sources of information and prior knowledge to make meaning.",
        "Make connections between ideas from a variety of sources and prior knowledge.",
        "Use developmentally appropriate reading, listening, and viewing strategies.",
        "Recognize how different texts reflect different purposes.",
        "Engage actively as listeners, viewers, and readers.",
        "Explain the role that story plays in personal, family, and community identity.",
        "Use personal experience and knowledge to connect to text and make meaning.",
        "Recognize the structure and elements of story.",
        "Show awareness of how story in First Peoples cultures connects people to family and community.",
        "Develop awareness of how story in First Peoples cultures connects people to land.",
        "Exchange ideas and perspectives to build shared understanding.",
        "Create stories and other texts to deepen awareness of self, family, and community.",
        "Plan and create a variety of communication forms for different purposes and audiences.",
        "Communicate using sentences and most conventions of Canadian spelling, grammar, and punctuation.",
        "Develop and apply expanding word knowledge (roots, affixes, suffixes).",
        "Explore and appreciate aspects of First Peoples oral traditions.",
        "Use oral storytelling processes."
      ]
    }
  },

  // ============================================================
  // GEOGRAPHY (added subject — maps, places, Canada & the world)
  // Not a standalone BC K-3 subject (it lives under Social Studies),
  // but broken out here so it can be tracked like the others.
  // ============================================================
  geography: {
    K: {
      grade: "Kindergarten",
      subject: "Geography",
      bigIdeas: [
        "A map is a picture of a place seen from above.",
        "We can describe where things are using position words.",
        "The Earth has land and water, and weather changes with the seasons."
      ],
      content: [
        { id: "GK.1", topic: "Community",  text: "My home, family, and the people in my community" },
        { id: "GK.2", topic: "Maps",       text: "A map shows a place from above (intro to maps)" },
        { id: "GK.3", topic: "Directions", text: "Position words — up/down, near/far, left/right, beside" },
        { id: "GK.4", topic: "Earth",      text: "Land and water look different on Earth" },
        { id: "GK.5", topic: "Nature",     text: "Weather and seasons where I live" }
      ],
      competencies: [
        "Describe where people, places, and things are using everyday words.",
        "Recognize that a map represents a real place.",
        "Observe and describe weather and the natural world."
      ]
    },
    "1": {
      grade: "Grade 1",
      subject: "Geography",
      bigIdeas: [
        "Maps use symbols and a key to show real places.",
        "The four cardinal directions help us describe where things are.",
        "We live in a community, in a province, in a country, on a continent."
      ],
      content: [
        { id: "G1.1", topic: "Maps",       text: "Reading simple maps and using a map key/symbols" },
        { id: "G1.2", topic: "Directions", text: "The four cardinal directions (North, South, East, West)" },
        { id: "G1.3", topic: "Community",  text: "Places in my community (school, store, park, library)" },
        { id: "G1.4", topic: "Continents", text: "Earth has continents and oceans (introduction)" },
        { id: "G1.5", topic: "Canada",     text: "I live in Canada; my province is British Columbia" },
        { id: "G1.6", topic: "Landforms",  text: "Landforms — mountains, rivers, lakes, forests, beaches" }
      ],
      competencies: [
        "Use a simple map and its key to find places.",
        "Use cardinal directions to describe location and movement.",
        "Identify Canada, British Columbia, and the local community on a map."
      ]
    },
    "3": {
      grade: "Grade 3",
      subject: "Geography",
      bigIdeas: [
        "Maps and globes use keys, compass roses, and grids to locate places.",
        "Earth's land is organized into continents and its water into oceans.",
        "Canada is made of provinces and territories, each with a capital.",
        "Geography — landforms and climate — shapes how and where people live."
      ],
      content: [
        { id: "G3.1", topic: "Maps",        text: "Using a map key, compass rose, and grid to locate places" },
        { id: "G3.2", topic: "Continents",  text: "The seven continents and where they are" },
        { id: "G3.3", topic: "Oceans",      text: "The five oceans and where they are" },
        { id: "G3.4", topic: "Canada",      text: "Provinces and territories of Canada and their capitals" },
        { id: "G3.5", topic: "BC",          text: "Major regions, cities, and features of British Columbia" },
        { id: "G3.6", topic: "Landforms",   text: "Landforms — mountains, rivers, plains, coasts, islands" },
        { id: "G3.7", topic: "Climate",     text: "How climate and landscape differ across regions" },
        { id: "G3.8", topic: "People",      text: "How geography shapes how and where people live" }
      ],
      competencies: [
        "Locate places using map tools (key, compass rose, grid).",
        "Name and locate the continents and oceans.",
        "Identify Canada's provinces/territories and major BC features.",
        "Explain how landforms and climate affect daily life."
      ]
    }
  },

  // ============================================================
  // BC PROFICIENCY SCALE (used across all subjects for tracking)
  // ============================================================
  proficiencyScale: [
    { id: "not_yet",     label: "Not yet",      description: "Has not yet demonstrated this skill." },
    { id: "emerging",    label: "Emerging",     description: "Initial understanding; needs support." },
    { id: "developing",  label: "Developing",   description: "Partial understanding; working toward independence." },
    { id: "proficient",  label: "Proficient",   description: "Complete understanding; works independently." },
    { id: "extending",   label: "Extending",    description: "Sophisticated understanding; applies to new contexts." }
  ],

  // ============================================================
  // PRE-K READINESS (for Oakley until he's ready for K standards)
  // ============================================================
  preK: {
    grade: "Pre-K Readiness",
    subject: "Mixed",
    bigIdeas: [
      "Letters and numbers are the building blocks of reading and math.",
      "Drawing, talking, and play are how young children make meaning."
    ],
    content: [
      { id: "PK.M1", topic: "Number",      text: "Counting forward to 10 with one-to-one correspondence" },
      { id: "PK.M2", topic: "Number",      text: "Recognizing numerals 0–10" },
      { id: "PK.M3", topic: "Geometry",    text: "Identifying basic shapes — circle, square, triangle, rectangle" },
      { id: "PK.M4", topic: "Measurement", text: "Sorting by one attribute (color, size, shape)" },
      { id: "PK.M5", topic: "Patterns",    text: "Recognizing AB repeating patterns" },
      { id: "PK.E1", topic: "Letters",     text: "Recognizing all 26 uppercase letters" },
      { id: "PK.E2", topic: "Letters",     text: "Recognizing all 26 lowercase letters" },
      { id: "PK.E3", topic: "Letters",     text: "Producing the sound for each letter (phonics readiness)" },
      { id: "PK.E4", topic: "Handwriting", text: "Tracing lines, curves, and basic letter shapes" },
      { id: "PK.E5", topic: "Listening",   text: "Listening to a read-aloud story and answering 'what happened' questions" },
      { id: "PK.E6", topic: "Speaking",    text: "Telling a simple 3-part story (beginning, middle, end)" }
    ],
    competencies: [
      "Develop fine motor control through tracing, cutting, and play.",
      "Engage with read-aloud stories and respond verbally.",
      "Use language to express ideas, needs, and feelings.",
      "Show curiosity about the world through questioning and exploration."
    ]
  }
};

/* ============================================================
   K–6 FILL-IN GRADES (2, 4, 5, 6) for math / ela / geography.
   Appended so the literal above stays intact. Stable IDs.
============================================================ */
Object.assign(window.CURRICULUM.math, {
  "2": {
    grade: "Grade 2", subject: "Mathematics",
    bigIdeas: [
      "Numbers to 100 represent quantities that can be decomposed into 10s and 1s.",
      "Addition and subtraction with numbers to 100 can be modelled and computed flexibly.",
      "Objects and shapes can be measured and compared using standard units."
    ],
    content: [
      { id: "M2.1",  topic: "Number",      text: "Number concepts to 100" },
      { id: "M2.2",  topic: "Number",      text: "Benchmarks of 25, 50, and 100 and personal referents" },
      { id: "M2.3",  topic: "Number",      text: "Addition and subtraction facts to 20 (fluency)" },
      { id: "M2.4",  topic: "Operations",  text: "Addition and subtraction to 100 (concrete, pictorial, symbolic)" },
      { id: "M2.5",  topic: "Patterns",    text: "Repeating and increasing patterns" },
      { id: "M2.6",  topic: "Equality",    text: "Symbolic representation of equality and inequality" },
      { id: "M2.7",  topic: "Measurement", text: "Direct linear measurement with standard units (cm, m)" },
      { id: "M2.8",  topic: "Measurement", text: "Measurement of mass and capacity" },
      { id: "M2.9",  topic: "Geometry",    text: "Symmetry in 2D shapes" },
      { id: "M2.10", topic: "Data",        text: "Pictographs and bar graphs (one-to-one correspondence)" },
      { id: "M2.11", topic: "Financial",   text: "Financial literacy — coins and bills to 100, and counting change" }
    ],
    competencies: ["Estimate reasonably.", "Develop mental math strategies.", "Use multiple strategies to solve problems.", "Communicate mathematical thinking in many ways."]
  },
  "4": {
    grade: "Grade 4", subject: "Mathematics",
    bigIdeas: [
      "Fractions and decimals are types of numbers that can represent quantities.",
      "Development of computational fluency with larger numbers requires flexible decomposing and composing.",
      "Regular changes in patterns can be used to make generalizations."
    ],
    content: [
      { id: "M4.1",  topic: "Number",      text: "Number concepts to 10 000" },
      { id: "M4.2",  topic: "Number",      text: "Decimals to hundredths" },
      { id: "M4.3",  topic: "Number",      text: "Fractions — equivalence and comparison" },
      { id: "M4.4",  topic: "Operations",  text: "Addition and subtraction to 10 000" },
      { id: "M4.5",  topic: "Operations",  text: "Multiplication and division facts to 100" },
      { id: "M4.6",  topic: "Operations",  text: "Multiplication of 2- or 3-digit by 1-digit" },
      { id: "M4.7",  topic: "Patterns",    text: "Increasing and decreasing patterns with rules" },
      { id: "M4.8",  topic: "Equality",    text: "One-step equations with an unknown, preserving equality" },
      { id: "M4.9",  topic: "Measurement", text: "Area and perimeter of rectangles" },
      { id: "M4.10", topic: "Measurement", text: "Time — elapsed time and the calendar" },
      { id: "M4.11", topic: "Geometry",    text: "Line symmetry" },
      { id: "M4.12", topic: "Data",        text: "Many-to-one correspondence in bar graphs" },
      { id: "M4.13", topic: "Financial",   text: "Financial literacy — money to $10 000 and simple budgets" }
    ],
    competencies: ["Estimate reasonably.", "Use multiple strategies to engage in problem solving.", "Reflect on mathematical thinking.", "Connect mathematical concepts to other areas and interests."]
  },
  "5": {
    grade: "Grade 5", subject: "Mathematics",
    bigIdeas: [
      "Numbers describe quantities that can be represented by equivalent fractions and decimals.",
      "Computational fluency with multi-digit numbers and decimals develops through flexible strategies.",
      "Data can be represented and interpreted to answer questions."
    ],
    content: [
      { id: "M5.1",  topic: "Number",      text: "Number concepts to 1 000 000" },
      { id: "M5.2",  topic: "Number",      text: "Decimals to thousandths" },
      { id: "M5.3",  topic: "Number",      text: "Equivalent fractions" },
      { id: "M5.4",  topic: "Operations",  text: "Addition and subtraction of decimals to thousandths" },
      { id: "M5.5",  topic: "Operations",  text: "Multiplication and division of 2- and 3-digit numbers" },
      { id: "M5.6",  topic: "Operations",  text: "Addition and subtraction of fractions with like denominators" },
      { id: "M5.7",  topic: "Patterns",    text: "Rules for increasing and decreasing patterns" },
      { id: "M5.8",  topic: "Equality",    text: "One-step equations with variables" },
      { id: "M5.9",  topic: "Measurement", text: "Area of triangles, parallelograms; perimeter of polygons" },
      { id: "M5.10", topic: "Measurement", text: "Volume and capacity" },
      { id: "M5.11", topic: "Geometry",    text: "Single transformations (translation, rotation, reflection)" },
      { id: "M5.12", topic: "Data",        text: "Double bar graphs" },
      { id: "M5.13", topic: "Probability", text: "Probability experiments (experimental vs theoretical)" },
      { id: "M5.14", topic: "Financial",   text: "Financial literacy — percentages and monetary calculations" }
    ],
    competencies: ["Estimate reasonably.", "Use multiple strategies to engage in problem solving.", "Explain and justify mathematical decisions.", "Represent ideas in concrete, pictorial, and symbolic forms."]
  },
  "6": {
    grade: "Grade 6", subject: "Mathematics",
    bigIdeas: [
      "Mixed numbers and decimal numbers represent quantities that can be decomposed.",
      "Computational fluency extends to operations with decimals and integers.",
      "Linear relations can be identified and represented."
    ],
    content: [
      { id: "M6.1",  topic: "Number",      text: "Number concepts to 1 000 000 000 and small fractions/decimals" },
      { id: "M6.2",  topic: "Number",      text: "Equivalence among fractions, decimals, and percents" },
      { id: "M6.3",  topic: "Operations",  text: "Multiplication and division of decimals" },
      { id: "M6.4",  topic: "Operations",  text: "Order of operations with whole numbers" },
      { id: "M6.5",  topic: "Number",      text: "Integers — concepts and ordering" },
      { id: "M6.6",  topic: "Patterns",    text: "Increasing and decreasing patterns using expressions" },
      { id: "M6.7",  topic: "Equality",    text: "One-step linear equations with whole-number coefficients" },
      { id: "M6.8",  topic: "Measurement", text: "Angle measurement and classification" },
      { id: "M6.9",  topic: "Measurement", text: "Area and perimeter of triangles and parallelograms" },
      { id: "M6.10", topic: "Geometry",    text: "Combinations of transformations" },
      { id: "M6.11", topic: "Data",        text: "Line graphs and data interpretation" },
      { id: "M6.12", topic: "Probability", text: "Single-event probability using ratios and percents" },
      { id: "M6.13", topic: "Financial",   text: "Financial literacy — simple budgeting and consumer math" }
    ],
    competencies: ["Estimate reasonably.", "Apply multiple strategies to solve problems.", "Explain and justify reasoning.", "Connect concepts to other areas and personal interests."]
  }
});

Object.assign(window.CURRICULUM.ela, {
  "2": {
    grade: "Grade 2", subject: "English Language Arts",
    bigIdeas: [
      "Stories and other texts help us learn about ourselves and our families.",
      "Playing with language helps us discover how language works.",
      "Curiosity and wonder lead us to new discoveries about the world."
    ],
    content: [
      { id: "E2.1",  topic: "Story",       text: "Elements of story — setting, character, events with detail" },
      { id: "E2.2",  topic: "Story",       text: "Literary devices — rhyme, rhythm, alliteration" },
      { id: "E2.3",  topic: "Reading",     text: "Reading strategies — decoding, fluency, self-monitoring, comprehension" },
      { id: "E2.4",  topic: "Vocabulary",  text: "Text features and vocabulary to talk about texts" },
      { id: "E2.5",  topic: "Phonics",     text: "Phonics and word patterns — blends, digraphs, vowel patterns" },
      { id: "E2.6",  topic: "Oral",        text: "Oral language strategies — listening, turn-taking, retelling" },
      { id: "E2.7",  topic: "Writing",     text: "Writing processes — planning, drafting, revising for audience" },
      { id: "E2.8",  topic: "Handwriting", text: "Legible printing with consistent spacing" },
      { id: "E2.9",  topic: "Grammar",     text: "Sentence structure — complete simple and compound sentences" },
      { id: "E2.10", topic: "Conventions", text: "Conventions — capitals, end punctuation, commas in a list" }
    ],
    competencies: ["Read fluently at grade level.", "Use reading strategies to make meaning.", "Create texts for different purposes.", "Apply conventions of spelling, grammar, and punctuation."]
  },
  "4": {
    grade: "Grade 4", subject: "English Language Arts",
    bigIdeas: [
      "Exploring stories and other texts helps us understand ourselves and others.",
      "Texts can be understood from different perspectives.",
      "Using language creatively helps us understand how language works."
    ],
    content: [
      { id: "E4.1",  topic: "Story",       text: "Elements of story — character, plot, setting, theme, point of view" },
      { id: "E4.2",  topic: "Story",       text: "Forms, functions, and genres of texts" },
      { id: "E4.3",  topic: "Story",       text: "Text features — headings, captions, diagrams, index" },
      { id: "E4.4",  topic: "Story",       text: "Literary devices — simile, metaphor, personification" },
      { id: "E4.5",  topic: "Reading",     text: "Reading strategies — inferring, summarizing, identifying main idea" },
      { id: "E4.6",  topic: "Oral",        text: "Oral language strategies — discussion, presenting, questioning" },
      { id: "E4.7",  topic: "Metacognition", text: "Strategies — goal setting, self-monitoring, reflecting" },
      { id: "E4.8",  topic: "Writing",     text: "Writing processes — drafting and revising for purpose and audience" },
      { id: "E4.9",  topic: "Grammar",     text: "Paragraph structure and sentence variety" },
      { id: "E4.10", topic: "Vocabulary",  text: "Word patterns, roots, prefixes, and suffixes" },
      { id: "E4.11", topic: "Conventions", text: "Conventions — paragraphing, quotation marks, apostrophes" }
    ],
    competencies: ["Read fluently and comprehend grade-level texts.", "Make connections and inferences.", "Plan and create a variety of texts.", "Apply expanding word knowledge and conventions."]
  },
  "5": {
    grade: "Grade 5", subject: "English Language Arts",
    bigIdeas: [
      "Texts can reflect different perspectives and deepen understanding.",
      "Questioning what we hear, read, and view contributes to our ability to be educated citizens.",
      "Using language creatively and critically helps us understand how it works."
    ],
    content: [
      { id: "E5.1",  topic: "Story",       text: "Elements of story — complex character, conflict, theme" },
      { id: "E5.2",  topic: "Story",       text: "Forms and genres, including persuasive and informational texts" },
      { id: "E5.3",  topic: "Story",       text: "Literary devices — imagery, symbolism, figurative language" },
      { id: "E5.4",  topic: "Reading",     text: "Reading strategies — synthesizing, evaluating, citing evidence" },
      { id: "E5.5",  topic: "Oral",        text: "Oral language — presenting, debating, active listening" },
      { id: "E5.6",  topic: "Metacognition", text: "Strategies — goal setting, reflecting, self-evaluating" },
      { id: "E5.7",  topic: "Writing",     text: "Writing processes — organizing multi-paragraph compositions" },
      { id: "E5.8",  topic: "Grammar",     text: "Complex sentences and paragraph cohesion" },
      { id: "E5.9",  topic: "Vocabulary",  text: "Word origins, roots, and shades of meaning" },
      { id: "E5.10", topic: "Conventions", text: "Conventions — punctuation, capitalization, paragraph structure" }
    ],
    competencies: ["Comprehend and analyze grade-level texts.", "Synthesize ideas from multiple sources.", "Create coherent, organized texts.", "Apply word knowledge and Canadian spelling conventions."]
  },
  "6": {
    grade: "Grade 6", subject: "English Language Arts",
    bigIdeas: [
      "Developing our understanding of how language works helps us communicate effectively.",
      "Questioning texts and sources helps us become educated, critical citizens.",
      "Texts reflect and shape the perspectives of their creators and audiences."
    ],
    content: [
      { id: "E6.1",  topic: "Story",       text: "Elements of story — theme, perspective, complex plot structures" },
      { id: "E6.2",  topic: "Story",       text: "Forms and genres, including persuasive and argument texts" },
      { id: "E6.3",  topic: "Story",       text: "Literary devices — figurative language, tone, voice" },
      { id: "E6.4",  topic: "Reading",     text: "Reading strategies — critical analysis, inference, evaluating sources" },
      { id: "E6.5",  topic: "Oral",        text: "Oral language — formal presentations and structured discussion" },
      { id: "E6.6",  topic: "Metacognition", text: "Strategies — reflecting, goal setting, transferring learning" },
      { id: "E6.7",  topic: "Writing",     text: "Writing processes — essays and structured multi-paragraph texts" },
      { id: "E6.8",  topic: "Grammar",     text: "Sentence variety, clauses, and paragraph organization" },
      { id: "E6.9",  topic: "Vocabulary",  text: "Roots, affixes, connotation, and academic vocabulary" },
      { id: "E6.10", topic: "Conventions", text: "Conventions — citing sources, punctuation, and Canadian spelling" }
    ],
    competencies: ["Comprehend and critically analyze a range of texts.", "Evaluate and cite sources.", "Create well-structured texts for varied purposes.", "Apply academic vocabulary and conventions."]
  }
});

Object.assign(window.CURRICULUM.geography, {
  "2": {
    grade: "Grade 2", subject: "Geography",
    bigIdeas: [
      "Maps and globes represent real places at different scales.",
      "Communities around the world meet their needs in different environments."
    ],
    content: [
      { id: "G2.1", topic: "Maps",       text: "Maps and globes, map keys, and the cardinal directions" },
      { id: "G2.2", topic: "Community",  text: "Communities around the world and how they meet needs" },
      { id: "G2.3", topic: "Canada",     text: "Canada's regions — an introduction" },
      { id: "G2.4", topic: "Landforms",  text: "Landforms and bodies of water" },
      { id: "G2.5", topic: "Climate",    text: "Weather and climate in different places" },
      { id: "G2.6", topic: "People",     text: "How people use and adapt to the land" }
    ],
    competencies: ["Use maps, globes, and directions to locate places.", "Compare communities and environments.", "Describe how people interact with their environment."]
  },
  "4": {
    grade: "Grade 4", subject: "Geography",
    bigIdeas: [
      "Maps use grids, scale, and legends to represent places accurately.",
      "Canada's physical regions and climate shape its communities.",
      "The land has been home to Indigenous peoples since time immemorial."
    ],
    content: [
      { id: "G4.1", topic: "Maps",        text: "Map skills — grid references, scale, and legends" },
      { id: "G4.2", topic: "Canada",      text: "Provinces, territories, and capital cities of Canada" },
      { id: "G4.3", topic: "Canada",      text: "Physical regions of Canada" },
      { id: "G4.4", topic: "Climate",     text: "Climate zones across Canada" },
      { id: "G4.5", topic: "Resources",   text: "Natural resources and how they are used" },
      { id: "G4.6", topic: "Continents",  text: "Continents and oceans (deepening)" },
      { id: "G4.7", topic: "People",      text: "Indigenous territories and place names" },
      { id: "G4.8", topic: "People",      text: "How environment shapes where and how people live" }
    ],
    competencies: ["Use map tools to locate and describe places.", "Identify Canada's regions and features.", "Explain relationships between environment and people."]
  },
  "5": {
    grade: "Grade 5", subject: "Geography",
    bigIdeas: [
      "Latitude, longitude, and hemispheres locate places precisely on Earth.",
      "North America's physical and political geography shapes its peoples and economies.",
      "Human activity affects ecosystems and environments."
    ],
    content: [
      { id: "G5.1", topic: "Maps",       text: "Latitude, longitude, hemispheres, and the equator" },
      { id: "G5.2", topic: "Canada",     text: "Canada's physical and political geography" },
      { id: "G5.3", topic: "World",      text: "North America — USA, Mexico, and neighbours" },
      { id: "G5.4", topic: "Climate",    text: "Biomes and ecosystems" },
      { id: "G5.5", topic: "Resources",  text: "Natural resources and the economy" },
      { id: "G5.6", topic: "People",     text: "Population and settlement patterns" },
      { id: "G5.7", topic: "People",     text: "Human impact on the environment" }
    ],
    competencies: ["Locate places using coordinates.", "Compare regions of North America.", "Analyze human–environment interactions."]
  },
  "6": {
    grade: "Grade 6", subject: "Geography",
    bigIdeas: [
      "The world is organized into regions with distinct physical and human features.",
      "Maps and projections represent the world in different ways.",
      "Global systems connect peoples, economies, and environments."
    ],
    content: [
      { id: "G6.1", topic: "World",      text: "World regions, continents, and major countries" },
      { id: "G6.2", topic: "World",      text: "Major world capitals and cities" },
      { id: "G6.3", topic: "Climate",    text: "Global climate zones and biomes" },
      { id: "G6.4", topic: "Landforms",  text: "Major physical features — mountains, rivers, deserts" },
      { id: "G6.5", topic: "People",     text: "World cultures and population distribution" },
      { id: "G6.6", topic: "Resources",  text: "Economic geography — trade and resources" },
      { id: "G6.7", topic: "Maps",       text: "Maps, projections, and global positioning" },
      { id: "G6.8", topic: "People",     text: "Global environmental issues" }
    ],
    competencies: ["Locate and describe world regions.", "Interpret different map projections.", "Analyze global connections and issues."]
  }
});

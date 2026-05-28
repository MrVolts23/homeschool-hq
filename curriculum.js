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

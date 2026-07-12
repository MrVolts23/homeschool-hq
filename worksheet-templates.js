/* ============================================================
   Worksheet Templates — Scholastic-style printables
   Modeled after the reference workbook Mike uploaded.

   Each template defines:
     - id, label, subject, grades[]
     - modifiers[]    — config schema for the UI
     - generate(mods) — produces problem content locally (no AI)
     - renderPDF(doc, content, mods, kid) — draws onto jsPDF

   Visual style:
     - Gray rounded title bar at top
     - Optional bordered worked-example box
     - Grid of problems with answer space
     - Times for headings, Courier for stacked math, sans for instructions
============================================================ */
window.TEMPLATES = {};

/* ------------------------------------------------------------
   SHARED PDF HELPERS
------------------------------------------------------------ */
function pdfDrawTitleBar(doc, text, y, pageW, margin) {
  const h = 30;
  doc.setFillColor(220, 220, 220);
  doc.roundedRect(margin, y, pageW - margin * 2, h, 6, 6, "F");
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(text, margin + 12, y + 20);
  return y + h + 14;
}

function pdfDrawInstruction(doc, text, y, pageW, margin) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(text, pageW - margin * 2);
  doc.text(lines, margin, y);
  return y + lines.length * 14 + 6;
}

function pdfDrawWorkedExampleBox(doc, render, y, pageW, margin, height) {
  // Returns new y. `render(x, y, w, h)` draws inside the box.
  const x = margin;
  const w = pageW - margin * 2;
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.7);
  doc.rect(x, y, w, height, "S");
  render(x + 14, y + 8, w - 28, height - 16);
  return y + height + 18;
}

function pdfDrawNameDateLine(doc, y, pageW, margin) {
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const name = (window.__wsKidName || "").trim();
  if (name) {
    // Pre-printed with the child's name; only the date is left blank.
    doc.setFont("helvetica", "normal");
    doc.text("Name: ", margin, y);
    const labelW = doc.getTextWidth("Name: ");
    doc.setFont("helvetica", "bold");
    doc.text(name, margin + labelW, y);
    doc.setFont("helvetica", "normal");
    doc.text("Date: ______________", pageW - margin, y, { align: "right" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.text("Name: ______________________________     Date: ______________", margin, y);
  }
  return y + 18;
}

/* ============================================================
   PAGINATION HELPERS
   - pdfNeedNewPage: returns true if y + neededH would overflow
   - pdfAddPage: adds page, redraws title bar as "(cont.)", returns new y
   - pdfStampFooters: after all rendering, stamps "Page X of Y" footer
     on every page in one pass.
============================================================ */
function pdfNeedNewPage(doc, y, neededH, margin) {
  const pageH = doc.internal.pageSize.getHeight();
  return y + neededH > pageH - margin - 30;
}

function pdfAddPageWithHeader(doc, title, pageW, margin) {
  doc.addPage();
  let y = margin;
  y = pdfDrawNameDateLine(doc, y, pageW, margin);
  y = pdfDrawTitleBar(doc, title + "  (continued)", y, pageW, margin);
  y += 6;
  return y;
}

function pdfStampFooters(doc, kid, pageW, pageH, margin) {
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(140);
    const gradeText = kid.gradeKey === "K" ? "Kindergarten" : "Grade " + kid.gradeKey;
    const codeSuffix = (typeof window !== "undefined" && window.__wsCode) ? `  •  ${window.__wsCode}` : "";
    const left = `SOVRN Homeschool HQ • ${kid.name} • BC ${gradeText}${codeSuffix}`;
    const right = `Page ${p} of ${total}`;
    doc.text(left, margin, pageH - 20);
    doc.text(right, pageW - margin, pageH - 20, { align: "right" });
  }
}

/* ============================================================
   SCHOLASTIC-STYLE HELPERS
   Replicates the visual language of Scholastic Success workbooks:
   - Purple banner across top with category label in white
   - Large teal title
   - Tinted lavender hint box on the right
   - Orange/coral numbered dot circles next to each item
============================================================ */
const SCHOLASTIC_PURPLE = [76, 47, 110];
const SCHOLASTIC_TEAL = [33, 130, 130];
const SCHOLASTIC_HINT_BG = [232, 226, 240];
const SCHOLASTIC_ORANGE = [231, 105, 56];

function pdfDrawScholasticHeader(doc, categoryLabel, title, pageW, margin) {
  // Purple banner across full width
  const bannerH = 36;
  doc.setFillColor(...SCHOLASTIC_PURPLE);
  doc.rect(0, 0, pageW, bannerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(categoryLabel, margin, 22);

  // Big teal title
  let y = bannerH + 30;
  doc.setTextColor(...SCHOLASTIC_TEAL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(title, margin, y);
  doc.setTextColor(20, 20, 20);
  return y + 14;
}

// Side hint box positioned to the right of the title area.
// Returns the y at the bottom of the hint box so caller can align.
function pdfDrawSideHintBox(doc, lines, x, y, w, lineH) {
  lineH = lineH || 13;
  const h = lines.length * lineH + 16;
  doc.setFillColor(...SCHOLASTIC_HINT_BG);
  doc.roundedRect(x, y, w, h, 6, 6, "F");
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  lines.forEach((line, i) => {
    if (line && line.bold) {
      doc.setFont("helvetica", "bold");
      doc.text(line.text, x + 10, y + 14 + i * lineH);
      doc.setFont("helvetica", "normal");
    } else {
      doc.text(typeof line === "string" ? line : line.text, x + 10, y + 14 + i * lineH);
    }
  });
  return y + h;
}

function pdfDrawNumberedDot(doc, label, cx, cy, r, color) {
  r = r || 9;
  doc.setFillColor(...(color || SCHOLASTIC_ORANGE));
  doc.circle(cx, cy, r, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(label.length > 1 ? 9 : 11);
  doc.text(label, cx, cy + 4, { align: "center" });
  doc.setTextColor(20, 20, 20);
}

// Pick N items from an array using a Fisher-Yates style approach.
// Returns up to N items, even if the source is shorter (no padding).
function pickItems(source, n) {
  const arr = [...source];
  const out = [];
  while (out.length < n && arr.length > 0) {
    const idx = Math.floor(Math.random() * arr.length);
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

function pickThemeKey(themes, requestedTheme) {
  if (requestedTheme && requestedTheme !== "random" && themes[requestedTheme]) return requestedTheme;
  const keys = Object.keys(themes);
  return keys[Math.floor(Math.random() * keys.length)];
}

// Apply capital first letter + question mark to a lowercase question.
function fixQuestionCase(q) {
  const trimmed = q.replace(/[?.\s]+$/, "");
  const fixed = trimmed.charAt(0).toUpperCase() + trimmed.slice(1) + "?";
  return fixed;
}

/* ============================================================
   TEMPLATE 1 — VERTICAL ARITHMETIC (stacked +/-, regrouping)
   Covers:
     - Image 1: Subtracting Three-Digit Numbers (Borrowing)
     - Image 3: Adding Three-Digit Numbers (Carrying)
     - Image 5: Adding Three 2-Digit Numbers
============================================================ */
window.TEMPLATES.vertical_arithmetic = {
  id: "vertical_arithmetic",
  label: "Vertical arithmetic (stacked)",
  subject: "math",
  grades: ["1", "3"],
  topicHint: "Operations",

  modifiers: [
    { id: "operation", type: "select", label: "Operation",
      options: [
        { value: "addition", label: "Addition (+)" },
        { value: "subtraction", label: "Subtraction (−)" },
        { value: "mixed", label: "Mixed +/−" }
      ], default: "addition" },
    { id: "digits", type: "select", label: "Number of digits",
      options: [
        { value: "1", label: "1 digit (0–9)" },
        { value: "2", label: "2 digits (10–99)" },
        { value: "3", label: "3 digits (100–999)" },
        { value: "4", label: "4 digits (1,000–9,999)" }
      ], default: "3" },
    { id: "stackHeight", type: "select", label: "Stack height (# numbers)",
      options: [
        { value: "2", label: "2 numbers" },
        { value: "3", label: "3 numbers" },
        { value: "4", label: "4 numbers" }
      ], default: "2" },
    { id: "regrouping", type: "select", label: "Regrouping",
      options: [
        { value: "no", label: "No regrouping (easier)" },
        { value: "yes", label: "Always regroup (harder)" },
        { value: "mixed", label: "Mixed" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of problems", default: 12, min: 4, max: 24 },
    { id: "columns", type: "select", label: "Columns",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" }
      ], default: "4" },
    { id: "workedExample", type: "boolean", label: "Show worked example at top", default: true }
  ],

  /* Generate problem content locally — no AI required */
  generate(m) {
    const digits = parseInt(m.digits, 10);
    const stack = parseInt(m.stackHeight, 10);
    const count = parseInt(m.count, 10);
    const min = digits === 1 ? 0 : Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const problems = [];

    let attempts = 0;
    while (problems.length < count && attempts < count * 50) {
      attempts++;
      const op = m.operation === "mixed"
        ? (Math.random() < 0.5 ? "+" : "-")
        : (m.operation === "subtraction" ? "-" : "+");
      const wantsRegroup = m.regrouping === "yes" ? true
        : m.regrouping === "no" ? false
        : Math.random() < 0.6;

      let numbers = [];
      for (let i = 0; i < stack; i++) {
        numbers.push(randInt(min, max));
      }

      if (op === "-") {
        // Subtraction: always largest first; bottom <= top
        numbers.sort((a, b) => b - a);
        if (stack > 2) {
          // Multi-stack subtraction is rare; only allow if remaining >= 0 each step
          let result = numbers[0];
          let valid = true;
          for (let i = 1; i < numbers.length; i++) {
            result -= numbers[i];
            if (result < 0) { valid = false; break; }
          }
          if (!valid) continue;
        }
        const needs = needsBorrow(numbers, digits);
        if (wantsRegroup !== needs) continue;
        const answer = numbers.reduce((acc, n, i) => i === 0 ? n : acc - n, 0);
        problems.push({ numbers, op, answer });
      } else {
        const needs = needsCarry(numbers);
        if (wantsRegroup !== needs) continue;
        const answer = numbers.reduce((a, b) => a + b, 0);
        problems.push({ numbers, op, answer });
      }
    }

    // Worked example (one extra)
    let example = null;
    if (m.workedExample) {
      const ex = problems[0] || { numbers: [385, 227], op: "-", answer: 158 };
      example = { ...ex };
    }

    return { problems, example, modifiers: m };
  },

  /* Render PDF in Scholastic style */
  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    // Title
    const opLabel = m.operation === "addition" ? "Adding" : m.operation === "subtraction" ? "Subtracting" : "Adding & Subtracting";
    const digitLabel = ["", "One", "Two", "Three", "Four"][parseInt(m.digits, 10)];
    const stackLabel = m.stackHeight === "2" ? "" : (m.stackHeight + " ");
    const regroupLabel = m.regrouping === "yes" ? ": Regrouping" : m.regrouping === "no" ? ": No Regrouping" : "";
    const title = `${opLabel} ${stackLabel}${digitLabel}-Digit Numbers${regroupLabel}`;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);

    if (content.example) {
      y = pdfDrawWorkedExampleBox(doc, (x, ey, w, h) => {
        renderWorkedSteps(doc, content.example, x, ey, w, h);
      }, y, pageW, margin, 110);
    }

    // Grid of problems — paginate when grid fills the page
    const cols = parseInt(m.columns, 10);
    const colW = (pageW - margin * 2) / cols;
    const rowH = 110;

    let pageStartY = y;
    let pageCellOffset = 0; // index of first item on the current page

    content.problems.forEach((p, i) => {
      const itemOnPage = i - pageCellOffset;
      const col = itemOnPage % cols;
      const row = Math.floor(itemOnPage / cols);
      const cellY = pageStartY + row * rowH;
      if (cellY + rowH > pageH - margin - 30) {
        // New page
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
        pageStartY = y;
        pageCellOffset = i;
        const newItemOnPage = 0;
        const newCol = 0;
        const newCellY = pageStartY;
        renderVerticalProblem(doc, p, margin + newCol * colW + colW / 2, newCellY + 20, { showAnswer: opts.showAnswers });
      } else {
        const x = margin + col * colW + colW / 2;
        renderVerticalProblem(doc, p, x, cellY + 20, { showAnswer: opts.showAnswers });
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderWorkedSteps(doc, ex, x, y, w, h) {
  // Show 3 columns: "Subtract the ones | Next subtract the tens | Then subtract the hundreds"
  // Only valid for digits<=3 and stack=2
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const stepLabels = ex.op === "+"
    ? ["Add the ones", "Next add the tens", "Then add the hundreds"]
    : ["Subtract the ones", "Next subtract the tens", "Then subtract the hundreds"];

  const digits = String(ex.numbers[0]).length;
  const colCount = Math.min(digits, 3);
  const colW = w / colCount;

  for (let c = 0; c < colCount; c++) {
    const cx = x + c * colW + colW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(stepLabels[c] || "", cx, y + 10, { align: "center" });
    // Show progressive answer build-up
    const partial = computePartialAnswer(ex, c + 1);
    renderVerticalProblem(doc, { ...ex, partialAnswer: partial, partialDigits: c + 1 }, cx, y + 22, { showAnswer: false, highlightCol: c });
  }
}

function computePartialAnswer(ex, upToDigitsFromRight) {
  // Returns the digits of the answer counted from the right, up to N digits.
  const ans = String(ex.answer);
  if (upToDigitsFromRight >= ans.length) return ans;
  return ans.slice(-upToDigitsFromRight);
}

function renderVerticalProblem(doc, p, centerX, topY, opts = {}) {
  // Stacked vertical layout. centerX is the right-edge anchor.
  doc.setFont("courier", "normal");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  const lineHeight = 20;

  // Render each number right-aligned to centerX
  const digits = Math.max(...p.numbers.map(n => String(n).length));
  const charW = 11; // approximate width per digit at 16pt courier
  const rightX = centerX + (digits * charW) / 2;

  p.numbers.forEach((n, i) => {
    const numStr = String(n);
    let prefix = "";
    if (i === p.numbers.length - 1) {
      prefix = p.op === "+" ? "+" : "-";
    }
    const fullStr = prefix + " " + numStr.padStart(digits, " ");
    doc.text(fullStr, rightX, topY + i * lineHeight, { align: "right" });
  });

  // Horizontal answer line
  const lineY = topY + p.numbers.length * lineHeight + 2;
  const lineLeft = rightX - (digits + 1.4) * charW;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.8);
  doc.line(lineLeft, lineY, rightX + 2, lineY);

  if (opts.showAnswer || p.partialAnswer) {
    doc.setFont("courier", "normal");
    doc.setFontSize(16);
    const ansStr = p.partialAnswer || String(p.answer);
    doc.text(ansStr.padStart(digits, " "), rightX, lineY + 16, { align: "right" });
  }
}

function needsCarry(numbers) {
  // For addition: any column sum >= 10?
  const maxDigits = Math.max(...numbers.map(n => String(n).length));
  for (let pos = 0; pos < maxDigits; pos++) {
    const colSum = numbers.reduce((sum, n) => sum + Math.floor(n / Math.pow(10, pos)) % 10, 0);
    if (colSum >= 10) return true;
  }
  return false;
}

function needsBorrow(numbers, digits) {
  // For 2-number subtraction: top digit < bottom digit in any column
  if (numbers.length !== 2) return false;
  const [top, bot] = numbers;
  for (let pos = 0; pos < digits; pos++) {
    const tDig = Math.floor(top / Math.pow(10, pos)) % 10;
    const bDig = Math.floor(bot / Math.pow(10, pos)) % 10;
    if (tDig < bDig) return true;
  }
  return false;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* ============================================================
   TEMPLATE 2 — BALANCE THE EQUATIONS
   (Image 2)
============================================================ */
window.TEMPLATES.balance_equations = {
  id: "balance_equations",
  label: "Balance the equations",
  subject: "math",
  grades: ["1", "3"],
  topicHint: "Equality",

  modifiers: [
    { id: "operation", type: "select", label: "Operation",
      options: [
        { value: "addition", label: "Addition only" },
        { value: "subtraction", label: "Subtraction only" },
        { value: "mixed", label: "Mixed" }
      ], default: "addition" },
    { id: "maxValue", type: "select", label: "Number range",
      options: [
        { value: "10", label: "Up to 10" },
        { value: "20", label: "Up to 20" },
        { value: "50", label: "Up to 50" },
        { value: "100", label: "Up to 100" }
      ], default: "20" },
    { id: "count", type: "number", label: "# of equations", default: 10, min: 4, max: 16 },
    { id: "workedExample", type: "boolean", label: "Show worked example", default: true }
  ],

  generate(m) {
    const maxVal = parseInt(m.maxValue, 10);
    const count = parseInt(m.count, 10);
    const problems = [];

    while (problems.length < count) {
      const total = randInt(Math.floor(maxVal / 2), maxVal);
      const a = randInt(1, total - 1);
      const b = total - a;
      const c = randInt(1, total - 1);
      const d = total - c;
      if (b < 1 || d < 1) continue;
      // a + b = c + d, where d is the unknown OR a is the unknown
      const unknownSide = Math.random() < 0.5 ? "left" : "right";
      const unknownPos = Math.random() < 0.5 ? 0 : 1;
      problems.push({
        left: [a, b],
        right: [c, d],
        total,
        unknownSide,
        unknownPos,
        op: "+"
      });
    }

    const example = m.workedExample ? {
      left: [8, 7],
      right: [10, 5],
      total: 15,
      unknownSide: "left",
      unknownPos: 0,
      op: "+"
    } : null;

    return { problems, example, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, "Balance the Equations", y, pageW, margin);
    y = pdfDrawInstruction(doc, "Fill in the numbers to make each equation true.", y, pageW, margin);

    if (content.example) {
      y = pdfDrawWorkedExampleBox(doc, (x, ey, w, h) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(16);
        doc.setTextColor(20, 20, 20);
        const ex = content.example;
        const eqStr = `[${ex.left[ex.unknownPos]}] + ${ex.left[1 - ex.unknownPos]} = ${ex.right[0]} + ${ex.right[1]}`;
        doc.text(eqStr, x + w / 2, ey + 24, { align: "center" });
        doc.setFontSize(11);
        doc.setTextColor(80);
        doc.text(`${ex.total}  =  ${ex.total}`, x + w / 2, ey + 50, { align: "center" });
      }, y, pageW, margin, 80);
    }

    // 2-column grid with pagination
    const colW = (pageW - margin * 2) / 2;
    const rowH = 56;
    const title = "Balance the Equations";
    let pageStartY = y;
    let pageOffset = 0;

    content.problems.forEach((p, i) => {
      const itemOnPage = i - pageOffset;
      const col = itemOnPage % 2;
      const row = Math.floor(itemOnPage / 2);
      const py = pageStartY + row * rowH;
      if (py + rowH > pageH - margin - 30) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
        pageStartY = y;
        pageOffset = i;
        renderBalanceProblem(doc, p, margin + 20, pageStartY + 22, opts.showAnswers);
      } else {
        const x = margin + col * colW;
        renderBalanceProblem(doc, p, x + 20, py + 22, opts.showAnswers);
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderBalanceProblem(doc, p, x, y, showAnswers) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(20);

  const leftNum = (side) => side === "left" ? `[${showAnswers ? p.left[p.unknownPos] : "    "}]` : p.left[p.unknownPos === 0 ? 1 : 0];
  // Render: [box] + N = M + K  or similar based on unknownSide/pos
  // Simplify by always rendering both sides explicitly
  let parts = [];
  if (p.unknownSide === "left") {
    if (p.unknownPos === 0) {
      parts = [box(showAnswers ? p.left[0] : null), " + ", String(p.left[1]), " = ", String(p.right[0]), " + ", String(p.right[1])];
    } else {
      parts = [String(p.left[0]), " + ", box(showAnswers ? p.left[1] : null), " = ", String(p.right[0]), " + ", String(p.right[1])];
    }
  } else {
    if (p.unknownPos === 0) {
      parts = [String(p.left[0]), " + ", String(p.left[1]), " = ", box(showAnswers ? p.right[0] : null), " + ", String(p.right[1])];
    } else {
      parts = [String(p.left[0]), " + ", String(p.left[1]), " = ", String(p.right[0]), " + ", box(showAnswers ? p.right[1] : null)];
    }
  }

  // Render parts left-to-right, treating "[N]" or "[ ]" as a real box
  let cx = x;
  parts.forEach(part => {
    if (part.startsWith("[")) {
      // box
      const isNum = /\[(\d+)\]/.test(part);
      const num = isNum ? part.match(/\[(\d+)\]/)[1] : "";
      doc.setDrawColor(20);
      doc.setLineWidth(0.6);
      doc.rect(cx, y - 14, 28, 18, "S");
      if (num) {
        doc.text(num, cx + 14, y, { align: "center" });
      }
      cx += 34;
    } else {
      doc.text(part, cx, y);
      cx += doc.getTextWidth(part);
    }
  });
}
function box(num) { return num !== null ? `[${num}]` : "[ ]"; }

/* ============================================================
   TEMPLATE 3 — NUMBER ORDER (least to greatest)
   (Image 4)
============================================================ */
window.TEMPLATES.number_order = {
  id: "number_order",
  label: "Number order (least to greatest)",
  subject: "math",
  grades: ["1", "3"],
  topicHint: "Number",

  modifiers: [
    { id: "valueRange", type: "select", label: "Number range",
      options: [
        { value: "20", label: "Up to 20" },
        { value: "100", label: "Up to 100" },
        { value: "1000", label: "Up to 1,000" }
      ], default: "100" },
    { id: "numbersPerGroup", type: "select", label: "Numbers per group",
      options: [
        { value: "4", label: "4" },
        { value: "5", label: "5" },
        { value: "6", label: "6" }
      ], default: "5" },
    { id: "count", type: "number", label: "# of groups", default: 5, min: 2, max: 8 },
    { id: "direction", type: "select", label: "Direction",
      options: [
        { value: "ascending", label: "Least → greatest" },
        { value: "descending", label: "Greatest → least" }
      ], default: "ascending" },
    { id: "workedExample", type: "boolean", label: "Show worked example", default: true }
  ],

  generate(m) {
    const range = parseInt(m.valueRange, 10);
    const per = parseInt(m.numbersPerGroup, 10);
    const count = parseInt(m.count, 10);
    const problems = [];

    for (let i = 0; i < count; i++) {
      const set = new Set();
      while (set.size < per) set.add(randInt(2, range));
      const numbers = Array.from(set);
      const sorted = [...numbers].sort((a, b) => m.direction === "descending" ? b - a : a - b);
      problems.push({ numbers, sorted });
    }

    const example = m.workedExample ? {
      numbers: [35, 28, 75, 15, 82],
      sorted: [15, 28, 35, 75, 82]
    } : null;

    return { problems, example, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, "Number Order", y, pageW, margin);
    const dirText = m.direction === "descending" ? "greatest to least" : "least to greatest";
    y = pdfDrawInstruction(doc, `Put the numbers in order from ${dirText}.`, y, pageW, margin);

    const title = "Number Order";
    if (content.example) {
      renderNumberOrderRow(doc, content.example, margin, y, pageW - margin * 2, true);
      y += 80;
    }

    content.problems.forEach((p, i) => {
      if (pdfNeedNewPage(doc, y, 80, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      renderNumberOrderRow(doc, p, margin, y, pageW - margin * 2, opts.showAnswers);
      y += 80;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderNumberOrderRow(doc, p, x, y, w, showAnswers) {
  // Left half: circles with numbers (clustered)
  const leftW = w / 2 - 20;
  const circleR = 18;
  const perRow = 3;
  p.numbers.forEach((n, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const cx = x + 30 + col * (circleR * 2 + 12);
    const cy = y + 18 + row * (circleR * 2 + 4);
    doc.setDrawColor(20);
    doc.setLineWidth(0.8);
    doc.circle(cx, cy, circleR, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(String(n), cx, cy + 5, { align: "center" });
  });

  // Right half: answer lines
  const rightX = x + w / 2 + 10;
  const lineY = y + 36;
  const slotW = (w / 2 - 20) / p.sorted.length;
  for (let i = 0; i < p.sorted.length; i++) {
    const lx = rightX + i * slotW;
    if (showAnswers) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(13);
      doc.text(String(p.sorted[i]), lx + slotW / 2, lineY - 3, { align: "center" });
    }
    doc.setDrawColor(60);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(lx + 4, lineY, lx + slotW - 4, lineY);
    doc.setLineDashPattern([], 0);
  }
}

/* ============================================================
   TEMPLATE 4 — ADD/SUBTRACT 10
   (Image 6)
============================================================ */
window.TEMPLATES.add_subtract_10 = {
  id: "add_subtract_10",
  label: "Adding 10, Subtracting 10",
  subject: "math",
  grades: ["1", "3"],
  topicHint: "Number",

  modifiers: [
    { id: "operation", type: "select", label: "Operation",
      options: [
        { value: "add", label: "Add 10 only" },
        { value: "subtract", label: "Subtract 10 only" },
        { value: "both", label: "Both (add then subtract)" }
      ], default: "both" },
    { id: "maxValue", type: "select", label: "Number range",
      options: [
        { value: "100", label: "Up to 100" },
        { value: "1000", label: "Up to 1,000" }
      ], default: "1000" },
    { id: "count", type: "number", label: "# of problems per operation", default: 5, min: 3, max: 10 }
  ],

  generate(m) {
    const max = parseInt(m.maxValue, 10);
    const count = parseInt(m.count, 10);
    const adds = [];
    const subs = [];

    if (m.operation === "add" || m.operation === "both") {
      while (adds.length < count) {
        const a = randInt(2, max - 10);
        adds.push({ a, op: "+", answer: a + 10 });
      }
    }
    if (m.operation === "subtract" || m.operation === "both") {
      while (subs.length < count) {
        const a = randInt(15, max);
        subs.push({ a, op: "-", answer: a - 10 });
      }
    }
    return { adds, subs, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, "Adding 10, Subtracting 10", y, pageW, margin);

    const colW = (pageW - margin * 2) / 2;

    const title = "Adding 10, Subtracting 10";
    const drawSection = (label, problems) => {
      if (!problems.length) return;
      if (pdfNeedNewPage(doc, y, 40, margin)) y = pdfAddPageWithHeader(doc, title, pageW, margin);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text(label, margin, y); y += 6;
      let startY = y;
      let pageOffset = 0;
      problems.forEach((p, i) => {
        const itemOnPage = i - pageOffset;
        const col = itemOnPage % 2;
        const row = Math.floor(itemOnPage / 2);
        const py = startY + row * 38 + 24;
        if (py > pageH - margin - 30) {
          y = pdfAddPageWithHeader(doc, title, pageW, margin);
          startY = y;
          pageOffset = i;
          renderHorizontalAddSub(doc, p, margin + 10, startY + 24, opts.showAnswers);
        } else {
          const x = margin + col * colW + 10;
          renderHorizontalAddSub(doc, p, x, py, opts.showAnswers);
        }
      });
      y = startY + Math.ceil((problems.length - pageOffset) / 2) * 38 + 30;
    };

    drawSection("Add 10.", content.adds);
    drawSection("Subtract 10.", content.subs);

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderHorizontalAddSub(doc, p, x, y, showAnswers) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(20);
  const eqStr = `${p.a}  ${p.op}  10  =`;
  doc.text(eqStr, x, y);
  // Answer box
  const w = doc.getTextWidth(eqStr);
  const boxX = x + w + 8;
  doc.setDrawColor(20);
  doc.setLineWidth(0.7);
  doc.rect(boxX, y - 14, 50, 20, "S");
  if (showAnswers) {
    doc.text(String(p.answer), boxX + 25, y, { align: "center" });
  }
}

/* ============================================================
   TEMPLATE 5 — PLACE VALUE / EXPANDED FORM
   (Image 7)
============================================================ */
window.TEMPLATES.place_value_expanded = {
  id: "place_value_expanded",
  label: "Place value / expanded form",
  subject: "math",
  grades: ["1", "3"],
  topicHint: "Number",

  modifiers: [
    { id: "digits", type: "select", label: "Number of digits",
      options: [
        { value: "2", label: "2 digits (tens, ones)" },
        { value: "3", label: "3 digits (hundreds, tens, ones)" },
        { value: "4", label: "4 digits (thousands, hundreds, tens, ones)" }
      ], default: "3" },
    { id: "count", type: "number", label: "# of numbers", default: 4, min: 2, max: 8 },
    { id: "allowZeroes", type: "boolean", label: "Allow numbers with zero digits (e.g. 380, 60)", default: true },
    { id: "workedExample", type: "boolean", label: "Show worked example", default: true }
  ],

  generate(m) {
    const digits = parseInt(m.digits, 10);
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const count = parseInt(m.count, 10);
    const nums = [];
    while (nums.length < count) {
      let n = randInt(min, max);
      if (!m.allowZeroes && String(n).includes("0")) continue;
      if (nums.includes(n)) continue;
      nums.push(n);
    }
    const example = m.workedExample ? 267 : null;
    return { numbers: nums, example, digits, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    const digitLabel = content.digits === 2 ? "Tens and Ones"
                     : content.digits === 3 ? "Hundreds, Tens, and Ones"
                     : "Thousands, Hundreds, Tens, and Ones";
    y = pdfDrawTitleBar(doc, digitLabel, y, pageW, margin);
    y = pdfDrawInstruction(doc, "For each number below, write down how many of each place value.  Then write its expanded form.", y, pageW, margin);

    const rowH = 120;
    const title = digitLabel;
    if (content.example) {
      renderPlaceValueRow(doc, content.example, content.digits, margin, y, pageW - margin * 2, true);
      y += rowH;
    }
    content.numbers.forEach(n => {
      if (pdfNeedNewPage(doc, y, rowH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      renderPlaceValueRow(doc, n, content.digits, margin, y, pageW - margin * 2, opts.showAnswers);
      y += rowH;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderPlaceValueRow(doc, num, digits, x, y, w, showAnswers) {
  const labels = digits === 2 ? ["tens?", "ones?"]
               : digits === 3 ? ["hundreds?", "tens?", "ones?"]
               : ["thousands?", "hundreds?", "tens?", "ones?"];
  const numStr = String(num).padStart(digits, "0");

  // Sizing (LARGER for kid-friendly writing)
  const pvBoxW = 40;
  const pvBoxH = 30;
  const pvRowGap = 4;
  const expBoxW = 60;
  const expBoxH = 36;
  const expBoxGap = 12;

  // Left: big number in gray box (taller now)
  const numBoxH = labels.length * pvBoxH + (labels.length - 1) * pvRowGap;
  doc.setFillColor(220, 220, 220);
  doc.rect(x, y, 80, numBoxH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(20);
  doc.text(String(num), x + 40, y + numBoxH / 2 + 9, { align: "center" });

  // Middle: place value boxes with labels (BIGGER)
  let cx = x + 100;
  labels.forEach((lbl, i) => {
    const by = y + i * (pvBoxH + pvRowGap);
    doc.setDrawColor(20);
    doc.setLineWidth(0.7);
    doc.rect(cx, by, pvBoxW, pvBoxH, "S");
    if (showAnswers) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(18);
      doc.text(numStr[i], cx + pvBoxW / 2, by + pvBoxH / 2 + 6, { align: "center" });
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(lbl, cx + pvBoxW + 8, by + pvBoxH / 2 + 4);
  });

  // Right: expanded form boxes (BIGGER)
  const totalRightW = labels.length * (expBoxW + expBoxGap) + 30 + expBoxW;
  const expX = x + w - totalRightW;
  const expValues = numStr.split("").map((d, i) => parseInt(d, 10) * Math.pow(10, digits - 1 - i));
  const expY = y + numBoxH / 2 - expBoxH / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  expValues.forEach((v, i) => {
    const bx = expX + i * (expBoxW + expBoxGap);
    doc.setDrawColor(20);
    doc.setLineWidth(0.7);
    doc.rect(bx, expY, expBoxW, expBoxH, "S");
    if (showAnswers) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(18);
      doc.text(String(v), bx + expBoxW / 2, expY + expBoxH / 2 + 6, { align: "center" });
      doc.setFont("helvetica", "bold");
    }
    if (i < expValues.length - 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("+", bx + expBoxW + expBoxGap / 2, expY + expBoxH / 2 + 6, { align: "center" });
    }
  });
  // Equals + total
  const eqX = expX + expValues.length * (expBoxW + expBoxGap);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("=", eqX, expY + expBoxH / 2 + 6, { align: "center" });
  doc.setDrawColor(20);
  doc.setLineWidth(0.7);
  doc.rect(eqX + 12, expY, expBoxW, expBoxH, "S");
  if (showAnswers) {
    doc.setFont("helvetica", "normal");
    doc.text(String(num), eqX + 12 + expBoxW / 2, expY + expBoxH / 2 + 6, { align: "center" });
  }
}

/* ============================================================
   TEMPLATE 6 — TRACING LETTERS / NUMBERS (Writing/Handwriting)
   Standard 3-line handwriting guides + ghost-letter tracing.
============================================================ */
window.TEMPLATES.tracing_letters_numbers = {
  id: "tracing_letters_numbers",
  label: "Tracing letters & numbers",
  subject: "writing",
  grades: ["K", "1", "3"],
  topicHint: "Handwriting",

  modifiers: [
    { id: "selection", type: "letter_picker", label: "Pick what to trace — click a tile to add a row, click again to add more",
      groups: [
        { label: "Uppercase letters", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") },
        { label: "Lowercase letters", chars: "abcdefghijklmnopqrstuvwxyz".split("") },
        { label: "Numbers", chars: "0123456789".split("") }
      ],
      default: { "A": 1, "B": 1, "C": 1, "D": 1 }
    },
    { id: "useName", type: "boolean", label: "Also include kid's name at the bottom", default: false },
    { id: "lettersPerRow", type: "select", label: "Tracing copies per row",
      options: [
        { value: "4", label: "4 (bigger letters)" },
        { value: "5", label: "5" },
        { value: "6", label: "6" },
        { value: "8", label: "8 (smaller letters)" }
      ], default: "6" },
    { id: "showGuideLines", type: "boolean", label: "Show handwriting guide lines", default: true },
    { id: "showStartDot", type: "boolean", label: "Show starting dot on demo letter", default: false }
  ],

  generate(m) {
    const selection = m.selection || {};
    const items = [];
    Object.entries(selection).forEach(([char, rows]) => {
      const n = parseInt(rows, 10) || 0;
      for (let i = 0; i < n; i++) items.push(char);
    });
    return { items, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    const items = content.items || [];
    const title = buildTracingTitle(m, items);

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "Trace each letter. Start at the dot if shown, and follow the lines from top to bottom.", y, pageW, margin);
    y += 4;

    const copies = parseInt(m.lettersPerRow, 10);
    const totalRows = items.length + (m.useName ? 1 : 0);
    const rowH = totalRows <= 6 ? 90 : 78;
    const fontSize = totalRows <= 6 ? 44 : 38;

    items.forEach((item) => {
      if (pdfNeedNewPage(doc, y, rowH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      drawTracingRow(doc, item, y, pageW, margin, copies, fontSize, m, opts);
      y += rowH;
    });

    // Optional: kid's name on a final row (as a word, not per-letter)
    if (m.useName && kid?.name) {
      if (pdfNeedNewPage(doc, y, rowH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      drawTracingNameRow(doc, kid.name, y, pageW, margin, fontSize, m, opts);
      y += rowH;
    }

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function buildTracingTitle(m, items) {
  if (!items.length) return "Tracing Practice";
  const uniq = Array.from(new Set(items));
  if (uniq.length === 1) return `Tracing the letter "${uniq[0]}"`;
  if (uniq.length <= 5) return `Tracing: ${uniq.join(", ")}`;
  const hasUpper = uniq.some(c => /[A-Z]/.test(c));
  const hasLower = uniq.some(c => /[a-z]/.test(c));
  const hasNumber = uniq.some(c => /[0-9]/.test(c));
  const parts = [];
  if (hasUpper) parts.push("uppercase");
  if (hasLower) parts.push("lowercase");
  if (hasNumber) parts.push("numbers");
  return "Tracing " + parts.join(" & ");
}

function drawTracingNameRow(doc, name, y, pageW, margin, fontSize, m, opts) {
  const usableW = pageW - margin * 2;
  const baseline = y + fontSize * 0.82 + 4;
  const topLine = y + fontSize * 0.12 + 4;
  const midLine = y + fontSize * 0.55 + 4;

  if (m.showGuideLines) {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(margin, baseline, pageW - margin, baseline);
    doc.line(margin, topLine, pageW - margin, topLine);
    doc.setLineDashPattern([2.5, 3], 0);
    doc.line(margin, midLine, pageW - margin, midLine);
    doc.setLineDashPattern([], 0);
  }

  // Demo name — solid dark model
  ensureTracingFontRegistered(doc);
  doc.setFont(traceModelFont(), "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(25, 25, 25);
  doc.text(name, margin + 14, baseline);

  // Ghost name copies as light single-line dashed letters
  const nameW = doc.getTextWidth(name);
  const demoW = nameW + 40;
  const remainingW = usableW - demoW;
  const ghostCopies = Math.max(1, Math.floor(remainingW / (nameW + 30)));
  for (let i = 0; i < ghostCopies; i++) {
    const xPos = margin + demoW + 20 + i * (nameW + 30);
    if (xPos + nameW <= pageW - margin) {
      pdfTraceText(doc, name, xPos, baseline, fontSize, 155);
    }
  }
  doc.setTextColor(0, 0, 0);
}

// Register BOTH tracing faces: the dashed single-line font (the line the child
// traces) and the solid model font (the dark letter to copy). They're a matched pair.
function ensureTracingFontRegistered(doc) {
  if (doc._tracingFontRegistered) return !!window.TRACING_FONT_BASE64;
  try {
    if (window.TRACING_FONT_BASE64) {
      doc.addFileToVFS("TraceDots.ttf", window.TRACING_FONT_BASE64);
      doc.addFont("TraceDots.ttf", window.TRACING_FONT_NAME, "normal");
    }
    if (window.TRACING_MODEL_BASE64) {
      doc.addFileToVFS("TraceModel.ttf", window.TRACING_MODEL_BASE64);
      doc.addFont("TraceModel.ttf", window.TRACING_MODEL_NAME, "normal");
    }
    doc._tracingFontRegistered = true;
  } catch (e) { console.warn("Could not register tracing fonts:", e); }
  return !!window.TRACING_FONT_BASE64;
}
function traceDotsFont() { return (window.TRACING_FONT_NAME) || "helvetica"; }
function traceModelFont() { return (window.TRACING_MODEL_NAME) || (window.TRACING_FONT_NAME) || "helvetica"; }

// The dashed single-line font's glyphs ARE the dashed strokes — render them as a light
// FILL (no stroke tricks, so no double outline). Digits route through pdfDrawDigit so
// the malformed "9" is replaced with a correct hand-drawn one.
function pdfTraceText(doc, text, x, baseline, fontSize, gray) {
  // Keep the trace clearly visible (mid-grey) — light enough to trace over, dark
  // enough to read. (A too-light grey looked faint/garbage on screen.)
  const g = Math.min(gray == null ? 110 : gray, 120);
  doc.setFont(traceDotsFont(), "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(g, g, g);
  doc.text(String(text), x, baseline);
  doc.setTextColor(0, 0, 0);
}

// Digits 0–9 are DRAWN as single-line paths (not font glyphs) — the dashed font's
// numerals are malformed/unreliable in the PDF engine (the 9 looked like a q, the 4
// rendered as a box). Vector paths render identically everywhere. Commands are in a
// unit box: x 0(left)→1(right), y 0(top)→1(baseline).
const TRACE_DIGITS = {
  "0": [["E",0.5,0.5,0.44,0.49]],
  "1": [["M",0.22,0.22],["L",0.52,0.02],["L",0.52,1.0],["M",0.2,1.0],["L",0.85,1.0]],
  "2": [["M",0.08,0.30],["C",0.12,0.0,0.95,-0.02,0.93,0.34],["C",0.91,0.58,0.5,0.66,0.10,0.99],["L",0.95,0.99]],
  "3": [["M",0.08,0.16],["C",0.35,-0.05,0.95,0.04,0.9,0.30],["C",0.86,0.5,0.5,0.52,0.42,0.52],["M",0.42,0.52],["C",0.62,0.5,0.95,0.56,0.9,0.80],["C",0.85,1.05,0.22,1.04,0.08,0.84]],
  "4": [["M",0.74,0.0],["L",0.06,0.66],["L",0.97,0.66],["M",0.74,0.0],["L",0.74,1.0]],
  "5": [["M",0.9,0.03],["L",0.18,0.03],["L",0.15,0.45],["C",0.42,0.33,0.92,0.4,0.88,0.68],["C",0.85,0.98,0.35,1.04,0.08,0.85]],
  "6": [["M",0.84,0.08],["C",0.45,-0.05,0.12,0.25,0.13,0.62],["E",0.5,0.74,0.37,0.26]],
  "7": [["M",0.06,0.05],["L",0.95,0.05],["L",0.4,1.0]],
  "8": [["E",0.5,0.26,0.33,0.25],["E",0.5,0.74,0.42,0.25]],
  "9": [["E",0.5,0.27,0.4,0.26],["M",0.9,0.27],["L",0.9,1.0]]
};
function isTraceDigit(ch) { return /^[0-9]$/.test(ch); }
function digitWidth(fontSize) { return fontSize * 0.46; }
function pdfDrawDigit(doc, ch, leftX, baseline, fontSize, dashed, hex) {
  const segs = TRACE_DIGITS[ch];
  if (!segs) return digitWidth(fontSize);
  const ctx = doc.context2d;
  const h = fontSize * 0.70, w = fontSize * 0.46, top = baseline - h;
  const X = nx => leftX + nx * w, Y = ny => top + ny * h;
  ctx.save();
  ctx.strokeStyle = hex;
  ctx.lineWidth = dashed ? fontSize * 0.045 : fontSize * 0.075;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.setLineDash(dashed ? [fontSize * 0.07, fontSize * 0.06] : []);
  segs.forEach(seg => {
    const t = seg[0];
    if (t === "M") { ctx.beginPath(); ctx.moveTo(X(seg[1]), Y(seg[2])); }
    else if (t === "L") { ctx.lineTo(X(seg[1]), Y(seg[2])); ctx.stroke(); }
    else if (t === "C") { ctx.bezierCurveTo(X(seg[1]),Y(seg[2]),X(seg[3]),Y(seg[4]),X(seg[5]),Y(seg[6])); ctx.stroke(); }
    else if (t === "E") {
      const cx=X(seg[1]),cy=Y(seg[2]),rx=seg[3]*w,ry=seg[4]*h,k=0.5523;
      ctx.beginPath(); ctx.moveTo(cx+rx,cy);
      ctx.bezierCurveTo(cx+rx,cy+ry*k,cx+rx*k,cy+ry,cx,cy+ry);
      ctx.bezierCurveTo(cx-rx*k,cy+ry,cx-rx,cy+ry*k,cx-rx,cy);
      ctx.bezierCurveTo(cx-rx,cy-ry*k,cx-rx*k,cy-ry,cx,cy-ry);
      ctx.bezierCurveTo(cx+rx*k,cy-ry,cx+rx,cy-ry*k,cx+rx,cy);
      ctx.stroke();
    }
  });
  ctx.restore();
  doc.setLineDashPattern([], 0);
  return w;
}

function drawTracingRow(doc, character, y, pageW, margin, copies, fontSize, m, opts) {
  const usableW = pageW - margin * 2;
  const demoW = 70;

  // Baseline placement: letter baseline sits at ~82% down the row
  // Cap height ≈ 0.72 × fontSize for Helvetica
  const baseline = y + fontSize * 0.82 + 4;
  const topLine = y + fontSize * 0.12 + 4;
  const midLine = y + fontSize * 0.55 + 4;

  // Guide lines
  if (m.showGuideLines) {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(margin, baseline, pageW - margin, baseline);   // baseline (solid)
    doc.line(margin, topLine, pageW - margin, topLine);     // top line (solid)
    doc.setLineDashPattern([2.5, 3], 0);
    doc.line(margin, midLine, pageW - margin, midLine);     // mid (dashed)
    doc.setLineDashPattern([], 0);
  }

  ensureTracingFontRegistered(doc);
  const isDigit = isTraceDigit(character);   // digits are hand-drawn, letters use the font

  // Demo: solid dark model — hand-drawn digit, or KG Penmanship letter.
  if (isDigit) {
    pdfDrawDigit(doc, character, margin + 14, baseline, fontSize, false, "#1a1a1a");
  } else {
    doc.setFont(traceModelFont(), "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(25, 25, 25);
    doc.text(character, margin + 14, baseline);
  }

  // Optional starting dot on demo
  if (m.showStartDot) {
    doc.setFillColor(180, 60, 60);
    doc.circle(margin + 10, topLine + 3, 1.8, "F");
  }

  // Vertical divider between demo and tracing area
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.5, 2], 0);
  doc.line(margin + demoW - 8, topLine - 4, margin + demoW - 8, baseline + 4);
  doc.setLineDashPattern([], 0);

  // Trace copies — single-line DASHED glyph, centred in each slot. KG Dots (letters)
  // renders smaller than the KG Penmanship model, so scale letter traces up to match.
  const tracingW = usableW - demoW;
  const slotW = tracingW / copies;
  const traceSize = fontSize * 1.22;
  let cw;
  if (isDigit) { cw = digitWidth(fontSize); }
  else { doc.setFont(traceDotsFont(), "normal"); doc.setFontSize(traceSize); cw = doc.getTextWidth(character); }
  for (let c = 0; c < copies; c++) {
    const leftX = margin + demoW + c * slotW + (slotW - cw) / 2;
    if (isDigit) pdfDrawDigit(doc, character, leftX, baseline, fontSize, true, "#6e6e6e");
    else pdfTraceText(doc, character, leftX, baseline, traceSize, 110);
  }

  // Answer-key mode: solid completed glyphs over the dashes.
  if (opts.showAnswers) {
    for (let c = 0; c < copies; c++) {
      const leftX = margin + demoW + c * slotW + (slotW - cw) / 2;
      if (isDigit) { pdfDrawDigit(doc, character, leftX, baseline, fontSize, false, "#1e1e1e"); }
      else { doc.setFont(traceModelFont(), "normal"); doc.setFontSize(fontSize); doc.setTextColor(30, 30, 30); doc.text(character, leftX, baseline); }
    }
  }

  doc.setTextColor(0, 0, 0);
}

/* ============================================================
   SHAPES — pre-letter readiness shapes for tracing
   Each shape has:
     - id, label
     - icon: small SVG fragment (viewBox 24x24) for chip display
     - drawSVG({cx, cy, size, mode}): returns SVG fragment for preview
     - drawPDF(doc, {cx, cy, size, mode}): draws on the PDF
   mode: 'solid' (dark demo) or 'dashed' (light dashed ghost)
============================================================ */
function _shapeStyle(mode) {
  if (mode === "dashed") return { stroke: "#888", sw: 1.5, dash: 'stroke-dasharray="4 3"', fill: "none" };
  return { stroke: "#1f2024", sw: 3, dash: "", fill: "none" };
}
function _pdfStrokeStyle(doc, mode) {
  if (mode === "dashed") {
    doc.setDrawColor(110, 110, 110);
    doc.setLineWidth(0.9);
    doc.setLineDashPattern([2, 1.5], 0);
  } else {
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(2);
    doc.setLineDashPattern([], 0);
  }
}
function _pdfResetStroke(doc) { doc.setLineDashPattern([], 0); }

window.SHAPES = {
  vertical: {
    id: "vertical", label: "Vertical line",
    icon: '<line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const h = size * 0.85;
      const s = _shapeStyle(mode);
      return `<line x1="${cx}" y1="${cy - h/2}" x2="${cx}" y2="${cy + h/2}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const h = size * 0.85;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx, cy - h/2, cx, cy + h/2);
      _pdfResetStroke(doc);
    }
  },
  horizontal: {
    id: "horizontal", label: "Horizontal line",
    icon: '<line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const w = size * 0.85;
      const s = _shapeStyle(mode);
      return `<line x1="${cx - w/2}" y1="${cy}" x2="${cx + w/2}" y2="${cy}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const w = size * 0.85;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx - w/2, cy, cx + w/2, cy);
      _pdfResetStroke(doc);
    }
  },
  diag_up: {
    id: "diag_up", label: "Diagonal /",
    icon: '<line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.42;
      const s = _shapeStyle(mode);
      return `<line x1="${cx - r}" y1="${cy + r}" x2="${cx + r}" y2="${cy - r}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.42;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx - r, cy + r, cx + r, cy - r);
      _pdfResetStroke(doc);
    }
  },
  diag_down: {
    id: "diag_down", label: "Diagonal \\",
    icon: '<line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.42;
      const s = _shapeStyle(mode);
      return `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.42;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx - r, cy - r, cx + r, cy + r);
      _pdfResetStroke(doc);
    }
  },
  plus: {
    id: "plus", label: "Plus sign +",
    icon: '<line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.42;
      const s = _shapeStyle(mode);
      return `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>
              <line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.42;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx, cy - r, cx, cy + r);
      doc.line(cx - r, cy, cx + r, cy);
      _pdfResetStroke(doc);
    }
  },
  x_shape: {
    id: "x_shape", label: "X",
    icon: '<line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="20" y1="4" x2="4" y2="20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.4;
      const s = _shapeStyle(mode);
      return `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>
              <line x1="${cx + r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.4;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx - r, cy - r, cx + r, cy + r);
      doc.line(cx + r, cy - r, cx - r, cy + r);
      _pdfResetStroke(doc);
    }
  },
  circle: {
    id: "circle", label: "Circle",
    icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.4;
      const s = _shapeStyle(mode);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.stroke}" stroke-width="${s.sw}" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.4;
      _pdfStrokeStyle(doc, mode);
      doc.circle(cx, cy, r, "S");
      _pdfResetStroke(doc);
    }
  },
  square: {
    id: "square", label: "Square",
    icon: '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.4;
      const s = _shapeStyle(mode);
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="none" stroke="${s.stroke}" stroke-width="${s.sw}" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.4;
      _pdfStrokeStyle(doc, mode);
      doc.rect(cx - r, cy - r, r * 2, r * 2, "S");
      _pdfResetStroke(doc);
    }
  },
  triangle: {
    id: "triangle", label: "Triangle",
    icon: '<polygon points="12,3 21,21 3,21" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.45;
      const top = `${cx},${cy - r}`;
      const bl = `${cx - r * 0.9},${cy + r * 0.7}`;
      const br = `${cx + r * 0.9},${cy + r * 0.7}`;
      const s = _shapeStyle(mode);
      return `<polygon points="${top} ${br} ${bl}" fill="none" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.45;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx, cy - r, cx + r * 0.9, cy + r * 0.7);
      doc.line(cx + r * 0.9, cy + r * 0.7, cx - r * 0.9, cy + r * 0.7);
      doc.line(cx - r * 0.9, cy + r * 0.7, cx, cy - r);
      _pdfResetStroke(doc);
    }
  },
  diamond: {
    id: "diamond", label: "Diamond",
    icon: '<polygon points="12,3 21,12 12,21 3,12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const r = size * 0.42;
      const s = _shapeStyle(mode);
      return `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="none" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const r = size * 0.42;
      _pdfStrokeStyle(doc, mode);
      doc.line(cx, cy - r, cx + r, cy);
      doc.line(cx + r, cy, cx, cy + r);
      doc.line(cx, cy + r, cx - r, cy);
      doc.line(cx - r, cy, cx, cy - r);
      _pdfResetStroke(doc);
    }
  },
  zigzag: {
    id: "zigzag", label: "Zigzag",
    icon: '<polyline points="3,18 8,6 13,18 18,6 21,18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const w = size * 0.85;
      const h = size * 0.55;
      const peaks = 3;
      const dx = w / (peaks * 2);
      const points = [];
      const xStart = cx - w / 2;
      for (let i = 0; i <= peaks * 2; i++) {
        const x = xStart + i * dx;
        const yy = (i % 2 === 0) ? cy + h / 2 : cy - h / 2;
        points.push(`${x},${yy}`);
      }
      const s = _shapeStyle(mode);
      return `<polyline points="${points.join(' ')}" fill="none" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" stroke-linejoin="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const w = size * 0.85;
      const h = size * 0.55;
      const peaks = 3;
      const dx = w / (peaks * 2);
      const xStart = cx - w / 2;
      _pdfStrokeStyle(doc, mode);
      for (let i = 0; i < peaks * 2; i++) {
        const x1 = xStart + i * dx;
        const y1 = (i % 2 === 0) ? cy + h / 2 : cy - h / 2;
        const x2 = xStart + (i + 1) * dx;
        const y2 = ((i + 1) % 2 === 0) ? cy + h / 2 : cy - h / 2;
        doc.line(x1, y1, x2, y2);
      }
      _pdfResetStroke(doc);
    }
  },
  wave: {
    id: "wave", label: "Wave",
    icon: '<path d="M 3 12 Q 6 4 9 12 T 15 12 T 21 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    drawSVG({cx, cy, size, mode}) {
      const w = size * 0.9;
      const h = size * 0.45;
      const xStart = cx - w / 2;
      const seg = w / 3;
      // 3-hump wave
      const d = `M ${xStart} ${cy} Q ${xStart + seg/2} ${cy - h} ${xStart + seg} ${cy} T ${xStart + 2*seg} ${cy} T ${xStart + 3*seg} ${cy}`;
      const s = _shapeStyle(mode);
      return `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round" ${s.dash}/>`;
    },
    drawPDF(doc, {cx, cy, size, mode}) {
      const w = size * 0.9;
      const h = size * 0.45;
      const xStart = cx - w / 2;
      const seg = w / 3;
      _pdfStrokeStyle(doc, mode);
      // Approximate humps as 3 bezier curves
      // Hump 1: up
      doc.lines([[seg/2, -h], [seg, 0]], xStart, cy, [1, 1], "S", false);
      // Hump 2: down (mirrored)
      doc.lines([[seg/2, h], [seg, 0]], xStart + seg, cy, [1, 1], "S", false);
      // Hump 3: up
      doc.lines([[seg/2, -h], [seg, 0]], xStart + 2 * seg, cy, [1, 1], "S", false);
      _pdfResetStroke(doc);
    }
  }
};

/* ============================================================
   TEMPLATE — TRACING SHAPES (pre-letter readiness)
============================================================ */
window.TEMPLATES.tracing_shapes = {
  id: "tracing_shapes",
  label: "Tracing shapes (pre-letter)",
  subject: "writing",
  grades: ["K", "1", "3"],
  topicHint: "Handwriting",

  modifiers: [
    { id: "selection", type: "shape_picker", label: "Pick shapes — click a tile to add a row, click again for more",
      shapes: ["vertical", "horizontal", "diag_up", "diag_down", "plus", "x_shape", "circle", "square", "triangle", "diamond", "zigzag", "wave"],
      default: { vertical: 1, horizontal: 1, circle: 1, zigzag: 1 }
    },
    { id: "copiesPerRow", type: "select", label: "Tracing copies per row",
      options: [
        { value: "4", label: "4 (bigger)" },
        { value: "5", label: "5" },
        { value: "6", label: "6" },
        { value: "8", label: "8 (smaller)" }
      ], default: "6" },
    { id: "showGuideLines", type: "boolean", label: "Show top/bottom guide lines", default: true },
    { id: "showStartDot", type: "boolean", label: "Show starting dot on demo", default: true }
  ],

  generate(m) {
    const selection = m.selection || {};
    const items = [];
    Object.entries(selection).forEach(([shapeId, rows]) => {
      const n = parseInt(rows, 10) || 0;
      for (let i = 0; i < n; i++) items.push(shapeId);
    });
    return { items, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    const items = content.items || [];
    const title = "Shape Tracing";
    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "Trace each shape. Follow the dashed lines from start to finish.", y, pageW, margin);
    y += 4;

    const copies = parseInt(m.copiesPerRow, 10);
    const totalRows = items.length;
    const rowH = totalRows <= 6 ? 90 : 78;
    const shapeSize = totalRows <= 6 ? 56 : 48;

    items.forEach((shapeId) => {
      if (pdfNeedNewPage(doc, y, rowH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      drawShapeRow(doc, shapeId, y, pageW, margin, copies, shapeSize, rowH, m, opts);
      y += rowH;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function drawShapeRow(doc, shapeId, y, pageW, margin, copies, shapeSize, rowH, m, opts) {
  const shape = window.SHAPES[shapeId];
  if (!shape) return;
  const usableW = pageW - margin * 2;
  const demoW = 80;
  const cyRow = y + rowH / 2;

  // Guide lines
  if (m.showGuideLines) {
    const topL = cyRow - shapeSize / 2 - 4;
    const botL = cyRow + shapeSize / 2 + 4;
    doc.setDrawColor(170);
    doc.setLineWidth(0.4);
    doc.line(margin, topL, pageW - margin, topL);
    doc.line(margin, botL, pageW - margin, botL);
  }

  // Demo shape on left (solid)
  shape.drawPDF(doc, { cx: margin + demoW / 2, cy: cyRow, size: shapeSize, mode: "solid" });

  // Starting dot
  if (m.showStartDot) {
    doc.setFillColor(180, 60, 60);
    doc.circle(margin + demoW / 2 - shapeSize * 0.4, cyRow - shapeSize * 0.4, 2, "F");
  }

  // Vertical divider
  doc.setDrawColor(140);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.5, 2], 0);
  doc.line(margin + demoW, cyRow - shapeSize / 2 - 4, margin + demoW, cyRow + shapeSize / 2 + 4);
  doc.setLineDashPattern([], 0);

  // Ghost copies across the row (dashed)
  const tracingW = usableW - demoW;
  const slotW = tracingW / copies;
  for (let c = 0; c < copies; c++) {
    const cx = margin + demoW + c * slotW + slotW / 2;
    if (opts.showAnswers) {
      shape.drawPDF(doc, { cx, cy: cyRow, size: shapeSize, mode: "solid" });
    } else {
      shape.drawPDF(doc, { cx, cy: cyRow, size: shapeSize, mode: "dashed" });
    }
  }
}

/* ============================================================
   TEMPLATE — COUNT OBJECTS TO 10  (K math)
   Maps to BC MK.1 — Number concepts to 10
============================================================ */
window.TEMPLATES.count_to_10 = {
  id: "count_to_10",
  label: "Count the objects (1–10)",
  subject: "math",
  grades: ["K"],
  topicHint: "Number",

  modifiers: [
    { id: "maxCount", type: "select", label: "Highest count",
      options: [
        { value: "5", label: "Up to 5 (easier)" },
        { value: "10", label: "Up to 10" }
      ], default: "10" },
    { id: "arrangement", type: "select", label: "How to arrange the dots",
      options: [
        { value: "row", label: "Row (line)" },
        { value: "scatter", label: "Scattered (harder to count)" },
        { value: "ten_frame", label: "Ten-frame (BC-style)" }
      ], default: "row" },
    { id: "count", type: "number", label: "# of rows", default: 8, min: 4, max: 16 },
    { id: "workedExample", type: "boolean", label: "Show worked example", default: true }
  ],

  generate(m) {
    const maxN = parseInt(m.maxCount, 10);
    const count = parseInt(m.count, 10);
    const problems = [];
    for (let i = 0; i < count; i++) {
      const n = randInt(1, maxN);
      problems.push({ n });
    }
    const example = m.workedExample ? { n: Math.min(3, maxN) } : null;
    return { problems, example, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "How many?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "Count the dots. Write the number on the line.", y, pageW, margin);

    if (content.example) {
      y = pdfDrawWorkedExampleBox(doc, (x, ey, w, h) => {
        renderCountRow(doc, content.example, m.arrangement, x + 10, ey + 10, w - 20, h - 20, true);
      }, y, pageW, margin, 60);
    }

    const rowH = 64;
    const cols = 2;
    const colW = (pageW - margin * 2) / cols;
    let startY = y;
    let pageOffset = 0;

    content.problems.forEach((p, i) => {
      const itemOnPage = i - pageOffset;
      const col = itemOnPage % cols;
      const row = Math.floor(itemOnPage / cols);
      const py = startY + row * rowH;
      if (py + rowH > pageH - margin - 30) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
        startY = y;
        pageOffset = i;
        renderCountRow(doc, p, m.arrangement, margin + 4, startY + 6, colW - 8, rowH - 12, opts.showAnswers);
      } else {
        const x = margin + col * colW + 4;
        renderCountRow(doc, p, m.arrangement, x, py + 6, colW - 8, rowH - 12, opts.showAnswers);
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderCountRow(doc, p, arrangement, x, y, w, h, showAnswer) {
  // Left ~70%: dots ; Right ~30%: answer line
  const dotsW = w * 0.7;
  const answerW = w * 0.3;
  const cyMid = y + h / 2;
  const dotR = 5;

  doc.setFillColor(40, 40, 40);
  doc.setDrawColor(40, 40, 40);

  if (arrangement === "ten_frame") {
    // 2x5 grid
    const cellW = 22;
    const cellH = 22;
    const frameX = x + 6;
    const frameY = cyMid - cellH;
    doc.setLineWidth(0.6);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 5; c++) {
        doc.rect(frameX + c * cellW, frameY + r * cellH, cellW, cellH, "S");
      }
    }
    let drawn = 0;
    for (let r = 0; r < 2 && drawn < p.n; r++) {
      for (let c = 0; c < 5 && drawn < p.n; c++) {
        doc.circle(frameX + c * cellW + cellW / 2, frameY + r * cellH + cellH / 2, dotR + 1, "F");
        drawn++;
      }
    }
  } else if (arrangement === "scatter") {
    // Reproducible scatter inside the left box (seeded by n)
    const seedRand = mulberry32(p.n * 9973 + 42);
    for (let i = 0; i < p.n; i++) {
      const cx = x + 12 + seedRand() * (dotsW - 24);
      const cy = y + 8 + seedRand() * (h - 16);
      doc.circle(cx, cy, dotR, "F");
    }
  } else {
    // Row arrangement
    const usable = dotsW - 16;
    const gap = Math.min(20, usable / Math.max(1, p.n + 1));
    let cx = x + 12 + gap;
    for (let i = 0; i < p.n; i++) {
      doc.circle(cx, cyMid, dotR, "F");
      cx += gap;
    }
  }

  // Answer line
  const lineX1 = x + dotsW + 8;
  const lineX2 = x + w - 4;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.9);
  doc.line(lineX1, cyMid + 8, lineX2, cyMid + 8);
  if (showAnswer) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text(String(p.n), (lineX1 + lineX2) / 2, cyMid + 4, { align: "center" });
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ============================================================
   TEMPLATE — WAYS TO MAKE 5 / 10  (K, Gr1 math)
   Maps to BC MK.2 / M1.2
============================================================ */
window.TEMPLATES.ways_to_make = {
  id: "ways_to_make",
  label: "Ways to make 5 / 10",
  subject: "math",
  grades: ["K", "1"],
  topicHint: "Number",

  modifiers: [
    { id: "target", type: "select", label: "Target number",
      options: [
        { value: "5", label: "Make 5 (easier)" },
        { value: "10", label: "Make 10" }
      ], default: "10" },
    { id: "blankPosition", type: "select", label: "Which number is missing?",
      options: [
        { value: "right", label: "Second addend (e.g. 7 + ___ = 10)" },
        { value: "left", label: "First addend (e.g. ___ + 3 = 10)" },
        { value: "mixed", label: "Mixed" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of equations", default: 10, min: 4, max: 16 },
    { id: "showDots", type: "boolean", label: "Show ten-frame dots above each equation", default: true },
    { id: "workedExample", type: "boolean", label: "Show worked example", default: true }
  ],

  generate(m) {
    const target = parseInt(m.target, 10);
    const count = parseInt(m.count, 10);
    const problems = [];
    for (let i = 0; i < count; i++) {
      const knownAddend = randInt(0, target);
      const missing = target - knownAddend;
      const blankPos = m.blankPosition === "mixed"
        ? (Math.random() < 0.5 ? "left" : "right")
        : m.blankPosition;
      problems.push({ target, knownAddend, missing, blankPos });
    }
    const example = m.workedExample
      ? { target, knownAddend: Math.max(1, target - 3), missing: 3, blankPos: "right" }
      : null;
    return { problems, example, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const target = parseInt(m.target, 10);
    const title = `Ways to make ${target}`;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, `Fill in the missing number so the two sides add to ${target}.`, y, pageW, margin);

    if (content.example) {
      y = pdfDrawWorkedExampleBox(doc, (x, ey, w, h) => {
        renderWaysToMakeEq(doc, content.example, x + 10, ey + 8, w - 20, h - 16, true, m.showDots, target);
      }, y, pageW, margin, m.showDots ? 80 : 50);
    }

    const cols = 2;
    const colW = (pageW - margin * 2) / cols;
    const rowH = m.showDots ? 72 : 46;
    let startY = y;
    let pageOffset = 0;

    content.problems.forEach((p, i) => {
      const itemOnPage = i - pageOffset;
      const col = itemOnPage % cols;
      const row = Math.floor(itemOnPage / cols);
      const py = startY + row * rowH;
      if (py + rowH > pageH - margin - 30) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
        startY = y;
        pageOffset = i;
        renderWaysToMakeEq(doc, p, margin + 8, startY + 8, colW - 16, rowH - 16, opts.showAnswers, m.showDots, target);
      } else {
        const x = margin + col * colW + 8;
        renderWaysToMakeEq(doc, p, x, py + 8, colW - 16, rowH - 16, opts.showAnswers, m.showDots, target);
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderWaysToMakeEq(doc, p, x, y, w, h, showAnswer, showDots, target) {
  // Optional ten-frame on top
  let topY = y;
  if (showDots) {
    const cellW = 14;
    const cellH = 14;
    const cols = target <= 5 ? 5 : 5;
    const rows = target <= 5 ? 1 : 2;
    const frameW = cols * cellW;
    const frameX = x + (w - frameW) / 2;
    doc.setDrawColor(120);
    doc.setLineWidth(0.4);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        doc.rect(frameX + c * cellW, topY + r * cellH, cellW, cellH, "S");
      }
    }
    // Fill known dots one color, missing another (light)
    let drawn = 0;
    for (let r = 0; r < rows && drawn < p.knownAddend; r++) {
      for (let c = 0; c < cols && drawn < p.knownAddend; c++) {
        doc.setFillColor(60, 60, 60);
        doc.circle(frameX + c * cellW + cellW / 2, topY + r * cellH + cellH / 2, 3.5, "F");
        drawn++;
      }
    }
    if (showAnswer) {
      let extra = 0;
      const startIdx = p.knownAddend;
      for (let i = startIdx; i < target && extra < p.missing; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        doc.setFillColor(180, 60, 60);
        doc.circle(frameX + c * cellW + cellW / 2, topY + r * cellH + cellH / 2, 3.5, "F");
        extra++;
      }
    }
    topY += rows * cellH + 8;
  }

  // Equation line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);

  // Layout: "A + B = target" with blank where indicated
  const blankStr = "[   ]";
  const a = p.blankPos === "left" ? blankStr : String(p.knownAddend);
  const b = p.blankPos === "right" ? blankStr : String(p.missing);
  // BUT: knownAddend lives on the SHOWN side. Re-arrange:
  // If blankPos == "right", shown side is left = knownAddend, missing is right
  // If blankPos == "left", shown side is right = knownAddend, missing is left
  let leftStr, rightStr;
  if (p.blankPos === "right") {
    leftStr = String(p.knownAddend);
    rightStr = blankStr;
  } else {
    leftStr = blankStr;
    rightStr = String(p.knownAddend);
  }
  const eqStr = `${leftStr}  +  ${rightStr}  =  ${target}`;
  const cyEq = topY + 14;
  doc.text(eqStr, x + w / 2, cyEq, { align: "center" });

  if (showAnswer) {
    doc.setTextColor(180, 30, 30);
    doc.setFont("helvetica", "bold");
    const answeredStr = `${p.blankPos === "left" ? p.missing : p.knownAddend}  +  ${p.blankPos === "right" ? p.missing : p.knownAddend}  =  ${target}`;
    doc.text(answeredStr, x + w / 2, cyEq + 18, { align: "center" });
  }
}

/* ============================================================
   TEMPLATE — REPEATING PATTERNS  (K, Gr1, Gr3 math)
   Maps to BC MK.4 / M1.4 / M3.6
============================================================ */
window.TEMPLATES.ab_patterns = {
  id: "ab_patterns",
  label: "Repeating patterns (AB, ABB, ABC…)",
  subject: "math",
  grades: ["K", "1", "3"],
  topicHint: "Patterns",

  modifiers: [
    { id: "patternType", type: "select", label: "Pattern type",
      options: [
        { value: "AB",  label: "AB AB AB (easiest)" },
        { value: "ABB", label: "ABB ABB" },
        { value: "AAB", label: "AAB AAB" },
        { value: "ABC", label: "ABC ABC" },
        { value: "mixed", label: "Mixed" }
      ], default: "AB" },
    { id: "elements", type: "select", label: "What goes in the pattern",
      options: [
        { value: "shapes",  label: "Shapes (circle, square, triangle)" },
        { value: "letters", label: "Letters (A, B, C…)" },
        { value: "numbers", label: "Numbers (1, 2, 3…)" }
      ], default: "shapes" },
    { id: "count", type: "number", label: "# of rows", default: 6, min: 3, max: 12 },
    { id: "trailingBlanks", type: "select", label: "How many blanks at the end",
      options: [
        { value: "1", label: "1 (just the next)" },
        { value: "2", label: "2 (next two)" },
        { value: "3", label: "3 (next three)" }
      ], default: "2" }
  ],

  generate(m) {
    const types = m.patternType === "mixed" ? ["AB", "ABB", "AAB", "ABC"] : [m.patternType];
    const count = parseInt(m.count, 10);
    const blanks = parseInt(m.trailingBlanks, 10);
    const problems = [];

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const unitLen = type.length;
      const distinctNeeded = new Set(type.split("")).size;
      const tokens = pickTokens(m.elements, distinctNeeded);
      // Build the pattern: 3 full units shown, then `blanks` more positions
      const fullUnits = 3;
      const totalLen = fullUnits * unitLen + blanks;
      const sequence = [];
      for (let j = 0; j < totalLen; j++) {
        const letter = type[j % unitLen]; // A/B/C
        const tokenIdx = letter.charCodeAt(0) - "A".charCodeAt(0);
        sequence.push(tokens[tokenIdx]);
      }
      const shown = sequence.slice(0, fullUnits * unitLen);
      const expected = sequence.slice(fullUnits * unitLen);
      problems.push({ type, shown, expected, blanks });
    }
    return { problems, modifiers: m, elementType: m.elements };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Finish the Pattern";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "Look at the pattern. Draw or write what comes next.", y, pageW, margin);

    const rowH = 56;
    content.problems.forEach((p) => {
      if (pdfNeedNewPage(doc, y, rowH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      renderPatternRow(doc, p, content.elementType, margin, y, pageW - margin * 2, rowH, opts.showAnswers);
      y += rowH;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function pickTokens(elementType, needed) {
  if (elementType === "letters") {
    return ["A", "B", "C", "D", "E"].slice(0, needed);
  }
  if (elementType === "numbers") {
    return ["1", "2", "3", "4", "5"].slice(0, needed);
  }
  // shapes: circle / square / triangle / diamond
  return ["circle", "square", "triangle", "diamond"].slice(0, needed);
}

function renderPatternRow(doc, p, elementType, x, y, w, h, showAnswers) {
  const totalCells = p.shown.length + p.expected.length;
  const cellW = Math.min(40, (w - 20) / totalCells);
  const cellH = 34;
  const cyMid = y + h / 2;
  let cx = x + 10;

  // Shown cells
  p.shown.forEach((token) => {
    drawPatternCell(doc, token, elementType, cx, cyMid, cellW, cellH, false, false);
    cx += cellW + 4;
  });

  // Blank cells (the answer slots)
  p.expected.forEach((token) => {
    drawPatternCell(doc, token, elementType, cx, cyMid, cellW, cellH, true, showAnswers);
    cx += cellW + 4;
  });
}

function drawPatternCell(doc, token, elementType, cx, cy, w, h, isBlank, showAnswer) {
  const boxX = cx;
  const boxY = cy - h / 2;
  if (isBlank) {
    doc.setDrawColor(120);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(boxX, boxY, w, h, "S");
    doc.setLineDashPattern([], 0);
    if (!showAnswer) return;
  }
  if (elementType === "letters" || elementType === "numbers") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(isBlank ? 180 : 20, isBlank ? 30 : 20, isBlank ? 30 : 20);
    doc.text(token, boxX + w / 2, boxY + h / 2 + 6, { align: "center" });
  } else {
    // Shape
    const shape = window.SHAPES[token];
    if (shape) {
      const renderColor = isBlank ? [180, 30, 30] : [30, 30, 30];
      const prevDraw = doc.getDrawColor && doc.getDrawColor();
      doc.setDrawColor(...renderColor);
      doc.setLineWidth(1.6);
      shape.drawPDF(doc, { cx: boxX + w / 2, cy: boxY + h / 2, size: Math.min(w, h) * 0.7, mode: "solid" });
      doc.setDrawColor(30, 30, 30);
    }
  }
  doc.setTextColor(0, 0, 0);
}

/* ============================================================
   TEMPLATE — MULTIPLICATION / DIVISION FACTS  (Gr3 math)
   Maps to BC M3.5
============================================================ */
window.TEMPLATES.multiplication_facts = {
  id: "multiplication_facts",
  label: "Multiplication & division facts",
  subject: "math",
  grades: ["3"],
  topicHint: "Operations",

  modifiers: [
    { id: "operation", type: "select", label: "Operation",
      options: [
        { value: "multiplication", label: "× only" },
        { value: "division",       label: "÷ only" },
        { value: "mixed",          label: "Mixed × and ÷" }
      ], default: "multiplication" },
    { id: "maxFactor", type: "select", label: "Largest factor",
      options: [
        { value: "5",  label: "Up to 5 (easier)" },
        { value: "10", label: "Up to 10" },
        { value: "12", label: "Up to 12 (harder)" }
      ], default: "10" },
    { id: "format", type: "select", label: "Layout",
      options: [
        { value: "horizontal", label: "Horizontal (a × b = ___)" },
        { value: "vertical",   label: "Vertical (stacked)" }
      ], default: "horizontal" },
    { id: "count", type: "number", label: "# of problems", default: 20, min: 6, max: 40 },
    { id: "columns", type: "select", label: "Columns",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" }
      ], default: "4" }
  ],

  generate(m) {
    const max = parseInt(m.maxFactor, 10);
    const count = parseInt(m.count, 10);
    const problems = [];
    while (problems.length < count) {
      const a = randInt(1, max);
      const b = randInt(1, max);
      const useDiv = m.operation === "division" ||
                     (m.operation === "mixed" && Math.random() < 0.5);
      if (useDiv) {
        // Build a clean division: product / a = b
        const product = a * b;
        problems.push({ a: product, b: a, op: "÷", answer: b });
      } else {
        problems.push({ a, b, op: "×", answer: a * b });
      }
    }
    return { problems, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const opLabel = m.operation === "multiplication" ? "Multiplication"
                  : m.operation === "division" ? "Division"
                  : "Multiplication & Division";
    const title = opLabel + " Facts";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);

    const cols = parseInt(m.columns, 10);
    const colW = (pageW - margin * 2) / cols;
    const rowH = m.format === "vertical" ? 100 : 48;
    let startY = y + 6;
    let pageOffset = 0;

    content.problems.forEach((p, i) => {
      const itemOnPage = i - pageOffset;
      const col = itemOnPage % cols;
      const row = Math.floor(itemOnPage / cols);
      const py = startY + row * rowH;
      if (py + rowH > pageH - margin - 30) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
        startY = y + 6;
        pageOffset = i;
        renderFactProblem(doc, p, margin + 8, startY + 16, colW - 16, rowH - 8, m.format, opts.showAnswers, i + 1);
      } else {
        const x = margin + col * colW + 8;
        renderFactProblem(doc, p, x, py + 16, colW - 16, rowH - 8, m.format, opts.showAnswers, i + 1);
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderFactProblem(doc, p, x, y, w, h, format, showAnswer, number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(140);
  doc.text(`${number}.`, x, y - 6);

  if (format === "vertical") {
    doc.setFont("courier", "normal");
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    const aStr = String(p.a);
    const bStr = String(p.b);
    const maxLen = Math.max(aStr.length, bStr.length + 2);
    const centerX = x + w / 2;
    const charW = 11;
    const rightX = centerX + maxLen * charW / 2;
    doc.text(aStr.padStart(maxLen, " "), rightX, y + 10, { align: "right" });
    doc.text(`${p.op} ${bStr.padStart(maxLen - 2, " ")}`, rightX, y + 30, { align: "right" });
    doc.setLineWidth(0.8);
    doc.line(rightX - maxLen * charW - 4, y + 36, rightX + 2, y + 36);
    if (showAnswer) {
      doc.text(String(p.answer).padStart(maxLen, " "), rightX, y + 54, { align: "right" });
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    const eqStr = `${p.a}  ${p.op}  ${p.b}  =`;
    doc.text(eqStr, x, y + 14);
    const eqW = doc.getTextWidth(eqStr);
    doc.setDrawColor(20);
    doc.setLineWidth(0.7);
    doc.rect(x + eqW + 8, y, 50, 22, "S");
    if (showAnswer) {
      doc.text(String(p.answer), x + eqW + 8 + 25, y + 15, { align: "center" });
    }
  }
}

/* ============================================================
   TEMPLATE — FRACTIONS (visual identify)  (Gr3 math)
   Maps to BC M3.2
============================================================ */
window.TEMPLATES.fractions_visual = {
  id: "fractions_visual",
  label: "Fractions — visual",
  subject: "math",
  grades: ["3"],
  topicHint: "Number",

  modifiers: [
    { id: "shape", type: "select", label: "Shape",
      options: [
        { value: "bar",   label: "Bars (rectangles)" },
        { value: "pie",   label: "Pies (circles)" },
        { value: "mixed", label: "Mixed" }
      ], default: "bar" },
    { id: "maxDenominator", type: "select", label: "Largest denominator",
      options: [
        { value: "4",  label: "Halves & quarters (up to 4)" },
        { value: "6",  label: "Up to 6" },
        { value: "8",  label: "Up to 8" },
        { value: "12", label: "Up to 12" }
      ], default: "6" },
    { id: "mode", type: "select", label: "What does the kid do?",
      options: [
        { value: "identify", label: "Write the fraction shown" },
        { value: "shade",    label: "Shade the fraction given" },
        { value: "mixed",    label: "Mixed" }
      ], default: "identify" },
    { id: "count", type: "number", label: "# of problems", default: 8, min: 4, max: 12 },
    { id: "workedExample", type: "boolean", label: "Show worked example", default: true }
  ],

  generate(m) {
    const maxDen = parseInt(m.maxDenominator, 10);
    const count = parseInt(m.count, 10);
    const problems = [];
    for (let i = 0; i < count; i++) {
      const denominator = randInt(2, maxDen);
      const numerator = randInt(1, denominator - 1);
      const shape = m.shape === "mixed"
        ? (Math.random() < 0.5 ? "bar" : "pie")
        : m.shape;
      const mode = m.mode === "mixed"
        ? (Math.random() < 0.5 ? "identify" : "shade")
        : m.mode;
      problems.push({ numerator, denominator, shape, mode });
    }
    const example = m.workedExample
      ? { numerator: 3, denominator: 4, shape: m.shape === "mixed" ? "bar" : m.shape, mode: m.mode === "mixed" ? "identify" : m.mode }
      : null;
    return { problems, example, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Fractions";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "For each picture, write the fraction that is shaded, OR shade the fraction shown.", y, pageW, margin);

    if (content.example) {
      y = pdfDrawWorkedExampleBox(doc, (x, ey, w, h) => {
        renderFractionProblem(doc, content.example, x + 6, ey + 6, w - 12, h - 12, true);
      }, y, pageW, margin, 90);
    }

    const cols = 2;
    const colW = (pageW - margin * 2) / cols;
    const rowH = 90;
    let startY = y;
    let pageOffset = 0;

    content.problems.forEach((p, i) => {
      const itemOnPage = i - pageOffset;
      const col = itemOnPage % cols;
      const row = Math.floor(itemOnPage / cols);
      const py = startY + row * rowH;
      if (py + rowH > pageH - margin - 30) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
        startY = y;
        pageOffset = i;
        renderFractionProblem(doc, p, margin + 8, startY + 8, colW - 16, rowH - 16, opts.showAnswers);
      } else {
        const x = margin + col * colW + 8;
        renderFractionProblem(doc, p, x, py + 8, colW - 16, rowH - 16, opts.showAnswers);
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderFractionProblem(doc, p, x, y, w, h, showAnswers) {
  // Left ~55% picture, right ~45% answer
  const picW = w * 0.55;
  const ansW = w * 0.45;
  const cyMid = y + h / 2;

  // Draw shape — shade portion if mode == "identify" (we want kid to read shading)
  // For "shade" mode: show blank shape divided into N parts, show fraction on right
  const shouldShade = p.mode === "identify" || showAnswers;

  if (p.shape === "bar") {
    const barW = picW - 20;
    const barH = 30;
    const barX = x + 10;
    const barY = cyMid - barH / 2;
    const partW = barW / p.denominator;
    doc.setDrawColor(20);
    doc.setLineWidth(0.8);
    for (let i = 0; i < p.denominator; i++) {
      if (shouldShade && i < p.numerator) {
        doc.setFillColor(80, 130, 180);
        doc.rect(barX + i * partW, barY, partW, barH, "FD");
      } else {
        doc.rect(barX + i * partW, barY, partW, barH, "S");
      }
    }
  } else {
    // pie
    const cx = x + picW / 2;
    const cy = cyMid;
    const r = Math.min(picW / 2 - 8, h / 2 - 8);
    doc.setDrawColor(20);
    doc.setLineWidth(0.8);
    // Outer circle
    doc.circle(cx, cy, r, "S");
    // Sector lines
    for (let i = 0; i < p.denominator; i++) {
      const angle = (i / p.denominator) * Math.PI * 2 - Math.PI / 2;
      doc.line(cx, cy, cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    // Shade slices using triangular approximation
    if (shouldShade) {
      doc.setFillColor(80, 130, 180);
      for (let i = 0; i < p.numerator; i++) {
        const a1 = (i / p.denominator) * Math.PI * 2 - Math.PI / 2;
        const a2 = ((i + 1) / p.denominator) * Math.PI * 2 - Math.PI / 2;
        // Approximate sector with a triangle fan (a few steps)
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const sa1 = a1 + (a2 - a1) * (s / steps);
          const sa2 = a1 + (a2 - a1) * ((s + 1) / steps);
          doc.triangle(
            cx, cy,
            cx + r * Math.cos(sa1), cy + r * Math.sin(sa1),
            cx + r * Math.cos(sa2), cy + r * Math.sin(sa2),
            "F"
          );
        }
      }
      // Re-stroke sector lines and outer circle on top
      doc.setDrawColor(20);
      doc.circle(cx, cy, r, "S");
      for (let i = 0; i < p.denominator; i++) {
        const angle = (i / p.denominator) * Math.PI * 2 - Math.PI / 2;
        doc.line(cx, cy, cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
    }
  }

  // Right: fraction answer area
  const ansX = x + picW + 8;
  if (p.mode === "identify") {
    // "= ___ / ___"
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text("=", ansX, cyMid + 4);
    // Two stacked blank boxes
    const boxW = 36;
    const boxH = 22;
    const fxX = ansX + 18;
    doc.setDrawColor(20);
    doc.setLineWidth(0.7);
    doc.rect(fxX, cyMid - boxH - 2, boxW, boxH, "S");
    doc.setLineWidth(1.0);
    doc.line(fxX, cyMid + 4, fxX + boxW, cyMid + 4);
    doc.setLineWidth(0.7);
    doc.rect(fxX, cyMid + 6, boxW, boxH, "S");
    if (showAnswers) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(20);
      doc.text(String(p.numerator), fxX + boxW / 2, cyMid - 6, { align: "center" });
      doc.text(String(p.denominator), fxX + boxW / 2, cyMid + 22, { align: "center" });
    }
  } else {
    // shade mode: show the fraction as text, kid shades the picture
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20);
    const fracStr = `Shade ${p.numerator}/${p.denominator}`;
    doc.text(fracStr, ansX, cyMid + 5);
  }
}

/* ============================================================
   TEMPLATE — TELLING TIME (analog clocks)  (Gr3 math)
   Maps to BC M3.10
============================================================ */
window.TEMPLATES.time_telling = {
  id: "time_telling",
  label: "Telling time (analog clocks)",
  subject: "math",
  grades: ["3"],
  topicHint: "Measurement",

  modifiers: [
    { id: "precision", type: "select", label: "Smallest interval",
      options: [
        { value: "hour",    label: "Whole hours (easier)" },
        { value: "half",    label: "Hours and half hours" },
        { value: "quarter", label: "Quarter hours" },
        { value: "five",    label: "Five minutes (harder)" }
      ], default: "half" },
    { id: "count", type: "number", label: "# of clocks", default: 8, min: 4, max: 12 },
    { id: "showDigital", type: "boolean", label: "Include digital answer line (HH:MM)", default: true }
  ],

  generate(m) {
    const count = parseInt(m.count, 10);
    const problems = [];
    for (let i = 0; i < count; i++) {
      const hour = randInt(1, 12);
      let minute;
      switch (m.precision) {
        case "hour": minute = 0; break;
        case "half": minute = Math.random() < 0.5 ? 0 : 30; break;
        case "quarter": minute = [0, 15, 30, 45][randInt(0, 3)]; break;
        case "five": minute = randInt(0, 11) * 5; break;
        default: minute = 0;
      }
      problems.push({ hour, minute });
    }
    return { problems, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "What time is it?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "Look at each clock. Write the time on the line.", y, pageW, margin);

    const cols = 2;
    const colW = (pageW - margin * 2) / cols;
    const rowH = 120;
    let startY = y;
    let pageOffset = 0;

    content.problems.forEach((p, i) => {
      const itemOnPage = i - pageOffset;
      const col = itemOnPage % cols;
      const row = Math.floor(itemOnPage / cols);
      const py = startY + row * rowH;
      if (py + rowH > pageH - margin - 30) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
        startY = y;
        pageOffset = i;
        renderClockProblem(doc, p, margin + 8, startY + 8, colW - 16, rowH - 16, m.showDigital, opts.showAnswers);
      } else {
        const x = margin + col * colW + 8;
        renderClockProblem(doc, p, x, py + 8, colW - 16, rowH - 16, m.showDigital, opts.showAnswers);
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderClockProblem(doc, p, x, y, w, h, showDigital, showAnswer) {
  // Left ~50% clock, right ~50% answer line
  const clockBoxW = w * 0.5;
  const cx = x + clockBoxW / 2;
  const cy = y + h / 2;
  const r = Math.min(clockBoxW / 2 - 8, h / 2 - 4);

  // Clock face
  doc.setDrawColor(20);
  doc.setLineWidth(1.4);
  doc.circle(cx, cy, r, "S");

  // Hour tick marks + numbers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20);
  for (let hh = 1; hh <= 12; hh++) {
    const angle = (hh / 12) * Math.PI * 2 - Math.PI / 2;
    const tx1 = cx + (r - 4) * Math.cos(angle);
    const ty1 = cy + (r - 4) * Math.sin(angle);
    const tx2 = cx + r * Math.cos(angle);
    const ty2 = cy + r * Math.sin(angle);
    doc.setLineWidth(0.8);
    doc.line(tx1, ty1, tx2, ty2);
    const nx = cx + (r - 12) * Math.cos(angle);
    const ny = cy + (r - 12) * Math.sin(angle);
    doc.text(String(hh), nx, ny + 3, { align: "center" });
  }

  // Hands
  const minuteAngle = (p.minute / 60) * Math.PI * 2 - Math.PI / 2;
  const hourFraction = (p.hour % 12) + p.minute / 60;
  const hourAngle = (hourFraction / 12) * Math.PI * 2 - Math.PI / 2;
  // Hour hand: shorter, thicker
  doc.setLineWidth(2);
  doc.line(cx, cy, cx + r * 0.55 * Math.cos(hourAngle), cy + r * 0.55 * Math.sin(hourAngle));
  // Minute hand: longer, thinner
  doc.setLineWidth(1.2);
  doc.line(cx, cy, cx + r * 0.85 * Math.cos(minuteAngle), cy + r * 0.85 * Math.sin(minuteAngle));
  // Center
  doc.setFillColor(20);
  doc.circle(cx, cy, 1.6, "F");

  // Right side: answer line
  const ansX = x + clockBoxW + 8;
  const ansY = cy;
  if (showDigital) {
    // Two boxes like a digital clock: __:__
    const boxW = 30;
    const boxH = 26;
    doc.setDrawColor(20);
    doc.setLineWidth(0.7);
    doc.rect(ansX, ansY - boxH / 2, boxW, boxH, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(":", ansX + boxW + 6, ansY + 6);
    doc.rect(ansX + boxW + 16, ansY - boxH / 2, boxW, boxH, "S");
    if (showAnswer) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(String(p.hour), ansX + boxW / 2, ansY + 5, { align: "center" });
      doc.text(String(p.minute).padStart(2, "0"), ansX + boxW + 16 + boxW / 2, ansY + 5, { align: "center" });
    }
  } else {
    doc.setDrawColor(20);
    doc.setLineWidth(0.9);
    doc.line(ansX, ansY + 12, x + w - 4, ansY + 12);
    if (showAnswer) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      const tstr = `${p.hour}:${String(p.minute).padStart(2, "0")}`;
      doc.text(tstr, (ansX + x + w) / 2, ansY + 8, { align: "center" });
    }
  }
}

/* ============================================================
   TEMPLATE — SIGHT WORDS PRACTICE  (K, Gr1 reading)
   Maps to BC EK.7 / E1.4
   Word lists adapted from Dolch + BC common sight words
============================================================ */
window.SIGHT_WORDS = {
  K: ["the","of","and","a","to","in","is","you","that","it","he","was","for","on","are","as","with","his","they","I","at","be","this","have","from","or","one","had","by","but","not","what","all","were","we"],
  "1": ["when","your","can","said","there","use","an","each","which","she","do","how","their","if","will","up","other","about","out","many","then","them","these","so","some","her","would","make","like","into","time","has","look","two"],
  mixed: null // computed below
};
window.SIGHT_WORDS.mixed = [...window.SIGHT_WORDS.K, ...window.SIGHT_WORDS["1"]];

window.TEMPLATES.sight_words_practice = {
  id: "sight_words_practice",
  label: "Sight words — read & write",
  subject: "reading",
  grades: ["K", "1"],
  topicHint: "Reading",

  modifiers: [
    { id: "wordSet", type: "select", label: "Word list",
      options: [
        { value: "K",     label: "Kindergarten basics" },
        { value: "1",     label: "Grade 1" },
        { value: "mixed", label: "Mixed K + Grade 1" }
      ], default: "K" },
    { id: "count", type: "number", label: "# of words", default: 8, min: 4, max: 16 },
    { id: "format", type: "select", label: "Format",
      options: [
        { value: "read_trace_write", label: "Read → Trace → Write (full practice)" },
        { value: "read_only",        label: "Read aloud only (big print)" }
      ], default: "read_trace_write" }
  ],

  generate(m) {
    const list = window.SIGHT_WORDS[m.wordSet] || window.SIGHT_WORDS.K;
    const pool = [...list];
    const count = Math.min(parseInt(m.count, 10), pool.length);
    const picked = [];
    while (picked.length < count && pool.length) {
      const idx = randInt(0, pool.length - 1);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return { words: picked, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Sight Words — Read, Trace, Write";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "Read each word out loud. Trace the gray copy. Then write it yourself on the line.", y, pageW, margin);

    const isReadOnly = m.format === "read_only";
    const rowH = isReadOnly ? 56 : 76;

    content.words.forEach((word) => {
      if (pdfNeedNewPage(doc, y, rowH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      renderSightWordRow(doc, word, margin, y, pageW - margin * 2, rowH, isReadOnly, opts.showAnswers);
      y += rowH;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function renderSightWordRow(doc, word, x, y, w, h, isReadOnly, showAnswers) {
  // Layout: bold word on left, then trace area, then blank lines (or just big word if read_only)
  if (isReadOnly) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(36);
    doc.setTextColor(20, 20, 20);
    doc.text(word, x + w / 2, y + h / 2 + 12, { align: "center" });
    // Underline
    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.line(x + 10, y + h - 6, x + w - 10, y + h - 6);
    return;
  }

  // Three sections: bold word | traced (light) | blank line
  const sectionW = w / 3;
  const baseline = y + h * 0.7;
  const topLine = y + h * 0.15;
  const midLine = y + h * 0.45;

  // Guide lines across the row
  doc.setDrawColor(170);
  doc.setLineWidth(0.4);
  doc.line(x, topLine, x + w, topLine);
  doc.setLineDashPattern([2.5, 3], 0);
  doc.line(x, midLine, x + w, midLine);
  doc.setLineDashPattern([], 0);
  doc.line(x, baseline, x + w, baseline);

  ensureTracingFontRegistered(doc);

  // Section 1: model word (read this) — solid dark
  doc.setFont(traceModelFont(), "normal");
  doc.setFontSize(30);
  doc.setTextColor(20, 20, 20);
  doc.text(word, x + 10, baseline);

  // Section 2: single-line dashed word to trace
  pdfTraceText(doc, word, x + sectionW + 10, baseline, 30, 150);

  // Section 3: blank space for kid to write
  if (showAnswers) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(180, 30, 30);
    doc.text(word, x + sectionW * 2 + 10, baseline);
  }

  // Divider lines between sections
  doc.setDrawColor(140);
  doc.setLineDashPattern([1.5, 2], 0);
  doc.setLineWidth(0.4);
  doc.line(x + sectionW, topLine - 4, x + sectionW, baseline + 4);
  doc.line(x + sectionW * 2, topLine - 4, x + sectionW * 2, baseline + 4);
  doc.setLineDashPattern([], 0);

  doc.setTextColor(0, 0, 0);
}

/* ============================================================
   AI TEMPLATE — READING COMPREHENSION PASSAGE (Gr3)
   Maps to BC E3.1 / E3.5 / E3.3 / E3.10
   Uses Claude API to generate a fresh passage themed around the
   kid's interests, then comprehension questions to print alongside.
============================================================ */
window.TEMPLATES.reading_passage_gr3 = {
  id: "reading_passage_gr3",
  label: "Reading passage + comprehension Qs",
  subject: "reading",
  grades: ["3"],
  topicHint: "Reading",
  usesAI: true,
  acceptsReferences: false,
  maxTokens: 3000,

  modifiers: [
    { id: "genre", type: "select", label: "Genre",
      options: [
        { value: "fiction",     label: "Fiction (short story)" },
        { value: "nonfiction",  label: "Nonfiction (informational)" },
        { value: "fable",       label: "Fable / folktale" },
        { value: "biography",   label: "Mini biography" },
        { value: "mixed",       label: "Claude picks" }
      ], default: "fiction" },
    { id: "length", type: "select", label: "Passage length",
      options: [
        { value: "short",  label: "Short (~80–120 words)" },
        { value: "medium", label: "Medium (~150–220 words)" },
        { value: "long",   label: "Long (~250–320 words)" }
      ], default: "medium" },
    { id: "topicHint", type: "text", label: "Topic hint (optional — leave blank to use kid's interests)", default: "" },
    { id: "questionCount", type: "number", label: "# of questions", default: 5, min: 3, max: 8 },
    { id: "includeVocab", type: "boolean", label: "Include 1 vocabulary question", default: true },
    { id: "includeInference", type: "boolean", label: "Include 1 inference question (\"why do you think…\")", default: true }
  ],

  buildPrompt(mods, kid) {
    const wordRange = {
      short:  "between 80 and 120 words",
      medium: "between 150 and 220 words",
      long:   "between 250 and 320 words"
    }[mods.length] || "around 200 words";

    const genreText = {
      fiction:    "an original short fictional story",
      nonfiction: "a short nonfiction informational passage",
      fable:      "a short fable or folktale with a gentle moral",
      biography:  "a short factual mini-biography of a real, age-appropriate person",
      mixed:      "an age-appropriate passage — you choose fiction or nonfiction"
    }[mods.genre] || "an original short passage";

    const lvl = tmplLevel(kid, this.subject);
    const gw = gradeWord(lvl);

    const topic = mods.topicHint && mods.topicHint.trim()
      ? `The topic must be: ${mods.topicHint.trim()}.`
      : (kid.interests
          ? `Theme it around the child's interests when possible: ${kid.interests}.`
          : `Pick a topic a ${gw} reader would find engaging — nature, animals, history, sports, science, or everyday life.`);

    const extras = [];
    if (mods.includeVocab) extras.push("Include exactly one vocabulary question that asks the meaning of a specific word from the passage (give the word in quotes).");
    if (mods.includeInference) extras.push("Include exactly one inference question that asks \"Why do you think…\" or \"What does this tell us about…\"");

    return `You are a BC-curriculum-aligned worksheet generator for a homeschooled ${gw} student.

CHILD: ${kid.name}, age ${kid.age}, ${gw} reading level.
INTERESTS: ${kid.interests || "(none specified)"}
PARENT NOTES: ${kid.notes || "(none)"}

TASK: Write ${genreText}, ${wordRange} long, and ${mods.questionCount} comprehension questions about it.

${topic}

WRITING REQUIREMENTS:
- Reading level: ${gw} (calibrate vocabulary and sentence complexity to this grade).
- Sentence variety: short and medium sentences mixed; at least 2 compound sentences.
- Voice: warm, clear, age-appropriate. No violence, no scary content.
- Give the passage a short engaging title.
- Break the passage into 2–4 short paragraphs separated by blank lines.

QUESTION REQUIREMENTS:
- Mix of: 1 main-idea question, 1–2 detail questions, ${extras.length} other type${extras.length === 1 ? "" : "s"}.
${extras.map(e => "- " + e).join("\n")}
- Each question gets a model "answer" used for the answer key. Answers should be short (1–2 sentences).
- All questions must be answerable from the passage alone.

RETURN VALID JSON ONLY (no markdown fences, no commentary):
{
  "title": "Reading: <short label>",
  "passageTitle": "<short title for the passage itself>",
  "passage": "<full passage text, paragraphs separated by \\n\\n>",
  "questions": [
    { "q": "<question>", "answer": "<model answer>", "type": "short_response" }
  ],
  "standards": ["E3.1", "E3.5"]
}`;
  },

  parseResponse(text) {
    // Strip markdown fences if Claude wrapped it
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let obj;
    try {
      obj = JSON.parse(cleaned);
    } catch (e) {
      // Fallback: try to find the first { ... } block
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Claude response wasn't valid JSON.");
      obj = JSON.parse(m[0]);
    }
    return {
      title: obj.title || "Reading Comprehension",
      passageTitle: obj.passageTitle || "",
      passage: obj.passage || "",
      questions: (obj.questions || []).map(q => ({
        q: q.q || q.question || "",
        answer: q.answer || "",
        type: q.type || "short_response"
      })),
      standards: obj.standards || ["E3.1", "E3.5"]
    };
  },

  // No-API-key fallback so the template is testable without burning tokens.
  mockResponse(mods, kid) {
    const passage = `On the West Coast of British Columbia, salmon do something amazing every fall. After years of living in the ocean, they swim all the way back to the small streams where they were born.\n\nThe trip is long and hard. Salmon must jump up waterfalls. They must dodge bears and eagles. Some salmon swim for weeks without eating.\n\nWhen they finally reach the right stream, the females dig small nests in the gravel and lay their eggs. Then the salmon's life cycle starts all over again. Bears, eagles, and even old fallen trees in the forest all rely on the salmon's return.`;
    const questions = [
      { q: "Where do salmon go when fall comes?", answer: "They swim back to the small streams where they were born.", type: "short_response" },
      { q: "Name two things salmon must do on their journey.", answer: "Any two of: jump up waterfalls, dodge bears, dodge eagles, swim without eating.", type: "short_response" },
      { q: "What does the female salmon do when she reaches the right stream?", answer: "She digs a small nest in the gravel and lays her eggs.", type: "short_response" },
      { q: "What does the word 'dodge' mean in this passage?", answer: "To avoid or get out of the way of something.", type: "short_response" },
      { q: "Why do you think the writer says bears, eagles, and old trees rely on the salmon's return?", answer: "Because salmon are food for bears and eagles, and when salmon die in the streams their bodies feed the forest soil.", type: "short_response" }
    ].slice(0, parseInt(mods.questionCount, 10) || 5);
    return JSON.stringify({
      title: "Reading: The Long Journey Home",
      passageTitle: "The Long Journey Home",
      passage,
      questions,
      standards: ["E3.1", "E3.5"]
    });
  },

  titleFrom(content, mods, kid) {
    return content.title || `Reading: ${content.passageTitle || "Comprehension"}`;
  },

  renderPDF(doc, content, mods, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = content.title || "Reading Comprehension";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);

    // Passage title (smaller, centered, italic)
    if (content.passageTitle) {
      doc.setFont("times", "bolditalic");
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(content.passageTitle, pageW / 2, y + 4, { align: "center" });
      y += 22;
    }

    // Passage — wrap paragraphs, paginate as needed
    const passageMaxW = pageW - margin * 2;
    const paragraphs = (content.passage || "").split(/\n+/).map(p => p.trim()).filter(Boolean);
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    const lineH = 16;
    paragraphs.forEach(para => {
      const lines = doc.splitTextToSize(para, passageMaxW);
      lines.forEach(line => {
        if (pdfNeedNewPage(doc, y, lineH, margin)) {
          y = pdfAddPageWithHeader(doc, title, pageW, margin);
        }
        doc.text(line, margin, y);
        y += lineH;
      });
      y += 6; // paragraph gap
    });

    // Separator
    y += 6;
    if (pdfNeedNewPage(doc, y, 26, margin)) {
      y = pdfAddPageWithHeader(doc, title, pageW, margin);
    }
    doc.setDrawColor(40);
    doc.setLineWidth(1);
    doc.line(margin, y, pageW - margin, y);
    y += 14;

    // Questions header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text("Comprehension Questions", margin, y);
    y += 14;

    // Questions
    const questions = content.questions || [];
    questions.forEach((q, i) => {
      const qLines = doc.splitTextToSize(`${i + 1}. ${q.q}`, passageMaxW);
      const blockH = qLines.length * lineH + 36; // text + 2 answer lines + padding
      if (pdfNeedNewPage(doc, y, blockH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(20);
      qLines.forEach(line => {
        doc.text(line, margin, y);
        y += lineH;
      });
      // Two answer lines
      doc.setDrawColor(80);
      doc.setLineWidth(0.5);
      const ansLineY1 = y + 6;
      const ansLineY2 = y + 22;
      doc.line(margin + 18, ansLineY1, pageW - margin, ansLineY1);
      doc.line(margin + 18, ansLineY2, pageW - margin, ansLineY2);

      if (opts.showAnswers && q.answer) {
        doc.setFont("times", "italic");
        doc.setFontSize(10);
        doc.setTextColor(140, 30, 30);
        const ansLines = doc.splitTextToSize(q.answer, passageMaxW - 22);
        ansLines.slice(0, 2).forEach((line, j) => {
          doc.text(line, margin + 22, y + 4 + j * 16);
        });
        doc.setTextColor(20);
      }
      y = ansLineY2 + 14;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   WRITING CONTENT BANKS
   Themed item sets used by the Scholastic-style writing templates.
   Each template picks one theme per generation so the worksheet
   isn't identical every time.
============================================================ */
window.WRITING_BANKS = {
  // Theme banks for capitalize_questions
  question_themes: {
    mother_goose: {
      label: "Ask Mother Goose",
      items: [
        "where is the king's castle",
        "who helped Humpty Dumpty",
        "why did the cow jump over the moon",
        "will the frog become a prince",
        "could the three mice see",
        "what did the giant find at the top of the beanstalk",
        "who blew down the pig's house",
        "how did Cinderella lose her shoe",
        "when will the sleeping princess wake up",
        "why is Goldilocks afraid of bears"
      ]
    },
    animals: {
      label: "All About Animals",
      items: [
        "where do polar bears live",
        "what do pandas eat for breakfast",
        "how do bats find their way in the dark",
        "why do owls hunt at night",
        "when do salmon swim upstream",
        "could a turtle outrun a hare",
        "will the kitten learn to climb",
        "who taught the bear cubs to fish",
        "how many spots does a leopard have"
      ]
    },
    space: {
      label: "Out of This World",
      items: [
        "how many moons does Jupiter have",
        "where does the sun go at night",
        "why are stars so far away",
        "could humans live on Mars",
        "will we ever visit Pluto",
        "what is at the center of a black hole",
        "when will the next eclipse happen",
        "who was the first person on the Moon",
        "how cold is it in outer space"
      ]
    },
    sports: {
      label: "Game On!",
      items: [
        "could the volleyball team win the gold",
        "what time does the soccer game start",
        "why did the coach call a timeout",
        "will our team make the playoffs",
        "when do practice drills end",
        "how many points do we need to win",
        "who scored the last goal",
        "where will the championship be held"
      ]
    },
    nature: {
      label: "Out in Nature",
      items: [
        "why are the leaves turning red",
        "could a storm reach us by morning",
        "where does the river start",
        "what makes the wind blow",
        "when will the bears come out of their dens",
        "how high can an eagle fly",
        "why does the moon change shape",
        "who left these tracks in the mud"
      ]
    }
  },

  // Theme banks for story_middle_end (each item = one beginning sentence)
  story_themes: {
    parade: {
      label: "Stories on Parade",
      items: [
        "During the parade, a big balloon got loose in the wind.",
        "Five jugglers jumped out of a purple bus.",
        "A group of horses stopped right in front of us.",
        "Some veterans rode by on shiny motorcycles.",
        "Three clowns started juggling apples and oranges."
      ]
    },
    forest: {
      label: "Into the Forest",
      items: [
        "Something rustled in the bushes behind us.",
        "A red squirrel dropped an acorn right on my head.",
        "We followed a tiny stream until it got bigger.",
        "The wind picked up and the tall trees began to sway.",
        "A pair of bright eyes blinked at us from inside a hollow log."
      ]
    },
    weather_day: {
      label: "A Wild Weather Day",
      items: [
        "The sky turned dark green in the middle of the afternoon.",
        "Hailstones the size of marbles bounced off the roof.",
        "A rainbow appeared right over our house.",
        "The wind blew my hat clear across the yard.",
        "Snowflakes started falling, even though it was April."
      ]
    },
    kitchen: {
      label: "Trouble in the Kitchen",
      items: [
        "Mom was making pancakes when the doorbell rang.",
        "The blender exploded with strawberries inside.",
        "I dropped the eggs on the way to the bowl.",
        "Something started smelling really good in the oven.",
        "Our cat jumped onto the counter and stared at the fish."
      ]
    },
    school_day: {
      label: "A Day at School",
      items: [
        "The fire drill bell rang right in the middle of math.",
        "Our class found a baby bird in the playground.",
        "Someone left the gym door wide open in the rain.",
        "Our teacher came in wearing a giant hat.",
        "The whole gym went dark in the middle of dodgeball."
      ]
    }
  },

  // Theme banks for combine_sentences — each item: [s1, s2, keyword, modelCombined]
  combine_themes: {
    gardening: {
      label: "Great Gardening Tips",
      items: [
        ["Fill a cup with water.", "Add some flower seeds.", "and", "Fill a cup with water and add some flower seeds."],
        ["This will soften the seeds.", "They are hard.", "because", "This will soften the seeds because they are hard."],
        ["Fill another cup with dirt.", "The seeds soak in water.", "while", "Fill another cup with dirt while the seeds soak in water."],
        ["Bury the seeds in the cup.", "The dirt covers them.", "until", "Bury the seeds in the cup until the dirt covers them."],
        ["Add water to the plant.", "Do not add too much.", "but", "Add water to the plant, but do not add too much."],
        ["Set the cup in the sun.", "The plant will grow.", "so", "Set the cup in the sun so the plant will grow."]
      ]
    },
    cooking: {
      label: "Kitchen Helpers",
      items: [
        ["Wash the apples.", "Cut them into slices.", "and", "Wash the apples and cut them into slices."],
        ["The soup smells great.", "Mom is making it.", "because", "The soup smells great because Mom is making it."],
        ["Stir the batter.", "The oven heats up.", "while", "Stir the batter while the oven heats up."],
        ["Keep mixing the dough.", "It is smooth.", "until", "Keep mixing the dough until it is smooth."],
        ["I love hot cocoa.", "Mine had too much sugar.", "but", "I love hot cocoa, but mine had too much sugar."],
        ["The cookies are done.", "We can eat them.", "so", "The cookies are done, so we can eat them."]
      ]
    },
    animal_facts: {
      label: "Did You Know? — Animals",
      items: [
        ["Bears have thick fur.", "They have lots of fat.", "and", "Bears have thick fur and they have lots of fat."],
        ["Owls hunt at night.", "Their big eyes can see in the dark.", "because", "Owls hunt at night because their big eyes can see in the dark."],
        ["Salmon swim upstream.", "Bears wait by the river.", "while", "Salmon swim upstream while bears wait by the river."],
        ["Hummingbirds flap their wings.", "They look like tiny blurs.", "until", "Hummingbirds flap their wings until they look like tiny blurs."],
        ["Foxes are quick.", "Rabbits are quicker.", "but", "Foxes are quick, but rabbits are quicker."],
        ["Sea otters hold hands.", "They will not drift apart.", "so", "Sea otters hold hands so they will not drift apart."]
      ]
    },
    weather: {
      label: "Watching the Weather",
      items: [
        ["The sky is bright blue.", "The sun feels warm.", "and", "The sky is bright blue and the sun feels warm."],
        ["I grabbed my umbrella.", "The clouds looked dark.", "because", "I grabbed my umbrella because the clouds looked dark."],
        ["We waited inside.", "The thunder rolled away.", "while", "We waited inside while the thunder rolled away."],
        ["The rain kept falling.", "the streets had puddles.", "until", "The rain kept falling until the streets had puddles."],
        ["I wanted to play outside.", "it was way too windy.", "but", "I wanted to play outside, but it was way too windy."],
        ["The driveway was icy.", "Dad sprinkled salt on it.", "so", "The driveway was icy, so Dad sprinkled salt on it."]
      ]
    }
  },

  // Theme banks for describing_words_fill — each item: [sentence with ___, sample answer]
  describing_fill_themes: {
    its_in_the_bag: {
      label: "It's in the Bag",
      items: [
        ["My friend's ___ dog has fleas!", "scratchy"],
        ["The ___ popcorn is in the big bowl.", "buttery"],
        ["How did the ___ worm get on the sidewalk?", "wiggly"],
        ["The ___ ocean waves crashed against the rocks.", "huge"],
        ["The ___ ball broke a window at school!", "bouncy"],
        ["My ___ skin itched from poison ivy.", "red"],
        ["The two ___ squirrels chased each other up the tree.", "fluffy"],
        ["The ___ sand felt good on my feet.", "warm"],
        ["Are the ___ apples ready to be picked?", "shiny"],
        ["The ___ ball was hard to catch.", "slippery"],
        ["Is the ___ salamander hiding under the rock?", "spotted"],
        ["The ___ snow cone quickly melted.", "icy"]
      ]
    },
    around_the_house: {
      label: "Around the House",
      items: [
        ["The ___ blanket kept me cozy all night.", "fluffy"],
        ["My ___ socks slid across the floor.", "slippery"],
        ["The ___ door creaked when I opened it.", "squeaky"],
        ["I tripped over the ___ rug.", "bumpy"],
        ["The ___ fridge hummed in the corner.", "noisy"],
        ["Mom served us a ___ bowl of soup.", "steamy"],
        ["The ___ cat purred in my lap.", "sleepy"],
        ["The ___ window was hard to see through.", "foggy"],
        ["Dad's ___ chair squeaked when he sat down.", "old"],
        ["The ___ flowers brightened up the table.", "fresh"]
      ]
    },
    outdoors: {
      label: "The Great Outdoors",
      items: [
        ["The ___ leaves crunched under my boots.", "crispy"],
        ["A ___ deer froze right in front of us.", "graceful"],
        ["The ___ stream tumbled down the rocks.", "icy"],
        ["A ___ owl watched us from a high branch.", "silent"],
        ["The ___ campfire warmed our hands.", "crackling"],
        ["Our ___ tent flapped in the wind all night.", "tiny"],
        ["The ___ mountain peak poked through the clouds.", "snowy"],
        ["A ___ moose stepped onto the trail.", "huge"],
        ["The ___ trail led us down to the beach.", "rocky"],
        ["I caught a ___ trout in the river.", "wiggly"]
      ]
    },
    food: {
      label: "Tasty Words",
      items: [
        ["The ___ pizza burned the roof of my mouth.", "hot"],
        ["Grandma's ___ cookies are the best.", "warm"],
        ["The ___ lemonade made my face pucker.", "sour"],
        ["I bit into the ___ pickle.", "crunchy"],
        ["The ___ chili made my eyes water.", "spicy"],
        ["I love ___ apples in the fall.", "crisp"],
        ["The ___ milkshake melted before I could finish it.", "thick"],
        ["Mom's ___ stew warmed us up.", "hearty"],
        ["Dad's ___ bread was a little burnt.", "smoky"],
        ["My ___ cereal soaked up all the milk.", "sugary"]
      ]
    }
  },

  // For describing_words_choose — top section: pairs of [sentence start (no period), answer]
  describing_choose_themes: {
    touch: {
      label: "What Does It Feel Like?",
      sentences: [
        ["Cotton candy is", "soft"],
        ["Before it is cooked, a potato is", "hard"],
        ["A peach's skin is", "fuzzy"],
        ["A needle is", "sharp"],
        ["Mashed potatoes are", "fluffy"],
        ["Sandpaper feels", "rough"],
        ["A baby's hair is", "silky"],
        ["A pinecone is", "prickly"]
      ],
      // word search pool (mostly adjectives related to touch)
      searchWords: ["thick", "bumpy", "rough", "sticky", "smooth", "shiny"]
    },
    taste: {
      label: "What Does It Taste Like?",
      sentences: [
        ["Lemons taste", "sour"],
        ["A cookie is", "sweet"],
        ["Pretzels taste", "salty"],
        ["Hot peppers are", "spicy"],
        ["Plain rice tastes", "bland"],
        ["Coffee tastes", "bitter"],
        ["Watermelon is", "juicy"]
      ],
      searchWords: ["sweet", "sour", "salty", "spicy", "bitter", "juicy"]
    },
    sound: {
      label: "What Does It Sound Like?",
      sentences: [
        ["A balloon popping is", "loud"],
        ["A baby crying is", "shrill"],
        ["A library is", "quiet"],
        ["A thunderclap is", "booming"],
        ["A whisper is", "soft"],
        ["A buzzing bee is", "humming"]
      ],
      searchWords: ["loud", "quiet", "booming", "shrill", "humming", "buzzy"]
    },
    sight: {
      label: "What Does It Look Like?",
      sentences: [
        ["A penny looks", "shiny"],
        ["A foggy window looks", "blurry"],
        ["A clean glass is", "clear"],
        ["A dark room is", "shadowy"],
        ["Velvet looks", "smooth"],
        ["The night sky is", "starry"]
      ],
      searchWords: ["shiny", "blurry", "clear", "smooth", "starry", "dark"]
    }
  }
};

/* ============================================================
   TEMPLATE — CAPITALIZE & PUNCTUATE QUESTIONS
   Modeled after Scholastic "Ask Mother Goose" (Grade 2 Writing).
   Maps to BC E1.13 / E3.13 (capitalization, punctuation conventions).
============================================================ */
window.TEMPLATES.capitalize_questions = {
  id: "capitalize_questions",
  label: "Capitalize & punctuate questions",
  subject: "writing",
  grades: ["1", "3"],
  topicHint: "Conventions",

  modifiers: [
    { id: "theme", type: "select", label: "Theme",
      options: [
        { value: "random",       label: "Surprise me (random theme)" },
        { value: "mother_goose", label: "Ask Mother Goose" },
        { value: "animals",      label: "All About Animals" },
        { value: "space",        label: "Out of This World" },
        { value: "sports",       label: "Game On! (sports)" },
        { value: "nature",       label: "Out in Nature" }
      ], default: "random" },
    { id: "count", type: "number", label: "# of questions", default: 5, min: 3, max: 10 }
  ],

  generate(m) {
    const themes = window.WRITING_BANKS.question_themes;
    const themeKey = pickThemeKey(themes, m.theme);
    const theme = themes[themeKey];
    const items = pickItems(theme.items, parseInt(m.count, 10));
    const problems = items.map(raw => ({ raw, fixed: fixQuestionCase(raw) }));
    return { themeKey, themeLabel: theme.label, problems, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    let y = pdfDrawScholasticHeader(doc, "Capitalize/Punctuate questions", content.themeLabel, pageW, margin);

    // Left: instruction.  Right: hint box.
    const hintW = 200;
    const hintX = pageW - margin - hintW;
    const instrW = pageW - margin * 2 - hintW - 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    const instrLines = doc.splitTextToSize("Rewrite the questions using capital letters and question marks.", instrW);
    instrLines.forEach((line, i) => doc.text(line, margin, y + i * 14));

    // Hint box
    const hintLines = [
      { text: "A sentence that asks", bold: false },
      { text: "a question ends with a", bold: false },
      { text: "question mark (?).", bold: false },
      { text: "It often begins with one of", bold: false },
      { text: "these words:", bold: false },
      { text: "Who   What   Where   When", bold: true },
      { text: "Why   Will   Could   How", bold: true }
    ];
    pdfDrawSideHintBox(doc, hintLines, hintX, y - 10, hintW);

    y += instrLines.length * 14 + 30;

    // Items
    content.problems.forEach((p, i) => {
      if (pdfNeedNewPage(doc, y, 56, margin)) y = pdfAddPageWithHeader(doc, content.themeLabel, pageW, margin);

      // Numbered dot
      pdfDrawNumberedDot(doc, String(i + 1), margin + 12, y + 6, 10);

      // Lowercase question (the prompt)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text(p.raw, margin + 32, y + 10);

      // Answer line
      const lineY = y + 36;
      doc.setDrawColor(20);
      doc.setLineWidth(0.8);
      doc.line(margin + 32, lineY, pageW - margin, lineY);

      // Answer-key mode: write the fixed version in the line
      if (opts.showAnswers) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(180, 30, 30);
        doc.text(p.fixed, margin + 36, lineY - 4);
      }

      y += 56;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   TEMPLATE — STORY MIDDLE & END
   Modeled after Scholastic "Stories on Parade" (Grade 2 Writing).
   Maps to BC E1.7 / E3.8 (writing process, story structure).
============================================================ */
window.TEMPLATES.story_middle_end = {
  id: "story_middle_end",
  label: "Story middles & endings",
  subject: "writing",
  grades: ["1", "3"],
  topicHint: "Writing",

  modifiers: [
    { id: "theme", type: "select", label: "Theme",
      options: [
        { value: "random",       label: "Surprise me (random theme)" },
        { value: "parade",       label: "Stories on Parade" },
        { value: "forest",       label: "Into the Forest" },
        { value: "weather_day",  label: "A Wild Weather Day" },
        { value: "kitchen",      label: "Trouble in the Kitchen" },
        { value: "school_day",   label: "A Day at School" }
      ], default: "random" },
    { id: "count", type: "number", label: "# of stories", default: 4, min: 2, max: 5 }
  ],

  generate(m) {
    const themes = window.WRITING_BANKS.story_themes;
    const themeKey = pickThemeKey(themes, m.theme);
    const theme = themes[themeKey];
    const beginnings = pickItems(theme.items, parseInt(m.count, 10));
    const problems = beginnings.map(b => ({ beginning: b }));
    return { themeKey, themeLabel: theme.label, problems, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const TEAL_DARK = [33, 130, 130];

    let y = pdfDrawScholasticHeader(doc, "Write the middle and end of stories", content.themeLabel, pageW, margin);

    // Instructions
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    const instrLines = doc.splitTextToSize("Stories have a beginning (B), a middle (M), and an end (E). Write a middle sentence that tells what happens next. Then write an ending sentence that tells what happens last.", pageW - margin * 2);
    instrLines.forEach((line, i) => doc.text(line, margin, y + i * 14));
    y += instrLines.length * 14 + 18;

    const lineRowH = 28;
    const blockH = 24 + lineRowH * 2 + 14; // B label + M line + E line + gap

    content.problems.forEach(p => {
      if (pdfNeedNewPage(doc, y, blockH, margin)) y = pdfAddPageWithHeader(doc, content.themeLabel, pageW, margin);

      // B dot + beginning sentence
      pdfDrawNumberedDot(doc, "B", margin + 12, y + 8, 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(20);
      const bLines = doc.splitTextToSize(p.beginning, pageW - margin - 32 - margin);
      bLines.forEach((line, i) => doc.text(line, margin + 32, y + 12 + i * 14));
      y += Math.max(24, bLines.length * 14 + 6);

      // M dot + "Next, ____"
      pdfDrawNumberedDot(doc, "M", margin + 12, y + 6, 10, TEAL_DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text("Next,", margin + 32, y + 10);
      doc.setDrawColor(20);
      doc.setLineWidth(0.8);
      doc.line(margin + 70, y + 12, pageW - margin, y + 12);
      y += 24;

      // E dot + "Last, ____"
      pdfDrawNumberedDot(doc, "E", margin + 12, y + 6, 10, TEAL_DARK);
      doc.text("Last,", margin + 32, y + 10);
      doc.line(margin + 70, y + 12, pageW - margin, y + 12);
      y += 28;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   TEMPLATE — COMBINE SENTENCES
   Modeled after Scholastic "Great Gardening Tips" (Grade 2 Writing).
   Maps to BC E3.12 (compound sentence structure).
============================================================ */
window.TEMPLATES.combine_sentences = {
  id: "combine_sentences",
  label: "Combine sentences with a keyword",
  subject: "writing",
  grades: ["3"],
  topicHint: "Grammar",

  modifiers: [
    { id: "theme", type: "select", label: "Theme",
      options: [
        { value: "random",     label: "Surprise me (random theme)" },
        { value: "gardening",  label: "Great Gardening Tips" },
        { value: "cooking",    label: "Kitchen Helpers" },
        { value: "animal_facts", label: "Did You Know? — Animals" },
        { value: "weather",    label: "Watching the Weather" }
      ], default: "random" },
    { id: "count", type: "number", label: "# of pairs", default: 6, min: 3, max: 8 }
  ],

  generate(m) {
    const themes = window.WRITING_BANKS.combine_themes;
    const themeKey = pickThemeKey(themes, m.theme);
    const theme = themes[themeKey];
    const items = pickItems(theme.items, parseInt(m.count, 10));
    const problems = items.map(([s1, s2, keyword, answer]) => ({ s1, s2, keyword, answer }));
    return { themeKey, themeLabel: theme.label, problems, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    let y = pdfDrawScholasticHeader(doc, "Combine sentences", content.themeLabel, pageW, margin);

    // Instruction (left) + hint box (right) with worked example
    const hintW = 220;
    const hintX = pageW - margin - hintW;
    const instrW = pageW - margin * 2 - hintW - 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    const instrLines = doc.splitTextToSize("Combine the two sentences using the key word. Write a new sentence on the line.", instrW);
    instrLines.forEach((line, i) => doc.text(line, margin, y + i * 14));

    const hintLines = [
      "Sentences can be combined",
      "to make them more",
      "interesting. A key word can",
      "tie two sentences together.",
      "",
      { text: "I will plan my garden.", bold: true },
      { text: "I am waiting for spring.", bold: true },
      "",
      "I will plan my garden",
      "while I am waiting for spring."
    ];
    pdfDrawSideHintBox(doc, hintLines, hintX, y - 10, hintW);

    y += Math.max(instrLines.length * 14, hintLines.length * 13 + 16) + 16;

    // Items
    content.problems.forEach((p, i) => {
      // Estimated block height: text + keyword pill + answer line
      const sentencesStr = `${p.s1} ${p.s2}`;
      const sentenceLines = doc.splitTextToSize(sentencesStr, pageW - margin - 32 - 90);
      const blockH = sentenceLines.length * 14 + 50;
      if (pdfNeedNewPage(doc, y, blockH, margin)) y = pdfAddPageWithHeader(doc, content.themeLabel, pageW, margin);

      // Number dot
      pdfDrawNumberedDot(doc, String(i + 1), margin + 12, y + 8, 10);

      // Two sentences printed together
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(20);
      sentenceLines.forEach((line, j) => doc.text(line, margin + 32, y + 10 + j * 14));

      // Keyword pill on the right
      const kwX = pageW - margin - 80;
      const kwY = y + 6;
      doc.setFillColor(255, 245, 230);
      doc.setDrawColor(SCHOLASTIC_ORANGE[0], SCHOLASTIC_ORANGE[1], SCHOLASTIC_ORANGE[2]);
      doc.setLineWidth(0.8);
      doc.roundedRect(kwX, kwY, 70, 22, 11, 11, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...SCHOLASTIC_ORANGE);
      doc.text(p.keyword, kwX + 35, kwY + 14, { align: "center" });
      doc.setTextColor(20);

      // Answer line
      const lineY = y + 14 + Math.max(sentenceLines.length * 14, 24);
      doc.setDrawColor(20);
      doc.setLineWidth(0.8);
      doc.line(margin + 32, lineY, pageW - margin, lineY);

      if (opts.showAnswers) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(180, 30, 30);
        const ansLines = doc.splitTextToSize(p.answer, pageW - margin - 32 - 8);
        ansLines.slice(0, 1).forEach(line => doc.text(line, margin + 36, lineY - 4));
      }

      y = lineY + 18;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   TEMPLATE — DESCRIBING WORDS (FILL IN THE BLANK)
   Modeled after Scholastic "It's in the Bag" (Grade 2 Writing).
   Maps to BC E3.10 (word patterns and vocabulary).
============================================================ */
window.TEMPLATES.describing_words_fill = {
  id: "describing_words_fill",
  label: "Add a describing word",
  subject: "writing",
  grades: ["1", "3"],
  topicHint: "Vocabulary",

  modifiers: [
    { id: "theme", type: "select", label: "Theme",
      options: [
        { value: "random",            label: "Surprise me (random theme)" },
        { value: "its_in_the_bag",    label: "It's in the Bag" },
        { value: "around_the_house",  label: "Around the House" },
        { value: "outdoors",          label: "The Great Outdoors" },
        { value: "food",              label: "Tasty Words" }
      ], default: "random" },
    { id: "count", type: "number", label: "# of sentences", default: 10, min: 6, max: 14 }
  ],

  generate(m) {
    const themes = window.WRITING_BANKS.describing_fill_themes;
    const themeKey = pickThemeKey(themes, m.theme);
    const theme = themes[themeKey];
    const items = pickItems(theme.items, parseInt(m.count, 10));
    const problems = items.map(([sentence, answer]) => ({ sentence, answer }));
    return { themeKey, themeLabel: theme.label, problems, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    let y = pdfDrawScholasticHeader(doc, "Write describing words", content.themeLabel, pageW, margin);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text("Add a describing word to each sentence.", margin, y);
    y += 24;

    content.problems.forEach((p, i) => {
      if (pdfNeedNewPage(doc, y, 32, margin)) y = pdfAddPageWithHeader(doc, content.themeLabel, pageW, margin);

      pdfDrawNumberedDot(doc, String(i + 1), margin + 12, y + 6, 10);

      // Render the sentence with the blank replaced by a long underline.
      // The blank is "___" — we keep the text but draw a fat line under that span.
      const parts = p.sentence.split("___");
      const before = parts[0] || "";
      const after = parts[1] || "";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(20);

      let cx = margin + 32;
      const cyText = y + 10;
      if (before) {
        doc.text(before.trim() + " ", cx, cyText);
        cx += doc.getTextWidth(before.trim() + " ");
      }
      // Underline / blank gap
      const blankW = 90;
      const blankY = cyText + 2;
      doc.setDrawColor(20);
      doc.setLineWidth(0.7);
      doc.line(cx, blankY, cx + blankW, blankY);
      if (opts.showAnswers) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(180, 30, 30);
        doc.text(p.answer, cx + blankW / 2, cyText, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(20);
        doc.setFontSize(12);
      }
      cx += blankW + 4;
      if (after) {
        doc.text(" " + after.trim(), cx, cyText);
      }

      y += 30;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   TEMPLATE — DESCRIBING WORDS — CHOOSE + WORD SEARCH
   Modeled after Scholastic "What Does It Feel Like?" (Grade 2 Writing).
   Two-section worksheet: fill-in-with-word-bank + word search.
   Maps to BC E3.10 / E3.13.
============================================================ */
window.TEMPLATES.describing_words_choose = {
  id: "describing_words_choose",
  label: "Choose describing words (+ word search)",
  subject: "writing",
  grades: ["1", "3"],
  topicHint: "Vocabulary",

  modifiers: [
    { id: "theme", type: "select", label: "Theme",
      options: [
        { value: "random", label: "Surprise me (random theme)" },
        { value: "touch",  label: "What Does It Feel Like? (touch)" },
        { value: "taste",  label: "What Does It Taste Like?" },
        { value: "sound",  label: "What Does It Sound Like?" },
        { value: "sight",  label: "What Does It Look Like?" }
      ], default: "random" },
    { id: "count", type: "number", label: "# of sentences (top)", default: 5, min: 3, max: 8 },
    { id: "includeWordSearch", type: "boolean", label: "Include a word search at the bottom", default: true },
    { id: "wordSearchCount", type: "number", label: "# of words in search", default: 6, min: 4, max: 8 }
  ],

  generate(m) {
    const themes = window.WRITING_BANKS.describing_choose_themes;
    const themeKey = pickThemeKey(themes, m.theme);
    const theme = themes[themeKey];
    const sentencePicks = pickItems(theme.sentences, parseInt(m.count, 10));
    const problems = sentencePicks.map(([sentence, answer]) => ({ sentence, answer }));
    const sentenceBank = Array.from(new Set(problems.map(p => p.answer)));

    let wordSearch = null;
    if (m.includeWordSearch) {
      const searchPool = [...theme.searchWords];
      const searchPicks = pickItems(searchPool, parseInt(m.wordSearchCount, 10));
      wordSearch = buildWordSearch(searchPicks, { rows: 5, cols: 9 });
      wordSearch.words = searchPicks;
    }

    return { themeKey, themeLabel: theme.label, problems, sentenceBank, wordSearch, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    let y = pdfDrawScholasticHeader(doc, "Choose describing words", content.themeLabel, pageW, margin);

    // Two-column header: instruction (left) + hint box (right)
    const hintW = 200;
    const hintX = pageW - margin - hintW;
    const instrW = pageW - margin * 2 - hintW - 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(doc.splitTextToSize("Choose the best describing word to complete each sentence.", instrW), margin, y);

    const hintLines = [
      "Describing words give",
      "information about something",
      "we can discover with our",
      "senses."
    ];
    pdfDrawSideHintBox(doc, hintLines, hintX, y - 10, hintW);

    y += 36;

    // Sentences on the left, word bank on the right
    const bankX = pageW - margin - 110;
    const sentenceMaxW = bankX - margin - 40;

    content.problems.forEach((p, i) => {
      if (pdfNeedNewPage(doc, y, 30, margin)) y = pdfAddPageWithHeader(doc, content.themeLabel, pageW, margin);

      pdfDrawNumberedDot(doc, String(i + 1), margin + 12, y + 6, 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(20);
      const text = p.sentence.endsWith(" ") ? p.sentence : p.sentence + " ";
      const cyText = y + 10;
      let cx = margin + 32;
      doc.text(text, cx, cyText);
      cx += doc.getTextWidth(text);
      // Blank line for the describing word
      const blankW = 80;
      doc.setDrawColor(20);
      doc.setLineWidth(0.7);
      doc.line(cx, cyText + 2, cx + blankW, cyText + 2);
      doc.setTextColor(20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(".", cx + blankW + 2, cyText);
      if (opts.showAnswers) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(180, 30, 30);
        doc.text(p.answer, cx + blankW / 2, cyText, { align: "center" });
      }
      y += 30;
    });

    // Word bank box for the top section
    const bankY = y - content.problems.length * 30 - 6;
    drawWordBankBox(doc, "Word Bank", content.sentenceBank, bankX, bankY, 110);

    y += 14;

    // Word search section
    if (content.wordSearch) {
      // Dotted separator
      doc.setDrawColor(SCHOLASTIC_ORANGE[0], SCHOLASTIC_ORANGE[1], SCHOLASTIC_ORANGE[2]);
      doc.setLineDashPattern([2, 3], 0);
      doc.setLineWidth(0.8);
      doc.line(margin, y, pageW - margin, y);
      doc.setLineDashPattern([], 0);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(40);
      doc.text("Look at the words in the Word Bank. Find and circle each word in the word search.", margin, y);
      y += 16;

      // Render grid + word bank side-by-side
      const gridW = pageW - margin * 2 - 130;
      const gridY = y;
      drawWordSearchGrid(doc, content.wordSearch.grid, margin, gridY, gridW, opts.showAnswers ? content.wordSearch.placements : null);
      drawWordBankBox(doc, "Word Bank", content.wordSearch.words, pageW - margin - 110, gridY, 110);
      y = gridY + content.wordSearch.grid.length * 24 + 16;
    }

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function drawWordBankBox(doc, title, words, x, y, w) {
  const h = 30 + words.length * 18;
  // Background
  doc.setFillColor(232, 240, 244);
  doc.roundedRect(x, y, w, h, 4, 4, "F");
  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text(title, x + w / 2, y + 16, { align: "center" });
  // Underline under title
  doc.setDrawColor(80);
  doc.setLineWidth(0.6);
  doc.line(x + 12, y + 20, x + w - 12, y + 20);
  // Words
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40);
  words.forEach((word, i) => {
    doc.text(word, x + w / 2, y + 36 + i * 18, { align: "center" });
    doc.setDrawColor(160);
    doc.setLineDashPattern([1, 1.5], 0);
    doc.line(x + 12, y + 38 + i * 18, x + w - 12, y + 38 + i * 18);
    doc.setLineDashPattern([], 0);
  });
}

function drawWordSearchGrid(doc, grid, x, y, w, placementsToHighlight) {
  const rows = grid.length;
  const cols = grid[0].length;
  const cellSize = Math.min(24, (w - 4) / cols);
  const gridW = cols * cellSize;
  const gridH = rows * cellSize;

  // Decorative border around grid (jagged-ish)
  doc.setDrawColor(SCHOLASTIC_ORANGE[0], SCHOLASTIC_ORANGE[1], SCHOLASTIC_ORANGE[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(x - 4, y - 4, gridW + 8, gridH + 8, 3, 3, "S");

  // Letters
  doc.setFont("courier", "normal");
  doc.setFontSize(13);
  doc.setTextColor(20);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x + c * cellSize + cellSize / 2;
      const cy = y + r * cellSize + cellSize / 2 + 4;
      doc.text(grid[r][c], cx, cy, { align: "center" });
    }
  }

  // Highlight placements for the answer key
  if (placementsToHighlight) {
    doc.setDrawColor(200, 60, 60);
    doc.setLineWidth(1.4);
    placementsToHighlight.forEach(pl => {
      const r1 = pl.row;
      const c1 = pl.col;
      const len = pl.word.length;
      const r2 = pl.dir === "vertical" ? r1 + len - 1 : r1;
      const c2 = pl.dir === "horizontal" ? c1 + len - 1 : c1;
      const padding = cellSize * 0.42;
      // Oval over the word
      doc.ellipse(
        (x + c1 * cellSize + cellSize / 2 + x + c2 * cellSize + cellSize / 2) / 2,
        (y + r1 * cellSize + cellSize / 2 + y + r2 * cellSize + cellSize / 2) / 2,
        (Math.abs(c2 - c1) * cellSize / 2) + padding,
        (Math.abs(r2 - r1) * cellSize / 2) + padding,
        "S"
      );
    });
  }
}

// Simple word search builder: places horizontally or vertically, no diagonal,
// fills the rest with random uppercase letters.
function buildWordSearch(words, opts) {
  const rows = opts.rows || 6;
  const cols = opts.cols || 9;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const placements = [];
  const sorted = [...words].map(w => w.toUpperCase()).sort((a, b) => b.length - a.length);

  for (const word of sorted) {
    let placed = false;
    for (let attempt = 0; attempt < 80 && !placed; attempt++) {
      const horizontal = Math.random() < 0.65;
      let row, col;
      if (horizontal) {
        if (word.length > cols) break;
        row = Math.floor(Math.random() * rows);
        col = Math.floor(Math.random() * (cols - word.length + 1));
      } else {
        if (word.length > rows) break;
        row = Math.floor(Math.random() * (rows - word.length + 1));
        col = Math.floor(Math.random() * cols);
      }
      // Conflict check (allow letter overlap if same)
      let conflict = false;
      for (let i = 0; i < word.length; i++) {
        const r = row + (horizontal ? 0 : i);
        const c = col + (horizontal ? i : 0);
        if (grid[r][c] != null && grid[r][c] !== word[i]) { conflict = true; break; }
      }
      if (conflict) continue;
      for (let i = 0; i < word.length; i++) {
        const r = row + (horizontal ? 0 : i);
        const c = col + (horizontal ? i : 0);
        grid[r][c] = word[i];
      }
      placements.push({ word, row, col, dir: horizontal ? "horizontal" : "vertical" });
      placed = true;
    }
  }
  // Fill remaining with random uppercase letters
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] == null) grid[r][c] = ALPHA[Math.floor(Math.random() * 26)];
    }
  }
  return { grid, placements };
}

/* ============================================================
   TEMPLATE — TRACING WORDS (handwriting, lowercase by default)
   Maps to BC E1.11 / E3.11 (legible printing). Reuses the KG
   Primary Dots tracing font: each ghost word is dotted to trace.
============================================================ */
window.TEMPLATES.tracing_words = {
  id: "tracing_words",
  label: "Tracing words (handwriting)",
  subject: "writing",
  grades: ["K", "1", "3"],
  topicHint: "Handwriting",

  modifiers: [
    { id: "wordList", type: "select", label: "Words to trace",
      options: [
        { value: "custom",  label: "My own words (type below)" },
        { value: "cvc",     label: "Starter words (cat, dog, sun…)" },
        { value: "sight_k", label: "Kindergarten sight words" },
        { value: "sight_1", label: "Grade 1 sight words" }
      ], default: "cvc" },
    { id: "customWords", type: "text", label: "My words (separate with spaces or commas)", default: "cat dog sun mom" },
    { id: "letterCase", type: "select", label: "Letter case",
      options: [
        { value: "lower",    label: "lowercase (abc)" },
        { value: "title",    label: "Capitalized (Abc)" },
        { value: "as_typed", label: "As I typed them" }
      ], default: "lower" },
    { id: "maxWords", type: "number", label: "Max # of words", default: 8, min: 3, max: 14 },
    { id: "showGuideLines", type: "boolean", label: "Show handwriting guide lines", default: true },
    { id: "showStartDot", type: "boolean", label: "Show a starting dot on each word", default: false }
  ],

  generate(m) {
    let raw;
    if (m.wordList === "cvc") {
      raw = ["cat", "dog", "sun", "hat", "pig", "bed", "cup", "map", "fox", "bus", "net", "jam"];
    } else if (m.wordList === "sight_k") {
      raw = (window.SIGHT_WORDS && window.SIGHT_WORDS.K) || [];
    } else if (m.wordList === "sight_1") {
      raw = (window.SIGHT_WORDS && window.SIGHT_WORDS["1"]) || [];
    } else {
      raw = (m.customWords || "").split(/[\s,]+/);
    }
    let words = raw.map(w => w.trim()).filter(Boolean);
    words = words.map(w => {
      if (m.letterCase === "lower") return w.toLowerCase();
      if (m.letterCase === "title") return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return w;
    });
    words = words.slice(0, parseInt(m.maxWords, 10) || 8);
    return { words, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const words = content.words || [];
    const title = m.letterCase === "lower" ? "Tracing Words (lowercase)" : "Tracing Words";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(doc, "Trace each word. Start at the dot if shown, and write neatly on the lines.", y, pageW, margin);
    y += 4;

    const rowH = words.length <= 6 ? 86 : 74;
    const fontSize = words.length <= 6 ? 40 : 34;

    words.forEach(word => {
      if (pdfNeedNewPage(doc, y, rowH, margin)) y = pdfAddPageWithHeader(doc, title, pageW, margin);
      drawTracingWordRow(doc, word, y, pageW, margin, fontSize, m, opts);
      y += rowH;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function drawTracingWordRow(doc, word, y, pageW, margin, fontSize, m, opts) {
  const baseline = y + fontSize * 0.82 + 4;
  const topLine  = y + fontSize * 0.12 + 4;
  const midLine  = y + fontSize * 0.55 + 4;

  // 3-line handwriting guides
  if (m.showGuideLines) {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(margin, baseline, pageW - margin, baseline);
    doc.line(margin, topLine, pageW - margin, topLine);
    doc.setLineDashPattern([2.5, 3], 0);
    doc.line(margin, midLine, pageW - margin, midLine);
    doc.setLineDashPattern([], 0);
  }

  // Demo word — solid dark model.
  ensureTracingFontRegistered(doc);
  doc.setFont(traceModelFont(), "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(25, 25, 25);
  doc.text(word, margin + 14, baseline);
  const demoW = doc.getTextWidth(word) + 36;

  if (m.showStartDot) {
    doc.setFillColor(180, 60, 60);
    doc.circle(margin + 10, topLine + 3, 1.8, "F");
  }

  // Divider between demo and tracing area
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.5, 2], 0);
  doc.line(margin + demoW - 10, topLine - 4, margin + demoW - 10, baseline + 4);
  doc.setLineDashPattern([], 0);

  // Ghost copies — single-line dashed letters of the same word, repeated across the line.
  doc.setFont(traceDotsFont(), "normal");
  doc.setFontSize(fontSize);
  const ghostW = doc.getTextWidth(word);
  const gap = fontSize * 0.7;
  let x = margin + demoW + 14;
  let drawn = 0;
  while (x + ghostW <= pageW - margin) {
    pdfTraceText(doc, word, x, baseline, fontSize, 150);
    x += ghostW + gap;
    drawn++;
  }
  // Guarantee at least one ghost copy even for a long word
  if (drawn === 0 && margin + demoW + 14 + ghostW <= pageW - margin + ghostW) {
    pdfTraceText(doc, word, margin + demoW + 14, baseline, fontSize, 150);
  }

  // Answer-key mode: overlay solid completed copies
  if (opts.showAnswers) {
    doc.setFont(traceModelFont(), "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 30, 30);
    let ax = margin + demoW + 14;
    while (ax + ghostW <= pageW - margin) {
      doc.text(word, ax, baseline);
      ax += ghostW + gap;
    }
  }
  doc.setTextColor(0, 0, 0);
}

/* ============================================================
   SHARED AI-TEMPLATE HELPERS
============================================================ */
// Robust JSON extraction shared by AI templates.
function parseAIJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude's response wasn't valid JSON.");
  return JSON.parse(m[0]);
}

// Per-subject level (falls back to nominal grade). Mirrors app.js kidLevel.
function tmplLevel(kid, subject) {
  return (kid.levels && kid.levels[subject]) || kid.gradeKey;
}
// Accepts a grade string ("K","1",...,"6"). Back-compat: if passed a kid object, use its nominal grade.
function gradeWord(g) {
  if (g && typeof g === "object") g = g.gradeKey;
  return g === "K" ? "Kindergarten" : "Grade " + g;
}

/* ============================================================
   AI TEMPLATE — MATH WORD PROBLEMS  (K, Gr1, Gr3)
   Maps to BC MK.5 / M1.3 / M3.3 / M3.5
============================================================ */
window.TEMPLATES.math_word_problems = {
  id: "math_word_problems",
  label: "Math word problems (story problems)",
  subject: "math",
  grades: ["K", "1", "3"],
  topicHint: "Operations",
  usesAI: true,
  acceptsReferences: false,
  maxTokens: 2500,

  modifiers: [
    { id: "operation", type: "select", label: "Math focus",
      options: [
        { value: "auto",        label: "Match the grade (Claude picks)" },
        { value: "addition",    label: "Addition" },
        { value: "subtraction", label: "Subtraction" },
        { value: "add_sub",     label: "Addition & subtraction" },
        { value: "mult_div",    label: "Multiplication & division (Gr 3)" }
      ], default: "auto" },
    { id: "count", type: "number", label: "# of problems", default: 6, min: 3, max: 12 },
    { id: "topicHint", type: "text", label: "Story theme (optional — blank = kid's interests)", default: "" },
    { id: "showWorkSpace", type: "boolean", label: "Include a work-space box for each problem", default: true }
  ],

  buildPrompt(mods, kid) {
    const lvl = tmplLevel(kid, this.subject);
    const gradeBand = {
      "K": "Numbers and totals must stay within 10. One-step only. Very concrete (counting toys, snacks, animals).",
      "1": "Numbers within 20. One-step addition or subtraction. Concrete, everyday situations.",
      "2": "Numbers within 100. One- or two-step addition and subtraction. Everyday situations.",
      "3": "Numbers within 1000 for + and −. Multiplication/division facts within 12×12. One or two steps.",
      "4": "Numbers within 10 000; multiplication/division of 2–3 digit by 1 digit; simple fractions/decimals. Two steps OK.",
      "5": "Multi-digit multiplication/division; decimals to thousandths; fractions with like denominators. Multi-step.",
      "6": "Decimals, fractions, percents, integers, and order of operations. Multi-step reasoning expected."
    }[lvl] || "Grade-appropriate numbers and steps.";

    const opText = {
      auto: "Choose operations appropriate to the grade.",
      addition: "All problems should use addition.",
      subtraction: "All problems should use subtraction.",
      add_sub: "Mix addition and subtraction.",
      mult_div: "Use multiplication and division appropriate to the grade level."
    }[mods.operation] || "Choose operations appropriate to the grade.";

    const theme = mods.topicHint && mods.topicHint.trim()
      ? `Every problem should involve: ${mods.topicHint.trim()}.`
      : (kid.interests ? `Theme the problems around the child's interests when natural: ${kid.interests}.`
                       : "Use everyday, relatable situations (toys, snacks, pets, sports, family).");

    return `You are a BC-curriculum math worksheet generator for a homeschooled child.

CHILD: ${kid.name}, age ${kid.age}, ${gradeWord(lvl)} level.
INTERESTS: ${kid.interests || "(none specified)"}

TASK: Write ${mods.count} math STORY problems (word problems).

GRADE CALIBRATION: ${gradeBand}
OPERATIONS: ${opText}
${theme}

REQUIREMENTS:
- Each problem is 1–2 short sentences, ending in a clear question.
- Use ${kid.name}'s name in some problems to make it personal.
- Keep numbers clean (no remainders for division, no negatives for subtraction).
- Give the exact numeric answer for each (the "answer" field), plus a one-line "work" showing the number sentence (e.g. "7 + 5 = 12").

RETURN VALID JSON ONLY (no markdown fences):
{
  "title": "Math Word Problems: <short label>",
  "instructions": "<one short instruction line for the child>",
  "problems": [
    { "problem": "<the word problem>", "work": "<number sentence>", "answer": "<final answer>" }
  ],
  "standards": ["<BC standard id, e.g. M3.3>"]
}`;
  },

  parseResponse(text) {
    const obj = parseAIJSON(text);
    const problems = (obj.problems || []).map(p => ({
      problem: p.problem || p.q || "",
      work: p.work || "",
      answer: String(p.answer != null ? p.answer : "")
    }));
    return {
      title: obj.title || "Math Word Problems",
      instructions: obj.instructions || "Read each problem. Show your work and write your answer.",
      problems,
      standards: obj.standards || [],
      // expose a generic questions[] for grading compatibility
      questions: problems.map(p => ({ q: p.problem, answer: p.answer, type: "short_response" }))
    };
  },

  mockResponse(mods, kid) {
    const name = kid.name || "Sam";
    const problems = [
      { problem: `${name} had 8 toy cars. ${name} got 5 more for a birthday. How many toy cars now?`, work: "8 + 5 = 13", answer: "13 cars" },
      { problem: `There were 12 cookies on a plate. ${name} ate 4 of them. How many cookies are left?`, work: "12 − 4 = 8", answer: "8 cookies" },
      { problem: `${name} reads 3 books each week. How many books in 4 weeks?`, work: "3 × 4 = 12", answer: "12 books" },
      { problem: `A bag holds 6 apples. ${name} fills 3 bags. How many apples in all?`, work: "6 × 3 = 18", answer: "18 apples" },
      { problem: `${name} has 20 stickers and shares them equally with 4 friends. How many does each friend get?`, work: "20 ÷ 4 = 5", answer: "5 stickers each" },
      { problem: `There are 15 birds in a tree. 7 fly away. How many birds stay?`, work: "15 − 7 = 8", answer: "8 birds" }
    ].slice(0, parseInt(mods.count, 10) || 6);
    return JSON.stringify({
      title: "Math Word Problems: Everyday Math",
      instructions: "Read each problem. Show your work in the box, then write your answer.",
      problems,
      standards: ["M3.3"]
    });
  },

  renderPDF(doc, content, mods, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = content.title || "Math Word Problems";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    if (content.instructions) y = pdfDrawInstruction(doc, content.instructions, y, pageW, margin);

    const showWork = mods.showWorkSpace !== false;
    (content.problems || []).forEach((p, i) => {
      const qLines = doc.splitTextToSize(`${i + 1}. ${p.problem}`, pageW - margin * 2 - 20);
      const workH = showWork ? 56 : 28;
      const blockH = qLines.length * 15 + workH + 12;
      if (pdfNeedNewPage(doc, y, blockH, margin)) y = pdfAddPageWithHeader(doc, title, pageW, margin);

      pdfDrawNumberedDot(doc, String(i + 1), margin + 10, y + 6, 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(20);
      qLines.forEach((line, j) => {
        // strip the leading "N." we already drew as a dot
        const txt = j === 0 ? line.replace(/^\d+\.\s*/, "") : line;
        doc.text(txt, margin + 26, y + 10 + j * 15);
      });
      y += qLines.length * 15 + 6;

      if (showWork) {
        doc.setDrawColor(180);
        doc.setLineWidth(0.6);
        doc.rect(margin + 26, y, pageW - margin - (margin + 26), 40, "S");
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("work space", margin + 30, y + 11);
        if (opts.showAnswers && p.work) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(12);
          doc.setTextColor(140, 30, 30);
          doc.text(p.work, margin + 34, y + 26);
        }
        y += 48;
      }

      // Answer line
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text("Answer:", margin + 26, y + 4);
      doc.setDrawColor(20);
      doc.setLineWidth(0.8);
      doc.line(margin + 80, y + 6, pageW - margin, y + 6);
      if (opts.showAnswers) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(180, 30, 30);
        doc.text(String(p.answer), margin + 86, y + 2);
        doc.setTextColor(20);
      }
      y += 22;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   AI TEMPLATE — SPELLING LIST + SENTENCES  (Gr1, Gr3)
   Maps to BC E1.11 / E3.10 / E3.11
============================================================ */
window.TEMPLATES.spelling_with_sentences = {
  id: "spelling_with_sentences",
  label: "Spelling list + write a sentence",
  subject: "writing",
  grades: ["1", "3"],
  topicHint: "Vocabulary",
  usesAI: true,
  acceptsReferences: false,
  maxTokens: 2000,

  modifiers: [
    { id: "focus", type: "select", label: "Word focus",
      options: [
        { value: "mixed",       label: "Mixed (grade-appropriate)" },
        { value: "word_family", label: "Word families / rhyming patterns" },
        { value: "blends",      label: "Blends & digraphs (sh, ch, str…)" },
        { value: "long_vowels", label: "Long vowel patterns" },
        { value: "sight_words", label: "Common sight words" },
        { value: "theme",       label: "Themed (use kid's interests)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of words", default: 10, min: 5, max: 16 },
    { id: "writeWordTimes", type: "select", label: "Write-the-word practice",
      options: [
        { value: "0", label: "No tracing — just a sentence line" },
        { value: "2", label: "Write each word 2×, then a sentence" },
        { value: "3", label: "Write each word 3×, then a sentence" }
      ], default: "2" }
  ],

  buildPrompt(mods, kid) {
    const lvl = tmplLevel(kid, this.subject);
    const r = ["K", "1", "2", "3", "4", "5", "6"].indexOf(lvl);
    const level = r <= 1
      ? `${gradeWord(lvl)} spelling: mostly 3–4 letter CVC words, simple blends, common sight words.`
      : r <= 3
        ? `${gradeWord(lvl)} spelling: 1–2 syllable words, blends, digraphs, long-vowel patterns, common irregular words.`
        : `${gradeWord(lvl)} spelling: multisyllabic words, prefixes/suffixes, roots, and commonly misspelled words.`;

    const focusText = {
      mixed: "A balanced mix appropriate to the grade.",
      word_family: "Group the words into 2–3 word families that share a spelling pattern (e.g. -ight, -ack).",
      blends: "Focus on consonant blends and digraphs (sh, ch, th, str, bl, etc.).",
      long_vowels: "Focus on long-vowel spelling patterns (a_e, ai, ay, ee, ea, igh, oa, etc.).",
      sight_words: "Use common high-frequency sight words for the grade.",
      theme: `Pick real words connected to the child's interests: ${kid.interests || "general topics"}.`
    }[mods.focus] || "A balanced mix appropriate to the grade.";

    return `You are a BC-curriculum spelling worksheet generator.

CHILD: ${kid.name}, age ${kid.age}, ${gradeWord(lvl)} level.

TASK: Choose ${mods.count} spelling words and write one simple example sentence for each.

LEVEL: ${level}
FOCUS: ${focusText}

REQUIREMENTS:
- Words must be real and spelled in Canadian/standard English.
- Each example sentence uses the word correctly and is short (Grade-appropriate).
- In the sentence, the spelling word should appear (you may surround it with **double asterisks** so we can find it).

RETURN VALID JSON ONLY (no markdown fences):
{
  "title": "Spelling: <short label>",
  "instructions": "<one short instruction line>",
  "words": [
    { "word": "<word>", "sentence": "<example sentence using the word>" }
  ],
  "standards": ["E3.10"]
}`;
  },

  parseResponse(text) {
    const obj = parseAIJSON(text);
    const words = (obj.words || []).map(w => ({
      word: (w.word || "").replace(/\*\*/g, "").trim(),
      sentence: (w.sentence || "").trim()
    })).filter(w => w.word);
    return {
      title: obj.title || "Spelling Practice",
      instructions: obj.instructions || "Read each word. Write it neatly, then use it in a sentence.",
      words,
      standards: obj.standards || ["E3.10"],
      questions: words.map(w => ({ q: `Spell and use: ${w.word}`, answer: w.word, type: "short_response" }))
    };
  },

  mockResponse(mods, kid) {
    const base = kid.gradeKey === "1"
      ? [["ship","The big ship sailed away."],["chop","Dad will chop the wood."],["rain","We play in the rain."],["bike","I ride my bike fast."],["tree","A bird sits in the tree."],["jump","The frogs jump high."],["nest","The eggs are in the nest."],["star","One star is very bright."],["frog","The frog is green."],["play","Let's play outside."]]
      : [["bright","The sun is very bright today."],["thunder","We heard thunder in the storm."],["picture","She drew a picture of her dog."],["between","Sit between your two friends."],["o'clock","School starts at nine o'clock."],["country","Canada is a big country."],["enough","Do we have enough snacks?"],["o'clock","It is three o'clock now."],["measure","Let's measure the table."],["finally","We finally reached the top."]];
    const words = base.slice(0, parseInt(mods.count, 10) || 10).map(([word, sentence]) => ({ word, sentence }));
    return JSON.stringify({
      title: "Spelling: This Week's Words",
      instructions: "Read each word. Write it neatly, then use it in a sentence.",
      words,
      standards: ["E3.10"]
    });
  },

  renderPDF(doc, content, mods, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = content.title || "Spelling Practice";
    const writeTimes = parseInt(mods.writeWordTimes, 10) || 0;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    if (content.instructions) y = pdfDrawInstruction(doc, content.instructions, y, pageW, margin);

    // Word list box at top
    const words = content.words || [];
    const colCount = 2;
    const perCol = Math.ceil(words.length / colCount);
    const boxH = perCol * 16 + 26;
    doc.setFillColor(232, 240, 244);
    doc.roundedRect(margin, y, pageW - margin * 2, boxH, 5, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text("This week's words", margin + 12, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    words.forEach((w, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const wx = margin + 16 + col * ((pageW - margin * 2) / colCount);
      doc.text(`${i + 1}. ${w.word}`, wx, y + 32 + row * 16);
    });
    y += boxH + 16;

    // Per-word practice
    words.forEach((w, i) => {
      const lineCount = writeTimes > 0 ? 1 : 0;
      const blockH = 20 + (writeTimes > 0 ? 24 : 0) + 26;
      if (pdfNeedNewPage(doc, y, blockH, margin)) y = pdfAddPageWithHeader(doc, title, pageW, margin);

      pdfDrawNumberedDot(doc, String(i + 1), margin + 10, y + 6, 9);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20);
      doc.text(w.word, margin + 26, y + 10);

      // Write-the-word boxes
      if (writeTimes > 0) {
        y += 18;
        const slotW = (pageW - margin - (margin + 26)) / writeTimes;
        for (let k = 0; k < writeTimes; k++) {
          const sx = margin + 26 + k * slotW;
          doc.setDrawColor(170);
          doc.setLineWidth(0.5);
          doc.line(sx, y + 12, sx + slotW - 10, y + 12);
        }
        y += 20;
      } else {
        y += 14;
      }

      // Sentence line
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text("Use it in a sentence:", margin + 26, y + 4);
      doc.setDrawColor(20);
      doc.setLineWidth(0.7);
      doc.line(margin + 26, y + 18, pageW - margin, y + 18);
      if (opts.showAnswers && w.sentence) {
        doc.setFont("times", "italic");
        doc.setFontSize(10);
        doc.setTextColor(140, 30, 30);
        doc.text(w.sentence.replace(/\*\*/g, ""), margin + 30, y + 14);
        doc.setTextColor(20);
      }
      y += 28;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   AI TEMPLATE — STORY STARTERS (creative writing prompts) (Gr1, Gr3)
   Maps to BC E1.7 / E3.8
============================================================ */
window.TEMPLATES.story_starters = {
  id: "story_starters",
  label: "Story starters (creative writing)",
  subject: "writing",
  grades: ["1", "3"],
  topicHint: "Writing",
  usesAI: true,
  acceptsReferences: false,
  maxTokens: 1800,

  modifiers: [
    { id: "vibe", type: "select", label: "Story flavor",
      options: [
        { value: "any",       label: "Claude picks a fun mix" },
        { value: "adventure", label: "Adventure" },
        { value: "funny",     label: "Funny / silly" },
        { value: "mystery",   label: "Mystery" },
        { value: "animal",    label: "Animal stories" },
        { value: "fantasy",   label: "Fantasy / magic" },
        { value: "everyday",  label: "Everyday life" }
      ], default: "any" },
    { id: "count", type: "number", label: "# of prompts", default: 3, min: 1, max: 5 },
    { id: "linesPerPrompt", type: "select", label: "Writing lines per prompt",
      options: [
        { value: "6",  label: "6 lines" },
        { value: "9",  label: "9 lines" },
        { value: "12", label: "12 lines (full page each)" }
      ], default: "9" }
  ],

  buildPrompt(mods, kid) {
    const vibeText = {
      any: "a fun mix of flavors",
      adventure: "exciting adventures",
      funny: "silly, funny situations",
      mystery: "gentle, age-appropriate mysteries to solve",
      animal: "stories featuring animals",
      fantasy: "magic and fantasy",
      everyday: "relatable everyday-life moments"
    }[mods.vibe] || "a fun mix";

    const interestLine = kid.interests
      ? `Weave in the child's interests where natural: ${kid.interests}.`
      : "Use universally appealing kid topics.";

    return `You are a creative-writing prompt generator for a homeschooled ${gradeWord(tmplLevel(kid, this.subject))} child named ${kid.name} (age ${kid.age}).

TASK: Write ${mods.count} story-starter prompts featuring ${vibeText}.

${interestLine}

REQUIREMENTS:
- Each prompt is 1–3 sentences that set up a scene and stop right before the action, inviting the child to continue the story.
- Open-ended and imaginative; never a yes/no question.
- Grade-appropriate vocabulary and ideas. Nothing scary or violent.
- Optionally include one tiny "Try to use these words:" trio of fun vocabulary words per prompt.

RETURN VALID JSON ONLY (no markdown fences):
{
  "title": "Story Starters: <short label>",
  "instructions": "<one short instruction line>",
  "prompts": [
    { "prompt": "<the story starter>", "tryWords": ["word1","word2","word3"] }
  ],
  "standards": ["E3.8"]
}`;
  },

  parseResponse(text) {
    const obj = parseAIJSON(text);
    const prompts = (obj.prompts || []).map(p => ({
      prompt: typeof p === "string" ? p : (p.prompt || ""),
      tryWords: (p && p.tryWords) || []
    })).filter(p => p.prompt);
    return {
      title: obj.title || "Story Starters",
      instructions: obj.instructions || "Pick a story starter and keep the story going. Write neatly!",
      prompts,
      standards: obj.standards || ["E3.8"],
      questions: prompts.map(p => ({ q: p.prompt, answer: "", type: "short_response" }))
    };
  },

  mockResponse(mods, kid) {
    const prompts = [
      { prompt: "You wake up one morning and your pet can suddenly talk. The very first thing it says is…", tryWords: ["whispered", "surprised", "secret"] },
      { prompt: "A glowing door appears in the middle of your classroom. When you open it, you see…", tryWords: ["glowing", "tiptoed", "discover"] },
      { prompt: "You find a treasure map tucked inside an old library book. It leads to…", tryWords: ["ancient", "clue", "journey"] },
      { prompt: "The school bus takes a wrong turn and drives straight into…", tryWords: ["suddenly", "wobbled", "amazing"] },
      { prompt: "You build the world's greatest fort. Then something knocks on the door…", tryWords: ["enormous", "brave", "knock"] }
    ].slice(0, parseInt(mods.count, 10) || 3);
    return JSON.stringify({
      title: "Story Starters: Imagine That!",
      instructions: "Pick a story starter and keep the story going. Write neatly!",
      prompts,
      standards: ["E3.8"]
    });
  },

  renderPDF(doc, content, mods, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = content.title || "Story Starters";
    const lines = parseInt(mods.linesPerPrompt, 10) || 9;

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    if (content.instructions) y = pdfDrawInstruction(doc, content.instructions, y, pageW, margin);

    (content.prompts || []).forEach((p, i) => {
      const promptLines = doc.splitTextToSize(p.prompt, pageW - margin * 2 - 20);
      const wordsH = (p.tryWords && p.tryWords.length) ? 16 : 0;
      const blockH = promptLines.length * 15 + wordsH + lines * 20 + 24;
      if (pdfNeedNewPage(doc, y, Math.min(blockH, pageH - margin * 2), margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }

      // Prompt in a tinted box
      const boxH = promptLines.length * 15 + wordsH + 16;
      doc.setFillColor(255, 248, 235);
      doc.roundedRect(margin, y, pageW - margin * 2, boxH, 5, 5, "F");
      pdfDrawNumberedDot(doc, String(i + 1), margin + 14, y + 16, 9);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      promptLines.forEach((line, j) => doc.text(line, margin + 30, y + 16 + j * 15));
      if (p.tryWords && p.tryWords.length) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(150, 90, 30);
        doc.text("Try to use: " + p.tryWords.join(", "), margin + 30, y + 16 + promptLines.length * 15 + 4);
      }
      y += boxH + 10;

      // Writing lines
      doc.setDrawColor(150);
      doc.setLineWidth(0.5);
      for (let k = 0; k < lines; k++) {
        if (pdfNeedNewPage(doc, y, 20, margin)) y = pdfAddPageWithHeader(doc, title, pageW, margin);
        doc.line(margin, y + 14, pageW - margin, y + 14);
        y += 20;
      }
      y += 10;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   TEMPLATE — LABEL THE MAP (Canada / USA)  — local, no AI
   Draws a simplified projected outline map from window.MAP_DATA,
   numbers each region, and gives a fill-in list + word bank.
   Answer-key mode fills the names.
============================================================ */
window.TEMPLATES.map_label = {
  id: "map_label",
  label: "Label the map (Canada / USA)",
  subject: "geography",
  grades: ["1", "3"],
  topicHint: "Maps",

  modifiers: [
    { id: "country", type: "select", label: "Map",
      options: [
        { value: "canada", label: "Canada — provinces & territories" },
        { value: "usa",    label: "USA — states (lower 48)" }
      ], default: "canada" },
    { id: "mode", type: "select", label: "Activity",
      options: [
        { value: "label", label: "Number the regions + write the names" },
        { value: "color", label: "Color the map (outlines only)" }
      ], default: "label" },
    { id: "wordBank", type: "boolean", label: "Show a word bank of the names", default: true }
  ],

  generate(m) {
    const data = (window.MAP_DATA || {})[m.country] || { regions: [], aspect: 1 };
    const regions = data.regions.map(r => ({ name: r.name, rings: r.rings, label: r.label }));
    // Number in reading order (top→bottom, then left→right within a band)
    regions.sort((a, b) => (a.label[1] - b.label[1]) || (a.label[0] - b.label[0]));
    regions.forEach((r, i) => { r.number = i + 1; });
    // Word bank = shuffled names
    const wordBank = regions.map(r => r.name);
    for (let i = wordBank.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = wordBank[i]; wordBank[i] = wordBank[j]; wordBank[j] = t;
    }
    return { country: m.country, aspect: data.aspect, regions, wordBank, mode: m.mode, showWordBank: m.wordBank };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const isColor = content.mode === "color";
    const title = content.country === "usa"
      ? (isColor ? "Color the United States" : "Label the United States (Lower 48)")
      : (isColor ? "Color the Provinces & Territories of Canada" : "Label the Provinces & Territories of Canada");

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    const instr = isColor
      ? "Color each region a different color. Try not to let two touching regions share a color!"
      : "Each region has a number. Write its name next to the matching number below.";
    y = pdfDrawInstruction(doc, instr, y, pageW, margin);

    // Fit the map box by aspect, capped in height to leave room for the list
    const usableW = pageW - margin * 2;
    const capH = content.mode === "color" ? 560 : 330;
    let mapW = Math.min(usableW, capH * content.aspect);
    let mapH = mapW / content.aspect;
    if (mapH > capH) { mapH = capH; mapW = capH * content.aspect; }
    const box = { x: margin + (usableW - mapW) / 2, y: y, w: mapW, h: mapH };

    // Draw regions (light fill + outline)
    content.regions.forEach(r => {
      r.rings.forEach(ring => pdfDrawMapRing(doc, ring, box));
    });
    // Numbers on top (label mode)
    if (!isColor) {
      content.regions.forEach(r => {
        const cx = box.x + r.label[0] * box.w;
        const cy = box.y + r.label[1] * box.h;
        doc.setFillColor(255, 255, 255);
        doc.circle(cx, cy, 7, "F");
        doc.setDrawColor(60); doc.setLineWidth(0.4); doc.circle(cx, cy, 7, "S");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20);
        doc.text(String(r.number), cx, cy + 3, { align: "center" });
      });
    }
    y = box.y + mapH + 16;

    // Word bank
    if (content.showWordBank) {
      const names = content.wordBank.join("   •   ");
      const lines = doc.splitTextToSize(names, usableW - 20);
      const bh = lines.length * 13 + 22;
      if (pdfNeedNewPage(doc, y, bh, margin)) y = pdfAddPageWithHeader(doc, title, pageW, margin);
      doc.setFillColor(236, 240, 233);
      doc.roundedRect(margin, y, usableW, bh, 5, 5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(40);
      doc.text("Word bank", margin + 10, y + 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30);
      doc.text(lines, margin + 10, y + 28);
      y += bh + 14;
    }

    // Numbered fill-in list (label mode)
    if (!isColor) {
      const n = content.regions.length;
      const cols = n <= 16 ? 2 : n <= 33 ? 3 : 4;
      const colW = usableW / cols;
      const rowH = 20;
      const rows = Math.ceil(n / cols);
      const startY = y;
      content.regions.forEach((r, i) => {
        const col = Math.floor(i / rows);
        const row = i % rows;
        const cx = margin + col * colW;
        const cy = startY + row * rowH;
        if (cy + rowH > pageH - margin - 30) return; // safety: skip overflow (rare)
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
        doc.text(String(r.number) + ".", cx, cy + 10);
        doc.setDrawColor(120); doc.setLineWidth(0.5);
        doc.line(cx + 18, cy + 12, cx + colW - 12, cy + 12);
        if (opts.showAnswers) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(140, 30, 30);
          doc.text(r.name, cx + 22, cy + 9);
          doc.setTextColor(20);
        }
      });
    }

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

function pdfDrawMapRing(doc, ring, box) {
  if (!ring || ring.length < 3) return;
  const pts = ring.map(([x, y]) => [box.x + x * box.w, box.y + y * box.h]);
  const deltas = [];
  for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  doc.setFillColor(245, 246, 244);
  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.6);
  doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "FD", true);
}

/* ============================================================
   AI TEMPLATE — GEOGRAPHY WORKSHEET (K, Gr1, Gr3)
   Flexible Q&A geography sheet. Topic-selectable (or custom, so the
   parent can steer it), grade-calibrated, rendered as a numbered
   question list (short answer or multiple choice).
============================================================ */
window.TEMPLATES.geography_worksheet = {
  id: "geography_worksheet",
  label: "Geography worksheet (quiz)",
  subject: "geography",
  grades: ["K", "1", "3"],
  topicHint: "Geography",
  usesAI: true,
  acceptsReferences: false,
  maxTokens: 2500,

  modifiers: [
    { id: "topic", type: "select", label: "Topic",
      options: [
        { value: "auto",        label: "Match the grade (Claude picks)" },
        { value: "maps",        label: "Maps & directions (compass, keys)" },
        { value: "continents",  label: "Continents & oceans" },
        { value: "canada",      label: "Canada — provinces & capitals" },
        { value: "bc",          label: "British Columbia" },
        { value: "landforms",   label: "Landforms (mountains, rivers…)" },
        { value: "community",   label: "My community & the world" },
        { value: "custom",      label: "Custom topic (type below)" }
      ], default: "auto" },
    { id: "customTopic", type: "text", label: "Custom topic (used when 'Custom' is selected)", default: "" },
    { id: "style", type: "select", label: "Question style",
      options: [
        { value: "short", label: "Short answer" },
        { value: "mc",    label: "Multiple choice" },
        { value: "mixed", label: "Mixed" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of questions", default: 8, min: 4, max: 14 }
  ],

  buildPrompt(mods, kid) {
    const lvl = tmplLevel(kid, this.subject);
    const band = {
      "K": "Kindergarten: very concrete — home, family, community, land vs water, weather/seasons, simple position words. Picture-friendly, 1-step recall.",
      "1": "Grade 1: simple maps & keys, the 4 cardinal directions, the community, intro to continents/oceans, Canada & BC, basic landforms.",
      "2": "Grade 2: maps & globes, cardinal directions, communities around the world, Canada's regions, landforms and bodies of water.",
      "3": "Grade 3: map tools (key, compass rose, grid), the 7 continents and 5 oceans, Canada's provinces/territories & capitals, BC features, landforms, climate.",
      "4": "Grade 4: grid/scale/legend, Canada's provinces & physical regions, climate zones, natural resources, Indigenous territories.",
      "5": "Grade 5: latitude/longitude & hemispheres, Canada's physical/political geography, North America, biomes, settlement and human impact.",
      "6": "Grade 6: world regions and countries, capitals, global climate zones/biomes, major physical features, economic geography, map projections."
    }[lvl] || "Grade-appropriate geography.";

    const topicText = {
      auto: "Choose a geography topic appropriate to the grade.",
      maps: "Focus on maps, map keys/symbols, the compass rose, and directions.",
      continents: "Focus on the continents and oceans.",
      canada: "Focus on Canada — its provinces, territories, and capital cities.",
      bc: "Focus on British Columbia — regions, major cities, and physical features.",
      landforms: "Focus on landforms — mountains, rivers, lakes, plains, coasts, islands.",
      community: "Focus on the local community and how it connects to the wider world.",
      custom: `Focus specifically on: ${(mods.customTopic || "").trim() || "a geography topic suitable for the grade"}.`
    }[mods.topic] || "Choose a geography topic appropriate to the grade.";

    const styleText = {
      short: "All questions are short-answer (one word or one sentence).",
      mc: "All questions are multiple choice with exactly 4 options (a, b, c, d).",
      mixed: "Mix short-answer and multiple-choice (with 4 options) questions."
    }[mods.style] || "Mix short-answer and multiple-choice questions.";

    return `You are a geography worksheet generator for a homeschooled child.

CHILD: ${kid.name}, age ${kid.age}, ${gradeWord(lvl)} level.
INTERESTS: ${kid.interests || "(none specified)"}

GRADE CALIBRATION: ${band}
TOPIC: ${topicText}
STYLE: ${styleText}

TASK: Write ${mods.count} geography questions with answers.

REQUIREMENTS:
- Factually correct and age-appropriate.
- For multiple-choice, provide an "options" array of 4 strings and put the correct one in "answer".
- For short-answer, leave "options" empty and give the correct "answer".
- Keep wording simple for the grade.

RETURN VALID JSON ONLY (no markdown fences):
{
  "title": "Geography: <short label>",
  "instructions": "<one short instruction line>",
  "questions": [
    { "q": "<question>", "options": ["a","b","c","d"], "answer": "<correct answer>", "type": "multiple_choice" },
    { "q": "<question>", "options": [], "answer": "<correct answer>", "type": "short_answer" }
  ],
  "standards": ["<geography standard id, e.g. G3.2>"]
}`;
  },

  parseResponse(text) {
    const obj = parseAIJSON(text);
    const questions = (obj.questions || []).map(q => ({
      q: q.q || q.question || "",
      options: Array.isArray(q.options) ? q.options : [],
      answer: q.answer != null ? String(q.answer) : "",
      type: q.type || (Array.isArray(q.options) && q.options.length ? "multiple_choice" : "short_answer")
    }));
    return {
      title: obj.title || "Geography Worksheet",
      instructions: obj.instructions || "Answer each question. Circle or write your answer.",
      questions,
      standards: obj.standards || []
    };
  },

  mockResponse(mods, kid) {
    return JSON.stringify({
      title: "Geography: Continents & Oceans",
      instructions: "Answer each question. Circle the best choice or write your answer on the line.",
      questions: [
        { q: "How many continents are there on Earth?", options: ["5", "6", "7", "8"], answer: "7", type: "multiple_choice" },
        { q: "Which is the largest ocean?", options: ["Atlantic", "Pacific", "Indian", "Arctic"], answer: "Pacific", type: "multiple_choice" },
        { q: "What continent do we live on?", options: [], answer: "North America", type: "short_answer" },
        { q: "Which country do you live in?", options: [], answer: "Canada", type: "short_answer" },
        { q: "Name one ocean that touches Canada.", options: [], answer: "Pacific, Atlantic, or Arctic", type: "short_answer" },
        { q: "Which direction does a compass needle usually point?", options: ["North", "South", "East", "West"], answer: "North", type: "multiple_choice" },
        { q: "Antarctica is known for being very…", options: ["hot", "cold", "sandy", "crowded"], answer: "cold", type: "multiple_choice" },
        { q: "What do we call a drawing of a place from above?", options: [], answer: "A map", type: "short_answer" }
      ].slice(0, parseInt(mods.count, 10) || 8),
      standards: ["G3.2", "G3.3"]
    });
  },

  renderPDF(doc, content, mods, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = content.title || "Geography Worksheet";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    if (content.instructions) y = pdfDrawInstruction(doc, content.instructions, y, pageW, margin);

    (content.questions || []).forEach((q, i) => {
      const qLines = doc.splitTextToSize(`${i + 1}. ${q.q}`, pageW - margin * 2 - 16);
      const hasOpts = q.options && q.options.length;
      const blockH = qLines.length * 15 + (hasOpts ? q.options.length * 15 + 6 : 26);
      if (pdfNeedNewPage(doc, y, blockH, margin)) y = pdfAddPageWithHeader(doc, title, pageW, margin);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(20);
      qLines.forEach((line, j) => doc.text(line, margin, y + 10 + j * 15));
      y += qLines.length * 15 + 4;

      if (hasOpts) {
        const letters = ["a", "b", "c", "d", "e", "f"];
        q.options.forEach((opt, k) => {
          const isAns = opts.showAnswers && String(opt).trim().toLowerCase() === String(q.answer).trim().toLowerCase();
          doc.setFont("helvetica", isAns ? "bold" : "normal");
          doc.setTextColor(isAns ? 180 : 40, isAns ? 30 : 40, isAns ? 30 : 40);
          doc.setFontSize(11);
          doc.text(`${isAns ? "● " : "○ "}${letters[k]}) ${opt}`, margin + 18, y + 10);
          y += 15;
        });
        doc.setTextColor(20);
        y += 8;
      } else {
        // short-answer line
        doc.setDrawColor(20);
        doc.setLineWidth(0.7);
        doc.line(margin + 18, y + 14, pageW - margin, y + 14);
        if (opts.showAnswers && q.answer) {
          doc.setFont("times", "italic");
          doc.setFontSize(10);
          doc.setTextColor(140, 30, 30);
          doc.text(q.answer, margin + 22, y + 10);
          doc.setTextColor(20);
        }
        y += 24;
      }
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ============================================================
   TEMPLATE — PATTERN RECOGNITION & REASONING  (K–Gr3, math)
   ------------------------------------------------------------
   A "thinking gym" worksheet, not procedural drill. Four reasoning
   modes, each of which asks the child to FIND and (where they can)
   STATE the underlying rule — not just fill a blank:
     • sequence   — number sequences (skip-count / grow / shrink / double)
     • oddOneOut   — which one doesn't belong, AND why (articulate the rule)
     • analogy     — A is to B as C is to ? (relational reasoning)
     • visual      — repeating/growing shape sequences (draw what's next)
   Deterministic (no API). Difficulty scales the number range, sequence
   length, and step complexity. Maps loosely to BC Patterning (M*.x).
============================================================ */
window.TEMPLATES.pattern_recognition = {
  id: "pattern_recognition",
  label: "Pattern recognition & reasoning",
  subject: "math",
  grades: ["K", "1", "2", "3"],
  topicHint: "Patterns & reasoning",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "sequence",  label: "Number sequences (find the rule)" },
        { value: "oddOneOut", label: "Odd one out (which & why)" },
        { value: "analogy",   label: "Analogies (A→B as C→?)" },
        { value: "visual",    label: "Visual sequences (draw what's next)" },
        { value: "mixed",     label: "Mixed (a bit of each)" }
      ], default: "sequence" },
    { id: "level", type: "select", label: "Challenge level",
      options: [
        { value: "gentle",  label: "Gentle (small numbers, simple steps)" },
        { value: "core",    label: "Core (grade-typical)" },
        { value: "stretch", label: "Stretch (bigger numbers, trickier rules)" }
      ], default: "core" },
    { id: "count", type: "number", label: "# of problems", default: 8, min: 4, max: 16 },
    { id: "writeRule", type: "boolean", label: "Ask the child to write the rule in words", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const level = m.level || "core";
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["sequence", "oddOneOut", "analogy", "visual"]
      : [m.mode];
    const problems = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      problems.push(prGenOne(mode, level, i));
    }
    return { problems, modifiers: m, writeRule: m.writeRule !== false, workedExample: m.workedExample !== false };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Pattern Detective";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Be a pattern detective. Look closely, find the hidden rule, then finish each one. There is always a reason — your job is to find it.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
        doc.text("2, 4, 6, 8, ___    Rule: \"add 2 each time\"    Next: 10", x, by + 22);
      }, y, pageW, margin, 46);
    }

    const rowH = 64;
    content.problems.forEach((p, idx) => {
      if (pdfNeedNewPage(doc, y, rowH, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      prRenderRow(doc, p, idx + 1, margin, y, pageW - margin * 2, content.writeRule, opts.showAnswers);
      y += rowH;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- pattern_recognition generators ---- */
function prRand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function prPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function prGenOne(mode, level, seed) {
  if (mode === "sequence")  return prGenSequence(level);
  if (mode === "oddOneOut") return prGenOddOneOut(level);
  if (mode === "analogy")   return prGenAnalogy(level);
  return prGenVisual(level);
}

function prGenSequence(level) {
  // step kinds scale with level
  const ranges = { gentle: { start: [1, 10], step: [1, 3] },
                   core:   { start: [2, 30], step: [2, 5] },
                   stretch:{ start: [5, 60], step: [3, 9] } }[level];
  const kinds = level === "gentle"
    ? ["add", "subtract"]
    : ["add", "subtract", "double"];
  const kind = prPick(kinds);
  let start = prRand(ranges.start[0], ranges.start[1]);
  const step = prRand(ranges.step[0], ranges.step[1]);
  const seq = [];
  let v = start;
  let ruleText, ruleAnswer;
  if (kind === "double") {
    start = prRand(1, level === "stretch" ? 8 : 4);
    v = start;
    for (let i = 0; i < 5; i++) { seq.push(v); v = v * 2; }
    ruleText = "double each time"; ruleAnswer = "× 2";
  } else if (kind === "subtract") {
    start = prRand(step * 5 + 1, ranges.start[1] + step * 5);
    v = start;
    for (let i = 0; i < 5; i++) { seq.push(v); v = v - step; }
    ruleText = "subtract " + step + " each time"; ruleAnswer = "− " + step;
  } else {
    for (let i = 0; i < 5; i++) { seq.push(v); v = v + step; }
    ruleText = "add " + step + " each time"; ruleAnswer = "+ " + step;
  }
  const blanks = 2; // last two are blank
  const shown = seq.slice(0, seq.length - blanks);
  const expected = seq.slice(seq.length - blanks);
  return { mode: "sequence", shown, expected, ruleText, ruleAnswer };
}

function prGenOddOneOut(level) {
  // Build a group sharing a property, plus one that breaks it. The child
  // must mark it AND say why — this is the rule-articulation skill.
  const sets = [
    { rule: "all even numbers", make: () => {
        const base = [2, 4, 6, 8, 10, 12, 14].sort(() => Math.random() - 0.5).slice(0, 3);
        const odd = prPick([3, 5, 7, 9, 11]);
        return { items: shuffleWithOdd(base, odd), odd: String(odd), why: "It is odd; the others are even." };
      } },
    { rule: "all odd numbers", make: () => {
        const base = [3, 5, 7, 9, 11, 13].sort(() => Math.random() - 0.5).slice(0, 3);
        const even = prPick([2, 4, 6, 8, 10]);
        return { items: shuffleWithOdd(base, even), odd: String(even), why: "It is even; the others are odd." };
      } },
    { rule: "all count by 5", make: () => {
        const base = [5, 10, 15, 20, 25].sort(() => Math.random() - 0.5).slice(0, 3);
        const off = prPick([7, 12, 18, 23]);
        return { items: shuffleWithOdd(base, off), odd: String(off), why: "It is not a count-by-5 number." };
      } },
    { rule: "all shapes with 4 sides", make: () => {
        const base = ["square", "rectangle", "diamond"];
        const odd = prPick(["triangle", "circle"]);
        return { items: shuffleWithOdd(base.slice(0, 3), odd), odd, why: "It does not have 4 sides.", isWord: true };
      } }
  ];
  const pool = level === "gentle" ? sets.slice(0, 2) : sets;
  const chosen = prPick(pool).make();
  return { mode: "oddOneOut", items: chosen.items, odd: chosen.odd, why: chosen.why, isWord: chosen.isWord };
}

function shuffleWithOdd(base, odd) {
  const arr = base.map(String).concat([String(odd)]);
  return arr.sort(() => Math.random() - 0.5);
}

function prGenAnalogy(level) {
  const banks = [
    { a: "2", b: "4", c: "3", d: "6", rule: "doubling" },
    { a: "5", b: "10", c: "7", d: "14", rule: "doubling" },
    { a: "10", b: "9", c: "6", d: "5", rule: "one less" },
    { a: "3", b: "6", c: "4", d: "8", rule: "doubling" },
    { a: "1", b: "3", c: "5", d: "7", rule: "add 2" },
    { a: "big", b: "small", c: "up", d: "down", rule: "opposites", isWord: true },
    { a: "hot", b: "cold", c: "day", d: "night", rule: "opposites", isWord: true },
    { a: "circle", b: "round", c: "square", d: "corners", rule: "a property of the shape", isWord: true }
  ];
  const pool = level === "gentle" ? banks.filter(x => x.isWord || x.rule === "doubling" || x.rule === "one less") : banks;
  const q = prPick(pool);
  return { mode: "analogy", a: q.a, b: q.b, c: q.c, answer: q.d, ruleText: q.rule };
}

function prGenVisual(level) {
  // Repeating or growing shape patterns the child draws.
  const shapes = ["circle", "square", "triangle", "diamond"];
  const growing = level !== "gentle" && Math.random() < 0.4;
  if (growing) {
    // growing run: 1,2,3,... of one shape
    const sh = prPick(shapes);
    const shown = [[sh], [sh, sh], [sh, sh, sh]];
    return { mode: "visual", growing: true, shape: sh, shown, expected: [sh, sh, sh, sh], ruleText: "one more " + sh + " each group" };
  }
  // repeating unit (AB / ABC / ABB)
  const unit = prPick(["AB", "ABC", "ABB", "AAB"]);
  const distinct = new Set(unit.split("")).size;
  const toks = shapes.sort(() => Math.random() - 0.5).slice(0, distinct);
  const seq = [];
  for (let j = 0; j < unit.length * 3 + 2; j++) {
    seq.push(toks[unit.charCodeAt(j % unit.length) - 65]);
  }
  const shown = seq.slice(0, seq.length - 2);
  const expected = seq.slice(seq.length - 2);
  return { mode: "visual", growing: false, shown, expected, ruleText: unit + " repeating" };
}

/* ---- pattern_recognition row renderer ---- */
function prRenderRow(doc, p, num, x, y, w, writeRule, showAnswers) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  const bx = x + 20;
  doc.setTextColor(20, 20, 20);

  if (p.mode === "sequence") {
    doc.setFont("helvetica", "normal"); doc.setFontSize(13);
    const parts = p.shown.map(String).concat(p.expected.map(() => "____"));
    doc.text(parts.join("   ,   "), bx, y + 6);
    if (showAnswers) {
      doc.setTextColor(180, 30, 30); doc.setFontSize(11);
      doc.text("→ " + p.expected.join(", ") + "   (" + p.ruleText + ")", bx, y + 24);
      doc.setTextColor(20, 20, 20);
    } else if (writeRule) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(110, 110, 110);
      doc.text("Rule: _______________________________", bx, y + 24);
      doc.setTextColor(20, 20, 20);
    }
  } else if (p.mode === "oddOneOut") {
    doc.setFont("helvetica", "normal"); doc.setFontSize(12);
    doc.text("Circle the one that does NOT belong:", bx, y + 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(p.items.join("        "), bx, y + 24);
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(110, 110, 110);
    if (showAnswers) {
      doc.setTextColor(180, 30, 30);
      doc.text("→ " + p.odd + " — " + p.why, bx, y + 42);
    } else {
      doc.text("Why? ______________________________", bx, y + 42);
    }
    doc.setTextColor(20, 20, 20);
  } else if (p.mode === "analogy") {
    doc.setFont("helvetica", "normal"); doc.setFontSize(13);
    doc.text(p.a + "  →  " + p.b + "      as      " + p.c + "  →  ______", bx, y + 8);
    if (showAnswers) {
      doc.setTextColor(180, 30, 30); doc.setFontSize(11);
      doc.text("→ " + p.answer + "   (rule: " + p.ruleText + ")", bx, y + 28);
      doc.setTextColor(20, 20, 20);
    }
  } else if (p.mode === "visual") {
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text("Draw what comes next:", bx, y + 2);
    // draw shown shapes
    let cx = bx;
    const cy = y + 26, sz = 16;
    const drawTok = (tok, faded) => {
      const sh = window.SHAPES[tok];
      if (sh) {
        doc.setDrawColor(faded ? 180 : 30, faded ? 30 : 30, faded ? 30 : 30);
        doc.setLineWidth(1.4);
        sh.drawPDF(doc, { cx: cx + sz / 2, cy, size: sz, mode: "solid" });
        doc.setDrawColor(30, 30, 30);
      }
      cx += sz + 8;
    };
    p.shown.forEach(t => drawTok(t, false));
    // blanks
    p.expected.forEach(t => {
      doc.setDrawColor(150); doc.setLineWidth(0.6); doc.setLineDashPattern([2, 2], 0);
      doc.rect(cx, cy - sz / 2, sz, sz, "S"); doc.setLineDashPattern([], 0);
      if (showAnswers) drawTok(t, true); else cx += sz + 8;
      doc.setDrawColor(30, 30, 30);
    });
    if (showAnswers) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(180, 30, 30);
      doc.text("(" + p.ruleText + ")", bx, y + 46);
      doc.setTextColor(20, 20, 20);
    }
  }
}

/* ============================================================
   spot_the_persuasion — media & manipulation literacy
   Deterministic, never calls AI. Teaches kids to notice when
   words are trying to STEER them: ad tricks, fact vs opinion,
   pressure tactics, and "who is saying this and what do they
   want?" Voice stays curious & sovereign — never "obey", always
   "ask why" and "decide for yourself."
============================================================ */
window.TEMPLATES.spot_the_persuasion = {
  id: "spot_the_persuasion",
  label: "Spot the persuasion (media literacy)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Critical thinking & media literacy",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "adTrick",   label: "Spot the ad trick (what is this selling?)" },
        { value: "factOpinion", label: "Fact or opinion? (can we check it?)" },
        { value: "pressure",  label: "Pressure tactics (hurry / everyone's doing it)" },
        { value: "whoWants",  label: "Who's saying it & what do they want?" },
        { value: "mixed",     label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["adTrick", "factOpinion", "pressure", "whoWants"]
      : [m.mode];
    // Draw without repeats where possible by shuffling each bank.
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode]) pools[mode] = spShuffle(SP_BANKS[mode].slice());
      if (pools[mode].length === 0) pools[mode] = spShuffle(SP_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Spot the Persuasion";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Words can carry true things — and they can also try to STEER you. Your job is not to obey and not to argue. Your job is to NOTICE. For each one, ask: what is this really trying to get me to do or believe, and do I actually agree once I look closely? There are no wrong feelings here — only sharper eyes.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"BEST cereal EVER! Buy it NOW!\"  ->  This is an AD. It wants me to buy cereal. \"Best ever\" is an opinion, not a proof. \"NOW\" is rushing me. I can decide later, on my own.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 70);
    }

    const lineH = 14;
    content.items.forEach((it, idx) => {
      const needed = spRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = spRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- spot_the_persuasion content banks ---- */
function spShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
// text   = the snippet the child reads
// ask    = the question prompt (mode-specific)
// answer = short model answer (shown only in answer key)
// why    = the reasoning, in plain kid language, sovereign voice
const SP_BANKS = {
  adTrick: [
    { text: "\"Every cool kid has the Glow Sneakers. Don't be the only one without them!\"",
      ask: "What is this trying to sell, and what trick is it using?",
      answer: "Selling sneakers. Trick: making you scared of being left out.",
      why: "It never says the shoes are good — it just makes you afraid of being 'the only one.' That feeling is the product. You can want the shoes OR not; the fear is not a reason." },
    { text: "\"9 out of 10 dogs love Chompy treats!\"",
      ask: "What is being sold? What does this number really tell you?",
      answer: "Dog treats. The number sounds like proof but tells us almost nothing.",
      why: "Who counted? Which dogs? Hungry dogs love almost anything. A number can dress up an opinion to look like a fact." },
    { text: "\"Drink FizzPop and you'll be happy and have lots of friends!\"",
      ask: "What is being sold, and what is it promising that a drink can't really do?",
      answer: "A drink. It promises happiness and friends — things a drink can't give.",
      why: "A drink is just a drink. Ads glue a good feeling onto a product so you buy the feeling. Friends come from how you treat people, not from a can." },
    { text: "\"As seen on TV! The amazing SpaceMop — order in the next 10 minutes!\"",
      ask: "What is being sold, and which two tricks do you spot?",
      answer: "A mop. Tricks: 'as seen on TV' (sounds important) and a rushing timer.",
      why: "Being on TV doesn't make something good — anyone can pay to be on TV. And a 10-minute timer exists to stop you from thinking. Real good deals are still good tomorrow." },
    { text: "\"Famous hero Captain Blaze ONLY eats Sugar Crunch cereal!\"",
      ask: "What is being sold, and why did they use a hero?",
      answer: "Cereal. They borrowed a hero you like so you'll like the cereal.",
      why: "The hero is paid (or made up). Liking a character is not a reason a food is good for you. Ask: would this still sound great with no hero on the box?" }
  ],
  factOpinion: [
    { text: "\"This backpack is blue.\"",
      ask: "Fact or opinion? How could you check?",
      answer: "Fact. You can look at it.",
      why: "A fact is something you can check with your own eyes, a ruler, or a count. Anyone checking would agree." },
    { text: "\"This is the BEST backpack in the whole world.\"",
      ask: "Fact or opinion? Can you check it?",
      answer: "Opinion. 'Best' can't be measured the same for everyone.",
      why: "'Best' depends on who's asking and what they like. There's no ruler for 'best.' Opinions aren't lies — but they aren't proof either." },
    { text: "\"It rained here yesterday.\"",
      ask: "Fact or opinion? How would you find out?",
      answer: "Fact. You could check a weather record or ask someone who was there.",
      why: "It either happened or it didn't. Facts can be checked even when you weren't there." },
    { text: "\"Rainy days are the worst kind of day.\"",
      ask: "Fact or opinion? Does everyone have to agree?",
      answer: "Opinion. Some people love rainy days.",
      why: "Feelings about rain are personal. No one is wrong for liking or disliking it — it's not a thing you can measure." },
    { text: "\"Spiders have eight legs.\"",
      ask: "Fact or opinion? How could you check?",
      answer: "Fact. You can count the legs.",
      why: "You can verify it by looking at a spider or a trusted book. A fact stays true no matter who says it." },
    { text: "\"Spiders are scary.\"",
      ask: "Fact or opinion? Does the spider know it's scary?",
      answer: "Opinion. Scary is a feeling, not a fact about the spider.",
      why: "The spider is just a spider. 'Scary' lives in the person, not the animal. Two people can feel totally different about the same spider." }
  ],
  pressure: [
    { text: "\"Hurry! Only 3 left! If you don't decide RIGHT NOW you'll miss out forever!\"",
      ask: "What feeling is this trying to make you feel? Do you have to decide right now?",
      answer: "It wants you to feel rushed/panicked. No — you can slow down.",
      why: "Rushing is a tactic. It tries to switch off your thinking so you can't ask questions. A calm 'let me think about it' is a superpower." },
    { text: "\"Everybody is doing it. You don't want to be the weird one, do you?\"",
      ask: "What is this using to push you? Is 'everybody' a good reason?",
      answer: "Peer pressure / fear of being 'weird.' No, 'everybody' isn't a reason.",
      why: "Even if everybody really were doing it, that still doesn't make it right FOR YOU. You get to decide based on what you think, not on the crowd." },
    { text: "\"If you were really my friend, you would give me your snack.\"",
      ask: "What is this person doing with the word 'friend'? Is it fair?",
      answer: "Using 'friend' as a lever to guilt you. Not fair.",
      why: "Real friends don't make you 'prove' it on demand. When someone uses your good feelings to push you, that's a flag — you can say no and still be kind." },
    { text: "\"Smart kids buy this. You ARE smart, aren't you?\"",
      ask: "What is the trap in this sentence?",
      answer: "It ties your buying to being 'smart' so saying no feels like admitting you're not.",
      why: "Being smart has nothing to do with buying a thing. The sentence is built to corner you. Notice the trap and you walk right out of it." },
    { text: "\"Last chance EVER! This deal disappears at midnight!\"",
      ask: "Why a midnight deadline? Is it really the last chance ever?",
      answer: "The deadline is there to rush you. It's almost never the 'last chance ever.'",
      why: "Sellers run the same 'last chance' over and over. A real value doesn't vanish at midnight. Deadlines are tools to stop you from thinking it through." }
  ],
  whoWants: [
    { text: "A sign in a candy store says: \"Candy makes kids happy and healthy!\"",
      ask: "Who made this sign, and what do they want? Should you trust it the same as a doctor?",
      answer: "The candy store made it; they want to sell candy. Trust it less than a doctor.",
      why: "Always ask who's talking and what they get if you believe them. A store earns money from candy, so of course its sign praises candy. That doesn't make it true." },
    { text: "A toy company says: \"Studies show our toy is the most fun!\" (The company paid for the study.)",
      ask: "Who paid for the 'study'? Does that change how much you trust it?",
      answer: "The toy company paid for it. Yes — that's a big reason to doubt it.",
      why: "When the people selling a thing also pay for the 'proof,' the proof is bent in their favor. Ask: who would say the opposite, and why don't we hear from them?" },
    { text: "A video says \"Buy this game!\" — and at the end says the game company paid the creator.",
      ask: "Why does it matter that the creator was paid? What should you do with that info?",
      answer: "Being paid can bend what they say. Take the praise with caution.",
      why: "It doesn't automatically mean the game is bad — but you now know the praise was bought. Look for someone with nothing to gain before you believe a glowing review." },
    { text: "A cereal mascot on the box says: \"Part of a complete breakfast!\"",
      ask: "Who put those words there? What sneaky thing does 'part of' hide?",
      answer: "The cereal company. 'Part of' hides that the cereal alone isn't the healthy part.",
      why: "The 'complete breakfast' is the fruit, eggs, and milk next to it — not the sugary cereal. The maker chose words that sound healthy without claiming the cereal is. Read the small words." },
    { text: "Your friend who collects stickers tells you: \"Trading me 5 stickers for 1 is a GREAT deal for you!\"",
      ask: "Who benefits from this trade? Is it really great for YOU?",
      answer: "The friend benefits most. 5 for 1 is a better deal for them.",
      why: "When someone tells you their offer is great for YOU, check who actually comes out ahead. Counting it yourself beats taking their word for it." }
  ]
};

/* ---- spot_the_persuasion layout ---- */
function spRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16; // number + spacing
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22; // a writing line
    if (explain) h += 22; // a second "because..." line
  }
  return h + 8;
}

function spRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    adTrick: "AD TRICK", factOpinion: "FACT OR OPINION?",
    pressure: "PRESSURE", whoWants: "WHO WANTS WHAT?"
  }[it.mode] || "";

  // Number + little mode tag
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The snippet
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   FIRST-PRINCIPLES THINKING  (reading / critical thinking)
   A "why" gym: trace causes to effects, dig past the surface
   "because that's how it is" to the real reason, imagine it
   different, and break a thing down to what it actually needs.
   Deterministic, no AI. Sovereign voice: the goal is to OWN
   your reasons, not to memorize answers.
============================================================ */
window.TEMPLATES.first_principles = {
  id: "first_principles",
  label: "First-principles thinking (the \"why\" gym)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Critical thinking & reasoning",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "causeEffect", label: "Cause & effect (what happens, and why?)" },
        { value: "whyRoot",     label: "Dig for the real why (past 'just because')" },
        { value: "whatIf",      label: "What if it were different? (imagine + reason)" },
        { value: "breakItDown", label: "Break it down (what does it really need?)" },
        { value: "mixed",       label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["causeEffect", "whyRoot", "whatIf", "breakItDown"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = fpShuffle(FP_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "First-Principles Thinking";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Lots of things are the way they are for a REASON — and lots of reasons are worth digging up. For each one, don't rush to the 'right' answer. Slow down and ask WHY until you hit something solid you actually understand. A reason you can explain in your own words is yours. \"Because that's just how it is\" belongs to someone else.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"Why does ice float on water?\"  ->  Most things sink in their own liquid. Ice floats because frozen water spreads out and gets LIGHTER for its size than liquid water. So the real why isn't 'cold stuff floats' — it's that water is weird and puffs up when it freezes.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 78);
    }

    content.items.forEach((it, idx) => {
      const needed = fpRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = fpRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- first_principles content banks ---- */
function fpShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the situation / question the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const FP_BANKS = {
  causeEffect: [
    { text: "You leave a snowman out in the sun on a warm afternoon.",
      ask: "What will happen, and what is the cause?",
      answer: "It melts. Cause: the sun's heat turns the ice back into water.",
      why: "Heat is the cause; melting is the effect. The snowman didn't 'decide' to go — the warmth did it. Trace the chain: sun -> heat -> ice warms up -> water." },
    { text: "Every morning you forget to water a little plant on the windowsill.",
      ask: "What is likely to happen over a week, and why?",
      answer: "The plant wilts / dries out. Cause: no water to drink.",
      why: "Plants pull up water through their roots. No water in means no water to keep the leaves stiff, so they droop. The effect points straight back to the missing cause." },
    { text: "You roll a ball across a flat floor and it slowly stops on its own.",
      ask: "Why does it stop? What is the cause?",
      answer: "Rubbing against the floor (friction) slows it until it stops.",
      why: "Nothing stops for no reason. The ball and floor rub together, and that rubbing steals the ball's motion. On smooth ice it would roll much farther — because there's less rubbing." },
    { text: "Two friends both touched wet paint, but only one left a handprint on the wall.",
      ask: "What probably caused the difference?",
      answer: "The one who left a print pressed their painty hand on the wall.",
      why: "An effect (the print) needs a cause (a painty hand on the wall). The friend with no print either had a dry hand or didn't touch the wall. Match the clue to the cause." },
    { text: "A glass of cold lemonade gets little water drops on the outside on a hot day.",
      ask: "Where do the drops come from? What's the cause?",
      answer: "Water in the warm air cools on the cold glass and turns into drops.",
      why: "The water didn't leak through the glass! Warm air is full of invisible water. The cold glass cools that air right next to it, and the water shows up as drops. Cause: cold surface + wet air." }
  ],
  whyRoot: [
    { text: "\"We sleep at night.\" Most people sleep when it's dark out.",
      ask: "Dig past 'because it's dark.' WHY do bodies want sleep when it's dark?",
      answer: "Our bodies run on a daily clock tuned to light; dark tells it to rest & repair.",
      why: "'It's dark' is the surface. Dig down: long ago there was little to do and it was hard to see in the dark, so resting then was safest. Our bodies built an inside clock around the light. The root reason is the clock, not the dark itself." },
    { text: "\"Bread has holes in it.\" Look at a slice of bread — it's full of little holes.",
      ask: "Don't stop at 'it just does.' WHY are the holes there?",
      answer: "Tiny living yeast made gas bubbles in the dough before it baked.",
      why: "The holes are old bubbles. Yeast (a tiny living thing) eats sugar in the dough and burps out gas. The gas makes bubbles, the bread bakes around them, and the bubbles leave holes. The real why is alive." },
    { text: "\"Coins are round.\" Almost all coins are circles, not squares.",
      ask: "Push past 'they always have been.' WHY round and not square?",
      answer: "Round coins have no sharp corners to wear down and roll/stack easily.",
      why: "'Tradition' isn't the deepest reason. Round coins don't catch in pockets, don't get chipped corners, and feel the same turned any way — so machines and hands handle them easily. The shape solves a real problem." },
    { text: "\"Soap helps clean your hands.\" Water alone doesn't get greasy hands clean, but soap does.",
      ask: "Go deeper than 'soap is for cleaning.' WHY does soap actually work?",
      answer: "Soap grabs onto grease AND water, so it lets water wash the grease away.",
      why: "Grease and water normally refuse to mix. Soap is a go-between: one end holds grease, the other holds water. So it drags the grease into the water and down the drain. That's the mechanism, not magic." },
    { text: "\"We have to give plants light.\" A plant in a dark closet dies even if you water it.",
      ask: "Why isn't water enough? Dig to the real reason plants need light.",
      answer: "Plants use light to MAKE their own food; no light means no food.",
      why: "Water and dirt aren't food for a plant. A plant builds its own food out of light, air, and water — light is the energy that runs the kitchen. No light, no cooking, and the plant starves even while wet." }
  ],
  whatIf: [
    { text: "Imagine wheels had never been invented.",
      ask: "Name two things that would be much harder, and explain WHY.",
      answer: "Moving heavy loads, traveling far — wheels let things roll instead of drag.",
      why: "Wheels turn dragging (hard) into rolling (easy). Without them, carts, bikes, cars, and even chairs change completely. Reasoning from 'what does a wheel do?' lets you predict what breaks without it." },
    { text: "What if every person could read minds?",
      ask: "Name one good thing and one tricky thing, and say WHY each happens.",
      answer: "Good: no lying / quick understanding. Tricky: no privacy / no surprises.",
      why: "Start from what reading minds DOES: it removes secrets. From that one change you can reason outward — honesty gets easy, but so does losing every private thought. Good answers trace back to that root change." },
    { text: "What if water flowed UP instead of down?",
      ask: "Name one thing that would stop working, and explain WHY.",
      answer: "Rivers, drains, drinking from a cup — they all rely on water falling down.",
      why: "So much we built assumes water goes down: roofs shed rain, sinks drain, we tip a cup to our mouth. Change the one rule and you can reason out everything that quietly depended on it." },
    { text: "Imagine the school week were 3 days instead of 5.",
      ask: "Name one thing that would change for your family, and WHY.",
      answer: "More free days, but maybe longer days or less covered — fewer days to fit things in.",
      why: "Change one number (days) and reason forward: the same learning has fewer days to land in, so either days get longer or some things get dropped. Spotting the trade-off is the real skill, not the 'right' answer." },
    { text: "What if you couldn't feel pain at all?",
      ask: "Is that all good? Name a danger, and explain WHY pain is useful.",
      answer: "Dangerous: you wouldn't notice a burn or cut and could get badly hurt.",
      why: "Pain feels bad but DOES a job: it's an alarm that says 'stop, this is hurting you.' Remove the alarm and you'd keep your hand on a hot stove. Reasoning from 'what is pain for?' flips it from enemy to helper." }
  ],
  breakItDown: [
    { text: "Think about what a sandwich REALLY needs to be a sandwich.",
      ask: "List the must-haves. What could you change and still call it a sandwich?",
      answer: "Must: filling held by bread (or two outsides). Can change: the filling, the bread type.",
      why: "Strip away the extras and ask what can't be removed. A sandwich is really 'filling held between two outsides.' Once you see the core, you can swap parts freely and still know it counts." },
    { text: "Break down what you actually need to start a small fire (with a grown-up).",
      ask: "What are the three basic things? Why does taking one away stop the fire?",
      answer: "Fuel, heat, and air. Remove any one and the fire can't keep going.",
      why: "A fire isn't one thing — it's three working together: something to burn, enough heat to start, and air. That's why blowing out a candle (cutting air for a second) or wetting wood (cooling it) stops it. Know the parts, control the whole." },
    { text: "What does a game REALLY need to be a game you can play with a friend?",
      ask: "Name the core parts. What's just decoration you could drop?",
      answer: "Core: a goal, rules everyone agrees on, and a way to play/take turns. Decoration: the theme, fancy pieces.",
      why: "Tag, chess, and a card game look nothing alike, but all share: a goal + agreed rules + taking part. The dinosaurs or the colors are dress-up. Find the bones and you understand every game at once." },
    { text: "Break down what a plant needs to grow. Someone says 'it just needs dirt.'",
      ask: "Is dirt enough? List what's really needed and why.",
      answer: "Light, water, air, and nutrients (dirt holds some). Dirt alone isn't enough.",
      why: "'Just dirt' is too simple. Take the claim apart: a plant needs light for food, water and air to run, and nutrients the dirt only sometimes provides. Breaking the claim down shows what's missing." },
    { text: "What does a message REALLY need to actually tell someone something?",
      ask: "Name the core parts of any message. What's optional?",
      answer: "Core: a sender, a receiver, and a shared code (words/signs both understand). Optional: paper, phone, language used.",
      why: "A wave, a note, and a text all carry messages. Underneath, each needs someone sending, someone getting it, and a code BOTH sides understand. If the code isn't shared, the message fails — that's the part that really matters." }
  ]
};

/* ---- first_principles layout ---- */
function fpRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function fpRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    causeEffect: "CAUSE & EFFECT", whyRoot: "DIG FOR THE WHY",
    whatIf: "WHAT IF?", breakItDown: "BREAK IT DOWN"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The situation / prompt
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — MONEY SENSE (real-world value reasoning)
   A deterministic, no-API life-skills math template. Mixes hard
   numeracy (making amounts, making change) with sovereign-thinking
   value reasoning (which is the better buy, and is it even worth it).
   Canadian currency: the 1¢ penny is gone, so cash totals round to
   the nearest 5¢ — that rounding is itself a real-world fact kids meet.
============================================================ */
window.TEMPLATES.money_sense = {
  id: "money_sense",
  label: "Money sense (real-world value reasoning)",
  subject: "math",
  grades: ["1", "2", "3"],
  topicHint: "Money & financial literacy",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Money skill",
      options: [
        { value: "makeAmount", label: "Build the amount (which coins make it?)" },
        { value: "makeChange", label: "Make change (you pay, what's left over?)" },
        { value: "goodDeal",   label: "Better buy? (compare, and say WHY)" },
        { value: "worthIt",    label: "Is it worth it? (wants, needs & trade-offs)" },
        { value: "mixed",      label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "maxAmount", type: "select", label: "Money range",
      options: [
        { value: "100",  label: "Up to $1.00 (coins)" },
        { value: "500",  label: "Up to $5.00" },
        { value: "2000", label: "Up to $20.00" }
      ], default: "500" },
    { id: "count", type: "number", label: "# of problems", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const maxAmount = parseInt(m.maxAmount, 10) || 500; // in cents
    const modes = m.mode === "mixed"
      ? ["makeAmount", "makeChange", "goodDeal", "worthIt"]
      : [m.mode];
    const items = [];
    let worthItIdx = 0;
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (mode === "worthIt") {
        // Value-reasoning prompts: deterministic bank, cycled (not random)
        items.push(Object.assign({ mode }, MONEY_WORTH_IT[worthItIdx % MONEY_WORTH_IT.length]));
        worthItIdx++;
      } else if (mode === "makeAmount") {
        items.push(moneyGenMakeAmount(maxAmount));
      } else if (mode === "makeChange") {
        items.push(moneyGenMakeChange(maxAmount));
      } else { // goodDeal
        items.push(moneyGenGoodDeal());
      }
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Money Sense";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Money is just a tool for trading — a number people agreed on. Work out each one carefully, but also keep asking the bigger question: is this a GOOD trade? The math tells you the price. YOU decide if it's worth it.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "You buy a snack for 65\u00a2 and hand over a $1 coin (100\u00a2). Change = 100 \u2212 65 = 35\u00a2. " +
          "But the bigger question: was that snack worth 65\u00a2 of YOUR money? A price is just a number someone picked \u2014 you still get to decide if the trade is good.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 78);
    }

    content.items.forEach((it, idx) => {
      const needed = moneyRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = moneyRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- money_sense helpers ---- */
function moneyFmt(cents) {
  // Format cents -> "65\u00a2" under a dollar, "$3.25" at/above a dollar.
  if (cents < 100) return cents + "\u00a2";
  return "$" + (cents / 100).toFixed(2);
}

// Canadian coins/bills in cents (penny abolished in 2013).
const MONEY_DENOMS = [2000, 1000, 500, 200, 100, 25, 10, 5];

function moneyRoundNickel(cents) { return Math.round(cents / 5) * 5; }

// Greedy breakdown into Canadian denominations (always works for nickel multiples).
function moneyBreakdown(cents) {
  const parts = [];
  let rem = cents;
  for (const d of MONEY_DENOMS) {
    const n = Math.floor(rem / d);
    if (n > 0) { parts.push({ d, n }); rem -= n * d; }
  }
  return parts;
}
function moneyBreakdownText(cents) {
  const parts = moneyBreakdown(cents);
  if (!parts.length) return "nothing";
  return parts.map(p => p.n + " \u00d7 " + moneyFmt(p.d)).join(", ");
}

function moneyGenMakeAmount(maxAmount) {
  // Pick a tidy nickel-multiple target within range (skew toward coin range).
  const cap = Math.min(maxAmount, 200); // makes "build with coins" reasonable
  let target = moneyRoundNickel(20 + Math.floor(Math.random() * (cap - 20)));
  if (target < 15) target = 15;
  return {
    mode: "makeAmount",
    text: "You need to make exactly " + moneyFmt(target) + " using coins.",
    ask: "What coins could you use? (There is more than one good answer.)",
    answer: "One way: " + moneyBreakdownText(target) + ".",
    why: "There's no single 'right' set of coins \u2014 several combinations make " + moneyFmt(target) +
         ". Using the biggest coins first means fewer coins, but any combo that adds up is correct. The total is what matters, not the path."
  };
}

function moneyGenMakeChange(maxAmount) {
  // price < paid; paid is a clean denomination >= price (rounded to nickel).
  const payOptions = maxAmount >= 2000 ? [500, 1000, 2000]
                   : maxAmount >= 500  ? [200, 500, 1000]
                   : [100, 200];
  const paid = payOptions[Math.floor(Math.random() * payOptions.length)];
  // price between ~30% and ~95% of paid, rounded to a nickel.
  let price = moneyRoundNickel(Math.floor(paid * (0.3 + Math.random() * 0.6)));
  if (price >= paid) price = moneyRoundNickel(paid - 25);
  if (price < 5) price = 5;
  const change = paid - price;
  return {
    mode: "makeChange",
    text: "Something costs " + moneyFmt(price) + ". You pay with " + moneyFmt(paid) + ".",
    ask: "How much change should you get back?",
    answer: moneyFmt(paid) + " \u2212 " + moneyFmt(price) + " = " + moneyFmt(change) +
            " (e.g. " + moneyBreakdownText(change) + ").",
    why: "Change is just what's left after the trade: subtract the price from what you handed over. " +
         "Counting it back yourself \u2014 instead of trusting the till \u2014 is how you catch a mistake in your own favour or theirs."
  };
}

function moneyGenGoodDeal() {
  // Two options of the same item at different size/price -> compare unit value.
  const items = [
    { name: "juice boxes", unit: "box" },
    { name: "granola bars", unit: "bar" },
    { name: "apples", unit: "apple" },
    { name: "stickers", unit: "sticker" },
    { name: "markers", unit: "marker" },
    { name: "cookies", unit: "cookie" }
  ];
  const it = items[Math.floor(Math.random() * items.length)];
  // Build two packs where one is clearly better per-unit. Keep numbers tidy.
  const perA = [3, 4, 5, 6][Math.floor(Math.random() * 4)];  // cents per unit, pack A
  const qtyA = [4, 5, 6][Math.floor(Math.random() * 3)];
  const qtyB = [8, 10, 12][Math.floor(Math.random() * 3)];
  // Make B cheaper per unit by a clean margin.
  const perB = perA - [1, 1, 2][Math.floor(Math.random() * 3)];
  const unitA = perA * 5;  // scale to nickels-ish, multiply to dollars
  const unitB = Math.max(5, perB * 5);
  const priceA = moneyRoundNickel(unitA * qtyA);
  const priceB = moneyRoundNickel(unitB * qtyB);
  const perUnitA = (priceA / qtyA);
  const perUnitB = (priceB / qtyB);
  const betterIsB = perUnitB < perUnitA;
  const better = betterIsB ? "B" : "A";
  return {
    mode: "goodDeal",
    text: "Pack A: " + qtyA + " " + it.name + " for " + moneyFmt(priceA) + ".   " +
          "Pack B: " + qtyB + " " + it.name + " for " + moneyFmt(priceB) + ".",
    ask: "Which is the better buy per " + it.unit + " \u2014 and WHY?",
    answer: "Pack " + better + ". A \u2248 " + (perUnitA / 100).toFixed(2) + " each, B \u2248 " +
            (perUnitB / 100).toFixed(2) + " each.",
    why: "The bigger price isn't the worse deal \u2014 you have to compare the cost of ONE " + it.unit +
         ". Divide each price by how many you get, then compare. The sticker shouting 'BIGGER!' isn't the one deciding for you. " +
         "(And remember: the cheaper-per-unit pack is only better if you'll actually use all of them.)"
  };
}

// Value / trade-off reasoning bank (sovereign frame: you decide worth, prices are agreements).
const MONEY_WORTH_IT = [
  { mode: "worthIt",
    text: "A toy you already have a version of is on sale: '50% OFF! TODAY ONLY!'",
    ask: "Is a discount a good reason to buy it? What questions would you ask first?",
    answer: "Not by itself. Ask: do I need/want it, will I use it, is the 'old price' even real?",
    why: "'On sale' tells you the price dropped \u2014 it does NOT tell you the thing is worth buying. A trick stores use is a fake high 'before' price to make the deal feel bigger. The real question is never 'is it cheaper?' but 'do I actually want this enough to trade my money for it?'" },
  { mode: "worthIt",
    text: "You have $10. You could buy a snack now, or save it toward something bigger you want.",
    ask: "What's the trade-off? How would you decide?",
    answer: "Spending now means giving up the bigger thing later (and the other way around).",
    why: "Every choice to spend is also a choice NOT to do something else with that money \u2014 that's the trade-off. Neither answer is 'wrong'; the skill is seeing what you give up, then choosing on purpose instead of by accident." },
  { mode: "worthIt",
    text: "Two snacks: one costs more because the package has a cartoon you like on it.",
    ask: "Are you paying for the snack, or the picture? Is that worth it to you?",
    answer: "Often you're paying extra for the package/brand, not more or better food.",
    why: "A lot of a price can be for the LOOK, not the thing itself \u2014 same cookie, fancier box, higher price. That's allowed; just know what you're trading for. Sometimes the picture IS worth it to you, and that's your call to make on purpose." },
  { mode: "worthIt",
    text: "A friend says 'everybody has this, you HAVE to get it.'",
    ask: "Is 'everybody has it' a good reason to spend your money? Why or why not?",
    answer: "No \u2014 what others own doesn't tell you if it's worth YOUR money.",
    why: "'Everybody has it' is pressure, not a reason. It says nothing about whether the thing is useful to you or worth the price. Your money, your choice \u2014 wanting it yourself is a real reason; not wanting to be left out is just the pressure talking." },
  { mode: "worthIt",
    text: "Think about a 'want' (something fun) and a 'need' (something you must have).",
    ask: "Name one of each from your life. If money were tight, which comes first, and why?",
    answer: "Needs (food, warmth, safety) come before wants. Wants are fine \u2014 after needs.",
    why: "Needs keep you going; wants make life nicer. Both matter, but when there isn't enough for everything, sorting need-first protects you. Knowing the difference is what stops a clever ad from turning a 'want' into a fake 'need' in your head." },
  { mode: "worthIt",
    text: "A game is 'free' to play, but keeps asking you to spend real money to go faster.",
    ask: "Is it really free? Why would they give it away and then ask for money?",
    answer: "Not really \u2014 'free' gets you in; the goal is to get you to spend later.",
    why: "When something is free, ask how it actually makes money \u2014 because it does, somehow. 'Free to start' is often a door, and the spending is on the other side of it. Seeing the plan means YOU decide whether to walk through, instead of being walked." }
];

/* ---- money_sense layout (mirrors first_principles row layout) ---- */
function moneyRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function moneyRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    makeAmount: "BUILD THE AMOUNT", makeChange: "MAKE CHANGE",
    goodDeal: "BETTER BUY?", worthIt: "IS IT WORTH IT?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The situation / prompt
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking / math question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — LOGIC & DEDUCTION (think it through)
   A deterministic, no-API reasoning template. Trains the core
   sovereign skill: taking a few given facts and reasoning to a
   conclusion you can DEFEND — and refusing one the facts don't
   support. Modes: deduce (clues -> who/what), whoOwns (mini logic
   matching), contradiction (which claim can't be true), and
   validInvalid (does the conclusion really follow? catch the
   sneaky jump). Mirrors the first_principles / money_sense row
   layout exactly so it inherits the same look and answer key.
============================================================ */
window.TEMPLATES.logic_deduction = {
  id: "logic_deduction",
  label: "Logic & deduction (think it through)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Logic & reasoning",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "deduce",       label: "Use the clues (who / what must it be?)" },
        { value: "whoOwns",      label: "Match it up (sort out who's who from clues)" },
        { value: "contradiction", label: "Spot the impossible (which claim can't be true?)" },
        { value: "validInvalid", label: "Does it really follow? (catch the sneaky jump)" },
        { value: "mixed",        label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["deduce", "whoOwns", "contradiction", "validInvalid"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = logicShuffle(LOGIC_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Logic & Deduction";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Logic is just following the clues to the ONE answer they actually point at \u2014 nothing more, nothing less. Don't guess what feels right; check what the clues let you say for sure. A good thinker says 'I can prove it' or 'I can't tell yet from this' \u2014 both are honest. The trap is believing more than the clues actually show.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Clues: The pet is NOT a fish. It has fur. It does NOT bark.  ->  Cat. Walk the clues: 'has fur' rules out the fish; 'doesn't bark' rules out the dog. A cat is the only one left that fits ALL the clues \u2014 so it's a sure answer, not a guess.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 82);
    }

    content.items.forEach((it, idx) => {
      const needed = logicRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = logicRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- logic_deduction content banks ---- */
function logicShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the clues / situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const LOGIC_BANKS = {
  deduce: [
    { text: "An animal is NOT a bird. It does NOT live in water. It hops and has long ears.",
      ask: "Which animal is it? Show how each clue helps.",
      answer: "A rabbit. 'Not a bird' + 'not in water' + 'hops, long ears' all point to it.",
      why: "Take the clues one at a time and cross things off. Not a bird, not a fish, hops with long ears \u2014 only the rabbit survives every clue. That's deduction: the answer is whatever's left when nothing's ruled out." },
    { text: "A number is bigger than 5 but smaller than 8. It is NOT 6.",
      ask: "What number is it? How do you know for sure?",
      answer: "7. Between 5 and 8 leaves 6 or 7; 'not 6' leaves only 7.",
      why: "First the range (6 or 7), then the last clue cuts out 6. When the clues squeeze down to one answer, you don't have to guess \u2014 you can prove it." },
    { text: "Three cups are upside-down. The toy is NOT under the red cup. It is NOT under the blue cup. The cups are red, blue, and green.",
      ask: "Which cup hides the toy? Why are you sure?",
      answer: "The green cup \u2014 it's the only one not ruled out.",
      why: "You never had to see under a cup. Two 'NOT's knock out red and blue, and only green is left. Logic can find the answer even when you can't peek." },
    { text: "Someone left footprints in the snow. The prints are small and made by boots, not paws. A cat and a small child were outside.",
      ask: "Who most likely made the prints? What clue decides it?",
      answer: "The child \u2014 'boots, not paws' rules out the cat.",
      why: "Both could leave small prints, so size alone won't decide. The deciding clue is 'boots, not paws.' Find the clue that separates the suspects \u2014 that's the one that does the work." },
    { text: "A fruit is round, grows on a tree, and is usually red or green. It is NOT a grape and NOT a banana.",
      ask: "Name a fruit it could be. Which clue rules out the banana?",
      answer: "An apple. 'Round' and 'red or green' rule out the banana.",
      why: "'Round' alone already knocks out the banana (it's long and yellow). Stack the rest \u2014 grows on a tree, red or green \u2014 and an apple fits them all. One strong clue can do a lot of the ruling-out." }
  ],
  whoOwns: [
    { text: "Mia, Sam, and Bo each have ONE pet: a dog, a cat, or a fish. Mia's pet has fur but doesn't bark. Sam's pet lives in water.",
      ask: "Who owns which pet? Work it out from the clues.",
      answer: "Mia=cat, Sam=fish, Bo=dog.",
      why: "Start with the surest clue: 'fur but no bark' = cat, so Mia has the cat. 'Lives in water' = fish, so Sam. That leaves only the dog for Bo. Lock in what you KNOW first, and the rest falls into place." },
    { text: "Three kids picked one color each \u2014 red, blue, green. Ana didn't pick red or green. Leo didn't pick blue.",
      ask: "Which color did each pick?",
      answer: "Ana=blue, Leo=red, the third kid=green.",
      why: "Ana's two 'didn'ts' leave only blue \u2014 done. Now Leo can't be blue (taken) or blue again, and the clue says not blue... red or green left, and someone must get green, so Leo=red. Cross off as you go and the last spot is forced." },
    { text: "Two friends ordered lunch: one got soup, one got a sandwich. Kai does not like soup. Whatever Kai didn't order, Jo did.",
      ask: "What did each friend order?",
      answer: "Kai=sandwich, Jo=soup.",
      why: "'Kai doesn't like soup' means Kai got the sandwich. There's one meal left \u2014 the soup \u2014 so Jo gets it. When there are only two choices, ruling one out for someone settles BOTH of them." },
    { text: "Three boxes are sizes small, medium, large. The big box is NOT the toy box. The toy box is NOT the smallest. Boxes: toys, books, hats.",
      ask: "What size is the toy box?",
      answer: "Medium \u2014 it's not the big one and not the smallest, so the middle is left.",
      why: "You don't even need to know the other boxes. 'Not big' and 'not smallest' leave only medium for the toys. Sometimes the clues about ONE thing are enough to pin it down." },
    { text: "Pip, Roo, and Tess sit in a row of 3 chairs. Tess is NOT on either end. Pip is to the LEFT of Roo.",
      ask: "What order are they sitting in, left to right?",
      answer: "Pip, Tess, Roo.",
      why: "'Tess not on an end' forces Tess into the middle. That leaves the two ends for Pip and Roo, and 'Pip left of Roo' decides which end each takes. Pin the most-restricted person first \u2014 Tess had only one spot." }
  ],
  contradiction: [
    { text: "A kid says: \"I have never been awake past 8pm... and last night I watched fireworks at 10pm.\"",
      ask: "Both can't be true. Which part shows it's impossible, and why?",
      answer: "Watching fireworks at 10pm means being awake past 8pm \u2014 so 'never' is false.",
      why: "A contradiction is when two claims can't BOTH be true at once. 'Never past 8pm' and 'awake at 10pm' crash into each other. Spotting that is how you catch a story that doesn't add up \u2014 even a confident one." },
    { text: "Someone tells you: \"This box is completely empty, but be careful \u2014 there's a ball inside it.\"",
      ask: "Why can't both parts be true?",
      answer: "'Completely empty' means nothing inside; a ball inside means not empty.",
      why: "'Empty' and 'has a ball in it' are opposites \u2014 they can't share the same box at the same time. When two things cancel each other out, at least one is wrong, no matter how sure the speaker sounds." },
    { text: "An ad says: \"Our cookies are the ONLY ones with no sugar at all \u2014 and they're the sweetest cookies you'll ever taste!\"",
      ask: "What's the catch here? Why is it hard to believe both?",
      answer: "Sweetness usually comes from sugar; 'no sugar at all' fighting 'sweetest ever' is a red flag.",
      why: "Not a hard 'impossible,' but a clash worth questioning: sweet normally means sugar of some kind. When an ad's two big claims pull against each other, slow down \u2014 that tension is exactly where they hope you won't look." },
    { text: "A note reads: \"All the lights in the house are off, and the kitchen light is on.\"",
      ask: "Can both be true? Explain.",
      answer: "No \u2014 if ALL lights are off, the kitchen light can't be on.",
      why: "The word 'all' is strong: it includes the kitchen. So 'all off' and 'kitchen on' contradict. Watch for big words like all, never, always, none \u2014 one exception is enough to break them." },
    { text: "A kid claims: \"I'm the tallest in my class, and three kids in my class are taller than me.\"",
      ask: "Which two parts fight each other, and why?",
      answer: "Being tallest means NO one is taller; 'three are taller' makes that false.",
      why: "'Tallest' means at the very top \u2014 nobody above. 'Three taller than me' puts three people above. Both can't stand. Checking a claim against its own details is how you test it without anyone telling you the answer." }
  ],
  validInvalid: [
    { text: "\"All dogs have four legs. My table has four legs. So my table is a dog.\"",
      ask: "Does that conclusion really follow? Why or why not?",
      answer: "No \u2014 having four legs doesn't make something a dog. Other things have four legs too.",
      why: "The jump is sneaky: dogs have four legs, but lots of things do. 'Four legs' going IN doesn't mean 'dog' comes OUT. A reason has to actually force the answer \u2014 this one doesn't, so the conclusion is unearned." },
    { text: "\"It rained, and the grass is wet. So rain is the ONLY thing that can make grass wet.\"",
      ask: "Is that conclusion safe? What else could wet the grass?",
      answer: "No \u2014 a sprinkler, dew, or a spilled bucket could too. Rain isn't the only cause.",
      why: "One cause worked this time, but 'only' is a big word to earn. List other ways grass gets wet and the 'only' falls apart. Beware conclusions that quietly slam the door on every other possibility." },
    { text: "\"Some birds can't fly, like penguins. A penguin is a bird. So NO birds can fly.\"",
      ask: "Does 'no birds can fly' follow from those facts? Why not?",
      answer: "No \u2014 'some can't' is not 'none can.' Most birds DO fly.",
      why: "Watch the swap from 'some' to 'none' \u2014 that's the trick. 'Some birds can't fly' is true, but it says nothing about the many that can. A true start can still lead to a false finish if the logic jumps too far." },
    { text: "\"My friend got a prize after eating cereal. So eating that cereal makes you win prizes.\"",
      ask: "Does winning really follow from the cereal? Explain.",
      answer: "No \u2014 the cereal and the prize happened near each other, but one didn't cause the other.",
      why: "Two things happening close together doesn't mean one caused the other. The prize came from a draw or luck, not the cereal. Ads LOVE this jump \u2014 'people who use this are happy' \u2014 spotting it keeps you in charge." },
    { text: "\"Everyone in the room is wearing socks. So the next person who walks in will be wearing socks too.\"",
      ask: "Is that a sure thing or just a guess? Why?",
      answer: "Just a guess \u2014 a NEW person isn't covered by 'everyone in the room' yet.",
      why: "The fact only covers people already in the room. Someone new hasn't been counted, so you can expect socks but you can't PROVE it. Knowing the difference between 'likely' and 'certain' is honest thinking." }
  ]
};

/* ---- logic_deduction layout (mirrors first_principles row layout) ---- */
function logicRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function logicRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    deduce: "USE THE CLUES", whoOwns: "MATCH IT UP",
    contradiction: "SPOT THE IMPOSSIBLE", validInvalid: "DOES IT FOLLOW?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The clues / situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   whats_missing — "What's missing? (see past the spin)"
   Deeper media/manipulation literacy: a claim can be 100% TRUE
   and still steer you, by what it leaves out, the words it picks,
   the number it shows (and the one it hides), or what it points
   your eyes at. Trains: ask "compared to what?", notice loaded
   words, demand the missing denominator, see the frame.
   Deterministic, never calls AI. Sovereign voice: the facts can
   all be true and you can still be played — your job is to notice.
============================================================ */
window.TEMPLATES.whats_missing = {
  id: "whats_missing",
  label: "What's missing? (see past the spin)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Critical thinking & media literacy",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "missingContext", label: "What aren't they telling you? (compared to what?)" },
        { value: "loadedWords",    label: "Same fact, two spins (the words steer you)" },
        { value: "cherryNumber",   label: "The lonely number (where's the rest of it?)" },
        { value: "framing",        label: "What's it pointing your eyes at? (and away from)" },
        { value: "mixed",          label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["missingContext", "loadedWords", "cherryNumber", "framing"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = wmShuffle(WM_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "What's Missing?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Here's the tricky part: everything below can be TRUE and still try to steer you. The trick isn't lying \u2014 it's what gets left out, the words that are chosen, or the one number they show you. Your job isn't to call it a lie. It's to ask the missing question: 'Compared to what?' 'Out of how many?' 'What aren't they showing me?' Find the gap, and you stay in charge of what you believe.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"Now with 50% MORE crunch!\"  ->  True, maybe \u2014 but 50% more than WHAT? More than the old box? Than nothing? The missing word is 'than ___.' A number with no 'compared to what' is just a shiny blank. I'd ask before I believe.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 82);
    }

    content.items.forEach((it, idx) => {
      const needed = wmRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = wmRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- whats_missing content banks ---- */
function wmShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the true-but-steering claim the child reads
//   ask    = the missing-question prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const WM_BANKS = {
  missingContext: [
    { text: "A sign: \"Our slushies have REAL fruit juice!\"",
      ask: "It might be true \u2014 but what aren't they telling you?",
      answer: "How MUCH juice. 'Real fruit juice' can mean one drop in a cup of sugar water.",
      why: "'Real' is true and useless at the same time \u2014 it says nothing about how much. The missing word is 'how much?' One drop counts as 'real.' Ask the amount, not just the label." },
    { text: "\"Kids who use BrainBlocks toys did better on a test!\"",
      ask: "What would you need to know before you believe the toy did it?",
      answer: "What those kids were like already, and how kids WITHOUT the toy did.",
      why: "Maybe those kids already studied a lot, or had help at home. With no 'compared to who?', you can't tell if the toy did anything. The missing group is the other kids \u2014 the ones they didn't show you." },
    { text: "\"This phone has the BIGGEST screen!\"",
      ask: "Biggest compared to what? What's the missing question?",
      answer: "Biggest of WHICH phones? Maybe just their own old one, or a tiny list.",
      why: "'Biggest' needs a 'biggest of what.' Of every phone ever? Of three they picked? Without the group it's just a big-sounding word. 'Compared to what?' is the question that pops the bubble." },
    { text: "\"Our candy is FAT-FREE!\"",
      ask: "That can be true \u2014 so what are they hoping you forget to ask?",
      answer: "Whether it's full of sugar. Fat-free candy can still be almost all sugar.",
      why: "They wave one true flag ('no fat!') so you don't look at the part they'd rather hide (lots of sugar). A true label can be a curtain. Peek behind it: what did they NOT put in big letters?" },
    { text: "\"Most dentists pick CleanBrite paste!\"",
      ask: "What's left out that would change how you feel about 'most'?",
      answer: "How many dentists were asked, and what 'most' means \u2014 most of 5? Most of a paid group?",
      why: "'Most' sounds like a crowd, but most of WHAT? If they asked four friends, 'most' is three people. The missing number is the size of the group. Tiny groups make 'most' nearly meaningless." }
  ],
  loadedWords: [
    { text: "Two reports, same dog: A) \"The dog GOBBLED its food.\"  B) \"The dog ATE its food.\"",
      ask: "Same event. Which words push a feeling, and which just report?",
      answer: "B just reports. A ('gobbled') paints the dog as greedy \u2014 the fact is the same.",
      why: "The dog did the exact same thing. 'Gobbled' adds a judgment for free. When the facts match but the feeling changes, the word picked the feeling for you \u2014 notice it, then decide for yourself." },
    { text: "A) \"He REFUSED to share.\"  B) \"He kept his own toy.\"  (same boy, same toy)",
      ask: "Which version makes him sound worse, and is that from facts or words?",
      answer: "A sounds worse. 'Refused' makes it sound mean; the fact (kept his toy) is neutral.",
      why: "Both are true descriptions of one moment. 'Refused' sneaks in 'bad guy'; 'kept his own' is just what happened. The author chose your villain with a word. You get to un-choose it." },
    { text: "A) \"The crowd was a HUGE mob.\"  B) \"A group of people gathered.\"",
      ask: "Same people. Which word makes you nervous on purpose?",
      answer: "A. 'Mob' sounds scary; 'group' is calm \u2014 the crowd is identical.",
      why: "'Mob' and 'group' can be the very same people. One word makes your heart speed up. If the picture in your head changes but the facts don't, the words did it \u2014 not reality." },
    { text: "A) \"She ONLY scored 8 out of 10.\"  B) \"She scored 8 out of 10.\"",
      ask: "What is the little word 'only' quietly telling you to feel?",
      answer: "'Only' makes 8/10 sound like a letdown, even though it's a strong score.",
      why: "Eight out of ten is good either way. 'Only' is a tiny word that says 'be disappointed.' One small word can flip a win into a loss in your head. Catch the word, keep the win." },
    { text: "A) \"They SPLURGED on a new ball.\"  B) \"They bought a new ball.\"",
      ask: "Same purchase. What does 'splurged' want you to think of them?",
      answer: "That they were wasteful or showing off. 'Bought' says none of that.",
      why: "Buying a ball is just buying a ball. 'Splurged' paints them as careless with money. The action didn't change \u2014 the storyteller added a frown. You can take it back off." }
  ],
  cherryNumber: [
    { text: "\"3,000 people loved our movie!\"",
      ask: "3,000 sounds big \u2014 but what number is hiding next to it?",
      answer: "How many TOTAL watched. 3,000 out of 3,000 is amazing; out of a million, not so much.",
      why: "A number alone is a lonely number. '3,000 loved it' needs 'out of how many?' The missing piece is the bottom number. Big top, huge bottom \u2014 suddenly it's small. Always ask 'out of how many?'" },
    { text: "\"Our team WON 5 games this year!\"",
      ask: "Five wins \u2014 what's the question that decides if that's good?",
      answer: "How many games did they PLAY (and lose)? 5 wins out of 6 is great; 5 out of 40 isn't.",
      why: "Wins with no losses next to them is half a story. They show the shiny half. 5 out of 6 and 5 out of 40 are both '5 wins.' The hidden number (the losses) is where the truth lives." },
    { text: "\"Prices DROPPED by $50!\"",
      ask: "Fifty dollars off \u2014 what do you need to know to tell if that's a deal?",
      answer: "The old price and the new price. $50 off $1,000 is small; off $60 it's huge.",
      why: "'$50 off' means nothing until you know 'off of what?' Fifty off a thousand is barely a nibble. The missing number is the starting price. A big-sounding cut can be a tiny one." },
    { text: "\"Twice as many kids chose our snack!\"",
      ask: "Twice as many \u2014 twice as many as WHAT? Why does it matter?",
      answer: "Twice as many as the OTHER snack \u2014 but maybe only 2 vs 1 kid total.",
      why: "'Twice as many' can be 100 vs 50, or just 2 vs 1. Without the real counts, 'twice' is a magic trick. The missing numbers are the actual amounts. 'Twice a tiny thing' is still tiny." },
    { text: "\"9 out of 10 chose VitaJuice!\"",
      ask: "Nine out of ten of WHOM? What's missing that would change it?",
      answer: "Who those 10 were, and how they were picked. 10 friends of the maker isn't proof.",
      why: "Ten people is a small crowd, and we don't know who they are. If the maker picked them, of course they chose it. The missing piece is 'who, and how chosen?' Small, hand-picked groups prove almost nothing." }
  ],
  framing: [
    { text: "A photo shows a clean, smiling family using a cleaner spray. The label print is too small to read.",
      ask: "What is the picture pointing your eyes AT \u2014 and what away from?",
      answer: "At happy faces; away from the tiny ingredient list. The smile isn't proof it cleans.",
      why: "The big, happy picture grabs your eyes so the small, true facts stay quiet. Smiles don't clean floors. When something points you at a feeling, look for what it's hoping you'll skip." },
    { text: "A cereal box shows a giant strawberry on the front. The fruit listed inside: zero real strawberries.",
      ask: "What is the front of the box steering you to expect?",
      answer: "That it has strawberries. The big picture frames it as fruity when it isn't.",
      why: "A picture isn't a promise \u2014 it's a frame. The strawberry says 'fruity!' while the ingredients say 'nope.' Trust the small true list over the big pretty picture. Check the back, not the front." },
    { text: "A headline: \"DANGER in your kitchen!\" \u2014 the story inside is about a knife that's sharp if you grab the blade.",
      ask: "What does the BIG headline want you to feel before you read?",
      answer: "Scared. The huge word 'DANGER' frames a normal thing as an emergency.",
      why: "Headlines are bait shaped to a feeling \u2014 here, fear. A sharp knife isn't news. They frame the boring truth as a scare so you click. Read past the headline before you let it set your mood." },
    { text: "A toy ad shows kids zooming the car on a cool track. In tiny words at the bottom: \"Track sold separately.\"",
      ask: "What is the ad framing as included that actually isn't?",
      answer: "The track. The fun scene frames it as part of the toy, but it costs extra.",
      why: "They build the picture out of stuff you have to buy separately, then whisper the truth in tiny print. The frame shows the dream; the fine print shows the deal. Read the small words \u2014 that's where the honesty hides." },
    { text: "A drink ad shows a famous athlete winning a race while holding the drink.",
      ask: "What is this scene trying to make you connect that isn't really linked?",
      answer: "That the drink made the athlete fast. Winning came from training, not the can.",
      why: "Putting two things in one picture tricks your brain into linking them. The athlete trained for years \u2014 the drink just got photographed next to the medal. The frame glues 'fast' onto a can. Pull them apart." }
  ]
};

/* ---- whats_missing layout (mirrors logic_deduction row layout) ---- */
function wmRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function wmRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    missingContext: "WHAT'S LEFT OUT?", loadedWords: "WORDS THAT STEER",
    cherryNumber: "THE LONELY NUMBER", framing: "WHAT'S IT POINTING AT?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The claim / situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("the missing question is...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("the missing question is... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   nature_detective — "Nature Detective (observe, then reason)"
   Real-world observation + evidence reasoning. The natural world
   doesn't hand you labels — you read the CLUES and work it out
   yourself: tracks in the mud, a sky before rain, why leaves turn,
   what a shadow tells you about the sun. Trains: notice details,
   reason from evidence (not from what you were told), ask "how could
   I find out?", and form your OWN conclusion. Sovereign voice: you
   don't need permission to figure out the world — you just need to
   look closely and think honestly. Deterministic, never calls AI.
============================================================ */
window.TEMPLATES.nature_detective = {
  id: "nature_detective",
  label: "Nature detective (observe, then reason)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Nature observation & evidence reasoning",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Detective skill",
      options: [
        { value: "readClues",   label: "Read the clues (what does the evidence say?)" },
        { value: "predict",     label: "What happens next? (predict from signs)" },
        { value: "howFindOut",  label: "How could you find out? (design a test)" },
        { value: "noticeMore",  label: "Look closer (notice what others miss)" },
        { value: "mixed",       label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["readClues", "predict", "howFindOut", "noticeMore"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = ndShuffle(ND_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Nature Detective";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "The natural world never wears a name tag \u2014 it leaves CLUES, and a detective reads them. For each one, don't just remember an answer someone gave you. Look at the evidence and ask: what does this actually show? What does it NOT show yet? A good detective says \"here's my best guess, and here's how I'd check it.\" You don't need permission to figure out the world \u2014 you just need to look closely and think honestly.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Clue: The grass is wet this morning, but it didn't rain.  ->  Where did the water come from? Best guess: dew \u2014 air cools overnight and water settles on the grass. How to check? Look early vs. midday: dew dries as the sun warms things up. The evidence pointed me there \u2014 I didn't just take someone's word.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 86);
    }

    content.items.forEach((it, idx) => {
      const needed = ndRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = ndRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- nature_detective content banks ---- */
function ndShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the observation / scene the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const ND_BANKS = {
  readClues: [
    { text: "In the soft mud by a pond you find small prints with webbed toes leading to the water.",
      ask: "What animal most likely made them? Which clue tells you?",
      answer: "A duck (or another water bird). Webbed toes + heading into water point to a swimmer.",
      why: "You never saw the animal \u2014 the prints did the talking. Webbed feet are built for paddling, and the trail goes to the water. Read what the tracks are FOR, and they tell you who walked there." },
    { text: "Under a tree the ground is covered in cracked-open shells and chewed nut bits.",
      ask: "Who has been eating here, and how can you tell?",
      answer: "A squirrel (or other nut-eater). Cracked shells + a tree = a feeding spot.",
      why: "The mess is a record of a meal. Something with strong teeth opened hard nuts right where they fall. The leftovers are evidence \u2014 a scene can tell you what happened even after everyone's gone." },
    { text: "A spider web is strung between two branches, and tiny drops of water sit along every thread.",
      ask: "What does the water on the web tell you about last night or this morning?",
      answer: "It was damp \u2014 likely dew or fog settled overnight; the web caught it.",
      why: "The web is a tiny weather report. Water didn't fall as rain (it would tear a web) \u2014 it settled out of damp air. Notice that the same clue rules things IN and OUT at once." },
    { text: "Half the leaves on one side of a tree are turning yellow, while the other side stays green.",
      ask: "What might be different about the two sides? Give your best guess.",
      answer: "Likely sunlight \u2014 the green side may get more sun; or that side has less water/more cold wind.",
      why: "When one part changes and another doesn't, look for what's DIFFERENT between them. Leaves need light to stay green and feed the tree. The split is a clue that the two sides aren't living the same life." },
    { text: "After a windy night, the ground under a big tree is scattered with small broken twigs and a few green leaves.",
      ask: "What does the litter on the ground tell you happened?",
      answer: "The wind was strong enough to snap weak twigs and tear some leaves off.",
      why: "You can measure last night's wind without being there \u2014 by what it left behind. Green leaves don't usually fall on their own; something pulled them. The ground keeps a record of the sky." }
  ],
  predict: [
    { text: "The sky in the afternoon fills with tall, dark, piled-up clouds and the air feels heavy and still.",
      ask: "What do you predict will happen soon? Why?",
      answer: "Likely a rainstorm (maybe thunder). Tall dark clouds + heavy air often come before rain.",
      why: "Clouds are a forecast you can read yourself. Dark, towering clouds hold a lot of water; the heavy, still air often comes first. You're not certain \u2014 you're reading signs and saying what's LIKELY." },
    { text: "You plant two identical seeds. One pot you put on a sunny windowsill; the other you leave in a dark closet.",
      ask: "Predict what each seed will do over two weeks. Why the difference?",
      answer: "The sunny one grows strong/green; the dark one sprouts pale and weak (or not at all).",
      why: "Same seed, one difference: light. Plants use light to make food, so the dark seed runs out of steam. Change ONE thing and watch \u2014 that's how you learn what really matters." },
    { text: "In autumn you notice the squirrels are very busy burying nuts all over the yard.",
      ask: "What does this busy burying predict about what's coming?",
      answer: "Cold weather / winter \u2014 they're storing food for when it's scarce.",
      why: "Animals act on what's coming before we feel it. Burying food now means food will be hard to find later. Their behavior is a clue about the season ahead \u2014 read the animals, not just the calendar." },
    { text: "A puddle is sitting in the schoolyard. The sun is out and it's a warm, breezy day.",
      ask: "Predict what the puddle will look like by this afternoon. Why?",
      answer: "Smaller or gone \u2014 the sun and wind dry it up (the water evaporates into the air).",
      why: "Water doesn't vanish \u2014 it leaves quietly as invisible vapor, faster when it's warm and windy. Predicting means picturing the chain forward: sun + wind -> water leaves -> puddle shrinks." },
    { text: "You leave an apple slice and a cracker out on a plate for three days.",
      ask: "Predict which changes more, and what change you'll see. Why?",
      answer: "The apple changes more \u2014 it browns, softens, maybe grows mold; the cracker mostly stays dry.",
      why: "The apple is full of water and sugar, so the air and tiny molds get to work on it. The dry cracker has little for them to feed on. Predicting from what something is MADE of beats just guessing." }
  ],
  howFindOut: [
    { text: "Your friend says snails always move toward the shadiest, dampest spot.",
      ask: "How could you find out if that's true \u2014 without just believing it?",
      answer: "Put a snail between a dry/sunny side and a damp/shady side and watch where it goes; try it a few times.",
      why: "Don't take a claim on trust \u2014 set up a fair test. Give the snail a real choice and repeat it so one wander doesn't fool you. 'I tested it myself' beats 'someone told me' every time." },
    { text: "Someone claims a paper towel can soak up more water than a regular tissue.",
      ask: "Design a simple test. What would you keep the SAME to make it fair?",
      answer: "Dip each in the same amount of water and compare; keep size, water, and time the same.",
      why: "A fair test changes only the thing you're asking about. Same water, same size, same dunk \u2014 then any difference is from the towel vs. tissue, not from cheating. Controlling the 'same' is the whole trick." },
    { text: "You wonder if seeds sprout faster in warm water than in cold water.",
      ask: "How would you set this up so the answer is trustworthy?",
      answer: "Same seeds, same cups, same amount of water \u2014 one warm, one cold \u2014 and check daily.",
      why: "Two cups that match in every way except temperature. If the warm one wins again and again, the heat is doing it. Run it more than once \u2014 one result could just be luck." },
    { text: "A label brags that its plant food makes plants grow 'twice as fast.'",
      ask: "How could YOU check the 'twice as fast' claim at home?",
      answer: "Grow two same plants \u2014 one with the food, one without \u2014 and measure both over time.",
      why: "Big claims deserve a check, not a nod. Without a plain plant to compare against, 'twice as fast' is just words. The plant with NO food is the most important one \u2014 it's your measuring stick." },
    { text: "You think the ice cube in your warm drink melts faster than one in cold water.",
      ask: "What test would settle it, and what makes it fair?",
      answer: "Drop same-size cubes into warm and cold water at once and time them; same cup, same cube.",
      why: "Same cube, same amount of liquid, started together \u2014 so only the temperature differs. Timing both at once removes excuses. A clean test gives an answer you can actually trust." }
  ],
  noticeMore: [
    { text: "Two leaves look 'the same' at a glance \u2014 both green, both from the yard.",
      ask: "Name three things you'd look closer at to tell them apart.",
      answer: "Things like: edge shape (smooth vs. jagged), the vein pattern, size, smell, how the underside feels.",
      why: "'The same' is usually just 'I didn't look long enough.' Slow down and the differences appear \u2014 edges, veins, feel. Noticing more is a skill, and it's how you stop being fooled by a quick glance." },
    { text: "You watch an ant carry a crumb that's bigger than the ant itself, all the way back to a crack in the path.",
      ask: "What's at least one surprising thing worth noticing here?",
      answer: "Its strength for its size, that it had a destination, or that it followed a path/trail.",
      why: "The everyday is full of weird once you actually watch it. An ant hauling something huge, heading somewhere on purpose \u2014 that's data. People walk past it; a detective stops and asks 'how?'" },
    { text: "On a sunny morning your shadow is long and points one way; by noon it's short and points another.",
      ask: "What is your shadow quietly telling you about the sun?",
      answer: "Where the sun is and how high \u2014 low sun = long shadow; high sun (noon) = short shadow.",
      why: "Your shadow is a free sun-clock. It changes because the SUN moved across the sky, not you. A thing you see every day can teach you something real once you ask what it's tracking." },
    { text: "You hold a feather and a flat stone, then drop them both at the same time.",
      ask: "What do you notice about HOW each one falls, not just which lands first?",
      answer: "The stone drops straight and fast; the feather drifts, floats, and wobbles slowly down.",
      why: "Most people only watch what wins. Watch HOW: the feather catches the air and dances; the stone ignores it. The 'how' is where the real reason hides \u2014 air pushes on the wide light thing more." },
    { text: "A flower is open wide in the morning sun, but in the evening you find it has closed up.",
      ask: "What did you notice, and what question does it make you want to ask?",
      answer: "It opens and closes with the day; a good question: does light, warmth, or time of day cause it?",
      why: "Noticing leads to a question, and a question leads to a test. You spotted a pattern (open by day, shut by night) \u2014 now you get to wonder WHY and could even check it. That's the whole loop of figuring things out." }
  ]
};

/* ---- nature_detective layout (mirrors logic_deduction row layout) ---- */
function ndRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "how I'd check it" line
  }
  return h + 8;
}

function ndRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    readClues: "READ THE CLUES", predict: "WHAT HAPPENS NEXT?",
    howFindOut: "HOW COULD YOU FIND OUT?", noticeMore: "LOOK CLOSER"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The observation / scene
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("how I'd check it...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("how I'd check it... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — ANALOGIES (think in relationships)
   "A is to B as C is to ___" — the purest relational-reasoning
   drill. The kid can't pattern-match a fact; they have to NAME
   the relationship (job, part-of, opposite, cause->effect,
   bigger/smaller, lives-in) and carry it to a new pair. This is
   first-principles thinking with training wheels off: the answer
   only comes from understanding WHY the first pair belongs
   together. Sovereign voice: figure out the rule yourself, then
   prove it — don't wait to be told the connection.

   Modes map to relationship families so Mike can target one kind
   of thinking or mix. K-friendly: "easy" picks from the simplest
   bank (job/part/opposite with everyday words). Mirrors the
   logic_deduction / nature_detective row layout + answer key.
============================================================ */
window.TEMPLATES.analogies = {
  id: "analogies",
  label: "Analogies (think in relationships)",
  subject: "reading",
  grades: ["K", "1", "2", "3"],
  topicHint: "Relational reasoning & analogies",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Relationship type",
      options: [
        { value: "easy",      label: "Easy starters (K\u20131: jobs, parts, opposites)" },
        { value: "opposite",  label: "Opposites (hot : cold)" },
        { value: "function",  label: "What's it FOR? (pencil : write)" },
        { value: "partWhole", label: "Part to whole (finger : hand)" },
        { value: "category",  label: "Kind of thing (dog : animal)" },
        { value: "causeEffect", label: "Cause \u2192 effect (rain : wet)" },
        { value: "home",      label: "Who lives where (fish : water)" },
        { value: "mixed",     label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "nameRule", type: "boolean", label: "Ask the child to name the relationship rule", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    let modes;
    if (m.mode === "easy") {
      modes = ["function", "partWhole", "opposite"]; // simplest families, easy bank only
    } else if (m.mode === "mixed") {
      modes = ["opposite", "function", "partWhole", "category", "causeEffect", "home"];
    } else {
      modes = [m.mode];
    }
    const easyOnly = m.mode === "easy";
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) {
        let bank = ANALOGY_BANKS[mode].slice();
        if (easyOnly) bank = bank.filter(x => x.easy);
        if (bank.length === 0) bank = ANALOGY_BANKS[mode].slice();
        pools[mode] = anaShuffle(bank);
      }
      const it = pools[mode].pop();
      items.push(Object.assign({ mode }, it));
    }
    return { items, nameRule: m.nameRule !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Analogies";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "An analogy is a tiny puzzle about HOW two things go together. \"A is to B as C is to ___\" \u2014 first figure out the RULE between the first pair (what's the connection?), then carry that same rule across to finish the second pair. Nobody can hand you the answer; you have to spot the relationship yourself and prove it fits. That's the whole skill: see the why, then use it.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "bird is to fly as fish is to ______.   Rule: the first word is a creature, the second is HOW it moves. A bird flies, so a fish ______ (swims). I didn't guess \u2014 I found the rule (\"how it moves\") and carried it across.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 78);
    }

    content.items.forEach((it, idx) => {
      const needed = anaRowHeight(doc, it, pageW - margin * 2, content.nameRule, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = anaRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.nameRule, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- analogies content banks ---- */
function anaShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { a, b, c, answer, rule, easy? }
//   reads as: a is to b  as  c is to ____(answer)
//   rule   = plain-language name of the relationship (answer key + "name the rule" line)
//   easy   = true if simple enough for K (used by the "easy" mode)
const ANALOGY_BANKS = {
  opposite: [
    { a: "hot", b: "cold", c: "big", answer: "small", rule: "opposites", easy: true },
    { a: "up", b: "down", c: "fast", answer: "slow", rule: "opposites", easy: true },
    { a: "day", b: "night", c: "open", answer: "closed (shut)", rule: "opposites", easy: true },
    { a: "happy", b: "sad", c: "loud", answer: "quiet", rule: "opposites" },
    { a: "wet", b: "dry", c: "full", answer: "empty", rule: "opposites" },
    { a: "start", b: "stop", c: "push", answer: "pull", rule: "opposites" }
  ],
  function: [
    { a: "pencil", b: "write", c: "scissors", answer: "cut", rule: "the thing and its job (what it's FOR)", easy: true },
    { a: "broom", b: "sweep", c: "cup", answer: "drink (hold a drink)", rule: "the thing and its job", easy: true },
    { a: "key", b: "unlock", c: "knife", answer: "cut", rule: "the thing and its job", easy: true },
    { a: "ears", b: "hear", c: "eyes", answer: "see", rule: "body part and what it does" },
    { a: "boat", b: "float", c: "plane", answer: "fly", rule: "the thing and how it travels" },
    { a: "clock", b: "time", c: "ruler", answer: "length (how long)", rule: "the tool and what it measures" }
  ],
  partWhole: [
    { a: "finger", b: "hand", c: "toe", answer: "foot", rule: "a part and the whole it belongs to", easy: true },
    { a: "page", b: "book", c: "leaf", answer: "tree", rule: "a part and its whole", easy: true },
    { a: "wheel", b: "car", c: "wing", answer: "bird (or plane)", rule: "a part and its whole", easy: true },
    { a: "petal", b: "flower", c: "branch", answer: "tree", rule: "a part and its whole" },
    { a: "room", b: "house", c: "word", answer: "sentence", rule: "a part and the bigger thing it builds" },
    { a: "second", b: "minute", c: "day", answer: "week (or month/year)", rule: "a small unit inside a bigger one" }
  ],
  category: [
    { a: "dog", b: "animal", c: "rose", answer: "flower (plant)", rule: "a thing and the GROUP it belongs to", easy: true },
    { a: "apple", b: "fruit", c: "carrot", answer: "vegetable", rule: "a thing and its group", easy: true },
    { a: "red", b: "color", c: "three", answer: "number", rule: "a thing and its group" },
    { a: "robin", b: "bird", c: "shark", answer: "fish", rule: "a thing and its group" },
    { a: "hammer", b: "tool", c: "couch", answer: "furniture", rule: "a thing and its group" },
    { a: "oak", b: "tree", c: "salmon", answer: "fish", rule: "a thing and its group" }
  ],
  causeEffect: [
    { a: "rain", b: "wet", c: "sun", answer: "warm (hot / dry)", rule: "a cause and what it makes happen", easy: true },
    { a: "fire", b: "hot", c: "ice", answer: "cold", rule: "a cause and its effect", easy: true },
    { a: "tired", b: "sleep", c: "hungry", answer: "eat", rule: "a feeling and what fixes it" },
    { a: "seed", b: "plant", c: "egg", answer: "chick (bird)", rule: "a start and what it grows into" },
    { a: "push", b: "move", c: "tickle", answer: "laugh", rule: "an action and what it causes" },
    { a: "cut", b: "bleed", c: "trip", answer: "fall", rule: "an action and what it causes" }
  ],
  home: [
    { a: "fish", b: "water", c: "bird", answer: "nest (sky / tree)", rule: "an animal and where it lives", easy: true },
    { a: "bee", b: "hive", c: "spider", answer: "web", rule: "an animal and its home", easy: true },
    { a: "dog", b: "kennel", c: "horse", answer: "stable (barn)", rule: "an animal and its home" },
    { a: "bear", b: "cave (den)", c: "rabbit", answer: "burrow", rule: "an animal and its home" },
    { a: "cow", b: "barn", c: "car", answer: "garage", rule: "a thing and where it's kept" },
    { a: "king", b: "castle", c: "captain", answer: "ship", rule: "a person and where they belong" }
  ]
};

/* ---- analogies layout (mirrors nature_detective row layout) ---- */
function anaRowHeight(doc, it, w, nameRule, showAnswers) {
  doc.setFontSize(12);
  const prompt = it.a + " is to " + it.b + "  as  " + it.c + " is to ______________";
  const pLines = doc.splitTextToSize(prompt, w - 24);
  let h = 16;
  h += pLines.length * 15 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "   (rule: " + it.rule + ")", w - 24);
    h += ansLines.length * 12 + 6;
  } else if (nameRule) {
    h += 20; // "the rule is..." line
  }
  return h + 8;
}

function anaRenderRow(doc, it, num, x, y, w, nameRule, showAnswers) {
  const modeTag = {
    opposite: "OPPOSITES", function: "WHAT'S IT FOR?", partWhole: "PART \u2192 WHOLE",
    category: "KIND OF THING", causeEffect: "CAUSE \u2192 EFFECT", home: "WHO LIVES WHERE"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 20;
  const bx = x + 20;
  const bw = w - 24;

  // The analogy prompt
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
  const prompt = it.a + " is to " + it.b + "  as  " + it.c + " is to ______________";
  const pLines = doc.splitTextToSize(prompt, bw);
  doc.text(pLines, bx, cy);
  cy += pLines.length * 15 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "   (rule: " + it.rule + ")", bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else if (nameRule) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
    doc.text("the rule is...", bx, cy);
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx + doc.getTextWidth("the rule is... ") + 4, cy, x + w, cy);
    cy += 14;
    doc.setTextColor(20, 20, 20);
  }
  return cy;
}

/* ============================================================
   cause_effect_chains — "Cause & Effect (and then what?)"
   Consequence reasoning, not just pairing. Trains four moves:
     forward   = given a cause, predict what follows (and then what?)
     backward  = given an effect, reason back to a likely cause
     chain     = order a short chain of events (first -> then -> so)
     coincidence = did A really CAUSE B, or did they just happen near
                   each other? (the "after it = because of it" trap)
   First-principles + manipulation-literacy crossover: ads and rumors
   lean hard on "this happened, then that, so this caused that."
   Knowing causes have to actually DO the work keeps a kid in charge.
   Deterministic, never calls AI. Sovereign voice: trace it yourself.
============================================================ */
window.TEMPLATES.cause_effect_chains = {
  id: "cause_effect_chains",
  label: "Cause & effect (and then what?)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Cause, effect & consequence reasoning",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "forward",     label: "And then what? (cause -> predict the effect)" },
        { value: "backward",    label: "What caused this? (effect -> reason back)" },
        { value: "chain",       label: "Put it in order (first -> then -> so)" },
        { value: "coincidence", label: "Did it REALLY cause it? (catch the trap)" },
        { value: "mixed",       label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["forward", "backward", "chain", "coincidence"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = ceShuffle(CE_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Cause & Effect";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Everything that happens has a cause \u2014 something that made it happen \u2014 and an effect \u2014 what happens next. Good thinkers run the movie both ways: \"if this, then what comes next?\" and \"this happened, so what caused it?\" The big trap: just because B happened after A does NOT prove A caused B. A real cause has to actually DO the work. Trace the connection yourself \u2014 don't take it on faith.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"I wore my lucky socks and my team won. So the socks made us win!\"  ->  Nope. The win came after the socks, but socks can't kick a ball. Things that happen near each other aren't always cause-and-effect. Ask: could this thing ACTUALLY do the work? If not, it's just a coincidence wearing a costume.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 88);
    }

    content.items.forEach((it, idx) => {
      const needed = ceRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = ceRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- cause_effect_chains content banks ---- */
function ceShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const CE_BANKS = {
  forward: [
    { text: "You leave a cup of water in the freezer overnight.",
      ask: "And then what? What will the water be like in the morning \u2014 and WHY?",
      answer: "It freezes into ice. Cold pulls the heat out until the water turns solid.",
      why: "The cause (freezing cold) does real work on the water \u2014 it pulls out heat until the water hardens. You don't have to be told the answer; you can run the movie forward from what cold does to water." },
    { text: "Nobody waters a little plant on the windowsill for two weeks.",
      ask: "And then what happens to the plant? Why does it follow?",
      answer: "It dries out, wilts, and may die. Plants need water to stay alive.",
      why: "No water in means no water for the plant to use \u2014 so it droops and dries. The effect follows straight from the cause. Knowing what something NEEDS lets you predict what happens when it's missing." },
    { text: "You blow up a balloon bigger and bigger and keep going.",
      ask: "And then what? Predict the next thing \u2014 and explain.",
      answer: "It pops. The stretchy skin can only stretch so far before it tears.",
      why: "More air pushes harder on the skin; the skin can only take so much. The cause (too much air) builds until the effect (pop) has to happen. Real causes pile up to a tipping point \u2014 you can see it coming." },
    { text: "You roll a ball off the edge of a table.",
      ask: "And then what? What does the ball do, and why?",
      answer: "It falls down to the floor. Gravity pulls things toward the ground.",
      why: "Nothing holds it up once it leaves the table, and gravity is always pulling down. Same cause, same effect, every single time \u2014 that's how you can predict it before it happens." },
    { text: "A kid keeps spending all their allowance the day they get it, every week.",
      ask: "And then what happens by the end of the week? Why?",
      answer: "They run out of money and can't buy anything until next allowance.",
      why: "Money out with nothing saved means an empty pocket later. The effect is baked into the choice. Thinking ahead to 'and then what?' is how you spot a trap before you're in it." }
  ],
  backward: [
    { text: "You come downstairs and the kitchen floor is covered in water near the sink.",
      ask: "What could have CAUSED this? Name a likely cause and how you'd check.",
      answer: "A leaking or overflowing sink/pipe. Check if the tap was left on or a pipe is dripping.",
      why: "You didn't see it happen, but you can reason backward from the puddle to what makes puddles. A good thinker lists likely causes, then checks \u2014 instead of just guessing the first idea." },
    { text: "Your bike was working fine yesterday. Today the back wheel won't turn.",
      ask: "What might have caused it? Give a cause you could test.",
      answer: "Something is jammed in the wheel, the brake is stuck, or the chain slipped.",
      why: "Work back from the effect: a wheel that won't turn is usually being held by something. List the things that could grab a wheel, then look. Reasoning backward turns a mystery into a checklist." },
    { text: "A plant on a sunny shelf has leaves that all lean toward the window.",
      ask: "What caused the leaves to lean that way? Why does that make sense?",
      answer: "The light from the window. Plants grow toward the light they need.",
      why: "The effect (leaning one way) points at its cause (light from one side). When an effect has a direction or pattern, the cause usually does too \u2014 follow the clue back to its source." },
    { text: "Your friend was laughing hard at lunch and then suddenly got the hiccups.",
      ask: "What probably caused the hiccups? How could you find out for sure?",
      answer: "Laughing/eating fast gulped air, which set off the hiccups. Ask what they were doing right before.",
      why: "Reason from the effect back to what came just before it that could DO it. 'What changed right before?' is the question that finds most causes \u2014 but you still confirm, you don't assume." },
    { text: "Every morning the grass in one yard is wet, even on days it didn't rain.",
      ask: "What's a likely cause besides rain? How would you check?",
      answer: "A sprinkler on a timer, or morning dew. Watch early to see if a sprinkler runs.",
      why: "When the obvious cause (rain) is ruled out, don't stop \u2014 there's always another cause doing the work. List the other ways grass gets wet, then go look. The wrong first guess isn't the end of thinking." }
  ],
  chain: [
    { text: "These got mixed up:  (a) the plant grew  (b) you planted a seed  (c) you watered it and the sun shone",
      ask: "Put them in order: first -> then -> so. Why is that the order?",
      answer: "b (plant a seed) -> c (water + sun) -> a (it grows).",
      why: "Each step has to come before it can cause the next: no seed, nothing to water; no water and sun, nothing grows. A chain only works in the order where each cause sets up the next effect." },
    { text: "Mixed up:  (a) you felt warm and cozy  (b) you got cold outside  (c) you came in and put on a sweater",
      ask: "Order them first -> then -> so, and say why.",
      answer: "b (got cold) -> c (put on a sweater) -> a (felt cozy).",
      why: "The cold is what makes you reach for the sweater, and the sweater is what makes you cozy. Find the FIRST cause \u2014 the thing that started it \u2014 and the rest lines up behind it." },
    { text: "Mixed up:  (a) the floor got slippery  (b) someone wiped it up  (c) milk spilled on the floor",
      ask: "Put the events in order first -> then -> so. Explain the order.",
      answer: "c (milk spilled) -> a (floor got slippery) -> b (wiped it up).",
      why: "Each event is caused by the one before it: spill makes it slippery, slippery makes someone clean it. Ask 'what had to happen first for the next thing to make sense?' and the chain sorts itself." },
    { text: "Mixed up:  (a) you weren't hungry at dinner  (b) you ate a big snack at 5pm  (c) you said no thanks to dinner",
      ask: "Order them first -> then -> so. Why does it go that way?",
      answer: "b (big snack) -> a (not hungry) -> c (said no to dinner).",
      why: "The snack fills you up, full means not hungry, not hungry leads to skipping dinner. One choice early can quietly cause a chain of things later \u2014 worth noticing before you make it." },
    { text: "Mixed up:  (a) the team lost the game  (b) the star player got hurt and sat out  (c) the player tripped at practice",
      ask: "Put them in order first -> then -> so. Why?",
      answer: "c (tripped at practice) -> b (hurt, sat out) -> a (team lost).",
      why: "Trace it link by link: the trip caused the injury, the injury caused the benching, the benching helped cause the loss. But notice \u2014 'helped cause' isn't 'guaranteed.' Even a real chain can have other things pushing on it too." }
  ],
  coincidence: [
    { text: "\"Every time I bring my umbrella, it doesn't rain. So my umbrella STOPS the rain!\"",
      ask: "Did the umbrella really cause the dry weather? Why or why not?",
      answer: "No \u2014 an umbrella can't change the sky. The dry days and the umbrella just happened together.",
      why: "Ask the killer question: could this thing ACTUALLY do that job? An umbrella can't push clouds around. Two things lining up isn't proof one caused the other \u2014 that's the oldest trick there is." },
    { text: "\"I ate cereal this morning and then aced my spelling test. The cereal made me smart!\"",
      ask: "Did the cereal cause the good score? What really did?",
      answer: "No \u2014 studying and knowing the words did. The cereal came before, but didn't do the work.",
      why: "'It happened after, so it caused it' is a trap. Lots of things happened that morning. The cause of a good test is the studying that actually built the knowing \u2014 not whatever you ate first." },
    { text: "An ad: \"People who drink FizzCola smile more in our photos. Drink FizzCola to be happier!\"",
      ask: "Does the drink really cause the happiness? What's the catch?",
      answer: "No \u2014 they picked smiling photos on purpose. The drink didn't make them happy.",
      why: "They chose the happy pictures, then pointed at the drink. The smile and the can are near each other, but the can didn't cause the smile. Ads love to stand next to good feelings and take the credit." },
    { text: "\"The rooster crows, and then the sun comes up. So the rooster's crow makes the sun rise.\"",
      ask: "Does the crow cause the sunrise? How do you know?",
      answer: "No \u2014 the sun would rise even if the rooster stayed quiet. The crow just comes first.",
      why: "Test it in your head: if the rooster slept in, would the sun stay down? Of course not. 'Comes first' is not 'causes.' A tiny rooster can't move the sun \u2014 check whether the cause is even big enough to do the job." },
    { text: "\"Ice cream sales go up in summer, and so do bee stings. So ice cream must attract bees to sting people!\"",
      ask: "Is ice cream really causing the stings? What's the real reason both go up?",
      answer: "No \u2014 hot summer weather causes BOTH. People eat more ice cream AND go outside near bees more.",
      why: "Sometimes two things rise together because a THIRD thing causes both. Hot weather drives the ice cream and the bee time. When two things move together, ask: is one causing the other, or is something behind them pushing both?" }
  ]
};

/* ---- cause_effect_chains layout (mirrors logic_deduction row layout) ---- */
function ceRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function ceRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    forward: "AND THEN WHAT?", backward: "WHAT CAUSED THIS?",
    chain: "PUT IT IN ORDER", coincidence: "DID IT REALLY CAUSE IT?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

window.TEMPLATES.says_who = {
  id: "says_who",
  label: "Says who? (checking claims & evidence)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Evidence, sources & evaluating claims",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "howKnow",   label: "How do you KNOW? (checked it vs. someone said it)" },
        { value: "saysWho",   label: "Says who? (who's the source — and could they be wrong?)" },
        { value: "everybody", label: "\"Everybody knows...\" (does saying it loud make it true?)" },
        { value: "changeMind", label: "What would change your mind? (testing a claim)" },
        { value: "mixed",     label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["howKnow", "saysWho", "everybody", "changeMind"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = swShuffle(SW_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Says Who?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Anyone can SAY anything. The question a sharp thinker asks is: how would we actually KNOW? There's a big difference between \"I checked it myself\" and \"somebody told me.\" Who is saying it, and could they be wrong — or want you to believe it? \"Everybody knows\" is not proof; saying something louder or more often doesn't make it true. For each one, don't just agree or disagree — figure out what would actually settle it.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"My friend SWEARS that touching a frog gives you warts.\"  ->  Says who? A friend repeating something they also just heard. That's not the same as KNOWING. How could we actually check? Look it up from people who study frogs, or notice that lots of kids touch frogs and don't get warts. A confident voice isn't evidence — the check is.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 92);
    }

    content.items.forEach((it, idx) => {
      const needed = swRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = swRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- says_who content banks ---- */
function swShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the claim / situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const SW_BANKS = {
  howKnow: [
    { text: "\"The big rock by the creek is too heavy for any kid to lift.\"",
      ask: "How could you KNOW this for real — not just guess?",
      answer: "Go try to lift it yourself, or watch someone try. Checking beats guessing.",
      why: "Some claims you can test with your own hands today. 'Too heavy' is one of them — don't take it on faith, go find out. Knowing because you CHECKED is the strongest kind of knowing." },
    { text: "Two kids argue: one says the slide is hot, the other says it's cool.",
      ask: "Who's right — and how would you settle it without arguing?",
      answer: "Touch the slide. The one who checked wins; arguing louder doesn't.",
      why: "When people disagree about something you can check, stop arguing and go look. The world settles it, not whoever talks the most. That's how a sovereign thinker ends a fight — with the facts." },
    { text: "\"There are exactly 12 apples left in the bowl.\"",
      ask: "Is this something you can KNOW for sure? How?",
      answer: "Yes — count them yourself. A count is a check anyone can repeat.",
      why: "A number you can count is checkable. Don't just trust the bowl — count it. If someone's number is off, the apples will tell you, not their confidence." },
    { text: "\"It's freezing cold outside right now.\"",
      ask: "How could you find out if that's really true?",
      answer: "Step outside and feel it, or read a thermometer.",
      why: "'Cold' can mean different things to different people, so check it two ways: feel it AND read a number. Your own senses plus a measurement beats a single guess." },
    { text: "Someone tells you the new kid is 'really mean.'",
      ask: "Do you KNOW that yet? How would you find out for yourself?",
      answer: "No — that's one person's report. Talk to the new kid yourself and watch.",
      why: "Hearing it isn't knowing it. People pass along opinions like facts. Meet the person yourself before you decide — you might've been handed someone else's grudge." }
  ],
  saysWho: [
    { text: "\"This candy is the healthiest snack in the world!\" — printed on the candy's own wrapper.",
      ask: "Says who? Why does it matter WHO is saying this?",
      answer: "The company selling it. They want your money, so they're not a fair judge.",
      why: "The source has a reason to say it — they profit. When someone gains from you believing them, weigh their claim with extra care. Always ask who's talking and what they get out of it." },
    { text: "A weather report says it will rain tomorrow.",
      ask: "Says who — and is this a source worth trusting? Why?",
      answer: "People who study weather with tools. Pretty trustworthy, but they can still be wrong.",
      why: "A good source isn't perfect, but it has a real method behind it — tools, training, a track record. Trust it MORE than a wild guess, but stay ready to be surprised. No source is magic." },
    { text: "\"My older brother says the moon is made of cheese.\"",
      ask: "Says who? Should an older kid be believed just because they're older?",
      answer: "His brother — being older doesn't make him right. Check it from people who study the moon.",
      why: "Older, bigger, or louder doesn't equal correct. Even people you look up to repeat wrong things. Judge the claim by the evidence behind it, not by who said it." },
    { text: "A sign at the park: \"Danger — thin ice. Do not walk on the pond.\"",
      ask: "Says who? Is this a source you'd listen to? Why?",
      answer: "The people who care for the park and saw the ice. Worth listening — the cost of being wrong is high.",
      why: "Not every source is selling you something — some are warning you. When a source has nothing to gain and the danger is real, listen first and question later. Smart trust isn't the same as no trust." },
    { text: "An ad: \"Doctors recommend ZoomVitamins!\" (but it doesn't say which doctors).",
      ask: "Says who, exactly? What's missing from this claim?",
      answer: "No real names — 'doctors' is vague. Maybe one, maybe paid, maybe none.",
      why: "A blurry source is a red flag. 'Doctors say' with no name, no count, no proof is built to SOUND trustworthy while hiding who's actually talking. Ask for the real source — if it's hidden, ask why." }
  ],
  everybody: [
    { text: "\"Everybody knows this band is the best ever. You're weird if you don't like them.\"",
      ask: "Does 'everybody knows' make it true? What's really going on here?",
      answer: "No — 'best' is an opinion, and 'everybody' is pressure, not proof.",
      why: "'Everybody knows' is a trick to skip the proof and rush you into agreeing. Even if a million people like something, that's a popularity count, not a fact. You're allowed to like what you like." },
    { text: "Lots of kids at school are sure that the gym is haunted because 'everyone says so.'",
      ask: "Does lots of people saying it make it true? How could you actually check?",
      answer: "No. Repeated stories aren't evidence. Look for what's really making the noises.",
      why: "A story passed around enough starts to FEEL true — but feeling true and being true are different. Trace it back: where did it start, and is there any actual proof? Crowds can be wrong together." },
    { text: "\"All the cool kids stay up past midnight, so it must be a good idea.\"",
      ask: "Does 'all the cool kids do it' make it smart? Why or why not?",
      answer: "No — lots of people doing something doesn't make it good for you.",
      why: "Popular and wise are not the same thing. 'Everyone's doing it' tells you what's common, not what's good. Decide on the actual reasons — your sleep, your day — not on the crowd." },
    { text: "\"It's just common sense that the bigger team always wins.\"",
      ask: "Is 'common sense' the same as proof? How would you check this one?",
      answer: "No — look at real games. Smaller teams beat bigger ones all the time.",
      why: "'Common sense' often means 'something everybody assumes and nobody checked.' Test it against the real world — the scoreboard, not the saying. Lots of 'common sense' falls apart when you actually look." },
    { text: "A kid says, \"My whole class agrees the test was unfair, so it WAS unfair.\"",
      ask: "Does everyone agreeing prove it? What would actually show it was unfair?",
      answer: "No — a hard test feels unfair to many. 'Unfair' needs a real reason, like a question on stuff never taught.",
      why: "Agreement spreads feelings fast. To call something unfair you need a specific reason, not just a shared groan. Ask 'what exactly was wrong?' — a real answer beats a loud one." }
  ],
  changeMind: [
    { text: "\"Plants don't need light to grow — they just need water.\"",
      ask: "What test could PROVE this right or wrong? What would change your mind?",
      answer: "Grow one plant in light and one in a dark box, same water. The dark one will struggle.",
      why: "A real thinker names what would change their mind BEFORE arguing. Set up a fair test — change one thing, keep the rest the same — and let the result decide. Being willing to be wrong is a superpower." },
    { text: "You believe your bike is faster than your friend's bike.",
      ask: "What would actually settle it? What result would make you admit you were wrong?",
      answer: "Race them on the same path, take turns on each bike. If theirs wins twice, yours isn't faster.",
      why: "Pick the test and the losing condition first — 'if it happens twice, I was wrong.' That keeps you honest. If you can't say what would change your mind, you're not thinking, you're just cheering." },
    { text: "\"This jar of jellybeans has more red ones than any other color.\"",
      ask: "How could you test it? What result would prove the claim wrong?",
      answer: "Sort and count by color. If another color has more, the claim is wrong.",
      why: "A clear claim can be checked with a clear test. Counting is the judge. Notice how good it feels to KNOW instead of argue — that's what evidence gives you." },
    { text: "\"You can't balance an egg on its end. It's impossible.\"",
      ask: "How would you test 'impossible'? What single result would change your mind?",
      answer: "Try it carefully many times. One success proves 'impossible' wrong.",
      why: "'Impossible' is a huge claim — it only takes ONE success to break it. Before you believe a never-ever claim, ask what would disprove it, then go try. Big claims need big evidence." },
    { text: "A friend insists the longer line at the store always moves faster.",
      ask: "What would actually test this? What result would change their mind?",
      answer: "Time several lines on different days. If short lines often win, the rule is false.",
      why: "Don't argue from one lucky memory — gather more than one try. A claim that's true should hold up again and again. If it only worked once, it was luck wearing a rule's costume." }
  ]
};

/* ---- says_who layout (mirrors cause_effect_chains row layout) ---- */
function swRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function swRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    howKnow: "HOW DO YOU KNOW?", saysWho: "SAYS WHO?",
    everybody: "\"EVERYBODY KNOWS\"", changeMind: "WHAT WOULD CHANGE YOUR MIND?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The claim / situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — TRADE-OFFS (every choice has a cost)
   Sovereign-thinking: there is no "free," no "best of both."
   Every yes is also a no. The skill is naming what you give up
   (opportunity cost), spotting "have it all" tricks, and noticing
   that an unexamined choice is one someone else made for you.
============================================================ */
window.TEMPLATES.trade_offs = {
  id: "trade_offs",
  label: "Trade-offs (every choice has a cost)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Decision reasoning, opportunity cost & trade-offs",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "giveUp",    label: "What do you give up? (every yes is a no)" },
        { value: "worthIt",   label: "Is it worth it? (weigh the cost vs. the gain)" },
        { value: "noFree",    label: "Nothing is free (find the hidden cost)" },
        { value: "haveItAll", label: "\"Have it all\" trap (spot the false 'both')" },
        { value: "mixed",     label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["giveUp", "worthIt", "noFree", "haveItAll"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = toShuffle(TO_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Trade-offs";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Here's a secret grown-ups don't always say out loud: every single choice has a cost. When you say YES to one thing, you are saying NO to something else — that's just how it works, and it's not bad, it's true. There is no \"free,\" and almost never a real \"have it all.\" The trick is to NAME what you're giving up before you decide, instead of finding out later. A choice you never really looked at isn't free either — it just means someone else decided for you. For each one, figure out the real cost, then decide.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"A game is FREE to download!\"  ->  What's the real cost? Free of money, sure. But it costs your TIME, your attention, and it's built to keep you tapping and asking for more. Saying yes to hours of the game is saying no to whatever else you'd have done with those hours. \"Free\" almost always hides a cost somewhere — your job is to find where.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 92);
    }

    content.items.forEach((it, idx) => {
      const needed = toRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = toRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- trade_offs content banks ---- */
function toShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the choice / situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const TO_BANKS = {
  giveUp: [
    { text: "You have one hour before bed. You can play outside OR watch a show.",
      ask: "If you pick the show, what are you giving up? Name it.",
      answer: "An hour outside — moving, fresh air, maybe friends. The show costs you that.",
      why: "Time is the one thing you can't get more of. Every hour spent on one thing is an hour that can't be spent on anything else. Saying yes to the show is the same as saying no to outside — there's no way to do both with one hour." },
    { text: "You spend all your birthday money on a toy you want right now.",
      ask: "What did you give up by spending it all today?",
      answer: "Everything else that money could've become — saving up for something bigger, or buying later.",
      why: "Money spent is money gone. The cost isn't just the price tag — it's every OTHER thing that money could have done. Smart deciders ask 'what am I trading away?' before the cash leaves their hand." },
    { text: "A friend wants you to join their team. You'd have to quit the club you're in.",
      ask: "What are you giving up to join the team? Is the trade clear to you?",
      answer: "The club, the people in it, the time it took to get good there. That's the real cost of the team.",
      why: "Big choices trade one whole thing for another. Before you jump, picture what you're walking away from — not just what you're walking toward. Then the trade is honest, and it's YOURS." },
    { text: "You stay up late to finish a fun book.",
      ask: "What does staying up late cost you tomorrow? Name the give-up.",
      answer: "Sleep — so a slower, grumpier, foggier tomorrow. That's the price of the extra chapters.",
      why: "Costs don't always show up right away. The book feels free at night and bills you in the morning. A sharp thinker counts tomorrow's cost tonight, before deciding." },
    { text: "You can spend recess helping set up the game OR running around playing it.",
      ask: "Either way, what are you giving up? There's a cost both ways.",
      answer: "Help = less play time. Play = the setup (and maybe no game at all). Both have a cost.",
      why: "Here's the deep part: doing NOTHING is also a choice with a cost. There's no option that costs zero. Once you see that, you stop looking for the 'free' choice and start picking the trade you like best." }
  ],
  worthIt: [
    { text: "A fancy snack costs all your saved coins. A plain snack costs almost nothing.",
      ask: "Is the fancy one WORTH the extra cost to you? How would you decide?",
      answer: "Depends — how much better is it, really, and what else could those coins do? Compare gain to cost.",
      why: "'Worth it' isn't about the price alone — it's price compared to how much you actually GET. A small treat for a huge cost is a bad trade; a big joy for a tiny cost is a great one. You weigh it; nobody decides that for you." },
    { text: "You could practice an instrument an hour a day. It's boring now but you'd get good.",
      ask: "Is the boring hour worth what you'd gain? What are you trading?",
      answer: "Trading fun-now for skill-later. Worth it if you really want the skill; not if you don't.",
      why: "Some trades pay you back in the future, not today. The cost is real (boring hours) and so is the prize (being good). Only YOU can judge if the prize is worth the price — but judge it on purpose, don't just drift." },
    { text: "A line for the best ride is 40 minutes long. Other rides have no line.",
      ask: "Is the big ride worth giving up 40 minutes of other rides? How do you weigh it?",
      answer: "Count what 40 minutes of other rides would be, then ask if the one big ride beats all of them.",
      why: "Waiting IS a cost, even though no money changes hands. The real question is always 'what else could this time/money buy?' — and is this thing better than all of that? That comparison is the whole game." },
    { text: "You can buy a cheap toy that breaks fast, or a sturdy one that costs more.",
      ask: "Which is really worth more? Think past the price tag.",
      answer: "Often the sturdy one — a cheap toy you replace twice costs more in the end.",
      why: "Cheap isn't the same as worth-it. The true cost is price PLUS how long it lasts plus how much you'll enjoy it. A 'deal' that breaks is the expensive choice in disguise." },
    { text: "A show offers to let you skip ads if you watch one long ad first.",
      ask: "Is skipping the little ads worth watching one big one? How do you weigh it?",
      answer: "Add up the time either way. Sometimes the 'skip' costs more time than the ads it skips.",
      why: "People offer you trades all day long, hoping you won't do the math. Do the math. 'Worth it' is just cost vs. gain — when you actually add it up, a lot of 'great deals' aren't." }
  ],
  noFree: [
    { text: "\"Sign up FREE and get a free gift!\" says the website.",
      ask: "If it's free, what are they getting from you? Find the hidden cost.",
      answer: "Your name, email, and attention — which they sell or use to sell you stuff later.",
      why: "When something is 'free,' you are usually the thing being sold. Companies don't give away gifts for nothing. If you can't see the price, look harder — you're paying with your info, your time, or your attention." },
    { text: "A friend says, \"Just copy my homework, it's no big deal, it costs you nothing.\"",
      ask: "Does copying really cost nothing? What's the hidden price?",
      answer: "You don't learn it, so the test (and real life) costs you later. Plus it's not honest.",
      why: "'It costs nothing' is one of the most common tricks there is. Skipping the learning feels free today and charges you later when you actually need to know it. Hidden costs are still costs." },
    { text: "A free app on your tablet keeps showing ads and asking you to buy things.",
      ask: "It cost no money — so what IS it costing? Name it.",
      answer: "Your attention and time, plus a constant pull to spend money inside it.",
      why: "Free-of-money is not the same as free. The app farms your attention and tries to turn it into money. Notice what's being taken even when your wallet stays shut — that's the real cost." },
    { text: "Someone offers to do your chore for you today, 'as a favor.'",
      ask: "Favors can have a hidden cost too. What might this one cost you later?",
      answer: "They may expect a favor back, or you skip learning to do it yourself.",
      why: "Even kindness can carry a quiet cost — an unspoken 'you owe me,' or missing the chance to get good at something. You don't have to refuse help. Just SEE the cost so it doesn't surprise you." },
    { text: "A store gives away free samples at the door.",
      ask: "Why would a store give food away? What are they really after?",
      answer: "They hope a taste makes you want to buy — the sample is bait, not a gift.",
      why: "Almost nothing is given to you for free with no reason. The sample costs the store a little, hoping to earn a lot back from you. Ask 'what's in it for them?' — there's always an answer." }
  ],
  haveItAll: [
    { text: "\"Eat all the candy you want AND stay healthy — easy!\"",
      ask: "Can you really have both? Where does this 'both' break?",
      answer: "No — too much candy isn't healthy. You have to trade some candy for health, or the reverse.",
      why: "When someone promises you BOTH sides of a real trade-off, your ears should perk up. Some things genuinely pull against each other. 'Have it all' is usually a wish dressed up as a promise." },
    { text: "An ad: \"Spend more time on your phone AND get more done!\"",
      ask: "Do those two really go together, or is one stealing from the other?",
      answer: "Usually one steals from the other — more phone often means less actually done.",
      why: "Watch for 'both' claims that quietly fight each other. The hours are the same hours. When something promises you two things that compete for the same time, one of them is going to lose." },
    { text: "\"Buy now AND save money!\" shouts the sale sign.",
      ask: "Can buying ever SAVE money? When is 'both' just a trick?",
      answer: "Spending isn't saving. You only 'save' vs. a price you might never have paid anyway.",
      why: "Stores love to mash 'spend' and 'save' into one happy word. But money that leaves your pocket is spent, full stop. The only real save is the thing you DIDN'T buy. Don't let a sign do your math." },
    { text: "\"You can stay up super late AND feel great in the morning!\"",
      ask: "Is this a real 'both,' or are they hiding a trade? Which one gives?",
      answer: "It's a hidden trade — less sleep usually means a rougher morning. You can't fully have both.",
      why: "Real trade-offs don't disappear because someone says 'and.' Your body needs sleep; that need doesn't vanish. When a promise ignores a real cost, the cost is still there waiting — it just got hidden." },
    { text: "A toy is advertised as \"the cheapest AND the best one out there.\"",
      ask: "Cheapest and best at the same time — is that usually real? What's the catch?",
      answer: "Rarely. Cheap usually trades off quality. 'Best' costs something — if not money, then something else.",
      why: "Best things usually cost more for a reason. 'Cheapest AND best' is a flag to check carefully, not to trust on sight. Someone is hoping you'll hear 'both' and skip the questions. Don't skip them." }
  ]
};

/* ---- trade_offs layout (mirrors says_who row layout) ---- */
function toRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function toRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    giveUp: "WHAT DO YOU GIVE UP?", worthIt: "IS IT WORTH IT?",
    noFree: "NOTHING IS FREE", haveItAll: "\"HAVE IT ALL\" TRAP"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The choice / situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — WONDER & WHY (grown-up reads aloud)
   The critical-thinking library was locked to Grade 1+ (readers).
   Oakley (4/K) and other pre-readers had almost no sovereign-
   thinking sheet of their own. This is a READ-ALOUD worksheet:
   the grown-up reads the tiny scene + question out loud, the child
   answers by TALKING, DRAWING, or CIRCLING/POINTING — no reading
   or writing required. The child does the thinking; the paper just
   holds the prompt and a big space for their answer.

   Sovereign, curiosity-first voice: there's no "right answer to
   memorize" here — we want the child's OWN guess and, above all,
   the word "because". Every item has a grown-up script line so the
   parent knows how to ask and how to honour a real reason instead
   of steering toward a "correct" one. Modes:
     wonder    — "I wonder why...?" first-principles curiosity
     whatIf    — "what would happen if...?" prediction / imagination
     whichOne  — circle/point: which doesn't belong & WHY (pre-logic)
     noticing  — "what do you see / hear?" close observation
     mixed     — a bit of each
   Young-only: capped at Grade 1 in TEMPLATE_MAX_GRADE below.
   Deterministic, never calls AI. Mirrors the pdf* helper layout.
============================================================ */
window.TEMPLATES.wonder_why = {
  id: "wonder_why",
  label: "Wonder & Why (grown-up reads aloud)",
  subject: "reading",
  grades: ["K", "1"],
  topicHint: "Pre-reader critical thinking & curiosity (read-aloud)",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "wonder",   label: "I wonder WHY? (curiosity / first-principles)" },
        { value: "whatIf",   label: "What would happen if...? (predict / imagine)" },
        { value: "whichOne",  label: "Which one is different \u2014 and why? (circle it)" },
        { value: "noticing", label: "What do you notice? (look & listen closely)" },
        { value: "mixed",    label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of questions", default: 6, min: 3, max: 10 },
    { id: "drawBox", type: "boolean", label: "Give a big box to draw the answer in", default: true },
    { id: "showScript", type: "boolean", label: "Print the grown-up read-aloud script under each", default: true }
  ],

  generate(m) {
    const count = Math.max(3, Math.min(10, parseInt(m.count, 10) || 6));
    const modes = m.mode === "mixed"
      ? ["wonder", "whatIf", "whichOne", "noticing"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = wwShuffle(WW_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return {
      items,
      drawBox: m.drawBox !== false,
      showScript: m.showScript !== false,
      modifiers: m
    };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Wonder & Why";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "A read-aloud page \u2014 for a grown-up and a thinker who can't read yet. Read the little scene and the question OUT LOUD. Then let the child answer however they like: talk it out, draw it, or point/circle. There is no answer to memorize here. What we're really after is one magic word \u2014 \u201cbecause.\u201d Whatever they guess, ask \u201cwhy do you think so?\u201d and take their reason seriously. A kid who can say WHY is learning to think for themselves, not just repeat what they're told.",
      y, pageW, margin
    );

    content.items.forEach((it, idx) => {
      const needed = wwRowHeight(doc, it, pageW - margin * 2, content.drawBox, content.showScript, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = wwRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.drawBox, content.showScript, opts.showAnswers);
      y += 14;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- wonder_why content banks ---- */
function wwShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { scene, ask, script, think }
//   scene  = the tiny picture-in-words the grown-up sets up (large print)
//   ask    = the question to ask the child (large print)
//   script = grown-up coaching line: how to ask + how to honour a real reason
//   think  = "answer key" for the grown-up: NOT a right answer, but the KIND
//            of thinking to listen for + a good follow-up "why"
const WW_BANKS = {
  wonder: [
    { scene: "The sky is blue in the day, and dark at night.",
      ask: "Why do you think the sky changes?",
      script: "Ask it slowly, then wait \u2014 let them guess anything. When they answer, ask \u201cwhy do you think that?\u201d Don't correct; get their reason.",
      think: "Any guess is good \u2014 you're listening for a chain of thinking (\u201cthe sun goes away\u2026\u201d), not the science. Reward \u201cbecause.\u201d" },
    { scene: "Ice is hard and cold. If you hold it, it turns into water.",
      ask: "Why do you think the ice melts in your hand?",
      script: "Let them touch a real ice cube if you can. Ask, then ask \u201cwhat is your hand doing to it?\u201d",
      think: "Aim for \u201cmy hand is warm.\u201d First-principles win: warm makes cold things change. Praise noticing their OWN hand as the cause." },
    { scene: "When you drop a ball, it always falls DOWN. Never up.",
      ask: "Why do you think it never falls up?",
      script: "Try it together first. Then ask. Any theory is welcome \u2014 the point is that they NOTICED a rule that never breaks.",
      think: "You want wonder, not the word \u201cgravity.\u201d Listen for \u201cit always\u2026\u201d \u2014 spotting a rule that's always true is real thinking." },
    { scene: "Plants stay in one spot. They can't walk to find food or water.",
      ask: "Why do you think a plant doesn't need to walk around?",
      script: "Ask what a plant eats and drinks. Guide gently with \u201cwhere does it get water?\u201d if they're stuck.",
      think: "Great answers connect: sun + rain come TO the plant, so it doesn't have to go get them. Honour any \u201cbecause the sun/rain comes.\u201d" },
    { scene: "You have a shadow on a sunny day. On a cloudy day, it hides.",
      ask: "Why do you think your shadow goes away when it's cloudy?",
      script: "Do it outside if you can. Ask what makes a shadow. Follow up: \u201cwhat is the cloud doing to the sun?\u201d",
      think: "Listen for the link: no bright sun = no shadow. A kid saying \u201cthe cloud covers the sun\u201d has built a real cause-and-effect." },
    { scene: "Your tummy makes a growly noise when you are hungry.",
      ask: "Why do you think your tummy talks to you?",
      script: "Ask what the growl is trying to tell them. There's no wrong guess \u2014 you're teaching that the BODY sends signals.",
      think: "The idea to celebrate: your body tells you what it needs. \u201cIt says feed me\u201d is perfect \u2014 reading your own signals is sovereignty." }
  ],
  whatIf: [
    { scene: "Pretend it rained candy instead of water for one whole week.",
      ask: "What would happen? Tell me or draw it.",
      script: "Let them run wild first, then sneak in \u201cwould anything go wrong?\u201d to stretch it past \u201cyay candy.\u201d",
      think: "You want them to follow the idea forward \u2014 sticky streets, no water for plants. Prediction + consequences = real thinking." },
    { scene: "Imagine everybody in the world was exactly the same and liked the same things.",
      ask: "What would that be like? Would you like it?",
      script: "Ask gently. Follow up \u201cwhat would we lose?\u201d Let them decide \u2014 don't hand them the answer.",
      think: "The seed here is that different is good and it's fine to want your own things. Any honest opinion + a reason is the goal." },
    { scene: "What if you had NO bedtime and could stay up as long as you wanted?",
      ask: "What would happen the next day? Why?",
      script: "This one's fun \u2014 let them imagine it, then ask \u201chow would you feel in the morning?\u201d Let THEM find the trade-off.",
      think: "You're planting cause \u2192 effect and trade-offs: fun now, tired later. If they reach \u201cI'd be tired,\u201d that's them reasoning it out." },
    { scene: "Imagine your shoes were on the wrong feet all day.",
      ask: "What would you notice? What would you do?",
      script: "Ask what their feet would tell them. The lesson: your body notices when something's off \u2014 trust that feeling.",
      think: "Listen for \u201cit would feel weird / hurt, so I'd fix it.\u201d Noticing discomfort and acting on it is a life skill, not a wrong answer." },
    { scene: "What if you planted one little seed in a cup of dirt by a window?",
      ask: "What do you think would happen over many days?",
      script: "If you can, actually plant one. Ask what it needs. Predict together, then check reality later.",
      think: "You want a prediction (\u201cit grows!\u201d) and ideally what it needs (water, sun). Best of all: \u201clet's find out\u201d \u2014 testing beats guessing." },
    { scene: "Pretend animals could talk to us for one day.",
      ask: "Who would you ask a question, and what would you ask?",
      script: "Open and playful. Whatever they pick, ask \u201cwhy them?\u201d \u2014 the reason is the thinking.",
      think: "No wrong answers \u2014 you're rewarding curiosity and a reason behind a choice. \u201cThe dog, because I want to know if he likes his food\u201d = gold." }
  ],
  whichOne: [
    { scene: "Three of these can FLY, one cannot: a bird, a bee, an airplane, a fish.",
      ask: "Which one is different? Circle it. Then tell me WHY.",
      script: "Read all four. Let them point or circle. The circle isn't the win \u2014 the \u201cwhy\u201d is. Ask \u201chow did you know?\u201d",
      think: "Answer: the fish (it swims, doesn't fly). But accept any answer with a solid reason \u2014 a good WHY beats the \u201cexpected\u201d pick." },
    { scene: "Three of these are things you EAT, one is not: an apple, a rock, a banana, bread.",
      ask: "Which one does NOT belong? Circle it and say why.",
      script: "Read them out. Let them decide, then ask the reason. Praise the reason more than the circle.",
      think: "Answer: the rock (you can't eat it). The skill is sorting by a rule (\u201cfood vs. not food\u201d) and saying the rule out loud." },
    { scene: "Three make LIGHT, one does not: the sun, a lamp, a candle, a spoon.",
      ask: "Which one is the odd one out? Circle it. Why?",
      script: "Read slowly. Ask which ones you could see by in the dark. Let them reason to the spoon.",
      think: "Answer: the spoon. Listen for the grouping rule (\u201cthese give light\u201d). Naming the group is the thinking, not just pointing." },
    { scene: "Three of these have WHEELS, one does not: a car, a bike, a boat, a bus.",
      ask: "Which one is different? Circle it and tell me why.",
      script: "Read all four. Let them picture each. Ask \u201cwhat do the other three have?\u201d if stuck.",
      think: "Answer: the boat (floats, no wheels). A kid who says \u201cthe others roll\u201d has found the shared rule \u2014 that's the goal." },
    { scene: "Three of these are COLD, one is hot: snow, ice, a campfire, a popsicle.",
      ask: "Which one does not belong? Circle it. Why not?",
      script: "Read them out with feeling (brrr / hot!). Let them sort by feel. Ask them to say the rule.",
      think: "Answer: the campfire. You're listening for \u201cthe others are cold.\u201d Sorting by a shared quality is early logic." },
    { scene: "Three of these you do at NIGHT, one you do in the morning: sleep, dream, wake up, put on pajamas.",
      ask: "Which one is different? Circle it and say why.",
      script: "Read gently. This one's about time-of-day. Ask \u201cwhen do you do that one?\u201d",
      think: "Answer: wake up (morning). The skill is grouping by WHEN. Accept a well-reasoned surprise \u2014 the reason is what counts." }
  ],
  noticing: [
    { scene: "Look out a window right now, or picture the room around you.",
      ask: "Tell me three things you can SEE. Draw one.",
      script: "Give them time to really look. Push gently past the first thing: \u201cwhat else? what's the smallest thing you see?\u201d",
      think: "You're training close attention \u2014 the more they notice, the harder they're looking. \u201cLook closer\u201d is the whole game." },
    { scene: "Close your eyes for a moment and just listen.",
      ask: "What sounds can you hear? Which is loudest?",
      script: "Do it together, eyes shut, ten seconds. Then ask. Then ask \u201cwhich was quietest?\u201d to stretch it.",
      think: "The win is noticing sounds they usually tune out. Ranking loud/quiet adds comparing \u2014 a bonus bit of thinking." },
    { scene: "Look at your own two hands.",
      ask: "What do you notice? How are they the same and different?",
      script: "Let them study their hands. Ask \u201care they exactly the same?\u201d Guide to lines, fingers, one bigger.",
      think: "Great answers spot small differences (\u201cthis thumb is\u2026\u201d). \u201cThe same\u201d usually means \u201cI didn't look long enough\u201d \u2014 nudge closer." },
    { scene: "Think about the last thing you ate today.",
      ask: "Was it soft or crunchy? Warm or cold? What did it taste like?",
      script: "Slow them down to remember details. Ask one sense at a time. There are no wrong memories.",
      think: "You're building the habit of describing with the senses. Every detail they add is sharper noticing \u2014 that's the skill." },
    { scene: "Look at the clothes you are wearing right now.",
      ask: "What colors do you see? What is the softest part?",
      script: "Let them look down and touch. Ask \u201cwhich part is your favorite and why?\u201d",
      think: "Observation + a reasoned preference. \u201cThe hood, because it's cozy\u201d = noticing plus a WHY. Celebrate the why." },
    { scene: "Picture your favorite person's face in your mind.",
      ask: "What do you remember about it? Draw the part you remember best.",
      script: "Warm and open. Ask what made them think of that part. Any memory is right.",
      think: "This is noticing from memory \u2014 and what stands out to them tells you what they value. Follow with \u201cwhy that part?\u201d" }
  ]
};

/* ---- wonder_why layout ---- */
function wwRowHeight(doc, it, w, drawBox, showScript, showAnswers) {
  const bw = w - 24;
  doc.setFontSize(13);
  const sceneLines = doc.splitTextToSize(it.scene, bw);
  doc.setFontSize(12);
  const askLines = doc.splitTextToSize(it.ask, bw);
  let h = 20;                                  // number + top gap
  h += sceneLines.length * 16 + 6;             // large scene print
  h += askLines.length * 15 + 8;               // large question print
  if (showScript) {
    doc.setFontSize(9);
    const scriptLines = doc.splitTextToSize("Grown-up: " + it.script, bw);
    h += scriptLines.length * 11 + 6;
  }
  if (showAnswers) {
    doc.setFontSize(9.5);
    const thinkLines = doc.splitTextToSize("Listen for: " + it.think, bw);
    h += thinkLines.length * 12 + 6;
  } else if (drawBox) {
    h += 96;                                   // big draw / answer box
  } else {
    h += 26;                                   // just a talk-it-out line
  }
  return h + 10;
}

function wwRenderRow(doc, it, num, x, y, w, drawBox, showScript, showAnswers) {
  const modeTag = {
    wonder: "I WONDER WHY?", whatIf: "WHAT IF...?",
    whichOne: "CIRCLE THE DIFFERENT ONE", noticing: "WHAT DO YOU NOTICE?"
  }[it.mode] || "";

  // Number dot + mode tag
  pdfDrawNumberedDot(doc, String(num), x + 9, y + 9, 9);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 24, y + 12);
  }
  let cy = y + 28;
  const bx = x + 24;
  const bw = w - 24;

  // Scene (large print, the grown-up reads this)
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20, 20, 20);
  const sceneLines = doc.splitTextToSize(it.scene, bw);
  doc.text(sceneLines, bx, cy);
  cy += sceneLines.length * 16 + 6;

  // Question (large print)
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(33, 130, 130);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 15 + 8;
  doc.setTextColor(20, 20, 20);

  // Grown-up script line
  if (showScript) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    const scriptLines = doc.splitTextToSize("Grown-up: " + it.script, bw);
    doc.text(scriptLines, bx, cy);
    cy += scriptLines.length * 11 + 6;
    doc.setTextColor(20, 20, 20);
  }

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const thinkLines = doc.splitTextToSize("Listen for: " + it.think, bw);
    doc.text(thinkLines, bx, cy);
    cy += thinkLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else if (drawBox) {
    const boxH = 90;
    doc.setDrawColor(170); doc.setLineWidth(0.6);
    doc.roundedRect(bx, cy, bw, boxH, 6, 6, "S");
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(180, 180, 180);
    doc.text("draw or talk about your answer here", bx + 8, cy + 12);
    doc.setTextColor(20, 20, 20);
    cy += boxH + 6;
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 12, x + w, cy + 12);
    cy += 26;
  }
  return cy;
}

/* ============================================================
   TEMPLATE — FAIR? (rules, who made them, and why)
   The critical-thinking library teaches kids to question ADS,
   CLAIMS, COSTS, and CAUSES — but nothing yet teaches them to
   interrogate RULES and AUTHORITY itself. This closes that gap.
   It is NOT "obey the rule" and NOT "break the rule" — it's the
   sovereign middle: understand a rule from first principles so
   the choice about it is genuinely YOURS. Every rule was made by
   a person, for a reason, and that reason either still holds or
   it doesn't. A rule you never examined isn't yours — it's just
   someone else's decision wearing the costume of "the way things
   are." Modes:
     whoMadeIt  — every rule has an author; find them, ask their reason
     whatFor    — what is this rule actually TRYING to do? (purpose)
     whoBenefits— who does this rule help / who does it cost? (cui bono)
     isItFair   — same rule, everyone? or bent for some? spot unfairness
     stillMakesSense — good reason once, but does it still hold NOW?
     mixed      — a bit of each
   Deterministic, never calls AI. Mirrors trade_offs row layout.
============================================================ */
window.TEMPLATES.fair_rules = {
  id: "fair_rules",
  label: "Fair? (rules, who made them & why)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Reasoning about rules, authority, fairness & purpose",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "whoMadeIt",        label: "Who made this rule? (every rule has an author)" },
        { value: "whatFor",          label: "What's it FOR? (the rule's real job)" },
        { value: "whoBenefits",      label: "Who does it help / cost? (who benefits)" },
        { value: "isItFair",         label: "Is it fair? (same rule for everyone?)" },
        { value: "stillMakesSense",  label: "Does it still make sense? (good reason then — now?)" },
        { value: "mixed",            label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["whoMadeIt", "whatFor", "whoBenefits", "isItFair", "stillMakesSense"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = frShuffle(FR_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Fair? — rules, who made them & why";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Here's something worth knowing: every rule was made by a PERSON, for a REASON. Rules aren't part of the weather — nobody was born knowing them, someone decided them. That doesn't make rules bad. A lot of rules are smart and keep people safe. But a rule you never looked at isn't really yours — it's just someone else's choice that you're carrying. So for each one, don't just ask \"am I allowed?\" Ask the deeper questions: WHO made it, what is it actually FOR, who does it help, is it the same for everyone, and does the reason still hold TODAY? A rule that passes those questions is one you can keep on purpose. A rule that fails them is worth talking about — calmly, with the grown-up in charge. Understanding the rule is not the same as breaking it.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "RULE: \"No running by the pool.\"  ->  Who made it? The people who run the pool. What's it FOR? So nobody slips on wet tiles and cracks their head. Does the reason still hold? Yes — wet tiles are still slippery. So this rule makes sense, and you'd keep it even if no lifeguard were watching, because YOU understand why. That's the goal: not obeying because you'll get caught, but choosing because you see the reason.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 104);
    }

    content.items.forEach((it, idx) => {
      const needed = frRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = frRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- fair_rules content banks ---- */
function frShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the rule / situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const FR_BANKS = {
  whoMadeIt: [
    { text: "\"Bedtime is 8 o'clock.\"",
      ask: "Who made this rule? Ask them WHY 8, not 7 or 9.",
      answer: "A grown-up in your home made it — probably so you get enough sleep to feel good the next day.",
      why: "No rule falls out of the sky. Someone chose it. When you know who chose it and why, you can actually talk about it like a real person — 'here's my reason, what's yours?' — instead of just guessing or grumbling." },
    { text: "\"You must raise your hand before you speak.\"",
      ask: "Who decided this, and what problem were they trying to fix?",
      answer: "A teacher or class leader — so twenty voices don't talk at once and nobody gets heard.",
      why: "Find the author, find the reason. This one has a real reason: many people in one room can't all talk at once. Knowing that, you can see it's not about power — it's about everyone getting a turn." },
    { text: "\"No phones at the dinner table.\"",
      ask: "Who set this rule? Guess the reason they'd give if you asked.",
      answer: "Usually a parent — so the family actually talks and pays attention to each other.",
      why: "A rule is a person's decision. Ask them straight: 'what's this for?' Most fair rule-makers can tell you. If someone can't say WHY a rule exists, that itself is worth noticing." },
    { text: "\"Wash your hands before you eat.\"",
      ask: "Who's behind this rule, and what did they know that made them make it?",
      answer: "Grown-ups made it because germs on your hands can make you sick — you can't see them, but they're there.",
      why: "Sometimes the rule-maker knows something you can't see yet — like invisible germs. That's a rule made FROM knowledge, not bossiness. Learning the reason turns 'because I said so' into 'oh, that's actually smart.'" },
    { text: "\"Stop at a red light.\"",
      ask: "Who made this rule, and why would total strangers all agree to follow it?",
      answer: "People who plan roads made it; everyone follows it so cars don't crash into each other.",
      why: "Some rules everyone agrees to because they protect everyone at once — if we all stop at red, we all get home safe. That's a rule that earns its keep. Knowing the reason is why you'd stop even at 3am on an empty road." }
  ],
  whatFor: [
    { text: "\"Line up single file in the hallway.\"",
      ask: "What is this rule actually trying to DO? Name its job.",
      answer: "Keep a crowd moving without crashing, shoving, or losing anyone.",
      why: "Every rule has a job. Once you can say the job out loud, you can check if the rule actually does it. If the rule's job is 'move safely,' then the rule makes sense in a crowd — and maybe less so when you're the only one there." },
    { text: "\"Helmets on when you ride your bike.\"",
      ask: "What's the real job of this rule? What is it protecting?",
      answer: "It's protecting your head — the one part you really can't replace — if you crash.",
      why: "The job here is huge: your brain. When a rule's job is 'stop something you can never undo,' that's a rule worth keeping even when it's a little annoying. Big, permanent risks are exactly what good rules guard against." },
    { text: "\"Say please and thank you.\"",
      ask: "What's this rule FOR? Is it just being fussy, or does it do a job?",
      answer: "It's for treating people like they matter — small words that keep things kind.",
      why: "Not every rule is about safety. Some do the job of keeping people friendly to each other. That's a real job too. Ask 'what does this rule build?' — this one builds people wanting to help you back." },
    { text: "\"Don't spend all your money the day you get it.\"",
      ask: "What is this rule trying to do for you? Who does it serve?",
      answer: "It's trying to leave you options later instead of being broke — and it serves YOU, not someone else.",
      why: "The best kind of rule is one whose job is to protect YOU from a future you can't see yet. Notice: this rule's whole job is your own benefit. Those are worth keeping even when nobody's checking." },
    { text: "\"Take turns on the swing.\"",
      ask: "What's the job of this rule? What would happen with no rule at all?",
      answer: "Its job is to share fairly; with no rule, the biggest or pushiest kid just hogs it.",
      why: "Here's a secret about many rules: without them, the strongest or loudest wins by default. A 'take turns' rule exists to protect the small and patient from the big and pushy. That's the rule doing an honest job." }
  ],
  whoBenefits: [
    { text: "A store rule: \"You must walk all the way to the back for milk.\"",
      ask: "Who does this rule help — you, or the store? Why is it set up that way?",
      answer: "The store — they put milk in back so you walk past lots of other stuff and buy more.",
      why: "Ask of any rule: who wins? Sometimes a 'rule' is really just a setup that helps the person who made it, not you. That's not evil — but you should SEE it, so you decide what to buy instead of the store deciding for you." },
    { text: "A game says: \"Wait 30 minutes, OR pay $2 to keep playing now.\"",
      ask: "Who does this rule benefit? What is it really trying to get from you?",
      answer: "The game company — the wait is on purpose, built to make you pay to skip it.",
      why: "Some rules are designed to be annoying so you'll pay to escape them. That's the rule working for THEM, against your wallet. The moment you see 'this rule exists to squeeze me,' you're back in charge — you can just wait, or walk away." },
    { text: "\"Kids can't stay up late, but I (the grown-up) can.\"",
      ask: "Who does this rule help? Is there a fair reason for the difference?",
      answer: "It can be fair — kids' growing bodies need more sleep, and adults have grown-up jobs to do.",
      why: "A rule being different for different people isn't automatically unfair — sometimes there's a real reason (kids and adults genuinely need different sleep). The test is: is there an HONEST reason for the difference, or is it just 'because I'm bigger'?" },
    { text: "\"Only buy the brand-name shoes, the others aren't cool.\"",
      ask: "Who benefits if you believe this 'rule'? Who's telling you it?",
      answer: "The brand and the ads — they benefit when you pay extra for a name.",
      why: "Watch out for 'rules' that aren't real rules at all — just ideas someone planted so you'd spend more or feel less. Ask 'who benefits if I believe this?' Nobody made you agree to that one. You can un-agree." },
    { text: "\"Finish your whole plate before you leave the table.\"",
      ask: "Who does this rule serve? Could it ever work against you?",
      answer: "Meant to serve you (don't waste, eat enough) — but forcing food when you're full can work against you.",
      why: "Even a well-meant rule can have a spot where it stops helping. A rule made to stop waste is good — but eating past full isn't good for you either. Naming who a rule helps AND where it stops helping is how you talk about it fairly." }
  ],
  isItFair: [
    { text: "\"Everyone gets one cookie.\" — then one kid quietly takes three.",
      ask: "Is the RULE fair? Is what happened fair? What's the difference?",
      answer: "The rule is fair (same for all); what happened isn't — someone broke it and got more.",
      why: "A fair rule and a fair outcome aren't the same thing. The rule treated everyone equally; the cheating didn't. Notice which one broke down. Fairness lives in whether the rule is actually FOLLOWED, not just written." },
    { text: "\"You have to share your toys, but your sibling never has to share theirs.\"",
      ask: "Is this fair? What would make it fair?",
      answer: "Not fair as-is — the same rule should apply both ways. Fair = share goes both directions.",
      why: "A quick fairness test: does the rule point the same way at everyone? If 'you share' but 'they don't,' the rule isn't really about sharing — it's just aimed at you. Fair rules face everyone equally." },
    { text: "\"The winner of the race is whoever the judge LIKES best.\"",
      ask: "Is this a fair rule for a race? Why or why not?",
      answer: "Not fair — a race should be won by who's fastest, not who's liked. The rule ignores the real measure.",
      why: "A fair rule measures the thing it's supposed to measure. A race is about speed; if the 'rule' is really about favorites, it's a fake rule wearing a race costume. Ask: is this rule measuring what it claims to?" },
    { text: "\"New kids have to earn their turn; the rest already have theirs.\"",
      ask: "Is this fair to the new kid? What's a fairer version?",
      answer: "Usually not fair — a fairer rule gives newcomers a turn too, not just the old crowd.",
      why: "Rules can quietly protect whoever got there first. That's worth spotting. 'You have to earn what we were handed' isn't fairness — it's a head start dressed up as a rule. A fair version treats the new kid by the same measure." },
    { text: "\"Bigger kids go first because they're bigger.\"",
      ask: "Is 'because they're bigger' a fair reason? Test it.",
      answer: "No — being bigger isn't a reason to deserve more; it's just size. That's 'might makes right.'",
      why: "Here's a big one: 'because I'm bigger/older/stronger' is NOT a real reason for a rule — it's just power. A fair rule stands on a reason that would still make sense if you were the small one. If it only works when you're big, it's not fairness." }
  ],
  stillMakesSense: [
    { text: "A rule from long ago: \"Be home before dark because there are no streetlights.\" Now the street is fully lit.",
      ask: "Did the rule make sense once? Does the SAME reason still hold now?",
      answer: "It made sense before lights existed; now that exact reason is weaker — worth a calm talk with the rule-maker.",
      why: "Rules are made for a time and a reason. When the reason changes, it's fair to ask if the rule should too. That's not being sneaky — that's thinking. The move is to talk to whoever made it, not to just ignore it." },
    { text: "\"Save this seat for Grandma\" — but Grandma already went home an hour ago.",
      ask: "The reason for the rule is gone. Does the rule still apply? How would you check?",
      answer: "The reason left with Grandma, so probably not — but ASK first, don't just assume.",
      why: "When a rule's reason disappears, the rule usually should too — but the polite, smart move is to check with whoever made it, not decide alone. 'The reason's gone, can I sit here now?' is a great question." },
    { text: "\"No dessert until you finish dinner\" — on a day you're actually sick and can't eat.",
      ask: "The rule made sense on normal days. Does it fit THIS day? Why might it not?",
      answer: "It doesn't fit — the reason (eat your real food first) doesn't work when you're too sick to eat.",
      why: "Good rules are made for normal days. Weird days sometimes need a rethink — and the reason tells you when. If the WHY behind a rule doesn't apply today, that's exactly the moment to talk it through, calmly, with the grown-up." },
    { text: "\"Always use a calculator's exact answer\" — but the question just asks about how many buses you need for 53 kids.",
      ask: "Does following the rule exactly give a sensible answer here? When should the reason bend?",
      answer: "No — 53 kids at 40 per bus is 1.3 buses, but you can't have 1.3 buses; you need 2. Real life rounds up.",
      why: "Sometimes a rule (use the exact number) collides with the real reason behind it (get everyone on a bus). When the reason and the rule disagree, the REASON wins. Rules serve reasons, not the other way around." },
    { text: "\"You've always done homework at the kitchen table\" — but now a baby naps there every afternoon.",
      ask: "The habit made sense before. Does the situation still fit? What changed?",
      answer: "The situation changed (a napping baby); the old spot no longer fits, so the habit-rule can change too.",
      why: "Not every 'rule' is even a rule — some are just habits nobody updated. When the world around a habit changes, it's smart to ask if the habit should. Noticing 'this made sense before, but now?' is first-class thinking." }
  ]
};

/* ---- fair_rules layout (mirrors trade_offs row layout) ---- */
function frRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function frRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    whoMadeIt: "WHO MADE THIS RULE?", whatFor: "WHAT'S IT FOR?",
    whoBenefits: "WHO BENEFITS?", isItFair: "IS IT FAIR?",
    stillMakesSense: "DOES IT STILL MAKE SENSE?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The rule / situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   ESTIMATE & MEASURE — "Guess & Check" (math, Gr1-3)
   Real-world number sense as a THINKING skill, not a fact drill.
   The loop every item runs: make a reasoned GUESS first, then CHECK
   it against reality, then honestly notice the gap and ask WHY.
   That calibration habit — comparing your own prediction to what the
   world actually does, instead of accepting a handed-down answer — is
   the same sovereign thread as says_who / nature_detective, applied to
   quantity, size, distance and time.
   Modes:
     howMany  — estimate a count, then count (number sense)
     howBig   — estimate a size/length with body units, then measure
     howLong  — estimate a duration, then time it
     whichMore— reason which is more/bigger WITHOUT measuring, then check
     mixed    — a bit of each
   Deterministic, never calls AI. Mirrors says_who / trade_offs row layout.
============================================================ */
window.TEMPLATES.estimate_measure = {
  id: "estimate_measure",
  label: "Guess & Check (estimate, then measure)",
  subject: "math",
  grades: ["1", "2", "3"],
  topicHint: "Estimation, measurement & number sense",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Estimating skill",
      options: [
        { value: "howMany",   label: "How many? (guess a count, then count)" },
        { value: "howBig",    label: "How big? (guess a size, then measure)" },
        { value: "howLong",   label: "How long? (guess the time, then time it)" },
        { value: "whichMore", label: "Which is more? (reason first, then check)" },
        { value: "mixed",     label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["howMany", "howBig", "howLong", "whichMore"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = emShuffle(EM_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Guess & Check";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "A guess isn't a wild shot in the dark \u2014 it's your best thinking BEFORE you check. For each one, first write your GUESS (your estimate). Then actually CHECK it \u2014 count it, measure it, or time it in the real world. Last, notice: how close were you? A sharp thinker doesn't feel bad about a guess that's off \u2014 they ask WHY, and their next guess gets better. You don't need anyone to tell you the answer. The world will show you if you go look.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "How many steps across the kitchen?  My guess: 10 steps.  Check: I walked it \u2014 8 steps.  How close? Off by 2, pretty good. Why? My steps were bigger than I pictured. Next time I'll guess a little lower. I didn't need to be told \u2014 I found out by walking it.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 88);
    }

    content.items.forEach((it, idx) => {
      const needed = emRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = emRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- estimate_measure content banks ---- */
function emShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { prompt, checkHow, answer, why }
//   prompt   = the thing to estimate (the child writes a guess)
//   checkHow = the real-world action that settles it (the "check")
//   answer   = a plausible real-world result / range (answer key only)
//   why      = the reasoning, plain kid language, sovereign voice
const EM_BANKS = {
  howMany: [
    { prompt: "How many books are on the biggest shelf in the house?",
      checkHow: "Count them one by one, sliding your finger along.",
      answer: "Depends on the shelf \u2014 often 15 to 40. Whatever YOUR count says is the truth.",
      why: "Guessing a count first trains your eye. Then counting proves it. If your guess was way off, that's useful \u2014 it tells you your eye stretched or shrank the pile. Next guess, better." },
    { prompt: "How many spoons are in the kitchen drawer?",
      checkHow: "Open the drawer and count every spoon.",
      answer: "Usually somewhere around 8 to 20. Your count is the answer.",
      why: "You can KNOW small counts for sure \u2014 just count. Don't trust the feeling of 'a lot'; a lot could be 9 or 90. The count settles it every time." },
    { prompt: "How many steps to walk from the front door to your bedroom?",
      checkHow: "Walk it and count your steps out loud.",
      answer: "Whatever you count \u2014 and it changes with big vs. little steps.",
      why: "Here's the trick: the answer depends on YOUR step size. That's a real discovery \u2014 the number isn't fixed, it depends on the tool you measure with. Try big steps and little steps and watch the number change." },
    { prompt: "How many words are in your favorite short storybook page?",
      checkHow: "Point to each word as you count.",
      answer: "Often 30 to 100 on a page. Your count wins.",
      why: "A page 'looks' like a certain amount, but eyes fool you. Counting turns a feeling into a fact. Now you have a real number to compare the next page to." },
    { prompt: "How many red things can you find in this room?",
      checkHow: "Look around slowly and count each red thing you spot.",
      answer: "More than you first think \u2014 keep looking, small things hide.",
      why: "First guesses undercount, because you only counted the obvious ones. Looking closer almost always finds more. That gap between your quick guess and your careful count is worth noticing." }
  ],
  howBig: [
    { prompt: "How many of YOUR hand-widths across is the kitchen table?",
      checkHow: "Lay your hand flat and 'walk' it across the table, counting.",
      answer: "Maybe 6 to 12 hands \u2014 and a grown-up's hands give a different number.",
      why: "Your hand is a measuring tool you always carry. But notice: a bigger hand gives a smaller number for the SAME table. Size depends on the ruler \u2014 that's why the world invented standard units everyone shares." },
    { prompt: "How many of your feet (heel-to-toe) long is your bedroom?",
      checkHow: "Walk heel-to-toe across the room, counting each foot.",
      answer: "Often 10 to 20 of your feet. Your count is the measure.",
      why: "Heel-to-toe is an old, real way to measure \u2014 that's literally where the word 'foot' comes from. You just did what people did before rulers. The number is real, and it's tied to YOUR foot." },
    { prompt: "Which is taller: the fridge, or you with your arm stretched up?",
      checkHow: "Stand next to it, reach up, and see.",
      answer: "Try it \u2014 the fridge is often close to a reaching kid. Your look decides.",
      why: "Guess with your eyes first, then stand and check. Standing beside something beats guessing from across the room \u2014 your eyes shrink faraway things and stretch close ones." },
    { prompt: "How many cups of water fill the biggest pot in the kitchen?",
      checkHow: "Fill a cup, pour it in, and count how many it takes.",
      answer: "Maybe 6 to 16 cups. Pouring and counting settles it.",
      why: "You can't eyeball volume well \u2014 tall and skinny fools everyone. The only honest way is to pour and count. Your guess vs. the real count teaches you how deep 'big' really is." },
    { prompt: "How far can you jump from a standing start \u2014 in your own feet?",
      checkHow: "Mark your start, jump, then measure the gap heel-to-toe.",
      answer: "Often 3 to 6 of your own feet. Measure it and see.",
      why: "Guess before you jump \u2014 then jump and measure. People almost always guess they can jump farther than they do. Noticing that gap honestly is how you learn what your body can really do." }
  ],
  howLong: [
    { prompt: "How many seconds can you hold your breath? (Guess first!)",
      checkHow: "Have someone count seconds out loud while you hold it.",
      answer: "Often 15 to 40 seconds for a kid. The count is the truth.",
      why: "Your guess about your own body is just a feeling until you test it. Timing it turns the feeling into a real number \u2014 and lots of kids are surprised they last longer OR shorter than they thought." },
    { prompt: "How long does it take to walk to the mailbox and back?",
      checkHow: "Time it with a clock or count 'one-Mississippi' out loud.",
      answer: "Maybe 30 seconds to a few minutes. Timing it settles it.",
      why: "Time feels stretchy \u2014 a boring wait feels long, a fun trip feels short. That's why we CHECK with a clock instead of trusting the feeling. The clock doesn't get bored." },
    { prompt: "How many times can you clap in 10 seconds? (Guess, then try.)",
      checkHow: "Have someone time 10 seconds while you clap and count.",
      answer: "Often 25 to 50 claps. Your count is the answer.",
      why: "This one flips it: the TIME is fixed, and you find out how much fits in it. Guessing first, then counting, shows you how fast 10 seconds really goes \u2014 usually faster than you'd think." },
    { prompt: "How long does it take you to tidy up all your toys?",
      checkHow: "Start a timer, tidy, and stop it when you're done.",
      answer: "Whatever the timer says \u2014 often less than the dread makes it feel.",
      why: "The job usually FEELS longer than it is. Timing it once gives you the real number \u2014 and knowing 'it's only 4 minutes' makes it easier to just start. You measured your way out of the dread." },
    { prompt: "How long can you balance on one foot? (Guess your best.)",
      checkHow: "Have someone count seconds while you balance.",
      answer: "Often 10 to 60 seconds. Time it and see \u2014 then try to beat it.",
      why: "A guess about yourself is a hypothesis. Testing it gives you a real starting number, and now you can practice and watch it grow. That's you measuring your own progress \u2014 no report card needed." }
  ],
  whichMore: [
    { prompt: "Which has more: a handful of rice, or a handful of big marshmallows?",
      checkHow: "Count each handful (or line them up) to check.",
      answer: "Way more grains of rice \u2014 small things pack in by the hundreds.",
      why: "'A handful' is the same SPACE, but tiny things fill it with far more pieces. Big things look like 'more' but are fewer. Your eyes judge size; counting judges number \u2014 and they don't always agree." },
    { prompt: "Which is more: 3 quarters, or 8 pennies? (Reason it out first.)",
      checkHow: "Add up the value of each \u2014 count in cents.",
      answer: "3 quarters = 75\u00a2, 8 pennies = 8\u00a2. The 3 coins are worth more.",
      why: "MORE COINS isn't more money. A few big-value coins beat a pile of small ones. Never let 'a bigger pile' fool you \u2014 what matters is the value, not the count." },
    { prompt: "Which is taller when poured out: a tall skinny glass, or a short wide cup \u2014 same water?",
      checkHow: "Pour the same water into each and compare, then pour back.",
      answer: "Same water either way \u2014 the tall glass just LOOKS like more.",
      why: "This one's a trick your eyes fall for every time. Tall-and-skinny screams 'more' but it's the same water. Pouring it back and forth proves the amount didn't change \u2014 only the shape did." },
    { prompt: "Which pile has more: 10 stacked blocks, or 10 blocks spread out in a line?",
      checkHow: "Count both piles.",
      answer: "Exactly the same \u2014 10 is 10 no matter how it's arranged.",
      why: "Spreading things out makes them LOOK like more, but the number never changed. Counting proves it. People (and ads) use 'spread out to look bigger' all the time \u2014 now you'll spot it." },
    { prompt: "Which is farther: across your yard, or around the whole outside of your house?",
      checkHow: "Pace off each one heel-to-toe and compare the counts.",
      answer: "Around the house is usually much farther \u2014 four sides add up.",
      why: "'Around' means adding up every side, so it's almost always more than straight 'across.' Guessing first, then pacing it, shows you how much the going-around adds \u2014 a real number, not a feeling." }
  ]
};

/* ---- estimate_measure layout (mirrors says_who row layout) ---- */
function emRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const promptLines = doc.splitTextToSize(it.prompt, w - 24);
  const checkLines = doc.splitTextToSize("Check it: " + it.checkHow, w - 24);
  let h = 16;
  h += promptLines.length * 13 + 6;
  h += checkLines.length * 12 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 20;              // "My guess:" line
    h += 20;              // "What I found:" line
    if (explain) h += 22; // "How close? Why?" line
  }
  return h + 8;
}

function emRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    howMany: "HOW MANY?", howBig: "HOW BIG?",
    howLong: "HOW LONG?", whichMore: "WHICH IS MORE?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The thing to estimate
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const promptLines = doc.splitTextToSize(it.prompt, bw);
  doc.text(promptLines, bx, cy);
  cy += promptLines.length * 13 + 6;

  // How to check it
  doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(70, 70, 70);
  const checkLines = doc.splitTextToSize("Check it: " + it.checkHow, bw);
  doc.text(checkLines, bx, cy);
  cy += checkLines.length * 12 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    // "My guess:" line
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(90, 90, 90);
    doc.text("My guess:", bx, cy + 2);
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx + doc.getTextWidth("My guess: ") + 6, cy + 4, x + w, cy + 4);
    cy += 20;
    // "What I found:" line
    doc.text("What I found:", bx, cy + 2);
    doc.line(bx + doc.getTextWidth("What I found: ") + 6, cy + 4, x + w, cy + 4);
    cy += 20;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("How close? Why?", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("How close? Why? ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — WHOSE STORY IS THIS? (framing & spin literacy)
   Sovereign-thinking: the deepest manipulation isn't lying — it's
   telling only-true things, but PICKED and WORDED to steer you.
   Same facts, two tellings. The skill: notice the loaded words,
   notice what got left OUT, and ask "who wants me to feel this
   way, and what am I NOT being shown?" Nobody lied — and you were
   still moved. That's the trick worth seeing.
============================================================ */
window.TEMPLATES.whose_story = {
  id: "whose_story",
  label: "Whose story is this? (framing & spin)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Framing, word choice & what gets left out",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "twoTellings", label: "Same facts, two tellings (which words steer you?)" },
        { value: "leftOut",     label: "What got left OUT? (the missing half of the story)" },
        { value: "loadedWords", label: "Loaded words (spot the word doing the pushing)" },
        { value: "mixed",       label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 6, min: 3, max: 12 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(3, Math.min(12, parseInt(m.count, 10) || 6));
    const modes = m.mode === "mixed"
      ? ["twoTellings", "leftOut", "loadedWords"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = wsStoryShuffle(WS_STORY_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Whose Story Is This?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "The sneakiest way to steer someone is not to lie — it's to tell only TRUE things, but pick which ones and word them just so. Same event, two tellings, and you end up feeling two different ways. A sharp thinker notices the pushy words, notices what got left OUT, and asks: who wants me to feel this, and what am I not being shown? Nobody lied — and you were still moved. That's the trick to catch.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "A: \"The team FINALLY won a game after weeks of losing.\"   B: \"The team won again, keeping their season alive!\"  ->  Both are true — the team won. But A picks 'finally' and 'weeks of losing' to make them look weak; B picks 'again' and 'alive' to make them look strong. Same win. Which words are doing the steering? 'Finally' and 'again.' Ask: what did each teller want me to feel?",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 104);
    }

    content.items.forEach((it, idx) => {
      const needed = wsStoryRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = wsStoryRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 14;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- whose_story content banks ----
   twoTellings items: { a, b, ask, answer, why }   (a/b = two tellings of the same facts)
   leftOut items:     { text, ask, answer, why }   (a rosy telling; what's missing?)
   loadedWords items: { text, ask, answer, why }   (one telling; which word is pushing?)
*/
function wsStoryShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

const WS_STORY_BANKS = {
  twoTellings: [
    { a: "\"Only 3 kids showed up to the bake sale.\"",
      b: "\"A close group of 3 kids ran the whole bake sale themselves!\"",
      ask: "Same 3 kids. Which telling makes it sound like a flop, and which like a win? What word does the steering?",
      answer: "A ('only') makes it a flop; B ('themselves!') makes it a win. Both true — 3 kids came.",
      why: "'Only' shrinks it; 'themselves' celebrates it. Nobody lied about the number — they just chose the frame. When someone hands you a feeling, check the bare fact underneath: 3 kids. You decide what that means." },
    { a: "\"He's already read 4 books this month.\"",
      b: "\"He's only read 4 books this month.\"",
      ask: "Same 4 books. One word flips it. Which word, and how does each make you feel about him?",
      answer: "'Already' makes 4 sound impressive; 'only' makes 4 sound lazy. The fact is identical.",
      why: "One tiny word — 'already' vs 'only' — decides whether you're proud of him or disappointed. Watch for these little steering words. The number never changed; someone just aimed it at you." },
    { a: "\"The new park rule bans skateboards to keep little kids safe.\"",
      b: "\"The new park rule stops older kids from skateboarding where they've always skated.\"",
      ask: "Both describe the SAME rule. What does each teller want you to feel — and who do they seem to be rooting for?",
      answer: "A roots for little kids (rule = protection); B roots for skaters (rule = loss). Same rule, two sides shown.",
      why: "The rule is one thing; each telling shines a light on a different person it affects. Neither is a lie — but each hides the other half. Ask 'who ELSE does this touch?' to see the whole board." },
    { a: "\"She spent all afternoon fixing her bike instead of playing.\"",
      b: "\"She spent all afternoon learning to fix her own bike.\"",
      ask: "Same afternoon. Which telling sounds like a waste, which like a smart move? What got swapped?",
      answer: "A frames it as missing out ('instead of playing'); B frames it as a skill gained ('learning'). Same afternoon.",
      why: "One teller measures what she LOST (playtime), the other what she GAINED (a skill). Both are real. When you catch yourself judging fast, ask which half you were shown — and go look at the other half yourself." },
    { a: "\"Half the class failed the quiz.\"",
      b: "\"Half the class passed the quiz.\"",
      ask: "Exactly the same result. Why do these two lines feel so different? Which would a teacher wanting more study time pick?",
      answer: "Identical fact (50/50). 'Failed' sounds alarming; 'passed' sounds fine. A teller picks whichever pushes their point.",
      why: "'Half failed' and 'half passed' are the SAME number wearing two costumes. Whoever's talking picks the costume that helps their case. Do the math yourself and the spin falls off." }
  ],
  leftOut: [
    { text: "\"Our juice is made with REAL fruit!\" (The label doesn't say how much — it's mostly water and sugar.)",
      ask: "It's true there's real fruit in it. What did they leave OUT that would change your mind?",
      answer: "How MUCH real fruit — almost none. 'Real fruit' is true but tiny; the missing amount is the whole story.",
      why: "The trick isn't the words that are there — it's the number that's missing. 'Real fruit' with no amount is built to make you fill in the blank yourself, generously. Ask 'how much?' The gap is where the steering hides." },
    { text: "\"I cleaned my whole room!\" (The closet is stuffed full and the door won't shut.)",
      ask: "The floor really is clean. What part of the room got left out of the story?",
      answer: "The closet — everything got shoved in there. 'Whole room' skips the part that's hidden.",
      why: "A true-sounding 'whole' can hide the messy part you can't see. When a story sounds complete, ask what's just out of view. The closet is always where the left-out stuff lives." },
    { text: "\"This game is FREE to play!\" (You can play, but you have to pay to unlock almost everything good.)",
      ask: "It is free to START. What did they leave out that you'd really want to know first?",
      answer: "That the fun parts cost money. 'Free to play' is true but leaves out 'not free to enjoy.'",
      why: "'Free' does a lot of heavy lifting while quietly leaving out the price of everything that matters. When something's free, ask 'free to do WHAT — and what costs money?' The left-out part is usually the real deal." },
    { text: "\"Nine out of ten kids picked our cereal!\" (They only asked ten kids, and gave them candy for answering.)",
      ask: "The number might be real. What got left out that would make you trust it less?",
      answer: "How FEW kids were asked (just 10), and that they were bribed. The tiny, rigged sample is hidden.",
      why: "A big-sounding fraction can hide a tiny, tilted sample. '9 out of 10' means nothing if it's 9 out of 10 total, chosen and bribed. Ask 'out of how many, and who picked them?' The hidden setup is the whole trick." },
    { text: "\"Everyone had an amazing time at the party!\" (Two kids left early crying and weren't mentioned.)",
      ask: "Maybe most kids did have fun. Who got left out of 'everyone'?",
      answer: "The kids who had a bad time. 'Everyone' quietly drops the ones who don't fit the happy story.",
      why: "'Everyone' is a big word that often means 'everyone I want to count.' The people left out are usually the ones who'd complicate the story. Ask 'everyone — really? Who's not in this picture?'" }
  ],
  loadedWords: [
    { text: "\"The stubborn kid REFUSED to change his answer on the test.\"",
      ask: "Which word makes him sound bad? Say the same true thing WITHOUT the pushy word.",
      answer: "'Stubborn' and 'refused' push you to dislike him. Neutral: 'He kept his original answer.' (Maybe he was right!)",
      why: "'Stubborn' and 'refused' sneak a judgement in before you've decided. Strip them out and you get the bare fact: he kept his answer. Then YOU judge — was he being pig-headed, or was he simply sure? The loaded word tried to answer that for you." },
    { text: "\"She BRAGGED that she finished her reading early.\"",
      ask: "Which word is doing the steering? What's the plain, un-pushy way to say it?",
      answer: "'Bragged' makes her sound show-offy. Neutral: 'She said she finished early.' Maybe she was just happy.",
      why: "'Bragged' vs 'said' — one word decides whether you roll your eyes or not. The teller chose it for you. Swap in the plain word and see if you still feel the same. Often the feeling walks out the door with the loaded word." },
    { text: "\"They CRAMMED forty people into the little room.\"",
      ask: "Which word makes it sound bad or crowded? What would a plain telling say?",
      answer: "'Crammed' makes it sound unpleasant. Neutral: 'Forty people were in the room.' Maybe it was cozy and fun.",
      why: "'Crammed' paints a picture — hot, tight, too many. But '40 people in a room' could be a great party. The verb did the steering. Notice the picture-painting words and ask if the plain fact really earns that picture." },
    { text: "\"The politician ADMITTED he changed his mind about the new road.\"",
      ask: "Which word makes changing his mind sound like a bad thing? Try a fairer word.",
      answer: "'Admitted' makes it sound like a guilty confession. Fairer: 'He changed his mind.' Changing your mind can be smart!",
      why: "'Admitted' treats changing your mind like getting caught. But updating what you think when you learn more is exactly what good thinkers DO. The word smuggled in a judgement — that changing your mind is shameful. It isn't." },
    { text: "\"A GANG of kids gathered by the fence after school.\"",
      ask: "Which word makes them sound scary? What's a plain word for a bunch of kids together?",
      answer: "'Gang' sounds threatening. Neutral: 'a group of kids.' They might just be friends talking.",
      why: "'Gang' vs 'group' — same kids, wildly different feeling. One word can turn friends into a threat in your mind before you've even looked. Catch the scary-sounding word and picture the plain version. Then decide with your own eyes." }
  ]
};

/* ---- whose_story layout (two tellings side-by-side for twoTellings; single block otherwise) ---- */
function wsStoryRowHeight(doc, it, w, explain, showAnswers) {
  const bw = w - 24;
  let h = 16; // number + mode tag row
  if (it.mode === "twoTellings") {
    // Two stacked labeled tellings A / B
    doc.setFontSize(10.5);
    const aLines = doc.splitTextToSize(it.a, bw - 22);
    const bLines = doc.splitTextToSize(it.b, bw - 22);
    h += aLines.length * 12 + 6;
    h += bLines.length * 12 + 8;
  } else {
    doc.setFontSize(11);
    const tLines = doc.splitTextToSize(it.text, bw);
    h += tLines.length * 13 + 6;
  }
  doc.setFontSize(10.5);
  const askLines = doc.splitTextToSize(it.ask, bw);
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    doc.setFontSize(9.5);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;
    if (explain) h += 22;
  }
  return h + 8;
}

function wsStoryRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    twoTellings: "SAME FACTS, TWO TELLINGS",
    leftOut: "WHAT GOT LEFT OUT?",
    loadedWords: "SPOT THE LOADED WORD"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  if (it.mode === "twoTellings") {
    // Telling A
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(76, 47, 110);
    doc.text("A:", bx, cy);
    doc.setFont("helvetica", "italic"); doc.setTextColor(20, 20, 20);
    const aLines = doc.splitTextToSize(it.a, bw - 22);
    doc.text(aLines, bx + 22, cy);
    cy += aLines.length * 12 + 6;
    // Telling B
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(76, 47, 110);
    doc.text("B:", bx, cy);
    doc.setFont("helvetica", "italic"); doc.setTextColor(20, 20, 20);
    const bLines = doc.splitTextToSize(it.b, bw - 22);
    doc.text(bLines, bx + 22, cy);
    cy += bLines.length * 12 + 8;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    const tLines = doc.splitTextToSize(it.text, bw);
    doc.text(tLines, bx, cy);
    cy += tLines.length * 13 + 6;
  }

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("who wants me to feel this — and what am I not being shown?", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("who wants me to feel this — and what am I not being shown? ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — SORT IT YOUR WAY (categories are made, not found)
   The library already teaches single-rule sorting (odd-one-out in
   pattern_recognition) and framing/spin (whats_missing, whose_story).
   The missing piece: the first-principles idea that CATEGORIES ARE
   HUMAN CHOICES. The same pile of things can be grouped many valid
   ways; the way someone chooses to sort is itself an argument; and
   "which box does this go in?" is a favourite lever of manipulation
   (junk-vs-treats aisles, us-vs-them labels, "healthy" stickers).
   Four thinking modes:
     manyWays   — sort the same set TWO different (both-valid) ways
     findRule   — reverse-engineer the hidden rule behind a grouping
     whereGoes  — the tricky item that fits two boxes / no box
     whoDecided — someone's labels steer you: who chose them & why?
     mixed      — a bit of each
   Deterministic, never calls AI. Mirrors trade_offs row layout.
============================================================ */
window.TEMPLATES.sort_it = {
  id: "sort_it",
  label: "Sort It Your Way (categories are chosen)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Classification logic & the made-not-found nature of categories",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "manyWays",   label: "Many ways to sort (same pile, two right answers)" },
        { value: "findRule",   label: "Find the hidden rule (why are these together?)" },
        { value: "whereGoes",  label: "Where does it go? (the box-breaker item)" },
        { value: "whoDecided", label: "Who made these labels? (categories that steer you)" },
        { value: "mixed",      label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["manyWays", "findRule", "whereGoes", "whoDecided"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = siShuffle(SI_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Sort It Your Way";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Here's something almost nobody tells you: the boxes we sort things into aren't hiding out there in the world waiting to be found — PEOPLE make them. The same pile of stuff can be sorted a dozen right ways, depending on what you decide matters. That means when someone hands you the boxes already made — \"junk vs. good,\" \"us vs. them,\" \"cool vs. lame\" — they've already made a choice FOR you, and it steers what you think. Your job here: notice that the sorting is a choice, ask who made it and why, and remember you're always allowed to sort it your own way. For each one, do the thinking, then explain it.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Pile: apple, banana, red block, red ball, orange.  ->  You could sort by KIND (fruit vs. toy): apple/banana/orange in one box, blocks/balls in the other. OR by COLOUR (red things vs. not): red block/red ball/apple, then banana/orange. Both are correct! Neither is \"the real\" sorting — you PICKED what mattered. That's the whole secret: the boxes come from you, not from the stuff.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 100);
    }

    content.items.forEach((it, idx) => {
      const needed = siRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = siRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- sort_it content banks ---- */
function siShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the pile / grouping / label the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const SI_BANKS = {
  manyWays: [
    { text: "A pile: a spoon, a fork, a crayon, a marker, a pencil.",
      ask: "Sort these TWO different ways. What did you pick to make each sorting?",
      answer: "By job: eating things (spoon, fork) vs. drawing/writing things (crayon, marker, pencil). Or by material, or by which end you hold — lots of valid ways.",
      why: "Nothing in the pile TELLS you how to sort it. You decide what matters — the job, the colour, the size — and the boxes appear. Change what matters, change the boxes. Both are right." },
    { text: "Five kids: two wear glasses, three are tall, two like soccer, one likes all three.",
      ask: "Show two different ways to split them into groups. Is either one 'the true' way?",
      answer: "By glasses/no-glasses, by tall/short, by sport/no-sport — all valid. None is 'the true' one.",
      why: "People aren't born pre-sorted. Whoever picks the trait (glasses? height? sport?) makes the groups. So whenever someone splits people into 'types,' ask: who chose that trait, and why THAT one?" },
    { text: "Your toys: a wooden car, a plastic dinosaur, a wooden boat, a plastic robot, a teddy bear.",
      ask: "Sort by ONE idea, then re-sort by a DIFFERENT idea. Name each idea.",
      answer: "By material (wood vs. plastic vs. cloth) or by what-it-is (vehicles vs. animals). Two clean, different sorts.",
      why: "The same toys jump into totally different boxes depending on the question you ask. That's proof the boxes live in your HEAD, not in the toys. You're not finding the right box — you're choosing one." },
    { text: "Snacks: apple, cookie, carrot, chips, grapes.",
      ask: "One person calls it 'healthy vs. junk.' Sort it a different way instead. What else could matter?",
      answer: "By crunchy vs. soft, by grows-on-a-plant vs. made-in-a-factory, by sweet vs. salty — many honest ways.",
      why: "'Healthy vs. junk' feels like THE way to sort snacks — but it's just ONE choice someone made. Sort by crunch or colour and the boxes flip. Notice when a sorting is handed to you as if it's the only one." }
  ],
  findRule: [
    { text: "Someone put these together: a fire truck, a stop sign, a strawberry, a ladybug.",
      ask: "What is the hidden rule? What makes them 'belong' together?",
      answer: "They're all red. The rule is colour, not what-they-are.",
      why: "To find someone's rule, ask 'what do ALL of these share that the leftovers don't?' Once you see the rule, you see what they were paying attention to — and what they were ignoring." },
    { text: "In one box: a bike, a scooter, a wagon, roller skates. Left out: a couch, a lamp.",
      ask: "What's the rule for the box? Why are the couch and lamp left out?",
      answer: "The box is 'things with wheels / things you ride.' Couch and lamp don't move you around.",
      why: "The stuff left OUT is a huge clue. A rule is really a line: in on one side, out on the other. Find the line and you've found the rule — and you can decide if it's a line you'd draw too." },
    { text: "A friend grouped: whale, bat, dog, cat. Not in the group: shark, eagle, snake.",
      ask: "What's the rule? (Hint: it's trickier than 'lives in water' or 'can fly.')",
      answer: "They're mammals (fur/hair, feed milk). Whale isn't a fish, bat isn't a bird — the rule beats appearances.",
      why: "The obvious rule (whale = water, bat = flies) is a trap. A whale swims but is a mammal; a shark swims but isn't. Good sorters look past how things LOOK to how they actually work. The real rule hides underneath." },
    { text: "Someone sorted words into two piles. Pile A: cat, run, big. Pile B: apple, rabbit, elephant.",
      ask: "What's the rule splitting A from B?",
      answer: "Pile A has one syllable (one beat); Pile B has two or three. The rule is beats, not meaning.",
      why: "A rule can be about the WORDS themselves, not what they mean — sound, length, letters. When a grouping seems weird, test rules you wouldn't expect. The rule is whatever cuts the pile cleanly." }
  ],
  whereGoes: [
    { text: "Boxes: 'Fruit' and 'Vegetable.' The item to place: a tomato.",
      ask: "Which box does a tomato go in? What if it fits BOTH — or neither box is quite right?",
      answer: "Science says fruit (it has seeds); cooking says vegetable. It fits both, depending on why you're asking.",
      why: "Some things sit right on the line. That's not a mistake in the thing — it's a hint the boxes were never perfect. When an item breaks the boxes, the boxes are the problem, not the item. You may need a new box." },
    { text: "Boxes: 'Land animals' and 'Water animals.' The item: a frog.",
      ask: "Where does a frog go? Is one box enough for it?",
      answer: "Both — a frog lives in water as a tadpole and on land as an adult. One box can't hold it.",
      why: "Real things spill out of neat boxes all the time. When something won't fit, don't force it — that's your clue that reality is richer than the two choices you were given. Ask for a better set of boxes." },
    { text: "Boxes at the store: 'Toys' and 'Books.' The item: a book that's also a puzzle you build.",
      ask: "Where does it belong? Who decides — and does the label change how you see it?",
      answer: "It's both. Whoever shelves it picks — and where it sits changes who finds it and what they call it.",
      why: "Where a thing gets filed isn't neutral. Put the book-puzzle with toys and it's 'a toy'; with books and it's 'a book.' The SAME object, two identities, decided by a shelf. Boxes don't just describe — they shape." },
    { text: "Boxes: 'Grown-up jobs' and 'Kid jobs.' The item: cooking dinner.",
      ask: "Which box? Or is this box-set itself a bit made-up?",
      answer: "Either! Kids can cook; grown-ups cook. The 'grown-up vs. kid' split is a choice people made, not a law.",
      why: "Some boxes feel real but are just habits — 'that's a grown-up thing,' 'that's for boys/girls.' When an item won't stay in its assigned box, question whether the box should exist at all. Habits aren't rules." }
  ],
  whoDecided: [
    { text: "A cereal has a big 'HEALTHY CHOICE!' badge on the front of the box.",
      ask: "Who put it in the 'healthy' box — a doctor, or the company selling it? Why does that matter?",
      answer: "The company that wants you to buy it. They chose the label; it's an ad, not a fact.",
      why: "Whoever gets to name the box gets to steer you. A company calling its own cereal 'healthy' picked the flattering box on purpose. Always ask 'who chose this label, and what do they get if I believe it?'" },
    { text: "A store puts candy and chips in an aisle labelled 'SNACKS' and hides the fruit in 'PRODUCE.'",
      ask: "Who decided candy = 'snack' and apples don't? What does that sorting make you reach for?",
      answer: "The store did, to sell more of what makes them money. The labels nudge your hand toward candy.",
      why: "The way a place is sorted is a quiet argument about what's normal. If 'snack' means candy, fruit starts to feel like 'not a snack.' The aisle labels aren't neutral facts — they're choices that shape your choices." },
    { text: "A show splits everyone into 'the cool kids' and 'the losers.'",
      ask: "Who made those two boxes? Is it a real line, or one someone drew to sell the show?",
      answer: "The writers drew it — it makes drama. In real life those boxes are made up and change all the time.",
      why: "'Cool vs. loser,' 'us vs. them' — these boxes feel obvious but someone always DREW the line, usually because it gets you watching, arguing, or belonging. A made-up line can still hurt real people. Spot who drew it." },
    { text: "A game calls some players 'winners' and everyone else 'losers' the second it ends.",
      ask: "Who decided those are the only two boxes? Are they the only ways to think about a game?",
      answer: "The game's makers did. You could also sort by 'had fun,' 'played fair,' 'got better' — richer boxes.",
      why: "Handing you only two boxes ('win/lose') is a way to control what the game means. But you can always add boxes: Did you improve? Was it fun? Were you kind? Whoever limits the boxes limits how you get to feel." }
  ]
};

/* ---- sort_it layout (mirrors trade_offs row layout) ---- */
function siRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function siRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    manyWays: "MANY WAYS TO SORT", findRule: "FIND THE HIDDEN RULE",
    whereGoes: "WHERE DOES IT GO?", whoDecided: "WHO MADE THESE LABELS?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The pile / grouping / label
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — FACT, OPINION, or GUESS?  (the sorting hat)
   Sovereign-thinking: before you can weigh a claim, you have to
   know what KIND of thing it is. A FACT can be checked and settled
   (it's the same for everyone). An OPINION is someone's taste or
   judgment ("best," "yuck," "should") — real, but not provable, and
   yours can differ. A GUESS/PREDICTION is about something not-yet-
   known (usually the future) — it can turn out right or wrong later.
   The sharp move is catching an OPINION wearing a FACT costume
   ("It's just a FACT that...") — that's how people smuggle their
   preferences past you. Sorting first keeps you from being steered.
============================================================ */
window.TEMPLATES.fact_opinion_guess = {
  id: "fact_opinion_guess",
  label: "Fact, opinion, or guess? (the sorting hat)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Telling facts, opinions & predictions apart",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "sort",       label: "Sort it: fact, opinion, or guess?" },
        { value: "costume",    label: "Opinion in a fact costume (spot the smuggle)" },
        { value: "checkIt",    label: "If it's a fact — HOW would you check it?" },
        { value: "mixed",      label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["sort", "costume", "checkIt"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = fogShuffle(FOG_BANKS[mode].slice());
      const item = pools[mode].pop();
      items.push(Object.assign({ mode }, item));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Fact, Opinion, or Guess?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Three very different things get said in the same confident voice. A FACT can be checked and settled — it's the same for everybody. An OPINION is somebody's taste or judgment (best, yuck, should) — real, but not provable, and yours is allowed to differ. A GUESS (or prediction) is about something not known yet — it can turn out right or wrong later. Sort each one first. Watch for an opinion sneaking in wearing a fact costume: starting with \"It's a FACT that...\" doesn't make it one.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"Chocolate ice cream is the best flavor, and it's a fact.\"  ->  Sort it: this is an OPINION. \"Best\" is a taste word — it's different for different people. The words \"it's a fact\" are just a costume; you can't check \"best\" the way you'd check the temperature. A fact would be \"this scoop is cold\" — you can touch it and settle it. So: opinion, no matter how confidently it's said.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 100);
    }

    content.items.forEach((it, idx) => {
      const needed = fogRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = fogRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- fact_opinion_guess content banks ---- */
function fogShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the statement the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const FOG_BANKS = {
  sort: [
    { text: "\"This rock weighs more than that leaf.\"",
      ask: "Fact, opinion, or guess? Circle one and say how you know.",
      answer: "Fact. You can put them on a scale (or in your hands) and settle it — same answer for everyone.",
      why: "A fact is checkable. Anybody who weighs them lands on the same result, so nobody's taste changes the answer. That's the mark of a fact: the world decides it, not you." },
    { text: "\"Winter is way better than summer.\"",
      ask: "Fact, opinion, or guess? What kind of word is \"better\"?",
      answer: "Opinion. \"Better\" is a taste word — a summer-lover would flip it and neither of you is wrong.",
      why: "Opinions are real feelings, but they can't be proven right or wrong. When you spot a taste word (better, best, prettiest, gross), you've usually found an opinion — and you're free to have your own." },
    { text: "\"It's going to rain tomorrow afternoon.\"",
      ask: "Fact, opinion, or guess? Can we know this for sure right now?",
      answer: "Guess (a prediction). We can't check tomorrow yet — we find out when it comes.",
      why: "A prediction is about the not-yet-known. It can be a good guess or a bad one, but it only becomes true-or-false later. Notice how a confident voice can't make the future arrive early." },
    { text: "\"There are seven days in a week.\"",
      ask: "Fact, opinion, or guess? How could someone check it?",
      answer: "Fact. Count the days on any calendar — same answer everywhere.",
      why: "Some facts are so settled we forget they're checkable, but they still are. If you doubted it, you could count. Being able to check — even when you don't need to — is what makes it a fact." },
    { text: "\"My drawing is the ugliest one in the class.\"",
      ask: "Fact, opinion, or guess? Whose judgment is this?",
      answer: "Opinion. \"Ugliest\" is a judgment — someone else might love it.",
      why: "Even when YOU say it about yourself, \"ugliest\" is still a taste-judgment, not a fact. Don't let a strong feeling disguise itself as the truth. Your opinion of your art isn't a measurement of your art." },
    { text: "\"If I plant this seed and water it, it will grow into a plant.\"",
      ask: "Fact, opinion, or guess? What makes it more than a wild guess?",
      answer: "Guess (a prediction) — but a strong one, because it's happened many times before.",
      why: "Some guesses are shaky and some are backed by patterns you've seen over and over. It's still a prediction until it happens, but a prediction with evidence behind it beats one pulled from thin air." }
  ],
  costume: [
    { text: "\"It's just a scientific FACT that our team is the greatest team ever.\"",
      ask: "Is this really a fact? What's the costume, and what's underneath it?",
      answer: "Opinion in a fact costume. \"Greatest ever\" is a taste-judgment; the words \"scientific fact\" are just dressing it up.",
      why: "People slap \"it's a fact\" on their opinions to skip the arguing and make you agree. Peek under the costume: is there something you could actually check? \"Greatest\" can't be measured, so it's an opinion wearing a badge it didn't earn." },
    { text: "\"Everybody knows broccoli is disgusting — that's just the truth.\"",
      ask: "Fact or opinion in disguise? What word gives it away?",
      answer: "Opinion in disguise. \"Disgusting\" is a taste; \"everybody knows / the truth\" is the costume.",
      why: "\"Everybody knows\" and \"that's just the truth\" are flags that someone is smuggling a feeling past you as if it were settled. Plenty of people like broccoli. Taste isn't truth, no matter how many people you claim agree." },
    { text: "\"Obviously this movie is the best one this year — it's a fact.\"",
      ask: "Strip off the costume: is there anything here you could actually check?",
      answer: "No — \"best\" can't be checked. It's an opinion; \"obviously\" and \"it's a fact\" are the disguise.",
      why: "Words like \"obviously\" try to make you feel silly for asking. Ask anyway. If you can't name a way to check it, it's an opinion, and dressing it in fact-words doesn't change that." },
    { text: "\"It's a proven fact that video games are more fun than books.\"",
      ask: "What's the taste-word hiding inside this \"proven fact\"?",
      answer: "\"More fun\" is the taste-word. Fun differs person to person, so it's an opinion — \"proven fact\" is fake armor.",
      why: "\"Proven\" and \"fact\" sound heavy and official, but they can't turn a taste into a truth. When someone armors up their opinion like this, it's often because they don't want you to notice it's just their preference." },
    { text: "\"Science says pink is the prettiest color, everyone knows it.\"",
      ask: "Does \"science says\" make \"prettiest\" a fact? Why or why not?",
      answer: "No. \"Prettiest\" is an opinion; \"science says / everyone knows\" is borrowed authority to disguise it.",
      why: "Borrowing a trusted name (\"science says,\" \"doctors say\") is a classic costume. Science can measure a color's wavelength — it can't crown a favorite. The taste-word is still doing the talking underneath." }
  ],
  checkIt: [
    { text: "\"This water is boiling hot.\"",
      ask: "If it's a fact — HOW exactly would you check it? Name the tool or test.",
      answer: "Fact. Check with a thermometer, or carefully feel the steam. Boiling has a real number (100 C at sea level).",
      why: "The power of a fact is that you can name a way to settle it. If you can point to a tool or a test, you're holding a fact. If you can't name any check, ask yourself whether it was really a fact at all." },
    { text: "\"There are more red cars than blue cars in the parking lot.\"",
      ask: "Fact — so what's the exact test to prove it?",
      answer: "Fact. Walk the lot and count reds and blues. The count settles it.",
      why: "A good check is one anyone could repeat and get the same answer. Counting is one of the most honest checks there is — it doesn't care what you were hoping for." },
    { text: "\"Our new puppy is heavier than the cat.\"",
      ask: "How would you check this instead of just guessing?",
      answer: "Fact. Weigh each one on a scale and compare the numbers.",
      why: "It's tempting to eyeball it and call it done, but a real check beats an impression. Put both on the scale — the numbers don't argue, they just tell you." },
    { text: "\"The library closes at 6 o'clock today.\"",
      ask: "It's a fact — where would you go to check it for sure?",
      answer: "Fact. Check the sign on the door, the library's posted hours, or ask a librarian.",
      why: "Facts have sources you can go to. Knowing WHERE to check is half the skill. When you can point at where the answer lives, you never have to just trust a memory or a mood." },
    { text: "\"This bridge is longer than that one.\"",
      ask: "Name a way to actually check this — no guessing allowed.",
      answer: "Fact. Measure both with a tape or steps, or look up their lengths, then compare.",
      why: "\"Longer\" sounds like a matter of opinion until you remember length is measurable. Anything you can measure with a number is a fact waiting to be checked — you just need the right tool." }
  ]
};

/* ---- fact_opinion_guess layout (mirrors says_who row layout) ---- */
function fogRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line (their sort + reason)
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function fogRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    sort: "FACT, OPINION, OR GUESS?", costume: "SPOT THE COSTUME",
    checkIt: "HOW WOULD YOU CHECK IT?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The statement
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    // "Circle one" sorting choices for young readers
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    doc.text("FACT      OPINION      GUESS", bx, cy + 2);
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 14, x + w, cy + 14);
    cy += 26;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — WHERE DOES IT COME FROM? (systems & origins)
   The critical-thinking library was strong on DECISION reasoning
   (trade-offs, fair, money), MEDIA literacy (persuasion, framing,
   fact/opinion), and LOGIC — but had a real gap: how the physical
   world actually WORKS. Kids grow up thinking food comes from the
   store, water from the tap, power from the wall, things from a
   box on the porch. That "it just appears" reflex is the root of
   dependency: if you don't know where a thing comes from, you
   can't make it, fix it, judge it, or do without it.

   This sheet trains SYSTEMS / FIRST-PRINCIPLES thinking: trace an
   everyday thing back up the chain to its real origin and the
   natural + human work that made it. Four modes:
     trace     — walk it back: store/tap/wall -> ... -> raw source
     order     — put a scrambled origin chain in the right order
     whoMade   — name the PEOPLE + WORK behind a finished thing
     whatIfGone — if one link broke, what stops? (find the weak link)
     mixed     — a bit of each
   Sovereign voice: nothing just "appears" — everything came from
   somewhere, made by someone, out of something real. Know the
   chain and you're never at the mercy of the last link.
   Deterministic, never calls AI. Mirrors trade_offs layout.
============================================================ */
window.TEMPLATES.origins = {
  id: "origins",
  label: "Where does it come from? (systems & origins)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Systems thinking, origins & how the real world works",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "trace",      label: "Trace it back (store/tap/wall -> real source)" },
        { value: "order",      label: "Put the chain in order (scrambled steps)" },
        { value: "whoMade",    label: "Who made this? (name the people + work)" },
        { value: "whatIfGone", label: "What if a link broke? (find the weak link)" },
        { value: "mixed",      label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["trace", "order", "whoMade", "whatIfGone"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = orShuffle(OR_BANKS[mode].slice());
      const item = Object.assign({ mode }, pools[mode].pop());
      // For "order" mode, pre-scramble the steps deterministically per item
      if (mode === "order" && Array.isArray(item.steps)) {
        item.scrambled = orShuffle(item.steps.map((s, ix) => ({ s, ix })));
      }
      items.push(item);
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Where Does It Come From?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Nothing just appears. The food doesn't start at the store, the water doesn't start at the tap, and the power doesn't start at the wall \u2014 those are the LAST stop, not the first. Every single thing came from somewhere, was made by someone, out of something real. When you can trace a thing back up the chain to where it actually starts, you understand it \u2014 and you're never fooled into thinking it magically shows up. For each one, follow the chain and do the thinking.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Where does BREAD come from? Trace it back: store shelf <- bakery/oven <- flour <- wheat ground up <- wheat growing in a field <- a seed + soil + sun + rain + a farmer's work. The store is just the last stop. The REAL start is a plant in the dirt and people doing work at every step. Now you know bread \u2014 and you could even make it yourself.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 96);
    }

    content.items.forEach((it, idx) => {
      const needed = orRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = orRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- origins content banks ---- */
function orShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// trace / whoMade / whatIfGone items: { text, ask, answer, why }
// order items:                        { text, ask, steps:[...ordered], answer, why }
//   text   = the thing / situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   steps  = (order mode) the correct origin chain, first -> last
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const OR_BANKS = {
  trace: [
    { text: "You turn on the tap and clean water comes out.",
      ask: "Trace the water BACK. Where was it before the tap? Keep going \u2014 where does it really start?",
      answer: "Tap <- pipes <- a treatment plant that cleans it <- a lake, river, or well <- rain/snow that fell from the sky.",
      why: "The tap is the last door, not the source. Water fell as rain, gathered in a lake, got cleaned, and got pushed through pipes to your house. Knowing that, you understand why clean water can run out, get dirty, or freeze \u2014 and you'd know how to find water if the tap ever stopped." },
    { text: "You plug something in and it turns on. Electricity from the wall.",
      ask: "Trace the power BACK from the wall. Where is it actually made?",
      answer: "Wall <- wires to your house <- power lines <- a power station that spins generators using water, wind, sun, gas, or nuclear <- some energy source.",
      why: "The wall socket makes nothing \u2014 it's the end of a very long wire. Somewhere, something is spinning a generator right now to fill that wire. That's why the power can go out, and why it costs money: someone is burning or catching energy far away to send it to you." },
    { text: "A hamburger on your plate.",
      ask: "Trace the burger BACK to where its parts really start. Name the chain.",
      answer: "Bun <- flour <- wheat <- field. Meat <- a cow <- grass/feed <- a farm. Both took land, animals/plants, and lots of people's work.",
      why: "A burger isn't one thing \u2014 it's a bundle of chains, each starting in dirt and living things. The store hides all of that behind a wrapper. See the chain and you see the true cost, the work, and the fact that food is grown and raised, never manufactured from nothing." },
    { text: "A t-shirt from a store.",
      ask: "Trace the shirt BACK. What was it before it was a shirt? Keep going.",
      answer: "Shirt <- sewn by workers <- cut cloth <- woven thread <- spun fiber <- cotton plant (or plastic from oil).",
      why: "That shirt was a plant in a field or oil in the ground, turned into thread, cloth, then sewn by real people, often far away. 'It came from the store' skips everyone who actually made it. Knowing the chain, you understand why clothes cost what they do \u2014 and that you could mend or even make one." },
    { text: "A wooden pencil.",
      ask: "Trace the pencil BACK. Where did the wood and the 'lead' come from?",
      answer: "Pencil <- factory <- wood from a tree + graphite (a rock) mined from the ground + paint & glue.",
      why: "Even something tiny is a little machine of origins: a tree grew for years, a rock was dug from the earth, and both were shaped by machines and people. Nothing here is simple or free \u2014 it just LOOKS simple because you never saw the chain." },
    { text: "Milk in the fridge.",
      ask: "Trace the milk BACK from the fridge to where it truly starts.",
      answer: "Fridge <- store <- truck <- a dairy that bottles it <- a cow being milked <- a cow eating grass on a farm.",
      why: "Milk comes out of an animal, not a carton. The carton is just the last container in a cold, fast chain that starts with a living cow and a farmer up early. Once you know that, you understand why milk spoils, why it must be kept cold, and why there's real work behind a 'cheap' jug." }
  ],
  order: [
    { text: "How PAPER is made \u2014 the steps got scrambled.",
      ask: "Number the steps 1-4 in the right order, from the very start to the finished paper.",
      steps: ["A tree grows in the forest", "The tree is cut and ground into wet pulp", "The pulp is pressed and dried flat", "It's cut into sheets of paper"],
      answer: "1) tree grows  2) ground into pulp  3) pressed & dried  4) cut into sheets.",
      why: "Order matters because each step needs the one before it \u2014 you can't dry pulp you haven't made yet. Seeing the real order tells you paper starts as a living tree, which is why paper isn't free and why reusing it saves a whole chain of work." },
    { text: "How you get to EAT AN APPLE \u2014 steps scrambled.",
      ask: "Put these in order, 1-4, from the very beginning to the apple in your hand.",
      steps: ["A seed is planted and grows into a tree", "The tree blossoms and grows apples", "A farmer picks the ripe apples", "The apples are sold and you buy one"],
      answer: "1) seed planted  2) tree grows apples  3) farmer picks  4) sold to you.",
      why: "Every step depends on the last, and the whole thing starts with a seed and years of waiting. The store is step 4 of 4 \u2014 the easy part. Real food takes time and can't be rushed, which is worth remembering the next time it seems to 'just appear.'" },
    { text: "How a HOUSE gets built \u2014 steps out of order.",
      ask: "Order these 1-4, from the first thing that has to happen to the last.",
      steps: ["The ground is cleared and a strong base (foundation) is laid", "The frame and walls go up", "The roof, windows, and doors are added", "People move in and live there"],
      answer: "1) foundation  2) frame & walls  3) roof & doors  4) move in.",
      why: "You can't put a roof on walls that don't exist yet. Big things get built from the bottom up, step by step, and skipping a step makes the whole thing fall. That's true for houses, and it's true for learning and building almost anything." },
    { text: "How RAIN comes back around \u2014 the water cycle, scrambled.",
      ask: "Put these 4 steps in order to make a loop that repeats forever.",
      steps: ["The sun heats water and it rises as invisible vapor", "The vapor cools high up and forms clouds", "The clouds get heavy and it rains or snows", "The water flows back to lakes, rivers, and the sea"],
      answer: "1) sun lifts vapor  2) clouds form  3) rain/snow falls  4) flows back \u2014 then it repeats.",
      why: "This one is a CIRCLE, not a straight line \u2014 the last step feeds the first, over and over. The same water has been cycling for millions of years. Understanding the loop is how you understand where ALL your water really comes from: the sky, on repeat." },
    { text: "How a WOOL SWEATER happens \u2014 steps mixed up.",
      ask: "Order these 1-4, from the animal to the sweater you wear.",
      steps: ["A sheep grows a thick wool coat", "The sheep is sheared (its wool is cut off, like a haircut)", "The wool is spun into yarn", "The yarn is knitted into a sweater"],
      answer: "1) sheep grows wool  2) sheared  3) spun into yarn  4) knitted into sweater.",
      why: "A warm sweater started as hair on a living animal. No sheep, no wool; no shearing, no yarn. Each step unlocks the next. Knowing the chain, you'd know a sweater can be un-knitted and re-used \u2014 and that wool is grown, not invented." }
  ],
  whoMade: [
    { text: "A slice of pizza shows up at your table.",
      ask: "Name at least THREE people whose work had to happen for this pizza to exist.",
      answer: "A farmer (wheat/tomatoes), a cheesemaker, a truck driver, the cook, maybe a miner for the oven's metal \u2014 many hands.",
      why: "One little slice is really a team you never see. Realizing how many people's work goes into ordinary things makes you notice how connected everyone is \u2014 and less likely to think stuff 'just happens' by itself." },
    { text: "The road in front of your house.",
      ask: "Who and what had to work to make this road? Name the people AND the raw stuff.",
      answer: "Engineers who planned it, workers who built it, machines, and rock/tar/sand dug from the earth.",
      why: "Even the ground you walk on was made on purpose by people, out of materials from the earth. Nothing built is an accident. Seeing the work behind 'ordinary' things is the start of being able to build and fix things yourself." },
    { text: "The book or screen you're reading right now.",
      ask: "Name the people and materials behind it. Trace it to real work and real stuff.",
      answer: "Writers, printers/engineers, factory workers, miners (metal & sand for glass), plus trees or oil for materials.",
      why: "Whatever you're reading took writers, makers, and materials dug from the earth. When you know how much work sits behind a thing, you value it more \u2014 and you understand it isn't magic, it's people plus materials plus effort." },
    { text: "A single crayon.",
      ask: "Who made it, and what is it even made of? Trace it back.",
      answer: "Wax (often from oil or plants) + color (from minerals/chemicals), mixed and molded in a factory by workers and machines.",
      why: "Even the simplest toy is wax and color from the earth, shaped by people and machines. There is no such thing as a 'simple' object once you look at where its parts came from. Everything is made of something, by someone." },
    { text: "The lunch you ate today.",
      ask: "Count the DIFFERENT people whose work fed you \u2014 from soil to plate. How many can you name?",
      answer: "Farmers, harvesters, packers, drivers, store workers, and whoever cooked it \u2014 easily five to ten people or more.",
      why: "One meal is a chain of dozens of strangers doing their part. You depend on people you'll never meet, and they depend on people too. That's not a weakness \u2014 it's how the world works. But knowing the chain means you'd also know how to feed yourself if it broke." }
  ],
  whatIfGone: [
    { text: "Your food chain: farm -> truck -> store -> your kitchen.",
      ask: "If the TRUCKS stopped for two weeks, what happens? Which link is the weak one?",
      answer: "Stores empty fast \u2014 most food travels far by truck. The 'delivery' link is weak because there's little backup.",
      why: "A chain is only as strong as its weakest link. Food may be grown fine, but if it can't MOVE, it can't reach you. Spotting the weak link tells you what to be ready for \u2014 like knowing a garden or a stocked shelf is real independence." },
    { text: "Your power: energy source -> power station -> lines -> your wall.",
      ask: "If the power LINES go down in a storm, what still works and what stops? Where's the weak link?",
      answer: "Anything plugged in stops; battery, gas, wood, and sun-powered things still work. The delivery lines are the fragile link.",
      why: "When you know the chain, a blackout isn't a mystery \u2014 you know exactly which link broke and what still works without it. People who understand their systems stay calm and ready; people who think power 'comes from the wall' just panic." },
    { text: "Water: sky -> lake -> treatment plant -> pipes -> your tap.",
      ask: "If the treatment plant broke, could you still drink the tap water safely? What's the risk?",
      answer: "Not safely \u2014 raw water can carry germs. The cleaning step is a critical link; you'd need to boil or filter water yourself.",
      why: "The invisible link (cleaning) is often the most important one. Knowing it exists tells you WHY tap water is safe and what to do if that link fails \u2014 boil it, filter it, find another source. That knowledge is the difference between helpless and prepared." },
    { text: "A phone or tablet: mined metals -> factory -> ship -> store -> you.",
      ask: "The chain crosses the whole world. Name one link that, if it broke, would stop new phones being made.",
      answer: "Any link \u2014 no mined metals, no parts; no factory, no build; no ships, no delivery. A long chain has many weak points.",
      why: "The longer and farther a chain reaches, the more places it can break \u2014 and the less control you have over it. That's worth knowing: things that come from far away, through many hands, are convenient but fragile. Short chains you can see are sturdier." },
    { text: "Your morning: alarm -> lights -> toast -> hot shower, all needing power.",
      ask: "One thing they ALL share is a hidden link. What is it \u2014 and what happens if it's gone?",
      answer: "Electricity (and for some, water). Pull that one link and most of the morning stops at once.",
      why: "Sometimes many chains secretly share ONE link. Find that shared link and you've found the thing everything depends on. That's powerful to know \u2014 it tells you what matters most and what to protect or prepare for first." }
  ]
};

/* ---- origins layout (mirrors trade_offs row layout) ---- */
function orRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (it.mode === "order" && Array.isArray(it.scrambled)) {
    h += it.scrambled.length * 15 + 6; // one line per scrambled step
  }
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    if (it.mode !== "order") h += 22; // one writing line for non-order modes
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function orRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    trace: "TRACE IT BACK", order: "PUT IT IN ORDER",
    whoMade: "WHO MADE THIS?", whatIfGone: "FIND THE WEAK LINK"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The thing / situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  // "order" mode: print the scrambled steps with a small blank box to number them
  if (it.mode === "order" && Array.isArray(it.scrambled)) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
    it.scrambled.forEach(step => {
      // little box for the child to write the step number
      doc.setDrawColor(150); doc.setLineWidth(0.6);
      doc.rect(bx, cy - 8, 12, 12);
      if (showAnswers) {
        doc.setFont("helvetica", "bold"); doc.setTextColor(180, 30, 30);
        doc.text(String(step.ix + 1), bx + 3.5, cy + 1.5);
        doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
      }
      const stepLines = doc.splitTextToSize(step.s, bw - 20);
      doc.text(stepLines, bx + 18, cy);
      cy += Math.max(15, stepLines.length * 12 + 3);
    });
    cy += 4;
  }

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    if (it.mode !== "order") {
      doc.setDrawColor(170); doc.setLineWidth(0.5);
      doc.line(bx, cy + 8, x + w, cy + 8);
      cy += 22;
    }
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE — FAIR TRADE (barter, value & voluntary exchange)
   The math library already has money_sense (coins/change/value),
   estimate_measure, and time_telling. What was MISSING is the thing
   underneath money itself: barter and voluntary exchange. Money is
   just a tool for trading; before kids reason about prices, they can
   reason from first principles about TRADES.

   This sheet teaches four things at once, and they're all sovereign:
     1. fairSwap  (arithmetic) — add up the value of each side of a
        trade and decide if it's even. Real equivalence math.
     2. bothWin   (reasoning)  — a trade only happens when BOTH sides
        think they come out ahead. Value isn't a fixed number stamped
        on a thing; it lives in the person. Two people can both "win"
        the same trade because they want different things.
     3. spotBadDeal (manipulation literacy) — someone is PUSHING a
        lopsided trade with a big smile. Do the math, name the trick,
        and know you're allowed to say no. Nobody can make you trade.
     4. whatsItWorth (subjective value) — the same thing is worth
        different amounts to different people, and in different times
        and places. "Worth" is a judgement, not a fact printed on a tag.

   Voice: a trade is only fair if BOTH sides walk away glad; do the
   math before you shake on it; and you never have to make a trade you
   don't like — walking away is always one of your moves.

   Deterministic, never calls AI. Mirrors the origins/trade_offs
   pdf* helper layout. fairSwap items are generated arithmetically so
   the numbers vary each print; the reasoning modes draw from banks.
============================================================ */
window.TEMPLATES.fair_trade = {
  id: "fair_trade",
  label: "Fair Trade (barter, value & fair swaps)",
  subject: "math",
  grades: ["1", "2", "3"],
  topicHint: "Barter, value reasoning & voluntary exchange",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Trade skill",
      options: [
        { value: "fairSwap",     label: "Even swap? (add up each side, is it fair?)" },
        { value: "bothWin",      label: "Both win? (why a good trade helps BOTH sides)" },
        { value: "spotBadDeal",  label: "Spot the bad deal (someone's pushing a lopsided trade)" },
        { value: "whatsItWorth", label: "What's it worth? (value lives in the person)" },
        { value: "mixed",        label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["fairSwap", "bothWin", "spotBadDeal", "whatsItWorth"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (mode === "fairSwap") {
        items.push(ftGenFairSwap());
      } else {
        if (!pools[mode] || pools[mode].length === 0) pools[mode] = ftShuffle(FT_BANKS[mode].slice());
        items.push(Object.assign({ mode }, pools[mode].pop()));
      }
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Fair Trade";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Long before money, people TRADED \u2014 my thing for your thing. Money is just a tool that made trading easier; underneath, it's still swaps. A trade is FAIR when both sides walk away glad they did it. Here's the trick almost nobody says out loud: the SAME thing can be worth different amounts to different people, so two people can BOTH win the same trade. Your job is to do the math on each side, decide if the swap is even, and \u2014 most of all \u2014 remember that you never have to make a trade you don't like. Walking away is always one of your moves.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Say a marble is worth 2 points and a sticker is worth 3 points. A friend offers you 3 marbles (3 \u00d7 2 = 6 points) for your 2 stickers (2 \u00d7 3 = 6 points). 6 = 6, so that's an EVEN swap \u2014 fair by the numbers. But 'fair' also means you both WANT the trade: if you're sick of marbles and love stickers, you might happily give MORE, because to YOU the stickers are worth extra. Do the math first, then decide with your own head.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 104);
    }

    content.items.forEach((it, idx) => {
      const needed = ftRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = ftRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- fair_trade helpers ---- */
function ftShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }
function ftPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// fairSwap is generated arithmetically so numbers vary each print.
// A small set of trade "goods" each carry a point-value the child adds up.
const FT_GOODS = [
  { name: "marble",  plural: "marbles",  val: 2 },
  { name: "sticker", plural: "stickers", val: 3 },
  { name: "card",    plural: "cards",    val: 4 },
  { name: "eraser",  plural: "erasers",  val: 5 },
  { name: "coin",    plural: "coins",    val: 6 }
];

function ftGoodPhrase(good, n) {
  return n + " " + (n === 1 ? good.name : good.plural) + " (worth " + good.val + " each)";
}

function ftGenFairSwap() {
  // Pick two different goods, build two sides, sometimes even, sometimes not.
  let a = ftPick(FT_GOODS), b = ftPick(FT_GOODS);
  let guard = 0;
  while (b.name === a.name && guard++ < 10) b = ftPick(FT_GOODS);
  // side A: 1-4 of good a
  const nA = 1 + Math.floor(Math.random() * 4);
  const valA = nA * a.val;
  // Decide even vs. not. If even is possible with a whole count of b, sometimes make it even.
  const wantEven = Math.random() < 0.5 && (valA % b.val === 0);
  let nB;
  if (wantEven) {
    nB = valA / b.val;
  } else {
    nB = 1 + Math.floor(Math.random() * 4);
    // avoid an accidental exact tie when we wanted it uneven
    if (nB * b.val === valA) nB = nB === 1 ? 2 : nB - 1;
  }
  if (nB < 1) nB = 1;
  const valB = nB * b.val;
  const even = valA === valB;
  const diff = Math.abs(valA - valB);
  const richer = valA > valB ? "the first pile" : "the second pile";
  let answer, why;
  if (even) {
    answer = "First pile = " + nA + " \u00d7 " + a.val + " = " + valA + ". Second pile = " + nB + " \u00d7 " + b.val +
             " = " + valB + ". " + valA + " = " + valB + ", so YES \u2014 it's an even swap.";
    why = "By the numbers it's fair \u2014 both piles add up to the same value. But 'fair by math' and 'a trade you WANT' aren't the same thing. Even when it's even, you still get to say no if you'd rather keep what you have. Even trades are allowed to be turned down too.";
  } else {
    answer = "First pile = " + nA + " \u00d7 " + a.val + " = " + valA + ". Second pile = " + nB + " \u00d7 " + b.val +
             " = " + valB + ". Not equal \u2014 " + richer + " is worth " + diff + " more, so it is NOT an even swap by the numbers.";
    why = "The math says one side is worth " + diff + " more. That doesn't automatically make it a BAD trade \u2014 maybe the smaller pile has something you want way more. But you should always KNOW when a swap is uneven, so you're choosing it on purpose instead of being fooled into it.";
  }
  return {
    mode: "fairSwap",
    text: "A friend wants to trade you " + ftGoodPhrase(b, nB) + " for your " + ftGoodPhrase(a, nA) + ".",
    ask: "Add up each side. Is it an EVEN swap by the numbers? If not, which side is worth more, and by how much?",
    answer, why
  };
}

// bothWin / spotBadDeal / whatsItWorth items: { text, ask, answer, why }
const FT_BANKS = {
  bothWin: [
    { text: "You have two red apples but no snacks you like. A friend has two granola bars and loves apples.",
      ask: "If you swap one apple for one granola bar, can you BOTH be happier? How is that possible?",
      answer: "Yes \u2014 you get a snack you like, they get an apple they love. Both walk away better off.",
      why: "This is the secret of every good trade: value lives in the PERSON, not the thing. The apple is 'worth more' to your friend and the granola bar is 'worth more' to you \u2014 so trading makes you BOTH richer, even though nothing new was made. That's not magic; that's why people trade at all." },
    { text: "You're stuffed and have a full lunch left. Your friend is starving and has a cool toy they're bored of.",
      ask: "Could a swap make you both happy? Explain why a trade can help two people at once.",
      answer: "Yes \u2014 they get food they badly want, you get a toy you want more than extra food. Both win.",
      why: "A trade isn't one person winning and the other losing. When it's done freely, BOTH sides give up something they want less for something they want more. If even one side didn't think they were winning, they simply wouldn't shake on it." },
    { text: "Two kids each have a whole pack of trading cards \u2014 but each has doubles the OTHER one is missing.",
      ask: "Why does swapping doubles make both collections better, even though no new cards appear?",
      answer: "Each gives away a card they already have for one they're missing \u2014 both collections improve.",
      why: "Nothing was created, yet both kids end up better off. That's the whole point of trading: moving things to whoever values them most. A doubled card is nearly worthless to you and precious to someone missing it \u2014 the swap unlocks value that was just sitting there." },
    { text: "A neighbour needs their lawn raked but hates raking. You'd happily rake for some of their old comic books.",
      ask: "Is this a trade where both sides win? Who gives what, and why is each side glad?",
      answer: "Yes \u2014 they trade comics (which they don't want) for work they don't want to do; you trade work for comics.",
      why: "Trades aren't only thing-for-thing \u2014 you can trade your WORK too. Each side hands over what they value less (their time, or old comics) for what they value more. That's a job, a chore-for-pay, and a barter all at once \u2014 and everyone comes out ahead." },
    { text: "You grew too many tomatoes. Your neighbour grew too many carrots. Neither of you can eat it all.",
      ask: "Why would trading some tomatoes for some carrots leave you both better off?",
      answer: "You each swap a food you have too much of for one you have none of \u2014 more variety, less waste, both happier.",
      why: "When you have plenty of one thing, the NEXT one is worth less to you \u2014 you're sick of tomatoes. Trading your extras for their extras means both families eat better and waste less. This is exactly why whole towns and countries trade: everybody grows what they're good at, then swaps." }
  ],
  spotBadDeal: [
    { text: "A big kid says: \"Give me your whole lunch and I'll give you this one chip. Great deal, trust me!\"",
      ask: "Is this a fair trade? Do the rough math, name the trick, and say what YOU would do.",
      answer: "No \u2014 a whole lunch for one chip is wildly uneven. You'd say no thanks and keep your lunch.",
      why: "A pushy 'trust me, great deal!' is a red flag, not a reason. Fair trades don't need pressure \u2014 the numbers speak for themselves. When someone rushes you or makes you feel silly for thinking, slow WAY down. You are always allowed to say no and walk away." },
    { text: "\"I'll trade you my old broken toy for your brand-new one \u2014 mine's way cooler, so it's basically even!\"",
      ask: "Is 'it's cooler' a real reason it's even? What's actually being swapped here?",
      answer: "No \u2014 broken-for-new is not even. 'Cooler' is just talk; a broken toy is worth less no matter how it's described.",
      why: "People try to win a trade with WORDS instead of value \u2014 calling junk 'cool,' 'rare,' or 'special.' Ignore the sales talk and ask the plain question: what does each side actually GET? If your side is worth more, it's a bad deal, no matter how nicely it's dressed up." },
    { text: "\"Trade me your five best cards for my one card now \u2014 or you get NOTHING, last chance!\"",
      ask: "The 'last chance!' part \u2014 is that a reason to trade? Is five-for-one fair?",
      answer: "No \u2014 five-for-one is very uneven, and 'last chance' is just pressure. Better to keep your five cards.",
      why: "'Now or never!' and 'last chance!' are tricks to stop you from thinking. A truly good trade is still good if you sleep on it. Anyone who won't let you think it over is usually hiding that the deal is bad. Real chances come back around; fake ones vanish the moment you slow down." },
    { text: "A kid offers you a shiny wrapper for your actual snack: \"But look how shiny it is!\"",
      ask: "Does shiny make it worth your snack? What's each side really worth to you?",
      answer: "No \u2014 a wrapper you can't use isn't worth a snack you'd enjoy. Shiny isn't the same as valuable.",
      why: "Shiny, new, and flashy grab your eyes \u2014 which is exactly why people use them to distract you from the value question. Always ask: what can I actually DO with this? A snack feeds you; a wrapper does nothing. Don't trade something useful for something that just LOOKS good." },
    { text: "\"Everyone at school is trading their whole allowance for these. You don't want to be left out, right?\"",
      ask: "Is 'everyone's doing it' a reason it's a fair trade? What question should you ask instead?",
      answer: "No \u2014 lots of people doing something doesn't make it a good deal. Ask what YOU actually get for your money.",
      why: "'Everyone's doing it' and 'don't be left out' aim at your feelings, not your math. A crowd can be wrong about value \u2014 that's how fads and rip-offs work. Step out of the rush and ask the boring, powerful question: is this actually worth what they want for it? Decide for yourself." }
  ],
  whatsItWorth: [
    { text: "A cold bottle of water.",
      ask: "Is it worth more to someone in the desert at noon, or someone standing by a river? Why the difference?",
      answer: "Far more to the person in the desert \u2014 they badly need it; the river person can get water for free.",
      why: "The bottle didn't change \u2014 the SITUATION did. Value isn't printed on a thing; it depends on how much someone needs or wants it right then. Understand that, and you'll see why the same item can be a bargain in one place and a rip-off in another." },
    { text: "A warm winter coat.",
      ask: "Is it worth more in January or in July? Is it worth the same to everyone? Explain.",
      answer: "Worth more in freezing January than hot July, and more to someone cold than someone who already has three coats.",
      why: "Worth swings with time, weather, and how much you already have. The tenth coat is worth almost nothing to you; the first coat to someone freezing is worth a lot. 'What's it worth?' always has a hidden second half: worth to WHOM, and WHEN?" },
    { text: "Your favourite stuffed animal from when you were little.",
      ask: "Is it worth a lot of money at a store? Is it worth a lot to YOU? Can both be true at once?",
      answer: "Probably almost nothing at a store, but a lot to you \u2014 both are true. Value to you \u2260 value to a stranger.",
      why: "Some things are priceless to you and worthless to everyone else, because value lives in the person. That's not silly \u2014 it's real. It also means don't let anyone tell you what your own things are 'worth' to you. That's yours to decide." },
    { text: "One more slice of pizza when you've already eaten four slices.",
      ask: "Is the fifth slice worth as much to you as the first slice was? Why does that matter in a trade?",
      answer: "No \u2014 the fifth is worth much less; you're already full. So you'd trade it away more easily than the first.",
      why: "The MORE you have of something, the less the next one is worth to you \u2014 that's why full people trade away food and rich collectors swap their doubles. Knowing this, you'll trade from your 'extras' (worth little to you) and hold onto your 'firsts' (worth a lot)." },
    { text: "A rare sticker that your friend is desperate to complete their set \u2014 but you don't even collect stickers.",
      ask: "Is that sticker worth more to you or to your friend? How could you use that in a trade?",
      answer: "Worth far more to your friend. So you could fairly ask for something good in return \u2014 they'll gladly give it.",
      why: "When you have something that's worth little to you but a LOT to someone else, that's a strong trading position \u2014 and it's fair, because they still win too. Noticing who values a thing most is how you make trades where everyone leaves happy, including you." }
  ]
};

/* ---- fair_trade layout (mirrors origins/trade_offs row layout) ---- */
function ftRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function ftRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    fairSwap: "EVEN SWAP?", bothWin: "BOTH WIN?",
    spotBadDeal: "SPOT THE BAD DEAL", whatsItWorth: "WHAT'S IT WORTH?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The situation / trade offer
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

window.TEMPLATES.sure_maybe_no = {
  id: "sure_maybe_no",
  label: "Sure, Maybe, or No Way? (chance, luck & likelihood)",
  subject: "math",
  grades: ["1", "2", "3"],
  topicHint: "Likelihood, chance, randomness & luck reasoning",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "howLikely",   label: "How likely? (certain / likely / unlikely / no way)" },
        { value: "fairChance",  label: "Fair chance? (does everyone have the same shot?)" },
        { value: "luckMemory",  label: "Does luck remember? (streaks & 'it's due')" },
        { value: "workedOnce",  label: "Worked once? (one time isn't proof)" },
        { value: "mixed",       label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["howLikely", "fairChance", "luckMemory", "workedOnce"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = smnShuffle(SMN_BANKS[mode].slice());
      items.push(Object.assign({ mode }, pools[mode].pop()));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Sure, Maybe, or No Way?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Some things are SURE to happen, some MIGHT happen, and some are NO WAY \u2014 they just can't. Most of life sits in the middle: maybe. The trick grown-ups get fooled by is thinking they can control or predict the maybes \u2014 lucky socks, 'I'm due for a win,' 'it worked once so it always works.' Chance doesn't remember and it doesn't play favourites. Your job on each of these: think it through, sort how likely it really is, and don't let anybody sell you a sure thing that isn't one.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "A bag has 9 red marbles and 1 blue one. You reach in without looking. Pulling RED is likely (there are way more). Pulling BLUE is unlikely (only one). Pulling GREEN is NO WAY \u2014 there are none in the bag. And here's the sneaky part: even if you pull red five times in a row, the bag is exactly the same \u2014 blue is still just as unlikely on the next try. Chance has no memory. Count what's really in the bag; don't count on a feeling.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 112);
    }

    content.items.forEach((it, idx) => {
      const needed = smnRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = smnRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- sure_maybe_no helpers ---- */
function smnShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
const SMN_BANKS = {
  // HOW LIKELY: sort an everyday event as certain / likely / unlikely / impossible.
  howLikely: [
    { text: "The sun will come up tomorrow morning.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? How do you know?",
      answer: "Sure \u2014 it has come up every single day of your whole life and there's a reason it does (Earth keeps spinning).",
      why: "The strongest 'sure' isn't a feeling \u2014 it's a thing that happens the same way every time because there's a real cause behind it. That's different from just hoping." },
    { text: "You will grow wings and fly to school on your own.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? Why?",
      answer: "No way \u2014 people don't grow wings; our bodies just don't work like that.",
      why: "'No way' means it breaks how the world actually works, not just that it's rare. Knowing the difference between 'never happens' and 'hardly ever' keeps you from being fooled by 'miracle' promises." },
    { text: "It will rain at some point this month.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? What would change your answer?",
      answer: "Likely in most places \u2014 but it depends where you live. In a rainforest it's nearly sure; in a desert it might be unlikely.",
      why: "The honest answer is 'it depends' \u2014 and a good thinker says WHAT it depends on. Beware anyone who gives you one confident answer without asking where or when." },
    { text: "You will flip a coin and it lands on heads.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? Roughly what are the chances?",
      answer: "It's a maybe \u2014 about half the time. Two sides, one is heads, so it's an even 50-50.",
      why: "A coin is the cleanest 'maybe' there is: two ways it can go, no way to know which. Nobody can truly call a coin flip \u2014 anyone who says they can is guessing or lying." },
    { text: "You will roll a normal 6-sided die and get a 7.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? Look at the die first.",
      answer: "No way \u2014 a normal die only has 1 through 6 on it. There is no 7 to land on.",
      why: "Before you judge the odds, check what's actually possible. If the outcome isn't even ON the die, all the luck in the world won't make it happen. Count the real choices first." },
    { text: "Someone at your school has the same birthday as you.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? Does the size of the school matter?",
      answer: "The bigger the school, the more likely \u2014 with hundreds of kids it's actually pretty likely, even though it feels rare.",
      why: "Your gut says 'no way, that's a huge coincidence,' but with lots of people, matches get likely fast. Rare-feeling things happen all the time when there are enough tries \u2014 that's not magic, it's just numbers." },
    { text: "You will win a giant prize in a game where 1 in a million tickets wins.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? Why do so many people still play?",
      answer: "Very unlikely \u2014 almost everyone who plays loses. People play because the prize is exciting and losing feels far away.",
      why: "'Unlikely' and 'someone always wins' are both true at once \u2014 and sellers show you the rare winner, never the millions who lost. Ask 'what happens to MOST people?', not 'could I be the lucky one?'" },
    { text: "You will drop a ball and it falls DOWN toward the ground.",
      ask: "Is this SURE, likely, unlikely, or NO WAY? What makes you so certain?",
      answer: "Sure \u2014 gravity pulls things down every time. It has never once fallen up.",
      why: "Some 'sures' are as solid as it gets because a rule of nature is behind them. Those are the promises you can actually build on \u2014 unlike a 'sure thing' someone is trying to sell you." }
  ],
  // FAIR CHANCE: does everyone / every outcome really have an equal shot? spot rigged or lopsided setups.
  fairChance: [
    { text: "A jar has 20 blue jellybeans and 2 red ones. You grab one without looking and hope for red.",
      ask: "Does red have a fair chance? Is hoping harder going to help?",
      answer: "No \u2014 there are way more blue, so blue is much more likely. Hoping doesn't change what's in the jar.",
      why: "The chances live in the JAR, not in your head. Wanting red really badly changes nothing. To improve your odds you'd have to change the jar \u2014 feelings don't move marbles." },
    { text: "Two kids race, but one gets a 10-second head start every time.",
      ask: "Is this a fair chance for both to win? What would make it fair?",
      answer: "No \u2014 the head start makes it lopsided. It's fair only if both start together (or the faster one starts behind).",
      why: "A 'game' can look like luck or skill but be rigged from the start. Before you play anything, ask: does everyone truly start equal? If not, the winner was half-decided before it began." },
    { text: "A spinner is split into a HUGE red part and a tiny yellow sliver. A prize needs yellow.",
      ask: "Is landing on yellow a fair chance? Would you play if it cost your allowance?",
      answer: "No \u2014 yellow is a tiny sliver, so it's very unlikely. The big red area will win almost every spin.",
      why: "People design games so the losing part LOOKS small but is actually huge, or the winning part looks reachable but is a sliver. Look at how BIG each part really is, not how the prize is described." },
    { text: "You and a friend split a chocolate bar by one person breaking it and the OTHER person picking first.",
      ask: "Is this a fair way to split? Why does letting the other kid pick make it fair?",
      answer: "Yes, it's fair \u2014 the breaker tries to make both pieces even, because they'll get whatever piece is left.",
      why: "This is a clever fairness trick: the person who divides doesn't choose. It lines up everyone's interests so no one can cheat. Notice how a good RULE can make things fair without anyone having to be nice." },
    { text: "A grown-up says 'pick a number 1 to 10, if you're right I'll give you a dollar' \u2014 then never tells you the number.",
      ask: "Did you have a fair chance? What's missing?",
      answer: "Not a fair one \u2014 you can't tell if they ever really had a number. With no way to check, they could always say you're wrong.",
      why: "A game you can't check isn't a fair game \u2014 it's just someone deciding. Real fairness means the answer is set and provable BEFORE you guess. 'Trust me' is not the same as fair." },
    { text: "Everyone in class puts their name in a hat once, and one name is pulled for a prize.",
      ask: "Does everyone have a fair chance? Why is 'one name each' important?",
      answer: "Yes \u2014 one name each means everyone has exactly the same shot. That's what makes a draw fair.",
      why: "A draw is fair only when everyone's in it equally and no one can peek or add extra slips. When you hear about a 'random winner,' ask: was everyone in it the same amount, and could anyone cheat?" },
    { text: "A carnival game claims 'almost everyone wins!' but you notice the ring is barely bigger than the bottle.",
      ask: "Is 'almost everyone wins' likely true? What does your own looking tell you?",
      answer: "Probably not \u2014 if the ring barely fits, most people miss. Your eyes tell you more than their sign does.",
      why: "The people selling a game get to write the sign; they don't get to write what your eyes see. Trust the setup you can measure over the promise you're told. Go look at the ring." }
  ],
  // LUCK MEMORY: chance has no memory. gambler's-fallacy & lucky-charm reasoning.
  luckMemory: [
    { text: "You flipped a coin and got heads 4 times in a row. Your friend says 'tails is DUE now for sure.'",
      ask: "Is tails more likely on the next flip because of the streak? Why or why not?",
      answer: "No \u2014 the coin doesn't remember. The next flip is still a fresh 50-50, same as always.",
      why: "This is the biggest luck trap there is: thinking a run of one thing makes the other 'owed.' A coin has no memory and no fairness meter. Every flip starts over. 'It's due' has cost people everything." },
    { text: "A kid wears the same 'lucky' socks and their team wins. Now they think the socks did it.",
      ask: "Did the socks make the team win? How could you test that idea?",
      answer: "No \u2014 socks can't play the game. To test it, notice all the times they wore them and LOST too, not just the wins.",
      why: "We remember the hits and forget the misses \u2014 that's how a 'lucky' anything is born. To check any lucky charm, count the losses too. The socks never once caught a ball." },
    { text: "Someone lost at a game 6 times, so they bet even MORE money, sure they'll win it back.",
      ask: "Are they more likely to win now? What's the real reason they keep betting?",
      answer: "No \u2014 losing before doesn't make winning more likely. They keep betting because losing hurts and they want it back.",
      why: "Past losses don't 'store up' a win \u2014 that's a story we tell to feel better. This exact trap is how people lose their savings. The bravest move is to stop, not to double down." },
    { text: "You pick the number 7 every week because '7 finally has to come up.'",
      ask: "Is 7 more likely because it hasn't come up in a while? Why?",
      answer: "No \u2014 each draw is fresh; 7 has the same small chance every time whether it's been picked before or not.",
      why: "Numbers don't wait their turn. A ball that hasn't come up isn't 'hiding' or 'due' \u2014 the machine doesn't know or care what happened last week. Every draw is its own separate roll of the dice." },
    { text: "A weather app was right yesterday, so a kid says 'it CAN'T be wrong two days in a row.'",
      ask: "Does being right yesterday make it surer today? Why or why not?",
      answer: "No \u2014 today's forecast stands on its own. Being right once doesn't 'protect' the next guess from being wrong.",
      why: "One right answer doesn't build up credit against a wrong one. Judge each prediction by ITS reasons, not by a streak. Chance and guesses don't take turns being right." },
    { text: "Rolling dice, a player blows on them and shakes hard, sure it changes what they roll.",
      ask: "Does blowing or shaking change the odds of the roll? What actually decides it?",
      answer: "No \u2014 the die still has the same six sides. How you throw it doesn't change what numbers exist.",
      why: "Little rituals feel powerful, but they don't touch the actual chances. What decides the roll is what's ON the die, not your special shake. Comfort is fine; just don't bet on it working." }
  ],
  // WORKED ONCE: one result (good or bad) isn't proof. small samples, luck vs. real cause.
  workedOnce: [
    { text: "A kid tried a 'brain drink' once, then aced one spelling test, so they say the drink makes you smart.",
      ask: "Is one good test enough to prove the drink works? What would prove it better?",
      answer: "No \u2014 one test could just be luck or good studying. You'd need to compare many tests with and without the drink.",
      why: "One time is a story, not proof. Maybe they studied, maybe it was an easy test, maybe luck. Real proof needs it to work again and again, and to fail without the thing. 'It worked once' sells a lot of junk." },
    { text: "Grandpa smoked and lived to 95, so a cousin says 'see, smoking doesn't hurt you.'",
      ask: "Does one person prove smoking is safe? What are we not seeing?",
      answer: "No \u2014 one lucky person can't outweigh the millions it harmed. We only heard about the one who was fine.",
      why: "One rare survivor doesn't beat what happens to MOST people. We hear the lucky story because it's surprising, and forget the many quiet ones who weren't lucky. Ask 'what happens to most?', not 'who got away with it?'" },
    { text: "A kid took a shortcut once and got home fast, so now they swear it's always faster.",
      ask: "Does one fast trip prove it's the faster way? How could you actually find out?",
      answer: "No \u2014 maybe that day the main road was busy. You'd have to try both ways several times to really know.",
      why: "One trip is one throw of the dice \u2014 traffic, luck, timing. To trust a claim, you test it a few times, not once. Beware 'I tried it and it worked' \u2014 that's the weakest evidence there is." },
    { text: "An ad shows ONE person who used a gadget and got amazing results.",
      ask: "Does one happy person prove it works for everyone? What are they NOT showing you?",
      answer: "No \u2014 they picked the best story on purpose. They aren't showing the many people it did nothing for.",
      why: "Ads hand-pick the shiniest result and hide the rest \u2014 that's their whole job. One glowing example is chosen, not typical. Always ask: how did it go for the AVERAGE person, not the one on TV?" },
    { text: "It rained the one day a kid forgot their umbrella, so they decide 'forgetting always makes it rain.'",
      ask: "Did forgetting the umbrella cause the rain? Why does it FEEL that way?",
      answer: "No \u2014 the sky doesn't watch your umbrella. It feels true because that bad day sticks in your memory.",
      why: "Our brains love to connect a memorable event to whatever we did that day \u2014 even when they've got nothing to do with each other. A cause has to actually be able to DO the thing. Clouds can't see your backpack." },
    { text: "A new kid answered one question right on their first day, so everyone decides they're a 'genius.'",
      ask: "Is one right answer enough to know how smart someone is? Why go slow on this?",
      answer: "No \u2014 one answer barely tells you anything. Everyone has good and bad days; you'd learn more over many days.",
      why: "Judging a whole person from one moment \u2014 good OR bad \u2014 is a small sample. First impressions are one data point. Give people, and yourself, more than one try before you decide who they are." }
  ]
};

/* ---- sure_maybe_no layout (mirrors fair_trade / trade_offs row layout) ---- */
function smnRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function smnRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    howLikely: "HOW LIKELY?", fairChance: "FAIR CHANCE?",
    luckMemory: "DOES LUCK REMEMBER?", workedOnce: "WORKED ONCE?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The situation
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

window.TEMPLATES.is_that_true = {
  id: "is_that_true",
  label: "Is That True, or Is That My Head? (checking your own thinking)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Metacognition: separating facts from the stories, guesses & assumptions your own mind adds",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking-check skill",
      options: [
        { value: "factVsStory",  label: "What happened vs. the story I told myself" },
        { value: "jumping",      label: "Jumping to conclusions (I guessed and called it fact)" },
        { value: "alwaysNever",  label: "Always / never / everyone (the overgeneralizing trap)" },
        { value: "howWouldIKnow", label: "How would I actually know? (check it yourself)" },
        { value: "mixed",        label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["factVsStory", "jumping", "alwaysNever", "howWouldIKnow"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = ittShuffle(ITT_BANKS[mode].slice());
      items.push(Object.assign({ mode }, pools[mode].pop()));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Is That True, or Is That My Head?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Your brain is fast \u2014 so fast that it often fills in the blanks with a GUESS and then hands it to you like it's a fact. \"She's mad at me.\" \"I'll never get this.\" \"Everyone saw.\" Most of the time you didn't SEE any of that; your head made it up in a blink. That's not being dumb \u2014 every brain does it. The sovereign move is to catch it. For each one, pull apart two things: what actually HAPPENED (what a camera would have recorded) and the STORY your head added on top. Then ask the most powerful question there is: \"Is that true \u2014 or is that just what my head decided?\" You don't have to believe every thought you think.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Say: \"My friend walked past and didn't say hi. She's mad at me.\" WHAT HAPPENED (camera): she walked past without saying hi. THE STORY MY HEAD ADDED: \"she's mad at me\" \u2014 nobody said that; my head guessed the reason. Could there be other reasons? She didn't see me, she was in a hurry, she was thinking hard about something. HOW COULD I CHECK? Just ask her. The fact is real; the story is only a maybe until I check. Don't let a maybe run your whole day.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 110);
    }

    content.items.forEach((it, idx) => {
      const needed = ittRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = ittRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- is_that_true helpers ---- */
function ittShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Every item: { text, ask, answer, why }
const ITT_BANKS = {
  factVsStory: [
    { text: "You wave at a kid across the playground. They don't wave back. You think: \"They don't like me.\"",
      ask: "What actually HAPPENED (what a camera saw)? What STORY did your head add on top?",
      answer: "Happened: you waved, they didn't wave back. Story your head added: \"they don't like me.\" Nobody said that \u2014 you guessed the reason.",
      why: "A camera only records the waving and the not-waving-back. \"Doesn't like me\" is a reason your brain invented in a split second. Maybe they didn't see you, were squinting into the sun, or were focused on a game. The event is a fact; the reason WHY is a story you made up \u2014 and stories can be wrong." },
    { text: "The teacher gives the class a big pile of homework. You think: \"She's trying to ruin our weekend.\"",
      ask: "Separate the FACT from the STORY. What did your head add that you can't actually see?",
      answer: "Fact: there's a lot of homework. Story: \"she's trying to ruin our weekend\" \u2014 you invented her secret reason.",
      why: "You can see the homework; you can't see inside her head. Your brain filled the gap with the worst reason it could think of. Maybe there's a test coming, maybe she has to cover a topic \u2014 or maybe she just misjudged how long it takes. Guessing someone's hidden motive as if it's a fact is one of the sneakiest tricks your own mind plays." },
    { text: "Your little brother knocks over your tower of blocks. You think: \"He did it on purpose to be mean.\"",
      ask: "What happened, exactly? What's the part your head is guessing about?",
      answer: "Happened: the tower got knocked over. Guessed: \"on purpose, to be mean\" \u2014 you don't actually know his reason.",
      why: "The blocks falling is real. WHY they fell \u2014 clumsy accident, he tripped, he was reaching for something, or yes, maybe on purpose \u2014 that's the part you're guessing. Notice how your head jumps straight to the meanest option? Catching that jump is the whole skill. \"I don't actually know why yet\" is a perfectly good place to stand." },
    { text: "You get a lower mark than you hoped on a drawing. You think: \"I'm bad at art.\"",
      ask: "What's the real fact here? What giant story did your head build out of one small thing?",
      answer: "Fact: one drawing got a lower mark than you wanted. Story: \"I'm bad at art\" \u2014 a huge conclusion from one drawing.",
      why: "One mark on one drawing on one day is the fact. \"I'm bad at art\" is your head turning a single moment into a permanent label about WHO YOU ARE. That's a trap, because it makes you quit. A truer sentence is: \"This drawing didn't go how I wanted \u2014 yet.\" One result is data, not a life sentence." },
    { text: "Two friends are laughing near you and you didn't hear the joke. You think: \"They're laughing at me.\"",
      ask: "What did you actually see and hear? What did your head fill in that you have no proof of?",
      answer: "Saw/heard: two friends laughing; you didn't hear why. Filled in: \"at me\" \u2014 pure guess, no proof at all.",
      why: "Laughing is the fact. WHO or WHAT they're laughing at is the blank \u2014 and your head slammed the scariest answer into it. There are a hundred things people laugh at; \"me\" is just one, and usually not the one. When you feel that hot flash of \"they're laughing at me,\" that's your cue to pause and notice: I made that up." }
  ],
  jumping: [
    { text: "Your friend hasn't texted back in an hour. You decide: \"They're ignoring me / they're mad.\"",
      ask: "You know one fact. How many jumps did your head take to get to \"they're mad\"? Name another reason.",
      answer: "One fact: no text back yet in an hour. Your head jumped straight to \"mad/ignoring.\" Other reasons: busy, phone dead, didn't see it, doing homework, sleeping.",
      why: "This is mind-reading \u2014 acting like you KNOW what's in someone's head when you only know one small fact. \"No reply for an hour\" has dozens of boring explanations, almost none of them \"they hate me.\" When your brain reads a mind, catch it and say: \"I'm guessing, not knowing.\"" },
    { text: "You have to give a talk in front of the class tomorrow. You're already sure: \"It's going to be a disaster.\"",
      ask: "The talk hasn't happened yet. What is your head doing when it's this sure about the future?",
      answer: "Your head is fortune-telling \u2014 predicting a bad future as if it already happened. Truth: nobody knows how tomorrow goes, including you.",
      why: "This trap is called fortune-telling: your brain pretends it can see the future, and it almost always predicts the worst. But a prediction isn't a fact \u2014 it's a guess wearing a fact's costume. \"It might be hard\" is honest. \"It's DEFINITELY going to be a disaster\" is your head bluffing. You can prepare for hard; you can't prepare for a fake certainty." },
    { text: "A new kid doesn't talk much on their first day. You conclude: \"They're stuck-up / they think they're better than us.\"",
      ask: "What did you observe? What's the leap your head made, and what's a kinder reason that fits the same fact?",
      answer: "Observed: quiet on day one. Leap: \"stuck-up.\" A reason that fits just as well: nervous, shy, doesn't know anyone yet, having a rough day.",
      why: "Quiet is the fact; \"stuck-up\" is a motive you assigned with zero evidence. Notice that \"shy and nervous\" fits the exact same behaviour \u2014 and on a first day it's far more likely. When two stories fit the facts equally, your brain grabs the meanest one out of habit. Sovereign thinkers pause and ask: what ELSE could explain this?" },
    { text: "You see one ant in the kitchen. You announce: \"The whole house is infested with ants!\"",
      ask: "What do you actually know? How big did your head make it, and how could that fool you?",
      answer: "Known: one ant, one time, one spot. Head's version: \"the whole house is infested.\" That's one fact blown up into a huge claim.",
      why: "Going from one to \"everywhere\" is jumping to a conclusion with size. One ant means one ant. Maybe there are more \u2014 but you'd have to actually LOOK to know, not just panic. This same trap works on grown-ups: one scary story on the news becomes \"the whole world is dangerous.\" Count what you've actually seen before you decide how big it is." },
    { text: "Your parent looks serious and quiet at dinner. You think: \"I'm in trouble / I did something wrong.\"",
      ask: "What's the fact? Why does your head assume it's ABOUT YOU, and what else could it be?",
      answer: "Fact: parent seems serious and quiet. Head's assumption: \"it's about me / I'm in trouble.\" Could be: tired, worried about work, money, a friend, feeling sick \u2014 nothing to do with you.",
      why: "Brains love to assume everything is about US \u2014 it's called personalizing. But most of what other people feel has nothing to do with you at all. A quiet parent is just a quiet parent until you have a reason to think otherwise. Instead of guessing and worrying, you could just ask: \"You okay?\" Facts beat fear." }
  ],
  alwaysNever: [
    { text: "You miss a goal in a soccer game and think: \"I ALWAYS mess up. I NEVER get it right.\"",
      ask: "Are \"always\" and \"never\" really true? Find one time it wasn't true. What's a more honest word?",
      answer: "No \u2014 you have gotten it right before, so \"always/never\" is false. Honest version: \"I missed THIS one,\" or \"sometimes I miss.\"",
      why: "\"Always\" and \"never\" are almost always lies your feelings tell. It only takes ONE counter-example to break them \u2014 one time you scored, one time it went fine. These words feel true when you're upset, but they turn one bad moment into a forever-truth. Swap them for \"this time\" or \"sometimes\" and the trap loses its grip." },
    { text: "After one argument, you decide: \"My sister and I NEVER get along. We fight about EVERYTHING.\"",
      ask: "Is \"never\" and \"everything\" accurate? Can you think of a time you got along? What's truer?",
      answer: "No \u2014 you've gotten along plenty; you don't fight about everything. Truer: \"we argued today about this one thing.\"",
      why: "One fresh argument makes your brain rewrite history into \"we NEVER get along.\" But if you actually count, there are loads of times you were fine together. \"Everything\" and \"never\" erase all of that. Naming the ONE real thing you argued about (\"the TV remote\") is honest \u2014 and way easier to fix than \"everything.\"" },
    { text: "One kid was unkind to you at recess. You think: \"EVERYONE at this school is mean.\"",
      ask: "How many kids were actually unkind? How many go to the school? Is \"everyone\" fair to the rest?",
      answer: "One kid was unkind. Hundreds of kids go there. \"Everyone is mean\" is one person stretched over the whole crowd \u2014 not fair or true.",
      why: "This is overgeneralizing: taking one person's bad behaviour and painting the entire group with it. It's the exact same faulty move behind every stereotype \u2014 \"one of THEM did X, so they're ALL like that.\" Catching it in your own small life (\"one kid, not everyone\") is how you learn to spot it when grown-ups and the news do it big." },
    { text: "You try a new food, don't like it, and declare: \"I HATE all vegetables. I'll NEVER like any of them.\"",
      ask: "You tried how many vegetables just now? Is it fair to judge ALL of them and the whole future?",
      answer: "You tried one, this once. \"All vegetables\" and \"never\" judge hundreds of foods and your entire future from a single bite.",
      why: "One bite of one thing on one day cannot honestly tell you about ALL vegetables forever. Tastes even change as you grow. \"I didn't like THAT one today\" is the true-sized sentence. Watch how often \"all\" and \"never\" sneak in to make a tiny experience sound like a giant permanent fact \u2014 then cut them down to size." },
    { text: "You get one hard homework question wrong and think: \"I'm just NOT a math person. I'll NEVER understand this.\"",
      ask: "Is 'not a math person' a fact or a story? What did you actually get wrong \u2014 all of math, or one question?",
      answer: "Story, not fact. You got ONE question wrong \u2014 not all of math, not forever. \"I haven't figured out THIS yet\" is the true version.",
      why: "\"I'm not a math person\" is a label that tells you to quit \u2014 and it's built from \"never\" and \"just not,\" which are feeling-words, not facts. Nobody is born knowing math; everyone learns it one confusing question at a time. The magic word that breaks this trap is \"YET.\" \"I don't get it YET\" keeps the door open. \"Never\" slams it." }
  ],
  howWouldIKnow: [
    { text: "You're certain your friend is secretly annoyed with you.",
      ask: "How could you ACTUALLY find out if that's true, instead of just believing your worry?",
      answer: "Ask them directly, or watch what they actually do (not what you imagine). The real test is asking \u2014 your worry isn't evidence.",
      why: "A feeling of \"they're annoyed\" is not proof of anything \u2014 it's a guess in your body. The only real way to know what's in someone's head is to ask them or watch their real actions over time. When you catch yourself SURE about something you can't see, the sovereign move is: how would I check this? If you can't check it, you don't actually know it \u2014 so hold it loosely." },
    { text: "You believe you're \"the slowest reader in the whole class.\"",
      ask: "Is that something you've measured, or just a feeling? How could you find out for real?",
      answer: "It's a feeling unless you've actually compared. You'd have to somehow measure or ask \u2014 and even then, \"slowest\" one day changes with practice.",
      why: "\"The slowest in the whole class\" sounds like a fact, but have you tested every classmate? Almost certainly not \u2014 your brain just crowned you last place because you felt behind. Before you believe a ranking about yourself, ask: did I measure this, or did I feel it? Feelings are real, but they are not measurements." },
    { text: "A kid tells you: \"That new movie is the best movie ever made. Everyone agrees.\"",
      ask: "How could you find out if 'everyone agrees' is really true? What would actually settle it?",
      answer: "You can't know 'everyone' agrees \u2014 nobody asked everyone. You'd check by asking around yourself, reading different reviews, or just watching it and deciding.",
      why: "\"Everyone agrees\" is a claim you can test \u2014 and it falls apart fast, because nobody has asked everyone about anything. This is the same skill you use on ads and news: when someone says \"everyone knows\" or \"everyone agrees,\" ask how they could possibly know that. Usually they can't. The best test of a movie is your own eyes, not a crowd." },
    { text: "You think: \"If I raise my hand and get it wrong, the whole class will laugh and remember it forever.\"",
      ask: "Is that a fact or a prediction? How could you check whether it's likely \u2014 and what usually really happens?",
      answer: "It's a prediction (fortune-telling), not a fact. Check it by remembering: how many wrong answers from OTHER kids do you actually remember from last week?",
      why: "Here's a great way to test a scary prediction: run it on other people. Can you name three wrong answers other kids gave last week? Almost nobody can \u2014 because people forget them in minutes and are busy worrying about their own stuff. That's evidence your \"they'll remember forever\" prediction is false. Checking a fear against real evidence is how you shrink it." },
    { text: "You wake up sure it's going to be \"the worst day ever\" before anything has even happened.",
      ask: "Has the day happened yet? How would you actually know how it goes \u2014 and who gets a say in it?",
      answer: "No \u2014 the day hasn't happened, so it's a prediction, not a fact. You find out by living it \u2014 and your own choices help decide how it goes.",
      why: "You cannot know a day is \"the worst\" before living it \u2014 that's your head fortune-telling again. And here's the sovereign part: a day isn't just something that happens TO you. What you do, notice, and pay attention to changes how it goes. So a made-up \"worst day ever\" can actually help cause a bad day if you believe it. Don't let a guess about the future steal a day you haven't lived yet." }
  ]
};

/* ---- is_that_true layout (mirrors fair_trade/trade_offs row layout) ---- */
function ittRowHeight(doc, it, w, explain, showAnswers) {
  doc.setFontSize(11);
  const textLines = doc.splitTextToSize(it.text, w - 24);
  const askLines = doc.splitTextToSize(it.ask, w - 24);
  let h = 16;
  h += textLines.length * 13 + 6;
  h += askLines.length * 13 + 6;
  if (showAnswers) {
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, w - 24);
    h += ansLines.length * 12 + 6;
  } else {
    h += 22;            // one writing line
    if (explain) h += 22; // a "because..." line
  }
  return h + 8;
}

function ittRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    factVsStory: "FACT vs. STORY", jumping: "JUMPING TO A CONCLUSION",
    alwaysNever: "ALWAYS / NEVER / EVERYONE", howWouldIKnow: "HOW WOULD I KNOW?"
  }[it.mode] || "";

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 130, 130);
  doc.text(String(num) + ".", x, y + 4);
  if (modeTag) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(231, 105, 56);
    doc.text(modeTag, x + 20, y + 4);
  }
  let cy = y + 18;
  const bx = x + 20;
  const bw = w - 24;

  // The situation / thought
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The thinking question
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(50, 50, 50);
  const askLines = doc.splitTextToSize(it.ask, bw);
  doc.text(askLines, bx, cy);
  cy += askLines.length * 13 + 6;

  if (showAnswers) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(180, 30, 30);
    const ansLines = doc.splitTextToSize("Key: " + it.answer + "  " + it.why, bw);
    doc.text(ansLines, bx, cy);
    cy += ansLines.length * 12 + 6;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setDrawColor(170); doc.setLineWidth(0.5);
    doc.line(bx, cy + 8, x + w, cy + 8);
    cy += 22;
    if (explain) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text("because...", bx, cy);
      doc.setTextColor(170, 170, 170);
      doc.line(bx + doc.getTextWidth("because... ") + 4, cy, x + w, cy);
      cy += 14;
      doc.setTextColor(20, 20, 20);
    }
  }
  return cy;
}

/* ============================================================
   TEMPLATE INDEX (helper for UI)
============================================================ */
window.TEMPLATES_LIST = Object.values(window.TEMPLATES);

// Template availability is a RANGE: from the lowest grade it lists, open-ended
// upward — unless it's a young-only template capped here. This way kids who
// advance keep their templates (AI + difficulty handle harder calibration).
const GRADE_SEQ = ["K", "1", "2", "3", "4", "5", "6"];
function gSeqRank(g) { const i = GRADE_SEQ.indexOf(g); return i < 0 ? 0 : i; }
const TEMPLATE_MAX_GRADE = {
  count_to_10: "1", ways_to_make: "2",
  wonder_why: "1",
  tracing_shapes: "1", tracing_letters_numbers: "3", tracing_words: "3",
  sight_words_practice: "2",
  capitalize_questions: "3", story_middle_end: "3", combine_sentences: "3",
  describing_words_fill: "3", describing_words_choose: "3"
};

window.getTemplatesForSubjectGrade = function (subject, level) {
  const L = gSeqRank(level);
  return window.TEMPLATES_LIST.filter(t => {
    if (t.subject !== subject) return false;
    const min = Math.min.apply(null, t.grades.map(gSeqRank));
    const capG = t.maxGrade != null ? t.maxGrade : TEMPLATE_MAX_GRADE[t.id];
    const max = capG != null ? gSeqRank(capG) : Infinity;
    return L >= min && L <= max;
  });
};

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

  // Demo name in dark (filled)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(30, 30, 30);
  doc.text(name, margin + 14, baseline);

  // Ghost name copies as light silhouette
  const nameW = doc.getTextWidth(name);
  const demoW = nameW + 40;
  const remainingW = usableW - demoW;
  const ghostCopies = Math.max(1, Math.floor(remainingW / (nameW + 30)));
  doc.setTextColor(195, 195, 195);
  for (let i = 0; i < ghostCopies; i++) {
    const xPos = margin + demoW + 20 + i * (nameW + 30);
    if (xPos + nameW <= pageW - margin) {
      doc.text(name, xPos, baseline);
    }
  }
  doc.setTextColor(0, 0, 0);
}

function ensureTracingFontRegistered(doc) {
  if (!window.TRACING_FONT_BASE64) return false;
  if (doc._tracingFontRegistered) return true;
  try {
    doc.addFileToVFS("TracingNarrow.ttf", window.TRACING_FONT_BASE64);
    doc.addFont("TracingNarrow.ttf", window.TRACING_FONT_NAME, "normal");
    doc._tracingFontRegistered = true;
    return true;
  } catch (e) {
    console.warn("Could not register tracing font:", e);
    return false;
  }
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

  // Register KG Primary Dots font — each glyph is ALREADY a dashed line, so we render with fill
  const useTracingFont = ensureTracingFontRegistered(doc);
  const traceFontName = useTracingFont ? window.TRACING_FONT_NAME : "helvetica";

  // Demo letter: use Helvetica BOLD (solid dark, easy to see what to trace)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(30, 30, 30);
  doc.text(character, margin + 14, baseline);

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

  // Ghost letters — use KG Primary Dots (glyph is itself a dashed line). Just fill.
  const tracingW = usableW - demoW;
  const slotW = tracingW / copies;
  doc.setFont(traceFontName, "normal");
  doc.setFontSize(fontSize * 1.05); // slight bump — KG glyphs are a touch smaller
  doc.setTextColor(80, 80, 80);
  for (let c = 0; c < copies; c++) {
    const cx = margin + demoW + c * slotW + slotW / 2 - fontSize * 0.28;
    doc.text(character, cx, baseline);
  }

  // Answer-key mode: also draw the filled (completed) versions on top
  if (opts.showAnswers) {
    doc.setTextColor(30, 30, 30);
    for (let c = 0; c < copies; c++) {
      const cx = margin + demoW + c * slotW + slotW / 2 - fontSize * 0.28;
      doc.text(character, cx, baseline);
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

  // Use the kid-friendly tracing font (single-story a/g, etc.) for BOTH the model
  // word and the trace copy, so what the child reads, traces, and writes all match.
  const useT = ensureTracingFontRegistered(doc);
  const tFont = useT ? window.TRACING_FONT_NAME : "helvetica";

  // Section 1: model word (read this) — tracing font, solid dark
  doc.setFont(tFont, "normal");
  doc.setFontSize(30);
  doc.setTextColor(20, 20, 20);
  doc.text(word, x + 10, baseline);

  // Section 2: light ghost word (to trace) — same tracing font, grey
  doc.setFont(tFont, "normal");
  doc.setFontSize(30);
  doc.setTextColor(185, 185, 185);
  doc.text(word, x + sectionW + 10, baseline);

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

  // Demo word — the model to copy. Use the tracing font so its letterforms (the
  // single-story 'a', 'g', etc.) match the ghost copies the child traces.
  const useDemoTrace = ensureTracingFontRegistered(doc);
  doc.setFont(useDemoTrace ? window.TRACING_FONT_NAME : "helvetica", useDemoTrace ? "normal" : "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(30, 30, 30);
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

  // Ghost copies in the dotted tracing font, repeated across the line
  const useTracingFont = ensureTracingFontRegistered(doc);
  const traceFontName = useTracingFont ? window.TRACING_FONT_NAME : "helvetica";
  doc.setFont(traceFontName, "normal");
  doc.setFontSize(fontSize * 1.05);
  doc.setTextColor(90, 90, 90);
  const ghostW = doc.getTextWidth(word);
  const gap = fontSize * 0.7;
  let x = margin + demoW + 14;
  let drawn = 0;
  while (x + ghostW <= pageW - margin) {
    doc.text(word, x, baseline);
    x += ghostW + gap;
    drawn++;
  }
  // Guarantee at least one ghost copy even for a long word
  if (drawn === 0 && margin + demoW + 14 + ghostW <= pageW - margin + ghostW) {
    doc.text(word, margin + demoW + 14, baseline);
  }

  // Answer-key mode: overlay solid completed copies
  if (opts.showAnswers) {
    doc.setFont("helvetica", "bold");
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
  tracing_shapes: "1", tracing_letters_numbers: "2", tracing_words: "3",
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

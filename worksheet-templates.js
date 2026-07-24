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

window.TEMPLATES.follow_the_incentive = {
  id: "follow_the_incentive",
  label: "Who Wants You To? (follow the reason behind the message)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Incentives & motive literacy: who benefits when you believe, buy, or do a thing \u2014 and what they get out of it",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "whoBenefits", label: "Who benefits? (cui bono \u2014 who gains if you believe it)" },
        { value: "whatsInItForThem", label: "What's in it for them? (the reason behind the message)" },
        { value: "freeIsntFree", label: "\"Free\" isn't free (what are you really paying with?)" },
        { value: "sameFactTwoSpins", label: "Same fact, two spins (who's telling it changes the story)" },
        { value: "mixed", label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["whoBenefits", "whatsInItForThem", "freeIsntFree", "sameFactTwoSpins"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = ftiShuffle(FTI_BANKS[mode].slice());
      items.push(Object.assign({ mode }, pools[mode].pop()));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Who Wants You To?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Almost every message that reaches you \u2014 an ad, a rule, a \"you HAVE to see this,\" a \"trust me\" \u2014 was sent by somebody who wants something. That doesn't make them evil; it just means the message isn't the whole truth. The sovereign question, the one that unlocks most of them, is: WHO WANTS ME TO believe this, buy this, or do this \u2014 and what do THEY get out of it? Follow the reason back to the person, and ask what's in it for them. When you can see who gains, you can decide for yourself instead of being someone else's plan. You're allowed to want the thing anyway \u2014 you just want it with your eyes open.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "A cereal box shouts: \"NEW! The breakfast of CHAMPIONS \u2014 now with a free toy inside!\" WHO WANTS YOU TO want it? The company that makes the cereal. WHAT DO THEY GET? Your family's money. The \"free\" toy isn't free \u2014 it's bait to make YOU beg for that box instead of the plain one, and the toy's price is already baked into what your parents pay. Is the cereal bad? Maybe, maybe not \u2014 that's a separate question you decide by reading what's actually in it. Spotting who gains doesn't tell you what to choose; it just makes sure YOU'RE the one choosing.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 116);
    }

    content.items.forEach((it, idx) => {
      const needed = ftiRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = ftiRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- follow_the_incentive helpers ---- */
function ftiShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Every item: { text, ask, answer, why }
const FTI_BANKS = {
  // WHO BENEFITS: name the person/group who gains if you believe or do the thing.
  whoBenefits: [
    { text: "A commercial says: \"Real kids LOVE these sneakers! Everybody's wearing them!\"",
      ask: "Who paid for that commercial, and who benefits if you believe \"everybody's wearing them\"?",
      answer: "The sneaker company paid for it, and they benefit \u2014 they sell more shoes and make more money if you feel like you have to have them.",
      why: "The company isn't your friend giving advice; they're the one who profits from every pair sold. \"Everybody's wearing them\" is designed to make you feel left out so you'll push your parents to buy. Once you see who's paying to send the message, the message stops feeling like a fact and starts looking like what it is \u2014 a sales pitch." },
    { text: "A big kid tells your friend: \"Give me your snack and I'll let you sit with us at lunch.\"",
      ask: "Who gets the good part of this deal? Who's really benefiting here?",
      answer: "The big kid benefits \u2014 they get a free snack. Your friend gives up something real for a \"maybe\" that the big kid controls and can take back anytime.",
      why: "When someone offers you belonging, safety, or being \"cool\" in exchange for your stuff or your obedience, follow who ends up ahead. Here the big kid risks nothing and gains a snack; your friend pays and gets only a promise. A deal where one side holds all the power isn't a friendship offer \u2014 it's a toll booth." },
    { text: "A game on a tablet keeps flashing: \"You're SO close! Just watch one quick ad to keep playing!\"",
      ask: "Who makes money each time you watch that ad \u2014 you, or someone else?",
      answer: "The game makers (and the advertisers) make money every time you watch. You get nothing but a few more minutes of a game built to keep you watching more ads.",
      why: "Free games are usually free because YOU are the product \u2014 your attention is being sold to advertisers. \"You're so close\" is a hook to keep you glued so they can show you more ads. Knowing the game is designed to farm your attention lets you decide how much of it you actually want to give away." },
    { text: "A kid says: \"Don't tell the teacher what happened. Real friends keep secrets.\"",
      ask: "Who is protected if you stay quiet? Who benefits from the rule \"real friends keep secrets\"?",
      answer: "The kid who did something wrong is protected \u2014 they benefit. The \"real friends keep secrets\" line exists to keep YOU quiet so THEY don't get in trouble.",
      why: "Watch for rules that are handed to you right when someone needs you to follow them \u2014 that's a clue the rule was made for their benefit, not yours. A secret that only protects the person who made the mess isn't loyalty; it's them using your friendship as a shield. You get to decide who you protect." },
    { text: "An influencer online says: \"This drink gave me SO much energy \u2014 use my code for 10% off!\"",
      ask: "Who benefits when you use that code? Is the influencer just being helpful?",
      answer: "The influencer AND the drink company benefit \u2014 the influencer gets paid for every person who uses the code, and the company sells more drinks. It's an ad, even if it doesn't look like one.",
      why: "A discount code isn't a gift \u2014 it's a receipt that tells the company the influencer sent you, so they can pay them. That's the reason the video exists. The whole point of influencer ads is to feel like a friend's tip instead of a commercial. Ask \"is this person getting paid?\" and the friendly feeling snaps back into focus as a sales job." }
  ],
  // WHAT'S IN IT FOR THEM: reason back from the message to what the sender wants.
  whatsInItForThem: [
    { text: "A sign in a store window: \"SALE ENDS TONIGHT! Don't miss out \u2014 buy NOW!\"",
      ask: "Why do they want you to hurry? What's in it for the store if you buy without thinking?",
      answer: "They want you to buy before you can stop and think, compare prices, or decide you don't really need it. Hurrying you helps the store, not you.",
      why: "\"Ends tonight!\" and \"don't miss out!\" are pressure, not information. A calm, thinking shopper buys less; a rushed, worried one buys more. So the store's reason for the countdown is simple: rushing you is good for their sales. Real sales come back around \u2014 the fake emergency is the trick. When someone rushes you, slow down on purpose." },
    { text: "A cereal aimed at kids is placed on the LOW shelf, right at kid eye-level, covered in cartoon characters.",
      ask: "Why is it down low with cartoons on it? What does the company want to happen \u2014 and to whom?",
      answer: "They put it where KIDS can see and reach it, so kids will want it and ask their parents to buy it. The cartoons and low shelf are aimed at you on purpose.",
      why: "Nothing about a store shelf is an accident \u2014 companies pay for eye-level spots and design boxes to grab a specific person. When the target is kids, the plan is to turn YOU into the one who nags. Once you notice the box was engineered to work on you, you get to decide whether it actually should." },
    { text: "A charity ad shows sad music and a crying child and says \"Call in the next 10 minutes.\"",
      ask: "Helping people can be good \u2014 but why the sad music and the 10-minute rush? What are they after in that moment?",
      answer: "They want you to feel a strong emotion and act fast, before you can think or check them out. Even a real cause can use pressure tricks to get money quickly.",
      why: "This one's important: the cause might be totally real AND the ad might still be using pressure to skip your thinking. Those are two separate questions. \"Feel sad, act in 10 minutes\" is designed to move money before your brain catches up. You can care about the cause and still take an hour to check who they are and where the money goes." },
    { text: "A politician on a poster promises: \"I'll give EVERYONE free candy!\" and asks people to vote for them.",
      ask: "What does the person on the poster get if you believe the promise? Why might a big promise be part of the plan?",
      answer: "They get your vote and the power that comes with winning. A big, exciting promise is a way to get people to like them and choose them \u2014 whether or not it can really happen.",
      why: "When someone wants your vote, your \"yes,\" or your loyalty, the shiny promise is often bait for the thing THEY actually want (power, the win, being in charge). That doesn't automatically make them bad \u2014 but it means \"can they really do this, and what do they get out of it?\" is a fair question to ask about every promise, especially the sweetest ones." },
    { text: "A toy ad shows the toy doing amazing things \u2014 flying, glowing, moving by itself \u2014 with tiny words at the bottom: \"batteries not included, actions dramatized.\"",
      ask: "Why show the toy doing things it can't really do? What's in it for the company \u2014 and what are those tiny words admitting?",
      answer: "They make the toy look way more exciting so you'll want it \u2014 that sells more toys. The tiny words quietly admit the real toy doesn't actually do all that.",
      why: "\"Actions dramatized\" is the company telling on itself in the smallest letters they can get away with \u2014 it means \"we made it look better than it is.\" Their reason is obvious: an exciting-looking toy sells, a boring-looking one doesn't. Always hunt for the fine print; it's usually where the truth is hiding from the part that's trying to excite you." }
  ],
  // "FREE" ISN'T FREE: find the real price behind something offered as free.
  freeIsntFree: [
    { text: "A website says: \"Play 100 games for FREE! Just make an account with your name, birthday, and email.\"",
      ask: "It costs no money \u2014 so what are you actually paying with instead?",
      answer: "You're paying with your information \u2014 your name, birthday, and email. That's valuable to them; they can use it, sell it, or send you ads forever.",
      why: "When something's free but they want your info, YOUR INFORMATION is the price \u2014 that's the trade. Companies collect it, build a picture of you, and use it to sell you things or sell it to others. \"Free\" almost always means you're paying with something that isn't dollars: your data, your attention, or your time." },
    { text: "The mall gives out \"free\" balloons with the store's name and logo printed all over them.",
      ask: "The balloon costs you nothing \u2014 but what is the store getting out of giving it away?",
      answer: "They get free advertising: you carry their name around the whole mall, and everyone who sees the balloon sees their store. You become a walking ad.",
      why: "A free thing with a logo on it isn't a gift \u2014 it's a billboard you volunteer to hold. The store's reason is that a kid happily carrying their logo is cheaper and friendlier than a paid sign. It's clever, not evil \u2014 but noticing it means you know you're doing a job for them, and you can choose whether you want to." },
    { text: "A \"free\" phone app keeps popping up: \"Get the FULL version! Or keep watching ads to unlock levels.\"",
      ask: "If the app is free, how is the company making money off of you?",
      answer: "They make money from the ads you watch and from people who pay for the \"full version.\" The free app is bait to get you hooked so you'll do one or the other.",
      why: "\"Free\" is the front door, not the whole house. The plan is: get you in for free, get you hooked, then earn from your attention (ads) or your money (upgrades). Once you see that a free app still has to make money SOMEHOW, you can look for the how \u2014 and it's almost always your attention or your wallet, eventually." },
    { text: "A kid says: \"I'll do your chores for free!\" \u2014 and later says \"...so now you owe me, do what I say.\"",
      ask: "Was the favour really free? What was the hidden price that showed up later?",
      answer: "No \u2014 the hidden price was owing them and having to obey later. The \"free\" favour was really a loan that came with strings attached.",
      why: "Some \"free\" gifts are actually loans in disguise, designed to make you feel you owe the giver. A true gift comes with no bill later. When someone does you a favour and then cashes it in for control, that wasn't generosity \u2014 it was a setup. You can thank people and still not let a favour become a leash." },
    { text: "A TV channel is \"free to watch\" \u2014 but it plays a commercial every few minutes.",
      ask: "You don't pay money to watch \u2014 so what are the commercials taking from you, and who's paying the channel?",
      answer: "The commercials take your attention and time, and advertisers pay the channel to put their ads in front of you. Your eyeballs are what's being sold.",
      why: "\"Free TV\" is paid for by advertisers who are buying the chance to reach YOU. That's why the shows stop for commercials \u2014 the ads are the actual business; the show is just the bait that keeps you sitting there. Whenever something entertaining is free, ask \"who's paying to keep me watching, and what do they want back?\"" }
  ],
  // SAME FACT, TWO SPINS: who tells a true fact changes how it's framed.
  sameFactTwoSpins: [
    { text: "A candy company says its candy is \"a fun burst of fruity energy!\" A dentist says the same candy is \"pure sugar that harms teeth.\"",
      ask: "Both are talking about the SAME candy. Why do they describe it so differently? What does each one want?",
      answer: "The company wants you to buy candy, so they make it sound fun and good. The dentist wants healthy teeth, so they warn about the sugar. Same candy, two goals.",
      why: "The candy didn't change \u2014 only who's talking about it did. Everyone describing a thing usually wants something, and their words bend toward their goal. Neither is lying, exactly \u2014 they're each showing you a different true piece. Your job is to hear BOTH sides and notice what each one is after, then decide for yourself." },
    { text: "A store selling raincoats says \"Rain is coming ALL week \u2014 stay dry!\" A kid who loves puddles says \"It's going to rain all week \u2014 best week EVER!\"",
      ask: "Same weather forecast \u2014 why do they say it so differently? What does each one want you to feel?",
      answer: "The store wants you worried about rain so you'll buy a raincoat. The puddle-loving kid is just excited to splash. Same rain, opposite feelings \u2014 because they want different things.",
      why: "A plain fact \u2014 \"it will rain\" \u2014 gets painted with feelings depending on who's holding the brush. The store paints it scary to sell; the kid paints it fun for free. When you notice the SAME fact making people feel opposite things, look at what each person gains from the feeling they're selling you." },
    { text: "About a snowy day off school: one company selling sleds says \"A magical day of family fun!\" A worker who couldn't get paid says \"A rough day \u2014 I lost a day's work.\"",
      ask: "It's the exact same snow day. Why two totally different stories? What is each person's stake in it?",
      answer: "The sled company gains from it sounding magical (they sell sleds); the worker actually lost money, so for them it was hard. The same day is good or bad depending on your stake in it.",
      why: "\"How was it?\" almost always depends on \"how did it affect ME?\" A snow day is fun for a sled seller and painful for someone who missed a paycheque \u2014 both are telling the truth about their own view. Whenever you hear something called \"great\" or \"terrible,\" ask: great or terrible FOR WHOM? The answer often reveals the motive." },
    { text: "A team wins a close game. Their fans say \"We earned it with skill!\" The other team's fans say \"They just got lucky.\"",
      ask: "Same final score \u2014 why do the two sides explain it so differently? What is each side protecting?",
      answer: "The winners want to feel they deserved it (skill); the losers want to feel they weren't really beaten (luck). Each version protects how that side feels about themselves.",
      why: "People spin the same result to protect their pride or their side \u2014 winners credit skill, losers blame luck. Neither is pure truth; both are bending the story to feel better. Spotting this in a game teaches you to spot it everywhere: when someone explains a result, ask what they're protecting, then look for what actually happened." },
    { text: "A new rule at school: no phones at recess. The principal says \"It helps kids play together.\" Some kids say \"It's just control \u2014 they want to boss us around.\"",
      ask: "Same rule, two very different stories about WHY it exists. How would you figure out which reason is really true?",
      answer: "You'd look at the actual effects and reasons, not just each side's spin \u2014 does it help kids play, or just add control? The honest answer might even be a bit of both.",
      why: "Both sides here are guessing at a MOTIVE, and each guess fits what that side wants to believe. The sovereign move isn't to pick a side's story \u2014 it's to notice both are spins and go looking at what the rule actually does. Sometimes a rule really does help; sometimes it really is just control; sometimes it's both. Judge by effects, not by whoever's spin sounds best." }
  ]
};

/* ---- follow_the_incentive layout (mirrors is_that_true/trade_offs row layout) ---- */
function ftiRowHeight(doc, it, w, explain, showAnswers) {
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

function ftiRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    whoBenefits: "WHO BENEFITS?", whatsInItForThem: "WHAT'S IN IT FOR THEM?",
    freeIsntFree: "\"FREE\" ISN'T FREE", sameFactTwoSpins: "SAME FACT, TWO SPINS"
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

  // The situation / message
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
   TEMPLATE — WHO TOLD YOU THAT? (grown-up reads aloud)
   The Gr1-3 library is deep on manipulation/media literacy
   (spot_the_persuasion, follow_the_incentive, says_who, whose_story)
   and self-trust (is_that_true). But Oakley (age 4, K) had almost
   nothing there — wonder_why covers curiosity/logic/observation,
   not "is this real, and who's trying to get me to want it?"
   This is the READ-ALOUD SEED of that whole family of skills, sized
   for a pre-reader: a grown-up reads a tiny scene aloud, the child
   answers by talking / pointing / drawing. No reading required.
   It is NOT "don't trust anyone" and NOT "everything is a trick" —
   it's the sovereign middle: you're ALLOWED to want things and to
   believe things, you just get to be the one who decides, with your
   eyes open. Four modes:
     doYouWant  — separate "I want it" from "someone MADE me want it"
                  (the checkout-candy / shiny-ad / everyone-has-one seed)
     isItReal   — real vs. pretend / made-up (cartoons, "does it on TV",
                  costumes) — the first is-that-true muscle
     whoSaysSo  — who is telling me this, and how would THEY know?
                  (earliest source-checking, sized for K)
     howDoYouFeel — your body/feeling is a signal you're allowed to
                  trust; the little "no" that keeps you safe & sovereign
     mixed      — a bit of each
   Deterministic, never calls AI. Mirrors wonder_why row layout exactly.
   Young-only (capped at Gr1 below), so it stays Oakley's sheet.
============================================================ */
window.TEMPLATES.who_told_you = {
  id: "who_told_you",
  label: "Who Told You That? (grown-up reads aloud)",
  subject: "reading",
  grades: ["K", "1"],
  topicHint: "Pre-reader media & self-trust literacy (read-aloud)",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "doYouWant",    label: "Do you REALLY want it? (who's making you want it?)" },
        { value: "isItReal",     label: "Is it real, or pretend? (real vs. made-up)" },
        { value: "whoSaysSo",    label: "Who told you? (who says so, and how would they know?)" },
        { value: "howDoYouFeel", label: "How does it feel? (trust your own signal)" },
        { value: "mixed",        label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of questions", default: 6, min: 3, max: 10 },
    { id: "drawBox", type: "boolean", label: "Give a big box to draw the answer in", default: true },
    { id: "showScript", type: "boolean", label: "Print the grown-up read-aloud script under each", default: true }
  ],

  generate(m) {
    const count = Math.max(3, Math.min(10, parseInt(m.count, 10) || 6));
    const modes = m.mode === "mixed"
      ? ["doYouWant", "isItReal", "whoSaysSo", "howDoYouFeel"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = wtyShuffle(WTY_BANKS[mode].slice());
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
    const title = "Who Told You That?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "A read-aloud page \u2014 for a grown-up and a thinker who can't read yet. Read the little scene and the question OUT LOUD. Let the child answer however they like: talk, point, or draw. There are no wrong answers here \u2014 the whole game is one quiet question the child learns to ask themselves: \u201cwho told me that, and is it true for ME?\u201d We are NOT teaching \u201cdon't trust anyone.\u201d We're teaching that you're allowed to want things and believe things \u2014 you just get to be the one who decides. Whatever they say, ask \u201chow do you know?\u201d or \u201cwho told you?\u201d and take their reason seriously.",
      y, pageW, margin
    );

    content.items.forEach((it, idx) => {
      const needed = wtyRowHeight(doc, it, pageW - margin * 2, content.drawBox, content.showScript, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = wtyRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.drawBox, content.showScript, opts.showAnswers);
      y += 14;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- who_told_you content banks ---- */
function wtyShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { scene, ask, script, think }
//   scene  = the tiny picture-in-words the grown-up sets up (large print)
//   ask    = the question to ask the child (large print)
//   script = grown-up coaching line: how to ask + how to honour a real reason
//   think  = "answer key" for the grown-up: NOT a right answer, but the KIND
//            of thinking to listen for + a good follow-up question
const WTY_BANKS = {
  doYouWant: [
    { scene: "A toy on TV has flashing lights and happy music. A kid on the screen is laughing and yelling \u201cI NEED IT!\u201d",
      ask: "Do YOU want the toy \u2014 or did the TV try to make you want it?",
      script: "Ask gently, no shaming a \u201cyes.\u201d Follow up: \u201cwould you still want it if the music and the yelling kid were gone?\u201d",
      think: "You're NOT killing the want \u2014 you're helping them notice the want was nudged. \u201cThe music made it look fun\u201d is the whole lesson: the ad is trying to do a job on you." },
    { scene: "At the store, all the candy is down low \u2014 right where a little kid can grab it \u2014 next to where you wait to pay.",
      ask: "Why do you think the candy is put down low, right there?",
      script: "Let them guess. Then ask \u201cwho put it there, and what do they want to happen?\u201d Real answer: a grown-up chose that spot on purpose.",
      think: "The seed: someone DECIDED to put it at kid-eye-height so you'd grab it. A kid who says \u201cso I'll want it\u201d has spotted a set-up. That's sovereignty starting." },
    { scene: "Your friend has a new backpack and says \u201cEVERYBODY has one. You're weird if you don't.\u201d",
      ask: "Is that a good reason to want one? Do you have to?",
      script: "Ask calmly. Follow up: \u201cdo YOU like it, or do you just not want to feel left out?\u201d Both are okay to feel \u2014 name which one it is.",
      think: "The move: separate \u201cI like it\u201d from \u201cI'm scared to be different.\u201d \u201cEverybody has one\u201d is a push, not a reason. Honour a kid who can tell the two apart." },
    { scene: "A cereal box has a cartoon animal winking at you and a shiny gold star that says \u201cBEST EVER!\u201d",
      ask: "Does the winking animal make the cereal taste good? Who put him there?",
      script: "Playful. Let them see the cartoon is a decoration, not the food. Ask \u201ccould a yucky cereal still have a fun animal on it?\u201d",
      think: "Aim for: the picture and the food are two different things. The box is dressed up to be picked. \u201cThe animal is just a sticker\u201d = they saw through it." },
    { scene: "A game on a tablet is free, but a happy voice keeps saying \u201cTap here for a SUPER prize! Ask a grown-up to buy coins!\u201d",
      ask: "Is the game trying to help you \u2014 or trying to get something?",
      script: "Ask what the game keeps asking for. Follow up: \u201cwho gets the money if you tap?\u201d The game wants your grown-up's money.",
      think: "The K-sized cui-bono: \u201cfree\u201d has a catch. A kid who notices \u201cit keeps asking to buy stuff\u201d has found the hook. Praise spotting the ask." }
  ],
  isItReal: [
    { scene: "In a cartoon, a character gets squished flat by a rock \u2014 then pops right back up and runs away, totally fine.",
      ask: "Could that really happen to a real person? How do you know?",
      script: "Let them explain. Follow up: \u201cwhat's the difference between a cartoon and real life?\u201d No fear \u2014 just real vs. pretend.",
      think: "You want them naming the line between real and made-up. \u201cIt's just a drawing / it's pretend\u201d is exactly right. This is the first is-that-true muscle." },
    { scene: "A superhero on the screen jumps off a tall building and flies. A kid puts on a cape and feels super strong.",
      ask: "Is the cape magic? Can the kid really fly?",
      script: "Gentle and clear \u2014 this is a safety one too. Ask \u201cwhat's real: the strong feeling, or the flying?\u201d Both can be talked about kindly.",
      think: "Separate a real FEELING (I feel brave) from a pretend FACT (I can fly). \u201cThe feeling is real but the flying is pretend\u201d is a big, important sort." },
    { scene: "A TV toy ad shows a little car zooming and flipping and doing tricks all by itself.",
      ask: "Do you think the real toy in the box does all that by itself?",
      script: "Ask what might be hidden. Real ads use tricks, editing, hands off-screen. Follow up: \u201cwhat if it's slower and smaller in real life?\u201d",
      think: "The seed of \u201cads make it look better than it is.\u201d A kid who guesses \u201cmaybe not \u2014 maybe someone was pushing it\u201d has started checking the claim." },
    { scene: "At Halloween, a grown-up you know is dressed up as a scary monster with a mask.",
      ask: "Is it a real monster? How can you tell it's still a person?",
      script: "Reassuring \u2014 this teaches: a costume changes the OUTSIDE, not who's inside. Ask \u201cwhat could you do to check?\u201d (say hi, look at the eyes).",
      think: "Costume = outside changed, person = still there. \u201cIt's just so-and-so in a mask\u201d shows they can look past appearances \u2014 the root of not being fooled." },
    { scene: "A picture on a screen shows a puppy as big as a house, standing next to a tiny person.",
      ask: "Is that a real photo, or did somebody make it up on a computer?",
      script: "Ask what looks impossible. Pictures can be changed now. Follow up: \u201chow big does a real puppy get?\u201d Check it against what they already know.",
      think: "Earliest \u201cpictures can be fake\u201d literacy. Checking a picture against real-world knowledge (puppies aren't house-sized) is a real thinking move." }
  ],
  whoSaysSo: [
    { scene: "Your big cousin says \u201cIf you eat your crusts, your hair will grow curly by morning.\u201d",
      ask: "Who told you that? How would they even KNOW?",
      script: "Playful, not \u201cwho's right.\u201d Ask \u201chas anyone ever seen that happen?\u201d and \u201chow could we find out?\u201d Curiosity, not obedience.",
      think: "The K-sized \u201csays who?\u201d Listen for \u201cthey're just teasing\u201d or \u201clet's check.\u201d Wanting to CHECK a fun claim is the whole point." },
    { scene: "One friend says the playground closes at lunch. Another friend says it stays open all day.",
      ask: "They can't both be right. How could you find out who really knows?",
      script: "Ask \u201cwho would actually know for sure?\u201d Guide to: ask a grown-up in charge, or go look at the sign. Check the source.",
      think: "The move: don't just pick a friend \u2014 go to who'd really know. \u201cAsk the teacher / read the sign\u201d beats \u201cwhoever said it loudest.\u201d" },
    { scene: "A kid on a video says \u201cThis snack makes you run super fast! Buy it!\u201d and then keeps eating it.",
      ask: "How does the kid know it makes you fast? Why might they be saying it?",
      script: "Ask \u201cdid someone maybe pay them to say that?\u201d (real thing!). Follow up: \u201cwho gets something if you believe it?\u201d",
      think: "Earliest \u201cfollow the reason\u201d: the video might be an ad in disguise. A kid who wonders \u201cmaybe they were told to say it\u201d has found the hidden why." },
    { scene: "A grown-up says \u201cbecause I said so\u201d when you ask why you have to do something.",
      ask: "Is \u201cbecause I said so\u201d a reason? What could you ask instead?",
      script: "This is safe curiosity, not back-talk. Model asking kindly: \u201cI'll do it \u2014 I just want to understand why.\u201d A good grown-up will tell you the real reason.",
      think: "Sovereign, not defiant: it's fine to obey AND want the real reason. Listen for a calm \u201ccan you tell me why?\u201d \u2014 asking for reasons respectfully is a life skill." },
    { scene: "Someone says \u201cEVERYBODY knows the tooth fairy leaves TEN dollars now.\u201d",
      ask: "Does \u201ceverybody knows\u201d make it true? Who is \u201ceverybody\u201d?",
      script: "Light and fun. Ask \u201cdid you count everybody? Do you even know who told them?\u201d \u201cEverybody knows\u201d is a push, not proof.",
      think: "The seed of \u201ceverybody knows = check it anyway.\u201d A kid who giggles \u201cthey just made that up\u201d has caught a claim wearing a crowd's costume." }
  ],
  howDoYouFeel: [
    { scene: "A big kid says \u201cCome on, it'll be fun!\u201d but your tummy feels tight and a little scared about it.",
      ask: "What is your tummy trying to tell you? Is it okay to say \u201cno, thanks\u201d?",
      script: "The most important one. Say clearly: that tight feeling is a SIGNAL, and \u201cno\u201d is always allowed, even if someone is bigger or older.",
      think: "You're building the \u201cno\u201d muscle and body-trust. \u201cMy tummy says no, so I can say no\u201d is a safety skill AND sovereignty. Praise it hugely." },
    { scene: "Everyone at the table is laughing at a joke, but you didn't think it was funny \u2014 it felt a little mean.",
      ask: "Do you have to laugh too? What does your own feeling say?",
      script: "Gentle. Name that it's okay to feel different from the group. Ask \u201cwhat did YOU feel, before you looked at everyone else?\u201d",
      think: "Trusting your own read over the crowd. \u201cIt felt mean so I didn't laugh\u201d = a kid who can hold their own signal against peer pressure. That's gold." },
    { scene: "You're really tired and cranky, but a fun show is still playing and you want to keep watching.",
      ask: "What is your body telling you it needs? What does the show want?",
      script: "No lecture \u2014 just noticing. Ask \u201cwho's on your side, your sleepy body or the show that never ends?\u201d Body needs vs. the endless feed.",
      think: "Body-signal vs. a thing designed to keep you hooked. A kid who says \u201cI'm tired, the show just keeps going\u201d has spotted the difference. That's real." },
    { scene: "Someone wants to give you a big hug, but you don't feel like being hugged right now.",
      ask: "Is it okay to say \u201cnot right now\u201d? Whose body is it?",
      script: "Clear and warm: your body is YOURS, and \u201cnot right now\u201d is a full sentence. Offer a wave or high-five as another choice.",
      think: "Body autonomy \u2014 the deepest sovereignty there is. \u201cIt's my body, so I get to choose\u201d is exactly the answer. Never override a real \u201cno\u201d here." },
    { scene: "A snack looks yummy but the first bite tastes yucky to you. A grown-up says \u201cno it doesn't, it's delicious!\u201d",
      ask: "Who knows how it tastes in YOUR mouth? You, or them?",
      script: "Light and respectful. Ask \u201ccan someone else feel your taste for you?\u201d Your own senses are real evidence about your own experience.",
      think: "Trusting your own senses even when someone insists otherwise. \u201cI'm the one tasting it\u201d is a tiny, mighty stand for first-hand experience." }
  ]
};

/* ---- who_told_you layout (mirrors wonder_why) ---- */
function wtyRowHeight(doc, it, w, drawBox, showScript, showAnswers) {
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

function wtyRenderRow(doc, it, num, x, y, w, drawBox, showScript, showAnswers) {
  const modeTag = {
    doYouWant: "DO YOU REALLY WANT IT?", isItReal: "REAL, OR PRETEND?",
    whoSaysSo: "WHO TOLD YOU?", howDoYouFeel: "TRUST YOUR SIGNAL"
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

window.TEMPLATES.spot_the_trick = {
  id: "spot_the_trick",
  label: "Wait \u2014 That's Not a Good Reason! (spotting broken arguments)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Argument literacy: spotting the everyday tricks people use INSTEAD of a real reason \u2014 name-calling, \"everyone's doing it,\" false either/or choices, going in circles, changing the subject, and slippery slopes",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "nameNotReason", label: "Name-calling isn't a reason (attack the point, not the person)" },
        { value: "everyoneDoesIt", label: "\"Everyone's doing it\" (popular isn't the same as right or true)" },
        { value: "falseChoice", label: "The fake either/or (\"you're either with me or against me\")" },
        { value: "sneakyDodge", label: "Circles, dodges & slippery slopes (reasons that go nowhere)" },
        { value: "mixed", label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["nameNotReason", "everyoneDoesIt", "falseChoice", "sneakyDodge"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = sttShuffle(STT_BANKS[mode].slice());
      items.push(Object.assign({ mode }, pools[mode].pop()));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "Wait \u2014 That's Not a Good Reason!";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "A REAL reason is like a bridge: it actually connects to the thing being argued and holds your weight when you walk on it. But when people can't build a real bridge \u2014 or don't want to \u2014 they roll out a fake one. They call you a name instead of answering. They say \"everyone's doing it\" as if a crowd could make something true. They squeeze you into \"you're either with me or against me\" when there are really ten choices. They go in a circle, or dodge to a different subject, or warn that one tiny step leads straight to disaster. None of those is a reason \u2014 they're TRICKS wearing a reason's coat. Your job here isn't to be rude or to win; it's to notice the coat is empty. For each one, spot the trick, name it, and say what a REAL reason would have to do instead. You can still disagree politely \u2014 you just don't get pushed around by a bridge that isn't there.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "You say: \"I don't think we should leave the little kid out of the game.\" Another kid answers: \"Ugh, you're such a baby. Nobody asked you.\" WHAT'S THE TRICK? They didn't answer your point AT ALL \u2014 they attacked YOU (\"baby\") instead. Calling you a name doesn't make leaving the kid out right or wrong; it's a way to change the subject to you so nobody has to think about the actual question. A REAL reason would talk about the GAME and the kid: \"we can't, because the teams would be uneven,\" or \"sure, they can be on my team.\" Notice the move, stay calm, and bring it back: \"That's about me, not about the game. Should we let them play or not?\"",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 128);
    }

    content.items.forEach((it, idx) => {
      const needed = sttRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = sttRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- spot_the_trick helpers ---- */
function sttShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Every item: { text, ask, answer, why }
const STT_BANKS = {
  // Ad hominem / attacking the person instead of the point.
  nameNotReason: [
    { text: "You explain why you think a class rule is unfair. A kid says: \"Whatever, you're just a nerd who loves rules \u2014 sit down.\"",
      ask: "Did they answer your point about the rule? What did they do instead \u2014 and what would a real reason sound like?",
      answer: "No \u2014 they never touched the rule. They attacked YOU (\"nerd\") to make you stop talking. A real reason would say WHY the rule is fair or unfair.",
      why: "Calling you a name is not an argument \u2014 it's a way to dodge one. Whether the rule is fair has nothing to do with whether you're a nerd; those are two completely different subjects. This trick works by making you defend YOURSELF instead of your point. The sovereign move: don't take the bait. \"That's about me. I'm asking about the rule \u2014 is it fair or not?\"" },
    { text: "Someone shares an idea in class. Another kid whispers: \"Don't listen to him, he still can't tie his own shoes.\"",
      ask: "Does not being able to tie shoes make his IDEA wrong? What's being attacked \u2014 the idea, or the person?",
      answer: "No \u2014 shoe-tying has nothing to do with whether the idea is good. The person is being attacked, not the idea.",
      why: "A good idea is a good idea even if the person who said it is little, messy, or bad at something else. Judging an idea by who said it (instead of by whether it's actually true or helpful) is one of the oldest tricks there is. Ask the real question: forget WHO said it \u2014 is the idea any good?" },
    { text: "At dinner you disagree with an older cousin. He laughs: \"You're eight. You don't get to have an opinion.\"",
      ask: "Is \"you're eight\" a reason your point is wrong? What is he really doing?",
      answer: "No \u2014 your age isn't proof you're wrong. He's dismissing YOU so he doesn't have to answer what you actually said.",
      why: "\"You're too young/old/new to have an opinion\" attacks the person, not the point. Sometimes younger people are right and older people are wrong \u2014 age doesn't decide truth, reasons do. If your point is actually weak, he could just SHOW that. Reaching for your age instead is a sign he can't. Stay steady: \"My age isn't the question. Is what I said true or not?\"" },
    { text: "A kid makes a fair point about sharing the ball. You feel annoyed and shoot back: \"Yeah, well, you smell weird.\"",
      ask: "Catch YOURSELF this time. Did you answer their point? What honest thing could you say instead?",
      answer: "No \u2014 \"you smell weird\" attacks them and ignores the ball point entirely. Honest options: agree if they're right, or give a real reason you disagree.",
      why: "This trick is just as easy to DO as to fall for \u2014 when we're losing or embarrassed, our mouth reaches for an insult instead of an answer. Catching it in yourself is the real skill. If they're right, the brave move is \"okay, fair.\" If you truly disagree, say WHY about the ball. Insults feel like winning for a second, but everyone watching can tell you ran out of reasons." },
    { text: "You point out a mistake in a game's scoring. The other player says: \"You only care because you're a sore loser.\"",
      ask: "Even IF you were a sore loser \u2014 would that change whether the score was actually counted wrong?",
      answer: "No \u2014 the score is either counted wrong or it isn't, no matter how you feel about losing. He's talking about your feelings to avoid checking the math.",
      why: "This is a sneaky version: instead of an insult, he guesses your secret MOTIVE (\"you're just a sore loser\") to wave your point away. But your motive and the actual score are two separate things. Even a genuine sore loser can be right about a miscount! The fix is simple and hard to argue with: \"Let's just recount it and see.\" Check the thing itself." }
  ],
  // Bandwagon / appeal to popularity + peer pressure. Popular != true or right.
  everyoneDoesIt: [
    { text: "\"You HAVE to get the new game \u2014 literally everyone in the class has it. You're the only one who doesn't.\"",
      ask: "Does lots of people having it make it good FOR YOU? What real reasons would actually help you decide?",
      answer: "No \u2014 popular doesn't mean good, needed, or right for you. Real reasons: do you enjoy that kind of game, is it worth the money/time, do your folks agree.",
      why: "\"Everyone has it\" is a push, not a proof. Even if it were true that everyone has it (it usually isn't \u2014 \"everyone\" is almost always an exaggeration), a crowd liking something doesn't make it a good choice for YOU. Lots of people have been wrong about lots of things at once. Decide by whether the thing is actually good for your life, not by the size of the crowd." },
    { text: "\"Everybody knows the deep end has sharks in it. All the big kids say so, so it's true.\"",
      ask: "Does the NUMBER of people saying it make it true? How could you actually find out?",
      answer: "No \u2014 a hundred people repeating a scary rumour is still just a rumour. You find out by checking: ask a lifeguard, look, or think about whether pools even have sharks.",
      why: "This is the bandwagon trick aimed at TRUTH instead of shopping. Repeating something loudly and often makes it feel true, but feelings aren't facts. A rumour passed kid-to-kid gets more confident every time it's told, without ever getting checked. \"Everybody knows\" is your signal to slow down and ask: how would anybody actually KNOW that? Truth is decided by checking, not by counting voices." },
    { text: "Some kids are teasing a classmate and one says to you: \"Come on, everyone's doing it. Don't be weird.\"",
      ask: "Does 'everyone doing it' make teasing okay? What are they really trying to get you to do?",
      answer: "No \u2014 lots of people doing something wrong doesn't turn it right; it just makes it a bigger wrong. They're using the crowd to pressure you into joining.",
      why: "This is the most important version to catch, because it uses \"everyone\" as a leash to pull you somewhere you don't want to go. A crowd can be cruel; being one more in it doesn't share out the wrong until it disappears. The number of people doing a thing has NOTHING to do with whether it's kind or fair. You're allowed to be the one who says \"no thanks\" \u2014 that's not being weird, that's steering your own ship." },
    { text: "\"This video has a million likes, so what it says must be right.\"",
      ask: "Can a million people be wrong about the same thing? What actually makes something right \u2014 likes, or evidence?",
      answer: "Yes, a million people can absolutely be wrong together. Likes measure how POPULAR something is, not whether it's TRUE. Truth needs evidence you can check.",
      why: "Likes are a popularity score, not a truth score \u2014 and often the wildest, most exciting claims get the most likes exactly because they're exciting, not because they're accurate. History is full of things almost everyone believed that turned out false. So a big number tells you a video spread far; it tells you nothing about whether it's correct. Ask the separate question: what's the actual evidence?" },
    { text: "\"If you don't like the same band as us, you can't sit here. Everyone at this table likes them.\"",
      ask: "Is 'everyone here likes it' a reason YOU have to? What does this rule actually protect \u2014 good taste, or the group's power?",
      answer: "No \u2014 the group liking something isn't a reason you must, or that the band is even good. The rule isn't about music; it's about controlling who belongs.",
      why: "Watch how \"everyone here agrees\" quietly turns into a rule you have to obey or get pushed out. That's the crowd being used as a fence. Your taste is yours \u2014 liking or not liking a band is not a right-or-wrong you can fail. A group that only lets you belong if you copy them isn't offering friendship, it's offering a costume. Real belonging survives you liking different things." }
  ],
  // False dilemma / false choice. Only two options offered when more exist.
  falseChoice: [
    { text: "\"You either give me your dessert or you're not really my friend. Pick one.\"",
      ask: "Are those really the ONLY two choices? Name a third one they left out.",
      answer: "No \u2014 that's a fake either/or. A third choice: stay friends AND keep your dessert. Real friends don't charge a fee.",
      why: "This trick jams a whole world of choices down to just two, and rigs it so one is scary (\"not really my friend\"). But friendship and dessert have nothing to do with each other \u2014 someone stapled them together to pressure you. Whenever you hear \"either X or you're a bad person,\" go looking for the door they hid: \"I can keep my dessert and still be your friend. Those aren't opposites.\"" },
    { text: "\"You're either with our team or you're against us. There's no in-between.\"",
      ask: "Is 'no in-between' actually true? What are some in-between spots they're pretending don't exist?",
      answer: "No \u2014 there's tons of in-between: cheering for both, staying neutral, liking some players on each side, not caring about the game at all.",
      why: "\"You're either with us or against us\" is a famous trick used by tiny kid-arguments AND huge grown-up ones. It works by pretending the whole middle of the road disappeared, so you feel forced to pick a side and defend it. But almost nothing in real life is only two options. Naming the in-between (\"I'm not against you, I just don't want to pick a side\") pops the trap instantly." },
    { text: "\"Either we watch MY show right now, or you've ruined the whole night.\"",
      ask: "Are those the only outcomes? What's a fair option they skipped?",
      answer: "No \u2014 skipped options: take turns, pick a show you both like, do something else together, watch it later. The night isn't ruined by not getting your way.",
      why: "This one hides a threat inside the fake choice: \"do what I want, OR you're the villain who wrecked everything.\" It loads all the blame onto you for not obeying. But \"my way or disaster\" almost always has a calm middle you can offer instead. When someone gives you exactly two options and one is a catastrophe, that's your cue: they're trying to skip past fairness. Slow down and add the option they erased." },
    { text: "A kid says: \"Real kids play sports. If you like reading, you're basically a robot.\"",
      ask: "Are 'plays sports' and 'likes reading' really opposite teams you must choose between?",
      answer: "No \u2014 tons of people do both, or neither, or one and not the other. There's no rule that you're only allowed to be ONE kind of kid.",
      why: "This fake choice tries to sort all of humanity into two boxes and shame you into the 'cool' one. But people aren't one-or-the-other \u2014 you can love soccer AND books, or invent a third thing entirely. Any argument that says \"you're either THIS type or THAT type\" is usually selling you a box you don't have to climb into. You get to be a mix, and you get to change." },
    { text: "\"We can go to the park OR do homework. So if you make me do homework, we can never have fun again.\"",
      ask: "Catch the leap: does 'homework now' really mean 'no fun EVER'? What choice got skipped?",
      answer: "No \u2014 homework first and park after is a choice; fun isn't gone forever. \"Never again\" is a huge exaggeration bolted onto a small either/or.",
      why: "This mixes a fake choice with a giant exaggeration \u2014 two tricks in one. It pretends the only options are \"all fun\" or \"all homework, forever,\" when the obvious real answer is \"do the homework, THEN have fun.\" When someone stretches a small \"not right now\" into \"never ever,\" they're trying to make a reasonable limit feel like a tragedy. Cut it back to true size." }
  ],
  // Circular reasoning + red herring (changing the subject) + slippery slope.
  sneakyDodge: [
    { text: "You ask WHY you have to do it. The answer: \"Because it's the rule.\" You ask why that's a good rule. \"Because those are the rules.\"",
      ask: "Did the answer actually give a REASON, or just say the same thing again in a circle?",
      answer: "Just a circle \u2014 \"it's the rule because it's the rule\" never explains WHY. A real answer would say what the rule is FOR (safety, fairness, etc.).",
      why: "This is called going in circles: the \"reason\" is just the thing you asked about, said again. It sounds like an answer but it's empty \u2014 like saying \"it's true because it's true.\" Good rules usually have a real WHY behind them (this keeps you safe, this keeps it fair). Asking \"what is this rule FOR?\" is polite and powerful \u2014 and if there's no answer but the circle, that's worth noticing." },
    { text: "You say: \"I think the story we read was kind of boring.\" A kid fires back: \"Oh yeah? Well YOUR handwriting is terrible!\"",
      ask: "What were you talking about? What did they switch it to \u2014 and why might someone do that?",
      answer: "You were talking about the story; they switched to your handwriting. That's a total change of subject to avoid discussing the story.",
      why: "This trick is called changing the subject (some people call it a \"red herring\" \u2014 a smelly fish dragged across a trail to throw the dogs off). When someone suddenly brings up something unrelated, it's often because they don't have an answer for what you ACTUALLY said. Your handwriting has zero to do with the story. Gently steer back: \"That's a different topic. I was saying the story felt boring \u2014 what did you think of IT?\"" },
    { text: "\"If we let you stay up ten minutes late tonight, then tomorrow it'll be an hour, then you'll never sleep, then you'll fail school and live in a cave.\"",
      ask: "Does ten minutes late REALLY lead all the way to living in a cave? Where does the chain get silly?",
      answer: "No \u2014 that's a wild slide. Ten late minutes doesn't force any of the next steps; each 'then' is just assumed, not shown. The chain gets silly almost immediately.",
      why: "This is the slippery slope trick: pretend one small step MUST tumble all the way to disaster, so the small step sounds terrifying. But real life has brakes \u2014 you can be up ten minutes late tonight and totally normal tomorrow. The trick skips the part where it PROVES each step causes the next; it just chains scary words together. Ask: does step one really force step two? Usually it doesn't." },
    { text: "\"I'm right because I'm older, and I know I'm right because older people are just right about things.\"",
      ask: "Is there any actual EVIDENCE in there, or does the reason just loop back to itself?",
      answer: "No evidence \u2014 it loops: \"I'm right because I'm older, and older means right.\" It never checks whether the actual claim is true.",
      why: "Another circle, dressed up with age. \"I'm right because older people are right\" assumes the very thing it's supposed to prove. Being older can mean more experience \u2014 but it doesn't automatically make any single statement true. The way OUT of a circle is always the same: leave the loop and go check the actual thing. \"Okay, but let's look at whether the CLAIM itself holds up, not who said it.\"" },
    { text: "You catch a friend fibbing. He says: \"Why are you even worried about that? Look, do you want to come to my birthday party or not?\"",
      ask: "Did he answer about the fib? What did he wave in front of you instead \u2014 and why then?",
      answer: "No \u2014 he dodged to the birthday party to distract you from the fib. A shiny new topic (especially a nice one) is being used to change the subject.",
      why: "Changing the subject isn't always an insult \u2014 sometimes it's something PLEASANT dangled to make you forget the point (\"ooh, party!\"). It works the same way: pull your attention somewhere else so the hard question quietly disappears. Notice the swap and hold your ground kindly: \"I'd love the party \u2014 but that's separate. Can we finish talking about what happened first?\" You can be nice AND not get steered." }
  ]
};

/* ---- spot_the_trick layout (mirrors is_that_true/trade_offs row layout) ---- */
function sttRowHeight(doc, it, w, explain, showAnswers) {
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

function sttRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    nameNotReason: "NAME-CALLING \u2260 A REASON", everyoneDoesIt: "\"EVERYONE'S DOING IT\"",
    falseChoice: "THE FAKE EITHER/OR", sneakyDodge: "CIRCLE / DODGE / SLIPPERY SLOPE"
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

  // The situation / thing someone says
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
   TEMPLATE — FIGURE IT OUT (real-world problem solving & self-reliance)
   The library reasons brilliantly about IDEAS (fairness, incentives,
   trade-offs, spin). What it lacked was a sheet for the most sovereign
   skill of all: when you hit a real, everyday problem, YOU can think
   your way through it — break it down, decide what matters first, work
   a fix instead of waiting to be rescued, and see trouble coming before
   it arrives. Nothing here is "the one right answer to memorize." We
   want the child's OWN plan and, above all, the reasoning behind it.
   Modes:
     breakDown  — a big job feels huge; cut it into first-then-then steps
     whatFirst  — several things at once; reason the order (what matters most)
     whenStuck  — something went wrong; think toward a fix, don't freeze
     bePrepared — think ahead: what might go wrong, and what's your plan?
     mixed      — a bit of each
   Deterministic, never calls AI. Mirrors the trade_offs row layout.
============================================================ */
window.TEMPLATES.figure_it_out = {
  id: "figure_it_out",
  label: "Figure It Out (real-world problem solving)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Practical problem-solving & self-reliance: breaking jobs into steps, ordering what matters, working a fix, and thinking ahead",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "breakDown",  label: "Break it down (turn a big job into small steps)" },
        { value: "whatFirst",  label: "What first? (put things in a smart order)" },
        { value: "whenStuck",  label: "When it goes wrong (work a fix, don't freeze)" },
        { value: "bePrepared", label: "Think ahead (what might go wrong — and your plan)" },
        { value: "mixed",      label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["breakDown", "whatFirst", "whenStuck", "bePrepared"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = fioShuffle(FIO_BANKS[mode].slice());
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
    const title = "Figure It Out";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Here's a power nobody can ever take from you: when something goes sideways, YOU can figure it out. You don't have to wait for someone to swoop in and fix it. A problem that feels too big usually just needs breaking into small steps. A pile of things all at once just needs a smart order. When something breaks, the first move is to think, not to panic. And the sharpest move of all is seeing trouble coming before it shows up. For each one, make YOUR plan — there's no single right answer, only good thinking. Say WHY it's your plan.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"You want to make a sandwich but the whole thing feels like a lot.\"  ->  Break it into steps you can actually do: (1) get the bread out, (2) get what goes inside, (3) build it, (4) clean up. Suddenly it's not one huge job — it's four little ones, and you can start step 1 right now. That's the whole trick: a big thing is just small things in a row.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 100);
    }

    content.items.forEach((it, idx) => {
      const needed = fioRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = fioRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- figure_it_out content banks ---- */
function fioShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the real-world situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model plan (answer key only — one good option, not THE answer)
//   why    = the reasoning, plain kid language, self-reliant/sovereign voice
const FIO_BANKS = {
  breakDown: [
    { text: "Your room is a total mess and cleaning it feels impossible.",
      ask: "Break it into 3 or 4 small steps. What's step one?",
      answer: "e.g. (1) books on the shelf, (2) clothes in the hamper, (3) toys in the bin, (4) trash out. Start with one corner.",
      why: "A big mess isn't one giant job — it's a bunch of tiny jobs stacked up. Name the small steps and the 'impossible' pile turns into 'do this, then that.' You can always start step one, even when the whole thing feels like too much." },
    { text: "You want to build a fort but you don't know where to begin.",
      ask: "Break the fort into steps. What has to happen first, second, third?",
      answer: "e.g. (1) pick the spot, (2) gather blankets/chairs, (3) build the frame, (4) make a door. First things first.",
      why: "Every build has an order. You can't put the roof on before there's something to hold it up. Figuring out what MUST come first is half the job — then you just follow your own steps." },
    { text: "You have to pack your own bag for a day trip.",
      ask: "Break it down: how do you make sure you don't forget anything?",
      answer: "e.g. picture the whole day in your head, then pack for each part: snack, water, jacket, thing to do.",
      why: "The trick for 'don't forget stuff' is to walk through the day in your mind, moment by moment, and pack for each moment. Thinking it through beats hoping you'll remember." },
    { text: "You want to learn to tie your shoes and it seems too hard.",
      ask: "Break the skill into small pieces. What's the very first piece to practice?",
      answer: "e.g. (1) make one loop, (2) make the second, (3) cross them, (4) pull. Practice just the loop first.",
      why: "Hard skills are just easy pieces you haven't split apart yet. Learn one piece at a time and the 'too hard' thing becomes a thing you CAN do. Nobody's born knowing it — they broke it down." },
    { text: "You're helping make dinner and there's a lot to do.",
      ask: "Break the job into steps and pick a sensible order. Where do you start?",
      answer: "e.g. wash hands, get ingredients out, do the slow-cooking thing first, set the table while it cooks.",
      why: "When there's a lot to do, list the steps and notice which ones take the longest — start those first so they cook while you do the quick stuff. Ordering your steps IS the skill." }
  ],
  whatFirst: [
    { text: "You spill your water AND the phone is ringing AND your little sibling is crying.",
      ask: "Which do you handle first, and why? Put them in order.",
      answer: "e.g. check the crying sibling (are they hurt?), then the spill (before it spreads), then the phone. Safety first.",
      why: "When everything happens at once, ask 'what's most important, and what can't wait?' A person comes before a puddle; a puddle before a ringing phone. You decide the order on purpose instead of freezing." },
    { text: "It's bedtime soon and you still have to brush teeth, put on pajamas, and put a toy away.",
      ask: "What order gets it all done best? Why that order?",
      answer: "e.g. put the toy away first (quick, out of the way), pajamas, then brush teeth last so your mouth stays clean.",
      why: "Smart order means thinking about which step should come LAST. Teeth last so nothing un-cleans them. There's usually a reason one order beats another — find it, don't just do things randomly." },
    { text: "You have homework, a chore, and a show you want to watch, but not enough time for all three.",
      ask: "What comes first, and what might have to wait? Explain your order.",
      answer: "e.g. the things that MUST happen (homework, chore) before the thing that's just fun (show). Wants wait for needs.",
      why: "When time is tight, do the must-dos before the want-to-dos. It's not that fun doesn't matter — it's that if you flip the order, the fun eats the time and the important stuff doesn't get done." },
    { text: "You're leaving for school in ten minutes and you haven't eaten, dressed, or found your shoes.",
      ask: "In what order do you tackle these? Why?",
      answer: "e.g. dress + shoes first (can't leave without them), grab food you can eat on the way. Do the can't-skip things first.",
      why: "When the clock's running, do the things you absolutely CAN'T leave without first, and find the ones you can do 'on the go.' Ordering by 'what can't be skipped' keeps you from getting stuck." },
    { text: "A friend and your teammate both ask for help at the same time.",
      ask: "How do you decide who to help first? What matters here?",
      answer: "e.g. ask what each needs — someone hurt or stuck now comes before someone who can wait a minute.",
      why: "You can't do two things at once, so you have to choose — and choosing well means asking 'which one really can't wait?' It's okay to tell the other 'one sec, I'll be right there.'" }
  ],
  whenStuck: [
    { text: "Your bike chain slips off while you're riding.",
      ask: "What's your first move — before asking for help? Think it through.",
      answer: "e.g. stop safely, look at what happened, try to slip the chain back on the gear, then ask if it won't go.",
      why: "When something breaks, the first move is to LOOK and think, not to panic or instantly yell for help. Most problems have a next step you can try yourself. Asking for help is fine — after you've had a real look." },
    { text: "You're building something and a piece won't fit no matter how hard you push.",
      ask: "Forcing it isn't working. What do you try instead?",
      answer: "e.g. stop pushing, check if it's the right piece or the right way around, look for what's blocking it.",
      why: "When forcing something doesn't work, harder-forcing usually just breaks it. Stuck is a signal to STOP and figure out WHY it won't go — wrong piece? backwards? — instead of muscling through blind." },
    { text: "You're drawing and you make a mistake you can't erase.",
      ask: "The mistake is there. Now what? Come up with a plan.",
      answer: "e.g. turn it into part of the drawing, draw over it, or start that bit again — a mistake isn't the end.",
      why: "A mistake isn't a dead end, it's just where you are now. Sharp problem-solvers ask 'okay, given this, what CAN I do?' instead of getting stuck on 'I wish it hadn't happened.' You work with what's real." },
    { text: "You're lost in a big store and can't see your grown-up.",
      ask: "What's your plan? Think it through calmly, step by step.",
      answer: "e.g. stay put or go to a worker/cashier (a safe helper), say your grown-up's name, don't wander or leave with a stranger.",
      why: "Even scary problems have a plan. The smart move when lost is usually to STOP wandering and find a safe helper (a worker at a counter). Having a plan in your head beforehand means you don't freeze when it counts." },
    { text: "Your tower of blocks keeps falling down every time you build it tall.",
      ask: "It failed the same way twice. What do you change next time?",
      answer: "e.g. make the bottom wider/sturdier, use the flat blocks low down — change the base, not just try again harder.",
      why: "If something fails the SAME way twice, doing the exact same thing won't fix it. The clue is in HOW it fell. Change what caused it — a wobbly base — instead of just rebuilding and hoping. That's learning from the fail." }
  ],
  bePrepared: [
    { text: "You're going to ride your bike far from home this afternoon.",
      ask: "What might go wrong, and what would you bring or plan for it?",
      answer: "e.g. it could get dark or you could get thirsty/hurt — bring water, tell someone your plan, know the way back.",
      why: "Thinking ahead is a superpower: you ask 'what could go wrong?' BEFORE it does, so you're ready. A little planning now saves a big problem later. That's not worrying — it's being your own backup." },
    { text: "There's a big storm coming tonight and the power might go out.",
      ask: "What could you get ready NOW, before it happens?",
      answer: "e.g. find a flashlight, know where blankets are, charge things, fill water — set up before the lights go.",
      why: "The best time to solve a problem is before it starts. Once the power's out it's hard to find a flashlight in the dark — so you find it while you still can. Thinking one step ahead makes the future-you's life way easier." },
    { text: "You have a big show-and-tell tomorrow and you don't want to forget your thing.",
      ask: "What can you do tonight so tomorrow goes smoothly?",
      answer: "e.g. put the item right by the door or in your bag NOW, so morning-you can't forget it.",
      why: "Don't count on remembering in a rushed morning — set it up tonight so it's impossible to forget. Smart people don't rely on luck or memory; they build a little trap that makes the right thing happen automatically." },
    { text: "You're about to pour your own cereal and milk for the first time.",
      ask: "What might spill or go wrong, and how do you set up to avoid it?",
      answer: "e.g. small pours, bowl over the counter not the edge, don't overfill — go slow the first time.",
      why: "Before doing something new, run it in your head and spot where it could go wrong. Then set up so it doesn't — pour slow, catch spills early. Thinking through it first is how you do new things without a mess." },
    { text: "It might rain during your walk to a friend's house.",
      ask: "What would you check or bring, just in case? Make a plan.",
      answer: "e.g. look at the sky/check the forecast, bring a jacket or umbrella, or plan to go before the rain.",
      why: "'Just in case' thinking means preparing for the maybe, not just the sure thing. A little check and a jacket cost you almost nothing — and save you from a soggy walk. Being ready beats being surprised." }
  ]
};

/* ---- figure_it_out layout (mirrors trade_offs row layout) ---- */
function fioRowHeight(doc, it, w, explain, showAnswers) {
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

function fioRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    breakDown: "BREAK IT DOWN", whatFirst: "WHAT FIRST?",
    whenStuck: "WHEN IT GOES WRONG", bePrepared: "THINK AHEAD"
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

/* ============================================================
   SEE IT THEIR WAY — perspective-taking / theory-of-mind
   Given a real situation, work out what each person KNOWS,
   WANTS and FEELS — and why that makes them act differently.
   Sovereign framing: read people so nobody can play you;
   understand motives to think clearly, not to obey or please.
   Modes:
     knowGap   — different people KNOW different things
     wantWhy   — what does each side actually WANT (the real goal)
     feelRead  — read the feeling under the behaviour
     playedYou — someone wants something FROM you: name it
     mixed     — a bit of each
   Deterministic, never calls AI. Mirrors the figure_it_out layout.
============================================================ */
window.TEMPLATES.see_it_their_way = {
  id: "see_it_their_way",
  label: "See It Their Way (read people, don't get played)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Perspective-taking & motive-reading: what each person knows, wants and feels — and why they act on it",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "knowGap",   label: "Who knows what? (people know different things)" },
        { value: "wantWhy",   label: "What do they really want? (the goal under the words)" },
        { value: "feelRead",  label: "Read the feeling (what's under the behaviour)" },
        { value: "playedYou", label: "What do they want FROM you? (spot the pitch)" },
        { value: "mixed",     label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["knowGap", "wantWhy", "feelRead", "playedYou"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = sitwShuffle(SITW_BANKS[mode].slice());
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
    const title = "See It Their Way";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Everybody walks around with a different picture in their head. Two people can look at the exact same thing and see something totally different — because they KNOW different stuff, they WANT different stuff, and they FEEL different stuff. This isn't about being nice or agreeing with everyone. It's a power: when you can figure out what someone knows, wants, or feels, you can understand why they're acting the way they are — and nobody can play you, because you can see what they're really after. For each one, work out the other person's picture. There's no single right answer, only good reading of people. Say WHY you think so.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"Your friend is grumpy and snaps at you. You didn't do anything.\"  ->  Before deciding they're mad at YOU, ask what's in THEIR picture that you can't see. Maybe they're tired, hungry, or something went wrong at home that has nothing to do with you. Reading the feeling under the snap ('they're having a rough one') means you don't take it personally AND you know how to handle it. You're not guessing at YOUR feelings — you're reading THEIRS.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 108);
    }

    content.items.forEach((it, idx) => {
      const needed = sitwRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = sitwRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- see_it_their_way content banks ---- */
function sitwShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the real-world situation the child reads
//   ask    = the perspective-taking prompt (mode-specific)
//   answer = short model read (answer key only — one good option, not THE answer)
//   why    = the reasoning, plain kid language, sovereign/motive-reading voice
const SITW_BANKS = {
  knowGap: [
    { text: "You know a surprise party is planned. Your friend walks in looking confused and a little upset that everyone got quiet.",
      ask: "What does your friend know right now that's different from what YOU know?",
      answer: "e.g. they don't know it's a party — from their side, everyone just went weirdly silent, which feels bad.",
      why: "You've got a piece of the picture they don't have. Their confusion makes total sense from inside THEIR head. Remembering 'they don't know what I know' stops you thinking they're being weird — they're just missing a piece." },
    { text: "You've read a book three times. Your little sibling has never heard the story and keeps asking what happens next.",
      ask: "Why do the questions feel obvious to you but not to them?",
      answer: "e.g. you already know the ending; they're hearing it for the first time, so of course they can't guess.",
      why: "What's 'obvious' is only obvious once you know it. They're not slow — they just haven't got the same information yet. Nobody's born knowing the ending. When you remember that, you explain instead of getting annoyed." },
    { text: "A new kid at the park doesn't know the game you all made up, so they keep 'breaking the rules.'",
      ask: "Are they cheating, or is something else going on? What don't they know?",
      answer: "e.g. they never learned the rules you invented — you can't break rules nobody told you.",
      why: "Before you decide someone's doing wrong, ask 'did they even KNOW the rule?' A rule that only lives in your head isn't a rule they broke — it's a rule they never got. Reading the know-gap keeps you from blaming the wrong thing." },
    { text: "Your grown-up says 'we can't get that toy right now' and you don't understand why not.",
      ask: "What might your grown-up know about money or plans that you can't see?",
      answer: "e.g. they might know the money's needed for something else, or there's a plan you don't know about.",
      why: "Grown-ups often see a bigger picture — bills, plans, what's coming up — that you don't get shown. 'No' isn't always about you. Asking 'what do they know that I don't?' turns a mystery into a fair question you can actually ask." },
    { text: "You point at something and say 'look at that!' but your friend can't figure out what you mean.",
      ask: "Why can't they see what you're pointing at as easily as you can?",
      answer: "e.g. they're standing somewhere else and don't have the thing in your head — you have to say what it is.",
      why: "You can see the thing AND you know what you meant. They only have your pointing finger. People aren't in your head — if you want them to get it, you have to hand them the missing piece with your words." }
  ],
  wantWhy: [
    { text: "A kid keeps saying your drawing is 'not that good' and offers to 'help' by taking over.",
      ask: "What do they actually WANT here? (Hint: it might not be to help you.)",
      answer: "e.g. they might want to be in charge / feel like the better artist — not to help you get better.",
      why: "Watch what someone DOES, not just what they say. 'I'm helping' plus 'let me take over' plus 'yours isn't good' usually adds up to 'I want control,' not 'I want you to win.' Naming the real want means you can say 'thanks, I've got it.'" },
    { text: "Your sibling suddenly offers to share their candy with you — right before asking you to do their chore.",
      ask: "What's the real goal behind the sudden kindness? What do they want?",
      answer: "e.g. they want you to do their chore; the candy is a trade to make you say yes.",
      why: "When someone's extra nice right before they ask for something, the niceness might be the price they're paying to get the thing. That's not always bad — but see the deal for what it is, so YOU decide if the trade is fair." },
    { text: "Two friends both want to play a different game and each says the other is 'being unfair.'",
      ask: "What does each one really want underneath the argument?",
      answer: "e.g. each one wants to play their own favourite game — they both want the same thing (their way).",
      why: "Most fights aren't about who's 'unfair' — they're two people wanting different things at once. When you name what each side actually wants, the fight turns into a problem you can solve, like taking turns, instead of a battle over who's right." },
    { text: "A grown-up at a store smiles big and says the toy is 'the best one, everybody's getting it!'",
      ask: "What does the store person WANT to happen? Does that change how you hear it?",
      answer: "e.g. they want you to buy it — that's their job — so 'best one' is a sales line, not a fact.",
      why: "Always ask 'what does this person get if I say yes?' The store makes money when you buy. That doesn't make them evil — but it means their glowing words are aimed at YOUR wallet, so you weigh them lightly and decide for yourself." },
    { text: "Your friend really wants you to pick THEIR seat / THEIR movie and keeps saying 'come onnn, please?'",
      ask: "What do they want, and what do YOU want? Are those the same?",
      answer: "e.g. they want their pick; you might want yours or not care — figure out YOUR want before you cave.",
      why: "When someone pushes hard for what THEY want, it's easy to forget you get a want too. Naming both wants — theirs and yours — lets you choose on purpose instead of just going along because they asked loudest." }
  ],
  feelRead: [
    { text: "Your friend loses the game and goes quiet, then says 'I didn't even want to play anyway.'",
      ask: "What are they probably really feeling under those words?",
      answer: "e.g. they're likely disappointed about losing — the 'didn't want to' is covering up feeling bad.",
      why: "People don't always say the feeling straight. 'I didn't care anyway' after losing usually means 'I cared and it stings.' Reading the feeling under the words means you get it right instead of arguing with the cover story." },
    { text: "A kid is being loud and bossy, ordering everyone around the playground.",
      ask: "What might they be feeling that makes them act bossy?",
      answer: "e.g. maybe they feel unsure or left out and are grabbing control to feel safe or important.",
      why: "Big loud behaviour often hides a small worried feeling. Bossy can mean 'I'm scared no one will pick me.' You don't have to obey them — but reading the feeling underneath means you understand it instead of just calling them mean." },
    { text: "Your grown-up seems short and snappy tonight and you can't figure out why.",
      ask: "What could they be feeling, and is it likely about you?",
      answer: "e.g. they might be tired or stressed from their day — probably not about you at all.",
      why: "When someone's off, the first question isn't 'what did I do?' — it's 'what might THEY be carrying?' Grown-ups have whole days you didn't see. Reading their feeling stops you from taking on blame that was never yours." },
    { text: "A friend keeps making jokes and laughing but their eyes look kind of sad.",
      ask: "Which do you trust more — the jokes or the eyes? What might they feel?",
      answer: "e.g. the face can say more than the joke — they might be sad and covering it with laughing.",
      why: "People can say 'I'm fine' with their mouth while their face says otherwise. When words and body don't match, the body's usually more honest. Reading both means you can gently check in instead of believing the mask." },
    { text: "Your little sibling breaks something of yours and immediately gets very quiet and small.",
      ask: "What are they feeling, and how does knowing that change what you do?",
      answer: "e.g. they probably feel scared or sorry already — yelling won't teach more than they've learned.",
      why: "Reading that someone already feels bad changes your smartest move. If they're scared and sorry, piling on does nothing useful. You can be upset AND read that the lesson already landed. That's using your head, not just your temper." }
  ],
  playedYou: [
    { text: "An ad shows kids having the BEST time with a toy and says 'you'll be the coolest kid with this!'",
      ask: "What does the ad want you to DO, and what feeling is it poking to get it?",
      answer: "e.g. it wants you to buy the toy; it pokes the wish to be cool/fit in so you'll want it more.",
      why: "Ads aren't your friend — they're a pitch. Ask 'what do they want me to do?' (buy) and 'what feeling are they using?' (wanting to be cool). Once you SEE the trick, it loses its grip. You can still want the toy — but on your terms, not theirs." },
    { text: "A kid says 'if you were really my friend, you'd give me your snack.'",
      ask: "What do they want, and what feeling are they using to get it?",
      answer: "e.g. they want your snack; they're using the fear of not being a 'real friend' to pressure you.",
      why: "'If you were really my friend, you'd...' is a squeeze — it uses your feelings to get a thing. A real friend doesn't charge you snacks to stay friends. Spotting the move means you can say no without feeling tricked into yes." },
    { text: "Someone says 'everybody's doing it, don't be the only one who won't.'",
      ask: "What are they after, and why bring up 'everybody'? Does 'everybody' make it right?",
      answer: "e.g. they want you to go along; 'everybody' is a push to make you scared of standing out — not a reason.",
      why: "'Everybody's doing it' isn't a reason, it's a lever — it uses the fear of being left out. Whether lots of people do a thing has nothing to do with whether it's good for YOU. Seeing the lever lets you decide on the actual question." },
    { text: "A grown-up you don't know well offers you something and says 'it'll be our little secret.'",
      ask: "What do they want, and what should the word 'secret' make you notice?",
      answer: "e.g. a 'secret' between you and a grown-up you don't know is a red flag — tell a grown-up you DO trust.",
      why: "Anyone asking a kid to keep a secret FROM their safe grown-ups is doing something a good person wouldn't need to hide. That's not a trick to solve alone — it's a signal to walk away and tell someone you trust. Reading the ask keeps you safe." },
    { text: "A video keeps saying 'don't skip! watch till the end!' and 'smash that button now!'",
      ask: "What does the video want from you, and why is it pushing so hard?",
      answer: "e.g. it wants your time and clicks (that's how it wins) — the pushing is to keep YOU, for THEM.",
      why: "Anything begging you to 'keep watching' or 'click now' wins something when you do — usually your attention, which is worth money to them. It's fine to watch what you like — but YOU decide when you're done, not the voice trying to keep you." }
  ]
};

/* ---- see_it_their_way layout (mirrors figure_it_out row layout) ---- */
function sitwRowHeight(doc, it, w, explain, showAnswers) {
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

function sitwRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    knowGap: "WHO KNOWS WHAT?", wantWhy: "WHAT DO THEY WANT?",
    feelRead: "READ THE FEELING", playedYou: "WHAT DO THEY WANT FROM YOU?"
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

/* ============================================================
   SPIN DETECTOR — "Same Fact, Different Spin"
   Media/manipulation literacy: separate the bare EVENT from the
   STORY someone tells about it. The same true thing can be dressed
   in words that make you feel proud, scared, or angry — the facts
   didn't change, the framing did. Sovereign voice: strip the spin,
   look at what actually happened, decide for yourself.
============================================================ */
window.TEMPLATES.spin_detector = {
  id: "spin_detector",
  label: "Same Fact, Different Spin (strip the spin, see what happened)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Media literacy: separating the bare event from the framing / loaded language used to steer your feelings",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking skill",
      options: [
        { value: "sameFact",     label: "Same fact, two spins (what actually happened?)" },
        { value: "loadedWords",  label: "Spot the feeling-word (which word is pushing you?)" },
        { value: "whatsLeftOut", label: "What did they leave out? (the missing piece)" },
        { value: "nameIt",       label: "Spin or straight? (is this a report or a sell?)" },
        { value: "mixed",        label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["sameFact", "loadedWords", "whatsLeftOut", "nameIt"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = spinShuffle(SPIN_BANKS[mode].slice());
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
    const title = "Same Fact, Different Spin";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Here's a secret about how people talk: the SAME true thing can be told in words that make you feel totally different. \"Spin\" is when someone dresses up a plain fact to steer your feelings — to make you proud, scared, excited, or mad — so you'll think what they want. The fact didn't change. The costume did. This isn't about calling people liars; a lot of spin is technically true. It's about a power: when you can strip off the fancy words and look at what ACTUALLY happened, nobody can push your feelings around, and YOU decide what to think. For each one, do the job it asks. Say WHY.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Spin A: \"Our team CRUSHED them in an EPIC comeback!\"   Spin B: \"They lost the first half and won by one point.\"  ->  What actually happened? They were behind, then won by 1. That's it. \"Crushed\" and \"epic\" are feeling-words glued on to make it sound huge. Both can be 'true' — but B lets you see the real event, and A is trying to make you cheer. Strip the costume, keep the fact.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 112);
    }

    content.items.forEach((it, idx) => {
      const needed = spinRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = spinRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- spin_detector content banks ---- */
function spinShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the situation / the two spins / the statement to examine
//   ask    = the thinking prompt (mode-specific)
//   answer = one good model read (answer key only — a good option, not THE answer)
//   why    = the reasoning in plain kid language, sovereign/spin-stripping voice
const SPIN_BANKS = {
  sameFact: [
    { text: "Spin A: \"This cereal is PACKED with the energy champions need!\"   Spin B: \"This cereal has a lot of sugar in it.\"",
      ask: "Both might be true. What ACTUALLY happened / what's the plain fact?",
      answer: "e.g. it's a sugary cereal. \"Packed with energy for champions\" is a fancy way of saying \"lots of sugar.\"",
      why: "Sugar IS energy, so the ad isn't exactly lying — it just picked the word that makes sugar sound like a superpower. Strip the costume ('champions,' 'packed') and you get the plain fact you can actually decide about." },
    { text: "Spin A: \"We had a HUGE turnout — the park was buzzing!\"   Spin B: \"About twelve people came to the park cleanup.\"",
      ask: "What's the bare fact under both? Which words are doing the puffing-up?",
      answer: "e.g. twelve people showed up. \"Huge,\" \"buzzing,\" and \"turnout\" make twelve sound like a crowd.",
      why: "\"Huge\" only means something next to a number. Once you know it's twelve, you can decide for yourself if that's a lot. Spin hides the number and hands you a feeling instead — so ask for the number." },
    { text: "Spin A: \"Our new slime is FINALLY here — you've been WAITING for this!\"   Spin B: \"A store is selling a new kind of slime.\"",
      ask: "Strip it down: what actually happened?",
      answer: "e.g. a store made a new slime to sell. Nobody was actually 'waiting' — the ad just says you were.",
      why: "\"You've been waiting for this\" is a trick that tells you how you feel BEFORE you've decided. You weren't waiting — you didn't even know it existed. Notice when words try to hand you a feeling you didn't have." },
    { text: "Spin A: \"He BRAVELY refused to clean his room, standing up for his rights!\"   Spin B: \"He didn't clean his room when he was asked.\"",
      ask: "What actually happened, without the hero words?",
      answer: "e.g. he didn't clean his room. \"Bravely,\" \"standing up for his rights\" make not-cleaning sound heroic.",
      why: "Big noble words ('brave,' 'rights') can be pasted onto almost anything to make it sound good. Peel them off and check the plain action first — THEN decide if it was actually brave or just skipping a chore." },
    { text: "Spin A: \"The team SUFFERED a crushing, humiliating defeat.\"   Spin B: \"The team lost the game 3 to 2.\"",
      ask: "What's the plain fact? Which words were added to make it feel worse?",
      answer: "e.g. they lost 3–2, a close game. \"Crushing,\" \"humiliating,\" \"suffered\" make a 1-point loss sound like a disaster.",
      why: "3–2 is a close game — but 'crushing' and 'humiliating' make it feel like the end of the world. Feeling-words can make a small thing sound huge OR a big thing sound tiny. The score is the fact; the drama is the spin." }
  ],
  loadedWords: [
    { text: "\"Only a baby would be scared of that ride.\"",
      ask: "Which word is doing the pushing? What's it trying to make you do?",
      answer: "e.g. the word \"baby\" — it's there to make you feel embarrassed so you'll go on the ride to prove you're not one.",
      why: "The word 'baby' isn't a reason the ride is safe — it's a poke at your feelings. It changes the subject from 'is this ride okay for me?' to 'are you a baby?' Spot the poke and you can answer the real question calmly." },
    { text: "\"Everyone smart already knows this is the best game.\"",
      ask: "Which word is the lever? Does it actually prove the game is best?",
      answer: "e.g. the word \"smart\" — it hints you're not smart if you disagree. It's pressure, not proof.",
      why: "Gluing 'smart people agree' onto an opinion doesn't make it a fact — it just makes you scared to disagree. A real reason would say WHAT'S good about the game. When a word is aimed at YOU instead of the thing, it's a lever." },
    { text: "\"This is a GENEROUS offer — you'd be crazy to say no.\"",
      ask: "Point to the feeling-words. What are they steering you away from?",
      answer: "e.g. \"generous\" and \"crazy to say no\" — they steer you away from actually checking if the offer is good.",
      why: "'Generous' and 'you'd be crazy' are there to rush you past thinking. A truly good deal survives you looking at it slowly. Any word pushing you to decide FAST is usually protecting a deal that can't survive a slow look." },
    { text: "\"He wolfed down his food like an animal.\"  vs.  \"He was hungry and ate quickly.\"",
      ask: "Same action. Which words make it sound bad? What actually happened?",
      answer: "e.g. he ate fast because he was hungry. \"Wolfed,\" \"like an animal\" paint the same thing as gross.",
      why: "The action — eating quickly — is neutral. 'Wolfed down like an animal' adds a judgment on top and hopes you won't notice it's an opinion, not the fact. Separate the doing from the name-calling stuck to it." },
    { text: "\"She refused to share\"  vs.  \"She kept the toy she was already playing with.\"",
      ask: "Which telling makes her sound selfish? What's the plain fact?",
      answer: "e.g. she kept a toy she was using. \"Refused to share\" makes the same thing sound mean.",
      why: "'Refused to share' sounds selfish; 'kept the toy she was using' sounds fair — but it's the SAME event. Whoever's telling it picked the words that fit their side. When a story makes someone sound bad, ask what the plain action was." }
  ],
  whatsLeftOut: [
    { text: "\"9 out of 10 kids said they LOVED this snack!\"",
      ask: "What might they NOT be telling you? What would you want to know?",
      answer: "e.g. how many kids were asked? Who picked them? Were they given free candy first? '9 out of 10' hides the rest.",
      why: "A number sounds solid, but the missing pieces change everything. If they only asked 10 kids, or paid them, '9 out of 10' means nothing. Spin often works by what it LEAVES OUT, not by lying. Ask 'what's not here?'" },
    { text: "\"Our team won the championship!\" (on a poster for a league with only two teams)",
      ask: "What's left out that changes how impressive this is?",
      answer: "e.g. there were only two teams, so 'champion' means they beat one other team. That's left out.",
      why: "'Champion' sounds huge until you learn there were two teams. The claim is true AND misleading, because the important piece (how many teams?) is missing. The trick isn't the lie — it's the hole where the fact should be." },
    { text: "\"This medicine made people feel better in just 3 days!\"",
      ask: "What did they leave out that you'd want to know?",
      answer: "e.g. most colds go away in about 3 days on their own — so the medicine might have done nothing.",
      why: "They left out what would've happened WITHOUT the medicine. If you'd feel better in 3 days anyway, the medicine gets credit it didn't earn. Always ask 'compared to what?' — the missing comparison is where spin hides." },
    { text: "\"Buy now — this price won't last!\"",
      ask: "What are they NOT telling you, and why the rush?",
      answer: "e.g. they don't say the price will probably come back, or that other stores sell it cheaper. The rush stops you checking.",
      why: "'Won't last!' is designed so you buy before you can look around. What's left out is: is this actually a good price? A real bargain doesn't need to panic you. The hurry is the tell that something's missing." },
    { text: "A kid says: \"He started it! He pushed me!\" (and stops there)",
      ask: "What part of the story might be missing?",
      answer: "e.g. what happened right before the push — maybe something the teller did first. One side is left out.",
      why: "'He started it' is a favourite because it starts the clock exactly where it makes the teller look best. The missing piece is 'and what happened just before that?' One side of a story is half the facts." }
  ],
  nameIt: [
    { text: "\"The library is open from 9 to 5 on Saturdays.\"",
      ask: "Is this a straight report (just facts) or a sell (trying to steer you)? How can you tell?",
      answer: "e.g. straight report — it just states hours, no feeling-words, nothing trying to make you feel a certain way.",
      why: "A straight report hands you facts and lets you decide. No 'amazing,' no 'you'd be crazy not to.' When you can't find any word aimed at your feelings, you're probably looking at information, not a pitch." },
    { text: "\"Don't miss out! This is the MOST AMAZING toy of the year — everyone wants one!\"",
      ask: "Report or sell? Name the words that give it away.",
      answer: "e.g. a sell — \"don't miss out,\" \"most amazing,\" \"everyone wants one\" are all pushing feelings, not giving facts.",
      why: "Count the feeling-words: 'don't miss out,' 'most amazing,' 'everyone.' A report tells you what a toy IS; a sell tells you how to FEEL about it. Stack up three feeling-pushes and you've found a pitch." },
    { text: "\"It rained today, so the soccer game was moved to next week.\"",
      ask: "Report or sell? What tells you?",
      answer: "e.g. straight report — it says what happened and why, with no words trying to steer your feelings.",
      why: "Cause and effect, plainly stated, no drama. Nobody's trying to make you buy, cheer, or panic. That calm, fact-first flavour is what a real report tastes like — worth noticing so you can spot the difference." },
    { text: "\"Smart families choose our school — give your child the future they DESERVE!\"",
      ask: "Report or sell? Which words are working on you?",
      answer: "e.g. a sell — \"smart families,\" \"deserve,\" \"the future\" push guilt and pride instead of telling you facts about the school.",
      why: "Notice it says nothing you could check — no facts about the school, just 'smart families' (be smart!) and 'deserve' (feel guilty!). When a message is all feelings and no checkable facts, it's selling, not reporting." },
    { text: "\"Three kids signed up for the art club so far.\"",
      ask: "Report or sell? How do you know?",
      answer: "e.g. straight report — a plain number, no puffing, nothing making three sound like more than three.",
      why: "It could've spun this ('interest is GROWING!') but it just gave the number. A report trusts you with the plain fact. When someone hands you the number instead of hiding it behind excitement, that's the honest move." }
  ]
};

/* ---- spin_detector layout (mirrors see_it_their_way row layout) ---- */
function spinRowHeight(doc, it, w, explain, showAnswers) {
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

function spinRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    sameFact: "WHAT ACTUALLY HAPPENED?", loadedWords: "SPOT THE FEELING-WORD",
    whatsLeftOut: "WHAT'S LEFT OUT?", nameIt: "REPORT OR SELL?"
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

  // The statement / the two spins
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
   TEMPLATE — WHAT DOES THAT NUMBER REALLY MEAN? (read_the_number)
   The library is deep on LANGUAGE manipulation (spin_detector,
   says_who, follow_the_incentive, spot_the_persuasion...) but had
   nothing on NUMBER / statistic manipulation — the other half of how
   people get pushed around. Kids meet loaded numbers everywhere:
   "9 out of 10 dentists," "50% OFF!", scary big totals with nothing
   to compare them to, a survey of 5 friends sold as "everyone,"
   percentages with no "percent of what." This is a MATH sheet (they
   already do place value, estimation, fractions) that teaches them to
   slow a number down and ask the sovereign questions: out of how many?
   compared to what? who counted, and who wanted this answer?

   Four deterministic modes — all with real kid-scale scenarios:
     outOfWhat   — a number/percent means nothing without its whole:
                   "half off" of what price, "3 out of 4" vs "3,"
                   a big total vs a fair share, "twice as much" of tiny.
     comparedTo  — a lone number can't scare or impress until you set it
                   beside something: "a MILLION germs" (so does a clean
                   hand), "$500!" (over how long?), "5 left!" fake
                   scarcity, "grew 100%" from 1 to 2.
     whoCounted  — where did the number come from & who wanted it:
                   "9 out of 10 dentists" (paid? how many asked?),
                   "everyone says" (a survey of 3?), a rounded-up
                   "almost 1000," a graph that starts at 90 not 0.
     doTheMath   — just work it out yourself and the trick pops:
                   "buy 2 get 1 free" vs a plain sale, "only $1 a day"
                   (=$365/yr), a "record" that's cherry-picked, a
                   probability sold as a sure thing.
   Deterministic, never calls AI. Mirrors trade_offs row layout exactly.
   Sovereign voice: a number is just a fact wearing a costume until YOU
   ask "out of what, compared to what, who counted?" — then you decide.
============================================================ */
window.TEMPLATES.read_the_number = {
  id: "read_the_number",
  label: "What does that number REALLY mean?",
  subject: "math",
  grades: ["1", "2", "3"],
  topicHint: "Number & statistic literacy — reading quantities honestly",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "outOfWhat",  label: "Out of what? (a number needs its whole)" },
        { value: "comparedTo", label: "Compared to what? (set it beside something)" },
        { value: "whoCounted", label: "Who counted? (where did the number come from)" },
        { value: "doTheMath",  label: "Do the math (work it out & the trick pops)" },
        { value: "mixed",      label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["outOfWhat", "comparedTo", "whoCounted", "doTheMath"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = rnShuffle(RN_BANKS[mode].slice());
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
    const title = "What does that number REALLY mean?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Numbers act like they can't lie — but a number all by itself doesn't tell you much yet. \"Half off!\" Off of what? \"A MILLION germs!\" Compared to what? \"9 out of 10 people agree!\" Who counted, and who wanted that answer? A number is just a fact wearing a costume until you ask a few questions and see what's underneath. You don't have to be scared of it or impressed by it — you get to slow it down and check. For each one, ask the question, work out what the number REALLY means, then decide for yourself.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"9 out of 10 kids LOVE this cereal!\"  ->  Out of how many kids did they ask? If they asked 10, that's a tiny group. WHO asked them — the cereal company? Did they only keep the answers they liked? \"9 out of 10\" sounds huge, but until you know how many were asked and who counted, it's just a costume. Ask 'out of what, and who counted?' and the big number gets a lot smaller.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 100);
    }

    content.items.forEach((it, idx) => {
      const needed = rnRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = rnRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- read_the_number content banks ---- */
function rnShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why }
//   text   = the numbered claim / situation the child reads
//   ask    = the thinking prompt (mode-specific)
//   answer = short model answer (answer key only)
//   why    = the reasoning, plain kid language, sovereign voice
const RN_BANKS = {
  outOfWhat: [
    { text: "A sign shouts: \"HALF OFF!\"",
      ask: "Half off of WHAT? Why do you need to know the first price before you get excited?",
      answer: "Half off a made-up-high price can still be expensive. You need the real starting price to know if it's a deal.",
      why: "\"Half\" is only half of SOMETHING. Half off a $2 toy is $1; half off a $200 toy is still $100. A store can even mark the price way up first, then take 'half off' back to normal. The percent means nothing until you know 'half of what?'" },
    { text: "\"3 out of 4 kids in the class picked pizza!\"",
      ask: "Out of how many kids total? Does '3 out of 4' mean a lot of kids?",
      answer: "If the class has 4 kids, that's tiny. '3 out of 4' is a ratio — you still need the real size.",
      why: "A fraction tells you the SHARE, not the amount. '3 out of 4' could be 3 kids or 3,000 kids. Always ask 'out of how many?' — the whole is the part of the story they left out." },
    { text: "\"This snack has TWICE as much fruit as the other one!\"",
      ask: "Twice as much as WHAT amount? Could 'twice' still be almost nothing?",
      answer: "Twice a tiny amount is still tiny — twice one raisin is two raisins. You need the starting amount.",
      why: "'Twice' and 'double' sound big, but they multiply whatever you start with. Double a crumb is two crumbs. Before you're impressed by 'twice as much,' ask 'twice as much as HOW much?'" },
    { text: "A jar is labelled \"BIGGEST SIZE — 500 grams!\"",
      ask: "Is 500 grams a lot? What would you compare it to before deciding?",
      answer: "You can't tell yet — compare it to a normal jar. 'Biggest' might just mean bigger than their small one.",
      why: "A number with no comparison is just a costume for the word 'big.' 500 could be huge or normal. 'Biggest' only means biggest of THEIR sizes — ask what a regular one holds and judge for yourself." },
    { text: "\"You'll get 20% MORE cereal, free!\"",
      ask: "20% more than what amount — and does that mean it's a good deal for YOU?",
      answer: "20% more of a small box isn't much, and it doesn't tell you the price per gram vs. other boxes.",
      why: "Percent is always 'percent OF something.' 20% more of a little is a little. And 'more free' doesn't mean 'cheapest' — do the math on price for the amount, not the shiny number." }
  ],
  comparedTo: [
    { text: "An ad warns: \"Your hands have MILLIONS of germs!\"",
      ask: "Is a million germs scary by itself? What would you compare it to?",
      answer: "Almost everything has millions of germs, including clean things. Big-sounding, but normal.",
      why: "A number can't scare you until you set it beside something. Millions of germs sounds huge — but a freshly washed hand still has plenty, and most do nothing. Ask 'compared to what's normal?' before the number gets to scare you." },
    { text: "\"This class costs $500!\"",
      ask: "$500 over how long — one day, or a whole year? Why does that change everything?",
      answer: "$500 for a year is very different from $500 for one hour. You need the time it covers.",
      why: "A price with no time attached is half a fact. $500 a year is cheap; $500 an hour is a lot. Always ask 'over what time?' — squishing a long-time cost into one scary number is a common trick." },
    { text: "A game screen flashes: \"Only 5 LEFT — hurry!\"",
      ask: "5 left out of how many, and left for how long? Is this a real shortage?",
      answer: "Online there are often endless copies. '5 left' is usually a countdown to rush you, not a real limit.",
      why: "'Only 5 left' works by comparing to nothing and adding a clock. Compared to how many they can make (often unlimited), 5 'left' is just pressure. When a number is there to make you hurry, slow down on purpose." },
    { text: "\"This channel GREW 100% this month!\"",
      ask: "Grew from what to what? Could '100% growth' still be tiny?",
      answer: "100% growth from 1 follower to 2 is 'doubling' — technically true, basically nothing.",
      why: "Percent-growth hides the starting size. Going from 1 to 2 is '+100%' and sounds amazing; it's two people. Ask 'from what number to what number?' A big percent of a tiny thing is still a tiny thing." },
    { text: "\"Our team scored the MOST goals ever — 40!\"",
      ask: "40 goals over how many games? Compared to what, is 40 a lot?",
      answer: "40 over 40 games is 1 a game — pretty normal. Spread out, a 'record' can be ordinary.",
      why: "A total with no 'per what' can be dressed up as amazing. 40 goals in one game is wild; 40 across a season is average. Always find the 'per game / per day' hiding inside a big total." }
  ],
  whoCounted: [
    { text: "\"9 out of 10 DENTISTS recommend this toothpaste!\"",
      ask: "Who asked the dentists, how many did they ask, and were the dentists paid?",
      answer: "The toothpaste company likely asked, maybe only a few, maybe let dentists pick more than one brand.",
      why: "Numbers come from somewhere, and whoever pays for the count usually likes the answer. '9 out of 10' could be 9 out of 10 they hand-picked. Ask WHO counted and WHY before you trust the score." },
    { text: "\"EVERYONE at school has this shoe!\"",
      ask: "Did someone really count everyone? How many did they actually see?",
      answer: "Almost never 'everyone' — usually a few loud kids. 'Everyone' is a feeling, not a count.",
      why: "'Everyone' is a number in disguise, and it's almost always wrong. Nobody counted the whole school. It's a push to make you feel left out. Ask 'how many, really?' and 'everyone' shrinks fast." },
    { text: "A box says \"ALMOST 1,000 pieces!\"",
      ask: "'Almost 1000' — could that really be 700? Why round it up so high?",
      answer: "'Almost 1000' might be 720. They round toward the impressive number, not the honest one.",
      why: "People round in the direction that helps them. 'Almost 1000' leans on the big number even if it's really 720. When a number is fuzzy ('almost,' 'up to,' 'as many as'), the true one is usually less exciting." },
    { text: "A graph shows a HUGE jump in sales — but the bottom of the graph starts at 90, not 0.",
      ask: "Why does starting the graph at 90 make a small change LOOK giant?",
      answer: "Cutting off the bottom stretches a tiny difference into a tall-looking cliff. It's the same small change.",
      why: "Even a picture of numbers can trick you. Start the bar at 90 instead of 0 and going 92 to 95 looks like a mountain. Always check where the bottom of a graph starts — that's where the honesty lives." },
    { text: "\"Reviewers gave it 5 STARS!\" — but there are only 2 reviews.",
      ask: "5 stars from how many people? Is 2 reviews enough to trust?",
      answer: "2 reviews is almost nothing, and they could be from friends or the seller. Too few to mean much.",
      why: "A perfect score from a tiny group tells you almost nothing — and the few voices might be the seller's own friends. Ask 'how many counted?' A great average of 2 is weaker than an okay average of 500." }
  ],
  doTheMath: [
    { text: "\"BUY 2, GET 1 FREE!\" Each toy is $6.",
      ask: "Work it out: 3 toys for $12. What's that per toy? Is it really a big deal?",
      answer: "$12 for 3 = $4 each. It's a 1/3 discount — okay, but only if you actually wanted 3.",
      why: "Do the math and the magic word 'FREE' calms down. $12 for 3 is $4 each instead of $6 — fine, but you had to buy 3. A deal that makes you buy more than you wanted isn't always a deal. Count it yourself." },
    { text: "\"Just $1 a DAY!\" for a subscription.",
      ask: "Work it out: how much is $1 a day for a whole year?",
      answer: "$1 x 365 = $365 a year. 'A dollar a day' is a way to make a big yearly price feel small.",
      why: "Splitting a price into tiny daily bites hides the total. $1 a day is $365 a year. Whenever you hear 'only ___ a day,' multiply it out to a year before you decide — the small number is doing a big job." },
    { text: "\"Our winners have made HUGE money!\" (Only 1 out of 1,000 players ever wins.)",
      ask: "If 1 in 1,000 wins, what happens to the other 999? Who do they show you?",
      answer: "999 lose. They only show the 1 winner, so you never see the 999 who didn't.",
      why: "They cherry-pick the one lucky story and hide the crowd who lost. 1 in 1,000 means it almost surely won't be you. Count the losers they DON'T show — that's the number that tells the truth." },
    { text: "\"90% chance to win the prize!\" says the game, so a kid keeps paying to play.",
      ask: "If it's 90% each try, is winning a SURE thing? What about the 10%?",
      answer: "No — 10% means about 1 in 10 tries loses, and losses can pile up. 90% is not 100%.",
      why: "A high chance is not a promise. 90% still loses 1 in 10 — and if you keep paying, those losses add up real money. 'Almost sure' is a costume for 'not sure.' Do the math on what it costs to keep trying." },
    { text: "\"Save $3 by buying the BIG pack!\" Big pack is $10 for 5; small is $2.20 each.",
      ask: "Work it out: 5 smalls = ? Is the big pack really cheaper, and do you need 5?",
      answer: "5 x $2.20 = $11, so the big pack ($10) saves $1 — not $3 — and only if you'd use all 5.",
      why: "Check their math; it's often bent. Here the real save is $1, not $3, and only if you actually want 5. 'Saving' by spending more on things you don't need isn't saving. Your pencil beats their sign." }
  ]
};

/* ---- read_the_number layout (mirrors trade_offs row layout) ---- */
function rnRowHeight(doc, it, w, explain, showAnswers) {
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

function rnRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    outOfWhat: "OUT OF WHAT?", comparedTo: "COMPARED TO WHAT?",
    whoCounted: "WHO COUNTED?", doTheMath: "DO THE MATH"
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
   RIPPLE EFFECT — "And then what happens AFTER that?"
   Systems-thinking / second-order-consequences literacy. The
   cause_effect_chains template trains the FIRST link (A -> B) and
   catches the coincidence trap. This trains the harder, more
   sovereign skill: the world is CONNECTED, so almost nothing stops
   at its first effect. Chase the ripple — the effect of the effect,
   who ELSE it touches, the "quick fix" that quietly makes a new
   problem, and the loop that feeds itself. Voice: don't be sold a
   simple answer; ask "and then what?" one more time than they want
   you to, and you'll see the whole picture instead of the slice
   someone's showing you. Deterministic, never calls AI; mirrors
   cause_effect_chains / trade_offs row layout exactly.
============================================================ */
window.TEMPLATES.ripple_effect = {
  id: "ripple_effect",
  label: "Ripple effect (and then what happens AFTER that?)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Systems thinking: second-order consequences, ripple effects, feedback loops, and the hidden cost of a quick fix",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "andThenWhat", label: "And then what? (chase the effect of the effect)" },
        { value: "whoElse",     label: "Who else does it touch? (the ripple spreads out)" },
        { value: "quickFix",    label: "The quick fix that made a new problem" },
        { value: "loop",        label: "The loop that feeds itself (more -> more, or more -> less)" },
        { value: "mixed",       label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["andThenWhat", "whoElse", "quickFix", "loop"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = ripShuffle(RIPPLE_BANKS[mode].slice());
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
    const title = "Ripple Effect";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Drop a rock in a pond and you don't get one splash \u2014 you get rings that spread out and out. The world works the same way: almost nothing stops at its first effect. One thing changes, that changes the next thing, and that changes something else \u2014 sometimes far away, sometimes to people you weren't even thinking about, and sometimes it circles back around to you. Most people (and most ads, and most \"simple answers\") only show you the FIRST ring, because that's the one that looks good. Your power is to ask \"and then what happens AFTER that?\" one more time than they want you to. Do the job each one asks. Say WHY.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "\"To stop being late, I'll just sleep in my clothes.\"  ->  First ring: yes, you save time getting dressed. And then what? Your clothes get wrinkled and slept-in, so you look messy and maybe change anyway. And then what? You're uncomfortable all night and sleep worse, so you're MORE tired and even harder to wake up. The 'fix' quietly made the real problem (waking up) worse. Chasing it two more rings out shows the whole picture, not the slice that sounded clever.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 124);
    }

    content.items.forEach((it, idx) => {
      const needed = ceRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = ripRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- ripple_effect content banks ---- */
function ripShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why } (same shape as cause_effect_chains)
//   text   = the situation / the first-ring change
//   ask    = the thinking prompt (mode-specific)
//   answer = one good model read (a good option, not THE only answer)
//   why    = reasoning in plain kid language, sovereign systems-thinking voice
const RIPPLE_BANKS = {
  andThenWhat: [
    { text: "A town wants fewer wolves, so they remove all the wolves.",
      ask: "First ring: fewer wolves. And then what? And then what after THAT? Chase it two more rings.",
      answer: "e.g. fewer wolves -> more deer (nothing eats them) -> deer eat all the young trees -> fewer trees -> riverbanks wash away and other animals lose homes.",
      why: "The wolves weren't just 'a problem' \u2014 they were doing a job in a connected system. Pull one thread and the whole web shifts. 'And then what?' keeps going long after the first, obvious ring." },
    { text: "A kid eats candy every day after school because it feels great in the moment.",
      ask: "First ring feels good. And then what happens later that day? And the next week?",
      answer: "e.g. sugar rush -> crash and cranky before dinner -> not hungry for real food -> more tired next day -> harder to focus, wants more candy to feel good again.",
      why: "The good feeling is the first ring \u2014 the one candy shows you. The tired, cranky, hungry-for-junk rings come later, so they're easy to miss. Asking 'and then what?' pulls the hidden rings into the light BEFORE you decide." },
    { text: "Everyone in class rushes to line up first, so they start shoving to the front.",
      ask: "First ring: someone gets to the front. And then what happens to the whole line?",
      answer: "e.g. shoving -> someone falls or gets mad -> teacher makes everyone sit back down -> nobody leaves, everyone's slower than if they'd just waited.",
      why: "Each kid only saw their own first ring ('I get ahead'). Nobody chased the ring where EVERYBODY shoves at once \u2014 which makes the whole line slower for all of them, including the shovers. The system's result is the opposite of what each person wanted." },
    { text: "A store gives out free samples of a new cookie at the front door.",
      ask: "First ring: you get a free cookie. And then what is the store hoping happens next?",
      answer: "e.g. free taste -> you like it -> you feel a little like you 'owe' them -> you buy a box -> you come back -> the free cookie earns them way more than it cost.",
      why: "The free cookie is a real gift AND a first move. Chasing the ripple shows why they'd 'give away' something: the later rings (you buying, coming back) are the whole point. Seeing that doesn't mean don't take the cookie \u2014 it means take it with your eyes open." },
    { text: "A river gets a big dam built across it to make power.",
      ask: "First ring: more electricity. And then what happens upstream and downstream? Chase two rings.",
      answer: "e.g. power made -> water backs up and floods land behind the dam (homes/forests underwater) -> less water and fewer fish get downstream -> people who fished downstream lose food.",
      why: "A dam does exactly what it promises \u2014 that's the loud first ring. But water is connected up AND down the river, so the change ripples both directions to people who never got asked. Big fixes almost always have rings the poster didn't mention." }
  ],
  whoElse: [
    { text: "You leave your bike lying across the whole sidewalk.",
      ask: "It's just your bike. Who ELSE does this touch? Name at least two.",
      answer: "e.g. a person in a wheelchair can't get past; someone pushing a stroller has to go on the road; a blind person could trip; a neighbour gets annoyed.",
      why: "It feels like 'just my bike, my business' \u2014 but a sidewalk is shared, so your one choice ripples out to everyone who needs to use it. Asking 'who else does this touch?' turns a private choice into an honest one." },
    { text: "A factory dumps its waste in the river because it's the cheapest way.",
      ask: "It saves the factory money. Who else does it touch, near and far?",
      answer: "e.g. fish downstream die; families who fish lose food; a town that drinks the water gets sick; kids can't swim; the next factory copies them.",
      why: "The factory only counted its OWN ring (cheaper). But a river carries the cost downstream to people who never agreed to pay it. When someone says a choice is 'cheap,' ask: cheap for WHOM \u2014 and who's quietly paying for it?" },
    { text: "You promise to help your friend build a fort, then bail to play a game instead.",
      ask: "You changed your mind \u2014 no big deal for you. Who else does the ripple reach?",
      answer: "e.g. your friend waited and can't build it alone; they feel let down; they trust your promises less next time; other kids hear you bailed.",
      why: "A broken plan doesn't stop at you \u2014 it lands on the person counting on you, and it ripples into whether people trust your word later. 'It's fine for me' and 'it's fine for everyone I touched' are two very different questions." },
    { text: "One kid starts a rumour that a game is 'for babies.'",
      ask: "Who all gets touched by that one sentence as it spreads?",
      answer: "e.g. kids who love the game hide it and stop playing; the kid who said it feels powerful and does it again; someone who wanted to try it now won't; a fun thing gets smaller for everyone.",
      why: "Words ripple person to person like the pond rings. One sentence can quietly shrink what a whole group feels okay liking. Tracing who it touches shows a 'harmless' comment isn't so harmless \u2014 and reminds you your own words ripple too." },
    { text: "A new highway is built straight through the middle of a quiet neighbourhood.",
      ask: "Drivers get there faster. Who else does the highway touch \u2014 and how?",
      answer: "e.g. people whose homes were torn down; neighbours who now hear traffic all night; kids who can't cross safely; a park cut in half; nearby air gets dirtier.",
      why: "The benefit (faster driving) goes to one group; the costs ripple onto a different group who mostly didn't get a vote. Almost every big choice helps some rings and hurts others \u2014 ask WHO'S in each ring before you call it a good idea." }
  ],
  quickFix: [
    { text: "Your room's a mess, so you shove everything under the bed to clean it fast.",
      ask: "It looks clean now. What new problem did the quick fix quietly make?",
      answer: "e.g. the mess is still there, now hidden and squished; you can't find your stuff; it's worse to clean later; things get broken or lost under there.",
      why: "A quick fix that hides a problem instead of solving it doesn't remove the problem \u2014 it just moves it to later-you, usually bigger. Ask: did this actually SOLVE it, or just push it out of sight?" },
    { text: "A town has too many mice, so they bring in tons of cats to eat them.",
      ask: "The mice go down. What new problem might the 'fix' create?",
      answer: "e.g. now there are way too many cats; cats eat the birds too; stray cats everywhere; when mice run low, hungry cats become the next problem to solve.",
      why: "Fixing one thing by adding a lot of another thing usually trades your old problem for a new one. The real question isn't 'does this beat the mice?' \u2014 it's 'what will I have to fix AFTER this fix?'" },
    { text: "To win the argument fast, a kid just yells louder than everyone else.",
      ask: "It ends the argument in the moment. What new problem did yelling make?",
      answer: "e.g. nobody actually agreed \u2014 they just gave up; they're mad and trust him less; next time they yell too; the real disagreement never got solved.",
      why: "Yelling 'works' on the first ring (it ends the noise) but fails on every ring after (nothing's settled, and it teaches everyone to yell). A fix that only works right-now and makes later worse isn't really a fix \u2014 it's a delay." },
    { text: "A game gives kids gems for logging in every single day, so kids feel they can't skip a day.",
      ask: "It keeps kids playing \u2014 that's the fix (for the game). What problem did it make for the kids?",
      answer: "e.g. kids feel stressed/trapped, log in even when they don't want to, play out of fear of losing a streak instead of fun; it stops being a choice.",
      why: "The 'fix' solves the game-maker's problem (keep you coming back) by creating YOUR problem (you can't freely choose). When something is designed so you feel you 'can't skip,' notice whose problem it's really fixing \u2014 and that you're allowed to skip." },
    { text: "It's cold, so a town cuts down the nearby forest for firewood to stay warm this winter.",
      ask: "Warm this winter \u2014 good. What new problem shows up in the winters AFTER?",
      answer: "e.g. no trees means no firewood next year; no roots means mudslides and floods; no shade or windbreak; animals gone; colder and more exposed than before.",
      why: "The fix borrows from the future to solve today. It's warm THIS winter and worse every winter after \u2014 a classic 'quick fix' shape. Ask of any fast solution: am I solving this, or borrowing from later-me at a bad price?" }
  ],
  loop: [
    { text: "The more nervous you feel about a test, the worse you sleep. The worse you sleep, the more tired and nervous you feel.",
      ask: "This is a LOOP \u2014 it feeds itself and grows. Which way is it spinning, and where could you cut in to stop it?",
      answer: "e.g. it spins downward (nervous -> bad sleep -> more nervous). Cut in by breaking one link: a calming routine so you sleep, or reminding yourself one test isn't your whole life so you're less nervous.",
      why: "Some things loop: the effect circles back and becomes a bigger cause. Once you SEE the loop, you don't have to fix all of it \u2014 snipping one link (better sleep OR less worry) slows the whole spin. Spotting the loop is the power." },
    { text: "The more you practice a hard song, the better you get. The better you get, the more fun it is, so the more you want to practice.",
      ask: "This loop spins UP. Name the circle, and say what starts it turning.",
      answer: "e.g. practice -> better -> more fun -> more practice -> even better. It starts turning when you push through the boring, not-fun-yet beginning long enough to feel a little progress.",
      why: "Not all loops are bad \u2014 this is a GOOD one (a virtuous circle). The catch is the start: the first bit isn't fun yet, so the loop hasn't 'caught' yet. Knowing a good loop is waiting on the other side is a reason to push through the dull beginning." },
    { text: "A video app shows you a video. You watch it, so it shows you a more exciting one. You watch that, so it shows an even more exciting one...",
      ask: "What's the loop, and who is it built to help \u2014 you, or the app?",
      answer: "e.g. watch -> app learns -> shows you something even harder to stop watching -> you watch longer. It's built to keep you watching (good for the app's ad money), not to help you.",
      why: "This loop is designed on purpose to feed itself, using YOUR attention as the fuel. Seeing that it's a loop \u2014 and whose loop \u2014 is how you step out of it: you can decide when to stop instead of letting the circle decide for you." },
    { text: "The messier the shared toy bin gets, the less anyone bothers to put toys away. The less they put away, the messier it gets.",
      ask: "Which way is this loop spinning? Where's the smallest place to cut in?",
      answer: "e.g. it spins toward messier ('why bother, it's already a disaster'). Cut in by resetting it clean once \u2014 then a tidy bin makes people MORE likely to keep it tidy, flipping the loop the other way.",
      why: "Loops can flip direction. A messy bin invites mess; a clean bin invites care. You don't have to nag everyone \u2014 one reset can flip which way the loop spins. Find the small cut-in point instead of fighting the whole circle." },
    { text: "The more two friends brag to each other, the more each one feels he has to brag back even bigger to keep up.",
      ask: "Name the loop and where it's heading. How does someone step out of it?",
      answer: "e.g. brag -> other brags bigger -> first brags bigger still -> it escalates into lies or a fight. Step out by simply not matching it: 'that's cool' instead of topping it.",
      why: "An 'arms race' is a loop where each side reacts to the other and it spirals up. Nobody's really choosing \u2014 they're just reacting. The way out isn't to win the loop, it's to refuse to play the next round. Seeing the loop lets you stop feeding it." }
  ]
};

/* ---- ripple_effect layout (mirrors cause_effect_chains row layout) ---- */
function ripRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    andThenWhat: "AND THEN WHAT?", whoElse: "WHO ELSE DOES IT TOUCH?",
    quickFix: "THE QUICK-FIX TRAP", loop: "THE LOOP THAT FEEDS ITSELF"
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

/* ============================================================
   hold_your_ground — say no, ask for what's fair, don't get pushed
   The ACTIVE companion to the detection library: once you've spotted a
   push (follow_the_incentive), read the person (see_it_their_way), and
   felt the "no" muscle (who_told_you), THIS is what you DO about it —
   turn detection into agency. Reading, Gr1-3, deterministic, no AI.
   Mirrors ripple_effect/cause_effect_chains row layout (reuses ceRowHeight).
============================================================ */
window.TEMPLATES.hold_your_ground = {
  id: "hold_your_ground",
  label: "Hold Your Ground (say no, ask for fair, don't get pushed)",
  subject: "reading",
  grades: ["1", "2", "3"],
  topicHint: "Self-advocacy & negotiation: saying no without being rude, asking for what's fair, proposing an alternative, and holding a boundary under pressure",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Thinking mode",
      options: [
        { value: "justSayNo",   label: "Say no clearly (no reasons owed, no fight)" },
        { value: "askFair",     label: "Ask for what's fair (name your worth / your yes)" },
        { value: "thirdOption", label: "Find the third option (propose a trade, don't just fold)" },
        { value: "holdTheLine", label: "Hold the line (they push again — now what?)" },
        { value: "mixed",       label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["justSayNo", "askFair", "thirdOption", "holdTheLine"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = hygShuffle(HYG_BANKS[mode].slice());
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
    const title = "Hold Your Ground";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Spotting a push is only half of it. The other half is what you DO about it \u2014 without turning into a doormat OR a jerk. There's a calm middle: you get to say no, you get to ask for what's fair, and you get to keep your answer even when someone pushes back. You don't owe anyone a long list of reasons for your own 'no,' and 'because everyone else is' is not a reason YOU have to accept. Being sovereign isn't about winning every argument \u2014 it's about not getting talked out of your own answer. Do the job each one asks. Say WHY.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "A bigger kid says, \"Give me your snack or I won't be your friend.\"  ->  Weak move: hand it over so they'll like you (you paid, they learned it works, they'll ask again). Doormat-or-jerk trap: yell and grab it back. The calm middle: \"No \u2014 it's my snack.\" You don't owe a reason, and a 'friend' who's really a toll booth isn't a friend. If you WANT to share, that's a gift you chose, not a fee you got charged. Notice: a real friend doesn't put a price on being your friend.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 118);
    }

    content.items.forEach((it, idx) => {
      const needed = ceRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = hygRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- hold_your_ground content banks ---- */
function hygShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why } (same shape as cause_effect_chains / ripple_effect)
const HYG_BANKS = {
  justSayNo: [
    { text: "A friend keeps begging you to trade your favourite marble for three of theirs. You don't want to.",
      ask: "You don't want the trade. What can you say \u2014 in a few calm words, no long argument?",
      answer: "e.g. \"No thanks, I'm keeping it.\" That's the whole sentence. If they keep pushing: \"I already said no.\" Repeat it, don't debate it.",
      why: "\"No thanks\" is a complete answer. You don't owe a reason for keeping your own stuff, and the more reasons you give, the more they'll argue with each one. A calm 'no' you repeat beats a clever 'no' you defend." },
    { text: "Someone dares you to do something that feels wrong or unsafe, and adds, \"What, are you scared?\"",
      ask: "\"Are you scared?\" is bait to make you do it. How do you say no and NOT take the bait?",
      answer: "e.g. \"Nope, I just don't want to.\" You can even agree: \"Sure, call it scared \u2014 I'm still not doing it.\" Then walk.",
      why: "The dare only works if you need to prove you're not scared. When you stop needing to prove it, the bait has nothing to grab. Your 'no' doesn't need their permission or their approval to be a real answer." },
    { text: "A grown-up you barely know says, \"Come here and give me a hug.\" You don't want to.",
      ask: "It's your body. What can you say, and what can you do instead if a hug feels wrong?",
      answer: "e.g. \"No thank you\" and offer a wave or high-five instead \u2014 or nothing at all. Then tell a grown-up you DO trust.",
      why: "Your body is yours, and 'no' to touch is always allowed \u2014 even to adults, even if it seems rude to them. Politeness never outranks your gut. A safe grown-up will respect a no; someone who won't is exactly who to tell." },
    { text: "Kids are chanting \"do it, do it, do it\" to get you to jump off something too high.",
      ask: "A crowd is pushing. Does 'everyone wants me to' make it a good idea? What do you do?",
      answer: "e.g. \"Not doing it\" and step back \u2014 you don't have to explain to a chanting crowd. Loud isn't the same as right.",
      why: "A crowd chanting feels like pressure, but a hundred voices saying 'do it' add up to exactly zero reasons. 'Everyone wants me to' is the push \u2014 not proof it's smart. Your body's on the line, so your vote is the only one that counts." },
    { text: "Your friend says, \"If you were really my friend, you'd let me copy your homework.\"",
      ask: "They're using your friendship as a lever. How do you say no to the copying but not the friendship?",
      answer: "e.g. \"I am your friend \u2014 and no. I'll help you figure it out, but I'm not giving you the answers.\" Say no to the ask, not the person.",
      why: "\"If you were really my friend\" is a trick that treats your 'no' as proof you don't care. Flip it: a real friend wouldn't put you on the hook to break a rule. You can love the friend and still refuse the favour." }
  ],
  askFair: [
    { text: "You spend all Saturday morning weeding the neighbour's whole garden. They hand you a single cookie.",
      ask: "That doesn't feel fair for a morning of work. What can you say instead of just taking it quietly?",
      answer: "e.g. \"Thanks, but that was a big job \u2014 I was hoping for a few dollars. Can we agree on a price for next time?\" Name the work AND a fair number.",
      why: "Staying quiet teaches them (and you) that your morning is worth one cookie. Naming your worth calmly isn't greedy \u2014 it's honest. The person who never asks always gets the cookie; the one who asks kindly usually gets the fair deal." },
    { text: "Your little sibling wants to play your game, and you'd actually be okay with it \u2014 for a turn.",
      ask: "Your yes can have a shape. How do you say yes AND set the terms so it's fair to you too?",
      answer: "e.g. \"Yes \u2014 you can have it for ten minutes, then it's back to me.\" A yes with a clear edge, agreed up front.",
      why: "A 'yes' isn't all-or-nothing. You can give a real yes and still keep a fair limit on it. Setting the terms up front (how long, how many) prevents the fight later \u2014 and teaches that generous doesn't have to mean endless." },
    { text: "A kid offers to trade you their old, chewed-up eraser for your brand-new full pack of markers.",
      ask: "They called it 'a trade.' Is it a fair one? What do you say?",
      answer: "e.g. \"That's not an even swap \u2014 my markers are worth way more than one old eraser.\" Say no, or counter with what WOULD be fair.",
      why: "Someone calling it 'a trade' doesn't make it a fair trade. You get to weigh both sides yourself before you agree. Naming that it's uneven \u2014 out loud, calmly \u2014 is how you avoid getting talked into a bad deal by a fast talker." },
    { text: "You always end up being the one who cleans up after the whole group's game.",
      ask: "It's become 'your job' by habit, not by fair. How do you ask for that to change?",
      answer: "e.g. \"I've cleaned up the last few times. Let's take turns \u2014 whose turn is it today?\" Name the pattern, propose fair.",
      why: "Unfair things often become 'just how it is' because nobody names them. Pointing at the pattern without blaming anyone ('let's take turns') is how you fix it. Asking for fair isn't complaining \u2014 it's refusing to be the default doormat." },
    { text: "You did most of the work on a shared project, but a louder kid is about to take all the credit.",
      ask: "Staying quiet feels 'nice.' Is it fair to you? What can you say?",
      answer: "e.g. \"We worked on it together \u2014 I did the drawing and the counting part.\" State your part plainly, no bragging, no shrinking.",
      why: "Quietly letting someone take your credit isn't being nice \u2014 it's paying a tax for their loudness. Saying what you actually did, in a flat honest voice, isn't showing off. If you don't tell your own truth, the loudest person writes it for you." }
  ],
  thirdOption: [
    { text: "A friend wants to play only their game all recess. You want to play yours. You're about to just give in.",
      ask: "It feels like 'their way OR a fight.' What's a THIRD option nobody said yet?",
      answer: "e.g. \"Half recess your game, half mine.\" Or \"Yours today, mine tomorrow.\" A trade, not a surrender.",
      why: "'Give in or fight' is a false choice \u2014 it hides all the middle options. When you feel boxed into two bad doors, the sovereign move is to look for the door nobody mentioned. A fair trade usually beats both winning-ugly and folding." },
    { text: "Someone wants to borrow your bike. You don't fully trust them with it, but you don't want to seem mean.",
      ask: "Instead of a flat yes or a flat no, what's a middle deal that protects your bike AND keeps the peace?",
      answer: "e.g. \"You can ride it here in front of me,\" or \"Not the bike, but you can borrow my scooter.\" A smaller yes, on your terms.",
      why: "You don't have to choose between 'lose your bike' and 'be the mean kid.' A partial yes \u2014 a limit, a swap, a where/when \u2014 lets you be generous AND careful at once. The middle option is where most fair deals actually live." },
    { text: "Your parent says no more screen time; you're desperate for 'just five more minutes' and about to whine.",
      ask: "Whining rarely works. What's a calmer offer you could make that a grown-up might actually say yes to?",
      answer: "e.g. \"Can I finish this one level and then I'll turn it off myself, no reminders?\" Offer a fair deal, not a tantrum.",
      why: "Whining asks them to give in; a proposal invites them to agree. Offering something in return (I'll turn it off myself, no fuss) treats it like a deal between two people. You won't always get the yes \u2014 but a calm offer beats a meltdown every time." },
    { text: "Two friends both want you on their team, and picking one will hurt the other's feelings.",
      ask: "'Pick one, hurt the other' isn't the only path. What third idea could you offer the group?",
      answer: "e.g. \"Let's mix up the teams so it's not always the same,\" or \"I'll switch sides at halftime.\" Solve it for everyone, not just you.",
      why: "When both choices feel bad, that's your cue that the choices are too small. Widening the question ('how do we ALL have fun?') often dissolves the trap. The best third option makes the whole thing fair, not just less awkward for you." },
    { text: "A store clerk says, \"This toy or nothing \u2014 it's the last one and someone else wants it.\"",
      ask: "That's a rushed 'buy now or lose it' push. What's a calmer third move than panic-buying?",
      answer: "e.g. \"I'll think about it,\" and walk away. If it's really gone, another will come. Refuse the fake rush.",
      why: "'Now or never' is almost always a push, not a fact \u2014 it's built to skip your thinking. The third option to 'grab it' or 'lose forever' is simply 'not on your schedule.' Slowing down is a move, and usually the strongest one." }
  ],
  holdTheLine: [
    { text: "You said no to lending your toy. Your friend asks again... and again... and again.",
      ask: "Your first no was clear. They keep asking. Does asking more times change your answer? What do you say now?",
      answer: "e.g. Same words every time: \"My answer's still no.\" Don't add new reasons \u2014 that just gives them more to argue.",
      why: "Asking ten times isn't ten reasons \u2014 it's the same push wearing you down, hoping you'll cave from tiredness. A calm, repeated 'still no' can't be argued with. The only thing that changes your answer is a better reason, not more nagging." },
    { text: "You told a kid you won't help them cheat. They switch to, \"Wow, you're being SO uptight and boring.\"",
      ask: "They stopped asking and started name-calling. Is that a reason to change your mind? What do you do?",
      answer: "e.g. \"Maybe \u2014 still not doing it.\" Don't defend against the insult; it's just the push in a new costume.",
      why: "When the asking fails, people often switch to poking your feelings ('boring,' 'baby,' 'uptight'). That's not a new argument \u2014 it's the same no getting nagged from a different angle. An insult isn't a reason. Let it bounce, keep your line." },
    { text: "You set a boundary: no going in your room without asking. A sibling does it anyway, then says \"it's no big deal.\"",
      ask: "They crossed the line and are shrinking it. Do you let it slide, or hold it? How?",
      answer: "e.g. \"It IS a big deal to me \u2014 ask first, like we agreed.\" Restate the line calmly, don't get talked out of it.",
      why: "'It's no big deal' is someone else deciding how big YOUR boundary is allowed to be \u2014 that's not their call. A line you don't hold isn't a line, it's a suggestion. Restating it plainly, without a fight, is how a boundary stays real." },
    { text: "A friend guilt-trips you: \"Fine, I guess I'll just play alone forever then,\" after you said no once.",
      ask: "That's guilt used as a crowbar. Is their sad face your fault? How do you stay kind but not cave?",
      answer: "e.g. \"I still can't today, but let's play tomorrow.\" You can care about their feelings AND keep your no.",
      why: "Guilt-tripping tries to make their disappointment YOUR emergency so you'll fold. You're allowed to feel bad for someone and still not change your answer. Kindness doesn't mean saying yes to everything \u2014 it means being warm while you hold your line." },
    { text: "You returned a broken toy for a refund. The shopkeeper keeps saying \"policy is policy\" and won't budge.",
      ask: "They're hiding behind a rule. It arrived broken \u2014 that's not fair. How do you hold your ground, politely and firmly?",
      answer: "e.g. \"I understand there's a policy, but this was broken when I got it. I'd like it fixed or my money back.\" Calm, repeated, specific.",
      why: "'Policy is policy' is often a wall people put up hoping you'll walk away. Staying polite but not leaving \u2014 restating the actual unfairness \u2014 is your power. You can respect a person and still not accept an answer that isn't fair. Firm isn't the same as rude." }
  ]
};

/* ---- hold_your_ground layout (mirrors ripple_effect / cause_effect_chains) ---- */
function hygRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    justSayNo: "SAY NO CLEARLY", askFair: "ASK FOR WHAT'S FAIR",
    thirdOption: "FIND THE THIRD OPTION", holdTheLine: "HOLD THE LINE"
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

/* ============================================================
   prove_me_wrong — "How Would I Know If I'm WRONG?"
   Teaches falsification / testing beliefs like a scientist:
   deciding in advance what evidence would change your mind,
   hunting for what disproves you, and spotting claims built to
   be un-disprovable. Deterministic; never calls AI.
============================================================ */
window.TEMPLATES.prove_me_wrong = {
  id: "prove_me_wrong",
  label: "How Would I Know If I'm WRONG? (test it like a scientist)",
  subject: "reading",
  grades: ["2", "3"],
  topicHint: "Falsification & testing beliefs: deciding ahead of time what would change your mind, hunting for evidence AGAINST your own idea, and spotting claims rigged so nothing could ever prove them wrong",
  maxTokens: 0, // never calls AI

  modifiers: [
    { id: "mode", type: "select", label: "Testing skill",
      options: [
        { value: "changeMyMind", label: "What would change my mind? (name it first)" },
        { value: "testIt",       label: "Design the test (how could we check?)" },
        { value: "cantLose",     label: "The can't-lose claim (nothing could disprove it)" },
        { value: "onlyMyReasons", label: "Only hunting for 'I'm right' clues (find the other side)" },
        { value: "mixed",        label: "Mixed (a bit of each)" }
      ], default: "mixed" },
    { id: "count", type: "number", label: "# of items", default: 8, min: 4, max: 16 },
    { id: "explain", type: "boolean", label: "Ask the child to explain their thinking", default: true },
    { id: "workedExample", type: "boolean", label: "Show a worked example at the top", default: true }
  ],

  generate(m) {
    const count = Math.max(4, Math.min(16, parseInt(m.count, 10) || 8));
    const modes = m.mode === "mixed"
      ? ["changeMyMind", "testIt", "cantLose", "onlyMyReasons"]
      : [m.mode];
    const pools = {};
    const items = [];
    for (let i = 0; i < count; i++) {
      const mode = modes[i % modes.length];
      if (!pools[mode] || pools[mode].length === 0) pools[mode] = pmwShuffle(PMW_BANKS[mode].slice());
      items.push(Object.assign({ mode }, pools[mode].pop()));
    }
    return { items, explain: m.explain !== false, workedExample: m.workedExample !== false, modifiers: m };
  },

  renderPDF(doc, content, m, kid, opts = {}) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;
    const title = "How Would I Know If I'm WRONG?";

    y = pdfDrawNameDateLine(doc, y, pageW, margin);
    y = pdfDrawTitleBar(doc, title, y, pageW, margin);
    y = pdfDrawInstruction(
      doc,
      "Anybody can pile up reasons they're right \u2014 that's the easy part, and your brain does it for free. The REAL test of an idea is the opposite question: \"What would show me I'm WRONG?\" A scientist doesn't just look for proof they're right; they go hunting for the thing that could knock their idea down. If they hunt hard and nothing knocks it down, THEN the idea is strong. Two sovereign moves live here. First: before you dig in, name out loud what evidence WOULD change your mind \u2014 if you can't think of anything that could, you're not really thinking, you're just cheering. Second: watch out for a \"can't-lose\" claim \u2014 one built so cleverly that nothing could ever prove it wrong. That's not a strong idea; it's a trick. For each one, do the thinking the question asks.",
      y, pageW, margin
    );

    if (content.workedExample) {
      y = pdfDrawWorkedExampleBox(doc, (x, by, w) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 130, 130);
        doc.text("Worked example", x, by + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        const ex = doc.splitTextToSize(
          "Claim: \"My lucky socks make our team win.\" Instead of listing the games we won in them, ask the wrong-hunting question: what would show this is FALSE? Easy \u2014 wear them and LOSE, or take them off and still WIN. So the test is simple: play some games without the socks and see what happens. If we win plenty without them, the socks weren't doing it. Naming in advance what would change your mind (\"if we win without them, I was wrong\") is the whole move. A claim you'd never let ANY result disprove isn't strong \u2014 it's just a feeling wearing a science costume.",
          w);
        doc.text(ex, x, by + 22);
      }, y, pageW, margin, 118);
    }

    content.items.forEach((it, idx) => {
      const needed = pmwRowHeight(doc, it, pageW - margin * 2, content.explain, opts.showAnswers);
      if (pdfNeedNewPage(doc, y, needed, margin)) {
        y = pdfAddPageWithHeader(doc, title, pageW, margin);
      }
      y = pmwRenderRow(doc, it, idx + 1, margin, y, pageW - margin * 2, content.explain, opts.showAnswers);
      y += 12;
    });

    pdfStampFooters(doc, kid, pageW, pageH, margin);
  }
};

/* ---- prove_me_wrong helpers ---- */
function pmwShuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Each item: { text, ask, answer, why } (same shape as cause_effect_chains / ripple_effect)
//   text   = the claim / belief on the table
//   ask    = the wrong-hunting prompt (mode-specific)
//   answer = one good model read (a good option, not THE only answer)
//   why    = reasoning in plain kid language, sovereign falsification voice
const PMW_BANKS = {
  // Name, in advance, what evidence WOULD change your mind. If nothing could, you're cheering, not thinking.
  changeMyMind: [
    { text: "\"I think our new puppy learns tricks faster than most dogs.\"",
      ask: "Before you argue it, name it: what would you have to SEE to admit you were wrong?",
      answer: "e.g. \"If we timed other puppies learning 'sit' and lots of them learned it as fast or faster, I'd be wrong.\" That's a real test you could actually run.",
      why: "Saying what would change your mind FIRST keeps you honest \u2014 now you're looking for the truth, not just for wins. If you can't name a single thing that could prove you wrong, you don't really have an idea yet, just a feeling you like." },
    { text: "\"This bridge in my building game is strong enough to hold the heavy truck.\"",
      ask: "What result would prove you wrong \u2014 and how could you check it on purpose?",
      answer: "e.g. \"If I drive the heavy truck across and it collapses, I'm wrong.\" Test it: actually send the truck across before you trust it with everything.",
      why: "A guess becomes knowledge only after you try the thing that could break it. Deciding ahead of time ('collapse = wrong') means the test gives you a real answer instead of an argument." },
    { text: "\"Reading before bed helps ME fall asleep faster.\"",
      ask: "Name what would show it's NOT helping. How could you find out for real?",
      answer: "e.g. \"If I fall asleep just as fast on nights I DON'T read, then reading isn't what's doing it.\" Try some nights with reading and some without, and notice.",
      why: "The honest test compares WITH the thing to WITHOUT the thing. If you only ever read before bed, you can never tell if the reading is the cause or if you'd fall asleep anyway. Name the failing result, then go check." },
    { text: "\"I'm sure the red team is better than the blue team at our game.\"",
      ask: "What would you accept as proof you were wrong? Say it before the next game.",
      answer: "e.g. \"If blue beats red in the next three games, I was wrong.\" Now the games actually settle it.",
      why: "If you'd explain away EVERY blue win ('they got lucky') and count EVERY red win as proof, you never really tested anything. Setting the bar in advance ('three losses = I was wrong') stops you from moving the goalposts to stay right." },
    { text: "\"My plant grows better because I talk to it every morning.\"",
      ask: "What would change your mind? Design it so the talking is the ONLY difference.",
      answer: "e.g. grow two same plants, same sun and water, talk to one and not the other. \"If the quiet one grows just as well, I'm wrong.\"",
      why: "To test if talking is the cause, everything ELSE has to match, so the talking is the only thing that could explain a difference. Naming the losing result up front ('quiet one does just as well = I was wrong') is what makes it a test and not a wish." }
  ],
  // Turn a belief into something you could actually check. What test would settle it?
  testIt: [
    { text: "\"Warm water freezes faster than cold water.\" (some people really believe this!)",
      ask: "Don't argue it \u2014 design a fair test. What would you do, and what result decides it?",
      answer: "e.g. two same cups, same freezer, one warm one cold, start the timer, see which turns to ice first. Whichever wins, wins \u2014 you let the test decide, not your hunch.",
      why: "A fair test changes ONE thing (warm vs cold) and keeps everything else the same. Then you don't have to win the argument with your mouth \u2014 the freezer answers it. That's the whole power of a test: it can prove YOU wrong, and that's a good thing." },
    { text: "\"You can tell what someone's like just by the colour shirt they picked today.\"",
      ask: "How could you actually check if that's true instead of just believing it?",
      answer: "e.g. guess people's personality from their shirt colour, write it down FIRST, then get to know them and see how often you were right. If it's about as often as random guessing, the shirt told you nothing.",
      why: "Writing your guess down BEFORE you learn the truth stops your brain from quietly saying 'yeah I knew that' afterward. A claim that sounds cool but does no better than random guessing when you actually test it isn't knowledge \u2014 it's a story." },
    { text: "\"Chewing gum helps you concentrate on hard problems.\"",
      ask: "What's a fair way to test this on yourself? What would count as it working?",
      answer: "e.g. do a set of hard problems with gum and a matched set without, same time of day, and compare your scores and how focused you felt. Working = clearly better with gum, more than once.",
      why: "One try proves nothing \u2014 you could've just had a good day. A fair test repeats it and compares with-vs-without. Deciding 'working = clearly better, more than once' keeps you from calling a lucky day proof." },
    { text: "\"The line at the LEFT checkout is always faster than the right one.\"",
      ask: "How would you check this instead of just feeling it? What result would settle it?",
      answer: "e.g. over many shopping trips, mark down which side you picked and whether it was actually faster. If left wins about half the time, it was never really faster \u2014 you just remembered the annoying times.",
      why: "Feelings keep a lopsided score: the times the OTHER line was faster sting, so you remember them and forget the rest. Counting it fairly across many tries replaces the feeling with a real number \u2014 which can prove your hunch wrong." },
    { text: "\"Our team plays better when the coach wears his blue hat.\"",
      ask: "Design the test. What would show the hat has nothing to do with it?",
      answer: "e.g. keep track of wins with the blue hat AND with any other hat / no hat. If the team wins about the same either way, the hat isn't doing it.",
      why: "Superstitions survive because nobody tests the OTHER side \u2014 the games without the blue hat. Once you count both, the hat usually turns out to be along for the ride, not steering. The test is willing to embarrass the belief; that's why it's trustworthy." }
  ],
  // The "can't-lose" claim: built so nothing could ever prove it wrong. That's a trick, not a strong idea.
  cantLose: [
    { text: "\"There's an invisible dragon in my garage \u2014 but it's silent, you can't touch it, and it leaves no marks.\"",
      ask: "What test could ever prove this WRONG? If none can, what does that tell you?",
      answer: "e.g. nothing could \u2014 every check is answered with 'oh, it's invisible/silent/leaves no marks.' A claim you can never test or disprove isn't a strong claim; it's built to dodge every test.",
      why: "When someone adds a new excuse for every way you try to check ('you just can't detect it'), the claim isn't winning \u2014 it's hiding. A real idea sticks its neck out and says 'here's how you could catch me being wrong.' One that can't lose was never really playing." },
    { text: "\"This bracelet protects you from bad luck.\" When someone wearing it has a bad day: \"Imagine how much worse it would've been without it!\"",
      ask: "Is there ANY result that would count against the bracelet? What's the trick here?",
      answer: "e.g. no \u2014 good day = bracelet worked, bad day = 'would've been worse.' Every possible result gets counted as proof. That's the can't-lose trick.",
      why: "If good days AND bad days both 'prove' it works, the bracelet is un-disprovable \u2014 and un-disprovable means untested. Notice the move: they turned the one result that should count AGAINST it ('a bad day') into more proof FOR it. That's how a trick protects itself." },
    { text: "\"This vitamin makes you healthier.\" \"But I still got a cold.\" \"You'd have gotten TWO colds without it.\"",
      ask: "What outcome would the seller ever admit means the vitamin failed?",
      answer: "e.g. none \u2014 healthy = vitamin worked, sick = 'would've been sicker.' If no result is allowed to mean 'it failed,' the claim can't be tested and shouldn't be trusted just because it sounds sciency.",
      why: "A claim earns trust by SURVIVING tests that could have killed it. If the seller has an answer that turns every bad result into a good one, they've made sure it can never fail a test \u2014 which means it never passed one either." },
    { text: "\"My plan is guaranteed to work. And if it doesn't work, that just proves you didn't believe in it hard enough.\"",
      ask: "Spot the trap: what happens to every possible outcome in this claim?",
      answer: "e.g. it works = plan's great; it fails = your fault for not believing. The claim can never be wrong because failure gets blamed on YOU. That's a can't-lose claim wearing a motivational costume.",
      why: "Watch for claims that quietly make failure impossible to pin on the claim itself. 'It only fails if you doubt it' means it's rigged \u2014 there's no result that could ever count against it. Sovereign move: notice that a claim that can't fail also can't be trusted." },
    { text: "\"Everyone secretly agrees with me. The ones who say they don't are just too scared to admit it.\"",
      ask: "How could anyone EVER show this is false? What's sneaky about it?",
      answer: "e.g. they can't \u2014 agree = 'see, everyone agrees'; disagree = 'you're just scared to admit it.' Disagreement itself gets counted as secret agreement, so no answer can ever prove it wrong.",
      why: "This one flips the strongest evidence AGAINST it ('people telling you no') into evidence FOR it. When 'you disagree' is treated as proof you actually agree, there's no honest test left. A claim that eats all disagreement isn't strong \u2014 it's sealed shut." }
  ],
  // Confirmation hunt: you only looked for clues you're right. Go find the other side.
  onlyMyReasons: [
    { text: "A kid is SURE a new game is boring, so he lists 5 boring things about it \u2014 and never asks anyone who loves it why they do.",
      ask: "He only hunted for 'it's boring' clues. What would an honest look ALSO go find?",
      answer: "e.g. go ask two kids who love it what's fun about it, and actually try the parts he skipped. Hunt just as hard for 'why someone likes it' as for 'why I don't.'",
      why: "Your brain hands you 'I'm right' clues for free and hides the rest. If you only collect evidence for the side you already picked, of COURSE you'll feel sure \u2014 but sure isn't the same as right. The honest move is to hunt for the OTHER side just as hard." },
    { text: "Someone believes a rumour, so they remember every time it seemed true and forget every time it didn't.",
      ask: "They're only counting the hits. What are they NOT counting \u2014 and why does it matter?",
      answer: "e.g. all the times the rumour was flat-out wrong, which they skipped right past. To judge it fairly you have to count the misses too, not just the times it 'worked.'",
      why: "Remembering only the hits is like calling yourself a great free-throw shooter while ignoring every miss. A fair score needs the misses IN it. Counting only the clues that fit is the most common way smart people fool themselves." },
    { text: "You think your friend is being mean to you today, so every little thing they do starts to look mean.",
      ask: "You're hunting for 'they're mean' clues. What would checking the OTHER idea look like?",
      answer: "e.g. ask yourself 'what if they're just having a rough day / didn't notice me?' \u2014 then look for clues that fit THAT, or just ask them straight.",
      why: "Once you pick a story ('they're mean'), your eyes start finding it everywhere \u2014 even in stuff that isn't. Deliberately trying on the opposite story, or just asking, breaks the spell. Hunting only for clues that fit your first guess turns a maybe into a 'fact' that isn't one." },
    { text: "A store shows you 20 five-star reviews of a toy on its own website and none of the bad ones.",
      ask: "They only showed the 'it's great' clues. What are you missing, and how do you get it?",
      answer: "e.g. the 1- and 2-star reviews, which the store hid. Go look somewhere the store doesn't control \u2014 you need the complaints too before you decide.",
      why: "Whoever's selling you something will only show you the clues that help THEM. That's a one-sided hunt done on purpose. To judge fairly you have to go get the side they left out \u2014 the reviews they'd rather you never see." },
    { text: "A kid says 'I'm just bad at math,' then only notices the questions he gets wrong and ignores every one he gets right.",
      ask: "He's collecting only the 'I'm bad' clues. What's the fairer way to look?",
      answer: "e.g. count the ones he gets RIGHT too, and notice which kinds he's actually good at. The full picture is almost never 'all bad' \u2014 that's just the clues he chose to keep.",
      why: "A belief about yourself can run the same one-sided hunt: keep every failure, toss every success, and 'I'm bad at this' starts to feel true. Counting BOTH sides is fairer to the world \u2014 and a lot fairer to yourself." }
  ]
};

/* ---- prove_me_wrong layout (mirrors ripple_effect / cause_effect_chains row layout) ---- */
function pmwRowHeight(doc, it, w, explain, showAnswers) {
  return ceRowHeight(doc, it, w, explain, showAnswers);
}

function pmwRenderRow(doc, it, num, x, y, w, explain, showAnswers) {
  const modeTag = {
    changeMyMind: "WHAT WOULD CHANGE MY MIND?", testIt: "DESIGN THE TEST",
    cantLose: "THE CAN'T-LOSE CLAIM", onlyMyReasons: "HUNT THE OTHER SIDE"
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

  // The claim
  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  const textLines = doc.splitTextToSize(it.text, bw);
  doc.text(textLines, bx, cy);
  cy += textLines.length * 13 + 6;

  // The wrong-hunting question
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
  wonder_why: "1", who_told_you: "1",
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

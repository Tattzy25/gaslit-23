export interface ChartDataset {
  title: string;
  labelKey: string;
  numericKeys: string[];
  rows: Array<Record<string, string | number>>;
}

function tryParseJsonBlock(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Direct JSON
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // continue to fenced block search
    }
  }

  // Fenced ```json block
  const jsonMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (jsonMatch?.[1]) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      return null;
    }
  }

  return null;
}

function extractMarkdownTable(text: string): Array<Record<string, string | number>> | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 2; i++) {
    const headerLine = lines[i].trim();
    const sepLine = lines[i + 1].trim();
    if (
      headerLine.includes("|") &&
      sepLine.includes("|") &&
      /^[\s|:-]+$/.test(sepLine)
    ) {
      const headers = headerLine
        .split("|")
        .map((h) => h.trim())
        .filter(Boolean);
      if (headers.length < 2) continue;

      const rows: Array<Record<string, string | number>> = [];
      for (let j = i + 2; j < lines.length; j++) {
        const rowLine = lines[j].trim();
        if (!rowLine.includes("|")) break;
        const cells = rowLine
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => {
            if (rowLine.startsWith("|") && idx === 0) return false;
            if (rowLine.endsWith("|") && idx === arr.length - 1) return false;
            return true;
          });
        if (cells.length === headers.length) {
          const obj: Record<string, string | number> = {};
          headers.forEach((h, idx) => {
            const raw = cells[idx];
            const cleaned = raw.replace(/[$,%]/g, "").replace(/,/g, "");
            const num = Number(cleaned);
            obj[h] = cleaned !== "" && !Number.isNaN(num) ? num : raw;
          });
          rows.push(obj);
        }
      }
      if (rows.length >= 2) return rows;
    }
  }
  return null;
}

export function extractChartDataset(text: string): ChartDataset | null {
  let candidateRows: Array<Record<string, unknown>> | null = null;

  const parsedJson = tryParseJsonBlock(text);
  if (Array.isArray(parsedJson) && parsedJson.length >= 2 && typeof parsedJson[0] === "object" && parsedJson[0] !== null) {
    candidateRows = parsedJson as Array<Record<string, unknown>>;
  } else if (parsedJson && typeof parsedJson === "object") {
    const obj = parsedJson as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      if (Array.isArray(val) && val.length >= 2 && typeof val[0] === "object" && val[0] !== null) {
        candidateRows = val as Array<Record<string, unknown>>;
        break;
      }
    }
  }

  if (!candidateRows) {
    const mdTable = extractMarkdownTable(text);
    if (mdTable) {
      candidateRows = mdTable;
    }
  }

  if (!candidateRows || candidateRows.length < 2) return null;

  const sampleKeys = Object.keys(candidateRows[0]);
  if (sampleKeys.length < 2) return null;

  const numericKeys: string[] = [];
  let labelKey = sampleKeys[0];

  for (const key of sampleKeys) {
    const allNumeric = candidateRows.every((r) => {
      const v = r[key];
      if (typeof v === "number" && !Number.isNaN(v)) return true;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v.replace(/[$,%]/g, "")))) return true;
      return false;
    });
    if (allNumeric) {
      numericKeys.push(key);
    } else if (labelKey === sampleKeys[0] || typeof candidateRows[0][key] === "string") {
      labelKey = key;
    }
  }

  if (numericKeys.length === 0) return null;
  if (numericKeys.includes(labelKey) && sampleKeys.length > numericKeys.length) {
    const nonNum = sampleKeys.find((k) => !numericKeys.includes(k));
    if (nonNum) labelKey = nonNum;
  }

  const normalizedRows = candidateRows.slice(0, 30).map((row, idx) => {
    const out: Record<string, string | number> = {
      [labelKey]: String(row[labelKey] ?? `Item ${idx + 1}`),
    };
    for (const nk of numericKeys.slice(0, 4)) {
      const raw = row[nk];
      out[nk] = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,%]/g, "")) || 0;
    }
    return out;
  });

  return {
    title: "Extracted Dataset Visualization",
    labelKey,
    numericKeys: numericKeys.slice(0, 4),
    rows: normalizedRows,
  };
}

export function extractStructuredJson(text: string): unknown | null {
  return tryParseJsonBlock(text);
}

export function convertOutputToCsv(text: string): string {
  const dataset = extractChartDataset(text);
  if (dataset) {
    const headers = [dataset.labelKey, ...dataset.numericKeys];
    const escape = (val: unknown) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [
      headers.map(escape).join(","),
      ...dataset.rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ];
    return lines.join("\n");
  }

  const mdTable = extractMarkdownTable(text);
  if (mdTable && mdTable.length > 0) {
    const headers = Object.keys(mdTable[0]);
    const escape = (val: unknown) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      headers.map(escape).join(","),
      ...mdTable.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ].join("\n");
  }

  // Fallback: line-by-line CSV
  const rows = text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line, i) => `${i + 1},"${line.replace(/"/g, '""')}"`);
  return ["line,content", ...rows].join("\n");
}

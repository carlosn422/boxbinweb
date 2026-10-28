import { copilotText as ct, copilotLanguage, type CopilotLanguage } from './copilotI18n';
export interface CopilotDocument {
  language?: CopilotLanguage;
  title: string;
  content: string;
  companyName?: string;
  binName?: string;
  locationName?: string;
  preparedBy?: string;
  fecha?: string;
  pageSize?: "LETTER" | "A4";
  orientation?: "portrait" | "landscape";
  accentColor?: string;
  image?: string;
  imageCaption?: string;
}

export function documentFilename(title: string, extension = "pdf") {
  return `${
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 90) || "BoxBin_Document"
  }.${extension}`;
}

function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? { text: part.slice(2, -2), bold: true }
        : { text: part }
    );
}

/** Markdown parser for clean document blocks */
export function documentBlocks(content: string): any[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: any[] = [];
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  for (let i = 0; i < lines.length; ) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (line === "---page---") {
      blocks.push({ text: "", pageBreak: "before" });
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        text: inline(heading[2]),
        fontSize: 17 - heading[1].length * 2,
        bold: true,
        margin: [0, 12, 0, 6],
      });
      i++;
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      cells(lines[i + 1]).length > 0 &&
      cells(lines[i + 1]).every((c) => /^:?-{3,}:?$/.test(c))
    ) {
      const header = cells(line);
      if (header.length > 8) throw new Error(ct('docColumns'));
      const rows: any[][] = [
        header.map((c) => ({ text: inline(c), bold: true, fillColor: "#e2e8f0" })),
      ];
      i += 2;
      while (i < lines.length) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        if (!trimmed || !trimmed.startsWith("|") || trimmed.startsWith("#") || trimmed.startsWith("---")) {
          break;
        }
        i++;
        const rawRow = cells(rawLine);
        const row = header.map((_, idx) => ({ text: inline(rawRow[idx] ?? "") }));
        rows.push(row);
      }
      blocks.push({
        table: { headerRows: 1, widths: header.map(() => "*"), body: rows },
        layout: "lightHorizontalLines",
        margin: [0, 6, 0, 12],
        fontSize: 10,
      });
      continue;
    }
    const list = line.match(/^([-*]|\d+\.)\s+(.+)$/);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const entries = [];
      const start = ordered ? parseInt(list[1], 10) : undefined;
      while (i < lines.length) {
        const item = lines[i].trim().match(ordered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/);
        if (!item) break;
        entries.push({ text: inline(item[1]), margin: [0, 0, 0, 4] });
        i++;
      }
      blocks.push({
        [ordered ? "ol" : "ul"]: entries,
        ...(ordered ? { start } : {}),
        margin: [0, 4, 0, 8],
      });
      continue;
    }
    blocks.push({ text: inline(line), margin: [0, 0, 0, 7] });
    i++;
  }
  return blocks;
}

export function copilotDocumentDefinition(data: CopilotDocument): any {
  const language = data.language || copilotLanguage();
  const docText = (key: string, values: Record<string, string | number> = {}) => ct(key, values, language);
  if (!data.title?.trim() || !data.content?.trim()) {
    throw new Error(docText('docRequired'));
  }
  if (data.title.length > 200 || data.content.length > 30000) {
    throw new Error(docText('docLength'));
  }
  if (
    data.fecha &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha) ||
      !Number.isFinite(Date.parse(data.fecha)) ||
      new Date(data.fecha).toISOString().slice(0, 10) !== data.fecha)
  ) {
    throw new Error(docText('docDate'));
  }
  if (
    data.image &&
    (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data.image) ||
      data.image.length > 8_000_000)
  ) {
    throw new Error(docText('docImage'));
  }

  const accent = /^#[0-9a-f]{6}$/i.test(data.accentColor || "")
    ? data.accentColor
    : "#0f172a";

  return {
    pageSize: data.pageSize === "A4" ? "A4" : "LETTER",
    pageOrientation: data.orientation === "landscape" ? "landscape" : "portrait",
    pageMargins: [42, 40, 42, 45],
    info: {
      title: data.title,
      author: data.preparedBy || data.companyName || "BoxBin",
    },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.25, color: "#1e293b" },
    content: [
      {
        columns: [
          {
            text: data.companyName || docText('docBrand'),
            bold: true,
            fontSize: 12,
            color: accent,
          },
          {
            text: data.fecha ? docText('docDateLabel', { date: data.fecha }) : "",
            alignment: "right",
            fontSize: 9,
            color: "#64748b",
          },
        ],
        margin: [0, 0, 0, 10],
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 1.5, lineColor: accent }],
        margin: [0, 0, 0, 14],
      },
      { text: data.title, bold: true, fontSize: 18, color: accent, margin: [0, 0, 0, 8] },
      ...(data.binName
        ? [
            {
              text: [
                { text: docText('docBin'), bold: true, color: "#334155" },
                { text: data.binName, bold: true, color: accent },
              ],
              margin: [0, 0, 0, 4],
            },
          ]
        : []),
      ...(data.locationName
        ? [
            {
              text: [
                { text: docText('docLocation'), bold: true, color: "#334155" },
                { text: data.locationName, color: "#475569" },
              ],
              margin: [0, 0, 0, 10],
            },
          ]
        : []),
      ...documentBlocks(data.content),
      ...(data.image
        ? [
            {
              image: data.image,
              fit: [450, 300],
              alignment: "center",
              margin: [0, 14, 0, 6],
            },
            {
              text: data.imageCaption || docText('docPhoto'),
              fontSize: 9,
              alignment: "center",
              color: "#64748b",
            },
          ]
        : []),
      ...(data.preparedBy
        ? [
            {
              unbreakable: true,
              stack: [
                { text: "____________________________________", margin: [0, 24, 0, 4], color: "#94a3b8" },
                { text: docText('docPreparedBy', { name: data.preparedBy }), bold: true, fontSize: 9 },
                { text: docText('docNotice'), fontSize: 8, color: "#94a3b8" },
              ],
            },
          ]
        : []),
    ],
    footer: (page: number, total: number) => ({
      text: docText('docPage', { page, total }),
      alignment: "right",
      margin: [42, 10, 42, 0],
      fontSize: 8,
      color: "#94a3b8",
    }),
  };
}

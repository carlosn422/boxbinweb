import { useTranslation } from 'react-i18next';
import { copilotText as ct } from '@/lib/copilotI18n';
import { Fragment, type ReactNode } from 'react';
// React escapes all text. Raw HTML is deliberately unsupported, including inside links.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-slate-100 px-1 text-slate-900">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline break-all">{link[1]}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
export function SafeMarkdown({
  text
}: {
  text: string;
}) {
  const lines = text.split('\n'),
    blocks: ReactNode[] = [];
  const cells = (s: string) => s.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('|') && lines[i + 1] && cells(lines[i + 1]).every(c => /^:?-{3,}:?$/.test(c))) {
      const header = cells(line),
        rows: string[][] = [];
      const key = i;
      i++;
      while (i + 1 < lines.length && lines[i + 1].includes('|')) rows.push(cells(lines[++i]));
      blocks.push(<div key={key} className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
            <thead>
            <tr>{header.map((c, j) => <th key={j} className="border p-1.5 text-left">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, r) => <tr key={r}>{row.map((c, j) => <td key={j} className="border p-1.5">{inline(c)}</td>)}</tr>)}</tbody>
            </table>
            </div>);
    } else if (/^#{1,3} /.test(line)) blocks.push(<h4 key={i} className="font-bold pt-2">{inline(line.replace(/^#{1,3} /, ''))}</h4>);else if (/^[-*] /.test(line)) blocks.push(<p key={i} className="pl-2">• {inline(line.slice(2))}</p>);else if (line.trim()) blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="space-y-2 break-words">{blocks}</div>;
}
export function SearchSuggestions({
  html
}: {
  html: string;
}) {
  useTranslation();
  // Google's supplied widget stays in a separate, opaque origin without scripts or top navigation.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'">`;
  return <iframe title={ct('searchSuggestions')} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={policy + html} className="w-full h-28 border-0 bg-white rounded" />;
}

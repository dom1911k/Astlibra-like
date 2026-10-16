/**
 * Playtest log: your feedback notes (F9) plus automatically recorded events (rooms, deaths,
 * guardians, level-ups, loot), saved in the browser and exportable as a Markdown report.
 */
export interface LogEntry {
  at: string; // ISO time
  kind: 'note' | 'room' | 'clear' | 'death' | 'boss' | 'level' | 'loot' | 'run' | 'cheat';
  text: string;
  ctx?: string;
}

const KEY = 'cinderdeep_playlog_v1';
const MAX = 2000;

export class PlayLog {
  entries: LogEntry[] = [];
  constructor() {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) this.entries = JSON.parse(raw);
    } catch {
      this.entries = [];
    }
  }
  add(kind: LogEntry['kind'], text: string, ctx?: string): void {
    this.entries.push({ at: new Date().toISOString(), kind, text, ctx });
    if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX);
    this.save();
  }
  save(): void {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(this.entries));
    } catch {
      /* storage full or unavailable */
    }
  }
  clear(): void {
    this.entries = [];
    this.save();
  }
  get notes(): number {
    return this.entries.filter((e) => e.kind === 'note').length;
  }

  toMarkdown(summary: string): string {
    const lines: string[] = [];
    lines.push('# Cinderdeep playtest report', '');
    lines.push(`Exported ${new Date().toLocaleString()}`, '');
    lines.push('## Summary', '', summary, '');
    const notes = this.entries.filter((e) => e.kind === 'note');
    lines.push(`## Feedback notes (${notes.length})`, '');
    if (!notes.length) lines.push('_No notes yet — press F9 while playing to add one._');
    for (const n of notes) lines.push(`- **${fmtTime(n.at)}** — ${n.text}${n.ctx ? `  \n  _${n.ctx}_` : ''}`);
    lines.push('', '## Event timeline', '');
    lines.push('| Time | Event | Details | Context |', '|---|---|---|---|');
    for (const e of this.entries) lines.push(`| ${fmtTime(e.at)} | ${e.kind} | ${esc(e.text)} | ${esc(e.ctx ?? '')} |`);
    return lines.join('\n');
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}
function esc(s: string): string {
  return s.replace(/\|/g, '/').replace(/\n/g, ' ');
}

/**
 * Save a text file for the player. Inside a claude.ai hosted page the viewer's own download
 * prompt is used (plain downloads are blocked there); everywhere else a normal browser download.
 * Resolves with a short status message for a toast.
 */
export async function downloadText(filename: string, text: string): Promise<string> {
  const host = (globalThis as any).claude;
  if (host?.use) {
    const downloads = await host.use('downloads').catch(() => null);
    if (downloads) {
      try {
        await downloads.save({ filename, data: text });
        return 'Report saved';
      } catch (e: any) {
        if (e?.code === 'declined') return 'Download cancelled';
        if (e?.code === 'rate_limited') return 'A save prompt is already open';
        return 'Saving is not available here — use "Copy report" instead';
      }
    }
  }
  const blob = new Blob([text], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  return 'Report downloaded';
}

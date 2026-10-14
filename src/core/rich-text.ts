import type { Message, Project, FieldValue } from "./model.js";
import { mentionRuns } from "./interaction.js";
export interface TextRun {
  text: string;
  mention: boolean;
}
export function richTextRuns(
  project: Project,
  message: Message,
  template: string,
  data: Record<string, FieldValue>,
) {
  const result: TextRun[] = [];
  let cursor = 0;
  for (const match of template.matchAll(/\{\{([\w.-]+)\}\}/g)) {
    if (match.index > cursor)
      result.push({
        text: template.slice(cursor, match.index),
        mention: false,
      });
    const field = match[1]!,
      text = String(data[field] ?? "");
    result.push(...mentionRuns(project, message, field, text));
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length)
    result.push({ text: template.slice(cursor), mention: false });
  return result;
}
export function wrapTextRuns(
  runs: TextRun[],
  limit: number,
  measure: (text: string, mention: boolean) => number,
) {
  const lines: TextRun[][] = [[]];
  let width = 0;
  const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
  for (const run of runs)
    for (const { segment } of segmenter.segment(run.text)) {
      if (segment === "\n") {
        lines.push([]);
        width = 0;
        continue;
      }
      const w = measure(segment, run.mention);
      if (width + w > limit && lines.at(-1)!.length) {
        lines.push([]);
        width = 0;
      }
      const last = lines.at(-1)!.at(-1);
      if (last && last.mention === run.mention) last.text += segment;
      else lines.at(-1)!.push({ text: segment, mention: run.mention });
      width += w;
    }
  return lines;
}

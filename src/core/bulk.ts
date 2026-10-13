import {
  createMessage,
  type Message,
  type Project,
  type StylePlugin,
} from "./model.js";
export function parseBulk(
  text: string,
  project: Project,
  plugin: StylePlugin,
): Message[] {
  const other = project.speakers.find((s) => s.id !== project.meId)!;
  return text.split("\n").flatMap((raw) => {
    if (!raw.trim()) return [];
    let content = raw.trim(),
      waitMs = 800;
    const timing = /\s+\|(\d+(?:\.\d+)?)\s*$/.exec(content);
    if (timing) {
      waitMs = Number(timing[1]) * 1000;
      content = content.slice(0, timing.index).trimEnd();
    }
    if (waitMs > 600000) throw new Error("单条消息的等待时间最多 600 秒");
    const prefix = /^([^：:]+)[：:]\s*/.exec(content);
    let speaker = other;
    if (prefix) {
      const who = prefix[1]!.trim();
      const match = project.speakers.find(
        (s) => s.name === who || s.id === who,
      );
      if (match || ["我", "out", "me", "in"].includes(who)) {
        speaker =
          match ||
          (["我", "out", "me"].includes(who)
            ? project.speakers.find((s) => s.id === project.meId)!
            : other);
        content = content.slice(prefix[0].length);
      }
    }
    const message = createMessage(speaker.id, plugin);
    message.data.text = content;
    message.waitMs = waitMs;
    return [message];
  });
}

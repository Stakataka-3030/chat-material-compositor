import type { Project, Message } from "./model.js";
export interface MessageEvent {
  messageId: string;
  index: number;
  atMs: number;
  typingStartMs: number;
  endMs: number;
}
export interface Timeline {
  events: MessageEvent[];
  durationMs: number;
  messagesEndMs: number;
}
export function buildTimeline(project: Project): Timeline {
  let cursor = project.playback.leadMs;
  const events = project.messages.map((m, index) => {
    cursor += m.waitMs;
    const typingStartMs = cursor;
    cursor += m.typingMs;
    const event = {
      messageId: m.id,
      index,
      atMs: cursor,
      typingStartMs,
      endMs: cursor + project.playback.popMs,
    };
    return event;
  });
  const voiceEnds = project.messages.flatMap((m, i) =>
    m.data.audioAsset && typeof m.data.seconds === "number"
      ? [events[i]!.atMs + 100 + Math.max(0, m.data.seconds) * 1000]
      : [],
  );
  const messagesEndMs = Math.max(
    cursor,
    ...events.map((e) => e.endMs),
    ...voiceEnds,
    0,
  );
  return {
    events,
    messagesEndMs,
    durationMs:
      messagesEndMs +
      project.playback.tailMs +
      (project.playback.loop ? project.playback.fadeMs : 0),
  };
}
export function visibleMessages(project: Project, atMs: number): Message[] {
  const timeline = buildTimeline(project);
  return project.messages.filter(
    (_, i) => (timeline.events[i]?.atMs ?? Infinity) <= atMs,
  );
}
export const easeOut = (p: number) =>
  1 - (1 - Math.max(0, Math.min(1, p))) ** 3;
export const easeSmooth = (p: number) => {
  const t = Math.max(0, Math.min(1, p));
  return t * t * (3 - 2 * t);
};
export function frameCount(durationMs: number, fps: number) {
  return Math.max(1, Math.ceil((durationMs * fps) / 1000));
}
export function audioEvents(
  project: Project,
  timeline = buildTimeline(project),
) {
  if (!project.audio.enabled) return [];
  return project.messages.flatMap((m, i) => {
    if (m.kind === "separator") return [];
    const me = m.speakerId === project.meId;
    const speaker = project.speakers.find((s) => s.id === m.speakerId);
    const soundId =
      m.soundId ||
      speaker?.soundId ||
      (me ? project.audio.sendSoundId : project.audio.receiveSoundId);
    const event = timeline.events[i]!;
    const events =
      me && !project.audio.playSend
        ? []
        : [
            {
              atMs: event.atMs,
              soundId: soundId || null,
              messageId: m.id,
              kind: "notification" as const,
            },
          ];
    if (typeof m.data.audioAsset === "string" && m.data.audioAsset)
      return [
        ...events,
        {
          atMs: event.atMs + 100,
          soundId: m.data.audioAsset,
          messageId: m.id,
          kind: "voice" as const,
        },
      ];
    return events;
  });
}

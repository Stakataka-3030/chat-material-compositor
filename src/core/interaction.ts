import type {
  ComponentAction,
  FieldValue,
  Message,
  Project,
  StylePlugin,
  Mention,
} from "./model.js";
import { builtinPlugins } from "./plugins.js";
import type { MessageEvent } from "./timeline.js";
export function messagePlugin(project: Project, message: Message): StylePlugin {
  const plugin =
    project.plugins.find((p) => p.id === message.kind) ??
    builtinPlugins.find((p) => p.id === message.kind);
  if (!plugin) throw new Error("缺少消息类型：" + message.kind);
  return plugin;
}
export function messageData(
  project: Project,
  message: Message,
  localMs = Infinity,
): Record<string, FieldValue> {
  const data = { ...message.data };
  for (const event of [...(message.interactions ?? [])].sort(
    (a, b) => a.atMs - b.atMs,
  ))
    if (event.atMs <= localMs)
      for (const action of event.actions)
        if (action.type === "set-field") data[action.field] = action.value;
  data["sender.name"] =
    project.speakers.find((s) => s.id === message.speakerId)?.name ??
    "未知角色";
  for (const field of messagePlugin(project, message).fields)
    if (field.type === "speaker")
      data[field.key + ".name"] =
        project.speakers.find((s) => s.id === data[field.key])?.name ??
        "请选择角色";
  return data;
}
export interface RuntimeEffect {
  atMs: number;
  order: number;
  messageId: string;
  targetId: string;
  action: Exclude<ComponentAction, { type: "set-field" }>;
}
export function componentButtons(
  nodes: StylePlugin["layout"]["nodes"],
): StylePlugin["layout"]["nodes"] {
  return nodes.flatMap((node) => [
    ...(node.type === "button" ? [node] : []),
    ...componentButtons(node.children ?? []),
  ]);
}
export function componentText(
  nodes: StylePlugin["layout"]["nodes"],
): string | undefined {
  for (const node of nodes) {
    if (node.type === "text" && node.text) return node.text;
    const text = componentText(node.children ?? []);
    if (text) return text;
  }
  return undefined;
}
export function runtimeEffects(
  project: Project,
  events: MessageEvent[],
): RuntimeEffect[] {
  const result: RuntimeEffect[] = [];
  let order = 0;
  const ids = new Set(project.speakers.map((s) => s.id));
  project.messages.forEach((message, index) => {
    const add = (
      action: ComponentAction,
      atMs: number,
      data: Record<string, FieldValue>,
    ) => {
      if (action.type === "set-field") return;
      const targetId = String(data[action.targetField] ?? "");
      if (ids.has(targetId))
        result.push({
          atMs,
          order: order++,
          messageId: message.id,
          targetId,
          action:
            action.type === "avatar-shake"
              ? {
                  ...action,
                  durationMs: action.durationField
                    ? Math.max(
                        100,
                        Math.min(
                          10000,
                          Number(data[action.durationField]) || 600,
                        ),
                      )
                    : action.durationMs,
                  amplitude: action.amplitudeField
                    ? Math.max(
                        0,
                        Math.min(30, Number(data[action.amplitudeField]) || 0),
                      )
                    : action.amplitude,
                }
              : action,
        });
    };
    const at = events[index]!.atMs;
    for (const effect of messagePlugin(project, message).effects ?? [])
      add(effect, at, messageData(project, message, 0));
    for (const record of [...(message.interactions ?? [])].sort(
      (a, b) => a.atMs - b.atMs,
    )) {
      const data = { ...message.data };
      for (const earlier of [...(message.interactions ?? [])].sort(
        (a, b) => a.atMs - b.atMs,
      ))
        if (earlier.atMs < record.atMs)
          for (const action of earlier.actions)
            if (action.type === "set-field") data[action.field] = action.value;
      for (const action of record.actions) {
        if (action.type === "set-field") data[action.field] = action.value;
        else add(action, at + record.atMs, data);
      }
    }
  });
  return result.sort((a, b) => a.atMs - b.atMs || a.order - b.order);
}
export function initialMembers(project: Project, effects: RuntimeEffect[]) {
  if (project.group?.initialMemberIds)
    return [...project.group.initialMemberIds];
  const members = new Set(project.speakers.map((s) => s.id)),
    first = new Set<string>();
  for (const effect of effects)
    if (
      effect.action.type === "group-join" ||
      effect.action.type === "group-leave"
    ) {
      if (!first.has(effect.targetId)) {
        first.add(effect.targetId);
        if (effect.action.type === "group-join")
          members.delete(effect.targetId);
      }
    }
  const planned = (nodes: StylePlugin["layout"]["nodes"], message: Message) => {
    for (const node of nodes) {
      for (const action of node.actions ?? [])
        if (action.type === "group-join") {
          const id = String(message.data[action.targetField] ?? "");
          if (!first.has(id)) members.delete(id);
        }
      if (node.children) planned(node.children, message);
    }
  };
  for (const message of project.messages)
    planned(messagePlugin(project, message).layout.nodes, message);
  return [...members];
}
export function membersAt(
  project: Project,
  effects: RuntimeEffect[],
  atMs: number,
) {
  const members = new Set(initialMembers(project, effects));
  for (const effect of effects) {
    if (effect.atMs > atMs) break;
    if (effect.action.type === "group-join") members.add(effect.targetId);
    else if (effect.action.type === "group-leave")
      members.delete(effect.targetId);
  }
  return [...members];
}
export function avatarShake(
  effects: RuntimeEffect[],
  roleId: string,
  atMs: number,
) {
  const event = [...effects]
    .reverse()
    .find(
      (e) =>
        e.targetId === roleId &&
        e.action.type === "avatar-shake" &&
        e.atMs <= atMs &&
        atMs < e.atMs + (e.action.durationMs ?? 600),
    );
  if (!event || event.action.type !== "avatar-shake")
    return { x: 0, rotation: 0 };
  const duration = event.action.durationMs ?? 600,
    progress = (atMs - event.atMs) / duration;
  const wave = Math.sin(progress * Math.PI * 10) * (1 - progress) ** 2;
  return { x: wave * (event.action.amplitude ?? 3), rotation: wave * 0.09 };
}
export function changeMentionRanges(
  mentions: Mention[] | undefined,
  field: string,
  oldText: string,
  newText: string,
) {
  let start = 0;
  while (
    start < oldText.length &&
    start < newText.length &&
    oldText[start] === newText[start]
  )
    start++;
  let suffix = 0;
  while (
    suffix < oldText.length - start &&
    suffix < newText.length - start &&
    oldText[oldText.length - 1 - suffix] ===
      newText[newText.length - 1 - suffix]
  )
    suffix++;
  const oldEnd = oldText.length - suffix,
    shift = newText.length - oldText.length;
  return (mentions ?? []).flatMap((ref) => {
    if (ref.field !== field || ref.end <= start) return [ref];
    if (ref.start >= oldEnd)
      return [{ ...ref, start: ref.start + shift, end: ref.end + shift }];
    return [];
  });
}
export function mentionRuns(
  project: Project,
  message: Message,
  field: string,
  text: string,
) {
  const refs = (message.mentions ?? [])
    .filter((r) => r.field === field)
    .sort((a, b) => a.start - b.start);
  let cursor = 0;
  const runs: { text: string; mention: boolean }[] = [];
  for (const ref of refs) {
    if (ref.start < cursor || ref.end > text.length) continue;
    if (ref.start > cursor)
      runs.push({ text: text.slice(cursor, ref.start), mention: false });
    runs.push({
      text:
        ref.speakerId === "all"
          ? project.appearance.ui?.mentionAllText || "@全体成员"
          : "@" +
            (project.speakers.find((s) => s.id === ref.speakerId)?.name ??
              "未知角色"),
      mention: true,
    });
    cursor = ref.end;
  }
  if (cursor < text.length)
    runs.push({ text: text.slice(cursor), mention: false });
  return runs;
}

import { useRef } from "react";
import type { Mention, Message, Speaker } from "../core/model.js";
import { changeMentionRanges } from "../core/interaction.js";
export function MentionInput({
  message,
  field,
  speakers,
  multiline,
  change,
}: {
  message: Message;
  field: string;
  speakers: Speaker[];
  multiline: boolean;
  change: (text: string, refs: Mention[]) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null),
    text = String(message.data[field] ?? "");
  const edit = (value: string) =>
    change(value, changeMentionRanges(message.mentions, field, text, value));
  const insert = (speakerId: string) => {
    if (!speakerId) return;
    const name =
        speakerId === "all"
          ? "全体成员"
          : speakers.find((s) => s.id === speakerId)!.name,
      token = "@" + name;
    const start = ref.current?.selectionStart ?? text.length,
      end = ref.current?.selectionEnd ?? start;
    const next = text.slice(0, start) + token + " " + text.slice(end),
      refs = changeMentionRanges(message.mentions, field, text, next);
    change(next, [
      ...refs,
      { field, start, end: start + token.length, speakerId },
    ]);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(
        start + token.length + 1,
        start + token.length + 1,
      );
    });
  };
  return (
    <div className="mention-editor">
      {multiline ? (
        <textarea
          ref={(node) => {
            ref.current = node;
          }}
          rows={5}
          value={text}
          onChange={(e) => edit(e.target.value)}
        />
      ) : (
        <input
          ref={(node) => {
            ref.current = node;
          }}
          type="text"
          value={text}
          onChange={(e) => edit(e.target.value)}
        />
      )}
      <select
        aria-label="插入角色提及"
        value=""
        onChange={(e) => insert(e.target.value)}
      >
        <option value="">插入 @</option>
        <option value="all">全体成员</option>
        {speakers.map((s) => (
          <option value={s.id} key={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="mention-links">
        {(message.mentions ?? [])
          .filter((m) => m.field === field)
          .map((m, index) => (
            <button
              type="button"
              className="text-button"
              key={index}
              title="取消角色关联，保留文字"
              onClick={() =>
                change(
                  text,
                  (message.mentions ?? []).filter((x) => x !== m),
                )
              }
            >
              @
              {m.speakerId === "all"
                ? "全体成员"
                : speakers.find((s) => s.id === m.speakerId)?.name}{" "}
              ×
            </button>
          ))}
      </div>
    </div>
  );
}

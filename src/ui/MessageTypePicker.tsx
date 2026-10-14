import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import type { StylePlugin } from "../core/model.js";
import { Icon } from "./components.js";
export const messageTypeDragMime = "application/x-chat-message-kind";
export function MessageTypePicker({
  types,
  lastKind,
  add,
  dragging,
}: {
  types: StylePlugin[];
  lastKind: string;
  add: (kind: string) => void;
  dragging: (kind: string | null) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  const quick =
    types.find((p) => p.id === lastKind) ??
    types.find((p) => p.id === "text") ??
    types[0];
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLInputElement>("input")?.focus();
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  return (
    <div className="message-type-picker" ref={root}>
      <button
        className="button secondary add-quick"
        disabled={!quick}
        onClick={() => quick && add(quick.id)}
      >
        <Plus size={16} />
        <span>添加{quick?.name || "消息"}</span>
      </button>
      <button
        ref={toggle}
        className="button secondary add-type-toggle"
        title="选择消息类型"
        aria-label="选择消息类型"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen(!open);
        }}
      >
        <ChevronDown size={17} />
      </button>
      {open && (
        <div
          className="message-type-menu"
          role="menu"
          aria-label="消息类型"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              setOpen(false);
              toggle.current?.focus();
              return;
            }
            const buttons = [
                ...root.current!.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]',
                ),
              ],
              index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
            const step =
              e.key === "ArrowDown"
                ? 2
                : e.key === "ArrowUp"
                  ? -2
                  : e.key === "ArrowRight"
                    ? 1
                    : e.key === "ArrowLeft"
                      ? -1
                      : 0;
            if (step && buttons.length) {
              e.preventDefault();
              buttons[
                index < 0 ? 0 : (index + step + buttons.length) % buttons.length
              ]?.focus();
            }
          }}
        >
          <strong>选择消息类型</strong>
          <input
            type="search"
            aria-label="搜索消息类型"
            placeholder="搜索类型"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="message-type-options">
            {types
              .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
              .map((p) => (
                <button
                  role="menuitem"
                  key={p.id}
                  draggable
                  className={p.id === quick?.id ? "active" : ""}
                  title="可拖到消息列表或手机预览"
                  onClick={() => {
                    add(p.id);
                    setOpen(false);
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(messageTypeDragMime, p.id);
                    e.dataTransfer.effectAllowed = "copy";
                    dragging(p.id);
                  }}
                  onDragEnd={() => {
                    dragging(null);
                    setOpen(false);
                  }}
                >
                  <Icon name={p.icon} size={17} />
                  {p.name}
                </button>
              ))}
          </div>
          <small>也可拖到消息列表或手机预览</small>
        </div>
      )}
    </div>
  );
}

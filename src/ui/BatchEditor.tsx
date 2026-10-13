import { Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { Message, Project } from "../core/model.js";
export function BatchEditor({
  project,
  ids,
  patch,
  duplicate,
  remove,
  move,
}: {
  project: Project;
  ids: string[];
  patch(value: Partial<Message>): void;
  duplicate(): void;
  remove(): void;
  move(direction: -1 | 1): void;
}) {
  const messages = project.messages.filter((m) => ids.includes(m.id));
  const common = <K extends keyof Message>(key: K) =>
    messages.every((m) => m[key] === messages[0]?.[key])
      ? messages[0]?.[key]
      : undefined;
  return (
    <section className="batch-editor">
      <h2>{messages.length} 条消息</h2>
      <p className="modal-intro">一起调整发送者、等待时间和已读状态。</p>
      <label className="field">
        <span>发送者</span>
        <select
          value={common("speakerId") ?? ""}
          onChange={(e) => {
            if (e.target.value) patch({ speakerId: e.target.value });
          }}
        >
          <option value="">保留各自发送者</option>
          {project.speakers.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>出现前等待（秒）</span>
        <input
          type="number"
          min={0}
          max={600}
          step={0.1}
          value={
            common("waitMs") === undefined
              ? ""
              : Number(common("waitMs")) / 1000
          }
          placeholder="各自时间"
          onChange={(e) => {
            if (e.target.value)
              patch({ waitMs: Math.max(0, Number(e.target.value) * 1000) });
          }}
        />
      </label>
      <label className="field">
        <span>已读状态</span>
        <select
          value={
            common("read") === undefined ? "" : common("read") ? "yes" : "no"
          }
          onChange={(e) => {
            if (e.target.value) patch({ read: e.target.value === "yes" });
          }}
        >
          <option value="">保留各自状态</option>
          <option value="yes">已读</option>
          <option value="no">未读</option>
        </select>
      </label>
      <div className="message-order">
        <button className="button secondary" onClick={() => move(-1)}>
          <ChevronUp size={14} />
          上移
        </button>
        <button className="button secondary" onClick={() => move(1)}>
          <ChevronDown size={14} />
          下移
        </button>
      </div>
      <div className="message-order">
        <button className="button secondary" onClick={duplicate}>
          <Copy size={14} />
          复制所选
        </button>
        <button className="button secondary danger" onClick={remove}>
          <Trash2 size={14} />
          删除所选
        </button>
      </div>
    </section>
  );
}

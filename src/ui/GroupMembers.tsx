import type { Project } from "../core/model.js";
import { buildTimeline } from "../core/timeline.js";
import {
  runtimeEffects,
  initialMembers,
  membersAt,
} from "../core/interaction.js";
export function GroupMembers({
  project,
  atMs,
  change,
}: {
  project: Project;
  atMs: number;
  change: (ids: string[] | null) => void;
}) {
  const effects = runtimeEffects(project, buildTimeline(project).events),
    initial = initialMembers(project, effects),
    automatic = project.group?.initialMemberIds == null;
  return (
    <details className="initial-members">
      <summary>
        初始群成员 · 当前 {membersAt(project, effects, atMs).length} 人
      </summary>
      <label className="check-row">
        <input
          type="checkbox"
          checked={automatic}
          onChange={(e) => change(e.target.checked ? null : initial)}
        />
        根据入群消息自动识别
      </label>
      {project.speakers.map((s) => (
        <label className="check-row" key={s.id}>
          <input
            type="checkbox"
            checked={initial.includes(s.id)}
            onChange={(e) =>
              change(
                e.target.checked
                  ? [...initial, s.id]
                  : initial.filter((id) => id !== s.id),
              )
            }
          />
          {s.name}
        </label>
      ))}
    </details>
  );
}

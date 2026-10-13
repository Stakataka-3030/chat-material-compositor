import { projectSchema, type Project } from "../core/model.js";
export function restoreDraft(project: Project): {
  project: Project;
  restored: boolean;
} {
  try {
    const text = localStorage.getItem("liaomu-draft-" + project.id);
    if (!text) return { project, restored: false };
    const value = projectSchema.safeParse(JSON.parse(text));
    if (value.success && value.data.id === project.id)
      return {
        project: { ...value.data, revision: project.revision },
        restored: true,
      };
  } catch {}
  return { project, restored: false };
}
export function writeDraft(project: Project) {
  try {
    localStorage.setItem("liaomu-draft-" + project.id, JSON.stringify(project));
  } catch {}
}

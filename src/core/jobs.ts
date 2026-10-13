export const exportFormats = [
  "webm",
  "mov-prores",
  "mov-animation",
  "mov-png",
  "png-sequence",
  "long-png",
  "mp4",
  "gif",
] as const;
export type ExportFormat = (typeof exportFormats)[number];
export const formatLabels: Record<ExportFormat, string> = {
  webm: "透明 WebM",
  "mov-prores": "MOV · ProRes 4444",
  "mov-animation": "MOV · Animation",
  "mov-png": "MOV · PNG",
  "png-sequence": "PNG 序列",
  "long-png": "聊天长图",
  mp4: "MP4",
  gif: "GIF",
};
export interface ExportArtifact {
  name: string;
  format: ExportFormat;
  size: number;
  url: string;
}
export interface ExportJob {
  id: string;
  projectId: string;
  title: string;
  formats: ExportFormat[];
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number;
  stage: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  artifacts: ExportArtifact[];
  error?: string;
  width: number;
  fps: number;
}

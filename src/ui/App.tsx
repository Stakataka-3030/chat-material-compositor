import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MessageSquare,
  Image as ImageIcon,
  Mic,
  Smile,
  FileText,
  Clock,
  Link,
  ArrowLeftRight,
  Film,
  Layers,
  FolderOpen,
  Puzzle,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Plus,
  Upload,
  Download,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  Search,
  X,
  Check,
  CircleAlert,
  Info,
  Settings2,
  Users,
  ChevronUp,
  ChevronDown,
  Volume2,
  Phone,
  MoreHorizontal,
  Crop,
} from "lucide-react";
import {
  newProject,
  createMessage,
  uid,
  removeSpeaker,
  type Project,
  type Asset,
  type AssetKind,
  type StylePlugin,
  type Message,
  type FieldValue,
  projectSchema,
} from "../core/model.js";
import { PluginRegistry } from "../core/plugins.js";
import { buildTimeline, audioEvents } from "../core/timeline.js";
import { ChatRenderer } from "../core/renderer.js";
import { History } from "../core/history.js";
import {
  exportFormats,
  formatLabels,
  type ExportJob,
  type ExportFormat,
} from "../core/jobs.js";
import { request, post, setClientToken } from "./api.js";
import { CropDialog } from "./CropDialog.js";
import { BatchEditor } from "./BatchEditor.js";
import { parseBulk } from "../core/bulk.js";
import { notificationSamples } from "../core/sound.js";
import { Icon, Field, Modal, AssetSelect } from "./components.js";
import { restoreDraft, writeDraft } from "./drafts.js";
import { ImportGuide } from "./ImportGuide.js";
import { UpdateNotice } from "./UpdateNotice.js";
import { MaterialPacks } from "./MaterialPacks.js";
import { OnlineMaterials } from "./OnlineMaterials.js";
import { PhoneCustomizer } from "./PhoneCustomizer.js";
import { assetName, assetCategory } from "../core/asset-names.js";
import { TextCSSInput } from "./TextCSSInput.js";

type ProjectSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messages: number;
  revision: number;
};
interface Bootstrap {
  clientToken: string;
  assets: Asset[];
  plugins: StylePlugin[];
  projects: ProjectSummary[];
  jobs: ExportJob[];
}
const assetLabels: Record<AssetKind, string> = {
  shell: "手机皮肤",
  wallpaper: "聊天背景",
  avatar: "角色头像",
  sticker: "贴纸",
  image: "图片",
  sound: "音效",
  font: "字体",
  icon: "图标",
  "bar-background": "栏背景",
  mask: "屏幕",
};
const snapshotKey = (p: Project) =>
  JSON.stringify({ ...p, revision: 0, updatedAt: "" });
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const size = (n: number) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
export function App() {
  const [boot, setBoot] = useState(false),
    [project, setProject] = useState<Project | null>(null),
    [assets, setAssets] = useState<Asset[]>([]),
    [plugins, setPlugins] = useState<StylePlugin[]>([]),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [jobs, setJobs] = useState<ExportJob[]>([]);
  const [mode, setMode] = useState<
      "editor" | "assets" | "plugins" | "projects"
    >("editor"),
    [selected, setSelected] = useState<string | null>(null),
    [pane, setPane] = useState<"message" | "appearance" | "audio" | "speakers">(
      "message",
    );
  const [saveState, setSaveState] = useState("正在打开"),
    [toast, setToast] = useState<{
      message: string;
      tone: "success" | "error" | "info";
    } | null>(null),
    [playing, setPlaying] = useState(false),
    [atMs, setAtMs] = useState(0),
    [zoom, setZoom] = useState(1),
    [previewError, setPreviewError] = useState("");
  const [modal, setModal] = useState<
      "export" | "bulk" | "new" | "rename" | null
    >(null),
    [formats, setFormats] = useState<ExportFormat[]>(["webm"]),
    [search, setSearch] = useState(""),
    [assetKind, setAssetKind] = useState<AssetKind>("shell"),
    [bulkText, setBulkText] = useState(""),
    [nameDraft, setNameDraft] = useState(""),
    [drag, setDrag] = useState<string | null>(null),
    [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [lockAspect, setLockAspect] = useState(true),
    [poseDrag, setPoseDrag] = useState(false);
  const dragPose = useRef<{
    x: number;
    y: number;
    transform: Project["appearance"]["transform"];
    scale: number;
  } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0),
    [busy, setBusy] = useState(false);
  const [cropTarget, setCropTarget] = useState<Asset | null>(null),
    [deleteRole, setDeleteRole] = useState<string | null>(null),
    [replacementRole, setReplacementRole] = useState(""),
    [multi, setMulti] = useState<string[]>([]);
  const [assetPreview, setAssetPreview] = useState<Asset | null>(null);
  const history = useRef(new History<Project>()),
    current = useRef<Project | null>(null),
    saved = useRef(""),
    saving = useRef(false),
    lastEdit = useRef({ key: "", time: 0 }),
    playGeneration = useRef(0);
  const renderer = useRef<ChatRenderer | null>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    audioContext = useRef<AudioContext | null>(null),
    soundCache = useRef(new Map<string, AudioBuffer>()),
    soundNodes = useRef<AudioScheduledSourceNode[]>([]);
  const timeline = project
    ? buildTimeline(project)
    : { events: [], durationMs: 0, messagesEndMs: 0 };
  const selectedMessage =
    project?.messages.find((m) => m.id === selected) || null;
  const registry = new PluginRegistry([
    ...plugins.filter((p) => !p.builtin),
    ...(project?.plugins ?? []),
  ]);
  const projectRef = useCallback((p: Project | null) => {
    current.current = p;
    setProject(p);
    if (p) {
      try {
        localStorage.setItem("liaomu-last-project", p.id);
      } catch {}
    }
  }, []);
  const notify = useCallback(
    (message: string, tone: "success" | "error" | "info" = "success") => {
      setToast({ message, tone });
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.tone === "error" ? 6500 : 4200,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    void request<Bootstrap>("/api/bootstrap")
      .then(async (data) => {
        setClientToken(data.clientToken);
        setAssets(data.assets);
        setPlugins(data.plugins);
        setProjects(data.projects);
        setJobs(data.jobs);
        const last = localStorage.getItem("liaomu-last-project"),
          target =
            data.projects.find((p) => p.id === last) ?? data.projects[0]!;
        let p = await request<Project>(`/api/projects/${target.id}`);
        saved.current = snapshotKey(p);
        const recovery = restoreDraft(p);
        p = recovery.project;
        if (recovery.restored) notify("已恢复本机草稿");
        projectRef(p);
        setSelected(p.messages[0]?.id ?? null);
        setAtMs(buildTimeline(p).durationMs);
        setSaveState("已保存");
        setBoot(true);
      })
      .catch((e) => notify(e.message, "error"));
    const events = new EventSource("/api/events");
    events.onmessage = (e) => {
      const job = JSON.parse(e.data) as ExportJob;
      setJobs((old) =>
        [job, ...old.filter((j) => j.id !== job.id)].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      );
    };
    return () => events.close();
  }, [notify, projectRef]);
  const save = useCallback(
    async function saveLatest() {
      while (saving.current) await new Promise((r) => setTimeout(r, 25));
      if (!current.current || snapshotKey(current.current) === saved.current)
        return;
      saving.current = true;
      const p = structuredClone(current.current),
        key = snapshotKey(p);
      setSaveState("保存中");
      let succeeded = false;
      try {
        const result = await request<Project>(`/api/projects/${p.id}`, {
          method: "PUT",
          body: JSON.stringify({ project: p, expectedRevision: p.revision }),
        });
        if (current.current?.id === p.id) {
          const updated = {
            ...current.current,
            revision: result.revision,
            updatedAt: result.updatedAt,
          };
          current.current = updated;
          setProject(updated);
          saved.current = key;
          setSaveState(snapshotKey(updated) === key ? "已保存" : "待保存");
          succeeded = true;
          if (snapshotKey(updated) === key)
            localStorage.removeItem("liaomu-draft-" + p.id);
        }
      } catch (e) {
        setSaveState("保存失败");
        notify((e as Error).message, "error");
      } finally {
        saving.current = false;
      }
      if (
        succeeded &&
        current.current?.id === p.id &&
        snapshotKey(current.current) !== saved.current
      )
        await saveLatest();
    },
    [notify],
  );
  useEffect(() => {
    if (!project || !boot || snapshotKey(project) === saved.current) return;
    setSaveState("待保存");
    const timer = setTimeout(() => void save(), 700);
    return () => clearTimeout(timer);
  }, [project, boot, save]);
  const change = useCallback(
    (mutate: (p: Project) => void, key = "") => {
      const before = current.current;
      if (!before) return;
      playGeneration.current++;
      setPlaying(false);
      soundNodes.current.forEach((node) => {
        try {
          node.stop();
        } catch {}
      });
      soundNodes.current = [];
      const now = Date.now();
      if (
        !key ||
        lastEdit.current.key !== key ||
        now - lastEdit.current.time > 900
      )
        history.current.record(before);
      lastEdit.current = { key, time: now };
      const next = structuredClone(before);
      mutate(next);
      writeDraft(next);
      projectRef(next);
      setHistoryVersion((v) => v + 1);
    },
    [projectRef],
  );
  const updateMessage = (patch: Partial<Message>, key = "") => {
    if (!selected) return;
    change((p) => {
      const m = p.messages.find((m) => m.id === selected);
      if (m) Object.assign(m, patch);
    }, key);
  };
  const setAppearance = (patch: Partial<Project["appearance"]>) =>
    change((p) => {
      Object.assign(p.appearance, patch);
    }, "appearance");
  const stopAudio = useCallback(() => {
    soundNodes.current.forEach((n) => {
      try {
        n.stop();
      } catch {}
    });
    soundNodes.current = [];
  }, []);
  const stop = useCallback(() => {
    playGeneration.current++;
    setPlaying(false);
    stopAudio();
  }, [stopAudio]);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setPreviewError("");
    void new ChatRenderer(project, assets)
      .prepare()
      .then(async (r) => {
        await r.ensureFrame(Math.min(atMs, r.timeline.durationMs));
        if (cancelled) return;
        renderer.current = r;
        if (canvas.current)
          r.render(canvas.current, Math.min(atMs, r.timeline.durationMs), 720);
      })
      .catch((e) => {
        if (!cancelled) setPreviewError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [project, assets, mode]);
  useEffect(() => {
    let cancelled = false;
    const r = renderer.current;
    if (!playing && r)
      void r
        .ensureFrame(atMs)
        .then(() => {
          if (!cancelled && canvas.current && renderer.current === r)
            r.render(canvas.current, atMs, 720);
        })
        .catch((e) => setPreviewError(e.message));
    return () => {
      cancelled = true;
    };
  }, [atMs, playing]);
  useEffect(() => {
    if (!playing || !project) return;
    const start = performance.now(),
      offset = atMs,
      duration = buildTimeline(project).durationMs;
    let frame: number,
      lastUi = 0;
    const tick = () => {
      const t = offset + performance.now() - start;
      if (t >= duration) {
        setAtMs(duration);
        setPlaying(false);
        stopAudio();
        if (project.playback.loop) {
          const generation = playGeneration.current;
          requestAnimationFrame(() => {
            if (generation === playGeneration.current) void play(0);
          });
        }
        return;
      }
      if (canvas.current && renderer.current) {
        void renderer.current
          .ensureFrame(t)
          .catch((e) => setPreviewError(e.message));
        renderer.current.render(canvas.current, t, 720);
      }
      if (t - lastUi >= 80) {
        setAtMs(t);
        lastUi = t;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  async function play(from?: number) {
    if (!project) return;
    stopAudio();
    const generation = ++playGeneration.current,
      start = from ?? (atMs >= timeline.durationMs - 10 ? 0 : atMs);
    setAtMs(start);
    if (project.audio.enabled) {
      try {
        const ctx = audioContext.current ?? new AudioContext();
        audioContext.current = ctx;
        await ctx.resume();
        const events = audioEvents(project).filter((e) => e.atMs >= start);
        await Promise.all(
          [
            ...new Set(events.flatMap((e) => (e.soundId ? [e.soundId] : []))),
          ].map(async (id) => {
            if (!soundCache.current.has(id)) {
              const data = await fetch(`/api/assets/file/${id}`).then((r) =>
                r.arrayBuffer(),
              );
              soundCache.current.set(id, await ctx.decodeAudioData(data));
            }
          }),
        );
        if (generation !== playGeneration.current) return;
        const origin = ctx.currentTime;
        for (const event of events) {
          const gain = ctx.createGain();
          gain.gain.value = project.audio.volume;
          gain.connect(ctx.destination);
          if (event.soundId) {
            const node = ctx.createBufferSource();
            node.buffer = soundCache.current.get(event.soundId)!;
            node.connect(gain);
            node.start(origin + (event.atMs - start) / 1000);
            soundNodes.current.push(node);
            node.onended = () => {
              gain.disconnect();
              node.disconnect();
            };
          } else {
            const node = ctx.createBufferSource(),
              buffer = ctx.createBuffer(
                1,
                Math.round(ctx.sampleRate * 0.13),
                ctx.sampleRate,
              );
            buffer.copyToChannel(
              notificationSamples(event.messageId, ctx.sampleRate),
              0,
            );
            node.buffer = buffer;
            node.connect(gain);
            node.start(origin + (event.atMs - start) / 1000);
            soundNodes.current.push(node);
            node.onended = () => {
              gain.disconnect();
              node.disconnect();
            };
          }
        }
      } catch (e) {
        notify(`音效准备未完成：${(e as Error).message}`, "error");
      }
    }
    if (generation !== playGeneration.current) return;
    setPlaying(true);
  }
  const selectMessage = (id: string, extend = false, toggle = false) => {
    stop();
    if (extend && selected) {
      const a = project!.messages.findIndex((m) => m.id === selected),
        b = project!.messages.findIndex((m) => m.id === id);
      setMulti(
        project!.messages
          .slice(Math.min(a, b), Math.max(a, b) + 1)
          .map((m) => m.id),
      );
    } else if (toggle)
      setMulti((old) =>
        [...new Set(old.length ? old : selected ? [selected] : [])].includes(id)
          ? old.filter((x) => x !== id)
          : [...new Set([...old, ...(selected ? [selected] : []), id])],
      );
    else setMulti([]);
    setSelected(id);
    setPane("message");
    const index = project?.messages.findIndex((m) => m.id === id) ?? -1;
    if (index >= 0)
      setAtMs(
        (timeline.events[index]?.atMs ?? 0) + (project?.playback.popMs ?? 0),
      );
  };
  const addMessage = (kind = "text") => {
    if (!project) return;
    if (plugins.find((p) => p.id === kind)?.enabled === false) {
      notify("请先在样式页启用该消息类型", "info");
      return;
    }
    const plugin = registry.get(kind),
      m = createMessage(
        selectedMessage?.speakerId ??
          project.speakers.find((s) => s.id !== project.meId)!.id,
        plugin,
      );
    change((p) => {
      const index = selected
        ? p.messages.findIndex((m) => m.id === selected) + 1
        : p.messages.length;
      p.messages.splice(index, 0, m);
      const custom = plugins.find((x) => x.id === kind && !x.builtin);
      if (custom && !p.plugins.some((x) => x.id === kind))
        p.plugins.push(custom);
    });
    setSelected(m.id);
    setPane("message");
    setAtMs(buildTimeline(current.current!).durationMs);
    setMode("editor");
    return m.id;
  };
  const deleteMessage = () => {
    if (!selected || !project) return;
    const ids = multi.length ? multi : [selected],
      index = project.messages.findIndex((m) => m.id === selected);
    change((p) => {
      p.messages = p.messages.filter((m) => !ids.includes(m.id));
    });
    setMulti([]);
    setSelected(
      current.current!.messages[
        Math.min(index, current.current!.messages.length - 1)
      ]?.id ?? null,
    );
  };
  const duplicateMessage = () => {
    if (!selectedMessage || !project) return;
    const ids = multi.length ? multi : [selectedMessage.id],
      copies = project.messages
        .filter((m) => ids.includes(m.id))
        .map((m) => ({ ...structuredClone(m), id: uid() }));
    change((p) => {
      const after =
        Math.max(...p.messages.map((m, i) => (ids.includes(m.id) ? i : -1))) +
        1;
      p.messages.splice(after, 0, ...copies);
    });
    setSelected(copies[0]!.id);
    setMulti(copies.length > 1 ? copies.map((m) => m.id) : []);
  };
  const moveSelection = (direction: -1 | 1) =>
    change((p) => {
      const chosen = new Set(multi.length ? multi : selected ? [selected] : []);
      if (direction < 0) {
        for (let i = 1; i < p.messages.length; i++)
          if (
            chosen.has(p.messages[i]!.id) &&
            !chosen.has(p.messages[i - 1]!.id)
          )
            [p.messages[i - 1], p.messages[i]] = [
              p.messages[i]!,
              p.messages[i - 1]!,
            ];
      } else {
        for (let i = p.messages.length - 2; i >= 0; i--)
          if (
            chosen.has(p.messages[i]!.id) &&
            !chosen.has(p.messages[i + 1]!.id)
          )
            [p.messages[i], p.messages[i + 1]] = [
              p.messages[i + 1]!,
              p.messages[i]!,
            ];
      }
    });
  const moveMessage = (id: string, target: number) =>
    change((p) => {
      const index = p.messages.findIndex((m) => m.id === id);
      if (index < 0 || target < 0 || target >= p.messages.length) return;
      const [m] = p.messages.splice(index, 1);
      p.messages.splice(target, 0, m!);
    });
  const dropMessages = (id: string, targetId: string) =>
    change((p) => {
      const ids = multi.includes(id) ? new Set(multi) : new Set([id]);
      if (ids.has(targetId)) return;
      const from = p.messages.findIndex((m) => m.id === id),
        target = p.messages.findIndex((m) => m.id === targetId),
        moving = p.messages.filter((m) => ids.has(m.id)),
        remaining = p.messages.filter((m) => !ids.has(m.id));
      const at =
        remaining.findIndex((m) => m.id === targetId) + (from < target ? 1 : 0);
      remaining.splice(at, 0, ...moving);
      p.messages = remaining;
    });
  const undo = () => {
    if (!current.current) return;
    const p = history.current.undo(current.current);
    if (p) {
      p.revision = current.current.revision;
      stop();
      writeDraft(p);
      projectRef(p);
      setHistoryVersion((v) => v + 1);
    }
  };
  const redo = () => {
    if (!current.current) return;
    const p = history.current.redo(current.current);
    if (p) {
      p.revision = current.current.revision;
      stop();
      writeDraft(p);
      projectRef(p);
      setHistoryVersion((v) => v + 1);
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      const editable = (e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable]",
      );
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (editable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateMessage();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setMulti(project?.messages.map((m) => m.id) ?? []);
      } else if (e.key === "Escape") setMulti([]);
      else if (e.key === "Delete") {
        e.preventDefault();
        deleteMessage();
      } else if (e.code === "Space") {
        e.preventDefault();
        playing ? stop() : void play();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  async function openProject(id: string) {
    stop();
    await save();
    let p = await request<Project>(`/api/projects/${id}`);
    history.current.clear();
    saved.current = snapshotKey(p);
    const recovery = restoreDraft(p);
    p = recovery.project;
    if (recovery.restored) notify("已恢复本机草稿");
    projectRef(p);
    setMulti([]);
    setSelected(p.messages[0]?.id ?? null);
    setAtMs(buildTimeline(p).durationMs);
    setSaveState("已保存");
    setMode("editor");
    setHistoryVersion((v) => v + 1);
  }
  async function create() {
    setBusy(true);
    try {
      const p = await post<Project>("/api/projects", {
        title: nameDraft.trim() || "未命名工程",
      });
      setProjects(await request("/api/projects"));
      await openProject(p.id);
      setModal(null);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function importAsset(file: File, kind: AssetKind) {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    body.append("name", file.name);
    const asset = await request<Asset>("/api/assets", { method: "POST", body });
    setAssets(await request("/api/assets"));
    return asset;
  }
  async function uploadToMessage(file: File, key: string, kind: AssetKind) {
    const target = selected;
    setBusy(true);
    try {
      const asset = await importAsset(file, kind);
      change((p) => {
        const m = p.messages.find((m) => m.id === target);
        if (m) {
          m.data[key] = asset.id;
          if (key === "audioAsset" && asset.durationMs)
            m.data.seconds = Number((asset.durationMs / 1000).toFixed(1));
        }
      });
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function exportProject() {
    if (!project) return;
    setBusy(true);
    try {
      const job = await post<ExportJob>("/api/jobs", { project, formats });
      setJobs((old) => [job, ...old]);
      setModal(null);
      notify("已加入导出队列");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  const applyAsset = (asset: Asset) => {
    if (!project) return;
    if (asset.kind === "shell")
      setAppearance({ shellId: asset.id, showShell: true });
    else if (asset.kind === "wallpaper")
      setAppearance({ wallpaperId: asset.id });
    else if (asset.kind === "avatar")
      change((p) => {
        const speaker = p.speakers.find(
          (s) =>
            s.id === (selectedSpeaker || selectedMessage?.speakerId || p.meId),
        );
        if (speaker) speaker.avatarId = asset.id;
      });
    else if (asset.kind === "font")
      setAppearance({
        ui: { ...project.appearance.ui, fontAssetId: asset.id },
      });
    else if (asset.kind === "sound") {
      if (selectedMessage) updateMessage({ soundId: asset.id });
      else
        change((p) => {
          p.audio.receiveSoundId = asset.id;
        });
    } else if (asset.kind === "image" || asset.kind === "sticker") {
      const id = addMessage(asset.kind);
      if (id)
        change((p) => {
          const m = p.messages.find((x) => x.id === id);
          if (m) m.data.imageAsset = asset.id;
        });
    }
    setMode("editor");
    notify("已应用素材");
  };
  const bulkAdd = () => {
    if (!project) return;
    let parsed: Message[];
    try {
      parsed = parseBulk(bulkText, project, registry.get("text"));
    } catch (e) {
      notify((e as Error).message, "error");
      return;
    }
    change((p) => {
      p.messages.push(...parsed);
    });
    setSelected(parsed[0]?.id ?? selected);
    setModal(null);
    setBulkText("");
    setAtMs(buildTimeline(current.current!).durationMs);
    notify(`已添加 ${parsed.length} 条消息`);
  };
  const customPlugins = [
    ...plugins.filter((p) => p.enabled),
    ...(project?.plugins.filter((p) => !plugins.some((g) => g.id === p.id)) ??
      []),
  ];
  if (!boot || !project)
    return (
      <div className="loading">
        <div className="brand-mark">
          <MessageSquare size={22} />
        </div>
        <p>{toast?.message || "正在打开工作台…"}</p>
      </div>
    );
  return (
    <div className="app-shell" data-history-version={historyVersion}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <MessageSquare size={22} />
          </div>
          <strong>聊天素材合成器</strong>
        </div>
        <div className="project-name">
          <button
            onClick={() => {
              setNameDraft(project.title);
              setModal("rename");
            }}
          >
            {project.title}
            <ChevronDown size={14} />
          </button>
          <button
            className={
              "save-state " + (saveState === "保存失败" ? "error" : "")
            }
            onClick={() => void save()}
          >
            <span className="status-dot" />
            {saveState}
          </button>
        </div>
        <div className="top-actions">
          <button
            className="icon-btn"
            title="撤销 Ctrl+Z"
            disabled={!history.current.canUndo}
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-btn"
            title="重做 Ctrl+Shift+Z"
            disabled={!history.current.canRedo}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
          <button
            className="button secondary"
            onClick={() => {
              void save().then(() => {
                window.location.href = `/api/projects/${project.id}/package`;
              });
            }}
          >
            <Upload size={15} />
            保存工程包
          </button>
          <button className="button primary" onClick={() => setModal("export")}>
            <Film size={16} />
            导出
          </button>
        </div>
      </header>
      <div className="body-layout">
        <nav className="rail" aria-label="工作区">
          <button
            className={mode === "editor" ? "active" : ""}
            onClick={() => setMode("editor")}
          >
            <MessageSquare size={21} />
            <span>编辑</span>
          </button>
          <button
            className={mode === "assets" ? "active" : ""}
            onClick={() => setMode("assets")}
          >
            <Layers size={21} />
            <span>素材</span>
          </button>
          <button
            className={mode === "plugins" ? "active" : ""}
            onClick={() => setMode("plugins")}
          >
            <Puzzle size={21} />
            <span>样式</span>
          </button>
          <button
            className={mode === "projects" ? "active" : ""}
            onClick={() => {
              setMode("projects");
              void request<ProjectSummary[]>("/api/projects").then(setProjects);
            }}
          >
            <FolderOpen size={21} />
            <span>工程</span>
          </button>
          <div className="rail-bottom">
            <UpdateNotice />
            <span className="local-status">
              <span className="local-dot" />
              本机
            </span>
          </div>
        </nav>
        {mode === "editor" ? (
          <div className="editor-layout">
            <aside className="message-panel">
              <div className="panel-heading">
                <div>
                  <h2>消息编排</h2>
                  <span>
                    {project.messages.length} 条 ·{" "}
                    {seconds(timeline.durationMs)}
                  </span>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => setModal("bulk")}
                  title="批量添加"
                >
                  <FileText size={18} />
                </button>
              </div>
              <div className="message-list">
                {project.messages.map((message, index) => {
                  const plugin = registry.get(message.kind),
                    speaker = project.speakers.find(
                      (s) => s.id === message.speakerId,
                    )!;
                  const summary =
                    Object.values(message.data).find(
                      (v) =>
                        typeof v === "string" &&
                        !/^(image|avatar|sticker|sound)-/.test(v),
                    ) || plugin.name;
                  return (
                    <button
                      draggable
                      key={message.id}
                      className={
                        "message-item " +
                        (selected === message.id || multi.includes(message.id)
                          ? "selected"
                          : "")
                      }
                      onClick={(e) =>
                        selectMessage(
                          message.id,
                          e.shiftKey,
                          e.ctrlKey || e.metaKey,
                        )
                      }
                      onDragStart={() => setDrag(message.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (drag) dropMessages(drag, message.id);
                        setDrag(null);
                      }}
                    >
                      <span className="message-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={"message-type " + message.kind}>
                        <Icon name={plugin.icon} size={15} />
                      </span>
                      <span className="message-item-copy">
                        <span className="message-item-name">
                          {message.kind === "separator"
                            ? "时间分隔"
                            : speaker.name}
                          <small>{seconds(message.waitMs)}</small>
                        </span>
                        <span className="message-summary">
                          {String(summary)}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!project.messages.length && (
                  <div className="empty">
                    <MessageSquare size={30} />
                    <p>从第一条消息开始</p>
                  </div>
                )}
              </div>
              <div className="add-message">
                <button
                  className="button secondary"
                  onClick={() => addMessage()}
                >
                  <Plus size={16} />
                  添加消息
                </button>
                <select
                  aria-label="添加其他消息"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addMessage(e.target.value);
                  }}
                >
                  <option value="">其他类型</option>
                  {customPlugins.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </aside>
            <main className="preview-panel">
              <div className="preview-toolbar">
                <span>
                  <Phone size={16} />
                  手机预览
                </span>
                <div>
                  <button
                    className="icon-btn"
                    title="手机外观"
                    onClick={() => setPane("appearance")}
                  >
                    <Settings2 size={17} />
                  </button>
                  <select
                    aria-label="预览缩放"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  >
                    <option value={0.8}>80%</option>
                    <option value={1}>适合窗口</option>
                    <option value={1.2}>120%</option>
                    <option value={1.5}>150%</option>
                  </select>
                </div>
              </div>
              <div className="preview-stage">
                <div
                  className="preview-phone"
                  style={{ transform: `scale(${zoom})` }}
                >
                  <canvas
                    ref={canvas}
                    aria-label="手机聊天画面"
                    onPointerDown={(e) => {
                      if (!poseDrag || !renderer.current) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const box = e.currentTarget.getBoundingClientRect();
                      dragPose.current = {
                        x: e.clientX,
                        y: e.clientY,
                        transform: { ...project.appearance.transform },
                        scale:
                          renderer.current.dimensions(720).baseW / box.width,
                      };
                    }}
                    onPointerMove={(e) => {
                      const start = dragPose.current;
                      if (!start) return;
                      setAppearance({
                        transform: {
                          ...start.transform,
                          x: Math.max(
                            -2000,
                            Math.min(
                              2000,
                              start.transform.x +
                                (e.clientX - start.x) * start.scale,
                            ),
                          ),
                          y: Math.max(
                            -2000,
                            Math.min(
                              2000,
                              start.transform.y +
                                (e.clientY - start.y) * start.scale,
                            ),
                          ),
                        },
                      });
                    }}
                    onPointerUp={() => {
                      dragPose.current = null;
                    }}
                    onClick={(e) => {
                      if (poseDrag) return;
                      const box = e.currentTarget.getBoundingClientRect(),
                        id = renderer.current?.hitTest(
                          ((e.clientX - box.left) / box.width) *
                            e.currentTarget.width,
                          ((e.clientY - box.top) / box.height) *
                            e.currentTarget.height,
                          e.currentTarget.width,
                        );
                      if (id) selectMessage(id);
                    }}
                  />
                  {previewError && (
                    <div className="preview-error" role="alert">
                      {previewError}
                    </div>
                  )}
                </div>
              </div>
              <div className="preview-footnote">
                <span>
                  {project.output.background === "transparent"
                    ? "透明背景"
                    : "彩色背景"}
                </span>
                <span>
                  {project.output.width}px · {project.output.fps} fps
                </span>
              </div>
              <section className="timeline">
                <div className="playback-bar">
                  <div>
                    <button
                      className="icon-btn"
                      title="上一条消息"
                      onClick={() => {
                        stop();
                        const event = [...timeline.events]
                          .reverse()
                          .find((e) => e.atMs < atMs - 10);
                        setAtMs(event?.atMs ?? 0);
                      }}
                    >
                      <SkipBack size={17} />
                    </button>
                    <button
                      className="play-button"
                      aria-label={playing ? "暂停" : "播放"}
                      onClick={() => (playing ? stop() : void play())}
                    >
                      {playing ? (
                        <Pause size={17} fill="currentColor" />
                      ) : (
                        <Play size={17} fill="currentColor" />
                      )}
                    </button>
                    <button
                      className="icon-btn"
                      title="下一条消息"
                      onClick={() => {
                        stop();
                        const event = timeline.events.find(
                          (e) => e.atMs > atMs + 10,
                        );
                        setAtMs(event?.atMs ?? timeline.durationMs);
                      }}
                    >
                      <SkipForward size={17} />
                    </button>
                  </div>
                  <output>
                    {seconds(atMs)}
                    <span> / {seconds(timeline.durationMs)}</span>
                  </output>
                  <Volume2
                    size={15}
                    className={project.audio.enabled ? "" : "muted"}
                  />
                </div>
                <input
                  className="scrubber"
                  aria-label="播放时间"
                  type="range"
                  min={0}
                  max={timeline.durationMs}
                  step={20}
                  value={atMs}
                  onChange={(e) => {
                    stop();
                    setAtMs(Number(e.target.value));
                  }}
                />
                <div className="timeline-clips">
                  {timeline.events.map((event, i) => (
                    <button
                      key={event.messageId}
                      className={selected === event.messageId ? "selected" : ""}
                      style={{
                        minWidth: Math.max(
                          52,
                          project.messages[i]!.waitMs / 20,
                        ),
                      }}
                      onClick={() => selectMessage(event.messageId)}
                    >
                      <Icon
                        name={registry.get(project.messages[i]!.kind).icon}
                        size={13}
                      />
                      <span>{i + 1}</span>
                    </button>
                  ))}
                </div>
              </section>
            </main>
            <aside className="inspector">
              <div className="inspector-tabs">
                <button
                  className={pane === "message" ? "active" : ""}
                  onClick={() => setPane("message")}
                  title="消息"
                >
                  <MessageSquare size={17} />
                </button>
                <button
                  className={pane === "speakers" ? "active" : ""}
                  onClick={() => setPane("speakers")}
                  title="角色"
                >
                  <Users size={17} />
                </button>
                <button
                  className={pane === "appearance" ? "active" : ""}
                  onClick={() => setPane("appearance")}
                  title="外观"
                >
                  <Phone size={17} />
                </button>
                <button
                  className={pane === "audio" ? "active" : ""}
                  onClick={() => setPane("audio")}
                  title="音效"
                >
                  <Volume2 size={17} />
                </button>
              </div>
              <div className="inspector-body">
                {pane === "message" &&
                  (multi.length > 1 ? (
                    <BatchEditor
                      project={project}
                      ids={multi}
                      patch={(patch) =>
                        change((p) => {
                          p.messages.forEach((m) => {
                            if (multi.includes(m.id)) Object.assign(m, patch);
                          });
                        })
                      }
                      duplicate={duplicateMessage}
                      remove={deleteMessage}
                      move={moveSelection}
                    />
                  ) : selectedMessage ? (
                    <>
                      <div className="section-head">
                        <h2>
                          {multi.length > 1
                            ? `已选 ${multi.length} 条消息`
                            : "消息内容"}
                        </h2>
                        <div>
                          <button
                            className="icon-btn"
                            title="复制消息"
                            onClick={duplicateMessage}
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            className="icon-btn danger"
                            title="删除消息"
                            onClick={deleteMessage}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <Field label="消息类型">
                        <select
                          value={selectedMessage.kind}
                          onChange={(e) => {
                            const plugin = registry.get(e.target.value);
                            change((p) => {
                              const m = p.messages.find(
                                (m) => m.id === selected,
                              )!;
                              m.kind = plugin.id;
                              m.data = registry.defaults(plugin.id);
                              const extra = plugins.find(
                                (x) => x.id === plugin.id && !x.builtin,
                              );
                              if (
                                extra &&
                                !p.plugins.some((x) => x.id === extra.id)
                              )
                                p.plugins.push(extra);
                            });
                          }}
                        >
                          {registry.list().map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {selectedMessage.kind !== "separator" && (
                        <Field label="发送者">
                          <select
                            value={selectedMessage.speakerId}
                            onChange={(e) =>
                              updateMessage({ speakerId: e.target.value })
                            }
                          >
                            {project.speakers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                                {s.id === project.meId ? "（我方）" : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      {registry
                        .get(selectedMessage.kind)
                        .fields.map((field) => (
                          <Field key={field.key} label={field.label}>
                            {field.key === "css" ? (
                              <TextCSSInput
                                value={String(
                                  selectedMessage.data[field.key] ?? "",
                                )}
                                change={(value) =>
                                  updateMessage({
                                    data: {
                                      ...selectedMessage.data,
                                      [field.key]: value,
                                    },
                                  })
                                }
                              />
                            ) : field.type === "asset" ? (
                              <div className="asset-field">
                                <AssetSelect
                                  assets={assets}
                                  kind={
                                    field.assetKind === "sticker"
                                      ? ["sticker", "image"]
                                      : field.assetKind || "image"
                                  }
                                  value={
                                    selectedMessage.data[field.key] as
                                      | string
                                      | null
                                  }
                                  onChange={(id) => {
                                    const duration = assets.find(
                                      (a) => a.id === id,
                                    )?.durationMs;
                                    updateMessage({
                                      data: {
                                        ...selectedMessage.data,
                                        [field.key]: id,
                                        ...(field.key === "audioAsset" &&
                                        duration
                                          ? {
                                              seconds: Number(
                                                (duration / 1000).toFixed(1),
                                              ),
                                            }
                                          : {}),
                                      },
                                    });
                                  }}
                                  empty="选择素材"
                                />
                                <label className="upload-mini">
                                  <Download size={15} />
                                  <input
                                    type="file"
                                    accept={
                                      field.assetKind === "sound"
                                        ? "audio/*"
                                        : "image/*"
                                    }
                                    onChange={(e) => {
                                      if (e.target.files?.[0])
                                        void uploadToMessage(
                                          e.target.files[0],
                                          field.key,
                                          field.assetKind || "image",
                                        );
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            ) : field.type === "multiline" ? (
                              <textarea
                                rows={5}
                                value={String(
                                  selectedMessage.data[field.key] ?? "",
                                )}
                                onChange={(e) =>
                                  updateMessage(
                                    {
                                      data: {
                                        ...selectedMessage.data,
                                        [field.key]: e.target.value,
                                      },
                                    },
                                    selectedMessage.id + field.key,
                                  )
                                }
                                placeholder="写下这条消息…"
                              />
                            ) : field.type === "select" ? (
                              <select
                                value={String(
                                  selectedMessage.data[field.key] ?? "",
                                )}
                                onChange={(e) =>
                                  updateMessage({
                                    data: {
                                      ...selectedMessage.data,
                                      [field.key]: e.target.value,
                                    },
                                  })
                                }
                              >
                                {field.options?.map((o) => (
                                  <option key={o}>{o}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={
                                  field.type === "number"
                                    ? "number"
                                    : field.type === "color"
                                      ? "color"
                                      : "text"
                                }
                                value={String(
                                  selectedMessage.data[field.key] ?? "",
                                )}
                                onChange={(e) =>
                                  updateMessage(
                                    {
                                      data: {
                                        ...selectedMessage.data,
                                        [field.key]:
                                          field.type === "number"
                                            ? Number(e.target.value)
                                            : e.target.value,
                                      },
                                    },
                                    selectedMessage.id + field.key,
                                  )
                                }
                              />
                            )}
                          </Field>
                        ))}
                      <div className="field-pair">
                        <Field label="出现前等待（秒）">
                          <input
                            type="number"
                            min={0}
                            max={600}
                            step={0.1}
                            value={selectedMessage.waitMs / 1000}
                            onChange={(e) =>
                              updateMessage(
                                {
                                  waitMs: Math.max(
                                    0,
                                    Number(e.target.value) * 1000,
                                  ),
                                },
                                "wait" + selectedMessage.id,
                              )
                            }
                          />
                        </Field>
                        <Field label="输入动画（秒）">
                          <input
                            type="number"
                            min={0}
                            max={60}
                            step={0.1}
                            value={selectedMessage.typingMs / 1000}
                            onChange={(e) =>
                              updateMessage(
                                {
                                  typingMs: Math.max(
                                    0,
                                    Number(e.target.value) * 1000,
                                  ),
                                },
                                "typing" + selectedMessage.id,
                              )
                            }
                          />
                        </Field>
                      </div>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={selectedMessage.read}
                          onChange={(e) =>
                            updateMessage({ read: e.target.checked })
                          }
                        />
                        已读
                      </label>
                      <Field label="这条消息的音效">
                        <AssetSelect
                          assets={assets}
                          kind="sound"
                          value={selectedMessage.soundId}
                          onChange={(id) => updateMessage({ soundId: id })}
                          empty="跟随角色设置"
                        />
                      </Field>
                      <div className="message-order">
                        <button
                          className="button secondary"
                          onClick={() =>
                            moveMessage(
                              selectedMessage.id,
                              project.messages.indexOf(selectedMessage) - 1,
                            )
                          }
                        >
                          <ChevronUp size={15} />
                          上移
                        </button>
                        <button
                          className="button secondary"
                          onClick={() =>
                            moveMessage(
                              selectedMessage.id,
                              project.messages.indexOf(selectedMessage) + 1,
                            )
                          }
                        >
                          <ChevronDown size={15} />
                          下移
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <MessageSquare size={30} />
                      <p>选择一条消息开始编辑</p>
                      <button
                        className="button secondary"
                        onClick={() => addMessage()}
                      >
                        添加消息
                      </button>
                    </div>
                  ))}
                {pane === "appearance" && (
                  <>
                    <h2>界面外观</h2>
                    <PhoneCustomizer
                      appearance={project.appearance}
                      assets={assets}
                      change={setAppearance}
                      refresh={async () =>
                        setAssets(await request<Asset[]>("/api/assets"))
                      }
                      notify={notify}
                    />
                    <Field label="聊天方式">
                      <select
                        value={project.appearance.mode}
                        onChange={(e) =>
                          setAppearance({
                            mode: e.target.value as "single" | "group",
                          })
                        }
                      >
                        <option value="single">单聊</option>
                        <option value="group">群聊</option>
                      </select>
                    </Field>
                    <Field label="会话名称">
                      <input
                        value={project.appearance.title}
                        onChange={(e) =>
                          setAppearance({ title: e.target.value })
                        }
                      />
                    </Field>
                    {project.appearance.mode === "group" && (
                      <Field label="显示人数">
                        <input
                          type="number"
                          min={2}
                          placeholder="按角色数量"
                          value={project.appearance.groupCount ?? ""}
                          onChange={(e) =>
                            setAppearance({
                              groupCount: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        />
                      </Field>
                    )}
                    <details>
                      <summary>位置与变换</summary>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={lockAspect}
                          onChange={(e) => setLockAspect(e.target.checked)}
                        />
                        锁定缩放比例
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={poseDrag}
                          onChange={(e) => setPoseDrag(e.target.checked)}
                        />
                        在预览中拖动手机
                      </label>
                      {(
                        ["scaleX", "scaleY", "rotation", "x", "y"] as const
                      ).map((key) => (
                        <Field
                          key={key}
                          label={
                            {
                              scaleX: "横向缩放",
                              scaleY: "纵向缩放",
                              rotation: "旋转角度",
                              x: "水平位置",
                              y: "垂直位置",
                            }[key]
                          }
                        >
                          <input
                            type="number"
                            step={key.startsWith("scale") ? 0.05 : 1}
                            value={project.appearance.transform[key]}
                            onChange={(e) =>
                              setAppearance({
                                transform: {
                                  ...project.appearance.transform,
                                  ...(lockAspect && key.startsWith("scale")
                                    ? {
                                        scaleX: Math.max(
                                          0.2,
                                          Math.min(3, Number(e.target.value)),
                                        ),
                                        scaleY: Math.max(
                                          0.2,
                                          Math.min(3, Number(e.target.value)),
                                        ),
                                      }
                                    : {}),
                                  [key]: key.startsWith("scale")
                                    ? Math.max(
                                        0.2,
                                        Math.min(3, Number(e.target.value)),
                                      )
                                    : key === "rotation"
                                      ? Math.max(
                                          -180,
                                          Math.min(180, Number(e.target.value)),
                                        )
                                      : Math.max(
                                          -2000,
                                          Math.min(
                                            2000,
                                            Number(e.target.value),
                                          ),
                                        ),
                                },
                              })
                            }
                          />
                        </Field>
                      ))}
                      <button
                        className="button secondary"
                        onClick={() =>
                          setAppearance({
                            transform: {
                              x: 0,
                              y: 0,
                              scaleX: 1,
                              scaleY: 1,
                              rotation: 0,
                            },
                          })
                        }
                      >
                        重置变换
                      </button>
                    </details>
                  </>
                )}
                {pane === "audio" && (
                  <>
                    <h2>声音与节奏</h2>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={project.audio.enabled}
                        onChange={(e) =>
                          change((p) => {
                            p.audio.enabled = e.target.checked;
                          })
                        }
                      />
                      播放消息音效
                    </label>
                    <Field label="音量">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={project.audio.volume}
                        onChange={(e) =>
                          change((p) => {
                            p.audio.volume = Number(e.target.value);
                          }, "volume")
                        }
                      />
                    </Field>
                    <Field label="发送音效">
                      <AssetSelect
                        assets={assets}
                        kind="sound"
                        value={project.audio.sendSoundId}
                        onChange={(id) =>
                          change((p) => {
                            p.audio.sendSoundId = id;
                          })
                        }
                        empty="轻提示音"
                      />
                    </Field>
                    <Field label="接收音效">
                      <AssetSelect
                        assets={assets}
                        kind="sound"
                        value={project.audio.receiveSoundId}
                        onChange={(id) =>
                          change((p) => {
                            p.audio.receiveSoundId = id;
                          })
                        }
                        empty="轻提示音"
                      />
                    </Field>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={project.audio.playSend}
                        onChange={(e) =>
                          change((p) => {
                            p.audio.playSend = e.target.checked;
                          })
                        }
                      />
                      播放我方发送音效
                    </label>
                    <div className="rule" />
                    <Field label="开场等待（秒）">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={project.playback.leadMs / 1000}
                        onChange={(e) =>
                          change((p) => {
                            p.playback.leadMs = Number(e.target.value) * 1000;
                          })
                        }
                      />
                    </Field>
                    <Field label="结尾停留（秒）">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={project.playback.tailMs / 1000}
                        onChange={(e) =>
                          change((p) => {
                            p.playback.tailMs = Number(e.target.value) * 1000;
                          })
                        }
                      />
                    </Field>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={project.playback.loop}
                        onChange={(e) =>
                          change((p) => {
                            p.playback.loop = e.target.checked;
                          })
                        }
                      />
                      循环播放
                    </label>
                    <Field label="结尾淡出（秒）">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={project.playback.fadeMs / 1000}
                        onChange={(e) =>
                          change((p) => {
                            p.playback.fadeMs = Number(e.target.value) * 1000;
                          })
                        }
                      />
                    </Field>
                  </>
                )}
                {pane === "speakers" && (
                  <>
                    <div className="section-head">
                      <h2>角色</h2>
                      <button
                        className="icon-btn"
                        title="添加角色"
                        onClick={() => {
                          const id = uid();
                          change((p) => {
                            p.speakers.push({
                              id,
                              name: "新角色",
                              avatarId: null,
                              soundId: null,
                              color: "#8dafa6",
                            });
                            p.appearance.mode = "group";
                            p.appearance.showNames = true;
                          });
                          setSelectedSpeaker(id);
                        }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {project.speakers.map((speaker) => (
                      <section
                        className="speaker-card"
                        key={speaker.id}
                        onClick={() => setSelectedSpeaker(speaker.id)}
                      >
                        <div className="speaker-card-heading">
                          <div
                            className="small-avatar"
                            style={{ background: speaker.color }}
                          >
                            {speaker.avatarId ? (
                              <img
                                src={`/api/assets/file/${speaker.avatarId}?size=128`}
                              />
                            ) : (
                              speaker.name.slice(0, 1)
                            )}
                          </div>
                          <strong>{speaker.name}</strong>
                          {speaker.id === project.meId && (
                            <span className="tag">我方</span>
                          )}
                          {speaker.id !== project.meId &&
                            project.speakers.length > 2 && (
                              <button
                                className="icon-btn danger"
                                title="删除角色并将消息交给其他角色"
                                onClick={() => {
                                  setDeleteRole(speaker.id);
                                  setReplacementRole(
                                    project.speakers.find(
                                      (s) =>
                                        s.id !== speaker.id &&
                                        s.id !== project.meId,
                                    )!.id,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                        </div>
                        <Field label="昵称">
                          <input
                            value={speaker.name}
                            onChange={(e) =>
                              change((p) => {
                                p.speakers.find(
                                  (s) => s.id === speaker.id,
                                )!.name = e.target.value || "新角色";
                              }, speaker.id + "name")
                            }
                          />
                        </Field>
                        <Field label="头像">
                          <AssetSelect
                            assets={assets}
                            kind="avatar"
                            value={speaker.avatarId}
                            onChange={(id) =>
                              change((p) => {
                                p.speakers.find(
                                  (s) => s.id === speaker.id,
                                )!.avatarId = id;
                              })
                            }
                            empty="文字头像"
                          />
                        </Field>
                        <Field label="文字头像底色">
                          <input
                            type="color"
                            value={speaker.color}
                            onChange={(e) =>
                              change((p) => {
                                p.speakers.find(
                                  (s) => s.id === speaker.id,
                                )!.color = e.target.value;
                              })
                            }
                          />
                        </Field>
                        <Field label="角色音效">
                          <AssetSelect
                            assets={assets}
                            kind="sound"
                            value={speaker.soundId}
                            onChange={(id) =>
                              change((p) => {
                                p.speakers.find(
                                  (s) => s.id === speaker.id,
                                )!.soundId = id;
                              })
                            }
                            empty="跟随默认音效"
                          />
                        </Field>
                        <button
                          className="text-button"
                          onClick={() =>
                            change((p) => {
                              p.meId = speaker.id;
                            })
                          }
                        >
                          {speaker.id === project.meId
                            ? "当前我方角色"
                            : "设为我方"}
                        </button>
                      </section>
                    ))}
                  </>
                )}
              </div>
            </aside>
          </div>
        ) : (
          <main className="library-page">
            {mode === "assets" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">素材库</span>
                    <h1>素材库</h1>
                    <p>选择皮肤、头像和背景，或导入自己的素材。</p>
                  </div>
                  <div className="asset-import-actions">
                    <MaterialPacks
                      assets={assets}
                      kind={assetKind}
                      imported={async () =>
                        setAssets(await request<Asset[]>("/api/assets"))
                      }
                      notify={notify}
                    />
                    <label className="button primary">
                      <Download size={16} />
                      导入素材
                      <input
                        hidden
                        type="file"
                        accept={
                          assetKind === "font"
                            ? ".ttf,.otf,.woff,.woff2,.ttc"
                            : assetKind === "sound"
                              ? "audio/*"
                              : "image/*"
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setBusy(true);
                            void importAsset(file, assetKind)
                              .then(() => notify("素材已导入"))
                              .catch((e) => notify(e.message, "error"))
                              .finally(() => setBusy(false));
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="library-toolbar">
                  <div className="category-tabs">
                    {(
                      [
                        "shell",
                        "wallpaper",
                        "avatar",
                        "sticker",
                        "image",
                        "icon",
                        "bar-background",
                        "sound",
                        "font",
                      ] as AssetKind[]
                    ).map((kind) => (
                      <button
                        key={kind}
                        className={assetKind === kind ? "active" : ""}
                        onClick={() => {
                          setAssetKind(kind);
                          setSearch("");
                        }}
                      >
                        {assetLabels[kind]}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="搜索素材或角色"
                    />
                  </label>
                </div>
                {assetKind !== "font" && (
                  <OnlineMaterials
                    kind={assetKind}
                    imported={async () =>
                      setAssets(await request<Asset[]>("/api/assets"))
                    }
                    notify={notify}
                  />
                )}
                <div className="asset-grid">
                  {assets
                    .filter(
                      (a) =>
                        assetCategory(a) === assetKind &&
                        (a.name + a.tags.join(" ")).includes(search),
                    )
                    .map((asset) => (
                      <article
                        className={
                          "asset-tile " +
                          (asset.kind === "shell" ? "shell" : "")
                        }
                        key={asset.id}
                        onClick={() =>
                          ["icon", "bar-background"].includes(
                            assetCategory(asset),
                          )
                            ? setAssetPreview(asset)
                            : applyAsset(asset)
                        }
                      >
                        <div className="asset-image checker">
                          {asset.kind === "font" ? (
                            <FileText size={34} />
                          ) : asset.kind === "sound" ? (
                            <Volume2 size={34} />
                          ) : (
                            <img
                              loading="lazy"
                              src={`/api/assets/file/${asset.id}?size=384`}
                            />
                          )}
                        </div>
                        <strong>{assetName(asset)}</strong>
                        <small>
                          {asset.width
                            ? `${asset.width} × ${asset.height}`
                            : size(asset.bytes)}{" "}
                          · {asset.builtin ? "内置" : "已导入"}
                        </small>
                        <div className="tile-actions">
                          <button
                            className="text-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                ["icon", "bar-background"].includes(
                                  assetCategory(asset),
                                )
                              )
                                setAssetPreview(asset);
                              else applyAsset(asset);
                            }}
                          >
                            {["icon", "bar-background"].includes(
                              assetCategory(asset),
                            )
                              ? "预览"
                              : "使用"}
                          </button>
                          {["avatar", "wallpaper", "image", "sticker"].includes(
                            asset.kind,
                          ) && (
                            <button
                              className="icon-btn"
                              title="裁剪素材"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCropTarget(asset);
                              }}
                            >
                              <Crop size={14} />
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              </>
            )}
            {mode === "plugins" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">消息样式</span>
                    <h1>消息样式</h1>
                    <p>启用常用样式，也可以安装新的消息卡片。</p>
                  </div>
                  <label className="button primary">
                    <Download size={16} />
                    导入配置
                    <input
                      hidden
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void file
                            .text()
                            .then((text) =>
                              post<StylePlugin>(
                                "/api/plugins",
                                JSON.parse(text),
                              ),
                            )
                            .then(() => request<StylePlugin[]>("/api/plugins"))
                            .then((p) => {
                              setPlugins(p);
                              notify("样式已安装");
                            })
                            .catch((e) => notify(e.message, "error"));
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <ImportGuide kind="style" />
                <div className="plugin-grid">
                  {plugins.map((plugin) => (
                    <article className="plugin-card" key={plugin.id}>
                      <div className="plugin-symbol">
                        <Icon name={plugin.icon} size={24} />
                      </div>
                      <div>
                        <h3>
                          {plugin.name}
                          <span className="tag">
                            {plugin.builtin ? "内置" : "已安装"}
                          </span>
                        </h3>
                        <p>{plugin.description}</p>
                        <small>
                          {plugin.fields.length} 个编辑字段 · v{plugin.version}
                        </small>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={plugin.enabled}
                          onChange={(e) => {
                            void request<StylePlugin[]>(
                              "/api/plugins/" + plugin.id,
                              {
                                method: "PUT",
                                body: JSON.stringify({
                                  enabled: e.target.checked,
                                }),
                              },
                            )
                              .then(setPlugins)
                              .catch((e) => notify(e.message, "error"));
                          }}
                        />
                        <span />
                      </label>
                    </article>
                  ))}
                </div>
              </>
            )}
            {mode === "projects" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">工程</span>
                    <h1>工程</h1>
                    <p>打开已有工程，或创建一段新的聊天。</p>
                  </div>
                  <div className="page-actions">
                    <label className="button secondary">
                      <Download size={16} />
                      打开工程包
                      <input
                        hidden
                        type="file"
                        accept=".chatproj,.liaomu,.zip"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const body = new FormData();
                            body.append("file", file);
                            void request<Project>("/api/projects/import", {
                              method: "POST",
                              body,
                            })
                              .then((p) => openProject(p.id))
                              .catch((e) => notify(e.message, "error"));
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      className="button primary"
                      onClick={() => {
                        setNameDraft("");
                        setModal("new");
                      }}
                    >
                      <Plus size={16} />
                      新建工程
                    </button>
                  </div>
                </div>
                <ImportGuide
                  kind="project"
                  showStyles={() => setMode("plugins")}
                />
                <div className="project-grid">
                  {projects.map((p) => (
                    <button
                      className="project-tile"
                      key={p.id}
                      onClick={() =>
                        void openProject(p.id).catch((e) =>
                          notify(e.message, "error"),
                        )
                      }
                    >
                      <div className="project-art">
                        <MessageSquare size={36} />
                        <span>{p.messages} 条消息</span>
                      </div>
                      <h3>{p.title}</h3>
                      <small>
                        {new Date(p.updatedAt).toLocaleString("zh-CN")}
                      </small>
                      {p.id === project.id && (
                        <span className="tag">正在编辑</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </main>
        )}
      </div>
      {jobs.some((j) => j.status === "running" || j.status === "queued") && (
        <div className="job-strip">
          <Film size={16} />
          <span>
            {jobs.find((j) => j.status === "running")?.stage ||
              "导出任务已排队"}
          </span>
          <progress
            max={100}
            value={jobs.find((j) => j.status === "running")?.progress || 0}
          />
          <button className="text-button" onClick={() => setModal("export")}>
            查看导出
          </button>
        </div>
      )}
      {toast && (
        <div
          className={"toast toast-" + toast.tone}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "error" ? (
            <CircleAlert size={16} />
          ) : toast.tone === "info" ? (
            <Info size={16} />
          ) : (
            <Check size={16} />
          )}
          {toast.message}
        </div>
      )}
      {(modal === "new" || modal === "rename") && (
        <Modal
          title={modal === "new" ? "新建工程" : "工程名称"}
          close={() => setModal(null)}
        >
          <Field label="名称">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (modal === "new") void create();
                  else {
                    change((p) => {
                      p.title = nameDraft.trim() || "未命名工程";
                    });
                    setModal(null);
                  }
                }
              }}
              placeholder="给这段聊天起个名字"
            />
          </Field>
          <footer>
            <button className="button secondary" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                modal === "new"
                  ? void create()
                  : (change((p) => {
                      p.title = nameDraft.trim() || "未命名工程";
                    }),
                    setModal(null))
              }
            >
              {modal === "new" ? "创建" : "保存"}
            </button>
          </footer>
        </Modal>
      )}
      {deleteRole && (
        <Modal title="删除角色" close={() => setDeleteRole(null)}>
          <p className="modal-intro">
            {project.speakers.find((s) => s.id === deleteRole)!.name}有{" "}
            {project.messages.filter((m) => m.speakerId === deleteRole).length}{" "}
            条消息。请选择接替发送者。
          </p>
          <Field label="接替角色">
            <select
              value={replacementRole}
              onChange={(e) => setReplacementRole(e.target.value)}
            >
              {project.speakers
                .filter((s) => s.id !== deleteRole)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <footer>
            <button
              className="button secondary"
              onClick={() => setDeleteRole(null)}
            >
              取消
            </button>
            <button
              className="button primary"
              onClick={() => {
                change((p) =>
                  Object.assign(
                    p,
                    removeSpeaker(p, deleteRole, replacementRole),
                  ),
                );
                setSelectedSpeaker(replacementRole);
                setDeleteRole(null);
              }}
            >
              删除角色
            </button>
          </footer>
        </Modal>
      )}
      {assetPreview && (
        <Modal
          title={assetName(assetPreview)}
          close={() => setAssetPreview(null)}
        >
          <div className="asset-preview checker">
            <img
              src={`/api/assets/file/${assetPreview.id}?size=1200`}
              alt={assetName(assetPreview)}
            />
          </div>
          <p>
            {assetLabels[assetCategory(assetPreview)]} · {assetPreview.width}×
            {assetPreview.height}
          </p>
        </Modal>
      )}
      {cropTarget && (
        <CropDialog
          asset={cropTarget}
          close={() => setCropTarget(null)}
          done={(asset) => {
            void request<Asset[]>("/api/assets").then(setAssets);
            setCropTarget(null);
            applyAsset(asset);
            notify("裁剪已保存");
          }}
        />
      )}
      {modal === "bulk" && (
        <Modal title="批量添加消息" close={() => setModal(null)}>
          <p className="modal-intro">
            每行一条，可在开头写角色名；行末的 |1.2 表示等待 1.2 秒。
          </p>
          <textarea
            className="bulk-input"
            autoFocus
            rows={10}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`${project.speakers[0]!.name}：今天几点开始？\n${project.speakers[1]!.name}：三点见！ |1.2`}
          />
          <footer>
            <span className="muted">按现有角色昵称匹配</span>
            <button
              className="button primary"
              disabled={!bulkText.trim()}
              onClick={bulkAdd}
            >
              追加消息
            </button>
          </footer>
        </Modal>
      )}
      {modal === "export" && (
        <Modal title="导出作品" close={() => setModal(null)} wide>
          <div className="export-settings">
            <div className="field-pair">
              <Field label="输出宽度">
                <select
                  value={project.output.width}
                  onChange={(e) =>
                    change((p) => {
                      p.output.width = Number(e.target.value);
                    })
                  }
                >
                  {[360, 540, 720, 1080, 1440, 2160].map((n) => (
                    <option value={n} key={n}>
                      {n}px
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="帧率">
                <select
                  value={project.output.fps}
                  onChange={(e) =>
                    change((p) => {
                      p.output.fps = Number(e.target.value);
                    })
                  }
                >
                  {[10, 15, 24, 30, 60].map((n) => (
                    <option value={n} key={n}>
                      {n} fps
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="format-grid">
              {exportFormats.map((format) => (
                <label
                  key={format}
                  className={
                    "format-option " +
                    (formats.includes(format) ? "selected" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={formats.includes(format)}
                    onChange={(e) =>
                      setFormats((old) =>
                        e.target.checked
                          ? [...old, format]
                          : old.filter((f) => f !== format),
                      )
                    }
                  />
                  <span>
                    {formatLabels[format]}
                    <small>
                      {format.startsWith("mov") ||
                      format === "webm" ||
                      format === "png-sequence"
                        ? "保留透明背景"
                        : format === "long-png"
                          ? "完整聊天内容"
                          : format === "mp4"
                            ? "使用背景颜色"
                            : "适合短动画"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={project.output.longShell !== false}
                onChange={(e) =>
                  change((p) => {
                    p.output.longShell = e.target.checked;
                  })
                }
              />
              长图保留手机外壳
            </label>
            <Field label="MP4 背景颜色">
              <input
                type="color"
                value={project.output.backgroundColor}
                onChange={(e) =>
                  change((p) => {
                    p.output.backgroundColor = e.target.value;
                  })
                }
              />
            </Field>
            <footer>
              <span className="muted">
                {project.messages.length} 条消息 ·{" "}
                {seconds(timeline.durationMs)}
              </span>
              <button
                className="button primary"
                disabled={!formats.length || busy || !project.messages.length}
                onClick={() => void exportProject()}
              >
                <Film size={16} />
                开始导出
              </button>
            </footer>
          </div>
          <section className="export-history">
            <h3>最近的导出</h3>
            {jobs.length ? (
              jobs.slice(0, 8).map((job) => (
                <article className="job-card" key={job.id}>
                  <div className="job-heading">
                    <strong>{job.title}</strong>
                    <span className={"job-status " + job.status}>
                      {job.status === "done"
                        ? "已完成"
                        : job.status === "failed"
                          ? "失败"
                          : job.status === "cancelled"
                            ? "已取消"
                            : job.status === "queued"
                              ? "排队中"
                              : `${job.progress}%`}
                    </span>
                  </div>
                  <p>{job.stage}</p>
                  {["running", "queued"].includes(job.status) && (
                    <div className="job-progress">
                      <progress value={job.progress} max={100} />
                      <button
                        className="text-button danger"
                        onClick={() => {
                          void post(
                            "/api/jobs/" + job.id + "/cancel",
                            {},
                          ).catch((e) => notify(e.message, "error"));
                        }}
                      >
                        取消
                      </button>
                    </div>
                  )}
                  {job.error && (
                    <small className="error-text">{job.error}</small>
                  )}
                  {["failed", "cancelled"].includes(job.status) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        void post<ExportJob>(
                          "/api/jobs/" + job.id + "/retry",
                          {},
                        )
                          .then((value) => setJobs((old) => [value, ...old]))
                          .catch((e) => notify(e.message, "error"));
                      }}
                    >
                      重新导出
                    </button>
                  )}
                  <div className="artifact-links">
                    {job.artifacts.map((a) => (
                      <a key={a.name} href={a.url} download>
                        <Upload size={13} />
                        {formatLabels[a.format]}
                        <small>{size(a.size)}</small>
                      </a>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">完成的作品会出现在这里。</p>
            )}
          </section>
        </Modal>
      )}
    </div>
  );
}

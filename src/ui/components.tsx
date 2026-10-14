import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  MessageSquare,
  Image,
  Mic,
  Smile,
  FileText,
  Clock,
  Link,
  ArrowLeftRight,
  X,
} from "lucide-react";
import type { Asset, AssetKind } from "../core/model.js";
import { assetName, assetCategory } from "../core/asset-names.js";
const icons: Record<string, typeof MessageSquare> = {
  message: MessageSquare,
  image: Image,
  audio: Mic,
  smile: Smile,
  file: FileText,
  clock: Clock,
  link: Link,
  transfer: ArrowLeftRight,
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Component = icons[name] || MessageSquare;
  return <Component size={size} strokeWidth={1.7} />;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field" data-field={label}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  close: () => void,
) {
  const previous = useRef(document.activeElement as HTMLElement | null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const root = ref.current;
    const elements = () =>
      [
        ...(root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
        ) ?? []),
      ].filter((e) => e.getClientRects().length > 0);
    if (!root?.contains(document.activeElement)) elements()[0]?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const list = elements();
        if (!list.length) return;
        const first = list[0]!,
          last = list.at(-1)!;
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !root?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener, true);
    return () => {
      document.removeEventListener("keydown", listener, true);
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, [ref]);
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close(): void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, close);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="关闭">
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function AssetSelect({
  assets,
  kind,
  value,
  onChange,
  empty = "不使用",
}: {
  assets: Asset[];
  kind: AssetKind | AssetKind[];
  value: string | null;
  onChange(id: string | null): void;
  empty?: string;
}) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  return (
    <>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{empty}</option>
        {value &&
          assets.find(
            (a) => a.id === value && !kinds.includes(assetCategory(a)),
          ) && (
            <option value={value}>
              原配置：{assetName(assets.find((a) => a.id === value)!)}
            </option>
          )}
        {assets
          .filter((a) => kinds.includes(assetCategory(a)))
          .map((a) => (
            <option key={a.id} value={a.id}>
              {assetName(a)}
            </option>
          ))}
      </select>
      {kinds.includes("sound") && value && (
        <audio
          className="asset-sound-preview"
          controls
          preload="none"
          src={"/api/assets/file/" + value}
        />
      )}
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { copilotText as ct, copilotLanguage } from '@/lib/copilotI18n';
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPdfBlob, downloadBlob } from "@/lib/pdfUtils";
import {
  copilotDocumentDefinition,
  documentFilename,
  type CopilotDocument,
} from "@/lib/copilotDocument";
import {
  generateCopilotImage,
  retrieveCopilotImage,
  type ActionProposal,
} from "@/services/boxbinCopilotService";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  RefreshCw,
  Eye,
  Bold,
  Heading2,
  Table as TableIcon,
  List,
  ListOrdered,
  FileSpreadsheet,
  Globe,
  Check,
  Calendar,
  MapPin,
  Box,
  ArrowRight,
  SplitSquareVertical,
} from "lucide-react";

interface Props {
  proposal: ActionProposal;
  requestId: string;
  userName?: string;
  binName?: string;
  locationName?: string;
  onClose: () => void;
  onComplete: (data: Record<string, any>, message: string) => void;
}

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white p-2 text-xs sm:text-sm focus:border-slate-400 focus:outline-none transition-colors";

const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function CopilotArtifactEditor({
  proposal,
  requestId,
  userName = ct('boxbinUser'),
  binName,
  locationName,
  onClose,
  onComplete,
}: Props) {
  useTranslation();
  const isImage = proposal.type === "generate_image";
  const [mode, setMode] = useState<"image" | "pdf">(isImage ? "image" : "pdf");
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");

  const [prompt, setPrompt] = useState(proposal.data.prompt || "");
  const [ratio, setRatio] = useState(proposal.data.aspectRatio || "1:1");
  const [image, setImage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; version: string }>();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [draft, setDraft] = useState<CopilotDocument>(() => {
    const identity = {
      language: (proposal.data.language || copilotLanguage()) as "en" | "es",
      preparedBy: userName,
      binName: proposal.data.binName || binName,
      locationName: proposal.data.locationName || locationName,
      fecha: proposal.data.fecha || localDate(),
    };
    if (proposal.data.documentDraft) return proposal.data.documentDraft;
    return {
      ...identity,
      ...proposal.data,
      title: proposal.data.title || ct('manifestTitle'),
      content: proposal.data.content || ct('draftContent'),
    };
  });

  const version = JSON.stringify(draft);

  const patch = (data: Partial<CopilotDocument>) => {
    setDraft((d) => ({ ...d, ...data }));
    setReviewed(false);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const run = async (operation: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (e: any) {
      if (mounted.current) setError(e?.message || ct('fileError'));
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const loadImage = () =>
    run(async () => {
      const result = await generateCopilotImage(prompt, ratio, requestId);
      if (!mounted.current) return;
      const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
      setImage(dataUrl);
      patch({ image: dataUrl, imageCaption: ct('aiCaption') });
      onComplete(
        { ...proposal.data, title: draft.title, prompt, aspectRatio: ratio, imageRequestId: requestId },
        ct('imageReady')
      );
    });

  useEffect(() => {
    if (!isImage || !proposal.data.imageRequestId) return;
    let live = true;
    setBusy(true);
    retrieveCopilotImage(requestId)
      .then(({ image: saved }) => {
        if (!live || !saved) return;
        const url = `data:${saved.mimeType};base64,${saved.base64}`;
        setImage(url);
        setDraft((d) => ({ ...d, image: url }));
      })
      .catch(() => {
        if (live) setError(ct('imageRetrieveError'));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [isImage, requestId, proposal.data.imageRequestId]);

  const makePreview = useCallback(() => {
    if (!draft.title?.trim() || !draft.content?.trim()) return Promise.resolve();
    return run(async () => {
      const currentVersion = JSON.stringify(draft);
      const blob = await createPdfBlob(copilotDocumentDefinition(draft));
      if (mounted.current) {
        setPreview({ blob, url: URL.createObjectURL(blob), version: currentVersion });
      }
    });
  }, [draft]);

  // Initial preview auto-generation on mount
  useEffect(() => {
    if (mode === "pdf" && !preview) {
      void makePreview();
    }
  }, [mode, makePreview, preview]);

  // Auto-debounced preview generation on content or settings change
  useEffect(() => {
    if (mode !== "pdf") return;
    const timer = setTimeout(() => {
      if (!preview || preview.version !== version) {
        void makePreview();
      }
    }, 850);
    return () => clearTimeout(timer);
  }, [version, mode, makePreview, preview]);

  const downloadPdf = () => {
    if (!preview || preview.version !== version || !reviewed) return;
    downloadBlob(preview.blob, documentFilename(draft.title));
    const { image: _image, ...documentDraft } = draft;
    onComplete(
      {
        ...proposal.data,
        ...(isImage ? { prompt, aspectRatio: ratio, imageRequestId: requestId } : {}),
        documentDraft,
      },
      ct('pdfDownloaded')
    );
  };

  const addImage = (file?: File) =>
    run(async () => {
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        throw new Error(ct('chooseImage'));
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(ct('imageReadError')));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      if (mounted.current) patch({ image: dataUrl, imageCaption: file.name });
    });

  // Robust markdown helper functions
  const isEs = draft.language === "es";

  const handleBold = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.content.substring(start, end);
    const placeholder = isEs ? "texto en negrita" : "bold text";
    if (selected) {
      if (selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4) {
        const unwrapped = selected.slice(2, -2);
        const newContent = draft.content.substring(0, start) + unwrapped + draft.content.substring(end);
        patch({ content: newContent });
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start, start + unwrapped.length);
        }, 0);
        return;
      }
      const newText = `**${selected}**`;
      const newContent = draft.content.substring(0, start) + newText + draft.content.substring(end);
      patch({ content: newContent });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + newText.length);
      }, 0);
    } else {
      const newText = `**${placeholder}**`;
      const newContent = draft.content.substring(0, start) + newText + draft.content.substring(end);
      patch({ content: newContent });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 2, start + 2 + placeholder.length);
      }, 0);
    }
  };

  const handleHeading = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const full = draft.content;

    const lineStart = full.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = full.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = full.length;

    const currentLine = full.substring(lineStart, lineEnd);
    const placeholder = isEs ? "Nueva Sección" : "New Section";

    if (currentLine.startsWith("## ")) {
      const newLine = currentLine.substring(3);
      const newContent = full.substring(0, lineStart) + newLine + full.substring(lineEnd);
      patch({ content: newContent });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(lineStart, lineStart + newLine.length);
      }, 0);
    } else if (currentLine.trim().length > 0) {
      const trimmed = currentLine.trim();
      const newLine = `## ${trimmed}`;
      const newContent = full.substring(0, lineStart) + newLine + full.substring(lineEnd);
      patch({ content: newContent });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(lineStart, lineStart + newLine.length);
      }, 0);
    } else {
      const prefix = lineStart > 0 && full[lineStart - 1] !== "\n" ? "\n\n" : "";
      const textToInsert = `${prefix}## ${placeholder}\n`;
      const newContent = full.substring(0, start) + textToInsert + full.substring(end);
      patch({ content: newContent });
      setTimeout(() => {
        textarea.focus();
        const placeholderStart = start + prefix.length + 3;
        textarea.setSelectionRange(placeholderStart, placeholderStart + placeholder.length);
      }, 0);
    }
  };

  const handleList = (ordered = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const full = draft.content;

    const lineStart = full.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = full.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = full.length;

    const selectedLines = full.substring(lineStart, lineEnd).split("\n");
    const placeholder = isEs ? (ordered ? "Elemento numerado" : "Elemento de lista") : (ordered ? "Numbered item" : "List item");

    if (selectedLines.length > 1 || selectedLines[0]?.trim().length > 0) {
      const formatted = selectedLines.map((line, idx) => {
        const trimmed = line.replace(/^([-*]|\d+\.)\s+/, "");
        return ordered ? `${idx + 1}. ${trimmed || placeholder}` : `- ${trimmed || placeholder}`;
      }).join("\n");
      const newContent = full.substring(0, lineStart) + formatted + full.substring(lineEnd);
      patch({ content: newContent });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(lineStart, lineStart + formatted.length);
      }, 0);
    } else {
      const prefix = lineStart > 0 && full[lineStart - 1] !== "\n" ? "\n" : "";
      const textToInsert = `${prefix}${ordered ? "1. " : "- "}${placeholder}\n`;
      const newContent = full.substring(0, start) + textToInsert + full.substring(end);
      patch({ content: newContent });
      setTimeout(() => {
        textarea.focus();
        const placeholderStart = start + prefix.length + (ordered ? 3 : 2);
        textarea.setSelectionRange(placeholderStart, placeholderStart + placeholder.length);
      }, 0);
    }
  };

  const insertSampleTable = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.content.length;
    const end = textarea?.selectionEnd ?? draft.content.length;
    const full = draft.content;

    const tableHeader = isEs
      ? "| Ítem / Descripción | Cantidad | Ubicación | Valor |\n| --- | --- | --- | --- |\n| Artículo de ejemplo | 1 | Estante A-1 | $0.00 |\n"
      : "| Item / Description | Quantity | Location | Value |\n| --- | --- | --- | --- |\n| Sample item | 1 | Shelf A-1 | $0.00 |\n";

    const needsLeadingNewlines = start > 0 ? (full.substring(Math.max(0, start - 2), start) === "\n\n" ? "" : full.endsWith("\n") ? "\n" : "\n\n") : "";
    const needsTrailingNewline = full.substring(end, end + 1) === "\n" ? "\n" : "\n\n";

    const textToInsert = `${needsLeadingNewlines}${tableHeader}${needsTrailingNewline}`;
    const newContent = full.substring(0, start) + textToInsert + full.substring(end);
    patch({ content: newContent });

    setTimeout(() => {
      textarea?.focus();
      const pos = start + textToInsert.length;
      textarea?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handlePageBreak = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.content.length;
    const end = textarea?.selectionEnd ?? draft.content.length;
    const full = draft.content;

    const prefix = start > 0 ? (full.endsWith("\n\n") ? "" : full.endsWith("\n") ? "\n" : "\n\n") : "";
    const suffix = full.substring(end).startsWith("\n\n") ? "" : "\n\n";
    const textToInsert = `${prefix}---page---${suffix}`;
    const newContent = full.substring(0, start) + textToInsert + full.substring(end);
    patch({ content: newContent });

    setTimeout(() => {
      textarea?.focus();
      const pos = start + textToInsert.length;
      textarea?.setSelectionRange(pos, pos);
    }, 0);
  };

  const ready = preview && preview.version === version;
  const wordCount = draft.content ? draft.content.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        closeLabel={ct('close')}
        className="z-[200] !w-[96vw] !max-w-[96vw] sm:!w-[95vw] sm:!max-w-[95vw] md:!w-[94vw] md:!max-w-[94vw] lg:!w-[92vw] lg:!max-w-[1440px] xl:!max-w-[1560px] 2xl:!max-w-[1720px] h-[95dvh] sm:h-[92dvh] flex flex-col p-4 sm:p-6 overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-200/80"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
              {mode === "image" ? <ImageIcon className="size-5 text-orange-400" /> : <FileText className="size-5 text-blue-400" />}
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
                {mode === "image" ? ct('aiImageTitle') : ct('pdfEditorTitle')}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {ct('reviewDocument')}
              </DialogDescription>
            </div>
          </div>

          {/* Mode Switcher / Language & Preview Indicator */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {mode === "pdf" && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5 font-medium">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span className="uppercase font-bold text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                    {draft.language || "es"}
                  </span>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-[11px] text-slate-400">
                  {ready ? (
                    <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      {ct('previewReady')}
                    </span>
                  ) : busy ? (
                    <span className="text-indigo-600 font-medium inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {ct('previewGenerating')}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium inline-flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {ct('previewChanged')}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5 shrink-0 my-2 shadow-2xs">
            {error}
          </p>
        )}

        {/* Mobile / Tablet View Switcher Segmented Control */}
        {mode === "pdf" && (
          <div className="flex lg:hidden items-center p-1 bg-slate-100 border border-slate-200/80 rounded-xl shrink-0 mt-2">
            <button
              type="button"
              onClick={() => setMobileTab("editor")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${mobileTab === "editor" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{ct('editorTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileTab("preview");
                if (!ready) void makePreview();
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${mobileTab === "preview" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{ct('previewTab')}</span>
              {ready && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </button>
          </div>
        )}

        {/* Mode: Image Generator */}
        {mode === "image" ? (
          <div className="flex-1 overflow-auto space-y-4 p-1 pt-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {ct('title')}
              </label>
              <Input
                value={draft.title}
                maxLength={200}
                disabled={busy || !!image}
                onChange={(e) => patch({ title: e.target.value })}
                className="h-9 text-xs rounded-xl border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {ct('imagePrompt')}
              </label>
              <textarea
                className={`${fieldClass} resize-none`}
                rows={4}
                maxLength={4000}
                disabled={busy || !!image}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={ct('promptPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {ct('aspectRatio')}
              </label>
              <select
                className={`${fieldClass} h-9 py-1`}
                value={ratio}
                disabled={busy || !!image}
                onChange={(e) => setRatio(e.target.value)}
              >
                {["1:1", "3:4", "4:3", "9:16", "16:9"].map((r) => (
                  <option key={r} value={r}>
                    {r} {r === "1:1" ? `(${ct('aspectSquare')})` : r === "16:9" ? `(${ct('aspectWidescreen')})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {!image && (
              <Button
                disabled={busy || !prompt.trim()}
                onClick={loadImage}
                className="h-9 px-4 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1" />
                    <span>{ct('generatingImage')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-1 text-amber-300" />
                    <span>{ct('aiImageTitle')}</span>
                  </>
                )}
              </Button>
            )}

            {image && (
              <div className="space-y-3 pt-2">
                <img
                  src={image}
                  alt={draft.title}
                  className="max-h-[45vh] max-w-full mx-auto object-contain rounded-2xl border border-slate-200 shadow-md"
                />
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button
                    onClick={() =>
                      run(async () => {
                        const blob = await (await fetch(image)).blob();
                        downloadBlob(
                          blob,
                          documentFilename(
                            draft.title,
                            image.startsWith("data:image/jpeg") ? "jpg" : image.startsWith("data:image/webp") ? "webp" : "png"
                          )
                        );
                      })
                    }
                    className="h-8.5 px-4 bg-slate-900 text-white rounded-xl text-xs font-bold"
                  >
                    <Download className="size-3.5 mr-1.5" /> {ct('downloadImage')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setMode("pdf")}
                    className="h-8.5 px-4 rounded-xl text-xs font-semibold border-slate-200"
                  >
                    <FileText className="size-3.5 mr-1.5 text-blue-500" /> {ct('includePdf')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Mode: PDF Document Editor & Live Preview */
          <>
            <div className="flex-1 min-h-0 grid lg:grid-cols-2 gap-4 lg:gap-6 overflow-hidden pt-2">
              {/* Left Column: Form & Content Editor */}
              <fieldset
                disabled={busy}
                className={`${mobileTab === "editor" ? "flex" : "hidden lg:flex"
                  } flex-col space-y-3 min-w-0 overflow-y-auto pr-1 sm:pr-2 flex-1`}
              >
                {/* Title and Language */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {ct('reportTitle')} *
                    </label>
                    <Input
                      value={draft.title}
                      maxLength={200}
                      onChange={(e) => patch({ title: e.target.value })}
                      placeholder={ct('titlePlaceholder')}
                      className="h-8.5 text-xs rounded-xl border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400" />
                      <span>{ct('documentLanguage')}</span>
                    </label>
                    <select
                      className={`${fieldClass} h-8.5 py-1 text-xs`}
                      value={draft.language || copilotLanguage()}
                      onChange={(e) => patch({ language: e.target.value as "en" | "es" })}
                    >
                      <option value="en">English (EN)</option>
                      <option value="es">Español (ES)</option>
                    </select>
                  </div>
                </div>

                {/* Scope: Bin & Location */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                      <Box className="w-3 h-3 text-slate-400" />
                      <span>{ct('container')}</span>
                    </label>
                    <Input
                      value={draft.binName || ""}
                      maxLength={100}
                      onChange={(e) => patch({ binName: e.target.value })}
                      placeholder={ct('binPlaceholder')}
                      className="h-8.5 text-xs rounded-xl border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{ct('physicalLocation')}</span>
                    </label>
                    <Input
                      value={draft.locationName || ""}
                      maxLength={100}
                      onChange={(e) => patch({ locationName: e.target.value })}
                      placeholder={ct('locationPlaceholder')}
                      className="h-8.5 text-xs rounded-xl border-slate-200"
                    />
                  </div>
                </div>

                {/* Page Setup: Paper, Orientation, Date */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {ct('paper')}
                    </label>
                    <select
                      className={`${fieldClass} h-8.5 py-1 text-xs`}
                      value={draft.pageSize || "LETTER"}
                      onChange={(e) => patch({ pageSize: e.target.value as "LETTER" | "A4" })}
                    >
                      <option value="LETTER">{ct('letter')}</option>
                      <option value="A4">A4</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {ct('orientation')}
                    </label>
                    <select
                      className={`${fieldClass} h-8.5 py-1 text-xs`}
                      value={draft.orientation || "portrait"}
                      onChange={(e) => patch({ orientation: e.target.value as "portrait" | "landscape" })}
                    >
                      <option value="portrait">{ct('portrait')}</option>
                      <option value="landscape">{ct('landscape')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{ct('date')}</span>
                    </label>
                    <Input
                      type="date"
                      value={draft.fecha || ""}
                      onChange={(e) => patch({ fecha: e.target.value })}
                      className="h-8.5 text-xs rounded-xl border-slate-200"
                    />
                  </div>
                </div>

                {/* Markdown Content with Interactive Toolbar */}
                <div className="flex-1 flex flex-col min-h-[220px]">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      {ct('markdownContent')}
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {draft.content.length.toLocaleString()} / 30,000 {isEs ? 'car.' : 'chars'} ({wordCount} {isEs ? 'palabras' : 'words'})
                    </span>
                  </div>

                  {/* Formatting Toolbar */}
                  <div className="flex items-center flex-wrap gap-1 p-1.5 bg-slate-100 border border-slate-200 rounded-t-xl text-xs">
                    <button
                      type="button"
                      onClick={handleBold}
                      title={ct('insertBold')}
                      className="p-1 px-1.5 hover:bg-white rounded text-slate-700 font-bold text-xs inline-flex items-center gap-1"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleHeading}
                      title={ct('insertHeading')}
                      className="p-1 px-1.5 hover:bg-white rounded text-slate-700 font-bold text-xs inline-flex items-center gap-1"
                    >
                      <Heading2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleList(false)}
                      title={ct('insertList')}
                      className="p-1 px-1.5 hover:bg-white rounded text-slate-700 text-xs inline-flex items-center gap-1"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleList(true)}
                      title={ct('insertNumbered')}
                      className="p-1 px-1.5 hover:bg-white rounded text-slate-700 text-xs inline-flex items-center gap-1"
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-4 w-px bg-slate-300 mx-1" />
                    <button
                      type="button"
                      onClick={insertSampleTable}
                      title={ct('insertTable')}
                      className="p-1 px-2 hover:bg-white rounded text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 bg-white/70 shadow-2xs"
                    >
                      <TableIcon className="w-3 h-3 text-blue-600" />
                      <span>{ct('insertTable')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePageBreak}
                      title={ct('insertPageBreak')}
                      className="p-1 px-1.5 hover:bg-white rounded text-slate-600 text-[11px] inline-flex items-center gap-1"
                    >
                      <SplitSquareVertical className="w-3 h-3 text-slate-500" />
                      <span>{ct('insertPageBreak')}</span>
                    </button>
                  </div>

                  <textarea
                    ref={textareaRef}
                    className="w-full flex-1 min-h-[180px] rounded-b-xl border border-t-0 border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 focus:border-slate-400 focus:outline-none resize-none leading-relaxed"
                    maxLength={30000}
                    value={draft.content}
                    onChange={(e) => patch({ content: e.target.value })}
                    placeholder={ct('contentPlaceholder')}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {ct('markdownHint')}
                  </p>
                </div>

                {/* Attached Image / Illustration */}
                <div className="pt-1">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {ct('attachIllustration')}
                  </label>
                  <input
                    className={`${fieldClass} py-1 text-xs`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      addImage(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>

                {draft.image && (
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <div className="flex items-center space-x-2 min-w-0">
                      <img
                        src={draft.image}
                        alt="Preview"
                        className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0"
                      />
                      <span className="text-xs text-slate-600 truncate font-medium">
                        {draft.imageCaption || ct('attachedImage')}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => patch({ image: undefined, imageCaption: undefined })}
                      className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                    >
                      {ct('removePhoto')}
                    </Button>
                  </div>
                )}
              </fieldset>

              {/* Right Column: Live PDF Preview Viewer */}
              <div
                className={`${mobileTab === "preview" ? "flex" : "hidden lg:flex"
                  } h-full flex-col bg-slate-100 rounded-2xl border border-slate-200/90 overflow-hidden shadow-inner flex-1`}
              >
                {preview ? (
                  <>
                    <iframe
                      title={ct('pdfPreview')}
                      src={preview.url}
                      className="w-full flex-1 bg-white"
                    />
                    <div className="p-2.5 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {draft.pageSize || "LETTER"} • {draft.orientation || "portrait"}
                      </span>
                      <a
                        className="text-xs text-blue-600 hover:text-blue-800 underline font-semibold flex items-center gap-1"
                        href={preview.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{ct('fullPreview')}</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="m-auto p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-400 shadow-2xs">
                      {busy ? <Loader2 className="w-6 h-6 animate-spin text-indigo-600" /> : <FileSpreadsheet className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-xs text-slate-700 font-bold">
                        {busy ? ct('preparingPdf') : ct('previewHint')}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {ct('previewChanged')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={makePreview}
                      disabled={busy}
                      className="rounded-xl bg-slate-900 text-white text-xs h-8"
                    >
                      <RefreshCw className="w-3 h-3 mr-1.5" />
                      {ct('refreshPreview')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 mt-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={makePreview}
                className="h-8.5 text-xs font-semibold rounded-xl border-slate-200 flex items-center gap-1.5"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin text-indigo-600" />
                    <span>{ct('preparingPdf')}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5 text-slate-500" />
                    <span>{ct('refreshPreview')}</span>
                  </>
                )}
              </Button>

              <div className="flex items-center gap-3">
                <label className="text-xs font-medium flex items-center gap-2 cursor-pointer select-none text-slate-700">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={!ready || busy}
                    onChange={(e) => setReviewed(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>{ct('reviewedContent')}</span>
                </label>

                <Button
                  disabled={busy || !ready || !reviewed}
                  onClick={downloadPdf}
                  className="bg-slate-900 hover:bg-slate-800 text-white h-8.5 px-4 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5"
                >
                  <Download className="size-3.5 text-blue-400" />
                  <span>{ct('downloadPdf')}</span>
                </Button>

                {isImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMode("image")}
                    className="h-8.5 text-xs rounded-xl"
                  >
                    {ct('backImage')}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

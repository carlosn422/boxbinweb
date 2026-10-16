import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/config/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  Printer,
  FileText,
  QrCode,
  LayoutGrid,
  RefreshCw,
  Ruler,
  Layers,
  AlertCircle,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FileQrCodes from "@/assets/fileqrcodes.png";

interface Template {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  labelsPerPage?: number;
  gridLayout?: {
    columns: number;
    rows: number;
  };
  dimensions?: {
    qrCode: { width: string; height: string };
    label: { width: string; height: string };
    margins?: { top: string; sides: string };
  };
}

interface RouteState {
  requestId?: string;
  selectedQRCodes?: string[];
  templates?: Template[];
}

export const TemplatesView = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestId = (location.state as RouteState)?.requestId;
  const selectedQRCodes = (location.state as RouteState)?.selectedQRCodes || [];

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/export-templates`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch templates (${response.status})`);
      }

      const data = await response.json();
      setTemplates(
        (data || []).map((template: any) => ({
          id: template.id,
          name: template.name,
          description: template.description || "",
          fields: template.fields || [],
          labelsPerPage: template.labelsPerPage,
          gridLayout: template.gridLayout,
          dimensions: template.dimensions,
          previewUrl: template.previewUrl || FileQrCodes,
        }))
      );
    } catch (err: any) {
      console.error("Error fetching templates:", err);
      setError(err.message || "Failed to load templates. Please try again.");
      toast.error("Could not load templates from server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchTemplates();
    }
  }, [currentUser]);

  const handleDownloadTemplate = async (template: Template) => {
    setDownloadingId(template.id);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/generate-template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          template_name: template.name,
          requestId,
          qrCodes: selectedQRCodes,
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_labels.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`${template.name} PDF downloaded successfully`);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error(err.message || "Error generating template PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-12 font-sans">
      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-7xl space-y-4">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <button
              onClick={() => navigate("/smart-labels")}
              className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              <span>Back to Smart Labels</span>
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Print Templates
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">
                Avery Compatible
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {t("messages.templateSelection") ||
                "Select a sheet template layout to export and print your QR code labels"}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTemplates}
              disabled={loading}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg text-xs shadow-2xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : "text-slate-500"
                  }`}
              />
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Selected QR Codes Context Banner */}
        {selectedQRCodes.length > 0 ? (
          <div className="bg-white rounded-xl border border-indigo-200/80 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {selectedQRCodes.length}{" "}
                  {selectedQRCodes.length === 1 ? "Label" : "Labels"} Selected for
                  Printing
                </p>
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {selectedQRCodes.slice(0, 6).map((id, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded bg-slate-100 font-mono text-[10px] text-slate-700 border border-slate-200"
                    >
                      {id.length > 8 ? id.slice(0, 8) + "…" : id}
                    </span>
                  ))}
                  {selectedQRCodes.length > 6 && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      +{selectedQRCodes.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/smart-labels")}
              className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              Change selection
            </Button>
          </div>
        ) : (
          <div className="bg-slate-100/70 border border-slate-200/70 rounded-xl p-3 flex items-center space-x-2.5 text-xs text-slate-600">
            <Layers className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Generating template without pre-selected QR codes will produce sample
              printable sheets.
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchTemplates}
              className="h-7 text-xs border-red-200 text-red-700 bg-white"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Templates Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-80 bg-white rounded-xl border border-slate-200/80 p-4 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="w-24 h-4 bg-slate-100 rounded"></div>
                  <div className="w-full h-32 bg-slate-100 rounded-lg"></div>
                </div>
                <div className="space-y-2">
                  <div className="w-full h-3 bg-slate-100 rounded"></div>
                  <div className="w-3/4 h-3 bg-slate-100 rounded"></div>
                </div>
                <div className="w-full h-9 bg-slate-100 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 && !error ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              No templates available
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Templates will appear once loaded from the server.
            </p>
            <Button
              size="sm"
              onClick={fetchTemplates}
              className="h-8 bg-slate-900 text-white rounded-lg text-xs"
            >
              Reload Templates
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map((template) => {
              const isDownloading = downloadingId === template.id;
              const cols = template.gridLayout?.columns || 3;
              const rows = template.gridLayout?.rows || 10;
              const totalLabels = template.labelsPerPage || cols * rows;

              return (
                <div
                  key={template.id}
                  className="group bg-white rounded-xl border border-slate-200/90 hover:border-slate-300 p-4 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Top Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                          {template.name}
                        </h3>
                        {template.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {template.description}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-blue-50 text-blue-700 border-blue-200/70 text-[10px] font-semibold shrink-0"
                      >
                        {totalLabels} / sheet
                      </Badge>
                    </div>

                    {/* Sheet Miniature Visual Graphic */}
                    <div className="relative p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center overflow-hidden h-36">
                      {/* Interactive CSS Sheet Preview */}
                      <div className="w-24 h-32 bg-white rounded shadow-xs border border-slate-200 p-1 flex flex-col justify-between group-hover:border-blue-400 group-hover:shadow-sm transition-all">
                        {/* Mini Label Grid simulation */}
                        <div
                          className="w-full h-full grid gap-0.5"
                          style={{
                            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${Math.min(rows, 6)}, minmax(0, 1fr))`,
                          }}
                        >
                          {Array.from({
                            length: Math.min(cols * Math.min(rows, 6), 18),
                          }).map((_, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-100 rounded-[1.5px] border border-slate-200 flex items-center justify-center"
                            >
                              <div className="w-1.5 h-1.5 bg-slate-300 rounded-[0.5px]"></div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Sheet Format Overlay Badge */}
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-white/90 text-slate-600 font-mono text-[9px] border border-slate-200 shadow-2xs backdrop-blur-xs">
                        {cols}×{rows} Grid
                      </span>
                    </div>

                    {/* Specifications List */}
                    <div className="space-y-1.5 pt-1 text-[11px] text-slate-600">
                      {template.dimensions?.label && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 inline-flex items-center gap-1">
                            <Ruler className="w-3 h-3" />
                            <span>Label Size:</span>
                          </span>
                          <span className="font-mono font-semibold text-slate-800">
                            {template.dimensions.label.width} ×{" "}
                            {template.dimensions.label.height}
                          </span>
                        </div>
                      )}

                      {template.dimensions?.qrCode && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 inline-flex items-center gap-1">
                            <QrCode className="w-3 h-3" />
                            <span>QR Code:</span>
                          </span>
                          <span className="font-mono text-slate-700">
                            {template.dimensions.qrCode.width} ×{" "}
                            {template.dimensions.qrCode.height}
                          </span>
                        </div>
                      )}

                      {template.dimensions?.margins && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 inline-flex items-center gap-1">
                            <LayoutGrid className="w-3 h-3" />
                            <span>Margins:</span>
                          </span>
                          <span className="font-mono text-slate-700">
                            {template.dimensions.margins.top} /{" "}
                            {template.dimensions.margins.sides}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Primary Download Button */}
                  <div className="pt-4 border-t border-slate-100 mt-3">
                    <Button
                      onClick={() => handleDownloadTemplate(template)}
                      disabled={isDownloading}
                      className="w-full h-8.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center justify-center space-x-1.5 transition-colors"
                    >
                      {isDownloading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating PDF...</span>
                        </>
                      ) : (
                        <>
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Download PDF</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

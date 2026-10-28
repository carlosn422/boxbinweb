import { API_BASE_URL } from "@/config/api";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  Calendar,
  User,
  AlertCircle,
  CheckCircle,
  Loader2,
  Images,
  Printer,
  ShieldCheck,
} from "lucide-react";

export default function ExportInventory() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [userImpersonated] = useState<any>(() =>
    JSON.parse(localStorage.getItem("impersonatedUser") || "null")
  );
  const effectiveUserId = userImpersonated?.ownerUserId || currentUser?.uid;
  const rawDisplayName = userImpersonated?.ownerDisplayName || currentUser?.displayName || currentUser?.email || "Authenticated";
  const effectiveDisplayName = rawDisplayName.replace(/\+/g, " ").trim();

  const [isExportingTabular, setIsExportingTabular] = useState(false);
  const [isExportingVisual, setIsExportingVisual] = useState(false);
  const [lastExport, setLastExport] = useState<Date | null>(() => {
    const saved = localStorage.getItem("lastInventoryExport");
    return saved ? new Date(saved) : null;
  });
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (lastExport) {
      localStorage.setItem("lastInventoryExport", lastExport.toISOString());
    }
  }, [lastExport]);

  // Tabular Executive PDF Export
  const handleExportTabular = async () => {
    if (!currentUser?.uid) return;

    setIsExportingTabular(true);
    setExportStatus("idle");
    setErrorMessage("");

    try {
      const token = await currentUser.getIdToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (userImpersonated?.ownerUserId) {
        headers["x-impersonate-user"] = userImpersonated.ownerUserId;
      }

      const response = await fetch(`${API_BASE_URL}/api/export-inventory-pdf`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Export failed with status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `boxbin-inventory-register-${new Date().toISOString().split("T")[0]
        }.pdf`;

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const now = new Date();
      setLastExport(now);
      setExportStatus("success");
    } catch (error: any) {
      console.error("Tabular export failed:", error);
      setErrorMessage(error?.message || "Failed to generate executive PDF report.");
      setExportStatus("error");
    } finally {
      setIsExportingTabular(false);
    }
  };

  // Photographic Catalog PDF Export
  const handleExportVisual = async () => {
    if (!currentUser?.uid) return;

    setIsExportingVisual(true);
    setExportStatus("idle");
    setErrorMessage("");

    try {
      const token = await currentUser.getIdToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (userImpersonated?.ownerUserId) {
        headers["x-impersonate-user"] = userImpersonated.ownerUserId;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/original-inventory-pdf/${effectiveUserId}?download=true&email=false`,
        {
          headers,
        }
      );

      if (!response.ok) {
        throw new Error(`Visual export failed with status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `boxbin-visual-catalog-${new Date().toISOString().split("T")[0]
        }.pdf`;

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const now = new Date();
      setLastExport(now);
      setExportStatus("success");
    } catch (error: any) {
      console.error("Visual export failed:", error);
      setErrorMessage(error?.message || "Failed to generate visual catalog PDF.");
      setExportStatus("error");
    } finally {
      setIsExportingVisual(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-12 font-sans">
      {/* Impersonation Banner if active */}
      {userImpersonated && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-1.5">
          <div className="container mx-auto max-w-5xl flex items-center justify-between text-xs text-amber-900">
            <span>
              {t("export.impersonatingAccount", {
                name: effectiveDisplayName,
                defaultValue: "Exporting inventory for account: {{name}}",
              })}
            </span>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
              {t("export.sharedAccess", { defaultValue: "Shared Access" })}
            </span>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-5xl space-y-4">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t("export.title", { defaultValue: "Export Inventory" })}
              </h1>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border-blue-200"
              >
                {t("export.pdfSuite", { defaultValue: "PDF Suite" })}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("export.description", {
                defaultValue:
                  "Download print-ready certified PDF reports and photographic catalogs of your inventory.",
              })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium text-slate-800 truncate max-w-[160px]">
                {effectiveDisplayName}
              </span>
            </div>
            {lastExport && (
              <Badge
                variant="outline"
                className="h-8 px-2.5 text-[11px] font-normal text-slate-500 bg-white border-slate-200 shadow-2xs hidden sm:flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {t("export.last", {
                    date: formatDate(lastExport),
                    defaultValue: "Last: {{date}}",
                  })}
                </span>
              </Badge>
            )}
          </div>
        </div>

        {/* Compact KPI Stats Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                {t("export.kpiFormat", { defaultValue: "Format" })}
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {t("export.kpiPdfVector", { defaultValue: "PDF/A Vector" })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Printer className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                {t("export.kpiLayout", { defaultValue: "Layout" })}
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {t("export.kpiA4PrintReady", { defaultValue: "A4 Print Ready" })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
              <Images className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                {t("export.kpiPhotoGrid", { defaultValue: "Photo Asset Grid" })}
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {t("export.kpiIncluded", { defaultValue: "Included" })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                {t("export.kpiVerification", { defaultValue: "Verification" })}
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {t("export.kpiEncryptedToken", { defaultValue: "Encrypted Token" })}
              </div>
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {exportStatus === "success" && lastExport && (
          <Alert className="border-emerald-200 bg-emerald-50/70 text-emerald-900 rounded-xl p-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <AlertDescription className="text-xs font-medium">
              {t("export.successMessage", {
                date: formatDate(lastExport),
                defaultValue:
                  "Report exported and downloaded successfully on {{date}}.",
              })}
            </AlertDescription>
          </Alert>
        )}

        {exportStatus === "error" && (
          <Alert className="border-red-200 bg-red-50/70 text-red-900 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <AlertDescription className="text-xs font-medium">
              {errorMessage ||
                t("export.errorMessage", {
                  defaultValue:
                    "Export generation failed. Please verify server connection and try again.",
                })}
            </AlertDescription>
          </Alert>
        )}

        {!currentUser && (
          <Alert className="border-amber-200 bg-amber-50/70 text-amber-900 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <AlertDescription className="text-xs font-medium">
              {t("export.mustBeLoggedIn", {
                defaultValue:
                  "You must be signed in to generate authenticated exports.",
              })}
            </AlertDescription>
          </Alert>
        )}

        {/* Export Suite Cards (2 Column Options) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: Executive Inventory Register */}
          <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl overflow-hidden flex flex-col justify-between">
            <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      {t("export.executiveTitle", {
                        defaultValue: "Executive Inventory Register",
                      })}
                    </CardTitle>
                    <span className="text-[11px] text-slate-500">
                      {t("export.executiveSubtitle", {
                        defaultValue: "Tabular format with valuations",
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200">
                {t("export.recommended", { defaultValue: "Recommended" })}
              </Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t("export.executiveDesc", {
                    defaultValue:
                      "Generates an audit-ready multi-page document organizing bins by physical location, complete with item quantities, descriptions, and valuation totals.",
                  })}
                </p>

                <div className="rounded-lg bg-slate-50/70 border border-slate-200/70 p-3 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>
                      {t("export.featureLocationBreakdown", {
                        defaultValue: "Location-by-location bin breakdown",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>
                      {t("export.featureBarcodeTracking", {
                        defaultValue: "Barcode & Smart Label tracking codes",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>
                      {t("export.featureCategoriesValuation", {
                        defaultValue: "Item categories, unit values & quantities",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>
                      {t("export.featureCertifiedTimestamp", {
                        defaultValue:
                          "Certified export timestamp & user attribution",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleExportTabular}
                  disabled={isExportingTabular || !currentUser}
                  className="w-full h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2 transition-colors"
                >
                  {isExportingTabular ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t("export.exporting", { defaultValue: "Compiling PDF..." })}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {t("export.downloadExecutivePdf", {
                          defaultValue: "Download Executive PDF",
                        })}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Option 2: Photographic Visual Catalog */}
          <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl overflow-hidden flex flex-col justify-between">
            <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                    <Images className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      {t("export.visualTitle", {
                        defaultValue: "Photographic Visual Catalog",
                      })}
                    </CardTitle>
                    <span className="text-[11px] text-slate-500">
                      {t("export.visualSubtitle", {
                        defaultValue: "Visual grid with high-res photos",
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200">
                {t("export.visualBinder", { defaultValue: "Visual Binder" })}
              </Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t("export.visualDesc", {
                    defaultValue:
                      "Creates an illustrated catalog displaying photo cards of each item inside its container. Ideal for physical warehouse binders, moving trucks, and insurance claims.",
                  })}
                </p>

                <div className="rounded-lg bg-slate-50/70 border border-slate-200/70 p-3 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>
                      {t("export.featureHighResPhotos", {
                        defaultValue: "High-resolution item photo cards",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>
                      {t("export.featureVisualBinTags", {
                        defaultValue: "Visual bin tags & storage location chips",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>
                      {t("export.featureOptimized3x2", {
                        defaultValue:
                          "Optimized 3x2 grid layout for binder printing",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>
                      {t("export.featureQrVerificationTags", {
                        defaultValue:
                          "QR verification tags embedded on every page",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleExportVisual}
                  disabled={isExportingVisual || !currentUser}
                  className="w-full h-9 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 text-xs font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2 transition-colors"
                >
                  {isExportingVisual ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {t("export.generatingVisualCatalog", {
                          defaultValue: "Generating Visual Catalog...",
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-purple-600" />
                      <span>
                        {t("export.downloadVisualPdf", {
                          defaultValue: "Download Visual Catalog PDF",
                        })}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Specifications & Compliance Info Card */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl overflow-hidden">
          <CardHeader className="p-4 border-b border-slate-100">
            <CardTitle className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              {t("export.exportInfoTitle") || "Report Specifications & Standards"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <h5 className="font-semibold text-slate-900">
                  {t("export.fileFormatTitle") || "Certified PDF Standards"}
                </h5>
                <p className="text-slate-500 leading-relaxed">
                  {t("export.fileFormatDesc") ||
                    "Documents are rendered using pure vector fonts and embedded images, fully compatible with Acrobat Reader, mobile viewers, and commercial print shops."}
                </p>
              </div>

              <div className="space-y-1">
                <h5 className="font-semibold text-slate-900">
                  {t("export.fileSizeTitle") || "Storage & Compression"}
                </h5>
                <p className="text-slate-500 leading-relaxed">
                  {t("export.fileSizeDesc") ||
                    "Photos are dynamically resampled and compressed for rapid streaming and minimal footprint while maintaining 300dpi print clarity."}
                </p>
              </div>

              <div className="space-y-1">
                <h5 className="font-semibold text-slate-900">
                  {t("export.compatibilityTitle") || "Insurance & Audit Compliance"}
                </h5>
                <p className="text-slate-500 leading-relaxed">
                  {t("export.compatibilityDesc") ||
                    "Includes certified generation date stamps and user authentication signatures suitable for commercial inventory audits and insurance documentation."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

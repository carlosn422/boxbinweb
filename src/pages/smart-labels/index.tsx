import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  QrCode,
  Grid,
  List,
  Search,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Calendar,
  Layers,
  CheckCircle2,
  Package,
  Printer,
  X,
  Filter,
  ArrowRight,
} from "lucide-react";

type LabelType = {
  dateCreated: string;
  field: string;
  guid: string;
  isUsed: boolean;
  order_key: string;
  qrcodeId: string;
  userId: string;
};

const generateQrCodeId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 3; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const SmartLabelsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // State
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [allLabels, setAllLabels] = useState<LabelType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "used">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Creation modal state
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [quantity, setQuantity] = useState(5);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetchLabels();
    }
  }, [currentUser]);

  const fetchLabels = async (): Promise<void> => {
    try {
      if (!currentUser) return;
      setIsLoading(true);

      const { data, error } = await supabase
        .from("qrcodes")
        .select("*")
        .eq("userId", currentUser.uid)
        .order("dateCreated", { ascending: false });

      if (error) throw error;

      const labelsData: LabelType[] = (data || []).map((row: any) => {
        let parsedDate = row.dateCreated;
        if (row.dateCreated && typeof row.dateCreated === "object" && "_seconds" in row.dateCreated) {
          parsedDate = new Date(row.dateCreated._seconds * 1000).toISOString();
        } else if (!row.dateCreated) {
          parsedDate = new Date().toISOString();
        }
        return {
          dateCreated: parsedDate,
          field: row.field || "",
          guid: row.guid || row.id,
          isUsed: Boolean(row.isUsed),
          order_key: row.order_key || "",
          qrcodeId: row.qrcodeId || "",
          userId: row.userId,
        };
      });

      setAllLabels(labelsData);
    } catch (error: any) {
      console.error("Error fetching labels:", error);
      toast.error(error.message || t("smartLabels.toasts.failedToLoad", { defaultValue: "Failed to load labels" }));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLabels();
    toast.success(t("smartLabels.toasts.labelsUpdated", { defaultValue: "Labels updated" }));
  };

  // Filtered labels
  const filteredLabels = useMemo(() => {
    return allLabels.filter((label) => {
      // Status filter
      if (statusFilter === "available" && label.isUsed) return false;
      if (statusFilter === "used" && !label.isUsed) return false;

      // Search term + tags
      const currentSearch = searchTerm.trim().toUpperCase();
      const qrUpper = (label.qrcodeId || "").toUpperCase();

      if (currentSearch && !qrUpper.includes(currentSearch)) {
        return false;
      }

      if (searchTags.length > 0) {
        const matchesAnyTag = searchTags.some((tag) =>
          qrUpper.includes(tag.toUpperCase())
        );
        if (!matchesAnyTag) return false;
      }

      // Date filters
      if (startDate && new Date(label.dateCreated) < startDate) {
        return false;
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (new Date(label.dateCreated) > endOfDay) {
          return false;
        }
      }

      return true;
    });
  }, [allLabels, statusFilter, searchTerm, searchTags, startDate, endDate]);

  // Statistics
  const stats = useMemo(() => {
    const total = allLabels.length;
    const available = allLabels.filter((l) => !l.isUsed).length;
    const used = allLabels.filter((l) => l.isUsed).length;
    const selected = selectedLabels.length;
    return { total, available, used, selected };
  }, [allLabels, selectedLabels]);

  const handleLabelSelect = (guid: string) => {
    setSelectedLabels((prev) =>
      prev.includes(guid) ? prev.filter((id) => id !== guid) : [...prev, guid]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredGuids = filteredLabels.map((l) => l.guid);
    const areAllSelected = allFilteredGuids.every((id) =>
      selectedLabels.includes(id)
    );

    if (areAllSelected) {
      setSelectedLabels((prev) =>
        prev.filter((id) => !allFilteredGuids.includes(id))
      );
    } else {
      setSelectedLabels((prev) =>
        Array.from(new Set([...prev, ...allFilteredGuids]))
      );
    }
  };

  const handleCopyQrId = (e: React.MouseEvent, qrcodeId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(qrcodeId);
    setCopiedId(qrcodeId);
    toast.success(
      t("smartLabels.toasts.copied", {
        id: qrcodeId,
        defaultValue: `QR ID ${qrcodeId} copied to clipboard`,
      })
    );
    setTimeout(() => {
      setCopiedId((prev) => (prev === qrcodeId ? null : prev));
    }, 2000);
  };

  const handleCreateLabels = async () => {
    if (!currentUser || quantity < 1) return;
    setIsCreating(true);

    try {
      const newLabels = [];
      const now = new Date().toISOString();

      for (let i = 0; i < quantity; i++) {
        const guid =
          self.crypto?.randomUUID() ||
          Math.random().toString(36).substring(2) + Date.now().toString(36);
        const qrcodeId = generateQrCodeId();

        newLabels.push({
          dateCreated: now,
          field: `Label ${quantity > 1 ? `(${i + 1})` : ""}`.trim(),
          guid,
          isUsed: false,
          order_key: "",
          qrcodeId,
          userId: currentUser.uid,
        });
      }

      const { error } = await supabase.from("qrcodes").insert(newLabels);
      if (error) throw error;

      toast.success(
        quantity === 1
          ? t("smartLabels.toasts.createdSingle", {
              defaultValue: "1 new QR label generated successfully",
            })
          : t("smartLabels.toasts.createdMultiple", {
              count: quantity,
              defaultValue: `${quantity} QR labels generated successfully`,
            })
      );

      setShowQuantityModal(false);
      await fetchLabels();
    } catch (error: any) {
      console.error("Error creating labels:", error);
      toast.error(
        error.message ||
          t("smartLabels.toasts.createFailed", {
            defaultValue: "Failed to create labels",
          })
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleNavigateToTemplates = () => {
    if (selectedLabels.length === 0) return;
    navigate("/smart-labels/templates", {
      state: {
        selectedQRCodes: selectedLabels,
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-12 font-sans">
      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-7xl space-y-4">
        {/* Compact Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t("smartLabels.title")}
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">
                v2.0
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("smartLabels.subtitle")}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg text-xs shadow-2xs"
              title={t("smartLabels.refresh", { defaultValue: "Refresh" })}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600" : "text-slate-500"
                  }`}
              />
              <span className="ml-1.5 hidden sm:inline">{t("smartLabels.refresh", { defaultValue: "Refresh" })}</span>
            </Button>

            <Button
              onClick={() => setShowQuantityModal(true)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("smartLabels.createLabel")}</span>
            </Button>
          </div>
        </div>

        {/* Space-Optimized KPI Stat Ribbon */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Labels */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                <QrCode className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("smartLabels.totalQrCodes", { defaultValue: "Total QR Codes" })}
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {stats.total}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              {t("smartLabels.cataloged", { defaultValue: "Cataloged" })}
            </span>
          </div>

          {/* Available Labels */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <CheckCircle2 className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("smartLabels.available")}
                </p>
                <h3 className="text-lg font-black text-emerald-600 leading-tight">
                  {stats.available}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-emerald-600/70 hidden xl:inline">
              {t("smartLabels.readyToPrint", { defaultValue: "Ready to print" })}
            </span>
          </div>

          {/* Used in Bins */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Package className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("smartLabels.used")}
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {stats.used}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              {t("smartLabels.assigned", { defaultValue: "Assigned" })}
            </span>
          </div>

          {/* Selected for Printing */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("smartLabels.selected")}
                </p>
                <h3 className="text-lg font-black text-indigo-600 leading-tight">
                  {stats.selected}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-indigo-600/70 hidden xl:inline">
              {t("smartLabels.inSelection", { defaultValue: "In selection" })}
            </span>
          </div>
        </div>

        {/* Selected Batch Action Banner */}
        {selectedLabels.length > 0 && (
          <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                {selectedLabels.length}
              </div>
              <div className="text-xs text-indigo-900">
                <span className="font-semibold">
                  {selectedLabels.length}{" "}
                  {selectedLabels.length === 1
                    ? t("smartLabels.label")
                    : t("smartLabels.labels")}
                </span>{" "}
                {t("smartLabels.readyForTemplatePrinting", { defaultValue: "ready for template printing" })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLabels([])}
                className="h-7 px-2.5 text-xs text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100/60"
              >
                {t("smartLabels.clearSelection", { defaultValue: "Clear selection" })}
              </Button>
              <Button
                size="sm"
                onClick={handleNavigateToTemplates}
                className="h-8 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t("smartLabels.generateTemplate")}</span>
                <ArrowRight className="w-3 h-3 ml-0.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Unified Controls Row (Tabs + Search + Filters + View Mode) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs">
          {/* Segmented Status Tabs */}
          <div className="bg-slate-100 p-0.5 rounded-lg h-8 flex items-center border border-slate-200/70 shrink-0">
            <button
              onClick={() => setStatusFilter("all")}
              className={`flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md transition-all h-7 px-3 ${statusFilter === "all"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              <span>{t("smartLabels.all", { defaultValue: "All" })}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-600">
                {stats.total}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter("available")}
              className={`flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md transition-all h-7 px-3 ${statusFilter === "available"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              <span>{t("smartLabels.available")}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                {stats.available}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter("used")}
              className={`flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md transition-all h-7 px-3 ${statusFilter === "used"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              <span>{t("smartLabels.used")}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-600">
                {stats.used}
              </span>
            </button>
          </div>

          {/* Search Box & Tag Filter Chips */}
          <div className="flex items-center gap-2 flex-1 lg:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <Input
                placeholder={t("smartLabels.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const val = searchTerm.trim().toUpperCase();
                    if (val && !searchTags.includes(val)) {
                      setSearchTags([...searchTags, val]);
                      setSearchTerm("");
                    }
                  }
                }}
                className="h-8 pl-8 pr-7 text-xs bg-slate-50 border-slate-200 rounded-lg focus-visible:ring-1 focus-visible:ring-slate-900"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Secondary Actions: Date Filter & View Switcher */}
          <div className="flex items-center gap-2 shrink-0 justify-between lg:justify-end">
            {/* Date Filter Dropdown Trigger */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
                className={`h-8 px-2.5 text-xs border-slate-200 rounded-lg flex items-center gap-1.5 ${startDate || endDate
                  ? "bg-blue-50 text-blue-700 border-blue-200 font-semibold"
                  : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {startDate || endDate
                    ? t("smartLabels.datesFiltered", { defaultValue: "Dates Filtered" })
                    : t("smartLabels.filterByDate", { defaultValue: "Filter by Date" })}
                </span>
                {(startDate || endDate) && (
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                )}
              </Button>

              {isDateFilterOpen && (
                <div className="absolute right-0 top-10 w-72 bg-white rounded-xl border border-slate-200 shadow-xl p-3 z-30 space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-900">
                      {t("smartLabels.dateRange", { defaultValue: "Date Range" })}
                    </span>
                    <button
                      onClick={() => setIsDateFilterOpen(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <Label className="text-[11px] text-slate-500 mb-1 block">
                        {t("smartLabels.startDate", { defaultValue: "Start Date" })}
                      </Label>
                      <DatePicker
                        selected={startDate}
                        onChange={(d: Date | null) => setStartDate(d)}
                        selectsStart
                        startDate={startDate || undefined}
                        endDate={endDate || undefined}
                        className="w-full h-7 px-2 text-xs border border-slate-200 rounded-md bg-slate-50 text-slate-800"
                        placeholderText={t("smartLabels.selectStartDate", { defaultValue: "Select start date" })}
                        maxDate={new Date()}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-500 mb-1 block">
                        {t("smartLabels.endDate", { defaultValue: "End Date" })}
                      </Label>
                      <DatePicker
                        selected={endDate}
                        onChange={(d: Date | null) => setEndDate(d)}
                        selectsEnd
                        startDate={startDate || undefined}
                        endDate={endDate || undefined}
                        className="w-full h-7 px-2 text-xs border border-slate-200 rounded-md bg-slate-50 text-slate-800"
                        placeholderText={t("smartLabels.selectEndDate", { defaultValue: "Select end date" })}
                        minDate={startDate || undefined}
                        maxDate={new Date()}
                      />
                    </div>
                  </div>

                  {(startDate || endDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStartDate(null);
                        setEndDate(null);
                        setIsDateFilterOpen(false);
                      }}
                      className="w-full h-7 text-xs text-red-600 hover:bg-red-50"
                    >
                      {t("smartLabels.clearDates", { defaultValue: "Clear Dates" })}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Select All Toggle */}
            {filteredLabels.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllFiltered}
                className="h-8 px-2.5 text-xs text-slate-700 bg-white border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                {filteredLabels.every((l) => selectedLabels.includes(l.guid))
                  ? t("smartLabels.deselectAll", { defaultValue: "Deselect All" })
                  : t("smartLabels.selectAll", { defaultValue: "Select All" })}
              </Button>
            )}

            {/* View Mode Toggle */}
            <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-200/70 flex items-center">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1 rounded-md transition-colors ${viewMode === "grid"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-600"
                  }`}
                title={t("smartLabels.gridView")}
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1 rounded-md transition-colors ${viewMode === "list"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-600"
                  }`}
                title={t("smartLabels.listView")}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Search Tags Strip */}
        {searchTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-white rounded-lg border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">
              {t("smartLabels.activeFilters", { defaultValue: "Active Filters:" })}
            </span>
            {searchTags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[11px] font-mono border border-slate-200"
              >
                {tag}
                <button
                  onClick={() =>
                    setSearchTags(searchTags.filter((_, i) => i !== idx))
                  }
                  className="text-slate-400 hover:text-red-500 ml-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <button
              onClick={() => setSearchTags([])}
              className="text-[11px] text-red-600 hover:underline ml-2"
            >
              {t("smartLabels.clearAllTags", { defaultValue: "Clear all tags" })}
            </button>
          </div>
        )}

        {/* Content Area */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-32 bg-white rounded-xl border border-slate-200/80 p-3.5 animate-pulse flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="w-5 h-5 bg-slate-100 rounded"></div>
                  <div className="w-12 h-4 bg-slate-100 rounded"></div>
                </div>
                <div className="w-20 h-6 bg-slate-100 rounded"></div>
                <div className="w-28 h-3 bg-slate-100 rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredLabels.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {t("smartLabels.noLabelsTitle")}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              {t("smartLabels.noLabelsSubtitle")}
            </p>
            <Button
              size="sm"
              onClick={() => setShowQuantityModal(true)}
              className="h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              <span>{t("smartLabels.createNewQrLabels", { defaultValue: "Create New QR Labels" })}</span>
            </Button>
          </div>
        ) : (
          <>
            {/* GRID VIEW */}
            {viewMode === "grid" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredLabels.map((label) => {
                  const isSelected = selectedLabels.includes(label.guid);
                  const isCopied = copiedId === label.qrcodeId;

                  return (
                    <div
                      key={label.guid}
                      onClick={() => handleLabelSelect(label.guid)}
                      className={`group relative bg-white rounded-xl border p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-[138px] ${isSelected
                        ? "border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/20"
                        : "border-slate-200/90 hover:border-slate-300"
                        }`}
                    >
                      {/* Top Row: Checkbox, Badge & Copy */}
                      <div className="flex items-start justify-between gap-2">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="pt-0.5"
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleLabelSelect(label.guid)}
                            className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          />
                        </div>

                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-semibold h-4 px-1.5 border shrink-0 ${label.isUsed
                            ? "bg-amber-50 text-amber-800 border-amber-200/80"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200/80"
                            }`}
                        >
                          {label.isUsed
                            ? t("smartLabels.used")
                            : t("smartLabels.available")}
                        </Badge>
                      </div>

                      {/* Center: QR Icon & Mono Code */}
                      <div className="flex items-center space-x-2.5 my-auto">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors shrink-0">
                          <QrCode className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-base tracking-wider text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                              {label.qrcodeId}
                            </span>
                            <button
                              onClick={(e) => handleCopyQrId(e, label.qrcodeId)}
                              className="text-slate-300 hover:text-slate-600 transition-colors p-0.5 rounded"
                              title={t("smartLabels.copyQrId", { defaultValue: "Copy QR Code ID" })}
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          {label.field && (
                            <p className="text-[11px] text-slate-400 truncate max-w-[120px]">
                              {label.field}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bottom Footer: Date Created */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {new Date(label.dateCreated).toLocaleDateString()}
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-300 group-hover:text-indigo-500 font-medium transition-colors">
                          {isSelected
                            ? t("smartLabels.selectedBadge", { defaultValue: "Selected" })
                            : t("smartLabels.select", { defaultValue: "Select" })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* LIST VIEW */}
            {viewMode === "list" && (
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {filteredLabels.map((label) => {
                    const isSelected = selectedLabels.includes(label.guid);
                    const isCopied = copiedId === label.qrcodeId;

                    return (
                      <div
                        key={label.guid}
                        onClick={() => handleLabelSelect(label.guid)}
                        className={`p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer ${isSelected ? "bg-indigo-50/20" : ""
                          }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() =>
                                handleLabelSelect(label.guid)
                              }
                              className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                            />
                          </div>

                          <div className="w-7 h-7 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                            <QrCode className="w-3.5 h-3.5" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-slate-900 tracking-wider">
                                {label.qrcodeId}
                              </span>
                              <button
                                onClick={(e) =>
                                  handleCopyQrId(e, label.qrcodeId)
                                }
                                className="text-slate-300 hover:text-slate-600 transition-colors"
                                title={t("smartLabels.copyQrId", { defaultValue: "Copy QR Code ID" })}
                              >
                                {isCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            {label.field && (
                              <p className="text-[11px] text-slate-400 truncate">
                                {label.field}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 text-xs">
                          <span className="text-[11px] text-slate-400 hidden sm:inline">
                            {new Date(label.dateCreated).toLocaleString()}
                          </span>

                          <Badge
                            variant="secondary"
                            className={`text-[10px] font-semibold h-5 px-2 border ${label.isUsed
                              ? "bg-amber-50 text-amber-800 border-amber-200/80"
                              : "bg-emerald-50 text-emerald-800 border-emerald-200/80"
                              }`}
                          >
                            {label.isUsed
                              ? t("smartLabels.used")
                              : t("smartLabels.available")}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* CREATE LABELS MODAL */}
      {showQuantityModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {t("smartLabels.createModalTitle")}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {t("smartLabels.createModalSubtitle", { defaultValue: "Generate unique QR identifier codes" })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQuantityModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets & Input */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-slate-700">
                {t("smartLabels.quantityToGenerate", { defaultValue: "Quantity to Generate" })}
              </Label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 5, 10, 25, 50].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setQuantity(preset)}
                    className={`h-8 rounded-lg text-xs font-semibold border transition-all ${quantity === preset
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                  >
                    +{preset}
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="h-9 text-xs text-center font-bold"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-500">
                <span>{t("smartLabels.preview", { defaultValue: "Preview: " })}</span>
                <span className="font-mono font-bold text-slate-800">
                  {generateQrCodeId()}
                </span>
                <span> {t("smartLabels.randomCodeNote", { defaultValue: "(random 3-char unique alphanumeric ID)" })}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuantityModal(false)}
                className="h-8 text-xs border-slate-200 text-slate-600"
              >
                {t("smartLabels.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleCreateLabels}
                disabled={isCreating}
                className="h-8 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs"
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    <span>{t("smartLabels.generating", { defaultValue: "Generating..." })}</span>
                  </>
                ) : (
                  <span>
                    {quantity > 1
                      ? t("smartLabels.generateLabelsBtn", {
                          count: quantity,
                          defaultValue: `Generate ${quantity} Labels`,
                        })
                      : t("smartLabels.generateLabelBtn", {
                          defaultValue: "Generate Label",
                        })}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

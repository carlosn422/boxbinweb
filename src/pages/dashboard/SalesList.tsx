import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Tag,
  DollarSign,
  ExternalLink,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Edit3,
  Trash2,
  Box,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  ImageIcon,
  X,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { updateInventoryRecord, inventoryError } from "@/services/inventoryService";
import {
  type ItemSaleStatus,
  buildSalePayload,
  getSaleStoreLabel,
  normalizeSaleStatus,
  normalizeSaleUrl,
  parseSalePrice,
} from "@/lib/itemSales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SalesItem {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  binId: string;
  userId?: string;
  imageUrl?: string | null;
  cuantity?: string;
  quantity?: string | number;
  value?: string;
  sale_status?: ItemSaleStatus | null;
  sale_price?: string | null;
  sale_url?: string | null;
  sold_at?: string | null;
}

interface BinRef {
  id: string;
  name: string;
}

export default function SalesListScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [userImpersonated] = useState<any>(() =>
    JSON.parse(localStorage.getItem("impersonatedUser") || "null")
  );
  const effectiveUserId = userImpersonated?.ownerUserId || currentUser?.uid;

  const [allItems, setAllItems] = useState<SalesItem[]>([]);
  const [binsMap, setBinsMap] = useState<Record<string, BinRef>>({});
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | "for_sale" | "sold">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Edit sale modal
  const [editingItem, setEditingItem] = useState<SalesItem | null>(null);
  const [editSaleStatus, setEditSaleStatus] = useState<ItemSaleStatus>("for_sale");
  const [editSalePrice, setEditSalePrice] = useState("");
  const [editSaleUrl, setEditSaleUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Add existing inventory item to sales list modal
  const [isAddFromInventoryOpen, setIsAddFromInventoryOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [addSalePrice, setAddSalePrice] = useState("");
  const [addSaleUrl, setAddSaleUrl] = useState("");
  const [addSaleStatus, setAddSaleStatus] = useState<"for_sale" | "sold">("for_sale");

  const loadSalesInventory = useCallback(
    async (showLoader = true) => {
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }
      try {
        if (showLoader) setLoading(true);
        const [{ data: binsRows, error: binsErr }, { data: itemsRows, error: itemsErr }] =
          await Promise.all([
            supabase.from("bins").select("id, name").eq("userId", effectiveUserId),
            supabase
              .from("items")
              .select("*")
              .eq("userId", effectiveUserId)
              .order("createdAt", { ascending: false }),
          ]);

        if (binsErr) throw binsErr;
        if (itemsErr) throw itemsErr;

        const map: Record<string, BinRef> = {};
        (binsRows || []).forEach((b: any) => {
          map[b.id] = { id: b.id, name: b.name || "" };
        });
        setBinsMap(map);
        setAllItems((itemsRows || []) as SalesItem[]);
      } catch (err) {
        console.error("Error loading sales list:", err);
        toast.error(t("sales.loadError", { defaultValue: "Failed to load sales list" }));
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [effectiveUserId, t]
  );

  useEffect(() => {
    void loadSalesInventory(true);
  }, [loadSalesInventory]);

  const salesItems = useMemo(() => {
    return allItems.filter((it) => {
      const st = normalizeSaleStatus(it.sale_status);
      return st === "for_sale" || st === "sold";
    });
  }, [allItems]);

  const candidateItems = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    return allItems
      .filter((it) => normalizeSaleStatus(it.sale_status) === "not_for_sale")
      .filter((it) => {
        if (!q) return true;
        const binName = binsMap[it.binId]?.name?.toLowerCase() || "";
        return (
          it.name?.toLowerCase().includes(q) ||
          it.description?.toLowerCase().includes(q) ||
          binName.includes(q)
        );
      });
  }, [allItems, inventorySearch, binsMap]);

  const filteredSalesItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return salesItems.filter((it) => {
      const st = normalizeSaleStatus(it.sale_status);
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!q) return true;
      const binName = binsMap[it.binId]?.name?.toLowerCase() || "";
      return (
        it.name?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q) ||
        (it.sale_url || "").toLowerCase().includes(q) ||
        binName.includes(q)
      );
    });
  }, [salesItems, statusFilter, searchQuery, binsMap]);

  const kpis = useMemo(() => {
    let forSaleCount = 0;
    let forSaleTotal = 0;
    let soldCount = 0;
    let soldTotal = 0;

    for (const it of salesItems) {
      const st = normalizeSaleStatus(it.sale_status);
      const qty = Math.max(1, Number(it.quantity ?? it.cuantity ?? 1) || 1);
      const price = parseSalePrice(it.sale_price, it.value);
      if (st === "for_sale") {
        forSaleCount += 1;
        forSaleTotal += price * qty;
      } else if (st === "sold") {
        soldCount += 1;
        soldTotal += price * qty;
      }
    }

    return { forSaleCount, forSaleTotal, soldCount, soldTotal };
  }, [salesItems]);

  const openEditModal = (item: SalesItem) => {
    setEditingItem(item);
    const st = normalizeSaleStatus(item.sale_status);
    setEditSaleStatus(st === "sold" ? "sold" : "for_sale");
    setEditSalePrice(
      item.sale_price != null && String(item.sale_price).trim() !== ""
        ? String(item.sale_price)
        : item.value && item.value !== "0"
          ? String(item.value)
          : ""
    );
    setEditSaleUrl(item.sale_url || "");
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !effectiveUserId) return;
    try {
      setIsSaving(true);
      const payload = buildSalePayload({
        enabled: editSaleStatus !== "not_for_sale",
        status: editSaleStatus,
        salePrice: editSalePrice,
        saleUrl: editSaleUrl,
        fallbackValue: editingItem.value,
        previousSoldAt: editingItem.sold_at,
      });

      const updated = await updateInventoryRecord("items", effectiveUserId, editingItem.id, {
        ...payload,
        ...(payload.sale_price ? { value: payload.sale_price } : {}),
      });

      setAllItems((prev) =>
        prev.map((it) => (it.id === editingItem.id ? (updated as SalesItem) : it))
      );
      setEditingItem(null);
      toast.success(t("sales.updatedToast", { defaultValue: "Sale listing updated" }));
    } catch (err) {
      toast.error(
        inventoryError(err, t("sales.updateError", { defaultValue: "Failed to update sale listing" }))
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSoldStatus = async (item: SalesItem) => {
    if (!effectiveUserId) return;
    const currentStatus = normalizeSaleStatus(item.sale_status);
    const nextStatus: ItemSaleStatus = currentStatus === "sold" ? "for_sale" : "sold";

    try {
      const payload = buildSalePayload({
        enabled: true,
        status: nextStatus,
        salePrice: item.sale_price,
        saleUrl: item.sale_url,
        fallbackValue: item.value,
        previousSoldAt: item.sold_at,
      });

      const updated = await updateInventoryRecord(
        "items",
        effectiveUserId,
        item.id,
        payload
      );
      setAllItems((prev) =>
        prev.map((it) => (it.id === item.id ? (updated as SalesItem) : it))
      );
      toast.success(
        nextStatus === "sold"
          ? t("sales.markedSoldToast", {
              name: item.name,
              defaultValue: `"${item.name}" marked as sold`,
            })
          : t("sales.markedForSaleToast", {
              name: item.name,
              defaultValue: `"${item.name}" marked as for sale`,
            })
      );
    } catch (err) {
      toast.error(
        inventoryError(err, t("sales.updateError", { defaultValue: "Failed to update sale status" }))
      );
    }
  };

  const handleRemoveFromSales = async (item: SalesItem) => {
    if (!effectiveUserId) return;
    try {
      const payload = buildSalePayload({ enabled: false });
      const updated = await updateInventoryRecord(
        "items",
        effectiveUserId,
        item.id,
        payload
      );
      setAllItems((prev) =>
        prev.map((it) => (it.id === item.id ? (updated as SalesItem) : it))
      );
      toast.success(
        t("sales.removedFromSalesToast", {
          name: item.name,
          defaultValue: `"${item.name}" removed from sales list`,
        })
      );
    } catch (err) {
      toast.error(
        inventoryError(err, t("sales.updateError", { defaultValue: "Failed to remove from sales list" }))
      );
    }
  };

  const handleAddFromInventory = async () => {
    const candidate = allItems.find((it) => it.id === selectedCandidateId);
    if (!candidate || !effectiveUserId) return;
    try {
      setIsSaving(true);
      const payload = buildSalePayload({
        enabled: true,
        status: addSaleStatus,
        salePrice: addSalePrice,
        saleUrl: addSaleUrl,
        fallbackValue: candidate.value,
      });
      const updated = await updateInventoryRecord(
        "items",
        effectiveUserId,
        candidate.id,
        {
          ...payload,
          ...(payload.sale_price ? { value: payload.sale_price } : {}),
        }
      );
      setAllItems((prev) =>
        prev.map((it) => (it.id === candidate.id ? (updated as SalesItem) : it))
      );
      setIsAddFromInventoryOpen(false);
      setSelectedCandidateId("");
      setAddSalePrice("");
      setAddSaleUrl("");
      setAddSaleStatus("for_sale");
      toast.success(
        t("sales.addedToSalesToast", {
          name: candidate.name,
          defaultValue: `"${candidate.name}" added to sales list`,
        })
      );
    } catch (err) {
      toast.error(
        inventoryError(err, t("sales.updateError", { defaultValue: "Failed to add item to sales list" }))
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/60 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm text-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-brand-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-600">
            {t("sales.loading", { defaultValue: "Loading sales list..." })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {t("sales.title", { defaultValue: "Sales List" })}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("sales.subtitle", {
                defaultValue:
                  "Track items listed on eBay, Amazon, or other marketplaces and mark them as sold",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsRefreshing(true);
              void loadSalesInventory(false);
            }}
            disabled={isRefreshing}
            className="h-9 w-9 p-0 rounded-xl border-slate-200"
            title={t("sales.refresh", { defaultValue: "Refresh" })}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setInventorySearch("");
              setSelectedCandidateId("");
              setAddSalePrice("");
              setAddSaleUrl("");
              setAddSaleStatus("for_sale");
              setIsAddFromInventoryOpen(true);
            }}
            className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-brand-400" />
            <span>{t("sales.addItemToSales", { defaultValue: "List Item for Sale" })}</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t("sales.kpiForSale", { defaultValue: "Active Listings (For Sale)" })}
            </span>
            <span className="text-2xl font-black text-slate-900">
              {kpis.forSaleCount}
            </span>
            <span className="text-[11px] text-amber-700 font-mono font-bold block">
              ${kpis.forSaleTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t("sales.kpiSold", { defaultValue: "Sold Items" })}
            </span>
            <span className="text-2xl font-black text-slate-900">
              {kpis.soldCount}
            </span>
            <span className="text-[11px] text-emerald-700 font-mono font-bold block">
              ${kpis.soldTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t("sales.kpiTotalValue", { defaultValue: "Total Sales Portfolio" })}
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono">
              ${(kpis.forSaleTotal + kpis.soldTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400 block">
              {t("sales.itemsCount", {
                count: salesItems.length,
                defaultValue: `${salesItems.length} items in sales list`,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {(["all", "for_sale", "sold"] as const).map((tab) => {
            const active = statusFilter === tab;
            const label =
              tab === "all"
                ? `${t("sales.filterAll", { defaultValue: "All" })} (${salesItems.length})`
                : tab === "for_sale"
                  ? `${t("sales.statusForSale", { defaultValue: "For Sale" })} (${kpis.forSaleCount})`
                  : `${t("sales.statusSold", { defaultValue: "Sold" })} (${kpis.soldCount})`;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  active
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("sales.searchPlaceholder", {
              defaultValue: "Search by item name, container, or URL...",
            })}
            className="h-9 pl-9 pr-8 text-xs rounded-xl border-slate-200 bg-slate-50/70 focus:bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Items List */}
      {filteredSalesItems.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center space-y-3 shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-slate-900">
            {t("sales.emptyTitle", { defaultValue: "No items in your sales list yet" })}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {t("sales.emptySubtitle", {
              defaultValue:
                "You can mark any item for sale when adding or editing it inside a container, or pick an existing item below.",
            })}
          </p>
          <Button
            size="sm"
            onClick={() => setIsAddFromInventoryOpen(true)}
            className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-brand-400" />
            <span>{t("sales.addItemToSales", { defaultValue: "List Item for Sale" })}</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSalesItems.map((item) => {
            const st = normalizeSaleStatus(item.sale_status);
            const isSold = st === "sold";
            const price = parseSalePrice(item.sale_price, item.value);
            const qty = Math.max(1, Number(item.quantity ?? item.cuantity ?? 1) || 1);
            const bin = binsMap[item.binId];
            const cleanUrl = normalizeSaleUrl(item.sale_url);
            const storeLabel = getSaleStoreLabel(cleanUrl);

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs flex flex-col justify-between"
              >
                <div>
                  {/* Image & Status Banner */}
                  <div className="relative h-44 bg-slate-100 border-b border-slate-100">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-[11px] text-slate-400 mt-1">
                          {t("containers.image", { defaultValue: "No photo" })}
                        </span>
                      </div>
                    )}

                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-xs ${
                          isSold
                            ? "bg-emerald-600 text-white"
                            : "bg-amber-500 text-slate-950"
                        }`}
                      >
                        {isSold ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isSold
                            ? t("sales.statusSold", { defaultValue: "Sold" })
                            : t("sales.statusForSale", { defaultValue: "For Sale" })}
                        </span>
                      </span>
                    </div>

                    <div className="absolute top-2.5 right-2.5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-900/90 text-white font-mono text-xs font-bold shadow-xs">
                        ${price.toFixed(2)} USD
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                        {item.name}
                      </h3>
                      <span className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                        x{qty}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-500 line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    {/* Container link */}
                    {bin && (
                      <button
                        type="button"
                        onClick={() => navigate(`/bin-details/${bin.id}`)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/60 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <Box className="w-3.5 h-3.5" />
                        <span>{bin.name}</span>
                      </button>
                    )}

                    {/* Listing URL */}
                    {cleanUrl ? (
                      <a
                        href={cleanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50/70 hover:bg-blue-50 border border-blue-200/70 text-blue-700 text-xs font-semibold transition-colors"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {t("sales.viewOnStore", {
                              store: storeLabel,
                              defaultValue: `View listing on ${storeLabel}`,
                            })}
                          </span>
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        {t("sales.noListingUrl", {
                          defaultValue: "No listing URL added yet",
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="p-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
                  <Button
                    type="button"
                    size="sm"
                    variant={isSold ? "outline" : "default"}
                    onClick={() => handleToggleSoldStatus(item)}
                    className={`h-8 px-3 rounded-xl text-xs font-bold flex-1 flex items-center justify-center gap-1.5 ${
                      isSold
                        ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {isSold
                        ? t("sales.markForSaleBtn", { defaultValue: "Mark For Sale" })
                        : t("sales.markSoldBtn", { defaultValue: "Mark as Sold" })}
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(item)}
                    className="h-8 w-8 p-0 rounded-xl border-slate-200 text-slate-600"
                    title={t("sales.editListing", { defaultValue: "Edit sale listing" })}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveFromSales(item)}
                    className="h-8 w-8 p-0 rounded-xl border-slate-200 text-red-600 hover:bg-red-50"
                    title={t("sales.removeFromSales", {
                      defaultValue: "Remove from sales list",
                    })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Sale Modal */}
      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
      >
        <DialogContent className="max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-brand-600" />
              <span>
                {t("sales.editListing", { defaultValue: "Edit Sale Listing" })}
              </span>
            </DialogTitle>
          </DialogHeader>

          {editingItem && (
            <div className="space-y-4 pt-2">
              <div>
                <p className="text-xs font-bold text-slate-900">{editingItem.name}</p>
                {binsMap[editingItem.binId] && (
                  <p className="text-[11px] text-slate-500">
                    {binsMap[editingItem.binId].name}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {t("sales.statusLabel", { defaultValue: "Sale Status" })}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditSaleStatus("for_sale")}
                    className={`h-9 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      editSaleStatus === "for_sale"
                        ? "border-amber-500 bg-amber-50 text-amber-900"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{t("sales.statusForSale", { defaultValue: "For Sale" })}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditSaleStatus("sold")}
                    className={`h-9 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      editSaleStatus === "sold"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t("sales.statusSold", { defaultValue: "Sold" })}</span>
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {t("sales.priceLabel", { defaultValue: "Sale Price ($ USD)" })}
                </Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editSalePrice}
                    onChange={(e) => setEditSalePrice(e.target.value)}
                    placeholder="0.00"
                    className="h-9 pl-8 text-xs rounded-xl border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {t("sales.urlLabel", {
                    defaultValue: "Listing URL (eBay, Amazon, Marketplace...)",
                  })}
                </Label>
                <Input
                  type="url"
                  value={editSaleUrl}
                  onChange={(e) => setEditSaleUrl(e.target.value)}
                  placeholder={t("sales.urlPlaceholder", {
                    defaultValue: "https://www.ebay.com/itm/...",
                  })}
                  className="h-9 text-xs rounded-xl border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingItem(null)}
                  className="h-9 rounded-xl text-xs border-slate-200"
                >
                  {t("actions.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving}
                  onClick={handleSaveEdit}
                  className="h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                >
                  {isSaving
                    ? t("containers.saving", { defaultValue: "Saving..." })
                    : t("actions.save", { defaultValue: "Save" })}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Existing Inventory Item to Sales Modal */}
      <Dialog
        open={isAddFromInventoryOpen}
        onOpenChange={setIsAddFromInventoryOpen}
      >
        <DialogContent className="max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-brand-600" />
              <span>
                {t("sales.addItemToSales", { defaultValue: "List Item for Sale" })}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold text-slate-700 block mb-1.5">
                {t("sales.selectItemLabel", {
                  defaultValue: "Select an item from your containers",
                })}
              </Label>
              <Input
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                placeholder={t("sales.searchInventoryPlaceholder", {
                  defaultValue: "Filter items by name or container...",
                })}
                className="h-8 text-xs rounded-xl border-slate-200 mb-2"
              />
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {candidateItems.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400 text-center">
                    {t("sales.noCandidateItems", {
                      defaultValue: "No available items found",
                    })}
                  </p>
                ) : (
                  candidateItems.map((it) => {
                    const selected = selectedCandidateId === it.id;
                    const binName = binsMap[it.binId]?.name || "";
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          setSelectedCandidateId(it.id);
                          setAddSalePrice(
                            it.value && it.value !== "0" ? String(it.value) : ""
                          );
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                          selected
                            ? "bg-amber-50 text-slate-900 font-bold"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span className="truncate">
                          {it.name}
                          {binName ? (
                            <span className="text-[10px] text-slate-400 ml-1.5">
                              ({binName})
                            </span>
                          ) : null}
                        </span>
                        {it.value && Number(it.value) > 0 && (
                          <span className="font-mono text-[11px] text-slate-500 shrink-0">
                            ${Number(it.value).toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {t("sales.priceLabel", { defaultValue: "Sale Price ($ USD)" })}
                </Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={addSalePrice}
                    onChange={(e) => setAddSalePrice(e.target.value)}
                    placeholder="0.00"
                    className="h-9 pl-8 text-xs rounded-xl border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {t("sales.statusLabel", { defaultValue: "Sale Status" })}
                </Label>
                <select
                  value={addSaleStatus}
                  onChange={(e) =>
                    setAddSaleStatus(e.target.value === "sold" ? "sold" : "for_sale")
                  }
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800"
                >
                  <option value="for_sale">
                    {t("sales.statusForSale", { defaultValue: "For Sale" })}
                  </option>
                  <option value="sold">
                    {t("sales.statusSold", { defaultValue: "Sold" })}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 block mb-1.5">
                {t("sales.urlLabel", {
                  defaultValue: "Listing URL (eBay, Amazon, Marketplace...)",
                })}
              </Label>
              <Input
                type="url"
                value={addSaleUrl}
                onChange={(e) => setAddSaleUrl(e.target.value)}
                placeholder={t("sales.urlPlaceholder", {
                  defaultValue: "https://www.ebay.com/itm/...",
                })}
                className="h-9 text-xs rounded-xl border-slate-200"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddFromInventoryOpen(false)}
                className="h-9 rounded-xl text-xs border-slate-200"
              >
                {t("actions.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedCandidateId || isSaving}
                onClick={handleAddFromInventory}
                className="h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                {isSaving
                  ? t("containers.saving", { defaultValue: "Saving..." })
                  : t("sales.addToSalesBtn", { defaultValue: "Add to Sales List" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

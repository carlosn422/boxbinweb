import { copilotText as ct } from '@/lib/copilotI18n';
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Package,
  MapPin,
  X,
  ChevronLeft,
  ChevronRight,
  Grid,
  List,
  ArrowUpRight,
  ScanLine,
  Building2,
  Plus,
  TrendingUp,
  Filter,
  RefreshCw,
  QrCode,
  Layers,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { AddBinModal, type BinData } from "@/components/layout/AddBin";
import { toast } from "sonner";
import { getStripePlanById } from "@/lib/stripe";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";
import { openBinCopilot } from "@/services/boxbinCopilotService";

const ITEMS_PER_PAGE = 12;

interface Bin {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  qrGuid: string;
  qrcodeId?: string;
  itemCount?: number;
  lastUpdated?: string;
  updatedAt?: string;
  location?: {
    id: string;
    name: string;
  };
}

interface Location {
  id: string;
  name: string;
  description?: string;
  type?: string;
  binCount?: number;
  itemCount?: number;
}

interface PaginationState {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  lastVisible: any;
  firstVisible: any;
  totalCount: number;
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: ModalType;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    type: "info",
    message: "",
  });

  const openModal = (type: ModalType, message: string, title?: string) => {
    setModalState({
      isOpen: true,
      type,
      message,
      title,
    });
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  // Auth & impersonation
  const { currentUser } = useAuth();
  const [userImpersonated, setUserImpersonated] = useState<any>(() =>
    JSON.parse(localStorage.getItem("impersonatedUser") || "null")
  );
  const effectiveUserId = userImpersonated?.ownerUserId || currentUser?.uid;

  const [subscription, setSubscription] = useState<any | null>(null);

  const fetchSubscription = async () => {
    if (!currentUser?.uid) return;

    try {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("userId", effectiveUserId)
        .limit(1);

      if (subs && subs.length > 0) {
        const sub = subs[0];
        if (sub.planId) {
          const stripePlan = await getStripePlanById(sub.planId);

          const fullSubscription = {
            ...sub,
            plan: stripePlan?.product?.name ?? "Unknown Plan",
            price: (stripePlan?.unit_amount ?? 0) / 100,
            interval: stripePlan?.recurring?.interval ?? "month",
            metadata: stripePlan?.metadata ?? {},
          };

          setSubscription(fullSubscription);
        } else {
          setSubscription(sub);
        }
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
    }
  };

  // UI state
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"bins" | "locations">("bins");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Bins state
  const [filteredBins, setFilteredBins] = useState<Bin[]>([]);
  const [searchTextBins, setSearchTextBins] = useState("");
  const [binsPagination, setBinsPagination] = useState<PaginationState>({
    currentPage: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    lastVisible: null,
    firstVisible: null,
    totalCount: 0,
  });

  // Locations state
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([]);
  const [searchTextLocations, setSearchTextLocations] = useState("");
  const [locationsPagination, setLocationsPagination] =
    useState<PaginationState>({
      currentPage: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      lastVisible: null,
      firstVisible: null,
      totalCount: 0,
    });

  // Filter state
  const [filterLocation, setFilterLocation] = useState<Location | null>(null);

  // Stats state
  const [stats, setStats] = useState({
    totalBins: 0,
    totalLocations: 0,
    totalItems: 0,
    recentActivity: 0,
  });

  const normalizeText = (text: any) =>
    (text || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-\u036f]/g, "");

  // --- FETCH FUNCTIONS using effectiveUserId ---
  const fetchBins = async (
    page: number = 1,
    searchTerm: string = "",
    __isNextPage: boolean = false,
    selectedLocation: Location | null = null
  ) => {
    if (!effectiveUserId) return;
    setLoading(true);

    try {
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: rawBins, error } = await supabase
        .from("bins")
        .select("*")
        .eq("userId", effectiveUserId)
        .order("createdAt", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const binsData = (rawBins || []) as Bin[];

      const qrGuids = binsData.map((b) => b.qrGuid).filter(Boolean) as string[];
      let qrMap = new Map<string, string>();
      if (qrGuids.length > 0) {
        const { data: qrs } = await supabase
          .from("qrcodes")
          .select("guid, qrcodeId")
          .in("guid", qrGuids);
        if (qrs) {
          qrMap = new Map(qrs.map((q: any) => [q.guid, q.qrcodeId]));
        }
      }

      const binsWithQRCodes = binsData.map((bin) => {
        if (!bin.qrGuid || !qrMap.has(bin.qrGuid)) return bin;
        return { ...bin, qrcodeId: qrMap.get(bin.qrGuid) };
      });

      const normalizedSearch = normalizeText(searchTerm);

      const currentLocFilter =
        selectedLocation !== undefined ? selectedLocation : filterLocation;

      const filtered = binsWithQRCodes.filter((bin) => {
        const matchesSearch = searchTerm
          ? [bin.name, bin.description, bin.qrcodeId].some((field) =>
            normalizeText(field).includes(normalizedSearch)
          )
          : true;

        const matchesLocation = currentLocFilter
          ? bin.location?.id === currentLocFilter.id
          : true;

        return matchesSearch && matchesLocation;
      });

      setFilteredBins(filtered);

      setBinsPagination({
        currentPage: page,
        hasNextPage: binsData.length === ITEMS_PER_PAGE,
        hasPreviousPage: page > 1,
        lastVisible: null,
        firstVisible: null,
        totalCount: filtered.length,
      });
    } catch (error) {
      console.error("Error fetching bins:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async (
    page: number = 1,
    searchTerm: string = "",
    _isNextPage: boolean = false
  ) => {
    if (!effectiveUserId) return;
    setLoading(true);

    try {
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: rawLocs, error } = await supabase
        .from("locations")
        .select("*")
        .eq("userId", effectiveUserId)
        .order("createdAt", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const locData = (rawLocs || []) as Location[];

      const filtered = searchTerm
        ? locData.filter((loc) =>
          normalizeText(loc.name).includes(normalizeText(searchTerm))
        )
        : locData;
      setFilteredLocations(filtered);

      setLocationsPagination({
        currentPage: page,
        hasNextPage: locData.length === ITEMS_PER_PAGE,
        hasPreviousPage: page > 1,
        lastVisible: null,
        firstVisible: null,
        totalCount: filtered.length,
      });
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!effectiveUserId) return;

    try {
      await fetchSubscription();
      const [binsCount, itemsCount, locCount] = await Promise.all([
        supabase.from("bins").select("*", { count: "exact", head: true }).eq("userId", effectiveUserId),
        supabase.from("items").select("*", { count: "exact", head: true }).eq("userId", effectiveUserId),
        supabase.from("locations").select("*", { count: "exact", head: true }).eq("userId", effectiveUserId),
      ]);

      setStats({
        totalBins: binsCount.count ?? 0,
        totalItems: itemsCount.count ?? 0,
        totalLocations: locCount.count ?? 0,
        recentActivity: 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  useEffect(() => {
    const refresh = () => { void fetchBins(); void fetchLocations(); void fetchStats(); };
    window.addEventListener("boxbin-inventory-changed", refresh);
    return () => window.removeEventListener("boxbin-inventory-changed", refresh);
  }, [effectiveUserId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      activeTab === "bins"
        ? fetchBins(1, searchTextBins, false, filterLocation)
        : fetchLocations(1, searchTextLocations),
      fetchStats(),
    ]);
    setIsRefreshing(false);
  };

  // --- EFFECTS ---
  useEffect(() => {
    if (activeTab === "bins") {
      fetchBins(1, searchTextBins, false, filterLocation);
    } else {
      fetchLocations(1, searchTextLocations);
    }
    fetchStats();
  }, [activeTab, effectiveUserId, filterLocation]);

  useEffect(() => {
    if (activeTab === "bins") {
      const timer = setTimeout(() => {
        fetchBins(1, searchTextBins, false, filterLocation);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchTextBins, activeTab, effectiveUserId, filterLocation]);

  useEffect(() => {
    if (activeTab === "locations") {
      const timer = setTimeout(
        () => fetchLocations(1, searchTextLocations),
        300
      );
      return () => clearTimeout(timer);
    }
  }, [searchTextLocations, activeTab, effectiveUserId]);

  const handleLocationFilter = (location: Location) => {
    setActiveTab("bins");
    setFilterLocation(location);
    fetchBins(1, searchTextBins, false, location);
  };

  const clearLocationFilter = () => {
    setFilterLocation(null);
    fetchBins(1, searchTextBins, false, null);
  };

  const clearImpersonation = () => {
    localStorage.removeItem("impersonatedUser");
    setUserImpersonated(null);
  };

  const currentData = activeTab === "bins" ? filteredBins : filteredLocations;
  const currentSearchText =
    activeTab === "bins" ? searchTextBins : searchTextLocations;
  const setCurrentSearchText =
    activeTab === "bins" ? setSearchTextBins : setSearchTextLocations;

  const [isAddBinModalOpen, setIsAddBinModalOpen] = useState<boolean>(false);

  const handleAddBin = async (binData: BinData): Promise<void> => {
    try {
      if (!binData.name?.trim()) {
        throw new Error("Name is required");
      }

      const newBin = {
        ...binData,
        createdAt: new Date().toISOString(),
        userId: effectiveUserId,
        location: binData?.location ?? null,
      };

      const { data: inserted, error: insErr } = await supabase
        .from("bins")
        .insert(newBin)
        .select()
        .single();

      if (insErr) throw insErr;
      console.log("Bin created with ID:", inserted?.id);

      openModal("success", "Container created successfully!", "");

      await fetchBins();
      fetchStats();
    } catch (error: any) {
      console.error("Error creating bin:", error);
      toast.error(error.message || "Error creating bin");
    }
  };

  // Existing inventory content, with the reference palette and surfaces.
  const renderBinCard = (bin: Bin) => (
    <div
      key={bin.id}
      className="inventory-card group"
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
      onClick={() => navigate(`/bin-details/${bin.id}`)}
    >
      {/* Top Header Row */}
      <div className="inventory-card-top">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="inventory-card-icon">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="inventory-card-title">
              {bin.name}
            </h3>
            {bin.location?.name && (
              <span className="inline-flex items-center text-[11px] text-slate-400 truncate mt-0.5">
                <MapPin className="w-2.5 h-2.5 mr-1 shrink-0" />
                <span className="truncate">{bin.location.name}</span>
              </span>
            )}
          </div>
        </div>

        {/* QR Badge / Icon */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {bin.qrcodeId ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono text-[10px] font-semibold">
              <ScanLine className="w-2.5 h-2.5" />
              <span>{bin.qrcodeId}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-mono text-[10px]">
              <QrCode className="w-2.5 h-2.5" />
              <span>No QR</span>
            </span>
          )}
          <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 transition-colors" />
        </div>
      </div>

      {/* Description */}
      <div className="inventory-card-description">
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {bin.description || (
            <span className="text-slate-300 italic">No description</span>
          )}
        </p>
      </div>

      {/* Footer Info Row */}
      <div className="inventory-card-footer">
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <Layers className="w-3 h-3 text-slate-400" />
          <span>{bin.itemCount ?? 0} items</span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">Details →</span>
      </div>
    </div>
  );

  const renderLocationCard = (location: Location) => (
    <div
      key={location.id}
      className="inventory-card group"
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
      onClick={() => handleLocationFilter(location)}
    >
      {/* Top Header Row */}
      <div className="inventory-card-top">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="inventory-card-icon">
            {location.type === "warehouse" ? (
              <Building2 className="w-4 h-4" />
            ) : (
              <MapPin className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="inventory-card-title">
              {location.name}
            </h3>
            <span className="text-[11px] text-slate-400">Location</span>
          </div>
        </div>

        <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 transition-colors shrink-0" />
      </div>

      {/* Description */}
      <div className="inventory-card-description">
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {location.description || (
            <span className="text-slate-300 italic">No description</span>
          )}
        </p>
      </div>

      {/* Footer Metrics */}
      <div className="inventory-card-footer">
        <div className="flex items-center gap-3">
          <span className="text-slate-700 font-medium">
            <strong>{location.binCount ?? 0}</strong> Bins
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-700 font-medium">
            <strong>{location.itemCount ?? 0}</strong> Items
          </span>
        </div>
        <span className="text-[10px] text-blue-600 font-semibold">Filter →</span>
      </div>
    </div>
  );

  const renderListView = (items: any[], type: "bin" | "location") => {
    return (
      <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {items.map((item: any) => (
          <div
            key={item.id}
            className="group flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer"
            onClick={() =>
              type === "bin"
                ? navigate(`/bin-details/${item.id}`)
                : handleLocationFilter(item)
            }
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  type === "bin"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                {type === "bin" ? (
                  <Package className="w-3.5 h-3.5" />
                ) : (
                  <MapPin className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate text-xs">
                    {item.name}
                  </span>
                  {type === "bin" && item.qrcodeId && (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200/70 font-mono text-[10px] h-4 px-1"
                    >
                      {item.qrcodeId}
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-[11px] text-slate-400 truncate max-w-sm">
                    {item.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0 text-xs">
              {type === "bin" && item.location?.name && (
                <span className="text-[11px] text-slate-400 hidden sm:inline truncate max-w-[120px]">
                  {item.location.name}
                </span>
              )}
              <span className="font-semibold text-slate-700 min-w-[70px] text-right">
                {type === "bin"
                  ? `${item?.itemCount ?? 0} items`
                  : `${item?.binCount ?? 0} bins`}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 transition-colors" />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="inventory-home">
      {/* Impersonation Banner */}
      {userImpersonated && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-1.5">
          <div className="container mx-auto max-w-7xl flex items-center justify-between text-xs text-amber-900">
            <span>
              Impersonating: <strong>{userImpersonated?.ownerUsername}</strong>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={clearImpersonation}
              className="h-6 px-2 bg-white border-amber-300 text-amber-800 text-[11px]"
            >
              {t("dashboard.stopImpersonation")}
            </Button>
          </div>
        </div>
      )}

      <div className="inventory-content">
        {/* Compact Top Bar */}
        <div className="inventory-header">
          <div className="flex items-center space-x-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="inventory-title">
                  {t("dashboard.title")}
                </h1>
                {subscription?.plan && subscription.plan !== "Unknown Plan" && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">
                    {subscription.plan}
                  </span>
                )}
              </div>
              <p className="inventory-subtitle">
                {t("dashboard.subtitle")}
              </p>
            </div>
          </div>

          <div className="inventory-header-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBinCopilot("", "")}
              className="inventory-copilot-action"
              title={ct('askCopilot')}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              <span className="hidden sm:inline">{ct('aiCopilot')}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inventory-refresh"
              title="Refresh inventory data"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isRefreshing ? "animate-spin text-blue-600" : "text-slate-500"
                }`}
              />
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>

            <Button
              onClick={() => setIsAddBinModalOpen(true)}
              className="inventory-new"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("dashboard.new")}</span>
            </Button>
          </div>
        </div>

        {/* Space-Optimized KPI Stat Ribbon (Compact 62px height!) */}
        <div className="inventory-stats">
          {/* Card 1: Total Bins */}
          <div className="inventory-stat-card">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <Package className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("dashboard.totalBins")}
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {stats.totalBins}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              In stock
            </span>
          </div>

          {/* Card 2: Locations */}
          <div className="inventory-stat-card">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <MapPin className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("dashboard.locations")}
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {stats.totalLocations}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              Warehouses
            </span>
          </div>

          {/* Card 3: Total Items */}
          <div className="inventory-stat-card">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("dashboard.totalItems")}
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {stats.totalItems}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              Cataloged
            </span>
          </div>
        </div>

        {/* Integrated Unified Controls Row (Tabs + Search + Filter + View Toggle) */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "bins" | "locations")}
          className="inventory-tabs"
        >
          <div className="inventory-controls">
            {/* Segmented Pill Tabs */}
            <TabsList className="inventory-tab-list">
              <TabsTrigger
                value="bins"
                className="flex items-center justify-center gap-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs rounded-md transition-all h-7 px-2"
              >
                <Package className="w-3.5 h-3.5" />
                <span>
                  {t("dashboard.tabs.bins", { count: stats.totalBins })}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="locations"
                className="flex items-center justify-center gap-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs rounded-md transition-all h-7 px-2"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>
                  {t("dashboard.tabs.locations", {
                    count: stats.totalLocations,
                  })}
                </span>
              </TabsTrigger>
            </TabsList>

            {/* Filter location tag if active */}
            {filterLocation && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                <Filter className="w-3 h-3 text-blue-600" />
                <span className="text-[11px] text-slate-500">Location:</span>
                <span className="font-semibold text-blue-800 text-[11px]">
                  {filterLocation.name}
                </span>
                <button
                  onClick={clearLocationFilter}
                  className="ml-1 text-blue-500 hover:text-blue-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Search Box & View Mode Toggle */}
            <div className="inventory-search-and-view">
              <div className="inventory-search">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <Input
                  aria-label={t(`search.${activeTab}Placeholder`)}
                  value={currentSearchText}
                  onChange={(e) => setCurrentSearchText(e.target.value)}
                  placeholder={t(`search.${activeTab}Placeholder`)}
                  className="inventory-search-input"
                />
                {currentSearchText && (
                  <button
                    onClick={() => setCurrentSearchText("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* View Mode Toggle */}
              <div className="inventory-view-switch">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className={`h-7 w-7 p-0 rounded-md ${
                    viewMode === "grid"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-400 hover:text-slate-700"
                  }`}
                  aria-pressed={viewMode === "grid"}
                  title="Grid view"
                >
                  <Grid className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className={`h-7 w-7 p-0 rounded-md ${
                    viewMode === "list"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-400 hover:text-slate-700"
                  }`}
                  aria-pressed={viewMode === "list"}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Bins Tab Content */}
          <TabsContent value="bins" className="space-y-3.5 m-0">
            {loading && filteredBins.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-2.5">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-slate-800" />
                <p className="text-xs text-slate-500 font-medium">
                  {t("dashboard.loading")}
                </p>
              </div>
            ) : filteredBins.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center max-w-md mx-auto">
                <div className="w-10 h-10 mx-auto mb-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  {searchTextBins ? t("bins.emptySearch") : t("bins.empty")}
                </h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  {searchTextBins
                    ? t("bins.emptySearchHint")
                    : t("bins.emptyHint")}
                </p>
                {!searchTextBins && (
                  <Button
                    onClick={() => setIsAddBinModalOpen(true)}
                    className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    <span>{t("dashboard.new")}</span>
                  </Button>
                )}
              </div>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="inventory-grid">
                    {filteredBins.map(renderBinCard)}
                  </div>
                ) : (
                  renderListView(filteredBins, "bin")
                )}
              </>
            )}
          </TabsContent>

          {/* Locations Tab Content */}
          <TabsContent value="locations" className="space-y-3.5 m-0">
            {loading && filteredLocations.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-2.5">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-slate-800" />
                <p className="text-xs text-slate-500 font-medium">
                  {t("dashboard.loading")}
                </p>
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center max-w-md mx-auto">
                <div className="w-10 h-10 mx-auto mb-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  {searchTextLocations
                    ? t("locations.emptySearch")
                    : t("locations.empty")}
                </h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  {searchTextLocations
                    ? t("locations.emptySearchHint")
                    : t("locations.hintEmpty")}
                </p>
                {!searchTextLocations && (
                  <Button
                    onClick={() => navigate("/locations")}
                    className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    <span>{t("locations.createFirst")}</span>
                  </Button>
                )}
              </div>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="inventory-grid">
                    {filteredLocations.map(renderLocationCard)}
                  </div>
                ) : (
                  renderListView(filteredLocations, "location")
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Compact Pagination Bar */}
        {currentData.length > 0 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-200/70 text-xs text-slate-500">
            <p className="text-[11px]">
              {t("pagination.showing", {
                count: currentData.length,
                type: activeTab,
              })}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  loading ||
                  !(activeTab === "bins"
                    ? binsPagination.hasPreviousPage
                    : locationsPagination.hasPreviousPage)
                }
                onClick={() => {
                  if (activeTab === "bins") {
                    fetchBins(
                      Math.max(1, binsPagination.currentPage - 1),
                      searchTextBins,
                      false,
                      filterLocation
                    );
                  } else {
                    fetchLocations(
                      Math.max(1, locationsPagination.currentPage - 1),
                      searchTextLocations,
                      false
                    );
                  }
                }}
                className="h-7 px-2.5 bg-white hover:bg-slate-50 border-slate-200 rounded-lg text-[11px]"
              >
                <ChevronLeft className="w-3 h-3 mr-1" />
                <span>{t("pagination.previous")}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  loading ||
                  !(activeTab === "bins"
                    ? binsPagination.hasNextPage
                    : locationsPagination.hasNextPage)
                }
                onClick={() => {
                  if (activeTab === "bins") {
                    fetchBins(
                      binsPagination.currentPage + 1,
                      searchTextBins,
                      true,
                      filterLocation
                    );
                  } else {
                    fetchLocations(
                      locationsPagination.currentPage + 1,
                      searchTextLocations,
                      true
                    );
                  }
                }}
                className="h-7 px-2.5 bg-white hover:bg-slate-50 border-slate-200 rounded-lg text-[11px]"
              >
                <span>{t("pagination.next")}</span>
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AddBinModal
        isOpen={isAddBinModalOpen}
        onClose={() => setIsAddBinModalOpen(false)}
        onSubmit={handleAddBin}
        userId={effectiveUserId}
      />

      <ModalMessage
        isOpen={modalState.isOpen}
        onClose={closeModal}
        type={modalState.type}
        message={modalState.message}
        title={modalState.title}
      />
    </div>
  );
}

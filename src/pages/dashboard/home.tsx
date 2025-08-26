import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Clock,
  Building2,
  Plus,
  TrendingUp,
  Filter,
} from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { AddBinModal, type BinData } from "@/components/layout/AddBin";
import { toast } from "sonner";
import { getStripePlanById } from "@/lib/stripe";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";

const ITEMS_PER_PAGE = 12;

interface Bin {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  qrGuid: string;
  qrcodeId?: string;
  location?: {
    id: string;
    name: string;
  };
}

/*interface Item {
  id: string;
  name: string;
  description: string;
  tags: string[];
  binId: string;
  createdAt: string;
}
*/
interface Location {
  id: string;
  name: string;
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
      const q = query(
        collection(db, "subscriptions"),
        where("userId", "==", effectiveUserId)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const sub = querySnapshot.docs[0].data();

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
      } else {
        console.log("❌ No se encontró suscripción para el usuario.");
      }
    } catch (error) {
      console.error("🔥 Error al obtener suscripción:", error);
    }
  };

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"bins" | "locations" | any>(
    "bins"
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Bins state
  //const [bins, setBins] = useState<Bin[]>([]);
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
  //const [locations, setLocations] = useState<Location[]>([]);
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
    isNextPage: boolean = false,
    filterLocation: Location | null = null
  ) => {
    if (!effectiveUserId) return;
    setLoading(true);

    try {
      let binsQuery = query(
        collection(db, "bins"),
        where("userId", "==", effectiveUserId),
        orderBy("createdAt", "desc"),
        limit(ITEMS_PER_PAGE)
      );

      if (isNextPage && binsPagination.lastVisible) {
        binsQuery = query(binsQuery, startAfter(binsPagination.lastVisible));
      }

      const snapshot = await getDocs(binsQuery);
      const binsData = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as Bin)
      );

      const binsWithQRCodes = await Promise.all(
        binsData.map(async (bin) => {
          if (!bin.qrGuid) return bin;
          const qrSnap = await getDocs(
            query(collection(db, "qrcodes"), where("guid", "==", bin.qrGuid))
          );
          return qrSnap.empty
            ? bin
            : { ...bin, qrcodeId: qrSnap.docs[0].data().qrcodeId };
        })
      );

      //setBins(binsWithQRCodes);

      const normalizedSearch = normalizeText(searchTerm);

      const filtered = binsWithQRCodes.filter((bin) => {
        const matchesSearch = searchTerm
          ? [bin.name, bin.description, bin.qrcodeId].some((field) =>
              normalizeText(field).includes(normalizedSearch)
            )
          : true;

        const matchesLocation = filterLocation
          ? bin.location?.id === filterLocation.id
          : true;

        return matchesSearch && matchesLocation;
      });

      setFilteredBins(filtered);

      setBinsPagination({
        currentPage: page,
        hasNextPage: snapshot.docs.length === ITEMS_PER_PAGE,
        hasPreviousPage: page > 1,
        lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
        firstVisible: snapshot.docs[0] || null,
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
    isNextPage: boolean = false
  ) => {
    if (!effectiveUserId) return;
    setLoading(true);

    try {
      let locQuery = query(
        collection(db, "locations"),
        where("userId", "==", effectiveUserId),
        orderBy("createdAt", "desc"),
        limit(ITEMS_PER_PAGE)
      );

      if (isNextPage && locationsPagination.lastVisible) {
        locQuery = query(locQuery, startAfter(locationsPagination.lastVisible));
      }

      const snapshot = await getDocs(locQuery);
      const locData = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Location)
      );

      //setLocations(locData);
      const filtered = searchTerm
        ? locData.filter((loc) =>
            normalizeText(loc.name).includes(normalizeText(searchTerm))
          )
        : locData;
      setFilteredLocations(filtered);

      setLocationsPagination({
        currentPage: page,
        hasNextPage: snapshot.docs.length === ITEMS_PER_PAGE,
        hasPreviousPage: page > 1,
        lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
        firstVisible: snapshot.docs[0] || null,
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
      const [binsSnap, itemsSnap, locSnap] = await Promise.all([
        getDocs(
          query(collection(db, "bins"), where("userId", "==", effectiveUserId))
        ),
        getDocs(
          query(collection(db, "items"), where("userId", "==", effectiveUserId))
        ),
        getDocs(
          query(
            collection(db, "locations"),
            where("userId", "==", effectiveUserId)
          )
        ),
      ]);

      setStats({
        totalBins: binsSnap.size,
        totalItems: itemsSnap.size,
        totalLocations: locSnap.size,
        recentActivity: 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  // --- EFFECTS ---
  // Initial and impersonation reload
  useEffect(() => {
    if (activeTab === "bins") {
      fetchBins(1, searchTextBins, false, filterLocation); // importante
    } else {
      fetchLocations();
    }
    fetchStats();
  }, [activeTab, effectiveUserId, filterLocation]);

  // Search effects
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
    setFilterLocation(location); // guarda la location seleccionada
    fetchBins(1, searchTextBins, false, location); // aplica el filtro
  };

  const clearLocationFilter = () => {
    setFilterLocation(null);
    fetchBins(1, searchTextBins);
  };

  const clearImpersonation = () => {
    localStorage.removeItem("impersonatedUser");
    setUserImpersonated(null);
  };

  const renderBinCard = (bin: any) => (
    <Card
      key={bin.id}
      className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-0 bg-white/70 backdrop-blur-sm hover:bg-white hover:-translate-y-1"
      onClick={() => navigate(`/bin-details/${bin.id}`)}
    >
      <CardContent className="p-6">
        {/* Header con QR Code */}
        <div className="flex items-start justify-between mb-4">
          {bin.qrcodeId && (
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-700 border-emerald-200 font-medium"
            >
              <ScanLine className="w-3 h-3 mr-1" />
              {bin.qrcodeId}
            </Badge>
          )}
          <ArrowUpRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Icono principal */}
        <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center group-hover:from-emerald-100 group-hover:to-emerald-200 transition-all duration-300">
          <Package className="w-7 h-7 text-slate-600 group-hover:text-emerald-600 transition-colors" />
        </div>

        {/* Contenido principal */}
        <div className="text-center mb-4">
          <h3 className="font-semibold text-slate-900 mb-2 truncate">
            {bin.name}
          </h3>
          {bin.description && (
            <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">
              {bin.description}
            </p>
          )}
        </div>

        {/* Footer con stats */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Package className="w-3 h-3" />
            <span>{bin.itemCount} items</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{bin.lastUpdated}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderLocationCard = (location: any) => (
    <Card
      key={location.id}
      className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-0 bg-white/70 backdrop-blur-sm hover:bg-white hover:-translate-y-1"
      onClick={() => handleLocationFilter(location)}
    >
      <CardContent className="p-6 relative">
        {/* Indicador de actividad */}
        {location.itemCount > 20 && (
          <div className="absolute top-3 right-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          </div>
        )}

        {/* Icono principal */}
        <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center group-hover:from-blue-200 group-hover:to-blue-300 transition-all duration-300">
          {location.type === "warehouse" ? (
            <Building2 className="w-7 h-7 text-blue-600 transition-colors" />
          ) : (
            <MapPin className="w-7 h-7 text-blue-600 transition-colors" />
          )}
        </div>

        {/* Contenido */}
        <div className="text-center mb-4">
          <h3 className="font-semibold text-slate-900 mb-2">{location.name}</h3>
          <p className="text-sm text-slate-500 mb-3">{location.description}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900">
              {location.binCount}
            </div>
            <div className="text-xs text-slate-500">Bins</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900">
              {location.itemCount}
            </div>
            <div className="text-xs text-slate-500">Items</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderListView = (items: any, type: any) => {
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <Card
            key={item.id}
            className="hover:shadow-md transition-all duration-200 cursor-pointer border-0 bg-white/70 backdrop-blur-sm hover:bg-white"
            onClick={() =>
              navigate(
                type === "bin"
                  ? `/bin-details/${item.id}`
                  : `/location-details/${item.id}`
              )
            }
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      type === "bin"
                        ? "bg-gradient-to-br from-slate-100 to-slate-200"
                        : "bg-gradient-to-br from-blue-100 to-blue-200"
                    }`}
                  >
                    {type === "bin" ? (
                      <Package className="w-5 h-5 text-slate-600" />
                    ) : (
                      <MapPin className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-slate-500 truncate max-w-md">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {type === "bin" && item.qrcodeId && (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-100 text-emerald-700"
                    >
                      {item?.qrcodeId ?? ""}
                    </Badge>
                  )}
                  <div className="text-right">
                    <div className="font-medium text-slate-900">
                      {type === "bin"
                        ? `${item?.itemCount ?? "0"} items`
                        : `${item.binCount} bins`}
                    </div>
                    {type === "bin" && (
                      <div className="text-xs text-slate-500">
                        {item.updatedAt} ago
                      </div>
                    )}
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
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
        location: binData?.location ?? "",
      };

      const docRef = await addDoc(collection(db, "bins"), newBin);
      console.log("Bin created with ID:", docRef.id);

      openModal("success", "Container created successfully!", "");

      await fetchBins();
    } catch (error: any) {
      console.error("Error creating bin:", error);
      toast.error(error);
    }
  };

  if (loading && currentData.length === 0) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-6 py-8">
          <div className="flex justify-center items-center min-h-96">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-200 border-t-emerald-600"></div>
              <p className="text-slate-600">{t("dashboard.loading")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 relative">
      {/* Impersonation Header */}
      {userImpersonated && (
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-6 py-2 max-w-7xl flex items-center justify-end space-x-4">
            <span className="text-sm text-gray-500">
              {t("dashboard.by")}{" "}
              <strong>{userImpersonated?.ownerUsername}</strong>
            </span>
            <button
              onClick={clearImpersonation}
              className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors duration-200"
            >
              {t("dashboard.stopImpersonation")}
            </button>
          </div>
        </div>
      )}
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header con estadísticas */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {t("dashboard.title")}
              </h1>
              <p className="text-gray-600">{t("dashboard.subtitle")}</p>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
            <Card className="group hover:shadow-lg transition-all duration-300 border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide">
                      {t("dashboard.totalBins")}
                    </p>
                    <p className="text-3xl font-bold text-gray-900">
                      {stats.totalBins}
                    </p>
                  </div>
                  <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Package className="w-7 h-7 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">
                      {t("dashboard.locations")}
                    </p>
                    <p className="text-3xl font-bold text-gray-900">
                      {stats.totalLocations}
                    </p>
                  </div>
                  <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <MapPin className="w-7 h-7 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border-0 shadow-sm bg-gradient-to-br from-purple-50 to-purple-100/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-purple-600 uppercase tracking-wide">
                      {t("dashboard.totalItems")}
                    </p>
                    <p className="text-3xl font-bold text-gray-900">
                      {stats.totalItems}
                    </p>
                  </div>
                  <div className="w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <TrendingUp className="w-7 h-7 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value)}
          className="space-y-8"
        >
          {/* Tab navigation y controles */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <TabsList className="grid w-96 grid-cols-2 h-12 bg-gray-100 p-1 rounded-xl">
              <TabsTrigger
                value="bins"
                className="flex items-center gap-3 font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
              >
                <Package className="w-5 h-5" />
                {t("dashboard.tabs.bins", { count: stats.totalBins })}
              </TabsTrigger>
              <TabsTrigger
                value="locations"
                className="flex items-center gap-3 font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
              >
                <MapPin className="w-5 h-5" />
                {t("dashboard.tabs.locations", { count: stats.totalLocations })}
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setViewMode(viewMode === "grid" ? "list" : "grid")
                }
                className="h-10 px-4 hover:bg-gray-50 transition-colors duration-200"
              >
                {viewMode === "grid" ? (
                  <List className="w-4 h-4 mr-2" />
                ) : (
                  <Grid className="w-4 h-4 mr-2" />
                )}
                {t(`view.${viewMode}`)}
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "row" }}>
            {/* Barra de búsqueda */}
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                value={currentSearchText}
                onChange={(e) => setCurrentSearchText(e.target.value)}
                placeholder={t(`search.${activeTab}Placeholder`)}
                className="pl-11 pr-12 h-11 bg-white border border-gray-200 focus:border-gray-300 focus:ring-2 focus:ring-gray-100 rounded-lg transition-all duration-200"
              />
              {currentSearchText && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentSearchText("")}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-9 w-9 p-0 hover:bg-gray-100 rounded-md"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {activeTab === 'bins' && stats.totalBins <= Number(subscription?.metadata?.locations) && (
              <button
                onClick={() => setIsAddBinModalOpen(true)}
                className="ml-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus size={20} />
                <span>Add New Container</span>
              </button>
            )}
          </div>

          {/* Filtro de ubicación */}
          {filterLocation && (
            <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 border-blue-100">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                      <Filter className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="font-semibold text-blue-900">
                        {t("dashboard.filteringByLocation")}
                      </span>
                      <span className="ml-2 text-blue-700 font-medium">
                        {filterLocation.name}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearLocationFilter}
                    className="hover:bg-blue-100 text-blue-600"
                  >
                    <X className="w-4 h-4 mr-2" />
                    {t("actions.clearFilter")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contenido de las tabs */}
          <TabsContent value="bins" className="space-y-6">
            {filteredBins.length === 0 ? (
              <Card className="border-2 border-dashed border-gray-200 bg-gray-50/50">
                <CardContent className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {searchTextBins ? t("bins.emptySearch") : t("bins.empty")}
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                    {searchTextBins
                      ? t("bins.emptySearchHint")
                      : t("bins.emptyHint")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredBins.map(renderBinCard)}
                  </div>
                ) : (
                  renderListView(filteredBins, "bin")
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="locations" className="space-y-6">
            {filteredLocations.length === 0 ? (
              <Card className="border-2 border-dashed border-gray-200 bg-gray-50/50">
                <CardContent className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <MapPin className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {searchTextLocations
                      ? t("locations.emptySearch")
                      : t("locations.empty")}
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                    {searchTextLocations
                      ? t("locations.emptySearchHint")
                      : t("locations.hintEmpty")}
                  </p>
                  {!searchTextLocations && (
                    <Button
                      onClick={() => navigate("/locations")}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t("locations.createFirst")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredLocations.map(renderLocationCard)}
                  </div>
                ) : (
                  renderListView(filteredLocations, "location")
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Paginación */}
        {currentData.length > 0 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              {t("pagination.showing", {
                count: currentData.length,
                type: activeTab,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                className="hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t("pagination.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                className="hover:bg-gray-50"
              >
                {t("pagination.next")}
                <ChevronRight className="w-4 h-4 ml-1" />
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

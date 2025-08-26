import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  MapPin,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Building,
  Calendar,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";
import { getStripePlanById } from "@/lib/stripe";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";

export const LocationsManager = () => {
  const { t } = useTranslation();
  // Estados principales
  const [locations, setLocations] = useState<any>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemAddress, setItemAddress] = useState("");
  const [itemDescription, setItemDescription] = useState("");

  const [editingId, setEditingId] = useState<any>(null);

  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [totalLocations, setTotalLocations] = useState(0);

  // Auth & impersonation
  const { currentUser } = useAuth();
  const [userImpersonated, setUserImpersonated] = useState<any>(() =>
    JSON.parse(localStorage.getItem("impersonatedUser") || "null")
  );
  const effectiveUserId = userImpersonated?.ownerUserId || currentUser?.uid;

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

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };
  
  // Estados para navegación de páginas
  const [pageSnapshots, setPageSnapshots] = useState(new Map());
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

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

  const clearImpersonation = () => {
    localStorage.removeItem("impersonatedUser");
    setUserImpersonated(null);
  };

  // Función para obtener el total de ubicaciones
  const getTotalLocations = async () => {
    if (!currentUser) return;

    try {
      await fetchSubscription();

      const q = query(
        collection(db, "locations"),
        where("userId", "==", effectiveUserId)
      );
      const snapshot = await getDocs(q);
      setTotalLocations(snapshot.size);
    } catch (error) {
      console.error("Error getting total locations:", error);
    }
  };

  // Función para cargar ubicaciones con paginación
  const loadLocations = async (page = 1, isRefresh = false) => {
    if (!currentUser) return;

    setPageLoading(true);

    try {
      const locationsRef = collection(db, "locations");
      let q;

      // Construir query base
      const baseQuery = [
        where("userId", "==", effectiveUserId),
        orderBy(sortBy, sortOrder === "asc" ? "asc" : "desc"),
        limit(itemsPerPage + 1), // +1 para determinar si hay siguiente página
      ];

      if (page === 1 || isRefresh) {
        // Primera página o refresh
        q = query(locationsRef, ...baseQuery);
        setPageSnapshots(new Map());
      } else {
        // Páginas siguientes
        const pageSnapshot = pageSnapshots.get(page - 1);
        if (pageSnapshot) {
          q = query(locationsRef, ...baseQuery, startAfter(pageSnapshot));
        } else {
          // Si no tenemos el snapshot, volvemos a la primera página
          q = query(locationsRef, ...baseQuery);
          setCurrentPage(1);
        }
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs;

      // Separar los documentos de la página actual y verificar si hay más
      const pageData = docs.slice(0, itemsPerPage);
      const hasMore = docs.length > itemsPerPage;

      const locationsData = pageData.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt:
          doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt),
      }));

      setLocations(locationsData);
      setHasNextPage(hasMore);
      setHasPrevPage(page > 1);

      // Guardar snapshots para navegación
      if (pageData.length > 0) {
        const newPageSnapshots = new Map(pageSnapshots);
        newPageSnapshots.set(page, pageData[pageData.length - 1]);
        setPageSnapshots(newPageSnapshots);

        //setLastVisible(pageData[pageData.length - 1]);
        //setFirstVisible(pageData[0]);
      }
    } catch (error) {
      console.error("Error loading locations:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Error loading the locations",
      });
    } finally {
      setPageLoading(false);
    }
  };

  // Función para filtrar ubicaciones localmente
  const getFilteredLocations = () => {
    if (!searchText.trim()) return locations;

    const searchTerm = searchText.toLowerCase();
    return locations.filter(
      (location: any) =>
        location.name.toLowerCase().includes(searchTerm) ||
        location.address?.toLowerCase().includes(searchTerm) ||
        location.description?.toLowerCase().includes(searchTerm)
    );
  };

  // Función para crear ubicación
  const handleSubmit = async () => {
    if (!itemName.trim() || !currentUser) return;
    // Verificar si ya alcanzó el límite
    if (totalLocations >= Number(subscription?.metadata?.locations)) {
      setModalState({
        isOpen: true,
        type: "error",
        message: `You have reached the limit of ${subscription?.metadata?.locations} locations for your plan.`,
      });
      return;
    }

    setOperationLoading(true);
    try {
      const data = {
        name: itemName.trim(),
        address: itemAddress.trim(),
        description: itemDescription.trim(),
        createdAt: serverTimestamp(),
        userId: effectiveUserId,
      };

      await addDoc(collection(db, "locations"), data);

      // Resetear formulario
      setItemName("");
      setItemAddress("");
      setItemDescription("");
      setIsModalVisible(false);

      setModalState({
        isOpen: true,
        type: "success",
        message: "Location created successfully",
      });

      // Recargar datos
      await loadLocations(1, true);
      await getTotalLocations();
    } catch (error) {
      console.error("Error creating location:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Error creating the location",
      });
    } finally {
      setOperationLoading(false);
    }
  };

  // Función para actualizar ubicación
  const handleUpdateSubmit = async () => {
    if (!itemName.trim() || !editingId || !currentUser) {
      console.log(itemName);
      console.log(editingId);
      console.log(currentUser);
      return;
    }

    setOperationLoading(true);
    try {
      const locationRef = doc(db, "locations", editingId);
      await updateDoc(locationRef, {
        name: itemName.trim(),
        address: itemAddress.trim(),
        description: itemDescription.trim(),
        updatedAt: serverTimestamp(),
      });

      // Resetear formulario
      setItemName("");
      setItemAddress("");
      setItemDescription("");
      setIsEditModalVisible(false);
      setEditingId(null);
      setSelectedLocation(null);

      setModalState({
        isOpen: true,
        type: "success",
        message: "Location updated successfully",
      });

      // Recargar datos
      await loadLocations(currentPage);
    } catch (error) {
      console.error("Error updating location:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Error updating the location",
      });
    } finally {
      setOperationLoading(false);
    }
  };

  // Función para eliminar ubicación
  const confirmDeleteLocation = async (locationId: string) => {
    if (!window.confirm(t("locations.confirmDelete"))) {
      return;
    }

    setOperationLoading(true);
    try {
      await deleteDoc(doc(db, "locations", locationId));

      setSelectedLocation(null);
      setModalState({
        isOpen: true,
        type: "success",
        message: "Location deleted successfully",
      });
      // Recargar datos
      await loadLocations(currentPage);
      await getTotalLocations();
    } catch (error) {
      console.error("Error deleting location:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Error deleting the location",
      });
    } finally {
      setOperationLoading(false);
    }
  };

  // Función para manejar selección de ubicación
  const handleLocationSelect = (location: any) => {
    setSelectedLocation(selectedLocation?.id === location.id ? null : location);
  };

  // Función para manejar edición
  const handleEditLocation = (locationId: string) => {
    const location = locations.find((l: any) => l.id === locationId);
    if (location) {
      setEditingId(locationId);
      setItemName(location.name);
      setItemAddress(location.address || "");
      setItemDescription(location.description || "");
      setIsEditModalVisible(true);
    }
  };

  // Función para resetear formulario
  const resetForm = () => {
    setItemName("");
    setItemAddress("");
    setItemDescription("");
    setEditingId(null);
  };

  // Función para formatear fecha
  const formatDate = (date: any) => {
    if (!date) return "";
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Función para navegar páginas
  const handlePageChange = (newPage: any) => {
    if (newPage !== currentPage && newPage > 0) {
      setCurrentPage(newPage);
      loadLocations(newPage);
    }
  };

  // Función para refrescar datos
  const handleRefresh = () => {
    setCurrentPage(1);
    loadLocations(1, true);
    getTotalLocations();
  };

  // Efectos
  useEffect(() => {
    if (currentUser) {
      loadLocations(1, true);
      getTotalLocations();
    }
  }, [currentUser, itemsPerPage, sortBy, sortOrder]);

  useEffect(() => {
    if (currentUser) {
      // Listener en tiempo real para cambios en la colección
      const q = query(
        collection(db, "locations"),
        where("userId", "==", effectiveUserId)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        setTotalLocations(snapshot.size);
      });

      return () => unsubscribe();
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          {t("locations.mustSignIn")}
        </Alert>
      </div>
    );
  }

  const filteredLocations = getFilteredLocations();
  const totalPages = Math.ceil(totalLocations / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
     
      {userImpersonated && (
        <div className="bg-gradient-to-r from-orange-50 to-red-50 border-b border-orange-200/50 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-3 max-w-7xl flex items-center justify-end space-x-4">
            <span className="text-sm text-orange-700 font-medium">
              {t("dashboard.by")}{" "}
              <strong className="text-orange-800">{userImpersonated?.ownerUsername}</strong>
            </span>
            <button
              onClick={clearImpersonation}
              className="px-4 py-1.5 bg-gradient-to-r from-red-100 to-red-200 text-red-700 rounded-full text-sm font-medium hover:from-red-200 hover:to-red-300 transition-all duration-200 shadow-sm border border-red-200"
            >
              {t("dashboard.stopImpersonation")}
            </button>
          </div>
        </div>
      )}
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="flex items-center gap-5 mb-4 sm:mb-0">
            <div className="relative group">
              <div className="absolute inset-0 bg-blue-400 rounded-2xl blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
              <div className="relative p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-xl">
                <Building className="h-8 w-8 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                {t("locations.title")}
              </h1>
              <p className="text-gray-600 mt-2 text-lg font-medium">{t("locations.subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={pageLoading}
              className="border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-200"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${pageLoading ? "animate-spin" : ""}`}
              />
              {t("locations.refresh")}
            </Button>
            <Badge 
              variant="outline" 
              className="px-3 py-1.5 bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200 text-slate-700 font-medium"
            >
              {totalLocations} {t("locations.count")}
            </Badge>
            {totalLocations <= Number(subscription?.metadata?.locations) && (
              <Button
                onClick={() => {
                  resetForm();
                  setIsModalVisible(true);
                }}
                className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 hover:from-blue-700 hover:via-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-300 border-0"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("locations.new")}
              </Button>
            )}
          </div>
        </div>

        {/* Filters and search */}
        <Card className="mb-6 shadow-sm border-0 bg-white">
          <CardContent className="p-0">
            <div className="flex items-center bg-gray-50 rounded-t-lg p-3 border-b">
              <Search className="h-4 w-4 text-gray-500 mr-2" />
              <Input
                placeholder={t("locations.searchPlaceholder")}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="border-0 bg-transparent focus:ring-0 h-8 text-sm flex-1"
              />
              {searchText && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-gray-200 rounded"
                  onClick={() => setSearchText("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="p-4 flex gap-3">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">
                    {t("locations.sort.name")}
                  </SelectItem>
                  <SelectItem value="createdAt">
                    {t("locations.sort.date")}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="w-32 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">
                    {t("locations.sort.asc")}
                  </SelectItem>
                  <SelectItem value="desc">
                    {t("locations.sort.desc")}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={itemsPerPage.toString()}
                onValueChange={(v) => setItemsPerPage(parseInt(v))}
              >
                <SelectTrigger className="w-20 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Loading state */}
        {pageLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
              <p className="text-gray-500 text-sm">{t("common.loading")}</p>
            </div>
          </div>
        )}

        {/* Content */}
        {!pageLoading && filteredLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="relative mb-8">
              <div className="w-32 h-32 bg-gradient-to-br from-blue-100 via-blue-200 to-blue-300 rounded-3xl flex items-center justify-center shadow-lg">
                <Building className="w-16 h-16 text-blue-600" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full shadow-md"></div>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-3">
              {searchText.trim()
                ? t("locations.emptySearch")
                : t("locations.empty")}
            </h2>
            <p className="text-gray-600 mb-8 text-center max-w-md leading-relaxed">
              {searchText.trim()
                ? t("locations.hintSearch")
                : t("locations.hintEmpty")}
            </p>
            {!searchText.trim() && (
              <Button
                onClick={() => {
                  resetForm();
                  setIsModalVisible(true);
                }}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("locations.createFirst")}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Locations grid */}
            <div className="space-y-4 mb-8">
              {filteredLocations.map((location: any) => (
                <Card
                  key={location.id}
                  className={`group cursor-pointer transition-all duration-200 hover:shadow-md border ${
                    selectedLocation?.id === location.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => handleLocationSelect(location)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          selectedLocation?.id === location.id ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          <MapPin className={`h-5 w-5 ${
                            selectedLocation?.id === location.id ? 'text-blue-600' : 'text-gray-600'
                          }`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-lg font-semibold text-gray-900 truncate">
                              {location.name}
                            </h3>
                            <Badge 
                              variant="secondary" 
                              className="text-xs px-2 py-0.5"
                            >
                              {t("locations.badge")}
                            </Badge>
                            {selectedLocation?.id === location.id && (
                              <Badge className="bg-blue-600 text-white text-xs px-2 py-0.5">
                                {t("locations.selected")}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(location.createdAt)}</span>
                            </div>
                            {location.address && (
                              <span className="truncate flex-1">
                                {location.address}
                              </span>
                            )}
                          </div>
                          
                          {location.description && (
                            <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                              {location.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditLocation(location.id);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            {t("actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDeleteLocation(location.id);
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {!searchText && totalPages > 1 && (
              <div className="flex items-center justify-between bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-gray-100">
                <div className="text-sm text-gray-600 font-medium">
                  {t("locations.pagination.pageInfo", {
                    current: currentPage,
                    total: totalPages,
                    count: totalLocations,
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={!hasPrevPage || pageLoading}
                    className="border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t("pagination.previous")}
                  </Button>
                  <span className="text-sm text-gray-600 px-4 py-2 bg-gray-50 rounded-lg font-medium">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={!hasNextPage || pageLoading}
                    className="border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {t("pagination.next")}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal for adding location */}
      <Dialog open={isModalVisible} onOpenChange={setIsModalVisible}>
        <DialogContent className="sm:max-w-[500px] bg-white/95 backdrop-blur-sm border-0 shadow-2xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              {t("locations.modal.newTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                {t("form.name")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="h-11 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 transition-all duration-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address" className="text-sm font-medium text-gray-700">
                {t("form.address")}{" "}
                <span className="text-gray-400 font-normal text-xs">
                  ({t("form.optional")})
                </span>
              </Label>
              <Input
                id="address"
                value={itemAddress}
                onChange={(e) => setItemAddress(e.target.value)}
                placeholder={t("form.addressPlaceholder")}
                className="h-11 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 transition-all duration-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium text-gray-700">
                {t("form.description")}{" "}
                <span className="text-gray-400 font-normal text-xs">
                  ({t("form.optional")})
                </span>
              </Label>
              <Textarea
                id="description"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                rows={4}
                className="resize-none border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 transition-all duration-200"
              />
            </div>
            <div className="flex gap-3 pt-6">
              <Button
                variant="outline"
                onClick={() => setIsModalVisible(false)}
                className="flex-1 border-gray-200 hover:bg-gray-50"
                disabled={operationLoading}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!itemName.trim() || operationLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("form.creating")}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("form.create")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Location Modal */}
      <Dialog open={isEditModalVisible} onOpenChange={setIsEditModalVisible}>
        <DialogContent className="sm:max-w-[500px] bg-white/95 backdrop-blur-sm border-0 shadow-2xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              {t("locations.modal.editTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium text-gray-700">
                {t("form.name")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="h-11 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 transition-all duration-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address" className="text-sm font-medium text-gray-700">
                {t("form.address")}{" "}
                <span className="text-gray-400 font-normal text-xs">
                  ({t("form.optional")})
                </span>
              </Label>
              <Input
                id="edit-address"
                value={itemAddress}
                onChange={(e) => setItemAddress(e.target.value)}
                placeholder={t("form.addressPlaceholder")}
                className="h-11 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 transition-all duration-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description" className="text-sm font-medium text-gray-700">
                {t("form.description")}{" "}
                <span className="text-gray-400 font-normal text-xs">
                  ({t("form.optional")})
                </span>
              </Label>
              <Textarea
                id="edit-description"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                rows={4}
                className="resize-none border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 transition-all duration-200"
              />
            </div>
            <div className="flex gap-3 pt-6">
              <Button
                variant="outline"
                onClick={() => setIsEditModalVisible(false)}
                className="flex-1 border-gray-200 hover:bg-gray-50"
                disabled={operationLoading}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={handleUpdateSubmit}
                disabled={!itemName.trim() || operationLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("form.updating")}
                  </>
                ) : (
                  <>
                    <Edit className="mr-2 h-4 w-4" />
                    {t("form.update")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

       <ModalMessage
        isOpen={modalState.isOpen}
        onClose={closeModal}
        type={modalState.type}
        message={modalState.message}
        title={modalState.title}
      />
    </div>
  );
};

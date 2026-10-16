import { useState, useEffect, useMemo } from "react";
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
  RefreshCw,
  Layers,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
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

  // Core state
  const [locations, setLocations] = useState<any[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState(false);

  // Form state
  const [itemName, setItemName] = useState("");
  const [itemAddress, setItemAddress] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [editingId, setEditingId] = useState<any>(null);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [totalLocations, setTotalLocations] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  // Auth & Impersonation
  const { currentUser } = useAuth();
  const [userImpersonated, setUserImpersonated] = useState<any>(() =>
    JSON.parse(localStorage.getItem("impersonatedUser") || "null")
  );
  const effectiveUserId = userImpersonated?.ownerUserId || currentUser?.uid;

  // Subscription
  const [subscription, setSubscription] = useState<any | null>(null);

  // Feedback modal
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
          setSubscription({
            ...sub,
            plan: stripePlan?.product?.name ?? "Unknown Plan",
            price: (stripePlan?.unit_amount ?? 0) / 100,
            interval: stripePlan?.recurring?.interval ?? "month",
            metadata: stripePlan?.metadata ?? {},
          });
        } else {
          setSubscription(sub);
        }
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
    }
  };

  const clearImpersonation = () => {
    localStorage.removeItem("impersonatedUser");
    setUserImpersonated(null);
  };

  const getTotalLocations = async () => {
    if (!currentUser) return;
    try {
      await fetchSubscription();
      const { count, error } = await supabase
        .from("locations")
        .select("*", { count: "exact", head: true })
        .eq("userId", effectiveUserId);

      if (!error && count !== null) {
        setTotalLocations(count);
      }
    } catch (error) {
      console.error("Error getting total locations:", error);
    }
  };

  const loadLocations = async (page = 1) => {
    if (!currentUser) return;
    setPageLoading(true);

    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage;

      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("userId", effectiveUserId)
        .order(sortBy, { ascending: sortOrder === "asc" })
        .range(from, to);

      if (error) throw error;

      const docs = data || [];
      const pageData = docs.slice(0, itemsPerPage);
      const hasMore = docs.length > itemsPerPage;

      const locationsData = pageData.map((loc: any) => ({
        ...loc,
        createdAt: loc.createdAt ? new Date(loc.createdAt) : new Date(),
      }));

      setLocations(locationsData);
      setHasNextPage(hasMore);
      setHasPrevPage(page > 1);
    } catch (error) {
      console.error("Error loading locations:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Error loading locations",
      });
    } finally {
      setPageLoading(false);
    }
  };

  const filteredLocations = useMemo(() => {
    if (!searchText.trim()) return locations;
    const term = searchText.toLowerCase().trim();
    return locations.filter(
      (loc: any) =>
        loc.name?.toLowerCase().includes(term) ||
        loc.address?.toLowerCase().includes(term) ||
        loc.description?.toLowerCase().includes(term)
    );
  }, [locations, searchText]);

  const handleSubmit = async () => {
    if (!itemName.trim() || !currentUser) return;

    const limit = Number(subscription?.metadata?.locations);
    if (limit > 0 && totalLocations >= limit) {
      setModalState({
        isOpen: true,
        type: "error",
        message: `You have reached your limit of ${limit} locations for your current plan.`,
      });
      return;
    }

    setOperationLoading(true);
    try {
      const { error: insErr } = await supabase.from("locations").insert({
        name: itemName.trim(),
        address: itemAddress.trim(),
        description: itemDescription.trim(),
        createdAt: new Date().toISOString(),
        userId: effectiveUserId,
      });

      if (insErr) throw insErr;

      resetForm();
      setIsModalVisible(false);
      setModalState({
        isOpen: true,
        type: "success",
        message: "Location registered successfully",
      });

      await loadLocations(1);
      await getTotalLocations();
    } catch (error) {
      console.error("Error creating location:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Failed to create location",
      });
    } finally {
      setOperationLoading(false);
    }
  };

  const handleUpdateSubmit = async () => {
    if (!itemName.trim() || !editingId || !currentUser) return;

    setOperationLoading(true);
    try {
      const { error: updErr } = await supabase
        .from("locations")
        .update({
          name: itemName.trim(),
          address: itemAddress.trim(),
          description: itemDescription.trim(),
          updatedAt: new Date().toISOString(),
        })
        .eq("id", editingId);

      if (updErr) throw updErr;

      resetForm();
      setIsEditModalVisible(false);
      setEditingId(null);
      setSelectedLocation(null);

      setModalState({
        isOpen: true,
        type: "success",
        message: "Location updated successfully",
      });

      await loadLocations(currentPage);
    } catch (error) {
      console.error("Error updating location:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Failed to update location",
      });
    } finally {
      setOperationLoading(false);
    }
  };

  const confirmDeleteLocation = async (locationId: string) => {
    if (!window.confirm(t("locations.confirmDelete") || "Are you sure you want to delete this location?")) {
      return;
    }

    setOperationLoading(true);
    try {
      const { error: delErr } = await supabase
        .from("locations")
        .delete()
        .eq("id", locationId);

      if (delErr) throw delErr;

      setSelectedLocation(null);
      setModalState({
        isOpen: true,
        type: "success",
        message: "Location deleted successfully",
      });

      await loadLocations(currentPage);
      await getTotalLocations();
    } catch (error) {
      console.error("Error deleting location:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Failed to delete location",
      });
    } finally {
      setOperationLoading(false);
    }
  };

  const handleEditLocation = (loc: any) => {
    setEditingId(loc.id);
    setItemName(loc.name || "");
    setItemAddress(loc.address || "");
    setItemDescription(loc.description || "");
    setIsEditModalVisible(true);
  };

  const resetForm = () => {
    setItemName("");
    setItemAddress("");
    setItemDescription("");
    setEditingId(null);
  };

  const formatDate = (date: any) => {
    if (!date) return "";
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleRefresh = () => {
    setCurrentPage(1);
    loadLocations(1);
    getTotalLocations();
  };

  useEffect(() => {
    if (currentUser) {
      loadLocations(1);
      getTotalLocations();
    }
  }, [currentUser, itemsPerPage, sortBy, sortOrder]);

  useEffect(() => {
    if (currentUser) {
      const channel = supabase
        .channel("locations-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "locations",
            filter: `userId=eq.${effectiveUserId}`,
          },
          () => {
            getTotalLocations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser, effectiveUserId]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert className="max-w-md">
          <ShieldAlert className="h-4 w-4" />
          <span>{t("locations.mustSignIn")}</span>
        </Alert>
      </div>
    );
  }

  const maxLocations = Number(subscription?.metadata?.locations) || 0;
  const isLimitReached = maxLocations > 0 && totalLocations >= maxLocations;
  const totalPages = Math.ceil(totalLocations / itemsPerPage);

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-12 font-sans">
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

      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-7xl space-y-4">
        {/* Compact Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t("locations.title")}
              </h1>
              {subscription?.plan && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">
                  {subscription.plan}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("locations.subtitle")}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={pageLoading}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg text-xs shadow-2xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${pageLoading ? "animate-spin text-blue-600" : "text-slate-500"
                  }`}
              />
              <span className="ml-1.5 hidden sm:inline">{t("locations.refresh")}</span>
            </Button>

            {!isLimitReached && (
              <Button
                onClick={() => {
                  resetForm();
                  setIsModalVisible(true);
                }}
                className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t("locations.new")}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Space-Optimized KPI Stat Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Total Locations */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Building className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Registered Facilities
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {totalLocations}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              Active
            </span>
          </div>

          {/* Plan Quota */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Plan Quota
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {maxLocations > 0 ? `${totalLocations} / ${maxLocations}` : `${totalLocations} (Unlimited)`}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-emerald-600/70 hidden xl:inline font-medium">
              {maxLocations > 0 && maxLocations - totalLocations > 0
                ? `${maxLocations - totalLocations} slots left`
                : "Active status"}
            </span>
          </div>

          {/* Search match stats */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <MapPin className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Visible Locations
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {filteredLocations.length}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              In view
            </span>
          </div>
        </div>

        {/* Integrated Unified Controls Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs">
          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
            <Input
              placeholder={t("locations.searchPlaceholder")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 pl-8 pr-7 text-xs bg-slate-50 border-slate-200 rounded-lg focus-visible:ring-1 focus-visible:ring-slate-900"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Sort & Pagination Filters */}
          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32 h-8 text-xs bg-slate-50 border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t("locations.sort.name")}</SelectItem>
                <SelectItem value="createdAt">{t("locations.sort.date")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="w-28 h-8 text-xs bg-slate-50 border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">{t("locations.sort.asc")}</SelectItem>
                <SelectItem value="desc">{t("locations.sort.desc")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={itemsPerPage.toString()}
              onValueChange={(v) => setItemsPerPage(parseInt(v, 10))}
            >
              <SelectTrigger className="w-20 h-8 text-xs bg-slate-50 border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8">8 / p</SelectItem>
                <SelectItem value="16">16 / p</SelectItem>
                <SelectItem value="24">24 / p</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content Area */}
        {pageLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-36 bg-white rounded-xl border border-slate-200/80 p-4 animate-pulse flex flex-col justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg"></div>
                  <div className="w-28 h-4 bg-slate-100 rounded"></div>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded"></div>
                <div className="w-20 h-3 bg-slate-100 rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Building className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {searchText.trim()
                ? t("locations.emptySearch")
                : t("locations.empty")}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              {searchText.trim()
                ? t("locations.hintSearch")
                : t("locations.hintEmpty")}
            </p>
            {!searchText.trim() && !isLimitReached && (
              <Button
                size="sm"
                onClick={() => {
                  resetForm();
                  setIsModalVisible(true);
                }}
                className="h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                <span>{t("locations.createFirst")}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredLocations.map((loc: any) => {
              const isSelected = selectedLocation?.id === loc.id;

              return (
                <div
                  key={loc.id}
                  onClick={() =>
                    setSelectedLocation(isSelected ? null : loc)
                  }
                  className={`group relative bg-white rounded-xl border p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-[152px] ${isSelected
                      ? "border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/15"
                      : "border-slate-200/90 hover:border-slate-300"
                    }`}
                >
                  {/* Top Row: Icon, Name & Actions Dropdown */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate text-sm leading-tight">
                          {loc.name}
                        </h3>
                        {loc.address && (
                          <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                            {loc.address}
                          </span>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditLocation(loc);
                          }}
                        >
                          <Edit className="w-3.5 h-3.5 mr-2 text-slate-500" />
                          <span>{t("actions.edit")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDeleteLocation(loc.id);
                          }}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          <span>{t("actions.delete")}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Middle: Description */}
                  <div className="my-auto py-1">
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {loc.description || "No description provided for this storage facility."}
                    </p>
                  </div>

                  {/* Bottom Footer: Date & Select Indicator */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-300" />
                      <span>{formatDate(loc.createdAt)}</span>
                    </span>

                    <span className="text-[10px] font-medium text-slate-300 group-hover:text-blue-600 transition-colors flex items-center">
                      <span>{isSelected ? "Selected" : "Details"}</span>
                      <ArrowUpRight className="w-3 h-3 ml-0.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Space-Optimized Pagination */}
        {!searchText && totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
            <span className="text-xs text-slate-500">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({totalLocations} total)
            </span>

            <div className="flex items-center space-x-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasPrevPage) {
                    setCurrentPage((p) => p - 1);
                    loadLocations(currentPage - 1);
                  }
                }}
                disabled={!hasPrevPage || pageLoading}
                className="h-7 px-2 text-xs border-slate-200"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                <span>Prev</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasNextPage) {
                    setCurrentPage((p) => p + 1);
                    loadLocations(currentPage + 1);
                  }
                }}
                disabled={!hasNextPage || pageLoading}
                className="h-7 px-2 text-xs border-slate-200"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE LOCATION MODAL */}
      <Dialog open={isModalVisible} onOpenChange={setIsModalVisible}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              <span>{t("locations.modal.newTitle")}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-1">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs font-semibold text-slate-700">
                {t("form.name")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="h-8.5 text-xs bg-slate-50 border-slate-200"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="address" className="text-xs font-semibold text-slate-700">
                {t("form.address")} <span className="text-slate-400 font-normal">({t("form.optional")})</span>
              </Label>
              <Input
                id="address"
                value={itemAddress}
                onChange={(e) => setItemAddress(e.target.value)}
                placeholder={t("form.addressPlaceholder")}
                className="h-8.5 text-xs bg-slate-50 border-slate-200"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs font-semibold text-slate-700">
                {t("form.description")} <span className="text-slate-400 font-normal">({t("form.optional")})</span>
              </Label>
              <Textarea
                id="description"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                rows={3}
                className="text-xs resize-none bg-slate-50 border-slate-200"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalVisible(false)}
                className="flex-1 h-8 text-xs border-slate-200"
                disabled={operationLoading}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!itemName.trim() || operationLoading}
                className="flex-1 h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-2xs"
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    <span>{t("form.creating")}</span>
                  </>
                ) : (
                  <span>{t("form.create")}</span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT LOCATION MODAL */}
      <Dialog open={isEditModalVisible} onOpenChange={setIsEditModalVisible}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Edit className="w-4 h-4 text-blue-600" />
              <span>{t("locations.modal.editTitle")}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-1">
            <div className="space-y-1">
              <Label htmlFor="edit-name" className="text-xs font-semibold text-slate-700">
                {t("form.name")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="h-8.5 text-xs bg-slate-50 border-slate-200"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-address" className="text-xs font-semibold text-slate-700">
                {t("form.address")} <span className="text-slate-400 font-normal">({t("form.optional")})</span>
              </Label>
              <Input
                id="edit-address"
                value={itemAddress}
                onChange={(e) => setItemAddress(e.target.value)}
                placeholder={t("form.addressPlaceholder")}
                className="h-8.5 text-xs bg-slate-50 border-slate-200"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-description" className="text-xs font-semibold text-slate-700">
                {t("form.description")} <span className="text-slate-400 font-normal">({t("form.optional")})</span>
              </Label>
              <Textarea
                id="edit-description"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                rows={3}
                className="text-xs resize-none bg-slate-50 border-slate-200"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalVisible(false)}
                className="flex-1 h-8 text-xs border-slate-200"
                disabled={operationLoading}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateSubmit}
                disabled={!itemName.trim() || operationLoading}
                className="flex-1 h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-2xs"
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    <span>{t("form.updating")}</span>
                  </>
                ) : (
                  <span>{t("form.update")}</span>
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

import React, { useState, useMemo } from "react";
import {
  X,
  Plus,
  MapPin,
  Loader2,
  Package,
  ArrowLeft,
  Building2,
  Search,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// Types
export interface LocationTest {
  id: number | string;
  name: string;
  address?: string;
}

export interface BinData {
  name: string;
  description: string;
  location?: LocationTest;
}

interface AddBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (binData: BinData) => Promise<void>;
  userId: string;
}

export const AddBinModal: React.FC<AddBinModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  userId,
}) => {
  const { t } = useTranslation();

  const [binName, setBinName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<LocationTest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showLocationSelector, setShowLocationSelector] = useState<boolean>(false);
  const [locationSearch, setLocationSearch] = useState<string>("");

  const [locationOptions, setLocationOptions] = useState<LocationTest[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(false);

  const fetchLocations = async () => {
    if (!userId) return;
    setIsLoadingLocations(true);
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, address")
        .eq("userId", userId)
        .order("name", { ascending: true });

      if (error) throw error;
      setLocationOptions(data || []);
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const filteredLocations = useMemo(() => {
    if (!locationSearch.trim()) return locationOptions;
    const query = locationSearch.toLowerCase();
    return locationOptions.filter(
      (loc) =>
        loc.name?.toLowerCase().includes(query) ||
        loc.address?.toLowerCase().includes(query)
    );
  }, [locationOptions, locationSearch]);

  const handleSubmit = async (): Promise<void> => {
    if (!binName.trim()) return;

    setIsSubmitting(true);
    try {
      const binData: BinData = {
        name: binName.trim(),
        description: description.trim(),
        location: selectedLocation || undefined,
      };

      await onSubmit(binData);
      handleClose();
    } catch (error) {
      console.error("Error creating bin:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = (): void => {
    setBinName("");
    setDescription("");
    setSelectedLocation(null);
    setShowLocationSelector(false);
    setLocationSearch("");
  };

  const handleLocationSelect = (location: LocationTest): void => {
    setSelectedLocation(location);
    setShowLocationSelector(false);
    setLocationSearch("");
  };

  const handleClose = (): void => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="workspace-safe-dialog max-w-md w-full p-0 gap-0 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden font-sans"
        showCloseButton={false}
      >
        {/* Modal Header */}
        <DialogHeader className="px-5 py-4 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center space-x-3 min-w-0">
            {showLocationSelector ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLocationSelector(false)}
                className="h-8 w-8 p-0 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0"
                title={t("addBin.back", { defaultValue: "Back" })}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-800 shrink-0 shadow-2xs">
                <Package className="w-4.5 h-4.5" />
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold text-slate-900 leading-tight truncate">
                {showLocationSelector
                  ? t("addBin.selectLocation", { defaultValue: "Select Location" })
                  : t("addBin.title", { defaultValue: "New Container" })}
              </DialogTitle>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {showLocationSelector
                  ? t("addBin.selectLocationDesc", {
                    defaultValue: "Assign a physical place to this container",
                  })
                  : t("addBin.subtitle", {
                    defaultValue: "Create and organize your new container in inventory",
                  })}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 rounded-lg shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto max-h-[70vh]">
          {showLocationSelector ? (
            /* =========================================================
                1. SUB-VIEW: LOCATION SELECTOR
               ========================================================= */
            <div className="space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder={t("addBin.searchLocations", {
                    defaultValue: "Search location by name or address...",
                  })}
                  className="pl-8 pr-7 h-8 text-xs rounded-xl border-slate-200 bg-slate-50/60 focus:bg-white"
                />
                {locationSearch && (
                  <button
                    onClick={() => setLocationSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Locations List */}
              {isLoadingLocations ? (
                <div className="py-10 flex flex-col items-center justify-center space-y-2 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                  <p className="text-xs">
                    {t("addBin.loadingLocations", { defaultValue: "Loading locations..." })}
                  </p>
                </div>
              ) : filteredLocations.length === 0 ? (
                <div className="py-8 text-center px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-2">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">
                    {locationSearch
                      ? t("addBin.noLocationsFound", {
                        defaultValue: "No locations found matching this term",
                      })
                      : t("addBin.noLocationsRegistered", {
                        defaultValue: "You don't have registered locations yet",
                      })}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {locationSearch
                      ? t("addBin.tryAnotherTerm", {
                        defaultValue: "Try searching with another term",
                      })
                      : t("addBin.createLocationsHint", {
                        defaultValue:
                          "You can create locations from the Locations section in the menu",
                      })}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                  {filteredLocations.map((location) => {
                    const isSelected = selectedLocation?.id === location.id;
                    return (
                      <div
                        key={location.id}
                        onClick={() => handleLocationSelect(location)}
                        className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelected
                          ? "bg-blue-50/80 border-blue-200 text-blue-900 shadow-2xs"
                          : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80 text-slate-900"
                          }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600"
                              }`}
                          >
                            <Building2 className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-xs truncate leading-tight">
                              {location.name}
                            </h4>
                            {location.address && (
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {location.address}
                              </p>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* =========================================================
                2. MAIN FORM: ADD CONTAINER
               ========================================================= */
            <div className="space-y-4">
              {/* Bin Name */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="binNameInput"
                    className="text-xs font-semibold text-slate-800"
                  >
                    {t("addBin.nameLabel", { defaultValue: "Container Name" })} *
                  </Label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {binName.length}/35
                  </span>
                </div>
                <Input
                  id="binNameInput"
                  value={binName}
                  onChange={(e) => setBinName(e.target.value)}
                  placeholder={t("addBin.namePlaceholder", {
                    defaultValue: "e.g. Box #1 - Winter Clothes, Tools...",
                  })}
                  maxLength={35}
                  className="h-9 text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white placeholder:text-slate-400"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="binDescInput"
                  className="text-xs font-semibold text-slate-800"
                >
                  {t("addBin.descriptionLabel", { defaultValue: "Description or Notes" })}
                </Label>
                <Textarea
                  id="binDescInput"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("addBin.descriptionPlaceholder", {
                    defaultValue: "Write details about what you'll store, category, etc.",
                  })}
                  rows={3}
                  className="text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white placeholder:text-slate-400 resize-none leading-relaxed"
                />
              </div>

              {/* Location Picker */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>{t("addBin.locationLabel", { defaultValue: "Location" })}</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({t("addBin.optional", { defaultValue: "Optional" })})
                  </span>
                </Label>

                {!selectedLocation ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocationSelector(true);
                      if (locationOptions.length === 0) {
                        fetchLocations();
                      }
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 transition-all text-left group"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700 group-hover:text-slate-900">
                          {t("addBin.addLocation", { defaultValue: "Assign location" })}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {t("addBin.locationHint", {
                            defaultValue: "Shelf, warehouse, room or address",
                          })}
                        </p>
                      </div>
                    </div>
                    <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors mr-1" />
                  </button>
                ) : (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 shadow-2xs">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100/90 flex items-center justify-center text-blue-700 shrink-0">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-blue-900 truncate">
                          {selectedLocation.name}
                        </p>
                        {selectedLocation.address && (
                          <p className="text-[10px] text-blue-700/80 truncate">
                            {selectedLocation.address}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowLocationSelector(true)}
                        className="px-2 py-1 text-blue-700 hover:text-blue-900 text-[11px] font-semibold hover:underline"
                      >
                        {t("addBin.change", { defaultValue: "Change" })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedLocation(null)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded"
                        title={t("addBin.removeLocation", { defaultValue: "Remove location" })}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!showLocationSelector && (
          <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
              className="h-8 rounded-lg text-xs border-slate-200 text-slate-700 hover:bg-white"
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!binName.trim() || isSubmitting}
              size="sm"
              className="h-8 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-2xs inline-flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  <span>{t("addBin.creating", { defaultValue: "Creating..." })}</span>
                </>
              ) : (
                <span>{t("addBin.create", { defaultValue: "Create Container" })}</span>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

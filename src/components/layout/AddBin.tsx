import React, { useState } from "react";
import { X, Plus, MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
  userId
}) => {
  const [binName, setBinName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<LocationTest | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showLocationSelector, setShowLocationSelector] =
    useState<boolean>(false);

  // Mock translation function - replace with your i18n solution
  const t = (key: string): string => {
    const translations: Record<string, string> = {
      "addBin.nameLabel": "Container Name",
      "addBin.namePlaceholder": "Enter Container name",
      "addBin.descriptionLabel": "Description",
      "addBin.descriptionPlaceholder": "Enter description",
      "addBin.addLocation": "Add Location",
      "addBin.optional": "optional",
      "addBin.locationLabel": "Location",
      "addBin.creating": "Creating...",
      "addBin.create": "Create Container",
    };
    return translations[key] || key;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!binName.trim() || !description.trim()) return;

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
  };

  const handleLocationSelect = (location: LocationTest): void => {
    setSelectedLocation(location);
    setShowLocationSelector(false);
  };

  const handleClose = (): void => {
    resetForm();
    onClose();
  };

  const isFormValid = (): boolean => {
    return binName.trim().length > 0 && description.trim().length > 0;
  };

  const [locationOptions, setLocationOptions] = useState<LocationTest[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(false);

  const fetchLocations = async () => {
    setIsLoadingLocations(true);
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, address")
        .eq("userId", userId);

      if (error) throw error;
      setLocationOptions(data || []);
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setIsLoadingLocations(false);
    }
  };
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {showLocationSelector ? "Select Location" : "Add New Container"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {showLocationSelector ? (
            /* Location Selector View */
            <div className="space-y-3">
              <button
                onClick={() => setShowLocationSelector(false)}
                className="flex items-center text-blue-600 hover:text-blue-700 text-sm mb-4"
              >
                ← Back to form
              </button>

              {isLoadingLocations ? (
                <div className="text-center py-8 text-gray-500">
                  Loading locations...
                </div>
              ) : locationOptions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No locations available
                </p>
              ) : (
                locationOptions.map((location) => (
                  <div
                    key={location.id}
                    onClick={() => handleLocationSelect(location)}
                    className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {location.name}
                      </h3>
                      {location.address && (
                        <p className="text-sm text-gray-500">
                          {location.address}
                        </p>
                      )}
                    </div>
                    <MapPin size={20} className="text-gray-400" />
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Main Form */
            <div className="space-y-6">
              {/* Bin Name Input */}
              <div>
                <label
                  htmlFor="binName"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  {t("addBin.nameLabel")}
                </label>
                <input
                  id="binName"
                  type="text"
                  value={binName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setBinName(e.target.value)
                  }
                  placeholder={t("addBin.namePlaceholder")}
                  maxLength={35}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>

              {/* Description Input */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  {t("addBin.descriptionLabel")}
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  placeholder={t("addBin.descriptionPlaceholder")}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 resize-none"
                />
              </div>

              {/* Location Selection */}
              <div>
                {!selectedLocation ? (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        setShowLocationSelector(true);
                        if (locationOptions.length === 0) {
                          fetchLocations();
                        }
                      }}
                      className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                    <span className="text-sm text-gray-700">
                      {t("addBin.addLocation")}{" "}
                      <span className="text-gray-500">
                        ({t("addBin.optional")})
                      </span>
                    </span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t("addBin.locationLabel")}
                    </label>
                    <div className="flex items-center space-x-2">
                      <div
                        onClick={() => setShowLocationSelector(true)}
                        className="flex-1 flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                      >
                        <span className="text-blue-800 font-medium">
                          {selectedLocation.name}
                        </span>
                        <MapPin size={16} className="text-blue-600" />
                      </div>
                      <button
                        onClick={() => setSelectedLocation(null)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Only show on main form */}
        {!showLocationSelector && (
          <div className="p-6 bg-gray-50 border-t">
            <button
              onClick={handleSubmit}
              disabled={!isFormValid() || isSubmitting}
              className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg font-medium transition-colors ${
                !isFormValid() || isSubmitting
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>{t("addBin.creating")}</span>
                </>
              ) : (
                <span>{t("addBin.create")}</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

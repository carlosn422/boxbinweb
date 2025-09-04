import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Grid, List, Search } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [allLabels, setAllLabels] = useState<LabelType[]>([]);
  const [labels, setLabels] = useState<LabelType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchTags, setSearchTags] = useState<string[]>([]);
  //const [isUsedFilter, setIsUsedFilter] = useState<boolean | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  //const [showTemplateButton, setShowTemplateButton] = useState(false);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      fetchLabels();
    }
  }, [currentUser]);

  useEffect(() => {
    let filtered = [...allLabels];

    // Combine search term and tags for filtering
    const allSearchTerms = [
      ...searchTerm
        .split(",")
        .map((term) => term.trim().toUpperCase())
        .filter(Boolean),
      ...searchTags.map((tag) => tag.toUpperCase()),
    ];

    if (allSearchTerms.length > 0) {
      filtered = filtered.filter((label) =>
        allSearchTerms.includes(label.qrcodeId.toUpperCase())
      );
    }

    //if (isUsedFilter !== null) {
    //filtered = filtered.filter((label) => label.isUsed === isUsedFilter);
    //}

    if (startDate) {
      filtered = filtered.filter(
        (label) => new Date(label.dateCreated) >= startDate
      );
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(
        (label) => new Date(label.dateCreated) <= endOfDay
      );
    }

    const selectedData = allLabels.filter((l) =>
      selectedLabels.includes(l.guid)
    );

    const combined = [...selectedData, ...filtered];
    const finalLabels = combined.filter(
      (v, i, a) => a.findIndex((t) => t.guid === v.guid) === i
    );

    setLabels(finalLabels);
  }, [searchTerm, startDate, endDate, selectedLabels, allLabels]);

  const fetchLabels = async (): Promise<void> => {
    try {
      if (!currentUser) return;
      setIsLoading(true);

      const labelsRef = collection(db, "qrcodes");
      const q = query(labelsRef, where("userId", "==", currentUser.uid));
      const querySnapshot = await getDocs(q);

      const labelsData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          dateCreated: data.dateCreated,
          guid: data.guid || doc.id,
          isUsed: data.isUsed,
          order_key: data.order_key,
          qrcodeId: data.qrcodeId,
          userId: data.userId,
        } as LabelType;
      });

      setAllLabels(labelsData);
    } catch (error) {
      console.error("Error fetching labels:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLabelSelect = (guid: string) => {
    setSelectedLabels((prevSelected) =>
      prevSelected.includes(guid)
        ? prevSelected.filter((id) => id !== guid)
        : [...prevSelected, guid]
    );
  };

  const handleCreateLabel = async (label: { field: string }) => {
    try {
      if (!currentUser) return;
      setIsLoading(true);

      const batch = writeBatch(db);
      const now = new Date().toISOString();

      for (let i = 0; i < quantity; i++) {
        const guid =
          self.crypto?.randomUUID() ||
          Math.random().toString(36).substring(2) + Date.now().toString(36);
        const qrcodeId = generateQrCodeId();

        const labelData = {
          dateCreated: now,
          field: `${label.field} ${quantity > 1 ? `(${i + 1})` : ""}`.trim(),
          guid,
          isUsed: false,
          order_key: "",
          qrcodeId,
          userId: currentUser.uid,
        };

        const docRef = doc(collection(db, "qrcodes"));
        batch.set(docRef, labelData);
      }

      await batch.commit();
      fetchLabels();
    } catch (error) {
      console.error("Error creating labels:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              {t("smartLabels.title")}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {t("smartLabels.subtitle")}
            </p>
          </div>

          {selectedLabels.length > 0 && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800/50">
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <span className="font-medium">{selectedLabels.length}</span>{" "}
                {selectedLabels.length === 1
                  ? t("smartLabels.label")
                  : t("smartLabels.labels")}{" "}
                {t("smartLabels.selected")}
              </div>
              <Button
                onClick={() => {
                  navigate("/smart-labels/templates", {
                    state: {
                      selectedQRCodes: selectedLabels,
                    },
                  });
                }}
                className="h-9 text-sm"
              >
                {t("smartLabels.generateTemplate")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filters Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">
            {t("smartLabels.filtersTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Section */}
          <div className="space-y-4">
            <div className="space-y-3">
              <Label
                htmlFor="search"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                {t("smartLabels.searchLabel")}
              </Label>

              {/* Search Tags */}
              {searchTags.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  {searchTags.map((tag, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-sm shadow-sm"
                    >
                      <span className="text-slate-700 dark:text-slate-300">
                        {tag}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const newTags = searchTags.filter(
                            (_, i) => i !== index
                          );
                          setSearchTags(newTags);

                          if (newTags.length === 0) {
                            setLabels(allLabels);
                          } else {
                            setLabels(
                              allLabels.filter((label) =>
                                newTags.some((term) =>
                                  label.qrcodeId
                                    .toLowerCase()
                                    .includes(term.toLowerCase())
                                )
                              )
                            );
                          }
                        }}
                        className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTags([]);
                      setLabels(allLabels);
                    }}
                    className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md transition-colors"
                  >
                    {t("smartLabels.clearAll")}
                  </button>
                </div>
              )}

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="search"
                  placeholder={t("smartLabels.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                      e.preventDefault();
                      const value = searchTerm.trim();
                      if (value && !searchTags.includes(value)) {
                        const newTags = [...searchTags, value];
                        setSearchTags(newTags);
                        setSearchTerm("");

                        setLabels(
                          allLabels.filter((label) =>
                            newTags.some((term) =>
                              label.qrcodeId
                                .toLowerCase()
                                .includes(term.toLowerCase())
                            )
                          )
                        );
                      } else {
                        setSearchTerm("");
                      }
                    }
                  }}
                  className="pl-10 h-10"
                />
              </div>
            </div>

            {/* Date Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("smartLabels.startDate")}
                </Label>
                <DatePicker
                  selected={startDate}
                  onChange={(date: Date | null) => setStartDate(date)}
                  selectsStart
                  startDate={startDate || undefined}
                  endDate={endDate || undefined}
                  className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                  placeholderText="Select start date"
                  maxDate={new Date()}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("smartLabels.endDate")}
                </Label>
                <DatePicker
                  selected={endDate}
                  onChange={(date: Date | null) => setEndDate(date)}
                  selectsEnd
                  startDate={startDate || undefined}
                  endDate={endDate || undefined}
                  className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                  placeholderText="Select end date"
                  minDate={startDate || undefined}
                  maxDate={new Date()}
                />
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setStartDate(null);
                    setEndDate(null);
                  }}
                  className="h-10"
                >
                  {t("smartLabels.clearDates")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            className="gap-2"
          >
            {viewMode === "grid" ? (
              <>
                <List className="h-4 w-4" />
                {t("smartLabels.listView")}
              </>
            ) : (
              <>
                <Grid className="h-4 w-4" />
                {t("smartLabels.gridView")}
              </>
            )}
          </Button>

          {labels.length > 0 && (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {t("smartLabels.showing")}{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {labels.length}
              </span>{" "}
              {labels.length === 1
                ? t("smartLabels.label")
                : t("smartLabels.labels")}
            </div>
          )}
        </div>

        <Button
          onClick={() => setShowQuantityModal(true)}
          disabled={isLoading}
          className="gap-2 h-10"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              {t("smartLabels.creating")}
            </>
          ) : (
            t("smartLabels.createLabel")
          )}
        </Button>
      </div>

      {/* Content Area */}
      {labels.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-slate-400 dark:text-slate-500 mb-4">
              <Search className="h-12 w-12" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
              {t("smartLabels.noLabelsTitle")}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-center">
              {t("smartLabels.noLabelsSubtitle")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* List View */}
          {viewMode === "list" && (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {labels.map((label) => (
                    <div
                      key={label.guid}
                      className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center space-x-4"
                    >
                      <Checkbox
                        checked={selectedLabels.includes(label.guid)}
                        onCheckedChange={() => handleLabelSelect(label.guid)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {t("smartLabels.qrCode")}: {label.qrcodeId}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                              {t("smartLabels.created")}:{" "}
                              {new Date(label.dateCreated).toLocaleString()}
                            </div>
                            <Badge
                              variant={
                                label.isUsed ? "destructive" : "secondary"
                              }
                              className={
                                label.isUsed
                                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800"
                                  : "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800"
                              }
                            >
                              {label.isUsed
                                ? t("smartLabels.used")
                                : t("smartLabels.available")}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grid View */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {labels.map((label) => (
                <Card
                  key={label.guid}
                  className="hover:shadow-md transition-shadow duration-200"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        checked={selectedLabels.includes(label.guid)}
                        onCheckedChange={() => handleLabelSelect(label.guid)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-3">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {t("smartLabels.qrCode")}: {label.qrcodeId}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {new Date(label.dateCreated).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge
                          variant={label.isUsed ? "destructive" : "secondary"}
                          className={
                            label.isUsed
                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800"
                              : "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800"
                          }
                        >
                          {label.isUsed
                            ? t("smartLabels.used")
                            : t("smartLabels.available")}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showQuantityModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-xl">
                {t("smartLabels.createModalTitle")}
              </CardTitle>
              <CardDescription>
                {t("smartLabels.createModalDescription")}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("smartLabels.createQuantityLabel")}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    placeholder="Enter quantity"
                    className="h-10"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowQuantityModal(false)}
              >
                {t("smartLabels.cancel")}
              </Button>
              <Button
                onClick={() => {
                  setShowQuantityModal(false);
                  handleCreateLabel({
                    field: `New Label ${
                      quantity > 1 ? "(x" + quantity + ")" : ""
                    }`,
                  });
                }}
              >
                {quantity > 1
                  ? t("smartLabels.createMultiple", { count: quantity })
                  : t("smartLabels.createSingle")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
};

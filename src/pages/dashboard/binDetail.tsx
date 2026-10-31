import "./bin-detail.css";
import { ResponsiveDisclosure } from "@/components/layout/ResponsiveDisclosure";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit3,
  Plus,
  Trash2,
  MapPin,
  Package,
  ImageIcon,
  X,
  Minus,
  Loader2,
  Search,
  Grid,
  List,
  Sparkles,
  UploadCloud,
  DollarSign,
  TrendingUp,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Video,
  ArrowUpDown,
  RefreshCw,
  ShieldAlert,
  ChevronDown,
  ScanLine,
  Box,
  Calendar,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getStripePlanById } from "@/lib/stripe";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";
import EnhancedVideoAIModal from "../billing/EnhancedVideoAIModal";
import EnhancedImagesAIModal from "../billing/EnhancedImageAIModal";
import { useTranslation } from "react-i18next";
import { openBinCopilot } from "@/services/boxbinCopilotService";

export interface TokenEstimate {
  success: boolean;
  MY_TOTAL_TOKENS: number;
  MY_TOTAL_COST: number;
  user_tokens: number;
  tokens_needed?: number;
  message?: string;
  available_tokens?: number;
  tokens_remaining_after?: number;
  required_tokens?: number;
}

export const uploadImage = async (file: File): Promise<string> => {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `items/${Date.now()}-${cleanName}`;
  const { error } = await supabase.storage
    .from("binventory-storage")
    .upload(filename, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from("binventory-storage")
    .getPublicUrl(filename);
  return publicUrl;
};

const extractStoragePath = (url: string | null): string | null => {
  if (!url) return null;

  if (!url.includes("://")) {
    return url;
  }

  if (url.includes("/binventory-storage/")) {
    const parts = url.split("/binventory-storage/");
    return parts[1]?.split("?")[0] || null;
  }

  return null;
};

// types
export interface BinDetails {
  id: string;
  name: string;
  description: string;
  address: string;
  createdAt: string;
  userId?: string;
  location?: {
    name: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
}

export interface Item {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  binId: string;
  userId?: string;
  imageUrl?: string;
  cuantity: string;
  value: string;
  quantity?: string | number;
}

const BinDetailsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [userImpersonated, setUserImpersonated] = useState<any>(() =>
    JSON.parse(localStorage.getItem("impersonatedUser") || "null")
  );
  const effectiveUserId = userImpersonated?.ownerUserId || currentUser?.uid;
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  const handleStopImpersonating = () => {
    localStorage.removeItem("impersonatedUser");
    setUserImpersonated(null);
    navigate("/home");
  };

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

  const openModal = (type: ModalType, message: string, title?: string) => {
    setModalState({
      isOpen: true,
      type,
      message,
      title,
    });
  };

  // Main data states
  const [bin, setBin] = useState<BinDetails | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [subscription, setSubscription] = useState<any | null>(null);

  // View & Filter states
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "name" | "value-desc" | "qty-desc">("date");

  // Modal dialog states
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [isEditBinOpen, setIsEditBinOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isImagesUploadOpen, setIsImagesUploadOpen] = useState(false);
  const [isVideoUploadOpen, setIsVideoUploadOpen] = useState(false);

  // Lightbox zoom states
  const [selectedModalImage, setSelectedModalImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Bulk upload states
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [isBulkUploading, setIsBulkUploading] = useState(false);

  // Form states for adding / editing items
  const [currentItem, setCurrentItem] = useState<Item | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemCuantity, setItemCuantity] = useState<number>(1);
  const [itemValue, setItemValue] = useState<string | number>("");
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);

  // Bin form states
  const [binName, setBinName] = useState("");
  const [binDescription, setBinDescription] = useState("");
  const [binAddress, setBinAddress] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
  const [isUpdatingBin, setIsUpdatingBin] = useState(false);
  const [isDeletingBin, setIsDeletingBin] = useState(false);

  // Stepper handlers
  const incrementQuantity = () => setItemCuantity((prev) => prev + 1);
  const decrementQuantity = () => setItemCuantity((prev) => Math.max(1, prev - 1));

  // Fetch subscription
  const fetchSubscription = async () => {
    if (!effectiveUserId) return;
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
            plan: stripePlan?.product || { name: "BoxBin Subscription" },
          };
          setSubscription(fullSubscription);
        } else {
          setSubscription(sub);
        }
      }
    } catch (e) {
      console.warn("Failed to load subscription details:", e);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [effectiveUserId]);

  // Load container and items
  const loadData = async (showLoading = true) => {
    if (!id || !effectiveUserId) return;

    try {
      if (showLoading) setLoading(true);

      const { data: binData, error: binErr } = await supabase
        .from("bins")
        .select("*")
        .eq("id", id)
        .eq("userId", effectiveUserId)
        .maybeSingle();

      if (binErr) {
        console.error("Error querying bin data:", binErr);
      }

      if (!binData) {
        const { data: foreignBin } = await supabase
          .from("bins")
          .select("id")
          .eq("id", id)
          .maybeSingle();

        setIsUnauthorized(Boolean(foreignBin));
        setBin(null);
        setItems([]);
        if (showLoading) setLoading(false);
        return;
      }

      if (binData.userId && binData.userId !== effectiveUserId) {
        setIsUnauthorized(true);
        setBin(null);
        setItems([]);
        if (showLoading) setLoading(false);
        return;
      }

      setIsUnauthorized(false);
      setBin(binData as BinDetails);

      const { data: itemsData, error: itemsErr } = await supabase
        .from("items")
        .select("*")
        .eq("binId", id)
        .eq("userId", effectiveUserId)
        .order("createdAt", { ascending: false });

      if (itemsErr) throw itemsErr;

      setItems((itemsData || []) as Item[]);
    } catch (err) {
      console.error("Error fetching bin data:", err);
      toast.error(t("containers.loadErrorToast", { defaultValue: "Failed to load container data" }));
    } finally {
      if (showLoading) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!effectiveUserId) {
      setLoading(false);
      setBin(null);
      return;
    }
    loadData(true);
  }, [id, effectiveUserId, authLoading]);

  useEffect(() => {
    const refresh = () => { void loadData(false); };
    window.addEventListener("boxbin-inventory-changed", refresh);
    return () => window.removeEventListener("boxbin-inventory-changed", refresh);
  }, [id, effectiveUserId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData(false);
    toast.success(t("containers.inventoryUpdatedToast", { defaultValue: "Inventory updated" }));
  };

  // Bulk Upload
  const handleBulkUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !bin || !effectiveUserId) return;

    if (bin.userId && bin.userId !== effectiveUserId) {
      toast.error(t("containers.noPermissionToast", { defaultValue: "You don't have permission to modify this container" }));
      return;
    }

    const limit = Number(subscription?.metadata?.items) || 100;
    if (items.length + files.length > limit) {
      toast.error(t("containers.planLimitToast", { limit, defaultValue: `Your plan allows up to ${limit} items.` }));
      return;
    }

    setIsBulkUploading(true);
    setBulkProgress({ done: 0, total: files.length });

    const newItems: Item[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `bins/${id}/${Date.now()}_${cleanName}`;

        const { error: uploadErr } = await supabase.storage
          .from("binventory-storage")
          .upload(filename, file, { upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage
          .from("binventory-storage")
          .getPublicUrl(filename);

        const generatedName = `${bin?.name || "Item"} #${String(items.length + i + 1).padStart(2, "0")}`;
        const itemData = {
          name: generatedName,
          description: "",
          cuantity: "1",
          value: "0",
          tags: [],
          createdAt: new Date().toISOString(),
          binId: id!,
          userId: effectiveUserId,
          imageUrl: publicUrl,
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("items")
          .insert(itemData)
          .select()
          .single();

        if (insertErr) throw insertErr;
        newItems.push(inserted as Item);
      } catch (err) {
        console.error("Error uploading file index", i, err);
      } finally {
        setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setItems((prev) => [...prev, ...newItems]);
    setIsBulkUploading(false);
    setIsBulkUploadOpen(false);
    toast.success(t("containers.bulkSuccessToast", { count: newItems.length, defaultValue: `Successfully uploaded ${newItems.length} items` }));
  };

  // Tags management
  const handleAddTag = () => {
    if (newTag.trim() && !itemTags.includes(newTag.trim())) {
      setItemTags([...itemTags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setItemTags(itemTags.filter((tag) => tag !== tagToRemove));
  };

  // Edit item trigger
  const handleEditItem = (item: Item) => {
    const qty = Number(item.quantity ?? item.cuantity ?? 1);
    setItemCuantity(qty > 0 ? qty : 1);
    setCurrentItem(item);
    setItemName(item.name);
    setItemDescription(item.description || "");
    setItemValue(item.value || "");
    setItemTags(item.tags || []);
    setSelectedImage(item.imageUrl || null);
    setSelectedFile(null);
    setIsEditItemOpen(true);
  };

  const resetItemForm = () => {
    setItemName("");
    setItemDescription("");
    setItemCuantity(1);
    setItemValue("");
    setItemTags([]);
    setNewTag("");
    setSelectedImage(null);
    setSelectedFile(null);
    setCurrentItem(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setSelectedFile(file);
    };
    reader.readAsDataURL(file);
  };

  // Create new item
  const handleSubmitItem = async () => {
    if (!bin || (bin.userId && bin.userId !== effectiveUserId)) {
      toast.error(t("containers.noPermissionToast", { defaultValue: "You don't have permission to modify this container" }));
      return;
    }

    const limit = Number(subscription?.metadata?.items) || 100;
    if (items.length >= limit) {
      toast.error(t("containers.planLimitToast", { limit, defaultValue: `Plan limit of ${limit} items reached.` }));
      return;
    }

    if (!itemName.trim()) {
      toast.error(t("containers.nameRequiredToast", { defaultValue: "Please enter an item name" }));
      return;
    }

    try {
      setIsSavingItem(true);
      let imageUrl: string | null = null;

      if (selectedFile) {
        try {
          imageUrl = await uploadImage(selectedFile);
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          const proceed = window.confirm(
            t("containers.imageUploadConfirm", { defaultValue: "Image upload failed. Do you want to continue without an image?" })
          );
          if (!proceed) {
            setIsSavingItem(false);
            return;
          }
        }
      }

      const itemData = {
        name: itemName.trim(),
        description: itemDescription.trim(),
        cuantity: itemCuantity.toString(),
        quantity: itemCuantity,
        value: itemValue ? itemValue.toString().trim() : "0",
        tags: itemTags,
        createdAt: new Date().toISOString(),
        binId: id!,
        userId: effectiveUserId,
        ...(imageUrl && { imageUrl }),
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("items")
        .insert(itemData)
        .select()
        .single();

      if (insertErr) throw insertErr;
      const newItem = inserted as Item;

      setItems((prev) => [newItem, ...prev]);
      setIsAddItemOpen(false);
      resetItemForm();
      toast.success(t("containers.itemAddedToast", { defaultValue: "Item added successfully" }));
    } catch (error) {
      console.error("Error adding item:", error);
      toast.error(t("containers.itemAddErrorToast", { defaultValue: "Failed to add item" }));
    } finally {
      setIsSavingItem(false);
    }
  };

  // Update existing item
  const handleUpdateItem = async () => {
    if (!itemName.trim()) {
      toast.error(t("containers.nameRequiredToast", { defaultValue: "Please enter an item name" }));
      return;
    }

    if (!currentItem) return;

    try {
      setIsSavingItem(true);

      const updateData: Partial<Item> & { quantity?: string | number } = {
        name: itemName.trim(),
        description: itemDescription.trim(),
        tags: itemTags,
        value: itemValue ? itemValue.toString().trim() : "0",
        cuantity: itemCuantity.toString(),
        quantity: itemCuantity.toString(),
      };

      if (selectedFile && selectedImage !== currentItem.imageUrl) {
        if (currentItem.imageUrl) {
          try {
            const oldImagePath = extractStoragePath(currentItem.imageUrl);
            if (oldImagePath) {
              await supabase.storage.from("binventory-storage").remove([oldImagePath]);
            }
          } catch (e) {
            console.warn("Could not delete old image:", e);
          }
        }

        const newImageUrl = await uploadImage(selectedFile);
        updateData.imageUrl = newImageUrl;
      }

      const { error: updateErr } = await supabase
        .from("items")
        .update(updateData)
        .eq("id", currentItem.id)
        .eq("userId", effectiveUserId);

      if (updateErr) throw updateErr;

      setItems((prev) =>
        prev.map((item) =>
          item.id === currentItem.id
            ? {
              ...item,
              ...updateData,
              cuantity: itemCuantity.toString(),
              quantity: itemCuantity.toString(),
            }
            : item
        )
      );

      resetItemForm();
      setIsEditItemOpen(false);
      toast.success(t("containers.itemUpdatedToast", { defaultValue: "Item updated successfully" }));
    } catch (error) {
      console.error("Error updating item:", error);
      toast.error(t("containers.itemUpdateErrorToast", { defaultValue: "Failed to update item" }));
    } finally {
      setIsSavingItem(false);
    }
  };

  // Delete item
  const deleteItem = async (itemId: string, imageUrl: string | undefined) => {
    try {
      const { error: delErr } = await supabase
        .from("items")
        .delete()
        .eq("id", itemId)
        .eq("userId", effectiveUserId);
      if (delErr) throw delErr;

      if (imageUrl) {
        try {
          const path = extractStoragePath(imageUrl);
          if (path) {
            await supabase.storage.from("binventory-storage").remove([path]);
          }
        } catch (e) {
          console.warn("Could not delete item image:", e);
        }
      }

      setItems((prev) => prev.filter((item) => item.id !== itemId));
      toast.success(t("containers.itemDeletedToast", { defaultValue: "Item deleted" }));
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error(t("containers.itemDeleteErrorToast", { defaultValue: "Failed to delete item" }));
    }
  };

  // Edit container setup
  const handleEditBin = () => {
    if (bin) {
      setBinName(bin.name || "");
      setBinDescription(bin.description || "");
      setBinAddress(bin.address || "");
      setSelectedLocation(bin.location ?? null);
      setIsEditBinOpen(true);
    }
  };

  // Update container
  const handleUpdateBin = async () => {
    try {
      if (!binName.trim()) {
        toast.error(t("containers.binNameRequiredToast", { defaultValue: "Container name is required" }));
        return;
      }

      setIsUpdatingBin(true);
      const updatePayload = {
        name: binName.trim(),
        address: binAddress.trim(),
        description: binDescription.trim(),
        updatedAt: new Date().toISOString(),
        location: selectedLocation ?? bin?.location,
      };

      if (!id || !effectiveUserId) return;
      const { error: binUpdateErr } = await supabase
        .from("bins")
        .update(updatePayload)
        .eq("id", id)
        .eq("userId", effectiveUserId);

      if (binUpdateErr) throw binUpdateErr;

      setBin((prev) =>
        prev
          ? {
            ...prev,
            name: updatePayload.name,
            address: updatePayload.address,
            description: updatePayload.description,
            location: updatePayload.location,
          }
          : null
      );

      setIsEditBinOpen(false);
      toast.success(t("containers.binUpdatedToast", { defaultValue: "Container updated successfully" }));
      openModal("success", t("containers.binUpdatedToast", { defaultValue: "Container updated successfully!" }));
    } catch (error: any) {
      console.error("Error updating bin:", error);
      toast.error(t("containers.binUpdateErrorToast", { defaultValue: "Failed to update container" }));
      openModal("error", error?.message || t("containers.binUpdateErrorToast", { defaultValue: "Failed to update container" }));
    } finally {
      setIsUpdatingBin(false);
    }
  };

  // Delete container entirely
  const handleDeleteBin = async () => {
    if (!id || !effectiveUserId) return;
    try {
      setIsDeletingBin(true);

      for (const item of items) {
        if (item.imageUrl) {
          const path = extractStoragePath(item.imageUrl);
          if (path) {
            try {
              await supabase.storage.from("binventory-storage").remove([path]);
            } catch (e) {
              console.warn("Storage deletion ignored:", e);
            }
          }
        }
      }

      await supabase.from("items").delete().eq("binId", id).eq("userId", effectiveUserId);
      await supabase.from("bins").delete().eq("id", id).eq("userId", effectiveUserId);

      toast.success(t("containers.binDeletedToast", { defaultValue: "Container deleted successfully" }));
      navigate("/home");
    } catch (err) {
      console.error("Error deleting bin:", err);
      toast.error(t("containers.binDeleteErrorToast", { defaultValue: "Failed to delete container" }));
    } finally {
      setIsDeletingBin(false);
    }
  };

  // Inventory KPI calculations
  const totalItemsCount = items.length;
  const totalUnitsCount = useMemo(() => {
    return items.reduce((acc, it) => {
      const q = Number(it.quantity ?? it.cuantity);
      return acc + (isNaN(q) || q <= 0 ? 1 : q);
    }, 0);
  }, [items]);

  const totalValuation = useMemo(() => {
    return items.reduce((acc, it) => {
      const v = Number(it.value);
      const q = Number(it.quantity ?? it.cuantity);
      const qty = isNaN(q) || q <= 0 ? 1 : q;
      const val = isNaN(v) || v <= 0 ? 0 : v;
      return acc + val * qty;
    }, 0);
  }, [items]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (Array.isArray(it.tags)) {
        it.tags.forEach((t) => set.add(t));
      }
    });
    return Array.from(set);
  }, [items]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    return items
      .filter((it) => {
        const matchesQuery =
          searchQuery.trim() === "" ||
          it.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          it.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          it.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesTag = !selectedTag || it.tags?.includes(selectedTag);

        return matchesQuery && matchesTag;
      })
      .sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === "value-desc") {
          return (Number(b.value) || 0) - (Number(a.value) || 0);
        }
        if (sortBy === "qty-desc") {
          const qA = Number(a.quantity ?? a.cuantity) || 1;
          const qB = Number(b.quantity ?? b.cuantity) || 1;
          return qB - qA;
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [items, searchQuery, selectedTag, sortBy]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-slate-50/60 flex flex-col items-center justify-center p-4 font-sans">
        <div className="text-center space-y-3 bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-2xl bg-blue-500/20 blur-md animate-pulse" />
            <div className="relative w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          </div>
          <p className="text-xs text-slate-600 font-semibold tracking-wide">
            {t("containers.loading", { defaultValue: "Loading container details..." })}
          </p>
        </div>
      </div>
    );
  }

  if (!bin) {
    return (
      <div className="min-h-screen bg-slate-50/60 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl border border-slate-200/80 p-8 max-w-md w-full text-center shadow-lg">
          {isUnauthorized ? (
            <>
              <div className="w-14 h-14 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mx-auto text-red-600 mb-4 shadow-2xs">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                {t("containers.unauthorizedTitle", { defaultValue: "Unauthorized Access" })}
              </h2>
              <p className="text-xs text-slate-500 mt-2 mb-6 leading-relaxed">
                {t("containers.unauthorizedDesc", { defaultValue: "This container does not belong to your account or you do not have permission to view its information." })}
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400 mb-4 shadow-2xs">
                <Package className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                {t("containers.notFoundTitle", { defaultValue: "Container Not Found" })}
              </h2>
              <p className="text-xs text-slate-500 mt-2 mb-6 leading-relaxed">
                {t("containers.notFoundDesc", { defaultValue: "The requested container does not exist, was deleted, or the identifier is incorrect." })}
              </p>
            </>
          )}
          <Button
            onClick={() => navigate("/home")}
            className="h-9 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("containers.backToContainers", { defaultValue: "Back to My Containers" })}
          </Button>
        </div>
      </div>
    );
  }

  // Render form controls shared between Add and Edit item modals
  const renderItemFormFields = (isEdit: boolean) => (
    <div className="space-y-4 pt-1">
      {/* Photo dropzone / preview */}
      <div>
        <Label className="text-xs font-bold text-slate-700 block mb-1.5">
          {t("containers.photo", { defaultValue: "Photo" })}
        </Label>
        <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors rounded-2xl p-3.5 bg-slate-50/60 text-center">
          {selectedImage ? (
            <div className="flex items-center gap-3.5">
              <div className="relative group w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100">
                <img
                  src={selectedImage}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {t("containers.selectedPhoto", { defaultValue: "Selected photo" })}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer">
                    {t("containers.changePhoto", { defaultValue: "Change photo" })}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </label>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImage(null);
                      setSelectedFile(null);
                    }}
                    className="text-[11px] font-medium text-red-600 hover:underline"
                  >
                    {t("containers.remove", { defaultValue: "Remove" })}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center justify-center py-3 px-2 group">
              <div className="w-10 h-10 rounded-xl bg-white text-slate-400 group-hover:text-blue-600 flex items-center justify-center shadow-2xs border border-slate-200/80 mb-2 transition-colors">
                <UploadCloud className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                {t("containers.selectPhoto", { defaultValue: "Select photo" })}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">
                {t("containers.dropzoneHint", { defaultValue: "Click or drag an image here (PNG, JPG, WEBP)" })}
              </span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </label>
          )}
        </div>
      </div>

      {/* Item Name */}
      <div>
        <Label htmlFor={isEdit ? "editName" : "addName"} className="text-xs font-bold text-slate-700 block mb-1.5">
          {t("containers.nameLabel", { defaultValue: "Name *" })}
        </Label>
        <Input
          id={isEdit ? "editName" : "addName"}
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder={t("containers.itemNamePlaceholder", { defaultValue: "Item name" })}
          className="h-9 text-xs rounded-xl border-slate-200 bg-white focus:bg-white focus:border-blue-500 shadow-2xs"
          autoFocus={!isEdit}
        />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor={isEdit ? "editDesc" : "addDesc"} className="text-xs font-bold text-slate-700 block mb-1.5">
          {t("containers.descriptionLabel", { defaultValue: "Description" })}
        </Label>
        <Textarea
          id={isEdit ? "editDesc" : "addDesc"}
          value={itemDescription}
          onChange={(e) => setItemDescription(e.target.value)}
          placeholder={t("containers.itemDescPlaceholder", { defaultValue: "Description, model, notes..." })}
          rows={2}
          className="text-xs rounded-xl border-slate-200 bg-white resize-none shadow-2xs"
        />
      </div>

      {/* Quantity & Value Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={isEdit ? "editQty" : "addQty"} className="text-xs font-bold text-slate-700 block mb-1.5">
            {t("containers.quantityLabel", { defaultValue: "Quantity" })}
          </Label>
          <div className="flex items-center space-x-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={decrementQuantity}
              className="h-9 w-9 p-0 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs shrink-0"
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Input
              id={isEdit ? "editQty" : "addQty"}
              type="number"
              min={1}
              value={itemCuantity}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setItemCuantity(1);
                } else {
                  const num = parseInt(val, 10);
                  setItemCuantity(isNaN(num) ? 1 : Math.max(1, num));
                }
              }}
              className="h-9 text-center text-xs rounded-xl border-slate-200 font-mono font-bold bg-white shadow-2xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={incrementQuantity}
              className="h-9 w-9 p-0 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor={isEdit ? "editVal" : "addVal"} className="text-xs font-bold text-slate-700 block mb-1.5">
            {t("containers.valueLabel", { defaultValue: "Value ($)" })}
          </Label>
          <div className="relative">
            <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              id={isEdit ? "editVal" : "addVal"}
              type="number"
              min={0}
              step={0.01}
              value={itemValue}
              onChange={(e) => setItemValue(e.target.value)}
              placeholder="0.00"
              className="h-9 pl-8 text-xs rounded-xl border-slate-200 font-mono font-semibold bg-white shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <Label className="text-xs font-bold text-slate-700 block mb-1.5">
          {t("containers.tagsLabel", { defaultValue: "Tags" })}
        </Label>
        <div className="flex space-x-1.5">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder={t("containers.addTagPlaceholder", { defaultValue: "Add a tag..." })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag();
              }
            }}
            className="h-9 text-xs rounded-xl border-slate-200 bg-white shadow-2xs"
          />
          <Button
            type="button"
            onClick={handleAddTag}
            size="sm"
            variant="outline"
            className="h-9 px-3.5 rounded-xl text-xs border-slate-200 bg-white hover:bg-slate-50 font-bold shadow-2xs"
          >
            {t("containers.addTagBtn", { defaultValue: "Add" })}
          </Button>
        </div>

        {itemTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {itemTags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200/60"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-blue-400 hover:text-blue-800 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bin-detail-page">
      <div className="bin-detail-content">
        {/* Impersonation Banner */}
        {userImpersonated && (
          <div className="bg-amber-50 border border-amber-200/90 px-4 py-3 rounded-2xl flex items-center justify-between text-xs text-amber-900 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <span className="font-medium">
                {t("containers.viewingShared", {
                  username: userImpersonated?.ownerUsername,
                  userId: userImpersonated?.ownerUserId,
                  defaultValue: `Viewing shared account: ${userImpersonated?.ownerUsername} (${userImpersonated?.ownerUserId})`,
                })}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStopImpersonating}
              className="h-7 px-3 text-xs text-amber-900 border-amber-300 hover:bg-amber-100 rounded-xl font-bold"
            >
              {t("containers.stopImpersonating", { defaultValue: "Exit shared account" })}
            </Button>
          </div>
        )}

        {/* Top Hero Container Header */}
        <div className="bin-detail-header">
          {/* Left: Container Brand, Info & Badges */}
          <div className="bin-detail-identity">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/home")}
              className="bin-detail-back"
              title={t("containers.backToDashboard", { defaultValue: "Back to Dashboard" })}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="bin-detail-icon">
              <Box className="w-6 h-6 text-blue-400" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                  {bin.name}
                </h1>
                {bin.location?.name && (
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 inline-flex items-center gap-1.5 shadow-2xs shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-blue-500" />
                    <span>{bin.location.name}</span>
                  </span>
                )}
              </div>

              <ResponsiveDisclosure label={t("workspaceDesign.details")} className="bin-detail-metadata">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5 text-xs text-slate-500">
                {bin.description && (
                  <span className="text-slate-600 truncate max-w-md">{bin.description}</span>
                )}
                {bin.address && (
                  <span className="flex items-center gap-1.5 text-slate-500 truncate max-w-sm">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{bin.address}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{new Date(bin.createdAt).toLocaleDateString()}</span>
                </span>
              </div>
              </ResponsiveDisclosure>
            </div>
          </div>

          {/* Right: Actions Suite */}
          <div className="bin-detail-actions">
            {/* Copilot IA */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBinCopilot(bin.id, bin.name)}
              className="bin-detail-copilot"
              title={t("containers.askBinCopilot", { defaultValue: "Ask BoxBin AI Copilot about this bin" })}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-200 animate-pulse" />
              <span>{t("containers.aiCopilot", { defaultValue: "AI Copilot" })}</span>
            </Button>

            <ResponsiveDisclosure label={t("workspaceDesign.tools")} className="bin-detail-tools">
            {/* AI Recognition Tools Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5"
                >
                  <ScanLine className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{t("containers.aiTools", { defaultValue: "AI Tools" })}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 text-xs rounded-2xl shadow-xl border-slate-200 p-1.5 bg-white">
                <DropdownMenuLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1.5">
                  {t("containers.aiRecognition", { defaultValue: "AI Recognition" })}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setIsImagesUploadOpen(true)}
                  className="cursor-pointer rounded-xl px-2.5 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{t("containers.scanPhotos", { defaultValue: "Scan from Photos" })}</div>
                    <div className="text-[10px] text-slate-400">{t("containers.scanPhotosDesc", { defaultValue: "Detect items automatically" })}</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsVideoUploadOpen(true)}
                  className="cursor-pointer rounded-xl px-2.5 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{t("containers.scanVideo", { defaultValue: "Scan from Video" })}</div>
                    <div className="text-[10px] text-slate-400">{t("containers.scanVideoDesc", { defaultValue: "Process video walkthrough" })}</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk Upload Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkUploadOpen(true)}
              className="h-9 px-3 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
              <span>{t("containers.bulkUpload", { defaultValue: "Bulk Upload" })}</span>
            </Button>

            {/* Refresh container */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 w-9 p-0 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-xl shadow-2xs"
              title={t("containers.refreshTooltip", { defaultValue: "Refresh container" })}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600" : "text-slate-500"}`}
              />
            </Button>

            {/* Container Options Dropdown: Edit & Delete */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 bg-white hover:bg-slate-50 border-slate-200 text-slate-600 rounded-xl shadow-2xs"
                  title={t("containers.manageContainer", { defaultValue: "Manage container" })}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs rounded-2xl shadow-xl border-slate-200 p-1.5 bg-white">
                <DropdownMenuLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                  {t("containers.manageContainer", { defaultValue: "Manage container" })}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={handleEditBin}
                  className="cursor-pointer rounded-xl px-2.5 py-2 flex items-center gap-2 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t("actions.edit", { defaultValue: "Edit" })}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1 bg-slate-100" />

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <div className="cursor-pointer rounded-xl px-2.5 py-2 flex items-center gap-2 text-red-600 hover:bg-red-50 font-semibold text-xs transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t("actions.delete", { defaultValue: "Delete" })}</span>
                    </div>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="workspace-safe-dialog rounded-3xl border border-slate-200 shadow-2xl bg-white max-w-md p-6">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-base font-black text-slate-900">
                        {t("containers.deleteConfirmTitle", { name: bin.name, defaultValue: `Delete "${bin.name}"?` })}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed mt-1">
                        {t("containers.deleteConfirmDesc", {
                          count: items.length,
                          defaultValue: `This will permanently delete this container and all ${items.length} items stored inside it.`,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-4">
                      <AlertDialogCancel className="rounded-xl border-slate-200 text-xs h-9 font-semibold">
                        {t("actions.cancel", { defaultValue: "Cancel" })}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteBin}
                        disabled={isDeletingBin}
                        className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs h-9 font-bold shadow-sm"
                      >
                        {isDeletingBin ? t("containers.deleting", { defaultValue: "Deleting..." }) : t("containers.deleteConfirmBtn", { defaultValue: "Delete Container" })}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>

            </ResponsiveDisclosure>

            {/* Primary Add Item CTA */}
            <Button
              onClick={() => {
                resetItemForm();
                setIsAddItemOpen(true);
              }}
              className="bin-detail-add"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              <span>{t("containers.addItem", { defaultValue: "Add Item" })}</span>
            </Button>
          </div>
        </div>

        {/* Dashboard KPI Stats Ribbon (3 Modern Cards) */}
        <div className="bin-detail-stats">
          {/* Card 1: Total Items */}
          <div className="bin-detail-stat">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 shadow-2xs">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  {t("containers.kpiTotalItems", { defaultValue: "Total Items" })}
                </span>
                <span className="text-2xl font-black text-slate-900 leading-tight">
                  {totalItemsCount}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {t("containers.kpiInContainer", { defaultValue: "In this container" })}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Total Units */}
          <div className="bin-detail-stat">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  {t("containers.kpiTotalUnits", { defaultValue: "Total Units" })}
                </span>
                <span className="text-2xl font-black text-slate-900 leading-tight">
                  {totalUnitsCount} <span className="text-xs font-normal text-slate-400 font-sans">{t("containers.units", { defaultValue: "units" })}</span>
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {t("containers.kpiQuantitySum", { defaultValue: "Quantity sum" })}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Total Valuation */}
          <div className="bin-detail-stat">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  {t("containers.kpiEstimatedValue", { defaultValue: "Estimated Value" })}
                </span>
                <span className="text-2xl font-black text-slate-900 leading-tight font-mono">
                  ${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {t("containers.kpiValuation", { defaultValue: "Valuation" })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Integrated Unified Controls Bar: Search, Sort & View Toggle */}
        <div className="bin-detail-controls">
          {/* Search Input */}
          <div className="bin-detail-search">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              aria-label={t("containers.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("containers.searchPlaceholder", { defaultValue: "Search items by name, tag, or description..." })}
              className="pl-10 pr-9 h-9 bg-slate-50/90 border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:border-blue-400 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <ResponsiveDisclosure label={t("workspaceDesign.sortAndView")} className="bin-detail-filter-options">
          {/* Filter, Sort, & View Mode Switcher */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold shadow-2xs"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                  <span>
                    {sortBy === "name"
                      ? t("containers.sortName", { defaultValue: "Name (A - Z)" })
                      : sortBy === "value-desc"
                        ? t("containers.sortValueDesc", { defaultValue: "Value (Highest)" })
                        : sortBy === "qty-desc"
                          ? t("containers.sortQtyDesc", { defaultValue: "Quantity (Highest)" })
                          : t("containers.sortDate", { defaultValue: "Recently Added" })}
                  </span>
                  <ChevronDown className="w-3 h-3 ml-1 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs rounded-2xl shadow-xl border-slate-200 p-1 bg-white">
                <DropdownMenuLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                  {t("containers.sortOrder", { defaultValue: "Sort order" })}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setSortBy("date")}
                  className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-xs font-medium ${sortBy === "date" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600"}`}
                >
                  {t("containers.sortDate", { defaultValue: "Recently Added" })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("name")}
                  className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-xs font-medium ${sortBy === "name" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600"}`}
                >
                  {t("containers.sortName", { defaultValue: "Name (A - Z)" })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("value-desc")}
                  className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-xs font-medium ${sortBy === "value-desc" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600"}`}
                >
                  {t("containers.sortValueDesc", { defaultValue: "Value (Highest)" })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("qty-desc")}
                  className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-xs font-medium ${sortBy === "qty-desc" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600"}`}
                >
                  {t("containers.sortQtyDesc", { defaultValue: "Quantity (Highest)" })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Mode Toggle (Grid vs List) */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shadow-2xs">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                className={`h-7 w-7 p-0 rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                aria-pressed={viewMode === "grid"}
                title={t("containers.gridView", { defaultValue: "Grid view" })}
              >
                <Grid className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("list")}
                className={`h-7 w-7 p-0 rounded-lg transition-all ${
                  viewMode === "list"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                aria-pressed={viewMode === "list"}
                title={t("containers.listView", { defaultValue: "List view" })}
              >
                <List className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          </ResponsiveDisclosure>
        </div>

        {/* Interactive Tags Ribbon Strip */}
        {allTags.length > 0 && (
          <div className="bin-detail-tags flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              aria-pressed={!selectedTag}
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                !selectedTag
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {t("containers.allTags", { defaultValue: "All Tags" })} ({items.length})
            </button>
            {allTags.map((tag) => {
              const count = items.filter((it) => it.tags?.includes(tag)).length;
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shadow-2xs ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm font-bold"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <span>#{tag}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content View: Empty State vs Grid View vs List View */}
        {filteredItems.length === 0 ? (
          <div className="bin-detail-empty">
            <div className="w-14 h-14 mx-auto mb-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center text-slate-400 shadow-2xs">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-slate-900 mb-1.5">
              {searchQuery || selectedTag
                ? t("containers.noItemsFound", { defaultValue: "No items found" })
                : t("containers.noItems", { defaultValue: "No items yet" })}
            </h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {searchQuery || selectedTag
                ? t("containers.noItemsSearchHint", { defaultValue: "Try adjusting your search terms or filters." })
                : t("containers.noItemsHint", { defaultValue: "Add items manually or use bulk upload to populate this container." })}
            </p>
            {searchQuery || selectedTag ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedTag(null);
                }}
                className="h-9 px-4 border-slate-200 text-xs text-slate-700 rounded-xl font-bold shadow-2xs"
              >
                {t("actions.clearFilter", { defaultValue: "Clear filter" })}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  resetItemForm();
                  setIsAddItemOpen(true);
                }}
                className="h-9 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                <Plus className="w-4 h-4 mr-1.5 text-blue-400" />
                <span>{t("containers.addFirstItem", { defaultValue: "Add First Item" })}</span>
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          /* Redesigned Card Grid View */
          <div className="bin-detail-grid">
            {filteredItems.map((item) => {
              const qty = Number(item.quantity ?? item.cuantity) || 1;
              const val = Number(item.value) || 0;

              return (
                <div
                  key={item.id}
                  className="bin-detail-item group"
                >
                  {/* Image Viewport */}
                  <div
                    className="bin-detail-item-image"
                    onClick={() => {
                      if (item.imageUrl) {
                        setSelectedModalImage(item.imageUrl);
                        setZoomLevel(1);
                        setIsImageModalOpen(true);
                      }
                    }}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-gradient-to-b from-slate-50 to-slate-100/50">
                        <ImageIcon className="w-8 h-8 stroke-[1.5]" />
                        <span className="text-[11px] font-semibold text-slate-400 mt-1">
                          {t("containers.image", { defaultValue: "No photo" })}
                        </span>
                      </div>
                    )}

                    {/* Quantity Badge on Image */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/95 backdrop-blur-md border border-white/60 text-slate-800 text-[11px] font-bold shadow-2xs font-mono">
                        <span>x{qty}</span>
                        <span className="text-[10px] text-slate-400 font-sans font-normal">
                          {t("containers.units", { defaultValue: "units" })}
                        </span>
                      </span>
                    </div>

                    {/* Valuation Badge on Image */}
                    {val > 0 && (
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-900/90 backdrop-blur-md text-white font-mono text-[11px] font-bold shadow-2xs">
                          ${val.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Hover Zoom Eye Indicator */}
                    {item.imageUrl && (
                      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-white text-slate-800 flex items-center justify-center shadow-md transform scale-90 group-hover:scale-100 transition-transform">
                          <ZoomIn className="w-4 h-4" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="bin-detail-item-body">
                    <div>
                      {/* Item Title */}
                      <h3
                        className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate text-sm leading-snug"
                        title={item.name}
                      >
                        {item.name}
                      </h3>

                      {/* Description with Uniform 2 Lines */}
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mt-1 min-h-[2rem]">
                        {item.description || (
                          <span className="text-slate-300 italic">{t("containers.noDescription", { defaultValue: "No description" })}</span>
                        )}
                      </p>

                      {/* Tags Preview (Max 2 tags + count) */}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-2.5">
                          {item.tags.slice(0, 2).map((tg, idx) => (
                            <span
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTag(tg);
                              }}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200/50 transition-colors cursor-pointer truncate max-w-[120px]"
                            >
                              #{tg}
                            </span>
                          ))}
                          {item.tags.length > 2 && (
                            <span
                              title={item.tags.slice(2).join(", ")}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200/50"
                            >
                              +{item.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Footer Divider & Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-400 font-medium">
                        {new Date(item.createdAt || 0).toLocaleDateString()}
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditItem(item)}
                          className="h-7 px-2.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-1 transition-colors font-semibold"
                          title={t("containers.editItem", { defaultValue: "Edit Item" })}
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[11px]">{t("actions.edit", { defaultValue: "Edit" })}</span>
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t("containers.deleteItem", { defaultValue: "Delete Item" })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="workspace-safe-dialog rounded-3xl border border-slate-200 shadow-2xl bg-white max-w-sm p-5">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-base font-black text-slate-900">
                                {t("containers.deleteItemConfirmTitle", { name: item.name, defaultValue: `Delete "${item.name}"?` })}
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed mt-1">
                                {t("containers.deleteItemConfirmDesc", { defaultValue: "Are you sure you want to delete this item?" })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="pt-3">
                              <AlertDialogCancel className="rounded-xl border-slate-200 text-xs h-8.5 font-semibold">
                                {t("actions.cancel", { defaultValue: "Cancel" })}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteItem(item.id, item.imageUrl)}
                                className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs h-8.5 font-bold shadow-sm"
                              >
                                {t("actions.delete", { defaultValue: "Delete" })}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Redesigned Table / List View */
          <div className="bin-detail-list">
            {filteredItems.map((item) => {
              const qty = Number(item.quantity ?? item.cuantity) || 1;
              const val = Number(item.value) || 0;

              return (
                <div
                  key={item.id}
                  className="bin-detail-list-row group"
                >
                  {/* Left: Thumbnail & Details */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div
                      className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden cursor-pointer shrink-0 border border-slate-200/80 relative"
                      onClick={() => {
                        if (item.imageUrl) {
                          setSelectedModalImage(item.imageUrl);
                          setZoomLevel(1);
                          setIsImageModalOpen(true);
                        }
                      }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors">
                          {item.name}
                        </span>
                        {val > 0 && (
                          <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 shrink-0">
                            ${val.toFixed(2)}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {item.description || t("containers.noDescription", { defaultValue: "No description" })}
                      </p>

                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.tags.map((tg, idx) => (
                            <span
                              key={idx}
                              onClick={() => setSelectedTag(tg)}
                              className="text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 px-1.5 py-0.2 rounded border border-slate-200/50 cursor-pointer"
                            >
                              #{tg}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Quantity Badge, Date & Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200/60">
                      x{qty} <span className="font-sans font-normal text-[10px] text-slate-400">{t("containers.units", { defaultValue: "units" })}</span>
                    </span>

                    <span className="hidden md:inline text-xs text-slate-400 font-medium">
                      {new Date(item.createdAt || 0).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditItem(item)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                        title={t("containers.editItem", { defaultValue: "Edit Item" })}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title={t("containers.deleteItem", { defaultValue: "Delete Item" })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="workspace-safe-dialog rounded-3xl border border-slate-200 shadow-2xl bg-white max-w-sm p-5">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-base font-black text-slate-900">
                              {t("containers.deleteItemConfirmTitle", { name: item.name, defaultValue: `Delete "${item.name}"?` })}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed mt-1">
                              {t("containers.deleteItemConfirmDesc", { defaultValue: "Are you sure you want to delete this item?" })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="pt-3">
                            <AlertDialogCancel className="rounded-xl border-slate-200 text-xs h-8.5 font-semibold">
                              {t("actions.cancel", { defaultValue: "Cancel" })}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteItem(item.id, item.imageUrl)}
                              className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs h-8.5 font-bold shadow-sm"
                            >
                              {t("actions.delete", { defaultValue: "Delete" })}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1. Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="workspace-safe-dialog bin-detail-dialog max-w-md rounded-3xl border border-slate-200 shadow-2xl p-6 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              <span>{t("containers.addNewItem", { defaultValue: "Add New Item" })}</span>
            </DialogTitle>
          </DialogHeader>

          {renderItemFormFields(false)}

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddItemOpen(false);
                resetItemForm();
              }}
              className="rounded-xl text-xs h-9 border-slate-200 font-semibold"
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={handleSubmitItem}
              disabled={isSavingItem || !itemName.trim()}
              size="sm"
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-bold shadow-sm"
            >
              {isSavingItem ? t("containers.saving", { defaultValue: "Saving..." }) : t("containers.addItem", { defaultValue: "Add Item" })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Edit Item Dialog */}
      <Dialog open={isEditItemOpen} onOpenChange={setIsEditItemOpen}>
        <DialogContent className="workspace-safe-dialog bin-detail-dialog max-w-md rounded-3xl border border-slate-200 shadow-2xl p-6 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-600" />
              <span>{t("containers.editItemTitle", { defaultValue: "Edit Item" })}</span>
            </DialogTitle>
          </DialogHeader>

          {renderItemFormFields(true)}

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditItemOpen(false);
                resetItemForm();
              }}
              className="rounded-xl text-xs h-9 border-slate-200 font-semibold"
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={handleUpdateItem}
              disabled={isSavingItem || !itemName.trim()}
              size="sm"
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-bold shadow-sm"
            >
              {isSavingItem ? t("containers.updating", { defaultValue: "Updating..." }) : t("containers.updateItemBtn", { defaultValue: "Update Item" })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Edit Container Dialog */}
      <Dialog open={isEditBinOpen} onOpenChange={setIsEditBinOpen}>
        <DialogContent className="workspace-safe-dialog bin-detail-dialog max-w-md rounded-3xl border border-slate-200 shadow-2xl p-6 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Box className="w-5 h-5 text-blue-600" />
              <span>{t("containers.editBinTitle", { defaultValue: "Edit Container" })}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div>
              <Label htmlFor="binName" className="text-xs font-bold text-slate-700 block mb-1.5">
                {t("containers.binNameLabel", { defaultValue: "Name *" })}
              </Label>
              <Input
                id="binName"
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                placeholder={t("containers.binNamePlaceholder", { defaultValue: "Container name" })}
                className="h-9 text-xs rounded-xl border-slate-200 shadow-2xs"
              />
            </div>

            <div>
              <Label htmlFor="binDesc" className="text-xs font-bold text-slate-700 block mb-1.5">
                {t("containers.binDescLabel", { defaultValue: "Description" })}
              </Label>
              <Textarea
                id="binDesc"
                value={binDescription}
                onChange={(e) => setBinDescription(e.target.value)}
                placeholder={t("containers.binDescPlaceholder", { defaultValue: "Description or notes" })}
                rows={2}
                className="text-xs rounded-xl border-slate-200 resize-none shadow-2xs"
              />
            </div>

            <div>
              <Label htmlFor="binAddress" className="text-xs font-bold text-slate-700 block mb-1.5">
                {t("containers.binAddressLabel", { defaultValue: "Address / Location" })}
              </Label>
              <Input
                id="binAddress"
                value={binAddress}
                onChange={(e) => setBinAddress(e.target.value)}
                placeholder={t("containers.binAddressPlaceholder", { defaultValue: "Shelf, room, or physical address" })}
                className="h-9 text-xs rounded-xl border-slate-200 shadow-2xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditBinOpen(false)}
              className="rounded-xl text-xs h-9 border-slate-200 font-semibold"
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={handleUpdateBin}
              disabled={isUpdatingBin || !binName.trim()}
              size="sm"
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-bold shadow-sm"
            >
              {isUpdatingBin ? (
                <span className="flex items-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("containers.updating", { defaultValue: "Updating..." })}</span>
                </span>
              ) : (
                t("containers.updateBinBtn", { defaultValue: "Update Container" })
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. Bulk Upload Dialog */}
      <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
        <DialogContent className="workspace-safe-dialog bin-detail-dialog max-w-md rounded-3xl border border-slate-200 shadow-2xl p-6 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-blue-600" />
              <span>{t("containers.bulkUploadTitle", { defaultValue: "Bulk Upload Photos" })}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="border-2 border-dashed border-slate-200 rounded-3xl p-7 text-center bg-slate-50/60 hover:border-blue-400 transition-colors">
              <input
                type="file"
                id="bulkUploadInput"
                multiple
                accept="image/*"
                className="hidden"
                disabled={isBulkUploading}
                onChange={(e) => handleBulkUpload(e.target.files)}
              />
              <label
                htmlFor="bulkUploadInput"
                className="cursor-pointer flex flex-col items-center justify-center space-y-2.5"
              >
                <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 border border-slate-200/80 shadow-2xs flex items-center justify-center">
                  <UploadCloud className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-xs font-bold text-slate-900">
                  {t("containers.selectMultiplePhotos", { defaultValue: "Select multiple photos" })}
                </span>
                <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                  {t("containers.bulkUploadHint", { defaultValue: "Each photo will create an item in this container" })}
                </p>
              </label>
            </div>

            {isBulkUploading && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex justify-between text-xs text-slate-700 font-bold">
                  <span>{t("containers.uploadingPhotos", { defaultValue: "Uploading photos..." })}</span>
                  <span>{t("containers.uploadProgress", { done: bulkProgress.done, total: bulkProgress.total, defaultValue: `${bulkProgress.done} of ${bulkProgress.total}` })}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${(bulkProgress.done / bulkProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkUploadOpen(false)}
              disabled={isBulkUploading}
              className="rounded-xl text-xs h-9 border-slate-200 font-semibold"
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 5. Clean Image Zoom Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent
          className="workspace-safe-dialog max-w-4xl max-h-[90vh] p-0 overflow-hidden rounded-3xl border-0 shadow-2xl bg-black/95 text-white"
          showCloseButton={false}
        >
          <div className="relative w-full h-[75vh] flex items-center justify-center select-none overflow-hidden">
            {selectedModalImage && (
              <img
                src={selectedModalImage}
                alt={t("containers.detailsTitle", { defaultValue: "Preview" })}
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: "center center",
                }}
                className="max-h-full max-w-full object-contain transition-transform duration-150"
                draggable={false}
              />
            )}

            {/* Top Close Button */}
            <button
              onClick={() => {
                setIsImageModalOpen(false);
                setZoomLevel(1);
              }}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/75 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Bottom Zoom Control Bar */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-black/75 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs shadow-lg">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
                className="p-1 text-white hover:text-slate-300 rounded transition-colors"
                title={t("containers.zoomOut", { defaultValue: "Zoom Out" })}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-slate-300 px-2 font-bold">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}
                className="p-1 text-white hover:text-slate-300 rounded transition-colors"
                title={t("containers.zoomIn", { defaultValue: "Zoom In" })}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="p-1 text-white hover:text-slate-300 rounded ml-1 transition-colors"
                title={t("containers.resetZoom", { defaultValue: "Reset" })}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. AI Recognition Modals with hideTrigger={true} to remove stray floating triggers */}
      <EnhancedImagesAIModal
        setIsVideoUploadOpen={setIsImagesUploadOpen}
        isVideoUploadOpen={isImagesUploadOpen}
        itemId={id || ""}
        setItems={setItems}
        userId={effectiveUserId}
        hideTrigger={true}
      />

      <EnhancedVideoAIModal
        setIsVideoUploadOpen={setIsVideoUploadOpen}
        isVideoUploadOpen={isVideoUploadOpen}
        itemId={id || ""}
        setItems={setItems}
        userId={effectiveUserId}
        hideTrigger={true}
      />

      {/* Global Modal Feedback */}
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

export default BinDetailsScreen;

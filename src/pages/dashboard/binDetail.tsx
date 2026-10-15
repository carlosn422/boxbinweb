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
  Tag,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Video,
  ArrowUpDown,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { getStripePlanById } from "@/lib/stripe";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";
import EnhancedVideoAIModal from "../billing/EnhancedVideoAIModal";
import EnhancedImagesAIModal from "../billing/EnhancedImageAIModal";
import { useTranslation } from "react-i18next";

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
  const storage = getStorage();
  const storageRef = ref(storage, `items/${Date.now()}-${file.name}`);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
};

const extractStoragePath = (url: string | null): string | null => {
  if (!url) return null;

  if (!url.includes("http") && !url.startsWith("gs://")) {
    return url;
  }

  if (url.includes("firebasestorage.googleapis.com")) {
    const match = decodeURIComponent(url).match(/\/o\/(.*?)\?/);
    return match?.[1] || null;
  }

  if (url.startsWith("gs://")) {
    const parts = url.replace("gs://", "").split("/");
    parts.shift();
    return parts.join("/");
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
  imageUrl?: string;
  cuantity: string;
  value: string;
  quantity?: string;
}

const BinDetailsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

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

  // Modal visibility states
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [isEditBinOpen, setIsEditBinOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [isDeletingBin, setIsDeletingBin] = useState(false);

  // Zoom image modal states
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedModalImage, setSelectedModalImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Item form states
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
  const [selectedLocation, setSelectedLocation] = useState<{
    name: string;
    coordinates: { lat: number; lng: number };
  } | null>(null);
  const [isUpdatingBin, setIsUpdatingBin] = useState(false);

  // AI Modal states
  const [isVideoUploadOpen, setIsVideoUploadOpen] = useState(false);
  const [isImagesUploadOpen, setIsImagesUploadOpen] = useState(false);

  const incrementQuantity = () => setItemCuantity((prev) => prev + 1);
  const decrementQuantity = () => setItemCuantity((prev) => Math.max(1, prev - 1));

  // Fetch subscription
  const fetchSubscription = async () => {
    if (!currentUser?.uid) return;
    try {
      const q = query(
        collection(db, "subscriptions"),
        where("userId", "==", currentUser.uid)
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
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
    }
  };

  // Fetch bin and items
  const loadData = async (showLoading = true) => {
    if (!id) return;
    try {
      if (showLoading) setLoading(true);
      await fetchSubscription();

      const binDocRef = doc(db, "bins", id);
      const binSnap = await getDoc(binDocRef);

      if (!binSnap.exists()) {
        setBin(null);
        setLoading(false);
        return;
      }

      const binData = binSnap.data() as Omit<BinDetails, "id">;
      setBin({ id: binSnap.id, ...binData });

      const itemsQuery = query(
        collection(db, "items"),
        where("binId", "==", id)
      );
      const itemsSnap = await getDocs(itemsQuery);

      const itemsData = itemsSnap.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      })) as Item[];

      setItems(itemsData);
    } catch (err) {
      console.error("Error fetching bin data:", err);
      toast.error("Failed to load container data");
    } finally {
      if (showLoading) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData(false);
    toast.success("Inventory updated");
  };

  // Bulk Upload
  const handleBulkUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const limit = Number(subscription?.metadata?.items) || 100;
    if (items.length + files.length > limit) {
      toast.error(`Your plan allows up to ${limit} items.`);
      return;
    }

    setIsBulkUploading(true);
    setBulkProgress({ done: 0, total: files.length });

    const storage = getStorage();
    const newItems: Item[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const filename = `bins/${id}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const generatedName = `${bin?.name || "Item"} #${String(items.length + i + 1).padStart(2, "0")}`;
        const itemData = {
          name: generatedName,
          description: "",
          cuantity: "1",
          value: "0",
          tags: [],
          createdAt: new Date().toISOString(),
          binId: id!,
          userId: currentUser?.uid,
          imageUrl: url,
        };

        const docRef = await addDoc(collection(db, "items"), itemData);
        newItems.push({ id: docRef.id, ...itemData });
      } catch (err) {
        console.error("Error uploading file index", i, err);
      } finally {
        setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setItems((prev) => [...prev, ...newItems]);
    setIsBulkUploading(false);
    setIsBulkUploadOpen(false);
    toast.success(`Successfully uploaded ${newItems.length} items`);
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
    const limit = Number(subscription?.metadata?.items) || 100;
    if (items.length >= limit) {
      toast.error(`Plan limit of ${limit} items reached.`);
      return;
    }

    if (!itemName.trim()) {
      toast.error("Please enter an item name");
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
            "Image upload failed. Do you want to continue without an image?"
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
        value: itemValue ? itemValue.toString().trim() : "0",
        tags: itemTags,
        createdAt: new Date().toISOString(),
        binId: id!,
        userId: currentUser?.uid,
        ...(imageUrl && { imageUrl }),
      };

      const docRef = await addDoc(collection(db, "items"), itemData);
      const newItem = { id: docRef.id, ...itemData };

      setItems((prev) => [newItem, ...prev]);
      setIsAddItemOpen(false);
      resetItemForm();
      toast.success("Item added successfully");
    } catch (error) {
      console.error("Error adding item:", error);
      toast.error("Failed to add item");
    } finally {
      setIsSavingItem(false);
    }
  };

  // Update existing item
  const handleUpdateItem = async () => {
    if (!itemName.trim()) {
      toast.error("Please enter an item name");
      return;
    }

    if (!currentItem) return;

    try {
      setIsSavingItem(true);
      const itemRef = doc(db, "items", currentItem.id);

      const updateData: Partial<Item> = {
        name: itemName.trim(),
        description: itemDescription.trim(),
        tags: itemTags,
        value: itemValue ? itemValue.toString().trim() : "0",
        cuantity: itemCuantity.toString(),
      };

      if (selectedFile && selectedImage !== currentItem.imageUrl) {
        if (currentItem.imageUrl) {
          try {
            const oldImagePath = extractStoragePath(currentItem.imageUrl);
            if (oldImagePath) {
              const storage = getStorage();
              await deleteObject(ref(storage, oldImagePath));
            }
          } catch (e) {
            console.warn("Could not delete old image:", e);
          }
        }

        const newImageUrl = await uploadImage(selectedFile);
        updateData.imageUrl = newImageUrl;
      }

      await updateDoc(itemRef, updateData);

      setItems((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, ...updateData } : item
        )
      );

      resetItemForm();
      setIsEditItemOpen(false);
      toast.success("Item updated successfully");
    } catch (error) {
      console.error("Error updating item:", error);
      toast.error("Failed to update item");
    } finally {
      setIsSavingItem(false);
    }
  };

  // Delete item
  const deleteItem = async (itemId: string, imageUrl: string | undefined) => {
    try {
      await deleteDoc(doc(db, "items", itemId));

      if (imageUrl) {
        try {
          const path = extractStoragePath(imageUrl);
          if (path) {
            const storage = getStorage();
            await deleteObject(ref(storage, path));
          }
        } catch (e) {
          console.warn("Could not delete item image:", e);
        }
      }

      setItems((prev) => prev.filter((item) => item.id !== itemId));
      toast.success("Item deleted");
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Failed to delete item");
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
        toast.error("Container name is required");
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

      if (!id) return;
      await updateDoc(doc(db, "bins", id), updatePayload);

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
      toast.success("Container updated successfully");
      openModal("success", "Container updated successfully!");
    } catch (error: any) {
      console.error("Error updating bin:", error);
      toast.error("Failed to update container");
      openModal("error", error?.message || "Failed to update container");
    } finally {
      setIsUpdatingBin(false);
    }
  };

  // Delete container entirely
  const handleDeleteBin = async () => {
    if (!id) return;
    try {
      setIsDeletingBin(true);

      for (const item of items) {
        await deleteDoc(doc(db, "items", item.id));
        if (item.imageUrl) {
          const path = extractStoragePath(item.imageUrl);
          if (path) {
            try {
              const storage = getStorage();
              await deleteObject(ref(storage, path));
            } catch (e) {
              console.warn("Storage deletion ignored:", e);
            }
          }
        }
      }

      await deleteDoc(doc(db, "bins", id));
      toast.success("Container deleted successfully");
      navigate("/home");
    } catch (err) {
      console.error("Error deleting bin:", err);
      toast.error("Failed to delete container");
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-slate-800 mb-3" />
        <p className="text-xs text-slate-500 font-medium">Loading container details...</p>
      </div>
    );
  }

  if (!bin) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-xl border border-slate-200/80 p-8 max-w-md w-full text-center shadow-xs">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto text-slate-400 mb-3">
            <Package className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Container not found</h2>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            The requested container could not be found or may have been deleted.
          </p>
          <Button
            onClick={() => navigate("/home")}
            className="h-8 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-12 font-sans">
      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-7xl space-y-4">
        {/* Compact Top Bar matching home.tsx */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Identity */}
          <div className="flex items-center space-x-3 min-w-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/home")}
              className="h-8 w-8 p-0 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg shrink-0 shadow-2xs"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
                  {bin.name}
                </h1>
                {bin.location?.name && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70 inline-flex items-center gap-1 shrink-0">
                    <MapPin className="w-2.5 h-2.5" />
                    <span>{bin.location.name}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xl">
                {bin.description || bin.address || (
                  <span className="text-slate-400">Created {new Date(bin.createdAt).toLocaleDateString()}</span>
                )}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg text-xs shadow-2xs"
              title="Refresh container"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600" : "text-slate-500"
                  }`}
              />
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleEditBin}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg text-xs shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5 mr-1 text-slate-500" />
              <span>{t("containers.edit", { defaultValue: "Edit" })}</span>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 border-slate-200 text-slate-500 rounded-lg text-xs shadow-2xs"
                  title="Delete Container"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-xl border border-slate-200 shadow-xl bg-white max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base font-bold text-slate-900">
                    Delete "{bin.name}"?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                    This will permanently delete this container and all{" "}
                    <strong>{items.length} items</strong> stored inside it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="pt-2">
                  <AlertDialogCancel className="rounded-lg border-slate-200 text-xs h-8">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteBin}
                    disabled={isDeletingBin}
                    className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs h-8 font-medium"
                  >
                    {isDeletingBin ? "Deleting..." : "Delete Container"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              onClick={() => {
                resetItemForm();
                setIsAddItemOpen(true);
              }}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("containers.addItem", { defaultValue: "Add Item" })}</span>
            </Button>
          </div>
        </div>

        {/* Space-Optimized KPI Stat Ribbon (Exactly 62px height, 3 cards matching home.tsx) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Total Items */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <Package className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Items
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {totalItemsCount}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              In this container
            </span>
          </div>

          {/* Card 2: Total Units */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Units
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {totalUnitsCount}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              Quantity sum
            </span>
          </div>

          {/* Card 3: Total Valuation */}
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Estimated Value
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  ${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              Valuation
            </span>
          </div>
        </div>

        {/* Integrated Unified Controls Row matching home.tsx */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items by name, tag, or description..."
              className="pl-8 pr-7 h-8 bg-slate-50/80 border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:bg-white focus:border-slate-300"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter, Sort, Tools & View Mode Toggle */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
            {/* Tag Filter Dropdown */}
            {allTags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 px-2.5 rounded-lg border-slate-200 text-xs font-medium ${selectedTag ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-600 bg-white"
                      }`}
                  >
                    <Tag className="w-3 h-3 mr-1 text-slate-400" />
                    <span>{selectedTag ? `#${selectedTag}` : "All Tags"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 text-xs">
                  <DropdownMenuLabel className="text-[11px] text-slate-400 uppercase">
                    Filter by Tag
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setSelectedTag(null)}
                    className="cursor-pointer"
                  >
                    <span className={!selectedTag ? "font-bold text-slate-900" : ""}>
                      All tags
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {allTags.map((tItem) => (
                    <DropdownMenuItem
                      key={tItem}
                      onClick={() => setSelectedTag(tItem)}
                      className="cursor-pointer flex items-center justify-between"
                    >
                      <span className={selectedTag === tItem ? "font-bold text-blue-600" : ""}>
                        #{tItem}
                      </span>
                      {selectedTag === tItem && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 bg-white border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  <span className="hidden sm:inline">Sort</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 text-xs">
                <DropdownMenuLabel className="text-[11px] text-slate-400 uppercase">
                  Sort Order
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setSortBy("date")}
                  className={`cursor-pointer ${sortBy === "date" ? "font-bold text-slate-900" : ""}`}
                >
                  Recently Added
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("name")}
                  className={`cursor-pointer ${sortBy === "name" ? "font-bold text-slate-900" : ""}`}
                >
                  Name (A - Z)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("value-desc")}
                  className={`cursor-pointer ${sortBy === "value-desc" ? "font-bold text-slate-900" : ""}`}
                >
                  Value (Highest)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("qty-desc")}
                  className={`cursor-pointer ${sortBy === "qty-desc" ? "font-bold text-slate-900" : ""}`}
                >
                  Quantity (Highest)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk Upload Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkUploadOpen(true)}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg text-xs shadow-2xs"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1 text-slate-500" />
              <span>Bulk Upload</span>
            </Button>

            {/* AI Tools Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg text-xs shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-slate-500" />
                  <span>AI Tools</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <DropdownMenuLabel className="text-[11px] text-slate-400 uppercase">
                  AI Recognition
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setIsImagesUploadOpen(true)}
                  className="cursor-pointer space-x-2"
                >
                  <ImageIcon className="w-4 h-4 text-slate-600" />
                  <div>
                    <div className="font-medium text-slate-900">Scan from Photos</div>
                    <div className="text-[10px] text-slate-400">Detect items automatically</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsVideoUploadOpen(true)}
                  className="cursor-pointer space-x-2"
                >
                  <Video className="w-4 h-4 text-slate-600" />
                  <div>
                    <div className="font-medium text-slate-900">Scan from Video</div>
                    <div className="text-[10px] text-slate-400">Process video walk-through</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Mode Toggle matching home.tsx */}
            <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200/80 rounded-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                className={`h-7 w-7 p-0 rounded-md ${viewMode === "grid"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-400 hover:text-slate-700"
                  }`}
                title="Grid view"
              >
                <Grid className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("list")}
                className={`h-7 w-7 p-0 rounded-md ${viewMode === "list"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-400 hover:text-slate-700"
                  }`}
                title="List view"
              >
                <List className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Empty State matching home.tsx */}
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center max-w-md mx-auto my-6">
            <div className="w-10 h-10 mx-auto mb-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400">
              <Package className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {searchQuery || selectedTag ? "No items found" : "No items yet"}
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {searchQuery || selectedTag
                ? "Try adjusting your search terms or filters."
                : "Add items manually or use bulk upload to populate this container."}
            </p>
            {searchQuery || selectedTag ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedTag(null);
                }}
                className="h-8 px-3 border-slate-200 text-xs text-slate-700"
              >
                Clear filter
              </Button>
            ) : (
              <Button
                onClick={() => {
                  resetItemForm();
                  setIsAddItemOpen(true);
                }}
                className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>Add First Item</span>
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View matching home.tsx card proportions */
          <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredItems.map((item) => {
              const qty = Number(item.quantity ?? item.cuantity) || 1;
              const val = Number(item.value) || 0;

              return (
                <div
                  key={item.id}
                  className="group relative bg-white rounded-xl border border-slate-200/90 hover:border-slate-300 p-3 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    {/* Item Image */}
                    <div
                      className="relative aspect-[16/10] bg-slate-100 rounded-lg overflow-hidden cursor-pointer select-none"
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
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/95 border border-slate-200/80 text-slate-800 font-mono text-[10px] font-semibold shadow-2xs">
                          x{qty}
                        </span>
                      </div>

                      {val > 0 && (
                        <div className="absolute top-2 right-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-900/90 text-white font-mono text-[10px] font-semibold shadow-2xs">
                            ${val.toFixed(2)}
                          </span>
                        </div>
                      )}

                      {/* Hover Zoom Eye */}
                      {item.imageUrl && (
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-white/90 text-slate-800 flex items-center justify-center shadow-xs">
                            <ZoomIn className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Title & Description */}
                    <div className="mt-2.5">
                      <h3
                        className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate text-sm leading-tight"
                        title={item.name}
                      >
                        {item.name}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mt-1">
                        {item.description || (
                          <span className="text-slate-300 italic">No description</span>
                        )}
                      </p>
                    </div>

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.tags.map((tg, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium"
                          >
                            #{tg}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer Info & Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 mt-2.5">
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.createdAt || 0).toLocaleDateString()}
                    </span>

                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditItem(item)}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded"
                        title="Edit Item"
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-xl border border-slate-200 shadow-xl bg-white max-w-sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-base font-bold text-slate-900">
                              Delete "{item.name}"?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-500">
                              Are you sure you want to delete this item?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="pt-2">
                            <AlertDialogCancel className="rounded-lg border-slate-200 text-xs h-8">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteItem(item.id, item.imageUrl)}
                              className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs h-8 font-medium"
                            >
                              Delete
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
        ) : (
          /* List View matching renderListView in home.tsx */
          <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            {filteredItems.map((item) => {
              const qty = Number(item.quantity ?? item.cuantity) || 1;
              const val = Number(item.value) || 0;

              return (
                <div
                  key={item.id}
                  className="group flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/80 transition-colors"
                >
                  {/* Left: Thumbnail & Name */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden cursor-pointer shrink-0 border border-slate-200/70"
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
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate text-xs">
                          {item.name}
                        </span>
                        {val > 0 && (
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-700 font-mono text-[10px] h-4 px-1"
                          >
                            ${val.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-slate-400 truncate max-w-md">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Quantity & Actions */}
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <span className="font-semibold text-slate-700 min-w-[60px] text-right">
                      x{qty} units
                    </span>

                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditItem(item)}
                        className="h-7 w-7 p-0 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded"
                        title="Edit Item"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-xl border border-slate-200 shadow-xl bg-white max-w-sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-base font-bold text-slate-900">
                              Delete "{item.name}"?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-500">
                              Are you sure you want to delete this item?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="pt-2">
                            <AlertDialogCancel className="rounded-lg border-slate-200 text-xs h-8">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteItem(item.id, item.imageUrl)}
                              className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs h-8 font-medium"
                            >
                              Delete
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

      {/* =========================================================================
          MODALS & DIALOGS
         ========================================================================= */}

      {/* 1. Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="max-w-md rounded-xl border border-slate-200 shadow-xl p-5 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-sm font-bold text-slate-900">
              {t("containers.addNewItem", { defaultValue: "Add New Item" })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            {/* Image Dropzone */}
            <div>
              <Label className="text-xs font-medium text-slate-700 block mb-1">
                Photo (Optional)
              </Label>
              <div className="border border-dashed border-slate-200 rounded-lg p-2.5 text-center hover:border-slate-400 transition-all bg-slate-50/50">
                {selectedImage ? (
                  <div className="flex items-center space-x-3">
                    <img
                      src={selectedImage}
                      alt="Preview"
                      className="w-14 h-14 object-cover rounded-md border border-slate-200"
                    />
                    <div className="text-left flex-1">
                      <p className="text-xs font-medium text-slate-800">Photo attached</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImage(null);
                          setSelectedFile(null);
                        }}
                        className="text-xs text-red-600 hover:underline mt-0.5"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex items-center justify-center space-x-2 py-2">
                    <ImageIcon className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-blue-600 hover:underline font-medium">
                      Select photo
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

            {/* Name */}
            <div>
              <Label htmlFor="itemName" className="text-xs font-medium text-slate-700 block mb-1">
                Name *
              </Label>
              <Input
                id="itemName"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Item name"
                className="h-8 text-xs rounded-lg border-slate-200"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="itemDesc" className="text-xs font-medium text-slate-700 block mb-1">
                Description
              </Label>
              <Textarea
                id="itemDesc"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Description, model, notes..."
                rows={2}
                className="text-xs rounded-lg border-slate-200"
              />
            </div>

            {/* Quantity & Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="itemQty" className="text-xs font-medium text-slate-700 block mb-1">
                  Quantity
                </Label>
                <div className="flex items-center space-x-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={decrementQuantity}
                    className="h-8 w-8 p-0 rounded-lg border-slate-200"
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <Input
                    id="itemQty"
                    type="number"
                    min={1}
                    value={itemCuantity}
                    onChange={(e) => setItemCuantity(Math.max(1, Number(e.target.value)))}
                    className="h-8 text-xs text-center rounded-lg border-slate-200"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={incrementQuantity}
                    className="h-8 w-8 p-0 rounded-lg border-slate-200"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="itemVal" className="text-xs font-medium text-slate-700 block mb-1">
                  Value ($)
                </Label>
                <div className="relative">
                  <DollarSign className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="itemVal"
                    type="number"
                    min={0}
                    step={0.01}
                    value={itemValue}
                    onChange={(e) => setItemValue(e.target.value)}
                    placeholder="0.00"
                    className="h-8 pl-6 text-xs rounded-lg border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-xs font-medium text-slate-700 block mb-1">
                Tags
              </Label>
              <div className="flex space-x-1.5">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="h-8 text-xs rounded-lg border-slate-200"
                />
                <Button
                  type="button"
                  onClick={handleAddTag}
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 rounded-lg text-xs border-slate-200 bg-white"
                >
                  Add
                </Button>
              </div>

              {itemTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {itemTags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddItemOpen(false);
                resetItemForm();
              }}
              className="rounded-lg text-xs h-8 border-slate-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitItem}
              disabled={isSavingItem || !itemName.trim()}
              size="sm"
              className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs h-8 font-semibold"
            >
              {isSavingItem ? "Saving..." : "Add Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Edit Item Dialog */}
      <Dialog open={isEditItemOpen} onOpenChange={setIsEditItemOpen}>
        <DialogContent className="max-w-md rounded-xl border border-slate-200 shadow-xl p-5 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-sm font-bold text-slate-900">
              Edit Item
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            {/* Image Dropzone */}
            <div>
              <Label className="text-xs font-medium text-slate-700 block mb-1">
                Photo
              </Label>
              <div className="border border-dashed border-slate-200 rounded-lg p-2.5 text-center hover:border-slate-400 transition-all bg-slate-50/50">
                {selectedImage ? (
                  <div className="flex items-center space-x-3">
                    <img
                      src={selectedImage}
                      alt="Preview"
                      className="w-14 h-14 object-cover rounded-md border border-slate-200"
                    />
                    <div className="text-left flex-1">
                      <p className="text-xs font-medium text-slate-800">Photo attached</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImage(null);
                          setSelectedFile(null);
                        }}
                        className="text-xs text-red-600 hover:underline mt-0.5"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex items-center justify-center space-x-2 py-2">
                    <ImageIcon className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-blue-600 hover:underline font-medium">
                      Select photo
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

            {/* Name */}
            <div>
              <Label htmlFor="editItemName" className="text-xs font-medium text-slate-700 block mb-1">
                Name *
              </Label>
              <Input
                id="editItemName"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Item name"
                className="h-8 text-xs rounded-lg border-slate-200"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="editItemDesc" className="text-xs font-medium text-slate-700 block mb-1">
                Description
              </Label>
              <Textarea
                id="editItemDesc"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Item description"
                rows={2}
                className="text-xs rounded-lg border-slate-200"
              />
            </div>

            {/* Quantity & Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="editItemQty" className="text-xs font-medium text-slate-700 block mb-1">
                  Quantity
                </Label>
                <div className="flex items-center space-x-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={decrementQuantity}
                    className="h-8 w-8 p-0 rounded-lg border-slate-200"
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <Input
                    id="editItemQty"
                    type="number"
                    min={1}
                    value={itemCuantity}
                    onChange={(e) => setItemCuantity(Math.max(1, Number(e.target.value)))}
                    className="h-8 text-xs text-center rounded-lg border-slate-200"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={incrementQuantity}
                    className="h-8 w-8 p-0 rounded-lg border-slate-200"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="editItemVal" className="text-xs font-medium text-slate-700 block mb-1">
                  Value ($)
                </Label>
                <div className="relative">
                  <DollarSign className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="editItemVal"
                    type="number"
                    min={0}
                    step={0.01}
                    value={itemValue}
                    onChange={(e) => setItemValue(e.target.value)}
                    placeholder="0.00"
                    className="h-8 pl-6 text-xs rounded-lg border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-xs font-medium text-slate-700 block mb-1">
                Tags
              </Label>
              <div className="flex space-x-1.5">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="h-8 text-xs rounded-lg border-slate-200"
                />
                <Button
                  type="button"
                  onClick={handleAddTag}
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 rounded-lg text-xs border-slate-200 bg-white"
                >
                  Add
                </Button>
              </div>

              {itemTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {itemTags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditItemOpen(false);
                resetItemForm();
              }}
              className="rounded-lg text-xs h-8 border-slate-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateItem}
              disabled={isSavingItem || !itemName.trim()}
              size="sm"
              className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs h-8 font-semibold"
            >
              {isSavingItem ? "Updating..." : "Update Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Edit Container Dialog */}
      <Dialog open={isEditBinOpen} onOpenChange={setIsEditBinOpen}>
        <DialogContent className="max-w-md rounded-xl border border-slate-200 shadow-xl p-5 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-sm font-bold text-slate-900">
              Edit Container
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="binName" className="text-xs font-medium text-slate-700 block mb-1">
                Name *
              </Label>
              <Input
                id="binName"
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                placeholder="Container name"
                className="h-8 text-xs rounded-lg border-slate-200"
              />
            </div>

            <div>
              <Label htmlFor="binDesc" className="text-xs font-medium text-slate-700 block mb-1">
                Description
              </Label>
              <Textarea
                id="binDesc"
                value={binDescription}
                onChange={(e) => setBinDescription(e.target.value)}
                placeholder="Description or notes"
                rows={2}
                className="text-xs rounded-lg border-slate-200"
              />
            </div>

            <div>
              <Label htmlFor="binAddress" className="text-xs font-medium text-slate-700 block mb-1">
                Address / Location
              </Label>
              <Input
                id="binAddress"
                value={binAddress}
                onChange={(e) => setBinAddress(e.target.value)}
                placeholder="Shelf, room, or physical address"
                className="h-8 text-xs rounded-lg border-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditBinOpen(false)}
              className="rounded-lg text-xs h-8 border-slate-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateBin}
              disabled={isUpdatingBin || !binName.trim()}
              size="sm"
              className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs h-8 font-semibold"
            >
              {isUpdatingBin ? (
                <span className="flex items-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </span>
              ) : (
                "Update Container"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. Bulk Upload Dialog */}
      <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
        <DialogContent className="max-w-md rounded-xl border border-slate-200 shadow-xl p-5 bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-sm font-bold text-slate-900">
              Bulk Upload Photos
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            <div className="border border-dashed border-slate-200 rounded-lg p-5 text-center bg-slate-50/50 hover:border-slate-400 transition-all">
              <input
                type="file"
                id="bulkUploadInput"
                accept="image/*"
                multiple
                disabled={isBulkUploading}
                onChange={(e) => handleBulkUpload(e.target.files)}
                className="hidden"
              />
              <label
                htmlFor="bulkUploadInput"
                className="cursor-pointer flex flex-col items-center justify-center space-y-1.5"
              >
                <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-2xs">
                  <UploadCloud className="w-4.5 h-4.5 text-slate-700" />
                </div>
                <span className="text-xs font-semibold text-slate-900">
                  Select multiple photos
                </span>
                <p className="text-[11px] text-slate-400">
                  Each photo will create an item in this container
                </p>
              </label>
            </div>

            {isBulkUploading && (
              <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                <div className="flex justify-between text-xs text-slate-600 font-medium">
                  <span>Uploading photos...</span>
                  <span>{bulkProgress.done} of {bulkProgress.total}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-slate-900 h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${(bulkProgress.done / bulkProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkUploadOpen(false)}
              disabled={isBulkUploading}
              className="rounded-lg text-xs h-8 border-slate-200"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 5. Clean Image Zoom Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent
          className="max-w-3xl max-h-[85vh] p-0 overflow-hidden rounded-xl border-0 shadow-2xl bg-black/90 text-white"
          showCloseButton={false}
        >
          <div className="relative w-full h-[70vh] flex items-center justify-center select-none overflow-hidden">
            {selectedModalImage && (
              <img
                src={selectedModalImage}
                alt="Full Preview"
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
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Bottom Zoom Bar */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
                className="p-1 text-white hover:text-slate-300 rounded"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] text-slate-300">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}
                className="p-1 text-white hover:text-slate-300 rounded"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="p-1 text-white hover:text-slate-300 rounded ml-1"
                title="Reset"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. AI Image & Video Recognition Modals */}
      <EnhancedImagesAIModal
        setIsVideoUploadOpen={setIsImagesUploadOpen}
        isVideoUploadOpen={isImagesUploadOpen}
        itemId={id}
        setItems={setItems}
      />

      <EnhancedVideoAIModal
        setIsVideoUploadOpen={setIsVideoUploadOpen}
        isVideoUploadOpen={isVideoUploadOpen}
        itemId={id}
        setItems={setItems}
      />

      {/* Feedback Modal */}
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

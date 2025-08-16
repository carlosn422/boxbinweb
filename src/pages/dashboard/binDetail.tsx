import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Plus,
  Trash2,
  MapPin,
  Calendar,
  Package,
  ImageIcon,
  X,
  Minus,
  Loader2,
  Upload,
  Video,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

import { getFunctions, httpsCallable } from "firebase/functions";

export const uploadImage = async (file: File): Promise<string> => {
  const storage = getStorage();
  const storageRef = ref(storage, `items/${Date.now()}-${file.name}`);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
};

const extractStoragePath = (url: string | null): string | null => {
  if (!url) return null;

  // 1. Si ya es un path válido (sin dominios ni tokens)
  if (!url.includes("http") && !url.startsWith("gs://")) {
    return url;
  }

  // 2. Si es una URL pública de Firebase Storage
  if (url.includes("firebasestorage.googleapis.com")) {
    const match = decodeURIComponent(url).match(/\/o\/(.*?)\?/);
    return match?.[1] || null;
  }

  // 3. Si es una URL gs://bucket/path
  if (url.startsWith("gs://")) {
    const parts = url.replace("gs://", "").split("/");
    parts.shift(); // remove bucket name
    return parts.join("/");
  }

  // Si no coincide con ningún formato conocido
  return null;
};

// types.ts
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
}

const BinDetailsScreen: React.FC = () => {
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

  // States
  const [bin, setBin] = useState<BinDetails | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isEditBinOpen, setIsEditBinOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedModalImage, setSelectedModalImage] = useState<
    string | undefined | null
  >(null);

  const incrementQuantity = () => setItemCuantity((prev: any) => prev + 1);
  const decrementQuantity = () =>
    setItemCuantity((prev: any) => Math.max(0, prev - 1));
  // Form states
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemCuantity, setItemCuantity] = useState<number>(1);
  const [itemValue, setItemValue] = useState<any>("");
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentItem, setCurrentItem] = useState<Item | null>(null);

  // Bin form states
  const [binName, setBinName] = useState("");
  const [binDescription, setBinDescription] = useState("");
  const [binAddress, setBinAddress] = useState("");

  const [error, setError] = useState("");

  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const handleBulkUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Control de límites (opcional)
    const limit = Number(subscription?.metadata?.items) || 100;
    if (files.length > limit) {
      alert(`You can upload up to ${limit} items at once.`);
      return;
    }

    setIsBulkUploading(true);
    setBulkProgress({ done: 0, total: files.length });

    const storage = getStorage();
    const newItems: Item[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        // Aquí podrías agregar redimensionamiento con una librería web si quieres

        // Subir a Firebase Storage
        const filename = `bins/${id}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        // Crear item minimalista en Firestore
        const itemName = `${bin?.name}_${String(i + 1).padStart(3, "0")}`;
        const itemData = {
          name: itemName,
          description: "",
          cuantity: "0",
          value: "0",
          tags: [],
          createdAt: new Date().toISOString(),
          binId: id,
          userId: "",
          imageUrl: url,
        };

        const docRef = await addDoc(collection(db, "items"), itemData);
        newItems.push({ id: docRef.id, ...itemData, binId: id! });
      } catch (err) {
        console.error("Error uploading file index", i, err);
        // Puedes decidir mostrar error o continuar
      } finally {
        setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setItems((prev: any) => [...prev, ...newItems]);
    setIsBulkUploading(false);
    setIsBulkUploadOpen(false);
    //alert(`Bulk upload complete: ${newItems.length} items created.`);
  };

  useEffect(() => {
    console.log(error);
    const fetchData = async () => {
      try {
        setLoading(true);

        await fetchSubscription();
        setError("");

        const binDocRef = doc(db, "bins", id!);
        const binSnap = await getDoc(binDocRef);

        if (!binSnap.exists()) {
          setError("Container not found");
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

        const itemsData = itemsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Item[];

        setItems(itemsData);
      } catch (err) {
        console.error("Error fetching bin data:", err);
        setError("Error fetching container data");
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
  }, [id]);

  const handleAddTag = () => {
    if (newTag.trim() && !itemTags.includes(newTag.trim())) {
      setItemTags([...itemTags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setItemTags(itemTags.filter((tag) => tag !== tagToRemove));
  };

  const handleEditItem = (item: Item) => {
    console.log(currentItem);
    console.log(item);
    setCurrentItem(item);
    setItemName(item.name);
    setItemDescription(item.description);
    setItemCuantity(Number(item.cuantity));
    setItemValue(Number(item.value));
    setItemTags(item.tags);
    setSelectedImage(item.imageUrl || null);
    setIsEditItemOpen(true);
  };

  const handleUpdateItem = async () => {
    if (!itemName.trim()) {
      setModalState({
        isOpen: true,
        type: "error",
        message: "Please enter an item name",
      });
      return;
    }

    try {
      if (!currentItem) {
        setModalState({
          isOpen: true,
          type: "error",
          message: "No item selected",
        });
        return;
      }

      const itemRef = doc(db, "items", currentItem.id);

      // Prepara datos a actualizar
      const updateData: Partial<Item> = {
        name: itemName.trim(),
        description: itemDescription.trim(),
        tags: itemTags,
        value: itemValue?.toString(),
        cuantity: itemCuantity?.toString(),
      };

      // Si la imagen cambió y hay una imagen anterior
      if (selectedFile && selectedImage !== currentItem.imageUrl) {
        if (currentItem.imageUrl) {
          try {
            const storage = getStorage();
            // Extraer ruta relativa en storage para eliminar
            const oldImagePath = extractStoragePath(
              currentItem?.imageUrl ?? null
            );
            if (oldImagePath) {
              const oldImageRef = ref(storage, oldImagePath);
              await deleteObject(oldImageRef);
              console.log("Old image deleted");
            } else {
              console.warn("No se pudo extraer un path válido de la URL");
            }

            console.log("Old image deleted");
          } catch (error) {
            console.warn("Error deleting old image", error);
          }
        }

        // Subir nueva imagen
        const newImageUrl = await uploadImage(selectedFile);
        updateData.imageUrl = newImageUrl;
      }

      // Actualizar Firestore
      await updateDoc(itemRef, updateData);

      // Actualizar estado local
      setItems((prev: any) =>
        prev.map((item: any) =>
          item.id === currentItem.id ? { ...item, ...updateData } : item
        )
      );

      // Reset form y cerrar modal
      resetItemForm();
      setIsEditItemOpen(false);

      setModalState({
        isOpen: true,
        type: "success",
        message: "Item updated successfully",
      });
    } catch (error) {
      console.error("Error updating item", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Failed to update item",
      });
    } finally {
      //setIsUploading(false);
    }
  };

  const handleEditBin = () => {
    if (bin) {
      setBinName(bin.name);
      setBinDescription(bin.description);
      setBinAddress(bin.address);
      setIsEditBinOpen(true);
      console.log(bin);
      setSelectedLocation(bin.location ?? null);
    }
  };

  const resetItemForm = () => {
    setItemName("");
    setItemDescription("");
    setItemTags([]);
    setSelectedImage(null);
    setCurrentItem(null);
  };

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  const [subscription, setSubscription] = useState<any | null>(null);

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

          console.log(stripePlan);
          const fullSubscription = {
            ...sub,
            plan: stripePlan?.product?.name ?? "Unknown Plan",
            price: (stripePlan?.unit_amount ?? 0) / 100,
            interval: stripePlan?.recurring?.interval ?? "month",
            metadata: stripePlan?.metadata ?? {},
          };

          console.log(fullSubscription);

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

  const handleSubmitItem = async () => {
    // Verificar si ya alcanzó el límite
    if (items.length >= Number(subscription?.metadata?.items)) {
      toast.error(
        `You have reached the limit of ${subscription?.metadata?.items} items for your plan.`
      );
      return;
    }

    if (!itemName.trim()) {
      toast.error("Please enter an item name"); // o un alert nativo
      return;
    }

    try {
      let imageUrl: string | null = null;

      console.log(selectedFile, " archivo");
      if (selectedFile) {
        try {
          imageUrl = await uploadImage(selectedFile);
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          const proceed = window.confirm(
            "Image upload failed. Do you want to continue without an image?"
          );
          if (!proceed) {
            //setIsUploading(false);
            return;
          }
        }
      }

      await createItem(imageUrl);
    } catch (error) {
      console.error("Error adding item:", error);
      toast.error("Failed to add item");
    } finally {
      //setIsUploading(false);
    }
  };

  const createItem = async (imageUrl: string | null = null) => {
    try {
      const itemData = {
        name: itemName.trim(),
        description: itemDescription.trim(),
        cuantity: itemCuantity?.toString()?.trim(),
        value: itemValue?.toString()?.trim(),
        tags: itemTags,
        createdAt: new Date().toISOString(),
        binId: id,
        userId: currentUser?.uid,
        ...(imageUrl && { imageUrl }),
      };

      const docRef = await addDoc(collection(db, "items"), itemData);
      const newItem = { id: docRef.id, ...itemData };

      setItems((prevItems: any) => [...prevItems, newItem]);
      setIsAddItemOpen(false);
      resetItemForm();

      toast.success("Item added successfully");
    } catch (error) {
      console.log(error);
    }
  };

  const handleUpdateBin = async () => {
    // aquí va tu lógica de update en Firestore…
  };

  const deleteItem = async (itemId: string, imageUrl: string | undefined) => {
    try {
      await deleteDoc(doc(db, "items", itemId));

      if (imageUrl) {
        const path = extractStoragePath(imageUrl);

        if (path) {
          const storage = getStorage();
          const storageRef = ref(storage, path);
          await deleteObject(storageRef);
          console.log("Archivo eliminado");
        } else {
          console.warn("No se pudo extraer un path válido de la URL");
        }
      }

      // Update the local state
      setItems((prevItems: any) => prevItems.filter((item: any) => item.id !== itemId));
      //toast.success( 'Item deleted successfully');
      setModalState({
        isOpen: true,
        type: "success",
        message: "Item deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting item:", error);
      //toast.error( 'Failed to delete item');
      setModalState({
        isOpen: true,
        type: "error",
        message: "Failed to delete item",
      });
    }
  };

  const [selectedLocation, setSelectedLocation] = useState<{ name: string; coordinates: { lat: number; lng: number } } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setIsUploading(false);
  }, []);

  // Add these state variables with your other useState declarations
  const [isVideoUploadOpen, setIsVideoUploadOpen] = useState(false);
const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
const [videoPreview, setVideoPreview] = useState<string | null>(null);
const [videoUploadProgress, setVideoUploadProgress] = useState(0);
const [detectedItems, setDetectedItems] = useState<any[]>([]);
const [showResults, setShowResults] = useState<boolean>(false);
const [processingId, setProcessingId] = useState<string | null>(null);
const [isPolling, setIsPolling] = useState<boolean>(false);
// Removed unused pollingError state

  // Add these functions
  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file");
      return;
    }

    // Create video element to check duration
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      const duration = video.duration;

      // Check duration (5 seconds to 2 minutes)
      if (duration < 5) {
        alert("Video must be at least 5 seconds long");
        return;
      }

      if (duration > 120) {
        alert("Video must be less than 2 minutes long");
        return;
      }

      // If validation passes, set the video
      setSelectedVideo(file);
      setVideoPreview(URL.createObjectURL(file));
    };

    video.src = URL.createObjectURL(file);
  };

  const handleVideoSubmit = async () => {
    if (!selectedVideo) return;
    setIsUploading(true);
    setVideoUploadProgress(0);
    setDetectedItems([]);
    setShowResults(false);
    setProcessingId(null);

    try {
      // Prepare FormData
      const formData = new FormData();
      formData.append("videoFile", selectedVideo);
      // Use fetch for upload
      const response = await fetch("https://boxbinapi-iv6wi.ondigitalocean.app/api/v1/gemini-video/process-video", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.processingId) {
        setProcessingId(data.processingId);
        setIsPolling(true);
        toast.success("Video processing started!");
      } else {
        setIsUploading(false);
        toast.error("Failed to start video processing");
      }
    } catch (err) {
      setIsUploading(false);
      toast.error("Error uploading video");
    }
};

  const resetVideoForm = () => {
    setSelectedVideo(null);
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }
    setVideoUploadProgress(0);
    setDetectedItems([]);
    setShowResults(false);
    setProcessingId(null);
    setIsPolling(false);

  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPolling && processingId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`https://boxbinapi-iv6wi.ondigitalocean.app/api/v1/gemini-video/process-video/status/${processingId}`);
          const statusData = await res.json();
          if (statusData.success && statusData.data?.status === "completed") {
            setDetectedItems(statusData.data.result.items || []);
            setShowResults(true);
            setIsUploading(false);
            setIsPolling(false);
            toast.success("Video processing completed!");
          } else if (statusData.data?.status === "failed") {

            setIsUploading(false);
            setIsPolling(false);
            toast.error("Video processing failed");
          }
        } catch (err) {

        }
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
}, [isPolling, processingId]);

// Manejo de ítems detectados con subida a Firestore
const handleAddDetectedItem = async (item: any) => {
  try {
    // 1. Obtener path relativo desde signed URL
    //const path = getStoragePathFromUrl(item.image_url);

    // 2. Mover imagen a nueva carpeta
    //const newImageUrl = await moveFileInFirebase(path, "items");
    const functions = getFunctions();
    const newImageUrl = await httpsCallable(functions, "moveImageToFinal")({
      imageUrl: item?.image_url,
      newFolder: "items"
    });
    // Crear datos para Firestore
    const newItemData = {
      name: item.label,
      description: item.description || "",
      quantity: 1,
      value: 0,
      tags: item.tags || [],
      confidence: item.confidence,
      timestamp: item.timestamp_seconds,
      createdAt: new Date().toISOString(),
      binId: id,
      userId: "", // si necesitas asignar el usuario actual aquí
      imageUrl: newImageUrl,
    };

    // Guardar en Firestore
    const docRef = await addDoc(collection(db, "items"), newItemData);

    // Actualizar estado local si lo usas
    setItems((prev: any) => [...prev, { id: docRef.id, ...newItemData }]);

    toast.success(`Added "${item.label}" to container`);
  } catch (error) {
    console.error("Error adding detected item:", error);
    toast.error("Failed to add item to container");
  }
};

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Loading container details...</p>
        </div>
      </div>
    );
  }

  if (!bin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Package className="h-16 w-16 text-gray-400 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">
            Container not found
          </h2>
          <p className="text-gray-600">
            The requested container could not be found.
          </p>
          <Button onClick={() => navigate("/")} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  Container Details
                </h1>
                <p className="text-xs text-slate-500">
                  Manage your storage Container
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-300 hover:bg-slate-50"
            >
              Done
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Bin Information Card */}
          <Card className="shadow-lg border-0 bg-white/70 backdrop-blur-sm rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2"></div>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <h2 className="text-3xl font-bold text-slate-900">
                    {bin.name}
                  </h2>
                  <p className="text-slate-600 text-lg leading-relaxed">
                    {bin.description}
                  </p>
                  <div className="flex flex-wrap gap-4 pt-2">
                    {bin.location && (
                      <div className="flex items-center text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                        <MapPin className="h-4 w-4 mr-2" />
                        {bin.location.name}
                      </div>
                    )}
                    <div className="flex items-center text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                      <Calendar className="h-4 w-4 mr-2" />
                      Created: {new Date(bin.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditBin}
                  className="shrink-0 rounded-xl border-slate-300 hover:bg-slate-50 shadow-sm"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-200">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
                <DialogHeader className="pb-6">
                  <DialogTitle className="text-2xl font-bold text-slate-900">
                    Add New Item
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Image Upload */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-slate-700">
                      Image
                    </Label>
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200">
                      {selectedImage ? (
                        <div className="space-y-4">
                          <img
                            src={selectedImage}
                            alt="Preview"
                            className="max-w-full h-32 object-cover rounded-xl mx-auto shadow-sm"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedImage(null)}
                            className="rounded-xl"
                          >
                            Remove Image
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <ImageIcon className="h-8 w-8 text-slate-400 mx-auto" />
                          <div>
                            <label className="cursor-pointer">
                              <span className="text-sm text-blue-600 hover:text-blue-500 font-medium">
                                Click to upload an image
                              </span>
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={handleImageUpload}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="itemName"
                      className="text-sm font-medium text-slate-700"
                    >
                      Name *
                    </Label>
                    <Input
                      id="itemName"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Enter item name"
                      className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="itemDescription"
                      className="text-sm font-medium text-slate-700"
                    >
                      Description
                    </Label>
                    <Textarea
                      id="itemDescription"
                      value={itemDescription}
                      onChange={(e) => setItemDescription(e.target.value)}
                      placeholder="Enter item description"
                      rows={3}
                      className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
                    />
                  </div>

                  {/* Cantidad */}
                  <div className="space-y-3">
                    <Label
                      htmlFor="itemQuantity"
                      className="text-sm font-medium text-slate-700"
                    >
                      Quantity
                    </Label>
                    <div className="flex items-center space-x-3">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={decrementQuantity}
                        className="rounded-xl h-10 w-10 border-slate-300 hover:bg-slate-50"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Input
                        id="itemQuantity"
                        type="number"
                        min={0}
                        value={itemCuantity}
                        onChange={(e) =>
                          setItemCuantity(Number(e.target.value))
                        }
                        className="w-20 text-center rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={incrementQuantity}
                        className="rounded-xl h-10 w-10 border-slate-300 hover:bg-slate-50"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Valor */}
                  <div className="space-y-3">
                    <Label
                      htmlFor="itemValue"
                      className="text-sm font-medium text-slate-700"
                    >
                      Value
                    </Label>
                    <Input
                      id="itemValue"
                      type="number"
                      min={0}
                      step={0.01}
                      value={itemValue}
                      onChange={(e) => setItemValue(Number(e.target.value))}
                      placeholder="Enter item value"
                      className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-slate-700">
                      Tags
                    </Label>
                    <div className="flex space-x-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Add a tag"
                        onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                        className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
                      />
                      <Button
                        onClick={handleAddTag}
                        size="sm"
                        className="rounded-xl"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {itemTags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {itemTags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="pr-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200"
                          >
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(tag)}
                              className="ml-1 hover:bg-blue-300 rounded-full p-0.5 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-3 pt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsAddItemOpen(false);
                        resetItemForm();
                      }}
                      className="rounded-xl border-slate-300 hover:bg-slate-50"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleSubmitItem()}
                      disabled={!itemName.trim()}
                      className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                    >
                      Add Item
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Container
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl border-0 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-bold text-slate-900">
                    Delete Container
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-600">
                    Are you sure you want to delete this container? This action
                    cannot be undone and will also delete all items in this
                    container.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl border-slate-300 hover:bg-slate-50">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700 rounded-xl">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Upload Dialog */}
            <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg hover:shadow-xl transition-all duration-200">
                  <Plus className="h-4 w-4 mr-2" />
                  Bulk Upload
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
                <DialogHeader className="pb-6">
                  <DialogTitle className="text-2xl font-bold text-slate-900">
                    Bulk Upload Items
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                  <label className="block text-sm font-medium text-slate-700">
                    Select images (multiple)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isBulkUploading}
                    onChange={(e) => handleBulkUpload(e.target.files)}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />

                  {isBulkUploading && (
                    <div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className="bg-green-600 h-4 rounded-full transition-all"
                          style={{
                            width: `${
                              (bulkProgress.done / bulkProgress.total) * 100
                            }%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-center text-sm text-gray-700">
                        Uploading {bulkProgress.done} of {bulkProgress.total}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-6">
                    <Button
                      variant="outline"
                      onClick={() => setIsBulkUploadOpen(false)}
                      className="rounded-xl border-slate-300 hover:bg-slate-50"
                      disabled={isBulkUploading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* NEW: Video AI Button */}
  <Dialog  open={isVideoUploadOpen} onOpenChange={setIsVideoUploadOpen}>
    <DialogTrigger asChild>
      <Button className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-200">
        <Video className="h-4 w-4 mr-2" />
        Video AI
      </Button>
    </DialogTrigger>
    <DialogContent className="!max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
      <DialogHeader className="pb-6">
        <DialogTitle className="text-2xl font-bold text-slate-900">
          {showResults ? `AI Detected Items (${detectedItems.length})` : 'Upload Video for AI Analysis'}
        </DialogTitle>
      </DialogHeader>

      {!showResults ? (
        <div className="space-y-6">
          {/* Video Upload */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              Video File (5s - 2min)
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-purple-400 hover:bg-purple-50/50 transition-all duration-200">
              {selectedVideo ? (
                <div className="space-y-4">
                  <video
                    src={videoPreview ?? undefined}
                    controls
                    className="max-w-full h-48 rounded-xl mx-auto shadow-sm"
                  />
                  <div className="text-sm text-slate-600">
                    {selectedVideo.name}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetVideoForm}
                    className="rounded-xl"
                    disabled={isUploading}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove Video
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-8 w-8 text-slate-400 mx-auto" />
                  <div>
                    <label className="cursor-pointer">
                      <span className="text-sm text-purple-600 hover:text-purple-500 font-medium">
                        Click to upload a video
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="video/*"
                        onChange={handleVideoUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                  <div className="text-xs text-slate-500">
                    Supported formats: MP4, MOV, AVI, WebM<br/>
                    Duration: 5 seconds to 2 minutes
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-3">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${videoUploadProgress}%` }}
                />
              </div>
              <p className="text-center text-sm text-slate-600">
                {videoUploadProgress < 100 ? `Uploading... ${Math.round(videoUploadProgress)}%` : 'Processing complete!'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6">
            <Button
              variant="outline"
              onClick={() => {
                setIsVideoUploadOpen(false);
                if (!isUploading) resetVideoForm();
              }}
              className="rounded-xl border-slate-300 hover:bg-slate-50"
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVideoSubmit}
              disabled={!selectedVideo || isUploading}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              {isUploading ? 'Processing...' : 'Analyze Video'}
            </Button>
          </div>
        </div>
      ) : (
        /* Results View */
        <div className="space-y-6">
          {/* Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[60vh] overflow-y-auto">
            {detectedItems.map((item: any) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Item Image */}
                <div className="relative">
                  <img
                    src={item.image_url}
                    alt={item.label}
                    className="w-full h-48 object-cover"
                    onError={(e: any) => {
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'flex';
                    }}
                  />
                  <div className="hidden w-full h-48 bg-slate-100 items-center justify-center">
                    <span className="text-slate-400">Image not available</span>
                  </div>
                  
                  {/* Confidence Badge */}
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
                      {Math.round(item.confidence * 100)}% confident
                    </span>
                  </div>

                  {/* Timestamp Badge */}
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-1 bg-purple-500 text-white text-xs font-medium rounded-full flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {item.timestamp_seconds}s
                    </span>
                  </div>
                </div>

                {/* Item Details */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg">
                      {item.label}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.slice(0, 3).map((tag: any, tagIndex: number) => (
                        <span
                          key={tagIndex}
                          className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                      {item.tags.length > 3 && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                          +{item.tags.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Add Button */}
                  <Button
                    onClick={() => handleAddDetectedItem(item)}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                    size="sm"
                  >
                    Add to Container
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Results Actions */}
          <div className="flex justify-between items-center pt-6 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => {
                setShowResults(false);
                resetVideoForm();
              }}
              className="rounded-xl border-slate-300 hover:bg-slate-50"
            >
              Upload New Video
            </Button>
            
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  // Add all items at once
                  detectedItems.forEach(item => handleAddDetectedItem(item));
                }}
                className="rounded-xl border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                Add All Items
              </Button>
              <Button
                onClick={() => {
                  setIsVideoUploadOpen(false);
                  resetVideoForm();
                }}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
          </div>

          {/* Items Section */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-900">
                Items ({items.length})
              </h3>
            </div>

            {items.length === 0 ? (
              <Card className="text-center py-16 rounded-2xl border-0 shadow-lg bg-white/70 backdrop-blur-sm">
                <CardContent>
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Package className="h-10 w-10 text-blue-500" />
                  </div>
                  <h4 className="text-xl font-semibold text-slate-900 mb-3">
                    No items yet
                  </h4>
                  <p className="text-slate-500 mb-6 max-w-md mx-auto">
                    Add your first item to get started organizing your container
                  </p>
                  <Button
                    onClick={() => setIsAddItemOpen(true)}
                    className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Item
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {items.map((item: any) => (
                  <Card
                    key={item.id}
                    className="overflow-hidden hover:shadow-xl transition-all duration-300 rounded-2xl border-0 bg-white/70 backdrop-blur-sm group"
                  >
                    <div
                      className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden group cursor-pointer"
                      onClick={() => {
                        if (item.imageUrl) {
                          setSelectedModalImage(item.imageUrl);
                          setIsImageModalOpen(true);
                        }
                      }}
                    >
                      {item.imageUrl ? (
                        <>
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 right-2 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-12 w-12 text-slate-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-semibold text-slate-900 truncate flex-1 text-lg">
                          {item.name}
                        </h4>
                        <div className="flex space-x-1 ml-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditItem(item)}
                            className="p-2 h-8 w-8 rounded-lg hover:bg-slate-100"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="p-2 h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-2xl border-0 shadow-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-xl font-bold text-slate-900">
                                  Delete Item
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-600">
                                  Are you sure you want to delete "{item.name}"?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl border-slate-300 hover:bg-slate-50">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    deleteItem(item.id, item.imageUrl);
                                  }}
                                  className="bg-red-600 hover:bg-red-700 rounded-xl"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <p className="text-sm text-slate-600 mb-4 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>

                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.tags.map((tag: any, index: number) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="text-xs rounded-full border-slate-300 text-slate-600 hover:bg-slate-50"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden rounded-2xl border-0 shadow-2xl ml-40">
          <div className="relative w-full h-full overflow-hidden">
            <div
              className="relative w-full h-full cursor-move"
              onMouseDown={(e) => {
                const container = e.currentTarget;
                const img = container.querySelector("img");
                if (!img || zoomLevel <= 1) return;

                const startX = e.clientX - container.offsetLeft;
                const startY = e.clientY - container.offsetTop;
                const startScrollLeft = container.scrollLeft;
                const startScrollTop = container.scrollTop;

                const handleMouseMove = (e: MouseEvent) => {
                  const x = e.clientX - container.offsetLeft;
                  const y = e.clientY - container.offsetTop;
                  const walkX = (x - startX) * -1;
                  const walkY = (y - startY) * -1;
                  container.scrollLeft = startScrollLeft + walkX;
                  container.scrollTop = startScrollTop + walkY;
                };

                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{ overflow: zoomLevel > 1 ? "auto" : "hidden" }}
            >
              <img
                src={selectedModalImage || ""}
                alt="Full size image"
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: "0 0",
                }}
                className="w-full h-full object-contain transition-transform duration-300"
                draggable="false"
              />
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-2">
              <Button
                variant="ghost"
                className="rounded-full p-2 bg-black/20 hover:bg-black/40 text-white"
                onClick={() => setZoomLevel(Math.max(1, zoomLevel - 0.5))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="rounded-full p-2 bg-black/20 hover:bg-black/40 text-white"
                onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.5))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              className="absolute top-2 right-2 rounded-full p-2 bg-black/20 hover:bg-black/40 text-white"
              onClick={() => {
                setIsImageModalOpen(false);
                setZoomLevel(1);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Item Modal */}
      <Dialog open={isEditItemOpen} onOpenChange={setIsEditItemOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
          <DialogHeader className="pb-6">
            <DialogTitle className="text-2xl font-bold text-slate-900">
              Edit Item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Similar form as Add Item but with update functionality */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">
                Image
              </Label>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200">
                {selectedImage ? (
                  <div className="space-y-4">
                    <img
                      src={selectedImage}
                      alt="Preview"
                      className="max-w-full h-32 object-cover rounded-xl mx-auto shadow-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedImage(null)}
                      className="rounded-xl"
                    >
                      Remove Image
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ImageIcon className="h-8 w-8 text-slate-400 mx-auto" />
                    <div>
                      <label className="cursor-pointer">
                        <span className="text-sm text-blue-600 hover:text-blue-500 font-medium">
                          Click to upload an image
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleImageUpload}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="editItemName"
                className="text-sm font-medium text-slate-700"
              >
                Name *
              </Label>
              <Input
                id="editItemName"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Enter item name"
                className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="editItemDescription"
                className="text-sm font-medium text-slate-700"
              >
                Description
              </Label>
              <Textarea
                id="editItemDescription"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Enter item description"
                rows={3}
                className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>

            {/* Cantidad */}
            <div className="space-y-3">
              <Label
                htmlFor="itemQuantity"
                className="text-sm font-medium text-slate-700"
              >
                Quantity
              </Label>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={decrementQuantity}
                  className="rounded-xl h-10 w-10 border-slate-300 hover:bg-slate-50"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  id="itemQuantity"
                  type="number"
                  min={1}
                  value={itemCuantity}
                  onChange={(e) => setItemCuantity(Number(e.target.value))}
                  className="w-20 text-center rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={incrementQuantity}
                  className="rounded-xl h-10 w-10 border-slate-300 hover:bg-slate-50"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Valor */}
            <div className="space-y-3">
              <Label
                htmlFor="itemValue"
                className="text-sm font-medium text-slate-700"
              >
                Value
              </Label>
              <Input
                id="itemValue"
                type="number"
                min={0}
                step={0.01}
                value={itemValue}
                onChange={(e) => setItemValue(Number(e.target.value))}
                placeholder="Enter item value"
                className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">Tags</Label>
              <div className="flex space-x-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                  className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
                />
                <Button onClick={handleAddTag} size="sm" className="rounded-xl">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {itemTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {itemTags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="pr-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:bg-blue-300 rounded-full p-0.5 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditItemOpen(false);
                  resetItemForm();
                }}
                className="rounded-xl border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleUpdateItem()}
                disabled={!itemName.trim()}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                Update Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Bin Modal */}
      <Dialog open={isEditBinOpen} onOpenChange={setIsEditBinOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
          <DialogHeader className="pb-6">
            <DialogTitle className="text-2xl font-bold text-slate-900">
              Edit Container
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-3">
              <Label
                htmlFor="binName"
                className="text-sm font-medium text-slate-700"
              >
                Name *
              </Label>
              <Input
                id="binName"
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                placeholder="Enter container name"
                className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>

            {/* Description */}
            <div className="space-y-3">
              <Label
                htmlFor="binDescription"
                className="text-sm font-medium text-slate-700"
              >
                Description
              </Label>
              <Textarea
                id="binDescription"
                value={binDescription}
                onChange={(e) => setBinDescription(e.target.value)}
                placeholder="Enter container description"
                rows={3}
                className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>

            {/* Address */}
            <div className="space-y-3">
              <Label
                htmlFor="binAddress"
                className="text-sm font-medium text-slate-700"
              >
                Address
              </Label>
              <Input
                id="binAddress"
                value={binAddress}
                onChange={(e) => setBinAddress(e.target.value)}
                placeholder="Enter container address"
                className="rounded-xl border-slate-300 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>

            {/* Location */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">
                Location{" "}
                {!selectedLocation && <span className="text-red-500">*</span>}
              </Label>
              {!selectedLocation ? (
                <></>
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="inline-flex items-center space-x-2 bg-blue-50 px-3 py-2 rounded-full border border-blue-200">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700 font-medium">
                      {selectedLocation?.name}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-6">
              <Button
                variant="outline"
                onClick={() => setIsEditBinOpen(false)}
                className="rounded-xl border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                disabled={isUploading || !binName.trim()}
                onClick={handleUpdateBin}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                {isUploading ? (
                  <span className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Updating...</span>
                  </span>
                ) : (
                  "Update Container"
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

export default BinDetailsScreen;

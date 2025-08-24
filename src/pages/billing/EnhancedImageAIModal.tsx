import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Video,
  Upload,
  X,
  Loader2,
  Clock,
  Bot,
  Coins,
  Check,
  Crown,
  Sparkles,
  ArrowLeft,
  Zap,
  Star,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import type { TokenEstimate } from "../dashboard/binDetail";
import { useAuth } from "@/context/AuthContext";
import { getStripePlans } from "@/lib/stripe";
import { getFunctions, httpsCallable } from "firebase/functions";
import { addDoc, collection, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Elements } from "@stripe/react-stripe-js";
import TokenCheckoutForm from "./TokenCheckoutForm";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "@/config/stripe";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
const planIcons = [Coins, Zap, Star, Crown];

const EnhancedImagesAIModal = ({
  isVideoUploadOpen,
  setIsVideoUploadOpen,
  itemId,
  setItems,
}: any) => {
  const { currentUser } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [detectedItems, setDetectedItems] = useState<any>([]);

  const [isLoading, setIsLoading] = useState(false);

  // Token estimation states
  const [userTokens, setUserTokens] = useState(0);

  // Token purchase states
  const [showTokenPurchase, setShowTokenPurchase] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [hoveredPackage, setHoveredPackage] = useState("");
  const [tokenPackages, setTokenPackages] = useState<any[]>([]);
  const checkoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPackage && checkoutRef.current) {
      checkoutRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedPackage]);

  const fetchTokenPackages = useCallback(async () => {
    try {
      const stripePackages = await getStripePlans();
      const filteredPackages = stripePackages.filter((pkg) => {
        const keys = pkg.metadata ? Object.keys(pkg.metadata) : [];
        return keys.includes("tokens") && keys.length == 1;
      });
      const sortedPackages = filteredPackages.sort((a, b) => {
        const tokensA = parseInt(a.metadata?.tokens || "0");
        const tokensB = parseInt(b.metadata?.tokens || "0");
        return tokensA - tokensB;
      });

      setTokenPackages(sortedPackages);
    } catch (error) {
      console.error("Error fetching token packages:", error);
    }
  }, []);

  useEffect(() => {
    const checkUserTokens = async () => {
      if (currentUser) {
        console.log(currentUser);
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        console.log();
        if (docSnap.exists()) {
          const tokenData = docSnap.data();
          console.log(tokenData, " kjnj");
          setUserTokens(tokenData.tokens || 0);
        }
      }
    };
    checkUserTokens();
  }, [currentUser]);

  useEffect(() => {
    fetchTokenPackages();
  }, [fetchTokenPackages]);

  const [selectedImages, setSelectedImages] = useState<any>([]);
  const [imagePreviews, setImagePreviews] = useState<any>([]);

  const handleVideoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    console.log(files);

    setIsUploading(true);

    const filesArray = Array.from(files);
    setSelectedImages(filesArray);

    // Crear previews para las imágenes
    const previews = [];

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const reader = new FileReader();

      const preview = await new Promise((resolve) => {
        reader.onload = (e: any) => {
          resolve({
            file: file,
            url: e.target.result,
            name: file.name,
          });
        };
        reader.readAsDataURL(file);
      });

      previews.push(preview);
    }

    setImagePreviews(previews);
    setIsUploading(false);
  };

  const removeImage = (index: any) => {
    const newImages = selectedImages.filter((_: any, i: any) => i !== index);
    const newPreviews = imagePreviews.filter((_: any, i: any) => i !== index);

    setSelectedImages(newImages);
    setImagePreviews(newPreviews);
  };

  const resetVideoForm = () => {
    setSelectedImages([]);
    setImagePreviews([]);
    setEstimateData(null);
    setShowResults(false);
    setDetectedItems([]);
  };

  const [estimateData, setEstimateData] = useState<TokenEstimate | null>(null);

  const handleVideoSubmit = async () => {
    if (selectedImages.length === 0) return;

    setIsUploading(true);

    try {
      // Crear FormData para enviar las imágenes
      const formData = new FormData();

      // Agregar todas las imágenes al FormData
      selectedImages.forEach((file: any) => {
        formData.append("files", file);
      });

      let token = "";
      if (currentUser) {
        token = await currentUser.getIdToken();
      }

      // Llamada a la API
      const response = await fetch(
        "https://boxbinapi-iv6wi.ondigitalocean.app/api/process-images/estimate-tokens",
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setEstimateData(result);
      setIsUploading(false);
    } catch (error: any) {
      console.error("Error processing images:", error);
      // Aquí puedes mostrar un mensaje de error al usuario
      alert("Error processing images: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const confirmProcess = async () => {
    if (!estimateData?.success) {
      return;
    }

    const formData = new FormData();
    selectedImages.forEach((file: any) => {
      formData.append("files", file);
    });

    let token = "";
    if (currentUser) {
      token = await currentUser.getIdToken();
    }
    setIsUploading(true);
    setShowResults(false);
    setEstimateData(null);

    const response = await fetch(
      "https://boxbinapi-iv6wi.ondigitalocean.app/api/process-images",
      //"http://localhost:3000/api/process-images",
      {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const result = await response.json();

    if (result.success) {
      console.log("Images processed successfully:", result);
      setDetectedItems(result?.data?.items || []);
      setShowResults(true);
      setIsUploading(false);
    } else {
      throw new Error(result.error || "Failed to process images");
    }
  };

  const handleAddDetectedItem = async (item: any) => {
    try {
      const functions = getFunctions();
      const newImageUrl: any = await httpsCallable(
        functions,
        "moveImageToFinal"
      )({
        imageUrl: item?.image_url,
        newFolder: "items",
      });

      console.log(newImageUrl, " nueva");
      // Crear datos para Firestore
      const newItemData = {
        name: item.label,
        description: item.description || "",
        quantity: 1,
        value: 1,
        tags: item.tags || [],
        confidence: item.confidence,
        //timestamp: item.timestamp_seconds,
        createdAt: new Date().toISOString(),
        binId: itemId,
        userId: "", // si necesitas asignar el usuario actual aquí
        imageUrl: newImageUrl?.data.newUrl,
      };

      console.log(newItemData, " jn");

      // Guardar en Firestore
      const docRef = await addDoc(collection(db, "items"), newItemData);

      setItems((prev: any) => [...prev, { id: docRef.id, ...newItemData }]);

      // Quitar el ítem del arreglo principal
      setDetectedItems((prev: any[]) => prev.filter((d) => d.id !== item.id));

      toast.success(`Added "${item.label}" to container`);
    } catch (error) {
      console.error("Error adding detected item:", error);
      toast.error("Failed to add item to container");
    }
  };

  const renderTokenPurchaseView = () => (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTokenPurchase(false)}
          className="p-2 hover:bg-slate-100 rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-slate-900">
            Purchase AI Tokens
          </h3>
          <p className="text-sm text-slate-600">
            Choose a package to continue with video processing
          </p>
        </div>
      </div>
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">Current Balance</h4>
            <p className="text-blue-100 text-sm">
              Available for video processing
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{userTokens}</div>
            <div className="text-blue-200 text-sm">Tokens</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto">
        <div
          key={"0ai"}
          onClick={async () => {
            try {
              if (!currentUser?.uid) {
                return;
              }
              setIsLoading(true);
              await updateDoc(doc(db, "users", currentUser?.uid ?? ""), {
                tokens: 1000,
              });
              setIsLoading(false);
              window.location.reload();
            } catch (error) {
              setIsLoading(false);
              console.log(error);
            }
          }}
          onMouseLeave={() => setHoveredPackage("")}
          className="cursor-pointer transform transition-all duration-300 hover:scale-105 relative"
        >
          <Card
            className={`relative h-full transition-all duration-300 flex flex-col ${
              selectedPackage === "0ai"
                ? "border-2 border-blue-500 shadow-xl bg-blue-50"
                : hoveredPackage === "0ai"
                ? "border-2 border-blue-300 shadow-lg bg-gray-50"
                : "border border-gray-200 hover:border-gray-300 shadow-md bg-white"
            }`}
          >
            {selectedPackage === "0ai" && (
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg z-10">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}

            <CardHeader className="">
              <CardTitle className="text-lg font-bold text-center text-gray-900 mb-2">
                FREE
              </CardTitle>
              <p className="text-xs text-gray-600 text-center leading-relaxed">
                FREE
              </p>
            </CardHeader>

            <CardContent className="pt-0 pb-4 flex-1 flex flex-col">
              <div className="text-center mb-4">
                <div className="flex items-baseline justify-center gap-1 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    $0.00
                  </span>
                </div>
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold mb-2">
                  1000 Tokens
                </div>
              </div>

              <div className="mb-4 space-y-2 text-sm text-gray-700 flex-1">
                <div className="flex items-center space-x-2">
                  <Video className="w-4 h-4 text-blue-500" />
                  <span>Process video</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-purple-500" />
                  <span>AI-powered item detection</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                  <span>Auto-add to containers</span>
                </div>
              </div>

              <Button
                className={`w-full py-3 cursor-pointer text-sm font-semibold transition-all duration-300 ${
                  selectedPackage === "0ai"
                    ? "bg-blue-600 hover:bg-blue-700 shadow-lg"
                    : hoveredPackage === "0ai"
                    ? "bg-blue-600 hover:bg-blue-700 shadow-lg"
                    : "bg-gray-900 hover:bg-gray-800 shadow-md"
                } text-white`}
              >
                <div className="flex items-center justify-center space-x-2">
                  {selectedPackage === "0ai" && <Check className="w-4 h-4" />}
                  <span>
                    {selectedPackage === "0ai" ? "Selected" : "Buy Tokens"}
                  </span>
                </div>
              </Button>
            </CardContent>
          </Card>
        </div>

        {tokenPackages.map((pkg, index) => {
          const IconComponent = planIcons[index % planIcons.length];
          const isSelected = selectedPackage === pkg.id;
          const isHovered = hoveredPackage === pkg.id;
          const isPopular = index === Math.floor(tokenPackages.length / 2);
          const tokenAmount = parseInt(pkg.metadata?.tokens || "0");
          const pricePerToken =
            pkg.unit_amount > 0 ? pkg.unit_amount / tokenAmount : 0;

          return (
            <div
              key={pkg.id}
              onClick={() => setSelectedPackage(pkg.id)}
              onMouseEnter={() => setHoveredPackage(pkg.id)}
              onMouseLeave={() => setHoveredPackage("")}
              className="cursor-pointer transform transition-all duration-300 hover:scale-[1.02] relative"
            >
              {/* Popular Badge */}
              {isPopular && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-lg">
                    <div className="flex items-center space-x-1">
                      <Crown className="w-3 h-3" />
                      <span>Best Value</span>
                    </div>
                  </div>
                </div>
              )}

              <Card
                className={`relative h-full transition-all duration-300 ${
                  isSelected
                    ? "border-2 border-blue-500 shadow-lg bg-blue-50"
                    : isHovered
                    ? "border-2 border-blue-300 shadow-md bg-slate-50"
                    : "border border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                {/* Selected Indicator */}
                {isSelected && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-lg z-10">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}

                <CardHeader className="pb-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2 transition-all duration-300 ${
                      isSelected
                        ? "bg-blue-600"
                        : isHovered
                        ? "bg-blue-500"
                        : "bg-slate-600"
                    }`}
                  >
                    <IconComponent className="w-5 h-5 text-white" />
                  </div>
                  <CardTitle className="text-base font-bold text-center text-slate-900">
                    {pkg.product.name}
                  </CardTitle>
                  {pkg.product.description && (
                    <p className="text-xs text-slate-600 text-center">
                      {pkg.product.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="pt-0 pb-4">
                  <div className="text-center mb-3">
                    <div className="flex items-baseline justify-center gap-1 mb-1">
                      <span className="text-2xl font-bold text-slate-900">
                        {pkg.unit_amount === 0
                          ? "FREE"
                          : `$${(pkg.unit_amount / 100).toFixed(2)}`}
                      </span>
                    </div>
                    <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-2 py-1 rounded-full text-xs font-bold mb-1">
                      {tokenAmount} Tokens
                    </div>
                    {pkg.unit_amount > 0 && (
                      <p className="text-xs text-slate-500">
                        ${(pricePerToken / 100).toFixed(4)} per token
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="mb-3 space-y-1 text-xs text-slate-700">
                    <div className="flex items-center space-x-2">
                      <Video className="w-3 h-3 text-blue-500" />
                      <span>Video processing</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Bot className="w-3 h-3 text-purple-500" />
                      <span>AI item detection</span>
                    </div>
                    {pkg.metadata?.bonus && (
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-3 h-3 text-orange-500" />
                        <span className="text-orange-600 font-semibold">
                          +{pkg.metadata.bonus}% Bonus
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    className={`w-full text-xs font-semibold transition-all duration-300 ${
                      isSelected
                        ? "bg-blue-600 hover:bg-blue-700"
                        : isHovered
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-slate-900 hover:bg-slate-800"
                    } text-white`}
                  >
                    {isSelected ? (
                      <div className="flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Selected</span>
                      </div>
                    ) : (
                      "Select Package"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {selectedPackage && (
        <div ref={checkoutRef} className="mt-5 max-w-lg mx-auto mb-20">
          <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Coins className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Complete Your Purchase
              </h3>
              <p className="text-gray-600">
                Get instant access to AI tokens for video processing
              </p>
            </div>

            <Elements stripe={stripePromise}>
              <TokenCheckoutForm
                userId={currentUser?.uid ?? ""}
                tokens={parseInt(
                  tokenPackages.find((p) => p.id === selectedPackage)?.metadata
                    ?.tokens || "0"
                )}
                price={
                  tokenPackages.find((p) => p.id === selectedPackage)
                    ?.unit_amount || 0
                }
              />
            </Elements>
          </div>
        </div>
      )}
    </div>
  );

  const renderMainContent = () => {
    if (showTokenPurchase) {
      return renderTokenPurchaseView();
    }

    if (!showResults && !estimateData) {
      return (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              Select images (multiple)
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-purple-400 hover:bg-purple-50/50 transition-all duration-200">
              {selectedImages.length > 0 ? (
                <div className="space-y-4">
                  {/* Grid de previews pequeños */}
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {imagePreviews.map((preview: any, index: number) => (
                      <div key={index} className="relative group">
                        <img
                          src={preview.url}
                          alt={preview.name}
                          className="w-16 h-16 object-cover rounded-lg shadow-sm border border-slate-200"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeImage(index)}
                          className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          disabled={isUploading}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Información y botón para agregar más */}
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">
                      {selectedImages.length}{" "}
                      {selectedImages.length === 1 ? "image" : "images"}{" "}
                      selected
                    </p>
                    <label className="cursor-pointer">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        disabled={isUploading}
                        asChild
                      >
                        <span>
                          <Upload className="h-4 w-4 mr-1" />
                          Add more images
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        multiple
                        disabled={isUploading}
                        onChange={(e) => handleVideoUpload(e.target.files)}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-8 w-8 text-slate-400 mx-auto" />
                  <div>
                    <label className="cursor-pointer">
                      <span className="text-sm text-purple-600 hover:text-purple-500 font-medium">
                        Click to upload images
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={isUploading}
                        onChange={(e) => handleVideoUpload(e.target.files)}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-slate-500 mt-1">
                      Select multiple images at once
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="flex flex-col items-center justify-center py-4">
              <Loader2 className="w-6 h-6 text-purple-600 animate-spin mb-2" />
              <p className="text-center text-sm text-slate-600">
                Processing images...
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
              disabled={selectedImages.length === 0 || isUploading}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              {isUploading ? "Processing..." : "Analyze Images"}
            </Button>
          </div>
        </div>
      );
    }

    if (!showResults && estimateData) {
      return (
        <div className="space-y-6">
          {estimateData.success ? (
            <div>
              <div className="w-full bg-white shadow-md rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-center gap-4">
                <div className="flex-shrink-0 w-full md:w-28 flex items-center justify-center">
                  <div className="relative w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center ring-1 ring-emerald-100">
                    <span className="absolute -top-2 -right-2 bg-emerald-600 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-sm">
                      ✅
                    </span>
                    <div className="text-center">
                      <div className="text-xs text-slate-400">Tokens</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {estimateData?.available_tokens}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 w-full text-center md:text-left">
                  <h2 className="text-lg font-semibold text-slate-900">
                    You have enough tokens
                  </h2>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600">
                    <div className="flex flex-col items-center sm:items-start">
                      <div className="text-xs text-slate-500">
                        Tokens required
                      </div>
                      <div className="font-medium text-slate-800">
                        {estimateData.MY_TOTAL_TOKENS}
                      </div>
                    </div>
                    <div className="flex flex-col items-center sm:items-start">
                      <div className="text-xs text-slate-500">Tokens left</div>
                      <div className="font-medium text-slate-800">
                        {estimateData?.tokens_remaining_after}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((estimateData?.available_tokens ?? 0) /
                              (estimateData.MY_TOTAL_TOKENS || 1)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex w-full mt-4 gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setEstimateData(null)}
                  className="rounded-xl border-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmProcess}
                  className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                >
                  Confirm and Process
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full bg-red-50/70 border border-red-100 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-center gap-4">
              <div className="flex-shrink-0 w-full md:w-20 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center ring-1 ring-red-200">
                  <div className="text-red-600 font-semibold">❌</div>
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <h2 className="text-lg font-semibold text-red-700">
                  {(estimateData?.available_tokens ?? 0) > 0
                    ? "Not enough tokens"
                    : "No tokens available"}
                </h2>
                <div className="mt-2 text-sm text-slate-600 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs text-slate-500">
                      Available tokens
                    </div>
                    <div className="font-medium text-slate-800">
                      {estimateData?.available_tokens || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">
                      Required tokens
                    </div>
                    <div className="font-medium text-slate-800">
                      {estimateData?.required_tokens}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Tokens needed</div>
                    <div className="font-semibold text-rose-600">
                      {(estimateData?.required_tokens ?? 0) -
                        (estimateData?.available_tokens ?? 0)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Purchase tokens to continue with video processing.
                </div>
              </div>

              <div className="flex-shrink-0 w-full md:w-44">
                <Button
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-xl"
                  onClick={() => setShowTokenPurchase(true)}
                >
                  <Coins className="w-4 h-4 mr-2" />
                  Buy Tokens
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {isUploading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
            <p className="text-center text-sm text-slate-600 mb-1">
              Processing video with AI...
            </p>
            <p className="text-center text-xs text-slate-500">
              This may take up to 2 minutes
            </p>
          </div>
        )}

        {/* Results Grid */}
        {!isUploading && (
          <>
            {isLoading ? (
              <>
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
                  <p className="text-center text-sm text-slate-600 mb-1">
                    Processing
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto">
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
                          className="w-full h-40 object-cover"
                          onError={(e: any) => {
                            e.target.style.display = "none";
                            e.target.nextElementSibling.style.display = "flex";
                          }}
                        />
                        <div className="hidden w-full h-40 bg-slate-100 items-center justify-center">
                          <span className="text-slate-400">
                            Image not available
                          </span>
                        </div>

                        {/* Badges */}
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
                            {Math.round(item.confidence * 100)}%
                          </span>
                        </div>
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-1 bg-purple-500 text-white text-xs font-medium rounded-full flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {item.timestamp_seconds}s
                          </span>
                        </div>
                      </div>

                      {/* Item Details */}
                      <div className="p-4 space-y-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            {item.label}
                          </h3>
                          <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        </div>

                        {/* Tags */}
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags
                              .slice(0, 3)
                              .map((tag: any, tagIndex: number) => (
                                <span
                                  key={tagIndex}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                            {item.tags.length > 3 && (
                              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                                +{item.tags.length - 3}
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
                    }}
                    className="rounded-xl border-slate-300 hover:bg-slate-50"
                  >
                    Upload New Images
                  </Button>

                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          setIsLoading(true);

                          // ✅ Esperar a que todos terminen
                          await Promise.all(
                            detectedItems.map((item: any) =>
                              handleAddDetectedItem(item)
                            )
                          );

                          // ✅ Ahora que todos terminaron, seguimos
                          setShowResults(false);
                          resetVideoForm();
                          setIsVideoUploadOpen(false);
                        } catch (error) {
                          console.error("Error processing items:", error);
                          toast.error("Failed to process detected items");
                        } finally {
                          setIsLoading(false);
                        }
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
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={isVideoUploadOpen}
      onOpenChange={(open) => {
        setShowResults(false);
        setIsVideoUploadOpen(open);
        setShowTokenPurchase(false);
        setSelectedPackage("");
      }}
    >
      <DialogTrigger asChild>
        <Button className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg hover:shadow-xl transition-all duration-200">
          <Image className="h-4 w-4 mr-2" />
          Images AI
        </Button>
      </DialogTrigger>

      <DialogContent className="!max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-2xl font-bold text-slate-900">
            {showTokenPurchase
              ? "Purchase AI Tokens"
              : showResults
              ? `AI Detected Items (${detectedItems.length})`
              : estimateData
              ? "Token Verification"
              : "Upload Images for AI Analysis"}
          </DialogTitle>
        </DialogHeader>

        {renderMainContent()}
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedImagesAIModal;

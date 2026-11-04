import { useState, useRef, useEffect } from "react";
import { Camera, X, RefreshCw, Check, Upload, AlertCircle } from "lucide-react";
import { compressImage } from "@/lib/image-upload";

interface InAppCameraModalProps {
  isOpen: boolean;
  title: string;
  onCapture: (file: File, previewUrl: string) => void;
  onClose: () => void;
}

export function InAppCameraModal({
  isOpen,
  title,
  onCapture,
  onClose,
}: InAppCameraModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start camera stream
  const startCamera = async (mode: "environment" | "user") => {
    try {
      setCameraError(null);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setCameraError(
        err?.message?.includes("Permission") || err?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access or use photo upload."
          : "Unable to start live camera stream. You can upload photo directly."
      );
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedBlob(null);
      setCapturedUrl(null);
      startCamera(facingMode);
    } else {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen]);

  const stopCameraStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const handleFlipCamera = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current) return;
    setIsProcessing(true);

    try {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          async (blob) => {
            if (blob) {
              // Immediately compress frame to lightweight JPEG (~40KB)
              const compressed = await compressImage(blob, 0.5, 1000);
              const previewUrl = URL.createObjectURL(compressed);
              setCapturedBlob(compressed);
              setCapturedUrl(previewUrl);
              stopCameraStream();
            }
            setIsProcessing(false);
          },
          "image/jpeg",
          0.85
        );
      } else {
        setIsProcessing(false);
      }
    } catch (e) {
      console.error("Frame capture error:", e);
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
    }
    setCapturedBlob(null);
    setCapturedUrl(null);
    startCamera(facingMode);
  };

  const handleConfirmPhoto = () => {
    if (!capturedBlob || !capturedUrl) return;

    // Convert blob to standard File object
    const file = new File([capturedBlob], `fuel-photo-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    onCapture(file, capturedUrl);
    handleCloseModal();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const compressed = await compressImage(file, 0.5, 1000);
      const previewUrl = URL.createObjectURL(compressed);
      const readyFile = new File([compressed], file.name.replace(/\.[^/.]+$/, ".jpg"), {
        type: "image/jpeg",
      });

      onCapture(readyFile, previewUrl);
      handleCloseModal();
    } catch (err) {
      console.error("Image processing error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseModal = () => {
    stopCameraStream();
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
    }
    setCapturedBlob(null);
    setCapturedUrl(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-h-[95vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="text-[11px] text-zinc-400">Live In-App Camera</p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewfinder area */}
        <div className="relative flex-1 bg-black min-h-[340px] flex items-center justify-center overflow-hidden">
          {capturedUrl ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={capturedUrl}
                alt="Captured proof"
                className="w-full h-full max-h-[50vh] object-contain"
              />
              <div className="absolute top-3 left-3 bg-emerald-500/90 text-black text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                <Check className="w-3.5 h-3.5" /> Photo Captured
              </div>
            </div>
          ) : cameraError ? (
            <div className="p-6 text-center space-y-4 max-w-sm">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs text-zinc-300 font-medium">{cameraError}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Select Photo from Device
              </button>
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full max-h-[55vh] object-cover"
              />

              {/* Viewfinder guide frame */}
              <div className="absolute inset-8 border-2 border-dashed border-white/40 rounded-2xl pointer-events-none flex flex-col justify-between p-2">
                <span className="text-[10px] text-white/70 bg-black/50 px-2 py-0.5 rounded self-start font-medium">
                  Align meter or receipt inside frame
                </span>
                <span className="text-[10px] text-emerald-400/90 bg-black/50 px-2 py-0.5 rounded self-end font-bold">
                  Live Viewfinder
                </span>
              </div>
            </div>
          )}

          {/* Hidden file input for fallback */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Controls footer */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800">
          {capturedUrl ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 rounded-xl border border-zinc-700 text-zinc-200 font-bold text-xs hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                Retake Photo
              </button>
              <button
                type="button"
                onClick={handleConfirmPhoto}
                disabled={isProcessing}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Use Photo ✓
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Choose from files"
                className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <Upload className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleCaptureFrame}
                disabled={!!cameraError || isProcessing}
                className="w-16 h-16 rounded-full border-4 border-white bg-red-600 hover:bg-red-500 active:scale-90 flex items-center justify-center shadow-lg transition-transform disabled:opacity-40"
              >
                <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white" />
              </button>

              <button
                type="button"
                onClick={handleFlipCamera}
                title="Flip Camera"
                disabled={!!cameraError}
                className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

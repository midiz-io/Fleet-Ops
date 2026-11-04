import React, { useState, useEffect, useRef } from "react";
import Tesseract from "tesseract.js";
import { Camera, Upload, X, RefreshCw, AlertCircle, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NumberPlateScannerProps {
  onScanComplete: (plate: string) => void;
  trigger?: React.ReactNode;
  buttonLabel?: string;
}

export function NumberPlateScanner({ onScanComplete, trigger, buttonLabel }: NumberPlateScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"camera" | "file">("camera");
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selectedPlate, setSelectedPlate] = useState("");
  const { toast: showToast } = useToast();

  // Real-time OCR specific states
  const [isAutoScanning, setIsAutoScanning] = useState(true);
  const [isWorkerInitializing, setIsWorkerInitializing] = useState(false);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "initializing" | "scanning" | "success" | "error">("idle");
  const [lastScannedText, setLastScannedText] = useState("");
  const [justDetectedState, setJustDetectedState] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const workerRef = useRef<any>(null);
  const isScanningRef = useRef(false);
  const justDetectedRef = useRef(false);

  // Regex patterns to parse number plates (Sri Lankan & generic formats)
  const parseNumberPlates = (text: string): string[] => {
    // Normalize: uppercase, remove noise characters except letters, numbers, spaces, hyphens
    const cleaned = text
      .toUpperCase()
      .replace(/[^A-Z0-9-\s]/g, "")
      .replace(/\s+/g, " ");

    const results = new Set<string>();

    // Pattern 1: Sri Lankan Modern (e.g. WP CAB-1234, SP CA-1234, CAB-1234)
    // Provinces: WP, SP, CP, NP, EP, NW, NC, UP, SG
    const modernSriLankanRegex = /\b(WP|SP|CP|NP|EP|NW|NC|UP|SG)?\s*([A-Z]{2,3})\s*[-â€“-\s]?\s*(\d{4})\b/g;

    // Pattern 2: Sri Lankan Older (e.g. 19-1234, 250-1234)
    const oldSriLankanRegex = /\b(\d{2,3})\s*[-â€“-\s]?\s*(\d{4})\b/g;

    // Pattern 3: Generic alphanumeric plates (e.g. ABC 1234, ABC-1234, AB 1234)
    const genericPlateRegex = /\b([A-Z]{1,3})\s*[-â€“-\s]?\s*(\d{4})\b/g;

    let match;

    // Sri Lankan modern
    while ((match = modernSriLankanRegex.exec(cleaned)) !== null) {
      const province = match[1] ? `${match[1]} ` : "";
      const letters = match[2];
      const digits = match[3];
      results.add(`${province}${letters}-${digits}`.trim());
    }

    // Sri Lankan old
    while ((match = oldSriLankanRegex.exec(cleaned)) !== null) {
      const prefix = match[1];
      const digits = match[2];
      results.add(`${prefix}-${digits}`);
    }

    // Generic
    while ((match = genericPlateRegex.exec(cleaned)) !== null) {
      const letters = match[1];
      const digits = match[2];
      results.add(`${letters}-${digits}`);
    }

    // Individual word fallback: match things like "CAB1234" or "WP-CAB-1234"
    const words = cleaned.split(" ");
    for (const word of words) {
      const cleanedWord = word.trim();
      // Match something that looks like letters + numbers of size 4 to 12
      if (cleanedWord.length >= 4 && cleanedWord.length <= 12) {
        if (/[A-Z]/.test(cleanedWord) && /\d/.test(cleanedWord)) {
          // If it matches letters followed by numbers or similar, insert hyphen
          const lettersDigitsMatch = cleanedWord.match(/^([A-Z]+)(\d+)$/);
          if (lettersDigitsMatch) {
            results.add(`${lettersDigitsMatch[1]}-${lettersDigitsMatch[2]}`);
          } else {
            results.add(cleanedWord);
          }
        }
      }
    }

    return Array.from(results);
  };

  const initWorker = async () => {
    if (workerRef.current) return;
    setIsWorkerInitializing(true);
    setOcrStatus("initializing");
    try {
      const worker = await Tesseract.createWorker("eng");
      // Optimize worker by whitelisting characters for plates
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ",
      });
      workerRef.current = worker;
      setIsWorkerReady(true);
      setOcrStatus("idle");
    } catch (err) {
      console.error("Failed to initialize Tesseract worker:", err);
      setOcrStatus("error");
      showToast({
        title: "OCR Engine Error",
        description: "Failed to initialize fast real-time OCR engine.",
        variant: "destructive"
      });
    } finally {
      setIsWorkerInitializing(false);
    }
  };

  const terminateWorker = async () => {
    if (workerRef.current) {
      try {
        await workerRef.current.terminate();
      } catch (err) {
        console.error("Failed to terminate Tesseract worker:", err);
      }
      workerRef.current = null;
    }
    setIsWorkerReady(false);
  };

  const startCamera = async () => {
    setIsCameraLoading(true);
    setMode("camera");
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Auto-play failed, user interaction may be required:", playErr);
        }
      }
      // Initialize OCR engine worker in parallel
      initWorker();
    } catch (err) {
      console.error("Camera access failed:", err);
      setMode("file");
      showToast({
        title: "Camera Access Failed",
        description: "Falling back to file/photo upload mode. Please ensure camera permissions are granted.",
        variant: "destructive"
      });
    } finally {
      setIsCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (isOpen && mode === "camera") {
      startCamera();
    } else {
      stopCamera();
      terminateWorker();
    }
    return () => {
      stopCamera();
      terminateWorker();
    };
  }, [isOpen, mode]);

  // Loop for continuous real-time auto-scanning
  useEffect(() => {
    let active = true;
    let timeoutId: any = null;

    const runLoop = async () => {
      if (!active) return;

      if (
        isOpen &&
        mode === "camera" &&
        isAutoScanning &&
        isWorkerReady &&
        workerRef.current &&
        videoRef.current &&
        !isScanningRef.current &&
        !justDetectedRef.current
      ) {
        await captureFrameBackground();
      }

      if (active) {
        timeoutId = setTimeout(runLoop, 1200); // scan every 1.2 seconds
      }
    };

    if (isOpen && mode === "camera" && isAutoScanning && isWorkerReady) {
      runLoop();
    }

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOpen, mode, isAutoScanning, isWorkerReady]);

  const captureFrameBackground = async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current || isScanningRef.current) return;

    isScanningRef.current = true;
    setOcrStatus("scanning");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        isScanningRef.current = false;
        setOcrStatus("idle");
        return;
      }

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      if (videoWidth === 0 || videoHeight === 0) {
        isScanningRef.current = false;
        setOcrStatus("idle");
        return;
      }

      canvas.width = videoWidth;
      canvas.height = videoHeight;

      // Draw current video frame to hidden canvas
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // Crop the center region (where the green box is drawn in CSS)
      const cropWidth = videoWidth * 0.65;
      const cropHeight = videoHeight * 0.35;
      const cropX = (videoWidth - cropWidth) / 2;
      const cropY = (videoHeight - cropHeight) / 2;

      // Downscale cropped canvas for fast OCR processing (max 500px)
      const maxDim = 500;
      let targetW = cropWidth;
      let targetH = cropHeight;
      if (targetW > maxDim) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      }

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = targetW;
      cropCanvas.height = targetH;
      const cropCtx = cropCanvas.getContext("2d", { alpha: false });

      let imageToScan: HTMLCanvasElement = canvas;
      if (cropCtx) {
        cropCtx.drawImage(
          canvas,
          cropX, cropY, cropWidth, cropHeight, // source region
          0, 0, targetW, targetH               // destination region
        );
        imageToScan = cropCanvas;
      }

      const { data } = await workerRef.current.recognize(imageToScan);
      const text = data.text;

      if (text.trim()) {
        setLastScannedText(text.trim());
      }

      const parsedPlates = parseNumberPlates(text);

      if (parsedPlates.length > 0) {
        setJustDetectedState(true);
        justDetectedRef.current = true;
        setOcrStatus("success");

        // Merge candidates
        setCandidates(prev => {
          const merged = new Set([...parsedPlates, ...prev]);
          return Array.from(merged);
        });

        // Auto select the first candidate found
        setSelectedPlate(parsedPlates[0]);

        showToast({
          title: "Plate Auto-Detected",
          description: `Found plate: ${parsedPlates[0]}`
        });

        // Brief pause after detection to allow user to view/select
        setTimeout(() => {
          setJustDetectedState(false);
          justDetectedRef.current = false;
          setOcrStatus("idle");
        }, 2500);
      } else {
        setOcrStatus("idle");
      }
    } catch (err) {
      console.error("Background scanning error:", err);
      setOcrStatus("idle");
    } finally {
      isScanningRef.current = false;
    }
  };

  const captureFrameManual = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsScanning(true);
    setScanProgress(0);
    setProgressStatus("Capturing image...");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      const cropWidth = videoWidth * 0.65;
      const cropHeight = videoHeight * 0.35;
      const cropX = (videoWidth - cropWidth) / 2;
      const cropY = (videoHeight - cropHeight) / 2;

      const maxDim = 500;
      let targetW = cropWidth;
      let targetH = cropHeight;
      if (targetW > maxDim) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      }

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = targetW;
      cropCanvas.height = targetH;
      const cropCtx = cropCanvas.getContext("2d", { alpha: false });

      let imageToScan: HTMLCanvasElement = canvas;
      if (cropCtx) {
        cropCtx.drawImage(
          canvas,
          cropX, cropY, cropWidth, cropHeight, // source region
          0, 0, targetW, targetH               // destination region
        );
        imageToScan = cropCanvas;
      }

      setProgressStatus("Processing OCR...");
      setScanProgress(50);

      let text = "";
      if (workerRef.current && isWorkerReady) {
        const { data } = await workerRef.current.recognize(imageToScan);
        text = data.text;
      } else {
        const result = await Tesseract.recognize(imageToScan, "eng");
        text = result.data.text;
      }

      setScanProgress(100);
      const parsedPlates = parseNumberPlates(text);
      setCandidates(parsedPlates);

      if (parsedPlates.length > 0) {
        setSelectedPlate(parsedPlates[0]);
        showToast({
          title: "Plate Detected",
          description: `Found ${parsedPlates.length} matches. Select the correct one.`
        });
      } else {
        showToast({
          title: "No Plate Detected",
          description: "Could not read plate. Try uploading a clearer picture or adjusting the camera.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error(err);
      showToast({
        title: "OCR Failed",
        description: "Error occurred while recognizing text.",
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
      setProgressStatus("");
      setScanProgress(0);
    }
  };

  const processOCR = async (imageSrc: string | HTMLCanvasElement) => {
    setIsScanning(true);
    setScanProgress(0);
    setProgressStatus("Loading OCR Engine...");
    try {
      let text = "";
      if (workerRef.current && isWorkerReady) {
        setProgressStatus("Scanning uploaded image...");
        setScanProgress(50);
        const { data } = await workerRef.current.recognize(imageSrc);
        text = data.text;
        setScanProgress(100);
      } else {
        const result = await Tesseract.recognize(imageSrc, "eng", {
          logger: m => {
            if (m.status === "recognizing text") {
              setProgressStatus("Scanning plate...");
              setScanProgress(Math.round(m.progress * 100));
            }
          }
        });
        text = result.data.text;
      }

      const parsedPlates = parseNumberPlates(text);
      setCandidates(parsedPlates);

      if (parsedPlates.length > 0) {
        setSelectedPlate(parsedPlates[0]);
        showToast({
          title: "Plate Detected",
          description: `Found ${parsedPlates.length} matches. Select the correct one.`
        });
      } else {
        showToast({
          title: "No Plate Detected",
          description: "Could not read plate. Try uploading a clearer picture or adjusting the camera.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error(err);
      showToast({
        title: "OCR Failed",
        description: "Error occurred while recognizing text.",
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
      setProgressStatus("");
      setScanProgress(0);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        processOCR(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const applyPlate = () => {
    if (selectedPlate.trim()) {
      onScanComplete(selectedPlate.trim().toUpperCase());
      setIsOpen(false);
      // Reset scanner state
      setCandidates([]);
      setSelectedPlate("");
    }
  };

  return (
    <>
      <style>{`
        @keyframes scan-line {
          0% { top: 0%; opacity: 0.4; }
          50% { top: calc(100% - 2px); opacity: 1; }
          100% { top: 0%; opacity: 0.4; }
        }
        .animate-scanner-laser {
          animation: scan-line 2s ease-in-out infinite;
        }
      `}</style>

      <div onClick={() => setIsOpen(true)}>
        {trigger ?? (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold p-1.5 rounded-lg border border-primary/20 bg-primary/5 transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            {buttonLabel || "Scan Plate"}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary animate-pulse" />
                <h2 className="font-bold text-foreground">Number Plate Scanner</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-secondary rounded-lg text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector */}
            <div className="flex border-b border-border bg-secondary/30 p-1">
              <button
                onClick={() => setMode("camera")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  mode === "camera"
                    ? "bg-card text-primary shadow-xs border border-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Camera className="w-4 h-4" />
                Live Camera
              </button>
              <button
                onClick={() => setMode("file")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  mode === "file"
                    ? "bg-card text-primary shadow-xs border border-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload Image
              </button>
            </div>

            {/* Scanner Viewport */}
            <div className="relative bg-black flex-1 min-h-[250px] max-h-[350px] flex items-center justify-center overflow-hidden">
              {mode === "camera" && (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraLoading ? "hidden" : ""}`}
                  />

                  {isCameraLoading ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <span className="text-sm">Initializing camera...</span>
                    </div>
                  ) : (
                    <>
                      {/* OCR Status Badge */}
                      <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5 z-20">
                        {ocrStatus === "initializing" && (
                          <>
                            <Loader2 className="w-3 h-3 text-primary animate-spin" />
                            <span className="text-[10px] text-white font-medium">Engine Loading...</span>
                          </>
                        )}
                        {ocrStatus === "scanning" && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                            <span className="text-[10px] text-white font-medium">Scanning...</span>
                          </>
                        )}
                        {ocrStatus === "success" && (
                          <>
                            <Check className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] text-green-400 font-bold">Captured!</span>
                          </>
                        )}
                        {ocrStatus === "idle" && isAutoScanning && isWorkerReady && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] text-white font-medium">Ready</span>
                          </>
                        )}
                        {ocrStatus === "idle" && (!isAutoScanning || !isWorkerReady) && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {!isWorkerReady ? "Warming up engine..." : "Manual Mode"}
                            </span>
                          </>
                        )}
                        {ocrStatus === "error" && (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span className="text-[10px] text-red-400 font-medium">OCR Error</span>
                          </>
                        )}
                      </div>

                      {/* Targeting overlay frame */}
                      <div className="absolute inset-0 flex items-center justify-center p-6">
                        <div className={`w-[80%] h-[35%] border-2 rounded-xl relative transition-all duration-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] ${
                          justDetectedState
                            ? "border-green-500 scale-102 border-solid shadow-[0_0_15px_rgba(34,197,94,0.4),0_0_0_9999px_rgba(0,0,0,0.6)]"
                            : "border-dashed border-primary"
                        }`}>
                          {/* Corner bracket decorations */}
                          <div className={`absolute -top-1.5 -left-1.5 w-4 h-4 border-t-4 border-l-4 rounded-tl-sm transition-colors ${justDetectedState ? "border-green-500" : "border-primary"}`}></div>
                          <div className={`absolute -top-1.5 -right-1.5 w-4 h-4 border-t-4 border-r-4 rounded-tr-sm transition-colors ${justDetectedState ? "border-green-500" : "border-primary"}`}></div>
                          <div className={`absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-4 border-l-4 rounded-bl-sm transition-colors ${justDetectedState ? "border-green-500" : "border-primary"}`}></div>
                          <div className={`absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-4 border-r-4 rounded-br-sm transition-colors ${justDetectedState ? "border-green-500" : "border-primary"}`}></div>
                          
                          {/* Scanning laser line overlay */}
                          {isAutoScanning && isWorkerReady && !justDetectedState && (
                            <div className="absolute left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_hsl(var(--primary))] animate-scanner-laser pointer-events-none" />
                          )}

                          <div className={`absolute inset-0 flex items-center justify-center bg-primary/5 transition-colors ${justDetectedState ? "bg-green-500/10" : ""}`}>
                            <span className={`text-[10px] tracking-wider font-semibold uppercase transition-colors ${justDetectedState ? "text-green-400 font-bold" : "text-primary/75"}`}>
                              {justDetectedState 
                                ? "Plate Detected!" 
                                : isAutoScanning 
                                  ? isWorkerReady 
                                    ? "Scanning Automatically" 
                                    : "Preparing OCR Engine..."
                                  : "Align Plate & Snap"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Controls overlay */}
                      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-6 z-20">
                        {/* Auto Scan Toggle Button */}
                        <button
                          type="button"
                          onClick={() => setIsAutoScanning(prev => !prev)}
                          disabled={!isWorkerReady}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold backdrop-blur-md transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                            isAutoScanning
                              ? "bg-primary/20 text-primary border-primary/30"
                              : "bg-black/60 text-muted-foreground border-white/10 hover:text-white"
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isAutoScanning && ocrStatus === "scanning" ? "animate-spin" : ""}`} />
                          <span>{isAutoScanning ? "Auto-Scan On" : "Auto-Scan Off"}</span>
                        </button>

                        {/* Shutter Button */}
                        <button
                          type="button"
                          onClick={captureFrameManual}
                          disabled={isScanning || isCameraLoading}
                          className="bg-primary text-primary-foreground font-bold rounded-full p-4 shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all flex items-center justify-center border-4 border-black/40 cursor-pointer"
                        >
                          {isScanning ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <Camera className="w-6 h-6" />
                          )}
                        </button>

                        {/* Clear candidates button */}
                        <div className="w-[90px] flex justify-end">
                          {candidates.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCandidates([]);
                                setSelectedPlate("");
                              }}
                              className="bg-black/60 text-white border border-white/10 text-[10px] font-semibold px-2.5 py-1.5 rounded-full hover:bg-secondary hover:text-primary transition-all backdrop-blur-md cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {mode === "file" && (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-secondary/10">
                  <label className="w-full h-48 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-card/50">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">Select license plate photo</span>
                    <span className="text-xs text-muted-foreground">JPEG, PNG up to 10MB</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isScanning}
                    />
                  </label>
                </div>
              )}

              {/* Progress Overlay */}
              {isScanning && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center p-6 z-30">
                  <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
                  <span className="text-sm font-semibold text-white mb-2">{progressStatus}</span>
                  <div className="w-48 bg-secondary h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground mt-1">{scanProgress}%</span>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />
            {/* Results Section */}
            <div className="p-4 bg-card border-t border-border flex flex-col gap-3 max-h-[300px] overflow-y-auto">
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Detected Results</h3>
                
                {candidates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {candidates.map((plate) => (
                      <button
                        key={plate}
                        onClick={() => setSelectedPlate(plate)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          selectedPlate === plate
                            ? "bg-primary/20 text-primary border-primary"
                            : "bg-secondary text-foreground border-border hover:border-muted-foreground"
                        }`}
                      >
                        {plate}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs bg-secondary/35 p-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-muted-foreground/80 flex-shrink-0" />
                    <span>No license plate detected yet. Adjust position or upload another image.</span>
                  </div>
                )}
              </div>

              {/* Edit and Confirm field */}
              <div className="space-y-2 mt-1">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scanned Value</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedPlate}
                    onChange={(e) => setSelectedPlate(e.target.value)}
                    placeholder="e.g. WP CAB-1234"
                    className="flex-1 bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm font-bold tracking-wider"
                  />
                  <button
                    onClick={applyPlate}
                    disabled={!selectedPlate.trim()}
                    className="bg-primary text-primary-foreground font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 hover:bg-primary/95 transition-all disabled:opacity-50 disabled:hover:bg-primary"
                  >
                    <Check className="w-4 h-4" />
                    Apply
                  </button>
                </div>
              </div>
            </div>
            
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}
    </>
  );
}


import { useState, useRef, useEffect, useMemo } from "react";
import { 
  ZoomIn, ZoomOut, RotateCcw, RotateCw, ArrowLeft, X, 
  ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon 
} from "lucide-react";
import { useSearch } from "wouter";

export interface ProofPhoto {
  url: string;
  label?: string;
}

export function ProofViewerPage() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const src = searchParams.get("src");
  const urlTitle = searchParams.get("title");
  const key = searchParams.get("key");
  const idxParam = searchParams.get("idx");

  // Load photos either from stored key or from src param
  const { photos, initialTitle, defaultIndex } = useMemo(() => {
    let list: ProofPhoto[] = [];
    let customTitle = urlTitle || "Proof Viewer";
    let startIndex = 0;

    if (idxParam) {
      const p = parseInt(idxParam, 10);
      if (!isNaN(p) && p >= 0) {
        startIndex = p;
      }
    }

    if (key) {
      try {
        const stored = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed.photos) && parsed.photos.length > 0) {
            list = parsed.photos.filter((item: any) => item && item.url);
          }
          if (parsed.title) {
            customTitle = parsed.title;
          }
          if (typeof parsed.initialIndex === "number" && !idxParam) {
            startIndex = parsed.initialIndex;
          }
        }
      } catch (e) {
        console.error("Failed to parse stored photos", e);
      }
    }

    if (list.length === 0 && src) {
      list = [{ url: src, label: urlTitle || "Photo" }];
    }

    if (startIndex >= list.length) {
      startIndex = 0;
    }

    return { photos: list, initialTitle: customTitle, defaultIndex: startIndex };
  }, [key, src, urlTitle, idxParam]);

  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  useEffect(() => {
    setActiveIndex(defaultIndex);
  }, [defaultIndex]);

  useEffect(() => {
    if (initialTitle) {
      document.title = `${initialTitle} - Vehicle Maintenance`;
    }
  }, [initialTitle]);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });

  const activePhoto = photos[activeIndex] || null;

  // Reset transforms whenever active image changes
  useEffect(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, [activeIndex]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : photos.length - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((i) => (i < photos.length - 1 ? i + 1 : 0));
      } else if (e.key === "Escape") {
        window.close();
      } else if (e.key === "+" || e.key === "=") {
        setScale((s) => Math.min(s + 0.25, 4));
      } else if (e.key === "-") {
        setScale((s) => Math.max(s - 0.25, 0.5));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [photos.length]);

  if (!activePhoto) {
    return (
      <div className="w-screen h-[100dvh] bg-black/95 flex flex-col items-center justify-center text-white">
        <ImageIcon className="w-12 h-12 text-muted-foreground opacity-40 mb-3" />
        <p className="mb-4 text-sm text-muted-foreground">No image source provided.</p>
        <button 
          onClick={() => window.close()} 
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold transition-colors"
        >
          Close Tab
        </button>
      </div>
    );
  }

  const handleZoomIn = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale((s) => Math.min(s + 0.25, 4));
  };

  const handleZoomOut = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale((s) => {
      const next = Math.max(s - 0.25, 0.5);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((r) => (r + 90) % 360);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: posStartRef.current.x + dx,
      y: posStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleBack = () => {
    window.close();
    setTimeout(() => {
      window.history.back();
    }, 100);
  };

  const handleOpenRaw = () => {
    window.open(activePhoto.url, "_blank");
  };

  return (
    <div className="w-screen h-[100dvh] bg-black/95 overflow-hidden relative flex flex-col select-none">
      {/* Header Controls */}
      <div className="flex-none p-3 sm:p-4 z-50 flex flex-col sm:flex-row items-center justify-between gap-2.5 w-full">
        {/* Title and Index indicator */}
        <div className="bg-black/70 backdrop-blur-md border border-white/10 px-4 py-2 sm:px-3.5 sm:py-1.5 rounded-2xl sm:rounded-full text-white text-xs font-semibold flex items-center justify-between gap-2.5 w-full sm:w-auto max-w-full shadow-lg">
          <button
            onClick={handleBack}
            className="p-1 -ml-1 hover:bg-white/20 rounded-full transition-colors cursor-pointer shrink-0 text-white"
            title="Back / Close Tab"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="truncate flex-1 text-left">
            <span className="font-bold text-white mr-1.5">{initialTitle}</span>
            {photos.length > 1 && (
              <span className="text-muted-foreground text-[11px]">
                ({activeIndex + 1}/{photos.length}: {activePhoto.label || `Photo ${activeIndex + 1}`})
              </span>
            )}
          </div>

          <span className="bg-primary/20 text-primary text-[11px] px-2 py-0.5 rounded-full font-bold shrink-0">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center justify-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 p-1.5 rounded-full w-full sm:w-auto shadow-lg">
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-2 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            title="Reset Zoom & Rotation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleOpenRaw}
            className="p-2 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            title="Open Direct Image URL"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-white/20 mx-1" />

          <button
            onClick={handleBack}
            className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors cursor-pointer"
            title="Close Tab"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Viewport with Left/Right Arrows */}
      <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden px-2 sm:px-12">
        {/* Previous Photo Button */}
        {photos.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((i) => (i > 0 ? i - 1 : photos.length - 1));
            }}
            className="absolute left-3 sm:left-6 z-40 p-3 bg-black/60 hover:bg-black/90 text-white rounded-full border border-white/20 backdrop-blur-md shadow-xl transition-all active:scale-95 cursor-pointer"
            title="Previous Photo (←)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Center Canvas */}
        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full h-full flex items-center justify-center overflow-hidden select-none ${
            scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          }`}
        >
          <img
            key={activePhoto.url}
            src={activePhoto.url}
            alt={activePhoto.label || "Proof preview"}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            }}
            className="max-w-[92vw] max-h-[75vh] object-contain transition-transform duration-100 ease-out rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>

        {/* Next Photo Button */}
        {photos.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((i) => (i < photos.length - 1 ? i + 1 : 0));
            }}
            className="absolute right-3 sm:right-6 z-40 p-3 bg-black/60 hover:bg-black/90 text-white rounded-full border border-white/20 backdrop-blur-md shadow-xl transition-all active:scale-95 cursor-pointer"
            title="Next Photo (→)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if multiple photos) & Navigation Hints */}
      <div className="flex-none w-full z-50 bg-black/80 backdrop-blur-md border-t border-white/10 px-4 py-2.5 flex flex-col items-center gap-2">
        {photos.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 no-scrollbar">
            {photos.map((p, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/20 text-white shadow-md scale-105"
                      : "border-white/10 bg-black/40 text-muted-foreground hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <img
                    src={p.url}
                    alt=""
                    className="w-8 h-8 rounded-lg object-cover border border-white/20 shrink-0"
                  />
                  <span className="text-xs font-semibold whitespace-nowrap">
                    {p.label || `Photo ${idx + 1}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="text-center text-[11px] text-muted-foreground">
          Use ← → arrow keys to switch photos · Mouse wheel to zoom · Click & drag when zoomed
        </div>
      </div>
    </div>
  );
}

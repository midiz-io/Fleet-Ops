import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

export interface PhotoItem {
  label: string;
  url: string | null;
}

interface MultiPhotoViewerProps {
  isOpen?: boolean;
  onClose: () => void;
  title?: string;
  photos: PhotoItem[];
  initialIndex?: number;
}

export function MultiPhotoViewer({
  isOpen = true,
  onClose,
  title = "Photo Viewer",
  photos,
  initialIndex = 0,
}: MultiPhotoViewerProps) {
  const validPhotos = photos.filter(p => !!p.url);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(initialIndex, Math.max(0, validPhotos.length - 1)));
      setScale(1);
      setRotation(0);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, initialIndex, validPhotos.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, validPhotos.length]);

  if (!isOpen || validPhotos.length === 0) return null;

  const currentPhoto = validPhotos[currentIndex] || validPhotos[0];

  const handlePrev = () => {
    setScale(1);
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : validPhotos.length - 1));
  };

  const handleNext = () => {
    setScale(1);
    setCurrentIndex(prev => (prev < validPhotos.length - 1 ? prev + 1 : 0));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 50) handleNext();
    else if (diff < -50) handlePrev();
    touchStartX.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between text-white border-b border-white/10 pb-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold truncate">{title}</h2>
          <p className="text-xs text-amber-400 font-medium">All photos in one window</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(s => Math.min(s + 0.25, 3))}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setScale(s => Math.max(s - 0.25, 0.75))}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setRotation(r => (r + 90) % 360)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Rotate"
          >
            <RotateCw className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors ml-2"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Display Area */}
      <div
        className="relative w-full max-w-4xl flex-1 flex flex-col items-center justify-center overflow-hidden my-3 select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Caption */}
        <div className="absolute top-2 bg-black/70 px-3 py-1 rounded-full text-xs font-semibold text-white/90 z-10 border border-white/10 shadow-lg">
          {currentIndex + 1} / {validPhotos.length} &bull; {currentPhoto.label}
        </div>

        {/* Previous Button */}
        {validPhotos.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-amber-500 text-white hover:text-black flex items-center justify-center transition-all border border-white/20 shadow-xl"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Big Photo */}
        <div className="w-full h-full max-h-[60vh] flex items-center justify-center p-2">
          <img
            src={currentPhoto.url || ""}
            alt={currentPhoto.label}
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transition: "transform 0.15s ease-out",
            }}
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl cursor-grab active:cursor-grabbing"
          />
        </div>

        {/* Next Button */}
        {validPhotos.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-amber-500 text-white hover:text-black flex items-center justify-center transition-all border border-white/20 shadow-xl"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnails Strip */}
      <div className="w-full max-w-4xl flex flex-col items-center gap-2">
        <p className="text-[11px] text-white/50 text-center">
          Left / right arrow, swipe, or tap a photo thumbnail. Scroll or zoom controls to enlarge.
        </p>
        <div className="flex items-center gap-2 overflow-x-auto p-1 max-w-full">
          {validPhotos.map((photo, idx) => (
            <button
              key={idx}
              onClick={() => {
                setScale(1);
                setCurrentIndex(idx);
              }}
              className={`relative flex flex-col items-center gap-1 p-1 rounded-xl transition-all border shrink-0 ${
                currentIndex === idx
                  ? "border-amber-400 bg-amber-400/20 shadow-md ring-2 ring-amber-400/50"
                  : "border-white/10 bg-white/5 hover:border-white/30"
              }`}
            >
              <img
                src={photo.url || ""}
                alt={photo.label}
                className="w-16 h-12 sm:w-20 sm:h-14 object-cover rounded-lg"
              />
              <span className={`text-[10px] font-medium max-w-[80px] truncate ${currentIndex === idx ? "text-amber-400 font-bold" : "text-white/70"}`}>
                {idx + 1}. {photo.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

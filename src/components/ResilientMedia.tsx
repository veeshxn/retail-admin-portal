"use client";

import React, { useState, useRef, useEffect } from "react";

export const normalizeMediaUrl = (url?: string): string => {
  if (!url || typeof url !== "string") return "";
  let clean = url.trim();
  if (clean.includes("dropbox.com")) {
    clean = clean.replace(/https?:\/\/(www\.)?dropbox\.com/, "https://dl.dropboxusercontent.com");
    clean = clean.replace(/([?&])dl=0/, "");
    if (!clean.includes("raw=1") && !clean.includes("dl=1")) {
      clean = clean.includes("?") ? clean + "&raw=1" : clean + "?raw=1";
    }
  }
  return clean;
};

interface MediaProps {
  src?: string;
  alt?: string;
  className?: string;
  fallbackSrc?: string;
  controls?: boolean;
}

export const ResilientMedia: React.FC<MediaProps> = ({
  src,
  alt = "Creative asset",
  className = "w-full h-full object-cover",
  fallbackSrc = "https://www.w3schools.com/html/mov_bbb.mp4",
  controls = true,
}) => {
  const [activeSrc, setActiveSrc] = useState<string>(() => normalizeMediaUrl(src));
  const [retries, setRetries] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setActiveSrc(normalizeMediaUrl(src));
    setRetries(0);
    setLoadFailed(false);
  }, [src]);

  const cleanUrl = (activeSrc || "").split("?")[0].toLowerCase();
  const isImage = cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg") || cleanUrl.endsWith(".png") || cleanUrl.endsWith(".webp");

  const handleMediaError = () => {
    if (retries < 3) {
      const nextAttempt = retries + 1;
      setRetries(nextAttempt);
      setTimeout(() => {
        if (activeSrc.includes("dropbox.com") || activeSrc.includes("dropboxusercontent.com")) {
          const sep = activeSrc.includes("?") ? "&" : "?";
          setActiveSrc(`${activeSrc.replace(/&_retry=\d+/, "")}${sep}_retry=${Date.now()}`);
        } else {
          setActiveSrc(activeSrc);
        }
      }, nextAttempt * 1000);
    } else if (fallbackSrc && activeSrc !== fallbackSrc) {
      console.warn("Media stream stalled after 3 attempts. Self-healing to backup source.");
      setActiveSrc(fallbackSrc);
    } else {
      setLoadFailed(true);
    }
  };

  if (!activeSrc || loadFailed) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-3 text-center text-xs text-slate-500 rounded-xl">
        <span>Preview stream offline</span>
        {src && (
          <button
            type="button"
            onClick={() => {
              setRetries(0);
              setLoadFailed(false);
              setActiveSrc(normalizeMediaUrl(src));
            }}
            className="mt-2 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
          >
            Retry Connection
          </button>
        )}
      </div>
    );
  }

  if (isImage) {
    return (
      <img
        src={activeSrc}
        alt={alt}
        onError={handleMediaError}
        className={className}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      key={activeSrc}
      src={activeSrc}
      controls={controls}
      playsInline
      preload="auto"
      onError={handleMediaError}
      className={`${className} bg-black`}
    />
  );
};

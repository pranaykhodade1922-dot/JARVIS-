import { useCallback, useEffect, useRef, useState } from "react";

const formatScreenError = (error, fallbackMessage) => {
  const name = error?.name ? `${error.name}: ` : "";
  const message = error?.message || fallbackMessage;
  return `${name}${message}`;
};

const resizeToFit = (width, height, maxDimension) => {
  if (!maxDimension || Math.max(width, height) <= maxDimension) {
    return {
      width,
      height,
    };
  }

  if (width >= height) {
    const scale = maxDimension / width;
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
  }

  const scale = maxDimension / height;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

export function useScreenShare() {
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const cleanupTrackRef = useRef(null);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [screenError, setScreenError] = useState("");

  const ensureHiddenVideo = useCallback(() => {
    if (videoRef.current) {
      return videoRef.current;
    }

    const video = document.createElement("video");
    video.style.position = "fixed";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.muted = true;
    video.playsInline = true;
    document.body.appendChild(video);
    videoRef.current = video;
    return video;
  }, []);

  const stopScreenShare = useCallback(() => {
    cleanupTrackRef.current?.();
    cleanupTrackRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setScreenStream(null);
    setIsScreenSharing(false);
    setScreenError("");
    console.log("[screenShare] stopped");
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      const error = new Error("Screen sharing is not supported in this browser.");
      setScreenError(error.message);
      throw error;
    }

    stopScreenShare();
    console.log("[screenShare] requesting display media");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error("No screen video track was returned by the browser.");
      }

      const handleEnded = () => {
        streamRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
        setScreenError("Screen sharing ended.");
        console.log("[screenShare] sharing ended by browser");
      };

      track.addEventListener("ended", handleEnded);
      cleanupTrackRef.current = () => track.removeEventListener("ended", handleEnded);

      const video = ensureHiddenVideo();
      video.srcObject = stream;
      await video.play();

      streamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      setScreenError("");
      console.log("[screenShare] permission granted and stream attached");
      return stream;
    } catch (error) {
      console.error("[screenShare] start failed", error);
      setScreenError(formatScreenError(error, "Screen sharing failed."));
      throw error;
    }
  }, [ensureHiddenVideo, stopScreenShare]);

  const captureCurrentFrame = useCallback(async ({ maxDimension = 1600, mimeType = "image/jpeg", quality = 0.82 } = {}) => {
    const stream = streamRef.current;
    if (!stream) {
      throw new Error("No active screen share is available.");
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") {
      throw new Error("The shared screen stream is no longer active.");
    }

    const video = ensureHiddenVideo();
    video.srcObject = stream;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((resolve, reject) => {
        const handleLoaded = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error("The shared screen could not be read for capture."));
        };
        const cleanup = () => {
          video.removeEventListener("loadeddata", handleLoaded);
          video.removeEventListener("error", handleError);
        };

        video.addEventListener("loadeddata", handleLoaded, { once: true });
        video.addEventListener("error", handleError, { once: true });
      });
    }

    await video.play();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const dimensions = resizeToFit(sourceWidth, sourceHeight, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas capture context could not be created.");
    }

    context.imageSmoothingEnabled = true;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const imageBase64 = dataUrl.split(",")[1];

    if (!imageBase64) {
      throw new Error("The captured screen image was empty.");
    }

    console.log("[screenShare] frame captured", {
      sourceWidth,
      sourceHeight,
      width: canvas.width,
      height: canvas.height,
      bytesApprox: imageBase64.length,
      mimeType,
      quality,
    });

    return {
      dataUrl,
      imageBase64,
      mimeType,
      sourceWidth,
      sourceHeight,
    };
  }, [ensureHiddenVideo]);

  useEffect(
    () => () => {
      stopScreenShare();
      if (videoRef.current?.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
        videoRef.current = null;
      }
    },
    [stopScreenShare],
  );

  return {
    startScreenShare,
    stopScreenShare,
    captureCurrentFrame,
    isScreenSharing,
    screenStream,
    screenError,
  };
}

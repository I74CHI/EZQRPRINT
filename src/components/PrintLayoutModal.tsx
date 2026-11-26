import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Download, LoaderCircle, RotateCw, X } from "lucide-react";
import {
  bytesToArrayBuffer,
  downloadBlobAsFile,
  fetchOrderFile,
  printBlob,
} from "../lib/printActions";
import type { Order, OrderFile } from "../types";

type LayoutMode =
  | "full"
  | "2-up"
  | "4-up"
  | "6-up"
  | "8-up"
  | "custom"
  | "passport"
  | "id-card";
type Orientation = "portrait" | "landscape";
type CropRect = { left: number; top: number; right: number; bottom: number };
type CropCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface StudioImage {
  id: string;
  file: OrderFile;
  url: string;
  crop: CropRect;
  rotation: number;
  widthMm: string;
  heightMm: string;
  offsetXmm: number;
  offsetYmm: number;
}

interface Placement {
  assetId: string;
  pageIndex: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

interface ImageRect {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MILLIMETERS_TO_POINTS = 72 / 25.4;
const mmToPt = (millimeters: number) => millimeters * MILLIMETERS_TO_POINTS;
const fullCrop: CropRect = { left: 0, top: 0, right: 1, bottom: 1 };


function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("An image could not be decoded."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The image could not be encoded."));
    }, "image/png");
  });
}

function backgroundColor(data: Uint8ClampedArray, width: number, height: number) {
  const patchSize = Math.max(2, Math.floor(Math.min(width, height) * 0.04));
  const samples: number[] = [];
  for (const [startX, startY] of [
    [0, 0],
    [width - patchSize, 0],
    [0, height - patchSize],
    [width - patchSize, height - patchSize],
  ]) {
    for (let y = startY; y < startY + patchSize; y += 1) {
      for (let x = startX; x < startX + patchSize; x += 1) {
        const index = (y * width + x) * 4;
        samples.push(data[index], data[index + 1], data[index + 2]);
      }
    }
  }
  const count = samples.length / 3;
  return [
    samples.reduce((sum, value, index) => (index % 3 === 0 ? sum + value : sum), 0) /
    count,
    samples.reduce((sum, value, index) => (index % 3 === 1 ? sum + value : sum), 0) /
    count,
    samples.reduce((sum, value, index) => (index % 3 === 2 ? sum + value : sum), 0) /
    count,
  ];
}

function findForegroundBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas image processing is unavailable.");
  const { width, height } = canvas;
  if (width < 4 || height < 4) {
    throw new Error("The ID image is too small to auto-crop.");
  }
  const pixels = context.getImageData(0, 0, width, height).data;
  const background = backgroundColor(pixels, width, height);
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 700));
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const index = (y * width + x) * 4;
      const distance =
        Math.abs(pixels[index] - background[0]) +
        Math.abs(pixels[index + 1] - background[1]) +
        Math.abs(pixels[index + 2] - background[2]);
      if (distance < 70) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      count += 1;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumYY += y * y;
      sumXY += x * y;
    }
  }

  const boxWidth = right - left;
  const boxHeight = bottom - top;
  const areaRatio = (boxWidth * boxHeight) / (width * height);
  if (count < 20 || areaRatio < 0.03 || areaRatio > 0.98) {
    throw new Error("The ID boundary was not clear enough to auto-crop.");
  }

  const meanX = sumX / count;
  const meanY = sumY / count;
  const varianceX = sumXX / count - meanX * meanX;
  const varianceY = sumYY / count - meanY * meanY;
  const covariance = sumXY / count - meanX * meanY;
  let angle = (0.5 * Math.atan2(2 * covariance, varianceX - varianceY) * 180) / Math.PI;
  if (angle > 45) angle -= 90;
  if (angle < -45) angle += 90;
  if (Math.abs(angle) > 18 || Math.abs(angle) < 0.6) angle = 0;

  const paddingX = Math.max(1, boxWidth * 0.012);
  const paddingY = Math.max(1, boxHeight * 0.012);
  return {
    background,
    angle,
    crop: {
      left: Math.max(0, (left - paddingX) / width),
      top: Math.max(0, (top - paddingY) / height),
      right: Math.min(1, (right + paddingX) / width),
      bottom: Math.min(1, (bottom + paddingY) / height),
    } satisfies CropRect,
  };
}

async function detectAndStraightenCard(blob: Blob) {
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImage(sourceUrl);
    const probeScale = Math.min(1, 700 / Math.max(image.naturalWidth, image.naturalHeight));
    const probe = document.createElement("canvas");
    probe.width = Math.max(1, Math.round(image.naturalWidth * probeScale));
    probe.height = Math.max(1, Math.round(image.naturalHeight * probeScale));
    const probeContext = probe.getContext("2d", { willReadFrequently: true });
    if (!probeContext) throw new Error("Canvas image processing is unavailable.");
    probeContext.drawImage(image, 0, 0, probe.width, probe.height);

    const detected = findForegroundBounds(probe);
    const rotatedProbe = document.createElement("canvas");
    const probeRadians = (-detected.angle * Math.PI) / 180;
    rotatedProbe.width = Math.ceil(
      probe.width * Math.abs(Math.cos(probeRadians)) +
      probe.height * Math.abs(Math.sin(probeRadians)),
    );
    rotatedProbe.height = Math.ceil(
      probe.width * Math.abs(Math.sin(probeRadians)) +
      probe.height * Math.abs(Math.cos(probeRadians)),
    );
    const rotatedProbeContext = rotatedProbe.getContext("2d", {
      willReadFrequently: true,
    });
    if (!rotatedProbeContext) throw new Error("Canvas image processing is unavailable.");
    rotatedProbeContext.fillStyle = `rgb(${detected.background.join(",")})`;
    rotatedProbeContext.fillRect(0, 0, rotatedProbe.width, rotatedProbe.height);
    rotatedProbeContext.translate(rotatedProbe.width / 2, rotatedProbe.height / 2);
    rotatedProbeContext.rotate(probeRadians);
    rotatedProbeContext.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      -probe.width / 2,
      -probe.height / 2,
      probe.width,
      probe.height,
    );

    const alignedBounds = findForegroundBounds(rotatedProbe).crop;
    const outputScale = Math.min(1, 4000 / Math.max(image.naturalWidth, image.naturalHeight));
    const sourceWidth = Math.max(1, Math.round(image.naturalWidth * outputScale));
    const sourceHeight = Math.max(1, Math.round(image.naturalHeight * outputScale));
    const output = document.createElement("canvas");
    output.width = Math.ceil(
      sourceWidth * Math.abs(Math.cos(probeRadians)) +
      sourceHeight * Math.abs(Math.sin(probeRadians)),
    );
    output.height = Math.ceil(
      sourceWidth * Math.abs(Math.sin(probeRadians)) +
      sourceHeight * Math.abs(Math.cos(probeRadians)),
    );
    const outputContext = output.getContext("2d");
    if (!outputContext) throw new Error("Canvas image processing is unavailable.");
    outputContext.fillStyle = `rgb(${detected.background.join(",")})`;
    outputContext.fillRect(0, 0, output.width, output.height);
    outputContext.translate(output.width / 2, output.height / 2);
    outputContext.rotate(probeRadians);
    outputContext.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight,
    );

    return { blob: await canvasToBlob(output), crop: alignedBounds };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function makeProcessedCanvas(image: StudioImage, inkSaver: boolean) {
  return loadImage(image.url).then((source) => {
    const sourceWidth = source.naturalWidth * (image.crop.right - image.crop.left);
    const sourceHeight = source.naturalHeight * (image.crop.bottom - image.crop.top);
    const quarterTurn = image.rotation % 180 !== 0;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(quarterTurn ? sourceHeight : sourceWidth));
    canvas.height = Math.max(1, Math.round(quarterTurn ? sourceWidth : sourceHeight));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas image processing is unavailable.");
    if (inkSaver) {
      context.filter = "contrast(140%) brightness(110%) grayscale(100%)";
    }
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((image.rotation * Math.PI) / 180);
    context.drawImage(
      source,
      source.naturalWidth * image.crop.left,
      source.naturalHeight * image.crop.top,
      sourceWidth,
      sourceHeight,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight,
    );
    return canvas;
  });
}

function getGridSize(mode: LayoutMode, customRows: number, customColumns: number) {
  switch (mode) {
    case "full":
      return { rows: 1, columns: 1 };
    case "2-up":
      return { rows: 1, columns: 2 };
    case "4-up":
      return { rows: 2, columns: 2 };
    case "6-up":
      return { rows: 2, columns: 3 };
    case "8-up":
      return { rows: 2, columns: 4 };
    case "custom":
      return { rows: customRows, columns: customColumns };
    default:
      return { rows: 1, columns: 1 };
  }
}

function getPlacements(
  images: StudioImage[],
  mode: LayoutMode,
  orientation: Orientation,
  spacingMm: number,
  customRows: number,
  customColumns: number,
  frontId: string,
  backId: string,
  passportImageId: string,
): Placement[] {
  const pageWidth = orientation === "portrait" ? A4_WIDTH_MM : A4_HEIGHT_MM;
  const pageHeight = orientation === "portrait" ? A4_HEIGHT_MM : A4_WIDTH_MM;

  if (mode === "id-card") {
    const cardIds = [frontId, backId].filter(Boolean);
    const cardWidth = 85.6;
    const cardHeight = 54;
    const gap = 10;
    const startY = (pageHeight - cardHeight * 2 - gap) / 2;
    return cardIds.flatMap((assetId, index) => {
      if (!images.some((image) => image.id === assetId)) return [];
      return [{
        assetId,
        pageIndex: 0,
        xMm: (pageWidth - cardWidth) / 2,
        yMm: startY + index * (cardHeight + gap),
        widthMm: cardWidth,
        heightMm: cardHeight,
      }];
    });
  }

  if (mode === "passport") {
    const widthMm = 35;
    const heightMm = 45;
    const rows = 2;
    const columns = 3;
    const gap = spacingMm;
    const startX = (pageWidth - widthMm * columns - gap * (columns - 1)) / 2;
    const startY = (pageHeight - heightMm * rows - gap * (rows - 1)) / 2;
    const image = images.find((item) => item.id === passportImageId) ?? images[0];
    if (!image) return [];
    return Array.from({ length: rows * columns }, (_, slot) => {
      return {
        assetId: image.id,
        pageIndex: 0,
        xMm: startX + (slot % columns) * (widthMm + gap),
        yMm: startY + Math.floor(slot / columns) * (heightMm + gap),
        widthMm,
        heightMm,
      };
    });
  }

  const { rows, columns } = getGridSize(mode, customRows, customColumns);
  const capacity = rows * columns;
  const margin = 10;
  const cellWidth = (pageWidth - margin * 2 - spacingMm * (columns - 1)) / columns;
  const cellHeight = (pageHeight - margin * 2 - spacingMm * (rows - 1)) / rows;
  return images.map((image, index) => {
    const slot = index % capacity;
    return {
      assetId: image.id,
      pageIndex: Math.floor(index / capacity),
      xMm: margin + (slot % columns) * (cellWidth + spacingMm),
      yMm: margin + Math.floor(slot / columns) * (cellHeight + spacingMm),
      widthMm: cellWidth,
      heightMm: cellHeight,
    };
  });
}

function getImageRect(
  image: StudioImage,
  source: HTMLCanvasElement,
  placement: Placement,
): ImageRect {
  const customWidth = Number(image.widthMm);
  const customHeight = Number(image.heightMm);
  const boxWidth = Math.min(
    placement.widthMm,
    customWidth > 0 ? customWidth : placement.widthMm,
  );
  const boxHeight = Math.min(
    placement.heightMm,
    customHeight > 0 ? customHeight : placement.heightMm,
  );
  const scale = Math.min(boxWidth / source.width, boxHeight / source.height);
  const widthMm = source.width * scale;
  const heightMm = source.height * scale;
  const maxOffsetX = Math.max(0, (placement.widthMm - widthMm) / 2);
  const maxOffsetY = Math.max(0, (placement.heightMm - heightMm) / 2);
  const offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, image.offsetXmm));
  const offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, image.offsetYmm));
  return {
    xMm: placement.xMm + (placement.widthMm - widthMm) / 2 + offsetX,
    yMm: placement.yMm + (placement.heightMm - heightMm) / 2 + offsetY,
    widthMm,
    heightMm,
  };
}

interface PrintLayoutModalProps {
  order: Order;
  onClose: () => void;
}

export function PrintLayoutModal({ order, onClose }: PrintLayoutModalProps) {
  const [images, setImages] = useState<StudioImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("6-up");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [spacingMm, setSpacingMm] = useState(5);
  const [showCutLines, setShowCutLines] = useState(true);
  const [customRows, setCustomRows] = useState(2);
  const [customColumns, setCustomColumns] = useState(3);
  const [passportImageId, setPassportImageId] = useState("");
  const [frontId, setFrontId] = useState("");
  const [backId, setBackId] = useState("");
  const [inkSaver, setInkSaver] = useState(false);
  const [cropEditId, setCropEditId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [previewRendering, setPreviewRendering] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "png" | "print" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrls = useRef(new Set<string>());
  const renderCache = useRef(new Map<string, { signature: string; canvas: HTMLCanvasElement }>());
  const renderVersion = useRef(0);
  const cropTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const cropDrag = useRef<{ imageId: string; corner: CropCorner } | null>(null);
  const canvasDrag = useRef<{
    imageId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const layoutImages = useMemo(
    () => images.filter((image) => image.file.mimeType !== "application/pdf"),
    [images],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    const imageFiles = order.files.filter((file) => file.mimeType !== "application/pdf");
    Promise.all(
      imageFiles.map(async (file) => {
        const blob = await fetchOrderFile(file, order.id);
        if (!active) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.current.add(url);
        await loadImage(url);
        return {
          id: file.storagePath,
          file,
          url,
          crop: { ...fullCrop },
          rotation: 0,
          widthMm: "",
          heightMm: "",
          offsetXmm: 0,
          offsetYmm: 0,
        };
      }),
    )
      .then((loadedImages) => {
        if (!active) return;
        const availableImages = loadedImages.filter(
          (image): image is StudioImage => image !== null,
        );
        setImages(availableImages);
        setPassportImageId(availableImages[0]?.id ?? "");
        setFrontId(availableImages[0]?.id ?? "");
        setBackId(availableImages[1]?.id ?? availableImages[0]?.id ?? "");
        setLoading(false);
      })
      .catch((loadIssue: unknown) => {
        if (!active) return;
        setLoadError(
          loadIssue instanceof Error
            ? loadIssue.message
            : "Unable to load the order images.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
      if (cropTimer.current !== null) window.clearTimeout(cropTimer.current);
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current.clear();
      renderCache.current.clear();
    };
  }, [order.id]);

  const placements = useMemo(
    () =>
      getPlacements(
        layoutImages,
        layoutMode,
        orientation,
        spacingMm,
        customRows,
        customColumns,
        frontId,
        backId,
        passportImageId,
      ),
    [
      layoutImages,
      layoutMode,
      orientation,
      spacingMm,
      customRows,
      customColumns,
      frontId,
      backId,
      passportImageId,
    ],
  );
  const pageCount = Math.max(1, ...placements.map((item) => item.pageIndex + 1));
  const selectedPreviewPage = Math.min(previewPage, pageCount - 1);

  useEffect(() => {
    let active = true;
    const version = ++renderVersion.current;
    const canvas = canvasRef.current;
    if (!canvas || layoutImages.length === 0) return;
    setPreviewRendering(true);

    const pageWidthMm = orientation === "portrait" ? A4_WIDTH_MM : A4_HEIGHT_MM;
    const pageHeightMm = orientation === "portrait" ? A4_HEIGHT_MM : A4_WIDTH_MM;
    canvas.width = Math.round(mmToPt(pageWidthMm) * (150 / 72));
    canvas.height = Math.round(mmToPt(pageHeightMm) * (150 / 72));

    Promise.all(
      layoutImages.map(async (image) => {
        const signature = [
          image.url,
          image.crop.left,
          image.crop.top,
          image.crop.right,
          image.crop.bottom,
          image.rotation,
          inkSaver,
        ].join("|");
        const cached = renderCache.current.get(image.id);
        const rendered =
          cached?.signature === signature
            ? cached.canvas
            : await makeProcessedCanvas(image, inkSaver);
        if (cached?.signature !== signature) {
          renderCache.current.set(image.id, { signature, canvas: rendered });
        }
        return [image.id, rendered] as const;
      }),
    )
      .then((renderedImages) => {
        if (!active || version !== renderVersion.current) return;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The A4 preview canvas is unavailable.");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / pageWidthMm;
        const imageCanvases = new Map(renderedImages);
        const byId = new Map(
          layoutImages.map((image) => [image.id, image] as const),
        );
        context.save();
        context.scale(scale, scale);
        context.strokeStyle = "#b8b8b8";
        context.lineWidth = 0.35;
        context.strokeRect(0.2, 0.2, pageWidthMm - 0.4, pageHeightMm - 0.4);
        if (showCutLines) context.setLineDash([1.2, 1.2]);

        for (const placement of placements.filter(
          (item) => item.pageIndex === selectedPreviewPage,
        )) {
          const item = byId.get(placement.assetId);
          const rendered = imageCanvases.get(placement.assetId);
          if (!item || !rendered) continue;
          context.save();
          context.beginPath();
          context.rect(
            placement.xMm,
            placement.yMm,
            placement.widthMm,
            placement.heightMm,
          );
          context.clip();
          const rect = getImageRect(item, rendered, placement);
          context.drawImage(rendered, rect.xMm, rect.yMm, rect.widthMm, rect.heightMm);
          context.restore();
          if (showCutLines) {
            context.strokeRect(
              placement.xMm,
              placement.yMm,
              placement.widthMm,
              placement.heightMm,
            );
          }
        }
        context.restore();
        canvas.dataset.pageCount = String(
          placements.reduce((count, item) => Math.max(count, item.pageIndex + 1), 1),
        );
        setPreviewRendering(false);
      })
      .catch((renderIssue: unknown) => {
        if (active) {
          setStudioError(
            renderIssue instanceof Error
              ? renderIssue.message
              : "Unable to render the A4 preview.",
          );
          setPreviewRendering(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    layoutImages,
    placements,
    orientation,
    showCutLines,
    inkSaver,
    selectedPreviewPage,
  ]);

  function updateImage(imageId: string, updates: Partial<StudioImage>) {
    setImages((current) =>
      current.map((image) => (image.id === imageId ? { ...image, ...updates } : image)),
    );
  }

  function showCropForOneSecond(imageId: string) {
    if (cropTimer.current !== null) window.clearTimeout(cropTimer.current);
    setCropEditId(imageId);
    cropTimer.current = window.setTimeout(() => {
      setCropEditId((current) => (current === imageId ? null : current));
      cropTimer.current = null;
    }, 1000);
  }

  async function autoCrop(image: StudioImage) {
    setStudioError(null);
    try {
      const result = await detectAndStraightenCard(await fetchOrderFile(image.file, order.id));
      if (!mounted.current) return;
      const url = URL.createObjectURL(result.blob);
      objectUrls.current.add(url);
      updateImage(image.id, { url, crop: result.crop, rotation: 0 });
      showCropForOneSecond(image.id);
    } catch (cropIssue) {
      if (!mounted.current) return;
      setStudioError(
        cropIssue instanceof Error
          ? cropIssue.message
          : `Unable to auto-crop ${image.file.fileName}.`,
      );
    }
  }

  function updateCropFromPointer(
    event: ReactPointerEvent<HTMLDivElement>,
    imageId: string,
  ) {
    const drag = cropDrag.current;
    if (!drag || drag.imageId !== imageId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));

    setImages((current) =>
      current.map((image) => {
        if (image.id !== imageId) return image;
        const crop = { ...image.crop };
        if (drag.corner.includes("left")) {
          crop.left = Math.max(0, Math.min(x, crop.right - 0.04));
        } else {
          crop.right = Math.min(1, Math.max(x, crop.left + 0.04));
        }
        if (drag.corner.includes("top")) {
          crop.top = Math.max(0, Math.min(y, crop.bottom - 0.04));
        } else {
          crop.bottom = Math.min(1, Math.max(y, crop.top + 0.04));
        }
        return { ...image, crop };
      }),
    );
  }

  function handleCropPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    imageId: string,
    corner: CropCorner,
  ) {
    event.preventDefault();
    event.stopPropagation();
    cropDrag.current = { imageId, corner };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const pageWidthMm = orientation === "portrait" ? A4_WIDTH_MM : A4_HEIGHT_MM;
    const pageHeightMm = orientation === "portrait" ? A4_HEIGHT_MM : A4_WIDTH_MM;
    const xMm = ((event.clientX - bounds.left) / bounds.width) * pageWidthMm;
    const yMm = ((event.clientY - bounds.top) / bounds.height) * pageHeightMm;
    const hit = placements.find(
      (item) =>
        item.pageIndex === selectedPreviewPage &&
        xMm >= item.xMm &&
        xMm <= item.xMm + item.widthMm &&
        yMm >= item.yMm &&
        yMm <= item.yMm + item.heightMm,
    );
    if (hit) {
      const image = layoutImages.find((item) => item.id === hit.assetId);
      if (image) {
        canvasDrag.current = {
          imageId: image.id,
          startX: xMm,
          startY: yMm,
          offsetX: image.offsetXmm,
          offsetY: image.offsetYmm,
        };
        canvas.setPointerCapture(event.pointerId);
      }
    }
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const drag = canvasDrag.current;
    if (!canvas || !drag) return;
    const bounds = canvas.getBoundingClientRect();
    const pageWidthMm = orientation === "portrait" ? A4_WIDTH_MM : A4_HEIGHT_MM;
    const pageHeightMm = orientation === "portrait" ? A4_HEIGHT_MM : A4_WIDTH_MM;
    const xMm = ((event.clientX - bounds.left) / bounds.width) * pageWidthMm;
    const yMm = ((event.clientY - bounds.top) / bounds.height) * pageHeightMm;
    updateImage(drag.imageId, {
      offsetXmm: drag.offsetX + xMm - drag.startX,
      offsetYmm: drag.offsetY + yMm - drag.startY,
    });
  }

  function handleCanvasPointerUp() {
    canvasDrag.current = null;
  }

  async function buildLayoutPdf() {
    const { PDFDocument, rgb } = await import("pdf-lib");
    const pageWidthMm = orientation === "portrait" ? A4_WIDTH_MM : A4_HEIGHT_MM;
    const pageHeightMm = orientation === "portrait" ? A4_HEIGHT_MM : A4_WIDTH_MM;
    const pageWidthPt = mmToPt(pageWidthMm);
    const pageHeightPt = mmToPt(pageHeightMm);
    const renderedImages = await Promise.all(
      layoutImages.map(
        async (image) =>
          [image.id, await makeProcessedCanvas(image, inkSaver)] as const,
      ),
    );
    const imageCanvases = new Map(renderedImages);
    const byId = new Map(
      layoutImages.map((image) => [image.id, image] as const),
    );
    const pdf = await PDFDocument.create();
    const pages = Array.from({ length: pageCount }, () =>
      pdf.addPage([pageWidthPt, pageHeightPt]),
    );
    const embedded = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

    for (const placement of placements) {
      const image = byId.get(placement.assetId);
      const imageCanvas = imageCanvases.get(placement.assetId);
      if (!image || !imageCanvas) continue;
      let embeddedImage = embedded.get(image.id);
      if (!embeddedImage) {
        const imageBlob = await canvasToBlob(imageCanvas);
        embeddedImage = await pdf.embedPng(await imageBlob.arrayBuffer());
        embedded.set(image.id, embeddedImage);
      }
      const rect = getImageRect(image, imageCanvas, placement);
      const page = pages[placement.pageIndex];
      page.drawImage(embeddedImage, {
        x: mmToPt(rect.xMm),
        y: pageHeightPt - mmToPt(rect.yMm + rect.heightMm),
        width: mmToPt(rect.widthMm),
        height: mmToPt(rect.heightMm),
      });
      if (showCutLines) {
        page.drawRectangle({
          x: mmToPt(placement.xMm),
          y: pageHeightPt - mmToPt(placement.yMm + placement.heightMm),
          width: mmToPt(placement.widthMm),
          height: mmToPt(placement.heightMm),
          borderColor: rgb(0.65, 0.65, 0.65),
          borderWidth: 0.35,
          borderDashArray: [3, 3],
        });
      }
    }

    return new Blob([bytesToArrayBuffer(await pdf.save())], {
      type: "application/pdf",
    });
  }

  async function downloadPdf() {
    setExporting("pdf");
    setStudioError(null);
    try {
      await downloadBlobAsFile(
        await buildLayoutPdf(),
        `EZQRPRINT-Token-${order.tokenNumber}-layout.pdf`,
      );
    } catch (exportIssue) {
      if (!mounted.current) return;
      setStudioError(
        exportIssue instanceof Error
          ? exportIssue.message
          : "Unable to export the arranged PDF.",
      );
    } finally {
      if (mounted.current) setExporting(null);
    }
  }

  async function printArrangedPdf() {
    setExporting("print");
    setStudioError(null);
    try {
      await printBlob(await buildLayoutPdf(), "application/pdf");
    } catch (printIssue) {
      if (!mounted.current) return;
      setStudioError(
        printIssue instanceof Error
          ? printIssue.message
          : "Unable to prepare the arranged sheet for printing.",
      );
    } finally {
      if (mounted.current) setExporting(null);
    }
  }

  async function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas || previewRendering) return;
    setExporting("png");
    setStudioError(null);
    try {
      const blob = await canvasToBlob(canvas);
      await downloadBlobAsFile(
        blob,
        `EZQRPRINT-Token-${order.tokenNumber}-layout-page-${selectedPreviewPage + 1}.png`,
      );
    } catch (exportIssue) {
      if (!mounted.current) return;
      setStudioError(
        exportIssue instanceof Error
          ? exportIssue.message
          : "Unable to export the arranged image.",
      );
    } finally {
      if (mounted.current) setExporting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-layout-title"
        className="mx-auto my-2 max-w-7xl border border-[#171717] bg-[#f3f2ee] shadow-2xl sm:my-6"
      >
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#c9c7c0] bg-[#f3f2ee] px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e6322b]">
              EZQRPRINT · A4 PRINT STUDIO
            </p>
            <h2 id="print-layout-title" className="mt-1 text-xl font-black">
              Arrange images for printing
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close print studio"
            onClick={onClose}
            className="p-2 hover:bg-black/5"
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>

        {loadError ? (
          <div role="alert" className="m-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-4 text-sm text-[#8e211d]">
            {loadError}
          </div>
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 p-8 text-[#55534d]">
            <LoaderCircle className="animate-spin" size={20} aria-hidden="true" />
            Loading order images…
          </div>
        ) : (
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.15fr)]">
            <div className="space-y-5">
              <section className="border border-[#c9c7c0] bg-white p-4">
                <h3 className="font-black">Sheet & layout</h3>
                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-[#68665f]">
                  Layout preset
                  <select
                    value={layoutMode}
                    onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}
                    className="mt-2 block w-full border border-[#aaa79f] bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#171717]"
                  >
                    <option value="full">1×1 · Full page</option>
                    <option value="2-up">1×2 · 2-Up</option>
                    <option value="4-up">2×2 · 4-Up</option>
                    <option value="6-up">2×3 · 6-Up</option>
                    <option value="8-up">2×4 · 8-Up</option>
                    <option value="custom">Custom rows × columns</option>
                    <option value="passport">Passport photo · 6-up · 35×45mm</option>
                    <option value="id-card">ID card front & back · 85.6×54mm</option>
                  </select>
                </label>

                {layoutMode === "custom" && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#68665f]">
                      Rows (1–4)
                      <input
                        type="number"
                        min="1"
                        max="4"
                        value={customRows}
                        onChange={(event) =>
                          setCustomRows(Math.max(1, Math.min(4, Number(event.target.value) || 1)))
                        }
                        className="mt-1 w-full border border-[#aaa79f] px-3 py-2 text-sm text-[#171717]"
                      />
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#68665f]">
                      Columns (1–5)
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={customColumns}
                        onChange={(event) =>
                          setCustomColumns(Math.max(1, Math.min(5, Number(event.target.value) || 1)))
                        }
                        className="mt-1 w-full border border-[#aaa79f] px-3 py-2 text-sm text-[#171717]"
                      />
                    </label>
                  </div>
                )}

                {layoutMode === "id-card" && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#68665f]">
                      Front image
                      <select
                        value={frontId}
                        onChange={(event) => setFrontId(event.target.value)}
                        className="mt-1 block w-full border border-[#aaa79f] bg-white px-2 py-2 text-sm font-medium normal-case tracking-normal text-[#171717]"
                      >
                        {layoutImages.map((image) => (
                          <option key={image.id} value={image.id}>
                            {image.file.fileName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#68665f]">
                      Back image
                      <select
                        value={backId}
                        onChange={(event) => setBackId(event.target.value)}
                        className="mt-1 block w-full border border-[#aaa79f] bg-white px-2 py-2 text-sm font-medium normal-case tracking-normal text-[#171717]"
                      >
                        {layoutImages.map((image) => (
                          <option key={image.id} value={image.id}>
                            {image.file.fileName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {layoutMode === "passport" && (
                  <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-[#68665f]">
                    Passport photo
                    <select
                      value={passportImageId}
                      onChange={(event) => setPassportImageId(event.target.value)}
                      className="mt-1 block w-full border border-[#aaa79f] bg-white px-2 py-2 text-sm font-medium normal-case tracking-normal text-[#171717]"
                    >
                      {layoutImages.map((image) => (
                        <option key={image.id} value={image.id}>
                          {image.file.fileName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#68665f]">
                    Orientation
                    <select
                      value={orientation}
                      onChange={(event) =>
                        setOrientation(event.target.value as Orientation)
                      }
                      className="mt-1 block w-full border border-[#aaa79f] bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#171717]"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#68665f]">
                    Cell spacing · {spacingMm}mm
                    <input
                      type="range"
                      min="0"
                      max="15"
                      value={spacingMm}
                      onChange={(event) => setSpacingMm(Number(event.target.value))}
                      className="mt-3 block w-full accent-[#e6322b]"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showCutLines}
                      onChange={(event) => setShowCutLines(event.target.checked)}
                      className="accent-[#e6322b]"
                    />
                    Show cut lines
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={inkSaver}
                      onChange={(event) => setInkSaver(event.target.checked)}
                      className="accent-[#e6322b]"
                    />
                    Document clean-up · ink-saver
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-[#68665f]">
                  {pageCount} A4 {pageCount === 1 ? "page" : "pages"} · Drag a placed image
                  to reposition it inside its cell.
                </p>
              </section>

              {layoutMode === "id-card" && (
                <p className="border-l-4 border-[#e6322b] bg-white p-3 text-xs leading-5 text-[#55534d]">
                  Front and back are centered on one sheet at 85.6 × 54mm, with a 10mm
                  vertical gap. You may choose the same image for both sides.
                </p>
              )}

              <section className="space-y-3">
                <h3 className="font-black">Image controls</h3>
                {layoutImages.map((image) => {
                  const crop = image.crop;
                  const cropVisible = cropEditId === image.id;
                  return (
                    <article
                      key={image.id}
                      className="grid gap-3 border border-[#c9c7c0] bg-white p-3 sm:grid-cols-[128px_1fr]"
                    >
                      <div
                        className="relative mx-auto w-full max-w-32 touch-none overflow-hidden border border-[#d8d6cf] bg-[#e8e7e2]"
                        onPointerMove={(event) => updateCropFromPointer(event, image.id)}
                        onPointerUp={() => {
                          cropDrag.current = null;
                        }}
                        onPointerCancel={() => {
                          cropDrag.current = null;
                        }}
                      >
                        <img
                          src={image.url}
                          alt={`Crop preview for ${image.file.fileName}`}
                          className="block h-auto w-full select-none"
                          draggable={false}
                        />
                        {cropVisible && (
                          <div
                            className="absolute border-2 border-[#e6322b]"
                            style={{
                              left: `${crop.left * 100}%`,
                              top: `${crop.top * 100}%`,
                              width: `${(crop.right - crop.left) * 100}%`,
                              height: `${(crop.bottom - crop.top) * 100}%`,
                            }}
                          >
                            {(
                              [
                                ["top-left", "left-0 top-0"],
                                ["top-right", "right-0 top-0"],
                                ["bottom-left", "left-0 bottom-0"],
                                ["bottom-right", "right-0 bottom-0"],
                              ] as const
                            ).map(([corner, position]) => (
                              <button
                                key={corner}
                                type="button"
                                aria-label={`${corner.replace("-", " ")} crop handle`}
                                onPointerDown={(event) =>
                                  handleCropPointerDown(event, image.id, corner)
                                }
                                className={`absolute ${position} h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#e6322b]`}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="break-all text-sm font-bold">{image.file.fileName}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void autoCrop(image)}
                            className="border border-[#171717] px-2.5 py-1.5 text-xs font-bold hover:bg-black/5"
                          >
                            Auto-Crop & Straighten ID
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (cropTimer.current !== null) {
                                window.clearTimeout(cropTimer.current);
                                cropTimer.current = null;
                              }
                              setCropEditId(cropVisible ? null : image.id);
                            }}
                            className="border border-[#aaa79f] px-2.5 py-1.5 text-xs font-bold hover:bg-black/5"
                          >
                            {cropVisible ? "Done adjusting" : "Adjust crop"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateImage(image.id, {
                                rotation: (image.rotation + 90) % 360,
                              })
                            }
                            className="inline-flex items-center gap-1 border border-[#aaa79f] px-2.5 py-1.5 text-xs font-bold hover:bg-black/5"
                          >
                            <RotateCw size={13} aria-hidden="true" /> Rotate 90°
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-[11px] font-bold uppercase tracking-wide text-[#68665f]">
                            Width · mm
                            <input
                              type="number"
                              min="1"
                              max="210"
                              step="0.5"
                              value={image.widthMm}
                              onChange={(event) =>
                                updateImage(image.id, { widthMm: event.target.value })
                              }
                              placeholder="Auto"
                              className="mt-1 w-full border border-[#aaa79f] px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-[#171717]"
                            />
                          </label>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-[#68665f]">
                            Height · mm
                            <input
                              type="number"
                              min="1"
                              max="297"
                              step="0.5"
                              value={image.heightMm}
                              onChange={(event) =>
                                updateImage(image.id, { heightMm: event.target.value })
                              }
                              placeholder="Auto"
                              className="mt-1 w-full border border-[#aaa79f] px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-[#171717]"
                            />
                          </label>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            </div>

            <section className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-black">Live A4 preview</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#68665f]">
                    {orientation} · {orientation === "portrait" ? "210 × 297" : "297 × 210"}mm
                  </span>
                  {pageCount > 1 && (
                    <label className="text-xs font-bold">
                      Preview page
                      <select
                        value={selectedPreviewPage}
                        onChange={(event) => setPreviewPage(Number(event.target.value))}
                        className="ml-2 border border-[#aaa79f] bg-white px-2 py-1 text-sm"
                      >
                        {Array.from({ length: pageCount }, (_, index) => (
                          <option key={index} value={index}>
                            {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
              <div
                className="print-layout-print-root border border-[#c9c7c0] bg-[#deddd8] p-3 sm:p-5"
                data-orientation={orientation}
              >
                <canvas
                  ref={canvasRef}
                  aria-label={`A4 ${orientation} print preview`}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                  className={`print-layout-canvas print-layout-print-canvas mx-auto block h-auto max-h-[75vh] max-w-full touch-none bg-white shadow-lg ${orientation === "portrait" ? "aspect-[210/297]" : "aspect-[297/210]"
                    }`}
                />
              </div>

              {studioError && (
                <p role="alert" className="mt-3 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
                  {studioError}
                </p>
              )}
              {pageCount > 1 && (
                <p className="mt-3 text-xs leading-5 text-[#68665f]">
                  PDF download and print include all pages. PNG download exports the
                  selected preview page.
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void printArrangedPdf()}
                  disabled={exporting !== null}
                  className="bg-[#171717] px-3 py-3 text-sm font-bold text-white transition hover:bg-[#333] disabled:opacity-50"
                >
                  {exporting === "print" ? "Preparing print…" : "Print Arranged Sheet"}
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPdf()}
                  disabled={exporting !== null}
                  className="inline-flex items-center justify-center gap-2 border border-[#171717] bg-white px-3 py-3 text-sm font-bold transition hover:bg-black/5 disabled:opacity-50"
                >
                  <Download size={16} aria-hidden="true" />
                  {exporting === "pdf" ? "Creating PDF…" : "Download Arranged Sheet (PDF)"}
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPng()}
                  disabled={exporting !== null || previewRendering}
                  className="inline-flex items-center justify-center gap-2 border border-[#171717] bg-white px-3 py-3 text-sm font-bold transition hover:bg-black/5 disabled:opacity-50"
                >
                  <Download size={16} aria-hidden="true" />
                  {exporting === "png"
                    ? "Creating PNG…"
                    : previewRendering
                      ? "Updating preview…"
                      : "Download Arranged Sheet (PNG)"}
                </button>
              </div>
            </section>
          </div>
        )}

      </section>
    </div>
  );
}

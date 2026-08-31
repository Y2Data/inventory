"use client";

import {
  AlertTriangle,
  Camera,
  CameraOff,
  Check,
  CircleHelp,
  ImagePlus,
  Keyboard,
  Package,
  ScanLine,
  BookOpen,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { upload } from "@vercel/blob/client";

import { classifyBarcode } from "@/lib/barcode-format";
import type {
  ApiError,
  InventoryBox,
  InventoryItem,
  ItemKind,
  ItemMetadata,
} from "@/lib/types";

interface ScannerPanelProps {
  boxes: InventoryBox[];
  activeBoxId: string;
  onActiveBoxChange: (boxId: string) => void;
  onItemAdded: (item: InventoryItem) => void;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

interface DuplicateCandidate {
  barcode: string;
  metadata: ItemMetadata;
  existingCount: number;
}

interface ProductCandidate {
  barcode: string;
  title: string;
  brand: string;
  category: string;
  coverUrl: string;
}

interface UnmatchedCandidate {
  barcode: string;
  kind: ItemKind;
  title: string;
  authors: string;
  brand: string;
  publisher: string;
  category: string;
  imageUrl: string;
}

const KIND_LABEL: Record<ItemKind, string> = {
  book: "书籍",
  product: "物品",
  unidentified: "待识别",
};

function KindIcon({ kind, size }: { kind: ItemKind; size: number }) {
  if (kind === "book") return <BookOpen size={size} />;
  if (kind === "product") return <Package size={size} />;
  return <CircleHelp size={size} />;
}

export function ScannerPanel({
  boxes,
  activeBoxId,
  onActiveBoxChange,
  onItemAdded,
  onNotice,
}: ScannerPanelProps) {
  const openBoxes = boxes.filter((box) => box.status === "open");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef({ code: "", at: 0 });
  const activeBoxRef = useRef(activeBoxId);
  const boxesRef = useRef(boxes);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [lastAdded, setLastAdded] = useState<InventoryItem | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null);
  const [productCandidate, setProductCandidate] = useState<ProductCandidate | null>(null);
  const [unmatchedCandidate, setUnmatchedCandidate] = useState<UnmatchedCandidate | null>(null);

  useEffect(() => {
    activeBoxRef.current = activeBoxId;
  }, [activeBoxId]);

  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);

  const addItem = useCallback(
    async (
      barcode: string,
      options: {
        allowDuplicate?: boolean;
        expectedKind?: ItemKind;
        manualMetadata?: {
          title: string;
          authors: string[];
          brand: string;
          publisher: string;
          publishedDate: string;
          coverUrl: string;
          language: string;
          category: string;
        };
        imageUrl?: string;
      } = {},
    ) => {
      const boxId = activeBoxRef.current;
      if (!boxId) {
        onNotice("先选择一个打开的箱子", "error");
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      setProcessing(true);
      try {
        const response = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode,
            boxId,
            allowDuplicate: options.allowDuplicate,
            manualMetadata: options.manualMetadata,
            imageUrl: options.imageUrl,
          }),
        });
        const payload = (await response.json()) as
          | { item: InventoryItem }
          | ApiError;

        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (response.status === 409 && "error" in payload && payload.error === "duplicate") {
          setScanning(false);
          setDuplicate({
            barcode,
            metadata: payload.metadata as ItemMetadata,
            existingCount: payload.existingCount ?? 1,
          });
          return;
        }
        if (response.status === 422) {
          setScanning(false);
          setUnmatchedCandidate({
            barcode,
            kind: options.expectedKind ?? "unidentified",
            title: "",
            authors: "",
            brand: "",
            publisher: "",
            category: "",
            imageUrl: "",
          });
          return;
        }
        if (!response.ok || !("item" in payload)) {
          onNotice(
            "message" in payload && payload.message ? payload.message : "添加失败",
            "error",
          );
          return;
        }

        setDuplicate(null);
        setProductCandidate(null);
        setUnmatchedCandidate(null);
        setManualBarcode("");
        setLastAdded(payload.item);
        onItemAdded(payload.item);
        navigator.vibrate?.(80);
        onNotice(`已加入：${payload.item.title || "待识别的物品"}`, "success");
      } catch {
        onNotice("网络连接失败，请再试一次", "error");
      } finally {
        busyRef.current = false;
        setProcessing(false);
      }
    },
    [
      onItemAdded,
      onNotice,
      setDuplicate,
      setLastAdded,
      setManualBarcode,
      setProcessing,
      setProductCandidate,
      setScanning,
      setUnmatchedCandidate,
    ],
  );

  const previewProduct = useCallback(
    async (barcode: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setProcessing(true);
      try {
        const response = await fetch(`/api/barcode?code=${encodeURIComponent(barcode)}`);
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        setScanning(false);
        const payload = (await response.json()) as
          | { kind: string; metadata: ItemMetadata }
          | ApiError;
        if (response.ok && "kind" in payload) {
          setProductCandidate({
            barcode,
            title: payload.metadata.title,
            brand: payload.metadata.brand,
            category: payload.metadata.category,
            coverUrl: payload.metadata.coverUrl,
          });
        } else {
          setUnmatchedCandidate({
            barcode,
            kind: "product",
            title: "",
            authors: "",
            brand: "",
            publisher: "",
            category: "",
            imageUrl: "",
          });
        }
      } catch {
        setScanning(false);
        setUnmatchedCandidate({
          barcode,
          kind: "product",
          title: "",
          authors: "",
          brand: "",
          publisher: "",
          category: "",
          imageUrl: "",
        });
      } finally {
        busyRef.current = false;
        setProcessing(false);
      }
    },
    [setProcessing, setProductCandidate, setScanning, setUnmatchedCandidate],
  );

  const handleDecodedCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      const now = Date.now();
      if (lastCodeRef.current.code === code && now - lastCodeRef.current.at < 5_000) {
        return;
      }
      lastCodeRef.current = { code, at: now };

      if (code.toUpperCase().startsWith("DAI-BOX:")) {
        const boxCode = code.slice(8).trim().toUpperCase();
        const box = boxesRef.current.find(
          (entry) => entry.code.toUpperCase() === boxCode && entry.status === "open",
        );
        if (box) {
          onActiveBoxChange(box.id);
          onNotice(`当前箱子已切换为 ${box.code}`, "success");
        } else {
          onNotice("没有找到这个打开的箱子", "error");
        }
        return;
      }

      const { kind, normalized } = classifyBarcode(code);
      if (kind === "isbn") {
        void addItem(normalized, { expectedKind: "book" });
        return;
      }
      if (kind === "product") {
        void previewProduct(normalized);
        return;
      }

      setScanning(false);
      setUnmatchedCandidate({
        barcode: normalized,
        kind: "unidentified",
        title: "",
        authors: "",
        brand: "",
        publisher: "",
        category: "",
        imageUrl: "",
      });
    },
    [addItem, onActiveBoxChange, onNotice, previewProduct, setScanning, setUnmatchedCandidate],
  );

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 250,
      delayBetweenScanSuccess: 1_000,
    });

    setCameraError("");
    reader
      .decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current,
        (result) => {
          if (!cancelled && result) handleDecodedCode(result.getText());
        },
      )
      .then((controls) => {
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setScanning(false);
        setCameraError(
          error instanceof Error && /permission|notallowed/i.test(error.message)
            ? "请允许浏览器使用相机，然后重新打开扫码。"
            : "无法启动相机。你仍然可以手动输入条码或直接拍照。",
        );
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [handleDecodedCode, scanning]);

  function submitManualBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleDecodedCode(manualBarcode);
  }

  function openPhotoOnlyEntry() {
    setScanning(false);
    setUnmatchedCandidate({
      barcode: "",
      kind: "unidentified",
      title: "",
      authors: "",
      brand: "",
      publisher: "",
      category: "",
      imageUrl: "",
    });
  }

  function confirmProductCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productCandidate || !productCandidate.title.trim()) return;
    void addItem(productCandidate.barcode, {
      manualMetadata: {
        title: productCandidate.title.trim(),
        authors: [],
        brand: productCandidate.brand.trim(),
        publisher: "",
        publishedDate: "",
        coverUrl: productCandidate.coverUrl,
        language: "",
        category: productCandidate.category.trim(),
      },
    });
  }

  function submitUnmatchedCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unmatchedCandidate) return;
    if (!unmatchedCandidate.title.trim() && !unmatchedCandidate.imageUrl) return;
    void addItem(unmatchedCandidate.barcode, {
      manualMetadata: {
        title: unmatchedCandidate.title.trim(),
        authors: unmatchedCandidate.authors
          .split(/[;,，；]/)
          .map((value) => value.trim())
          .filter(Boolean),
        brand: unmatchedCandidate.brand.trim(),
        publisher: unmatchedCandidate.publisher.trim(),
        publishedDate: "",
        coverUrl: "",
        language: "",
        category: unmatchedCandidate.category.trim(),
      },
      imageUrl: unmatchedCandidate.imageUrl || undefined,
    });
  }

  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !unmatchedCandidate) return;
    setUploadingPhoto(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setUnmatchedCandidate((current) =>
        current ? { ...current, imageUrl: blob.url } : current,
      );
    } catch {
      onNotice("照片上传失败，请重试", "error");
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <section className="scanner-layout">
      <div className="panel scanner-main">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">QUICK CAPTURE</p>
            <h2>连续扫码入箱</h2>
          </div>
          {processing ? <span className="status-pill amber">正在识别…</span> : null}
        </div>

        <label className="field-label" htmlFor="active-box">
          当前装入的箱子
        </label>
        <select
          id="active-box"
          className="select"
          value={activeBoxId}
          onChange={(event) => onActiveBoxChange(event.target.value)}
        >
          <option value="">选择箱子…</option>
          {openBoxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.code} · {box.name || "未命名"}（{box.itemCount} 件）
            </option>
          ))}
        </select>

        <div className={`camera-frame ${scanning ? "is-live" : ""}`}>
          {scanning ? (
            <>
              <video ref={videoRef} muted playsInline aria-label="条码扫描相机" />
              <div className="scan-guide" aria-hidden="true">
                <span />
              </div>
              <button
                className="camera-stop"
                type="button"
                onClick={() => setScanning(false)}
              >
                <CameraOff size={18} /> 停止
              </button>
            </>
          ) : (
            <div className="camera-placeholder">
              <div className="scan-icon">
                <ScanLine size={38} strokeWidth={1.5} />
              </div>
              <strong>对准条码，没有条码时可以直接拍照</strong>
              <p>识别成功后会直接加入当前箱子。</p>
              <div className="button-row">
                <button
                  className="button primary"
                  type="button"
                  onClick={() => setScanning(true)}
                  disabled={!activeBoxId || processing}
                >
                  <Camera size={18} /> 打开相机
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={openPhotoOnlyEntry}
                  disabled={!activeBoxId || processing}
                >
                  <ImagePlus size={18} /> 没有条码 / 直接拍照
                </button>
              </div>
            </div>
          )}
        </div>

        {cameraError ? <p className="inline-alert error">{cameraError}</p> : null}

        <div className="manual-divider">
          <span>或手动输入</span>
        </div>
        <form className="isbn-form" onSubmit={submitManualBarcode}>
          <div className="input-with-icon">
            <Keyboard size={18} />
            <input
              inputMode="numeric"
              autoComplete="off"
              value={manualBarcode}
              onChange={(event) => setManualBarcode(event.target.value)}
              placeholder="条码 / ISBN"
              aria-label="条码"
            />
          </div>
          <button
            className="button secondary"
            type="submit"
            disabled={!manualBarcode.trim() || !activeBoxId || processing}
          >
            添加
          </button>
        </form>
      </div>

      <aside className="scanner-side">
        {duplicate ? (
          <div className="panel decision-card warning-card">
            <AlertTriangle size={25} />
            <div>
              <h3>可能重复扫描</h3>
              <p>
                库存中已有 {duplicate.existingCount} 件《{duplicate.metadata.title || "该物品"}》。
              </p>
            </div>
            <div className="button-row">
              <button
                className="button primary"
                type="button"
                onClick={() => addItem(duplicate.barcode, { allowDuplicate: true })}
              >
                仍然添加
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => setDuplicate(null)}
              >
                跳过
              </button>
            </div>
          </div>
        ) : null}

        {productCandidate ? (
          <form className="panel manual-card" onSubmit={confirmProductCandidate}>
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">FOUND · OPEN FOOD FACTS</p>
                <h3>确认物品信息</h3>
              </div>
            </div>
            <p className="muted small">条码 {productCandidate.barcode}</p>
            {productCandidate.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={productCandidate.coverUrl}
                alt=""
                style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }}
              />
            ) : null}
            <label>
              名称
              <input
                value={productCandidate.title}
                onChange={(event) =>
                  setProductCandidate({ ...productCandidate, title: event.target.value })
                }
                required
                autoFocus
              />
            </label>
            <label>
              品牌
              <input
                value={productCandidate.brand}
                onChange={(event) =>
                  setProductCandidate({ ...productCandidate, brand: event.target.value })
                }
              />
            </label>
            <label>
              分类
              <input
                value={productCandidate.category}
                onChange={(event) =>
                  setProductCandidate({ ...productCandidate, category: event.target.value })
                }
              />
            </label>
            <div className="button-row">
              <button className="button primary" type="submit" disabled={processing}>
                确认添加
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => setProductCandidate(null)}
              >
                取消
              </button>
            </div>
          </form>
        ) : null}

        {unmatchedCandidate ? (
          <form className="panel manual-card" onSubmit={submitUnmatchedCandidate}>
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">NOT FOUND</p>
                <h3>手动补充信息或拍照留存</h3>
              </div>
            </div>
            {unmatchedCandidate.barcode ? (
              <p className="muted small">条码 {unmatchedCandidate.barcode}</p>
            ) : (
              <p className="muted small">没有条码</p>
            )}

            {unmatchedCandidate.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={unmatchedCandidate.imageUrl}
                alt=""
                style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8 }}
              />
            ) : null}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handlePhotoSelected}
            />
            <button
              className="button secondary"
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              <ImagePlus size={18} />
              {uploadingPhoto
                ? "上传中…"
                : unmatchedCandidate.imageUrl
                  ? "更换照片"
                  : "拍照 / 选择照片"}
            </button>

            <label>
              名称
              <input
                value={unmatchedCandidate.title}
                onChange={(event) =>
                  setUnmatchedCandidate({ ...unmatchedCandidate, title: event.target.value })
                }
                autoFocus
              />
            </label>
            {unmatchedCandidate.kind === "book" ? (
              <>
                <label>
                  作者（多人用逗号分隔）
                  <input
                    value={unmatchedCandidate.authors}
                    onChange={(event) =>
                      setUnmatchedCandidate({ ...unmatchedCandidate, authors: event.target.value })
                    }
                  />
                </label>
                <label>
                  出版社
                  <input
                    value={unmatchedCandidate.publisher}
                    onChange={(event) =>
                      setUnmatchedCandidate({ ...unmatchedCandidate, publisher: event.target.value })
                    }
                  />
                </label>
              </>
            ) : (
              <label>
                品牌
                <input
                  value={unmatchedCandidate.brand}
                  onChange={(event) =>
                    setUnmatchedCandidate({ ...unmatchedCandidate, brand: event.target.value })
                  }
                />
              </label>
            )}
            <label>
              分类
              <input
                value={unmatchedCandidate.category}
                onChange={(event) =>
                  setUnmatchedCandidate({ ...unmatchedCandidate, category: event.target.value })
                }
              />
            </label>
            <div className="button-row">
              <button
                className="button primary"
                type="submit"
                disabled={
                  processing ||
                  (!unmatchedCandidate.title.trim() && !unmatchedCandidate.imageUrl)
                }
              >
                保存
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => setUnmatchedCandidate(null)}
              >
                取消
              </button>
            </div>
          </form>
        ) : null}

        {lastAdded ? (
          <div className="panel last-added">
            <div className="success-icon">
              <Check size={20} />
            </div>
            <div className="book-thumb">
              {lastAdded.imageUrl || lastAdded.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lastAdded.imageUrl || lastAdded.coverUrl} alt="" />
              ) : (
                <KindIcon kind={lastAdded.kind} size={24} />
              )}
            </div>
            <div>
              <p className="eyebrow">LAST ADDED · {KIND_LABEL[lastAdded.kind]}</p>
              <h3>{lastAdded.title || "待识别的物品"}</h3>
              <p className="muted small">
                {lastAdded.authors.join("、") || lastAdded.brand || "信息待补充"} ·{" "}
                {lastAdded.boxCode}
              </p>
            </div>
          </div>
        ) : (
          <div className="panel scan-tips">
            <h3>装箱顺序</h3>
            <ol>
              <li><span>1</span>先确认当前箱号</li>
              <li><span>2</span>扫码成功后再放进箱子</li>
              <li><span>3</span>装满后去“箱子”页面封箱</li>
            </ol>
          </div>
        )}
      </aside>
    </section>
  );
}

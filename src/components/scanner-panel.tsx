"use client";

import {
  AlertTriangle,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  Keyboard,
  ScanLine,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

import type {
  ApiError,
  BookMetadata,
  InventoryBox,
  InventoryItem,
} from "@/lib/types";

interface ScannerPanelProps {
  boxes: InventoryBox[];
  activeBoxId: string;
  onActiveBoxChange: (boxId: string) => void;
  onItemAdded: (item: InventoryItem) => void;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

interface DuplicateCandidate {
  isbn: string;
  metadata: BookMetadata;
  existingCount: number;
}

interface ManualCandidate {
  isbn: string;
  title: string;
  authors: string;
  publisher: string;
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
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualIsbn, setManualIsbn] = useState("");
  const [lastAdded, setLastAdded] = useState<InventoryItem | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null);
  const [manualCandidate, setManualCandidate] = useState<ManualCandidate | null>(null);

  useEffect(() => {
    activeBoxRef.current = activeBoxId;
  }, [activeBoxId]);

  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);

  const addBook = useCallback(
    async (
      isbn: string,
      options: {
        allowDuplicate?: boolean;
        manualMetadata?: {
          title: string;
          authors: string[];
          publisher: string;
          publishedDate: string;
          coverUrl: string;
          language: string;
        };
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
            barcode: isbn,
            boxId,
            allowDuplicate: options.allowDuplicate,
            manualMetadata: options.manualMetadata,
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
            isbn,
            metadata: payload.metadata as BookMetadata,
            existingCount: payload.existingCount ?? 1,
          });
          return;
        }
        if (response.status === 422) {
          setScanning(false);
          setManualCandidate({ isbn, title: "", authors: "", publisher: "" });
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
        setManualCandidate(null);
        setManualIsbn("");
        setLastAdded(payload.item);
        onItemAdded(payload.item);
        navigator.vibrate?.(80);
        onNotice(`已加入：${payload.item.title}`, "success");
      } catch {
        onNotice("网络连接失败，请再扫一次", "error");
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
      setManualCandidate,
      setManualIsbn,
      setProcessing,
      setScanning,
    ],
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

      const isbn = code.replace(/[^0-9Xx]/g, "").toUpperCase();
      if (!((isbn.length === 13 && /^(978|979)/.test(isbn)) || isbn.length === 10)) {
        onNotice("扫到的不是 ISBN，请对准书背上方条码", "error");
        return;
      }
      void addBook(isbn);
    },
    [addBook, onActiveBoxChange, onNotice],
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
            : "无法启动相机。你仍然可以手动输入 ISBN。",
        );
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [handleDecodedCode, scanning]);

  function submitManualIsbn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleDecodedCode(manualIsbn);
  }

  function submitManualMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualCandidate?.title.trim()) return;
    void addBook(manualCandidate.isbn, {
      manualMetadata: {
        title: manualCandidate.title.trim(),
        authors: manualCandidate.authors
          .split(/[;,，；]/)
          .map((value) => value.trim())
          .filter(Boolean),
        publisher: manualCandidate.publisher.trim(),
        publishedDate: "",
        coverUrl: "",
        language: "",
      },
    });
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
              {box.code} · {box.name || "未命名"}（{box.itemCount} 本）
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
              <strong>对准书背上方的 ISBN 条码</strong>
              <p>识别成功后会直接加入当前箱子。</p>
              <button
                className="button primary"
                type="button"
                onClick={() => setScanning(true)}
                disabled={!activeBoxId || processing}
              >
                <Camera size={18} /> 打开相机
              </button>
            </div>
          )}
        </div>

        {cameraError ? <p className="inline-alert error">{cameraError}</p> : null}

        <div className="manual-divider">
          <span>或手动输入</span>
        </div>
        <form className="isbn-form" onSubmit={submitManualIsbn}>
          <div className="input-with-icon">
            <Keyboard size={18} />
            <input
              inputMode="numeric"
              autoComplete="off"
              value={manualIsbn}
              onChange={(event) => setManualIsbn(event.target.value)}
              placeholder="978… / ISBN-10"
              aria-label="ISBN"
            />
          </div>
          <button
            className="button secondary"
            type="submit"
            disabled={!manualIsbn.trim() || !activeBoxId || processing}
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
                库存中已有 {duplicate.existingCount} 本《{duplicate.metadata.title}》。
              </p>
            </div>
            <div className="button-row">
              <button
                className="button primary"
                type="button"
                onClick={() => addBook(duplicate.isbn, { allowDuplicate: true })}
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

        {manualCandidate ? (
          <form className="panel manual-card" onSubmit={submitManualMetadata}>
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">NOT FOUND</p>
                <h3>手动补充书名</h3>
              </div>
            </div>
            <p className="muted small">ISBN {manualCandidate.isbn}</p>
            <label>
              书名
              <input
                value={manualCandidate.title}
                onChange={(event) =>
                  setManualCandidate({ ...manualCandidate, title: event.target.value })
                }
                required
                autoFocus
              />
            </label>
            <label>
              作者（多人用逗号分隔）
              <input
                value={manualCandidate.authors}
                onChange={(event) =>
                  setManualCandidate({ ...manualCandidate, authors: event.target.value })
                }
              />
            </label>
            <label>
              出版社
              <input
                value={manualCandidate.publisher}
                onChange={(event) =>
                  setManualCandidate({ ...manualCandidate, publisher: event.target.value })
                }
              />
            </label>
            <div className="button-row">
              <button className="button primary" type="submit" disabled={processing}>
                保存
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => setManualCandidate(null)}
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
              {lastAdded.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lastAdded.coverUrl} alt="" />
              ) : (
                <BookOpen size={24} />
              )}
            </div>
            <div>
              <p className="eyebrow">LAST ADDED</p>
              <h3>{lastAdded.title}</h3>
              <p className="muted small">
                {lastAdded.authors.join("、") || "作者未知"} · {lastAdded.boxCode}
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

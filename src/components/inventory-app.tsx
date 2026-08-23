"use client";

import {
  Archive,
  ArrowRight,
  BookOpen,
  Box,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  Home,
  Library,
  LoaderCircle,
  Lock,
  LogOut,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  PackageOpen,
  Plus,
  Printer,
  ScanLine,
  Search,
  Trash2,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ScannerPanel } from "@/components/scanner-panel";
import type {
  ApiError,
  InventoryBox,
  InventoryItem,
  InventorySummary,
} from "@/lib/types";

type Tab = "overview" | "scan" | "inventory" | "boxes";

const EMPTY_SUMMARY: InventorySummary = {
  totalItems: 0,
  totalBoxes: 0,
  openBoxes: 0,
  sealedBoxes: 0,
  unassignedItems: 0,
  addedToday: 0,
};

const NAV_ITEMS: Array<{
  id: Tab;
  label: string;
  icon: typeof Home;
}> = [
  { id: "overview", label: "总览", icon: Home },
  { id: "scan", label: "扫码", icon: ScanLine },
  { id: "inventory", label: "书库", icon: Library },
  { id: "boxes", label: "箱子", icon: Boxes },
];

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | ApiError;
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("请重新登录");
  }
  if (!response.ok) {
    throw new Error(
      "message" in (payload as ApiError)
        ? (payload as ApiError).message || "请求失败"
        : "请求失败",
    );
  }
  return payload as T;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

export function InventoryApp() {
  const [tab, setTab] = useState<Tab>("overview");
  const [boxes, setBoxes] = useState<InventoryBox[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>(EMPTY_SUMMARY);
  const [activeBoxId, setActiveBoxIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [createBoxOpen, setCreateBoxOpen] = useState(false);
  const [boxForm, setBoxForm] = useState({ code: "", name: "", location: "" });
  const [savingBox, setSavingBox] = useState(false);
  const [query, setQuery] = useState("");
  const [boxFilter, setBoxFilter] = useState("");
  const [rowMenu, setRowMenu] = useState<string | null>(null);

  const activeBox = boxes.find((box) => box.id === activeBoxId) ?? null;

  const showNotice = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      setNotice({ message, tone });
      window.setTimeout(() => {
        setNotice((current) => (current?.message === message ? null : current));
      }, 3_500);
    },
    [],
  );

  const loadAll = useCallback(async () => {
    setLoadError("");
    try {
      const [boxResponse, itemResponse, summaryResponse] = await Promise.all([
        fetch("/api/boxes", { cache: "no-store" }),
        fetch("/api/items?limit=500", { cache: "no-store" }),
        fetch("/api/summary", { cache: "no-store" }),
      ]);
      const [boxPayload, itemPayload, summaryPayload] = await Promise.all([
        readPayload<{ boxes: InventoryBox[] }>(boxResponse),
        readPayload<{ items: InventoryItem[] }>(itemResponse),
        readPayload<{ summary: InventorySummary }>(summaryResponse),
      ]);
      setBoxes(boxPayload.boxes);
      setItems(itemPayload.items);
      setSummary(summaryPayload.summary);

      setActiveBoxIdState((current) => {
        const stillOpen = boxPayload.boxes.some(
          (box) => box.id === current && box.status === "open",
        );
        if (stillOpen) return current;
        const saved = window.localStorage.getItem("dai-inventory-active-box") ?? "";
        const savedOpen = boxPayload.boxes.some(
          (box) => box.id === saved && box.status === "open",
        );
        return savedOpen
          ? saved
          : (boxPayload.boxes.find((box) => box.status === "open")?.id ?? "");
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取库存");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  function setActiveBoxId(boxId: string) {
    setActiveBoxIdState(boxId);
    if (boxId) window.localStorage.setItem("dai-inventory-active-box", boxId);
    else window.localStorage.removeItem("dai-inventory-active-box");
  }

  function openCreateBox() {
    const nextNumber =
      boxes.reduce((max, box) => {
        const match = box.code.match(/(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
    setBoxForm({
      code: `BOOK-${String(nextNumber).padStart(3, "0")}`,
      name: "",
      location: "",
    });
    setCreateBoxOpen(true);
  }

  async function createBox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBox(true);
    try {
      const response = await fetch("/api/boxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(boxForm),
      });
      const payload = await readPayload<{ box: InventoryBox }>(response);
      setBoxes((current) => [payload.box, ...current]);
      setSummary((current) => ({
        ...current,
        totalBoxes: current.totalBoxes + 1,
        openBoxes: current.openBoxes + 1,
      }));
      setActiveBoxId(payload.box.id);
      setCreateBoxOpen(false);
      showNotice(`${payload.box.code} 已创建`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "创建失败", "error");
    } finally {
      setSavingBox(false);
    }
  }

  async function changeBoxStatus(box: InventoryBox, status: "open" | "sealed") {
    if (
      status === "sealed" &&
      !window.confirm(`确认封箱 ${box.code}？封箱后不能继续加入书籍。`)
    ) {
      return;
    }
    try {
      const response = await fetch("/api/boxes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: box.id, status }),
      });
      const payload = await readPayload<{ box: InventoryBox }>(response);
      setBoxes((current) =>
        current.map((entry) => (entry.id === payload.box.id ? payload.box : entry)),
      );
      setSummary((current) => ({
        ...current,
        openBoxes: current.openBoxes + (status === "open" ? 1 : -1),
        sealedBoxes: current.sealedBoxes + (status === "sealed" ? 1 : -1),
      }));
      if (status === "sealed" && activeBoxId === box.id) {
        setActiveBoxId("");
      }
      showNotice(status === "sealed" ? `${box.code} 已封箱` : `${box.code} 已重新打开`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "更新失败", "error");
    }
  }

  function itemAdded(item: InventoryItem) {
    setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
    setBoxes((current) =>
      current.map((box) =>
        box.id === item.boxId ? { ...box, itemCount: box.itemCount + 1 } : box,
      ),
    );
    setSummary((current) => ({
      ...current,
      totalItems: current.totalItems + 1,
      addedToday: current.addedToday + 1,
      unassignedItems: current.unassignedItems + (item.boxId ? 0 : 1),
    }));
  }

  async function moveItem(item: InventoryItem, boxId: string) {
    if ((item.boxId ?? "") === boxId) return;
    try {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, boxId: boxId || null }),
      });
      await readPayload<{ item: InventoryItem }>(response);
      await loadAll();
      showNotice("存放位置已更新");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "移动失败", "error");
    }
  }

  async function removeItem(item: InventoryItem) {
    if (!window.confirm(`从库存删除《${item.title}》？`)) return;
    try {
      const response = await fetch("/api/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      await readPayload<{ ok: true }>(response);
      await loadAll();
      showNotice("已从库存删除");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "删除失败", "error");
    }
  }

  async function printBoxLabel(box: InventoryBox) {
    try {
      const qrCode = await QRCode.toDataURL(`DAI-BOX:${box.code}`, {
        width: 560,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#121616", light: "#ffffff" },
      });
      const popup = window.open("", "box-label", "width=820,height=680");
      if (!popup) {
        showNotice("浏览器阻止了打印窗口，请允许弹窗", "error");
        return;
      }
      popup.opener = null;
      popup.document.write(`<!doctype html>
        <html lang="zh-CN"><head><title>${escapeHtml(box.code)}</title>
        <style>
          @page { size: A5 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:#121616; }
          main { min-height: 120mm; border: 4px solid #121616; border-radius: 18px; display:grid; grid-template-columns: 1fr 44mm; gap:12mm; align-items:center; padding:14mm; }
          .kicker { font-size:11pt; font-weight:800; letter-spacing:.16em; color:#66706e; }
          h1 { font-size:42pt; line-height:1; margin:7mm 0 5mm; letter-spacing:-.04em; }
          h2 { font-size:18pt; margin:0 0 8mm; font-weight:600; }
          p { font-size:12pt; margin:2mm 0; color:#4f5856; }
          img { width:44mm; height:44mm; }
          .footer { margin-top:8mm; font-size:10pt; color:#66706e; }
        </style></head><body>
        <main><section><div class="kicker">DAI INVENTORY · BOOK BOX</div>
        <h1>${escapeHtml(box.code)}</h1>
        <h2>${escapeHtml(box.name || "书籍")}</h2>
        <p>${escapeHtml(box.location || "位置待定")}</p>
        <p>${box.itemCount} 本 · ${box.status === "sealed" ? "已封箱" : "装箱中"}</p>
        <div class="footer">顶部和侧面各贴一张；在应用扫码页扫描右侧标签可切换当前箱子。</div>
        </section><img src="${qrCode}" alt="${escapeHtml(box.code)} QR"></main>
        <script>window.onload=()=>setTimeout(()=>window.print(),250);<\/script>
        </body></html>`);
      popup.document.close();
    } catch {
      showNotice("标签生成失败", "error");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesBox = !boxFilter || item.boxId === boxFilter;
      if (!matchesBox) return false;
      if (!normalizedQuery) return true;
      return [
        item.title,
        item.barcode,
        item.publisher,
        item.authors.join(" "),
        item.boxCode ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [boxFilter, items, query]);

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="brand-lockup compact-brand">
          <span className="brand-mark"><PackageOpen size={24} /></span>
          <span>DAI INVENTORY</span>
        </div>
        <LoaderCircle className="spin" size={28} />
        <p>正在打开库存…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><PackageOpen size={24} /></span>
          <div><strong>DAI</strong><span>INVENTORY</span></div>
        </div>
        <nav aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                type="button"
                onClick={() => setTab(item.id)}
              >
                <Icon size={19} /> {item.label}
                {item.id === "scan" && activeBox ? <span className="nav-dot" /> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <a href="/api/export" className="sidebar-link"><Download size={18} /> 导出 CSV</a>
          <button type="button" className="sidebar-link" onClick={logout}>
            <LogOut size={18} /> 退出
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <div className="brand-lockup compact-brand">
            <span className="brand-mark"><PackageOpen size={22} /></span>
            <span>DAI INVENTORY</span>
          </div>
          <button className="icon-button" type="button" onClick={logout} aria-label="退出">
            <LogOut size={19} />
          </button>
        </header>

        <header className="content-header">
          <div>
            <p className="eyebrow">PERSONAL CATALOG</p>
            <h1>{NAV_ITEMS.find((item) => item.id === tab)?.label}</h1>
          </div>
          <button
            type="button"
            className={`active-box-chip ${activeBox ? "selected" : ""}`}
            onClick={() => setTab("scan")}
          >
            <Box size={18} />
            <span>
              <small>当前箱子</small>
              <strong>{activeBox?.code ?? "未选择"}</strong>
            </span>
            <ChevronRight size={17} />
          </button>
        </header>

        {loadError ? (
          <div className="configuration-banner">
            <CircleAlert size={22} />
            <div><strong>数据库尚未就绪</strong><p>{loadError}</p></div>
            <button className="button secondary" type="button" onClick={() => loadAll()}>
              重试
            </button>
          </div>
        ) : null}

        <main className="content-area">
          {tab === "overview" ? (
            <Overview
              summary={summary}
              boxes={boxes}
              items={items}
              activeBox={activeBox}
              onCreateBox={openCreateBox}
              onNavigate={setTab}
              onSetActiveBox={setActiveBoxId}
            />
          ) : null}

          {tab === "scan" ? (
            <ScannerPanel
              boxes={boxes}
              activeBoxId={activeBoxId}
              onActiveBoxChange={setActiveBoxId}
              onItemAdded={itemAdded}
              onNotice={showNotice}
            />
          ) : null}

          {tab === "inventory" ? (
            <section className="inventory-section">
              <div className="toolbar">
                <div className="search-field">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索书名、作者、ISBN 或箱号"
                    aria-label="搜索库存"
                  />
                  {query ? (
                    <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
                <select
                  className="select compact-select"
                  value={boxFilter}
                  onChange={(event) => setBoxFilter(event.target.value)}
                  aria-label="按箱子筛选"
                >
                  <option value="">全部箱子</option>
                  {boxes.map((box) => (
                    <option key={box.id} value={box.id}>{box.code}</option>
                  ))}
                </select>
                <a className="button secondary export-button" href="/api/export">
                  <Download size={17} /> 导出
                </a>
              </div>
              <div className="section-summary">
                <strong>{filteredItems.length}</strong> 条记录
              </div>
              {filteredItems.length ? (
                <div className="book-list">
                  {filteredItems.map((item) => (
                    <article className="book-row" key={item.id}>
                      <div className="book-cover">
                        {item.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.coverUrl} alt="" loading="lazy" />
                        ) : (
                          <BookOpen size={25} />
                        )}
                      </div>
                      <div className="book-main">
                        <h3>{item.title}</h3>
                        <p>{item.authors.join("、") || "作者未知"}</p>
                        <div className="book-meta-mobile">
                          <span>{item.barcode}</span>
                          <span>{item.publisher || "出版社未知"}</span>
                        </div>
                      </div>
                      <div className="book-isbn">
                        <small>ISBN</small><span>{item.barcode}</span>
                      </div>
                      <div className="book-location">
                        <select
                          value={item.boxId ?? ""}
                          onChange={(event) => void moveItem(item, event.target.value)}
                          aria-label={`移动 ${item.title}`}
                        >
                          <option value="">未装箱</option>
                          {boxes.map((box) => (
                            <option
                              key={box.id}
                              value={box.id}
                              disabled={box.status !== "open" && box.id !== item.boxId}
                            >
                              {box.code}{box.status !== "open" ? "（已封）" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="row-menu-wrap">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => setRowMenu(rowMenu === item.id ? null : item.id)}
                          aria-label="更多操作"
                        >
                          <MoreHorizontal size={19} />
                        </button>
                        {rowMenu === item.id ? (
                          <div className="row-menu">
                            <button type="button" onClick={() => void removeItem(item)}>
                              <Trash2 size={16} /> 删除记录
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title="没有找到书籍"
                  body={query || boxFilter ? "换个搜索条件试试。" : "先扫描第一本书。"}
                  actionLabel={!query && !boxFilter ? "开始扫码" : undefined}
                  onAction={() => setTab("scan")}
                />
              )}
            </section>
          ) : null}

          {tab === "boxes" ? (
            <section>
              <div className="section-head">
                <div><h2>所有箱子</h2><p>封箱前确认数量，标签贴在顶部和侧面。</p></div>
                <button className="button primary" type="button" onClick={openCreateBox}>
                  <Plus size={18} /> 新建箱子
                </button>
              </div>
              {boxes.length ? (
                <div className="box-grid">
                  {boxes.map((box) => (
                    <article className={`box-card ${box.status}`} key={box.id}>
                      <div className="box-card-top">
                        <span className="box-illustration"><Box size={29} /></span>
                        <span className={`status-pill ${box.status}`}>
                          {box.status === "open" ? "装箱中" : box.status === "sealed" ? "已封箱" : "已归档"}
                        </span>
                      </div>
                      <div>
                        <p className="eyebrow">BOOK BOX</p>
                        <h3>{box.code}</h3>
                        <p className="box-name">{box.name || "未命名书箱"}</p>
                      </div>
                      <div className="box-count"><strong>{box.itemCount}</strong><span>本书</span></div>
                      <div className="box-location"><MapPin size={15} /> {box.location || "未设置位置"}</div>
                      <div className="box-actions">
                        {box.status === "open" ? (
                          <button
                            className={activeBoxId === box.id ? "button active-choice" : "button secondary"}
                            type="button"
                            onClick={() => {
                              setActiveBoxId(box.id);
                              setTab("scan");
                            }}
                          >
                            {activeBoxId === box.id ? <CheckCircle2 size={17} /> : <ScanLine size={17} />}
                            {activeBoxId === box.id ? "当前箱子" : "继续装箱"}
                          </button>
                        ) : (
                          <button className="button secondary" type="button" onClick={() => changeBoxStatus(box, "open")}>
                            <PackageOpen size={17} /> 重新打开
                          </button>
                        )}
                        <button className="button ghost icon-only" type="button" onClick={() => void printBoxLabel(box)} aria-label="打印标签">
                          <Printer size={18} />
                        </button>
                        {box.status === "open" ? (
                          <button className="button ghost icon-only" type="button" onClick={() => changeBoxStatus(box, "sealed")} aria-label="封箱">
                            <Lock size={18} />
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Boxes} title="还没有箱子" body="先建立 BOOK-001，然后开始扫码装箱。" actionLabel="建立第一个箱子" onAction={openCreateBox} />
              )}
            </section>
          ) : null}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="移动端导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => setTab(item.id)}>
              <Icon size={20} /><span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {createBoxOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreateBoxOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-box-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><p className="eyebrow">NEW CONTAINER</p><h2 id="new-box-title">新建书箱</h2></div>
              <button className="icon-button" type="button" onClick={() => setCreateBoxOpen(false)} aria-label="关闭"><X size={20} /></button>
            </div>
            <form onSubmit={createBox} className="modal-form">
              <label>箱号<input value={boxForm.code} onChange={(event) => setBoxForm({ ...boxForm, code: event.target.value })} placeholder="BOOK-001" required autoFocus /></label>
              <label>名称（可选）<input value={boxForm.name} onChange={(event) => setBoxForm({ ...boxForm, name: event.target.value })} placeholder="技术书 / 小说 / 中文书" /></label>
              <label>存放位置（可选）<input value={boxForm.location} onChange={(event) => setBoxForm({ ...boxForm, location: event.target.value })} placeholder="储藏室 A 架" /></label>
              <div className="modal-actions">
                <button className="button ghost" type="button" onClick={() => setCreateBoxOpen(false)}>取消</button>
                <button className="button primary" type="submit" disabled={savingBox}>{savingBox ? "正在创建…" : "创建并设为当前箱子"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {notice ? (
        <div className={`toast ${notice.tone}`} role="status">
          {notice.tone === "success" ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}
          {notice.message}
        </div>
      ) : null}
    </div>
  );
}

function Overview({
  summary,
  boxes,
  items,
  activeBox,
  onCreateBox,
  onNavigate,
  onSetActiveBox,
}: {
  summary: InventorySummary;
  boxes: InventoryBox[];
  items: InventoryItem[];
  activeBox: InventoryBox | null;
  onCreateBox: () => void;
  onNavigate: (tab: Tab) => void;
  onSetActiveBox: (boxId: string) => void;
}) {
  const openBoxes = boxes.filter((box) => box.status === "open");
  return (
    <section className="overview-grid">
      <div className="next-action-card">
        <div className="next-action-copy">
          <p className="eyebrow light">NEXT ACTION</p>
          {boxes.length === 0 ? (
            <><h2>先建立第一个书箱</h2><p>箱号从 BOOK-001 开始。创建后就能连续扫码。</p><button className="button light-button" type="button" onClick={onCreateBox}><Plus size={18} /> 建立箱子</button></>
          ) : activeBox ? (
            <><h2>继续装入 {activeBox.code}</h2><p>{activeBox.name || "当前书箱"}已经有 {activeBox.itemCount} 本。拿起下一本，扫码后再放进去。</p><button className="button light-button" type="button" onClick={() => onNavigate("scan")}><ScanLine size={18} /> 开始扫码 <ArrowRight size={17} /></button></>
          ) : (
            <><h2>选择一个打开的箱子</h2><p>当前没有活动箱子，选择后才能扫码加入。</p><button className="button light-button" type="button" onClick={() => onNavigate("boxes")}><Boxes size={18} /> 选择箱子</button></>
          )}
        </div>
        <div className="hero-box" aria-hidden="true"><Box size={105} strokeWidth={1.05} /><span>{activeBox?.code ?? "BOOK"}</span></div>
      </div>

      <div className="stat-grid">
        <StatCard icon={BookOpen} label="书籍总数" value={summary.totalItems} detail={`今天 +${summary.addedToday}`} />
        <StatCard icon={Boxes} label="全部箱子" value={summary.totalBoxes} detail={`${summary.openBoxes} 个装箱中`} />
        <StatCard icon={PackageCheck} label="已封箱" value={summary.sealedBoxes} detail="位置已锁定" />
        <StatCard icon={Archive} label="未装箱" value={summary.unassignedItems} detail={summary.unassignedItems ? "需要整理" : "全部归位"} warning={summary.unassignedItems > 0} />
      </div>

      <div className="panel recent-panel">
        <div className="panel-heading"><div><p className="eyebrow">RECENTLY ADDED</p><h2>最近录入</h2></div><button className="text-button" type="button" onClick={() => onNavigate("inventory")}>查看全部 <ChevronRight size={16} /></button></div>
        {items.length ? (
          <div className="recent-list">
            {items.slice(0, 5).map((item) => (
              <div className="recent-row" key={item.id}>
                <div className="mini-cover">{item.coverUrl ? (// eslint-disable-next-line @next/next/no-img-element
                  <img src={item.coverUrl} alt="" />) : <BookOpen size={19} />}</div>
                <div><strong>{item.title}</strong><span>{item.authors.join("、") || item.publisher || "信息待补充"}</span></div>
                <span className="location-tag">{item.boxCode ?? "未装箱"}</span>
                <time>{dateLabel(item.createdAt)}</time>
              </div>
            ))}
          </div>
        ) : <div className="mini-empty"><BookOpen size={28} /><p>录入第一本书后，它会出现在这里。</p></div>}
      </div>

      <div className="panel open-boxes-panel">
        <div className="panel-heading"><div><p className="eyebrow">OPEN BOXES</p><h2>装箱中的箱子</h2></div><button className="icon-button" type="button" onClick={onCreateBox} aria-label="新建箱子"><Plus size={19} /></button></div>
        {openBoxes.length ? (
          <div className="open-box-list">{openBoxes.slice(0, 4).map((box) => (
            <button key={box.id} type="button" className={activeBox?.id === box.id ? "active" : ""} onClick={() => { onSetActiveBox(box.id); onNavigate("scan"); }}>
              <span className="small-box-icon"><Box size={20} /></span><span><strong>{box.code}</strong><small>{box.name || "未命名"}</small></span><b>{box.itemCount}</b><ChevronRight size={16} />
            </button>
          ))}</div>
        ) : <div className="mini-empty"><Lock size={26} /><p>没有正在装箱的箱子。</p></div>}
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, detail, warning = false }: { icon: typeof Home; label: string; value: number; detail: string; warning?: boolean }) {
  return <article className={`stat-card ${warning ? "warning" : ""}`}><span className="stat-icon"><Icon size={20} /></span><div><p>{label}</p><strong>{value.toLocaleString()}</strong><span>{detail}</span></div></article>;
}

function EmptyState({ icon: Icon, title, body, actionLabel, onAction }: { icon: typeof Home; title: string; body: string; actionLabel?: string; onAction: () => void }) {
  return <div className="empty-state"><span><Icon size={34} /></span><h3>{title}</h3><p>{body}</p>{actionLabel ? <button className="button primary" type="button" onClick={onAction}>{actionLabel}</button> : null}</div>;
}

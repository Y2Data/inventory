# Dai Inventory

面向手机使用的私人物品与纸箱库存系统。扫描条码后，系统会自动判断是图书 ISBN 还是通用商品条码：图书依次查找 openBD、Google Books、Open Library，商品查找 Open Food Facts；查不到时可以手动补充信息，或者直接拍照留存，之后再补充。每一件实体物品都会记录到指定箱子。

## 已实现

- ISBN-10 / ISBN-13 及 UPC/EAN 通用商品条码相机连续扫描与手动输入
- 图书优先 openBD（日文书），其他图书回退 Google Books / Open Library；商品查 Open Food Facts
- 查不到条码信息时可手动补充名称/品牌/分类，或直接拍照留存（Vercel Blob），留作以后识别
- 重复条码拦截，可确认后录入第二件实体副本
- 物品支持编辑：为拍照留存的物品补充名称，或修正查到的商品信息
- 箱子与物品都可打上可选分类标签，仅用于筛选，不限制箱内混装
- 纸箱创建、当前箱子选择、封箱、重新打开、位置与数量管理
- 箱子 QR 标签生成与打印；扫码标签可切换当前箱子
- 名称、作者/品牌、条码、出版社、分类与箱号搜索；按分类和"待识别"筛选
- 在不同箱子之间移动物品、删除错误记录
- UTF-8 BOM CSV 导出
- 单用户密码登录、签名会话 Cookie、同源写入检查
- Neon Postgres 自动建表（含增量字段迁移）与事件审计记录
- 响应式桌面 / iPhone 界面和 PWA manifest

## 技术架构

- Next.js 16 App Router
- React 19 + TypeScript
- Vercel Functions
- Neon Postgres (`DATABASE_URL`)
- Vercel Blob (`BLOB_READ_WRITE_TOKEN`)：存放拍照留存的物品照片
- `@zxing/browser` 条码 / QR 扫描
- `jose` 签名会话

数据库仅由服务端访问。浏览器中不会出现数据库连接串、库存密码或会话签名密钥。

## 环境变量

复制 `.env.example` 为 `.env.local` 并填写：

```bash
DATABASE_URL=postgresql://...
INVENTORY_PASSWORD=至少12位的随机密码
SESSION_SECRET=至少32位的随机字符串
BLOB_READ_WRITE_TOKEN=...
```

生成会话密钥：

```bash
openssl rand -base64 32
```

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。首次访问数据库时会自动建立 `inventory_boxes`、`inventory_items` 与 `inventory_events` 表。

## 质量检查

```bash
npm run lint
npm run build
```

## Vercel + Neon

1. 在 Vercel 创建并连接该 Next.js 项目。
2. 通过 Vercel Marketplace 安装 Neon，并连接到该项目。集成会注入 `DATABASE_URL`。
3. 创建一个 Vercel Blob store 并连接到该项目，注入 `BLOB_READ_WRITE_TOKEN`。
4. 在 Production、Preview、Development 环境配置 `INVENTORY_PASSWORD` 和 `SESSION_SECRET`。
5. 部署后访问 `/api/health`，返回 `{“ok”:true,”database”:”connected”}` 表示数据库建表成功。
6. 登录后先创建第一个箱子，再进入”扫码”页面开始装箱。

## 主要数据表

- `inventory_boxes`: 箱号、名称、位置、分类标签、状态、封箱时间
- `inventory_items`: 每一件实体物品的条码、类型（书籍/物品/待识别）、名称等元数据、照片、分类标签、箱子外键和备注
- `inventory_events`: 创建、移动、封箱与删除的审计记录

同一条码可以对应多条库存记录，以支持实体副本；默认会先提示重复，防止连续扫描时误录。没有条码、或条码查不到信息的物品可以先拍照留存，之后再编辑补充名称。

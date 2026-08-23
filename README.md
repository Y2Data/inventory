# Dai Inventory

面向手机使用的私人书籍与纸箱库存系统。扫描 ISBN 后，系统会从 openBD、Google Books 和 Open Library 依次查找书名、作者、出版社与封面，并将实体书记录到指定箱子。

## 已实现

- ISBN-10 / ISBN-13 相机连续扫描与手动输入
- 日本书籍优先使用 openBD，其他书籍回退到 Google Books / Open Library
- 重复 ISBN 拦截，可确认后录入第二本实体副本
- 无元数据时手动补充书名、作者与出版社
- 纸箱创建、当前箱子选择、封箱、重新打开、位置与数量管理
- 箱子 QR 标签生成与打印；扫码标签可切换当前箱子
- 书名、作者、ISBN、出版社与箱号搜索
- 在不同箱子之间移动书籍、删除错误记录
- UTF-8 BOM CSV 导出
- 单用户密码登录、签名会话 Cookie、同源写入检查
- Neon Postgres 自动建表与事件审计记录
- 响应式桌面 / iPhone 界面和 PWA manifest

## 技术架构

- Next.js 16 App Router
- React 19 + TypeScript
- Vercel Functions
- Neon Postgres (`DATABASE_URL`)
- `@zxing/browser` 条码 / QR 扫描
- `jose` 签名会话

数据库仅由服务端访问。浏览器中不会出现数据库连接串、库存密码或会话签名密钥。

## 环境变量

复制 `.env.example` 为 `.env.local` 并填写：

```bash
DATABASE_URL=postgresql://...
INVENTORY_PASSWORD=至少12位的随机密码
SESSION_SECRET=至少32位的随机字符串
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
3. 在 Production、Preview、Development 环境配置 `INVENTORY_PASSWORD` 和 `SESSION_SECRET`。
4. 部署后访问 `/api/health`，返回 `{"ok":true,"database":"connected"}` 表示数据库建表成功。
5. 登录后先创建 `BOOK-001`，再进入“扫码”页面开始装箱。

## 主要数据表

- `inventory_boxes`: 箱号、名称、位置、状态、封箱时间
- `inventory_items`: 每一本实体书的 ISBN、书目信息、箱子外键和备注
- `inventory_events`: 创建、移动、封箱与删除的审计记录

同一 ISBN 可以对应多条库存记录，以支持实体副本；默认会先提示重复，防止连续扫描时误录。

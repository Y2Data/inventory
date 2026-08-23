# Dai Inventory — Codex Execution Plan

## 交付目标

建立并部署一个私人库存系统：手机扫描书籍 ISBN，将每一本实体书记录到 Vercel 连接的 Postgres 数据库，并明确其纸箱位置。

## 执行状态

- [x] 确认 Vercel 当前数据库方案：Marketplace Neon Postgres
- [x] 建立 Next.js 16 / TypeScript 项目
- [x] 设计可扩展的箱子、书籍和事件审计模型
- [x] 实现数据库自动初始化和 Neon serverless driver
- [x] 实现密码认证、签名 Cookie 和 API 授权检查
- [x] 实现 ISBN 校验和多来源书籍元数据查询
- [x] 实现 iPhone 相机连续扫描、手动 ISBN 和手动补录
- [x] 实现重复扫描保护、实体副本确认
- [x] 实现箱子创建、封箱、重新打开、移动书籍和搜索
- [x] 实现可打印 QR 箱签与 CSV 导出
- [x] 完成桌面 / 移动响应式界面
- [x] ESLint 通过
- [x] Next.js production build 通过
- [ ] 用户完成 Vercel 安全登录授权
- [ ] 创建 `dai-inventory` Vercel 项目
- [ ] 安装并连接 Neon 数据库
- [ ] 设置生产环境密码与会话密钥
- [ ] 部署并验证 `/api/health`
- [ ] 真实创建箱子并扫入一本测试书
- [ ] 验证 iPhone 相机权限与移动端布局

## 验收标准

1. 未登录用户无法查看或修改库存。
2. 创建箱子后，可以设为当前箱子。
3. 扫描有效 ISBN 后，书籍元数据自动补全并写入对应箱子。
4. 重复扫描同一 ISBN 时先警告，明确确认后才增加第二本。
5. 搜索书名能看到箱号；移动书籍后箱子数量正确更新。
6. 封箱后不能继续加入书籍，重新打开后可以继续。
7. CSV 可用 Excel / Numbers 正确显示中文和日文。
8. 生产环境 `/api/health` 返回数据库已连接。

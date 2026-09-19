# 商用化对接指南（COMMERCIAL）

本文说明哪些能力已在本代码内实现，哪些必须在取得相应商业资质/账号后对接。
**结论先行：代码内可实现的已全部实现；涉及"真金白银出金、法律效力签名、真实身份核验"的四个外部服务，必须先取得资质再启用。**

## 一、已实现（无需外部服务即可运行）

| 能力 | 实现位置 |
| --- | --- |
| 资金流水账本（余额变动 100% 留痕，事务原子） | `server/utils/ledger.js` + `ledger` 表 |
| 充值订单（订单号、渠道、状态机） | `/api/finance/deposit/orders` + `deposit_orders` 表 |
| 兼容旧充值接口（走订单+账本） | `POST /api/auth/deposit` |
| 提现申请冻结 → 管理员打款/驳回退回 | `/api/finance/withdrawals` + admin 审核 |
| 平台佣金 + 质保金留存 + 到期自动释放（每小时检查） | `contracts.js` 结算 + `index.js` 定时任务 |
| 纠纷仲裁（可按仲裁结果退款/放款） | `/api/biz/disputes` + `/api/admin/disputes/:id/arbitrate` |
| 电子合同正文（模板生成、版本化、内容哈希） | `contracts.js` |
| 双方签署动作（登录密码确认 + IP/时间/哈希留痕） | `POST /api/contracts/:id/sign` + `contract_signatures` 表 |
| 施工日志/现场打卡(GPS)/工程照片/隐蔽工程验收/材料进场 | `/api/projects/:id/construction/*` |
| 工程量清单 BOQ（对照预算） | `/api/projects/:id/construction/boq` |
| 阶段/竣工验收（含整改退回），可配置"竣工必须验收通过" | `acceptances` + settings |
| 质保工单 | `/api/biz/warranties` |
| 发票申请与平台处理 | `/api/biz/invoices` + admin |
| 企业认证（信用代码/资质等级审核） | `/api/biz/company` + admin |
| 评价申诉与违规评价撤销 | `/api/biz/review-appeals` + admin |
| 双方沟通聊天（留痕、未读、仲裁可查） | `/api/biz/projects/:id/chat` |
| 实时通知（SSE，替代轮询） | `GET /api/notify/stream?token=` |
| 身份证 GB11643 校验位本地核验 | `server/utils/idcard.js` |
| 短信可插拔网关（通用 HTTP 接口） | `server/utils/sms.js`，配 `SMS_API_URL` 即生效 |
| 结构化访问/错误日志（JSONL 落盘 logs/） | `server/utils/logger.js` |
| 数据库在线备份（管理端手动 + CLI 定时） | `POST /api/admin/backups` + `node scripts/backup.js` |
| 对账报表 CSV 导出 | `GET /api/admin/reports/ledger.csv` |
| 用户协议/隐私政策 + 注册强制勾选 + 接受记录 | `server/legal/*.md` + `/api/biz/agreements` |
| 移动端 H5 适配 | 全局 + 各页面响应式样式 |

## 二、必须取得资质/账号后对接（代码已预留接入点）

### 1. 真实支付网关（收款出金）
- **需要**：营业执照、对公账户、微信支付/支付宝商户号。
- **接入点**：`POST /api/finance/deposit/notify`（回调验签后调用 `postLedger` 入账）；配置 `.env`：
  ```
  PAYMENT_GATEWAY=wechatpay   # 或 alipay
  PAYMENT_PAY_URL=            # 收银台地址
  ```
- mock 通道在配置网关后自动禁用确认入账。

### 2. CA 电子签章（合同法律效力）
- **需要**：与 e签宝/法大大/e签通等签约。
- **接入点**：`contracts.js` 的 `sign` 路由 —— 现有"密码签署+哈希留痕"可保留作为平台见证，再叠加跳转 CA 签署并将回执 PDF 存入 `project_files`。

### 3. 公安实名核验（二要素/三要素）
- **需要**：公安授权数据服务商资质。
- **接入点**：`server/utils/idcard.js` 校验通过后，把 `real_name + id_card` 提交服务商 API；通过后再置 `real_name_verified = 1`（当前本地校验只是格式级，不能冒充通过）。

### 4. 短信签名/模板报备
- **需要**：企业资质向三大通道商报备签名与模板。
- **接入点**：`.env` 配 `SMS_API_URL`（支持 `{phone}` `{content}` 占位符的任意 HTTP 网关），或按注释接入阿里云/腾讯云 SDK。

### 5. 经营合规
- ICP 备案（非经营性）/ 经营性 ICP 许可（EDI）：上线公网收费前必须办理。
- 等保二级测评（涉及身份与资金数据，建议办理）。
- 域名 + HTTPS 证书：参考 `deploy/nginx.conf` 反向代理样例。

## 三、数据库迁移（SQLite → MySQL/PostgreSQL）建议

当前 SQLite（better-sqlite3、WAL）单机写入即可支撑中小规模；出现以下信号时再迁移：
- 需要多实例水平扩展 / 高并发写入；
- 需要异地容灾与自动主从。

迁移路径：所有数据访问已经集中在 `server/db.js` + 各路由的参数化查询，替换驱动（如 `mysql2`）并改写少量 `?` 占位符方言即可；`ledger` 表结构可直接映射。

## 四、上线检查清单

- [ ] `.env`：更换 `JWT_SECRET`/`REFRESH_SECRET`/`ENCRYPTION_KEY` 为强随机值
- [ ] 改掉默认账号密码（admin/zhangsan/engineer1）
- [ ] 配置支付网关并验证回调验签
- [ ] 配置短信网关并报备签名
- [ ] 启用 `require_final_acceptance=1` 与 `require_both_signatures=1`（管理后台-平台设置）
- [ ] 配置 Nginx + HTTPS（见 `deploy/nginx.conf`）
- [ ] 部署机配置每日 `node scripts/backup.js` 计划任务
- [ ] 办理 ICP 备案/许可

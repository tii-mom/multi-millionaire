# Project 72H 开发计划

## 1. 当前链上前提

- 已提供 `72H` 代币合约地址：`EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8`。
- 该地址格式判断为 TON 生态地址，因此前端集成优先按 TON Jetton + TonConnect 方向规划。
- 仍需确认该地址是否为 `72H Jetton Master`，以及主网/测试网环境。

## 2. 需要新增的业务合约

已部署的 `72H` 代币合约不算新增合约。产品还需要以下业务合约。

### 2.1 必需：72HLockVault

负责用户锁仓资产，优先级最高。

- 接收用户存入的 `72H Jetton`。
- 记录用户锁仓数量、锁仓价格、目标解锁条件和状态。
- 根据管理员价格判断是否满足解锁条件。
- 支持用户解锁和提现。
- 发出存入、解锁、提现事件。
- 所有用户链上操作 gas 由用户承担。

### 2.2 推荐：AdminPriceOracle / PriceController

负责管理员价格上传，建议独立于锁仓合约。

- 管理员上传 `72H` 价格。
- 记录价格版本、上传者、上传时间和事件。
- 锁仓合约读取当前价格或指定版本价格。
- 后续可扩展多签、延迟生效、二次确认。

MVP 可先把价格上传合并进 `72HLockVault`，但正式上线建议拆出。

### 2.3 推荐：RewardDistributor

负责邀请奖励，建议独立于锁仓合约。

- 管理奖励预算。
- 记录用户可领取奖励。
- 支持用户领取奖励。
- 记录领取状态。
- 与后端风控结果配合，只允许合格奖励进入可领取状态。
- 用户领取奖励的 gas 由用户承担。

MVP 可先由后端记录奖励、管理员人工审核和批量发放；自动化阶段再接入本合约。

## 3. 不上链的模块

以下模块 MVP 阶段放后端数据库，不写合约：

- `Rush Pass`。
- `Squad`。
- `Heat`。
- 邀请点击。
- 波次倒计时。
- 海报生成记录。
- 风控审核记录。

原因：这些规则变化快，上链会增加开发复杂度、gas 成本和迭代阻力。真实资产结算仍回到锁仓合约和奖励合约。

## 4. 开发阶段

### Phase 0：链上事实确认

- 确认链：TON mainnet 还是 testnet。
- 确认 `72H` 地址是 Jetton Master。
- 提供 `72HLockVault` 合约地址或合约设计。
- 确认锁仓合约如何接收 Jetton transfer payload。
- 确认管理员价格上传走链上还是后端。

交付标准：可以写出 `src/config/contracts.ts`，包含 token、lock、chain、decimals、pricePrecision。

### Phase 1：前端基础重构

- 新增 `src/config/contracts.ts`。
- 新增核心类型：`WalletState`、`LockRecord`、`RushPass`、`Squad`、`Reward`、`PriceUpdate`。
- 移除主要页面的 `any` props。
- 保留现有 UI，不大改视觉。

交付标准：`npm run lint` 和 `npm run build` 通过。

### Phase 2：TON 钱包连接

- 接入 `@tonconnect/ui-react`。
- 在根组件配置 `TonConnectUIProvider`。
- 替换当前 mock wallet。
- 展示真实钱包地址、连接状态、网络状态。
- 增加 gas 由用户承担提示。

交付标准：用户能连接和断开 TON 钱包。

### Phase 3：72H Jetton 读取

- 获取用户 `72H` Jetton wallet 地址。
- 读取用户 `72H` 余额。
- 按 `decimals` 格式化展示。
- 没有 Jetton wallet 时展示余额为 `0`。

交付标准：页面展示真实 `72H` 余额。

### Phase 4：锁仓交易

- 根据 `72HLockVault` 接口构造 Jetton transfer 消息。
- 用户输入锁仓数量后通过 TonConnect 发起交易。
- 展示交易状态：待签名、已发送、确认中、成功、失败。
- 锁仓后刷新余额和锁仓记录。

交付标准：用户能把 `72H` 转入锁仓合约，交易可在区块浏览器验证。

### Phase 5：后端最小服务

核心数据表：

- `users`
- `wallets`
- `waves`
- `rush_passes`
- `squads`
- `squad_members`
- `referral_bindings`
- `lock_deposits`
- `price_updates`
- `rewards`
- `risk_flags`
- `admin_audit_logs`

核心 API：

- `GET /api/config`
- `POST /api/rush-pass`
- `POST /api/wallet/bind`
- `POST /api/squad`
- `POST /api/referral/bind`
- `GET /api/me/summary`
- `POST /api/admin/price`
- `GET /api/rewards`
- `POST /api/rewards/claim-intent`

交付标准：核心业务状态不再依赖 `localStorage`。

### Phase 6：管理员价格与解锁

- 管理员上传价格。
- 记录上传人、价格、时间和凭证。
- 前端展示管理员价格、更新时间和中心化提示。
- 刷新每笔锁仓的可解锁状态。
- 用户满足条件后发起解锁或提现交易。

交付标准：用户能看到锁仓是否满足解锁条件，并能执行对应链上操作。

### Phase 7：Rush Pass

- 新增 72 小时 Wave。
- 用户无需钱包领取 `Pending Rush Pass`。
- 完成钱包连接和最低有效锁仓后升级为 `Activated Rush Pass`。
- 生成个人邀请链接。
- 改造 `Share` 页面为 Rush Pass 邀请中心。

交付标准：新用户可以通过邀请链接领取 Pass 并继续传播。

### Phase 8：Squad 与排行榜

- 创建和加入 Squad。
- 展示 Squad 总锁仓、成员数、Heat、Activated Pass 数。
- 区分 Heat 排行和真实锁仓排行。
- 生成 Squad 海报和邀请文案。

交付标准：Squad 能形成团队传播闭环。

### Phase 9：奖励与防刷

- 有效邀请触发：新钱包、首次绑定、完成最低锁仓、确认数达标、观察期通过。
- 奖励状态：`Pending -> Claimable -> Claimed / Rejected`。
- 接入 `RewardDistributor` 或后端人工审核发放。
- 自邀请拦截、设备/IP 限频、资金来源异常标记、黑名单。
- 低额奖励提示累计后领取。

交付标准：真实奖励只绑定有效链上锁仓，不按纯点击发放。

## 5. 给 ChatGPT-Pro 的代码输出约束

每次只让 ChatGPT-Pro 实现一个 Phase，不要一次性输出全项目。

每次输出必须包含：

- 修改文件清单。
- 完整 patch 或完整文件内容。
- 不改无关文件。
- 不引入 EVM 的 `ERC-20/approve` 逻辑。
- 当前按 TON Jetton + TonConnect 方向实现。
- 锁仓合约接口未确认前，链上写操作使用 adapter 占位，不硬编码假业务。
- 保持 `npm run lint` 和 `npm run build` 通过。

建议第一步让 ChatGPT-Pro 输出：`Phase 1：前端基础重构 + contracts.ts + 类型定义 + 保留现有 UI`。

# ChatGPT-Pro 一次性开发提示词

复制下面整段给 ChatGPT-Pro 使用。

```text
你是一个资深全栈 Web3 工程师。请基于当前仓库 `multi-millionaire` 一次性完成 Project 72H / Millionaire Path MVP 的完整开发实现，而不是分阶段实现。

仓库现状：
- 技术栈：Vite + React 19 + TypeScript + Tailwind CSS。
- 当前主要文件：`src/App.tsx`、`src/views/Home.tsx`、`src/views/Team.tsx`、`src/views/Share.tsx`、`src/components/BottomNav.tsx`、`src/index.css`。
- 产品文档：`docs/product-requirements.md`。
- 开发计划：`docs/development-plan.md`。

链上前提：
- 已部署的 72H 代币合约地址：`EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8`。
- 该地址格式按 TON 生态处理，视为 72H Jetton Master 地址。
- 不要使用 EVM / ERC-20 / approve / wagmi / viem / ethers 的逻辑。
- 钱包连接使用 TON 方向，优先使用 `@tonconnect/ui-react`。
- Jetton 交互优先使用 TON SDK 方向，例如 `@ton/ton`、`@ton/core` 或同等维护良好的 TON 包。

重要业务规则：
- 用户存入的是真实 72H Jetton。
- 用户存入的 72H 进入锁仓合约托管。
- 存入、解锁、提现、领取奖励产生的所有 gas 由用户自己承担，平台默认不补贴 gas。
- 管理员手动上传 72H 价格，系统根据管理员价格判断锁仓是否可解锁。
- 管理员价格是中心化信任点，前端必须明确提示。
- 分享点击、Rush Pass、Squad、Heat 不是资产，不直接兑换真实 72H。
- 真实邀请奖励只基于有效链上锁仓结算，不按点击分享按钮发放。

新增业务合约规划：
- `72HLockVault`：锁仓、解锁、提现。
- `AdminPriceOracle` 或 `PriceController`：管理员价格上传。
- `RewardDistributor`：邀请奖励领取。
- 已部署的 72H Jetton Master 不算新增业务合约。

由于锁仓合约地址和具体接口尚未提供，请这样处理：
- 不要伪造生产锁仓交易成功。
- 在代码中建立清晰的 adapter 边界。
- 对未知合约地址使用环境变量占位，例如 `VITE_72H_LOCK_VAULT_ADDRESS`、`VITE_72H_PRICE_ORACLE_ADDRESS`、`VITE_72H_REWARD_DISTRIBUTOR_ADDRESS`。
- 如果缺少锁仓合约地址，UI 可以进入“配置缺失”状态，明确告诉用户该功能等待锁仓合约配置。
- 可以提供 dev mock adapter，但必须清楚标注为 development/mock，不能混入生产路径。

请一次性完成以下开发内容：

1. 项目配置与类型系统
- 新增 `src/config/contracts.ts`。
- 新增 `src/types/`，定义 `WalletState`、`LockRecord`、`RushPass`、`Squad`、`Reward`、`PriceUpdate`、`Wave`、`ReferralBinding`。
- 移除主要页面中的 `any` props。
- 所有金额内部使用字符串或 bigint 边界，避免浮点数直接处理链上数量。
- 增加格式化工具：地址缩写、Jetton 数量格式化、价格格式化、倒计时格式化。

2. TON 钱包连接
- 安装并接入 `@tonconnect/ui-react`。
- 在应用根部配置 `TonConnectUIProvider`。
- 替换当前 mock 钱包地址。
- 显示真实钱包地址、连接状态、网络状态。
- 每次链上交易前显示 gas 由用户承担的提示。

3. 72H Jetton 余额读取
- 读取用户 72H Jetton 余额。
- 如果实际链上读取实现受限，可以先通过 `tonClient` adapter 封装，并提供 mock fallback。
- UI 必须区分真实读取、加载中、读取失败、配置缺失。

4. 锁仓体验
- 将当前 Home 的 deposit 逻辑改为 `Lock 72H` 逻辑。
- 如果锁仓合约地址已配置，准备 TON Jetton transfer payload 的 adapter 函数。
- 如果锁仓合约地址未配置，按钮置为不可用并说明缺少 `VITE_72H_LOCK_VAULT_ADDRESS`。
- 显示交易状态：待连接钱包、配置缺失、待签名、已提交、确认中、成功、失败。
- 保留视觉风格，但去掉会误导用户的假“Tx Confirmed”模拟成功逻辑。

5. 管理员价格与解锁
- 新增价格状态展示：管理员价格、更新时间、来源说明。
- 增加风险提示：管理员价格不是实时交易所自动价。
- 增加锁仓记录列表，显示锁仓数量、锁仓价格、当前价格、目标解锁条件、可解锁状态。
- 如果解锁合约地址或接口缺失，解锁按钮进入配置缺失状态。

6. Rush Pass
- 将 Share 页面升级为 Rush Pass 邀请中心。
- 实现 `Pending Rush Pass`、`Activated Rush Pass`、`Expired` 状态。
- 用户无需钱包即可领取 Pending Pass。
- 完成钱包连接和最低有效锁仓后才能显示为 Activated。
- 增加 72 小时 Wave 倒计时。
- 增加个人邀请链接、复制文案、生成海报、下载海报。
- 明确提示 Rush Pass 不是资产，不是空投承诺，不代表收益。

7. Squad
- 改造 Team 页面为 Squad 页面。
- 显示 Squad 名称、成员数、Heat、Activated Pass 数、总锁仓、团队排名。
- 区分 Heat 排名和真实锁仓排名。
- 增加 Squad 邀请入口和团队海报文案。

8. Rewards
- 新增奖励模型和 UI 区块。
- 显示 Pending、Claimable、Claimed、Rejected。
- 真实奖励只来自有效邀请锁仓。
- 用户领取奖励时提示 gas 自付。
- 如果 `RewardDistributor` 未配置，领取按钮不可用并提示缺少配置。

9. 后端或本地数据层
- 如果你选择加 Express 后端，请新增清晰的 `server/` 目录和脚本。
- 如果为了保持 Vite 前端单体，请实现 `src/services/localStore.ts` 作为 MVP 本地数据层，但必须明确标注仅用于 demo/dev。
- Rush Pass、Squad、Heat、邀请点击、波次倒计时可以先走 off-chain 数据层。
- 不要把 off-chain Heat 直接兑换为真实 72H。

10. 合约草案
- 新增 `contracts/README.md`，说明三合约架构。
- 如果能合理输出 TON/Tact 草案，则新增：
  - `contracts/72HLockVault.tact`
  - `contracts/AdminPriceOracle.tact`
  - `contracts/RewardDistributor.tact`
- 合约草案必须标注为 draft，需要审计后才能生产使用。
- 如果不确定 TON 合约语法，不要输出伪生产合约；改为输出接口说明和消息结构。

11. 文案与风险提示
- 所有收益相关文案避免固定收益、保底、保证暴富。
- 每个链上交易入口必须提示 gas 由用户承担。
- 管理员价格入口必须提示中心化机制。
- 分享海报不能包含收益承诺。

12. 质量要求
- 保持现有视觉方向，允许重构布局，但不要改成普通模板风格。
- TypeScript 严格通过。
- `npm run lint` 必须通过。
- `npm run build` 必须通过。
- 不要引入未使用的大型依赖。
- 不要提交密钥、私钥、真实管理员凭据。
- 不要修改无关文件。

请输出：
1. 修改文件清单。
2. 每个新增/修改文件的完整内容，或 unified diff patch。
3. 新增环境变量说明。
4. 本地运行步骤。
5. 已知限制，尤其是锁仓合约地址和接口未提供导致的功能阻塞。
6. 验证命令：`npm run lint`、`npm run build`。

目标是一次性给出完整 MVP 代码，让另一个工程师可以直接应用到仓库中运行和验证。
```

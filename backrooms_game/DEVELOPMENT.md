# 后室：逃离（BACKROOMS ESCAPE）开发说明

> 本文档面向后续维护者（尤其是 AI 助手）。改动前先读第 9 节「陷阱清单」，
> 可以避免重新踩一遍已经踩过的坑。当前版本：v2.3（index.html 内 ?v=18）。

## 1. 项目概览

- 纯静态第一人称恐怖探索游戏：Three.js r128（CDN）+ 原生 JS，无构建步骤。
- 24 个层级（LEVEL_CFGS，id 0~23），无缝互连，多种穿越装置。
- 本地运行：任意静态服务器指向仓库根目录，如 `python -m http.server 8099`，
  访问 `/backrooms_game/index.html`。

### 文件清单（js/）

| 文件 | 职责 |
|---|---|
| level.js | 地图生成（多布局）、场景构建、碰撞、高度、装置、道具、多层系统（最大最核心） |
| player.js | 移动/重力/跳跃/天梯攀爬/蹲行/触屏摇杆 |
| entity.js | 实体 AI：BFS 寻路、巡逻/追踪/调查、抓捕 |
| game.js | 主控制器：状态机、层级穿越、交互、投掷瓶、秘籍、主循环 |
| ui.js | HUD、小地图、菜单/图鉴、横幅、toast |
| textures.js | 程序化 Canvas 贴图（墙/地/顶/门/纸条…） |
| audio.js | WebAudio 程序化音效（无音频文件） |
| utils.js | RNG(mulberry32)、Store(localStorage 封装)、U 工具 |

## 2. 核心概念与坐标系

- 网格：`CELL = 4` 米/格，地图 `W = H = cfg.size`；`grid[y][x]`，1=墙 0=开放。
- 世界坐标：`cellToWorld(cx,cy) = ((cx+0.5)*CELL, (cy+0.5)*CELL)`；索引 `i = y*W+x`。
- `floorMap`（Float32Array）：每格地面高度。`> 0.4` 视为"抬高"（高台/台阶），
  `<= HOLE_DEPTH/2`（HOLE_DEPTH=-60）为破洞。
- 出生点固定 (1,1)，`empties` 按 BFS 距离**从远到近**排序。
- 玩家真实脚底高度是 `player.feetY`；**`player.pos.y` 恒等于 EYE_H(1.62)**，
  相机高度 = `feetY + _eyeH`。见第 9 节陷阱 1。

## 3. 地图生成

`build(scene)` 管线顺序（level.js，顺序有依赖，勿随意调换）：

1. `genMap`：按 `cfg.layout` 选生成器 —— maze（默认 DFS+braid+房间）/
   rooms（BSP）/ halls（中庭+环廊）/ grid（街区）/ organic（随机游走洞穴）。
   非 maze 布局尾部必须 `ensureConnected()`（否则角落实心区会导致
   `_placeExits` 的 `okCell` 找不到点或 `empties` 为空崩溃）。
2. `floorMap` 初始化、材质、`bfsField` 距离场与 empties。
3. `_buildPlatform`（若 cfg.platformH）：最远房间整体抬高 + 向外找直线空地铺
   逐级台阶（每级 ≤0.55m，玩家 STEP_UP_MAX=0.72）。
4. `_placeExits`：放穿越装置（door/elevator/pipe/glitch/hole/lightdoor）。
   hole 装置直接把 floorMap 置为 HOLE_DEPTH 并登记 `holeCells`。
5. 实体出生点（`f <= 0.5` 的格，即不在高台上）。
6. `_buildStories`（若 cfg.stories ≥ 2）：多层系统，见第 5 节。
7. 墙体（实心格长 box，跨 -2 到 wallH；挑空邻接处自动加高）→
   `_buildFloors`（跳过破洞）→ 天花板（高台上空抬高成挑空中庭；
   被上层楼板覆盖的格子跳过）→ 水 → `_placeItems` → `_placeLandmark` →
   `_placeProps` → 灯光/尘埃 → fog。

## 4. 高度系统（含最重要的一处"故意的怪代码"）

- `groundAt(x, z, capY)`：返回该格支撑地面。无 capY 取最高层；
  有 capY 取 ≤ capY 的最高层。
- **陷阱：capY 分支里 floorMap 不做 ≤capY 过滤（b2 直接取 floorMap）。
  这是承重行为**——高台格(如 1.6)在任意 capY 下都返回 1.6，
  这使高台边缘对行走判定是"实心墙"（`_passable` 挡住），
  玩家跳进高台格下落时会 snap 到台面而不是嵌模。**不要"修复"它**，
  改了高台边缘会变成可坠入的洞并造成无限弹跳。
- `_ceilTopAt(cx,cy)`：该格头顶封闭面高度。底层 = wallH；高台格
  `+= _atriumH`（= platformH + 0.6，即"挑空中庭"）；被上层覆盖的格
  = 层 y + wallH。灯/点光/警报灯都用它贴天花板，新增头顶结构时记得同步。
- v2.3 空中移动：`_passable` 空中分支只拦 `feetY+0.05 < gAll < feetY+2.2`
  的目标格（防落地嵌模），上层楼板(3.8+)不再没收跳跃的空中控制。

## 5. 多层系统（stories）

- 配置：`cfg.stories`（楼层数）、`cfg.storyH`（层高）。
  **封缝规则：storyH 必须落在 [wallH-0.15, wallH+0.31]，**
  让 2F 楼板(box 厚 0.3)与底层天花板(box 厚 0.16)竖向重叠，
  否则楼板边缘和低天花板之间会出现一条能看穿楼层的横缝。
  现有取值：L1 3.2 / L3 3.2 / L8 4.4 / L13 3.2 / L17 3.8 / L21 3.8。
- **v2.3 楼层差异化**：每层独立生长区域 `R[s]`（`this.storyRegions`），
  不再整栋楼共用一套格子。R[s] 种子 = 上一层随机 6 格（保证重叠供天梯落点）
  + 距出生点最远的新格（把形状拉向未探索区）；生长后若与上一层重叠 < 8 格
  会自动向相邻的上一层格子扩张补足。
- 数据：`layers[k] = { y: (k+1)*storyH, cells:Set, holes:Set }`。
  `holes` = 该层楼板缺失格（天梯井口 + 塌陷破洞）。
- 天梯（`this.ladders`，元素 {x,z,y0,y1,ex,ez,scx,scy}）：
  - 井口格必须同时 ∈ R[t] 与 R[t+1]（t=0 只需 ∈ R[1]，下方是地面）；
  - 井口 = 在 layers[t].holes 挖洞（爬穿第 t+1 层的楼板）；
  - 玩家抓握判定：距梯杆 ±0.9 内，**已抓时整个井格内不脱手**（防滑坠）。
  改爬梯逻辑时这两个数值别动，之前整格捕获和点捕获两种方案都翻过车。
- 塌陷破洞：每层独立挑选，避开井口及其 1 格邻域；每层 1~2 个。
- 楼层判定：`level.storyAt(feetY)`（0=地面），HUD 每 0.5s 刷新"· nF"标签。

## 6. 关键数值表（平衡性敏感，改动需回归测试）

| 位置 | 数值 | 含义 |
|---|---|---|
| player.js | STEP_UP_MAX 0.72 | 可直接迈上的高差（台阶逐级 ≤0.55 与之匹配） |
| player.js | JUMP_V 5.2 / GRAVITY -22 | 跳高约 0.61m（跳不上高台，必须走台阶/天梯） |
| entity.js | BFS passable `f <= 0.5` | 实体只走地面和 ≤0.5 的低台阶 |
| entity.js | 直线追击阻挡 `gN > baseY + 0.55` | 防实体嵌进高台侧壁（走楼梯则正常追） |
| entity.js | 抓捕 `distP < catchRange 且 |pFeet - baseY| < 1.7` | 垂直距离防隔台/隔楼板抓人；1.6 高台边缘留了"抓脚踝"空间 |
| game.js | 交互垂差 > 1.35 忽略 | 防隔楼板/高台拾取与隔空开装置；装置 y 视为 0 |
| level.js | `_atriumH = platformH + 0.6` | 挑空中庭抬升量 |

## 7. 层级配置速查

- stories ≥ 2：L1 车库(2F)、L3 办公室(2F)、L8 仓库(2F)、L13 公寓(3F)、
  L17 图书馆(2F)、L21 数据中心(2F)。
- platformH 高台：L1(1.6)、L4 酒店(1.8)、L8 仓库(2.0)、L14 城区(2.0)。
- 地标 `cfg.landmark`：高度必须 < wallH（历史上书塔/大树顶穿过天花板，
  已限高；新增地标注意限高）。
- 装置 kind：door(keycard 锁) / elevator(needsPower) / pipe / glitch(走入自动) /
  hole(feetY<-3 自动) / lightdoor(to:-1 结局)。
- L1 特有：保险丝 + 配电箱（`powerbox`，选位已避开高台/破洞格）。

## 8. 状态与存储

- `Store`（utils.js）：key 前缀 `br_`，**带内存镜像 `_mem`**——
  localStorage 被禁用/写满时（Safari 隐私模式、部分 webview）进度仍在会话内生效。
  已有 key 一经 set 后 get 永远读镜像，注意跨标签页不同步是已知取舍。
- `discovered` 数组：长度必须 === LEVEL_CFGS.length，不等时自动迁移扩容（保留旧进度）。
- **travelTo 的 `first` 必须在调用 startLevel 之前读取**（startLevel 会立即标记发现），
  反序会把老层级误报成"✨ 新层级"。
- 首次进入才播完整介绍 toast；重回旧层只弹"📍 重回"轻提示（startLevel 内
  `isFirstVisit` 分支）。

## 9. 陷阱清单（AI 必读）

1. **`player.pos.y` 恒为 EYE_H**，真实高度在 `player.feetY`。
   任何涉及玩家高度的判定用 `feetY`，用 `pos.y - EYE_H` 恒等于 0（历史 bug 根源）。
2. **groundAt 的 capY 不过滤 floorMap**（第 4 节），承重行为，勿修。
3. **改任何 js 必须 bump index.html 里全部 9 处 `?v=N`**，否则浏览器缓存旧文件。
4. **obstacles 是纯 2D 的**：道具障碍不分楼层。目前道具选位已排除高台格
   （floorMap > 0.4），若允许道具上楼需同步给 obstacles 加 y。
5. 多层关卡给地面放东西要用 `groundAt(x, z, 0.6)` 这类 capY 调用，
   否则物品会飞到顶层楼板上（`_placeItems` 已修，新代码照抄该模式）。
6. 实体 mesh 的 y 来自 `groundAt(x,z,0.5)`；由于第 2 条的怪代码，
   实体一旦站进高台格 baseY 会直接等于台面（沿楼梯上去是合法路径，
   从侧面则被 step-block 挡住）。
7. 布局生成器尾部必须 `ensureConnected`；新增布局同样。
8. 出口装置格会被 `_buildStories` 的 banned 排除，不会出现在上层区域；
   新增"占用地面格"的系统时记得也加进 banned，防止被楼板压住。
9. 天花板/灯高度统一走 `_ceilTopAt`；新增头顶几何时先更新它。
10. `travelCooldown`（1.4s）期间 `_checkTransits` 不检测，破洞/裂缝传送后
    不会被立刻再次触发；藏身柜退出会临时抬高该冷却。

## 10. 秘籍（仅主菜单标题连点 5 次开启后门，或键盘直接输）

`IDDQD` 无敌 / `IDCLIP` 穿墙飞行 / `IDKFA` 钥匙卡+保险丝 / `IDLEVEL` 随机跳层 /
`unlockall` 图鉴全开。测试时可用 `GAME.startLevel(id)` 直接进层、
`GAME.doCheat('noclip')` 飞行。

## 11. 测试方法（本机环境注意事项）

- 语法：`node --check js/*.js`（改完全部跑一遍）。
- 浏览器：`python -m http.server 8099` + agent_browser（用 auto 会话，
  **fresh 会话因 socket 名超长必然失败**，不要试）。
- 本机 chromium 的 GPU 进程不稳定，WebGL 上下文频繁丢失（症状：整屏白）：
  - 游戏侧已自愈：丢失 4s 自动 reload；构造失败时菜单显示提示。
  - 测试侧：eval 里用 `setInterval(() => { GAME._ctxLostAt = 0; }, 250)`
    挂"保活器"阻止测试中被自动 reload。
  - 彻底白屏时杀浏览器：`pkill -f 'chromium/chrom[e]'`（中括号防自杀），
    重开即恢复。内存紧张（swap 高）时更频繁，属环境问题非代码回归。
- **无 GPU 也可跑逻辑测试**：复制 index.html 为 test.html，在 three.min.js
  之后注入一个假 `THREE.WebGLRenderer`（render/setSize 空实现，
  getContext 返回 `{isContextLost: ()=>true}`），游戏逻辑照常运行，
  可 teleport 玩家/实体跑几百帧断言。测完删除 test.html。
- 验证穿模/几何：直接数学断言（如挑空净高 = `_ceilTopAt - floorMap ≥ 1.75`），
  比截图可靠。
- 服务器日志 `$HOME/httpd.log`；长跑测试用异步写 `window.__testOut` + 轮询，
  别在单个 eval 里跑满 120s（CDP 会超时）。

## 12. 常见改动指南

- **新增层级**：LEVEL_CFGS 加配置（id 顺延），在邻层的 exits 里加入口，
  `Game.ensureDiscovered` 的迁移逻辑会自动扩容进度数组；改 js 后 bump 版本号。
- **给层级加楼层**：加 `stories: 2, storyH: X`，X 按第 5 节封缝公式取值。
- **加新布局生成器**：实现 `(rng, W, H, opts) -> {grid, rooms}`，
  在 LEVEL_LAYOUTS 分配，尾部调 ensureConnected。
- **加新道具类型**：`_makeItemMesh` 建模 + `game.js tryInteract` 加 case +
  `_findInteractable` 自动生效（有 y 的道具自动受垂差约束）。
- 提交约定：中文提交信息，直接 `git push`（凭据已存好）。

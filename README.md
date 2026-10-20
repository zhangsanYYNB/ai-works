# zhangsanYYNB 的 AI 代码项目

欢迎来到 zhangsanYYNB 的 AI 代码仓库！本仓库包含多个由 AI 生成的纯前端 HTML 项目：数学工具、物理仿真、3D 可视化与网页小游戏，全部开箱即用。

## 📁 项目列表

### 数学与学习工具

#### Math Solver · 数学求解器 (math_solver/)
- **计算**：科学计算、分数与复数、代数化简/展开/因式分解、单变量方程与不等式、线性方程组、导数/积分/极限、矩阵/向量、描述统计、单位与整数进制换算。
- **交互**：可编辑的数学公式、分步说明、最多六条函数的平移/缩放/坐标探测、参数滑块、数值表与 CSV、步骤导出、历史收藏和举一反三练习。
- **手机**：分类数学键盘，长按角标键可滑动或点选更多符号，支持光标移动、占位跳转、退格连删。
- **运行**：直接打开 `math_solver/index.html`，依赖与字体全部本地加载；通过 HTTP(S) 打开时自动使用 Web Worker 隔离计算。
- **技术**：原生 HTML/CSS/JavaScript、MathLive、Math.js、Nerdamer、Canvas 2D，无后端、无构建步骤。

#### 国庆假期作业量分析报告 (Nhw.html)
- **描述**：基于 Chart.js 的作业量统计分析单页报告（修订版）。
- **访问**：直接在浏览器中打开 `Nhw.html`。

#### XC · 看见相对运动 (Xc.html)
- **描述**：相对运动交互式可视化教学页面，帮助直观理解参考系与相对速度。
- **访问**：直接在浏览器中打开 `Xc.html`。

#### 答案速查 · 选择题偏移 (answer_shift.html)
- **描述**：通用导入版选择题答案偏移速查工具，支持批量录入与快速换算。
- **访问**：直接在浏览器中打开 `answer_shift.html`。

#### 随机答案生成器 (random_answer.html)
- **描述**：ABCD 多选题与七选五随机答案序列生成器。
- **访问**：直接在浏览器中打开 `random_answer.html`。

### 物理与几何仿真

#### 双环连杆机构运动仿真 (simulation.html)
- **描述**：物理仿真项目，模拟两个垂直杆上的双环系统运动。
- **功能**：动态展示角度、加速度、速度随时间变化；实时运动动画和图表；可调节初始参数（角度、杆长等）；详细的物理公式说明。
- **技术栈**：HTML5 Canvas, JavaScript
- **访问**：直接在浏览器中打开 `simulation.html`

#### 等面四面体与长方体切割法可视化 (slz.html)
- **描述**：3D 几何可视化项目，展示等面四面体与长方体的关系。
- **功能**：Three.js 3D 渲染、交互式视角控制、四面体体积计算原理演示、彩色标注不同棱长。
- **技术栈**：Three.js, HTML5, JavaScript
- **访问**：直接在浏览器中打开 `slz.html`

#### 碰撞仿真 (collision_simulation.html)
- **描述**：物理碰撞模拟项目，模拟物体碰撞运动并可视化碰撞效果。
- **技术栈**：HTML5 Canvas, JavaScript
- **访问**：直接在浏览器中打开 `collision_simulation.html`

#### 多次碰撞实验室 (multi_collision_lab.html)
- **描述**：多物体多次碰撞实验仿真，深色主题界面，可调节参数观察碰撞过程。
- **技术栈**：HTML5 Canvas, JavaScript
- **访问**：直接在浏览器中打开 `multi_collision_lab.html`

#### 3D 电场可视化 (electric_field_3d.html)
- **描述**：3D 电场线可视化项目，交互式展示电荷配置与电场线分布。
- **技术栈**：Three.js, HTML5, JavaScript
- **访问**：直接在浏览器中打开 `electric_field_3d.html`

#### 反应动力学仿真 (reaction_kinetics.html)
- **描述**：化学反应动力学模拟项目，展示浓度变化曲线，可调反应参数。
- **技术栈**：HTML5 Canvas, JavaScript
- **访问**：直接在浏览器中打开 `reaction_kinetics.html`

#### 钢尺弯曲与振动 3D 物理仿真 (SteelRuler.html)
- **描述**：钢尺弯曲与振动的 3D 物理仿真（带阻尼动力学版）。
- **功能**：Three.js 3D 渲染 + OrbitControls 视角控制；悬臂梁弯曲与多阶模态振动仿真；可调力学参数（长度、截面、质量、阶数等）；阻尼比 ζ 控制与振动衰减动力学；KaTeX 渲染物理公式说明。
- **技术栈**：Three.js, KaTeX, HTML5, JavaScript
- **访问**：直接在浏览器中打开 `SteelRuler.html`（Three.js 与 KaTeX 通过 CDN 加载，需联网）

### 游戏

#### 后室：逃离 3D 立体多层逃生游戏 v2.2 (backrooms_game/)
- **描述**: 后室（Backrooms）题材第一人称 3D 逃生解密游戏，v2.2 新增 5 种地形布局/地标建筑/潜行玩法，层级扩至 24 个
- **功能**:
  - **24 大层级无缝探索**：黄色迷宫(hub)/潮湿车库/管道长廊/废弃办公室/恐怖酒店/无光之境/水淹隧道/荒芜矿洞/无尽仓库/白色病房/深红警报(终章追逃)/白色虚空(终局)/泳池房间/垂直公寓(三层楼)/灰色城区/派对间，新增消防楼梯间/无尽图书馆/废弃地铁站/停尸间(-1)/温室花园/数据中心/白色风暴/镜像大厅
  - **5 种地形布局生成器**（v2.2）：传统迷宫/房间群(BSP)/大厅环廊(中庭+放射支路)/街区网格(城区街道)/洞穴有机(随机游走)，每层地形结构截然不同
  - **地标建筑**（v2.2）：喷泉水池/书塔/地铁列车/停尸抽屉墙/温室大树/服务器机柜阵列/镜面立柱——大型视觉锚点辅助导航
  - **立体多层结构**：部分层级拥有 2~3 个楼层，随机生成上层连通区域、楼板与护栏；可攀爬天梯连接楼层（W/S 攀爬、跳键跃离、到顶自动滑出）
  - **潜行玩法**（v2.2）：投掷玻璃瓶声东击西（实体前往噪音处调查）/藏身柜躲避（实体视野失效）/蹲行慢走（降低被视认概率）
  - **层级目标 HUD**（v2.2）：实时提示当前目标（找保险丝/找门禁卡/前往出口）；穿越大字层级横幅
  - 六类穿越装置互联：门/电梯/管道/裂缝/破洞/光之门；图鉴记录发现进度
  - 实体三形态+各层专属实体（书虫/地铁鼠群/信号幽灵/镜中人等），BFS 寻路过滤破洞与高台
  - 解谜收集：纸条叙事×48、保险丝供电链、门禁卡、杏仁水、肾上腺素
  - 三档难度、体力奔跑、手电筒、小地图、层级图鉴、逃脱统计持久化；零外部资源
  - 电脑键鼠 + 手机触屏双端适配
- **技术栈**: Three.js, HTML5, Canvas 程序化纹理, WebAudio, JavaScript
- **访问**: 浏览器打开 `backrooms_game/index.html`（建议横屏+耳机）

#### 星火双行：2D 横版合作闯关 (ember_duo/)
- **内容**：六个世界、48 关、六场首领战；二段跳、冲刺、远程攻击、踩踏、连击奖励、钥匙门、移动平台、冰面、碎裂平台、锯刃和定时激光。
- **模式**：单人或本地双人同屏；键盘与多点触屏可以同时输入，双人各有独立触屏控制，支持同伴召回。
- **进度**：检查点复活、每关三枚星核、144 枚星章、最佳时间、本地自动存档；可开启生命加护、关闭音效和粒子。
- **运行**：直接打开 `ember_duo/index.html`，无需安装、构建或在线 CDN。详细操作见 [游戏说明](ember_duo/README.md)。
- **技术**：本地 Phaser 3.90 Arcade Physics、Canvas 程序化美术、Web Audio、Pointer Events。

#### 星际方块：远星回响 (starbound_blocks/)
- **描述**：融合体素采矿、自由建造与异星探索的单人 3D 网页小游戏，采用原创程序化美术，四颗按固定种子生成的星球。
- **玩法**：采集资源修复飞船 → 星图跃迁探索多颗星球 → 扫描生物矿物获取研究点 → 升级装备对抗哨兵 → 制造跃迁核心启动星门通关；含背包制造、建造回收、环境风暴与氧气/护盾生存系统。
- **操作**：键鼠与触屏/触控笔双端适配，详见 [游戏说明](starbound_blocks/README.md)。
- **技术栈**：Three.js（本地 vendor）、WebGL、JavaScript
- **访问**：保持目录完整，打开 `starbound_blocks/index.html`（需支持 WebGL 的现代浏览器）

#### 云端一跃 · SKY HOP / 3D (jump_game.html)
- **描述**：轻盈治愈的 3D 跳跃游戏——在漂浮的天空花园中，按住蓄力、松手起跳。
- **技术栈**：Three.js（本地 `jump_game/vendor/`），入口为根目录 `jump_game.html`，需保留 `jump_game/` 目录。
- **访问**：直接在浏览器中打开 `jump_game.html`

#### 水果忍者 · 网页重制版 (fruit_ninja.html)
- **描述**：经典切水果玩法的网页重制版，挥刀切水果、躲炸弹。
- **技术栈**：HTML5 Canvas, JavaScript
- **访问**：直接在浏览器中打开 `fruit_ninja.html`

### 工具与页面

#### 商店配置编辑器 (shopdata.html)
- **描述**: ShopData 商店配置的可视化树形 JSON 编辑器
- **功能**: 树形结构浏览与编辑（分组 / 物品）；上传 / 下载 / 新建 / 清空 JSON 数据；添加、复制、上移、下移、删除节点；全量数据校验与错误定位；物品图片选择器、搜索、展开 / 折叠。
- **技术栈**: HTML5, CSS3, JavaScript
- **访问**: 直接在浏览器中打开 `shopdata.html`（配套数据示例见 `mcbeid-vanilla.json`）

#### 入口页面 (index.html)
- **描述**: 项目导航主页，卡片式布局展示所有 HTML 项目，支持悬停动画与一键刷新文件列表。
- **访问**: 直接在浏览器中打开 `index.html`，推荐从这里开始浏览所有项目。

## 🚀 快速开始

1. 克隆本仓库
```bash
git clone <repository-url>
cd <repository-directory>
```

2. 在浏览器中打开任意 HTML 文件即可运行（个别游戏需保持所在目录完整）

3. 推荐从 `index.html` 开始浏览所有项目

> 提示：多数项目双击即可离线运行；仅 `SteelRuler.html` 依赖 CDN，需要联网加载 Three.js 与 KaTeX。

## 📋 文件结构

```
.
├── index.html                  # 项目导航主页
├── README.md                   # 项目说明文档
├── LICENSE                     # 许可证文件（Public Domain）
├── CNAME                       # GitHub Pages 自定义域名
├── AGENTS.md                   # AI 代理协作说明
├── mcbeid-vanilla.json         # 商店配置数据示例
│
├── math_solver/                # 数学求解器（含本地计算库与触屏键盘）
│   └── index.html              # 求解器入口
├── backrooms_game/             # 后室：逃离 3D 逃生解密游戏
│   ├── index.html              # 游戏入口
│   ├── css/style.css           # 样式
│   └── js/                     # 游戏逻辑（关卡生成/实体AI/玩家控制/UI/音效/纹理）
├── ember_duo/                  # 星火双行 2D 横版合作闯关（含本地 Phaser 与 README）
├── starbound_blocks/           # 星际方块 3D 体素探索游戏（含 README、vendor、tests）
├── jump_game/                  # 云端一跃的游戏逻辑与本地 Three.js（入口为根目录 jump_game.html）
│
├── Nhw.html                    # 国庆假期作业量分析报告
├── Xc.html                     # XC · 看见相对运动
├── answer_shift.html           # 答案速查 · 选择题偏移
├── random_answer.html          # 随机答案生成器
├── simulation.html             # 双环连杆机构运动仿真
├── slz.html                    # 等面四面体与长方体切割法可视化
├── collision_simulation.html   # 碰撞仿真
├── multi_collision_lab.html    # 多次碰撞实验室
├── electric_field_3d.html      # 3D 电场可视化
├── reaction_kinetics.html      # 反应动力学仿真
├── SteelRuler.html             # 钢尺弯曲与振动 3D 物理仿真（依赖 CDN）
├── jump_game.html              # 云端一跃 SKY HOP 3D 跳跃游戏
├── fruit_ninja.html            # 水果忍者网页重制版
└── shopdata.html               # 商店配置编辑器
```

## 🛠️ 技术特点

- **纯前端实现**: 所有项目均使用 HTML/CSS/JavaScript 构建
- **无需构建**: 直接在浏览器中打开即可运行
- **离线优先**: 大部分项目依赖（Three.js、Phaser、MathLive 等）已本地化，仅少数页面使用 CDN
- **响应式设计**: 适配桌面键鼠与手机触屏双端操作
- **交互性强**: 提供丰富的用户交互功能与程序化美术

## 📄 许可证

本项目采用 [查看 LICENSE 文件](LICENSE) 中指定的许可证（Public Domain / Unlicense）。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**享受探索 AI 生成的代码世界！** 🎉

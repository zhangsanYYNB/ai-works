# 仓库记忆 (Repository Memory)

## 基本信息
- **仓库**: ai-works（zhangsanYYNB 的 AI 代码项目）
- **远程地址**: https://github.com/zhangsanYYNB/ai-works.git
- **默认分支**: main（已跟踪 origin/main）
- **本地工作目录**: /data/data/com.termux/files/home/pi-cwd-20260815
- **Git 身份**: zhangsanYYNB <liz589015@outlook.com>
- **推送认证**: 已配置 `credential.helper store`，凭据保存在本机 `~/.git-credentials`（不写入仓库），直接 `git push` 即可，无需再手动输入 token

## 仓库结构
- `index.html` — 项目导航主页，卡片式展示所有 HTML 项目
- `simulation.html` — 双环连杆机构运动仿真
- `collision_simulation.html` — 碰撞仿真
- `electric_field_3d.html` — 电场三维可视化
- `reaction_kinetics.html` — 化学反应动力学
- `shopdata.html` — 可视化编辑器（含 shopdata 数据）
- `SteelRuler.html` — 钢尺工具
- `slz.html` — 数值分析工具
- `mcbeid-vanilla.json` — 配置文件
- `README.md` — 项目说明文档

## Git 状态约定
- 本地分支与 origin/main 的关系：通过 `git pull` / `git push` 保持同步
- 推送前需确认 token 可用：`git push -u origin main`
- 提交信息用中文描述改动内容

## 后室游戏 (backrooms_game/) v2.2 记忆
- **架构**：24 层级无缝探索（v2.1 的 16 + 新增 L16 楼梯间/L17 图书馆/L18 地铁站/L19 停尸间(-1)/L20 温室/L21 数据中心/L22 白色风暴/L23 镜像大厅）；图鉴动态扩容保留旧进度
- **地形布局 v2.2**：LEVEL_LAYOUTS 表按层分配 5 种生成器——maze(传统)/rooms(BSP 房间群)/halls(中庭+环廊+放射路)/grid(街区网格)/organic(随机游走洞穴)；genMap 尾部必须 ensureConnected()（新布局出生点角易孤立→empties 空→_placeExits okCell(c.d) 崩溃）
- **地标建筑**：cfg.landmark → _placeLandmark 在最大房间中心放喷泉/书塔/列车/抽屉墙/大树/服务器阵列/镜柱
- **潜行玩法 v2.2**：G.throwBottle() 投玻璃瓶(Q/按钮)→落地 G.lastNoise={x,z,range,t}→实体 investigate 状态走向噪音点；items 类型 locker 藏身柜(E 进出,G.hiddenIn,UI.setHidden 遮罩)→实体感知失效(alwaysChase 仅近距例外)；player.crouching(Ctrl/C/按钮) 减速减可见；层级目标 HUD=G.currentGoal()+瓶子计数写入 objective-text；travelTo 后 UI.showLevelBanner 大字横幅
- **立体多层 v2.1**：cfg.stories/storyH；Level.layers=[{y,cells,holes}]，groundAt(x,z,capY) 多层支撑（实体/黑影 cap 0.5 锁地面层）；天梯 ladders[{x,z,y0,y1,ex,ez,scx,scy}]——**抓握需靠近梯杆±0.9，已抓时井格内不脱手**（整格捕获会误吸路人/点捕获滑出坠落，两者都踩过坑）
- **六类穿越装置**：door(keycard 锁)/elevator(needsPower)/pipe/glitch(<0.8 自动)/hole(feetY<-3)/lightdoor(to:-1)
- **关键 API**：level.js — groundAt/isHoleCell/holeCells/exits/items/setPower/unlockDoor/_ceilTopAt/layers/ladders/rooms/empties；player.js — feetY/vy/onGround/wantJump/noclip/onLadder/crouching/_eyeH；game.js — travelTo/_checkTransits/_useDevice/throwBottle/_toggleHide/currentGoal/Game.ensureDiscovered
- **秘籍**：仅主菜单标题连点5次；IDDQD/IDCLIP/IDKFA/IDLEVEL/unlockall
- **测试要点**：agent_browser auto 会话（fresh socket 超长失败）；WebGL 上下文易耗尽→pkill chromium 重开；服务器日志 $HOME/httpd.log；改 JS 必须 bump ?v=N；eval 用条件轮询 until()；跨行字符串写 \n 会被工具转成真换行→用 python 状态机修复单引号字符串

## 常用命令
```bash
git pull                # 拉取远端更新
git push                # 推送本地更新（需 token）
git status              # 查看状态
```

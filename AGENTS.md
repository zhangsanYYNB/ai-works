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

## 后室游戏 (backrooms_game/) v2.0 记忆
- **架构**：12 层级无缝探索，无选关门槛；图鉴记录发现进度（Store.discovered[]）
- **六类穿越装置**：door(可 keycard 锁)/elevator(needsPower→L1 保险丝+配电箱)/pipe/glitch(靠近<1.05 自动)/hole(feetY<-3 坠落)/lightdoor(L11 终局 to:-1)
- **关键 API**：level.js — groundAt(x,z)/isHoleCell/holeCells/exits/items/setPower/unlockDoor；player.js — feetY/vy/onGround/wantJump/noclip；game.js — travelTo/_checkTransits/_useDevice/Game.ensureDiscovered/discoveredCount
- **高度系统**：floorMap 高度场 + 跳跃(Space/⬆️按钮)；STEP_UP_MAX=0.72；楼梯每级≤0.5m 且最高阶贴平台（曾修复兜底单级 0.8m 无法攀爬的 bug）
- **实体**：stalker/crawler/wraith 三形态；寻路过滤破洞(floorMap>HOLE_DEPTH/2)与高台(>0.5)格；L10 暴走者 alwaysChase
- **秘籍**：仅主菜单标题连点5次入口；IDDQD/IDCLIP/IDKFA/IDLEVEL/unlockall
- **测试要点**：Termux headless 用 agent_browser auto 会话（fresh 会因 socket 名超长失败）；服务器日志重定向 $HOME/httpd.log（无 /tmp）；缓存用 ?v=N（现 v8），测试加 ?nocache=N

## 常用命令
```bash
git pull                # 拉取远端更新
git push                # 推送本地更新（需 token）
git status              # 查看状态
```

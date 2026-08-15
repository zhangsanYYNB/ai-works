# 仓库记忆 (Repository Memory)

## 基本信息
- **仓库**: ai-works（zhangsanYYNB 的 AI 代码项目）
- **远程地址**: https://github.com/zhangsanYYNB/ai-works.git
- **默认分支**: main（已跟踪 origin/main）
- **本地工作目录**: /data/data/com.termux/files/home/pi-cwd-20260815
- **Git 身份**: zhangsanYYNB <liz589015@outlook.com>
- **推送认证**: 需 GitHub Personal Access Token（未配置 credential helper）

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

## 常用命令
```bash
git pull                # 拉取远端更新
git push                # 推送本地更新（需 token）
git status              # 查看状态
```

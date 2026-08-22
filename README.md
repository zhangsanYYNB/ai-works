# zhangsanYYNB 的 AI 代码项目

欢迎来到 zhangsanYYNB 的 AI 代码仓库！本仓库包含多个由 AI 生成的精彩 HTML 项目。

## 📁 项目列表

### 1. 后室：逃离 3D 闯关解密游戏 (backrooms_game/)
- **描述**: 后室（Backrooms）题材第一人称 3D 逃生解密游戏
- **功能**:
  - 四大层级：LEVEL 0 黄色迷宫 → LEVEL 1 潮湿车库 → LEVEL 2 废弃办公室 → LEVEL ! 红色警报（终章追逃）
  - 随机生成迷宫（每次进入地图重新排列），门禁卡/保险丝/密码锁/软盘终端/白光之门等多重解谜
  - 实体 AI 巡逻/追蹪/搜索，BFS 寻路 + 视线与听觉感知；终章“暴走者”全程无限追杀
  - 手电筒、体力奔跑、肾上腺素爆发、可读纸条碎片叙事、探索小地图、关卡进度存档
  - 场景道具：锈桶/木箱/办公桌/文件柜/翻倒的椅子（带碰撞），程序化 Canvas 纹理与 WebAudio 音效，零外部资源
  - 电脑键鼠（指针锁定）+ 手机触屏（虚拟摇杆/滑动视角/动作按钮）双端适配
- **技术栈**: Three.js, HTML5, Canvas 程序化纹理, WebAudio, JavaScript
- **访问**: 浏览器打开 `backrooms_game/index.html`（建议横屏+耳机）

### 2. 入口页面 (index.html)
- **描述**: 项目导航主页，提供美观的文件列表展示界面
- **功能**: 
  - 卡片式布局展示所有 HTML 项目
  - 悬停动画效果
  - 一键刷新文件列表
- **访问**: 直接在浏览器中打开 `index.html`

### 3. 双环连杆机构运动仿真 (simulation.html)
- **描述**: 物理仿真项目，模拟两个垂直杆上的双环系统运动
- **功能**:
  - 动态展示角度、加速度、速度随时间变化
  - 实时运动动画和图表
  - 可调节初始参数（角度、杆长等）
  - 详细的物理公式说明
- **技术栈**: HTML5 Canvas, JavaScript
- **访问**: 直接在浏览器中打开 `simulation.html`

### 4. 等面四面体与长方体切割法可视化 (slz.html)
- **描述**: 3D 几何可视化项目，展示等面四面体与长方体的关系
- **功能**:
  - Three.js 3D 渲染
  - 交互式视角控制
  - 展示四面体体积计算原理
  - 彩色标注不同棱长
- **技术栈**: Three.js, HTML5, JavaScript
- **访问**: 直接在浏览器中打开 `slz.html`

### 5. 碰撞仿真 (collision_simulation.html)
- **描述**: 物理碰撞模拟项目
- **功能**:
  - 模拟物体碰撞运动
  - 实时物理引擎计算
  - 可视化碰撞效果
- **技术栈**: HTML5 Canvas, JavaScript
- **访问**: 直接在浏览器中打开 `collision_simulation.html`

### 6. 3D 电场可视化 (electric_field_3d.html)
- **描述**: 3D 电场线可视化项目
- **功能**:
  - Three.js 3D 渲染
  - 电场线动态展示
  - 交互式视角控制
  - 电荷配置可视化
- **技术栈**: Three.js, HTML5, JavaScript
- **访问**: 直接在浏览器中打开 `electric_field_3d.html`

### 7. 反应动力学仿真 (reaction_kinetics.html)
- **描述**: 化学反应动力学模拟项目
- **功能**:
  - 模拟化学反应过程
  - 浓度变化曲线展示
  - 可调反应参数
  - 动力学数据分析
- **技术栈**: HTML5 Canvas, JavaScript
- **访问**: 直接在浏览器中打开 `reaction_kinetics.html`

### 8. 商店配置编辑器 (shopdata.html)
- **描述**: ShopData 商店配置的可视化树形 JSON 编辑器
- **功能**:
  - 树形结构浏览与编辑（分组 / 物品）
  - 上传 / 下载 / 新建 / 清空 JSON 数据
  - 添加、复制、上移、下移、删除节点
  - 全量数据校验与错误定位
  - 物品图片选择器、搜索、展开 / 折叠
- **技术栈**: HTML5, CSS3, JavaScript
- **访问**: 直接在浏览器中打开 `shopdata.html`

### 9. 钢尺弯曲与振动 3D 物理仿真 (SteelRuler.html)
- **描述**: 钢尺弯曲与振动的 3D 物理仿真（带阻尼动力学版）
- **功能**:
  - Three.js 3D 渲染 + OrbitControls 视角控制
  - 悬臂梁弯曲与多阶模态振动仿真
  - 可调力学参数（长度、截面、质量、阶数等）
  - 阻尼比 ζ 控制与振动衰减动力学
  - KaTeX 渲染物理公式说明
- **技术栈**: Three.js, KaTeX, HTML5, JavaScript
- **访问**: 直接在浏览器中打开 `SteelRuler.html`

## 🚀 快速开始

1. 克隆本仓库
```bash
git clone <repository-url>
cd <repository-directory>
```

2. 在浏览器中打开任意 HTML 文件即可运行

3. 推荐从 `index.html` 开始浏览所有项目

## 📋 文件结构

```
.
├── index.html                  # 项目导航主页
├── backrooms_game/             # 后室：逃离 3D 闯关解密游戏
│   ├── index.html              # 游戏入口
│   ├── css/style.css           # 样式
│   └── js/                     # 游戏逻辑（关卡生成/实体AI/玩家控制/UI/音效/纹理）
├── simulation.html             # 双环连杆机构运动仿真
├── slz.html                    # 等面四面体可视化
├── collision_simulation.html   # 碰撞仿真
├── electric_field_3d.html      # 3D 电场可视化
├── reaction_kinetics.html      # 反应动力学仿真
├── shopdata.html               # 商店配置编辑器
├── SteelRuler.html             # 钢尺弯曲与振动 3D 物理仿真
├── mcbeid-vanilla.json         # 配置文件
├── LICENSE                     # 许可证文件
└── README.md                   # 项目说明文档
```

## 🛠️ 技术特点

- **纯前端实现**: 所有项目均使用 HTML/CSS/JavaScript 构建
- **无需构建**: 直接在浏览器中打开即可运行
- **响应式设计**: 适配不同屏幕尺寸
- **交互性强**: 提供丰富的用户交互功能

## 📄 许可证

本项目采用 [查看 LICENSE 文件](LICENSE) 中指定的许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**享受探索 AI 生成的代码世界！** 🎉

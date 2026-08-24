/* ============ 层级：地图生成 / 场景构建 / 碰撞 / 高度 / 传送装置 ============ */
'use strict';

const CELL = 4;          // 每格尺寸（米）
const EYE_H = 1.62;      // 视线高度
const HOLE_DEPTH = -60;  // 破洞格的虚拟地面（表示无底）

/* ---------- 层级配置（12 层，探索式互联） ---------- */
const LEVEL_CFGS = [
  {
    id: 0, name: 'LEVEL 0 · 黄色迷宫', short: '黄色迷宫',
    size: 23, wallH: 3.1,
    fogColor: 0x14100a, fogDensity: 0.055,
    ambient: { sky: 0x8a7d55, ground: 0x3a3018, intensity: 0.85 },
    textures: { wall: 'wallpaper', floor: 'carpet', ceil: 'ceiling' },
    lampsEvery: 2, pointLights: 5, rooms: 5,
    props: {}, shadowEvent: true, entity: null,
    hint: '寻找离开此层的通路：地板破洞、现实裂缝、或陌生的门',
    introText: '你从现实中脱落了。无尽的黄色房间……传闻墙纸最薄的地方，可以直接"掉"进别的层级。',
    exits: [
      { kind: 'hole', to: 1 },
      { kind: 'glitch', to: 2 },
      { kind: 'door', to: 4 },
      { kind: 'door', to: 16 },
    ],
  },
  {
    id: 1, name: 'LEVEL 1 · 潮湿车库', short: '潮湿车库',
    size: 25, wallH: 3.0,
    fogColor: 0x05060a, fogDensity: 0.075,
    ambient: { sky: 0x232c38, ground: 0x0a0c10, intensity: 0.22 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 3, pointLights: 4, dark: true, rooms: 6, pillars: true,
    platformH: 1.6,
    props: { barrel: 8, crate: 6, pipeCol: 4, pallet: 4 },
    entity: { name: '潜行者', look: 'stalker', speedPatrol: 1.7, speedChase: 3.6, sightRange: 14, hearingRange: 9, catchRange: 1.15, deathText: '潮湿的黑暗里，它一直贴着柱子在等你。' },
    hint: '黑暗中找到保险丝，恢复供电后电梯才会运行',
    introText: '停电的车库。积水倒映着你看不见的东西。这里通向多个更深的层级。',
    exits: [
      { kind: 'elevator', to: 3, needsPower: true },
      { kind: 'pipe', to: 5 },
      { kind: 'door', to: 0 },
    ],
  },
  {
    id: 2, name: 'LEVEL 2 · 管道长廊', short: '管道长廊',
    size: 27, wallH: 2.7,
    fogColor: 0x0a0d0a, fogDensity: 0.08,
    ambient: { sky: 0x3e4a40, ground: 0x10140f, intensity: 0.3 },
    textures: { wall: 'pipeWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 4, rooms: 4, braid: 0.06,
    props: { pipeCol: 10, barrel: 4, crate: 3 },
    entity: { name: '爬行者', look: 'crawler', speedPatrol: 2.0, speedChase: 4.1, sightRange: 11, hearingRange: 13, catchRange: 1.15, deathText: '它在管道里爬行的声音，你到死都没分清和蒸汽声的区别。' },
    hint: '狭窄的管道迷宫——注意听蒸汽声之外的动静',
    introText: '铆钉钢板与纵横管道构成的狭长走廊。据说地板的破洞直通水淹隧道。',
    exits: [
      { kind: 'hole', to: 6 },
      { kind: 'door', to: 8 },
      { kind: 'glitch', to: 0 },
    ],
  },
  {
    id: 3, name: 'LEVEL 3 · 废弃办公室', short: '废弃办公室',
    size: 27, wallH: 2.9,
    fogColor: 0x0b0a08, fogDensity: 0.06,
    ambient: { sky: 0x6a6552, ground: 0x24211a, intensity: 0.4 },
    textures: { wall: 'officeWall', floor: 'officeFloor', ceil: 'garageCeil' },
    lampsEvery: 3, pointLights: 4, rooms: 6, pillars: true,
    props: { desk: 7, cabinet: 6, chair: 8, locker: 3 },
    entity: { name: '猎手', look: 'wraith', speedPatrol: 2.1, speedChase: 4.3, sightRange: 17, hearingRange: 12, catchRange: 1.15, deathText: '它比你想的更快。奔跑的声音就是它的晚餐铃。' },
    hint: '办公区的某个隔间里藏着通往病房的钥匙卡……不，那是另一层的事',
    introText: '废弃的办公区。键盘声在无人处响起时，不要寻找声源。',
    exits: [
      { kind: 'door', to: 9 },
      { kind: 'pipe', to: 7 },
      { kind: 'elevator', to: 1 },
      { kind: 'door', to: 13 },
    ],
  },
  {
    id: 4, name: 'LEVEL 4 · 恐怖酒店', short: '恐怖酒店',
    size: 25, wallH: 3.2,
    fogColor: 0x120808, fogDensity: 0.07,
    ambient: { sky: 0x7a4a38, ground: 0x2a1410, intensity: 0.42 },
    textures: { wall: 'hotelWall', floor: 'redCarpet', ceil: 'woodCeil' },
    lampsEvery: 3, pointLights: 4, rooms: 6,
    platformH: 1.8,
    props: { bed: 6, chair: 6, cabinet: 4, plant: 4 },
    items: ['keycard'],
    entity: { name: '巡游者', look: 'stalker', speedPatrol: 2.3, speedChase: 3.9, sightRange: 13, hearingRange: 10, catchRange: 1.15, deathText: '酒店的服务员永远热情。它只是想请你永远留下。' },
    hint: '找到门禁卡才能打开通往深红警报的门',
    introText: '无穷无尽的红地毯走廊，每一扇门后都是同一间房。前台没有服务员——但有别的什么东西在巡游。',
    exits: [
      { kind: 'door', to: 10, lock: 'keycard' },
      { kind: 'glitch', to: 5 },
      { kind: 'pipe', to: 2 },
    ],
  },
  {
    id: 5, name: 'LEVEL 5 · 无光之境', short: '无光之境',
    size: 23, wallH: 3.0,
    fogColor: 0x000000, fogDensity: 0.16,
    ambient: { sky: 0x000000, ground: 0x000000, intensity: 0.02 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 99, pointLights: 0, dark: true, rooms: 5,
    props: { crate: 3 },
    flashlightNote: true,
    entity: { name: '听风者', look: 'crawler', speedPatrol: 1.8, speedChase: 4.4, sightRange: 3, hearingRange: 17, catchRange: 1.2, deathText: '这里没有光，也没有眼睛。只有耳朵——你的脚步就是它的路标。' },
    hint: '绝对黑暗。它看不见你，但听得见你跑动的每一步',
    introText: '这里的灯从未亮过。关掉手电筒屏住呼吸，你几乎能感到它从身边走过。',
    exits: [
      { kind: 'door', to: 4 },
      { kind: 'hole', to: 6 },
      { kind: 'glitch', to: 9 },
    ],
  },
  {
    id: 6, name: 'LEVEL 6 · 水淹隧道', short: '水淹隧道',
    size: 25, wallH: 2.8,
    fogColor: 0x04080c, fogDensity: 0.085,
    ambient: { sky: 0x1e3038, ground: 0x06090c, intensity: 0.26 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 4, rooms: 5, water: true, drip: true,
    props: { barrel: 6, pipeCol: 8, pallet: 3 },
    entity: null, shadowEvent: true,
    hint: '齐踝深的黑水。安静得只剩滴水声……通常是这样',
    introText: '冰冷的黑水没过脚踝。远处偶尔传来落水声——希望那只是水滴。',
    exits: [
      { kind: 'pipe', to: 2 },
      { kind: 'door', to: 7 },
      { kind: 'glitch', to: 3 },
      { kind: 'door', to: 12 },
    ],
  },
  {
    id: 7, name: 'LEVEL 7 · 荒芜矿洞', short: '荒芜矿洞',
    size: 26, wallH: 3.4,
    fogColor: 0x0c0906, fogDensity: 0.075,
    ambient: { sky: 0x4a3c28, ground: 0x140f08, intensity: 0.3 },
    textures: { wall: 'dirtWall', floor: 'rockFloor', ceil: 'dirtWall' },
    lampsEvery: 5, pointLights: 4, rooms: 6, braid: 0.2,
    props: { crate: 5, barrel: 3, pallet: 4, pipeCol: 6 }, shadowEvent: true,
    hint: '支撑木在头顶呻吟。矿工们挖穿了什么，就再也没回去',
    introText: '木质支架撑起摇摇欲坠的坑道。墙上刻着歪歪扭扭的正字计数——不知道在数什么。',
    exits: [
      { kind: 'hole', to: 6 },
      { kind: 'door', to: 8 },
      { kind: 'pipe', to: 1 },
      { kind: 'glitch', to: 14 },
    ],
  },
  {
    id: 8, name: 'LEVEL 8 · 无尽仓库', short: '无尽仓库',
    size: 27, wallH: 4.2,
    fogColor: 0x0b0b0d, fogDensity: 0.055,
    ambient: { sky: 0x555a60, ground: 0x181a1d, intensity: 0.34 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 5, rooms: 3, pillars: true, platformH: 2.0,
    props: { shelf: 14, crate: 6, barrel: 4, locker: 3 },
    entity: { name: '守仓人', look: 'wraith', speedPatrol: 2.2, speedChase: 4.2, sightRange: 15, hearingRange: 11, catchRange: 1.15, deathText: '货架间的通道会重新排列。而它记得每一条你走过的路。' },
    hint: '高耸的货架构成峡谷。高处平台有货物堆成的天梯',
    introText: '十几米高的货架一眼望不到头。有人说登上顶层平台能看到仓库的边缘——也有人说看到的东西不该看。',
    exits: [
      { kind: 'glitch', to: 2 },
      { kind: 'door', to: 9 },
      { kind: 'elevator', to: 11, note: '货梯：直达最深处的白色空间' },
    ],
  },
  {
    id: 9, name: 'LEVEL 9 · 白色病房', short: '白色病房',
    size: 24, wallH: 2.9,
    fogColor: 0x101210, fogDensity: 0.065,
    ambient: { sky: 0x9aa89a, ground: 0x2c332c, intensity: 0.5 },
    textures: { wall: 'tileWall', floor: 'tileFloor', ceil: 'ceiling' },
    lampsEvery: 3, pointLights: 4, rooms: 6,
    props: { bed: 6, desk: 4, locker: 5, chair: 4, plant: 3 },
    flickerHeavy: true,
    entity: { name: '无脸护士', look: 'stalker', speedPatrol: 2.0, speedChase: 4.0, sightRange: 12, hearingRange: 12, catchRange: 1.15, deathText: '"别担心，这只是常规检查。"——它没有脸，但你知道它在笑。' },
    hint: '消毒水的气味。闪烁的灯管下，病床好像比刚才多了一张',
    introText: '白色的走廊无限延伸。探视时间早就结束了，但查房还在继续。',
    exits: [
      { kind: 'door', to: 3 },
      { kind: 'glitch', to: 5 },
      { kind: 'elevator', to: 8 },
    ],
  },
  {
    id: 10, name: 'LEVEL 10 · 深红警报', short: '深红警报',
    size: 21, wallH: 2.8,
    fogColor: 0x1c0606, fogDensity: 0.075,
    ambient: { sky: 0x661e1a, ground: 0x260908, intensity: 0.4 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 3, alarm: true, braid: 0.35, rooms: 3,
    props: { barrel: 6, crate: 6, chair: 3 },
    adrenaline: 5, siren: true,
    entity: { name: '暴走者', look: 'wraith', speedPatrol: 3.0, speedChase: 4.6, sightRange: 999, hearingRange: 999, catchRange: 1.15, alwaysChase: true, nearStart: true, deathText: '它不知疲倦。下一次，用上肾上腺素，别跑直线。' },
    hint: '<b>跑！</b>不要停下。白门就在某处',
    introText: '避难通道的警报响了。整层都醒了——它正在你身后。<b>别停下。</b>',
    exits: [
      { kind: 'lightdoor', to: 11, glowName: '白光之门' },
      { kind: 'pipe', to: 4 },
      { kind: 'hole', to: 1 },
    ],
  },
  {
    id: 11, name: 'LEVEL ∞ · 白色虚空', short: '白色虚空',
    size: 19, wallH: 3.6,
    fogColor: 0xe8e8e2, fogDensity: 0.03,
    ambient: { sky: 0xffffff, ground: 0xccccc4, intensity: 0.95 },
    textures: { wall: 'whiteVoidA', floor: 'whiteVoidB', ceil: 'whiteVoidC' },
    lampsEvery: 99, pointLights: 2, rooms: 4,
    props: {},
    noDust: true,
    entity: null,
    hint: '一切都很亮、很静。中央的光之门是唯一的出口',
    introText: '没有墙纸，没有嗡嗡声，没有实体。只有纯白的寂静——以及一扇发光的门。',
    exits: [
      { kind: 'lightdoor', to: -1, ending: true, glowName: '逃出后室' },
      { kind: 'glitch', to: 0 },
    ],
  },
  {
    id: 12, name: 'LEVEL 37 · 泳池房间', short: '泳池房间',
    size: 25, wallH: 3.4,
    fogColor: 0xd8e8e6, fogDensity: 0.045,
    ambient: { sky: 0xeafaf6, ground: 0x9fc8c0, intensity: 0.85 },
    textures: { wall: 'tileWall', floor: 'tileFloor', ceil: 'tileWall' },
    lampsEvery: 4, pointLights: 5, rooms: 7, braid: 0.3,
    props: { plant: 3, chair: 2 },
    water: true, poolrooms: true,
    entity: null,
    hint: '鸽笼般安静的泳池。水声不像是回声，倒像有什么在模仿水声',
    introText: '无尽的白瓷砖与浅水池。阳光不知道从哪里来，但处处都是波光。这里是少数没有“它们”的地方。',
    exits: [
      { kind: 'door', to: 6 },
      { kind: 'door', to: 14 },
      { kind: 'glitch', to: 9 },
    ],
  },
  {
    id: 13, name: 'LEVEL 13 · 垂直公寓', short: '垂直公寓',
    size: 23, wallH: 2.9, stories: 3, storyH: 3.8,
    fogColor: 0x12100c, fogDensity: 0.06,
    ambient: { sky: 0x8a7a5a, ground: 0x2a241a, intensity: 0.38 },
    textures: { wall: 'hotelWall', floor: 'redCarpet', ceil: 'woodCeil' },
    lampsEvery: 3, pointLights: 5, rooms: 5, braid: 0.14,
    props: { bed: 4, locker: 3, desk: 3, plant: 2 },
    adrenaline: 1,
    entity: { name: '房东', look: 'stalker', speedPatrol: 2.0, speedChase: 4.2, sightRange: 15, hearingRange: 14, catchRange: 1.15, deathText: '房租到期了。它收走了你的一切，包括尖叫的权限。' },
    hint: '天梯通向楼上。每一层都一模一样——除了它也在爬楼',
    introText: '永远在装修中的公寓楼。天梯摇摇晃晃地通向黑暗的楼上。<b>它在楼层间巡逻。</b>',
    exits: [
      { kind: 'door', to: 3 },
      { kind: 'elevator', to: 8 },
      { kind: 'pipe', to: 5 },
    ],
  },
  {
    id: 14, name: 'LEVEL 11 · 灰色城区', short: '灰色城区',
    size: 27, wallH: 4.4,
    fogColor: 0x8d9296, fogDensity: 0.05,
    ambient: { sky: 0xb8bfc4, ground: 0x4a4f52, intensity: 0.55 },
    textures: { wall: 'concreteWall', floor: 'concreteWall', ceil: 'garageCeil' },
    lampsEvery: 5, pointLights: 4, rooms: 4, braid: 0.28, pillars: true,
    props: { barrel: 8, crate: 7, pallet: 5, shelf: 4 },
    platformH: 2.0,
    entity: { name: '守夜人', look: 'wraith', speedPatrol: 2.2, speedChase: 4.35, sightRange: 18, hearingRange: 11, catchRange: 1.15, deathText: '守夜人从不说晚安。他只负责让你永远留在夜里。' },
    hint: '开阔得反常。雾墙之外什么都没有——别试图验证这件事',
    introText: '灰色混凝土构成的巨大街区状空间。这里太开阔了，开阔到让人想找个柜子躲起来。',
    exits: [
      { kind: 'door', to: 12 },
      { kind: 'glitch', to: 15 },
      { kind: 'hole', to: 7 },
    ],
  },
  {
    id: 15, name: 'LEVEL Fun · 派对间 =)', short: '派对间',
    size: 21, wallH: 3.0,
    fogColor: 0x2a1620, fogDensity: 0.06,
    ambient: { sky: 0xff9ad5, ground: 0x5a2440, intensity: 0.45 },
    textures: { wall: 'wallpaper', floor: 'carpet', ceil: 'ceiling' },
    lampsEvery: 3, pointLights: 4, rooms: 5, braid: 0.22,
    props: { crate: 4, barrel: 3 },
    partyLights: true, adrenaline: 2,
    entity: { name: '派对宾客', look: 'stalker', speedPatrol: 2.4, speedChase: 4.25, sightRange: 16, hearingRange: 15, catchRange: 1.15, nearStart: true, deathText: '=) =) =) =) =)\n派对永不散场。现在你也是其中之一了。' },
    hint: '彩灯、气球、蛋糕味。宾客们很想让你加入——<b>永久地</b>',
    introText: '=) 欢迎来到派对间！彩灯转啊转，音乐停不了。宾客们已经等你很久很久啦 =)',
    exits: [
      { kind: 'door', to: 14 },
      { kind: 'hole', to: 10 },
      { kind: 'glitch', to: 2 },
    ],
  },

  /* ================= v2.2 新增层级 16-23 ================= */
  {
    id: 16, name: 'LEVEL 16 · 消防楼梯间', short: '楼梯间',
    size: 19, wallH: 3.4,
    fogColor: 0x1a0d0d, fogDensity: 0.075,
    ambient: { sky: 0xff6a4a, ground: 0x331111, intensity: 0.5 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 6, pointLights: 3, rooms: 4, braid: 0.3,
    props: { barrel: 5, crate: 3 },
    goal: '沿楼梯间向下，找到通往图书馆的门',
    hint: '红色应急灯永远亮着。这里听不到任何脚步声——<b>这不正常</b>',
    introText: '无尽向下的消防楼梯。应急灯把一切染成铁锈色。安静得能听见自己的心跳。',
    exits: [
      { kind: 'door', to: 17 },
      { kind: 'pipe', to: 0 },
      { kind: 'hole', to: 18 },
    ],
  },
  {
    id: 17, name: 'LEVEL 17 · 无尽图书馆', short: '图书馆',
    size: 27, wallH: 3.6,
    fogColor: 0x171310, fogDensity: 0.05,
    ambient: { sky: 0xd8c9a0, ground: 0x403422, intensity: 0.42 },
    textures: { wall: 'officeWall', floor: 'officeFloor', ceil: 'ceiling' },
    lampsEvery: 5, pointLights: 4, rooms: 8, braid: 0.12,
    layout: 'rooms',
    props: { shelf: 14, crate: 2 },
    landmark: 'booktower', bottle: 3,
    entity: { name: '书虫', look: 'crawler', speedPatrol: 1.7, speedChase: 3.6, sightRange: 12, hearingRange: 17, catchRange: 1.05, deathText: '书虫把你钉进了书脊之间。\n从此这座图书馆多了一本会呼吸的书。' },
    goal: '在书架迷宫中找到检修门',
    hint: '亿万本书，没有一本是重复的。<b>翻动声来自你身后</b>',
    introText: '纸页的霉味。书架高得看不见顶。据说走完所有过道的人，都成了藏书的一部分。',
    exits: [
      { kind: 'door', to: 18 },
      { kind: 'door', to: 4 },
    ],
  },
  {
    id: 18, name: 'LEVEL 18 · 废弃地铁站', short: '地铁站',
    size: 25, wallH: 3.8,
    fogColor: 0x0d1210, fogDensity: 0.085,
    ambient: { sky: 0x7ab890, ground: 0x14261c, intensity: 0.38 },
    textures: { wall: 'tileWall', floor: 'tileFloor', ceil: 'pipeWall' },
    lampsEvery: 7, pointLights: 4, rooms: 5, braid: 0.24,
    layout: 'grid', water: true, drip: true,
    landmark: 'train', bottle: 3,
    props: { barrel: 4, crate: 3, shelf: 2 },
    entity: { name: '地铁鼠群', look: 'crawler', speedPatrol: 2.6, speedChase: 4.4, sightRange: 11, hearingRange: 20, catchRange: 1.0, deathText: '潮水般的老鼠漫过你的脚踝、膝盖、胸口……\n站台的末班车永远不会来了。' },
    goal: '找到站台尽头的检修通道',
    hint: '轨道里有水滴声。<b>那不是水</b>——扔个瓶子听听它往哪跑',
    introText: '积水倒映着频闪的灯管。列车时刻表停在三十年前。隧道深处有细密的爪音。',
    exits: [
      { kind: 'hole', to: 19 },
      { kind: 'glitch', to: 7 },
      { kind: 'door', to: 2 },
    ],
  },
  {
    id: 19, name: 'LEVEL -1 · 停尸间', short: '停尸间',
    size: 19, wallH: 3.0,
    dark: true, fogColor: 0x000000, fogDensity: 0.16,
    ambient: { sky: 0x223333, ground: 0x001111, intensity: 0.16 },
    textures: { wall: 'tileWall', floor: 'tileFloor', ceil: 'tileWall' },
    lampsEvery: 9, pointLights: 2, rooms: 6, braid: 0.15,
    layout: 'rooms',
    landmark: 'morgue', bottle: 2,
    entity: { name: '抽屉里的东西', look: 'wraith', speedPatrol: 2.0, speedChase: 4.6, sightRange: 8, hearingRange: 22, catchRange: 1.0, deathText: '抽屉缓缓合上。\n标签栏写看你的名字——字迹是你自己的。' },
    goal: '别出声。找到通风管道爬出去',
    hint: '手电筒是唯一的 光源。<b>有些抽屉是虚掩的</b>——不要靠近看',
    introText: '冷气、福尔马林、金属。墙上密密麻麻全是抽屉。你数到第一百个时，有一个自己开了。',
    exits: [
      { kind: 'pipe', to: 20 },
      { kind: 'door', to: 5 },
    ],
  },
  {
    id: 20, name: 'LEVEL 20 · 温室花园', short: '温室',
    size: 23, wallH: 4.2,
    fogColor: 0x14210f, fogDensity: 0.04,
    ambient: { sky: 0xaaffcc, ground: 0x1e3a1e, intensity: 0.62 },
    textures: { wall: 'wallpaper', floor: 'carpet', ceil: 'ceiling' },
    lampsEvery: 6, pointLights: 3, rooms: 6, braid: 0.28,
    landmark: 'garden', bottle: 3,
    props: { crate: 2, barrel: 2 },
    safe: true,
    goal: '给配电箱供电，启动温室电梯',
    hint: '花香、鸟鸣（假的）、阳光（假的）。<b>这里是后室里唯一的绿洲</b>，好好休息',
    introText: '玻璃穹顶漏下斑驳的光。植物疯长，藤蔓缠住了长椅。难得的、可以呼吸的地方。',
    exits: [
      { kind: 'elevator', needsPower: true, to: 21, label: '🛗 乘温室货梯下降' },
      { kind: 'door', to: 3 },
    ],
  },
  {
    id: 21, name: 'LEVEL 21 · 数据中心', short: '数据中心',
    size: 25, wallH: 3.6,
    fogColor: 0x010814, fogDensity: 0.07,
    ambient: { sky: 0x4488ff, ground: 0x0a1430, intensity: 0.35 },
    textures: { wall: 'metal', floor: 'wetFloor', ceil: 'metal' },
    lampsEvery: 5, pointLights: 4, rooms: 4, braid: 0.2,
    pillars: true, layout: 'halls', electricHum: true,
    landmark: 'server', bottle: 3,
    entity: { name: '信号幽灵', look: 'wraith', speedPatrol: 2.3, speedChase: 4.5, sightRange: 14, hearingRange: 16, catchRange: 1.1, deathText: '最后一行日志：\n[ERROR] 访客 #4741 已归档。' },
    goal: '拿到管理员卡，通过安全门',
    hint: '机柜蓝光闪烁如星海。<b>电流嗡鸣突然停止时，屏住呼吸</b>',
    introText: '服务器机柜延伸至视野尽头，蓝色 LED 如星海明灭。这里的温度常年十八度。',
    exits: [
      { kind: 'door', lock: 'keycard', to: 22 },
      { kind: 'hole', to: 8 },
    ],
  },
  {
    id: 22, name: 'LEVEL 22 · 白色风暴', short: '白色风暴',
    size: 23, wallH: 3.2,
    fogColor: 0xdddddd, fogDensity: 0.14,
    ambient: { sky: 0xffffff, ground: 0xbbbbbb, intensity: 0.95 },
    textures: { wall: 'whiteVoid', floor: 'whiteVoid', ceil: 'whiteVoid' },
    lampsEvery: 8, pointLights: 1, rooms: 3, braid: 0.4,
    windStorm: true, safe: true,
    goal: '在白茫茫的风暴中找到裂缝',
    hint: '能见度三米。<b>跟着风声走</b>，裂缝处风声会变调',
    introText: '白。除了白还是白。狂风卷着灰烬般的碎屑。你怀疑这个世界只剩你一个人了。',
    exits: [
      { kind: 'glitch', to: 23 },
      { kind: 'door', to: 11 },
    ],
  },
  {
    id: 23, name: 'LEVEL 23 · 镜像大厅', short: '镜像大厅',
    size: 23, wallH: 4.0,
    fogColor: 0x101418, fogDensity: 0.06,
    ambient: { sky: 0xbfd4e0, ground: 0x1a222a, intensity: 0.5 },
    textures: { wall: 'hotelWall', floor: 'redCarpet', ceil: 'ceiling' },
    lampsEvery: 4, pointLights: 4, rooms: 4, braid: 0.18,
    layout: 'halls', water: true,
    landmark: 'mirror', bottle: 2,
    props: { table: 4, chair: 3 },
    entity: { name: '镜中人', look: 'stalker', speedPatrol: 2.2, speedChase: 4.35, sightRange: 18, hearingRange: 13, catchRange: 1.1, nearStart: false, deathText: '镜子里的你笑了。\n然后它从里面走了出来。' },
    goal: '穿过大厅，找到回到派对间的门',
    hint: '浅浅的积水像镜面一样。<b>倒影比你多了一个人时，别回头验证</b>',
    introText: '对称到诡异的大厅。每一根柱子、每一盏灯都在积水中有个完美的倒影。几乎完美。',
    exits: [
      { kind: 'door', to: 15 },
      { kind: 'glitch', to: 0 },
    ],
  },
];

/* v2.2 各层级地形布局分配（打破同质迷宫） */
const LEVEL_LAYOUTS = {
  0: 'halls',     // 黄色大厅：中庭+环廊
  1: 'maze',      // 车库：传统迷宫+高台
  2: 'organic',   // 管道长廊：洞穴式
  3: 'rooms',     // 办公室：密集房间群
  4: 'rooms',     // 酒店：客房群
  5: 'maze',
  6: 'organic',   // 水淹隧道
  7: 'organic',   // 矿洞
  8: 'halls',     // 仓库大厅
  9: 'rooms',     // 病房
  10: 'maze',
  11: 'halls',    // 白色虚空
  12: 'grid',     // 泳池：格状泳池区
  13: 'rooms',    // 垂直公寓
  14: 'grid',     // 城区街区
  15: 'halls',    // 派对大厅
};

/* 挖洞/楼梯等高度数据 */
// floorMap 值：>=0 为该格地面高度；-999 表示破洞（坠落）

/* ---------- 迷宫生成（多布局） ---------- */

/** 房间群布局：BSP 式密集小房间+门洞（酒店/公寓/图书馆感） */
function genRoomsLayout(rng, W, H, opts) {
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(1));
  const rooms = [];
  const split = (x0, y0, x1, y1, depth) => {
    const w = x1 - x0, h = y1 - y0;
    if (depth >= 4 || (w < 9 && h < 9) || rng.next() < 0.12) {
      // 叶节点：开房间，留 1 格外墙
      const rw = Math.max(3, w - rng.int(1, 2)), rh = Math.max(3, h - rng.int(1, 2));
      const rx = x0 + rng.int(1, Math.max(1, w - rw - 1));
      const ry = y0 + rng.int(1, Math.max(1, h - rh - 1));
      for (let y = ry; y < ry + rh && y < H - 1; y++)
        for (let x = rx; x < rx + rw && x < W - 1; x++) g[y][x] = 0;
      rooms.push({ x: rx, y: ry, w: rw, h: rh });
      return { cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
    }
    let a, b;
    if (w > h) {
      const mx = x0 + (w >> 1);
      a = split(x0, y0, mx, y1, depth + 1);
      b = split(mx, y0, x1, y1, depth + 1);
      // 门洞连接两半
      const dy = Math.min(Math.max(a.cy, y0 + 2), y1 - 2);
      for (let x = mx - 1; x <= mx + 1; x++) if (x > 0 && x < W - 1) g[dy][x] = 0;
    } else {
      const my = y0 + (h >> 1);
      a = split(x0, y0, x1, my, depth + 1);
      b = split(x0, my, x1, y1, depth + 1);
      const dx = Math.min(Math.max(a.cx, x0 + 2), x1 - 2);
      for (let y = my - 1; y <= my + 1; y++) if (y > 0 && y < H - 1) g[y][dx] = 0;
    }
    return { cx: (a.cx + b.cx) >> 1, cy: (a.cy + b.cy) >> 1 };
  };
  split(1, 1, W - 2, H - 2, 0);
  // 保证连通：相邻房间链式打通
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    let x = a.x + (a.w >> 1), y = a.y + (a.h >> 1);
    const tx = b.x + (b.w >> 1), ty = b.y + (b.h >> 1);
    while (x !== tx) { x += Math.sign(tx - x); g[y][x] = 0; }
    while (y !== ty) { y += Math.sign(ty - y); g[y][x] = 0; }
  }
  g[1][1] = 0; g[1][2] = 0; g[2][1] = 0;
  return { grid: g, rooms };
}

/** 大厅布局：中央巨型开阔空间+环形走廊+放射支路（仓库/中庭感） */
function genHallsLayout(rng, W, H, opts) {
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(1));
  const cx0 = W >> 1, cy0 = H >> 1;
  const hw = (W * 0.28) | 0, hh = (H * 0.28) | 0;
  // 中央大厅
  for (let y = cy0 - hh; y <= cy0 + hh; y++) for (let x = cx0 - hw; x <= cx0 + hw; x++)
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y][x] = 0;
  // 环形走廊
  const ringR = Math.min(W, H) * 0.38 | 0;
  const steps = 48;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const px = (cx0 + Math.cos(a) * ringR) | 0, py = (cy0 + Math.sin(a) * ringR) | 0;
    if (px > 0 && py > 0 && px < W - 1 && py < H - 1) { g[py][px] = 0; pts.push([px, py]); }
  }
  // 放射支路 + 环与大厅连接
  for (const [px, py] of pts) {
    if (rng.next() < 0.14) {
      let x = px, y = py;
      while (x !== cx0) { x += Math.sign(cx0 - x); g[y][x] = 0; }
      while (y !== cy0) { y += Math.sign(cy0 - y); g[y][x] = 0; }
    }
  }
  let x = cx0, y = cy0 + hh;
  while (y !== cy0 + ringR && y < H - 1) { y++; g[y][x] = 0; }
  // 大厅内柱阵
  if (opts.pillars) {
    for (let y = cy0 - hh + 2; y < cy0 + hh - 1; y += 3)
      for (let x = cx0 - hw + 2; x < cx0 + hw - 1; x += 3)
        if (rng.next() < 0.55) g[y][x] = 1;
  }
  // 外围小房间
  const rooms = [{ x: cx0 - hw, y: cy0 - hh, w: hw * 2, h: hh * 2 }];
  for (let i = 0; i < (opts.rooms || 4); i++) {
    const rw = rng.int(3, 5), rh = rng.int(3, 5);
    const rx = rng.int(1, W - rw - 2), ry = rng.int(1, H - rh - 2);
    for (let yy = ry; yy < ry + rh; yy++) for (let xx = rx; xx < rx + rw; xx++) g[yy][xx] = 0;
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
    // 接入环廊
    let bx = rx + (rw >> 1), by = ry + (rh >> 1);
    while (bx !== cx0) { bx += Math.sign(cx0 - bx); g[by][bx] = 0; }
    while (by !== cy0) { by += Math.sign(cy0 - by); g[by][bx] = 0; }
  }
  g[1][1] = 0; g[1][2] = 0; g[2][1] = 0;
  return { grid: g, rooms };
}

/** 街区网格布局：横竖街道切出街区，部分街区有内院（城区/地铁站感） */
function genGridLayout(rng, W, H, opts) {
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(1));
  const blockW = 6, blockH = 6;
  for (let by = 0; by < H; by += blockH)
    for (let bx = 0; bx < W; bx += blockW)
      for (let y = by; y < Math.min(by + blockH, H); y++)
        for (let x = bx; x < Math.min(bx + blockW, W); x++) {
          const edgeX = (x === bx || x === Math.min(bx + blockW, W) - 1);
          const edgeY = (y === by || y === Math.min(by + blockH, H) - 1);
          g[y][x] = (edgeX || edgeY) ? 0 : (rng.next() < 0.82 ? 1 : 0);
        }
  // 随机拆几段街墙形成路口
  for (let i = 0; i < W * H / 30; i++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    g[y][x] = 0;
  }
  const rooms = [{ x: 1, y: 1, w: blockW, h: blockH }];
  g[1][1] = 0; g[1][2] = 0; g[2][1] = 0;
  return { grid: g, rooms };
}

/** 洞穴有机布局：多随机游走者雕出不规则腔室（矿洞/隧道感） */
function genOrganicLayout(rng, W, H, opts) {
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(1));
  const walkers = 5 + (opts.rooms || 4);
  for (let wi = 0; wi < walkers; wi++) {
    let x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    const len = rng.int(40, 90);
    for (let s = 0; s < len; s++) {
      const r = rng.int(0, 2);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) g[ny][nx] = 0;
      }
      if (rng.next() < 0.65) x += rng.pick([-1, 0, 1]);
      if (rng.next() < 0.65) y += rng.pick([-1, 0, 1]);
      x = U.clamp(x, 2, W - 3); y = U.clamp(y, 2, H - 3);
    }
  }
  // 连通性保障：从出生点 BFS，把孤立区打通到主区
  let field = bfsField(g, 1, 1);
  for (let pass = 0; pass < 6; pass++) {
    let fixed = true;
    outer:
    for (let y = 2; y < H - 1; y++) for (let x = 2; x < W - 1; x++) {
      if (g[y][x] === 0 && field[y][x] === -1) {
        fixed = false;
        let tx = x, ty = y;
        while (field[ty][tx] === -1 && tx > 1) { tx--; g[ty][tx] = 0; }
        while (field[ty][tx] === -1 && ty > 1) { ty--; g[ty][tx] = 0; }
        break outer;
      }
    }
    if (fixed) break;
    field = bfsField(g, 1, 1);
  }
  const rooms = [{ x: 1, y: 1, w: 5, h: 5 }];
  g[1][1] = 0; g[1][2] = 0; g[2][1] = 0;
  return { grid: g, rooms };
}

/** 连通性保障：从出生点 BFS，把所有孤立开放区打通到主区 */
function ensureConnected(g, W, H) {
  let field = bfsField(g, 1, 1);
  let guard = 0;
  while (guard++ < 50) {
    let tx = -1, ty = -1;
    outer:
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[y][x] === 0 && field[y][x] === -1) { tx = x; ty = y; break outer; }
    }
    if (tx < 0) break;
    let x = tx, y = ty;
    while (x > 1) { x--; g[y][x] = 0; }
    while (y > 1) { y--; g[y][x] = 0; }
    field = bfsField(g, 1, 1);
  }
}

function genMap(rng, W, H, opts) {
  let res;
  switch (opts.layout) {
    case 'rooms': res = genRoomsLayout(rng, W, H, opts); break;
    case 'halls': res = genHallsLayout(rng, W, H, opts); break;
    case 'grid': res = genGridLayout(rng, W, H, opts); break;
    case 'organic': res = genOrganicLayout(rng, W, H, opts); break;
    default:
      res = null;
  }
  if (res) {
    ensureConnected(res.grid, W, H);
    return res;
  }
  const g = [];
  for (let y = 0; y < H; y++) { g.push(new Array(W).fill(1)); }
  const at = (x, y) => g[y][x];
  const set = (x, y, v) => { g[y][x] = v; };

  // 1. DFS 挖迷宫（步长2）
  const stack = [[1, 1]];
  set(1, 1, 0);
  const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const cand = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && at(nx, ny) === 1) cand.push([dx, dy]);
    }
    if (cand.length) {
      const [dx, dy] = rng.pick(cand);
      set(cx + dx / 2, cy + dy / 2, 0);
      set(cx + dx, cy + dy, 0);
      stack.push([cx + dx, cy + dy]);
    } else stack.pop();
  }

  // 2. 打通部分死路（环路）
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (at(x, y) === 1 && rng.next() < (opts.braid || 0.12)) {
      if ((at(x - 1, y) === 0 && at(x + 1, y) === 0) || (at(x, y - 1) === 0 && at(x, y + 1) === 0)) set(x, y, 0);
    }
  }

  // 3. 开辟房间
  const rooms = [];
  for (let i = 0; i < (opts.rooms || 5); i++) {
    const rw = rng.int(3, 5), rh = rng.int(3, 5);
    const rx = rng.int(1, W - rw - 2), ry = rng.int(1, H - rh - 2);
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) set(x, y, 0);
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }

  // 4. 大房间里加柱子
  if (opts.pillars) {
    for (const r of rooms) {
      if (r.w >= 4 && r.h >= 4 && rng.next() < 0.75) {
        for (let y = r.y + 1; y < r.y + r.h - 1; y += 2)
          for (let x = r.x + 1; x < r.x + r.w - 1; x += 2)
            if (rng.next() < 0.8) set(x, y, 1);
      }
    }
  }

  // 保证出生点周围畅通
  set(1, 1, 0); set(1, 2, 0); set(2, 1, 0);
  return { grid: g, rooms };
}

/** BFS 距离场 */
function bfsField(grid, sx, sy) {
  const H = grid.length, W = grid[0].length;
  const dist = Array.from({ length: H }, () => new Array(W).fill(-1));
  const q = [[sx, sy]];
  dist[sy][sx] = 0;
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    const d = dist[y][x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[ny][nx] === 0 && dist[ny][nx] === -1) {
        dist[ny][nx] = d + 1;
        q.push([nx, ny]);
      }
    }
  }
  return dist;
}

/* ---------- 几何合并 ---------- */
function mergeBoxes(boxes) {
  const pos = [], nor = [], uv = [];
  for (const b of boxes) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    geo.translate(b.x, b.y, b.z);
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const u = geo.attributes.uv.array;
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); }
    for (let i = 0; i < u.length; i += 2) { uv.push(u[i] + (b.uOff || 0), u[i + 1]); }
    geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function mergeGeoms(geos) {
  const pos = [], nor = [], uv = [];
  for (const geo of geos) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < n.length; i++) nor.push(n[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/* ================================================================
   Level 类
================================================================ */
class Level {
  constructor(cfg, seed) {
    this.cfg = cfg;
    cfg.layout = cfg.layout || LEVEL_LAYOUTS[cfg.id] || 'maze';   // v2.2 地形布局
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.group = null;
    this.grid = null;
    this.W = cfg.size; this.H = cfg.size;
    this.items = [];          // 可交互物/装置
    this.obstacles = [];      // 道具障碍 {x,z,r}
    this.exits = [];          // 传送装置运行时数据
    this.entitySpawn = null;
    this.playerStart = null;
    this.flickerMats = [];
    this.glitchMats = [];     // 裂缝材质（动画）
    this.pointLights = [];
    this.floorMap = null;     // Float32Array W*H 地面高度
    this.holeCells = [];      // {cx,cy,to}
    this.platformCells = new Set();
    this.stories = cfg.stories || 1;      // 楼层数（≥2 启用多层）
    this.storyH = cfg.storyH || 3.8;      // 层高
    this.layers = [];         // 上层楼層 [{y, cells:Set, holes:Set}]（s≥1）
    this.ladders = [];        // 天梯 {x,z,y0,y1}
    this.powerOn = !((cfg.id === 1));
    this.time = 0;
    this._lampPhase = Math.random() * 10;
  }

  cellToWorld(cx, cy) { return [(cx + 0.5) * CELL, (cy + 0.5) * CELL]; }
  worldToCell(x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; }
  isSolidCell(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return true;
    return this.grid[cy][cx] === 1;
  }
  isHoleCell(cx, cy) { return this.floorMap && this.floorMap[cy * this.W + cx] <= HOLE_DEPTH / 2; }

  /** 该点的支撑地面高度（多层：capY 缺省取最高层；传入参考高度则取 ≤capY 的最高层） */
  groundAt(x, z, capY) {
    const [cx, cy] = this.worldToCell(x, z);
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return 0;
    const i = cy * this.W + cx;
    let best = -Infinity;
    const g = this.floorMap[i];
    if (g > HOLE_DEPTH / 2) best = g;
    if (this.layers && this.layers.length)
      for (const L of this.layers)
        if (L.cells.has(i) && !L.holes.has(i)) best = Math.max(best, L.y);
    if (best === -Infinity) best = HOLE_DEPTH;
    if (capY != null && best > capY) {
      let b2 = -Infinity;
      if (g > HOLE_DEPTH / 2) b2 = g;
      if (this.layers && this.layers.length)
        for (const L of this.layers)
          if (L.cells.has(i) && !L.holes.has(i) && L.y <= capY) b2 = Math.max(b2, L.y);
      if (b2 === -Infinity) b2 = HOLE_DEPTH;
      return b2;
    }
    return best;
  }

  /** 该格头顶封闭面高度（灯贴其下方） */
  _ceilTopAt(cx, cy) {
    const i = cy * this.W + cx;
    let h = this.cfg.wallH;
    for (const L of this.layers) if (L.cells.has(i)) h = L.y + this.cfg.wallH;
    return h;
  }

  /** 圆形玩家与实心格碰撞检测（含道具障碍物） */
  circleHitsWall(x, z, r) {
    const minCx = Math.floor((x - r) / CELL), maxCx = Math.floor((x + r) / CELL);
    const minCy = Math.floor((z - r) / CELL), maxCy = Math.floor((z + r) / CELL);
    for (let cy = minCy; cy <= maxCy; cy++) for (let cx = minCx; cx <= maxCx; cx++) {
      if (!this.isSolidCell(cx, cy)) continue;
      const wx = U.clamp(x, cx * CELL, (cx + 1) * CELL);
      const wz = U.clamp(z, cy * CELL, (cy + 1) * CELL);
      if (U.dist2(x, z, wx, wz) < r * r) return true;
    }
    for (const o of this.obstacles) {
      const rr = r + o.r;
      if (U.dist2(x, z, o.x, o.z) < rr * rr) return true;
    }
    return false;
  }
  /** DDA 视线检测 */
  losClear(ax, az, bx, bz) {
    let [cx, cy] = this.worldToCell(ax, az);
    const [ex, ey] = this.worldToCell(bx, bz);
    const dx = bx - ax, dz = bz - az;
    const steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / (CELL * 0.4)) + 1;
    const px = dx / steps, pz = dz / steps;
    let x = ax, z = az;
    let lx = cx, lz = cy;
    for (let i = 0; i <= steps; i++) {
      const c = this.worldToCell(x, z);
      if (c[0] !== lx || c[1] !== lz) {
        if (this.isSolidCell(c[0], c[1])) return false;
        lx = c[0]; lz = c[1];
      }
      if (c[0] === ex && c[1] === ey) return true;
      x += px; z += pz;
    }
    return !this.isSolidCell(ex, ey);
  }

  /* ---------------- 构建 ---------------- */
  build(scene) {
    const cfg = this.cfg;
    const rng = this.rng;
    const { grid, rooms } = genMap(rng, this.W, this.H, {
      rooms: cfg.rooms != null ? cfg.rooms : 5,
      braid: cfg.braid || (cfg.id === 0 ? 0.1 : 0.16),
      pillars: !!cfg.pillars,
      layout: cfg.layout,
    });
    this.rooms = rooms;
    this.grid = grid;

    /* 高度图初始化 */
    this.floorMap = new Float32Array(this.W * this.H);

    const group = new THREE.Group();
    this.group = group;

    /* 材质 */
    const wallCanvas = cfg.textures.wall.startsWith('whiteVoid') ? Tex.whiteVoid('a') : Tex[cfg.textures.wall]();
    const wallTex = Tex.toTexture(wallCanvas);
    wallTex.encoding = THREE.sRGBEncoding;
    this.wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const floorTexBase = cfg.textures.floor.startsWith('whiteVoid') ? Tex.whiteVoid('f') : Tex[cfg.textures.floor]();
    const floorTex = Tex.toTexture(floorTexBase, this.W, this.H);
    floorTex.encoding = THREE.sRGBEncoding;
    this.floorMat = new THREE.MeshLambertMaterial({ map: floorTex });

    /* ---- 距离场与关键点 ---- */
    const field = bfsField(grid, 1, 1);
    this.playerStart = this.cellToWorld(1, 1);
    const empties = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++)
      if (grid[y][x] === 0 && field[y][x] > 0) empties.push({ x, y, d: field[y][x] });
    empties.sort((a, b) => b.d - a.d);
    this.empties = empties;

    /* ---- 高台 + 楼梯 ---- */
    if (cfg.platformH) this._buildPlatform(group, rooms);

    /* ---- 出口装置（含破洞） ---- */
    this._placeExits(group, empties);

    /* ---- 实体出生点（在装置之后选定，避开破洞/高台） ---- */
    if (cfg.entity) {
      const entOK = c => {
        const f = this.floorMap[c.y * this.W + c.x];
        return f > HOLE_DEPTH / 2 && f <= 0.5;
      };
      let cand = null;
      if (cfg.entity.nearStart) {
        const asc = empties.slice().reverse();
        cand = asc.find(c => c.d >= 4 && c.d <= 7 && entOK(c)) || asc.find(c => c.d >= 3 && entOK(c));
      } else {
        cand = empties.find(c => c.d >= 12 && entOK(c)) || empties.find(c => c.d >= 6 && entOK(c)) || empties.find(entOK);
      }
      if (!cand) cand = empties[Math.min(6, empties.length - 1)];
      this.entitySpawn = this.cellToWorld(cand.x, cand.y);
    }

    /* ---- 多层楼层（天梯互联）---- */
    if ((cfg.stories || 1) >= 2) this._buildStories(group);

    /* ---- 墙体（从 -2 到 wallH，覆盖坑洞侧壁） ---- */
    const wallBoxes = [];
    const upWallH = (cfg.stories >= 2 ? (cfg.stories - 1) * cfg.storyH : 0);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (grid[y][x] !== 1) continue;
      const [wx, wz] = this.cellToWorld(x, y);
      wallBoxes.push({ w: CELL, h: cfg.wallH + 2 + upWallH, d: CELL, x: wx, y: (cfg.wallH - 2 + upWallH) / 2, z: wz, uOff: rng.int(0, 3) });
    }
    group.add(new THREE.Mesh(mergeBoxes(wallBoxes), this.wallMat));

    /* ---- 地板：逐格合并（跳过破洞，支持高差） ---- */
    this._buildFloors(group);

    /* ---- 天花板：逐格合并（被上层楼板覆盖的格子跳过）---- */
    const worldW = this.W * CELL, worldH = this.H * CELL;
    const ceilTexKey = cfg.textures.ceil === 'dirtWall' ? Tex.dirtWall() : (cfg.textures.ceil === 'woodCeil' ? Tex.wood() : (cfg.textures.ceil === 'whiteVoidC' ? Tex.whiteVoid('c') : Tex[cfg.textures.ceil]()));
    const ceilMat = new THREE.MeshLambertMaterial({ map: Tex.toTexture(ceilTexKey) });
    const ceilBoxes = [];
    // 底层：开放格且无第一上层覆盖
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (grid[y][x] !== 0) continue;
      const i = y * this.W + x;
      if (this.layers.length && this.layers[0].cells.has(i)) continue;
      const [wx, wz] = this.cellToWorld(x, y);
      ceilBoxes.push({ w: CELL, h: 0.16, d: CELL, x: wx, y: cfg.wallH + 0.08, z: wz });
    }
    // 上层各层的顶（无更高层覆盖时）
    for (let s = 0; s < this.layers.length; s++) {
      const Ly = this.layers[s], above = this.layers[s + 1] || null;
      for (const i of Ly.cells) {
        if (Ly.holes.has(i)) continue;
        if (above && above.cells.has(i)) continue;
        const x = i % this.W, y = (i / this.W) | 0;
        const [wx, wz] = this.cellToWorld(x, y);
        ceilBoxes.push({ w: CELL, h: 0.16, d: CELL, x: wx, y: Ly.y + cfg.wallH + 0.08, z: wz });
      }
    }
    group.add(new THREE.Mesh(mergeBoxes(ceilBoxes), ceilMat));

    /* ---- 水面（水淹隧道 / 泳池 / 镜像大厅） ---- */
    if (cfg.water) {
      const pool = !!cfg.poolrooms;
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(worldW, worldH),
        new THREE.MeshLambertMaterial({
          color: pool ? 0x2a8a9a : (cfg.id === 23 ? 0x1a2832 : 0x0a1418),
          transparent: true, opacity: pool ? 0.5 : 0.62,
          emissive: pool ? 0x0a3040 : 0x000000,
        })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(worldW / 2, 0.16, worldH / 2);
      group.add(water);
      this.waterMesh = water;
    }

    /* ---- 物品放置 ---- */
    this._placeItems(group, empties, field);

    /* ---- 地标建筑（导航参照物） ---- */
    this._placeLandmark(group);

    /* ---- 场景道具 ---- */
    if (cfg.props) this._placeProps(group, empties);

    /* ---- 黑影彩蛋 ---- */
    if (cfg.shadowEvent) {
      const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.82, depthWrite: false });
      const sg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.45, 8), sm); body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), sm); head.position.y = 1.82;
      sg.add(body, head);
      sg.visible = false;
      group.add(sg);
      this.shadowFigure = sg;
      this.shadowTimer = 20 + this.rng.next() * 30;
      this.shadowActiveT = 0;
    }

    /* ---- 灯光 ---- */
    scene.add(new THREE.AmbientLight(0xffffff, cfg.dark ? 0.16 : 0.34));
    const hemi = new THREE.HemisphereLight(cfg.ambient.sky, cfg.ambient.ground, cfg.ambient.intensity);
    group.add(hemi);
    this.hemi = hemi;

    const partyCols = cfg.partyLights ? [0xff5ad0, 0x5aff8a, 0xffb85a, 0x5ab8ff] : null;
    const lampMatOn = new THREE.MeshBasicMaterial({ color: cfg.id === 12 ? 0xeafff8 : 0xfff2cc });
    const lampMatFlicker = new THREE.MeshBasicMaterial({ color: 0xffedb8 });
    this.flickerMats.push(lampMatFlicker);
    let li = 0;
    const lightSpots = [];
    for (let y = 1; y < this.H - 1; y += cfg.lampsEvery) for (let x = 1; x < this.W - 1; x += cfg.lampsEvery) {
      if (grid[y][x] !== 0) continue;
      const [wx, wz] = this.cellToWorld(x, y);
      const mat = partyCols ? new THREE.MeshBasicMaterial({ color: partyCols[li % 4] }) : ((li % 5 === 3) ? lampMatFlicker : lampMatOn);
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), mat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(wx, this._ceilTopAt(x, y) - 0.03, wz);
      group.add(lamp);
      lightSpots.push({ x: wx, z: wz, cx: x, cy: y });
      li++;
    }
    // 上层灯（稀疏）
    for (const Ly of this.layers) {
      let lu = 0;
      for (const i of Ly.cells) {
        if (Ly.holes.has(i)) continue;
        if (++lu % (cfg.lampsEvery + 3) !== 0) continue;
        const x = i % this.W, y = (i / this.W) | 0;
        const [wx, wz] = this.cellToWorld(x, y);
        const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), (lu % 7 === 5) ? lampMatFlicker : lampMatOn);
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(wx, Ly.y + cfg.wallH - 0.03, wz);
        group.add(lamp);
      }
    }
    const nPL = cfg.pointLights;
    for (let i = 0; i < Math.min(nPL, lightSpots.length); i++) {
      const s = lightSpots[Math.floor(i * lightSpots.length / nPL)];
      const pl = new THREE.PointLight(cfg.id === 0 ? 0xffe9b0 : (cfg.id === 11 ? 0xffffff : 0xcfe8ff), cfg.dark ? 0 : 0.55, 18, 1.6);
      pl.position.set(s.x, this._ceilTopAt(s.cx, s.cy) - 0.5, s.z);
      group.add(pl);
      this.pointLights.push(pl);
    }

    if (cfg.alarm) {
      this.alarmLights = [];
      const nAL = Math.min(4, lightSpots.length);
      for (let i = 0; i < nAL; i++) {
        const s = lightSpots[Math.floor(i * lightSpots.length / nAL)];
        const al = new THREE.PointLight(0xff2a1a, 0.8, 22, 1.4);
        al.position.set(s.x, this._ceilTopAt(s.cx, s.cy) - 0.4, s.z);
        group.add(al);
        this.alarmLights.push(al);
      }
    }

    /* ---- 尘埃粒子 ---- */
    if (!cfg.noDust) {
      const dustGeo = new THREE.BufferGeometry();
      const DN = 260;
      const dp = new Float32Array(DN * 3);
      for (let i = 0; i < DN; i++) {
        dp[i * 3] = rng.range(0, worldW);
        dp[i * 3 + 1] = rng.range(0.2, this.layers.length ? (this.layers.length) * cfg.storyH + cfg.wallH : cfg.wallH);
        dp[i * 3 + 2] = rng.range(0, worldH);
      }
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
      this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
        color: cfg.id === 11 ? 0xffffff : 0xbbaa88, size: 0.045, transparent: true, opacity: 0.45, sizeAttenuation: true, depthWrite: false,
      }));
      group.add(this.dust);
    }

    scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    scene.background = new THREE.Color(cfg.fogColor);
    this.sceneRef = scene;
    scene.add(group);
  }

  /* ---------------- 多层楼层与天梯 ---------------- */
  _buildStories(group) {
    const rng = this.rng, cfg = this.cfg;
    const S = cfg.stories, SH = cfg.storyH;
    // 上层区域：随机扩张出连通块（占开放格 ~52%），避开装置/出生点/高台/破洞
    const banned = new Set();
    for (const e of this.exits) { const [cx, cy] = this.worldToCell(e.x, e.z); banned.add(cy * this.W + cx); }
    {
      const [sx, sz] = this.playerStart; const [scx, scy] = this.worldToCell(sx, sz); banned.add(scy * this.W + scx);
    }
    let openN = 0;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++)
      if (this.grid[y][x] === 0 && this.floorMap[y * this.W + x] > HOLE_DEPTH / 2) openN++;
    if (openN < 30) { this.stories = 1; return; }
    const quota = Math.floor(openN * 0.52);
    const seedC = this.empties[0];
    const inUp = new Set([seedC.y * this.W + seedC.x]);
    const dq = [seedC.y * this.W + seedC.x];
    let guard = 0;
    while (inUp.size < quota && guard++ < 8000 && dq.length) {
      const i = dq[Math.floor(rng.next() * dq.length)];
      const x = i % this.W, y = (i / this.W) | 0;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let t = 0; t < 4 && inUp.size < quota; t++) {
        const [dx, dy] = dirs[Math.floor(rng.next() * 4)];
        const nx = x + dx, ny = y + dy, ni = ny * this.W + nx;
        if (nx < 1 || ny < 1 || nx >= this.W - 1 || ny >= this.H - 1) continue;
        if (this.grid[ny][nx] !== 0) continue;
        if (this.floorMap[ni] > 0.4 || this.floorMap[ni] <= HOLE_DEPTH / 2) continue;
        if (banned.has(ni) || inUp.has(ni)) continue;
        inUp.add(ni); dq.push(ni);
      }
    }
    // 楼层数据（生长完后再剔除禁用格）
    for (const i of [...inUp]) if (banned.has(i)) inUp.delete(i);
    if (inUp.size < 12) { this.stories = 1; this.layers = []; return; }
    this.layers = [];
    for (let s = 1; s < S; s++) this.layers.push({ y: s * SH, cells: new Set(inUp), holes: new Set() });

    // 天梯：每层间隙选若干贴墙格，井口穿透上方各层
    const railMat = new THREE.MeshLambertMaterial({ color: 0x3c4046 });
    const usedShafts = new Set();
    for (let t = 0; t < S - 1; t++) {
      const cand = [];
      for (const i of inUp) {
        if (usedShafts.has(i)) continue;
        const x = i % this.W, y = (i / this.W) | 0;
        // 顶端必须至少有一个同层相邻格供走出井口
        const hasUpNb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx2, dy2]) => {
          const nx = x + dx2, ny = y + dy2;
          if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) return false;
          return this.grid[ny][nx] === 0 && inUp.has(ny * this.W + nx);
        });
        if (!hasUpNb) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.isSolidCell(x + dx, y + dy)) { cand.push({ i, x, y, dx, dy }); break; }
        }
      }
      cand.sort(() => rng.next() - 0.5);
      const K = Math.min(S === 2 ? 3 : 4, cand.length);
      const picked = [];
      for (const c of cand) {
        if (picked.length >= K) break;
        if (picked.some(sp => Math.abs(sp.x - c.x) + Math.abs(sp.y - c.y) < 7)) continue;
        picked.push(c);
      }
      for (const sp of picked) {
        usedShafts.add(sp.i);
        const [wx, wz] = this.cellToWorld(sp.x, sp.y);
        const y0 = t * SH, y1 = (t + 1) * SH + 0.02;
        // 出口方向：指向某个同层相邻格中心（顶端/底端自动滑出用）
        let exd = null;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rng.next() - 0.5)) {
          const nx = sp.x + ddx, ny = sp.y + ddy;
          if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
          if (this.grid[ny][nx] === 0 && inUp.has(ny * this.W + nx)) { exd = [ddx, ddy]; break; }
        }
        if (!exd) continue;
        const lx = wx + sp.dx * (CELL / 2 - 0.26), lz = wz + sp.dy * (CELL / 2 - 0.26);
        const ecx = (sp.x + exd[0] + 0.5) * CELL, ecz = (sp.y + exd[1] + 0.5) * CELL;
        const vx = ecx - lx, vz = ecz - lz, vl = Math.sqrt(vx * vx + vz * vz) || 1;
        this.ladders.push({ x: lx, z: lz, y0, y1, ex: vx / vl, ez: vz / vl, scx: sp.x, scy: sp.y });
        this.layers[t].holes.add(sp.i);   // 井口：上层该格无楼板
        // 梯子网格：双轨 + 横档
        const lg = new THREE.Group();
        const cxp = lx, czp = lz;
        const tx = -sp.dy, tz = sp.dx;
        for (const sgn of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, SH + 0.55, 0.07), railMat);
          rail.position.set(cxp + tx * 0.24 * sgn, y0 + (SH + 0.55) / 2 - 0.12, czp + tz * 0.24 * sgn);
          lg.add(rail);
        }
        const nr = Math.ceil((SH + 0.2) / 0.38);
        for (let r2 = 0; r2 < nr; r2++) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(tx !== 0 ? 0.06 : 0.56, 0.05, tz !== 0 ? 0.06 : 0.56), railMat);
          rung.position.set(cxp, y0 + 0.28 + r2 * 0.38, czp);
          lg.add(rung);
        }
        group.add(lg);
      }
    }

    // 上层楼板 + 边缘护栏（随机留 2 个危险缺口）
    const slabMat = new THREE.MeshLambertMaterial({ map: Tex.toTexture(cfg.textures.ceil === 'dirtWall' ? Tex.dirtWall() : (cfg.textures.ceil === 'woodCeil' ? Tex.wood() : Tex[cfg.textures.ceil]())) });
    const slabBoxes = [], lipBoxes = [];
    const gapCells = new Set();
    {
      const edgeAll = [];
      for (const i of inUp) {
        const x = i % this.W, y = (i / this.W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
          if (this.grid[ny][nx] === 0 && !inUp.has(ny * this.W + nx)) { edgeAll.push(i); break; }
        }
      }
      edgeAll.sort(() => rng.next() - 0.5);
      for (const i of edgeAll.slice(0, 2)) gapCells.add(i);
    }
    for (const Ly of this.layers) {
      for (const i of Ly.cells) {
        if (Ly.holes.has(i)) continue;
        const x = i % this.W, y = (i / this.W) | 0;
        const [wx, wz] = this.cellToWorld(x, y);
        slabBoxes.push({ w: CELL, h: 0.3, d: CELL, x: wx, y: Ly.y - 0.15, z: wz });
        if (gapCells.has(i)) continue;   // 危险缺口：不加护栏
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
          if (!(this.grid[ny][nx] === 0 && !Ly.cells.has(ny * this.W + nx))) continue;
          lipBoxes.push({
            w: dx !== 0 ? 0.12 : CELL, h: 0.45, d: dx !== 0 ? CELL : 0.12,
            x: wx + dx * (CELL / 2 - 0.06), y: Ly.y + 0.225, z: wz + dy * (CELL / 2 - 0.06),
          });
        }
      }
    }
    group.add(new THREE.Mesh(mergeBoxes(slabBoxes), slabMat));
    group.add(new THREE.Mesh(mergeBoxes(lipBoxes), railMat));
  }

  /* ---------------- 高台与楼梯 ---------------- */
  _buildPlatform(group, rooms) {
    const rng = this.rng;
    const h = this.cfg.platformH;
    // 选离出生点最远的房间
    let best = null, bestScore = -1;
    for (const r of rooms) {
      const score = U.dist2(this.playerStart[0], this.playerStart[1], (r.x + r.w / 2) * CELL, (r.y + r.h / 2) * CELL);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (!best) return;
    // 抬高房间所有空格
    const raised = [];
    for (let y = best.y; y < best.y + best.h; y++) for (let x = best.x; x < best.x + best.w; x++) {
      if (this.grid[y][x] === 0) { this.floorMap[y * this.W + x] = h; this.platformCells.add(y * this.W + x); raised.push({ x, y }); }
    }
    // 从房间边缘向外找直线空地做楼梯（任意方向，每级高差 <= 0.5m）
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const order = dirs.slice().sort(() => rng.next() - 0.5);
    outer:
    for (const [dx, dy] of order) {
      for (const c of raised) {
        let sx2 = c.x + dx, sy2 = c.y + dy;
        if (this.isSolidCell(sx2, sy2)) continue;
        if (this.floorMap[sy2 * this.W + sx2] !== 0 || this.isHoleCell(sx2, sy2)) continue;
        // 沿此方向数连续可用空地
        const run = [];
        while (!this.isSolidCell(sx2, sy2) && this.floorMap[sy2 * this.W + sx2] === 0 && !this.isHoleCell(sx2, sy2)) {
          run.push({ x: sx2, y: sy2 });
          sx2 += dx; sy2 += dy;
        }
        if (run.length >= 2) {
          const n = run.length;
          // 贴平台的格子最高，向外逐级降低
          run.forEach((rc, idx) => {
            this.floorMap[rc.y * this.W + rc.x] = +(h * (n - idx) / (n + 1)).toFixed(3);
          });
          this._stairsBuilt = true;
          break outer;
        }
      }
    }
    // 兜底：在房间边缘放台阶（每级 <= 0.55m 保证可攀爬）
    if (!this._stairsBuilt) {
      outer2:
      for (const [dx, dy] of order) {
        for (const c of raised) {
          const nx2 = c.x + dx, ny2 = c.y + dy;
          if (this.isSolidCell(nx2, ny2)) continue;
          if (this.floorMap[ny2 * this.W + nx2] !== 0 || this.isHoleCell(nx2, ny2)) continue;
          const nx3 = nx2 + dx, ny3 = ny2 + dy;
          if (!this.isSolidCell(nx3, ny3) && this.floorMap[ny3 * this.W + nx3] === 0 && !this.isHoleCell(nx3, ny3)) {
            this.floorMap[ny2 * this.W + nx2] = Math.min(h * 2 / 3, 1.1);
            this.floorMap[ny3 * this.W + nx3] = Math.min(h / 3, 0.52);
            this._stairsBuilt = true;
          } else {
            this.floorMap[ny2 * this.W + nx2] = Math.min(h / 3, 0.52);
            this._stairsBuilt = true;
          }
          break outer2;
        }
      }
    }
  }

  /* ---------------- 地板逐格构建 ---------------- */
  _buildFloors(group) {
    const boxes = [];
    const pitMatsBoxes = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (this.grid[y][x] === 1) continue;
      const f = this.floorMap[y * this.W + x];
      if (f <= HOLE_DEPTH / 2) continue;   // 破洞：不铺地板
      const [wx, wz] = this.cellToWorld(x, y);
      boxes.push({ w: CELL, h: 0.5, d: CELL, x: wx, y: f - 0.25, z: wz });
    }
    group.add(new THREE.Mesh(mergeBoxes(boxes), this.floorMat));
    // 破洞下方深渊提示：极深的黑色盒底（防止看见天空色）
    if (this.holeCells.length) {
      const voidMat = new THREE.MeshBasicMaterial({ color: 0x010102 });
      for (const hc of this.holeCells) {
        const [wx, wz] = this.cellToWorld(hc.cx, hc.cy);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), voidMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(wx, -22, wz);
        group.add(m);
      }
    }
  }

  /* ---------------- 出口装置 ---------------- */
  _placeExits(group, empties) {
    const rng = this.rng;
    const chosen = [];
    const okCell = c => {
      if (c.d < 5) return false;
      if (this.isHoleCell(c.x, c.y)) return false;
      if (this.floorMap[c.y * this.W + c.x] > 0.4) return false;   // 装置不在高台上（破洞除外已排除）
      const key = c.y * this.W + c.x;
      if (this.platformCells.has(key)) return false;
      // 与已选装置保持距离
      for (const o of chosen) if (Math.abs(o.c.x - c.x) + Math.abs(o.c.y - c.y) < 8) return false;
      // 与出生点距离
      if (Math.abs(c.x - 1) + Math.abs(c.y - 1) < 6) return false;
      return true;
    };
    const hasWallNeighbor = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.isSolidCell(c.x + dx, c.y + dy));
    const wallDirOf = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => this.isSolidCell(c.x + dx, c.y + dy));

    for (const exCfg of this.cfg.exits) {
      let spot = null, guard = 0;
      while (!spot && guard++ < 900) {
        const idx = empties.length > 3 ? rng.int(2, empties.length - 1) : rng.int(0, Math.max(0, empties.length - 1));
        const c = empties[idx];
        if (!c || !okCell(c)) continue;
        if ((exCfg.kind === 'door' || exCfg.kind === 'elevator' || exCfg.kind === 'pipe' || exCfg.kind === 'lightdoor') && !hasWallNeighbor(c)) continue;
        spot = c;
      }
      if (!spot) spot = empties[Math.max(2, Math.floor(empties.length * 0.3))];
      chosen.push({ c: spot });
      const dev = this._buildDevice(group, exCfg, spot);
      this.exits.push(dev);
      this.items.push({ type: 'device', ref: dev, x: dev.x, z: dev.z, taken: false, title: '', body: '' });
    }
  }

  _buildDevice(group, exCfg, cell) {
    const [wx, wz] = this.cellToWorld(cell.x, cell.y);
    const g = new THREE.Group();
    g.position.set(wx, 0, wz);
    const kinds = {};
    let yaw = 0;
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a3428 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x50565a });

    const wallDir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => this.isSolidCell(cell.x + dx, cell.y + dy));

    if (exCfg.kind === 'door' || exCfg.kind === 'elevator' || exCfg.kind === 'lightdoor') {
      // 门框靠墙放置，面向房间
      if (wallDir) yaw = Math.atan2(-wallDir[0], -wallDir[1]);
      g.rotation.y = yaw;
      const jgeo = new THREE.BoxGeometry(0.28, 2.5, 0.28);
      const l1 = new THREE.Mesh(jgeo, exCfg.kind === 'elevator' ? metalMat : frameMat); l1.position.set(-0.95, 1.25, 0.1);
      const l2 = new THREE.Mesh(jgeo, exCfg.kind === 'elevator' ? metalMat : frameMat); l2.position.set(0.95, 1.25, 0.1);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.28), exCfg.kind === 'elevator' ? metalMat : frameMat); top.position.set(0, 2.6, 0.1);
      g.add(l1, l2, top);
      let panelMat;
      if (exCfg.kind === 'lightdoor') {
        panelMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
        const glow = new THREE.PointLight(0xfff6e0, 1.1, 16, 1.4);
        glow.position.set(wx, 1.7, wz);
        group.add(glow);
      } else if (exCfg.kind === 'elevator') {
        const t = Tex.toTexture(Tex.door(true)); t.encoding = THREE.sRGBEncoding;
        panelMat = new THREE.MeshLambertMaterial({ map: t });
        // 电梯状态灯
        const st = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshBasicMaterial({ color: exCfg.needsPower ? 0xff3020 : 0x33ff55 }));
        st.position.set(0, 2.75, 0.12);
        g.add(st);
        this._elevLamp = st.material;
      } else {
        const t = Tex.toTexture(Tex.door(false)); t.encoding = THREE.sRGBEncoding;
        panelMat = new THREE.MeshLambertMaterial({ map: t });
      }
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.45), panelMat);
      panel.position.set(0, 1.25, 0.1);
      g.add(panel);
      if (exCfg.lock) {
        // 门禁读卡器
        const reader = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xff3020 }));
        reader.position.set(1.12, 1.35, 0.14);
        g.add(reader);
        this._readerLamp = reader.material;
      }
    } else if (exCfg.kind === 'pipe') {
      if (wallDir) yaw = Math.atan2(-wallDir[0], -wallDir[1]);
      g.rotation.y = yaw;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.1, 14, 1, true),
        new THREE.MeshLambertMaterial({ color: 0x23282a, side: THREE.DoubleSide }));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(0, 0.62, 0.35);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 8, 16), metalMat);
      rim.position.set(0, 0.62, 0.88);
      const dark = new THREE.Mesh(new THREE.CircleGeometry(0.48, 14),
        new THREE.MeshBasicMaterial({ color: 0x000000 }));
      dark.position.set(0, 0.62, 0.86);
      g.add(pipe, rim, dark);
    } else if (exCfg.kind === 'glitch') {
      // 现实裂缝：悬浮的闪烁半透明裂片，可直接走入
      const gm = new THREE.MeshBasicMaterial({ color: 0x1a1420, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      const shard = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.6), gm);
      shard.position.y = 1.35;
      shard.rotation.y = this.rng.next() * Math.PI;
      g.add(shard);
      const shard2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9), gm.clone());
      shard2.position.y = 1.3;
      shard2.rotation.y = shard.rotation.y + 0.9;
      g.add(shard2);
      this.glitchMats.push(gm, shard2.material);
      const gl = new THREE.PointLight(0x8866ff, 0.5, 8, 2);
      gl.position.set(wx, 1.6, wz);
      group.add(gl);
    } else if (exCfg.kind === 'hole') {
      // 地板破洞：标记 floorMap 并加碎边装饰
      const cx = cell.x, cy = cell.y;
      this.floorMap[cy * this.W + cx] = HOLE_DEPTH;
      this.holeCells.push({ cx, cy, to: exCfg.to });
      // 碎裂边缘（几块斜板）
      const debrisMat = new THREE.MeshLambertMaterial({ color: 0x4a4438 });
      for (let i = 0; i < 5; i++) {
        const a = this.rng.next() * Math.PI * 2;
        const d = new THREE.Mesh(new THREE.BoxGeometry(this.rng.range(0.3, 0.7), 0.06, this.rng.range(0.3, 0.7)), debrisMat);
        d.position.set(wx + Math.cos(a) * (CELL * 0.42), 0.02, wz + Math.sin(a) * (CELL * 0.42));
        d.rotation.set(this.rng.range(-0.3, 0.3), this.rng.next() * 3, this.rng.range(-0.3, 0.3));
        group.add(d);
      }
      group.add(g);
      return { kind: 'hole', to: exCfg.to, x: wx, z: wz, cx, cy, used: false, label: '🕳️ 破洞' };
    }
    group.add(g);
    return {
      kind: exCfg.kind, to: exCfg.to, x: wx, z: wz,
      needsPower: !!exCfg.needsPower, lock: exCfg.lock || null,
      ending: !!exCfg.ending, used: false,
      label: { door: '🚪 门', elevator: '🛗 电梯', pipe: '🕳️ 管道', glitch: '⚡ 现实裂缝', lightdoor: '✨ 光之门' }[exCfg.kind],
    };
  }

  /* ---------------- 道具网格 ---------------- */
  _makeItemMesh(type) {
    const g = new THREE.Group();
    if (type === 'keycard') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.17),
        new THREE.MeshLambertMaterial({ color: 0xe8dfbe, emissive: 0x554a1e }));
      m.position.y = 0.03; g.add(m);
    } else if (type === 'fuse') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10),
        new THREE.MeshLambertMaterial({ color: 0xb03a2a, emissive: 0x300a05 }));
      m.rotation.z = Math.PI / 2; m.position.y = 0.07;
      g.add(m);
      const capMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), capMat);
      c1.rotation.z = Math.PI / 2; c1.position.set(-0.1, 0.07, 0);
      const c2 = c1.clone(); c2.position.x = 0.1;
      g.add(c1, c2);
    } else if (type === 'adrenaline') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8),
        new THREE.MeshLambertMaterial({ color: 0xd8d2c0, emissive: 0x3a1010 }));
      body.rotation.z = Math.PI / 2; body.position.y = 0.05;
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6),
        new THREE.MeshLambertMaterial({ color: 0xbbbbbb }));
      needle.rotation.z = Math.PI / 2; needle.position.set(0.12, 0.05, 0);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.06, 8),
        new THREE.MeshLambertMaterial({ color: 0xb03a2a, emissive: 0x400a05 }));
      label.rotation.z = Math.PI / 2; label.position.y = 0.05;
      g.add(body, needle, label);
    } else if (type === 'almond') {
      // 杏仁水：小玻璃瓶
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.2, 10),
        new THREE.MeshLambertMaterial({ color: 0xd8e4dc, transparent: true, opacity: 0.75, emissive: 0x1a2820 }));
      bottle.position.y = 0.1;
      const water2 = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.048, 0.14, 10),
        new THREE.MeshLambertMaterial({ color: 0xcfe0d8, emissive: 0x223828 }));
      water2.position.y = 0.085;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8),
        new THREE.MeshLambertMaterial({ color: 0x8a2a2a }));
      cap.position.y = 0.215;
      g.add(bottle, water2, cap);
    } else if (type === 'note') {
      const t = Tex.toTexture(Tex.paperNote());
      t.encoding = THREE.sRGBEncoding;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, emissive: 0x33301f }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI * 2;
      m.position.y = 0.015; g.add(m);
    } else if (type === 'bottle') {
      // 可投掷玻璃瓶：微微发光便于发现
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 8),
        new THREE.MeshLambertMaterial({ color: 0x9fd8b0, transparent: true, opacity: 0.85, emissive: 0x1e3a26 }));
      b.rotation.z = Math.PI / 2.3; b.position.y = 0.07;
      g.add(b);
    } else if (type === 'locker') {
      // 藏身柜：高身铁柜，带门缝
      const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.7),
        new THREE.MeshLambertMaterial({ color: 0x5a6a72 }));
      bodyM.position.y = 1.05;
      const doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.9, 0.02),
        new THREE.MeshLambertMaterial({ color: 0x2a343a }));
      doorLine.position.set(0, 1.05, 0.36);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.02),
        new THREE.MeshLambertMaterial({ color: 0x39454c }));
      vent.position.set(-0.18, 1.75, 0.36);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.04),
        new THREE.MeshLambertMaterial({ color: 0xc8c8c8, emissive: 0x333333 }));
      handle.position.set(0.32, 1.05, 0.37);
      g.add(bodyM, doorLine, vent, handle);
    }
    return g;
  }

  /** 在候选格中挑选互不相同的放置点 */
  _pickSpots(empties, count, minDistCells) {
    const spots = [];
    let guard = 0;
    while (spots.length < count && guard++ < 600) {
      const c = empties[this.rng.int(4, empties.length - 1)];
      if (this.floorMap[c.y * this.W + c.x] <= HOLE_DEPTH / 2) continue;
      if (spots.every(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= minDistCells)) spots.push(c);
    }
    while (spots.length < count) spots.push(empties[this.rng.int(4, empties.length - 1)]);
    return spots;
  }

  _placeItems(group, empties, field) {
    const cfg = this.cfg;
    const types = [];
    // 纸条：每层 2 张
    types.push('note', 'note');
    // 层级专属
    if (cfg.id === 1) types.push('fuse');
    if (cfg.adrenaline) { for (let i = 0; i < cfg.adrenaline; i++) types.push('adrenaline'); }
    // 杏仁水：多数层 1-2 瓶
    if (![11].includes(cfg.id)) { types.push('almond'); if (cfg.size >= 25) types.push('almond'); }
    // 玻璃瓶（投掷）：每层 2-3 个
    const nBottle = cfg.bottle || 2;
    for (let i = 0; i < nBottle; i++) types.push('bottle');
    // 配置的额外物品（如门禁卡）
    if (cfg.items) types.push(...cfg.items);

    const spots = this._pickSpots(empties, types.length, 6);
    const NOTES = NOTE_TEXTS[cfg.id] || [];
    let noteIdx = 0;
    types.forEach((t, idx) => {
      const c = spots[idx];
      const [wx, wz] = this.cellToWorld(c.x, c.y);
      const mesh = this._makeItemMesh(t === 'fuse' ? 'fuse' : t);
      mesh.position.set(wx + this.rng.range(-1, 1), this.groundAt(mesh.position.x, mesh.position.z) > HOLE_DEPTH / 2 ? this.groundAt(mesh.position.x, mesh.position.z) : 0, wz + this.rng.range(-1, 1));
      group.add(mesh);
      let title = '', body = '';
      if (t === 'note' && NOTES.length) {
        const n = NOTES[noteIdx++ % NOTES.length];
        title = n.t; body = n.b;
      }
      this.items.push({ type: t, x: mesh.position.x, z: mesh.position.z, y: mesh.position.y, mesh, taken: false, title, body });
    });

    /* 藏身柜：每层 2-4 个，靠近墙边 */
    if (cfg.id !== 11) {
      const nLocker = 2 + Math.floor(this.rng.next() * 3);
      const lspots = this._pickSpots(empties, nLocker, 8);
      for (const c of lspots) {
        const [wx, wz] = this.cellToWorld(c.x, c.y);
        const mesh = this._makeItemMesh('locker');
        // 贴墙放置：找相邻实心方向偏移
        let ox = 0, oz = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.isSolidCell(c.x + dx, c.y + dz)) { ox = dx * (CELL / 2 - 0.45); oz = dz * (CELL / 2 - 0.45); break; }
        }
        const gy = this.groundAt(wx + ox, wz + oz);
        mesh.position.set(wx + ox, gy > HOLE_DEPTH / 2 ? gy : 0, wz + oz);
        group.add(mesh);
        this.items.push({ type: 'locker', x: mesh.position.x, z: mesh.position.z, y: mesh.position.y, mesh, taken: false, title: '', body: '' });
      }
    }

    /* L1 配电箱 */
    if (cfg.id === 1) {
      const mid = empties[Math.floor(empties.length * 0.55)];
      const [bx, bz] = this.cellToWorld(mid.x, mid.y);
      const box = this._makePowerBox();
      box.position.set(bx, 0, bz);
      group.add(box);
      this.items.push({ type: 'powerbox', x: bx, z: bz, mesh: box, taken: false, title: '', body: '' });
    }

    /* 上层奖励物品（多层关卡） */
    if (this.layers.length) {
      const top = this.layers[this.layers.length - 1];
      const cellsUp = [...top.cells].filter(i => !top.holes.has(i));
      const upTypes = ['note', 'almond', 'adrenaline'];
      for (let k = 0; k < Math.min(3, cellsUp.length); k++) {
        const i = cellsUp.splice(Math.floor(this.rng.next() * cellsUp.length), 1)[0];
        const x = i % this.W, y = (i / this.W) | 0;
        const [wx, wz] = this.cellToWorld(x, y);
        const t2 = upTypes[k % upTypes.length];
        const mesh = this._makeItemMesh(t2);
        mesh.position.set(wx + this.rng.range(-1, 1), top.y + 0.12, wz + this.rng.range(-1, 1));
        group.add(mesh);
        const NOTES = NOTE_TEXTS[cfg.id] || [];
        const n = NOTES[(k + 1) % Math.max(1, NOTES.length)];
        this.items.push({ type: t2, x: mesh.position.x, z: mesh.position.z, y: mesh.position.y, mesh, taken: false, title: t2 === 'note' && n ? n.t : '', body: t2 === 'note' && n ? n.b : '', upper: true });
      }
    }
  }

  _makePowerBox() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x5a6360 }));
    body.position.y = 0.65;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2c332f }));
    face.position.set(0, 0.75, 0.26);
    const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    lampR.position.set(0.18, 1.15, 0.27);
    const lampG = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x113311 }));
    lampG.position.set(-0.18, 1.15, 0.27);
    this._pbLamps = { r: lampR.material, g: lampG.material };
    g.add(body, face, lampR, lampG);
    return g;
  }

  /* ---------------- 场景道具 ---------------- */
  /** v2.2 地标建筑：每层视觉锚点/导航参照物 */
  _placeLandmark(group) {
    const cfg = this.cfg;
    if (!cfg.landmark || !this.rooms || !this.rooms.length) return;
    // 取最大房间中心
    const r = this.rooms.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    const [wx, wz] = this.cellToWorld(r.x + (r.w >> 1), r.y + (r.h >> 1));
    const gy = this.groundAt(wx, wz);
    const base = gy > HOLE_DEPTH / 2 ? gy : 0;
    const g = new THREE.Group();
    const mat = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 });
    switch (cfg.landmark) {
      case 'fountain': {   // 泳池区中央喷泉水池
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.5, 20), mat(0xb8c8c0));
        rim.position.y = base + 0.25;
        const wat = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 20),
          new THREE.MeshLambertMaterial({ color: 0x3aa8b8, transparent: true, opacity: 0.75, emissive: 0x0a3440 }));
        wat.position.y = base + 0.32;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 10), mat(0xa8bcbc));
        col.position.y = base + 1.2;
        g.add(rim, wat, col);
        break;
      }
      case 'booktower': {  // 图书馆书塔
        for (let i = 0; i < 7; i++) {
          const h = 0.55;
          const box = new THREE.Mesh(new THREE.BoxGeometry(1.6 - i * 0.12, h, 1.6 - i * 0.12),
            mat(i % 2 ? 0x6a5232 : 0x59452a));
          box.position.set((this.rng.next() - 0.5) * 0.25, base + 0.28 + i * h, (this.rng.next() - 0.5) * 0.25);
          box.rotation.y = this.rng.range(-0.15, 0.15);
          g.add(box);
        }
        break;
      }
      case 'train': {      // 地铁列车车厢
        const body = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.6, 2.4), mat(0x3a4a44, 0x0a1410));
        body.position.y = base + 1.7;
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.5, 2.2), mat(0x222c28));
        skirt.position.y = base + 0.45;
        for (let i = -2; i <= 2; i++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.06), mat(0xffe9a0, 0x666030));
          win.position.set(i * 1.4, base + 2.1, 1.23);
          g.add(win);
        }
        g.add(body, skirt);
        break;
      }
      case 'morgue': {     // 停尸抽屉墙
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.6, 0.5), mat(0x9ab0ac, 0x0a1512));
        wall.position.y = base + 1.3;
        g.add(wall);
        for (let ry = 0; ry < 4; ry++) for (let rx = 0; rx < 6; rx++) {
          if (this.rng.next() < 0.82) {
            const d = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.06), mat(0x7f9591));
            d.position.set(-1.85 + rx * 0.74, base + 0.45 + ry * 0.62, 0.28);
            g.add(d);
            if (this.rng.next() < 0.12) {   // 虚掩的抽屉（微光）
              d.position.z = 0.36; d.rotation.x = 0.18;
              d.material = mat(0x30393b, 0x101a1c);
            }
          } else {
            const hole = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.08), mat(0x05090a));
            hole.position.set(-1.85 + rx * 0.74, base + 0.45 + ry * 0.62, 0.26);
            g.add(hole);
          }
        }
        break;
      }
      case 'garden': {     // 温室大树+花坛
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 8), mat(0x5a4630));
        trunk.position.y = base + 1.3;
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 10), mat(0x3f7d3a, 0x0e240e));
        crown.position.y = base + 3.3;
        crown.scale.y = 0.85;
        g.add(trunk, crown);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.35, 10), mat(0x6a5638));
          bed.position.set(wx === 0 ? 0 : Math.cos(a) * 3.2, base + 0.17, Math.sin(a) * 3.2);
          const flower = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
            mat([0xe86a8a, 0xe8c86a, 0x8a6ae8][i % 3], [0x401420, 0x403210, 0x201440][i % 3]));
          flower.position.set(Math.cos(a) * 3.2, base + 0.55, Math.sin(a) * 3.2);
          g.add(bed, flower);
        }
        break;
      }
      case 'server': {     // 数据中心核心机柜
        for (let i = 0; i < 4; i++) {
          const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), mat(0x14181f));
          rack.position.set(i * 1.4, base + 1.2, 0);
          g.add(rack);
          for (let l = 0; l < 8; l++) {
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.03),
              mat(this.rng.next() < 0.7 ? 0x3a8aff : 0x27e07a, this.rng.next() < 0.7 ? 0x0a2a66 : 0x0a5030));
            led.position.set(i * 1.4 + this.rng.range(-0.2, 0.2), base + 0.4 + l * 0.26, 0.47);
            g.add(led);
          }
        }
        break;
      }
      case 'mirror': {     // 镜面立柱群
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const mcol = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5),
            new THREE.MeshPhongMaterial({ color: 0xc8d8e0, shininess: 100, specular: 0xffffff }));
          mcol.position.set(Math.cos(a) * 2.6, base + 1.7, Math.sin(a) * 2.6);
          g.add(mcol);
        }
        break;
      }
      default: {           // 默认石碑
        const mono = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.5), mat(0x707870));
        mono.position.y = base + 1.3;
        g.add(mono);
      }
    }
    g.position.set(wx, 0, wz);
    group.add(g);
    this.landmarkPos = { x: wx, z: wz };
  }

  _placeProps(group, empties) {
    const cfg = this.cfg;
    const rng = this.rng;
    const lists = { rust: [], wood: [], metal: [], dirt: [], green: [] };
    const mats = {};
    const mkMat = (key, texCanvas) => {
      const t = Tex.toTexture(texCanvas);
      t.encoding = THREE.sRGBEncoding;
      mats[key] = new THREE.MeshLambertMaterial({ map: t });
    };
    mkMat('rust', Tex.rust()); mkMat('wood', Tex.wood()); mkMat('metal', Tex.metal()); mkMat('dirt', Tex.dirtWall());

    const addBox = (list, w, h, d, x, y, z, ry) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      if (ry) geo.rotateY(ry);
      geo.translate(x, y, z);
      list.push(geo);
    };
    const addCyl = (list, r, h, x, y, z) => {
      const geo = new THREE.CylinderGeometry(r, r, h, 10);
      geo.translate(x, y, z);
      list.push(geo);
    };

    const totalCount = Object.values(cfg.props).reduce((a, b) => a + b, 0);
    const spots = this._pickSpotsAwayFromImportant(empties, totalCount, 4);
    let i = 0;
    for (const [type, count] of Object.entries(cfg.props)) {
      for (let k = 0; k < count; k++) {
        if (i >= spots.length) break;
        const cell = spots[i++];
        const [cx, cz] = this.cellToWorld(cell.x, cell.y);
        const gy = this.floorMap[cell.y * this.W + cell.x] || 0;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.isSolidCell(cell.x + dx, cell.y + dy));
        let px = cx + rng.range(-1.2, 1.2), pz = cz + rng.range(-1.2, 1.2);
        if (dirs.length) {
          const [dx, dy] = rng.pick(dirs);
          px = cx + dx * 1.35 + (dy !== 0 ? rng.range(-1.1, 1.1) : 0);
          pz = cz + dy * 1.35 + (dx !== 0 ? rng.range(-1.1, 1.1) : 0);
        }
        if (type === 'barrel') {
          addCyl(lists.rust, 0.42, 0.95, px, gy + 0.475, pz);
          addCyl(lists.metal, 0.44, 0.06, px, gy + 0.72, pz);
          this.obstacles.push({ x: px, z: pz, r: 0.55 });
        } else if (type === 'crate') {
          addBox(lists.wood, 0.85, 0.85, 0.85, px, gy + 0.425, pz, rng.range(0, Math.PI));
          if (rng.next() < 0.4) addBox(lists.wood, 0.65, 0.65, 0.65, px + rng.range(-0.3, 0.3), gy + 1.17, pz + rng.range(-0.3, 0.3), rng.range(0, Math.PI));
          this.obstacles.push({ x: px, z: pz, r: 0.62 });
        } else if (type === 'desk') {
          const ry = rng.pick([0, Math.PI / 2]);
          addBox(lists.wood, ry ? 0.7 : 1.5, 0.06, ry ? 1.5 : 0.7, px, gy + 0.75, pz, 0);
          addBox(lists.metal, ry ? 0.62 : 0.05, 0.72, ry ? 0.05 : 0.62, px + (ry ? 0 : 0.7), gy + 0.36, pz + (ry ? 0.7 : 0), 0);
          addBox(lists.metal, ry ? 0.62 : 0.05, 0.72, ry ? 0.05 : 0.62, px - (ry ? 0 : 0.7), gy + 0.36, pz - (ry ? 0.7 : 0), 0);
          this.obstacles.push({ x: px, z: pz, r: 0.8 });
        } else if (type === 'cabinet') {
          addBox(lists.metal, 0.55, 1.35, 0.6, px, gy + 0.675, pz, rng.range(-0.15, 0.15));
          this.obstacles.push({ x: px, z: pz, r: 0.5 });
        } else if (type === 'chair') {
          const ry = rng.range(0, Math.PI * 2);
          addBox(lists.wood, 0.46, 0.07, 0.46, px, gy + 0.12, pz, ry);
          const bx = px - Math.cos(ry) * 0.2, bz = pz - Math.sin(ry) * 0.2;
          addBox(lists.wood, 0.46, 0.5, 0.06, bx, gy + 0.3, bz, ry);
          this.obstacles.push({ x: px, z: pz, r: 0.45 });
        } else if (type === 'shelf') {
          // 高货架：双柱+三层板
          const ry = rng.pick([0, Math.PI / 2]);
          const w = ry ? 0.7 : 2.4, d = ry ? 2.4 : 0.7;
          addBox(lists.metal, w, 0.07, d, px, gy + 0.6, pz, 0);
          addBox(lists.metal, w, 0.07, d, px, gy + 1.5, pz, 0);
          addBox(lists.metal, w, 0.07, d, px, gy + 2.4, pz, 0);
          addBox(lists.metal, 0.09, 2.6, 0.09, px + (ry ? 0 : w / 2 - 0.05), gy + 1.3, pz + (ry ? d / 2 - 0.05 : 0), 0);
          addBox(lists.metal, 0.09, 2.6, 0.09, px - (ry ? 0 : w / 2 - 0.05), gy + 1.3, pz - (ry ? 0 : d / 2 - 0.05), 0);
          addBox(lists.wood, w * 0.5, 0.4, d * 0.6, px + rng.range(-0.4, 0.4), gy + 0.85, pz, rng.range(0, 1));
          this.obstacles.push({ x: px, z: pz, r: ry ? 1.0 : 1.1 });
        } else if (type === 'locker') {
          addBox(lists.metal, 0.6, 1.9, 0.55, px, gy + 0.95, pz, rng.range(-0.2, 0.2));
          this.obstacles.push({ x: px, z: pz, r: 0.5 });
        } else if (type === 'bed') {
          const ry = rng.pick([0, Math.PI / 2]);
          addBox(lists.wood, ry ? 1.0 : 2.0, 0.3, ry ? 2.0 : 1.0, px, gy + 0.25, pz, 0);
          addBox(lists.metal, ry ? 0.95 : 1.9, 0.14, ry ? 1.9 : 0.95, px, gy + 0.47, pz, 0);
          this.obstacles.push({ x: px, z: pz, r: ry ? 0.85 : 1.15 });
        } else if (type === 'plant') {
          // 枯萎盆栽
          addCyl(lists.rust, 0.18, 0.3, px, gy + 0.15, pz);
          addCyl(lists.wood, 0.03, 0.5, px, gy + 0.5, pz);
          addBox(lists.green, 0.04, 0.3, 0.22, px + 0.08, gy + 0.68, pz, rng.range(0, 3));
          addBox(lists.green, 0.22, 0.04, 0.22, px - 0.05, gy + 0.74, pz, rng.range(0, 3));
          this.obstacles.push({ x: px, z: pz, r: 0.3 });
        } else if (type === 'pipeCol') {
          // 立管
          addCyl(lists.rust, 0.16, cfg.wallH, px, gy + cfg.wallH / 2, pz);
          addCyl(lists.metal, 0.2, 0.1, px, gy + 2.2, pz);
          this.obstacles.push({ x: px, z: pz, r: 0.3 });
        } else if (type === 'pallet') {
          addBox(lists.wood, 1.1, 0.12, 1.1, px, gy + 0.06, pz, rng.range(0, Math.PI));
          if (rng.next() < 0.5) { addBox(lists.wood, 1.0, 0.12, 1.0, px, gy + 0.18, pz, rng.range(0, Math.PI));
            this.obstacles.push({ x: px, z: pz, r: 0.7 });
          } else {
            this.obstacles.push({ x: px, z: pz, r: 0.65 });
          }
        }
      }
    }

    for (const key of Object.keys(lists)) {
      if (!lists[key] || !lists[key].length) continue;
      const mesh = new THREE.Mesh(mergeGeoms(lists[key]), mats[key]);
      group.add(mesh);
    }
    // 枯叶（绿）单独材质
    if (lists.green && lists.green.length) {
      const m = new THREE.MeshLambertMaterial({ color: 0x4a5a38 });
      group.add(new THREE.Mesh(mergeGeoms(lists.green), m));
    }
  }

  /** 避开出生点/装置/物品/实体刷新点的道具选位 */
  _pickSpotsAwayFromImportant(empties, count, minDistCells) {
    const imp = [{ x: this.playerStart[0], z: this.playerStart[1] }]
      .concat(this.exits.map(e => ({ x: e.x, z: e.z })))
      .concat(this.items.map(it => ({ x: it.x, z: it.z })));
    if (this.entitySpawn) imp.push({ x: this.entitySpawn[0], z: this.entitySpawn[1] });
    const spots = [];
    let guard = 0;
    while (spots.length < count && guard++ < 800) {
      const c = empties[this.rng.int(3, empties.length - 1)];
      if (this.floorMap[c.y * this.W + c.x] > 0.4) continue;
      const [wx, wz] = this.cellToWorld(c.x, c.y);
      if (!imp.every(p => U.dist2(wx, wz, p.x, p.z) > 2.4 * 2.4)) continue;
      if (!spots.every(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= minDistCells)) continue;
      spots.push(c);
    }
    return spots;
  }

  /* ---------------- 状态推进 ---------------- */
  setPower(on) {
    this.powerOn = on;
    const cfg = this.cfg;
    if (on) {
      this.hemi.intensity = 0.5;
      this.pointLights.forEach(pl => { pl.intensity = 0.6; });
      if (this.sceneRef && this.sceneRef.fog) {
        this.sceneRef.fog.density = cfg.fogDensity * 0.55;
        this.sceneRef.background.setHex(cfg.fogColor).multiplyScalar(2.2);
      }
      if (this._pbLamps) { this._pbLamps.r.color.setHex(0x331111); this._pbLamps.g.color.setHex(0x33ff55); }
      if (this._elevLamp) this._elevLamp.color.setHex(0x33ff55);
    }
  }

  unlockDoor(dev) {
    if (dev && this._readerLamp) this._readerLamp.color.setHex(0x33ff55);
  }

  update(dt) {
    this.time += dt;
    if (this.alarmLights) {
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(this.time * Math.PI / 0.8));
      for (const al of this.alarmLights) al.intensity = pulse * 1.3;
    }
    // 灯光闪烁
    const ph = this.time * 13 + this._lampPhase;
    const heavy = this.cfg.flickerHeavy ? 0.72 : -0.86;
    for (const m of this.flickerMats) {
      const f = Math.sin(ph * 3.1) * Math.sin(ph * 7.7) * Math.sin(ph * 1.3);
      const on = f > heavy;
      const base = this.cfg.dark && !this.powerOn ? 0 : 1;
      const v = on ? base : base * 0.15;
      m.color.setRGB(v, v * 0.93, v * 0.72);
    }
    // 现实裂缝闪烁
    for (let i = 0; i < this.glitchMats.length; i++) {
      const m = this.glitchMats[i];
      m.opacity = 0.22 + 0.2 * Math.abs(Math.sin(this.time * (2.1 + i * 1.7) + i * 2));
    }
    // 水面微光
    if (this.waterMesh) this.waterMesh.material.opacity = 0.58 + 0.06 * Math.sin(this.time * 1.7);
    // 尘埃漂浮
    if (this.dust) {
      const p = this.dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 0.06;
        if (y > this.cfg.wallH) y = 0.2;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
  }
}

function cellDist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

/* ============ 纸条内容（每层世界观） ============ */
const NOTE_TEXTS = {
  0: [
    { t: '撕下的日记', b: '第3天。\n荧光灯永远不会熄灭。数过了，从这个房间到下一个房间，是四十七步。\n\n如果有人读到这张纸：有些墙只是"看起来"是墙。走进去的时候不要闭眼。' },
    { t: '流浪者留言', b: '我亲眼看见老王从地板的破洞掉了下去。\n三天后我在一个全是水的地方又见到了他——或者说，见到了他的手电筒。\n\n破洞不会摔死人。破洞只是……换地方。' },
  ],
  1: [
    { t: '值班表背面', b: 'B2 区又停电了。老张说配电箱的保险丝被人拆走了。\n\n电梯没电就是一口铁棺材。但通向黑暗的管道一直是开的——如果你非要走那条路的话。' },
    { t: '写给上面的人', b: '如果你坐上了电梯，替我看看真正的天空是什么颜色。\n我在这里太久了，快忘了。\n\n高台上的风景也没什么好看的，别爬上去看了，会哭。' },
  ],
  2: [
    { t: '管道检修记录', b: '7 号竖井再次堵塞。堵塞物：不明有机组织。\n申请：请不要再往管道里扔东西。\n\n另：爬行声是正常的。大概率是正常的。' },
    { t: '潦草的字条', b: '它在管道里比在地上快。\n它眼睛不好，但耳朵好使得吓人。\n\n想活命就轻手轻脚，想死就继续跑。' },
  ],
  3: [
    { t: '员工守则 · 修订版', b: '欢迎来到本公司！\n1. 下班后请勿留在工位。\n2. 听到键盘声而办公室无人时，请勿寻找声源。\n3. 电梯只停它想停的楼层。' },
    { t: 'IT 部的便签', b: '服务器机房搬走了，但走廊尽头的高个子还在。\n我们叫它"猎手"。别在工位之间跑，它把奔跑声当打卡铃。' },
  ],
  4: [
    { t: '入住须知', b: '欢迎光临！\n本酒店共有 ∞ 间客房，每间都已入住。\n\n请勿打扰其他客人。请勿在走廊奔跑。请勿试图退房。' },
    { t: '门童的领结', b: '门禁卡就在酒店的某处地上——前台没有前台。\n通往地下避难所的门需要它。\n\n那扇门后面的警报声从来没停过。我不推荐去。' },
  ],
  5: [
    { t: '盲人的忠告', b: '这层没有光。好在我也不需要光。\n\n规则：走路，别跑。它分不清脚步和鼓点，但它知道哪个更香。\n手电筒？手电筒是它的开饭铃。' },
    { t: '摸黑写的字', b: '字可能歪了。手在抖。\n\n地板有个洞，洞里有水声。跳下去比留在这里强。\n——第 9 批探索队最后的留言' },
  ],
  6: [
    { t: '水位记录', b: '水位没变。永远是脚踝。\n\n但脚印会变。每天早上，水里都会多出一串不是我们的脚印，从隧道深处来，回到隧道深处去。' },
    { t: '漂流瓶里的纸', b: '居然有人在水淹层钓鱼。\n他说钓上来过一部还会响的手机。\n\n铃声是从水底传来的。' },
  ],
  7: [
    { t: '矿工的账本', b: '正字第 214 划。我们数的是支撑木断裂的声音。\n\n今天多了一根。它断的时候，坑道深处的黑暗好像……吸了一口气。' },
    { t: '警告牌残片', b: '前方塌方区\n禁止……\n（后半句被烧掉了）\n\n用炭笔补写的一行小字：禁止回头。' },
  ],
  8: [
    { t: '库存清单 #4471', b: '货架 88 排：空\n货架 89 排：空\n货架 90 排：空\n……\n货架 ∞ 排：一位顾客\n备注：顾客不是我们放进去的。' },
    { t: '货运单', b: '货梯可直达"白色空间"。\n没人知道白色空间是什么，因为去过的人描述不出来——\n他们回来后只会重复一句话：好亮，好静，好想回去。' },
  ],
  9: [
    { t: '查房记录', b: '307 床：无异常\n308 床：无异常\n309 床：（新增）\n\n我们只有 308 张床。' },
    { t: '护士站便签', b: '夜班护士说走廊尽头的灯闪的时候，能照见"她"。\n灯不闪的时候，也能照见。\n\n只是灯闪的时候，她离得比较近。' },
  ],
  10: [
    { t: '紧急广播残页', b: '……警报已激活。M.E.G. 提醒所有流浪者：\n不要进入响着警报的楼层。那里的实体处于猎杀状态，且永不疲倦。\n\n如果你已经在里面了——跑。别回头，别停下，别相信安静。' },
    { t: '针剂使用说明', b: '肾上腺素注射剂（实验批号 09）\n效果：瞬间恢复体能，短时间爆发速度。\n副作用：心悸、手抖、以及一种"背后有东西"的错觉。\n\n注：那不是错觉。' },
  ],
  11: [
    { t: '白色的第一页', b: '这里什么都没有。\n没有墙纸，没有水滴，没有脚步声。\n\n我居然开始想念那些嗡嗡声了。人真的是种很贱的东西。' },
    { t: '门边的刻字', b: '光门的另一边是天空。我发誓这次是真的。\n\n——第 7 批探索队 全员\n（下面还有一行小字：除了老王，他说他想留下看看还有没有别人。）' },
  ],
  12: [
    { t: '池边的防水袋', b: '泳池房间是安全的。我们在这里补给、睡觉、甚至敢脱下鞋走两步。\n\n但昨晚水面的波纹停了一秒。整层楼的水。同时。一秒。' },
    { t: '瓷砖上的涂鸦', b: '“别喝池水”\n下面有人补了一句：' },
  ],
  13: [
    { t: '房门背后的便签', b: '这栋楼的楼层比从外面看到的多得多。天梯是唯一的路——它不喜欢电梯井。\n\n爬楼时数着层数。如果你数到十三，假装什么都没发生。' },
    { t: '物业通知', b: '《关于禁止在楼层间奔跑的温馨提示》\n各位住户：近期有住户反映夜间听到快速脚步声逐层上楼。物业提醒：本公寓没有楼梯间。\n\n——物业管理处（电话永远占线）' },
  ],
  14: [
    { t: '路口的路牌', b: '灰色城区的路牌全是空白的。雾把街道切成了方块，每个方块都一样。\n\n守夜人只有在你跑的时候才会追。走路。像本地人一样走路。' },
    { t: '值班室日志', b: '第 ?? 夜。灯又亮了一排。数了下是四千零九十六盏，和昨天一样。\n\n如果哪天数出别的数字，我就去巷子口看看那个和我长得一样的家伙到底是谁。' },
  ],
  15: [
    { t: '气球上的字条', b: '=) 你来啦！派对刚开始！蛋糕在楼上！游戏在楼下！\n\n出口？聚会进行到天亮哦。这里的“天亮”还没被发明出来呢 =)' },
    { t: '一张被踩过的邀请函', b: '诚挚邀请您参加永不散场派对\n着装要求：随意（反正之后也会一样）\n伴手礼：永久的微笑 =)\n\n注：不接受拒绝，不接受提前离场' },
  ],
  16: [
    { t: '消防演练记录', b: '第 9,341 次演练。全员到楼梯间集合。\n没有人记得清点人数是从哪一次开始变成奇数的。\n\n继续往下走。别回头数台阶。' },
    { t: '写在墙上的粉笔字', b: '向下 17 层 → 出口\n向下 41 层 → 出口\n向下 ??? 层 → 真正的出口\n\n下面有人用红笔补了一句：都是骗人的，但楼梯是真的' },
  ],
  17: [
    { t: '借书卡（背面）', b: '《后室建筑学（残卷）》\n最后借阅人：（名字被水渍泡开了）\n应还日期：昨天\n\n逾期罚则：成为馆藏。' },
    { t: '夹在书里的信', b: '我在 J 区书架第七排发现一条规律：所有关于“出口”的书都是空白的。\n除了最后一页有一行小字：出口不是找到的，是走到累的那一步时它自己出现。\n\n我不信。我还在走。' },
  ],
  18: [
    { t: '末班车站牌', b: '首班 05:30 / 末班 ——:——\n本站停运通知：因“结构原因”无限期停运。\n\n站务员留言：如果你必须在隧道里过夜，睡在高台上。水涨的时候它们游得快。' },
    { t: '湿透的工作证', b: '检修工 第7号\n负责区间：K线全段\n备注：听到轨道传来广播声时，不要答应任何问题。它们会问你的名字。' },
  ],
  19: [
    { t: '值班护士的手记', b: '夜班守则第一条：不要数抽屉。\n第二条：如果一定要数，从右边开始。左边那几个有主了。\n\n今晚 3 排 14 号又开着。我用听诊器贴上去听了。\n我再也不带听诊器上夜班了。' },
    { t: '一张标签纸', b: '编号 0-0-0\n姓名：（空白）\n死因：看见了自己\n\n处理意见：待观察。它在等下一个看见自己的人。' },
  ],
  20: [
    { t: '温室养护日志', b: '第 412 天：番茄结果了。真的结果了！\n这里和其他地方不一样。土是真的，光是暖的。\n\n如果你找到了这里，先深呼吸十次。然后帮我把左二花坛浇了。' },
    { t: '挂在藤架上的木牌', b: '欢迎来到花园。\n规矩只有一条：可以摘果子，不可以挖土。\n\n土下面埋着的不是种子。是我们想忘掉的东西。' },
  ],
  21: [
    { t: '机房巡检单', b: '机柜 A-01 至 A-4096：正常。\n温湿度：正常。\n噪音：正常。\n异常：B 区走廊尽头多了一台没有接入任何线路的服务器。\n它的指示灯在闪。像摩尔斯电码。翻译过来是：“我也想出去。”' },
    { t: '打印出来的邮件', b: '发件人：系统管理员\n收件人：全体员工\n主题：关于深夜蓝光\n\n最近有同事反映凌晨的机房里有人影走动。\n监控回放显示那只是 LED 呼吸灯。\n\n请勿在回放时倒带三遍以上。' },
  ],
  22: [
    { t: '风暴中捡到的笔记', b: '白色风暴的第 ? 天。我的影子被吹丢了。\n\n在这里迷路不可怕，可怕的是你身后突然出现一串脚印——和你鞋底花纹一样，但方向相反。' },
    { t: '灰烬里的卡片', b: '白噪疗法 · 患者须知\n请在纯白环境中放松身心，想象自己回到出生之前的宁静。\n\n副作用：部分患者表示“回不来了”。' },
  ],
  23: [
    { t: '大厅迎宾词（对折的）', b: '欢迎光临镜像大厅。\n本厅采用完美对称设计：左侧有什么，右侧就有什么。\n\n如果发现不对称的地方——那是你带来的。离开前请务必带走。' },
    { t: '湿掉的导览图', b: '① 入口喷泉（干涸）\n② 镜柱广场\n③ 宴会厅遗址\n④ ——这行字后面全是水彩晕开的痕迹，隐约画着一个小人，站在你现在的位置。' },
  ],
};

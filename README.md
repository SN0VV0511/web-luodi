# SN0VV CITY

以城市建造游戏的俯瞰视角探索自托管应用。沿海城市由西岸老城、东湾城区和北部新城组成，各自混合办公、住宅与公共设施；12 栋应用楼分散在三个城区。中央是一座连片湖畔公园，道路从外侧绕行；西岸有沙滩、棕榈和海滨步道，东岸有货运码头、岸吊、集装箱与货轮。行人在街头、湖岸和海边散步、交谈或休息。Next.js + React + TypeScript + Three.js；几何模型和建筑纹理在本地生成，不依赖远程模型、贴图或字体。

## 本地运行

```bash
npm ci
cp .env.example .env.local
npm run dev
```

访问 http://localhost:3000。验证命令：`npm test`、`npm run typecheck`、`npm run build`。生产运行使用 `npm run build` 后 `npm start`。

浏览器回归：开发服务运行时执行 `python3 scripts/check-city.py`（需安装 Python Playwright 及 Google Chrome；使用 `--url` 可指定其他预览地址，`--browser-channel` 可切换浏览器）。覆盖真实三维选择、手势误触、手机布局、键盘焦点、草稿恢复和无 WebGL 降级。

## 配置应用入口

在 `.env.local` 填写 `.env.example` 中的公开访问网址。未配置的项目会展示“入口待连接”；不会假装服务在线，也不会产生错误跳转。只接受不带用户名/密码的 HTTP(S) URL。

`NEXT_PUBLIC_*` 在构建时写入前端，生产或 Docker 中修改地址后需要重新构建镜像/站点，单独改容器运行时环境变量不会改变已有页面。禁止放置密钥、认证令牌或内网凭据。

所有建筑元数据位于 `lib/city-content.ts`，楼牌、目录、搜索、详情、链接使用同一份数据：

- `cityPlaces`：量化事务所、AFFiNE、Agent Base、OpenClaw。
- `officeTenants`：LunaTV、LunaTV 源浏览器、微信推送已入驻 `slot-5` 到 `slot-7`；其余 5 栋预留办公楼编号 `slot-8` 到 `slot-12`。

新增部署时，在 `officeTenants` 增加一项即可；无需编辑 Three.js 场景。例如：

```typescript
export const officeTenants: Partial<Record<`slot-${number}`, Omit<CityPlace, "id" | "number" | "vacant">>> = {
  "slot-5": {
    name: "我的新应用",
    category: { zh: "自动化工作室", en: "AUTOMATION STUDIO" },
    description: { zh: "应用的简短介绍。", en: "A short description of the application." },
    color: "#8a9e8b",
    href: "https://app.example.com",
  },
};
```

这里的网址为占位示例，请替换为实际地址。当前共 12 栋可配置应用楼，其余空间属于住宅、商店、公共设施与自然景观。`lib/city-map.ts` 管理应用楼位置与路网，`lib/city-world.ts` 生成楼群、地形与道路，`lib/city-civic.ts` 管理公共建筑和大公园，`lib/city-life.ts` 管理行人，`lib/city-coast.ts` 管理沙滩和货运港，`components/city-scene.tsx` 管理渲染、镜头与交互。

## 新闻与留言

- `NEXT_PUBLIC_NEWS_URL`：连接已有新闻页；未配置时展示标明“非实时新闻”的阅读精选，可在 `lib/community-content.ts` 编辑。
- `NEXT_PUBLIC_GUESTBOOK_URL`：连接已有公共留言板。
- 首页的留言便签是**本浏览器中的私人草稿**，昵称最多 40 字、正文最多 280 字。保存后可刷新恢复，不上传、不公开，也不会自动填充或发送到外部留言服务。

## 交互与兼容

默认城市俯瞰：鼠标左键拖动平移、右键拖动旋转、滚轮缩放；触屏单指旋转、双指缩放与平移。选择应用楼会平滑拉近并显示入口；小地图可快速定位，“去走走”可直接走近三个城区、中央公园、沙滩和货运港。工具栏提供城市俯瞰、街区近景、街道视角、黄昏/夜景、自动航拍、楼牌开关与暂停；行人和交通共同遵循暂停和减少动态偏好。

应用目录支持搜索与筛选；点击广告牌、城市日报或海岸信箱后，镜头以 2.2 秒缓入缓出的动画靠近，抵达后在对应建筑上方展开暖白信息卡。信息卡跟随建筑投影，城市保持可交互；关闭或按 Escape 返回探索。减少动态偏好下直接定位，WebGL 不可用时仍可阅读内容。界面支持中英文、手机布局与键盘焦点；三维画面在离屏或标签页隐藏时暂停。

## 性能验证

保留全部模型与人群，将相同表面参数的纯色材质合为实例批次。城市按约 30 帧运行，动态阴影每秒刷新 10 次；静止镜头复用楼牌投影，高分屏 WebGL 画布限制在约两百万像素，HTML 界面保持原生清晰度。首帧着色器通过 Three.js 并行准备，页面隐藏或暂停后停止不必要的计算。

运行 `python3 scripts/profile-city.py --url http://127.0.0.1:3001 --runs 3 --check` 可复测首屏、主线程长任务、绘制次数、三角形和帧间隔。固定采样为 Chrome、1440×900、DPR 2；每轮使用独立浏览器上下文。`--check` 校验像素与绘制预算，耗时受设备和着色器缓存影响，只记录、不设跨设备硬门槛。

本机三轮优化前后：每帧绘制 337 次降至平均约 137 次，帧间隔中位数约 50ms 降至 33.3ms。首屏耗时存在冷编译波动，不能把热缓存结果当成所有设备首次访问的保证。`scripts/check-city.py` 同时覆盖暂停后的缩放投影和城市导航回归。

原有 `assets` 图片保留。

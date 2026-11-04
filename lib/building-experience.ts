import type { PlaceId } from "./city-content";
import type { LocalizedText } from "./site-content";

export type LandmarkKind = "exchange" | "pages" | "core" | "workshop" | "cinema" | "observatory" | "post" | "courtyard" | "fold" | "orrery" | "greenhouse";
export type ExperienceChapter = Readonly<{
  label: LocalizedText;
  description: LocalizedText;
  /** 镜头观察点相对于地块宽、高、深的比例。 */
  target: readonly [number, number, number];
  direction: readonly [number, number, number];
  span: number;
}>;
export type BuildingExperience = Readonly<{
  kind: LandmarkKind;
  title: LocalizedText;
  subtitle: string;
  material: LocalizedText;
  action: LocalizedText;
  chapters: readonly [ExperienceChapter, ExperienceChapter, ExperienceChapter];
}>;

const text = (zh: string, en: string): LocalizedText => ({ zh, en });
const chapter = (
  label: LocalizedText, description: LocalizedText,
  target: ExperienceChapter["target"], direction: ExperienceChapter["direction"], span: number,
): ExperienceChapter => ({ label, description, target, direction, span });

/** 建筑故事与镜头配置；只表达空间交互，不模拟后端状态或虚构服务能力。 */
export const buildingExperiences: Partial<Record<PlaceId, BuildingExperience>> = {
  quant: {
    kind: "exchange", title: text("市场有节奏，建筑也有。", "A place to find your own rhythm."),
    subtitle: "THE QUIET EXCHANGE", material: text("铜翼 · 深色钢构 · 空中连廊", "COPPER / STEEL / SKYBRIDGE"),
    action: text("进入量化事务所", "Open the market office"),
    chapters: [
      chapter(text("开启大厅", "Trading hall"), text("铜翼向两侧展开，露出双塔之间的研究大厅。这里的装置是建筑演示，不是实时行情。", "Copper fins reveal a research hall between the twin towers. The installation is architectural, not live market data."), [0, .51, .08], [.5, .4, 1], 2.9),
      chapter(text("策略圆桌", "Strategy room"), text("靠近环形研究台，观察独立工位、终端和上方悬吊的市场时钟。", "Move in to inspect the circular research desk, terminals and suspended market clock."), [0, .13, .12], [.25, .24, 1], 1.12),
      chapter(text("空中连廊", "Skybridge"), text("顺着铜色结构抬升视线，让两座塔之间的观景连廊伸展出来。", "Follow the copper structure upward as the observation bridge extends between the towers."), [0, .56, .04], [.72, .26, 1], 1.55),
    ],
  },
  affine: {
    kind: "pages", title: text("让想法，翻到下一页。", "Make room for your next idea."),
    subtitle: "THE OPEN NOTEBOOK", material: text("纸白层板 · 橡木书脊 · 花园", "PAPER / OAK / GARDEN"),
    action: text("打开 AFFiNE 工作室", "Open AFFiNE"),
    chapters: [
      chapter(text("翻开书页", "Unfold pages"), text("书脊两侧的立面像纸页一样翻开，文档不再困在一面墙里。", "Facades unfold like pages around an oak spine, opening the studio to the city."), [0, .52, 0], [.28, .35, 1], 1.85),
      chapter(text("展开白板", "Whiteboard"), text("白板从工作室向外滑出；桌椅、书架与纸卡组成一个可以思考的房间。", "A whiteboard slides out beside desks, bookshelves and paper cards: a room for thinking."), [0, .22, .2], [.15, .32, 1], 1.2),
      chapter(text("灵感花园", "Idea garden"), text("视线越过展开的书页，来到有格栅、种植池和阅读座椅的屋顶。", "Look over the open pages toward a rooftop of pergolas, planters and reading benches."), [0, .82, -.05], [.65, .7, 1], 1.35),
    ],
  },
  agents: {
    kind: "core", title: text("从一个任务，到一次协作。", "One task. Many possibilities."),
    subtitle: "ORBITAL HEADQUARTERS", material: text("钛金属外骨骼 · 环轨 · 核心舱", "TITANIUM / ORBITS / CORE"),
    action: text("进入 Agent Base", "Open Agent Base"),
    chapters: [
      chapter(text("唤醒核心", "Task core"), text("护甲分离，悬浮任务核心从指挥塔中显露。所有运动仅为交互演示。", "The armor separates to expose a suspended task core. All motion is an interaction demo."), [0, .52, 0], [.38, .32, 1], 3.1),
      chapter(text("工具对接", "Tool docking"), text("对接环展开，三个工具舱沿环轨靠近核心，表现工具连接的空间隐喻。", "A docking ring unfolds and three tool pods approach the core along their rails."), [0, .5, 0], [.25, .23, 1], 1.6),
      chapter(text("执行编队", "Launch formation"), text("执行舱升起并展开编队，模型、工具与行动各自拥有清晰的位置。", "Execution pods rise into formation, giving models, tools and actions their own place."), [0, .69, 0], [.6, .35, 1], 1.9),
    ],
  },
  openclaw: {
    kind: "workshop", title: text("好想法，值得动手造。", "Good ideas deserve to be built."),
    subtitle: "THE MAKER FOUNDRY", material: text("红砖 · 锯齿天窗 · 机械臂", "BRICK / SAWTOOTH / ROBOTICS"),
    action: text("进入 OpenClaw 工坊", "Open OpenClaw"),
    chapters: [
      chapter(text("开启工坊", "Open hangar"), text("厂房门折叠上升，屋顶天窗打开，露出有桁架、导轨和操作台的实验车间。", "The hangar door folds upward and skylights open above trusses, rails and workbenches."), [0, .4, 0], [.3, .28, 1], 1.7),
      chapter(text("装配实验", "Assembly"), text("机械臂转向装配台，双指夹爪配合传送平台完成一段可重复的装配演示。", "A robotic arm turns toward the worktable as its gripper and conveyor perform an assembly demonstration."), [0, .25, .1], [.3, .35, 1], 1.05),
      chapter(text("工具交付", "Dispatch"), text("小车沿导轨送出实验模块。这里只驱动建筑机构，不会触发真实自动化任务。", "A rail trolley carries the module out. This operates the building model, not a real automation task."), [.12, .2, .38], [.6, .4, 1], 1.2),
    ],
  },
  "slot-5": {
    kind: "cinema", title: text("灯光暗下，故事开场。", "Lights down. Stories on."),
    subtitle: "LUNA PICTURE PALACE", material: text("酒红幕布 · 黄铜灯带 · 放映厅", "VELVET / BRASS / PROJECTION"),
    action: text("进入 LunaTV 选片", "Choose a film in LunaTV"),
    chapters: [
      chapter(text("拉开剧幕", "Raise the curtain"), text("弧形门头亮起，双侧幕布退场，露出阶梯座席与宽银幕。", "The marquee lights up as curtains part to reveal tiered seating and a wide screen."), [0, .59, 0], [.18, .23, 1], 2.2),
      chapter(text("放映视角", "Projection room"), text("镜头直面银幕，放映光束穿过剧场；银幕播放的是本地几何片头，不加载外部视频。", "Face the screen as a projection beam crosses the theater. The title sequence is local geometry, not an external video."), [0, .38, 0], [.03, .15, 1], 1.25),
      chapter(text("月光露台", "Moon terrace"), text("绕到剧场上方，查看月形招牌、胶片卷盘与有座椅的观影露台。", "Rise above the theater to see its moon sign, film reels and rooftop viewing terrace."), [0, .95, -.1], [.65, .6, 1], 1.55),
    ],
  },
  "slot-6": {
    kind: "observatory", title: text("在万千信号中，找到所爱。", "Find your story in the noise."),
    subtitle: "SIGNAL OBSERVATORY", material: text("环形机房 · 抛物天线 · 轨道", "DRUM / DISH / SCANNING RAIL"),
    action: text("打开影视源浏览器", "Open the source browser"),
    chapters: [
      chapter(text("展开天线", "Deploy antenna"), text("观测站的外壳分开，抛物天线抬起，显露内部检索机房。", "The observatory shell separates and a parabolic dish rises above the search room."), [0, .5, 0], [.75, .36, 1], 2.1),
      chapter(text("多源扫描", "Sweep sources"), text("天线沿环轨平稳扫描，光标经过不同的接收模块；这是信号搜索的建筑隐喻。", "The dish sweeps along its rail past receiver modules: an architectural metaphor for source discovery."), [0, .83, 0], [.4, .42, 1], 1.65),
      chapter(text("锁定信号", "Lock signal"), text("扫描停止，天线与信号透镜对齐。真实的影视搜索请通过下方入口完成。", "The sweep stops and the dish aligns with its signal lens. Use the link below for actual media searches."), [0, .52, .1], [.1, .25, 1], 1.45),
    ],
  },
  "slot-7": {
    kind: "post", title: text("重要的消息，总会抵达。", "A little station for things that matter."),
    subtitle: "THE COASTAL POST", material: text("珐琅绿 · 黄铜信箱 · 信号塔", "ENAMEL / BRASS / BEACON"),
    action: text("打开微信推送 / 扫码恢复", "Open WeChat push / reconnect"),
    chapters: [
      chapter(text("打开驿站", "Open the post"), text("百叶信箱门向两侧折开，露出一间带投递格、分拣台和邮筒的消息驿站。", "Louvered doors fold aside to reveal mail slots, a sorting desk and a postbox."), [0, .55, 0], [.25, .3, 1], 2.05),
      chapter(text("信件分拣", "Sort letters"), text("信封沿机械轨道依次穿过分拣台。演示不会发送消息或读取微信连接状态。", "Envelopes travel through the sorting desk. This demo neither sends messages nor reads your connection status."), [0, .23, .15], [.15, .34, 1], 1.12),
      chapter(text("信号投递", "Send a signal"), text("信件送到塔顶，信标展开同心波纹；扫码与恢复连接仍在原来的应用中进行。", "A letter reaches the tower and its beacon releases concentric rings. Reconnect from the original application."), [0, .82, 0], [.5, .33, 1], 1.6),
    ],
  },
  "slot-9": {
    kind: "courtyard", title: text("留一束光，给下一次灵感。", "A courtyard for what comes next."),
    subtitle: "THE LIGHT COURT", material: text("石灰石 · 旋转遮阳板 · 中庭", "LIMESTONE / FINS / ATRIUM"), action: text("预留空间", "Available space"),
    chapters: [
      chapter(text("打开光庭", "Open courtyard"), text("石材围合的中庭由旋转遮阳板开启；这栋楼尚未入驻应用。", "Rotating fins open a stone courtyard. No application has moved in yet."), [0, .45, 0], [.7, .5, 1], 2.2),
      chapter(text("廊下漫步", "Colonnade"), text("走近柱廊、长椅与中央水镜，为未来的新项目预留一个安静入口。", "Explore the colonnade, benches and reflecting pool: a quiet entrance for a future project."), [0, .22, .1], [.2, .35, 1], 1.3),
      chapter(text("天光屋顶", "Roof light"), text("屋顶遮阳构件转向天空，细密格栅投下变化的阴影。", "Roof louvers turn toward the sky and cast fine shadows."), [0, .85, 0], [.7, .7, 1], 1.7),
    ],
  },
  "slot-10": {
    kind: "fold", title: text("尚未写下，也值得期待。", "An unwritten chapter."),
    subtitle: "THE FOLDED PAVILION", material: text("陶土 · 折板 · 外露铰链", "TERRACOTTA / FOLDS / HINGES"), action: text("预留空间", "Available space"),
    chapters: [
      chapter(text("展开折阁", "Unfold pavilion"), text("陶土折板绕外露铰链展开，露出尚待入驻的双层工作室。", "Terracotta panels unfold on exposed hinges around an unoccupied two-story studio."), [0, .46, 0], [.6, .4, 1], 2.3),
      chapter(text("开放工作台", "Open studio"), text("长桌与展示台已经就位；这里没有虚构的应用入口。", "Workbenches and display plinths await a tenant. There is no pretend application link."), [0, .22, .15], [.15, .3, 1], 1.25),
      chapter(text("折纸屋檐", "Folded canopy"), text("抬头看折板屋檐与细长钢肋，建筑本身就是未完成的创作。", "Look up at the folded canopy and slender steel ribs: a work in progress."), [0, .88, 0], [.7, .6, 1], 1.7),
    ],
  },
  "slot-11": {
    kind: "orrery", title: text("下一站，也许在更远的地方。", "A little room for a bigger orbit."),
    subtitle: "THE CELESTIAL ROOM", material: text("深蓝玻璃 · 天球仪 · 金属弧", "BLUE GLASS / ORRERY / ARCS"), action: text("预留空间", "Available space"),
    chapters: [
      chapter(text("开启天穹", "Open the dome"), text("分瓣穹顶分离，环形天球仪缓缓显露；预留给未来的新项目。", "The segmented dome separates to reveal an orrery, reserved for a future project."), [0, .55, 0], [.7, .42, 1], 2.8),
      chapter(text("环轨观测", "Orbit room"), text("走近黄铜轨道与悬浮球体，观察机械天球仪的缓慢公转。", "Inspect brass orbits and suspended spheres as the mechanical orrery turns."), [0, .73, 0], [.2, .3, 1], 1.6),
      chapter(text("星台远眺", "Sky terrace"), text("绕到天穹台的高处，俯瞰环绕主体的金属弧与观景平台。", "View the celestial room from above, framed by metal arcs and an observation deck."), [0, .94, 0], [.7, .65, 1], 1.85),
    ],
  },
  "slot-12": {
    kind: "greenhouse", title: text("给还没发生的事，一片花园。", "A garden for an idea yet to grow."),
    subtitle: "THE GROWING HOUSE", material: text("温室玻璃 · 木肋 · 种植舱", "GLASS / TIMBER / PLANTERS"), action: text("预留空间", "Available space"),
    chapters: [
      chapter(text("开启温室", "Open greenhouse"), text("玻璃天窗像叶片一样抬起，露出木构温室与层叠种植台。", "Leaf-like skylights lift above a timber greenhouse and terraced planters."), [0, .46, 0], [.65, .45, 1], 2.15),
      chapter(text("生长内院", "Growing court"), text("沿阅读长椅走进内院。空间已经准备好，等待下一位应用住客。", "Follow reading benches into the court, ready for the next application to move in."), [0, .24, .1], [.2, .35, 1], 1.3),
      chapter(text("呼吸屋顶", "Breathing roof"), text("屋顶窗扇继续展开，查看木肋、种植池与玻璃之间的细节。", "Roof vents open further, revealing timber ribs, planted beds and glass joints."), [0, .85, 0], [.65, .65, 1], 1.7),
    ],
  },
};

/** 将来自界面或场景拾取的章节索引约束到三个有效机构状态。 */
export function clampChapter(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(2, Math.round(value))) : 0;
}

/** 返回一个楼位的空间体验；多楼层手稿馆继续使用它自己的电梯系统。 */
export function getBuildingExperience(id: PlaceId | null): BuildingExperience | undefined {
  return id ? buildingExperiences[id] : undefined;
}

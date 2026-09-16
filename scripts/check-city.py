"""对运行中的城市核验真实 WebGL、相机手势、建筑信息卡与降级；需要 Python Playwright。"""
import argparse

from playwright.sync_api import Locator, Page, expect, sync_playwright


def wait_for_camera(page: Page, label: str, *, visible: bool = True) -> None:
    """等待锚点投影稳定；远景允许楼牌不可见，仍检查真实三维投影坐标。"""
    page.locator(label).evaluate('(element) => { delete element.__smokePosition; }')
    page.wait_for_function(
        """({selector, visible}) => {
          const label = document.querySelector(selector);
          if (!label || !label.style.transform || (visible && getComputedStyle(label).visibility !== 'visible')) return false;
          const points = [...document.querySelectorAll('.city-label')].map(element => {
            const {x, y} = element.getBoundingClientRect(); return {x, y};
          });
          const previous = label.__smokePosition;
          const stable = previous && points.every((point, index) =>
            Math.hypot(point.x - previous.points[index].x, point.y - previous.points[index].y) < 0.1);
          label.__smokePosition = { points, since: stable ? previous.since : performance.now() };
          return performance.now() - label.__smokePosition.since >= 250;
        }""",
        arg={"selector": label, "visible": visible},
        timeout=15000,
    )


def projection_snapshot(page: Page) -> list[dict[str, float]]:
    """采样多个地标，避免同一视线上单点投影恰好不变造成误报。"""
    return page.locator('.city-label').evaluate_all('(elements) => elements.map(element => { const {x, y} = element.getBoundingClientRect(); return {x, y}; })')


def wait_for_projection_change(page: Page, before: list[dict[str, float]]) -> None:
    """证明当前操作改变了场景投影，不能用上一次飞行的稳定状态代替。"""
    page.wait_for_function(
        """before => {
          return [...document.querySelectorAll('.city-label')].filter((element, index) => {
            const anchor = element.getBoundingClientRect();
            return Math.hypot(anchor.x - before[index].x, anchor.y - before[index].y) > 8;
          }).length >= 2;
        }""",
        arg=before,
        timeout=15000,
    )


def open_information(page: Page, trigger: Locator, title: str, *, check_motion: bool = True) -> Locator:
    """信息先等待镜头到达再展开，并留在建筑场景内，不抢占整个页面。"""
    before = projection_snapshot(page)
    trigger.click()
    anchor = page.locator('.city-information-anchor')
    expect(anchor).to_have_attribute('data-visible', 'false', timeout=1000)
    expect(anchor).to_have_attribute('inert', '')
    if check_motion:
        wait_for_projection_change(page, before)
    expect(anchor).to_have_attribute('data-visible', 'true', timeout=15000)
    expect(anchor).to_have_attribute('data-in-frame', 'true')
    card = page.get_by_role('dialog', name=title, exact=True)
    expect(card).to_be_visible()
    expect(card).to_have_css('opacity', '1')
    expect(card).to_have_attribute('aria-modal', 'false')
    expect(card).to_be_focused()
    expect(page.locator('dialog')).to_have_count(0)
    expect(page.locator('.world-viewport .city-information')).to_have_count(1)
    expect(page.locator('.city-title')).not_to_be_visible()
    expect(page.locator('.map-corner')).not_to_be_visible()
    expect(page.locator('.city-dock')).to_be_visible()
    # 长内容在卡内滚动；城市页面自身保持全屏，不被内容撑开。
    body = card.locator('.city-information-body')
    expect(body).to_have_css('overflow-y', 'auto')
    if body.evaluate('(element) => element.scrollHeight > element.clientHeight + 1'):
        body.evaluate('(element) => { element.scrollTop = element.scrollHeight; }')
        assert body.evaluate('(element) => element.scrollTop') > 0
        body.evaluate('(element) => { element.scrollTop = 0; }')
    return card


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:3000')
parser.add_argument('--browser-channel', choices=('chrome', 'chromium'), default='chrome', help='使用已安装的完整浏览器，避免 headless-shell 软件 WebGL 阻塞。')
args = parser.parse_args()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, channel=args.browser_channel)
    try:
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, has_touch=True)
        errors: list[str] = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url, wait_until='networkidle')
        expect(page.locator('.city-scene')).to_have_attribute('data-ready', 'true', timeout=30000)
        expect(page.get_by_role('complementary', name='应用目录', exact=True)).to_have_count(0)
        print('PASS: WebGL 就绪，开始目录与模型点选。', flush=True)
        page.get_by_role('button', name='暂停城市动画', exact=True).click()
        page.get_by_role('button', name='操作说明', exact=True).click()
        expect(page.get_by_text('左键拖动', exact=True)).to_be_visible()
        expect(page.get_by_text('右键拖动', exact=True)).to_be_visible()
        page.get_by_role('button', name='操作说明', exact=True).click()

        # 从目录定位，避免用可能被楼体遮挡的初始标签作为选择前提。
        page.locator('.header-directory').click()
        directory = page.get_by_role('complementary', name='应用目录', exact=True)
        expect(directory.get_by_role('textbox', name='搜索应用')).to_be_focused()
        expect(directory.locator('.directory-building')).to_have_count(12)
        directory.get_by_role('button', name='探索 慢慢事务所', exact=True).click()
        expect(page.get_by_role('complementary', name='建筑详情')).to_be_focused()
        label_selector = '.city-label[aria-label="探索 慢慢事务所"]'
        wait_for_camera(page, label_selector)
        page.get_by_role('button', name='关闭建筑详情').click()
        wait_for_camera(page, label_selector)
        label = page.locator(label_selector)
        canvas = page.locator('.city-canvas').bounding_box()
        assert canvas is not None
        # 飞行焦点位于楼体中心；高楼屋顶标签可能已超出屏幕，不能用标签偏移定位。
        x, y = canvas['x'] + canvas['width'] / 2, canvas['y'] + canvas['height'] / 2
        # 首先证明坐标真正命中量化楼；后续拖回原点不会出现空通过。
        page.mouse.click(x, y)
        expect(page.locator('.place-detail')).to_be_visible()
        expect(page.locator('.place-detail h2')).to_have_text('慢慢事务所')
        page.get_by_role('button', name='关闭建筑详情').click()
        wait_for_camera(page, label_selector)
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 35, y + 20, steps=6)
        page.mouse.move(x, y, steps=6)
        page.mouse.up()
        expect(page.locator('.place-detail')).to_have_count(0)

        print('PASS: 12 楼目录、量化楼真实点选、拖回原点未误选。', flush=True)

        # 左键平移与右键旋转都必须改变真实相机投影，且不能触发选楼。
        for button in ('left', 'right'):
            before = label.evaluate('(element) => element.style.transform')
            page.mouse.move(950, 570)
            page.mouse.down(button=button)
            page.mouse.move(1010, 610, steps=8)
            page.mouse.up(button=button)
            page.wait_for_function(
                '([selector, before]) => document.querySelector(selector).style.transform !== before',
                arg=[label_selector, before],
            )
            expect(page.locator('.place-detail')).to_have_count(0)

        print('PASS: 左键平移与右键旋转改变真实相机投影。', flush=True)

        # 用真实浏览器触点，验证双指手势不会变成建筑点击。
        cdp = page.context.new_cdp_session(page)
        first = {'x': 850, 'y': 550, 'id': 1}
        second = {'x': 910, 'y': 550, 'id': 2}
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [first]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [first, second]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{**first, 'x': 835}, second]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [first]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        expect(page.locator('.place-detail')).to_have_count(0)
        print('PASS: 双指手势没有触发建筑选择。', flush=True)
        for view in ('街区近景', '街道视角', '城市俯瞰'):
            page.get_by_role('button', name=view, exact=True).click()
            expect(page.get_by_role('button', name=view, exact=True)).to_have_attribute('aria-pressed', 'true')
        page.get_by_role('button', name='自动航拍', exact=True).click()
        expect(page.get_by_role('button', name='自动航拍', exact=True)).to_have_attribute('aria-pressed', 'true')
        page.get_by_role('button', name='重置视角').click()
        expect(page.get_by_role('button', name='自动航拍', exact=True)).to_have_attribute('aria-pressed', 'false')
        page.get_by_role('button', name='切换到夜景', exact=True).click()
        expect(page.locator('.metropolis')).to_have_class('metropolis is-night')
        page.get_by_role('button', name='切换到黄昏', exact=True).click()

        print('PASS: 三视角、航拍、昼夜控制。', flush=True)
        # 六个街区镜头均检查实际三维锚点位移，不能仅凭浮层关闭判定跳转成功。
        # 公园、沙滩与港口分别覆盖从目录和应用详情出发的两种状态。
        page.get_by_role('button', name='暂停城市动画', exact=True).click()
        neighborhoods = ('西岸老城', '中央公园', '东湾城区', '北部新城', '海边走走', '货运港口')
        wait_for_camera(page, label_selector, visible=False)
        for zoom_button in ('放大', '缩小'):
            before = projection_snapshot(page)
            page.get_by_role('button', name=zoom_button, exact=True).click()
            wait_for_projection_change(page, before)
            wait_for_camera(page, label_selector, visible=False)
        print('PASS: 暂停后缩放仍同步更新楼牌投影。', flush=True)
        visits = [(name, 'directory') for name in neighborhoods] + [
            (name, 'detail') for name in ('中央公园', '海边走走', '货运港口')
        ]
        tour = page.get_by_role('navigation', name='漫步街区', exact=True)
        expect(tour.get_by_role('button')).to_have_count(6)
        for neighborhood, panel in visits:
            page.locator('.header-directory').click()
            directory = page.get_by_role('complementary', name='应用目录', exact=True)
            expect(directory).to_be_visible()
            if panel == 'detail':
                wait_for_camera(page, label_selector, visible=False)
                from_neighborhood = projection_snapshot(page)
                directory.get_by_role('button', name='探索 慢慢事务所', exact=True).click()
                expect(page.get_by_role('complementary', name='建筑详情')).to_be_visible()
                wait_for_projection_change(page, from_neighborhood)
            wait_for_camera(page, label_selector, visible=False)
            before = projection_snapshot(page)
            tour.get_by_role('button', name=neighborhood, exact=True).click()
            expect(page.get_by_role('complementary', name='应用目录', exact=True)).to_have_count(0)
            expect(page.get_by_role('complementary', name='建筑详情', exact=True)).to_have_count(0)
            wait_for_projection_change(page, before)
            wait_for_camera(page, label_selector, visible=False)
            print(f'PASS: {neighborhood} 从{panel}出发，真实相机投影改变且应用浮层关闭。', flush=True)
        page.get_by_role('button', name='重置视角', exact=True).click()

        wait_for_camera(page, label_selector, visible=False)
        news_trigger = page.get_by_role('button', name='新闻', exact=True)
        news = open_information(page, news_trigger, '城市日报')
        expect(news.locator('.journal-card')).to_be_visible()
        expect(news.locator('.guestbook-card')).not_to_be_visible()
        # 非模态卡不锁住城市：顶部导航仍可接收焦点，Escape 归还原入口。
        page.locator('.header-directory').evaluate('(button) => button.focus()')
        expect(page.locator('.header-directory')).to_be_focused()
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(news_trigger).to_be_focused()

        about = open_information(page, page.get_by_role('button', name='关于城主', exact=True), '关于 SN0VV')
        expect(about.get_by_role('link', name='在 GitHub 继续探索')).to_have_attribute('href', 'https://github.com/SN0VV0511')
        # 同一地标再次被选择也应重新推镜，信息先收起、到达后再展开。
        open_information(page, page.get_by_role('button', name='关于城主', exact=True), '关于 SN0VV', check_motion=False)
        expect(page.get_by_role('dialog')).to_have_count(1)
        page.get_by_role('button', name='关闭面板', exact=True).click()
        expect(page.get_by_role('button', name='关于城主', exact=True)).to_be_focused()

        guestbook_trigger = page.get_by_role('button', name='留言', exact=True)
        guestbook = open_information(page, guestbook_trigger, '海岸信箱')
        expect(guestbook.locator('.journal-card')).not_to_be_visible()
        page.get_by_label('怎么称呼你', exact=True).fill('浏览器回归')
        page.get_by_label('写下一句问候或一个想法', exact=True).fill('这是保存在测试浏览器里的私人草稿。')
        page.get_by_role('button', name='保存草稿', exact=True).click()
        expect(page.locator('.guestbook-card [role="status"]')).to_contain_text('草稿已保存在此浏览器')
        page.get_by_role('button', name='关闭面板', exact=True).click()
        open_information(page, guestbook_trigger, '海岸信箱', check_motion=False)
        expect(page.get_by_label('怎么称呼你', exact=True)).to_have_value('浏览器回归')
        page.reload(wait_until='networkidle')
        expect(page.locator('.city-scene')).to_have_attribute('data-ready', 'true', timeout=30000)
        open_information(page, guestbook_trigger, '海岸信箱')
        expect(page.get_by_label('怎么称呼你', exact=True)).to_have_value('浏览器回归')
        page.get_by_role('button', name='关闭面板', exact=True).click()

        print('PASS: 关于/新闻/留言真实镜头推近后展开非模态卡、卡内滚动、焦点归还、草稿恢复。', flush=True)
        # 快速换楼必须以最后一次选择为准；中断飞行不能迟到重开信息卡。
        news_trigger.click()
        expect(page.locator('.city-information-anchor')).to_have_attribute('data-visible', 'false')
        page.get_by_role('button', name='关于城主', exact=True).click()
        expect(page.locator('.city-information-anchor')).to_have_attribute('data-visible', 'true', timeout=15000)
        expect(page.get_by_role('dialog', name='关于 SN0VV', exact=True)).to_be_visible()
        expect(page.get_by_role('dialog')).to_have_count(1)
        expect(page.locator('.city-information.panel-news')).to_have_count(0)
        page.get_by_role('button', name='关闭面板', exact=True).click()
        page.get_by_role('button', name='城市总览', exact=True).click()
        wait_for_camera(page, label_selector, visible=False)
        page.get_by_role('button', name='关于城主', exact=True).click()
        expect(page.locator('.city-information-anchor')).to_have_attribute('data-visible', 'false')
        page.keyboard.press('Escape')
        expect(page.locator('.city-information-anchor')).to_have_count(0)
        page.wait_for_timeout(2300)  # 超过公共建筑 2200ms 飞行周期，检查旧完成回调。
        expect(page.locator('.city-information-anchor')).to_have_count(0)
        expect(page.get_by_role('button', name='关于城主', exact=True)).to_be_focused()
        print('PASS: 快速新闻到关于切换只展开最终地标，Escape 中断后无迟到重开。', flush=True)

        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth') == 390
        assert page.evaluate('document.documentElement.scrollHeight') == 844
        page.get_by_role('button', name='应用', exact=True).click()
        directory = page.get_by_role('complementary', name='应用目录', exact=True)
        directory.get_by_role('button', name='探索 AFFiNE', exact=True).click()
        expect(page.get_by_role('complementary', name='建筑详情')).to_be_focused()
        page.get_by_role('button', name='关闭建筑详情', exact=True).click()
        wait_for_camera(page, label_selector, visible=False)
        mobile_card = open_information(page, guestbook_trigger, '海岸信箱')
        expect(page.get_by_label('怎么称呼你', exact=True)).to_have_value('浏览器回归')
        bounds = mobile_card.bounding_box()
        assert bounds is not None
        assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 390
        assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= 844
        assert bounds['height'] <= 844 * 0.48 + 1
        assert page.evaluate('document.documentElement.scrollWidth') == 390
        assert page.evaluate('document.documentElement.scrollHeight') == 844
        page.get_by_role('button', name='关闭面板', exact=True).click()
        assert not errors, errors

        print('PASS: 手机全屏与信息卡无溢出、卡高限制、草稿恢复、目录选择与焦点。', flush=True)
        page.close()
        fallback = browser.new_page(viewport={'width': 390, 'height': 844})
        fallback.on('pageerror', lambda error: errors.append(str(error)))
        fallback.add_init_script("""const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            return type.startsWith('webgl') ? null : original.call(this, type, ...args);
          };""")
        fallback.goto(args.url, wait_until='networkidle')
        expect(fallback.get_by_text('城市暂时进入平面模式')).to_be_visible()
        fallback.get_by_role('button', name='应用', exact=True).click()
        fallback.get_by_role('button', name='探索 慢慢事务所', exact=True).click()
        expect(fallback.get_by_role('link', name='查看源码', exact=True)).to_have_attribute('href', 'https://github.com/SN0VV0511/quant-a-stock')
        for trigger_name, title in (('关于城主', '关于 SN0VV'), ('新闻', '城市日报')):
            fallback.get_by_role('button', name=trigger_name, exact=True).click()
            anchor = fallback.locator('.city-information-anchor')
            expect(anchor).to_have_attribute('data-fallback', 'true')
            expect(anchor).to_have_attribute('data-visible', 'true')
            card = fallback.get_by_role('dialog', name=title, exact=True)
            expect(card).to_be_visible()
            expect(card).to_have_attribute('aria-modal', 'false')
            expect(card).to_be_focused()
            if trigger_name == '关于城主':
                expect(card.get_by_role('link', name='在 GitHub 继续探索')).to_be_visible()
            else:
                expect(card.locator('.journal-card')).to_be_visible()
            fallback.get_by_role('button', name='关闭面板', exact=True).click()
        fallback.close()
        print('PASS: 无 WebGL 时应用入口、关于卡和新闻卡仍可操作。', flush=True)

        reduced = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        reduced.on('pageerror', lambda error: errors.append(str(error)))
        reduced.goto(args.url, wait_until='networkidle')
        expect(reduced.locator('.city-scene')).to_have_attribute('data-ready', 'true', timeout=30000)
        reduced.get_by_role('button', name='关于城主', exact=True).click()
        # 减少动态效果时不等待 2200ms 飞行；镜头直接定位，卡片立即可用。
        expect(reduced.locator('.city-information-anchor')).to_have_attribute('data-visible', 'true', timeout=1000)
        reduced_card = reduced.get_by_role('dialog', name='关于 SN0VV', exact=True)
        expect(reduced_card).to_be_visible(timeout=1000)
        expect(reduced_card).to_have_css('opacity', '1', timeout=1000)
        expect(reduced_card).to_have_attribute('aria-modal', 'false')
        expect(reduced_card).to_be_focused(timeout=1000)
        reduced.close()
        assert not errors, errors
        print('PASS: 真实 WebGL、12 楼目录、模型点选、左键平移、右键旋转、拖回原点、双指手势、三视角/航拍、六街区镜头与浮层归位、昼夜、公共建筑镜头与非模态信息卡、快速切换和中断、草稿恢复、手机全屏无溢出、无 WebGL 降级、减少动态效果；页面错误 0。')
    finally:
        browser.close()

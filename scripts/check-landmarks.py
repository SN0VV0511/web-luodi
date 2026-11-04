"""验证十一栋地标的真实 WebGL 交互、移动端构图、键盘与降级入口。"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

LOGGER = logging.getLogger("city-landmarks")
BUILDINGS = [
    ("quant", "慢慢事务所"), ("affine", "AFFiNE"), ("agents", "Agent Base"),
    ("openclaw", "OpenClaw"), ("slot-5", "LunaTV"),
    ("slot-6", "LunaTV 源浏览器"), ("slot-7", "微信推送"),
    ("slot-9", "Office 09"), ("slot-10", "Office 10"),
    ("slot-11", "Office 11"), ("slot-12", "Office 12"),
]


def wait_for_camera(page: Page) -> None:
    """等待相机投影稳定，而不是以固定延迟冒充完成。"""
    page.evaluate("delete window.__landmarkCameraCheck")
    page.wait_for_function("""() => {
        if (document.querySelector('.landmark-playback .is-approaching')) return false;
        const positions = [...document.querySelectorAll('.city-label')].map(el => el.style.transform).join('|');
        const previous = window.__landmarkCameraCheck;
        const same = previous && previous.positions === positions;
        window.__landmarkCameraCheck = {positions, since: same ? previous.since : performance.now()};
        return performance.now() - window.__landmarkCameraCheck.since > 350;
    }""", timeout=20000)


def explore(page: Page, name: str) -> None:
    """从真实目录进入，避免把同名三维楼牌误当成目录按钮。"""
    page.locator('.header-directory').click()
    directory = page.get_by_role('complementary', name='应用目录', exact=True)
    directory.get_by_role('button', name=f'探索 {name}', exact=True).click()
    expect(page.locator('.landmark-console h2')).to_have_text(name)
    wait_for_camera(page)


def check_layout(page: Page) -> None:
    """导览和可操作目标留在视口内；不以裁切正文换取页面无横向溢出。"""
    viewport = page.viewport_size
    assert viewport is not None
    bounds = page.locator('.landmark-console').bounding_box()
    assert bounds is not None
    assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= viewport['width'] + 1
    assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= viewport['height'] + 1
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    for button in page.locator('.landmark-chapters > button').all():
        box = button.bounding_box()
        assert box is not None and box['height'] >= 44 and box['width'] >= 44


def walkthrough(page: Page, output: Path, prefix: str) -> None:
    """逐栋核验三个章节、返回镜头、重播、无自动弹窗和所有预留空间。"""
    for place_id, name in BUILDINGS:
        explore(page, name)
        panel = page.locator(f'[data-landmark="{place_id}"]')
        expect(panel).to_be_visible()
        check_layout(page)
        if place_id in {'quant', 'openclaw', 'agents', 'affine', 'slot-5', 'slot-11'}:
            page.screenshot(path=str(output / f'{prefix}-{place_id}-0.png'))
        controls = page.locator('.landmark-chapters > button')
        expect(controls).to_have_count(3)
        for index in (1, 2):
            before = page.locator('.city-label').evaluate_all('(els) => els.map(el => el.style.transform)')
            controls.nth(index).click()
            expect(controls.nth(index)).to_have_attribute('aria-pressed', 'true')
            wait_for_camera(page)
            after = page.locator('.city-label').evaluate_all('(els) => els.map(el => el.style.transform)')
            assert after != before, f'{name} 第 {index + 1} 个视角没有改变相机'
            expect(controls.nth(index)).to_be_focused()
            if index == 1 and place_id in {'openclaw', 'agents', 'slot-5', 'slot-7'}:
                page.screenshot(path=str(output / f'{prefix}-{place_id}-{index}.png'))
        page.get_by_role('button', name='重新演示建筑机构').click()
        wait_for_camera(page)
        assert len(page.context.pages) == 1, '选楼或操作机构不应打开新标签页'
        if place_id.startswith('slot-') and int(place_id.split('-')[1]) >= 9:
            expect(panel.get_by_role('link')).to_have_count(0)
            expect(panel).to_contain_text('这栋楼，留给下一个新想法')
        else:
            for link in panel.get_by_role('link').all():
                assert link.get_attribute('rel') == 'noopener noreferrer'
        page.keyboard.press('Escape')
        expect(page.locator('[data-landmark]')).to_have_count(0)
        expect(page.get_by_role('button', name='应用', exact=True)).to_be_focused()
        wait_for_camera(page)
        LOGGER.info('PASS %s: %s 的三个视角、重播、布局与返回', prefix, name)


def main() -> None:
    """通过本地预览地址运行浏览器回归，并保存供人工检查的截图。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:3101')
    parser.add_argument('--output', type=Path, default=Path('/tmp/city-landmark-checks'))
    parser.add_argument('--browser-channel', default='chrome', choices=('chrome', 'chromium'))
    parser.add_argument('--compat-only', action='store_true', help='复用已通过的 66 个章节检查，只复测兼容性与响应式状态。')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=args.browser_channel, headless=True)
        errors: list[str] = []
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url, wait_until='networkidle')
            expect(page.locator('.city-scene')).to_have_attribute('data-ready', 'true', timeout=60000)
            if not args.compat_only:
                walkthrough(page, args.output, 'desktop')
            # 暂停仍允许显式机构切换；关闭后回到静止城市，投影不持续漂移。
            page.get_by_role('button', name='暂停城市动画', exact=True).click()
            explore(page, 'OpenClaw')
            page.locator('.landmark-chapters > button').nth(1).click()
            wait_for_camera(page)
            page.get_by_role('button', name='切换到夜景', exact=True).click()
            expect(page.locator('main')).to_have_class('metropolis is-night is-inspecting-landmark')
            page.screenshot(path=str(args.output / 'night-workshop.png'))
            page.get_by_role('button', name='切换到黄昏', exact=True).click()
            page.keyboard.press('Escape')
            page.get_by_role('button', name='播放城市动画', exact=True).click()
            page.set_viewport_size({'width': 390, 'height': 844})
            if not args.compat_only:
                walkthrough(page, args.output, 'mobile')
            for viewport in [{'width': 820, 'height': 1180}, {'width': 740, 'height': 390}]:
                page.set_viewport_size(viewport)
                explore(page, 'AFFiNE')
                check_layout(page)
                page.screenshot(path=str(args.output / f'responsive-{viewport["width"]}.png'))
                page.keyboard.press('Escape')
            # 手稿馆独立系统没有被新的章节机构替换。
            page.set_viewport_size({'width': 1440, 'height': 1000})
            page.locator('.header-directory').click()
            page.locator('.directory-panel').get_by_role('button', name='探索 技术手稿馆', exact=True).click()
            expect(page.locator('.spatial-elevator-console')).to_be_visible(timeout=10000)
            page.get_by_role('textbox', name='电梯搜索直达').fill('LoRA')
            page.get_by_role('button', name='电梯直达', exact=True).click()
            expect(page.locator('.elevator-led-screen .led-digits')).to_contain_text('2F')
            LOGGER.info('PASS: 08 号手稿馆电梯与楼层仍正常')
            # 手稿馆会持续渲染独立展厅；关闭上个页面，避免多个 WebGL 上下文争用同一 GPU。
            page.close()
            # 系统减少动态偏好不会等待飞行动画，也保留同样的章节和应用链接。
            reduced = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
            reduced.on('pageerror', lambda error: errors.append(str(error)))
            reduced.goto(args.url, wait_until='networkidle')
            expect(reduced.locator('.city-scene')).to_have_attribute('data-ready', 'true', timeout=60000)
            wait_for_camera(reduced)
            origin = reduced.locator('.city-label').evaluate_all('(els) => els.map(el => el.style.transform)')
            explore(reduced, '微信推送')
            reduced.locator('.landmark-chapters > button').nth(2).click()
            expect(reduced.locator('.landmark-playback .is-approaching')).to_have_count(0)
            check_layout(reduced)
            reduced.screenshot(path=str(args.output / 'reduced-motion.png'))
            reduced.keyboard.press('Escape')
            wait_for_camera(reduced)
            # 上一次停在第三章节，下一次换楼会重置章节；不能抢先覆盖返回镜头。
            explore(reduced, 'AFFiNE')
            reduced.keyboard.press('Escape')
            wait_for_camera(reduced)
            restored = reduced.locator('.city-label').evaluate_all('(els) => els.map(el => el.style.transform)')
            assert restored == origin, '减少动态模式切楼后没有恢复原始镜头'
            reduced.close()
            fallback = browser.new_page(viewport={'width': 390, 'height': 844})
            fallback.add_init_script("""(() => {
              const original = HTMLCanvasElement.prototype.getContext;
              HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
                if (String(kind).includes('webgl')) return null;
                return original.call(this, kind, ...args);
              };
            })();""")
            fallback.goto(args.url, wait_until='networkidle')
            expect(fallback.locator('.city-scene-fallback')).to_be_visible(timeout=10000)
            fallback.locator('.header-directory').click()
            fallback.locator('.directory-panel').get_by_role('button', name='探索 LunaTV', exact=True).click()
            expect(fallback.locator('.landmark-enter')).to_have_attribute('href', 'https://tv.sn0vv.top/')
            check_layout(fallback)
            fallback.close()
            assert not errors, '\n'.join(errors)
            LOGGER.info('PASS: 昼夜、暂停、手机、横屏、平板、减少动态与无 WebGL 入口；无页面异常')
        finally:
            browser.close()


if __name__ == '__main__':
    main()

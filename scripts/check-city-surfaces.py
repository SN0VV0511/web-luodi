"""核验城市近景与昼夜材质的真实 WebGL 编译，保存截图供人工检查。"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Page, expect, sync_playwright


LOGGER = logging.getLogger(__name__)


def capture(page: Page, output: Path, name: str) -> None:
    """等待真实相机投影稳定，将当前画面保存到输出目录。"""
    page.locator(".city-canvas").evaluate(
        "canvas => { delete canvas.__surfaceSignature; delete canvas.__surfaceStableSince; }"
    )
    page.wait_for_function(
        """() => {
            const canvas = document.querySelector('.city-canvas');
            const positions = [...document.querySelectorAll('.city-label')].map(label => label.style.transform);
            if (!canvas || !positions.length || positions.some(position => !position)) return false;
            const signature = positions.join('|');
            if (canvas.__surfaceSignature !== signature) {
                canvas.__surfaceSignature = signature;
                canvas.__surfaceStableSince = performance.now();
            }
            return performance.now() - canvas.__surfaceStableSince > 300;
        }""",
        timeout=20000,
    )
    page.screenshot(path=str(output / f"{name}.png"), full_page=True)
    LOGGER.info("已保存画面：%s", name)


def check_surfaces(url: str, output: Path) -> None:
    """访问城市，检查总览、公园、街道、车辆与行人近景、夜景和手机画面的渲染错误。"""
    output.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []

    def record_console(message: ConsoleMessage) -> None:
        if message.type == "error":
            errors.append(f"{message.text} ({message.location.get('url', '')})")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        try:
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", record_console)
            # 静态导出不提供行情后端；使用固定空仓快照，仅验证材质而不依赖外部服务。
            page.route("**/quantify/api/public/positions", lambda route: route.fulfill(
                json={"updatedAt": "材质回归", "positions": [], "cash": 0, "totalValue": 0, "dayPnl": 0}
            ))
            page.goto(url, wait_until="networkidle")
            expect(page.locator('.city-scene')).to_have_attribute("data-ready", "true", timeout=60000)
            page.get_by_role("button", name="暂停城市动画", exact=True).click()
            capture(page, output, "overview-day")
            tour = page.get_by_role("navigation", name="漫步街区", exact=True)
            tour.get_by_role("button", name="中央公园", exact=True).click()
            capture(page, output, "park-day")
            page.get_by_role("button", name="切换到夜景", exact=True).click()
            expect(page.locator(".metropolis")).to_have_class("metropolis is-night")
            capture(page, output, "park-night")
            page.get_by_role("button", name="切换到黄昏", exact=True).click()
            page.get_by_role("button", name="街道视角", exact=True).click()
            capture(page, output, "street-day")
            scenes = page.get_by_role("complementary", name="小镇实时剧场", exact=True)
            scenes.get_by_role("button").filter(has_text="路口追尾与车主争吵").click()
            capture(page, output, "cars-and-people")
            scenes.get_by_role("button").filter(has_text="鲜活超市推车采购").click()
            capture(page, output, "pedestrians")
            page.get_by_role("button", name="重置视角", exact=True).click()
            page.set_viewport_size({"width": 390, "height": 844})
            capture(page, output, "mobile-day")
            if page.evaluate("document.documentElement.scrollWidth") != 390:
                raise AssertionError("手机画面出现横向溢出")
            if errors:
                raise AssertionError("浏览器或 WebGL 编译出现错误：\n" + "\n".join(errors))
            LOGGER.info("总览、公园昼夜、街道、车辆与行人近景和手机画面检查通过；浏览器错误 0")
        finally:
            browser.close()


def main() -> None:
    """解析本地服务与截图参数；检查失败时记录异常并返回非零退出码。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:3000")
    parser.add_argument("--output", type=Path, required=True, help="截图输出目录")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        check_surfaces(args.url, args.output)
    except Exception:
        LOGGER.exception("城市材质回归检查失败")
        raise SystemExit(1)


if __name__ == "__main__":
    main()

"""在同一 Chrome/窗口/DPR 下对比城市首屏和绘制开销，不依赖生产调试入口。"""
import argparse
import json
import statistics

from playwright.sync_api import sync_playwright


PROBE = """(() => {
  const stats = window.__cityProfile = {ready: 0, tasks: [], frames: [], calls: 0, triangles: 0};
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) stats.tasks.push({start: entry.startTime, duration: entry.duration});
  }).observe({type: 'longtask', buffered: true});
  new MutationObserver(() => {
    if (!stats.ready && document.querySelector('.city-scene[data-ready="true"]')) stats.ready = performance.now();
  }).observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-ready']});
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const original = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function(...args) {
      stats.calls++;
      const count = name.startsWith('drawArrays') ? args[2] : args[1];
      const instances = name.endsWith('Instanced') ? args.at(-1) : 1;
      if (args[0] === this.TRIANGLES) stats.triangles += count / 3 * instances;
      return original.apply(this, args);
    };
  }
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => request(time => {
    const start = performance.now(), calls = stats.calls, triangles = stats.triangles;
    try { callback(time); } finally {
      if (stats.calls > calls) stats.frames.push({start, duration: performance.now() - start, calls: stats.calls - calls, triangles: stats.triangles - triangles});
    }
  });
})();"""


def percentile(values: list[float], fraction: float) -> float:
    return sorted(values)[min(len(values) - 1, int(len(values) * fraction))] if values else 0


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:3001')
parser.add_argument('--runs', type=int, default=3)
parser.add_argument('--output')
parser.add_argument('--check', action='store_true', help='校验固定场景的像素和绘制预算；耗时只报告，不使用依赖硬件的门槛。')
args = parser.parse_args()
if args.runs < 1:
    parser.error('--runs 必须大于零')
results = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='chrome', headless=True)
    try:
        for _ in range(args.runs):
            context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
            page = context.new_page()
            page.add_init_script(PROBE)
            page.goto(args.url, wait_until='domcontentloaded')
            page.wait_for_function('window.__cityProfile.ready > 0', timeout=60000)
            # 固定采样窗口是性能测量本身，不作为功能通过的等待条件。
            page.wait_for_timeout(4000)
            stats = page.evaluate('window.__cityProfile')
            frames = [frame for frame in stats['frames'] if frame['start'] > stats['ready'] + 300]
            if len(frames) < 2:
                raise RuntimeError('采样窗口内没有持续渲染，无法评估城市性能')
            intervals = [b['start'] - a['start'] for a, b in zip(frames, frames[1:])]
            result = {
                'ready_ms': round(stats['ready']),
                'startup_long_task_max_ms': round(max((task['duration'] for task in stats['tasks'] if task['start'] < stats['ready']), default=0)),
                'frame_cpu_median_ms': round(statistics.median(frame['duration'] for frame in frames), 2),
                'frame_cpu_p95_ms': round(percentile([frame['duration'] for frame in frames], .95), 2),
                'draw_calls_median': round(statistics.median(frame['calls'] for frame in frames)),
                'draw_calls_mean': round(statistics.mean(frame['calls'] for frame in frames), 1),
                'triangles_median': round(statistics.median(frame['triangles'] for frame in frames)),
                'triangles_mean': round(statistics.mean(frame['triangles'] for frame in frames)),
                'frame_interval_median_ms': round(statistics.median(intervals), 2),
                'canvas': page.locator('.city-canvas').evaluate('(canvas) => [canvas.width, canvas.height]'),
            }
            results.append(result)
            print(json.dumps(result), flush=True)
            if args.check:
                assert result['canvas'][0] * result['canvas'][1] <= 2_000_000, 'WebGL 超过两百万像素预算'
                assert result['draw_calls_mean'] < 250, '静止总览平均绘制次数退化'
            context.close()
    finally:
        browser.close()
if args.output:
    from pathlib import Path
    Path(args.output).write_text(json.dumps(results, indent=2) + '\n')

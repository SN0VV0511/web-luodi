import type { LakeWater } from "../water/lake-water";
import { SceneStage } from "./props";
import { buildLakeLife } from "./lake-life";
import { buildBeachLife } from "./beach-life";
import { buildStreetEvents } from "./street-events";

/** v3 生活场景层：湖畔垂钓与划船、海滩排球与日光浴等，共用一组实例化蒙皮人体。 */
export function buildV3Scenes(lake: LakeWater) {
  const stage = new SceneStage("v3 city life scenes", 96);
  const lakeLife = buildLakeLife(stage, lake);
  const beach = buildBeachLife(stage);
  const eventStage = new SceneStage("v3 city random events", 140);
  stage.group.add(eventStage.group);
  const events = buildStreetEvents(eventStage);
  const animate = (seconds: number, night: boolean, precipitation = 0) => {
    stage.begin();
    lakeLife.animate(seconds, night);
    beach.animate(seconds);
    stage.end();
    eventStage.begin();
    events.animate(seconds, night, precipitation);
    eventStage.end();
  };
  return { group: stage.group, stage, animate, lake: lakeLife, beach, events, dispose: () => { stage.dispose(); eventStage.dispose(); } };
}

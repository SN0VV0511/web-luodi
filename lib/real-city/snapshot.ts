import type { ActiveCityIncident } from "../city-events";
import type { Locale } from "../site-content";

export type CityLifeSnapshot = {
  residents: number;
  activeActivities: {
    id: string;
    title: { zh: string; en: string };
    detail: { zh: string; en: string };
    x: number;
    z: number;
    progress: number;
  }[];
};

/** The drawer reads the running simulation, so a visible activity and its map marker agree. */
export function liveCityIncidents(snapshot: CityLifeSnapshot | null, locale: Locale): ActiveCityIncident[] {
  if (!snapshot) return [];
  return snapshot.activeActivities.map((activity) => ({
    id: `live-${activity.id}`,
    kind: "life",
    code: locale === "zh" ? "街区生活" : "NEIGHBORHOOD",
    severity: "info",
    title: activity.title[locale],
    detail: activity.detail[locale],
    locationName: locale === "zh" ? "市民正在这里活动" : "Residents are here now",
    phaseLabel: locale === "zh" ? "正在发生" : "Happening now",
    progress: Math.max(0, Math.min(1, activity.progress)),
    x: activity.x,
    z: activity.z,
    focusDistance: 17,
    focusHeight: 1.5,
  }));
}

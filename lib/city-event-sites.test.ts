import { beforeEach, describe, expect, it } from "vitest";
import { getActiveCityIncidents, sampleFireIncident } from "./city-events";
import {
  BURGLAR_SITES,
  DELIVERY_SITES,
  EVENT_RECENT_LIMIT,
  FIRE_SITES,
  MEDICAL_SITES,
  POLICE_STOP_SITES,
  TAXI_SITES,
  TRAFFIC_SITES,
  UTILITY_SITES,
  eventCatalogCounts,
  getEventSession,
  getSessionTrafficCrashSite,
  isSiteReachable,
  pickBurglarSite,
  pickFireSite,
  pickMedicalSite,
  pickPoliceStopSite,
  pickUtilitySite,
  resetEventSession,
} from "./city-event-sites";

describe("城市随机事件选址", () => {
  beforeEach(() => {
    resetEventSession({ seed: 7, persist: false });
  });

  it("每类突发事件都有足够多、且消防车/应急车辆可到达的候选点", () => {
    const counts = eventCatalogCounts();
    expect(counts.fire).toBeGreaterThanOrEqual(16);
    expect(counts.burglar).toBeGreaterThanOrEqual(8);
    expect(counts.medical).toBeGreaterThanOrEqual(8);
    expect(counts.utility).toBeGreaterThanOrEqual(8);
    expect(counts.traffic).toBeGreaterThanOrEqual(6);
    expect(counts.policeStop).toBeGreaterThanOrEqual(8);
    expect(counts.delivery).toBeGreaterThanOrEqual(4);
    expect(counts.taxi).toBeGreaterThanOrEqual(4);

    expect(FIRE_SITES.every(isSiteReachable)).toBe(true);
    expect(BURGLAR_SITES.every(isSiteReachable)).toBe(true);
    expect(MEDICAL_SITES.every(isSiteReachable)).toBe(true);
    expect(UTILITY_SITES.every(isSiteReachable)).toBe(true);

    const fireDistricts = new Set(FIRE_SITES.map((site) => site.zhLoc.slice(0, 2)));
    expect([...fireDistricts]).toEqual(expect.arrayContaining(["西城", "东湾", "北城"]));
  });

  it("50 次模拟访问火灾点位充分分散，且不会立刻重复上一访的楼", () => {
    const firstPicks: string[] = [];
    let recent: Record<string, string[]> = {};
    for (let session = 0; session < 50; session++) {
      resetEventSession({ seed: (session + 1) * 7919 + 13, recent, persist: false });
      const site = pickFireSite(0);
      expect(isSiteReachable(site)).toBe(true);
      if (session > 0) expect(site.id).not.toEqual(firstPicks[session - 1]);
      firstPicks.push(site.id);
      const nextCycle = pickFireSite(1);
      expect(nextCycle.id).not.toEqual(site.id);
      expect(isSiteReachable(nextCycle)).toBe(true);
      recent = getEventSession().recent;
    }
    expect(new Set(firstPicks).size).toBeGreaterThanOrEqual(8);

    for (const kind of ["burglar", "medical", "utility", "police-stop"] as const) {
      const ids: string[] = [];
      recent = {};
      for (let session = 0; session < 50; session++) {
        resetEventSession({ seed: (session + 3) * 104729 + kind.length, recent, persist: false });
        const site =
          kind === "burglar"
            ? pickBurglarSite(0)
            : kind === "medical"
              ? pickMedicalSite(0)
              : kind === "utility"
                ? pickUtilitySite(0)
                : pickPoliceStopSite(0);
        if (session > 0) expect(site.id).not.toEqual(ids[session - 1]);
        ids.push(site.id);
        recent = getEventSession().recent;
      }
      expect(new Set(ids).size, kind).toBeGreaterThanOrEqual(Math.min(6, EVENT_RECENT_LIMIT - 1));
    }
  });

  it("同一访问内火灾点位随周期轮换，且时间推进时保持稳定", () => {
    resetEventSession({ seed: 20261112, persist: false });
    const early = sampleFireIncident(4);
    const laterSameCycle = sampleFireIncident(20);
    const nextCycle = sampleFireIncident(42);
    expect(early.site.id).toEqual(laterSameCycle.site.id);
    expect(nextCycle.site.id).not.toEqual(early.site.id);
    expect(getActiveCityIncidents(4, "zh")[0]?.locationName).toEqual(getActiveCityIncidents(20, "zh")[0]?.locationName);
    expect(getActiveCityIncidents(4, "zh")[0]?.locationName).not.toEqual(getActiveCityIncidents(42, "zh")[0]?.locationName);
    const firstVisit = getSessionTrafficCrashSite().id;
    resetEventSession({ seed: 99, recent: getEventSession().recent, persist: false });
    expect(getSessionTrafficCrashSite().id).not.toEqual(firstVisit);
  });
});

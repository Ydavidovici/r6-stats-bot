import { test, expect, describe } from "bun:test";
import {
  fmtNum,
  fmtKd,
  fmtPct,
  signed,
  fmtHoursFromMs,
  relTime,
  PLATFORM_LABEL,
} from "../src/lib/format.js";

describe("format helpers", () => {
  test("fmtNum", () => {
    expect(fmtNum(6389)).toBe("6,389");
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(null)).toBe("0");
  });
  test("fmtKd always 2dp", () => {
    expect(fmtKd(1.8992)).toBe("1.90");
    expect(fmtKd(2)).toBe("2.00");
    expect(fmtKd(0)).toBe("0.00");
  });
  test("fmtPct rounds to given precision", () => {
    expect(fmtPct(83.78)).toBe("84%");
    expect(fmtPct(60.71, 1)).toBe("60.7%");
    expect(fmtPct(0)).toBe("0%");
  });
  test("signed", () => {
    expect(signed(447)).toBe("+447");
    expect(signed(-30)).toBe("-30");
    expect(signed(0)).toBe("+0");
  });
  test("fmtHoursFromMs rounds to whole hours", () => {
    expect(fmtHoursFromMs(6451938130)).toBe("1,792h");
    expect(fmtHoursFromMs(0)).toBe("0h");
  });
  test("relTime", () => {
    expect(relTime(Date.now() - 5000)).toBe("5s ago");
    expect(relTime(Date.now() - 120000)).toBe("2m ago");
    expect(relTime(Date.now() - 7200000)).toBe("2h ago");
  });
  test("PLATFORM_LABEL", () => {
    expect(PLATFORM_LABEL.uplay).toBe("PC");
  });
});

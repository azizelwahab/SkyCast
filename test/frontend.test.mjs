import test from "node:test";
import assert from "node:assert/strict";
import { formatTemp, formatWind, normalizePrefs, toDisplayTemp, toDisplayWind } from "../public/js/units.js";
import { describeWeather, KNOWN_CODES } from "../public/js/weatherCodes.js";
import { addDays, formatDate, hhmm, hour12 } from "../public/js/format.js";
import {
  addLocation, MAX_SAVED, parseLocation, parseSavedLocations, readJSON, removeLocation,
} from "../public/js/storage.js";

// ---- Unit conversion -------------------------------------------------------
test("temperature converts between Celsius and Fahrenheit", () => {
  assert.equal(toDisplayTemp(0, "F"), 32);
  assert.equal(toDisplayTemp(100, "F"), 212);
  assert.equal(toDisplayTemp(-40, "F"), -40);
  assert.equal(toDisplayTemp(21.6, "C"), 22);
  assert.equal(formatTemp(-0.2, "C"), "0°");
});

test("wind units are independent of temperature units", () => {
  assert.equal(formatWind(100, "kmh"), "100 km/h");
  assert.equal(formatWind(100, "mph"), "62 mph");
  assert.equal(toDisplayWind(0, "mph"), 0);
  const prefs = normalizePrefs({ temp: "F", wind: "kmh" });
  assert.deepEqual(prefs, { temp: "F", wind: "kmh" });
});

test("invalid preferences fall back to defaults", () => {
  assert.deepEqual(normalizePrefs(null), { temp: "C", wind: "kmh" });
  assert.deepEqual(normalizePrefs({ temp: "K", wind: 5 }), { temp: "C", wind: "kmh" });
});

// ---- Weather codes ---------------------------------------------------------
test("every WMO code Open-Meteo can return is supported", () => {
  const wmo = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  for (const code of wmo) assert.notEqual(describeWeather(code).label, "Unknown conditions", `code ${code}`);
  assert.equal(KNOWN_CODES.length, wmo.length);
  assert.equal(describeWeather(12345).label, "Unknown conditions");
  assert.notEqual(describeWeather(0, true).icon, describeWeather(0, false).icon);
});

// ---- Dates and timezones ---------------------------------------------------
test("local date strings are never shifted by time zone", () => {
  assert.equal(formatDate("2026-01-17", { weekday: "long" }, "en-US"), "Saturday");
  assert.equal(formatDate("2026-03-29", { day: "numeric", month: "short" }, "en-US"), "Mar 29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(hhmm("2026-01-16T14:32"), "14:32");
  assert.equal(hour12(0), "12am");
  assert.equal(hour12(13), "1pm");
});

// ---- Saved-location validation ----------------------------------------------
const paris = { name: "Paris", country: "FR", lat: 48.85, lon: 2.35 };

test("parseLocation accepts valid data and rejects bad data", () => {
  assert.deepEqual(parseLocation(paris), paris);
  assert.equal(parseLocation(null), null);
  assert.equal(parseLocation({ ...paris, name: "" }), null);
  assert.equal(parseLocation({ ...paris, lat: "48.85" }), null);
  assert.equal(parseLocation({ ...paris, lat: 91 }), null);
  assert.equal(parseLocation({ ...paris, lon: NaN }), null);
});

test("parseSavedLocations drops corrupt entries and duplicates", () => {
  const raw = [paris, { ...paris, lat: 48.851 }, { name: 5 }, "junk", null, { name: "Rome", lat: 41.9, lon: 12.5 }];
  const list = parseSavedLocations(raw);
  assert.equal(list.length, 2);
  assert.equal(list[1].country, "");
  assert.deepEqual(parseSavedLocations("not an array"), []);
});

test("addLocation prevents duplicates and caps the list", () => {
  let list = addLocation([], paris);
  list = addLocation(list, { ...paris, lat: 48.8501 });
  assert.equal(list.length, 1);
  for (let i = 0; i < 20; i++) list = addLocation(list, { name: `City ${i}`, country: "", lat: i * 4, lon: i * 8 });
  assert.equal(list.length, MAX_SAVED);
  assert.equal(removeLocation(list, list[0]).length, MAX_SAVED - 1);
});

test("readJSON survives corrupt storage", () => {
  const broken = { getItem: () => "{not json" };
  assert.deepEqual(readJSON(broken, "k", []), []);
  const throwing = { getItem: () => { throw new Error("blocked"); } };
  assert.equal(readJSON(throwing, "k", "fallback"), "fallback");
  assert.equal(readJSON({ getItem: () => null }, "k", 7), 7);
});

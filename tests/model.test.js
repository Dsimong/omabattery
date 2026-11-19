// node --test tests/
const test = require("node:test")
const assert = require("node:assert")
const M = require("../Model.js")

test("clampPercent bounds and rounds", () => {
  assert.strictEqual(M.clampPercent(-5), 0)
  assert.strictEqual(M.clampPercent(42.6), 43)
  assert.strictEqual(M.clampPercent(150), 100)
  assert.strictEqual(M.clampPercent("nope"), 0)
})

test("macFrom reads BlueZ paths and plain addresses", () => {
  assert.strictEqual(M.macFrom("/org/bluez/hci0/dev_AA_BB_CC_DD_EE_FF"), "aa:bb:cc:dd:ee:ff")
  assert.strictEqual(M.macFrom("AA:BB:CC:DD:EE:FF"), "aa:bb:cc:dd:ee:ff")
  assert.strictEqual(M.macFrom("hidpp_battery_0"), "")
})

test("dedupe keeps the UPower entry over BlueZ", () => {
  const out = M.dedupe([
    { key: "aa:bb", source: "bluez", percent: 50 },
    { key: "aa:bb", source: "upower", percent: 51 },
  ])
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].source, "upower")
})

test("sort puts the lowest battery first", () => {
  const out = M.sort([{ name: "b", percent: 80 }, { name: "a", percent: 10 }])
  assert.deepStrictEqual(out.map(d => d.name), ["a", "b"])
})

test("groupOf", () => {
  assert.strictEqual(M.groupOf("mouse"), "input")
  assert.strictEqual(M.groupOf("headset"), "audio")
  assert.strictEqual(M.groupOf("tablet"), "other")
})

// ------------------------------------------------------------------ OpenRazer

const fs = require("node:fs")
const path = require("node:path")
const OPENRAZER = fs.readFileSync(path.join(__dirname, "fixtures/openrazer.txt"), "utf8")

test("parseOpenRazer keeps well-formed lines from known drivers", () => {
  const entries = M.parseOpenRazer(OPENRAZER)
  // razerkraken, bad hid id, empty level and the garbage line are dropped.
  assert.deepStrictEqual(entries.map(e => e.driver + ":" + e.product + ":" + e.level), [
    "razermouse:00df:26", "razermouse:00df:26", "razerkbd:0258:255", "razeraccessory:0f1a:0",
  ])
  assert.strictEqual(entries[0].name, "Razer Viper V3 Pro SE")
  assert.strictEqual(entries[0].charging, false)
  assert.strictEqual(entries[2].charging, true)
})

test("parseOpenRazer tolerates empty and missing input", () => {
  assert.deepStrictEqual(M.parseOpenRazer(""), [])
  assert.deepStrictEqual(M.parseOpenRazer(null), [])
})

test("parseOpenRazer bounds names and device count", () => {
  const long = "razermouse\t0003:1532:00DF.0001\t100\t0\t" + "x".repeat(500)
  assert.strictEqual(M.parseOpenRazer(long)[0].name.length, 64)
  const many = Array(100).fill(long).join("\n")
  assert.strictEqual(M.parseOpenRazer(many).length, 32)
})

test("fromOpenRazer scales 0-255 to percent and flags low", () => {
  const [mouse] = M.parseOpenRazer(OPENRAZER)
  const d = M.fromOpenRazer(mouse, 20)
  assert.deepStrictEqual(d, {
    key: "openrazer:1532:00df", name: "Razer Viper V3 Pro SE", kind: "mouse",
    percent: 10, state: "discharging", timeToEmpty: 0, source: "openrazer", low: true,
    stale: false,
  })
  assert.strictEqual(M.fromOpenRazer(mouse, 5).low, false)
})

test("fromOpenRazer: charging is never low, 255 while charging is full", () => {
  const kbd = M.parseOpenRazer(OPENRAZER)[2]
  const d = M.fromOpenRazer(kbd, 20)
  assert.strictEqual(d.kind, "keyboard")
  assert.strictEqual(d.percent, 100)
  assert.strictEqual(d.state, "full")
  const lowCharging = M.fromOpenRazer({ ...kbd, level: 10 }, 20)
  assert.strictEqual(lowCharging.state, "charging")
  assert.strictEqual(lowCharging.low, false)
})

test("fromOpenRazer skips a level of 0 (no reading)", () => {
  const dock = M.parseOpenRazer(OPENRAZER)[3]
  assert.strictEqual(M.fromOpenRazer(dock, 20), null)
  assert.strictEqual(M.fromOpenRazer(null, 20), null)
})

test("carryOpenRazer keeps the last reading of a sleeping device", () => {
  const awake = M.parseOpenRazer("razermouse\t0003:1532:00DF.0006\t26\t0\tViper\n")
  const asleep = M.parseOpenRazer("razermouse\t0003:1532:00DF.0006\t0\t0\tViper\n")

  const carried = M.carryOpenRazer(awake, asleep)
  assert.strictEqual(carried[0].level, 26)
  assert.strictEqual(carried[0].stale, true)
  const d = M.fromOpenRazer(carried[0], 20)
  assert.strictEqual(d.percent, 10)
  assert.strictEqual(d.stale, true)

  // Still asleep on the next poll: keeps carrying.
  assert.strictEqual(M.carryOpenRazer(carried, asleep)[0].level, 26)
  // Awake again: the fresh reading wins.
  const fresh = M.parseOpenRazer("razermouse\t0003:1532:00DF.0006\t20\t0\tViper\n")
  assert.deepStrictEqual(M.carryOpenRazer(carried, fresh), fresh)
})

test("carryOpenRazer: no earlier reading means no device; unplugged is gone", () => {
  const asleep = M.parseOpenRazer("razermouse\t0003:1532:00DF.0006\t0\t0\tViper\n")
  assert.strictEqual(M.fromOpenRazer(M.carryOpenRazer([], asleep)[0], 20), null)
  const awake = M.parseOpenRazer("razermouse\t0003:1532:00DF.0006\t26\t0\tViper\n")
  assert.deepStrictEqual(M.carryOpenRazer(awake, []), [])
  assert.deepStrictEqual(M.carryOpenRazer(null, null), [])
})

test("merge collapses the HID interfaces of one device and sorts", () => {
  const list = M.parseOpenRazer(OPENRAZER).map(e => M.fromOpenRazer(e, 20))
  const out = M.merge([list])
  assert.deepStrictEqual(out.map(d => d.key), ["openrazer:1532:00df", "openrazer:1532:0258"])
})

// ---------------------------------------------------------------------- icons

test("batteryIcon picks the glyph by level and charging", () => {
  const cp = s => s.codePointAt(0).toString(16)
  assert.strictEqual(cp(M.batteryIcon(null)), "f008e")
  assert.strictEqual(cp(M.batteryIcon({ percent: 10, state: "discharging" })), "f007b")
  assert.strictEqual(cp(M.batteryIcon({ percent: 100, state: "discharging" })), "f0079")
  assert.strictEqual(cp(M.batteryIcon({ percent: 3, state: "charging" })), "f089c")
  assert.strictEqual(cp(M.batteryIcon({ percent: 100, state: "full" })), "f0085")
})

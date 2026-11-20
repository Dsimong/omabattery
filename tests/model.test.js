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
  assert.strictEqual(M.groupOf("tablet"), "input") // UPower: graphics tablets (Wacom)
  assert.strictEqual(M.groupOf("other"), "other")
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

// ------------------------------------------------------------- HeadsetControl

const HEADSETS = fs.readFileSync(path.join(__dirname, "fixtures/headsetcontrol.json"), "utf8")

test("parseHeadset keeps devices with a battery and well-formed ids", () => {
  const entries = M.parseHeadset(HEADSETS)
  // "Without Battery" and "Bad Ids" are dropped.
  assert.deepStrictEqual(entries.map(e => e.vendor + ":" + e.product), [
    "046d:0ab5", "1038:2202", "03f0:098d", "1b1c:0a14",
  ])
  assert.deepStrictEqual(entries[0], {
    vendor: "046d", product: "0ab5", name: "G733 Gaming Headset",
    status: "BATTERY_AVAILABLE", level: 85, timeToEmptyMin: 0,
  })
  // Empty HID product string: falls back to the HeadsetControl device name.
  assert.strictEqual(entries[1].name, "Example Charging Headset")
  assert.strictEqual(entries[3].timeToEmptyMin, 120)
})

test("parseHeadset tolerates missing, broken and oversized output", () => {
  assert.deepStrictEqual(M.parseHeadset(""), [])
  assert.deepStrictEqual(M.parseHeadset(null), [])
  assert.deepStrictEqual(M.parseHeadset("not json"), [])
  assert.deepStrictEqual(M.parseHeadset('{"devices":[]}'), [])
  assert.deepStrictEqual(M.parseHeadset('{"devices":{}}'), [])
  assert.deepStrictEqual(M.parseHeadset('{"devices":[null, 3, "x"]}'), [])
  assert.deepStrictEqual(M.parseHeadset(" ".repeat(1024 * 1024 + 1)), [])
})

test("parseHeadset bounds names and device count", () => {
  const dev = { id_vendor: "0x046d", id_product: "0x0ab5", product: "y".repeat(500),
    battery: { status: "BATTERY_AVAILABLE", level: 50 } }
  const out = M.parseHeadset(JSON.stringify({ devices: Array(100).fill(dev) }))
  assert.strictEqual(out.length, 32)
  assert.strictEqual(out[0].name.length, 64)
})

test("fromHeadset normalizes the G733", () => {
  const [g733] = M.parseHeadset(HEADSETS)
  assert.deepStrictEqual(M.fromHeadset(g733, 20), {
    key: "headset:046d:0ab5", name: "G733 Gaming Headset", kind: "headset",
    percent: 85, state: "discharging", timeToEmpty: 0, source: "headsetcontrol",
    low: false, stale: false,
  })
})

test("fromHeadset: charging, low with time left, off", () => {
  const [, charging, off, low] = M.parseHeadset(HEADSETS)
  const c = M.fromHeadset(charging, 50)
  assert.strictEqual(c.state, "charging")
  assert.strictEqual(c.low, false)
  const l = M.fromHeadset(low, 20)
  assert.strictEqual(l.low, true)
  assert.strictEqual(l.timeToEmpty, 7200)
  assert.strictEqual(M.fromHeadset(off, 20), null)
  assert.strictEqual(M.fromHeadset(null, 20), null)
})

test("carryHeadset keeps the last level while the headset is off", () => {
  const on = M.parseHeadset(JSON.stringify({ devices: [{ id_vendor: "0x046d", id_product: "0x0ab5",
    product: "G733", battery: { status: "BATTERY_AVAILABLE", level: 60, time_to_empty_min: 300 } }] }))
  const off = M.parseHeadset(JSON.stringify({ devices: [{ id_vendor: "0x046d", id_product: "0x0ab5",
    product: "G733", battery: { status: "BATTERY_UNAVAILABLE", level: -1 } }] }))
  const carried = M.carryHeadset(on, off)
  const d = M.fromHeadset(carried[0], 20)
  assert.strictEqual(d.percent, 60)
  assert.strictEqual(d.stale, true)
  assert.strictEqual(d.timeToEmpty, 0) // a stale estimate would be wrong
  assert.strictEqual(M.fromHeadset(M.carryHeadset([], off)[0], 20), null)
  assert.deepStrictEqual(M.carryHeadset(on, []), [])
})

test("merge lists Razer and headset devices together, lowest first", () => {
  const razer = M.parseOpenRazer(OPENRAZER).map(e => M.fromOpenRazer(e, 20))
  const heads = M.parseHeadset(HEADSETS).map(e => M.fromHeadset(e, 20))
  const out = M.merge([razer, heads])
  assert.deepStrictEqual(out.map(d => d.percent), [10, 15, 40, 85, 100])
  assert.strictEqual(M.groupOf(out[3].kind), "audio")
})

// -------------------------------------------------------------------- UPower

const UPOWER = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/upower.json"), "utf8"))
const upower = UPOWER.map(s => M.fromUPower(s, 20))

test("fromUPower skips the system's own power and devices not ready", () => {
  assert.deepStrictEqual(upower.map(d => d && d.key), [
    "upower:hidpp_battery_0",
    "mac:aa:bb:cc:dd:ee:01",
    "mac:aa:bb:cc:dd:ee:02",
    "mac:aa:bb:cc:dd:ee:03",
    null, null, null,
  ])
})

test("fromUPower normalizes a Logitech receiver mouse", () => {
  assert.deepStrictEqual(upower[0], {
    key: "upower:hidpp_battery_0", name: "MX Master 3S", kind: "mouse",
    percent: 55, state: "discharging", timeToEmpty: 0, source: "upower",
    low: false, stale: false,
  })
})

test("fromUPower: unknown state can be low, charging cannot", () => {
  assert.strictEqual(upower[1].state, "unknown")
  assert.strictEqual(M.fromUPower({ ...UPOWER[1], percentage: 0.15 }, 20).low, true)
  assert.strictEqual(upower[3].state, "charging")
  assert.strictEqual(upower[3].low, false)
})

test("fromUPower: time left only while discharging, default name by kind", () => {
  assert.strictEqual(upower[2].timeToEmpty, 1800)
  assert.strictEqual(upower[2].low, true)
  assert.strictEqual(upower[2].name, "Controller")
  assert.strictEqual(M.fromUPower({ ...UPOWER[0], state: "charging", timeToEmpty: 99 }, 20).timeToEmpty, 0)
})

test("fromUPower: odd input", () => {
  assert.strictEqual(M.fromUPower(null, 20), null)
  assert.strictEqual(M.fromUPower({ ...UPOWER[0], percentage: "x" }, 20), null)
  assert.strictEqual(M.fromUPower({ ...UPOWER[0], nativePath: "" }, 20), null)
  assert.strictEqual(M.fromUPower({ ...UPOWER[0], state: "bogus" }, 20).state, "unknown")
  assert.strictEqual(M.fromUPower({ ...UPOWER[0], kind: "ups" }, 20), null)
  assert.strictEqual(M.fromUPower({ ...UPOWER[0], model: "z".repeat(300) }, 20).name.length, 64)
  assert.strictEqual(M.fromUPower({ ...UPOWER[0], percentage: 1.7 }, 20).percent, 100)
})

test("merge: UPower wins over another source for the same key", () => {
  const fromBluez = { ...upower[1], source: "bluez", percent: 79 }
  const out = M.merge([[fromBluez], upower])
  const headphones = out.filter(d => d.key === "mac:aa:bb:cc:dd:ee:01")
  assert.strictEqual(headphones.length, 1)
  assert.strictEqual(headphones[0].source, "upower")
})

test("groupOf covers the UPower kinds", () => {
  assert.strictEqual(M.groupOf("gamepad"), "input")
  assert.strictEqual(M.groupOf("pen"), "input")
  assert.strictEqual(M.groupOf("audio"), "audio")
  assert.strictEqual(M.groupOf("phone"), "other")
})

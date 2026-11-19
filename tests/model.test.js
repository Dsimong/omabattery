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

// Pure model for omabattery. No QML imports, no side effects: plain functions
// over plain data, so the same file runs under Quickshell's JS engine
// (`import "Model.js" as Model`) and under `node --test tests/`.
//
// Normalized device:
//   { key, name, kind, percent /*0-100*/, state /*charging|discharging|full|unknown*/,
//     timeToEmpty /*s|0*/, source /*upower|bluez|openrazer|headsetcontrol*/, low /*bool*/,
//     stale /*bool: last known reading, device asleep*/ }

var SOURCE_PRIORITY = { upower: 0, bluez: 1, openrazer: 2, headsetcontrol: 3 }

var MAX_NAME = 64
var MAX_DEVICES = 32

function clampPercent(value) {
  var n = Number(value)
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

// "/org/bluez/hci0/dev_AA_BB_CC_DD_EE_FF" or "AA:BB:CC:DD:EE:FF" -> "aa:bb:cc:dd:ee:ff"
function macFrom(text) {
  var m = String(text || "").match(/([0-9a-f]{2}[:_]){5}[0-9a-f]{2}/i)
  return m ? m[0].replace(/_/g, ":").toLowerCase() : ""
}

// TODO(roadmap 1): map UPowerDevice -> normalized device.
function fromUPower(device, lowThreshold) {
  return null
}

// TODO(roadmap 2): map BluetoothDevice (batteryAvailable) -> normalized device.
function fromBluez(device, lowThreshold) {
  return null
}

// ---------------------------------------------------------------- OpenRazer

var OPENRAZER_KIND = { razermouse: "mouse", razerkbd: "keyboard", razeraccessory: "other" }

// Output of bin/omabattery-openrazer, one device per line:
//   driver \t hid_id \t charge_level \t charge_status \t device_type
// Anything that does not look like that is dropped.
function parseOpenRazer(text) {
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length && out.length < MAX_DEVICES; i++) {
    var f = lines[i].split("\t")
    if (f.length < 5) continue
    if (!OPENRAZER_KIND.hasOwnProperty(f[0])) continue
    var id = f[1].match(/^[0-9a-f]{4}:([0-9a-f]{4}):([0-9a-f]{4})\.[0-9a-f]+$/i)
    if (!id) continue
    var level = Number(f[2])
    if (f[2].trim() === "" || !isFinite(level)) continue
    out.push({
      driver: f[0],
      vendor: id[1].toLowerCase(),
      product: id[2].toLowerCase(),
      level: level,
      charging: f[3].trim() === "1",
      name: f.slice(4).join(" ").trim().slice(0, MAX_NAME)
    })
  }
  return out
}

// A wireless Razer device that has gone to sleep still has its receiver
// plugged in, and the receiver answers charge_level 0 for it. The charge does
// not move while it sleeps, so keep the last real reading (marked stale)
// instead of dropping the device. A device whose line disappears (receiver
// unplugged) is gone.
function carryOpenRazer(previous, next) {
  return carryLast(previous, next, function(e) { return e.level > 0 })
}

// Raw entries (any polled source) keyed by vendor:product. An entry without a
// reading takes the last one that had it, marked stale; one with no earlier
// reading is passed through for from*() to drop.
function carryLast(previous, next, hasReading) {
  var last = {}
  var prev = previous || []
  for (var i = 0; i < prev.length; i++) {
    if (prev[i] && hasReading(prev[i])) last[prev[i].vendor + ":" + prev[i].product] = prev[i]
  }
  return (next || []).map(function(e) {
    if (hasReading(e)) return e
    var p = last[e.vendor + ":" + e.product]
    return p ? Object.assign({}, p, { stale: true }) : e
  })
}

// charge_level is 0-255. A 0 with no earlier reading to carry (see
// carryOpenRazer) is "no answer", not "empty": skipped.
// The key is vendor:product, stable across replugs (the HID id is not); two
// identical devices would collapse into one.
function fromOpenRazer(entry, lowThreshold) {
  if (!entry || !(entry.level > 0)) return null
  var percent = clampPercent(entry.level * 100 / 255)
  var state = entry.charging ? (percent >= 100 ? "full" : "charging") : "discharging"
  return {
    key: "openrazer:" + entry.vendor + ":" + entry.product,
    name: entry.name || "Razer device",
    kind: OPENRAZER_KIND[entry.driver] || "other",
    percent: percent,
    state: state,
    timeToEmpty: 0,
    source: "openrazer",
    low: state === "discharging" && isLow(percent, lowThreshold),
    stale: entry.stale === true
  }
}

// ----------------------------------------------------------- HeadsetControl

var MAX_JSON = 1024 * 1024

// `headsetcontrol -o json` (4.x), via bin/omabattery-headset:
//   { devices: [ { device, vendor, product, id_vendor: "0x046d", id_product: "0x0ab5",
//                  battery: { status, level, time_to_empty_min? } } ] }
// battery.status: BATTERY_AVAILABLE | BATTERY_CHARGING | BATTERY_UNAVAILABLE
// (headset off, level -1) | BATTERY_ERROR | BATTERY_TIMEOUT | UNKNOWN.
// Devices without a battery object, or with malformed ids, are dropped.
function parseHeadset(text) {
  var raw = String(text || "")
  if (raw.length === 0 || raw.length > MAX_JSON) return []
  var data
  try { data = JSON.parse(raw) } catch (e) { return [] }
  var devices = data && Array.isArray(data.devices) ? data.devices : []
  var out = []
  for (var i = 0; i < devices.length && out.length < MAX_DEVICES; i++) {
    var d = devices[i]
    if (!d || typeof d !== "object" || !d.battery || typeof d.battery !== "object") continue
    var vendor = String(d.id_vendor || "").match(/^0x([0-9a-f]{4})$/i)
    var product = String(d.id_product || "").match(/^0x([0-9a-f]{4})$/i)
    if (!vendor || !product) continue
    var level = Number(d.battery.level)
    var tte = Number(d.battery.time_to_empty_min)
    var name = typeof d.product === "string" && d.product.trim() ? d.product
      : (typeof d.device === "string" ? d.device : "")
    out.push({
      vendor: vendor[1].toLowerCase(),
      product: product[1].toLowerCase(),
      name: name.trim().slice(0, MAX_NAME),
      status: String(d.battery.status || "UNKNOWN"),
      level: isFinite(level) ? level : -1,
      timeToEmptyMin: isFinite(tte) && tte > 0 ? tte : 0
    })
  }
  return out
}

function headsetHasReading(entry) {
  return !!entry && entry.level >= 0
    && (entry.status === "BATTERY_AVAILABLE" || entry.status === "BATTERY_CHARGING")
}

// A headset switched off keeps its dongle plugged in and reports
// BATTERY_UNAVAILABLE: keep its last level, like a sleeping Razer device.
function carryHeadset(previous, next) {
  return carryLast(previous, next, headsetHasReading)
}

function fromHeadset(entry, lowThreshold) {
  if (!headsetHasReading(entry)) return null
  var percent = clampPercent(entry.level)
  var state = entry.status === "BATTERY_CHARGING" ? (percent >= 100 ? "full" : "charging") : "discharging"
  return {
    key: "headset:" + entry.vendor + ":" + entry.product,
    name: entry.name || "Headset",
    kind: "headset",
    percent: percent,
    state: state,
    timeToEmpty: state === "discharging" && !entry.stale ? entry.timeToEmptyMin * 60 : 0,
    source: "headsetcontrol",
    low: state === "discharging" && isLow(percent, lowThreshold),
    stale: entry.stale === true
  }
}

// ------------------------------------------------------------------- merging

// Same device reported by several sources: keep the one with the best priority.
function dedupe(devices) {
  var byKey = {}
  var order = []
  for (var i = 0; i < devices.length; i++) {
    var d = devices[i]
    if (!d) continue
    var prev = byKey[d.key]
    if (!prev) {
      byKey[d.key] = d
      order.push(d.key)
    } else if (SOURCE_PRIORITY[d.source] < SOURCE_PRIORITY[prev.source]) {
      byKey[d.key] = d
    }
  }
  return order.map(function(k) { return byKey[k] })
}

// Lowest battery first, then by name.
function sort(devices) {
  return devices.slice().sort(function(a, b) {
    if (a.percent !== b.percent) return a.percent - b.percent
    return String(a.name).localeCompare(String(b.name))
  })
}

// Lists of normalized devices (one per source) -> what the panel shows.
function merge(lists) {
  var all = []
  for (var i = 0; i < lists.length; i++) all = all.concat(lists[i] || [])
  return sort(dedupe(all))
}

// "input" | "audio" | "other" — panel section a device belongs to.
function groupOf(kind) {
  switch (kind) {
  case "keyboard": case "mouse": case "touchpad": case "gamepad": return "input"
  case "headset": case "headphones": case "speaker": return "audio"
  default: return "other"
  }
}

// ---------------------------------------------------------------------- icons

// Nerd Font Material Design battery glyphs, the same set omarchy.power uses.
function glyphs(codes) {
  return codes.map(function(c) { return String.fromCodePoint(c) })
}
var ICON_NONE = String.fromCodePoint(0xF008E) // battery-outline
var ICONS = glyphs([0xF007A, 0xF007B, 0xF007C, 0xF007D, 0xF007E, 0xF007F, 0xF0080, 0xF0081, 0xF0082, 0xF0079])
var ICONS_CHARGING = glyphs([0xF089C, 0xF0086, 0xF0087, 0xF0088, 0xF089D, 0xF0089, 0xF089E, 0xF008A, 0xF008B, 0xF0085])

// Battery glyph for a normalized device; outline when there is none.
function batteryIcon(device) {
  if (!device) return ICON_NONE
  var i = Math.max(0, Math.min(9, Math.floor(clampPercent(device.percent) / 10)))
  var charging = device.state === "charging" || device.state === "full"
  return (charging ? ICONS_CHARGING : ICONS)[i]
}

function isLow(percent, threshold) {
  return clampPercent(percent) <= Number(threshold)
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    clampPercent: clampPercent, macFrom: macFrom,
    fromUPower: fromUPower, fromBluez: fromBluez,
    parseOpenRazer: parseOpenRazer, carryOpenRazer: carryOpenRazer, fromOpenRazer: fromOpenRazer,
    parseHeadset: parseHeadset, carryHeadset: carryHeadset, fromHeadset: fromHeadset,
    dedupe: dedupe, sort: sort, merge: merge, groupOf: groupOf,
    batteryIcon: batteryIcon, isLow: isLow
  }
}

// Pure model for omabattery. No QML imports, no side effects: plain functions
// over plain data, so the same file runs under Quickshell's JS engine
// (`import "Model.js" as Model`) and under `node --test tests/`.
//
// Normalized device:
//   { key, name, kind, percent /*0-100*/, state /*charging|discharging|full|unknown*/,
//     timeToEmpty /*s|0*/, source /*upower|bluez|headsetcontrol*/, low /*bool*/ }

var SOURCE_PRIORITY = { upower: 0, bluez: 1, headsetcontrol: 2 }

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

// TODO(roadmap 3): map one entry of `bin/omabattery-headset` output -> normalized device.
function fromHeadset(entry, lowThreshold) {
  return null
}

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

// "input" | "audio" | "other" — panel section a device belongs to.
function groupOf(kind) {
  switch (kind) {
  case "keyboard": case "mouse": case "touchpad": case "gamepad": return "input"
  case "headset": case "headphones": case "speaker": return "audio"
  default: return "other"
  }
}

// TODO(roadmap 1): Nerd Font glyph per kind (\u escapes, not literal glyphs).
function iconFor(kind, percent, state) {
  return ""
}

function isLow(percent, threshold) {
  return clampPercent(percent) <= Number(threshold)
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    clampPercent: clampPercent, macFrom: macFrom,
    fromUPower: fromUPower, fromBluez: fromBluez, fromHeadset: fromHeadset,
    dedupe: dedupe, sort: sort, groupOf: groupOf, iconFor: iconFor, isLow: isLow
  }
}

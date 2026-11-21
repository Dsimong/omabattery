import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.UPower
import qs.Commons as Commons
import "Model.js" as Model

// Single aggregator for the whole shell.
//
// Omarchy builds one bar per monitor; if the sources lived in the widget there
// would be one OpenRazer/HeadsetControl poll per screen. Panel.qml gets this
// instance with bar.shell.serviceFor("dsimong.omabattery") and only draws
// `devices`.
Item {
  id: root
  width: 0
  height: 0
  visible: false

  // Injected by the shell.
  property var shell: null
  property var manifest: null
  property var pluginRegistry: null
  property var barWidgetRegistry: null
  property string omarchyPath: ""

  // Pushed from the widget settings (Panel.qml).
  property int lowThreshold: 20
  property bool headsetcontrol: true
  property int pollSeconds: 60
  property bool notifyLow: true

  // Raw readings per source, kept so a threshold change can re-normalize
  // without asking the devices again.
  property var openrazerEntries: []
  property var headsetEntries: []

  // Normalized, deduplicated and sorted device list (see Model.js).
  property var devices: []

  readonly property string binDir: Qt.resolvedUrl("bin").toString().replace(/^file:\/\//, "")

  // ------------------------------------------------------------------ UPower
  //
  // Event driven, no polling: this binding reads UPower.devices.values and
  // every property it uses on each device, so QML re-evaluates it when a
  // device appears or leaves and when any of those properties changes.
  readonly property var upowerDevices: {
    var list = UPower.devices.values
    var out = []
    for (var i = 0; i < list.length && i < 64; i++) {
      var d = list[i]
      if (!d) continue
      var dev = Model.fromUPower({
        ready: d.ready,
        kind: root.upowerKind(d.type),
        state: root.upowerState(d.state),
        percentage: d.percentage,
        timeToEmpty: d.timeToEmpty,
        powerSupply: d.powerSupply,
        isLaptopBattery: d.isLaptopBattery,
        nativePath: d.nativePath,
        model: d.model
      }, root.lowThreshold)
      if (dev) out.push(dev)
    }
    return out
  }
  onUpowerDevicesChanged: rebuild()

  // Quickshell enums -> Model.js strings. By symbol, not by number, so a
  // reordered enum cannot shift every kind by one.
  function upowerKind(type) {
    switch (type) {
    case UPowerDeviceType.Mouse: return "mouse"
    case UPowerDeviceType.Keyboard: return "keyboard"
    case UPowerDeviceType.Touchpad: return "touchpad"
    case UPowerDeviceType.GamingInput: return "gamepad"
    case UPowerDeviceType.Pen: return "pen"
    case UPowerDeviceType.Tablet: return "tablet"
    case UPowerDeviceType.Headset: return "headset"
    case UPowerDeviceType.Headphones: return "headphones"
    case UPowerDeviceType.Speakers: return "speaker"
    case UPowerDeviceType.OtherAudio: return "audio"
    case UPowerDeviceType.Phone: return "phone"
    case UPowerDeviceType.LinePower: return "linepower"
    case UPowerDeviceType.Ups: return "ups"
    default: return "other"
    }
  }

  function upowerState(state) {
    switch (state) {
    case UPowerDeviceState.Charging:
    case UPowerDeviceState.PendingCharge: return "charging"
    case UPowerDeviceState.Discharging:
    case UPowerDeviceState.PendingDischarge:
    case UPowerDeviceState.Empty: return "discharging"
    case UPowerDeviceState.FullyCharged: return "full"
    default: return "unknown"
    }
  }

  // TODO(roadmap 2): Bluetooth.devices with batteryAvailable, dedupe by MAC.
  function rebuild() {
    var threshold = root.lowThreshold
    var openrazer = root.openrazerEntries.map(function(e) { return Model.fromOpenRazer(e, threshold) })
    var headsets = root.headsetEntries.map(function(e) { return Model.fromHeadset(e, threshold) })
    var next = Model.merge([root.upowerDevices, openrazer, headsets])
    if (next.length !== root.devices.length)
      console.log("[omabattery] devices: " + next.length)
    root.devices = next
  }

  // Ask every polled source again now (timer, right click, panel opened).
  function refresh() {
    pollOpenRazer()
    pollHeadset()
  }

  function pollOpenRazer() {
    if (!openrazerProc.running) openrazerProc.running = true
  }

  // bin/omabattery-headset answers an empty list when headsetcontrol is not
  // installed, so this only depends on the setting.
  function pollHeadset() {
    if (root.headsetcontrol && !headsetProc.running) headsetProc.running = true
  }

  onLowThresholdChanged: rebuild()
  onHeadsetcontrolChanged: {
    if (root.headsetcontrol) {
      pollHeadset()
    } else {
      root.headsetEntries = []
      rebuild()
    }
  }

  Process {
    id: headsetProc
    command: ["bash", root.binDir + "/omabattery-headset"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        // The setting may have been switched off while the query ran.
        if (!root.headsetcontrol) return
        root.headsetEntries = Model.carryHeadset(root.headsetEntries, Model.parseHeadset(text))
        root.rebuild()
      }
    }
  }

  Process {
    id: openrazerProc
    command: ["bash", root.binDir + "/omabattery-openrazer"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.openrazerEntries = Model.carryOpenRazer(root.openrazerEntries, Model.parseOpenRazer(text))
        root.rebuild()
      }
    }
  }

  Timer {
    interval: Math.max(15, root.pollSeconds) * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // ------------------------------------------------------------- low battery
  //
  // One notification per drop below the threshold (Model.lowAlerts). The
  // devices already warned about are tracked even with notifyLow off, so
  // turning it on does not fire for a drop that happened before.
  property var lowNotified: ({})

  // Held back while the shell starts, so the first check uses the threshold
  // the bar pushes instead of this file's default, and sees the first answer
  // from OpenRazer and HeadsetControl.
  property bool lowAlertsReady: false

  readonly property string notifySend: root.omarchyPath !== ""
    ? root.omarchyPath + "/bin/omarchy-notification-send" : "omarchy-notification-send"

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  onDevicesChanged: checkLow()

  Timer {
    interval: 5000
    running: true
    onTriggered: {
      root.lowAlertsReady = true
      root.checkLow()
    }
  }

  function checkLow() {
    if (!root.lowAlertsReady) return
    var result = Model.lowAlerts(root.devices, root.lowNotified, root.lowThreshold)
    root.lowNotified = result.notified
    if (!root.notifyLow) return
    for (var i = 0; i < result.alerts.length; i++) notifyLowBattery(result.alerts[i])
  }

  // Same call as Omarchy's own low-battery warning (omarchy-battery-low). It
  // takes each value as one D-Bus argument, never as options; the body is
  // made safe for the daemon's markup in Model.lowBatteryBody.
  function notifyLowBattery(device) {
    var body = Model.lowBatteryBody(strings.t("notify.low.body"), device.name,
                                    Commons.I18n.formatNumber(device.percent))
    // Source only: keys can carry a Bluetooth MAC.
    console.log("[omabattery] low battery: " + device.source + " " + device.percent + "%")
    Quickshell.execDetached([
      root.notifySend,
      "--app-name", "Omabattery",
      "-g", Model.batteryIcon(device),
      "-u", "normal",
      "-i", "battery-caution",
      "-t", "30000",
      strings.t("notify.low.title"),
      body
    ])
  }
}

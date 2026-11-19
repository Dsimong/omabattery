import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Single aggregator for the whole shell.
//
// Omarchy builds one bar per monitor; if the sources lived in the widget there
// would be one OpenRazer/headsetcontrol poll per screen. Panel.qml gets this
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

  // Normalized, deduplicated and sorted device list (see Model.js).
  property var devices: []

  readonly property string binDir: Qt.resolvedUrl("bin").toString().replace(/^file:\/\//, "")

  // TODO(roadmap 1): UPower.devices (filter !powerSupply) -> Model.fromUPower.
  // TODO(roadmap 2): Bluetooth.devices with batteryAvailable, dedupe by MAC.
  // TODO(roadmap 3): headsetcontrol via bin/omabattery-headset, only if present.
  // TODO(roadmap 4): low-battery notification, once per threshold crossing.
  function rebuild() {
    var openrazer = root.openrazerEntries.map(function(e) {
      return Model.fromOpenRazer(e, root.lowThreshold)
    })
    var next = Model.merge([openrazer])
    if (next.length !== root.devices.length)
      console.log("[omabattery] devices: " + next.length)
    root.devices = next
  }

  // Ask every polled source again now (right click on the bar icon).
  function refresh() {
    pollOpenRazer()
  }

  function pollOpenRazer() {
    if (!openrazerProc.running) openrazerProc.running = true
  }

  onLowThresholdChanged: rebuild()

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
    onTriggered: root.pollOpenRazer()
  }
}

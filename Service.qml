import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.UPower
import "Model.js" as Model

// Single aggregator for the whole shell.
//
// Omarchy builds one bar per monitor; if the sources lived in the widget there
// would be N copies of the headsetcontrol poll. Panel.qml gets this instance
// with bar.shell.serviceFor("dsimong.omabattery").
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

  // Normalized, deduplicated and sorted device list (see Model.js).
  property var devices: []

  // TODO(roadmap 1): build from UPower.devices (filter !powerSupply).
  // TODO(roadmap 2): merge Bluetooth.devices with batteryAvailable, dedupe by MAC.
  // TODO(roadmap 3): headsetcontrol via bin/omabattery-headset, only if present.
  // TODO(roadmap 4): low-battery notification, once per threshold crossing.
  function refresh() {
    console.log("[omabattery] refresh: " + UPower.devices.values.length + " upower devices")
  }

  Component.onCompleted: refresh()
}

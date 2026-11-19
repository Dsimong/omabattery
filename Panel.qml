import QtQuick
import Quickshell
import Quickshell.Services.UPower
import qs.Ui
import qs.Commons
import qs.Commons as Commons

import "components"
import "Model.js" as Model

// Bar widget: icon (lowest device) + KeyboardPanel anchored to it.
Panel {
  id: root

  moduleName: "dsimong.omabattery"
  ipcTarget: "dsimong.omabattery"

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  // ----------------------------------------------------------------- settings
  readonly property string barLabel: setting("barLabel", "Lowest")
  readonly property int lowThreshold: setting("lowThreshold", 20)
  readonly property bool headsetcontrol: setting("headsetcontrol", true)
  readonly property int pollSeconds: setting("pollSeconds", 60)
  readonly property bool notifyLow: setting("notifyLow", true)

  // ------------------------------------------------------------------ service
  readonly property var service: {
    var host = bar && bar.shell ? bar.shell : null
    return host && typeof host.serviceFor === "function"
      ? host.serviceFor("dsimong.omabattery") : null
    // TODO: local fallback for replacement bars that hand no service.
  }
  readonly property var devices: service ? service.devices : []

  // TODO(roadmap 1): remove once the service builds the device list.
  function debugDump() {
    var list = UPower.devices.values
    for (var i = 0; i < list.length; i++) {
      var d = list[i]
      console.log("[omabattery] " + JSON.stringify({
        model: d.model, type: d.type, percentage: d.percentage, state: d.state,
        timeToEmpty: d.timeToEmpty, powerSupply: d.powerSupply, nativePath: d.nativePath
      }))
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰁹" // nf-md-battery (U+F0079). TODO(roadmap 1): Model.iconFor(lowest device)
    onPressed: function(b) {
      if (b === Qt.RightButton) {
        if (root.service) root.service.refresh()
        root.debugDump()
      } else {
        root.toggle()
      }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight)

    content: PanelKeyCatcher {
      implicitHeight: column.implicitHeight
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      // TODO(roadmap 1): PanelHero + PanelSectionHeader per group + DeviceRow.
      Column {
        id: column
        anchors.fill: parent
        spacing: Style.space(10)

        Text {
          textFormat: Text.PlainText
          text: strings.t("panel.empty")
          color: root.bar ? root.bar.foreground : Commons.Color.foreground
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          visible: root.devices.length === 0
        }

        Repeater {
          model: root.devices
          delegate: DeviceRow {
            width: column.width
            device: modelData
            bar: root.bar
          }
        }
      }
    }
  }
}

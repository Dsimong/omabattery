import QtQuick
import Quickshell
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

  // The bar sizes each widget from its implicit size; without this the slot
  // is 0x0, the glyph overflows it and the MouseArea receives no clicks.
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

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

  // The service is shared by every bar; settings are the same on all of them.
  Binding { target: root.service; property: "lowThreshold"; value: root.lowThreshold; when: !!root.service }
  Binding { target: root.service; property: "pollSeconds"; value: root.pollSeconds; when: !!root.service }
  Binding { target: root.service; property: "headsetcontrol"; value: root.headsetcontrol; when: !!root.service }
  Binding { target: root.service; property: "notifyLow"; value: root.notifyLow; when: !!root.service }

  // ---------------------------------------------------------------------- bar
  // devices is sorted lowest first.
  readonly property var lowest: devices.length > 0 ? devices[0] : null
  readonly property bool anyLow: devices.some(function(d) { return d.low })
  readonly property string barText: {
    if (barLabel === "Lowest" && lowest) return Commons.I18n.formatNumber(lowest.percent) + "%"
    if (barLabel === "Count" && devices.length > 0) return Commons.I18n.formatNumber(devices.length)
    return ""
  }

  // Whoever clicks the icon is likely holding the mouse, so it is awake and
  // this is the best moment to ask the devices again.
  onOpenedChanged: if (opened && service) service.refresh()

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: Model.batteryIcon(root.lowest)
    labelText: root.barText
    active: root.anyLow
    tooltipText: strings.t("panel.title")
    onPressed: function(b) {
      if (b === Qt.RightButton) {
        if (root.service) root.service.refresh()
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

      // TODO(roadmap 1): PanelHero + PanelSectionHeader per group.
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

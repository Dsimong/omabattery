import QtQuick
import qs.Commons
import qs.Commons as Commons

// One device: icon · name · % · remaining time · battery bar.
Item {
  id: root

  property var device: null   // normalized device from Model.js
  property var bar: null

  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground

  implicitHeight: layout.implicitHeight

  // TODO(roadmap 1): icon, timeToEmpty when > 0, urgent colour when device.low.
  Column {
    id: layout
    width: parent.width
    spacing: Style.space(4)

    Text {
      textFormat: Text.PlainText
      text: root.device ? root.device.name + "  " + root.device.percent + "%" : ""
      color: root.foreground
      font.family: root.bar ? root.bar.fontFamily : Style.font.family
    }

    BatteryBar {
      width: parent.width
      percent: root.device ? root.device.percent : 0
      charging: !!root.device && root.device.state === "charging"
      low: !!root.device && root.device.low
    }
  }
}

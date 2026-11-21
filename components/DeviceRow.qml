import QtQuick
import qs.Ui
import qs.Commons
import qs.Commons as Commons

// One device: name · % · battery bar. Clicking it puts the device on the bar;
// the one on the bar is filled and carries a pin.
BorderSurface {
  id: root

  property var device: null   // normalized device from Model.js
  property var bar: null
  property bool selected: false   // this device is the one on the bar
  property bool hasCursor: false  // the panel's keyboard cursor is here

  signal clicked()
  signal hovered(bool isHovered)

  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
  readonly property color accent: Commons.Color.accent
  readonly property bool hot: mouse.containsMouse || hasCursor
  readonly property string pinGlyph: String.fromCodePoint(0xF0403) // nf-md-pin

  readonly property var hoverBorder: Border.controlSpec("hover-cursor", foreground, accent)
  readonly property var selectedBorder: Border.controlHasWidth("selected")
    ? Border.controlSpec("selected", foreground, accent) : Border.none()
  // Room for the widest border any state paints, so hovering does not nudge
  // the content by a pixel.
  readonly property real inset: Math.max(Border.uniformWidth(hoverBorder), Border.uniformWidth(selectedBorder))
    + Style.spacing.rowPaddingX

  radius: Style.cornerRadius
  implicitHeight: layout.implicitHeight + Style.space(8) * 2
  // Same precedence as the kit's Button: pressed, hot, selected.
  color: mouse.pressed ? Style.pressedFillFor(foreground, accent)
    : hot ? Style.hoverFillFor(foreground, accent)
    : selected ? Style.selectedFillFor(foreground, accent)
    : "transparent"
  borderSpec: hot ? hoverBorder : (selected ? selectedBorder : Border.none())

  Behavior on color { ColorAnimation { duration: Style.duration(120) } }

  // TODO(roadmap 1): icon, timeToEmpty when > 0, urgent colour when device.low.
  Column {
    id: layout
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: root.inset
    anchors.rightMargin: root.inset
    spacing: Style.space(4)

    Item {
      width: parent.width
      implicitHeight: name.implicitHeight

      Text {
        id: name
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width - trailing.width - Style.space(8)
        textFormat: Text.PlainText
        elide: Text.ElideRight
        text: root.device ? root.device.name : ""
        color: root.foreground
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
      }

      Row {
        id: trailing
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(6)

        Text {
          visible: root.selected
          textFormat: Text.PlainText
          text: root.pinGlyph
          color: root.accent
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          anchors.verticalCenter: parent.verticalCenter
        }

        Text {
          textFormat: Text.PlainText
          text: root.device ? Commons.I18n.formatNumber(root.device.percent) + "%" : ""
          color: root.foreground
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          anchors.verticalCenter: parent.verticalCenter
        }
      }
    }

    BatteryBar {
      width: parent.width
      percent: root.device ? root.device.percent : 0
      charging: !!root.device && root.device.state === "charging"
      low: !!root.device && root.device.low
    }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
    onContainsMouseChanged: root.hovered(containsMouse)
  }
}

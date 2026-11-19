import QtQuick
import qs.Commons
import qs.Commons as Commons

// Track + animated fill. Pulses while charging.
Item {
  id: root

  property int percent: 0       // 0-100
  property bool charging: false
  property bool low: false

  implicitHeight: Style.space(6)

  Rectangle {
    id: track
    anchors.fill: parent
    radius: height / 2
    color: Commons.Color.foreground
    opacity: 0.15
  }

  Rectangle {
    id: fill
    height: parent.height
    width: parent.width * Math.max(0, Math.min(100, root.percent)) / 100
    radius: height / 2
    color: root.low ? Commons.Color.urgent : Commons.Color.accent

    Behavior on width {
      NumberAnimation { duration: Style.duration(180); easing.type: Easing.OutCubic }
    }
  }

  // TODO(roadmap 1): pulse on fill.opacity while charging (Style.duration, ease-out).
}

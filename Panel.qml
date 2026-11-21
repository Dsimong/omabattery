import QtQuick
import Quickshell
import qs.Ui
import qs.Commons
import qs.Commons as Commons

import "components"
import "Model.js" as Model

// Bar widget: icon (lowest, a pinned device or none; the wheel picks) +
// KeyboardPanel anchored to it.
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
  readonly property string barLabel: Model.normalizeBarLabel(setting("barLabel", "Percent"))
  readonly property string selection: Model.normalizeSelection(setting("device", "auto"))
  readonly property bool reactiveColor: setting("reactiveColor", true)
  readonly property int lowThreshold: setting("lowThreshold", 20)
  readonly property bool headsetcontrol: setting("headsetcontrol", true)
  readonly property int pollSeconds: setting("pollSeconds", 60)
  readonly property bool notifyLow: setting("notifyLow", true)

  // Applied locally first so the icon changes on the scroll itself; the
  // shell.json write comes back through the bar with the same value, and
  // reaches the widget on every other monitor. An undefined value removes
  // its key, so the default (auto) leaves no trace in shell.json.
  function persistSettings(values) {
    var entry = { id: root.moduleName }
    for (var existing in root.settings) if (existing !== "id") entry[existing] = root.settings[existing]
    for (var key in values) {
      if (values[key] === undefined) delete entry[key]
      else entry[key] = values[key]
    }
    root.settings = entry
    var host = root.bar ? root.bar.shell : null
    if (host && typeof host.updateEntryInline === "function") host.updateEntryInline(root.moduleName, entry)
  }

  function selectDevice(next) {
    if (next === root.selection) return
    persistSettings({ device: next === "auto" ? undefined : next })
    // The bar keeps the tooltip text it was handed on hover; hand it the new one.
    Qt.callLater(function() { if (root.bar) root.bar.showTooltip(button, root.tooltip) })
  }

  // The default (on) leaves no key behind, like auto.
  function setReactiveColor(on) {
    persistSettings({ reactiveColor: on ? undefined : false })
  }

  property real wheelAccumulator: 0

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
  // What the icon follows: auto (devices is sorted lowest first), one pinned
  // device, or none.
  readonly property var shown: Model.resolveSelection(devices, selection)
  readonly property var shownDevice: shown.device
  readonly property bool anyLow: devices.some(function(d) { return d.low })
  // Auto stands for every device, so it warns when any of them is low; a
  // pinned device only for itself.
  readonly property bool shownLow: shown.mode === "auto" ? anyLow : (!!shownDevice && shownDevice.low)
  readonly property string barText: {
    if (shown.mode === "none" || shown.mode === "missing") return ""
    if (barLabel === "Percent" && shownDevice) return Commons.I18n.formatNumber(shownDevice.percent) + "%"
    if (barLabel === "Count" && devices.length > 0) return Commons.I18n.formatNumber(devices.length)
    return ""
  }
  readonly property string tooltip: {
    var head
    if (shown.mode === "none") head = strings.t("bar.none")
    else if (shown.mode === "missing") head = strings.t("bar.missing")
    else if (!shownDevice) head = strings.t("panel.empty")
    else head = Model.fill(strings.t(shown.mode === "auto" ? "bar.lowest" : "bar.device"),
      [shownDevice.name, Commons.I18n.formatNumber(shownDevice.percent)])
    return head + "\n" + strings.t("bar.hint")
  }

  // -------------------------------------------------------------------- panel
  readonly property color panelForeground: bar ? bar.foreground : Commons.Color.foreground
  readonly property string panelFont: bar ? bar.fontFamily : Style.font.family

  // Keyboard cursor over Model.panelTargets: the device rows, Lowest, None
  // and the reactive color toggle. Hidden until the first arrow key, like
  // the power panel's; the mouse moves it too, so the two never disagree.
  readonly property var targets: Model.panelTargets(devices)
  readonly property int autoTarget: devices.length
  readonly property int noneTarget: devices.length + 1
  readonly property int reactiveTarget: devices.length + 2
  property int cursorIndex: 0
  property bool cursorActive: false

  function cursorAt(i) { return cursorActive && cursorIndex === i }
  function hoverTarget(i) { cursorActive = true; cursorIndex = i }
  function moveCursor(delta) {
    cursorIndex = Math.max(0, Math.min(targets.length - 1, cursorIndex + delta))
  }
  function activateTarget(i) {
    var t = targets[i]
    if (!t) return
    if (t.kind === "device") selectDevice(t.key)
    else if (t.kind === "auto" || t.kind === "none") selectDevice(t.kind)
    else if (t.kind === "reactive") setReactiveColor(!reactiveColor)
  }
  onTargetsChanged: if (cursorIndex >= targets.length) cursorIndex = Math.max(0, targets.length - 1)

  // Whoever clicks the icon is likely holding the mouse, so it is awake and
  // this is the best moment to ask the devices again.
  onOpenedChanged: {
    if (!opened) return
    if (service) service.refresh()
    cursorActive = false
    cursorIndex = Model.selectionTargetIndex(devices, selection)
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: Model.batteryIcon(root.shownDevice)
    labelText: root.barText
    active: root.shownLow
    useActiveColor: root.reactiveColor
    // A pinned device with no reading: outline icon, faded, until it is back.
    dimmed: root.shown.mode === "missing"
    tooltipText: root.tooltip
    onPressed: function(b) {
      if (b === Qt.RightButton) {
        if (root.service) root.service.refresh()
      } else if (b === Qt.MiddleButton) {
        root.selectDevice(Model.stepSelection(root.devices, root.selection, 1, true))
      } else {
        root.toggle()
      }
    }
    // Down moves along auto → devices by name → none, up comes back; it holds
    // at either end, like the workspaces.
    onWheelMoved: function(delta) {
      var wheel = Util.wheelSteps(root.wheelAccumulator, delta)
      root.wheelAccumulator = wheel.remainder
      if (wheel.steps === 0) return
      root.selectDevice(Model.stepSelection(root.devices, root.selection, -wheel.steps, false))
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
      onMoveRequested: function(dx, dy) {
        if (!root.cursorActive) { root.cursorActive = true; return }
        root.moveCursor(dy !== 0 ? dy : dx)
      }
      onActivateRequested: if (root.cursorActive) root.activateTarget(root.cursorIndex)

      // TODO(roadmap 1): PanelHero + PanelSectionHeader per group.
      Column {
        id: column
        anchors.fill: parent
        spacing: Style.space(10)

        Text {
          textFormat: Text.PlainText
          text: strings.t("panel.empty")
          color: root.panelForeground
          font.family: root.panelFont
          visible: root.devices.length === 0
        }

        // Clicking a device puts it on the bar.
        Repeater {
          model: root.devices
          delegate: DeviceRow {
            required property var modelData
            required property int index
            width: column.width
            device: modelData
            bar: root.bar
            selected: root.shown.mode === "device" && root.selection === modelData.key
            hasCursor: root.cursorAt(index)
            onClicked: root.selectDevice(modelData.key)
            onHovered: function(h) { if (h) root.hoverTarget(index) }
          }
        }

        PanelSeparator {
          width: column.width
          foreground: root.panelForeground
        }

        PanelSectionHeader {
          text: strings.t("panel.onBar")
          foreground: root.panelForeground
          fontFamily: root.panelFont
        }

        Text {
          visible: root.shown.mode === "missing"
          width: column.width
          textFormat: Text.PlainText
          wrapMode: Text.WordWrap
          text: strings.t("bar.missing")
          color: root.panelForeground
          opacity: 0.6
          font.family: root.panelFont
          font.pixelSize: Style.font.bodySmall
        }

        Row {
          id: choiceRow
          width: column.width
          spacing: Style.space(6)

          readonly property real cellWidth: (width - spacing) / 2

          Button {
            width: choiceRow.cellWidth
            text: strings.t("panel.lowest")
            foreground: root.panelForeground
            fontFamily: root.panelFont
            bordered: true
            active: root.selection === "auto"
            hasCursor: root.cursorAt(root.autoTarget)
            onClicked: root.selectDevice("auto")
            onHovered: function(h) { if (h) root.hoverTarget(root.autoTarget) }
          }

          Button {
            width: choiceRow.cellWidth
            text: strings.t("panel.none")
            foreground: root.panelForeground
            fontFamily: root.panelFont
            bordered: true
            active: root.selection === "none"
            hasCursor: root.cursorAt(root.noneTarget)
            onClicked: root.selectDevice("none")
            onHovered: function(h) { if (h) root.hoverTarget(root.noneTarget) }
          }
        }

        Toggle {
          width: column.width
          label: strings.t("panel.reactive")
          description: strings.t("panel.reactiveHint")
          checked: root.reactiveColor
          foreground: root.panelForeground
          fontFamily: root.panelFont
          titleSize: Style.font.body
          hasCursor: root.cursorAt(root.reactiveTarget)
          onClicked: root.setReactiveColor(!root.reactiveColor)
          onHovered: function(h) { if (h) root.hoverTarget(root.reactiveTarget) }
        }
      }
    }
  }
}

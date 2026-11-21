# Omabattery

Battery of your wireless keyboard, mouse and headphones in one Omarchy bar widget.

Aggregates every wireless peripheral (Bluetooth, 2.4 GHz dongles such as
Logitech Unifying/Bolt, USB gaming headsets) in a single panel with battery bars.

## Sources

| Source | Covers |
|---|---|
| UPower | Bluetooth with Battery Service, Logitech Unifying/Bolt, kernel `power_supply` peripherals |
| OpenRazer | Razer wireless mice/keyboards (HyperSpeed receivers) via the `openrazer-driver-dkms` kernel driver |
| HeadsetControl (optional) | USB-dongle gaming headsets (SteelSeries, HyperX, Logitech G, Corsair…) |

UPower needs nothing installed and is event driven: a device appears, leaves
or changes level in the panel as soon as UPower reports it. The laptop
battery, AC adapter and UPS are left out; they are the system's, not a
peripheral's.

OpenRazer is read straight from sysfs (`charge_level`), so it needs the
driver and membership in the `openrazer` group, not the daemon. A Razer device
that has gone to sleep reports 0 through its receiver; omabattery keeps showing
its last real reading until it wakes up.

## Install

```bash
omarchy plugin add https://github.com/Dsimong/omabattery.git
omarchy plugin enable dsimong.omabattery
```

## On the bar

| | |
|---|---|
| Left click | Open the panel |
| Right click | Ask the devices again |
| Wheel down / up | Next / previous device on the bar: `auto` → each device by name → `none` |
| Middle click | Next device, wrapping around |

The same choices are in the panel: click a device to put it on the bar (it
gets a pin), or pick **Lowest** or **None** under *On the bar*, where the
**Reactive color** switch is too. Arrow keys (or `j`/`k`) move through them
and Enter or Space picks.

The icon, its percentage and its color follow the device on the bar. In
`auto` it is the lowest battery and it turns urgent when any device is low;
with a device chosen, only that device's level counts. `none` leaves a plain
icon with no reading. A chosen device that is not connected, or has given no
reading yet since the shell started, shows a faded outline until it is back.
The choice is saved in `shell.json` and shared by the bars on every monitor.

## Settings

| Key | Default | |
|---|---|---|
| `barLabel` | `Percent` | `None`, `Percent` (% of the device on the bar) or `Count`. The old `Lowest` still reads as `Percent` |
| `device` | `auto` | Device on the bar: `auto` (lowest battery), `none`, or a device key. Normally set from the bar, see above |
| `reactiveColor` | `true` | Icon turns the theme's urgent color when the device on the bar is low. Also a switch in the panel |
| `lowThreshold` | `20` | Low battery threshold (%) |
| `headsetcontrol` | `true` | Query USB headsets with `headsetcontrol` |
| `pollSeconds` | `60` | How often OpenRazer and HeadsetControl are asked (UPower needs no polling) |
| `notifyLow` | `true` | Notify when a device drops to the threshold, see below |

## Low battery notification

A device that drops to `lowThreshold` while discharging gets one
notification. It warns again only after charging, or after climbing 5 points
above the threshold, so a level wobbling around it does not keep notifying.
A device that is asleep or switched off (showing its last known level) does
not notify, and one that reconnects at the same low level does not notify
twice. The check waits a few seconds after the shell starts, so it uses your
threshold rather than the default. It starts over when the shell restarts.

## Notes

- Some Bluetooth headphones only report their battery to UPower when the
  Bluetooth daemon's experimental features are on: `Experimental = true` in
  `/etc/bluetooth/main.conf`.
- USB-dongle headsets need HeadsetControl: `omarchy pkg add headsetcontrol`.
  Its package ships udev rules that give your user access to the dongle; they
  apply after replugging it (or rebooting). Without the binary, or with the
  `headsetcontrol` setting off, omabattery simply skips headsets.
- A headset switched off keeps showing its last known level until it is on
  again; the dongle reports no battery while the headset is off.

## Development

```bash
omarchy plugin validate .
omarchy restart shell          # needed after editing QML/JS, see below
journalctl -t omarchy-shell -f | grep omabattery
node --test tests/
```

Hot reload re-creates the plugin on save but Quickshell serves the QML it
scanned when the shell started, so code changes only apply after
`omarchy restart shell`.

## License

MIT

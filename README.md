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
omarchy plugin add <repo-url>
omarchy plugin enable dsimong.omabattery
```

## Settings

| Key | Default | |
|---|---|---|
| `barLabel` | `Lowest` | `None`, `Lowest` (% of the lowest device) or `Count` |
| `lowThreshold` | `20` | Low battery threshold (%) |
| `headsetcontrol` | `true` | Query USB headsets with `headsetcontrol` |
| `pollSeconds` | `60` | How often OpenRazer and HeadsetControl are asked (UPower needs no polling) |
| `notifyLow` | `true` | Notify once per threshold crossing |

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

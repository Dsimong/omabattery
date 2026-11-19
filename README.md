# Omabattery

Battery of your wireless keyboard, mouse and headphones in one Omarchy bar widget.

Aggregates every wireless peripheral (Bluetooth, 2.4 GHz dongles such as
Logitech Unifying/Bolt, USB gaming headsets) in a single panel with battery bars.

## Sources

| Source | Covers |
|---|---|
| UPower | Bluetooth with Battery Service, Logitech Unifying/Bolt, kernel `power_supply` peripherals |
| BlueZ | Bluetooth devices with `batteryAvailable` that UPower does not expose |
| HeadsetControl (optional) | USB-dongle gaming headsets (SteelSeries, HyperX, Logitech G, Corsair…) |

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
| `pollSeconds` | `60` | Headset poll interval |
| `notifyLow` | `true` | Notify once per threshold crossing |

## Notes

- Some Bluetooth headphones only expose battery when BlueZ experimental
  features are on: `Experimental = true` in `/etc/bluetooth/main.conf`.
- HeadsetControl only queries the first headset it finds.

## Development

```bash
omarchy plugin validate .
omarchy-shell shell rescanPlugins
journalctl -t omarchy-shell -f | grep omabattery
node --test tests/
```

## License

MIT

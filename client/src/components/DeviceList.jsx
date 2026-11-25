import { deviceLabel, formatMinutes } from '../format.js';

export default function DeviceList({ devices }) {
  if (!devices) return null;
  if (devices.length === 0) return <p className="muted">No devices in this window.</p>;

  return (
    <ul className="device-list">
      {devices.map((device) => (
        <li key={device.id}>
          <strong>{deviceLabel(device)}</strong>
          {'minutes' in device ? ` · ${formatMinutes(device)}` : null}
        </li>
      ))}
    </ul>
  );
}

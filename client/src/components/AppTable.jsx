import { deviceLabel, formatMinutes } from '../format.js';

export default function AppTable({ apps, devices = [], firstName }) {
  if (!apps) return null;
  if (apps.length === 0) return <p className="muted">No apps used in this window.</p>;

  const devicesById = new Map(devices.map((d) => [d.id, d]));
  const showTime = 'minutes' in apps[0];
  const showDevices = 'deviceIds' in apps[0];
  const showRatings = 'ageRating' in apps[0];
  const showData = 'dataReceived' in apps[0];
  const who = firstName || 'this student';

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>App</th>
            <th>Category</th>
            {showTime ? <th>Time</th> : null}
            {showDevices ? <th>Devices</th> : null}
            {showRatings ? <th>Age rating</th> : null}
            {showData ? <th>Data received</th> : null}
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id}>
              <td>
                {app.name}
                {app.aboveEstimatedAge && app.ageRating != null ? (
                  <>
                    {' '}
                    <span className="badge" title={`Rated ${app.ageRating}+ · above ${who}'s age`}>
                      {`Rated ${app.ageRating}+ · above ${who}'s age`}
                    </span>
                  </>
                ) : null}
              </td>
              <td>{app.category}</td>
              {showTime ? <td>{formatMinutes(app)}</td> : null}
              {showDevices ? (
                <td>
                  {(app.deviceIds ?? [])
                    .map((id) => deviceLabel(devicesById.get(id)))
                    .join(', ')}
                </td>
              ) : null}
              {showRatings ? <td>{app.ageRating != null ? `${app.ageRating}+` : '—'}</td> : null}
              {showData ? <td>{app.dataReceived?.join(', ') || '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

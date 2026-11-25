import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api.js';
import AppTable from '../components/AppTable.jsx';
import ChildSwitcher from '../components/ChildSwitcher.jsx';
import DeviceList from '../components/DeviceList.jsx';
import {
  firstNameOf,
  formatMinutes,
  formatWindowRange,
  hasUntimedOrInvalidSessions,
} from '../format.js';

const HIDDEN_LABELS = {
  apps: 'apps',
  screenTime: 'screen time',
  devices: 'devices',
  contentRatings: 'content ratings',
  dataSharing: 'data sharing',
};

function formatTotal(total) {
  if (!total) return null;
  const time = formatMinutes(total);
  return time ? `Total time: ${time}` : null;
}

function joinList(labels) {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

function Toolbar({ name, onLogout }) {
  return (
    <div className="toolbar">
      <span>
        {name ? (
          <>
            Signed in as <strong>{name}</strong>
          </>
        ) : null}
      </span>
      <button type="button" className="linkish" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { studentId: routeStudentId } = useParams();
  const navigate = useNavigate();
  const [guardian, setGuardian] = useState(null);
  const [list, setList] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, students] = await Promise.all([api.me(), api.students()]);
        if (cancelled) return;
        setGuardian(me.guardian);
        setList(students);

        if (students.accessState !== 'ok' || students.students.length === 0) {
          setLoading(false);
          return;
        }

        const selected =
          students.students.find((s) => s.id === routeStudentId)?.id ?? students.students[0].id;
        if (selected !== routeStudentId) {
          navigate(`/dashboard/${selected}`, { replace: true });
          return;
        }

        const dash = await api.dashboard(selected);
        if (cancelled) return;
        setDashboard(dash);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        setError('Could not load the dashboard. Try signing in again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, routeStudentId]);

  async function onLogout() {
    try {
      await api.logout();
    } finally {
      navigate('/login', { replace: true });
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="lede">Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <p className="error" role="alert">
          {error}
        </p>
        <p>
          <Link to="/login">Sign in</Link>
        </p>
      </section>
    );
  }

  if (!list || list.accessState !== 'ok' || list.students.length === 0) {
    const pending = list?.accessState === 'pending';
    return (
      <>
        <Toolbar name={guardian?.name} onLogout={onLogout} />
        <section className="panel">
          <h1>{pending ? 'Almost there' : 'No students available'}</h1>
          <p className="lede">
            {pending
              ? 'We’re still verifying your link to a student. Contact your school.'
              : 'You don’t have access to any students. Contact your school.'}
          </p>
        </section>
      </>
    );
  }

  const selected = list.students.find((s) => s.id === routeStudentId) ?? list.students[0];
  const hidden = (dashboard?.hiddenCategories ?? []).map((c) => HIDDEN_LABELS[c] ?? c);

  return (
    <>
      <Toolbar name={guardian?.name} onLogout={onLogout} />

      <section className="panel">
        <ChildSwitcher
          students={list.students}
          selectedId={selected.id}
          onSelect={(id) => {
            setDashboard(null);
            setLoading(true);
            navigate(`/dashboard/${id}`);
          }}
        />

        {!dashboard ? (
          <p className="lede">Loading {selected.name}…</p>
        ) : (
          <>
            <h1>{dashboard.student.name}</h1>
            <p className="lede">Last 7 days of school app use</p>
            <p className="muted">{formatWindowRange(dashboard.window)}</p>

            {hidden.length > 0 ? (
              <p className="notice">
                Your district doesn’t share {joinList(hidden)}. Contact your school if you have
                questions.
              </p>
            ) : null}

            {dashboard.total ? <p className="total">{formatTotal(dashboard.total)}</p> : null}

            {dashboard.apps ? (
              <>
                <h2>Apps</h2>
                <AppTable
                  apps={dashboard.apps}
                  devices={dashboard.devices ?? []}
                  firstName={firstNameOf(dashboard.student.name)}
                />
              </>
            ) : null}

            {dashboard.devices ? (
              <>
                <h2>Devices</h2>
                <DeviceList devices={dashboard.devices} />
              </>
            ) : null}

            {hasUntimedOrInvalidSessions(dashboard.dataQuality) ? (
              <p className="notice muted">
                Some sessions couldn&apos;t be timed, so actual time may be higher.
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

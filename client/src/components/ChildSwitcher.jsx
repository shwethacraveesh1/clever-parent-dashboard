export default function ChildSwitcher({ students, selectedId, onSelect }) {
  if (students.length <= 1) return null;

  return (
    <div className="child-switcher" role="tablist" aria-label="Children">
      {students.map((student) => (
        <button
          key={student.id}
          type="button"
          role="tab"
          aria-selected={student.id === selectedId}
          className={student.id === selectedId ? 'tab active' : 'tab'}
          onClick={() => onSelect(student.id)}
        >
          {student.name}
        </button>
      ))}
    </div>
  );
}

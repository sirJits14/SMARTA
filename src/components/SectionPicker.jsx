import { useEffect, useMemo, useState } from 'react';
import { sectionMatches } from '../lib/search.js';
import { T } from '../styles.js';
import { Field, Inp } from './ui.jsx';
import GradePills from './GradePills.jsx';

export default function SectionPicker({ sections, value, onChange, disabled = false, label = 'Section' }) {
  const selectedSection = useMemo(() => sections.find((section) => section.id === value) || null, [sections, value]);
  const gradeOptions = useMemo(() => {
    const counts = new Map();
    sections.forEach((section) => counts.set(section.gradeLevel, (counts.get(section.gradeLevel) || 0) + 1));
    return [...counts.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([grade, count]) => ({ value: grade, label: `Grade ${grade}`, count }));
  }, [sections]);
  const [pickedGrade, setPickedGrade] = useState(() => selectedSection?.gradeLevel ?? gradeOptions[0]?.value ?? null);
  const [query, setQuery] = useState('');
  const gradeAvailable = gradeOptions.some((option) => option.value === pickedGrade);
  const activeGrade = selectedSection?.gradeLevel ?? (gradeAvailable ? pickedGrade : gradeOptions[0]?.value ?? null);

  useEffect(() => {
    if (selectedSection) setPickedGrade(selectedSection.gradeLevel);
  }, [selectedSection]);

  const matchingSections = useMemo(() => sections.filter((section) => (
    section.gradeLevel === activeGrade && sectionMatches(query, section)
  )), [activeGrade, query, sections]);

  const chooseGrade = (grade) => {
    setPickedGrade(grade);
    if (selectedSection && selectedSection.gradeLevel !== grade) onChange('');
  };
  const selectedSummary = selectedSection
    ? `${selectedSection.name} · Grade ${selectedSection.gradeLevel}${selectedSection.strand ? ` · ${selectedSection.strand}` : ''}`
    : '';
  const searchLabel = activeGrade == null ? 'Search sections' : `Search Grade ${activeGrade} sections`;
  const searchPlaceholder = activeGrade == null ? 'Search sections by name' : `Search Grade ${activeGrade} sections by name`;

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <GradePills
        options={gradeOptions}
        value={activeGrade}
        onChange={chooseGrade}
        label={`${label} grade level`}
        disabled={disabled}
      />
      <div style={{ marginTop: 14 }}>
        <Field label={searchLabel}>
          <Inp
            type="search"
            value={query}
            disabled={disabled || activeGrade == null}
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
      </div>
      {selectedSection && (
        <div style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12, marginBottom: 8, overflowWrap: 'anywhere' }}>
          <strong style={{ color: T.ink }}>Selected:</strong> {selectedSummary}
        </div>
      )}
      {activeGrade == null ? (
        <div style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 13, padding: '12px 0' }}>No sections available.</div>
      ) : matchingSections.length === 0 ? (
        <div role="status" style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 13, padding: '12px 0' }}>
          No Grade {activeGrade} sections match &quot;{query}&quot;.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {matchingSections.map((section) => {
            const selected = section.id === value;
            const details = [section.strand, section.adviserName ? `Adviser: ${section.adviserName}` : ''].filter(Boolean).join(' · ');
            return (
              <button
                key={section.id}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onChange(section.id)}
                style={{
                  width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 12px',
                  padding: '10px 12px', borderRadius: 10, textAlign: 'left', fontFamily: T.body,
                  border: `1.5px solid ${selected ? T.primary : T.border}`,
                  background: selected ? 'rgba(0,122,114,0.08)' : T.surface,
                  color: T.ink, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
                  overflowWrap: 'anywhere',
                }}
              >
                <span style={{ fontWeight: 600 }}>{section.name}</span>
                {details && <span style={{ color: T.inkMuted, fontSize: 12 }}>{details}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useContext, useState } from 'react';
import { isEqual } from 'lodash-es';
import { ThemeContext } from '../../../../ui/useTheme';
import { formatManagerTheme } from './formatManager.theme';

const ATTRIBUTE_TYPES = ['text', 'number', 'switch', 'select', 'json', 'lexical'];

const newAttribute = () => ({ key: '', display_name: '', type: 'text', required: false });

// One row of the attribute list — collapsed (name/type/required + edit/delete) or, when
// `editing`, expanded into an inline form (key/display_name/type/required, plus a
// type-conditional options sub-editor for `type: 'select'`). Field edits write straight
// through to the parent's `attributes` array via `onFieldChange` — there's no separate
// per-row draft, so `onCancel` restores the pre-edit snapshot the parent captured in
// `startEdit` instead of discarding local-only state.
function AttributeRow({
  attr, editing, locked, confirmingDelete,
  onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
  onFieldChange, onOptionChange, onOptionAdd, onOptionRemove,
  onCancel, onDone, Icon, Switch, t,
}) {
  const options = attr.options || [];

  if (editing) {
    return (
      <div className={t.rowEditing}>
        <div className={t.rowHeadRow}>
          <span className={attr.type === 'select' ? t.typePillAccent : t.typePill}>{attr.type || 'text'}</span>
          <div className={t.rowMeta}>
            <div className={t.rowMetaLine}>
              <span className={t.rowKey}>{attr.key || '(new attribute)'}</span>
              {!!attr.display_name && <span className={t.rowDisplayName}>{attr.display_name}</span>}
            </div>
          </div>
          <span className={t.editingTag}>editing…</span>
        </div>

        <div className={t.form}>
          <div className={t.formGrid}>
            <label className={t.field}>
              <span className={t.fieldLabel}>key</span>
              <input
                type="text"
                className={t.fieldInputMono}
                value={attr.key}
                onChange={e => onFieldChange('key', e.target.value)}
              />
            </label>
            <label className={t.field}>
              <span className={t.fieldLabel}>display name</span>
              <input
                type="text"
                className={t.fieldInput}
                value={attr.display_name || ''}
                onChange={e => onFieldChange('display_name', e.target.value)}
              />
            </label>
            <label className={t.field}>
              <span className={t.fieldLabel}>type</span>
              <select
                className={t.fieldSelect}
                value={attr.type || 'text'}
                onChange={e => onFieldChange('type', e.target.value)}
              >
                {ATTRIBUTE_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
              </select>
            </label>
            <div className={t.fieldSwitchRow}>
              <Switch size="small" enabled={attr.required === true} setEnabled={v => onFieldChange('required', !!v)} />
              <span className={t.fieldSwitchLabel}>required</span>
            </div>
          </div>

          {attr.type === 'select' && (
            <div className={t.optionsBlock}>
              <div className={t.optionsHeadRow}>
                <span className={t.fieldLabel}>options</span>
                <span className={t.optionsHint}>shown as this field's dropdown choices</span>
              </div>
              <div className={t.optionsList}>
                {options.map((opt, i) => (
                  <div key={i} className={t.optionRow}>
                    <input
                      type="text"
                      className={t.fieldInput}
                      placeholder="label"
                      value={opt.label || ''}
                      onChange={e => onOptionChange(i, 'label', e.target.value)}
                    />
                    <input
                      type="text"
                      className={t.fieldInputMono}
                      placeholder="value"
                      value={opt.value || ''}
                      onChange={e => onOptionChange(i, 'value', e.target.value)}
                    />
                    <button type="button" className={t.optionRemoveBtn} onClick={() => onOptionRemove(i)} aria-label="remove option">
                      <Icon icon="XMark" className={t.optionRemoveIcon} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className={t.addOptionBtn} onClick={onOptionAdd}>
                <Icon icon="Plus" className={t.addOptionIcon} /> add option
              </button>
            </div>
          )}

          <div className={t.formFooter}>
            <button type="button" className={t.cancelBtn} onClick={onCancel}>cancel</button>
            <button type="button" className={t.doneBtn} disabled={!attr.key.trim()} onClick={onDone}>done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={t.row}>
      <div className={t.rowHeadRow}>
        <span className={t.typePill}>{attr.type || 'text'}</span>
        <div className={t.rowMeta}>
          <div className={t.rowMetaLine}>
            <span className={t.rowKey}>{attr.key}</span>
            {!!attr.display_name && <span className={t.rowDisplayName}>{attr.display_name}</span>}
            {attr.required && <span className={t.requiredPill}>required</span>}
          </div>
          <p className={t.rowHint}>
            shown on every section's editor{attr.type === 'select' ? ` — ${options.length} option${options.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>

        {confirmingDelete ? (
          <span className={t.confirmRow}>
            <span className={t.confirmLabel}>delete?</span>
            <span className={t.confirmYes} onClick={onDeleteConfirm}>yes</span>
            <span className={t.confirmNo} onClick={onDeleteCancel}>no</span>
          </span>
        ) : (
          <div className={t.rowActions}>
            <button
              type="button"
              className={locked ? t.iconBtnDisabled : t.iconBtn}
              disabled={locked}
              onClick={onEdit}
              aria-label="edit"
            >
              <Icon icon="PencilIcon" className={t.iconBtnIcon} />
            </button>
            <button
              type="button"
              className={locked ? t.iconBtnDisabled : t.iconBtnDanger}
              disabled={locked}
              onClick={onDeleteRequest}
              aria-label="delete"
            >
              <Icon icon="TrashCan" className={t.iconBtnIcon} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormatManager({ apiUpdate, app, type, value }) {
  const { UI } = useContext(ThemeContext);
  const { Icon, Switch } = UI;
  const t = formatManagerTheme;

  const [attributes, setAttributes] = useState(value.additionalSectionAttributes || []);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [isNewRow, setIsNewRow] = useState(false);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null);
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState('');

  const PatternFormat = {
    app,
    type, // pattern
    attributes: [
      { key: 'format', type: 'json' },
    ],
  };

  const dirty = !isEqual(value.additionalSectionAttributes || [], attributes);
  const hasInvalidKey = attributes.some(a => !a.key || !a.key.trim());

  const saveAttributes = () => {
    apiUpdate({ data: { id: value.id, additionalSectionAttributes: attributes }, config: { format: PatternFormat } });
  };

  const resetAttributes = () => {
    setAttributes(value.additionalSectionAttributes || []);
    setEditingIndex(null);
    setEditSnapshot(null);
    setIsNewRow(false);
    setConfirmDeleteIndex(null);
  };

  const startEdit = (index) => {
    setEditSnapshot(attributes[index]);
    setIsNewRow(false);
    setEditingIndex(index);
    setConfirmDeleteIndex(null);
  };

  const addAttribute = () => {
    setAttributes(prev => {
      const next = [...prev, newAttribute()];
      setEditSnapshot(null);
      setIsNewRow(true);
      setEditingIndex(next.length - 1);
      return next;
    });
    setConfirmDeleteIndex(null);
  };

  const updateField = (field, val) => {
    setAttributes(prev => prev.map((a, i) => (i === editingIndex ? { ...a, [field]: val } : a)));
  };

  const updateOption = (optIndex, field, val) => {
    setAttributes(prev => prev.map((a, i) => {
      if (i !== editingIndex) return a;
      const options = (a.options || []).map((o, oi) => (oi === optIndex ? { ...o, [field]: val } : o));
      return { ...a, options };
    }));
  };

  const addOption = () => {
    setAttributes(prev => prev.map((a, i) => (
      i === editingIndex ? { ...a, options: [...(a.options || []), { label: '', value: '' }] } : a
    )));
  };

  const removeOption = (optIndex) => {
    setAttributes(prev => prev.map((a, i) => (
      i === editingIndex ? { ...a, options: (a.options || []).filter((_, oi) => oi !== optIndex) } : a
    )));
  };

  const cancelEdit = () => {
    if (isNewRow) {
      setAttributes(prev => prev.filter((_, i) => i !== editingIndex));
    } else {
      setAttributes(prev => prev.map((a, i) => (i === editingIndex ? editSnapshot : a)));
    }
    setEditingIndex(null);
    setEditSnapshot(null);
    setIsNewRow(false);
  };

  const doneEdit = () => {
    setEditingIndex(null);
    setEditSnapshot(null);
    setIsNewRow(false);
  };

  const deleteAttribute = (index) => {
    setAttributes(prev => prev.filter((_, i) => i !== index));
    setConfirmDeleteIndex(null);
    setEditingIndex(null);
    setEditSnapshot(null);
    setIsNewRow(false);
  };

  const openRaw = () => {
    setRawText(JSON.stringify(attributes, null, 2));
    setRawError('');
    setRawMode(true);
  };

  const applyRaw = () => {
    try {
      const parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
      setAttributes(parsed);
      setEditingIndex(null);
      setEditSnapshot(null);
      setIsNewRow(false);
      setRawError('');
      setRawMode(false);
    } catch (e) {
      setRawError('Invalid JSON — ' + e.message);
    }
  };

  return (
    <div className={t.wrapper}>
      <div className={t.header}>
        <div className={t.headerTitleWrap}>
          <div className={t.headerTitleRow}>
            <h1 className={t.headerTitle}>Format Manager</h1>
            <span className={t.countPill}>{attributes.length} attribute{attributes.length !== 1 ? 's' : ''}</span>
          </div>
          <p className={t.headerSubtitle} aria-hidden="true">&nbsp;</p>
        </div>
        <span className={t.headerSpacer} />
        <button type="button" className={t.rawToggleBtn} onClick={() => (rawMode ? setRawMode(false) : openRaw())}>
          {rawMode ? 'back to builder' : 'raw json'}
        </button>
      </div>

      <div className={dirty ? t.saveBarDirty : t.saveBar}>
        <span className={dirty ? t.saveBarTextDirty : t.saveBarText}>
          {dirty ? 'unsaved changes — applies to every section on this pattern' : 'no unsaved changes'}
        </span>
        <span className="flex-1" />
        <button type="button" className={t.btnReset} disabled={!dirty} onClick={resetAttributes}>reset</button>
        <button type="button" className={t.btnSave} disabled={!dirty || hasInvalidKey} onClick={saveAttributes}>save changes</button>
      </div>

      {rawMode ? (
        <div className={t.rawCard}>
          <label className={t.fieldLabel}>section attributes (json)</label>
          <textarea
            rows={14}
            className={t.rawTextarea}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
          />
          {!!rawError && <div className={t.rawError}>{rawError}</div>}
          <div className={t.formFooter}>
            <button type="button" className={t.cancelBtn} onClick={() => setRawMode(false)}>cancel</button>
            <button type="button" className={t.doneBtn} onClick={applyRaw}>apply</button>
          </div>
        </div>
      ) : attributes.length === 0 ? (
        <div className={t.empty}>
          <p className={t.emptyText}>
            No custom attributes. Define one and it appears on every section's editor.
          </p>
          <button type="button" className={t.addBtn} onClick={addAttribute}>
            <Icon icon="Plus" className={t.addBtnIcon} /> add attribute
          </button>
        </div>
      ) : (
        <>
          <div className={t.list}>
            {attributes.map((attr, i) => (
              <AttributeRow
                key={i}
                attr={attr}
                editing={editingIndex === i}
                locked={editingIndex !== null && editingIndex !== i}
                confirmingDelete={confirmDeleteIndex === i}
                onEdit={() => startEdit(i)}
                onDeleteRequest={() => setConfirmDeleteIndex(i)}
                onDeleteConfirm={() => deleteAttribute(i)}
                onDeleteCancel={() => setConfirmDeleteIndex(null)}
                onFieldChange={updateField}
                onOptionChange={updateOption}
                onOptionAdd={addOption}
                onOptionRemove={removeOption}
                onCancel={cancelEdit}
                onDone={doneEdit}
                Icon={Icon}
                Switch={Switch}
                t={t}
              />
            ))}
          </div>
          <button type="button" className={t.addBtn} disabled={editingIndex !== null} onClick={addAttribute}>
            <Icon icon="Plus" className={t.addBtnIcon} /> add attribute
          </button>
        </>
      )}
    </div>
  );
}

export default FormatManager;

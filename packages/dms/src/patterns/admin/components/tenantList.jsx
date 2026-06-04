import React from 'react'

function TenantView({ dataItems = [] }) {
  const data = dataItems[0] || {};
  return (
    <div>
      {(data?.tenants || []).map(t => (
        <div key={t.id}>{t.name} — {t.subdomain}</div>
      ))}
    </div>
  )
}

function TenantEdit({ value = [], onChange, onSubmit }) {
  // Phase 3: full tenant management UI
  return <div />
}

export default {
  EditComp: TenantEdit,
  ViewComp: TenantView
}

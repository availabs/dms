import React, { useState, useContext } from 'react'
import { useLocation } from 'react-router'
let Ctx = null
function Hello() { const [n] = useState(3); const { theme } = useContext(Ctx) || {}; const loc = useLocation();
  return <div className="p-6 text-lg">theme {theme?.name} path {loc.pathname} n {n}</div> }
export default { name: 'hello', version: '1.0.0', api: '^1.0', activation: 'opt-in',
  register(host) { Ctx = host.contexts.ThemeContext; host.registerPatternTypes({ hello: { Hello } }) } }